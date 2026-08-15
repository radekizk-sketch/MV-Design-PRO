"""
CI guard: kanon 'bez zgadywania' (no guessing) w operacjach domenowych.

Weryfikuje, ze domain_operations.py NIE dopuszcza domyslnych wartosci
dla parametrow krytycznych — kazdy parametr musi byc jawnie podany.

Testy mapuja sie 1:1 na reguly kanonu:
  - dlugosc_m: wymagana jawnie (brak domyslnej dlugosci)
  - from_bus_ref: wymagany jawnie (brak auto-detekcji szyny zrodlowej)
  - nn_voltage_kv: wymagane jawnie (brak domyslnego napiecia stacji)
  - from/to_bus_ref dla pierscienia: wymagane jawnie (brak auto-detekcji)
  - logical_views / materialized_params / layout_hash: obecne w odpowiedzi
"""

from __future__ import annotations

from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader

from tests.catalog_test_helpers import gpz_payload

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _empty_enm():
    enm = EnergyNetworkModel(header=ENMHeader(name="test", defaults=ENMDefaults()))
    return enm.model_dump(mode="json")


def _add_grid_source(enm_dict):
    return execute_domain_operation(
        enm_dict=enm_dict,
        op_name="add_grid_source_sn",
        payload=gpz_payload(voltage_kv=15.0, sk3_mva=250.0, rx_ratio=0.10),
    )


def _build_gpz_plus_segments(n_segments=2):
    enm = _empty_enm()
    result = _add_grid_source(enm)
    snapshot = result["snapshot"]
    for _ in range(n_segments):
        result = execute_domain_operation(
            enm_dict=snapshot,
            op_name="continue_trunk_segment_sn",
            payload={
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 500,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                }
            },
        )
        snapshot = result["snapshot"]
    return result, snapshot


# ===========================================================================
# 1. TestNoDefaultLength
# ===========================================================================


class TestNoDefaultLength:
    """continue_trunk_segment_sn BEZ dlugosc_m -> blad dlugosc_missing."""

    def test_no_default_length(self):
        """Call continue_trunk_segment_sn with NO dlugosc_m.

        Canon rule: segment length must be explicitly provided.
        The operation MUST NOT guess or default to any value.
        """
        enm = _empty_enm()
        gpz_result = _add_grid_source(enm)
        assert (
            gpz_result.get("snapshot") is not None
        ), f"Prerequisite failed: {gpz_result.get('error')}"
        snapshot = gpz_result["snapshot"]

        # Call without dlugosc_m — canon says this must fail
        result = execute_domain_operation(
            enm_dict=snapshot,
            op_name="continue_trunk_segment_sn",
            payload={"segment": {"rodzaj": "KABEL"}},  # NO dlugosc_m
        )

        error_code = result.get("error_code", "")
        error_msg = result.get("error", "")
        assert "dlugosc_missing" in error_code, (
            f"Expected error_code containing 'dlugosc_missing', "
            f"got error_code='{error_code}', error='{error_msg}'"
        )


# ===========================================================================
# 2. TestNoDefaultLengthBranch
# ===========================================================================


class TestNoDefaultLengthBranch:
    """start_branch_segment_sn z poprawnym zrodlem ale BEZ dlugosc_m -> blad."""

    def test_no_default_length_branch(self):
        """Call start_branch_segment_sn with explicit branch-capable source but NO dlugosc_m.

        Canon rule: branch segment length must be explicitly provided.
        """
        _, snapshot = _build_gpz_plus_segments(1)

        # Dodaj stację branch, żeby mieć poprawny port źródłowy BRANCH
        first_segment = snapshot.get("branches", [])[0]["ref_id"]
        station_result = execute_domain_operation(
            enm_dict=snapshot,
            op_name="insert_station_on_segment_sn",
            payload={
                "segment_id": first_segment,
                # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
                "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
                "name": "Stacja testowa",
                "station_type": "branch",
                "transformer": {"transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11"},
                "station": {"nn_voltage_kv": 0.4},
                "nn_voltage_kv": 0.4,
            },
        )
        assert (
            station_result.get("snapshot") is not None
        ), f"Prerequisite failed: {station_result.get('error')}"
        snapshot = station_result["snapshot"]
        sub_ref = snapshot.get("substations", [])[-1]["ref_id"]

        result = execute_domain_operation(
            enm_dict=snapshot,
            op_name="start_branch_segment_sn",
            payload={
                "from_ref": f"{sub_ref}.BRANCH",
                "segment": {"rodzaj": "KABEL"},  # NO dlugosc_m
            },
        )

        error_code = result.get("error_code", "")
        error_msg = result.get("error", "")
        assert "dlugosc_missing" in error_code, (
            f"Expected error_code containing 'dlugosc_missing', "
            f"got error_code='{error_code}', error='{error_msg}'"
        )


