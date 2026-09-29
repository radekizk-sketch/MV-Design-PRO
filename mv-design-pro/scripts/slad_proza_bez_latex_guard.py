#!/usr/bin/env python3
"""Strażnik kontraktu kroku śladu: pole PROZY nie niesie zapisu LaTeX.

DLACZEGO (karta DOWOD-CIEPLNY, 2026-09-25). Ekran oceny wytrzymałości cieplnej
przewodów pokazywał projektantowi w polu „Podstawienie" surowy zapis
``$$t_k = 1\\ \\mathrm{s}$$``: producent kroku (`wytrzymalosc_cieplna_przewodow.
_krok_czasu`) wkładał LaTeX do pola ``substitution``, a front — zgodnie z
kontraktem — renderuje ``substitution`` jako tekst, a ``substitution_latex``
przez KaTeX. Ta sama pomyłka pól siedziała w całej rodzinie kryteriów
wyposażenia (przewód, kabel, CT, VT, transformator) i w kopii zapisu rdzenia
IEC 60909 (``substitution`` == ``substitution_latex``). Spec zrzutowy był
zielony, bo nie sprawdzał treści.

KONTRAKT (jedno źródło prawdy tej reguły). Krok śladu to słownik niosący co
najmniej jedno z pól ``formula_latex``, ``substitution``, ``substitution_latex``,
``substitution_pl``. LaTeX wolno nieść WYŁĄCZNIE w polach z przyrostkiem
``_latex``; pola prozy (``POLA_PROZY`` oraz każde pole z przyrostkiem ``_pl``)
są tekstem dla projektanta i nie mogą zawierać znaczników LaTeX
(``ZNACZNIKI_LATEX``). Pole ``formula`` (bez przyrostka) NIE jest prozą — to
wzór w starszym nazewnictwie producentów, który żaden konsument nie pokazuje
jako tekstu (inwentarz w meldunku karty); ``symbol`` JEST prozą, bo ekrany
jakości i SSCI pokazują go tekstem.

KONWENCJA OGRANICZNIKÓW pól ``*_latex``: zapis GOŁY, bez ``$$``/``$``. Pomiar
2026-09-25: w korpusie 1384 pola ``*_latex`` kroków, 0 z ogranicznikami;
``MathRenderer`` przyjmuje obie postacie, ale eksport LaTeX biegu wstawia pole
w środowisko ``\\[ … \\]``, w którym ``$$`` łamie kompilację dokumentu. Ten
strażnik pilnuje obu połówek kontraktu: prozy bez LaTeX-u i LaTeX-u bez
ograniczników.

KORPUS (wyjście wszystkich generatorów fikstur frontu):
- każdy plik ``*.json`` pod ``frontend/src`` i ``frontend/e2e`` (fikstury
  harnessu, projekcji nN, podłoża SLD i fikstury testów);
- każdy moduł ``*.ts`` pod ``frontend/src`` oznaczony nagłówkiem
  ``GENERATED — DO NOT EDIT BY HAND`` z literałem JSON po ``=`` (towarzysze
  stacji SLD z generatora ``station_archetype_substrate``).
Przebieg producentów backendu sprawdza ten sam predykat w
``backend/tests/ci/test_slad_proza_bez_latex.py`` (importuje TEN moduł).

LISTA DOZWOLONA: pusta i taka ma zostać. Kod wyjścia 0 = zero naruszeń.
"""

from __future__ import annotations

import json
import re
import sys
from collections.abc import Iterator
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
KORZENIE_KORPUSU = (FRONTEND / "src", FRONTEND / "e2e")

#: Znaczniki zapisu LaTeX w tekście: ograniczniki ``$$`` i ``$…$``, dowolne
#: polecenie (``\\mathrm``, ``\\frac``, ``\\cdot``, ``\\sqrt``, ``\\left``…) oraz
#: indeks/wykładnik w nawiasach klamrowych (``_{``, ``^{``).
ZNACZNIKI_LATEX = re.compile(r"\$\$|\$[^$\s][^$]*\$|\\[A-Za-z]+|_\{|\^\{")

#: Pola wyróżniające słownik jako krok śladu.
POLA_KROKU = frozenset({"formula_latex", "substitution", "substitution_latex", "substitution_pl"})

#: Pola prozy kroku (tekst dla projektanta). Dodatkowo każde pole ``*_pl``.
POLA_PROZY = frozenset({"title", "substitution", "notes", "unit_check", "description", "symbol"})

#: Nagłówek modułu TS wygenerowanego z backendu.
ZNACZNIK_GENERATED = "GENERATED — DO NOT EDIT BY HAND"
LITERAL_TS = re.compile(r"=\s*(\{.*\})\s*;\s*$", re.DOTALL)

#: Lista dozwolona — PUSTA (karta DOWOD-CIEPLNY §0.1).
DOZWOLONE: frozenset[str] = frozenset()


def jest_polem_prozy(nazwa: str) -> bool:
    """Czy pole kroku jest prozą (tekstem pokazywanym projektantowi)."""
    return nazwa in POLA_PROZY or nazwa.endswith("_pl")


