#!/usr/bin/env python3
"""Strażnik: każda klasa CSS frontu ma JEDNO źródło definicji.

DLACZEGO (karta KOLIZJE-KLAS-CSS, 2026-10-15). Wszystkie arkusze
``frontend/src/**/*.css`` są GLOBALNE — Vite wstrzykuje je do jednego dokumentu,
a kaskada rozstrzyga remis kolejnością załadowania. Pomiar przed naprawą:
35 klas zdefiniowanych w więcej niż jednym pliku, 21 z nich ze SPRZECZNĄ treścią.
Skutek widoczny na żywej aplikacji: ``.mvd-menu`` z arkusza menedżera przypadków
(menu kontekstowe, ``position: fixed``) nadpisywało menu „Widok” paska tytułowego,
które lądowało w lewym górnym rogu na logo. Wygląd prymitywu zależał od tego,
który ekran załadował się jako ostatni.

KONTRAKT. Selektor SAMODZIELNY to element listy selektorów złożony wyłącznie z
jednej klasy i opcjonalnych pseudoklas/pseudoelementów: ``.klasa``,
``.klasa:hover``, ``.klasa::before``, ``.klasa:not(:disabled)``. Klasa, której
samodzielny selektor występuje w więcej niż jednym pliku ``*.css`` pod
``frontend/src``, to kolizja. Wariant prymitywu na ekranie zapisuje się
selektorem ZAWĘŻONYM do kontenera (``.mvd-ekran .mvd-btn``) albo nową klasą
wariantu — nigdy redefinicją klasy globalnej. Reguły w ``@media``/``@supports``/
``@container``/``@layer`` liczą się tak samo jak na poziomie arkusza; zawartość
``@keyframes``/``@font-face`` nie zawiera selektorów klas.

DRUGI PREDYKAT (ta sama klasa defektu). Identyczny selektor ZŁOŻONY z klasą
(``.mvd-cases-table th``, ``.mvd-cases-row.mvd-on``) zdefiniowany w więcej niż
jednym pliku to ta sama kolizja kolejności — przed naprawą trzy takie selektory
jechały razem z kopiami tabeli listy. Selektory bez klasy (``html``, ``body``)
nie są liczone: należą do arkusza bazowego.

LISTA DOZWOLONA: pusta i taka ma zostać. Kod wyjścia 0 = zero kolizji.
Pusty skan (zero arkuszy albo zero klas) to BŁĄD, nie zieleń.
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KORZEN_CSS = ROOT / "frontend" / "src"

#: Selektor samodzielny: jedna klasa + ciąg pseudoklas/pseudoelementów (z
#: opcjonalnym argumentem w nawiasach, bez zagnieżdżeń nawiasów).
SAMODZIELNY = re.compile(r"^\.(?P<klasa>-?[A-Za-z_][\w-]*)(?::{1,2}[A-Za-z-]+(?:\([^()]*\))?)*$")

#: At-reguły, których blok zawiera zwykłe reguły stylu (selektory liczą się).
AT_Z_REGULAMI = ("@media", "@supports", "@container", "@layer", "@document")


def _usun_komentarze_i_napisy(tekst: str) -> str:
    """Komentarze znikają; treść napisów zastępuje się pustym napisem, żeby
    klamry i przecinki w ``content: "…"`` nie myliły parsera."""
    tekst = re.sub(r"/\*.*?\*/", " ", tekst, flags=re.S)
    return re.sub(r"\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'", '""', tekst)


def _podziel_liste_selektorow(prelud: str) -> list[str]:
    """Podział po przecinkach na poziomie zerowym nawiasów."""
    czesci: list[str] = []
    glebokosc = 0
    biezacy: list[str] = []
    for znak in prelud:
        if znak in "([":
            glebokosc += 1
        elif znak in ")]":
            glebokosc -= 1
        if znak == "," and glebokosc == 0:
            czesci.append("".join(biezacy))
            biezacy = []
        else:
            biezacy.append(znak)
    czesci.append("".join(biezacy))
    return [" ".join(c.split()) for c in czesci if c.strip()]


def selektory_regul(tekst_css: str) -> list[str]:
    """Wszystkie selektory reguł stylu arkusza (znormalizowane białe znaki), także
    wewnątrz ``@media``/``@supports``/``@container``/``@layer``."""
    tekst = _usun_komentarze_i_napisy(tekst_css)
    wynik: list[str] = []
    # Stos kontekstów bloków: True = blok zawiera reguły stylu (arkusz, @media…).
    stos: list[bool] = [True]
    prelud: list[str] = []
    for znak in tekst:
        if znak == "{":
            naglowek = "".join(prelud).strip()
            prelud = []
            if not stos[-1]:
                stos.append(False)
                continue
            if naglowek.startswith("@"):
                stos.append(naglowek.split()[0].split("(")[0] in AT_Z_REGULAMI)
                continue
            wynik.extend(_podziel_liste_selektorow(naglowek))
            # Wnętrze reguły stylu to deklaracje — nie skanujemy go jako selektorów.
            stos.append(False)
        elif znak == "}":
            prelud = []
            if len(stos) > 1:
                stos.pop()
        elif znak == ";":
            # Koniec deklaracji albo at-reguły bez bloku (@import, @charset).
            prelud = []
        else:
            prelud.append(znak)
    return wynik


def klasy_samodzielne(tekst_css: str) -> set[str]:
    """Nazwy klas, które arkusz definiuje selektorem samodzielnym."""
    wynik: set[str] = set()
    for selektor in selektory_regul(tekst_css):
        dopasowanie = SAMODZIELNY.match(selektor)
        if dopasowanie:
            wynik.add(dopasowanie.group("klasa"))
    return wynik


def selektory_zlozone_z_klasa(tekst_css: str) -> set[str]:
    """Selektory złożone (nie samodzielne), które zawierają co najmniej jedną klasę."""
    return {
        s
        for s in selektory_regul(tekst_css)
        if re.search(r"\.-?[A-Za-z_]", s) and not SAMODZIELNY.match(s)
    }


def kolizje(arkusze: dict[str, str]) -> dict[str, list[str]]:
    """Klucz → posortowana lista plików, gdy definicja występuje w >1 pliku.

    Klucz ``.klasa`` = klasa z selektorem samodzielnym w kilku plikach; klucz
    będący pełnym selektorem złożonym = ten sam selektor złożony w kilku plikach.
    """
    zrodla: dict[str, set[str]] = defaultdict(set)
    for nazwa, tekst in arkusze.items():
        for klasa in klasy_samodzielne(tekst):
            zrodla[f".{klasa}"].add(nazwa)
        for selektor in selektory_zlozone_z_klasa(tekst):
            zrodla[selektor].add(nazwa)
    return {k: sorted(v) for k, v in sorted(zrodla.items()) if len(v) > 1}


def wczytaj_arkusze(korzen: Path | None = None) -> dict[str, str]:
    """Arkusze ``*.css`` pod korzeniem (domyślnie ``frontend/src``): ścieżka → treść."""
    korzen = KORZEN_CSS if korzen is None else korzen
    return {
        sciezka.relative_to(korzen).as_posix(): sciezka.read_text(encoding="utf-8")
        for sciezka in sorted(korzen.rglob("*.css"))
        if "node_modules" not in sciezka.parts
    }


def main() -> int:
    arkusze = wczytaj_arkusze()
    liczba_klas = len({k for t in arkusze.values() for k in klasy_samodzielne(t)})
    if not arkusze or liczba_klas == 0:
        print(f"css_jedno_zrodlo_klasy_guard: BŁĄD — pusty skan ({KORZEN_CSS}).")
        return 1
    znalezione = kolizje(arkusze)
    if znalezione:
        print(
            f"css_jedno_zrodlo_klasy_guard: {len(znalezione)} definicji (klasa albo "
            f"selektor złożony) w więcej niż jednym arkuszu (arkusze są globalne):"
        )
        for klucz, pliki in znalezione.items():
            print(f"  {klucz}: {', '.join(pliki)}")
        print(
            "Naprawa u źródła: jedna definicja prymitywu we wspólnym arkuszu; wariant "
            "ekranu selektorem zawężonym do kontenera albo nową klasą; klasy o różnym "
            "znaczeniu — rozdzielić nazwy. Lista dozwolona jest pusta."
        )
        return 1
    print(
        f"css_jedno_zrodlo_klasy_guard: OK — {liczba_klas} klas w {len(arkusze)} arkuszach, "
        "każda z jednym źródłem definicji."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
