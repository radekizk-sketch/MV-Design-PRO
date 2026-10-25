"""Próby przeciwne P0: brak wiarygodnego położenia nie zwalnia blokady pola SN.

Dotyczy istniejącego predykatu używanego przez model odczytu pola ENM.
Ocena dotyczy TYLKO blokad wewnątrz pola. Nie potwierdza braku napięcia,
zdatności ruchowej ani bezpieczeństwa operacji na pełnym grafie sieci.
"""

from __future__ import annotations

import pytest

from enm.interlock_rules import blokady_zamkniecia, is_open


@pytest.mark.parametrize(
    ("stan_uziemnika", "oczekiwane"),
    [
        ("otwarty", False),
        ("otwarty_naped_rozbrojony", False),
        ("zamkniety", True),
        ("zamkniety_naped_rozbrojony", True),
        ("nieznany", None),
        ("awaria", None),
        (None, None),
    ],
)
def test_zamkniecie_wylacznika_wymaga_ustalonego_stanu_uziemnika(
    stan_uziemnika: str | None, oczekiwane: bool | None
) -> None:
    wynik = blokady_zamkniecia(
        [("cb_1", "CB", "otwarty"), ("es_1", "ES", stan_uziemnika)]
    )
    assert wynik["cb_1"] is oczekiwane


@pytest.mark.parametrize(
    ("stan_wylacznika", "oczekiwane"),
    [
        ("otwarty", False),
        ("otwarty_naped_rozbrojony", False),
        ("zamkniety", True),
        ("zamkniety_naped_rozbrojony", True),
        ("nieznany", None),
        ("awaria", None),
        (None, None),
    ],
)
def test_zamkniecie_uziemnika_wymaga_ustalonego_stanu_lacznika(
    stan_wylacznika: str | None, oczekiwane: bool | None
) -> None:
    wynik = blokady_zamkniecia(
        [("cb_1", "CB", stan_wylacznika), ("es_1", "ES", "otwarty")]
    )
    assert wynik["es_1"] is oczekiwane


def test_zamkniety_aparat_dominuje_nieustalony_stan_innego() -> None:
    wynik = blokady_zamkniecia(
        [
            ("cb_1", "CB", "zamkniety"),
            ("ds_1", "DS", "nieznany"),
            ("es_1", "ES", "otwarty"),
        ]
    )
    assert wynik["es_1"] is True


@pytest.mark.parametrize("stan", ["nieznany", "awaria", None, "zamkniety"])
def test_brak_dowodu_polozenia_otwartego(stan: str | None) -> None:
    assert is_open(stan) is False


def test_zakres_weryfikacji_nie_jest_zgoda_ruchowa() -> None:
    """False = brak mechanicznej kolizji w polu, nigdy dowód braku napięcia."""
    wynik = blokady_zamkniecia(
        [("cb_1", "CB", "otwarty"), ("es_1", "ES", "otwarty")]
    )
    assert wynik == {"cb_1": False, "es_1": False}
