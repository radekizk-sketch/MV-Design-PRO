"""Kompletność rejestru LaTeX wzorów śladu NC RfG (`application/ncrfg_compliance/wzory_sladu.py`).

Zbiór zapisów wzorów, które rdzeń może postawić w `NcRfgTraceStep.formula`, jest wyprowadzany
z AST rdzenia (drugi argument pozycyjny każdego `trace.add(`), z rozwinięciem OBU gałęzi
wyrażeń warunkowych i sklejeń — nie z biegu jednej sceny, więc krok, którego żadna scena
testowa nie wywołuje, też musi mieć wpis. Równość zbiorów w obie strony: brak wpisu = krok bez
KaTeX na ekranie, wpis martwy = rejestr udaje wzór, którego rdzeń nie stawia.
"""

from __future__ import annotations

import ast
import itertools
import re
from pathlib import Path

import pytest
from api.main import app
from application.ncrfg_compliance.wzory_sladu import WZORY_SLADU_LATEX, wzor_sladu_latex
from fastapi.testclient import TestClient

RDZEN = (
    Path(__file__).resolve().parents[3]
    / "src"
    / "network_model"
    / "solvers"
    / "ncrfg_ptpiree"
    / "engine.py"
)


def _warianty(wezel: ast.expr) -> list[str]:
    """Wszystkie teksty, które wyrażenie może dać (stałe, sklejenia `+`, obie gałęzie `if`)."""
    if isinstance(wezel, ast.Constant) and isinstance(wezel.value, str):
        return [wezel.value]
    if isinstance(wezel, ast.BinOp) and isinstance(wezel.op, ast.Add):
        return [a + b for a, b in itertools.product(_warianty(wezel.left), _warianty(wezel.right))]
    if isinstance(wezel, ast.IfExp):
        return _warianty(wezel.body) + _warianty(wezel.orelse)
    raise AssertionError(f"Wzór śladu nie jest wyrażeniem stałym: {ast.unparse(wezel)}")


def _zapisy_wzorow_rdzenia() -> set[str]:
    drzewo = ast.parse(RDZEN.read_text(encoding="utf-8"))
    zapisy: set[str] = set()
    for wezel in ast.walk(drzewo):
        if (
            isinstance(wezel, ast.Call)
            and isinstance(wezel.func, ast.Attribute)
            and wezel.func.attr == "add"
            and "trace" in ast.unparse(wezel.func.value)
        ):
            zapisy.update(_warianty(wezel.args[2]))
    return zapisy


def test_kazdy_wzor_rdzenia_ma_latex_i_rejestr_nie_ma_wpisow_martwych() -> None:
    zapisy = _zapisy_wzorow_rdzenia()
    assert len(zapisy) >= 14  # 13 wywołań, jedno z dwiema gałęziami (LVRT/HVRT)
    assert zapisy - set(WZORY_SLADU_LATEX) == set()
    assert set(WZORY_SLADU_LATEX) - zapisy == set()


@pytest.mark.parametrize("zapis", sorted(WZORY_SLADU_LATEX))
def test_latex_wpisu_jest_niepusty_i_bez_znakow_spoza_latex(zapis: str) -> None:
    latex = wzor_sladu_latex(zapis)
    assert latex
    # Symbol zapisany Unicode zamiast LaTeX (≤, ≥, ∀, φ, Δ) poza \text{} to zapis spłaszczony.
    bez_tekstu = re.sub(r"\\text\{[^}]*\}", "", latex)
    for znak in "≤≥∀∨∧¬φΔ·−":
        assert znak not in bez_tekstu, (zapis, znak)


def test_wzor_spoza_rejestru_daje_none() -> None:
    assert wzor_sladu_latex("x ≤ y") is None


def test_katalog_testow_wydaje_rejestr_wzorow() -> None:
    odpowiedz = TestClient(app).get("/api/ncrfg-tests/catalog")
    assert odpowiedz.status_code == 200
    assert odpowiedz.json()["wzory_sladu_latex"] == dict(WZORY_SLADU_LATEX)
