from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any


class VoltageProfileStatus(StrEnum):
    PASS = "PASS"
    WARNING = "WARNING"
    FAIL = "FAIL"
    NOT_COMPUTED = "NOT_COMPUTED"


@dataclass(frozen=True)
class VoltageProfileRow:
    bus_id: str
    bus_name: str | None
    u_nom_kv: float | None
    u_kv: float | None
    u_pu: float | None
    delta_pct: float | None
    status: VoltageProfileStatus
    p_mw: float | None
    q_mvar: float | None
    case_name: str | None
    run_timestamp: datetime | None


@dataclass(frozen=True)
class VoltageProfileSummary:
    worst_bus_id: str | None
    worst_delta_pct_abs: float | None
    pass_count: int
    warning_count: int
    fail_count: int
    not_computed_count: int


@dataclass(frozen=True)
class VoltageProfileContext:
    project_name: str | None
    case_name: str | None
    run_timestamp: datetime | None
    snapshot_id: str | None
    trace_id: str | None
    #: Identyfikator PRZEBIEGU (V12K-269). Osobne pole, bo `trace_id` jest
    #: identyfikatorem ARTEFAKTU dowodowego — dwa rozne pojecia nie moga
    #: dzielic jednej nazwy. NIE wchodzi do odcisku analizy.
    run_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_name": self.project_name,
            "case_name": self.case_name,
            "run_timestamp": self.run_timestamp.isoformat() if self.run_timestamp else None,
            "snapshot_id": self.snapshot_id,
            "trace_id": self.trace_id,
            "run_id": self.run_id,
        }


@dataclass(frozen=True)
class VoltageProfileView:
    context: VoltageProfileContext | None
    thresholds: dict[str, float]
    rows: tuple[VoltageProfileRow, ...]
    summary: VoltageProfileSummary

    def to_dict(self) -> dict[str, Any]:
        from analysis.voltage_profile.serializer import view_to_dict

        return view_to_dict(self)


@dataclass(frozen=True)
class VoltageProfileSegment:
    """P0.4 (nN): jeden odcinek (gałąź) na ścieżce źródło→węzeł.

    Czysta interpretacja z ``PowerFlowResultV1`` (napięcia węzłów już
    rozwiązane przez solver) — ``delta_u_kv``/``delta_u_percent`` to
    ARYTMETYCZNA różnica dwóch już policzonych wartości, zero fizyki.

    Attributes:
        branch_id: ID gałęzi (kabel/linia/transformator) tego odcinka.
        from_bus: Węzeł bliższy źródłu (SLACK) na tym odcinku.
        to_bus: Węzeł dalszy od źródła na tym odcinku.
        u_from_kv: Napięcie na węźle ``from_bus`` [kV] (``v_pu * U_nom``).
        u_to_kv: Napięcie na węźle ``to_bus`` [kV].
        delta_u_kv: ``u_from_kv - u_to_kv`` [kV] (dodatnie = spadek w kierunku
            od źródła; ujemne = WZROST — typowy przy przepływie zwrotnym/OZE).
        delta_u_percent: ``delta_u_kv`` jako % napięcia znamionowego węzła
            ``to_bus`` (a nie ``from_bus`` — gałąź transformatorowa ma na obu
            końcach RÓŻNE napięcie znamionowe; % liczony względem węzła, do
            którego odcinek prowadzi, jest jednoznaczny niezależnie od typu
            gałęzi).
    """

    branch_id: str
    from_bus: str
    to_bus: str
    u_from_kv: float
    u_to_kv: float
    delta_u_kv: float
    delta_u_percent: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "branch_id": self.branch_id,
            "from_bus": self.from_bus,
            "to_bus": self.to_bus,
            "u_from_kv": float(self.u_from_kv),
            "u_to_kv": float(self.u_to_kv),
            "delta_u_kv": float(self.delta_u_kv),
            "delta_u_percent": float(self.delta_u_percent),
        }


@dataclass(frozen=True)
class VoltageProfileSegmentPath:
    """P0.4 (nN): pełna dekompozycja ΔU na ścieżce źródło (SLACK)→węzeł.

    ``segments`` jest uporządkowana od źródła do ``node_id`` (indeks 0 =
    pierwszy odcinek za SLACK). Niezmiennik weryfikowany przy budowie (patrz
    ``segment_decomposition.py``): suma ``delta_u_kv`` wszystkich segmentów
    równa się ``u_source_kv - u_node_kv`` (telescoping sum po napięciach
    węzłów wzdłuż ścieżki).
    """

    node_id: str
    source_id: str
    u_source_kv: float
    u_node_kv: float
    segments: tuple[VoltageProfileSegment, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "node_id": self.node_id,
            "source_id": self.source_id,
            "u_source_kv": float(self.u_source_kv),
            "u_node_kv": float(self.u_node_kv),
            "segments": [segment.to_dict() for segment in self.segments],
        }
