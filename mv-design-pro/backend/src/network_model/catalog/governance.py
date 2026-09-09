"""
Catalog governance: bramka katalogowa importu + governance biblioteki zabezpieczen (P14b)

W1 (2026-09-09): governance biblioteki typow sieci (P13b — `TypeLibraryManifest`,
`TypeLibraryExport`, `ImportConflict`, `ImportReport`, `compute_fingerprint`,
`sort_types_deterministically`) skasowane razem z tabelami typow w bazie i
koncowkami eksportu/importu (jedyny konsument — przyciski w `ui/catalog/TypeLibraryBrowser.tsx`
— skasowany razem z nimi). Zostaje:
- `ImportMode` + `wymaga_referencji_katalogowej` (bramka katalogowa importu),
- governance biblioteki zabezpieczen: manifest/eksport/import/odcisk (MERGE/REPLACE).

Canonical reference: SYSTEM_SPEC.md § 4 (Catalog); versioning/export/import
governance rules below are spelled out in docs/system/SPEC_KATALOGI_I_MATERIALIZACJA_
PARAMETROW.md, section "Governance biblioteki typow" (each rule cites the enforcing
symbol here and its pinning test). The retired CT-* checklist that used to be cited
here lives at docs/audit/archive/CANONICAL_COMPLIANCE_2026-01.md CT-* as historical
context only.
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


# ---------------------------------------------------------------------------
# Bramka katalogowa importu — JEDNO ZRODLO PRAWDY dla wszystkich drog wejscia
# ---------------------------------------------------------------------------
#
# KLASA, NIE INSTANCJA: „ktore rodzaje galezi wymagaja referencji katalogowej"
# bylo zaszyte lokalnie w imporcie archiwum ZIP (`project_archive/service.py`,
# zbior {"cable", "line_overhead"}). Kazda kolejna droga wejscia modelu (import
# XLSX, przyszle importy) powielalaby ten warunek wlasnym zbiorem — dwa
# niezalezne predykaty, ktore „dzis sie zgadzaja", rozjezdzaja sie przy pierwszym
# nowym rodzaju. Predykat ponizej normalizuje OBA nazewnictwa uzywane w systemie:
#   * ENM / archiwum:      "cable", "line_overhead",
#   * rdzen solverowy:     BranchType.CABLE.value = "CABLE", BranchType.LINE.value = "LINE".
# Transformator NIE jest tu wymagany — tak jak w bramce archiwum; wymog katalogu
# dla transformatorow rozstrzyga polityka operacji domenowych (`domain_ops_policy`),
# nie bramka importu.
_RODZAJE_GALEZI_WYMAGAJACE_KATALOGU: frozenset[str] = frozenset(
    {"cable", "line_overhead", "line", "overhead_line"}
)


def wymaga_referencji_katalogowej(rodzaj_galezi: str | None) -> bool:
    """Czy galaz danego rodzaju wymaga referencji katalogowej przy imporcie.

    Args:
        rodzaj_galezi: rodzaj galezi w dowolnym z nazewnictw systemu
            (ENM: ``cable`` / ``line_overhead``; rdzen: ``CABLE`` / ``LINE``).

    Returns:
        True, gdy brak referencji katalogowej ma zapalic bramke katalogowa importu.
    """
    if not rodzaj_galezi:
        return False
    return rodzaj_galezi.strip().lower() in _RODZAJE_GALEZI_WYMAGAJACE_KATALOGU


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
