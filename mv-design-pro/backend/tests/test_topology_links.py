"""
Tests — PR-29: Topology Links (Relay↔CB↔Target ID Mapping)

Coverage:
- TestTopologyLinkCreation: valid link creation, field access
- TestTopologyLinkValidation: empty IDs, self-reference errors
- TestTopologyLinkSet: set construction, sorting, signature
- TestValidateTopologyLinks: duplicate detection, relay-CB mapping
- TestBuildTopologyLinkSet: factory with validation + signature
- TestResolveRelayToCB: relay → CB resolution
- TestResolveCBToTarget: CB → target resolution
- TestResolveRelayToTarget: relay → (CB, target) resolution
- TestGetLinksByStation: station-based filtering
- TestDeterminism: hash stability, input ordering independence
- TestSerialization: roundtrip for all types
- TestWhiteBoxTrace: trace content verification
- TestEmptyLinkSet: edge case with no links
- TestMultipleLinksPerStation: multiple links same station
"""

from __future__ import annotations

import pytest
from domain.topology_links import (
    DuplicateLinkError,
    EmptyIdError,
    OrphanRelayError,
    SelfReferenceError,
    TopologyLink,
    TopologyLinkError,
    TopologyLinkSet,
    build_topology_link_set,
    get_links_by_station,
    resolve_cb_to_target,
    resolve_relay_to_cb,
    resolve_relay_to_target,
    validate_topology_links,
)

# =============================================================================
# HELPERS
# =============================================================================


def _link(
    link_id: str = "link-001",
    relay_id: str = "relay-001",
    cb_id: str = "cb-001",
    target_ref: str = "branch-001",
    station_id: str | None = None,
    label_pl: str | None = None,
) -> TopologyLink:
    """Create a TopologyLink with sensible defaults."""
    return TopologyLink(
        link_id=link_id,
        relay_id=relay_id,
        cb_id=cb_id,
        target_ref=target_ref,
        station_id=station_id,
        label_pl=label_pl,
    )


# =============================================================================
# TEST: TOPOLOGY LINK CREATION
# =============================================================================


class TestTopologyLinkCreation:
    """Verify valid TopologyLink creation and field access."""

    def test_create_valid_link(self):
        """Valid link creates successfully with all fields."""
        link = _link()
        assert link.link_id == "link-001"
        assert link.relay_id == "relay-001"
        assert link.cb_id == "cb-001"
        assert link.target_ref == "branch-001"
        assert link.station_id is None
        assert link.label_pl is None

    def test_create_link_with_optional_fields(self):
        """Link with station_id and label_pl."""
        link = _link(
            station_id="station-A",
            label_pl="Pole liniowe L1",
        )
        assert link.station_id == "station-A"
        assert link.label_pl == "Pole liniowe L1"

    def test_link_is_frozen(self):
        """TopologyLink is immutable (frozen dataclass)."""
        link = _link()
        with pytest.raises(AttributeError):
            link.relay_id = "new-relay"  # type: ignore[misc]

    def test_link_is_hashable(self):
        """Frozen dataclass is hashable — can be used in sets."""
        link_a = _link(link_id="link-A")
        link_b = _link(link_id="link-B", relay_id="relay-002", cb_id="cb-002")
        link_set = {link_a, link_b}
        assert len(link_set) == 2

    def test_link_equality(self):
        """Two links with same fields are equal."""
        link_a = _link()
        link_b = _link()
        assert link_a == link_b


# =============================================================================
# TEST: TOPOLOGY LINK VALIDATION
# =============================================================================


