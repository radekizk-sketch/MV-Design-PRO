"""
Study Case Engine Tests — Determinism, Versioning, Delta Overlay

TESTS:
1. test_create_case — Case creation with correct defaults and bindings
2. test_execute_case_determinism — Same input produces same determinism_hash
3. test_clone_case_none_status — Clone has NONE status, no results, new ID
4. test_compare_runs_identical — Identical runs produce IDENTICAL verdict
5. test_compare_runs_different — Different runs produce correct delta values
6. test_case_immutability — Frozen dataclass prevents mutation
7. test_study_case_delta_overlay — Visual delta between two runs
8. test_model_change_invalidates_case — Status transitions to OUTDATED

BINDING: All tests are unit tests, no DB, no network I/O.
"""

from __future__ import annotations

from dataclasses import FrozenInstanceError
from datetime import UTC, datetime
from typing import Any

import pytest
from domain.study_case_engine import (
    ComparisonResult,
    ComparisonVerdict,
    DeltaValue,
    OperatingMode,
    ResultStatus,
    ScenarioType,
    StudyCase,
    StudyCaseConfig,
    StudyCaseEngine,
    StudyCaseRunResult,
    compute_determinism_hash,
)

# =============================================================================
# Stub Solver (deterministic, for testing)
# =============================================================================


