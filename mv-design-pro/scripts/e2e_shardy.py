#!/usr/bin/env python3
"""Podział pełnej suity e2e na shardy wg ZMIERZONYCH czasów speców (karta SZYBKIE-TESTY).

PO CO. Pełne e2e na realnym backendzie biegnie jednym workerem (`workers: 1`,
`playwright.config.ts`) — w CI 25 min na jednym runnerze (przebieg 36706845707, 2026-09-30).
Wbudowane `--shard=k/n` Playwrighta dzieli pliki po LICZBIE testów, a czasy speców różnią
się o dwa rzędy wielkości (pojedynczy spec kreatora trwa minuty, spec kontraktu sekundy),
więc najwolniejszy shard wyznacza czas całego workflowu. Ten skrypt przydziela pliki
speców shardom algorytmem LPT (najdłuższy spec do najmniej obciążonego sharda) na
podstawie czasów zmierzonych w `frontend/e2e/czasy_specow.json`.

KONTRAKT (przypięty w `scripts/test_e2e_shardy.py`):
* shardy są ROZŁĄCZNE i razem dają KOMPLET plików `frontend/e2e/*.spec.ts` — żaden spec
  nie znika z CI przez podział;
* przydział jest deterministyczny (remis czasów rozstrzyga ścieżka pliku);
* spec bez pomiaru (nowy plik) dostaje czas równy MEDIANIE zmierzonych i jest nazwany na
  stderr — nie znika i nie blokuje biegu; wpis pomiaru bez pliku (spec usunięty) to błąd
  (RC=2), bo plik czasów kłamałby o suicie.

Użycie (katalog `mv-design-pro/frontend`):

    python ../scripts/e2e_shardy.py --shard 2/4          # lista plików sharda 2 z 4
    python ../scripts/e2e_shardy.py --aktualizuj raport.json   # czasy z raportu JSON Playwrighta

Raport JSON: `npx playwright test --reporter=json` (zmienna `PLAYWRIGHT_JSON_OUTPUT_NAME`).
"""

from __future__ import annotations

import argparse
import heapq
import json
import statistics
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND = PROJECT_ROOT / "frontend"
KATALOG_E2E = FRONTEND / "e2e"
PLIK_CZASOW = KATALOG_E2E / "czasy_specow.json"


def speki(katalog: Path | None = None) -> list[str]:
    """Pliki speców względem `frontend/` (tak, jak przyjmuje je Playwright), posortowane."""
    katalog = katalog or KATALOG_E2E
    return sorted(p.relative_to(katalog.parent).as_posix() for p in katalog.glob("*.spec.ts"))


def wczytaj_czasy(plik: Path | None = None) -> dict[str, float]:
    plik = plik or PLIK_CZASOW
    return {k: float(v) for k, v in json.loads(plik.read_text(encoding="utf-8"))["czasy_s"].items()}


def wagi(
    pliki: list[str], czasy: dict[str, float]
) -> tuple[dict[str, float], list[str], list[str]]:
    """Waga każdego pliku, lista plików bez pomiaru i lista pomiarów bez pliku."""
    bez_pomiaru = [p for p in pliki if p not in czasy]
    bez_pliku = sorted(set(czasy) - set(pliki))
    mediana = statistics.median(czasy.values()) if czasy else 1.0
    return {p: czasy.get(p, mediana) for p in pliki}, bez_pomiaru, bez_pliku


def przydziel(wagi_plikow: dict[str, float], liczba: int) -> list[list[str]]:
    """LPT: pliki od najdłuższego, każdy do sharda o najmniejszej sumie (remis — niższy
    numer sharda). Kolejność plików w shardzie — alfabetyczna (stały porządek biegu)."""
    if liczba < 1:
        raise ValueError("liczba shardow musi byc >= 1")
    kopiec: list[tuple[float, int]] = [(0.0, indeks) for indeks in range(liczba)]
    shardy: list[list[str]] = [[] for _ in range(liczba)]
    for plik in sorted(wagi_plikow, key=lambda p: (-wagi_plikow[p], p)):
        suma, indeks = heapq.heappop(kopiec)
        shardy[indeks].append(plik)
        heapq.heappush(kopiec, (suma + wagi_plikow[plik], indeks))
    return [sorted(shard) for shard in shardy]


def czasy_z_raportu(raport: dict) -> dict[str, float]:
    """Suma czasów wszystkich prób wszystkich testów pliku z raportu JSON Playwrighta [s]."""
    czasy: dict[str, float] = {}

    def przejdz(suite: dict, plik: str | None) -> None:
        plik = suite.get("file") or plik
        for spec in suite.get("specs", []):
            for test in spec.get("tests", []):
                for wynik in test.get("results", []):
                    klucz = f"e2e/{plik}"
                    czasy[klucz] = czasy.get(klucz, 0.0) + wynik.get("duration", 0) / 1000.0
        for podrzedny in suite.get("suites", []):
            przejdz(podrzedny, plik)

    for suite in raport.get("suites", []):
        przejdz(suite, None)
    return {k: round(v, 1) for k, v in sorted(czasy.items())}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    tryb = parser.add_mutually_exclusive_group(required=True)
    tryb.add_argument("--shard", help="k/n — wypisz pliki sharda k z n")
    tryb.add_argument("--aktualizuj", type=Path, help="raport JSON Playwrighta z pełnego biegu")
    parser.add_argument("--zrodlo", default="", help="opis pomiaru zapisywany w pliku czasów")
    argumenty = parser.parse_args(argv)

    if argumenty.aktualizuj is not None:
        czasy = czasy_z_raportu(json.loads(argumenty.aktualizuj.read_text(encoding="utf-8")))
        PLIK_CZASOW.write_text(
            json.dumps({"zrodlo": argumenty.zrodlo, "czasy_s": czasy}, ensure_ascii=False, indent=2)
            + "\n",
            encoding="utf-8",
        )
        print(f"Zapisano czasy {len(czasy)} specow do {PLIK_CZASOW}")
        return 0

    try:
        numer_tekst, liczba_tekst = argumenty.shard.split("/")
        numer, liczba = int(numer_tekst), int(liczba_tekst)
    except ValueError:
        print(f"BLAD: --shard oczekuje k/n, podano {argumenty.shard!r}", file=sys.stderr)
        return 2
    if not 1 <= numer <= liczba:
        print(f"BLAD: numer sharda {numer} poza 1..{liczba}", file=sys.stderr)
        return 2
    pliki = speki()
    wagi_plikow, bez_pomiaru, bez_pliku = wagi(pliki, wczytaj_czasy())
    if bez_pliku:
        print(
            "BLAD: czasy_specow.json mierzy speki, ktorych nie ma (usuniete lub przemianowane) — "
            "zaktualizuj pomiar: " + ", ".join(bez_pliku),
            file=sys.stderr,
        )
        return 2
    for plik in bez_pomiaru:
        print(f"UWAGA: spec bez pomiaru czasu (waga = mediana): {plik}", file=sys.stderr)
    shard = przydziel(wagi_plikow, liczba)[numer - 1]
    print(
        f"shard {numer}/{liczba}: {len(shard)} plikow, "
        f"szacunek {sum(wagi_plikow[p] for p in shard):.0f} s",
        file=sys.stderr,
    )
    print(" ".join(shard))
    return 0


if __name__ == "__main__":
    sys.exit(main())
