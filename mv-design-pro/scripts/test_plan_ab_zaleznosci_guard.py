"""Samotest strażnika zależności planu A/B (`plan_ab_zaleznosci_guard.py`, plan §13, O-35).

Karta AB-1a Pakiet E1, pkt B.3: pozytywny na bieżącym planie; negatywny na kopii planu z dawną
sekwencją (`… → AB-3b → AB-4 → AB-H1 → AB-5 → AB-5b → AB-H2 → …` przy zależności AB-4 ← AB-H2)
→ czerwony z cyklem; negatywny na przyroście bez miejsca; parser tabeli §11 z wierszem
`AB-4b / AB-6 | AB-H1: …`.

POKRYCIE — ILOCZYN CECH: {token w sekwencji · grupa `X.n` · identyfikator zewnętrzny} ×
{zależność wprost · przez konsumenta wiersza `AB-Hn:` · pominięta „miejsce w sekwencji"} ×
{porządek zgodny · odwrócony · cykl w samym grafie}; parser: {`A / B` · `(+ C)` · nawias
opisowy · `\\|` w komórce · zależności z nawiasami i przecinkami}.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

import plan_ab_zaleznosci_guard as guard  # noqa: E402

#: Dawny porządek z przeglądu adwersarzowego (#5): AB-4 przed AB-H1 i AB-H2.
DAWNA_SEKWENCJA = (
    "AB-1a → AB-H0 → AB-1b.1 → AB-1b.2 → AB-1b.3 → AB-1d_min → AB-1c → AB-1d → AB-2 → AB-3 → "
    "AB-3b → AB-4 → AB-H1 → AB-5 → AB-5b → AB-H2 → W6-K → AB-3c → AB-H3 → AB-6 → AB-H4 → AB-7"
)

#: Przyrosty dopisane do planu PO stanie historycznym, który odtwarza `_plan_sprzed_podzialu_bess`
#: (korekta O-20) — ich wierszy §11 w tamtym planie nie było, więc kopia historyczna ich nie niesie.
#: Nowy przyrost w planie bez wpisu tutaj zatrzyma test komunikatem „przyrost bez miejsca”.
NOWSZE_OD_STANU_HISTORYCZNEGO = frozenset({"AB-P1"})  # O-54 (2026-09-24)


def _zamien_sekwencje(tekst: str, nowa: str) -> str:
    """Podmiana wiersza sekwencji W OBRĘBIE §5 (jak czyta go strażnik — parowanie `**` liczone
    od początku sekcji, nie całego dokumentu)."""
    naglowek = re.search(r"^## 5\..*$", tekst, re.MULTILINE)
    assert naglowek is not None
    for dopasowanie in guard._POGRUBIENIE.finditer(tekst, naglowek.end()):
        if "AB-1a →" in dopasowanie.group(1):
            return tekst[: dopasowanie.start(1)] + nowa + tekst[dopasowanie.end(1) :]
    raise AssertionError("brak wiersza sekwencji w §5 planu")


def _plan_sprzed_podzialu_bess(tekst: str) -> str:
    """Kopia planu w stanie sprzed korekty O-20: jeden przyrost AB-4 (BESS) zamiast AB-4a/AB-4b,
    zależny od AB-H2, i dawna sekwencja. Wiersze §11 są przekształcane na KOMÓRKACH (parser
    strażnika), więc treść pozostałych kolumn bieżącego planu nie ma znaczenia."""
    tekst = _zamien_sekwencje(tekst, DAWNA_SEKWENCJA)
    wynik: list[str] = []
    for linia in tekst.splitlines():
        if not linia.lstrip().startswith("|"):
            wynik.append(linia)
            continue
        kom = guard.komorki(linia)
        if kom and kom[0] in NOWSZE_OD_STANU_HISTORYCZNEGO:
            continue
        if kom and kom[0] == "AB-4a":
            kom[0] = "AB-4"
            kom[3] = "AB-1b.1, AB-1b.2, AB-1a (warstwa magazynów), AB-H2, AB-3 (migawki)"
        elif kom and kom[0] == "AB-4b":
            continue
        elif kom and kom[0].startswith("AB-4b /"):
            kom[0] = kom[0].replace("AB-4b", "AB-4")
        else:
            wynik.append(linia)
            continue
        wynik.append("| " + " | ".join(kom) + " |")
    return "\n".join(wynik) + "\n"


def _uruchom(tmp_path: Path, tekst: str, capsys: pytest.CaptureFixture[str]) -> tuple[int, str]:
    sciezka = tmp_path / "plan.md"
    sciezka.write_text(tekst, encoding="utf-8")
    kod = guard.main(["--plan", str(sciezka)])
    przechwycone = capsys.readouterr()
    return kod, przechwycone.out + przechwycone.err


def test_biezacy_plan_jest_zielony_i_wypisuje_porzadek_oraz_graf(
    capsys: pytest.CaptureFixture[str],
) -> None:
    """PIN pozytywny na BIEŻĄCYM planie (plan jest dokumentem żywym — zmiana sekwencji §5
    albo kolumny „Zależność" §11 łamiąca porządek zapala ten test razem z guardem)."""
    assert guard.main([]) == 0
    wyjscie = capsys.readouterr().out
    assert "Sekwencja §5" in wyjscie and "Graf zależności §11" in wyjscie
    assert "AB-H1 [#" in wyjscie and "AB-H0" in wyjscie.split("AB-H1 [#", 1)[1].splitlines()[0]


def test_dawna_sekwencja_daje_cykl_ab4_ab_h2(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    tekst = _plan_sprzed_podzialu_bess(guard.PLAN.read_text(encoding="utf-8"))
    kod, wyjscie = _uruchom(tmp_path, tekst, capsys)
    assert kod == 1
    assert "cykl sekwencja ↔ zależność: AB-4 ↔ AB-H2" in wyjscie
    # „Stawiała AB-4 przed OBIEMA jego zależnościami" (O-20): także AB-H1 przez wiersz `AB-H1:`.
    assert "cykl sekwencja ↔ zależność: AB-4 ↔ AB-H1" in wyjscie
    assert "przyrost bez miejsca" not in wyjscie


def test_przyrost_bez_miejsca(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    tekst = guard.PLAN.read_text(encoding="utf-8")
    plan = guard.parsuj_plan(tekst)
    bez_3c = " → ".join(t for t in plan.sekwencja if t != "AB-3c")
    kod, wyjscie = _uruchom(tmp_path, _zamien_sekwencje(tekst, bez_3c), capsys)
    assert kod == 1
    assert "przyrost bez miejsca: AB-3c" in wyjscie


MINIMALNY = """# Plan

## 5. Przyrosty

Sekwencja: **{sekwencja}** (opis).

## 11. Delta

| Istniejący workstream | Nowa zdolność | Dlaczego potrzebna | Zależność | Stan bieżący | Cel | Dowód |
|---|---|---|---|---|---|---|
{wiersze}

## 12. Dalej
"""


def _minimalny(sekwencja: str, *wiersze: tuple[str, str, str]) -> str:
    return MINIMALNY.format(
        sekwencja=sekwencja,
        wiersze="\n".join(
            f"| {w} | {z} | powód | {d} | stan | cel | dowód |" for w, z, d in wiersze
        ),
    )


def test_cykl_w_samym_grafie_zaleznosci(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    tekst = _minimalny("AB-1a → AB-X → AB-Y", ("AB-X", "x", "AB-Y"), ("AB-Y", "y", "AB-X"))
    kod, wyjscie = _uruchom(tmp_path, tekst, capsys)
    assert kod == 1
    assert "cykl zależności §11: AB-X ↔ AB-Y" in wyjscie


def test_grupa_i_identyfikatory_zewnetrzne(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    zielony = _minimalny(
        "AB-1a → AB-1b.1 → AB-1b.2 → AB-2",
        ("AB-1b", "podział 1b.1/1b.2", "R10 (rdzeń L5)"),
        ("AB-2", "LFSM", "AB-1b.1 (emulator), AB-1b.2, W5 (zadanie #23)"),
    )
    kod, wyjscie = _uruchom(tmp_path, zielony, capsys)
    assert kod == 0
    assert "AB-1b = AB-1b.1/AB-1b.2" in wyjscie and "R10, W5" in wyjscie
    # Zależność od GRUPY wymaga wszystkich członków przed przyrostem zależnym.
    czerwony = _minimalny(
        "AB-1a → AB-1b.1 → AB-2 → AB-1b.2",
        ("AB-1b", "podział", "R10"),
        ("AB-2", "LFSM", "AB-1b"),
    )
    kod, wyjscie = _uruchom(tmp_path, czerwony, capsys)
    assert kod == 1 and "cykl sekwencja ↔ zależność: AB-2 ↔ AB-1b" in wyjscie


def test_parser_tabeli_wiersz_konsumenta_i_pominiecie() -> None:
    naglowek = (
        "| Istniejący workstream | Nowa zdolność | Dlaczego potrzebna | Zależność | Stan bieżący "
        "| Cel | Dowód |\n|---|---|---|---|---|---|---|\n"
    )
    tabela = naglowek + "\n".join(
        [
            "| AB-4b / AB-6 | AB-H1: solver Y(f), \\|Z\\| w funkcji f | powód | AB-H0, AB-1a "
            "(uczciwość), AB-1d (miejsce w sekwencji, nie zależność techniczna) | s | c | d |",
            "| AB-3 (+ AB-3b) | biblioteka | powód | AB-1b.3 | s | c | d |",
            "| AB-1d_min (przed AB-1c) | wyrocznia | powód | AB-1b.2 | s | c | d |",
            "| AB-1a | kontrakt | powód | — | s | c | d |",
        ]
    )
    wiersze, bledy = guard.parsuj_tabele(tabela)
    assert bledy == []
    konsument, dopisany, opisowy, bez_zaleznosci = wiersze
    assert konsument.przyrosty == ("AB-H1",) and konsument.konsumenci == ("AB-4b", "AB-6")
    assert konsument.zaleznosci == ("AB-H0", "AB-1a") and konsument.pominiete == ("AB-1d",)
    assert dopisany.przyrosty == ("AB-3", "AB-3b") and dopisany.konsumenci == ()
    assert opisowy.przyrosty == ("AB-1d_min",)
    assert bez_zaleznosci.zaleznosci == ()


def test_parser_zglasza_nierozpoznana_zaleznosc_i_zla_liczbe_kolumn() -> None:
    naglowek = "| Istniejący workstream | Nowa zdolność | Zależność |\n|---|---|---|\n"
    wiersze, bledy = guard.parsuj_tabele(naglowek + "| AB-2 | x | po odbiorze |\n| AB-3 | x |\n")
    assert wiersze[0].zaleznosci == ()
    assert any("nierozpoznana zależność 'po odbiorze'" in b for b in bledy)
    assert any("kolumn zamiast 3" in b for b in bledy)


def test_brak_sekcji_i_brak_pliku(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    kod, wyjscie = _uruchom(tmp_path, "# Plan bez sekcji\n", capsys)
    assert kod == 1 and "brak sekcji `## 5.`" in wyjscie and "brak sekcji `## 11.`" in wyjscie
    assert guard.main(["--plan", str(tmp_path / "brak.md")]) == 2
