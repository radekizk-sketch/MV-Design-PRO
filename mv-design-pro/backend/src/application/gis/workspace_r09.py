"""R09: wersjonowany warsztat GIS, niepowiązany z zapisem ENM.

Operacje to czyste odtworzenie dziennika poleceń na syntetycznym eksporcie R08.
Nie istnieje tu żadne polecenie publikacji.
"""
from __future__ import annotations

import copy
from typing import Any

from .psm_mdi_workflow_r08 import (
    Draft, Rejected, create_draft, edit_draft, hash_value, hierarchy,
    publication_preview, require, validate,
)

MAX_COMMANDS = 100
MAX_SELECTED_ID = 120


def _validate_command(command: Any) -> dict[str, Any]:
    require(type(command) is dict and set(command) == {
        "type", "expected_revision", "command_id", "asset_id", "patch"
    }, "COMMAND_SCHEMA_INVALID")
    require(command["type"] == "EDIT", "COMMAND_TYPE_FORBIDDEN")
    require(type(command["expected_revision"]) is int and command["expected_revision"] >= 0,
            "REVISION_INVALID")
    require(type(command["asset_id"]) is str and len(command["asset_id"]) <= MAX_SELECTED_ID,
            "ASSET_ID_INVALID")
    require(type(command["patch"]) is dict, "PATCH_INVALID")
    return command


def replay_workspace(
    geojson: Any, mapping: Any, source_id: str,
    *, synthetic: bool, commands: Any,
) -> tuple[Draft, Draft]:
    require(type(commands) is list and len(commands) <= MAX_COMMANDS, "COMMAND_COUNT_INVALID")
    baseline = create_draft(geojson, mapping=mapping, synthetic=synthetic, source_id=source_id)
    current = baseline
    for raw in commands:
        cmd = _validate_command(raw)
        current = edit_draft(
            current,
            expected_revision=cmd["expected_revision"],
            command_id=cmd["command_id"],
            asset_id=cmd["asset_id"],
            patch=cmd["patch"],
        )
    return baseline, current


def _attribute_snapshot(asset: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in asset.items() if key not in {"geometry", "source_geometry"}}


def diff_workspace(baseline: Draft, current: Draft) -> list[dict[str, Any]]:
    require(baseline.source_hash == current.source_hash, "DIFFERENT_SOURCE")
    changes: list[dict[str, Any]] = []
    for aid in sorted(set(baseline.assets) | set(current.assets)):
        before = baseline.assets.get(aid)
        after = current.assets.get(aid)
        if before is None or after is None:
            raise Rejected("OBJECT_SET_CHANGED")
        geometry_changed = before["geometry"] != after["geometry"]
        attributes_changed = _attribute_snapshot(before) != _attribute_snapshot(after)
        if not geometry_changed and not attributes_changed:
            continue
        changes.append({
            "id": aid,
            "change": (
                "GEOMETRY_AND_ATTRIBUTES" if geometry_changed and attributes_changed
                else "GEOMETRY" if geometry_changed else "ATTRIBUTES"
            ),
            "before_digest": hash_value(before),
            "after_digest": hash_value(after),
            "requires_topology_review": True,
            "requires_engineering_length_review": geometry_changed,
            "can_write_enm": False,
        })
    return changes


def geojson_projection(draft: Draft) -> dict[str, Any]:
    """Bezpieczny podgląd GeoJSON, bez atrybutów operatora i identyfikatorów portów."""
    features = []
    for aid, asset in sorted(draft.assets.items()):
        features.append({
            "type": "Feature", "id": aid,
            "geometry": copy.deepcopy(asset["geometry"]),
            "properties": {
                "id": aid, "name": asset["name"], "kind": asset["kind"],
                "parent_id": asset["parent_id"], "voltage_kv": asset["voltage_kv"],
                "topology_verified": False, "enm_write_allowed": False,
            },
        })
    return {"type": "FeatureCollection", "features": features}


def workspace_preview(
    geojson: Any, mapping: Any, source_id: str,
    *, synthetic: bool, commands: Any, selected_id: str | None = None,
) -> dict[str, Any]:
    baseline, current = replay_workspace(
        geojson, mapping, source_id, synthetic=synthetic, commands=commands,
    )
    require(selected_id is None or (type(selected_id) is str and selected_id in current.assets),
            "SELECTED_ASSET_NOT_FOUND")
    issues = validate(current)
    changes = diff_workspace(baseline, current)
    selected = copy.deepcopy(current.assets[selected_id]) if selected_id is not None else None
    return {
        "schema": "MV-GIS-WORKSPACE-R09",
        "source_hash": current.source_hash,
        "baseline_hash": baseline.baseline_hash,
        "baseline_digest": baseline.digest(),
        "draft_digest": current.digest(),
        "revision": current.revision,
        "history": copy.deepcopy(current.history),
        "changes": changes,
        "hierarchy": hierarchy(current),
        "geojson": geojson_projection(current),
        "selected": selected,
        "validation": {
            "blockers": sum(i.severity == "BLOCKER" for i in issues),
            "warnings": sum(i.severity == "WARNING" for i in issues),
            "issues": [i.__dict__ for i in issues],
        },
        "publication": publication_preview(current),
        "can_publish": False,
        "can_write_enm": False,
        "electrical_topology_verified": False,
    }
