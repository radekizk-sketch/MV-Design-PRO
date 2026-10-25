"""CI: poprawne rozróżnienie składni workera Vite i utraconych polskich liter."""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("utf8_mojibake_guard_gis", ROOT / "scripts" / "utf8_mojibake_guard.py")
assert SPEC is not None and SPEC.loader is not None
GUARD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GUARD)


def test_worker_vite_is_not_mojibake() -> None:
    line = "import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';"
    assert GUARD.znajdz_trafienia([line]) == []


def test_real_damaged_polish_word_is_still_detected() -> None:
    assert GUARD.znajdz_trafienia(["Brak napi?cia w polu SN"])


def test_other_query_syntax_is_not_exempted() -> None:
    assert GUARD.znajdz_trafienia(["Widoczne po?aczenie przewodu"])


def test_existing_query_parameter_still_accepted() -> None:
    assert GUARD.znajdz_trafienia(["GET /api/quality/flicker?run_id=XYZ"]) == []
