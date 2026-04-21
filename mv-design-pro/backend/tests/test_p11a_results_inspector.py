"""
P11a Results Inspector Tests — Deterministic Results View + Trace + SLD Overlay

TESTS:
1. DTO construction and serialization
2. Deterministic sorting (name, id) for buses and branches
3. Deterministic sorting (target_id) for short-circuit results
4. SLD overlay mapping (no physics, no mutations)
5. ExtendedTraceDTO construction
6. ResultsIndexDTO column metadata
7. Edge cases (empty results, missing data)
"""

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from application.analysis_run.dtos import (
    BranchResultsDTO,
    BranchResultsRowDTO,
    BusResultsDTO,
    BusResultsRowDTO,
    ExtendedTraceDTO,
    ResultColumnDTO,
    ResultsIndexDTO,
    ResultTableMetaDTO,
    RunHeaderDTO,
    ShortCircuitRowDTO,
    SldOverlayBranchDTO,
    SldOverlayNodeDTO,
    SldResultOverlayDTO,
)


class TestRunHeaderDTO:
    """Test RunHeaderDTO construction and serialization."""

    def test_construction(self):
        """RunHeaderDTO should be constructable with all fields."""
        run_id = uuid4()
        project_id = uuid4()
        case_id = uuid4()
        created_at = datetime(2026, 1, 15, 12, 0, 0, tzinfo=UTC)

        dto = RunHeaderDTO(
            run_id=run_id,
            project_id=project_id,
            case_id=case_id,
            snapshot_id="snap-001",
            created_at=created_at,
            status="FINISHED",
            result_state="VALID",
            solver_kind="short_circuit_sn",
            input_hash="abc123",
        )

        assert dto.run_id == run_id
        assert dto.project_id == project_id
        assert dto.case_id == case_id
        assert dto.snapshot_id == "snap-001"
        assert dto.status == "FINISHED"
        assert dto.result_state == "VALID"
        assert dto.solver_kind == "short_circuit_sn"
        assert dto.input_hash == "abc123"

    def test_to_dict_serialization(self):
        """RunHeaderDTO must serialize to dict."""
        run_id = uuid4()
        project_id = uuid4()
        case_id = uuid4()
        created_at = datetime(2026, 1, 15, 12, 0, 0, tzinfo=UTC)

        dto = RunHeaderDTO(
            run_id=run_id,
            project_id=project_id,
            case_id=case_id,
            snapshot_id="snap-001",
            created_at=created_at,
            status="FINISHED",
            result_state="VALID",
            solver_kind="short_circuit_sn",
            input_hash="abc123",
        )

        d = dto.to_dict()
        assert d["run_id"] == str(run_id)
        assert d["project_id"] == str(project_id)
        assert d["case_id"] == str(case_id)
        assert d["snapshot_id"] == "snap-001"
        assert d["status"] == "FINISHED"
        assert d["result_state"] == "VALID"
        assert d["solver_kind"] == "short_circuit_sn"
        assert d["input_hash"] == "abc123"

    def test_frozen_immutability(self):
        """RunHeaderDTO must be immutable (frozen)."""
        dto = RunHeaderDTO(
            run_id=uuid4(),
            project_id=uuid4(),
            case_id=uuid4(),
            snapshot_id="snap-001",
            created_at=datetime.now(UTC),
            status="FINISHED",
            result_state="VALID",
            solver_kind="PF",
            input_hash="abc123",
        )
        with pytest.raises(AttributeError):
            dto.status = "FAILED"


class TestResultColumnDTO:
    """Test ResultColumnDTO construction."""

    def test_construction_with_unit(self):
        """ResultColumnDTO should store key, label, and unit."""
        col = ResultColumnDTO(key="u_kv", label_pl="Napięcie", unit="kV")
        assert col.key == "u_kv"
        assert col.label_pl == "Napięcie"
        assert col.unit == "kV"

    def test_construction_without_unit(self):
        """ResultColumnDTO should allow None unit."""
        col = ResultColumnDTO(key="name", label_pl="Nazwa")
        assert col.unit is None

    def test_to_dict_with_unit(self):
        """to_dict should include unit when present."""
        col = ResultColumnDTO(key="u_kv", label_pl="Napięcie", unit="kV")
        d = col.to_dict()
        assert d["key"] == "u_kv"
        assert d["label_pl"] == "Napięcie"
        assert d["unit"] == "kV"

    def test_to_dict_without_unit(self):
        """to_dict should omit unit when None."""
        col = ResultColumnDTO(key="name", label_pl="Nazwa")
        d = col.to_dict()
        assert "unit" not in d


