"""Tests for pandapower bridge — lazy import, conversion correctness."""

from __future__ import annotations

import pytest

from application.reference_networks.builders.ieee_4bus import build_ieee_4bus_network
from application.reference_networks.pandapower_bridge import (
    enm_to_pandapower_dict,
    is_pandapower_available,
    run_pandapower_powerflow,
)


class TestLazyImport:
    """Module must not crash when pandapower is missing."""

    def test_is_pandapower_available_returns_bool(self) -> None:
        result = is_pandapower_available()
        assert isinstance(result, bool)


class TestEnmConversion:
    """Test the ENM → pandapower dict conversion structure."""

    def test_conversion_requires_pandapower(self) -> None:
        """If pandapower not installed, conversion raises ImportError."""
        pp_available = is_pandapower_available()
        if not pp_available:
            with pytest.raises(ImportError, match="pandapower"):
                enm_to_pandapower_dict(build_ieee_4bus_network())

    @pytest.mark.skipif(not is_pandapower_available(), reason="pandapower not installed")
    def test_ieee_4bus_converts_without_error(self) -> None:
        enm = build_ieee_4bus_network()
        result = enm_to_pandapower_dict(enm)
        assert "net" in result
        assert "bus_idx_map" in result
        assert len(result["bus_idx_map"]) == 4

    @pytest.mark.skipif(not is_pandapower_available(), reason="pandapower not installed")
    def test_pp_simple_4bus_converts(self) -> None:
        from application.reference_networks.builders.pp_simple_four_bus import (
            build_pp_simple_four_bus_network,
        )

        enm = build_pp_simple_four_bus_network()
        result = enm_to_pandapower_dict(enm)
        assert len(result["bus_idx_map"]) == 4


class TestPandapowerPowerflow:
    """End-to-end pandapower NR cross-check."""

    @pytest.mark.skipif(not is_pandapower_available(), reason="pandapower not installed")
    def test_runs_powerflow_returns_buses(self) -> None:
        enm = build_ieee_4bus_network()
        results = run_pandapower_powerflow(enm)
        assert "BUS-1" in results
        assert "BUS-2" in results
        # Slack should have v_pu ~ 1.0
        assert abs(results["BUS-1"]["v_pu"] - 1.0) < 1e-6

    @pytest.mark.skipif(not is_pandapower_available(), reason="pandapower not installed")
    def test_voltages_drop_from_slack(self) -> None:
        enm = build_ieee_4bus_network()
        results = run_pandapower_powerflow(enm)
        # In Stevenson Example 9.5, BUS-2 voltage is slightly below 1.0
        assert results["BUS-2"]["v_pu"] < 1.001
        assert results["BUS-2"]["v_pu"] > 0.95
