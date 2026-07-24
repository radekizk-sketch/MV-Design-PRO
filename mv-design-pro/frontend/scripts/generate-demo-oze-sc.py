#!/usr/bin/env python3
"""Wygeneruj fixtury sieci DEMONSTRACYJNEJ DEMO-OZE-SC: kanoniczny ENM oraz
companion realnego biegu zwarciowego (SC IEC 60909, per szyna SN).

Bridge: backend ``build_demo_oze_sc_network()`` -> ``EnergyNetworkModel`` ->
kanoniczny ``model_dump(mode='json')`` (ENM) ORAZ realny bieg SC uruchamiany
DOKLADNIE torem kanonicznym ``_execute_short_circuit`` (te same
``map_enm_to_network_graph`` + ``ShortCircuitIEC60909Solver.compute_3ph_short_circuit``
iterowane po REPORTABLE wezlach — filtr ``_build_snapshot_graph_element_context``
pomija helper/GPZ-section busy). ZERO fabrykacji: kazda wartosc Ik''/ip/Ith/Sk
pochodzi z FROZEN solvera; companion NIE liczy niczego sam.

Determinizm (ZASADA NR 7): builder i solver sa deterministyczne, wyjscia sortowane
i zaokraglane do stalej skali -> committed JSON bajt-stabilny.

Uruchom z ``backend/`` (owner poetry env + pakiet tests):
    PYTHONPATH=src poetry run python ../frontend/scripts/generate-demo-oze-sc.py
"""

from __future__ import annotations

import json
import pathlib
import sys
import uuid

_THIS = pathlib.Path(__file__).resolve()
_FRONTEND = _THIS.parent.parent
_REPO = _FRONTEND.parent
_BACKEND = _REPO / "backend"
sys.path.insert(0, str(_BACKEND / "src"))
sys.path.insert(0, str(_BACKEND))

from enm.canonical_analysis import _build_snapshot_graph_element_context  # noqa: E402
from enm.mapping import map_enm_to_network_graph  # noqa: E402
from enm.models import EnergyNetworkModel  # noqa: E402
from network_model.solvers.short_circuit_iec60909 import (  # noqa: E402
    ShortCircuitIEC60909Solver,
)

from tests.reference_networks.demo_oze_sc import build_demo_oze_sc_network  # noqa: E402

_FIXED_TS = "2026-07-24T00:00:00Z"
_C_FACTOR = 1.10
_TK_S = 1.0
_OUT_DIR = _FRONTEND / "scripts" / "demo-oze-sc"


def _run_short_circuit(enm_dict: dict) -> dict:
    """Realny bieg SC 3F per REPORTABLE szyna SN — tor kanoniczny (read-only)."""
    enm = EnergyNetworkModel.model_validate(enm_dict)
    graph = map_enm_to_network_graph(enm)
    ctx = _build_snapshot_graph_element_context(enm_dict)
    node_ctx = ctx.get("nodes", {})

    # REPORTABLE = jak _execute_short_circuit: pomijamy skip_short_circuit_target.
    reportable = [
        node_id
        for node_id in sorted(graph.nodes.keys())
        if not node_ctx.get(node_id, {}).get("skip_short_circuit_target", False)
    ]
    # Mapowanie node_id -> bus ref (tylko szyny SN >= 1 kV; deklutter warstwy).
    ref_by_node: dict[str, dict] = {}
    for bus in enm_dict.get("buses", []):
        if (bus.get("voltage_kv") or 0.0) < 1.0:
            continue
        ref = str(bus.get("ref_id") or "")
        if not ref:
            continue
        ref_by_node[str(uuid.uuid5(uuid.NAMESPACE_DNS, ref))] = bus

    bus_sc: dict[str, dict] = {}
    ik_values: list[float] = []
    for node_id in reportable:
        bus = ref_by_node.get(node_id)
        if bus is None:
            continue
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id=node_id,
            c_factor=_C_FACTOR,
            tk_s=_TK_S,
            include_branch_contributions=False,
        )
        d = result.to_dict()
        ikss = float(d["ikss_a"])
        if ikss != ikss or ikss <= 0:  # NaN albo <=0 => nie raportujemy
            continue
        ref = str(bus["ref_id"])
        bus_sc[ref] = {
            "bus_ref": ref,
            "voltage_kv": round(float(bus.get("voltage_kv") or 0.0), 3),
            "ikss_a": round(ikss, 3),
            "ip_a": round(float(d["ip_a"]), 3),
            "ith_a": round(float(d["ith_a"]), 3),
            "sk_mva": round(float(d["sk_mva"]), 3),
        }
        ik_values.append(ikss)

    ik_values.sort()
    return {
        "bus_short_circuit": bus_sc,
        "converged": len(bus_sc) > 0,
        "bus_count": len(bus_sc),
        "ikss_min_ka": round(ik_values[0] / 1000.0, 3) if ik_values else 0.0,
        "ikss_max_ka": round(ik_values[-1] / 1000.0, 3) if ik_values else 0.0,
    }


