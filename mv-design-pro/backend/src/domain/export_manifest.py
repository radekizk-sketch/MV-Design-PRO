"""
ExportManifestV1 — deterministic export identity contract.

Captures the full identity chain for any export operation:
  Snapshot → Layout → Results → SLD → Export

Determinism: same input → identical content_hash (SHA-256).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime


@dataclass(frozen=True)
class ExportManifestV1:
    """Manifest identifying an export artifact and its full provenance chain."""

    snapshot_hash: str
    """Snapshot fingerprint (hash_sha256 from ENM header)."""

    layout_hash: str
    """LayoutResult deterministic hash from SLD pipeline."""

    run_hash: str | None = None
    """ResultSet deterministic_signature (null if no analysis run)."""

    element_ids: tuple[str, ...] = field(default_factory=tuple)
    """All ElementRefV1.elementId used (sorted, deduplicated)."""

    analysis_types: tuple[str, ...] = field(default_factory=tuple)
    """Analysis types included (SC_3F, LOAD_FLOW, etc.; sorted)."""

    readiness_status: str = "UNKNOWN"
    """Readiness status at export time: READY | PARTIAL | BLOCKED | UNKNOWN."""

    spec_version: str = "1.1"
    """ExportManifest spec version."""

    created_at: str = ""
    """ISO-8601 timestamp of export creation."""

    content_hash: str = ""
    """SHA-256 of the canonical JSON representation (determinism seal)."""

    overrides_hash: str | None = None
    """Geometry overrides hash (null if no overrides). RUN #3H."""

    overrides_version: str | None = None
    """Geometry overrides version (null if no overrides). RUN #3H."""


def build_export_manifest(
    *,
    snapshot_hash: str,
    layout_hash: str,
    run_hash: str | None = None,
    element_ids: list[str] | tuple[str, ...],
    analysis_types: list[str] | tuple[str, ...],
    readiness_status: str = "UNKNOWN",
    overrides_hash: str | None = None,
    overrides_version: str | None = None,
) -> ExportManifestV1:
    """Build an ExportManifestV1 with computed content_hash.

    Args:
        snapshot_hash: Snapshot fingerprint.
        layout_hash: LayoutResult hash from SLD pipeline.
        run_hash: Optional ResultSet deterministic_signature.
        element_ids: Element IDs used (will be sorted + deduplicated).
        analysis_types: Analysis types (will be sorted).

    Returns:
        Frozen ExportManifestV1 with computed content_hash.
    """
    sorted_ids = tuple(sorted(set(element_ids)))
    sorted_types = tuple(sorted(set(analysis_types)))
    created_at = datetime.now(UTC).isoformat()

    # Canonical JSON for hashing (deterministic key order)
    canonical = json.dumps(
        {
            "analysis_types": list(sorted_types),
            "element_ids": list(sorted_ids),
            "layout_hash": layout_hash,
            "overrides_hash": overrides_hash,
            "readiness_status": readiness_status,
            "run_hash": run_hash,
            "snapshot_hash": snapshot_hash,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    content_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    return ExportManifestV1(
        snapshot_hash=snapshot_hash,
        layout_hash=layout_hash,
        run_hash=run_hash,
        element_ids=sorted_ids,
        analysis_types=sorted_types,
        readiness_status=readiness_status,
        spec_version="1.2",
        created_at=created_at,
        content_hash=content_hash,
        overrides_hash=overrides_hash,
        overrides_version=overrides_version,
    )
