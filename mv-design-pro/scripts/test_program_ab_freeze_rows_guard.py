#!/usr/bin/env python3
"""Testy guardu `program_ab_freeze_rows_guard.py` (karta AB-1d_min).

Mutacje dokumentu syntetycznego: wiersz otwarty bez kamienia, w dwoch kamieniach,
zakres `I1–I4`, kreska w kodzie w komorce, identyfikator nieznany zamrozeniu, wiersz
zamkniety bez kamienia (dozwolony) — oraz zapadka na realnym repo w obie strony.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import program_ab_freeze_rows_guard as guard  # noqa: E402

ZAMROZENIE = """# Z

## 2. MACIERZ — tablica A

| ZDOLNOŚĆ | WARTOŚĆ | CURRENT | TARGET | X |
|---|---|---|---|---|
| **A1** Zamknieta | w | CURRENT | CURRENT | — |
| **A2** Otwarta | w | PARTIAL | CURRENT | — |
| **B1** Otwarta | w | GAP (odmowa jawna) | CURRENT | — |
| **I1** Otwarta | w | GAP | CURRENT | — |
| **I2** Otwarta | w | GAP | CURRENT | — |
| **I3** Otwarta | w | GAP | CURRENT | — |

---

## 3. Inna
"""


def _program(domyka_k1: str, domyka_k2: str) -> str:
    return f"""# P

## 7. KAMIENIE

| Kamień | Zakres | Domyka (zamrożenie / rejestr) | Zależy od |
|---|---|---|---|
| **K1** Pierwszy | bramka `|I| ≤ I_max` z mutacją | {domyka_k1} | — |
| **K2** Drugi | zakres | {domyka_k2} | K1 |

## 8. Dalej
"""


def test_stan_zgodny_bez_naruszen() -> None:
    assert guard.naruszenia(ZAMROZENIE, _program("A2, B1 (część)", "I1–I3")) == {}


def test_otwarty_wiersz_bez_kamienia() -> None:
    wynik = guard.naruszenia(ZAMROZENIE, _program("A2", "I1–I3"))
    assert set(wynik) == {"B1"}
    assert "brak kamienia" in wynik["B1"]


def test_otwarty_wiersz_w_dwoch_kamieniach() -> None:
    wynik = guard.naruszenia(ZAMROZENIE, _program("A2, B1, I2", "I1–I3"))
    assert set(wynik) == {"I2"}
    assert "2 kamienie" in wynik["I2"]


def test_zamkniety_wiersz_nie_wymaga_kamienia_ani_nie_jest_bledem_w_kamieniu() -> None:
    assert guard.naruszenia(ZAMROZENIE, _program("A1, A2, B1", "I1–I3")) == {}


def test_identyfikator_nieznany_zamrozeniu() -> None:
    wynik = guard.naruszenia(ZAMROZENIE, _program("A2, B1, C9", "I1–I3"))
    assert set(wynik) == {"C9"}


def test_kreska_w_kodzie_nie_przesuwa_kolumny() -> None:
    """Mutacja parsera: podzial po kazdej kresce przesunalby Domyka w wierszu K1."""
    kamienie = guard.kamienie_domykajace(_program("A2, B1", "I1–I3"))
    assert kamienie["K1 Pierwszy"] == {"A2", "B1"}
    assert kamienie["K2 Drugi"] == {"I1", "I2", "I3"}


@pytest.mark.parametrize("tekst", ["E2E-R1", "OD-33", "W6-7", "S-54", "D-33"])
def test_tokeny_podobne_nie_sa_identyfikatorami(tekst: str) -> None:
    assert guard.identyfikatory_komorki(tekst) == set()


def test_pusty_parser_to_blad_nie_zielen() -> None:
    with pytest.raises(SystemExit):
        guard.wiersze_zamrozenia("## 2. MACIERZ\n\nbrak tabeli\n")


def test_zapadka_na_repo_rowna_zmierzonemu_stanowi() -> None:
    """Realny plan: stan = `ZNANE_NARUSZENIA` (nowe i zdjete naruszenia czerwienia)."""
    stan = guard.naruszenia(
        guard.ZAMROZENIE.read_text(encoding="utf-8"),
        guard.PROGRAM.read_text(encoding="utf-8"),
    )
    assert stan == guard.ZNANE_NARUSZENIA
    assert guard.main() == 0
