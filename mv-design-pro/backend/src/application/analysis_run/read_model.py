from __future__ import annotations

from typing import Any

from domain.analysis_run import AnalysisRun

DETERMINISTIC_LIST_KEYS = {
    "branches",
    "nodes",
    "phases",
    "warnings",
}


def build_deterministic_id(run: AnalysisRun) -> str:
    return f"{run.analysis_type}:{run.operating_case_id}:{run.input_hash}"


def canonicalize_json(value: Any, *, current_key: str | None = None) -> Any:
    if isinstance(value, dict):
        return {key: canonicalize_json(value[key], current_key=key) for key in sorted(value.keys())}
    if isinstance(value, list):
        items = [canonicalize_json(item, current_key=current_key) for item in value]
        if current_key in DETERMINISTIC_LIST_KEYS:
            return sorted(items, key=_stable_sort_key)
        return items
    return value


def minimize_summary(summary: dict[str, Any]) -> dict[str, Any]:
    if not summary:
        return {}
    preferred_keys = [
        "status",
        "converged",
        "iterations",
        "fault_node_id",
        "short_circuit_type",
        "ikss_a",
        "connection_node_id",
    ]
    reduced = {key: summary[key] for key in preferred_keys if key in summary}
    if reduced:
        return reduced
    return {key: summary[key] for key in sorted(summary.keys())}


def build_input_metadata(snapshot: dict[str, Any]) -> dict[str, Any]:
    metadata: dict[str, Any] = {}
    for key in sorted(snapshot.keys()):
        value = snapshot[key]
        if isinstance(value, list):
            metadata[key] = {"count": len(value)}
        elif isinstance(value, dict):
            metadata[key] = {"keys": sorted(value.keys())}
        else:
            metadata[key] = value
    return metadata


def get_run_trace(run: AnalysisRun) -> dict[str, Any] | list[dict[str, Any]] | None:
    if run.analysis_type == "short_circuit_sn":
        return run.white_box_trace
    if run.analysis_type == "PF":
        return run.trace_json
    return None


def build_trace_summary(
    trace_payload: dict[str, Any] | list[dict[str, Any]],
) -> dict[str, Any]:
    if isinstance(trace_payload, list):
        return _summarize_list_trace(trace_payload)
    return _summarize_dict_trace(trace_payload)


def _summarize_list_trace(trace_payload: list[dict[str, Any]]) -> dict[str, Any]:
    count = len(trace_payload)
    first_step = _extract_step_name(trace_payload[0]) if trace_payload else None
    last_step = _extract_step_name(trace_payload[-1]) if trace_payload else None
    phases = []
    warnings = []
    for step in trace_payload:
        step_key = _extract_step_name(step)
        if step_key and step_key not in phases:
            phases.append(step_key)
        note = step.get("notes")
        if note:
            warnings.append(str(note))
    return {
        "count": count,
        "first_step": first_step,
        "last_step": last_step,
        "phases": phases,
        "duration_ms": _extract_duration(trace_payload),
        "warnings": warnings,
    }


def _summarize_dict_trace(trace_payload: dict[str, Any]) -> dict[str, Any]:
    phases = sorted(trace_payload.keys())
    first_step = phases[0] if phases else None
    last_step = phases[-1] if phases else None
    warnings = []
    validation = trace_payload.get("validation")
    if isinstance(validation, dict):
        warnings = list(validation.get("warnings") or [])
    if "nr_iterations" in trace_payload:
        count = len(trace_payload.get("nr_iterations", []))
    else:
        count = len(phases)
    return {
        "count": count,
        "first_step": first_step,
        "last_step": last_step,
        "phases": phases,
        "duration_ms": _extract_duration(trace_payload),
        "warnings": warnings,
    }


def _extract_step_name(step: dict[str, Any]) -> str | None:
    return step.get("key") or step.get("title") or step.get("step")


def _extract_duration(trace_payload: Any) -> float | None:
    if isinstance(trace_payload, dict):
        timing = trace_payload.get("timing")
        if isinstance(timing, dict):
            if "total_ms" in timing:
                return float(timing["total_ms"])
        if "duration_ms" in trace_payload:
            return float(trace_payload["duration_ms"])
    return None


def _stable_sort_key(item: Any) -> str:
    if isinstance(item, dict):
        for key in ("id", "node_id", "branch_id", "result_type", "key", "title"):
            if key in item and item[key] is not None:
                return str(item[key])
    return str(item)