class StubSolver:
    """
    Deterministic stub solver for testing.

    Returns pre-defined results based on the scenario_type.
    Same input always produces identical output.
    """

    def __init__(
        self,
        results: dict[str, Any] | None = None,
        trace: list[dict[str, Any]] | None = None,
    ) -> None:
        self._results = results or {
            "ik3_ka": 12.5,
            "ip_ka": 30.2,
            "sk_mva": 250.0,
            "zth": {"r_ohm": 0.5, "x_ohm": 1.2},
        }
        self._trace = trace or [
            {
                "key": "zth_calc",
                "title": "Thevenin impedance",
                "formula_latex": "Z_{th} = R + jX",
                "inputs": {"r": 0.5, "x": 1.2},
                "substitution": "Z_{th} = 0.5 + j1.2",
                "result": {"z_ohm": 1.3},
            },
        ]

    def execute(
        self,
        snapshot_ref: str,
        scenario_type: ScenarioType,
        mode: OperatingMode,
        config: StudyCaseConfig,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """Return deterministic results."""
        return dict(self._results), list(self._trace)


class VariableSolver:
    """
    Solver that returns different results based on snapshot_ref.

    Used for testing comparison and delta overlay.
    """

    def __init__(self, result_map: dict[str, dict[str, Any]]) -> None:
        self._result_map = result_map

    def execute(
        self,
        snapshot_ref: str,
        scenario_type: ScenarioType,
        mode: OperatingMode,
        config: StudyCaseConfig,
    ) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        """Return results based on snapshot_ref."""
        results = dict(self._result_map.get(snapshot_ref, {}))
        trace = [{"key": "stub", "title": "stub", "snapshot_ref": snapshot_ref}]
        return results, trace


# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture()
def stub_solver() -> StubSolver:
    """Create a deterministic stub solver."""
    return StubSolver()


@pytest.fixture()
def engine(stub_solver: StubSolver) -> StudyCaseEngine:
    """Create engine with stub solver."""
    return StudyCaseEngine(solver=stub_solver)


@pytest.fixture()
def sample_case(engine: StudyCaseEngine) -> StudyCase:
    """Create a sample study case."""
    return engine.create_case(
        snapshot_ref="abc123def456",
        scenario_type=ScenarioType.SC_3F,
        config=StudyCaseConfig(c_factor_max=1.10, base_mva=100.0),
        mode=OperatingMode.NORMAL,
        catalog_version_lock="1.0.0",
    )


# =============================================================================
# 1. test_create_case
# =============================================================================


class TestCreateCase:
    """Test case creation with correct defaults and bindings."""

    def test_create_case_basic_fields(self, engine: StudyCaseEngine) -> None:
        """Created case must have correct snapshot_ref and scenario_type."""
        case = engine.create_case(
            snapshot_ref="snap_abc",
            scenario_type=ScenarioType.SC_3F,
        )

        assert case.snapshot_ref == "snap_abc"
        assert case.scenario_type == ScenarioType.SC_3F
        assert case.mode == OperatingMode.NORMAL
        assert case.status == ResultStatus.NONE
        assert case.study_case_id is not None
        assert len(case.study_case_id) > 0

    def test_create_case_default_config(self, engine: StudyCaseEngine) -> None:
        """Default config must have standard IEC values.

        NOTE: This test uses StudyCaseConfig from domain.study_case_engine,
        not domain.study_case. The two classes are parallel (technical debt
        flagged in REJESTR_DLUGU). The newer P0.9 fields (operator_profile_id,
        sc_input_mode, sc_simplified_*) live only on domain.study_case for now.
        TODO: consolidate the two classes in a follow-up cleanup.
        """
        case = engine.create_case(
            snapshot_ref="snap_1",
            scenario_type=ScenarioType.LOAD_FLOW,
        )

        assert case.config.c_factor_max == 1.10
        assert case.config.c_factor_min == 0.95
        assert case.config.base_mva == 100.0
        assert case.config.max_iterations == 50
        assert case.config.tolerance == 1e-6

    def test_create_case_custom_config(self, engine: StudyCaseEngine) -> None:
        """Custom config must be applied correctly."""
        custom_config = StudyCaseConfig(
            c_factor_max=1.05,
            base_mva=50.0,
            max_iterations=100,
        )
        case = engine.create_case(
            snapshot_ref="snap_2",
            scenario_type=ScenarioType.SC_1F,
            config=custom_config,
            mode=OperatingMode.N_1,
        )

        assert case.config.c_factor_max == 1.05
        assert case.config.base_mva == 50.0
        assert case.config.max_iterations == 100
        assert case.mode == OperatingMode.N_1

    def test_create_case_catalog_version_lock(self, engine: StudyCaseEngine) -> None:
        """Catalog version lock must be stored."""
        case = engine.create_case(
            snapshot_ref="snap_3",
            scenario_type=ScenarioType.PROTECTION,
            catalog_version_lock="2.1.0",
        )

        assert case.catalog_version_lock == "2.1.0"

    def test_create_case_unique_ids(self, engine: StudyCaseEngine) -> None:
        """Each case must have a unique ID."""
        case_a = engine.create_case("snap", ScenarioType.SC_3F)
        case_b = engine.create_case("snap", ScenarioType.SC_3F)

        assert case_a.study_case_id != case_b.study_case_id

    def test_create_case_all_scenario_types(self, engine: StudyCaseEngine) -> None:
        """All ScenarioType values must be accepted."""
        for st in ScenarioType:
            case = engine.create_case(
                snapshot_ref="snap",
                scenario_type=st,
            )
            assert case.scenario_type == st

    def test_create_case_all_operating_modes(self, engine: StudyCaseEngine) -> None:
        """All OperatingMode values must be accepted."""
        for om in OperatingMode:
            case = engine.create_case(
                snapshot_ref="snap",
                scenario_type=ScenarioType.LOAD_FLOW,
                mode=om,
            )
            assert case.mode == om

    def test_create_case_has_created_at_timestamp(self, engine: StudyCaseEngine) -> None:
        """Created case must have a created_at timestamp."""
        before = datetime.now(UTC)
        case = engine.create_case("snap", ScenarioType.SC_3F)
        after = datetime.now(UTC)

        assert before <= case.created_at <= after

    def test_create_case_to_dict_roundtrip(self, engine: StudyCaseEngine) -> None:
        """to_dict must produce complete serialization."""
        case = engine.create_case(
            snapshot_ref="snap_rt",
            scenario_type=ScenarioType.SC_2F,
            mode=OperatingMode.MAINTENANCE,
            catalog_version_lock="3.0.0",
        )

        data = case.to_dict()
        assert data["snapshot_ref"] == "snap_rt"
        assert data["scenario_type"] == "SC_2F"
        assert data["mode"] == "MAINTENANCE"
        assert data["status"] == "NONE"
        assert data["catalog_version_lock"] == "3.0.0"
        assert "config" in data
        assert "created_at" in data


# =============================================================================
# 2. test_execute_case_determinism
# =============================================================================


class TestExecuteCaseDeterminism:
    """Same input must produce same determinism_hash."""

    def test_execute_returns_run_result(
        self, engine: StudyCaseEngine, sample_case: StudyCase
    ) -> None:
        """Execution must return a StudyCaseRunResult."""
        result = engine.execute_case(sample_case)

        assert isinstance(result, StudyCaseRunResult)
        assert result.case_id == sample_case.study_case_id
        assert result.snapshot_hash == sample_case.snapshot_ref
        assert result.run_id is not None
        assert result.determinism_hash is not None
        assert len(result.determinism_hash) == 64  # SHA-256 hex

    def test_determinism_same_input_same_hash(
        self, engine: StudyCaseEngine, sample_case: StudyCase
    ) -> None:
        """Same input must produce identical determinism_hash."""
        result_a = engine.execute_case(sample_case)
        result_b = engine.execute_case(sample_case)

        assert result_a.determinism_hash == result_b.determinism_hash

    def test_determinism_100x_stability(
        self, engine: StudyCaseEngine, sample_case: StudyCase
    ) -> None:
        """100 executions must produce identical hashes."""
        reference = engine.execute_case(sample_case)

        for _ in range(100):
            result = engine.execute_case(sample_case)
            assert result.determinism_hash == reference.determinism_hash

    def test_determinism_hash_changes_with_different_results(self) -> None:
        """Different solver outputs must produce different hashes."""
        solver_a = StubSolver(results={"ik3_ka": 12.5})
        solver_b = StubSolver(results={"ik3_ka": 15.0})

        engine_a = StudyCaseEngine(solver=solver_a)
        engine_b = StudyCaseEngine(solver=solver_b)

        case = engine_a.create_case("snap", ScenarioType.SC_3F)

        result_a = engine_a.execute_case(case)
        result_b = engine_b.execute_case(case)

        assert result_a.determinism_hash != result_b.determinism_hash

    def test_execute_stores_white_box_trace(
        self, engine: StudyCaseEngine, sample_case: StudyCase
    ) -> None:
        """Execution must include white_box_trace."""
        result = engine.execute_case(sample_case)

        assert len(result.white_box_trace) > 0
        assert isinstance(result.white_box_trace, tuple)
        assert result.white_box_trace[0]["key"] == "zth_calc"

    def test_execute_unique_run_ids(self, engine: StudyCaseEngine, sample_case: StudyCase) -> None:
        """Each execution must produce a unique run_id."""
        result_a = engine.execute_case(sample_case)
        result_b = engine.execute_case(sample_case)

        assert result_a.run_id != result_b.run_id

    def test_execute_has_timestamp(self, engine: StudyCaseEngine, sample_case: StudyCase) -> None:
        """Execution result must have executed_at timestamp."""
        before = datetime.now(UTC)
        result = engine.execute_case(sample_case)
        after = datetime.now(UTC)

        assert before <= result.executed_at <= after

    def test_compute_determinism_hash_canonical(self) -> None:
        """compute_determinism_hash must produce consistent output."""
        data = {"z": 1, "a": 2, "m": {"x": 3.0, "y": 4.0}}

        hash_1 = compute_determinism_hash(data)
        hash_2 = compute_determinism_hash(data)

        assert hash_1 == hash_2
        assert len(hash_1) == 64

    def test_compute_determinism_hash_order_independent(self) -> None:
        """Hash must not depend on dict key order."""
        data_a = {"x": 1.0, "a": 2.0, "z": 3.0}
        data_b = {"z": 3.0, "x": 1.0, "a": 2.0}

        assert compute_determinism_hash(data_a) == compute_determinism_hash(data_b)

    def test_run_result_to_dict(self, engine: StudyCaseEngine, sample_case: StudyCase) -> None:
        """RunResult.to_dict must produce complete serialization."""
        result = engine.execute_case(sample_case)
        data = result.to_dict()

        assert data["run_id"] == result.run_id
        assert data["case_id"] == sample_case.study_case_id
        assert data["snapshot_hash"] == sample_case.snapshot_ref
        assert data["determinism_hash"] == result.determinism_hash
        assert isinstance(data["white_box_trace"], list)
        assert "executed_at" in data


# =============================================================================
# 3. test_clone_case_none_status
# =============================================================================


class TestCloneCaseNoneStatus:
    """Clone must have NONE status, no results, new ID."""

    def test_clone_has_none_status(self, engine: StudyCaseEngine, sample_case: StudyCase) -> None:
        """Cloned case must have NONE status."""
        cloned = engine.clone_case(sample_case)

        assert cloned.status == ResultStatus.NONE

    def test_clone_has_new_id(self, engine: StudyCaseEngine, sample_case: StudyCase) -> None:
        """Cloned case must have a different ID."""
        cloned = engine.clone_case(sample_case)

        assert cloned.study_case_id != sample_case.study_case_id

    def test_clone_copies_snapshot_ref(
        self, engine: StudyCaseEngine, sample_case: StudyCase
    ) -> None:
        """Clone must preserve snapshot_ref binding."""
        cloned = engine.clone_case(sample_case)

        assert cloned.snapshot_ref == sample_case.snapshot_ref

    def test_clone_copies_scenario_type(
        self, engine: StudyCaseEngine, sample_case: StudyCase
    ) -> None:
        """Clone must preserve scenario_type."""
        cloned = engine.clone_case(sample_case)

        assert cloned.scenario_type == sample_case.scenario_type

    def test_clone_copies_mode(self, engine: StudyCaseEngine, sample_case: StudyCase) -> None:
        """Clone must preserve operating mode."""
        cloned = engine.clone_case(sample_case)

        assert cloned.mode == sample_case.mode

    def test_clone_copies_config(self, engine: StudyCaseEngine, sample_case: StudyCase) -> None:
        """Clone must preserve config values."""
        cloned = engine.clone_case(sample_case)

        assert cloned.config.c_factor_max == sample_case.config.c_factor_max
        assert cloned.config.base_mva == sample_case.config.base_mva

    def test_clone_copies_catalog_version_lock(self, engine: StudyCaseEngine) -> None:
        """Clone must preserve catalog_version_lock."""
        case = engine.create_case(
            snapshot_ref="snap",
            scenario_type=ScenarioType.SC_3F,
            catalog_version_lock="2.5.0",
        )
        cloned = engine.clone_case(case)

        assert cloned.catalog_version_lock == "2.5.0"

    def test_clone_has_new_created_at(
        self, engine: StudyCaseEngine, sample_case: StudyCase
    ) -> None:
        """Clone must have a new created_at timestamp."""
        cloned = engine.clone_case(sample_case)

        # Clone should be created at or after the original
        assert cloned.created_at >= sample_case.created_at


# =============================================================================
# 4. test_compare_runs_identical
# =============================================================================


class TestCompareRunsIdentical:
    """Identical runs must produce IDENTICAL verdict."""

    def test_identical_runs_verdict(self, engine: StudyCaseEngine, sample_case: StudyCase) -> None:
        """Two runs with same solver output must be IDENTICAL."""
        run_a = engine.execute_case(sample_case)
        run_b = engine.execute_case(sample_case)

        comparison = StudyCaseEngine.compare_runs(run_a, run_b)

        assert comparison.verdict == ComparisonVerdict.IDENTICAL
        assert comparison.run_a_id == run_a.run_id
        assert comparison.run_b_id == run_b.run_id

    def test_identical_runs_zero_deltas(
        self, engine: StudyCaseEngine, sample_case: StudyCase
    ) -> None:
        """All deltas must be zero for identical runs."""
        run_a = engine.execute_case(sample_case)
        run_b = engine.execute_case(sample_case)

        comparison = StudyCaseEngine.compare_runs(run_a, run_b)

        for delta in comparison.delta_values:
            assert delta.abs_diff == 0.0

    def test_identical_runs_is_pure_function(
        self, engine: StudyCaseEngine, sample_case: StudyCase
    ) -> None:
        """compare_runs must be a pure function (no side effects)."""
        run_a = engine.execute_case(sample_case)
        run_b = engine.execute_case(sample_case)

        # Call multiple times — same result every time
        comp_1 = StudyCaseEngine.compare_runs(run_a, run_b)
        comp_2 = StudyCaseEngine.compare_runs(run_a, run_b)

        assert comp_1.verdict == comp_2.verdict
        assert len(comp_1.delta_values) == len(comp_2.delta_values)
        for dv1, dv2 in zip(comp_1.delta_values, comp_2.delta_values, strict=False):
            assert dv1.metric_name == dv2.metric_name
            assert dv1.abs_diff == dv2.abs_diff

    def test_empty_results_identical(self) -> None:
        """Runs with empty results must be IDENTICAL."""
        now = datetime.now(UTC)
        run_a = StudyCaseRunResult(
            run_id="run-a",
            case_id="case-1",
            snapshot_hash="snap",
            results={},
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash({}),
        )
        run_b = StudyCaseRunResult(
            run_id="run-b",
            case_id="case-1",
            snapshot_hash="snap",
            results={},
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash({}),
        )

        comparison = StudyCaseEngine.compare_runs(run_a, run_b)

        assert comparison.verdict == ComparisonVerdict.IDENTICAL
        assert len(comparison.delta_values) == 0


# =============================================================================
# 5. test_compare_runs_different
# =============================================================================


class TestCompareRunsDifferent:
    """Different runs must produce correct delta values and verdicts."""

    def test_major_difference(self) -> None:
        """Large difference must produce MAJOR_DIFF verdict."""
        now = datetime.now(UTC)
        run_a = StudyCaseRunResult(
            run_id="run-a",
            case_id="case-1",
            snapshot_hash="snap-1",
            results={"ik3_ka": 10.0, "ip_ka": 25.0},
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash({"ik3_ka": 10.0, "ip_ka": 25.0}),
        )
        run_b = StudyCaseRunResult(
            run_id="run-b",
            case_id="case-2",
            snapshot_hash="snap-2",
            results={"ik3_ka": 15.0, "ip_ka": 35.0},
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash({"ik3_ka": 15.0, "ip_ka": 35.0}),
        )

        comparison = StudyCaseEngine.compare_runs(run_a, run_b)

        assert comparison.verdict == ComparisonVerdict.MAJOR_DIFF

        # Check delta values
        ik3_delta = next(dv for dv in comparison.delta_values if dv.metric_name == "ik3_ka")
        assert ik3_delta.value_a == 10.0
        assert ik3_delta.value_b == 15.0
        assert ik3_delta.abs_diff == 5.0
        assert ik3_delta.rel_diff_pct is not None
        assert abs(ik3_delta.rel_diff_pct - 50.0) < 0.01

    def test_minor_difference(self) -> None:
        """Small difference must produce MINOR_DIFF verdict."""
        now = datetime.now(UTC)
        run_a = StudyCaseRunResult(
            run_id="run-a",
            case_id="case-1",
            snapshot_hash="snap",
            results={"ik3_ka": 10.0},
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash({"ik3_ka": 10.0}),
        )
        run_b = StudyCaseRunResult(
            run_id="run-b",
            case_id="case-1",
            snapshot_hash="snap",
            results={"ik3_ka": 10.05},  # 0.5% diff — minor
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash({"ik3_ka": 10.05}),
        )

        comparison = StudyCaseEngine.compare_runs(run_a, run_b)

        assert comparison.verdict == ComparisonVerdict.MINOR_DIFF

    def test_nested_results_comparison(self) -> None:
        """Nested result structures must be flattened and compared."""
        now = datetime.now(UTC)
        run_a = StudyCaseRunResult(
            run_id="run-a",
            case_id="case-1",
            snapshot_hash="snap",
            results={"zth": {"r_ohm": 0.5, "x_ohm": 1.2}},
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash({"zth": {"r_ohm": 0.5, "x_ohm": 1.2}}),
        )
        run_b = StudyCaseRunResult(
            run_id="run-b",
            case_id="case-1",
            snapshot_hash="snap",
            results={"zth": {"r_ohm": 0.6, "x_ohm": 1.2}},
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash({"zth": {"r_ohm": 0.6, "x_ohm": 1.2}}),
        )

        comparison = StudyCaseEngine.compare_runs(run_a, run_b)

        # Find the r_ohm delta
        r_delta = next(dv for dv in comparison.delta_values if dv.metric_name == "zth.r_ohm")
        assert r_delta.abs_diff == pytest.approx(0.1)
        assert r_delta.rel_diff_pct == pytest.approx(20.0)

        # x_ohm should have zero delta
        x_delta = next(dv for dv in comparison.delta_values if dv.metric_name == "zth.x_ohm")
        assert x_delta.abs_diff == 0.0

    def test_missing_metric_in_one_run(self) -> None:
        """Missing metrics in one run must use 0.0 as default."""
        now = datetime.now(UTC)
        run_a = StudyCaseRunResult(
            run_id="run-a",
            case_id="case-1",
            snapshot_hash="snap",
            results={"ik3_ka": 10.0, "ip_ka": 25.0},
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash({"ik3_ka": 10.0, "ip_ka": 25.0}),
        )
        run_b = StudyCaseRunResult(
            run_id="run-b",
            case_id="case-1",
            snapshot_hash="snap",
            results={"ik3_ka": 10.0},  # ip_ka missing
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash({"ik3_ka": 10.0}),
        )

        comparison = StudyCaseEngine.compare_runs(run_a, run_b)

        ip_delta = next(dv for dv in comparison.delta_values if dv.metric_name == "ip_ka")
        assert ip_delta.value_a == 25.0
        assert ip_delta.value_b == 0.0
        assert ip_delta.abs_diff == 25.0

    def test_comparison_to_dict(self) -> None:
        """ComparisonResult.to_dict must serialize correctly."""
        now = datetime.now(UTC)
        run_a = StudyCaseRunResult(
            run_id="run-a",
            case_id="case-1",
            snapshot_hash="snap",
            results={"ik3_ka": 10.0},
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash({"ik3_ka": 10.0}),
        )
        run_b = StudyCaseRunResult(
            run_id="run-b",
            case_id="case-1",
            snapshot_hash="snap",
            results={"ik3_ka": 15.0},
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash({"ik3_ka": 15.0}),
        )

        comparison = StudyCaseEngine.compare_runs(run_a, run_b)
        data = comparison.to_dict()

        assert data["run_a_id"] == "run-a"
        assert data["run_b_id"] == "run-b"
        assert data["verdict"] == "MAJOR_DIFF"
        assert len(data["delta_values"]) == 1
        assert data["delta_values"][0]["metric_name"] == "ik3_ka"


# =============================================================================
# 6. test_case_immutability
# =============================================================================


class TestCaseImmutability:
    """Frozen dataclasses must prevent mutation after creation."""

    def test_study_case_is_frozen(self, engine: StudyCaseEngine, sample_case: StudyCase) -> None:
        """StudyCase must be frozen — cannot modify attributes."""
        with pytest.raises((AttributeError, FrozenInstanceError)):
            sample_case.snapshot_ref = "new_snap"  # type: ignore

    def test_study_case_scenario_type_frozen(
        self, engine: StudyCaseEngine, sample_case: StudyCase
    ) -> None:
        """scenario_type must be immutable."""
        with pytest.raises((AttributeError, FrozenInstanceError)):
            sample_case.scenario_type = ScenarioType.LOAD_FLOW  # type: ignore

    def test_study_case_status_frozen(
        self, engine: StudyCaseEngine, sample_case: StudyCase
    ) -> None:
        """status must be immutable."""
        with pytest.raises((AttributeError, FrozenInstanceError)):
            sample_case.status = ResultStatus.FRESH  # type: ignore

    def test_study_case_config_frozen(self) -> None:
        """StudyCaseConfig must be frozen."""
        config = StudyCaseConfig()
        with pytest.raises((AttributeError, FrozenInstanceError)):
            config.c_factor_max = 2.0  # type: ignore

    def test_run_result_is_frozen(self, engine: StudyCaseEngine, sample_case: StudyCase) -> None:
        """StudyCaseRunResult must be frozen."""
        result = engine.execute_case(sample_case)

        with pytest.raises((AttributeError, FrozenInstanceError)):
            result.results = {}  # type: ignore

    def test_run_result_determinism_hash_frozen(
        self, engine: StudyCaseEngine, sample_case: StudyCase
    ) -> None:
        """determinism_hash must be immutable."""
        result = engine.execute_case(sample_case)

        with pytest.raises((AttributeError, FrozenInstanceError)):
            result.determinism_hash = "tampered"  # type: ignore

    def test_comparison_result_is_frozen(self) -> None:
        """ComparisonResult must be frozen."""
        comp = ComparisonResult(
            run_a_id="a",
            run_b_id="b",
            delta_values=(),
            verdict=ComparisonVerdict.IDENTICAL,
        )

        with pytest.raises((AttributeError, FrozenInstanceError)):
            comp.verdict = ComparisonVerdict.MAJOR_DIFF  # type: ignore

    def test_delta_value_is_frozen(self) -> None:
        """DeltaValue must be frozen."""
        dv = DeltaValue(
            metric_name="ik3_ka",
            value_a=10.0,
            value_b=15.0,
            abs_diff=5.0,
            rel_diff_pct=50.0,
        )

        with pytest.raises((AttributeError, FrozenInstanceError)):
            dv.value_a = 999.0  # type: ignore

    def test_white_box_trace_is_tuple(
        self, engine: StudyCaseEngine, sample_case: StudyCase
    ) -> None:
        """white_box_trace must be a tuple (immutable sequence)."""
        result = engine.execute_case(sample_case)

        assert isinstance(result.white_box_trace, tuple)

    def test_delta_values_is_tuple(self) -> None:
        """ComparisonResult.delta_values must be a tuple."""
        comp = ComparisonResult(
            run_a_id="a",
            run_b_id="b",
            delta_values=(),
            verdict=ComparisonVerdict.IDENTICAL,
        )

        assert isinstance(comp.delta_values, tuple)


# =============================================================================
# 7. test_study_case_delta_overlay
# =============================================================================


class TestStudyCaseDeltaOverlay:
    """Visual delta between two runs (overlay comparison)."""

    def test_delta_overlay_all_metrics(self) -> None:
        """Delta overlay must cover all metrics from both runs."""
        solver_a = StubSolver(
            results={
                "ik3_ka": 12.5,
                "ip_ka": 30.2,
                "sk_mva": 250.0,
            }
        )
        solver_b = StubSolver(
            results={
                "ik3_ka": 13.0,
                "ip_ka": 31.0,
                "sk_mva": 260.0,
            }
        )

        engine_a = StudyCaseEngine(solver=solver_a)
        engine_b = StudyCaseEngine(solver=solver_b)

        case = engine_a.create_case("snap", ScenarioType.SC_3F)

        run_a = engine_a.execute_case(case)
        run_b = engine_b.execute_case(case)

        comparison = StudyCaseEngine.compare_runs(run_a, run_b)

        # All 3 metrics must have deltas
        metric_names = {dv.metric_name for dv in comparison.delta_values}
        assert metric_names == {"ik3_ka", "ip_ka", "sk_mva"}

    def test_delta_overlay_sorted_metrics(self) -> None:
        """Metrics in delta overlay must be deterministically sorted."""
        now = datetime.now(UTC)
        results_a = {"z_val": 1.0, "a_val": 2.0, "m_val": 3.0}
        results_b = {"z_val": 1.1, "a_val": 2.1, "m_val": 3.1}

        run_a = StudyCaseRunResult(
            run_id="a",
            case_id="c",
            snapshot_hash="s",
            results=results_a,
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash(results_a),
        )
        run_b = StudyCaseRunResult(
            run_id="b",
            case_id="c",
            snapshot_hash="s",
            results=results_b,
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash(results_b),
        )

        comparison = StudyCaseEngine.compare_runs(run_a, run_b)

        names = [dv.metric_name for dv in comparison.delta_values]
        assert names == sorted(names)

    def test_delta_overlay_relative_percentages(self) -> None:
        """Relative differences must be calculated correctly."""
        now = datetime.now(UTC)
        run_a = StudyCaseRunResult(
            run_id="a",
            case_id="c",
            snapshot_hash="s",
            results={"ik3_ka": 100.0},
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash({"ik3_ka": 100.0}),
        )
        run_b = StudyCaseRunResult(
            run_id="b",
            case_id="c",
            snapshot_hash="s",
            results={"ik3_ka": 105.0},
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash({"ik3_ka": 105.0}),
        )

        comparison = StudyCaseEngine.compare_runs(run_a, run_b)

        dv = comparison.delta_values[0]
        assert dv.abs_diff == pytest.approx(5.0)
        assert dv.rel_diff_pct == pytest.approx(5.0)

    def test_delta_overlay_zero_value_a(self) -> None:
        """When value_a is zero, rel_diff_pct must be None."""
        now = datetime.now(UTC)
        run_a = StudyCaseRunResult(
            run_id="a",
            case_id="c",
            snapshot_hash="s",
            results={"ik3_ka": 0.0},
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash({"ik3_ka": 0.0}),
        )
        run_b = StudyCaseRunResult(
            run_id="b",
            case_id="c",
            snapshot_hash="s",
            results={"ik3_ka": 5.0},
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash({"ik3_ka": 5.0}),
        )

        comparison = StudyCaseEngine.compare_runs(run_a, run_b)

        dv = comparison.delta_values[0]
        assert dv.rel_diff_pct is None
        assert dv.abs_diff == 5.0

    def test_delta_overlay_nested_structures(self) -> None:
        """Nested result dicts must be flattened with dotted keys."""
        now = datetime.now(UTC)
        results = {
            "bus_1": {"u_kv": 20.0, "u_pu": 1.0},
            "bus_2": {"u_kv": 19.5, "u_pu": 0.975},
        }
        run_a = StudyCaseRunResult(
            run_id="a",
            case_id="c",
            snapshot_hash="s",
            results=results,
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash(results),
        )
        run_b = StudyCaseRunResult(
            run_id="b",
            case_id="c",
            snapshot_hash="s",
            results=results,
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash(results),
        )

        comparison = StudyCaseEngine.compare_runs(run_a, run_b)

        metric_names = {dv.metric_name for dv in comparison.delta_values}
        assert "bus_1.u_kv" in metric_names
        assert "bus_1.u_pu" in metric_names
        assert "bus_2.u_kv" in metric_names
        assert "bus_2.u_pu" in metric_names

    def test_delta_overlay_deterministic_100x(self) -> None:
        """Delta overlay must produce identical output 100 times."""
        now = datetime.now(UTC)
        run_a = StudyCaseRunResult(
            run_id="a",
            case_id="c",
            snapshot_hash="s",
            results={"ik3_ka": 10.0, "ip_ka": 25.0, "sk_mva": 200.0},
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash(
                {"ik3_ka": 10.0, "ip_ka": 25.0, "sk_mva": 200.0}
            ),
        )
        run_b = StudyCaseRunResult(
            run_id="b",
            case_id="c",
            snapshot_hash="s",
            results={"ik3_ka": 12.0, "ip_ka": 28.0, "sk_mva": 230.0},
            white_box_trace=(),
            executed_at=now,
            determinism_hash=compute_determinism_hash(
                {"ik3_ka": 12.0, "ip_ka": 28.0, "sk_mva": 230.0}
            ),
        )

        reference = StudyCaseEngine.compare_runs(run_a, run_b)

        for _ in range(100):
            comparison = StudyCaseEngine.compare_runs(run_a, run_b)
            assert comparison.verdict == reference.verdict
            assert len(comparison.delta_values) == len(reference.delta_values)
            for dv_ref, dv in zip(reference.delta_values, comparison.delta_values, strict=False):
                assert dv.metric_name == dv_ref.metric_name
                assert dv.abs_diff == dv_ref.abs_diff


# =============================================================================
# 8. test_model_change_invalidates_case
# =============================================================================


class TestModelChangeInvalidatesCase:
    """Model changes must transition FRESH cases to OUTDATED."""

    def test_fresh_case_becomes_outdated(self, engine: StudyCaseEngine) -> None:
        """FRESH case must become OUTDATED when invalidated."""
        # Create a case and manually set it to FRESH
        case = engine.create_case("snap", ScenarioType.SC_3F)
        fresh_case = StudyCase(
            study_case_id=case.study_case_id,
            snapshot_ref=case.snapshot_ref,
            scenario_type=case.scenario_type,
            mode=case.mode,
            catalog_version_lock=case.catalog_version_lock,
            config=case.config,
            status=ResultStatus.FRESH,
            created_at=case.created_at,
        )

        invalidated = StudyCaseEngine.invalidate_case(fresh_case)

        assert invalidated.status == ResultStatus.OUTDATED
        # Other fields unchanged
        assert invalidated.study_case_id == fresh_case.study_case_id
        assert invalidated.snapshot_ref == fresh_case.snapshot_ref
        assert invalidated.scenario_type == fresh_case.scenario_type

    def test_none_case_stays_none(self, engine: StudyCaseEngine) -> None:
        """NONE case must stay NONE when invalidated (no results to invalidate)."""
        case = engine.create_case("snap", ScenarioType.SC_3F)
        assert case.status == ResultStatus.NONE

        invalidated = StudyCaseEngine.invalidate_case(case)

        assert invalidated.status == ResultStatus.NONE
        # Must be the exact same object (identity)
        assert invalidated is case

    def test_outdated_case_stays_outdated(self, engine: StudyCaseEngine) -> None:
        """OUTDATED case must stay OUTDATED when invalidated."""
        case = engine.create_case("snap", ScenarioType.SC_3F)
        outdated = StudyCase(
            study_case_id=case.study_case_id,
            snapshot_ref=case.snapshot_ref,
            scenario_type=case.scenario_type,
            mode=case.mode,
            catalog_version_lock=case.catalog_version_lock,
            config=case.config,
            status=ResultStatus.OUTDATED,
            created_at=case.created_at,
        )

        result = StudyCaseEngine.invalidate_case(outdated)

        assert result.status == ResultStatus.OUTDATED

    def test_invalidation_preserves_all_fields(self, engine: StudyCaseEngine) -> None:
        """Invalidation must preserve snapshot_ref, scenario_type, config, mode."""
        custom_config = StudyCaseConfig(c_factor_max=1.05, base_mva=50.0)
        case = engine.create_case(
            snapshot_ref="snap_preserve",
            scenario_type=ScenarioType.PROTECTION,
            config=custom_config,
            mode=OperatingMode.MAINTENANCE,
            catalog_version_lock="3.0.0",
        )
        fresh_case = StudyCase(
            study_case_id=case.study_case_id,
            snapshot_ref=case.snapshot_ref,
            scenario_type=case.scenario_type,
            mode=case.mode,
            catalog_version_lock=case.catalog_version_lock,
            config=case.config,
            status=ResultStatus.FRESH,
            created_at=case.created_at,
        )

        invalidated = StudyCaseEngine.invalidate_case(fresh_case)

        assert invalidated.snapshot_ref == "snap_preserve"
        assert invalidated.scenario_type == ScenarioType.PROTECTION
        assert invalidated.mode == OperatingMode.MAINTENANCE
        assert invalidated.catalog_version_lock == "3.0.0"
        assert invalidated.config.c_factor_max == 1.05
        assert invalidated.config.base_mva == 50.0

    def test_invalidation_is_idempotent(self, engine: StudyCaseEngine) -> None:
        """Multiple invalidations must produce same result."""
        case = engine.create_case("snap", ScenarioType.SC_3F)
        fresh_case = StudyCase(
            study_case_id=case.study_case_id,
            snapshot_ref=case.snapshot_ref,
            scenario_type=case.scenario_type,
            mode=case.mode,
            catalog_version_lock=case.catalog_version_lock,
            config=case.config,
            status=ResultStatus.FRESH,
            created_at=case.created_at,
        )

        invalidated_1 = StudyCaseEngine.invalidate_case(fresh_case)
        invalidated_2 = StudyCaseEngine.invalidate_case(invalidated_1)

        assert invalidated_1.status == ResultStatus.OUTDATED
        assert invalidated_2.status == ResultStatus.OUTDATED

    def test_model_change_simulation_full_lifecycle(self) -> None:
        """
        Full lifecycle: create → execute → model change → invalidate → re-execute.

        Simulates the complete model change invalidation flow:
        1. Create case (NONE)
        2. Execute case (results produced)
        3. Model changes (snapshot changes)
        4. Invalidate case (OUTDATED)
        5. Create new case with new snapshot
        6. Execute new case (new results)
        """
        solver = StubSolver(results={"ik3_ka": 12.5})
        engine = StudyCaseEngine(solver=solver)

        # Step 1: Create case
        case = engine.create_case(
            snapshot_ref="snap_v1",
            scenario_type=ScenarioType.SC_3F,
        )
        assert case.status == ResultStatus.NONE

        # Step 2: Execute
        run_v1 = engine.execute_case(case)
        assert run_v1.snapshot_hash == "snap_v1"

        # Step 3-4: Model changes → invalidate
        fresh_case = StudyCase(
            study_case_id=case.study_case_id,
            snapshot_ref=case.snapshot_ref,
            scenario_type=case.scenario_type,
            mode=case.mode,
            catalog_version_lock=case.catalog_version_lock,
            config=case.config,
            status=ResultStatus.FRESH,
            created_at=case.created_at,
        )
        invalidated = StudyCaseEngine.invalidate_case(fresh_case)
        assert invalidated.status == ResultStatus.OUTDATED

        # Step 5: New case with new snapshot
        new_case = engine.create_case(
            snapshot_ref="snap_v2",
            scenario_type=ScenarioType.SC_3F,
        )
        assert new_case.snapshot_ref == "snap_v2"

        # Step 6: Execute new case
        run_v2 = engine.execute_case(new_case)
        assert run_v2.snapshot_hash == "snap_v2"

        # Verify determinism: same solver → same hash
        assert run_v1.determinism_hash == run_v2.determinism_hash


# =============================================================================
# Enum completeness tests
# =============================================================================


class TestEnumValues:
    """Verify enum values are complete and correct."""

    def test_scenario_type_values(self) -> None:
        """ScenarioType must have all expected values."""
        expected = {"SC_3F", "SC_1F", "SC_2F", "LOAD_FLOW", "PROTECTION"}
        actual = {st.value for st in ScenarioType}
        assert actual == expected

    def test_operating_mode_values(self) -> None:
        """OperatingMode must have all expected values."""
        expected = {"NORMAL", "N_1", "MAINTENANCE"}
        actual = {om.value for om in OperatingMode}
        assert actual == expected

    def test_result_status_values(self) -> None:
        """ResultStatus must have all expected values."""
        expected = {"NONE", "FRESH", "OUTDATED"}
        actual = {rs.value for rs in ResultStatus}
        assert actual == expected

    def test_comparison_verdict_values(self) -> None:
        """ComparisonVerdict must have all expected values."""
        expected = {"IDENTICAL", "MINOR_DIFF", "MAJOR_DIFF"}
        actual = {cv.value for cv in ComparisonVerdict}
        assert actual == expected
