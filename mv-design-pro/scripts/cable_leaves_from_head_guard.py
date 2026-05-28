#!/usr/bin/env python3
"""CI guard: odcinek SN musi wychodzic z kanonicznej glowicy/portu.

Guard sprawdza kontrakt renderera SLD, a nie geometrii runtime:
- `CableRunRenderer` musi miec `data-symbol-canon="cable_head_triangle"`,
- start magistrali musi miec `data-port-binding="trunk-start-head"`,
- stacja mini-RMU musi wystawiac `data-port-magnet="true"` i hit area portu.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
CABLE_RENDERER = REPO_ROOT / "frontend/src/ui/sld/v2/renderer/CableRunRenderer.tsx"
STATION_RENDERER = REPO_ROOT / "frontend/src/ui/sld/v2/renderer/MiniBlockRmuRenderer.tsx"

REQUIRED_CABLE_MARKERS = (
    'data-symbol-canon="cable_head_triangle"',
    'data-port-binding="trunk-start-head"',
    "sld-v2-run-${id}-cable-head",
)

REQUIRED_STATION_MARKERS = (
    "sld-v2-mini-rmu-port-anchor-",
    'data-port-magnet="true"',
    'data-hit-area="true"',
    'data-busbar-section="SN"',
)


def check_file(path: Path, markers: tuple[str, ...]) -> list[str]:
    if not path.exists():
        return [f"brak pliku {path}"]
    text = path.read_text(encoding="utf-8")
    return [marker for marker in markers if marker not in text]


def run() -> int:
    missing = []
    for marker in check_file(CABLE_RENDERER, REQUIRED_CABLE_MARKERS):
        missing.append(f"CableRunRenderer: {marker}")
    for marker in check_file(STATION_RENDERER, REQUIRED_STATION_MARKERS):
        missing.append(f"MiniBlockRmuRenderer: {marker}")

    if missing:
        print("cable_leaves_from_head_guard: NARUSZENIE")
        for marker in missing:
            print(f"  - {marker}")
        return 1

    print("cable_leaves_from_head_guard: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
