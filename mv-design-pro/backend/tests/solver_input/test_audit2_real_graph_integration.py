"""
Test integracji audit2 z prawdziwym NetworkGraph z core/graph.py (Phase 29).

Sprawdza:
- apply_audit2_to_network_model dziala na realnym NetworkGraph (nie mock).
- Modyfikuje TransformerBranch.tap_position (real model field).
- Modyfikuje InverterSource (real model class) — ustawia frequency_droop_percent
  jako dynamic attribute.
- Mapping branch.id <-> transformer_to_tap_changer.
"""

from __future__ import annotations

import pytest


def _make_real_graph_with_transformer_and_inverter():
    """Buduje minimalny NetworkGraph z 1 transformatorem + 1 inverter source."""
    from network_model.catalog.types import ConverterKind
    from network_model.core.branch import BranchType, TransformerBranch
    from network_model.core.graph import NetworkGraph
    from network_model.core.inverter import InverterSource
    from network_model.core.node import Node, NodeType

    graph = NetworkGraph()
    # SLACK + PQ wezly z wymaganymi polami.
    bus_hv = Node(
        id="bus-hv",
        name="HV bus",
        voltage_level=110.0,
        node_type=NodeType.SLACK,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
    )
    bus_lv = Node(
        id="bus-lv",
        name="LV bus",
        voltage_level=15.0,
        node_type=NodeType.PQ,
        active_power=1.0,
        reactive_power=0.0,
    )
    graph.nodes[bus_hv.id] = bus_hv
    graph.nodes[bus_lv.id] = bus_lv

    # Transformer.
    tr = TransformerBranch(
        id="tr_001",
        name="TR-001",
        branch_type=BranchType.TRANSFORMER,
        from_node_id="bus-hv",
        to_node_id="bus-lv",
        rated_power_mva=25.0,
        voltage_hv_kv=110.0,
        voltage_lv_kv=15.0,
        uk_percent=10.5,
        pk_kw=120.0,
        i0_percent=0.5,
        p0_kw=15.0,
        vector_group="YNd11",
        tap_position=5,  # initial non-neutral
        tap_step_percent=2.5,
    )
    graph.branches[tr.id] = tr

    # Inverter source.
    inv = InverterSource(
        id="der_pv_001",
        name="PV-001",
        node_id="bus-lv",
        type_ref="pv_inv_sma_2500",
        converter_kind=ConverterKind.PV,
        in_rated_a=100.0,
        k_sc=1.1,
    )
    graph.inverter_sources[inv.id] = inv
    return graph


def test_apply_audit2_to_real_network_graph_tap_position():
    """Phase 29: tap-changer apply na real NetworkGraph z TransformerBranch."""
    pytest.importorskip("network_model")
    from solver_input.audit2_solver_adjuster import apply_audit2_to_network_model

    graph = _make_real_graph_with_transformer_and_inverter()
    extensions = {
        "power_flow_extensions": {
            "transformer_to_tap_changer": {
                "tr_001": {
                    "id": "tc_oltc_110sn_19_125",
                    "neutral_position": 0,
                    "step_percent": 1.25,
                },
            },
        },
    }
    applied = apply_audit2_to_network_model(graph=graph, audit2_extensions=extensions)

    # Real TransformerBranch.tap_position changed.
    assert graph.branches["tr_001"].tap_position == 0
    assert graph.branches["tr_001"].tap_step_percent == 1.25
    assert applied["tap_position_changes"]["tr_001"]["tap_changer_id"] == "tc_oltc_110sn_19_125"


def test_rezerwa_magazynu_nie_dotyka_realnego_zrodla_falownikowego():
    """Karta K-Q na REALNYM grafie (nie na atrapie).

    INTENCJA POPRZEDNIEGO TESTU: pilnowal, ze rezerwa mocy z katalogu trybow
    laduje na `InverterSource`. Procent rezerwy nie mial zrodla, a mnoznik mocy
    byl zalozeniem „kazdy magazyn ma 1 MW" — pole usuniete z katalogu, wiec
    zrodlo w grafie nie dostaje juz zadnego atrybutu rezerwy.
    """
    pytest.importorskip("network_model")
    from solver_input.audit2_solver_adjuster import apply_audit2_to_network_model

    graph = _make_real_graph_with_transformer_and_inverter()
    extensions = {
        "power_flow_extensions": {
            "bess_operation_modes_per_der": [
                {"der_id": "der_pv_001", "mode": {"mode_code": "fcr_n"}},
            ],
        },
    }
    applied = apply_audit2_to_network_model(graph=graph, audit2_extensions=extensions)

    inv = graph.inverter_sources["der_pv_001"]
    assert not hasattr(inv, "reserved_capacity_percent")
    assert "bess_reserved_changes" not in applied


