"""
Testy silnika diagnostycznego ENM (v4.2).

Testy reguł E-Dxx:
- BLOCKER: E-D01..E-D08
- WARN: W-D01..W-D03
- INFO: I-D01, I-D02

Testy integracyjne: ENM → diagnostics → preflight
"""

from __future__ import annotations

from diagnostics.engine import DiagnosticEngine
from diagnostics.models import (
    AnalysisAvailability,
    AnalysisType,
    DiagnosticSeverity,
    DiagnosticStatus,
)
from diagnostics.preflight import build_preflight_from_diagnostic_report, run_preflight
from diagnostics.rules import (
    rule_e_d01_no_source,
    rule_e_d02_voltage_mismatch,
    rule_e_d03_disconnected_islands,
    rule_e_d04_transformer_missing_sides,
    rule_e_d05_line_no_impedance,
    rule_e_d06_sc1f_no_zero_sequence,
    rule_e_d07_open_switches_isolate,
    rule_i_d01_full_analysis_available,
    rule_i_d02_topology_type,
    rule_w_d01_no_zero_sequence_data,
    rule_w_d02_extreme_parameters,
    rule_w_d03_multiple_sources,
)
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.inverter import InverterSource
from network_model.core.node import Node, NodeType
from network_model.core.switch import Switch, SwitchState, SwitchType

# ---------------------------------------------------------------------------
# Fixtures — helper functions for building test graphs
# ---------------------------------------------------------------------------


def _make_empty_graph() -> NetworkGraph:
    """Empty graph (no elements)."""
    return NetworkGraph(network_model_id="test-model")


def _make_valid_graph() -> NetworkGraph:
    """Minimal valid graph: 2 buses + 1 line + SLACK source."""
    g = NetworkGraph(network_model_id="test-model")
    g.add_node(
        Node(
            id="bus-1",
            name="Szyna GPZ",
            node_type=NodeType.SLACK,
            voltage_level=110.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="bus-2",
            name="Szyna RPZ",
            node_type=NodeType.PQ,
            voltage_level=110.0,
            active_power=10.0,
            reactive_power=5.0,
        )
    )
    g.add_branch(
        LineBranch(
            id="line-1",
            name="Linia L1",
            branch_type=BranchType.LINE,
            from_node_id="bus-1",
            to_node_id="bus-2",
            r_ohm_per_km=0.12,
            x_ohm_per_km=0.39,
            length_km=10.0,
            rated_current_a=400.0,
        )
    )
    return g


def _make_graph_no_source() -> NetworkGraph:
    """Graph without any source."""
    g = NetworkGraph(network_model_id="test-model")
    g.add_node(
        Node(
            id="bus-1",
            name="Szyna A",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=5.0,
            reactive_power=2.0,
        )
    )
    return g


def _make_graph_voltage_mismatch() -> NetworkGraph:
    """Graph with voltage mismatch on a line."""
    g = NetworkGraph(network_model_id="test-model")
    g.add_node(
        Node(
            id="bus-1",
            name="Szyna 110kV",
            node_type=NodeType.SLACK,
            voltage_level=110.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="bus-2",
            name="Szyna 20kV",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=5.0,
            reactive_power=2.0,
        )
    )
    # Line connecting 110kV to 20kV — wrong!
    g.add_branch(
        LineBranch(
            id="line-1",
            name="Linia X",
            branch_type=BranchType.LINE,
            from_node_id="bus-1",
            to_node_id="bus-2",
            r_ohm_per_km=0.1,
            x_ohm_per_km=0.3,
            length_km=5.0,
            rated_current_a=300.0,
        )
    )
    return g


def _make_disconnected_graph() -> NetworkGraph:
    """Graph with two disconnected islands."""
    g = NetworkGraph(network_model_id="test-model")
    g.add_node(
        Node(
            id="bus-1",
            name="Wyspa A",
            node_type=NodeType.SLACK,
            voltage_level=20.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="bus-2",
            name="Wyspa B",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=3.0,
            reactive_power=1.0,
        )
    )
    # No branch connecting them → disconnected
    return g


def _make_graph_zero_impedance() -> NetworkGraph:
    """Graph with a line that has zero impedance."""
    g = NetworkGraph(network_model_id="test-model")
    g.add_node(
        Node(
            id="bus-1",
            name="Szyna A",
            node_type=NodeType.SLACK,
            voltage_level=20.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="bus-2",
            name="Szyna B",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=5.0,
            reactive_power=2.0,
        )
    )
    g.add_branch(
        LineBranch(
            id="line-1",
            name="Linia Z0",
            branch_type=BranchType.LINE,
            from_node_id="bus-1",
            to_node_id="bus-2",
            r_ohm_per_km=0.0,
            x_ohm_per_km=0.0,
            length_km=1.0,
            rated_current_a=100.0,
        )
    )
    return g


