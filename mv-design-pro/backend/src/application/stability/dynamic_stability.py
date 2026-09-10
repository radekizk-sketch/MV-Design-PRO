from __future__ import annotations

from dataclasses import dataclass, field


def _round_metric(value: float) -> float:
    return round(float(value), 6)


def _normalize_margin(observed: float, limit: float) -> float:
    if limit <= 0:
        return 0.0
    return _round_metric(max(0.0, min(1.0, 1.0 - (observed / limit))))


def _normalize_floor(observed: float, floor: float) -> float:
    if floor <= 0:
        return 0.0
    return _round_metric(max(0.0, min(1.0, observed / floor)))


#: Etykiety PL i jednostki kryteriów oceny progowej — KLASA, nie zestaw ad-hoc:
#: jedna definicja dzielona przez `to_dict` (klucze kontraktu, bez zmian) i
#: `kryteria_oceny_progowej` (prezentacja jawna w wyniku biegu, karta W2 pkt 1).
_KRYTERIA_ETYKIETY_PL: tuple[tuple[str, str, str], ...] = (
    ("max_clearing_time_ms", "Maksymalny czas wyłączenia zwarcia", "ms"),
    ("max_angle_swing_deg", "Maksymalne wychylenie kąta mocy", "°"),
    ("min_voltage_recovery_pu", "Minimalne napięcie po zwarciu", "p.u."),
    ("min_frequency_recovery_pu", "Minimalna częstotliwość po zwarciu", "p.u."),
)

#: Repozytorium nie niesie cytatu normy dla tych czterech wartości (zmierzone:
#: brak odniesienia w `docs/` i w tym module) — kryteria są PRZYJĘTE w opcjach
#: biegu (nazwa pola w `run.options` == klucz progu poniżej), edytowalne przez
#: wołającego, NIE zaszyte na stałe w solverze — patrz `enm/canonical_analysis.py
#: ::_progi_oceny_stabilnosci_z_opcji`, jedyne miejsce, które je materializuje
#: z opcji biegu (karta W2 pkt 1).
KRYTERIA_PROWENIENCJA_PL = (
    "Kryterium przyjęte w opcjach biegu tej analizy (pole o tej samej nazwie w "
    "kontrakcie opcji) — repozytorium nie niesie cytatu normy dla tej wartości; "
    "próg jest edytowalny przez opcje biegu, nie zaszyty na stałe w solverze."
)


@dataclass(frozen=True)
class DynamicStabilityThresholds:
    max_clearing_time_ms: float = 150.0
    max_angle_swing_deg: float = 120.0
    min_voltage_recovery_pu: float = 0.95
    min_frequency_recovery_pu: float = 0.98

    def to_dict(self) -> dict[str, float]:
        return {
            "max_clearing_time_ms": _round_metric(self.max_clearing_time_ms),
            "max_angle_swing_deg": _round_metric(self.max_angle_swing_deg),
            "min_voltage_recovery_pu": _round_metric(self.min_voltage_recovery_pu),
            "min_frequency_recovery_pu": _round_metric(self.min_frequency_recovery_pu),
        }

    def kryteria_oceny_progowej(self) -> list[dict[str, object]]:
        """Progi NAZWANE jawnie jako „kryteria oceny progowej" w wyniku biegu.

        Karta W2 pkt 1: progi (150 ms / 120° / 0,95 / 0,98) mają być jawnie
        nazwane w wyniku z odniesieniem, skąd pochodzą; repo nie ma cytatu normy
        dla nich, więc nazwane są jako kryteria przyjęte w opcjach biegu.
        """
        return [
            {
                "key": klucz,
                "label_pl": etykieta,
                "value": _round_metric(getattr(self, klucz)),
                "unit": jednostka,
                "source_pl": KRYTERIA_PROWENIENCJA_PL,
            }
            for klucz, etykieta, jednostka in _KRYTERIA_ETYKIETY_PL
        ]


@dataclass(frozen=True)
class FaultClearSourceState:
    source_id: str
    pre_fault_angle_deg: float
    during_fault_angle_deg: float
    post_fault_angle_deg: float
    post_fault_voltage_pu: float
    post_fault_frequency_pu: float

    def __post_init__(self) -> None:
        if not self.source_id or not self.source_id.strip():
            raise ValueError("source_id is required")

    def to_dict(self) -> dict[str, float | str]:
        return {
            "source_id": self.source_id,
            "pre_fault_angle_deg": _round_metric(self.pre_fault_angle_deg),
            "during_fault_angle_deg": _round_metric(self.during_fault_angle_deg),
            "post_fault_angle_deg": _round_metric(self.post_fault_angle_deg),
            "post_fault_voltage_pu": _round_metric(self.post_fault_voltage_pu),
            "post_fault_frequency_pu": _round_metric(self.post_fault_frequency_pu),
        }


