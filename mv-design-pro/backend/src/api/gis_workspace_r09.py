"""R09: wyłączone domyślnie API warsztatu syntetycznych projektów GIS."""
from __future__ import annotations

import json
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from application.gis.psm_mdi_workflow_r08 import Rejected
from application.gis.workspace_r09 import workspace_preview

router = APIRouter(prefix="/api/gis-lab/r09", tags=["GIS R09 — warsztat badawczy"])
MAX_BYTES = 1_500_000
FIELDS = {"schema", "synthetic", "source_id", "mapping", "geojson", "commands", "selected_id"}


@router.get("/status")
def status() -> dict:
    return {
        "status": "SYNTHETIC_LAB_ONLY", "enm_write_allowed": False,
        "real_data_authorized": False, "maplibre_webgl_proven": False,
    }


@router.post("/workspace-preview")
async def preview(request: Request) -> JSONResponse:
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") != str(request.base_url).rstrip("/"):
        raise HTTPException(status_code=403, detail={"code": "ORIGIN_FORBIDDEN"})
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_BYTES:
            raise HTTPException(status_code=413, detail={"code": "INPUT_TOO_LARGE"})
    try:
        data = json.loads(body)
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=422, detail={"code": "INVALID_JSON"}) from exc
    if type(data) is not dict or set(data) != FIELDS or data.get("schema") != "MV-GIS-WORKSPACE-REQUEST-R09":
        raise HTTPException(status_code=422, detail={"code": "INVALID_ENVELOPE"})
    if data.get("synthetic") is not True:
        raise HTTPException(status_code=403, detail={"code": "REAL_DATA_FORBIDDEN"})
    try:
        result = workspace_preview(
            data["geojson"], data["mapping"], data["source_id"],
            synthetic=True, commands=data["commands"], selected_id=data["selected_id"],
        )
    except (Rejected, ValueError, TypeError, KeyError, OverflowError) as exc:
        code = exc.code if isinstance(exc, Rejected) else "INVALID_WORKSPACE_DATA"
        raise HTTPException(status_code=422, detail={"code": code}) from exc
    response = JSONResponse(result)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
