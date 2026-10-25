"""Izolowany import SHP/DBF z DIGPRO/dpPower → GeoJSON, bez operacji ENM.

Wymagany zestaw .shp/.shx/.dbf/.prj, CRS PL-1992 lub PL-2000.
Źródłowe identyfikatory nie stanowią PortRef. Nie wyznacza połączeń elektrycznych.
"""
from __future__ import annotations

from hashlib import sha256
from pathlib import Path
import json
import math
import re
from typing import Any

import geopandas as gpd
import pandas as pd
from shapely.geometry import mapping

SAFE_ID = re.compile(r"^[\w:.-]{1,120}$", re.UNICODE)
ALLOWED_EPSG = {2180, 2176, 2177, 2178, 2179}
PARTS = (".dbf", ".prj", ".shp", ".shx")
MAX_SOURCE_SIZE = 150_000_000
MAX_FEATURES = 50_000


class ImportShpRejected(ValueError):
    """Odmowa bez danych i ścieżki źródłowej w komunikacie."""


def preview_shp(
    source: str | Path, *, id_field: str, kind_field: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    shp = Path(source).resolve(strict=True)
    if shp.suffix.lower() != ".shp" or not id_field or not shp.is_file():
        raise ImportShpRejected("SOURCE_INVALID")
    files = [shp.with_suffix(s) for s in PARTS]
    if not all(p.is_file() for p in files):
        raise ImportShpRejected("SHP_COMPANION_FILE_MISSING")
    if sum(p.stat().st_size for p in files) > MAX_SOURCE_SIZE:
        raise ImportShpRejected("SOURCE_TOO_LARGE")
    if kind_field and kind_field.lower() in {
        "ppe", "pesel", "telefon", "nazwisko", "odbiorca", "email"
    }:
        raise ImportShpRejected("SENSITIVE_KIND_FIELD")

    # Fingerprint CAŁEGO eksportu SHP/DBF/PRJ/SHX, nie samej geometrii.
    digest = sha256()
    for path in files:
        digest.update(path.suffix.lower().encode("ascii") + b"\0")
        digest.update(path.read_bytes())
    frame = gpd.read_file(shp)
    if frame.crs is None or frame.crs.to_epsg() not in ALLOWED_EPSG:
        raise ImportShpRejected("CRS_UNSUPPORTED_OR_MISSING")
    epsg = frame.crs.to_epsg()
    if (
        len(frame) > MAX_FEATURES
        or id_field not in frame.columns
        or (kind_field and kind_field not in frame.columns)
    ):
        raise ImportShpRejected("LAYER_OR_COLUMN_INVALID")

    features: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    ids: set[str] = set()
    for _, row in frame.iterrows():
        raw_id = row[id_field]
        name = str(raw_id).strip() if raw_id is not None and not pd.isna(raw_id) else ""
        if not SAFE_ID.fullmatch(name) or name in ids:
            raise ImportShpRejected("INVALID_OR_DUPLICATE_ID")
        ids.add(name)
        geometry = row.geometry
        if geometry is None or geometry.is_empty or not geometry.is_valid:
            raise ImportShpRejected("INVALID_GEOMETRY")
        if geometry.has_z:
            raise ImportShpRejected("GEOMETRY_3D_REQUIRES_REVIEW")
        if geometry.geom_type not in ("Point", "LineString"):
            skipped.append({
                "id": name, "type": geometry.geom_type, "reason": "GEOMETRY_NOT_ELECTRICAL_ASSET"
            })
            continue
        if geometry.geom_type == "LineString" and geometry.length <= 0:
            raise ImportShpRejected("ZERO_LENGTH_LINE")
        converted = gpd.GeoSeries([geometry], crs=frame.crs).to_crs(epsg=4326).iloc[0]
        geom = mapping(converted)
        coords = (
            [list(c) for c in geom["coordinates"]]
            if geometry.geom_type == "LineString"
            else list(geom["coordinates"])
        )
        vectors = coords if geometry.geom_type == "LineString" else [coords]
        if any(
            not (
                math.isfinite(x)
                and math.isfinite(y)
                and -180 <= x <= 180
                and -85 <= y <= 85
            )
            for x, y in vectors
        ):
            raise ImportShpRejected("WGS84_OUT_OF_RANGE")
        kind = (
            str(row[kind_field]).strip()
            if kind_field
            else ("linia" if geometry.geom_type == "LineString" else "punkt")
        )
        if not re.fullmatch(r"[\w .-]{1,60}", kind):
            raise ImportShpRejected("CATEGORY_INVALID")
        features.append({
            "type": "Feature", "id": name,
            "geometry": {"type": geometry.geom_type, "coordinates": coords},
            "properties": {"id": name, "name": name, "kind": kind},
        })
    features.sort(key=lambda f: f["id"])
    skipped.sort(key=lambda f: f["id"])
    manifest = {
        "schema": "MV-DIGPRO-SHP-PREVIEW-R13",
        "source_format": "SHP",
        "source_sha256": digest.hexdigest(),
        "source_epsg": epsg,
        "output_epsg": 4326,
        "source_layer": shp.stem,
        "id_column": id_field,
        "source_count": len(frame),
        "accepted_count": len(features),
        "skipped_count": len(skipped),
        "skipped": skipped,
        "can_write_to_enm": False,
        "electrical_topology_verified": False,
        "electrical_length_verified": False,
        "warning": (
            "Eksport może być przycięty do widoku lub niepełny; "
            "zatwierdzenie zakresu osobno."
        ),
    }
    return {"type": "FeatureCollection", "features": features}, manifest


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Izolowany import SHP/DBF z DIGPRO")
    parser.add_argument("--source", required=True)
    parser.add_argument("--id-field", required=True)
    parser.add_argument("--kind-field")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    geo, manifest = preview_shp(
        args.source, id_field=args.id_field, kind_field=args.kind_field
    )
    out = Path(args.output)
    out.write_text(json.dumps(geo, ensure_ascii=False, indent=2), encoding="utf-8")
    out.with_suffix(".manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({
        "accepted": manifest["accepted_count"],
        "skipped": manifest["skipped_count"],
        "source_sha256": manifest["source_sha256"],
    }))


if __name__ == "__main__":
    main()
