from __future__ import annotations

from enm.catalog_completion import complete_catalog_defaults
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

CATALOG_KABEL_SN = "cable-tfk-yakxs-3x120"
CATALOG_KABEL_ENEA_SN = "cable-enea-operator-na2xs2y-1x150"
CATALOG_ZRODLO_SN = "src-gpz-15kv-250mva-rx010"


def _empty_enm() -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(
            name="test_catalog_materialization", defaults=ENMDefaults(sn_nominal_kv=15.0)
        ),
    )
    return enm.model_dump(mode="json")


def _add_gpz(enm_dict: dict) -> dict:
    result = execute_domain_operation(
        enm_dict=enm_dict,
        op_name="add_grid_source_sn",
        payload={
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "catalog_ref": CATALOG_ZRODLO_SN,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    assert result.get("snapshot") is not None
    return result["snapshot"]


def _add_segment_with_catalog(snapshot: dict, catalog_ref: str = CATALOG_KABEL_SN) -> dict:
    result = execute_domain_operation(
        enm_dict=snapshot,
        op_name="continue_trunk_segment_sn",
        payload={
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 500,
                "catalog_binding": {
                    "catalog_namespace": "KABEL_SN",
                    "catalog_item_id": catalog_ref,
                    "catalog_item_version": "2024.1",
                },
            },
        },
    )
    assert result.get("snapshot") is not None, f"Error: {result.get('error')}"
    return result["snapshot"]


def _get_first_cable_ref(snapshot: dict) -> str:
    for branch in snapshot.get("branches", []):
        if branch.get("type") in ("cable", "line_overhead"):
            return branch["ref_id"]
    raise AssertionError("Brak odcinka liniowego do testu")


class TestCatalogMaterializationPersistence:
    def test_trunk_persists_materialized_params_in_snapshot(self):
        enm = _empty_enm()
        snapshot = _add_gpz(enm)
        snapshot = _add_segment_with_catalog(snapshot)

        branch = next(
            branch
            for branch in snapshot.get("branches", [])
            if branch.get("type") in ("cable", "line_overhead")
        )
        assert branch.get("materialized_params") is not None
        assert branch["materialized_params"]["catalog_item_id"] == CATALOG_KABEL_SN
        assert branch.get("catalog_namespace") == "KABEL_SN"

    def test_trunk_persists_catalog_return_conductor_fields_in_snapshot(self):
        enm = _empty_enm()
        snapshot = _add_gpz(enm)
        snapshot = _add_segment_with_catalog(snapshot, CATALOG_KABEL_ENEA_SN)

        branch = next(
            branch for branch in snapshot.get("branches", []) if branch.get("type") == "cable"
        )

        assert branch["materialized_params"]["return_conductor_cross_section_mm2"] == 25
        assert branch["materialized_params"]["return_conductor_ith_1s_a"] == 3575
        assert branch["return_conductor_cross_section_mm2"] == 25
        assert branch["return_conductor_material"] == "CU"
        assert branch["return_conductor_ith_1s_a"] == 3575

    def test_legacy_snapshot_hydrates_return_conductor_from_catalog_ref(self):
        enm = _empty_enm()
        snapshot = _add_gpz(enm)
        snapshot = _add_segment_with_catalog(snapshot, CATALOG_KABEL_ENEA_SN)

        for branch in snapshot.get("branches", []):
            if branch.get("type") == "cable":
                branch.pop("materialized_params", None)
                branch.pop("return_conductor_cross_section_mm2", None)
                branch.pop("return_conductor_material", None)
                branch.pop("return_conductor_ith_1s_a", None)
                branch["catalog_namespace"] = "KABEL_SN"

        completed, changed = complete_catalog_defaults(EnergyNetworkModel.model_validate(snapshot))

        assert changed is True
        branch = next(branch for branch in completed.branches if branch.type == "cable")
        assert branch.materialized_params is not None
        assert branch.materialized_params["return_conductor_cross_section_mm2"] == 25
        assert branch.materialized_params["catalog_item_version"] == "2024.1"
        assert branch.return_conductor_cross_section_mm2 == 25
        assert branch.return_conductor_ith_1s_a == 3575

    def test_legacy_snapshot_backfills_zero_sequence_into_existing_materialization(self):
        enm = _empty_enm()
        snapshot = _add_gpz(enm)
        snapshot = _add_segment_with_catalog(snapshot, CATALOG_KABEL_ENEA_SN)

        for branch in snapshot.get("branches", []):
            if branch.get("type") == "cable":
                materialized = branch.get("materialized_params")
                assert isinstance(materialized, dict)
                materialized.pop("r0_ohm_per_km", None)
                materialized.pop("x0_ohm_per_km", None)
                branch.pop("r0_ohm_per_km", None)
                branch.pop("x0_ohm_per_km", None)
                branch["catalog_namespace"] = "KABEL_SN"

        completed, changed = complete_catalog_defaults(EnergyNetworkModel.model_validate(snapshot))

        assert changed is True
        branch = next(branch for branch in completed.branches if branch.type == "cable")
        assert branch.materialized_params is not None
        assert branch.materialized_params["r0_ohm_per_km"] == branch.r0_ohm_per_km
        assert branch.materialized_params["x0_ohm_per_km"] == branch.x0_ohm_per_km
        assert branch.r0_ohm_per_km is not None
        assert branch.x0_ohm_per_km is not None

    def test_reject_clear_catalog_for_physical_branch(self):
        enm = _empty_enm()
        snapshot = _add_gpz(enm)
        snapshot = _add_segment_with_catalog(snapshot)
        branch_ref = _get_first_cable_ref(snapshot)

        result = execute_domain_operation(
            enm_dict=snapshot,
            op_name="assign_catalog_to_element",
            payload={
                "element_ref": branch_ref,
                "catalog_item_id": None,
            },
        )

        assert result.get("error") is not None
        assert result["error_code"] == "catalog.clear_forbidden"
