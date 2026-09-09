"""Import sieci z arkusza XLSX — podgląd zawartości i zapis do nowego projektu.

W1 (mapa domknięcia §9): arkusz przechodzi przez kompilator grafu do modelu ENM
projektu — tego samego, który czytają kreatory, SLD, gotowość i biegi. Odpowiedź
importu adresuje to, co powstało: projekt, pierwszy przypadek obliczeniowy i odcisk
modelu (`enm_hash` = `header.hash_sha256` zapisanej rewizji).
"""

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
    """Zastrzeżenie do zawartości arkusza (arkusz/wiersz/kolumna/komunikat).

    `arkusz = "model"` oznacza zastrzeżenie kompilatora grafu albo walidatora modelu
    (dotyczy sieci złożonej ze wszystkich arkuszy naraz, np. szyna bez zasilania).
    """

    arkusz: str
    wiersz: int | None = None
    kolumna: str | None = None
    komunikat: str


class PodsumowanieArkuszaModel(BaseModel):
    """Liczby elementów MODELU zbudowanego z arkusza (z ENM, nie z liczenia wierszy)."""

    szyny: int
    odcinki: int
    transformatory: int
    zrodla: int
    odbiory: int


class PodgladArkuszaResponse(BaseModel):
    """Odpowiedź podglądu — model zbudowany w pamięci, BEZ zapisu."""

    poprawny: bool
    podsumowanie: PodsumowanieArkuszaModel | None = None
    bledy: list[BladArkuszaModel] = []
    ostrzezenia: list[str] = []
    #: Elementy, których typ powstał z tabliczki arkusza (pozycja katalogu projektu o
    #: statusie NIEWERYFIKOWANY) — do weryfikacji przez projektanta.
    elementy_typow_projektu: list[str] = []


class ImportArkuszaResponse(BaseModel):
    """Odpowiedź importu — adres tego, co powstało w modelu."""

    status: str  # ZAIMPORTOWANO | ODRZUCONO
    project_id: str | None = None
    case_id: str | None = None
    enm_hash: str | None = None
    podsumowanie: PodsumowanieArkuszaModel | None = None
    bledy: list[BladArkuszaModel] = []
    ostrzezenia: list[str] = []
    elementy_typow_projektu: list[str] = []


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
    """Podgląd zawartości arkusza — model zbudowany w pamięci, BEZ zapisu.

    POST /api/import/xlsx/preview
    """
    tresc = await _wczytaj_plik(file)
    nazwa_pliku = file.filename

    # WSPÓŁBIEŻNOŚĆ: odczyt przesłanego pliku zostaje na pętli (`await file.read()`),
    # a blokujące parsowanie arkusza i kompilacja modelu (w całości na procesorze) idą
    # do puli wątków, żeby import nie wstrzymywał obsługi pozostałych żądań.
    def _podejrzyj() -> dict[str, Any]:
        with uow_factory() as uow:
            return XlsxImportService(uow.session).podglad(tresc, nazwa_pliku).to_dict()

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

    Tworzy projekt, pierwszy (aktywny) przypadek obliczeniowy i model sieci w magazynie
    modelu projektu — zbudowany operacjami domenowymi z arkusza. Arkusz, z którego model
    nie daje się zbudować (błąd wiersza, szyna bez zasilania, blokada walidatora), kończy
    się 422 z listą zastrzeżeń i NIE zostawia projektu.
    """
    tresc = await _wczytaj_plik(file)
    nazwa = (nazwa_projektu or "").strip() or _nazwa_z_pliku(file.filename)
    nazwa_pliku = file.filename

    # WSPÓŁBIEŻNOŚĆ: jak w podglądzie — parsowanie arkusza, kompilacja i zapisy przez
    # sync SQLAlchemy są blokujące i idą do puli wątków.
    def _importuj() -> dict[str, Any]:
        with uow_factory() as uow:
            return XlsxImportService(uow.session).importuj(tresc, nazwa, nazwa_pliku).to_dict()

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
