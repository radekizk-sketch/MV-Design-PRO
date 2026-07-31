"""Testy WHITE BOX czterech kryteriow wyposazenia stacji (karta KD-3).

KAZDY przypadek liczbowy jest policzony RECZNIE w komentarzu i asertowany NIE
tylko na wyniku koncowym, ale na wartosciach POSREDNICH — inaczej test
przepuscilby bledny wzor, ktory przypadkiem daje zbliżony wynik.
"""

from __future__ import annotations

import math

import pytest
from network_model.solvers.equipment_checks import (
    STATUS_FAIL,
    STATUS_PASS,
    STATUS_UNAVAILABLE,
    CableThermalAgingInput,
    CtBurdenInput,
    CtDeviceBurden,
    TransformerLossesInput,
    VtBurdenInput,
    VtDeviceBurden,
    check_cable_thermal_aging,
    check_ct_burden_saturation,
    check_vt_burden_voltage_drop,
    compute_transformer_losses,
)
from network_model.solvers.equipment_checks.cable_thermal_aging import (
    READINESS_CABLE_INSULATION_DATA_MISSING,
    READINESS_CABLE_OPERATING_TEMPERATURE_MISSING,
)
from network_model.solvers.equipment_checks.ct_burden_saturation import (
    READINESS_CT_ACCURACY_LIMIT_MISSING,
    READINESS_CT_RATED_BURDEN_MISSING,
    READINESS_CT_REQUIRED_ALF_MISSING,
    READINESS_CT_SECONDARY_CIRCUIT_MISSING,
    READINESS_CT_WINDING_RESISTANCE_MISSING,
    WARIANT_ALF_PELNY,
    WARIANT_ALF_UPROSZCZONY,
    alf_z_klasy,
)
from network_model.solvers.equipment_checks.transformer_losses import (
    READINESS_TRANSFORMER_LOADING_FACTOR_MISSING,
    READINESS_TRANSFORMER_LOSS_DATA_MISSING,
)
from network_model.solvers.equipment_checks.vt_burden_voltage_drop import (
    KATEGORIA_POMIAROWA,
    KATEGORIA_ZABEZPIECZENIOWA,
    READINESS_VT_SECONDARY_CIRCUIT_MISSING,
    READINESS_VT_WINDING_CATEGORY_MISSING,
    kategoria_z_klasy,
)

# ---------------------------------------------------------------------------
# Zdolnosc 1 — bilans wtorny i nasycenie CT (IEC 61869-2 § 5.6)
# ---------------------------------------------------------------------------

# RACHUNEK RECZNY (przypadek odniesienia dla calego bloku CT):
#   ρ = 0,017241 Ω·mm²/m (miedz 20 °C), L = 25 m, s = 4 mm²
#   Rp = 2·0,017241·25 / 4 = 0,86205 / 4          = 0,2155125 Ω
#   I2n = 5 A  ⇒  S_przewodow = 5²·0,2155125       = 5,3878125 VA
#   Aparaty: 2,5 + 1,0                              = 3,5 VA
#   S2obl = 5,3878125 + 3,5                         = 8,8878125 VA
#   Sn = 10 VA  ⇒  wykorzystanie = 0,88878125       → PASS (≤ 1)
#   Rct = 0,2 Ω ⇒ Sw = 5²·0,2                       = 5,0 VA
#   ALF = 20 (klasa 5P20)
#   ALF_eff = 20·(10 + 5)/(8,8878125 + 5) = 300/13,8878125 = 21,60167412974...
#   ALF_wym = 15  ⇒  zapas = 6,60167412974...       → PASS
_CT_ODNIESIENIE = CtBurdenInput(
    i2n_a=5.0,
    sn_va=10.0,
    alf=20.0,
    dlugosc_przewodu_m=25.0,
    przekroj_przewodu_mm2=4.0,
    obciazenia_aparatow=(
        CtDeviceBurden(nazwa="Przekaźnik nadprądowy", moc_va=2.5),
        CtDeviceBurden(nazwa="Amperomierz", moc_va=1.0),
    ),
    rct_ohm=0.2,
    alf_wymagany=15.0,
)


