"""Bramki importów × formy importu — iniekcje na drzewie w katalogu tymczasowym.

KLASA (karta GRANICE-IMPORTOW-WZGLEDNE, 2026-09-30). Bramki CI analizujące importy
Pythona czytały `ImportFrom.module` wprost albo liczyły import względny własną arytmetyką,
więc przepuszczały importy względne przekraczające granicę, której pilnują. Teraz każda
rozwiązuje importy przez `scripts/importy_ast.py` (semantyka interpretera).

ILOCZYN CECH: bramka × {import względny przekraczający granicę (moduł zwykły, `__init__.py`,
podpakiet; `module` nazwany i `from . import x`), import modułu z pakietu, `ast.Import`,
wyjście ponad korzeń drzewa importów, dozwolony import względny wewnątrz granicy (para —
bramka nie może zaczerwienić się na formie poprawnej)}. Każdy scenariusz ma wypisane
oczekiwanie (`True` = bramka MUSI zgłosić naruszenie). Wszystkie drzewa powstają
w `tmp_path` — żywe drzewo repozytorium jest tylko czytane.

Dowód „czerwone na starej bramce” (baza `2be588ea`) jest w meldunku karty: te same tabele
`SCENARIUSZE_*` uruchomione na kopii skryptów z bazy dają zieleń tam, gdzie tu oczekiwana
jest czerwień.
"""

from __future__ import annotations

import ast
import contextlib
import io
import shutil
import sys
from collections.abc import Callable
from pathlib import Path

import pytest

KATALOG_SKRYPTOW = Path(__file__).resolve().parent
sys.path.insert(0, str(KATALOG_SKRYPTOW))

import api_lifecycle_guard  # noqa: E402
import arch_guard  # noqa: E402
import dynamika_granica_importow  # noqa: E402
import dziedziny_granica_importow  # noqa: E402
import enm_store_key_guard  # noqa: E402
import legacy_public_path_guard  # noqa: E402
import no_direct_fault_params_guard  # noqa: E402
import router_mount_guard  # noqa: E402
import sc_authority_guard  # noqa: E402
import scenario_copy_guard  # noqa: E402
import solver_boundary_guard  # noqa: E402
import solver_input_substitute_guard  # noqa: E402
import werdykt_wyjasnialny_guard  # noqa: E402

Scenariusz = tuple[str, dict[str, str], bool]


def _zbuduj(korzen: Path, pliki: dict[str, str]) -> Path:
    """Pliki względem `korzen`; każdy katalog pośredni dostaje pusty `__init__.py`."""
    for wzgledna, tresc in pliki.items():
        sciezka = korzen / wzgledna
        sciezka.parent.mkdir(parents=True, exist_ok=True)
        katalog = sciezka.parent
        while katalog != korzen:
            (katalog / "__init__.py").touch()
            katalog = katalog.parent
        sciezka.write_text(tresc, encoding="utf-8")
    return korzen


def _wyjscie(funkcja: Callable[[], int]) -> tuple[int, str]:
    bufor = io.StringIO()
    with contextlib.redirect_stdout(bufor):
        kod = funkcja()
    return kod, bufor.getvalue()


# ---------------------------------------------------------------------------
# Rdzeń dynamiki (`dynamika_granica_importow` + wpięcie w `solver_boundary_guard`)
# ---------------------------------------------------------------------------

_DYN = "network_model/solvers/dynamika"
_PF = "import PowerFlowNewtonSolver\n"

SCENARIUSZE_DYNAMIKA: list[Scenariusz] = [
    ("modul-poziom2", {f"{_DYN}/a.py": "from ..power_flow_newton " + _PF}, True),
    ("modul-poziom2-bez-modulu", {f"{_DYN}/a.py": "from .. import power_flow_newton\n"}, True),
    ("init-poziom2", {f"{_DYN}/__init__.py": "from ..power_flow_newton " + _PF}, True),
    (
        "podpakiet-poziom3",
        {f"{_DYN}/urzadzenia/a.py": "from ...power_flow_newton " + _PF},
        True,
    ),
    (
        "init-podpakietu-poziom3",
        {f"{_DYN}/urzadzenia/__init__.py": "from ... import power_flow_newton\n"},
        True,
    ),
    ("warstwa-przez-wzgledny", {f"{_DYN}/a.py": "from ...core.graph import NetworkGraph\n"}, True),
    ("ponad-korzen", {f"{_DYN}/a.py": "from ..... import enm\n"}, True),
    (
        "para-wewnatrz",
        {
            f"{_DYN}/a.py": "from .kontrakty import OdmowaDynamiki\nfrom . import siec\n",
            f"{_DYN}/urzadzenia/a.py": "from ..kontrakty import X\nfrom .. import siec\n",
            f"{_DYN}/urzadzenia/__init__.py": "from .a import X\nfrom . import a\n",
        },
        False,
    ),
]


