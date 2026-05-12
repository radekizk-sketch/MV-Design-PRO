from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8000/api"
OUT = Path(__file__).with_name("e2e-044-full-complete-fixed-api-evidence.json")


def request_json(method: str, path: str, data: object | None = None, accept: str | None = None):
    body = None
    headers = {"Content-Type": "application/json"}
    if accept:
        headers["Accept"] = accept
    if data is not None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(BASE + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            raw = response.read()
            content_type = response.headers.get("content-type", "")
            if "application/json" in content_type:
                return json.loads(raw.decode("utf-8")), response.status, len(raw)
            return raw, response.status, len(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {path} HTTP {exc.code}: {raw}") from exc


def post(path: str, data: object):
    return request_json("POST", path, data)[0]


def put(path: str, data: object):
    return request_json("PUT", path, data)[0]


def get(path: str):
    return request_json("GET", path)[0]


def cb(namespace: str, item_id: str, version: str = "2024.1") -> dict[str, object]:
    return {
        "catalog_namespace": namespace,
        "catalog_item_id": item_id,
        "catalog_item_version": version,
        "materialize": True,
        "snapshot_mapping_version": "1.0",
    }


project = post(
    "/projects",
    {
        "name": "E2E_BROWSER_USE_TEST_OPERATOR_GRADE_FULL_044",
        "mode": "TO-BE",
        "voltage_level_kv": 15,
        "frequency_hz": 50,
    },
)
project_id = project["id"]
case = post(
    "/study-cases",
    {
        "project_id": project_id,
        "name": "Pełny model SN 2TR PV BESS FW 044",
        "config": {"profile_obliczen": "pełny", "profil_raportu": "techniczny_osd"},
        "set_active": True,
    },
)
case_id = case["id"]


def op(name: str, payload: dict[str, object]) -> dict[str, object]:
    result = post(
        f"/cases/{case_id}/enm/domain-ops",
        {"snapshot_base_hash": "", "operation": {"name": name, "payload": payload}},
    )
    if result.get("error"):
        raise RuntimeError(
            f"op {name} failed: {result.get('error_code')} {result.get('error')} payload={payload}"
        )
    return result


evidence: dict[str, object] = {"project_id": project_id, "case_id": case_id, "steps": []}


def step(name: str, result: dict[str, object]) -> str | None:
    hint = result.get("selection_hint") or {}
    assert isinstance(hint, dict)
    evidence["steps"].append(
        {
            "name": name,
            "selection_hint": hint,
            "created": result.get("created") or [],
            "deleted": result.get("deleted") or [],
        }
    )
    element_id = hint.get("element_id")
    return element_id if isinstance(element_id, str) else None


source = op(
    "add_grid_source_sn",
    {
        "source_name": "GPZ 1 - układ 2TR 110/SN",
        "voltage_kv": 15.0,
        "catalog_ref": "src-gpz-15kv-500mva-rx010",
        "catalog_binding": cb("ZRODLO_SN", "src-gpz-15kv-500mva-rx010"),
        "grounding": {"type": "resistor_grounded", "r_ohm": 80.0},
        "zero_sequence": {"enabled": True, "z0_z1_ratio": 3.0, "r0_ohm": 0.35, "x0_ohm": 1.05},
        "sections_count": 2,
        "gpz_sections": [
            {
                "order": 0,
                "name": "Sekcja 1",
                "bus_name": "Magistrala SN 1",
                "line_fields_count": 4,
                "line_field_names": [
                    "Pole odpływ 1",
                    "Pole odpływ 2",
                    "Pole TR 1",
                    "Pole pomiarowe 1",
                ],
            },
            {
                "order": 1,
                "name": "Sekcja 2",
                "bus_name": "Magistrala SN 2",
                "line_fields_count": 4,
                "line_field_names": [
                    "Pole odpływ 3",
                    "Pole odpływ 4",
                    "Pole TR 2",
                    "Pole rezerwowe",
                ],
            },
        ],
        "gpz_line_field_apparatus": {
            "apparatus_kind": "BREAKER",
            "catalog_ref": "sw-cb-abb-vd4-24kv-630a",
            "catalog_binding": cb("APARAT_SN", "sw-cb-abb-vd4-24kv-630a"),
        },
        "notes": "GPZ z dwiema sekcjami SN; transformator 110/SN opisany w konfiguracji i raporcie.",
    },
)
gpz_ref = step("GPZ 2 sekcje, pola SN", source)
snapshot = source["snapshot"]
assert isinstance(snapshot, dict)
gpz = next(s for s in snapshot["substations"] if s["ref_id"] == gpz_ref)
first_field = gpz["meta"]["field_specs"][0]["field_ref"]
trunk_id = snapshot["corridors"][0]["ref_id"]

segments_def = [
    ("Odcinek 1 GPZ-ST-01", "KABEL", 500, "cable-tfk-yakxs-3x120", "KABEL_SN"),
    ("Odcinek 2 ST-01-ST-PV", "KABEL", 700, "cable-tfk-yakxs-3x120", "KABEL_SN"),
    ("Odcinek 3 ST-PV-ST-BESS", "KABEL", 650, "cable-base-xlpe-al-3c-120", "KABEL_SN"),
    ("Odcinek 4 ST-BESS-ST-FW linia", "LINIA_NAPOWIETRZNA", 900, "line-base-al-st-70", "LINIA_SN"),
    ("Odcinek 5 ST-FW-ZKSN kabel", "KABEL", 400, "cable-base-xlpe-al-3c-70", "KABEL_SN"),
]
zero_sequence_by_kind = {
    "KABEL": {"r0_ohm_per_km": 0.75, "x0_ohm_per_km": 0.32},
    "LINIA_NAPOWIETRZNA": {"r0_ohm_per_km": 0.92, "x0_ohm_per_km": 1.35},
}
for index, (name, rodzaj, length_m, catalog, namespace) in enumerate(segments_def):
    payload = {
        "trunk_id": trunk_id,
        "segment": {
            "rodzaj": rodzaj,
            "dlugosc_m": length_m,
            "name": name,
            "catalog_ref": catalog,
            "catalog_binding": cb(namespace, catalog),
            "zero_sequence": zero_sequence_by_kind[rodzaj],
        },
    }
    if index == 0:
        payload["field_ref"] = first_field
    step(name, op("continue_trunk_segment_sn", payload))

snapshot = get(f"/cases/{case_id}/enm")
segment_refs = list(snapshot["corridors"][0]["ordered_segment_refs"])
evidence["main_segments_initial"] = segment_refs

station_refs: dict[str, str] = {}
for segment_ref, name, station_type in [
    (segment_refs[0], "ST-01 stacja przelotowa", "inline"),
    (segment_refs[1], "ST-PV stacja z PV", "inline"),
    (segment_refs[2], "ST-BESS stacja z BESS", "inline"),
]:
    station_id = step(
        name,
        op(
            "insert_station_on_segment_sn",
            {
                "segment_ref": segment_ref,
                "station_type": station_type,
                "insert_at": {"mode": "RATIO", "value": 0.5},
                "station": {
                    "name": name,
                    "station_type": station_type,
                    "sn_voltage_kv": 15.0,
                    "nn_voltage_kv": 0.4,
                },
                "sn_fields": ["IN", "OUT", "TR"],
                "transformer": {
                    "create": True,
                    "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
                    "catalog_binding": cb("TRAFO_SN_NN", "tr-sn-nn-15-04-630kva-dyn11"),
                },
            },
        ),
    )
    assert station_id is not None
    station_refs[name] = station_id

branch_pole_ref = step(
    "Słup rozgałęźny na linii SN",
    op(
        "insert_branch_pole_on_segment_sn",
        {
            "segment_ref": segment_refs[3],
            "insert_at": {"mode": "RATIO", "value": 0.6},
            "name": "Słup rozgałęźny ODG-01",
            "branch_ports_count": 1,
            "catalog_ref": "SLUP-ODG-12",
            "catalog_namespace": "mv_branch_points",
            "catalog_binding": cb("mv_branch_points", "SLUP-ODG-12"),
        },
    ),
)
assert branch_pole_ref is not None
branch_endpoint = step(
    "Odgałęzienie od słupa",
    op(
        "start_branch_segment_sn",
        {
            "from_ref": f"{branch_pole_ref}.BRANCH",
            "segment": {
                "rodzaj": "LINIA_NAPOWIETRZNA",
                "dlugosc_m": 300,
                "name": "Odgałęzienie słupowe do ST-ODG",
                "catalog_ref": "line-base-al-st-50",
                "catalog_binding": cb("LINIA_SN", "line-base-al-st-50"),
                "zero_sequence": zero_sequence_by_kind["LINIA_NAPOWIETRZNA"],
            },
        },
    ),
)
assert branch_endpoint is not None
station_id = step(
    "Stacja na końcu odgałęzienia słupowego",
    op(
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": branch_endpoint,
            "station": {
                "name": "ST-ODG stacja końcowa odgałęzienia",
                "station_type": "terminal",
                "nn_voltage_kv": 0.4,
            },
            "transformer": {
                "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
                "catalog_binding": cb("TRAFO_SN_NN", "tr-sn-nn-15-04-630kva-dyn11"),
            },
        },
    ),
)
assert station_id is not None
station_refs["ST-ODG stacja końcowa odgałęzienia"] = station_id

zksn_ref = step(
    "ZKSN na kablu SN",
    op(
        "insert_zksn_on_segment_sn",
        {
            "segment_ref": segment_refs[4],
            "insert_at": {"mode": "RATIO", "value": 0.45},
            "name": "ZKSN-01 punkt rozdziału kablowego",
            "branch_ports_count": 1,
            "catalog_ref": "ZKSN-2P-630A",
            "catalog_namespace": "mv_branch_points",
            "catalog_binding": cb("mv_branch_points", "ZKSN-2P-630A"),
        },
    ),
)
assert zksn_ref is not None
zksn_branch_endpoint = step(
    "Odgałęzienie z ZKSN",
    op(
        "start_branch_segment_sn",
        {
            "from_ref": f"{zksn_ref}.BRANCH_1",
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 180,
                "name": "Odgałęzienie kablowe ZKSN-ST-ZK",
                "catalog_ref": "cable-base-xlpe-al-3c-70",
                "catalog_binding": cb("KABEL_SN", "cable-base-xlpe-al-3c-70"),
                "zero_sequence": zero_sequence_by_kind["KABEL"],
            },
        },
    ),
)
assert zksn_branch_endpoint is not None
station_id = step(
    "Stacja za ZKSN",
    op(
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": zksn_branch_endpoint,
            "station": {"name": "ST-ZK stacja za ZKSN", "station_type": "terminal", "nn_voltage_kv": 0.4},
            "transformer": {
                "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
                "catalog_binding": cb("TRAFO_SN_NN", "tr-sn-nn-15-04-630kva-dyn11"),
            },
        },
    ),
)
assert station_id is not None
station_refs["ST-ZK stacja za ZKSN"] = station_id

