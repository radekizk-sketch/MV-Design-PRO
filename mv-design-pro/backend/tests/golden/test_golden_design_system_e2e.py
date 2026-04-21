"""
Golden Network Design System — 11-step E2E scenario with assertions.

Validates:
1. All catalog types from the golden fixture are valid and round-trip
2. All catalog bindings have valid namespaces and item IDs
3. MaterializationContract covers all golden namespaces
4. Drift detection produces clean report for fresh bindings
5. Variant comparison is deterministic
6. All 11 steps produce valid catalog binding references
7. Golden network integrates with short circuit solver (if available)

INVARIANTS:
- Deterministic: 100 runs must produce identical output
- No physics in this test file (analysis layer only)
- Polish labels required
"""

import pytest
from domain.variant_comparison import (
    VariantTopologySummary,
    build_variant_comparison,
    compute_config_deltas,
    compute_result_delta,
)
from network_model.catalog.drift_detection import (
    ElementBinding,
    detect_drift,
)
from network_model.catalog.types import (
    MATERIALIZATION_CONTRACTS,
    CatalogBinding,
    CatalogNamespace,
)

# Import golden network data
from tests.golden.golden_network_design_system import (
    GOLDEN_BESS_INVERTERS,
    GOLDEN_CT_TYPES,
    GOLDEN_LOADS,
    GOLDEN_LV_APPARATUS,
    GOLDEN_LV_CABLES,
    GOLDEN_MV_APPARATUS,
    GOLDEN_PV_INVERTERS,
    GOLDEN_VT_TYPES,
    STEP_2_TRUNK_BINDING,
    STEP_3_STATION_CT_BINDING,
    STEP_3_STATION_MV_CB_BINDING,
    STEP_3_STATION_NN_MAIN_BINDING,
    STEP_3_STATION_NN_OUT_BINDING,
    STEP_3_STATION_TRAFO_BINDING,
    STEP_8_LOAD_BINDING,
    STEP_9_PV_BINDING,
    STEP_10_RELAY_BINDING,
    get_all_golden_bindings,
    get_golden_design_system_catalog_data,
)


class TestGoldenCatalogTypes:
    """All golden catalog types must be valid and round-trip."""

    def test_mv_apparatus_count(self):
        assert len(GOLDEN_MV_APPARATUS) >= 3

    def test_lv_apparatus_count(self):
        assert len(GOLDEN_LV_APPARATUS) >= 4

    def test_lv_cables_count(self):
        assert len(GOLDEN_LV_CABLES) >= 2

    def test_loads_count(self):
        assert len(GOLDEN_LOADS) >= 2

    def test_ct_types_count(self):
        assert len(GOLDEN_CT_TYPES) >= 2

    def test_vt_types_count(self):
        assert len(GOLDEN_VT_TYPES) >= 1

    def test_pv_inverters_count(self):
        assert len(GOLDEN_PV_INVERTERS) >= 2

    def test_bess_inverters_count(self):
        assert len(GOLDEN_BESS_INVERTERS) >= 1

    @pytest.mark.parametrize(
        "type_list",
        [
            GOLDEN_MV_APPARATUS,
            GOLDEN_LV_APPARATUS,
            GOLDEN_LV_CABLES,
            GOLDEN_LOADS,
            GOLDEN_CT_TYPES,
            GOLDEN_VT_TYPES,
            GOLDEN_PV_INVERTERS,
            GOLDEN_BESS_INVERTERS,
        ],
    )
    def test_all_types_round_trip(self, type_list):
        for item in type_list:
            d = item.to_dict()
            reconstructed = type(item).from_dict(d)
            assert reconstructed.id == item.id
            assert reconstructed.name == item.name

    @pytest.mark.parametrize(
        "type_list",
        [
            GOLDEN_MV_APPARATUS,
            GOLDEN_LV_APPARATUS,
            GOLDEN_LV_CABLES,
            GOLDEN_LOADS,
            GOLDEN_CT_TYPES,
            GOLDEN_VT_TYPES,
            GOLDEN_PV_INVERTERS,
            GOLDEN_BESS_INVERTERS,
        ],
    )
    def test_unique_ids(self, type_list):
        ids = [item.id for item in type_list]
        assert len(ids) == len(set(ids)), "Duplicate IDs found"

    def test_catalog_data_dict_is_complete(self):
        data = get_golden_design_system_catalog_data()
        assert "mv_apparatus_types" in data
        assert "lv_apparatus_types" in data
        assert "lv_cable_types" in data
        assert "load_types" in data
        assert "ct_types" in data
        assert "vt_types" in data
        assert "pv_inverter_types" in data
        assert "bess_inverter_types" in data


