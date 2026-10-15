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

    naruszenie = arch_guard._scan_file(
        backend / "src/analysis/power_flow/solver.py", backend
    )

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
                if baza == "network_model.solvers" or baza.startswith(
                    "network_model.solvers."
                ):
                    zmierzone.setdefault(baza, set()).update(
                        a.name for a in wezel.names
                    )
    return zmierzone


def test_lista_dozwolona_bez_martwych_wpisow() -> None:
    """Lista zamknięta = dokładnie to, co warstwa analizy dziś sprowadza (pomiar AST).

    Wpis bez importera to martwy wyjątek (przyszły import dostałby zgodę bez decyzji);
    import spoza listy zaczerwieniłby `main()` na żywym drzewie."""
    zmierzone = _importy_solverow_w_analizie()

    assert zmierzone == {
        modul: set(nazwy)
        for modul, nazwy in arch_guard.ANALIZA_DOZWOLONE_Z_SOLVEROW.items()
    }


def test_zywe_drzewo_zielone() -> None:
    assert arch_guard.main() == 0


# =============================================================================
# KARTA TORY-POPRAWKI (2026-09-30): reguła po DOSTĘPIE, nie po ścieżce importu.
#
# Przegląd adwersarzowy wykazał, że pierwsza wersja reguły pilnowała ścieżki
# `network_model.solvers…`, a solver był osiągalny bokiem. Każda forma poniżej jest
# wstrzykiwana do KOPII REALNEGO drzewa `backend/src` (reeksporty, gorliwe `__init__`,
# alias `src` są prawdziwe) i sprawdzana przez `main()` (kod wyjścia).
#
# ILOCZYN CECH: {droga do obiektu: import statyczny wiążący pakiet-przodka, reeksport
# symbolu przez moduł produktu, obiekt modułu reeksportującego, obiekt pakietu przez
# podmoduł, alias pakietu `src`, łańcuch atrybutów, przypisanie/dziedziczenie w module
# reeksportującym, import dynamiczny (`importlib.import_module`, `from importlib import
# import_module`, `__import__`) × {nazwa stała, `name=`, `package=`/`level=` względnie,
# `fromlist`, konkatenacja, f-string, nazwa nie-stała, alias funkcji, `getattr`},
# refleksja (`sys.modules`, moduły refleksji, `__globals__`, `eval`)} × {miejsce: poziom
# modułu, ciało funkcji, `TYPE_CHECKING`} × {cel: obiekt solvera spoza listy / typ z listy
# (para zielona) / moduł spoza solverów (para zielona)}.
# =============================================================================

import shutil  # noqa: E402

PRAWDZIWY_SRC = arch_guard.REPO_ROOT / "backend" / "src"


@pytest.fixture(scope="module")
def kopia_drzewa(tmp_path_factory: pytest.TempPathFactory) -> Path:
    korzen = tmp_path_factory.mktemp("realne_drzewo")
    shutil.copytree(
        PRAWDZIWY_SRC,
        korzen / "backend" / "src",
        ignore=shutil.ignore_patterns("__pycache__", "*.pyc"),
    )
    return korzen


def _main_z_iniekcja(
    korzen: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    pliki: dict[str, str],
) -> tuple[int, str]:
    src = korzen / "backend" / "src"
    zapisane: list[Path] = []
    try:
        for wzgledna, tresc in pliki.items():
            sciezka = src / wzgledna
            assert not sciezka.exists(), sciezka
            sciezka.parent.mkdir(parents=True, exist_ok=True)
            sciezka.write_text(tresc, encoding="utf-8")
            zapisane.append(sciezka)
        monkeypatch.setattr(arch_guard, "REPO_ROOT", korzen)
        rc = arch_guard.main()
    finally:
        for sciezka in zapisane:
            sciezka.unlink()
    wyjscie = capsys.readouterr()
    return rc, wyjscie.out + wyjscie.err


INIEKCJA = "analysis/voltage_profile/_iniekcja_testowa.py"

