"""
Tests — PR-30: Protection SLD Overlay Pro

Coverage:
- TestBasicOverlay: relay → overlay element mapping
- TestTokens: color/stroke token correctness
- TestBadges: numeric badge values
- TestCoordinationOverlay: margin badges from coordination result
- TestDeterminism: hash stability, element ordering
- TestPermutationInvariance: relay order independence
- TestNoGeometryModification: verify overlay is token-only
- TestLegend: Polish legend entries
"""

from __future__ import annotations

from uuid import uuid4

from application.result_mapping.protection_to_overlay_v1 import (
    PROTECTION_LEGEND_PL,
    map_protection_to_overlay_v1,
)
from domain.protection_coordination_v1 import (
    ProtectionSelectivityPair,
    compute_coordination_v1,
)
from domain.protection_engine_v1 import (
    CTRatio,
    Function50Settings,
    Function51Settings,
    IECCurveTypeV1,
    ProtectionStudyInputV1,
    RelayV1,
    TestPoint,
    execute_protection_v1,
)

# =============================================================================
# FIXTURES
# =============================================================================


def _make_relay(
    relay_id: str,
    cb_id: str,
    *,
    ct_primary: float = 400.0,
    ct_secondary: float = 5.0,
    f51_pickup: float = 1.0,
    f51_tms: float = 0.3,
    f51_curve: IECCurveTypeV1 = IECCurveTypeV1.STANDARD_INVERSE,
    f50_enabled: bool = False,
    f50_pickup: float = 10.0,
    f50_trip_s: float | None = 0.05,
) -> RelayV1:
    f50 = None
    if f50_enabled:
        f50 = Function50Settings(
            enabled=True,
            pickup_a_secondary=f50_pickup,
            t_trip_s=f50_trip_s,
        )
    return RelayV1(
        relay_id=relay_id,
        attached_cb_id=cb_id,
        ct_ratio=CTRatio(primary_a=ct_primary, secondary_a=ct_secondary),
        f51=Function51Settings(
            curve_type=f51_curve,
            pickup_a_secondary=f51_pickup,
            tms=f51_tms,
        ),
        f50=f50,
    )


def _make_test_points(*currents: float) -> tuple[TestPoint, ...]:
    return tuple(
        TestPoint(point_id=f"tp-{i:02d}", i_a_primary=c) for i, c in enumerate(currents, 1)
    )


def _run_protection(relays, test_points):
    study_input = ProtectionStudyInputV1(relays=relays, test_points=test_points)
    return execute_protection_v1(study_input)


# =============================================================================
# TEST: BASIC OVERLAY
# =============================================================================


class TestBasicOverlay:
    """Verify basic relay → overlay element mapping."""

    def test_single_relay_produces_one_element(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay,), test_points)
        run_id = uuid4()

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=run_id,
        )

        assert len(overlay.elements) == 1
        assert overlay.elements[0].element_ref == "cb-001"
        assert overlay.elements[0].element_type == "Switch"

    def test_element_ref_is_cb_id(self):
        """Overlay element_ref is the CB ID, not relay ID."""
        relay = _make_relay("relay-001", "switch-009")
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay,), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        assert overlay.elements[0].element_ref == "switch-009"

    def test_run_id_binding(self):
        """Overlay run_id matches input run_id."""
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay,), test_points)
        run_id = uuid4()

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=run_id,
        )

        assert overlay.run_id == run_id

    def test_analysis_type_is_protection(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay,), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        assert overlay.analysis_type == "PROTECTION"

    def test_multiple_relays(self):
        relay1 = _make_relay("relay-001", "cb-001")
        relay2 = _make_relay("relay-002", "cb-002")
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay1, relay2), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        assert len(overlay.elements) == 2


# =============================================================================
# TEST: TOKENS
# =============================================================================


