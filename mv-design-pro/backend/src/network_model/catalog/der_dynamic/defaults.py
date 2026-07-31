"""Domyślne profile dynamiczne DER — produkcja end-to-end.

Każdy DER (PV/BESS/FW) ma gwarantowany profil:
1. **8 default profili**: PV GFL/GFM, BESS GFL/GFM, Wind type 1/2/3/4.
2. Wartości pochodzą z:
   - IEEE 1547-2018 (PV/BESS inverter limits)
   - IEC 61400-27-1:2020 (generic wind models)
   - NC RfG / Komisja UE 2016/631 (FRT/HVRT, P(f), Q(U))
   - Praktyka: SMA Sunny Central, Tesla Megapack, Vestas V112, GE 5.0-158.
3. Resolver w `resolver.py` zawsze zwróci jeden z tych profili (lub
   zarejestrowany dodatkowy w katalogu) — żaden DER nie zostanie bez
   modelu dynamicznego.
"""

from __future__ import annotations

from network_model.catalog.der_dynamic.models import (
    InverterDynamicProfile,
    WindTurbineDynamicProfile,
)

# =============================================================================
# PV — falowniki fotowoltaiczne (IEEE 1547 + NC RfG)
# =============================================================================

DEFAULT_PV_GFL = InverterDynamicProfile(
    profile_id="default_pv_gfl",
    profile_name_pl="Domyślny PV grid-following (IEEE 1547 / NC RfG kat. B)",
    der_kind="PV",
    control_mode="grid_following",
    tp_s=0.05,
    tq_s=0.05,
    p_f_droop_pu=0.04,  # 4% droop typowy dla PV w NC RfG
    p_f_dead_band_hz=0.2,
    q_u_droop_pu=0.10,
    q_u_dead_band_pu=0.02,
    i_max_pu=1.20,
    v_min_continuous_pu=0.85,
    v_max_continuous_pu=1.10,
    frt_response_time_ms=60.0,
    iq_max_during_fault_pu=1.0,
    iq_priority_during_fault=True,
    p_recovery_rate_pu_per_s=0.80,  # 80%/s typowy
    p_recovery_delay_ms=100.0,
    virtual_inertia_h_s=None,  # GFL = brak inercji wirtualnej
    source_reference="IEEE 1547-2018, IEC 62116, NC RfG art. 13–17",
)

DEFAULT_PV_GFM = InverterDynamicProfile(
    profile_id="default_pv_gfm",
    profile_name_pl="Domyślny PV grid-forming (IEEE 1547 + virtual inertia)",
    der_kind="PV",
    control_mode="grid_forming",
    tp_s=0.02,  # szybsza odpowiedź
    tq_s=0.02,
    p_f_droop_pu=0.05,
    p_f_dead_band_hz=0.05,  # mniejsze dead-band (GFM stabilizuje)
    q_u_droop_pu=0.05,
    q_u_dead_band_pu=0.01,
    i_max_pu=1.30,
    v_min_continuous_pu=0.85,
    v_max_continuous_pu=1.10,
    frt_response_time_ms=20.0,  # szybsze (GFM)
    iq_max_during_fault_pu=1.0,
    iq_priority_during_fault=True,
    p_recovery_rate_pu_per_s=2.0,  # GFM odzyskuje szybciej
    p_recovery_delay_ms=50.0,
    virtual_inertia_h_s=4.0,  # 4 s typowa inercja wirtualna
    source_reference="IEEE 2800-2022, MIGRATE H2020, NC RfG",
)

# =============================================================================
# BESS — magazyny energii (PCS, IEEE 2030.2 + NC RfG)
# =============================================================================

DEFAULT_BESS_GFL = InverterDynamicProfile(
    profile_id="default_bess_gfl",
    profile_name_pl="Domyślny BESS grid-following (PCS standardowy)",
    der_kind="BESS",
    control_mode="grid_following",
    tp_s=0.04,
    tq_s=0.04,
    p_f_droop_pu=0.05,
    p_f_dead_band_hz=0.2,
    q_u_droop_pu=0.08,
    q_u_dead_band_pu=0.02,
    i_max_pu=1.20,
    v_min_continuous_pu=0.85,
    v_max_continuous_pu=1.10,
    frt_response_time_ms=50.0,
    iq_max_during_fault_pu=1.0,
    iq_priority_during_fault=True,
    p_recovery_rate_pu_per_s=1.0,  # BESS odzyskuje szybciej niż PV
    p_recovery_delay_ms=80.0,
    virtual_inertia_h_s=None,
    source_reference="IEEE 2030.2-2015, NC RfG, NC HVDC",
)

