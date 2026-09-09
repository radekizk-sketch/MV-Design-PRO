"""
K-04 / K-09 wiring test: IEEE cross-validation references drive a real verdict.

This proves the wiring between the committed IEEE references and the V12.6
academic benchmark validation:
  - references come from pandapower (independent), calculated from our PRODUCTION
    solver (power_flow_newton, via the canonical ENM twin / tor kanoniczny),
  - the verdict is a genuine cross-validation, not the "dane niekompletne" path,
  - the proof type is the cross-validation marker (K-09).

Kontrola jakości zdolności WYCOFANEJ `V126AnalysisType.BENCHMARK_VALIDATION`
(`tests/ci/test_v126_rodzaje_parytet.py::KONTROLA_JAKOSCI_WYCOFANYCH`
wskazuje na TEN plik) — projektant nie ma dziś ekranu prowadzącego do tej
zdolności, ale backend zostaje w pełni sprawny i pokryty testem.

Karta K2 (2026-09-09): `application/reference_networks/**` (dawny dialekt
budujący sieci jako słownik, WŁASNY Newton-Raphson w `computation.py`) skasowany
w całości. Ten plik nosił wcześniej DWIE klasy testów: `TestIeeeBenchmarkWiring`
("harness" — porównywała dwie homegrown implementacje NR ze sobą, ŻADNA
produkcyjna) i `TestIeeeFrozenSolverBenchmarkWiring` (produkcyjna — jedyna,
która faktycznie certyfikuje solver realnie używany w produkcie). Harness stracił
sens bez drugiego uczestnika (`computation.py` usunięty) — usunięty razem z
dialektem, NIE zastąpiony (obie strony porównania były pozaprodukcyjne).
Zostaje wyłącznie klasa produkcyjna, przepięta na `kontrola_v126.py`
(`tests/golden/enm_builders/*.py` + tor kanoniczny `enm/canonical_analysis.py`
zamiast dialektu `library.py`/`frozen_solver_input.py`).
"""

from __future__ import annotations

from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126BusInput,
)

from tests.golden.parytet_benchmarkow.kontrola_v126 import (
    FROZEN_SOLVER_CROSS_VALIDATION_PROOF_TYPE,
    IEEE_CROSS_VALIDATION_NETWORK_IDS,
    build_ieee_frozen_solver_benchmark_references,
)


def _run_benchmark(references: list[dict]) -> dict:
    model = V126AcademicInput(
        buses=[V126BusInput(ref="B1", name="ref", nominal_kv=345.0)],
        parameters={"benchmark_references": references},
    )
    return V126AcademicSolver().run(V126AnalysisType.BENCHMARK_VALIDATION, model)["result"]


class TestIeeeFrozenSolverBenchmarkWiring:
    """K-04 reflects the PRODUCTION solver (power_flow_newton), not a harness."""

    def test_builds_rows_for_all_ieee_cases(self) -> None:
        refs = build_ieee_frozen_solver_benchmark_references()
        networks = {row["network"] for row in refs}
        assert networks == set(IEEE_CROSS_VALIDATION_NETWORK_IDS)
        assert len(refs) == 62  # 9 + 14 + 39

    def test_every_row_marks_production_solver(self) -> None:
        refs = build_ieee_frozen_solver_benchmark_references()
        assert all(row["proof_type"] == FROZEN_SOLVER_CROSS_VALIDATION_PROOF_TYPE for row in refs)
        assert all(row["solver"] == "power_flow_newton" for row in refs)
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
        # Measured 2026-09-09 (canonical twin, K2): ~5e-8 %. Bound kept two orders of
        # magnitude looser than the measurement to avoid platform-noise flakiness.
        assert worst < 1e-5  # production NR (canonical twin) converges to the pandapower solution

    def test_missing_references_still_reports_incomplete(self) -> None:
        """The 'dane niekompletne' path must remain intact (no silent PASS)."""
        result = _run_benchmark([])
        assert result["references_provided"] is False
        assert result["status"] == "dane niekompletne"
