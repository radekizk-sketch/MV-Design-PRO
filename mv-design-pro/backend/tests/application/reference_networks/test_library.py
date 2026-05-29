"""Tests for reference networks library + registry integrity."""

from __future__ import annotations

import pytest
from application.reference_networks import (
    REFERENCE_NETWORK_REGISTRY,
    get_reference_network,
    list_reference_networks,
)


class TestRegistryCompleteness:
    """All reference networks must be registered (per validation acceptance criteria)."""

    def test_all_networks_registered(self) -> None:
        assert len(REFERENCE_NETWORK_REGISTRY) == 12

    def test_all_required_ids_present(self) -> None:
        required = {
            "ieee-4bus",
            "ieee-9bus",
            "ieee-14bus",
            "ieee-39bus",
            "iec60909-example",
            "pandapower-iec60909-radial",
            "cigre-mv-14",
            "pp-simple-4bus",
            "oze-pv-bess",
            "ieee-13bus",
            "ieee-34bus",
            "cigre-lv-benchmark",
        }
        assert set(REFERENCE_NETWORK_REGISTRY.keys()) == required

    def test_get_by_id_returns_network(self) -> None:
        net = get_reference_network("ieee-4bus")
        assert net.id == "ieee-4bus"

    def test_unknown_id_raises(self) -> None:
        with pytest.raises(KeyError):
            get_reference_network("does-not-exist")


class TestNetworkMetadata:
    """Each registered network must have proper metadata."""

    def test_every_network_has_polish_name(self) -> None:
        for net in list_reference_networks():
            assert net.name_pl
            assert len(net.name_pl) > 0

    def test_every_network_has_source_citation(self) -> None:
        for net in list_reference_networks():
            assert net.source
            assert len(net.source) > 0

    def test_every_network_has_supported_solvers(self) -> None:
        for net in list_reference_networks():
            assert len(net.supported_solvers) > 0

    def test_every_network_has_expected_path(self) -> None:
        for net in list_reference_networks():
            assert str(net.expected_path).endswith(".json")


class TestBuildersExecute:
    """Every builder must return non-empty ENM dict without errors."""

    @pytest.mark.parametrize("network_id", list(REFERENCE_NETWORK_REGISTRY.keys()))
    def test_builder_returns_dict(self, network_id: str) -> None:
        net = get_reference_network(network_id)
        result = net.builder_fn()
        assert isinstance(result, dict)
        assert "buses" in result
        assert "branches" in result

    @pytest.mark.parametrize("network_id", list(REFERENCE_NETWORK_REGISTRY.keys()))
    def test_builder_has_at_least_one_bus(self, network_id: str) -> None:
        net = get_reference_network(network_id)
        result = net.builder_fn()
        assert len(result["buses"]) >= 1

    @pytest.mark.parametrize("network_id", list(REFERENCE_NETWORK_REGISTRY.keys()))
    def test_builder_has_slack_source(self, network_id: str) -> None:
        net = get_reference_network(network_id)
        result = net.builder_fn()
        sources = result.get("sources", [])
        slack_sources = [s for s in sources if s.get("source_kind") == "slack"]
        assert len(slack_sources) >= 1, f"Network {network_id} missing slack source"

    @pytest.mark.parametrize("network_id", list(REFERENCE_NETWORK_REGISTRY.keys()))
    def test_builder_is_deterministic(self, network_id: str) -> None:
        """Same builder twice should produce identical structure."""
        net = get_reference_network(network_id)
        result_1 = net.builder_fn()
        result_2 = net.builder_fn()
        assert result_1 == result_2


class TestOzeNetworksHaveDer:
    """Networks marked has_der=True must include generators."""

    def test_oze_pv_bess_has_generators(self) -> None:
        net = get_reference_network("oze-pv-bess")
        result = net.builder_fn()
        assert len(result["generators"]) >= 2  # PV + BESS

    def test_cigre_mv_has_pv(self) -> None:
        net = get_reference_network("cigre-mv-14")
        result = net.builder_fn()
        pv_gens = [g for g in result["generators"] if "pv" in str(g.get("gen_kind", "")).lower()]
        assert len(pv_gens) >= 1

    def test_cigre_lv_has_pv(self) -> None:
        net = get_reference_network("cigre-lv-benchmark")
        result = net.builder_fn()
        assert len(result["generators"]) >= 1


class TestSummaryDict:
    """to_summary_dict() must produce JSON-serializable output."""

    def test_summary_includes_required_fields(self) -> None:
        net = get_reference_network("ieee-4bus")
        summary = net.to_summary_dict()
        assert "id" in summary
        assert "name_pl" in summary
        assert "source" in summary
        assert "voltage_kv" in summary
        assert "has_der" in summary
        assert "is_unbalanced" in summary
        assert "supported_solvers" in summary

    def test_supported_solvers_is_list(self) -> None:
        net = get_reference_network("oze-pv-bess")
        summary = net.to_summary_dict()
        assert isinstance(summary["supported_solvers"], list)
