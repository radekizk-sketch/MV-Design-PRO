"""
Deterministic SHA-256 hashing for EnergyNetworkModel.

Canonical JSON: sorted keys, no whitespace, exclude mutable header fields.
"""

from __future__ import annotations

import hashlib
import json

from .models import EnergyNetworkModel


def compute_enm_hash(enm: EnergyNetworkModel) -> str:
    """Compute deterministic SHA-256 of ENM content.

    Excludes volatile fields: updated_at, created_at, hash_sha256, and element UUIDs (id).
    Content identity is based on ref_id + parameters, not random UUIDs.
    """
    data = enm.model_dump(
        mode="json",
        exclude={"header": {"updated_at", "created_at", "hash_sha256"}},
    )
    # Remove random 'id' fields from all element lists — ref_id is the stable identity
    for key in (
        "buses",
        "branches",
        "transformers",
        "sources",
        "loads",
        "generators",
        "substations",
        "bays",
        "junctions",
        "corridors",
        "branch_points",
        "measurements",
        "protection_assignments",
    ):
        if key in data:
            for item in data[key]:
                item.pop("id", None)
    canonical = json.dumps(
        data,
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
