#!/usr/bin/env python3
"""CI guard: GPZ 110 kV -> TR -> SN cannot be drawn as a direct tie.

The only GPZ renderer is the SLD v3 canvas fed by the pure composition
``frontend/src/ui/sld/v3/compose/gpz.ts`` (card GPZ-PARYTET: the dead v2
``GpzCanonicalRenderer`` was deleted — no screen rendered it). The composition must keep
the 110 kV side, the HV transformer bay apparatus, the transformer, the transformer field
and the SN section busbar as separate surfaces: the HV connector ends on the HV bay
apparatus (never on the busbar straight into the TR), the SN connector ends on the
transformer field anchor (never straight on the SN busbar), and the composition exposes
the ``noDirectTransformerBusTies`` oracle that the composition tests pin. This guard is
structural: it prevents regressions where the composition bypasses switchgear and draws
one direct line from 110 kV to the SN trunk.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
GPZ_KOMPOZYCJA = REPO_ROOT / "frontend/src/ui/sld/v3/compose/gpz.ts"

REQUIRED_MARKERS: tuple[str, ...] = (
    "parityKeys: ['gpz.transformer.hv_connector']",
    "directTie110: false",
    "terminatesAt: 'hv_tr_bay_apparatus'",
    "parityKeys: ['gpz.transformer.field_anchor_connector']",
    "directTieSn: false",
    "terminatesAt: 'tr_field_anchor'",
    "export function noDirectTransformerBusTies",
)

FORBIDDEN_HINTS: tuple[str, ...] = (
    "direct_110kv_tr_tie",
    "bypass_switchgear",
    "hv_to_sn_direct",
)


def run() -> int:
    if not GPZ_KOMPOZYCJA.exists():
        print(
            f"no_direct_110kv_tr_tie_without_switchgear: missing file {GPZ_KOMPOZYCJA}",
            file=sys.stderr,
        )
        return 1

    text = GPZ_KOMPOZYCJA.read_text(encoding="utf-8")
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
