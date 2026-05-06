"""
Testy audit2_solver_adjuster (Phase 16) — pre-solver adjustments z audit2_extensions.
"""

from __future__ import annotations

from solver_input.audit2_solver_adjuster import (
    Audit2Adjustments,
    apply_audit2_to_network_model,
    compute_audit2_adjustments,
)


def test_compute_adjustments_none_returns_empty():
    adj = compute_audit2_adjustments(None)
    assert adj.is_empty()
    assert adj.to_dict()["tap_position_changes"] == {}


def test_compute_adjustments_empty_dict_returns_empty():
    adj = compute_audit2_adjustments({})
    assert adj.is_empty()


def test_compute_adjustments_tap_changer_neutral_position():
    extensions = {
        "power_flow_extensions": {
            "tap_changers": [
                {"id": "tc_oltc_110sn_19_125", "type": "oltc", "neutral_position": 0},
            ],
        },
    }
    adj = compute_audit2_adjustments(extensions)
    assert "tc_oltc_110sn_19_125" in adj.tap_position_changes
    assert adj.tap_position_changes["tc_oltc_110sn_19_125"] == 0


def test_compute_adjustments_bess_p_reserved():
    extensions = {
        "power_flow_extensions": {
            "bess_operation_modes_per_der": [
                {
                    "der_id": "der_001",
                    "mode": {"reserved_capacity_percent": 50.0},
                }
            ],
        },
    }
    adj = compute_audit2_adjustments(extensions)
    assert adj.bess_p_reserved_changes["der_001"] == 50.0 * 10


def test_compute_adjustments_pf_droop_with_id_lookup():
    extensions = {
        "power_flow_extensions": {
            "p_f_curves_per_der": [
                {"der_id": "der_001", "curve": {"id": "pf_pse_b"}},
            ],
        },
    }
    adj = compute_audit2_adjustments(extensions)
    # PSE modul B ma droop 5%
    assert adj.pf_droop_changes["der_001"] == 5.0


def test_compute_adjustments_block_transformer_z():
    extensions = {
        "sc_iec60909_extensions": {
            "block_transformers": [
                {"der_id": "der_001", "transformer": {"id": "btr_pv_15_069_2500"}},
            ],
        },
    }
    adj = compute_audit2_adjustments(extensions)
    z = adj.block_transformer_z_pu["der_001"]
    # btr_pv_15_069_2500: uk=6%, pk=24kW, sn=2500kVA -> uR=24/2500=0.96%, uX≈√(36-0.92)≈5.92%
    assert abs(z["r_pu"] - 0.0096) < 0.001
    assert 0.05 < z["x_pu"] < 0.07  # ≈0.0592


def test_compute_adjustments_grounding_z0_z1_ratio_per_type():
    cases = [
        ("isolated", 100.0),
        ("petersen_coil", 50.0),
        ("resistor_grounded", 5.0),
        ("directly_grounded", 1.0),
    ]
    for grounding_type, expected_ratio in cases:
        extensions = {
            "sc_iec60909_extensions": {
                "mv_neutral_grounding": {"grounding_type": grounding_type},
            },
        }
        adj = compute_audit2_adjustments(extensions)
        assert adj.grounding_z0_z1_ratio == expected_ratio, (
            f"Grounding {grounding_type} -> Z0/Z1 = {expected_ratio}"
        )


def test_apply_to_network_model_passes_through_when_no_extensions():
    """Brak extensions -> graph bez zmian."""
    graph = {"branches": {}, "buses": {}}
    result = apply_audit2_to_network_model(graph=graph, audit2_extensions=None)
    assert result is graph


def test_apply_to_network_model_no_op_when_empty_adjustments():
    """Empty extensions -> graph bez zmian."""
    graph = {"branches": {}, "buses": {}}
    result = apply_audit2_to_network_model(graph=graph, audit2_extensions={})
    assert result is graph


def test_determinism_same_extensions_same_adjustments():
    extensions = {
        "power_flow_extensions": {
            "tap_changers": [{"id": "tc_oltc_110sn_19_125", "neutral_position": 0}],
            "p_f_curves_per_der": [
                {"der_id": "d1", "curve": {"id": "pf_pse_b"}},
            ],
        },
    }
    a1 = compute_audit2_adjustments(extensions)
    a2 = compute_audit2_adjustments(extensions)
    assert a1.to_dict() == a2.to_dict()
