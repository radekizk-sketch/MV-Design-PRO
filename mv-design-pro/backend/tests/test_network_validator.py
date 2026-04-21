"""
Comprehensive tests for NetworkValidator.

Tests cover all validation rules:
- Network-level checks (empty, disconnected, no_source, no_slack, multiple_slack)
- Bus-level checks (voltage_invalid)
- Branch-level checks (self_loop, impedance_zero, length_zero, voltage_mismatch)
- Transformer checks (voltage_equal, hv_invalid, polarity_reversed)
- Switch checks (from_missing)
- InverterSource checks (bus_missing)
- Report serialization (to_dict with suggested_fix)

Aligned with PowerFactory "Check Network Data" diagnostic style.
"""

import sys
from pathlib import Path

# Add backend/src to path for imports
backend_src = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(backend_src))

from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.inverter import InverterSource
from network_model.core.node import Node, NodeType
from network_model.core.switch import Switch, SwitchState, SwitchType
from network_model.validation.validator import (
    NetworkValidator,
    Severity,
    ValidationIssue,
    ValidationReport,
    validate_network,
)

# =============================================================================
# Helper factories
# =============================================================================


def _slack_node(
    node_id: str = "slack-1",
    name: str = "SLACK Bus",
    voltage_level: float = 110.0,
) -> Node:
    """Create a valid SLACK node."""
    return Node(
        id=node_id,
        name=name,
        node_type=NodeType.SLACK,
        voltage_level=voltage_level,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
    )


def _pq_node(
    node_id: str = "pq-1",
    name: str = "PQ Bus",
    voltage_level: float = 110.0,
) -> Node:
    """Create a valid PQ node."""
    return Node(
        id=node_id,
        name=name,
        node_type=NodeType.PQ,
        voltage_level=voltage_level,
        active_power=10.0,
        reactive_power=5.0,
    )


def _line_branch(
    branch_id: str = "line-1",
    name: str = "Line L1",
    from_node_id: str = "slack-1",
    to_node_id: str = "pq-1",
    r_ohm_per_km: float = 0.2,
    x_ohm_per_km: float = 0.3,
    b_us_per_km: float = 3.0,
    length_km: float = 10.0,
    rated_current_a: float = 400.0,
) -> LineBranch:
    """Create a valid LineBranch."""
    return LineBranch(
        id=branch_id,
        name=name,
        branch_type=BranchType.LINE,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        r_ohm_per_km=r_ohm_per_km,
        x_ohm_per_km=x_ohm_per_km,
        b_us_per_km=b_us_per_km,
        length_km=length_km,
        rated_current_a=rated_current_a,
    )


def _transformer_branch(
    branch_id: str = "trafo-1",
    name: str = "Trafo T1",
    from_node_id: str = "slack-1",
    to_node_id: str = "pq-1",
    rated_power_mva: float = 40.0,
    voltage_hv_kv: float = 110.0,
    voltage_lv_kv: float = 15.0,
    uk_percent: float = 10.0,
    pk_kw: float = 150.0,
) -> TransformerBranch:
    """Create a valid TransformerBranch."""
    return TransformerBranch(
        id=branch_id,
        name=name,
        branch_type=BranchType.TRANSFORMER,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        rated_power_mva=rated_power_mva,
        voltage_hv_kv=voltage_hv_kv,
        voltage_lv_kv=voltage_lv_kv,
        uk_percent=uk_percent,
        pk_kw=pk_kw,
    )


def _build_valid_2bus_network() -> NetworkGraph:
    """
    Build a minimal valid 2-bus network.

    SLACK --[Line L1]-- PQ
    110 kV              110 kV
    """
    graph = NetworkGraph()
    graph.add_node(_slack_node())
    graph.add_node(_pq_node())
    graph.add_branch(_line_branch())
    return graph


def _has_code(report: ValidationReport, code: str) -> bool:
    """Check if report contains an issue with the given code."""
    return any(issue.code == code for issue in report.issues)


def _get_issues_by_code(report: ValidationReport, code: str) -> list:
    """Get all issues matching the given code."""
    return [issue for issue in report.issues if issue.code == code]


