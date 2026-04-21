from __future__ import annotations

from api.domain_ops_policy import validate_and_materialize_catalog_binding
from domain.canonical_operations import CANONICAL_OPERATIONS, validate_operation_payload

CATALOG_ZRODLO_SN = "src-gpz-15kv-250mva-rx010"


def test_policy_accepts_manual_impedance_equivalent_without_catalog():
    payload = {
        "source_name": "GPZ impedancyjny",
        "voltage_kv": 15.0,
        "sections_count": 2,
        "gpz_sections": [
            {"order": 0, "name": "Sekcja 1", "line_field_name": "Pole liniowe 1"},
            {"order": 1, "name": "Sekcja 2", "line_field_name": "Pole liniowe 2"},
        ],
        "grounding": {"type": "PETERSEN_COIL", "x_ohm": 25.0},
        "zero_sequence": {"enabled": True, "z0_z1_ratio": 3.0},
        "manual_equivalent": {
            "voltage_kv": 15.0,
            "short_circuit_mode": "IMPEDANCE",
            "r_ohm": 0.42,
            "x_ohm": 1.87,
        },
        "source_mode": "EKSPERCKI_RECZNY",
        "parameter_source": "MANUAL_EQUIVALENT",
    }

    policy_error, materialized = validate_and_materialize_catalog_binding(
        "add_grid_source_sn",
        payload,
    )

    assert policy_error is None
    assert materialized == {}


def test_policy_rejects_incomplete_manual_impedance_equivalent_without_catalog():
    payload = {
        "source_name": "GPZ impedancyjny",
        "voltage_kv": 15.0,
        "manual_equivalent": {
            "voltage_kv": 15.0,
            "short_circuit_mode": "IMPEDANCE",
            "r_ohm": 0.42,
        },
        "source_mode": "EKSPERCKI_RECZNY",
        "parameter_source": "MANUAL_EQUIVALENT",
    }

    policy_error, materialized = validate_and_materialize_catalog_binding(
        "add_grid_source_sn",
        payload,
    )

    assert policy_error is not None
    assert policy_error.code == "catalog.ref_required"
    assert materialized == {}


def test_policy_accepts_catalog_grid_source_with_multisection_payload():
    payload = {
        "voltage_kv": 15.0,
        "sk3_mva": 250.0,
        "rx_ratio": 0.10,
        "catalog_ref": CATALOG_ZRODLO_SN,
        "sections_count": 2,
        "gpz_sections": [
            {"order": 0, "name": "Sekcja 1", "line_field_name": "Pole liniowe 1"},
            {"order": 1, "name": "Sekcja 2", "line_field_name": "Pole liniowe 2"},
        ],
        "grounding": {"type": "DIRECT"},
        "zero_sequence": {"enabled": True, "z0_z1_ratio": 2.5},
    }

    policy_error, materialized = validate_and_materialize_catalog_binding(
        "add_grid_source_sn",
        payload,
    )

    assert policy_error is None
    assert materialized.get("voltage_rating_kv") == 15.0
    assert materialized.get("sk3_mva") == 250.0
    assert materialized.get("rx_ratio") == 0.10


def test_canonical_spec_accepts_multisection_manual_grid_source_payload():
    spec = CANONICAL_OPERATIONS["add_grid_source_sn"]

    assert spec.required_fields == ("voltage_kv",)
    assert "sections_count" in spec.optional_fields
    assert "gpz_sections" in spec.optional_fields
    assert "grounding" in spec.optional_fields
    assert "zero_sequence" in spec.optional_fields
    assert "short_circuit_mode" in spec.optional_fields

    errors = validate_operation_payload(
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sections_count": 2,
            "gpz_sections": [
                {"order": 0, "name": "Sekcja 1"},
                {"order": 1, "name": "Sekcja 2"},
            ],
            "manual_equivalent": {
                "voltage_kv": 15.0,
                "short_circuit_mode": "IMPEDANCE",
                "r_ohm": 0.42,
                "x_ohm": 1.87,
            },
        },
    )

    assert errors == []
