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
- Schneider SM6-24 (deep search 2026-07, Reference Engine V1): https://www.se.com/ww/en/product-range/933-sm6-24/

Aby promować rodzinę do `verified` (status="verified" + `verified_at`), wymaga
zatwierdzenia w PR przez catalog admin z linkiem do oficjalnej karty produktu
PDF (zgodnie z `SLD_MV_BAY_TEMPLATE_SOURCE_POLICY.md`).

TRANSZA 2026-08-14 (scalenie kanonu rozdzielnic — `docs/domain/
KONFIGURATOR_ROZDZIELNIC_SN_RMU.md` §8): rodziny z równoległego modułu
`switchgear_families.py` (etap S1) zostały WTOPIONE tutaj, a tamten moduł
usunięty — jeden kanon rodzin, zero dwóch ścieżek tej samej prawdy.

KONWENCJA `voltage_levels` DLA TRANSZY 2026-08-14: wartości przepisane
DOSŁOWNIE z karty producenta (to, co karta nazywa napięciem znamionowym), a
pełne zdanie źródłowe — łącznie z napięciem najwyższym urządzenia — siedzi w
`notes_pl`. Zero interpretacji: gdy karta podaje jedną klasę („do 24 kV"),
deklarujemy jedną klasę, a nie domyśloną serię IEC. Rodzina, której klas
prądowych/zwarciowych karta publiczna NIE podaje, zostaje przy
`status="requires_catalog"` (nie jest oferowana konfiguratorowi) zamiast
dostać zmyślone liczby.
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
        # ROZSZERZENIE ADDYTYWNE 2026-08-14 (transkrypcja bloków 8DJH):
        # legenda katalogu Siemens HA 40.2 wymienia pola sprzęgłowe wprost —
        # „S = Bus sectionalizer panel with switch-disconnector”, „H = Bus
        # sectionalizer panel with switch-fuse combination” — a tabela mas
        # transportowych podaje bloki, które je zawierają (RS, RH, RRS, RRH,
        # RRRS, RRRH). Bez tej pozycji te sześć bloków nie weszłoby do
        # rejestru, choć karta je nazywa.
        "sprzeglowe_poprzeczne",
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
        "https://assets.new.siemens.com/siemens/assets/api/uuid:a154c8cc-b58e-42b9-963d-28d73019016f/8djhcompact-en-cataloge.pdf",
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
        "Katalog HA 40.2 (2017) wymienia pola K (kablowe), K(E) (kablowe z "
        "uziemnikiem zwarciowym), R (liniowe pierścieniowe), T "
        "(transformatorowe), L (wyłącznikowe) oraz sprzęgłowe S i H, a także "
        "zestawienie bloków fabrycznych z szerokościami — bloki są "
        "przepisane do rejestru konfiguracji fabrycznych. Odmiana 8DJH "
        "Compact (bloki bez rozszerzenia szyn) jest osobnym wyrobem i NIE "
        "wchodzi do tej rodziny. Status repo_verified."
    ),
)

# =============================================================================
# Schneider Electric — SM6-24
# =============================================================================

SCHNEIDER__SM6_24 = SwitchgearFamily(
    switchgear_family_ref="SCHNEIDER__SM6_24",
    manufacturer_ref="SCHNEIDER_ELECTRIC",
    family_name="SM6-24",
    series_name="SM6",
    product_line_code="SM6_24",
    voltage_levels=[12.0, 17.5, 24.0],
    rated_current_options=[400, 630, 1250],
    short_time_current_options=[16, 20, 25],  # kA / 1s (zależnie od celki)
    insulation_type="mixed",  # szyny w powietrzu, aparaty łączeniowe w SF6/próżni
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
    ],
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3"],
    cad_footprint_ref=None,
    source_document_refs=["https://www.se.com/ww/en/product-range/933-sm6-24/"],
    source_version="public-product-page-2026-07",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=["https://www.se.com/ww/en/product-range/933-sm6-24/"],
    notes_pl=(
        "SM6-24 — modułowa rozdzielnica wnętrzowa SN Schneider Electric do "
        "24 kV: celki rozłącznikowe (typ IM), rozłącznik z bezpiecznikami "
        "(QM), wyłącznikowe (DM), pomiarowe (CM/GBC). Szyny w izolacji "
        "powietrznej, aparaty łączeniowe SF6/próżnia. Prąd znamionowy "
        "400–1250 A, krótkotrwały do 25 kA/1s. Dodana w programie Reference "
        "Engine V1. Status repo_verified — dane z publicznej strony "
        "produktowej; pełne parametry wymagają oficjalnej karty katalogowej."
    ),
)