@pytest.mark.parametrize(("nazwa", "pliki", "czerwien"), SCENARIUSZE_DYNAMIKA)
def test_dynamika(tmp_path: Path, nazwa: str, pliki: dict[str, str], czerwien: bool) -> None:
    katalog = _zbuduj(tmp_path / "src", pliki) / _DYN
    naruszenia = dynamika_granica_importow.znajdz_naruszenia(katalog)
    assert bool(naruszenia) is czerwien, naruszenia
    kod, wyjscie = _wyjscie(lambda: solver_boundary_guard.sprawdz_granice_dynamiki(katalog))
    assert kod == int(czerwien), wyjscie


def test_dynamika_komunikat_wskazuje_zamrozony_rdzen(tmp_path: Path) -> None:
    katalog = _zbuduj(tmp_path / "src", {f"{_DYN}/a.py": "from ..power_flow_newton " + _PF})
    (naruszenie,) = dynamika_granica_importow.znajdz_naruszenia(katalog / _DYN)
    assert naruszenie.modul == "network_model.solvers.power_flow_newton"
    assert "wychodzi poza pakiet dynamiki" in naruszenie.powod
    assert "stoi OBOK zamrozonych rdzeni" in naruszenie.powod


# ---------------------------------------------------------------------------
# Liść `dziedziny` (bramka poprawna przed kartą — migracja bez zmiany semantyki)
# ---------------------------------------------------------------------------

SCENARIUSZE_DZIEDZINY: list[Scenariusz] = [
    ("ponad-korzen-modul", {"dziedziny/a.py": "from ..enm import models\n"}, True),
    ("ponad-korzen-bez-modulu", {"dziedziny/a.py": "from .. import enm\n"}, True),
    ("ponad-korzen-podpakiet", {"dziedziny/p/a.py": "from ...enm import models\n"}, True),
    (
        "para-wewnatrz",
        {
            "dziedziny/a.py": "from .kanon import K\nfrom . import widmo\n",
            "dziedziny/p/a.py": "from ..kanon import K\nfrom .. import widmo\n",
        },
        False,
    ),
]


@pytest.mark.parametrize(("nazwa", "pliki", "czerwien"), SCENARIUSZE_DZIEDZINY)
def test_dziedziny(tmp_path: Path, nazwa: str, pliki: dict[str, str], czerwien: bool) -> None:
    katalog = _zbuduj(tmp_path / "src", pliki) / "dziedziny"
    naruszenia = dziedziny_granica_importow.znajdz_naruszenia(katalog)
    assert bool(naruszenia) is czerwien, naruszenia


# ---------------------------------------------------------------------------
# Klucz magazynu ENM (`enm_store_key_guard`, obie reguły)
# ---------------------------------------------------------------------------

_ODCZYT = "\n\ndef f(case_id):\n    return {wywolanie}(case_id)\n"

