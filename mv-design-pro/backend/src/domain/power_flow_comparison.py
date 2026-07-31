"""
Power Flow Comparison Domain Model — P20c (A/B)

CANONICAL ALIGNMENT:
- P20c: Power Flow A/B Comparison
- Consumes: Two PowerFlowRun results (must be FINISHED)
- Produces: PowerFlowComparisonResult + PowerFlowComparisonTrace (deterministic)

INVARIANTS (BINDING):
1. READ-ONLY: Zero physics calculations, zero state mutations
2. SAME PROJECT: Both runs must belong to the same project
3. FINISHED ONLY: Both runs must be FINISHED status
4. DETERMINISTIC: Same inputs → identical outputs

NOT IN SCOPE:
- Voltage limit violations (normative interpretation)
- Power flow physics (only delta comparison)
- Advisory on settings adjustment
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum, StrEnum
from typing import Any
from uuid import UUID, uuid4

# =============================================================================
# ENUMS AND TYPES
# =============================================================================


class PowerFlowIssueCode(StrEnum):
    """
    Issue codes for power flow comparison ranking.

    Technical, factual issue classification without normative interpretation.
    """

    NON_CONVERGENCE_CHANGE = "NON_CONVERGENCE_CHANGE"  # One run converged, other did not
    VOLTAGE_DELTA_HIGH = "VOLTAGE_DELTA_HIGH"  # Large voltage magnitude change
    ANGLE_SHIFT_HIGH = "ANGLE_SHIFT_HIGH"  # Large angle change
    LOSSES_INCREASED = "LOSSES_INCREASED"  # Significant losses increase
    LOSSES_DECREASED = "LOSSES_DECREASED"  # Significant losses decrease
    SLACK_POWER_CHANGED = "SLACK_POWER_CHANGED"  # Slack bus power significantly changed


class PowerFlowIssueSeverity(int, Enum):
    """
    Issue severity scale (1–5).

    1 = Informational (no action required)
    2 = Minor (review recommended)
    3 = Moderate (attention required)
    4 = Major (action required)
    5 = Critical (immediate action required)
    """

    INFORMATIONAL = 1
    MINOR = 2
    MODERATE = 3
    MAJOR = 4
    CRITICAL = 5


# Issue severity mapping (deterministic)
ISSUE_SEVERITY_MAP: dict[PowerFlowIssueCode, PowerFlowIssueSeverity] = {
    PowerFlowIssueCode.NON_CONVERGENCE_CHANGE: PowerFlowIssueSeverity.CRITICAL,
    PowerFlowIssueCode.VOLTAGE_DELTA_HIGH: PowerFlowIssueSeverity.MAJOR,
    PowerFlowIssueCode.ANGLE_SHIFT_HIGH: PowerFlowIssueSeverity.MODERATE,
    PowerFlowIssueCode.LOSSES_INCREASED: PowerFlowIssueSeverity.MODERATE,
    PowerFlowIssueCode.LOSSES_DECREASED: PowerFlowIssueSeverity.MINOR,
    PowerFlowIssueCode.SLACK_POWER_CHANGED: PowerFlowIssueSeverity.MINOR,
}

# Polish descriptions for issues (deterministic)
ISSUE_DESCRIPTIONS_PL: dict[PowerFlowIssueCode, str] = {
    PowerFlowIssueCode.NON_CONVERGENCE_CHANGE: "Zmiana zbieznosci rozpływu",
    PowerFlowIssueCode.VOLTAGE_DELTA_HIGH: "Duza zmiana napiecia",
    PowerFlowIssueCode.ANGLE_SHIFT_HIGH: "Duzy przesuniecie kata",
    PowerFlowIssueCode.LOSSES_INCREASED: "Wzrost strat mocy",
    PowerFlowIssueCode.LOSSES_DECREASED: "Spadek strat mocy",
    PowerFlowIssueCode.SLACK_POWER_CHANGED: "Zmiana mocy szyny bilansowej",
}


# =============================================================================
# RANKING THRESHOLDS (EXPLICIT, DOCUMENTED)
# =============================================================================

# Voltage magnitude delta threshold for VOLTAGE_DELTA_HIGH [pu]
VOLTAGE_DELTA_THRESHOLD_PU = 0.02  # 2%

# Angle delta threshold for ANGLE_SHIFT_HIGH [deg]
ANGLE_DELTA_THRESHOLD_DEG = 5.0

# Losses increase threshold for LOSSES_INCREASED [MW]
LOSSES_INCREASE_THRESHOLD_MW = 0.1

# Losses decrease threshold for LOSSES_DECREASED [MW]
LOSSES_DECREASE_THRESHOLD_MW = 0.1

# Slack power change threshold [MW]
SLACK_POWER_CHANGE_THRESHOLD_MW = 0.5

# Top N buses/branches for ranking (severity 4)
TOP_N_FOR_RANKING = 5


# =============================================================================
# RÓŻNICA WZGLĘDNA (L-13)
# =============================================================================


def procent_roznicy(wartosc_a: float, wartosc_b: float) -> float | None:
    """Różnica względna B wobec A w procentach: (B − A) / |A| · 100 [%].

    L-13: różnica procentowa jest liczona TUTAJ (backend), bo w warstwie
    prezentacji byłaby arytmetyką na wynikach solvera. Odniesieniem jest zawsze
    przebieg A (baseline) — mianownik w wartości bezwzględnej, więc znak wyniku
    pokrywa się ze znakiem delty (B − A).

    Gdy A = 0, wartość względna NIE ISTNIEJE (dzielenie przez zero) → ``None``:
    uczciwy brak, pole pomijane w odpowiedzi (exclude_none), konsument pokazuje
    kreskę. Bez epsilonów i bez zaokrągleń — zero heurystyk, wynik
    deterministyczny.
    """
    if wartosc_a == 0.0:
        return None
    return (wartosc_b - wartosc_a) / abs(wartosc_a) * 100.0


def _procent_z_danych(data: dict[str, Any], klucz: str) -> float | None:
    """Odczyt pola procentowego ze słownika (brak klucza / None → None).

    Zgodność wsteczna: porównania zapisane przed L-13 nie mają tych pól.
    """
    wartosc = data.get(klucz)
    return None if wartosc is None else float(wartosc)


# =============================================================================
# BUS DIFF ROW
# =============================================================================


@dataclass(frozen=True)
class PowerFlowBusDiffRow:
    """
    Single bus comparison row.

    Compares bus voltage and power from Run A with Run B.

    Attributes:
        bus_id: Unique bus identifier
        v_pu_a: Voltage magnitude from Run A [pu]
        v_pu_b: Voltage magnitude from Run B [pu]
        angle_deg_a: Voltage angle from Run A [deg]
        angle_deg_b: Voltage angle from Run B [deg]
        p_injected_mw_a: Active power injection from Run A [MW]
        p_injected_mw_b: Active power injection from Run B [MW]
        q_injected_mvar_a: Reactive power injection from Run A [Mvar]
        q_injected_mvar_b: Reactive power injection from Run B [Mvar]
        delta_v_pu: Voltage magnitude delta (B - A) [pu]
        delta_angle_deg: Angle delta (B - A) [deg]
        delta_p_mw: Active power delta (B - A) [MW]
        delta_q_mvar: Reactive power delta (B - A) [Mvar]
        delta_v_percent: Względna zmiana napięcia (B − A)/|A| [%]; None = A równe zeru (L-13)
        delta_angle_percent: Względna zmiana kąta [%]; None = A równe zeru (L-13)
        delta_p_percent: Względna zmiana mocy czynnej [%]; None = A równe zeru (L-13)
        delta_q_percent: Względna zmiana mocy biernej [%]; None = A równe zeru (L-13)
    """

    bus_id: str
    v_pu_a: float
    v_pu_b: float
    angle_deg_a: float
    angle_deg_b: float
    p_injected_mw_a: float
    p_injected_mw_b: float
    q_injected_mvar_a: float
    q_injected_mvar_b: float
    delta_v_pu: float
    delta_angle_deg: float
    delta_p_mw: float
    delta_q_mvar: float
    # L-13 — pola addytywne (domyślnie None: starszy zapis porównania w cache
    # deserializuje się bez zmian; None NIE trafia do odpowiedzi — exclude_none).
    delta_v_percent: float | None = None
    delta_angle_percent: float | None = None
    delta_p_percent: float | None = None
    delta_q_percent: float | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict (pola procentowe: exclude_none)."""
        data: dict[str, Any] = {
            "bus_id": self.bus_id,
            "v_pu_a": self.v_pu_a,
            "v_pu_b": self.v_pu_b,
            "angle_deg_a": self.angle_deg_a,
            "angle_deg_b": self.angle_deg_b,
            "p_injected_mw_a": self.p_injected_mw_a,
            "p_injected_mw_b": self.p_injected_mw_b,
            "q_injected_mvar_a": self.q_injected_mvar_a,
            "q_injected_mvar_b": self.q_injected_mvar_b,
            "delta_v_pu": self.delta_v_pu,
            "delta_angle_deg": self.delta_angle_deg,
            "delta_p_mw": self.delta_p_mw,
            "delta_q_mvar": self.delta_q_mvar,
        }
        for klucz, wartosc in (
            ("delta_v_percent", self.delta_v_percent),
            ("delta_angle_percent", self.delta_angle_percent),
            ("delta_p_percent", self.delta_p_percent),
            ("delta_q_percent", self.delta_q_percent),
        ):
            if wartosc is not None:
                data[klucz] = wartosc
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PowerFlowBusDiffRow:
        """Deserialize from dict."""
        return cls(
            bus_id=str(data["bus_id"]),
            v_pu_a=float(data["v_pu_a"]),
            v_pu_b=float(data["v_pu_b"]),
            angle_deg_a=float(data["angle_deg_a"]),
            angle_deg_b=float(data["angle_deg_b"]),
            p_injected_mw_a=float(data["p_injected_mw_a"]),
            p_injected_mw_b=float(data["p_injected_mw_b"]),
            q_injected_mvar_a=float(data["q_injected_mvar_a"]),
            q_injected_mvar_b=float(data["q_injected_mvar_b"]),
            delta_v_pu=float(data["delta_v_pu"]),
            delta_angle_deg=float(data["delta_angle_deg"]),
            delta_p_mw=float(data["delta_p_mw"]),
            delta_q_mvar=float(data["delta_q_mvar"]),
            delta_v_percent=_procent_z_danych(data, "delta_v_percent"),
            delta_angle_percent=_procent_z_danych(data, "delta_angle_percent"),
            delta_p_percent=_procent_z_danych(data, "delta_p_percent"),
            delta_q_percent=_procent_z_danych(data, "delta_q_percent"),
        )