snapshot = get(f"/cases/{case_id}/enm")
last_segment_ref = snapshot["corridors"][0]["ordered_segment_refs"][-1]
last_segment = next(branch for branch in snapshot["branches"] if branch["ref_id"] == last_segment_ref)
main_endpoint = last_segment["to_bus_ref"]
station_id = step(
    "ST-FW na końcu ciągu głównego",
    op(
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": main_endpoint,
            "station": {"name": "ST-FW stacja z FW", "station_type": "terminal", "nn_voltage_kv": 0.4},
            "transformer": {
                "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
                "catalog_binding": cb("TRAFO_SN_NN", "tr-sn-nn-15-04-630kva-dyn11"),
            },
        },
    ),
)
assert station_id is not None
station_refs["ST-FW stacja z FW"] = station_id


def station_by_name(name: str) -> dict[str, object]:
    snapshot = get(f"/cases/{case_id}/enm")
    return next(station for station in snapshot["substations"] if station.get("name") == name)


def nn_bus_for(station: dict[str, object]) -> str:
    snapshot = get(f"/cases/{case_id}/enm")
    refs = set(station.get("bus_refs") or [])
    return next(
        bus["ref_id"]
        for bus in snapshot["buses"]
        if bus["ref_id"] in refs and abs(float(bus.get("voltage_kv") or 0) - 0.4) < 1e-6
    )


