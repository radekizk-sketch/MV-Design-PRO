"""Analysis-layer interpretation of the per-machine SC breakdown (IEC 60909 §6.6).

Validates that ``interpret_machine_contributions`` turns the SOLVER result
(``compute_machine_contributions`` — works on ANY network) into a deterministic,
read-only interpretation: per-machine near-/far-from-generator classification, totals,
small-motor omission, and a Polish summary. No physics here — the module reads an
already-computed result. The graphs below are arbitrary user networks (not archetypes).
"""

import pytest
from analysis.machine_short_circuit import interpret_machine_contributions
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.machine import AsynchronousMachineSource, SynchronousMachineSource
from network_model.core.node import Node, NodeType
from network_model.solvers.machine_sc_iec60909 import compute_machine_contributions


def _slack_line_bus() -> NetworkGraph:
    g = NetworkGraph()
    g.add_node(
        Node(
            id="GPZ",
            name="GPZ",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            active_power=0.0,
            reactive_power=0.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="B",
            name="B",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    g.add_branch(
        LineBranch(
            id="L",
            name="L",
            branch_type=BranchType.LINE,
            from_node_id="GPZ",
            to_node_id="B",
            r_ohm_per_km=0.45,
            x_ohm_per_km=0.90,
            b_us_per_km=0.0,
            length_km=1.0,
            rated_current_a=0.0,
        )
    )
    return g


def _sync() -> SynchronousMachineSource:
    return SynchronousMachineSource(
        id="G",
        name="GEN",
        node_id="B",
        sr_mva=5.0,
        ur_kv=15.0,
        xd_subtransient_pu=0.15,
        cos_phi_r=0.8,
        c_max=1.1,
    )


def _async() -> AsynchronousMachineSource:
    return AsynchronousMachineSource(
        id="M",
        name="MOT",
        node_id="B",
        pr_mw=2.0,
        ur_kv=15.0,
        cos_phi_r=0.85,
        efficiency=0.95,
        i_lr_ratio=5.0,
        pole_pairs=2,
    )


def _dfig() -> AsynchronousMachineSource:
    return AsynchronousMachineSource(
        id="W",
        name="DFIG",
        node_id="B",
        pr_mw=2.0,
        ur_kv=15.0,
        cos_phi_r=0.90,
        efficiency=0.96,
        i_lr_ratio=4.0,
        pole_pairs=2,
        wind_type_3=True,
    )


def _interpret(graph: NetworkGraph):
    return interpret_machine_contributions(
        compute_machine_contributions(graph, "B", c_factor=1.1, t_min_s=0.10)
    )


def test_no_machines_empty_interpretation():
    interp = _interpret(_slack_line_bus())
    assert interp.has_machines is False
    assert interp.machine_count == 0
    assert interp.findings == ()
    assert interp.near_generator_count == 0
    assert "Brak maszyn" in interp.summary_pl


def test_synchronous_interpretation():
    g = _slack_line_bus()
    g.add_synchronous_machine_source(_sync())
    interp = _interpret(g)
    assert interp.has_machines is True
    assert interp.machine_count == 1
    f = interp.findings[0]
    assert f.machine_type == "SYNCHRONOUS"
    assert f.is_synchronous_machine is True
    assert f.q == 1.0
    assert f.near_generator is (f.mu < 1.0)
    assert "synchroniczna" in f.why_pl
    assert "q=" not in f.why_pl  # synchronous: μ only, no motor q term


def test_asynchronous_interpretation():
    g = _slack_line_bus()
    g.add_asynchronous_machine_source(_async())
    f = _interpret(g).findings[0]
    assert f.machine_type == "ASYNCHRONOUS"
    assert f.is_synchronous_machine is False
    assert 0.0 < f.q <= 1.0
    assert "asynchroniczna" in f.why_pl
    assert "q=" in f.why_pl


def test_dfig_interpretation_mentions_crowbar():
    g = _slack_line_bus()
    g.add_asynchronous_machine_source(_dfig())
    f = _interpret(g).findings[0]
    assert f.machine_type == "DFIG"
    assert f.is_synchronous_machine is False
    assert "DFIG" in f.why_pl
    assert "crowbar" in f.why_pl
    assert "q=" in f.why_pl


def test_multi_machine_counts_sums_and_classification():
    g = _slack_line_bus()
    g.add_synchronous_machine_source(_sync())
    g.add_asynchronous_machine_source(_async())
    interp = _interpret(g)
    assert interp.machine_count == 2
    # Totals equal the sum of the per-machine partials (no physics — just aggregation).
    assert interp.ikss_machines_ka == pytest.approx(
        sum(f.ikss_partial_ka for f in interp.findings), rel=1e-9
    )
    assert interp.ib_machines_ka == pytest.approx(
        sum(f.ib_partial_ka for f in interp.findings), rel=1e-9
    )
    # near_generator is exactly μ<1 for every machine; the count matches.
    for f in interp.findings:
        assert f.near_generator is (f.mu < 1.0)
    assert interp.near_generator_count == sum(1 for f in interp.findings if f.mu < 1.0)
    assert f"{interp.machine_count} maszyn" in interp.summary_pl


def test_determinism_and_serialization():
    g = _slack_line_bus()
    g.add_synchronous_machine_source(_sync())
    g.add_asynchronous_machine_source(_async())
    res = compute_machine_contributions(g, "B", c_factor=1.1, t_min_s=0.10)
    a = interpret_machine_contributions(res).to_dict()
    b = interpret_machine_contributions(res).to_dict()
    assert a == b  # deterministic
    assert set(a.keys()) == {
        "standard",
        "fault_node_id",
        "c_factor",
        "t_min_s",
        "has_machines",
        "machine_count",
        "ikss_machines_ka",
        "ib_machines_ka",
        "motors_negligible",
        "near_generator_count",
        "findings",
        "summary_pl",
    }
    assert set(a["findings"][0].keys()) == {
        "source_id",
        "source_name",
        "machine_type",
        "node_id",
        "ikss_partial_ka",
        "ib_partial_ka",
        "mu",
        "q",
        "ir_ka",
        "near_generator",
        "is_synchronous_machine",
        "why_pl",
    }
