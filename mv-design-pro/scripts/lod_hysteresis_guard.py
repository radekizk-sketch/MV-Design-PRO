#!/usr/bin/env python3
"""CI guard: SLD LOD policy must be explicit, tested, and stable."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

CHECKS: tuple[tuple[Path, tuple[str, ...]], ...] = (
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/lod/LodPolicy.ts",
        (
            "inferLodFromScale",
            "isVisibleAtLod",
            "LodLevel",
        ),
    ),
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx",
        (
            "data-lod",
            "lodOverride",
            "inferLodFromScale",
        ),
    ),
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/canvas/__tests__/SldCanvasV2.lodIntegration.test.tsx",
        (
            "data-lod",
            "lodOverride",
            "LodController",
        ),
    ),
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/__tests__/LodPolicy.test.ts",
        (
            "inferLodFromScale",
            "0.299",
            "3.0",
        ),
    ),
)


def run() -> int:
    violations: list[str] = []
    for path, markers in CHECKS:
        if not path.exists():
            violations.append(f"brak pliku: {path.relative_to(REPO_ROOT)}")
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for marker in markers:
            if marker not in text:
                violations.append(f"{path.relative_to(REPO_ROOT)}: brak znacznika {marker!r}")

    if violations:
        print("lod_hysteresis_guard: NARUSZENIE")
        for violation in violations:
            print(f"  - {violation}")
        return 1

    print("lod_hysteresis_guard: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