DEFAULT_BESS_GFM = InverterDynamicProfile(
    profile_id="default_bess_gfm",
    profile_name_pl="Domyślny BESS grid-forming (PCS z virtual inertia)",
    der_kind="BESS",
    control_mode="grid_forming",
    tp_s=0.015,  # bardzo szybki PCS
    tq_s=0.015,
    p_f_droop_pu=0.04,
    p_f_dead_band_hz=0.02,
    q_u_droop_pu=0.04,
    q_u_dead_band_pu=0.01,
    i_max_pu=1.30,
    v_min_continuous_pu=0.85,
    v_max_continuous_pu=1.10,
    frt_response_time_ms=15.0,  # GFM BESS — najszybszy DER
    iq_max_during_fault_pu=1.0,
    iq_priority_during_fault=True,
    p_recovery_rate_pu_per_s=4.0,
    p_recovery_delay_ms=20.0,
    virtual_inertia_h_s=6.0,  # BESS GFM ma większą inercję niż PV GFM
    source_reference="IEEE 2800-2022, IEC TR 63224, ENTSO-E IGD",
)

# =============================================================================
# FW — turbiny wiatrowe (IEC 61400-27-1)
# =============================================================================

DEFAULT_WIND_TYPE_1 = WindTurbineDynamicProfile(
    profile_id="default_wind_type_1",
    profile_name_pl="Domyślny SCIG (IEC 61400-27 type 1)",
    iec_type="type_1",
    h_total_s=3.5,  # SCIG ma niższą inercję
    drive_train_stiffness_pu=60.0,
    tp_s=0.20,  # wolniejsze niż konwertery
    tq_s=0.20,
    pitch_rate_deg_per_s=4.0,  # SCIG ma wolniejszy pitch
    pitch_min_deg=0.0,
    pitch_max_deg=27.0,
    frt_response_time_ms=120.0,
    iq_max_during_fault_pu=0.5,  # SCIG ma ograniczone Iq
    p_recovery_rate_pu_per_s=0.30,
    p_recovery_delay_ms=300.0,
    slip_steady_pu=0.02,
    source_reference="IEC 61400-27-1:2020 type 1A",
)

DEFAULT_WIND_TYPE_2 = WindTurbineDynamicProfile(
    profile_id="default_wind_type_2",
    profile_name_pl="Domyślny WRIG z rezystancją w wirniku (IEC 61400-27 type 2)",
    iec_type="type_2",
    h_total_s=4.0,
    drive_train_stiffness_pu=70.0,
    tp_s=0.15,
    tq_s=0.15,
    pitch_rate_deg_per_s=5.0,
    pitch_min_deg=0.0,
    pitch_max_deg=27.0,
    frt_response_time_ms=100.0,
    iq_max_during_fault_pu=0.6,
    p_recovery_rate_pu_per_s=0.40,
    p_recovery_delay_ms=250.0,
    slip_steady_pu=0.03,
    source_reference="IEC 61400-27-1:2020 type 2",
)

DEFAULT_WIND_TYPE_3 = WindTurbineDynamicProfile(
    profile_id="default_wind_type_3",
    profile_name_pl="Domyślny DFIG (IEC 61400-27 type 3)",
    iec_type="type_3",
    h_total_s=5.0,
    drive_train_stiffness_pu=80.0,
    tp_s=0.10,
    tq_s=0.10,
    pitch_rate_deg_per_s=8.0,
    pitch_min_deg=0.0,
    pitch_max_deg=27.0,
    frt_response_time_ms=80.0,
    iq_max_during_fault_pu=1.0,
    p_recovery_rate_pu_per_s=0.50,
    p_recovery_delay_ms=200.0,
    slip_steady_pu=0.02,
    source_reference="IEC 61400-27-1:2020 type 3 (Vestas V112, Nordex N131)",
)

DEFAULT_WIND_TYPE_4 = WindTurbineDynamicProfile(
    profile_id="default_wind_type_4",
    profile_name_pl="Domyślny PMSG full-converter (IEC 61400-27 type 4)",
    iec_type="type_4",
    h_total_s=6.0,  # PMSG ma większą efektywną inercję
    drive_train_stiffness_pu=50.0,
    tp_s=0.08,
    tq_s=0.08,
    pitch_rate_deg_per_s=10.0,
    pitch_min_deg=0.0,
    pitch_max_deg=27.0,
    frt_response_time_ms=60.0,
    iq_max_during_fault_pu=1.0,
    p_recovery_rate_pu_per_s=0.80,
    p_recovery_delay_ms=150.0,
    slip_steady_pu=0.0,  # PMSG nie ma slip-u
    source_reference="IEC 61400-27-1:2020 type 4 (GE 5.0-158, Enercon E-138)",
)

# =============================================================================
# Rejestr profili — używany przez resolver
# =============================================================================

INVERTER_DYNAMIC_PROFILES: dict[str, InverterDynamicProfile] = {
    p.profile_id: p
    for p in (
        DEFAULT_PV_GFL,
        DEFAULT_PV_GFM,
        DEFAULT_BESS_GFL,
        DEFAULT_BESS_GFM,
    )
}

WIND_DYNAMIC_PROFILES: dict[str, WindTurbineDynamicProfile] = {
    p.profile_id: p
    for p in (
        DEFAULT_WIND_TYPE_1,
        DEFAULT_WIND_TYPE_2,
        DEFAULT_WIND_TYPE_3,
        DEFAULT_WIND_TYPE_4,
    )
}
