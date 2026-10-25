from __future__ import annotations

import json
from pathlib import Path
import geopandas as gpd
import pytest
from shapely.geometry import LineString, Point, Polygon
from gpkg_preview_r12 import preview_gpkg, ImportGpkgRejected


def gpkg(tmp_path: Path, geometries, ids=None, crs='EPSG:2180') -> Path:
    p=tmp_path/'source.gpkg'
    g=gpd.GeoDataFrame({'external_id': ids or [f'SYN-{i}' for i in range(len(geometries))],
                        'sensitive_column': ['not-exported']*len(geometries)},
                       geometry=geometries,crs=crs)
    g.to_file(p,layer='cable_layer',driver='GPKG')
    return p


def test_lines_and_points_with_explicit_skips(tmp_path):
    p=gpkg(tmp_path,[Point(450000,550000), LineString([(450000,550000),(450100,550050)]),
                    Polygon([(450000,550000),(450001,550000),(450001,550001),(450000,550000)])])
    geo, report=preview_gpkg(p,layer='cable_layer',id_field='external_id')
    assert report['source_count']==3
    assert report['accepted_count']==2
    assert report['skipped_count']==1
    assert report['skipped'][0]['type']=='Polygon'
    assert report['source_epsg']==2180 and report['output_epsg']==4326
    assert all(-180<x['geometry']['coordinates'][0]<180 for x in geo['features'] if x['geometry']['type']=='Point')
    assert all('sensitive_column' not in x['properties'] for x in geo['features'])
    assert report['can_write_to_enm'] is False
    assert report['electrical_topology_verified'] is False


def test_rejects_unknown_crs(tmp_path):
    p=gpkg(tmp_path,[Point(16.9,52.4)],crs='EPSG:4326')
    with pytest.raises(ImportGpkgRejected,match='CRS_UNSUPPORTED_OR_UNKNOWN'):
        preview_gpkg(p,layer='cable_layer',id_field='external_id')


def test_duplicate_ids(tmp_path):
    p=gpkg(tmp_path,[Point(450000,550000),Point(450100,550100)],ids=['SYN-1','SYN-1'])
    with pytest.raises(ImportGpkgRejected,match='INVALID_OR_DUPLICATED_ID'):
        preview_gpkg(p,layer='cable_layer',id_field='external_id')


def test_missing_column(tmp_path):
    p=gpkg(tmp_path,[Point(450000,550000)])
    with pytest.raises(ImportGpkgRejected,match='FEATURE_LIMIT_OR_COLUMN_MISSING'):
        preview_gpkg(p,layer='cable_layer',id_field='ref_id')


def test_3d_requires_review(tmp_path):
    p=gpkg(tmp_path,[Point(450000,550000,50)])
    with pytest.raises(ImportGpkgRejected,match='3D_REQUIRES_EXPLICIT_ENGINEERING_REVIEW'):
        preview_gpkg(p,layer='cable_layer',id_field='external_id')


def test_nonexistent_layer(tmp_path):
    p=gpkg(tmp_path,[Point(450000,550000)])
    with pytest.raises(ImportGpkgRejected,match='LAYER_UNKNOWN'):
        preview_gpkg(p,layer='wrong',id_field='external_id')


def test_missing_file(tmp_path):
    with pytest.raises(FileNotFoundError):
        preview_gpkg(tmp_path/'missing.gpkg',layer='a',id_field='external_id')


def test_deterministic_except_sha_of_unmodified_file(tmp_path):
    p=gpkg(tmp_path,[LineString([(450000,550000),(450200,550090)])])
    a,report_a=preview_gpkg(p,layer='cable_layer',id_field='external_id')
    b,report_b=preview_gpkg(p,layer='cable_layer',id_field='external_id')
    assert json.dumps(a,sort_keys=True)==json.dumps(b,sort_keys=True)
    assert report_a==report_b
