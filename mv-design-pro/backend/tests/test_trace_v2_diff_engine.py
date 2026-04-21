"""
Tests for TraceDiffEngine — PR-37.

Tests:
- Symmetry: diff(A,B) mirrors diff(B,A) with ADDED↔REMOVED
- Deterministic ordering
- Stable JSON diff
- Identical artifacts → all UNCHANGED
"""

from __future__ import annotations

from domain.trace_v2.artifact import (
    AnalysisTypeV2,
    TraceArtifactV2,
    TraceEquationStep,
    TraceValue,
    build_trace_artifact_v2,
)
from domain.trace_v2.diff_engine import TraceDiffEngine


def _tv(name: str, value: float, unit: str = "A") -> TraceValue:
    return TraceValue(name=name, value=value, unit=unit, label_pl=name)


def _step(step_id: str, result_value: float = 100.0, substituted: str = "x=1") -> TraceEquationStep:
    return TraceEquationStep(
        step_id=step_id,
        subject_id="node_1",
        eq_id="SC_IKSS",
        label_pl="Test",
        symbolic_latex="I=U/Z",
        substituted_latex=substituted,
        inputs_used=("u",),
        intermediate_values={},
        result=_tv("result", result_value),
        origin="solver",
    )


def _artifact(
    trace_id: str = "A",
    steps: list[TraceEquationStep] | None = None,
    inputs: dict[str, TraceValue] | None = None,
    outputs: dict[str, TraceValue] | None = None,
) -> TraceArtifactV2:
    return build_trace_artifact_v2(
        trace_id=trace_id,
        analysis_type=AnalysisTypeV2.SC,
        math_spec_version="1.0.0",
        snapshot_hash="snap",
        run_hash="hash",
        inputs=inputs or {"un_v": _tv("un_v", 20000.0, "V")},
        equation_steps=steps or [_step("S001")],
        outputs=outputs or {"ikss_a": _tv("ikss_a", 3500.0)},
    )


class TestDiffSymmetry:
    def test_added_removed_mirror(self) -> None:
        a = _artifact("A", steps=[_step("S001")])
        b = _artifact("B", steps=[_step("S001"), _step("S002")])

        diff_ab = TraceDiffEngine.diff(a, b)
        diff_ba = TraceDiffEngine.diff(b, a)

        # S002 is ADDED in diff(A,B) and REMOVED in diff(B,A)
        ab_s002 = [s for s in diff_ab.step_diffs if s.step_id == "S002"]
        ba_s002 = [s for s in diff_ba.step_diffs if s.step_id == "S002"]
        assert len(ab_s002) == 1
        assert len(ba_s002) == 1
        assert ab_s002[0].status == "ADDED"
        assert ba_s002[0].status == "REMOVED"


class TestDiffDeterministicOrdering:
    def test_step_diffs_sorted_by_step_id(self) -> None:
        a = _artifact("A", steps=[_step("S003"), _step("S001"), _step("S002")])
        b = _artifact("B", steps=[_step("S001"), _step("S003")])

        diff = TraceDiffEngine.diff(a, b)
        ids = [s.step_id for s in diff.step_diffs]
        assert ids == sorted(ids)


class TestDiffIdentical:
    def test_identical_all_unchanged(self) -> None:
        a = _artifact("A")
        b = _artifact("B")

        diff = TraceDiffEngine.diff(a, b)
        assert diff.summary.unchanged_count == 1
        assert diff.summary.changed_count == 0
        assert diff.summary.added_count == 0
        assert diff.summary.removed_count == 0


class TestDiffChanged:
    def test_changed_substituted_latex(self) -> None:
        a = _artifact("A", steps=[_step("S001", substituted="x=1")])
        b = _artifact("B", steps=[_step("S001", substituted="x=2")])

        diff = TraceDiffEngine.diff(a, b)
        assert diff.summary.changed_count == 1
        s001 = diff.step_diffs[0]
        assert s001.status == "CHANGED"
        sub_diffs = [d for d in s001.field_diffs if d.key == "substituted_latex"]
        assert len(sub_diffs) == 1
        assert sub_diffs[0].value_a == "x=1"
        assert sub_diffs[0].value_b == "x=2"


class TestDiffStableJson:
    def test_to_dict_stable(self) -> None:
        a = _artifact("A")
        b = _artifact("B", steps=[_step("S001"), _step("S002")])

        diff1 = TraceDiffEngine.diff(a, b)
        diff2 = TraceDiffEngine.diff(a, b)

        import json

        j1 = json.dumps(diff1.to_dict(), sort_keys=True)
        j2 = json.dumps(diff2.to_dict(), sort_keys=True)
        assert j1 == j2
