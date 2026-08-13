#!/usr/bin/env python3
"""CI guard: GPZ 110 kV -> TR -> SN cannot be rendered as a direct tie.

The active SLD V2 GPZ renderer must keep the 110 kV side, transformer bay
apparatus, transformer symbol, SN section busbar and outgoing feeder field as
separate switchgear surfaces. This guard is structural: it prevents regressions
where a renderer bypasses switchgear and draws one direct line from 110 kV to
the SN trunk.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
GPZ_CANONICAL_RENDERER = REPO_ROOT / "frontend/src/ui/sld/v2/renderer/GpzCanonicalRenderer.tsx"

REQUIRED_MARKERS: tuple[str, ...] = (
    'data-testid="gpz-canonical-hv-bus"',
    'data-testid="gpz-canonical-tr-field-columns"',
    "data-testid={`gpz-canonical-tr-field-${transformerRef}`}",
    "data-testid={`gpz-canonical-transformer-${transformer.transformerRef}`}",
    "data-testid={`gpz-canonical-section-${section.sectionId}`}",
    "data-testid={`gpz-canonical-bay-${bay.bayRef}`}",
)

FORBIDDEN_HINTS: tuple[str, ...] = (
    "direct_110kv_tr_tie",
    "bypass_switchgear",
    "hv_to_sn_direct",
)


def run() -> int:
    if not GPZ_CANONICAL_RENDERER.exists():
        print(
            f"no_direct_110kv_tr_tie_without_switchgear: missing file {GPZ_CANONICAL_RENDERER}",
            file=sys.stderr,
        )
        return 1

    text = GPZ_CANONICAL_RENDERER.read_text(encoding="utf-8")
    missing = [marker for marker in REQUIRED_MARKERS if marker not in text]
    forbidden = [marker for marker in FORBIDDEN_HINTS if marker in text]

    if missing or forbidden:
        if missing:
            print("no_direct_110kv_tr_tie_without_switchgear: missing required switchgear markers:")
            for marker in missing:
                print(f"  - {marker}")
        if forbidden:
            print("no_direct_110kv_tr_tie_without_switchgear: forbidden bypass markers found:")
            for marker in forbidden:
                print(f"  - {marker}")
        return 1

    print("no_direct_110kv_tr_tie_without_switchgear: OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
