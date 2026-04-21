"""
Reporting/export layer - Export manifest for tracking exported file bundles.

This module provides the ExportManifest frozen dataclass and build_export_manifest
builder function. The manifest provides a deterministic, hashable record of all
files produced in a single export operation.

CANONICAL ALIGNMENT:
- Deterministic: Same input -> identical manifest (same SHA256)
- Immutable: Frozen dataclass, no mutation after creation
- Auditable: Every file tracked with hash and format
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ExportFile:
    """
    Record of a single exported file.

    Attributes:
        path: Relative or absolute file path.
        format: File format identifier (e.g. "docx", "pdf", "jsonl", "json").
        hash: SHA-256 hash of the file contents.
    """

    path: str
    format: str
    hash: str

    def to_dict(self) -> dict[str, str]:
        """Serialize to JSON-compatible dict."""
        return {
            "format": self.format,
            "hash": self.hash,
            "path": self.path,
        }


@dataclass(frozen=True)
class ExportManifest:
    """
    Frozen manifest of an export operation.

    Tracks all files produced during a single export with deterministic hashing.

    Attributes:
        export_id: SHA-256 hash derived from the manifest content itself.
        created_at: Timestamp of manifest creation (UTC).
        snapshot_hash: SHA-256 hash of the input snapshot (for provenance).
        run_id: Identifier of the solver run that produced the results.
        files: Tuple of ExportFile records (immutable, ordered).
    """

    export_id: str
    created_at: datetime
    snapshot_hash: str
    run_id: str
    files: tuple[ExportFile, ...]

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict (deterministic)."""
        return {
            "created_at": self.created_at.isoformat(),
            "export_id": self.export_id,
            "files": [f.to_dict() for f in self.files],
            "run_id": self.run_id,
            "snapshot_hash": self.snapshot_hash,
        }

    def to_json(self, indent: int = 2) -> str:
        """Serialize to deterministic JSON string."""
        return json.dumps(
            self.to_dict(),
            indent=indent,
            ensure_ascii=False,
            sort_keys=True,
        )


def _compute_file_hash(path: Path) -> str:
    """Compute SHA-256 hash of a file."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _compute_export_id(
    snapshot_hash: str,
    run_id: str,
    file_hashes: list[str],
) -> str:
    """
    Compute deterministic export_id from inputs.

    The export_id is a SHA-256 hash of the concatenation of:
    - snapshot_hash
    - run_id
    - sorted file hashes (for order-independence)
    """
    h = hashlib.sha256()
    h.update(snapshot_hash.encode("utf-8"))
    h.update(run_id.encode("utf-8"))
    for file_hash in sorted(file_hashes):
        h.update(file_hash.encode("utf-8"))
    return h.hexdigest()


def _infer_format(path: Path) -> str:
    """Infer file format from extension."""
    suffix = path.suffix.lower().lstrip(".")
    format_map = {
        "docx": "docx",
        "pdf": "pdf",
        "jsonl": "jsonl",
        "json": "json",
        "csv": "csv",
        "xlsx": "xlsx",
        "tex": "tex",
    }
    return format_map.get(suffix, suffix or "unknown")


def build_export_manifest(
    files: list[Path | str],
    *,
    snapshot_hash: str = "",
    run_id: str = "",
    created_at: datetime | None = None,
) -> ExportManifest:
    """
    Build an ExportManifest from a list of exported file paths.

    Computes SHA-256 hashes for each file and derives a deterministic
    export_id from all hashes combined.

    Args:
        files: List of file paths (Path or str) to include in the manifest.
        snapshot_hash: SHA-256 hash of the input snapshot (default: empty).
        run_id: Identifier of the solver run (default: empty).
        created_at: Optional fixed timestamp (default: utcnow).

    Returns:
        ExportManifest frozen dataclass with all files tracked.

    Raises:
        FileNotFoundError: If any file does not exist.
    """
    timestamp = created_at if created_at else datetime.now(UTC)

    export_files: list[ExportFile] = []
    file_hashes: list[str] = []

    for file_path in files:
        p = Path(file_path)
        if not p.exists():
            raise FileNotFoundError(f"Export file not found: {p}")

        file_hash = _compute_file_hash(p)
        file_hashes.append(file_hash)

        export_files.append(
            ExportFile(
                path=str(p),
                format=_infer_format(p),
                hash=file_hash,
            )
        )

    # Sort files by path for deterministic ordering
    export_files.sort(key=lambda f: f.path)

    export_id = _compute_export_id(snapshot_hash, run_id, file_hashes)

    return ExportManifest(
        export_id=export_id,
        created_at=timestamp,
        snapshot_hash=snapshot_hash,
        run_id=run_id,
        files=tuple(export_files),
    )
