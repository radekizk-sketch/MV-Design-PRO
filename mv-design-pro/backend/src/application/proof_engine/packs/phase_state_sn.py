"""Helper proof-pack dla minimalnego solvera stanu fazowego SN bez integracji HTTP."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from network_model.solvers.phase_state_sn import (
    PHASE_ORDER,
    PhaseStateSNInput,
    PhaseStateSNResult,
    PhaseStateSNSolver,
)

PHASE_STATE_SN_PROOF_TYPE = "PHASE_STATE_SN"


@dataclass(frozen=True)
class PhaseStateSNProofPackInput:
    """Wejscie helpera proof-pack dla materializacji payloadu proof."""

    project_id: str
    case_id: str
    run_id: str
    snapshot_id: str
    project_name: str
    case_name: str
    run_timestamp: datetime
    solver_input: PhaseStateSNInput
    scenario_name: str = "radial_reference"


class PhaseStateSNProofPack:
    """Materializacja payloadu proof dla wyniku phase_state_sn."""

    @classmethod
    def materialize_payload(
        cls,
        data: PhaseStateSNProofPackInput,
        solver_result: PhaseStateSNResult | None = None,
    ) -> dict[str, Any]:
        result = (
            solver_result
            if solver_result is not None
            else PhaseStateSNSolver.solve(data.solver_input)
        )
        voltage_drop = _compute_voltage_drop(data.solver_input, result)

        return {
            "result_type": "phase_state_sn_proof",
            "proof_type": PHASE_STATE_SN_PROOF_TYPE,
            "project_id": data.project_id,
            "case_id": data.case_id,
            "run_id": data.run_id,
            "snapshot_id": data.snapshot_id,
            "project_name": data.project_name,
            "case_name": data.case_name,
            "scenario_name": data.scenario_name,
            "run_timestamp": data.run_timestamp.isoformat(),
            "solver_version": result.solver_version,
            "inputs": data.solver_input.to_dict(),
            "outputs": result.to_dict(),
            "summary": {
                "faulted_phases": list(result.flags.faulted_phases),
                "open_phases": list(result.flags.open_phases),
                "max_voltage_drop_kv": max(voltage_drop.values()),
                "max_phase_loss_kw": max(result.phase_losses_kw.as_tuple()),
                "voltage_unbalance_percent": result.unbalance_indices.voltage_percent,
                "current_unbalance_percent": result.unbalance_indices.current_percent,
                "losses_unbalance_percent": result.unbalance_indices.losses_percent,
            },
            "flags": result.flags.to_dict(),
        }


def _compute_voltage_drop(
    solver_input: PhaseStateSNInput,
    solver_result: PhaseStateSNResult,
) -> dict[str, float]:
    drops: dict[str, float] = {}
    for phase, source_kv, delivered_kv in zip(
        PHASE_ORDER,
        solver_input.source_voltage_kv.as_tuple(),
        solver_result.phase_voltage_kv.as_tuple(),
        strict=True,
    ):
        drops[phase] = max(source_kv - delivered_kv, 0.0)
    return drops
