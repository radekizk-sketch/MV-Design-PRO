"""
Testy BranchPointSN — formalny model Pydantic dla punktu rozgałęzienia SN.

Weryfikuje:
1. BranchPointSN Pydantic model — poprawna walidacja i serializacja
2. EnergyNetworkModel.branch_points — pole formalne (nie raw dict)
3. Odróżnienie BranchPoleMV od ZksnMV w modelu
4. Materialized params + completeness_status w operacjach domenowych
5. Fix actions dla branch_point codes
"""

from __future__ import annotations

import pytest
from domain.readiness_fix_actions import KNOWN_BLOCKER_CODES, resolve_fix_action
from enm.domain_operations import execute_domain_operation
from enm.models import (
    BranchPointSN,
    BranchPointSNPorts,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
)

CATALOG_ZRODLO_SN = "src-gpz-15kv-250mva-rx010"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _empty_enm() -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="test_bp_sn", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    )
    return enm.model_dump(mode="json")


def _seed_with_overhead_segment() -> tuple[dict, str]:
    s0 = _empty_enm()
    s1 = execute_domain_operation(
        s0,
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": CATALOG_ZRODLO_SN},
    )["snapshot"]
    s2 = execute_domain_operation(
        s1,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "LINIA_NAPOWIETRZNA",
                "dlugosc_m": 1000,
                "catalog_ref": "line-base-al-st-70",
            }
        },
    )["snapshot"]
    seg_id = next(b["ref_id"] for b in s2["branches"] if b["type"] == "line_overhead")
    return s2, seg_id


def _seed_with_cable_segment() -> tuple[dict, str]:
    s0 = _empty_enm()
    s1 = execute_domain_operation(
        s0,
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": CATALOG_ZRODLO_SN},
    )["snapshot"]
    s2 = execute_domain_operation(
        s1,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 500, "catalog_ref": "cable-tfk-yakxs-3x120"}},
    )["snapshot"]
    seg_id = next(b["ref_id"] for b in s2["branches"] if b["type"] == "cable")
    return s2, seg_id


# ---------------------------------------------------------------------------
# 1. BranchPointSN Pydantic model
# ---------------------------------------------------------------------------


class TestBranchPointSNModel:
    def test_branch_pole_model_validates(self) -> None:
        bp = BranchPointSN(
            ref_id="bp-001",
            name="Słup rozgałęźny T1",
            branch_point_type="branch_pole",
            parent_segment_id="seg-A",
            bus_ref="bus-bp-001",
            catalog_ref="SŁUP-ODG-12",
            source_mode="KATALOG",
            ports=BranchPointSNPorts(MAIN_IN="bus-A", MAIN_OUT="bus-B", BRANCH=["bus-bp-br-1"]),
            completeness_status="KOMPLETNY",
        )
        assert bp.branch_point_type == "branch_pole"
        assert bp.completeness_status == "KOMPLETNY"
        assert bp.source_mode == "KATALOG"

    def test_zksn_model_validates(self) -> None:
        bp = BranchPointSN(
            ref_id="bp-002",
            name="ZKSN T2",
            branch_point_type="zksn",
            parent_segment_id="seg-B",
            bus_ref="bus-bp-002",
            catalog_ref="ZKSN-2P",
            source_mode="KATALOG",
            switch_state="closed",
            ports=BranchPointSNPorts(
                MAIN_IN="bus-C", MAIN_OUT="bus-D", BRANCH=["bus-br-1", "bus-br-2"]
            ),
            completeness_status="KOMPLETNY",
        )
        assert bp.branch_point_type == "zksn"
        assert bp.switch_state == "closed"
        assert len(bp.ports.BRANCH) == 2

    def test_no_catalog_ref_gives_brak_katalogu(self) -> None:
        bp = BranchPointSN(
            ref_id="bp-003",
            name="Słup bez katalogu",
            branch_point_type="branch_pole",
            parent_segment_id="seg-C",
            bus_ref="bus-bp-003",
            completeness_status="BRAK_KATALOGU",
        )
        assert bp.catalog_ref is None
        assert bp.completeness_status == "BRAK_KATALOGU"

    def test_branch_pole_and_zksn_are_distinct_types(self) -> None:
        bp_pole = BranchPointSN(
            ref_id="bp-pole",
            name="Słup",
            branch_point_type="branch_pole",
            parent_segment_id="seg",
            bus_ref="bus",
        )
        bp_zksn = BranchPointSN(
            ref_id="bp-zksn",
            name="ZKSN",
            branch_point_type="zksn",
            parent_segment_id="seg",
            bus_ref="bus",
        )
        assert bp_pole.branch_point_type != bp_zksn.branch_point_type
        assert bp_pole.branch_point_type == "branch_pole"
        assert bp_zksn.branch_point_type == "zksn"

    def test_pydantic_roundtrip(self) -> None:
        bp = BranchPointSN(
            ref_id="bp-rt",
            name="ZKSN roundtrip",
            branch_point_type="zksn",
            parent_segment_id="seg-rt",
            bus_ref="bus-rt",
            catalog_ref="ZKSN-2P",
            catalog_namespace="mv_branch_points",
            catalog_version="1.0",
            source_mode="KATALOG",
            switch_state="open",
            ports=BranchPointSNPorts(
                MAIN_IN="bus-rt-in", MAIN_OUT="bus-rt-out", BRANCH=["bus-rt-br"]
            ),
            completeness_status="KOMPLETNY",
            runtime_inputs={"branch_ports_count": 1, "insert_at": {"mode": "RATIO", "value": 0.5}},
        )
        data = bp.model_dump(mode="json")
        restored = BranchPointSN.model_validate(data)
        assert restored.ref_id == bp.ref_id
        assert restored.branch_point_type == "zksn"
        assert restored.ports is not None
        assert restored.ports.BRANCH == ["bus-rt-br"]
        assert restored.runtime_inputs is not None


