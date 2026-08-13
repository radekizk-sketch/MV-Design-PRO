from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID


def _format_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.isoformat()
    return value.isoformat()


@dataclass(frozen=True)
class AnalysisRunSummaryDTO:
    id: UUID
    deterministic_id: str
    analysis_type: str
    status: str
    result_status: str
    created_at: datetime
    finished_at: datetime | None
    input_hash: str
    summary_json: dict[str, Any]
    trace_summary: dict[str, Any] | None = None
    results_valid: bool = True  # PR-4: explicit validity flag

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "deterministic_id": self.deterministic_id,
            "analysis_type": self.analysis_type,
            "status": self.status,
            "result_status": self.result_status,
            "results_valid": self.results_valid,
            "created_at": _format_datetime(self.created_at),
            "finished_at": _format_datetime(self.finished_at),
            "input_hash": self.input_hash,
            "summary_json": self.summary_json,
            "trace_summary": self.trace_summary,
        }


@dataclass(frozen=True)
class AnalysisRunDetailDTO:
    id: UUID
    deterministic_id: str
    analysis_type: str
    status: str
    result_status: str
    created_at: datetime
    finished_at: datetime | None
    input_hash: str
    summary_json: dict[str, Any]
    trace_summary: dict[str, Any] | None
    input_metadata: dict[str, Any] = field(default_factory=dict)
    results_valid: bool = True  # PR-4: explicit validity flag

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": str(self.id),
            "deterministic_id": self.deterministic_id,
            "analysis_type": self.analysis_type,
            "status": self.status,
            "result_status": self.result_status,
            "results_valid": self.results_valid,
            "created_at": _format_datetime(self.created_at),
            "finished_at": _format_datetime(self.finished_at),
            "input_hash": self.input_hash,
            "summary_json": self.summary_json,
            "trace_summary": self.trace_summary,
            "input_metadata": self.input_metadata,
        }


@dataclass(frozen=True)
class ResultItemDTO:
    id: UUID
    result_type: str
    created_at: datetime
    payload_summary: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "result_type": self.result_type,
            "payload_summary": self.payload_summary,
            "reference": {
                "id": str(self.id),
                "created_at": _format_datetime(self.created_at),
            },
        }


@dataclass(frozen=True)
class ResultListDTO:
    results: tuple[ResultItemDTO, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {"results": [item.to_dict() for item in self.results]}


@dataclass(frozen=True)
class OverlayDTO:
    bus_overlays: list[dict[str, Any]] = field(default_factory=list)
    branch_overlays: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "bus_overlays": self.bus_overlays,
            "node_overlays": self.bus_overlays,  # backward-compat alias
            "branch_overlays": self.branch_overlays,
        }


@dataclass(frozen=True)
class TraceDTO:
    trace: dict[str, Any] | list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        return {"trace": self.trace}


@dataclass(frozen=True)
class TraceSummaryDTO:
    count: int
    first_step: str | None
    last_step: str | None
    phases: list[str] = field(default_factory=list)
    duration_ms: float | None = None
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "count": self.count,
            "first_step": self.first_step,
            "last_step": self.last_step,
            "phases": self.phases,
            "duration_ms": self.duration_ms,
            "warnings": self.warnings,
        }


# =============================================================================
# P11a — Results Inspector DTOs (READ-ONLY)
#
# CANONICAL ALIGNMENT:
# - READ-ONLY: These DTOs are built from stored Run results + metadata
# - NO PHYSICS: Zero calculations, zero mutations
# - DETERMINISTIC: Same inputs → identical JSON output
# - POLISH LABELS: Ready for UI localization
# =============================================================================


@dataclass(frozen=True)
class RunHeaderDTO:
    """
    Header metadata for an analysis run.

    P11a: Provides essential run identification and state.
    """

    run_id: UUID
    project_id: UUID
    case_id: UUID
    snapshot_id: str | None
    created_at: datetime
    status: str
    result_state: str  # VALID, OUTDATED, NONE
    solver_kind: str  # PF, short_circuit_sn
    input_hash: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": str(self.run_id),
            "project_id": str(self.project_id),
            "case_id": str(self.case_id),
            "snapshot_id": self.snapshot_id,
            "created_at": _format_datetime(self.created_at),
            "status": self.status,
            "result_state": self.result_state,
            "solver_kind": self.solver_kind,
            "input_hash": self.input_hash,
        }


