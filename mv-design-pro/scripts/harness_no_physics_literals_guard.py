#!/usr/bin/env python3
"""Zapadka (ratchet) literałów fizyki i ręcznych identyfikatorów biegów w
harnessach zrzutów (`frontend/src/*harness-main.tsx`).

DLACZEGO (karta HARNESS-RESZTA, 2026-09-16, domknięcie klasy po
HARNESS-ZWARCIA). Sceny harnessu MUSZĄ być karmione fixturami z JEDNEGO
realnego biegu backendu (`backend/scripts/eksport_fixtur_harnessu.py`,
parytet w `backend/tests/ci/test_fixtury_harnessu.py`) — nie ręcznie
wpisanymi liczbami fizycznymi ani ręcznie wymyślonymi identyfikatorami
biegów. Ręczna liczba wygląda jak wynik solvera, ale nie jest — dokładnie ta
klasa defektu (STABILNOSC_WYNIK harnessu deklarował `proof_status_pl: 'pelny'`
dla zdolności UNVALIDATED_MODEL, podczas gdy realny bieg backendu na tych
samych danych zwraca `'czesciowy'`/`reporting_status: 'not_reportable'` —
zmierzone przy tej karcie, naprawione konwersją sceny na fixturę).

DLACZEGO ZAPADKA, A NIE „ZERO OD RAZU". Pomiar w chwili założenia (ta karta):
`creator-harness-main.tsx` niesie WCIĄŻ dziesiątki bloków JSON pisanych
ręcznie dla analiz, których backend NIE eksportuje jeszcze przez
`eksport_fixtur_harnessu.py` (koordynacja zabezpieczeń, dobór przekładników,
porównania A/B rozpływu i zabezpieczeń, SSCI, zgodność powykonawcza,
estymacja WLS, składowe 1F, zbieżność rozpływu/OLTC, pulpit — rejestr pełny w
meldunku karty) — zamknięcie WSZYSTKICH tych domen wymaga per-domena:
realnego wejścia ENM, nowej funkcji eksportu, testu parytetu i przepięcia
mocka. Wpięcie bramki zero-tolerancji TERAZ zapaliłoby CI na długo
istniejącym stanie, co CLAUDE.md (Zero-Debt pkt 1) odróżnia od maskowania: to
NIE jest wykluczenie pliku ani `continue-on-error` — narzędzie DZIAŁA
NAPRAWDĘ i pilnuje, żeby literałów nie przybyło ANI JEDNEGO od tego pomiaru.

STAN (2026-09-16, karta HARNESS-RESZTA + kontynuacja). `creator-harness-
main.tsx`: jedenaście scen zamknięte na realny bieg backendu (E-31 „stan
fazowy SN", E-32 „stabilność dynamiczna", „siła-sieci", „migotanie",
„kompensacja(-wynik)", „rozplyw", „walidacja", „uwaga", „cieplna",
„arcflash") — prog literałów fizyki 229→164, ręcznych `run_id` 54→40.
`screenshot-harness-main.tsx`: DOMKNIĘTY DO ZERA (2→0 / 1→0) — scena
`zwarcia-schemat` (karta Z-3) przeszła z liczb pożyczonych z innej sieci na
REALNY bieg `short_circuit_sn` na kopii `gpzFeeder.enm.json` z dołożonym
falownikiem; przy okazji naprawiony u źródła napotkany defekt klasy
(`enm/canonical_analysis.py::_sc_rozplyw_galeziowy` niósł klucz wewnętrzny
grafu solvera zamiast `ref_id` domenowego — nakładka strzałek dawała PUSTY
wynik na KAŻDEJ realnej sieci, nie tylko w tym harnessie). Próg maleje o tyle,
ile realnie zdjęto — reszta zostaje NAZWANA, zmierzona i zamknięta w
kolejnych kartach tej samej klasy, nie cicho pominięta.

CO ŁAPIE (dwie klasy wzorców, TYLKO w plikach `frontend/src/*harness-main.tsx`
— fixtury `harness-fixtures/generated/*.json` są WEJŚCIEM tych plików, nie
skanowanym tekstem):

1. Pole obiektu JS/TS z SUFIKSEM JEDNOSTKI FIZYCZNEJ i literałem liczbowym
   wprost po dwukropku — `ikss_ka: 8.4`, `p_mw: 3.9`, `loading_pct: 38.5`,
   `napiecie_sieci_v` itd. Sufiksy: ka, kv, mw, mvar, mva, a, percent, pct,
   pu, ohm, v, w (lista 1:1 z jednostkami SI/branżowymi używanymi w
   kontraktach backendu tego repo — `docs/system/SPEC_WYNIKI_I_KONTRAKTY_
   WYNIKOW.md`). Odczyt z importu (`stanFazowyScenyWyniki.run_id`,
   `wiersz.ikss_ka`) NIE jest literałem — wzorzec wymaga dwukropka i CYFRY
   wprost po nazwie pola, nie odwołania do zmiennej.
2. `run_id: 'run-…'` / `id: 'run-…'` — identyfikator biegu wpisany jako
   literał tekstowy zamiast odczytany z `*.run_id` fixtury wygenerowanej
   backendem (rejestr `RUN_ID_*` w `eksport_fixtur_harnessu.py`).

CZEGO NIE ŁAPIE (świadomie, zmierzone jako brak fałszywej czerwieni): pola
BEZ sufiksu jednostki (`min_position: -9`, `iterations: 4` — te NIE są
wielkościami fizycznymi, tylko konfiguracją/licznikami), literały w
komentarzach i docstringach (wzorzec skanuje CAŁY tekst linii, więc komentarz
z przykładową liczbą fizyczną — jak wywody w komentarzach tego repo — TEŻ by
się złapał; stąd zapadka mierzy STAN, nie każe wycinać dokumentacji: nowy
komentarz z przykładem podnosi próg tylko wtedy, gdy naprawdę dokłada dług,
co recenzent karty ocenia przy podniesieniu progu).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FRONTEND_SRC = ROOT / "frontend" / "src"

#: Pliki objęte bramką — DOKŁADNIE `*-harness-main.tsx` (żadna inna ścieżka:
#: to jest kontrakt tej karty, nie ogólny zakaz literałów w całym frontendzie).
HARNESS_FILES: tuple[str, ...] = (
    "creator-harness-main.tsx",
    "screenshot-harness-main.tsx",
)

#: Sufiksy jednostek fizycznych rozpoznawane na końcu nazwy pola.
_JEDNOSTKI = (
    "ka",
    "kv",
    "mw",
    "mvar",
    "mva",
    "a",
    "percent",
    "pct",
    "pu",
    "ohm",
    "v",
    "w",
)

#: Pole `<identyfikator>_<jednostka>: <liczba>` — literał fizyki.
WZORZEC_LITERALU_FIZYKI = re.compile(
    r"\b[a-zA-Z_][a-zA-Z0-9_]*_(?:" + "|".join(_JEDNOSTKI) + r")\s*:\s*-?\d"
)

#: `run_id: 'run-…'` / `id: 'run-…'` — ręczny identyfikator biegu.
WZORZEC_RECZNEGO_RUN_ID = re.compile(r"""\b(run_id|id)\s*:\s*'run-[^']*'""")

