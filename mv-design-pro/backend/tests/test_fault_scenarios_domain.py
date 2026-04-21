"""
Test FaultScenario domain model — PR-24

Tests:
- Hash determinism
- Canonical JSON sorting
- Copy-on-write (with_updates)
- Validation rules (name, element_ref)
- Timestamps
- Serialization round-trip
"""

from uuid import uuid4

import pytest
from domain.fault_scenario import (
    FaultImpedanceType,
    FaultLocation,
    FaultScenario,
    FaultScenarioValidationError,
    FaultType,
    compute_scenario_content_hash,
    new_fault_scenario,
)

FIXED_CASE_ID = uuid4()


def _make_scenario(
    name: str = "Zwarcie testowe",
    fault_type: FaultType = FaultType.SC_3F,
    element_ref: str = "bus-1",
) -> FaultScenario:
    """Helper: create a test scenario via factory."""
    return new_fault_scenario(
        study_case_id=FIXED_CASE_ID,
        name=name,
        fault_type=fault_type,
        location=FaultLocation(element_ref=element_ref, location_type="BUS"),
    )


class TestFaultScenarioDomain:
    """Domain model tests."""

    def test_new_fault_scenario_creates_with_name(self):
        s = _make_scenario(name="Mój scenariusz")
        assert s.name == "Mój scenariusz"
        assert s.fault_type == FaultType.SC_3F
        assert s.content_hash != ""

    def test_scenario_content_hash_determinism(self):
        """Two identical scenarios (same name/type/location) produce same hash."""
        s1 = _make_scenario(name="Identyczny", element_ref="bus-1")
        s2 = _make_scenario(name="Identyczny", element_ref="bus-1")
        # content_hash is deterministic based on content, not scenario_id
        h1 = compute_scenario_content_hash(s1)
        h2 = compute_scenario_content_hash(s2)
        assert h1 == h2

    def test_scenario_content_hash_changes_with_name(self):
        """Different names produce different hashes."""
        s1 = _make_scenario(name="Scenariusz A")
        s2 = _make_scenario(name="Scenariusz B")
        assert s1.content_hash != s2.content_hash

    def test_with_updates_copy_on_write(self):
        """with_updates creates a new scenario preserving ID."""
        s = _make_scenario(name="Oryginał")
        updated = s.with_updates(name="Zaktualizowany")
        assert updated.name == "Zaktualizowany"
        assert updated.scenario_id == s.scenario_id
        assert updated.study_case_id == s.study_case_id
        assert updated.created_at == s.created_at

    def test_validate_empty_name_fails(self):
        """Empty name raises validation error."""
        with pytest.raises(FaultScenarioValidationError, match="Nazwa scenariusza"):
            new_fault_scenario(
                study_case_id=FIXED_CASE_ID,
                name="",
                fault_type=FaultType.SC_3F,
                location=FaultLocation(element_ref="bus-1", location_type="BUS"),
            )

    def test_validate_whitespace_name_fails(self):
        """Whitespace-only name raises validation error."""
        with pytest.raises(FaultScenarioValidationError, match="Nazwa scenariusza"):
            new_fault_scenario(
                study_case_id=FIXED_CASE_ID,
                name="   ",
                fault_type=FaultType.SC_3F,
                location=FaultLocation(element_ref="bus-1", location_type="BUS"),
            )

    def test_validate_empty_element_ref_fails(self):
        """Empty element_ref raises validation error."""
        with pytest.raises(FaultScenarioValidationError, match="element_ref"):
            new_fault_scenario(
                study_case_id=FIXED_CASE_ID,
                name="Scenariusz",
                fault_type=FaultType.SC_3F,
                location=FaultLocation(element_ref="", location_type="BUS"),
            )

    def test_fault_impedance_type_default(self):
        """Default fault_impedance_type is METALLIC."""
        s = _make_scenario()
        assert s.fault_impedance_type == FaultImpedanceType.METALLIC

    def test_created_at_updated_at_set(self):
        """created_at and updated_at are set on creation."""
        s = _make_scenario()
        assert s.created_at != ""
        assert s.updated_at != ""
        assert s.created_at == s.updated_at  # Same on creation

    def test_from_dict_round_trip(self):
        """to_dict -> from_dict produces equivalent scenario."""
        original = _make_scenario(name="Roundtrip test")
        data = original.to_dict()
        restored = FaultScenario.from_dict(data)
        assert restored.scenario_id == original.scenario_id
        assert restored.name == original.name
        assert restored.fault_type == original.fault_type
        assert restored.location.element_ref == original.location.element_ref
        assert restored.content_hash == original.content_hash
        assert restored.fault_impedance_type == original.fault_impedance_type
        assert restored.created_at == original.created_at

    def test_canonical_json_sorted(self):
        """Content hash uses sorted keys (deterministic)."""
        s = _make_scenario()
        hash1 = compute_scenario_content_hash(s)
        hash2 = compute_scenario_content_hash(s)
        assert hash1 == hash2
        assert len(hash1) == 64  # SHA-256 hex

    def test_sc1f_requires_z0_bus_data(self):
        """SC_1F without z0_bus_data raises validation error."""
        with pytest.raises(FaultScenarioValidationError, match="impedancji zerowej"):
            new_fault_scenario(
                study_case_id=FIXED_CASE_ID,
                name="SC1F test",
                fault_type=FaultType.SC_1F,
                location=FaultLocation(element_ref="bus-1", location_type="BUS"),
                z0_bus_data=None,
            )

    def test_branch_requires_position(self):
        """BRANCH location requires position in (0,1)."""
        with pytest.raises(FaultScenarioValidationError, match="pozycji"):
            new_fault_scenario(
                study_case_id=FIXED_CASE_ID,
                name="Branch test",
                fault_type=FaultType.SC_3F,
                location=FaultLocation(
                    element_ref="branch-1", location_type="BRANCH", position=None
                ),
            )

    def test_bus_no_position(self):
        """BUS location must not have position."""
        with pytest.raises(FaultScenarioValidationError, match="pozycji"):
            new_fault_scenario(
                study_case_id=FIXED_CASE_ID,
                name="Bus test",
                fault_type=FaultType.SC_3F,
                location=FaultLocation(element_ref="bus-1", location_type="BUS", position=0.5),
            )
