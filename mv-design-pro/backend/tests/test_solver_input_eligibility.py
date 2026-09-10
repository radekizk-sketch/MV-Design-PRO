"""
Test solver-input eligibility gating.

INVARIANT: No solver runs when eligible=false. All blockers are auditable.
"""

from network_model.catalog.repository import CatalogRepository
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from solver_input.contracts import SolverAnalysisType
from solver_input.eligibility import build_eligibility_map, check_eligibility


def _make_valid_network() -> NetworkGraph:
    """Build a minimal valid network (SLACK + PQ + line)."""
    g = NetworkGraph()
    g.add_node(
        Node(
            id="slack",
            name="Slack",
            node_type=NodeType.SLACK,
            voltage_level=15.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="load",
            name="Load",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=1.0,
            reactive_power=0.5,
        )
    )
    g.add_branch(
        LineBranch(
            id="line_1",
            name="Line 1",
            branch_type=BranchType.LINE,
            from_node_id="slack",
            to_node_id="load",
            r_ohm_per_km=0.420,
            x_ohm_per_km=0.377,
            b_us_per_km=2.84,
            length_km=2.0,
            rated_current_a=210.0,
            type_ref="lt-afl70",
        )
    )
    return g


def _make_valid_catalog() -> CatalogRepository:
    """Catalog containing the type refs used in _make_valid_network."""
    return CatalogRepository.from_records(
        line_types=[
            {
                "id": "lt-afl70",
                "name": "AFL-6 70mm2",
                "params": {
                    "r_ohm_per_km": 0.420,
                    "x_ohm_per_km": 0.377,
                    "b_us_per_km": 2.84,
                    "rated_current_a": 210.0,
                    "max_temperature_c": 80.0,
                    "voltage_rating_kv": 15.0,
                    "cross_section_mm2": 70.0,
                },
            }
        ],
        cable_types=[],
        transformer_types=[],
    )


def _make_empty_catalog() -> CatalogRepository:
    return CatalogRepository.from_records(
        line_types=[],
        cable_types=[],
        transformer_types=[],
    )


class TestEligibilityBasic:
    """Basic eligibility checks."""

    def test_valid_network_eligible_for_sc3f(self):
        """Valid network with all catalog refs → eligible for SC_3F."""
        graph = _make_valid_network()
        catalog = _make_valid_catalog()

        result = check_eligibility(graph, catalog, SolverAnalysisType.SHORT_CIRCUIT_3F)
        assert result.eligible is True
        assert len(result.blockers) == 0

    def test_valid_network_eligible_for_load_flow(self):
        """Valid network → eligible for LOAD_FLOW."""
        graph = _make_valid_network()
        catalog = _make_valid_catalog()

        result = check_eligibility(graph, catalog, SolverAnalysisType.LOAD_FLOW)
        assert result.eligible is True

    def test_protection_ineligible_when_no_breaker(self):
        """Protection analysis is BLOCKER SI-100 when graph has no BREAKER/RECLOSER.

        Replaces former unconditional stub. SI-100 now reflects real prerequisite:
        protection needs at least one protectable apparatus.
        """
        graph = _make_valid_network()
        catalog = _make_valid_catalog()

        result = check_eligibility(graph, catalog, SolverAnalysisType.PROTECTION)
        assert result.eligible is False
        si_100 = next((b for b in result.blockers if b.code == "SI-100"), None)
        assert si_100 is not None
        assert "BREAKER" in si_100.message or "RECLOSER" in si_100.message

    def test_protection_eligible_when_breaker_present(self):
        """Protection analysis is ELIGIBLE when graph has at least one BREAKER.

        Critical fix: previously always blocked (stub). Now proper check.
        """
        from network_model.core.switch import Switch, SwitchState, SwitchType

        graph = _make_valid_network()
        graph.add_switch(
            Switch(
                id="cb_main",
                name="Q01",
                switch_type=SwitchType.BREAKER,
                from_node_id="slack",
                to_node_id="load",
                state=SwitchState.CLOSED,
            )
        )
        catalog = _make_valid_catalog()

        result = check_eligibility(graph, catalog, SolverAnalysisType.PROTECTION)
        assert result.eligible is True
        assert not any(b.code == "SI-100" for b in result.blockers)

    def test_protection_eligible_when_recloser_present(self):
        """Protection eligibility accepts RECLOSER as protectable apparatus."""
        from network_model.core.switch import Switch, SwitchState, SwitchType

        graph = _make_valid_network()
        graph.add_switch(
            Switch(
                id="rc1",
                name="Auto-Recloser",
                switch_type=SwitchType.RECLOSER,
                from_node_id="slack",
                to_node_id="load",
                state=SwitchState.CLOSED,
            )
        )
        catalog = _make_valid_catalog()

        result = check_eligibility(graph, catalog, SolverAnalysisType.PROTECTION)
        assert result.eligible is True

    def test_protection_blocker_when_only_disconnector(self):
        """DISCONNECTOR / LOAD_SWITCH / FUSE / EARTH_SWITCH do not satisfy SI-100.

        They cannot interrupt fault current and therefore are not protectable
        apparatus for overcurrent analysis.
        """
        from network_model.core.switch import Switch, SwitchState, SwitchType

        graph = _make_valid_network()
        graph.add_switch(
            Switch(
                id="ds1",
                name="Disconnector",
                switch_type=SwitchType.DISCONNECTOR,
                from_node_id="slack",
                to_node_id="load",
                state=SwitchState.CLOSED,
            )
        )
        catalog = _make_valid_catalog()

        result = check_eligibility(graph, catalog, SolverAnalysisType.PROTECTION)
        assert result.eligible is False
        assert any(b.code == "SI-100" for b in result.blockers)