def test_ct_bilans_wartosci_posrednie_z_rachunku_recznego() -> None:
    """Wszystkie wielkości pośrednie muszą zgadzać się z rachunkiem ręcznym."""
    wynik = check_ct_burden_saturation(_CT_ODNIESIENIE)

    assert wynik.rezystancja_przewodow_ohm == pytest.approx(0.2155125, abs=1e-12)
    assert wynik.moc_przewodow_va == pytest.approx(5.3878125, abs=1e-12)
    assert wynik.moc_aparatow_va == pytest.approx(3.5, abs=1e-12)
    assert wynik.moc_obliczeniowa_va == pytest.approx(8.8878125, abs=1e-12)
    assert wynik.moc_wewnetrzna_va == pytest.approx(5.0, abs=1e-12)
    assert wynik.wykorzystanie_mocy == pytest.approx(0.88878125, abs=1e-12)
    assert wynik.alf_efektywny == pytest.approx(21.601674129745057, abs=1e-9)
    assert wynik.zapas_alf == pytest.approx(6.601674129745057, abs=1e-9)
    assert wynik.wariant_alf == WARIANT_ALF_PELNY
    assert wynik.status_obciazenia == STATUS_PASS
    assert wynik.status_nasycenia == STATUS_PASS
    assert wynik.status == STATUS_PASS
    assert wynik.readiness_codes == ()


def test_ct_moc_przewodow_liczona_raz_nie_dwa_razy() -> None:
    """Człon przewodów wchodzi do bilansu RAZ (nie jako S_przew + I2²·Rp).

    Rozstrzygnięcie karty KD-3: skrócony zapis kryterium wymienia ten sam człon
    dwa razy — raz z nazwy, raz ze wzoru. Podwójne ujęcie zawyżyłoby S2obl i
    zaniżyło ALF_eff. Test przypina wybór wartością, której podwójny bilans
    (8,8878125 + 5,3878125 = 14,275625 VA) nie da.
    """
    wynik = check_ct_burden_saturation(_CT_ODNIESIENIE)
    assert wynik.moc_obliczeniowa_va == pytest.approx(
        wynik.moc_aparatow_va + wynik.moc_przewodow_va, abs=1e-12
    )
    assert wynik.moc_obliczeniowa_va != pytest.approx(14.275625, abs=1e-6)


def test_ct_wariant_uproszczony_bez_rezystancji_uzwojenia() -> None:
    """Bez Rct wchodzi wariant UPROSZCZONY — NAZWANY i z kodem gotowości.

    RACHUNEK RĘCZNY: ALF_eff = 20·10/8,8878125 = 22,50272493934...
    Wartość jest WIĘKSZA niż w wariancie pełnym (21,6017) — dokładnie dlatego
    wariant uproszczony musi być nazwany, a nie podstawiony po cichu.
    """
    wynik = check_ct_burden_saturation(
        CtBurdenInput(
            i2n_a=5.0,
            sn_va=10.0,
            alf=20.0,
            dlugosc_przewodu_m=25.0,
            przekroj_przewodu_mm2=4.0,
            obciazenia_aparatow=_CT_ODNIESIENIE.obciazenia_aparatow,
            rct_ohm=None,
            alf_wymagany=15.0,
        )
    )
    assert wynik.wariant_alf == WARIANT_ALF_UPROSZCZONY
    assert wynik.moc_wewnetrzna_va is None
    assert wynik.alf_efektywny == pytest.approx(22.502724939348127, abs=1e-9)
    assert READINESS_CT_WINDING_RESISTANCE_MISSING in wynik.readiness_codes
    assert any("UPROSZCZONY" in z for z in wynik.assumptions)
    assert any("optymistyczny" in z for z in wynik.assumptions)


