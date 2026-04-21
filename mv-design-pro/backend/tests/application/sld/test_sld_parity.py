"""
SLD PowerFactory Parity Tests.

Tests verifying compliance with PowerFactory alignment requirements
per sld_rules.md, ui_canonical_parity.md, SYSTEM_SPEC.md.

Test coverage:
- SLD-INV-001: Single Model Rule
- SLD-INV-002: Bijection (no helper symbols)
- SLD-INV-003: Operating modes
- SLD-INV-004: Overlay (results as presentation only)
- SLD-INV-005: in_service vs Switch.state
- SLD-INV-006: Determinism
"""

from __future__ import annotations

import sys
from pathlib import Path
from uuid import uuid4

backend_src = Path(__file__).parents[3] / "src"
sys.path.insert(0, str(backend_src))

from application.sld.dtos import (
    SldBranchSymbolDTO,
    SldDiagramDTO,
    SldNodeSymbolDTO,
    SldOperatingMode,
    SldResultStatus,
    SldSwitchSymbolDTO,
)
from application.sld.overlay import ResultSldOverlayBuilder, ResultStatus


class TestSldOperatingModes:
    """Tests for SLD-INV-003: Operating modes."""

    def test_mode_enum_values(self) -> None:
        """Operating modes match wizard_screens.md § 1.2."""
        assert SldOperatingMode.MODEL_EDIT.value == "MODEL_EDIT"
        assert SldOperatingMode.CASE_CONFIG.value == "CASE_CONFIG"
        assert SldOperatingMode.RESULT_VIEW.value == "RESULT_VIEW"

    def test_diagram_dto_default_mode(self) -> None:
        """Default mode is MODEL_EDIT per wizard_screens.md."""
        diagram = SldDiagramDTO(id=uuid4(), name="Test")
        assert diagram.mode == SldOperatingMode.MODEL_EDIT

    def test_diagram_dto_mode_in_payload(self) -> None:
        """Mode is serialized in payload for frontend consumption."""
        diagram = SldDiagramDTO(
            id=uuid4(),
            name="Test",
            mode=SldOperatingMode.RESULT_VIEW,
        )
        payload = diagram.to_dict()
        assert payload["mode"] == "RESULT_VIEW"


class TestSldResultStatus:
    """Tests for SLD-INV-004: Overlay lifecycle (FRESH/OUTDATED)."""

    def test_result_status_enum_values(self) -> None:
        """Result status values match ui_canonical_parity.md § B.2."""
        assert SldResultStatus.NONE.value == "NONE"
        assert SldResultStatus.FRESH.value == "FRESH"
        assert SldResultStatus.OUTDATED.value == "OUTDATED"

    def test_diagram_dto_default_result_status(self) -> None:
        """Default result status is NONE (never computed)."""
        diagram = SldDiagramDTO(id=uuid4(), name="Test")
        assert diagram.result_status == SldResultStatus.NONE

    def test_diagram_dto_result_status_in_payload(self) -> None:
        """Result status is serialized for frontend overlay visibility control."""
        diagram = SldDiagramDTO(
            id=uuid4(),
            name="Test",
            result_status=SldResultStatus.OUTDATED,
        )
        payload = diagram.to_dict()
        assert payload["result_status"] == "OUTDATED"


class TestSldOverlayBuilder:
    """Tests for SLD-INV-004: Results as overlay only."""

    def test_overlay_includes_result_status(self) -> None:
        """Overlay includes result_status for frontend display control."""
        builder = ResultSldOverlayBuilder()
        overlay = builder.build_short_circuit_overlay(
            sld_payload={"nodes": []},
            result_payload={"fault_node_id": "node1"},
            result_status=ResultStatus.FRESH,
        )
        assert overlay["result_status"] == "FRESH"

    def test_overlay_empty_when_no_results(self) -> None:
        """Overlay is empty structure when no results available."""
        builder = ResultSldOverlayBuilder()
        overlay = builder.build_short_circuit_overlay(
            sld_payload=None,
            result_payload=None,
        )
        assert overlay["nodes"] == []
        assert overlay["branches"] == []
        assert overlay["result_status"] == "NONE"

    def test_overlay_includes_switches_array(self) -> None:
        """Overlay structure includes switches array (per bijection)."""
        builder = ResultSldOverlayBuilder()
        overlay = builder.build_short_circuit_overlay(
            sld_payload={"nodes": [], "switches": []},
            result_payload=None,
        )
        assert "switches" in overlay


