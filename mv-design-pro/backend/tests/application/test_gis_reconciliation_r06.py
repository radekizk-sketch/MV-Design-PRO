from __future__ import annotations

import copy

import pytest

from application.gis.reconciliation_r06 import OdmowaGIS, check_geojson, compare_digpro

BASE = {
    "type": "FeatureCollection",
    "features": [
        {"type": "Feature", "id": "LINE-1", "properties": {
            "identity": "LINE-1", "category": "line_sn", "source_locked": True,
            "electrical_connection_confirmed": False,
        }, "geometry": {"type": "LineString", "coordinates": [[19, 53], [19.01, 53.01]]}},
        {"type": "Feature", "id": "ST-1", "properties": {
            "identity": "ST-1", "category": "station", "source_locked": True,
            "electrical_connection_confirmed": False,
        }, "geometry": {"type": "Point", "coordinates": [19.01, 53.01]}},
    ],
}
DIGEST = "a" * 64


def result(before=BASE, after=BASE, scope_equal=False):
    return compare_digpro(before, after, before_digest=DIGEST, after_digest="b" * 64, scope_equal=scope_equal)


def test_deterministic_independent_of_feature_order():
    reordered = copy.deepcopy(BASE)
    reordered["features"].reverse()
    assert result(before=reordered)["report_sha256"] == result()["report_sha256"]


def test_geometry_delta_not_electrical_length():
    modified = copy.deepcopy(BASE)
    modified["features"][0]["geometry"]["coordinates"][1] = [19.02, 53.02]
    r = result(after=modified)
    assert r["counts"]["GEOMETRY_CHANGE"] == 1
    assert r["electric_lengths_verified"] is False
    assert "delta_preview_m" in r["elements"][0]


def test_missing_never_means_delete_even_with_equal_scope():
    modified = copy.deepcopy(BASE)
    modified["features"].pop()
    r = result(after=modified, scope_equal=True)
    assert r["counts"]["NOT_OBSERVED"] == 1
    assert all(not entry["can_delete_from_enm"] for entry in r["elements"])


def test_no_electrical_connectivity():
    assert all(not item["can_apply_electric_topology"] for item in result()["elements"])
    assert result()["enm_write_allowed"] is False


def test_unknown_identifier_is_new_not_connected():
    modified = copy.deepcopy(BASE)
    f = copy.deepcopy(modified["features"][0])
    f["id"] = f["properties"]["identity"] = "LINE-2"
    modified["features"].append(f)
    assert result(after=modified)["counts"]["NEW_CANDIDATE"] == 1


def test_duplicate_is_rejected():
    modified = copy.deepcopy(BASE)
    modified["features"].append(copy.deepcopy(modified["features"][0]))
    with pytest.raises(OdmowaGIS, match="INVALID_OR_DUPLICATED_ID"):
        check_geojson(modified)


def test_ppe_column_is_rejected():
    modified = copy.deepcopy(BASE)
    modified["features"][0]["properties"]["PPE"] = "synthetic"
    with pytest.raises(OdmowaGIS, match="SENSITIVE_FIELD"):
        check_geojson(modified)


def test_fake_connection_rejected():
    modified = copy.deepcopy(BASE)
    modified["features"][0]["properties"]["electrical_connection_confirmed"] = True
    with pytest.raises(OdmowaGIS, match="MISSING_SOURCE_GUARD"):
        check_geojson(modified)


def test_invalid_coordinate_rejected():
    modified = copy.deepcopy(BASE)
    modified["features"][0]["geometry"]["coordinates"][1] = [float("nan"), 53]
    with pytest.raises(OdmowaGIS, match="INVALID_LINE"):
        check_geojson(modified)


def test_digest_missing():
    with pytest.raises(OdmowaGIS, match="INVALID_SOURCE_DIGEST"):
        compare_digpro(BASE, BASE, before_digest="bad", after_digest=DIGEST)
