"""Katalog 12 referencyjnych turbin wiatrowych (PR-11).

Każda turbina ma:
- producenta i model
- typ konwertera (DFIG / full_converter / SCIG)
- moc znamionową
- napięcie generatora
- parametry zwarciowe
- krzywe FRT/HVRT (placeholder do PR-16 RMS solver)
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class WindTurbineCatalogEntry(BaseModel):
    """Pojedyncza pozycja katalogu turbin wiatrowych."""

    catalog_id: str
    manufacturer: str
    model: str
    converter_type: Literal["DFIG", "full_converter", "SCIG", "hydraulic", "WRIG"]
    nominal_power_kw: float
    nominal_voltage_kv: float  # napięcie generatora
    rotor_diameter_m: float
    hub_height_m: float
    cut_in_wind_speed_m_s: float
    cut_out_wind_speed_m_s: float
    rated_wind_speed_m_s: float
    # Parametry elektryczne (uproszczone — pełne w PR-16)
    short_circuit_current_pu: float  # I_k" w p.u. mocy znamionowej
    fault_current_contribution_pu: float  # I_short pod FRT
    voltage_control_capable: bool
    p_f_droop_capable: bool
    # Profil dynamiczny IEC 61400-27 (default per converter_type, override możliwy)
    dynamic_profile_id: str | None = None
    """Referencja do profilu w `der_dynamic` (default mapowany z converter_type).

    None → resolver dobiera default_wind_type_X (1: SCIG, 2: WRIG/hydraulic,
    3: DFIG, 4: full_converter) — żadna turbina nie zostanie bez modelu.
    """


# 12 referencyjnych turbin (per brief 2 §12 Karta 1):

WIND_TURBINES: list[WindTurbineCatalogEntry] = [
    # === Vestas (Dania) ===
    WindTurbineCatalogEntry(
        catalog_id="vestas_v90_2mw",
        manufacturer="Vestas",
        model="V90-2.0 MW",
        converter_type="DFIG",
        nominal_power_kw=2000,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=90,
        hub_height_m=80,
        cut_in_wind_speed_m_s=4.0,
        cut_out_wind_speed_m_s=25.0,
        rated_wind_speed_m_s=13.0,
        short_circuit_current_pu=2.5,
        fault_current_contribution_pu=1.2,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    WindTurbineCatalogEntry(
        catalog_id="vestas_v112_3_45mw",
        manufacturer="Vestas",
        model="V112-3.45 MW",
        converter_type="full_converter",
        nominal_power_kw=3450,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=112,
        hub_height_m=94,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=25.0,
        rated_wind_speed_m_s=12.0,
        short_circuit_current_pu=1.2,
        fault_current_contribution_pu=1.1,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    WindTurbineCatalogEntry(
        catalog_id="vestas_v150_4_2mw",
        manufacturer="Vestas",
        model="V150-4.2 MW",
        converter_type="full_converter",
        nominal_power_kw=4200,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=150,
        hub_height_m=105,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=25.0,
        rated_wind_speed_m_s=11.5,
        short_circuit_current_pu=1.2,
        fault_current_contribution_pu=1.1,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    # === Siemens Gamesa (Hiszpania/Niemcy) ===
    WindTurbineCatalogEntry(
        catalog_id="siemens_sg_4_5_145",
        manufacturer="Siemens Gamesa",
        model="SG 4.5-145",
        converter_type="full_converter",
        nominal_power_kw=4500,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=145,
        hub_height_m=107.5,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=25.0,
        rated_wind_speed_m_s=12.0,
        short_circuit_current_pu=1.2,
        fault_current_contribution_pu=1.1,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    WindTurbineCatalogEntry(
        catalog_id="siemens_sg_5_0_155",
        manufacturer="Siemens Gamesa",
        model="SG 5.0-155",
        converter_type="full_converter",
        nominal_power_kw=5000,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=155,
        hub_height_m=120,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=25.0,
        rated_wind_speed_m_s=11.0,
        short_circuit_current_pu=1.2,
        fault_current_contribution_pu=1.1,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    WindTurbineCatalogEntry(
        catalog_id="siemens_sg_6_6_170",
        manufacturer="Siemens Gamesa",
        model="SG 6.6-170",
        converter_type="full_converter",
        nominal_power_kw=6600,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=170,
        hub_height_m=135,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=25.0,
        rated_wind_speed_m_s=10.5,
        short_circuit_current_pu=1.2,
        fault_current_contribution_pu=1.1,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    # === GE (USA) ===
    WindTurbineCatalogEntry(
        catalog_id="ge_3_6_137",
        manufacturer="GE Renewable Energy",
        model="3.6-137",
        converter_type="DFIG",
        nominal_power_kw=3600,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=137,
        hub_height_m=110,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=25.0,
        rated_wind_speed_m_s=11.5,
        short_circuit_current_pu=2.3,
        fault_current_contribution_pu=1.2,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    WindTurbineCatalogEntry(
        catalog_id="ge_5_0_158",
        manufacturer="GE Renewable Energy",
        model="5.0-158 Cypress",
        converter_type="full_converter",
        nominal_power_kw=5000,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=158,
        hub_height_m=120,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=25.0,
        rated_wind_speed_m_s=11.0,
        short_circuit_current_pu=1.2,
        fault_current_contribution_pu=1.1,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    # === Nordex (Niemcy) ===
    WindTurbineCatalogEntry(
        catalog_id="nordex_n131_3_9mw",
        manufacturer="Nordex",
        model="N131/3900",
        converter_type="DFIG",
        nominal_power_kw=3900,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=131,
        hub_height_m=114,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=25.0,
        rated_wind_speed_m_s=12.0,
        short_circuit_current_pu=2.4,
        fault_current_contribution_pu=1.2,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    WindTurbineCatalogEntry(
        catalog_id="nordex_n149_5_7mw",
        manufacturer="Nordex",
        model="N149/5.7",
        converter_type="full_converter",
        nominal_power_kw=5700,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=149,
        hub_height_m=125,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=25.0,
        rated_wind_speed_m_s=11.0,
        short_circuit_current_pu=1.2,
        fault_current_contribution_pu=1.1,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    # === Enercon (Niemcy) ===
    WindTurbineCatalogEntry(
        catalog_id="enercon_e126_7_5mw",
        manufacturer="Enercon",
        model="E-126/7.5",
        converter_type="full_converter",
        nominal_power_kw=7500,
        nominal_voltage_kv=0.4,
        rotor_diameter_m=126,
        hub_height_m=135,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=28.0,
        rated_wind_speed_m_s=14.0,
        short_circuit_current_pu=1.1,
        fault_current_contribution_pu=1.0,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    WindTurbineCatalogEntry(
        catalog_id="enercon_e138_4_2mw",
        manufacturer="Enercon",
        model="E-138 EP3 E2",
        converter_type="full_converter",
        nominal_power_kw=4200,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=138.6,
        hub_height_m=131,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=28.0,
        rated_wind_speed_m_s=12.5,
        short_circuit_current_pu=1.1,
        fault_current_contribution_pu=1.0,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    # === Vestas EnVentus (2024+) ===
    WindTurbineCatalogEntry(
        catalog_id="vestas_v162_6_2mw",
        manufacturer="Vestas",
        model="V162-6.2 MW EnVentus",
        converter_type="full_converter",
        nominal_power_kw=6200,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=162,
        hub_height_m=149,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=25.0,
        rated_wind_speed_m_s=11.5,
        short_circuit_current_pu=1.2,
        fault_current_contribution_pu=1.1,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    # === Siemens Gamesa SG 5.X-145 / SG 6.6-170 ===
    WindTurbineCatalogEntry(
        catalog_id="siemens_gamesa_sg_5x_145_5mw",
        manufacturer="Siemens Gamesa",
        model="SG 5.X-145 (5.0 MW)",
        converter_type="full_converter",
        nominal_power_kw=5000,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=145,
        hub_height_m=127,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=25.0,
        rated_wind_speed_m_s=11.0,
        short_circuit_current_pu=1.2,
        fault_current_contribution_pu=1.1,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    WindTurbineCatalogEntry(
        catalog_id="siemens_gamesa_sg_6p6_170_6p6mw",
        manufacturer="Siemens Gamesa",
        model="SG 6.6-170",
        converter_type="full_converter",
        nominal_power_kw=6600,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=170,
        hub_height_m=135,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=25.0,
        rated_wind_speed_m_s=11.0,
        short_circuit_current_pu=1.2,
        fault_current_contribution_pu=1.1,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    # === GE Cypress / Vernova Sierra (2024+) ===
    WindTurbineCatalogEntry(
        catalog_id="ge_cypress_6_0_164",
        manufacturer="GE Renewable Energy",
        model="6.0-164 Cypress",
        converter_type="full_converter",
        nominal_power_kw=6000,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=164,
        hub_height_m=140,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=25.0,
        rated_wind_speed_m_s=11.5,
        short_circuit_current_pu=1.2,
        fault_current_contribution_pu=1.1,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    # === Goldwind (Chiny) — full converter PMSM, popularne globalnie ===
    WindTurbineCatalogEntry(
        catalog_id="goldwind_gw_165_6mw",
        manufacturer="Goldwind",
        model="GW 165-6.0 MW PMDD",
        converter_type="full_converter",
        nominal_power_kw=6000,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=165,
        hub_height_m=130,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=25.0,
        rated_wind_speed_m_s=11.5,
        short_circuit_current_pu=1.2,
        fault_current_contribution_pu=1.1,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    # === MingYang (offshore-class, full converter SCADA-grade) ===
    WindTurbineCatalogEntry(
        catalog_id="mingyang_my_8p3_180",
        manufacturer="MingYang",
        model="MySE 8.3-180 (offshore)",
        converter_type="full_converter",
        nominal_power_kw=8300,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=180,
        hub_height_m=125,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=25.0,
        rated_wind_speed_m_s=10.5,
        short_circuit_current_pu=1.2,
        fault_current_contribution_pu=1.1,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
    # === Senvion (legacy DFIG) — używana w Polsce ===
    WindTurbineCatalogEntry(
        catalog_id="senvion_3_4m_122",
        manufacturer="Senvion",
        model="3.4M122",
        converter_type="DFIG",
        nominal_power_kw=3400,
        nominal_voltage_kv=0.69,
        rotor_diameter_m=122,
        hub_height_m=119,
        cut_in_wind_speed_m_s=3.0,
        cut_out_wind_speed_m_s=22.0,
        rated_wind_speed_m_s=12.0,
        short_circuit_current_pu=2.4,
        fault_current_contribution_pu=1.2,
        voltage_control_capable=True,
        p_f_droop_capable=True,
    ),
]


WIND_TURBINE_CATALOG: dict[str, WindTurbineCatalogEntry] = {t.catalog_id: t for t in WIND_TURBINES}


def list_wind_turbines() -> list[WindTurbineCatalogEntry]:
    """Lista wszystkich referencyjnych turbin (deterministyczna kolejność po catalog_id)."""
    return sorted(WIND_TURBINES, key=lambda t: t.catalog_id)


def get_turbine(catalog_id: str) -> WindTurbineCatalogEntry:
    if catalog_id not in WIND_TURBINE_CATALOG:
        available = ", ".join(sorted(WIND_TURBINE_CATALOG.keys()))
        raise KeyError(f"Unknown wind turbine catalog_id: {catalog_id}. Available: {available}")
    return WIND_TURBINE_CATALOG[catalog_id]
