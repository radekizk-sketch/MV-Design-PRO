"""V12K-224: wyprowadzenie wspolczynnika k wg IEC 60949, gdy katalog milczy.

DLACZEGO TE TESTY ISTNIEJA. Osiem PRODUKCYJNYCH typow kablowych katalogu (YHAKXS,
YHKXS) nie podaje ani Ith(1s), ani Jth(1s). Dla nich kryterium wytrzymalosci
zwarciowej zyly konczylo sie werdyktem NIEDOSTEPNY, czyli kabel realnie uzywany w
sieci pozostawal niesprawdzony. Norma pozwala k WYZNACZYC z materialu zyly i pary
temperatur — i to robi solver, ale wylacznie gdy te dane sa PODANE.

GRANICA, ktorej pilnuja te testy: wyprowadzenie nie moze sie zamienic w zgadywanie.
Dane katalogowe maja bezwarunkowe pierwszenstwo, nieznany material albo brak
temperatury nie daje zadnej liczby, a zrodlo k jest zawsze nazwane w sladzie.

Wartosci oczekiwane pochodza z NIEZALEZNEGO rachunku (wzor + liczby w komentarzu
kazdego testu), NIE z uruchomienia testowanego kodu.
"""

from __future__ import annotations

import pytest
from network_model.solvers.conductor_thermal_withstand import (
    K_SOURCE_CATALOG,
    K_SOURCE_DERIVED_IEC60949,
    READINESS_CONDUCTOR_THERMAL_DATA_MISSING,
    ConductorThermalInput,
    check_conductor_thermal_withstand,
    derive_k_iec60949,
)


def _wejscie(**over: object) -> ConductorThermalInput:
    """Kabel Al/XLPE 120 mm², katalog MILCZY o Ith(1s) i Jth(1s)."""
    dane: dict[str, object] = {
        "ith_a": 8000.0,
        "fault_duration_s": 0.5,
        "ith_1s_a": None,
        "jth_1s_a_per_mm2": None,
        "cross_section_mm2": 120.0,
        "conductor_material": "AL",
        "insulation": "XLPE",
        "temp_operating_c": 90.0,
        "temp_short_circuit_c": 250.0,
    }
    dane.update(over)
    return ConductorThermalInput(**dane)  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# Sam wzor: kontrola wobec wartosci, ktore katalog podaje WPROST dla blizniaczych
# typow. To jest najmocniejszy dowod poprawnosci — liczba nie bierze sie z kodu,
# ale musi sie zgodzic z niezaleznym zapisem tablicowym w tym samym katalogu.
# ---------------------------------------------------------------------------


def test_k_dla_aluminium_xlpe_zgadza_sie_z_wartoscia_katalogowa_94() -> None:
    """RACHUNEK RECZNY (IEC 60949 § 4), Al: Qc=2,5e-3, beta=228, rho20=28,264e-6.

        Qc·(beta+20)/rho20 = 2,5e-3 · 248 / 28,264e-6 = 21 937,4
        ln((228+250)/(228+90)) = ln(1,503145) = 0,407565
        k = √(21 937,4 · 0,407565) = √8 940,7 = 94,553

    Katalog podaje dla pozostalych typow Al/XLPE wprost 94 — zgodnosc 0,6 %.
    Wyniku NIE zaokraglamy do 94: to byla by niejawna korekta (zakaz kanonu).
    """
    d = derive_k_iec60949(
        conductor_material="AL", temp_operating_c=90.0, temp_short_circuit_c=250.0
    )

    assert d is not None
    assert d.k_a_s05_per_mm2 == pytest.approx(94.553, abs=0.01)
    assert d.k_a_s05_per_mm2 == pytest.approx(94.0, rel=0.01)


def test_k_dla_miedzi_xlpe_zgadza_sie_z_wartoscia_katalogowa_143() -> None:
    """RACHUNEK RECZNY, Cu: Qc=3,45e-3, beta=234,5, rho20=17,241e-6.

        Qc·(beta+20)/rho20 = 3,45e-3 · 254,5 / 17,241e-6 = 50 925,7
        ln((234,5+250)/(234,5+90)) = ln(1,493067) = 0,400840
        k = √(50 925,7 · 0,400840) = √20 413,1 = 142,874

    Katalog podaje dla pozostalych typow Cu/XLPE wprost 143 — zgodnosc 0,09 %.
    """
    d = derive_k_iec60949(
        conductor_material="CU", temp_operating_c=90.0, temp_short_circuit_c=250.0
    )

    assert d is not None
    assert d.k_a_s05_per_mm2 == pytest.approx(142.874, abs=0.01)
    assert d.k_a_s05_per_mm2 == pytest.approx(143.0, rel=0.01)


