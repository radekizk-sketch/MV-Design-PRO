"""
Incremental Archive Export — eksport przyrostowy projektu.

Zamiast eksportować pełne archiwum za każdym razem,
eksport przyrostowy zawiera tylko sekcje, które się zmieniły
od ostatniego pełnego lub przyrostowego eksportu.

KANON:
- NOT-A-SOLVER — zero obliczeń fizycznych
- Deterministyczny — te same zmiany = ten sam delta
- Oparty na fingerprints z ArchiveFingerprints
- Kompatybilny z pełnym archiwum (merge)
"""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from typing import Any

from domain.project_archive import (
    ArchiveError,
    ArchiveFingerprints,
    ProjectArchive,
    archive_to_dict,
    canonicalize,
    dict_to_archive,
)

# ============================================================================
# STAŁE
# ============================================================================

INCREMENTAL_FORMAT_ID = "MV-DESIGN-PRO-INCREMENTAL"
INCREMENTAL_SCHEMA_VERSION = "1.0.0"

# Mapowanie nazw sekcji na pola ArchiveFingerprints i klucze dict
SECTION_NAMES: tuple[str, ...] = (
    "project_meta",
    "network_model",
    "sld_diagrams",
    "cases",
    "runs",
    "results",
    "proofs",
    "interpretations",
    "issues",
    "enm",
)

_FINGERPRINT_FIELD_MAP: dict[str, str] = {
    "project_meta": "project_meta_hash",
    "network_model": "network_model_hash",
    "sld_diagrams": "sld_hash",
    "cases": "cases_hash",
    "runs": "runs_hash",
    "results": "results_hash",
    "proofs": "proofs_hash",
    "interpretations": "interpretations_hash",
    "issues": "issues_hash",
    "enm": "enm_hash",
}


# ============================================================================
# BŁĘDY
# ============================================================================


class IncrementalArchiveError(ArchiveError):
    """Bazowy błąd eksportu przyrostowego."""

    pass


class BaseHashMismatchError(IncrementalArchiveError):
    """Hash bazowego archiwum nie zgadza się z deltą."""

    def __init__(self, expected: str, got: str) -> None:
        self.expected = expected
        self.got = got
        super().__init__(
            f"Hash bazowego archiwum nie zgadza się: " f"oczekiwano {expected}, otrzymano {got}"
        )


class IncrementalStructureError(IncrementalArchiveError):
    """Błąd struktury archiwum przyrostowego."""

    def __init__(self, message: str) -> None:
        super().__init__(f"Błąd struktury archiwum przyrostowego: {message}")


class IncrementalVersionError(IncrementalArchiveError):
    """Nieobsługiwana wersja schematu archiwum przyrostowego."""

    def __init__(self, expected: str, got: str) -> None:
        self.expected = expected
        self.got = got
        super().__init__(
            f"Nieobsługiwana wersja schematu przyrostowego: "
            f"oczekiwano {expected}, otrzymano {got}"
        )


# ============================================================================
# TYPY ENUM
# ============================================================================


class IncrementalExportType(StrEnum):
    """Typ eksportu archiwum."""

    FULL = "FULL"
    DELTA = "DELTA"


class SectionChangeStatus(StrEnum):
    """Status zmiany sekcji w eksporcie przyrostowym."""

    UNCHANGED = "UNCHANGED"
    MODIFIED = "MODIFIED"
    ADDED = "ADDED"
    REMOVED = "REMOVED"


# ============================================================================
# MODELE DANYCH
# ============================================================================


@dataclass(frozen=True)
class SectionDelta:
    """
    Delta pojedynczej sekcji archiwum.

    Jeśli status == UNCHANGED, data jest None (sekcja pominięta).
    Jeśli status == MODIFIED lub ADDED, data zawiera pełne dane sekcji.
    Jeśli status == REMOVED, data jest None.
    """

    section_name: str
    status: SectionChangeStatus
    old_hash: str | None
    new_hash: str | None
    data: dict[str, Any] | None


@dataclass(frozen=True)
class IncrementalArchive:
    """
    Archiwum przyrostowe (delta).

    Zawiera tylko sekcje, które zmieniły się od ostatniego eksportu.
    Może być nałożone na pełne archiwum bazowe w celu rekonstrukcji.
    """

    format_id: str
    schema_version: str
    base_archive_hash: str
    base_timestamp: str  # ISO 8601
    export_type: IncrementalExportType
    deltas: tuple[SectionDelta, ...]
    fingerprints: ArchiveFingerprints
    deterministic_signature: str