DOSTEP_CZERWONE: list[tuple[str, dict[str, str]]] = [
    # --- punkt 2(a): pakiet-przodek solverów związany legalnym importem ---
    (
        "import-core-wiaze-network-model-i-lancuch",
        {
            INIEKCJA: "import network_model.core.graph\n"
            "from network_model.solvers.power_flow_types import PowerFlowInput\n\n\n"
            "def f(x: PowerFlowInput):\n"
            "    return network_model.solvers.power_flow_newton.PowerFlowNewtonSolver()"
            ".solve(x)\n"
        },
    ),
    ("import-core-bez-aliasu", {INIEKCJA: "import network_model.core.graph\n"}),
    (
        "lancuch-atrybutow-bez-importu",
        {
            INIEKCJA: "def f(network_model):\n    return network_model.solvers.power_flow_newton\n"
        },
    ),
    # --- punkt 2(b): reeksport ---
    (
        "reeksport-klasy-solvera-nr",
        {INIEKCJA: "from enm.canonical_analysis import PowerFlowNewtonSolver\n"},
    ),
    (
        "reeksport-funkcji-oltc",
        {INIEKCJA: "from enm.canonical_analysis import solve_with_oltc\n"},
    ),
    (
        "reeksport-solvera-fazowego",
        {INIEKCJA: "from enm.canonical_analysis import PhaseStateSNSolver as S\n"},
    ),
    (
        "reeksport-solvera-v126",
        {INIEKCJA: "from enm.canonical_analysis import V126AcademicSolver\n"},
    ),
    (
        "reeksport-w-ciele-funkcji",
        {
            INIEKCJA: "def f(g):\n"
            "    from enm.canonical_analysis import solve_with_oltc\n\n"
            "    return solve_with_oltc(g)\n"
        },
    ),
    (
        "reeksport-pod-type-checking",
        {
            INIEKCJA: "from typing import TYPE_CHECKING\n\n"
            "if TYPE_CHECKING:\n"
            "    from enm.canonical_analysis import PowerFlowNewtonSolver\n"
        },
    ),
    (
        "obiekt-modulu-reeksportujacego",
        {INIEKCJA: "from enm import canonical_analysis\n"},
    ),
    ("obiekt-pakietu-wiazania", {INIEKCJA: "from application import solvers\n"}),
    (
        "reeksport-przez-przypisanie-instancji",
        {
            "enm/_iniekcja_reeksport.py": "from network_model.solvers.power_flow_newton import "
            "PowerFlowNewtonSolver\n\nSOLVER = PowerFlowNewtonSolver()\n",
            INIEKCJA: "from enm._iniekcja_reeksport import SOLVER\n",
        },
    ),
    (
        "reeksport-przez-dziedziczenie",
        {
            "enm/_iniekcja_reeksport.py": "from network_model.solvers.power_flow_newton import "
            "PowerFlowNewtonSolver\n\n\nclass Rozplyw(PowerFlowNewtonSolver):\n    pass\n",
            INIEKCJA: "from enm._iniekcja_reeksport import Rozplyw\n",
        },
    ),
    (
        "reeksport-wzgledny-w-module-posrednim",
        {
            "network_model/core/_iniekcja_reeksport.py": "from ..solvers import "
            "power_flow_newton as nr\n",
            INIEKCJA: "from network_model.core._iniekcja_reeksport import nr\n",
        },
    ),
    (
        "nazwa-bez-dowodu-pochodzenia",
        {
            "enm/_iniekcja_reeksport.py": "globals()['X'] = 1\n",
            INIEKCJA: "from enm._iniekcja_reeksport import X\n",
        },
    ),
    # --- punkt 2(c): alias pakietu `src` ---
    (
        "alias-src-modul-solvera",
        {
            INIEKCJA: "from src.network_model.solvers.power_flow_newton import PowerFlowNewtonSolver\n"
        },
    ),
    (
        "alias-src-pakiet-solverow",
        {INIEKCJA: "from src.network_model import solvers\n"},
    ),
    ("alias-src-pakiet", {INIEKCJA: "import src\n"}),
    (
        "alias-src-reeksport",
        {INIEKCJA: "from src.enm.canonical_analysis import solve_with_oltc\n"},
    ),
    (
        "pakiet-solverow-typ-z-listy-przez-init",
        {INIEKCJA: "from network_model.solvers import PowerFlowResultV1\n"},
    ),
    # --- punkt 1: import dynamiczny ---
    (
        "dynamiczny-name-keyword",
        {
            INIEKCJA: "import importlib\n\n"
            "m = importlib.import_module(name='network_model.solvers.power_flow_newton')\n"
        },
    ),
    (
        "dynamiczny-wzgledny-package",
        {
            INIEKCJA: "import importlib\n\n"
            "m = importlib.import_module('.power_flow_newton', package='network_model.solvers')\n"
        },
    ),
    (
        "dynamiczny-wzgledny-package-pozycyjnie",
        {
            INIEKCJA: "import importlib\n\n"
            "m = importlib.import_module('.solvers.power_flow_newton', 'network_model')\n"
        },
    ),
    (
        "dynamiczny-alias-funkcji",
        {
            INIEKCJA: "import importlib\n\n"
            "im = importlib.import_module\n"
            "m = im('analysis.normative')\n"
        },
    ),
    (
        "dynamiczny-funkcja-jako-argument",
        {
            INIEKCJA: "import importlib\n\nm = list(map(importlib.import_module, ['a']))\n"
        },
    ),
    (
        "dynamiczny-from-importlib-z-aliasem",
        {
            INIEKCJA: "from importlib import import_module as im\n\n"
            "m = im('network_model.solvers.power_flow_newton')\n"
        },
    ),
    (
        "dynamiczny-getattr-importlib",
        {
            INIEKCJA: "import importlib\n\n"
            "m = getattr(importlib, 'import_module')('network_model.solvers.power_flow_newton')\n"
        },
    ),
    (
        "dynamiczny-dunder-fromlist-modul",
        {
            INIEKCJA: "m = __import__('network_model.solvers', fromlist=['power_flow_newton'])\n"
        },
    ),
    (
        "dynamiczny-dunder-fromlist-pakiet",
        {INIEKCJA: "m = __import__('network_model', fromlist=['solvers'])\n"},
    ),
    (
        "dynamiczny-dunder-zwraca-przodka",
        {INIEKCJA: "nm = __import__('network_model.core.graph')\n"},
    ),
    (
        "dynamiczny-dunder-alias-src",
        {INIEKCJA: "m = __import__('src.network_model.solvers.power_flow_newton')\n"},
    ),
    (
        "dynamiczny-konkatenacja-stala",
        {
            INIEKCJA: "import importlib\n\n"
            "m = importlib.import_module('network_model.' + 'solvers.power_flow_newton')\n"
        },
    ),
    (
        "dynamiczny-konkatenacja-zmienna",
        {
            INIEKCJA: "import importlib\n\n\ndef f(x):\n"
            "    return importlib.import_module('network_model.' + x)\n"
        },
    ),
    (
        "dynamiczny-fstring-zmienna",
        {
            INIEKCJA: "import importlib\n\n\ndef f(m):\n"
            "    return importlib.import_module(f'network_model.solvers.{m}')\n"
        },
    ),
    (
        "dynamiczny-nazwa-zmienna",
        {
            INIEKCJA: "import importlib\n\n\ndef f(n):\n    return importlib.import_module(n)\n"
        },
    ),
    (
        "dynamiczny-kwargs",
        {
            INIEKCJA: "import importlib\n\n\ndef f(**k):\n    return importlib.import_module(**k)\n"
        },
    ),
    (
        "dynamiczny-modul-reeksportujacy",
        {
            INIEKCJA: "import importlib\n\nm = importlib.import_module('enm.canonical_analysis')\n"
        },
    ),
    (
        "dynamiczny-importlib-util",
        {
            INIEKCJA: "import importlib.util\n\n"
            "s = importlib.util.find_spec('network_model.solvers.power_flow_newton')\n"
        },
    ),
    # --- refleksja ---
    (
        "sys-modules",
        {
            INIEKCJA: "import sys\n\nm = sys.modules['network_model.solvers.power_flow_newton']\n"
        },
    ),
    ("from-sys-modules", {INIEKCJA: "from sys import modules\n"}),
    ("inspect", {INIEKCJA: "import inspect\n"}),
    ("builtins", {INIEKCJA: "from builtins import __import__ as imp\n"}),
    (
        "globals-funkcji-reeksportowanej",
        {
            INIEKCJA: "from enm.canonical_analysis import CanonicalRun\n\n"
            "S = CanonicalRun.__init__.__globals__['PowerFlowNewtonSolver']\n"
        },
    ),
    ("eval", {INIEKCJA: "S = eval('1')\n"}),
]

