from __future__ import annotations

from application.analyses.protection.catalog.mapper import wymaganie_z_nastaw
from application.analyses.protection.catalog.pipeline import dopasuj_do_aparatu
from application.protection_settings.engine import (
    InstantaneousSettingWindow,
    LocalGenerationDiagnostic,
    DelayedSettings,
    InstantaneousSettings,
    ProtectionSettingsResult,
    SPZAnalysisResult,
    ThermalWithstandResult,
)


def _wynik_hoppela(
    *,
    i_pickup_51_a: float = 120.0,
    t_setting_s: float = 0.6,
    i_inst_50_a: float = 800.0,
) -> ProtectionSettingsResult:
    """Wynik silnika Hoppela (karta W3-C1) — jedyna metodyka nastaw nadprądowych.

    Silnik nie zwraca ``None`` per pole: gdy dane wejściowe brakują,
    `zbuduj_wejscie_nastaw` odmawia PRZED wywołaniem silnika (`BrakDanychNastawError`).
    Fikstura odzwierciedla to: wszystkie pola liczbowe silnika są realnymi liczbami.
    """
    return ProtectionSettingsResult(
        line_id="line-1",
        line_name="Odcinek testowy",
        delayed=DelayedSettings(
            i_setting_a=i_pickup_51_a,
            t_setting_s=t_setting_s,
            i_load_max_a=100.0,
            k_b=1.2,
            sensitivity_ratio=2.0,
            is_valid=True,
            validation_notes=[],
            trace=[],
        ),
        instantaneous=InstantaneousSettings(
            i_setting_a=i_inst_50_a,
            i_min_selectivity_a=i_inst_50_a * 0.9,
            i_max_thermal_a=i_inst_50_a * 1.5,
            i_max_sensitivity_a=i_inst_50_a * 1.3,
            range_valid=True,
            k_b=1.2,
            k_bth=1.1,
            is_valid=True,
            validation_notes=[],
            trace=[],
        ),
        thermal=ThermalWithstandResult(
            i_th_dop_a=5000.0,
            j_thn=94.0,
            cross_section_mm2=120.0,
            t_fault_s=0.37,
            ik_max_a=4000.0,
            is_adequate=True,
            margin_percent=20.0,
            trace=[],
        ),
        spz=SPZAnalysisResult(
            spz_allowed=True,
            total_fault_time_s=0.6,
            i_th_required_a=4000.0,
            i_th_available_a=5000.0,
            blocking_recommended=False,
            trace=[],
        ),
        # W3-C2 (2026-09-09) rozszerzyla wynik Hoppla o diagnostyke generacji lokalnej
        # i okno nastaw I>> — pola WYMAGANE; helper buduje wynik bez E-L (aktywna=False,
        # zera = brak wkladu zrodla lokalnego, nie fabrykacja pomiaru) i okno spojne
        # z `instantaneous` powyzej (odbior fali 2 W3, 2026-09-10).
        local_generation=LocalGenerationDiagnostic(
            aktywna=False,
            typ_zrodla=None,
            prad_widziany_lacznie_a=0.0,
            wklad_el_a=0.0,
            wklad_systemu_a=0.0,
            udzial_el=None,
            prog_udzialu_zsz=None,
            ryzyko_blokady_zsz=None,
            uwagi_pl=[],
            trace=[],
        ),
        setting_window=InstantaneousSettingWindow(
            i_min_a=i_inst_50_a * 0.9,
            i_max_a=i_inst_50_a * 1.3,
            limiting_criterion_min="selektywnosc",
            limiting_criterion_max="czulosc",
            window_valid=True,
            conflict_pl=None,
            recommendations_pl=[],
            trace=[],
        ),
        overall_valid=True,
        summary_notes=[],
    )


