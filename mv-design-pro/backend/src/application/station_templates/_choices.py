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

# Transformator POTRZEB WŁASNYCH stacji z jednostkami DER po stronie SN (farmy PV, BESS,
# hybrydy, wiatr). Rozstrzygnięcie architekta 2026-10-15: każda jednostka przyłączona po
# stronie SN ma WŁASNY transformator blokowy nN/SN dobierany z katalogu kaskadą toru DER-SN
# (`schema.dobor_toru_jednostki_der_sn`) — moc źródeł NIE płynie przez transformator stacji.
# Dawne `TR_BLOCK_PV/BESS/FW_OPTIONS` były transformatorami 15/0,4 kV stacji opisanymi jako
# „Block TR 0.4/15 kV" i dobieranymi do sumy mocy źródeł, które wcale przez nie nie płynęły.
# Transformator stacji zasila potrzeby własne i odbiory nN — wybór wg mocy wymaganej
# (`schema.rozstrzygnij_transformator_stacji`), domyślnie najmniejszy z typoszeregu.
TR_OPTIONS_POTRZEBY_WLASNE = TR_OPTIONS_SMALL

TR_OPTIONS_MEDIUM_20KV = (  # 400-1250 kVA, sieć 20 kV — stacja abonencka wariant 20 kV
    CatalogChoice("tr-sn-nn-20-04-400kva-dyn11", "TR 400 kVA SN/nN 20/0.4 kV", "TRAFO_SN_NN"),
    CatalogChoice(
        "tr-sn-nn-20-04-630kva-dyn11",
        "TR 630 kVA SN/nN 20/0.4 kV",
        "TRAFO_SN_NN",
        default=True,
    ),
    CatalogChoice("tr-sn-nn-20-04-1000kva-dyn11", "TR 1000 kVA SN/nN 20/0.4 kV", "TRAFO_SN_NN"),
    CatalogChoice("tr-sn-nn-20-04-1250kva-dyn11", "TR 1250 kVA SN/nN 20/0.4 kV", "TRAFO_SN_NN"),
)

# WN/SN transformer options (110/15 kV i 110/20 kV) — GPZ (rola A, V12T-016).
# Referencje z `mv_transformer_catalog.py::TRANSFORMER_WN_SN_110_15/_20`
# (PN-EN 60076-1:2011 / ZREW Transformatory specyfikacja typ T-42).
TR_OPTIONS_WN_SN_110_15 = (
    CatalogChoice("tr-wn-sn-110-15-10mva-yd11", "TR 110/15 kV 10 MVA Yd11", "TRAFO_SN_NN"),
    CatalogChoice("tr-wn-sn-110-15-16mva-yd11", "TR 110/15 kV 16 MVA Yd11", "TRAFO_SN_NN"),
    CatalogChoice(
        "tr-wn-sn-110-15-25mva-yd11", "TR 110/15 kV 25 MVA Yd11", "TRAFO_SN_NN", default=True
    ),
    CatalogChoice("tr-wn-sn-110-15-40mva-yd11", "TR 110/15 kV 40 MVA Yd11", "TRAFO_SN_NN"),
    CatalogChoice("tr-wn-sn-110-15-63mva-yd11", "TR 110/15 kV 63 MVA Yd11", "TRAFO_SN_NN"),
)

TR_OPTIONS_WN_SN_110_20 = (
    CatalogChoice("tr-wn-sn-110-20-10mva-yd11", "TR 110/20 kV 10 MVA Yd11", "TRAFO_SN_NN"),
    CatalogChoice(
        "tr-wn-sn-110-20-16mva-yd11", "TR 110/20 kV 16 MVA Yd11", "TRAFO_SN_NN", default=True
    ),
    CatalogChoice("tr-wn-sn-110-20-25mva-yd11", "TR 110/20 kV 25 MVA Yd11", "TRAFO_SN_NN"),
    CatalogChoice("tr-wn-sn-110-20-40mva-yd11", "TR 110/20 kV 40 MVA Yd11", "TRAFO_SN_NN"),
    CatalogChoice("tr-wn-sn-110-20-63mva-yd11", "TR 110/20 kV 63 MVA Yd11", "TRAFO_SN_NN"),
)