class TestTopologyLinkValidation:
    """Verify validation errors for invalid links."""

    def test_empty_link_id_raises(self):
        """Empty link_id raises EmptyIdError."""
        with pytest.raises(EmptyIdError) as exc_info:
            _link(link_id="")
        assert exc_info.value.field_name == "link_id"
        assert exc_info.value.code == "topology.empty_id"

    def test_whitespace_link_id_raises(self):
        """Whitespace-only link_id raises EmptyIdError."""
        with pytest.raises(EmptyIdError):
            _link(link_id="   ")

    def test_empty_relay_id_raises(self):
        """Empty relay_id raises EmptyIdError."""
        with pytest.raises(EmptyIdError) as exc_info:
            _link(relay_id="")
        assert exc_info.value.field_name == "relay_id"

    def test_empty_cb_id_raises(self):
        """Empty cb_id raises EmptyIdError."""
        with pytest.raises(EmptyIdError) as exc_info:
            _link(cb_id="")
        assert exc_info.value.field_name == "cb_id"

    def test_empty_target_ref_raises(self):
        """Empty target_ref raises EmptyIdError."""
        with pytest.raises(EmptyIdError) as exc_info:
            _link(target_ref="")
        assert exc_info.value.field_name == "target_ref"

    def test_self_reference_raises(self):
        """relay_id == cb_id raises SelfReferenceError."""
        with pytest.raises(SelfReferenceError) as exc_info:
            _link(relay_id="same-id", cb_id="same-id")
        assert exc_info.value.element_id == "same-id"
        assert exc_info.value.code == "topology.self_reference"

    def test_polish_error_messages(self):
        """All errors contain Polish messages."""
        with pytest.raises(EmptyIdError) as exc_info:
            _link(relay_id="")
        assert "puste" in exc_info.value.message_pl.lower()

        with pytest.raises(SelfReferenceError) as exc_info:
            _link(relay_id="x", cb_id="x")
        assert "różnymi" in exc_info.value.message_pl


# =============================================================================
# TEST: VALIDATE TOPOLOGY LINKS
# =============================================================================


class TestValidateTopologyLinks:
    """Verify validate_topology_links() function."""

    def test_valid_links_no_issues(self):
        """Valid links produce no validation issues."""
        links = (
            _link(link_id="link-001", relay_id="r1", cb_id="cb1"),
            _link(link_id="link-002", relay_id="r2", cb_id="cb2"),
        )
        issues = validate_topology_links(links)
        assert issues == []

    def test_duplicate_link_id_raises(self):
        """Duplicate link_id raises DuplicateLinkError."""
        links = (
            _link(link_id="link-001", relay_id="r1", cb_id="cb1"),
            _link(link_id="link-001", relay_id="r2", cb_id="cb2"),
        )
        with pytest.raises(DuplicateLinkError) as exc_info:
            validate_topology_links(links)
        assert exc_info.value.link_id == "link-001"
        assert exc_info.value.code == "topology.duplicate_link_id"

    def test_duplicate_relay_cb_mapping_reported(self):
        """Duplicate relay→CB mapping is reported as issue."""
        links = (
            _link(link_id="link-001", relay_id="r1", cb_id="cb1", target_ref="t1"),
            _link(link_id="link-002", relay_id="r1", cb_id="cb1", target_ref="t2"),
        )
        issues = validate_topology_links(links)
        assert len(issues) == 1
        assert issues[0]["code"] == "topology.duplicate_relay_cb_mapping"


# =============================================================================
# TEST: BUILD TOPOLOGY LINK SET
# =============================================================================


class TestBuildTopologyLinkSet:
    """Verify build_topology_link_set() factory function."""

    def test_builds_valid_link_set(self):
        """Factory creates a valid TopologyLinkSet."""
        links = (
            _link(link_id="link-001", relay_id="r1", cb_id="cb1"),
            _link(link_id="link-002", relay_id="r2", cb_id="cb2"),
        )
        link_set = build_topology_link_set(links)
        assert len(link_set.links) == 2
        assert link_set.deterministic_signature != ""

    def test_links_sorted_by_link_id(self):
        """Links are sorted lexicographically by link_id."""
        links = (
            _link(link_id="link-ZZZ", relay_id="r1", cb_id="cb1"),
            _link(link_id="link-AAA", relay_id="r2", cb_id="cb2"),
        )
        link_set = build_topology_link_set(links)
        assert link_set.links[0].link_id == "link-AAA"
        assert link_set.links[1].link_id == "link-ZZZ"

    def test_signature_is_sha256(self):
        """Signature is a valid 64-char hex SHA-256."""
        links = (_link(),)
        link_set = build_topology_link_set(links)
        sig = link_set.deterministic_signature
        assert len(sig) == 64
        assert all(c in "0123456789abcdef" for c in sig)

    def test_duplicate_link_id_raises(self):
        """Factory raises DuplicateLinkError for duplicate link_ids."""
        links = (
            _link(link_id="link-001", relay_id="r1", cb_id="cb1"),
            _link(link_id="link-001", relay_id="r2", cb_id="cb2"),
        )
        with pytest.raises(DuplicateLinkError):
            build_topology_link_set(links)


