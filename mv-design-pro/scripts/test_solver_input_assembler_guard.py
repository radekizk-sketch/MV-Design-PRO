"""Testy własne `solver_input_assembler_guard.py` (CV-4.1): licznik AST × zapadka w obie
strony × wyłączenia (dom, allowlist) × pin stanu repozytorium."""

from __future__ import annotations

import ast
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import solver_input_assembler_guard as guard  # noqa: E402


@pytest.mark.parametrize("nazwa", guard.NAZWY)
def test_licznik_widzi_kazdy_konstruktor_prosty_i_atrybutowy(nazwa: str) -> None:
    kod = f"x = {nazwa}(a=1)\ny = m.{nazwa}(b=2)\n"
    assert guard.zlicz_konstrukcje(ast.parse(kod)) == {nazwa: 2}


def test_licznik_nie_liczy_nazwy_bez_wywolania_ani_tekstu() -> None:
    kod = 'z = PowerFlowInput\ns = "PowerFlowInput("\n# PQSpec(\ndef f(x: PVSpec) -> None: ...\n'
    assert guard.zlicz_konstrukcje(ast.parse(kod)) == {}


def test_licznik_liczy_zagniezdzone_i_w_listach() -> None:
    kod = "pf = PowerFlowInput(slack=SlackSpec(node_id='a'), pq=[PQSpec(node_id=n) for n in ns])\n"
    assert guard.zlicz_konstrukcje(ast.parse(kod)) == {
        "PQSpec": 1,
        "PowerFlowInput": 1,
        "SlackSpec": 1,
    }


def test_zapadka_nowy_plik_to_dlug_urosl() -> None:
    bledy = guard.porownaj_z_zapadka({"application/x.py": {"PowerFlowInput": 1}}, {})
    assert len(bledy) == 1 and bledy[0].startswith("[dlug-urosl] application/x.py")


def test_zapadka_wzrost_liczby_to_dlug_urosl() -> None:
    bledy = guard.porownaj_z_zapadka({"a.py": {"PQSpec": 3}}, {"a.py": {"PQSpec": 2}})
    assert bledy == [
        "[dlug-urosl] a.py: PQSpec 2 -> 3 — konstrukcja kontraktu wejścia poza assemblerem"
    ]


def test_zapadka_spadek_i_znikniecie_pliku_to_dlug_zmalal() -> None:
    bledy = guard.porownaj_z_zapadka(
        {"a.py": {"PQSpec": 1}}, {"a.py": {"PQSpec": 2}, "b.py": {"SlackSpec": 1}}
    )
    assert [b.split("]")[0] for b in bledy] == ["[dlug-zmalal", "[dlug-zmalal"]


def test_zapadka_rownosc_bez_bledow() -> None:
    assert guard.porownaj_z_zapadka({"a.py": {"PQSpec": 2}}, {"a.py": {"PQSpec": 2}}) == []


def test_dom_i_allowlist_wylaczone_z_pomiaru_ale_dom_naprawde_buduje(tmp_path: Path) -> None:
    src = tmp_path / "src"
    (src / "enm").mkdir(parents=True)
    (src / "network_model" / "solvers").mkdir(parents=True)
    (src / "application").mkdir()
    (src / "enm" / "assembler.py").write_text("pf = PowerFlowInput()\n", encoding="utf-8")
    (src / "network_model" / "solvers" / "power_flow_gauss_seidel.py").write_text(
        "pf = PowerFlowInput()\n", encoding="utf-8"
    )
    (src / "application" / "x.py").write_text("pf = SlackSpec()\n", encoding="utf-8")
    assert guard.zmierz(src) == {"application/x.py": {"SlackSpec": 1}}
    prawdziwy_dom = ast.parse((guard.BACKEND_SRC / guard.DOM).read_text(encoding="utf-8"))
    assert guard.zlicz_konstrukcje(prawdziwy_dom)["PowerFlowInput"] >= 1


def test_pin_stanu_repozytorium() -> None:
    """Pin: pomiar == ZASTANE (2026-09-05, po CV-4.1 krok 1). Każde nowe trafienie =
    czerwone CI; każda kasacja budowniczego (CV-4.2/4.3) = obniż zapadkę."""
    pomiar = guard.zmierz()
    assert pomiar == guard.ZASTANE
    assert sum(sum(v.values()) for v in pomiar.values()) == 31
    assert guard.main([]) == 0
