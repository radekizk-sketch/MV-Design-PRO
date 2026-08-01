#!/usr/bin/env python3
"""Zapadka (ratchet) długu typów: mypy JEST uruchamiany i dług NIE MOŻE rosnąć.

DLACZEGO TA ZAPADKA ISTNIEJE (V12K-240, pomiar w V12K-239). `pyproject.toml` konfiguruje
mypy w trybie strict z wtyczką pydantic, `CLAUDE.md` wymienia `poetry run mypy src` wśród
poleceń deweloperskich — a **żaden workflow CI go nie uruchamiał**. Klasyczna „zdolność
bez wywołania": narzędzie skonfigurowane, nigdy nie wywołane, więc przez lata narastał
dług, którego nikt nie widział. POMIAR w chwili założenia zapadki: **273 błędy w 67
plikach** (sprawdzonych 741 plików źródłowych).

DLACZEGO ZAPADKA, A NIE „NAPRAW WSZYSTKO ALBO WYKLUCZ". Wpięcie `mypy src` wprost
zrobiłoby CI trwale czerwone, co jest gorsze niż brak bramki (czerwone CI przestaje być
sygnałem). Wykluczenie pliku albo `continue-on-error` byłoby maskowaniem długu, czego
zabrania CLAUDE.md (Zero-Debt pkt 1). Zapadka robi trzecią rzecz: **uruchamia narzędzie
naprawdę** i pilnuje, żeby liczba błędów nie urosła ani o jeden. Każda karta, która
dołoży błąd typów, zapali się od razu — i to jest cała różnica wobec stanu sprzed.

ZAPADKA DZIAŁA W OBIE STRONY. Gdy błędów UBĘDZIE, guard też jest czerwony i żąda
obniżenia progu. Bez tego poprawa nie zostaje utrwalona i dług może wrócić po cichu.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"

#: Zmierzony stan długu typów w chwili założenia zapadki (V12K-240, 2026-07-27).
#: Ta liczba MA MALEĆ. Podniesienie jej wymaga uzasadnienia w commicie i wpisu w rejestrze
#: — inaczej zapadka przestaje być zapadką.
# K7-A (2026-07-29): naprawa 15 bledow u zrodla w dotknietych rendererach PDF
# (protection_report_pdf: typ colors list[str | None]; arc_flash_report: typowana
# lista energii) — prog obnizony 273->258, 67->65.
# K14 (2026-07-30): rozdzielenie rozplywu galeziowego od artefaktu biegu wymusilo
# JAWNE typy wejscia projekcji rozplywu (`_sc_rozplyw_galeziowy`, `_wpis_grafu`,
# `_odtworz_wklady_galeziowe`) — 4 bledy mniej u zrodla, prog obnizony 258->254.
# KD-12 (2026-08-01): zdjecie dlugu U ZRODLA w warstwach API / persystencji / analiz /
# katalogu / operacji domenowych — bez ani jednego wykluczenia, `# type: ignore` czy
# poszerzenia sygnatury do `Any`. Glowne kategorie:
#   * jawne typy zwracane i argumentow tam, gdzie ich brakowalo (endpointy eksportu,
#     `TypeDecorator` SQLAlchemy, wejscia solverow rozplywu w `canonical_analysis`);
#   * ROZDZIELENIE NAZW lokalnych, ktore w jednej funkcji oznaczaly dwie rozne rzeczy
#     (`z0_ohm`, `curve_type`/`params`/`result`, `tmp_path`, `setpoint`, `case_id`,
#     `materialization`, `feasible`) — kazda taka kolizja chowala przed analiza realna
#     roznice typow;
#   * ZWEZENIE przez wartosc zamiast przez posrednia flage/liste (`manual_equivalent`,
#     `missing`), jedno pobranie ze slownika zamiast dwoch wywolan `.get()`;
#   * naprawy KODU tam, gdzie deklaracja klamala: `UnitOfWork.__exit__` (`bool` ->
#     `Literal[False]`), `_build_readiness` (deklarowal `dict`, zwraca krotke),
#     `EligibilityService._compute_*` (`-> ...`), rejestr FixAction (typ tylko w
#     komentarzu), `braki_ogniw` w liscie materialowej (odczyt klucza z `None`);
#   * doinstalowane stuby `types-PyYAML` (naprawa u zrodla zamiast wyciszenia importu).
# 230 bledow mniej, prog obnizony 254->24, plikow 65->15.
BASELINE_ERRORS = 24
BASELINE_FILES = 15

WZORZEC_PODSUMOWANIA = re.compile(r"Found (\d+) errors? in (\d+) files?")
WZORZEC_SUKCESU = re.compile(r"Success: no issues found")


def uruchom_mypy() -> tuple[int, int, str]:
    """Uruchom mypy na `backend/src`; zwróć (liczba błędów, liczba plików, wyjście)."""
    wynik = subprocess.run(
        ["poetry", "run", "mypy", "src"],
        cwd=BACKEND,
        capture_output=True,
        text=True,
        check=False,
    )
    wyjscie = wynik.stdout + wynik.stderr

    if WZORZEC_SUKCESU.search(wyjscie):
        return 0, 0, wyjscie

    dopasowanie = WZORZEC_PODSUMOWANIA.search(wyjscie)
    if dopasowanie is None:
        # Brak podsumowania oznacza, że mypy w ogóle nie doszedł do analizy (np. błąd
        # konfiguracji). Cisza byłaby tu najgorsza: zapadka udawałaby, że pilnuje.
        raise SystemExit(
            "mypy_ratchet_guard: nie rozpoznano podsumowania mypy — narzędzie nie "
            f"wykonało analizy.\nWyjście:\n{wyjscie[-2000:]}"
        )
    return int(dopasowanie.group(1)), int(dopasowanie.group(2)), wyjscie


def main() -> int:
    bledy, pliki, wyjscie = uruchom_mypy()
    print(
        f"mypy_ratchet_guard: {bledy} bledow w {pliki} plikach "
        f"(prog: {BASELINE_ERRORS} w {BASELINE_FILES})"
    )

    if bledy > BASELINE_ERRORS:
        nowe = bledy - BASELINE_ERRORS
        print(
            f"\nFAILED: dlug typow UROSL o {nowe} "
            f"({BASELINE_ERRORS} -> {bledy}).\n"
            "Zapadka nie przepuszcza nowych bledow typow. Napraw je u zrodla — "
            "podniesienie progu wymaga uzasadnienia w commicie i wpisu w rejestrze.\n"
        )
        for linia in wyjscie.splitlines():
            if ": error:" in linia:
                print("  " + linia)
        return 1

    if bledy < BASELINE_ERRORS:
        print(
            f"\nFAILED: dlug typow ZMALAL ({BASELINE_ERRORS} -> {bledy}) — obniz "
            f"`BASELINE_ERRORS` do {bledy} i `BASELINE_FILES` do {pliki} w tym pliku.\n"
            "Zapadka dziala w obie strony: bez utrwalenia poprawy dlug wroci po cichu.\n"
        )
        return 1

    print("OK: dlug typow nie urosl.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
