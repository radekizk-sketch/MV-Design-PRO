#!/usr/bin/env python3
"""Generate the SLD substrate FROZEN-SOLVER power-flow companion (P-A).

Runs the production load-flow path on the committed substrate ENM and writes the
deterministic per-branch direction + energization companion next to the ENM
fixture. The SLD render path reads THIS file (the one truth) to draw the
power-flow tor — it never recomputes direction/energization itself.

Bridge: backend `build_sld_substrate_52s()` -> `EnergyNetworkModel` ->
`application.reference_networks.sld_substrate_power_flow.compute_substrate_power_flow`
(which runs `solve_power_flow_physics`, the FROZEN solver) -> companion JSON
committed at both fixture locations used by the harness and the layout tests:
  - frontend/public/test-fixtures/sldSubstrate52s.powerflow.json   (harness fetch)
  - frontend/src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.powerflow.json

Determinism (ZASADA NR 7): the solver is deterministic and all companion outputs
are sorted / fixed-scale, so the committed JSON is byte-stable across regenerations.

Run from `backend/` (it owns the poetry env + tests package root):
    poetry run python ../frontend/scripts/generate-sld-substrate-powerflow.py
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
from application.reference_networks.sld_substrate_power_flow import (  # noqa: E402
    compute_substrate_power_flow,
)

# DEFINED case_ref for the substrate: the normal radial operating state (all NOPs
# open, all DER at setpoint). Shown on the SLD canvas as the active state.
_CASE_REF = "case/sld-substrate-radial-normal"
_CASE_LABEL = "Stan normalny (radialny, NO otwarte)"


def main() -> int:
    result = build_sld_substrate_52s()
    enm = EnergyNetworkModel.model_validate(result["enm"])

    companion = compute_substrate_power_flow(
        enm,
        case_ref=_CASE_REF,
        case_label=_CASE_LABEL,
        # Bind to the ENM fixture via the builder snapshot hash (== the ENM
        # fixture's _meta.builder_snapshot_hash / header.hash_sha256).
        enm_hash=result["snapshot_hash"],
    )

    out_paths = [
        _FRONTEND / "public" / "test-fixtures" / "sldSubstrate52s.powerflow.json",
        _FRONTEND
        / "src"
        / "ui"
        / "sld"
        / "v2"
        / "geometry"
        / "__tests__"
        / "fixtures"
        / "sldSubstrate52s.powerflow.json",
    ]
    payload = json.dumps(companion, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    for out_path in out_paths:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(payload, encoding="utf-8")
        print(f"WROTE {out_path}")

    forward = sum(1 for v in companion["branch_flow"].values() if v["direction"] == "forward")
    reverse = sum(1 for v in companion["branch_flow"].values() if v["direction"] == "reverse")
    none = sum(1 for v in companion["branch_flow"].values() if v["direction"] == "none")
    print(
        f"  converged={companion['converged']} iters={companion['iterations']} "
        f"forward={forward} reverse={reverse} none={none} "
        f"energized_buses={len(companion['energized_bus_refs'])} "
        f"de_energized_buses={len(companion['de_energized_bus_refs'])} "
        f"open_points={len(companion['open_point_branch_refs'])}"
    )
    print(f"  enm_hash={companion['enm_hash'][:16]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
