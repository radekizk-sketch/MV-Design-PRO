"""R10: laboratoryjne WMS bez żądań sieciowych do dostawców."""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from application.gis.psm_mdi_workflow_r08 import Rejected
from application.gis.wms_capabilities_r10 import (
    parse_capabilities, prepare_raster_layer, source_catalog,
)

router = APIRouter(prefix="/api/gis-lab/r10", tags=["GIS R10 — warstwy mapowe"])
MAX_BODY = 320_000
KEYS = {"schema", "source_id", "capabilities_xml", "layer_name", "consent"}


@router.get("/sources")
def sources() -> dict:
    return {"sources": source_catalog(), "external_requests_executed": False,
            "status": "OFFLINE_RESEARCH_ONLY"}


@router.post("/layer-preview")
async def layer_preview(request: Request) -> JSONResponse:
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") != str(request.base_url).rstrip("/"):
        raise HTTPException(status_code=403, detail={"code": "ORIGIN_FORBIDDEN"})
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_BODY:
            raise HTTPException(status_code=413, detail={"code": "INPUT_TOO_LARGE"})
    try:
        data = json.loads(body)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=422, detail={"code": "INVALID_JSON"}) from exc
    if (type(data) is not dict or set(data) != KEYS
            or data.get("schema") != "MV-GIS-WMS-R10"
            or type(data.get("consent")) is not bool
            or (data.get("layer_name") is not None
                and type(data.get("layer_name")) is not str)):
        raise HTTPException(status_code=422, detail={"code": "INVALID_ENVELOPE"})
    try:
        parsed = parse_capabilities(data["source_id"], data["capabilities_xml"])
        layer = None
        if data["layer_name"] is not None:
            layer = prepare_raster_layer(
                parsed, source_id=data["source_id"], layer_name=data["layer_name"],
                user_consented=data["consent"],
            )
    except (Rejected, ValueError, TypeError, KeyError) as exc:
        code = exc.code if isinstance(exc, Rejected) else "WMS_DATA_INVALID"
        raise HTTPException(status_code=422, detail={"code": code}) from exc
    result = {"capabilities": parsed, "maplibre_raster_source": layer,
              "external_requests_executed": False, "enm_write_allowed": False}
    response = JSONResponse(result)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
