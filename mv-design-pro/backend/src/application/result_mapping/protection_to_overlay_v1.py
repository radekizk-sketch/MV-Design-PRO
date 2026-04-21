"""
Protection → OverlayPayloadV1 Mapper — PR-30: SLD Overlay Pro

Maps ProtectionResultSetV1 (PR-26) + optional CoordinationResultV1 (PR-28)
to OverlayPayloadV1 (PR-16) for SLD Protection Overlay visualization.

CANONICAL ALIGNMENT:
- Input: ProtectionResultSetV1, optional CoordinationResultV1
- Output: OverlayPayloadV1 (domain/result_set.py)
- Layer: Application (no physics, no solver calls)

INVARIANTS:
- ZERO physics calculations
- ZERO heuristics or magic thresholds
- 100% deterministic: same result → identical overlay → identical content_hash
- NO hex colors — semantic tokens only
- NO geometry modification
- Elements sorted lexicographically by element_ref
- Legend entries from PROTECTION_LEGEND_PL (Polish labels, backend-authoritative)
- Run-bound: run_id is binding reference
- Token-only: predefined dictionary, no ad-hoc values

TOKEN MAPPING:
- color_token: 'protection_active' | 'protection_inactive' | 'protection_f50'
- stroke_token: 'normal' | 'bold'
- animation_token: None (no animations in v1)

BADGE MAPPING:
- t51_s: F51 trip time [s] (None if no trip)
- t50_s: F50 trip time [s] (None if no trip / disabled)
- i_pickup_a: F51 pickup current (CT secondary) [A]
- margin_min_s: Minimum coordination margin [s] (if coordination available)
- margin_max_s: Maximum coordination margin [s] (if coordination available)
"""

from __future__ import annotations

from uuid import UUID

from domain.protection_coordination_v1 import CoordinationResultV1
from domain.protection_engine_v1 import ProtectionResultSetV1, RelayResultV1
from domain.result_set import (
    OverlayElement,
    OverlayLegendEntry,
    OverlayPayloadV1,
)

# ---------------------------------------------------------------------------
# Protection-specific legend entries (Polish, backend-authoritative)
# ---------------------------------------------------------------------------

PROTECTION_LEGEND_PL: list[OverlayLegendEntry] = [
    OverlayLegendEntry(
        color_token="protection_active",
        label="Zabezpieczenie aktywne",
        description="Przekaźnik reaguje na prąd testowy (F51 lub F50)",
    ),
    OverlayLegendEntry(
        color_token="protection_inactive",
        label="Brak zadziałania",
        description="Prąd testowy poniżej nastaw rozruchowych",
    ),
    OverlayLegendEntry(
        color_token="protection_f50",
        label="Zadziałanie zwarciowe (I>>)",
        description="Funkcja 50 zadziałała (czas natychmiastowy)",
    ),
]


# ---------------------------------------------------------------------------
# Mapper: ProtectionResultSetV1 → OverlayPayloadV1
# ---------------------------------------------------------------------------


def map_protection_to_overlay_v1(
    *,
    protection_result: ProtectionResultSetV1,
    run_id: UUID,
    coordination_result: CoordinationResultV1 | None = None,
    active_pair_id: str | None = None,
) -> OverlayPayloadV1:
    """
    Map ProtectionResultSetV1 to OverlayPayloadV1 for SLD visualization.

    DETERMINISTIC: Same input → identical OverlayPayloadV1.
    Elements sorted lexicographically by element_ref (CB ID).
    No physics. No heuristics. No hex colors.

    Each relay becomes an overlay element on its circuit breaker.
    Visual state reflects the "most important" test point result:
    - F50 pickup → 'protection_f50' token
    - F51 trip (any point) → 'protection_active' token
    - No trip → 'protection_inactive' token

    Args:
        protection_result: ProtectionResultSetV1 from engine.
        run_id: Binding run UUID.
        coordination_result: Optional CoordinationResultV1 for margin badges.
        active_pair_id: Optional active pair ID for coordination highlight.

    Returns:
        OverlayPayloadV1 with protection visual states and Polish legend.
    """
    # Build coordination margin lookup (relay_id → min/max margin)
    margin_lookup = _build_margin_lookup(coordination_result, active_pair_id)

    elements: list[OverlayElement] = []

    for relay_result in protection_result.relay_results:
        element = _build_relay_overlay_element(
            relay_result=relay_result,
            margin_lookup=margin_lookup,
        )
        elements.append(element)

    # Sort by element_ref (CB ID) for determinism
    elements.sort(key=lambda e: e.element_ref)

    return OverlayPayloadV1(
        run_id=run_id,
        analysis_type="PROTECTION",
        elements=elements,
        legend=list(PROTECTION_LEGEND_PL),
    )