def _stabilize_technical_ids(dumped: dict) -> None:
    """Wyprowadz techniczne `id` z `ref_id` — fixtura ma byc DETERMINISTYCZNA.

    Operacje domenowe nadaja rekordom losowy `uuid4()` jako klucz techniczny. To
    poprawne w bazie (klucz nie niesie znaczenia), ale w PLIKU WERSJONOWANYM
    znaczy, ze kazda regeneracja przy IDENTYCZNYM wejsciu daje inny plik — tu
    227 zmienionych linii przy zerowej zmianie fizyki (wyniki SC bit-identyczne).
    Nadpisujemy `id` deterministycznym UUID5 z `ref_id` (ta sama funkcja, ktorej
    uzywa `enm.mapping._ref_to_uuid`), wiec plik zalezy wylacznie od modelu.
    """
    for key in sorted(dumped):
        records = dumped.get(key)
        if not isinstance(records, list):
            continue
        for record in records:
            if isinstance(record, dict) and record.get("ref_id") and "id" in record:
                record["id"] = str(uuid.uuid5(uuid.NAMESPACE_DNS, str(record["ref_id"])))


def main() -> int:
    result = build_demo_oze_sc_network()
    enm_dict = result["enm"]
    builder_hash = result["snapshot_hash"]

    model = EnergyNetworkModel.model_validate(enm_dict)
    dumped = model.model_dump(mode="json")
    header = dumped["header"]
    header["created_at"] = _FIXED_TS
    header["updated_at"] = _FIXED_TS
    header["hash_sha256"] = builder_hash
    _stabilize_technical_ids(dumped)

    sc = _run_short_circuit(enm_dict)
    if not sc["converged"]:
        print("BLAD: bieg SC nie zbiegl na zadnej szynie", file=sys.stderr)
        return 1

    _OUT_DIR.mkdir(parents=True, exist_ok=True)

    enm_fixture = {
        "_meta": {
            "source": "backend tests/reference_networks/demo_oze_sc.build_demo_oze_sc_network",
            "builder_snapshot_hash": builder_hash,
            "station_count": result["station_count"],
            "config_count": result["config_count"],
            "der_count": result["der_count"],
            "der_types": sorted(t for t in result["der_types"] if t),
            "station_configs": result["station_configs"],
            "note": (
                "ENM sieci demonstracyjnej DEMO-OZE-SC (kazda stacja inna OZE). "
                "Regeneracja: scripts/generate-demo-oze-sc.py. Deterministyczny."
            ),
        },
        "enm": dumped,
    }
    sc_fixture = {
        "_meta": {
            "source": "SC IEC 60909 (FROZEN solver) per szyna SN — tor kanoniczny",
            "builder_snapshot_hash": builder_hash,
            "c_factor": _C_FACTOR,
            "tk_s": _TK_S,
            "analysis_type": "short_circuit_3f",
            "note": (
                "Realny bieg zwarciowy; Ik''/ip/Ith/Sk 1:1 z solvera. "
                "Regeneracja: scripts/generate-demo-oze-sc.py."
            ),
        },
        "converged": sc["converged"],
        "bus_count": sc["bus_count"],
        "ikss_min_ka": sc["ikss_min_ka"],
        "ikss_max_ka": sc["ikss_max_ka"],
        "bus_short_circuit": sc["bus_short_circuit"],
    }

    enm_path = _OUT_DIR / "demoOzeSc.enm.json"
    sc_path = _OUT_DIR / "demoOzeSc.sc.json"
    enm_path.write_text(
        json.dumps(enm_fixture, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    sc_path.write_text(
        json.dumps(sc_fixture, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"WROTE {enm_path}")
    print(f"WROTE {sc_path}")
    print(
        f"stacje={result['station_count']} konfiguracje={result['config_count']} "
        f"DER={result['der_count']} szyny_SC={sc['bus_count']} "
        f"Ik''=[{sc['ikss_min_ka']}..{sc['ikss_max_ka']}] kA"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
