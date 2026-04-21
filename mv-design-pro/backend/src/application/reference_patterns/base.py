"""
Reference Patterns Base Module — Wzorce odniesienia

Base contracts and utilities for reference pattern validation.

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: Reference patterns are INTERPRETATION layer components.
  They consume analysis results, they do NOT compute physics.
- WHITE BOX: Full trace of validation steps is recorded.
- DETERMINISM: Same inputs → identical outputs.

PURPOSE:
Reference patterns provide benchmark engineering cases that validate
the coherence of protection methodology (e.g., I>> selectivity, sensitivity,
thermal criteria, SPZ blocking). They act as "golden tests" for the
analysis layer, ensuring consistent and auditable outputs.

NO CODENAMES IN UI/PROOF - enforced.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Literal

# =============================================================================
# VERDICT TYPES
# =============================================================================

ReferenceVerdict = Literal["ZGODNE", "GRANICZNE", "NIEZGODNE"]

VERDICT_DESCRIPTIONS_PL: dict[ReferenceVerdict, str] = {
    "ZGODNE": "Wszystkie kryteria spełnione, okno nastaw prawidłowe",
    "GRANICZNE": "Warunki spełnione z ograniczeniami (wąskie okno lub ostrzeżenia SPZ)",
    "NIEZGODNE": "Kryteria niespełnione, brak prawidłowego okna nastaw",
}


# =============================================================================
# CHECK STATUS TYPES
# =============================================================================

CheckStatus = Literal["PASS", "FAIL", "WARN", "INFO"]

CHECK_STATUS_PL: dict[CheckStatus, str] = {
    "PASS": "Spełnione",
    "FAIL": "Niespełnione",
    "WARN": "Ostrzeżenie",
    "INFO": "Informacja",
}


# =============================================================================
# REFERENCE PATTERN RESULT
# =============================================================================


@dataclass(frozen=True)
class ReferencePatternResult:
    """
    Immutable result of a reference pattern validation.

    Attributes:
        pattern_id: Internal pattern identifier (e.g., "RP-LINE-I2-THERMAL-SPZ")
        name_pl: Human-readable Polish name of the pattern
        verdict: Overall verdict (ZGODNE/GRANICZNE/NIEZGODNE)
        summary_pl: Summary of the validation result in Polish
        checks: List of individual checks (deterministically sorted)
        trace: WHITE-BOX trace of validation steps (deterministic, JSON-serializable)
        artifacts: Additional artifacts (e.g., setting window bounds, tk, Ithdop)

    DETERMINISM:
        - checks and trace are deterministically sorted
        - All values are JSON-serializable
        - No system timestamps in computational trace
    """

    pattern_id: str
    name_pl: str
    verdict: ReferenceVerdict
    summary_pl: str
    checks: tuple[dict[str, Any], ...]  # Immutable, deterministically sorted
    trace: tuple[dict[str, Any], ...]  # Immutable, deterministic WHITE-BOX trace
    artifacts: dict[str, Any] = field(default_factory=dict)  # Window, tk, Ithdop, etc.

    def to_dict(self) -> dict[str, Any]:
        """
        Serialize to dictionary (deterministic).

        Returns:
            Dictionary representation suitable for JSON serialization.
        """
        return {
            "pattern_id": self.pattern_id,
            "name_pl": self.name_pl,
            "verdict": self.verdict,
            "verdict_description_pl": VERDICT_DESCRIPTIONS_PL.get(self.verdict, self.verdict),
            "summary_pl": self.summary_pl,
            "checks": list(self.checks),
            "trace": list(self.trace),
            "artifacts": self.artifacts,
        }


# =============================================================================
# DETERMINISM HELPERS
# =============================================================================


def stable_sort_dict(obj: Any) -> Any:
    """
    Recursively sort dictionaries by key for deterministic ordering.

    Args:
        obj: Any object (dict, list, or scalar)

    Returns:
        Object with all nested dicts sorted by key.

    Example:
        >>> stable_sort_dict({"b": 2, "a": 1})
        {'a': 1, 'b': 2}
    """
    if isinstance(obj, dict):
        return {k: stable_sort_dict(v) for k, v in sorted(obj.items())}
    if isinstance(obj, list | tuple):
        return [stable_sort_dict(item) for item in obj]
    return obj


def stable_json(obj: Any, indent: int | None = None) -> str:
    """
    Serialize object to JSON with deterministic key ordering.

    Args:
        obj: Object to serialize
        indent: Optional indentation (None for compact)

    Returns:
        JSON string with sorted keys.

    Example:
        >>> stable_json({"b": 2, "a": 1})
        '{"a": 1, "b": 2}'
    """
    sorted_obj = stable_sort_dict(obj)
    return json.dumps(sorted_obj, ensure_ascii=False, sort_keys=True, indent=indent)


def compare_results_deterministic(
    result1: ReferencePatternResult,
    result2: ReferencePatternResult,
) -> bool:
    """
    Compare two ReferencePatternResult instances for deterministic equality.

    Compares all fields using stable JSON serialization.

    Args:
        result1: First result
        result2: Second result

    Returns:
        True if results are identical (deterministic comparison).
    """
    json1 = stable_json(result1.to_dict())
    json2 = stable_json(result2.to_dict())
    return json1 == json2


# =============================================================================
# CHECK BUILDER HELPERS
# =============================================================================


def build_check(
    name_pl: str,
    status: CheckStatus,
    description_pl: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Build a check dictionary with consistent structure.

    Args:
        name_pl: Polish name of the check
        status: Check status (PASS/FAIL/WARN/INFO)
        description_pl: Description of check result in Polish
        details: Optional details dictionary

    Returns:
        Deterministically structured check dictionary.
    """
    check: dict[str, Any] = {
        "name_pl": name_pl,
        "status": status,
        "status_pl": CHECK_STATUS_PL.get(status, status),
        "description_pl": description_pl,
    }
    if details:
        check["details"] = stable_sort_dict(details)
    return check


def build_trace_step(
    step: str,
    description_pl: str,
    inputs: dict[str, Any],
    calculation: dict[str, Any] | None = None,
    outputs: dict[str, Any] | None = None,
    formula: str | None = None,
) -> dict[str, Any]:
    """
    Build a WHITE-BOX trace step with consistent structure.

    Args:
        step: Step identifier (e.g., "selectivity_criterion")
        description_pl: Polish description of the step
        inputs: Input values for this step
        calculation: Intermediate calculation values
        outputs: Output values from this step
        formula: Optional formula (LaTeX or text)

    Returns:
        Deterministically structured trace step dictionary.
    """
    trace_step: dict[str, Any] = {
        "step": step,
        "description_pl": description_pl,
        "inputs": stable_sort_dict(inputs),
    }
    if formula:
        trace_step["formula"] = formula
    if calculation:
        trace_step["calculation"] = stable_sort_dict(calculation)
    if outputs:
        trace_step["outputs"] = stable_sort_dict(outputs)
    return trace_step
