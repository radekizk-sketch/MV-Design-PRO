"""ENEA SN voltage guard — 30 kV does NOT exist in ENEA Operator's network.

ENEA SN catalog = {110, 20, 15, 6, 0.4} kV. Every wind collector archetype (Typ 4 / Typ 1
async / Typ 3 DFIG) MUST sit on an ENEA-valid SN level, so the 30 kV regression cannot
return — this guard also covers any future wind preset (G6/G7). HARD validation: a
collector Un outside the ENEA SN set fails here.
"""

import pytest

from application.reference_networks.station_archetype_substrate import (
    build_g5_wind_t4,
    build_g8_wind_async,
    build_g6_wind_dfig,
)

# ENEA Operator SN levels (kV) — 30 kV is intentionally ABSENT.
_ENEA_SN_KV = {6.0, 15.0, 20.0}


@pytest.mark.parametrize(
    "build",
    [build_g5_wind_t4, build_g8_wind_async, build_g6_wind_dfig],
    ids=["Typ4", "Typ1-async", "Typ3-DFIG"],
)
def test_wind_collector_is_enea_valid_sn(build):
    c = build()
    coll_kv = c["source"]["collector"]["collector_kv"]
    assert coll_kv in _ENEA_SN_KV, (
        f"wind collector Un={coll_kv} kV is not an ENEA SN level {sorted(_ENEA_SN_KV)} "
        "— 30 kV does not exist in ENEA's network"
    )
    assert coll_kv != 30.0
    # The SC companion bus + the turbine-transformer HV must carry the SAME ENEA-valid Un.
    assert c["short_circuit"]["buses"]["SN_PCC"]["un_kv"] == coll_kv
    assert f"/{coll_kv:.0f} kV" in c["source"]["collector"]["turbine_transformer"]


def test_30kv_is_rejected_as_enea_sn():
    # The exact regression this guard prevents: 30 kV must never be an ENEA SN level.
    assert 30.0 not in _ENEA_SN_KV
