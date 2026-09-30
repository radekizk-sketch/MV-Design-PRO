"""Koordynacja zabezpieczeń nadprądowych (E-28) — montaż pod /api.

Karta BIEG-ZABEZPIECZEN-Z-MODELU (decyzja D-21): urządzenia i nastawy pochodzą z BIEŻĄCEGO
modelu projektu (``protection_assignments``), prądy — z zapisanych biegów zwarciowych
maksymalnego i minimalnego (prąd przekaźnika z rozpływu prądu zwarciowego, jedna ścieżka
``application.analyses.protection.ocena_nadpradowa``), prądy robocze — z biegu rozpływu.
Żądanie niesie WYŁĄCZNIE identyfikatory biegów, opcjonalne pary stopniowania i kryteria —
lista urządzeń, nastawy i prądy od klienta zostały skasowane (dawny kontrakt przyjmował
szablony urządzeń ekranu, pary z kolejności listy i prądy jako liczby z żądania).

Końcówki (pełna ścieżka zaczyna się od /api/protection-coordination):
- POST /projects/{project_id}/run — koordynacja urządzeń modelu na biegach,
- GET /{run_id} — pełny wynik (sprawdzenia, charakterystyki TCC, znaczniki, ślad White Box,
  urządzenia z nastawami, odmowy, pary),
- GET /{run_id}/export/{pdf,docx} — raport.

Dawne podtrasy `/tcc`, `/trace`, `/checks/{sensitivity,selectivity,overload}` skasowane — bez
konsumenta (ekran czyta pełny wynik jednym odczytem); każda niosła wycinek tego samego słownika.
"""

from __future__ import annotations

import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from application.analyses.protection.coordination.models import CoordinationConfig
from application.analyses.protection.coordination.z_biegow import (
    OdmowaKoordynacji,
    koordynacja_z_biegow,
)
from application.autorytet_biegu_zwarciowego import BiegNiemiarodajnyError
from application.twin_key import klucz_twin_dla_projektu
from enm.store import get_enm
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from infrastructure.persistence.unit_of_work import UnitOfWork
from network_model.core.autorytet_wyniku_zwarciowego import BrakAutorytetuWyniku
from pydantic import BaseModel, Field

router = APIRouter(prefix="/protection-coordination", tags=["protection-coordination"])


class CoordinationConfigRequest(BaseModel):
    """Kryteria koordynacji (założenia projektowe, jawne w wyniku jako wartości wymagane)."""

    model_config = {"extra": "forbid"}

    breaker_time_s: float = Field(0.05, ge=0, description="Czas własny wyłącznika [s]")
    relay_overtravel_s: float = Field(0.05, ge=0, description="Wybieg przekaźnika [s]")
    safety_factor_s: float = Field(0.1, ge=0, description="Zapas bezpieczeństwa [s]")
    sensitivity_ratio_required: float = Field(
        1.5, ge=1.0, description="Wymagany iloraz czułości I_min/I_s"
    )
    overload_ratio_required: float = Field(
        1.2, ge=1.0, description="Wymagany iloraz przeciążalności I_s/I_rob"
    )


class ParaRequest(BaseModel):
    """Para stopniowania wskazana przez projektanta — sprawdzana wobec topologii modelu."""

    nadrzedne_ref: str
    podrzedne_ref: str


class RunCoordinationRequest(BaseModel):
    """Żądanie koordynacji — identyfikatory biegów, pary (opcjonalnie) i kryteria.

    ``sc_run_id`` (bieg MAX) i ``sc_run_id_min`` (bieg MIN) są wymagane przy wykonaniu; pola
    ``str | None`` na poziomie pydantic, żeby brak dał komunikat mostu autorytetu po polsku.
    ``pary`` puste = pary z topologii (zawieranie stref urządzeń).
    """

    model_config = {"extra": "forbid"}

    sc_run_id: str | None = None
    sc_run_id_min: str | None = None
    pf_run_id: str | None = None
    pary: list[ParaRequest] | None = None
    config: CoordinationConfigRequest | None = None


