from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from application.analyses.design_synth.canonical import canonicalize_json
from application.analyses.design_synth.fingerprint import fingerprint_json
from application.analyses.protection.overcurrent.calculator import (
    OvercurrentConfigV0,
    compute_overcurrent_settings,
)
from application.analyses.protection.overcurrent.envelope_adapter import to_run_envelope
from application.analyses.protection.overcurrent.input_adapter import build_protection_input
from application.analyses.protection.overcurrent.inputs import ProtectionInput
from application.analyses.protection.overcurrent.reporting import (
    build_overcurrent_report_v0,
)
from application.analyses.protection.overcurrent.settings import OvercurrentSettingsV0
from application.analyses.run_envelope import (
    AnalysisRunEnvelope,
    ArtifactRef,
    InputsRef,
    TraceRef,
    fingerprint_envelope,
)
from application.analyses.run_index import AnalysisRunIndexEntry, index_run
from infrastructure.persistence.unit_of_work import UnitOfWork
from network_model.solvers.short_circuit_core import ShortCircuitType
from network_model.solvers.short_circuit_iec60909 import ShortCircuitResult


def run_overcurrent_skeleton(
    *,
    sc_run_id: str,
    connection_node: dict[str, Any],
    topology_ref: dict[str, Any] | None,
    uow_factory: Callable[[], UnitOfWork],
) -> AnalysisRunEnvelope:
    entry = _read_short_circuit_index_entry(sc_run_id, uow_factory=uow_factory)
    sc_payload = _extract_short_circuit_payload(entry.meta_json)
    sc_result = _build_short_circuit_result(sc_payload)
    object.__setattr__(sc_result, "run_id", sc_run_id)

    protection_input = build_protection_input(
        sc_result,
        case_id=entry.case_id,
        base_snapshot_id=entry.base_snapshot_id,
        connection_node=connection_node,
        topology_ref=topology_ref,
    )
    outputs = {"status": "NOT_COMPUTED", "note": "Skeleton run"}
    trace_inline = _build_trace_inline()
    run_id = _build_deterministic_run_id(protection_input, outputs)

    envelope = to_run_envelope(
        protection_input,
        outputs=outputs,
        run_id=run_id,
        case_id=entry.case_id,
        base_snapshot_id=entry.base_snapshot_id,
        trace_inline=trace_inline,
        created_at_utc=datetime.now(UTC).isoformat(),
    )
    _persist_run_index(envelope, protection_input, uow_factory=uow_factory)
    return envelope


def run_overcurrent_v0(
    *,
    sc_run_id: str,
    connection_node: dict[str, Any],
    topology_ref: dict[str, Any] | None,
    uow_factory: Callable[[], UnitOfWork],
    config: OvercurrentConfigV0 | None = None,
) -> AnalysisRunEnvelope:
    entry = _read_short_circuit_index_entry(sc_run_id, uow_factory=uow_factory)
    sc_payload = _extract_short_circuit_payload(entry.meta_json)
    sc_result = _build_short_circuit_result(sc_payload)
    object.__setattr__(sc_result, "run_id", sc_run_id)

    protection_input = build_protection_input(
        sc_result,
        case_id=entry.case_id,
        base_snapshot_id=entry.base_snapshot_id,
        connection_node=connection_node,
        topology_ref=topology_ref,
    )
    settings = compute_overcurrent_settings(protection_input, config=config)
    report_json = build_overcurrent_report_v0(
        protection_input,
        settings,
        run_meta={"source_run_id": sc_run_id},
    )
    report_fingerprint = report_json["fingerprint"]
    status = "SUCCEEDED" if not settings.warnings else "DEGRADED"

    input_fingerprint = fingerprint_json(protection_input.to_dict())
    settings_fingerprint = fingerprint_json(settings.to_dict())
    run_id = _build_run_id(
        protection_input, settings, report_fingerprint, analysis_type="protection.overcurrent.v0"
    )
    artifacts = (
        ArtifactRef(
            type="protection_input",
            id=f"protection_input:{input_fingerprint}",
        ),
        ArtifactRef(
            type="protection_settings_v0",
            id=f"protection_settings_v0:{settings_fingerprint}",
        ),
        ArtifactRef(
            type="protection_report_v0",
            id=f"protection_report_v0:{report_fingerprint}",
        ),
    )
    trace_inline = _build_trace_overcurrent_v0(
        sc_run_id=sc_run_id,
        sc_payload=sc_payload,
        protection_input=protection_input,
        settings=settings,
        report_json=report_json,
        report_fingerprint=report_fingerprint,
        status=status,
    )

    created_at_utc = datetime.now(UTC).isoformat()
    inputs = InputsRef(
        base_snapshot_id=entry.base_snapshot_id,
        spec_ref=None,
        inline=protection_input.to_dict(),
    )
    trace = TraceRef(type="white_box", id=None, inline=trace_inline)
    envelope_dict = {
        "schema_version": "v0",
        "run_id": run_id,
        "analysis_type": "protection.overcurrent.v0",
        "case_id": entry.case_id,
        "inputs": inputs.to_dict(),
        "artifacts": [artifact.to_dict() for artifact in artifacts],
        "trace": trace.to_dict(),
        "created_at_utc": created_at_utc,
        "fingerprint": "",
    }
    fingerprint = fingerprint_envelope(envelope_dict)
    envelope = AnalysisRunEnvelope(
        run_id=run_id,
        analysis_type="protection.overcurrent.v0",
        case_id=entry.case_id,
        inputs=inputs,
        artifacts=artifacts,
        trace=trace,
        created_at_utc=created_at_utc,
        fingerprint=fingerprint,
    )
    _persist_run_index_v0(
        envelope,
        protection_input,
        report_fingerprint=report_fingerprint,
        status=status,
        uow_factory=uow_factory,
    )
    return envelope