# =============================================================================
# BRANCH DIFF ROW
# =============================================================================


@dataclass(frozen=True)
class PowerFlowBranchDiffRow:
    """
    Single branch comparison row.

    Compares branch power flow from Run A with Run B.

    Attributes:
        branch_id: Unique branch identifier
        p_from_mw_a: Active power at from-end from Run A [MW]
        p_from_mw_b: Active power at from-end from Run B [MW]
        q_from_mvar_a: Reactive power at from-end from Run A [Mvar]
        q_from_mvar_b: Reactive power at from-end from Run B [Mvar]
        p_to_mw_a: Active power at to-end from Run A [MW]
        p_to_mw_b: Active power at to-end from Run B [MW]
        q_to_mvar_a: Reactive power at to-end from Run A [Mvar]
        q_to_mvar_b: Reactive power at to-end from Run B [Mvar]
        losses_p_mw_a: Active power losses from Run A [MW]
        losses_p_mw_b: Active power losses from Run B [MW]
        losses_q_mvar_a: Reactive power losses from Run A [Mvar]
        losses_q_mvar_b: Reactive power losses from Run B [Mvar]
        delta_p_from_mw: From-end active power delta (B - A) [MW]
        delta_q_from_mvar: From-end reactive power delta (B - A) [Mvar]
        delta_p_to_mw: To-end active power delta (B - A) [MW]
        delta_q_to_mvar: To-end reactive power delta (B - A) [Mvar]
        delta_losses_p_mw: Losses active power delta (B - A) [MW]
        delta_losses_q_mvar: Losses reactive power delta (B - A) [Mvar]
        delta_*_percent: Względne zmiany (B − A)/|A| [%] tych samych wielkości;
            None = wartość A równa zeru (różnica względna nie istnieje) — L-13
    """

    branch_id: str
    p_from_mw_a: float
    p_from_mw_b: float
    q_from_mvar_a: float
    q_from_mvar_b: float
    p_to_mw_a: float
    p_to_mw_b: float
    q_to_mvar_a: float
    q_to_mvar_b: float
    losses_p_mw_a: float
    losses_p_mw_b: float
    losses_q_mvar_a: float
    losses_q_mvar_b: float
    delta_p_from_mw: float
    delta_q_from_mvar: float
    delta_p_to_mw: float
    delta_q_to_mvar: float
    delta_losses_p_mw: float
    delta_losses_q_mvar: float
    # L-13 — pola addytywne (exclude_none; brak = starszy zapis albo A = 0).
    delta_p_from_percent: float | None = None
    delta_q_from_percent: float | None = None
    delta_p_to_percent: float | None = None
    delta_q_to_percent: float | None = None
    delta_losses_p_percent: float | None = None
    delta_losses_q_percent: float | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict (pola procentowe: exclude_none)."""
        data: dict[str, Any] = {
            "branch_id": self.branch_id,
            "p_from_mw_a": self.p_from_mw_a,
            "p_from_mw_b": self.p_from_mw_b,
            "q_from_mvar_a": self.q_from_mvar_a,
            "q_from_mvar_b": self.q_from_mvar_b,
            "p_to_mw_a": self.p_to_mw_a,
            "p_to_mw_b": self.p_to_mw_b,
            "q_to_mvar_a": self.q_to_mvar_a,
            "q_to_mvar_b": self.q_to_mvar_b,
            "losses_p_mw_a": self.losses_p_mw_a,
            "losses_p_mw_b": self.losses_p_mw_b,
            "losses_q_mvar_a": self.losses_q_mvar_a,
            "losses_q_mvar_b": self.losses_q_mvar_b,
            "delta_p_from_mw": self.delta_p_from_mw,
            "delta_q_from_mvar": self.delta_q_from_mvar,
            "delta_p_to_mw": self.delta_p_to_mw,
            "delta_q_to_mvar": self.delta_q_to_mvar,
            "delta_losses_p_mw": self.delta_losses_p_mw,
            "delta_losses_q_mvar": self.delta_losses_q_mvar,
        }
        for klucz, wartosc in (
            ("delta_p_from_percent", self.delta_p_from_percent),
            ("delta_q_from_percent", self.delta_q_from_percent),
            ("delta_p_to_percent", self.delta_p_to_percent),
            ("delta_q_to_percent", self.delta_q_to_percent),
            ("delta_losses_p_percent", self.delta_losses_p_percent),
            ("delta_losses_q_percent", self.delta_losses_q_percent),
        ):
            if wartosc is not None:
                data[klucz] = wartosc
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PowerFlowBranchDiffRow:
        """Deserialize from dict."""
        return cls(
            branch_id=str(data["branch_id"]),
            p_from_mw_a=float(data["p_from_mw_a"]),
            p_from_mw_b=float(data["p_from_mw_b"]),
            q_from_mvar_a=float(data["q_from_mvar_a"]),
            q_from_mvar_b=float(data["q_from_mvar_b"]),
            p_to_mw_a=float(data["p_to_mw_a"]),
            p_to_mw_b=float(data["p_to_mw_b"]),
            q_to_mvar_a=float(data["q_to_mvar_a"]),
            q_to_mvar_b=float(data["q_to_mvar_b"]),
            losses_p_mw_a=float(data["losses_p_mw_a"]),
            losses_p_mw_b=float(data["losses_p_mw_b"]),
            losses_q_mvar_a=float(data["losses_q_mvar_a"]),
            losses_q_mvar_b=float(data["losses_q_mvar_b"]),
            delta_p_from_mw=float(data["delta_p_from_mw"]),
            delta_q_from_mvar=float(data["delta_q_from_mvar"]),
            delta_p_to_mw=float(data["delta_p_to_mw"]),
            delta_q_to_mvar=float(data["delta_q_to_mvar"]),
            delta_losses_p_mw=float(data["delta_losses_p_mw"]),
            delta_losses_q_mvar=float(data["delta_losses_q_mvar"]),
            delta_p_from_percent=_procent_z_danych(data, "delta_p_from_percent"),
            delta_q_from_percent=_procent_z_danych(data, "delta_q_from_percent"),
            delta_p_to_percent=_procent_z_danych(data, "delta_p_to_percent"),
            delta_q_to_percent=_procent_z_danych(data, "delta_q_to_percent"),
            delta_losses_p_percent=_procent_z_danych(data, "delta_losses_p_percent"),
            delta_losses_q_percent=_procent_z_danych(data, "delta_losses_q_percent"),
        )


# =============================================================================
# RANKING ISSUE
# =============================================================================


@dataclass(frozen=True)
class PowerFlowRankingIssue:
    """
    Single issue in the power flow comparison ranking.

    Issues are sorted deterministically by severity (DESC), then issue_code, then element_ref.

    Attributes:
        issue_code: Type of issue (VOLTAGE_DELTA_HIGH, LOSSES_INCREASED, etc.)
        severity: Severity level (1–5)
        element_ref: Bus or branch reference (bus_id or branch_id)
        description_pl: Polish technical description
        evidence_ref: Index of row supporting this issue
    """

    issue_code: PowerFlowIssueCode
    severity: PowerFlowIssueSeverity
    element_ref: str
    description_pl: str
    evidence_ref: int  # Index into bus_diffs or branch_diffs

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "issue_code": self.issue_code.value,
            "severity": self.severity.value,
            "element_ref": self.element_ref,
            "description_pl": self.description_pl,
            "evidence_ref": self.evidence_ref,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PowerFlowRankingIssue:
        """Deserialize from dict."""
        return cls(
            issue_code=PowerFlowIssueCode(data["issue_code"]),
            severity=PowerFlowIssueSeverity(data["severity"]),
            element_ref=str(data["element_ref"]),
            description_pl=str(data["description_pl"]),
            evidence_ref=int(data.get("evidence_ref", 0)),
        )


# =============================================================================
# COMPARISON SUMMARY
# =============================================================================


@dataclass(frozen=True)
class PowerFlowComparisonSummary:
    """
    Summary statistics for power flow comparison.
    """

    total_buses: int
    total_branches: int
    converged_a: bool
    converged_b: bool
    total_losses_p_mw_a: float
    total_losses_p_mw_b: float
    delta_total_losses_p_mw: float
    max_delta_v_pu: float
    max_delta_angle_deg: float
    total_issues: int
    critical_issues: int
    major_issues: int
    moderate_issues: int
    minor_issues: int
    # L-13 — względna zmiana strat całkowitych [%] (addytywne, exclude_none).
    delta_total_losses_p_percent: float | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict (pole procentowe: exclude_none)."""
        data: dict[str, Any] = {
            "total_buses": self.total_buses,
            "total_branches": self.total_branches,
            "converged_a": self.converged_a,
            "converged_b": self.converged_b,
            "total_losses_p_mw_a": self.total_losses_p_mw_a,
            "total_losses_p_mw_b": self.total_losses_p_mw_b,
            "delta_total_losses_p_mw": self.delta_total_losses_p_mw,
            "max_delta_v_pu": self.max_delta_v_pu,
            "max_delta_angle_deg": self.max_delta_angle_deg,
            "total_issues": self.total_issues,
            "critical_issues": self.critical_issues,
            "major_issues": self.major_issues,
            "moderate_issues": self.moderate_issues,
            "minor_issues": self.minor_issues,
        }
        if self.delta_total_losses_p_percent is not None:
            data["delta_total_losses_p_percent"] = self.delta_total_losses_p_percent
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PowerFlowComparisonSummary:
        """Deserialize from dict."""
        return cls(
            total_buses=int(data["total_buses"]),
            total_branches=int(data["total_branches"]),
            converged_a=bool(data["converged_a"]),
            converged_b=bool(data["converged_b"]),
            total_losses_p_mw_a=float(data["total_losses_p_mw_a"]),
            total_losses_p_mw_b=float(data["total_losses_p_mw_b"]),
            delta_total_losses_p_mw=float(data["delta_total_losses_p_mw"]),
            max_delta_v_pu=float(data["max_delta_v_pu"]),
            max_delta_angle_deg=float(data["max_delta_angle_deg"]),
            total_issues=int(data["total_issues"]),
            critical_issues=int(data["critical_issues"]),
            major_issues=int(data["major_issues"]),
            moderate_issues=int(data["moderate_issues"]),
            minor_issues=int(data["minor_issues"]),
            delta_total_losses_p_percent=_procent_z_danych(data, "delta_total_losses_p_percent"),
        )


