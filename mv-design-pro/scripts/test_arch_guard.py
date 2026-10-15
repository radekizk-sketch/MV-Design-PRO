"""Samotest `arch_guard` — reguła solverów fizycznych w warstwie analizy.

KARTA TORY-TYLKO-W-TESTACH (2026-09-30). Reguła `FORBIDDEN_IMPORTS["analysis"] =
("solvers",)` dopasowywała pakiet dyspozycji `backend/src/solvers/**`, więc import
i wywołanie `network_model.solvers.*` w `backend/src/analysis/**` przechodziły
z konstrukcji — w warstwie interpretacji żył adapter wołający solver NR. Każda iniekcja
poniżej jest wykonywana na drzewie w `tmp_path` przez `main()` (kod wyjścia), a nie
tylko przez funkcję pomocniczą.

ILOCZYN CECH: {forma dostępu: `from moduł import nazwa`, `import moduł`, `import moduł as`,
`from pakiet import solvers`, `*`, import dynamiczny napisem (`importlib.import_module`,
`__import__`), import pod `TYPE_CHECKING`} × {moduł solvera: z listy zamkniętej / spoza
listy} × {nazwa: z listy / spoza listy} × {miejsce: kod produktu `src/analysis/**`,
test `tests/analysis/**`}. Pary zielone (typ z listy w kodzie produktu, solver w teście)
pilnują, że reguła nie czerwieni formy poprawnej.
"""

from __future__ import annotations

import ast
import sys
from pathlib import Path

import pytest

KATALOG_SKRYPTOW = Path(__file__).resolve().parent
sys.path.insert(0, str(KATALOG_SKRYPTOW))

import arch_guard  # noqa: E402
from importy_ast import modul_bazowy, pakiet_pliku  # noqa: E402

WYWOLANIE_NR = (
    "from network_model.solvers.power_flow_newton import PowerFlowNewtonSolver\n\n\n"
    "def policz(pf_input):\n"
    "    return PowerFlowNewtonSolver().solve(pf_input)\n"
)

SCENARIUSZE: list[tuple[str, str, str, bool]] = [
    # (nazwa, ścieżka względem backend/, treść, czy RC=1)
    (
        "import-i-wywolanie-solvera-nr",
        "src/analysis/rozplyw/adapter.py",
        WYWOLANIE_NR,
        True,
    ),
    (
        "import-modulu-solvera",
        "src/analysis/rozplyw/adapter.py",
        "import network_model.solvers.power_flow_newton\n\n"
        "r = network_model.solvers.power_flow_newton.PowerFlowNewtonSolver().solve(x)\n",
        True,
    ),
    (
        "import-modulu-z-listy-z-aliasem",
        "src/analysis/rozplyw/adapter.py",
        "import network_model.solvers.power_flow_result as w\n\n"
        "r = w.build_power_flow_result_v1(x)\n",
        True,
    ),
    (
        "pakiet-solverow-z-pakietu",
        "src/analysis/zwarcia/m.py",
        "from network_model import solvers\n\n"
        "r = solvers.short_circuit_iec60909.ShortCircuitIEC60909Solver"
        ".compute_3ph_short_circuit(g, n)\n",
        True,
    ),
    (
        "funkcja-z-modulu-z-listy",
        "src/analysis/rozplyw/m.py",
        "from network_model.solvers.power_flow_result import build_power_flow_result_v1\n",
        True,
    ),
    (
        "gwiazdka-z-modulu-z-listy",
        "src/analysis/rozplyw/m.py",
        "from network_model.solvers.power_flow_types import *  # noqa: F403\n",
        True,
    ),
    (
        "typ-z-modulu-spoza-listy",
        "src/analysis/zwarcia/m.py",
        "from network_model.solvers.machine_sc_iec60909 import MachineShortCircuitResult\n",
        True,
    ),
    (
        "import-dynamiczny-importlib",
        "src/analysis/rozplyw/m.py",
        "import importlib\n\n"
        "nr = importlib.import_module('network_model.solvers.power_flow_newton')\n"
        "r = nr.PowerFlowNewtonSolver().solve(x)\n",
        True,
    ),
    (
        "import-dynamiczny-dunder",
        "src/analysis/rozplyw/m.py",
        "nr = __import__('network_model.solvers.power_flow_newton')\n",
        True,
    ),
    (
        "import-pod-type-checking-spoza-listy",
        "src/analysis/rozplyw/m.py",
        "from typing import TYPE_CHECKING\n\n"
        "if TYPE_CHECKING:\n"
        "    from network_model.solvers.power_flow_newton import PowerFlowNewtonSolution\n",
        True,
    ),
    # Pary zielone.
    (
        "typy-z-listy-w-kodzie-produktu",
        "src/analysis/rozplyw/m.py",
        "from network_model.solvers.power_flow_result import PowerFlowResultV1\n"
        "from network_model.solvers.power_flow_types import PowerFlowInput, PQSpec\n",
        False,
    ),
    ("solver-w-tescie-analizy", "tests/analysis/test_m.py", WYWOLANIE_NR, False),
    (
        "import-dynamiczny-innego-modulu",
        "src/analysis/rozplyw/m.py",
        "import importlib\n\nm = importlib.import_module('analysis.normative')\n",
        False,
    ),
]