DOSTEP_ZIELONE: list[tuple[str, dict[str, str]]] = [
    (
        "typ-z-listy-reeksportowany-przez-enm",
        {INIEKCJA: "from enm.canonical_analysis import CanonicalRun, PowerFlowInput\n"},
    ),
    (
        "klasa-rdzenia-modelu",
        {INIEKCJA: "from network_model.core.graph import NetworkGraph\n"},
    ),
    (
        "dynamiczny-stala-spoza-solverow",
        {
            INIEKCJA: "import importlib\n\n"
            "a = importlib.import_module('analysis.normative')\n"
            "b = importlib.import_module('.normative', package='analysis')\n"
            "c = importlib.import_module(f\"analysis.{'normative'}\")\n"
            "d = __import__('math')\n"
        },
    ),
    ("sys-poza-modules", {INIEKCJA: "import sys\n\nprint('x', file=sys.stderr)\n"}),
]


@pytest.mark.parametrize(
    ("nazwa", "pliki"), DOSTEP_CZERWONE, ids=[s[0] for s in DOSTEP_CZERWONE]
)
def test_dostep_do_solvera_czerwony_przez_main(
    kopia_drzewa: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    nazwa: str,
    pliki: dict[str, str],
) -> None:
    rc, wyjscie = _main_z_iniekcja(kopia_drzewa, monkeypatch, capsys, pliki)

    assert rc == 1, (nazwa, wyjscie)
    assert "ARCH-GUARD VIOLATION" in wyjscie
    assert "_iniekcja_testowa.py" in wyjscie, wyjscie
    assert "network_model" in wyjscie, wyjscie


@pytest.mark.parametrize(
    ("nazwa", "pliki"), DOSTEP_ZIELONE, ids=[s[0] for s in DOSTEP_ZIELONE]
)
def test_dostep_do_solvera_para_zielona_przez_main(
    kopia_drzewa: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    nazwa: str,
    pliki: dict[str, str],
) -> None:
    rc, wyjscie = _main_z_iniekcja(kopia_drzewa, monkeypatch, capsys, pliki)

    assert rc == 0, (nazwa, wyjscie)


def test_solver_w_tescie_analizy_na_realnym_drzewie(
    kopia_drzewa: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Para zielona: test w `backend/tests/analysis` woła solver (dowód fizyki)."""
    test = kopia_drzewa / "backend" / "tests" / "analysis" / "test_iniekcja.py"
    test.parent.mkdir(parents=True, exist_ok=True)
    test.write_text(
        "from enm.canonical_analysis import solve_with_oltc\n"
        "import network_model.core.graph\n",
        encoding="utf-8",
    )
    try:
        monkeypatch.setattr(arch_guard, "REPO_ROOT", kopia_drzewa)
        assert arch_guard.main() == 0, capsys.readouterr()
    finally:
        shutil.rmtree(kopia_drzewa / "backend" / "tests")
