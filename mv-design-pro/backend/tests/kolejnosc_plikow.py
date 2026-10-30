"""KOLEJNOŚĆ PLIKÓW TESTÓW wg ZMIERZONYCH czasów — najdłuższy plik najpierw (LPT).

PO CO (karta SZYBKIE-TESTY-2, dyrektywa właściciela 2026-10-28). Pełna regresja biegnie
pod pytest-xdist `--dist loadfile`: plik testów w całości na jednym procesie (izolacja
magazynów i fikstur modułowych — `tests/conftest.py`). xdist kolejkuje pliki domyślnie wg
LICZBY testów (`--loadscope-reorder`), a czasy plików różnią się o cztery rzędy wielkości:
plik 26 bramek fizycznych trwa 667 s, plik 346 przypadków fikstur 145 s. Najcięższe pliki
o niewielu testach trafiały więc na KONIEC kolejki i wydłużały ogon biegu, gdy pozostałe
procesy już stały. Algorytm LPT (najdłuższe zadanie do pierwszego wolnego procesu) daje
rozkład bliski optymalnemu, jeśli kolejność wejściowa jest malejąca po czasie — tę
kolejność ustawia `tests/conftest.py::pytest_collection_modifyitems` z czasów zmierzonych
w `tests/czasy_plikow.json`, a xdist ją zachowuje (`--no-loadscope-reorder` w `addopts`).

KONTRAKT (przypięty w `tests/ci/test_kolejnosc_plikow.py`):
* kolejność dotyczy wyłącznie PLIKÓW — testy jednego pliku zostają w kolejności kolekcji
  i obok siebie (wynik biegu nie zależy od kolejności, zmienia się tylko jej czas);
* kolejność jest deterministyczna (remis czasów rozstrzyga ścieżka pliku);
* plik bez pomiaru (nowy) dostaje czas równy MEDIANIE zmierzonych — nie znika z biegu
  i nie wymaga pomiaru, zanim wejdzie do repozytorium;
* wpis pomiaru bez pliku testów (plik usunięty albo przemianowany) jest błędem testu
  kontraktu — plik czasów nie może kłamać o suicie.

Aktualizacja czasów po pełnym biegu z raportem JUnit (`--junitxml=raport.xml`), z katalogu
`backend/`:

    python -m tests.kolejnosc_plikow --aktualizuj raport.xml --zrodlo "<opis pomiaru>"

Usunięcie pliku testów między pełnymi biegami (wpis pomiaru bez pliku) — bez nowego pomiaru,
pozostałe czasy bez zmian, opis źródła dostaje adnotację, które wpisy zdjęto:

    python -m tests.kolejnosc_plikow --usun-osierocone --powod "<dlaczego plik zniknął>"
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from collections.abc import Iterable
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
PLIK_CZASOW = Path(__file__).resolve().with_name("czasy_plikow.json")


def wczytaj_czasy(plik: Path = PLIK_CZASOW) -> dict[str, float]:
    """Czasy plików testów (ścieżka względem `backend/`, separator `/`) w sekundach."""
    dane = json.loads(plik.read_text(encoding="utf-8"))
    return {sciezka: float(czas) for sciezka, czas in dane["czasy_s"].items()}


def wagi(pliki: Iterable[str], czasy: dict[str, float]) -> dict[str, float]:
    """Waga każdego pliku: zmierzony czas albo mediana zmierzonych (plik bez pomiaru)."""
    mediana = statistics.median(czasy.values()) if czasy else 1.0
    return {plik: czasy.get(plik, mediana) for plik in pliki}


def kolejnosc(pliki: Iterable[str], czasy: dict[str, float]) -> list[str]:
    """Pliki malejąco po wadze; remis rozstrzyga ścieżka (deterministycznie)."""
    waga = wagi(sorted(set(pliki)), czasy)
    return sorted(waga, key=lambda plik: (-waga[plik], plik))


def czasy_z_junit(raport: Path) -> dict[str, float]:
    """Suma czasów przypadków (przygotowanie + wywołanie + sprzątanie) na plik testów.

    `classname` raportu JUnit pytest to ścieżka modułu z kropkami i ewentualną klasą
    (`tests.api.test_x.TestY`); plik to najdłuższy przedrostek, który istnieje na dysku.
    """
    sumy: dict[str, float] = defaultdict(float)
    for przypadek in ET.parse(raport).iter("testcase"):
        czesci = (przypadek.get("classname") or "").split(".")
        for koniec in range(len(czesci), 0, -1):
            kandydat = "/".join(czesci[:koniec]) + ".py"
            if (BACKEND / kandydat).is_file():
                sumy[kandydat] += float(przypadek.get("time") or 0.0)
                break
        else:
            raise SystemExit(f"BLAD: przypadek spoza plików backendu: {przypadek.get('classname')}")
    return dict(sumy)


def zapisz_czasy(zrodlo: str, czasy: dict[str, float], plik: Path = PLIK_CZASOW) -> None:
    plik.write_text(
        json.dumps(
            {"zrodlo": zrodlo, "czasy_s": {k: round(v, 1) for k, v in sorted(czasy.items())}},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def usun_osierocone(powod: str, plik: Path = PLIK_CZASOW) -> list[str]:
    """Zdejmuje wpisy czasów bez pliku testów (plik usunięty albo przemianowany) — bez nowego
    pomiaru: pozostałe czasy bez zmian, opis źródła z adnotacją zdjętych wpisów i powodu."""
    dane = json.loads(plik.read_text(encoding="utf-8"))
    czasy = {sciezka: float(czas) for sciezka, czas in dane["czasy_s"].items()}
    osierocone = sorted(s for s in czasy if not (BACKEND / s).is_file())
    if osierocone:
        zrodlo = f"{dane['zrodlo']}; zdjęto wpisy bez pliku ({', '.join(osierocone)}): {powod}"
        zapisz_czasy(zrodlo, {s: c for s, c in czasy.items() if s not in osierocone}, plik)
    return osierocone


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    tryb = parser.add_mutually_exclusive_group(required=True)
    tryb.add_argument("--aktualizuj", type=Path, help="raport JUnit pełnego biegu")
    tryb.add_argument(
        "--usun-osierocone", action="store_true", help="zdejmij wpisy czasów bez pliku testów"
    )
    parser.add_argument("--zrodlo", help="opis pomiaru: drzewo, maszyna, obciążenie")
    parser.add_argument("--powod", help="dlaczego plik testów zniknął (z --usun-osierocone)")
    args = parser.parse_args(argv)
    if args.usun_osierocone:
        if not args.powod:
            parser.error("--usun-osierocone wymaga --powod")
        zdjete = usun_osierocone(args.powod)
        print(f"Zdjęto {len(zdjete)} wpisów bez pliku: {zdjete} → {PLIK_CZASOW}")
        return 0
    if not args.zrodlo:
        parser.error("--aktualizuj wymaga --zrodlo")
    czasy = czasy_z_junit(args.aktualizuj)
    zapisz_czasy(args.zrodlo, czasy)
    print(f"Zapisano {len(czasy)} plików, razem {sum(czasy.values()):.0f} s → {PLIK_CZASOW}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