# =============================================================================
# COMPARISON RESULT
# =============================================================================


@dataclass(frozen=True)
class PowerFlowComparisonResult:
    """
    Complete power flow comparison result.

    P20c: Main output of the comparison service.

    Attributes:
        comparison_id: Unique comparison identifier
        run_a_id: First power flow run ID
        run_b_id: Second power flow run ID
        project_id: Common project ID (validated)
        bus_diffs: Tuple of bus diff rows (sorted by bus_id)
        branch_diffs: Tuple of branch diff rows (sorted by branch_id)
        ranking: Tuple of ranking issues (sorted by severity DESC)
        summary: Summary statistics
        input_hash: SHA-256 hash of inputs for caching
        created_at: Comparison timestamp
    """

    comparison_id: str
    run_a_id: str
    run_b_id: str
    project_id: str
    bus_diffs: tuple[PowerFlowBusDiffRow, ...]
    branch_diffs: tuple[PowerFlowBranchDiffRow, ...]
    ranking: tuple[PowerFlowRankingIssue, ...]
    summary: PowerFlowComparisonSummary
    input_hash: str
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "comparison_id": self.comparison_id,
            "run_a_id": self.run_a_id,
            "run_b_id": self.run_b_id,
            "project_id": self.project_id,
            "bus_diffs": [r.to_dict() for r in self.bus_diffs],
            "branch_diffs": [r.to_dict() for r in self.branch_diffs],
            "ranking": [i.to_dict() for i in self.ranking],
            "summary": self.summary.to_dict(),
            "input_hash": self.input_hash,
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PowerFlowComparisonResult:
        """Deserialize from dict."""
        return cls(
            comparison_id=str(data["comparison_id"]),
            run_a_id=str(data["run_a_id"]),
            run_b_id=str(data["run_b_id"]),
            project_id=str(data["project_id"]),
            bus_diffs=tuple(PowerFlowBusDiffRow.from_dict(r) for r in data.get("bus_diffs", [])),
            branch_diffs=tuple(
                PowerFlowBranchDiffRow.from_dict(r) for r in data.get("branch_diffs", [])
            ),
            ranking=tuple(PowerFlowRankingIssue.from_dict(i) for i in data.get("ranking", [])),
            summary=PowerFlowComparisonSummary.from_dict(data["summary"]),
            input_hash=str(data["input_hash"]),
            created_at=(
                datetime.fromisoformat(data["created_at"])
                if "created_at" in data
                else datetime.now(UTC)
            ),
        )


