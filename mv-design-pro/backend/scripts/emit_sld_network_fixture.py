"""Emit the COMPACT SLD network model (distilled from the 53-station ENM substrate) as a
deterministic TypeScript fixture the SLD network auto-layout (E3) reads — the same generate-from-
the-model pattern as ozeArchetypes2a.ts. Run: poetry run python scripts/emit_sld_network_fixture.py

Zrodlo ENM i odcisku: ``enm_fikstury_substratu()`` — TEN SAM model (po regule zapisu liczb
fikstur) co ``sldSubstrate52s.enm.json``, wiec ``source_hash`` rowna sie odciskowi w naglowku
fikstury substratu. Test regeneracji: ``tests/application/test_companions_generated.py``.
"""

from __future__ import annotations

import sys
from pathlib import Path

_BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_BACKEND / "src"))
sys.path.insert(0, str(_BACKEND))

from tests.golden.sld_network_model import (  # noqa: E402
    distill_sld_network,
    render_sld_network_fixture,
)
from tests.reference_networks.sld_substrate_fixtures import enm_fikstury_substratu  # noqa: E402

_OUT = (
    _BACKEND.parent
    / "frontend"
    / "src"
    / "ui"
    / "sld"
    / "v2"
    / "station-rozdzielnia"
    / "autolayout"
    / "network"
    / "sldNetwork53.ts"
)


def main() -> None:
    _wynik, enm, odcisk = enm_fikstury_substratu()
    model = distill_sld_network(enm)
    model["source_hash"] = odcisk
    _OUT.parent.mkdir(parents=True, exist_ok=True)
    _OUT.write_text(render_sld_network_fixture(model), encoding="utf-8")
    print(
        f"wrote {_OUT}  ({len(model['stations'])} stations, {len(model['edges'])} edges, "
        f"nop={model['nop_station']})"
    )


if __name__ == "__main__":
    main()
