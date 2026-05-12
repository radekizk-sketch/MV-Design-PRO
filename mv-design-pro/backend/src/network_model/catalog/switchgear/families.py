"""Rodziny rozdzielnic SN producentów (§11A.3).

Status `repo_verified` — dane pochodzą z publicznych stron produktowych
producenta lub dokumentacji technicznej (URL w `source_document_refs`). NIE
status `official_catalog` — to wymaga oficjalnego PDF zatwierdzonego przez
producenta z weryfikacją wersji katalogu.

Źródła publiczne (deep search 2026-05):
- ZPUE Rotoblok: https://zpue.pl/rozdzielnice-sn/rotoblok
- Elektrometal e²ALPHA: https://elektrometal-energetyka.pl/rozdzielnice-sn-e²alpha/
- ABB UniGear ZS1: https://new.abb.com/medium-voltage/switchgear/air-insulated/iec-and-other-standards/unigear-zs1-portfolio
- ABB SafeRing: https://electrification.us.abb.com/products/switchgear/safering-gas-insulated-ring-main-unit
- Siemens NXAIR: https://www.siemens.com/en-us/products/energy-systems/nxair/
- Siemens 8DJH: https://www.siemens.com/en-us/products/energy/medium-voltage/medium-voltage-switchgear/8djh-36.html

Aby promować rodzinę do `verified` (status="verified" + `verified_at`), wymaga
zatwierdzenia w PR przez catalog admin z linkiem do oficjalnej karty produktu
PDF (zgodnie z `SLD_MV_BAY_TEMPLATE_SOURCE_POLICY.md`).
"""

from __future__ import annotations

from .switchgear_family import SwitchgearFamily

# =============================================================================
# ZPUE Włoszczowa — Rotoblok
# =============================================================================

ZPUE_WLOSZCZOWA__ROTOBLOK = SwitchgearFamily(
    switchgear_family_ref="ZPUE_WLOSZCZOWA__ROTOBLOK",
    manufacturer_ref="ZPUE_WLOSZCZOWA",
    family_name="Rotoblok",
    series_name="Rotoblok",
    product_line_code="ROTOBLOK",
    voltage_levels=[15.0, 20.0],
    rated_current_options=[630, 1250],
    short_time_current_options=[16],  # kA / 1s
    insulation_type="air",
    construction_type="wnetrzowa",  # rozdzielnica wnętrzowa
    busbar_system="single",
    compartment_models=["busbar_compartment", "cable_compartment"],
    allowed_bay_kinds=[
        "liniowe_doplywowe",
        "liniowe_odplywowe",
        "transformatorowe",
        "pomiarowe",
        "sprzeglowe_poprzeczne",
        "odgromnikowe",
        "potrzeb_wlasnych",
    ],
    allowed_apparatus_kinds=[
        "circuit_breaker",
        "switch_disconnector",
        "earthing_switch",
        "fuse_set",
        "current_transformer",
        "voltage_transformer",
        "surge_arrester",
        "cable_head",
    ],
    allowed_interlocks=[
        "earthing_only_when_open",
        "racking_only_when_open",
    ],
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3"],
    cad_footprint_ref=None,
    source_document_refs=["https://zpue.pl/rozdzielnice-sn/rotoblok"],
    source_version="public-product-page-2026-05",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=["https://zpue.pl/rozdzielnice-sn/rotoblok"],
    notes_pl=(
        "Rotoblok — rozdzielnica wnętrzowa SN, dwuprzedziałowa, izolacja "
        "powietrzna, pojedynczy system szyn. Napięcie 15/20 kV, prąd "
        "znamionowy 630/1250 A, krótkotrwały 16 kA/1s, szczytowy 40 kA. "
        "Certyfikat IEL. Typowe pola: liniowe (RL1, RL4), transformatorowe "
        "(RT1, RWT, RWT3, RWTp14), sprzęgłowe (RS1L, RS4), pomiarowe (RP1), "
        "odgromnikowe (RO1), potrzeb własnych (RTpwł4, RTpwł 25kVA). "
        "Status repo_verified — dane z publicznej strony produktu, NIE "
        "official_catalog (wymaga oficjalnego PDF od producenta)."
    ),
)

# =============================================================================
# Elektrometal Energetyka — e²ALPHA
# =============================================================================

