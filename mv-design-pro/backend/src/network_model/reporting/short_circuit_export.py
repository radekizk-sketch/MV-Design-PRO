"""
Reporting/export layer - JSON export for ShortCircuitResult.

This module provides functions to export IEC 60909 short-circuit calculation
results to JSON and JSON Lines formats. It uses the stable Result API contract
(ShortCircuitResult.to_dict()) without modifying any solver logic.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from network_model.solvers.short_circuit_iec60909 import ShortCircuitResult


def export_short_circuit_result_to_json(
    result: ShortCircuitResult,
    path: str | Path,
    *,
    indent: int = 2,
    ensure_ascii: bool = False,
) -> Path:
    """
    Export a single ShortCircuitResult to a JSON file.

    Args:
        result: The ShortCircuitResult instance to export.
        path: Target file path (str or Path). Parent directories are created
              if they do not exist.
        indent: JSON indentation level (default: 2).
        ensure_ascii: If True, escape non-ASCII characters (default: False,
                      allowing UTF-8 output).

    Returns:
        Path to the written JSON file.

    Raises:
        ValueError: If result.to_dict() does not return a dict, or if the
                    result cannot be serialized to JSON.

    Example:
        >>> from network_model.solvers.short_circuit_iec60909 import (
        ...     ShortCircuitIEC60909Solver
        ... )
        >>> result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        ...     graph=graph, fault_node_id="B", c_factor=1.0, tk_s=1.0
        ... )
        >>> path = export_short_circuit_result_to_json(result, "output/result.json")
    """
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Validate that to_dict() returns a dict
    data = result.to_dict()
    if not isinstance(data, dict):
        raise ValueError(f"result.to_dict() must return a dict, got {type(data).__name__}")

    # Attempt JSON serialization with validation
    try:
        json_content = json.dumps(
            data,
            indent=indent,
            ensure_ascii=ensure_ascii,
            sort_keys=True,
        )
    except (TypeError, ValueError) as e:
        raise ValueError(f"Failed to serialize ShortCircuitResult to JSON: {e}") from e

    # Write to file with UTF-8 encoding
    output_path.write_text(json_content, encoding="utf-8")

    return output_path


def export_short_circuit_results_to_jsonl(
    results: list[ShortCircuitResult],
    path: str | Path,
) -> Path:
    """
    Export multiple ShortCircuitResult instances to a JSON Lines file.

    Each result is written as a single JSON object on its own line.
    This format is suitable for streaming large datasets or log-style output.

    Args:
        results: List of ShortCircuitResult instances to export.
        path: Target file path (str or Path). Parent directories are created
              if they do not exist.

    Returns:
        Path to the written JSONL file.

    Raises:
        ValueError: If any result.to_dict() does not return a dict, or if
                    any result cannot be serialized to JSON. The error message
                    includes the zero-based index of the problematic record.

    Example:
        >>> results = [result_3f, result_2f]
        >>> path = export_short_circuit_results_to_jsonl(results, "output/results.jsonl")
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

        # Attempt JSON serialization with validation
        try:
            json_line = json.dumps(data, ensure_ascii=False, sort_keys=True)
        except (TypeError, ValueError) as e:
            raise ValueError(
                f"Record {idx}: Failed to serialize ShortCircuitResult to JSON: {e}"
            ) from e

        lines.append(json_line)

    # Write all lines to file with UTF-8 encoding
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    return output_path
