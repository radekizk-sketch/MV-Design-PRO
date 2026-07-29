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
    lfsm_factor,
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


def test_qu_deadband_reaches_control_from_meta() -> None:
    # V12K-064 (G-OZE-B4): napięciowe pasmo nieczułości Q(U) z meta → InverterControl.
    out = _build_converter_control_by_node(
        _snapshot(
            {
                "control_mode": "Q_OD_U",
                "qu_slope_pu_per_pu": 4.0,
                "qu_deadband_low_pu": 0.95,
                "qu_deadband_high_pu": 1.05,
            }
        ),
        base_mva=100.0,
    )
    ctrl = out[_graph_id_from_ref("bus-oze")]
    assert ctrl.mode is InverterMode.Q_U
    assert ctrl.qu_deadband_low_pu == 0.95
    assert ctrl.qu_deadband_high_pu == 1.05


def test_qu_deadband_defaults_to_point_without_meta() -> None:
    # Bez pasma → domyślny punkt 1.0/1.0 (reakcja natychmiastowa; determinizm).
    ctrl = _build_converter_control_by_node(
        _snapshot({"control_mode": "Q_OD_U", "qu_slope_pu_per_pu": 4.0}), base_mva=100.0
    )[_graph_id_from_ref("bus-oze")]
    assert ctrl.qu_deadband_low_pu == 1.0
    assert ctrl.qu_deadband_high_pu == 1.0


def test_unity_or_missing_is_not_attached_determinism() -> None:
    # cosφ=1 → brak wpisu (wynik PF bajt-w-bajt jak dotąd).
    assert (
        _build_converter_control_by_node(
            _snapshot({"control_mode": "STALY_COS_PHI", "cos_phi": 1.0}), base_mva=100.0
        )
        == {}
    )
    # Brak nowych pól (istniejące snapshoty) → brak wpisu.
    assert (
        _build_converter_control_by_node(
            _snapshot({"control_mode": "STALY_COS_PHI"}), base_mva=100.0
        )
        == {}
    )
    # Q(U) bez nachylenia → brak wpisu.
    assert (
        _build_converter_control_by_node(_snapshot({"control_mode": "Q_OD_U"}), base_mva=100.0)
        == {}
    )


# ------------------------------------------ P(f)/LFSM (G-OZE-B, V12K-062)


def test_pf_droop_attaches_control_with_lfsm() -> None:
    # Statyzm P(f) z generatora → InverterControl z lfsm_droop_pct (zależność częstotliwościowa).
    out = _build_converter_control_by_node(
        _snapshot({"control_mode": "STALY_COS_PHI", "frequency_droop_percent": 5.0}),
        base_mva=100.0,
    )
    node_id = _graph_id_from_ref("bus-oze")
    assert node_id in out
    assert out[node_id].lfsm_droop_pct == 5.0
    assert out[node_id].has_frequency_dependence()


def test_pf_droop_active_regardless_of_q_mode() -> None:
    # Źródło bez aktywnej regulacji Q, ale z P(f) droop → nadal dołączone (statyzm f).
    out = _build_converter_control_by_node(
        _snapshot({"control_mode": "WYLACZONE", "frequency_droop_percent": 4.0}),
        base_mva=100.0,
    )
    assert _graph_id_from_ref("bus-oze") in out


def test_bess_lfsm_allow_increase_from_meta() -> None:
    # Magazyn (LFSM-U) może podnosić P poniżej f0 — flaga z meta.
    out = _build_converter_control_by_node(
        _snapshot({"frequency_droop_percent": 5.0, "lfsm_allow_increase": True}),
        base_mva=100.0,
    )
    assert out[_graph_id_from_ref("bus-oze")].lfsm_allow_increase is True


def test_lfsm_factor_reduces_p_at_overfrequency() -> None:
    ctrl = _build_converter_control_by_node(
        _snapshot({"control_mode": "STALY_COS_PHI", "frequency_droop_percent": 5.0}),
        base_mva=100.0,
    )[_graph_id_from_ref("bus-oze")]
    # Nadczęstotliwość 50.5 Hz (LFSM-O) → redukcja mocy czynnej (< 1.0); przy 50 Hz brak zmiany.
    assert lfsm_factor(ctrl, 50.5) < 1.0
    assert lfsm_factor(ctrl, 50.0) == 1.0


def test_pf_droop_absent_is_deterministic() -> None:
    # Brak statyzmu P(f) → brak wpisu (determinizm istniejących snapshotów).
    assert (
        _build_converter_control_by_node(
            _snapshot(
                {"control_mode": "STALY_COS_PHI", "cos_phi": 1.0, "frequency_droop_percent": 0.0}
            ),
            base_mva=100.0,
        )
        == {}
    )
