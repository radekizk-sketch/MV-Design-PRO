"""GIS R06 — badawczy interfejs porównywania SYNTETYCZNYCH eksportów.
Wylaczony w konfiguracji domyslnej. Zero zapisu ENM, danych operatora, solverow.
"""
from __future__ import annotations

import json

from application.gis.reconciliation_r06 import OdmowaGIS, compare_digpro
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/gis-lab/r06", tags=["GIS — laboratorium syntetyczne"])
MAX_BODY = 2_000_000
KEYS = {
    "schema", "synthetic", "enm_write_allowed", "before_digest",
    "after_digest", "scope_equal", "before", "after",
}


@router.get("/status")
def gis_status() -> dict:
    return {
        "status": "RESEARCH_ONLY", "source": "synthetic_only",
        "can_write_to_enm": False, "real_data_authorized": False,
        "maplibre_webgl_proven": False,
    }


@router.post("/reconcile")
async def gis_reconcile(request: Request) -> JSONResponse:
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

    if (
        type(data) is not dict
        or set(data) != KEYS
        or data.get("schema") != "MV-GIS-LAB-R06"
        or data.get("synthetic") is not True
        or data.get("enm_write_allowed") is not False
        or type(data.get("scope_equal")) is not bool
    ):
        raise HTTPException(status_code=422, detail={"code": "INVALID_LAB_ENVELOPE"})

    for name in ("before", "after"):
        layer = data[name]
        if type(layer) is not dict or type(layer.get("features")) is not list:
            raise HTTPException(status_code=422, detail={"code": "INVALID_LAYER"})
        for feature in layer["features"]:
            identity = feature.get("id") if type(feature) is dict else None
            if not isinstance(identity, str) or not any(
                marker in identity for marker in ("SYN-", "FIK-", "LAB-")
            ):
                raise HTTPException(status_code=422, detail={"code": "SYNTHETIC_IDS_REQUIRED"})

    try:
        report = compare_digpro(
            data["before"], data["after"],
            before_digest=data["before_digest"],
            after_digest=data["after_digest"],
            scope_equal=data["scope_equal"],
        )
    except (OdmowaGIS, ValueError, TypeError, KeyError) as exc:
        raise HTTPException(status_code=422, detail={"code": "INVALID_GEOMETRY_OR_DATA"}) from exc

    response = JSONResponse(report)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
