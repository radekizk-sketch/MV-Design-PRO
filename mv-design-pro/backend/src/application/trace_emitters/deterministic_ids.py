"""Deterministyczne ID artefaktów trace (white-box).

Zasada: identyczne wejście logiczne artefaktu -> identyczne trace_id.
Brak UUID losowych w ścieżce export/proof.
"""

from __future__ import annotations

import hashlib
import json
import math
from collections.abc import Sequence, Set
from typing import Any


def _to_primitive(value: Any) -> Any:
    """Konwersja dataclass/enum/obiektów do stabilnych typów JSON."""
    if hasattr(value, "to_dict"):
        return _to_primitive(value.to_dict())
    if hasattr(value, "value") and not isinstance(
        value, str | bytes | bytearray | dict | list | tuple
    ):
        try:
            return value.value
        except (AttributeError, TypeError):
            pass
    if isinstance(value, dict):
        return {
            str(k): _to_primitive(v) for k, v in sorted(value.items(), key=lambda kv: str(kv[0]))
        }
    if isinstance(value, list | tuple):
        return [_to_primitive(v) for v in value]
    if isinstance(value, complex):
        # Jawna, JSON-safe reprezentacja liczby zespolonej.
        return {
            "__complex__": [
                float(f"{value.real:.12g}"),
                float(f"{value.imag:.12g}"),
            ]
        }
    if isinstance(value, bytes | bytearray):
        # Deterministyczna reprezentacja bajtowa niezależna od locale/runtime.
        return {"__bytes_hex__": bytes(value).hex()}
    if isinstance(value, Set) and not isinstance(value, str | bytes | bytearray | dict):
        # Zbiór nie ma kolejności — sortujemy po kanonicznym JSON elementów.
        canon_items = [_to_primitive(v) for v in value]
        return sorted(
            canon_items,
            key=lambda item: json.dumps(
                item, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False
            ),
        )
    if isinstance(value, float):
        # Stabilizacja float + JSON-safe normalizacja wartości niefinitych.
        if math.isnan(value):
            return "NaN"
        if math.isinf(value):
            return "+Inf" if value > 0 else "-Inf"
        return float(f"{value:.12g}")
    return value


def _canonicalize_equation_steps(equation_steps: Sequence[Any]) -> list[Any]:
    """Canonical, permutation-invariant ordering for equation steps.

    Steps are sorted by `step_id` when available, with stable JSON fallback
    to preserve determinism even for malformed/untyped inputs.
    """

    primitive_steps = [_to_primitive(step) for step in equation_steps]

    def _sort_key(step: Any) -> tuple[str, str]:
        canonical = json.dumps(
            step, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False
        )
        if isinstance(step, dict):
            step_id = step.get("step_id")
            if isinstance(step_id, str):
                # Include canonical payload as tiebreaker for duplicate step_id values
                # to guarantee order invariance for permuted-but-equivalent traces.
                return (step_id, canonical)

        return ("", canonical)

    return sorted(primitive_steps, key=_sort_key)


def deterministic_trace_id(
    *,
    analysis_type: str,
    snapshot_hash: str,
    run_hash: str,
    inputs: dict[str, Any],
    equation_steps: Sequence[Any],
    outputs: dict[str, Any],
) -> str:
    payload = {
        "analysis_type": analysis_type,
        "snapshot_hash": snapshot_hash,
        "run_hash": run_hash,
        "inputs": _to_primitive(inputs),
        "equation_steps": _canonicalize_equation_steps(equation_steps),
        "outputs": _to_primitive(outputs),
    }
    canonical = json.dumps(
        payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"), allow_nan=False
    )
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"trace_{analysis_type.lower()}_{digest[:24]}"
