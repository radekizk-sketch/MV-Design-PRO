"""Poziomy izolacji IEC 60071-1 — jedno źródło dla solvera i katalogu API.

Dawniej tabela `U_m -> (BIL, wytrzymałość 50 Hz)` była zapisana DWA RAZY (literały katalogu
`GET /api/catalog/v126/insulation-levels` i literały wewnątrz `_insulation`) z testem
parytetu, a U_m powyżej 36 kV dostawało po cichu wiersz 36 kV (sieć 110 kV: BIL 170 kV
zamiast 550 kV). Karta UX-04/POLE-ZU-SKLADOWA-ZEROWA: solver eksportuje tabelę
(`POZIOMY_IZOLACJI_IEC60071`), katalog API ją czyta, a U_m powyżej tabeli to brak podstawy
poziomu izolacji nazwany w wierszu.

ILOCZYN CECH: U_m {dokładnie wiersz tabeli, między wierszami, powyżej tabeli} × źródło
{katalog API, wiersz solvera}.
"""

from __future__ import annotations

import pytest
from api.main import app
from application.analyses.v126_oceny import kompletnosc_wyniku, oceny_wyniku_v126
from fastapi.testclient import TestClient
from network_model.solvers.v126_academic import POZIOMY_IZOLACJI_IEC60071, V126AcademicSolver
from solver_input.v126_contracts import V126AcademicInput, V126AnalysisType, V126InsulationInput


def _katalog_insulation_levels() -> list[dict[str, float]]:
    with TestClient(app) as client:
        odpowiedz = client.get("/api/catalog/v126/insulation-levels")
    assert odpowiedz.status_code == 200, odpowiedz.text
    return odpowiedz.json()["items"]


def _wiersz_solvera(um_kv: float) -> dict[str, object]:
    model = V126AcademicInput(
        buses=[],
        insulation=[
            V126InsulationInput(location_bus_ref="B1", u_m_kv=um_kv, network_neutral="rezystor")
        ],
    )
    wynik = V126AcademicSolver().run(V126AnalysisType.INSULATION_COORDINATION, model)["result"]
    (wiersz,) = wynik["arresters"]
    return wiersz


def _ocena_marginesu(um_kv: float) -> tuple[dict[str, object], str | None]:
    """Rekord kryterium marginesu ochrony izolacji i kompletność dowodu wyniku — ocena
    z granicy wyniku (`v126_oceny`), nie status wiersza solvera."""
    model = V126AcademicInput(
        buses=[],
        insulation=[
            V126InsulationInput(location_bus_ref="B1", u_m_kv=um_kv, network_neutral="rezystor")
        ],
    )
    wynik = V126AcademicSolver().run(V126AnalysisType.INSULATION_COORDINATION, model)["result"]
    oceny = oceny_wyniku_v126(
        "insulation_coordination", wynik, wersja_silnika=None, odcisk=None, nazwy={}
    )
    assert oceny is not None
    (wymaganie,) = oceny
    skladowe = {o["kryterium_id"]: o for o in wymaganie["oceny_skladowe"]}
    return skladowe["v126.izolacja.margines_bil.B1"], kompletnosc_wyniku(wynik, oceny)


def test_katalog_api_to_tabela_solvera() -> None:
    assert _katalog_insulation_levels() == [
        {"u_m_kv": um, "bil_kv": bil, "short_duration_50hz_kv": w}
        for um, bil, w in POZIOMY_IZOLACJI_IEC60071
    ]


def test_tabela_rosnaca_i_z_wartosciami_iec60071_1() -> None:
    """Wiersze IEC 60071-1:2019 tab. 2 (zakres I) przypięte wprost — zmiana poziomu jest
    decyzją normową, nie refaktorem."""
    assert POZIOMY_IZOLACJI_IEC60071 == (
        (3.6, 40.0, 10.0),
        (7.2, 60.0, 20.0),
        (12.0, 75.0, 28.0),
        (17.5, 95.0, 38.0),
        (24.0, 125.0, 50.0),
        (36.0, 170.0, 70.0),
        (52.0, 250.0, 95.0),
        (72.5, 325.0, 140.0),
        (123.0, 550.0, 230.0),
    )
    u_m = [w[0] for w in POZIOMY_IZOLACJI_IEC60071]
    assert u_m == sorted(u_m)


@pytest.mark.parametrize(
    ("um_kv", "bil", "w50"),
    [
        (12.0, 75.0, 28.0),
        (17.5, 95.0, 38.0),
        (24.0, 125.0, 50.0),
        (7.2, 60.0, 20.0),
        # Między wierszami — najbliższy WYŻSZY znormalizowany U_m (zachowawczo dla aparatów).
        (15.0, 95.0, 38.0),
        (40.0, 250.0, 95.0),
        (123.0, 550.0, 230.0),
    ],
)
def test_wiersz_solvera_z_tabeli(um_kv: float, bil: float, w50: float) -> None:
    wiersz = _wiersz_solvera(um_kv)
    assert wiersz["bil_protected_kv"] == bil
    assert wiersz["short_duration_50hz_kv"] == w50
    ocena, _ = _ocena_marginesu(um_kv)
    assert ocena["status_maszynowy"] in ("SPELNIA", "NIE_SPELNIA")
    assert ocena["wynik"]["wartosc"] == {"wartosc": wiersz["bil_margin_percent"], "jednostka": "%"}


@pytest.mark.parametrize("um_kv", [145.0, 245.0])
def test_um_powyzej_tabeli_to_brak_podstawy_nazwany(um_kv: float) -> None:
    wiersz = _wiersz_solvera(um_kv)
    assert wiersz["bil_protected_kv"] is None
    assert wiersz["bil_margin_percent"] is None
    assert "powyżej tabeli poziomów izolacji" in str(wiersz["message_pl"])
    # Brak poziomu izolacji z tabeli ≠ spełnia: kryterium marginesu nieocenione z przyczyną.
    ocena, kompletnosc = _ocena_marginesu(um_kv)
    assert ocena["status_maszynowy"] == "NIE_OCENIONO"
    assert "powyżej tabeli poziomów izolacji" in ocena["wyjasnienie"]["przyczyna_pl"]
    assert kompletnosc == "NIEPELNY"
