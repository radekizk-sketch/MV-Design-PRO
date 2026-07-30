"""Reusable catalog choices dla station templates — K30-16.

Shared option sets used across multiple templates: transformer ratings,
nN CB sizes, DER catalogs, protection relays, switchgear families.
"""

from __future__ import annotations

from application.station_templates.schema import (
    CatalogChoice,
    DerKindSpec,
    ProtectionRelaySpec,
)

# =============================================================================
# Transformer options (TRAFO_SN_NN namespace)
# =============================================================================

# Transformer catalog IDs match mv_transformer_catalog.py convention
# (tr-sn-nn-{voltage_hv}-{voltage_lv}-{rating_kva}kva-{group})

TR_OPTIONS_SMALL = (  # 63-400 kVA — słupowe i małe dystrybucyjne
    CatalogChoice("tr-sn-nn-15-04-63kva-dyn11", "TR 63 kVA SN/nN 15/0.4 kV Dyn11", "TRAFO_SN_NN"),
    CatalogChoice("tr-sn-nn-15-04-100kva-dyn11", "TR 100 kVA SN/nN 15/0.4 kV Dyn11", "TRAFO_SN_NN"),
    CatalogChoice("tr-sn-nn-15-04-160kva-dyn11", "TR 160 kVA SN/nN 15/0.4 kV Dyn11", "TRAFO_SN_NN"),
    CatalogChoice("tr-sn-nn-15-04-250kva-dyn11", "TR 250 kVA SN/nN 15/0.4 kV Dyn11", "TRAFO_SN_NN"),
    CatalogChoice("tr-sn-nn-15-04-400kva-dyn11", "TR 400 kVA SN/nN 15/0.4 kV Dyn11", "TRAFO_SN_NN"),
)

TR_OPTIONS_MEDIUM = (  # 400-1600 kVA — typowe dystrybucyjne
    CatalogChoice("tr-sn-nn-15-04-400kva-dyn11", "TR 400 kVA SN/nN", "TRAFO_SN_NN"),
    CatalogChoice("tr-sn-nn-15-04-630kva-dyn11", "TR 630 kVA SN/nN", "TRAFO_SN_NN", default=True),
    CatalogChoice("tr-sn-nn-15-04-1000kva-dyn11", "TR 1000 kVA SN/nN", "TRAFO_SN_NN"),
    CatalogChoice("tr-sn-nn-15-04-1250kva-dyn11", "TR 1250 kVA SN/nN", "TRAFO_SN_NN"),
    CatalogChoice("tr-sn-nn-15-04-1600kva-dyn11", "TR 1600 kVA SN/nN", "TRAFO_SN_NN"),
)

TR_OPTIONS_LARGE = (  # 1600-2500 kVA — duże stacje przemysłowe
    CatalogChoice("tr-sn-nn-15-04-1600kva-dyn11", "TR 1600 kVA SN/nN", "TRAFO_SN_NN"),
    CatalogChoice("tr-sn-nn-15-04-2000kva-dyn11", "TR 2000 kVA SN/nN", "TRAFO_SN_NN"),
    CatalogChoice("tr-sn-nn-15-04-2500kva-dyn11", "TR 2500 kVA SN/nN", "TRAFO_SN_NN"),
)

# Block transformer options dla farmy PV/BESS/FW (SN-side connection)
TR_BLOCK_PV_OPTIONS = (
    CatalogChoice("tr-sn-nn-15-04-630kva-dyn11", "Block TR PV 0.63 MVA 0.4/15 kV", "TRAFO_SN_NN"),
    CatalogChoice("tr-sn-nn-15-04-1250kva-dyn11", "Block TR PV 1.25 MVA 0.4/15 kV", "TRAFO_SN_NN"),
    CatalogChoice("tr-sn-nn-15-04-2500kva-dyn11", "Block TR PV 2.5 MVA 0.4/15 kV", "TRAFO_SN_NN"),
)

TR_BLOCK_BESS_OPTIONS = (
    CatalogChoice("tr-sn-nn-15-04-1250kva-dyn11", "Block TR BESS 1.25 MVA", "TRAFO_SN_NN"),
    CatalogChoice("tr-sn-nn-15-04-2500kva-dyn11", "Block TR BESS 2.5 MVA", "TRAFO_SN_NN"),
)