def test_ct_przekroczenie_mocy_znamionowej_daje_werdykt_negatywny() -> None:
    """S2obl > Sn ⇒ FAIL bilansu.

    RACHUNEK RĘCZNY: Sn = 5 VA, S2obl = 8,8878125 VA ⇒ wykorzystanie 1,7775625.
    """
    wynik = check_ct_burden_saturation(
        CtBurdenInput(
            i2n_a=5.0,
            sn_va=5.0,
            alf=20.0,
            dlugosc_przewodu_m=25.0,
            przekroj_przewodu_mm2=4.0,
            obciazenia_aparatow=_CT_ODNIESIENIE.obciazenia_aparatow,
            rct_ohm=0.2,
            alf_wymagany=15.0,
        )
    )
    assert wynik.wykorzystanie_mocy == pytest.approx(1.7775625, abs=1e-12)
    assert wynik.status_obciazenia == STATUS_FAIL
    assert wynik.status == STATUS_FAIL


def test_ct_nasycenie_ponizej_wymagania_daje_werdykt_negatywny() -> None:
    """ALF_eff < ALF_wym ⇒ FAIL nasycenia (ALF_wym = 25 wobec 21,6017)."""
    wynik = check_ct_burden_saturation(
        CtBurdenInput(
            i2n_a=5.0,
            sn_va=10.0,
            alf=20.0,
            dlugosc_przewodu_m=25.0,
            przekroj_przewodu_mm2=4.0,
            obciazenia_aparatow=_CT_ODNIESIENIE.obciazenia_aparatow,
            rct_ohm=0.2,
            alf_wymagany=25.0,
        )
    )
    assert wynik.status_nasycenia == STATUS_FAIL
    assert wynik.zapas_alf == pytest.approx(-3.398325870254943, abs=1e-9)
    assert wynik.status == STATUS_FAIL


def test_ct_brak_wymagania_alf_daje_kod_gotowosci_nie_zero() -> None:
    """Brak wymagania ⇒ werdykt nasycenia NIEDOSTĘPNY + kod gotowości."""
    wynik = check_ct_burden_saturation(
        CtBurdenInput(
            i2n_a=5.0,
            sn_va=10.0,
            alf=20.0,
            dlugosc_przewodu_m=25.0,
            przekroj_przewodu_mm2=4.0,
            obciazenia_aparatow=_CT_ODNIESIENIE.obciazenia_aparatow,
            rct_ohm=0.2,
            alf_wymagany=None,
        )
    )
    assert wynik.status_nasycenia == STATUS_UNAVAILABLE
    assert wynik.zapas_alf is None
    assert READINESS_CT_REQUIRED_ALF_MISSING in wynik.readiness_codes
    # Bilans obciążenia MA podstawę i musi zostać policzony mimo braku wymagania.
    assert wynik.status_obciazenia == STATUS_PASS
    assert wynik.moc_obliczeniowa_va == pytest.approx(8.8878125, abs=1e-12)


def test_ct_braki_danych_daja_status_niedostepny_i_kody() -> None:
    """Brak obwodu i mocy znamionowej ⇒ NIEDOSTĘPNY, zero wartości zastępczych."""
    wynik = check_ct_burden_saturation(
        CtBurdenInput(
            i2n_a=5.0,
            sn_va=None,
            alf=None,
            dlugosc_przewodu_m=None,
            przekroj_przewodu_mm2=4.0,
        )
    )
    assert wynik.status == STATUS_UNAVAILABLE
    assert wynik.is_conclusive is False
    assert wynik.moc_obliczeniowa_va is None
    assert wynik.alf_efektywny is None
    assert READINESS_CT_SECONDARY_CIRCUIT_MISSING in wynik.readiness_codes
    assert READINESS_CT_RATED_BURDEN_MISSING in wynik.readiness_codes
    assert READINESS_CT_ACCURACY_LIMIT_MISSING in wynik.readiness_codes


