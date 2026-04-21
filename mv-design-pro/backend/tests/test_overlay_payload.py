"""
Overlay Payload V1 Tests — PR-16

CANONICAL ALIGNMENT:
- domain/result_set.py: OverlayPayloadV1 contract
- SYSTEM_SPEC.md: Overlay = pure projection, deterministic

TEST COVERAGE:
- Determinism: identical input → identical content_hash
- Element integrity: only existing elements in overlay
- No physics values outside numeric_badges
- No hex colors in overlay payload
- Serialization round-trip stability
- Legend contract compliance
"""

from __future__ import annotations

import re
from uuid import UUID

from domain.result_set import (
    OverlayElement,
    OverlayLegendEntry,
    OverlayPayloadV1,
    build_overlay_payload,
)

# =============================================================================
# TEST FIXTURES
# =============================================================================

RUN_ID_1 = UUID("00000000-0000-0000-0000-000000000001")
RUN_ID_2 = UUID("00000000-0000-0000-0000-000000000002")

HEX_COLOR_PATTERN = re.compile(r"#[0-9a-fA-F]{3,8}")


def _make_sc3f_elements() -> list[OverlayElement]:
    """Create deterministic SC_3F overlay elements."""
    return [
        OverlayElement(
            element_ref="bus-001",
            element_type="Bus",
            visual_state="OK",
            numeric_badges={"ikss_ka": 12.5, "sk_mva": 250.0},
            color_token="ok",
            stroke_token="normal",
            animation_token=None,
        ),
        OverlayElement(
            element_ref="bus-002",
            element_type="Bus",
            visual_state="WARNING",
            numeric_badges={"ikss_ka": 25.3, "sk_mva": 500.0},
            color_token="warning",
            stroke_token="bold",
            animation_token="pulse",
        ),
        OverlayElement(
            element_ref="line-001",
            element_type="LineBranch",
            visual_state="CRITICAL",
            numeric_badges={"loading_pct": 115.2},
            color_token="critical",
            stroke_token="bold",
            animation_token="blink",
        ),
    ]


def _make_load_flow_elements() -> list[OverlayElement]:
    """Create deterministic LOAD_FLOW overlay elements."""
    return [
        OverlayElement(
            element_ref="bus-001",
            element_type="Bus",
            visual_state="OK",
            numeric_badges={"u_pu": 1.02, "u_kv": 20.4},
            color_token="ok",
            stroke_token="normal",
            animation_token=None,
        ),
        OverlayElement(
            element_ref="trafo-001",
            element_type="TransformerBranch",
            visual_state="WARNING",
            numeric_badges={"loading_pct": 87.5, "i_a": 350.0},
            color_token="warning",
            stroke_token="normal",
            animation_token=None,
        ),
    ]


def _make_legend() -> list[OverlayLegendEntry]:
    """Create standard overlay legend."""
    return [
        OverlayLegendEntry(
            color_token="ok",
            label="Norma",
            description="Element w granicach dopuszczalnych",
        ),
        OverlayLegendEntry(
            color_token="warning",
            label="Ostrzezenie",
            description="Element blisko limitu",
        ),
        OverlayLegendEntry(
            color_token="critical",
            label="Przekroczenie",
            description="Element poza limitem",
        ),
        OverlayLegendEntry(
            color_token="inactive",
            label="Nieaktywny",
            description=None,
        ),
    ]


# =============================================================================
# DETERMINISM TESTS
# =============================================================================


