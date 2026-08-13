"""Testy guarda export_codenames_guard (K7-A, 2026-07-29).

Intencja: kody projektowe (P11, P24+, ...) i porównawcze nazwy produktowe
(ETAP+, ETAP++) nie mogą trafiać do TREŚCI eksportów (PDF/DOCX/LaTeX/SVG).
Guard skanuje literały napisowe źródeł producentów eksportów (ast), pomija
docstringi i nie flaguje technicznych identyfikatorów reguł (NR_P20_001).
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


guard = _load_script("export_codenames_guard")


def test_guard_zielony_na_head() -> None:
    """Producenci eksportów na HEAD są czyści (polskie etykiety, zero kodów)."""
    assert guard.main([]) == 0


def test_guard_czerwony_na_wstrzyknietym_kodzie(tmp_path: Path) -> None:
    """Wstrzyknięta regresja: kod projektowy w literale raportu -> RC=1."""
    plik = tmp_path / "renderer_regresja.py"
    plik.write_text(
        'def naglowek() -> str:\n    return "Raport P24+ — ETAP+ (audit-grade)"\n',
        encoding="utf-8",
    )
    assert guard.main([str(plik)]) == 1


def test_guard_czerwony_na_etap_plus(tmp_path: Path) -> None:
    """Nazwa produktowa ETAP++ w literale -> RC=1 (nawet bez kodu P\\d+)."""
    plik = tmp_path / "renderer_etap.py"
    plik.write_text('TYTUL = "Krzywe I-t (ETAP++)"\n', encoding="utf-8")
    assert guard.main([str(plik)]) == 1


def test_guard_pomija_docstringi(tmp_path: Path) -> None:
    """Docstring z kodem projektowym to dokumentacja kodu, nie treść eksportu."""
    plik = tmp_path / "renderer_docstring.py"
    plik.write_text(
        '"""Renderer historycznie znany jako P24+ (ETAP+)."""\n\n'
        "def naglowek() -> str:\n"
        '    """Sekcja P21 w ujęciu historycznym."""\n'
        '    return "Raport analiz sieci"\n',
        encoding="utf-8",
    )
    assert guard.main([str(plik)]) == 0


def test_guard_nie_flaguje_identyfikatorow_regul(tmp_path: Path) -> None:
    """Techniczne rule_id (NR_P20_001) w polach danych nie są prozą eksportu."""
    plik = tmp_path / "renderer_rule_id.py"
    plik.write_text(
        'RULE_ID = "NR_P20_001"\nPERCENTYL = "p95"\nPARAMETR = "p0_kw"\n',
        encoding="utf-8",
    )
    assert guard.main([str(plik)]) == 0


def test_guard_allowlista_wymaga_uzasadnienia(tmp_path: Path) -> None:
    """Wpis allowlisty z uzasadnieniem wyłącza dokładnie jeden token/linię."""
    plik = tmp_path / "renderer_allow.py"
    plik.write_text('KLUCZ_DANYCH = "P14"\n', encoding="utf-8")
    rel = str(plik)
    try:
        guard.ALLOWLIST[(rel, 1, "P14")] = (
            "Test mechanizmu: identyfikator techniczny niedrukowany w treści."
        )
        assert guard.main([rel]) == 0
    finally:
        guard.ALLOWLIST.pop((rel, 1, "P14"), None)
    assert guard.main([rel]) == 1