SCENARIUSZE_ENM_STORE: list[Scenariusz] = [
    (
        "r1-wzgledny-nazwa",
        {"enm/nowy.py": "from .store import get_enm" + _ODCZYT.format(wywolanie="get_enm")},
        True,
    ),
    (
        "r1-wzgledny-modul",
        {"enm/nowy.py": "from . import store" + _ODCZYT.format(wywolanie="store.get_enm")},
        True,
    ),
    (
        "r1-podpakiet-poziom2",
        {"enm/p/nowy.py": "from ..store import set_enm" + _ODCZYT.format(wywolanie="set_enm")},
        True,
    ),
    (
        "r1-import-modulu-bez-aliasu",
        {"api/nowy.py": "import enm.store" + _ODCZYT.format(wywolanie="enm.store.get_enm")},
        True,
    ),
    (
        "r1-most-reeksportu-wzgledny",
        {
            "api/most.py": "from enm.store import get_enm as _get_enm\n",
            "api/nowy.py": "from .most import _get_enm" + _ODCZYT.format(wywolanie="_get_enm"),
        },
        True,
    ),
    ("r2-wzgledny-nazwa", {"enm/nowy.py": "from .klucz_twin import klucz_twin_projektu\n"}, True),
    (
        "r2-wzgledny-modul",
        {"enm/nowy.py": "from . import klucz_twin\nk = klucz_twin.klucz_twin_projektu(p)\n"},
        True,
    ),
    (
        "r2-import-modulu-bez-aliasu",
        {"api/nowy.py": "import enm.klucz_twin\nk = enm.klucz_twin.klucz_twin_projektu(p)\n"},
        True,
    ),
    ("ponad-korzen", {"enm/nowy.py": "from .. import store\n"}, True),
    (
        "para-wewnatrz",
        {
            "enm/nowy.py": (
                "from .store import get_enm\nfrom . import store\n\n"
                "def f(klucz):\n    store.reset_enm_store()\n    return get_enm(klucz)\n"
            )
        },
        False,
    ),
]


@pytest.mark.parametrize(("nazwa", "pliki", "czerwien"), SCENARIUSZE_ENM_STORE)
def test_enm_store_key(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    nazwa: str,
    pliki: dict[str, str],
    czerwien: bool,
) -> None:
    src = _zbuduj(tmp_path / "src", {**pliki, "application/_.py": "", "api/_.py": ""})
    monkeypatch.setattr(enm_store_key_guard, "BACKEND_SRC", src)
    monkeypatch.setattr(enm_store_key_guard, "ZASTANE_KLUCZE_PRZYPADKU", {})
    kod, wyjscie = _wyjscie(enm_store_key_guard.main)
    assert kod == int(czerwien), wyjscie


# ---------------------------------------------------------------------------
# Kopia scenariusza (`scenario_copy_guard`)
# ---------------------------------------------------------------------------

SCENARIUSZE_SCENARIUSZ: list[Scenariusz] = [
    ("r1-wzgledny", {"enm/x.py": "from .canonical_analysis import _execute_power_flow\n"}, True),
    (
        "r1-modul-z-pakietu",
        {"enm/x.py": "from . import canonical_analysis as ca\nca._execute_short_circuit(r)\n"},
        True,
    ),
    (
        "r2-wzgledny",
        {"enm/x.py": "from .canonical_analysis import CanonicalRun\nCanonicalRun(a=1)\n"},
        True,
    ),
    (
        "r2-modul-z-pakietu",
        {"enm/p/x.py": "from .. import canonical_analysis as ca\nca.CanonicalRun(a=1)\n"},
        True,
    ),
    (
        "r2-import-modulu-bez-aliasu",
        {"api/x.py": "import enm.canonical_analysis\nenm.canonical_analysis.CanonicalRun(a=1)\n"},
        True,
    ),
    ("ponad-korzen", {"enm/x.py": "from .. import canonical_analysis\n"}, True),
    (
        "para-wewnatrz",
        {
            "enm/x.py": (
                "from .canonical_analysis import CanonicalRun, wykonaj_bieg_w_pamieci\n"
                "from . import canonical_analysis\n\n"
                "def f(b: CanonicalRun) -> CanonicalRun:\n"
                "    return canonical_analysis.bieg_wariantu(b)\n"
            )
        },
        False,
    ),
]


@pytest.mark.parametrize(("nazwa", "pliki", "czerwien"), SCENARIUSZE_SCENARIUSZ)
def test_scenario_copy(tmp_path: Path, nazwa: str, pliki: dict[str, str], czerwien: bool) -> None:
    src = _zbuduj(tmp_path / "src", {**pliki, "application/_.py": "", "api/_.py": ""})
    pomiar = scenario_copy_guard.zmierz(src)
    assert bool(pomiar) is czerwien, pomiar


# ---------------------------------------------------------------------------
# Parametry zwarcia (`no_direct_fault_params_guard`)
# ---------------------------------------------------------------------------