@dataclass(frozen=True)
class IncrementalExportResult:
    """Wynik operacji eksportu przyrostowego."""

    success: bool
    archive_bytes: bytes
    sections_changed: int
    sections_unchanged: int
    size_full_bytes: int
    size_delta_bytes: int
    savings_percent: float


# ============================================================================
# POMOCNICZE
# ============================================================================


def _get_fingerprint_hash(fingerprints: ArchiveFingerprints, section_name: str) -> str:
    """Pobierz hash sekcji z ArchiveFingerprints."""
    field_name = _FINGERPRINT_FIELD_MAP.get(section_name)
    if field_name is None:
        raise IncrementalArchiveError(f"Nieznana nazwa sekcji: {section_name}")
    return getattr(fingerprints, field_name, "")


def _get_section_data(archive_dict: dict[str, Any], section_name: str) -> dict[str, Any]:
    """Pobierz dane sekcji z archiwum jako dict."""
    return archive_dict.get(section_name, {})


def _compute_deterministic_signature(
    base_hash: str,
    deltas: tuple[SectionDelta, ...],
    fingerprints: ArchiveFingerprints,
) -> str:
    """
    Oblicz deterministyczną sygnaturę archiwum przyrostowego.

    Sygnatura = SHA-256 z (base_hash + posortowane delty + nowe fingerprints).
    """
    sig_data: dict[str, Any] = {
        "base_hash": base_hash,
        "deltas": [
            {
                "section_name": d.section_name,
                "status": d.status.value,
                "old_hash": d.old_hash,
                "new_hash": d.new_hash,
            }
            for d in deltas
        ],
        "fingerprints": {
            "archive_hash": fingerprints.archive_hash,
            "project_meta_hash": fingerprints.project_meta_hash,
            "network_model_hash": fingerprints.network_model_hash,
            "sld_hash": fingerprints.sld_hash,
            "cases_hash": fingerprints.cases_hash,
            "runs_hash": fingerprints.runs_hash,
            "results_hash": fingerprints.results_hash,
            "proofs_hash": fingerprints.proofs_hash,
            "interpretations_hash": fingerprints.interpretations_hash,
            "issues_hash": fingerprints.issues_hash,
            "enm_hash": fingerprints.enm_hash,
        },
    }
    canonical = canonicalize(sig_data)
    json_str = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(json_str.encode("utf-8")).hexdigest()


# ============================================================================
# FUNKCJE GŁÓWNE
# ============================================================================


def compute_section_deltas(
    old_fingerprints: ArchiveFingerprints,
    new_archive: ProjectArchive,
) -> list[SectionDelta]:
    """
    Porównaj fingerprints starego i nowego archiwum.

    Dla każdej sekcji ustala status (UNCHANGED / MODIFIED / ADDED / REMOVED)
    i dołącza dane sekcji tylko gdy sekcja się zmieniła.

    Args:
        old_fingerprints: Fingerprints bazowego (poprzedniego) archiwum.
        new_archive: Aktualne pełne archiwum.

    Returns:
        Lista SectionDelta dla wszystkich sekcji.
    """
    new_dict = archive_to_dict(new_archive)
    new_fp = new_archive.fingerprints
    deltas: list[SectionDelta] = []

    for section_name in SECTION_NAMES:
        old_hash = _get_fingerprint_hash(old_fingerprints, section_name)
        new_hash = _get_fingerprint_hash(new_fp, section_name)

        if old_hash == new_hash:
            deltas.append(
                SectionDelta(
                    section_name=section_name,
                    status=SectionChangeStatus.UNCHANGED,
                    old_hash=old_hash,
                    new_hash=new_hash,
                    data=None,
                )
            )
        elif not old_hash and new_hash:
            # Sekcja nie istniała wcześniej
            deltas.append(
                SectionDelta(
                    section_name=section_name,
                    status=SectionChangeStatus.ADDED,
                    old_hash=None,
                    new_hash=new_hash,
                    data=_get_section_data(new_dict, section_name),
                )
            )
        elif old_hash and not new_hash:
            # Sekcja usunięta
            deltas.append(
                SectionDelta(
                    section_name=section_name,
                    status=SectionChangeStatus.REMOVED,
                    old_hash=old_hash,
                    new_hash=None,
                    data=None,
                )
            )
        else:
            # Sekcja zmieniona
            deltas.append(
                SectionDelta(
                    section_name=section_name,
                    status=SectionChangeStatus.MODIFIED,
                    old_hash=old_hash,
                    new_hash=new_hash,
                    data=_get_section_data(new_dict, section_name),
                )
            )

    return deltas


