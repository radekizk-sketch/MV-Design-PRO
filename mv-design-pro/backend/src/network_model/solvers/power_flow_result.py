"""P20a: PowerFlowResult - immutable, zamrożone Result API dla Power Flow.

Ten moduł definiuje struktury wyników Power Flow zgodne ze specyfikacją P20a.
Po wprowadzeniu Result API jest zamrożone - wszelkie zmiany wymagają nowej wersji.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# P20a: Result API version (frozen after introduction)
POWER_FLOW_RESULT_VERSION = "1.0.0"


@dataclass(frozen=True)
class PowerFlowBusResult:
    """P20a: Wynik dla pojedynczego węzła (immutable).

    Attributes:
        bus_id: ID węzła.
        v_pu: Napięcie w p.u.
        angle_deg: Kąt napięcia w stopniach.
        p_injected_mw: Moc czynna wstrzyknięta [MW] (ujemna = pobór).
        q_injected_mvar: Moc bierna wstrzyknięta [Mvar] (ujemna = pobór).
    """

    bus_id: str
    v_pu: float
    angle_deg: float
    p_injected_mw: float
    q_injected_mvar: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "bus_id": self.bus_id,
            "v_pu": self.v_pu,
            "angle_deg": self.angle_deg,
            "p_injected_mw": self.p_injected_mw,
            "q_injected_mvar": self.q_injected_mvar,
        }


@dataclass(frozen=True)
class PowerFlowBranchResult:
    """P20a: Wynik dla pojedynczej gałęzi (immutable).

    Attributes:
        branch_id: ID gałęzi.
        p_from_mw: Moc czynna po stronie from [MW].
        q_from_mvar: Moc bierna po stronie from [Mvar].
        p_to_mw: Moc czynna po stronie to [MW].
        q_to_mvar: Moc bierna po stronie to [Mvar].
        losses_p_mw: Straty mocy czynnej [MW].
        losses_q_mvar: Straty mocy biernej [Mvar].
    """

    branch_id: str
    p_from_mw: float
    q_from_mvar: float
    p_to_mw: float
    q_to_mvar: float
    losses_p_mw: float
    losses_q_mvar: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "branch_id": self.branch_id,
            "p_from_mw": self.p_from_mw,
            "q_from_mvar": self.q_from_mvar,
            "p_to_mw": self.p_to_mw,
            "q_to_mvar": self.q_to_mvar,
            "losses_p_mw": self.losses_p_mw,
            "losses_q_mvar": self.losses_q_mvar,
        }


@dataclass(frozen=True)
class PowerFlowSummary:
    """P20a: Podsumowanie wyników Power Flow (immutable).

    Attributes:
        total_losses_p_mw: Całkowite straty mocy czynnej [MW].
        total_losses_q_mvar: Całkowite straty mocy biernej [Mvar].
        min_v_pu: Minimalne napięcie w sieci [p.u.].
        max_v_pu: Maksymalne napięcie w sieci [p.u.].
        slack_p_mw: Moc czynna węzła bilansującego [MW].
        slack_q_mvar: Moc bierna węzła bilansującego [Mvar].
    """

    total_losses_p_mw: float
    total_losses_q_mvar: float
    min_v_pu: float
    max_v_pu: float
    slack_p_mw: float
    slack_q_mvar: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_losses_p_mw": self.total_losses_p_mw,
            "total_losses_q_mvar": self.total_losses_q_mvar,
            "min_v_pu": self.min_v_pu,
            "max_v_pu": self.max_v_pu,
            "slack_p_mw": self.slack_p_mw,
            "slack_q_mvar": self.slack_q_mvar,
        }


@dataclass(frozen=True)
class PowerFlowResultV1:
    """P20a: Pełny wynik Power Flow v1 (FOUNDATION) - immutable, zamrożony.

    UWAGA: To API jest zamrożone po wprowadzeniu. Wszelkie zmiany wymagają
    nowej wersji (PowerFlowResultV2, etc.).

    Attributes:
        result_version: Wersja Result API.
        converged: Czy obliczenia zbiegły.
        iterations_count: Liczba wykonanych iteracji.
        tolerance_used: Tolerancja użyta w obliczeniach.
        base_mva: Moc bazowa [MVA].
        slack_bus_id: ID węzła bilansującego.
        bus_results: Lista wyników dla węzłów (deterministycznie posortowana).
        branch_results: Lista wyników dla gałęzi (deterministycznie posortowana).
        summary: Podsumowanie wyników.
    """

    result_version: str
    converged: bool
    iterations_count: int
    tolerance_used: float
    base_mva: float
    slack_bus_id: str
    bus_results: tuple[PowerFlowBusResult, ...]
    branch_results: tuple[PowerFlowBranchResult, ...]
    summary: PowerFlowSummary

    def to_dict(self) -> dict[str, Any]:
        """Serializacja do JSON (deterministyczna)."""
        return {
            "result_version": self.result_version,
            "converged": self.converged,
            "iterations_count": self.iterations_count,
            "tolerance_used": self.tolerance_used,
            "base_mva": self.base_mva,
            "slack_bus_id": self.slack_bus_id,
            "bus_results": [br.to_dict() for br in self.bus_results],
            "branch_results": [br.to_dict() for br in self.branch_results],
            "summary": self.summary.to_dict(),
        }


def build_power_flow_result_v1(
    *,
    converged: bool,
    iterations_count: int,
    tolerance_used: float,
    base_mva: float,
    slack_bus_id: str,
    node_u_mag: dict[str, float],
    node_angle: dict[str, float],
    node_p_injected_pu: dict[str, float],
    node_q_injected_pu: dict[str, float],
    branch_s_from_mva: dict[str, complex],
    branch_s_to_mva: dict[str, complex],
    losses_total: complex,
    slack_power_pu: complex,
) -> PowerFlowResultV1:
    """P20a: Buduje PowerFlowResultV1 z danych solvera.

    Konwertuje surowe dane z solvera na strukturę PowerFlowResultV1
    z deterministycznym sortowaniem.
    """
    import math

    # Bus results (deterministycznie posortowane po bus_id)
    bus_results: list[PowerFlowBusResult] = []
    for bus_id in sorted(node_u_mag.keys()):
        v_pu = node_u_mag.get(bus_id, 0.0)
        angle_rad = node_angle.get(bus_id, 0.0)
        angle_deg = math.degrees(angle_rad)
        p_pu = node_p_injected_pu.get(bus_id, 0.0)
        q_pu = node_q_injected_pu.get(bus_id, 0.0)
        bus_results.append(
            PowerFlowBusResult(
                bus_id=bus_id,
                v_pu=v_pu,
                angle_deg=angle_deg,
                p_injected_mw=p_pu * base_mva,
                q_injected_mvar=q_pu * base_mva,
            )
        )

    # Branch results (deterministycznie posortowane po branch_id)
    branch_results: list[PowerFlowBranchResult] = []
    for branch_id in sorted(branch_s_from_mva.keys()):
        s_from = branch_s_from_mva.get(branch_id, 0.0 + 0.0j)
        s_to = branch_s_to_mva.get(branch_id, 0.0 + 0.0j)
        p_from = s_from.real
        q_from = s_from.imag
        p_to = s_to.real
        q_to = s_to.imag
        # Straty = S_from + S_to (dla gałęzi straty są sumą obu końców)
        losses_p = p_from + p_to
        losses_q = q_from + q_to
        branch_results.append(
            PowerFlowBranchResult(
                branch_id=branch_id,
                p_from_mw=p_from,
                q_from_mvar=q_from,
                p_to_mw=p_to,
                q_to_mvar=q_to,
                losses_p_mw=losses_p,
                losses_q_mvar=losses_q,
            )
        )

    # Summary
    v_values = list(node_u_mag.values())
    min_v = min(v_values) if v_values else 0.0
    max_v = max(v_values) if v_values else 0.0
    summary = PowerFlowSummary(
        total_losses_p_mw=(
            losses_total.real * base_mva
            if isinstance(losses_total, complex)
            else float(losses_total) * base_mva
        ),
        total_losses_q_mvar=(
            losses_total.imag * base_mva if isinstance(losses_total, complex) else 0.0
        ),
        min_v_pu=min_v,
        max_v_pu=max_v,
        slack_p_mw=slack_power_pu.real * base_mva,
        slack_q_mvar=slack_power_pu.imag * base_mva,
    )

    return PowerFlowResultV1(
        result_version=POWER_FLOW_RESULT_VERSION,
        converged=converged,
        iterations_count=iterations_count,
        tolerance_used=tolerance_used,
        base_mva=base_mva,
        slack_bus_id=slack_bus_id,
        bus_results=tuple(bus_results),
        branch_results=tuple(branch_results),
        summary=summary,
    )