_SOLVER_SC = (
    "class ShortCircuitResult:\n    ikss: float\n\n\n"
    "class ShortCircuitIEC60909Solver:\n"
    "    @staticmethod\n"
    "    def compute_3ph_short_circuit(graph, fault_node_id):\n        return None\n"
)
_SOLVER_MASZYN = "def compute_machine_contributions(graph, fault_node_id):\n    return None\n"
_WARSTWA_SOLVERA = {
    "network_model/solvers/short_circuit_iec60909.py": _SOLVER_SC,
    "analysis/machine_short_circuit/__init__.py": _SOLVER_MASZYN,
}
_WYWOLANIE_A = "(graph=g, fault_node_id=n)\n"

SCENARIUSZE_ZWARCIE: list[Scenariusz] = [
    (
        "a-wzgledny-poziom2",
        {
            "network_model/core/x.py": (
                "from ..solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver\n"
                "r = ShortCircuitIEC60909Solver.compute_3ph_short_circuit" + _WYWOLANIE_A
            )
        },
        True,
    ),
    (
        "a-pakiet-bez-modulu",
        {
            "network_model/core/x.py": (
                "from .. import solvers\n"
                "r = solvers.short_circuit_iec60909.ShortCircuitIEC60909Solver"
                ".compute_3ph_short_circuit" + _WYWOLANIE_A
            )
        },
        True,
    ),
    (
        "a-modul-z-pakietu-bezwzgledny",
        {
            "api/x.py": (
                "from network_model import solvers\n"
                "r = solvers.short_circuit_iec60909.ShortCircuitIEC60909Solver"
                ".compute_3ph_short_circuit" + _WYWOLANIE_A
            )
        },
        True,
    ),
    (
        "c-wzgledny-pozycyjnie",
        {
            "analysis/x.py": (
                "from .machine_short_circuit import compute_machine_contributions\n"
                "r = compute_machine_contributions(g, n)\n"
            )
        },
        True,
    ),
    (
        "a-modul-z-pakietu-wzgledny",
        {
            "analysis/x.py": (
                "from . import machine_short_circuit\n"
                "r = machine_short_circuit.compute_machine_contributions(g, fault_node_id=n)\n"
            )
        },
        True,
    ),
    ("ponad-korzen", {"api/x.py": "from .. import solvers\n"}, True),
    (
        "para-wewnatrz",
        {
            "network_model/core/x.py": (
                "from ..solvers.short_circuit_iec60909 import ShortCircuitResult\n"
                "from .graph import NetworkGraph\n"
                "w = ShortCircuitResult(ikss=1.0)\n"
            )
        },
        False,
    ),
]


@pytest.mark.parametrize(("nazwa", "pliki", "czerwien"), SCENARIUSZE_ZWARCIE)
def test_no_direct_fault_params(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    nazwa: str,
    pliki: dict[str, str],
    czerwien: bool,
) -> None:
    src = _zbuduj(tmp_path / "src", {**_WARSTWA_SOLVERA, **pliki})
    monkeypatch.setattr(no_direct_fault_params_guard, "BACKEND_SRC", src)
    naruszenia = [
        komunikat
        for wzgledna in pliki
        for komunikat in no_direct_fault_params_guard.check_file(src / wzgledna)
    ]
    assert bool(naruszenia) is czerwien, naruszenia


# ---------------------------------------------------------------------------
# Ścieżki zastane (`legacy_public_path_guard`, trzy sprawdzenia importów)
# ---------------------------------------------------------------------------

SCENARIUSZE_TRASY_PUBLICZNE: list[Scenariusz] = [
    ("wzgledny-nazwa", {"api/x.py": "from .unified_runs import router\n"}, True),
    ("wzgledny-modul", {"api/x.py": "from . import unified_runs\n"}, True),
    ("import-modulu", {"api/x.py": "import api.unified_runs\n"}, True),
    ("modul-z-pakietu", {"api/x.py": "from application import execution_engine\n"}, True),
    ("ponad-korzen", {"api/x.py": "from .. import application\n"}, True),
    ("para-wewnatrz", {"api/x.py": "from .enm import router\nfrom . import cases\n"}, False),
]


