"""
P21: Testy dla Power Flow Proof Pack.

Weryfikuje:
1. Determinizm: ten sam Run → identyczny Proof (JSON/LaTeX)
2. Kompletność: Proof zawiera WSZYSTKIE iteracje NR
3. Brak obliczeń wtórnych: dane wprost z trace
4. Stabilność mappingu: niezależność od kolejności elementów sieci
"""

from __future__ import annotations

import json
import math
import tempfile
from pathlib import Path

import pytest

# =============================================================================
# Test fixtures - mock data
# =============================================================================


def create_mock_trace():
    """Tworzy przykładowy PowerFlowTrace dla testów."""
    from network_model.solvers.power_flow_trace import (
        PowerFlowIterationTrace,
        PowerFlowTrace,
    )

    # Iteration 1
    iter_1 = PowerFlowIterationTrace(
        k=1,
        mismatch_per_bus={
            "BUS_001": {"delta_p_pu": 0.05, "delta_q_pu": 0.03},
            "BUS_002": {"delta_p_pu": -0.02, "delta_q_pu": 0.01},
        },
        norm_mismatch=0.06083,
        max_mismatch_pu=0.05,
        jacobian={
            "J1_dP_dTheta": [[1.0, -0.5], [-0.5, 1.0]],
            "J2_dP_dV": [[0.1, 0.0], [0.0, 0.1]],
            "J3_dQ_dTheta": [[0.05, 0.0], [0.0, 0.05]],
            "J4_dQ_dV": [[1.0, -0.3], [-0.3, 1.0]],
        },
        delta_state={
            "BUS_001": {"delta_theta_rad": 0.01, "delta_v_pu": 0.005},
            "BUS_002": {"delta_theta_rad": -0.005, "delta_v_pu": 0.002},
        },
        state_next={
            "BUS_001": {"v_pu": 1.005, "theta_rad": 0.01},
            "BUS_002": {"v_pu": 1.002, "theta_rad": -0.005},
        },
        damping_used=1.0,
        step_norm=0.0112,
    )

    # Iteration 2
    iter_2 = PowerFlowIterationTrace(
        k=2,
        mismatch_per_bus={
            "BUS_001": {"delta_p_pu": 0.001, "delta_q_pu": 0.0005},
            "BUS_002": {"delta_p_pu": -0.0008, "delta_q_pu": 0.0003},
        },
        norm_mismatch=0.00134,
        max_mismatch_pu=0.001,
        jacobian={
            "J1_dP_dTheta": [[1.02, -0.48], [-0.48, 1.02]],
            "J2_dP_dV": [[0.11, 0.01], [0.01, 0.11]],
            "J3_dQ_dTheta": [[0.055, 0.005], [0.005, 0.055]],
            "J4_dQ_dV": [[0.98, -0.28], [-0.28, 0.98]],
        },
        delta_state={
            "BUS_001": {"delta_theta_rad": 0.0002, "delta_v_pu": 0.0001},
            "BUS_002": {"delta_theta_rad": -0.0001, "delta_v_pu": 0.00005},
        },
        state_next={
            "BUS_001": {"v_pu": 1.0051, "theta_rad": 0.0102},
            "BUS_002": {"v_pu": 1.00205, "theta_rad": -0.0051},
        },
        damping_used=1.0,
        step_norm=0.00023,
    )

    # Iteration 3 (converged)
    iter_3 = PowerFlowIterationTrace(
        k=3,
        mismatch_per_bus={
            "BUS_001": {"delta_p_pu": 1e-9, "delta_q_pu": 5e-10},
            "BUS_002": {"delta_p_pu": -8e-10, "delta_q_pu": 3e-10},
        },
        norm_mismatch=1.3e-9,
        max_mismatch_pu=1e-9,
        jacobian=None,  # Not stored on final iteration
        delta_state=None,
        state_next={
            "BUS_001": {"v_pu": 1.0051, "theta_rad": 0.0102},
            "BUS_002": {"v_pu": 1.00205, "theta_rad": -0.0051},
        },
        damping_used=1.0,
        step_norm=0.0,
    )

    return PowerFlowTrace(
        solver_version="1.0.0",
        input_hash="abc123def456",
        snapshot_id="snap-001",
        case_id="case-001",
        run_id="run-001",
        init_state={
            "BUS_001": {"v_pu": 1.0, "theta_rad": 0.0},
            "BUS_002": {"v_pu": 1.0, "theta_rad": 0.0},
            "BUS_SLACK": {"v_pu": 1.0, "theta_rad": 0.0},
        },
        init_method="flat",
        tolerance=1e-8,
        max_iterations=30,
        base_mva=100.0,
        slack_bus_id="BUS_SLACK",
        pq_bus_ids=("BUS_001", "BUS_002"),
        pv_bus_ids=(),
        ybus_trace={"dimensions": [3, 3], "nonzero_count": 7},
        iterations=(iter_1, iter_2, iter_3),
        converged=True,
        final_iterations_count=3,
    )