def _drzewo(korzen: Path, wzgledna: str, tresc: str) -> Path:
    backend = korzen / "backend"
    sciezka = backend / wzgledna
    sciezka.parent.mkdir(parents=True, exist_ok=True)
    katalog = sciezka.parent
    while katalog not in (backend, backend / "src", backend / "tests"):
        (katalog / "__init__.py").touch()
        katalog = katalog.parent
    sciezka.write_text(tresc, encoding="utf-8")
    return backend


@pytest.mark.parametrize(("nazwa", "wzgledna", "tresc", "czerwien"), SCENARIUSZE)
def test_iniekcja_przez_main(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    nazwa: str,
    wzgledna: str,
    tresc: str,
    czerwien: bool,
) -> None:
    _drzewo(tmp_path, wzgledna, tresc)
    monkeypatch.setattr(arch_guard, "REPO_ROOT", tmp_path)

    rc = arch_guard.main()

    wyjscie = capsys.readouterr()
    assert rc == (1 if czerwien else 0), (nazwa, wyjscie.out, wyjscie.err)
    if czerwien:
        assert "ARCH-GUARD VIOLATION" in wyjscie.err
        assert "network_model" in wyjscie.err


def test_skasowany_adapter_rozplywu_bylby_czerwony(tmp_path: Path) -> None:
    """Regresja instancji z karty: treść dawnego `analysis/power_flow/solver.py`
    (import `PowerFlowNewtonSolver` i `.solve()` w warstwie interpretacji)."""
    backend = _drzewo(tmp_path, "src/analysis/power_flow/solver.py", WYWOLANIE_NR)

    naruszenie = arch_guard._scan_file(backend / "src/analysis/power_flow/solver.py", backend)

    assert naruszenie is not None
    assert "network_model.solvers.power_flow_newton" in naruszenie[1]


def _importy_solverow_w_analizie() -> dict[str, set[str]]:
    """Pomiar na żywym drzewie: moduł solvera → nazwy sprowadzane przez `src/analysis/**`."""
    src = arch_guard.REPO_ROOT / "backend" / "src"
    zmierzone: dict[str, set[str]] = {}
    for plik in sorted((src / "analysis").rglob("*.py")):
        pakiet = pakiet_pliku(plik, src)
        for wezel in ast.walk(ast.parse(plik.read_text(encoding="utf-8"))):
            if isinstance(wezel, ast.ImportFrom):
                baza = modul_bazowy(pakiet, wezel)
                if baza == "network_model.solvers" or baza.startswith("network_model.solvers."):
                    zmierzone.setdefault(baza, set()).update(a.name for a in wezel.names)
    return zmierzone


def test_lista_dozwolona_bez_martwych_wpisow() -> None:
    """Lista zamknięta = dokładnie to, co warstwa analizy dziś sprowadza (pomiar AST).

    Wpis bez importera to martwy wyjątek (przyszły import dostałby zgodę bez decyzji);
    import spoza listy zaczerwieniłby `main()` na żywym drzewie."""
    zmierzone = _importy_solverow_w_analizie()

    assert zmierzone == {
        modul: set(nazwy) for modul, nazwy in arch_guard.ANALIZA_DOZWOLONE_Z_SOLVEROW.items()
    }


def test_zywe_drzewo_zielone() -> None:
    assert arch_guard.main() == 0
