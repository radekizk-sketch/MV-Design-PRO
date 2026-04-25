from __future__ import annotations

from datetime import datetime

import pytest
from application.proof_engine.packs.phase_state_sn import (
    PHASE_STATE_SN_PROOF_TYPE,
    PhaseStateSNProofPack,
    PhaseStateSNProofPackInput,
)
from network_model.solvers.phase_state_sn import (
    OpenPhaseFlags,
    PhaseStateSNInput,
    PhaseStateSNSolver,
    PhaseValues,
)


def _build_solver_input() -> PhaseStateSNInput:
    return PhaseStateSNInput(
        source_voltage_kv=PhaseValues(8.66, 8.66, 8.66),
        load_current_a=PhaseValues(100.0, 100.0, 100.0),
        branch_resistance_ohm=PhaseValues(0.1, 0.1, 0.1),
        fault_current_a=PhaseValues(20.0, 0.0, 0.0),
        open_phase=OpenPhaseFlags(c=True),
        unbalance_alert_percent=10.0,
    )


def _build_pack_input() -> PhaseStateSNProofPackInput:
    return PhaseStateSNProofPackInput(
        project_id="project-001",
        case_id="case-001",
        run_id="run-001",
        snapshot_id="snapshot-001",
        project_name="Projekt testowy",
        case_name="Stan fazowy SN",
        run_timestamp=datetime(2026, 4, 25, 10, 0, 0),
        solver_input=_build_solver_input(),
    )


def test_phase_state_sn_pack_materializes_payload_without_http() -> None:
    payload = PhaseStateSNProofPack.materialize_payload(_build_pack_input())

    assert payload["result_type"] == "phase_state_sn_proof"
    assert payload["proof_type"] == PHASE_STATE_SN_PROOF_TYPE
    assert payload["project_id"] == "project-001"
    assert payload["case_id"] == "case-001"
    assert payload["run_id"] == "run-001"
    assert payload["snapshot_id"] == "snapshot-001"
    assert payload["run_timestamp"] == "2026-04-25T10:00:00"
    assert payload["inputs"]["open_phase"] == {"A": False, "B": False, "C": True}
    assert payload["outputs"]["ua_kv"] == pytest.approx(8.648)
    assert payload["outputs"]["ib_a"] == pytest.approx(100.0)
    assert payload["flags"]["faulted_phases"] == ["A"]
    assert payload["flags"]["open_phases"] == ["C"]
    assert payload["summary"]["max_voltage_drop_kv"] == pytest.approx(8.66)
    assert payload["summary"]["max_phase_loss_kw"] == pytest.approx(1.44)


def test_phase_state_sn_pack_accepts_precomputed_solver_result() -> None:
    pack_input = _build_pack_input()
    solver_result = PhaseStateSNSolver.solve(pack_input.solver_input)

    payload = PhaseStateSNProofPack.materialize_payload(pack_input, solver_result=solver_result)

    assert payload["outputs"] == solver_result.to_dict()
    assert payload["solver_version"] == solver_result.solver_version


def test_phase_state_sn_pack_is_deterministic() -> None:
    pack_input = _build_pack_input()

    first = PhaseStateSNProofPack.materialize_payload(pack_input)
    second = PhaseStateSNProofPack.materialize_payload(pack_input)

    assert first == second