def create_mock_result():
    """Tworzy przykładowy PowerFlowResultV1 dla testów."""
    from network_model.solvers.power_flow_result import (
        PowerFlowBranchResult,
        PowerFlowBusResult,
        PowerFlowResultV1,
        PowerFlowSummary,
    )

    return PowerFlowResultV1(
        result_version="1.0.0",
        converged=True,
        iterations_count=3,
        tolerance_used=1e-8,
        base_mva=100.0,
        slack_bus_id="BUS_SLACK",
        bus_results=(
            PowerFlowBusResult(
                bus_id="BUS_001",
                v_pu=1.0051,
                angle_deg=math.degrees(0.0102),
                p_injected_mw=10.5,
                q_injected_mvar=3.2,
            ),
            PowerFlowBusResult(
                bus_id="BUS_002",
                v_pu=1.00205,
                angle_deg=math.degrees(-0.0051),
                p_injected_mw=-5.0,
                q_injected_mvar=-1.5,
            ),
            PowerFlowBusResult(
                bus_id="BUS_SLACK",
                v_pu=1.0,
                angle_deg=0.0,
                p_injected_mw=-5.3,  # Slack absorbs excess
                q_injected_mvar=-1.6,
            ),
        ),
        branch_results=(
            PowerFlowBranchResult(
                branch_id="LINE_001_002",
                p_from_mw=10.3,
                q_from_mvar=3.1,
                p_to_mw=-10.2,
                q_to_mvar=-3.0,
                losses_p_mw=0.1,
                losses_q_mvar=0.1,
            ),
        ),
        summary=PowerFlowSummary(
            total_losses_p_mw=0.2,
            total_losses_q_mvar=0.1,
            min_v_pu=1.0,
            max_v_pu=1.0051,
            slack_p_mw=-5.3,
            slack_q_mvar=-1.6,
        ),
    )


# =============================================================================
# Determinism tests
# =============================================================================


