"""Słownik funkcji EAZ — lustro frontu z jedynego źródła backendu (karta UX-04/POLE-LINIOWE-WZORZEC,
blok przekaźnika na schemacie i wiersze „Zabezpieczenia i automatyka" karty pola).

PO CO. Schemat (blok przekaźnika: co najwyżej cztery kody funkcji ZABEZPIECZENIE i „+N", automatyka
poza kanwą) i karta pola w inspektorze (wiersz na funkcję: kod IEEE C37.2, zapis z rysunku, nazwa
polska, rodzaj) potrzebują klasyfikacji i nazwy KAŻDEGO kodu funkcji sterownika pola; edytor
nastaw karty pola (karta OCHRONA-JEDNO-ZRODLO) buduje formularz z SCHEMATU nastaw funkcji (klucz,
typ, jednostka, lista wyboru), wymaganych wejść i rodzaju oceny. Jedynym
źródłem jest `network_model.catalog.funkcje_eaz.FUNKCJE_EAZ`; front czyta wygenerowany plik
`frontend/src/ui/shared/slownikFunkcjiEaz.json`. Test przypina równość pliku z tabelą backendu —
ręcznie pisane lustro albo wpis dodany tylko po jednej stronie czerwieni test (reguła KLASA §3).

Regeneracja (z katalogu `backend/`):

    PYTHONPATH=$PWD:$PWD/src python tests/ci/test_parytet_slownika_funkcji_eaz.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import get_args

from network_model.catalog.funkcje_eaz import (
    ETYKIETY_WARTOSCI_WYBORU,
    FUNKCJE_EAZ,

    WEJSCIA_FUNKCJI,
    ZESTAWY_FUNKCJI_RODZAJU,
    RodzajFunkcjiEaz,
)

LUSTRO = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "src"
    / "ui"
    / "shared"
    / "slownikFunkcjiEaz.json"
)


def _slownik() -> dict[str, object]:
    return {
        "rodzaje": list(get_args(RodzajFunkcjiEaz)),
        "wejscia": list(WEJSCIA_FUNKCJI),
        "etykiety_wartosci": dict(ETYKIETY_WARTOSCI_WYBORU),
        "zestawy_rodzaju": {k: list(v) for k, v in ZESTAWY_FUNKCJI_RODZAJU.items()},
        "funkcje": {
            kod: {
                "oznaczenie_pl": f.oznaczenie_pl,
                "ansi": f.ansi,
                "nazwa_pl": f.nazwa_pl,
                "rodzaj": f.rodzaj,
                "wejscia_wymagane": list(f.wejscia_wymagane),
                "wejscia_opcjonalne": list(f.wejscia_opcjonalne),
                "ocena": f.ocena,
                "nastawy": [
                    {
                        "klucz": n.klucz,
                        "nazwa_pl": n.nazwa_pl,
                        "typ": n.typ,
                        "jednostka": n.jednostka,
                        "wartosci": list(n.wartosci),
                        "dodatnia": n.dodatnia,
                    }
                    for n in f.nastawy
                ],
            }
            for kod, f in sorted(FUNKCJE_EAZ.items())
        },
    }


def _tresc() -> str:
    return json.dumps(_slownik(), ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def test_lustro_frontu_rowne_slownikowi_backendu():
    assert LUSTRO.read_text(encoding="utf-8") == _tresc(), (
        "lustro słownika funkcji EAZ we froncie rozjechane z backendem — regeneruj: "
        "PYTHONPATH=$PWD:$PWD/src python tests/ci/test_parytet_slownika_funkcji_eaz.py"
    )


def test_klucz_wpisu_rowny_kodowi_funkcji():
    # Lustro jest kluczowane kodem — kod w rekordzie backendu musi być tym samym kluczem.
    assert all(kod == f.kod for kod, f in FUNKCJE_EAZ.items())


if __name__ == "__main__":
    LUSTRO.write_text(_tresc(), encoding="utf-8")
    print(f"zapisano {LUSTRO}")
