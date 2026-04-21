"""Tests for readiness_fix_actions — FixAction resolver for all readiness codes.

Ensures:
- Every BLOCKER code has a FixAction (resolve_fix_action returns non-None)
- FixActions have valid action_type values
- Prefix matching works for parametric codes
- check_blocker_fix_action_coverage returns empty list
"""

import pytest
from domain.readiness_fix_actions import (
    KNOWN_BLOCKER_CODES,
    KNOWN_BLOCKER_PREFIXES,
    check_blocker_fix_action_coverage,
    resolve_fix_action,
)
from enm.fix_actions import FixAction

VALID_ACTION_TYPES = frozenset(
    {
        "OPEN_MODAL",
        "NAVIGATE_TO_ELEMENT",
        "SELECT_CATALOG",
        "ADD_MISSING_DEVICE",
    }
)


class TestResolveFixAction:
    """Test resolve_fix_action for individual codes."""

    @pytest.mark.parametrize(
        "code",
        [
            "catalog.ref_missing",
            "generator.connection_variant_missing",
            "generator.station_ref_missing",
            "generator.station_ref_invalid",
            "generator.block_transformer_missing",
            "generator.block_transformer_invalid",
            "generator.connection_variant_invalid",
        ],
    )
    def test_generator_codes_have_fix_action(self, code: str) -> None:
        result = resolve_fix_action(code, element_id="gen-1")
        assert result is not None, f"Code {code!r} must have a FixAction"
        assert isinstance(result, FixAction)
        assert result.action_type in VALID_ACTION_TYPES

    @pytest.mark.parametrize(
        "code",
        [
            "station.nn_without_transformer",
            "protection.binding_missing",
            "generator.nn_variant_requires_station_transformer",
            "generator.block_variant_requires_block_transformer",
            "generator.block_transformer_catalog_missing",
        ],
    )
    def test_station_field_codes_have_fix_action(self, code: str) -> None:
        result = resolve_fix_action(code, element_id="station-1")
        assert result is not None, f"Code {code!r} must have a FixAction"
        assert isinstance(result, FixAction)
        assert result.action_type in VALID_ACTION_TYPES

    @pytest.mark.parametrize(
        "code",
        [
            "E003",
            "W005",
            "W006",
            "W007",
            "W008",
        ],
    )
    def test_topology_codes_have_fix_action(self, code: str) -> None:
        result = resolve_fix_action(code, element_id="bus-1")
        assert result is not None, f"Code {code!r} must have a FixAction"
        assert isinstance(result, FixAction)
        assert result.action_type in VALID_ACTION_TYPES

    def test_prefix_matching_for_field_device_missing(self) -> None:
        result = resolve_fix_action("field.device_missing.cb", element_id="field-1")
        assert result is not None
        assert result.action_type == "ADD_MISSING_DEVICE"
        assert result.element_ref == "field-1"

    def test_prefix_matching_for_fuse(self) -> None:
        result = resolve_fix_action("field.device_missing.fuse", element_id="field-2")
        assert result is not None
        assert result.action_type == "ADD_MISSING_DEVICE"

    def test_unknown_code_returns_none(self) -> None:
        result = resolve_fix_action("unknown.code", element_id="x")
        assert result is None

    def test_element_ref_propagated(self) -> None:
        result = resolve_fix_action("catalog.ref_missing", element_id="gen-42")
        assert result is not None
        assert result.element_ref == "gen-42"


class TestBlockerFixActionCoverage:
    """CI guard: every known BLOCKER must have a FixAction."""

    def test_all_blockers_have_fix_actions(self) -> None:
        """This test MUST pass in CI. Any missing FixAction = CI failure."""
        missing = check_blocker_fix_action_coverage()
        assert missing == [], (
            f"The following BLOCKER codes have no FixAction: {missing}. "
            "Add them to _FIX_ACTION_MAP in readiness_fix_actions.py."
        )

    def test_known_blocker_codes_not_empty(self) -> None:
        assert len(KNOWN_BLOCKER_CODES) >= 20, "Expected at least 20 known BLOCKER codes"

    def test_known_blocker_prefixes_not_empty(self) -> None:
        assert len(KNOWN_BLOCKER_PREFIXES) >= 1


class TestFixActionDeterminism:
    """Same code + element → same FixAction (100x)."""

    def test_deterministic_100x(self) -> None:
        code = "generator.connection_variant_missing"
        first = resolve_fix_action(code, element_id="gen-1")
        assert first is not None
        for _ in range(99):
            result = resolve_fix_action(code, element_id="gen-1")
            assert result is not None
            assert result.action_type == first.action_type
            assert result.element_ref == first.element_ref
            assert result.modal_type == first.modal_type
