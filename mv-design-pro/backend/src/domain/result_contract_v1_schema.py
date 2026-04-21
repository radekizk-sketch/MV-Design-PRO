"""
ResultSetV1 JSON Schema Lock — PR-15

Generates and verifies the canonical JSON schema for ResultSetV1.
Schema changes require explicit decision (test will fail).

Usage:
    from domain.result_contract_v1_schema import (
        generate_schema,
        get_locked_schema_path,
    )

    schema = generate_schema()
"""

from __future__ import annotations

import json
from pathlib import Path

from domain.result_contract_v1 import ResultSetV1

# Schema lock file location (relative to backend/src/)
_SCHEMA_DIR = Path(__file__).parent.parent.parent / "schemas"
_SCHEMA_FILENAME = "resultset_v1_schema.json"


def generate_schema() -> dict:
    """
    Generate deterministic JSON schema from ResultSetV1 Pydantic model.

    Returns:
        JSON schema dict (sort_keys for determinism).
    """
    schema = ResultSetV1.model_json_schema()
    # Re-serialize with sorted keys for deterministic output
    canonical = json.loads(json.dumps(schema, sort_keys=True, default=str))
    return canonical


def get_locked_schema_path() -> Path:
    """Return the path to the locked schema file."""
    return _SCHEMA_DIR / _SCHEMA_FILENAME


def write_locked_schema() -> Path:
    """
    Write the current schema to the lock file.

    Returns the path to the written file.
    """
    schema = generate_schema()
    path = get_locked_schema_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(schema, indent=2, sort_keys=True, default=str) + "\n",
        encoding="utf-8",
    )
    return path


def verify_schema_lock() -> bool:
    """
    Verify that the current schema matches the lock file.

    Returns True if schemas match, False otherwise.
    Raises FileNotFoundError if lock file doesn't exist.
    """
    path = get_locked_schema_path()
    if not path.exists():
        raise FileNotFoundError(
            f"Schema lock file not found: {path}. " "Run write_locked_schema() to create it."
        )
    locked = json.loads(path.read_text(encoding="utf-8"))
    current = generate_schema()
    return json.dumps(locked, sort_keys=True) == json.dumps(current, sort_keys=True)
