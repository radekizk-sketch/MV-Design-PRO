"""Profile TYPOWE NORMY dla DER — katalog (karta W6-1 SS0 p.3).

8 profili (PV GFL/GFM, BESS GFL/GFM, Wind type 1/2/3/4). KAŻDY niesie
`proweniencja.zrodlo="profil_typowy_normy"` z odniesieniem do normy sankcjonowanej
kartą W6-1 (IEEE 1547-2018 dla PV/BESS, IEC 61400-27-1:2020 dla wiatru, NC RfG
2016/631 gdzie dotyczy) — WYBRANY JAWNIE przez resolver TYLKO gdy projektant albo
wpis katalogu przekształtnika wskaże `profile_id` wprost; stopień dowodowy wyniku
policzonego z takiego profilu jest `DECLARATION` (rejestr A-2), NIGDY
`VALIDATED_SIMULATION` z automatu.

NAPRAWIONA FABRYKACJA (karta W6-1 SS0 p.3): poprzednia wersja tego modułu
deklarowała pochodzenie "Praktyka: SMA Sunny Central, Tesla Megapack, Vestas
V112, GE 5.0-158" — żaden z tych producentów nie dostarczył karty katalogowej
ani certyfikatu dla tych liczb (modele SMA/Tesla/Vestas/GE cytowane wyłącznie w
nazwie `profile_name_pl` jako KONTEKST ilustracyjny klasy urządzenia, nie jako
źródło wartości). Wartości są inżynierskimi profilami TYPOWYMI mieszczącymi się
w zakresach ogólnych modeli generycznych zdefiniowanych przez normy powyżej —
`FieldQuality.ESTIMATED` (nie `DATASHEET`) jest właściwą klasyfikacją każdego
pola tych profili na osi jakości danych (`solver_input/provenance.py`), a
`profil_typowy_normy` jest właściwą klasyfikacją na osi proweniencji bloku
(`enm/dynamika_modele.py`) — DWIE różne, orthogonalne osie, żadna nie mówi
"zmierzone na urządzeniu".

RESOLVER NIE ZWRACA JUŻ ŻADNEGO DOMYŚLNEGO PROFILU BEZ JAWNEGO WYBORU
(`resolver.py`, SS0 p.3: kasacja "ZAWSZE zwraca profil") — te 8 wpisów są
WYŁĄCZNIE rejestrem dostępnym pod `profile_id`, nigdy cichym fallbackiem.
"""

from __future__ import annotations

from enm.dynamika_modele import ProweniencjaParametrow
from network_model.catalog.der_dynamic.models import (
    InverterDynamicProfile,
    WindTurbineDynamicProfile,
)

#: Odniesienie znormalizowane dla profili PV/BESS (falowniki) — SS0 p.2/p.3:
#: IEEE 1547-2018 (limity/droop/FRT ogólne) + NC RfG 2016/631 (klasy B/C/D UE).
_ODNIESIENIE_FALOWNIK = "IEEE 1547-2018 §5-8; Rozporzadzenie (UE) 2016/631 (NC RfG) art. 13-21"
#: Odniesienie znormalizowane dla profili turbin wiatrowych — IEC 61400-27-1
#: definiuje wprost generyczne modele parametryczne typ 1-4.
_ODNIESIENIE_WIATR = "IEC 61400-27-1:2020 (generyczne modele dynamiczne typ 1-4)"


def _profil_typowy_normy(odniesienie: str) -> ProweniencjaParametrow:
    return ProweniencjaParametrow(zrodlo="profil_typowy_normy", odniesienie=odniesienie)


# =============================================================================
# PV — falowniki fotowoltaiczne (IEEE 1547 + NC RfG)
# =============================================================================

DEFAULT_PV_GFL = InverterDynamicProfile(
    profile_id="default_pv_gfl",
    profile_name_pl="Typowy PV grid-following (IEEE 1547 / NC RfG kat. B)",
    der_kind="PV",
    control_mode="grid_following",
    proweniencja=_profil_typowy_normy(_ODNIESIENIE_FALOWNIK),
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
)

DEFAULT_PV_GFM = InverterDynamicProfile(
    profile_id="default_pv_gfm",
    profile_name_pl="Typowy PV grid-forming (IEEE 1547, inercja wirtualna)",
    der_kind="PV",
    control_mode="grid_forming",
    proweniencja=_profil_typowy_normy(_ODNIESIENIE_FALOWNIK),
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
    virtual_inertia_h_s=4.0,  # 4 s typowa inercja wirtualna (wartosc ESTIMATED)
)

# =============================================================================
# BESS — magazyny energii (PCS, IEEE 1547 + NC RfG)
# =============================================================================

DEFAULT_BESS_GFL = InverterDynamicProfile(
    profile_id="default_bess_gfl",
    profile_name_pl="Typowy BESS grid-following (PCS standardowy)",
    der_kind="BESS",
    control_mode="grid_following",
    proweniencja=_profil_typowy_normy(_ODNIESIENIE_FALOWNIK),
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
)

DEFAULT_BESS_GFM = InverterDynamicProfile(
    profile_id="default_bess_gfm",
    profile_name_pl="Typowy BESS grid-forming (PCS, inercja wirtualna)",
    der_kind="BESS",
    control_mode="grid_forming",
    proweniencja=_profil_typowy_normy(_ODNIESIENIE_FALOWNIK),
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
    virtual_inertia_h_s=6.0,  # wartosc ESTIMATED, wieksza inercja niz PV GFM
)

# =============================================================================
# FW — turbiny wiatrowe (IEC 61400-27-1)
# =============================================================================

DEFAULT_WIND_TYPE_1 = WindTurbineDynamicProfile(
    profile_id="default_wind_type_1",
    profile_name_pl="Typowy SCIG (IEC 61400-27 type 1)",
    iec_type="type_1",
    proweniencja=_profil_typowy_normy(_ODNIESIENIE_WIATR),
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
    v_min_continuous_pu=0.85,
    v_max_continuous_pu=1.10,
)

DEFAULT_WIND_TYPE_2 = WindTurbineDynamicProfile(
    profile_id="default_wind_type_2",
    profile_name_pl="Typowy WRIG z rezystancja w wirniku (IEC 61400-27 type 2)",
    iec_type="type_2",
    proweniencja=_profil_typowy_normy(_ODNIESIENIE_WIATR),
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
    v_min_continuous_pu=0.85,
    v_max_continuous_pu=1.10,
)

DEFAULT_WIND_TYPE_3 = WindTurbineDynamicProfile(
    profile_id="default_wind_type_3",
    profile_name_pl="Typowy DFIG (IEC 61400-27 type 3)",
    iec_type="type_3",
    proweniencja=_profil_typowy_normy(_ODNIESIENIE_WIATR),
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
    v_min_continuous_pu=0.85,
    v_max_continuous_pu=1.10,
)

DEFAULT_WIND_TYPE_4 = WindTurbineDynamicProfile(
    profile_id="default_wind_type_4",
    profile_name_pl="Typowy PMSG full-converter (IEC 61400-27 type 4)",
    iec_type="type_4",
    proweniencja=_profil_typowy_normy(_ODNIESIENIE_WIATR),
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
    v_min_continuous_pu=0.85,
    v_max_continuous_pu=1.10,
)

# =============================================================================
# Rejestr profili — używany przez resolver (WYŁĄCZNIE po jawnym wskazaniu, patrz
# `resolver.py` — brak wskazania = "brak", nie cichy fallback do tych wartości).
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
