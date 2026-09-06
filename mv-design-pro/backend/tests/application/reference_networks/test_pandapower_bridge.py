"""Tests for pandapower bridge — conversion correctness.

Marker `pandapower` (zarejestrowany w pyproject.toml): ten modul wymaga
realnie zainstalowanego pandapower. W glownym venv solverow (scipy 1.17.0,
zlote hashe) pandapower NIE jest instalowane celowo (konflikt zaleznosci —
pandapower<3.6 wymaga scipy<1.17 na Pythonie 3.11). Walidacja krzyzowa biegnie
w IZOLOWANYM srodowisku (job CI `pandapower-cross-validation`, patrz
`.github/workflows/python-tests.yml`); glowny bieg deselekcjonuje ten marker
jawnie (`-m "not pandapower"`), wiec brak biblioteki w glownym venv NIE jest
skipem tych testow — po prostu nie sa tam wybierane do biegu.
"""

from __future__ import annotations

import pytest
from application.reference_networks.builders.ieee_4bus import build_ieee_4bus_network
from application.reference_networks.pandapower_bridge import (
    enm_to_pandapower_dict,
    run_pandapower_powerflow,
)

pytestmark = pytest.mark.pandapower


class TestEnmConversion:
    """Test the ENM → pandapower dict conversion structure."""

    def test_ieee_4bus_converts_without_error(self) -> None:
        enm = build_ieee_4bus_network()
        result = enm_to_pandapower_dict(enm)
        assert "net" in result
        assert "bus_idx_map" in result
        assert len(result["bus_idx_map"]) == 4

    def test_pp_simple_4bus_converts(self) -> None:
        from application.reference_networks.builders.pp_simple_four_bus import (
            build_pp_simple_four_bus_network,
        )

        enm = build_pp_simple_four_bus_network()
        result = enm_to_pandapower_dict(enm)
        assert len(result["bus_idx_map"]) == 4


class TestPandapowerPowerflow:
    """End-to-end pandapower NR cross-check."""

    def test_runs_powerflow_returns_buses(self) -> None:
        enm = build_ieee_4bus_network()
        results = run_pandapower_powerflow(enm)
        assert "BUS-1" in results
        assert "BUS-2" in results
        # Slack should have v_pu ~ 1.0
        assert abs(results["BUS-1"]["v_pu"] - 1.0) < 1e-6

    def test_voltages_drop_from_slack(self) -> None:
        enm = build_ieee_4bus_network()
        results = run_pandapower_powerflow(enm)
        # In Stevenson Example 9.5, BUS-2 voltage is slightly below 1.0
        assert results["BUS-2"]["v_pu"] < 1.001
        assert results["BUS-2"]["v_pu"] > 0.95
