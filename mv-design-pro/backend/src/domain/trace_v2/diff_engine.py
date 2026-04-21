"""
TraceDiffEngine — pure, deterministic diff for TraceArtifactV2 (PR-37).

INVARIANTS:
- No heuristics, no epsilons, no tolerance thresholds
- Deterministic ordering (sorted by key/step_id)
- Symmetry: diff(A,B) mirrors diff(B,A) with ADDED↔REMOVED
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from domain.trace_v2.artifact import TraceArtifactV2, TraceEquationStep, TraceValue

# ---------------------------------------------------------------------------
# Diff structures
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TraceDiffEntry:
    """Difference in a single key-value pair."""

    key: str
    value_a: str | None
    value_b: str | None
    status: str  # UNCHANGED | CHANGED | ADDED | REMOVED

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "value_a": self.value_a,
            "value_b": self.value_b,
            "status": self.status,
        }


@dataclass(frozen=True)
class TraceStepDiff:
    """Difference in a single equation step."""

    step_id: str
    status: str  # UNCHANGED | CHANGED | ADDED | REMOVED
    field_diffs: tuple[TraceDiffEntry, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "step_id": self.step_id,
            "status": self.status,
            "field_diffs": [d.to_dict() for d in self.field_diffs],
        }


@dataclass(frozen=True)
class TraceDiffSummary:
    """Summary of differences."""

    total_steps: int
    unchanged_count: int
    changed_count: int
    added_count: int
    removed_count: int

    def to_dict(self) -> dict[str, int]:
        return {
            "total_steps": self.total_steps,
            "unchanged_count": self.unchanged_count,
            "changed_count": self.changed_count,
            "added_count": self.added_count,
            "removed_count": self.removed_count,
        }


@dataclass(frozen=True)
class TraceDiffResult:
    """Complete diff result between two TraceArtifactV2."""

    trace_a_id: str
    trace_b_id: str
    input_diffs: tuple[TraceDiffEntry, ...]
    step_diffs: tuple[TraceStepDiff, ...]
    output_diffs: tuple[TraceDiffEntry, ...]
    summary: TraceDiffSummary

    def to_dict(self) -> dict[str, Any]:
        return {
            "trace_a_id": self.trace_a_id,
            "trace_b_id": self.trace_b_id,
            "input_diffs": [d.to_dict() for d in self.input_diffs],
            "step_diffs": [d.to_dict() for d in self.step_diffs],
            "output_diffs": [d.to_dict() for d in self.output_diffs],
            "summary": self.summary.to_dict(),
        }


# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------


class TraceDiffEngine:
    """Pure, deterministic diff engine for TraceArtifactV2.

    No heuristics, no epsilons, no importance ranking.
    """

    @staticmethod
    def diff(a: TraceArtifactV2, b: TraceArtifactV2) -> TraceDiffResult:
        """Compare two trace artifacts.

        Args:
            a: First trace artifact (reference)
            b: Second trace artifact (comparison)

        Returns:
            TraceDiffResult with all differences
        """
        input_diffs = _diff_trace_values(a.inputs, b.inputs)
        output_diffs = _diff_trace_values(a.outputs, b.outputs)
        step_diffs = _diff_steps(a.equation_steps, b.equation_steps)

        unchanged = sum(1 for s in step_diffs if s.status == "UNCHANGED")
        changed = sum(1 for s in step_diffs if s.status == "CHANGED")
        added = sum(1 for s in step_diffs if s.status == "ADDED")
        removed = sum(1 for s in step_diffs if s.status == "REMOVED")

        summary = TraceDiffSummary(
            total_steps=len(step_diffs),
            unchanged_count=unchanged,
            changed_count=changed,
            added_count=added,
            removed_count=removed,
        )

        return TraceDiffResult(
            trace_a_id=a.trace_id,
            trace_b_id=b.trace_id,
            input_diffs=tuple(input_diffs),
            step_diffs=tuple(step_diffs),
            output_diffs=tuple(output_diffs),
            summary=summary,
        )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _value_to_str(tv: TraceValue) -> str:
    """Convert TraceValue to string for comparison."""
    v = tv.value
    if isinstance(v, float):
        return f"{v}"
    return str(v)


def _diff_trace_values(
    a: dict[str, TraceValue],
    b: dict[str, TraceValue],
) -> list[TraceDiffEntry]:
    """Diff two sorted TraceValue dicts."""
    all_keys = sorted(set(a.keys()) | set(b.keys()))
    result: list[TraceDiffEntry] = []

    for key in all_keys:
        va = a.get(key)
        vb = b.get(key)

        if va is not None and vb is not None:
            sa = _value_to_str(va)
            sb = _value_to_str(vb)
            status = "UNCHANGED" if sa == sb else "CHANGED"
            result.append(TraceDiffEntry(key=key, value_a=sa, value_b=sb, status=status))
        elif va is not None:
            result.append(
                TraceDiffEntry(key=key, value_a=_value_to_str(va), value_b=None, status="REMOVED")
            )
        else:
            assert vb is not None
            result.append(
                TraceDiffEntry(key=key, value_a=None, value_b=_value_to_str(vb), status="ADDED")
            )

    return result


def _diff_steps(
    a_steps: tuple[TraceEquationStep, ...],
    b_steps: tuple[TraceEquationStep, ...],
) -> list[TraceStepDiff]:
    """Diff equation steps by step_id."""
    a_map = {s.step_id: s for s in a_steps}
    b_map = {s.step_id: s for s in b_steps}
    all_ids = sorted(set(a_map.keys()) | set(b_map.keys()))

    result: list[TraceStepDiff] = []
    for step_id in all_ids:
        sa = a_map.get(step_id)
        sb = b_map.get(step_id)

        if sa is not None and sb is not None:
            field_diffs = _diff_step_fields(sa, sb)
            has_changes = any(d.status != "UNCHANGED" for d in field_diffs)
            status = "CHANGED" if has_changes else "UNCHANGED"
            result.append(
                TraceStepDiff(step_id=step_id, status=status, field_diffs=tuple(field_diffs))
            )
        elif sa is not None:
            result.append(TraceStepDiff(step_id=step_id, status="REMOVED", field_diffs=()))
        else:
            result.append(TraceStepDiff(step_id=step_id, status="ADDED", field_diffs=()))

    return result


def _diff_step_fields(a: TraceEquationStep, b: TraceEquationStep) -> list[TraceDiffEntry]:
    """Diff individual fields of two steps."""
    fields_to_compare = [
        ("eq_id", a.eq_id, b.eq_id),
        ("subject_id", a.subject_id, b.subject_id),
        ("label_pl", a.label_pl, b.label_pl),
        ("symbolic_latex", a.symbolic_latex, b.symbolic_latex),
        ("substituted_latex", a.substituted_latex, b.substituted_latex),
        ("origin", a.origin, b.origin),
        ("result_value", str(a.result.value), str(b.result.value)),
        ("result_unit", a.result.unit, b.result.unit),
    ]

    result: list[TraceDiffEntry] = []
    for field_name, va, vb in fields_to_compare:
        status = "UNCHANGED" if va == vb else "CHANGED"
        result.append(TraceDiffEntry(key=field_name, value_a=va, value_b=vb, status=status))

    # Diff intermediate values
    iv_diffs = _diff_trace_values(a.intermediate_values, b.intermediate_values)
    for d in iv_diffs:
        result.append(
            TraceDiffEntry(
                key=f"intermediate.{d.key}",
                value_a=d.value_a,
                value_b=d.value_b,
                status=d.status,
            )
        )

    return result