# =============================================================================
# ZPUE Włoszczowa — TPM (RMU w izolacji SF6/próżnia)
# =============================================================================

ZPUE_WLOSZCZOWA__TPM = SwitchgearFamily(
    switchgear_family_ref="ZPUE_WLOSZCZOWA__TPM",
    manufacturer_ref="ZPUE_WLOSZCZOWA",
    family_name="TPM",
    series_name="TPM",
    product_line_code="TPM",
    voltage_levels=[25.0],
    rated_current_options=[630],
    short_time_current_options=[16, 20, 25],  # kA / 3 s wg karty
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
    allowed_interlocks=["earthing_only_when_open"],
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3"],
    cad_footprint_ref=None,
    source_document_refs=[
        "https://www.elektro.info.pl/produkt/rozdzielnice-sn/109580,rozdzielnica-sn-tpm-rmu",
        "https://zpue.pl/rozdzielnice-sn",
    ],
    source_version="public-product-card-2026-08-14",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=[
        "https://www.elektro.info.pl/produkt/rozdzielnice-sn/109580,rozdzielnica-sn-tpm-rmu"
    ],
    notes_pl=(
        "TPM — rozdzielnica pierścieniowa (RMU) ZPUE w izolacji SF6/próżnia. "
        "Karta (odczyt 2026-08-14): napięcie znamionowe 25 kV, prąd znamionowy "
        "szyn zbiorczych 630 A, prąd znamionowy pola transformatorowego 125 A, "
        "dopuszczalny prąd zwarciowy 25*/20/16 kA (3 s), prąd szczytowy 50 kA, "
        "odporność na łuk elektryczny 20 kA. Status repo_verified — dane z "
        "publicznej karty produktu, NIE official_catalog (wymaga oficjalnego "
        "PDF od producenta)."
    ),
)

# =============================================================================
# ZPUE Włoszczowa — TPM Air (RMU bez SF6, suche powietrze + próżnia)
# =============================================================================

ZPUE_WLOSZCZOWA__TPM_AIR = SwitchgearFamily(
    switchgear_family_ref="ZPUE_WLOSZCZOWA__TPM_AIR",
    manufacturer_ref="ZPUE_WLOSZCZOWA",
    family_name="TPM Air",
    series_name="TPM Air",
    product_line_code="TPM_AIR",
    voltage_levels=[24.0],
    rated_current_options=[630],
    short_time_current_options=[16, 20],  # kA / 1 s wg karty
    insulation_type="mixed",  # suche powietrze pod nadciśnieniem + aparatura próżniowa
    construction_type="RMU",
    busbar_system="ring_main",
    compartment_models=["cable_compartment", "metering_compartment"],
    allowed_bay_kinds=[
        "liniowe_doplywowe",
        "liniowe_odplywowe",
        "transformatorowe",
        "sprzeglowe_poprzeczne",
        "pomiarowe",
    ],
    allowed_apparatus_kinds=[
        "switch_disconnector",
        "circuit_breaker",
        "earthing_switch",
        "fuse_set",
        "current_transformer",
        "voltage_transformer",
        "voltage_indicator",
        "cable_head",
    ],
    allowed_interlocks=["earthing_only_when_open"],
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3"],
    cad_footprint_ref=None,
    source_document_refs=["https://zpue.pl/rozdzielnice-sn/tpm-air"],
    source_version="public-product-page-2026-08-14",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=["https://zpue.pl/rozdzielnice-sn/tpm-air"],
    notes_pl=(
        "TPM Air — rozdzielnica pierścieniowa (RMU) ZPUE bez SF6: izolacja "
        "suchym powietrzem pod nadciśnieniem + aparatura próżniowa, łącznik "
        "trójpozycyjny (zamknij-otwórz-uziem). Karta (odczyt 2026-08-14): "
        "napięcie znamionowe 24 kV, prąd znamionowy szyn 630 A, prąd zwarciowy "
        "16 kA lub 20 kA (1 s), prąd szczytowy 40/50 kA, IAC AFLR (20 kA, 1 s), "
        "kable do 630 mm². Jednostki funkcjonalne karty: L (rozłącznik liniowy "
        "630 A), T (rozłącznik z bezpiecznikami 250 A), W (wyłącznik 630 A), "
        "S (sprzęgło), M840 (pomiar z przekładnikami prądowymi i napięciowymi). "
        "Status repo_verified."
    ),
)