class TestTokens:
    """Verify correct token assignment."""

    def test_f51_trip_gets_active_token(self):
        """F51 trip → protection_active color token."""
        relay = _make_relay("relay-001", "cb-001", f51_tms=0.3)
        test_points = _make_test_points(2000.0)  # Will trip F51
        result = _run_protection((relay,), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        el = overlay.elements[0]
        assert el.color_token == "protection_active"
        assert el.visual_state == "OK"
        assert el.stroke_token == "normal"

    def test_f50_pickup_gets_f50_token(self):
        """F50 pickup → protection_f50 color token."""
        relay = _make_relay(
            "relay-001",
            "cb-001",
            f50_enabled=True,
            f50_pickup=5.0,
            f50_trip_s=0.05,
        )
        test_points = _make_test_points(5000.0)  # High current to trigger F50
        result = _run_protection((relay,), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        el = overlay.elements[0]
        assert el.color_token == "protection_f50"
        assert el.visual_state == "CRITICAL"
        assert el.stroke_token == "bold"

    def test_no_trip_gets_inactive_token(self):
        """No trip → protection_inactive color token."""
        relay = _make_relay(
            "relay-001",
            "cb-001",
            ct_primary=400.0,
            ct_secondary=5.0,
            f51_pickup=50.0,
            f51_tms=0.3,  # Very high pickup
        )
        test_points = _make_test_points(100.0)  # Low current, no trip
        result = _run_protection((relay,), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        el = overlay.elements[0]
        assert el.color_token == "protection_inactive"
        assert el.visual_state == "INACTIVE"

    def test_no_animation_in_v1(self):
        """No animation tokens in v1."""
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay,), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        for el in overlay.elements:
            assert el.animation_token is None


# =============================================================================
# TEST: BADGES
# =============================================================================


class TestBadges:
    """Verify numeric badge values."""

    def test_f51_trip_time_badge(self):
        relay = _make_relay("relay-001", "cb-001", f51_tms=0.3)
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay,), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        badges = overlay.elements[0].numeric_badges
        assert "t51_s" in badges
        assert badges["t51_s"] is not None
        assert badges["t51_s"] > 0

    def test_f50_trip_time_badge(self):
        relay = _make_relay(
            "relay-001",
            "cb-001",
            f50_enabled=True,
            f50_pickup=5.0,
            f50_trip_s=0.05,
        )
        test_points = _make_test_points(5000.0)
        result = _run_protection((relay,), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        badges = overlay.elements[0].numeric_badges
        assert "t50_s" in badges
        assert badges["t50_s"] == 0.05

    def test_pickup_current_badge(self):
        relay = _make_relay("relay-001", "cb-001", f51_pickup=2.5)
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay,), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        badges = overlay.elements[0].numeric_badges
        assert "i_pickup_a" in badges
        assert badges["i_pickup_a"] == 2.5

    def test_no_trip_badges_are_none(self):
        relay = _make_relay(
            "relay-001",
            "cb-001",
            f51_pickup=50.0,  # Very high pickup
        )
        test_points = _make_test_points(100.0)  # Low current
        result = _run_protection((relay,), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        badges = overlay.elements[0].numeric_badges
        assert badges["t51_s"] is None
        assert badges["t50_s"] is None


# =============================================================================
# TEST: COORDINATION OVERLAY
# =============================================================================


class TestCoordinationOverlay:
    """Verify margin badges from coordination result."""

    def test_margin_badges_included(self):
        """When coordination result provided, margin badges appear."""
        relay1 = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        relay2 = _make_relay("relay-002", "cb-002", f51_tms=0.3)
        test_points = _make_test_points(2000.0, 4000.0)
        prot_result = _run_protection((relay1, relay2), test_points)

        pairs = (ProtectionSelectivityPair("pair-001", "relay-002", "relay-001"),)
        coord_result = compute_coordination_v1(
            pairs=pairs,
            protection_result=prot_result,
        )

        overlay = map_protection_to_overlay_v1(
            protection_result=prot_result,
            run_id=uuid4(),
            coordination_result=coord_result,
        )

        # Both relays should have margin badges
        for el in overlay.elements:
            assert "margin_min_s" in el.numeric_badges
            assert "margin_max_s" in el.numeric_badges

    def test_no_coordination_no_margin_badges(self):
        """Without coordination result, no margin badges."""
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay,), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        badges = overlay.elements[0].numeric_badges
        assert "margin_min_s" not in badges
        assert "margin_max_s" not in badges

    def test_active_pair_filter(self):
        """active_pair_id filters coordination margins to specific pair."""
        relay_a = _make_relay("relay-A", "cb-A", f51_tms=0.1)
        relay_b = _make_relay("relay-B", "cb-B", f51_tms=0.3)
        relay_c = _make_relay("relay-C", "cb-C", f51_tms=0.5)
        test_points = _make_test_points(2000.0)
        prot_result = _run_protection((relay_a, relay_b, relay_c), test_points)

        pairs = (
            ProtectionSelectivityPair("pair-001", "relay-B", "relay-A"),
            ProtectionSelectivityPair("pair-002", "relay-C", "relay-B"),
        )
        coord_result = compute_coordination_v1(
            pairs=pairs,
            protection_result=prot_result,
        )

        # Filter to pair-001 only
        overlay = map_protection_to_overlay_v1(
            protection_result=prot_result,
            run_id=uuid4(),
            coordination_result=coord_result,
            active_pair_id="pair-001",
        )

        # relay-C should NOT have margin badges (not in pair-001)
        cb_c_el = next(el for el in overlay.elements if el.element_ref == "cb-C")
        assert "margin_min_s" not in cb_c_el.numeric_badges


# =============================================================================
# TEST: DETERMINISM
# =============================================================================


class TestDeterminism:
    """Verify deterministic output."""

    def test_identical_inputs_identical_hash(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay,), test_points)
        run_id = uuid4()

        overlay1 = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=run_id,
        )
        overlay2 = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=run_id,
        )

        assert overlay1.content_hash() == overlay2.content_hash()

    def test_elements_sorted_by_element_ref(self):
        """Elements are sorted lexicographically by element_ref (CB ID)."""
        relay1 = _make_relay("relay-001", "cb-ZZZ")
        relay2 = _make_relay("relay-002", "cb-AAA")
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay1, relay2), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        refs = [el.element_ref for el in overlay.elements]
        assert refs == sorted(refs)
        assert refs[0] == "cb-AAA"
        assert refs[1] == "cb-ZZZ"