# =============================================================================
# TEST: RESOLVE RELAY TO CB
# =============================================================================


class TestResolveRelayToCB:
    """Verify resolve_relay_to_cb() helper."""

    def test_resolve_existing_relay(self):
        """Existing relay resolves to correct CB."""
        links = (
            _link(link_id="link-001", relay_id="r1", cb_id="cb-A"),
            _link(link_id="link-002", relay_id="r2", cb_id="cb-B"),
        )
        link_set = build_topology_link_set(links)
        assert resolve_relay_to_cb(link_set, "r1") == "cb-A"
        assert resolve_relay_to_cb(link_set, "r2") == "cb-B"

    def test_orphan_relay_raises(self):
        """Non-existent relay raises OrphanRelayError."""
        links = (_link(link_id="link-001", relay_id="r1", cb_id="cb-A"),)
        link_set = build_topology_link_set(links)
        with pytest.raises(OrphanRelayError) as exc_info:
            resolve_relay_to_cb(link_set, "r-missing")
        assert exc_info.value.relay_id == "r-missing"
        assert exc_info.value.code == "topology.orphan_relay"


# =============================================================================
# TEST: RESOLVE CB TO TARGET
# =============================================================================


class TestResolveCBToTarget:
    """Verify resolve_cb_to_target() helper."""

    def test_resolve_existing_cb(self):
        """Existing CB resolves to correct target."""
        links = (
            _link(
                link_id="link-001",
                relay_id="r1",
                cb_id="cb-A",
                target_ref="branch-X",
            ),
        )
        link_set = build_topology_link_set(links)
        assert resolve_cb_to_target(link_set, "cb-A") == "branch-X"

    def test_missing_cb_raises(self):
        """Non-existent CB raises TopologyLinkError."""
        links = (_link(link_id="link-001"),)
        link_set = build_topology_link_set(links)
        with pytest.raises(TopologyLinkError) as exc_info:
            resolve_cb_to_target(link_set, "cb-missing")
        assert exc_info.value.code == "topology.cb_not_found"


# =============================================================================
# TEST: RESOLVE RELAY TO TARGET
# =============================================================================


class TestResolveRelayToTarget:
    """Verify resolve_relay_to_target() convenience function."""

    def test_resolve_relay_to_both(self):
        """Relay resolves to (cb_id, target_ref) tuple."""
        links = (
            _link(
                link_id="link-001",
                relay_id="r1",
                cb_id="cb-A",
                target_ref="branch-X",
            ),
        )
        link_set = build_topology_link_set(links)
        cb_id, target_ref = resolve_relay_to_target(link_set, "r1")
        assert cb_id == "cb-A"
        assert target_ref == "branch-X"

    def test_missing_relay_raises(self):
        """Non-existent relay raises OrphanRelayError."""
        links = (_link(link_id="link-001"),)
        link_set = build_topology_link_set(links)
        with pytest.raises(OrphanRelayError):
            resolve_relay_to_target(link_set, "r-missing")


# =============================================================================
# TEST: GET LINKS BY STATION
# =============================================================================


class TestGetLinksByStation:
    """Verify get_links_by_station() helper."""

    def test_filter_by_station(self):
        """Returns only links for given station."""
        links = (
            _link(
                link_id="link-001",
                relay_id="r1",
                cb_id="cb1",
                station_id="station-A",
            ),
            _link(
                link_id="link-002",
                relay_id="r2",
                cb_id="cb2",
                station_id="station-B",
            ),
            _link(
                link_id="link-003",
                relay_id="r3",
                cb_id="cb3",
                station_id="station-A",
            ),
        )
        link_set = build_topology_link_set(links)
        station_a_links = get_links_by_station(link_set, "station-A")
        assert len(station_a_links) == 2
        assert all(lk.station_id == "station-A" for lk in station_a_links)

    def test_no_links_for_station(self):
        """Returns empty tuple for non-existent station."""
        links = (_link(link_id="link-001", station_id="station-A"),)
        link_set = build_topology_link_set(links)
        result = get_links_by_station(link_set, "station-X")
        assert result == ()

    def test_multiple_links_per_station(self):
        """Station can contain multiple relay-CB-target mappings."""
        links = (
            _link(
                link_id="link-001",
                relay_id="r1",
                cb_id="cb1",
                target_ref="branch-1",
                station_id="station-A",
            ),
            _link(
                link_id="link-002",
                relay_id="r2",
                cb_id="cb2",
                target_ref="branch-2",
                station_id="station-A",
            ),
            _link(
                link_id="link-003",
                relay_id="r3",
                cb_id="cb3",
                target_ref="branch-3",
                station_id="station-A",
            ),
        )
        link_set = build_topology_link_set(links)
        result = get_links_by_station(link_set, "station-A")
        assert len(result) == 3
        target_refs = {lk.target_ref for lk in result}
        assert target_refs == {"branch-1", "branch-2", "branch-3"}


