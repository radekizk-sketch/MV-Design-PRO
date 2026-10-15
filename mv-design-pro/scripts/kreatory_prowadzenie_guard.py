#!/usr/bin/env python3
"""Strażnik kontraktu prowadzenia projektanta w kreatorach (`frontend/src/ui2/kreatory`).

DLACZEGO (karta PROWADZENIE-KREATORY, 2026-10-15). Kreatory sygnalizowały pracę
w toku jak błąd: przycisk „Zapisz” był wyszarzany brakiem danych, stopka mówiła
ogólnikowo „Uzupełnij wymagane pola”, a wartości dobrane automatycznie nosiły
etykietę pochodzenia „przyjęto: X (źródło)”. Dyrektywa właściciela: MV-DESIGN PRO
jest narzędziem projektowym — w trakcie pracy kreator milczy, brak wskazuje dopiero
klik zapisu (jedno zdanie „co — po co” z przejściem do pola), a wartość dobrana
automatycznie jest zwykłą, edytowalną wartością pola.

KONTRAKT PILNOWANY STATYCZNIE (jedno źródło reguł: ``REGULY_TEKSTU`` i funkcje
``naruszenia_*``):

1. ``rama/KreatorRama.tsx``: akcja zapisu (``AkcjaZapisu``) NIE ma pola
   ``zablokowana``, a jedyna blokada zapisu to zamknięta lista ``BlokadaZapisu`` =
   {``'ladowanie'``, ``'zapis_w_toku'``} z ``rama/prowadzenie.ts``.
2. Żaden kreator nie przekazuje ``zablokowana:`` w ``akcjaGlowna``.
3. Przycisk zapisu (``data-testid`` zawierający ``zapisz``) może mieć ``disabled``
   wyłącznie od trwającego zapisu albo wczytywania (identyfikatory z
   ``DOZWOLONE_BLOKADY_PRZYCISKU``) — nigdy od kompletności danych.
4. Teksty: zakaz ogólników o brakach („Uzupełnij wymagane pola”, „Do konfiguracji”,
   „Do doboru”, „Do uzupełnienia”), etykiet pochodzenia („przyjęto: …”) i kryptonimów
   kart w tekście dla projektanta („(W-W5-01)”, „dług B-3”).
5. Zakaz znacznika pochodzenia wartości: prop ``przyjeto=`` i klasa
   ``mvd-pole-przyjeto``.

ZAKRES. Pliki ``*.ts``/``*.tsx`` w ``frontend/src/ui2/kreatory`` bez ``__tests__``
i plików ``*.test.*``. Komentarze (wiersze ``//``/``*`` i całe bloki ``/* … */``) są
pomijane w regule 4 — opis historii defektu może nazwać zakazany tekst.

LISTA DOZWOLONA: pusta. Samotest: ``scripts/test_kreatory_prowadzenie_guard.py``.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KREATORY = ROOT / "frontend" / "src" / "ui2" / "kreatory"

#: Zamknięta lista blokad zapisu (``rama/prowadzenie.ts``).
BLOKADY_ZAPISU = frozenset({"ladowanie", "zapis_w_toku"})

#: Identyfikatory, od których wolno wyszarzyć przycisk zapisu (trwający zapis / wczytywanie).
DOZWOLONE_BLOKADY_PRZYCISKU = frozenset(
    {"zapisWToku", "zapisywanie", "zapisTrwa", "ladowanie", "katalogLadowanie"}
)

#: Reguła 4 — (nazwa, wzorzec) zakazanych tekstów dla projektanta.
REGULY_TEKSTU: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("ogólnik o brakach", re.compile(r"Uzupełnij\s+(?:wymagane|dane|pola|brakujące)", re.I)),
    ("ogólnik o brakach", re.compile(r"wymagane\s+pola", re.I)),
    ("status pracy w toku", re.compile(r"Do\s+(?:konfiguracji|doboru|uzupełnienia)\b")),
    ("etykieta pochodzenia", re.compile(r"przyjęto:", re.I)),
    ("kryptonim karty", re.compile(r"\((?:W-W\d|V12K-\d|KD-\d)")),
    ("kryptonim karty", re.compile(r"\bdług\s+[A-Z]-\d")),
)

_KOMENTARZ = re.compile(r"^\s*(?://|\*|/\*|\{/\*)")
_BLOK_KOMENTARZA = re.compile(r"/\*.*?\*/", re.S)


def _bez_blokow_komentarza(tekst: str) -> str:
    """Bloki ``/* … */`` zastąpione spacjami z zachowaniem podziału na wiersze (numeracja)."""
    return _BLOK_KOMENTARZA.sub(lambda m: re.sub(r"[^\n]", " ", m.group(0)), tekst)


def pliki_kreatorow(korzen: Path = KREATORY) -> list[Path]:
    """Pliki źródłowe kreatorów (bez testów)."""
    wynik: list[Path] = []
    for plik in sorted(korzen.rglob("*")):
        if plik.suffix not in {".ts", ".tsx"} or "__tests__" in plik.parts:
            continue
        if ".test." in plik.name or ".spec." in plik.name:
            continue
        wynik.append(plik)
    return wynik


def naruszenia_tekstu(tekst: str) -> list[tuple[int, str, str]]:
    """Reguła 4: (nr wiersza, nazwa reguły, dopasowanie) — bez wierszy komentarza."""
    wynik: list[tuple[int, str, str]] = []
    for nr, wiersz in enumerate(_bez_blokow_komentarza(tekst).splitlines(), start=1):
        if _KOMENTARZ.match(wiersz):
            continue
        for nazwa, wzor in REGULY_TEKSTU:
            for m in wzor.finditer(wiersz):
                wynik.append((nr, nazwa, m.group(0)))
    return wynik


def naruszenia_znacznika(tekst: str) -> list[tuple[int, str]]:
    """Reguła 5: znacznik pochodzenia wartości (prop ``przyjeto=``, klasa ``mvd-pole-przyjeto``)."""
    wynik: list[tuple[int, str]] = []
    for nr, wiersz in enumerate(tekst.splitlines(), start=1):
        if _KOMENTARZ.match(wiersz):
            continue
        for wzor in (r"\bprzyjeto=", r"mvd-pole-przyjeto"):
            if re.search(wzor, wiersz):
                wynik.append((nr, wzor))
    return wynik


def naruszenia_akcji_glownej(tekst: str) -> list[int]:
    """Reguła 2: ``zablokowana:`` wewnątrz obiektu ``akcjaGlowna={{ … }}``."""
    wynik: list[int] = []
    for m in re.finditer(r"akcjaGlowna=\{\{", tekst):
        poziom = 2
        i = m.end()
        while i < len(tekst) and poziom > 0:
            if tekst[i] == "{":
                poziom += 1
            elif tekst[i] == "}":
                poziom -= 1
            i += 1
        obiekt = tekst[m.end() : i]
        if re.search(r"\bzablokowana\s*:", obiekt):
            wynik.append(tekst.count("\n", 0, m.start()) + 1)
    return wynik


def _identyfikatory(wyrazenie: str) -> set[str]:
    return set(re.findall(r"[A-Za-z_$][A-Za-z0-9_$]*", wyrazenie))


def naruszenia_przycisku_zapisu(tekst: str) -> list[tuple[int, str]]:
    """Reguła 3: ``<button … disabled={X} …>`` z testid zapisu, gdzie X nie jest blokadą zapisu."""
    wynik: list[tuple[int, str]] = []
    for m in re.finditer(r"<button\b", tekst):
        koniec = tekst.find(">", m.end())
        # Otwierający znacznik może mieć `>` w wyrażeniach strzałkowych — bierzemy do `>` po
        # ostatnim atrybucie: szukamy pierwszego `>` poza nawiasami klamrowymi.
        poziom = 0
        i = m.end()
        while i < len(tekst):
            znak = tekst[i]
            if znak == "{":
                poziom += 1
            elif znak == "}":
                poziom -= 1
            elif znak == ">" and poziom == 0:
                koniec = i
                break
            i += 1
        znacznik = tekst[m.start() : koniec]
        # Wartość testid do końca wiersza: szablon `${…}` ma własne klamry, więc wzorzec
        # „do pierwszej klamry zamykającej” gubił `…-zapisz` (samotest to wykrył).
        testid = re.search(r"data-testid=([^\n]*)", znacznik)
        if not testid or "zapisz" not in testid.group(1):
            continue
        blokada = re.search(r"disabled=\{([^}]*)\}", znacznik)
        if not blokada:
            continue
        wyrazenie = blokada.group(1)
        if "!" in wyrazenie or not _identyfikatory(wyrazenie) <= DOZWOLONE_BLOKADY_PRZYCISKU:
            wynik.append((tekst.count("\n", 0, m.start()) + 1, wyrazenie.strip()))
    return wynik


def naruszenia_ramy(rama: str, prowadzenie: str) -> list[str]:
    """Reguła 1: kształt akcji zapisu ramy i zamknięta lista blokad."""
    wynik: list[str] = []
    akcja = re.search(r"export interface AkcjaZapisu\s*\{(.*?)\n\}", rama, re.S)
    if akcja is None:
        wynik.append("rama: brak interfejsu AkcjaZapisu")
    elif re.search(r"\bzablokowana\b", akcja.group(1)):
        wynik.append("rama: AkcjaZapisu ma pole „zablokowana” (brak danych nie wyszarza zapisu)")
    typ = re.search(r"export type BlokadaZapisu\s*=\s*([^;]+);", prowadzenie)
    if typ is None:
        wynik.append("prowadzenie: brak typu BlokadaZapisu")
    else:
        literaly = set(re.findall(r"'([^']+)'", typ.group(1)))
        if literaly != BLOKADY_ZAPISU:
            wynik.append(
                f"prowadzenie: BlokadaZapisu = {sorted(literaly)}, oczekiwano {sorted(BLOKADY_ZAPISU)}"
            )
    return wynik


def sprawdz(korzen: Path = KREATORY) -> list[str]:
    """Wszystkie naruszenia jako zdania (pusta lista = kontrakt dotrzymany)."""
    wynik: list[str] = []
    rama = korzen / "rama" / "KreatorRama.tsx"
    prowadzenie = korzen / "rama" / "prowadzenie.ts"
    if rama.exists() and prowadzenie.exists():
        wynik.extend(
            naruszenia_ramy(
                rama.read_text(encoding="utf-8"), prowadzenie.read_text(encoding="utf-8")
            )
        )
    else:
        wynik.append("brak ramy kreatorów (rama/KreatorRama.tsx, rama/prowadzenie.ts)")
    for plik in pliki_kreatorow(korzen):
        tekst = plik.read_text(encoding="utf-8")
        rel = plik.relative_to(korzen)
        for nr, nazwa, dopasowanie in naruszenia_tekstu(tekst):
            wynik.append(f"{rel}:{nr}: {nazwa}: „{dopasowanie}”")
        for nr, wzor in naruszenia_znacznika(tekst):
            wynik.append(f"{rel}:{nr}: znacznik pochodzenia wartości ({wzor})")
        for nr in naruszenia_akcji_glownej(tekst):
            wynik.append(f"{rel}:{nr}: akcjaGlowna z „zablokowana” (brak danych nie wyszarza zapisu)")
        for nr, wyrazenie in naruszenia_przycisku_zapisu(tekst):
            wynik.append(
                f"{rel}:{nr}: przycisk zapisu wyszarzany wyrażeniem „{wyrazenie}” — "
                "dozwolona wyłącznie blokada trwającego zapisu albo wczytywania"
            )
    return wynik


def main() -> int:
    naruszenia = sprawdz()
    if naruszenia:
        print(f"kreatory_prowadzenie_guard: {len(naruszenia)} naruszeń kontraktu prowadzenia:")
        for n in naruszenia:
            print(f"  {n}")
        return 1
    print(f"kreatory_prowadzenie_guard: OK ({len(pliki_kreatorow())} plików kreatorów)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