#: ZMIERZONY stan długu w chwili założenia zapadki (karta HARNESS-RESZTA,
#: 2026-09-16, drzewo tej karty) — PO konwersji scen E-31/E-32 na fixtury
#: realnego biegu backendu. Ta para liczb MA MALEĆ z każdą kolejną kartą,
#: która zamyka kolejną domenę analizy na realny bieg. Podniesienie wymaga
#: uzasadnienia w commicie (nowy literał fizyki dołożony do harnessu jest
#: naruszeniem karty, nie przypadkiem).
PROG: dict[str, tuple[int, int]] = {
    "creator-harness-main.tsx": (164, 40),
    "screenshot-harness-main.tsx": (0, 0),
}


def znajdz_naruszenia(
    tekst: str,
) -> tuple[list[tuple[int, str]], list[tuple[int, str]]]:
    """(literały fizyki, ręczne run_id) — każdy jako (nr linii, treść linii)."""
    literaly: list[tuple[int, str]] = []
    run_idy: list[tuple[int, str]] = []
    for numer, linia in enumerate(tekst.splitlines(), start=1):
        if WZORZEC_LITERALU_FIZYKI.search(linia):
            literaly.append((numer, linia.strip()))
        if WZORZEC_RECZNEGO_RUN_ID.search(linia):
            run_idy.append((numer, linia.strip()))
    return literaly, run_idy


def main() -> int:
    if not FRONTEND_SRC.is_dir():
        print(f"BLAD: brak katalogu {FRONTEND_SRC}", file=sys.stderr)
        return 1

    czerwone = False
    for nazwa in HARNESS_FILES:
        sciezka = FRONTEND_SRC / nazwa
        if not sciezka.is_file():
            print(f"BLAD: brak pliku objetego bramka: {sciezka}", file=sys.stderr)
            return 1
        literaly, run_idy = znajdz_naruszenia(sciezka.read_text(encoding="utf-8"))
        prog_literaly, prog_run_idy = PROG.get(nazwa, (0, 0))
        print(
            f"harness_no_physics_literals_guard: {nazwa}: "
            f"{len(literaly)} literalow fizyki (prog {prog_literaly}), "
            f"{len(run_idy)} recznych run_id (prog {prog_run_idy})"
        )
        if len(literaly) > prog_literaly:
            czerwone = True
            print(
                f"\nFAILED: {nazwa} — literaly fizyki UROSLY "
                f"({prog_literaly} -> {len(literaly)}). Nowe wystapienia:",
                file=sys.stderr,
            )
            for numer, linia in literaly[prog_literaly:]:
                print(f"  {nazwa}:{numer}: {linia}", file=sys.stderr)
        elif len(literaly) < prog_literaly:
            czerwone = True
            print(
                f"\nFAILED: {nazwa} — literaly fizyki ZMALALY "
                f"({prog_literaly} -> {len(literaly)}) — obniz PROG w tym pliku.",
                file=sys.stderr,
            )
        if len(run_idy) > prog_run_idy:
            czerwone = True
            print(
                f"\nFAILED: {nazwa} — reczne run_id UROSLY "
                f"({prog_run_idy} -> {len(run_idy)}). Nowe wystapienia:",
                file=sys.stderr,
            )
            for numer, linia in run_idy[prog_run_idy:]:
                print(f"  {nazwa}:{numer}: {linia}", file=sys.stderr)
        elif len(run_idy) < prog_run_idy:
            czerwone = True
            print(
                f"\nFAILED: {nazwa} — reczne run_id ZMALALY "
                f"({prog_run_idy} -> {len(run_idy)}) — obniz PROG w tym pliku.",
                file=sys.stderr,
            )

    if czerwone:
        print(
            "\nZapadka dziala w obie strony: dlug nie moze urosnac, a poprawa musi "
            "byc utrwalona obnizeniem PROG. Zero scen z fixtury nie jest wyjatkiem — "
            "kazda scena docelowo karmiona WYLACZNIE realnym biegiem backendu.",
            file=sys.stderr,
        )
        return 1

    print("OK: dlug literalow fizyki/recznych run_id w harnessach nie urosl.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
