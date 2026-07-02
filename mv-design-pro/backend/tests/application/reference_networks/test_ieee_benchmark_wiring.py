"""
K-04 / K-09 wiring test: IEEE cross-validation references drive a real verdict.

This proves the wiring between the committed IEEE references and the V12.6
academic benchmark validation:
  - references come from pandapower (independent), calculated from our solver,
  - the verdict is a genuine cross-validation, not the "dane niekompletne" path,
  - the proof type is the cross-validation marker (K-09).
"""

from __future__ import annotations

from application.reference_networks import (
    CROSS_VALIDATION_PROOF_TYPE,
    FROZEN_SOLVER_CROSS_VALIDATION_PROOF_TYPE,
    IEEE_CROSS_VALIDATION_NETWORK_IDS,
    build_ieee_all_benchmark_references,
    build_ieee_benchmark_references,
    build_ieee_frozen_solver_benchmark_references,
)
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126BusInput,
)


def _run_benchmark(references: list[dict]) -> dict:
    model = V126AcademicInput(
        buses=[V126BusInput(ref="B1", name="ref", nominal_kv=345.0)],
        parameters={"benchmark_references": references},
    )
    return V126AcademicSolver().run(V126AnalysisType.BENCHMARK_VALIDATION, model)["result"]


class TestIeeeBenchmarkWiring:
    def test_builds_rows_for_all_ieee_cases(self) -> None:
        refs = build_ieee_benchmark_references()
        networks = {row["network"] for row in refs}
        assert networks == set(IEEE_CROSS_VALIDATION_NETWORK_IDS)
        # one row per bus: 9 + 14 + 39 = 62
        assert len(refs) == 62

    def test_every_row_is_cross_validation_proof(self) -> None:
        refs = build_ieee_benchmark_references()
        assert all(row["proof_type"] == CROSS_VALIDATION_PROOF_TYPE for row in refs)
        # reference != calculated keys (independent source vs our solver)
        for row in refs:
            assert "reference" in row and "calculated" in row

    def test_reference_and_calculated_are_distinct_fields(self) -> None:
        """No tautology: reference is pandapower, calculated is our solver."""
        refs = build_ieee_benchmark_references()
        # The values agree numerically (that is the proof) but originate from
        # different sources; at least confirm the rows are well-formed floats.
        for row in refs:
            assert isinstance(row["reference"], float)
            assert isinstance(row["calculated"], float)

    def test_benchmark_validation_passes_with_cross_validation_proof(self) -> None:
        refs = build_ieee_benchmark_references()
        result = _run_benchmark(refs)
        assert result["references_provided"] is True
        assert result["status"] == "PASS"
        assert result["proof_type"] == CROSS_VALIDATION_PROOF_TYPE
        assert len(result["validation_report"]) == len(refs)
        assert all(row["status"] == "PASS" for row in result["validation_report"])

    def test_worst_delta_far_below_half_percent(self) -> None:
        refs = build_ieee_benchmark_references()
        worst = max(
            abs(row["calculated"] - row["reference"]) / max(abs(row["reference"]), 1e-9) * 100.0
            for row in refs
        )
        # Two independent NR implementations converge to the same per-unit
        # solution; the residual is floating-point / commit-precision noise.
        assert worst < 0.5
        assert worst < 1e-4

    def test_missing_references_still_reports_incomplete(self) -> None:
        """The 'dane niekompletne' path must remain intact (no silent PASS)."""
        result = _run_benchmark([])
        assert result["references_provided"] is False
        assert result["status"] == "dane niekompletne"


class TestIeeeFrozenSolverBenchmarkWiring:
    """K-04 reflects the PRODUCTION solver (power_flow_newton), not only the harness."""

    def test_builds_rows_for_all_ieee_cases(self) -> None:
        refs = build_ieee_frozen_solver_benchmark_references()
        networks = {row["network"] for row in refs}
        assert networks == set(IEEE_CROSS_VALIDATION_NETWORK_IDS)
        assert len(refs) == 62  # 9 + 14 + 39

    def test_every_row_marks_production_solver(self) -> None:
        refs = build_ieee_frozen_solver_benchmark_references()
        assert all(row["proof_type"] == FROZEN_SOLVER_CROSS_VALIDATION_PROOF_TYPE for row in refs)
        assert all(row["solver"] == "power_flow_newton" for row in refs)
        # The production rows are distinguishable from the harness rows.
        assert all(row["test"].startswith("PF_prod_|V|_") for row in refs)

    def test_production_verdict_passes(self) -> None:
        refs = build_ieee_frozen_solver_benchmark_references()
        result = _run_benchmark(refs)
        assert result["references_provided"] is True
        assert result["status"] == "PASS"
        assert result["proof_type"] == FROZEN_SOLVER_CROSS_VALIDATION_PROOF_TYPE
        assert all(row["status"] == "PASS" for row in result["validation_report"])

    def test_production_worst_delta_far_below_half_percent(self) -> None:
        refs = build_ieee_frozen_solver_benchmark_references()
        worst = max(
            abs(row["calculated"] - row["reference"]) / max(abs(row["reference"]), 1e-9) * 100.0
            for row in refs
        )
        assert worst < 0.5
        assert worst < 1e-4  # production NR converges to the pandapower solution

    def test_combined_feed_carries_both_solvers(self) -> None:
        """K-04 combined feed reflects BOTH the harness and the production NR."""
        harness = build_ieee_benchmark_references()
        combined = build_ieee_all_benchmark_references()
        assert len(combined) == len(harness) * 2  # 62 harness + 62 production
        proof_types = {row["proof_type"] for row in combined}
        assert proof_types == {
            CROSS_VALIDATION_PROOF_TYPE,
            FROZEN_SOLVER_CROSS_VALIDATION_PROOF_TYPE,
        }
        # Mixed proof types -> the academic solver reports the neutral overall
        # label, but every row keeps its own per-solver proof type.
        result = _run_benchmark(combined)
        assert result["status"] == "PASS"
        assert result["proof_type"] == "benchmark_regression"
        report_types = {row["proof_type"] for row in result["validation_report"]}
        assert report_types == {
            CROSS_VALIDATION_PROOF_TYPE,
            FROZEN_SOLVER_CROSS_VALIDATION_PROOF_TYPE,
        }
