"""Odczyt słownika-lustra frontu (``export const NAZWA: … = { klucz: 'tekst', … };``).

Testy parytetu backend ↔ front porównują słownik backendu z jego lustrem w TypeScripcie.
Lustro trzyma wyłącznie wpisy prostej postaci ``klucz: 'tekst',`` (klucz goły albo w
apostrofach, tekst w jednej linii) — wpis innej postaci przerywa test zamiast zostać
pominiętym, żeby parytet nie przechodził na niepełnym odczycie.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

#: Katalog ``frontend/src`` repozytorium.
FRONT_SRC = Path(__file__).resolve().parents[3] / "frontend" / "src"

_WPIS = re.compile(r"^\s+(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_]*)): '((?:[^'\\]|\\.)*)',$")


def slownik_ts(plik: Path, nazwa: str) -> dict[str, str]:
    """Wpisy eksportowanego słownika ``nazwa`` z pliku ``plik`` w kolejności źródła."""
    tekst = plik.read_text(encoding="utf-8")
    poczatek = tekst.index(f"export const {nazwa}")
    blok = tekst[poczatek : tekst.index("};", poczatek)]
    wynik: dict[str, str] = {}
    for linia in blok.splitlines()[1:]:
        dopasowanie = _WPIS.match(linia)
        assert dopasowanie, f"{nazwa}: wpis poza postacią klucz: 'tekst': {linia!r}"
        wynik[dopasowanie.group(1) or dopasowanie.group(2)] = dopasowanie.group(3)
    assert wynik, f"{nazwa}: pusty odczyt słownika lustra"
    return wynik


def stala_ts(plik: Path, nazwa: str) -> str:
    """Wartość eksportowanej stałej napisowej ``export const nazwa = '…';``."""
    dopasowanie = re.search(rf"export const {nazwa} = '([^']*)';", plik.read_text(encoding="utf-8"))
    assert dopasowanie, f"brak stałej {nazwa} w {plik}"
    return dopasowanie.group(1)


#: Katalog ``backend/src`` repozytorium.
BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"


def kody_brakow_modulu(sciezka_src: str) -> set[str]:
    """Kody braków, które moduł może zgłosić: stałe dokładane do listy ``missing``
    (``missing.append("…")``) i stałe krotki argumentu ``missing_data=("…",)``."""
    drzewo = ast.parse((BACKEND_SRC / sciezka_src).read_text(encoding="utf-8"))
    kody: set[str] = set()
    for wezel in ast.walk(drzewo):
        if (
            isinstance(wezel, ast.Call)
            and isinstance(wezel.func, ast.Attribute)
            and wezel.func.attr == "append"
            and isinstance(wezel.func.value, ast.Name)
            and wezel.func.value.id == "missing"
            and wezel.args
            and isinstance(wezel.args[0], ast.Constant)
        ):
            kody.add(str(wezel.args[0].value))
        if isinstance(wezel, ast.keyword) and wezel.arg == "missing_data":
            if isinstance(wezel.value, ast.Tuple):
                kody.update(str(e.value) for e in wezel.value.elts if isinstance(e, ast.Constant))
    return kody
