"""R13: próby importu prawdziwego formatu SHP/DBF na danych syntetycznych."""
from pathlib import Path

import geopandas as gpd
import pytest
from shapely.geometry import LineString, Point, Polygon

from digpro_shp_preview_r13 import ImportShpRejected, preview_shp


def source(tmp_path: Path, geometries, ids=None, crs="EPSG:2180") -> Path:
    p = tmp_path / "SYN_SOURCE.shp"
    g = gpd.GeoDataFrame(
        {
            "SRC_ID": ids or [f"SYN-{i}" for i in range(len(geometries))],
            "CUSTOMER": ["PRIVATE_TEST"] * len(geometries),
        },
        geometry=geometries,
        crs=crs,
    )
    g.to_file(p, driver="ESRI Shapefile")
    return p


def test_shp_to_geojson_with_provenance(tmp_path):
    p = source(tmp_path, [Point(450000, 550000), Point(450010, 550020)])
    fc, man = preview_shp(p, id_field="SRC_ID")
    assert len(fc["features"]) == 2
    assert man["accepted_count"] == 2 and man["skipped_count"] == 0
    assert man["source_epsg"] == 2180 and man["output_epsg"] == 4326
    assert man["can_write_to_enm"] is False
    assert all("CUSTOMER" not in f["properties"] for f in fc["features"])
    assert len(man["source_sha256"]) == 64


def test_missing_companion_prj(tmp_path):
    p = source(tmp_path, [Point(450000, 550000)])
    p.with_suffix(".prj").unlink()
    with pytest.raises(ImportShpRejected, match="SHP_COMPANION_FILE_MISSING"):
        preview_shp(p, id_field="SRC_ID")


def test_wrong_crs_rejected(tmp_path):
    p = source(tmp_path, [Point(16.9, 52.4)], crs="EPSG:4326")
    with pytest.raises(ImportShpRejected, match="CRS_UNSUPPORTED_OR_MISSING"):
        preview_shp(p, id_field="SRC_ID")


def test_duplicate_ids(tmp_path):
    p = source(
        tmp_path, [Point(450000, 550000), Point(450001, 550001)],
        ids=["SYN-1", "SYN-1"],
    )
    with pytest.raises(ImportShpRejected, match="INVALID_OR_DUPLICATE_ID"):
        preview_shp(p, id_field="SRC_ID")


def test_polygon_skipped_and_declared(tmp_path):
    p = source(
        tmp_path, [Polygon([(450000, 550000), (450001, 550000), (450001, 550001)])]
    )
    fc, man = preview_shp(p, id_field="SRC_ID")
    assert len(fc["features"]) == 0 and man["skipped_count"] == 1


def test_3d_rejected(tmp_path):
    p = source(tmp_path, [Point(450000, 550000, 4)])
    with pytest.raises(ImportShpRejected, match="GEOMETRY_3D_REQUIRES_REVIEW"):
        preview_shp(p, id_field="SRC_ID")


def test_package_digest_changes_with_dbf(tmp_path):
    p = source(tmp_path, [Point(450000, 550000)])
    _, first = preview_shp(p, id_field="SRC_ID")
    file = p.with_suffix(".dbf")
    data = file.read_bytes().replace(b"PRIVATE_TEST", b"PRIVATE_TASTE")
    file.write_bytes(data)
    _, second = preview_shp(p, id_field="SRC_ID")
    assert first["source_sha256"] != second["source_sha256"]


def test_linestring_as_separate_shape_layer(tmp_path):
    p = source(tmp_path, [LineString([(450000, 550000), (450200, 550100)])])
    fc, _ = preview_shp(p, id_field="SRC_ID")
    assert len(fc["features"]) == 1
    assert fc["features"][0]["geometry"]["type"] == "LineString"
