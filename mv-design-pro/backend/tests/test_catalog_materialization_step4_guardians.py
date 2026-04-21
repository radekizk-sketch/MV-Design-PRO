"""Catalog + materialization CI guardians — Krok IV planu 10/10.

Scenariusze obowiązkowe:
- brak katalogu -> blokada analizy,
- przypięcie katalogu -> odblokowanie kodu braków katalogowych,
- zmiana wersji katalogu -> nowy Snapshot (hash).
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

backend_src = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(backend_src))

from enm.domain_operations import execute_domain_operation

from tests.catalog_test_helpers import gpz_payload


def _empty_enm() -> dict:
    return {
        "header": {"name": "Catalog Guardians", "revision": 0, "defaults": {}},
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


def _hash_snapshot(snapshot: dict) -> str:
    payload = json.dumps(snapshot, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _build_base_network_with_line_catalog() -> dict:
    enm = _empty_enm()
    r = execute_domain_operation(
        enm,
        "add_grid_source_sn",
        gpz_payload(voltage_kv=15.0, sk3_mva=500.0, rx_ratio=0.10),
    )
    assert r.get("error") is None
    enm = r["snapshot"]

    r = execute_domain_operation(
        enm,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 120,
                "catalog_ref": "cable-tfk-yakxs-3x120",
            }
        },
    )
    assert r.get("error") is None
    return r["snapshot"]


def test_catalog_missing_blocks_analysis() -> None:
    enm = _build_base_network_with_line_catalog()
    branch_ref = enm["branches"][0]["ref_id"]
    before_hash = _hash_snapshot(enm)

    # Próba usunięcia katalogu przez update ma być blokowana.
    r = execute_domain_operation(
        enm,
        "update_element_parameters",
        {"element_ref": branch_ref, "parameters": {"catalog_ref": None}},
    )
    assert r.get("error_code") == "catalog.ref_required"
    assert r.get("snapshot") is None
    assert _hash_snapshot(enm) == before_hash

    # Symulacja legacy/migracji: katalog faktycznie utracony poza operacją domenową.
    enm_missing_catalog = json.loads(json.dumps(enm))
    enm_missing_catalog["branches"][0]["catalog_ref"] = None
    refresh = execute_domain_operation(enm_missing_catalog, "refresh_snapshot", {})
    blocker_codes = [b["code"] for b in refresh["readiness"]["blockers"]]

    assert "E009" in blocker_codes, "Brak katalogu powinien blokować gotowość analizy (E009)"
    assert branch_ref not in refresh["materialized_params"]["lines_sn"]


def test_catalog_bind_unblocks_analysis() -> None:
    enm = _build_base_network_with_line_catalog()
    branch_ref = enm["branches"][0]["ref_id"]

    # Scenariusz legacy: wejściowy ENM zawiera brak catalog_ref.
    enm["branches"][0]["catalog_ref"] = None

    before = execute_domain_operation(enm, "refresh_snapshot", {})
    before_codes = [b["code"] for b in before["readiness"]["blockers"]]
    assert "E009" in before_codes

    # przypięcie katalogu + wersji
    enm = execute_domain_operation(
        enm,
        "assign_catalog_to_element",
        {
            "element_ref": branch_ref,
            "catalog_item_id": "cable-tfk-yakxs-3x120",
            "catalog_item_version": "v1",
        },
    )["snapshot"]

    after = execute_domain_operation(enm, "refresh_snapshot", {})
    after_codes = [b["code"] for b in after["readiness"]["blockers"]]

    assert "E009" not in after_codes, "Po przypięciu katalogu blokada katalogowa musi zniknąć"
    assert branch_ref in after["materialized_params"]["lines_sn"]
    assert (
        after["materialized_params"]["lines_sn"][branch_ref]["catalog_item_id"]
        == "cable-tfk-yakxs-3x120"
    )


def test_catalog_version_change_creates_new_snapshot() -> None:
    enm = _build_base_network_with_line_catalog()
    branch_ref = enm["branches"][0]["ref_id"]

    # wersja v1
    enm_v1 = execute_domain_operation(
        enm,
        "assign_catalog_to_element",
        {
            "element_ref": branch_ref,
            "catalog_item_id": "cable-tfk-yakxs-3x120",
            "catalog_item_version": "v1",
        },
    )["snapshot"]

    # wersja v2
    enm_v2 = execute_domain_operation(
        enm_v1,
        "assign_catalog_to_element",
        {
            "element_ref": branch_ref,
            "catalog_item_id": "cable-tfk-yakxs-3x120",
            "catalog_item_version": "v2",
        },
    )["snapshot"]

    h1 = _hash_snapshot(enm_v1)
    h2 = _hash_snapshot(enm_v2)

    assert h1 != h2, "Zmiana wersji katalogu musi tworzyć nowy snapshot (inny hash)"
    assert enm_v1["branches"][0].get("meta", {}).get("catalog_item_version") == "v1"
    assert enm_v2["branches"][0].get("meta", {}).get("catalog_item_version") == "v2"