# =============================================================================
# TEST: DETERMINISM
# =============================================================================


class TestDeterminism:
    """Verify deterministic output: same input → same hash."""

    def test_identical_inputs_identical_signature(self):
        """Two identical builds produce identical signature."""
        links = (
            _link(link_id="link-001", relay_id="r1", cb_id="cb1"),
            _link(link_id="link-002", relay_id="r2", cb_id="cb2"),
        )
        set_a = build_topology_link_set(links)
        set_b = build_topology_link_set(links)
        assert set_a.deterministic_signature == set_b.deterministic_signature
        assert set_a.deterministic_signature != ""

    def test_different_inputs_different_signature(self):
        """Different link data produces different signatures."""
        links_a = (_link(link_id="link-001", relay_id="r1", cb_id="cb1"),)
        links_b = (_link(link_id="link-001", relay_id="r1", cb_id="cb2"),)
        set_a = build_topology_link_set(links_a)
        set_b = build_topology_link_set(links_b)
        assert set_a.deterministic_signature != set_b.deterministic_signature

    def test_input_order_does_not_affect_signature(self):
        """Swapping link input order produces identical signature."""
        link_a = _link(link_id="link-AAA", relay_id="r1", cb_id="cb1")
        link_b = _link(link_id="link-ZZZ", relay_id="r2", cb_id="cb2")

        set_fwd = build_topology_link_set((link_a, link_b))
        set_rev = build_topology_link_set((link_b, link_a))
        assert set_fwd.deterministic_signature == set_rev.deterministic_signature

    def test_signature_is_64_hex_chars(self):
        """Signature is SHA-256: exactly 64 hex chars."""
        links = (_link(),)
        link_set = build_topology_link_set(links)
        sig = link_set.deterministic_signature
        assert len(sig) == 64
        assert all(c in "0123456789abcdef" for c in sig)


# =============================================================================
# TEST: SERIALIZATION
# =============================================================================


class TestSerialization:
    """Verify roundtrip serialization for all types."""

    def test_topology_link_roundtrip(self):
        """TopologyLink → to_dict → from_dict is identity."""
        link = _link(station_id="station-A", label_pl="Pole L1")
        restored = TopologyLink.from_dict(link.to_dict())
        assert restored == link

    def test_topology_link_roundtrip_no_optionals(self):
        """TopologyLink without optional fields roundtrips."""
        link = _link()
        restored = TopologyLink.from_dict(link.to_dict())
        assert restored == link
        assert restored.station_id is None
        assert restored.label_pl is None

    def test_topology_link_set_roundtrip(self):
        """TopologyLinkSet → to_dict → from_dict preserves data."""
        links = (
            _link(link_id="link-001", relay_id="r1", cb_id="cb1"),
            _link(link_id="link-002", relay_id="r2", cb_id="cb2"),
        )
        link_set = build_topology_link_set(links)
        data = link_set.to_dict()
        restored = TopologyLinkSet.from_dict(data)
        assert restored.deterministic_signature == link_set.deterministic_signature
        assert len(restored.links) == 2

    def test_to_dict_contains_all_fields(self):
        """to_dict includes all fields."""
        link = _link(station_id="station-A", label_pl="Pole")
        d = link.to_dict()
        expected_keys = {
            "link_id",
            "relay_id",
            "cb_id",
            "target_ref",
            "station_id",
            "label_pl",
        }
        assert set(d.keys()) == expected_keys


# =============================================================================
# TEST: WHITE BOX TRACE
# =============================================================================


