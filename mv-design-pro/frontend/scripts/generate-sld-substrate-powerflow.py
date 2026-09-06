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

SECOND (maintenance) companion (E2E-FIX, 2026-09-05): SUB-52s ring-closed the
substrate's only NOP island, so the state-normal companion above now carries
ZERO de-energized buses (a genuine fix — a stranded stub was ENMValidator
E003, a defect). That left the render-based e2e assert for a de-energised
(dimmed) station with nothing real to point at. `compute_substrate_power_flow_maintenance`
builds a SECOND companion on a deterministically picked `OperatingScenario
(kind=MAINTENANCE)` (a station taken out of service via its incident SN
branches — see that function's docstring for the exact §0.B/§0.C decision) and
writes it next to the normal companion, same two locations, `.maintenance`
suffix:
  - frontend/public/test-fixtures/sldSubstrate52s.powerflow.maintenance.json
  - frontend/src/ui/sld/v2/geometry/__tests__/fixtures/sldSubstrate52s.powerflow.maintenance.json
The normal companion's own generation is UNCHANGED (same call, same output) —
this addition never touches it.

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
    compute_substrate_power_flow_maintenance,
)

# DEFINED case_ref for the substrate: the normal radial operating state (all NOPs
# open, all DER at setpoint). Shown on the SLD canvas as the active state.
_CASE_REF = "case/sld-substrate-radial-normal"
_CASE_LABEL = "Stan normalny (radialny, NO otwarte)"

# DEFINED case_ref for the maintenance state (E2E-FIX): one ring station taken
# out of service. Shown on the SLD canvas when the harness/spec asks for it
# (`?case=maintenance`).
_CASE_REF_MAINT = "case/sld-substrate-maintenance-isolated-station"
_CASE_LABEL_MAINT = "Wylaczenie stacji do konserwacji (rezerwa pierscieniowa)"

_FIXTURE_DIRS = (
    _FRONTEND / "public" / "test-fixtures",
    _FRONTEND / "src" / "ui" / "sld" / "v2" / "geometry" / "__tests__" / "fixtures",
)


def _write_companion(companion: dict, *, filename: str) -> None:
    payload = json.dumps(companion, ensure_ascii=False, sort_keys=True, indent=2) + "\n"
    for fixture_dir in _FIXTURE_DIRS:
        out_path = fixture_dir / filename
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(payload, encoding="utf-8")
        print(f"WROTE {out_path}")


def _print_summary(companion: dict, *, label: str) -> None:
    forward = sum(1 for v in companion["branch_flow"].values() if v["direction"] == "forward")
    reverse = sum(1 for v in companion["branch_flow"].values() if v["direction"] == "reverse")
    none = sum(1 for v in companion["branch_flow"].values() if v["direction"] == "none")
    print(
        f"  [{label}] converged={companion['converged']} iters={companion['iterations']} "
        f"forward={forward} reverse={reverse} none={none} "
        f"energized_buses={len(companion['energized_bus_refs'])} "
        f"de_energized_buses={len(companion['de_energized_bus_refs'])} "
        f"open_points={len(companion['open_point_branch_refs'])}"
    )
    print(f"  [{label}] enm_hash={companion['enm_hash'][:16]}")
    scenario = companion.get("scenario")
    if scenario is not None:
        print(
            f"  [{label}] scenario_id={scenario['scenario_id']} "
            f"out_of_service={scenario['out_of_service']}"
        )


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
    _write_companion(companion, filename="sldSubstrate52s.powerflow.json")
    _print_summary(companion, label="normal")

    companion_maintenance = compute_substrate_power_flow_maintenance(
        enm, case_ref=_CASE_REF_MAINT, case_label=_CASE_LABEL_MAINT
    )
    _write_companion(companion_maintenance, filename="sldSubstrate52s.powerflow.maintenance.json")
    _print_summary(companion_maintenance, label="maintenance")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
