"""Karta F-K1 faza 6: DOWOD OBLICZENIOWY kryterium cieplnego (Calculation Evidence).

Ocena wlasciciela 8,5/10 z 15 uwagami sprowadzila sie do jednego wymagania: raport
ma pozwolic NIEZALEZNIE zweryfikowac kazda liczbe i kazda decyzje algorytmu. Testy
pilnuja wlasnie tego — nie tego, ze „cos sie policzylo".

Wartosci oczekiwane pochodza z NIEZALEZNEGO rachunku (wzor + liczby w komentarzu).
"""

from __future__ import annotations

import pytest
from network_model.solvers.conductor_thermal_withstand import (
    STANDARD_REFS,
    ConductorThermalInput,
    check_conductor_thermal_withstand,
)


def _wejscie(**over) -> ConductorThermalInput:
    """Kabel Al/XLPE 70 mm², k = 115 A·√s/mm² => Ith(1s) = 8050 A."""
    dane = {
        "ith_a": 9200.0,
        "fault_duration_s": 1.0,
        "ith_1s_a": 8050.0,
        "jth_1s_a_per_mm2": 115.0,
        "cross_section_mm2": 70.0,
        "conductor_material": "AL",
        "insulation": "XLPE",
        "temp_operating_c": 90.0,
        "temp_short_circuit_c": 250.0,
        "material_source_ref": "IEC 60502-2 / IEC 60949",
    }
    dane.update(over)
    return ConductorThermalInput(**dane)


def test_bilans_energii_zgadza_sie_z_rachunkiem_recznym() -> None:
    """DOWOD LICZBOWY: I²t = 9200² · 1 = 8,464e7 A²s; k²S² = (115·70)² = 6,48025e7 A²s.

    Wykorzystanie 9200/8050 = 1,142857 => margines ujemny -14,2857 %.
    """
    wynik = check_conductor_thermal_withstand(_wejscie())

    assert wynik.i2t_a2s == pytest.approx(84_640_000.0)
    assert wynik.i2t_admissible_a2s == pytest.approx(64_802_500.0)
    assert wynik.utilization == pytest.approx(1.142857, abs=1e-6)
    assert wynik.margin_percent == pytest.approx(-14.2857, abs=1e-4)


def test_kryteria_czastkowe_maja_osobny_werdykt_i_nie_moga_sie_rozjechac() -> None:
    """Trzy zapisy tej samej nierownosci: pradowy, energetyczny, przekrojowy.

    Projektant musi wiedziec, KTORE ograniczenie zdecydowalo — ale rownowaznosc
    zapisow oznacza, ze werdykt jest jeden. Rozjazd bylby bledem rachunku.
    """
    wynik = check_conductor_thermal_withstand(_wejscie())

    kody = {k["kod"]: k for k in wynik.criteria}
    assert set(kody) == {"prad_dopuszczalny", "energia_cieplna", "przekroj_minimalny"}
    assert {k["status"] for k in wynik.criteria} == {"FAIL"}
    assert kody["prad_dopuszczalny"]["granica"] == pytest.approx(8050.0)
    assert kody["energia_cieplna"]["granica"] == pytest.approx(64_802_500.0)
    # S_min = 9200 · √1 / 115 = 80 mm² wobec zastosowanych 70 mm².
    assert kody["przekroj_minimalny"]["granica"] == pytest.approx(80.0)
    assert kody["przekroj_minimalny"]["wartosc"] == pytest.approx(70.0)


def test_pozycja_spelniona_nie_dostaje_zalecen_naprawczych() -> None:
    """Zalecenie przy spelnionym kryterium bylo by szumem, a nie informacja."""
    wynik = check_conductor_thermal_withstand(_wejscie(ith_a=6000.0))

    assert wynik.status == "PASS"
    assert wynik.recommendations == ()
    assert "Wykorzystanie" in (wynik.decision_reason_pl or "")


