"""
Modul detekcji naruszen napieciowych po Power Flow.

Ten modul implementuje walidacje napiec Umin/Umax po obliczeniach Power Flow.
Zgodnie z architektura CLAUDE.md:
- To jest ANALIZA, nie SOLVER
- Nie wykonuje obliczen fizycznych
- Uzywa gotowych wynikow Power Flow
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from network_model.solvers.power_flow_result import PowerFlowResultV1


class ViolationType(Enum):
    """Typ naruszenia napieciowego."""

    UNDERVOLTAGE = "undervoltage"
    OVERVOLTAGE = "overvoltage"
    WITHIN_LIMITS = "ok"


@dataclass(frozen=True)
class VoltageViolation:
    """Pojedyncze naruszenie napiecia.

    Attributes:
        bus_id: ID wezla.
        bus_name: Nazwa wezla (moze byc rowna bus_id jesli nieznana).
        voltage_pu: Napiecie w p.u.
        voltage_kv: Napiecie w kV (None jesli brak danych o U_nom).
        limit_min_pu: Dolny limit napiecia [p.u.].
        limit_max_pu: Gorny limit napiecia [p.u.].
        violation_type: Typ naruszenia.
        deviation_percent: Odchylenie poza limit [%].
    """

    bus_id: str
    bus_name: str
    voltage_pu: float
    voltage_kv: float | None
    limit_min_pu: float
    limit_max_pu: float
    violation_type: ViolationType
    deviation_percent: float

    def to_dict(self) -> dict[str, Any]:
        """Serializacja do JSON."""
        return {
            "bus_id": self.bus_id,
            "bus_name": self.bus_name,
            "voltage_pu": self.voltage_pu,
            "voltage_kv": self.voltage_kv,
            "limit_min_pu": self.limit_min_pu,
            "limit_max_pu": self.limit_max_pu,
            "violation_type": self.violation_type.value,
            "deviation_percent": self.deviation_percent,
        }


@dataclass(frozen=True)
class VoltageViolationsResult:
    """Wynik analizy naruszen napieciowych.

    Attributes:
        total_buses: Calkowita liczba wezlow.
        violations_count: Liczba naruszen.
        undervoltage_count: Liczba niedopiecia.
        overvoltage_count: Liczba przepiecia.
        violations: Lista naruszen.
        worst_undervoltage: Najgorsze niedopiecie (najnizsze U).
        worst_overvoltage: Najgorsze przepiecie (najwyzsze U).
        all_within_limits: Czy wszystkie napiecia sa w normie.
    """

    total_buses: int
    violations_count: int
    undervoltage_count: int
    overvoltage_count: int
    violations: tuple[VoltageViolation, ...]
    worst_undervoltage: VoltageViolation | None
    worst_overvoltage: VoltageViolation | None
    all_within_limits: bool

    def to_dict(self) -> dict[str, Any]:
        """Serializacja do JSON."""
        return {
            "total_buses": self.total_buses,
            "violations_count": self.violations_count,
            "undervoltage_count": self.undervoltage_count,
            "overvoltage_count": self.overvoltage_count,
            "violations": [v.to_dict() for v in self.violations],
            "worst_undervoltage": (
                self.worst_undervoltage.to_dict() if self.worst_undervoltage else None
            ),
            "worst_overvoltage": (
                self.worst_overvoltage.to_dict() if self.worst_overvoltage else None
            ),
            "all_within_limits": self.all_within_limits,
        }


@dataclass(frozen=True)
class BusInfo:
    """Informacja o wezle dla analizy naruszen.

    Attributes:
        bus_id: ID wezla.
        bus_name: Nazwa wezla.
        u_nom_kv: Napiecie nominalne [kV] (opcjonalne).
        u_min_pu: Dolny limit napiecia [p.u.] (opcjonalny).
        u_max_pu: Gorny limit napiecia [p.u.] (opcjonalny).
    """

    bus_id: str
    bus_name: str
    u_nom_kv: float | None = None
    u_min_pu: float | None = None
    u_max_pu: float | None = None


class VoltageViolationsDetector:
    """
    Detektor naruszen napieciowych.

    UWAGA z AGENTS.md:
    - To jest ANALIZA, nie SOLVER
    - Nie wykonuje obliczen fizycznych
    - Uzywa gotowych wynikow Power Flow
    """

    def __init__(
        self,
        default_umin_pu: float = 0.95,
        default_umax_pu: float = 1.05,
    ) -> None:
        """
        Inicjalizacja detektora.

        Args:
            default_umin_pu: Domyslny dolny limit napiecia [p.u.].
            default_umax_pu: Domyslny gorny limit napiecia [p.u.].
        """
        if default_umin_pu >= default_umax_pu:
            raise ValueError(
                f"default_umin_pu ({default_umin_pu}) musi byc mniejsze "
                f"od default_umax_pu ({default_umax_pu})"
            )
        self.default_umin_pu = default_umin_pu
        self.default_umax_pu = default_umax_pu

    def detect(
        self,
        pf_result: PowerFlowResultV1,
        bus_info: dict[str, BusInfo] | None = None,
        custom_limits: dict[str, tuple[float, float]] | None = None,
    ) -> VoltageViolationsResult:
        """
        Sprawdza naruszenia napiec.

        Dla kazdego wezla:
        1. Pobierz napiecie z pf_result
        2. Pobierz limity (custom -> bus_info -> default)
        3. Sprawdz czy w zakresie
        4. Jesli nie - dodaj do violations

        Args:
            pf_result: Wynik Power Flow (PowerFlowResultV1).
            bus_info: Opcjonalny slownik BusInfo per bus_id (nazwy, U_nom, limity).
            custom_limits: Opcjonalny slownik bus_id -> (umin, umax).

        Returns:
            VoltageViolationsResult z lista naruszen.
        """
        violations: list[VoltageViolation] = []

        for bus in pf_result.bus_results:
            umin, umax = self._get_limits(bus.bus_id, bus_info, custom_limits)
            bus_name = self._get_bus_name(bus.bus_id, bus_info)
            voltage_kv = self._get_voltage_kv(bus.bus_id, bus.v_pu, bus_info)

            if bus.v_pu < umin:
                deviation = ((umin - bus.v_pu) / umin) * 100
                violation = VoltageViolation(
                    bus_id=bus.bus_id,
                    bus_name=bus_name,
                    voltage_pu=bus.v_pu,
                    voltage_kv=voltage_kv,
                    limit_min_pu=umin,
                    limit_max_pu=umax,
                    violation_type=ViolationType.UNDERVOLTAGE,
                    deviation_percent=deviation,
                )
                violations.append(violation)
            elif bus.v_pu > umax:
                deviation = ((bus.v_pu - umax) / umax) * 100
                violation = VoltageViolation(
                    bus_id=bus.bus_id,
                    bus_name=bus_name,
                    voltage_pu=bus.v_pu,
                    voltage_kv=voltage_kv,
                    limit_min_pu=umin,
                    limit_max_pu=umax,
                    violation_type=ViolationType.OVERVOLTAGE,
                    deviation_percent=deviation,
                )
                violations.append(violation)

        return self._build_result(pf_result, violations)

    def detect_from_dict(
        self,
        bus_voltages: dict[str, float],
        bus_info: dict[str, BusInfo] | None = None,
        custom_limits: dict[str, tuple[float, float]] | None = None,
    ) -> VoltageViolationsResult:
        """
        Alternatywna metoda - sprawdza naruszenia z surowego slownika napiec.

        Przydatne gdy nie ma pelnego PowerFlowResultV1, tylko napieciowa mapa.

        Args:
            bus_voltages: Slownik bus_id -> napiecie [p.u.].
            bus_info: Opcjonalny slownik BusInfo per bus_id.
            custom_limits: Opcjonalny slownik bus_id -> (umin, umax).

        Returns:
            VoltageViolationsResult z lista naruszen.
        """
        violations: list[VoltageViolation] = []

        for bus_id, v_pu in sorted(bus_voltages.items()):
            umin, umax = self._get_limits(bus_id, bus_info, custom_limits)
            bus_name = self._get_bus_name(bus_id, bus_info)
            voltage_kv = self._get_voltage_kv(bus_id, v_pu, bus_info)

            if v_pu < umin:
                deviation = ((umin - v_pu) / umin) * 100
                violation = VoltageViolation(
                    bus_id=bus_id,
                    bus_name=bus_name,
                    voltage_pu=v_pu,
                    voltage_kv=voltage_kv,
                    limit_min_pu=umin,
                    limit_max_pu=umax,
                    violation_type=ViolationType.UNDERVOLTAGE,
                    deviation_percent=deviation,
                )
                violations.append(violation)
            elif v_pu > umax:
                deviation = ((v_pu - umax) / umax) * 100
                violation = VoltageViolation(
                    bus_id=bus_id,
                    bus_name=bus_name,
                    voltage_pu=v_pu,
                    voltage_kv=voltage_kv,
                    limit_min_pu=umin,
                    limit_max_pu=umax,
                    violation_type=ViolationType.OVERVOLTAGE,
                    deviation_percent=deviation,
                )
                violations.append(violation)

        total_buses = len(bus_voltages)
        return self._build_result_from_violations(total_buses, violations)

    def _get_limits(
        self,
        bus_id: str,
        bus_info: dict[str, BusInfo] | None,
        custom_limits: dict[str, tuple[float, float]] | None,
    ) -> tuple[float, float]:
        """Pobiera limity dla wezla.

        Priorytet: custom_limits > bus_info > default
        """
        # 1. Custom limits (highest priority)
        if custom_limits and bus_id in custom_limits:
            return custom_limits[bus_id]

        # 2. Bus info limits
        if bus_info and bus_id in bus_info:
            info = bus_info[bus_id]
            if info.u_min_pu is not None and info.u_max_pu is not None:
                return (info.u_min_pu, info.u_max_pu)

        # 3. Default limits
        return (self.default_umin_pu, self.default_umax_pu)

    def _get_bus_name(
        self,
        bus_id: str,
        bus_info: dict[str, BusInfo] | None,
    ) -> str:
        """Pobiera nazwe wezla."""
        if bus_info and bus_id in bus_info:
            return bus_info[bus_id].bus_name
        return bus_id

    def _get_voltage_kv(
        self,
        bus_id: str,
        v_pu: float,
        bus_info: dict[str, BusInfo] | None,
    ) -> float | None:
        """Oblicza napiecie w kV jesli znane U_nom."""
        if bus_info and bus_id in bus_info:
            info = bus_info[bus_id]
            if info.u_nom_kv is not None:
                return v_pu * info.u_nom_kv
        return None

    def _build_result(
        self,
        pf_result: PowerFlowResultV1,
        violations: list[VoltageViolation],
    ) -> VoltageViolationsResult:
        """Buduje wynikowy obiekt."""
        total_buses = len(pf_result.bus_results)
        return self._build_result_from_violations(total_buses, violations)

    def _build_result_from_violations(
        self,
        total_buses: int,
        violations: list[VoltageViolation],
    ) -> VoltageViolationsResult:
        """Buduje VoltageViolationsResult z listy naruszen."""
        undervoltages = [v for v in violations if v.violation_type == ViolationType.UNDERVOLTAGE]
        overvoltages = [v for v in violations if v.violation_type == ViolationType.OVERVOLTAGE]

        worst_under: VoltageViolation | None = None
        worst_over: VoltageViolation | None = None

        if undervoltages:
            worst_under = min(undervoltages, key=lambda v: v.voltage_pu)
        if overvoltages:
            worst_over = max(overvoltages, key=lambda v: v.voltage_pu)

        return VoltageViolationsResult(
            total_buses=total_buses,
            violations_count=len(violations),
            undervoltage_count=len(undervoltages),
            overvoltage_count=len(overvoltages),
            violations=tuple(sorted(violations, key=lambda v: v.bus_id)),
            worst_undervoltage=worst_under,
            worst_overvoltage=worst_over,
            all_within_limits=(len(violations) == 0),
        )
