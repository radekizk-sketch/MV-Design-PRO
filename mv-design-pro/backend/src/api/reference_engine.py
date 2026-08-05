"""Reference Engine API — pakiety referencyjne + raport zgodności.

REFERENCE_ENGINE_SPEC_V1.md §9 (V12K-060):
  GET /api/reference/packs                          → lista pakietów (metadane)
  GET /api/reference/packs/{pack_id}                → pełny pakiet
  GET /api/cases/{case_id}/reference/compliance     → raport zgodności + score
      (?packs=a,b — opcjonalne zawężenie listy pakietów)
"""

from __future__ import annotations

from typing import Any

from enm.store import get_enm as _get_enm
from fastapi import APIRouter, HTTPException, Query
from reference_engine import evaluate_enm, get_reference_pack, list_reference_packs

router = APIRouter(prefix="/api", tags=["reference-engine"])


@router.get("/reference/packs")
async def list_packs() -> list[dict[str, Any]]:
    """Lista pakietów referencyjnych (metadane, bez pełnych profili)."""
    return [
        {
            "pack_id": pack.pack_id,
            "kind": pack.kind,
            "name_pl": pack.name_pl,
            "version": pack.version,
            "status": pack.status,
            "switchgear_family_ref": pack.switchgear_family_ref,
            "source_document_refs": pack.source_document_refs,
        }
        for pack in list_reference_packs()
    ]


@router.get("/reference/packs/{pack_id}")
async def get_pack(pack_id: str) -> dict[str, Any]:
    """Pełny pakiet referencyjny (profile pól, słownik symboli, reguły)."""
    try:
        pack = get_reference_pack(pack_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return pack.model_dump(mode="json")


@router.get("/cases/{case_id}/reference/compliance")
def get_reference_compliance(
    case_id: str,
    packs: str | None = Query(
        default=None,
        description="Opcjonalna lista pack_id po przecinku (domyślnie: wszystkie).",
    ),
) -> dict[str, Any]:
    """Raport zgodności referencyjnej + Reference Score dla ENM case'a."""
    enm = _get_enm(case_id)
    pack_ids: list[str] | None = None
    if packs:
        pack_ids = [p.strip() for p in packs.split(",") if p.strip()]
        try:
            for pack_id in pack_ids:
                get_reference_pack(pack_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    report = evaluate_enm(enm, pack_ids=pack_ids)
    return report.model_dump(mode="json")
