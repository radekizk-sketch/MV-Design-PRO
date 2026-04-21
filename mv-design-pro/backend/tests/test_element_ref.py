"""Tests for ElementRefV1 + ReadinessProfileV1 + ResultJoinV1 (KROK 1)."""

import pytest
from domain.element_ref import (
    CatalogRefV1,
    ElementRefV1,
    ElementScopeV1,
    ElementTypeV1,
    build_element_ref_index,
)
from domain.readiness import (
    ReadinessAreaV1,
    ReadinessIssueV1,
    ReadinessPriority,
    build_readiness_profile,
)
from domain.result_join import (
    OverlayTokenKindV1,
    join_results,
)

# ---------------------------------------------------------------------------
# ElementRefV1
# ---------------------------------------------------------------------------


class TestElementRefV1:
    def test_basic_creation(self) -> None:
        ref = ElementRefV1(element_id="bus_1", element_type=ElementTypeV1.NODE)
        assert ref.element_id == "bus_1"
        assert ref.element_type == ElementTypeV1.NODE
        assert ref.station_id is None
        assert ref.catalog_ref is None

    def test_with_station_and_catalog(self) -> None:
        cat = CatalogRefV1(catalog_id="cat_cb_1", category="BREAKER", manufacturer="ABB")
        ref = ElementRefV1(
            element_id="cb_1",
            element_type=ElementTypeV1.DEVICE,
            station_id="sta_1",
            catalog_ref=cat,
        )
        d = ref.to_dict()
        assert d["element_id"] == "cb_1"
        assert d["element_type"] == "DEVICE"
        assert d["station_id"] == "sta_1"
        assert d["catalog_ref"]["catalog_id"] == "cat_cb_1"
        assert d["catalog_ref"]["manufacturer"] == "ABB"

    def test_frozen(self) -> None:
        ref = ElementRefV1(element_id="x", element_type=ElementTypeV1.NODE)
        with pytest.raises(AttributeError):
            ref.element_id = "y"  # type: ignore[misc]

    def test_element_type_enum(self) -> None:
        for t in ElementTypeV1:
            ref = ElementRefV1(element_id=f"el_{t.value}", element_type=t)
            assert ref.element_type == t

    def test_scope_enum(self) -> None:
        scopes = list(ElementScopeV1)
        assert len(scopes) == 5
        assert ElementScopeV1.DOMAIN in scopes

    def test_build_index(self) -> None:
        refs = [
            ElementRefV1(element_id="c", element_type=ElementTypeV1.BRANCH),
            ElementRefV1(element_id="a", element_type=ElementTypeV1.NODE),
            ElementRefV1(element_id="b", element_type=ElementTypeV1.LOAD),
        ]
        index = build_element_ref_index(refs)
        assert list(index.keys()) == ["a", "b", "c"]


# ---------------------------------------------------------------------------
# ReadinessProfileV1
# ---------------------------------------------------------------------------


class TestReadinessProfileV1:
    def test_no_issues_all_ready(self) -> None:
        profile = build_readiness_profile(
            snapshot_id="snap_1",
            snapshot_fingerprint="fp_1",
            issues=[],
        )
        assert profile.sld_ready is True
        assert profile.short_circuit_ready is True
        assert profile.load_flow_ready is True
        assert profile.protection_ready is True
        assert len(profile.issues) == 0
        assert len(profile.content_hash) == 64

    def test_topology_blocker_blocks_sld_and_sc(self) -> None:
        issue = ReadinessIssueV1(
            code="bus.voltage_missing",
            area=ReadinessAreaV1.TOPOLOGY,
            priority=ReadinessPriority.BLOCKER,
            message_pl="Szyna bus_1 nie ma jawnego napiecia",
            element_id="bus_1",
        )
        profile = build_readiness_profile(
            snapshot_id="snap_1",
            snapshot_fingerprint="fp_1",
            issues=[issue],
        )
        assert profile.sld_ready is False
        assert profile.short_circuit_ready is False
        assert profile.load_flow_ready is False
        # protection also blocked by topology
        assert profile.protection_ready is False

    def test_catalog_blocker_blocks_sc_but_not_sld(self) -> None:
        issue = ReadinessIssueV1(
            code="catalog.ref_missing",
            area=ReadinessAreaV1.CATALOGS,
            priority=ReadinessPriority.BLOCKER,
            message_pl="Brak referencji katalogowej",
            element_id="cb_1",
        )
        profile = build_readiness_profile(
            snapshot_id="snap_1",
            snapshot_fingerprint="fp_1",
            issues=[issue],
        )
        assert profile.sld_ready is True
        assert profile.short_circuit_ready is False
        assert profile.load_flow_ready is False
        assert profile.protection_ready is False

    def test_warning_does_not_block(self) -> None:
        issue = ReadinessIssueV1(
            code="station.typology_conflict",
            area=ReadinessAreaV1.STATIONS,
            priority=ReadinessPriority.WARNING,
            message_pl="Konflikt stationType vs topologia",
            element_id="sta_1",
        )
        profile = build_readiness_profile(
            snapshot_id="snap_1",
            snapshot_fingerprint="fp_1",
            issues=[issue],
        )
        assert profile.sld_ready is True
        assert profile.short_circuit_ready is True

    def test_determinism(self) -> None:
        issues = [
            ReadinessIssueV1(
                code="b_issue",
                area=ReadinessAreaV1.SOURCES,
                priority=ReadinessPriority.BLOCKER,
                message_pl="B",
            ),
            ReadinessIssueV1(
                code="a_issue",
                area=ReadinessAreaV1.CATALOGS,
                priority=ReadinessPriority.WARNING,
                message_pl="A",
            ),
        ]
        p1 = build_readiness_profile(snapshot_id="s", snapshot_fingerprint="f", issues=issues)
        p2 = build_readiness_profile(
            snapshot_id="s", snapshot_fingerprint="f", issues=list(reversed(issues))
        )
        assert p1.content_hash == p2.content_hash

    def test_by_area_grouping(self) -> None:
        issues = [
            ReadinessIssueV1(
                code="a",
                area=ReadinessAreaV1.TOPOLOGY,
                priority=ReadinessPriority.INFO,
                message_pl="x",
            ),
            ReadinessIssueV1(
                code="b",
                area=ReadinessAreaV1.CATALOGS,
                priority=ReadinessPriority.INFO,
                message_pl="y",
            ),
            ReadinessIssueV1(
                code="c",
                area=ReadinessAreaV1.TOPOLOGY,
                priority=ReadinessPriority.WARNING,
                message_pl="z",
            ),
        ]
        profile = build_readiness_profile(snapshot_id="s", snapshot_fingerprint="f", issues=issues)
        by_area = profile.by_area
        assert "TOPOLOGY" in by_area
        assert len(by_area["TOPOLOGY"]) == 2
        assert "CATALOGS" in by_area
        assert len(by_area["CATALOGS"]) == 1


