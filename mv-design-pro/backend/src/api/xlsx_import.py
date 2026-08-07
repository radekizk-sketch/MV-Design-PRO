"""Import sieci z arkusza XLSX — podgląd zawartości i zapis do nowego projektu."""

from __future__ import annotations

from typing import Any

from api.dependencies import get_uow_factory
from application.xlsx_import import XlsxImportService
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

router = APIRouter(prefix="/api/import", tags=["import"])

_ROZSZERZENIA = (".xlsx", ".xlsm")


class BladArkuszaModel(BaseModel):
    """Zastrzeżenie do zawartości arkusza (arkusz/wiersz/kolumna/komunikat)."""

    arkusz: str
    wiersz: int | None = None
    kolumna: str | None = None
    komunikat: str


class PodsumowanieArkuszaModel(BaseModel):
    """Liczby elementów rozpoznanych w arkuszu."""

    szyny: int
    odcinki: int
    transformatory: int
    zrodla: int
    odbiory: int


class PodgladArkuszaResponse(BaseModel):
    """Odpowiedź podglądu — zawartość arkusza BEZ zapisu do modelu."""

    poprawny: bool
    podsumowanie: PodsumowanieArkuszaModel | None = None
    bledy: list[BladArkuszaModel] = []
    ostrzezenia: list[str] = []
    elementy_bez_katalogu: list[str] = []
    mapowanie_katalogowe_wymagane: bool = False


class ImportArkuszaResponse(BaseModel):
    """Odpowiedź importu — adres tego, co powstało w modelu."""

    status: str  # ZAIMPORTOWANO | WYMAGA_MAPOWANIA_KATALOGU | ODRZUCONO
    project_id: str | None = None
    snapshot_id: str | None = None
    odcisk_migawki: str | None = None
    podsumowanie: PodsumowanieArkuszaModel | None = None
    bledy: list[BladArkuszaModel] = []
    ostrzezenia: list[str] = []
    elementy_bez_katalogu: list[str] = []
    mapowanie_katalogowe_wymagane: bool = False


async def _wczytaj_plik(file: UploadFile) -> bytes:
    if not file.filename or not file.filename.lower().endswith(_ROZSZERZENIA):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Plik musi mieć rozszerzenie .xlsx lub .xlsm",
        )
    tresc = await file.read()
    if len(tresc) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Plik jest pusty",
        )
    return tresc


@router.post("/xlsx/preview", response_model=PodgladArkuszaResponse)
async def podglad_xlsx(
    file: UploadFile = File(..., description="Plik XLSX z danymi sieci"),
    uow_factory: Any = Depends(get_uow_factory),
) -> PodgladArkuszaResponse:
    """Podgląd zawartości arkusza — BEZ zapisu do modelu.

    POST /api/import/xlsx/preview
    """
    tresc = await _wczytaj_plik(file)

    # WSPÓŁBIEŻNOŚĆ: odczyt przesłanego pliku zostaje na pętli (`await file.read()`),
    # a blokujące parsowanie arkusza (openpyxl, w całości na procesorze) idzie do puli
    # wątków, żeby import nie wstrzymywał obsługi pozostałych żądań.
    def _podejrzyj() -> dict[str, Any]:
        with uow_factory() as uow:
            return XlsxImportService(uow.session).podglad(tresc).to_dict()

    wynik = await run_in_threadpool(_podejrzyj)
    return PodgladArkuszaResponse(**wynik)


@router.post("/xlsx", response_model=ImportArkuszaResponse)
async def import_xlsx(
    file: UploadFile = File(..., description="Plik XLSX z danymi sieci"),
    nazwa_projektu: str | None = Form(
        None, description="Nazwa nowego projektu (puste = nazwa pliku)"
    ),
    uow_factory: Any = Depends(get_uow_factory),
) -> ImportArkuszaResponse:
    """Import sieci z arkusza XLSX do NOWEGO projektu.

    POST /api/import/xlsx

    Tworzy projekt z węzłami, gałęziami, źródłami i odbiorami oraz migawkę sieci
    ustawioną jako aktywna. Arkusz bez identyfikatorów katalogowych przechodzi,
    ale odpowiedź niesie bramkę katalogową (`mapowanie_katalogowe_wymagane`).
    """
    tresc = await _wczytaj_plik(file)
    nazwa = (nazwa_projektu or "").strip() or _nazwa_z_pliku(file.filename)

    # WSPÓŁBIEŻNOŚĆ: jak w podglądzie — parsowanie arkusza i zapisy przez sync
    # SQLAlchemy są blokujące i idą do puli wątków.
    def _importuj() -> dict[str, Any]:
        with uow_factory() as uow:
            return XlsxImportService(uow.session).importuj(tresc, nazwa).to_dict()

    wynik = await run_in_threadpool(_importuj)

    if wynik["status"] == "ODRZUCONO":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "message": "Arkusz nie przeszedł walidacji — model nie został zmieniony",
                "bledy": wynik["bledy"],
            },
        )

    return ImportArkuszaResponse(**wynik)


def _nazwa_z_pliku(nazwa_pliku: str | None) -> str:
    if not nazwa_pliku:
        return "Import z arkusza"
    rdzen = nazwa_pliku.rsplit("/", 1)[-1]
    for rozszerzenie in _ROZSZERZENIA:
        if rdzen.lower().endswith(rozszerzenie):
            rdzen = rdzen[: -len(rozszerzenie)]
            break
    return rdzen.strip() or "Import z arkusza"
