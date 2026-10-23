"""GIS R05: cannot infer electrical connectivity or silently change ENM."""
from __future__ import annotations
import copy
import pytest
from application.gis.digpro_proposals import (
    ProposalRejected, preview_length_m, verify_geometry_proposal,
)
LINE={"type":"LineString","coordinates":[[19,53.265],[19.001,53.266]]}
OLD={"type":"LineString","coordinates":[[19,53.265],[19.0018,53.267]]}
DIGEST="a"*64

def proposal():
    return {
        "schema":"MV-DIGPRO-GIS-GEOMETRY-PROPOSALS-V1",
        "synthetic":True,"read_only_export":True,"enm_write_allowed":False,
        "electrical_topology_verified":False,"source_import_digest":DIGEST,
        "changes":[{
            "change_type":"NEW_ROUTE_GEOMETRY_REVIEW","id":"LAB-DRAFT-0001",
            "source_id":None,"geometry_before":None,"geometry_after":copy.deepcopy(LINE),
            "approximate_length_m":preview_length_m(LINE),
            "requires_topology_review":True,"requires_engineering_length_review":True,
        }],
    }

def verify(p):
    return verify_geometry_proposal(p,source_digest=DIGEST,existing_lines={"OLD":OLD})

def refused(update):
    p=proposal()
    update(p)
    with pytest.raises(ProposalRejected):
        verify(p)

def test_read_only_staging():
    result=verify(proposal())
    assert result["can_write_to_enm"] is False
    assert result["domain_operations"] == []
    assert result["electrical_length_m"] is None

def test_source_digest():refused(lambda p:p.update(source_import_digest="1"*64))
def test_enm_command_injection():refused(lambda p:p.update(domain_operations=[{"op":"delete"}]))
def test_false_topology():refused(lambda p:p.update(electrical_topology_verified=True))
def test_write_flag():refused(lambda p:p.update(enm_write_allowed=True))
def test_forbidden_change():refused(lambda p:p["changes"][0].update(change_type="DELETE_CONNECTION"))
def test_unknown_draft():refused(lambda p:p["changes"][0].update(id="BAD"))
def test_duplicate():refused(lambda p:p["changes"].append(copy.deepcopy(p["changes"][0])))
def test_false_length():refused(lambda p:p["changes"][0].update(approximate_length_m=100000))
def test_bad_geometry():refused(lambda p:p["changes"][0].update(geometry_after={"type":"LineString","coordinates":[[19,53]]}))
def test_no_review():refused(lambda p:p["changes"][0].update(requires_topology_review=False))
def test_existing_correct():
    p=proposal()
    p["changes"][0].update(change_type="EXISTING_ROUTE_GEOMETRY_REVIEW",id="OLD",source_id="OLD",geometry_before=OLD)
    assert verify(p)["ids"]==["OLD"]
def test_existing_wrong_baseline():
    refused(lambda p:p["changes"][0].update(change_type="EXISTING_ROUTE_GEOMETRY_REVIEW",id="OLD",source_id="OLD",geometry_before=LINE))
def test_no_real_source_without_authorization():
    with pytest.raises(ProposalRejected):
        verify_geometry_proposal(proposal(),source_digest=DIGEST,existing_lines={},synthetic=False)
