"""DIGPRO GIS R05 — fail-closed proposal review. No ENM mutation.
Built only with Python standard library; geometric preview is not an electrical length.
"""
from __future__ import annotations
import math
import re
from typing import Any

ENVELOPE = frozenset({
    "schema", "synthetic", "read_only_export", "enm_write_allowed",
    "electrical_topology_verified", "source_import_digest", "changes",
})
CHANGE = frozenset({
    "change_type", "id", "source_id", "geometry_before", "geometry_after",
    "approximate_length_m", "requires_topology_review", "requires_engineering_length_review",
})
SCHEMA = "MV-DIGPRO-GIS-GEOMETRY-PROPOSALS-V1"

class ProposalRejected(ValueError):
    """Safe reason code for refusing untrusted spatial data."""

def _require(condition: bool, error: str) -> None:
    if not condition:
        raise ProposalRejected(error)

def _point(raw: Any) -> bool:
    return (
        type(raw) is list and len(raw) == 2
        and all(type(v) in (float, int) and math.isfinite(v) for v in raw)
        and -180 <= raw[0] <= 180 and -85 <= raw[1] <= 85
    )

def _line(raw: Any) -> bool:
    return (
        type(raw) is dict and set(raw) == {"type", "coordinates"}
        and raw["type"] == "LineString" and type(raw["coordinates"]) is list
        and 2 <= len(raw["coordinates"]) <= 20_000
        and all(_point(p) for p in raw["coordinates"])
        and any(a != b for a, b in zip(raw["coordinates"], raw["coordinates"][1:]))
    )

def preview_length_m(line: dict[str, Any]) -> float:
    _require(_line(line), "INVALID_LINE_GEOMETRY")
    total = 0.0
    for a, b in zip(line["coordinates"], line["coordinates"][1:]):
        x1, y1 = math.radians(a[0]), math.radians(a[1])
        x2, y2 = math.radians(b[0]), math.radians(b[1])
        h = math.sin((y2 - y1) / 2) ** 2
        h += math.cos(y1) * math.cos(y2) * math.sin((x2 - x1) / 2) ** 2
        total += 2 * 6371008.8 * math.asin(min(1.0, math.sqrt(h)))
    return total

def verify_geometry_proposal(
    proposal: Any, *, source_digest: str,
    existing_lines: dict[str, dict[str, Any]], synthetic: bool = True,
) -> dict[str, Any]:
    """Return geometry-only review; never return electrical domain operations."""
    _require(type(proposal) is dict and set(proposal) == ENVELOPE, "INVALID_ENVELOPE")
    _require(proposal["schema"] == SCHEMA, "WRONG_SCHEMA")
    _require(synthetic and proposal["synthetic"] is True, "SYNTHETIC_ONLY")
    _require(
        proposal["read_only_export"] is True
        and proposal["enm_write_allowed"] is False
        and proposal["electrical_topology_verified"] is False,
        "ENM_FORBIDDEN",
    )
    _require(proposal["source_import_digest"] == source_digest, "DIGEST_MISMATCH")
    changes = proposal["changes"]
    _require(type(changes) is list and 0 < len(changes) <= 5000, "CHANGE_COUNT_INVALID")
    seen: set[str] = set()
    lengths: dict[str, float] = {}
    for row in changes:
        _require(type(row) is dict and set(row) == CHANGE, "INVALID_CHANGE_FIELDS")
        identity = row["id"]
        _require(
            type(identity) is str and 0 < len(identity) <= 256
            and identity not in seen, "INVALID_OR_DUPLICATE_ID",
        )
        _require(
            row["requires_topology_review"] is True
            and row["requires_engineering_length_review"] is True, "REVIEW_MISSING",
        )
        geometry = row["geometry_after"]
        length = preview_length_m(geometry)
        _require(math.isfinite(length) and length > 0, "ZERO_LENGTH")
        claimed = row["approximate_length_m"]
        _require(
            type(claimed) in (float, int) and math.isfinite(claimed)
            and abs(claimed - length) / length <= 0.02, "LENGTH_PREVIEW_MISMATCH",
        )
        if row["change_type"] == "EXISTING_ROUTE_GEOMETRY_REVIEW":
            original = existing_lines.get(identity)
            _require(
                original is not None and row["source_id"] == identity
                and row["geometry_before"] == original, "BASELINE_MISMATCH",
            )
            _require(geometry != original, "NO_GEOMETRY_CHANGE")
        elif row["change_type"] == "NEW_ROUTE_GEOMETRY_REVIEW":
            _require(
                re.fullmatch(r"LAB-DRAFT-[0-9]{4}", identity) is not None
                and identity not in existing_lines
                and row["source_id"] is None and row["geometry_before"] is None,
                "NEW_ROUTE_INVALID",
            )
        else:
            raise ProposalRejected("CHANGE_TYPE_FORBIDDEN")
        seen.add(identity)
        lengths[identity] = length
    return {
        "status": "DO_WERYFIKACJI_INZYNIERSKIEJ",
        "source_import_digest": source_digest, "ids": sorted(seen),
        "length_preview_m": {key: lengths[key] for key in sorted(lengths)},
        "electrical_length_m": None, "topology_verified": False,
        "can_write_to_enm": False, "domain_operations": [],
    }