def znaczniki_latex(tekst: str) -> list[str]:
    """Znaczniki LaTeX znalezione w tekście (pusta lista = czysta proza)."""
    return [m.group(0) for m in ZNACZNIKI_LATEX.finditer(tekst)]


def naruszenia_kroku(krok: dict[str, Any]) -> list[tuple[str, str]]:
    """(pole, opis) każdego naruszenia kontraktu pól kroku.

    Pole prozy ze znacznikiem LaTeX albo pole ``*_latex`` z ogranicznikiem ``$``.
    """
    wynik: list[tuple[str, str]] = []
    for pole, wartosc in krok.items():
        if not isinstance(wartosc, str):
            continue
        if pole.endswith("_latex"):
            if "$" in wartosc:
                wynik.append((pole, "ogranicznik „$” w polu LaTeX (konwencja: zapis goły)"))
            continue
        if not jest_polem_prozy(pole):
            continue
        znalezione = znaczniki_latex(wartosc)
        if znalezione:
            wynik.append((pole, f"znacznik LaTeX „{znalezione[0]}” w polu prozy"))
    return wynik


def kroki_sladu(dane: Any, sciezka: str = "") -> Iterator[tuple[str, dict[str, Any]]]:
    """Każdy słownik-krok śladu w drzewie JSON (ze ścieżką do meldunku)."""
    if isinstance(dane, dict):
        if POLA_KROKU & dane.keys():
            yield sciezka or "/", dane
        for klucz, wartosc in dane.items():
            yield from kroki_sladu(wartosc, f"{sciezka}/{klucz}")
    elif isinstance(dane, list):
        for indeks, wartosc in enumerate(dane):
            yield from kroki_sladu(wartosc, f"{sciezka}[{indeks}]")


def naruszenia_danych(dane: Any, zrodlo: str) -> list[str]:
    """Meldunki naruszeń w jednym dokumencie (``zrodlo`` — nazwa do meldunku)."""
    meldunki: list[str] = []
    for sciezka, krok in kroki_sladu(dane):
        for pole, opis in naruszenia_kroku(krok):
            identyfikator = f"{zrodlo}:{sciezka}:{pole}"
            if identyfikator in DOZWOLONE:
                continue
            meldunki.append(f"{identyfikator} — {opis}")
    return meldunki


def dane_pliku(plik: Path) -> Any | None:
    """Treść JSON pliku korpusu (``None`` — plik nie jest danymi kroków)."""
    tekst = plik.read_text(encoding="utf-8-sig")
    if plik.suffix == ".json":
        return json.loads(tekst)
    if ZNACZNIK_GENERATED not in tekst:
        return None
    dopasowanie = LITERAL_TS.search(tekst)
    if dopasowanie is None:
        return None
    return json.loads(dopasowanie.group(1))


def pliki_korpusu(korzenie: tuple[Path, ...] = KORZENIE_KORPUSU) -> list[Path]:
    """Pliki korpusu w stałej kolejności (determinizm meldunku)."""
    pliki: list[Path] = []
    for korzen in korzenie:
        pliki.extend(p for p in korzen.rglob("*.json") if "node_modules" not in p.parts)
        pliki.extend(p for p in korzen.rglob("*.ts") if "node_modules" not in p.parts)
    return sorted(pliki)


def sprawdz(korzenie: tuple[Path, ...] = KORZENIE_KORPUSU) -> tuple[int, int, list[str]]:
    """(liczba dokumentów z krokami, liczba kroków, meldunki naruszeń)."""
    dokumenty = 0
    kroki = 0
    meldunki: list[str] = []
    for plik in pliki_korpusu(korzenie):
        dane = dane_pliku(plik)
        if dane is None:
            continue
        liczba = sum(1 for _ in kroki_sladu(dane))
        if liczba == 0:
            continue
        dokumenty += 1
        kroki += liczba
        nazwa = plik.relative_to(ROOT) if plik.is_relative_to(ROOT) else plik
        meldunki.extend(naruszenia_danych(dane, str(nazwa)))
    return dokumenty, kroki, meldunki


def main() -> int:
    dokumenty, kroki, meldunki = sprawdz()
    if kroki == 0:
        # Pusty skan to błąd, nie zieleń: zmienił się układ katalogów albo kształt kroku.
        print("slad_proza_bez_latex_guard: BŁĄD — korpus nie zawiera ani jednego kroku śladu.")
        return 1
    if meldunki:
        print(
            f"slad_proza_bez_latex_guard: {len(meldunki)} naruszeń kontraktu kroku śladu "
            f"({kroki} kroków w {dokumenty} dokumentach):"
        )
        for meldunek in meldunki:
            print(f"  {meldunek}")
        print(
            "Naprawa u źródła: LaTeX do pola `*_latex` (bez ograniczników `$$`), proza bez "
            "znaczników. Lista dozwolona jest pusta."
        )
        return 1
    print(
        f"slad_proza_bez_latex_guard: OK — {kroki} kroków śladu w {dokumenty} dokumentach, "
        "pola prozy bez zapisu LaTeX."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
