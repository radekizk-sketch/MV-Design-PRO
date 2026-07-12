#!/usr/bin/env python3
"""SLD Determinism Guards — gates dla nowego SLD v2 (po PR-5c wygaszeniu starego SLD)
oraz SLD v3 (SLD_CAD_REBUILD_PLAN_V3, domyślna ścieżka renderu od F8a).

Po pełnym wygaszeniu starego pipeline (Sugiyama + A* + ELK + V1 layoutPipeline) w PR-5c
ten guard sprawdza, że nowy konstruktywny builder (`ui/sld/v2/`) ma:

1. Wymagany szkielet katalogowy (theme/geometry/builder/viewport/lod/canvas/renderer/command/core/domain).
2. Testy v2 są obecne (layoutEngine.substrate, ViewportController, LodPolicy, renderers, portAnchoredGeometry.substrate).
3. Brak importu wygaszonych modułów (Sugiyama, A*, ELK, sldCanonicalStyle, IndustrialAesthetics, layoutPipeline V1, SLDView).
4. Brak importu wygaszonego pakietu `elkjs` w package.json.
5. Brak fabrykacji ID/czasu w builder/ (crypto.randomUUID/Date.now/Math.random).
6. Testy v3 są obecne (buildScene, camera, SldCanvasV3, layout, labels, route, symbols —
   REBUILD_PLAN_V3 §F8b-2; v2 pozostaje ZABLOKOWANY do usunięcia do §F8c, patrz plan).

Exit code: 0 = OK, 1 = naruszenia.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"
PACKAGE_JSON = REPO_ROOT / "frontend" / "package.json"

RED = "\033[91m"
GREEN = "\033[92m"
RESET = "\033[0m"

REQUIRED_V2_DIRS = [
    "ui/sld/v2/theme",
    "ui/sld/v2/geometry",
    "ui/sld/v2/builder",
    "ui/sld/v2/viewport",
    "ui/sld/v2/lod",
    "ui/sld/v2/canvas",
    "ui/sld/v2/renderer",
    "ui/sld/v2/command",
    "ui/sld/v2/core",
    "ui/sld/v2/domain",
]

REQUIRED_V2_TESTS = [
    # Live topological layout engine determinism (dawny martwy HierarchicalLayout
    # usunięty w konsolidacji 2026-07 — teraz substrate testy żywego silnika).
    "ui/sld/v2/geometry/__tests__/layoutEngine.substrate.test.ts",
    "ui/sld/v2/__tests__/ViewportController.test.ts",
    "ui/sld/v2/__tests__/LodPolicy.test.ts",
    "ui/sld/v2/__tests__/renderers.test.tsx",
    # Live render-path geometry determinism (dawny visualFixtures na martwym
    # silniku usunięty — teraz port-anchored substrate żywej ścieżki renderu).
    "ui/sld/v2/geometry/__tests__/portAnchoredGeometry.substrate.test.ts",
    "ui/sld/v2/command/__tests__/SldCommandService.test.ts",
    "ui/sld/v2/core/__tests__/ports.test.ts",
]

# Testy v3 (SLD_CAD_REBUILD_PLAN_V3 F1-F8 — domyślna ścieżka renderu od F8a).
# Lista NIE jest wyczerpująca (v3 ma więcej plików testowych) — pilnuje
# kluczowych wyroczni per warstwa (symbole/layout/routing/etykiety/scena/
# kamera/kanwa), analogicznie do REQUIRED_V2_TESTS.
REQUIRED_V3_TESTS = [
    "ui/sld/v3/symbols/__tests__/symbols.test.tsx",
    "ui/sld/v3/layout/__tests__/layout.test.ts",
    "ui/sld/v3/layout/__tests__/route.test.ts",
    "ui/sld/v3/layout/__tests__/labels.test.ts",
    "ui/sld/v3/scene/__tests__/buildScene.test.ts",
    "ui/sld/v3/canvas/__tests__/camera.test.ts",
    "ui/sld/v3/canvas/__tests__/sldCanvasV3.test.tsx",
]

FORBIDDEN_LEGACY_PATHS = [
    "ui/sld/SLDView",
    "ui/sld/sldCanonicalStyle",
    "ui/sld/IndustrialAesthetics",
    "ui/sld/sldKrokStyle",
    "ui/sld/core/layoutPipeline",
    "ui/sld/core/topologyAdapterV2",
    "ui/sld/TrunkSpineRenderer",
    "ui/sld/FieldBlockRenderer",
    "ui/sld/BranchRenderer",
    "ui/sld/GpzFieldBlockRenderer",
    "ui/sld/InlineBranchObjectRenderer",
    "ui/sld/ConnectionRenderer",
    "ui/sld/JunctionDotLayer",
    # NOTE: `engine/sld-layout/` was the OLD V1 layout pipeline (Sugiyama/A*/ELK),
    # wygaszony w PR-5c. Po cutover §4 (commit 0baa9e8 „layout-engine foundation —
    # one truth") katalog ten jest NOWYM, kanonicznym silnikiem layoutu
    # (`TopologicalLayoutEngine`, `lodController`) — JEDYNE źródło geometrii per
    # SLD_GEOMETRY_CONTRACT_V1 §1/§7. Wpis usunięty: blokował wymagany kontraktem
    # moduł (geometry/index.ts i canvas importują go zgodnie z kontraktem).
]

FORBIDDEN_PKG = ["elkjs"]


def passed(msg: str) -> None:
    print(f"{GREEN}PASS{RESET} {msg}")


def main() -> int:
    violations: list[str] = []

    # Guard 1: szkielet v2
    for rel in REQUIRED_V2_DIRS:
        if not (FRONTEND_SRC / rel).is_dir():
            violations.append(f"GUARD 1: brak katalogu v2 — {rel}")
    if not any(v.startswith("GUARD 1:") for v in violations):
        passed("GUARD 1: szkielet katalogowy v2 obecny")

    # Guard 2: testy v2
    for rel in REQUIRED_V2_TESTS:
        if not (FRONTEND_SRC / rel).exists():
            violations.append(f"GUARD 2: brak testu v2 — {rel}")
    if not any(v.startswith("GUARD 2:") for v in violations):
        passed("GUARD 2: testy v2 obecne")

    # Guard 3: brak importów do wygaszonych modułów
    legacy_imports: list[tuple[Path, int, str]] = []
    import_pattern = re.compile(r"""(?:from|import)\s+['"]([^'"]+)['"]""")
    for ext in ("*.ts", "*.tsx"):
        for f in FRONTEND_SRC.rglob(ext):
            try:
                content = f.read_text(encoding="utf-8")
            except (UnicodeDecodeError, PermissionError):
                continue
            for line_no, line in enumerate(content.splitlines(), start=1):
                m = import_pattern.search(line)
                if not m:
                    continue
                target = m.group(1)
                for forbidden in FORBIDDEN_LEGACY_PATHS:
                    if forbidden in target:
                        legacy_imports.append((f, line_no, target))
    if legacy_imports:
        for f, ln, t in legacy_imports[:10]:
            violations.append(
                f"GUARD 3: import wygaszonego modułu — {f.relative_to(REPO_ROOT)}:{ln} → {t}"
            )
        if len(legacy_imports) > 10:
            violations.append(f"GUARD 3: ... i {len(legacy_imports) - 10} kolejnych")
    else:
        passed("GUARD 3: brak importów do wygaszonych modułów")

    # Guard 4: brak elkjs w package.json
    if PACKAGE_JSON.exists():
        pkg = PACKAGE_JSON.read_text(encoding="utf-8")
        for forbidden_pkg in FORBIDDEN_PKG:
            if f'"{forbidden_pkg}"' in pkg:
                violations.append(f"GUARD 4: wygaszony pakiet w package.json — {forbidden_pkg}")
        if not any(v.startswith("GUARD 4:") for v in violations):
            passed("GUARD 4: brak wygaszonych pakietów w package.json")

    # Guard 5: brak fabrykacji ID/czasu w builder/
    fabrications: list[tuple[Path, int, str]] = []
    builder_dir = FRONTEND_SRC / "ui" / "sld" / "v2" / "builder"
    if builder_dir.exists():
        fab_pattern = re.compile(r"(crypto\.randomUUID|Date\.now\(\)|Math\.random\(\))")
        for f in builder_dir.rglob("*.ts"):
            try:
                content = f.read_text(encoding="utf-8")
            except (UnicodeDecodeError, PermissionError):
                continue
            for line_no, line in enumerate(content.splitlines(), start=1):
                stripped = line.strip()
                if stripped.startswith("//") or stripped.startswith("*"):
                    continue
                m = fab_pattern.search(line)
                if m:
                    fabrications.append((f, line_no, m.group(1)))
    if fabrications:
        for f, ln, t in fabrications:
            violations.append(
                f"GUARD 5: fabrykacja ID/czasu w builder/ — {f.relative_to(REPO_ROOT)}:{ln} → {t}"
            )
    else:
        passed("GUARD 5: brak fabrykacji ID/czasu w builder/")

    # Guard 6: testy v3 obecne
    for rel in REQUIRED_V3_TESTS:
        if not (FRONTEND_SRC / rel).exists():
            violations.append(f"GUARD 6: brak testu v3 — {rel}")
    if not any(v.startswith("GUARD 6:") for v in violations):
        passed("GUARD 6: testy v3 obecne")

    print()
    if violations:
        print(f"{RED}TOTAL: {len(violations)} naruszeń — CI BLOCKED{RESET}")
        for v in violations:
            print(f"  {v}")
        return 1
    print(f"{GREEN}TOTAL: 0 naruszeń — SLD v2 + v3 spójne{RESET}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
