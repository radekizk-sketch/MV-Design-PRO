#!/usr/bin/env python3
"""CI guard: SLD labels must have deterministic anti-collision coverage."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

CHECKS: tuple[tuple[Path, tuple[str, ...]], ...] = (
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/canvas/LabelDeclutter.ts",
        (
            "declutterLabels",
            "computeDeclutterMetrics",
            "lockedAnchor",
        ),
    ),
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts",
        (
            "buildReadabilityReport",
            "criticalCollisions",
            "declutterLabels",
        ),
    ),
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx",
        (
            "data-critical-label-collisions",
            "data-readability-score",
            "buildVisibleTopologyLabels",
        ),
    ),
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/__tests__/readabilityMetrics.test.ts",
        (
            "Priority labels overlap = 0",
            "Critical object overlap = 0",
            "network_30",
        ),
    ),
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/renderer/CableRunRenderer.tsx",
        (
            "declutterSegmentLabels",
            "avoidStationLabelCollision",
            "avoidPendingEndpointLabelCollision",
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
        print("label_overlap_guard: NARUSZENIE")
        for violation in violations:
            print(f"  - {violation}")
        return 1

    print("label_overlap_guard: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
