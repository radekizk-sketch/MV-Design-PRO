"""Phase 9 pre-flight: testy guard'a sld_v1_route_audit (operator-grade SLD plan v2).

Sprawdza:
  1. V1_PATH_PATTERNS rozpoznają referencje V1.
  2. EXCLUDE_PATTERNS skutecznie pomijają test files.
  3. _scan_file zwraca poprawne V1Reference.
  4. Real-repo smoke: brak V1 references na aktualnym repo.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

GUARD_PATH = Path(__file__).resolve().parents[3] / "scripts" / "sld_v1_route_audit.py"
spec = importlib.util.spec_from_file_location("sld_v1_route_audit", GUARD_PATH)
assert spec is not None and spec.loader is not None
guard_module = importlib.util.module_from_spec(spec)
sys.modules["sld_v1_route_audit"] = guard_module
spec.loader.exec_module(guard_module)

V1_PATH_PATTERNS = guard_module.V1_PATH_PATTERNS
EXCLUDE_PATTERNS = guard_module.EXCLUDE_PATTERNS


def test_v1_pattern_recognizes_sld_core_import() -> None:
    """Import z 'sld/core/...' rozpoznawany jako V1."""
    line = "import { foo } from '../../../sld/core/SldCadEngineV12';"
    matched = any(p.search(line) for p in V1_PATH_PATTERNS)
    assert matched


def test_v1_pattern_recognizes_sld_inspector_import() -> None:
    """Import z 'sld/inspector/...' rozpoznawany jako V1."""
    line = "import x from '../../sld/inspector/InspectorV1';"
    matched = any(p.search(line) for p in V1_PATH_PATTERNS)
    assert matched


def test_v1_pattern_recognizes_lazy_import() -> None:
    """Lazy import import('...sld/core/...') rozpoznawany."""
    line = "const Module = await import('../../sld/core/SldEngineV12');"
    matched = any(p.search(line) for p in V1_PATH_PATTERNS)
    assert matched


def test_v1_pattern_skips_v2_imports() -> None:
    """V2 imports NIE są rozpoznawane jako V1."""
    lines = [
        "import { x } from '../../sld/v2/canvas/SldCanvasV2';",
        "import { y } from '../../sld/v2/renderer/GpzRenderer';",
        "import { z } from '../../sld/v2/builder/BuildSequence';",
    ]
    for line in lines:
        matched = any(p.search(line) for p in V1_PATH_PATTERNS)
        assert not matched, f"V2 import niespodziewanie rozpoznany jako V1: {line!r}"


def test_exclude_patterns_skip_test_files() -> None:
    """EXCLUDE_PATTERNS pomijają test files."""
    paths = [
        "frontend/src/ui/sld/__tests__/foo.test.ts",
        "frontend/src/ui/sld/v2/canvas/foo.test.tsx",
        "frontend/src/ui/sld/v2/spec.test.ts",
    ]
    for path in paths:
        excluded = any(p.search(path) for p in EXCLUDE_PATTERNS)
        assert excluded, f"Test file niespodziewanie nie excluded: {path}"


def test_exclude_patterns_skip_v1_internal() -> None:
    """V1 internal pliki (sld/core/*, sld/inspector/*) wykluczone."""
    paths = [
        "frontend/src/ui/sld/core/SldCadEngineV12.ts",
        "frontend/src/ui/sld/inspector/InspectorV1.tsx",
    ]
    for path in paths:
        excluded = any(p.search(path) for p in EXCLUDE_PATTERNS)
        assert excluded


def test_real_repo_smoke_no_v1_references() -> None:
    """CI smoke: aktualny repo NIE ma V1 references w aktywnym kodzie.

    Phase 9 pre-flight — Acceptance Invariant 9.
    """
    repo_root = Path(__file__).resolve().parents[3]
    files_scanned = 0
    references = []
    for scan_root in guard_module.SCAN_ROOTS:
        absolute = repo_root / scan_root
        for path in guard_module._iter_source_files(absolute):
            files_scanned += 1
            references.extend(guard_module._scan_file(path, repo_root))

    assert references == [], (
        f"Phase 9 pre-flight FAILED: {len(references)} V1 references found in active code. "
        f"V1 NIE może być cleanup'owane gdy aktywny kod nadal używa.\n"
        + "\n".join(
            f"  {r.file_path.relative_to(repo_root)}:{r.line_number}: {r.line_content}"
            for r in references[:10]
        )
    )
    assert files_scanned > 0, "Zero plików zeskanowanych — coś nie tak z SCAN_ROOTS."
