"""
Test FaultScenario v2 domain model — PR-25

Tests:
- FaultMode enum (METALLIC, IMPEDANCE)
- FaultImpedance value object
- NODE / BRANCH_POINT location types
- Validation rules for v2 fields
- Hash determinism with v2 fields
- arc_params rejection
- Backward compatibility (v1 data still works)
- Serialization round-trip for v2
- Eligibility gating for v2 (IMPEDANCE, BRANCH_POINT)
"""

from uuid import uuid4

import pytest
from domain.fault_scenario import (
    FaultImpedance,
    FaultLocation,
    FaultMode,
    FaultScenario,
    FaultScenarioValidationError,
    FaultType,
    compute_scenario_content_hash,
    new_fault_scenario,
)

FIXED_CASE_ID = uuid4()


def _make_v2_scenario(
    name: str = "Zwarcie v2 testowe",
    fault_type: FaultType = FaultType.SC_3F,
    element_ref: str = "bus-1",
    location_type: str = "NODE",
    position: float | None = None,
    fault_mode: FaultMode = FaultMode.METALLIC,
    fault_impedance: FaultImpedance | None = None,
    arc_params: dict | None = None,
) -> FaultScenario:
    """Helper: create a v2 test scenario."""
    return new_fault_scenario(
        study_case_id=FIXED_CASE_ID,
        name=name,
        fault_type=fault_type,
        location=FaultLocation(
            element_ref=element_ref,
            location_type=location_type,
            position=position,
        ),
        fault_mode=fault_mode,
        fault_impedance=fault_impedance,
        arc_params=arc_params,
    )


# ============================================================================
# FaultMode enum
# ============================================================================


class TestFaultMode:
    """Tests for FaultMode enum."""

    def test_metallic_value(self):
        assert FaultMode.METALLIC.value == "METALLIC"

    def test_impedance_value(self):
        assert FaultMode.IMPEDANCE.value == "IMPEDANCE"

    def test_from_string(self):
        assert FaultMode("METALLIC") == FaultMode.METALLIC
        assert FaultMode("IMPEDANCE") == FaultMode.IMPEDANCE

    def test_invalid_value_raises(self):
        with pytest.raises(ValueError):
            FaultMode("UNKNOWN")


# ============================================================================
# FaultImpedance value object
# ============================================================================


class TestFaultImpedance:
    """Tests for FaultImpedance frozen dataclass."""

    def test_creation(self):
        fi = FaultImpedance(r_ohm=1.5, x_ohm=3.0)
        assert fi.r_ohm == 1.5
        assert fi.x_ohm == 3.0

    def test_frozen(self):
        fi = FaultImpedance(r_ohm=1.0, x_ohm=2.0)
        with pytest.raises(AttributeError):
            fi.r_ohm = 5.0  # type: ignore[misc]

    def test_to_dict(self):
        fi = FaultImpedance(r_ohm=0.5, x_ohm=1.2)
        d = fi.to_dict()
        assert d == {"r_ohm": 0.5, "x_ohm": 1.2}

    def test_from_dict(self):
        fi = FaultImpedance.from_dict({"r_ohm": 0.5, "x_ohm": 1.2})
        assert fi.r_ohm == 0.5
        assert fi.x_ohm == 1.2

    def test_round_trip(self):
        original = FaultImpedance(r_ohm=2.3, x_ohm=4.6)
        restored = FaultImpedance.from_dict(original.to_dict())
        assert restored == original


# ============================================================================
# NODE location type (v2)
# ============================================================================


class TestNodeLocationType:
    """Tests for NODE location type."""

    def test_node_without_position(self):
        s = _make_v2_scenario(location_type="NODE", element_ref="node-1")
        assert s.location.location_type == "NODE"
        assert s.location.position is None

    def test_node_with_position_fails(self):
        with pytest.raises(FaultScenarioValidationError, match="NODE"):
            _make_v2_scenario(location_type="NODE", element_ref="node-1", position=0.5)

    def test_node_serialization(self):
        s = _make_v2_scenario(location_type="NODE", element_ref="node-1")
        d = s.to_dict()
        assert d["location"]["location_type"] == "NODE"
        assert d["location"]["position"] is None


