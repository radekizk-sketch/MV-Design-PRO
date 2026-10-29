"""Lustro frontu reguł wyposażenia pola SN i stanu łącznika (karta W5-C).

Po co: formularz wyposażenia pola (``frontend/src/ui/field/wyposazeniePola.ts``) KSZTAŁTUJE
wiersze aparatów wg tablic backendu (który rodzaj ma katalog i jaką przestrzeń, który wskazuje
gałąź łącznika, który ma rolę uziemienia). Rozjazd tablic nie jest odrzucany przez backend
po cichu — ale formularz zaproponowałby pole, którego backend nie przyjmie (fantom), albo
schowałby pole, którego backend wymaga. Lustro stanu łącznika
(``frontend/src/types/enm.ts::isSwitchBranch`` / ``isFuseBranch``) decyduje, które gałęzie
front traktuje jako łącznik i jako łącznik z pozycją normalną — rozjazd z
``TYPY_LACZNIKOW_ENM`` / ``TYPY_LACZNIKOW_ZE_STANEM_NORMALNYM`` to ten sam defekt, który
karta usuwa (dwie prawdy o punkcie podziału).

KLASA, NIE INSTANCJA: porównywana jest KAŻDA tablica lustra w obie strony, nie jeden rodzaj.
"""

from __future__ import annotations

import re
import typing
from pathlib import Path

from enm.models import BayBaseModel, BayPrimaryDevice
from enm.stan_normalny import TYPY_LACZNIKOW_ZE_STANEM_NORMALNYM
from enm.topology import TYPY_LACZNIKOW_ENM
from enm.wyposazenie_pola import (
    NAZWY_RODZAJOW_APARATU_POLA_PL,
    PRZESTRZEN_KATALOGU_APARATU,
    RODZAJE_BEZ_KATALOGU_SN,
    RODZAJE_KATALOGOWE_APARATU,
    RODZAJE_Z_GALEZIA,
    RODZAJE_Z_ROLA_UZIEMIENIA,
)

_FRONT = Path(__file__).resolve().parents[3] / "frontend" / "src"
_WYPOSAZENIE_TS = (_FRONT / "ui" / "field" / "wyposazeniePola.ts").read_text(encoding="utf-8")
_ENM_TS = (_FRONT / "types" / "enm.ts").read_text(encoding="utf-8")


def _obiekt(nazwa: str) -> str:
    wynik = re.search(rf"export const {nazwa}\b[^=]*= \{{(.*?)^\}};", _WYPOSAZENIE_TS, re.M | re.S)
    assert wynik, f"brak tablicy {nazwa} w wyposazeniePola.ts"
    return wynik.group(1)


def _lista(nazwa: str) -> frozenset[str]:
    wynik = re.search(rf"export const {nazwa}\b[^=]*= \[(.*?)\];", _WYPOSAZENIE_TS, re.S)
    assert wynik, f"brak listy {nazwa} w wyposazeniePola.ts"
    return frozenset(re.findall(r"'([^']*)'", wynik.group(1)))


def _slownik_napisow(nazwa: str) -> dict[str, str | None]:
    return {
        klucz: (None if wartosc == "null" else wartosc.strip("'"))
        for klucz, wartosc in re.findall(r"^\s+(\w+): ('[^']*'|null),", _obiekt(nazwa), re.M)
    }


def _unia(nazwa: str, tresc: str) -> frozenset[str]:
    wynik = re.search(rf"export type {nazwa} =([^;]*);", tresc, re.S)
    assert wynik, f"brak typu {nazwa}"
    return frozenset(re.findall(r"'([^']*)'", wynik.group(1)))


def test_przestrzen_katalogu_aparatu_jest_lustrem() -> None:
    front = _slownik_napisow("PRZESTRZEN_KATALOGU_APARATU")
    oczekiwane: dict[str, str | None] = dict(PRZESTRZEN_KATALOGU_APARATU)
    oczekiwane.update({rodzaj: None for rodzaj in RODZAJE_BEZ_KATALOGU_SN})
    assert front == oczekiwane


def test_rodzaje_katalogowe_aparatu_sa_lustrem() -> None:
    front = {
        klucz: frozenset(re.findall(r"'([^']*)'", wartosci))
        for klucz, wartosci in re.findall(
            r"^\s+(\w+): \[([^\]]*)\],", _obiekt("RODZAJE_KATALOGOWE_APARATU"), re.M
        )
    }
    assert front == dict(RODZAJE_KATALOGOWE_APARATU)


