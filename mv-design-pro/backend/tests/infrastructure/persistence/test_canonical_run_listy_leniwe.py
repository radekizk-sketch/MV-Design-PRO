"""Listy biegów nie ładują kolumn ciężkich (karta K14, dług V12K-281).

CO TE TESTY PILNUJĄ. `list_by_case` / `list_by_project` pobierały PEŁNE wiersze
biegów — artefakt wyniku, ślad White Box i snapshot modelu — choć widoki listowe
czytają wyłącznie pola lekkie. Zmierzone na sieci 50 stacji: listowanie 5 biegów
projektu trwało 18–27 s, prawie w całości na deserializacji artefaktów, których
w tym widoku nikt nie otwierał.

Miara jest wprost w SQL: zapytanie listy NIE MOŻE wymieniać kolumn ciężkich, a
dostęp do pola ciężkiego ma dociągnąć je JEDNYM dodatkowym zapytaniem — z treścią
identyczną jak przy odczycie pojedynczego biegu.
"""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest

sqlalchemy = pytest.importorskip("sqlalchemy")

from enm.canonical_analysis import (  # noqa: E402
    CanonicalRun,
    get_run,
    list_runs_for_case,
    list_runs_for_project,
    reset_canonical_runs,
)
from infrastructure.persistence.repositories.canonical_run_repository import (  # noqa: E402
    canonical_run_repository_scope,
    get_canonical_run_session_factory,
)
from sqlalchemy import event  # noqa: E402

_KOLUMNY_CIEZKIE_SQL = (
    "raw_result_json",
    "white_box_trace_json",
    "snapshot_json",
    "power_flow_trace_json",
)

CASE_ID = "case-k14-listy"
PROJECT_ID = "projekt-k14-listy"


@contextmanager
def _zapisane_zapytania() -> Iterator[list[str]]:
    """Nagrywa SQL wykonany na bazie biegów (pomiar zamiast wrażenia)."""
    engine = get_canonical_run_session_factory().kw["bind"]
    zapytania: list[str] = []

    def _zapisz(
        conn: Any, cursor: Any, statement: str, parameters: Any, context: Any, executemany: bool
    ) -> None:
        zapytania.append(statement)

    event.listen(engine, "before_cursor_execute", _zapisz)
    try:
        yield zapytania
    finally:
        event.remove(engine, "before_cursor_execute", _zapisz)


def _zapytania_o_biegi(zapytania: list[str]) -> list[str]:
    return [sql for sql in zapytania if "canonical_runs" in sql]


def _bieg_z_ciezkim_artefaktem(numer: int) -> CanonicalRun:
    run = CanonicalRun(
        id=uuid4(),
        case_id=CASE_ID,
        project_id=PROJECT_ID,
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=datetime.now(UTC),
        snapshot_hash=f"hash-{numer}",
        input_hash=f"input-{numer}",
        snapshot={"header": {"revision": numer}, "buses": [{"ref_id": f"bus-{numer}"}]},
        validation={"status": "PASS"},
        readiness={"blockers": []},
        options={"fault_type": "3F"},
        finished_at=datetime.now(UTC),
        raw_result={
            "analysis_type": "short_circuit_3f",
            "short_circuit_type": "3F",
            "results": [
                {
                    "fault_node_id": f"bus-{numer}",
                    "ikss_a": 1000.0 + numer,
                    "branch_contributions": [
                        {
                            "source_id": "src-grid",
                            "branch_id": f"branch-{indeks}",
                            "from_node_id": f"bus-{numer}",
                            "to_node_id": f"bus-{indeks}",
                            "i_contrib_a": float(indeks),
                            "direction": "from_to",
                        }
                        for indeks in range(25)
                    ],
                }
            ],
            "graph": {"nodes": {}, "branches": {}},
        },
        white_box_trace=[{"step": indeks, "title": f"Krok {indeks}"} for indeks in range(25)],
    )
    with canonical_run_repository_scope() as repository:
        repository.create(run)
    return run


@pytest.fixture()
def biegi() -> Iterator[list[CanonicalRun]]:
    reset_canonical_runs()
    utworzone = [_bieg_z_ciezkim_artefaktem(numer) for numer in range(1, 4)]
    yield utworzone
    reset_canonical_runs()


