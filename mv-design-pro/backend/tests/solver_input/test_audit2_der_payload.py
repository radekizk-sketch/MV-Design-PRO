"""
Testy mapowania pol audytu 2 na solver-input payload (Phase 3).
"""

from __future__ import annotations

from solver_input.audit2_der_payload import (
    build_der_audit2_payload,
    build_station_audit2_payload,
    extract_solver_extensions_from_payload,
)


def test_build_der_payload_pv_with_block_trafo_and_pf_curve():
    payload = build_der_audit2_payload(
        der_id="der_pv_001",
        der_kind="PV",
        block_transformer_catalog_ref="btr_pv_15_069_2500",
        pf_curve_ref="pf_pse_b",
    )
    assert payload.der_id == "der_pv_001"
    assert payload.der_kind == "PV"
    # Block-trafo rozwiniety.
    assert payload.block_transformer is not None
    assert payload.block_transformer["sn_kva"] == 2500
    # P(f) curve rozwinieta.
    assert payload.pf_curve is not None
    assert payload.pf_curve["droop_percent"] == 5.0
    # PV nie ma BESS modes.
    assert payload.bess_operation_modes == []
    # Brak issues.
    assert payload.issues == []


def test_build_der_payload_pv_with_bess_modes_emits_warning():
    payload = build_der_audit2_payload(
        der_id="der_pv_002",
        der_kind="PV",
        bess_operation_mode_refs=["mode_fcr_n"],
    )
    # PV + BESS modes -> warning, modes ignored.
    assert payload.bess_operation_modes == []
    assert any("nie obsluguje" in i for i in payload.issues)


def test_build_der_payload_bess_with_multiple_modes():
    payload = build_der_audit2_payload(
        der_id="der_bess_001",
        der_kind="BESS",
        bess_operation_mode_refs=["mode_fcr_n", "mode_voltage_support"],
    )
    assert len(payload.bess_operation_modes) == 2
    codes = {m["mode_code"] for m in payload.bess_operation_modes}
    assert "fcr_n" in codes
    assert "voltage_support" in codes
    assert payload.issues == []


def test_build_der_payload_unknown_block_trafo_emits_issue():
    payload = build_der_audit2_payload(
        der_id="der_001",
        der_kind="PV",
        block_transformer_catalog_ref="btr_unknown",
    )
    assert payload.block_transformer is None
    assert any("Nieznany block-trafo" in i for i in payload.issues)


def test_build_der_payload_block_trafo_kind_mismatch_emits_issue():
    # FW block-trafo SN/SN nie jest dla PV.
    payload = build_der_audit2_payload(
        der_id="der_001",
        der_kind="PV",
        block_transformer_catalog_ref="btr_fw_30_15_30000",
    )
    assert payload.block_transformer is None
    assert any("nie jest przeznaczony dla DER PV" in i for i in payload.issues)


def test_build_station_payload_with_grounding_and_tap_changers():
    payload = build_station_audit2_payload(
        station_id="station_001",
        mv_neutral_grounding_ref="mng_petersen",
        tap_changer_refs=["tc_oltc_110sn_19_125", "tc_detc_snnn_5_25"],
        der_specs=[],
    )
    assert payload.station_id == "station_001"
    assert payload.mv_neutral_grounding is not None
    assert payload.mv_neutral_grounding["grounding_type"] == "petersen_coil"
    assert len(payload.tap_changers) == 2
    types = {tc["type"] for tc in payload.tap_changers}
    assert "oltc" in types
    assert "detc" in types