TR_BLOCK_FW_OPTIONS = (
    CatalogChoice("tr-sn-nn-15-04-2500kva-dyn11", "Block TR Wiatr 2.5 MVA", "TRAFO_SN_NN"),
    # 2026-07-17 (spójność elektryczna szablonów): turbina 3 MW (tpl_wiatr_3mw)
    # wymaga TR blokowego ≥ 3000 kVA — typoszereg dystrybucyjny 15/0.4 kończy
    # się na 2500 kVA; 3.15 MVA istnieje w REFERENCYJNYM typoszeregu
    # transformatorów blokowych falowników (0.69 kV — standardowe napięcie
    # generatora turbiny). Przed tą zmianą walidacja domenowa
    # `converter.transformer_capacity_exceeded` blokowała uczciwie
    # spropagowaną moc 3 MW (wcześniej moc szablonu była gubiona — patrz
    # templates/wiatrowe.py).
    CatalogChoice(
        "tr-sn-nn-15-0p69-3p15mva-dyn11-inverter",
        "Block TR Wiatr 3.15 MVA (0.69 kV)",
        "TRAFO_SN_NN",
    ),
    # Turbina 3 MW ma moc POZORNĄ 3.3 MVA (katalog conv-wind-3mw: sn_mva=3.3)
    # — blok 3.15 MVA za mały; 4.0 MVA to następny krok typoszeregu
    # referencyjnego falowników.
    CatalogChoice(
        "tr-sn-nn-15-0p69-4mva-dyn11-inverter",
        "Block TR Wiatr 4.0 MVA (0.69 kV)",
        "TRAFO_SN_NN",
    ),
)


# =============================================================================
# nN feeder CB options (APARAT_NN namespace)
# =============================================================================

NN_CB_OPTIONS = (
    CatalogChoice("cb_nn_100a", "CB nN 100 A", "APARAT_NN"),
    CatalogChoice("cb_nn_160a", "CB nN 160 A", "APARAT_NN"),
    CatalogChoice("cb_nn_250a", "CB nN 250 A", "APARAT_NN"),
    CatalogChoice("cb_nn_400a", "CB nN 400 A", "APARAT_NN", default=True),
    CatalogChoice("cb_nn_630a", "CB nN 630 A", "APARAT_NN"),
)


# =============================================================================
# DER catalog options
# =============================================================================

PV_NN_OPTIONS = (
    CatalogChoice("conv-pv-residential-50kw-04kv", "PV 50 kW (μPV typ A NC RfG)", "ZRODLO_NN_PV"),
    CatalogChoice("conv-pv-nn-0p5mw-0p4kv", "PV 500 kW 0.4 kV", "ZRODLO_NN_PV"),
)

PV_SN_OPTIONS = (
    CatalogChoice("conv-pv-0.5mw-15kv", "PV 0.5 MW 15 kV", "ZRODLO_NN_PV", default=True),
    CatalogChoice("conv-pv-1mw-15kv", "PV 1 MW 15 kV", "ZRODLO_NN_PV"),
    CatalogChoice("conv-pv-2mw-15kv", "PV 2 MW 15 kV", "ZRODLO_NN_PV"),
    CatalogChoice("conv-pv-5mw-15kv", "PV 5 MW 15 kV", "ZRODLO_NN_PV"),
)

BESS_SN_OPTIONS = (
    CatalogChoice("conv-bess-0.5mw-1mwh-15kv", "BESS 0.5 MW / 1 MWh", "ZRODLO_NN_BESS"),
    CatalogChoice("conv-bess-1mw-2mwh-15kv", "BESS 1 MW / 2 MWh", "ZRODLO_NN_BESS"),
    CatalogChoice("conv-bess-2mw-4mwh-15kv", "BESS 2 MW / 4 MWh", "ZRODLO_NN_BESS"),
    CatalogChoice("conv-bess-5mw-10mwh-15kv", "BESS 5 MW / 10 MWh", "ZRODLO_NN_BESS"),
)

FW_OPTIONS = (
    CatalogChoice("conv-wind-2mw-15kv", "Wiatr 2 MW (Vestas V90)", "CONVERTER"),
    CatalogChoice("conv-wind-3mw-15kv", "Wiatr 3 MW (Vestas V112)", "CONVERTER"),
)


# =============================================================================
# Protection relay options (per device type)
# =============================================================================

PROT_FEEDER_OPTIONS = (
    ProtectionRelaySpec(
        device_catalog_ref="EM_E2TANGO_600",
        label_pl="Elektrometal e2TANGO-600 (feeder PL)",
        vendor="ELEKTROMETAL",
        settings_template_id="tpl_feeder_15kv_typowa",
        badge_pl="PTPiREE",
    ),
    ProtectionRelaySpec(
        device_catalog_ref="SIEMENS_7SJ82",
        label_pl="Siemens SIPROTEC 7SJ82",
        vendor="SIEMENS",
        settings_template_id="tpl_feeder_15kv_typowa",
    ),
    ProtectionRelaySpec(
        device_catalog_ref="ABB_REF615",
        label_pl="ABB Relion REF615",
        vendor="ABB",
        settings_template_id="tpl_feeder_15kv_typowa",
    ),
    ProtectionRelaySpec(
        device_catalog_ref="SCHNEIDER_P3M30",
        label_pl="Schneider Easergy P3M30",
        vendor="SCHNEIDER",
        settings_template_id="tpl_feeder_15kv_typowa",
    ),
)

PROT_TRANSFORMER_OPTIONS = (
    ProtectionRelaySpec(
        device_catalog_ref="EM_E2TANGO_800",
        label_pl="Elektrometal e2TANGO-800 z 87T",
        vendor="ELEKTROMETAL",
        settings_template_id="tpl_transformer_diff_typowa",
        badge_pl="PTPiREE",
    ),
    ProtectionRelaySpec(
        device_catalog_ref="SIEMENS_7UT85",
        label_pl="Siemens SIPROTEC 7UT85",
        vendor="SIEMENS",
        settings_template_id="tpl_transformer_diff_typowa",
    ),
    ProtectionRelaySpec(
        device_catalog_ref="ABB_RET615",
        label_pl="ABB Relion RET615",
        vendor="ABB",
        settings_template_id="tpl_transformer_diff_typowa",
    ),
)

