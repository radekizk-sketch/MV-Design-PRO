"""V12.6: sposób uziemienia punktu neutralnego sieci SN WYŁĄCZNIE z modelu (karta
UX-04/POLE-ZU-SKLADOWA-ZEROWA §0 pkt 4).

Przed kartą trzy analizy V12.6 miały domyślne wartości parametru biegu: projekt uziemienia
„petersen_coil", detekcja doziemień „petersen_tuned", ferrorezonans w analizie TRV
„isolated". Każda zgadywała sieć, której model nie opisał. Iloczyn cech:
analiza {detekcja doziemień, TRV/ferrorezonans, projekt uziemienia} × uziemienie wejścia
{brak, przyczyna z modelu, każdy wariant} × parametr biegu próbujący nadpisać model.
"""

from __future__ import annotations

import math

import pytest
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126BranchInput,
    V126BusInput,
    V126SiecSnInput,
    V126UziemienieSnInput,
)

_B0_PER_KM = 2.0 * math.pi * 50.0 * 0.25e-6

#: Wariant zespołu sekcji → kategoria sieci tabeli decyzyjnej detekcji doziemień.
KATEGORIA_DETEKCJI = {
    ("izolowany", False): "isolated",
    ("dlawik", True): "petersen_tuned",
    ("dlawik", False): "petersen_detuned",
    ("dlawik_awsc", True): "petersen_tuned",
    ("dlawik_awsc", False): "petersen_detuned",
    ("rezystor", False): "resistor",
    ("dlawik_rezystor", True): "resistor",
    ("bezposrednie", False): "solid",
}

#: Parametry biegu, którymi dawne domyślne dało się „ustawić” sieć — nie mają skutku.
PROBA_NADPISANIA = {"neutral_grounding": "solid", "neutral_earthing_type": "resistor"}

#: Parametry obwodu napięcia powrotnego wyłącznika (dane projektanta — `test_v126_trv_parametry`).
TRV_OBWOD = {
    "breaker_rated_voltage_kv": 17.5,
    "trv_natural_frequency_hz": 12000.0,
    "trv_tau_s": 0.00018,
    "inrush_multiple_in": 8.0,
}


def _siec(uziemienie: V126UziemienieSnInput | None, parametry: dict | None = None):
    return V126AcademicInput(
        base_frequency_hz=50.0,
        buses=[
            V126BusInput(ref="B1", name="GPZ", nominal_kv=15.0),
            V126BusInput(ref="B2", name="S1", nominal_kv=15.0),
        ],
        branches=[
            V126BranchInput(
                ref="K1",
                from_bus_ref="B1",
                to_bus_ref="B2",
                kind="cable",
                length_km=20.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.12,
                b_siemens_per_km=_B0_PER_KM,
                b0_siemens_per_km=_B0_PER_KM,
            )
        ],
        parameters=parametry or {},
        uziemienie_sn=uziemienie,
    )


def _uziemienie(wariant: str, nadazna: bool) -> V126UziemienieSnInput:
    return V126UziemienieSnInput(
        wariant=wariant,
        wariant_awsc_zalaczony=wariant,
        regulacja_nadazna=nadazna,
        opis_pl=f"sieć z zespołem uziemiającym ({wariant}).",
        sieci=[
            V126SiecSnInput(
                szyna_ref="B1",
                nazwa_pl="Sieć SN szyny B1",
                wariant=wariant,
                opis_pl=f"sieć z zespołem uziemiającym ({wariant}).",
                napiecie_kv=15.0,
                szyny=["B1", "B2"],
                galezie_sieci=["K1"],
            )
        ],
    )


def _bieg(rodzaj: V126AnalysisType, model: V126AcademicInput) -> dict:
    return V126AcademicSolver().run(rodzaj, model)


BRAKI = (
    pytest.param(None, "nie niesie sposobu uziemienia", id="brak-wejscia"),
    pytest.param(
        V126UziemienieSnInput(przyczyna_braku_pl="Sieci SN modelu mają różny sposób uziemienia."),
        "różny sposób uziemienia",
        id="przyczyna-z-modelu",
    ),
    pytest.param(V126UziemienieSnInput(opis_pl="—"), "nieustalony", id="wariant-nieustalony"),
)


@pytest.mark.parametrize(("wariant", "nadazna"), sorted(KATEGORIA_DETEKCJI))
@pytest.mark.parametrize("nadpisanie", [False, True], ids=["bez-parametru", "proba-nadpisania"])
def test_detekcja_doziemien_z_wariantu_modelu(wariant: str, nadazna: bool, nadpisanie: bool):
    model = _siec(_uziemienie(wariant, nadazna), PROBA_NADPISANIA if nadpisanie else None)
    wynik = _bieg(V126AnalysisType.EARTH_FAULT_DETECTION, model)
    kategoria = KATEGORIA_DETEKCJI[(wariant, nadazna)]
    assert wynik["result"]["neutral_grounding"] == kategoria
    (krok,) = (k for k in wynik["white_box_trace"] if k["key"] == "earth_fault_method_selection")
    assert krok["data"]["wariant_uziemienia_sn"] == wariant