def test_zalecenia_niosa_PROG_LICZBOWY_wyprowadzony_z_tego_samego_wzoru() -> None:
    """DOWOD LICZBOWY kazdej naprawy (przeksztalcenia I²t ≤ k²S²):

    przekroj  S ≥ I·√t/k = 9200 · 1 / 115 = 80 mm²
    czas      t ≤ (k·S/I)² = (8050/9200)² = 0,765595 s
    prad      I ≤ k·S/√t = 8050 / 1 = 8050 A
    material  k ≥ I·√t/S = 9200 / 70 = 131,4286 A·√s/mm²
    """
    wynik = check_conductor_thermal_withstand(_wejscie())

    cele = {z["kod"]: z["wartosc_docelowa"] for z in wynik.recommendations}
    assert cele["zwieksz_przekroj"] == pytest.approx(80.0)
    assert cele["skroc_czas"] == pytest.approx(0.7656, abs=1e-4)
    assert cele["ogranicz_prad"] == pytest.approx(8050.0)
    assert cele["zmien_material"] == pytest.approx(131.43, abs=1e-2)
    # Kazde zalecenie mowi, CO sie stanie po zmianie — inaczej jest bezuzyteczne.
    for zalecenie in wynik.recommendations:
        assert zalecenie["skutek_pl"]
        assert zalecenie["wzor"]


def test_wrazliwosc_pokazuje_ze_czas_wchodzi_pierwiastkiem_a_prad_liniowo() -> None:
    """Wykorzystanie = I·√t / Ith(1s).

    Czas x0,5 => wykorzystanie x1/√2 = 1,142857 · 0,7071 = 0,808122.
    Prad x0,5 => wykorzystanie x0,5 = 0,571429.
    """
    wynik = check_conductor_thermal_withstand(_wejscie())

    czas_polowa = next(
        p for p in wynik.sensitivity if p["parametr"] == "czas_wylaczenia" and p["mnoznik"] == 0.5
    )
    prad_polowa = next(
        p for p in wynik.sensitivity if p["parametr"] == "prad_zwarciowy" and p["mnoznik"] == 0.5
    )
    assert czas_polowa["wykorzystanie"] == pytest.approx(0.808122, abs=1e-5)
    assert prad_polowa["wykorzystanie"] == pytest.approx(0.571429, abs=1e-5)

    # Przekroj x2 => wytrzymalosc x2 => wykorzystanie o polowe mniejsze.
    przekroj_podwojny = next(
        p for p in wynik.sensitivity if p["parametr"] == "przekroj" and p["mnoznik"] == 2.0
    )
    assert przekroj_podwojny["wykorzystanie"] == pytest.approx(0.571429, abs=1e-5)


def test_uzasadnienie_k_niesie_material_izolacje_i_pare_temperatur() -> None:
    wynik = check_conductor_thermal_withstand(_wejscie())

    k = wynik.k_justification
    assert k is not None
    assert k["k_a_s05_per_mm2"] == pytest.approx(115.0)
    assert k["material_zyly"] == "AL"
    assert k["izolacja"] == "XLPE"
    assert k["temp_poczatkowa_c"] == 90.0
    assert k["temp_koncowa_c"] == 250.0
    assert k["kompletne"] is True
    assert k["braki_pl"] == ()


def test_brak_danych_materialowych_jest_NAZWANY_a_nie_uzupelniany_z_tablic() -> None:
    """Zgadniete k falszuje werdykt bezpieczenstwa — braki musza byc widoczne."""
    wynik = check_conductor_thermal_withstand(
        _wejscie(conductor_material=None, temp_short_circuit_c=None)
    )

    k = wynik.k_justification
    assert k is not None
    assert k["kompletne"] is False
    assert "materiał żyły" in k["braki_pl"]
    assert "temperatura końcowa (zwarciowa)" in k["braki_pl"]
    # Rachunek nadal sie odbywa (k z katalogu jest znane) — brakuje UZASADNIENIA.
    assert wynik.status == "FAIL"
    assert wynik.i2t_a2s is not None


def test_kazde_kryterium_ma_podstawe_normowa_z_punktem() -> None:
    wynik = check_conductor_thermal_withstand(_wejscie())

    assert wynik.standard_refs == STANDARD_REFS
    normy = {n["norma"]: n for n in wynik.standard_refs}
    assert "PN-HD 60364-4-43" in normy
    assert normy["PN-HD 60364-4-43"]["punkt"] == "§ 434.5.2"
    for norma in wynik.standard_refs:
        assert norma["tresc_pl"]


def test_wynik_niedostepny_nie_niesie_dowodu_ani_zalecen() -> None:
    """Brak podstawy do rachunku = brak dowodu. Kroki „na sucho" udawalyby dowod."""
    wynik = check_conductor_thermal_withstand(_wejscie(ith_1s_a=None, jth_1s_a_per_mm2=None))

    assert wynik.status == "UNAVAILABLE"
    assert wynik.criteria == ()
    assert wynik.recommendations == ()
    assert wynik.sensitivity == ()
    assert wynik.white_box_trace == ()
    assert wynik.i2t_a2s is None