def test_ct_slad_white_box_ma_kroki_z_podstawieniem() -> None:
    """Ślad WHITE BOX niesie pięć pól kanonu i wszystkie kroki rachunku."""
    wynik = check_ct_burden_saturation(_CT_ODNIESIENIE)
    klucze = [krok["key"] for krok in wynik.white_box_trace]
    assert klucze == [
        "ct_rezystancja_przewodow",
        "ct_bilans_mocy",
        "ct_wykorzystanie_mocy",
        "ct_alf_efektywny",
        "ct_werdykt_nasycenia",
    ]
    for krok in wynik.white_box_trace:
        assert set(krok) >= {"step", "key", "title", "formula_latex", "inputs", "result", "notes"}
        assert krok["formula_latex"].startswith("$$")
    krok_rp = wynik.white_box_trace[0]
    # Ślad zapisuje wielkości z zaokrągleniem do 6 miejsc (determinizm zapisu):
    # 0,2155125 Ω → 0,215512 Ω. Tolerancja obejmuje właśnie to zaokrąglenie.
    assert krok_rp["result"]["rp_ohm"]["value"] == pytest.approx(0.2155125, abs=1e-6)
    assert krok_rp["result"]["rp_ohm"]["unit"] == "Ω"


def test_ct_determinizm_dwa_biegi_identyczne() -> None:
    """Dwa biegi tego samego wejścia dają identyczny wynik i identyczny ślad."""
    a = check_ct_burden_saturation(_CT_ODNIESIENIE)
    b = check_ct_burden_saturation(_CT_ODNIESIENIE)
    assert a == b
    assert a.white_box_trace == b.white_box_trace


@pytest.mark.parametrize(
    ("klasa", "oczekiwany"),
    [
        ("5P20", 20),
        ("5P10", 10),
        ("10P10", 10),
        ("5PR10", 10),
        ("0.5", None),
        ("0.2S", None),
        (None, None),
        ("", None),
    ],
)
def test_ct_alf_z_klasy_katalogowej(klasa: str | None, oczekiwany: int | None) -> None:
    """Współczynnik graniczny czytany z oznaczenia klasy, nie zgadywany."""
    assert alf_z_klasy(klasa) == oczekiwany


# ---------------------------------------------------------------------------
# Zdolnosc 2 — bilans wtorny i ΔU obwodu VT (IEC 61869-3)
# ---------------------------------------------------------------------------

# RACHUNEK RECZNY (przypadek odniesienia VT):
#   ρ = 0,017241 Ω·mm²/m, L = 40 m, s = 2,5 mm²
#   Rp = 2·0,017241·40 / 2,5 = 1,37928 / 2,5   = 0,551712 Ω
#   Aparaty: 8 + 4                              = 12 VA
#   Sn = 30 VA  ⇒  wykorzystanie = 0,4          → PASS
#   U2n = 100 V ⇒ I2 = 12/100                   = 0,12 A
#   ΔU = 0,12 · 0,551712                        = 0,06620544 V
#   ΔU% = 0,06620544/100 · 100                  = 0,06620544 %
#   Limit uzwojenia POMIAROWEGO = 0,5 %          → PASS
_VT_ODNIESIENIE = VtBurdenInput(
    u2n_v=100.0,
    sn_va=30.0,
    kategoria_uzwojenia=KATEGORIA_POMIAROWA,
    dlugosc_przewodu_m=40.0,
    przekroj_przewodu_mm2=2.5,
    obciazenia_aparatow=(
        VtDeviceBurden(nazwa="Licznik energii", moc_va=8.0),
        VtDeviceBurden(nazwa="Woltomierz", moc_va=4.0),
    ),
)


