"""Rozdzielenie rozpływu gałęziowego od artefaktu biegu (karta K14, dług V12K-281).

CO TE TESTY PILNUJĄ. Zapisany artefakt biegu zwarciowego trzymał PEŁNY rozpływ
gałęziowy w jednej kolumnie JSON, więc każdy odczyt biegu deserializował iloczyn
źródło×gałąź wszystkich punktów zwarcia (zmierzone na sieci 50 stacji: 338 MiB w
jednym wierszu). Rozpływ leży teraz w osobnej tabeli, ale MUSI być tą samą treścią
co dotąd i musi być czytelny także ze starych baz — bez migracji danych.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID, uuid4

import pytest

sqlalchemy = pytest.importorskip("sqlalchemy")

from enm.canonical_analysis import (  # noqa: E402
    build_short_circuit_results,
    build_short_circuit_rozplyw,
    get_run,
    pobierz_rozplyw_biegu,
    pobierz_slad_rozplywu_biegu,
    reset_canonical_runs,
    run_short_circuit_now,
    wiersze_swiezego_biegu_bez_rozplywu,
)
from enm.models import EnergyNetworkModel  # noqa: E402
from enm.store import reset_enm_store, set_enm  # noqa: E402
from infrastructure.persistence.db import create_engine_from_url, init_db  # noqa: E402
from infrastructure.persistence.models import CanonicalRunBranchFlowORM  # noqa: E402
from infrastructure.persistence.repositories.canonical_run_repository import (  # noqa: E402
    KLUCZE_ROZPLYWU,
    canonical_run_repository_scope,
    get_canonical_run_session_factory,
)
from sqlalchemy import inspect, select, text  # noqa: E402

from tests.catalog_test_helpers import gpz_source_record  # noqa: E402


def _seed_enm(case_id: str) -> None:
    """GPZ na szynie głównej + falownik PV za kablem — rozpływ punktu jest niepusty."""
    set_enm(
        case_id,
        EnergyNetworkModel.model_validate(
            {
                "header": {
                    "name": "K14 rozplyw persystencja",
                    "enm_version": "1.0",
                    "defaults": {"frequency_hz": 50, "unit_system": "SI"},
                    "created_at": "2024-01-01T00:00:00Z",
                    "updated_at": "2024-01-01T00:00:00Z",
                    "revision": 1,
                    "hash_sha256": "",
                },
                "buses": [
                    {
                        "id": "00000000-0000-0000-0000-000000000501",
                        "ref_id": "bus-main",
                        "name": "Szyna glowna",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                    {
                        "id": "00000000-0000-0000-0000-000000000502",
                        "ref_id": "bus-oze",
                        "name": "Szyna OZE",
                        "tags": [],
                        "meta": {},
                        "voltage_kv": 15.0,
                        "phase_system": "3ph",
                    },
                ],
                "branches": [
                    {
                        "id": "00000000-0000-0000-0000-000000000503",
                        "ref_id": "branch-oze",
                        "name": "Kabel OZE",
                        "tags": [],
                        "meta": {},
                        "type": "cable",
                        "from_bus_ref": "bus-main",
                        "to_bus_ref": "bus-oze",
                        "status": "closed",
                        "catalog_ref": "KABEL_SN_TEST",
                        "parameter_source": "CATALOG",
                        "length_km": 0.5,
                        "r_ohm_per_km": 0.253,
                        "x_ohm_per_km": 0.073,
                        "b_siemens_per_km": 2.6e-07,
                        "rating": {"in_a": 270.0},
                    }
                ],
                "sources": [
                    {
                        "id": "00000000-0000-0000-0000-000000000504",
                        "tags": [],
                        "meta": {},
                        **gpz_source_record(
                            ref_id="src-grid",
                            name="Zasilanie GPZ",
                            bus_ref="bus-main",
                            voltage_kv=15.0,
                            sk3_mva=250.0,
                            rx_ratio=0.10,
                        ),
                    }
                ],
                "loads": [],
                "transformers": [],
                "generators": [
                    {
                        "id": "00000000-0000-0000-0000-000000000505",
                        "ref_id": "gen-pv",
                        "name": "Falownik PV",
                        "tags": [],
                        "meta": {},
                        "bus_ref": "bus-oze",
                        "p_mw": 1.0,
                        "q_mvar": 0.0,
                        "gen_type": "pv_inverter",
                        "connection_variant": "DEDICATED_MV_CONNECTION",
                    }
                ],
                "substations": [],
                "bays": [],
                "junctions": [],
                "corridors": [],
                "measurements": [],
                "protection_assignments": [],
                "branch_points": [],
            }
        ),
    )


@pytest.fixture(autouse=True)
def _czysty_stan():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _wiersze_rozplywu(run_id: UUID) -> dict[str, Any]:
    session_factory = get_canonical_run_session_factory()
    with session_factory() as session:
        rows = session.execute(
            select(
                CanonicalRunBranchFlowORM.fault_node_id,
                CanonicalRunBranchFlowORM.contributions_json,
            ).where(CanonicalRunBranchFlowORM.run_id == run_id)
        ).all()
    return dict(rows)


def _slady_rozplywu(run_id: UUID) -> dict[str, Any]:
    session_factory = get_canonical_run_session_factory()
    with session_factory() as session:
        rows = session.execute(
            select(
                CanonicalRunBranchFlowORM.fault_node_id,
                CanonicalRunBranchFlowORM.branch_flow_trace_json,
            ).where(CanonicalRunBranchFlowORM.run_id == run_id)
        ).all()
    return dict(rows)


def _kanonicznie(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _swiezy_bieg():
    # `_seed_enm` zasiewa model wprost pod SUROWYM `case_id` (bez bazy danych w
    # zasięgu tego modułu) — `klucz_twin` musi więc być TYM SAMYM napisem, żeby
    # solver czytał wpis, który faktycznie istnieje w magazynie (CV-1-W).
    case_id = str(uuid4())
    _seed_enm(case_id)
    return run_short_circuit_now(case_id=case_id, klucz_twin=case_id, project_id="projekt-k14")


def test_zapis_biegu_rozdziela_rozplyw_od_artefaktu() -> None:
    """Artefakt zapisany BEZ rozpływu inline; treść rozpływu w osobnej tabeli.

    Bieg policzony w pamięci niesie rozpływ inline (sekwencja solver → konsumenci
    in-process bez zmian). Zapis rozdziela: wiersz biegu dostaje sam znacznik
    dostępności, a wpisy trafiają do tabeli rozpływu — BAJTOWO te same.
    """
    bieg = _swiezy_bieg()
    rozplyw_w_pamieci = {
        item["fault_node_id"]: item["branch_contributions"]
        for item in bieg.raw_result["results"]
        if item.get("branch_contributions") is not None
    }
    assert rozplyw_w_pamieci, "sieć testowa musi dać niepusty rozpływ w co najmniej 1 punkcie"

    zapisany = get_run(bieg.id)
    assert zapisany is not None
    for item in zapisany.raw_result["results"]:
        assert "branch_contributions" not in item, "artefakt nie może nieść rozpływu inline"
        assert item["branch_contributions_available"] is True

    w_tabeli = _wiersze_rozplywu(bieg.id)
    assert set(w_tabeli) == set(rozplyw_w_pamieci)
    for fault_node_id, wpisy in rozplyw_w_pamieci.items():
        assert _kanonicznie(w_tabeli[fault_node_id]) == _kanonicznie(wpisy)


def test_pobierz_rozplyw_biegu_zwraca_to_samo_co_tor_w_pamieci() -> None:
    """Jedna prawda dostępu daje wpisy identyczne z biegiem trzymanym w pamięci."""
    bieg = _swiezy_bieg()
    zapisany = get_run(bieg.id)
    assert zapisany is not None

    for item in bieg.raw_result["results"]:
        fault_node_id = item["fault_node_id"]
        oczekiwane = item.get("branch_contributions")
        assert _kanonicznie(pobierz_rozplyw_biegu(bieg, fault_node_id)) == _kanonicznie(oczekiwane)
        assert _kanonicznie(pobierz_rozplyw_biegu(zapisany, fault_node_id)) == _kanonicznie(
            oczekiwane
        )

    # Determinizm odczytu: drugi odczyt tego samego punktu → ta sama treść.
    punkt = bieg.raw_result["results"][0]["fault_node_id"]
    assert pobierz_rozplyw_biegu(zapisany, punkt) == pobierz_rozplyw_biegu(zapisany, punkt)

    # Widok punktu na żądanie (kontrakt API) czyta tę samą treść po obu stronach zapisu.
    assert build_short_circuit_rozplyw(zapisany, punkt) == build_short_circuit_rozplyw(bieg, punkt)


def test_flaga_dostepnosci_przezywa_rozdzielenie_artefaktu() -> None:
    """Wiersz zbiorczy nadal mówi PRAWDĘ o dostępności rozpływu po stronie zapisu."""
    bieg = _swiezy_bieg()
    zapisany = get_run(bieg.id)
    assert zapisany is not None

    wiersze_pamiec = build_short_circuit_results(bieg)["rows"]
    wiersze_zapis = build_short_circuit_results(zapisany)["rows"]
    assert [w["branch_contributions_available"] for w in wiersze_zapis] == [
        w["branch_contributions_available"] for w in wiersze_pamiec
    ]
    assert any(w["branch_contributions_available"] for w in wiersze_zapis)
    # Kontrakt listy bez zmian: wiersz zbiorczy nie niesie rozpływu.
    assert all(w["branch_contributions"] is None for w in wiersze_zapis)


def test_zgodnosc_wsteczna_starego_zapisu_z_rozplywem_inline() -> None:
    """Baza sprzed rozdzielenia (rozpływ inline, brak tabeli) czytana BEZ migracji."""
    from datetime import UTC, datetime

    from infrastructure.persistence.models import CanonicalRunORM

    run_id = uuid4()
    wpisy = [
        {
            "source_id": "src-grid",
            "branch_id": "branch-oze",
            "from_node_id": "bus-main",
            "to_node_id": "bus-oze",
            "i_contrib_a": 1234.5,
            "direction": "from_to",
        }
    ]
    stary_artefakt = {
        "analysis_type": "short_circuit_3f",
        "short_circuit_type": "3F",
        "results": [
            {
                "fault_node_id": "bus-main",
                "short_circuit_type": "3F",
                "ikss_a": 9000.0,
                "branch_contributions": wpisy,
            }
        ],
        "graph": {
            "nodes": {"bus-main": {"name": "Szyna glowna"}, "bus-oze": {"name": "Szyna OZE"}},
            "branches": {"branch-oze": {"name": "Kabel OZE"}},
        },
    }

    # Zapis SUROWY, z pominięciem repozytorium: dokładnie tak wyglądał wiersz
    # zapisany przez kod sprzed karty K14.
    session_factory = get_canonical_run_session_factory()
    with session_factory() as session:
        session.add(
            CanonicalRunORM(
                id=run_id,
                case_id="case-stary",
                project_id="projekt-k14",
                analysis_type="short_circuit_sn",
                status="FINISHED",
                result_status="VALID",
                created_at=datetime.now(UTC),
                started_at=datetime.now(UTC),
                finished_at=datetime.now(UTC),
                snapshot_hash="hash-stary",
                input_hash="input-stary",
                snapshot_json={},
                validation_json={},
                readiness_json={},
                options_json={},
                error_message=None,
                raw_result_json=stary_artefakt,
                white_box_trace_json=[],
                power_flow_trace_json=None,
            )
        )
        session.commit()

    bieg = get_run(run_id)
    assert bieg is not None
    assert _wiersze_rozplywu(run_id) == {}, "stary zapis nie jest migrowany"
    assert pobierz_rozplyw_biegu(bieg, "bus-main") == wpisy
    assert build_short_circuit_results(bieg)["rows"][0]["branch_contributions_available"] is True
    rozplyw = build_short_circuit_rozplyw(bieg, "bus-main")["branch_contributions"]
    assert rozplyw is not None
    assert rozplyw[0]["branch_name"] == "Kabel OZE"
    assert rozplyw[0]["i_ka"] == pytest.approx(1.2345)


def test_ponowny_zapis_odczytanego_biegu_nie_gubi_rozplywu() -> None:
    """Bieg odczytany z bazy i zapisany ponownie NIE kasuje magazynu rozpływu.

    Artefakt odczytany z bazy niesie sam znacznik dostępności — gdyby zapis
    traktował to jak „brak rozpływu", zmiana statusu biegu po cichu kasowałaby
    dane. Regresja byłaby widoczna dopiero u użytkownika, jako pusta tabela
    rozpływu przy zielonych testach.
    """
    bieg = _swiezy_bieg()
    przed = _wiersze_rozplywu(bieg.id)
    assert przed

    zapisany = get_run(bieg.id)
    assert zapisany is not None
    zapisany.result_status = "STALE"
    with canonical_run_repository_scope() as repository:
        repository.save(zapisany)

    assert _wiersze_rozplywu(bieg.id) == przed
    ponownie = get_run(bieg.id)
    assert ponownie is not None
    assert ponownie.result_status == "STALE"
    punkt = ponownie.raw_result["results"][0]["fault_node_id"]
    assert pobierz_rozplyw_biegu(ponownie, punkt) == pobierz_rozplyw_biegu(bieg, punkt)


def test_wynik_bez_wkladow_zostaje_uczciwym_brakiem() -> None:
    """Solver policzony BEZ wkładów: brak w obu źródłach → None, nie pusta lista."""
    from datetime import UTC, datetime

    from enm.canonical_analysis import CanonicalRun

    run = CanonicalRun(
        id=uuid4(),
        case_id="case-bez-wkladow",
        project_id="projekt-k14",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=datetime.now(UTC),
        snapshot_hash="hash",
        input_hash="input",
        snapshot={},
        validation={},
        readiness={},
        raw_result={
            "analysis_type": "short_circuit_3f",
            "results": [
                {"fault_node_id": "bus-main", "ikss_a": 9000.0, "branch_contributions": None}
            ],
            "graph": {"nodes": {}, "branches": {}},
        },
    )
    with canonical_run_repository_scope() as repository:
        repository.create(run)

    zapisany = get_run(run.id)
    assert zapisany is not None
    assert _wiersze_rozplywu(run.id) == {}
    assert pobierz_rozplyw_biegu(zapisany, "bus-main") is None
    assert (
        build_short_circuit_results(zapisany)["rows"][0]["branch_contributions_available"] is False
    )
    assert build_short_circuit_rozplyw(zapisany, "bus-main")["branch_contributions"] is None
    # Nieznany punkt zwarcia → brak, nie wyjątek z magazynu rozpływu.
    assert pobierz_rozplyw_biegu(zapisany, "bus-nieznana") is None


def test_czyszczenie_biegow_usuwa_rozplyw() -> None:
    """`reset_canonical_runs` nie zostawia osieroconych wierszy rozpływu."""
    bieg = _swiezy_bieg()
    assert _wiersze_rozplywu(bieg.id)

    reset_canonical_runs()

    assert _wiersze_rozplywu(bieg.id) == {}
    assert get_run(bieg.id) is None


# ---------------------------------------------------------------------------
# KLASA, NIE INSTANCJA (2026-09-05): ładunek per gałąź punktu zwarcia to DWA klucze
# — wkłady `branch_contributions` (V12K-281/284, K14) i ich ślad WHITE BOX
# `branch_flow_trace` (TH-1). Mechanizmy „wytnij z wiersza / oddaj na żądanie"
# działają na całej klasie `KLUCZE_ROZPLYWU`; poniżej iloczyn cech: klucz klasy ×
# (zapis rozdzielony | świeże wiersze POST | widok punktu | jedna prawda dostępu |
# baza sprzed kolumny).
# ---------------------------------------------------------------------------


def test_klasa_rozplywu_ma_dwa_klucze() -> None:
    """Deklaracja klasy jest przypięta testem (zmiana zbioru = świadoma decyzja)."""
    assert KLUCZE_ROZPLYWU == ("branch_contributions", "branch_flow_trace")


def test_slad_solvera_towarzyszy_wkladom() -> None:
    """Predykaty parami: ślad podziału prądu istnieje TYLKO tam, gdzie są wkłady.

    Rozdzielenie artefaktu adresuje ślad przez wiersz z wkładami; gdyby solver
    emitował ślad bez wkładów, ślad zostałby inline (i klasa byłaby dziurawa).
    """
    bieg = _swiezy_bieg()
    wiersze_ze_sladem = [
        item for item in bieg.raw_result["results"] if item.get("branch_flow_trace") is not None
    ]
    assert wiersze_ze_sladem, "sieć testowa musi dać ślad podziału w co najmniej 1 punkcie"
    for item in wiersze_ze_sladem:
        assert item.get("branch_contributions") is not None


def test_zapis_biegu_rozdziela_cala_klase_rozplywu_od_artefaktu() -> None:
    """Zapisany artefakt nie niesie ŻADNEGO klucza klasy; ślad leży w tabeli BAJTOWO."""
    bieg = _swiezy_bieg()
    slady_w_pamieci = {
        item["fault_node_id"]: item["branch_flow_trace"]
        for item in bieg.raw_result["results"]
        if item.get("branch_flow_trace") is not None
    }
    assert slady_w_pamieci
    zapisany = get_run(bieg.id)
    assert zapisany is not None
    for item in zapisany.raw_result["results"]:
        for klucz in KLUCZE_ROZPLYWU:
            assert klucz not in item, f"artefakt nie może nieść {klucz} inline"
        assert item["branch_contributions_available"] is True
    w_tabeli = _slady_rozplywu(bieg.id)
    assert set(w_tabeli) == set(slady_w_pamieci)
    for fault_node_id, slad in slady_w_pamieci.items():
        assert _kanonicznie(w_tabeli[fault_node_id]) == _kanonicznie(slad)


def test_pobierz_slad_rozplywu_biegu_zwraca_to_samo_co_tor_w_pamieci() -> None:
    """Jedna prawda dostępu do śladu: pamięć i zapis dają identyczną treść."""
    bieg = _swiezy_bieg()
    zapisany = get_run(bieg.id)
    assert zapisany is not None
    for item in bieg.raw_result["results"]:
        fault_node_id = item["fault_node_id"]
        oczekiwany = item.get("branch_flow_trace")
        assert _kanonicznie(pobierz_slad_rozplywu_biegu(bieg, fault_node_id)) == _kanonicznie(
            oczekiwany
        )
        assert _kanonicznie(pobierz_slad_rozplywu_biegu(zapisany, fault_node_id)) == _kanonicznie(
            oczekiwany
        )
    punkt = bieg.raw_result["results"][0]["fault_node_id"]
    widok = build_short_circuit_rozplyw(zapisany, punkt)
    assert _kanonicznie(widok["branch_flow_trace"]) == _kanonicznie(
        bieg.raw_result["results"][0]["branch_flow_trace"]
    )
    assert build_short_circuit_rozplyw(zapisany, punkt) == build_short_circuit_rozplyw(bieg, punkt)
    assert pobierz_slad_rozplywu_biegu(zapisany, "nie-ma-takiego-punktu") is None


def test_swieze_wiersze_odpowiedzi_nie_niosa_zadnego_klucza_klasy() -> None:
    """Odpowiedź POST świeżego biegu: zero ładunku per gałąź, flaga dostępności zostaje."""
    bieg = _swiezy_bieg()
    wiersze = wiersze_swiezego_biegu_bez_rozplywu(bieg)
    assert wiersze
    for wiersz in wiersze:
        for klucz in KLUCZE_ROZPLYWU:
            assert klucz not in wiersz, f"świeży wiersz nie może nieść {klucz}"
        assert wiersz["branch_contributions_available"] is True
        # Ślad WHITE BOX samego punktu (nie podziału w gałęziach) ZOSTAJE — jawność.
        assert "white_box_trace" in wiersz


def test_zapis_sprzed_kolumny_sladu_daje_uczciwy_brak() -> None:
    """Wiersz tabeli rozpływu bez śladu (baza sprzed kolumny) → `None`, nie pusta lista."""
    bieg = _swiezy_bieg()
    punkt = bieg.raw_result["results"][0]["fault_node_id"]
    session_factory = get_canonical_run_session_factory()
    with session_factory() as session:
        wiersz = session.execute(
            select(CanonicalRunBranchFlowORM).where(
                CanonicalRunBranchFlowORM.run_id == bieg.id,
                CanonicalRunBranchFlowORM.fault_node_id == punkt,
            )
        ).scalar_one()
        wiersz.branch_flow_trace_json = None
        session.commit()
    zapisany = get_run(bieg.id)
    assert zapisany is not None
    assert pobierz_slad_rozplywu_biegu(zapisany, punkt) is None
    assert build_short_circuit_rozplyw(zapisany, punkt)["branch_flow_trace"] is None
    # Wkłady tego samego punktu są nietknięte — brak śladu nie kasuje rozpływu.
    assert pobierz_rozplyw_biegu(zapisany, punkt) is not None


def _kolumny(engine: Any, tabela: str) -> set[str]:
    return {kolumna["name"] for kolumna in inspect(engine).get_columns(tabela)}


def test_init_db_doklada_kolumne_addytywna_do_istniejacej_bazy(tmp_path: Any) -> None:
    """Baza z tabelą sprzed dodania kolumny: `init_db` dokłada kolumnę, dane zostają.

    `create_all` tworzy tylko brakujące TABELE — bez tego kroku pierwszy zapis
    rozpływu kończył się `OperationalError: no column named branch_flow_trace_json`
    na każdej istniejącej bazie deweloperskiej/e2e.
    """
    import sqlite3

    assert tuple(int(x) for x in sqlite3.sqlite_version.split(".")[:2]) >= (3, 35), (
        "test wymaga SQLite z ALTER TABLE DROP COLUMN (>= 3.35): " + sqlite3.sqlite_version
    )
    engine = create_engine_from_url(f"sqlite+pysqlite:///{tmp_path / 'stara.db'}")
    init_db(engine)
    with engine.begin() as polaczenie:
        polaczenie.execute(
            text("ALTER TABLE canonical_run_branch_flows DROP COLUMN branch_flow_trace_json")
        )
        # Wiersz tabeli rozpływu bez wiersza biegu: SQLite nie egzekwuje kluczy
        # obcych bez `PRAGMA foreign_keys=ON` (silnik go nie włącza), a test
        # sprawdza WYŁĄCZNIE dołożenie kolumny i przetrwanie danych w tej tabeli.
        polaczenie.execute(
            text(
                "INSERT INTO canonical_run_branch_flows (run_id, fault_node_id, "
                "contributions_json) VALUES ('00000000000000000000000000000abc', 'bus-1', '[]')"
            )
        )
    assert "branch_flow_trace_json" not in _kolumny(engine, "canonical_run_branch_flows")

    init_db(engine)
    assert "branch_flow_trace_json" in _kolumny(engine, "canonical_run_branch_flows")
    # Idempotencja: kolejne wywołanie niczego nie dokłada i nie psuje.
    init_db(engine)
    with engine.connect() as polaczenie:
        wiersze = polaczenie.execute(
            text("SELECT fault_node_id, branch_flow_trace_json FROM canonical_run_branch_flows")
        ).all()
    assert wiersze == [("bus-1", None)]
    engine.dispose()


def test_init_db_odmawia_kolumny_not_null_bez_domyslnej(tmp_path: Any) -> None:
    """Brakująca kolumna NOT NULL bez domyślnej to zmiana schematu — jawny błąd, nie cisza."""
    import sqlite3

    assert tuple(int(x) for x in sqlite3.sqlite_version.split(".")[:2]) >= (3, 35)
    engine = create_engine_from_url(f"sqlite+pysqlite:///{tmp_path / 'niepelna.db'}")
    init_db(engine)
    with engine.begin() as polaczenie:
        polaczenie.execute(
            text("ALTER TABLE canonical_run_branch_flows DROP COLUMN contributions_json")
        )
    with pytest.raises(RuntimeError, match="contributions_json"):
        init_db(engine)
    engine.dispose()