@pytest.mark.parametrize(("uziemienie", "fragment"), BRAKI)
@pytest.mark.parametrize(
    "rodzaj",
    [V126AnalysisType.EARTH_FAULT_DETECTION, V126AnalysisType.NEUTRAL_EARTHING_DESIGN],
)
def test_brak_uziemienia_to_odmowa_nazwana_bez_domyslnej(rodzaj, uziemienie, fragment):
    wynik = _bieg(rodzaj, _siec(uziemienie, PROBA_NADPISANIA))["result"]
    assert wynik["status"] == "dane niekompletne"
    assert wynik["missing_fields"] == ["uziemienie_sn"]
    assert fragment in wynik["message_pl"]
    assert "neutral_grounding" not in wynik and "neutral_earthing_type" not in wynik


@pytest.mark.parametrize(("uziemienie", "fragment"), BRAKI)
def test_ferrorezonans_bez_uziemienia_nieoceniony_nie_brak_przeslanek(uziemienie, fragment):
    # Parametry obwodu napięcia powrotnego podane (bez wartości zastępczych solvera — karta
    # UX-04/POLE-ZU-SKLADOWA-ZEROWA, odcinek TRV), żeby pokazać, że TRV nie zależy od uziemienia.
    parametry = {**PROBA_NADPISANIA, **TRV_OBWOD}
    wynik = _bieg(V126AnalysisType.TRANSIENT_TRV, _siec(uziemienie, parametry))["result"]
    ferro = wynik["ferroresonance"]
    assert ferro["risk"] is None
    assert "nieustalony" in ferro["recommendation"]
    assert fragment in ferro["brak_danych"]
    # TRV wyłącznika nie zależy od punktu neutralnego — liczony mimo braku.
    assert wynik["trv_margin_percent"] is not None


@pytest.mark.parametrize(
    ("wariant", "ryzyko"),
    [("izolowany", True), ("dlawik", False), ("rezystor", False), ("dlawik_rezystor", False)],
)
def test_ferrorezonans_z_wariantu_modelu(wariant: str, ryzyko: bool) -> None:
    """Ryzyko ferrorezonansu przekładników tylko w sieci izolowanej z pojemnością doziemną;
    parametr biegu „neutral_grounding” nie zmienia oceny."""
    for parametry in (None, PROBA_NADPISANIA):
        wynik = _bieg(
            V126AnalysisType.TRANSIENT_TRV, _siec(_uziemienie(wariant, False), parametry)
        )["result"]
        assert wynik["ferroresonance"]["risk"] is ryzyko
        assert "brak_danych" not in wynik["ferroresonance"]


@pytest.mark.parametrize("wariant", ["izolowany", "dlawik", "rezystor", "bezposrednie"])
@pytest.mark.parametrize(
    "metody", [None, ["wattmetric"]], ids=["bez-danych-przekaznika", "metody-projektanta"]
)
def test_detekcja_doziemien_dane_przyjete_przekaznika(wariant: str, metody: list | None):
    """Zasada nr 4: brak wyposażenia przekaźnika nie blokuje doboru metody — komplet metod
    przyjęty jawnie (ESTIMATED, kompletność NIEPEŁNY); metody projektanta — bez danej przyjętej.
    Nastawy startowe niosą podstawę (praktyka, bez wartości normowej)."""
    parametry = {} if metody is None else {"relay_methods": metody}
    wynik = _bieg(
        V126AnalysisType.EARTH_FAULT_DETECTION, _siec(_uziemienie(wariant, False), parametry)
    )["result"]
    assert "bez wartości normowej" in wynik["settings_podstawa_pl"]
    if metody is None:
        (dana,) = wynik["dane_przyjete"]
        assert dana["jakosc"] == "ESTIMATED"
        assert dana["nazwa_pl"] == "Metody detekcji dostępne w przekaźniku"
        assert wynik["kompletnosc_dowodu"] == "NIEPELNY"
        assert wynik["relay_support_status"] == "spelniony"
    else:
        assert wynik["dane_przyjete"] == []
        assert wynik["kompletnosc_dowodu"] == "PELNY"
        oczekiwany = (
            "spelniony"
            if wynik["recommended_method"] in metody or wariant in ("rezystor", "bezposrednie")
            else "brak_w_przekazniku"
        )
        assert wynik["relay_support_status"] == oczekiwany
