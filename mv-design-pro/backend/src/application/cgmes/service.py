"""
CGMES service — orchestrates EQ + TP + side-car into a deterministic ZIP.

KANON (mirrors project_archive service):
  - Export = NOT-A-SOLVER, zero new physics.
  - Determinism absolute: members in a FIXED order, ZipInfo.date_time PINNED to a
    constant, canonical bytes per member. Timestamps live ONLY in manifest.json
    (never in the CGMES data), exactly like the project archive.
  - manifest.json carries per-file + whole-archive SHA-256 fingerprints.
  - verify_cgmes_integrity recomputes and compares fingerprints.

This layer imports neither solvers nor analysis.
"""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from typing import TYPE_CHECKING, Any

from infrastructure.cgmes.cgmes_exporter import export_eq_tp_bytes
from infrastructure.cgmes.cgmes_importer import (
    CgmesImportResult,
    CgmesImportStatus,
    import_from_eq_tp,
    import_from_side_car,
)
from infrastructure.cgmes.profiles import (
    CGMES_VERSION,
    CIM_VERSION,
    DEFERRED_PROFILES,
    EQ_PROFILE_ID,
    PROFILE_EQ,
    PROFILE_TP,
    TP_PROFILE_ID,
)
from infrastructure.cgmes.refmap import (
    LOSSY_BOUNDARY,
    REFMAP_SCHEMA_VERSION,
    CgmesRefMap,
)

if TYPE_CHECKING:
    from enm.models import EnergyNetworkModel

CGMES_FORMAT_ID = "MV-DESIGN-PRO-CGMES"

# Pinned ZIP timestamp (Y, M, D, h, m, s) — constant for byte-determinism.
_PINNED_ZIP_DATE_TIME = (1980, 1, 1, 0, 0, 0)

# Fixed member basenames (model_name is sanitized into a prefix).
_EQ_NAME = "EQ.xml"
_TP_NAME = "TP.xml"
_REFMAP_NAME = "refmap.json"
_MANIFEST_NAME = "manifest.json"

# Member write order is FIXED (manifest last so it can fingerprint the rest).
_MEMBER_ORDER = (_EQ_NAME, _TP_NAME, _REFMAP_NAME, _MANIFEST_NAME)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _enm_canonical_dict(enm: EnergyNetworkModel) -> dict[str, Any]:
    """The ENM model_dump with random ``id`` UUIDs stripped.

    ``ref_id`` is the stable identity; ``id`` is random per-instance and is
    excluded from the ENM hashes (``enm.hash._strip_uuids``). The header carries
    wall-clock timestamps (``created_at``/``updated_at``) and rolling hash fields
    that are also excluded from the ENM hashes. Stripping all of them here makes
    the side-car bytes a pure function of the model content, so the export is
    byte-identical across processes even when fresh ``id`` UUIDs / timestamps are
    minted. On re-import pydantic repopulates them with defaults (not hashed).
    """
    from enm.hash import _strip_uuids

    payload = enm.model_dump(
        mode="json",
        exclude={
            "header": {
                "updated_at",
                "created_at",
                "hash_sha256",
                "semantic_hash",
                "input_hash",
                "case_hash",
                "variant_hash",
                "switching_snapshot_hash",
            }
        },
    )
    return _strip_uuids(payload)


def build_refmap(enm: EnergyNetworkModel) -> CgmesRefMap:
    """Build the side-car: identity map + full ENM payload for lossless restore."""
    from infrastructure.cgmes.mrid import mrid_for

    refmap = CgmesRefMap(enm=_enm_canonical_dict(enm))
    # Register a primary-object mRID per element ref_id (reversible identity).
    for bus in enm.buses:
        refmap.register(bus.ref_id, mrid_for("ConnectivityNode", bus.ref_id))
    for branch in enm.branches:
        refmap.register(branch.ref_id, mrid_for(_primary_class(branch), branch.ref_id))
    for trafo in enm.transformers:
        refmap.register(trafo.ref_id, mrid_for("PowerTransformer", trafo.ref_id))
    for source in enm.sources:
        refmap.register(source.ref_id, mrid_for("ExternalNetworkInjection", source.ref_id))
    for gen in enm.generators:
        refmap.register(gen.ref_id, mrid_for(_gen_class(gen), gen.ref_id))
    for load in enm.loads:
        refmap.register(load.ref_id, mrid_for("EnergyConsumer", load.ref_id))
    for sub in enm.substations:
        refmap.register(sub.ref_id, mrid_for("Substation", sub.ref_id))
    return refmap


def _primary_class(branch: Any) -> str:
    from enm.models import Cable, FuseBranch, OverheadLine, SwitchBranch

    if isinstance(branch, OverheadLine | Cable):
        return "ACLineSegment"
    if isinstance(branch, SwitchBranch):
        return {"breaker": "Breaker", "bus_coupler": "Breaker", "disconnector": "Disconnector"}.get(
            branch.type, "LoadBreakSwitch"
        )
    if isinstance(branch, FuseBranch):
        return "Fuse"
    return "ConductingEquipment"


def _gen_class(gen: Any) -> str:
    ibr = {"pv_inverter", "wind_inverter", "fw_pmsg", "fw_dfig", "fw_scig", "bess"}
    return "PowerElectronicsConnection" if gen.gen_type in ibr else "SynchronousMachine"


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


