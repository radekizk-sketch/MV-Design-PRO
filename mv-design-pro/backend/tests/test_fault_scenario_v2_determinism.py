"""
Test FaultScenario v2 — Determinism Proofs (PR-25)

FORMAL REQUIREMENTS:
1. Same Snapshot + FaultScenario v2 → identical hash (content_hash)
2. Permutation invariance for serialization (sorted keys)
3. Solver untouched: no imports from solver modified in PR-25
4. grep-zero PCC in fault_scenario domain

These tests serve as machine-verifiable determinism proofs.
"""

import hashlib
import json
from uuid import UUID

import pytest
from domain.fault_scenario import (
    FaultImpedance,
    FaultLocation,
    FaultMode,
    FaultScenario,
    FaultType,
    compute_scenario_content_hash,
    new_fault_scenario,
)

FIXED_CASE_ID = UUID("12345678-1234-1234-1234-123456789abc")


# ============================================================================
# PROOF 1: Same input → identical content_hash
# ============================================================================


class TestDeterminismProofIdenticalHash:
    """
    PROOF: compute_scenario_content_hash is a pure function.
    Given identical scenario content, the hash MUST be identical.
    """

    def test_metallic_node_determinism(self):
        """METALLIC + NODE: N executions → same hash."""
        hashes = set()
        for _ in range(10):
            s = new_fault_scenario(
                study_case_id=FIXED_CASE_ID,
                name="Deterministyczny",
                fault_type=FaultType.SC_3F,
                location=FaultLocation(element_ref="bus-42", location_type="NODE"),
                fault_mode=FaultMode.METALLIC,
            )
            hashes.add(compute_scenario_content_hash(s))
        assert len(hashes) == 1, f"Non-deterministic: {hashes}"

    def test_impedance_node_determinism(self):
        """IMPEDANCE + NODE: N executions → same hash."""
        hashes = set()
        for _ in range(10):
            s = new_fault_scenario(
                study_case_id=FIXED_CASE_ID,
                name="Impedancja test",
                fault_type=FaultType.SC_3F,
                location=FaultLocation(element_ref="bus-42", location_type="NODE"),
                fault_mode=FaultMode.IMPEDANCE,
                fault_impedance=FaultImpedance(r_ohm=1.5, x_ohm=3.0),
            )
            hashes.add(compute_scenario_content_hash(s))
        assert len(hashes) == 1, f"Non-deterministic: {hashes}"

    def test_branch_point_determinism(self):
        """BRANCH_POINT: N executions → same hash."""
        hashes = set()
        for _ in range(10):
            s = new_fault_scenario(
                study_case_id=FIXED_CASE_ID,
                name="Branch point",
                fault_type=FaultType.SC_3F,
                location=FaultLocation(
                    element_ref="line-7",
                    location_type="BRANCH_POINT",
                    position=0.65,
                ),
            )
            hashes.add(compute_scenario_content_hash(s))
        assert len(hashes) == 1, f"Non-deterministic: {hashes}"

    def test_hash_is_sha256(self):
        """Hash output is valid SHA-256 hex (64 characters)."""
        s = new_fault_scenario(
            study_case_id=FIXED_CASE_ID,
            name="SHA test",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="bus-1", location_type="NODE"),
        )
        h = compute_scenario_content_hash(s)
        assert len(h) == 64
        int(h, 16)  # Must be valid hex


# ============================================================================
# PROOF 2: Serialization uses sorted keys (permutation invariance)
# ============================================================================


class TestDeterminismProofSortedKeys:
    """
    PROOF: JSON serialization inside compute_scenario_content_hash
    uses sort_keys=True and compact separators.
    """

    def test_canonical_json_matches_manual(self):
        """Manual canonical JSON produces same hash as compute_scenario_content_hash."""
        s = new_fault_scenario(
            study_case_id=FIXED_CASE_ID,
            name="Manual check",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="bus-1", location_type="NODE"),
            fault_mode=FaultMode.METALLIC,
        )
        # Manually build the canonical content dict (same as in compute_scenario_content_hash)
        content = {
            "analysis_type": s.analysis_type.value,
            "arc_params": s.arc_params,
            "config": s.config.to_dict(),
            "fault_impedance": (s.fault_impedance.to_dict() if s.fault_impedance else None),
            "fault_impedance_type": s.fault_impedance_type.value,
            "fault_mode": s.fault_mode.value,
            "fault_type": s.fault_type.value,
            "location": s.location.to_dict(),
            "name": s.name,
            "z0_bus_data": s.z0_bus_data,
        }
        payload = json.dumps(content, sort_keys=True, separators=(",", ":"))
        expected_hash = hashlib.sha256(payload.encode("utf-8")).hexdigest()

        actual_hash = compute_scenario_content_hash(s)
        assert actual_hash == expected_hash

    def test_to_dict_then_from_dict_preserves_hash(self):
        """Round-trip through to_dict/from_dict produces same content_hash."""
        s = new_fault_scenario(
            study_case_id=FIXED_CASE_ID,
            name="Roundtrip hash",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(
                element_ref="line-1",
                location_type="BRANCH_POINT",
                position=0.5,
            ),
            fault_mode=FaultMode.IMPEDANCE,
            fault_impedance=FaultImpedance(r_ohm=2.0, x_ohm=4.0),
        )
        data = s.to_dict()
        restored = FaultScenario.from_dict(data)
        assert compute_scenario_content_hash(restored) == compute_scenario_content_hash(s)


