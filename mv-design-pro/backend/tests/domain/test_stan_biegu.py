"""Stan biegu kanonicznego jako typ zamknięty — przypięcie predykatów parami.

`domain.execution.StanBiegu` otypowuje pola `status` list biegów, proweniencji porównań
i pozycji serii (karta AB-1a Pakiet E2, plan AB §8 F10). Typ jest TRZECIM zapisem tego
samego słownika obok `enm.canonical_analysis.STATUS_WYKONAWCZY` (render HTTP) i
`domain.run_batch.RunBatchStatus` (cykl życia serii = stan biegu + PARTIAL). Trzy zapisy
bez przypięcia to „dziś się zgadzają" — ten plik zamienia to w niezmiennik: dodanie stanu
w jednym miejscu bez pozostałych czerwieni tu, a nie w kontrakcie HTTP.
"""

from __future__ import annotations

from typing import get_args

import pytest
from analysis.comparison_diffs.diffs import RunProvenance
from domain.execution import RunStatus, StanBiegu, stan_biegu
from domain.run_batch import (
    ITEM_STATUS_CREATED,
    ITEM_STATUS_FAILED,
    ITEM_STATUS_FINISHED,
    ITEM_STATUS_RUNNING,
    ITEM_STATUSES_TERMINALNE,
    RunBatchItem,
    RunBatchStatus,
)
from enm.canonical_analysis import STATUS_WYKONAWCZY

STANY = get_args(StanBiegu)

#: Pozycja serii w postaci zapisanej (`RunBatchItem.to_dict`) — bez pola `status`.
_POZYCJA: dict[str, object] = {
    "position": 0,
    "scenario_id": "00000000-0000-0000-0000-000000000001",
    "analysis_type": "SC_3F",
    "options_hash": "0" * 64,
    "canonical_run_id": None,
    "error_message": None,
}


def test_stan_biegu_to_dokladnie_klucze_renderu_wykonawczego() -> None:
    """Każdy stan domenowy ma render HTTP i żaden render nie wisi bez stanu (para)."""
    assert set(STANY) == set(STATUS_WYKONAWCZY)
    assert len(STANY) == len(set(STANY))


def test_render_wykonawczy_pokrywa_dokladnie_run_status() -> None:
    """Obraz renderu to dokładnie `RunStatus` kontraktu HTTP wykonania — bez wartości sierot."""
    assert set(STATUS_WYKONAWCZY.values()) == {s.value for s in RunStatus}


def test_status_serii_to_stan_biegu_plus_czesciowy() -> None:
    """Seria rozszerza słownik biegu wyłącznie o PARTIAL — żadnego równoległego słownika."""
    assert {s.value for s in RunBatchStatus} - set(STANY) == {"PARTIAL"}
    assert set(STANY) <= {s.value for s in RunBatchStatus}


def test_stale_pozycji_serii_naleza_do_stanu_biegu() -> None:
    stale = {ITEM_STATUS_CREATED, ITEM_STATUS_RUNNING, ITEM_STATUS_FINISHED, ITEM_STATUS_FAILED}
    assert stale == set(STANY)
    assert set(ITEM_STATUSES_TERMINALNE) == {"FINISHED", "FAILED"}
    assert set(ITEM_STATUSES_TERMINALNE) <= set(STANY)


@pytest.mark.parametrize("stan", STANY)
def test_stan_biegu_przyjmuje_kazdy_stan_slownika(stan: str) -> None:
    assert stan_biegu(stan) == stan


@pytest.mark.parametrize(
    "wartosc",
    [
        # Render HTTP to nie stan domenowy (tests/enm/test_przejecie_biegu_atomowe.py).
        "PENDING",
        "DONE",
        # Wielkość liter jest częścią kontraktu — brak cichej normalizacji.
        "finished",
        "",
        " FINISHED",
    ],
)
def test_stan_biegu_odrzuca_wartosc_spoza_slownika(wartosc: str) -> None:
    with pytest.raises(ValueError, match="Nieznany stan biegu"):
        stan_biegu(wartosc)


def test_pozycja_serii_z_danych_odrzuca_nieznany_stan() -> None:
    """Odczyt pozycji z bazy/archiwum nie przepuszcza dowolnego tekstu do kontraktu HTTP."""
    dane = {**_POZYCJA, "status": "PENDING"}
    with pytest.raises(ValueError, match="Nieznany stan biegu"):
        RunBatchItem.from_dict(dane)


@pytest.mark.parametrize("stan", STANY)
def test_pozycja_serii_z_danych_zachowuje_stan(stan: str) -> None:
    dane = {**_POZYCJA, "status": stan}
    pozycja = RunBatchItem.from_dict(dane)
    assert pozycja.status == stan
    assert RunBatchItem.from_dict(pozycja.to_dict()) == pozycja


def test_pozycja_serii_bez_stanu_startuje_jako_utworzona() -> None:
    assert RunBatchItem.from_dict(dict(_POZYCJA)).status == ITEM_STATUS_CREATED


#: Proweniencja biegu w porównaniu w postaci zapisanej (`RunProvenance.to_dict`) — bez `status`.
_PROWENIENCJA: dict[str, object] = {
    "run_id": "00000000-0000-0000-0000-000000000002",
    "analysis_type": "PF",
    "snapshot_hash": "a" * 64,
    "input_hash": "b" * 64,
    "finished_at": None,
    "envelope": None,
}


@pytest.mark.parametrize("stan", STANY)
def test_proweniencja_z_danych_zachowuje_stan(stan: str) -> None:
    """Oba wejścia `RunProvenance` (z biegu i z danych zapisanych) zawężają TYM SAMYM
    predykatem `stan_biegu` — odczyt zapisanej proweniencji odtwarza ją bez zmian."""
    proweniencja = RunProvenance.from_dict({**_PROWENIENCJA, "status": stan})
    assert proweniencja.status == stan
    assert RunProvenance.from_dict(proweniencja.to_dict()) == proweniencja


def test_proweniencja_z_danych_odrzuca_nieznany_stan() -> None:
    with pytest.raises(ValueError, match="Nieznany stan biegu"):
        RunProvenance.from_dict({**_PROWENIENCJA, "status": "DONE"})