@dataclass(frozen=True)
class FaultClearScenario:
    scenario_id: str
    faulted_element_id: str
    clearing_time_ms: float
    source_state: FaultClearSourceState
    cleared_by_element_ids: tuple[str, ...] = field(default_factory=tuple)
    thresholds: DynamicStabilityThresholds = field(default_factory=DynamicStabilityThresholds)

    def __post_init__(self) -> None:
        if not self.scenario_id or not self.scenario_id.strip():
            raise ValueError("scenario_id is required")
        if not self.faulted_element_id or not self.faulted_element_id.strip():
            raise ValueError("faulted_element_id is required")
        if self.clearing_time_ms <= 0:
            raise ValueError("clearing_time_ms must be > 0")

        canonical_ids = tuple(
            sorted({element_id for element_id in self.cleared_by_element_ids if element_id})
        )
        if not canonical_ids:
            raise ValueError("cleared_by_element_ids must contain at least one element")
        object.__setattr__(self, "cleared_by_element_ids", canonical_ids)

    def to_dict(self) -> dict[str, object]:
        return {
            "scenario_id": self.scenario_id,
            "scenario_type": "FAULT_CLEAR",
            "faulted_element_id": self.faulted_element_id,
            "clearing_time_ms": _round_metric(self.clearing_time_ms),
            "cleared_by_element_ids": list(self.cleared_by_element_ids),
            "source_state": self.source_state.to_dict(),
            "thresholds": self.thresholds.to_dict(),
        }


@dataclass(frozen=True)
class DynamicStabilityResult:
    scenario_id: str
    scenario_type: str
    source_id: str
    faulted_element_id: str
    cleared_by_element_ids: tuple[str, ...]
    stable: bool
    status: str
    criteria_version: str
    stability_index: float
    clearing_time_ms: float
    max_clearing_time_ms: float
    clearing_margin_ms: float
    angle_swing_deg: float
    post_fault_voltage_pu: float
    post_fault_frequency_pu: float
    limiting_factor: str
    violated_checks: tuple[str, ...]
    checks: dict[str, bool]

    def to_dict(self) -> dict[str, object]:
        return {
            "scenario_id": self.scenario_id,
            "scenario_type": self.scenario_type,
            "source_id": self.source_id,
            "faulted_element_id": self.faulted_element_id,
            "cleared_by_element_ids": list(self.cleared_by_element_ids),
            "stable": self.stable,
            "status": self.status,
            "criteria_version": self.criteria_version,
            "stability_index": _round_metric(self.stability_index),
            "clearing_time_ms": _round_metric(self.clearing_time_ms),
            "max_clearing_time_ms": _round_metric(self.max_clearing_time_ms),
            "clearing_margin_ms": _round_metric(self.clearing_margin_ms),
            "angle_swing_deg": _round_metric(self.angle_swing_deg),
            "post_fault_voltage_pu": _round_metric(self.post_fault_voltage_pu),
            "post_fault_frequency_pu": _round_metric(self.post_fault_frequency_pu),
            "limiting_factor": self.limiting_factor,
            "violated_checks": list(self.violated_checks),
            "checks": dict(self.checks),
        }


def evaluate_fault_clear_dynamic_stability(
    scenario: FaultClearScenario,
) -> DynamicStabilityResult:
    source_state = scenario.source_state
    thresholds = scenario.thresholds

    angle_swing_deg = max(
        abs(source_state.during_fault_angle_deg - source_state.pre_fault_angle_deg),
        abs(source_state.post_fault_angle_deg - source_state.pre_fault_angle_deg),
    )
    clearing_margin_ms = _round_metric(thresholds.max_clearing_time_ms - scenario.clearing_time_ms)

    checks = {
        "clearing_time": scenario.clearing_time_ms <= thresholds.max_clearing_time_ms,
        "angle_swing": angle_swing_deg <= thresholds.max_angle_swing_deg,
        "voltage_recovery": (
            source_state.post_fault_voltage_pu >= thresholds.min_voltage_recovery_pu
        ),
        "frequency_recovery": (
            source_state.post_fault_frequency_pu >= thresholds.min_frequency_recovery_pu
        ),
    }
    violated_checks = tuple(name for name, ok in checks.items() if not ok)

    components = {
        "clearing_time": _normalize_margin(
            scenario.clearing_time_ms, thresholds.max_clearing_time_ms
        ),
        "angle_swing": _normalize_margin(angle_swing_deg, thresholds.max_angle_swing_deg),
        "voltage_recovery": _normalize_floor(
            source_state.post_fault_voltage_pu,
            thresholds.min_voltage_recovery_pu,
        ),
        "frequency_recovery": _normalize_floor(
            source_state.post_fault_frequency_pu,
            thresholds.min_frequency_recovery_pu,
        ),
    }
    limiting_factor = min(
        components.items(),
        key=lambda item: (item[1], item[0]),
    )[0]
    stability_index = _round_metric(sum(components.values()) / len(components))
    stable = not violated_checks

    return DynamicStabilityResult(
        scenario_id=scenario.scenario_id,
        scenario_type="FAULT_CLEAR",
        source_id=source_state.source_id,
        faulted_element_id=scenario.faulted_element_id,
        cleared_by_element_ids=scenario.cleared_by_element_ids,
        stable=stable,
        status="STABLE" if stable else "UNSTABLE",
        criteria_version="dynamic_stability_fault_clear_v1",
        stability_index=stability_index,
        clearing_time_ms=_round_metric(scenario.clearing_time_ms),
        max_clearing_time_ms=_round_metric(thresholds.max_clearing_time_ms),
        clearing_margin_ms=clearing_margin_ms,
        angle_swing_deg=_round_metric(angle_swing_deg),
        post_fault_voltage_pu=_round_metric(source_state.post_fault_voltage_pu),
        post_fault_frequency_pu=_round_metric(source_state.post_fault_frequency_pu),
        limiting_factor=limiting_factor,
        violated_checks=violated_checks,
        checks=checks,
    )
