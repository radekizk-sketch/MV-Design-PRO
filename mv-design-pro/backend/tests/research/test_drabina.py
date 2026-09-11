"""Taksonomia dowodów — JEDEN zbiór identyfikatorów, pilnowany testem.

KOD BADAWCZY — patrz `backend/research/README.md`.

Laboratorium miało dwie sprzeczne definicje „poziomu 4": `benchmarki.py`
nazywał tak sieć SN z DER, `wzorzec_zewnetrzny.py` — porównanie z ANDES.
Sam komentarz tego nie naprawia: bez testu rejestr rozjedzie się z kodem przy
pierwszej nowej pozycji. Te testy pilnują, że rejestr opisuje realny stan.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from dynamic_lab.drabina import (
    DRABINA,
    PoziomWyroczni,
    ZlozonoscPrzypadku,
    podsumowanie,
    pozycje_o_wyroczni,
)

KATALOG_TESTOW = Path(__file__).resolve().parent


def test_identyfikatory_sa_unikalne() -> None:
    identyfikatory = [p.identyfikator for p in DRABINA]
    assert len(identyfikatory) == len(set(identyfikatory))


def test_etykieta_jest_jednoznaczna_i_ma_obie_osie() -> None:
    """`C1/W3` nie może być mylone z `C4/W1` — kolizja „poziomu 4" była właśnie tym."""
    for pozycja in DRABINA:
        assert re.fullmatch(r"C[0-4]/W[0-3]", pozycja.etykieta), pozycja.etykieta


def test_kazda_realizacja_istnieje() -> None:
    """Wpis wskazujący nieistniejący test byłby deklaracją bez pokrycia."""
    tresc_testow = "\n".join(
        p.read_text(encoding="utf-8") for p in KATALOG_TESTOW.glob("test_*.py")
    )
    braki = []
    for pozycja in DRABINA:
        realizacja = pozycja.realizacja
        if realizacja.endswith(".py"):
            if not (KATALOG_TESTOW.parents[1] / realizacja).exists():
                braki.append(realizacja)
        elif f"def {realizacja}" not in tresc_testow:
            braki.append(realizacja)
    assert not braki, f"Rejestr wskazuje nieistniejące realizacje: {braki}"


def test_kazda_os_ma_pokrycie_powyzej_ksztaltu() -> None:
    """Rejestr nie może składać się z samych testów kształtu.

    W0 nie dowodzi fizyki — gdyby wszystkie pozycje były na W0, laboratorium
    byłoby w tym samym stanie co audytowana produkcja (84 % testów kształtu).
    """
    assert not pozycje_o_wyroczni(
        PoziomWyroczni.W0_KSZTALT
    ), "Pozycja na poziomie W0 nie jest dowodem fizyki — nie należy do rejestru."
    assert pozycje_o_wyroczni(PoziomWyroczni.W2_WYROCZNIA_ANALITYCZNA)
    assert pozycje_o_wyroczni(PoziomWyroczni.W3_WYROCZNIA_ZEWNETRZNA)


def test_pokryte_sa_wszystkie_klasy_defektow_z_audytu() -> None:
    """Każdy przypadek osi C ma co najmniej jeden dowód — inaczej klasa defektu wisi."""
    pokryte = {p.zlozonosc for p in DRABINA}
    for zlozonosc in ZlozonoscPrzypadku:
        assert zlozonosc in pokryte, f"Brak dowodu dla {zlozonosc.value}"


def test_podsumowanie_nadaje_sie_do_meldunku() -> None:
    tekst = podsumowanie()
    assert tekst.startswith("| Etykieta |")
    assert tekst.count("\n") == len(DRABINA) + 1
    for pozycja in DRABINA:
        assert pozycja.etykieta in tekst


@pytest.mark.parametrize("nazwa_modulu", ["benchmarki", "wzorzec_zewnetrzny"])
def test_moduly_nie_uzywaja_juz_kolidujacego_nazewnictwa(nazwa_modulu: str) -> None:
    """Stare etykiety „L4"/„Poziom 4" nie mogą wrócić przez kopiowanie docstringów."""
    import importlib

    modul = importlib.import_module(f"dynamic_lab.{nazwa_modulu}")
    tresc = (modul.__doc__ or "").lower()
    assert "poziom 4" not in tresc
    assert "l0–l4" not in tresc and "l0-l4" not in tresc