@dataclass(frozen=True)
class ResultColumnDTO:
    """
    Column metadata for result tables.

    P11a: Describes column name, unit, and display label (Polish).
    """

    key: str
    label_pl: str
    unit: str | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "key": self.key,
            "label_pl": self.label_pl,
        }
        if self.unit is not None:
            result["unit"] = self.unit
        return result


@dataclass(frozen=True)
class ResultTableMetaDTO:
    """
    Metadata for a result table (e.g., buses, branches, short-circuit).

    P11a: Provides table name, columns, and row count.
    """

    table_id: str
    label_pl: str
    row_count: int
    columns: tuple[ResultColumnDTO, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "table_id": self.table_id,
            "label_pl": self.label_pl,
            "row_count": self.row_count,
            "columns": [col.to_dict() for col in self.columns],
        }


@dataclass(frozen=True)
class ResultsIndexDTO:
    """
    Index of available result tables for a run.

    P11a: Lists all tables + column metadata + units.
    """

    run_header: RunHeaderDTO
    tables: tuple[ResultTableMetaDTO, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_header": self.run_header.to_dict(),
            "tables": [table.to_dict() for table in self.tables],
        }


@dataclass(frozen=True)
class BusResultsRowDTO:
    """
    Single bus result row.

    P11a: Deterministic, READ-ONLY, no physics.
    Fields from stored Power Flow / SC results only.
    """

    bus_id: str
    name: str
    un_kv: float  # Nominal voltage [kV]
    u_kv: float | None = None  # Voltage magnitude [kV] (PF result)
    u_pu: float | None = None  # Voltage magnitude [pu] (PF result)
    angle_deg: float | None = None  # Voltage angle [deg] (PF result)
    flags: list[str] = field(default_factory=list)  # e.g., ["SLACK", "VIOLATION"]

    def to_dict(self) -> dict[str, Any]:
        return {
            "bus_id": self.bus_id,
            "name": self.name,
            "un_kv": self.un_kv,
            "u_kv": self.u_kv,
            "u_pu": self.u_pu,
            "angle_deg": self.angle_deg,
            "flags": list(self.flags),
        }


@dataclass(frozen=True)
class BusResultsDTO:
    """
    Bus results table for a run.

    P11a: Deterministically sorted by (name, bus_id).
    """

    run_id: UUID
    rows: tuple[BusResultsRowDTO, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": str(self.run_id),
            "rows": [row.to_dict() for row in self.rows],
        }


@dataclass(frozen=True)
class BranchResultsRowDTO:
    """
    Single branch result row.

    P11a: Deterministic, READ-ONLY, no physics.
    Fields from stored Power Flow results only.
    """

    branch_id: str
    name: str
    from_bus: str
    to_bus: str
    i_a: float | None = None  # Current magnitude [A]
    s_mva: float | None = None  # Apparent power [MVA]
    p_mw: float | None = None  # Active power [MW]
    q_mvar: float | None = None  # Reactive power [Mvar]
    loading_pct: float | None = None  # Loading [%]
    flags: list[str] = field(default_factory=list)  # e.g., ["OVERLOADED"]

    def to_dict(self) -> dict[str, Any]:
        return {
            "branch_id": self.branch_id,
            "name": self.name,
            "from_bus": self.from_bus,
            "to_bus": self.to_bus,
            "i_a": self.i_a,
            "s_mva": self.s_mva,
            "p_mw": self.p_mw,
            "q_mvar": self.q_mvar,
            "loading_pct": self.loading_pct,
            "flags": list(self.flags),
        }


@dataclass(frozen=True)
class BranchResultsDTO:
    """
    Branch results table for a run.

    P11a: Deterministically sorted by (name, branch_id).
    """

    run_id: UUID
    rows: tuple[BranchResultsRowDTO, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": str(self.run_id),
            "rows": [row.to_dict() for row in self.rows],
        }


