from __future__ import annotations

from application.analyses.protection.catalog.pipeline import run_device_mapping_v0
from application.analyses.run_envelope import (
    AnalysisRunEnvelope,
    ArtifactRef,
    InputsRef,
    TraceRef,
    fingerprint_envelope,
)
from application.analyses.run_index import index_run

from tests.utils.determinism import assert_deterministic


def _seed_protection_run(uow_factory) -> str:
    run_id = "protection.overcurrent.v0:seed-vendor"
    settings = {
        "curve": "IEC_NI",
        "i_pickup_51_a": 120.0,
        "tms_51": 0.2,
        "i_inst_50_a": 800.0,
        "i_pickup_51n_a": 60.0,
        "tms_51n": 0.3,
        "i_inst_50n_a": 300.0,
    }
    report = {"settings": settings}

    inputs = InputsRef(
        base_snapshot_id="snapshot-1",
        spec_ref=None,
        inline={
            "connection_node": {
                "id": "BoundaryNode-1",
                "label": "BoundaryNode – węzeł przyłączenia",
            }
        },
    )
    artifacts = (ArtifactRef(type="protection_report_v0", id="protection_report_v0:seed"),)
    trace = TraceRef(type="white_box", id=None, inline={"steps": ["seed"]})
    created_at_utc = "2024-01-01T00:00:00+00:00"
    envelope_dict = {
        "schema_version": "v0",
        "run_id": run_id,
        "analysis_type": "protection.overcurrent.v0",
        "case_id": "case-1",
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
        case_id="case-1",
        inputs=inputs,
        artifacts=artifacts,
        trace=trace,
        created_at_utc=created_at_utc,
        fingerprint=fingerprint,
    )
    entry = index_run(
        envelope,
        primary_artifact_type="protection_report_v0",
        primary_artifact_id="protection_report_v0:seed",
        base_snapshot_id="snapshot-1",
        case_id="case-1",
        status="SUCCEEDED",
        meta={"protection_report_v0": report},
    )

    with uow_factory() as uow:
        if uow.analysis_runs_index.get(run_id) is None:
            uow.analysis_runs_index.add(entry)
    return run_id


def test_vendor_mapping_for_supported_device_is_deterministic(uow_factory) -> None:
    protection_run_id = _seed_protection_run(uow_factory)

    envelope1 = run_device_mapping_v0(
        protection_run_id=protection_run_id,
        device_id="ACME_REX500_v1",
        uow_factory=uow_factory,
    )
    envelope2 = run_device_mapping_v0(
        protection_run_id=protection_run_id,
        device_id="ACME_REX500_v1",
        uow_factory=uow_factory,
    )

    assert envelope1.fingerprint == envelope2.fingerprint
    assert_deterministic(
        envelope1.to_dict(),
        envelope2.to_dict(),
        scrub_keys=("created_at_utc",),
    )

    with uow_factory() as uow:
        stored = uow.analysis_runs_index.get(envelope1.run_id)
    assert stored is not None
    report = stored.meta_json["device_mapping_report_v0"]
    vendor_mapping = report["vendor_mapping"]

    assert vendor_mapping["vendor"] == "ABB"
    assert vendor_mapping["vendor_violations"] == []
    vendor_settings = vendor_mapping["vendor_settings"]
    assert "ABB.OC.I51_PICKUP_A" in vendor_settings
    assert "ABB.OC.I50_HIGHSET_A" in vendor_settings
    assert "ABB.EF.I51N_PICKUP_A" in vendor_settings
    assert "ABB.EF.I50N_HIGHSET_A" in vendor_settings


def test_vendor_mapping_for_rex700_is_deterministic(uow_factory) -> None:
    protection_run_id = _seed_protection_run(uow_factory)

    envelope = run_device_mapping_v0(
        protection_run_id=protection_run_id,
        device_id="ACME_REX700_v1",
        uow_factory=uow_factory,
    )

    with uow_factory() as uow:
        stored = uow.analysis_runs_index.get(envelope.run_id)
    assert stored is not None
    report = stored.meta_json["device_mapping_report_v0"]
    vendor_mapping = report["vendor_mapping"]

    assert vendor_mapping["vendor"] == "ABB"
    assert vendor_mapping["vendor_violations"] == []
    vendor_settings = vendor_mapping["vendor_settings"]
    assert "ABB.OC.I51_PICKUP_A" in vendor_settings
    assert "ABB.OC.I50_HIGHSET_A" in vendor_settings
    assert "ABB.EF.I51N_PICKUP_A" in vendor_settings
    assert "ABB.EF.I50N_HIGHSET_A" in vendor_settings
