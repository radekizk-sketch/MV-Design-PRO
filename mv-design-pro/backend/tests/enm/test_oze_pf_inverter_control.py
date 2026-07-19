"""G-OZE-PF (V12K-051): regulacja falownika OZE wpięta w kanoniczny PF.

Naprawa forward-phantomu: (a) most języka Polish→InverterMode w
`inverter_control_from_params`, (b) `_build_converter_control_by_node` dołącza
InverterControl do węzłów OZE, ale WYŁĄCZNIE dla realnie aktywnych regulacji
(cosφ≠1 / nachylenie Q(U)≠0) — determinizm dla źródeł pasywnych/unity.
"""

from __future__ import annotations

from enm.canonical_analysis import _build_converter_control_by_node, _graph_id_from_ref
from network_model.solvers.power_flow_inverter import (
    InverterMode,
    inverter_control_from_params,
)


# --------------------------------------------------------- most języka (Part A)

def test_polish_stary_cosphi_maps_to_cosphi_const_and_injects_q() -> None:
    ctrl = inverter_control_from_params(
        {"control_mode": "STALY_COS_PHI", "cosphi": 0.9, "pmax_mw": 1.0}, base_mva=100.0
    )
    assert ctrl is not None
    assert ctrl.mode is InverterMode.COSPHI_CONST
    # cosφ=0.9 → q/|P| = tan(arccos 0.9) > 0 (nadwzbudzenie, wstrzykuje Q).
    assert ctrl.q_over_p > 0.0


def test_polish_q_od_u_maps_to_q_u() -> None:
    ctrl = inverter_control_from_params(
        {"control_mode": "Q_OD_U", "qu_slope_pu_per_pu": 2.0, "pmax_mw": 1.0}, base_mva=100.0
    )
    assert ctrl is not None
    assert ctrl.mode is InverterMode.Q_U


def test_unity_cosphi_is_passive() -> None:
    # STALY_COS_PHI z cosφ=1.0 → q/|P|=0 → pasywne (None) → brak wpływu na PF.
    assert (
        inverter_control_from_params(
            {"control_mode": "STALY_COS_PHI", "cosphi": 1.0}, base_mva=100.0
        )
        is None
    )


def test_wylaczone_and_p_od_u_are_passive() -> None:
    assert inverter_control_from_params({"control_mode": "WYLACZONE"}, base_mva=100.0) is None
    # P(U) nie modelowane w steady-state PF → pasywne (brak wpływu na Q).
    assert inverter_control_from_params({"control_mode": "P_OD_U"}, base_mva=100.0) is None


# ------------------------------------------ kanoniczne wpięcie (Part B) + determinizm

def _snapshot(meta: dict) -> dict:
    return {"generators": [{"ref_id": "g1", "bus_ref": "bus-oze", "p_mw": 1.0, "meta": meta}]}


def test_active_cosphi_attaches_control_to_node() -> None:
    out = _build_converter_control_by_node(
        _snapshot({"control_mode": "STALY_COS_PHI", "cos_phi": 0.9}), base_mva=100.0
    )
    node_id = _graph_id_from_ref("bus-oze")
    assert node_id in out
    assert out[node_id].mode is InverterMode.COSPHI_CONST


def test_active_qu_slope_attaches_control() -> None:
    out = _build_converter_control_by_node(
        _snapshot({"control_mode": "Q_OD_U", "qu_slope_pu_per_pu": 2.0}), base_mva=100.0
    )
    assert _graph_id_from_ref("bus-oze") in out


def test_unity_or_missing_is_not_attached_determinism() -> None:
    # cosφ=1 → brak wpisu (wynik PF bajt-w-bajt jak dotąd).
    assert _build_converter_control_by_node(
        _snapshot({"control_mode": "STALY_COS_PHI", "cos_phi": 1.0}), base_mva=100.0
    ) == {}
    # Brak nowych pól (istniejące snapshoty) → brak wpisu.
    assert _build_converter_control_by_node(
        _snapshot({"control_mode": "STALY_COS_PHI"}), base_mva=100.0
    ) == {}
    # Q(U) bez nachylenia → brak wpisu.
    assert _build_converter_control_by_node(
        _snapshot({"control_mode": "Q_OD_U"}), base_mva=100.0
    ) == {}