# =============================================================================
# TEST: PERMUTATION INVARIANCE
# =============================================================================


class TestPermutationInvariance:
    """Verify output is independent of relay input ordering."""

    def test_relay_order_does_not_affect_overlay(self):
        relay1 = _make_relay("relay-001", "cb-001", f51_tms=0.1)
        relay2 = _make_relay("relay-002", "cb-002", f51_tms=0.3)
        test_points = _make_test_points(2000.0)
        run_id = uuid4()

        result_fwd = _run_protection((relay1, relay2), test_points)
        result_rev = _run_protection((relay2, relay1), test_points)

        overlay_fwd = map_protection_to_overlay_v1(
            protection_result=result_fwd,
            run_id=run_id,
        )
        overlay_rev = map_protection_to_overlay_v1(
            protection_result=result_rev,
            run_id=run_id,
        )

        assert overlay_fwd.content_hash() == overlay_rev.content_hash()


# =============================================================================
# TEST: NO GEOMETRY MODIFICATION
# =============================================================================


class TestNoGeometryModification:
    """Verify overlay is token-only — no geometry data."""

    def test_no_geometry_fields(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay,), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        for el in overlay.elements:
            el_dict = el.model_dump()
            # No geometry-related fields
            for forbidden_key in (
                "x",
                "y",
                "width",
                "height",
                "position",
                "geometry",
                "coordinates",
                "path",
            ):
                assert forbidden_key not in el_dict

    def test_only_token_fields(self):
        """Elements contain only known token fields."""
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay,), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        for el in overlay.elements:
            el_dict = el.model_dump()
            allowed = {
                "element_ref",
                "element_type",
                "visual_state",
                "numeric_badges",
                "color_token",
                "stroke_token",
                "animation_token",
            }
            assert set(el_dict.keys()) == allowed


# =============================================================================
# TEST: LEGEND
# =============================================================================


class TestLegend:
    """Verify Polish legend entries."""

    def test_legend_is_polish(self):
        relay = _make_relay("relay-001", "cb-001")
        test_points = _make_test_points(2000.0)
        result = _run_protection((relay,), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        assert len(overlay.legend) == len(PROTECTION_LEGEND_PL)
        for entry in overlay.legend:
            assert entry.label  # Non-empty
            assert entry.color_token  # Non-empty

    def test_legend_tokens_match_elements(self):
        """Legend color tokens are a superset of element color tokens."""
        relay1 = _make_relay("relay-001", "cb-001")
        relay2 = _make_relay(
            "relay-002",
            "cb-002",
            f50_enabled=True,
            f50_pickup=5.0,
            f50_trip_s=0.05,
        )
        test_points = _make_test_points(5000.0)
        result = _run_protection((relay1, relay2), test_points)

        overlay = map_protection_to_overlay_v1(
            protection_result=result,
            run_id=uuid4(),
        )

        legend_tokens = {entry.color_token for entry in overlay.legend}
        element_tokens = {el.color_token for el in overlay.elements}
        assert element_tokens.issubset(legend_tokens)