def add_load(station_name: str, p_kw: float, q_kvar: float) -> None:
    station = station_by_name(station_name)
    bus = nn_bus_for(station)
    field_result = op(
        "add_nn_outgoing_field",
        {
            "station_ref": station["ref_id"],
            "bus_nn_ref": bus,
            "field_name": f"Odpływ nN {station_name}",
            "catalog_binding": cb("APARAT_NN", "cb_nn_250a"),
        },
    )
    feeder = (field_result.get("selection_hint") or {}).get("element_id")
    step(
        f"Odbiór {station_name}",
        op(
            "add_nn_load",
            {
                "station_ref": station["ref_id"],
                "bus_nn_ref": bus,
                "feeder_ref": feeder,
                "active_power_kw": p_kw,
                "reactive_power_kvar": q_kvar,
                "load_name": f"Odbiór {station_name}",
                "catalog_ref": "load_przem_75kw",
                "catalog_binding": cb("OBCIAZENIE", "load_przem_75kw"),
            },
        ),
    )


def add_der(
    station_name: str,
    technology: str,
    catalog: str,
    p_mw: float,
    extra: dict[str, object] | None = None,
) -> None:
    station = station_by_name(station_name)
    bus = nn_bus_for(station)
    payload: dict[str, object] = {
        "station_ref": station["ref_id"],
        "bus_nn_ref": bus,
        "source_technology": technology,
        "connection_variant": "nn_side",
        "placement": "NEW_FIELD",
        "source_name": f"{technology} {station_name}",
        "power_setpoint_mw": p_mw,
        "catalog_ref": catalog,
        "catalog_binding": cb("CONVERTER", catalog),
        "source_field": {
            "source_field_kind": technology,
            "field_name": f"Pole {technology} nN",
            "catalog_binding": cb("APARAT_NN", "cb_nn_630a"),
        },
    }
    if extra:
        payload.update(extra)
    step(f"{technology} {station_name}", op("add_converter_source", payload))


