"""Zaczepy przekładnika prądowego wieloprzekładniowego — parser zapisu tabliczki i rejestr
wartości roboczych (karta UX-04, uwaga właściciela 2026-10-30: „przekładnik 200–400 —
jednoznacznie wyróżniony wybrany zaczep").

Parytet z lustrem frontu (``frontend/src/ui/sld/v2/model/tabliczkaPrzekladnika.ts``) przypina
WSPÓLNA tabela przypadków ``zaczepy_przekladnika_przypadki.json`` — ten sam plik czyta test
frontu; rozjazd reguły po jednej stronie czerwieni test tej strony.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from network_model.catalog.przekladniki import zaczepy_pierwotne_a, zaczepy_przekladnika
from network_model.catalog.wartosci_robocze import (
    dana_przyjeta_zaczepu,
    pola_zaczepu_rekordu,
    rozstrzygnij_zaczep_przekladnika,
)

_PRZYPADKI = json.loads(
    (
        Path(__file__).resolve().parents[4]
        / "frontend/src/ui/sld/v2/model/__tests__/zaczepy_przekladnika_przypadki.json"
    ).read_text(encoding="utf-8")
)


@pytest.mark.parametrize(("zapis", "oczekiwane"), _PRZYPADKI["rdzen"])
def test_zaczepy_rdzenia_wspolna_tabela(zapis: str, oczekiwane: list[float]) -> None:
    assert list(zaczepy_pierwotne_a(zapis)) == oczekiwane


@pytest.mark.parametrize(("zapisy", "oczekiwane"), _PRZYPADKI["przekladnik"])
def test_zaczepy_przekladnika_wspolna_tabela(zapisy: list[str], oczekiwane: list[float]) -> None:
    assert list(zaczepy_przekladnika(zapisy)) == oczekiwane


@pytest.mark.parametrize(
    ("zaczepy", "projektant", "oczekiwane"),
    [
        ((), None, None),
        ((400.0,), None, None),
        ((400.0,), 400.0, None),
        ((200.0, 400.0), None, (400.0, "WARTOSC_ROBOCZA")),
        ((200.0, 400.0), 200.0, (200.0, "PROJEKTANT")),
        ((150.0, 300.0, 600.0), None, (600.0, "WARTOSC_ROBOCZA")),
        ((150.0, 300.0, 600.0), 300.0, (300.0, "PROJEKTANT")),
    ],
)
def test_pierwszenstwo_zaczepu(
    zaczepy: tuple[float, ...], projektant: float | None, oczekiwane: tuple[float, str] | None
) -> None:
    """Iloczyn liczba zaczepów × wybór projektanta: wybór projektanta > wartość robocza (zaczep
    najwyższy); przekładnik o jednej przekładni nie ma zaczepu do wyboru."""
    wynik = rozstrzygnij_zaczep_przekladnika(zaczepy, projektant)
    assert (None if wynik is None else (wynik.wartosc, wynik.zrodlo)) == oczekiwane
    rekord = pola_zaczepu_rekordu(
        [f"{'-'.join(f'{z:g}' for z in zaczepy)}/5"] if zaczepy else [], projektant
    )
    assert rekord == (
        {}
        if oczekiwane is None
        else {"zaczep_pierwotny_a": oczekiwane[0], "zrodlo_zaczepu": oczekiwane[1]}
    )


def test_wybor_spoza_tabliczki_to_blad_programu() -> None:
    with pytest.raises(ValueError, match="spoza zaczepów"):
        rozstrzygnij_zaczep_przekladnika((200.0, 400.0), 300.0)


def test_dana_przyjeta_tylko_dla_wartosci_roboczej() -> None:
    roboczy = rozstrzygnij_zaczep_przekladnika((200.0, 400.0), None)
    assert roboczy is not None
    dana = dana_przyjeta_zaczepu(nazwa_aparatu_pl="T1", zaczep=roboczy)
    assert dana.jakosc is not None and dana.jakosc.value == "ESTIMATED"
    assert dana.wartosc is not None and (dana.wartosc.wartosc, dana.wartosc.jednostka) == (
        400.0,
        "A",
    )
    assert "założenie inżynierskie" in dana.powod_pl and "Wpływ:" in dana.powod_pl
    projektanta = rozstrzygnij_zaczep_przekladnika((200.0, 400.0), 200.0)
    assert projektanta is not None
    with pytest.raises(AssertionError):
        dana_przyjeta_zaczepu(nazwa_aparatu_pl="T1", zaczep=projektanta)