# =============================================================================
# ZPUE Włoszczowa — Rotoblok Air (AIS bez SF6)
# =============================================================================

ZPUE_WLOSZCZOWA__ROTOBLOK_AIR = SwitchgearFamily(
    switchgear_family_ref="ZPUE_WLOSZCZOWA__ROTOBLOK_AIR",
    manufacturer_ref="ZPUE_WLOSZCZOWA",
    family_name="Rotoblok Air",
    series_name="Rotoblok Air",
    product_line_code="ROTOBLOK_AIR",
    voltage_levels=[24.0],
    rated_current_options=[630],
    short_time_current_options=[16],  # kA / 1 s wg karty
    insulation_type="air",
    construction_type="wnetrzowa",
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
    allowed_interlocks=["earthing_only_when_open"],
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3"],
    cad_footprint_ref=None,
    source_document_refs=["https://zpue.pl/rozdzielnice-sn/rotoblok-air"],
    source_version="public-product-page-2026-08-14",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=["https://zpue.pl/rozdzielnice-sn/rotoblok-air"],
    notes_pl=(
        "Rotoblok Air — rozdzielnica wnętrzowa SN ZPUE bez SF6, konektory w "
        "izolacji suchym powietrzem, dwuprzedziałowa (przedział szyn + "
        "przedział kablowy), pojedynczy system szyn. Karta (odczyt "
        "2026-08-14): napięcie znamionowe 24 kV (najwyższe napięcie urządzenia "
        "25 kV), prąd znamionowy szyn 630 A, prąd zwarciowy do 16 kA (1 s), "
        "prąd szczytowy do 50 kA, IAC 16 kA (1 s), napięcie udarowe 125/145 kV, "
        "IP3X. Status repo_verified."
    ),
)

# =============================================================================
# ZPUE Włoszczowa — Rotoblok VCB (AIS, aparat trójfunkcyjny TGI)
# =============================================================================

ZPUE_WLOSZCZOWA__ROTOBLOK_VCB = SwitchgearFamily(
    switchgear_family_ref="ZPUE_WLOSZCZOWA__ROTOBLOK_VCB",
    manufacturer_ref="ZPUE_WLOSZCZOWA",
    family_name="Rotoblok VCB",
    series_name="Rotoblok VCB",
    product_line_code="ROTOBLOK_VCB",
    voltage_levels=[20.0],
    rated_current_options=[630],
    short_time_current_options=[16, 20],  # 16 kA / 3 s, 20 kA / 1 s wg karty
    insulation_type="air",
    construction_type="wnetrzowa",
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
    allowed_interlocks=["earthing_only_when_open"],
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3"],
    cad_footprint_ref=None,
    source_document_refs=["https://zpue.pl/rozdzielnice-sn/rotoblok-vcb"],
    source_version="public-product-page-2026-08-14",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=["https://zpue.pl/rozdzielnice-sn/rotoblok-vcb"],
    notes_pl=(
        "Rotoblok VCB — rozdzielnica wnętrzowa SN ZPUE, dwuprzedziałowa, "
        "pojedynczy system szyn, aparat trójfunkcyjny TGI (wyłącznik + "
        "odłącznik + uziemnik w jednym), wykonanie stacjonarne (nie wysuwne). "
        "Karta (odczyt 2026-08-14): napięcie znamionowe 20 kV (najwyższe "
        "napięcie urządzenia 25 kV), prąd znamionowy szyn 630 A, prąd "
        "zwarciowy do 16 kA (3 s) / do 20 kA (1 s), prąd szczytowy do 50 kA, "
        "IAC AFLR do 16 kA (1 s). Status repo_verified."
    ),
)

# =============================================================================
# ZPUE Włoszczowa — RELF (rozdzielnica dwuczłonowa rozdziału pierwotnego)
# =============================================================================