@pytest.mark.parametrize(("nazwa", "pliki", "czerwien"), SCENARIUSZE_TRASY_PUBLICZNE)
def test_legacy_trasy_publiczne(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    nazwa: str,
    pliki: dict[str, str],
    czerwien: bool,
) -> None:
    src = _zbuduj(tmp_path / "backend" / "src", pliki)
    monkeypatch.setattr(legacy_public_path_guard, "ROOT", tmp_path)
    monkeypatch.setattr(legacy_public_path_guard, "BACKEND_SRC_DIR", src)
    monkeypatch.setattr(
        legacy_public_path_guard, "active_api_module_paths", lambda: [src / "api" / "x.py"]
    )
    naruszenia = [
        n
        for n in legacy_public_path_guard.check_legacy_public_paths()
        if n.startswith("[legacy-public-import]")
    ]
    assert bool(naruszenia) is czerwien, naruszenia


SCENARIUSZE_K2_TRACE: list[Scenariusz] = [
    ("k2-wzgledny", {"application/x/y.py": "from ..reference_networks import z\n"}, True),
    ("k2-import-modulu", {"api/y.py": "import application.reference_networks.io\n"}, True),
    ("k2-modul-z-pakietu", {"api/y.py": "from application import reference_networks\n"}, True),
    ("trace-wzgledny", {"application/x/y.py": "from ..trace_export import latex\n"}, True),
    ("trace-import-modulu", {"api/y.py": "import domain.trace_v2\n"}, True),
    ("ponad-korzen", {"application/y.py": "from .. import domain\n"}, True),
    ("para-wewnatrz", {"application/x/y.py": "from ..reference_patterns import base\n"}, False),
]


@pytest.mark.parametrize(("nazwa", "pliki", "czerwien"), SCENARIUSZE_K2_TRACE)
def test_legacy_k2_i_trace_v2(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    nazwa: str,
    pliki: dict[str, str],
    czerwien: bool,
) -> None:
    src = _zbuduj(tmp_path / "backend" / "src", pliki)
    brak = tmp_path / "brak"
    monkeypatch.setattr(legacy_public_path_guard, "ROOT", tmp_path)
    monkeypatch.setattr(legacy_public_path_guard, "BACKEND_SRC_DIR", src)
    monkeypatch.setattr(legacy_public_path_guard, "FRONTEND_SRC_DIR", brak)
    monkeypatch.setattr(legacy_public_path_guard, "K2_REFERENCE_NETWORKS_FRONTEND_DIR", brak)
    monkeypatch.setattr(legacy_public_path_guard, "TRACE_V2_FRONTEND_DIR", brak)
    naruszenia = [
        n
        for n in (
            legacy_public_path_guard.check_k2_reference_networks_resurrection()
            + legacy_public_path_guard.check_trace_v2_resurrection()
        )
        if n.startswith("[legacy-public-import]")
    ]
    assert bool(naruszenia) is czerwien, naruszenia


# ---------------------------------------------------------------------------
# Warstwy solverów i analizy (`arch_guard`)
# ---------------------------------------------------------------------------

SCENARIUSZE_ARCH: list[Scenariusz] = [
    ("analiza-importuje-solvers", {"src/analysis/p/m.py": "from solvers import pf\n"}, True),
    ("solver-importuje-analize", {"src/solvers/p/m.py": "import analysis.protection\n"}, True),
    (
        "solver-modul-analizy-z-pakietu",
        {"src/solvers/p/m.py": "from analysis import protection\n"},
        True,
    ),
    ("ponad-korzen", {"src/analysis/m.py": "from .. import solvers\n"}, True),
    # Fałszywa czerwień starej bramki: `from .solvers import x` w `analysis/p/m.py` to moduł
    # `analysis.p.solvers`, nie warstwa `solvers`.
    ("para-wzgledny-wewnatrz-analizy", {"src/analysis/p/m.py": "from .solvers import x\n"}, False),
    ("para-wzgledny-wewnatrz-solvers", {"src/solvers/p/m.py": "from ..analysis import x\n"}, False),
]