def test_vt_wartosci_posrednie_z_rachunku_recznego() -> None:
    wynik = check_vt_burden_voltage_drop(_VT_ODNIESIENIE)

    assert wynik.rezystancja_przewodow_ohm == pytest.approx(0.551712, abs=1e-12)
    assert wynik.moc_aparatow_va == pytest.approx(12.0, abs=1e-12)
    assert wynik.moc_obliczeniowa_va == pytest.approx(12.0, abs=1e-12)
    assert wynik.wykorzystanie_mocy == pytest.approx(0.4, abs=1e-12)
    assert wynik.prad_obwodu_a == pytest.approx(0.12, abs=1e-12)
    assert wynik.delta_u_v == pytest.approx(0.06620544, abs=1e-12)
    assert wynik.delta_u_procent == pytest.approx(0.06620544, abs=1e-12)
    assert wynik.limit_delta_u_procent == 0.5
    assert wynik.status_obciazenia == STATUS_PASS
    assert wynik.status_spadku == STATUS_PASS
    assert wynik.status == STATUS_PASS


def test_vt_limit_zalezy_od_kategorii_uzwojenia() -> None:
    """Ten sam obwód: FAIL dla pomiarowego (0,5 %), PASS dla zabezpieczeniowego (1,0 %).

    RACHUNEK RĘCZNY: L = 150 m, s = 1,5 mm² ⇒ Rp = 2·0,017241·150/1,5 = 3,4482 Ω;
    S2obl = 25 VA, U2n = 100 V ⇒ I2 = 0,25 A; ΔU = 0,86205 V ⇒ ΔU% = 0,86205 %.
    """
    wspolne = {
        "u2n_v": 100.0,
        "sn_va": 30.0,
        "dlugosc_przewodu_m": 150.0,
        "przekroj_przewodu_mm2": 1.5,
        "obciazenia_aparatow": (VtDeviceBurden(nazwa="Licznik energii", moc_va=25.0),),
    }
    pomiarowe = check_vt_burden_voltage_drop(
        VtBurdenInput(kategoria_uzwojenia=KATEGORIA_POMIAROWA, **wspolne)  # type: ignore[arg-type]
    )
    zabezpieczeniowe = check_vt_burden_voltage_drop(
        VtBurdenInput(kategoria_uzwojenia=KATEGORIA_ZABEZPIECZENIOWA, **wspolne)  # type: ignore[arg-type]
    )

    assert pomiarowe.rezystancja_przewodow_ohm == pytest.approx(3.4482, abs=1e-12)
    assert pomiarowe.prad_obwodu_a == pytest.approx(0.25, abs=1e-12)
    assert pomiarowe.delta_u_v == pytest.approx(0.86205, abs=1e-12)
    assert pomiarowe.delta_u_procent == pytest.approx(0.86205, abs=1e-12)
    assert pomiarowe.limit_delta_u_procent == 0.5
    assert pomiarowe.status_spadku == STATUS_FAIL

    assert zabezpieczeniowe.delta_u_procent == pytest.approx(0.86205, abs=1e-12)
    assert zabezpieczeniowe.limit_delta_u_procent == 1.0
    assert zabezpieczeniowe.status_spadku == STATUS_PASS


def test_vt_brak_kategorii_nie_przyjmuje_limitu() -> None:
    """Nierozpoznana kategoria ⇒ brak limitu + kod gotowości (zero domysłu)."""
    wynik = check_vt_burden_voltage_drop(
        VtBurdenInput(
            u2n_v=100.0,
            sn_va=30.0,
            kategoria_uzwojenia=None,
            dlugosc_przewodu_m=40.0,
            przekroj_przewodu_mm2=2.5,
            obciazenia_aparatow=_VT_ODNIESIENIE.obciazenia_aparatow,
        )
    )
    assert wynik.limit_delta_u_procent is None
    assert wynik.status_spadku == STATUS_UNAVAILABLE
    assert READINESS_VT_WINDING_CATEGORY_MISSING in wynik.readiness_codes
    # ΔU jest policzone — brakuje tylko odniesienia normatywnego.
    assert wynik.delta_u_procent == pytest.approx(0.06620544, abs=1e-12)