# =============================================================================
# Test 1: Valid network passes
# =============================================================================


class TestValidNetworkPasses:
    """A valid 2-bus network with SLACK, PQ, one line branch, voltages > 0."""

    def test_valid_network_passes(self):
        graph = _build_valid_2bus_network()
        validator = NetworkValidator()

        report = validator.validate(graph)

        assert report.is_valid is True
        assert len(report.errors) == 0

    def test_valid_network_no_errors_via_convenience(self):
        """The validate_network convenience function should also pass."""
        graph = _build_valid_2bus_network()

        report = validate_network(graph)

        assert report.is_valid is True
        assert len(report.errors) == 0


# =============================================================================
# Test 2: Empty network error
# =============================================================================


class TestEmptyNetworkError:
    """An empty graph should produce a network.empty error."""

    def test_empty_network_error(self):
        graph = NetworkGraph()
        validator = NetworkValidator()

        report = validator.validate(graph)

        assert report.is_valid is False
        assert _has_code(report, "network.empty")

    def test_empty_network_error_code_exact(self):
        graph = NetworkGraph()
        report = validate_network(graph)

        issues = _get_issues_by_code(report, "network.empty")
        assert len(issues) == 1
        assert issues[0].severity == Severity.ERROR


# =============================================================================
# Test 3: Disconnected network error
# =============================================================================


class TestDisconnectedNetworkError:
    """Two isolated nodes (no connecting branch) should produce network.disconnected."""

    def test_disconnected_network_error(self):
        graph = NetworkGraph()
        # Directly assign nodes to bypass add_node's SLACK uniqueness check
        # and add_branch's endpoint validation.
        slack = _slack_node(node_id="n1")
        pq = _pq_node(node_id="n2")
        graph.nodes["n1"] = slack
        graph.nodes["n2"] = pq
        # Rebuild the internal NetworkX graph so is_connected() works
        graph._rebuild_graph()

        report = validate_network(graph)

        assert report.is_valid is False
        assert _has_code(report, "network.disconnected")


# =============================================================================
# Test 4: No source error
# =============================================================================


class TestNoSourceError:
    """Two PQ nodes connected by a line but no source (no SLACK, no inverter)."""

    def test_no_source_error(self):
        graph = NetworkGraph()
        pq1 = _pq_node(node_id="pq-a", name="PQ A")
        pq2 = _pq_node(node_id="pq-b", name="PQ B")
        graph.nodes["pq-a"] = pq1
        graph.nodes["pq-b"] = pq2
        line = _line_branch(
            branch_id="line-ab",
            from_node_id="pq-a",
            to_node_id="pq-b",
        )
        graph.branches["line-ab"] = line
        graph._rebuild_graph()

        report = validate_network(graph)

        assert report.is_valid is False
        assert _has_code(report, "network.no_source")


# =============================================================================
# Test 5: No SLACK error (has inverter source but no SLACK node)
# =============================================================================


class TestNoSlackError:
    """Two PQ nodes with an inverter source but no SLACK node -> network.no_slack."""

    def test_no_slack_error(self):
        graph = NetworkGraph()
        pq1 = _pq_node(node_id="pq-a", name="PQ A")
        pq2 = _pq_node(node_id="pq-b", name="PQ B")
        graph.nodes["pq-a"] = pq1
        graph.nodes["pq-b"] = pq2
        line = _line_branch(
            branch_id="line-ab",
            from_node_id="pq-a",
            to_node_id="pq-b",
        )
        graph.branches["line-ab"] = line
        # Add an inverter source so the network.no_source check passes
        inv = InverterSource(
            id="inv-1",
            name="PV Inverter",
            node_id="pq-a",
            in_rated_a=100.0,
            k_sc=1.1,
            in_service=True,
        )
        graph.inverter_sources["inv-1"] = inv
        graph._rebuild_graph()

        report = validate_network(graph)

        # network.no_source should NOT fire (inverter is present)
        assert not _has_code(report, "network.no_source")
        # but network.no_slack should fire
        assert _has_code(report, "network.no_slack")
        assert report.is_valid is False


