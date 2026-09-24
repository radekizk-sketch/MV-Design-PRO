"""MANIFEST musi wskazywac rzeczy ISTNIEJACE (R10 par. 35-36).

Manifest bez tego testu bylby najgorszym rodzajem dokumentu: wygladalby na dowod,
a byl spisem zyczen. Tutaj kazda pozycja jest konfrontowana z repozytorium —
plik testu musi istniec, nazwa testu musi byc w nim obecna, identyfikator mutacji
musi byc w zamknietym zestawie, a poziom L5 musi miec KOMPLET siedmiu elementow.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from . import mutacje
from .manifest import MANIFEST, POZIOMY_WYMAGAJACE_KOMPLETU, Twierdzenie

KORZEN_BACKENDU = Path(__file__).resolve().parents[2]


def test_identyfikatory_sa_unikalne() -> None:
    identy = [t.ident for t in MANIFEST]
    assert len(identy) == len(set(identy)), identy


@pytest.mark.parametrize("twierdzenie", MANIFEST, ids=lambda t: t.ident)
def test_testy_wskazane_w_manifescie_istnieja(twierdzenie: Twierdzenie) -> None:
    for odnosnik in twierdzenie.testy:
        sciezka, _, nazwa = odnosnik.partition("::")
        plik = KORZEN_BACKENDU / sciezka
        assert plik.is_file(), f"{twierdzenie.ident}: brak pliku {sciezka}"
        if nazwa:
            # Wezel `Klasa::test` (test w klasie) — sprawdzane OBA czlony.
            *klasy, funkcja = nazwa.split("::")
            tresc = plik.read_text()
            for klasa in klasy:
                assert (
                    f"class {klasa}" in tresc
                ), f"{twierdzenie.ident}: brak klasy {klasa} w {sciezka}"
            assert (
                f"def {funkcja}(" in tresc
            ), f"{twierdzenie.ident}: brak testu {funkcja} w {sciezka}"


@pytest.mark.parametrize("twierdzenie", MANIFEST, ids=lambda t: t.ident)
def test_mutacje_wskazane_w_manifescie_istnieja(twierdzenie: Twierdzenie) -> None:
    znane = {m.ident for m in mutacje.MUTACJE}
    for ident in twierdzenie.mutacje:
        assert ident in znane, f"{twierdzenie.ident}: nieznana mutacja {ident}"


@pytest.mark.parametrize("twierdzenie", MANIFEST, ids=lambda t: t.ident)
def test_poziom_l5_ma_komplet_dowodu(twierdzenie: Twierdzenie) -> None:
    """L5 wymaga rownania, wyroczni, wzorca, mutacji, testow, bramki i zakresu waznosci."""
    if twierdzenie.poziom not in POZIOMY_WYMAGAJACE_KOMPLETU:
        return
    braki = [
        nazwa
        for nazwa, wartosc in (
            ("rownanie", twierdzenie.rownanie),
            ("wyrocznia", twierdzenie.wyrocznia),
            ("wzorzec", twierdzenie.wzorzec),
            ("testy", twierdzenie.testy),
            ("mutacje", twierdzenie.mutacje),
            ("bramka_ci", twierdzenie.bramka_ci),
            ("zakres_waznosci", twierdzenie.zakres_waznosci),
        )
        if not wartosc
    ]
    assert not braki, f"{twierdzenie.ident} ma poziom L5, a brakuje: {braki}"
    assert not twierdzenie.wymaga_wyroczni_zewnetrznej, (
        f"{twierdzenie.ident}: dowod opierajacy sie na wyroczni spoza bramki obowiazkowej "
        "nie moze miec poziomu L5 (punkt 6 kontraktu)"
    )


@pytest.mark.parametrize("twierdzenie", MANIFEST, ids=lambda t: t.ident)
def test_poziom_nizszy_niz_l5_ma_uzasadnienie(twierdzenie: Twierdzenie) -> None:
    """Obnizenie poziomu musi byc UZASADNIONE, a nie po prostu wpisane."""
    if twierdzenie.poziom in POZIOMY_WYMAGAJACE_KOMPLETU:
        return
    assert (
        twierdzenie.uwagi
    ), f"{twierdzenie.ident}: poziom {twierdzenie.poziom} bez wyjasnienia, czego brakuje"


def test_kazda_mutacja_jest_uzyta_przez_jakies_twierdzenie() -> None:
    """Mutacja, ktorej nie powoluje zadne twierdzenie, nie broni zadnego dowodu."""
    powolane = {ident for t in MANIFEST for ident in t.mutacje}
    nieuzywane = sorted(
        m.ident for m in mutacje.MUTACJE if m.ident not in powolane and m.ident != "M21"
    )
    assert not nieuzywane, f"mutacje bez twierdzenia w manifescie: {nieuzywane}"


WYROCZNIE_NIEZALEZNE = (
    "wyrocznia.py",
    "wyrocznia_zdarzen.py",
    "wyrocznia_pradow.py",
    "wyrocznia_fazorow.py",
)


@pytest.mark.parametrize("plik", WYROCZNIE_NIEZALEZNE)
def test_wyrocznia_nie_importuje_rdzenia_dynamiki(plik: str) -> None:
    """Deklaracja z docstringow wyroczni („ZERO importow z rdzenia") przypieta testem.

    Wyrocznia dzielaca kod z produktem potwierdzalaby produkt jego wlasnym bledem —
    sprawdzane na drzewie skladniowym, nie na tekscie (komentarz nie jest importem).
    """
    import ast

    drzewo = ast.parse((Path(__file__).parent / plik).read_text())
    moduly: list[str] = []
    for wezel in ast.walk(drzewo):
        if isinstance(wezel, ast.Import):
            moduly.extend(alias.name for alias in wezel.names)
        elif isinstance(wezel, ast.ImportFrom) and wezel.module:
            moduly.append(wezel.module)
    zakazane = [m for m in moduly if m.startswith(("network_model", "enm", "solvers"))]
    assert not zakazane, f"{plik} importuje kod produktu: {zakazane}"