def build_incremental_archive(
    base_fingerprints: ArchiveFingerprints,
    current_archive: ProjectArchive,
    base_timestamp: str | None = None,
) -> IncrementalArchive:
    """
    Zbuduj archiwum przyrostowe (delta) na podstawie bieżącego stanu
    i fingerprints poprzedniego eksportu.

    Args:
        base_fingerprints: Fingerprints bazowego archiwum (z ostatniego eksportu).
        current_archive: Bieżące pełne archiwum projektu.
        base_timestamp: Timestamp bazowego eksportu (ISO 8601). Domyślnie: now.

    Returns:
        IncrementalArchive z deltami tylko dla zmienionych sekcji.
    """
    if base_timestamp is None:
        base_timestamp = datetime.now(UTC).isoformat()

    deltas = compute_section_deltas(base_fingerprints, current_archive)

    changed = [d for d in deltas if d.status != SectionChangeStatus.UNCHANGED]
    export_type = IncrementalExportType.DELTA if changed else IncrementalExportType.FULL
    # Nawet jeśli brak zmian, typ to DELTA (puste delta)
    export_type = IncrementalExportType.DELTA

    deltas_tuple = tuple(deltas)
    new_fp = current_archive.fingerprints

    signature = _compute_deterministic_signature(
        base_fingerprints.archive_hash, deltas_tuple, new_fp
    )

    return IncrementalArchive(
        format_id=INCREMENTAL_FORMAT_ID,
        schema_version=INCREMENTAL_SCHEMA_VERSION,
        base_archive_hash=base_fingerprints.archive_hash,
        base_timestamp=base_timestamp,
        export_type=export_type,
        deltas=deltas_tuple,
        fingerprints=new_fp,
        deterministic_signature=signature,
    )


def apply_incremental_archive(
    base_archive: ProjectArchive,
    incremental: IncrementalArchive,
) -> ProjectArchive:
    """
    Nałóż archiwum przyrostowe na bazowe, rekonstruując pełne archiwum.

    Args:
        base_archive: Pełne archiwum bazowe.
        incremental: Archiwum przyrostowe (delta).

    Returns:
        Zrekonstruowane pełne archiwum.

    Raises:
        BaseHashMismatchError: Hash bazowego archiwum nie zgadza się.
    """
    # Weryfikacja zgodności bazy
    if base_archive.fingerprints.archive_hash != incremental.base_archive_hash:
        raise BaseHashMismatchError(
            expected=incremental.base_archive_hash,
            got=base_archive.fingerprints.archive_hash,
        )

    base_dict = archive_to_dict(base_archive)

    # Nakładanie delt
    for delta in incremental.deltas:
        if delta.status == SectionChangeStatus.UNCHANGED:
            continue
        elif delta.status in (
            SectionChangeStatus.MODIFIED,
            SectionChangeStatus.ADDED,
        ):
            if delta.data is not None:
                base_dict[delta.section_name] = delta.data
        elif delta.status == SectionChangeStatus.REMOVED:
            # Sekcje usunięte — wstawienie pustych danych
            base_dict[delta.section_name] = _empty_section_data(delta.section_name)

    # Uaktualnij fingerprints w zrekonstruowanym słowniku
    base_dict["fingerprints"] = {
        "archive_hash": incremental.fingerprints.archive_hash,
        "project_meta_hash": incremental.fingerprints.project_meta_hash,
        "network_model_hash": incremental.fingerprints.network_model_hash,
        "sld_hash": incremental.fingerprints.sld_hash,
        "cases_hash": incremental.fingerprints.cases_hash,
        "runs_hash": incremental.fingerprints.runs_hash,
        "results_hash": incremental.fingerprints.results_hash,
        "proofs_hash": incremental.fingerprints.proofs_hash,
        "interpretations_hash": incremental.fingerprints.interpretations_hash,
        "issues_hash": incremental.fingerprints.issues_hash,
        "enm_hash": incremental.fingerprints.enm_hash,
    }

    return dict_to_archive(base_dict)


