"""
Protection Coordination v1 — PR-28: Selectivity Margins

Pure-function coordination engine: computes numerical margins
between explicit upstream/downstream relay pairs.

INVARIANTS:
- Pairs are EXPLICIT (user-defined upstream + downstream relay IDs)
- No auto-detection of upstream/downstream topology
- No OK/FAIL verdicts — only numerical margins with WHITE BOX trace
- Sign convention: positive margin = upstream is slower (expected)
- margin_s = t_upstream_s − t_downstream_s
- Deterministic: same inputs → same outputs
- Permutation invariant: pair order does not affect per-pair result
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

# =============================================================================
# DOMAIN TYPES
# =============================================================================


@dataclass(frozen=True)
class ProtectionSelectivityPair:
    """Explicit upstream/downstream relay pair for coordination analysis.

    Attributes:
        pair_id: Unique pair identifier
        upstream_relay_id: Relay closer to source (should trip later)
        downstream_relay_id: Relay closer to fault (should trip first)
    """

    pair_id: str
    upstream_relay_id: str
    downstream_relay_id: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "pair_id": self.pair_id,
            "upstream_relay_id": self.upstream_relay_id,
            "downstream_relay_id": self.downstream_relay_id,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionSelectivityPair:
        return cls(
            pair_id=str(data["pair_id"]),
            upstream_relay_id=str(data["upstream_relay_id"]),
            downstream_relay_id=str(data["downstream_relay_id"]),
        )


@dataclass(frozen=True)
class SelectivityMarginPoint:
    """Margin at a specific current value.

    Attributes:
        i_a_primary: Test current [A]
        t_upstream_s: Upstream trip time [s] (None if no trip)
        t_downstream_s: Downstream trip time [s] (None if no trip)
        margin_s: t_upstream - t_downstream [s] (None if either is None)
    """

    i_a_primary: float
    t_upstream_s: float | None
    t_downstream_s: float | None
    margin_s: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "i_a_primary": self.i_a_primary,
            "t_upstream_s": self.t_upstream_s,
            "t_downstream_s": self.t_downstream_s,
            "margin_s": self.margin_s,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SelectivityMarginPoint:
        return cls(
            i_a_primary=float(data["i_a_primary"]),
            t_upstream_s=(
                float(data["t_upstream_s"]) if data.get("t_upstream_s") is not None else None
            ),
            t_downstream_s=(
                float(data["t_downstream_s"]) if data.get("t_downstream_s") is not None else None
            ),
            margin_s=(float(data["margin_s"]) if data.get("margin_s") is not None else None),
        )


@dataclass(frozen=True)
class SelectivityPairResult:
    """Result for a single selectivity pair.

    Attributes:
        pair_id: Pair identifier (matches ProtectionSelectivityPair.pair_id)
        upstream_relay_id: Upstream relay ID
        downstream_relay_id: Downstream relay ID
        margin_points: Margin points sorted ascending by i_a_primary
        trace: WHITE BOX trace for audit
    """

    pair_id: str
    upstream_relay_id: str
    downstream_relay_id: str
    margin_points: tuple[SelectivityMarginPoint, ...] = field(default_factory=tuple)
    trace: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "pair_id": self.pair_id,
            "upstream_relay_id": self.upstream_relay_id,
            "downstream_relay_id": self.downstream_relay_id,
            "margin_points": [mp.to_dict() for mp in self.margin_points],
            "trace": self.trace,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SelectivityPairResult:
        return cls(
            pair_id=str(data["pair_id"]),
            upstream_relay_id=str(data["upstream_relay_id"]),
            downstream_relay_id=str(data["downstream_relay_id"]),
            margin_points=tuple(
                SelectivityMarginPoint.from_dict(mp) for mp in data.get("margin_points", [])
            ),
            trace=data.get("trace", {}),
        )


@dataclass(frozen=True)
class CoordinationResultV1:
    """Complete coordination analysis result.

    INVARIANTS:
    - pairs sorted by pair_id
    - deterministic_signature = SHA-256 of canonical result JSON
    """

    pairs: tuple[SelectivityPairResult, ...] = field(default_factory=tuple)
    deterministic_signature: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "pairs": [p.to_dict() for p in self.pairs],
            "deterministic_signature": self.deterministic_signature,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CoordinationResultV1:
        return cls(
            pairs=tuple(SelectivityPairResult.from_dict(p) for p in data.get("pairs", [])),
            deterministic_signature=str(data.get("deterministic_signature", "")),
        )


# =============================================================================
# ERRORS
# =============================================================================


class CoordinationError(Exception):
    """Base error for coordination analysis."""

    def __init__(self, code: str, message_pl: str) -> None:
        super().__init__(message_pl)
        self.code = code
        self.message_pl = message_pl


class SameRelayPairError(CoordinationError):
    """Upstream and downstream relay are the same."""

    def __init__(self, relay_id: str) -> None:
        super().__init__(
            code="coordination.same_relay_pair",
            message_pl=(
                f"Para selektywności: upstream i downstream to ten sam "
                f"przekaźnik ({relay_id}). Wymagane dwa różne przekaźniki."
            ),
        )
        self.relay_id = relay_id


class RelayNotInResultError(CoordinationError):
    """Referenced relay not found in protection result."""

    def __init__(self, relay_id: str, pair_id: str) -> None:
        super().__init__(
            code="coordination.relay_not_in_result",
            message_pl=(
                f"Przekaźnik {relay_id} (para {pair_id}) nie występuje "
                f"w wynikach ochrony. Sprawdź konfigurację par."
            ),
        )
        self.relay_id = relay_id
        self.pair_id = pair_id


class DuplicatePairIdError(CoordinationError):
    """Duplicate pair_id in coordination input."""

    def __init__(self, pair_id: str) -> None:
        super().__init__(
            code="coordination.duplicate_pair_id",
            message_pl=(
                f"Zduplikowane pair_id: {pair_id}. " f"Każda para musi mieć unikalny identyfikator."
            ),
        )
        self.pair_id = pair_id


# =============================================================================
# COORDINATION ENGINE — PURE FUNCTION
# =============================================================================


def compute_coordination_v1(
    *,
    pairs: tuple[ProtectionSelectivityPair, ...],
    protection_result: Any,
) -> CoordinationResultV1:
    """Compute selectivity margins for explicit relay pairs.

    Pure function — no side effects, deterministic output.

    Algorithm:
    1. Validate pairs (no duplicates, no same-relay, relays exist in result)
    2. Build relay → test_point → trip_time lookup from protection result
    3. For each pair, for each test point: margin = t_upstream − t_downstream
    4. Sort margin_points by i_a_primary ascending
    5. Sort pair results by pair_id
    6. Compute deterministic signature

    Args:
        pairs: Explicit upstream/downstream relay pairs.
        protection_result: ProtectionResultSetV1 from Protection Engine v1.

    Returns:
        CoordinationResultV1 with margin points and deterministic signature.

    Raises:
        SameRelayPairError: If upstream == downstream relay.
        RelayNotInResultError: If relay not found in protection result.
        DuplicatePairIdError: If duplicate pair_id.
    """
    # Step 1: Validate pairs
    _validate_pairs(pairs, protection_result)

    # Step 2: Build relay → {point_id → (trip_time_s, i_a_primary)} lookup
    relay_lookup = _build_relay_lookup(protection_result)

    # Step 3: Compute margins for each pair
    pair_results: list[SelectivityPairResult] = []

    for pair in pairs:
        margin_points = _compute_pair_margins(
            pair=pair,
            relay_lookup=relay_lookup,
        )

        trace = _build_pair_trace(pair, margin_points)

        pair_results.append(
            SelectivityPairResult(
                pair_id=pair.pair_id,
                upstream_relay_id=pair.upstream_relay_id,
                downstream_relay_id=pair.downstream_relay_id,
                margin_points=margin_points,
                trace=trace,
            )
        )

    # Step 5: Sort by pair_id for determinism
    sorted_pair_results = tuple(sorted(pair_results, key=lambda p: p.pair_id))

    # Step 6: Compute deterministic signature
    sig_data = {
        "pairs": [p.to_dict() for p in sorted_pair_results],
    }
    # Remove trace from signature (trace is informational, not contractual)
    for p in sig_data["pairs"]:
        p.pop("trace", None)
    sig_json = json.dumps(sig_data, sort_keys=True, separators=(",", ":"))
    signature = hashlib.sha256(sig_json.encode("utf-8")).hexdigest()

    return CoordinationResultV1(
        pairs=sorted_pair_results,
        deterministic_signature=signature,
    )


# =============================================================================
# INTERNAL HELPERS
# =============================================================================


def _validate_pairs(
    pairs: tuple[ProtectionSelectivityPair, ...],
    protection_result: Any,
) -> None:
    """Validate coordination pairs against protection result."""
    # Check for duplicate pair_ids
    seen_pair_ids: set[str] = set()
    for pair in pairs:
        if pair.pair_id in seen_pair_ids:
            raise DuplicatePairIdError(pair.pair_id)
        seen_pair_ids.add(pair.pair_id)

    # Check upstream != downstream
    for pair in pairs:
        if pair.upstream_relay_id == pair.downstream_relay_id:
            raise SameRelayPairError(pair.upstream_relay_id)

    # Check all relay IDs exist in protection result
    result_relay_ids = {rr.relay_id for rr in protection_result.relay_results}
    for pair in pairs:
        if pair.upstream_relay_id not in result_relay_ids:
            raise RelayNotInResultError(pair.upstream_relay_id, pair.pair_id)
        if pair.downstream_relay_id not in result_relay_ids:
            raise RelayNotInResultError(pair.downstream_relay_id, pair.pair_id)


def _build_relay_lookup(
    protection_result: Any,
) -> dict[str, dict[str, tuple[float | None, float]]]:
    """Build relay_id → {point_id → (trip_time_s, i_a_primary)} lookup.

    Trip time is the effective time: min of F50 and F51 trip times.
    i_a_primary is reconstructed from i_a_secondary * CT ratio (stored in trace).
    """
    lookup: dict[str, dict[str, tuple[float | None, float]]] = {}

    for relay_result in protection_result.relay_results:
        point_map: dict[str, tuple[float | None, float]] = {}

        for tp_result in relay_result.per_test_point:
            trip_time = _effective_trip_time(tp_result.function_results)

            # Extract i_a_primary from trace
            i_a_primary = tp_result.trace.get("i_a_primary", 0.0)

            point_map[tp_result.point_id] = (trip_time, i_a_primary)

        lookup[relay_result.relay_id] = point_map

    return lookup


def _effective_trip_time(function_results: Any) -> float | None:
    """Get effective trip time from function results.

    If both F50 and F51 trip, return the minimum (fastest).
    If only one trips, return that.
    If neither trips, return None.
    """
    times: list[float] = []

    if function_results.f51 is not None:
        times.append(function_results.f51.t_trip_s)

    if function_results.f50 is not None and function_results.f50.picked_up:
        t50 = function_results.f50.t_trip_s
        if t50 is not None:
            times.append(t50)
        else:
            times.append(0.0)  # Instantaneous

    if not times:
        return None
    return min(times)


def _compute_pair_margins(
    *,
    pair: ProtectionSelectivityPair,
    relay_lookup: dict[str, dict[str, tuple[float | None, float]]],
) -> tuple[SelectivityMarginPoint, ...]:
    """Compute margin points for a single pair.

    For each common test point, compute:
        margin = t_upstream − t_downstream
    """
    upstream_points = relay_lookup[pair.upstream_relay_id]
    downstream_points = relay_lookup[pair.downstream_relay_id]

    # Find common test points (both relays evaluated at same points)
    common_point_ids = sorted(set(upstream_points.keys()) & set(downstream_points.keys()))

    margin_points: list[SelectivityMarginPoint] = []

    for point_id in common_point_ids:
        t_upstream, i_primary_up = upstream_points[point_id]
        t_downstream, i_primary_down = downstream_points[point_id]

        # Use upstream i_a_primary (both should be identical for same test point)
        i_a_primary = i_primary_up

        # Compute margin
        margin: float | None = None
        if t_upstream is not None and t_downstream is not None:
            margin = round(t_upstream - t_downstream, 6)

        margin_points.append(
            SelectivityMarginPoint(
                i_a_primary=i_a_primary,
                t_upstream_s=t_upstream,
                t_downstream_s=t_downstream,
                margin_s=margin,
            )
        )

    # Sort by i_a_primary ascending (deterministic)
    sorted_margins = tuple(sorted(margin_points, key=lambda mp: mp.i_a_primary))

    return sorted_margins


def _build_pair_trace(
    pair: ProtectionSelectivityPair,
    margin_points: tuple[SelectivityMarginPoint, ...],
) -> dict[str, Any]:
    """Build WHITE BOX trace for a selectivity pair."""
    margins_with_value = [mp.margin_s for mp in margin_points if mp.margin_s is not None]

    trace: dict[str, Any] = {
        "pair_id": pair.pair_id,
        "upstream_relay_id": pair.upstream_relay_id,
        "downstream_relay_id": pair.downstream_relay_id,
        "formula": "margin = t_upstream − t_downstream",
        "sign_convention_pl": ("Dodatni margines = upstream wolniejszy (oczekiwane)"),
        "total_points": len(margin_points),
        "points_with_margin": len(margins_with_value),
    }

    if margins_with_value:
        trace["min_margin_s"] = round(min(margins_with_value), 6)
        trace["max_margin_s"] = round(max(margins_with_value), 6)

    return trace