# =============================================================================
# Test 6: Multiple SLACK error
# =============================================================================


class TestMultipleSlackError:
    """Two SLACK nodes should produce network.multiple_slack error."""

    def test_multiple_slack_error(self):
        graph = NetworkGraph()
        slack1 = _slack_node(node_id="s1", name="SLACK 1")
        slack2 = _slack_node(node_id="s2", name="SLACK 2")
        # Directly assign to bypass add_node's single-SLACK constraint
        graph.nodes["s1"] = slack1
        graph.nodes["s2"] = slack2
        line = _line_branch(
            branch_id="line-s",
            from_node_id="s1",
            to_node_id="s2",
        )
        graph.branches["line-s"] = line
        graph._rebuild_graph()

        report = validate_network(graph)

        assert report.is_valid is False
        assert _has_code(report, "network.multiple_slack")


# =============================================================================
# Test 7: Bus voltage invalid error
# =============================================================================


class TestBusVoltageInvalidError:
    """Node with voltage_level=0 should produce bus.voltage_invalid error."""

    def test_bus_voltage_invalid_error(self):
        graph = NetworkGraph()
        slack = _slack_node(node_id="s1", voltage_level=110.0)
        pq_bad = _pq_node(node_id="pq-bad", voltage_level=0.0)
        graph.nodes["s1"] = slack
        graph.nodes["pq-bad"] = pq_bad
        line = _line_branch(
            branch_id="line-1",
            from_node_id="s1",
            to_node_id="pq-bad",
        )
        graph.branches["line-1"] = line
        graph._rebuild_graph()

        report = validate_network(graph)

        assert _has_code(report, "bus.voltage_invalid")
        issues = _get_issues_by_code(report, "bus.voltage_invalid")
        assert len(issues) >= 1
        assert issues[0].severity == Severity.ERROR
        assert issues[0].element_id == "pq-bad"
        assert issues[0].field == "voltage_level"


# =============================================================================
# Test 8: Branch self-loop error
# =============================================================================


class TestBranchSelfLoopError:
    """Branch with from_node_id == to_node_id should produce branch.self_loop."""

    def test_branch_self_loop_error(self):
        graph = NetworkGraph()
        slack = _slack_node(node_id="s1")
        pq = _pq_node(node_id="pq-1")
        graph.nodes["s1"] = slack
        graph.nodes["pq-1"] = pq
        # Valid line to keep network connected
        graph.branches["line-ok"] = _line_branch(
            branch_id="line-ok",
            from_node_id="s1",
            to_node_id="pq-1",
        )
        # Self-loop line: from_node == to_node
        self_loop = _line_branch(
            branch_id="line-loop",
            name="Self Loop",
            from_node_id="s1",
            to_node_id="s1",
        )
        graph.branches["line-loop"] = self_loop
        graph._rebuild_graph()

        report = validate_network(graph)

        assert _has_code(report, "branch.self_loop")
        issues = _get_issues_by_code(report, "branch.self_loop")
        assert len(issues) == 1
        assert issues[0].element_id == "line-loop"
        assert issues[0].severity == Severity.ERROR


# =============================================================================
# Test 9: Transformer voltage equal error
# =============================================================================


class TestTransformerVoltageEqualError:
    """Transformer with HV == LV should produce transformer.voltage_equal."""

    def test_transformer_voltage_equal_error(self):
        graph = NetworkGraph()
        slack = _slack_node(node_id="s1", voltage_level=110.0)
        pq = _pq_node(node_id="pq-1", voltage_level=110.0)
        graph.nodes["s1"] = slack
        graph.nodes["pq-1"] = pq
        trafo = _transformer_branch(
            branch_id="trafo-bad",
            name="Bad Trafo",
            from_node_id="s1",
            to_node_id="pq-1",
            voltage_hv_kv=110.0,
            voltage_lv_kv=110.0,  # Same as HV -> error
        )
        graph.branches["trafo-bad"] = trafo
        graph._rebuild_graph()

        report = validate_network(graph)

        assert _has_code(report, "transformer.voltage_equal")
        issues = _get_issues_by_code(report, "transformer.voltage_equal")
        assert len(issues) == 1
        assert issues[0].element_id == "trafo-bad"
        assert issues[0].severity == Severity.ERROR


