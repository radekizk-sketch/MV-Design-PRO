"""Zakres strazenika cyklu zycia API: routery o DOWOLNEJ nazwie zmiennej (KD-9).

DEFEKT, KTORY TO ZAMYKA. `scripts/api_lifecycle_guard.py` mapowal importy w
`api/main.py` warunkiem `alias.name == "router"`, wiec `include_router` na
`production_router` (`api/enm.py`, `api/catalog.py`) i na reeksporcie
(`api/protection_analysis_runs.py`) byl CICHO pomijany. Pomiar na HEAD przed
naprawa: strazink widzial 200 tras `/api`, aplikacja wystawia 262 - 62 trasy nie
podlegaly zadnej bramce cyklu zycia. Nazwa zmiennej nie jest kontraktem;
kontraktem jest to, co aplikacja realnie wpina przez `include_router`.

Testy czulosci ponizej pracuja na PROBCE (wlasne drzewo `api/` w katalogu
tymczasowym), a nie na atrapach funkcji odkrywajacej trasy - inaczej sprawdzalyby
mock zamiast realnej sciezki odkrywania, ktora byla zrodlem defektu.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = PROJECT_ROOT / "scripts"

NAGLOWEK_MACIERZY = (
    "| Endpoint | Wersja | Status | Data wejscia | Data wylaczenia "
    "| Zakres kompatybilnosci | Testy | Wlasciciel |\n"
    "|---|---|---|---|---|---|---|---|\n"
)


def _load_script(module_name: str):
    script_path = SCRIPTS_DIR / f"{module_name}.py"
    spec = importlib.util.spec_from_file_location(module_name, script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Nie mozna zaladowac skryptu: {script_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


guard = _load_script("api_lifecycle_guard")


MODUL_PROBNY = """
from fastapi import APIRouter

router = APIRouter(prefix="/api/probne", tags=["probne"])

_PRODUCTION_DISABLED_ROUTE_KEYS = {
    ("/api/probne/wylaczona", "POST"),
}


@router.get("/widoczna")
def widoczna() -> dict:
    return {}


@router.post("/wylaczona")
def wylaczona() -> dict:
    return {}


def _build_production_router() -> APIRouter:
    production = APIRouter()
    for route in router.routes:
        path = getattr(route, "path", "")
        methods = set(getattr(route, "methods", set()))
        if any((path, method) in _PRODUCTION_DISABLED_ROUTE_KEYS for method in methods):
            continue
        production.routes.append(route)
    return production


production_router = _build_production_router()
"""

MAIN_PROBNY = """
from fastapi import FastAPI

from api.probne import production_router as probne_router

