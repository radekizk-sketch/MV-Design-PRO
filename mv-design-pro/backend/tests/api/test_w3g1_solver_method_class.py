"""Karta W3-G1 (2026-09-10) — metoda rozplywu NR/GS/FD jako jawna opcja biegu.

Iloczyn cech wymagany kartą: {NR, GS, FD} x {bieg zwykly, wariant, seria}.

- Bieg zwykly: `create_run(analysis_type="PF", options={"solver_method": ...})`
  + `execute_run` (tor kanoniczny `enm/canonical_analysis.py`, DOKLADNIE ten,
  ktorym idzie `POST /api/execution/study-cases/{id}/runs` po dodaniu
  selektora metody w `ui2/spaces/obliczenia/UruchomObliczenie.tsx`) — metoda
  musi wrocic w `raw_result["solver_method"]` I w `power_flow_trace["solver_method"]`
  (oba czytane przez FE: koperta wyniku i slad zbieznosci).
- Wariant: `bieg_wariantu(bazowy, migawka, analysis_type="PF")` z `options=None`
  dziedziczy `bazowy.options` (`enm/canonical_analysis.py::bieg_wariantu`) —
  dowod END-TO-END przez realna zdolnosc `kontyngencje_n1` (GET
  /api/insights/n-1-contingency), ktorej `slad.bieg.metoda`
  (`application/analyses/kontyngencje_n1.py::_dane_biegu`) czyta
  `raw.get("solver_method")` wariantu.
- Seria: `run_batches` (`application/batch_execution_service.py`) jest
  STRUKTURALNIE wylacznie zwarciowa (`_RODZAJ_ANALIZY_KANONICZNEJ =
  "short_circuit_sn"`, `FaultScenario` jako jedyny ksztalt pozycji) — metoda
  NR/GS/FD (rozplyw) nie ma tu zastosowania; test pina ten fakt zamiast
  zostawiac go WYLACZNIE w prozie meldunku (mapa §4 pkt 4: „Deklaracja bez
  testu = falszywa pewnosc").
"""

from __future__ import annotations

import pytest
from application.batch_execution_service import _RODZAJ_ANALIZY_KANONICZNEJ
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm

N1 = "/api/insights/n-1-contingency"


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _pf_run(case_id: str, solver_method: str | None):
    set_enm(case_id, build_golden_enm())
    options = {"solver_method": solver_method} if solver_method is not None else {}
    return execute_run(
        create_run(case_id=case_id, klucz_twin=case_id, analysis_type="PF", options=options).id
    )


# ---------------------------------------------------------------------------
# Bieg zwykly x {domyslna (brak opcji) -> NR, NR jawnie, GS, FD}
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("wejscie", "oczekiwana"),
    [
        (None, "newton-raphson"),
        ("newton-raphson", "newton-raphson"),
        ("gauss-seidel", "gauss-seidel"),
        ("fast-decoupled", "fast-decoupled"),
    ],
)
def test_bieg_zwykly_honoruje_metode(wejscie: str | None, oczekiwana: str) -> None:
    """Metoda z opcji biegu wraca WPROST w kopercie wyniku i sladzie — dla
    KAZDEJ z trzech metod, niezaleznie od tego, czy akurat zbiega na tej
    sieci (siec golden_enm jest wyrocznia NR — pomiar 2026-09-10: GS/FD NIE
    zbiegaja na niej nawet przy max_iter=200/100, zgodnie z udokumentowana
    charakterystyka FD „mniej stabilny dla SN z duzym R/X"; zbieznosc GS/FD
    na prostszych sieciach dowodzi `test_load_flow_canonical_solver_modes.py`
    — TA klasa testow dowodzi PROPAGACJI TOZSAMOSCI metody, nie numeryki
    solvera, ktora jest poza granicami karty, B-01)."""
    run = _pf_run(f"c-w3g1-zwykly-{wejscie or 'domyslna'}", wejscie)

    assert run.status == "FINISHED"
    assert run.raw_result is not None
    assert run.raw_result["solver_method"] == oczekiwana
    assert isinstance(run.raw_result["result_v1"]["converged"], bool)
    assert run.power_flow_trace is not None
    assert run.power_flow_trace["solver_method"] == oczekiwana
    if oczekiwana == "newton-raphson":
        # NR (domyslna i jawna) MUSI zbiegac na golden_enm — to wyrocznia
        # referencyjna wielu innych testow (m.in. `test_kontyngencje_n1_api.py`);
        # brak zbieznosci NR na tej sieci byloby regresja poza zakresem tej karty.
        assert run.raw_result["result_v1"]["converged"] is True