for station_name, p_kw, q_kvar in [
    ("ST-01 stacja przelotowa", 180, 60),
    ("ST-PV stacja z PV", 90, 30),
    ("ST-BESS stacja z BESS", 120, 35),
    ("ST-FW stacja z FW", 110, 30),
    ("ST-ODG stacja końcowa odgałęzienia", 75, 25),
    ("ST-ZK stacja za ZKSN", 65, 20),
]:
    add_load(station_name, p_kw, q_kvar)

add_der(
    "ST-PV stacja z PV",
    "PV",
    "conv-pv-nn-1mw-0p4kv",
    0.85,
    {"control_mode": "Q_U_DROOP", "q_min_mvar": -0.25, "q_max_mvar": 0.25},
)
add_der(
    "ST-BESS stacja z BESS",
    "BESS",
    "conv-bess-nn-1mw-0p4kv",
    0.60,
    {"bess_mode": "DISCHARGE", "soc_min_percent": 20, "soc_max_percent": 90},
)
add_der(
    "ST-FW stacja z FW",
    "FW",
    "conv-wind-nn-2mw-0p4kv",
    1.20,
    {
        "control_mode": "PQ",
        "q_min_mvar": -0.72,
        "q_max_mvar": 0.72,
        "materialized_params": {
            "catalog_item_id": "conv-wind-nn-2mw-0p4kv",
            "catalog_item_version": "2024.1",
            "un_kv": 0.4,
            "sn_mva": 2.2,
            "pmax_mw": 2.0,
            "qmin_mvar": -0.72,
            "qmax_mvar": 0.72,
            "kind": "WIND",
        },
    },
)

