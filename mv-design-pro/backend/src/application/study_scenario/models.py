from __future__ import annotations

import hashlib
import json
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid5

NAMESPACE_STUDY = uuid5(NAMESPACE_URL, "mv-design-pro:study")
NAMESPACE_SCENARIO = uuid5(NAMESPACE_URL, "mv-design-pro:scenario")
NAMESPACE_RUN = uuid5(NAMESPACE_URL, "mv-design-pro:run")
NAMESPACE_SNAPSHOT = uuid5(NAMESPACE_URL, "mv-design-pro:snapshot")


class ScenarioType(StrEnum):
    NORMAL = "NORMAL"
    N_1 = "N-1"
    MAINTENANCE = "MAINTENANCE"
    EMERGENCY = "EMERGENCY"
    USER_DEFINED = "USER_DEFINED"


class RunStatus(StrEnum):
    COMPLETE = "COMPLETE"
    NOT_COMPUTED = "NOT COMPUTED"


@dataclass(frozen=True)
class Study:
    study_id: UUID
    name: str
    description: str
    created_at: datetime
    created_by: str
    assumptions: tuple[str, ...]
    normative_profile_id: str | None
    hash: str


@dataclass(frozen=True)
class Scenario:
    scenario_id: UUID
    study_id: UUID
    name: str
    description: str
    scenario_type: ScenarioType
    switches_state_ref: Any
    sources_state_ref: Any
    loads_state_ref: Any
    constraints_ref: Any
    is_base: bool
    hash: str


@dataclass(frozen=True)
class Run:
    run_id: UUID
    scenario_id: UUID
    created_at: datetime
    input_snapshot_id: UUID | None
    solver_versions: dict[str, str]
    proof_set_ids: tuple[str, ...]
    normative_report_id: str | None
    voltage_profile_view_id: str | None
    protection_insight_view_id: str | None
    protection_curves_it_view_id: str | None
    report_p24_plus_id: str | None
    status: RunStatus


@dataclass(frozen=True)
class Snapshot:
    snapshot_id: UUID
    hash: str
    description: str
    created_at: datetime


def _stable_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _hash_payload(payload: dict[str, Any]) -> str:
    return hashlib.sha256(_stable_json(payload).encode("utf-8")).hexdigest()


def _normalize_assumptions(values: Iterable[str] | None) -> tuple[str, ...]:
    if values is None:
        return ()
    return tuple(sorted(str(value) for value in values))


def _ensure_utc(timestamp: datetime | None) -> datetime:
    if timestamp is None:
        return datetime.now(UTC)
    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=UTC)
    return timestamp.astimezone(UTC)


def create_study(
    *,
    name: str,
    description: str,
    created_by: str,
    assumptions: Iterable[str] | None = None,
    normative_profile_id: str | None = None,
    created_at: datetime | None = None,
) -> Study:
    created_at = _ensure_utc(created_at)
    normalized_assumptions = _normalize_assumptions(assumptions)
    payload = {
        "name": name,
        "description": description,
        "created_at": created_at.isoformat(),
        "created_by": created_by,
        "assumptions": list(normalized_assumptions),
        "normative_profile_id": normative_profile_id,
    }
    study_hash = _hash_payload(payload)
    study_id = uuid5(NAMESPACE_STUDY, study_hash)
    return Study(
        study_id=study_id,
        name=name,
        description=description,
        created_at=created_at,
        created_by=created_by,
        assumptions=normalized_assumptions,
        normative_profile_id=normative_profile_id,
        hash=study_hash,
    )


def create_scenario(
    *,
    study_id: UUID,
    name: str,
    description: str,
    scenario_type: ScenarioType,
    switches_state_ref: Any,
    sources_state_ref: Any,
    loads_state_ref: Any,
    constraints_ref: Any,
    is_base: bool,
) -> Scenario:
    payload = {
        "study_id": str(study_id),
        "name": name,
        "description": description,
        "scenario_type": scenario_type.value,
        "switches_state_ref": switches_state_ref,
        "sources_state_ref": sources_state_ref,
        "loads_state_ref": loads_state_ref,
        "constraints_ref": constraints_ref,
        "is_base": is_base,
    }
    scenario_hash = _hash_payload(payload)
    scenario_id = uuid5(NAMESPACE_SCENARIO, scenario_hash)
    return Scenario(
        scenario_id=scenario_id,
        study_id=study_id,
        name=name,
        description=description,
        scenario_type=scenario_type,
        switches_state_ref=switches_state_ref,
        sources_state_ref=sources_state_ref,
        loads_state_ref=loads_state_ref,
        constraints_ref=constraints_ref,
        is_base=is_base,
        hash=scenario_hash,
    )


def create_run(
    *,
    scenario_id: UUID,
    created_at: datetime | None = None,
    input_snapshot_id: UUID | None,
    solver_versions: dict[str, str] | None = None,
    proof_set_ids: Iterable[str] | None = None,
    normative_report_id: str | None = None,
    voltage_profile_view_id: str | None = None,
    protection_insight_view_id: str | None = None,
    protection_curves_it_view_id: str | None = None,
    report_p24_plus_id: str | None = None,
    status: RunStatus = RunStatus.COMPLETE,
) -> Run:
    created_at = _ensure_utc(created_at)
    solver_versions = dict(sorted((solver_versions or {}).items()))
    proof_set_ids = tuple(sorted(proof_set_ids or ()))
    payload = {
        "scenario_id": str(scenario_id),
        "created_at": created_at.isoformat(),
        "input_snapshot_id": str(input_snapshot_id) if input_snapshot_id else None,
        "solver_versions": solver_versions,
        "proof_set_ids": list(proof_set_ids),
        "normative_report_id": normative_report_id,
        "voltage_profile_view_id": voltage_profile_view_id,
        "protection_insight_view_id": protection_insight_view_id,
        "protection_curves_it_view_id": protection_curves_it_view_id,
        "report_p24_plus_id": report_p24_plus_id,
        "status": status.value,
    }
    run_hash = _hash_payload(payload)
    run_id = uuid5(NAMESPACE_RUN, run_hash)
    return Run(
        run_id=run_id,
        scenario_id=scenario_id,
        created_at=created_at,
        input_snapshot_id=input_snapshot_id,
        solver_versions=solver_versions,
        proof_set_ids=proof_set_ids,
        normative_report_id=normative_report_id,
        voltage_profile_view_id=voltage_profile_view_id,
        protection_insight_view_id=protection_insight_view_id,
        protection_curves_it_view_id=protection_curves_it_view_id,
        report_p24_plus_id=report_p24_plus_id,
        status=status,
    )


def create_snapshot(
    *,
    description: str,
    snapshot_hash: str,
    created_at: datetime | None = None,
) -> Snapshot:
    created_at = _ensure_utc(created_at)
    payload = {
        "description": description,
        "hash": snapshot_hash,
        "created_at": created_at.isoformat(),
    }
    computed_hash = _hash_payload(payload)
    snapshot_id = uuid5(NAMESPACE_SNAPSHOT, computed_hash)
    return Snapshot(
        snapshot_id=snapshot_id,
        hash=snapshot_hash,
        description=description,
        created_at=created_at,
    )