ZPUE_WLOSZCZOWA__RELF = SwitchgearFamily(
    switchgear_family_ref="ZPUE_WLOSZCZOWA__RELF",
    manufacturer_ref="ZPUE_WLOSZCZOWA",
    family_name="RELF",
    series_name="RELF",
    product_line_code="RELF",
    voltage_levels=[12.0, 17.5, 24.0, 36.0],
    rated_current_options=[630, 1250, 1600, 2000, 2500, 4000],
    short_time_current_options=[31, 40],  # 31,5 kA / 3 s; 40 kA / 3 s w wariancie 12 kV
    insulation_type="air",
    construction_type="dwuczlonowa",
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
        "sprzeglowe_podluzne",
        "sekcyjne",
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
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3", "LOD4"],
    cad_footprint_ref=None,
    source_document_refs=["https://zpue.pl/rozdzielnice-sn/relf"],
    source_version="public-product-page-2026-08-14",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=["https://zpue.pl/rozdzielnice-sn/relf"],
    notes_pl=(
        "RELF — rozdzielnica SN ZPUE rozdziału pierwotnego, dwuczłonowa "
        "(człon wysuwny), izolacja powietrzna, IP4X, klasa łuku IAC AFLR, "
        "LSC2B (LSC2 dla 36 kV). Karta (odczyt 2026-08-14): napięcia do 36 kV, "
        "prądy szyn do 4000 A, prąd zwarciowy 31,5 kA / 3 s, w wariancie 12 kV "
        "do 40 kA / 3 s. Normy PN-EN 62271-1, PN-EN 62271-200. Status "
        "repo_verified."
    ),
)

# =============================================================================
# ZPUE Włoszczowa — RELF 2S (dwa systemy szyn zbiorczych)
# =============================================================================

ZPUE_WLOSZCZOWA__RELF_2S = SwitchgearFamily(
    switchgear_family_ref="ZPUE_WLOSZCZOWA__RELF_2S",
    manufacturer_ref="ZPUE_WLOSZCZOWA",
    family_name="RELF 2S",
    series_name="RELF 2S",
    product_line_code="RELF_2S",
    voltage_levels=[12.0],
    rated_current_options=[630, 1250, 1600, 2000, 2500],
    short_time_current_options=[31],  # 31,5 kA / 3 s
    insulation_type="air",
    construction_type="dwuczlonowa",
    busbar_system="double",
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
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3", "LOD4"],
    cad_footprint_ref=None,
    source_document_refs=["https://zpue.pl/rozdzielnice-sn/relf-2s"],
    source_version="public-product-page-2026-08-14",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=["https://zpue.pl/rozdzielnice-sn/relf-2s"],
    notes_pl=(
        "RELF 2S — rozdzielnica SN ZPUE dwusystemowa (dwa systemy szyn "
        "zbiorczych), dwuczłonowa, izolacja powietrzna, IP4X. Człon wysuwny: "
        "wyłącznik, stycznik, rozłącznik, zespół przekładników albo blok "
        "bezpiecznikowy. Karta (odczyt 2026-08-14): napięcie 12 kV, prądy szyn "
        "630-2500 A, prąd zwarciowy 31,5 kA / 3 s, prąd szczytowy 80 kA, "
        "IAC AFLR 31,5 kA / 1 s. Norma PN-EN 62271-200. Status repo_verified."
    ),
)

# =============================================================================
# ZPUE Włoszczowa — RXD (dwuczłonowa, izolacja POWIETRZNA)
# =============================================================================