def _empty_section_data(section_name: str) -> dict[str, Any]:
    """Zwróć pusty dict dla danej sekcji (po usunięciu)."""
    defaults: dict[str, dict[str, Any]] = {
        "project_meta": {
            "id": "",
            "name": "",
            "description": None,
            "schema_version": "",
            "active_network_snapshot_id": None,
            "connection_node_id": None,
            "sources": [],
            "created_at": "",
            "updated_at": "",
        },
        "network_model": {
            "nodes": [],
            "branches": [],
            "sources": [],
            "loads": [],
            "snapshots": [],
        },
        "sld_diagrams": {
            "diagrams": [],
            "node_symbols": [],
            "branch_symbols": [],
            "annotations": [],
        },
        "cases": {
            "study_cases": [],
            "operating_cases": [],
            "switching_states": [],
            "settings": None,
        },
        "runs": {
            "canonical_runs": [],
            "analysis_runs_index": [],
        },
        "results": {},
        "proofs": {
            "design_specs": [],
            "design_proposals": [],
            "design_evidence": [],
        },
        "interpretations": {"cached": []},
        "issues": {"snapshot": []},
        "enm": {"models": []},
    }
    return defaults.get(section_name, {})


# ============================================================================
# SERIALIZACJA / DESERIALIZACJA
# ============================================================================


def _incremental_to_dict(archive: IncrementalArchive) -> dict[str, Any]:
    """Konwersja IncrementalArchive do dict (do JSON)."""
    return canonicalize(
        {
            "format_id": archive.format_id,
            "schema_version": archive.schema_version,
            "base_archive_hash": archive.base_archive_hash,
            "base_timestamp": archive.base_timestamp,
            "export_type": archive.export_type.value,
            "deltas": [
                {
                    "section_name": d.section_name,
                    "status": d.status.value,
                    "old_hash": d.old_hash,
                    "new_hash": d.new_hash,
                    "data": d.data,
                }
                for d in archive.deltas
            ],
            "fingerprints": {
                "archive_hash": archive.fingerprints.archive_hash,
                "project_meta_hash": archive.fingerprints.project_meta_hash,
                "network_model_hash": archive.fingerprints.network_model_hash,
                "sld_hash": archive.fingerprints.sld_hash,
                "cases_hash": archive.fingerprints.cases_hash,
                "runs_hash": archive.fingerprints.runs_hash,
                "results_hash": archive.fingerprints.results_hash,
                "proofs_hash": archive.fingerprints.proofs_hash,
                "interpretations_hash": (archive.fingerprints.interpretations_hash),
                "issues_hash": archive.fingerprints.issues_hash,
                "enm_hash": archive.fingerprints.enm_hash,
            },
            "deterministic_signature": archive.deterministic_signature,
        }
    )


def _dict_to_incremental(data: dict[str, Any]) -> IncrementalArchive:
    """Konwersja dict (z JSON) do IncrementalArchive."""
    # Walidacja struktury
    required_keys = [
        "format_id",
        "schema_version",
        "base_archive_hash",
        "base_timestamp",
        "export_type",
        "deltas",
        "fingerprints",
        "deterministic_signature",
    ]
    for key in required_keys:
        if key not in data:
            raise IncrementalStructureError(f"Brak wymaganego pola: {key}")

    if data["format_id"] != INCREMENTAL_FORMAT_ID:
        raise IncrementalStructureError(f"Nieprawidłowy identyfikator formatu: {data['format_id']}")

    version = data["schema_version"]
    if not _is_compatible_version(version):
        raise IncrementalVersionError(INCREMENTAL_SCHEMA_VERSION, version)

    fp = data["fingerprints"]
    fingerprints = ArchiveFingerprints(
        archive_hash=fp["archive_hash"],
        project_meta_hash=fp["project_meta_hash"],
        network_model_hash=fp["network_model_hash"],
        sld_hash=fp["sld_hash"],
        cases_hash=fp["cases_hash"],
        runs_hash=fp["runs_hash"],
        results_hash=fp["results_hash"],
        proofs_hash=fp["proofs_hash"],
        interpretations_hash=fp.get("interpretations_hash", ""),
        issues_hash=fp.get("issues_hash", ""),
        enm_hash=fp.get("enm_hash", ""),
    )

    deltas: list[SectionDelta] = []
    for d in data["deltas"]:
        deltas.append(
            SectionDelta(
                section_name=d["section_name"],
                status=SectionChangeStatus(d["status"]),
                old_hash=d.get("old_hash"),
                new_hash=d.get("new_hash"),
                data=d.get("data"),
            )
        )

    return IncrementalArchive(
        format_id=data["format_id"],
        schema_version=data["schema_version"],
        base_archive_hash=data["base_archive_hash"],
        base_timestamp=data["base_timestamp"],
        export_type=IncrementalExportType(data["export_type"]),
        deltas=tuple(deltas),
        fingerprints=fingerprints,
        deterministic_signature=data["deterministic_signature"],
    )