def test_lista_biegow_projektu_nie_pobiera_kolumn_ciezkich(biegi: list[CanonicalRun]) -> None:
    with _zapisane_zapytania() as zapytania:
        lista = list_runs_for_project(PROJECT_ID)

    assert len(lista) == len(biegi)
    o_biegach = _zapytania_o_biegi(zapytania)
    assert o_biegach, "lista musi w ogóle odpytać tabelę biegów"
    for sql in o_biegach:
        for kolumna in _KOLUMNY_CIEZKIE_SQL:
            assert kolumna not in sql, f"lista pobiera kolumnę ciężką {kolumna}: {sql}"


def test_lista_biegow_przypadku_nie_pobiera_kolumn_ciezkich(biegi: list[CanonicalRun]) -> None:
    with _zapisane_zapytania() as zapytania:
        lista = list_runs_for_case(CASE_ID)

    assert len(lista) == len(biegi)
    for sql in _zapytania_o_biegi(zapytania):
        for kolumna in _KOLUMNY_CIEZKIE_SQL:
            assert kolumna not in sql, f"lista pobiera kolumnę ciężką {kolumna}: {sql}"


def test_pole_ciezkie_doladowuje_sie_jednym_zapytaniem(biegi: list[CanonicalRun]) -> None:
    bieg_z_listy = next(run for run in list_runs_for_project(PROJECT_ID) if run.id == biegi[0].id)

    with _zapisane_zapytania() as zapytania:
        artefakt = bieg_z_listy.raw_result
    doladowania = [sql for sql in _zapytania_o_biegi(zapytania) if "raw_result_json" in sql]
    assert len(doladowania) == 1, zapytania
    assert artefakt is not None

    # Kolejne dostępy (także do innych pól ciężkich) są darmowe: jedno zapytanie
    # dociąga komplet kolumn ciężkich.
    with _zapisane_zapytania() as zapytania_2:
        _ = bieg_z_listy.raw_result
        _ = bieg_z_listy.white_box_trace
        _ = bieg_z_listy.snapshot
        _ = bieg_z_listy.power_flow_trace
    assert _zapytania_o_biegi(zapytania_2) == []


def test_bieg_z_listy_ma_te_same_wartosci_co_odczyt_pojedynczy(biegi: list[CanonicalRun]) -> None:
    """Kontrakt publiczny bez zmian: te same pola, te same wartości."""
    for oczekiwany in biegi:
        z_listy = next(run for run in list_runs_for_project(PROJECT_ID) if run.id == oczekiwany.id)
        pojedynczy = get_run(oczekiwany.id)
        assert pojedynczy is not None
        for pole in (
            "id",
            "case_id",
            "project_id",
            "analysis_type",
            "status",
            "result_status",
            "created_at",
            "started_at",
            "finished_at",
            "snapshot_hash",
            "input_hash",
            "validation",
            "readiness",
            "options",
            "error_message",
            "snapshot",
            "raw_result",
            "white_box_trace",
            "power_flow_trace",
        ):
            assert getattr(z_listy, pole) == getattr(pojedynczy, pole), pole


def test_rozplyw_dostepny_takze_dla_biegu_z_listy(biegi: list[CanonicalRun]) -> None:
    """Rozpływ z osobnej tabeli czyta się tak samo z biegu wziętego z listy."""
    from enm.canonical_analysis import pobierz_rozplyw_biegu

    z_listy = next(run for run in list_runs_for_project(PROJECT_ID) if run.id == biegi[0].id)
    pojedynczy = get_run(biegi[0].id)
    assert pojedynczy is not None

    punkt = biegi[0].raw_result["results"][0]["fault_node_id"]
    assert pobierz_rozplyw_biegu(z_listy, punkt) == pobierz_rozplyw_biegu(pojedynczy, punkt)
    assert (
        pobierz_rozplyw_biegu(z_listy, punkt)
        == biegi[0].raw_result["results"][0]["branch_contributions"]
    )


def test_bieg_skasowany_po_listowaniu_daje_uczciwy_brak(biegi: list[CanonicalRun]) -> None:
    """Bieg usunięty między listowaniem a dostępem: brak artefaktu, nie zmyślona treść."""
    z_listy = next(run for run in list_runs_for_project(PROJECT_ID) if run.id == biegi[0].id)
    reset_canonical_runs()

    assert z_listy.raw_result is None
    assert z_listy.snapshot == {}
    assert z_listy.white_box_trace == []
    assert z_listy.power_flow_trace is None
