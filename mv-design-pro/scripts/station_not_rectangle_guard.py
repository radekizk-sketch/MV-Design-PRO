#!/usr/bin/env python3
"""CI Guard: Stacja SN/nN nie jest pojedynczym prostokątem ani rombem.

Strukturalny guard dla goal §7 — stacja LOD 0/1 musi być mini-RMU z polami
IN/OUT/TR/DER (4 mini-pola), NIE pojedynczym <rect> lub <polygon>.

Sprawdza obecność znaczników w `MiniBlockRmuRenderer.tsx`:
- `sld-v2-mini-rmu-` (kontener z id),
- `sld-v2-mini-rmu-sn-row` (rząd SN),
- `sld-v2-mini-rmu-lv-row` (rząd nN),
- `sld-v2-mini-rmu-bay-marker-` (markery pól),
- `sld-v2-mini-rmu-tr-triangle` (transformator).

EXIT 0 — wszystkie znaczniki obecne, EXIT 1 — brak któregoś.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MINI_RMU_PATH = (
    REPO_ROOT
    / "frontend/src/ui/sld/v2/renderer/MiniBlockRmuRenderer.tsx"
)

REQUIRED_MARKERS: tuple[str, ...] = (
    "sld-v2-mini-rmu-",  # kontener z id
    "sld-v2-mini-rmu-sn-row",
    "sld-v2-mini-rmu-lv-row",
    "sld-v2-mini-rmu-bay-marker-",
    "sld-v2-mini-rmu-tr-triangle",
)


def run() -> int:
    if not MINI_RMU_PATH.exists():
        print(
            f"station_not_rectangle_guard: BŁĄD — brak pliku {MINI_RMU_PATH}",
            file=sys.stderr,
        )
        return 1

    text = MINI_RMU_PATH.read_text(encoding="utf-8")
    missing: list[str] = []
    for marker in REQUIRED_MARKERS:
        if marker not in text:
            missing.append(marker)

    if missing:
        print(
            "station_not_rectangle_guard: NARUSZENIE — brak wymaganych znaczników:",
        )
        for marker in missing:
            print(f"  - {marker}")
        print(
            "\nMiniBlockRmuRenderer musi pokazywać mini-RMU z polami IN/OUT/TR/DER, "
            "NIE pojedynczy <rect> ani <polygon>.",
        )
        return 1

    print(
        "station_not_rectangle_guard: OK — stacja jest mini-RMU z polami "
        f"({len(REQUIRED_MARKERS)}/{len(REQUIRED_MARKERS)})."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