PROT_GENERATOR_OPTIONS = (
    ProtectionRelaySpec(
        device_catalog_ref="EM_E2TANGO_1200",
        label_pl="Elektrometal e2TANGO-1200 flagship",
        vendor="ELEKTROMETAL",
        settings_template_id="tpl_generator_full",
        badge_pl="PTPiREE",
    ),
    ProtectionRelaySpec(
        device_catalog_ref="SIEMENS_7UM85",
        label_pl="Siemens SIPROTEC 7UM85",
        vendor="SIEMENS",
        settings_template_id="tpl_generator_full",
    ),
    ProtectionRelaySpec(
        device_catalog_ref="ABB_REG670",
        label_pl="ABB Relion REG670",
        vendor="ABB",
        settings_template_id="tpl_generator_full",
    ),
    ProtectionRelaySpec(
        device_catalog_ref="ENERGOTEST_GMG110",
        label_pl="Energotest GMG-110 (PL)",
        vendor="ENERGOTEST",
        settings_template_id="tpl_generator_full",
        badge_pl="PTPiREE",
    ),
)


# =============================================================================
# Aparatura pól SN (APARAT_SN) — B-12: szablon WSKAZUJE aparat, nie zgaduje go
# operacja domenowa. Referencje z katalogu `mv_switch_catalog` (typoszereg 17,5 kV
# dla sieci 15 kV: wyłączniki VD4/3AH5, rozłączniki NAL/RM6 dla pól liniowych
# stacji wnętrzowych). Projektant zmienia wybór w kreatorze stacji.
# =============================================================================

SN_APPARATUS_OPTIONS = (
    CatalogChoice(
        "sw-cb-abb-vd4-17kv-630a",
        "Wyłącznik ABB VD4 17,5 kV 630 A",
        "APARAT_SN",
        default=True,
    ),
    CatalogChoice(
        "sw-cb-abb-vd4-17kv-1250a",
        "Wyłącznik ABB VD4 17,5 kV 1250 A",
        "APARAT_SN",
    ),
    CatalogChoice(
        "sw-cb-siemens-3ah5-17kv-1250a",
        "Wyłącznik Siemens 3AH5 17,5 kV 1250 A",
        "APARAT_SN",
    ),
    CatalogChoice(
        "sw-ls-schneider-rm6-17kv-400a",
        "Rozłącznik Schneider RM6 17,5 kV 400 A",
        "APARAT_SN",
    ),
    CatalogChoice(
        "sw-ds-abb-ojs-17kv-630a",
        "Odłącznik ABB OJS 17,5 kV 630 A",
        "APARAT_SN",
    ),
)


# =============================================================================
# CT/VT options
# =============================================================================

CT_OPTIONS = (
    CatalogChoice("ct-200-5-5p20-15", "CT 200/5 A, 5P20, 15 kV", "CT"),
    CatalogChoice("ct-400-5-5p20-15", "CT 400/5 A, 5P20, 15 kV", "CT", default=True),
    CatalogChoice("ct-600-5-5p20-15", "CT 600/5 A, 5P20, 15 kV", "CT"),
    CatalogChoice("ct-1000-5-5p20-15", "CT 1000/5 A, 5P20, 15 kV", "CT"),
)

VT_OPTIONS = (
    CatalogChoice("vt-15kv-0.1kv-3p", "VT 15 kV / 100 V, 3-phase", "VT", default=True),
    CatalogChoice("vt-15kv-0.1kv-1p", "VT 15 kV / 100 V, 1-phase", "VT"),
)


# =============================================================================
# DER specs (per kind)
# =============================================================================

DER_PV_NN = DerKindSpec(
    kind="PV",
    label_pl="Falownik PV nN (LV-side)",
    catalog_options=PV_NN_OPTIONS,
    default_count=1,
    default_p_mw_each=0.05,
    connection_variant_options=("nn_side",),
)

DER_PV_SN = DerKindSpec(
    kind="PV",
    label_pl="Falownik PV SN przez block TR",
    catalog_options=PV_SN_OPTIONS,
    default_count=2,
    default_p_mw_each=0.5,
    connection_variant_options=("block_transformer",),
)

DER_BESS_SN = DerKindSpec(
    kind="BESS",
    label_pl="Magazyn BESS SN przez block TR",
    catalog_options=BESS_SN_OPTIONS,
    default_count=1,
    default_p_mw_each=1.0,
    connection_variant_options=("block_transformer",),
)

DER_FW = DerKindSpec(
    kind="FW",
    label_pl="Turbina wiatrowa",
    catalog_options=FW_OPTIONS,
    default_count=1,
    default_p_mw_each=2.0,
    connection_variant_options=("block_transformer",),
)
