"""
Energy validation result types.

Validates physical constraints of the network after power flow:
- Branch loading (line/cable current vs rated current)
- Transformer loading (apparent power vs rated power)
- Voltage deviation (per-bus delta from nominal)
- Total losses budget (P_loss / P_total ratio)
- Reactive power balance (Q_slack direction)

This is ANALYSIS, not SOLVER. No physics calculations.
Uses existing PowerFlowResult data only.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any


class EnergyCheckType(StrEnum):
    BRANCH_LOADING = "BRANCH_LOADING"
    TRANSFORMER_LOADING = "TRANSFORMER_LOADING"
    VOLTAGE_DEVIATION = "VOLTAGE_DEVIATION"
    LOSS_BUDGET = "LOSS_BUDGET"
    REACTIVE_BALANCE = "REACTIVE_BALANCE"


class EnergyValidationStatus(StrEnum):
    PASS = "PASS"
    WARNING = "WARNING"
    FAIL = "FAIL"
    NOT_COMPUTED = "NOT_COMPUTED"


@dataclass(frozen=True)
class EnergyValidationItem:
    check_type: EnergyCheckType
    target_id: str
    target_name: str | None
    observed_value: float | None
    unit: str
    limit_warn: float | None
    limit_fail: float | None
    margin_pct: float | None
    status: EnergyValidationStatus
    why_pl: str
    # Slad WHITE BOX per pozycja (R2-A / K3-G1; struktura R3-D): krotka krokow
    # {"tekst": str, "latex": str | None}. `latex` obecny dla wzoru i
    # podstawienia (kanon Proof Engine: matematyka w LaTeX, UI renderuje KaTeX);
    # `tekst` zawsze (raporty/eksport ASCII). Addytywnie, domyslnie pusty
    # (pozycje NOT_COMPUTED bez wywodu - powod niesie why_pl).
    white_box: tuple[dict, ...] = ()


@dataclass(frozen=True)
class EnergyValidationSummary:
    pass_count: int
    warning_count: int
    fail_count: int
    not_computed_count: int
    worst_item_target_id: str | None
    worst_item_margin_pct: float | None


@dataclass(frozen=True)
class EnergyValidationContext:
    project_name: str | None
    case_name: str | None
    run_timestamp: datetime | None
    snapshot_id: str | None
    trace_id: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_name": self.project_name,
            "case_name": self.case_name,
            "run_timestamp": (self.run_timestamp.isoformat() if self.run_timestamp else None),
            "snapshot_id": self.snapshot_id,
            "trace_id": self.trace_id,
        }


@dataclass(frozen=True)
class EnergyValidationConfig:
    loading_warn_pct: float = 80.0
    loading_fail_pct: float = 100.0
    voltage_warn_pct: float = 5.0
    voltage_fail_pct: float = 10.0
    loss_warn_pct: float = 5.0
    loss_fail_pct: float = 10.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "loading_warn_pct": self.loading_warn_pct,
            "loading_fail_pct": self.loading_fail_pct,
            "voltage_warn_pct": self.voltage_warn_pct,
            "voltage_fail_pct": self.voltage_fail_pct,
            "loss_warn_pct": self.loss_warn_pct,
            "loss_fail_pct": self.loss_fail_pct,
        }


@dataclass(frozen=True)
class EnergyValidationView:
    context: EnergyValidationContext | None
    config: EnergyValidationConfig
    items: tuple[EnergyValidationItem, ...]
    summary: EnergyValidationSummary

    def to_dict(self) -> dict[str, Any]:
        from analysis.energy_validation.serializer import view_to_dict

        return view_to_dict(self)