class TestResultTableMetaDTO:
    """Test ResultTableMetaDTO construction."""

    def test_construction(self):
        """ResultTableMetaDTO should include table_id, label, row_count, columns."""
        columns = (
            ResultColumnDTO(key="bus_id", label_pl="ID węzła"),
            ResultColumnDTO(key="u_kv", label_pl="Napięcie", unit="kV"),
        )
        table = ResultTableMetaDTO(
            table_id="buses",
            label_pl="Wyniki węzłowe",
            row_count=10,
            columns=columns,
        )

        assert table.table_id == "buses"
        assert table.label_pl == "Wyniki węzłowe"
        assert table.row_count == 10
        assert len(table.columns) == 2

    def test_to_dict_serialization(self):
        """ResultTableMetaDTO must serialize to dict."""
        columns = (ResultColumnDTO(key="bus_id", label_pl="ID węzła"),)
        table = ResultTableMetaDTO(
            table_id="buses",
            label_pl="Wyniki węzłowe",
            row_count=5,
            columns=columns,
        )

        d = table.to_dict()
        assert d["table_id"] == "buses"
        assert d["row_count"] == 5
        assert len(d["columns"]) == 1


class TestBusResultsRowDTO:
    """Test BusResultsRowDTO construction and sorting."""

    def test_construction(self):
        """BusResultsRowDTO should be constructable with all fields."""
        row = BusResultsRowDTO(
            bus_id="bus-001",
            name="BUS-A",
            un_kv=20.0,
            u_kv=19.8,
            u_pu=0.99,
            angle_deg=-2.5,
            flags=["SLACK"],
        )

        assert row.bus_id == "bus-001"
        assert row.name == "BUS-A"
        assert row.un_kv == 20.0
        assert row.u_kv == 19.8
        assert row.u_pu == 0.99
        assert row.angle_deg == -2.5
        assert row.flags == ["SLACK"]

    def test_optional_fields_default(self):
        """Optional fields should default to None or empty list."""
        row = BusResultsRowDTO(
            bus_id="bus-001",
            name="BUS-A",
            un_kv=20.0,
        )

        assert row.u_kv is None
        assert row.u_pu is None
        assert row.angle_deg is None
        assert row.flags == []

    def test_to_dict_serialization(self):
        """BusResultsRowDTO must serialize to dict."""
        row = BusResultsRowDTO(
            bus_id="bus-001",
            name="BUS-A",
            un_kv=20.0,
            u_pu=0.99,
        )

        d = row.to_dict()
        assert d["bus_id"] == "bus-001"
        assert d["name"] == "BUS-A"
        assert d["un_kv"] == 20.0
        assert d["u_pu"] == 0.99


class TestBusResultsDTO:
    """Test BusResultsDTO and deterministic sorting."""

    def test_construction_with_rows(self):
        """BusResultsDTO should contain run_id and rows."""
        run_id = uuid4()
        rows = (
            BusResultsRowDTO(bus_id="bus-001", name="BUS-A", un_kv=20.0),
            BusResultsRowDTO(bus_id="bus-002", name="BUS-B", un_kv=20.0),
        )
        dto = BusResultsDTO(run_id=run_id, rows=rows)

        assert dto.run_id == run_id
        assert len(dto.rows) == 2

    def test_deterministic_sorting_by_name_then_id(self):
        """Rows should be sortable by (name, bus_id)."""
        rows = [
            BusResultsRowDTO(bus_id="bus-003", name="Z-BUS", un_kv=20.0),
            BusResultsRowDTO(bus_id="bus-001", name="A-BUS", un_kv=20.0),
            BusResultsRowDTO(bus_id="bus-002", name="A-BUS", un_kv=20.0),
        ]

        # Sort by (name, bus_id) - same as service does
        sorted_rows = sorted(rows, key=lambda r: (r.name.lower(), r.bus_id))

        assert sorted_rows[0].name == "A-BUS"
        assert sorted_rows[0].bus_id == "bus-001"
        assert sorted_rows[1].name == "A-BUS"
        assert sorted_rows[1].bus_id == "bus-002"
        assert sorted_rows[2].name == "Z-BUS"

    def test_determinism_same_inputs(self):
        """Same inputs must produce identical sorting."""
        uuid4()
        rows = [
            BusResultsRowDTO(bus_id="bus-003", name="C-BUS", un_kv=20.0),
            BusResultsRowDTO(bus_id="bus-001", name="A-BUS", un_kv=20.0),
            BusResultsRowDTO(bus_id="bus-002", name="B-BUS", un_kv=20.0),
        ]

        sorted1 = sorted(rows, key=lambda r: (r.name.lower(), r.bus_id))
        sorted2 = sorted(rows, key=lambda r: (r.name.lower(), r.bus_id))

        for r1, r2 in zip(sorted1, sorted2, strict=False):
            assert r1.bus_id == r2.bus_id
            assert r1.name == r2.name