# =============================================================================
# Test 10: Transformer HV invalid error
# =============================================================================


class TestTransformerHvInvalidError:
    """Transformer with voltage_hv_kv <= 0 should produce transformer.hv_invalid."""

    def test_transformer_hv_invalid_error(self):
        graph = NetworkGraph()
        slack = _slack_node(node_id="s1", voltage_level=110.0)
        pq = _pq_node(node_id="pq-1", voltage_level=15.0)
        graph.nodes["s1"] = slack
        graph.nodes["pq-1"] = pq
        trafo = _transformer_branch(
            branch_id="trafo-bad",
            name="Bad HV Trafo",
            from_node_id="s1",
            to_node_id="pq-1",
            voltage_hv_kv=0.0,  # Invalid HV
            voltage_lv_kv=15.0,
        )
        graph.branches["trafo-bad"] = trafo
        graph._rebuild_graph()

        report = validate_network(graph)

        assert _has_code(report, "transformer.hv_invalid")
        issues = _get_issues_by_code(report, "transformer.hv_invalid")
        assert len(issues) == 1
        assert issues[0].element_id == "trafo-bad"
        assert issues[0].field == "voltage_hv_kv"
        assert issues[0].severity == Severity.ERROR


# =============================================================================
# Test 11: Switch endpoint missing error
# =============================================================================


class TestSwitchEndpointMissingError:
    """Switch with from_node_id not in nodes should produce switch.from_missing."""

    def test_switch_from_missing_error(self):
        graph = NetworkGraph()
        slack = _slack_node(node_id="s1")
        pq = _pq_node(node_id="pq-1")
        graph.nodes["s1"] = slack
        graph.nodes["pq-1"] = pq
        graph.branches["line-ok"] = _line_branch(
            branch_id="line-ok",
            from_node_id="s1",
            to_node_id="pq-1",
        )
        # Switch with missing from_node_id
        sw = Switch(
            id="sw-bad",
            name="Bad Switch",
            from_node_id="nonexistent-node",
            to_node_id="pq-1",
            switch_type=SwitchType.BREAKER,
            state=SwitchState.CLOSED,
            in_service=True,
        )
        # Directly assign to bypass add_switch validation
        graph.switches["sw-bad"] = sw
        graph._rebuild_graph()

        report = validate_network(graph)

        assert _has_code(report, "switch.from_missing")
        issues = _get_issues_by_code(report, "switch.from_missing")
        assert len(issues) == 1
        assert issues[0].element_id == "sw-bad"
        assert issues[0].field == "from_node_id"
        assert issues[0].severity == Severity.ERROR


# =============================================================================
# Test 12: Inverter source bus missing error
# =============================================================================


class TestInverterSourceBusMissingError:
    """InverterSource with node_id not in nodes should produce source.bus_missing."""

    def test_inverter_source_bus_missing_error(self):
        graph = NetworkGraph()
        slack = _slack_node(node_id="s1")
        pq = _pq_node(node_id="pq-1")
        graph.nodes["s1"] = slack
        graph.nodes["pq-1"] = pq
        graph.branches["line-ok"] = _line_branch(
            branch_id="line-ok",
            from_node_id="s1",
            to_node_id="pq-1",
        )
        # Inverter source with node_id that does not exist
        inv = InverterSource(
            id="inv-bad",
            name="Bad Inverter",
            node_id="nonexistent-bus",
            in_rated_a=100.0,
            k_sc=1.1,
            in_service=True,
        )
        # Directly assign to bypass add_inverter_source validation
        graph.inverter_sources["inv-bad"] = inv
        graph._rebuild_graph()

        report = validate_network(graph)

        assert _has_code(report, "source.bus_missing")
        issues = _get_issues_by_code(report, "source.bus_missing")
        assert len(issues) == 1
        assert issues[0].element_id == "inv-bad"
        assert issues[0].field == "node_id"
        assert issues[0].severity == Severity.ERROR


