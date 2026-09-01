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
# KARTA D / D6 (2026-08-01): kryterium dopuszczalnosci pozycji zaczepu przestalo byc
# zaszytym progiem i stalo sie danymi wyniku. Przy okazji znikla KOLIZJA NAZWY
# `feasible` w `power_flow_oltc_studies.optimize_tap_positions` (raz `bool` kandydata,
# raz lista kandydatow), ktora chowala przed analiza dwa realne bledy typow
# (assignment + arg-type). Pomiar wlasny: 24/15 -> 22/14.
# TOR U2 (2026-08-02, deklaracja pochodzenia katalogowego): brama przypisania
# katalogu zastapila DWA rownolegle bloki materializacji w `assign_catalog_to_element`
# jednym wywolaniem. Zniknela kolizja nazw `binding_payload`/`materialized_params`
# (te same nazwy lokalne w dwoch galeziach o roznych typach), ktora chowala przed
# analiza dwa realne bledy typow. Pomiar wlasny: 22/14 -> 20/14.
# POMIAR-ODG-TYPY (2026-08-07): karta POMIAR-ODG dolozyla w `station_templates/apply.py`
# trzeci przypadek wzorca `float(x)` na `Any | None` maskowanego przez `try/except
# TypeError` — zapadka zapalila sie w CI (20 -> 21). Naprawiona CALA KLASA w pliku
# (trzy wystapienia: szyna nN po napieciu, napiecie dolne transformatora z katalogu,
# moc przeksztaltnika z katalogu): zwezenie `None` PRZED `float`, zachowanie bez zmian
# (jawny `continue`/`return None` zamiast lapania TypeError). Pomiar wlasny: 21/14 -> 18/13.
# XLSX-IMPORT (2026-08-07): przepisany importer XLSX pozbyl sie dynamicznego atrybutu
# `node.source_impedance` z `# type: ignore[attr-defined]` (fizyka liczona w warstwie
# aplikacji i zapisywana poza kontraktem `Node`) — dlug zmalal razem z defektem.
# Pomiar wlasny: 18/13 -> 17/12.
# KARTA K-Q (2026-08-14, katalogi audytu 2 bez proweniencji): w `solver_input/
# audit2_solver_adjuster.py` ta sama zmienna dostawala raz `dict_items`, raz liste
# par — dwa niezgodne typy pod jedna nazwa, dwa realne bledy. Naprawa u zrodla
# (jedna lista par dla obu ksztaltow grafu) przy okazji przepisywania tego pliku.
# Pomiar wlasny: 15/10 -> 13/9.
# 2026-09-01 (przejecie po B-02, galaz LV-domain): pomiar na kompletnym venv daje
# 0 bledow w 0 plikach — guard sam zazadal utrwalenia (zapadka dwustronna).
# Zmierzone: `mypy src` = Success, 793 pliki, mypy 1.19.1.
BASELINE_ERRORS = 0
BASELINE_FILES = 0

WZORZEC_PODSUMOWANIA = re.compile(r"Found (\d+) errors? in (\d+) files?")
WZORZEC_SUKCESU = re.compile(r"Success: no issues found")
#: Podsumowanie PRAWDZIWEJ analizy niesie liczbę sprawdzonych plików źródłowych.
#: Podsumowanie przerwanego biegu niesie zamiast niej „errors prevented further
#: checking" — patrz `uruchom_mypy`.
WZORZEC_SPRAWDZONYCH = re.compile(r"\(checked (\d+) source files?\)")

#: Dolna granica wiarygodności pomiaru: `backend/src` to setki modułów, więc bieg
#: raportujący garstkę sprawdzonych plików NIE zmierzył długu (zły katalog, obcięta
#: konfiguracja). Wartość celowo luźna — chodzi o odróżnienie „zmierzono" od
#: „nie zmierzono", nie o pilnowanie liczby plików w repozytorium.
MIN_SPRAWDZONYCH_PLIKOW = 100


def uruchom_mypy() -> tuple[int, int, str]:
    """Uruchom mypy na `backend/src`; zwróć (liczba błędów, liczba plików, wyjście).

    ZAPADKA MUSI ODRÓŻNIĆ „zmierzono dług" od „nie udało się zmierzyć". Sam fakt,
    że w wyjściu jest wiersz `Found N errors in M files`, tego NIE gwarantuje:
    gdy mypy przerwie na błędzie konfiguracji (np. brak wtyczki `pydantic.mypy`
    w środowisku), drukuje `Found 1 error in 1 file (errors prevented further
    checking)` — czyli podsumowanie, którego zapadka nie odróżniała od realnego
    pomiaru i odczytywała jako SPEKTAKULARNY SPADEK długu (20 → 1). W trybie
    „dług zmalał" guard tylko prosi o obniżenie progu, więc zepsute środowisko
    kończyło się propozycją TRWAŁEGO rozbrojenia zapadki. Dlatego pomiar jest
    uznawany wyłącznie wtedy, gdy mypy zameldował, ile plików źródłowych naprawdę
    sprawdził — i gdy ta liczba jest wiarygodna.
    """
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

    sprawdzone = WZORZEC_SPRAWDZONYCH.search(wyjscie)
    if sprawdzone is None:
        raise SystemExit(
            "mypy_ratchet_guard: mypy PRZERWAL analize (podsumowanie bez liczby "
            "sprawdzonych plikow zrodlowych) — pomiar dlugu nie powstal.\n"
            "Najczestsza przyczyna: srodowisko bez zaleznosci projektu "
            "(`cd backend && poetry install --with dev`).\n"
            f"Wyjscie:\n{wyjscie[-2000:]}"
        )
    if int(sprawdzone.group(1)) < MIN_SPRAWDZONYCH_PLIKOW:
        raise SystemExit(
            f"mypy_ratchet_guard: mypy sprawdzil tylko {sprawdzone.group(1)} plikow "
            f"zrodlowych (oczekiwano co najmniej {MIN_SPRAWDZONYCH_PLIKOW}) — "
            "pomiar dlugu jest niewiarygodny.\n"
            f"Wyjscie:\n{wyjscie[-2000:]}"
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
