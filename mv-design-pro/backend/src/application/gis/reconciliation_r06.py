"""R06: deterministyczne porównanie projekcji GIS DIGPRO. Nie dotyka ENM/solwerów."""
from __future__ import annotations

import hashlib
import json
import math
from typing import Any

MAX_FEATURES = 20_000
BLOCKED_PROPERTIES = frozenset({
    "pesel", "ppe", "email", "telefon", "phone", "nazwisko",
    "imie", "odbiorca", "klient", "customer_id", "nr_licznika",
})
TYPES = {"line_sn": "LineString", "station": "Point", "switch": "Point", "pole": "Point"}


class OdmowaGIS(ValueError):
    """Kod przyczyny odmowy, bez odbicia wrażliwego ładunku zewnętrznego."""


def _hash(value: Any) -> str:
    s = json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False, separators=(",", ":"))
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _point(p: Any) -> bool:
    return (
        type(p) is list
        and len(p) == 2
        and all(type(n) in (float, int) and math.isfinite(n) for n in p)
        and -180 <= p[0] <= 180
        and -85 <= p[1] <= 85
    )


def _length(coords: list[list[float]]) -> float:
    """Wyłącznie podgląd GIS; NIE długość elektryczna."""
    total = 0.0
    for a, b in zip(coords, coords[1:]):
        x1, y1, x2, y2 = map(math.radians, (a[0], a[1], b[0], b[1]))
        h = math.sin((y2 - y1) / 2) ** 2
        h += math.cos(y1) * math.cos(y2) * math.sin((x2 - x1) / 2) ** 2
        total += 2 * 6371008.8 * math.asin(min(1.0, math.sqrt(h)))
    return total


def check_geojson(fc: Any) -> dict[str, dict[str, Any]]:
    if type(fc) is not dict or fc.get("type") != "FeatureCollection" or type(fc.get("features")) is not list:
        raise OdmowaGIS("INVALID_FEATURE_COLLECTION")
    if len(fc["features"]) > MAX_FEATURES:
        raise OdmowaGIS("TOO_MANY_FEATURES")
    found = {}
    for feat in fc["features"]:
        if type(feat) is not dict or feat.get("type") != "Feature" or type(feat.get("properties")) is not dict:
            raise OdmowaGIS("INVALID_FEATURE")
        attr = feat["properties"]
        if any(str(k).casefold() in BLOCKED_PROPERTIES for k in attr):
            raise OdmowaGIS("SENSITIVE_FIELD")
        fid = feat.get("id")
        if not isinstance(fid, str) or not fid or len(fid) > 256 or fid in found or fid != attr.get("identity"):
            raise OdmowaGIS("INVALID_OR_DUPLICATED_ID")
        if attr.get("source_locked") is not True or attr.get("electrical_connection_confirmed") is not False:
            raise OdmowaGIS("MISSING_SOURCE_GUARD")
        geom = feat.get("geometry")
        expected = TYPES.get(attr.get("category"))
        if expected is None or type(geom) is not dict or geom.get("type") != expected:
            raise OdmowaGIS("UNSUPPORTED_GEOMETRY")
        coords = geom.get("coordinates")
        if expected == "LineString":
            if (
                type(coords) is not list
                or not 2 <= len(coords) <= 20_000
                or not all(_point(p) for p in coords)
                or len({tuple(p) for p in coords}) < 2
            ):
                raise OdmowaGIS("INVALID_LINE")
        elif not _point(coords):
            raise OdmowaGIS("INVALID_POINT")
        found[fid] = feat
    return found


def compare_digpro(
    before: Any,
    after: Any,
    *,
    before_digest: str,
    after_digest: str,
    scope_equal: bool = False,
) -> dict[str, Any]:
    """Brak obiektu => NIEOBSERWOWANY, nigdy usunięty. Zero mutacji ENM."""
    for digest in (before_digest, after_digest):
        if not isinstance(digest, str) or len(digest) != 64 or any(ch not in "0123456789abcdef" for ch in digest):
            raise OdmowaGIS("INVALID_SOURCE_DIGEST")
    left, right = check_geojson(before), check_geojson(after)
    counts = dict.fromkeys(
        ("GEOMETRY_CHANGE", "ATTRIBUTES_CHANGE", "GEOMETRY_AND_ATTRIBUTES_CHANGE",
         "NEW_CANDIDATE", "NOT_OBSERVED", "UNCHANGED"),
        0,
    )
    items = []
    for fid in sorted(left.keys() | right.keys()):
        first, second = left.get(fid), right.get(fid)
        if first is None:
            state = "NEW_CANDIDATE"
        elif second is None:
            state = "NOT_OBSERVED"
        else:
            geo_changed = first["geometry"] != second["geometry"]

            def source_attrs(feat: dict[str, Any]) -> dict[str, Any]:
                ignored = {"status", "measured_2180_m", "source_locked", "electrical_connection_confirmed"}
                return {key: value for key, value in feat["properties"].items() if key not in ignored}

            attr_changed = source_attrs(first) != source_attrs(second)
            state = ("GEOMETRY_AND_ATTRIBUTES_CHANGE" if geo_changed and attr_changed
                     else "GEOMETRY_CHANGE" if geo_changed else "ATTRIBUTES_CHANGE" if attr_changed
                     else "UNCHANGED")
        counts[state] += 1
        asset = second or first
        row = {
            "id": fid, "category": asset["properties"]["category"], "status": state,
            "requires_review": state != "UNCHANGED",
            "can_delete_from_enm": False,
            "can_apply_electric_topology": False,
        }
        if first and first["geometry"]["type"] == "LineString":
            row["before_preview_m"] = round(_length(first["geometry"]["coordinates"]), 3)
        if second and second["geometry"]["type"] == "LineString":
            row["after_preview_m"] = round(_length(second["geometry"]["coordinates"]), 3)
        if "before_preview_m" in row and "after_preview_m" in row:
            row["delta_preview_m"] = round(row["after_preview_m"] - row["before_preview_m"], 3)
        items.append(row)
    payload = {
        "schema": "MV-DIGPRO-RECONCILIATION-R06", "before_digest": before_digest,
        "after_digest": after_digest, "scope_equal": scope_equal, "counts": counts,
        "elements": items, "source_geometry_only": True,
        "electrical_topology_verified": False,
        "electric_lengths_verified": False, "enm_write_allowed": False,
    }
    return {**payload, "report_sha256": _hash(payload)}