def test_bieg_zwykly_metoda_nr_domyslna_daje_ten_sam_wynik_co_jawna_nr() -> None:
    """Determinizm (karta §Granice): metoda NR domyslna = ten sam wynik bit w
    bit co NR jawnie zadana — brak opcji nie jest ukryta, inna sciezka."""
    domyslny = _pf_run("c-w3g1-parytet-domyslna", None)
    jawny = _pf_run("c-w3g1-parytet-jawna", "newton-raphson")

    wynik_domyslny = domyslny.raw_result["result_v1"]
    wynik_jawny = jawny.raw_result["result_v1"]
    assert wynik_domyslny["converged"] == wynik_jawny["converged"]
    assert wynik_domyslny["iterations_count"] == wynik_jawny["iterations_count"]
    assert wynik_domyslny["bus_results"] == wynik_jawny["bus_results"]


# ---------------------------------------------------------------------------
# Wariant x {GS, FD} — dziedziczenie metody bazy przez `bieg_wariantu`,
# dowiedzione realna zdolnoscia kontyngencje_n1 (GET /api/insights/n-1-contingency)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("metoda", ["gauss-seidel", "fast-decoupled"])
def test_wariant_n1_dziedziczy_metode_biegu_bazowego(app_client, metoda: str) -> None:
    run = _pf_run(f"c-w3g1-n1-{metoda}", metoda)

    resp = app_client.get(N1, params={"run_id": str(run.id)})

    assert resp.status_code == 200
    data = resp.json()
    kontyngencje = data["kontyngencje"]
    assert len(kontyngencje) > 0
    metody_wariantow = {k["slad"]["bieg"]["metoda"] for k in kontyngencje}
    # KAZDY wariant N-1 (kazdy element wylaczony po kolei) dziedziczy TA SAMA
    # metode biegu bazowego — jeden zbior, jedna wartosc (predykaty parami:
    # zrodlo metody wariantu = `bazowy.options`, nie domysl solvera).
    assert metody_wariantow == {metoda}


def test_wariant_n1_bez_jawnej_metody_dziedziczy_domyslna_nr(app_client) -> None:
    run = _pf_run("c-w3g1-n1-domyslna", None)

    resp = app_client.get(N1, params={"run_id": str(run.id)})

    assert resp.status_code == 200
    metody_wariantow = {k["slad"]["bieg"]["metoda"] for k in resp.json()["kontyngencje"]}
    assert metody_wariantow == {"newton-raphson"}


# ---------------------------------------------------------------------------
# Seria (`run_batches`) — zamkniete: wylacznie zwarciowa, NR/GS/FD nie dotyczy
# ---------------------------------------------------------------------------


def test_seria_run_batches_jest_wylacznie_zwarciowa() -> None:
    """`application/batch_execution_service.py` buduje KAZDA pozycje serii z
    `FaultScenario` (zwarciowy ksztalt danych — fault_type/c_factor, bez
    solver_method) i wykonuje ja jako `analysis_type="short_circuit_sn"`
    (`_RODZAJ_ANALIZY_KANONICZNEJ`). Metoda rozplywu (NR/GS/FD) jest pojeciem
    WYLACZNIE rozplywu mocy (PF) — seria biegow nie ma tu zastosowania
    strukturalnie, nie przez przeoczenie. Test pina STALA, zeby przyszla zmiana
    ksztaltu serii na rozplyw byla SWIADOMA decyzja (czerwony test), nie cicha
    erozja tego zamkniecia."""
    assert _RODZAJ_ANALIZY_KANONICZNEJ == "short_circuit_sn"