def test_build_station_payload_with_ders():
    payload = build_station_audit2_payload(
        station_id="station_002",
        mv_neutral_grounding_ref="mng_resistor_low",
        der_specs=[
            {
                "der_id": "der_pv_001",
                "der_kind": "PV",
                "block_transformer_catalog_ref": "btr_pv_15_04_1000",
                "pf_curve_ref": "pf_pse_b",
            },
            {
                "der_id": "der_bess_001",
                "der_kind": "BESS",
                "bess_operation_mode_refs": ["mode_fcr_n"],
                "block_transformer_catalog_ref": "btr_bess_15_04_1600",
            },
        ],
    )
    assert len(payload.der_payloads) == 2
    pv = next(d for d in payload.der_payloads if d.der_id == "der_pv_001")
    assert pv.block_transformer is not None
    assert pv.block_transformer["sn_kva"] == 1000
    bess = next(d for d in payload.der_payloads if d.der_id == "der_bess_001")
    assert len(bess.bess_operation_modes) == 1


def test_extract_solver_extensions_short_circuit():
    """SC IEC 60909 dostaje grounding type + block-trafos."""
    payload = build_station_audit2_payload(
        station_id="station_003",
        mv_neutral_grounding_ref="mng_petersen",
        der_specs=[
            {
                "der_id": "der_001",
                "der_kind": "PV",
                "block_transformer_catalog_ref": "btr_pv_15_069_2500",
            }
        ],
    )
    ext = extract_solver_extensions_from_payload(payload)
    assert "mv_neutral_grounding" in ext["sc_iec60909_extensions"]
    assert (
        ext["sc_iec60909_extensions"]["mv_neutral_grounding"]["grounding_type"] == "petersen_coil"
    )
    assert "block_transformers" in ext["sc_iec60909_extensions"]
    assert len(ext["sc_iec60909_extensions"]["block_transformers"]) == 1


def test_extract_solver_extensions_power_flow():
    """NR PF dostaje tap-changers + BESS modes + P(f) curves."""
    payload = build_station_audit2_payload(
        station_id="station_004",
        tap_changer_refs=["tc_oltc_110sn_19_125"],
        der_specs=[
            {
                "der_id": "der_bess_001",
                "der_kind": "BESS",
                "bess_operation_mode_refs": ["mode_fcr_n"],
                "pf_curve_ref": "pf_pse_b",
            }
        ],
    )
    ext = extract_solver_extensions_from_payload(payload)
    assert "tap_changers" in ext["power_flow_extensions"]
    assert "bess_operation_modes_per_der" in ext["power_flow_extensions"]
    assert "p_f_curves_per_der" in ext["power_flow_extensions"]


def test_extract_solver_extensions_protection():
    """Protection IEC 60255 dostaje grounding type + P(f) curves."""
    payload = build_station_audit2_payload(
        station_id="station_005",
        mv_neutral_grounding_ref="mng_petersen",
        der_specs=[
            {
                "der_id": "der_001",
                "der_kind": "PV",
                "pf_curve_ref": "pf_pse_b",
            }
        ],
    )
    ext = extract_solver_extensions_from_payload(payload)
    assert ext["protection_extensions"]["grounding_type"] == "petersen_coil"
    assert "frequency_protection_curves" in ext["protection_extensions"]


def test_determinism_same_input_same_output():
    """Identyczny input -> identyczny payload (deterministic)."""
    spec = {
        "station_id": "station_det",
        "mv_neutral_grounding_ref": "mng_petersen",
        "tap_changer_refs": ["tc_oltc_110sn_19_125"],
        "der_specs": [
            {
                "der_id": "der_001",
                "der_kind": "BESS",
                "bess_operation_mode_refs": [
                    "mode_voltage_support",
                    "mode_fcr_n",
                ],  # nieuporzadkowane
                "pf_curve_ref": "pf_pse_b",
            }
        ],
    }
    p1 = build_station_audit2_payload(**spec)
    p2 = build_station_audit2_payload(**spec)
    assert p1.to_dict() == p2.to_dict()
    # Tryby BESS posortowane (deterministyczne).
    bess_ders = [d for d in p1.der_payloads if d.der_kind == "BESS"]
    assert len(bess_ders) == 1
    mode_ids = [m["id"] for m in bess_ders[0].bess_operation_modes]
    assert mode_ids == sorted(mode_ids)