class TestEligibilityBlockers:
    """Blocker conditions that prevent analysis."""

    def test_no_slack_node_blocker(self):
        """Network without SLACK node → BLOCKER E-D01."""
        g = NetworkGraph()
        g.add_node(
            Node(
                id="pq1",
                name="PQ1",
                node_type=NodeType.PQ,
                voltage_level=15.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )
        catalog = _make_empty_catalog()

        result = check_eligibility(g, catalog, SolverAnalysisType.SHORT_CIRCUIT_3F)
        assert result.eligible is False
        blocker_codes = [b.code for b in result.blockers]
        assert "E-D01" in blocker_codes

    def test_missing_catalog_ref_blocker(self):
        """Line with type_ref not found in catalog → BLOCKER SI-003."""
        g = NetworkGraph()
        g.add_node(
            Node(
                id="slack",
                name="Slack",
                node_type=NodeType.SLACK,
                voltage_level=15.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
            )
        )
        g.add_node(
            Node(
                id="load",
                name="Load",
                node_type=NodeType.PQ,
                voltage_level=15.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )
        g.add_branch(
            LineBranch(
                id="line_bad_ref",
                name="Bad Ref Line",
                branch_type=BranchType.LINE,
                from_node_id="slack",
                to_node_id="load",
                r_ohm_per_km=0.420,
                x_ohm_per_km=0.377,
                b_us_per_km=2.84,
                length_km=2.0,
                rated_current_a=210.0,
                type_ref="nonexistent-type",
            )
        )
        catalog = _make_empty_catalog()

        result = check_eligibility(g, catalog, SolverAnalysisType.SHORT_CIRCUIT_3F)
        assert result.eligible is False
        blocker_codes = [b.code for b in result.blockers]
        assert "SI-003" in blocker_codes

    def test_zero_impedance_no_catalog_ref_blocker(self):
        """Line with no type_ref and zero impedance → BLOCKER SI-001."""
        g = NetworkGraph()
        g.add_node(
            Node(
                id="slack",
                name="Slack",
                node_type=NodeType.SLACK,
                voltage_level=15.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
            )
        )
        g.add_node(
            Node(
                id="load",
                name="Load",
                node_type=NodeType.PQ,
                voltage_level=15.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )
        g.add_branch(
            LineBranch(
                id="line_zero",
                name="Zero Impedance Line",
                branch_type=BranchType.LINE,
                from_node_id="slack",
                to_node_id="load",
                r_ohm_per_km=0.0,
                x_ohm_per_km=0.0,
                b_us_per_km=0.0,
                length_km=1.0,
                rated_current_a=210.0,
            )
        )
        catalog = _make_empty_catalog()

        result = check_eligibility(g, catalog, SolverAnalysisType.SHORT_CIRCUIT_3F)
        assert result.eligible is False
        blocker_codes = [b.code for b in result.blockers]
        assert "SI-001" in blocker_codes

    def test_transformer_no_ref_invalid_params_blocker(self):
        """Transformer without type_ref and invalid params → BLOCKER SI-004."""
        g = NetworkGraph()
        g.add_node(
            Node(
                id="slack",
                name="Slack",
                node_type=NodeType.SLACK,
                voltage_level=110.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
            )
        )
        g.add_node(
            Node(
                id="sn",
                name="SN",
                node_type=NodeType.PQ,
                voltage_level=15.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )
        g.add_branch(
            TransformerBranch(
                id="trafo_bad",
                name="Bad Transformer",
                branch_type=BranchType.TRANSFORMER,
                from_node_id="slack",
                to_node_id="sn",
                rated_power_mva=0.0,  # Invalid
                voltage_hv_kv=110.0,
                voltage_lv_kv=15.0,
                uk_percent=0.0,  # Invalid
                pk_kw=0.0,
            )
        )
        catalog = _make_empty_catalog()

        result = check_eligibility(g, catalog, SolverAnalysisType.SHORT_CIRCUIT_3F)
        assert result.eligible is False
        blocker_codes = [b.code for b in result.blockers]
        assert "SI-004" in blocker_codes


def _make_transformer_network(
    *,
    i0_percent: float | None,
    p0_kw: float | None,
    vector_group: str | None,
) -> NetworkGraph:
    """Sieć z jednym poprawnym transformatorem BEZ type_ref (dane instancji),
    z parametryzowaną kompletnością i0/p0/vector_group (karta FAB-D2, D2)."""
    g = NetworkGraph()
    g.add_node(
        Node(
            id="slack",
            name="Slack",
            node_type=NodeType.SLACK,
            voltage_level=110.0,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    g.add_node(
        Node(
            id="sn",
            name="SN",
            node_type=NodeType.PQ,
            voltage_level=15.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    g.add_branch(
        TransformerBranch(
            id="trafo_1",
            name="Transformer 1",
            branch_type=BranchType.TRANSFORMER,
            from_node_id="slack",
            to_node_id="sn",
            rated_power_mva=10.0,
            voltage_hv_kv=110.0,
            voltage_lv_kv=15.0,
            uk_percent=10.5,
            pk_kw=50.0,
            i0_percent=i0_percent,
            p0_kw=p0_kw,
            vector_group=vector_group,
        )
    )
    return g


class TestEligibilityTransformerNameplateCompleteness:
    """Karta FAB-D2 (D2): i0/p0 (WARNING, wszystkie typy) i vector_group
    (BLOCKER, TYLKO SHORT_CIRCUIT_1F — składowa zerowa) — brak != 0.0/"Dyn11"."""

    def test_no_load_params_missing_warns_but_stays_eligible(self):
        g = _make_transformer_network(i0_percent=None, p0_kw=None, vector_group="Dyn11")
        catalog = _make_empty_catalog()
        for analysis_type in (
            SolverAnalysisType.SHORT_CIRCUIT_3F,
            SolverAnalysisType.SHORT_CIRCUIT_1F,
            SolverAnalysisType.LOAD_FLOW,
        ):
            result = check_eligibility(g, catalog, analysis_type)
            assert result.eligible is True, analysis_type
            warning_codes = [w.code for w in result.warnings]
            assert "transformer.no_load_params_missing" in warning_codes, analysis_type

    def test_no_load_params_present_no_warning(self):
        """Predykaty parami — dana JAWNA: i0/p0 obecne, żadnego ostrzeżenia."""
        g = _make_transformer_network(i0_percent=0.5, p0_kw=8.0, vector_group="Dyn11")
        catalog = _make_empty_catalog()
        result = check_eligibility(g, catalog, SolverAnalysisType.LOAD_FLOW)
        warning_codes = [w.code for w in result.warnings]
        assert "transformer.no_load_params_missing" not in warning_codes

    def test_vector_group_missing_blocks_only_sc1f(self):
        g = _make_transformer_network(i0_percent=0.5, p0_kw=8.0, vector_group=None)
        catalog = _make_empty_catalog()

        sc1f = check_eligibility(g, catalog, SolverAnalysisType.SHORT_CIRCUIT_1F)
        assert sc1f.eligible is False
        assert "transformer.vector_group_missing" in [b.code for b in sc1f.blockers]

        for analysis_type in (SolverAnalysisType.SHORT_CIRCUIT_3F, SolverAnalysisType.LOAD_FLOW):
            result = check_eligibility(g, catalog, analysis_type)
            assert result.eligible is True, analysis_type
            assert "transformer.vector_group_missing" not in [b.code for b in result.blockers]

    def test_vector_group_present_no_block_on_sc1f(self):
        """Predykaty parami — dana JAWNA: vector_group obecny, SC_1F przechodzi."""
        g = _make_transformer_network(i0_percent=0.5, p0_kw=8.0, vector_group="Dyn11")
        catalog = _make_empty_catalog()
        result = check_eligibility(g, catalog, SolverAnalysisType.SHORT_CIRCUIT_1F)
        assert "transformer.vector_group_missing" not in [b.code for b in result.blockers]


class TestEligibilityWarnings:
    """Warning conditions that do not prevent analysis."""

    def test_instance_params_without_catalog_ref_warning(self):
        """Line with instance params but no catalog_ref → WARNING SI-002."""
        g = NetworkGraph()
        g.add_node(
            Node(
                id="slack",
                name="Slack",
                node_type=NodeType.SLACK,
                voltage_level=15.0,
                voltage_magnitude=1.0,
                voltage_angle=0.0,
            )
        )
        g.add_node(
            Node(
                id="load",
                name="Load",
                node_type=NodeType.PQ,
                voltage_level=15.0,
                active_power=1.0,
                reactive_power=0.5,
            )
        )
        g.add_branch(
            LineBranch(
                id="line_no_ref",
                name="No Ref Line",
                branch_type=BranchType.LINE,
                from_node_id="slack",
                to_node_id="load",
                r_ohm_per_km=0.420,
                x_ohm_per_km=0.377,
                b_us_per_km=2.84,
                length_km=2.0,
                rated_current_a=210.0,
            )
        )
        catalog = _make_empty_catalog()

        result = check_eligibility(g, catalog, SolverAnalysisType.SHORT_CIRCUIT_3F)
        # Eligible (no blockers), but with warning
        assert result.eligible is True
        warning_codes = [w.code for w in result.warnings]
        assert "SI-002" in warning_codes


class TestEligibilityMap:
    """Eligibility map for all analysis types."""

    def test_map_has_all_analysis_types(self):
        """Eligibility map contains entry for every SolverAnalysisType."""
        graph = _make_valid_network()
        catalog = _make_valid_catalog()

        emap = build_eligibility_map(graph, catalog)

        analysis_types = {e.analysis_type for e in emap.entries}
        expected = set(SolverAnalysisType)
        assert analysis_types == expected

    def test_map_protection_blocked_when_no_breaker(self):
        """Protection entry in map is blocked when graph has no BREAKER/RECLOSER."""
        graph = _make_valid_network()
        catalog = _make_valid_catalog()

        emap = build_eligibility_map(graph, catalog)

        prot_entry = next(
            e for e in emap.entries if e.analysis_type == SolverAnalysisType.PROTECTION
        )
        assert prot_entry.eligible is False

    def test_map_protection_eligible_with_breaker(self):
        """Protection entry in map is eligible when graph has BREAKER and other prereqs OK."""
        from network_model.core.switch import Switch, SwitchState, SwitchType

        graph = _make_valid_network()
        graph.add_switch(
            Switch(
                id="cb_main",
                name="Q01",
                switch_type=SwitchType.BREAKER,
                from_node_id="slack",
                to_node_id="load",
                state=SwitchState.CLOSED,
            )
        )
        catalog = _make_valid_catalog()

        emap = build_eligibility_map(graph, catalog)

        prot_entry = next(
            e for e in emap.entries if e.analysis_type == SolverAnalysisType.PROTECTION
        )
        assert prot_entry.eligible is True

    def test_blockers_sorted_deterministically(self):
        """Blockers in eligibility result are sorted by (code, element_ref, message)."""
        g = NetworkGraph()
        g.add_node(
            Node(
                id="pq1",
                name="PQ1",
                node_type=NodeType.PQ,
                voltage_level=15.0,
                active_power=0.0,
                reactive_power=0.0,
            )
        )
        catalog = _make_empty_catalog()

        result = check_eligibility(g, catalog, SolverAnalysisType.SHORT_CIRCUIT_3F)

        codes = [b.code for b in result.blockers]
        assert codes == sorted(codes), "Blockers should be sorted by code"
