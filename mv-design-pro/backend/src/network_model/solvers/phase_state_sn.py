"""Minimalny, deterministyczny solver stanu fazowego SN dla scenariusza radialnego."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

PHASE_STATE_SN_SOLVER_VERSION = "1.0.0"
PHASE_ORDER = ("A", "B", "C")


@dataclass(frozen=True)
class PhaseValues:
    """Wartosci liczbowe dla faz A/B/C w stabilnej kolejnosci."""

    a: float
    b: float
    c: float

    def as_tuple(self) -> tuple[float, float, float]:
        return (self.a, self.b, self.c)

    def to_dict(self) -> dict[str, float]:
        return {
            "A": self.a,
            "B": self.b,
            "C": self.c,
        }


@dataclass(frozen=True)
class OpenPhaseFlags:
    """Informacja, ktora faza jest otwarta w scenariuszu radialnym."""

    a: bool = False
    b: bool = False
    c: bool = False

    def as_tuple(self) -> tuple[bool, bool, bool]:
        return (self.a, self.b, self.c)

    def to_dict(self) -> dict[str, bool]:
        return {
            "A": self.a,
            "B": self.b,
            "C": self.c,
        }


@dataclass(frozen=True)
class PhaseStateSNInput:
    """
    Dane wejciowe dla minimalnego solvera stanu fazowego SN.

    Wszystkie dane sa jawne i podane per-faza:
    - source_voltage_kv: napiecie zrodla faza-ziemia [kV]
    - load_current_a: prad obciazenia [A]
    - branch_resistance_ohm: rezystancja radialnej galezi [ohm]
    - fault_current_a: dodatkowy prad zwarciowy [A]
    - open_phase: flaga otwartej fazy
    """

    source_voltage_kv: PhaseValues
    load_current_a: PhaseValues
    branch_resistance_ohm: PhaseValues
    fault_current_a: PhaseValues = field(default_factory=lambda: PhaseValues(0.0, 0.0, 0.0))
    open_phase: OpenPhaseFlags = field(default_factory=OpenPhaseFlags)
    unbalance_alert_percent: float = 10.0
    solver_version: str = PHASE_STATE_SN_SOLVER_VERSION

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_voltage_kv": self.source_voltage_kv.to_dict(),
            "load_current_a": self.load_current_a.to_dict(),
            "branch_resistance_ohm": self.branch_resistance_ohm.to_dict(),
            "fault_current_a": self.fault_current_a.to_dict(),
            "open_phase": self.open_phase.to_dict(),
            "unbalance_alert_percent": self.unbalance_alert_percent,
            "solver_version": self.solver_version,
        }


@dataclass(frozen=True)
class PhaseUnbalanceIndices:
    """Indeksy niezrownowazenia dla napiec, pradow i strat."""

    voltage_percent: float
    current_percent: float
    losses_percent: float

    def to_dict(self) -> dict[str, float]:
        return {
            "voltage_percent": self.voltage_percent,
            "current_percent": self.current_percent,
            "losses_percent": self.losses_percent,
        }


@dataclass(frozen=True)
class PhaseStateSNFlags:
    """Flagi stanu i alarmow dla wyniku solvera."""

    has_fault: bool
    has_open_phase: bool
    faulted_phases: tuple[str, ...]
    open_phases: tuple[str, ...]
    voltage_unbalance_alert: bool
    current_unbalance_alert: bool
    losses_unbalance_alert: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "has_fault": self.has_fault,
            "has_open_phase": self.has_open_phase,
            "faulted_phases": list(self.faulted_phases),
            "open_phases": list(self.open_phases),
            "voltage_unbalance_alert": self.voltage_unbalance_alert,
            "current_unbalance_alert": self.current_unbalance_alert,
            "losses_unbalance_alert": self.losses_unbalance_alert,
        }


@dataclass(frozen=True)
class PhaseStateSNResult:
    """Wynik minimalnego solvera stanu fazowego SN."""

    phase_voltage_kv: PhaseValues
    phase_current_a: PhaseValues
    phase_losses_kw: PhaseValues
    unbalance_indices: PhaseUnbalanceIndices
    flags: PhaseStateSNFlags
    solver_version: str = PHASE_STATE_SN_SOLVER_VERSION

    @property
    def ua_kv(self) -> float:
        return self.phase_voltage_kv.a

    @property
    def ub_kv(self) -> float:
        return self.phase_voltage_kv.b

    @property
    def uc_kv(self) -> float:
        return self.phase_voltage_kv.c

    @property
    def ia_a(self) -> float:
        return self.phase_current_a.a

    @property
    def ib_a(self) -> float:
        return self.phase_current_a.b

    @property
    def ic_a(self) -> float:
        return self.phase_current_a.c

    def to_dict(self) -> dict[str, Any]:
        return {
            "ua_kv": self.ua_kv,
            "ub_kv": self.ub_kv,
            "uc_kv": self.uc_kv,
            "ia_a": self.ia_a,
            "ib_a": self.ib_a,
            "ic_a": self.ic_a,
            "phase_voltage_kv": self.phase_voltage_kv.to_dict(),
            "phase_current_a": self.phase_current_a.to_dict(),
            "phase_losses_kw": self.phase_losses_kw.to_dict(),
            "unbalance_indices": self.unbalance_indices.to_dict(),
            "flags": self.flags.to_dict(),
            "solver_version": self.solver_version,
        }


class PhaseStateSNSolver:
    """Minimalny solver radialny oparty na jawnym bilansie per-faza."""

    @classmethod
    def solve(cls, data: PhaseStateSNInput) -> PhaseStateSNResult:
        _validate_input(data)

        phase_currents: list[float] = []
        phase_voltages: list[float] = []
        phase_losses: list[float] = []

        for source_kv, load_a, resistance_ohm, fault_a, is_open in zip(
            data.source_voltage_kv.as_tuple(),
            data.load_current_a.as_tuple(),
            data.branch_resistance_ohm.as_tuple(),
            data.fault_current_a.as_tuple(),
            data.open_phase.as_tuple(),
            strict=True,
        ):
            current_a = 0.0 if is_open else load_a + fault_a
            voltage_drop_kv = (current_a * resistance_ohm) / 1000.0
            voltage_kv = 0.0 if is_open else max(source_kv - voltage_drop_kv, 0.0)
            losses_kw = 0.0 if is_open else (current_a * current_a * resistance_ohm) / 1000.0

            phase_currents.append(current_a)
            phase_voltages.append(voltage_kv)
            phase_losses.append(losses_kw)

        unbalance = PhaseUnbalanceIndices(
            voltage_percent=_compute_unbalance_percent(tuple(phase_voltages)),
            current_percent=_compute_unbalance_percent(tuple(phase_currents)),
            losses_percent=_compute_unbalance_percent(tuple(phase_losses)),
        )

        flags = PhaseStateSNFlags(
            has_fault=any(value > 0.0 for value in data.fault_current_a.as_tuple()),
            has_open_phase=any(data.open_phase.as_tuple()),
            faulted_phases=tuple(
                phase
                for phase, value in zip(PHASE_ORDER, data.fault_current_a.as_tuple(), strict=True)
                if value > 0.0
            ),
            open_phases=tuple(
                phase
                for phase, is_open in zip(PHASE_ORDER, data.open_phase.as_tuple(), strict=True)
                if is_open
            ),
            voltage_unbalance_alert=unbalance.voltage_percent > data.unbalance_alert_percent,
            current_unbalance_alert=unbalance.current_percent > data.unbalance_alert_percent,
            losses_unbalance_alert=unbalance.losses_percent > data.unbalance_alert_percent,
        )

        return PhaseStateSNResult(
            phase_voltage_kv=PhaseValues(*phase_voltages),
            phase_current_a=PhaseValues(*phase_currents),
            phase_losses_kw=PhaseValues(*phase_losses),
            unbalance_indices=unbalance,
            flags=flags,
            solver_version=data.solver_version,
        )


def _compute_unbalance_percent(values: tuple[float, float, float]) -> float:
    average = sum(values) / len(values)
    if average == 0.0:
        return 0.0
    max_deviation = max(abs(value - average) for value in values)
    return (max_deviation / average) * 100.0


def _validate_input(data: PhaseStateSNInput) -> None:
    _validate_phase_values("source_voltage_kv", data.source_voltage_kv, minimum=0.0)
    _validate_phase_values("load_current_a", data.load_current_a, minimum=0.0)
    _validate_phase_values("branch_resistance_ohm", data.branch_resistance_ohm, minimum=0.0)
    _validate_phase_values("fault_current_a", data.fault_current_a, minimum=0.0)

    if not math.isfinite(data.unbalance_alert_percent):
        raise ValueError("unbalance_alert_percent must be finite")
    if data.unbalance_alert_percent < 0.0:
        raise ValueError("unbalance_alert_percent must be >= 0")


def _validate_phase_values(name: str, values: PhaseValues, minimum: float) -> None:
    for phase, value in zip(PHASE_ORDER, values.as_tuple(), strict=True):
        if not math.isfinite(value):
            raise ValueError(f"{name}.{phase} must be finite")
        if value < minimum:
            raise ValueError(f"{name}.{phase} must be >= {minimum}")