def _read_short_circuit_index_entry(
    sc_run_id: str, *, uow_factory: Callable[[], UnitOfWork]
) -> AnalysisRunIndexEntry:
    with uow_factory() as uow:
        entry = uow.analysis_runs_index.get(sc_run_id)
    if entry is None:
        raise ValueError("Short circuit run not found")
    if entry.analysis_type != "short_circuit.iec60909":
        raise ValueError("Unsupported short circuit run type")
    return entry


def _extract_short_circuit_payload(meta_json: dict[str, Any] | None) -> dict[str, Any]:
    if isinstance(meta_json, dict):
        payload = meta_json.get("short_circuit_result")
        if isinstance(payload, dict):
            return payload
    raise ValueError("Short circuit result payload not available")


def _required_sc_field(payload: dict[str, Any], key: str) -> float:
    """Required numeric field of a stored ShortCircuitResult payload.

    FAB-E (E1): the FROZEN ShortCircuitResult contract has no NaN/None-safe
    serialization for these fields (unlike PowerFlowBusResult) — a genuinely
    computed short-circuit result always carries them, so a missing key means
    the stored payload is corrupted, not that the value is legitimately zero.
    Defaulting to 0.0 here would silently fabricate a physically absurd
    result (e.g. zero fault current) and feed it straight into protection
    settings computation.
    """
    value = payload.get(key)
    if value is None:
        raise ValueError(
            f"Short circuit result payload missing required field: {key!r} "
            "(stored artifact is incomplete/corrupted)."
        )
    return float(value)


def _build_short_circuit_result(payload: dict[str, Any]) -> ShortCircuitResult:
    sc_type = payload.get("short_circuit_type")
    if isinstance(sc_type, ShortCircuitType):
        resolved_type = sc_type
    else:
        resolved_type = ShortCircuitType(str(sc_type))
    zkk_payload = payload.get("zkk_ohm")
    if (
        not isinstance(zkk_payload, dict)
        or zkk_payload.get("re") is None
        or zkk_payload.get("im") is None
    ):
        raise ValueError(
            "Short circuit result payload missing required field: 'zkk_ohm' (re/im) "
            "(stored artifact is incomplete/corrupted)."
        )
    zkk_ohm = complex(float(zkk_payload["re"]), float(zkk_payload["im"]))
    return ShortCircuitResult(
        short_circuit_type=resolved_type,
        fault_node_id=str(payload.get("fault_node_id", "")),
        c_factor=_required_sc_field(payload, "c_factor"),
        un_v=_required_sc_field(payload, "un_v"),
        zkk_ohm=zkk_ohm,
        ikss_a=_required_sc_field(payload, "ikss_a"),
        ip_a=_required_sc_field(payload, "ip_a"),
        ith_a=_required_sc_field(payload, "ith_a"),
        sk_mva=_required_sc_field(payload, "sk_mva"),
        rx_ratio=_required_sc_field(payload, "rx_ratio"),
        kappa=_required_sc_field(payload, "kappa"),
        tk_s=_required_sc_field(payload, "tk_s"),
        ib_a=_required_sc_field(payload, "ib_a"),
        tb_s=_required_sc_field(payload, "tb_s"),
        ik_thevenin_a=_required_sc_field(payload, "ik_thevenin_a"),
        ik_inverters_a=_required_sc_field(payload, "ik_inverters_a"),
        ik_total_a=_required_sc_field(payload, "ik_total_a"),
        contributions=[],
        branch_contributions=None,
        white_box_trace=list(payload.get("white_box_trace") or []),
    )


