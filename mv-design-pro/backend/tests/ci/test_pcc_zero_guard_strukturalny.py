"""Pin sprawdzenia strukturalnego `pcc_zero_guard` (G-15(a), ADR-027, karta ZAPIS-DECYZJI 2026-09-30).

INTENCJA. Do 2026-09-30 guard pilnował wyłącznie LITERAŁU „PCC" w `backend/src`.
ADR-027 (ACCEPTED, O-60) wprowadza obiekt umowny `GridConnectionPoint` w warstwie
kontraktowej i utrzymuje zakaz punktu przyłączenia w MODELU FIZYKI (Core Rule 5:
`network_model/core`, `solvers`, `solver_input`, migawka). Sam literał „PCC" nie
chroni przed wstawieniem tej klasy pod nową nazwą — stąd iniekcja strukturalna:
identyfikatory `GridConnectionPoint`/`BoundaryNode` w `network_model/**` albo
`solver_input/**` = czerwony; w `domain/`, `enm/`, `application/` = dozwolone.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"


def _load_script(module_name: str):
    script_path = SCRIPTS_DIR / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load script module: {script_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


guard = _load_script("pcc_zero_guard")


def _plik(root: Path, rel: str, tresc: str) -> None:
    target = root / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(tresc, encoding="utf-8")


def test_model_fizyki_na_head_bez_punktu_przylaczenia() -> None:
    """Stan repozytorium: 0 trafień w network_model/** i solver_input/**."""
    assert guard.scan_physics_model() == []


def test_gridconnectionpoint_w_network_model_core_jest_czerwony(tmp_path: Path) -> None:
    _plik(tmp_path, "network_model/core/punkt.py", "class GridConnectionPoint:\n    pass\n")
    naruszenia = guard.scan_physics_model(tmp_path)
    assert len(naruszenia) == 1
    assert "backend/src/network_model/core/punkt.py:1" in naruszenia[0]


def test_boundarynode_w_solverach_jest_czerwony(tmp_path: Path) -> None:
    _plik(
        tmp_path, "network_model/solvers/x.py", "def f(boundary: 'BoundaryNode'):\n    return 1\n"
    )
    naruszenia = guard.scan_physics_model(tmp_path)
    assert len(naruszenia) == 1
    assert "network_model/solvers/x.py:1" in naruszenia[0]


def test_solver_input_nalezy_do_modelu_fizyki(tmp_path: Path) -> None:
    _plik(tmp_path, "solver_input/assembler.py", "gcp = GridConnectionPoint()\n")
    assert len(guard.scan_physics_model(tmp_path)) == 1


def test_warstwa_kontraktowa_moze_niesc_obiekt_umowny(tmp_path: Path) -> None:
    """domain/, enm/, application/ to warstwa kontraktu — obiekt umowny dozwolony (ADR-027)."""
    _plik(tmp_path, "domain/grid_connection_point.py", "class GridConnectionPoint:\n    pass\n")
    _plik(tmp_path, "enm/models.py", "connection_point: GridConnectionPoint | None = None\n")
    _plik(tmp_path, "analysis/boundary/identifier.py", "class BoundaryNode:\n    pass\n")
    assert guard.scan_physics_model(tmp_path) == []


def test_komentarz_dokumentujacy_zakaz_nie_jest_naruszeniem(tmp_path: Path) -> None:
    """Linia opisująca regułę (kontekst dozwolony) nie zapala guarda — jak dla literału PCC."""
    _plik(
        tmp_path,
        "network_model/core/graph.py",
        "# BoundaryNode is NOT in NetworkModel (analysis only)\n",
    )
    assert guard.scan_physics_model(tmp_path) == []


def test_skan_literalu_pcc_przyjmuje_katalog_parametrem(tmp_path: Path) -> None:
    """Oba skany działają na kopii katalogu, nigdy na żywym drzewie."""
    _plik(tmp_path, "application/x.py", "pcc_bus = 'PCC'\n")
    naruszenia = guard.scan_backend_src(tmp_path)
    assert len(naruszenia) == 1
    assert "backend/src/application/x.py:1" in naruszenia[0]
