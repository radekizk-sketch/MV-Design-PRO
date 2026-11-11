"""Kontrakt ``CIAGI_LINIOWE`` (rejestr operacji) = operacje, których handler zapisuje ``line_runs``.

Deklaracja bez testu = fałszywa pewność: słownik ``domain/canonical_operations.py::CIAGI_LINIOWE``
opisuje w dokumencie kontraktu, które operacje zmieniają ciągi liniowe. Ten test wyprowadza ten
zbiór z kodu (analiza AST handlerów ``enm/**`` przechodnio przez wywołania funkcji) i porównuje
w obu kierunkach. Funkcje ``enm/**`` dotykające ``line_runs`` są sklasyfikowane w całości
(zapis / odczyt / poza operacjami) — nowa funkcja bez klasyfikacji czerwieni test.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest
from domain.canonical_operations import CANONICAL_OPERATIONS, CIAGI_LINIOWE

from tests.ci.odczyty_ladunku_handlerow import AnalizaEnm, handlery

_ENM = Path(__file__).resolve().parents[2] / "src" / "enm"

#: Funkcje ZAPISUJĄCE ciągi liniowe (zakładają ciąg, dopisują albo podmieniają odcinki).
ZAPISUJACE: frozenset[str] = frozenset(
    {
        "_ensure_line_run_for_corridor",
        "_append_line_run_segment",
        "_podziel_odcinek_w_widokach",
        "_usun_z_ciagow",
    }
)

#: Funkcje dotykające ``line_runs`` bez zapisu skutku operacji — z przyczyną.
POZA_ZAPISEM: dict[str, str] = {
    "_line_run_ref_for_segments": "odczyt: ciąg odcinków punktu rozgałęzienia",
    "_nazwa_odcinka_w_ciagu": "odczyt: numer `order` odcinka do nazwy odcinka",
    "_strip_uuids": "odcisk migawki (hash), nie skutek operacji",
    "_kopia_pod_hash": "odcisk migawki (hash), nie skutek operacji",
    "migruj_punkty_podzialu_slownika": "migracja zapisu zastanego (W5-C), nie skutek operacji",
}


@pytest.fixture(scope="module")
def analiza() -> AnalizaEnm:
    return AnalizaEnm(_ENM)


def _dotykajace_ciagow(analiza: AnalizaEnm) -> set[str]:
    """Funkcje ``enm/**`` z napisem ``"line_runs"`` albo z parametrem ``line_run`` (wpis ciągu)."""
    return {
        nazwa
        for (_p, nazwa), fn in analiza.funkcje.items()
        if any(isinstance(w, ast.Constant) and w.value == "line_runs" for w in ast.walk(fn))
        or any(a.arg == "line_run" for a in fn.args.args)
    }


def operacje_zapisujace_ciagi(analiza: AnalizaEnm, zapisujace: frozenset[str]) -> set[str]:
    """Operacje, których handler przechodnio wywołuje funkcję z ``zapisujace``."""
    pamiec: dict[tuple[Path, str], bool] = {}

    def dociera(p: Path, fn: ast.FunctionDef) -> bool:
        klucz = (p, fn.name)
        if klucz in pamiec:
            return pamiec[klucz]
        pamiec[klucz] = False  # cykl nie dokłada zapisu
        wynik = False
        for wezel in ast.walk(fn):
            if not (isinstance(wezel, ast.Call) and isinstance(wezel.func, ast.Name)):
                continue
            if wezel.func.id in zapisujace:
                wynik = True
                break
            cel = analiza.funkcja(p, wezel.func.id)
            if cel is not None and dociera(*cel):
                wynik = True
                break
        pamiec[klucz] = wynik
        return wynik

    return {op for op, (p, fn) in handlery(analiza).items() if dociera(p, fn)}


def test_funkcje_dotykajace_ciagow_sklasyfikowane(analiza: AnalizaEnm) -> None:
    assert _dotykajace_ciagow(analiza) == ZAPISUJACE | set(POZA_ZAPISEM)
    assert all(nazwa in {n for _p, n in analiza.funkcje} for nazwa in ZAPISUJACE)


def test_kontrakt_ciagow_rowny_operacjom_zapisujacym(analiza: AnalizaEnm) -> None:
    assert set(CIAGI_LINIOWE) <= set(CANONICAL_OPERATIONS)
    assert operacje_zapisujace_ciagi(analiza, ZAPISUJACE) == set(CIAGI_LINIOWE)


def test_klucz_ciagu_jest_polem_operacji() -> None:
    for op, skutek in CIAGI_LINIOWE.items():
        assert skutek.opis_pl.strip(), op
        if skutek.klucz_ladunku is not None:
            spec = CANONICAL_OPERATIONS[op]
            assert skutek.klucz_ladunku in spec.required_fields + spec.optional_fields, op


def test_iniekcja_funkcja_zapisujaca_spoza_listy_wykryta(analiza: AnalizaEnm) -> None:
    """Bez ``_usun_z_ciagow`` na liście zapisu usunięcie elementu znika ze zbioru wyprowadzonego
    — rozjazd z kontraktem jest wykryty."""
    bez_usuwania = operacje_zapisujace_ciagi(analiza, ZAPISUJACE - {"_usun_z_ciagow"})
    assert "delete_element" not in bez_usuwania
    assert bez_usuwania != set(CIAGI_LINIOWE)
