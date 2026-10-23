"""Reference Engine API — pakiety referencyjne + raport zgodności.

REFERENCE_ENGINE_SPEC_V1.md §9 (V12K-060):
  GET /api/reference/packs                          → lista pakietów (metadane)
  GET /api/reference/packs/{pack_id}                → pełny pakiet
  GET /api/cases/{case_id}/reference/compliance     → raport zgodności + score
      (?packs=a,b — opcjonalne zawężenie listy pakietów)
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from typing import Any

from api.klucz_twin_dep import KluczTwin, przypadek_z_bazy
from enm.store import get_enm as _get_enm
from fastapi import APIRouter, HTTPException, Query, Request
from network_model.brak_zasobu import BrakZasobuError
from reference_engine import evaluate_enm, get_reference_pack, list_reference_packs
from reference_engine.enea_questions import answer_question
from reference_engine.registry import wymagaj_pakietu

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
    except BrakZasobuError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    payload = pack.model_dump(mode="json")
    if pack_id == "osd_enea":
        catalog_path = Path(__file__).resolve().parents[1] / "reference_engine/packs/osd_enea/source_catalog.json"
        payload["source_catalog"] = json.loads(catalog_path.read_text(encoding="utf-8"))
    return payload


@router.get("/reference/enea/pytanie")
def pytanie_o_standard_enea(
    pytanie: str = Query(min_length=3, max_length=600),
    data: str | None = Query(
        default=None,
        description="Data oceny wersji dokumentów, RRRR-MM-DD; domyślnie dzisiaj.",
    ),
) -> dict[str, Any]:
    """Pytania o ENEA: potwierdzone karty lub lokalne dowody, nigdy domysł.

    Pełnotekstowy indeks jest dostępny wyłącznie po świadomym ustawieniu
    ENEA_KNOWLEDGE_ENABLED=1 na serwerze. Bez tego dostępne są wyłącznie
    publiczne, zweryfikowane karty wymagań (zero ujawniania lokalnych PDF).
    """
    enabled = os.getenv("ENEA_KNOWLEDGE_ENABLED") == "1"
    default = Path.home() / ".local/share/mv-design-pro/enea-knowledge"
    data_dir = Path(os.getenv("ENEA_KNOWLEDGE_DATA_DIR", str(default))) if enabled else (
        Path("/__mv_design_pro_enea_index_disabled__")
    )
    try:
        return answer_question(pytanie, data_dir=data_dir, as_of=data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/cases/{case_id}/reference/compliance")
def get_reference_compliance(
    case_id: str,
    klucz: KluczTwin,
    request: Request,
    packs: str | None = Query(
        default=None,
        description="Opcjonalna lista pack_id po przecinku (domyślnie: wszystkie).",
    ),
) -> dict[str, Any]:
    """Raport zgodności referencyjnej + Reference Score dla ENM case'a.

    Karta OD-17a: bez ``?packs=`` raport ocenia pakiety norm i producentów oraz pakiet
    operatora wskazanego w przypadku; brak pakietu tego operatora = rekord w
    ``braki_pakietow``. Jawne żądanie pakietu operatora, którego rejestr nie ma → 422
    (nazwana odmowa ``BRAK_PAKIETU_OSD:<operator>``); nieznany identyfikator → 404.
    """
    enm = _get_enm(klucz)
    # Operator (`StudyCaseConfig.operator_profile_id`) i nazwa przypadku z bazy żądania.
    przypadek = przypadek_z_bazy(case_id, request.app.state.uow_factory)
    operator = przypadek.config.operator_profile_id
    nazwa_przypadku = przypadek.name
    pack_ids: list[str] | None = None
    if packs:
        pack_ids = [p.strip() for p in packs.split(",") if p.strip()]
        try:
            for pack_id in pack_ids:
                wymagaj_pakietu(pack_id, nazwa_przypadku=nazwa_przypadku)
        except BrakZasobuError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        report = evaluate_enm(enm, pack_ids=pack_ids)
    else:
        report = evaluate_enm(enm, operator_przypadku=operator, nazwa_przypadku=nazwa_przypadku)
    return report.model_dump(mode="json")
