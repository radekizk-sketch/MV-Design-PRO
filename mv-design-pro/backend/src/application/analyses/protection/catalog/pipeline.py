from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from application.analyses.design_synth.canonical import canonicalize_json
from application.analyses.design_synth.fingerprint import fingerprint_json
from application.analyses.protection.catalog.catalog_store import load_device_capability
from application.analyses.protection.catalog.envelope_adapter import to_run_envelope
from application.analyses.protection.catalog.mapper import map_requirement_to_device
from application.analyses.protection.catalog.models import (
    DeviceCapability,
    DeviceMappingResult,
    ProtectionRequirementV0,
)
from application.analyses.protection.catalog.vendors.abb_v0 import (
    VENDOR as ABB_VENDOR,
)
from application.analyses.protection.catalog.vendors.abb_v0 import (
    build_adapter as build_abb_adapter,
)
from application.analyses.protection.catalog.vendors.base import VendorAdapter
from application.analyses.protection.catalog.vendors.elektrometal_etango_v0 import (
    VENDOR as ELEKTROMETAL_VENDOR,
)
from application.analyses.protection.catalog.vendors.elektrometal_etango_v0 import (
    build_adapter as build_elektrometal_adapter,
)
from application.analyses.protection.catalog.vendors.generic_v1 import (
    build_elester_adapter,
    build_energotest_adapter,
    build_ge_adapter,
    build_schneider_adapter,
    build_sel_adapter,
    build_siemens_adapter,
    build_ziad_adapter,
    build_zpas_adapter,
)
from application.analyses.run_envelope import AnalysisRunEnvelope
from application.analyses.run_index import index_run
from infrastructure.persistence.unit_of_work import UnitOfWork


def run_device_mapping_v0(
    *,
    protection_run_id: str,
    device_id: str,
    uow_factory: Callable[[], UnitOfWork],
) -> AnalysisRunEnvelope:
    protection_entry = _read_protection_index_entry(protection_run_id, uow_factory=uow_factory)
    requirement = _extract_requirement(protection_entry.meta_json)

    capability = load_device_capability(device_id)
    if capability is None:
        mapping_result = DeviceMappingResult(
            compatible=False,
            violations=("DEVICE_NOT_FOUND",),
            mapped_settings={},
            assumptions=("MAPPING_SKIPPED_NO_DEVICE",),
        )
        vendor_mapping = _build_vendor_mapping(mapping_result=mapping_result, capability=None)
        status = "FAILED"
    else:
        mapping_result = map_requirement_to_device(requirement, capability)
        vendor_mapping = _build_vendor_mapping(mapping_result=mapping_result, capability=capability)
        if mapping_result.compatible and vendor_mapping["vendor_violations"]:
            status = "DEGRADED"
        else:
            status = "SUCCEEDED" if mapping_result.compatible else "DEGRADED"

    requirement_payload = requirement.to_dict()
    requirement_hash = fingerprint_json(requirement_payload)

    report = _build_mapping_report(
        protection_run_id=protection_run_id,
        device_id=device_id,
        requirement=requirement_payload,
        capability=capability.to_dict() if capability else None,
        mapping=mapping_result.to_dict(),
        vendor_mapping=vendor_mapping,
        status=status,
    )
    report_fingerprint = report["fingerprint"]

    trace_inline = _build_trace_inline(
        protection_entry=protection_entry,
        requirement=requirement_payload,
        capability=capability.to_dict() if capability else None,
        mapping=mapping_result.to_dict(),
        vendor_mapping=vendor_mapping,
        report_fingerprint=report_fingerprint,
        status=status,
    )

    created_at_utc = datetime.now(UTC).isoformat()
    envelope = to_run_envelope(
        protection_run_id=protection_run_id,
        device_id=device_id,
        requirement_hash=requirement_hash,
        capability_id=capability.device_id if capability else None,
        mapping_report_fingerprint=report_fingerprint,
        case_id=protection_entry.case_id,
        base_snapshot_id=protection_entry.base_snapshot_id,
        trace_inline=trace_inline,
        created_at_utc=created_at_utc,
    )

    entry = index_run(
        envelope,
        primary_artifact_type="device_mapping_report_v0",
        primary_artifact_id=f"device_mapping_report_v0:{report_fingerprint}",
        base_snapshot_id=protection_entry.base_snapshot_id,
        case_id=protection_entry.case_id,
        status=status,
        meta={
            "protection_run_id": protection_run_id,
            "device_id": device_id,
            "requirement_hash": requirement_hash,
            "device_mapping_report_v0": report,
        },
    )
    with uow_factory() as uow:
        if uow.analysis_runs_index.get(entry.run_id) is None:
            uow.analysis_runs_index.add(entry)
    return envelope


