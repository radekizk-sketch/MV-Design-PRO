from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from enm.canonical_analysis import CanonicalRun, build_extended_trace


def test_build_extended_trace_uses_snapshot_catalog_context_without_fabrication() -> None:
    run = CanonicalRun(
        id=uuid4(),
        case_id="case-001",
        project_id="project-001",
        analysis_type="PF",
        status="FINISHED",
        created_at=datetime.now(UTC),
        snapshot_hash="snap-001",
        input_hash="input-001",
        snapshot={
            "branches": [
                {
                    "ref_id": "line-002",
                    "catalog_ref": "cable-120",
                    "catalog_namespace": "mv_cables",
                    "meta": {"catalog_item_version": "2026.04"},
                    "materialized_params": {"r_ohm_per_km": 0.12, "x_ohm_per_km": 0.08},
                    "overrides": [
                        {
                            "key": "length_km",
                            "value": 1.25,
                            "reason": "pomiar powykonawczy",
                        }
                    ],
                    "parameter_source": "OVERRIDE",
                },
                {
                    "ref_id": "line-003",
                    "parameter_source": "CATALOG",
                },
            ],
            "transformers": [
                {
                    "ref_id": "tr-001",
                    "catalog_ref": "tr-630",
                    "catalog_namespace": "mv_transformers",
                    "catalog_version": "2026.1",
                    "materialized_params": {"sn_mva": 0.63},
                }
            ],
            "loads": [
                {
                    "ref_id": "load-001",
                    "name": "odbior bez katalogu",
                }
            ],
        },
        validation={},
        readiness={},
        white_box_trace=[{"key": "step-001", "title": "Krok 1"}],
    )

    payload = build_extended_trace(run)

    assert payload["white_box_trace"] == [
        {
            "key": "step-001",
            "title": "Krok 1",
            "related_elements": [],
            "selection_refs": [],
        }
    ]
    assert payload["selection_index"] == {}
    assert payload["catalog_context"] == [
        {
            "element_id": "line-002",
            "element_type": "ODCINEK_SN",
            "name": None,
            "catalog_binding": {
                "catalog_namespace": "mv_cables",
                "catalog_item_id": "cable-120",
                "catalog_item_version": "2026.04",
            },
            "source_catalog": {
                "catalog_namespace": "mv_cables",
                "catalog_item_id": "cable-120",
                "catalog_item_version": "2026.04",
            },
            "source_catalog_label": "mv_cables:cable-120@2026.04",
            "materialized_params": {"r_ohm_per_km": 0.12, "x_ohm_per_km": 0.08},
            "parameter_origin": "OVERRIDE",
            "parameter_source": "OVERRIDE",
            "manual_overrides": [
                {
                    "key": "length_km",
                    "value": 1.25,
                    "reason": "pomiar powykonawczy",
                }
            ],
            "manual_override_count": 1,
            "has_manual_overrides": True,
            "overrides": [
                {
                    "key": "length_km",
                    "value": 1.25,
                    "reason": "pomiar powykonawczy",
                }
            ],
        },
        {
            "element_id": "line-003",
            "element_type": "ODCINEK_SN",
            "name": None,
            "catalog_binding": {
                "catalog_namespace": None,
                "catalog_item_id": None,
                "catalog_item_version": None,
            },
            "source_catalog": {
                "catalog_namespace": None,
                "catalog_item_id": None,
                "catalog_item_version": None,
            },
            "source_catalog_label": None,
            "materialized_params": None,
            "parameter_origin": "CATALOG",
            "parameter_source": "CATALOG",
            "manual_override_count": 0,
            "has_manual_overrides": False,
        },
        {
            "element_id": "tr-001",
            "element_type": "TRANSFORMATOR_SN_NN",
            "name": None,
            "catalog_binding": {
                "catalog_namespace": "mv_transformers",
                "catalog_item_id": "tr-630",
                "catalog_item_version": "2026.1",
            },
            "materialized_params": {"sn_mva": 0.63},
            "source_catalog": {
                "catalog_namespace": "mv_transformers",
                "catalog_item_id": "tr-630",
                "catalog_item_version": "2026.1",
            },
            "source_catalog_label": "mv_transformers:tr-630@2026.1",
            "manual_override_count": 0,
            "has_manual_overrides": False,
        },
    ]
    assert payload["catalog_context_summary"] == {
        "element_count": 3,
        "by_type": {
            "ODCINEK_SN": 2,
            "TRANSFORMATOR_SN_NN": 1,
        },
        "by_parameter_origin": {
            "CATALOG": 1,
            "OVERRIDE": 1,
        },
        "manual_override_element_count": 1,
        "manual_override_count": 1,
    }
    assert (
        payload["catalog_context_by_element"]["line-002"]["source_catalog_label"]
        == "mv_cables:cable-120@2026.04"
    )