def test_miedz_ma_wieksze_k_niz_aluminium() -> None:
    """Kontrola FIZYCZNA, nie liczbowa: miedz ma wieksza pojemnosc cieplna i mniejsza
    rezystywnosc, wiec ten sam przekroj przyjmie wiecej energii zwarcia.
    """
    al = derive_k_iec60949(
        conductor_material="AL", temp_operating_c=90.0, temp_short_circuit_c=250.0
    )
    cu = derive_k_iec60949(
        conductor_material="CU", temp_operating_c=90.0, temp_short_circuit_c=250.0
    )

    assert al is not None and cu is not None
    assert cu.k_a_s05_per_mm2 > al.k_a_s05_per_mm2


def test_wyzsza_temperatura_koncowa_daje_wieksze_k() -> None:
    """Kontrola FIZYCZNA: wieksze dopuszczalne przegrzanie = wiekszy zapas cieplny."""
    nizsza = derive_k_iec60949(
        conductor_material="AL", temp_operating_c=90.0, temp_short_circuit_c=200.0
    )
    wyzsza = derive_k_iec60949(
        conductor_material="AL", temp_operating_c=90.0, temp_short_circuit_c=250.0
    )

    assert nizsza is not None and wyzsza is not None
    assert wyzsza.k_a_s05_per_mm2 > nizsza.k_a_s05_per_mm2


# ---------------------------------------------------------------------------
# Granice wyprowadzenia — tu pilnujemy, zeby derywacja nie stala sie zgadywaniem
# ---------------------------------------------------------------------------


def test_bez_materialu_nie_ma_wyprowadzenia() -> None:
    """Nieznany material = brak stalych normowych. Przyjecie aluminium „bo typowe"
    falszowaloby werdykt bezpieczenstwa (zakaz z docstringu modulu).
    """
    assert (
        derive_k_iec60949(
            conductor_material=None, temp_operating_c=90.0, temp_short_circuit_c=250.0
        )
        is None
    )
    assert (
        derive_k_iec60949(
            conductor_material="STALOALUMINIUM",
            temp_operating_c=90.0,
            temp_short_circuit_c=250.0,
        )
        is None
    )


def test_bez_temperatury_nie_ma_wyprowadzenia() -> None:
    """Para temperatur jest w samym wzorze — bez niej nie ma czego podstawic."""
    assert (
        derive_k_iec60949(
            conductor_material="AL", temp_operating_c=None, temp_short_circuit_c=250.0
        )
        is None
    )
    assert (
        derive_k_iec60949(conductor_material="AL", temp_operating_c=90.0, temp_short_circuit_c=None)
        is None
    )


def test_temperatura_koncowa_nie_wyzsza_od_roboczej_nie_daje_k() -> None:
    """Zyla bez zapasu cieplnego: rachunek adiabatyczny nie ma sensu fizycznego,
    a ln(1) = 0 dalo by k = 0, czyli falszywe „przewod nie wytrzyma nic".
    """
    assert (
        derive_k_iec60949(
            conductor_material="AL", temp_operating_c=250.0, temp_short_circuit_c=250.0
        )
        is None
    )
    assert (
        derive_k_iec60949(
            conductor_material="AL", temp_operating_c=250.0, temp_short_circuit_c=200.0
        )
        is None
    )


# ---------------------------------------------------------------------------
# Wpiecie w kryterium: pierwszenstwo katalogu i jawnosc zrodla
# ---------------------------------------------------------------------------


def test_dane_katalogowe_maja_bezwarunkowe_pierwszenstwo() -> None:
    """Katalog podaje Jth = 80 (mniej niz wzorowe 94,55) — i to ma zostac.

    Wyprowadzenie nie moze poprawiac producenta, nawet „na korzysc": karta
    katalogowa moze uwzgledniac ograniczenia, ktorych adiabatyczny wzor nie widzi
    (osprzet, glowice, warunki ulozenia).
    """
    wynik = check_conductor_thermal_withstand(
        _wejscie(ith_1s_a=80.0 * 120.0, jth_1s_a_per_mm2=80.0)
    )

    assert wynik.k_justification is not None
    assert wynik.k_justification["zrodlo_k"] == K_SOURCE_CATALOG
    assert wynik.k_justification["k_a_s05_per_mm2"] == pytest.approx(80.0)
    assert wynik.k_justification["wyprowadzenie_k"] is None