def _make_graph_with_transformer() -> NetworkGraph:
    """Graph with transformer."""
    g = NetworkGraph(network_model_id="test-model")
    g.add_node(
        Node(
            id="bus-hv",
            name="Szyna GN",
            node_type=NodeType.SLACK,
            voltage_level=110.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="bus-lv",
            name="Szyna DN",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=10.0,
            reactive_power=5.0,
        )
    )
    g.add_branch(
        TransformerBranch(
            id="trafo-1",
            name="TR1 110/20",
            branch_type=BranchType.TRANSFORMER,
            from_node_id="bus-hv",
            to_node_id="bus-lv",
            rated_power_mva=40.0,
            voltage_hv_kv=110.0,
            voltage_lv_kv=20.0,
            uk_percent=10.0,
            pk_kw=100.0,
        )
    )
    return g


def _make_graph_with_open_switch() -> NetworkGraph:
    """Graph disconnected by open switch."""
    g = NetworkGraph(network_model_id="test-model")
    g.add_node(
        Node(
            id="bus-1",
            name="Szyna A",
            node_type=NodeType.SLACK,
            voltage_level=20.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="bus-2",
            name="Szyna B",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=3.0,
            reactive_power=1.0,
        )
    )
    g.add_switch(
        Switch(
            id="sw-1",
            name="Wyłącznik Q1",
            from_node_id="bus-1",
            to_node_id="bus-2",
            switch_type=SwitchType.BREAKER,
            state=SwitchState.OPEN,
        )
    )
    return g


# ---------------------------------------------------------------------------
# Unit tests — individual rules
# ---------------------------------------------------------------------------


class TestRuleED01NoSource:
    def test_no_source_detected(self):
        g = _make_graph_no_source()
        issues = rule_e_d01_no_source(g)
        assert len(issues) == 1
        assert issues[0].code == "E-D01"
        assert issues[0].severity == DiagnosticSeverity.BLOCKER

    def test_slack_source_ok(self):
        g = _make_valid_graph()
        issues = rule_e_d01_no_source(g)
        assert len(issues) == 0

    def test_inverter_source_ok(self):
        g = _make_graph_no_source()
        g.add_inverter_source(
            InverterSource(
                id="inv-1",
                name="OZE-1",
                node_id="bus-1",
                in_rated_a=100.0,
                k_sc=1.1,
            )
        )
        issues = rule_e_d01_no_source(g)
        assert len(issues) == 0


class TestRuleED02VoltageMismatch:
    def test_mismatch_detected(self):
        g = _make_graph_voltage_mismatch()
        issues = rule_e_d02_voltage_mismatch(g)
        assert len(issues) == 1
        assert issues[0].code == "E-D02"
        assert "110" in issues[0].message_pl and "20" in issues[0].message_pl

    def test_matching_voltages_ok(self):
        g = _make_valid_graph()
        issues = rule_e_d02_voltage_mismatch(g)
        assert len(issues) == 0


class TestRuleED03DisconnectedIslands:
    def test_disconnected_detected(self):
        g = _make_disconnected_graph()
        issues = rule_e_d03_disconnected_islands(g)
        assert len(issues) == 1
        assert issues[0].code == "E-D03"
        assert issues[0].severity == DiagnosticSeverity.BLOCKER

    def test_connected_ok(self):
        g = _make_valid_graph()
        issues = rule_e_d03_disconnected_islands(g)
        assert len(issues) == 0

    def test_empty_graph(self):
        g = _make_empty_graph()
        issues = rule_e_d03_disconnected_islands(g)
        assert len(issues) == 0