class TestOverlayDeterminism:
    """Identical solver input → identical overlay hash."""

    def test_identical_input_produces_identical_hash(self) -> None:
        """Same elements + same run_id → same content_hash."""
        payload_a = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="SC_3F",
            elements=_make_sc3f_elements(),
            legend=_make_legend(),
        )
        payload_b = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="SC_3F",
            elements=_make_sc3f_elements(),
            legend=_make_legend(),
        )
        assert payload_a.content_hash() == payload_b.content_hash()

    def test_different_run_id_produces_different_hash(self) -> None:
        """Different run_id → different content_hash."""
        payload_a = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="SC_3F",
            elements=_make_sc3f_elements(),
            legend=_make_legend(),
        )
        payload_b = build_overlay_payload(
            run_id=RUN_ID_2,
            analysis_type="SC_3F",
            elements=_make_sc3f_elements(),
            legend=_make_legend(),
        )
        assert payload_a.content_hash() != payload_b.content_hash()

    def test_different_analysis_type_produces_different_hash(self) -> None:
        """Different analysis_type → different content_hash."""
        elements = _make_sc3f_elements()
        payload_a = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="SC_3F",
            elements=elements,
            legend=_make_legend(),
        )
        payload_b = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="LOAD_FLOW",
            elements=elements,
            legend=_make_legend(),
        )
        assert payload_a.content_hash() != payload_b.content_hash()

    def test_hash_is_stable_across_serialization(self) -> None:
        """content_hash is stable after JSON round-trip."""
        payload = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="SC_3F",
            elements=_make_sc3f_elements(),
            legend=_make_legend(),
        )
        hash_before = payload.content_hash()

        # Round-trip through JSON
        json_str = payload.model_dump_json()
        restored = OverlayPayloadV1.model_validate_json(json_str)

        assert restored.content_hash() == hash_before

    def test_content_hash_is_sha256(self) -> None:
        """content_hash returns a valid SHA-256 hex string."""
        payload = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="SC_3F",
            elements=_make_sc3f_elements(),
            legend=_make_legend(),
        )
        hash_value = payload.content_hash()
        assert len(hash_value) == 64
        assert all(c in "0123456789abcdef" for c in hash_value)


# =============================================================================
# ELEMENT INTEGRITY TESTS
# =============================================================================


class TestOverlayElements:
    """Overlay contains only elements with valid references."""

    def test_element_refs_returns_all_refs(self) -> None:
        """element_refs() returns frozenset of all element_ref values."""
        payload = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="SC_3F",
            elements=_make_sc3f_elements(),
            legend=_make_legend(),
        )
        refs = payload.element_refs()
        assert refs == frozenset({"bus-001", "bus-002", "line-001"})

    def test_get_element_returns_correct_element(self) -> None:
        """get_element() returns the matching element."""
        payload = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="SC_3F",
            elements=_make_sc3f_elements(),
            legend=_make_legend(),
        )
        element = payload.get_element("bus-002")
        assert element is not None
        assert element.visual_state == "WARNING"
        assert element.color_token == "warning"

    def test_get_element_returns_none_for_missing(self) -> None:
        """get_element() returns None for non-existent element."""
        payload = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="SC_3F",
            elements=_make_sc3f_elements(),
            legend=_make_legend(),
        )
        assert payload.get_element("nonexistent-element") is None

    def test_empty_overlay_has_no_elements(self) -> None:
        """Empty overlay has zero elements."""
        payload = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="SC_3F",
            elements=[],
            legend=[],
        )
        assert len(payload.elements) == 0
        assert payload.element_refs() == frozenset()

    def test_visual_state_is_valid_literal(self) -> None:
        """All visual_state values are valid literals."""
        valid_states = {"OK", "WARNING", "CRITICAL", "INACTIVE"}
        for element in _make_sc3f_elements():
            assert element.visual_state in valid_states

    def test_load_flow_elements_have_correct_badges(self) -> None:
        """LOAD_FLOW elements have voltage/loading badges."""
        payload = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="LOAD_FLOW",
            elements=_make_load_flow_elements(),
            legend=_make_legend(),
        )
        bus = payload.get_element("bus-001")
        assert bus is not None
        assert "u_pu" in bus.numeric_badges
        assert "u_kv" in bus.numeric_badges


# =============================================================================
# NO HEX COLORS TESTS
# =============================================================================