class TestBranchResultsRowDTO:
    """Test BranchResultsRowDTO construction."""

    def test_construction(self):
        """BranchResultsRowDTO should be constructable with all fields."""
        row = BranchResultsRowDTO(
            branch_id="br-001",
            name="LINE-1",
            from_bus="bus-001",
            to_bus="bus-002",
            i_a=100.5,
            s_mva=3.5,
            p_mw=3.0,
            q_mvar=1.5,
            loading_pct=75.0,
            flags=["OVERLOADED"],
        )

        assert row.branch_id == "br-001"
        assert row.name == "LINE-1"
        assert row.from_bus == "bus-001"
        assert row.to_bus == "bus-002"
        assert row.i_a == 100.5
        assert row.loading_pct == 75.0

    def test_to_dict_serialization(self):
        """BranchResultsRowDTO must serialize to dict."""
        row = BranchResultsRowDTO(
            branch_id="br-001",
            name="LINE-1",
            from_bus="bus-001",
            to_bus="bus-002",
        )

        d = row.to_dict()
        assert d["branch_id"] == "br-001"
        assert d["name"] == "LINE-1"


class TestBranchResultsDTO:
    """Test BranchResultsDTO and deterministic sorting."""

    def test_deterministic_sorting_by_name_then_id(self):
        """Rows should be sortable by (name, branch_id)."""
        rows = [
            BranchResultsRowDTO(branch_id="br-003", name="Z-LINE", from_bus="a", to_bus="b"),
            BranchResultsRowDTO(branch_id="br-001", name="A-LINE", from_bus="a", to_bus="b"),
            BranchResultsRowDTO(branch_id="br-002", name="A-LINE", from_bus="a", to_bus="b"),
        ]

        sorted_rows = sorted(rows, key=lambda r: (r.name.lower(), r.branch_id))

        assert sorted_rows[0].name == "A-LINE"
        assert sorted_rows[0].branch_id == "br-001"
        assert sorted_rows[1].name == "A-LINE"
        assert sorted_rows[1].branch_id == "br-002"
        assert sorted_rows[2].name == "Z-LINE"


class TestShortCircuitRowDTO:
    """Test ShortCircuitRowDTO construction."""

    def test_construction(self):
        """ShortCircuitRowDTO should be constructable with all fields."""
        row = ShortCircuitRowDTO(
            target_id="bus-001",
            target_name="BUS-A",
            ikss_ka=25.3,
            ip_ka=63.2,
            ith_ka=27.8,
            sk_mva=876.5,
            fault_type="3F",
            flags=[],
        )

        assert row.target_id == "bus-001"
        assert row.target_name == "BUS-A"
        assert row.ikss_ka == 25.3
        assert row.ip_ka == 63.2
        assert row.ith_ka == 27.8
        assert row.sk_mva == 876.5
        assert row.fault_type == "3F"

    def test_to_dict_serialization(self):
        """ShortCircuitRowDTO must serialize to dict."""
        row = ShortCircuitRowDTO(
            target_id="bus-001",
            target_name="BUS-A",
            ikss_ka=25.3,
        )

        d = row.to_dict()
        assert d["target_id"] == "bus-001"
        assert d["target_name"] == "BUS-A"
        assert d["ikss_ka"] == 25.3


