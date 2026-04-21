from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from application.analyses.design_synth.canonical import canonicalize_json


@dataclass(frozen=True)
class ArtifactRef:
    type: str
    id: str
    label: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "id": self.id,
            "label": self.label,
        }


@dataclass(frozen=True)
class TraceRef:
    type: str
    id: str | None
    inline: dict[str, Any] | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "id": self.id,
            "inline": self.inline,
        }


@dataclass(frozen=True)
class InputsRef:
    base_snapshot_id: str | None
    spec_ref: ArtifactRef | None
    inline: dict[str, Any] | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "base_snapshot_id": self.base_snapshot_id,
            "spec_ref": self.spec_ref.to_dict() if self.spec_ref else None,
            "inline": self.inline,
        }


@dataclass(frozen=True)
class AnalysisRunEnvelope:
    run_id: str
    analysis_type: str
    case_id: str | None
    inputs: InputsRef
    artifacts: tuple[ArtifactRef, ...]
    trace: TraceRef | None
    created_at_utc: str
    fingerprint: str
    schema_version: str = "v0"

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "run_id": self.run_id,
            "analysis_type": self.analysis_type,
            "case_id": self.case_id,
            "inputs": self.inputs.to_dict(),
            "artifacts": [artifact.to_dict() for artifact in self.artifacts],
            "trace": self.trace.to_dict() if self.trace else None,
            "created_at_utc": self.created_at_utc,
            "fingerprint": self.fingerprint,
        }


def fingerprint_envelope(envelope_dict: dict[str, Any]) -> str:
    """
    Compute the deterministic fingerprint from a stable view of the envelope.

    The stable view excludes created_at_utc and fingerprint fields because those
    are time-variant or derived. This allows deterministic hashing across runs.
    """
    stable_view = {
        key: value
        for key, value in envelope_dict.items()
        if key not in {"created_at_utc", "fingerprint"}
    }
    canonical_payload = canonicalize_json(stable_view)
    encoded = json.dumps(canonical_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()
