#!/usr/bin/env python3
"""
SLD-LAYER-ID-SCOPE GUARD — `SldLayerId` tylko w warstwie renderera.

BINDING RULE (PR-O konsolidacji UI - kierunek pkt 3):
- `SldLayerId` (typ z `LodPolicy.ts`) jest niskopoziomową kategorią
  warstw renderera SldCanvasV2. Nie powinien przeciekać do warstwy UX
  (LayerTogglePanel, BuildSidebar) ani do logiki domenowej.
- Komponenty UX MUSZĄ używać `LayerId` z `layerToggle.ts` + mapowanie
  przez `layerMapping.ts:mapLayerStateToRenderVisibility()`.

Cel: zachować pojedyncze źródło prawdy dla user-facing toggle warstw
i nie pozwolić by SldLayerId stał się znowu drugim systemem warstw.

Dozwolone lokalizacje (whitelist):
- `frontend/src/ui/sld/v2/lod/` - definicja typu + most LAYER_RENDER_MAPPING
- `frontend/src/ui/sld/v2/canvas/` - SldCanvasV2 i jego pomocnicze pliki

Usage:
  python scripts/sld_layer_id_scope_guard.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import NamedTuple

REPO_ROOT = Path(__file__).resolve().parents[1]

SCAN_DIRS = ["frontend/src"]
FILE_EXTENSIONS = {".ts", ".tsx"}

# Whitelist - katalogi w których SldLayerId może występować
ALLOWED_DIR_PREFIXES = (
    "frontend/src/ui/sld/v2/lod/",
    "frontend/src/ui/sld/v2/canvas/",
    # Renderery używają LodLevel (typ podstawowy) z LodPolicy
    "frontend/src/ui/sld/v2/renderer/",
    # Testy v2 - asercje wewnętrzne contract testów
    "frontend/src/ui/sld/v2/__tests__/",
)

# Pliki indywidualnie wyłączone (legacy do migracji w future PR-ach).
# Po PR-Q konsolidacji warstw - lista jest pusta. Wszystkie komponenty UX
# używają LayerId + mapowanie.
LEGACY_FILES: set[str] = set()

# Wzorce wykrywające użycie SldLayerId i sąsiednich symboli z LodPolicy
# (DEFAULT_LAYER_VISIBILITY). Symbole jednakowe w obu modułach (np.
# LAYER_LABELS_PL — istnieje też w layerToggle.ts) wykrywamy poprzez
# IMPORT z LodPolicy zamiast samego literału użycia.
LAYER_ID_PATTERN = re.compile(r"\bSldLayerId\b|\bDEFAULT_LAYER_VISIBILITY\b")

# Wykrywa: `import { ... } from '.../lod/LodPolicy'` lub podobne.
# Każdy import z LodPolicy poza whitelisted location to naruszenie.
LOD_POLICY_IMPORT_PATTERN = re.compile(
    r"""from\s+['"][^'"]*\blod/LodPolicy['"]""",
)

IGNORE_PATTERN = re.compile(r"//\s*sld-layer-id-ignore")

# Linie będące komentarzami (do skipowania)
COMMENT_LINE_PATTERNS = [
    re.compile(r"^\s*//"),    # // single-line
    re.compile(r"^\s*\*"),    # JSDoc/block * continuation
    re.compile(r"^\s*/\*"),   # /* block start
    re.compile(r"^\s*\*/"),   # */ block end
]


def is_comment_line(line: str) -> bool:
    """Czy linia jest komentarzem (do skipowania w analizie)."""
    stripped = line.strip()
    return any(pattern.match(stripped) for pattern in COMMENT_LINE_PATTERNS)


class Violation(NamedTuple):
    file_path: str
    line_number: int
    line_content: str
    match: str


def is_allowed(file_path: Path) -> bool:
    rel = str(file_path.relative_to(REPO_ROOT)).replace("\\", "/")
    if rel in LEGACY_FILES:
        return True
    return any(rel.startswith(d) for d in ALLOWED_DIR_PREFIXES)


def scan_file(file_path: Path) -> list[Violation]:
    rel_path = str(file_path.relative_to(REPO_ROOT)).replace("\\", "/")
    violations: list[Violation] = []
    try:
        content = file_path.read_text(encoding="utf-8")
    except OSError:
        return violations

    for i, line in enumerate(content.splitlines(), start=1):
        if IGNORE_PATTERN.search(line):
            continue
        if is_comment_line(line):
            continue
        m = LAYER_ID_PATTERN.search(line)
        if m:
            violations.append(
                Violation(
                    file_path=rel_path,
                    line_number=i,
                    line_content=line.strip(),
                    match=m.group(),
                )
            )
            continue
        # Każdy import z LodPolicy poza whitelisted location jest naruszeniem -
        # ujawnia że plik sięga do warstwy renderera.
        m2 = LOD_POLICY_IMPORT_PATTERN.search(line)
        if m2:
            violations.append(
                Violation(
                    file_path=rel_path,
                    line_number=i,
                    line_content=line.strip(),
                    match="import z LodPolicy",
                )
            )
    return violations


def main() -> int:
    all_violations: list[Violation] = []
    for scan_dir in SCAN_DIRS:
        base = REPO_ROOT / scan_dir
        if not base.exists():
            continue
        for file_path in base.rglob("*"):
            if not file_path.is_file():
                continue
            if file_path.suffix not in FILE_EXTENSIONS:
                continue
            if is_allowed(file_path):
                continue
            all_violations.extend(scan_file(file_path))

    if all_violations:
        print("=" * 60)
        print("GUARD: sld_layer_id_scope_guard")
        print("=" * 60)
        print()
        print(
            f"FAIL: {len(all_violations)} użyć SldLayerId/DEFAULT_LAYER_VISIBILITY "
            "poza warstwą renderera."
        )
        print()
        print(
            "Zasada: SldLayerId jest niskopoziomowym typem warstw renderera.\n"
            "Komponenty UX MUSZĄ używać LayerId z layerToggle.ts + mapowanie:\n"
            "  import { mapLayerStateToRenderVisibility } from '.../lod/layerMapping';\n"
        )
        for v in all_violations:
            print(f"  {v.file_path}:{v.line_number}: znaleziono '{v.match}'")
            print(f"    {v.line_content}")
        print()
        print(
            "Jeśli plik jest legacy lub potrzebuje świadomego dostępu - dodaj komentarz\n"
            "// sld-layer-id-ignore na końcu linii lub dodaj do LEGACY_FILES w guardzie."
        )
        return 1

    print("sld-layer-id-scope-guard: OK (brak naruszeń)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
