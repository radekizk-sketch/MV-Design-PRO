"""Katalog referencyjnych turbin wiatrowych — 19 pozycji.

Kazda pozycja ma producenta i model (etykieta), typ przeksztaltnika (DFIG /
full_converter / SCIG / hydraulic / WRIG), moc znamionowa, napiecie generatora,
geometrie wirnika, predkosci wiatru i parametry zwarciowe (I_k'' i wklad pod FRT w p.u.).

PROWENIENCJA (karta KATALOG-KOMPLETNY-PROWENIENCJA, 2026-10-15): zadna pozycja nie ma
dolaczonej karty producenta — wszystkie sa REFERENCYJNYM modelem obliczeniowym
(`source_reference`, `verification_status`; pola wymagane). Turbina ok. 1 MW
(EWT DW52/54/61 900 kW, Enercon E-44 900 kW) ZABLOKOWANA danymi: dostepne zrodla
producentow nie podaja napiecia generatora ani parametrow zwarciowych, ktorych ta
pozycja wymaga.
"""

from __future__ import annotations

from typing import Literal

from network_model.brak_zasobu import BrakZasobuError
from network_model.catalog.mv_converter_catalog import ZRODLO_MODELU_REFERENCYJNEGO
from network_model.catalog.types import CatalogVerificationStatus
from pydantic import BaseModel

#: Wszystkie pozycje: liczby elektryczne (napiecie generatora, I_k'', wklad pod FRT)
#: nie maja dolaczonego dokumentu producenta — model obliczeniowy z etykieta modelu.
_STATUS_REFERENCYJNY = CatalogVerificationStatus.REFERENCYJNY.value


#: Rozbieznosc wykryta w rundzie 3 karty KATALOG-KOMPLETNY-PROWENIENCJA: liczba w rekordzie
#: zostaje (bez karty producenta nie ma podstawy do zmiany), ale nota mowi prawde o jej
#: statusie.
NOTA_V112_NAPIECIE_NIEPOTWIERDZONE = (
    "Napięcie generatora 0,69 kV NIEPOTWIERDZONE: karta producenta Vestas nie została "
    "odczytana (specyfikacja na commissiemer.nl — HTTP 404, 2026-10-15), a źródło wtórne "
    "(baza wind-turbine-models.com, nie dokument producenta) podaje 750 V. Wartość "
    "pozostaje założeniem modelu referencyjnego do czasu karty producenta."
)


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
    # Parametry elektryczne zwarciowe [p.u. mocy znamionowej]
    short_circuit_current_pu: float  # I_k" w p.u. mocy znamionowej
    fault_current_contribution_pu: float  # I_short pod FRT
    voltage_control_capable: bool
    p_f_droop_capable: bool
    # Proweniencja (karta KATALOG-KOMPLETNY-PROWENIENCJA) — pola WYMAGANE: pozycja bez
    # zrodla nie powstanie. Te same nazwy i znaczenie co w pozostalych katalogach.
    source_reference: str
    verification_status: str
    # Zastrzezenia do konkretnej liczby pozycji (rozbieznosc ze zrodlem wtornym itp.).
    verification_note: str | None = None
    # Profil dynamiczny IEC 61400-27 (default per converter_type, override możliwy)
    dynamic_profile_id: str | None = None
    """Referencja do profilu w `der_dynamic` (default mapowany z converter_type).

    None → resolver dobiera default_wind_type_X (1: SCIG, 2: WRIG/hydraulic,
    3: DFIG, 4: full_converter) — żadna turbina nie zostanie bez modelu.
    """


# Pozycje referencyjne (model obliczeniowy z etykieta producenta i modelu):

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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
        verification_note=NOTA_V112_NAPIECIE_NIEPOTWIERDZONE,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
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
        source_reference=ZRODLO_MODELU_REFERENCYJNEGO,
        verification_status=_STATUS_REFERENCYJNY,
    ),
]


WIND_TURBINE_CATALOG: dict[str, WindTurbineCatalogEntry] = {t.catalog_id: t for t in WIND_TURBINES}


def list_wind_turbines() -> list[WindTurbineCatalogEntry]:
    """Lista wszystkich referencyjnych turbin (deterministyczna kolejność po catalog_id)."""
    return sorted(WIND_TURBINES, key=lambda t: t.catalog_id)


def get_turbine(catalog_id: str) -> WindTurbineCatalogEntry:
    if catalog_id not in WIND_TURBINE_CATALOG:
        available = ", ".join(sorted(WIND_TURBINE_CATALOG.keys()))
        raise BrakZasobuError(
            f"Unknown wind turbine catalog_id: {catalog_id}. Available: {available}"
        )
    return WIND_TURBINE_CATALOG[catalog_id]