evidence["protection_config"] = put(
    f"/study-cases/{case_id}/protection-config",
    {
        "template_ref": "template_rex500_oc",
        "template_fingerprint": "e2e-044-template-rex500",
        "library_manifest_ref": {"library_id": "default_mv_catalog", "revision": "2024.1"},
        "overrides": {
            "device_type_ref": "ACME_REX500_v1",
            "curve_ref": "IEC_SI",
            "ct_ratio": "400/5",
            "vt_ratio": "15000/100",
            "i_pickup_a": 180.0,
            "tms": 0.12,
            "protected_scope": "ciąg główny i odgałęzienia",
        },
    },
)

snapshot = get(f"/cases/{case_id}/enm")
evidence["counts"] = {
    key: len(snapshot.get(key, []))
    for key in [
        "substations",
        "buses",
        "branches",
        "transformers",
        "loads",
        "generators",
        "branch_points",
        "protection_assignments",
        "bays",
    ]
}
validation = get(f"/cases/{case_id}/enm/validate")
evidence["validation_status"] = validation.get("status")
evidence["validation_issues"] = (validation.get("issues") or [])[:12]
evidence["readiness"] = get(f"/cases/{case_id}/enm/readiness")

sc_runs: dict[str, object] = {}
for fault_type in ["3F", "1F", "2F", "2FG"]:
    try:
        result = post(f"/cases/{case_id}/runs/short-circuit", {"fault_type": fault_type})
        sc_runs[fault_type] = {
            "run_id": result.get("run_id"),
            "results": len(result.get("results") or []),
            "reporting_status": result.get("reporting_status"),
            "proof_status": result.get("proof_status"),
        }
    except Exception as exc:
        sc_runs[fault_type] = {"error": str(exc)}
evidence["sc_runs"] = sc_runs

try:
    power_flow = post(f"/cases/{case_id}/runs/power-flow", {})
    result = power_flow.get("result") or {}
    evidence["pf"] = {
        "run_id": power_flow.get("run_id"),
        "bus_rows": len(result.get("bus_results") or []),
        "branch_rows": len(result.get("branch_results") or []),
        "readiness": power_flow.get("readiness"),
    }
except Exception as exc:
    evidence["pf"] = {"error": str(exc)}

sc_run_id = next(
    (value.get("run_id") for value in sc_runs.values() if isinstance(value, dict) and value.get("run_id")),
    None,
)
if sc_run_id:
    try:
        protection_run = post(
            f"/projects/{project_id}/protection-runs",
            {"sc_run_id": sc_run_id, "protection_case_id": case_id},
        )
        executed = post(f"/protection-runs/{protection_run['id']}/execute", {})
        protection_result = get(f"/protection-runs/{protection_run['id']}/results")
        protection_trace = get(f"/protection-runs/{protection_run['id']}/trace")
        evidence["protection"] = {
            "run_id": protection_run["id"],
            "status": executed.get("status"),
            "evaluations": len(protection_result.get("evaluations") or []),
            "steps": len(protection_trace.get("steps") or []),
        }
    except Exception as exc:
        evidence["protection"] = {"error": str(exc)}

exports: dict[str, object] = {}
for label, run_id in [("sc", sc_run_id), ("pf", (evidence.get("pf") or {}).get("run_id"))]:
    if not run_id:
        continue
    for kind in ["report/json", "report/docx", "report/pdf", "proof/json", "proof/latex", "proof/pdf"]:
        try:
            _, status, size = request_json("GET", f"/analysis-runs/{run_id}/export/{kind}")
            exports[f"{label}:{kind}"] = {"status": status, "size": size}
        except Exception as exc:
            exports[f"{label}:{kind}"] = {"error": str(exc)}
evidence["exports"] = exports

OUT.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
print(
    json.dumps(
        {
            "project_id": project_id,
            "case_id": case_id,
            "counts": evidence["counts"],
            "validation": evidence["validation_status"],
            "sc": sc_runs,
            "pf": evidence.get("pf"),
            "protection": evidence.get("protection"),
            "exports": exports,
            "out": str(OUT),
        },
        ensure_ascii=False,
        indent=2,
    )
)