class TestRuleED04TransformerMissingSides:
    def test_valid_transformer(self):
        g = _make_graph_with_transformer()
        issues = rule_e_d04_transformer_missing_sides(g)
        assert len(issues) == 0

    def test_transformer_no_hv_voltage(self):
        g = NetworkGraph(network_model_id="test-model")
        g.add_node(
            Node(
                id="bus-hv",
                name="Szyna GN",
                node_type=NodeType.SLACK,
                voltage_level=110.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
            )
        )
        g.add_node(
            Node(
                id="bus-lv",
                name="Szyna DN",
                node_type=NodeType.PQ,
                voltage_level=20.0,
                active_power=5.0,
                reactive_power=2.0,
            )
        )
        g.add_branch(
            TransformerBranch(
                id="trafo-1",
                name="TR1",
                branch_type=BranchType.TRANSFORMER,
                from_node_id="bus-hv",
                to_node_id="bus-lv",
                rated_power_mva=40.0,
                voltage_hv_kv=0.0,
                voltage_lv_kv=20.0,  # HV = 0 → missing
                uk_percent=10.0,
                pk_kw=100.0,
            )
        )
        issues = rule_e_d04_transformer_missing_sides(g)
        assert len(issues) == 1
        assert issues[0].code == "E-D04"


class TestRuleED05LineNoImpedance:
    def test_zero_impedance_detected(self):
        g = _make_graph_zero_impedance()
        issues = rule_e_d05_line_no_impedance(g)
        assert len(issues) == 1
        assert issues[0].code == "E-D05"

    def test_nonzero_impedance_ok(self):
        g = _make_valid_graph()
        issues = rule_e_d05_line_no_impedance(g)
        assert len(issues) == 0

    def test_type_ref_skipped(self):
        """Lines with type_ref are skipped (catalog provides impedance)."""
        g = NetworkGraph(network_model_id="test-model")
        g.add_node(
            Node(
                id="bus-1",
                name="A",
                node_type=NodeType.SLACK,
                voltage_level=20.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
            )
        )
        g.add_node(
            Node(
                id="bus-2",
                name="B",
                node_type=NodeType.PQ,
                voltage_level=20.0,
                active_power=1.0,
                reactive_power=0.5,
            )
        )
        g.add_branch(
            LineBranch(
                id="line-1",
                name="Linia Z0",
                branch_type=BranchType.LINE,
                from_node_id="bus-1",
                to_node_id="bus-2",
                r_ohm_per_km=0.0,
                x_ohm_per_km=0.0,
                length_km=1.0,
                type_ref="YAKY-240",  # Has catalog reference
            )
        )
        issues = rule_e_d05_line_no_impedance(g)
        assert len(issues) == 0


class TestRuleED06Sc1fNoZeroSequence:
    def test_no_z0_data(self):
        g = _make_valid_graph()
        issues = rule_e_d06_sc1f_no_zero_sequence(g)
        # Lines without type_ref have no Z0 data
        assert len(issues) == 1
        assert issues[0].code == "E-D06"
        assert issues[0].severity == DiagnosticSeverity.WARN

    def test_with_type_ref_ok(self):
        """Lines with type_ref are assumed to have Z0."""
        g = NetworkGraph(network_model_id="test-model")
        g.add_node(
            Node(
                id="bus-1",
                name="A",
                node_type=NodeType.SLACK,
                voltage_level=20.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
            )
        )
        g.add_node(
            Node(
                id="bus-2",
                name="B",
                node_type=NodeType.PQ,
                voltage_level=20.0,
                active_power=1.0,
                reactive_power=0.5,
            )
        )
        g.add_branch(
            LineBranch(
                id="line-1",
                name="Linia",
                branch_type=BranchType.LINE,
                from_node_id="bus-1",
                to_node_id="bus-2",
                r_ohm_per_km=0.1,
                x_ohm_per_km=0.3,
                length_km=5.0,
                type_ref="YAKY-240",
            )
        )
        issues = rule_e_d06_sc1f_no_zero_sequence(g)
        assert len(issues) == 0


class TestRuleED07OpenSwitchesIsolate:
    def test_open_switch_disconnects(self):
        g = _make_graph_with_open_switch()
        issues = rule_e_d07_open_switches_isolate(g)
        assert len(issues) == 1
        assert issues[0].code == "E-D07"

    def test_closed_switch_ok(self):
        g = NetworkGraph(network_model_id="test-model")
        g.add_node(
            Node(
                id="bus-1",
                name="A",
                node_type=NodeType.SLACK,
                voltage_level=20.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
            )
        )
        g.add_node(
            Node(
                id="bus-2",
                name="B",
                node_type=NodeType.PQ,
                voltage_level=20.0,
                active_power=3.0,
                reactive_power=1.0,
            )
        )
        g.add_switch(
            Switch(
                id="sw-1",
                name="Q1",
                from_node_id="bus-1",
                to_node_id="bus-2",
                switch_type=SwitchType.BREAKER,
                state=SwitchState.CLOSED,
            )
        )
        issues = rule_e_d07_open_switches_isolate(g)
        assert len(issues) == 0

    def test_no_switches(self):
        g = _make_valid_graph()
        issues = rule_e_d07_open_switches_isolate(g)
        assert len(issues) == 0