ELEKTROMETAL__E2ALPHA = SwitchgearFamily(
    switchgear_family_ref="ELEKTROMETAL__E2ALPHA",
    manufacturer_ref="ELEKTROMETAL",
    family_name="e²ALPHA",
    series_name="e²ALPHA",
    product_line_code="E2ALPHA",
    voltage_levels=[12.0, 17.5, 24.0],
    rated_current_options=[630, 1250, 2000],
    short_time_current_options=[25, 31],  # kA / 1s (24 kV → 25, niższe napięcia → do 31.5)
    insulation_type="air",
    construction_type="wnetrzowa",
    busbar_system="single",
    compartment_models=[
        "busbar_compartment",
        "cable_compartment",
        "apparatus_compartment",
        "lv_control_compartment",
    ],
    allowed_bay_kinds=[
        "liniowe_doplywowe",
        "liniowe_odplywowe",
        "transformatorowe",
        "pomiarowe",
        "sprzeglowe_poprzeczne",
        "potrzeb_wlasnych",
        "odgromnikowe",
    ],
    allowed_apparatus_kinds=[
        "circuit_breaker",
        "switch_disconnector",
        "earthing_switch",
        "fuse_set",
        "current_transformer",
        "voltage_transformer",
        "surge_arrester",
        "cable_head",
    ],
    allowed_interlocks=[
        "earthing_only_when_open",
        "racking_only_when_open",
        "modular_interlock_system",
    ],
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3", "LOD4"],
    cad_footprint_ref=None,
    source_document_refs=[
        "https://elektrometal-energetyka.pl/rozdzielnice-sn-e²alpha/",
        "https://elektrometal.eu/catalogs/mining/products/pl/357rozdzielnice-sredniego-napiecia.pdf",
    ],
    source_version="public-product-page-2026-05",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=["https://elektrometal-energetyka.pl/rozdzielnice-sn-e²alpha/"],
    notes_pl=(
        "e²ALPHA — rozdzielnica wnętrzowa SN, 4-przedziałowa, izolacja "
        "powietrzna, pojedynczy system szyn. Napięcia 12/17.5/24 kV, prąd "
        "znamionowy 630-2000 A (szyna do 2500 A), krótkotrwały do 31.5 kA "
        "(12/17.5 kV) lub 25 kA (24 kV). Klasy LSC2B + PM + AFLR + IP4X/IP54. "
        "Konstrukcja Al-Zn 2-3 mm. Status repo_verified."
    ),
)

# =============================================================================
# ABB — UniGear ZS1
# =============================================================================

ABB__UNIGEAR_ZS1 = SwitchgearFamily(
    switchgear_family_ref="ABB__UNIGEAR_ZS1",
    manufacturer_ref="ABB",
    family_name="UniGear ZS1",
    series_name="UniGear ZS1",
    product_line_code="UNIGEAR_ZS1",
    voltage_levels=[12.0, 17.5, 24.0],
    rated_current_options=[1250, 2500, 4000],
    short_time_current_options=[25, 31, 50, 63],  # kA / 1s
    insulation_type="air",
    construction_type="wysuwna",
    busbar_system="single",  # opcjonalnie double — patrz catalog
    compartment_models=[
        "busbar_compartment",
        "cable_compartment",
        "apparatus_compartment",
        "lv_control_compartment",
    ],
    allowed_bay_kinds=[
        "liniowe_doplywowe",
        "liniowe_odplywowe",
        "transformatorowe",
        "pomiarowe",
        "sprzeglowe_poprzeczne",
        "sprzeglowe_podluzne",
        "sekcyjne",
        "potrzeb_wlasnych",
        "odgromnikowe",
    ],
    allowed_apparatus_kinds=[
        "circuit_breaker",
        "switch_disconnector",
        "earthing_switch",
        "fuse_set",
        "current_transformer",
        "voltage_transformer",
        "surge_arrester",
        "cable_head",
        "voltage_indicator",
    ],
    allowed_interlocks=[
        "earthing_only_when_open",
        "racking_only_when_open",
        "withdrawable_compartment_lock",
    ],
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3", "LOD4"],
    cad_footprint_ref=None,
    source_document_refs=[
        "https://new.abb.com/medium-voltage/switchgear/air-insulated/iec-and-other-standards/unigear-zs1-portfolio",
        "https://library.e.abb.com/public/4d24e323305341eac1256acc002f63f0/M23724E-.pdf",
    ],
    source_version="public-product-page-2026-05",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=[
        "https://new.abb.com/medium-voltage/switchgear/air-insulated/iec-and-other-standards/unigear-zs1-portfolio"
    ],
    notes_pl=(
        "UniGear ZS1 — rozdzielnica wnętrzowa SN ABB, izolacja powietrzna, "
        "wysuwna (withdrawable), arc-proof. Napięcia 12/17.5/24 kV, prąd "
        "znamionowy do 4000 A, krótkotrwały do 63 kA. Konfiguracje single/double "
        "busbar/double level. Standardy IEC, GB/DL, CSA, GOST. Status "
        "repo_verified — dane z portfolio page; pełne parametry techniczne "
        "wymagają oficjalnej karty produktu ABB."
    ),
)

