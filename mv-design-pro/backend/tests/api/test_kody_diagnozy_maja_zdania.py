"""Dwustronna kompletność mapowania kod → zdanie inżynierskie (D7).

KLASA, NIE INSTANCJA. Ekran „Diagnoza przebiegu" ma zakaz pokazywania surowych
kodów produkcyjnych. Zamiast wierzyć deklaracji w komentarzu, ten test WIĄŻE
dwa stosy: wylicza kody FAKTYCZNIE emitowane przez backend i porównuje je ze
słownikami w jedynym module tłumaczącym po stronie UI
(`ui2/spaces/obliczenia/diagnoza/kodyDiagnozy.ts`).

Trzy rodziny kodów, trzy niezależne porównania równościowe:
  1. reguły diagnostyczne modelu — `diagnostics/rules.py` (`code="..."`),
  2. kody diagnozy przebiegu — `KODY_DIAGNOZY_PRZEBIEGU`,
  3. przyczyny przerwania iteracji — solwery rozpływu (`cause_if_failed_optional`).

Równość, nie zawieranie: nowa reguła bez zdania zapali test TAK SAMO jak zdanie
bez reguły (martwy wpis słownika). Bez tego pinu obietnica „każdy kod ma
zdanie" byłaby deklaracją bez pokrycia — a deklaracja bez testu wyłącza
czujność skuteczniej, niż sam brak.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from application.analyses.diagnoza_przebiegu import KODY_DIAGNOZY_PRZEBIEGU

BACKEND_SRC = Path(__file__).resolve().parents[2] / "src"
FRONTEND_SRC = Path(__file__).resolve().parents[3] / "frontend" / "src"
MODUL_ZDAN = FRONTEND_SRC / "ui2" / "spaces" / "obliczenia" / "diagnoza" / "kodyDiagnozy.ts"
KATALOG_SOLWEROW = BACKEND_SRC / "network_model" / "solvers"

#: Klucz słownika w module UI: `'E-D01': '…'` albo `max_iter: '…'`.
_KLUCZ_SLOWNIKA = re.compile(r"^\s*'?([A-Za-z][A-Za-z0-9_-]*)'?\s*:\s*'", re.MULTILINE)


def _slownik_z_modulu_ui(nazwa: str) -> set[str]:
    """Wydobądź klucze jednego eksportowanego słownika z modułu TypeScript.

    Parsowanie tekstem jest tu ŚWIADOME: test ma pilnować pliku, który żyje w
    drugim stosie, bez uruchamiania Node'a w zestawie testów backendu.
    """
    if not MODUL_ZDAN.exists():  # pragma: no cover - pilnuje istnienia pliku
        pytest.fail(f"Brak modułu tłumaczącego UI: {MODUL_ZDAN}")
    tresc = MODUL_ZDAN.read_text(encoding="utf-8")
    poczatek = tresc.find(f"export const {nazwa}")
    assert poczatek >= 0, f"Moduł UI nie eksportuje słownika {nazwa}"
    koniec = tresc.find("};", poczatek)
    assert koniec > poczatek, f"Nie udało się domknąć słownika {nazwa}"
    return set(_KLUCZ_SLOWNIKA.findall(tresc[poczatek:koniec]))


def _kody_regul_z_backendu() -> set[str]:
    """Kody emitowane przez reguły diagnostyczne — skan źródła, nie pamięć."""
    tresc = (BACKEND_SRC / "diagnostics" / "rules.py").read_text(encoding="utf-8")
    kody = set(re.findall(r'code="([A-Z]-D\d{2})"', tresc))
    assert kody, "Skan reguł nie znalazł ani jednego kodu — regex się rozjechał"
    return kody


def _przyczyny_przerwania_z_solwerow() -> set[str]:
    """Wartości `cause_if_failed_optional` we WSZYSTKICH solwerach rozpływu."""
    przyczyny: set[str] = set()
    for plik in sorted(KATALOG_SOLWEROW.glob("power_flow*.py")):
        tresc = plik.read_text(encoding="utf-8")
        przyczyny.update(re.findall(r'cause_if_failed_optional"\]?\s*[:=]\s*"([a-z_]+)"', tresc))
    assert przyczyny, "Skan solwerów nie znalazł przyczyn przerwania — regex się rozjechał"
    return przyczyny


def test_kazda_regula_diagnostyczna_ma_zdanie_inzynierskie() -> None:
    kody_backendu = _kody_regul_z_backendu()
    zdania_ui = _slownik_z_modulu_ui("ZDANIA_REGUL")

    assert zdania_ui == kody_backendu, (
        "Rozjazd słownika reguł: bez zdania w UI "
        f"{sorted(kody_backendu - zdania_ui)}; martwe wpisy w UI "
        f"{sorted(zdania_ui - kody_backendu)}."
    )


def test_kazdy_kod_diagnozy_przebiegu_ma_zdanie_inzynierskie() -> None:
    zdania_ui = _slownik_z_modulu_ui("ZDANIA_DIAGNOZY_PRZEBIEGU")

    assert zdania_ui == set(KODY_DIAGNOZY_PRZEBIEGU), (
        "Rozjazd słownika diagnozy przebiegu: bez zdania w UI "
        f"{sorted(set(KODY_DIAGNOZY_PRZEBIEGU) - zdania_ui)}; martwe wpisy w UI "
        f"{sorted(zdania_ui - set(KODY_DIAGNOZY_PRZEBIEGU))}."
    )


def test_kazda_przyczyna_przerwania_iteracji_ma_zdanie_inzynierskie() -> None:
    przyczyny_backendu = _przyczyny_przerwania_z_solwerow()
    zdania_ui = _slownik_z_modulu_ui("ZDANIA_PRZYCZYN_PRZERWANIA")

    assert zdania_ui == przyczyny_backendu, (
        "Rozjazd słownika przyczyn przerwania: bez zdania w UI "
        f"{sorted(przyczyny_backendu - zdania_ui)}; martwe wpisy w UI "
        f"{sorted(zdania_ui - przyczyny_backendu)}."
    )


def test_zdania_nie_wklejaja_surowych_kodow_produkcyjnych() -> None:
    """Zdanie ma tłumaczyć kod, a nie go powtarzać (zakaz kodów na ekranie)."""
    for nazwa in ("ZDANIA_REGUL", "ZDANIA_DIAGNOZY_PRZEBIEGU", "ZDANIA_PRZYCZYN_PRZERWANIA"):
        poczatek_tresci = MODUL_ZDAN.read_text(encoding="utf-8")
        poczatek = poczatek_tresci.find(f"export const {nazwa}")
        koniec = poczatek_tresci.find("};", poczatek)
        blok = poczatek_tresci[poczatek:koniec]
        for wiersz in blok.splitlines():
            zdanie = wiersz.split(":", 1)[1] if ":" in wiersz else ""
            assert not re.search(
                r"[EWI]-D\d{2}", zdanie
            ), f"Zdanie w {nazwa} wkleja surowy kod reguły: {wiersz.strip()}"
            assert (
                "PRZ-" not in zdanie
            ), f"Zdanie w {nazwa} wkleja surowy kod diagnozy: {wiersz.strip()}"
