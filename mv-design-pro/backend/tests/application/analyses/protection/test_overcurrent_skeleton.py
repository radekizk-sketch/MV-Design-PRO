from __future__ import annotations

from application.analyses.iec60909.envelope_adapter import to_run_envelope
from application.analyses.protection.overcurrent.pipeline import run_overcurrent_skeleton
from application.analyses.run_index import index_run
from network_model.solvers.short_circuit_core import ShortCircuitType
from network_model.solvers.short_circuit_iec60909 import ShortCircuitResult

from tests.utils.determinism import assert_deterministic


def _build_short_circuit_result() -> ShortCircuitResult:
    return ShortCircuitResult(
        short_circuit_type=ShortCircuitType.THREE_PHASE,
        fault_node_id="node-1",
        c_factor=1.0,
        un_v=400.0,
        zkk_ohm=complex(0.05, 0.12),
        ikss_a=1234.0,
        ip_a=1500.0,
        ith_a=1100.0,
        sk_mva=1.2,
        rx_ratio=0.4,
        kappa=1.05,
        tk_s=0.2,
        ib_a=1200.0,
        tb_s=0.1,
        ik_thevenin_a=1000.0,
        ik_inverters_a=200.0,
        ik_total_a=1200.0,
        contributions=[],
        branch_contributions=None,
        white_box_trace=[{"step": "init"}],
    )


def test_overcurrent_skeleton_is_deterministic(uow_factory) -> None:
    sc_result = _build_short_circuit_result()
    sc_run_id = "sc-run-1"
    sc_envelope = to_run_envelope(
        sc_result,
        run_id=sc_run_id,
        case_id="case-1",
        base_snapshot_id="snapshot-1",
        inputs_inline={"fault_node_id": "node-1"},
        trace_inline={"steps": [{"name": "init"}]},
    )
    sc_index_entry = index_run(
        sc_envelope,
        primary_artifact_type="short_circuit_result",
        primary_artifact_id=sc_run_id,
        base_snapshot_id="snapshot-1",
        case_id="case-1",
        meta={"short_circuit_result": sc_result.to_dict()},
    )
    with uow_factory() as uow:
        if uow.analysis_runs_index.get(sc_index_entry.run_id) is None:
            uow.analysis_runs_index.add(sc_index_entry)

    envelope1 = run_overcurrent_skeleton(
        sc_run_id=sc_run_id,
        connection_node={"id": "BoundaryNode-1", "voltage_kv": 15.0},
        topology_ref=None,
        uow_factory=uow_factory,
    )
    envelope2 = run_overcurrent_skeleton(
        sc_run_id=sc_run_id,
        connection_node={"id": "BoundaryNode-1", "voltage_kv": 15.0},
        topology_ref=None,
        uow_factory=uow_factory,
    )

    assert envelope1.analysis_type == "protection.overcurrent.v0"
    assert envelope1.inputs.inline is not None
    assert "connection_node" in envelope1.inputs.inline
    assert envelope1.inputs.inline["connection_node"]["id"] == "BoundaryNode-1"
    assert envelope1.fingerprint == envelope2.fingerprint
    assert_deterministic(
        envelope1.to_dict(),
        envelope2.to_dict(),
        scrub_keys=("created_at_utc",),
    )

    with uow_factory() as uow:
        stored = uow.analysis_runs_index.get(envelope1.run_id)
    assert stored is not None
    assert stored.status == "SKELETON"