# ============================================================================
# BRANCH_POINT location type (v2)
# ============================================================================


class TestBranchPointLocationType:
    """Tests for BRANCH_POINT location type."""

    def test_branch_point_with_alpha(self):
        s = _make_v2_scenario(
            location_type="BRANCH_POINT",
            element_ref="branch-1",
            position=0.5,
        )
        assert s.location.location_type == "BRANCH_POINT"
        assert s.location.position == 0.5

    def test_branch_point_alpha_zero(self):
        """Alpha = 0.0 is valid for BRANCH_POINT (inclusive range)."""
        s = _make_v2_scenario(
            location_type="BRANCH_POINT",
            element_ref="branch-1",
            position=0.0,
        )
        assert s.location.position == 0.0

    def test_branch_point_alpha_one(self):
        """Alpha = 1.0 is valid for BRANCH_POINT (inclusive range)."""
        s = _make_v2_scenario(
            location_type="BRANCH_POINT",
            element_ref="branch-1",
            position=1.0,
        )
        assert s.location.position == 1.0

    def test_branch_point_without_alpha_fails(self):
        with pytest.raises(FaultScenarioValidationError, match="alpha"):
            _make_v2_scenario(
                location_type="BRANCH_POINT",
                element_ref="branch-1",
                position=None,
            )

    def test_branch_point_alpha_negative_fails(self):
        with pytest.raises(FaultScenarioValidationError, match="alpha"):
            _make_v2_scenario(
                location_type="BRANCH_POINT",
                element_ref="branch-1",
                position=-0.1,
            )

    def test_branch_point_alpha_above_one_fails(self):
        with pytest.raises(FaultScenarioValidationError, match="alpha"):
            _make_v2_scenario(
                location_type="BRANCH_POINT",
                element_ref="branch-1",
                position=1.1,
            )

    def test_branch_point_serialization(self):
        s = _make_v2_scenario(
            location_type="BRANCH_POINT",
            element_ref="branch-1",
            position=0.75,
        )
        d = s.to_dict()
        assert d["location"]["location_type"] == "BRANCH_POINT"
        assert d["location"]["position"] == 0.75


# ============================================================================
# Fault mode validation (v2)
# ============================================================================


class TestFaultModeValidation:
    """Tests for fault_mode + fault_impedance validation rules."""

    def test_metallic_without_impedance_ok(self):
        """METALLIC mode with no fault_impedance is valid."""
        s = _make_v2_scenario(fault_mode=FaultMode.METALLIC, fault_impedance=None)
        assert s.fault_mode == FaultMode.METALLIC
        assert s.fault_impedance is None

    def test_metallic_with_impedance_fails(self):
        """METALLIC mode + fault_impedance → error (fault.mode_conflict_impedance_provided)."""
        with pytest.raises(FaultScenarioValidationError, match="metaliczny"):
            _make_v2_scenario(
                fault_mode=FaultMode.METALLIC,
                fault_impedance=FaultImpedance(r_ohm=1.0, x_ohm=2.0),
            )

    def test_impedance_with_impedance_ok(self):
        """IMPEDANCE mode with explicit fault_impedance is valid."""
        s = _make_v2_scenario(
            fault_mode=FaultMode.IMPEDANCE,
            fault_impedance=FaultImpedance(r_ohm=0.5, x_ohm=1.5),
        )
        assert s.fault_mode == FaultMode.IMPEDANCE
        assert s.fault_impedance is not None
        assert s.fault_impedance.r_ohm == 0.5
        assert s.fault_impedance.x_ohm == 1.5

    def test_impedance_without_impedance_fails(self):
        """IMPEDANCE mode without fault_impedance → error (fault.impedance_missing)."""
        with pytest.raises(FaultScenarioValidationError, match="impedancyjny"):
            _make_v2_scenario(
                fault_mode=FaultMode.IMPEDANCE,
                fault_impedance=None,
            )


# ============================================================================
# arc_params rejection (v2)
# ============================================================================