class TestWarningRules:
    def test_w_d01_no_z0_data(self):
        g = _make_valid_graph()
        issues = rule_w_d01_no_zero_sequence_data(g)
        assert len(issues) == 1
        assert issues[0].code == "W-D01"
        assert issues[0].severity == DiagnosticSeverity.WARN

    def test_w_d02_extreme_parameters(self):
        g = NetworkGraph(network_model_id="test-model")
        g.add_node(
            Node(
                id="bus-1",
                name="A",
                node_type=NodeType.SLACK,
                voltage_level=20.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
            )
        )
        g.add_node(
            Node(
                id="bus-2",
                name="B",
                node_type=NodeType.PQ,
                voltage_level=20.0,
                active_power=1.0,
                reactive_power=0.5,
            )
        )
        g.add_branch(
            LineBranch(
                id="line-1",
                name="Linia Długa",
                branch_type=BranchType.LINE,
                from_node_id="bus-1",
                to_node_id="bus-2",
                r_ohm_per_km=0.1,
                x_ohm_per_km=0.3,
                length_km=200.0,  # >100 km → extreme
                rated_current_a=300.0,
            )
        )
        issues = rule_w_d02_extreme_parameters(g)
        assert any(i.code == "W-D02" for i in issues)

    def test_w_d03_multiple_sources(self):
        g = NetworkGraph(network_model_id="test-model")
        g.add_node(
            Node(
                id="bus-1",
                name="A",
                node_type=NodeType.SLACK,
                voltage_level=20.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
            )
        )
        for i in range(6):
            g.add_inverter_source(
                InverterSource(
                    id=f"inv-{i}",
                    name=f"OZE-{i}",
                    node_id="bus-1",
                    in_rated_a=100.0,
                    k_sc=1.1,
                )
            )
        issues = rule_w_d03_multiple_sources(g)
        assert len(issues) == 1
        assert issues[0].code == "W-D03"


class TestInfoRules:
    def test_i_d01_full_analysis_no_blockers(self):
        issues = rule_i_d01_full_analysis_available([])
        assert len(issues) == 1
        assert issues[0].code == "I-D01"

    def test_i_d01_no_info_with_blockers(self):
        from diagnostics.models import DiagnosticIssue

        blockers = [
            DiagnosticIssue(
                code="E-D01",
                severity=DiagnosticSeverity.BLOCKER,
                message_pl="test",
            )
        ]
        issues = rule_i_d01_full_analysis_available(blockers)
        assert len(issues) == 0

    def test_i_d02_radial_topology(self):
        g = _make_valid_graph()
        issues = rule_i_d02_topology_type(g)
        assert len(issues) == 1
        assert issues[0].code == "I-D02"
        assert "radialna" in issues[0].message_pl

    def test_i_d02_mesh_topology(self):
        g = NetworkGraph(network_model_id="test-model")
        g.add_node(
            Node(
                id="bus-1",
                name="A",
                node_type=NodeType.SLACK,
                voltage_level=20.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
            )
        )
        g.add_node(
            Node(
                id="bus-2",
                name="B",
                node_type=NodeType.PQ,
                voltage_level=20.0,
                active_power=1.0,
                reactive_power=0.5,
            )
        )
        g.add_node(
            Node(
                id="bus-3",
                name="C",
                node_type=NodeType.PQ,
                voltage_level=20.0,
                active_power=1.0,
                reactive_power=0.5,
            )
        )
        g.add_branch(
            LineBranch(
                id="line-1",
                name="L1",
                branch_type=BranchType.LINE,
                from_node_id="bus-1",
                to_node_id="bus-2",
                r_ohm_per_km=0.1,
                x_ohm_per_km=0.3,
                length_km=5.0,
                rated_current_a=300.0,
            )
        )
        g.add_branch(
            LineBranch(
                id="line-2",
                name="L2",
                branch_type=BranchType.LINE,
                from_node_id="bus-2",
                to_node_id="bus-3",
                r_ohm_per_km=0.1,
                x_ohm_per_km=0.3,
                length_km=5.0,
                rated_current_a=300.0,
            )
        )
        g.add_branch(
            LineBranch(
                id="line-3",
                name="L3",
                branch_type=BranchType.LINE,
                from_node_id="bus-3",
                to_node_id="bus-1",
                r_ohm_per_km=0.1,
                x_ohm_per_km=0.3,
                length_km=5.0,
                rated_current_a=300.0,
            )
        )
        issues = rule_i_d02_topology_type(g)
        assert any("oczkowa" in i.message_pl for i in issues)