# =============================================================================
# ABB — SafeRing
# =============================================================================

ABB__SAFERING = SwitchgearFamily(
    switchgear_family_ref="ABB__SAFERING",
    manufacturer_ref="ABB",
    family_name="SafeRing",
    series_name="SafeRing",
    product_line_code="SAFERING",
    voltage_levels=[12.0, 17.5, 24.0],
    rated_current_options=[630],
    short_time_current_options=[16, 20, 21],  # kA / 1s
    insulation_type="sf6",
    construction_type="RMU",
    busbar_system="ring_main",
    compartment_models=["cable_compartment"],
    allowed_bay_kinds=[
        "liniowe_doplywowe",
        "liniowe_odplywowe",
        "transformatorowe",
    ],
    allowed_apparatus_kinds=[
        "switch_disconnector",
        "circuit_breaker",
        "earthing_switch",
        "fuse_set",
        "voltage_indicator",
        "cable_head",
    ],
    allowed_interlocks=[
        "earthing_only_when_open",
    ],
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3"],
    cad_footprint_ref=None,
    source_document_refs=[
        "https://electrification.us.abb.com/products/switchgear/safering-gas-insulated-ring-main-unit",
    ],
    source_version="public-product-page-2026-05",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=[
        "https://electrification.us.abb.com/products/switchgear/safering-gas-insulated-ring-main-unit"
    ],
    notes_pl=(
        "SafeRing — Ring Main Unit (RMU) ABB, izolacja SF6, sealed-for-life. "
        "Napięcia 12-24 kV, prąd znamionowy 630 A, krótkotrwały do 21 kA/1s "
        "(modul C: 16 kA przy 24 kV). 18 konfiguracji modułowych. Standard "
        "IEC 62271-200. Status repo_verified."
    ),
)

# =============================================================================
# Siemens — NXAIR
# =============================================================================

SIEMENS__NXAIR = SwitchgearFamily(
    switchgear_family_ref="SIEMENS__NXAIR",
    manufacturer_ref="SIEMENS",
    family_name="NXAIR",
    series_name="NXAIR",
    product_line_code="NXAIR",
    voltage_levels=[12.0, 17.5, 24.0],
    rated_current_options=[1250, 2500, 4000],
    short_time_current_options=[25, 31, 40],  # kA / 1s
    insulation_type="air",
    construction_type="wysuwna",
    busbar_system="single",
    compartment_models=[
        "busbar_compartment",
        "cable_compartment",
        "apparatus_compartment",
        "lv_control_compartment",
    ],
    allowed_bay_kinds=[
        "liniowe_doplywowe",
        "liniowe_odplywowe",
        "transformatorowe",
        "pomiarowe",
        "sprzeglowe_poprzeczne",
        "potrzeb_wlasnych",
        "odgromnikowe",
    ],
    allowed_apparatus_kinds=[
        "circuit_breaker",
        "switch_disconnector",
        "earthing_switch",
        "fuse_set",
        "current_transformer",
        "voltage_transformer",
        "surge_arrester",
        "cable_head",
        "voltage_indicator",
    ],
    allowed_interlocks=[
        "earthing_only_when_open",
        "racking_only_when_open",
        "withdrawable_compartment_lock",
    ],
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3", "LOD4"],
    cad_footprint_ref=None,
    source_document_refs=[
        "https://www.siemens.com/en-us/products/energy-systems/nxair/",
        "https://assets.new.siemens.com/siemens/assets/api/uuid:35caf0b0-ed6f-474f-846c-8f5545a6fddb/catalogue-nxair-en.pdf",
    ],
    source_version="public-product-page-2026-05",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=["https://www.siemens.com/en-us/products/energy-systems/nxair/"],
    notes_pl=(
        "NXAIR — rozdzielnica wnętrzowa SN Siemens, izolacja powietrzna, "
        "wysuwna. Napięcia 12/17.5/24 kV, prąd znamionowy do 4000 A, "
        "krótkotrwały do 40 kA (NXAIR), 25 kA (NXAIR M dla 24 kV). Klasyfikacja "
        "IAC A FLR + LSC 2B + PM. Standard IEC 62271-200. Status repo_verified."
    ),
)

