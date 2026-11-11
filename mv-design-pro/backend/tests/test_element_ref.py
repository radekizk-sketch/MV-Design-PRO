"""Tests for ElementRefV1 + ResultJoinV1 (KROK 1)."""

import pytest
from domain.element_ref import (
    CatalogRefV1,
    ElementRefV1,
    ElementScopeV1,
    ElementTypeV1,
    build_element_ref_index,
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
