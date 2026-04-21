"""
Tests for SC Comparison -> OverlayPayloadV1 Mapper (PR-21)

INVARIANTS UNDER TEST:
1. Determinism: same comparison -> identical overlay -> identical content_hash
2. Independence from input order: shuffled deltas -> same sorted output
3. No hex colors in output
4. Legend entries are Polish, from DELTA_LEGEND_PL
5. Elements sorted lexicographically by element_ref
6. Visual state: OK for zero deltas, WARNING for nonzero
7. Golden fixture: comparison with real deltas + comparison without changes
"""

from __future__ import annotations

import re
from datetime import UTC, datetime
from uuid import UUID

from application.result_mapping.sc_comparison_to_overlay_v1 import (
    compute_delta_overlay_content_hash,
    map_sc_comparison_to_overlay_v1,
)
from domain.execution import ExecutionAnalysisType
from domain.sc_comparison import (
    ShortCircuitComparison,
    compute_numeric_delta,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

HEX_COLOR_RE = re.compile(r"#[0-9a-fA-F]{3,8}")

FIXED_COMPARISON_ID = UUID("00000000-0000-0000-0000-000000000001")
FIXED_CASE_ID = UUID("00000000-0000-0000-0000-000000000002")
FIXED_BASE_SCENARIO_ID = UUID("00000000-0000-0000-0000-000000000003")
FIXED_OTHER_SCENARIO_ID = UUID("00000000-0000-0000-0000-000000000004")
FIXED_TIMESTAMP = datetime(2025, 1, 15, 12, 0, 0, tzinfo=UTC)


def _make_comparison_with_deltas() -> ShortCircuitComparison:
    """Golden fixture: comparison with real numeric deltas."""
    return ShortCircuitComparison(
        comparison_id=FIXED_COMPARISON_ID,
        study_case_id=FIXED_CASE_ID,
        analysis_type=ExecutionAnalysisType.SC_3F,
        base_scenario_id=FIXED_BASE_SCENARIO_ID,
        other_scenario_id=FIXED_OTHER_SCENARIO_ID,
        created_at=FIXED_TIMESTAMP,
        input_hash="aabbccdd" * 8,
        deltas_global={
            "ikss_a": compute_numeric_delta(1000.0, 1050.0),
            "sk_mva": compute_numeric_delta(500.0, 520.0),
        },
        deltas_by_source=(
            {
                "element_ref": "source_B",
                "deltas": {
                    "i_contrib_a": {"base": 400.0, "other": 420.0, "abs": 20.0, "rel": 0.05},
                },
            },
            {
                "element_ref": "source_A",
                "deltas": {
                    "i_contrib_a": {"base": 600.0, "other": 630.0, "abs": 30.0, "rel": 0.05},
                },
            },
        ),
        deltas_by_branch=(
            {
                "element_ref": "branch_C",
                "deltas": {
                    "i_contrib_a": {"base": 200.0, "other": 200.0, "abs": 0.0, "rel": 0.0},
                },
            },
        ),
    )


def _make_comparison_no_changes() -> ShortCircuitComparison:
    """Golden fixture: comparison with zero deltas (no changes)."""
    return ShortCircuitComparison(
        comparison_id=FIXED_COMPARISON_ID,
        study_case_id=FIXED_CASE_ID,
        analysis_type=ExecutionAnalysisType.SC_3F,
        base_scenario_id=FIXED_BASE_SCENARIO_ID,
        other_scenario_id=FIXED_OTHER_SCENARIO_ID,
        created_at=FIXED_TIMESTAMP,
        input_hash="11223344" * 8,
        deltas_global={
            "ikss_a": compute_numeric_delta(1000.0, 1000.0),
        },
        deltas_by_source=(
            {
                "element_ref": "source_A",
                "deltas": {
                    "i_contrib_a": {"base": 500.0, "other": 500.0, "abs": 0.0, "rel": 0.0},
                },
            },
        ),
        deltas_by_branch=(),
    )


# ---------------------------------------------------------------------------
# Tests: Determinism
# ---------------------------------------------------------------------------


class TestDeterminism:
    """Same comparison input must produce identical overlay and hash."""

    def test_identical_output_on_repeat(self) -> None:
        comparison = _make_comparison_with_deltas()

        overlay_1 = map_sc_comparison_to_overlay_v1(comparison)
        overlay_2 = map_sc_comparison_to_overlay_v1(comparison)

        hash_1 = compute_delta_overlay_content_hash(overlay_1)
        hash_2 = compute_delta_overlay_content_hash(overlay_2)

        assert hash_1 == hash_2
        assert overlay_1.model_dump() == overlay_2.model_dump()

    def test_identical_hash_on_repeat_no_changes(self) -> None:
        comparison = _make_comparison_no_changes()

        overlay_1 = map_sc_comparison_to_overlay_v1(comparison)
        overlay_2 = map_sc_comparison_to_overlay_v1(comparison)

        assert compute_delta_overlay_content_hash(overlay_1) == compute_delta_overlay_content_hash(
            overlay_2
        )

    def test_different_comparison_different_hash(self) -> None:
        comp_with = _make_comparison_with_deltas()
        comp_without = _make_comparison_no_changes()

        overlay_with = map_sc_comparison_to_overlay_v1(comp_with)
        overlay_without = map_sc_comparison_to_overlay_v1(comp_without)

        hash_with = compute_delta_overlay_content_hash(overlay_with)
        hash_without = compute_delta_overlay_content_hash(overlay_without)

        assert hash_with != hash_without


# ---------------------------------------------------------------------------
# Tests: Element Sorting
# ---------------------------------------------------------------------------


class TestElementSorting:
    """Elements must be sorted lexicographically by element_ref."""

    def test_elements_sorted_lexicographically(self) -> None:
        comparison = _make_comparison_with_deltas()
        overlay = map_sc_comparison_to_overlay_v1(comparison)

        refs = [e.element_ref for e in overlay.elements]
        assert refs == sorted(refs)

    def test_source_before_branch_if_lex_order(self) -> None:
        """source_A < source_B alphabetically; branch_C after."""
        comparison = _make_comparison_with_deltas()
        overlay = map_sc_comparison_to_overlay_v1(comparison)

        refs = [e.element_ref for e in overlay.elements]
        # branch_C, source_A, source_B (lexicographic)
        assert refs == ["branch_C", "source_A", "source_B"]


# ---------------------------------------------------------------------------
# Tests: Visual State
# ---------------------------------------------------------------------------


class TestVisualState:
    """Visual state must reflect delta magnitude."""

    def test_nonzero_delta_gives_warning(self) -> None:
        comparison = _make_comparison_with_deltas()
        overlay = map_sc_comparison_to_overlay_v1(comparison)

        # source_A and source_B have nonzero deltas
        source_a = next(e for e in overlay.elements if e.element_ref == "source_A")
        source_b = next(e for e in overlay.elements if e.element_ref == "source_B")

        assert source_a.visual_state == "WARNING"
        assert source_b.visual_state == "WARNING"
        assert source_a.color_token == "delta_change"
        assert source_b.color_token == "delta_change"
        assert source_a.stroke_token == "bold"

    def test_zero_delta_gives_ok(self) -> None:
        comparison = _make_comparison_with_deltas()
        overlay = map_sc_comparison_to_overlay_v1(comparison)

        # branch_C has zero delta
        branch_c = next(e for e in overlay.elements if e.element_ref == "branch_C")

        assert branch_c.visual_state == "OK"
        assert branch_c.color_token == "delta_none"
        assert branch_c.stroke_token == "normal"

    def test_all_zero_deltas_all_ok(self) -> None:
        comparison = _make_comparison_no_changes()
        overlay = map_sc_comparison_to_overlay_v1(comparison)

        for e in overlay.elements:
            assert e.visual_state == "OK"
            assert e.color_token == "delta_none"


# ---------------------------------------------------------------------------
# Tests: No Hex Colors
# ---------------------------------------------------------------------------


class TestNoHexColors:
    """Overlay must contain ZERO hex color strings."""

    def test_no_hex_in_overlay_with_deltas(self) -> None:
        comparison = _make_comparison_with_deltas()
        overlay = map_sc_comparison_to_overlay_v1(comparison)

        payload_str = overlay.model_dump_json()
        assert not HEX_COLOR_RE.search(
            payload_str
        ), f"Hex color found in overlay: {HEX_COLOR_RE.findall(payload_str)}"

    def test_no_hex_in_overlay_no_changes(self) -> None:
        comparison = _make_comparison_no_changes()
        overlay = map_sc_comparison_to_overlay_v1(comparison)

        payload_str = overlay.model_dump_json()
        assert not HEX_COLOR_RE.search(payload_str)


# ---------------------------------------------------------------------------
# Tests: Legend (Polish)
# ---------------------------------------------------------------------------


class TestLegend:
    """Legend must be Polish, from backend, with expected entries."""

    def test_legend_has_three_entries(self) -> None:
        comparison = _make_comparison_with_deltas()
        overlay = map_sc_comparison_to_overlay_v1(comparison)

        assert len(overlay.legend) == 3

    def test_legend_labels_polish(self) -> None:
        comparison = _make_comparison_with_deltas()
        overlay = map_sc_comparison_to_overlay_v1(comparison)

        labels = {e.label for e in overlay.legend}
        assert "Bez zmian" in labels
        assert "Zmiana" in labels
        assert "Brak danych" in labels

    def test_legend_tokens_are_delta_tokens(self) -> None:
        comparison = _make_comparison_with_deltas()
        overlay = map_sc_comparison_to_overlay_v1(comparison)

        tokens = {e.color_token for e in overlay.legend}
        assert tokens == {"delta_none", "delta_change", "delta_inactive"}

    def test_legend_descriptions_present(self) -> None:
        comparison = _make_comparison_with_deltas()
        overlay = map_sc_comparison_to_overlay_v1(comparison)

        for entry in overlay.legend:
            assert entry.description is not None
            assert len(entry.description) > 0


# ---------------------------------------------------------------------------
# Tests: Overlay Contract Shape
# ---------------------------------------------------------------------------


class TestOverlayContractShape:
    """Overlay payload must conform to OverlayPayloadV1 contract."""

    def test_analysis_type_prefix(self) -> None:
        comparison = _make_comparison_with_deltas()
        overlay = map_sc_comparison_to_overlay_v1(comparison)

        assert overlay.analysis_type == "DELTA_SC_3F"

    def test_run_id_is_comparison_id(self) -> None:
        comparison = _make_comparison_with_deltas()
        overlay = map_sc_comparison_to_overlay_v1(comparison)

        assert overlay.run_id == comparison.comparison_id

    def test_numeric_badges_present_for_changed_element(self) -> None:
        comparison = _make_comparison_with_deltas()
        overlay = map_sc_comparison_to_overlay_v1(comparison)

        source_a = next(e for e in overlay.elements if e.element_ref == "source_A")
        assert "i_contrib_a_base" in source_a.numeric_badges
        assert "i_contrib_a_other" in source_a.numeric_badges
        assert "i_contrib_a_abs" in source_a.numeric_badges
        assert "i_contrib_a_rel" in source_a.numeric_badges

    def test_no_animation_tokens(self) -> None:
        """Delta overlay v1 does not use animations."""
        comparison = _make_comparison_with_deltas()
        overlay = map_sc_comparison_to_overlay_v1(comparison)

        for e in overlay.elements:
            assert e.animation_token is None

    def test_content_hash_is_sha256(self) -> None:
        comparison = _make_comparison_with_deltas()
        overlay = map_sc_comparison_to_overlay_v1(comparison)

        h = compute_delta_overlay_content_hash(overlay)
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)


