"""Lustro frontu reguł wyposażenia pola SN i stanu łącznika (karta W5-C).

Po co: formularz wyposażenia pola (``frontend/src/ui/field/wyposazeniePola.ts``) KSZTAŁTUJE
wiersze aparatów wg tablic backendu (który rodzaj ma katalog i jaką przestrzeń, który wskazuje
gałąź łącznika, który ma rolę uziemienia). Rozjazd tablic nie jest odrzucany przez backend
po cichu — ale formularz zaproponowałby pole, którego backend nie przyjmie (fantom), albo
schowałby pole, którego backend wymaga. Lustro stanu łącznika
(``frontend/src/types/rodzajeGalezi.ts::KLASA_RODZAJU_GALEZI`` — źródło ``isSwitchBranch`` /
``isApparatusBranch``) decyduje, które gałęzie front traktuje jako aparat i jako łącznik
z pozycją normalną — rozjazd z ``RODZAJE_GALEZI_APARATU`` / ``RODZAJE_GALEZI_LACZNIKA`` to ten
sam defekt, który karta usuwa (dwie prawdy o punkcie podziału). Parytet listy z frontem niesie
też wyrocznia harnessu (``rodzaje_galezi``, ``frontend/src/ui/shared/__tests__/
rodzajGalezi.test.ts``); ten test czyta mapę źródłową frontu wprost, więc rozjazd zapala
czerwień także bez regeneracji fikstur.

KLASA, NIE INSTANCJA: porównywana jest KAŻDA tablica lustra w obie strony, nie jeden rodzaj.
"""

from __future__ import annotations

import re
import typing
from pathlib import Path

from enm.models import (
    RODZAJE_GALEZI_APARATU,
    RODZAJE_GALEZI_LACZNIKA,
    BayBaseModel,
    BayPrimaryDevice,
)
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
_RODZAJE_GALEZI_TS = (_FRONT / "types" / "rodzajeGalezi.ts").read_text(encoding="utf-8")


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


def _klasy_rodzajow_galezi() -> dict[str, str]:
    """Mapa ``KLASA_RODZAJU_GALEZI`` frontu: rodzaj gałęzi → klasa (odcinek/lacznik/bezpiecznik)."""
    wynik = re.search(r"const KLASA_RODZAJU_GALEZI = \{(.*?)\} as const", _RODZAJE_GALEZI_TS, re.S)
    assert wynik, "brak mapy KLASA_RODZAJU_GALEZI w types/rodzajeGalezi.ts"
    return dict(re.findall(r"(\w+): '(\w+)'", wynik.group(1)))


def test_klasy_rodzajow_galezi_frontu_sa_lustrem_typow_backendu() -> None:
    klasy = _klasy_rodzajow_galezi()
    lacznik = frozenset(r for r, k in klasy.items() if k == "lacznik")
    aparat = frozenset(r for r, k in klasy.items() if k != "odcinek")
    assert lacznik == frozenset(RODZAJE_GALEZI_LACZNIKA)
    assert aparat == RODZAJE_GALEZI_APARATU
    assert "fuse" in aparat - lacznik