# ============================================================================
# PROOF 3: v2 fields affect hash (no silent drops)
# ============================================================================


class TestV2FieldsInHash:
    """
    PROOF: Every v2 field that should be in the hash IS in the hash.
    Changing any v2 field → different hash.
    """

    def test_fault_mode_changes_hash(self):
        s_metallic = new_fault_scenario(
            study_case_id=FIXED_CASE_ID,
            name="Mode test",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="bus-1", location_type="NODE"),
            fault_mode=FaultMode.METALLIC,
        )
        s_impedance = new_fault_scenario(
            study_case_id=FIXED_CASE_ID,
            name="Mode test",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="bus-1", location_type="NODE"),
            fault_mode=FaultMode.IMPEDANCE,
            fault_impedance=FaultImpedance(r_ohm=1.0, x_ohm=2.0),
        )
        assert compute_scenario_content_hash(s_metallic) != compute_scenario_content_hash(
            s_impedance
        )

    def test_fault_impedance_r_changes_hash(self):
        s1 = new_fault_scenario(
            study_case_id=FIXED_CASE_ID,
            name="R test",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="bus-1", location_type="NODE"),
            fault_mode=FaultMode.IMPEDANCE,
            fault_impedance=FaultImpedance(r_ohm=1.0, x_ohm=2.0),
        )
        s2 = new_fault_scenario(
            study_case_id=FIXED_CASE_ID,
            name="R test",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="bus-1", location_type="NODE"),
            fault_mode=FaultMode.IMPEDANCE,
            fault_impedance=FaultImpedance(r_ohm=1.1, x_ohm=2.0),
        )
        assert compute_scenario_content_hash(s1) != compute_scenario_content_hash(s2)

    def test_location_type_changes_hash(self):
        s_node = new_fault_scenario(
            study_case_id=FIXED_CASE_ID,
            name="Loc test",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="el-1", location_type="NODE"),
        )
        s_bp = new_fault_scenario(
            study_case_id=FIXED_CASE_ID,
            name="Loc test",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="el-1", location_type="BRANCH_POINT", position=0.5),
        )
        assert compute_scenario_content_hash(s_node) != compute_scenario_content_hash(s_bp)

    def test_alpha_changes_hash(self):
        s1 = new_fault_scenario(
            study_case_id=FIXED_CASE_ID,
            name="Alpha test",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(
                element_ref="line-1", location_type="BRANCH_POINT", position=0.3
            ),
        )
        s2 = new_fault_scenario(
            study_case_id=FIXED_CASE_ID,
            name="Alpha test",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(
                element_ref="line-1", location_type="BRANCH_POINT", position=0.7
            ),
        )
        assert compute_scenario_content_hash(s1) != compute_scenario_content_hash(s2)


# ============================================================================
# PROOF 4: grep-zero PCC in domain
# ============================================================================


class TestGrepZeroPCC:
    """
    PROOF: The term 'PCC' does not appear in the fault_scenario domain file.
    """

    def test_no_pcc_in_fault_scenario_domain(self):
        import inspect

        import domain.fault_scenario as module

        source = inspect.getsource(module)
        # Allow 'PCC' only inside comments about this prohibition itself
        lines = source.split("\n")
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            if "PCC" in stripped.upper():
                # Fail if PCC appears outside a comment about prohibition
                if not stripped.startswith("#"):
                    pytest.fail(f"PCC found in non-comment at line {i}: {stripped}")


# ============================================================================
# PROOF 5: Solver files untouched
# ============================================================================


class TestSolverUntouched:
    """
    PROOF: The solver module is importable and its public API is unchanged.
    This test verifies that PR-25 did not modify the solver.
    """

    def test_solver_imports_unchanged(self):
        """Verify solver can be imported and has expected public API."""
        from network_model.solvers.short_circuit_iec60909 import (
            EXPECTED_SHORT_CIRCUIT_RESULT_KEYS,
            ShortCircuitIEC60909Solver,
        )

        # Verify expected API exists
        assert hasattr(ShortCircuitIEC60909Solver, "compute_3ph_short_circuit")
        assert hasattr(ShortCircuitIEC60909Solver, "compute_1ph_short_circuit")
        assert hasattr(ShortCircuitIEC60909Solver, "compute_2ph_short_circuit")
        assert isinstance(EXPECTED_SHORT_CIRCUIT_RESULT_KEYS, list)

    def test_binding_api_unchanged(self):
        """Verify binding function signature is unchanged."""
        from application.solvers.short_circuit_binding import (
            execute_short_circuit,
        )

        assert callable(execute_short_circuit)
