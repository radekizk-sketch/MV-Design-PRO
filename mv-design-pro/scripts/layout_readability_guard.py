#!/usr/bin/env python3
"""CI guard: SLD layout must expose readability metrics and corridor tests."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

CHECKS: tuple[tuple[Path, tuple[str, ...]], ...] = (
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts",
        (
            "readabilityReport",
            "orphanStationRefs",
            "missingTerminalRefs",
            "topologyContinuity",
        ),
    ),
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx",
        (
            "data-topology-continuity",
            "data-orphan-stations",
            "data-missing-terminals",
        ),
    ),
    # (readabilityMetrics.test.ts usunięty w konsolidacji 2026-07 — testował
    #  martwy CorridorLayout; anti-overlap żywej ścieżki pokrywa LabelDeclutter.)
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/canvas/__tests__/LabelDeclutter.test.ts",
        (
            "declutter",
        ),
    ),
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/__tests__/performance.perf.test.ts",
        (
            "network_80",
            "declutterLabels",
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
        print("layout_readability_guard: NARUSZENIE")
        for violation in violations:
            print(f"  - {violation}")
        return 1

    print("layout_readability_guard: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
