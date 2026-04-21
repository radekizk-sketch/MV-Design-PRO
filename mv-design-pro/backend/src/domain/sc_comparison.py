"""
Short-Circuit Comparison Domain Model — PR-20: Deterministic Comparison

CANONICAL ALIGNMENT:
- INTERPRETATION ONLY — no physics, no solver calls
- Mathematical delta computation between two ResultSets
- ZERO heuristics, ZERO severity scoring (separate PR)

DOMAIN ENTITIES:
- NumericDelta: base vs other with absolute and relative delta
- ShortCircuitComparison: Full comparison record

INVARIANTS:
- rel = None if base == 0
- No severity scoring (separate PR)
- Sorting by element_ref
- input_hash = SHA-256(sorted(base.signature, other.signature, analysis_type))
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from domain.execution import ExecutionAnalysisType


@dataclass(frozen=True)
class NumericDelta:
    """
    Numeric delta between two values.

    INVARIANTS:
    - abs = other - base
    - rel = abs / base if base != 0, else None
    """

    base: float
    other: float
    abs: float
    rel: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "base": self.base,
            "other": self.other,
            "abs": self.abs,
            "rel": self.rel,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> NumericDelta:
        return cls(
            base=data["base"],
            other=data["other"],
            abs=data["abs"],
            rel=data.get("rel"),
        )


def compute_numeric_delta(base: float, other: float) -> NumericDelta:
    """Compute a NumericDelta from two values."""
    abs_delta = other - base
    rel_delta = abs_delta / base if base != 0.0 else None
    return NumericDelta(
        base=base,
        other=other,
        abs=abs_delta,
        rel=rel_delta,
    )


@dataclass(frozen=True)
class ShortCircuitComparison:
    """
    ShortCircuitComparison — mathematical delta between two SC ResultSets (PR-20).

    INVARIANTS:
    - Immutable (frozen dataclass)
    - comparison_id uniquely identifies this comparison
    - input_hash = SHA-256(sorted(base.signature, other.signature, analysis_type))
    - No severity scoring (separate PR)
    - deltas_by_source sorted by element_ref
    - deltas_by_branch sorted by element_ref
    """

    comparison_id: UUID
    study_case_id: UUID
    analysis_type: ExecutionAnalysisType
    base_scenario_id: UUID
    other_scenario_id: UUID
    created_at: datetime
    input_hash: str
    deltas_global: dict[str, NumericDelta]
    deltas_by_source: tuple[dict[str, Any], ...]
    deltas_by_branch: tuple[dict[str, Any], ...]

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary for API responses."""
        return {
            "comparison_id": str(self.comparison_id),
            "study_case_id": str(self.study_case_id),
            "analysis_type": self.analysis_type.value,
            "base_scenario_id": str(self.base_scenario_id),
            "other_scenario_id": str(self.other_scenario_id),
            "created_at": self.created_at.isoformat(),
            "input_hash": self.input_hash,
            "deltas_global": {k: v.to_dict() for k, v in self.deltas_global.items()},
            "deltas_by_source": list(self.deltas_by_source),
            "deltas_by_branch": list(self.deltas_by_branch),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ShortCircuitComparison:
        """Deserialize from dictionary."""
        return cls(
            comparison_id=UUID(data["comparison_id"]),
            study_case_id=UUID(data["study_case_id"]),
            analysis_type=ExecutionAnalysisType(data["analysis_type"]),
            base_scenario_id=UUID(data["base_scenario_id"]),
            other_scenario_id=UUID(data["other_scenario_id"]),
            created_at=datetime.fromisoformat(data["created_at"]),
            input_hash=data["input_hash"],
            deltas_global={k: NumericDelta.from_dict(v) for k, v in data["deltas_global"].items()},
            deltas_by_source=tuple(data.get("deltas_by_source", [])),
            deltas_by_branch=tuple(data.get("deltas_by_branch", [])),
        )


# ---------------------------------------------------------------------------
# Factory Functions
# ---------------------------------------------------------------------------


def compute_comparison_input_hash(
    base_signature: str,
    other_signature: str,
    analysis_type: ExecutionAnalysisType,
) -> str:
    """
    Compute deterministic SHA-256 hash for comparison input.

    INVARIANT: Identical inputs -> identical hash.

    Uses sorted signatures to ensure determinism regardless of argument order
    within the hash, but base/other distinction is preserved in the comparison itself.
    """
    canonical = {
        "analysis_type": analysis_type.value,
        "base_signature": base_signature,
        "other_signature": other_signature,
    }
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# Global delta keys for SC results
SC_GLOBAL_DELTA_KEYS = (
    "ikss_a",
    "ip_a",
    "ith_a",
    "ib_a",
    "sk_mva",
    "kappa",
    "zkk_ohm",
)


def build_comparison(
    *,
    study_case_id: UUID,
    analysis_type: ExecutionAnalysisType,
    base_scenario_id: UUID,
    other_scenario_id: UUID,
    base_result_set: Any,
    other_result_set: Any,
) -> ShortCircuitComparison:
    """
    Build a ShortCircuitComparison from two ResultSets.

    Computes global deltas for all SC_GLOBAL_DELTA_KEYS present in both ResultSets.
    Computes per-source and per-branch deltas sorted by element_ref.

    Args:
        study_case_id: The study case both results belong to.
        analysis_type: The shared analysis type.
        base_scenario_id: UUID of the base (reference) scenario.
        other_scenario_id: UUID of the other (comparison) scenario.
        base_result_set: ResultSet from base scenario.
        other_result_set: ResultSet from other scenario.

    Returns:
        ShortCircuitComparison with computed deltas.
    """
    input_hash = compute_comparison_input_hash(
        base_signature=base_result_set.deterministic_signature,
        other_signature=other_result_set.deterministic_signature,
        analysis_type=analysis_type,
    )

    # Global deltas
    deltas_global: dict[str, NumericDelta] = {}
    base_globals = base_result_set.global_results
    other_globals = other_result_set.global_results
    for key in SC_GLOBAL_DELTA_KEYS:
        if key in base_globals and key in other_globals:
            base_val = float(base_globals[key])
            other_val = float(other_globals[key])
            deltas_global[key] = compute_numeric_delta(base_val, other_val)

    # Per-element deltas (sources and branches)
    base_by_ref = {er.element_ref: er for er in base_result_set.element_results}
    other_by_ref = {er.element_ref: er for er in other_result_set.element_results}

    deltas_by_source = []
    deltas_by_branch = []

    all_refs = sorted(set(base_by_ref.keys()) | set(other_by_ref.keys()))
    for ref in all_refs:
        base_er = base_by_ref.get(ref)
        other_er = other_by_ref.get(ref)
        if base_er is None or other_er is None:
            continue

        element_deltas: dict[str, Any] = {"element_ref": ref}
        common_keys = sorted(set(base_er.values.keys()) & set(other_er.values.keys()))
        value_deltas = {}
        for vk in common_keys:
            bv = base_er.values[vk]
            ov = other_er.values[vk]
            if isinstance(bv, int | float) and isinstance(ov, int | float):
                value_deltas[vk] = compute_numeric_delta(float(bv), float(ov)).to_dict()
        element_deltas["deltas"] = value_deltas

        if base_er.element_type in ("Source", "source", "SOURCE"):
            deltas_by_source.append(element_deltas)
        elif base_er.element_type in ("Branch", "branch", "BRANCH"):
            deltas_by_branch.append(element_deltas)
        else:
            # Other element types go to source list by default
            deltas_by_source.append(element_deltas)

    # Sort by element_ref for determinism
    deltas_by_source.sort(key=lambda d: d["element_ref"])
    deltas_by_branch.sort(key=lambda d: d["element_ref"])

    return ShortCircuitComparison(
        comparison_id=uuid4(),
        study_case_id=study_case_id,
        analysis_type=analysis_type,
        base_scenario_id=base_scenario_id,
        other_scenario_id=other_scenario_id,
        created_at=datetime.now(UTC),
        input_hash=input_hash,
        deltas_global=deltas_global,
        deltas_by_source=tuple(deltas_by_source),
        deltas_by_branch=tuple(deltas_by_branch),
    )