def serialize_incremental(archive: IncrementalArchive) -> bytes:
    """
    Serializuj IncrementalArchive do bytes (JSON w ZIP).

    Format pliku: ZIP zawierający incremental.json.

    Args:
        archive: Archiwum przyrostowe do serializacji.

    Returns:
        Bajty pliku ZIP.
    """
    archive_dict = _incremental_to_dict(archive)
    json_str = json.dumps(archive_dict, sort_keys=True, indent=2, ensure_ascii=False)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("incremental.json", json_str)
    return buf.getvalue()


def deserialize_incremental(data: bytes) -> IncrementalArchive:
    """
    Deserializuj IncrementalArchive z bytes (JSON w ZIP).

    Args:
        data: Bajty pliku ZIP z archiwum przyrostowym.

    Returns:
        Zdeserializowane archiwum przyrostowe.

    Raises:
        IncrementalStructureError: Nieprawidłowa struktura pliku.
    """
    try:
        buf = io.BytesIO(data)
        with zipfile.ZipFile(buf, "r") as zf:
            if "incremental.json" not in zf.namelist():
                raise IncrementalStructureError("Brak pliku incremental.json w archiwum ZIP")
            json_str = zf.read("incremental.json").decode("utf-8")
    except zipfile.BadZipFile:
        raise IncrementalStructureError("Plik nie jest prawidłowym archiwum ZIP")

    try:
        archive_dict = json.loads(json_str)
    except json.JSONDecodeError as e:
        raise IncrementalStructureError(f"Nieprawidłowy JSON w archiwum: {e}")

    return _dict_to_incremental(archive_dict)


def _is_compatible_version(version: str) -> bool:
    """Sprawdź kompatybilność wersji schematu przyrostowego."""
    try:
        parts = version.split(".")
        major = int(parts[0])
        current_parts = INCREMENTAL_SCHEMA_VERSION.split(".")
        current_major = int(current_parts[0])
        return major <= current_major
    except (ValueError, IndexError):
        return False


# ============================================================================
# FUNKCJE POMOCNICZE DLA API
# ============================================================================


def compute_export_result(
    full_archive: ProjectArchive,
    incremental: IncrementalArchive,
    full_bytes: bytes,
    delta_bytes: bytes,
) -> IncrementalExportResult:
    """
    Oblicz wynik eksportu przyrostowego z metrykami oszczędności.

    Args:
        full_archive: Pełne archiwum (dla odniesienia).
        incremental: Wygenerowane archiwum przyrostowe.
        full_bytes: Bajty pełnego archiwum (dla porównania rozmiaru).
        delta_bytes: Bajty archiwum przyrostowego.

    Returns:
        IncrementalExportResult z metrykami.
    """
    archive_dict = archive_to_dict(full_archive)
    tracked_sections = sum(1 for section_name in SECTION_NAMES if section_name in archive_dict)
    changed = sum(1 for d in incremental.deltas if d.status != SectionChangeStatus.UNCHANGED)
    unchanged = max(tracked_sections - changed, 0)

    size_full = len(full_bytes)
    size_delta = len(delta_bytes)
    savings = ((size_full - size_delta) / size_full * 100.0) if size_full > 0 else 0.0

    return IncrementalExportResult(
        success=True,
        archive_bytes=delta_bytes,
        sections_changed=changed,
        sections_unchanged=unchanged,
        size_full_bytes=size_full,
        size_delta_bytes=size_delta,
        savings_percent=round(savings, 2),
    )