def test_rodzaje_z_galezia_i_z_rola_uziemienia_sa_lustrem() -> None:
    assert _lista("RODZAJE_Z_GALEZIA") == RODZAJE_Z_GALEZIA
    assert _lista("RODZAJE_Z_ROLA_UZIEMIENIA") == RODZAJE_Z_ROLA_UZIEMIENIA


def test_rodzaje_pola_sn_i_nazwy_sa_lustrem() -> None:
    rodzaje_backendu = frozenset(NAZWY_RODZAJOW_APARATU_POLA_PL)
    assert _lista("RODZAJE_APARATU_POLA_SN") == rodzaje_backendu
    assert _unia("RodzajAparatuPolaSn", _WYPOSAZENIE_TS) == rodzaje_backendu
    assert _slownik_napisow("NAZWA_RODZAJU_APARATU_PL") == NAZWY_RODZAJOW_APARATU_POLA_PL
    # Każdy rodzaj pola SN jest rodzajem aparatu pola kontraktu (``BayPrimaryDevice.kind``).
    rodzaje_kontraktu = frozenset(typing.get_args(BayPrimaryDevice.model_fields["kind"].annotation))
    assert rodzaje_backendu <= rodzaje_kontraktu


def test_umiejscowienia_sa_lustrem_kontraktu() -> None:
    kontrakt = frozenset(typing.get_args(BayPrimaryDevice.model_fields["placement"].annotation))
    assert _lista("UMIEJSCOWIENIA") == kontrakt
    assert frozenset(_slownik_napisow("UMIEJSCOWIENIE_PL")) == kontrakt
    assert _unia("BayPrimaryPlacement", _ENM_TS) == kontrakt


def test_stan_danych_wyposazenia_jest_lustrem_kontraktu() -> None:
    kontrakt = frozenset(
        typing.get_args(BayBaseModel.model_fields["equipment_data_state"].annotation)
    )
    assert _unia("StanDanychWyposazenia", _ENM_TS) == kontrakt
    assert frozenset(_slownik_napisow("STAN_DANYCH_WYPOSAZENIA_PL")) == kontrakt


def _typy_predykatu(nazwa: str) -> frozenset[str]:
    wynik = re.search(
        rf"export function {nazwa}\(b: Branch\)[^{{]*\{{(.*?)^\}}", _ENM_TS, re.M | re.S
    )
    assert wynik, f"brak predykatu {nazwa} w types/enm.ts"
    return frozenset(re.findall(r"'([^']*)'", wynik.group(1)))


def test_predykaty_lacznika_frontu_sa_lustrem_typow_backendu() -> None:
    z_pozycja = _typy_predykatu("isSwitchBranch")
    bezpiecznik = _typy_predykatu("isFuseBranch")
    assert z_pozycja == frozenset(TYPY_LACZNIKOW_ZE_STANEM_NORMALNYM)
    assert z_pozycja | bezpiecznik == TYPY_LACZNIKOW_ENM
    assert not (z_pozycja & bezpiecznik)


def test_klasy_pola_liniowego_sa_lustrem() -> None:
    """Klasa pola liniowego (karta UX-04/POLE-LINIOWE-WZORZEC, rozszerzenie 2): lista klas,
    nazwy polskie i unia typu `KlasaPolaLiniowego` frontu = słownik `bay_templates`, a literal
    modelu `Bay.klasa_pola` = ta sama lista (jedno źródło klas w trzech nośnikach)."""
    from enm.models import Bay
    from network_model.catalog.bay_templates import KLASY_POLA_LINIOWEGO, NAZWY_KLASY_POLA_PL

    assert _lista("KLASY_POLA_LINIOWEGO") == frozenset(KLASY_POLA_LINIOWEGO)
    assert {
        k: v.strip("'")
        for k, v in re.findall(r"^\s+(\w+): ('[^']*'),", _obiekt("NAZWA_KLASY_POLA_PL"), re.M)
    } == NAZWY_KLASY_POLA_PL
    assert _unia("KlasaPolaLiniowego", _ENM_TS) == frozenset(KLASY_POLA_LINIOWEGO)
    literal = typing.get_args(Bay.model_fields["klasa_pola"].annotation)
    assert frozenset(a for arg in literal for a in typing.get_args(arg)) == frozenset(
        KLASY_POLA_LINIOWEGO
    )
