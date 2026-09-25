"""Wybór modelu widmowego dla (dziedzina, f, punkt pracy) — bez interpolacji (karta AB-H0 §0.4.8).

Przypadki z karty: punkt w binie / na granicy binu (domknięcie z dokumentu) / poza /
dwa modele pokrywające → ``NIEJEDNOZNACZNY_WYBOR`` / f poza zakresem → ``OUTSIDE_DOMAIN``;
dopełnione iloczynem: parametr punktu pracy (P, Q, U, SOC, tryb, stacjonarność, baza)
× wartość (w przedziale / na granicy domkniętej / na granicy otwartej / poza / brak).
"""

from __future__ import annotations

import itertools

import pytest
from dziedziny.kanon import Przedzial
from dziedziny.widmo import (
    ModelWybrany,
    NiejednoznacznyWybor,
    PozaDomenaModelu,
    ZakresCzestotliwosci,
    wybierz_model,
)
from pydantic import ValidationError

from tests.dziedziny import fabryki as f

HARM = "HARMONIC_FREQUENCY_DOMAIN"


def _dwa_biny():
    """Biny mocy z dokumentu: [0,2; 0,5) i [0,5; 1,0] — punkt 0,5 należy do drugiego."""
    niski = f.model(ident="bin-niski", punkt_pracy=f.punkt_pracy((0.2, 0.5), (True, False)))
    wysoki = f.model(ident="bin-wysoki", punkt_pracy=f.punkt_pracy((0.5, 1.0), (True, True)))
    return (niski, wysoki)


@pytest.mark.parametrize(
    ("p", "oczekiwany"),
    [(0.2, "bin-niski"), (0.35, "bin-niski"), (0.5, "bin-wysoki"), (1.0, "bin-wysoki")],
)
def test_punkt_w_binie_i_na_granicy_wg_domkniecia(p: float, oczekiwany: str) -> None:
    wynik = wybierz_model(_dwa_biny(), HARM, 250.0, f.zapytanie(p=p))
    assert isinstance(wynik, ModelWybrany)
    assert wynik.model.ident == oczekiwany


@pytest.mark.parametrize("p", [0.1, 0.1999, 1.0001, 5.0])
def test_punkt_poza_binami_to_outside_domain_z_parametrem(p: float) -> None:
    wynik = wybierz_model(_dwa_biny(), HARM, 250.0, f.zapytanie(p=p))
    assert isinstance(wynik, PozaDomenaModelu)
    assert wynik.status == "OUTSIDE_DOMAIN"
    assert wynik.parametr == "p"
    assert str(p) in wynik.powod_pl


def test_dwa_modele_pokrywajace_punkt_to_niejednoznaczny_wybor_nigdy_pierwszy() -> None:
    a = f.model(ident="a", punkt_pracy=f.punkt_pracy((0.0, 0.6)))
    b = f.model(ident="b", punkt_pracy=f.punkt_pracy((0.4, 1.0)))
    wynik = wybierz_model((b, a), HARM, 250.0, f.zapytanie(p=0.5))
    assert isinstance(wynik, NiejednoznacznyWybor)
    assert wynik.status == "NIEJEDNOZNACZNY_WYBOR"
    assert wynik.modele == ("a", "b")
    jednoznaczny = wybierz_model((b, a), HARM, 250.0, f.zapytanie(p=0.3))
    assert isinstance(jednoznaczny, ModelWybrany) and jednoznaczny.model.ident == "a"


@pytest.mark.parametrize("f_hz", [2500.0001, 9000.0])
def test_czestotliwosc_poza_zakresem_to_outside_domain(f_hz: float) -> None:
    wynik = wybierz_model((f.model(),), HARM, f_hz, f.zapytanie())
    assert isinstance(wynik, PozaDomenaModelu)
    assert wynik.parametr == "f_hz"


def test_granice_zakresu_czestotliwosci_sa_domkniete() -> None:
    model = f.model(zakres_czestotliwosci=ZakresCzestotliwosci(f_min_hz=100.0, f_max_hz=2500.0))
    for f_hz in (100.0, 2500.0):
        assert isinstance(wybierz_model((model,), HARM, f_hz, f.zapytanie()), ModelWybrany)
    assert isinstance(wybierz_model((model,), HARM, 99.0, f.zapytanie()), PozaDomenaModelu)


def test_brak_modelu_w_dziedzinie_to_outside_domain() -> None:
    wynik = wybierz_model((f.model(),), "SUPRAHARMONIC_FREQUENCY_DOMAIN", 250.0, f.zapytanie())
    assert isinstance(wynik, PozaDomenaModelu)
    assert wynik.parametr == "dziedzina"