# ---------------------------------------------------------------------------
# ResultJoinV1
# ---------------------------------------------------------------------------


class TestResultJoinV1:
    def _make_index(self) -> dict[str, ElementRefV1]:
        return {
            "bus_1": ElementRefV1(element_id="bus_1", element_type=ElementTypeV1.NODE),
            "bus_2": ElementRefV1(element_id="bus_2", element_type=ElementTypeV1.NODE),
            "branch_1": ElementRefV1(element_id="branch_1", element_type=ElementTypeV1.BRANCH),
        }

    def test_full_match(self) -> None:
        idx = self._make_index()
        results = [
            {"element_ref": "bus_1", "element_type": "Bus", "values": {"v_pu": 1.02, "u_kv": 15.3}},
            {"element_ref": "branch_1", "element_type": "Branch", "values": {"i_a": 120.5}},
        ]
        join = join_results(
            snapshot_element_ids=idx, element_results=results, analysis_type="LOAD_FLOW"
        )
        assert len(join.sld_tokens) == 3  # 2 for bus_1 + 1 for branch_1
        assert len(join.inspector_facts) == 3
        assert len(join.orphan_element_ids) == 0
        assert "bus_2" in join.unmatched_snapshot_ids

    def test_orphan_detection(self) -> None:
        idx = self._make_index()
        results = [
            {"element_ref": "unknown_1", "element_type": "Bus", "values": {"v_pu": 1.0}},
        ]
        join = join_results(
            snapshot_element_ids=idx, element_results=results, analysis_type="LOAD_FLOW"
        )
        assert len(join.orphan_element_ids) == 1
        assert join.orphan_element_ids[0] == "unknown_1"
        # Orphan token generated
        orphan_tokens = [
            t for t in join.sld_tokens if t.token_kind == OverlayTokenKindV1.ORPHAN_RESULT
        ]
        assert len(orphan_tokens) == 1

    def test_sc_classification(self) -> None:
        idx = {"bus_1": ElementRefV1(element_id="bus_1", element_type=ElementTypeV1.NODE)}
        results = [
            {
                "element_ref": "bus_1",
                "element_type": "Bus",
                "values": {"ikss_ka": 12.5, "ip_ka": 31.8},
            },
        ]
        join = join_results(
            snapshot_element_ids=idx, element_results=results, analysis_type="SC_3F"
        )
        sc_tokens = [t for t in join.sld_tokens if t.token_kind == OverlayTokenKindV1.SHORT_CIRCUIT]
        assert len(sc_tokens) == 2

    def test_determinism(self) -> None:
        idx = self._make_index()
        results = [
            {"element_ref": "branch_1", "element_type": "Branch", "values": {"i_a": 100}},
            {"element_ref": "bus_1", "element_type": "Bus", "values": {"v_pu": 1.0}},
        ]
        j1 = join_results(
            snapshot_element_ids=idx, element_results=results, analysis_type="LOAD_FLOW"
        )
        j2 = join_results(
            snapshot_element_ids=idx,
            element_results=list(reversed(results)),
            analysis_type="LOAD_FLOW",
        )
        assert j1.content_hash == j2.content_hash

    def test_empty_results(self) -> None:
        idx = self._make_index()
        join = join_results(snapshot_element_ids=idx, element_results=[], analysis_type="LOAD_FLOW")
        assert len(join.sld_tokens) == 0
        assert len(join.inspector_facts) == 0
        assert len(join.unmatched_snapshot_ids) == 3
