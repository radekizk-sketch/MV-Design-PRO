"""HARNESS MUTACJI: samokontrola i szybkie zabicia (R10 par. 23-24).

Pelny zestaw mutacji biegnie osobnym wejsciem
(`python -m tests.walidacja_fizyczna.mutacje`), bo kazda mutacja uruchamia bramki
w osobnym procesie. Tutaj sa trzy rzeczy, ktore MUSZA biec w kazdej bramce:

1. SAMOKONTROLA — mutacja bez skutku (zmiana samego komentarza) ma byc
   zakwalifikowana jako NIEWAZNA, nigdy jako zabicie. Harness, ktory melduje
   „zabite" dla zmiany bez skutku, produkuje falszywa pewnosc i jest grozniejszy
   od braku harnessu.
2. AKTUALNOSC — kazdy wzorzec mutacji musi wystepowac w dzisiejszym zrodle.
   Mutacja opisujaca kod, ktorego juz nie ma, jest martwym dowodem.
3. SZYBKIE ZABICIA — te mutacje, ktorych detektor jest tani (bramka rzedu sekund).
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

from . import mutacje

#: M26 i M27 (karta AB-1b.1): detektory tanie — bramka G19 (16 krotkich biegow pierscienia)
#: + odmowa dawnego SO-1A w 1,18 s, oraz test lacznika rezerwowego G16 na sciezce uzytkownika.
#: M29 (karta AB-1b.1 P5): bramka G20 (jeden bieg SMIB, ~5 s) i test kontraktu wyniku.
SZYBKIE = ("M19", "M14", "M15", "M18", "M26", "M27", "M29")


def test_samokontrola_mutacja_bez_skutku_jest_niewazna() -> None:
    """Zmiana samego komentarza: tekst INNY, drzewo skladniowe IDENTYCZNE."""
    kontrolna = next(m for m in mutacje.MUTACJE if m.ident == "M21")
    wynik = mutacje.wykonaj(kontrolna)
    assert wynik["WERDYKT"] == "MUTACJA NIEWAZNA", wynik
    assert wynik["faktyczny_detektor"] is None, wynik


def test_kwalifikacja_rozroznia_trzy_przypadki() -> None:
    """Predykat kwalifikacji sam w sobie — bez uruchamiania bramek."""
    zrodlo = "x = 1  # komentarz\n"
    assert mutacje.kwalifikuj(zrodlo, zrodlo) == "BEZ ZMIANY TEKSTU"
    assert mutacje.kwalifikuj(zrodlo, "x = 1  # INNY komentarz\n") == "MUTACJA NIEWAZNA"
    assert mutacje.kwalifikuj(zrodlo, "x = 2  # komentarz\n") == "MUTACJA WAZNA"


@pytest.mark.parametrize("mutacja", mutacje.MUTACJE, ids=lambda m: m.ident)
def test_wzorzec_mutacji_wystepuje_w_zrodle(mutacja: mutacje.Mutacja) -> None:
    """Mutacja musi opisywac kod, ktory DZIS istnieje — inaczej jest martwym dowodem."""
    plik = mutacje.KATALOG_ZRODEL / mutacja.plik
    assert plik.is_file(), plik
    tresc = plik.read_text()
    assert mutacja.przed in tresc, (
        f"{mutacja.ident}: wzorzec nie wystepuje w {mutacja.plik} — kod sie zmienil, "
        "a mutacja nie"
    )
    zmutowana = tresc.replace(mutacja.przed, mutacja.po, 1)
    oczekiwana = "MUTACJA NIEWAZNA" if mutacja.ident == "M21" else "MUTACJA WAZNA"
    assert mutacje.kwalifikuj(tresc, zmutowana) == oczekiwana, mutacja.ident


@pytest.mark.parametrize("ident", SZYBKIE)
def test_szybka_mutacja_jest_zabita(ident: str) -> None:
    """Mutacja o TANIM detektorze musi zaczerwienic swoja bramke — tu i teraz."""
    mutacja = next(m for m in mutacje.MUTACJE if m.ident == ident)
    wynik = mutacje.wykonaj(mutacja, limit_s=900.0)
    assert wynik["WERDYKT"] == "ZABITA", wynik
    assert wynik["faktyczny_detektor"], wynik


def test_kazda_mutacja_wskazuje_bramke_albo_jest_kontrolna() -> None:
    """Zero mutacji „zabitych przez cokolwiek": detektor musi byc nazwany z gory."""
    for mutacja in mutacje.MUTACJE:
        if mutacja.ident == "M21":
            assert mutacja.bramki == (), "mutacja kontrolna nie moze miec bramki"
            assert mutacja.testy == (), "mutacja kontrolna nie moze miec testu"
            continue
        assert (
            mutacja.bramki or mutacja.testy
        ), f"{mutacja.ident}: brak deklarowanego detektora (ani bramki, ani testu)"
        assert mutacja.oczekiwany_detektor, f"{mutacja.ident}: brak opisu detektora"


def test_plik_mutacji_jest_poprawna_skladnia_po_podmianie() -> None:
    """Kazda mutacja musi dac plik, ktory sie PARSUJE — inaczej „zabija" skladnia, nie fizyka."""
    for mutacja in mutacje.MUTACJE:
        tresc = (mutacje.KATALOG_ZRODEL / mutacja.plik).read_text()
        ast.parse(tresc.replace(mutacja.przed, mutacja.po, 1))


def test_lustro_zrodel_nie_dotyka_drzewa_roboczego(tmp_path: Path) -> None:
    """Podmiana dzieje sie w lustrze; oryginal zostaje nietkniety."""
    mutacja = next(m for m in mutacje.MUTACJE if m.ident == "M19")
    oryginal = (mutacje.KATALOG_ZRODEL / mutacja.plik).read_text()
    lustro = mutacje._lustro_zrodel(tmp_path)
    mutacje._podmien(lustro, mutacja)
    assert (lustro / mutacja.plik).read_text() != oryginal
    assert (mutacje.KATALOG_ZRODEL / mutacja.plik).read_text() == oryginal
