"""
Type Library Governance (P13b)

Implements PowerFactory-grade type library management:
- Versioning and metadata (vendor/series/revision)
- Deterministic export (canonical JSON with fingerprint)
- Safe import with conflict detection (merge/replace modes)
- Hard compatibility rules for type_ref (no mass migrations)

Canonical reference: SYSTEM_SPEC.md § 4 (Catalog), CANONICAL_COMPLIANCE.md CT-*
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any
from uuid import uuid4


class ImportMode(Enum):
    """Import mode for type library."""

    MERGE = "merge"  # Add new types, skip existing (safe default)
    REPLACE = "replace"  # Replace library (blocked if types are in use)


@dataclass(frozen=True)
class TypeLibraryManifest:
    """
    Type library manifest for governance and versioning.

    PowerFactory-aligned metadata for type library management.
    Contains versioning info, vendor/series/revision, and deterministic fingerprint.

    Attributes:
        library_id: Stable library identifier (UUID).
        name_pl: Polish name of the library.
        vendor: Vendor/manufacturer name.
        series: Product series/line.
        revision: Revision string or int.
        schema_version: Schema version for future compatibility.
        created_at: ISO 8601 timestamp of creation.
        fingerprint: SHA-256 hash of canonical JSON export.
        description_pl: Optional Polish description.
    """

    library_id: str
    name_pl: str
    vendor: str
    series: str
    revision: str
    schema_version: str
    created_at: str
    fingerprint: str
    description_pl: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary (canonical order)."""
        return {
            "library_id": self.library_id,
            "name_pl": self.name_pl,
            "vendor": self.vendor,
            "series": self.series,
            "revision": self.revision,
            "schema_version": self.schema_version,
            "created_at": self.created_at,
            "fingerprint": self.fingerprint,
            "description_pl": self.description_pl,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TypeLibraryManifest:
        """Create from dictionary."""
        return cls(
            library_id=str(data.get("library_id", str(uuid4()))),
            name_pl=str(data.get("name_pl", "")),
            vendor=str(data.get("vendor", "")),
            series=str(data.get("series", "")),
            revision=str(data.get("revision", "")),
            schema_version=str(data.get("schema_version", "1.0")),
            created_at=str(data.get("created_at", datetime.utcnow().isoformat())),
            fingerprint=str(data.get("fingerprint", "")),
            description_pl=str(data.get("description_pl", "")),
        )


@dataclass(frozen=True)
class TypeLibraryExport:
    """
    Type library export structure.

    Contains manifest and all type records.
    Deterministically serialized (canonical JSON with sorted keys).

    Attributes:
        manifest: Library metadata.
        line_types: List of line types (deterministic order).
        cable_types: List of cable types (deterministic order).
        transformer_types: List of transformer types (deterministic order).
        switch_types: List of switch equipment types (deterministic order).
    """

    manifest: TypeLibraryManifest
    line_types: list[dict[str, Any]]
    cable_types: list[dict[str, Any]]
    transformer_types: list[dict[str, Any]]
    switch_types: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary (canonical order)."""
        return {
            "manifest": self.manifest.to_dict(),
            "line_types": self.line_types,
            "cable_types": self.cable_types,
            "transformer_types": self.transformer_types,
            "switch_types": self.switch_types,
        }

    def to_canonical_json(self) -> str:
        """
        Export to canonical JSON.

        Deterministic serialization:
        - Sorted keys at all levels
        - No whitespace
        - Stable ordering of lists (name → id)

        Returns:
            Canonical JSON string.
        """
        return json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":"))

    def to_fingerprint_payload_dict(self) -> dict[str, Any]:
        """
        Export to fingerprint payload (excludes runtime fields).

        Deterministic payload for fingerprint computation:
        - Excludes runtime fields: created_at, fingerprint, library_id
        - Includes stable metadata: vendor, series, revision, schema_version
        - Includes all type lists (already sorted deterministically)

        This ensures that two exports with the same catalog content
        produce identical fingerprints, regardless of export timestamp.

        Returns:
            Dictionary suitable for deterministic fingerprint computation.
        """
        return {
            "manifest": {
                "name_pl": self.manifest.name_pl,
                "vendor": self.manifest.vendor,
                "series": self.manifest.series,
                "revision": self.manifest.revision,
                "schema_version": self.manifest.schema_version,
                "description_pl": self.manifest.description_pl,
            },
            "line_types": self.line_types,
            "cable_types": self.cable_types,
            "transformer_types": self.transformer_types,
            "switch_types": self.switch_types,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TypeLibraryExport:
        """Create from dictionary."""
        return cls(
            manifest=TypeLibraryManifest.from_dict(data.get("manifest", {})),
            line_types=list(data.get("line_types", [])),
            cable_types=list(data.get("cable_types", [])),
            transformer_types=list(data.get("transformer_types", [])),
            switch_types=list(data.get("switch_types", [])),
        )


@dataclass
class ImportConflict:
    """
    Conflict detected during import.

    Attributes:
        type_id: Conflicting type ID.
        type_category: Type category (LINE/CABLE/TRANSFORMER/SWITCH).
        reason: Conflict reason (e.g., "already exists with different parameters").
    """

    type_id: str
    type_category: str
    reason: str


@dataclass
class ImportReport:
    """
    Report of import operation.

    Attributes:
        mode: Import mode used (MERGE or REPLACE).
        added: List of added type IDs (deterministic order).
        skipped: List of skipped type IDs (deterministic order).
        conflicts: List of conflicts encountered.
        success: True if import succeeded without conflicts.
    """

    mode: ImportMode
    added: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)
    conflicts: list[ImportConflict] = field(default_factory=list)
    success: bool = True

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "mode": self.mode.value,
            "added": sorted(self.added),
            "skipped": sorted(self.skipped),
            "conflicts": [
                {"type_id": c.type_id, "type_category": c.type_category, "reason": c.reason}
                for c in self.conflicts
            ],
            "success": self.success,
        }


def compute_fingerprint(export: TypeLibraryExport) -> str:
    """
    Compute SHA-256 fingerprint of deterministic export payload.

    Deterministic hash based on canonical JSON serialization of payload
    WITHOUT runtime fields (created_at, fingerprint, library_id).

    This ensures that two exports with identical catalog content
    produce the same fingerprint, regardless of export timestamp or library_id.

    Args:
        export: Type library export to fingerprint.

    Returns:
        SHA-256 hex digest (64 characters).
    """
    payload = export.to_fingerprint_payload_dict()
    canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


def sort_types_deterministically(types: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Sort type records deterministically (name → id).

    Args:
        types: List of type dictionaries.

    Returns:
        Sorted list.
    """
    return sorted(types, key=lambda t: (str(t.get("name", "")), str(t.get("id", ""))))


# ============================================================================
# Protection Library Governance (P14b)
# ============================================================================


@dataclass(frozen=True)
class ProtectionLibraryManifest:
    """
    Protection library manifest for governance and versioning.

    PowerFactory-aligned metadata for protection library management.
    Contains versioning info, vendor/series/revision, and deterministic fingerprint.

    Attributes:
        library_id: Stable library identifier (UUID).
        name_pl: Polish name of the library.
        vendor: Vendor/manufacturer name.
        series: Product series/line.
        revision: Revision string or int.
        schema_version: Schema version for future compatibility.
        created_at: ISO 8601 timestamp of creation.
        fingerprint: SHA-256 hash of canonical JSON export.
        description_pl: Optional Polish description.
    """

    library_id: str
    name_pl: str
    vendor: str
    series: str
    revision: str
    schema_version: str
    created_at: str
    fingerprint: str
    description_pl: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary (canonical order)."""
        return {
            "library_id": self.library_id,
            "name_pl": self.name_pl,
            "vendor": self.vendor,
            "series": self.series,
            "revision": self.revision,
            "schema_version": self.schema_version,
            "created_at": self.created_at,
            "fingerprint": self.fingerprint,
            "description_pl": self.description_pl,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionLibraryManifest:
        """Create from dictionary."""
        return cls(
            library_id=str(data.get("library_id", str(uuid4()))),
            name_pl=str(data.get("name_pl", "")),
            vendor=str(data.get("vendor", "")),
            series=str(data.get("series", "")),
            revision=str(data.get("revision", "")),
            schema_version=str(data.get("schema_version", "1.0")),
            created_at=str(data.get("created_at", datetime.utcnow().isoformat())),
            fingerprint=str(data.get("fingerprint", "")),
            description_pl=str(data.get("description_pl", "")),
        )


@dataclass(frozen=True)
class ProtectionLibraryExport:
    """
    Protection library export structure.

    Contains manifest and all protection type records.
    Deterministically serialized (canonical JSON with sorted keys).

    Attributes:
        manifest: Library metadata.
        device_types: List of protection device types (deterministic order).
        curves: List of protection curves (deterministic order).
        templates: List of protection setting templates (deterministic order).
    """

    manifest: ProtectionLibraryManifest
    device_types: list[dict[str, Any]]
    curves: list[dict[str, Any]]
    templates: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary (canonical order)."""
        return {
            "manifest": self.manifest.to_dict(),
            "device_types": self.device_types,
            "curves": self.curves,
            "templates": self.templates,
        }

    def to_canonical_json(self) -> str:
        """
        Export to canonical JSON.

        Deterministic serialization:
        - Sorted keys at all levels
        - No whitespace
        - Stable ordering of lists (name_pl → id)

        Returns:
            Canonical JSON string.
        """
        return json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":"))

    def to_fingerprint_payload_dict(self) -> dict[str, Any]:
        """
        Export to fingerprint payload (excludes runtime fields).

        Deterministic payload for fingerprint computation:
        - Excludes runtime fields: created_at, fingerprint, library_id
        - Includes stable metadata: vendor, series, revision, schema_version
        - Includes all type lists (already sorted deterministically)

        This ensures that two exports with the same catalog content
        produce identical fingerprints, regardless of export timestamp.

        Returns:
            Dictionary suitable for deterministic fingerprint computation.
        """
        return {
            "manifest": {
                "name_pl": self.manifest.name_pl,
                "vendor": self.manifest.vendor,
                "series": self.manifest.series,
                "revision": self.manifest.revision,
                "schema_version": self.manifest.schema_version,
                "description_pl": self.manifest.description_pl,
            },
            "device_types": self.device_types,
            "curves": self.curves,
            "templates": self.templates,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionLibraryExport:
        """Create from dictionary."""
        return cls(
            manifest=ProtectionLibraryManifest.from_dict(data.get("manifest", {})),
            device_types=list(data.get("device_types", [])),
            curves=list(data.get("curves", [])),
            templates=list(data.get("templates", [])),
        )


@dataclass
class ProtectionImportConflict:
    """
    Conflict detected during protection import.

    Attributes:
        kind: Kind of protection item (device_type/curve/template).
        id: Conflicting item ID.
        name_pl: Item name in Polish.
        reason_code: Conflict reason code (e.g., "exists_different", "ref_missing").
    """

    kind: str
    id: str
    name_pl: str
    reason_code: str


@dataclass
class ProtectionImportReport:
    """
    Report of protection import operation.

    Attributes:
        mode: Import mode used (MERGE or REPLACE).
        added: List of added items (deterministic order).
        skipped: List of skipped items (deterministic order).
        conflicts: List of conflicts encountered (deterministic order).
        blocked: List of blocked items (REPLACE mode, items in use).
        success: True if import succeeded without conflicts.
    """

    mode: ImportMode
    added: list[ProtectionImportConflict] = field(default_factory=list)
    skipped: list[ProtectionImportConflict] = field(default_factory=list)
    conflicts: list[ProtectionImportConflict] = field(default_factory=list)
    blocked: list[ProtectionImportConflict] = field(default_factory=list)
    success: bool = True

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary (deterministic order)."""
        return {
            "mode": self.mode.value,
            "added": sorted(
                [
                    {
                        "kind": item.kind,
                        "id": item.id,
                        "name_pl": item.name_pl,
                        "reason_code": item.reason_code,
                    }
                    for item in self.added
                ],
                key=lambda x: (x["kind"], x["name_pl"], x["id"]),
            ),
            "skipped": sorted(
                [
                    {
                        "kind": item.kind,
                        "id": item.id,
                        "name_pl": item.name_pl,
                        "reason_code": item.reason_code,
                    }
                    for item in self.skipped
                ],
                key=lambda x: (x["kind"], x["name_pl"], x["id"]),
            ),
            "conflicts": sorted(
                [
                    {
                        "kind": item.kind,
                        "id": item.id,
                        "name_pl": item.name_pl,
                        "reason_code": item.reason_code,
                    }
                    for item in self.conflicts
                ],
                key=lambda x: (x["kind"], x["name_pl"], x["id"]),
            ),
            "blocked": sorted(
                [
                    {
                        "kind": item.kind,
                        "id": item.id,
                        "name_pl": item.name_pl,
                        "reason_code": item.reason_code,
                    }
                    for item in self.blocked
                ],
                key=lambda x: (x["kind"], x["name_pl"], x["id"]),
            ),
            "success": self.success,
        }


def compute_protection_fingerprint(export: ProtectionLibraryExport) -> str:
    """
    Compute SHA-256 fingerprint of deterministic protection export payload.

    Deterministic hash based on canonical JSON serialization of payload
    WITHOUT runtime fields (created_at, fingerprint, library_id).

    This ensures that two exports with identical catalog content
    produce the same fingerprint, regardless of export timestamp or library_id.

    Args:
        export: Protection library export to fingerprint.

    Returns:
        SHA-256 hex digest (64 characters).
    """
    payload = export.to_fingerprint_payload_dict()
    canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


def sort_protection_types_deterministically(types: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Sort protection type records deterministically (name_pl → id).

    Args:
        types: List of protection type dictionaries.

    Returns:
        Sorted list.
    """
    return sorted(types, key=lambda t: (str(t.get("name_pl", "")), str(t.get("id", ""))))
