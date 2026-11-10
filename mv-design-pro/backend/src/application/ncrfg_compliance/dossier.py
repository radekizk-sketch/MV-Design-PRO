"""Bezpieczna lista kontrolna dokumentów odbiorowych PGM (źródło ENEA/PTPiREE).

Zwraca wymagany/warunkowy wzorzec dokumentu, nie gotowy wniosek ani decyzję OSD.
Nie reprodukuje formularzy ENEA. Nie przypisuje prawnej akceptacji na podstawie
raportu MV-DESIGN-PRO ani zadeklarowanych parametrów modelu.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict

from catalog.profiles.nc_rfg import TypModulu

URL_ENEA = (
    "https://www.operator.enea.pl/uslugi-dystrybucyjne/dla-firm/pliki-do-pobrania"
)
URL_PROCEDURY = (
    "https://ptpiree.pl/kodeksy-sieci/procedury-pozwolenia-na-uzytkowanie/"
)
DocKind = Literal["DI", "PGMD", "EON", "ION", "LON", "FON"]


class DokumentOdbiorowy(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    kod: DocKind
    tytul_pl: str
    etap: str
    wymagane_w_typowej_procedurze: bool
    uwagi_pl: str
    formularz_url: str = URL_ENEA
    podstawa_url: str = URL_PROCEDURY
    stan: Literal["BRAK_DOWODU_OPERATORA"] = "BRAK_DOWODU_OPERATORA"


class DossierPlan(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    typ_mwe: TypModulu
    operator_id: str
    dokumenty: tuple[DokumentOdbiorowy, ...]
    luki: tuple[str, ...]
    formalnie_zaakceptowane: bool = False
    powod_pl: str = (
        "To lista przygotowawcza. Wydanie DI/PGMD, EON, ION, FON, "
        "LON i ich akceptacja zależy od właściwego operatora; "
        "w systemie nie ma potwierdzonej decyzji operatora."
    )


def plan_dossier(
    typ: TypModulu,
    *,
    operator_id: str,
    mikroinstalacja_na_zgloszenie: bool | None = None,
) -> DossierPlan:
    """Źródłowy dobór WZORÓW; wyjątków i wymaganych załączników nie zgaduje.

    DI dla typu A z wyjątkiem mikroinstalacji przyłączanych na zgłoszenie
    (wzór ENEA pu-DI). Dla unknown microinstallation ostrożnie podaj
    dokument jako warunkowy z brakującą daną.
    """
    docs: list[DokumentOdbiorowy] = []
    missing: list[str] = []
    if typ == "A":
        if mikroinstalacja_na_zgloszenie is None:
            missing.append(
                "Nieustalono, czy typ A jest mikroinstalacją przyłączaną na zgłoszenie."
            )
        if mikroinstalacja_na_zgloszenie is not True:
            docs.append(DokumentOdbiorowy(
                kod="DI",
                tytul_pl="Dokument instalacji (pu-DI)",
                etap="powiadomienie/pozwolenie typu A",
                wymagane_w_typowej_procedurze=mikroinstalacja_na_zgloszenie is False,
                uwagi_pl=(
                    "Wzór ENEA dotyczy typu A z wyłączeniem mikroinstalacji "
                    "przyłączanych na zgłoszenie; przy nieznanym trybie tylko kandydat."
                ),
            ))
    elif typ in ("B", "C"):
        docs.append(DokumentOdbiorowy(
            kod="PGMD", tytul_pl="Dokument modułu wytwarzania energii (pu-PGMD)",
            etap="procedura typu B/C",
            wymagane_w_typowej_procedurze=True,
            uwagi_pl="Załączniki oraz wymagane badania i certyfikaty ustala operator.",
        ))
    elif typ == "D":
        for code, title, step in (
            ("EON", "Pozwolenie na podanie napięcia", "przed podaniem napięcia"),
            ("ION", "Tymczasowe pozwolenie na użytkowanie", "uruchomienie i testy"),
            ("FON", "Ostateczne pozwolenie na użytkowanie", "zakończenie oceny"),
        ):
            docs.append(DokumentOdbiorowy(
                kod=code, tytul_pl=title, etap=step,
                wymagane_w_typowej_procedurze=True,
                uwagi_pl=(
                    "Wskazany dokument to typ dokumentacji/etap — nie dowód "
                    "wydania pozwolenia przez operatora."
                ),
            ))
        docs.append(DokumentOdbiorowy(
            kod="LON",
            tytul_pl="Ograniczone pozwolenie na użytkowanie",
            etap="sytuacja warunkowa według procedury operatora",
            wymagane_w_typowej_procedurze=False,
            uwagi_pl="Nie jest bezwarunkowym etapem każdej procedury typu D.",
        ))
    if operator_id != "enea":
        missing.append(
            "Formularze ENEA pokazano tylko jako punkt referencyjny; "
            "należy wskazać wzory właściwego OSD."
        )
    missing.append(
        "Brak potwierdzonego pełnego pakietu załączników, wyników badań i decyzji OSD."
    )
    return DossierPlan(
        typ_mwe=typ, operator_id=operator_id, dokumenty=tuple(docs),
        luki=tuple(missing),
    )