@pytest.mark.parametrize(("nazwa", "pliki", "czerwien"), SCENARIUSZE_ARCH)
def test_arch_guard(tmp_path: Path, nazwa: str, pliki: dict[str, str], czerwien: bool) -> None:
    backend = _zbuduj(tmp_path / "backend", pliki)
    (wzgledna,) = pliki
    naruszenie = arch_guard._scan_file(backend / wzgledna, backend)
    assert (naruszenie is not None) is czerwien, naruszenie


# ---------------------------------------------------------------------------
# Autorytet wyniku zwarciowego (`sc_authority_guard`, kontrole 1 i 2)
# ---------------------------------------------------------------------------

_BRAMKA = "from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu\n"
_POPRAWNE_SC = {
    "application/equipment_proof/proof_pack.py": _BRAMKA
    + "def build():\n    wymagaj_autorytetu((), None)\n",
    # Budowniczy wejścia koordynacji (karta BIEG-ZABEZPIECZEN-Z-MODELU): moduł aplikacyjny
    # z biegów, nie trasa HTTP — ta sama zamknięta lista co `sc_authority_guard`.
    "application/analyses/protection/coordination/z_biegow.py": (
        "from application.autorytet_biegu_zwarciowego import wejscie_koordynacji_z_biegow\n"
        + _BRAMKA
        + "def run():\n    w = wejscie_koordynacji_z_biegow(a=None)\n"
        "    wymagaj_autorytetu((), w)\n"
    ),
    "api/equipment_proof_pack.py": (
        "from application.autorytet_biegu_zwarciowego import wejscie_zwarciowe_z_biegu\n"
        "def download():\n    wejscie_zwarciowe_z_biegu(run_id=None)\n"
    ),
}

SCENARIUSZE_SC: list[Scenariusz] = [
    (
        "k1-atrapa-w-pliku",
        {
            "application/equipment_proof/proof_pack.py": (
                "def wymagaj_autorytetu(*a):\n    pass\n"
                "def build():\n    wymagaj_autorytetu((), None)\n"
            )
        },
        True,
    ),
    (
        "k2-nazwa-z-innego-modulu",
        {
            "api/equipment_proof_pack.py": (
                "from application.atrapa import wejscie_zwarciowe_z_biegu\n"
                "def download():\n    wejscie_zwarciowe_z_biegu(run_id=None)\n"
            )
        },
        True,
    ),
    (
        "k2-sam-import",
        {
            "api/equipment_proof_pack.py": (
                "from application.autorytet_biegu_zwarciowego import wejscie_zwarciowe_z_biegu\n"
            )
        },
        True,
    ),
    ("para-poprawne", {}, False),
]


@pytest.mark.parametrize(("nazwa", "pliki", "czerwien"), SCENARIUSZE_SC)
def test_sc_authority(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    nazwa: str,
    pliki: dict[str, str],
    czerwien: bool,
) -> None:
    src = _zbuduj(tmp_path / "src", {**_POPRAWNE_SC, **pliki})
    monkeypatch.setattr(sc_authority_guard, "BACKEND_SRC", src)
    kod, wyjscie = _wyjscie(sc_authority_guard.main)
    assert kod == int(czerwien), wyjscie


# ---------------------------------------------------------------------------
# Bramki fail-closed tras (`api_lifecycle_guard`, `router_mount_guard`): forma względna
# w `api/main.py` i reeksporcie rozwiązuje się do TEGO SAMEGO modułu co bezwzględna.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "instrukcja",
    ["from api.enm import production_router as r\n", "from .enm import production_router as r\n"],
)
def test_main_py_forma_wzgledna_i_bezwzgledna_rownowazne(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, instrukcja: str
) -> None:
    main = _zbuduj(tmp_path / "src", {"api/main.py": instrukcja + "import os\n"}) / "api/main.py"
    monkeypatch.setattr(api_lifecycle_guard, "MAIN_PATH", main)
    assert api_lifecycle_guard._main_router_imports() == {"r": ("enm", "production_router")}
    drzewo = ast.parse(main.read_text(encoding="utf-8"))
    assert router_mount_guard._main_aliases(drzewo) == {"r": ("enm", "production_router")}


def test_reeksport_wzgledny_wskazuje_modul_zrodlowy() -> None:
    drzewo = ast.parse("from .protection_runs import router as router\n")
    assert api_lifecycle_guard._reexport_target(drzewo, "router", "api") == (
        "protection_runs",
        "router",
    )


