"""Wyrocznia ukladu dwuwezlowego na granicy `|V| = U_min` nie zalezy od ostatniego bitu.

Defekt (CI partii zwarc, runner `ubuntu-26.04`): bramka G23 celowo stawia zwarcie DOKLADNIE
na granicy `|V| = U_min` (`skala_admitancji_granicznej`). Lokalnie `g(U_min)` wychodzilo 0,
na glibc amd64v3 (`hypot` z FMA, 1 ulp roznicy) `+4.4e-16` — przeszukanie siatki nie widzialo
zmiany znaku i wyrocznia odmawiala (`ValueError`) ukladu, ktory ma rozwiazanie.

ILOCZYN CECH: ksztalt charakterystyki z napieciem przejscia {stala moc, czysty I, mieszany
ZIP} x przesuniecie admitancji zwarcia wokol granicy {0, +-1 ulp, +-2 ulp, +-4 ulp, +-1e-13
wzgl., +-1e-9 wzgl.} x wariant `hypot` biblioteki matematycznej {platformy, o 1 ulp w gore,
o 1 ulp w dol} — wariant emulowany podmiana `abs` w module wyroczni (modul liczby
zespolonej o 1 ulp obok, jak glibc amd64v3 wobec bazowego). Na granicy i w jej otoczeniu
ponizej tolerancji wyrocznia zwraca napiecie `|V| = U_min` w pasmie bledu bramki; dalej od granicy (1e-9) — rozwiazanie wlasciwej galezi.

WSTRZYKNIECIE (meldunek): usuniecie galezi `math.isclose(..., TOLERANCJA_GRANICY_U_MIN)` z
`napiecie_dwuwezlowe` czerwieni przypadki z `hypot` o 1 ulp w gore — `ValueError` jak na
runnerze (`stala_moc` takze DOKLADNIE na granicy, czyli przypadek bramki G23).
"""

from __future__ import annotations

import builtins
import math
from collections.abc import Callable

import pytest

from . import bramki, wyrocznia_odbiorow
from .wyrocznia_odbiorow import (
    TOLERANCJA_GRANICY_U_MIN,
    napiecie_dwuwezlowe,
    skala_admitancji_granicznej,
)

_KIERUNEK = complex(0.0, -1.0)
_KSZTALTY = sorted(
    k for k, v in bramki._KSZTALTY_D23.items() if v[5] is not None and v[2] == 0.0 == v[3]
)


def _przesun(skala: float, przesuniecie: str) -> float:
    if przesuniecie == "0":
        return skala
    znak = 1.0 if przesuniecie.startswith("+") else -1.0
    wielkosc = przesuniecie[1:]
    if wielkosc.endswith("ulp"):
        wynik = skala
        for _ in range(int(wielkosc[:-3])):
            wynik = math.nextafter(wynik, math.inf * znak)
        return wynik
    return skala * (1.0 + znak * float(wielkosc))


PRZESUNIECIA = (
    "0",
    "+1ulp",
    "-1ulp",
    "+2ulp",
    "-2ulp",
    "+4ulp",
    "-4ulp",
    "+1e-13",
    "-1e-13",
    "+1e-9",
    "-1e-9",
)
_ABS = builtins.abs


def _hypot_obok(kierunek: float) -> Callable[[object], object]:
    def modul(x: object) -> object:
        wynik = _ABS(x)  # type: ignore[call-overload]
        return math.nextafter(wynik, kierunek) if isinstance(x, complex) else wynik

    return modul


WARIANTY_HYPOT = {"platformy": None, "gora_1ulp": math.inf, "dol_1ulp": -math.inf}


def test_iloczyn_obejmuje_ksztalty_z_napieciem_przejscia() -> None:
    assert len(_KSZTALTY) >= 3, _KSZTALTY


@pytest.mark.parametrize("hypot", sorted(WARIANTY_HYPOT))
@pytest.mark.parametrize("przesuniecie", PRZESUNIECIA)
@pytest.mark.parametrize("ksztalt", _KSZTALTY)
def test_granica_u_min_ma_rozwiazanie_niezalezne_od_bitu(
    ksztalt: str, przesuniecie: str, hypot: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    _, wyrocznia = bramki._odbior_d23(ksztalt)
    e, y = bramki._E_D23, bramki._Y_D23
    kierunek = WARIANTY_HYPOT[hypot]
    if kierunek is not None:
        # Wariant libm dotyczy CALEJ wyroczni — takze wyznaczenia skali granicznej (na
        # runnerze bramka liczy obie rzeczy ta sama biblioteka).
        monkeypatch.setattr(wyrocznia_odbiorow, "abs", _hypot_obok(kierunek), raising=False)
    skala = skala_admitancji_granicznej(e, y, _KIERUNEK, wyrocznia, None)
    v = napiecie_dwuwezlowe(e, y, _przesun(skala, przesuniecie) * _KIERUNEK, wyrocznia, None)
    u_min = wyrocznia.u_min_pu
    assert u_min is not None
    if przesuniecie in {"+1e-9", "-1e-9"}:
        # Poza tolerancja granicy: wieksza admitancja zwarcia = nizsze napiecie (galaz
        # impedancyjna ponizej U_min), mniejsza = galaz charakterystyki ponad U_min.
        assert (_ABS(v) < u_min) is przesuniecie.startswith("+")
        assert _ABS(_ABS(v) - u_min) < 1e-6
    else:
        # Na granicy: napiecie U_min w pasmie bledu napiecia bramki G23.
        assert _ABS(_ABS(v) - u_min) <= bramki.PROGI["G23_blad_napiecia_pu"]
    assert TOLERANCJA_GRANICY_U_MIN * u_min < bramki.PROGI["G23_blad_napiecia_pu"]
