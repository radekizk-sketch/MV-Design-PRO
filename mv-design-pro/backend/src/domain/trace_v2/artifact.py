"""
TraceArtifactV2 — kanoniczny, immutable artefakt dowodowy (PR-33).

INVARIANTS:
- Frozen dataclass (immutable after creation)
- Deterministic serialization (sorted keys, canonical floats)
- run_hash = SHA-256(snapshot_hash + analysis_input + math_spec_version) — NIE zależy od trace
- trace_signature = SHA-256(canonical JSON of artifact) — zależy od pełnej zawartości
- Brak heurystyk, brak auto-uzupełnień
"""

from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass
from enum import Enum
from typing import Any

# ---------------------------------------------------------------------------
# Canonical float policy
# ---------------------------------------------------------------------------


def canonical_float(x: float, precision: int = 10) -> float:
    """Canonical float normalization — single function for entire system.

    No tolerance thresholds. Deterministic rounding.
    """
    if not math.isfinite(x):
        return x
    return round(x, precision)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class AnalysisTypeV2(str, Enum):
    """Analysis types for Trace v2."""

    SC = "SC"
    PROTECTION = "PROTECTION"
    LOAD_FLOW = "LOAD_FLOW"


# ---------------------------------------------------------------------------
# TraceValue
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TraceValue:
    """Typed value with unit and Polish label.

    Attributes:
        name: Variable name (e.g. "ikss_a")
        value: Numerical or symbolic value
        unit: SI unit or "—" for dimensionless
        label_pl: Polish label for UI display
    """

    name: str
    value: float | str
    unit: str
    label_pl: str

    def to_dict(self) -> dict[str, Any]:
        v = self.value
        if isinstance(v, float):
            v = canonical_float(v)
        return {
            "name": self.name,
            "value": v,
            "unit": self.unit,
            "label_pl": self.label_pl,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TraceValue:
        return cls(
            name=data["name"],
            value=data["value"],
            unit=data["unit"],
            label_pl=data["label_pl"],
        )


# ---------------------------------------------------------------------------
# TraceEquationStep
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TraceEquationStep:
    """Single equation step in the trace.

    Attributes:
        step_id: Stable, semantic ID (e.g. "SC_ZK_001")
        subject_id: Element/node ID this step relates to
        eq_id: From EquationRegistryV2
        label_pl: From registry; UI-friendly Polish label
        symbolic_latex: From registry
        substituted_latex: Deterministic substitution with values
        inputs_used: Sorted input variable names
        intermediate_values: Sorted map of intermediate values
        result: Final result of this step
        origin: "input" | "solver" | "adapter"
        derived_in_adapter: True only when origin="adapter"
    """

    step_id: str
    subject_id: str
    eq_id: str
    label_pl: str
    symbolic_latex: str
    substituted_latex: str
    inputs_used: tuple[str, ...]
    intermediate_values: dict[str, TraceValue]
    result: TraceValue
    origin: str
    derived_in_adapter: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "step_id": self.step_id,
            "subject_id": self.subject_id,
            "eq_id": self.eq_id,
            "label_pl": self.label_pl,
            "symbolic_latex": self.symbolic_latex,
            "substituted_latex": self.substituted_latex,
            "inputs_used": sorted(self.inputs_used),
            "intermediate_values": {
                k: self.intermediate_values[k].to_dict()
                for k in sorted(self.intermediate_values.keys())
            },
            "result": self.result.to_dict(),
            "origin": self.origin,
            "derived_in_adapter": self.derived_in_adapter,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TraceEquationStep:
        return cls(
            step_id=data["step_id"],
            subject_id=data["subject_id"],
            eq_id=data["eq_id"],
            label_pl=data["label_pl"],
            symbolic_latex=data["symbolic_latex"],
            substituted_latex=data["substituted_latex"],
            inputs_used=tuple(sorted(data["inputs_used"])),
            intermediate_values={
                k: TraceValue.from_dict(v)
                for k, v in sorted(data.get("intermediate_values", {}).items())
            },
            result=TraceValue.from_dict(data["result"]),
            origin=data["origin"],
            derived_in_adapter=data.get("derived_in_adapter", False),
        )


# ---------------------------------------------------------------------------
# TraceArtifactV2
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TraceArtifactV2:
    """Canonical, immutable trace artifact (PR-33).

    INVARIANTS:
    - run_hash does NOT depend on trace content
    - trace_signature depends on full canonical serialization
    - All collections sorted for determinism
    """

    trace_id: str
    analysis_type: AnalysisTypeV2
    math_spec_version: str
    snapshot_hash: str
    run_hash: str
    inputs: dict[str, TraceValue]
    equation_steps: tuple[TraceEquationStep, ...]
    outputs: dict[str, TraceValue]
    trace_signature: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "trace_id": self.trace_id,
            "analysis_type": self.analysis_type.value,
            "math_spec_version": self.math_spec_version,
            "snapshot_hash": self.snapshot_hash,
            "run_hash": self.run_hash,
            "inputs": {k: self.inputs[k].to_dict() for k in sorted(self.inputs.keys())},
            "equation_steps": [
                step.to_dict() for step in sorted(self.equation_steps, key=lambda s: s.step_id)
            ],
            "outputs": {k: self.outputs[k].to_dict() for k in sorted(self.outputs.keys())},
            "trace_signature": self.trace_signature,
        }

    def to_canonical_dict(self) -> dict[str, Any]:
        """Canonical dict for signature computation (excludes trace_signature itself)."""
        return {
            "trace_id": self.trace_id,
            "analysis_type": self.analysis_type.value,
            "math_spec_version": self.math_spec_version,
            "snapshot_hash": self.snapshot_hash,
            "run_hash": self.run_hash,
            "inputs": {k: self.inputs[k].to_dict() for k in sorted(self.inputs.keys())},
            "equation_steps": [
                step.to_dict() for step in sorted(self.equation_steps, key=lambda s: s.step_id)
            ],
            "outputs": {k: self.outputs[k].to_dict() for k in sorted(self.outputs.keys())},
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TraceArtifactV2:
        return cls(
            trace_id=data["trace_id"],
            analysis_type=AnalysisTypeV2(data["analysis_type"]),
            math_spec_version=data["math_spec_version"],
            snapshot_hash=data["snapshot_hash"],
            run_hash=data["run_hash"],
            inputs={k: TraceValue.from_dict(v) for k, v in sorted(data.get("inputs", {}).items())},
            equation_steps=tuple(
                TraceEquationStep.from_dict(s) for s in data.get("equation_steps", [])
            ),
            outputs={
                k: TraceValue.from_dict(v) for k, v in sorted(data.get("outputs", {}).items())
            },
            trace_signature=data["trace_signature"],
        )


# ---------------------------------------------------------------------------
# Hash computation
# ---------------------------------------------------------------------------


def _canonical_json(data: Any) -> str:
    """Canonical JSON serialization for hashing."""
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def compute_run_hash(
    snapshot_hash: str,
    analysis_input: dict[str, Any],
    math_spec_version: str,
) -> str:
    """Compute run_hash = SHA-256(snapshot_hash + analysis_input + math_spec_version).

    INVARIANT: Does NOT depend on trace content, LaTeX, or rendering.
    """
    payload = {
        "snapshot_hash": snapshot_hash,
        "analysis_input": _canonicalize_for_hash(analysis_input),
        "math_spec_version": math_spec_version,
    }
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def compute_trace_signature(artifact_canonical_dict: dict[str, Any]) -> str:
    """Compute trace_signature = SHA-256(canonical JSON of TraceArtifactV2).

    INVARIANT: Depends on full trace content including substituted_latex.
    """
    return hashlib.sha256(_canonical_json(artifact_canonical_dict).encode("utf-8")).hexdigest()


def _canonicalize_for_hash(value: Any) -> Any:
    """Recursively canonicalize a JSON-like structure for deterministic hashing."""
    if isinstance(value, dict):
        return {k: _canonicalize_for_hash(v) for k, v in sorted(value.items())}
    if isinstance(value, list | tuple):
        return [_canonicalize_for_hash(item) for item in value]
    if isinstance(value, float):
        return canonical_float(value)
    if isinstance(value, complex):
        return {"re": canonical_float(value.real), "im": canonical_float(value.imag)}
    return value


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------


def build_trace_artifact_v2(
    *,
    trace_id: str,
    analysis_type: AnalysisTypeV2,
    math_spec_version: str,
    snapshot_hash: str,
    run_hash: str,
    inputs: dict[str, TraceValue],
    equation_steps: list[TraceEquationStep],
    outputs: dict[str, TraceValue],
) -> TraceArtifactV2:
    """Build a TraceArtifactV2 with computed trace_signature.

    Sorts equation_steps by step_id for determinism.
    """
    sorted_steps = tuple(sorted(equation_steps, key=lambda s: s.step_id))

    # Build artifact without signature first to compute it
    temp = TraceArtifactV2(
        trace_id=trace_id,
        analysis_type=analysis_type,
        math_spec_version=math_spec_version,
        snapshot_hash=snapshot_hash,
        run_hash=run_hash,
        inputs=dict(sorted(inputs.items())),
        equation_steps=sorted_steps,
        outputs=dict(sorted(outputs.items())),
        trace_signature="",  # populated after canonical trace hashing
    )

    signature = compute_trace_signature(temp.to_canonical_dict())

    return TraceArtifactV2(
        trace_id=trace_id,
        analysis_type=analysis_type,
        math_spec_version=math_spec_version,
        snapshot_hash=snapshot_hash,
        run_hash=run_hash,
        inputs=dict(sorted(inputs.items())),
        equation_steps=sorted_steps,
        outputs=dict(sorted(outputs.items())),
        trace_signature=signature,
    )
