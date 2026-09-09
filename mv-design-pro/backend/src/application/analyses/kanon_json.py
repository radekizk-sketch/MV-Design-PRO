"""Kanoniczna postać JSON i odcisk SHA-256 ładunku — wspólne narzędzie warstwy analiz.

W1: dawne `application/analyses/design_synth/{canonical,fingerprint}.py` — jedyne żywe
moduły skasowanego pakietu `design_synth` (atrapa syntezy projektowej bez toru pracy).
Konsumenci: koperty biegów (`run_envelope`), potoki zabezpieczeń, zgodność źródła,
dowód doboru aparatury — determinizm odcisków zależy od tej jednej funkcji.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


def canonicalize_json(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: canonicalize_json(value[key]) for key in sorted(value.keys())}
    if isinstance(value, list):
        return [canonicalize_json(item) for item in value]
    if isinstance(value, tuple):
        return [canonicalize_json(item) for item in value]
    if isinstance(value, set):
        return sorted((canonicalize_json(item) for item in value), key=_stable_sort_key)
    return value


def _stable_sort_key(value: Any) -> str:
    if isinstance(value, dict):
        for key in ("id", "snapshot_id", "node_id", "branch_id", "name"):
            if key in value and value[key] is not None:
                return str(value[key])
    return str(value)


def fingerprint_json(payload: dict[str, Any]) -> str:
    canonical_payload = canonicalize_json(payload)
    encoded = json.dumps(canonical_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