class TestWhiteBoxTrace:
    """Verify trace content for auditability."""

    def test_trace_has_counts(self):
        """Trace includes element counts."""
        links = (
            _link(link_id="link-001", relay_id="r1", cb_id="cb1"),
            _link(link_id="link-002", relay_id="r2", cb_id="cb2"),
        )
        link_set = build_topology_link_set(links)
        trace = link_set.trace

        assert trace["total_links"] == 2
        assert trace["unique_relays"] == 2
        assert trace["unique_cbs"] == 2

    def test_trace_has_id_lists(self):
        """Trace includes sorted ID lists."""
        links = (
            _link(
                link_id="link-001",
                relay_id="r1",
                cb_id="cb1",
                station_id="station-A",
            ),
        )
        link_set = build_topology_link_set(links)
        trace = link_set.trace

        assert "relay_ids" in trace
        assert "cb_ids" in trace
        assert "target_refs" in trace
        assert "station_ids" in trace
        assert trace["relay_ids"] == ["r1"]
        assert trace["station_ids"] == ["station-A"]

    def test_trace_has_signature_algorithm(self):
        """Trace documents signature algorithm."""
        links = (_link(),)
        link_set = build_topology_link_set(links)
        assert link_set.trace["signature_algorithm"] == "SHA-256"

    def test_trace_has_polish_description(self):
        """Trace includes Polish description."""
        links = (_link(),)
        link_set = build_topology_link_set(links)
        assert "description_pl" in link_set.trace
        assert "topologicznych" in link_set.trace["description_pl"]

    def test_trace_includes_validation_issues(self):
        """Trace captures validation issues."""
        links = (
            _link(link_id="link-001", relay_id="r1", cb_id="cb1", target_ref="t1"),
            _link(link_id="link-002", relay_id="r1", cb_id="cb1", target_ref="t2"),
        )
        link_set = build_topology_link_set(links)
        assert len(link_set.trace["validation_issues"]) == 1


# =============================================================================
# TEST: EMPTY LINK SET
# =============================================================================


class TestEmptyLinkSet:
    """Edge case with no links."""

    def test_empty_link_set(self):
        """Empty link set is valid with signature."""
        link_set = build_topology_link_set(())
        assert len(link_set.links) == 0
        assert link_set.deterministic_signature != ""
        assert link_set.trace["total_links"] == 0

    def test_empty_link_set_serialization(self):
        """Empty link set roundtrips."""
        link_set = build_topology_link_set(())
        data = link_set.to_dict()
        restored = TopologyLinkSet.from_dict(data)
        assert len(restored.links) == 0
        assert restored.deterministic_signature == link_set.deterministic_signature

    def test_resolve_on_empty_raises(self):
        """Resolve on empty set raises appropriate error."""
        link_set = build_topology_link_set(())
        with pytest.raises(OrphanRelayError):
            resolve_relay_to_cb(link_set, "r1")
        with pytest.raises(TopologyLinkError):
            resolve_cb_to_target(link_set, "cb1")


# =============================================================================
# TEST: ERROR HIERARCHY
# =============================================================================


class TestErrorHierarchy:
    """Verify error class hierarchy."""

    def test_duplicate_link_error_is_topology_link_error(self):
        """DuplicateLinkError is subclass of TopologyLinkError."""
        assert issubclass(DuplicateLinkError, TopologyLinkError)

    def test_orphan_relay_error_is_topology_link_error(self):
        """OrphanRelayError is subclass of TopologyLinkError."""
        assert issubclass(OrphanRelayError, TopologyLinkError)

    def test_self_reference_error_is_topology_link_error(self):
        """SelfReferenceError is subclass of TopologyLinkError."""
        assert issubclass(SelfReferenceError, TopologyLinkError)

    def test_empty_id_error_is_topology_link_error(self):
        """EmptyIdError is subclass of TopologyLinkError."""
        assert issubclass(EmptyIdError, TopologyLinkError)

    def test_all_errors_have_code_and_message_pl(self):
        """All error types store code and message_pl."""
        err = TopologyLinkError(code="topology.test", message_pl="Testowy komunikat")
        assert err.code == "topology.test"
        assert err.message_pl == "Testowy komunikat"
        assert str(err) == "Testowy komunikat"