app = FastAPI()
app.include_router(probne_router)
"""


@pytest.fixture()
def probka(tmp_path, monkeypatch):
    """Minimalne drzewo `api/` + `main.py` + macierz, podstawione strazikowi."""
    api_dir = tmp_path / "api"
    api_dir.mkdir()
    (api_dir / "probne.py").write_text(MODUL_PROBNY, encoding="utf-8")
    (api_dir / "main.py").write_text(MAIN_PROBNY, encoding="utf-8")
    macierz = tmp_path / "MACIERZ_KOMPATYBILNOSCI_API.md"
    macierz.write_text(NAGLOWEK_MACIERZY, encoding="utf-8")

    monkeypatch.setattr(guard, "API_DIR", api_dir)
    monkeypatch.setattr(guard, "MAIN_PATH", api_dir / "main.py")
    monkeypatch.setattr(guard, "API_MATRIX_PATH", macierz)
    monkeypatch.setattr(guard, "ROOT", tmp_path)
    return macierz


def test_koncowka_na_routerze_o_innej_nazwie_poza_macierza_daje_rc1(probka) -> None:
    """CZULOSC: `production_router` bez wiersza w macierzy => naruszenie i RC=1."""
    violations = guard.check_api_lifecycle_matrix()

    assert any("[api-lifecycle-missing]" in item for item in violations), violations
    assert any("GET /api/probne/widoczna" in item for item in violations), violations
    assert guard.main() == 1


def test_uzupelnienie_macierzy_gasi_naruszenie(probka) -> None:
    """Ta sama probka z wierszem w macierzy => zielono (brak falszywych alarmow)."""
    probka.write_text(
        NAGLOWEK_MACIERZY + "| `GET /api/probne/widoczna` | v12xx | aktywny | 2026-07-31 | - "
        "| Probka. | probne tests | nadzor programu |\n",
        encoding="utf-8",
    )

    assert guard.check_api_lifecycle_matrix() == []
    assert guard.main() == 0


def test_trasy_wylaczone_z_routera_produkcyjnego_nie_sa_wymagane(probka) -> None:
    """Trasa odjeta przy budowie routera produkcyjnego NIE istnieje w aplikacji.

    Wymaganie dla niej wiersza w macierzy byloby zadaniem cyklu zycia od
    koncowki, ktorej nikt nie moze wywolac.
    """
    klucze = {route.key for route in guard.discover_active_api_routes()}

    assert "GET /api/probne/widoczna" in klucze
    assert "POST /api/probne/wylaczona" not in klucze


def test_nierozwiazywalny_router_jest_naruszeniem_a_nie_pominieciem(tmp_path, monkeypatch) -> None:
    """FAIL-CLOSED: to wlasnie ciche pominiecie ukrylo 62 trasy na HEAD."""
    api_dir = tmp_path / "api"
    api_dir.mkdir()
    (api_dir / "dziwny.py").write_text(
        "from fastapi import APIRouter\n"
        "\n"
        "router = APIRouter(prefix='/api/dziwny')\n"
        "\n"
        "\n"
        "def zbuduj() -> APIRouter:\n"
        "    return APIRouter()\n"
        "\n"
        "\n"
        "dziwny_router = zbuduj()\n",
        encoding="utf-8",
    )
    (api_dir / "main.py").write_text(
        "from fastapi import FastAPI\n"
        "\n"
        "from api.dziwny import dziwny_router\n"
        "\n"
        "app = FastAPI()\n"
        "app.include_router(dziwny_router)\n",
        encoding="utf-8",
    )
    macierz = tmp_path / "MACIERZ_KOMPATYBILNOSCI_API.md"
    macierz.write_text(NAGLOWEK_MACIERZY, encoding="utf-8")

    monkeypatch.setattr(guard, "API_DIR", api_dir)
    monkeypatch.setattr(guard, "MAIN_PATH", api_dir / "main.py")
    monkeypatch.setattr(guard, "API_MATRIX_PATH", macierz)
    monkeypatch.setattr(guard, "ROOT", tmp_path)

    violations = guard.check_api_lifecycle_matrix()

    assert any("[api-lifecycle-unresolved-router]" in item for item in violations), violations
    assert guard.main() == 1


def test_strazink_widzi_routery_produkcyjne_repozytorium() -> None:
    """REGRESJA WLASCIWA: trasy, ktore stary strazink przeoczyl, sa widziane."""
    klucze = {route.key for route in guard.discover_active_api_routes()}

    # api/enm.py -> production_router
    assert "GET /api/cases/{case_id}/enm/station-fault-loop" in klucze
    # api/catalog.py -> production_router
    assert "GET /api/catalog/manufacturers" in klucze
    # api/protection_analysis_runs.py -> reeksport routera z api/protection_runs.py
    assert "POST /api/protection-runs/{run_id}/execute" in klucze


def test_strazink_odejmuje_trasy_wylaczone_w_produkcji_repozytorium() -> None:
    """`PUT /api/cases/{case_id}/enm` jest wylaczony z routera produkcyjnego ENM."""
    klucze = {route.key for route in guard.discover_active_api_routes()}

    assert "PUT /api/cases/{case_id}/enm" not in klucze
    assert "POST /api/cases/{case_id}/enm/ops" not in klucze


def test_strazink_jest_zielony_na_repozytorium() -> None:
    assert guard.check_api_lifecycle_matrix() == []
