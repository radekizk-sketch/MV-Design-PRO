"""Testy własne guarda jednej implementacji topologii (CV-4.3)."""

from __future__ import annotations

import ast
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))

from topology_single_impl_guard import (  # noqa: E402
    ALLOWLIST,
    BACKEND_SRC,
    DOM,
    ZASTANE,
    porownaj_z_zapadka,
    zlicz_wzorce,
    zmierz,
)


@pytest.mark.parametrize(
    ("kod", "oczekiwane"),
    [
        ("from collections import deque\nq = deque([1])\n", {"deque": 1}),
        (
            "import networkx as nx\nc = list(nx.connected_components(g))\n",
            {"nx.connected_components": 1},
        ),
        (
            "import networkx as nx\nnx.is_connected(g); nx.bfs_tree(g, 1); nx.dfs_edges(g)\n",
            {"nx.bfs_tree": 1, "nx.dfs_edges": 1, "nx.is_connected": 1},
        ),
        ("queue = [1]\nwhile queue:\n    x = queue.pop(0)\n", {"kolejka.pop(0)": 1}),
        (
            "kolejka = [1]\nkolejka.pop(0)\nlista = [1]\nlista.pop(0)\nkolejka.pop()\n",
            {"kolejka.pop(0)": 1},
        ),
        ("class _UnionFind:\n    pass\n", {"union-find": 1}),
        (
            "class Scalanie:\n    def find(self, x):\n        return x\n    def union(self, a, b):\n        pass\n",
            {"union-find": 1},
        ),
        ("class Cos:\n    def find(self, x):\n        return x\n", {}),
        ("x = 'deque(' + 'nx.connected_components'\n", {}),
    ],
)
def test_licznik_rozpoznaje_wzorce_przegladu_a_nie_napisy(
    kod: str, oczekiwane: dict[str, int]
) -> None:
    assert zlicz_wzorce(ast.parse(kod)) == oczekiwane


def test_zapadka_nowy_plik_i_wzrost_to_dlug_urosl() -> None:
    bledy = porownaj_z_zapadka({"a.py": {"deque": 1}, "b.py": {"deque": 2}}, {"b.py": {"deque": 1}})
    assert [b.split("]")[0] + "]" for b in bledy] == ["[dlug-urosl]", "[dlug-urosl]"]


def test_zapadka_spadek_i_znikniecie_to_dlug_zmalal() -> None:
    bledy = porownaj_z_zapadka({"b.py": {"deque": 1}}, {"a.py": {"deque": 1}, "b.py": {"deque": 2}})
    assert sorted(b.split("]")[0] + "]" for b in bledy) == ["[dlug-zmalal]", "[dlug-zmalal]"]
    assert porownaj_z_zapadka({"b.py": {"deque": 1}}, {"b.py": {"deque": 1}}) == []


def test_dom_i_allowlist_wylaczone_z_pomiaru_ale_dom_naprawde_jest_jadrem(tmp_path: Path) -> None:
    (tmp_path / "network_model" / "core").mkdir(parents=True)
    (tmp_path / "network_model" / "solvers").mkdir(parents=True)
    (tmp_path / "network_model" / "core" / "topologia.py").write_text(
        "from collections import deque\nq = deque()\n", encoding="utf-8"
    )
    (tmp_path / "network_model" / "solvers" / "power_flow_newton_internal.py").write_text(
        "from collections import deque\nq = deque()\n", encoding="utf-8"
    )
    (tmp_path / "inny.py").write_text(
        "from collections import deque\nq = deque()\n", encoding="utf-8"
    )
    assert zmierz(tmp_path) == {"inny.py": {"deque": 1}}
    jadro = ast.parse((BACKEND_SRC / DOM).read_text(encoding="utf-8"))
    assert (
        zlicz_wzorce(jadro).get("deque", 0) >= 1 and zlicz_wzorce(jadro).get("union-find", 0) >= 1
    )
    assert all((BACKEND_SRC / plik).exists() for plik in ALLOWLIST)


def test_pin_stanu_repozytorium() -> None:
    """Zapadka = pomiar (obie strony). Wzrost = własna topologia poza jądrem; spadek =
    obniż ZASTANE (docelowo puste — wpisy to sieci referencyjne kasowane w CV-4.3 K2)."""
    assert porownaj_z_zapadka(zmierz(), ZASTANE) == []
    assert set(ZASTANE) <= {
        "application/reference_networks/sld_network_model.py",
        "application/reference_networks/sld_substrate_power_flow.py",
    }
