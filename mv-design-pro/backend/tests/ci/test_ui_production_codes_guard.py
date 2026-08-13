"""Testy guarda ui_production_codes_guard (karta K10, 2026-07-29).

Intencja: kody rejestru (V12K-*), nazwy klas/API kontraktu wyników
(PowerFlowResult, FROZEN, branch_results, ...) i ścieżki plików źródłowych nie
mogą trafiać do treści widocznej dla inżyniera — stringów UI (src/ui, src/ui2)
ani pól tekstowych śladów/komunikatów analiz backendu. Guard pomija docstringi,
komentarze, specyfikatory importów i techniczne klucze słownikowe (literały bez
odstępu); kody V12K-* flaguje zawsze (z granicą słowa — nazwy handlowe typu
"HV12K-3H" nie są kodami rejestru).
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


guard = _load_script("ui_production_codes_guard")


def test_guard_zielony_na_head() -> None:
    """Moduły analiz i UI na HEAD są czyste (semantyka PL, zero kodów produkcji)."""
    assert guard.main([]) == 0


def test_guard_czerwony_na_kodzie_rejestru_w_sladzie(tmp_path: Path) -> None:
    """Wstrzyknięta regresja: kod V12K-* w polu śladu analizy -> RC=1."""
    plik = tmp_path / "analiza_regresja.py"
    plik.write_text(
        "def widok() -> dict:\n"
        '    return {"decyzja": "V12K-040 opcja B — adapter interpretacyjny"}\n',
        encoding="utf-8",
    )
    assert guard.main([str(plik)]) == 1


def test_guard_czerwony_na_nazwie_api_w_prozie(tmp_path: Path) -> None:
    """Nazwa klasy kontraktu wyników w prozie śladu -> RC=1."""
    plik = tmp_path / "analiza_api.py"
    plik.write_text(
        'OPIS = "przeplyw z branch_results solvera (suma po galeziach)"\n',
        encoding="utf-8",
    )
    assert guard.main([str(plik)]) == 1


def test_guard_czerwony_na_sciezce_pliku_w_prozie(tmp_path: Path) -> None:
    """Ścieżka pliku źródłowego w prozie śladu -> RC=1."""
    plik = tmp_path / "analiza_sciezka.py"
    plik.write_text(
        'OPIS = "znak kanoniczny przez adapter (application/analyses/konwencja_mocy.py)"\n',
        encoding="utf-8",
    )
    assert guard.main([str(plik)]) == 1


def test_guard_nie_flaguje_kluczy_slownikowych(tmp_path: Path) -> None:
    """Klucz kontraktu bez odstępu (np. "branch_results") to nie proza."""
    plik = tmp_path / "analiza_klucze.py"
    plik.write_text(
        'rows = result_v1.get("branch_results") or []\n'
        'bus = result_v1.get("bus_results") or []\n',
        encoding="utf-8",
    )
    assert guard.main([str(plik)]) == 0


def test_guard_pomija_docstringi(tmp_path: Path) -> None:
    """Docstring z kodem rejestru to dokumentacja kodu, nie treść dla inżyniera."""
    plik = tmp_path / "analiza_docstring.py"
    plik.write_text(
        '"""Modul zgodny z V12K-040 (opcja B) — czyta PowerFlowResult FROZEN."""\n\n'
        'OPIS = "wypadkowy przeplyw galezi zasilajacych punkt"\n',
        encoding="utf-8",
    )
    assert guard.main([str(plik)]) == 0


def test_guard_nie_flaguje_nazw_handlowych(tmp_path: Path) -> None:
    """Nazwa handlowa falownika "HV12K-3H" nie jest kodem rejestru."""
    plik = tmp_path / "katalog_nazwy.ts"
    plik.write_text("const MODEL = 'HV12K-3H';\n", encoding="utf-8")
    assert guard.main([str(plik)]) == 0


def test_guard_czerwony_na_kodzie_w_stringu_ui(tmp_path: Path) -> None:
    """Kod rejestru w literale frontendu -> RC=1; import path nie jest flagowany."""
    plik = tmp_path / "strings_regresja.ts"
    plik.write_text(
        "import { x } from './PowerFlowResultsInspectorPage';\n"
        "export const OPIS = 'rozstrzygniecie V12K-040 opcja B';\n",
        encoding="utf-8",
    )
    assert guard.main([str(plik)]) == 1