# =============================================================================
# Siemens — 8DJH
# =============================================================================

SIEMENS__8DJH = SwitchgearFamily(
    switchgear_family_ref="SIEMENS__8DJH",
    manufacturer_ref="SIEMENS",
    family_name="8DJH",
    series_name="8DJH",
    product_line_code="8DJH",
    voltage_levels=[12.0, 17.5, 24.0],
    rated_current_options=[630],
    short_time_current_options=[20, 21, 25],  # kA / 1s
    insulation_type="sf6",
    construction_type="RMU",
    busbar_system="ring_main",
    compartment_models=["cable_compartment"],
    allowed_bay_kinds=[
        "liniowe_doplywowe",
        "liniowe_odplywowe",
        "transformatorowe",
    ],
    allowed_apparatus_kinds=[
        "switch_disconnector",
        "circuit_breaker",
        "earthing_switch",
        "fuse_set",
        "voltage_indicator",
        "cable_head",
    ],
    allowed_interlocks=[
        "earthing_only_when_open",
    ],
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3"],
    cad_footprint_ref=None,
    source_document_refs=[
        "https://www.siemens.com/en-us/products/energy/medium-voltage/medium-voltage-switchgear/8djh-36.html",
        "https://assets.new.siemens.com/siemens/assets/api/uuid:40fab88c-6711-4fad-9e26-7d54849af7e7/500-83849.pdf",
    ],
    source_version="public-product-page-2026-05",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=[
        "https://www.siemens.com/en-us/products/energy/medium-voltage/medium-voltage-switchgear/8djh-36.html"
    ],
    notes_pl=(
        "8DJH — Ring Main Unit (RMU) Siemens, izolacja SF6, sealed-for-life "
        "(metal-enclosed). Napięcia 12-24 kV, prąd znamionowy 630 A (busbar + "
        "feeder), krótkotrwały do 25 kA/1s (variant 17.5 kV) lub 20 kA/1s "
        "(variant 24 kV), making current do 50 kA. Standard IEC 62271-200. "
        "Status repo_verified."
    ),
)

# =============================================================================
# Registry
# =============================================================================

_FAMILIES: tuple[SwitchgearFamily, ...] = (
    ZPUE_WLOSZCZOWA__ROTOBLOK,
    ELEKTROMETAL__E2ALPHA,
    ABB__UNIGEAR_ZS1,
    ABB__SAFERING,
    SIEMENS__NXAIR,
    SIEMENS__8DJH,
)

SWITCHGEAR_FAMILY_REGISTRY: dict[str, SwitchgearFamily] = {
    f.switchgear_family_ref: f for f in _FAMILIES
}


def list_switchgear_families() -> list[SwitchgearFamily]:
    """Lista wszystkich rodzin posortowana po `switchgear_family_ref`."""
    return sorted(
        SWITCHGEAR_FAMILY_REGISTRY.values(),
        key=lambda f: f.switchgear_family_ref,
    )


def list_families_for_manufacturer(manufacturer_ref: str) -> list[SwitchgearFamily]:
    """Lista rodzin danego producenta (sortowana deterministycznie)."""
    return sorted(
        (f for f in SWITCHGEAR_FAMILY_REGISTRY.values() if f.manufacturer_ref == manufacturer_ref),
        key=lambda f: f.switchgear_family_ref,
    )


def get_switchgear_family(switchgear_family_ref: str) -> SwitchgearFamily:
    """Pobiera rodzinę po ref. KeyError gdy brak."""
    if switchgear_family_ref not in SWITCHGEAR_FAMILY_REGISTRY:
        available = ", ".join(sorted(SWITCHGEAR_FAMILY_REGISTRY.keys()))
        raise KeyError(
            f"Unknown switchgear_family_ref: {switchgear_family_ref}. "
            f"Available: {available}"
        )
    return SWITCHGEAR_FAMILY_REGISTRY[switchgear_family_ref]