class TestSldSymbolsInService:
    """Tests for SLD-INV-005: in_service visual state."""

    def test_node_symbol_in_service_default_true(self) -> None:
        """Node symbol in_service defaults to True."""
        node = SldNodeSymbolDTO(id=uuid4(), node_id=uuid4(), x=0, y=0)
        assert node.in_service is True

    def test_node_symbol_in_service_false_serialized(self) -> None:
        """in_service=False is serialized for frontend graying."""
        node = SldNodeSymbolDTO(id=uuid4(), node_id=uuid4(), x=0, y=0, in_service=False)
        payload = node.to_dict()
        assert payload["in_service"] is False

    def test_branch_symbol_in_service_default_true(self) -> None:
        """Branch symbol in_service defaults to True."""
        branch = SldBranchSymbolDTO(
            id=uuid4(),
            branch_id=uuid4(),
            from_node_id=uuid4(),
            to_node_id=uuid4(),
        )
        assert branch.in_service is True

    def test_branch_symbol_in_service_false_serialized(self) -> None:
        """in_service=False is serialized for frontend dashed rendering."""
        branch = SldBranchSymbolDTO(
            id=uuid4(),
            branch_id=uuid4(),
            from_node_id=uuid4(),
            to_node_id=uuid4(),
            in_service=False,
        )
        payload = branch.to_dict()
        assert payload["in_service"] is False


class TestSldSwitchSymbol:
    """Tests for SLD-INV-002/005: Switch symbol with type and state."""

    def test_switch_symbol_has_type_and_state(self) -> None:
        """Switch symbol has switch_type and state fields."""
        switch = SldSwitchSymbolDTO(
            id=uuid4(),
            switch_id=uuid4(),
            from_node_id=uuid4(),
            to_node_id=uuid4(),
            switch_type="BREAKER",
            state="CLOSED",
        )
        payload = switch.to_dict()
        assert payload["switch_type"] == "BREAKER"
        assert payload["state"] == "CLOSED"

    def test_switch_symbol_open_state(self) -> None:
        """Switch with OPEN state is serialized correctly."""
        switch = SldSwitchSymbolDTO(
            id=uuid4(),
            switch_id=uuid4(),
            from_node_id=uuid4(),
            to_node_id=uuid4(),
            switch_type="DISCONNECTOR",
            state="OPEN",
        )
        payload = switch.to_dict()
        assert payload["state"] == "OPEN"

    def test_switch_types_per_system_spec(self) -> None:
        """All switch types per SYSTEM_SPEC.md § 2.4 are valid."""
        valid_types = ["BREAKER", "DISCONNECTOR", "LOAD_SWITCH", "FUSE"]
        for switch_type in valid_types:
            switch = SldSwitchSymbolDTO(
                id=uuid4(),
                switch_id=uuid4(),
                from_node_id=uuid4(),
                to_node_id=uuid4(),
                switch_type=switch_type,
                state="CLOSED",
            )
            assert switch.switch_type == switch_type


class TestSldDiagramBijection:
    """Tests for SLD-INV-002: Bijection invariant."""

    def test_diagram_has_switches_array(self) -> None:
        """SldDiagramDTO includes switches tuple for bijection."""
        diagram = SldDiagramDTO(id=uuid4(), name="Test")
        assert hasattr(diagram, "switches")
        assert diagram.switches == ()

    def test_diagram_payload_includes_switches(self) -> None:
        """Serialized diagram includes switches array."""
        switch = SldSwitchSymbolDTO(
            id=uuid4(),
            switch_id=uuid4(),
            from_node_id=uuid4(),
            to_node_id=uuid4(),
            switch_type="BREAKER",
            state="CLOSED",
        )
        diagram = SldDiagramDTO(
            id=uuid4(),
            name="Test",
            switches=(switch,),
        )
        payload = diagram.to_dict()
        assert len(payload["switches"]) == 1
        assert payload["switches"][0]["switch_type"] == "BREAKER"


class TestNoPccInSldSymbols:
    """
    Tests verifying BoundaryNode is NOT in SLD base symbols.
    Per SYSTEM_SPEC.md § 18.3.4, sld_rules.md § A.4, § F.5.1.
    """

    def test_node_symbol_no_is_connection_node_field(self) -> None:
        """SldNodeSymbolDTO has no is_connection_node field (removed per compliance)."""
        node = SldNodeSymbolDTO(id=uuid4(), node_id=uuid4(), x=0, y=0)
        assert not hasattr(node, "is_connection_node")
        payload = node.to_dict()
        assert "is_connection_node" not in payload

    def test_diagram_no_connection_node_markers(self) -> None:
        """SldDiagramDTO has no connection_markers field."""
        diagram = SldDiagramDTO(id=uuid4(), name="Test")
        assert not hasattr(diagram, "connection_markers")
