from __future__ import annotations

import hashlib
import json
import math
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import NAMESPACE_DNS, UUID, uuid4, uuid5

from enm.hash import compute_enm_hash
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from enm.store import get_enm
from enm.validator import ENMValidator
from infrastructure.persistence.repositories.canonical_run_repository import (
    canonical_run_repository_scope,
)
from network_model.core.node import NodeType
from network_model.solvers.power_flow_newton import PowerFlowNewtonSolver
from network_model.solvers.power_flow_result import build_power_flow_result_v1
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)
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
        return "short_circuit_sn"

    def to_execution_dict(self) -> dict[str, Any]:
        analysis_type = "LOAD_FLOW" if self.analysis_type == "PF" else "SC_3F"
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
    if analysis_type == "short_circuit_sn" and not availability.short_circuit_3f:
        raise ValueError("Analiza zwarciowa nie jest dostepna dla biezacego snapshotu ENM")

    snapshot = enm.model_dump(mode="json")
    enm_hash = compute_enm_hash(enm)
    normalized_options = dict(options or {})
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


def _load_graph(run: CanonicalRun):
    enm = EnergyNetworkModel.model_validate(run.snapshot)
    return map_enm_to_network_graph(enm)


def _execute_short_circuit(run: CanonicalRun) -> None:
    graph = _load_graph(run)
    graph_element_context = _build_snapshot_graph_element_context(run.snapshot or {})
    graph_nodes = graph_element_context.get("nodes", {})
    graph_branches = graph_element_context.get("branches", {})
    c_factor = float(run.options.get("c_factor", 1.10))
    tk_s = float(run.options.get("thermal_time_seconds", 1.0))
    rows: list[dict[str, Any]] = []
    trace_steps: list[dict[str, Any]] = []

    for node_id in sorted(graph.nodes.keys()):
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id=node_id,
            c_factor=c_factor,
            tk_s=tk_s,
        )
        payload = result.to_dict()
        rows.append(payload)
        for step_index, step in enumerate(payload.get("white_box_trace", []), start=1):
            node_context = graph_nodes.get(node_id, {})
            trace_steps.append(
                {
                    **step,
                    "step": len(trace_steps) + 1,
                    "target_id": node_id,
                    "element_id": node_context.get("element_id"),
                    "element_type": node_context.get("element_type"),
                    "graph_role": node_context.get("graph_role"),
                    "title": step.get("title") or f"Zwarcie 3F: {node_id} / krok {step_index}",
                }
            )

    if not rows:
        raise ValueError("Nie udalo sie obliczyc wynikow zwarciowych dla zadnego wezla")

    run.raw_result = {
        "analysis_type": "short_circuit_3f",
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

    pq_specs = [
        PQSpec(
            node_id=node_id,
            p_mw=float(node.active_power or 0.0),
            q_mvar=float(node.reactive_power or 0.0),
        )
        for node_id, node in sorted(graph.nodes.items())
        if node.node_type == NodeType.PQ and node_id != slack_node_id
    ]

    options = PowerFlowOptions(
        tolerance=float(run.options.get("tolerance", 1e-8)),
        max_iter=int(run.options.get("max_iterations", run.options.get("max_iter", 30))),
        trace_level=str(run.options.get("trace_level", "full")),
    )
    base_mva = float(run.options.get("base_mva", 100.0))
    pf_input = PowerFlowInput(
        graph=graph,
        base_mva=base_mva,
        slack=SlackSpec(node_id=slack_node_id, u_pu=1.0, angle_rad=0.0),
        pq=pq_specs,
        options=options,
    )
    solution = PowerFlowNewtonSolver().solve(pf_input)

    node_p_injected_pu = {node.node_id: 0.0 for node in pf_input.pq}
    node_q_injected_pu = {node.node_id: 0.0 for node in pf_input.pq}
    for pq in pf_input.pq:
        node_p_injected_pu[pq.node_id] = pq.p_mw / base_mva
        node_q_injected_pu[pq.node_id] = pq.q_mvar / base_mva
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
    )

    run.raw_result = {
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
    run.white_box_trace = _build_power_flow_trace_steps(solution)
    run.power_flow_trace = {
        "solver_version": "1.0.0",
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


def _build_power_flow_trace_steps(solution) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
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
                "title": f"Iteracja Newtona-Raphsona {iteration.get('iter', index)}",
                "phase": "newton_raphson",
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
                    {"key": "ikss_ka", "label_pl": "Ik''", "unit": "kA"},
                    {"key": "ip_ka", "label_pl": "ip", "unit": "kA"},
                    {"key": "ith_ka", "label_pl": "Ith", "unit": "kA"},
                    {"key": "sk_mva", "label_pl": "Sk''", "unit": "MVA"},
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


def build_short_circuit_results(run: CanonicalRun) -> dict[str, Any]:
    if run.analysis_type != "short_circuit_sn":
        return {"run_id": str(run.id), "rows": []}
    graph_nodes = ((run.raw_result or {}).get("graph") or {}).get("nodes", {})
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
                "fault_type": item.get("short_circuit_type"),
                "synthetic": node.get("synthetic"),
                "graph_role": node.get("graph_role"),
                "flags": [],
            }
        )
    rows.sort(key=lambda row: row["target_id"] or "")
    return {"run_id": str(run.id), "rows": rows}


def _amps_to_ka(value: Any) -> float | None:
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
        node_context[_graph_id_from_ref(ref_id)] = {
            "element_id": ref_id,
            "element_type": "BUS",
            "synthetic": False,
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
                    },
                }
            )
        global_results = {
            "count": len(element_results),
            "analysis_type": "short_circuit_3f",
        }
    elif run.analysis_type == "PF":
        result_v1 = (run.raw_result or {}).get("result_v1") or {}
        for row in build_bus_results(run).get("rows", []):
            element_results.append(
                {
                    "element_ref": row.get("element_id") or row.get("bus_id"),
                    "element_type": "Bus",
                    "solver_ref": row.get("bus_id"),
                    "values": row,
                }
            )
        global_results = result_v1.get("summary", {})

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

    analysis_type = "LOAD_FLOW" if run.analysis_type == "PF" else "SC_3F"
    return {
        "run_id": str(run.id),
        "analysis_type": analysis_type,
        "validation_snapshot": run.validation,
        "readiness_snapshot": run.readiness,
        "element_results": element_results,
        "global_results": global_results,
        "deterministic_signature": deterministic_signature,
    }
