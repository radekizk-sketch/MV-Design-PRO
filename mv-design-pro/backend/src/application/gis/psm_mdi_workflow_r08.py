"""R08: import GeoJSON jako model roboczy GIS. Tylko syntetyki; brak mutacji ENM."""
from __future__ import annotations

import copy
import hashlib
import json
import math
import re
from dataclasses import dataclass, field
from typing import Any

ALLOWED_KINDS = {"station": "Point", "feeder": "Point", "cable": "LineString", "switch": "Point"}
SENSITIVE = {"pesel", "ppe", "email", "phone", "telefon", "nazwisko", "odbiorca", "klient", "customer_id", "meter_id"}
REQUIRED_FIELDS = ("id", "category", "name", "parent", "voltage_kv", "from_port", "to_port", "measurement")


class Rejected(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def require(condition: bool, code: str) -> None:
    if not condition:
        raise Rejected(code)


def hash_value(value: Any) -> str:
    data = json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False, separators=(",", ":"))
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def valid_point(value: Any) -> bool:
    return (
        type(value) is list and len(value) == 2
        and all(type(x) in (int, float) and math.isfinite(x) for x in value)
        and -180 <= value[0] <= 180 and -85 <= value[1] <= 85
    )


def valid_geom(kind: str, geom: Any) -> bool:
    if type(geom) is not dict or set(geom) != {"type", "coordinates"}:
        return False
    if geom["type"] != ALLOWED_KINDS.get(kind):
        return False
    p = geom["coordinates"]
    if kind != "cable":
        return valid_point(p)
    return (
        type(p) is list and 2 <= len(p) <= 10_000
        and all(valid_point(x) for x in p) and len({tuple(x) for x in p}) > 1
    )


def check_mapping(mapping: Any) -> dict[str, str]:
    require(type(mapping) is dict and set(mapping) == set(REQUIRED_FIELDS), "MAPPING_REQUIRED_FIELDS")
    require(
        all(type(value) is str and re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}", value)
            for value in mapping.values()), "MAPPING_INVALID_COLUMN",
    )
    require(len(set(mapping.values())) == len(mapping), "MAPPING_COLUMN_REUSED")
    return mapping


@dataclass(frozen=True)
class Issue:
    code: str
    severity: str
    asset_id: str | None
    description: str


@dataclass
class Draft:
    source_hash: str
    mapping_hash: str
    assets: dict[str, dict[str, Any]]
    baseline_hash: str
    revision: int = 0
    history: list[dict[str, Any]] = field(default_factory=list)
    status: str = "WERSJA_ROBOCZA"

    def snapshot(self) -> dict[str, Any]:
        return {
            "schema": "MV-PSM-MDI-R08", "source_hash": self.source_hash,
            "mapping_hash": self.mapping_hash, "revision": self.revision,
            "status": self.status, "assets": copy.deepcopy(self.assets),
        }

    def digest(self) -> str:
        return hash_value(self.snapshot())


def create_draft(fc: Any, *, mapping: Any, synthetic: bool, source_id: str) -> Draft:
    require(synthetic is True, "AUTHORIZED_DATA_REQUIRED")
    require(
        type(source_id) is str and re.fullmatch(r"SYN-[A-Za-z0-9_-]{1,80}", source_id),
        "SYNTHETIC_SOURCE_ID_REQUIRED",
    )
    m = check_mapping(mapping)
    require(
        type(fc) is dict and set(fc) == {"type", "features"}
        and fc["type"] == "FeatureCollection" and type(fc["features"]) is list
        and 0 < len(fc["features"]) <= 20_000, "FEATURE_COLLECTION_INVALID",
    )
    assets: dict[str, dict[str, Any]] = {}
    for feature in fc["features"]:
        require(
            type(feature) is dict and set(feature) == {"type", "geometry", "properties"}
            and feature["type"] == "Feature" and type(feature["properties"]) is dict,
            "FEATURE_INVALID",
        )
        props = feature["properties"]
        require(not any(str(k).casefold() in SENSITIVE for k in props), "SENSITIVE_PROPERTY_FORBIDDEN")
        require(set(m.values()).issubset(props), "MAPPING_FIELD_MISSING")
        oid = props[m["id"]]
        require(
            type(oid) is str and re.fullmatch(r"SYN-[A-Za-z0-9_-]{1,120}", oid)
            and oid not in assets, "ID_UNSAFE_OR_DUPLICATED",
        )
        kind = props[m["category"]]
        require(kind in ALLOWED_KINDS, "KIND_UNKNOWN")
        require(valid_geom(kind, feature["geometry"]), "GEOMETRY_INVALID")
        name, parent, from_port, to_port, measurement, voltage = (
            props[m[k]] for k in ("name", "parent", "from_port", "to_port", "measurement", "voltage_kv")
        )
        require(type(name) is str and 0 < len(name) <= 160, "NAME_INVALID")
        for value in (parent, from_port, to_port, measurement):
            require(value is None or (type(value) is str and len(value) <= 160), "REFERENCE_INVALID")
        require(
            voltage is None or (
                type(voltage) in (int, float) and math.isfinite(voltage) and 0 < voltage <= 30
            ), "VOLTAGE_INVALID",
        )
        assets[oid] = {
            "id": oid, "kind": kind, "name": name, "parent_id": parent,
            "voltage_kv": voltage, "source_geometry": copy.deepcopy(feature["geometry"]),
            "geometry": copy.deepcopy(feature["geometry"]),
            "port_refs_claimed": [from_port, to_port], "measurement_candidate": measurement,
            "topology_confirmed": False, "catalog_ref": None,
            "source_system": source_id, "enm_ref": None,
        }
    return Draft(
        source_hash=hash_value({"source_id": source_id, "geojson": fc}),
        mapping_hash=hash_value(m), assets=assets, baseline_hash=hash_value(assets),
    )


