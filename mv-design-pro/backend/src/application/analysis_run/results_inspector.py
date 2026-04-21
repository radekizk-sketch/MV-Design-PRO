"""
P11a — Results Inspector Service (READ-ONLY)

CANONICAL ALIGNMENT:
- SYSTEM_SPEC.md: NOT-A-SOLVER, WHITE BOX, layer boundaries
- AGENTS.md: READ-ONLY, no physics, no mutations
- wizard_screens.md: RESULT_VIEW mode

RULES (BINDING):
- Zero physics calculations
- Zero model mutations
- Deterministic sorting: by (name, id) for buses/branches, by target_id for SC
- Only reads from stored Result API + Run metadata
- Returns frozen DTOs
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from uuid import UUID

from application.analysis_run.catalog_context import (
    build_catalog_context,
    build_catalog_context_index,
    build_catalog_context_summary,
    enrich_trace_steps_with_catalog_context,
)
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
    ShortCircuitResultsDTO,
    ShortCircuitRowDTO,
    SldOverlayBranchDTO,
    SldOverlayBusDTO,
    SldResultOverlayDTO,
)
from domain.analysis_run import AnalysisRun
from infrastructure.persistence.unit_of_work import UnitOfWork

# =============================================================================
# Column Definitions (Polish labels, units)
# =============================================================================

BUS_COLUMNS = (
    ResultColumnDTO(key="bus_id", label_pl="ID węzła"),
    ResultColumnDTO(key="name", label_pl="Nazwa"),
    ResultColumnDTO(key="un_kv", label_pl="Napięcie znamionowe", unit="kV"),
    ResultColumnDTO(key="u_kv", label_pl="Napięcie", unit="kV"),
    ResultColumnDTO(key="u_pu", label_pl="Napięcie", unit="pu"),
    ResultColumnDTO(key="angle_deg", label_pl="Kąt", unit="°"),
    ResultColumnDTO(key="flags", label_pl="Flagi"),
)

BRANCH_COLUMNS = (
    ResultColumnDTO(key="branch_id", label_pl="ID gałęzi"),
    ResultColumnDTO(key="name", label_pl="Nazwa"),
    ResultColumnDTO(key="from_bus", label_pl="Węzeł początkowy"),
    ResultColumnDTO(key="to_bus", label_pl="Węzeł końcowy"),
    ResultColumnDTO(key="i_a", label_pl="Prąd", unit="A"),
    ResultColumnDTO(key="s_mva", label_pl="Moc pozorna", unit="MVA"),
    ResultColumnDTO(key="p_mw", label_pl="Moc czynna", unit="MW"),
    ResultColumnDTO(key="q_mvar", label_pl="Moc bierna", unit="Mvar"),
    ResultColumnDTO(key="loading_pct", label_pl="Obciążenie", unit="%"),
    ResultColumnDTO(key="flags", label_pl="Flagi"),
)

SHORT_CIRCUIT_COLUMNS = (
    ResultColumnDTO(key="target_id", label_pl="ID węzła zwarcia"),
    ResultColumnDTO(key="target_name", label_pl="Nazwa węzła"),
    ResultColumnDTO(key="ikss_ka", label_pl="Ik''", unit="kA"),
    ResultColumnDTO(key="ip_ka", label_pl="ip", unit="kA"),
    ResultColumnDTO(key="ith_ka", label_pl="Ith", unit="kA"),
    ResultColumnDTO(key="sk_mva", label_pl="Sk''", unit="MVA"),
    ResultColumnDTO(key="fault_type", label_pl="Rodzaj zwarcia"),
    ResultColumnDTO(key="flags", label_pl="Flagi"),
)


class ResultsInspectorService:
    """
    P11a: READ-ONLY service for inspecting analysis run results.

    INVARIANTS:
    - No physics: Only reads from stored results
    - No mutations: Returns frozen DTOs, never modifies model
    - Deterministic: Same run_id → identical response
    """

    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory

    # -------------------------------------------------------------------------
    # Run Header
    # -------------------------------------------------------------------------

    def get_run_header(self, run_id: UUID) -> RunHeaderDTO:
        """Build RunHeaderDTO from stored run metadata."""
        with self._uow_factory() as uow:
            run = uow.analysis_runs.get(run_id)
        if run is None:
            raise ValueError(f"AnalysisRun {run_id} not found")
        return self._build_run_header(run)

    def _build_run_header(self, run: AnalysisRun) -> RunHeaderDTO:
        snapshot_id = run.input_snapshot.get("snapshot_id")
        return RunHeaderDTO(
            run_id=run.id,
            project_id=run.project_id,
            case_id=run.operating_case_id,
            snapshot_id=str(snapshot_id) if snapshot_id else None,
            created_at=run.created_at,
            status=run.status,
            result_state=run.result_status,
            solver_kind=run.analysis_type,
            input_hash=run.input_hash,
        )

    # -------------------------------------------------------------------------
    # Results Index
    # -------------------------------------------------------------------------

    def get_results_index(self, run_id: UUID) -> ResultsIndexDTO:
        """
        Build ResultsIndexDTO with available tables for a run.

        P11a: Deterministic, lists tables based on analysis_type.
        """
        with self._uow_factory() as uow:
            run = uow.analysis_runs.get(run_id)
            if run is None:
                raise ValueError(f"AnalysisRun {run_id} not found")
            results = uow.results.list_results(run_id)
            nodes = uow.network.list_nodes(run.project_id)

        run_header = self._build_run_header(run)
        tables: list[ResultTableMetaDTO] = []

        # Buses table (always available if we have nodes)
        bus_count = len(nodes)
        if bus_count > 0:
            tables.append(
                ResultTableMetaDTO(
                    table_id="buses",
                    label_pl="Wyniki węzłowe",
                    row_count=bus_count,
                    columns=BUS_COLUMNS,
                )
            )

        # Branches table (for PF results)
        if run.analysis_type == "PF":
            pf_result = self._find_result_by_type(results, "power_flow")
            if pf_result:
                branch_results = (pf_result.get("payload") or {}).get("branch_results", {})
                branch_count = len(branch_results)
                tables.append(
                    ResultTableMetaDTO(
                        table_id="branches",
                        label_pl="Wyniki gałęziowe",
                        row_count=branch_count,
                        columns=BRANCH_COLUMNS,
                    )
                )

        # Short-circuit table (for SC results)
        if run.analysis_type == "short_circuit_sn":
            sc_result = self._find_result_by_type(results, "short_circuit_sn")
            if sc_result:
                tables.append(
                    ResultTableMetaDTO(
                        table_id="short-circuit",
                        label_pl="Wyniki zwarciowe",
                        row_count=1,  # Single fault location per run
                        columns=SHORT_CIRCUIT_COLUMNS,
                    )
                )

        return ResultsIndexDTO(run_header=run_header, tables=tuple(tables))

    # -------------------------------------------------------------------------
    # Bus Results
    # -------------------------------------------------------------------------

    def get_bus_results(self, run_id: UUID) -> BusResultsDTO:
        """
        Build BusResultsDTO from stored results.

        P11a: Deterministically sorted by (name, bus_id).
        """
        with self._uow_factory() as uow:
            run = uow.analysis_runs.get(run_id)
            if run is None:
                raise ValueError(f"AnalysisRun {run_id} not found")
            results = uow.results.list_results(run_id)
            nodes = uow.network.list_nodes(run.project_id)

        # Build node lookup
        node_map: dict[str, dict[str, Any]] = {}
        for node in nodes:
            node_map[str(node["id"])] = node

        rows: list[BusResultsRowDTO] = []

        # Extract bus results from PF result
        bus_results: dict[str, dict[str, Any]] = {}
        if run.analysis_type == "PF":
            pf_result = self._find_result_by_type(results, "power_flow")
            if pf_result:
                payload = pf_result.get("payload") or {}
                bus_results = payload.get("bus_results", {})

        # Build rows for all nodes
        for node_id, node in node_map.items():
            bus_data = bus_results.get(node_id, {})
            flags: list[str] = []

            # Check for slack node
            slack_spec = run.input_snapshot.get("slack", {})
            if str(slack_spec.get("node_id")) == node_id:
                flags.append("SLACK")

            # Check for voltage violations (if PF result available)
            u_pu = bus_data.get("v_pu")
            if u_pu is not None:
                if u_pu < 0.95 or u_pu > 1.05:
                    flags.append("VOLTAGE_VIOLATION")

            rows.append(
                BusResultsRowDTO(
                    bus_id=node_id,
                    name=node.get("name", ""),
                    un_kv=float(node.get("base_kv", 0.0)),
                    u_kv=bus_data.get("v_kv"),
                    u_pu=bus_data.get("v_pu"),
                    angle_deg=bus_data.get("angle_deg"),
                    flags=flags,
                )
            )

        # Deterministic sort: by (name, bus_id)
        rows.sort(key=lambda r: (r.name.lower(), r.bus_id))

        return BusResultsDTO(run_id=run_id, rows=tuple(rows))

    # -------------------------------------------------------------------------
    # Branch Results
    # -------------------------------------------------------------------------

    def get_branch_results(self, run_id: UUID) -> BranchResultsDTO:
        """
        Build BranchResultsDTO from stored results.

        P11a: Deterministically sorted by (name, branch_id).
        """
        with self._uow_factory() as uow:
            run = uow.analysis_runs.get(run_id)
            if run is None:
                raise ValueError(f"AnalysisRun {run_id} not found")
            results = uow.results.list_results(run_id)
            branches = uow.network.list_branches(run.project_id)

        # Build branch lookup
        branch_map: dict[str, dict[str, Any]] = {}
        for branch in branches:
            branch_map[str(branch["id"])] = branch

        rows: list[BranchResultsRowDTO] = []

        # Extract branch results from PF result
        branch_results: dict[str, dict[str, Any]] = {}
        if run.analysis_type == "PF":
            pf_result = self._find_result_by_type(results, "power_flow")
            if pf_result:
                payload = pf_result.get("payload") or {}
                branch_results = payload.get("branch_results", {})

        # Build rows for all branches
        for branch_id, branch in branch_map.items():
            branch_data = branch_results.get(branch_id, {})
            flags: list[str] = []

            # Check for overloading
            loading_pct = branch_data.get("loading_percent")
            if loading_pct is not None and loading_pct > 100.0:
                flags.append("OVERLOADED")

            rows.append(
                BranchResultsRowDTO(
                    branch_id=branch_id,
                    name=branch.get("name", ""),
                    from_bus=str(branch.get("from_node_id", "")),
                    to_bus=str(branch.get("to_node_id", "")),
                    i_a=branch_data.get("i_a"),
                    s_mva=branch_data.get("s_mva"),
                    p_mw=branch_data.get("p_mw"),
                    q_mvar=branch_data.get("q_mvar"),
                    loading_pct=branch_data.get("loading_percent"),
                    flags=flags,
                )
            )

        # Deterministic sort: by (name, branch_id)
        rows.sort(key=lambda r: (r.name.lower(), r.branch_id))

        return BranchResultsDTO(run_id=run_id, rows=tuple(rows))

    # -------------------------------------------------------------------------
    # Short-Circuit Results
    # -------------------------------------------------------------------------

    def get_short_circuit_results(self, run_id: UUID) -> ShortCircuitResultsDTO:
        """
        Build ShortCircuitResultsDTO from stored results.

        P11a: Deterministically sorted by target_id.
        Only available for short_circuit_sn analysis type.
        """
        with self._uow_factory() as uow:
            run = uow.analysis_runs.get(run_id)
            if run is None:
                raise ValueError(f"AnalysisRun {run_id} not found")
            if run.analysis_type != "short_circuit_sn":
                raise ValueError(
                    f"Short-circuit results not available for analysis type: {run.analysis_type}"
                )
            results = uow.results.list_results(run_id)
            nodes = uow.network.list_nodes(run.project_id)

        # Build node name lookup
        node_names: dict[str, str] = {}
        for node in nodes:
            node_names[str(node["id"])] = node.get("name", "")

        rows: list[ShortCircuitRowDTO] = []

        sc_result = self._find_result_by_type(results, "short_circuit_sn")
        if sc_result:
            payload = sc_result.get("payload") or {}
            fault_node_id = payload.get("fault_node_id")
            if fault_node_id:
                fault_node_id_str = str(fault_node_id)
                # Convert from A to kA if needed
                ikss_a = payload.get("ikss_a")
                ip_a = payload.get("ip_a")
                ith_a = payload.get("ith_a")

                ikss_ka = ikss_a / 1000.0 if ikss_a is not None else None
                ip_ka = ip_a / 1000.0 if ip_a is not None else None
                ith_ka = ith_a / 1000.0 if ith_a is not None else None

                rows.append(
                    ShortCircuitRowDTO(
                        target_id=fault_node_id_str,
                        target_name=node_names.get(fault_node_id_str),
                        ikss_ka=ikss_ka,
                        ip_ka=ip_ka,
                        ith_ka=ith_ka,
                        sk_mva=payload.get("sk_mva"),
                        fault_type=payload.get("short_circuit_type"),
                        flags=[],
                    )
                )

        # Deterministic sort: by target_id
        rows.sort(key=lambda r: r.target_id)

        return ShortCircuitResultsDTO(run_id=run_id, rows=tuple(rows))

    # -------------------------------------------------------------------------
    # Extended Trace
    # -------------------------------------------------------------------------

    def get_extended_trace(self, run_id: UUID) -> ExtendedTraceDTO:
        """
        Build ExtendedTraceDTO with white_box_trace + run context.

        P11a: Provides full trace for audit.
        """
        with self._uow_factory() as uow:
            run = uow.analysis_runs.get(run_id)
        if run is None:
            raise ValueError(f"AnalysisRun {run_id} not found")

        catalog_context = build_catalog_context(run.input_snapshot or {})
        white_box_trace = enrich_trace_steps_with_catalog_context(
            list(run.white_box_trace or []),
            catalog_context,
        )
        snapshot_id = run.input_snapshot.get("snapshot_id")

        return ExtendedTraceDTO(
            run_id=run_id,
            snapshot_id=str(snapshot_id) if snapshot_id else None,
            input_hash=run.input_hash,
            white_box_trace=white_box_trace,
            catalog_context=catalog_context,
            catalog_context_by_element=build_catalog_context_index(catalog_context),
            catalog_context_summary=build_catalog_context_summary(catalog_context),
        )

    # -------------------------------------------------------------------------
    # SLD Result Overlay
    # -------------------------------------------------------------------------

    def get_sld_result_overlay(
        self, project_id: UUID, diagram_id: UUID, run_id: UUID
    ) -> SldResultOverlayDTO:
        """
        Build SLD result overlay mapping results to SLD symbols.

        P11a: Mapping only, no mutations, no physics.
        """
        with self._uow_factory() as uow:
            run = uow.analysis_runs.get(run_id)
            if run is None:
                raise ValueError(f"AnalysisRun {run_id} not found")
            if run.project_id != project_id:
                raise ValueError("Run does not belong to this project")

            diagram = uow.sld.get(diagram_id)
            if diagram is None or diagram.get("project_id") != project_id:
                raise ValueError("SLD diagram not found")

            results = uow.results.list_results(run_id)

        sld_payload = diagram.get("payload", {})
        bus_overlays: list[SldOverlayBusDTO] = []
        branch_overlays: list[SldOverlayBranchDTO] = []

        # Extract result data based on analysis type
        bus_results: dict[str, dict[str, Any]] = {}
        branch_results: dict[str, dict[str, Any]] = {}
        sc_results: dict[str, dict[str, Any]] = {}

        if run.analysis_type == "PF":
            pf_result = self._find_result_by_type(results, "power_flow")
            if pf_result:
                payload = pf_result.get("payload") or {}
                bus_results = payload.get("bus_results", {})
                branch_results = payload.get("branch_results", {})

        if run.analysis_type == "short_circuit_sn":
            sc_result = self._find_result_by_type(results, "short_circuit_sn")
            if sc_result:
                payload = sc_result.get("payload") or {}
                fault_node_id = payload.get("fault_node_id")
                if fault_node_id:
                    ikss_a = payload.get("ikss_a")
                    sc_results[str(fault_node_id)] = {
                        "ikss_ka": ikss_a / 1000.0 if ikss_a else None,
                        "sk_mva": payload.get("sk_mva"),
                    }

        # Build node overlays
        for node_symbol in sld_payload.get("nodes", []):
            symbol_id = str(node_symbol.get("id", ""))
            node_id = str(node_symbol.get("node_id", ""))

            bus_data = bus_results.get(node_id, {})
            sc_data = sc_results.get(node_id, {})

            bus_overlays.append(
                SldOverlayBusDTO(
                    symbol_id=symbol_id,
                    bus_id=node_id,
                    u_pu=bus_data.get("v_pu"),
                    u_kv=bus_data.get("v_kv"),
                    angle_deg=bus_data.get("angle_deg"),
                    ikss_ka=sc_data.get("ikss_ka"),
                    sk_mva=sc_data.get("sk_mva"),
                )
            )

        # Build branch overlays
        for branch_symbol in sld_payload.get("branches", []):
            symbol_id = str(branch_symbol.get("id", ""))
            branch_id = str(branch_symbol.get("branch_id", ""))

            branch_data = branch_results.get(branch_id, {})

            branch_overlays.append(
                SldOverlayBranchDTO(
                    symbol_id=symbol_id,
                    branch_id=branch_id,
                    p_mw=branch_data.get("p_mw"),
                    q_mvar=branch_data.get("q_mvar"),
                    i_a=branch_data.get("i_a"),
                    loading_pct=branch_data.get("loading_percent"),
                )
            )

        # Deterministic sort
        bus_overlays.sort(key=lambda n: (n.bus_id, n.symbol_id))
        branch_overlays.sort(key=lambda b: (b.branch_id, b.symbol_id))

        return SldResultOverlayDTO(
            diagram_id=diagram_id,
            run_id=run_id,
            result_status=run.result_status,
            buses=tuple(bus_overlays),
            branches=tuple(branch_overlays),
        )

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    def _find_result_by_type(
        self, results: list[dict[str, Any]], result_type: str
    ) -> dict[str, Any] | None:
        """Find first result matching result_type."""
        for result in results:
            if result.get("result_type") == result_type:
                return result
        return None
