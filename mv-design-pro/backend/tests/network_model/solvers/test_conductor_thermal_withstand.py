"""Testy kryterium wytrzymalosci zwarciowej przewodu (IEC 60949) — karta F-K1.

METODA: kazda wartosc oczekiwana pochodzi z NIEZALEZNEGO rachunku analitycznego
zapisanego wprost w tescie, nigdy z wartosci utrwalonej po uruchomieniu kodu.
"""

from __future__ import annotations

import math

import pytest
from network_model.solvers.conductor_thermal_withstand import (
    READINESS_CONDUCTOR_THERMAL_DATA_MISSING,
    READINESS_FAULT_CURRENT_MISSING,
    READINESS_FAULT_DURATION_MISSING,
    STATUS_FAIL,
    STATUS_PASS,
    STATUS_UNAVAILABLE,
    ConductorThermalInput,
    check_conductor_thermal_withstand,
)

# Stala materialowa Al/XLPE z katalogu kabli SN (mv_cable_line_catalog).
JTH_AL_XLPE = 94.0


def test_przekroj_za_maly_dla_realnego_zwarcia_sn() -> None:
    """Al/XLPE 70 mm², I″k = 12,5 kA, t = 0,5 s — przypadek z audytu (znalezisko Z1).

    Rachunek niezalezny:
      I_th(1s) = 94 A/mm² · 70 mm²            = 6 580 A
      I_dop(0,5 s) = 6 580 / √0,5             = 9 305,525 A
      12 500 A > 9 305,525 A                  => przekroj NIEWYSTARCZAJACY
      S_min = 12 500 · √0,5 / 94              = 94,030 mm² => katalogowo 120 mm²
    """
    section = 70.0
    ith_1s = JTH_AL_XLPE * section
    assert ith_1s == 6580.0

    wynik = check_conductor_thermal_withstand(
        ConductorThermalInput(
            ith_a=12500.0,
            fault_duration_s=0.5,
            ith_1s_a=ith_1s,
            jth_1s_a_per_mm2=JTH_AL_XLPE,
            cross_section_mm2=section,
        )
    )

    oczekiwany_dopuszczalny = 6580.0 / math.sqrt(0.5)
    oczekiwany_minimalny = 12500.0 * math.sqrt(0.5) / JTH_AL_XLPE

    assert wynik.status == STATUS_FAIL
    assert wynik.admissible_current_a == pytest.approx(oczekiwany_dopuszczalny, rel=1e-12)
    assert wynik.admissible_current_a == pytest.approx(9305.525, rel=1e-6)
    assert wynik.required_cross_section_mm2 == pytest.approx(oczekiwany_minimalny, rel=1e-12)
    assert wynik.required_cross_section_mm2 == pytest.approx(94.030, rel=1e-4)
    # Przekroj zastosowany (70) jest mniejszy od wymaganego (94,030) — spojnosc obu drog.
    assert wynik.required_cross_section_mm2 > section
    assert wynik.margin_a is not None and wynik.margin_a < 0.0
    assert wynik.is_conclusive is True


def test_wiekszy_przekroj_spelnia_to_samo_zwarcie() -> None:
    """Ten sam przypadek na 120 mm²: I_dop = 94·120/√0,5 = 15 952,4 A > 12 500 A."""
    wynik = check_conductor_thermal_withstand(
        ConductorThermalInput(
            ith_a=12500.0,
            fault_duration_s=0.5,
            ith_1s_a=JTH_AL_XLPE * 120.0,
            jth_1s_a_per_mm2=JTH_AL_XLPE,
            cross_section_mm2=120.0,
        )
    )
    assert wynik.status == STATUS_PASS
    assert wynik.admissible_current_a == pytest.approx(94.0 * 120.0 / math.sqrt(0.5), rel=1e-12)
    assert wynik.required_cross_section_mm2 is not None
    assert wynik.required_cross_section_mm2 <= 120.0
    assert wynik.margin_a is not None and wynik.margin_a > 0.0


def test_krotszy_czas_wylaczenia_podnosi_dopuszczalny_prad_wg_pierwiastka() -> None:
    """Skrocenie czasu 4x podnosi prad dopuszczalny dokladnie 2x (I²·t = const).

    Rachunek: Ith(1s) = 8 000 A. Przy t = 1,0 s I_dop = 8 000 A < 10 000 A => FAIL.
    Przy t = 0,25 s I_dop = 8 000/0,5 = 16 000 A > 10 000 A => PASS. Stosunek = 2,0.
    """
    baza = ConductorThermalInput(
        ith_a=10000.0,
        fault_duration_s=1.0,
        ith_1s_a=8000.0,
        jth_1s_a_per_mm2=JTH_AL_XLPE,
    )
    krotszy = ConductorThermalInput(
        ith_a=10000.0,
        fault_duration_s=0.25,
        ith_1s_a=8000.0,
        jth_1s_a_per_mm2=JTH_AL_XLPE,
    )
    w_baza = check_conductor_thermal_withstand(baza)
    w_krotszy = check_conductor_thermal_withstand(krotszy)

    assert w_baza.admissible_current_a is not None
    assert w_krotszy.admissible_current_a is not None
    assert w_krotszy.admissible_current_a / w_baza.admissible_current_a == pytest.approx(
        2.0, rel=1e-12
    )
    # Ten sam przewod i ten sam prad: dluzszy czas nie przechodzi, krotszy przechodzi.
    assert w_baza.status == STATUS_FAIL
    assert w_krotszy.status == STATUS_PASS