class TestArcParamsRejection:
    """arc_params must be None in v2 — deterministic rejection."""

    def test_arc_params_none_ok(self):
        s = _make_v2_scenario(arc_params=None)
        assert s.arc_params is None

    def test_arc_params_not_none_fails(self):
        """Non-None arc_params → validation error (fault.arc_params_unsupported)."""
        with pytest.raises(FaultScenarioValidationError, match="łuku"):
            _make_v2_scenario(arc_params={"voltage_v": 100, "length_m": 0.5})


# ============================================================================
# Hash determinism with v2 fields
# ============================================================================


class TestV2HashDeterminism:
    """Content hash determinism with v2 fields."""

    def test_same_v2_scenario_same_hash(self):
        """Two identical v2 scenarios produce identical hash."""
        s1 = _make_v2_scenario(
            name="Impedancja test",
            fault_mode=FaultMode.IMPEDANCE,
            fault_impedance=FaultImpedance(r_ohm=1.0, x_ohm=2.0),
        )
        s2 = _make_v2_scenario(
            name="Impedancja test",
            fault_mode=FaultMode.IMPEDANCE,
            fault_impedance=FaultImpedance(r_ohm=1.0, x_ohm=2.0),
        )
        assert compute_scenario_content_hash(s1) == compute_scenario_content_hash(s2)

    def test_different_fault_mode_different_hash(self):
        """Different fault_mode → different hash."""
        s1 = _make_v2_scenario(fault_mode=FaultMode.METALLIC)
        s2 = _make_v2_scenario(
            fault_mode=FaultMode.IMPEDANCE,
            fault_impedance=FaultImpedance(r_ohm=1.0, x_ohm=2.0),
        )
        assert compute_scenario_content_hash(s1) != compute_scenario_content_hash(s2)

    def test_different_impedance_different_hash(self):
        """Different fault_impedance → different hash."""
        s1 = _make_v2_scenario(
            fault_mode=FaultMode.IMPEDANCE,
            fault_impedance=FaultImpedance(r_ohm=1.0, x_ohm=2.0),
        )
        s2 = _make_v2_scenario(
            fault_mode=FaultMode.IMPEDANCE,
            fault_impedance=FaultImpedance(r_ohm=1.0, x_ohm=3.0),
        )
        assert compute_scenario_content_hash(s1) != compute_scenario_content_hash(s2)

    def test_branch_point_alpha_in_hash(self):
        """Different alpha → different hash."""
        s1 = _make_v2_scenario(
            location_type="BRANCH_POINT",
            element_ref="branch-1",
            position=0.3,
        )
        s2 = _make_v2_scenario(
            location_type="BRANCH_POINT",
            element_ref="branch-1",
            position=0.7,
        )
        assert compute_scenario_content_hash(s1) != compute_scenario_content_hash(s2)

    def test_hash_length_sha256(self):
        """Hash is SHA-256 (64 hex chars)."""
        s = _make_v2_scenario()
        assert len(s.content_hash) == 64


# ============================================================================
# Backward compatibility
# ============================================================================


class TestV2BackwardCompat:
    """v1 scenarios still work with v2 code."""

    def test_v1_bus_scenario_still_works(self):
        """BUS location (v1) still valid."""
        s = new_fault_scenario(
            study_case_id=FIXED_CASE_ID,
            name="Legacy BUS",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="bus-1", location_type="BUS"),
        )
        assert s.fault_mode == FaultMode.METALLIC
        assert s.fault_impedance is None
        assert s.arc_params is None

    def test_v1_branch_scenario_still_works(self):
        """BRANCH location (v1) still valid."""
        s = new_fault_scenario(
            study_case_id=FIXED_CASE_ID,
            name="Legacy BRANCH",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="branch-1", location_type="BRANCH", position=0.5),
        )
        assert s.location.location_type == "BRANCH"
        assert s.location.position == 0.5

    def test_v1_from_dict_no_v2_fields(self):
        """from_dict with v1 data (no fault_mode/fault_impedance) works."""
        v1_data = {
            "scenario_id": str(uuid4()),
            "study_case_id": str(FIXED_CASE_ID),
            "name": "Legacy",
            "fault_type": "SC_3F",
            "location": {"element_ref": "bus-1", "location_type": "BUS", "position": None},
            "config": {
                "c_factor": 1.10,
                "thermal_time_seconds": 1.0,
                "include_branch_contributions": False,
            },
            "fault_impedance_type": "METALLIC",
            "content_hash": "abc123",
            "created_at": "2025-01-01T00:00:00",
            "updated_at": "2025-01-01T00:00:00",
        }
        s = FaultScenario.from_dict(v1_data)
        assert s.fault_mode == FaultMode.METALLIC
        assert s.fault_impedance is None
        assert s.arc_params is None


