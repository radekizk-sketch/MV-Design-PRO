"""Odcisk biblioteki typow z kodu — jedyna dzis mierzalna „rewizja katalogu" (CV-2).

`RevisionEnvelope.catalog_fingerprint` (`enm/envelope.py`) ma odpowiadac na
pytanie: czy katalog, z ktorego zmaterializowano parametry modelu w chwili biegu,
jest tym samym katalogiem, ktory obowiazuje teraz. Biblioteka typow jest w tym
repo KODEM (`network_model/catalog/*_catalog.py`, skladana przez
`get_default_mv_catalog`), wiec jej odcisk to SHA-256 kanonicznego zrzutu
wszystkich typow (posortowane identyfikatory, posortowane klucze, bez spacji,
enumy po wartosci). Zmiana jednego pola jednego typu zmienia odcisk; ten sam kod
w dwoch procesach daje ten sam odcisk (test miedzyprocesowy w
`tests/network_model/test_odcisk_katalogu.py`).

Czego odcisk NIE obejmuje (uczciwie): rodzin rozdzielnic (`catalog/switchgear`),
szablonow stacji (`station_templates.py`, `bay_templates.py`) i biblioteki
zabezpieczen analitycznych (`application/analyses/protection/catalog`) — to osobne
katalogi z wlasnymi manifestami; ich konwergencja do jednej biblioteki typow jest
karta architektoniczna (P1-5 w CONVERGENCE_EVIDENCE.md). Odcisk obejmuje dokladnie
to, co `CatalogRepository` — czyli to, z czego materializacja bierze parametry.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
from enum import Enum
from functools import lru_cache
from typing import Any

from .repository import CatalogRepository, get_default_mv_catalog
from .types import POLA_KARTY_PROJEKCJI

#: Pola typów DODANE PO ZAMROŻENIU odcisków, które w zrzucie kanonicznym występują
#: WYŁĄCZNIE, gdy niosą wartość (ten sam kontrakt „addytywnie, `exclude_none`", co
#: `enm/hash.py::_POLA_ADDYTYWNE_POZA_HASHEM_GDY_NONE`): projekcja bez danych karty ma
#: odcisk sprzed karty AB-H0 §0.8, projekcja z danymi — inny (zmiana katalogu jest zmianą
#: wejścia materializacji). Klucz = nazwa klasy typu. Przypięte testem
#: `tests/network_model/catalog/test_odcisk_katalogu_karty_widmowe.py`.
_POLA_ADDYTYWNE_POZA_ODCISKIEM_GDY_NONE: dict[str, tuple[str, ...]] = {
    "PVInverterType": POLA_KARTY_PROJEKCJI,
    "BESSInverterType": POLA_KARTY_PROJEKCJI,
}
#: Pola SKASOWANE z typów, które odcisk ZACHOWUJE jako `null` (wzorzec W5-A z
#: `enm/hash.py::_POLA_SKASOWANE_W_ODCISKU`). `ConverterType.harmonic_spectrum_percent`
#: (karta AB-H0 §0.7.5) było `None` w 176/176 pozycjach — kasacja pola nie jest zmianą
#: danych katalogu i nie może przestawić odcisku każdej migawki.
_POLA_SKASOWANE_W_ODCISKU: dict[str, tuple[str, ...]] = {
    "ConverterType": ("harmonic_spectrum_percent",),
}
#: Przestrzenie repozytorium DODANE PO ZAMROŻENIU odcisków, pomijane w zrzucie, gdy są
#: puste (karta AB-H0 §0.7: `karty_widmowe` — katalog statyczny nie ma dziś ani jednej
#: karty; pierwsza karta z dokumentem zmieni odcisk, bo zmienia katalog).
_PRZESTRZENIE_ADDYTYWNE_POZA_ODCISKIEM_GDY_PUSTE: frozenset[str] = frozenset(("karty_widmowe",))


def _kanon(wartosc: Any) -> Any:
    """Serializacja wartosci spoza JSON: enum po wartosci, dataclass jako slownik,
    zbior posortowany, reszta przez `str` (deterministycznie dla typow katalogu)."""
    if isinstance(wartosc, Enum):
        return wartosc.value
    if dataclasses.is_dataclass(wartosc) and not isinstance(wartosc, type):
        return dataclasses.asdict(wartosc)
    if isinstance(wartosc, set | frozenset):
        return sorted(wartosc, key=str)
    if isinstance(wartosc, tuple):
        return list(wartosc)
    return str(wartosc)


def _postac_typu(typ: Any) -> Any:
    """Postać kanoniczna jednego typu pod odcisk — JEDNA reguła dla wszystkich przestrzeni."""
    if dataclasses.is_dataclass(typ) and not isinstance(typ, type):
        postac = dataclasses.asdict(typ)
        klasa = type(typ).__name__
        for nazwa in _POLA_ADDYTYWNE_POZA_ODCISKIEM_GDY_NONE.get(klasa, ()):
            if postac.get(nazwa) is None:
                postac.pop(nazwa, None)
        for nazwa in _POLA_SKASOWANE_W_ODCISKU.get(klasa, ()):
            postac.setdefault(nazwa, None)
        return postac
    model_dump = getattr(typ, "model_dump", None)
    if callable(model_dump):
        return model_dump(mode="json")
    return typ


def zrzut_kanoniczny(katalog: CatalogRepository) -> dict[str, Any]:
    """Wszystkie przestrzenie typow repozytorium jako slownik `{przestrzen: {id: typ}}`."""
    zrzut: dict[str, Any] = {}
    for pole in dataclasses.fields(katalog):
        wartosc = getattr(katalog, pole.name)
        if not isinstance(wartosc, dict):
            continue
        if not wartosc and pole.name in _PRZESTRZENIE_ADDYTYWNE_POZA_ODCISKIEM_GDY_PUSTE:
            continue
        zrzut[pole.name] = {
            str(identyfikator): _postac_typu(typ)
            for identyfikator, typ in sorted(wartosc.items(), key=lambda para: str(para[0]))
        }
    return zrzut


def odcisk_katalogu(katalog: CatalogRepository) -> str:
    tekst = json.dumps(
        zrzut_kanoniczny(katalog),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=_kanon,
    )
    return hashlib.sha256(tekst.encode("utf-8")).hexdigest()


@lru_cache(maxsize=1)
def odcisk_katalogu_domyslnego() -> str:
    """Odcisk biblioteki typow z kodu (`get_default_mv_catalog`). Biblioteka jest
    niezmienna w obrebie procesu, wiec wynik jest liczony raz."""
    return odcisk_katalogu(get_default_mv_catalog())
