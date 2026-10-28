"""Moduł liczby zespolonej w solverach zwarć nie zależy od libm platformy (CI partii zwarć).

Defekt: runner CI ``ubuntu-26.04`` ma glibc w wariancie amd64v3, którego ``hypot`` (jądro
z FMA) różni się o 1 ulp od wariantu bazowego w ok. 12 % argumentów. ``abs()`` liczby
zespolonej woła ``hypot`` z libm, więc ten sam bieg zwarciowy dawał na dwóch maszynach różne
ostatnie bity I_k'' — piny „bit w bit" (odcisk biegu z t_b projektanta, pętla TN) były
czerwone na runnerze, zielone lokalnie. Zmierzone w emulacji: |0,03763 + j0,02416| =
0,044718256898050035 (wariant bazowy, zaokrąglenie poprawne) albo 0,04471825689805004
(amd64v3).

Naprawa: JEDNO źródło modułu (`network_model.core.modul_zespolony`, ``math.hypot`` —
algorytm CPython na działaniach IEEE 754). Ten moduł przypina wartość, przypadki brzegowe
i ZAMKNIĘTĄ listę wywołań ``abs()`` w plikach rodziny zwarć — nowe ``abs()`` na liczbie
zespolonej w tych plikach jest czerwone, dopóki nie przejdzie przez `modul_zespolony`.
"""

from __future__ import annotations

import ast
import math
from pathlib import Path

import numpy as np
import pytest
from network_model.core.modul_zespolony import modul_zespolony

_NETWORK_MODEL = Path(__file__).resolve().parents[2] / "src" / "network_model"

#: Pliki rodziny zwarć i pętli zwarcia, których moduły liczb zespolonych idą do wyników
#: i odcisków (rdzeń IEC 60909, wkłady źródeł, niesymetryczne, maszyny, pętla TN/TT/IT,
#: budowniczy macierzy Y i modele maszyn — białe skrzynki ``z_abs_ohm``).
PLIKI_RODZINY_ZWARC: tuple[str, ...] = (
    "core/machine.py",
    "core/ybus.py",
    "solvers/fault_loop_builder.py",
    "solvers/fault_loop_iec60364.py",
    "solvers/machine_sc_iec60909.py",
    "solvers/petla_zwarcia_tt_it.py",
    "solvers/short_circuit_asymmetrical_quantities.py",
    "solvers/short_circuit_contributions.py",
    "solvers/short_circuit_core.py",
    "solvers/short_circuit_iec60909.py",
)

#: Wywołania ``abs()`` dozwolone w tych plikach — ZAMKNIĘTE (plik, tekst wywołania, rola).
#: Rola ``== 0`` — wywołanie jest wyłącznie stroną porównania z zerem (zero nie zależy od
#: implementacji ``hypot``); rola ``rzeczywista`` — moduł liczby RZECZYWISTEJ (bez ``hypot``).
#: To samo wywołanie użyte jako wartość (np. dzielnik) zmienia rolę i czerwieni test.
DOZWOLONE_ABS: frozenset[tuple[str, str, str]] = frozenset(
    {
        ("core/ybus.py", "abs(z_internal_ohm)", "== 0"),
        ("solvers/machine_sc_iec60909.py", "abs(z_internal_ohm)", "== 0"),
        (
            "solvers/machine_sc_iec60909.py",
            "abs(wezel.wartosc_surowa - wezel.wartosc)",
            "rzeczywista",
        ),
        ("solvers/short_circuit_contributions.py", "abs(maszyna.z_internal_ohm)", "== 0"),
        ("solvers/short_circuit_contributions.py", "abs(prad_a)", "rzeczywista"),
        ("solvers/short_circuit_core.py", "abs(z_equiv)", "== 0"),
        ("solvers/short_circuit_core.py", "abs(denominator)", "== 0"),
        ("solvers/short_circuit_core.py", "abs(ln_term)", "rzeczywista"),
        ("solvers/short_circuit_iec60909.py", "abs(value.imag)", "rzeczywista"),
    }
)
_FUNKCJE_MODULU = {"abs", "np.abs", "numpy.abs", "np.absolute", "cmath.polar", "np.hypot"}


