"""API obiektu kabla nN — obliczenia odcinka, warianty przekroju, dowód obwodu (karta OBIEKT-KABEL-NN).

Odcinek wskazuje parametr zapytania ``cable_ref`` (identyfikatory gałęzi bywają ścieżkami
z ukośnikami). Każda trasa czyta model projektu (klucz Canonical Project Twin z `case_id`) i ostatnie
zakończone biegi rozpływu i zwarć przypadku jako źródło opcji; liczby powstają na
BIEŻĄCYM modelu (`application.analyses.kabel_nn`). Dowód obwodu nN powstaje z modelu i
biegu — dawny formularz ręcznych parametrów (`POST /api/nn-proof/circuit/pack|preview`,
syntetyczny identyfikator biegu) jest skasowany. Zero fizyki tutaj.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from api.klucz_twin_dep import KluczTwin
from application.analyses.kabel_nn import krok_w_kontrakcie as _krok_w_kontrakcie
from application.analyses.kabel_nn import (
    obliczenia_kabla_nn,
    warianty_przekroju_kabla_nn,
    wejscie_dowodu_kabla_nn,
)
from application.proof_engine.packs.lv_circuit_verification import (
    LVCircuitVerificationProofPack,
    serialize_lv_circuit_verification_pack,
)
from application.proof_engine.proof_pack import ProofPackContext, resolve_mv_design_pro_version
from enm.hash import compute_enm_hash
from enm.katalog_projektu import kontekst_katalogu
from enm.store import get_enm
from fastapi import APIRouter, HTTPException, Request, Response

router = APIRouter(prefix="/api/cases", tags=["kabel-nn"])


def _uow_factory(request: Request) -> Callable[[], Any] | None:
    return getattr(request.app.state, "uow_factory", None)


def _nazwy_projektu_i_przypadku(case_id: str, request: Request) -> tuple[str, str, str]:
    """(project_id, nazwa projektu, nazwa przypadku) z bazy — nagłówek dowodu."""
    uow_factory = _uow_factory(request)
    if uow_factory is None:
        return "", "Projekt", "Przypadek"
    try:
        parsed = UUID(case_id)
    except ValueError:
        return "", "Projekt", "Przypadek"
    with uow_factory() as uow:
        przypadek = uow.cases.get_study_case(parsed)
        if przypadek is None:
            return "", "Projekt", "Przypadek"
        projekt = uow.projects.get(przypadek.project_id)
        return (
            str(przypadek.project_id),
            projekt.name if projekt is not None else "Projekt",
            przypadek.name,
        )


@router.get("/{case_id}/enm/nn-cable")
def get_obliczenia_kabla_nn(
    case_id: str, cable_ref: str, klucz: KluczTwin, request: Request
) -> dict[str, Any]:
    """Obliczenia odcinka kabla nN: wielkości, kryteria (rekordy werdyktu), opcje ułożenia."""
    enm = get_enm(klucz)
    with kontekst_katalogu(enm):
        return obliczenia_kabla_nn(
            enm, cable_ref, case_id=case_id, uow_factory=_uow_factory(request)
        )


@router.get("/{case_id}/enm/nn-cable/warianty-przekroju")
def get_warianty_przekroju_kabla_nn(
    case_id: str, cable_ref: str, klucz: KluczTwin, request: Request
) -> dict[str, Any]:
    """Porównanie wariantów przekroju z katalogu kabli nN (ta sama funkcja obliczeń)."""
    enm = get_enm(klucz)
    with kontekst_katalogu(enm):
        return warianty_przekroju_kabla_nn(
            enm, cable_ref, case_id=case_id, uow_factory=_uow_factory(request)
        )


def _wejscie_dowodu(case_id: str, cable_ref: str, klucz: str, request: Request) -> tuple[Any, str]:
    enm = get_enm(klucz)
    project_id, nazwa_projektu, nazwa_przypadku = _nazwy_projektu_i_przypadku(case_id, request)
    with kontekst_katalogu(enm):
        wynik = wejscie_dowodu_kabla_nn(
            enm,
            cable_ref,
            case_id=case_id,
            project_name=nazwa_projektu,
            case_name=nazwa_przypadku,
            uow_factory=_uow_factory(request),
        )
    if wynik["status"] != "OK":
        raise HTTPException(status_code=422, detail=wynik.get("reason_pl") or "Brak danych.")
    return wynik["wejscie"], project_id or compute_enm_hash(enm)


@router.get("/{case_id}/enm/nn-cable/dowod")
def get_dowod_obwodu_kabla_nn(
    case_id: str, cable_ref: str, klucz: KluczTwin, request: Request
) -> dict[str, Any]:
    """Dowód weryfikacji obwodu nN (LV_CIRCUIT_VERIFICATION) dla kabla — z modelu i biegu."""
    wejscie, _project_id = _wejscie_dowodu(case_id, cable_ref, klucz, request)
    dokument = LVCircuitVerificationProofPack.generate(wejscie)
    return {
        **serialize_lv_circuit_verification_pack(dokument),
        "kroki": [_krok_w_kontrakcie(krok) for krok in dokument.steps],
    }


@router.get("/{case_id}/enm/nn-cable/dowod/pakiet")
def get_pakiet_dowodu_obwodu_kabla_nn(
    case_id: str, cable_ref: str, klucz: KluczTwin, request: Request
) -> Response:
    """Pakiet dowodowy obwodu nN (ZIP) — identyfikatory z modelu i biegu, nie syntetyczne."""
    wejscie, project_id = _wejscie_dowodu(case_id, cable_ref, klucz, request)
    enm = get_enm(klucz)
    rewizja = compute_enm_hash(enm)
    context = ProofPackContext(
        project_id=project_id,
        case_id=case_id,
        run_id=rewizja,
        snapshot_id=rewizja,
        mv_design_pro_version=resolve_mv_design_pro_version(),
    )
    content = LVCircuitVerificationProofPack.generate_zip(wejscie, context)
    return Response(
        content=content,
        media_type="application/zip",
        headers={
            "Content-Disposition": (
                f'attachment; filename="pakiet_dowodowy_obwod_nn__{cable_ref}.zip"'
            )
        },
    )