# =============================================================================
# COMPARISON TRACE
# =============================================================================


@dataclass(frozen=True)
class PowerFlowComparisonTraceStep:
    """
    Single step in the power flow comparison trace.

    Records intermediate operations for audit purposes.
    """

    step: str
    description_pl: str
    inputs: dict[str, Any]
    outputs: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "step": self.step,
            "description_pl": self.description_pl,
            "inputs": self.inputs,
            "outputs": self.outputs,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PowerFlowComparisonTraceStep:
        """Deserialize from dict."""
        return cls(
            step=str(data["step"]),
            description_pl=str(data.get("description_pl", "")),
            inputs=data.get("inputs", {}),
            outputs=data.get("outputs", {}),
        )


@dataclass(frozen=True)
class PowerFlowComparisonTrace:
    """
    Complete audit trace for power flow comparison.

    P20c: Records all inputs, intermediate calculations, and final outputs.

    Attributes:
        comparison_id: ID of the comparison
        run_a_id: First power flow run ID
        run_b_id: Second power flow run ID
        snapshot_id_a: Snapshot ID from Run A
        snapshot_id_b: Snapshot ID from Run B
        input_hash_a: Input hash from Run A
        input_hash_b: Input hash from Run B
        solver_version: Solver version used
        ranking_thresholds: Explicit ranking thresholds used
        steps: Sequence of comparison steps
        created_at: Trace creation timestamp
    """

    comparison_id: str
    run_a_id: str
    run_b_id: str
    snapshot_id_a: str | None
    snapshot_id_b: str | None
    input_hash_a: str
    input_hash_b: str
    solver_version: str
    ranking_thresholds: dict[str, float]
    steps: tuple[PowerFlowComparisonTraceStep, ...]
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "comparison_id": self.comparison_id,
            "run_a_id": self.run_a_id,
            "run_b_id": self.run_b_id,
            "snapshot_id_a": self.snapshot_id_a,
            "snapshot_id_b": self.snapshot_id_b,
            "input_hash_a": self.input_hash_a,
            "input_hash_b": self.input_hash_b,
            "solver_version": self.solver_version,
            "ranking_thresholds": self.ranking_thresholds,
            "steps": [s.to_dict() for s in self.steps],
            "created_at": self.created_at.isoformat(),
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PowerFlowComparisonTrace:
        """Deserialize from dict."""
        return cls(
            comparison_id=str(data["comparison_id"]),
            run_a_id=str(data["run_a_id"]),
            run_b_id=str(data["run_b_id"]),
            snapshot_id_a=data.get("snapshot_id_a"),
            snapshot_id_b=data.get("snapshot_id_b"),
            input_hash_a=str(data.get("input_hash_a", "")),
            input_hash_b=str(data.get("input_hash_b", "")),
            solver_version=str(data.get("solver_version", "")),
            ranking_thresholds=data.get("ranking_thresholds", {}),
            steps=tuple(PowerFlowComparisonTraceStep.from_dict(s) for s in data.get("steps", [])),
            created_at=(
                datetime.fromisoformat(data["created_at"])
                if "created_at" in data
                else datetime.now(UTC)
            ),
        )