# ---------------------------------------------------------------------------
# 2. EnergyNetworkModel with branch_points field
# ---------------------------------------------------------------------------


class TestEnergyNetworkModelBranchPoints:
    def test_empty_enm_has_branch_points_list(self) -> None:
        enm = EnergyNetworkModel(
            header=ENMHeader(name="test_bp_field"),
        )
        assert hasattr(enm, "branch_points")
        assert isinstance(enm.branch_points, list)
        assert len(enm.branch_points) == 0

    def test_enm_model_dump_includes_branch_points(self) -> None:
        enm = EnergyNetworkModel(
            header=ENMHeader(name="test_dump"),
            branch_points=[
                BranchPointSN(
                    ref_id="bp-1",
                    name="Słup T1",
                    branch_point_type="branch_pole",
                    parent_segment_id="seg-1",
                    bus_ref="bus-bp-1",
                    catalog_ref="SŁUP-001",
                    completeness_status="KOMPLETNY",
                )
            ],
        )
        data = enm.model_dump(mode="json")
        assert "branch_points" in data
        assert len(data["branch_points"]) == 1
        assert data["branch_points"][0]["branch_point_type"] == "branch_pole"

    def test_enm_validate_with_branch_points(self) -> None:
        """Branch points survive round-trip through model validation."""
        enm = EnergyNetworkModel(
            header=ENMHeader(name="test_validate"),
            branch_points=[
                BranchPointSN(
                    ref_id="bp-v",
                    name="ZKSN V",
                    branch_point_type="zksn",
                    parent_segment_id="seg-v",
                    bus_ref="bus-bp-v",
                    catalog_ref="ZKSN-2P",
                    completeness_status="KOMPLETNY",
                )
            ],
        )
        data = enm.model_dump(mode="json")
        restored = EnergyNetworkModel.model_validate(data)
        assert len(restored.branch_points) == 1
        assert restored.branch_points[0].branch_point_type == "zksn"


# ---------------------------------------------------------------------------
# 3. Domain operations produce branch_points that are schema-valid
# ---------------------------------------------------------------------------