# ---------------------------------------------------------------------------
# Tests: Order Independence
# ---------------------------------------------------------------------------


class TestOrderIndependence:
    """Overlay must be identical regardless of input delta ordering."""

    def test_reversed_sources_same_output(self) -> None:
        """Reversing deltas_by_source order must not change overlay."""
        comp = _make_comparison_with_deltas()

        # Create reversed version
        comp_reversed = ShortCircuitComparison(
            comparison_id=comp.comparison_id,
            study_case_id=comp.study_case_id,
            analysis_type=comp.analysis_type,
            base_scenario_id=comp.base_scenario_id,
            other_scenario_id=comp.other_scenario_id,
            created_at=comp.created_at,
            input_hash=comp.input_hash,
            deltas_global=comp.deltas_global,
            deltas_by_source=tuple(reversed(comp.deltas_by_source)),
            deltas_by_branch=comp.deltas_by_branch,
        )

        overlay_original = map_sc_comparison_to_overlay_v1(comp)
        overlay_reversed = map_sc_comparison_to_overlay_v1(comp_reversed)

        assert overlay_original.model_dump() == overlay_reversed.model_dump()
        assert compute_delta_overlay_content_hash(
            overlay_original
        ) == compute_delta_overlay_content_hash(overlay_reversed)


# ---------------------------------------------------------------------------
# Tests: Empty Comparison
# ---------------------------------------------------------------------------


class TestEmptyComparison:
    """Comparison with no per-element deltas."""

    def test_empty_deltas_produce_empty_elements(self) -> None:
        comp = ShortCircuitComparison(
            comparison_id=FIXED_COMPARISON_ID,
            study_case_id=FIXED_CASE_ID,
            analysis_type=ExecutionAnalysisType.SC_3F,
            base_scenario_id=FIXED_BASE_SCENARIO_ID,
            other_scenario_id=FIXED_OTHER_SCENARIO_ID,
            created_at=FIXED_TIMESTAMP,
            input_hash="00" * 32,
            deltas_global={},
            deltas_by_source=(),
            deltas_by_branch=(),
        )

        overlay = map_sc_comparison_to_overlay_v1(comp)
        assert len(overlay.elements) == 0
        assert len(overlay.legend) == 3  # Legend always present