# =============================================================================
# Test 13: Branch impedance zero warning
# =============================================================================


class TestBranchImpedanceZeroWarning:
    """Line with R=0 and X=0 should produce branch.impedance_zero warning."""

    def test_branch_impedance_zero_warning(self):
        graph = NetworkGraph()
        slack = _slack_node(node_id="s1")
        pq = _pq_node(node_id="pq-1")
        graph.nodes["s1"] = slack
        graph.nodes["pq-1"] = pq
        zero_line = _line_branch(
            branch_id="line-zero",
            name="Zero Impedance Line",
            from_node_id="s1",
            to_node_id="pq-1",
            r_ohm_per_km=0.0,
            x_ohm_per_km=0.0,
            length_km=10.0,
        )
        graph.branches["line-zero"] = zero_line
        graph._rebuild_graph()

        report = validate_network(graph)

        assert _has_code(report, "branch.impedance_zero")
        issues = _get_issues_by_code(report, "branch.impedance_zero")
        assert len(issues) == 1
        assert issues[0].severity == Severity.WARNING
        assert issues[0].element_id == "line-zero"

    def test_nonzero_impedance_no_warning(self):
        """A line with valid impedance should NOT produce this warning."""
        graph = _build_valid_2bus_network()

        report = validate_network(graph)

        assert not _has_code(report, "branch.impedance_zero")


# =============================================================================
# Test 14: Branch length zero warning
# =============================================================================


class TestBranchLengthZeroWarning:
    """Line with length_km=0 should produce branch.length_zero warning."""

    def test_branch_length_zero_warning(self):
        graph = NetworkGraph()
        slack = _slack_node(node_id="s1")
        pq = _pq_node(node_id="pq-1")
        graph.nodes["s1"] = slack
        graph.nodes["pq-1"] = pq
        short_line = _line_branch(
            branch_id="line-short",
            name="Zero Length Line",
            from_node_id="s1",
            to_node_id="pq-1",
            r_ohm_per_km=0.2,
            x_ohm_per_km=0.3,
            length_km=0.0,  # Zero length
        )
        graph.branches["line-short"] = short_line
        graph._rebuild_graph()

        report = validate_network(graph)

        assert _has_code(report, "branch.length_zero")
        issues = _get_issues_by_code(report, "branch.length_zero")
        assert len(issues) == 1
        assert issues[0].severity == Severity.WARNING
        assert issues[0].element_id == "line-short"
        assert issues[0].field == "length_km"


# =============================================================================
# Test 15: Transformer polarity reversed warning
# =============================================================================


class TestTransformerPolarityReversedWarning:
    """Transformer HV bus at lower voltage than LV bus -> transformer.polarity_reversed."""

    def test_transformer_polarity_reversed_warning(self):
        graph = NetworkGraph()
        # HV side node has LOWER voltage_level than LV side node
        slack = _slack_node(node_id="s1", voltage_level=15.0)  # Low voltage bus
        pq = _pq_node(node_id="pq-1", voltage_level=110.0)  # High voltage bus
        graph.nodes["s1"] = slack
        graph.nodes["pq-1"] = pq
        trafo = _transformer_branch(
            branch_id="trafo-rev",
            name="Reversed Trafo",
            from_node_id="s1",  # from_node (HV side) at 15 kV
            to_node_id="pq-1",  # to_node (LV side) at 110 kV
            voltage_hv_kv=110.0,
            voltage_lv_kv=15.0,
        )
        graph.branches["trafo-rev"] = trafo
        graph._rebuild_graph()

        report = validate_network(graph)

        assert _has_code(report, "transformer.polarity_reversed")
        issues = _get_issues_by_code(report, "transformer.polarity_reversed")
        assert len(issues) == 1
        assert issues[0].severity == Severity.WARNING
        assert issues[0].element_id == "trafo-rev"

    def test_correct_polarity_no_warning(self):
        """Transformer with HV bus at higher voltage should NOT warn."""
        graph = NetworkGraph()
        slack = _slack_node(node_id="s1", voltage_level=110.0)
        pq = _pq_node(node_id="pq-1", voltage_level=15.0)
        graph.nodes["s1"] = slack
        graph.nodes["pq-1"] = pq
        trafo = _transformer_branch(
            branch_id="trafo-ok",
            name="OK Trafo",
            from_node_id="s1",
            to_node_id="pq-1",
            voltage_hv_kv=110.0,
            voltage_lv_kv=15.0,
        )
        graph.branches["trafo-ok"] = trafo
        graph._rebuild_graph()

        report = validate_network(graph)

        assert not _has_code(report, "transformer.polarity_reversed")