def hierarchy(draft: Draft) -> list[dict[str, Any]]:
    result = []
    for aid in sorted(draft.assets):
        item = draft.assets[aid]
        result.append({
            "id": aid, "name": item["name"], "kind": item["kind"],
            "parent_id": item["parent_id"],
            "child_count": sum(a["parent_id"] == aid for a in draft.assets.values()),
        })
    return result


def validate(draft: Draft) -> list[Issue]:
    issues: list[Issue] = []
    for aid in sorted(draft.assets):
        asset = draft.assets[aid]
        parent = asset["parent_id"]
        if parent is not None and parent not in draft.assets:
            issues.append(Issue("PARENT_MISSING", "BLOCKER", aid, "Brak obiektu nadrzędnego w eksporcie"))
        if parent == aid:
            issues.append(Issue("PARENT_SELF", "BLOCKER", aid, "Obiekt jest własnym rodzicem"))
        visited = {aid}
        current = parent
        while current is not None and current in draft.assets:
            if current in visited:
                issues.append(Issue("PARENT_CYCLE", "BLOCKER", aid, "Cykl hierarchii obiektów"))
                break
            visited.add(current)
            current = draft.assets[current]["parent_id"]
        if asset["kind"] in ("cable", "switch"):
            if any(not p for p in asset["port_refs_claimed"]):
                issues.append(Issue("PORT_REFS_MISSING", "BLOCKER", aid, "Brak jawnych końców połączenia"))
            else:
                issues.append(Issue("PORTS_UNVERIFIED", "BLOCKER", aid, "Identyfikatory końców nie zostały potwierdzone w ENM"))
            if not asset["catalog_ref"]:
                issues.append(Issue("CATALOG_UNMAPPED", "BLOCKER", aid, "Brak zweryfikowanego typu katalogowego"))
        if asset["voltage_kv"] is None:
            issues.append(Issue("VOLTAGE_UNKNOWN", "BLOCKER", aid, "Brak napięcia znamionowego"))
        if asset["measurement_candidate"] is not None:
            issues.append(Issue("MEASUREMENT_ONLY_CANDIDATE", "WARNING", aid, "Punkt pomiarowy wymaga przypisania i zatwierdzenia"))
        if not asset["topology_confirmed"]:
            issues.append(Issue("SOURCE_TOPOLOGY_UNVERIFIED", "BLOCKER", aid, "Mapa nie potwierdza topologii elektrycznej"))
    return issues


def edit_draft(
    draft: Draft, *, expected_revision: int, command_id: str,
    asset_id: str, patch: dict[str, Any],
) -> Draft:
    require(draft.status == "WERSJA_ROBOCZA", "DRAFT_CLOSED")
    require(expected_revision == draft.revision, "STALE_REVISION")
    require(
        type(command_id) is str and re.fullmatch(r"SYN-CMD-[0-9]{1,10}", command_id),
        "COMMAND_INVALID",
    )
    require(command_id not in {x["command_id"] for x in draft.history}, "COMMAND_DUPLICATE")
    require(asset_id in draft.assets, "ASSET_NOT_FOUND")
    require(
        type(patch) is dict and patch and set(patch).issubset({"name", "parent_id", "geometry"}),
        "PATCH_FIELDS_FORBIDDEN",
    )
    updated = copy.deepcopy(draft)
    obj = updated.assets[asset_id]
    if "name" in patch:
        require(type(patch["name"]) is str and 0 < len(patch["name"]) <= 160, "NAME_INVALID")
    if "parent_id" in patch:
        require(patch["parent_id"] is None or type(patch["parent_id"]) is str, "PARENT_INVALID")
    if "geometry" in patch:
        require(valid_geom(obj["kind"], patch["geometry"]), "GEOMETRY_INVALID")
    for key, value in patch.items():
        obj[key] = copy.deepcopy(value)
    updated.revision += 1
    updated.history.append({
        "command_id": command_id, "asset_id": asset_id,
        "patch_hash": hash_value(patch), "previous_digest": draft.digest(),
    })
    return updated


def discard(draft: Draft, *, expected_revision: int) -> Draft:
    require(expected_revision == draft.revision, "STALE_REVISION")
    updated = copy.deepcopy(draft)
    updated.status = "ODRZUCONA"
    updated.revision += 1
    return updated


def publication_preview(draft: Draft) -> dict[str, Any]:
    issues = validate(draft)
    return {
        "status": "NIE_DOPUSZCZONO_DO_PUBLIKACJI", "reason": "ENM_ADAPTER_MISSING",
        "can_publish": False, "can_mutate_enm": False,
        "draft_revision": draft.revision, "draft_digest": draft.digest(),
        "blockers": sum(a.severity == "BLOCKER" for a in issues),
        "issues": [issue.__dict__ for issue in issues], "domain_operations": [],
    }