def _read_protection_index_entry(run_id: str, *, uow_factory: Callable[[], UnitOfWork]) -> Any:
    with uow_factory() as uow:
        entry = uow.analysis_runs_index.get(run_id)
    if entry is None:
        raise ValueError("Protection run not found")
    if entry.analysis_type != "protection.overcurrent.v0":
        raise ValueError("Unsupported protection run type")
    return entry


def _extract_requirement(meta_json: dict[str, Any] | None) -> ProtectionRequirementV0:
    if isinstance(meta_json, dict):
        report = meta_json.get("protection_report_v0")
        if isinstance(report, dict):
            settings = report.get("settings")
            if isinstance(settings, dict):
                return _settings_to_requirement(settings)
        settings = meta_json.get("protection_settings_v0")
        if isinstance(settings, dict):
            return _settings_to_requirement(settings)
    raise ValueError("Protection requirements not available")


def _nastawa_opcjonalna(wartosc: Any) -> float | None:
    """Nastawa NIEDOSTĘPNA pozostaje ``None`` — nigdy 0,0 ani wyjątek (V12K-189).

    Defekt naprawiony w karcie F-K5: adapter wymuszał ``float(...)`` na każdym polu,
    więc po V12K-189 (nastawy ``float | None``) niedostępna nastawa albo wywalała
    ``TypeError`` w środku doboru aparatu, albo — gdyby klucza brakowało — cicho
    stawała się zerem, czyli wymaganiem, którego projekt nie policzył.
    """
    if wartosc is None:
        return None
    return float(wartosc)


def _settings_to_requirement(settings: dict[str, Any]) -> ProtectionRequirementV0:
    return ProtectionRequirementV0(
        curve=str(settings.get("curve", "")),
        i_pickup_51_a=_nastawa_opcjonalna(settings.get("i_pickup_51_a")),
        tms_51=float(settings.get("tms_51", 0.0)),
        i_inst_50_a=_nastawa_opcjonalna(settings.get("i_inst_50_a")),
        i_pickup_51n_a=_nastawa_opcjonalna(settings.get("i_pickup_51n_a")),
        tms_51n=float(settings.get("tms_51n", 0.0)),
        i_inst_50n_a=_nastawa_opcjonalna(settings.get("i_inst_50n_a")),
    )


def _build_mapping_report(
    *,
    protection_run_id: str,
    device_id: str,
    requirement: dict[str, Any],
    capability: dict[str, Any] | None,
    mapping: dict[str, Any],
    vendor_mapping: dict[str, Any],
    status: str,
) -> dict[str, Any]:
    report_body = {
        "analysis_type": "protection.device_mapping.v0",
        "inputs": {
            "protection_run_id": protection_run_id,
            "device_id": device_id,
            "requirement": requirement,
        },
        "capability": capability,
        "mapping": mapping,
        "vendor_mapping": vendor_mapping,
        "status": status,
    }
    report_body = canonicalize_json(report_body)
    report_fingerprint = fingerprint_json(report_body)
    return canonicalize_json({**report_body, "fingerprint": report_fingerprint})


