"""Testy GIS R10: bezpieczeństwo WMS i poprawność szablonu MapLibre."""
from __future__ import annotations

from urllib.parse import parse_qs, urlsplit
import pytest
from fastapi.testclient import TestClient

from api.gis_lab_app_r09 import app
from application.gis.psm_mdi_workflow_r08 import Rejected
from application.gis.wms_capabilities_r10 import (
    parse_capabilities, prepare_raster_layer, source_catalog,
)

CAPABILITIES = """<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0" xmlns="http://www.opengis.net/wms">
 <Service><Title>Laboratorium syntetyczne</Title></Service>
 <Capability><Layer><Title>Warstwa nadrzędna</Title><CRS>EPSG:3857</CRS>
  <Layer queryable="1"><Name>TEST_ORTHO</Name><Title>Ortofotomapa testowa</Title></Layer>
  <Layer><Name>TEST_NESTED</Name><Title>Test zagnieżdżenia</Title></Layer>
 </Layer></Capability>
</WMS_Capabilities>"""
SOURCE = "GUGIK_ORTO"
client = TestClient(app)


def payload(xml=CAPABILITIES, name=None, consent=False):
    return {"schema": "MV-GIS-WMS-R10", "source_id": SOURCE,
            "capabilities_xml": xml, "layer_name": name, "consent": consent}


def test_catalog_offline():
    sources = source_catalog()
    assert len(sources) >= 3
    assert all(s["url"].startswith("https://") and not s["enabled"] for s in sources)


def test_capabilities_inherited_crs_and_titles():
    r = parse_capabilities(SOURCE, CAPABILITIES)
    assert r["version"] == "1.3.0"
    assert [l["name"] for l in r["layers"]] == ["TEST_ORTHO", "TEST_NESTED"]
    assert all(l["epsg3857"] for l in r["layers"])
    assert not r["verified_online"]


def test_deterministic_capabilities_digest():
    assert parse_capabilities(SOURCE, CAPABILITIES)["capabilities_digest"] == \
           parse_capabilities(SOURCE, CAPABILITIES)["capabilities_digest"]


def test_requires_explicit_consent():
    p = parse_capabilities(SOURCE, CAPABILITIES)
    with pytest.raises(Rejected, match="WMS_EXPLICIT_CONSENT_REQUIRED"):
        prepare_raster_layer(p, source_id=SOURCE, layer_name="TEST_ORTHO",
                             user_consented=False)


def test_maplibre_tile_placeholder_and_crs():
    p = parse_capabilities(SOURCE, CAPABILITIES)
    layer = prepare_raster_layer(p, source_id=SOURCE, layer_name="TEST_ORTHO",
                                 user_consented=True)
    url = layer["tiles"][0]
    query = parse_qs(urlsplit(url).query)
    assert query["BBOX"] == ["{bbox-epsg-3857}"]
    assert query["CRS"] == ["EPSG:3857"]
    assert query["VERSION"] == ["1.3.0"]
    assert query["LAYERS"] == ["TEST_ORTHO"]
    assert query["WIDTH"] == ["256"] and query["HEIGHT"] == ["256"]
    assert layer["network_request_executed"] is False


def test_unknown_layer_forbidden():
    p = parse_capabilities(SOURCE, CAPABILITIES)
    with pytest.raises(Rejected, match="WMS_LAYER_OR_CRS_UNVERIFIED"):
        prepare_raster_layer(p, source_id=SOURCE, layer_name="invented",
                             user_consented=True)


def test_no_3857_forbidden():
    xml = CAPABILITIES.replace("EPSG:3857", "EPSG:2180")
    p = parse_capabilities(SOURCE, xml)
    with pytest.raises(Rejected, match="WMS_LAYER_OR_CRS_UNVERIFIED"):
        prepare_raster_layer(p, source_id=SOURCE, layer_name="TEST_ORTHO",
                             user_consented=True)


def test_doctype_forbidden():
    xml = '<!DOCTYPE a [<!ENTITY x "danger">]>' + CAPABILITIES
    with pytest.raises(Rejected, match="WMS_XML_DTD_FORBIDDEN"):
        parse_capabilities(SOURCE, xml)


def test_unknown_source_forbidden():
    with pytest.raises(Rejected, match="WMS_SOURCE_NOT_ALLOWLISTED"):
        parse_capabilities("https://evil.invalid", CAPABILITIES)


def test_unsupported_version_forbidden():
    with pytest.raises(Rejected, match="WMS_VERSION_UNSUPPORTED"):
        parse_capabilities(SOURCE, CAPABILITIES.replace('version="1.3.0"', 'version="1.1.1"'))


def test_http_sources():
    r = client.get("/api/gis-lab/r10/sources")
    assert r.status_code == 200
    assert r.json()["external_requests_executed"] is False


def test_http_parse_offline():
    r = client.post("/api/gis-lab/r10/layer-preview", json=payload())
    assert r.status_code == 200, r.text
    assert r.json()["maplibre_raster_source"] is None
    assert r.json()["enm_write_allowed"] is False


def test_http_prepare_with_consent():
    r = client.post("/api/gis-lab/r10/layer-preview",
                    json=payload(name="TEST_ORTHO", consent=True))
    assert r.status_code == 200, r.text
    assert r.json()["maplibre_raster_source"]["type"] == "raster"


def test_http_prepare_without_consent():
    r = client.post("/api/gis-lab/r10/layer-preview",
                    json=payload(name="TEST_ORTHO", consent=False))
    assert r.status_code == 422
    assert r.json()["detail"]["code"] == "WMS_EXPLICIT_CONSENT_REQUIRED"


def test_http_origin_rejected():
    r = client.post("/api/gis-lab/r10/layer-preview", json=payload(),
                    headers={"Origin": "https://outside.invalid"})
    assert r.status_code == 403


def test_http_extra_field_rejected():
    p = payload()
    p["write_enm"] = True
    assert client.post("/api/gis-lab/r10/layer-preview", json=p).status_code == 422


def test_http_oversized_rejected():
    p = payload(xml="A" * 400_000)
    assert client.post("/api/gis-lab/r10/layer-preview", json=p).status_code == 413


def test_http_invalid_xml_rejected():
    r = client.post("/api/gis-lab/r10/layer-preview", json=payload(xml="<broken>"))
    assert r.status_code == 422 and r.json()["detail"]["code"] == "WMS_XML_INVALID"


def test_http_r10_page():
    r = client.get("/layers")
    assert r.status_code == 200
    assert "Źródła mapowe" in r.text
    assert "Wczytaj próbkę syntetyczną" in r.text
    assert r.headers["cache-control"] == "no-store"


def test_http_r09_page_still_available():
    r = client.get("/")
    assert r.status_code == 200
    assert "Źródła mapowe" in r.text
