"""
Deterministic snapshot hashing and canonical JSON serialization.

Provides canonical JSON serialization that guarantees:
- Deterministic output: same data always produces same JSON string
- Stability: permutation of elements in lists does not change output
- Verifiability: SHA-256 hash can be stored and verified later

Rules:
- All dict keys sorted alphabetically
- All lists sorted by element 'id' field (if elements have 'id')
- Consistent float precision (6 decimal places)
- No whitespace, no trailing commas
- Complex numbers serialized as {"im": float, "re": float}
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .snapshot import NetworkSnapshot


def _normalize_float(value: float) -> float | int:
    """
    Normalize a float to consistent precision.

    Integers are returned as int (e.g. 1.0 -> 1).
    Non-finite values (NaN, Inf) are preserved as-is (they will
    serialize to JSON-incompatible tokens, which is intentional
    to detect corrupt data).

    Returns:
        Normalized numeric value with 6 decimal places.
    """
    if not math.isfinite(value):
        return value
    rounded = round(value, 6)
    if rounded == int(rounded) and abs(rounded) < 2**53:
        return int(rounded)
    return rounded


def _canonicalize_value(value: Any) -> Any:
    """
    Recursively canonicalize a value for deterministic JSON serialization.

    Handles:
    - dict: sort keys alphabetically, recurse into values
    - list/tuple: sort by 'id' field if elements are dicts with 'id', recurse
    - set: sort by string representation, recurse
    - float: normalize to 6 decimal places
    - complex: convert to {"im": float, "re": float}
    - other: pass through unchanged
    """
    if isinstance(value, dict):
        return {key: _canonicalize_value(value[key]) for key in sorted(value.keys())}

    if isinstance(value, list | tuple):
        items = [_canonicalize_value(item) for item in value]
        # Sort by 'id' field if all elements are dicts with 'id'
        if items and all(isinstance(item, dict) and "id" in item for item in items):
            items = sorted(items, key=lambda item: str(item["id"]))
        return items

    if isinstance(value, set):
        return sorted((_canonicalize_value(item) for item in value), key=str)

    if isinstance(value, complex):
        return {
            "im": _normalize_float(value.imag),
            "re": _normalize_float(value.real),
        }

    if isinstance(value, float):
        return _normalize_float(value)

    if isinstance(value, bool):
        return value

    if isinstance(value, int):
        return value

    if value is None:
        return value

    # Enums, UUIDs, etc. — convert to string
    if hasattr(value, "value"):
        return _canonicalize_value(value.value)

    return str(value)


def canonical_json(snapshot: NetworkSnapshot) -> str:
    """
    Produce deterministic JSON string from a NetworkSnapshot.

    The output is guaranteed to be identical for identical network state,
    regardless of dict insertion order or list element ordering.

    Args:
        snapshot: NetworkSnapshot to serialize.

    Returns:
        Compact JSON string with sorted keys, sorted lists, and
        consistent float precision. No whitespace, no trailing commas.
    """
    data = snapshot.to_dict()
    canonical = _canonicalize_value(data)
    return json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def canonical_json_from_dict(data: dict[str, Any]) -> str:
    """
    Produce deterministic JSON string from a raw dictionary.

    Useful when a full NetworkSnapshot is not available.

    Args:
        data: Dictionary to serialize canonically.

    Returns:
        Compact canonical JSON string.
    """
    canonical = _canonicalize_value(data)
    return json.dumps(canonical, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def snapshot_hash(snapshot: NetworkSnapshot) -> str:
    """
    Compute SHA-256 hex digest of the canonical JSON of a snapshot.

    Deterministic: same network state always produces same hash.
    Stable: permutation of elements in lists does not change hash.

    Args:
        snapshot: NetworkSnapshot to hash.

    Returns:
        64-character lowercase hex string (SHA-256 digest).
    """
    json_str = canonical_json(snapshot)
    return hashlib.sha256(json_str.encode("utf-8")).hexdigest()


def verify_hash(snapshot: NetworkSnapshot, expected_hash: str) -> bool:
    """
    Verify that a snapshot matches an expected hash.

    Args:
        snapshot: NetworkSnapshot to verify.
        expected_hash: Expected SHA-256 hex digest.

    Returns:
        True if the computed hash matches expected_hash, False otherwise.
    """
    return snapshot_hash(snapshot) == expected_hash
