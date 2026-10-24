"""R09: testy kontraktu warsztatu GIS na danych syntetycznych."""
from __future__ import annotations

import copy
import pytest
from fastapi.testclient import TestClient

from api.gis_lab_app_r09 import app
from application.gis.psm_mdi_workflow_r08 import Rejected
from application.gis.workspace_r09 import workspace_preview

MAPPING = {
    "id": "oid", "category": "typ", "name": "nazwa", "parent": "rodzic",
    "voltage_kv": "un", "from_port": "od", "to_port": "do", "measurement": "pomiar",
}


def feature(oid, kind, geom, parent=None, p1=None, p2=None):
    return {"type": "Feature", "geometry": geom, "properties": {
        "oid": oid, "typ": kind, "nazwa": oid, "rodzic": parent, "un": 15.0,
        "od": p1, "do": p2, "pomiar": None,
    }}


FC = {"type": "FeatureCollection", "features": [
    feature("SYN-ST-1", "station", {"type": "Point", "coordinates": [16.9, 52.4]}),
    feature("SYN-FD-1", "feeder", {"type": "Point", "coordinates": [16.9, 52.4]}, "SYN-ST-1"),
    feature("SYN-LN-1", "cable", {"type": "LineString", "coordinates": [[16.9, 52.4], [16.901, 52.401]]},
            "SYN-FD-1", "SYN-PORT-A", "SYN-PORT-B"),
]}


def command(patch=None, rev=0, cid="SYN-CMD-1"):
    return {"type": "EDIT", "expected_revision": rev, "command_id": cid,
            "asset_id": "SYN-LN-1", "patch": patch or {"name": "Kabel po zmianie"}}


def preview(commands=None, fc=None):
    return workspace_preview(copy.deepcopy(FC if fc is None else fc), MAPPING, "SYN-IMPORT",
                             synthetic=True, commands=commands or [], selected_id="SYN-LN-1")


def envelope():
    return {"schema": "MV-GIS-WORKSPACE-REQUEST-R09", "synthetic": True,
            "source_id": "SYN-IMPORT", "mapping": MAPPING, "geojson": FC,
            "commands": [], "selected_id": "SYN-LN-1"}


client = TestClient(app)


def test_import_tree_and_inspector():
    r = preview()
    assert r["revision"] == 0 and len(r["hierarchy"]) == 3
    assert r["selected"]["id"] == "SYN-LN-1"
    assert r["changes"] == []
    assert r["can_write_enm"] is False


def test_deterministic_draft():
    assert preview([command()])["draft_digest"] == preview([command()])["draft_digest"]


def test_attribute_edit():
    r = preview([command()])
    assert r["selected"]["name"] == "Kabel po zmianie"
    assert r["changes"][0]["change"] == "ATTRIBUTES"
    assert r["changes"][0]["requires_engineering_length_review"] is False


def test_geometry_edit_is_not_electric_length():
    g = {"type": "LineString", "coordinates": [[16.9, 52.4], [16.902, 52.403]]}
    r = preview([command({"geometry": g})])
    assert r["changes"][0]["change"] == "GEOMETRY"
    assert r["changes"][0]["requires_engineering_length_review"] is True
    assert "electric_length_m" not in r["selected"]
    assert r["selected"]["source_geometry"] != r["selected"]["geometry"]


def test_revision_guard():
    with pytest.raises(Rejected, match="STALE_REVISION"):
        preview([command(rev=8)])


def test_duplicate_command_guard():
    with pytest.raises(Rejected, match="COMMAND_DUPLICATE"):
        preview([command(), command(rev=1)])


@pytest.mark.parametrize("patch", [
    {"topology_confirmed": True}, {"catalog_ref": "CAT-X"}, {"enm_ref": "x"},
])
def test_domain_fields_forbidden(patch):
    with pytest.raises(Rejected, match="PATCH_FIELDS_FORBIDDEN"):
        preview([command(patch)])


def test_publish_operation_forbidden():
    cmd = command()
    cmd["type"] = "PUBLISH_ENM"
    with pytest.raises(Rejected, match="COMMAND_TYPE_FORBIDDEN"):
        preview([cmd])


def test_missing_parent_is_blocker():
    r = preview([command({"parent_id": "SYN-UNKNOWN"})])
    assert any(x["code"] == "PARENT_MISSING" for x in r["validation"]["issues"])


def test_cycle_is_blocker():
    c = command({"parent_id": "SYN-LN-1"})
    c["asset_id"] = "SYN-ST-1"
    r = preview([c])
    assert any(x["code"] == "PARENT_CYCLE" for x in r["validation"]["issues"])


def test_source_not_modified():
    before = copy.deepcopy(FC)
    preview([command()])
    assert before == FC


def test_no_topology_in_geojson():
    r = preview()
    assert all(x["properties"]["enm_write_allowed"] is False for x in r["geojson"]["features"])
    assert all("port_refs_claimed" not in x["properties"] for x in r["geojson"]["features"])


def test_http_status():
    r = client.get("/api/gis-lab/r09/status")
    assert r.status_code == 200 and r.json()["enm_write_allowed"] is False


def test_http_workspace():
    r = client.post("/api/gis-lab/r09/workspace-preview", json=envelope())
    assert r.status_code == 200, r.text
    assert r.json()["publication"]["can_publish"] is False
    assert r.headers["cache-control"] == "no-store"


def test_http_edit():
    p = envelope()
    p["commands"] = [command()]
    r = client.post("/api/gis-lab/r09/workspace-preview", json=p)
    assert r.status_code == 200 and r.json()["revision"] == 1


def test_http_real_data_forbidden():
    p = envelope()
    p["synthetic"] = False
    assert client.post("/api/gis-lab/r09/workspace-preview", json=p).status_code == 403


def test_http_cross_origin_forbidden():
    assert client.post("/api/gis-lab/r09/workspace-preview", json=envelope(),
                       headers={"Origin": "https://external.invalid"}).status_code == 403


def test_http_stale_revision_rejected():
    p = envelope()
    p["commands"] = [command(rev=7)]
    r = client.post("/api/gis-lab/r09/workspace-preview", json=p)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "STALE_REVISION"


def test_http_invalid_envelope():
    p = envelope()
    p["write_enm"] = True
    assert client.post("/api/gis-lab/r09/workspace-preview", json=p).status_code == 422


def test_http_too_large():
    p = envelope()
    p["geojson"] = {"huge": "x" * 1_600_000}
    assert client.post("/api/gis-lab/r09/workspace-preview", json=p).status_code == 413
