from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any


class NormativeStatus(StrEnum):
    PASS = "PASS"
    FAIL = "FAIL"
    WARNING = "WARNING"
    NOT_COMPUTED = "NOT_COMPUTED"
    NOT_EVALUATED = "NOT_EVALUATED"


class NormativeSeverity(StrEnum):
    INFO = "INFO"
    WARNING = "WARNING"
    FAIL = "FAIL"


@dataclass(frozen=True)
class NormativeConfig:
    loading_warn_pct: float = 80.0
    loading_fail_pct: float = 100.0
    voltage_warn_pct: float = 5.0
    voltage_fail_pct: float = 10.0
    touch_voltage_warn_v: float | None = None
    touch_voltage_fail_v: float | None = None
    selectivity_required: bool = True
    standard_ref: str = "IEC/PN-EN — user configured"
    earth_current_warn_a: float | None = None
    earth_current_fail_a: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "earth_current_fail_a": self.earth_current_fail_a,
            "earth_current_warn_a": self.earth_current_warn_a,
            "loading_fail_pct": self.loading_fail_pct,
            "loading_warn_pct": self.loading_warn_pct,
            "selectivity_required": self.selectivity_required,
            "standard_ref": self.standard_ref,
            "touch_voltage_fail_v": self.touch_voltage_fail_v,
            "touch_voltage_warn_v": self.touch_voltage_warn_v,
            "voltage_fail_pct": self.voltage_fail_pct,
            "voltage_warn_pct": self.voltage_warn_pct,
        }


@dataclass(frozen=True)
class NormativeContext:
    project_name: str | None
    case_name: str | None
    run_timestamp: datetime | None
    snapshot_id: str | None
    trace_id: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_name": self.project_name,
            "case_name": self.case_name,
            "run_timestamp": self.run_timestamp.isoformat() if self.run_timestamp else None,
            "snapshot_id": self.snapshot_id,
            "trace_id": self.trace_id,
        }


@dataclass(frozen=True)
class NormativeItem:
    rule_id: str
    title_pl: str
    severity: NormativeSeverity
    status: NormativeStatus
    target_id: str
    observed_value: float | str | None
    unit: str | None
    limit_value: float | None
    limit_unit: str | None
    margin: float | None
    why_pl: str
    requires: tuple[str, ...]


@dataclass(frozen=True)
class NormativeReport:
    report_id: str
    context: NormativeContext
    items: tuple[NormativeItem, ...]

    def to_dict(self) -> dict[str, Any]:
        from analysis.normative.serializer import report_to_dict

        return report_to_dict(self)


def compute_report_id(
    context: NormativeContext,
    proof_ids: list[str],
    config: NormativeConfig,
) -> str:
    payload = {
        "config": config.to_dict(),
        "context": context.to_dict(),
        "proof_ids": sorted(proof_ids),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