def _build_trace_inline() -> dict[str, Any]:
    steps = [
        {"step": "read_short_circuit_run"},
        {"step": "build_protection_input"},
        {"step": "persist_skeleton_run"},
    ]
    return {"steps": steps}


def _build_trace_overcurrent_v0(
    *,
    sc_run_id: str,
    sc_payload: dict[str, Any],
    protection_input: ProtectionInput,
    settings: OvercurrentSettingsV0,
    report_json: dict[str, Any],
    report_fingerprint: str,
    status: str,
) -> dict[str, Any]:
    steps = [
        {
            "step": "read_short_circuit_run",
            "run_id": sc_run_id,
            "analysis_type": "short_circuit.iec60909",
            "payload_keys": sorted(sc_payload.keys()),
        },
        {
            "step": "build_protection_input",
            "fault_levels": protection_input.fault_levels,
            "connection_node": protection_input.connection_node,
            "source_run_id": protection_input.source_run_id,
        },
        {
            "step": "compute_settings",
            "curve": settings.curve,
            "assumptions": settings.assumptions,
            "warnings": settings.warnings,
            "settings": settings.to_dict(),
        },
        {
            "step": "build_report",
            "report_fingerprint": report_fingerprint,
            "report": report_json,
        },
        {
            "step": "index_run",
            "status": status,
        },
    ]
    return {"steps": canonicalize_json(steps)}


def _build_deterministic_run_id(protection_input: ProtectionInput, outputs: dict[str, Any]) -> str:
    payload = {
        "analysis_type": "protection.overcurrent.v0",
        "inputs": protection_input.to_dict(),
        "outputs": canonicalize_json(outputs),
    }
    fingerprint = fingerprint_json(payload)
    return f"protection.overcurrent.v0:{fingerprint}"


def _build_run_id(
    protection_input: ProtectionInput,
    settings: OvercurrentSettingsV0,
    report_fingerprint: str,
    *,
    analysis_type: str,
) -> str:
    payload = {
        "analysis_type": analysis_type,
        "inputs": protection_input.to_dict(),
        "settings": settings.to_dict(),
        "report_fingerprint": report_fingerprint,
    }
    fingerprint = fingerprint_json(payload)
    return f"{analysis_type}:{fingerprint}"


def _persist_run_index(
    envelope: AnalysisRunEnvelope,
    protection_input: ProtectionInput,
    *,
    uow_factory: Callable[[], UnitOfWork],
) -> None:
    entry = index_run(
        envelope,
        primary_artifact_type="protection_input",
        primary_artifact_id=envelope.artifacts[0].id,
        base_snapshot_id=protection_input.base_snapshot_id,
        case_id=protection_input.case_id,
        status="SKELETON",
        meta={"source_run_id": protection_input.source_run_id},
    )
    with uow_factory() as uow:
        if uow.analysis_runs_index.get(entry.run_id) is None:
            uow.analysis_runs_index.add(entry)


def _persist_run_index_v0(
    envelope: AnalysisRunEnvelope,
    protection_input: ProtectionInput,
    *,
    report_fingerprint: str,
    status: str,
    uow_factory: Callable[[], UnitOfWork],
) -> None:
    entry = _build_index_entry_v0(
        envelope,
        protection_input,
        report_fingerprint=report_fingerprint,
        status=status,
    )
    with uow_factory() as uow:
        if uow.analysis_runs_index.get(entry.run_id) is None:
            uow.analysis_runs_index.add(entry)


def _build_index_entry_v0(
    envelope: AnalysisRunEnvelope,
    protection_input: ProtectionInput,
    *,
    report_fingerprint: str,
    status: str,
) -> AnalysisRunIndexEntry:
    entry = index_run(
        envelope,
        primary_artifact_type="protection_report_v0",
        primary_artifact_id=f"protection_report_v0:{report_fingerprint}",
        base_snapshot_id=protection_input.base_snapshot_id,
        case_id=protection_input.case_id,
        status=status,
        meta={
            "source_run_id": protection_input.source_run_id,
            "report_fingerprint": report_fingerprint,
        },
    )
    return entry