def test_energia_cieplna_jest_niezmiennikiem_kryterium() -> None:
    """Niezmiennik: para (I, t) na granicy spelnia I²·t = I_th(1s)²·1 s.

    Sprawdzamy, ze prad dopuszczalny wyznaczony przez solver ma dokladnie te sama
    calke Joule'a co wytrzymalosc odniesiona do 1 s — bez odwolania do liczby z kodu.
    """
    ith_1s = 6580.0
    for czas in (0.05, 0.2, 0.5, 1.0, 3.0):
        wynik = check_conductor_thermal_withstand(
            ConductorThermalInput(ith_a=1.0, fault_duration_s=czas, ith_1s_a=ith_1s)
        )
        assert wynik.admissible_current_a is not None
        energia = wynik.admissible_current_a**2 * czas
        assert energia == pytest.approx(ith_1s**2 * 1.0, rel=1e-12)


def test_rowna_wytrzymalosc_jest_spelnieniem_kryterium() -> None:
    """Przypadek graniczny I_th = I_dop: kryterium jest spelnione (nierownosc nieostra)."""
    wynik = check_conductor_thermal_withstand(
        ConductorThermalInput(ith_a=6580.0, fault_duration_s=1.0, ith_1s_a=6580.0)
    )
    assert wynik.status == STATUS_PASS
    assert wynik.margin_a == pytest.approx(0.0, abs=1e-9)
    assert wynik.utilization == pytest.approx(1.0, rel=1e-12)


@pytest.mark.parametrize(
    ("dane", "oczekiwany_kod"),
    [
        (
            ConductorThermalInput(ith_a=None, fault_duration_s=0.5, ith_1s_a=6580.0),
            READINESS_FAULT_CURRENT_MISSING,
        ),
        (
            ConductorThermalInput(ith_a=12500.0, fault_duration_s=None, ith_1s_a=6580.0),
            READINESS_FAULT_DURATION_MISSING,
        ),
        (
            ConductorThermalInput(ith_a=12500.0, fault_duration_s=0.5, ith_1s_a=None),
            READINESS_CONDUCTOR_THERMAL_DATA_MISSING,
        ),
    ],
)
def test_brak_danej_daje_niedostepnosc_a_nie_liczbe_zastepcza(
    dane: ConductorThermalInput, oczekiwany_kod: str
) -> None:
    """Zero fabrykacji (V12K-189): brak danej => UNAVAILABLE + kod, nigdy wartosc domyslna."""
    wynik = check_conductor_thermal_withstand(dane)
    assert wynik.status == STATUS_UNAVAILABLE
    assert oczekiwany_kod in wynik.readiness_codes
    assert wynik.admissible_current_a is None
    assert wynik.utilization is None
    assert wynik.required_cross_section_mm2 is None
    assert wynik.margin_a is None
    # Brak podstawy do oceny NIE jest werdyktem — nie wolno go czytac jako PASS.
    assert wynik.is_conclusive is False


def test_wartosci_niedodatnie_traktowane_jak_brak_danej() -> None:
    """Zero i wartosci ujemne nie sa danymi fizycznymi — daja niedostepnosc, nie dzielenie."""
    wynik = check_conductor_thermal_withstand(
        ConductorThermalInput(ith_a=12500.0, fault_duration_s=0.0, ith_1s_a=6580.0)
    )
    assert wynik.status == STATUS_UNAVAILABLE
    assert READINESS_FAULT_DURATION_MISSING in wynik.readiness_codes


def test_brak_gestosci_pradu_nie_blokuje_werdyktu() -> None:
    """Jth sluzy tylko do minimalnego przekroju — jego brak nie odbiera werdyktu."""
    wynik = check_conductor_thermal_withstand(
        ConductorThermalInput(
            ith_a=12500.0, fault_duration_s=0.5, ith_1s_a=6580.0, jth_1s_a_per_mm2=None
        )
    )
    assert wynik.status == STATUS_FAIL
    assert wynik.required_cross_section_mm2 is None
    assert wynik.admissible_current_a is not None


def test_wszystkie_braki_raportowane_naraz_bez_duplikatow() -> None:
    wynik = check_conductor_thermal_withstand(
        ConductorThermalInput(ith_a=None, fault_duration_s=None, ith_1s_a=None)
    )
    assert wynik.status == STATUS_UNAVAILABLE
    assert set(wynik.readiness_codes) == {
        READINESS_FAULT_CURRENT_MISSING,
        READINESS_FAULT_DURATION_MISSING,
        READINESS_CONDUCTOR_THERMAL_DATA_MISSING,
    }
    assert len(wynik.readiness_codes) == len(set(wynik.readiness_codes))
