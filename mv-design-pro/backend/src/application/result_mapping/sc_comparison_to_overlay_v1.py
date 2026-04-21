"""
SC Comparison -> OverlayPayloadV1 Mapper -- PR-21

Maps a ShortCircuitComparison (PR-20) to an OverlayPayloadV1 (PR-16)
for SLD Delta Overlay visualization.

CANONICAL ALIGNMENT:
- Input: ShortCircuitComparison (domain/sc_comparison.py)
- Output: OverlayPayloadV1 (domain/result_set.py)
- Layer: Application (no physics, no solver calls)

INVARIANTS:
- ZERO physics calculations
- ZERO heuristics or magic thresholds
- 100% deterministic: same comparison -> identical overlay -> identical content_hash
- NO hex colors -- semantic tokens only
- Elements sorted lexicographically by element_ref
- Legend entries from DELTA_LEGEND_PL (Polish labels, backend-authoritative)
- Delta direction encoded in visual_state: WZROST/SPADEK/BEZ_ZMIAN/BRAK_DANYCH
- Badge: delta sign and magnitude in numeric_badges, tooltip-ready

DELTA VISUAL STATE SEMANTICS:
- OK -> "Bez zmian" (abs delta == 0)
- WARNING -> "Zmiana" (nonzero delta, sign-agnostic)
- CRITICAL -> reserved (not used in v1 -- no heuristic thresholds)
- INACTIVE -> "Brak danych" (element in only one result set)

TOKEN MAPPING:
- color_token: 'delta_none' | 'delta_change' | 'delta_inactive'
- stroke_token: 'normal' | 'bold'
- badge_token: sign indicator in numeric_badges
"""

from __future__ import annotations

from typing import Any

from domain.result_set import (
    OverlayElement,
    OverlayLegendEntry,
    OverlayPayloadV1,
)
from domain.sc_comparison import (
    ShortCircuitComparison,
)

# ---------------------------------------------------------------------------
# Delta-specific legend entries (Polish, backend-authoritative)
# ---------------------------------------------------------------------------

DELTA_LEGEND_PL: list[OverlayLegendEntry] = [
    OverlayLegendEntry(
        color_token="delta_none",
        label="Bez zmian",
        description="Wartosci identyczne w obu przebiegach",
    ),
    OverlayLegendEntry(
        color_token="delta_change",
        label="Zmiana",
        description="Wartosc rozni sie miedzy przebiegami",
    ),
    OverlayLegendEntry(
        color_token="delta_inactive",
        label="Brak danych",
        description="Element obecny tylko w jednym przebiegu",
    ),
]


# ---------------------------------------------------------------------------
# Mapper: ShortCircuitComparison -> OverlayPayloadV1
# ---------------------------------------------------------------------------


def _has_nonzero_delta(deltas: dict[str, Any]) -> bool:
    """Check if any numeric delta in a delta dict is nonzero."""
    for _key, delta_dict in deltas.items():
        if isinstance(delta_dict, dict):
            abs_val = delta_dict.get("abs", 0.0)
            if abs_val != 0.0:
                return True
    return False


def _build_element_from_deltas(
    element_ref: str,
    element_type: str,
    deltas: dict[str, Any],
) -> OverlayElement:
    """
    Build a single OverlayElement from per-element deltas.

    Visual state:
    - OK if all deltas are zero
    - WARNING if any delta is nonzero
    """
    has_change = _has_nonzero_delta(deltas)

    # Build numeric badges from deltas (abs values for display)
    numeric_badges: dict[str, float | None] = {}
    for key, delta_dict in sorted(deltas.items()):
        if isinstance(delta_dict, dict):
            numeric_badges[f"{key}_base"] = delta_dict.get("base")
            numeric_badges[f"{key}_other"] = delta_dict.get("other")
            numeric_badges[f"{key}_abs"] = delta_dict.get("abs")
            numeric_badges[f"{key}_rel"] = delta_dict.get("rel")

    if has_change:
        return OverlayElement(
            element_ref=element_ref,
            element_type=element_type,
            visual_state="WARNING",
            numeric_badges=numeric_badges,
            color_token="delta_change",
            stroke_token="bold",
            animation_token=None,
        )
    else:
        return OverlayElement(
            element_ref=element_ref,
            element_type=element_type,
            visual_state="OK",
            numeric_badges=numeric_badges,
            color_token="delta_none",
            stroke_token="normal",
            animation_token=None,
        )


def map_sc_comparison_to_overlay_v1(
    comparison: ShortCircuitComparison,
) -> OverlayPayloadV1:
    """
    Map a ShortCircuitComparison to an OverlayPayloadV1 for SLD Delta Overlay.

    DETERMINISTIC: Same comparison -> identical OverlayPayloadV1.
    Elements sorted lexicographically by element_ref.
    No physics. No heuristics. No hex colors.

    Args:
        comparison: ShortCircuitComparison from PR-20.

    Returns:
        OverlayPayloadV1 with delta visual states and legend (Polish).
    """
    elements: list[OverlayElement] = []

    # Process per-source deltas
    for source_delta in comparison.deltas_by_source:
        ref = source_delta.get("element_ref", "")
        deltas = source_delta.get("deltas", {})
        elements.append(
            _build_element_from_deltas(
                element_ref=ref,
                element_type="Source",
                deltas=deltas,
            )
        )

    # Process per-branch deltas
    for branch_delta in comparison.deltas_by_branch:
        ref = branch_delta.get("element_ref", "")
        deltas = branch_delta.get("deltas", {})
        elements.append(
            _build_element_from_deltas(
                element_ref=ref,
                element_type="Branch",
                deltas=deltas,
            )
        )

    # Sort lexicographically by element_ref for determinism
    elements.sort(key=lambda e: e.element_ref)

    # Use comparison_id as the overlay run_id binding
    return OverlayPayloadV1(
        run_id=comparison.comparison_id,
        analysis_type=f"DELTA_{comparison.analysis_type.value}",
        elements=elements,
        legend=list(DELTA_LEGEND_PL),
    )


def compute_delta_overlay_content_hash(
    overlay: OverlayPayloadV1,
) -> str:
    """
    Compute deterministic content hash for a delta overlay payload.

    Uses the same canonical JSON -> SHA-256 pattern as all other hashes
    in the system.

    Args:
        overlay: The OverlayPayloadV1 to hash.

    Returns:
        SHA-256 hex digest.
    """
    return overlay.content_hash()
