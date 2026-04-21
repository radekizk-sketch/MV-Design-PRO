from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from typing import Any
from uuid import UUID


def canonicalize(obj: dict) -> dict:
    return _canonicalize_value(obj)


def fingerprint(obj: dict) -> str:
    canonical_payload = canonicalize(obj)
    encoded = json.dumps(canonical_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def scrub_dynamic(
    obj: dict,
    *,
    keys: tuple[str, ...] = (
        "created_at",
        "created_at_utc",
        "timestamp",
        "id",
        "run_id",
    ),
    paths: tuple[str, ...] = (),
) -> dict:
    scrubbed = _scrub_keys(obj, keys)
    for path in paths:
        scrubbed = _scrub_path(scrubbed, path.split("."))
    return scrubbed


def assert_deterministic(
    a: dict,
    b: dict,
    *,
    scrub_keys: tuple[str, ...] = (
        "created_at",
        "created_at_utc",
        "timestamp",
        "id",
        "run_id",
    ),
    scrub_paths: tuple[str, ...] = (),
) -> None:
    scrubbed_a = canonicalize(scrub_dynamic(a, keys=scrub_keys, paths=scrub_paths))
    scrubbed_b = canonicalize(scrub_dynamic(b, keys=scrub_keys, paths=scrub_paths))
    if scrubbed_a == scrubbed_b:
        return
    diff_keys = _diff_keys(scrubbed_a, scrubbed_b)
    diff_preview = ", ".join(diff_keys[:10])
    raise AssertionError(
        "Determinism check failed. Differing paths: " f"{diff_preview or 'unknown'}"
    )


def _canonicalize_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _canonicalize_value(value[key]) for key in sorted(value.keys())}
    if isinstance(value, list):
        return [_canonicalize_value(item) for item in value]
    if isinstance(value, tuple):
        return [_canonicalize_value(item) for item in value]
    if isinstance(value, set):
        return sorted((_canonicalize_value(item) for item in value), key=_stable_sort_key)
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, UUID):
        return str(value)
    return value


def _stable_sort_key(value: Any) -> str:
    if isinstance(value, dict):
        for key in ("id", "snapshot_id", "node_id", "branch_id", "name"):
            if key in value and value[key] is not None:
                return str(value[key])
    return str(value)


def _scrub_keys(value: Any, keys: tuple[str, ...]) -> Any:
    if isinstance(value, dict):
        return {key: _scrub_keys(child, keys) for key, child in value.items() if key not in keys}
    if isinstance(value, list):
        return [_scrub_keys(item, keys) for item in value]
    return value


def _scrub_path(value: Any, path: list[str]) -> Any:
    if not path:
        return value
    if isinstance(value, list) and path[0] == "*":
        return [_scrub_path(item, path[1:]) for item in value]
    if isinstance(value, list) and path[0].isdigit():
        index = int(path[0])
        if 0 <= index < len(value):
            value = list(value)
            value[index] = _scrub_path(value[index], path[1:])
        return value
    if not isinstance(value, dict):
        return value
    key = path[0]
    if key not in value:
        return value
    if len(path) == 1:
        return {k: v for k, v in value.items() if k != key}
    updated = dict(value)
    updated[key] = _scrub_path(updated[key], path[1:])
    return updated


def _diff_keys(a: Any, b: Any, prefix: str = "") -> list[str]:
    if isinstance(a, dict) and isinstance(b, dict):
        diffs = []
        for key in sorted(set(a.keys()) | set(b.keys())):
            next_prefix = f"{prefix}.{key}" if prefix else key
            if key not in a or key not in b:
                diffs.append(next_prefix)
                continue
            diffs.extend(_diff_keys(a[key], b[key], next_prefix))
        return diffs
    if isinstance(a, list) and isinstance(b, list):
        diffs = []
        if len(a) != len(b):
            return [prefix or "list_length"]
        for index, (left, right) in enumerate(zip(a, b, strict=False)):
            next_prefix = f"{prefix}[{index}]"
            diffs.extend(_diff_keys(left, right, next_prefix))
        return diffs
    if a != b:
        return [prefix or "value"]
    return []