# Warunki zasilania GPZ (ZRODLO_SN) — równoważnik systemowy widziany z szyny SN
# GPZ (`mv_source_catalog.py::SOURCE_SYSTEM_TYPES`, "Warunki przyłączenia /
# standard OSD"). Transformator(y) WN/SN materializują się OBOK (tabliczka +
# SLD) — impedancja układu jest już ujęta w Sk3 równoważnika, więc kolejność
# NIE dubluje reaktancji (kontrakt `add_grid_source_sn`).
GPZ_SOURCE_OPTIONS_15 = (
    CatalogChoice("src-gpz-15kv-200mva-rx010", "Zasilanie GPZ 15 kV Sk3 200 MVA", "ZRODLO_SN"),
    CatalogChoice(
        "src-gpz-15kv-250mva-rx010",
        "Zasilanie GPZ 15 kV Sk3 250 MVA",
        "ZRODLO_SN",
        default=True,
    ),
    CatalogChoice("src-gpz-15kv-350mva-rx010", "Zasilanie GPZ 15 kV Sk3 350 MVA", "ZRODLO_SN"),
    CatalogChoice("src-gpz-15kv-500mva-rx010", "Zasilanie GPZ 15 kV Sk3 500 MVA", "ZRODLO_SN"),
)

GPZ_SOURCE_OPTIONS_20 = (
    CatalogChoice("src-gpz-20kv-200mva-rx010", "Zasilanie GPZ 20 kV Sk3 200 MVA", "ZRODLO_SN"),
    CatalogChoice(
        "src-gpz-20kv-250mva-rx010",
        "Zasilanie GPZ 20 kV Sk3 250 MVA",
        "ZRODLO_SN",
        default=True,
    ),
    CatalogChoice("src-gpz-20kv-350mva-rx012", "Zasilanie GPZ 20 kV Sk3 350 MVA", "ZRODLO_SN"),
    CatalogChoice("src-gpz-20kv-500mva-rx010", "Zasilanie GPZ 20 kV Sk3 500 MVA", "ZRODLO_SN"),
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

# Pozycje przekształtników dobierane przez szablony (decyzja właściciela 2026-10-15):
# WYŁĄCZNIE pozycje z kartą producenta (`mv_converter_catalog.dopuszczona_do_doboru_szablonu`,
# status ZWERYFIKOWANY). Rodzaje, dla których katalog nie ma ŻADNEJ takiej pozycji, są jawnym
# wyjątkiem z powodem (`WYJATKI_POZYCJI_BEZ_KARTY`) — przypina to test
# `test_sklad_der_szablonow_ze_zrodlem`.

# Falowniki PV po stronie nN 0,4 kV (prosument, stacja słupowa): SMA Sunny Tripower 8.0 i 10.0
# (karta producenta). Dawne pozycje 5/10/30 kW nie istniały w katalogu (karta katalogu: brak
# karty falownika 5 kW i 30 kW), a 50 kW i 0,5 MW przy 0,4 kV są modelami referencyjnymi.
PV_NN_OPTIONS = (
    CatalogChoice(
        "conv-pv-nn-sma-stp8p0-3av-40-0p4kv",
        "SMA Sunny Tripower 8.0 (8 kVA, 0,4 kV)",
        "ZRODLO_NN_PV",
    ),
    CatalogChoice(
        "conv-pv-nn-sma-stp10p0-3av-40-0p4kv",
        "SMA Sunny Tripower 10.0 (10 kVA, 0,4 kV)",
        "ZRODLO_NN_PV",
        default=True,
    ),
)

# Jednostki przyłączane po stronie SN przez WŁASNY transformator blokowy: pozycje po stronie
# nN (falownik/PCS/generator turbiny), nie „15 kV". Dawne pozycje `conv-*-15kv` ukrywały
# transformator blokowy w pozycji przekształtnika, a operacja stawiała je na szynie SN stacji.
# Lista zawiera WYŁĄCZNIE pozycje, dla których katalog ma transformator blokowy (przypięte
# testem: każda opcja każdego szablonu ma kompletny tor DER-SN). SMA SC 4000–4600 UP
# (4,0–4,6 MVA) mają kartę, ale katalog nie ma transformatora blokowego powyżej 3150 kVA
# (rozporządzenie 548/2014 podaje dla nich tylko PEI) — nie są opcją szablonu.
PV_SN_OPTIONS = (
    CatalogChoice(
        "conv-pv-nn-huawei-sun2000-330ktl-h1-0p8kv",
        "Huawei SUN2000-330KTL-H1 (330 kVA, 0,8 kV)",
        "ZRODLO_NN_PV",
        default=True,
    ),
    CatalogChoice(
        "conv-pv-nn-sma-sc2200-0p385kv",
        "SMA Sunny Central 2200 (2,2 MVA, 0,385 kV)",
        "ZRODLO_NN_PV",
    ),
    CatalogChoice(
        "conv-pv-nn-sma-sc2475-0p434kv",
        "SMA Sunny Central 2475 (2,475 MVA, 0,434 kV)",
        "ZRODLO_NN_PV",
    ),
)

BESS_SN_OPTIONS = (
    CatalogChoice("conv-bess-nn-0p5mw-0p69kv", "BESS 0,5 MW / 1 MWh 0,69 kV", "ZRODLO_NN_BESS"),
    CatalogChoice("conv-bess-nn-1mw-0p69kv", "BESS 1 MW / 2 MWh 0,69 kV", "ZRODLO_NN_BESS"),
    CatalogChoice("conv-bess-nn-2mw-0p69kv", "BESS 2 MW / 4 MWh 0,69 kV", "ZRODLO_NN_BESS"),
)

# Turbina 2 MW (strona sieciowa przekształtnika 0,69 kV; napięcie uzwojenia nN transformatora
# blokowego idzie z `un_kv` tabliczki pozycji, nie ze stałej szablonu) — jedyna pozycja wiatrowa, dla której katalog ma
# transformator blokowy: turbina 3 MW (S_n 3,3 MVA) wymaga jednostki powyżej 3150 kVA,
# a pozycji 1 MW katalog nie ma (brak karty z tabliczką).
FW_OPTIONS = (
    CatalogChoice("conv-wind-nn-2mw-0p69kv", "Turbina wiatrowa 2 MW 0,69 kV", "CONVERTER"),
)

#: Rodzaje DER, dla których katalog NIE MA żadnej pozycji z kartą producenta dopuszczonej do
#: doboru szablonu — szablony tych rodzajów wskazują modele referencyjne. Powód jest częścią
#: kontraktu (test przypina zbiór i treść), żeby dopisanie karty do katalogu zmieniło pin.
WYJATKI_POZYCJI_BEZ_KARTY: dict[str, str] = {
    "BESS": (
        "Żadna pozycja BESS katalogu nie ma statusu ZWERYFIKOWANY (karty producenta): "
        "Tesla Megapack 2 XL jest wyłącznie kopią karty na serwerze strony trzeciej "
        "(CZESCIOWO_ZWERYFIKOWANY), karta PCS Sungrow SC2000UD-MV jest deklarowana bez "
        "dokumentu w repozytorium (NIEWERYFIKOWANY), pozostałe pozycje to modele referencyjne."
    ),
    "FW": (
        "Żadna pozycja turbiny wiatrowej katalogu nie ma statusu ZWERYFIKOWANY (karty "
        "producenta): turbiny z nazwą producenta (Vestas V117, Siemens SWT-2.3, GE 158) są "
        "modelami referencyjnymi po stronie 15 kV, bez napięcia strony sieciowej przekształtnika z karty, którego "
        "wymaga tor przez własny transformator blokowy nN/SN."
    ),
}


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

# Referencje CT/VT MUSZĄ pochodzić z KANONICZNEGO katalogu MV — te same pozycje
# waliduje brama katalogowa operacji `add_ct`/`add_vt`. Wcześniejsze identyfikatory
# (`ct-400-5-5p20-15`, `vt-15kv-0.1kv-3p`) nie istniały w żadnym katalogu: szablon
# proponował pozycje, których model nie przyjmował (fabrykacja wyboru).
CT_OPTIONS = (
    CatalogChoice("ct_200_5_5p10_10va_abb", "CT 200/5 A, 5P10, 10 VA (ABB)", "CT"),
    CatalogChoice("ct_400_5_5p20_15va_abb", "CT 400/5 A, 5P20, 15 VA (ABB)", "CT", default=True),
    CatalogChoice("ct_600_5_5p20_15va_schneider", "CT 600/5 A, 5P20, 15 VA (Schneider)", "CT"),
    CatalogChoice("ct_1000_5_5p20_20va_abb", "CT 1000/5 A, 5P20, 20 VA (ABB)", "CT"),
)

VT_OPTIONS = (
    CatalogChoice("vt_15kv_100v_3p_abb", "VT 15 kV / 100 V, 3-fazowy (ABB)", "VT", default=True),
    CatalogChoice("vt_15kv_100v_05_abb", "VT 15 kV / 100 V, kl. 0,5 (ABB)", "VT"),
)

# Przekładniki KLASY POMIAROWEJ (rozliczeniowej) — stacja abonencka (rola C,
# V12T-016). Klasa dokładności "0.5" (nie "5P…", które jest klasą OCHRONNĄ) —
# rekordy z `mv_auxiliary_catalog.py::get_all_ct_types/get_all_vt_types`.
CT_METERING_OPTIONS = (
    CatalogChoice("ct_50_1_0_5_5va_arteche", "CT 50/1 A kl. 0,5 (rozliczeniowy)", "CT"),
    CatalogChoice(
        "ct_100_1_0_5_5va_abb",
        "CT 100/1 A kl. 0,5 (rozliczeniowy)",
        "CT",
        default=True,
    ),
    CatalogChoice("ct_150_1_0_5_10va_abb", "CT 150/1 A kl. 0,5 (rozliczeniowy)", "CT"),
)

VT_METERING_OPTIONS = (
    CatalogChoice(
        "vt_15kv_100v_05_abb",
        "VT 15 kV / 100 V kl. 0,5 (rozliczeniowy)",
        "VT",
        default=True,
    ),
)

VT_METERING_OPTIONS_20 = (
    CatalogChoice(
        "vt_20kv_100v_05_arteche",
        "VT 20 kV / 100 V kl. 0,5 (rozliczeniowy)",
        "VT",
        default=True,
    ),
)

# Bateria kondensatorów SN (KOMPENSATOR_SN) — kompensacja mocy biernej
# (rola E, V12T-016). Rekordy z `mv_shunt_capacitor_catalog.py` (referencyjne,
# B = Q_rated / U_rated² materializowane przez katalog).
KOMPENSATOR_OPTIONS_15 = (
    CatalogChoice("KOMP_SN_0V6_15KV", "Bateria kondensatorów SN 0,6 Mvar 15 kV", "KOMPENSATOR_SN"),
    CatalogChoice(
        "KOMP_SN_1V2_15KV",
        "Bateria kondensatorów SN 1,2 Mvar 15 kV",
        "KOMPENSATOR_SN",
        default=True,
    ),
    CatalogChoice("KOMP_SN_2V4_15KV", "Bateria kondensatorów SN 2,4 Mvar 15 kV", "KOMPENSATOR_SN"),
)

KOMPENSATOR_OPTIONS_20 = (
    CatalogChoice(
        "KOMP_SN_1V8_20KV",
        "Bateria kondensatorów SN 1,8 Mvar 20 kV",
        "KOMPENSATOR_SN",
        default=True,
    ),
    CatalogChoice("KOMP_SN_3V6_20KV", "Bateria kondensatorów SN 3,6 Mvar 20 kV", "KOMPENSATOR_SN"),
)


# =============================================================================
# DER specs (per kind)
# =============================================================================

DER_PV_NN = DerKindSpec(
    kind="PV",
    label_pl="Falownik PV nN (LV-side)",
    catalog_options=PV_NN_OPTIONS,
    default_count=1,
    default_p_mw_each=0.01,
    connection_variant_options=("nn_side",),
)

DER_PV_SN = DerKindSpec(
    kind="PV",
    label_pl="Falownik PV przez własny transformator blokowy nN/SN",
    catalog_options=PV_SN_OPTIONS,
    default_count=2,
    default_p_mw_each=0.33,
    connection_variant_options=("block_transformer",),
)

DER_BESS_SN = DerKindSpec(
    kind="BESS",
    label_pl="Magazyn BESS przez własny transformator blokowy nN/SN",
    catalog_options=BESS_SN_OPTIONS,
    default_count=1,
    default_p_mw_each=1.0,
    connection_variant_options=("block_transformer",),
)

DER_FW = DerKindSpec(
    kind="FW",
    label_pl="Turbina wiatrowa przez własny transformator blokowy nN/SN",
    catalog_options=FW_OPTIONS,
    default_count=1,
    default_p_mw_each=2.0,
    connection_variant_options=("block_transformer",),
)
