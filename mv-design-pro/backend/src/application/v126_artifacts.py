from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from typing import Any

JsonDict = dict[str, Any]

V126_PROOF_VERSION = "AcademicProofPackV1"
V126_REPORT_VERSION = "AcademicReportV1"


def _canonical_payload(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _hash(payload: Any) -> str:
    return hashlib.sha256(_canonical_payload(payload).encode("utf-8")).hexdigest()


def _result_payload(run_record: Mapping[str, Any]) -> Mapping[str, Any]:
    result = run_record["result"]
    if not isinstance(result, Mapping):
        raise TypeError("V12.6 run record does not contain a mapping result.")
    return result


def _metric_rows(value: Any, prefix: str = "", limit: int = 24) -> list[JsonDict]:
    rows: list[JsonDict] = []
    if len(rows) >= limit:
        return rows
    if not isinstance(value, Mapping):
        rows.append({"label": prefix or "wynik", "value": value})
        return rows
    for key in sorted(value):
        if len(rows) >= limit:
            break
        item = value[key]
        label = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(item, list):
            rows.append({"label": label, "value": f"{len(item)} pozycji"})
            if item and isinstance(item[0], Mapping):
                for child_key in sorted(item[0])[:6]:
                    rows.append({"label": f"{label}[0].{child_key}", "value": item[0][child_key]})
                    if len(rows) >= limit:
                        break
        elif isinstance(item, Mapping):
            rows.extend(_metric_rows(item, label, limit - len(rows)))
        else:
            rows.append({"label": label, "value": item})
    return rows[:limit]


def build_v126_proof_artifact(run_record: Mapping[str, Any]) -> JsonDict:
    result = _result_payload(run_record)
    trace_steps = result.get("white_box_trace", [])
    if not isinstance(trace_steps, list):
        trace_steps = []
    deterministic_hash = str(result["deterministic_hash"])
    analysis_type = str(run_record["analysis_type"])
    steps = []
    for index, step in enumerate(trace_steps, start=1):
        if not isinstance(step, Mapping):
            continue
        steps.append(
            {
                "ordinal": index,
                "proof_ref": step.get("proof_ref") or f"proof:v126:{analysis_type}:{index}",
                "formula": step.get("formula"),
                "data": step.get("data", {}),
                "substitution": step.get("substitution"),
                "result": step.get("result", {}),
                "unit_check": step.get("unit_check"),
                "proof_status": step.get("proof_status", "complete"),
            }
        )
    proof = {
        "contract": V126_PROOF_VERSION,
        "proof_id": f"proof:v126:{analysis_type}:{deterministic_hash[:16]}",
        "run_id": run_record["run_id"],
        "case_id": run_record["case_id"],
        "analysis_type": analysis_type,
        "source_result_hash": deterministic_hash,
        "trace_step_count": len(steps),
        "steps": steps,
    }
    proof["proof_hash"] = _hash(proof)
    return proof


def build_v126_report_artifact(run_record: Mapping[str, Any], proof: Mapping[str, Any]) -> JsonDict:
    result = _result_payload(run_record)
    payload = result.get("result", {})
    analysis_type = str(run_record["analysis_type"])
    source_result_hash = str(result["deterministic_hash"])
    proof_hash = str(proof["proof_hash"])
    report = {
        "contract": V126_REPORT_VERSION,
        "report_id": f"report:v126:{analysis_type}:{source_result_hash[:16]}",
        "run_id": run_record["run_id"],
        "case_id": run_record["case_id"],
        "analysis_type": analysis_type,
        "source_result_hash": source_result_hash,
        "source_proof_hash": proof_hash,
        "export_policy": "frozen_result_and_proof_only",
        "sections": [
            {
                "section_id": "wynik",
                "title": "Wynik obliczeń",
                "metrics": _metric_rows(payload),
            },
            {
                "section_id": "dowod",
                "title": "Dowód obliczeń",
                "metrics": [
                    {"label": "proof_id", "value": proof["proof_id"]},
                    {"label": "proof_hash", "value": proof_hash},
                    {"label": "trace_step_count", "value": proof["trace_step_count"]},
                ],
            },
            {
                "section_id": "audyt",
                "title": "Audyt deterministyczny",
                "metrics": [
                    {"label": "result_hash", "value": source_result_hash},
                    {"label": "solver_version", "value": result.get("solver_version")},
                    {"label": "input_hash", "value": result.get("input_hash")},
                ],
            },
        ],
    }
    report["report_hash"] = _hash(report)
    return report
