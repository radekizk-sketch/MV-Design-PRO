"""Trace v2 — unified white-box trace domain (RUN #2B)."""

from domain.trace_v2.artifact import (
    AnalysisTypeV2,
    TraceArtifactV2,
    TraceEquationStep,
    TraceValue,
    build_trace_artifact_v2,
    canonical_float,
    compute_run_hash,
    compute_trace_signature,
)
from domain.trace_v2.diff_engine import (
    TraceDiffEngine,
    TraceDiffEntry,
    TraceDiffResult,
    TraceStepDiff,
)
from domain.trace_v2.equation_registry_v2 import (
    EquationEntryV2,
    EquationRegistryV2,
    EquationVariable,
)
from domain.trace_v2.math_spec_version import CURRENT_MATH_SPEC_VERSION, MathSpecVersion

__all__ = [
    "AnalysisTypeV2",
    "TraceArtifactV2",
    "TraceEquationStep",
    "TraceValue",
    "build_trace_artifact_v2",
    "canonical_float",
    "compute_run_hash",
    "compute_trace_signature",
    "TraceDiffEngine",
    "TraceDiffEntry",
    "TraceDiffResult",
    "TraceStepDiff",
    "EquationEntryV2",
    "EquationRegistryV2",
    "EquationVariable",
    "CURRENT_MATH_SPEC_VERSION",
    "MathSpecVersion",
]