class TestShortCircuitResultsDTO:
    """Test ShortCircuitResultsDTO and deterministic sorting."""

    def test_deterministic_sorting_by_target_id(self):
        """Rows should be sortable by target_id."""
        rows = [
            ShortCircuitRowDTO(target_id="bus-003", ikss_ka=20.0),
            ShortCircuitRowDTO(target_id="bus-001", ikss_ka=25.0),
            ShortCircuitRowDTO(target_id="bus-002", ikss_ka=22.0),
        ]

        sorted_rows = sorted(rows, key=lambda r: r.target_id)

        assert sorted_rows[0].target_id == "bus-001"
        assert sorted_rows[1].target_id == "bus-002"
        assert sorted_rows[2].target_id == "bus-003"


class TestExtendedTraceDTO:
    """Test ExtendedTraceDTO construction."""

    def test_construction(self):
        """ExtendedTraceDTO should contain run context + trace."""
        run_id = uuid4()
        trace = [
            {"key": "Zk", "title": "Impedancja zastępcza", "result": {"z_ohm": 1.5}},
            {"key": "Ikss", "title": "Prąd zwarciowy", "result": {"ikss_a": 25000}},
        ]

        dto = ExtendedTraceDTO(
            run_id=run_id,
            snapshot_id="snap-001",
            input_hash="abc123",
            white_box_trace=trace,
            catalog_context=[{"element_id": "line-1"}],
        )

        assert dto.run_id == run_id
        assert dto.snapshot_id == "snap-001"
        assert dto.input_hash == "abc123"
        assert len(dto.white_box_trace) == 2
        assert dto.catalog_context == [{"element_id": "line-1"}]

    def test_to_dict_serialization(self):
        """ExtendedTraceDTO must serialize to dict."""
        run_id = uuid4()
        dto = ExtendedTraceDTO(
            run_id=run_id,
            snapshot_id="snap-001",
            input_hash="abc123",
            white_box_trace=[{"key": "step1"}],
            catalog_context=[
                {"element_id": "line-1", "catalog_binding": {"catalog_item_id": "KABEL-1"}}
            ],
        )

        d = dto.to_dict()
        assert d["run_id"] == str(run_id)
        assert d["snapshot_id"] == "snap-001"
        assert d["input_hash"] == "abc123"
        assert d["white_box_trace"] == [{"key": "step1"}]
        assert d["catalog_context"] == [
            {"element_id": "line-1", "catalog_binding": {"catalog_item_id": "KABEL-1"}}
        ]


class TestSldOverlayNodeDTO:
    """Test SldOverlayNodeDTO construction."""

    def test_construction_with_pf_results(self):
        """SldOverlayNodeDTO should store PF results."""
        node = SldOverlayNodeDTO(
            symbol_id="sym-001",
            bus_id="bus-001",
            u_pu=0.99,
            u_kv=19.8,
            angle_deg=-2.5,
        )

        assert node.symbol_id == "sym-001"
        assert node.bus_id == "bus-001"
        assert node.u_pu == 0.99
        assert node.u_kv == 19.8
        assert node.angle_deg == -2.5

    def test_construction_with_sc_results(self):
        """SldOverlayNodeDTO should store SC results."""
        node = SldOverlayNodeDTO(
            symbol_id="sym-001",
            bus_id="bus-001",
            ikss_ka=25.3,
            sk_mva=876.5,
        )

        assert node.ikss_ka == 25.3
        assert node.sk_mva == 876.5

    def test_to_dict_omits_none_values(self):
        """to_dict should omit None values."""
        node = SldOverlayNodeDTO(
            symbol_id="sym-001",
            bus_id="bus-001",
            u_pu=0.99,
        )

        d = node.to_dict()
        assert d["symbol_id"] == "sym-001"
        assert d["bus_id"] == "bus-001"
        assert d["u_pu"] == 0.99
        assert "u_kv" not in d
        assert "ikss_ka" not in d


