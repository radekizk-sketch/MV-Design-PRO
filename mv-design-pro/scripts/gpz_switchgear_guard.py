#!/usr/bin/env python3
"""CI Guard: GPZ renderery muszą deklarować strukturę przemysłową.

Strukturalny guard dla goal §6 — GPZ LOD ≥2 musi pokazywać sekcje szyn,
pola liniowe/transformatorowe, TR 110/SN i bilans P/Q (kanon SCADA).

Sprawdza obecność znaczników `data-testid` w `GpzCanonicalRenderer.tsx` /
`GpzSwitchgearRenderer.tsx`:
- `sld-v2-gpz-switchgear-transformer-symbol` (TR 110/SN),
- `sld-v2-gpz-switchgear-hv-bus` (szyna 110 kV),
- `sld-v2-gpz-switchgear-lv-bus` (szyna SN),
- `sld-v2-gpz-section-label-` (etykiety sekcji),
- `sld-v2-gpz-field-trunk-zone` (strefa pól odpływowych).

EXIT 0 — wszystkie znaczniki obecne, EXIT 1 — brak któregoś.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
GPZ_SWITCHGEAR_PATH = REPO_ROOT / "frontend/src/ui/sld/v2/renderer/GpzSwitchgearRenderer.tsx"

REQUIRED_MARKERS: tuple[str, ...] = (
    "sld-v2-gpz-switchgear-transformer-symbol",
    "sld-v2-gpz-switchgear-hv-bus",
    "sld-v2-gpz-switchgear-lv-bus",
    "sld-v2-gpz-section-label-",
    "sld-v2-gpz-field-trunk-zone",
)


def run() -> int:
    if not GPZ_SWITCHGEAR_PATH.exists():
        print(
            f"gpz_switchgear_guard: BŁĄD — brak pliku {GPZ_SWITCHGEAR_PATH}",
            file=sys.stderr,
        )
        return 1

    text = GPZ_SWITCHGEAR_PATH.read_text(encoding="utf-8")
    missing: list[str] = []
    for marker in REQUIRED_MARKERS:
        if marker not in text:
            missing.append(marker)

    if missing:
        print("gpz_switchgear_guard: NARUSZENIE — brak wymaganych znaczników:")
        for marker in missing:
            print(f"  - {marker}")
        print(
            "\nGPZ Renderer (`GpzSwitchgearRenderer.tsx`) musi deklarować pełną "
            "rozdzielnię przemysłową: szyny HV/LV, TR 110/SN, sekcje, pola.",
        )
        return 1

    print(
        "gpz_switchgear_guard: OK — wszystkie wymagane znaczniki obecne "
        f"({len(REQUIRED_MARKERS)}/{len(REQUIRED_MARKERS)})."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