def test_gdy_katalog_milczy_k_jest_wyprowadzone_i_nazwane() -> None:
    """RACHUNEK RECZNY: k = 94,5528 => Ith(1s) = 94,5528 · 120 = 11 346,33 A;

        I_dop(0,5 s) = 11 346,33 / √0,5 = 11 346,33 · √2 = 16 046,14 A
        wykorzystanie = 8000 / 16 046,14 = 0,498562  => PASS

    Zrodlo k MUSI byc nazwane, bo od niego zalezy, czy liczbe wolno wstawic do
    dokumentacji bez karty producenta.
    """
    wynik = check_conductor_thermal_withstand(_wejscie())

    assert wynik.status == "PASS"
    assert wynik.admissible_current_a == pytest.approx(16_046.14, abs=0.1)
    assert wynik.utilization == pytest.approx(0.498562, abs=1e-5)
    assert wynik.k_justification is not None
    assert wynik.k_justification["zrodlo_k"] == K_SOURCE_DERIVED_IEC60949
    assert wynik.k_justification["k_a_s05_per_mm2"] == pytest.approx(94.553, abs=0.01)


def test_wyprowadzenie_niesie_wszystkie_skladniki_do_odtworzenia_rachunku() -> None:
    """WHITE BOX: audytor musi odtworzyc k z samego sladu, bez zagladania w kod."""
    wynik = check_conductor_thermal_withstand(_wejscie())

    assert wynik.k_justification is not None
    wyprowadzenie = wynik.k_justification["wyprowadzenie_k"]
    assert wyprowadzenie is not None
    assert wyprowadzenie["material_klucz"] == "AL"
    assert wyprowadzenie["qc_j_per_c_mm3"] == pytest.approx(2.5e-3)
    assert wyprowadzenie["rho20_ohm_mm"] == pytest.approx(28.264e-6)
    assert wyprowadzenie["beta_c"] == pytest.approx(228.0)
    assert wyprowadzenie["temp_poczatkowa_c"] == pytest.approx(90.0)
    assert wyprowadzenie["temp_koncowa_c"] == pytest.approx(250.0)
    assert wyprowadzenie["norma"] == "IEC 60949 § 4"
    assert "sqrt" in wyprowadzenie["wzor_tex"]


def test_dowod_pokazuje_wzor_normy_a_nie_odczyt_z_karty() -> None:
    """Krok 1 dowodu przy k wyprowadzonym musi pokazac WZOR, nie „k = Jth(1s)" —
    inaczej dowod sugerowalby odczyt z karty katalogowej, ktorej nie ma.
    """
    wynik = check_conductor_thermal_withstand(_wejscie())

    krok = wynik.white_box_trace[0]
    assert krok["key"] == "conductor_thermal_k_factor"
    assert "ln" in krok["formula_latex"]
    assert "rho" in krok["formula_latex"]
    # Podstawienie niesie liczby, nie sam wzor — inaczej nie da sie sprawdzic rachunku.
    assert "228" in krok["substitution"]
    assert "WYPROWADZONE" in krok["notes"] or "wyprowadzone" in krok["notes"]


def test_brak_przekroju_nie_daje_wyprowadzenia_bo_k_bez_S_nie_da_pradu() -> None:
    """k jest gestoscia [A·√s/mm²]. Bez przekroju nie ma z czego zrobic pradu, wiec
    kryterium konczy sie brakiem podstawy — a nie k pomnozonym przez zgadniete S.
    """
    wynik = check_conductor_thermal_withstand(_wejscie(cross_section_mm2=None))

    assert wynik.status == "UNAVAILABLE"
    assert READINESS_CONDUCTOR_THERMAL_DATA_MISSING in wynik.readiness_codes


def test_brak_materialu_konczy_sie_brakiem_podstawy_nie_wartoscia_typowa() -> None:
    """Kontrola odwrotna do wyprowadzenia: to samo wejscie bez materialu NIE dostaje
    werdyktu. Bez tego testu regresja „podstaw typowe 94" byla by niewidoczna.
    """
    wynik = check_conductor_thermal_withstand(_wejscie(conductor_material=None))

    assert wynik.status == "UNAVAILABLE"
    assert READINESS_CONDUCTOR_THERMAL_DATA_MISSING in wynik.readiness_codes