# =============================================================================
# Test 16: Voltage consistency mismatch warning
# =============================================================================


class TestVoltageConsistencyMismatchWarning:
    """Line connecting buses at different voltages -> branch.voltage_mismatch."""

    def test_voltage_consistency_mismatch_warning(self):
        graph = NetworkGraph()
        slack = _slack_node(node_id="s1", voltage_level=110.0)
        pq = _pq_node(node_id="pq-1", voltage_level=15.0)  # Different voltage
        graph.nodes["s1"] = slack
        graph.nodes["pq-1"] = pq
        line = _line_branch(
            branch_id="line-mismatch",
            name="Mismatched Line",
            from_node_id="s1",
            to_node_id="pq-1",
        )
        graph.branches["line-mismatch"] = line
        graph._rebuild_graph()

        report = validate_network(graph)

        assert _has_code(report, "branch.voltage_mismatch")
        issues = _get_issues_by_code(report, "branch.voltage_mismatch")
        assert len(issues) == 1
        assert issues[0].severity == Severity.WARNING
        assert issues[0].element_id == "line-mismatch"

    def test_same_voltage_no_warning(self):
        """Line connecting buses at same voltage should NOT warn."""
        graph = _build_valid_2bus_network()

        report = validate_network(graph)

        assert not _has_code(report, "branch.voltage_mismatch")


# =============================================================================
# Test 17: Suggested fix present
# =============================================================================


class TestSuggestedFixPresent:
    """Verify that ALL validation issues have suggested_fix populated."""

    def test_suggested_fix_present_on_errors(self):
        """Trigger various errors and verify suggested_fix is not None/empty."""
        # Empty network triggers network.empty
        graph = NetworkGraph()
        report = validate_network(graph)
        for issue in report.issues:
            assert issue.suggested_fix is not None, f"Issue '{issue.code}' has no suggested_fix"
            assert len(issue.suggested_fix) > 0, f"Issue '{issue.code}' has empty suggested_fix"

    def test_suggested_fix_present_on_warnings(self):
        """Trigger warnings and verify suggested_fix."""
        graph = NetworkGraph()
        slack = _slack_node(node_id="s1")
        pq = _pq_node(node_id="pq-1")
        graph.nodes["s1"] = slack
        graph.nodes["pq-1"] = pq
        # Zero impedance triggers branch.impedance_zero warning
        # Zero length triggers branch.length_zero warning
        zero_line = _line_branch(
            branch_id="line-zero",
            name="Zero Line",
            from_node_id="s1",
            to_node_id="pq-1",
            r_ohm_per_km=0.0,
            x_ohm_per_km=0.0,
            length_km=0.0,
        )
        graph.branches["line-zero"] = zero_line
        graph._rebuild_graph()

        report = validate_network(graph)

        warnings = report.warnings
        assert len(warnings) >= 2, (
            f"Expected at least 2 warnings, got {len(warnings)}: " f"{[w.code for w in warnings]}"
        )
        for issue in warnings:
            assert issue.suggested_fix is not None, f"Warning '{issue.code}' has no suggested_fix"
            assert len(issue.suggested_fix) > 0, f"Warning '{issue.code}' has empty suggested_fix"

    def test_suggested_fix_present_across_all_rule_types(self):
        """Build a network that triggers many rules, verify all have suggested_fix."""
        graph = NetworkGraph()
        # Two SLACK nodes for multiple_slack
        s1 = _slack_node(node_id="s1", voltage_level=110.0)
        s2 = _slack_node(node_id="s2", voltage_level=0.0)  # Also voltage_invalid
        graph.nodes["s1"] = s1
        graph.nodes["s2"] = s2
        # Self-loop branch
        self_loop = _line_branch(
            branch_id="line-loop",
            name="Self Loop",
            from_node_id="s1",
            to_node_id="s1",
            r_ohm_per_km=0.0,
            x_ohm_per_km=0.0,
            length_km=0.0,
        )
        graph.branches["line-loop"] = self_loop
        # Connect the two nodes so network is connected
        connector = _line_branch(
            branch_id="line-connect",
            name="Connector",
            from_node_id="s1",
            to_node_id="s2",
        )
        graph.branches["line-connect"] = connector
        # Switch with missing endpoint
        sw = Switch(
            id="sw-bad",
            name="Bad Switch",
            from_node_id="missing-node",
            to_node_id="s1",
        )
        graph.switches["sw-bad"] = sw
        # Inverter with missing bus
        inv = InverterSource(
            id="inv-bad",
            name="Bad Inverter",
            node_id="missing-bus",
        )
        graph.inverter_sources["inv-bad"] = inv
        graph._rebuild_graph()

        report = validate_network(graph)

        assert len(report.issues) > 0
        for issue in report.issues:
            assert issue.suggested_fix is not None, f"Issue '{issue.code}' has no suggested_fix"
            assert len(issue.suggested_fix) > 0, f"Issue '{issue.code}' has empty suggested_fix"