class TestSldOverlayBranchDTO:
    """Test SldOverlayBranchDTO construction."""

    def test_construction(self):
        """SldOverlayBranchDTO should store branch results."""
        branch = SldOverlayBranchDTO(
            symbol_id="sym-br-001",
            branch_id="br-001",
            p_mw=3.0,
            q_mvar=1.5,
            i_a=100.5,
            loading_pct=75.0,
        )

        assert branch.symbol_id == "sym-br-001"
        assert branch.branch_id == "br-001"
        assert branch.p_mw == 3.0
        assert branch.q_mvar == 1.5
        assert branch.i_a == 100.5
        assert branch.loading_pct == 75.0

    def test_to_dict_omits_none_values(self):
        """to_dict should omit None values."""
        branch = SldOverlayBranchDTO(
            symbol_id="sym-br-001",
            branch_id="br-001",
            p_mw=3.0,
        )

        d = branch.to_dict()
        assert "p_mw" in d
        assert "q_mvar" not in d
        assert "loading_pct" not in d


class TestSldResultOverlayDTO:
    """Test SldResultOverlayDTO construction."""

    def test_construction(self):
        """SldResultOverlayDTO should contain diagram + run + overlays."""
        diagram_id = uuid4()
        run_id = uuid4()

        nodes = (
            SldOverlayNodeDTO(symbol_id="s1", bus_id="n1", u_pu=0.99),
            SldOverlayNodeDTO(symbol_id="s2", bus_id="n2", u_pu=1.01),
        )
        branches = (SldOverlayBranchDTO(symbol_id="sb1", branch_id="b1", p_mw=3.0),)

        dto = SldResultOverlayDTO(
            diagram_id=diagram_id,
            run_id=run_id,
            result_status="FRESH",
            buses=nodes,
            branches=branches,
        )

        assert dto.diagram_id == diagram_id
        assert dto.run_id == run_id
        assert dto.result_status == "FRESH"
        assert len(dto.buses) == 2
        assert len(dto.branches) == 1

    def test_to_dict_serialization(self):
        """SldResultOverlayDTO must serialize to dict."""
        diagram_id = uuid4()
        run_id = uuid4()

        dto = SldResultOverlayDTO(
            diagram_id=diagram_id,
            run_id=run_id,
            result_status="OUTDATED",
            buses=(),
            branches=(),
        )

        d = dto.to_dict()
        assert d["diagram_id"] == str(diagram_id)
        assert d["run_id"] == str(run_id)
        assert d["result_status"] == "OUTDATED"
        assert d["buses"] == []
        assert d["branches"] == []


class TestDeterminismRequirements:
    """Test determinism requirements for Results Inspector (P11a)."""

    def test_bus_results_deterministic_serialization(self):
        """Same BusResultsDTO inputs must produce identical JSON."""
        run_id = uuid4()
        rows = (
            BusResultsRowDTO(bus_id="bus-001", name="BUS-A", un_kv=20.0, u_pu=0.99),
            BusResultsRowDTO(bus_id="bus-002", name="BUS-B", un_kv=20.0, u_pu=1.01),
        )

        dto1 = BusResultsDTO(run_id=run_id, rows=rows)
        dto2 = BusResultsDTO(run_id=run_id, rows=rows)

        assert dto1.to_dict() == dto2.to_dict()

    def test_branch_results_deterministic_serialization(self):
        """Same BranchResultsDTO inputs must produce identical JSON."""
        run_id = uuid4()
        rows = (
            BranchResultsRowDTO(
                branch_id="br-001", name="LINE-1", from_bus="a", to_bus="b", p_mw=3.0
            ),
            BranchResultsRowDTO(
                branch_id="br-002", name="LINE-2", from_bus="b", to_bus="c", p_mw=2.5
            ),
        )

        dto1 = BranchResultsDTO(run_id=run_id, rows=rows)
        dto2 = BranchResultsDTO(run_id=run_id, rows=rows)

        assert dto1.to_dict() == dto2.to_dict()

    def test_sld_overlay_deterministic_serialization(self):
        """Same SldResultOverlayDTO inputs must produce identical JSON."""
        diagram_id = uuid4()
        run_id = uuid4()
        buses = (SldOverlayNodeDTO(symbol_id="s1", bus_id="n1", u_pu=0.99),)

        dto1 = SldResultOverlayDTO(
            diagram_id=diagram_id,
            run_id=run_id,
            result_status="FRESH",
            buses=buses,
        )
        dto2 = SldResultOverlayDTO(
            diagram_id=diagram_id,
            run_id=run_id,
            result_status="FRESH",
            buses=buses,
        )

        assert dto1.to_dict() == dto2.to_dict()


