"""Canonical AnalysisKind enum for unified dispatch.

PR-6: Unify analysis dispatch with stable AnalysisRun contract.

Maps between the canonical enum and the AS-IS analysis_type literals
used in AnalysisRun and ProtectionAnalysisRun.
"""

from __future__ import annotations

from enum import StrEnum


class AnalysisKind(StrEnum):
    """Canonical analysis kind enum.

    Used by AnalysisDispatchService to unify dispatch across all analysis types.
    """

    SHORT_CIRCUIT = "SHORT_CIRCUIT"
    POWER_FLOW = "POWER_FLOW"
    PROTECTION = "PROTECTION"


# Mapping from canonical kind to AS-IS analysis_type literals
_KIND_TO_ANALYSIS_TYPE: dict[AnalysisKind, str] = {
    AnalysisKind.SHORT_CIRCUIT: "short_circuit_sn",
    AnalysisKind.POWER_FLOW: "PF",
    AnalysisKind.PROTECTION: "protection",
}

_ANALYSIS_TYPE_TO_KIND: dict[str, AnalysisKind] = {v: k for k, v in _KIND_TO_ANALYSIS_TYPE.items()}


def kind_to_analysis_type(kind: AnalysisKind) -> str:
    """Convert canonical AnalysisKind to AS-IS analysis_type literal."""
    return _KIND_TO_ANALYSIS_TYPE[kind]


def analysis_type_to_kind(analysis_type: str) -> AnalysisKind | None:
    """Convert AS-IS analysis_type literal to canonical AnalysisKind.

    Returns None if the analysis_type is not recognized.
    """
    return _ANALYSIS_TYPE_TO_KIND.get(analysis_type)