def test_vt_brak_obwodu_daje_status_niedostepny() -> None:
    wynik = check_vt_burden_voltage_drop(
        VtBurdenInput(
            u2n_v=100.0,
            sn_va=30.0,
            kategoria_uzwojenia=KATEGORIA_POMIAROWA,
            dlugosc_przewodu_m=None,
            przekroj_przewodu_mm2=None,
        )
    )
    assert wynik.status == STATUS_UNAVAILABLE
    assert wynik.delta_u_procent is None
    assert READINESS_VT_SECONDARY_CIRCUIT_MISSING in wynik.readiness_codes


def test_vt_slad_white_box_i_determinizm() -> None:
    a = check_vt_burden_voltage_drop(_VT_ODNIESIENIE)
    b = check_vt_burden_voltage_drop(_VT_ODNIESIENIE)
    assert a == b
    klucze = [krok["key"] for krok in a.white_box_trace]
    assert klucze == [
        "vt_bilans_mocy",
        "vt_rezystancja_przewodow",
        "vt_prad_obwodu",
        "vt_zmiana_napiecia",
        "vt_werdykt_spadku",
    ]
    assert a.white_box_trace[3]["result"]["delta_u_v"]["value"] == pytest.approx(0.066205, abs=1e-6)


@pytest.mark.parametrize(
    ("klasa", "oczekiwana"),
    [
        ("0.5", KATEGORIA_POMIAROWA),
        ("0,5", KATEGORIA_POMIAROWA),
        ("0.2S", KATEGORIA_POMIAROWA),
        ("3P", KATEGORIA_ZABEZPIECZENIOWA),
        ("6P", KATEGORIA_ZABEZPIECZENIOWA),
        ("XYZ", None),
        (None, None),
    ],
)
def test_vt_kategoria_z_klasy(klasa: str | None, oczekiwana: str | None) -> None:
    assert kategoria_z_klasy(klasa) == oczekiwana


# ---------------------------------------------------------------------------
# Zdolnosc 3 — starzenie termiczne izolacji kabla (regula Montsingera)
# ---------------------------------------------------------------------------


def test_kabel_starzenie_podwaja_sie_co_dziesiec_stopni() -> None:
    """RACHUNEK RĘCZNY: XLPE θ_zn = 90 °C, θ = 100 °C ⇒ ΔT = 10, V = 2^1 = 2,0."""
    wynik = check_cable_thermal_aging(
        CableThermalAgingInput(
            temperatura_pracy_c=100.0,
            temperatura_znamionowa_c=90.0,
            typ_izolacji="XLPE",
        )
    )
    assert wynik.roznica_temperatur_c == pytest.approx(10.0, abs=1e-12)
    assert wynik.wspolczynnik_starzenia == pytest.approx(2.0, abs=1e-12)
    assert wynik.wzgledna_zywotnosc == pytest.approx(0.5, abs=1e-12)
    assert wynik.status == STATUS_FAIL


def test_kabel_praca_ponizej_znamionowej_wydluza_zywotnosc() -> None:
    """RACHUNEK RĘCZNY: ΔT = −5 ⇒ V = 2^(−0,5) = 0,7071067811865476; L = 1,41421356."""
    wynik = check_cable_thermal_aging(
        CableThermalAgingInput(
            temperatura_pracy_c=85.0,
            temperatura_znamionowa_c=90.0,
            typ_izolacji="XLPE",
        )
    )
    assert wynik.roznica_temperatur_c == pytest.approx(-5.0, abs=1e-12)
    assert wynik.wspolczynnik_starzenia == pytest.approx(0.7071067811865476, abs=1e-12)
    assert wynik.wzgledna_zywotnosc == pytest.approx(math.sqrt(2.0), abs=1e-12)
    assert wynik.status == STATUS_PASS


