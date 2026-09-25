#!/usr/bin/env python3
"""Testy generatora slownika kodow gotowosci i jego straznika (karta READINESS-DOC).

Wzorzec przejety z `test_readiness_codes_guard.py`: walidacja na ZYWYCH funkcjach
generatora (nie na tresci dokumentu z pamieci) plus jedno wywolanie calego straznika
podprocesem (bramka RC=0 na prawdziwym repozytorium). Zero mutacji plikow na dysku —
przypadki "dokument sie rozjechal" sa testowane na POZIOMIE FUNKCJI CZYSTYCH
(`zloz_dokument`, rownosc lancuchow), nie przez psucie prawdziwego dokumentu i granie w
przywracanie go w `finally` (ten sam powod, dla ktorego `readiness_codes_guard.py` testuje
swoje sciezki bledu na SYNTETYCZNYCH rejestrach, nie na zmutowanym zrodle).
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend" / "src"))

import pytest  # noqa: E402
from domain.canonical_operations import (  # noqa: E402
    ReadinessArea,
    ReadinessCodeSpec,
    ReadinessLevel,
)
from generuj_slownik_kodow_gotowosci import (  # noqa: E402
    DOKUMENT,
    REGISTRY_FILE,
    ZNACZNIK_KONIEC,
    ZNACZNIK_POCZATEK,
    _escape_md,
    _renderuj_nawigacje,
    modul_rejestru,
    renderuj_blok_generowany,
    renderuj_podsumowanie,
    renderuj_tabela_slownika,
    wiersze_posortowane,
    wygeneruj_dokument,
    zloz_dokument,
)

_WZORZEC_KWARGS = {
    "priority": 1,
    "level": ReadinessLevel.BLOCKER,
    "fix_navigation": {"panel": "inspector"},
}


def test_wiersze_posortowane_po_obszarze_priorytecie_i_kodzie() -> None:
    """Kolejnosc: obszar wg DEKLARACJI enuma (SOURCES...ANALYSIS), potem priorytet, potem kod."""
    synth = {
        "zzz.last_alpha": ReadinessCodeSpec(
            code="zzz.last_alpha",
            area=ReadinessArea.ANALYSIS,
            message_pl="x" * 10,
            **_WZORZEC_KWARGS,
        ),
        "aaa.topology_hi_prio": ReadinessCodeSpec(
            code="aaa.topology_hi_prio",
            area=ReadinessArea.TOPOLOGY,
            message_pl="x" * 10,
            **{**_WZORZEC_KWARGS, "priority": 1},
        ),
        "bbb.sources_low_prio": ReadinessCodeSpec(
            code="bbb.sources_low_prio",
            area=ReadinessArea.SOURCES,
            message_pl="x" * 10,
            **{**_WZORZEC_KWARGS, "priority": 3},
        ),
        "aaa.sources_hi_prio": ReadinessCodeSpec(
            code="aaa.sources_hi_prio",
            area=ReadinessArea.SOURCES,
            message_pl="x" * 10,
            **{**_WZORZEC_KWARGS, "priority": 1},
        ),
        "zzz.sources_hi_prio": ReadinessCodeSpec(
            code="zzz.sources_hi_prio",
            area=ReadinessArea.SOURCES,
            message_pl="x" * 10,
            **{**_WZORZEC_KWARGS, "priority": 1},
        ),
    }
    posortowane = [s.code for s in wiersze_posortowane(synth)]
    assert posortowane == [
        "aaa.sources_hi_prio",  # SOURCES, priorytet 1, kod alfabetycznie pierwszy
        "zzz.sources_hi_prio",  # SOURCES, priorytet 1, kod alfabetycznie drugi
        "bbb.sources_low_prio",  # SOURCES, priorytet 3
        "aaa.topology_hi_prio",  # TOPOLOGY (dalej niz SOURCES w deklaracji enuma)
        "zzz.last_alpha",  # ANALYSIS (ostatni w deklaracji enuma)
    ], posortowane


def test_renderuj_nawigacje_tylko_obecne_klucze_w_stalej_kolejnosci() -> None:
    assert _renderuj_nawigacje({"panel": "inspector"}) == "panel: `inspector`"
    assert (
        _renderuj_nawigacje({"focus": "x", "panel": "inspector", "tab": "y"})
        == "panel: `inspector`, tab: `y`, focus: `x`"
    ), "kolejnosc renderowania musi byc stala (panel,tab,modal,focus), niezaleznie od kolejnosci w zrodle"
    assert (
        _renderuj_nawigacje({"panel": "wizard", "modal": "add_grid_source"})
        == "panel: `wizard`, modal: `add_grid_source`"
    ), "brakujacy 'tab' nie zostawia pustej dziury ani null-a"


def test_escape_md_ucieka_pipe_i_splaszcza_nowa_linie() -> None:
    assert _escape_md("a | b") == "a \\| b"
    assert _escape_md("a\nb") == "a b"
    assert _escape_md("  spacje  ") == "spacje"


def test_zloz_dokument_wymaga_obu_znacznikow() -> None:
    with pytest.raises(SystemExit):
        zloz_dokument("dokument bez znacznikow", "blok")
    with pytest.raises(SystemExit):
        zloz_dokument(f"tylko {ZNACZNIK_POCZATEK} bez konca", "blok")


def test_zloz_dokument_wstawia_blok_i_jest_idempotentny() -> None:
    baza = f"przed\n\n{ZNACZNIK_POCZATEK}\nstary smiec\n{ZNACZNIK_KONIEC}\n\npo"
    wynik = zloz_dokument(baza, "NOWA TRESC")
    assert "stary smiec" not in wynik
    assert "NOWA TRESC" in wynik
    assert wynik.startswith("przed\n\n")
    assert wynik.endswith("\n\npo")
    assert wynik.count(ZNACZNIK_POCZATEK) == 1
    assert wynik.count(ZNACZNIK_KONIEC) == 1

    # Uruchomienie generatora DRUGI RAZ na WYNIKU pierwszego (tak jak deweloper, ktory
    # odpala skrypt dwa razy z rzedu) daje TEN SAM wynik — zaden dryf przy powtorzeniu.
    wynik2 = zloz_dokument(wynik, "NOWA TRESC")
    assert wynik2 == wynik


def test_renderuj_tabela_slownika_ma_jeden_wiersz_na_kod_i_bez_kolumny_fix_action_id() -> None:
    tabela = renderuj_tabela_slownika(modul_rejestru().READINESS_CODES)
    liczba_kodow = len(modul_rejestru().READINESS_CODES)
    # naglowek + linia separatora + N wierszy danych
    assert len(tabela.splitlines()) == 2 + liczba_kodow
    assert "Fix Action ID" not in tabela, "karta usunela pojecie Fix Action ID z dokumentu"
    assert "Nawigacja naprawcza" in tabela


def test_renderuj_podsumowanie_liczby_zgadzaja_sie_z_rejestrem() -> None:
    codes = modul_rejestru().READINESS_CODES
    podsumowanie = renderuj_podsumowanie(codes)
    razem = len(codes)
    assert (
        podsumowanie.count(f"**{razem}**") == 2
    ), "Razem musi wystapic w obu tabelach (poziom, obszar)"
    for poziom in modul_rejestru().ReadinessLevel:
        liczba = sum(1 for s in codes.values() if s.level is poziom)
        assert f"| {poziom.value} | {liczba} |" in podsumowanie
    for obszar in modul_rejestru().ReadinessArea:
        liczba = sum(1 for s in codes.values() if s.area is obszar)
        assert f"| {obszar.value} | {liczba} |" in podsumowanie


def test_blok_generowany_niesie_liczbe_kodow_z_rejestru() -> None:
    codes = modul_rejestru().READINESS_CODES
    blok = renderuj_blok_generowany(codes)
    assert f"**{len(codes)}**" in blok


def test_dokument_na_dysku_zgadza_sie_z_generatorem() -> None:
    """Odpowiednik `tests/golden/test_registry.py::test_dokument_generowany_jest_aktualny`
    na poziomie funkcji — to samo porownanie, ktore robi `readiness_dictionary_guard.py`,
    tylko bez podprocesu (szybsze, ta sama funkcja `wygeneruj_dokument`)."""
    assert DOKUMENT.exists(), "uruchom: python scripts/generuj_slownik_kodow_gotowosci.py"
    assert DOKUMENT.read_text(encoding="utf-8") == wygeneruj_dokument(), (
        f"{DOKUMENT} nieaktualny wzgledem rejestru — "
        "uruchom scripts/generuj_slownik_kodow_gotowosci.py"
    )


def test_generowana_tabela_w_dokumencie_nie_ma_kolumny_fix_action_id() -> None:
    """`Fix Action ID` smie wystapic w dokumencie WYLACZNIE jako historyczna wzmianka
    w "Historii zmian" (co zostalo skasowane) — nigdy jako naglowek kolumny albo pole
    w "Cel dokumentu". Sprawdzamy to tam, gdzie defekt faktycznie by sie objawil: w
    WYGENEROWANEJ tabeli (miedzy znacznikami), nie w calym pliku."""
    tresc = DOKUMENT.read_text(encoding="utf-8")
    poczatek = tresc.index(ZNACZNIK_POCZATEK)
    koniec = tresc.index(ZNACZNIK_KONIEC)
    blok_generowany = tresc[poczatek:koniec]
    assert "Fix Action ID" not in blok_generowany
    assert "fix_action_id" not in blok_generowany


def test_generator_i_straznik_uzywaja_tego_samego_rejestru() -> None:
    assert REGISTRY_FILE.exists()
    assert REGISTRY_FILE == REPO / "backend" / "src" / "domain" / "canonical_operations.py"


def test_uruchomienie_generatora_check_rc0_na_prawdziwym_repo() -> None:
    wynik = subprocess.run(
        [sys.executable, str(REPO / "scripts" / "generuj_slownik_kodow_gotowosci.py"), "--check"],
        capture_output=True,
        text=True,
        cwd=REPO,
    )
    assert wynik.returncode == 0, wynik.stdout + wynik.stderr
    assert "AKTUALNY" in wynik.stdout


def test_uruchomienie_calego_straznika_rc0() -> None:
    wynik = subprocess.run(
        [sys.executable, str(REPO / "scripts" / "readiness_dictionary_guard.py")],
        capture_output=True,
        text=True,
        cwd=REPO,
    )
    assert wynik.returncode == 0, wynik.stdout + wynik.stderr
    assert "OK" in wynik.stdout