# ===========================================================================
# 3. TestNoAutoDetectBranchSource
# ===========================================================================


class TestNoAutoDetectBranchSource:
    """start_branch_segment_sn BEZ from_ref -> blad from_ref_required."""

    def test_no_auto_detect_branch_source(self):
        """Call start_branch_segment_sn with NO from_ref.

        Canon rule: the source bus for a branch must be explicitly clicked
        in the SLD. The system MUST NOT auto-detect or guess.
        """
        _, snapshot = _build_gpz_plus_segments(1)

        result = execute_domain_operation(
            enm_dict=snapshot,
            op_name="start_branch_segment_sn",
            payload={
                # NO from_ref
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 300,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )

        error_code = result.get("error_code", "")
        error_msg = result.get("error", "")
        assert "from_ref_required" in error_code, (
            f"Expected error_code containing 'from_ref_required', "
            f"got error_code='{error_code}', error='{error_msg}'"
        )


# ===========================================================================
# 4. TestNoDefaultVoltageStation
# ===========================================================================


class TestNoDefaultVoltageStation:
    """insert_station_on_segment_sn BEZ station.nn_voltage_kv -> blad voltage_missing."""

    def test_no_default_voltage_station(self):
        """Call insert_station_on_segment_sn WITHOUT station.nn_voltage_kv.

        Canon rule: the nN voltage of a station must be explicitly provided.
        The system MUST NOT default to 0.4 kV or any other value.
        """
        _, snapshot = _build_gpz_plus_segments(2)

        # Find first cable segment
        first_seg_ref = None
        for branch in snapshot.get("branches", []):
            if branch.get("type") in ("cable", "line_overhead"):
                first_seg_ref = branch["ref_id"]
                break
        assert first_seg_ref is not None, "Need at least one cable segment"

        result = execute_domain_operation(
            enm_dict=snapshot,
            op_name="insert_station_on_segment_sn",
            payload={
                "segment_ref": first_seg_ref,
                # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
                "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
                "station_type": "B",
                "insert_at": {"value": 0.5},
                "station": {
                    "sn_voltage_kv": 15.0,
                    # NO nn_voltage_kv
                },
                "sn_fields": ["IN", "OUT"],
            },
        )

        error_code = result.get("error_code", "")
        error_msg = result.get("error", "")
        assert "voltage_missing" in error_code, (
            f"Expected error_code containing 'voltage_missing', "
            f"got error_code='{error_code}', error='{error_msg}'"
        )


# ===========================================================================
# 5. TestNoAutoDetectRingEndpoints
# ===========================================================================


class TestNoAutoDetectRingEndpoints:
    """connect_secondary_ring_sn BEZ from_bus_ref -> blad bus_missing."""

    def test_no_auto_detect_ring_endpoints(self):
        """Call connect_secondary_ring_sn with NO from_bus_ref.

        Canon rule: ring endpoints must be explicitly provided by the user.
        The system MUST NOT auto-detect trunk ends.
        """
        _, snapshot = _build_gpz_plus_segments(3)
        buses = snapshot.get("buses", [])
        assert len(buses) >= 2, "Need at least 2 buses for ring test"

        result = execute_domain_operation(
            enm_dict=snapshot,
            op_name="connect_secondary_ring_sn",
            payload={
                # NO from_bus_ref
                "to_bus_ref": buses[-1]["ref_id"],
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 200,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )

        error_code = result.get("error_code", "")
        error_msg = result.get("error", "")
        assert "bus_missing" in error_code, (
            f"Expected error_code containing 'bus_missing', "
            f"got error_code='{error_code}', error='{error_msg}'"
        )


# ===========================================================================
# 6. TestNoDefaultRingLength
# ===========================================================================


class TestNoDefaultRingLength:
    """connect_secondary_ring_sn z jawnymi szynami ale BEZ dlugosc_m -> blad."""

    def test_no_default_ring_length(self):
        """Call connect_secondary_ring_sn with explicit buses but NO dlugosc_m.

        Canon rule: ring closure segment length must be explicitly provided.
        """
        _, snapshot = _build_gpz_plus_segments(3)
        buses = snapshot.get("buses", [])
        assert len(buses) >= 2, "Need at least 2 buses for ring test"

        result = execute_domain_operation(
            enm_dict=snapshot,
            op_name="connect_secondary_ring_sn",
            payload={
                "from_bus_ref": buses[-1]["ref_id"],
                "to_bus_ref": buses[0]["ref_id"],
                "segment": {"rodzaj": "KABEL"},  # NO dlugosc_m
            },
        )

        error_code = result.get("error_code", "")
        error_msg = result.get("error", "")
        assert "dlugosc_missing" in error_code, (
            f"Expected error_code containing 'dlugosc_missing', "
            f"got error_code='{error_code}', error='{error_msg}'"
        )


# ===========================================================================
# 7. TestLogicalViewsPresent
# ===========================================================================


class TestLogicalViewsPresent:
    """Odpowiedz add_grid_source_sn zawiera logical_views z lista trunks."""

    def test_logical_views_present(self):
        """After add_grid_source_sn, response has logical_views with trunks list.

        Canon rule: every successful domain operation response must include
        computed logical_views as a deterministic derivative of the snapshot.
        """
        enm = _empty_enm()
        result = _add_grid_source(enm)

        assert result.get("snapshot") is not None, f"Prerequisite failed: {result.get('error')}"

        logical_views = result.get("logical_views")
        assert logical_views is not None, "Response must contain 'logical_views' key"
        assert isinstance(
            logical_views, dict
        ), f"logical_views must be a dict, got {type(logical_views).__name__}"

        trunks = logical_views.get("trunks")
        assert trunks is not None, "logical_views must contain 'trunks' key"
        assert isinstance(
            trunks, list
        ), f"logical_views.trunks must be a list, got {type(trunks).__name__}"


# ===========================================================================
# 8. TestMaterializedParamsPresent
# ===========================================================================


class TestMaterializedParamsPresent:
    """Odpowiedz add_grid_source_sn zawiera materialized_params z lines_sn."""

    def test_materialized_params_present(self):
        """After add_grid_source_sn, response has materialized_params with lines_sn dict.

        Canon rule: every successful domain operation response must include
        materialized_params for catalog-backed parameter auditing.
        """
        enm = _empty_enm()
        result = _add_grid_source(enm)

        assert result.get("snapshot") is not None, f"Prerequisite failed: {result.get('error')}"

        materialized_params = result.get("materialized_params")
        assert materialized_params is not None, "Response must contain 'materialized_params' key"
        assert isinstance(
            materialized_params, dict
        ), f"materialized_params must be a dict, got {type(materialized_params).__name__}"

        lines_sn = materialized_params.get("lines_sn")
        assert lines_sn is not None, "materialized_params must contain 'lines_sn' key"
        assert isinstance(
            lines_sn, dict
        ), f"materialized_params.lines_sn must be a dict, got {type(lines_sn).__name__}"


# ===========================================================================
# 9. TestLayoutHashPresent
# ===========================================================================


class TestLayoutHashPresent:
    """Odpowiedz add_grid_source_sn zawiera layout.layout_hash z prefixem sha256:."""

    def test_layout_hash_present(self):
        """After add_grid_source_sn, response has layout.layout_hash starting with 'sha256:'.

        Canon rule: every successful domain operation response must include
        a deterministic layout hash for change detection.
        """
        enm = _empty_enm()
        result = _add_grid_source(enm)

        assert result.get("snapshot") is not None, f"Prerequisite failed: {result.get('error')}"

        layout = result.get("layout")
        assert layout is not None, "Response must contain 'layout' key"
        assert isinstance(layout, dict), f"layout must be a dict, got {type(layout).__name__}"

        layout_hash = layout.get("layout_hash")
        assert layout_hash is not None, "layout must contain 'layout_hash' key"
        assert isinstance(
            layout_hash, str
        ), f"layout.layout_hash must be a string, got {type(layout_hash).__name__}"
        assert layout_hash.startswith(
            "sha256:"
        ), f"layout.layout_hash must start with 'sha256:', got '{layout_hash}'"


# ===========================================================================
# 10. TestSecondaryConnectorDetection
# ===========================================================================


class TestCatalogMaterializationResolution:
    """Po assign_catalog_to_element materialized_params zawiera parametry z katalogu."""

    def test_catalog_params_resolved_in_materialized_params(self):
        """After assigning catalog_ref to a cable, materialized_params should contain
        actual catalog-resolved parameters (r_ohm_per_km, x_ohm_per_km, i_max_a).

        Canon rule: materialized_params are frozen copies of catalog values,
        not raw instance params. They enable auditing without catalog access.
        """
        _, snapshot = _build_gpz_plus_segments(2)

        # Find first cable branch
        cable_ref = None
        for branch in snapshot.get("branches", []):
            if branch.get("type") in ("cable", "line_overhead"):
                cable_ref = branch["ref_id"]
                break
        assert cable_ref is not None, "Need at least one cable segment"

        # Assign a known catalog type
        catalog_id = "cable-base-xlpe-cu-1c-120"
        result = execute_domain_operation(
            enm_dict=snapshot,
            op_name="assign_catalog_to_element",
            payload={
                "element_ref": cable_ref,
                "catalog_item_id": catalog_id,
            },
        )

        assert result.get("snapshot") is not None, f"Prerequisite failed: {result.get('error')}"

        mat = result.get("materialized_params", {})
        lines_sn = mat.get("lines_sn", {})
        assert cable_ref in lines_sn, (
            f"Cable {cable_ref} should appear in materialized_params.lines_sn "
            f"after catalog assignment"
        )

        entry = lines_sn[cable_ref]
        assert entry["catalog_item_id"] == catalog_id
        # Catalog-resolved params should be numeric (not None)
        assert entry["r_ohm_per_km"] is not None, "r_ohm_per_km should be resolved from catalog"
        assert entry["x_ohm_per_km"] is not None, "x_ohm_per_km should be resolved from catalog"
        assert entry["i_max_a"] is not None, "i_max_a should be resolved from catalog"
        # Catalog values should be > 0
        assert entry["r_ohm_per_km"] > 0, "r_ohm_per_km from catalog must be > 0"
        assert entry["i_max_a"] > 0, "i_max_a from catalog must be > 0"


# ===========================================================================
# 11. TestSecondaryConnectorDetection
# ===========================================================================


class TestSecondaryConnectorDetection:
    """Po connect_secondary_ring_sn logical_views zawiera secondary_connectors."""

    def test_ring_closure_detected_as_secondary_connector(self):
        """After ring closure, logical_views.secondary_connectors has >= 1 entry.

        Canon rule: ring closure segments are classified as secondary_connectors
        in logical_views, not as trunks or branches.
        """
        _, snapshot = _build_gpz_plus_segments(3)
        buses = snapshot.get("buses", [])
        assert len(buses) >= 2, "Need at least 2 buses for ring test"

        result = execute_domain_operation(
            enm_dict=snapshot,
            op_name="connect_secondary_ring_sn",
            payload={
                "from_bus_ref": buses[-1]["ref_id"],
                "to_bus_ref": buses[0]["ref_id"],
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 200,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )

        assert result.get("snapshot") is not None, f"Prerequisite failed: {result.get('error')}"

        lv = result.get("logical_views", {})
        secondary = lv.get("secondary_connectors", [])
        assert len(secondary) >= 1, (
            "logical_views.secondary_connectors should have >= 1 entry " "after ring closure"
        )

        # Verify structure of each secondary connector
        for sc in secondary:
            assert "connector_id" in sc, "Secondary connector must have connector_id"
            assert "from_element_id" in sc, "Secondary connector must have from_element_id"
            assert "to_element_id" in sc, "Secondary connector must have to_element_id"
            assert "segment_ref" in sc, "Secondary connector must have segment_ref"

    def test_secondary_connector_not_in_branches_or_trunks(self):
        """Ring closure segment should NOT appear in logical_views branches or trunk segments."""
        _, snapshot = _build_gpz_plus_segments(3)
        buses = snapshot.get("buses", [])
        assert len(buses) >= 2

        result = execute_domain_operation(
            enm_dict=snapshot,
            op_name="connect_secondary_ring_sn",
            payload={
                "from_bus_ref": buses[-1]["ref_id"],
                "to_bus_ref": buses[0]["ref_id"],
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 200,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )

        assert result.get("snapshot") is not None

        lv = result.get("logical_views", {})
        secondary_ids = {sc["connector_id"] for sc in lv.get("secondary_connectors", [])}

        # Check not in branch views
        for bv in lv.get("branches", []):
            assert (
                bv["branch_id"] not in secondary_ids
            ), f"Ring closure {bv['branch_id']} should not appear in branches"

        # Check not in trunk segments
        for trunk in lv.get("trunks", []):
            for seg in trunk.get("segments", []):
                assert (
                    seg not in secondary_ids
                ), f"Ring closure {seg} should not appear in trunk segments"
