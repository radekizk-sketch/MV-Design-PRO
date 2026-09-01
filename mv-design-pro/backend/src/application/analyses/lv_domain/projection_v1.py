"""Atomowa projekcja domeny nN dla portalu SN -> nN.

``LvDomainProjectionV1`` spina w jednym, wersjonowanym odczycie:

* bieżący graf domeny wyprowadzony z ENM,
* kotwice Thevenina strony SN dla wszystkich transformatorów domeny,
* nakładkę zamrożonego ``ResultSetV1`` ograniczoną do elementów domeny,
* pętle zwarcia i werdykty SWZ odpływów.

Warstwa jest orkiestracją aplikacyjną. Nie zawiera fizyki i nie interpretuje
surowych wyników solvera. Dzięki temu portal nie może złożyć ekranu z kilku
odczytów pochodzących z różnych rewizji modelu.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from application.analyses.fault_loop.service import build_feeder_fault_loop_view
from application.analyses.swz.service import build_swz_view
from application.analyses.voltage_profile_view import build_voltage_profile_view
from application.result_freshness import evaluate_result_freshness
from application.result_mapping.canonical_run_to_resultset_v1 import (
    build_resultset_v1_from_canonical_run,
)
from enm.canonical_analysis import CanonicalRun
from enm.hash import compute_enm_hash, compute_switching_snapshot_hash
from enm.models import EnergyNetworkModel

from .graph_view import build_lv_domain_view
from .upstream_equivalent import Scenario, build_upstream_equivalent_snapshot

LV_DOMAIN_PROJECTION_CONTRACT = "LvDomainProjectionV1"
LV_DOMAIN_PROJECTION_VERSION = "1.0.0"


class LvDomainProjectionRunMismatch(ValueError):
    """Przebieg jawnie wskazany do projekcji należy do innego przypadku."""


class LvDomainProjectionRunUnavailable(ValueError):
    """Przebieg jawnie wskazany do projekcji nie ma gotowego wyniku."""


def _canonical_hash(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _domain_element_refs(graph: dict[str, Any]) -> set[str]:
    refs = {str(graph.get("station_ref", ""))}
    for collection in (
        "buses",
        "branches",
        "transformers",
        "generators",
        "loads",
        "sub_switchboards",
    ):
        refs.update(
            str(item["ref_id"])
            for item in graph.get(collection, [])
            if isinstance(item, dict) and item.get("ref_id")
        )
    refs.update(
        str(item["branch_ref"])
        for item in graph.get("boundary_links", [])
        if isinstance(item, dict) and item.get("branch_ref")
    )
    refs.discard("")
    return refs


def _result_snapshot(
    *,
    run: CanonicalRun | None,
    case_id: str,
    model_hash: str,
    domain_refs: set[str],
) -> dict[str, Any]:
    if run is None:
        freshness = evaluate_result_freshness(
            has_result=False,
            run_model_hashes=(),
            current_hash=model_hash,
        )
        return {
            "status": freshness.status.value,
            "reason": freshness.reason.value,
            "reason_pl": freshness.reason_pl,
            "run_id": None,
            "analysis_type": None,
            "run_model_hash": None,
            "run_finished_at": None,
            "result_contract_version": None,
            "result_signature": None,
            "overlay_payload": None,
            "voltage_profile": None,
        }

    if run.case_id != case_id:
        raise LvDomainProjectionRunMismatch(
            f"Przebieg {run.id} należy do przypadku {run.case_id}, nie {case_id}."
        )
    if run.status != "FINISHED":
        raise LvDomainProjectionRunUnavailable(
            f"Wyniki przebiegu {run.id} są niedostępne — status: {run.status}."
        )

    result_set = build_resultset_v1_from_canonical_run(run)
    overlay_payload = result_set.overlay_payload.model_dump(mode="json")
    overlay_payload["elements"] = {
        ref: element
        for ref, element in sorted(overlay_payload.get("elements", {}).items())
        if ref in domain_refs
    }
    overlay_payload["warnings"] = [
        warning
        for warning in overlay_payload.get("warnings", [])
        if not warning.get("element_ref") or warning["element_ref"] in domain_refs
    ]

    freshness = evaluate_result_freshness(
        has_result=True,
        run_model_hashes=(run.snapshot_hash,),
        current_hash=model_hash,
    )
    voltage_profile = None
    if run.analysis_type == "PF":
        complete_profile = build_voltage_profile_view(run)
        voltage_profile = {
            **complete_profile,
            "rows": [
                row for row in complete_profile.get("rows", []) if row.get("bus_id") in domain_refs
            ],
        }
    return {
        "status": freshness.status.value,
        "reason": freshness.reason.value,
        "reason_pl": freshness.reason_pl,
        "run_id": str(run.id),
        "analysis_type": result_set.analysis_type,
        "run_model_hash": run.snapshot_hash,
        "run_finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "result_contract_version": result_set.contract_version,
        "result_signature": result_set.deterministic_signature,
        "overlay_payload": overlay_payload,
        "voltage_profile": voltage_profile,
    }


def _swz_snapshot(enm: EnergyNetworkModel, station_ref: str) -> dict[str, Any]:
    feeder_view = build_feeder_fault_loop_view(enm, station_ref)
    feeder_rows: list[dict[str, Any]] = []
    for feeder in feeder_view.get("feeders", []):
        breaker_ref = str(feeder.get("feeder_root_branch_ref", ""))
        worst_bus_ref = feeder.get("worst_point_bus_ref")
        if worst_bus_ref:
            swz = build_swz_view(enm, station_ref, str(worst_bus_ref), breaker_ref)
        else:
            swz = {
                "status": "brak danych",
                "station_ref": station_ref,
                "bus_ref": None,
                "breaker_ref": breaker_ref,
                "missing_data": ["worst_point_bus_ref"],
                "reason_pl": "Brak policzalnego najgorszego punktu odpływu.",
            }
        feeder_rows.append(
            {
                "feeder_root_branch_ref": breaker_ref,
                "worst_point_bus_ref": worst_bus_ref,
                "points": feeder.get("points", []),
                "swz": swz,
            }
        )

    return {
        "status": feeder_view.get("status", "brak danych"),
        "reason_pl": feeder_view.get("reason_pl"),
        "missing_data": feeder_view.get("missing_data", []),
        "network_system": feeder_view.get("network_system"),
        "transformer_ref": feeder_view.get("transformer_ref"),
        "nn_bus_ref": feeder_view.get("nn_bus_ref"),
        "feeders": sorted(feeder_rows, key=lambda row: row["feeder_root_branch_ref"]),
    }


def build_lv_domain_projection_v1(
    enm: EnergyNetworkModel,
    case_id: str,
    station_ref: str,
    *,
    scenario: Scenario = "MAX",
    run: CanonicalRun | None = None,
) -> dict[str, Any]:
    """Zbuduj jeden niepodzielny snapshot domeny nN i jej prezentacji."""
    graph = build_lv_domain_view(enm, station_ref)
    model_hash = compute_enm_hash(enm)
    model_snapshot = {
        "revision": enm.header.revision,
        "model_hash": model_hash,
        "operating_state_id": compute_switching_snapshot_hash(enm),
    }

    upstream_equivalents: list[dict[str, Any]] = []
    if graph.get("status") == "OK":
        for transformer in graph.get("transformers", []):
            transformer_ref = transformer.get("ref_id")
            if not transformer_ref:
                continue
            upstream_equivalents.append(
                build_upstream_equivalent_snapshot(
                    enm,
                    case_id,
                    station_ref,
                    scenario=scenario,
                    transformer_ref=str(transformer_ref),
                )
            )

    domain_refs = _domain_element_refs(graph)
    result_snapshot = _result_snapshot(
        run=run,
        case_id=case_id,
        model_hash=model_hash,
        domain_refs=domain_refs,
    )
    swz_snapshot = _swz_snapshot(enm, station_ref)

    missing_data = [str(item) for item in graph.get("missing_data", [])]
    for upstream in upstream_equivalents:
        missing_data.extend(
            f"upstream:{upstream.get('transformer_ref', 'unknown')}:{item}"
            for item in upstream.get("missing_data", [])
        )
    missing_data.extend(f"swz:{item}" for item in swz_snapshot.get("missing_data", []))
    missing_data = sorted(set(missing_data))

    if graph.get("status") != "OK":
        completeness = "UNAVAILABLE"
    elif missing_data:
        completeness = "PARTIAL"
    else:
        completeness = "COMPLETE"

    payload: dict[str, Any] = {
        "contract": LV_DOMAIN_PROJECTION_CONTRACT,
        "contract_version": LV_DOMAIN_PROJECTION_VERSION,
        "case_id": case_id,
        "station_ref": station_ref,
        "scenario_id": scenario,
        "status": graph.get("status", "brak danych"),
        "completeness": completeness,
        "missing_data": missing_data,
        "model_snapshot": model_snapshot,
        "graph": graph,
        "upstream_equivalents": upstream_equivalents,
        "result_snapshot": result_snapshot,
        "swz_snapshot": swz_snapshot,
    }
    payload["projection_hash"] = _canonical_hash(payload)
    return payload