def test_kabel_temperatura_odniesienia_pochodzi_z_katalogu() -> None:
    """Ta sama temperatura pracy, inna izolacja ⇒ inny wynik (PVC 70 °C).

    RACHUNEK RĘCZNY: θ = 85 °C, θ_zn = 70 °C ⇒ ΔT = 15 ⇒ V = 2^1,5 = 2,8284271247.
    """
    wynik = check_cable_thermal_aging(
        CableThermalAgingInput(
            temperatura_pracy_c=85.0,
            temperatura_znamionowa_c=70.0,
            typ_izolacji="PVC",
        )
    )
    assert wynik.wspolczynnik_starzenia == pytest.approx(2.8284271247461903, abs=1e-12)
    assert wynik.temperatura_znamionowa_c == 70.0
    assert wynik.typ_izolacji == "PVC"
    assert wynik.status == STATUS_FAIL


def test_kabel_brak_izolacji_lub_temperatury_daje_kody_gotowosci() -> None:
    bez_izolacji = check_cable_thermal_aging(
        CableThermalAgingInput(
            temperatura_pracy_c=85.0, temperatura_znamionowa_c=None, typ_izolacji=None
        )
    )
    assert bez_izolacji.status == STATUS_UNAVAILABLE
    assert bez_izolacji.wspolczynnik_starzenia is None
    assert READINESS_CABLE_INSULATION_DATA_MISSING in bez_izolacji.readiness_codes

    bez_temperatury = check_cable_thermal_aging(
        CableThermalAgingInput(
            temperatura_pracy_c=None, temperatura_znamionowa_c=90.0, typ_izolacji="XLPE"
        )
    )
    assert bez_temperatury.status == STATUS_UNAVAILABLE
    assert READINESS_CABLE_OPERATING_TEMPERATURE_MISSING in bez_temperatury.readiness_codes


def test_kabel_slad_white_box_i_determinizm() -> None:
    dane = CableThermalAgingInput(
        temperatura_pracy_c=100.0, temperatura_znamionowa_c=90.0, typ_izolacji="XLPE"
    )
    a = check_cable_thermal_aging(dane)
    b = check_cable_thermal_aging(dane)
    assert a == b
    klucze = [krok["key"] for krok in a.white_box_trace]
    assert klucze == [
        "kabel_roznica_temperatur",
        "kabel_wspolczynnik_starzenia",
        "kabel_wzgledna_zywotnosc",
    ]
    assert a.white_box_trace[1]["result"]["wspolczynnik"]["value"] == pytest.approx(2.0)


# ---------------------------------------------------------------------------
# Zdolnosc 4 — straty transformatora i optymalne β
# ---------------------------------------------------------------------------


def test_trafo_straty_i_beta_optymalne_z_rachunku_recznego() -> None:
    """RACHUNEK RĘCZNY: P0 = 1,1 kW, Pk = 10,5 kW, β = 0,6.

    ΔP  = 1,1 + 0,6²·10,5 = 1,1 + 3,78          = 4,88 kW
    β_opt = √(1,1/10,5) = √0,104761904761...     = 0,3236694374850748
    ΔP(β_opt) = 1,1 + 0,1047619047·10,5 = 1,1 + 1,1 = 2,2 kW
    udział strat jałowych = 1,1/4,88             = 0,2254098360655738
    S = 0,6 · 0,63 MVA                            = 0,378 MVA
    """
    wynik = compute_transformer_losses(
        TransformerLossesInput(p0_kw=1.1, pk_kw=10.5, beta=0.6, sn_mva=0.63)
    )
    assert wynik.straty_jalowe_kw == pytest.approx(1.1, abs=1e-12)
    assert wynik.straty_obciazeniowe_kw == pytest.approx(3.78, abs=1e-12)
    assert wynik.straty_calkowite_kw == pytest.approx(4.88, abs=1e-12)
    assert wynik.beta_optymalny == pytest.approx(0.3236694374850748, abs=1e-12)
    assert wynik.straty_przy_beta_opt_kw == pytest.approx(2.2, abs=1e-12)
    assert wynik.udzial_strat_jalowych == pytest.approx(0.2254098360655738, abs=1e-12)
    assert wynik.moc_obciazenia_mva == pytest.approx(0.378, abs=1e-12)
    assert wynik.status == STATUS_PASS