def test_wartosc_poprawnie_zaokraglona_jak_w_pinach() -> None:
    """Wartość z pinu pętli TN (`test_petla_tn_tozsamosc_w5e_ttit`) — poprawnie
    zaokrąglona, ta sama na każdej platformie."""
    assert modul_zespolony(complex(0.03763, 0.02416)) == 0.044718256898050035


@pytest.mark.parametrize(
    "z",
    [
        0j,
        complex(-0.0, -0.0),
        complex(3.0, 4.0),
        complex(-3.0, 4.0),
        complex(3.0, -4.0),
        complex(1e308, 1e308),
        complex(5e-324, 5e-324),
        complex(0.1, 0.2),
        np.complex128(0.03763 + 0.02416j),
    ],
)
def test_rowny_math_hypot_i_bez_przepelnienia(z: complex) -> None:
    wynik = modul_zespolony(z)
    assert wynik == math.hypot(z.real, z.imag)
    assert isinstance(wynik, float) and not isinstance(wynik, np.floating)
    assert math.isfinite(wynik) and wynik >= 0.0
    assert wynik == pytest.approx(abs(complex(z)), rel=4.5e-16)


def test_nieskonczonosc_i_nan_jak_abs() -> None:
    assert modul_zespolony(complex(math.inf, math.nan)) == math.inf
    assert math.isnan(modul_zespolony(complex(math.nan, 1.0)))


def _porownanie_z_zerem(rodzic: ast.AST | None, wezel: ast.AST) -> bool:
    if not isinstance(rodzic, ast.Compare) or len(rodzic.comparators) != 1:
        return False
    strony = [rodzic.left, rodzic.comparators[0]]
    if wezel not in strony or not isinstance(rodzic.ops[0], ast.Eq | ast.NotEq):
        return False
    druga = strony[1 - strony.index(wezel)]
    return isinstance(druga, ast.Constant) and druga.value == 0


def _wywolania_modulu(plik: str) -> set[tuple[str, str, str]]:
    drzewo = ast.parse((_NETWORK_MODEL / plik).read_text(encoding="utf-8"))
    rodzice = {dziecko: w for w in ast.walk(drzewo) for dziecko in ast.iter_child_nodes(w)}
    return {
        (
            plik,
            ast.unparse(wezel),
            "== 0" if _porownanie_z_zerem(rodzice.get(wezel), wezel) else "rzeczywista",
        )
        for wezel in ast.walk(drzewo)
        if isinstance(wezel, ast.Call) and ast.unparse(wezel.func) in _FUNKCJE_MODULU
    }


def test_lista_wywolan_abs_w_rodzinie_zwarc_jest_zamknieta() -> None:
    znalezione = {w for plik in PLIKI_RODZINY_ZWARC for w in _wywolania_modulu(plik)}
    assert znalezione == DOZWOLONE_ABS, (
        "nowe/zniknięte abs() w rodzinie zwarć — moduł liczby zespolonej tylko przez "
        f"modul_zespolony: nadmiar {sorted(znalezione - DOZWOLONE_ABS)}, "
        f"brak {sorted(DOZWOLONE_ABS - znalezione)}"
    )


def test_jedyna_definicja_modulu_jest_w_module_lisciowym() -> None:
    """Jedno źródło: żaden plik rodziny nie definiuje własnego pomocnika z ``hypot``."""
    for plik in PLIKI_RODZINY_ZWARC:
        tekst = (_NETWORK_MODEL / plik).read_text(encoding="utf-8")
        assert "hypot(" not in tekst.replace("``hypot``", ""), plik
    drzewo = ast.parse((_NETWORK_MODEL / "core/modul_zespolony.py").read_text(encoding="utf-8"))
    importy = [w for w in ast.walk(drzewo) if isinstance(w, ast.Import | ast.ImportFrom)]
    assert {ast.unparse(w) for w in importy} == {
        "from __future__ import annotations",
        "import math",
    }