def test_apply_audit2_to_real_network_graph_pf_droop():
    """Phase 29: P(f) droop na real InverterSource z f_min/max/deadband."""
    pytest.importorskip("network_model")
    from solver_input.audit2_solver_adjuster import apply_audit2_to_network_model

    graph = _make_real_graph_with_transformer_and_inverter()
    extensions = {
        "power_flow_extensions": {
            "p_f_curves_per_der": [
                {
                    "der_id": "der_pv_001",
                    "curve": {
                        "droop_percent": 5.0,
                        "f_min_hz": 47.5,
                        "f_max_hz": 51.5,
                        "deadband_hz": 0.2,
                    },
                },
            ],
        },
    }
    applied = apply_audit2_to_network_model(graph=graph, audit2_extensions=extensions)

    inv = graph.inverter_sources["der_pv_001"]
    assert inv.frequency_droop_percent == 5.0
    assert inv.f_min_hz == 47.5
    assert inv.f_max_hz == 51.5
    assert inv.deadband_hz == 0.2
    assert "der_pv_001" in applied["pf_droop_changes"]


def test_etykieta_uziemienia_nie_dopisuje_z0_z1_do_realnego_grafu():
    """Karta K-Q na REALNYM grafie — PIN KLASY po wszystkich wariantach."""
    pytest.importorskip("network_model")
    from solver_input.audit2_solver_adjuster import apply_audit2_to_network_model

    for grounding_type in ("isolated", "petersen_coil", "resistor_grounded", "directly_grounded"):
        graph = _make_real_graph_with_transformer_and_inverter()
        extensions = {
            "sc_iec60909_extensions": {
                "mv_neutral_grounding": {"grounding_type": grounding_type},
            },
        }
        applied = apply_audit2_to_network_model(graph=graph, audit2_extensions=extensions)
        assert "grounding_z0_z1_ratio" not in applied, grounding_type
        assert not hasattr(graph, "z0_z1_ratio"), grounding_type


def test_apply_audit2_to_real_network_graph_full_combination():
    """Pelna kombinacja na real graph — trzy tory z pokryciem w danych."""
    pytest.importorskip("network_model")
    from solver_input.audit2_solver_adjuster import apply_audit2_to_network_model

    graph = _make_real_graph_with_transformer_and_inverter()
    extensions = {
        "power_flow_extensions": {
            "transformer_to_tap_changer": {
                "tr_001": {"id": "tc1", "neutral_position": 0, "step_percent": 1.25},
            },
            "bess_operation_modes_per_der": [
                {"der_id": "der_pv_001", "mode": {"mode_code": "voltage_support"}},
            ],
            "p_f_curves_per_der": [
                {
                    "der_id": "der_pv_001",
                    "curve": {
                        "droop_percent": 4.0,
                        "f_min_hz": 47.5,
                        "f_max_hz": 51.5,
                        "deadband_hz": 0.2,
                    },
                },
            ],
        },
        "sc_iec60909_extensions": {
            "mv_neutral_grounding": {"grounding_type": "isolated"},
        },
    }
    applied = apply_audit2_to_network_model(graph=graph, audit2_extensions=extensions)

    # Tory z pokryciem w danych: zaczep i P(f).
    assert graph.branches["tr_001"].tap_position == 0
    assert graph.branches["tr_001"].tap_step_percent == 1.25
    assert graph.inverter_sources["der_pv_001"].frequency_droop_percent == 4.0
    assert applied["tap_position_changes"]
    assert applied["pf_droop_changes"]
    # Tory bez pokrycia (karta K-Q) nie zostawiaja sladu ANI na grafie.
    assert "bess_reserved_changes" not in applied
    assert "grounding_z0_z1_ratio" not in applied
    assert not hasattr(graph.inverter_sources["der_pv_001"], "reserved_capacity_percent")
    assert not hasattr(graph, "z0_z1_ratio")


def test_apply_audit2_to_real_network_graph_determinism():
    """Phase 29: identyczny input + graph -> identyczny output (after-state)."""
    pytest.importorskip("network_model")
    from solver_input.audit2_solver_adjuster import apply_audit2_to_network_model

    extensions = {
        "power_flow_extensions": {
            "transformer_to_tap_changer": {
                "tr_001": {"id": "tc1", "neutral_position": 0, "step_percent": 1.25},
            },
        },
    }

    g1 = _make_real_graph_with_transformer_and_inverter()
    g2 = _make_real_graph_with_transformer_and_inverter()
    a1 = apply_audit2_to_network_model(graph=g1, audit2_extensions=extensions)
    a2 = apply_audit2_to_network_model(graph=g2, audit2_extensions=extensions)
    assert a1 == a2
    assert g1.branches["tr_001"].tap_position == g2.branches["tr_001"].tap_position
