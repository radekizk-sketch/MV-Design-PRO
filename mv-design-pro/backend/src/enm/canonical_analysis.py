from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import NAMESPACE_DNS, UUID, uuid4, uuid5

from application.automation.trace import (
    build_automation_trace,
    build_post_fault_topology_effect,
)
from application.compliance.source_compliance import evaluate_source_compliance
from application.proof_engine.packs.phase_state_sn import (
    PhaseStateSNProofPack,
    PhaseStateSNProofPackInput,
)
from application.stability.dynamic_stability import (
    FaultClearScenario,
    FaultClearSourceState,
    evaluate_fault_clear_dynamic_stability,
)
from application.stability.voltage_trajectory import (
    TrajectoryGenerationParams,
    generate_voltage_trajectory,
)
from enm.hash import compute_enm_hash
from enm.mapping import build_zero_sequence_zbus, map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from enm.store import get_enm
from enm.validator import ENMValidator
from infrastructure.persistence.repositories.canonical_run_repository import (
    canonical_run_repository_scope,
)
from network_model.core.node import NodeType
from network_model.solvers.phase_state_sn import (
    OpenPhaseFlags,
    PhaseStateSNInput,
    PhaseStateSNSolver,
    PhaseValues,
)
from network_model.solvers.power_flow_fast_decoupled import (
    FastDecoupledOptions,
    PowerFlowFastDecoupledSolver,
)
from network_model.solvers.power_flow_gauss_seidel import (
    GaussSeidelOptions,
    PowerFlowGaussSeidelSolver,
)
from network_model.solvers.power_flow_inverter import (
    InverterControl,
    inverter_control_from_params,
)
from network_model.solvers.power_flow_newton import PowerFlowNewtonSolver
from network_model.solvers.power_flow_oltc import solve_with_oltc
from network_model.solvers.power_flow_result import build_power_flow_result_v1
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    ShuntSpec,
    SlackSpec,
)
from network_model.solvers.short_circuit_core import ShortCircuitType
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver


def _canonicalize(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _canonicalize(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_canonicalize(item) for item in value]
    return value


def _compute_input_hash(
    *, case_id: str, analysis_type: str, enm_hash: str, options: dict[str, Any]
) -> str:
    payload = {
        "analysis_type": analysis_type,
        "case_id": case_id,
        "enm_hash": enm_hash,
        "options": _canonicalize(options),
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _short_circuit_type_from_options(options: dict[str, Any]) -> ShortCircuitType:
    raw = options.get("fault_type") or options.get("short_circuit_type") or "3F"
    mapping = {
        "3F": ShortCircuitType.THREE_PHASE,
        "SC_3F": ShortCircuitType.THREE_PHASE,
        "1F": ShortCircuitType.SINGLE_PHASE_GROUND,
        "SC_1F": ShortCircuitType.SINGLE_PHASE_GROUND,
        "2F": ShortCircuitType.TWO_PHASE,
        "SC_2F": ShortCircuitType.TWO_PHASE,
        "2F+G": ShortCircuitType.TWO_PHASE_GROUND,
        "2F+Z": ShortCircuitType.TWO_PHASE_GROUND,
        "2FG": ShortCircuitType.TWO_PHASE_GROUND,
        "SC2FG": ShortCircuitType.TWO_PHASE_GROUND,
        "SC_2F_G": ShortCircuitType.TWO_PHASE_GROUND,
        "SC_2F+G": ShortCircuitType.TWO_PHASE_GROUND,
        "SC_2F+Z": ShortCircuitType.TWO_PHASE_GROUND,
    }
    if raw in mapping:
        return mapping[raw]
    raise ValueError(f"Nieobslugiwany typ zwarcia: {raw}")


def _result_analysis_type_for_fault(short_circuit_type: ShortCircuitType) -> str:
    return {
        ShortCircuitType.THREE_PHASE: "short_circuit_3f",
        ShortCircuitType.SINGLE_PHASE_GROUND: "short_circuit_1f",
        ShortCircuitType.TWO_PHASE: "short_circuit_2f",
        ShortCircuitType.TWO_PHASE_GROUND: "short_circuit_2fg",
    }[short_circuit_type]


def _execution_analysis_type_for_fault(short_circuit_type: ShortCircuitType) -> str:
    return {
        ShortCircuitType.THREE_PHASE: "SC_3F",
        ShortCircuitType.SINGLE_PHASE_GROUND: "SC_1F",
        ShortCircuitType.TWO_PHASE: "SC_2F",
        ShortCircuitType.TWO_PHASE_GROUND: "SC_2F_G",
    }[short_circuit_type]


def _short_circuit_requires_z0(short_circuit_type: ShortCircuitType) -> bool:
    return short_circuit_type in {
        ShortCircuitType.SINGLE_PHASE_GROUND,
        ShortCircuitType.TWO_PHASE_GROUND,
    }


def _short_circuit_proof_ref(
    *,
    run: CanonicalRun,
    target_id: str,
    short_circuit_type: ShortCircuitType,
) -> str:
    payload = {
        "input_hash": run.input_hash,
        "run_id": str(run.id),
        "short_circuit_type": short_circuit_type.value,
        "target_id": target_id,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return f"proof:short-circuit:{hashlib.sha256(raw.encode('utf-8')).hexdigest()}"


def _short_circuit_reportability(
    *,
    run: CanonicalRun,
    target_id: str,
    short_circuit_type: ShortCircuitType,
    trace_step_refs: list[int],
) -> dict[str, Any]:
    proof_ref = _short_circuit_proof_ref(
        run=run,
        target_id=target_id,
        short_circuit_type=short_circuit_type,
    )
    requires_z0 = _short_circuit_requires_z0(short_circuit_type)
    return {
        "reporting_status": "reportable",
        "reporting_status_pl": "raportowalny",
        "proof_status": "complete",
        "proof_status_pl": "pelny",
        "proof_ref": proof_ref,
        "proof_kind": "white_box_trace",
        "proof_engine_version": "white_box_trace_v1",
        "trace_step_refs": trace_step_refs,
        "method_basis": "IEC_60909",
        "requires_z0": requires_z0,
        "z0_source": "ENM_COMMITTED" if requires_z0 else "NOT_APPLICABLE",
        "reporting_limitations": [],
    }


def _phase_state_proof_ref(*, run: CanonicalRun, target_id: str) -> str:
    payload = {
        "analysis_type": "phase_state_sn",
        "input_hash": run.input_hash,
        "run_id": str(run.id),
        "target_id": target_id,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return f"proof:phase-state-sn:{hashlib.sha256(raw.encode('utf-8')).hexdigest()}"


def _dynamic_stability_proof_ref(*, run: CanonicalRun, scenario_id: str) -> str:
    payload = {
        "analysis_type": "dynamic_stability",
        "input_hash": run.input_hash,
        "run_id": str(run.id),
        "scenario_id": scenario_id,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return f"proof:dynamic-stability:{hashlib.sha256(raw.encode('utf-8')).hexdigest()}"


def _source_compliance_proof_ref(*, run: CanonicalRun, source_ref: str) -> str:
    payload = {
        "analysis_type": "source_compliance",
        "input_hash": run.input_hash,
        "run_id": str(run.id),
        "source_ref": source_ref,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return f"proof:source-compliance:{hashlib.sha256(raw.encode('utf-8')).hexdigest()}"


def _power_flow_proof_ref(*, run: CanonicalRun, solver_method: str) -> str:
    payload = {
        "analysis_type": "PF",
        "input_hash": run.input_hash,
        "run_id": str(run.id),
        "solver_method": solver_method,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return f"proof:power-flow:{hashlib.sha256(raw.encode('utf-8')).hexdigest()}"


def _execution_analysis_type_for_run(run: CanonicalRun) -> str:
    if run.analysis_type == "PF":
        return "LOAD_FLOW"
    if run.analysis_type == "short_circuit_sn":
        return _execution_analysis_type_for_fault(_short_circuit_type_from_options(run.options))
    if run.analysis_type == "phase_state_sn":
        return "PHASE_STATE_SN"
    if run.analysis_type == "dynamic_stability":
        return "DYNAMIC_STABILITY"
    if run.analysis_type == "source_compliance":
        return "SOURCE_COMPLIANCE"
    raise ValueError(f"Unsupported canonical analysis type: {run.analysis_type}")


@dataclass
class CanonicalRun:
    id: UUID
    case_id: str
    project_id: str | None
    analysis_type: str
    status: str
    created_at: datetime
    snapshot_hash: str
    input_hash: str
    snapshot: dict[str, Any]
    validation: dict[str, Any]
    readiness: dict[str, Any]
    options: dict[str, Any] = field(default_factory=dict)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error_message: str | None = None
    result_status: str = "VALID"
    raw_result: dict[str, Any] | None = None
    white_box_trace: list[dict[str, Any]] = field(default_factory=list)
    power_flow_trace: dict[str, Any] | None = None

    @property
    def solver_kind(self) -> str:
        if self.analysis_type == "PF":
            return "PF"
        if self.analysis_type == "short_circuit_sn":
            return "short_circuit_sn"
        if self.analysis_type == "phase_state_sn":
            return "phase_state_sn"
        if self.analysis_type == "dynamic_stability":
            return "dynamic_stability"
        if self.analysis_type == "source_compliance":
            return "source_compliance"
        return self.analysis_type

    def to_execution_dict(self) -> dict[str, Any]:
        analysis_type = _execution_analysis_type_for_run(self)
        status = {
            "CREATED": "PENDING",
            "RUNNING": "RUNNING",
            "FINISHED": "DONE",
            "FAILED": "FAILED",
        }[self.status]
        return {
            "id": str(self.id),
            "study_case_id": self.case_id,
            "analysis_type": analysis_type,
            "solver_input_hash": self.input_hash,
            "status": status,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
            "error_message": self.error_message,
        }


def _save_run(run: CanonicalRun) -> None:
    with canonical_run_repository_scope() as repository:
        repository.save(run)


def reset_canonical_runs() -> None:
    with canonical_run_repository_scope() as repository:
        repository.clear_all()


def has_run(run_id: UUID) -> bool:
    with canonical_run_repository_scope() as repository:
        return repository.exists(run_id)


def get_run(run_id: UUID) -> CanonicalRun | None:
    with canonical_run_repository_scope() as repository:
        return repository.get(run_id)


def list_runs_for_case(case_id: str) -> list[CanonicalRun]:
    with canonical_run_repository_scope() as repository:
        return repository.list_by_case(case_id)


def list_runs_for_project(
    project_id: str, *, analysis_type: str | None = None
) -> list[CanonicalRun]:
    with canonical_run_repository_scope() as repository:
        return repository.list_by_project(project_id, analysis_type=analysis_type)


def create_run(
    *,
    case_id: str,
    analysis_type: str,
    project_id: str | None = None,
    options: dict[str, Any] | None = None,
) -> CanonicalRun:
    enm = get_enm(case_id)
    validator = ENMValidator()
    validation = validator.validate(enm)
    readiness = validator.readiness(validation)

    if validation.status == "FAIL":
        messages = [issue.message_pl for issue in validation.issues if issue.severity == "BLOCKER"]
        raise ValueError("; ".join(messages) or "Model sieci nie przeszedl walidacji")

    availability = validation.analysis_available
    if analysis_type == "PF" and not availability.load_flow:
        raise ValueError("Analiza rozpływu mocy nie jest dostepna dla biezacego snapshotu ENM")
    snapshot = enm.model_dump(mode="json")
    enm_hash = compute_enm_hash(enm)
    normalized_options = dict(options or {})
    if analysis_type == "short_circuit_sn":
        fault_type = _short_circuit_type_from_options(normalized_options)
        if not availability.short_circuit_3f:
            raise ValueError("Analiza zwarciowa nie jest dostepna dla biezacego snapshotu ENM")
        if (
            fault_type
            in {
                ShortCircuitType.SINGLE_PHASE_GROUND,
                ShortCircuitType.TWO_PHASE_GROUND,
            }
            and not availability.short_circuit_1f
        ):
            raise ValueError("Zwarcie 1F/2F+Z wymaga kompletnej skladowej zerowej Z0 w ENM")
    if analysis_type == "phase_state_sn" and not enm.buses:
        raise ValueError("Stan fazowy SN wymaga co najmniej jednej szyny w ENM")
    if analysis_type == "dynamic_stability" and not (enm.sources or enm.generators):
        raise ValueError("Stabilnosc dynamiczna wymaga co najmniej jednego zrodla w ENM")
    if analysis_type == "source_compliance" and not (enm.sources or enm.generators):
        raise ValueError("Ocena zgodnosci zrodla wymaga co najmniej jednego zrodla w ENM")
    run = CanonicalRun(
        id=uuid4(),
        case_id=case_id,
        project_id=project_id,
        analysis_type=analysis_type,
        status="CREATED",
        created_at=datetime.now(UTC),
        snapshot_hash=enm_hash,
        input_hash=_compute_input_hash(
            case_id=case_id,
            analysis_type=analysis_type,
            enm_hash=enm_hash,
            options=normalized_options,
        ),
        snapshot=snapshot,
        validation=validation.model_dump(mode="json"),
        readiness=readiness.model_dump(mode="json"),
        options=normalized_options,
    )
    with canonical_run_repository_scope() as repository:
        repository.create(run)
    return run


def execute_run(run_id: UUID) -> CanonicalRun:
    run = get_run(run_id)
    if run is None:
        raise ValueError(f"Run {run_id} not found")
    if run.status in {"FINISHED", "FAILED"}:
        return run

    run.status = "RUNNING"
    run.started_at = datetime.now(UTC)
    run.error_message = None
    _save_run(run)

    try:
        if run.analysis_type == "PF":
            _execute_power_flow(run)
        elif run.analysis_type == "short_circuit_sn":
            _execute_short_circuit(run)
        elif run.analysis_type == "phase_state_sn":
            _execute_phase_state_sn(run)
        elif run.analysis_type == "dynamic_stability":
            _execute_dynamic_stability(run)
        elif run.analysis_type == "source_compliance":
            _execute_source_compliance(run)
        else:
            raise ValueError(f"Unsupported analysis type: {run.analysis_type}")
        run.status = "FINISHED"
        run.finished_at = datetime.now(UTC)
        _save_run(run)
        return run
    except Exception as exc:
        run.status = "FAILED"
        run.error_message = str(exc)
        run.finished_at = datetime.now(UTC)
        _save_run(run)
        return run


def run_short_circuit_now(
    *, case_id: str, project_id: str | None = None, options: dict[str, Any] | None = None
) -> CanonicalRun:
    run = create_run(
        case_id=case_id,
        analysis_type="short_circuit_sn",
        project_id=project_id,
        options=options,
    )
    return execute_run(run.id)


def run_power_flow_now(
    *, case_id: str, project_id: str | None = None, options: dict[str, Any] | None = None
) -> CanonicalRun:
    run = create_run(
        case_id=case_id,
        analysis_type="PF",
        project_id=project_id,
        options=options,
    )
    return execute_run(run.id)


def run_phase_state_now(
    *, case_id: str, project_id: str | None = None, options: dict[str, Any] | None = None
) -> CanonicalRun:
    run = create_run(
        case_id=case_id,
        analysis_type="phase_state_sn",
        project_id=project_id,
        options=options,
    )
    return execute_run(run.id)


def run_dynamic_stability_now(
    *, case_id: str, project_id: str | None = None, options: dict[str, Any] | None = None
) -> CanonicalRun:
    run = create_run(
        case_id=case_id,
        analysis_type="dynamic_stability",
        project_id=project_id,
        options=options,
    )
    return execute_run(run.id)


def run_source_compliance_now(
    *, case_id: str, project_id: str | None = None, options: dict[str, Any] | None = None
) -> CanonicalRun:
    run = create_run(
        case_id=case_id,
        analysis_type="source_compliance",
        project_id=project_id,
        options=options,
    )
    return execute_run(run.id)


def _load_graph(run: CanonicalRun):
    enm = EnergyNetworkModel.model_validate(run.snapshot)
    return map_enm_to_network_graph(enm)


def _study_frequency_hz(run: CanonicalRun) -> float:
    """ADR-011 (Z-ZIP-04): system frequency for the study, from the ENM header
    defaults (ENMDefaults.frequency_hz). Falls back to 50.0 Hz."""
    snapshot = run.snapshot or {}
    defaults = (snapshot.get("header") or {}).get("defaults") or {}
    try:
        return float(defaults.get("frequency_hz", 50.0))
    except (TypeError, ValueError):
        return 50.0


def _phase_value_from_options(
    options: dict[str, Any],
    key: str,
    *,
    default: tuple[float, float, float],
) -> PhaseValues:
    raw = options.get(key)
    if isinstance(raw, dict):
        return PhaseValues(
            float(raw.get("A", default[0])),
            float(raw.get("B", default[1])),
            float(raw.get("C", default[2])),
        )
    if isinstance(raw, list | tuple) and len(raw) == 3:
        return PhaseValues(float(raw[0]), float(raw[1]), float(raw[2]))
    return PhaseValues(*default)


def _open_phase_flags_from_options(options: dict[str, Any]) -> OpenPhaseFlags:
    raw = options.get("open_phase")
    if isinstance(raw, dict):
        return OpenPhaseFlags(
            a=bool(raw.get("A", raw.get("a", False))),
            b=bool(raw.get("B", raw.get("b", False))),
            c=bool(raw.get("C", raw.get("c", False))),
        )
    if isinstance(raw, str):
        normalized = raw.strip().upper()
        return OpenPhaseFlags(
            a=normalized == "A",
            b=normalized == "B",
            c=normalized == "C",
        )
    return OpenPhaseFlags()


def _pick_phase_state_target(snapshot: dict[str, Any], options: dict[str, Any]) -> str:
    explicit = options.get("target_bus_ref") or options.get("target_id")
    if explicit:
        return str(explicit)
    buses = snapshot.get("buses") or []
    for raw_bus in buses:
        if isinstance(raw_bus, dict) and raw_bus.get("ref_id"):
            return str(raw_bus["ref_id"])
    return "bus-phase-state"


def _pick_dynamic_source_ref(snapshot: dict[str, Any], options: dict[str, Any]) -> str:
    explicit = options.get("source_ref") or options.get("source_id")
    if explicit:
        return str(explicit)
    for collection in ("sources", "generators"):
        for raw_element in snapshot.get(collection) or []:
            if isinstance(raw_element, dict) and raw_element.get("ref_id"):
                return str(raw_element["ref_id"])
    return "source-dynamic"


def _pick_compliance_source_ref(snapshot: dict[str, Any], options: dict[str, Any]) -> str:
    explicit = options.get("source_ref") or options.get("source_id")
    if explicit:
        return str(explicit)
    for collection in ("sources", "generators"):
        for raw_element in snapshot.get(collection) or []:
            if isinstance(raw_element, dict) and raw_element.get("ref_id"):
                return str(raw_element["ref_id"])
    return "source-compliance"


def _phase_state_default_fault_current_from_grounding(
    audit2_extensions: dict[str, object] | None,
) -> tuple[float, float, float] | None:
    """
    Phase 46: jesli audit2 grounding ustawione, zwraca median Ik1 z catalogu
    jako default fault_current_a dla phase_state_sn solvera.

    Zwraca None gdy nie mozna ustalic.
    """
    if not audit2_extensions:
        return None
    sc_ext = audit2_extensions.get("sc_iec60909_extensions") or {}
    if not isinstance(sc_ext, dict):
        return None
    grounding = sc_ext.get("mv_neutral_grounding") or {}
    if not isinstance(grounding, dict):
        return None
    ik1_range = grounding.get("typical_ik1_a_range") or {}
    if not isinstance(ik1_range, dict):
        return None
    try:
        ik1_min = float(ik1_range.get("min", 0))
        ik1_max = float(ik1_range.get("max", 0))
    except (TypeError, ValueError):
        return None
    if ik1_max <= 0:
        return None
    median = (ik1_min + ik1_max) / 2.0
    # Symetryczne 1-fazowe doziemne — Ik1 na fazie A, 0 na B i C.
    return (median, 0.0, 0.0)


def _execute_phase_state_sn(run: CanonicalRun) -> None:
    snapshot = run.snapshot or {}
    target_bus_ref = _pick_phase_state_target(snapshot, run.options)
    target_bus_id = _graph_id_from_ref(target_bus_ref)
    # Phase 46: opt-in audit2 grounding -> default fault_current_a.
    audit2_extensions_ps = _maybe_load_audit2_extensions(
        project_id_str=run.options.get("audit2_project_id"),
        station_id=run.options.get("audit2_station_id"),
    )
    fault_default = _phase_state_default_fault_current_from_grounding(audit2_extensions_ps)
    target_bus = next(
        (
            raw_bus
            for raw_bus in snapshot.get("buses") or []
            if isinstance(raw_bus, dict) and str(raw_bus.get("ref_id") or "") == target_bus_ref
        ),
        {},
    )
    source_voltage_default = float(target_bus.get("voltage_kv") or 15.0) / math.sqrt(3.0)
    solver_input = PhaseStateSNInput(
        source_voltage_kv=_phase_value_from_options(
            run.options,
            "source_voltage_kv",
            default=(source_voltage_default, source_voltage_default, source_voltage_default),
        ),
        load_current_a=_phase_value_from_options(
            run.options,
            "load_current_a",
            default=(100.0, 100.0, 100.0),
        ),
        branch_resistance_ohm=_phase_value_from_options(
            run.options,
            "branch_resistance_ohm",
            default=(0.1, 0.1, 0.1),
        ),
        fault_current_a=_phase_value_from_options(
            run.options,
            "fault_current_a",
            # Phase 46: gdy audit2 grounding ustawione, uzywamy median Ik1 z
            # catalogu jako default. Override w run.options ma priorytet.
            default=(fault_default if fault_default is not None else (0.0, 0.0, 0.0)),
        ),
        open_phase=_open_phase_flags_from_options(run.options),
        unbalance_alert_percent=float(run.options.get("unbalance_alert_percent", 10.0)),
        solver_version=str(run.options.get("solver_version") or "phase_state_sn_v1"),
    )
    solver_result = PhaseStateSNSolver.solve(solver_input)
    proof_ref = _phase_state_proof_ref(run=run, target_id=target_bus_ref)
    proof_payload = PhaseStateSNProofPack.materialize_payload(
        PhaseStateSNProofPackInput(
            project_id=run.project_id or run.case_id,
            case_id=run.case_id,
            run_id=str(run.id),
            snapshot_id=run.snapshot_hash,
            project_name=str((snapshot.get("header") or {}).get("name") or "Projekt"),
            case_name=str(run.options.get("case_name") or "Stan fazowy SN"),
            run_timestamp=run.started_at or run.created_at,
            solver_input=solver_input,
            scenario_name=str(run.options.get("scenario_name") or "radial_reference"),
        ),
        solver_result=solver_result,
    )
    run.raw_result = {
        "analysis_type": "phase_state_sn",
        "target_id": target_bus_id,
        "target_bus_ref": target_bus_ref,
        "proof_ref": proof_ref,
        "proof_status": "complete",
        "proof_status_pl": "pelny",
        "reporting_status": "reportable",
        "reporting_status_pl": "raportowalny",
        "proof_payload": proof_payload,
        "result": solver_result.to_dict(),
        "dopuszczalnosc_raportowa": True,
        "reporting_limitations": [],
    }
    run.white_box_trace = [
        {
            "step": 1,
            "key": "PHASE_STATE_INPUT",
            "title": f"Stan fazowy SN: wejscie {target_bus_ref}",
            "target_id": target_bus_id,
            "element_id": target_bus_ref,
            "phase_state_target_ref": target_bus_ref,
            "method_basis": "PHASE_STATE_SN_RADIAL_V1",
            "inputs": solver_input.to_dict(),
            "proof_ref": proof_ref,
            "proof_status": "complete",
            "reporting_status": "reportable",
        },
        {
            "step": 2,
            "key": "PHASE_STATE_OUTPUT",
            "title": f"Stan fazowy SN: wynik {target_bus_ref}",
            "target_id": target_bus_id,
            "element_id": target_bus_ref,
            "phase_state_target_ref": target_bus_ref,
            "method_basis": "PHASE_STATE_SN_RADIAL_V1",
            "result": solver_result.to_dict(),
            "proof_ref": proof_ref,
            "proof_status": "complete",
            "reporting_status": "reportable",
        },
    ]
    run.power_flow_trace = None


def _execute_dynamic_stability(run: CanonicalRun) -> None:
    snapshot = run.snapshot or {}
    source_ref = _pick_dynamic_source_ref(snapshot, run.options)
    scenario = FaultClearScenario(
        scenario_id=str(run.options.get("scenario_id") or f"dyn-{run.id}"),
        faulted_element_id=str(run.options.get("faulted_element_id") or "faulted-element"),
        clearing_time_ms=float(run.options.get("clearing_time_ms", 120.0)),
        cleared_by_element_ids=tuple(run.options.get("cleared_by_element_ids") or ("cb-main",)),
        source_state=FaultClearSourceState(
            source_id=source_ref,
            pre_fault_angle_deg=float(run.options.get("pre_fault_angle_deg", 10.0)),
            during_fault_angle_deg=float(run.options.get("during_fault_angle_deg", 75.0)),
            post_fault_angle_deg=float(run.options.get("post_fault_angle_deg", 28.0)),
            post_fault_voltage_pu=float(run.options.get("post_fault_voltage_pu", 0.97)),
            post_fault_frequency_pu=float(run.options.get("post_fault_frequency_pu", 0.99)),
        ),
    )
    stability_result = evaluate_fault_clear_dynamic_stability(scenario)
    topology_effect = build_post_fault_topology_effect(
        source_id=stability_result.source_id,
        faulted_element_id=stability_result.faulted_element_id,
        cleared_by_element_ids=stability_result.cleared_by_element_ids,
        isolated_element_ids=tuple(run.options.get("isolated_element_ids") or ()),
        additionally_opened_element_ids=tuple(
            run.options.get("additionally_opened_element_ids") or ()
        ),
        disconnected_source_ids=tuple(run.options.get("disconnected_source_ids") or ()),
    )
    automation_trace = build_automation_trace(stability_result, topology_effect)
    proof_ref = _dynamic_stability_proof_ref(run=run, scenario_id=stability_result.scenario_id)
    result_payload = stability_result.to_dict()
    topology_payload = topology_effect.to_dict()
    # Szereg czasowy U(t)/f(t) przebiegu — istniejący, deterministyczny generator
    # trajektorii FRT (application/stability/voltage_trajectory.py) sparametryzowany
    # scenariuszem wyłączenia zwarcia. ZERO nowej fizyki: równania modelu odbudowy
    # napięcia/częstotliwości nietknięte, tu jedynie wystawiamy istniejący przebieg.
    # Przechowywane addytywnie (klucz `time_series` obok `result`) — starsze biegi
    # bez tego klucza; osobny endpoint wystawia go na żądanie (nie pompuje wyniku).
    trajectory = generate_voltage_trajectory(
        TrajectoryGenerationParams(
            clearing_time_ms=scenario.clearing_time_ms,
            post_fault_voltage_pu=scenario.source_state.post_fault_voltage_pu,
            post_fault_frequency_pu=scenario.source_state.post_fault_frequency_pu,
        )
    )
    time_series_payload = {
        "time_unit": "s",
        "criteria_version": stability_result.criteria_version,
        "quantities": [
            {"key": "voltage_pu", "label_pl": "Napięcie", "unit": "p.u."},
            {"key": "frequency_pu", "label_pl": "Częstotliwość", "unit": "p.u."},
        ],
        "points": [point.to_dict() for point in trajectory],
    }
    run.raw_result = {
        "analysis_type": "dynamic_stability",
        "scenario": scenario.to_dict(),
        "result": result_payload,
        "time_series": time_series_payload,
        "automation_trace": automation_trace.to_dict(),
        "topology_effect": topology_payload,
        "proof_ref": proof_ref,
        "proof_status": "complete",
        "proof_status_pl": "pelny",
        "reporting_status": "reportable",
        "reporting_status_pl": "raportowalny",
        "dopuszczalnosc_raportowa": True,
        "reporting_limitations": [],
    }
    run.white_box_trace = [
        {
            "step": index,
            "key": event.event_type,
            "title": event.detail or event.event_type,
            "target_id": event.element_id,
            "element_id": event.element_id,
            "method_basis": "DYNAMIC_STABILITY_FAULT_CLEAR_V1",
            "result": event.payload,
            "proof_ref": proof_ref,
            "proof_status": "complete",
            "reporting_status": "reportable",
        }
        for index, event in enumerate(automation_trace.events, start=1)
    ]
    run.power_flow_trace = None


def _execute_source_compliance(run: CanonicalRun) -> None:
    snapshot = run.snapshot or {}
    source_ref = _pick_compliance_source_ref(snapshot, run.options)
    source_type = str(run.options.get("source_type") or "PV")
    operator_profile = run.options.get("operator_profile")
    source_profile = run.options.get("source_profile")
    compliance_result = evaluate_source_compliance(
        source_type=source_type,
        operator_profile=operator_profile if isinstance(operator_profile, dict) else None,
        source_profile=source_profile if isinstance(source_profile, dict) else None,
    )
    proof_ref = _source_compliance_proof_ref(run=run, source_ref=source_ref)
    result_payload = compliance_result.to_dict()
    run.raw_result = {
        "analysis_type": "source_compliance",
        "source_ref": source_ref,
        "source_type": result_payload["source_type"],
        "operator_profile": operator_profile,
        "source_profile": source_profile,
        "result": result_payload,
        "proof_ref": proof_ref,
        "proof_status": result_payload["proof_status"],
        "proof_status_pl": (
            "pelny" if result_payload["proof_status"] == "complete" else "niepelny"
        ),
        "reporting_status": result_payload["reporting_status"],
        "reporting_status_pl": (
            "raportowalny"
            if result_payload["reporting_status"] == "reportable"
            else "nieraportowalny"
        ),
        "dopuszczalnosc_raportowa": result_payload["reporting_status"] == "reportable",
        "reporting_limitations": list(result_payload["limitations"]),
    }
    run.white_box_trace = [
        {
            "step": 1,
            "key": "SOURCE_PROFILE_INPUT",
            "title": f"Profil operatora i zrodla: {source_ref}",
            "target_id": source_ref,
            "element_id": source_ref,
            "method_basis": "SOURCE_COMPLIANCE_V1",
            "inputs": {
                "source_type": result_payload["source_type"],
                "operator_profile": operator_profile,
                "source_profile": source_profile,
            },
            "proof_ref": proof_ref,
            "proof_status": result_payload["proof_status"],
            "reporting_status": result_payload["reporting_status"],
        },
        {
            "step": 2,
            "key": "SOURCE_COMPLIANCE_RESULT",
            "title": f"Ocena zgodnosci zrodla: {source_ref}",
            "target_id": source_ref,
            "element_id": source_ref,
            "method_basis": "SOURCE_COMPLIANCE_V1",
            "result": result_payload,
            "proof_ref": proof_ref,
            "proof_status": result_payload["proof_status"],
            "reporting_status": result_payload["reporting_status"],
        },
    ]
    run.power_flow_trace = None


def _execute_short_circuit(run: CanonicalRun) -> None:
    enm = EnergyNetworkModel.model_validate(run.snapshot)
    graph = map_enm_to_network_graph(enm)
    graph_element_context = _build_snapshot_graph_element_context(run.snapshot or {})
    graph_nodes = graph_element_context.get("nodes", {})
    graph_branches = graph_element_context.get("branches", {})
    short_circuit_type = _short_circuit_type_from_options(run.options)

    # Phase 43: opt-in audit2 dla SC. Grounding Z0/Z1 wplywa na Z0_bus oraz
    # block-trafo Z wplywa na fault current contribution. Aplikuje przed
    # build_zero_sequence_zbus.
    audit2_extensions_sc = _maybe_load_audit2_extensions(
        project_id_str=run.options.get("audit2_project_id"),
        station_id=run.options.get("audit2_station_id"),
    )
    if audit2_extensions_sc is not None:
        from solver_input.audit2_solver_adjuster import apply_audit2_to_network_model

        apply_audit2_to_network_model(graph=graph, audit2_extensions=audit2_extensions_sc)

    z0_bus = (
        build_zero_sequence_zbus(enm, graph)
        if _short_circuit_requires_z0(short_circuit_type)
        else None
    )
    c_factor = float(run.options.get("c_factor", 1.10))
    tk_s = float(run.options.get("thermal_time_seconds", 1.0))
    rows: list[dict[str, Any]] = []
    trace_steps: list[dict[str, Any]] = []

    reportable_fault_node_ids = [
        node_id
        for node_id in sorted(graph.nodes.keys())
        if not graph_nodes.get(node_id, {}).get("skip_short_circuit_target", False)
    ]

    for node_id in reportable_fault_node_ids:
        # ZWARCIA-PRO F4 (karta W-C): wkłady gałęziowe FROZEN solvera są liczone
        # ZAWSZE w torze kanonicznym (opcja addytywna solvera — nie zmienia
        # żadnej istniejącej wielkości ani śladu White Box; osobna superpozycja).
        if short_circuit_type == ShortCircuitType.THREE_PHASE:
            result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
                graph=graph,
                fault_node_id=node_id,
                c_factor=c_factor,
                tk_s=tk_s,
                include_branch_contributions=True,
            )
        elif short_circuit_type == ShortCircuitType.SINGLE_PHASE_GROUND:
            result = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
                graph=graph,
                fault_node_id=node_id,
                c_factor=c_factor,
                tk_s=tk_s,
                z0_bus=z0_bus,
                include_branch_contributions=True,
            )
        elif short_circuit_type == ShortCircuitType.TWO_PHASE:
            result = ShortCircuitIEC60909Solver.compute_2ph_short_circuit(
                graph=graph,
                fault_node_id=node_id,
                c_factor=c_factor,
                tk_s=tk_s,
                include_branch_contributions=True,
            )
        else:
            result = ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit(
                graph=graph,
                fault_node_id=node_id,
                c_factor=c_factor,
                tk_s=tk_s,
                z0_bus=z0_bus,
                include_branch_contributions=True,
            )
        payload = result.to_dict()
        node_trace_step_refs: list[int] = []
        for step_index, step in enumerate(payload.get("white_box_trace", []), start=1):
            node_context = graph_nodes.get(node_id, {})
            global_step_index = len(trace_steps) + 1
            node_trace_step_refs.append(global_step_index)
            trace_steps.append(
                {
                    **step,
                    "step": global_step_index,
                    "target_id": node_id,
                    "element_id": node_context.get("element_id"),
                    "element_type": node_context.get("element_type"),
                    "graph_role": node_context.get("graph_role"),
                    "title": step.get("title")
                    or f"Zwarcie {short_circuit_type.value}: {node_id} / krok {step_index}",
                }
            )
        reportability = _short_circuit_reportability(
            run=run,
            target_id=node_id,
            short_circuit_type=short_circuit_type,
            trace_step_refs=node_trace_step_refs,
        )
        for trace_step in trace_steps[-len(node_trace_step_refs) :] if node_trace_step_refs else []:
            trace_step.update(
                {
                    "proof_ref": reportability["proof_ref"],
                    "proof_status": reportability["proof_status"],
                    "reporting_status": reportability["reporting_status"],
                    "method_basis": reportability["method_basis"],
                }
            )
        payload.update(
            {
                "analysis_type": _result_analysis_type_for_fault(short_circuit_type),
                "reporting_status": reportability["reporting_status"],
                "reporting_status_pl": reportability["reporting_status_pl"],
                "proof_status": reportability["proof_status"],
                "proof_status_pl": reportability["proof_status_pl"],
                "proof_ref": reportability["proof_ref"],
                "proof_binding": reportability,
                "dopuszczalnosc_raportowa": True,
                "reporting_limitations": reportability["reporting_limitations"],
                # GAP passthrough (V12K-128): domknięcie kontraktu read-only —
                # wymóg i źródło Z0 na poziomie pozycji wyniku (dotąd wyłącznie
                # w `proof_binding`, gubione w wierszu kanonicznym).
                "requires_z0": reportability["requires_z0"],
                "z0_source": reportability["z0_source"],
            }
        )
        rows.append(payload)

    if not rows:
        raise ValueError("Nie udalo sie obliczyc wynikow zwarciowych dla zadnego wezla")

    run.raw_result = {
        "analysis_type": _result_analysis_type_for_fault(short_circuit_type),
        "short_circuit_type": short_circuit_type.value,
        "reporting_status": "reportable",
        "reporting_status_pl": "raportowalny",
        "proof_status": "complete",
        "proof_status_pl": "pelny",
        "proof_engine_version": "white_box_trace_v1",
        "method_basis": "IEC_60909",
        "requires_z0": _short_circuit_requires_z0(short_circuit_type),
        "z0_source": (
            "ENM_COMMITTED" if _short_circuit_requires_z0(short_circuit_type) else "NOT_APPLICABLE"
        ),
        "reporting_limitations": [],
        "case_id": run.case_id,
        "enm_hash": run.snapshot_hash,
        "results": rows,
        "graph": {
            "nodes": {
                node_id: {
                    "name": node.name,
                    "voltage_level": node.voltage_level,
                    "node_type": node.node_type.value,
                    **graph_nodes.get(node_id, {}),
                }
                for node_id, node in sorted(graph.nodes.items())
            },
            "branches": {
                branch_id: {
                    "name": branch.name,
                    "from_node_id": branch.from_node_id,
                    "to_node_id": branch.to_node_id,
                    **graph_branches.get(branch_id, {}),
                }
                for branch_id, branch in sorted(graph.branches.items())
            },
        },
    }
    run.white_box_trace = trace_steps
    run.power_flow_trace = None


def _normalize_power_flow_solver_method(raw_method: object) -> str:
    normalized = str(raw_method or "NR").strip().upper().replace("-", "_")
    if normalized in {"NR", "NEWTON", "NEWTON_RAPHSON"}:
        return "newton-raphson"
    if normalized in {"GS", "GAUSS", "GAUSS_SEIDEL"}:
        return "gauss-seidel"
    if normalized in {"FD", "FDLF", "FAST_DECOUPLED"}:
        return "fast-decoupled"
    raise ValueError(f"Nieznany tryb rozpływu mocy: {raw_method}")


def _solve_power_flow_with_method(
    pf_input: PowerFlowInput,
    options: PowerFlowOptions,
    run_options: dict[str, Any],
    solver_method: str,
):
    if solver_method == "newton-raphson":
        return PowerFlowNewtonSolver().solve(pf_input)
    if solver_method == "gauss-seidel":
        gs_options = GaussSeidelOptions(
            tolerance=options.tolerance,
            max_iter=options.max_iter,
            damping=options.damping,
            flat_start=options.flat_start,
            validate=options.validate,
            trace_level=options.trace_level,
            acceleration_factor=float(
                run_options.get("acceleration_factor")
                or run_options.get("gs_acceleration_factor")
                or 1.0
            ),
            allow_fallback=False,
        )
        return PowerFlowGaussSeidelSolver().solve(pf_input, gs_options)
    if solver_method == "fast-decoupled":
        fd_method = str(
            run_options.get("fd_method") or run_options.get("fast_decoupled_method") or "XB"
        ).upper()
        if fd_method not in {"XB", "BX"}:
            raise ValueError(f"Nieznany wariant fast-decoupled: {fd_method}")
        fd_options = FastDecoupledOptions(
            tolerance=options.tolerance,
            max_iter=options.max_iter,
            damping=options.damping,
            flat_start=options.flat_start,
            validate=options.validate,
            trace_level=options.trace_level,
            method=fd_method,  # type: ignore[arg-type]
            rebuild_matrices_every=int(run_options.get("rebuild_matrices_every") or 0),
            angle_damping=float(run_options.get("angle_damping") or 1.0),
            voltage_damping=float(run_options.get("voltage_damping") or 1.0),
        )
        return PowerFlowFastDecoupledSolver().solve(pf_input, fd_options)
    raise ValueError(f"Nieznany tryb rozpływu mocy: {solver_method}")


def _first_oltc_branch_id(pf_input: PowerFlowInput) -> str | None:
    """First transformer with a tap changer (stable order by branch id)."""
    from network_model.core.branch import TransformerBranch

    graph = pf_input.typed_graph()
    ids = sorted(
        b.id
        for b in graph.branches.values()
        if isinstance(b, TransformerBranch) and b.tap_changer is not None
    )
    return ids[0] if ids else None


def _run_oltc_study(
    study: str,
    pf_input: PowerFlowInput,
    solve_once,
    run_options: dict[str, Any],
) -> tuple[str, dict[str, Any]] | None:
    """Dispatch an opt-in OLTC study (V12K-046) on the current pf_input.

    Returns ``(raw_result_key, payload_dict)`` or None when not applicable.
    """
    from network_model.solvers.power_flow_oltc_studies import (
        ProfilePoint,
        optimize_tap_positions,
        run_annual_oltc_profile,
        sweep_tap_positions,
    )

    branch_id = run_options.get("oltc_branch_id") or _first_oltc_branch_id(pf_input)

    if study == "annual_profile":
        raw_profile = run_options.get("oltc_load_profile") or []
        profile = [
            ProfilePoint(
                label=str(p.get("label", f"t{i}")),
                load_scale=float(p.get("load_scale", 1.0)),
            )
            for i, p in enumerate(raw_profile)
        ]
        if not profile:
            return None
        result = run_annual_oltc_profile(pf_input, solve_once, profile)
        return ("oltc_annual_profile", result.to_dict())

    if branch_id is None:
        return None

    if study == "sweep":
        positions = run_options.get("oltc_sweep_positions")
        result = sweep_tap_positions(
            pf_input,
            solve_once,
            branch_id=branch_id,
            positions=positions,
        )
        return ("oltc_sweep", result.to_dict())

    if study == "optimize":
        result = optimize_tap_positions(
            pf_input,
            solve_once,
            branch_id=branch_id,
            objective=str(run_options.get("oltc_objective", "minimize_losses")),
            target_kv=run_options.get("oltc_target_kv"),
            switch_penalty_mw_per_step=float(run_options.get("oltc_switch_penalty_mw", 0.0)),
        )
        return ("oltc_optimization", result.to_dict())

    return None


def _maybe_load_audit2_extensions(
    *, project_id_str: str | None, station_id: str | None
) -> dict[str, object] | None:
    """
    Phase 41: opt-in audit2 extensions z DB. Zwraca None gdy brak ID-kow lub
    config nie istnieje. NOT-A-SOLVER: tylko orchestracja, nie physics.
    """
    if not project_id_str or not station_id:
        return None
    try:
        from uuid import UUID

        pid_uuid = UUID(str(project_id_str))
    except ValueError:
        return None

    try:
        from infrastructure.persistence.db import (
            create_engine_from_url,
            create_session_factory,
        )
        from infrastructure.persistence.models import StationAudit2ConfigORM
        from infrastructure.persistence.unit_of_work import build_uow_factory
    except ImportError:
        return None

    import os

    db_url = os.getenv("DATABASE_URL", "sqlite+pysqlite:///./mv_design_pro.db")
    try:
        engine = create_engine_from_url(db_url)
        session_factory = create_session_factory(engine)
        uow_factory = build_uow_factory(session_factory)
    except Exception:
        return None

    with uow_factory() as uow:
        if uow.session is None:
            return None
        cfg = (
            uow.session.query(StationAudit2ConfigORM)
            .filter(
                StationAudit2ConfigORM.project_id == pid_uuid,
                StationAudit2ConfigORM.station_id == station_id,
            )
            .one_or_none()
        )
        if cfg is None:
            return None

        from solver_input.audit2_der_payload import (
            build_station_audit2_payload,
            extract_solver_extensions_from_payload,
        )

        payload = build_station_audit2_payload(
            station_id=cfg.station_id,
            mv_neutral_grounding_ref=cfg.mv_neutral_grounding_ref,
            tap_changer_refs=list(cfg.tap_changer_refs or []),
            der_specs=list(cfg.der_specs or []),
            transformer_tap_changers=dict(cfg.transformer_tap_changers or {}),
        )
        return extract_solver_extensions_from_payload(payload)


def _build_shunt_specs_from_snapshot(snapshot: dict[str, Any], base_mva: float) -> list[ShuntSpec]:
    """Map ENM ShuntCapacitor elements onto the EXISTING solver shunt mechanism.

    NOT-A-SOLVER: this is pure input preparation (mechanical white-box mapping),
    no physics is computed in the solver layer.

    First-principles susceptance of a fixed capacitor bank rated Q_rated [Mvar]
    at U_rated [kV]:
        B = Q_rated / U_rated²            (because Q = B · U²)
    In per-unit on the system base S_base [MVA] (the same base the solver uses to
    build Y_bus from Z_base = U²/S_base):
        b_pu = B · Z_base = (Q_rated / U_rated²) · (U_rated² / S_base)
             = Q_rated / S_base
    A capacitor adds a POSITIVE shunt susceptance (+jB), so b_pu > 0; the solver
    then delivers Q = B · |V|² automatically, i.e. the actual injected reactive
    power scales with the square of the operating voltage (correct physics).

    Missing/invalid rated_mvar or rated_kv is NOT guessed — such elements raise a
    ValueError (the validator surfaces the same condition as a BLOCKER earlier).
    """
    specs: list[ShuntSpec] = []
    for raw in snapshot.get("shunt_capacitors") or []:
        if not isinstance(raw, dict):
            continue
        if str(raw.get("status") or "closed") == "open":
            continue
        ref_id = str(raw.get("ref_id") or "")
        bus_ref = str(raw.get("bus_ref") or "")
        if not bus_ref:
            raise ValueError(
                f"Bateria kondensatorow '{ref_id}' nie ma przypisanej szyny (bus_ref)."
            )
        rated_mvar = raw.get("rated_mvar")
        rated_kv = raw.get("rated_kv")
        if rated_mvar is None or float(rated_mvar) <= 0.0:
            raise ValueError(
                f"Bateria kondensatorow '{ref_id}' nie ma dodatniej mocy "
                f"znamionowej (rated_mvar)."
            )
        if rated_kv is None or float(rated_kv) <= 0.0:
            raise ValueError(
                f"Bateria kondensatorow '{ref_id}' nie ma dodatniego napiecia "
                f"znamionowego (rated_kv)."
            )
        # b_pu = Q_rated / S_base (positive susceptance for a capacitor).
        b_pu = float(rated_mvar) / base_mva
        specs.append(ShuntSpec(node_id=_graph_id_from_ref(bus_ref), g_pu=0.0, b_pu=b_pu))
    return specs


def _oze_opt_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    return None


def _build_converter_control_by_node(
    snapshot: dict[str, Any], base_mva: float
) -> dict[str, InverterControl]:
    """G-OZE-PF (V12K-051): mapuje węzły OZE → InverterControl dla kanonicznego PF.

    Domyka forward-phantom: dotąd kanoniczny run budował PQSpec bez inverter_control,
    więc wybór trybu regulacji (Q(U)/cosφ) nie wpływał na rozpływ mocy. Reużycie
    `inverter_control_from_params` (most języka Polish→InverterMode już w mapperze).

    Determinizm: dołączamy WYŁĄCZNIE realnie aktywne regulacje (cosφ≠1 albo nachylenie
    Q(U)≠0). Źródła pasywne / unity / bez nowych pól → brak wpisu → PQSpec bez
    inverter_control → wynik bajt-w-bajt jak dotąd (istniejące snapshoty nietknięte).
    """
    out: dict[str, InverterControl] = {}
    for gen in snapshot.get("generators") or []:
        if not isinstance(gen, dict):
            continue
        bus_ref = gen.get("bus_ref")
        if not isinstance(bus_ref, str) or not bus_ref.strip():
            continue
        meta = gen.get("meta") if isinstance(gen.get("meta"), dict) else {}
        mode = str(meta.get("control_mode") or gen.get("control_mode") or "").upper()
        cosphi = _oze_opt_float(meta.get("cos_phi"))
        qu_slope = _oze_opt_float(meta.get("qu_slope_pu_per_pu"))
        # V12K-062 (G-OZE-B): statyzm P(f)/LFSM z generatora → lfsm_droop_pct. Realnie
        # aktywny przy odchyłce częstotliwości studium (przy 50 Hz brak wpływu → determinizm).
        lfsm_droop = _oze_opt_float(meta.get("frequency_droop_percent"))
        active = False
        if mode in ("STALY_COS_PHI", "COSPHI_CONST", "COSPHI_P", "COSPHI(P)"):
            active = cosphi is not None and abs(cosphi - 1.0) > 1e-9
        elif mode in ("Q_OD_U", "Q_U", "Q(U)"):
            active = qu_slope is not None and abs(qu_slope) > 1e-12
        # P(f)/LFSM droop aktywuje węzeł niezależnie od trybu Q (statyzm częstotliwościowy).
        if lfsm_droop is not None and abs(lfsm_droop) > 1e-12:
            active = True
        if not active:
            continue
        params: dict[str, Any] = {"control_mode": mode}
        if cosphi is not None:
            params["cosphi"] = cosphi
        if qu_slope is not None:
            params["qu_slope_pu_per_pu"] = qu_slope
            # V12K-064 (G-OZE-B4): napięciowe pasmo nieczułości Q(U) [pu U] — zakres, w którym
            # Q=0 (NC RfG). Brak → domyślny punkt 1.0/1.0 (reakcja natychmiastowa).
            qu_db_low = _oze_opt_float(meta.get("qu_deadband_low_pu"))
            qu_db_high = _oze_opt_float(meta.get("qu_deadband_high_pu"))
            if qu_db_low is not None:
                params["qu_deadband_low_pu"] = qu_db_low
            if qu_db_high is not None:
                params["qu_deadband_high_pu"] = qu_db_high
        if lfsm_droop is not None:
            params["lfsm_droop_pct"] = lfsm_droop
            lfsm_deadband = _oze_opt_float(meta.get("lfsm_deadband_hz"))
            if lfsm_deadband is not None:
                params["lfsm_deadband_hz"] = lfsm_deadband
            if bool(meta.get("lfsm_allow_increase")):
                params["lfsm_allow_increase"] = True
        qmin = _oze_opt_float(meta.get("q_min_mvar"))
        qmax = _oze_opt_float(meta.get("q_max_mvar"))
        if qmin is not None:
            params["qmin_mvar"] = qmin
        if qmax is not None:
            params["qmax_mvar"] = qmax
        pmax = _oze_opt_float(gen.get("p_mw"))
        if pmax is not None:
            params["pmax_mw"] = abs(pmax)
        sn = _oze_opt_float(gen.get("sn_mva")) or _oze_opt_float(meta.get("sn_mva"))
        control = inverter_control_from_params(params, base_mva, sn)
        if control is not None:
            out[_graph_id_from_ref(bus_ref.strip())] = control
    return out


def _execute_power_flow(run: CanonicalRun) -> None:
    graph = _load_graph(run)
    graph_element_context = _build_snapshot_graph_element_context(run.snapshot or {})
    graph_nodes = graph_element_context.get("nodes", {})
    graph_branches = graph_element_context.get("branches", {})

    slack_nodes = sorted(
        node_id for node_id, node in graph.nodes.items() if node.node_type == NodeType.SLACK
    )
    if not slack_nodes:
        raise ValueError("Brak wezla bilansujacego SLACK w kanonicznym snapshotcie ENM")
    slack_node_id = slack_nodes[0]

    # G-OZE-PF (V12K-051): regulacja falownika OZE dla kanonicznego PF (Q(U)/cosφ).
    # base_mva potrzebne przed budową PQSpec, aby przeliczyć limity/nachylenie na pu.
    base_mva = float(run.options.get("base_mva", 100.0))
    converter_control_by_node = _build_converter_control_by_node(run.snapshot or {}, base_mva)

    pq_specs = [
        PQSpec(
            node_id=node_id,
            inverter_control=converter_control_by_node.get(node_id),
            # F9.8 WHITE BOX: `node.active_power`/`node.reactive_power` (built by
            # `enm.mapping`) use the GENERATION convention (positive = injection
            # into the bus; a pure load is negative — see mapping.py, pinned by
            # test_enm_mapping.py and consumed by analysis/boundary/identifier.py).
            # `PQSpec.p_mw`/`q_mvar` are consumed by
            # `power_flow_newton_internal.build_power_spec_v2`, which negates them
            # again expecting the LOAD convention (positive = consumption). This is
            # the single conversion point gen->load at the PQSpec construction
            # boundary; do NOT change the sign convention in mapping.py or in the
            # solver (both are correct/frozen on their own terms).
            p_mw=-float(node.active_power or 0.0),
            q_mvar=-float(node.reactive_power or 0.0),
            # ADR-011 (Z-ZIP-04): aggregated ZIP coefficients for the bus (None
            # => constant power). Solver reduces to classic PQ when None.
            zip_coeffs=node.zip_coeffs,
        )
        for node_id, node in sorted(graph.nodes.items())
        if node.node_type == NodeType.PQ and node_id != slack_node_id
    ]

    options = PowerFlowOptions(
        tolerance=float(run.options.get("tolerance", 1e-8)),
        max_iter=int(run.options.get("max_iterations", run.options.get("max_iter", 30))),
        trace_level=str(run.options.get("trace_level", "full")),
    )
    # base_mva obliczone wyżej (przed PQSpec — potrzebne dla regulacji falownika OZE).
    # Phase 41: opt-in integracja audit2 z istniejacym pipeline'em.
    # Jesli run.options zawiera audit2_project_id + audit2_station_id, ladujemy
    # config z DB i aplikujemy adjustments do graph PRZED solverem.
    audit2_extensions = _maybe_load_audit2_extensions(
        project_id_str=run.options.get("audit2_project_id"),
        station_id=run.options.get("audit2_station_id"),
    )
    if audit2_extensions is not None:
        from solver_input.audit2_solver_adjuster import apply_audit2_to_network_model

        apply_audit2_to_network_model(graph=graph, audit2_extensions=audit2_extensions)

    # D-06c: fixed shunt capacitor banks → existing solver shunt mechanism.
    # ENM ShuntCapacitor -> ShuntSpec(b_pu = Q_rated / S_base). Solver untouched.
    shunt_specs = _build_shunt_specs_from_snapshot(run.snapshot or {}, base_mva)

    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=base_mva,
        slack=SlackSpec(node_id=slack_node_id, u_pu=1.0, angle_rad=0.0),
        pq=pq_specs,
        shunts=shunt_specs,
        options=options,
        # ADR-011 (Z-ZIP-04): study frequency from the ENM header defaults
        # (drives the P(f)/Q(f) factor; at f0 the factor is 1.0).
        base_frequency_hz=_study_frequency_hz(run),
        audit2_extensions=audit2_extensions,
    )
    requested_solver_method = _normalize_power_flow_solver_method(
        run.options.get("solver_method") or run.options.get("method")
    )

    # V12K-045 (OLTC F2): wrap the single-shot solve with the automatic OLTC
    # control loop. Networks without automatic OLTC regulators solve exactly
    # once (oltc_trace is None) — determinism preserved.
    def _solve_once(pfi: PowerFlowInput):
        return _solve_power_flow_with_method(
            pfi,
            options,
            run.options,
            requested_solver_method,
        )

    solution, oltc_trace = solve_with_oltc(pf_input, _solve_once)
    solver_method = str(getattr(solution, "solver_method", requested_solver_method))
    proof_ref = _power_flow_proof_ref(run=run, solver_method=solver_method)
    reporting_status = "reportable" if solution.converged else "not_reportable"
    proof_status = "complete" if solution.converged else "partial"

    # WHITE BOX (K3, następstwo F9.8): PQSpec niesie konwencję OBCIĄŻENIOWĄ
    # (p_mw > 0 = pobór — jedyny punkt konwersji gen→load powyżej), a kontrakt
    # FROZEN ``BusResult.p_injected_mw`` to INJEKCJA (ujemna = pobór,
    # ``power_flow_result.py:35``) — jak moc slacka niżej. Stąd negacja przy
    # montażu wyniku; bez niej szyny PQ miałyby znak odwrotny do slacka i do
    # udokumentowanego kontraktu (defekt ujawniony rekalibracją K3).
    node_p_injected_pu = {node.node_id: 0.0 for node in pf_input.pq}
    node_q_injected_pu = {node.node_id: 0.0 for node in pf_input.pq}
    for pq in pf_input.pq:
        node_p_injected_pu[pq.node_id] = -pq.p_mw / base_mva
        node_q_injected_pu[pq.node_id] = -pq.q_mvar / base_mva
    node_p_injected_pu[pf_input.slack.node_id] = float(solution.slack_power.real)
    node_q_injected_pu[pf_input.slack.node_id] = float(solution.slack_power.imag)

    result_v1 = build_power_flow_result_v1(
        converged=solution.converged,
        iterations_count=solution.iterations,
        tolerance_used=options.tolerance,
        base_mva=base_mva,
        slack_bus_id=pf_input.slack.node_id,
        node_u_mag=solution.node_u_mag,
        node_angle=solution.node_angle,
        node_p_injected_pu=node_p_injected_pu,
        node_q_injected_pu=node_q_injected_pu,
        branch_s_from_mva=solution.branch_s_from_mva,
        branch_s_to_mva=solution.branch_s_to_mva,
        losses_total=solution.losses_total,
        slack_power_pu=solution.slack_power,
        unsolved_node_ids=tuple(solution.not_solved_nodes),
    )

    run.raw_result = {
        "analysis_type": "load_flow",
        "solver_method": solver_method,
        "solver_version": f"load-flow-{solver_method}-v1",
        "proof_ref": proof_ref,
        "proof_status": proof_status,
        "proof_status_pl": "pelny" if proof_status == "complete" else "czesciowy",
        "reporting_status": reporting_status,
        "reporting_status_pl": (
            "raportowalny" if reporting_status == "reportable" else "nieraportowalny"
        ),
        # K30-14 NO-GO #10: quality_status reflects coverage too. Solver
        # converged ALE not_solved_nodes non-empty → 'partial' (nie kłamiemy
        # userowi że accepted gdy ~20% nodes nie ma policzonych wartości).
        "quality_status": (
            "accepted"
            if (solution.converged and not solution.not_solved_nodes)
            else ("partial" if solution.converged else "failed")
        ),
        "applicability_status": "applicable",
        "dopuszczalnosc_raportowa": solution.converged and not solution.not_solved_nodes,
        "reporting_limitations": (
            []
            if (solution.converged and not solution.not_solved_nodes)
            else (
                ["unsolved_nodes_outside_slack_island"]
                if solution.converged
                else ["solver_non_convergence"]
            )
        ),
        "result_v1": result_v1.to_dict(),
        "node_voltage_kv": solution.node_voltage_kv,
        "branch_current_ka": solution.branch_current_ka,
        "graph": {
            "nodes": {
                node_id: {
                    "name": node.name,
                    "voltage_level": node.voltage_level,
                    "node_type": node.node_type.value,
                    **graph_nodes.get(node_id, {}),
                }
                for node_id, node in sorted(graph.nodes.items())
            },
            "branches": {
                branch_id: {
                    "name": branch.name,
                    "from_node_id": branch.from_node_id,
                    "to_node_id": branch.to_node_id,
                    "rated_current_a": getattr(branch, "rated_current_a", None),
                    **graph_branches.get(branch_id, {}),
                }
                for branch_id, branch in sorted(graph.branches.items())
            },
        },
    }
    # V12K-045 (OLTC F2): surface the regulator decision trace only when the
    # OLTC control loop actually ran (additive — non-OLTC runs unchanged).
    if oltc_trace is not None:
        run.raw_result["oltc_control"] = oltc_trace

    # V12K-046 (OLTC G1/G2/G3): opt-in OLTC studies computed on the same pf_input
    # (reuse — no duplicated input builder). Additive: only when requested via
    # run.options["oltc_study"]; the engines restore the tap state they mutate.
    oltc_study = run.options.get("oltc_study")
    if oltc_study:
        study_result = _run_oltc_study(oltc_study, pf_input, _solve_once, run.options)
        if study_result is not None:
            run.raw_result[study_result[0]] = study_result[1]

    run.white_box_trace = _build_power_flow_trace_steps(solution)
    run.power_flow_trace = {
        "solver_version": f"load-flow-{solver_method}-v1",
        "solver_method": solver_method,
        "proof_ref": proof_ref,
        "proof_status": proof_status,
        "reporting_status": reporting_status,
        "input_hash": run.input_hash,
        "snapshot_id": run.snapshot_hash,
        "case_id": run.case_id,
        "run_id": str(run.id),
        "init_state": solution.init_state or {},
        "init_method": "flat_start",
        "tolerance": options.tolerance,
        "max_iterations": options.max_iter,
        "base_mva": base_mva,
        "slack_bus_id": slack_node_id,
        "pq_bus_ids": [spec.node_id for spec in pf_input.pq],
        "pv_bus_ids": [],
        "ybus_trace": solution.ybus_trace,
        "iterations": [
            {
                "k": int(step.get("iter", index + 1)),
                "norm_mismatch": float(step.get("mismatch_norm", step.get("max_mismatch_pu", 0.0))),
                "max_mismatch_pu": float(step.get("max_mismatch_pu", 0.0)),
                "cause_if_failed": step.get("cause_if_failed_optional"),
            }
            for index, step in enumerate(solution.nr_trace)
        ],
        "converged": solution.converged,
        "final_iterations_count": solution.iterations,
        "catalog_context": _build_snapshot_catalog_context(run.snapshot or {}),
    }
    if oltc_trace is not None:
        run.power_flow_trace["oltc_control"] = oltc_trace


def _build_power_flow_trace_steps(solution) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    solver_method = str(getattr(solution, "solver_method", "newton-raphson"))
    title_by_method = {
        "newton-raphson": "Newtona-Raphsona",
        "gauss-seidel": "Gaussa-Seidla",
        "fast-decoupled": "fast-decoupled",
    }
    phase_by_method = {
        "newton-raphson": "newton_raphson",
        "gauss-seidel": "gauss_seidel",
        "fast-decoupled": "fast_decoupled",
    }
    title_method = title_by_method.get(solver_method, solver_method)
    phase = phase_by_method.get(solver_method, solver_method.replace("-", "_"))
    if solution.init_state:
        steps.append(
            {
                "step": 1,
                "title": "Stan poczatkowy",
                "phase": "init",
                "result": solution.init_state,
            }
        )
    for index, iteration in enumerate(solution.nr_trace, start=len(steps) + 1):
        steps.append(
            {
                "step": index,
                "title": f"Iteracja {title_method} {iteration.get('iter', index)}",
                "phase": phase,
                "inputs": {
                    "max_mismatch_pu": {
                        "value": float(iteration.get("max_mismatch_pu", 0.0)),
                        "unit": "pu",
                    },
                },
                "result": {
                    "norm_mismatch": {
                        "value": float(
                            iteration.get("mismatch_norm", iteration.get("max_mismatch_pu", 0.0))
                        ),
                        "unit": "pu",
                    },
                },
                "notes": iteration.get("cause_if_failed_optional"),
            }
        )
    steps.append(
        {
            "step": len(steps) + 1,
            "title": "Wynik koncowy",
            "phase": "final",
            "result": {
                "converged": {"value": solution.converged},
                "iterations": {"value": solution.iterations},
                "max_mismatch_pu": {"value": float(solution.max_mismatch), "unit": "pu"},
            },
        }
    )
    return steps


def build_results_index(run: CanonicalRun) -> dict[str, Any]:
    raw_result = run.raw_result or {}
    tables: list[dict[str, Any]] = []
    if run.analysis_type == "PF":
        result_v1 = raw_result.get("result_v1", {})
        tables.extend(
            [
                {
                    "table_id": "buses",
                    "label_pl": "Szyny",
                    "row_count": len(result_v1.get("bus_results", [])),
                    "columns": [
                        {"key": "name", "label_pl": "Nazwa"},
                        {"key": "bus_id", "label_pl": "ID wezla"},
                        {"key": "un_kv", "label_pl": "Un", "unit": "kV"},
                        {"key": "u_kv", "label_pl": "U", "unit": "kV"},
                        {"key": "u_pu", "label_pl": "U", "unit": "pu"},
                        {"key": "angle_deg", "label_pl": "Kat", "unit": "deg"},
                    ],
                },
                {
                    "table_id": "branches",
                    "label_pl": "Galezie",
                    "row_count": len(result_v1.get("branch_results", [])),
                    "columns": [
                        {"key": "name", "label_pl": "Nazwa"},
                        {"key": "from_bus", "label_pl": "Od"},
                        {"key": "to_bus", "label_pl": "Do"},
                        {"key": "i_a", "label_pl": "I", "unit": "A"},
                        {"key": "p_mw", "label_pl": "P", "unit": "MW"},
                        {"key": "q_mvar", "label_pl": "Q", "unit": "MVAr"},
                        {"key": "s_mva", "label_pl": "S", "unit": "MVA"},
                        {"key": "loading_pct", "label_pl": "Obciazenie", "unit": "%"},
                    ],
                },
            ]
        )
    if run.analysis_type == "short_circuit_sn":
        tables.append(
            {
                "table_id": "short_circuit",
                "label_pl": "Zwarcia",
                "row_count": len(raw_result.get("results", [])),
                "columns": [
                    {"key": "target_id", "label_pl": "Cel"},
                    {"key": "fault_type", "label_pl": "Typ zwarcia"},
                    {"key": "ikss_ka", "label_pl": "Ik''", "unit": "kA"},
                    {"key": "ip_ka", "label_pl": "ip", "unit": "kA"},
                    {"key": "ith_ka", "label_pl": "Ith", "unit": "kA"},
                    {"key": "ib_ka", "label_pl": "Ib", "unit": "kA"},
                    {"key": "ik_ka", "label_pl": "Ik", "unit": "kA"},
                    {"key": "sk_mva", "label_pl": "Sk''", "unit": "MVA"},
                    {"key": "rk_ohm", "label_pl": "Rk", "unit": "ohm"},
                    {"key": "xk_ohm", "label_pl": "Xk", "unit": "ohm"},
                    {"key": "zk_ohm", "label_pl": "|Zk|", "unit": "ohm"},
                    {"key": "xr_ratio", "label_pl": "X/R"},
                    {"key": "kappa", "label_pl": "kappa"},
                    {"key": "c_factor", "label_pl": "c"},
                    {"key": "un_kv", "label_pl": "Un", "unit": "kV"},
                    {"key": "tk_s", "label_pl": "tk", "unit": "s"},
                    {"key": "i2t_ka2s", "label_pl": "I2t", "unit": "kA2s"},
                    {"key": "reporting_status", "label_pl": "Status raportowy"},
                    {"key": "proof_status", "label_pl": "Status uzasadnienia"},
                    {"key": "proof_ref", "label_pl": "Identyfikator uzasadnienia"},
                ],
            }
        )
    if run.analysis_type == "phase_state_sn":
        tables.append(
            {
                "table_id": "phase_state",
                "label_pl": "Stan fazowy SN",
                "row_count": 1 if raw_result.get("result") else 0,
                "columns": [
                    {"key": "target_name", "label_pl": "Cel"},
                    {"key": "ua_kv", "label_pl": "UA", "unit": "kV"},
                    {"key": "ub_kv", "label_pl": "UB", "unit": "kV"},
                    {"key": "uc_kv", "label_pl": "UC", "unit": "kV"},
                    {"key": "ia_a", "label_pl": "IA", "unit": "A"},
                    {"key": "ib_a", "label_pl": "IB", "unit": "A"},
                    {"key": "ic_a", "label_pl": "IC", "unit": "A"},
                    {"key": "voltage_unbalance_percent", "label_pl": "Asymetria U", "unit": "%"},
                    {"key": "current_unbalance_percent", "label_pl": "Asymetria I", "unit": "%"},
                    {"key": "proof_status", "label_pl": "Status uzasadnienia"},
                ],
            }
        )
    if run.analysis_type == "dynamic_stability":
        tables.extend(
            [
                {
                    "table_id": "dynamic_stability",
                    "label_pl": "Stabilnosc dynamiczna",
                    "row_count": 1 if raw_result.get("result") else 0,
                    "columns": [
                        {"key": "source_id", "label_pl": "Zrodlo"},
                        {"key": "faulted_element_id", "label_pl": "Element zaklocenia"},
                        {"key": "status", "label_pl": "Status"},
                        {"key": "clearing_time_ms", "label_pl": "Czas wylaczenia", "unit": "ms"},
                        {"key": "clearing_margin_ms", "label_pl": "Margines", "unit": "ms"},
                        {"key": "angle_swing_deg", "label_pl": "Wychylenie kata", "unit": "deg"},
                        {
                            "key": "post_fault_voltage_pu",
                            "label_pl": "Napiecie po zakloceniu",
                            "unit": "pu",
                        },
                        {"key": "stability_index", "label_pl": "Wskaznik stabilnosci"},
                    ],
                },
                {
                    "table_id": "automation_trace",
                    "label_pl": "Slad automatyki",
                    "row_count": len(
                        (raw_result.get("automation_trace") or {}).get("events") or []
                    ),
                    "columns": [
                        {"key": "event_seq", "label_pl": "Lp."},
                        {"key": "event_type", "label_pl": "Typ zdarzenia"},
                        {"key": "element_id", "label_pl": "Element"},
                        {"key": "detail", "label_pl": "Opis"},
                    ],
                },
            ]
        )
    if run.analysis_type == "source_compliance":
        tables.append(
            {
                "table_id": "source_compliance",
                "label_pl": "Zgodnosc zrodla",
                "row_count": 1 if raw_result.get("result") else 0,
                "columns": [
                    {"key": "source_ref", "label_pl": "Zrodlo"},
                    {"key": "source_type", "label_pl": "Typ"},
                    {"key": "verdict", "label_pl": "Werdykt"},
                    {"key": "reporting_status", "label_pl": "Status raportowy"},
                    {"key": "proof_status", "label_pl": "Status uzasadnienia"},
                    {"key": "limitations", "label_pl": "Ograniczenia"},
                ],
            }
        )
    tables.append(
        {
            "table_id": "trace",
            "label_pl": "Slad obliczen",
            "row_count": len(run.white_box_trace),
            "columns": [{"key": "title", "label_pl": "Opis"}],
        }
    )
    return {
        "run_header": {
            "run_id": str(run.id),
            "project_id": run.project_id or run.case_id,
            "case_id": run.case_id,
            "snapshot_id": run.snapshot_hash,
            "created_at": run.created_at.isoformat(),
            "status": run.status,
            "result_state": run.result_status,
            "solver_kind": run.solver_kind,
            "input_hash": run.input_hash,
        },
        "tables": tables,
    }


def build_bus_results(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "PF":
        return {"run_id": str(run.id), "rows": []}
    raw_result = run.raw_result or {}
    result_v1 = raw_result.get("result_v1", {})
    graph_nodes = (raw_result.get("graph") or {}).get("nodes", {})
    node_voltage_kv = raw_result.get("node_voltage_kv", {})
    rows = []
    for item in result_v1.get("bus_results", []):
        bus_id = item["bus_id"]
        node = graph_nodes.get(bus_id, {})
        flags: list[str] = []
        if node.get("node_type") == "SLACK":
            flags.append("SLACK")
        rows.append(
            {
                "element_id": node.get("element_id") or bus_id,
                "bus_id": bus_id,
                "name": node.get("name", bus_id),
                "un_kv": node.get("voltage_level"),
                "u_kv": node_voltage_kv.get(bus_id),
                "u_pu": item.get("v_pu"),
                "angle_deg": item.get("angle_deg"),
                "synthetic": node.get("synthetic"),
                "graph_role": node.get("graph_role"),
                "flags": flags,
            }
        )
    rows.sort(key=lambda row: (row["name"], row["bus_id"]))
    return {"run_id": str(run.id), "rows": rows}


def build_branch_results(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "PF":
        return {"run_id": str(run.id), "rows": []}
    raw_result = run.raw_result or {}
    result_v1 = raw_result.get("result_v1", {})
    graph_branches = (raw_result.get("graph") or {}).get("branches", {})
    branch_current_ka = raw_result.get("branch_current_ka", {})
    rows = []
    for item in result_v1.get("branch_results", []):
        branch_id = item["branch_id"]
        branch = graph_branches.get(branch_id, {})
        i_ka = branch_current_ka.get(branch_id)
        i_a = i_ka * 1000.0 if i_ka is not None else None
        s_mva = math.sqrt(item.get("p_from_mw", 0.0) ** 2 + item.get("q_from_mvar", 0.0) ** 2)
        rated_current_a = branch.get("rated_current_a")
        loading_pct = (
            (i_a / rated_current_a * 100.0) if i_a is not None and rated_current_a else None
        )
        flags: list[str] = []
        if loading_pct is not None and loading_pct > 100.0:
            flags.append("OVERLOADED")
        rows.append(
            {
                "element_id": branch.get("element_id") or branch_id,
                "branch_id": branch_id,
                "name": branch.get("name", branch_id),
                "from_bus": branch.get("from_node_id", ""),
                "to_bus": branch.get("to_node_id", ""),
                "i_a": i_a,
                "s_mva": s_mva,
                "p_mw": item.get("p_from_mw"),
                "q_mvar": item.get("q_from_mvar"),
                "loading_pct": loading_pct,
                "synthetic": branch.get("synthetic"),
                "graph_role": branch.get("graph_role"),
                "flags": flags,
            }
        )
    rows.sort(key=lambda row: (row["name"], row["branch_id"]))
    return {"run_id": str(run.id), "rows": rows}


def _sc_pelny_bilans(item: dict[str, Any]) -> dict[str, Any]:
    """Pelny bilans IEC 60909 punktu zwarcia (program ZWARCIA-PRO F1, addytywnie).

    Wszystkie wielkosci pochodza z FROZEN solvera (ShortCircuitResult.to_dict);
    tutaj WYLACZNIE deterministyczne projekcje jednostek i wielkosci pochodnych
    zdefiniowanych norma (klasa przeksztalcen jak A->kA, zero fizyki):
    - |Zk| = sqrt(Rk^2 + Xk^2) — modul impedancji Thevenina policzonej przez solver,
    - X/R = 1/(R/X) — odwrotnosc stosunku z solvera (kappa liczy solver),
    - I2t = Ith^2 * tk — definicja pradu zastepczego cieplnego (IEC 60909-0 par. 12).
    Starsze wyniki bez pol -> None (uczciwe braki, kontrakt addytywny).
    """
    zkk = item.get("zkk_ohm") or {}
    rk = zkk.get("re")
    xk = zkk.get("im")
    zk = math.hypot(rk, xk) if rk is not None and xk is not None else None
    rx = item.get("rx_ratio")
    xr = (1.0 / rx) if rx else None
    ith_a = item.get("ith_a")
    tk_s = item.get("tk_s")
    i2t_ka2s = ((ith_a / 1000.0) ** 2 * tk_s) if ith_a is not None and tk_s is not None else None
    un_v = item.get("un_v")
    return {
        "rk_ohm": rk,
        "xk_ohm": xk,
        "zk_ohm": zk,
        "rx_ratio": rx,
        "xr_ratio": xr,
        "kappa": item.get("kappa"),
        "c_factor": item.get("c_factor"),
        "un_kv": (un_v / 1000.0) if un_v is not None else None,
        "tk_s": tk_s,
        "tb_s": item.get("tb_s"),
        "ib_ka": _amps_to_ka(item.get("ib_a")),
        "ik_ka": _amps_to_ka(item.get("ik_total_a")),
        "ik_thevenin_ka": _amps_to_ka(item.get("ik_thevenin_a")),
        "ik_inverters_ka": _amps_to_ka(item.get("ik_inverters_a")),
        "i2t_ka2s": i2t_ka2s,
        # Delta FROZEN V12K-128 (addytywnie): składowe symetryczne impedancji
        # zastępczej WPROST z solvera (`ShortCircuitResult.to_dict` → z1/z2/z0_ohm
        # jako complex {re, im}). Z1/Z2 dla wszystkich typów, Z0 tylko dla zwarć
        # doziemnych (1F/2F+G). Zero fizyki — czysta projekcja pass-through.
        # Starsze wyniki bez pól → None (uczciwy brak, kontrakt addytywny).
        "z1_ohm": item.get("z1_ohm"),
        "z2_ohm": item.get("z2_ohm"),
        "z0_ohm": item.get("z0_ohm"),
    }


def _sc_rozplyw_galeziowy(
    item: dict[str, Any],
    graph_nodes: dict[str, Any],
    graph_branches: dict[str, Any],
) -> list[dict[str, Any]] | None:
    """Rozpływ prądu zwarciowego w gałęziach (ZWARCIA-PRO F4, karta W-C, addytywnie).

    Przenosi `branch_contributions` FROZEN solvera (superpozycja wkładów źródeł
    falownikowych per gałąź — `_build_branch_contributions_for_inverters`) do
    wiersza kanonicznego. WYŁĄCZNIE projekcje prezentacyjne (A→kA, nazwy z grafu
    przebiegu) — zero fizyki. Kierunek ("from_to"/"to_from") wprost z solvera.
    Starsze wyniki bez pola → None (uczciwy brak); pusta lista = policzono,
    brak wkładów falownikowych (kontrakt solvera nie niesie rozpływu Thevenina).
    """
    raw = item.get("branch_contributions")
    if raw is None:
        return None
    flows: list[dict[str, Any]] = []
    for entry in raw:
        branch_id = entry.get("branch_id")
        branch = graph_branches.get(branch_id, {})
        from_id = entry.get("from_node_id")
        to_id = entry.get("to_node_id")
        flows.append(
            {
                "branch_id": branch_id,
                "branch_name": branch.get("name") or branch_id,
                "source_id": entry.get("source_id"),
                "from_node_id": from_id,
                "from_node_name": graph_nodes.get(from_id, {}).get("name") or from_id,
                "to_node_id": to_id,
                "to_node_name": graph_nodes.get(to_id, {}).get("name") or to_id,
                "i_ka": _amps_to_ka(entry.get("i_contrib_a")),
                "direction": entry.get("direction"),
            }
        )
    flows.sort(key=lambda flow: (flow["branch_id"] or "", flow["source_id"] or ""))
    return flows


def build_short_circuit_results(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "short_circuit_sn":
        return {"run_id": str(run.id), "rows": []}
    graph_nodes = ((run.raw_result or {}).get("graph") or {}).get("nodes", {})
    graph_branches = ((run.raw_result or {}).get("graph") or {}).get("branches", {})
    rows = []
    for item in (run.raw_result or {}).get("results", []):
        target_id = item.get("fault_node_id")
        node = graph_nodes.get(target_id, {})
        rows.append(
            {
                "target_id": target_id,
                "element_id": node.get("element_id") or target_id,
                "target_name": node.get("name") or node.get("element_id") or target_id,
                "ikss_ka": _amps_to_ka(item.get("ikss_a")),
                "ip_ka": _amps_to_ka(item.get("ip_a")),
                "ith_ka": _amps_to_ka(item.get("ith_a")),
                "sk_mva": item.get("sk_mva"),
                **_sc_pelny_bilans(item),
                # ZWARCIA-PRO F4 (karta W-C): rozpływ prądu zwarciowego w gałęziach
                # (pole addytywne — starsze wyniki bez pola → None).
                "branch_contributions": _sc_rozplyw_galeziowy(item, graph_nodes, graph_branches),
                "fault_type": item.get("short_circuit_type"),
                # GAP passthrough (V12K-128): wymóg/źródło sieci zerowej Z0 przenoszone
                # do wiersza kanonicznego (konsument read-only wie, czy Z0 dotyczy i
                # skąd pochodzi). Starszy wynik bez pól → None (uczciwy brak).
                "requires_z0": item.get("requires_z0"),
                "z0_source": item.get("z0_source"),
                "analysis_type": item.get("analysis_type")
                or (run.raw_result or {}).get("analysis_type"),
                "reporting_status": item.get("reporting_status")
                or (run.raw_result or {}).get("reporting_status"),
                "reporting_status_pl": item.get("reporting_status_pl")
                or (run.raw_result or {}).get("reporting_status_pl"),
                "proof_status": item.get("proof_status")
                or (run.raw_result or {}).get("proof_status"),
                "proof_status_pl": item.get("proof_status_pl")
                or (run.raw_result or {}).get("proof_status_pl"),
                "proof_ref": item.get("proof_ref"),
                "proof_binding": item.get("proof_binding"),
                "dopuszczalnosc_raportowa": item.get("dopuszczalnosc_raportowa", True),
                "reporting_limitations": item.get("reporting_limitations", []),
                "synthetic": node.get("synthetic"),
                "graph_role": node.get("graph_role"),
                "flags": [],
            }
        )
    rows.sort(key=lambda row: row["target_id"] or "")
    return {"run_id": str(run.id), "rows": rows}


def build_phase_state_results(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "phase_state_sn":
        return {"run_id": str(run.id), "rows": []}
    raw_result = run.raw_result or {}
    result = raw_result.get("result") or {}
    if not result:
        return {"run_id": str(run.id), "rows": []}
    target_ref = str(raw_result.get("target_bus_ref") or raw_result.get("target_id") or "")
    rows = [
        {
            "target_id": str(raw_result.get("target_id") or target_ref),
            "element_id": target_ref,
            "target_name": target_ref,
            "ua_kv": result.get("ua_kv"),
            "ub_kv": result.get("ub_kv"),
            "uc_kv": result.get("uc_kv"),
            "ia_a": result.get("ia_a"),
            "ib_a": result.get("ib_a"),
            "ic_a": result.get("ic_a"),
            "phase_losses_kw": (result.get("phase_losses_kw") or {}),
            "voltage_unbalance_percent": (
                (result.get("unbalance_indices") or {}).get("voltage_percent")
            ),
            "current_unbalance_percent": (
                (result.get("unbalance_indices") or {}).get("current_percent")
            ),
            "losses_unbalance_percent": (
                (result.get("unbalance_indices") or {}).get("losses_percent")
            ),
            "flags": (result.get("flags") or {}),
            "proof_ref": raw_result.get("proof_ref"),
            "proof_status": raw_result.get("proof_status"),
            "proof_status_pl": raw_result.get("proof_status_pl"),
            "reporting_status": raw_result.get("reporting_status"),
            "reporting_status_pl": raw_result.get("reporting_status_pl"),
            "dopuszczalnosc_raportowa": raw_result.get("dopuszczalnosc_raportowa", True),
            "reporting_limitations": raw_result.get("reporting_limitations", []),
        }
    ]
    return {"run_id": str(run.id), "rows": rows}


def build_dynamic_stability_results(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "dynamic_stability":
        return {"run_id": str(run.id), "rows": []}
    result = (run.raw_result or {}).get("result") or {}
    if not result:
        return {"run_id": str(run.id), "rows": []}
    return {
        "run_id": str(run.id),
        "rows": [
            {
                **result,
                "proof_ref": (run.raw_result or {}).get("proof_ref"),
                "proof_status": (run.raw_result or {}).get("proof_status"),
                "proof_status_pl": (run.raw_result or {}).get("proof_status_pl"),
                "reporting_status": (run.raw_result or {}).get("reporting_status"),
                "reporting_status_pl": (run.raw_result or {}).get("reporting_status_pl"),
                "dopuszczalnosc_raportowa": (run.raw_result or {}).get(
                    "dopuszczalnosc_raportowa", True
                ),
                "reporting_limitations": (run.raw_result or {}).get("reporting_limitations", []),
            }
        ],
    }


def build_dynamic_stability_time_series(run: CanonicalRun) -> dict[str, Any]:
    """Szereg czasowy przebiegu stabilności (U(t)/f(t)) — na żądanie.

    Zwraca przebieg zapisany w `raw_result.time_series` dla biegów, które go
    posiadają. Starsze biegi (sprzed wystawienia szeregu) → `has_time_series=False`
    z pustym przebiegiem (uczciwy stan zerowy w UI). Nie wchodzi do domyślnej
    odpowiedzi wyników — endpoint dedykowany, by nie pompować rozmiaru payloadu.
    """
    empty: dict[str, Any] = {
        "run_id": str(run.id),
        "has_time_series": False,
        "time_unit": "s",
        "quantities": [],
        "points": [],
    }
    if run.analysis_type != "dynamic_stability":
        return empty
    time_series = (run.raw_result or {}).get("time_series")
    if not time_series or not time_series.get("points"):
        return empty
    return {
        "run_id": str(run.id),
        "has_time_series": True,
        "time_unit": time_series.get("time_unit", "s"),
        "criteria_version": time_series.get("criteria_version"),
        "quantities": list(time_series.get("quantities") or []),
        "points": list(time_series.get("points") or []),
    }


def build_automation_trace_results(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "dynamic_stability":
        return {"run_id": str(run.id), "rows": []}
    trace = (run.raw_result or {}).get("automation_trace") or {}
    rows = list(trace.get("events") or [])
    rows.sort(key=lambda row: (row.get("event_seq", 0), str(row.get("event_type") or "")))
    return {
        "run_id": str(run.id),
        "topology_effect": trace.get("topology_effect"),
        "rows": rows,
    }


def build_source_compliance_results(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "source_compliance":
        return {"run_id": str(run.id), "rows": []}
    raw_result = run.raw_result or {}
    result = raw_result.get("result") or {}
    if not result:
        return {"run_id": str(run.id), "rows": []}
    return {
        "run_id": str(run.id),
        "rows": [
            {
                "source_ref": raw_result.get("source_ref"),
                "source_type": result.get("source_type"),
                "verdict": result.get("verdict"),
                "reporting_status": result.get("reporting_status"),
                "proof_status": result.get("proof_status"),
                "limitations": list(result.get("limitations") or []),
                "checks": result.get("checks") or {},
                "proof_ref": raw_result.get("proof_ref"),
                "proof_status_pl": raw_result.get("proof_status_pl"),
                "reporting_status_pl": raw_result.get("reporting_status_pl"),
                "dopuszczalnosc_raportowa": raw_result.get("dopuszczalnosc_raportowa", False),
            }
        ],
    }


def _amps_to_ka(value: object | None) -> float | None:
    if value is None:
        return None
    return float(value) / 1000.0


def _graph_id_from_ref(ref_id: str) -> str:
    return str(uuid5(NAMESPACE_DNS, ref_id))


def _build_snapshot_graph_element_context(
    snapshot: dict[str, Any],
) -> dict[str, dict[str, dict[str, Any]]]:
    node_context: dict[str, dict[str, Any]] = {}
    branch_context: dict[str, dict[str, Any]] = {}

    for raw_bus in snapshot.get("buses") or []:
        if not isinstance(raw_bus, dict):
            continue
        ref_id = str(raw_bus.get("ref_id") or "")
        if not ref_id:
            continue
        tags = raw_bus.get("tags") or []
        meta = raw_bus.get("meta") if isinstance(raw_bus.get("meta"), dict) else {}
        skip_short_circuit_target = (
            "helper_bus" in tags
            or ("/section/" in ref_id and ref_id.endswith("/bus_sn"))
            or meta.get("render_on_sld") is False
            or meta.get("show_in_project_tree") is False
        )
        node_context[_graph_id_from_ref(ref_id)] = {
            "element_id": ref_id,
            "element_type": "BUS",
            "synthetic": False,
            "skip_short_circuit_target": skip_short_circuit_target,
        }

    for raw_branch in snapshot.get("branches") or []:
        if not isinstance(raw_branch, dict):
            continue
        ref_id = str(raw_branch.get("ref_id") or "")
        if not ref_id:
            continue
        branch_context[_graph_id_from_ref(ref_id)] = {
            "element_id": ref_id,
            "element_type": "BRANCH",
            "synthetic": False,
        }

    for raw_transformer in snapshot.get("transformers") or []:
        if not isinstance(raw_transformer, dict):
            continue
        ref_id = str(raw_transformer.get("ref_id") or "")
        if not ref_id:
            continue
        branch_context[_graph_id_from_ref(ref_id)] = {
            "element_id": ref_id,
            "element_type": "TRANSFORMER",
            "synthetic": False,
        }

    for raw_source in snapshot.get("sources") or []:
        if not isinstance(raw_source, dict):
            continue
        ref_id = str(raw_source.get("ref_id") or "")
        if not ref_id:
            continue
        node_context[_graph_id_from_ref(f"_gnd_{ref_id}")] = {
            "element_id": ref_id,
            "element_type": "SOURCE",
            "synthetic": True,
            "graph_role": "SOURCE_GROUND",
        }
        branch_context[_graph_id_from_ref(f"_zsrc_{ref_id}")] = {
            "element_id": ref_id,
            "element_type": "SOURCE",
            "synthetic": True,
            "graph_role": "SOURCE_IMPEDANCE",
        }

    return {
        "nodes": node_context,
        "branches": branch_context,
    }


def _build_snapshot_catalog_context(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    collection_labels = {
        "branches": "ODCINEK_SN",
        "transformers": "TRANSFORMATOR_SN_NN",
        "sources": "ZRODLO_SN",
        "loads": "ODBIOR",
        "generators": "ZRODLO",
        "measurements": "POMIAR",
        "protection_assignments": "ZABEZPIECZENIE",
        "branch_points": "PUNKT_ROZGALEZIENIA_SN",
    }
    entries: list[dict[str, Any]] = []

    for collection, element_type in collection_labels.items():
        for raw_element in snapshot.get(collection) or []:
            if not isinstance(raw_element, dict):
                continue

            catalog_ref = raw_element.get("catalog_ref")
            catalog_namespace = raw_element.get("catalog_namespace")
            materialized_params = raw_element.get("materialized_params")
            overrides = raw_element.get("overrides") or []
            parameter_origin = raw_element.get("parameter_source")

            if not any(
                (catalog_ref, catalog_namespace, materialized_params, overrides, parameter_origin)
            ):
                continue

            meta = raw_element.get("meta") or {}
            catalog_item_version = raw_element.get("catalog_version") or meta.get(
                "catalog_item_version"
            )
            catalog_binding = {
                "catalog_namespace": catalog_namespace,
                "catalog_item_id": catalog_ref,
                "catalog_item_version": catalog_item_version,
            }
            source_catalog_label = ":".join(
                str(part) for part in (catalog_namespace, catalog_ref) if part
            )
            if catalog_item_version:
                source_catalog_label = (
                    f"{source_catalog_label}@{catalog_item_version}"
                    if source_catalog_label
                    else str(catalog_item_version)
                )
            entry = {
                "element_id": str(raw_element.get("ref_id") or raw_element.get("id") or ""),
                "element_type": element_type,
                "name": raw_element.get("name"),
                "catalog_binding": catalog_binding,
                "source_catalog": dict(catalog_binding),
                "source_catalog_label": source_catalog_label or None,
                "materialized_params": materialized_params,
            }
            if parameter_origin is not None:
                entry["parameter_origin"] = parameter_origin
                entry["parameter_source"] = parameter_origin
            if raw_element.get("source_mode") is not None:
                entry["source_mode"] = raw_element.get("source_mode")
            if overrides:
                manual_overrides = list(overrides)
                entry["manual_overrides"] = manual_overrides
                entry["overrides"] = manual_overrides
                entry["manual_override_count"] = len(manual_overrides)
                entry["has_manual_overrides"] = True
            else:
                entry["manual_override_count"] = 0
                entry["has_manual_overrides"] = False
            entries.append(entry)

    entries.sort(key=lambda item: (item["element_type"], item["element_id"]))
    return entries


def _build_catalog_context_index(
    catalog_context: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    return {
        str(entry["element_id"]): dict(entry)
        for entry in catalog_context
        if entry.get("element_id")
    }


def _build_catalog_context_summary(catalog_context: list[dict[str, Any]]) -> dict[str, Any]:
    by_type: dict[str, int] = {}
    by_parameter_origin: dict[str, int] = {}
    manual_override_elements = 0
    total_manual_overrides = 0

    for entry in catalog_context:
        element_type = str(entry.get("element_type") or "NIEZNANY")
        by_type[element_type] = by_type.get(element_type, 0) + 1

        parameter_origin = entry.get("parameter_origin") or entry.get("parameter_source")
        if parameter_origin:
            origin_key = str(parameter_origin)
            by_parameter_origin[origin_key] = by_parameter_origin.get(origin_key, 0) + 1

        override_count = int(entry.get("manual_override_count") or 0)
        total_manual_overrides += override_count
        if override_count > 0:
            manual_override_elements += 1

    return {
        "element_count": len(catalog_context),
        "by_type": by_type,
        "by_parameter_origin": by_parameter_origin,
        "manual_override_element_count": manual_override_elements,
        "manual_override_count": total_manual_overrides,
    }


def _enrich_trace_steps_with_catalog_context(
    steps: list[dict[str, Any]],
    catalog_context: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    context_by_element = _build_catalog_context_index(catalog_context)
    enriched_steps: list[dict[str, Any]] = []

    for step in steps:
        enriched = dict(step)
        candidate_ids = [
            step.get("element_id"),
            step.get("target_id"),
            step.get("solver_ref"),
        ]
        catalog_entry = next(
            (
                context_by_element[str(candidate)]
                for candidate in candidate_ids
                if candidate is not None and str(candidate) in context_by_element
            ),
            None,
        )
        if catalog_entry is not None:
            enriched["catalog_context_entry"] = dict(catalog_entry)
            enriched.setdefault("element_id", catalog_entry.get("element_id"))
            enriched.setdefault("element_type", catalog_entry.get("element_type"))
            enriched.setdefault("catalog_binding", catalog_entry.get("catalog_binding"))
            enriched.setdefault("source_catalog", catalog_entry.get("source_catalog"))
            enriched.setdefault("source_catalog_label", catalog_entry.get("source_catalog_label"))
            enriched.setdefault("parameter_origin", catalog_entry.get("parameter_origin"))
            enriched.setdefault("parameter_source", catalog_entry.get("parameter_source"))
            enriched.setdefault("source_mode", catalog_entry.get("source_mode"))
            enriched.setdefault("materialized_params", catalog_entry.get("materialized_params"))
            enriched.setdefault("manual_overrides", catalog_entry.get("manual_overrides"))
            enriched.setdefault("overrides", catalog_entry.get("overrides"))
            enriched.setdefault("manual_override_count", catalog_entry.get("manual_override_count"))
            enriched.setdefault("has_manual_overrides", catalog_entry.get("has_manual_overrides"))

        primary_element_ref = enriched.get("element_id") or (
            catalog_entry.get("element_id") if catalog_entry is not None else None
        )
        primary_element_type = enriched.get("element_type") or (
            catalog_entry.get("element_type") if catalog_entry is not None else None
        )
        related_elements: list[dict[str, Any]] = []
        seen_related: set[tuple[str, str]] = set()

        def register_related(
            element_ref: object | None,
            element_type: object | None,
            role: str,
            *,
            related_elements: list[dict[str, Any]] = related_elements,
            seen_related: set[tuple[str, str]] = seen_related,
        ) -> None:
            if element_ref is None:
                return
            ref_value = str(element_ref)
            key = (ref_value, role)
            if key in seen_related:
                return
            seen_related.add(key)
            payload = {
                "element_ref": ref_value,
                "role": role,
            }
            if element_type is not None:
                payload["element_type"] = str(element_type)
            related_elements.append(payload)

        register_related(primary_element_ref, primary_element_type, "PRIMARY_MODEL")
        register_related(enriched.get("target_id"), primary_element_type, "SOLVER_TARGET")
        register_related(enriched.get("solver_ref"), None, "SOLVER_REF")

        selection_refs: list[str] = []
        for candidate in [primary_element_ref]:
            if candidate is None:
                continue
            candidate_ref = str(candidate)
            if candidate_ref not in selection_refs:
                selection_refs.append(candidate_ref)

        if primary_element_ref is not None:
            enriched["primary_element_ref"] = str(primary_element_ref)
        if primary_element_type is not None:
            enriched["primary_element_type"] = str(primary_element_type)
        enriched["related_elements"] = related_elements
        enriched["selection_refs"] = selection_refs
        enriched_steps.append(enriched)

    return enriched_steps


def _build_trace_selection_index(steps: list[dict[str, Any]]) -> dict[str, int]:
    selection_index: dict[str, int] = {}
    for index, step in enumerate(steps):
        for selection_ref in step.get("selection_refs") or []:
            if selection_ref is None:
                continue
            selection_key = str(selection_ref)
            selection_index.setdefault(selection_key, index)
    return selection_index


def build_extended_trace(run: CanonicalRun) -> dict[str, Any]:
    catalog_context = _build_snapshot_catalog_context(run.snapshot or {})
    enriched_steps = _enrich_trace_steps_with_catalog_context(
        list(run.white_box_trace), catalog_context
    )
    return {
        "run_id": str(run.id),
        "snapshot_id": run.snapshot_hash,
        "input_hash": run.input_hash,
        "white_box_trace": enriched_steps,
        "selection_index": _build_trace_selection_index(enriched_steps),
        "catalog_context": catalog_context,
        "catalog_context_by_element": _build_catalog_context_index(catalog_context),
        "catalog_context_summary": _build_catalog_context_summary(catalog_context),
    }


def build_execution_result_set(run: CanonicalRun) -> dict[str, Any]:
    if run.status != "FINISHED":
        raise ValueError("Wyniki sa dostepne tylko dla zakonczonego przebiegu")
    element_results: list[dict[str, Any]] = []
    global_results: dict[str, Any] = {}
    if run.analysis_type == "short_circuit_sn":
        short_circuit_rows = build_short_circuit_results(run).get("rows", [])
        for item in short_circuit_rows:
            element_results.append(
                {
                    "element_ref": item.get("element_id") or item.get("target_id"),
                    "element_type": "Bus",
                    "solver_ref": item.get("target_id"),
                    "values": {
                        "ikss_ka": item.get("ikss_ka"),
                        "ip_ka": item.get("ip_ka"),
                        "ith_ka": item.get("ith_ka"),
                        "sk_mva": item.get("sk_mva"),
                        "fault_type": item.get("fault_type"),
                        "analysis_type": item.get("analysis_type"),
                        "reporting_status": item.get("reporting_status"),
                        "proof_status": item.get("proof_status"),
                        "proof_ref": item.get("proof_ref"),
                        "dopuszczalnosc_raportowa": item.get("dopuszczalnosc_raportowa"),
                    },
                    "proof_ref": item.get("proof_ref"),
                    "proof_status": item.get("proof_status"),
                    "reporting_status": item.get("reporting_status"),
                }
            )
        global_results = {
            "count": len(element_results),
            "analysis_type": (run.raw_result or {}).get("analysis_type", "short_circuit_3f"),
            "short_circuit_type": (run.raw_result or {}).get("short_circuit_type"),
            "proof_status": (run.raw_result or {}).get("proof_status"),
            "reporting_status": (run.raw_result or {}).get("reporting_status"),
        }
    elif run.analysis_type == "PF":
        result_v1 = (run.raw_result or {}).get("result_v1") or {}
        raw_result = run.raw_result or {}
        for row in build_bus_results(run).get("rows", []):
            element_results.append(
                {
                    "element_ref": row.get("element_id") or row.get("bus_id"),
                    "element_type": "Bus",
                    "solver_ref": row.get("bus_id"),
                    "values": row,
                    "proof_ref": raw_result.get("proof_ref"),
                    "proof_status": raw_result.get("proof_status"),
                    "reporting_status": raw_result.get("reporting_status"),
                }
            )
        # F9.6 (c): resultset v1 nie niosla elementow galeziowych dla
        # LOAD_FLOW (luka wykryta w F9.5) - flow_overlay_probe (spec Sec14.2)
        # czyta P_MW/Q_Mvar/I_A z overlay.elements[ref].metrics, ktore
        # domain/result_builder_v1.py::_extract_element_metrics wyprowadza
        # z kluczy "p_from_mw"/"q_from_mvar"/"i_a" w `values`. build_branch_
        # results() (WHITE BOX, uzywana identycznie przez inny endpoint,
        # api/canonical_run_views.py::build_branch_results_response) zwraca
        # "p_mw"/"q_mvar" - aliasujemy do kluczy rozpoznawanych przez mape
        # metryk (juz istniejacych tam dla p_injected_mw/p_from_mw), bez
        # zmiany build_branch_results ani PowerFlowResult (Frozen Result API,
        # rule 6 - to jest wylacznie interpretacja istniejacego wyniku).
        # V12K-089 (OLTC overlay wynikowy): pozycja koncowa zaczepu i liczba
        # przelaczen z `oltc_control` na gałęzi transformatora — dane overlay
        # (glif OLTC odswiezony po obliczeniu). Additive/exclude_none: tylko dla
        # transformatorow z realna regulacja (final_positions), reszta bez zmian
        # (determinizm zachowany). Interpretacja istniejacego wyniku solvera —
        # PowerFlowResult FROZEN nietkniety.
        _oltc_ctrl = raw_result.get("oltc_control") or {}
        _oltc_final = _oltc_ctrl.get("final_positions") or {}
        _oltc_switches = _oltc_ctrl.get("switch_counts") or {}
        for branch_row in build_branch_results(run).get("rows", []):
            _branch_id = branch_row.get("branch_id")
            _values: dict[str, Any] = {
                **branch_row,
                "p_from_mw": branch_row.get("p_mw"),
                "q_from_mvar": branch_row.get("q_mvar"),
            }
            if _branch_id in _oltc_final:
                _values["tap_position"] = _oltc_final[_branch_id]
                if _branch_id in _oltc_switches:
                    _values["tap_switch_count"] = _oltc_switches[_branch_id]
            element_results.append(
                {
                    "element_ref": branch_row.get("element_id") or branch_row.get("branch_id"),
                    "element_type": "Branch",
                    "solver_ref": branch_row.get("branch_id"),
                    "values": _values,
                    "proof_ref": raw_result.get("proof_ref"),
                    "proof_status": raw_result.get("proof_status"),
                    "reporting_status": raw_result.get("reporting_status"),
                }
            )
        global_results = {
            **(result_v1.get("summary", {}) or {}),
            "analysis_type": "load_flow",
            "solver_method": raw_result.get("solver_method"),
            "proof_ref": raw_result.get("proof_ref"),
            "proof_status": raw_result.get("proof_status"),
            "reporting_status": raw_result.get("reporting_status"),
            "quality_status": raw_result.get("quality_status"),
            "applicability_status": raw_result.get("applicability_status"),
            "dopuszczalnosc_raportowa": raw_result.get("dopuszczalnosc_raportowa", False),
        }
        # V12K-045/046 (OLTC H2): surface the regulator trace and study results so
        # the UI can read them from the run result set. Additive — each key is
        # present only when the corresponding feature ran (determinism preserved).
        for oltc_key in (
            "oltc_control",
            "oltc_sweep",
            "oltc_annual_profile",
            "oltc_optimization",
        ):
            if raw_result.get(oltc_key) is not None:
                global_results[oltc_key] = raw_result[oltc_key]
    elif run.analysis_type == "phase_state_sn":
        phase_rows = build_phase_state_results(run).get("rows", [])
        for row in phase_rows:
            element_results.append(
                {
                    "element_ref": row.get("element_id") or row.get("target_id"),
                    "element_type": "Bus",
                    "solver_ref": row.get("target_id"),
                    "values": row,
                    "proof_ref": row.get("proof_ref"),
                    "proof_status": row.get("proof_status"),
                    "reporting_status": row.get("reporting_status"),
                }
            )
        global_results = {
            "count": len(element_results),
            "analysis_type": "phase_state_sn",
            "proof_status": (run.raw_result or {}).get("proof_status"),
            "reporting_status": (run.raw_result or {}).get("reporting_status"),
        }
    elif run.analysis_type == "dynamic_stability":
        stability_rows = build_dynamic_stability_results(run).get("rows", [])
        for row in stability_rows:
            element_results.append(
                {
                    "element_ref": row.get("source_id") or row.get("faulted_element_id"),
                    "element_type": "Source",
                    "solver_ref": row.get("scenario_id"),
                    "values": row,
                    "proof_ref": row.get("proof_ref"),
                    "proof_status": row.get("proof_status"),
                    "reporting_status": row.get("reporting_status"),
                }
            )
        global_results = {
            "count": len(element_results),
            "analysis_type": "dynamic_stability",
            "automation_event_count": len(build_automation_trace_results(run).get("rows", [])),
            "proof_status": (run.raw_result or {}).get("proof_status"),
            "reporting_status": (run.raw_result or {}).get("reporting_status"),
        }
    elif run.analysis_type == "source_compliance":
        compliance_rows = build_source_compliance_results(run).get("rows", [])
        for row in compliance_rows:
            element_results.append(
                {
                    "element_ref": row.get("source_ref"),
                    "element_type": "Source",
                    "solver_ref": row.get("source_ref"),
                    "values": row,
                    "proof_ref": row.get("proof_ref"),
                    "proof_status": row.get("proof_status"),
                    "reporting_status": row.get("reporting_status"),
                }
            )
        global_results = {
            "count": len(element_results),
            "analysis_type": "source_compliance",
            "proof_status": (run.raw_result or {}).get("proof_status"),
            "reporting_status": (run.raw_result or {}).get("reporting_status"),
        }

    signature_payload = json.dumps(
        _canonicalize(
            {
                "run_id": str(run.id),
                "analysis_type": run.analysis_type,
                "validation": run.validation,
                "readiness": run.readiness,
                "element_results": element_results,
                "global_results": global_results,
            }
        ),
        sort_keys=True,
        separators=(",", ":"),
    )
    deterministic_signature = hashlib.sha256(signature_payload.encode("utf-8")).hexdigest()

    analysis_type = _execution_analysis_type_for_run(run)
    return {
        "run_id": str(run.id),
        "analysis_type": analysis_type,
        "validation_snapshot": run.validation,
        "readiness_snapshot": run.readiness,
        "element_results": element_results,
        "global_results": global_results,
        "deterministic_signature": deterministic_signature,
    }
