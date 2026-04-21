"""
Overlay Payload V1 — Deterministic Visual Overlay Contract (PR-16)

CANONICAL ALIGNMENT:
- SYSTEM_SPEC.md: Overlay = pure projection of ResultSet onto visual layer
- sld_rules.md § B: Results as Overlay (never modifies model)

INVARIANTS:
- OverlayPayloadV1 is 100% deterministic (same input → identical output)
- Contains ONLY visual tokens (color_token, stroke_token, animation_token)
- NO hex colors — UI maps tokens to theme-specific colors
- NO physics calculations — all values pre-computed by solver/analysis
- NO model mutation — read-only projection
- NO heuristics — all decisions made upstream (analysis layer)

VISUAL STATE SEMANTICS:
- OK: Element within all operational limits
- WARNING: Element approaching limit (pre-computed by analysis)
- CRITICAL: Element exceeding limit (pre-computed by analysis)
- INACTIVE: Element out of service or not applicable
"""

from __future__ import annotations

import hashlib
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class OverlayElement(BaseModel):
    """
    Single element visual state in overlay.

    INVARIANTS:
    - element_ref matches NetworkModel element ID (bijection)
    - visual_state determined by analysis layer, NOT by UI
    - color_token is a semantic token, NOT a hex color
    - stroke_token is a semantic token for border/stroke
    - animation_token is optional (None = no animation)
    - numeric_badges are pre-computed display values (no physics in UI)
    """

    element_ref: str = Field(
        ..., description="Element ID in NetworkModel (bijection with SLD symbol)"
    )
    element_type: str = Field(
        ..., description="Element type (Bus, LineBranch, TransformerBranch, Switch, Source, Load)"
    )
    visual_state: Literal["OK", "WARNING", "CRITICAL", "INACTIVE"] = Field(
        ..., description="Visual state token (determined by analysis, NOT by UI)"
    )
    numeric_badges: dict[str, float | None] = Field(
        default_factory=dict,
        description="Pre-computed numeric display values (e.g., {'u_pu': 1.02, 'loading_pct': 75.3})",
    )
    color_token: str = Field(
        ..., description="Semantic color token (e.g., 'ok', 'warning', 'critical', 'inactive')"
    )
    stroke_token: str = Field(
        ..., description="Semantic stroke token (e.g., 'normal', 'bold', 'dashed')"
    )
    animation_token: str | None = Field(
        default=None,
        description="Optional animation token (e.g., 'pulse', 'blink', None)",
    )


class OverlayLegendEntry(BaseModel):
    """
    Single legend entry for overlay.

    INVARIANTS:
    - label is a human-readable Polish string
    - color_token matches tokens used in OverlayElement
    - description is optional additional context
    """

    color_token: str = Field(..., description="Semantic color token matching overlay elements")
    label: str = Field(..., description="Polish label for legend entry")
    description: str | None = Field(
        default=None, description="Optional description for legend entry"
    )


class OverlayPayloadV1(BaseModel):
    """
    Overlay Payload V1 — Complete overlay data for SLD visualization.

    INVARIANTS:
    - run_id is BINDING — overlay tied to specific calculation run
    - analysis_type identifies the source analysis (SC_3F, LOAD_FLOW, etc.)
    - elements list contains ONLY elements with overlay data
    - legend is pre-computed by analysis layer (UI does NOT generate legend)
    - 100% deterministic: same run_id + analysis_type → identical payload
    - NO hex colors anywhere — only semantic tokens
    - NO physics values outside numeric_badges
    """

    run_id: UUID = Field(..., description="Binding reference to calculation run")
    analysis_type: str = Field(
        ..., description="Analysis type (SC_3F, SC_1F, LOAD_FLOW, PROTECTION)"
    )
    elements: list[OverlayElement] = Field(
        default_factory=list, description="Overlay data for affected elements"
    )
    legend: list[OverlayLegendEntry] = Field(
        default_factory=list, description="Legend entries for this overlay"
    )

    def content_hash(self) -> str:
        """
        Compute deterministic content hash for this payload.

        Used for:
        - Snapshot testing (same input → same hash)
        - Cache invalidation
        - Determinism verification

        INVARIANT: Identical payloads produce identical hashes.
        """
        canonical = self.model_dump_json(exclude_none=False)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def element_refs(self) -> frozenset[str]:
        """Return set of all element references in this payload."""
        return frozenset(e.element_ref for e in self.elements)

    def get_element(self, element_ref: str) -> OverlayElement | None:
        """Get overlay element by reference. Returns None if not found."""
        for e in self.elements:
            if e.element_ref == element_ref:
                return e
        return None


def build_overlay_payload(
    run_id: UUID,
    analysis_type: str,
    elements: list[OverlayElement],
    legend: list[OverlayLegendEntry],
) -> OverlayPayloadV1:
    """
    Build an OverlayPayloadV1 from pre-computed data.

    This is the ONLY entry point for creating overlay payloads.
    All visual state decisions must be made BEFORE calling this function.

    Args:
        run_id: Binding reference to calculation run
        analysis_type: Analysis type identifier
        elements: Pre-computed overlay elements
        legend: Pre-computed legend entries

    Returns:
        Deterministic OverlayPayloadV1
    """
    return OverlayPayloadV1(
        run_id=run_id,
        analysis_type=analysis_type,
        elements=elements,
        legend=legend,
    )