class TestProofDeterminism:
    """Testy determinizmu generowania dowodu.

    P21 DETERMINISTIC wymaga:
    - Ten sam trace + run_timestamp → identyczny document_id (sha256)
    - Ten sam trace + run_timestamp → identyczny created_at
    - Ten sam trace + run_timestamp → identyczny JSON (byte-for-byte)
    - Ten sam trace + run_timestamp → identyczny LaTeX (byte-for-byte)
    """

    def test_document_id_is_deterministic(self):
        """document_id = sha256(run_id:input_hash:snapshot_id) - deterministyczne."""
        from network_model.proof import build_power_flow_proof

        trace = create_mock_trace()
        result = create_mock_result()
        run_timestamp = "2024-01-15T10:30:00+00:00"

        # Generate proof twice with same inputs
        proof_1 = build_power_flow_proof(
            trace=trace,
            result=result,
            project_name="Test Project",
            case_name="Test Case",
            run_timestamp=run_timestamp,
        )
        proof_2 = build_power_flow_proof(
            trace=trace,
            result=result,
            project_name="Test Project",
            case_name="Test Case",
            run_timestamp=run_timestamp,
        )

        # document_id should be identical (sha256 deterministic)
        assert (
            proof_1.document_id == proof_2.document_id
        ), "document_id must be deterministic (same trace → same ID)"

        # Verify it's not empty/default
        assert len(proof_1.document_id) == 32, "document_id should be 32-char hex"

    def test_created_at_uses_run_timestamp(self):
        """created_at = run_timestamp z persistence, nie datetime.now()."""
        from network_model.proof import build_power_flow_proof

        trace = create_mock_trace()
        result = create_mock_result()
        run_timestamp = "2024-01-15T10:30:00+00:00"

        proof = build_power_flow_proof(
            trace=trace,
            result=result,
            run_timestamp=run_timestamp,
        )

        # created_at should match run_timestamp
        assert (
            proof.created_at == run_timestamp
        ), "created_at must use run_timestamp from persistence, not datetime.now()"

    def test_same_trace_produces_byte_identical_json(self):
        """Ten sam trace + run_timestamp → identyczny JSON (byte-for-byte)."""
        from network_model.proof import build_power_flow_proof

        trace = create_mock_trace()
        result = create_mock_result()
        run_timestamp = "2024-01-15T10:30:00+00:00"

        # Generate proof twice
        proof_1 = build_power_flow_proof(
            trace=trace,
            result=result,
            project_name="Test Project",
            case_name="Test Case",
            run_timestamp=run_timestamp,
        )
        proof_2 = build_power_flow_proof(
            trace=trace,
            result=result,
            project_name="Test Project",
            case_name="Test Case",
            run_timestamp=run_timestamp,
        )

        # Full JSON should be byte-identical (including document_id, created_at)
        json_1 = json.dumps(proof_1.to_dict(), sort_keys=True, indent=2)
        json_2 = json.dumps(proof_2.to_dict(), sort_keys=True, indent=2)

        assert json_1 == json_2, "Proof JSON must be byte-identical for same input"

    def test_same_trace_produces_identical_latex(self):
        """Ten sam trace + run_timestamp → identyczny LaTeX (byte-for-byte)."""
        from network_model.proof import build_power_flow_proof, export_proof_to_latex

        trace = create_mock_trace()
        result = create_mock_result()
        run_timestamp = "2024-01-15T10:30:00+00:00"

        # Generate proof twice
        proof_1 = build_power_flow_proof(
            trace=trace,
            result=result,
            project_name="Test Project",
            case_name="Test Case",
            run_timestamp=run_timestamp,
        )
        proof_2 = build_power_flow_proof(
            trace=trace,
            result=result,
            project_name="Test Project",
            case_name="Test Case",
            run_timestamp=run_timestamp,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            path_1 = Path(tmpdir) / "proof_1.tex"
            path_2 = Path(tmpdir) / "proof_2.tex"

            export_proof_to_latex(proof_1, path_1)
            export_proof_to_latex(proof_2, path_2)

            content_1 = path_1.read_text(encoding="utf-8")
            content_2 = path_2.read_text(encoding="utf-8")

            assert content_1 == content_2, "LaTeX must be byte-identical for same input"

    def test_different_run_timestamp_produces_different_created_at(self):
        """Różny run_timestamp → różny created_at (ale ten sam document_id)."""
        from network_model.proof import build_power_flow_proof

        trace = create_mock_trace()
        result = create_mock_result()

        proof_1 = build_power_flow_proof(
            trace=trace,
            result=result,
            run_timestamp="2024-01-15T10:30:00+00:00",
        )
        proof_2 = build_power_flow_proof(
            trace=trace,
            result=result,
            run_timestamp="2024-01-16T11:45:00+00:00",
        )

        # document_id should still be identical (based on trace IDs only)
        assert (
            proof_1.document_id == proof_2.document_id
        ), "document_id depends only on trace IDs, not timestamp"

        # But created_at should differ
        assert (
            proof_1.created_at != proof_2.created_at
        ), "Different run_timestamp should produce different created_at"

    def test_bus_order_independence(self):
        """Proof jest niezależny od kolejności busów w trace."""
        from network_model.proof import build_power_flow_proof
        from network_model.solvers.power_flow_trace import (
            PowerFlowIterationTrace,
            PowerFlowTrace,
        )

        run_timestamp = "2024-01-15T10:30:00+00:00"

        # Create trace with buses in different order
        iter_trace = PowerFlowIterationTrace(
            k=1,
            mismatch_per_bus={
                "BUS_B": {"delta_p_pu": 0.02, "delta_q_pu": 0.01},
                "BUS_A": {"delta_p_pu": 0.03, "delta_q_pu": 0.015},
            },
            norm_mismatch=0.036,
            max_mismatch_pu=0.03,
        )

        trace_1 = PowerFlowTrace(
            solver_version="1.0.0",
            input_hash="test123",
            snapshot_id=None,
            case_id=None,
            run_id="run-1",
            init_state={
                "BUS_A": {"v_pu": 1.0, "theta_rad": 0.0},
                "BUS_B": {"v_pu": 1.0, "theta_rad": 0.0},
            },
            init_method="flat",
            tolerance=1e-8,
            max_iterations=30,
            base_mva=100.0,
            slack_bus_id="BUS_SLACK",
            pq_bus_ids=("BUS_A", "BUS_B"),
            pv_bus_ids=(),
            ybus_trace={},
            iterations=(iter_trace,),
            converged=False,
            final_iterations_count=1,
        )

        # Same trace but buses in init_state are in different order
        trace_2 = PowerFlowTrace(
            solver_version="1.0.0",
            input_hash="test123",
            snapshot_id=None,
            case_id=None,
            run_id="run-1",
            init_state={
                "BUS_B": {"v_pu": 1.0, "theta_rad": 0.0},
                "BUS_A": {"v_pu": 1.0, "theta_rad": 0.0},
            },
            init_method="flat",
            tolerance=1e-8,
            max_iterations=30,
            base_mva=100.0,
            slack_bus_id="BUS_SLACK",
            pq_bus_ids=("BUS_B", "BUS_A"),  # Different order
            pv_bus_ids=(),
            ybus_trace={},
            iterations=(iter_trace,),
            converged=False,
            final_iterations_count=1,
        )

        result = create_mock_result()

        proof_1 = build_power_flow_proof(
            trace=trace_1,
            result=result,
            artifact_id="fixed-id",
            run_timestamp=run_timestamp,
        )
        proof_2 = build_power_flow_proof(
            trace=trace_2,
            result=result,
            artifact_id="fixed-id",
            run_timestamp=run_timestamp,
        )

        # Network definitions should be sorted and thus identical
        assert proof_1.network_definition.to_dict() == proof_2.network_definition.to_dict()


# =============================================================================
# Completeness tests
# =============================================================================


class TestProofCompleteness:
    """Testy kompletności dowodu."""

    def test_proof_contains_all_iterations(self):
        """Proof zawiera WSZYSTKIE iteracje NR z trace."""
        from network_model.proof import build_power_flow_proof

        trace = create_mock_trace()
        result = create_mock_result()

        proof = build_power_flow_proof(
            trace=trace,
            result=result,
        )

        assert len(proof.iterations) == 3, "Should have 3 iteration sections"
        assert proof.iterations[0].iteration_number == 1
        assert proof.iterations[1].iteration_number == 2
        assert proof.iterations[2].iteration_number == 3

    def test_all_mandatory_sections_present(self):
        """Proof zawiera wszystkie obowiązkowe sekcje."""
        from network_model.proof import build_power_flow_proof

        trace = create_mock_trace()
        result = create_mock_result()

        proof = build_power_flow_proof(
            trace=trace,
            result=result,
        )

        # Check mandatory sections
        assert proof.header is not None
        assert proof.network_definition is not None
        assert len(proof.power_flow_equations) >= 2  # P and Q equations
        assert proof.nr_method_description is not None
        assert proof.initial_state is not None
        assert len(proof.iterations) > 0
        assert proof.convergence_criterion is not None
        assert proof.final_state is not None
        assert proof.verification is not None
        assert proof.summary is not None

    def test_each_iteration_has_required_steps(self):
        """Każda iteracja ma wymagane kroki."""
        from network_model.proof import build_power_flow_proof

        trace = create_mock_trace()
        result = create_mock_result()

        proof = build_power_flow_proof(
            trace=trace,
            result=result,
        )

        for iter_section in proof.iterations:
            # Mandatory steps
            assert iter_section.mismatch_step is not None
            assert iter_section.norm_step is not None
            assert iter_section.convergence_check is not None

            # Optional steps (depend on trace content)
            # jacobian_step, delta_step, state_update_step may be None


# =============================================================================
# No secondary calculations tests
# =============================================================================


class TestNoSecondaryCalculations:
    """Testy że dane są wprost z trace, bez obliczeń wtórnych."""

    def test_mismatch_values_from_trace(self):
        """Wartości mismatch pochodzą bezpośrednio z trace."""
        from network_model.proof import build_power_flow_proof

        trace = create_mock_trace()
        result = create_mock_result()

        proof = build_power_flow_proof(
            trace=trace,
            result=result,
        )

        # Check iteration 1 mismatch
        iter_1 = proof.iterations[0]
        mismatch_result = iter_1.mismatch_step.result

        # The max_mismatch_pu should match trace
        assert mismatch_result.value == 0.05, "Mismatch should come from trace"

    def test_norm_values_from_trace(self):
        """Wartości normy pochodzą bezpośrednio z trace."""
        from network_model.proof import build_power_flow_proof

        trace = create_mock_trace()
        result = create_mock_result()

        proof = build_power_flow_proof(
            trace=trace,
            result=result,
        )

        # Check iteration 1 norm
        iter_1 = proof.iterations[0]

        # Find norm value in input_values
        norm_values = [v for v in iter_1.norm_step.input_values if "norm" in v.source_key.lower()]
        assert len(norm_values) >= 1


# =============================================================================
# Export tests
# =============================================================================


class TestExports:
    """Testy eksportów."""

    def test_json_export_valid(self):
        """Eksport JSON jest poprawny."""
        from network_model.proof import build_power_flow_proof, export_proof_to_json

        trace = create_mock_trace()
        result = create_mock_result()

        proof = build_power_flow_proof(
            trace=trace,
            result=result,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "proof.json"
            export_proof_to_json(proof, path)

            assert path.exists()

            with open(path, encoding="utf-8") as f:
                data = json.load(f)

            assert data["report_type"] == "power_flow_proof"
            assert "proof_document" in data

    def test_latex_export_valid(self):
        """Eksport LaTeX jest poprawny."""
        from network_model.proof import build_power_flow_proof, export_proof_to_latex

        trace = create_mock_trace()
        result = create_mock_result()

        proof = build_power_flow_proof(
            trace=trace,
            result=result,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "proof.tex"
            export_proof_to_latex(proof, path)

            assert path.exists()

            content = path.read_text(encoding="utf-8")
            assert r"\documentclass" in content
            assert r"\begin{document}" in content
            assert r"\end{document}" in content
            assert "Newton" in content or "Newtona" in content

    def test_latex_contains_all_equations(self):
        """LaTeX zawiera wszystkie równania z registry."""
        from network_model.proof import build_power_flow_proof, export_proof_to_latex

        trace = create_mock_trace()
        result = create_mock_result()

        proof = build_power_flow_proof(
            trace=trace,
            result=result,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "proof.tex"
            export_proof_to_latex(proof, path)

            content = path.read_text(encoding="utf-8")

            # Check for key equation components
            assert "P_i" in content  # Power injection
            assert "Q_i" in content  # Reactive power
            assert "Jacobi" in content or "\\mathbf{J}" in content  # Jacobian


# =============================================================================
# Verification tests
# =============================================================================


class TestVerification:
    """Testy sekcji weryfikacji."""

    def test_unit_consistency_check(self):
        """Weryfikacja spójności jednostek."""
        from network_model.proof import build_power_flow_proof

        trace = create_mock_trace()
        result = create_mock_result()

        proof = build_power_flow_proof(
            trace=trace,
            result=result,
        )

        # Verification should pass for valid data
        assert proof.verification.unit_consistency is True

    def test_energy_balance_check(self):
        """Weryfikacja bilansu energetycznego."""
        from network_model.proof import build_power_flow_proof

        trace = create_mock_trace()
        result = create_mock_result()

        proof = build_power_flow_proof(
            trace=trace,
            result=result,
        )

        # For converged solution, energy balance should be true
        assert proof.verification.energy_balance is True

    def test_no_contradictions_check(self):
        """Weryfikacja braku sprzeczności."""
        from network_model.proof import build_power_flow_proof

        trace = create_mock_trace()
        result = create_mock_result()

        proof = build_power_flow_proof(
            trace=trace,
            result=result,
        )

        # For valid voltages (0.5-1.5 p.u.), should pass
        assert proof.verification.no_contradictions is True


# =============================================================================
# Edge case tests
# =============================================================================


class TestEdgeCases:
    """Testy przypadków brzegowych."""

    def test_unconverged_proof(self):
        """Proof dla niezbieżnych obliczeń."""
        from network_model.proof import build_power_flow_proof
        from network_model.solvers.power_flow_result import (
            PowerFlowResultV1,
            PowerFlowSummary,
        )
        from network_model.solvers.power_flow_trace import (
            PowerFlowIterationTrace,
            PowerFlowTrace,
        )

        # Create unconverged trace
        iter_trace = PowerFlowIterationTrace(
            k=1,
            mismatch_per_bus={"BUS_001": {"delta_p_pu": 0.5, "delta_q_pu": 0.3}},
            norm_mismatch=0.58,
            max_mismatch_pu=0.5,
        )

        trace = PowerFlowTrace(
            solver_version="1.0.0",
            input_hash="test",
            snapshot_id=None,
            case_id=None,
            run_id="run-fail",
            init_state={"BUS_001": {"v_pu": 1.0, "theta_rad": 0.0}},
            init_method="flat",
            tolerance=1e-8,
            max_iterations=30,
            base_mva=100.0,
            slack_bus_id="BUS_SLACK",
            pq_bus_ids=("BUS_001",),
            pv_bus_ids=(),
            ybus_trace={},
            iterations=(iter_trace,),
            converged=False,
            final_iterations_count=30,
        )

        result = PowerFlowResultV1(
            result_version="1.0.0",
            converged=False,
            iterations_count=30,
            tolerance_used=1e-8,
            base_mva=100.0,
            slack_bus_id="BUS_SLACK",
            bus_results=(),
            branch_results=(),
            summary=PowerFlowSummary(
                total_losses_p_mw=0.0,
                total_losses_q_mvar=0.0,
                min_v_pu=1.0,
                max_v_pu=1.0,
                slack_p_mw=0.0,
                slack_q_mvar=0.0,
            ),
        )

        proof = build_power_flow_proof(
            trace=trace,
            result=result,
        )

        assert proof.summary.converged is False
        assert len(proof.summary.warnings) > 0  # Should have warning about non-convergence

    def test_empty_iterations(self):
        """Proof z pustą listą iteracji (edge case)."""
        from network_model.proof import build_power_flow_proof
        from network_model.solvers.power_flow_result import (
            PowerFlowResultV1,
            PowerFlowSummary,
        )
        from network_model.solvers.power_flow_trace import PowerFlowTrace

        trace = PowerFlowTrace(
            solver_version="1.0.0",
            input_hash="test",
            snapshot_id=None,
            case_id=None,
            run_id="run-empty",
            init_state={},
            init_method="flat",
            tolerance=1e-8,
            max_iterations=30,
            base_mva=100.0,
            slack_bus_id="BUS_SLACK",
            pq_bus_ids=(),
            pv_bus_ids=(),
            ybus_trace={},
            iterations=(),  # Empty
            converged=True,  # Already converged (trivial case)
            final_iterations_count=0,
        )

        result = PowerFlowResultV1(
            result_version="1.0.0",
            converged=True,
            iterations_count=0,
            tolerance_used=1e-8,
            base_mva=100.0,
            slack_bus_id="BUS_SLACK",
            bus_results=(),
            branch_results=(),
            summary=PowerFlowSummary(
                total_losses_p_mw=0.0,
                total_losses_q_mvar=0.0,
                min_v_pu=0.0,
                max_v_pu=0.0,
                slack_p_mw=0.0,
                slack_q_mvar=0.0,
            ),
        )

        proof = build_power_flow_proof(
            trace=trace,
            result=result,
        )

        assert len(proof.iterations) == 0
        assert proof.summary.iterations_count == 0

    def test_missing_theta_rad_in_state_next_raises_not_flat_start(self):
        """FAB-E (E1): brak theta_rad w state_next NIE jest fikcyjnym 0 rad.

        Kontrakt frozen NR aktualizuje CALY wektor stanu na raz — brak
        theta_rad dla jednej szyny oznacza uszkodzony slad, nie plaski start.
        Proof Engine (czysta interpretacja, ZERO obliczen wtornych) musi
        odmowic zbudowania dowodu z takiego sladu, zamiast podpisac fikcyjna
        wartosc jako obliczony wynik.
        """
        from network_model.proof import build_power_flow_proof

        trace = create_mock_trace()
        result = create_mock_result()
        # Uszkadzamy slad: iteracja 1 traci theta_rad dla BUS_001.
        del trace.iterations[0].state_next["BUS_001"]["theta_rad"]

        with pytest.raises(ValueError, match="BUS_001.*theta_rad|theta_rad.*BUS_001"):
            build_power_flow_proof(
                trace=trace,
                result=result,
                project_name="Test Project",
                case_name="Test Case",
                run_timestamp="2024-01-15T10:30:00+00:00",
            )

    def test_missing_v_pu_in_init_state_exports_as_brak_danych_not_flat_start(self):
        """FAB-E (E1): brak v_pu w init_state w eksporcie LaTeX to „brak danych", nie 1.0 p.u.

        ``PowerFlowProofBuilder`` przenosi ``init_state`` 1:1 (bez walidacji
        pol) — to ``export_proof_to_latex`` (``power_flow_proof_export.py``,
        tabela stanu poczatkowego) pierwszy odczytuje ``v_pu``/``theta_rad``
        pojedynczo. Przed poprawka brakujace pole bylo czytane jako fikcyjny
        start plaski (1.0 p.u. / 0 rad), co w formalnym dowodzie wygladalo
        jak realna wartosc uzyta przez solver.
        """
        from network_model.proof import build_power_flow_proof, export_proof_to_latex

        trace = create_mock_trace()
        result = create_mock_result()
        del trace.init_state["BUS_002"]["v_pu"]

        proof = build_power_flow_proof(
            trace=trace,
            result=result,
            project_name="Test Project",
            case_name="Test Case",
            run_timestamp="2024-01-15T10:30:00+00:00",
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "proof.tex"
            export_proof_to_latex(proof, path)
            content = path.read_text(encoding="utf-8")

        assert "brak danych" in content
        # BUS_001 (kompletny) nadal renderuje sie normalnie — poprawka nie
        # ukrywa prawdziwych wartosci za "brak danych".
        assert "1.0000" in content


# =============================================================================
# Equation registry tests
# =============================================================================


class TestEquationRegistry:
    """Testy rejestru równań."""

    def test_equation_ids_are_unique(self):
        """ID równań są unikalne."""
        from network_model.proof.power_flow_equations import POWER_FLOW_EQUATION_REGISTRY

        ids = [eq.equation_id for eq in POWER_FLOW_EQUATION_REGISTRY]
        assert len(ids) == len(set(ids)), "Equation IDs must be unique"

    def test_equation_ids_follow_pattern(self):
        """ID równań spełniają wzorzec."""
        import re

        from network_model.proof.power_flow_equations import POWER_FLOW_EQUATION_REGISTRY

        pattern = r"^EQ_[A-Z]+_\d{3}$"
        for eq in POWER_FLOW_EQUATION_REGISTRY:
            assert re.match(pattern, eq.equation_id), f"Invalid ID: {eq.equation_id}"

    def test_get_equation_by_id(self):
        """Pobieranie równania po ID działa."""
        from network_model.proof.power_flow_equations import get_equation_by_id

        eq = get_equation_by_id("EQ_PF_001")
        assert eq is not None
        assert eq.equation_id == "EQ_PF_001"

        missing = get_equation_by_id("EQ_NONEXISTENT")
        assert missing is None

    def test_equations_have_polish_names(self):
        """Równania mają polskie nazwy."""
        from network_model.proof.power_flow_equations import POWER_FLOW_EQUATION_REGISTRY

        for eq in POWER_FLOW_EQUATION_REGISTRY:
            assert eq.name_pl, f"Equation {eq.equation_id} missing Polish name"
            # Basic check for Polish characters or common Polish words
            assert len(eq.name_pl) > 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