class TestEdgeCases:
    """Test edge cases for Results Inspector (P11a)."""

    def test_empty_rows(self):
        """Empty rows should produce valid DTOs."""
        run_id = uuid4()
        dto = BusResultsDTO(run_id=run_id, rows=())
        d = dto.to_dict()
        assert d["rows"] == []

    def test_empty_overlay(self):
        """Empty overlay should produce valid DTO."""
        dto = SldResultOverlayDTO(
            diagram_id=uuid4(),
            run_id=uuid4(),
            result_status="NONE",
        )
        d = dto.to_dict()
        assert d["nodes"] == []
        assert d["branches"] == []

    def test_null_snapshot_id(self):
        """Null snapshot_id should be serialized as None."""
        run_id = uuid4()
        dto = ExtendedTraceDTO(
            run_id=run_id,
            snapshot_id=None,
            input_hash="abc123",
            white_box_trace=[],
        )

        d = dto.to_dict()
        assert d["snapshot_id"] is None

    def test_empty_white_box_trace(self):
        """Empty white_box_trace should produce valid DTO."""
        run_id = uuid4()
        dto = ExtendedTraceDTO(
            run_id=run_id,
            snapshot_id="snap-001",
            input_hash="abc123",
            white_box_trace=[],
        )

        d = dto.to_dict()
        assert d["white_box_trace"] == []
        assert d["catalog_context"] == []

    def test_special_characters_in_names(self):
        """Names with special characters should be handled."""
        row = BusResultsRowDTO(
            bus_id="bus-001",
            name="BUS-A/B (test) [special]",
            un_kv=20.0,
        )

        d = row.to_dict()
        assert d["name"] == "BUS-A/B (test) [special]"

    def test_unicode_in_names(self):
        """Unicode characters in names should be handled."""
        row = BusResultsRowDTO(
            bus_id="bus-001",
            name="Węzeł przyłączeniowy GPZ-1",  # Polish
            un_kv=20.0,
        )

        d = row.to_dict()
        assert d["name"] == "Węzeł przyłączeniowy GPZ-1"


class TestResultsIndexDTO:
    """Test ResultsIndexDTO construction."""

    def test_construction_with_multiple_tables(self):
        """ResultsIndexDTO should list all available tables."""
        run_header = RunHeaderDTO(
            run_id=uuid4(),
            project_id=uuid4(),
            case_id=uuid4(),
            snapshot_id="snap-001",
            created_at=datetime.now(UTC),
            status="FINISHED",
            result_state="VALID",
            solver_kind="PF",
            input_hash="abc123",
        )

        tables = (
            ResultTableMetaDTO(
                table_id="buses",
                label_pl="Wyniki węzłowe",
                row_count=10,
                columns=(ResultColumnDTO(key="bus_id", label_pl="ID węzła"),),
            ),
            ResultTableMetaDTO(
                table_id="branches",
                label_pl="Wyniki gałęziowe",
                row_count=15,
                columns=(ResultColumnDTO(key="branch_id", label_pl="ID gałęzi"),),
            ),
        )

        dto = ResultsIndexDTO(run_header=run_header, tables=tables)

        assert len(dto.tables) == 2
        assert dto.tables[0].table_id == "buses"
        assert dto.tables[1].table_id == "branches"

    def test_to_dict_serialization(self):
        """ResultsIndexDTO must serialize to dict with nested structures."""
        run_header = RunHeaderDTO(
            run_id=uuid4(),
            project_id=uuid4(),
            case_id=uuid4(),
            snapshot_id="snap-001",
            created_at=datetime.now(UTC),
            status="FINISHED",
            result_state="VALID",
            solver_kind="short_circuit_sn",
            input_hash="abc123",
        )

        tables = (
            ResultTableMetaDTO(
                table_id="short-circuit",
                label_pl="Wyniki zwarciowe",
                row_count=1,
                columns=(ResultColumnDTO(key="ikss_ka", label_pl="Ik''", unit="kA"),),
            ),
        )

        dto = ResultsIndexDTO(run_header=run_header, tables=tables)
        d = dto.to_dict()

        assert "run_header" in d
        assert "tables" in d
        assert len(d["tables"]) == 1
        assert d["tables"][0]["table_id"] == "short-circuit"
        assert d["tables"][0]["columns"][0]["unit"] == "kA"