def _build_trace_inline(
    *,
    protection_entry: Any,
    requirement: dict[str, Any],
    capability: dict[str, Any] | None,
    mapping: dict[str, Any],
    vendor_mapping: dict[str, Any],
    report_fingerprint: str,
    status: str,
) -> dict[str, Any]:
    steps = [
        {
            "step": "read_protection_run",
            "run_id": protection_entry.run_id,
            "analysis_type": protection_entry.analysis_type,
            "case_id": protection_entry.case_id,
            "base_snapshot_id": protection_entry.base_snapshot_id,
        },
        {
            "step": "extract_requirement",
            "requirement": requirement,
        },
        {
            "step": "load_device_capability",
            "device_id": capability.get("device_id") if capability else None,
            "found": capability is not None,
        },
        {
            "step": "validate_and_map",
            "compatible": mapping.get("compatible"),
            "violations": mapping.get("violations"),
            "mapped_settings": mapping.get("mapped_settings"),
            "assumptions": mapping.get("assumptions"),
        },
        {
            "step": "vendor_validate_and_map",
            "vendor": vendor_mapping.get("vendor"),
            "device_id": capability.get("device_id") if capability else None,
            "logical_keys": sorted(mapping.get("mapped_settings", {}).keys()),
            "vendor_violations": vendor_mapping.get("vendor_violations"),
            "vendor_setting_keys": sorted(vendor_mapping.get("vendor_settings", {}).keys()),
        },
        {
            "step": "build_report",
            "report_fingerprint": report_fingerprint,
        },
        {
            "step": "index_run",
            "status": status,
        },
    ]
    return {"steps": canonicalize_json(steps)}


def _resolve_vendor_adapter(vendor: str) -> VendorAdapter | None:
    # K30-16: rozszerzona rodzina vendor-adapterów po expansion catalogów
    # (E2Tango full + SIPROTEC + Relion + Easergy + SEL + GE Multilin + Polish).
    if vendor == ABB_VENDOR:
        return build_abb_adapter()
    if vendor == ELEKTROMETAL_VENDOR:
        return build_elektrometal_adapter()
    if vendor == "SIEMENS":
        return build_siemens_adapter()
    if vendor == "SCHNEIDER":
        return build_schneider_adapter()
    if vendor == "SEL":
        return build_sel_adapter()
    if vendor == "GE":
        return build_ge_adapter()
    if vendor == "ZPAS":
        return build_zpas_adapter()
    if vendor == "ELESTER":
        return build_elester_adapter()
    if vendor == "ENERGOTEST":
        return build_energotest_adapter()
    if vendor == "ZIAD":
        return build_ziad_adapter()
    return None


def _build_vendor_mapping(
    *,
    mapping_result: DeviceMappingResult,
    capability: DeviceCapability | None,
) -> dict[str, Any]:
    if capability is None:
        return {
            "vendor": "UNKNOWN",
            "vendor_settings": {},
            "vendor_violations": ["VENDOR_DEVICE_NOT_FOUND"],
            "vendor_assumptions": [],
        }
    adapter = _resolve_vendor_adapter(capability.vendor)
    if adapter is None:
        return {
            "vendor": capability.vendor,
            "vendor_settings": {},
            "vendor_violations": ["VENDOR_ADAPTER_NOT_FOUND"],
            "vendor_assumptions": [],
        }
    _, violations = adapter.validate_vendor_support(
        mapping_result.mapped_settings, device=capability
    )
    vendor_settings: dict[str, Any] = {}
    vendor_assumptions: list[str] = []
    if not violations and mapping_result.compatible:
        vendor_settings = adapter.map_logical_to_vendor(
            mapping_result.mapped_settings,
            device=capability,
        )
        vendor_assumptions = ["VENDOR_KEYS_SYMBOLIC_V0"]
    return {
        "vendor": adapter.vendor_name(),
        "vendor_settings": vendor_settings,
        "vendor_violations": list(violations),
        "vendor_assumptions": vendor_assumptions,
    }
