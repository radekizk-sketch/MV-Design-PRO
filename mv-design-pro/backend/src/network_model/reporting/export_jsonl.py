"""
Reporting/export layer - JSONL export for white-box traces and snapshots.

This module provides line-oriented JSON export for calculation traces and
network snapshots. Each line is a self-contained JSON object suitable for
streaming, log ingestion, and deterministic replay.

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: No physics calculations, only serialization
- Deterministic: Same input -> identical output (sort_keys=True)
- UTF-8 encoding
- One JSON object per line (JSON Lines / JSONL format)
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _trace_step_substitution_text(step: dict[str, Any]) -> str | None:
    """Return the canonical substitution text for a white-box step."""
    substitution_latex = step.get("substitution_latex")
    if substitution_latex:
        return str(substitution_latex)
    substitution = step.get("substitution")
    if substitution:
        return str(substitution)
    return None


def export_trace_jsonl(
    white_box_trace: list[dict[str, Any]],
    output_path: str | Path,
) -> Path:
    """
    Export white-box trace steps to a JSONL file.

    Each line is one calculation step as a JSON object with fields:
    - step_number: int (1-indexed, chronological order)
    - step_name: str (key from trace step)
    - formula: str (LaTeX formula)
    - values: dict (input values)
    - result: dict (output values)
    - unit: str (unit of result, if available)

    Steps are ordered chronologically (by their position in the trace list).

    Args:
        white_box_trace: List of white-box step dicts from solver output.
            Each dict should have keys: key, title, formula_latex, inputs,
            substitution, result, notes (optional).
        output_path: Target file path. Parent directories are created if needed.

    Returns:
        Path to the written JSONL file.

    Raises:
        ValueError: If any step cannot be serialized to JSON.

    Example:
        >>> trace = result.white_box_trace  # or result.to_dict()["white_box_trace"]
        >>> path = export_trace_jsonl(trace, "output/trace.jsonl")
    """
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []

    for idx, step in enumerate(white_box_trace):
        step_number = idx + 1
        step_name = step.get("key", f"step_{step_number}")

        # Extract formula
        formula = step.get("formula_latex", "")

        # Extract input values
        values = step.get("inputs", {})

        # Extract result
        result = step.get("result", {})

        # Extract unit from result keys (heuristic: first key with _ohm, _a, _mva etc.)
        unit = _infer_unit_from_result(result)

        # Build JSONL line
        line_data: dict[str, Any] = {
            "step_number": step_number,
            "step_name": step_name,
            "formula": formula,
            "values": _serialize_values(values),
            "result": _serialize_values(result),
            "unit": unit,
        }

        # Optional fields
        substitution = step.get("substitution")
        if substitution:
            line_data["substitution"] = str(substitution)

        substitution_latex = _trace_step_substitution_text(step)
        if substitution_latex:
            line_data["substitution_latex"] = substitution_latex

        title = step.get("title")
        if title:
            line_data["title"] = title

        notes = step.get("notes")
        if notes:
            line_data["notes"] = str(notes)

        try:
            json_line = json.dumps(line_data, ensure_ascii=False, sort_keys=True)
        except (TypeError, ValueError) as e:
            raise ValueError(
                f"Step {step_number} ({step_name}): Failed to serialize to JSON: {e}"
            ) from e

        lines.append(json_line)

    out.write_text("\n".join(lines) + "\n" if lines else "", encoding="utf-8")
    return out


def export_snapshot_jsonl(
    snapshot: dict[str, Any],
    output_path: str | Path,
) -> Path:
    """
    Export a network snapshot to a JSONL file.

    Each line represents one entity from the snapshot:
    - First line: metadata (type="metadata", timestamp, snapshot_id, etc.)
    - Then: one line per node (type="node")
    - Then: one line per branch (type="branch")
    - Then: one line per source (type="source")
    - Then: one line per load (type="load")

    Args:
        snapshot: Network snapshot dict. Expected keys:
            - nodes: list[dict]
            - branches: list[dict]
            - sources: list[dict] (optional)
            - loads: list[dict] (optional)
            - metadata: dict (optional)
        output_path: Target file path. Parent directories are created if needed.

    Returns:
        Path to the written JSONL file.

    Raises:
        ValueError: If snapshot is not a dict or cannot be serialized.
    """
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    if not isinstance(snapshot, dict):
        raise ValueError(f"snapshot must be a dict, got {type(snapshot).__name__}")

    lines: list[str] = []

    # 1) Metadata line
    meta = snapshot.get("metadata", {})
    meta_line: dict[str, Any] = {
        "type": "metadata",
        "snapshot_id": meta.get("snapshot_id") or snapshot.get("snapshot_id"),
        "created_at": meta.get("created_at") or snapshot.get("created_at"),
        "node_count": len(snapshot.get("nodes", [])),
        "branch_count": len(snapshot.get("branches", [])),
    }
    lines.append(json.dumps(meta_line, ensure_ascii=False, sort_keys=True))

    # 2) Nodes
    for node in snapshot.get("nodes", []):
        node_line: dict[str, Any] = {"type": "node"}
        node_line.update(_serialize_values(node))
        lines.append(json.dumps(node_line, ensure_ascii=False, sort_keys=True))

    # 3) Branches
    for branch in snapshot.get("branches", []):
        branch_line: dict[str, Any] = {"type": "branch"}
        branch_line.update(_serialize_values(branch))
        lines.append(json.dumps(branch_line, ensure_ascii=False, sort_keys=True))

    # 4) Sources (optional)
    for source in snapshot.get("sources", []):
        source_line: dict[str, Any] = {"type": "source"}
        source_line.update(_serialize_values(source))
        lines.append(json.dumps(source_line, ensure_ascii=False, sort_keys=True))

    # 5) Loads (optional)
    for load in snapshot.get("loads", []):
        load_line: dict[str, Any] = {"type": "load"}
        load_line.update(_serialize_values(load))
        lines.append(json.dumps(load_line, ensure_ascii=False, sort_keys=True))

    out.write_text("\n".join(lines) + "\n" if lines else "", encoding="utf-8")
    return out


def _serialize_values(data: dict[str, Any] | Any) -> dict[str, Any] | Any:
    """
    Recursively serialize values to JSON-compatible types.

    Handles complex numbers and numpy types.
    """
    if not isinstance(data, dict):
        return _serialize_single(data)

    result: dict[str, Any] = {}
    for key, value in data.items():
        result[key] = _serialize_single(value)
    return result


def _serialize_single(value: Any) -> Any:
    """Serialize a single value to a JSON-compatible type."""
    if isinstance(value, complex):
        return {"re": value.real, "im": value.imag}
    if isinstance(value, dict):
        return _serialize_values(value)
    if isinstance(value, list | tuple):
        return [_serialize_single(v) for v in value]
    if hasattr(value, "item"):  # numpy scalar
        return value.item()
    return value


def _infer_unit_from_result(result: dict[str, Any]) -> str:
    """
    Infer the unit from result dict keys using naming conventions.

    Returns the inferred unit string or empty string if unknown.
    """
    if not isinstance(result, dict):
        return ""

    unit_map = {
        "_ohm": "ohm",
        "_a": "A",
        "_ka": "kA",
        "_mva": "MVA",
        "_mw": "MW",
        "_mvar": "Mvar",
        "_pu": "pu",
        "_kv": "kV",
        "_v": "V",
        "_s": "s",
        "_deg": "deg",
        "_percent": "%",
    }

    for key in result:
        key_lower = key.lower()
        for suffix, unit in unit_map.items():
            if key_lower.endswith(suffix):
                return unit

    return ""
