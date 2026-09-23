from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any

from analysis.normative.kryteria_napiecia import (
    KRYTERIUM_OSTRZEZENIE_PROCENT,
    KRYTERIUM_PRZEKROCZENIE_PROCENT,
)
from analysis.normative.rule_registry import RULES
from analysis.odcisk_kontekstu import odcisk_kontekstu
from analysis.podstawa_normatywna import PodstawaNormatywna


class NormativeStatus(StrEnum):
    PASS = "PASS"
    FAIL = "FAIL"
    WARNING = "WARNING"
    NOT_COMPUTED = "NOT_COMPUTED"
    NOT_EVALUATED = "NOT_EVALUATED"


#: Podstawa per regula — wyprowadzona z rejestru regul (jedno zrodlo).
_PODSTAWA_REGULY: dict[str, PodstawaNormatywna] = {
    regula.rule_id: regula.podstawa for regula in RULES
}


class NormativeSeverity(StrEnum):
    INFO = "INFO"
    WARNING = "WARNING"
    FAIL = "FAIL"


@dataclass(frozen=True)
class NormativeConfig:
    loading_warn_pct: float = 80.0
    loading_fail_pct: float = 100.0
    #: Jedno zrodlo prawdy: `analysis.normative.kryteria_napiecia` (karta W3-J).
    voltage_warn_pct: float = KRYTERIUM_OSTRZEZENIE_PROCENT
    voltage_fail_pct: float = KRYTERIUM_PRZEKROCZENIE_PROCENT
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
    #: Odwolanie do dowodu (karta AB-1a D2 — `{run_id, element_id, trace_ref}`;
    #: `trace_ref` = identyfikator ProofDocument, z ktorego regula czytala).
    #: ``None`` = pozycja bez dowodu (brak pakietu dowodowego — NOT_COMPUTED).
    dowod: dict[str, str | None] | None = None
    # --- Towarzysze werdyktu (karta AB-1a-bis) — WYPROWADZANE, jedno zrodlo ----
    #: `wartosc` = `observed_value`; `odniesienie` = `limit_value` (granica, wobec
    #: ktorej regula wydala status); `margines` = zapas w konwencji wyniku
    #: wyjasnialnego (dodatni = w granicy) = `-margin` (`margin` dostawcy to
    #: nadwyzka `wartosc - limit`); `podstawa` z rejestru regul (`None` dla
    #: identyfikatora spoza rejestru).
    wartosc: float | str | None = field(init=False)
    odniesienie: float | None = field(init=False)
    margines: float | None = field(init=False)
    podstawa: PodstawaNormatywna | None = field(init=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "wartosc", self.observed_value)
        object.__setattr__(self, "odniesienie", self.limit_value)
        object.__setattr__(self, "margines", -self.margin if self.margin is not None else None)
        object.__setattr__(self, "podstawa", _PODSTAWA_REGULY.get(self.rule_id))


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
        "context": odcisk_kontekstu(context),
        "proof_ids": sorted(proof_ids),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