def test_trafo_w_punkcie_optymalnym_obie_skladowe_rowne() -> None:
    """Warunek minimum: przy β = β_opt straty obciążeniowe = straty jałowe."""
    wynik = compute_transformer_losses(
        TransformerLossesInput(p0_kw=1.1, pk_kw=10.5, beta=math.sqrt(1.1 / 10.5), sn_mva=None)
    )
    assert wynik.straty_obciazeniowe_kw == pytest.approx(wynik.straty_jalowe_kw, abs=1e-12)
    assert wynik.straty_calkowite_kw == pytest.approx(2.2, abs=1e-12)


def test_trafo_braki_danych_daja_kody_gotowosci() -> None:
    bez_strat = compute_transformer_losses(TransformerLossesInput(p0_kw=None, pk_kw=10.5, beta=0.6))
    assert bez_strat.status == STATUS_UNAVAILABLE
    assert bez_strat.straty_calkowite_kw is None
    assert READINESS_TRANSFORMER_LOSS_DATA_MISSING in bez_strat.readiness_codes

    bez_bety = compute_transformer_losses(TransformerLossesInput(p0_kw=1.1, pk_kw=10.5, beta=None))
    assert bez_bety.status == STATUS_UNAVAILABLE
    assert READINESS_TRANSFORMER_LOADING_FACTOR_MISSING in bez_bety.readiness_codes


def test_trafo_slad_white_box_i_determinizm() -> None:
    dane = TransformerLossesInput(p0_kw=1.1, pk_kw=10.5, beta=0.6, sn_mva=0.63)
    a = compute_transformer_losses(dane)
    b = compute_transformer_losses(dane)
    assert a == b
    klucze = [krok["key"] for krok in a.white_box_trace]
    assert klucze == [
        "trafo_moc_obciazenia",
        "trafo_straty_calkowite",
        "trafo_beta_optymalne",
    ]
    assert a.white_box_trace[1]["result"]["straty_calkowite_kw"]["value"] == pytest.approx(4.88)
    assert a.white_box_trace[2]["result"]["beta_opt"]["value"] == pytest.approx(0.323669, abs=1e-6)


# ---------------------------------------------------------------------------
# Kody gotowosci sa KANONICZNE (rejestr domeny), nie lokalnymi napisami
# ---------------------------------------------------------------------------


def test_kody_gotowosci_sa_zarejestrowane_w_kanonie() -> None:
    """Każdy kod z tych czterech kryteriów musi istnieć w rejestrze domeny.

    Bez tego kod nie ma polskiego komunikatu ani akcji naprawczej — UI
    pokazałaby surowy identyfikator, czyli kod produkcyjny w tekście dla inżyniera.
    """
    from domain.canonical_operations import READINESS_CODES

    kody = {
        READINESS_CT_SECONDARY_CIRCUIT_MISSING,
        READINESS_CT_RATED_BURDEN_MISSING,
        READINESS_CT_ACCURACY_LIMIT_MISSING,
        READINESS_CT_WINDING_RESISTANCE_MISSING,
        READINESS_CT_REQUIRED_ALF_MISSING,
        READINESS_VT_SECONDARY_CIRCUIT_MISSING,
        READINESS_VT_WINDING_CATEGORY_MISSING,
        READINESS_CABLE_INSULATION_DATA_MISSING,
        READINESS_CABLE_OPERATING_TEMPERATURE_MISSING,
        READINESS_TRANSFORMER_LOSS_DATA_MISSING,
        READINESS_TRANSFORMER_LOADING_FACTOR_MISSING,
    }
    brakujace = sorted(kod for kod in kody if kod not in READINESS_CODES)
    assert brakujace == []
    for kod in kody:
        assert READINESS_CODES[kod].message_pl.strip()