def test_wymaganie_z_nastaw_jest_definite_time_bez_ziemnozwarcia() -> None:
    """Hoppel wyznacza WYŁĄCZNIE stopnie fazowe metodą czasu określonego (DT)."""
    wynik = _wynik_hoppela(i_pickup_51_a=120.0, t_setting_s=0.6, i_inst_50_a=800.0)
    wymaganie = wymaganie_z_nastaw(wynik)

    assert wymaganie.curve == "DT"
    assert wymaganie.i_pickup_51_a == 120.0
    assert wymaganie.tms_51 is None
    assert wymaganie.t_51_s == 0.6
    assert wymaganie.i_inst_50_a == 800.0
    # Ziemnozwarciowe — Hoppel ich nie wyznacza; `None` = niewyznaczalna (V12K-189),
    # nie fabrykowany brak wymagania.
    assert wymaganie.i_pickup_51n_a is None
    assert wymaganie.tms_51n is None
    assert wymaganie.i_inst_50n_a is None


def test_vendor_mapping_for_real_abb_device_is_deterministic() -> None:
    """Zabezpieczenie realnego producenta (ABB Relion, DT-owa rodzina) mapuje się
    na jego konwencję nastaw — dobór jest funkcją CZYSTĄ (bez biegu/koperty)."""
    wymaganie = wymaganie_z_nastaw(_wynik_hoppela())

    wynik1 = dopasuj_do_aparatu(wymaganie, device_id="ABB_REF615")
    wynik2 = dopasuj_do_aparatu(wymaganie, device_id="ABB_REF615")

    assert wynik1 == wynik2  # czysta funkcja: te same wejścia = ten sam wynik

    vendor_mapping = wynik1["vendor_mapping"]
    assert vendor_mapping["vendor"] == "ABB"
    assert vendor_mapping["vendor_violations"] == []
    vendor_settings = vendor_mapping["vendor_settings"]
    assert "ABB.OC.I51_PICKUP_A" in vendor_settings
    assert "ABB.OC.T51_DELAY_S" in vendor_settings
    assert "ABB.OC.I50_HIGHSET_A" in vendor_settings
    # Metoda Hoppela nie stawia ziemnozwarcia — aparat NIE dostaje kluczy EF,
    # nawet jeśli sam je obsługuje (bezwarunkowe indeksowanie było defektem,
    # który ta karta naprawia: KAŻDE wymaganie z Hoppela wywalałoby dawny adapter).
    assert "ABB.EF.I51N_PICKUP_A" not in vendor_settings
    assert "ABB.EF.I50N_HIGHSET_A" not in vendor_settings
    assert wynik1["compatible"] is True
    assert wynik1["status"] == "SUCCEEDED"


def test_vendor_mapping_for_reference_profile_is_not_applicable() -> None:
    """Profil referencyjny bez marki (karta FAB-A/D-33) nie ma vendor-adaptera —
    brak producenta jest ZAMIERZONY, więc brak mapowania NIE jest naruszeniem.

    ``REF-OC-100`` nie deklaruje krzywej DT (profil czysto odwrotnoczasowy) —
    wymaganie Hoppela (DT) jest więc NIEZGODNE elektrycznie z tym konkretnym
    profilem; brak marki i niekompatybilność krzywej to dwie NIEZALEŻNE osie
    tego samego wyniku, więc test sprawdza obie osobno.
    """
    wymaganie = wymaganie_z_nastaw(_wynik_hoppela())

    wynik = dopasuj_do_aparatu(wymaganie, device_id="REF-OC-100")

    assert wynik["compatible"] is False
    assert "UNSUPPORTED_CURVE" in wynik["violations"]
    vendor_mapping = wynik["vendor_mapping"]
    assert vendor_mapping["vendor"] is None
    assert vendor_mapping["vendor_violations"] == []
    assert vendor_mapping["vendor_settings"] == {}
    assert vendor_mapping["vendor_assumptions"] == [
        "VENDOR_MAPPING_NOT_APPLICABLE_REFERENCE_PROFILE"
    ]
