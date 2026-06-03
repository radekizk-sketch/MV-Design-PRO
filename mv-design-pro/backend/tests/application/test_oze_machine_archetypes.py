"""Backend coverage for the rotating-machine OZE archetypes (G7 biogaz — synchronous;
G8 wind — asynchronous). The FULL machine SC model (IEC 60909 §6.3/§6.7/§6.6) feeds the
source contribution instead of the IBG bounded current (gate J). Mirrors the frontend
gate tests but pins the backend substrate builders directly."""

from application.reference_networks.station_archetype_substrate import (
    build_g5_wind_t4,
    build_g8_biogaz,
    build_g7_wind_async,
)


def _buses(companion: dict) -> list:
    return list(companion["short_circuit"]["buses"].values())


def test_g7_biogaz_synchronous_machine_contribution():
    c = build_g8_biogaz()
    assert c["source"]["machine_type"] == "SYNCHRONOUS"
    assert c["converged"]
    for bus in _buses(c):
        sc = bus["source_contribution"]
        assert sc["machine_type"] == "SYNCHRONOUS"
        assert sc["is_synchronous_machine"] is True
        assert sc["ik_contribution_ka"] > 0
        assert sc["ib_contribution_ka"] > 0
        assert "6.3" in sc["model"] or "synchroniczna" in sc["model"]
        assert sc["machines"], "per-machine breakdown present"
        for m in sc["machines"]:
            assert m["q"] == 1.0  # synchronous: μ only, no q
            assert 0.0 < m["mu"] <= 1.0
            assert m["ikss_partial_ka"] > 0
        assert bus["verification"]["passed"] is True


def test_g8_wind_async_machine_contribution():
    c = build_g7_wind_async()
    assert c["source"]["machine_type"] == "ASYNCHRONOUS"
    assert c["converged"]
    for bus in _buses(c):
        sc = bus["source_contribution"]
        assert sc["machine_type"] == "ASYNCHRONOUS"
        assert sc["is_synchronous_machine"] is False
        assert sc["ik_contribution_ka"] > 0
        assert "asynchroniczna" in sc["model"] or "6.7" in sc["model"]
        assert isinstance(sc["motors_negligible"], bool)
        for m in sc["machines"]:
            assert 0.0 < m["q"] <= 1.0  # asynchronous decay (μ·q)
        assert bus["verification"]["passed"] is True


def test_g8_async_terminal_vs_collector_contrast():
    # The faulted-turbine partial decays (μ<1, near-generator); the remote turbines
    # through the collector stay at μ=1 (far-from-generator) — the IEC 60909 signature.
    c = build_g7_wind_async()
    lv = c["short_circuit"]["buses"]["WTG_LV_1"]["source_contribution"]
    faulted = next(m for m in lv["machines"] if m["node_ref"] == "WTG_LV_1")
    remote = [m for m in lv["machines"] if m["node_ref"] != "WTG_LV_1"]
    assert faulted["mu"] < 1.0
    assert all(m["mu"] == 1.0 for m in remote)
    assert faulted["ikss_partial_ka"] > max(m["ikss_partial_ka"] for m in remote)


def test_ibg_archetype_unchanged():
    # G6 (wind Type 4) stays IBG — the machine model does NOT bleed into IBG sources.
    c = build_g5_wind_t4()
    assert c["source"]["machine_type"] == "IBG"
    for bus in _buses(c):
        sc = bus["source_contribution"]
        assert sc["machine_type"] == "IBG"
        assert sc["is_synchronous_machine"] is False
        assert "machines" not in sc  # no rotating-machine breakdown for IBG
        assert "6.7" in sc["model"]


def test_machine_archetypes_deterministic():
    assert build_g8_biogaz() == build_g8_biogaz()
    assert build_g7_wind_async() == build_g7_wind_async()