# ---------------------------------------------------------------------------
# Internal Helpers
# ---------------------------------------------------------------------------


def _build_relay_overlay_element(
    *,
    relay_result: RelayResultV1,
    margin_lookup: dict[str, dict[str, float | None]],
) -> OverlayElement:
    """Build a single overlay element for a relay result.

    The element_ref is the attached_cb_id (relay visualized on its CB).
    """
    # Analyze all test point results for this relay
    has_f50_pickup = False
    has_f51_trip = False
    min_t51: float | None = None
    min_t50: float | None = None
    f51_pickup_a: float | None = None

    for tp in relay_result.per_test_point:
        fr = tp.function_results

        if fr.f51 is not None:
            has_f51_trip = True
            if min_t51 is None or fr.f51.t_trip_s < min_t51:
                min_t51 = fr.f51.t_trip_s
            f51_pickup_a = fr.f51.pickup_a_secondary

        if fr.f50 is not None and fr.f50.picked_up:
            has_f50_pickup = True
            t50 = fr.f50.t_trip_s
            if t50 is not None:
                if min_t50 is None or t50 < min_t50:
                    min_t50 = t50
            else:
                min_t50 = 0.0  # Instantaneous

    # Determine visual state and tokens
    if has_f50_pickup:
        visual_state = "CRITICAL"
        color_token = "protection_f50"
        stroke_token = "bold"
    elif has_f51_trip:
        visual_state = "OK"
        color_token = "protection_active"
        stroke_token = "normal"
    else:
        visual_state = "INACTIVE"
        color_token = "protection_inactive"
        stroke_token = "normal"

    # Build numeric badges
    numeric_badges: dict[str, float | None] = {
        "t51_s": min_t51,
        "t50_s": min_t50,
        "i_pickup_a": f51_pickup_a,
    }

    # Add coordination margin badges if available
    relay_margins = margin_lookup.get(relay_result.relay_id)
    if relay_margins:
        numeric_badges["margin_min_s"] = relay_margins.get("min")
        numeric_badges["margin_max_s"] = relay_margins.get("max")

    return OverlayElement(
        element_ref=relay_result.attached_cb_id,
        element_type="Switch",
        visual_state=visual_state,
        numeric_badges=numeric_badges,
        color_token=color_token,
        stroke_token=stroke_token,
        animation_token=None,
    )


def _build_margin_lookup(
    coordination_result: CoordinationResultV1 | None,
    active_pair_id: str | None,
) -> dict[str, dict[str, float | None]]:
    """Build relay_id → {min, max} margin lookup from coordination result.

    If active_pair_id is specified, only margins from that pair are included.
    Otherwise, all pairs are considered.

    Each relay may appear in multiple pairs. For each relay, the min/max
    margin across all relevant pairs is tracked.
    """
    if coordination_result is None:
        return {}

    lookup: dict[str, dict[str, float | None]] = {}

    for pair_result in coordination_result.pairs:
        # Filter to active pair if specified
        if active_pair_id is not None and pair_result.pair_id != active_pair_id:
            continue

        margins_with_value = [
            mp.margin_s for mp in pair_result.margin_points if mp.margin_s is not None
        ]

        if not margins_with_value:
            continue

        pair_min = min(margins_with_value)
        pair_max = max(margins_with_value)

        # Apply to both upstream and downstream relays
        for relay_id in (pair_result.upstream_relay_id, pair_result.downstream_relay_id):
            if relay_id not in lookup:
                lookup[relay_id] = {"min": pair_min, "max": pair_max}
            else:
                existing = lookup[relay_id]
                existing_min = existing.get("min")
                existing_max = existing.get("max")
                if existing_min is not None:
                    lookup[relay_id]["min"] = min(existing_min, pair_min)
                else:
                    lookup[relay_id]["min"] = pair_min
                if existing_max is not None:
                    lookup[relay_id]["max"] = max(existing_max, pair_max)
                else:
                    lookup[relay_id]["max"] = pair_max

    return lookup
