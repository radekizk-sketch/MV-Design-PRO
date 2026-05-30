#!/usr/bin/env python3
"""Generate the SLD substrate >=52-station fixture (canonical ENM JSON) for the
frontend layout-engine tests.

Bridge: backend `build_sld_substrate_52s()` -> `EnergyNetworkModel.model_validate`
-> canonical `model_dump(mode="json")` -> normalized, deterministic JSON committed at
`frontend/src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.enm.json`.

The frontend test loads this raw ENM via the *real* `readTopologyFromENM` reader
(the documented load path) -> `TopologyInputV1` -> `LayoutEngine.layout(...)`. This
keeps the ENM as the single source (no derived second truth) while giving the
layout a real >=52-station input.

Determinism (M-07): `created_at`/`updated_at` are pinned to a constant and
`header.hash_sha256` is set to the builder's deterministic snapshot hash, so the
committed JSON is byte-stable across regenerations.

Run from `backend/` (it owns the poetry env + tests package root):
    poetry run python ../frontend/scripts/generate-sld-substrate-fixture.py
"""

from __future__ import annotations

import json
import pathlib
import sys

_THIS = pathlib.Path(__file__).resolve()
_FRONTEND = _THIS.parent.parent
_REPO = _FRONTEND.parent
_BACKEND = _REPO / "backend"
sys.path.insert(0, str(_BACKEND / "src"))
sys.path.insert(0, str(_BACKEND))

from tests.reference_networks.sld_substrate_52s import build_sld_substrate_52s  # noqa: E402
from enm.models import EnergyNetworkModel  # noqa: E402

_FIXED_TS = "2026-05-29T00:00:00Z"


def main() -> int:
    result = build_sld_substrate_52s()
    enm_dict = result["enm"]
    builder_hash = result["snapshot_hash"]

    model = EnergyNetworkModel.model_validate(enm_dict)
    dumped = model.model_dump(mode="json")

    header = dumped["header"]
    header["created_at"] = _FIXED_TS
    header["updated_at"] = _FIXED_TS
    header["hash_sha256"] = builder_hash  # reader uses this for snapshotFingerprint

    fixture = {
        "_meta": {
            "source": "backend tests/reference_networks/sld_substrate_52s.build_sld_substrate_52s",
            "builder_snapshot_hash": builder_hash,
            "station_count": result["station_count"],
            "trunk_station_count": result["trunk_station_count"],
            "lateral_station_count": result["lateral_station_count"],
            "branch_count": result["branch_count"],
            "lateral_count": result["lateral_count"],
            "der_count": result["der_count"],
            "der_types": sorted(result["der_types"]),
            "note": (
                "Canonical ENM for the SLD layout engine. Loaded via readTopologyFromENM "
                "(real bridge) in Vitest. Regenerate with "
                "scripts/generate-sld-substrate-fixture.py. Deterministic: timestamps "
                "pinned, hash = builder snapshot hash."
            ),
        },
        "enm": dumped,
    }

    out_dir = _FRONTEND / "src" / "ui" / "sld" / "v2" / "geometry" / "__tests__" / "fixtures"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "sldSubstrate52s.enm.json"
    out_path.write_text(
        json.dumps(fixture, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"WROTE {out_path}")
    print(
        f"  stations={result['station_count']} branches={result['branch_count']} "
        f"der={result['der_count']} hash={builder_hash[:16]}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
