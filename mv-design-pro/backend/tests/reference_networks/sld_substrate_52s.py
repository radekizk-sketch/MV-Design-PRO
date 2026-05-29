"""
SLD Substrate Builder — ≥52-station MV network for SLD render testing (M-05).

Builds a deterministic MV network:
  - GPZ 15 kV / 250 MVA
  - Trunk magistrala: 22 segments (mix cable + overhead)
  - 12 trunk stations (type C with LINIA_ODG bay for laterals)
  - Laterals from every trunk station: 2-3 lateral stations each
  - Total ≥52 MV substations
  - All DER chain types (V-10):
      PV  via nn_side (PV-through-transformer: PV inverter on LV bus of SN/LV transformer)
      BESS via nn_side (bidirectional)
      FW   via nn_side (full-converter PMSG/DFIG/SCIG family)
      mixed configs (multiple DER at same station)
  - Deterministic: same seed → same SHA-256 hash
  - Valid: passes ENMValidator (no fatal issues)
  - Loadable: can be served via GET /api/cases/{case_id}/enm

Root-cause notes (M-05 recon):
  Bug 1 — add_converter_source der=0 (STAN_REPO §2, line V-10):
      The JS script generate-large-network.mjs used an invalid catalog ref
      ('inv-pv-1500' in namespace 'FALOWNIK') — neither exists in the catalog.
      _resolve_converter_catalog_ref returns None for this ref, causing the
      operation to return error "converter.source_technology_missing" (or similar),
      incrementing counts.derFail instead of counts.der → der=0.
      Fix: this Python builder uses only verified catalog refs:
          PV  nn_side → conv-pv-nn-0p5mw-0p4kv  (ZRODLO_NN_PV, 0.5 MW, 0.4 kV)
          BESS nn_side → conv-bess-nn-0p5mw-0p4kv (ZRODLO_NN_BESS, 0.5 MW, 0.4 kV)
          FW  nn_side → conv-wind-nn-2mw-0p4kv   (CONVERTER, 2 MW, 0.4 kV)
      Stations with FW use a 2500 kVA transformer (FW 2MW > 630 kVA capacity limit).

  Bug 2 — lateral collapse branch≈1:
      The JS script correctly calls start_branch_segment_sn with from_ref pointing
      to the FEEDER bay port. When tested in Python, this works fine. The
      apparent branch≈1 in JS runs was a consequence of the same catalog error
      chain — DER failures caused stations to be miscounted or the lateral loop
      to exit early. This builder avoids that by: (a) using explicit field_role
      dicts throughout, (b) verified catalog refs, and (c) _try_op defensive
      wrapping so a single station failure does not abort the whole build.

How to invoke:
    from tests.reference_networks.sld_substrate_52s import build_sld_substrate_52s
    result = build_sld_substrate_52s()
    # result['enm']           — raw ENM dict (ready for EnergyNetworkModel.model_validate)
    # result['station_count'] — number of MV substations (target ≥52)
    # result['branch_count']  — number of cable/line branches (target ≫1)
    # result['lateral_count'] — number of lateral corridors (target ≥12)
    # result['der_count']     — number of DER generators (target >0, covers all types)
    # result['der_types']     — set of gen_type values: pv_inverter, bess, wind_inverter
    # result['snapshot_hash'] — deterministic SHA-256 hex

How the frontend loads it:
    1. EnergyNetworkModel.model_validate(result['enm'])
    2. _set_enm(case_id, enm_model)
    3. Frontend: GET /api/cases/{case_id}/enm
    4. topologyInputReader.readTopologyFromEnm(enm) → TopologyInputV1
    5. SLD pipeline renders from TopologyInputV1
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

# ---------------------------------------------------------------------------
# Catalog constants (verified against mv_converter_catalog.py + mv_transformer_catalog.py)
# ---------------------------------------------------------------------------

_CABLE_REF = "cable-tfk-yakxs-3x120"
_LINE_REF = "line-base-al-120"  # overhead line 120 mm² Al
_GPZ_SOURCE_REF = "src-gpz-15kv-250mva-rx010"
_TRAFO_STANDARD = "tr-sn-nn-15-04-630kva-dyn11"  # 630 kVA — standard load station
_TRAFO_DER_LARGE = "tr-sn-nn-15-04-2500kva-dyn11"  # 2500 kVA — FW/large-DER station

# DER catalog refs — all nn_side variant, all at 0.4 kV (verified in catalog)
# Capacity check: PV 0.5MW < 630 kVA OK; BESS 0.5MW < 630 kVA OK; FW 2MW > 630 kVA → needs 2500 kVA
_PV_CATALOG_REF = "conv-pv-nn-0p5mw-0p4kv"
_PV_NAMESPACE = "ZRODLO_NN_PV"
_BESS_CATALOG_REF = "conv-bess-nn-0p5mw-0p4kv"
_BESS_NAMESPACE = "ZRODLO_NN_BESS"
_FW_CATALOG_REF = "conv-wind-nn-2mw-0p4kv"
_FW_NAMESPACE = "CONVERTER"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _canonical_json(data: Any) -> str:
    return json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _snapshot_hash(enm: dict[str, Any]) -> str:
    return hashlib.sha256(_canonical_json(enm).encode("utf-8")).hexdigest()


def _empty_enm() -> dict[str, Any]:
    return {
        "header": {"name": "SLD Substrate 52 stacji", "revision": 0, "defaults": {}},
        "buses": [],
        "branches": [],
        "transformers": [],
        "sources": [],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
    }


def _op(enm: dict[str, Any], op_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Execute domain op; raise AssertionError on failure."""
    from enm.domain_operations import execute_domain_operation

    result = execute_domain_operation(enm_dict=enm, op_name=op_name, payload=payload)
    if result.get("error"):
        raise AssertionError(
            f"Domain op '{op_name}' failed: {result['error']} " f"(code={result.get('error_code')})"
        )
    snapshot = result.get("snapshot")
    if snapshot is None:
        raise AssertionError(f"Domain op '{op_name}' returned no snapshot")
    return snapshot