# ============================================================================
# Serialization round-trip (v2)
# ============================================================================


class TestV2Serialization:
    """to_dict/from_dict round-trip with v2 fields."""

    def test_metallic_round_trip(self):
        original = _make_v2_scenario(
            name="Roundtrip metaliczny",
            fault_mode=FaultMode.METALLIC,
        )
        data = original.to_dict()
        restored = FaultScenario.from_dict(data)
        assert restored.fault_mode == FaultMode.METALLIC
        assert restored.fault_impedance is None
        assert data["fault_mode"] == "METALLIC"
        assert data["fault_impedance"] is None

    def test_impedance_round_trip(self):
        original = _make_v2_scenario(
            name="Roundtrip impedancyjny",
            fault_mode=FaultMode.IMPEDANCE,
            fault_impedance=FaultImpedance(r_ohm=0.8, x_ohm=1.6),
        )
        data = original.to_dict()
        restored = FaultScenario.from_dict(data)
        assert restored.fault_mode == FaultMode.IMPEDANCE
        assert restored.fault_impedance is not None
        assert restored.fault_impedance.r_ohm == 0.8
        assert restored.fault_impedance.x_ohm == 1.6
        assert data["fault_mode"] == "IMPEDANCE"
        assert data["fault_impedance"] == {"r_ohm": 0.8, "x_ohm": 1.6}

    def test_branch_point_round_trip(self):
        original = _make_v2_scenario(
            name="Roundtrip BRANCH_POINT",
            location_type="BRANCH_POINT",
            element_ref="line-42",
            position=0.65,
        )
        data = original.to_dict()
        restored = FaultScenario.from_dict(data)
        assert restored.location.location_type == "BRANCH_POINT"
        assert restored.location.position == 0.65
        assert restored.location.element_ref == "line-42"

    def test_content_hash_preserved(self):
        original = _make_v2_scenario(name="Hash preservation")
        data = original.to_dict()
        restored = FaultScenario.from_dict(data)
        assert restored.content_hash == original.content_hash


# ============================================================================
# Copy-on-write with v2 fields
# ============================================================================


class TestV2CopyOnWrite:
    """with_updates for v2 fields."""

    def test_update_fault_mode(self):
        s = _make_v2_scenario(fault_mode=FaultMode.METALLIC)
        updated = s.with_updates(
            fault_mode=FaultMode.IMPEDANCE,
            fault_impedance=FaultImpedance(r_ohm=1.0, x_ohm=2.0),
        )
        assert updated.fault_mode == FaultMode.IMPEDANCE
        assert updated.fault_impedance is not None
        assert updated.scenario_id == s.scenario_id

    def test_update_fault_impedance(self):
        s = _make_v2_scenario(
            fault_mode=FaultMode.IMPEDANCE,
            fault_impedance=FaultImpedance(r_ohm=1.0, x_ohm=2.0),
        )
        updated = s.with_updates(
            fault_impedance=FaultImpedance(r_ohm=3.0, x_ohm=6.0),
        )
        assert updated.fault_impedance.r_ohm == 3.0  # type: ignore[union-attr]
        assert updated.fault_impedance.x_ohm == 6.0  # type: ignore[union-attr]

    def test_update_preserves_v2_fields(self):
        s = _make_v2_scenario(
            fault_mode=FaultMode.IMPEDANCE,
            fault_impedance=FaultImpedance(r_ohm=1.0, x_ohm=2.0),
        )
        updated = s.with_updates(name="Nowa nazwa")
        assert updated.fault_mode == FaultMode.IMPEDANCE
        assert updated.fault_impedance is not None
        assert updated.fault_impedance.r_ohm == 1.0
