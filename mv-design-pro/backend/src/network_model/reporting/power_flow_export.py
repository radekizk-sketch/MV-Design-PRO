"""
P20d: Reporting/export layer - JSON export for PowerFlowResult.

This module provides functions to export Power Flow calculation results
to JSON and JSON Lines formats. It uses the stable Result API contract
(PowerFlowResultV1.to_dict() + PowerFlowTrace.to_dict()) without modifying
any solver logic.

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: No physics calculations, only formatting
- Deterministic: Same input → identical JSON output (sort_keys=True)
- UTF-8 mandatory
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from network_model.solvers.power_flow_result import PowerFlowResultV1
    from network_model.solvers.power_flow_trace import PowerFlowTrace


def export_power_flow_result_to_json(
    result: PowerFlowResultV1,
    path: str | Path,
    *,
    trace: PowerFlowTrace | None = None,
    metadata: dict[str, Any] | None = None,
    indent: int = 2,
    ensure_ascii: bool = False,
) -> Path:
    """
    Export a single PowerFlowResultV1 to a JSON file.

    Args:
        result: The PowerFlowResultV1 instance to export.
        path: Target file path (str or Path). Parent directories are created
              if they do not exist.
        trace: Optional PowerFlowTrace to include as white_box_trace.
        metadata: Optional metadata dict (project, case, run info).
        indent: JSON indentation level (default: 2).
        ensure_ascii: If True, escape non-ASCII characters (default: False,
                      allowing UTF-8 output).

    Returns:
        Path to the written JSON file.

    Raises:
        ValueError: If result.to_dict() does not return a dict, or if the
                    result cannot be serialized to JSON.

    Example:
        >>> from network_model.solvers.power_flow_result import PowerFlowResultV1
        >>> path = export_power_flow_result_to_json(result, "output/pf_result.json")
    """
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Validate that to_dict() returns a dict
    data = result.to_dict()
    if not isinstance(data, dict):
        raise ValueError(f"result.to_dict() must return a dict, got {type(data).__name__}")

    # Build export payload
    export_payload: dict[str, Any] = {
        "report_type": "power_flow_result",
        "report_version": "1.0.0",
    }

    # Add metadata if provided
    if metadata:
        export_payload["metadata"] = metadata

    # Add result data
    export_payload["result"] = data

    # Add trace if provided
    if trace is not None:
        trace_data = trace.to_dict()
        if not isinstance(trace_data, dict):
            raise ValueError(f"trace.to_dict() must return a dict, got {type(trace_data).__name__}")
        # Include summary only (without full Jacobian matrices)
        export_payload["trace_summary"] = {
            "solver_version": trace_data.get("solver_version"),
            "input_hash": trace_data.get("input_hash"),
            "init_method": trace_data.get("init_method"),
            "tolerance": trace_data.get("tolerance"),
            "max_iterations": trace_data.get("max_iterations"),
            "converged": trace_data.get("converged"),
            "final_iterations_count": trace_data.get("final_iterations_count"),
            "iterations_summary": [
                {
                    "k": it.get("k"),
                    "norm_mismatch": it.get("norm_mismatch"),
                    "max_mismatch_pu": it.get("max_mismatch_pu"),
                }
                for it in trace_data.get("iterations", [])
            ],
        }
        export_payload["trace_full_available"] = True

    # Attempt JSON serialization with validation
    try:
        json_content = json.dumps(
            export_payload,
            indent=indent,
            ensure_ascii=ensure_ascii,
            sort_keys=True,
        )
    except (TypeError, ValueError) as e:
        raise ValueError(f"Serializacja wyniku rozpływu do JSON nie powiodła się: {e}") from e

    # Write to file with UTF-8 encoding
    output_path.write_text(json_content, encoding="utf-8")

    return output_path


def export_power_flow_results_to_jsonl(
    results: list[PowerFlowResultV1],
    path: str | Path,
    *,
    traces: list[PowerFlowTrace] | None = None,
) -> Path:
    """
    Export multiple PowerFlowResultV1 instances to a JSON Lines file.

    Each result is written as a single JSON object on its own line.
    This format is suitable for streaming large datasets or log-style output.

    Args:
        results: List of PowerFlowResultV1 instances to export.
        path: Target file path (str or Path). Parent directories are created
              if they do not exist.
        traces: Optional list of PowerFlowTrace instances (same length as results).

    Returns:
        Path to the written JSONL file.

    Raises:
        ValueError: If any result.to_dict() does not return a dict, or if
                    any result cannot be serialized to JSON. The error message
                    includes the zero-based index of the problematic record.

    Example:
        >>> results = [result_1, result_2]
        >>> path = export_power_flow_results_to_jsonl(results, "output/results.jsonl")
    """
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    lines: list[str] = []

    for idx, result in enumerate(results):
        # Validate that to_dict() returns a dict
        data = result.to_dict()
        if not isinstance(data, dict):
            raise ValueError(
                f"Record {idx}: result.to_dict() must return a dict, " f"got {type(data).__name__}"
            )

        # Build line payload
        line_payload: dict[str, Any] = {
            "report_type": "power_flow_result",
            "index": idx,
            "result": data,
        }

        # Add trace summary if available
        if traces and idx < len(traces):
            trace = traces[idx]
            trace_data = trace.to_dict()
            line_payload["trace_summary"] = {
                "converged": trace_data.get("converged"),
                "iterations": trace_data.get("final_iterations_count"),
            }

        # Attempt JSON serialization with validation
        try:
            json_line = json.dumps(line_payload, ensure_ascii=False, sort_keys=True)
        except (TypeError, ValueError) as e:
            raise ValueError(
                f"Rekord {idx}: serializacja wyniku rozpływu do JSON nie powiodła się: {e}"
            ) from e

        lines.append(json_line)

    # Write all lines to file with UTF-8 encoding
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    return output_path


def export_power_flow_comparison_to_json(
    comparison: dict[str, Any],
    path: str | Path,
    *,
    indent: int = 2,
    ensure_ascii: bool = False,
) -> Path:
    """
    Export a PowerFlowComparisonResult to a JSON file.

    Args:
        comparison: The comparison result dict (from PowerFlowComparisonResult.to_dict()).
        path: Target file path (str or Path). Parent directories are created
              if they do not exist.
        indent: JSON indentation level (default: 2).
        ensure_ascii: If True, escape non-ASCII characters (default: False).

    Returns:
        Path to the written JSON file.

    Raises:
        ValueError: If comparison is not a dict or cannot be serialized.
    """
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if not isinstance(comparison, dict):
        raise ValueError(f"comparison must be a dict, got {type(comparison).__name__}")

    # Build export payload
    export_payload: dict[str, Any] = {
        "report_type": "power_flow_comparison",
        "report_version": "1.0.0",
        "comparison": comparison,
    }

    # Attempt JSON serialization with validation
    try:
        json_content = json.dumps(
            export_payload,
            indent=indent,
            ensure_ascii=ensure_ascii,
            sort_keys=True,
        )
    except (TypeError, ValueError) as e:
        raise ValueError(f"Failed to serialize PowerFlowComparison to JSON: {e}") from e

    # Write to file with UTF-8 encoding
    output_path.write_text(json_content, encoding="utf-8")

    return output_path
