"""Reference Engine API — pakiety referencyjne + raport zgodności.

REFERENCE_ENGINE_SPEC_V1.md §9 (V12K-060):
  GET /api/reference/packs                          → lista pakietów (metadane)
  GET /api/reference/packs/{pack_id}                → pełny pakiet
  GET /api/cases/{case_id}/reference/compliance     → raport zgodności + score
      (?packs=a,b — opcjonalne zawężenie listy pakietów)
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from api.klucz_twin_dep import KluczTwin
from enm.store import get_enm as _get_enm
from fastapi import APIRouter, HTTPException, Query, Request
from network_model.brak_zasobu import BrakZasobuError
from reference_engine import evaluate_enm, get_reference_pack, list_reference_packs
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
    return pack.model_dump(mode="json")


def _operator_i_nazwa_przypadku(case_id: str, request: Request) -> tuple[str, str]:
    """Operator (``StudyCaseConfig.operator_profile_id``) i nazwa przypadku z bazy.

    Zależność ``KluczTwin`` już potwierdziła, że przypadek istnieje w bazie; brak rekordu
    tutaj byłby niespójnością magazynu (błąd programu → 500, nie odmowa danych).
    """
    uow_factory = request.app.state.uow_factory
    with uow_factory() as uow:
        przypadek = uow.cases.get_study_case(UUID(case_id))
    if przypadek is None:
        raise RuntimeError(f"Przypadek {case_id} zniknął z bazy po rozwiązaniu klucza modelu.")
    return przypadek.config.operator_profile_id, przypadek.name


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
    operator, nazwa_przypadku = _operator_i_nazwa_przypadku(case_id, request)
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