def test_migawka_w_stanie_przejsciowym_nie_wybiera_modelu_stacjonarnego() -> None:
    wynik = wybierz_model((f.model(),), HARM, 250.0, f.zapytanie(stacjonarny=False))
    assert isinstance(wynik, PozaDomenaModelu)
    assert wynik.parametr == "stacjonarnosc"


def test_baza_mocy_rozna_to_outside_domain() -> None:
    wynik = wybierz_model((f.model(),), HARM, 250.0, f.zapytanie(baza_mocy="P_N_URZADZENIA"))
    assert isinstance(wynik, PozaDomenaModelu)
    assert wynik.parametr == "baza_mocy"


def _przedzial(dolna: float, gorna: float, dd: bool, dg: bool) -> Przedzial:
    return Przedzial(dolna=dolna, gorna=gorna, domkniecie_dolne=dd, domkniecie_gorne=dg)


@pytest.mark.parametrize(
    ("parametr", "wartosc", "domkniecie", "trafia"),
    [
        (param, wartosc, dom, trafia)
        for param, (wartosc, dom, trafia) in itertools.product(
            ("q", "u", "soc"),
            (
                (0.5, (True, True), True),  # w przedziale
                (0.2, (True, True), True),  # granica domknięta
                (0.2, (False, True), False),  # granica otwarta
                (0.9, (True, True), False),  # poza
                (None, (True, True), False),  # punkt pracy nie podaje parametru
            ),
        )
    ],
)
def test_iloczyn_parametr_punktu_pracy_x_wartosc(
    parametr: str, wartosc: float | None, domkniecie: tuple[bool, bool], trafia: bool
) -> None:
    model = f.model(punkt_pracy=f.punkt_pracy(**{parametr: _przedzial(0.2, 0.8, *domkniecie)}))
    wynik = wybierz_model((model,), HARM, 250.0, f.zapytanie(**{parametr: wartosc}))
    if trafia:
        assert isinstance(wynik, ModelWybrany)
    else:
        assert isinstance(wynik, PozaDomenaModelu)
        assert wynik.parametr == parametr


def test_tryb_magazynu() -> None:
    model = f.model(punkt_pracy=f.punkt_pracy(tryb="LADOWANIE"))
    ladowanie = wybierz_model((model,), HARM, 250.0, f.zapytanie(tryb="LADOWANIE"))
    assert isinstance(ladowanie, ModelWybrany)
    rozladowanie = wybierz_model((model,), HARM, 250.0, f.zapytanie(tryb="ROZLADOWANIE"))
    assert isinstance(rozladowanie, PozaDomenaModelu) and rozladowanie.parametr == "tryb"
    bez_trybu = wybierz_model((model,), HARM, 250.0, f.zapytanie())
    assert isinstance(bez_trybu, PozaDomenaModelu) and bez_trybu.parametr == "tryb"


def test_brak_interpolacji_miedzy_punktami_pracy() -> None:
    """Punkt pracy między dwoma rozłącznymi binami nie dostaje modelu „uśrednionego"."""
    a = f.model(ident="a", punkt_pracy=f.punkt_pracy((0.0, 0.3)))
    b = f.model(ident="b", punkt_pracy=f.punkt_pracy((0.7, 1.0)))
    wynik = wybierz_model((a, b), HARM, 250.0, f.zapytanie(p=0.5))
    assert isinstance(wynik, PozaDomenaModelu)


def test_czestotliwosc_zapytania_niedodatnia_jest_odmowa() -> None:
    with pytest.raises(ValueError, match="dodatnia"):
        wybierz_model((f.model(),), HARM, 0.0, f.zapytanie())


# ---------------------------------------------------------------------------
# Przedział z domknięciem z dokumentu
# ---------------------------------------------------------------------------


def test_przedzial_wymaga_jawnego_domkniecia_i_porzadku() -> None:
    with pytest.raises(ValidationError, match="razem albo wcale"):
        Przedzial(dolna=0.0, gorna=1.0, domkniecie_dolne=None, domkniecie_gorne=True)
    with pytest.raises(ValidationError, match="bez żadnej granicy"):
        Przedzial(dolna=None, gorna=None, domkniecie_dolne=None, domkniecie_gorne=None)
    with pytest.raises(ValidationError, match="większa od górnej"):
        _przedzial(1.0, 0.0, True, True)
    with pytest.raises(ValidationError, match="zdegenerowany"):
        _przedzial(1.0, 1.0, True, False)
    polotwarty = Przedzial(dolna=None, gorna=1.0, domkniecie_dolne=None, domkniecie_gorne=False)
    assert polotwarty.zawiera(-1e9) and not polotwarty.zawiera(1.0)
    assert polotwarty.zapis_pl() == "(-∞; 1.0)"
    assert _przedzial(0.2, 0.5, True, False).zapis_pl() == "[0.2; 0.5)"