def _try_op(
    enm: dict[str, Any], op_name: str, payload: dict[str, Any]
) -> tuple[dict[str, Any], str | None]:
    """Execute domain op; return (new_enm, None) or (old_enm, error)."""
    from enm.domain_operations import execute_domain_operation

    result = execute_domain_operation(enm_dict=enm, op_name=op_name, payload=payload)
    if result.get("error"):
        return enm, result["error"]
    snapshot = result.get("snapshot")
    if snapshot is None:
        return enm, "no snapshot returned"
    return snapshot, None


def _feeder_port_ref(enm: dict[str, Any], station_ref: str) -> str | None:
    """Return the BRANCH port ref for the FEEDER (LINIA_ODG) bay."""
    for stn in enm.get("substations", []):
        if stn.get("ref_id") != station_ref:
            continue
        for spec in stn.get("meta", {}).get("field_specs", []):
            role = str(spec.get("field_role") or spec.get("bay_role") or "").upper()
            if role in ("LINIA_ODG", "FEEDER"):
                field_ref = spec.get("field_ref")
                if field_ref:
                    return f"{field_ref}.BRANCH"
    return None


def _nn_bus_ref(enm: dict[str, Any], station_ref: str) -> str | None:
    """Return the LV (nN, <1 kV) bus ref of a station."""
    for stn in enm.get("substations", []):
        if stn.get("ref_id") != station_ref:
            continue
        for bus_ref in stn.get("bus_refs", []):
            for bus in enm.get("buses", []):
                if bus.get("ref_id") == bus_ref and (bus.get("voltage_kv") or 99) < 1.0:
                    return bus_ref
    return None


def _latest_station_ref(enm: dict[str, Any]) -> str | None:
    """Return ref_id of the last station in the ENM list."""
    stations = [
        s["ref_id"] for s in enm.get("substations", []) if "/station" in s.get("ref_id", "")
    ]
    return stations[-1] if stations else None


