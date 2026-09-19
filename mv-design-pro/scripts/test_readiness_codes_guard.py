#!/usr/bin/env python3
"""Testy straznika rejestru kodow gotowosci (karta X4, dlug z V12K-318 poz. 7).

Do karty X4 naglowek straznika obiecywal kontrole (priorytet, poziom, akcja
naprawcza BLOCKERA, nawigacja, duplikaty, deterministyczny porzadek), ktorych
kod NIE wykonywal — sprawdzal regexem obecnosc kluczy i dlugosc message_pl.
Straznik z opisem szerszym niz kod jest gorszy od braku straznika: czytajacy
zaklada pokrycie, ktorego nie ma.

ILOCZYN CECH (bramka (c) karty): kazda obiecana kontrola osobno zapala
straznika na syntetycznym wpisie psujacym DOKLADNIE jedna ceche; wpis wzorcowy
przechodzi czysto. Walidacja idzie po zywych obiektach (`waliduj_rejestr`)
oraz po zrodle (`duplikaty_kluczy_zrodla` — duplikat klucza literalu slownika
Python nadpisuje CICHO, wiec po imporcie jest niewykrywalny).
"""

from __future__ import annotations

import subprocess
import sys
from dataclasses import replace
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend" / "src"))

from domain.canonical_operations import (  # noqa: E402
    READINESS_CODES,
    ReadinessArea,
    ReadinessCodeSpec,
    ReadinessLevel,
)
from readiness_codes_guard import (  # noqa: E402
    REGISTRY_FILE,
    duplikaty_kluczy_zrodla,
    waliduj_rejestr,
)

WZORZEC = ReadinessCodeSpec(
    code="test.wzorzec",
    area=ReadinessArea.TOPOLOGY,
    priority=2,
    level=ReadinessLevel.BLOCKER,
    message_pl="Wzorcowy komunikat kontrolny",
    fix_navigation={"panel": "inspector", "tab": "parametry"},
)


def test_wpis_wzorcowy_przechodzi_czysto() -> None:
    assert waliduj_rejestr({"test.wzorzec": WZORZEC}) == []


def test_iloczyn_cech_kazda_kontrola_osobno_zapala() -> None:
    """Jeden zepsuty atrybut -> co najmniej jedno naruszenie nazywajace wpis."""
    przypadki: dict[str, dict[str, ReadinessCodeSpec]] = {
        "klucz rozny od spec.code": {"inny.klucz": WZORZEC},
        "message_pl pusty": {"test.wzorzec": replace(WZORZEC, message_pl="")},
        "message_pl za krotki": {"test.wzorzec": replace(WZORZEC, message_pl="abc")},
        "priorytet 0": {"test.wzorzec": replace(WZORZEC, priority=0)},
        "priorytet 6": {"test.wzorzec": replace(WZORZEC, priority=6)},
        "priorytet nie-int": {"test.wzorzec": replace(WZORZEC, priority="1")},  # type: ignore[arg-type]
        # dataclass NIE waliduje pol — literal tekstowy zamiast enuma przejdzie
        # przez import bez bledu i dopiero ta kontrola go widzi:
        "poziom literalem tekstowym": {"test.wzorzec": replace(WZORZEC, level="BLOCKER")},  # type: ignore[arg-type]
        "nawigacja pustym slownikiem": {"test.wzorzec": replace(WZORZEC, fix_navigation={})},
        "nawigacja bez panelu": {"test.wzorzec": replace(WZORZEC, fix_navigation={"tab": "x"})},
        "nawigacja z pusta wartoscia": {
            "test.wzorzec": replace(WZORZEC, fix_navigation={"panel": "  "})
        },
        # Fantomowy identyfikator akcji naprawczej skasowany z `ReadinessCodeSpec`
        # (karta FIX-ACTION-KASACJA, REJESTR_KONFLIKTOW.md V12K-338) — `fix_navigation`
        # jest jedyna sciezka naprawcza i jest OBOWIAZKOWA dla KAZDEGO kodu, nie tylko
        # BLOCKER.
        "kod bez fix_navigation": {"test.wzorzec": replace(WZORZEC, fix_navigation=None)},
        "nieznany panel": {
            "test.wzorzec": replace(WZORZEC, fix_navigation={"panel": "panel-spoza-zbioru"})
        },
    }
    for nazwa, rejestr in przypadki.items():
        naruszenia = waliduj_rejestr(rejestr)
        assert naruszenia, f"kontrola nie zapalila sie: {nazwa}"
        assert any(
            "test.wzorzec" in n or "inny.klucz" in n for n in naruszenia
        ), f"{nazwa}: naruszenie nie nazywa wpisu: {naruszenia}"


def test_poziom_niebedacy_blockerem_wymaga_nawigacji_tak_samo() -> None:
    """Nawigacja jest obowiazkowa dla KAZDEGO poziomu, nie tylko dla BLOCKER.

    Przed karta FIX-ACTION-KASACJA (REJESTR_KONFLIKTOW.md V12K-338) obecnosc sciezki
    naprawczej byla wymuszana WYLACZNIE dla BLOCKER — kod WARNING/INFO bez zadnej
    sciezki przechodzil bez ostrzezenia. To byla furtka tej samej klasy defektu, ktora
    kasacja zamyka: `fix_navigation` jest teraz jedynym polem sciezki naprawczej i
    guard wymaga go od kazdego poziomu, nie tylko od BLOCKER.
    """
    ostrzezenie_bez_nawigacji = replace(WZORZEC, level=ReadinessLevel.WARNING, fix_navigation=None)
    naruszenia = waliduj_rejestr({"test.wzorzec": ostrzezenie_bez_nawigacji})
    assert naruszenia, "WARNING bez fix_navigation powinien byc czerwony (nie tylko BLOCKER)"

    ostrzezenie_z_nawigacja = replace(WZORZEC, level=ReadinessLevel.WARNING)
    assert waliduj_rejestr({"test.wzorzec": ostrzezenie_z_nawigacja}) == []


def test_duplikat_klucza_w_zrodle_jest_wykrywany() -> None:
    """Duplikat literalu slownika Python nadpisuje cicho — AST go widzi."""
    zrodlo = (
        "READINESS_CODES: dict[str, ReadinessCodeSpec] = {\n"
        '    "a.b": ReadinessCodeSpec(),\n'
        '    "c.d": ReadinessCodeSpec(),\n'
        '    "a.b": ReadinessCodeSpec(),\n'
        "}\n"
    )
    naruszenia = duplikaty_kluczy_zrodla(zrodlo)
    assert naruszenia == ["Duplicate key in READINESS_CODES literal: 'a.b'"]


def test_zrodlo_bez_duplikatow_przechodzi() -> None:
    assert duplikaty_kluczy_zrodla(REGISTRY_FILE.read_text(encoding="utf-8")) == []


def test_realny_rejestr_przechodzi_wszystkie_kontrole() -> None:
    """Kontrole musza byc spelnialne przez rzeczywisty rejestr (97 kodow) —
    inaczej straznik bylby czerwony na HEAD i kazdy by go wylaczyl."""
    assert waliduj_rejestr(READINESS_CODES) == []
    assert len(READINESS_CODES) >= 97


def test_uruchomienie_calego_straznika_rc0() -> None:
    """Bramka (d) karty: straznik zielony na 97 kodach rejestru, pelny przebieg."""
    wynik = subprocess.run(
        [sys.executable, str(REPO / "scripts" / "readiness_codes_guard.py")],
        capture_output=True,
        text=True,
        cwd=REPO,
    )
    assert wynik.returncode == 0, wynik.stdout + wynik.stderr
    assert "OK" in wynik.stdout
