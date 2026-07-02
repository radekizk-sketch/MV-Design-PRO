"""
Side-car model for the CGMES export.

The EQ + TP profiles carry a standards-compliant electrical model suitable for
third-party CGMES tools, but several ENM concepts have NO standard CIM target
(see ``LOSSY_BOUNDARY`` below). To keep the INTERNAL round-trip lossless, the
exporter also writes a side-car (``<basename>_refmap.json``) that holds:

  1. ``ref_to_mrid`` / ``mrid_to_ref`` — the reversible identity map so an
     importer can recover the original ENM ``ref_id`` for every CIM object.
  2. ``enm`` — the canonical ENM JSON (the model_dump used by ``compute_*_hash``)
     so a same-system import restores byte-identical inputs (hash equality).

A third-party consumer ignores the side-car and reads only EQ+TP — that path is
LOSSY (documented). A same-system consumer prefers the side-car and is LOSSLESS.

This is NOT a shadow model: the side-car is a serialization artifact of the one
ENM, not a second editable store. ZERO physics; no solver/analysis import.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

# Side-car format identity (versioned for backward compatibility).
REFMAP_FORMAT_ID = "MV-DESIGN-PRO-CGMES-REFMAP"
REFMAP_SCHEMA_VERSION = "1.0.0"

# Human-readable catalogue of what only survives via the side-car (i.e. is lost
# for EQ-only third-party tools). Surfaced in docs + manifest for honesty.
LOSSY_BOUNDARY: tuple[str, ...] = (
    "ENM ref_id identity (CIM uses mRID; recovered via ref_to_mrid map)",
    "catalog_ref / catalog_namespace / parameter_source / source_mode",
    "materialized_params and ParameterOverride lists",
    "OZE connection_variant / station_ref / blocking_transformer_ref / n_parallel",
    "Source c_max / c_min and controller bandwidths",
    "Switch series impedance (r_ohm/x_ohm) — CIM Switch carries no impedance",
    "ENM topology helpers: Junction, Corridor, BranchPointSN, LineRun, "
    "ConnectionNode, CableJoint, Bay, Measurement, ProtectionAssignment",
    "GPZ sections (gpz_sections / gpz_hv_sections) and Substation external_ports",
    "Bus grounding/limits beyond BaseVoltage, transformer neutrals/tap metadata",
)


@dataclass
class CgmesRefMap:
    """Reversible identity map plus the full ENM payload for lossless restore."""

    ref_to_mrid: dict[str, str] = field(default_factory=dict)
    mrid_to_ref: dict[str, str] = field(default_factory=dict)
    enm: dict[str, Any] = field(default_factory=dict)
    lossy_fields: tuple[str, ...] = LOSSY_BOUNDARY

    def register(self, ref_id: str, mrid: str) -> None:
        """Record a ref_id <-> mRID pairing (primary object identity)."""
        if ref_id in self.ref_to_mrid:
            return
        self.ref_to_mrid[ref_id] = mrid
        self.mrid_to_ref[mrid] = ref_id

    def to_dict(self) -> dict[str, Any]:
        return {
            "format_id": REFMAP_FORMAT_ID,
            "schema_version": REFMAP_SCHEMA_VERSION,
            "ref_to_mrid": dict(sorted(self.ref_to_mrid.items())),
            "mrid_to_ref": dict(sorted(self.mrid_to_ref.items())),
            "lossy_fields": list(self.lossy_fields),
            "enm": self.enm,
        }

    def to_json(self) -> str:
        """Canonical JSON (sorted keys, no whitespace) — deterministic bytes."""
        return json.dumps(self.to_dict(), sort_keys=True, ensure_ascii=False, separators=(",", ":"))

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> CgmesRefMap:
        return cls(
            ref_to_mrid=dict(data.get("ref_to_mrid", {})),
            mrid_to_ref=dict(data.get("mrid_to_ref", {})),
            enm=dict(data.get("enm", {})),
            lossy_fields=tuple(data.get("lossy_fields", ())),
        )