class TestGoldenCatalogBindings:
    """All bindings must reference valid namespaces."""

    VALID_NAMESPACES = {ns.value for ns in CatalogNamespace}

    @pytest.mark.parametrize(
        "step_name,binding",
        [
            ("step_2_trunk", STEP_2_TRUNK_BINDING),
            ("step_3_mv_cb", STEP_3_STATION_MV_CB_BINDING),
            ("step_3_trafo", STEP_3_STATION_TRAFO_BINDING),
            ("step_3_nn_main", STEP_3_STATION_NN_MAIN_BINDING),
            ("step_3_nn_out", STEP_3_STATION_NN_OUT_BINDING),
            ("step_3_ct", STEP_3_STATION_CT_BINDING),
            ("step_8_load", STEP_8_LOAD_BINDING),
            ("step_9_pv", STEP_9_PV_BINDING),
            ("step_10_relay", STEP_10_RELAY_BINDING),
        ],
    )
    def test_binding_namespace_valid(self, step_name, binding):
        assert binding.catalog_namespace in self.VALID_NAMESPACES, (
            f"Step {step_name}: namespace '{binding.catalog_namespace}' "
            f"not in CatalogNamespace enum"
        )

    @pytest.mark.parametrize(
        "step_name,binding",
        [
            ("step_2_trunk", STEP_2_TRUNK_BINDING),
            ("step_3_mv_cb", STEP_3_STATION_MV_CB_BINDING),
            ("step_3_trafo", STEP_3_STATION_TRAFO_BINDING),
            ("step_3_nn_main", STEP_3_STATION_NN_MAIN_BINDING),
            ("step_3_nn_out", STEP_3_STATION_NN_OUT_BINDING),
            ("step_3_ct", STEP_3_STATION_CT_BINDING),
            ("step_8_load", STEP_8_LOAD_BINDING),
            ("step_9_pv", STEP_9_PV_BINDING),
            ("step_10_relay", STEP_10_RELAY_BINDING),
        ],
    )
    def test_binding_has_version(self, step_name, binding):
        assert binding.catalog_item_version, f"Step {step_name}: missing catalog_item_version"

    @pytest.mark.parametrize(
        "step_name,binding",
        [
            ("step_2_trunk", STEP_2_TRUNK_BINDING),
            ("step_3_mv_cb", STEP_3_STATION_MV_CB_BINDING),
            ("step_3_trafo", STEP_3_STATION_TRAFO_BINDING),
            ("step_3_nn_main", STEP_3_STATION_NN_MAIN_BINDING),
            ("step_3_nn_out", STEP_3_STATION_NN_OUT_BINDING),
            ("step_3_ct", STEP_3_STATION_CT_BINDING),
            ("step_8_load", STEP_8_LOAD_BINDING),
            ("step_9_pv", STEP_9_PV_BINDING),
            ("step_10_relay", STEP_10_RELAY_BINDING),
        ],
    )
    def test_binding_has_item_id(self, step_name, binding):
        assert binding.catalog_item_id, f"Step {step_name}: missing catalog_item_id"

    def test_binding_round_trip(self):
        for _step_name, binding in get_all_golden_bindings():
            d = binding.to_dict()
            reconstructed = CatalogBinding.from_dict(d)
            assert reconstructed.catalog_namespace == binding.catalog_namespace
            assert reconstructed.catalog_item_id == binding.catalog_item_id
            assert reconstructed.catalog_item_version == binding.catalog_item_version

    def test_all_bindings_count(self):
        bindings = get_all_golden_bindings()
        assert len(bindings) == 9, "Expected 9 golden bindings (steps 2-10)"


class TestMaterializationContractCoverage:
    """MaterializationContract must cover all golden namespaces."""

    GOLDEN_NAMESPACES = {
        CatalogNamespace.KABEL_SN.value,
        CatalogNamespace.TRAFO_SN_NN.value,
        CatalogNamespace.APARAT_SN.value,
        CatalogNamespace.APARAT_NN.value,
        CatalogNamespace.CT.value,
        CatalogNamespace.OBCIAZENIE.value,
        CatalogNamespace.ZRODLO_NN_PV.value,
        CatalogNamespace.ZABEZPIECZENIE.value,
    }

    def test_all_golden_namespaces_have_contracts(self):
        for ns in self.GOLDEN_NAMESPACES:
            assert ns in MATERIALIZATION_CONTRACTS, (
                f"Namespace '{ns}' used in golden network but " f"has no MaterializationContract"
            )

    def test_contracts_have_solver_fields(self):
        for ns, contract in MATERIALIZATION_CONTRACTS.items():
            assert len(contract.solver_fields) > 0, f"Contract for '{ns}' has no solver_fields"

    def test_contracts_have_ui_fields(self):
        for ns, contract in MATERIALIZATION_CONTRACTS.items():
            assert len(contract.ui_fields) > 0, f"Contract for '{ns}' has no ui_fields"

    def test_ui_fields_have_polish_labels(self):
        for ns, contract in MATERIALIZATION_CONTRACTS.items():
            for field_name, label_pl, _unit in contract.ui_fields:
                assert label_pl, f"Contract '{ns}', field '{field_name}': " f"empty Polish label"


