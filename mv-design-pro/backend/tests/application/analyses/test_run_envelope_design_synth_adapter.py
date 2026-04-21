from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from application.analyses.design_synth.envelope_adapter import to_run_envelope
from application.analyses.design_synth.result import DesignSynthRunResult

from tests.utils.determinism import assert_deterministic


def test_design_synth_run_envelope_adapter_is_deterministic() -> None:
    result = DesignSynthRunResult(
        case_id=UUID("11111111-1111-1111-1111-111111111111"),
        base_snapshot_id="snapshot-123",
        design_spec_id=UUID("22222222-2222-2222-2222-222222222222"),
        design_proposal_id=UUID("33333333-3333-3333-3333-333333333333"),
        design_evidence_id=UUID("44444444-4444-4444-4444-444444444444"),
        report_json={"summary": {"status": "ok"}},
        created_at=datetime(2025, 1, 5, 12, 0, 0, tzinfo=UTC),
    )
    trace_inline = {"steps": [{"key": "stage-1"}]}

    envelope = to_run_envelope(result, trace_inline=trace_inline)
    envelope_repeat = to_run_envelope(result, trace_inline=trace_inline)

    assert envelope.schema_version == "v0"
    assert envelope.analysis_type == "design_synth.connection_study"
    assert len(envelope.artifacts) == 3
    assert envelope.inputs.base_snapshot_id == "snapshot-123"
    assert envelope.fingerprint == envelope_repeat.fingerprint
    assert_deterministic(envelope.to_dict(), envelope_repeat.to_dict(), scrub_keys=())
