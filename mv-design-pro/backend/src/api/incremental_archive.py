"""
API endpoints dla paczki zmian archiwum projektu (eksport/import przyrostowy).

POST /projects/{project_id}/export/incremental — paczka zmian otwartego projektu
                                                 względem przesłanego archiwum bazowego
POST /projects/import/incremental              — archiwum bazowe + paczka zmian →
                                                 NOWY projekt (jak import pełny)

BEZ STANU W PROCESIE (karta ARCHIWUM PROJEKTU, 2026-09-24). Do tej karty baza
paczki żyła w trzech słownikach modułu (`_last_fingerprints`,
`_last_full_archive`, `_export_history`) chronionych blokadą na projekt, a import
nakładał paczkę na archiwum trzymane w pamięci i NIGDZIE go nie zapisywał —
odpowiedź „Nałożono N sekcji" nie zmieniała żadnego projektu. Co gorsza, baza
importu nie mogła się zgodzić z paczką: projekt odtworzony z archiwum dostaje
nowe identyfikatory (inny odcisk), a ten sam projekt po drugim eksporcie ma
w pamięci już NOWY stan (paczka wskazuje poprzedni) — każdy import kończył się
niezgodnością odcisku bazy. Teraz baza to plik archiwum, który obie strony mają:
eksport liczy paczkę względem niego, import nakłada paczkę na niego i zapisuje
wynik jako nowy projekt tą samą drogą co import pełny. Stan w pamięci, blokady
i historia eksportów (lista w pamięci, gubiona przy restarcie) zniknęły.

BŁĘDY: archiwum bazowe albo paczka nieczytelne / niezgodne ze schematem (brak
pola na dowolnym poziomie, ze ścieżką) / w niezgodnej wersji / z naruszoną
integralnością → 422 z polskim komunikatem nazywającym plik; paczka policzona
względem innego archiwum → 409; projekt nieistniejący → 404; złe rozszerzenie
pliku → 400. Każdy inny wyjątek wybucha (500) — to błąd programu, nie wejścia.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from application.project_archive.service import (
    EksportPrzyrostowy,
    ImportPrzyrostowy,
    ProjectArchiveService,
)
from domain.incremental_archive import (
    BaseHashMismatchError,
    IncrementalArchiveError,
)
from domain.project_archive import ArchiveError, ArchiveProjectNotFoundError
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

router = APIRouter(prefix="/projects", tags=["incremental-archive"])

_ROZSZERZENIA_ARCHIWUM = (".zip", ".mvdp.zip")
_ROZSZERZENIA_PACZKI = (".zip", ".mvdp-delta.zip")


class IncrementalImportResponse(BaseModel):
    """Wynik importu paczki zmian — kształt `ImportResponse` importu pełnego
    (ten sam zapis nowego projektu) + liczba nałożonych sekcji."""

    status: str  # SUCCESS, CATALOG_MAPPING_REQUIRED
    project_id: str | None
    warnings: list[str]
    errors: list[str]
    migrated_from_version: str | None
    elements_without_catalog: list[str] = []
    catalog_mapping_required: bool = False
    sections_applied: int


def _sprawdz_rozszerzenie(plik: UploadFile, dozwolone: tuple[str, ...], opis: str) -> None:
    """400 dla pliku o złym rozszerzeniu (wielkość liter bez znaczenia — jak w UI)."""
    nazwa = (plik.filename or "").lower()
    if not nazwa.endswith(dozwolone):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Nieprawidłowe rozszerzenie pliku ({opis}). "
                f"Oczekiwano {' lub '.join(dozwolone)}"
            ),
        )


@router.post("/{project_id}/export/incremental")
async def export_incremental(
    project_id: UUID,
    base_file: UploadFile = File(description="Archiwum bazowe (ZIP), które odbiorca już ma"),
    uow_factory: Any = Depends(get_uow_factory),
) -> Response:
    """Paczka zmian projektu względem archiwum bazowego (plik ZIP do pobrania).

    Nagłówki `X-*` niosą metryki (sekcje zmienione/niezmienione, rozmiary,
    oszczędność) — te same, które liczy `compute_export_result`.
    """
    _sprawdz_rozszerzenie(base_file, _ROZSZERZENIA_ARCHIWUM, "archiwum bazowe")
    bajty_bazy = await base_file.read()

    def _eksportuj() -> EksportPrzyrostowy:
        with uow_factory() as uow:
            service = ProjectArchiveService(uow.session)
            try:
                return service.export_incremental(project_id, bajty_bazy)
            except ArchiveProjectNotFoundError as e:
                raise HTTPException(status_code=404, detail=str(e)) from e
            except ArchiveError as e:
                raise HTTPException(status_code=422, detail=f"Archiwum bazowe: {e}") from e

    eksport = await run_in_threadpool(_eksportuj)
    wynik = eksport.wynik
    return Response(
        content=eksport.bajty,
        media_type="application/zip",
        headers={
            "Content-Disposition": (f'attachment; filename="zmiany_{project_id}.mvdp-delta.zip"'),
            "X-Export-Type": eksport.paczka.export_type.value,
            "X-Sections-Changed": str(wynik.sections_changed),
            "X-Sections-Unchanged": str(wynik.sections_unchanged),
            "X-Size-Full": str(wynik.size_full_bytes),
            "X-Size-Delta": str(wynik.size_delta_bytes),
            "X-Savings-Percent": str(wynik.savings_percent),
            "Access-Control-Expose-Headers": (
                "X-Export-Type, X-Sections-Changed, X-Sections-Unchanged, "
                "X-Size-Full, X-Size-Delta, X-Savings-Percent"
            ),
        },
    )


@router.post("/import/incremental", response_model=IncrementalImportResponse)
async def import_incremental(
    base_file: UploadFile = File(description="Archiwum bazowe (ZIP)"),
    delta_file: UploadFile = File(description="Paczka zmian (ZIP)"),
    new_name: str | None = Form(None, description="Nazwa nowego projektu (opcjonalna)"),
    uow_factory: Any = Depends(get_uow_factory),
) -> IncrementalImportResponse:
    """Nałóż paczkę zmian na archiwum bazowe i zapisz wynik jako nowy projekt."""
    _sprawdz_rozszerzenie(base_file, _ROZSZERZENIA_ARCHIWUM, "archiwum bazowe")
    _sprawdz_rozszerzenie(delta_file, _ROZSZERZENIA_PACZKI, "paczka zmian")
    bajty_bazy = await base_file.read()
    bajty_paczki = await delta_file.read()

    def _importuj() -> ImportPrzyrostowy:
        with uow_factory() as uow:
            service = ProjectArchiveService(uow.session)
            try:
                return service.import_incremental(bajty_bazy, bajty_paczki, new_name)
            except BaseHashMismatchError as e:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Paczka zmian powstała względem innego archiwum bazowego niż "
                        f"wskazane: {e}"
                    ),
                ) from e
            except IncrementalArchiveError as e:
                raise HTTPException(status_code=422, detail=f"Paczka zmian: {e}") from e
            except ArchiveError as e:
                raise HTTPException(status_code=422, detail=f"Archiwum bazowe: {e}") from e

    wynik_importu = await run_in_threadpool(_importuj)
    wynik = wynik_importu.wynik
    return IncrementalImportResponse(
        status=wynik.status.value,
        project_id=wynik.project_id,
        warnings=wynik.warnings,
        errors=wynik.errors,
        migrated_from_version=wynik.migrated_from_version,
        elements_without_catalog=wynik.elements_without_catalog,
        catalog_mapping_required=wynik.catalog_mapping_required,
        sections_applied=wynik_importu.sekcje_zastosowane,
    )