# =============================================================================
# COMPARISON ENTITY (FOR PERSISTENCE)
# =============================================================================


class PowerFlowComparisonStatus(StrEnum):
    """Status of a power flow comparison."""

    CREATED = "CREATED"
    COMPUTING = "COMPUTING"
    FINISHED = "FINISHED"
    FAILED = "FAILED"


@dataclass(frozen=True)
class PowerFlowComparison:
    """
    Power flow comparison entity.

    Tracks the lifecycle of a power flow comparison from creation to completion.
    Supports caching: same (run_a_id, run_b_id) pair returns cached result.

    Attributes:
        id: Unique comparison identifier (UUID)
        project_id: Parent project ID
        run_a_id: First power flow run ID
        run_b_id: Second power flow run ID
        status: Comparison lifecycle status
        input_hash: SHA-256 hash for deduplication/caching
        result_json: Full comparison result (after FINISHED)
        trace_json: Full trace data (after FINISHED)
        error_message: Error details (after FAILED)
        created_at: Creation timestamp
        finished_at: Completion timestamp
    """

    id: UUID
    project_id: UUID
    run_a_id: str
    run_b_id: str
    status: PowerFlowComparisonStatus
    input_hash: str = ""
    result_json: dict[str, Any] | None = None
    trace_json: dict[str, Any] | None = None
    error_message: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    finished_at: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "id": str(self.id),
            "project_id": str(self.project_id),
            "run_a_id": self.run_a_id,
            "run_b_id": self.run_b_id,
            "status": self.status.value,
            "input_hash": self.input_hash,
            "result_json": self.result_json,
            "trace_json": self.trace_json,
            "error_message": self.error_message,
            "created_at": self.created_at.isoformat(),
            "finished_at": self.finished_at.isoformat() if self.finished_at else None,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> PowerFlowComparison:
        """Deserialize from dict."""
        return cls(
            id=UUID(data["id"]),
            project_id=UUID(data["project_id"]),
            run_a_id=str(data["run_a_id"]),
            run_b_id=str(data["run_b_id"]),
            status=PowerFlowComparisonStatus(data["status"]),
            input_hash=data.get("input_hash", ""),
            result_json=data.get("result_json"),
            trace_json=data.get("trace_json"),
            error_message=data.get("error_message"),
            created_at=(
                datetime.fromisoformat(data["created_at"])
                if "created_at" in data
                else datetime.now(UTC)
            ),
            finished_at=(
                datetime.fromisoformat(data["finished_at"]) if data.get("finished_at") else None
            ),
        )


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def compute_pf_comparison_input_hash(run_a_id: str, run_b_id: str) -> str:
    """
    Compute deterministic input hash for comparison caching.

    Args:
        run_a_id: First power flow run ID
        run_b_id: Second power flow run ID

    Returns:
        SHA-256 hash string
    """
    canonical_input = json.dumps(
        {
            "run_a_id": str(run_a_id),
            "run_b_id": str(run_b_id),
        },
        sort_keys=True,
    )
    return hashlib.sha256(canonical_input.encode()).hexdigest()


