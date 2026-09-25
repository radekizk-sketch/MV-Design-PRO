"""
Golden Network Design System — 11-step E2E reference scenario.

Steps:
1. add_grid_source_sn — GPZ 15 kV, Sk3=500 MVA
2. continue_trunk_segment_sn — 320 m KABEL_SN (kab_sn_240_al_15kv)
3. insert_station_on_segment_sn — Stacja B (wariant 2)
4. continue_trunk_segment_sn — 200 m (second segment)
5. start_branch_segment_sn — 180 m branch
6. connect_secondary_ring_sn — ring closure
7. set_normal_open_point — NOP on ring switch
8. add_nn_load — 15 kW load on feeder nN
9. add_converter_source — 50 kVA PV on nN
10. attach_protection_to_cb — relay on station CB
11. run_short_circuit / run_power_flow (analysis)

This fixture provides canonical catalog bindings for all steps.
"""

from network_model.catalog.types import (
    BESSInverterType,
    CatalogBinding,
    CatalogNamespace,
    CTType,
    LoadType,
    LVApparatusType,
    LVCableType,
    MVApparatusType,
    PVInverterType,
    VTType,
)

# =============================================================================
# CANONICAL CATALOG DATA for golden network
# =============================================================================

GOLDEN_MV_APPARATUS = [
    MVApparatusType(
        id="cb_sn_630a",
        name="Wyłącznik próżniowy SN 630 A",
        device_kind="WYLACZNIK",
        u_n_kv=15.0,
        i_n_a=630.0,
        breaking_capacity_ka=25.0,
        making_capacity_ka=63.0,
        manufacturer="ABB",
    ),
    MVApparatusType(
        id="cb_sn_400a",
        name="Wyłącznik próżniowy SN 400 A",
        device_kind="WYLACZNIK",
        u_n_kv=15.0,
        i_n_a=400.0,
        breaking_capacity_ka=20.0,
        manufacturer="ABB",
    ),
    MVApparatusType(
        id="ls_sn_630a",
        name="Rozłącznik SN 630 A",
        device_kind="ROZLACZNIK",
        u_n_kv=15.0,
        i_n_a=630.0,
        manufacturer="ABB",
    ),
]

GOLDEN_LV_APPARATUS = [
    LVApparatusType(
        id="cb_nn_1000a",
        name="Wyłącznik główny nN 1000 A",
        device_kind="WYLACZNIK_GLOWNY",
        u_n_kv=0.4,
        i_n_a=1000.0,
        breaking_capacity_ka=50.0,
    ),
    LVApparatusType(
        id="cb_nn_1250a",
        name="Wyłącznik główny nN 1250 A",
        device_kind="WYLACZNIK_GLOWNY",
        u_n_kv=0.4,
        i_n_a=1250.0,
        breaking_capacity_ka=65.0,
    ),
    LVApparatusType(
        id="cb_nn_250a",
        name="Wyłącznik odpływowy nN 250 A",
        device_kind="WYLACZNIK_ODPLYWOWY",
        u_n_kv=0.4,
        i_n_a=250.0,
        breaking_capacity_ka=25.0,
    ),
    LVApparatusType(
        id="cb_nn_160a",
        name="Wyłącznik odpływowy nN 160 A",
        device_kind="WYLACZNIK_ODPLYWOWY",
        u_n_kv=0.4,
        i_n_a=160.0,
        breaking_capacity_ka=16.0,
    ),
]

GOLDEN_LV_CABLES = [
    LVCableType(
        id="kab_nn_4x120_al",
        name="YAKY 4×120 mm²",
        u_n_kv=0.4,
        r_ohm_per_km=0.253,
        x_ohm_per_km=0.069,
        i_max_a=240.0,
        conductor_material="AL",
        insulation_type="PVC",
        cross_section_mm2=120.0,
        number_of_cores=4,
    ),
    LVCableType(
        id="kab_nn_4x70_al",
        name="YAKY 4×70 mm²",
        u_n_kv=0.4,
        r_ohm_per_km=0.443,
        x_ohm_per_km=0.072,
        i_max_a=180.0,
        conductor_material="AL",
        insulation_type="PVC",
        cross_section_mm2=70.0,
        number_of_cores=4,
    ),
]

GOLDEN_LOADS = [
    LoadType(
        id="load_mieszk_15kw",
        name="Obciążenie mieszkaniowe 15 kW",
        model="PQ",
        p_kw=15.0,
        cos_phi=0.95,
        cos_phi_mode="IND",
    ),
    LoadType(
        id="load_uslugi_30kw",
        name="Obciążenie usługowe 30 kW",
        model="PQ",
        p_kw=30.0,
        cos_phi=0.92,
        cos_phi_mode="IND",
    ),
]

GOLDEN_CT_TYPES = [
    CTType(
        id="ct_400_5_5p20",
        name="CT 400/5 A kl. 5P20",
        ratio_primary_a=400.0,
        ratio_secondary_a=5.0,
        accuracy_class="5P20",
        burden_va=15.0,
    ),
    CTType(
        id="ct_200_5_5p20",
        name="CT 200/5 A kl. 5P20",
        ratio_primary_a=200.0,
        ratio_secondary_a=5.0,
        accuracy_class="5P20",
        burden_va=10.0,
    ),
]

