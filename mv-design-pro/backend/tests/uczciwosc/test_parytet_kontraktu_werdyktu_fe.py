"""Typy rekordu werdyktu w interfejsie są lustrem kontraktu backendu (``werdykt.kontrakt``).

Po co: interfejs czyta rekordy K i W wprost z odpowiedzi API (karta rekordu, etykiety,
sekcje audytowe). Pole zadeklarowane w ``frontend/src/ui2/wyniki/wzorzec/werdykt.ts``, którego
backend nie serializuje, jest w przeglądarce ``undefined`` — karta rekordu W wysadzała się przy
pierwszym rozwinięciu (``podstawa_sposobu_wykazania`` odczytywane jako podstawa, odczyt
``status`` z ``undefined``), bo żaden test nie porównywał obu stron, a rekord W nie miał dotąd
producenta w produkcie. Pole backendu bez odpowiednika w typie interfejsu to z kolei dana,
której interfejs nie zna i nie pokaże.

KLASA, NIE INSTANCJA — test obejmuje CAŁY kontrakt, nie jedno pole:
- każdy interfejs ``werdykt.ts`` ma klasę kontraktu o tej samej nazwie z TYM SAMYM zbiorem pól
  (w obie strony);
- każda klasa kontraktu osiągalna z rekordów K i W (``OcenaKryterium``, ``WynikWymagania``) ma
  interfejs w ``werdykt.ts`` — nowa klasa zagnieżdżona nie przejdzie bez lustra;
- każdy typ wyliczeniowy ``werdykt.ts`` (unia literałów) ma w kontrakcie ten sam zbiór wartości.
"""

from __future__ import annotations

import enum
import re
import typing
from pathlib import Path

import pytest
import werdykt.kontrakt as kontrakt
import werdykt.proweniencja as proweniencja
from pydantic import BaseModel

_WERDYKT_TS = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "src"
    / "ui2"
    / "wyniki"
    / "wzorzec"
    / "werdykt.ts"
)
_TRESC_TS = _WERDYKT_TS.read_text(encoding="utf-8")

_INTERFEJSY: dict[str, frozenset[str]] = {
    m.group(1): frozenset(re.findall(r"^\s+readonly (\w+)\??:", m.group(2), re.M))
    for m in re.finditer(r"^export interface (\w+) \{(.*?)^\}", _TRESC_TS, re.M | re.S)
}
_UNIE_LITERALOW: dict[str, frozenset[str]] = {
    m.group(1): frozenset(re.findall(r"'([^']*)'", m.group(2)))
    for m in re.finditer(r"^export type (\w+) =([^;]*);", _TRESC_TS, re.M | re.S)
    if re.search(r"'[^']*'", m.group(2))
}


def _klasa_kontraktu(nazwa: str) -> type[BaseModel]:
    klasa = getattr(kontrakt, nazwa, None)
    jest_klasa_kontraktu = isinstance(klasa, type) and issubclass(klasa, BaseModel)
    assert jest_klasa_kontraktu, f"Interfejs {nazwa} z werdykt.ts bez klasy w werdykt.kontrakt."
    return klasa


def _wartosci_kontraktu(nazwa: str) -> frozenset[str]:
    znalezione = [
        obiekt
        for modul in (kontrakt, proweniencja)
        if (obiekt := getattr(modul, nazwa, None)) is not None
    ]
    assert znalezione, f"Typ {nazwa} z werdykt.ts nie ma odpowiednika w kontrakcie werdyktu."
    obiekt = znalezione[0]
    if isinstance(obiekt, type) and issubclass(obiekt, enum.Enum):
        return frozenset(str(element.value) for element in obiekt)
    wartosci = typing.get_args(obiekt)
    unia_tekstowa = bool(wartosci) and all(isinstance(w, str) for w in wartosci)
    assert unia_tekstowa, f"Typ {nazwa} w kontrakcie nie jest unią literałów tekstowych."
    return frozenset(wartosci)


def _modele_osiagalne(korzenie: tuple[type[BaseModel], ...]) -> set[type[BaseModel]]:
    osiagalne: set[type[BaseModel]] = set()
    do_odwiedzenia: list[object] = list(korzenie)
    while do_odwiedzenia:
        typ = do_odwiedzenia.pop()
        if isinstance(typ, type) and issubclass(typ, BaseModel):
            if typ in osiagalne:
                continue
            osiagalne.add(typ)
            do_odwiedzenia.extend(pole.annotation for pole in typ.model_fields.values())
        else:
            do_odwiedzenia.extend(typing.get_args(typ))
    return osiagalne


def test_zrodlo_typow_interfejsu_jest_parsowalne() -> None:
    """Strażnik samego testu: parser widzi oba rekordy i unie statusów (pusty zbiór = test
    niczego nie sprawdza)."""
    assert {"OcenaKryterium", "WynikWymagania", "PodstawaWymagania"} <= set(_INTERFEJSY)
    assert {"StatusWerdyktu", "MetodaDowodu", "StanZrodla"} <= set(_UNIE_LITERALOW)
    assert "podstawa_sposobu_wykazania" in _INTERFEJSY["WynikWymagania"]


@pytest.mark.parametrize("nazwa", sorted(_INTERFEJSY))
def test_interfejs_ma_ten_sam_zbior_pol_co_klasa_kontraktu(nazwa: str) -> None:
    pola_kontraktu = frozenset(_klasa_kontraktu(nazwa).model_fields)
    pola_interfejsu = _INTERFEJSY[nazwa]
    assert pola_interfejsu - pola_kontraktu == frozenset(), (
        f"{nazwa}: pola zadeklarowane w werdykt.ts, których backend nie serializuje "
        f"(w przeglądarce undefined): {sorted(pola_interfejsu - pola_kontraktu)}."
    )
    assert pola_kontraktu - pola_interfejsu == frozenset(), (
        f"{nazwa}: pola kontraktu bez deklaracji w werdykt.ts: "
        f"{sorted(pola_kontraktu - pola_interfejsu)}."
    )


def test_kazda_klasa_osiagalna_z_rekordow_ma_interfejs() -> None:
    osiagalne = {
        klasa.__name__
        for klasa in _modele_osiagalne((kontrakt.OcenaKryterium, kontrakt.WynikWymagania))
    }
    # Strażnik przejścia: zagnieżdżone klasy rekordu są widziane (nie tylko korzenie).
    assert {"PodstawaWymagania", "Margines", "StatusDowodu", "Etykieta"} <= osiagalne
    bez_interfejsu = sorted(osiagalne - set(_INTERFEJSY))
    assert bez_interfejsu == [], (
        f"Klasy kontraktu osiągalne z rekordów K i W bez interfejsu w werdykt.ts: "
        f"{bez_interfejsu}."
    )


@pytest.mark.parametrize("nazwa", sorted(_UNIE_LITERALOW))
def test_unia_literalow_ma_te_same_wartosci_co_kontrakt(nazwa: str) -> None:
    assert _UNIE_LITERALOW[nazwa] == _wartosci_kontraktu(nazwa), nazwa