class TestDomainOperationsBranchPointSchemaValid:
    def test_insert_branch_pole_snapshot_schema_validates(self) -> None:
        snapshot, seg_id = _seed_with_overhead_segment()
        result = execute_domain_operation(
            snapshot,
            "insert_branch_pole_on_segment_sn",
            {
                "segment_id": seg_id,
                "catalog_ref": "SŁUP-ODG-12",
                "catalog_namespace": "mv_branch_points",
            },
        )
        assert result.get("error") in (None, "")
        snap = result["snapshot"]

        # Validate via Pydantic
        enm = EnergyNetworkModel.model_validate(snap)
        assert len(enm.branch_points) == 1
        bp = enm.branch_points[0]
        assert bp.branch_point_type == "branch_pole"
        assert bp.catalog_ref == "SŁUP-ODG-12"
        assert bp.catalog_namespace == "mv_branch_points"
        assert bp.source_mode == "KATALOG"
        assert bp.completeness_status == "KOMPLETNY"
        assert bp.ports is not None
        assert bp.runtime_inputs is not None

    def test_insert_zksn_snapshot_schema_validates(self) -> None:
        snapshot, seg_id = _seed_with_cable_segment()
        result = execute_domain_operation(
            snapshot,
            "insert_zksn_on_segment_sn",
            {
                "segment_id": seg_id,
                "catalog_ref": "ZKSN-2P",
                "branch_ports_count": 2,
                "switch_state": "closed",
            },
        )
        assert result.get("error") in (None, "")
        snap = result["snapshot"]

        enm = EnergyNetworkModel.model_validate(snap)
        assert len(enm.branch_points) == 1
        bp = enm.branch_points[0]
        assert bp.branch_point_type == "zksn"
        assert bp.switch_state == "closed"
        assert bp.completeness_status == "KOMPLETNY"
        assert bp.ports is not None
        assert len(bp.ports.BRANCH) == 2

    def test_missing_catalog_is_rejected(self) -> None:
        """Brak catalog_ref zwraca blad — obiekt NIE jest tworzony (catalog-first enforcement)."""
        snapshot, seg_id = _seed_with_cable_segment()
        result = execute_domain_operation(
            snapshot,
            "insert_zksn_on_segment_sn",
            {
                "segment_id": seg_id,
                # no catalog_ref — must be rejected
                "branch_ports_count": 1,
            },
        )
        assert result.get("error") is not None, "Operacja powinna zwrócić błąd przy braku katalogu"
        assert result.get("error_code") == "catalog.ref_required"
        assert result.get("snapshot") is None

    def test_branch_points_preserved_after_model_validate_roundtrip(self) -> None:
        snapshot, seg_id = _seed_with_overhead_segment()
        result = execute_domain_operation(
            snapshot,
            "insert_branch_pole_on_segment_sn",
            {"segment_id": seg_id, "catalog_ref": "AFL-SLUP"},
        )
        snap = result["snapshot"]

        # Double roundtrip
        enm1 = EnergyNetworkModel.model_validate(snap)
        data1 = enm1.model_dump(mode="json")
        enm2 = EnergyNetworkModel.model_validate(data1)

        assert len(enm2.branch_points) == 1
        bp = enm2.branch_points[0]
        assert bp.branch_point_type == "branch_pole"
        assert bp.ref_id == enm1.branch_points[0].ref_id


# ---------------------------------------------------------------------------
# 4. Fix actions for branch_point codes
# ---------------------------------------------------------------------------


class TestBranchPointFixActions:
    @pytest.mark.parametrize(
        "code",
        [
            "branch_point.invalid_parent_medium",
            "branch_point.catalog_ref_missing",
            "branch_point.switch_state_missing",
            "branch_point.branch_port_occupied",
            "branch_point.required_port_missing",
            "zksn.branch_count_invalid",
            "branch_connection.invalid_source_port",
            "branch_connection.source_not_branch_capable",
            "oze.transformer_required",
            "bess.transformer_required",
        ],
    )
    def test_fix_action_exists_for_code(self, code: str) -> None:
        fa = resolve_fix_action(code, element_id="bp-test-001")
        assert fa is not None, f"No FixAction for code: {code}"
        assert fa.action_type, f"FixAction for {code} has no action_type"

    def test_branch_point_catalog_ref_fix_opens_catalog_picker(self) -> None:
        fa = resolve_fix_action("branch_point.catalog_ref_missing", element_id="bp-001")
        assert fa is not None
        assert fa.action_type == "SELECT_CATALOG"
        assert fa.modal_type == "BranchPointCatalogPicker"

    def test_branch_point_switch_state_fix_opens_modal(self) -> None:
        fa = resolve_fix_action("branch_point.switch_state_missing", element_id="zksn-001")
        assert fa is not None
        assert fa.action_type == "OPEN_MODAL"

    def test_all_branch_point_blocker_codes_in_known_set(self) -> None:
        branch_codes = {
            "branch_point.invalid_parent_medium",
            "branch_point.catalog_ref_missing",
            "branch_point.switch_state_missing",
            "branch_point.branch_port_occupied",
            "branch_point.required_port_missing",
            "zksn.branch_count_invalid",
            "branch_connection.invalid_source_port",
            "branch_connection.source_not_branch_capable",
            "oze.transformer_required",
            "bess.transformer_required",
        }
        missing = branch_codes - KNOWN_BLOCKER_CODES
        assert not missing, f"Codes not in KNOWN_BLOCKER_CODES: {missing}"
