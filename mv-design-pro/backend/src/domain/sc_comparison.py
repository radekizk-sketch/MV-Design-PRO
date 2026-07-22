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
import math
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

# Karta S-C (2026-07-22): addytywne delty pełnego bilansu IEC 60909 — wielkości
# pochodne liczone tą samą klasą przekształceń co kanoniczny pełny bilans wierszy
# (enm/canonical_analysis._sc_pelny_bilans): |Zk| = hypot(Rk, Xk), X/R = 1/(R/X),
# I²t = (Ith/1000)²·tk. Kolejność stała (determinizm), FROZEN nietknięte.
SC_DERIVED_DELTA_KEYS = (
    "i2t_ka2s",
    "rk_ohm",
    "xk_ohm",
    "xr_ratio",
    "zk_ohm",
)


def _global_numeric(value: Any) -> float | None:
    """Wartość liczbowa klucza globalnego ResultSetu.

    Kontrakt niesie dwie postacie zkk_ohm: skalar (|Zk|) w starszych/prostych
    payloadach oraz dict {"re","im"} z mapowania resultset_v1 — dict rzutujemy
    na moduł (ta sama klasa przekształceń co pełny bilans). Inne kształty →
    None (uczciwy brak delty, zero zgadywania).
    """
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, dict):
        re = value.get("re")
        im = value.get("im")
        if isinstance(re, int | float) and isinstance(im, int | float):
            return math.hypot(float(re), float(im))
        return None
    return None


def _derive_sc_globals(global_results: dict[str, Any]) -> dict[str, float]:
    """Pochodne pełnego bilansu z global_results (addytywnie, deterministycznie).

    Zwraca wyłącznie wielkości wyliczalne z obecnych kluczy; brak klucza źródła
    → brak pochodnej (starsze wyniki: uczciwy brak delty).
    """
    derived: dict[str, float] = {}

    zkk = global_results.get("zkk_ohm")
    if isinstance(zkk, dict):
        re = zkk.get("re")
        im = zkk.get("im")
        if isinstance(re, int | float) and isinstance(im, int | float):
            derived["rk_ohm"] = float(re)
            derived["xk_ohm"] = float(im)
            derived["zk_ohm"] = math.hypot(float(re), float(im))
    elif isinstance(zkk, int | float) and not isinstance(zkk, bool):
        # Skalar niesie wyłącznie moduł |Zk| — składowych Rk/Xk uczciwie brak.
        derived["zk_ohm"] = float(zkk)

    rx = global_results.get("rx_ratio")
    if isinstance(rx, int | float) and not isinstance(rx, bool) and rx != 0.0:
        derived["xr_ratio"] = 1.0 / float(rx)

    ith_a = global_results.get("ith_a")
    tk_s = global_results.get("tk_s")
    if (
        isinstance(ith_a, int | float)
        and not isinstance(ith_a, bool)
        and isinstance(tk_s, int | float)
        and not isinstance(tk_s, bool)
    ):
        derived["i2t_ka2s"] = (float(ith_a) / 1000.0) ** 2 * float(tk_s)

    return derived


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
            # zkk_ohm bywa dictem {"re","im"} (mapowanie resultset_v1) — rzut na
            # moduł zamiast TypeError (naprawa u źródła, Zero-Debt).
            base_val = _global_numeric(base_globals[key])
            other_val = _global_numeric(other_globals[key])
            if base_val is None or other_val is None:
                continue
            deltas_global[key] = compute_numeric_delta(base_val, other_val)

    # Addytywne delty pełnego bilansu (karta S-C): liczone wyłącznie gdy obie
    # strony niosą wielkość źródłową; kolejność kluczy stała (determinizm).
    base_derived = _derive_sc_globals(base_globals)
    other_derived = _derive_sc_globals(other_globals)
    for key in SC_DERIVED_DELTA_KEYS:
        if key in base_derived and key in other_derived:
            deltas_global[key] = compute_numeric_delta(base_derived[key], other_derived[key])

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
