"""Parytet tabeli BIL (IEC 60071-1) między katalogiem API i solverem FROZEN.

Tabela `U_m -> (BIL, wytrzymałość 50 Hz)` jest zapisana DWA RAZY: raz jako
stały katalog `GET /api/catalog/v126/insulation-levels`
(`api/v126_academic.py::get_v126_catalog`, konsument: `ui2/wyniki/akademickie`
sekcja „Dane odniesienia"), raz WEWNĄTRZ solvera FROZEN
(`_insulation`, `network_model/solvers/v126_academic.py:1653-1658`, B-01 —
NIETKNIĘTY, solver nie eksportuje tabeli, więc katalog nie może po prostu jej
zaimportować). Karta W3-E: skoro dwóch źródeł nie da się scalić bez ruszania
solvera, JEDNA prawda przez TEST PARYTETU — nie przez deklarację w komentarzu
(CLAUDE.md, reguła KLASA §4: „deklaracja bez testu = fałszywa pewność").

Test uruchamia `_insulation` przez PUBLICZNE wejście solvera
(`V126AcademicSolver().run(INSULATION_COORDINATION, …)` — nie prywatną metodę
wprost) dla U_m ∈ {12; 17,5; 24; 36} kV (cztery wiersze katalogu) ORAZ dla
40 kV (poza typoszeregiem katalogu — solver spada na wartość domyślną
`(170,0; 70,0)`, która POKRYWA SIĘ z wierszem 36 kV; test dowodzi tego wprost,
zamiast zakładać). Równość DOKŁADNA (nie `pytest.approx`) — obie strony to
literały, nie wynik obliczeń zmiennoprzecinkowych.
"""

from __future__ import annotations

import pytest
from api.main import app
from fastapi.testclient import TestClient
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import V126AcademicInput, V126AnalysisType, V126InsulationInput

_UM_KATALOGU = (12.0, 17.5, 24.0, 36.0)


def _katalog_insulation_levels() -> dict[float, dict[str, float]]:
    with TestClient(app) as client:
        odpowiedz = client.get("/api/catalog/v126/insulation-levels")
    assert odpowiedz.status_code == 200, odpowiedz.text
    items = odpowiedz.json()["items"]
    return {float(wiersz["u_m_kv"]): wiersz for wiersz in items}


def _wiersze_solvera(um_wartosci: tuple[float, ...]) -> dict[float, dict[str, float]]:
    model = V126AcademicInput(
        buses=[],
        insulation=[
            V126InsulationInput(location_bus_ref=f"B{indeks}", u_m_kv=um)
            for indeks, um in enumerate(um_wartosci)
        ],
    )
    wynik = V126AcademicSolver().run(V126AnalysisType.INSULATION_COORDINATION, model)["result"]
    return {float(wiersz["u_m_kv"]): wiersz for wiersz in wynik["arresters"]}


def test_katalog_ma_dokladnie_typoszereg_um_spodziewany_przez_test() -> None:
    """Kontrola dodatnia: jeśli katalog kiedyś zmieni typoszereg, ten test
    ma się zepsuć GŁOŚNO, zanim ciche rozjechanie zbiorów sfałszuje pętlę
    porównania niżej (zbiór pusty przeszedłby `for` bez żadnej asercji)."""
    katalog = _katalog_insulation_levels()
    assert set(katalog) == set(_UM_KATALOGU)


@pytest.mark.parametrize("um_kv", _UM_KATALOGU)
def test_bil_solvera_rowny_bil_katalogu(um_kv: float) -> None:
    katalog = _katalog_insulation_levels()
    solver = _wiersze_solvera(_UM_KATALOGU)
    wiersz_katalogu = katalog[um_kv]
    wiersz_solvera = solver[um_kv]
    assert wiersz_solvera["bil_protected_kv"] == wiersz_katalogu["bil_kv"], (
        f"U_m={um_kv} kV: BIL solvera {wiersz_solvera['bil_protected_kv']} != "
        f"katalog {wiersz_katalogu['bil_kv']}"
    )
    assert wiersz_solvera["short_duration_50hz_kv"] == wiersz_katalogu["short_duration_50hz_kv"], (
        f"U_m={um_kv} kV: wytrzymałość 50 Hz solvera "
        f"{wiersz_solvera['short_duration_50hz_kv']} != katalog "
        f"{wiersz_katalogu['short_duration_50hz_kv']}"
    )


def test_um_poza_typoszeregiem_spada_na_wartosc_domyslna_rowna_36kv() -> None:
    """U_m = 40 kV NIE JEST w typoszeregu katalogu (12/17,5/24/36) — solver
    (`next(..., default=(170.0, 70.0))`) zwraca wartość domyślną, która
    LICZBOWO pokrywa się z wierszem 36 kV. Test dowodzi tego pokrycia wprost,
    zamiast zakładać je milcząco — gdyby ktoś kiedyś dodał piąty wiersz
    katalogu (np. 42 kV), ta asercja ma się zepsuć, nie przemilczeć rozjazd."""
    katalog = _katalog_insulation_levels()
    solver_40kv = _wiersze_solvera((40.0,))[40.0]
    wiersz_36kv = katalog[36.0]
    assert solver_40kv["bil_protected_kv"] == wiersz_36kv["bil_kv"] == 170.0
    assert solver_40kv["short_duration_50hz_kv"] == wiersz_36kv["short_duration_50hz_kv"] == 70.0
