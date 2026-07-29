"""OLTC report section (V12K-045, §14) — interpretation layer, READ-ONLY.

Renders a power-flow report section describing the on-load tap-changer regulation
from the ``oltc_control`` trace produced by the LF OLTC loop (see
``network_model/solvers/power_flow_oltc.py``). No physics here — it only reads
the run result and formats it (JSON / Polish text / LaTeX), deterministically.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class OltcRegulatorReport:
    branch_id: str
    regulated_winding: str
    controlled_bus_id: str | None
    setpoint_kv: float | None
    deadband_kv: float | None
    initial_position: int
    final_position: int
    switch_count: int
    u_controlled_before_kv: float | None
    u_controlled_after_kv: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "branch_id": self.branch_id,
            "regulated_winding": self.regulated_winding,
            "controlled_bus_id": self.controlled_bus_id,
            "setpoint_kv": self.setpoint_kv,
            "deadband_kv": self.deadband_kv,
            "initial_position": self.initial_position,
            "final_position": self.final_position,
            "switch_count": self.switch_count,
            "u_controlled_before_kv": self.u_controlled_before_kv,
            "u_controlled_after_kv": self.u_controlled_after_kv,
        }


@dataclass(frozen=True)
class OltcReportSection:
    present: bool
    converged: bool
    iterations_count: int
    total_switch_count: int
    regulators: list[OltcRegulatorReport] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "section": "oltc_regulation",
            "present": self.present,
            "converged": self.converged,
            "iterations_count": self.iterations_count,
            "total_switch_count": self.total_switch_count,
            "regulators": [r.to_dict() for r in self.regulators],
        }


_EMPTY = OltcReportSection(
    present=False, converged=False, iterations_count=0, total_switch_count=0, regulators=[]
)


def _decision_by_branch(oltc: dict[str, Any], branch_id: str, first: bool) -> dict[str, Any] | None:
    iterations = oltc.get("iterations") or []
    order = iterations if first else list(reversed(iterations))
    for it in order:
        for decision in it.get("decisions", []):
            if decision.get("branch_id") == branch_id:
                return decision
    return None


def build_oltc_report_section(oltc_control: dict[str, Any] | None) -> OltcReportSection:
    """Build the OLTC report section from an ``oltc_control`` trace (READ-ONLY).

    Returns an empty (present=False) section when the load flow ran without an
    automatic OLTC regulator.
    """
    if not oltc_control:
        return _EMPTY

    final_positions = oltc_control.get("final_positions") or {}
    initial_positions = oltc_control.get("initial_positions") or {}
    switch_counts = oltc_control.get("switch_counts") or {}

    regulators: list[OltcRegulatorReport] = []
    for meta in oltc_control.get("regulators", []):
        branch_id = meta.get("branch_id")
        first = _decision_by_branch(oltc_control, branch_id, first=True)
        last = _decision_by_branch(oltc_control, branch_id, first=False)
        regulators.append(
            OltcRegulatorReport(
                branch_id=branch_id,
                regulated_winding=meta.get("regulated_winding", "HV"),
                controlled_bus_id=meta.get("controlled_bus_id"),
                setpoint_kv=meta.get("setpoint_kv"),
                deadband_kv=meta.get("deadband_kv"),
                initial_position=int(
                    initial_positions.get(branch_id, meta.get("initial_position", 0))
                ),
                final_position=int(final_positions.get(branch_id, meta.get("initial_position", 0))),
                switch_count=int(switch_counts.get(branch_id, 0)),
                u_controlled_before_kv=(first or {}).get("u_controlled_kv"),
                u_controlled_after_kv=(last or {}).get("u_controlled_kv"),
            )
        )

    return OltcReportSection(
        present=True,
        converged=bool(oltc_control.get("converged", False)),
        iterations_count=int(
            oltc_control.get("iterations_count", len(oltc_control.get("iterations", [])))
        ),
        total_switch_count=int(oltc_control.get("total_switch_count", 0)),
        regulators=regulators,
    )


def _fmt_kv(value: float | None) -> str:
    return f"{value:.3f} kV" if isinstance(value, int | float) else "—"


def render_oltc_report_text(section: OltcReportSection) -> str:
    """Polish plain-text rendering for inclusion in a PF report."""
    if not section.present:
        return "Regulacja zaczepów (OLTC): brak automatycznej regulacji w tym rozpływie."
    lines = [
        "Regulacja napięcia (OLTC)",
        f"  Zbieżność pętli: {'tak' if section.converged else 'nie'}"
        f" · iteracje: {section.iterations_count}"
        f" · łączne przełączenia: {section.total_switch_count}",
    ]
    for r in section.regulators:
        lines.append(
            f"  Transformator {r.branch_id} (uzwojenie {r.regulated_winding}): "
            f"pozycja {r.initial_position} → {r.final_position} "
            f"({r.switch_count} przeł.), U zadane {_fmt_kv(r.setpoint_kv)}, "
            f"U szyny {_fmt_kv(r.u_controlled_before_kv)} → {_fmt_kv(r.u_controlled_after_kv)}"
        )
    return "\n".join(lines)


def render_oltc_report_latex(section: OltcReportSection) -> str:
    """LaTeX section for inclusion in a PF report (deterministic)."""
    if not section.present:
        return (
            "\\section{Regulacja zaczepow (OLTC)}\n"
            "Brak automatycznej regulacji zaczepow w tym rozplywie.\n"
        )
    rows = []
    for r in section.regulators:
        rows.append(
            f"{r.branch_id} & {r.regulated_winding} & {r.initial_position} & "
            f"{r.final_position} & {r.switch_count} \\\\"
        )
    body = "\n".join(rows)
    return (
        "\\section{Regulacja napiecia (OLTC)}\n"
        f"Zbieznosc petli: {'tak' if section.converged else 'nie'}, "
        f"iteracje: {section.iterations_count}, "
        f"laczne przelaczenia: {section.total_switch_count}.\n"
        "\\begin{tabular}{lllll}\n"
        "Transformator & Uzwojenie & Pozycja pocz. & Pozycja konc. & Przelaczenia \\\\\n"
        "\\hline\n"
        f"{body}\n"
        "\\end{tabular}\n"
    )
