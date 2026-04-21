from __future__ import annotations

from application.analyses.iec60909.envelope_adapter import to_run_envelope
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


def test_to_run_envelope_iec60909_deterministic() -> None:
    result = _build_short_circuit_result()
    run_id = "00000000-0000-0000-0000-000000000001"
    inputs_inline = {"fault_node_id": "node-1", "short_circuit_type": "3F"}
    trace_inline = {"steps": [{"name": "init"}]}

    envelope1 = to_run_envelope(
        result,
        run_id=run_id,
        case_id="case-1",
        base_snapshot_id="snapshot-1",
        inputs_inline=inputs_inline,
        trace_inline=trace_inline,
    )
    envelope2 = to_run_envelope(
        result,
        run_id=run_id,
        case_id="case-1",
        base_snapshot_id="snapshot-1",
        inputs_inline=inputs_inline,
        trace_inline=trace_inline,
    )

    assert_deterministic(
        envelope1.to_dict(),
        envelope2.to_dict(),
        scrub_keys=("created_at_utc",),
    )
    assert envelope1.fingerprint == envelope2.fingerprint
    assert envelope1.analysis_type == "short_circuit.iec60909"
    assert envelope1.inputs.base_snapshot_id == "snapshot-1"
    assert envelope1.trace is not None
    assert envelope1.trace.type == "white_box"