class CoordinationSummaryResponse(BaseModel):
    """Potwierdzenie wykonania — liczby zbiorcze bez werdyktu (P-06); pełny wynik: GET."""

    run_id: str
    project_id: str
    total_devices: int
    total_checks: int
    najmniejszy_odstep_s: float | None
    najmniejszy_iloraz_czulosci: float | None
    najmniejszy_iloraz_przeciazalnosci: float | None


#: Wyniki koordynacji w pamięci procesu (dług nazwany w meldunku karty — wynik E-28 nie jest
#: biegiem kanonicznym R1).
_coordination_results: dict[str, dict[str, Any]] = {}


@router.post(
    "/projects/{project_id}/run",
    status_code=status.HTTP_201_CREATED,
    response_model=CoordinationSummaryResponse,
)
def run_coordination_analysis(
    project_id: UUID,
    request: RunCoordinationRequest,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Koordynacja urządzeń zabezpieczeniowych BIEŻĄCEGO modelu projektu na zapisanych biegach.

    Odmowy (422, ``{"powod", "komunikat_pl", ...}``): bieg niemiarodajny (most autorytetu),
    wejście DER niemiarodajne, sieć zmieniona od biegu (poza zabezpieczeniami), rodzaj zwarcia
    inny niż 3F/2F, bieg rozpływu niewłaściwy, model bez zabezpieczeń nadprądowych.
    """
    model = get_enm(klucz_twin_dla_projektu(project_id, uow_factory))
    return wykonaj_koordynacje(model=model, project_id=project_id, request=request)


def wykonaj_koordynacje(*, model: Any, project_id: UUID, request: RunCoordinationRequest) -> dict:
    """Wspólne wykonanie końcówki (API i generator fikstur harnessu — ta sama funkcja)."""
    config = (
        CoordinationConfig(**request.config.model_dump())
        if request.config is not None
        else CoordinationConfig()
    )
    try:
        result = koordynacja_z_biegow(
            model=model,
            project_id=str(project_id),
            sc_run_id=request.sc_run_id,
            sc_run_id_min=request.sc_run_id_min,
            pf_run_id=request.pf_run_id,
            pary_wskazane=(
                [(p.nadrzedne_ref, p.podrzedne_ref) for p in request.pary] if request.pary else None
            ),
            config=config,
        )
    except BiegNiemiarodajnyError as brak:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"powod": brak.powod, "komunikat_pl": brak.komunikat_pl},
        ) from brak
    except BrakAutorytetuWyniku as brak:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "powod": "WEJSCIE_NIEMIARODAJNE",
                "blokady": [b.to_dict() for b in brak.blokady],
            },
        ) from brak
    except OdmowaKoordynacji as odmowa:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"powod": odmowa.powod, "komunikat_pl": odmowa.komunikat_pl},
        ) from odmowa

    _coordination_results[result.run_id] = result.to_dict()
    summary = result.summary
    return {
        "run_id": result.run_id,
        "project_id": result.project_id,
        "total_devices": summary["total_devices"],
        "total_checks": summary["total_checks"],
        "najmniejszy_odstep_s": summary["selectivity"]["najmniejszy_odstep_s"],
        "najmniejszy_iloraz_czulosci": summary["sensitivity"]["najmniejszy_iloraz"],
        "najmniejszy_iloraz_przeciazalnosci": summary["overload"]["najmniejszy_iloraz"],
    }


@router.get(
    "/{run_id}",
    response_model=dict[str, Any],
)
def get_coordination_result(run_id: str) -> dict[str, Any]:
    """Pełny wynik koordynacji: sprawdzenia czułości, selektywności i przeciążalności (liczby
    z wartościami wymaganymi i zdaniem, bez werdyktu — P-06), charakterystyki TCC, znaczniki,
    urządzenia modelu z nastawami, pary, odmowy i ślad White Box."""
    result = _coordination_results.get(run_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nie znaleziono wyniku koordynacji zabezpieczeń: {run_id}",
        )
    return result


# =============================================================================
# EXPORTS (karta ZAB-100-BACKEND — reuzycie network_model/reporting/protection_report_*)
# =============================================================================
#
# Reuzywa ISTNIEJACA, juz przetestowana pod katem determinizmu binarnego
# infrastrukture eksportow koordynacji zabezpieczen (FIX-12/FIX-12C):
#   - network_model/reporting/protection_report_pdf.py
#       (reportlab, invariant=1 + pageCompression=0 — ta sama technika co
#       power_flow_comparisons.py)
#   - network_model/reporting/protection_report_docx.py
#       (python-docx + network_model/reporting/docx_determinism.py — normalizuje
#       znaczniki czasu wpisu ZIP i docProps/core.xml, ktorych SAM python-docx
#       NIE zeruje: dwa kolejne Document().save() roznia sie bajtowo, gdy wywolania
#       przetna granice sekundy, bo zipfile znakuje kazdy wpis biezacym czasem
#       lokalnym — ta sama klasa niedeterminizmu jak w karcie 10x „czas scienny").
#       Zamierzenie: NIE kopiowac inline wzorca `power_flow_comparisons.py`
#       `doc.save(buffer)` bez normalizacji — ten wzorzec ma ten sam defekt
#       (zweryfikowane empirycznie w audycie tras tej karty), poza zakresem tej
#       karty (inny modul API), ale odnotowane w meldunku koncowym.
#
# Oba moduly pracuja na Path (nie na strumieniu w pamieci), wiec eksport API
# pisze do pliku tymczasowego i odczytuje bajty z powrotem — plik znika wraz
# z TemporaryDirectory, do odpowiedzi trafiaja tylko bajty.


@router.get(
    "/{run_id}/export/pdf",
    summary="Eksportuj wynik koordynacji zabezpieczeń do PDF",
)
def export_coordination_pdf(run_id: str) -> Response:
    """Eksport wyniku koordynacji zabezpieczen nadprądowych do PDF.

    Deterministyczny: ten sam zapisany wynik (`run_id`) eksportowany
    wielokrotnie daje identyczne bajty (reportlab invariant mode — patrz
    `network_model/reporting/protection_report_pdf.py`).
    """
    result = _coordination_results.get(run_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nie znaleziono wyniku koordynacji zabezpieczeń: {run_id}",
        )

    # Brak reportlab rozstrzyga sam moduł raportu (`_PDF_AVAILABLE`); `ImportError` modułu
    # pakietu byłby defektem wydania, nie „eksport niedostępny" (karta #151).
    from network_model.reporting.protection_report_pdf import (
        _PDF_AVAILABLE,
        export_protection_coordination_to_pdf,
    )

    if not _PDF_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Eksport PDF wymaga biblioteki reportlab — brak jej w instalacji serwera.",
        )

    with tempfile.TemporaryDirectory() as tmp_dir:
        output_path = Path(tmp_dir) / f"protection_coordination_{run_id}.pdf"
        export_protection_coordination_to_pdf(
            result,
            output_path,
            metadata={"created_at": result.get("created_at")},
        )
        pdf_bytes = output_path.read_bytes()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="protection_coordination_{run_id}.pdf"'
        },
    )


@router.get(
    "/{run_id}/export/docx",
    summary="Eksportuj wynik koordynacji zabezpieczeń do DOCX",
)
def export_coordination_docx(run_id: str) -> Response:
    """Eksport wyniku koordynacji zabezpieczen nadprądowych do DOCX.

    Deterministyczny: ten sam zapisany wynik (`run_id`) eksportowany
    wielokrotnie daje identyczne bajty (`docx_determinism.make_docx_bytes_deterministic`
    — patrz `network_model/reporting/protection_report_docx.py`).
    """
    result = _coordination_results.get(run_id)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Nie znaleziono wyniku koordynacji zabezpieczeń: {run_id}",
        )

    # Jak wyżej dla PDF: brak python-docx rozstrzyga `_DOCX_AVAILABLE` (karta #151).
    from network_model.reporting.protection_report_docx import (
        _DOCX_AVAILABLE,
        export_protection_coordination_to_docx,
    )

    if not _DOCX_AVAILABLE:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Eksport DOCX wymaga biblioteki python-docx — brak jej w instalacji serwera.",
        )

    with tempfile.TemporaryDirectory() as tmp_dir:
        output_path = Path(tmp_dir) / f"protection_coordination_{run_id}.docx"
        export_protection_coordination_to_docx(
            result,
            output_path,
            metadata={"created_at": result.get("created_at")},
        )
        docx_bytes = output_path.read_bytes()

    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": f'attachment; filename="protection_coordination_{run_id}.docx"'
        },
    )