def new_power_flow_comparison(
    *,
    project_id: UUID,
    run_a_id: str,
    run_b_id: str,
) -> PowerFlowComparison:
    """
    Factory function to create a new PowerFlowComparison.

    Args:
        project_id: ID of the project
        run_a_id: ID of the first power flow run
        run_b_id: ID of the second power flow run

    Returns:
        New PowerFlowComparison in CREATED status
    """
    input_hash = compute_pf_comparison_input_hash(run_a_id, run_b_id)
    return PowerFlowComparison(
        id=uuid4(),
        project_id=project_id,
        run_a_id=run_a_id,
        run_b_id=run_b_id,
        status=PowerFlowComparisonStatus.CREATED,
        input_hash=input_hash,
    )


def get_ranking_thresholds() -> dict[str, float]:
    """
    Get explicit ranking thresholds for trace.

    Returns:
        Dictionary of threshold name to value
    """
    return {
        "voltage_delta_threshold_pu": VOLTAGE_DELTA_THRESHOLD_PU,
        "angle_delta_threshold_deg": ANGLE_DELTA_THRESHOLD_DEG,
        "losses_increase_threshold_mw": LOSSES_INCREASE_THRESHOLD_MW,
        "losses_decrease_threshold_mw": LOSSES_DECREASE_THRESHOLD_MW,
        "slack_power_change_threshold_mw": SLACK_POWER_CHANGE_THRESHOLD_MW,
        "top_n_for_ranking": TOP_N_FOR_RANKING,
    }