# =============================================================================
# Test 18: ValidationReport to_dict format
# =============================================================================


class TestValidationReportToDict:
    """Verify to_dict() format includes suggested_fix and all expected keys."""

    def test_to_dict_structure_valid_network(self):
        graph = _build_valid_2bus_network()
        report = validate_network(graph)

        d = report.to_dict()

        assert "is_valid" in d
        assert "issues" in d
        assert "error_count" in d
        assert "warning_count" in d
        assert d["is_valid"] is True
        assert d["error_count"] == 0
        assert d["warning_count"] == 0
        assert isinstance(d["issues"], list)

    def test_to_dict_structure_with_issues(self):
        graph = NetworkGraph()
        report = validate_network(graph)

        d = report.to_dict()

        assert d["is_valid"] is False
        assert d["error_count"] >= 1
        assert len(d["issues"]) >= 1

        # Check each issue dict has all expected keys
        for issue_dict in d["issues"]:
            assert "code" in issue_dict
            assert "message" in issue_dict
            assert "severity" in issue_dict
            assert "element_id" in issue_dict
            assert "field" in issue_dict
            assert "suggested_fix" in issue_dict

    def test_to_dict_suggested_fix_present(self):
        """Verify suggested_fix is included in the serialized dict."""
        graph = NetworkGraph()
        report = validate_network(graph)

        d = report.to_dict()

        for issue_dict in d["issues"]:
            assert issue_dict["suggested_fix"] is not None
            assert isinstance(issue_dict["suggested_fix"], str)
            assert len(issue_dict["suggested_fix"]) > 0

    def test_to_dict_severity_is_string(self):
        """Severity should be serialized as its value string (ERROR/WARNING)."""
        graph = NetworkGraph()
        report = validate_network(graph)

        d = report.to_dict()

        for issue_dict in d["issues"]:
            assert issue_dict["severity"] in ("ERROR", "WARNING")

    def test_issue_to_dict_roundtrip(self):
        """ValidationIssue.to_dict() should produce a complete dict."""
        issue = ValidationIssue(
            code="test.code",
            message="Test message",
            severity=Severity.ERROR,
            element_id="elem-1",
            field="some_field",
            suggested_fix="Fix it",
        )

        d = issue.to_dict()

        assert d == {
            "code": "test.code",
            "message": "Test message",
            "severity": "ERROR",
            "element_id": "elem-1",
            "field": "some_field",
            "suggested_fix": "Fix it",
        }
