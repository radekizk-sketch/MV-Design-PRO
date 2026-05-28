#!/usr/bin/env python3
"""CI guard: ENM -> SLD adapter must be the source of topology semantics."""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

CHECKS: tuple[tuple[Path, tuple[str, ...]], ...] = (
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/canvas/enmToSldAdapter.ts",
        (
            "buildSldDataFromSnapshot",
            "buildTerminalBindings",
            "terminalBindings",
            "topologyRuns",
            "derConnections",
            "readabilityReport",
        ),
    ),
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/canvas/SldWorkspaceContainer.tsx",
        (
            "buildSldDataFromSnapshot(snapshot, logicalViews)",
            "terminalBindings={sldData.terminalBindings}",
            "connections={sldData.derConnections}",
        ),
    ),
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/canvas/SldCanvasV2.tsx",
        (
            "terminalBindings",
            "data-terminal-bindings",
            "topologyRuns",
        ),
    ),
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/canvas/__tests__/enmToSldAdapter.test.ts",
        (
            "wystawia topologyRuns, terminalBindings, labelSpecs i readabilityReport",
            "DER podpięty do stacji generuje derConnections",
            "missingTerminalRefs",
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
        print("enm_adapter_consistency_guard: NARUSZENIE")
        for violation in violations:
            print(f"  - {violation}")
        return 1

    print("enm_adapter_consistency_guard: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