def export_cgmes(enm: EnergyNetworkModel) -> bytes:
    """Export the ENM to a deterministic CGMES ZIP (EQ + TP + side-car + manifest)."""
    eq_bytes, tp_bytes = export_eq_tp_bytes(enm)
    refmap = build_refmap(enm)
    refmap_bytes = refmap.to_json().encode("utf-8")

    members: dict[str, bytes] = {
        _EQ_NAME: eq_bytes,
        _TP_NAME: tp_bytes,
        _REFMAP_NAME: refmap_bytes,
    }

    # Per-file fingerprints (sorted for stable manifest).
    file_hashes = {name: _sha256(data) for name, data in members.items()}
    archive_hash = _sha256(
        json.dumps(file_hashes, sort_keys=True, separators=(",", ":")).encode("utf-8")
    )

    manifest = {
        "format_id": CGMES_FORMAT_ID,
        "cim_version": CIM_VERSION,
        "cgmes_version": CGMES_VERSION,
        "refmap_schema_version": REFMAP_SCHEMA_VERSION,
        "profiles": {
            EQ_PROFILE_ID: PROFILE_EQ,
            TP_PROFILE_ID: PROFILE_TP,
        },
        "deferred_profiles": dict(sorted(DEFERRED_PROFILES.items())),
        "model_name": enm.header.name,
        # NOTE: no wall-clock timestamp is written anywhere — neither in the
        # CGMES data nor in the manifest — so export(enm) is byte-identical on
        # repeat and across processes (D-02 Determinism Rule, acceptance #2).
        "files": dict(sorted(file_hashes.items())),
        "archive_hash": archive_hash,
        "lossy_boundary": list(LOSSY_BOUNDARY),
    }
    manifest_bytes = json.dumps(manifest, sort_keys=True, indent=2, ensure_ascii=False).encode(
        "utf-8"
    )
    members[_MANIFEST_NAME] = manifest_bytes

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in _MEMBER_ORDER:
            info = zipfile.ZipInfo(filename=name, date_time=_PINNED_ZIP_DATE_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, members[name])
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Import
# ---------------------------------------------------------------------------


def import_cgmes(archive_bytes: bytes, *, prefer_side_car: bool = True) -> CgmesImportResult:
    """Import a CGMES ZIP.

    If the side-car is present and ``prefer_side_car`` is True, restores the ENM
    losslessly. Otherwise reconstructs from EQ + TP (third-party path).
    """
    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as zf:
            names = set(zf.namelist())
            if _EQ_NAME not in names or _TP_NAME not in names:
                return CgmesImportResult(
                    status=CgmesImportStatus.FAILED,
                    enm=None,
                    errors=["Archiwum CGMES nie zawiera profili EQ.xml i TP.xml."],
                )
            eq_bytes = zf.read(_EQ_NAME)
            tp_bytes = zf.read(_TP_NAME)
            refmap: CgmesRefMap | None = None
            if _REFMAP_NAME in names:
                refmap = CgmesRefMap.from_dict(json.loads(zf.read(_REFMAP_NAME)))
            model_name = "Imported CGMES"
            if _MANIFEST_NAME in names:
                manifest = json.loads(zf.read(_MANIFEST_NAME))
                model_name = manifest.get("model_name", model_name)
    except zipfile.BadZipFile:
        return CgmesImportResult(
            status=CgmesImportStatus.FAILED,
            enm=None,
            errors=["Nieprawidlowy format archiwum ZIP."],
        )
    except json.JSONDecodeError as exc:
        return CgmesImportResult(
            status=CgmesImportStatus.FAILED,
            enm=None,
            errors=[f"Blad parsowania JSON side-car/manifest: {exc}"],
        )

    if prefer_side_car and refmap is not None and refmap.enm:
        return import_from_side_car(refmap)
    return import_from_eq_tp(eq_bytes, tp_bytes, refmap=refmap, model_name=model_name)


# ---------------------------------------------------------------------------
# Integrity
# ---------------------------------------------------------------------------


def verify_cgmes_integrity(archive_bytes: bytes) -> list[str]:
    """Verify per-file + whole-archive fingerprints. Returns errors (empty = OK)."""
    errors: list[str] = []
    try:
        with zipfile.ZipFile(io.BytesIO(archive_bytes), "r") as zf:
            names = set(zf.namelist())
            if _MANIFEST_NAME not in names:
                return ["Archiwum nie zawiera manifest.json."]
            manifest = json.loads(zf.read(_MANIFEST_NAME))
            stored_files: dict[str, str] = manifest.get("files", {})
            recomputed: dict[str, str] = {}
            for name, stored_hash in sorted(stored_files.items()):
                if name not in names:
                    errors.append(f"Brak pliku '{name}' wymienionego w manifescie.")
                    continue
                actual = _sha256(zf.read(name))
                recomputed[name] = actual
                if actual != stored_hash:
                    errors.append(
                        f"Blad integralnosci '{name}': oczekiwano {stored_hash}, "
                        f"obliczono {actual}."
                    )
            stored_archive = manifest.get("archive_hash", "")
            computed_archive = _sha256(
                json.dumps(recomputed, sort_keys=True, separators=(",", ":")).encode("utf-8")
            )
            if recomputed == stored_files and computed_archive != stored_archive:
                errors.append(
                    f"Blad integralnosci archiwum: oczekiwano {stored_archive}, "
                    f"obliczono {computed_archive}."
                )
    except zipfile.BadZipFile:
        return ["Nieprawidlowy format archiwum ZIP."]
    except json.JSONDecodeError as exc:
        return [f"Blad parsowania manifest.json: {exc}"]
    return errors