def _add_trunk_station(
    enm: dict[str, Any],
    segment_ref: str,
    name: str,
    trafo_ref: str = _TRAFO_STANDARD,
) -> dict[str, Any]:
    """Insert a type-C station with LINIA_ODG bay on a trunk segment."""
    return _op(
        enm,
        "insert_station_on_segment_sn",
        {
            "segment_id": segment_ref,
            "insert_at": {"mode": "RATIO", "value": 0.5},
            "station": {
                "station_type": "C",
                "station_name": name,
                "sn_voltage_kv": 15.0,
                "nn_voltage_kv": 0.4,
            },
            "sn_fields": [
                {"field_role": "LINIA_IN"},
                {"field_role": "LINIA_OUT"},
                {"field_role": "LINIA_ODG"},
                {"field_role": "TRANSFORMATOROWE"},
            ],
            "transformer": {
                "create": True,
                "transformer_catalog_ref": trafo_ref,
            },
            "nn_block": {"outgoing_feeders_nn_count": 2},
        },
    )


def _cable_segment_refs(enm: dict[str, Any]) -> list[str]:
    """Return all cable/overhead segment ref_ids."""
    return [
        b["ref_id"] for b in enm.get("branches", []) if b.get("type") in ("cable", "line_overhead")
    ]


def _add_der(
    enm: dict[str, Any],
    station_ref: str,
    technology: str,
    catalog_ref: str,
    catalog_namespace: str,
    power_mw: float,
    name: str,
) -> tuple[dict[str, Any], str | None]:
    """Add a DER on nn_side of a station.  Returns (new_enm, None) or (old_enm, error)."""
    nn_ref = _nn_bus_ref(enm, station_ref)
    if nn_ref is None:
        return enm, f"No nN bus on station {station_ref}"
    return _try_op(
        enm,
        "add_converter_source",
        {
            "source_technology": technology,
            "connection_variant": "nn_side",
            "station_ref": station_ref,
            "bus_nn_ref": nn_ref,
            "catalog_ref": catalog_ref,
            "catalog_binding": {
                "catalog_namespace": catalog_namespace,
                "catalog_item_id": catalog_ref,
                "catalog_item_version": "2024.1",
            },
            "power_setpoint_mw": power_mw,
            "source_name": name,
        },
    )


# ---------------------------------------------------------------------------
# Main builder
# ---------------------------------------------------------------------------