def test_main_py_import_ponad_korzen_jest_nierozwiazany(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    main = _zbuduj(tmp_path / "src", {"api/main.py": "from .. import enm\n"}) / "api/main.py"
    monkeypatch.setattr(api_lifecycle_guard, "MAIN_PATH", main)
    with pytest.raises(api_lifecycle_guard.UnresolvedRouter, match="ponad korzeń"):
        api_lifecycle_guard._main_router_imports()


# ---------------------------------------------------------------------------
# Wyrocznia modeli (`solver_input_substitute_guard.model_roots_read_by_scope`)
# ---------------------------------------------------------------------------

_MODEL = "class Model:\n    napiecie_kv: float\n"


@pytest.mark.parametrize(
    "instrukcja",
    [
        "from application.modele import Model\n",
        "from .modele import Model\n",
        "from . import modele\n",
        "from application import modele\n",
    ],
)
def test_wyrocznia_modeli_widzi_kazda_forme(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, instrukcja: str
) -> None:
    src = _zbuduj(
        tmp_path / "src", {"application/modele.py": _MODEL, "application/uzycie.py": instrukcja}
    )
    monkeypatch.setattr(solver_input_substitute_guard, "BACKEND_SRC", src)
    monkeypatch.setattr(solver_input_substitute_guard, "SCAN_ROOTS", ("application",))
    korzenie = solver_input_substitute_guard.model_roots_read_by_scope()
    assert korzenie == {"application/modele.py": {"application/uzycie.py"}}


# ---------------------------------------------------------------------------
# Werdykt wyjaśnialny (bramka poprawna przed kartą — migracja bez zmiany semantyki)
# ---------------------------------------------------------------------------


def test_werdykt_indeks_rozwiazuje_reeksport_wzgledny(tmp_path: Path) -> None:
    src = _zbuduj(
        tmp_path / "src",
        {
            "a/klasy.py": "class Wynik:\n    status: str\n",
            "a/b/reeksport.py": "from ..klasy import Wynik\nfrom .. import klasy\n",
            "a/b/__init__.py": "from .reeksport import Wynik as W\n",
        },
    )
    indeks = werdykt_wyjasnialny_guard.IndeksBackendu(src)
    assert indeks.rozwiaz_symbol("a.b.reeksport", "Wynik") == ("a.klasy", "Wynik")
    assert indeks.rozwiaz_symbol("a.b", "W") == ("a.klasy", "Wynik")
    assert indeks.moduly["a.b.reeksport"].importy["klasy"] == "a.klasy"


def test_werdykt_import_ponad_korzen_to_blad_srodowiska(tmp_path: Path) -> None:
    src = _zbuduj(tmp_path / "src", {"a/m.py": "from ... import x\n"})
    with pytest.raises(werdykt_wyjasnialny_guard.BladSrodowiska, match="ponad korzeń"):
        werdykt_wyjasnialny_guard.IndeksBackendu(src)


# ---------------------------------------------------------------------------
# Żywe drzewo: każda zmigrowana bramka zielona (tylko odczyt).
# ---------------------------------------------------------------------------


def test_zywe_drzewo_zielone_dla_zmigrowanych_bramek() -> None:
    """Pełne biegi bramek na żywym drzewie są w ich własnych autotestach i w łańcuchu
    `guardy_z_ci.py`; tu — szybkie skanery o samym rozwiązywaniu importów."""
    assert dynamika_granica_importow.znajdz_naruszenia() == []
    assert dziedziny_granica_importow.znajdz_naruszenia() == []
    assert scenario_copy_guard.zmierz() == {}
    kod, wyjscie = _wyjscie(sc_authority_guard.main)
    assert kod == 0, wyjscie


def test_kopia_pakietu_dynamiki_jest_zielona(tmp_path: Path) -> None:
    kopia = tmp_path / "network_model" / "solvers" / "dynamika"
    shutil.copytree(
        dynamika_granica_importow.KATALOG_PAKIETU,
        kopia,
        ignore=shutil.ignore_patterns("__pycache__"),
    )
    assert dynamika_granica_importow.znajdz_naruszenia(kopia) == []
