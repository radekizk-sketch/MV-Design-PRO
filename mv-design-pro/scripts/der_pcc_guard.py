#!/usr/bin/env python3
"""CI guard: DER must expose PCC and connection variant contracts.

This is a structural guard for SLD V2 and ENM integration. It verifies that
the backend model/validator and frontend SLD renderers keep the same contract:
PV/BESS/FW has a station context or explicit PCC plus connection_variant, and
missing data is represented as a blocker instead of a normal result.
"""

from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

CHECKS: tuple[tuple[Path, tuple[str, ...]], ...] = (
    (
        REPO_ROOT / "backend/src/enm/models.py",
        (
            "connection_variant",
            "station_ref",
            "blocking_transformer_ref",
        ),
    ),
    (
        REPO_ROOT / "backend/src/enm/validator.py",
        (
            'code="E028"',
            'payload_hint={"required": "connection_variant"}',
            "connection_variant",
        ),
    ),
    (
        REPO_ROOT / "backend/src/enm/domain_operations_v2.py",
        (
            "connection_variant",
            "station_ref",
            "block_transformer",
            "nn_side",
        ),
    ),
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/renderer/DerRenderer.tsx",
        (
            "missingPcc",
            "data-missing-pcc",
            "sld-v2-der-${id}-missing-pcc",
        ),
    ),
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/renderer/DerConnectionTreeRenderer.tsx",
        (
            "connection_variant",
            "pccLabel",
            "data-missing-pcc",
            "BLOKADA PCC",
        ),
    ),
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/renderer/MiniBlockRmuRenderer.tsx",
        (
            'data-element-kind="pcc"',
            "sld-v2-mini-rmu-pv-pcc",
            "connectionSide",
        ),
    ),
    (
        REPO_ROOT / "frontend/src/ui/sld/v2/__tests__/electricalGraphConsistency.test.ts",
        (
            "Każdy DER",
            "connection_variant",
            "bus_ref",
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
        print("der_pcc_guard: NARUSZENIE")
        for violation in violations:
            print(f"  - {violation}")
        return 1

    print("der_pcc_guard: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