GOLDEN_VT_TYPES = [
    VTType(
        id="vt_15kv_100v",
        name="VT 15 kV / 100 V kl. 0.5",
        ratio_primary_v=15000.0,
        ratio_secondary_v=100.0,
        accuracy_class="0.5",
    ),
]

GOLDEN_PV_INVERTERS = [
    PVInverterType(
        id="pv_inv_50kva",
        name="Falownik PV 50 kVA",
        s_n_kva=50.0,
        p_max_kw=50.0,
        cos_phi_min=0.9,
        cos_phi_max=1.0,
        control_mode="STALY_COS_PHI",
        manufacturer="SMA",
    ),
    PVInverterType(
        id="pv_inv_30kva",
        name="Falownik PV 30 kVA",
        s_n_kva=30.0,
        p_max_kw=30.0,
        cos_phi_min=0.9,
        cos_phi_max=1.0,
        manufacturer="Fronius",
    ),
]

GOLDEN_BESS_INVERTERS = [
    BESSInverterType(
        id="bess_50kw_100kwh",
        name="BESS 50 kW / 100 kWh",
        p_charge_kw=50.0,
        p_discharge_kw=50.0,
        e_kwh=100.0,
        s_n_kva=55.0,
    ),
]


# =============================================================================
# CATALOG BINDINGS for each step of the golden network
# =============================================================================

STEP_2_TRUNK_BINDING = CatalogBinding(
    catalog_namespace=CatalogNamespace.KABEL_SN.value,
    catalog_item_id="kab_sn_240_al_15kv",
    catalog_item_version="2026.02",
)

STEP_3_STATION_MV_CB_BINDING = CatalogBinding(
    catalog_namespace=CatalogNamespace.APARAT_SN.value,
    catalog_item_id="cb_sn_630a",
    catalog_item_version="2026.01",
)

STEP_3_STATION_TRAFO_BINDING = CatalogBinding(
    catalog_namespace=CatalogNamespace.TRAFO_SN_NN.value,
    catalog_item_id="tr_630kva_15_0_4",
    catalog_item_version="2026.02",
)

STEP_3_STATION_NN_MAIN_BINDING = CatalogBinding(
    catalog_namespace=CatalogNamespace.APARAT_NN.value,
    catalog_item_id="cb_nn_1000a",
    catalog_item_version="2026.01",
)

STEP_3_STATION_NN_OUT_BINDING = CatalogBinding(
    catalog_namespace=CatalogNamespace.APARAT_NN.value,
    catalog_item_id="cb_nn_250a",
    catalog_item_version="2026.01",
)

STEP_3_STATION_CT_BINDING = CatalogBinding(
    catalog_namespace=CatalogNamespace.CT.value,
    catalog_item_id="ct_400_5_5p20",
    catalog_item_version="2025.12",
)

STEP_8_LOAD_BINDING = CatalogBinding(
    catalog_namespace=CatalogNamespace.OBCIAZENIE.value,
    catalog_item_id="load_mieszk_15kw",
    catalog_item_version="2026.01",
)

STEP_9_PV_BINDING = CatalogBinding(
    catalog_namespace=CatalogNamespace.ZRODLO_NN_PV.value,
    catalog_item_id="pv_inv_50kva",
    catalog_item_version="2026.01",
)

STEP_10_RELAY_BINDING = CatalogBinding(
    catalog_namespace=CatalogNamespace.ZABEZPIECZENIE.value,
    catalog_item_id="REF-OC-EF-500",
    catalog_item_version="2026.01",
)


def get_golden_design_system_catalog_data():
    """Return all golden catalog data as dict records for CatalogRepository.from_records()."""
    return {
        "mv_apparatus_types": [t.to_dict() for t in GOLDEN_MV_APPARATUS],
        "lv_apparatus_types": [t.to_dict() for t in GOLDEN_LV_APPARATUS],
        "lv_cable_types": [t.to_dict() for t in GOLDEN_LV_CABLES],
        "load_types": [t.to_dict() for t in GOLDEN_LOADS],
        "ct_types": [t.to_dict() for t in GOLDEN_CT_TYPES],
        "vt_types": [t.to_dict() for t in GOLDEN_VT_TYPES],
        "pv_inverter_types": [t.to_dict() for t in GOLDEN_PV_INVERTERS],
        "bess_inverter_types": [t.to_dict() for t in GOLDEN_BESS_INVERTERS],
    }


def get_all_golden_bindings():
    """Return all step bindings as a list for determinism testing."""
    return [
        ("step_2_trunk", STEP_2_TRUNK_BINDING),
        ("step_3_mv_cb", STEP_3_STATION_MV_CB_BINDING),
        ("step_3_trafo", STEP_3_STATION_TRAFO_BINDING),
        ("step_3_nn_main", STEP_3_STATION_NN_MAIN_BINDING),
        ("step_3_nn_out", STEP_3_STATION_NN_OUT_BINDING),
        ("step_3_ct", STEP_3_STATION_CT_BINDING),
        ("step_8_load", STEP_8_LOAD_BINDING),
        ("step_9_pv", STEP_9_PV_BINDING),
        ("step_10_relay", STEP_10_RELAY_BINDING),
    ]
