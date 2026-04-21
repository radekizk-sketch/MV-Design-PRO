from __future__ import annotations

import hashlib
import json
from typing import Any

from application.analyses.design_synth.canonical import canonicalize_json


def fingerprint_json(payload: dict[str, Any]) -> str:
    canonical_payload = canonicalize_json(payload)
    encoded = json.dumps(canonical_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