class TestNoHexColors:
    """Overlay payload must not contain hex color values."""

    def test_no_hex_colors_in_sc3f_payload(self) -> None:
        """SC_3F overlay has no hex colors."""
        payload = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="SC_3F",
            elements=_make_sc3f_elements(),
            legend=_make_legend(),
        )
        json_str = payload.model_dump_json()
        assert not HEX_COLOR_PATTERN.search(
            json_str
        ), f"Hex color found in overlay payload: {json_str}"

    def test_no_hex_colors_in_load_flow_payload(self) -> None:
        """LOAD_FLOW overlay has no hex colors."""
        payload = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="LOAD_FLOW",
            elements=_make_load_flow_elements(),
            legend=_make_legend(),
        )
        json_str = payload.model_dump_json()
        assert not HEX_COLOR_PATTERN.search(
            json_str
        ), f"Hex color found in overlay payload: {json_str}"

    def test_color_tokens_are_semantic(self) -> None:
        """All color_token values are semantic tokens, not hex."""
        valid_tokens = {"ok", "warning", "critical", "inactive"}
        for element in _make_sc3f_elements():
            assert (
                element.color_token in valid_tokens
            ), f"Non-semantic color_token: {element.color_token}"


# =============================================================================
# NO PHYSICS VALUES TESTS
# =============================================================================


class TestNoPhysicsOutsideBadges:
    """No physics values exist outside numeric_badges."""

    def test_overlay_element_has_no_physics_fields(self) -> None:
        """OverlayElement schema has no direct physics fields."""
        field_names = set(OverlayElement.model_fields.keys())
        physics_fields = {
            "voltage",
            "current",
            "impedance",
            "power",
            "resistance",
            "reactance",
            "frequency",
        }
        assert (
            field_names & physics_fields == set()
        ), f"Physics fields found in OverlayElement: {field_names & physics_fields}"

    def test_numeric_badges_contain_only_display_values(self) -> None:
        """numeric_badges contain only float or None values."""
        for element in _make_sc3f_elements():
            for key, value in element.numeric_badges.items():
                assert value is None or isinstance(
                    value, int | float
                ), f"Invalid badge value type for {key}: {type(value)}"


# =============================================================================
# LEGEND TESTS
# =============================================================================


class TestOverlayLegend:
    """Legend entries comply with contract."""

    def test_legend_entries_have_required_fields(self) -> None:
        """All legend entries have color_token and label."""
        for entry in _make_legend():
            assert entry.color_token
            assert entry.label

    def test_legend_tokens_match_element_tokens(self) -> None:
        """Legend color_tokens cover all element color_tokens."""
        elements = _make_sc3f_elements()
        legend = _make_legend()

        element_tokens = {e.color_token for e in elements}
        legend_tokens = {e.color_token for e in legend}

        assert element_tokens.issubset(
            legend_tokens
        ), f"Element tokens not covered by legend: {element_tokens - legend_tokens}"

    def test_legend_description_is_optional(self) -> None:
        """Legend description can be None."""
        legend = _make_legend()
        inactive_entry = next(e for e in legend if e.color_token == "inactive")
        assert inactive_entry.description is None


# =============================================================================
# BUILD FUNCTION TESTS
# =============================================================================


class TestBuildOverlayPayload:
    """build_overlay_payload factory function."""

    def test_creates_valid_payload(self) -> None:
        """Factory creates a valid OverlayPayloadV1."""
        payload = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="SC_3F",
            elements=_make_sc3f_elements(),
            legend=_make_legend(),
        )
        assert isinstance(payload, OverlayPayloadV1)
        assert payload.run_id == RUN_ID_1
        assert payload.analysis_type == "SC_3F"
        assert len(payload.elements) == 3
        assert len(payload.legend) == 4

    def test_empty_payload_is_valid(self) -> None:
        """Empty overlay payload is valid."""
        payload = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="SC_3F",
            elements=[],
            legend=[],
        )
        assert payload.run_id == RUN_ID_1
        assert len(payload.elements) == 0
        assert len(payload.legend) == 0

    def test_payload_is_serializable(self) -> None:
        """Payload can be serialized to JSON and back."""
        payload = build_overlay_payload(
            run_id=RUN_ID_1,
            analysis_type="LOAD_FLOW",
            elements=_make_load_flow_elements(),
            legend=_make_legend(),
        )
        json_str = payload.model_dump_json()
        restored = OverlayPayloadV1.model_validate_json(json_str)
        assert restored.run_id == payload.run_id
        assert restored.analysis_type == payload.analysis_type
        assert len(restored.elements) == len(payload.elements)
        assert len(restored.legend) == len(payload.legend)
