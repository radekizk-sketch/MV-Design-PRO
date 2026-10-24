"""GPKG -> bezpieczny PODGLĄD GeoJSON WGS84. Brak modyfikacji ENM.

Wymaga geopandas i pyproj. Praca lokalna, bez sieci i bez telemetryki.
Źródła EPSG:2180 lub EPSG:2176..2179 (metry). Inne CRS są odrzucane.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any

import geopandas as gpd
import pandas as pd

MAX_BYTES = 150_000_000
MAX_FEATURES = 50_000
CRS_ALLOWED = {2180, 2176, 2177, 2178, 2179}
SAFE_ID = re.compile(r"^[\w:.-]{1,120}$", re.UNICODE)


class ImportGpkgRejected(ValueError):
    """Nazwana odmowa, bez danych źródłowych w komunikacie."""


def preview_gpkg(
    path: str | Path,
    *,
    layer: str,
    id_field: str,
    kind_field: str | None = None,
    allowed: tuple[str, ...] = ("Point", "LineString"),
) -> tuple[dict[str, Any], dict[str, Any]]:
    source = Path(path).resolve(strict=True)
    if not source.is_file() or source.suffix.lower() != ".gpkg" or source.stat().st_size > MAX_BYTES:
        raise ImportGpkgRejected("INVALID_SOURCE_FILE")
    if not layer or not id_field or not re.fullmatch(r"[\w. -]{1,120}", layer):
        raise ImportGpkgRejected("INVALID_LAYER_OR_ID_FIELD")
    if kind_field and kind_field.casefold() in {"pesel", "ppe", "email", "nazwisko", "odbiorca", "telefon"}:
        raise ImportGpkgRejected("SENSITIVE_CATEGORY_FIELD_FORBIDDEN")
    layers = set(gpd.list_layers(source)["name"].tolist())
    if layer not in layers:
        raise ImportGpkgRejected("LAYER_UNKNOWN")
    frame = gpd.read_file(source, layer=layer)
    if frame.crs is None or frame.crs.to_epsg() not in CRS_ALLOWED:
        raise ImportGpkgRejected("CRS_UNSUPPORTED_OR_UNKNOWN")
    epsg = frame.crs.to_epsg()
    if len(frame) > MAX_FEATURES or id_field not in frame.columns or (kind_field and kind_field not in frame.columns):
        raise ImportGpkgRejected("FEATURE_LIMIT_OR_COLUMN_MISSING")
    ids: set[str] = set()
    accepted: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for _, row in frame.iterrows():
        raw_id = row[id_field]
        fid = str(raw_id).strip() if raw_id is not None and not pd.isna(raw_id) else ""
        if not SAFE_ID.fullmatch(fid) or fid in ids:
            raise ImportGpkgRejected("INVALID_OR_DUPLICATED_ID")
        ids.add(fid)
        geom = row.geometry
        if geom is None or geom.is_empty or not geom.is_valid:
            raise ImportGpkgRejected("INVALID_GEOMETRY")
        if geom.has_z:
            raise ImportGpkgRejected("3D_REQUIRES_EXPLICIT_ENGINEERING_REVIEW")
        if geom.geom_type not in allowed:
            skipped.append({"id": fid, "reason": "UNSUPPORTED_GEOMETRY_TYPE", "type": geom.geom_type})
            continue
        if geom.geom_type == "LineString" and geom.length == 0:
            raise ImportGpkgRejected("ZERO_LENGTH_LINE")
        geometry_wgs = gpd.GeoSeries([geom], crs=frame.crs).to_crs(epsg=4326).iloc[0]
        from shapely.geometry import mapping
        geo = mapping(geometry_wgs)
        if geom.geom_type == "LineString":
            coords = [list(p) for p in geo["coordinates"]]
        else:
            coords = list(geo["coordinates"])
        coords_list = coords if geom.geom_type == "LineString" else [coords]
        if any(not (math.isfinite(x) and math.isfinite(y) and -180 <= x <= 180 and -85 <= y <= 85)
               for x, y in coords_list):
            raise ImportGpkgRejected("WGS84_COORDINATE_INVALID")
        obj_type = str(row[kind_field]).strip() if kind_field else ("linia" if geom.geom_type == "LineString" else "punkt")
        if not re.fullmatch(r"[\w .-]{1,60}", obj_type):
            raise ImportGpkgRejected("CATEGORY_UNSAFE_OR_UNMAPPED")
        accepted.append({"type": "Feature", "id": fid,
                         "geometry": {"type": geom.geom_type, "coordinates": coords},
                         "properties": {"id": fid, "name": fid, "kind": obj_type}})
    accepted.sort(key=lambda f: f["id"])
    skipped.sort(key=lambda f: f["id"])
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    manifest = {
        "schema": "MV-GIS-GPKG-PREVIEW-R12", "source_sha256": digest,
        "source_epsg": epsg, "output_epsg": 4326,
        "source_layer": layer, "id_column": id_field,
        "source_count": len(frame), "accepted_count": len(accepted), "skipped_count": len(skipped),
        "skipped": skipped,
        "electrical_topology_verified": False,
        "electrical_length_verified": False,
        "can_write_to_enm": False,
        "notes": ["Pominięte obiekty wymagają oddzielnego przeglądu.",
                  "Długość planarna nie jest długością elektryczną.",
                  "Zgodność identyfikatorów z ENM musi być potwierdzona."],
    }
    return {"type": "FeatureCollection", "features": accepted}, manifest


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Lokalny, kontrolowany podgląd GPKG (nie ENM)")
    parser.add_argument("--source", required=True)
    parser.add_argument("--layer", required=True)
    parser.add_argument("--id-field", required=True)
    parser.add_argument("--kind-field")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    geojson, manifest = preview_gpkg(args.source, layer=args.layer, id_field=args.id_field,
                                     kind_field=args.kind_field)
    out = Path(args.output)
    out.write_text(json.dumps(geojson, ensure_ascii=False, indent=2), encoding="utf-8")
    out.with_suffix(".manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"accepted":manifest["accepted_count"],"skipped":manifest["skipped_count"],
                      "sha256":manifest["source_sha256"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
