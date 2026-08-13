"""Emit the COMPACT SLD network model (distilled from the 53-station ENM substrate) as a
deterministic TypeScript fixture the SLD network auto-layout (E3) reads — the same generate-from-
the-model pattern as ozeArchetypes2a.ts. Run: poetry run python scripts/emit_sld_network_fixture.py
"""

from __future__ import annotations

import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_BACKEND, "src"))
sys.path.append(os.path.join(_BACKEND, "tests"))

from application.reference_networks.sld_network_model import (  # noqa: E402
    distill_sld_network,
    render_sld_network_fixture,
)
from reference_networks.sld_substrate_52s import build_sld_substrate_52s  # noqa: E402

_OUT = os.path.normpath(
    os.path.join(
        _BACKEND,
        "..",
        "frontend",
        "src",
        "ui",
        "sld",
        "v2",
        "station-rozdzielnia",
        "autolayout",
        "network",
        "sldNetwork53.ts",
    )
)



def main() -> None:
    env = build_sld_substrate_52s()
    model = distill_sld_network(env["enm"])
    model["source_hash"] = env.get("snapshot_hash", "")
    ts = render_sld_network_fixture(model)
    os.makedirs(os.path.dirname(_OUT), exist_ok=True)
    with open(_OUT, "w", encoding="utf-8") as fh:
        fh.write(ts)
    print(
        f"wrote {_OUT}  ({len(model['stations'])} stations, {len(model['edges'])} edges, "
        f"nop={model['nop_station']})"
    )


if __name__ == "__main__":
    main()