@dataclass(frozen=True)
class ShortCircuitRowDTO:
    """
    Single short-circuit result row (IEC 60909).

    P11a: Deterministic, READ-ONLY, no physics.
    Fields from stored Short-Circuit results only.
    """

    target_id: str  # Bus/node where fault was applied
    target_name: str | None = None
    ikss_ka: float | None = None  # Initial short-circuit current Ik'' [kA]
    ip_ka: float | None = None  # Peak current ip [kA]
    ith_ka: float | None = None  # Thermal equivalent current Ith [kA]
    sk_mva: float | None = None  # Short-circuit power Sk'' [MVA]
    fault_type: str | None = None  # 3F, 1F, 2F, 2F+G
    flags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "target_id": self.target_id,
            "target_name": self.target_name,
            "ikss_ka": self.ikss_ka,
            "ip_ka": self.ip_ka,
            "ith_ka": self.ith_ka,
            "sk_mva": self.sk_mva,
            "fault_type": self.fault_type,
            "flags": list(self.flags),
        }


@dataclass(frozen=True)
class ShortCircuitResultsDTO:
    """
    Short-circuit results table for a run.

    P11a: Deterministically sorted by target_id.
    """

    run_id: UUID
    rows: tuple[ShortCircuitRowDTO, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": str(self.run_id),
            "rows": [row.to_dict() for row in self.rows],
        }


@dataclass(frozen=True)
class ExtendedTraceDTO:
    """
    Extended trace DTO with run metadata.

    P11a: Provides white_box_trace + run context for audit.
    """

    run_id: UUID
    snapshot_id: str | None
    input_hash: str
    white_box_trace: list[dict[str, Any]]
    catalog_context: list[dict[str, Any]] = field(default_factory=list)
    catalog_context_by_element: dict[str, dict[str, Any]] = field(default_factory=dict)
    catalog_context_summary: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": str(self.run_id),
            "snapshot_id": self.snapshot_id,
            "input_hash": self.input_hash,
            "white_box_trace": self.white_box_trace,
            "catalog_context": self.catalog_context,
            "catalog_context_by_element": self.catalog_context_by_element,
            "catalog_context_summary": self.catalog_context_summary,
        }


@dataclass(frozen=True)
class SldOverlayBusDTO:
    """
    SLD overlay data for a single bus.

    P11a: Mapping only, no physics.
    """

    symbol_id: str  # SLD symbol ID
    bus_id: str  # Network bus ID
    u_pu: float | None = None
    u_kv: float | None = None
    angle_deg: float | None = None
    ikss_ka: float | None = None  # SC result
    sk_mva: float | None = None  # SC result

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "symbol_id": self.symbol_id,
            "bus_id": self.bus_id,
            "node_id": self.bus_id,  # backward-compat alias
        }
        if self.u_pu is not None:
            result["u_pu"] = self.u_pu
        if self.u_kv is not None:
            result["u_kv"] = self.u_kv
        if self.angle_deg is not None:
            result["angle_deg"] = self.angle_deg
        if self.ikss_ka is not None:
            result["ikss_ka"] = self.ikss_ka
        if self.sk_mva is not None:
            result["sk_mva"] = self.sk_mva
        return result


# Backward-compat alias
SldOverlayNodeDTO = SldOverlayBusDTO


@dataclass(frozen=True)
class SldOverlayBranchDTO:
    """
    SLD overlay data for a single branch.

    P11a: Mapping only, no physics.
    """

    symbol_id: str  # SLD symbol ID
    branch_id: str  # Network branch ID
    p_mw: float | None = None
    q_mvar: float | None = None
    i_a: float | None = None
    loading_pct: float | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "symbol_id": self.symbol_id,
            "branch_id": self.branch_id,
        }
        if self.p_mw is not None:
            result["p_mw"] = self.p_mw
        if self.q_mvar is not None:
            result["q_mvar"] = self.q_mvar
        if self.i_a is not None:
            result["i_a"] = self.i_a
        if self.loading_pct is not None:
            result["loading_pct"] = self.loading_pct
        return result


@dataclass(frozen=True)
class SldResultOverlayDTO:
    """
    Complete SLD result overlay for a diagram.

    P11a: Mapping data only, does not mutate model or diagram.
    """

    diagram_id: UUID
    run_id: UUID
    result_status: str  # FRESH, OUTDATED, NONE
    buses: tuple[SldOverlayBusDTO, ...] = ()
    branches: tuple[SldOverlayBranchDTO, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "diagram_id": str(self.diagram_id),
            "run_id": str(self.run_id),
            "result_status": self.result_status,
            "buses": [bus.to_dict() for bus in self.buses],
            "nodes": [bus.to_dict() for bus in self.buses],  # backward-compat alias
            "branches": [branch.to_dict() for branch in self.branches],
        }
