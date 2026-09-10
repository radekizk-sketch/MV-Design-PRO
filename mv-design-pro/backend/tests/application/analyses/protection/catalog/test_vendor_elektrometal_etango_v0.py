from __future__ import annotations

import pytest
from application.analyses.protection.catalog.mapper import wymaganie_z_nastaw
from application.analyses.protection.catalog.pipeline import dopasuj_do_aparatu
from application.protection_settings.engine import (
    DelayedSettings,
    InstantaneousSettings,
    InstantaneousSettingWindow,
    LocalGenerationDiagnostic,
    ProtectionSettingsResult,
    SPZAnalysisResult,
    ThermalWithstandResult,
)


def _wynik_hoppela() -> ProtectionSettingsResult:
    return ProtectionSettingsResult(
        line_id="line-1",
        line_name="Odcinek testowy",
        delayed=DelayedSettings(
            i_setting_a=120.0,
            t_setting_s=0.6,
            i_load_max_a=100.0,
            k_b=1.2,
            sensitivity_ratio=2.0,
            is_valid=True,
            validation_notes=[],
            trace=[],
        ),
        instantaneous=InstantaneousSettings(
            i_setting_a=800.0,
            i_min_selectivity_a=720.0,
            i_max_thermal_a=1200.0,
            i_max_sensitivity_a=1040.0,
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
            i_min_a=800.0 * 0.9,
            i_max_a=800.0 * 1.3,
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


# Rodzina e2TANGO 450/600/800/1000/1200 (karta techniczna producenta, DT wśród
# krzywych deklarowanych) — rodzina LEGACY 400/600/.../2000_V0 (NIEWERYFIKOWANY,
# tylko IEC_NI) nie obsługuje DT: wymaganie Hoppela (curve="DT") jest z definicji
# niezgodne, więc nie nadaje się do testu mapowania kluczy producenta.
@pytest.mark.parametrize("device_id", ["EM_E2TANGO_450", "EM_E2TANGO_1000"])
def test_vendor_mapping_for_elektrometal_dt_devices(device_id: str) -> None:
    wymaganie = wymaganie_z_nastaw(_wynik_hoppela())

    wynik = dopasuj_do_aparatu(wymaganie, device_id=device_id)

    assert wynik["compatible"] is True
    vendor_mapping = wynik["vendor_mapping"]
    assert vendor_mapping["vendor"] == "ELEKTROMETAL"
    assert vendor_mapping["vendor_violations"] == []
    vendor_settings = vendor_mapping["vendor_settings"]
    assert "EM.ETANGO.OC.51.PICKUP_A" in vendor_settings
    assert "EM.ETANGO.OC.51.T_DELAY_S" in vendor_settings
    assert "EM.ETANGO.OC.50.PICKUP_A" in vendor_settings
    # Metoda Hoppela nie stawia ziemnozwarcia — aparat NIE dostaje kluczy EF,
    # nawet jeśli sam je obsługuje (bezwarunkowe indeksowanie było defektem,
    # który ta karta naprawia: KAŻDE wymaganie z Hoppela wywalałoby dawny adapter).
    assert "EM.ETANGO.EF.51N.PICKUP_A" not in vendor_settings
    assert "EM.ETANGO.EF.50N.PICKUP_A" not in vendor_settings


def test_elektrometal_dt_family_rejects_legacy_iec_ni_only_device() -> None:
    """Rodzina legacy (400-2000_V0) deklaruje wyłącznie IEC_NI — wymaganie
    definite-time Hoppela jest z nią niezgodne krzywą, nie fabrykowaną zgodą."""
    wymaganie = wymaganie_z_nastaw(_wynik_hoppela())

    wynik = dopasuj_do_aparatu(wymaganie, device_id="EM_ETANGO_400_V0")

    assert wynik["compatible"] is False
    assert "UNSUPPORTED_CURVE" in wynik["violations"]


def test_elektrometal_vendor_mapping_is_deterministic() -> None:
    wymaganie = wymaganie_z_nastaw(_wynik_hoppela())

    wynik1 = dopasuj_do_aparatu(wymaganie, device_id="EM_E2TANGO_450")
    wynik2 = dopasuj_do_aparatu(wymaganie, device_id="EM_E2TANGO_450")

    assert wynik1 == wynik2
