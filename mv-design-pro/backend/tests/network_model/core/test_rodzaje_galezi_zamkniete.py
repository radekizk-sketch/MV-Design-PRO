"""Rodzaje gałęzi modelu fizycznego — zamknięty komplet klas i odwzorowań.

Gałęzie ``AssertionError`` (błąd programu) w ``Branch.from_dict`` i w admitancji gałęzi
``core/ybus.py`` są nieosiągalne, dopóki każdy rodzaj ``BranchType`` ma klasę gałęzi, a każda
klasa gałęzi ma gałąź admitancji. Nowy rodzaj albo nowa podklasa ``Branch`` czerwieni ten test,
zanim trafi do rachunku.
"""

from __future__ import annotations

import ast
from pathlib import Path

from network_model.core.branch import Branch, BranchType, LineBranch, TransformerBranch

YBUS = Path(__file__).resolve().parents[3] / "src" / "network_model" / "core" / "ybus.py"


def _podklasy(klasa: type) -> set[type]:
    wynik: set[type] = set()
    for podklasa in klasa.__subclasses__():
        wynik |= {podklasa, *_podklasy(podklasa)}
    return wynik


def test_kazdy_rodzaj_galezi_ma_klase_i_admitancje() -> None:
    assert set(BranchType) == {BranchType.LINE, BranchType.CABLE, BranchType.TRANSFORMER}
    assert _podklasy(Branch) == {LineBranch, TransformerBranch}
    klasy_w_admitancji = {
        wezel.args[1].id
        for wezel in ast.walk(ast.parse(YBUS.read_text(encoding="utf-8")))
        if isinstance(wezel, ast.Call)
        and getattr(wezel.func, "id", "") == "isinstance"
        and isinstance(wezel.args[1], ast.Name)
        and wezel.args[1].id.endswith("Branch")
    }
    assert {"LineBranch", "TransformerBranch"} <= klasy_w_admitancji