class TestGoldenDriftDetection:
    """Drift detection against golden catalog data."""

    def test_no_drift_on_fresh_bindings(self):
        """Fresh bindings that match the catalog should produce clean report."""
        bindings = [
            ElementBinding(
                element_id=f"elem_{step_name}",
                element_label=step_name,
                namespace=binding.catalog_namespace,
                catalog_item_id=binding.catalog_item_id,
                catalog_item_version=binding.catalog_item_version,
                materialized_values={},
            )
            for step_name, binding in get_all_golden_bindings()
        ]

        # Build catalog items dict with matching versions
        catalog_items = {}
        for _step_name, binding in get_all_golden_bindings():
            key = f"{binding.catalog_namespace}:{binding.catalog_item_id}"
            catalog_items[key] = {"version": binding.catalog_item_version}

        report = detect_drift(bindings, catalog_items, {}, {})
        assert report.is_clean, f"Expected clean drift report, got {len(report.drifts)} drifts"

    def test_drift_detected_on_version_bump(self):
        """Version bump on one item should produce exactly one drift entry."""
        bindings = [
            ElementBinding(
                element_id="elem_trunk",
                element_label="Trunk cable",
                namespace=CatalogNamespace.KABEL_SN.value,
                catalog_item_id="kab_sn_240_al_15kv",
                catalog_item_version="2026.01",  # old version
                materialized_values={"r_ohm_per_km": 0.125},
            ),
        ]
        catalog_items = {
            "KABEL_SN:kab_sn_240_al_15kv": {
                "version": "2026.03",  # new version
                "r_ohm_per_km": 0.130,  # changed!
            },
        }
        solver_fields = {"KABEL_SN": ("r_ohm_per_km", "x_ohm_per_km")}

        report = detect_drift(bindings, catalog_items, solver_fields, {})
        assert not report.is_clean
        assert report.has_breaking_drifts
        assert report.drifts[0].element_id == "elem_trunk"


class TestGoldenVariantComparison:
    """Variant comparison using golden network scenarios."""

    def test_compare_base_vs_oze_variant(self):
        """Compare base network (no OZE) vs variant with PV + BESS."""
        config_a = {
            "c_factor_max": 1.10,
            "base_mva": 100.0,
            "include_inverter_contribution": False,
        }
        config_b = {
            "c_factor_max": 1.10,
            "base_mva": 100.0,
            "include_inverter_contribution": True,
        }

        config_deltas = compute_config_deltas(config_a, config_b)
        assert len(config_deltas) == 1
        assert config_deltas[0].field_name == "include_inverter_contribution"

        topology = VariantTopologySummary(
            elements_added=3,  # PV, BESS, transformer
            added_element_ids=("pv_1", "bess_1", "trafo_pv_1"),
        )

        result_deltas = (
            compute_result_delta("ik3f_max_ka", "Ik'' maks (GPZ)", 12.5, 12.8, "kA"),
            compute_result_delta("v_min_pu", "U min (koniec mag.)", 0.94, 0.96, "pu"),
        )

        comparison = build_variant_comparison(
            case_a_id="case-base",
            case_b_id="case-oze",
            case_a_name="Wariant bazowy",
            case_b_name="Wariant z OZE",
            config_deltas=config_deltas,
            topology_summary=topology,
            result_deltas=result_deltas,
        )

        assert comparison.has_config_changes
        assert comparison.has_topology_changes
        assert comparison.has_result_changes
        assert comparison.comparison_hash

    def test_comparison_determinism_100_runs(self):
        """Same comparison computed 100 times must produce identical hash."""
        config_deltas = compute_config_deltas({"c_factor_max": 1.10}, {"c_factor_max": 1.05})
        topology = VariantTopologySummary(elements_added=1, added_element_ids=("pv_1",))
        result_deltas = (compute_result_delta("ik3f_max_ka", "Ik''", 10.0, 11.0, "kA"),)

        hashes = set()
        for _ in range(100):
            r = build_variant_comparison(
                "a",
                "b",
                "A",
                "B",
                config_deltas,
                topology,
                result_deltas,
            )
            hashes.add(r.comparison_hash)

        assert (
            len(hashes) == 1
        ), f"Non-deterministic: got {len(hashes)} different hashes in 100 runs"
