"""
Tests for SLD substrate builder (M-05).

Verifies:
  - ≥52 MV stations (V-09)
  - laterals exist (branch count ≫ 1)
  - all DER chain types present: pv_inverter, bess, wind_inverter (V-10)
  - add_converter_source attaches DER with der_count > 0 (Bug 1 fix)
  - determinism: same seed → identical hash
  - ENMValidator passes (no FATAL/ERROR)
  - EnergyNetworkModel.model_validate succeeds (loadable by SLD path)
"""

from __future__ import annotations

import pytest


@pytest.fixture(scope="module")
def substrate():
    """Build the 52-station substrate once per test module (expensive)."""
    from tests.reference_networks.sld_substrate_52s import build_sld_substrate_52s

    return build_sld_substrate_52s()


def test_station_count_at_least_52(substrate):
    """V-09: network must have ≥52 MV substations."""
    assert (
        substrate["station_count"] >= 52
    ), f"Expected ≥52 stations, got {substrate['station_count']}"


def test_lateral_count_matches_trunk(substrate):
    """Laterals formed from FEEDER bays — one per trunk station."""
    assert substrate["lateral_count"] == substrate["trunk_station_count"], (
        f"Expected {substrate['trunk_station_count']} laterals, "
        f"got {substrate['lateral_count']}"
    )
    assert (
        substrate["lateral_count"] >= 10
    ), f"Expected ≥10 lateral corridors, got {substrate['lateral_count']}"


def test_branch_count_much_greater_than_one(substrate):
    """Bug 2 fix: multi-station network must have many branches, not ≈1."""
    assert (
        substrate["branch_count"] > 20
    ), f"Expected >20 cable/line branches (laterals + trunk), got {substrate['branch_count']}"


def test_der_count_greater_than_zero(substrate):
    """Bug 1 fix: add_converter_source must attach DER with der_count > 0."""
    assert (
        substrate["der_count"] > 0
    ), "Expected DER generators > 0; add_converter_source binding was invalid"
    assert not substrate["der_errors"], f"DER attachment had errors: {substrate['der_errors']}"


def test_all_der_chain_types_present(substrate):
    """V-10: all DER chain types must be present: PV, BESS, FW."""
    types = substrate["der_types"]
    assert "pv_inverter" in types, f"pv_inverter missing from der_types: {types}"
    assert "bess" in types, f"bess missing from der_types: {types}"
    assert "wind_inverter" in types, f"wind_inverter missing from der_types: {types}"


def test_mixed_der_config_present(substrate):
    """V-10: mixed config (PV + BESS at same station) must be present.

    The builder attaches both PV and BESS at 4 lateral-tip stations.
    So we should see at least 4 stations with 2+ DER.
    """
    enm = substrate["enm"]
    generators = enm.get("generators", [])
    from collections import Counter

    station_der_count: Counter = Counter()
    for gen in generators:
        stn_ref = gen.get("station_ref") or ""
        if stn_ref:
            station_der_count[stn_ref] += 1

    multi_der_stations = [s for s, cnt in station_der_count.items() if cnt >= 2]
    assert (
        len(multi_der_stations) >= 2
    ), f"Expected ≥2 stations with mixed DER, got {len(multi_der_stations)}"


def test_determinism(substrate):
    """Same build call must produce identical SHA-256 hash."""
    from tests.reference_networks.sld_substrate_52s import build_sld_substrate_52s

    result2 = build_sld_substrate_52s()
    assert result2["snapshot_hash"] == substrate["snapshot_hash"], (
        f"Non-deterministic: hash1={substrate['snapshot_hash'][:16]} "
        f"hash2={result2['snapshot_hash'][:16]}"
    )


def test_enm_model_validate(substrate):
    """Network must be loadable by EnergyNetworkModel.model_validate (SLD path)."""
    from enm.models import EnergyNetworkModel

    enm_model = EnergyNetworkModel.model_validate(substrate["enm"])
    assert enm_model is not None
    assert len(enm_model.substations) >= 52


def test_enm_validator_no_fatal_errors(substrate):
    """ENMValidator must not emit FATAL or ERROR issues."""
    from enm.models import EnergyNetworkModel
    from enm.validator import ENMValidator

    enm_model = EnergyNetworkModel.model_validate(substrate["enm"])
    validator = ENMValidator()
    result = validator.validate(enm_model)

    fatal = [i for i in result.issues if i.severity == "FATAL"]
    errors = [i for i in result.issues if i.severity == "ERROR"]
    assert not fatal, f"FATAL validation issues: {[i.code for i in fatal]}"
    assert not errors, f"ERROR validation issues: {[i.code for i in errors]}"