# ---------------------------------------------------------------------------
# Integration tests — DiagnosticEngine
# ---------------------------------------------------------------------------


class TestDiagnosticEngine:
    def test_valid_graph_returns_ok(self):
        engine = DiagnosticEngine()
        g = _make_valid_graph()
        report = engine.run(g)
        # May have WARN/INFO but should not be FAIL
        assert report.status in (DiagnosticStatus.OK, DiagnosticStatus.WARN)
        assert len(report.blockers) == 0

    def test_empty_graph_returns_fail(self):
        engine = DiagnosticEngine()
        g = _make_empty_graph()
        report = engine.run(g)
        # Empty graph → no source → FAIL
        assert report.status == DiagnosticStatus.FAIL
        assert len(report.blockers) > 0

    def test_disconnected_graph_returns_fail(self):
        engine = DiagnosticEngine()
        g = _make_disconnected_graph()
        report = engine.run(g)
        assert report.status == DiagnosticStatus.FAIL
        blocker_codes = {i.code for i in report.blockers}
        assert "E-D03" in blocker_codes

    def test_report_deterministic_ordering(self):
        """Same graph produces same issue order."""
        engine = DiagnosticEngine()
        g = _make_disconnected_graph()
        report_1 = engine.run(g)
        report_2 = engine.run(g)
        assert [i.code for i in report_1.issues] == [i.code for i in report_2.issues]

    def test_analysis_matrix_populated(self):
        engine = DiagnosticEngine()
        g = _make_valid_graph()
        report = engine.run(g)
        matrix = report.analysis_matrix
        assert len(matrix.entries) == 4  # SC_3F, SC_1F, LF, PROTECTION

        # SC_3F should be AVAILABLE for valid graph
        sc3f = matrix.get(AnalysisType.SC_3F)
        assert sc3f is not None
        assert sc3f.availability == AnalysisAvailability.AVAILABLE

    def test_analysis_matrix_blocked_on_fail(self):
        engine = DiagnosticEngine()
        g = _make_graph_no_source()
        report = engine.run(g)
        matrix = report.analysis_matrix

        for entry in matrix.entries:
            assert entry.availability == AnalysisAvailability.BLOCKED

    def test_sc1f_blocked_without_z0(self):
        engine = DiagnosticEngine()
        g = _make_valid_graph()
        report = engine.run(g)
        sc1f = report.analysis_matrix.get(AnalysisType.SC_1F)
        assert sc1f is not None
        # SC_1F is blocked because lines without type_ref lack Z0 data
        assert sc1f.availability == AnalysisAvailability.BLOCKED

    def test_report_to_dict(self):
        engine = DiagnosticEngine()
        g = _make_valid_graph()
        report = engine.run(g)
        d = report.to_dict()
        assert "status" in d
        assert "issues" in d
        assert "analysis_matrix" in d
        assert isinstance(d["issues"], list)
        assert isinstance(d["analysis_matrix"]["entries"], list)


# ---------------------------------------------------------------------------
# Preflight integration tests
# ---------------------------------------------------------------------------


class TestPreflight:
    def test_preflight_valid_graph(self):
        g = _make_valid_graph()
        pf = run_preflight(g)
        assert pf.ready is True or pf.overall_status in ("OK", "WARN")
        assert len(pf.checks) == 4

    def test_preflight_blocked_graph(self):
        g = _make_graph_no_source()
        pf = run_preflight(g)
        assert pf.ready is False
        assert pf.overall_status == "FAIL"
        assert pf.blocker_count > 0

    def test_preflight_from_report(self):
        engine = DiagnosticEngine()
        g = _make_valid_graph()
        report = engine.run(g)
        pf = build_preflight_from_diagnostic_report(report)
        assert len(pf.checks) == 4

    def test_preflight_to_dict(self):
        g = _make_valid_graph()
        pf = run_preflight(g)
        d = pf.to_dict()
        assert "ready" in d
        assert "checks" in d
        assert isinstance(d["checks"], list)
        for check in d["checks"]:
            assert "analysis_type" in check
            assert "analysis_label_pl" in check
            assert "status" in check