ZPUE_WLOSZCZOWA__RXD = SwitchgearFamily(
    switchgear_family_ref="ZPUE_WLOSZCZOWA__RXD",
    manufacturer_ref="ZPUE_WLOSZCZOWA",
    family_name="RXD",
    series_name="RXD",
    product_line_code="RXD",
    voltage_levels=[12.0, 36.0],
    rated_current_options=[630, 1250],
    short_time_current_options=[25],  # kA / 3 s
    # KOREKTA klasyfikacji (weryfikacja karty 2026-08-14): RXD jest
    # rozdzielnicą dwuczłonową w izolacji POWIETRZNEJ (metal-enclosed), a nie
    # gazową — wcześniejsza klasyfikacja GIS była błędna.
    insulation_type="air",
    construction_type="dwuczlonowa",
    busbar_system="single",
    compartment_models=[
        "busbar_compartment",
        "cable_compartment",
        "apparatus_compartment",
    ],
    allowed_bay_kinds=[
        "liniowe_doplywowe",
        "liniowe_odplywowe",
        "transformatorowe",
        "pomiarowe",
        "sprzeglowe_poprzeczne",
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
    source_document_refs=[
        "https://www.elektro.info.pl/produkt/rozdzielnice-sn/109592",
        "https://zpue.pl/rozdzielnice-sn",
    ],
    source_version="public-product-card-2026-08-14",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=["https://www.elektro.info.pl/produkt/rozdzielnice-sn/109592"],
    notes_pl=(
        "RXD — rozdzielnica SN ZPUE dwuczłonowa w izolacji POWIETRZNEJ "
        "(metal-enclosed), jeden system szyn, manipulacja członem przez "
        "zamknięte drzwi. Karta (odczyt 2026-08-14): napięcia 12/36 kV, prądy "
        "szyn 630/1250 A, prąd zwarciowy 25 kA / 3 s, prąd szczytowy 63 kA, "
        "IAC AFLR 25 kA / 1 s (wariant 12 kV) oraz 20 kA / 1 s (wariant "
        "36 kV). Normy PN-EN 62271-1, PN-EN 62271-200. Status repo_verified."
    ),
)

# =============================================================================
# ABB — SafePlus (RMU rozszerzalne)
# =============================================================================

ABB__SAFEPLUS = SwitchgearFamily(
    switchgear_family_ref="ABB__SAFEPLUS",
    manufacturer_ref="ABB",
    family_name="SafePlus",
    series_name="SafePlus",
    product_line_code="SAFEPLUS",
    voltage_levels=[12.0, 24.0],
    rated_current_options=[630, 1250],
    short_time_current_options=[20, 25],  # 25 kA / 1 s, 20 kA / 3 s
    insulation_type="sf6",
    construction_type="RMU",
    busbar_system="ring_main",
    compartment_models=["cable_compartment"],
    allowed_bay_kinds=[
        "liniowe_doplywowe",
        "liniowe_odplywowe",
        "transformatorowe",
        "sprzeglowe_poprzeczne",
    ],
    allowed_apparatus_kinds=[
        "switch_disconnector",
        "circuit_breaker",
        "earthing_switch",
        "fuse_set",
        "voltage_indicator",
        "cable_head",
    ],
    allowed_interlocks=["earthing_only_when_open"],
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3"],
    cad_footprint_ref=None,
    source_document_refs=[
        "https://www.abb.com/global/en/areas/electrification/medium-voltage/switchgear/gas-insulated/safering-safeplus",
        "https://library.e.abb.com/public/7b100e1800ed475b83e5e60be8ff4e1b/1VDD006001%20GB%20SafePlus%20Flyer%2005.2018.pdf",
    ],
    source_version="public-product-page-2026-08-14",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=[
        "https://www.abb.com/global/en/areas/electrification/medium-voltage/switchgear/gas-insulated/safering-safeplus"
    ],
    notes_pl=(
        "SafePlus — kompaktowa rozdzielnica ABB dystrybucji wtórnej w izolacji "
        "SF6 (sealed-for-life), ROZSZERZALNA: łączy konfiguracje w pełni "
        "modułowe i półmodułowe, czym różni się od bloków SafeRing. Materiały "
        "producenta (odczyt 2026-08-14): 12-24 kV, 630/1250 A, prąd zwarciowy "
        "25 kA / 1 s oraz 20 kA / 3 s. Status repo_verified — dane z publicznej "
        "strony produktowej i ulotki, NIE official_catalog."
    ),
)

# =============================================================================
# ABB — UniSec (AIS dystrybucji wtórnej) — WYMAGA KARTY KATALOGOWEJ
# =============================================================================

ABB__UNISEC = SwitchgearFamily(
    switchgear_family_ref="ABB__UNISEC",
    manufacturer_ref="ABB",
    family_name="UniSec",
    series_name="UniSec",
    product_line_code="UNISEC",
    # ZERO FABRYKACJI: publiczna strona portfolio podaje wyłącznie klasę
    # napięciową rodziny („do 24 kV"). Prądy znamionowe i zwarciowe całego
    # portfela NIE są tam podane (podane są tylko dla wariantu UniSec Air:
    # 630 A, 20 kA) — dlatego listy zostają PUSTE, a rodzina ma status
    # `requires_catalog` i NIE wchodzi do ofert konfiguratora do czasu
    # podpięcia oficjalnej karty katalogowej ABB.
    voltage_levels=[24.0],
    rated_current_options=[],
    short_time_current_options=[],
    insulation_type="air",
    construction_type="wnetrzowa",
    busbar_system="single",
    compartment_models=["busbar_compartment", "cable_compartment"],
    allowed_bay_kinds=[
        "liniowe_doplywowe",
        "liniowe_odplywowe",
        "transformatorowe",
        "pomiarowe",
        "sprzeglowe_poprzeczne",
    ],
    allowed_apparatus_kinds=[
        "circuit_breaker",
        "switch_disconnector",
        "earthing_switch",
        "fuse_set",
        "current_transformer",
        "voltage_transformer",
        "cable_head",
    ],
    allowed_interlocks=["earthing_only_when_open"],
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3"],
    cad_footprint_ref=None,
    source_document_refs=[
        "https://new.abb.com/medium-voltage/switchgear/air-insulated/iec-and-other-standards/iec-indoor-secondary-distribution-ais-unisec"
    ],
    source_version="public-product-page-2026-08-14",
    verified_at=None,
    lifecycle_status="current",
    status="requires_catalog",
    source_refs=[
        "https://new.abb.com/medium-voltage/switchgear/air-insulated/iec-and-other-standards/iec-indoor-secondary-distribution-ais-unisec"
    ],
    notes_pl=(
        "UniSec — rozdzielnica wnętrzowa ABB w izolacji powietrznej dla "
        "dystrybucji wtórnej, szerokie portfolio jednostek funkcjonalnych; "
        "wariant UniSec Air jest bez SF6 (aparat GSec Air, suche powietrze). "
        "Strona produktowa (odczyt 2026-08-14) deklaruje klasę do 24 kV, a "
        "parametry prądowe i zwarciowe podaje wyłącznie dla wariantu UniSec "
        "Air (630 A, 20 kA). Status requires_catalog — rodzina NIE jest "
        "oferowana w konfiguratorze do czasu podpięcia oficjalnej karty "
        "katalogowej z kompletem klas prądowych i zwarciowych; brak danych "
        "jest zadeklarowany wprost (puste listy), nigdy zgadywany."
    ),
)

# =============================================================================
# Schneider Electric — RM6 (RMU w izolacji SF6)
# =============================================================================

SCHNEIDER__RM6 = SwitchgearFamily(
    switchgear_family_ref="SCHNEIDER__RM6",
    manufacturer_ref="SCHNEIDER_ELECTRIC",
    family_name="RM6",
    series_name="RM6",
    product_line_code="RM6",
    voltage_levels=[24.0],
    rated_current_options=[630],
    short_time_current_options=[20, 21],  # kA / 1 s (IAC AFLR do 20 kA)
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
    allowed_interlocks=["earthing_only_when_open"],
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3"],
    cad_footprint_ref=None,
    source_document_refs=["https://www.se.com/ww/en/product-range/967-rm6/"],
    source_version="public-product-page-2026-08-14",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=["https://www.se.com/ww/en/product-range/967-rm6/"],
    notes_pl=(
        "RM6 — kompaktowa rozdzielnica pierścieniowa (RMU) Schneider Electric "
        "w izolacji SF6 dla sieci rozdzielczych SN, sieci otwartego pierścienia "
        "i promieniowe. Strona produktowa (odczyt 2026-08-14): do 24 kV, 630 A, "
        "prąd zwarciowy do 21 kA, odporność na łuk wewnętrzny do 20 kA AFLR. "
        "Status repo_verified — dane z publicznej strony produktowej, NIE "
        "official_catalog."
    ),
)

# =============================================================================
# Schneider Electric — RM AirSeT (RMU bez SF6)
# =============================================================================

SCHNEIDER__RM_AIRSET = SwitchgearFamily(
    switchgear_family_ref="SCHNEIDER__RM_AIRSET",
    manufacturer_ref="SCHNEIDER_ELECTRIC",
    family_name="RM AirSeT",
    series_name="RM AirSeT",
    product_line_code="RM_AIRSET",
    voltage_levels=[24.0],
    rated_current_options=[630],
    short_time_current_options=[20],  # 20 kA / 1 s (także warianty 20 kA / 3 s)
    insulation_type="mixed",  # czyste powietrze + aparatura próżniowa
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
    allowed_interlocks=["earthing_only_when_open"],
    supported_lod_profiles=["LOD0", "LOD1", "LOD2", "LOD3"],
    cad_footprint_ref=None,
    source_document_refs=["https://www.se.com/ww/en/product-range/21830554-rm-airset/"],
    source_version="public-product-page-2026-08-14",
    verified_at=None,
    lifecycle_status="current",
    status="repo_verified",
    source_refs=["https://www.se.com/ww/en/product-range/21830554-rm-airset/"],
    notes_pl=(
        "RM AirSeT — rozdzielnica pierścieniowa (RMU) Schneider Electric bez "
        "SF6: izolacja czystym powietrzem + technika próżniowa, odpowiednik "
        "funkcjonalny RM6. Karty produktowe (odczyt 2026-08-14): 24 kV, 630 A, "
        "20 kA / 1 s (warianty również 20 kA / 3 s), jednostki funkcjonalne "
        "I (rozłącznik), B/Q (rozłącznik z bezpiecznikami), konfiguracje 3- i "
        "4-funkcyjne. Status repo_verified — dane z publicznych stron "
        "produktowych, NIE official_catalog."
    ),
)

# =============================================================================
# Registry
# =============================================================================

_FAMILIES: tuple[SwitchgearFamily, ...] = (
    ZPUE_WLOSZCZOWA__ROTOBLOK,
    ZPUE_WLOSZCZOWA__ROTOBLOK_AIR,
    ZPUE_WLOSZCZOWA__ROTOBLOK_VCB,
    ZPUE_WLOSZCZOWA__RELF,
    ZPUE_WLOSZCZOWA__RELF_2S,
    ZPUE_WLOSZCZOWA__RXD,
    ZPUE_WLOSZCZOWA__TPM,
    ZPUE_WLOSZCZOWA__TPM_AIR,
    ELEKTROMETAL__E2ALPHA,
    ABB__UNIGEAR_ZS1,
    ABB__SAFERING,
    ABB__SAFEPLUS,
    ABB__UNISEC,
    SIEMENS__NXAIR,
    SIEMENS__8DJH,
    SCHNEIDER__SM6_24,
    SCHNEIDER__RM6,
    SCHNEIDER__RM_AIRSET,
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


#: Statusy rodziny, przy których katalog uznaje dane za potwierdzone źródłem
#: i pozwala BUDOWAĆ na rodzinie konfigurację (polityka
#: `SLD_MV_BAY_TEMPLATE_SOURCE_POLICY.md`). `requires_catalog` i `deprecated`
#: są poza tym zbiorem — rodzina istnieje w katalogu (nie niszczymy wiedzy o
#: realnym portfolio producenta), ale konfigurator jej NIE oferuje.
POTWIERDZONE_STATUSY_RODZINY: frozenset[str] = frozenset({"verified", "repo_verified"})


def list_offered_switchgear_families() -> list[SwitchgearFamily]:
    """Rodziny oferowane w konfiguratorze — z potwierdzonymi danymi źródłowymi.

    JEDNO źródło prawdy dla pytania „czy na tej rodzinie wolno budować":
    używa go zarówno walidator zgodności, jak i ścieżka szablonów pól, żeby
    rodzina bez karty katalogowej nie mogła wejść do oferty bocznymi drzwiami.
    """
    return [f for f in list_switchgear_families() if f.status in POTWIERDZONE_STATUSY_RODZINY]


def get_switchgear_family(switchgear_family_ref: str) -> SwitchgearFamily:
    """Pobiera rodzinę po ref. KeyError gdy brak."""
    if switchgear_family_ref not in SWITCHGEAR_FAMILY_REGISTRY:
        available = ", ".join(sorted(SWITCHGEAR_FAMILY_REGISTRY.keys()))
        raise KeyError(
            f"Unknown switchgear_family_ref: {switchgear_family_ref}. " f"Available: {available}"
        )
    return SWITCHGEAR_FAMILY_REGISTRY[switchgear_family_ref]