def build_sld_substrate_52s() -> dict[str, Any]:  # noqa: C901 — acceptable complexity
    """Build deterministic ≥52-station MV network for SLD render testing.

    Station target: ≥52 (12 trunk + ≥40 lateral; each trunk station contributes 2-3).
    DER target: all 3 types present (pv_inverter, bess, wind_inverter) + mixed configs.
    Branch target: ≫1 (22 trunk + 12 laterals × ~3 segments + splits).
    Deterministic: identical SHA-256 on repeated calls (no random, no time-based IDs).
    """
    enm = _empty_enm()

    # -----------------------------------------------------------------------
    # 1. GPZ / HV source
    # -----------------------------------------------------------------------
    enm = _op(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "source_name": "GPZ Referencyjny 15 kV",
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_ref": _GPZ_SOURCE_REF,
        },
    )

    # -----------------------------------------------------------------------
    # 2. Trunk magistrala — 22 segments (mix cable + overhead)
    # -----------------------------------------------------------------------
    TRUNK_SPECS = [
        ("KABEL", 250, _CABLE_REF),
        ("KABEL", 210, _CABLE_REF),
        ("KABEL", 280, _CABLE_REF),
        ("KABEL", 190, _CABLE_REF),
        ("NAPOWIETRZNA", 320, _LINE_REF),
        ("KABEL", 230, _CABLE_REF),
        ("KABEL", 200, _CABLE_REF),
        ("KABEL", 270, _CABLE_REF),
        ("KABEL", 180, _CABLE_REF),
        ("NAPOWIETRZNA", 350, _LINE_REF),
        ("KABEL", 220, _CABLE_REF),
        ("KABEL", 260, _CABLE_REF),
        ("KABEL", 200, _CABLE_REF),
        ("KABEL", 240, _CABLE_REF),
        ("NAPOWIETRZNA", 300, _LINE_REF),
        ("KABEL", 190, _CABLE_REF),
        ("KABEL", 230, _CABLE_REF),
        ("KABEL", 210, _CABLE_REF),
        ("KABEL", 250, _CABLE_REF),
        ("NAPOWIETRZNA", 280, _LINE_REF),
        ("KABEL", 200, _CABLE_REF),
        ("KABEL", 220, _CABLE_REF),
    ]
    for idx, (rodzaj, length_m, cat_ref) in enumerate(TRUNK_SPECS):
        enm = _op(
            enm,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": rodzaj,
                    "dlugosc_m": length_m,
                    "name": f"Magistrala {idx + 1}",
                    "catalog_ref": cat_ref,
                },
            },
        )

    # -----------------------------------------------------------------------
    # 3. 12 trunk stations spread across the trunk
    # -----------------------------------------------------------------------
    # Stations at index {2,5,8,11} get a 2500 kVA transformer (for FW 2MW DER).
    FW_STATION_INDICES = {2, 5, 8, 11}

    trunk_station_refs: list[str] = []
    for i in range(12):
        segs = _cable_segment_refs(enm)
        if not segs:
            break
        # Spread insertions: pick proportionally into remaining segments.
        # After each insert, segments split — use integer division with offset.
        n_segs = len(segs)
        target_frac = (i + 1) / 13.0  # evenly space 12 stations
        seg_idx = max(0, min(n_segs - 1, int(target_frac * n_segs)))
        seg_ref = segs[seg_idx]

        trafo = _TRAFO_DER_LARGE if i in FW_STATION_INDICES else _TRAFO_STANDARD
        enm = _add_trunk_station(enm, seg_ref, f"Stacja T{i + 1}", trafo_ref=trafo)
        ref = _latest_station_ref(enm)
        if ref:
            trunk_station_refs.append(ref)

    # -----------------------------------------------------------------------
    # 4. Laterals: 2-3 stations per trunk station
    # -----------------------------------------------------------------------
    # Lateral station counts per trunk station (deterministic pattern, 4-5 per lateral)
    LATERAL_SIZES = [3, 4, 3, 3, 4, 3, 4, 3, 3, 4, 3, 4]
    lateral_station_refs: list[str] = []
    lateral_count = 0

    for i, trunk_stn_ref in enumerate(trunk_station_refs):
        feeder_port = _feeder_port_ref(enm, trunk_stn_ref)
        if feeder_port is None:
            continue

        # Start the lateral branch from the FEEDER bay port
        enm, err = _try_op(
            enm,
            "start_branch_segment_sn",
            {
                "from_ref": feeder_port,
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 180,
                    "catalog_ref": _CABLE_REF,
                },
            },
        )
        if err:
            continue
        lateral_count += 1

        # Add stations along the lateral — always insert on the last segment
        n_lat = LATERAL_SIZES[i % len(LATERAL_SIZES)]
        for k in range(n_lat):
            segs = _cable_segment_refs(enm)
            if not segs:
                break
            seg_ref = segs[-1]
            enm, err2 = _try_op(
                enm,
                "insert_station_on_segment_sn",
                {
                    "segment_id": seg_ref,
                    "insert_at": {"mode": "RATIO", "value": 0.5},
                    "station": {
                        "station_type": "B",
                        "station_name": f"Stacja L{i + 1}-{k + 1}",
                        "sn_voltage_kv": 15.0,
                        "nn_voltage_kv": 0.4,
                    },
                    "sn_fields": [
                        {"field_role": "LINIA_IN"},
                        {"field_role": "LINIA_OUT"},
                        {"field_role": "TRANSFORMATOROWE"},
                    ],
                    "transformer": {
                        "create": True,
                        "transformer_catalog_ref": _TRAFO_STANDARD,
                    },
                    "nn_block": {"outgoing_feeders_nn_count": 2},
                },
            )
            if err2:
                break
            ref = _latest_station_ref(enm)
            if ref:
                lateral_station_refs.append(ref)

    # -----------------------------------------------------------------------
    # 5. DER chains (V-10) — PV, BESS, FW, mixed configs
    # -----------------------------------------------------------------------
    der_errors: list[str] = []

    def attach(stn: str, tech: str, cat: str, ns: str, p: float, name: str) -> None:
        nonlocal enm
        new_enm, err = _add_der(enm, stn, tech, cat, ns, p, name)
        if err:
            der_errors.append(f"{stn}/{tech}: {err}")
        else:
            enm = new_enm

    # (a) PV via nn_side on trunk stations 0, 3, 6, 9
    for idx in [0, 3, 6, 9]:
        if idx < len(trunk_station_refs):
            attach(
                trunk_station_refs[idx], "PV", _PV_CATALOG_REF, _PV_NAMESPACE, 0.5, f"PV_T{idx+1}"
            )

    # (b) BESS via nn_side on trunk stations 1, 4, 7, 10
    for idx in [1, 4, 7, 10]:
        if idx < len(trunk_station_refs):
            attach(
                trunk_station_refs[idx],
                "BESS",
                _BESS_CATALOG_REF,
                _BESS_NAMESPACE,
                0.5,
                f"BESS_T{idx+1}",
            )

    # (c) FW via nn_side on trunk stations 2, 5, 8, 11 (2500 kVA trafo, FW 2MW = 2000 kW < 2500 kVA OK)
    for idx in [2, 5, 8, 11]:
        if idx < len(trunk_station_refs):
            attach(
                trunk_station_refs[idx], "FW", _FW_CATALOG_REF, _FW_NAMESPACE, 2.0, f"FW_T{idx+1}"
            )

    # (d) Mixed configs — PV + BESS at last 4 lateral-tip stations
    mixed_stns = (
        lateral_station_refs[-4:] if len(lateral_station_refs) >= 4 else lateral_station_refs
    )
    for i, stn_ref in enumerate(mixed_stns):
        attach(stn_ref, "PV", _PV_CATALOG_REF, _PV_NAMESPACE, 0.5, f"MIX_PV_{i+1}")
        attach(stn_ref, "BESS", _BESS_CATALOG_REF, _BESS_NAMESPACE, 0.5, f"MIX_BESS_{i+1}")

    # -----------------------------------------------------------------------
    # 6. Metrics
    # -----------------------------------------------------------------------
    substations = [s for s in enm.get("substations", []) if "/station" in s.get("ref_id", "")]
    station_count = len(substations)
    branch_count = len(_cable_segment_refs(enm))

    generators = enm.get("generators", [])
    der_count = len(generators)
    der_types = {g.get("gen_type") for g in generators if g.get("gen_type")}

    corridors = enm.get("corridors", [])
    lateral_corridors = [
        c for c in corridors if c.get("branch_origin_station_ref") or c.get("parent_run_ref")
    ]

    return {
        "name": "SLD_SUBSTRATE_52S",
        "description": (
            "Deterministyczna siec SN >=52 stacji dla weryfikacji wizualnej SLD (M-05, V-09, V-10)"
        ),
        "enm": enm,
        "station_count": station_count,
        "trunk_station_count": len(trunk_station_refs),
        "lateral_station_count": len(lateral_station_refs),
        "branch_count": branch_count,
        "lateral_count": len(lateral_corridors),
        "der_count": der_count,
        "der_types": der_types,
        "der_errors": der_errors,
        "snapshot_hash": _snapshot_hash(enm),
    }