# =============================================================================
# ERRORS
# =============================================================================


class PowerFlowComparisonError(Exception):
    """Base exception for power flow comparison errors."""

    pass


class PowerFlowRunNotFoundError(PowerFlowComparisonError):
    """Raised when a power flow run is not found."""

    def __init__(self, run_id: str):
        self.run_id = run_id
        super().__init__(f"Power flow run nie znaleziony: {run_id}")


class PowerFlowRunNotFinishedError(PowerFlowComparisonError):
    """Raised when a power flow run is not finished."""

    def __init__(self, run_id: str, status: str):
        self.run_id = run_id
        self.status = status
        super().__init__(f"Power flow run nie zakonczony (status: {status}): {run_id}")


class PowerFlowProjectMismatchError(PowerFlowComparisonError):
    """Raised when runs belong to different projects."""

    def __init__(self, run_a_project: str, run_b_project: str):
        self.run_a_project = run_a_project
        self.run_b_project = run_b_project
        super().__init__(f"Runs naleza do roznych projektow: {run_a_project} vs {run_b_project}")


class PowerFlowComparisonNotFoundError(PowerFlowComparisonError):
    """Raised when a comparison is not found."""

    def __init__(self, comparison_id: str):
        self.comparison_id = comparison_id
        super().__init__(f"Power flow comparison nie znalezione: {comparison_id}")


class PowerFlowResultNotFoundError(PowerFlowComparisonError):
    """Raised when power flow results are not found for a run."""

    def __init__(self, run_id: str):
        self.run_id = run_id
        super().__init__(f"Wyniki power flow nie znalezione dla run: {run_id}")
