"""Składnia LaTeX rejestru równań — dwa wzorce, których KaTeX nie renderuje (karta OBIEKT-KABEL-NN).

Przy wpinaniu kroków dowodu obwodu nN w inspektor kabla (wzory renderuje
`ui/proof/MathRenderer.tsx` z `throwOnError`) wyszły dwa defekty zapisu, oba niewidoczne
w eksporcie tekstowym, a oba dające w UI surowy tekst zamiast wzoru:

* sklejenie polecenia z literą przez konkatenację literałów
  (``r"... \\quad" r"I_2 ..."`` → ``\\quadI_2`` — „Undefined control sequence"; EQ_SC1_006),
* podwójny indeks dolny (``I_k''_{max}`` — „Double subscript"; EQ_LVCV i symbole pakietu).

Test sprawdza KAŻDE równanie rejestru (wszystkie słowniki ``*_EQUATIONS``): wzór i symbole.
"""

from __future__ import annotations

import re

import application.proof_engine.equation_registry as rejestr
from application.analyses.swz.werdykt import SwzStatus
import pytest
from application.proof_engine.packs import lv_circuit_verification as pakiet_nn

#: Polecenia LaTeX rejestru — każde renderowane przez KaTeX (sprawdzone przy karcie). Sklejenie
#: polecenia z literą (``\quadI``) daje nazwę spoza zbioru; nowe polecenie w rejestrze wymaga
#: świadomego dopisania tutaj po sprawdzeniu renderu KaTeX.
POLECENIA_KATEX = frozenset(
    {
        "Delta",
        "Rightarrow",
        "begin",
        "cdot",
        "circ",
        "delta",
        "end",
        "epsilon",
        "eta",
        "frac",
        "ge",
        "int",
        "kappa",
        "le",
        "left",
        "leq",
        "lim",
        "ln",
        "mathrm",
        "max",
        "min",
        "mu",
        "qquad",
        "quad",
        "rho",
        "right",
        "sqrt",
        "sum",
        "text",
        "theta",
        "to",
        "xrightarrow",
    }
)
#: Polecenie LaTeX (nie po podwójnym ukośniku — ``\\`` to nowa linia).
_POLECENIE = re.compile(r"(?<!\\)\\([A-Za-z]+)")
#: Indeks dolny, po nim prim(y), po nich drugi indeks dolny.
_PODWOJNY_INDEKS = re.compile(r"_(?:\{[^{}]*\}|[A-Za-z0-9])'+_")


def _rownania() -> list[tuple[str, str]]:
    wynik: list[tuple[str, str]] = []
    for nazwa in sorted(dir(rejestr)):
        slownik = getattr(rejestr, nazwa)
        if not (nazwa.endswith("_EQUATIONS") and isinstance(slownik, dict)):
            continue
        for eq_id, rownanie in sorted(slownik.items()):
            wynik.append((f"{eq_id}.latex", rownanie.latex))
            wynik.extend((f"{eq_id}.symbol", s.symbol) for s in rownanie.symbols)
    return wynik


ROWNANIA = _rownania()


def test_rejestr_nie_jest_pusty() -> None:
    assert len(ROWNANIA) > 100


@pytest.mark.parametrize(("miejsce", "latex"), ROWNANIA, ids=[m for m, _ in ROWNANIA])
def test_brak_sklejonych_polecen_i_podwojnych_indeksow(miejsce: str, latex: str) -> None:
    nieznane = sorted(set(_POLECENIE.findall(latex)) - POLECENIA_KATEX)
    assert not nieznane, f"{miejsce}: polecenia spoza KaTeX {nieznane} w {latex!r}"
    assert not _PODWOJNY_INDEKS.search(latex), f"{miejsce}: podwójny indeks dolny w {latex!r}"


def test_wzorce_wykrywaja_oba_defekty() -> None:
    """Iniekcja: dawne zapisy MUSZĄ być wykrywane (inaczej test niczego nie pilnuje)."""
    sklejone = set(_POLECENIE.findall(r"\frac{U_f}{Z_k}, \quadI_2 = -I_1")) - POLECENIA_KATEX
    assert sklejone == {"quadI"}
    assert not set(_POLECENIE.findall(r"\left( a \right) \\ b")) - POLECENIA_KATEX
    assert _PODWOJNY_INDEKS.search(r"I_k''_{max} \le I_{cu}")
    assert not _PODWOJNY_INDEKS.search(r"I''_{k,max} \le I_{cu}")


def test_podstawienie_swz_z_liczbami_nie_jest_proza() -> None:
    """Podstawienie SWZ z rozstrzygnięciem to nierówność liczbowa, nie tekst z ``_``."""
    swz = pakiet_nn.WynikSwzKroku(
        rozstrzygniecie=SwzStatus.SPELNIA,
        przyczyna_pl="Ik1_min=908.0 A ≥ Ia=80.0 A",
        ia_wymagane_a=80.0,
        t_wymagany_s=0.4,
        pasmo_u0="120<U0≤230",
        rodzaj_obwodu="odbiorczy",
    )
    tekst = pakiet_nn._podstawienie_swz(908.0, swz)
    assert tekst == r"$$I_{k1,min} = 908.0\;\mathrm{A} \ge I_a = 80.0\;\mathrm{A}$$"
    niespelnione = pakiet_nn._podstawienie_swz(50.0, swz)
    assert "<" in niespelnione and r"\ge" not in niespelnione
    nierozstrzygalne = pakiet_nn.WynikSwzKroku(
        rozstrzygniecie=SwzStatus.NIEROZSTRZYGALNE,
        przyczyna_pl="próg Ia_gG umowny",
        ia_wymagane_a=125.0,
        t_wymagany_s=5.0,
        pasmo_u0="120<U0≤230",
        rodzaj_obwodu="rozdzielczy",
    )
    proza = pakiet_nn._podstawienie_swz(908.0, nierozstrzygalne)
    assert proza == r"$$\text{próg Ia\_gG umowny}$$"
