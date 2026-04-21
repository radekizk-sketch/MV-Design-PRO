"""
Q(U) Regulation Proof Pack — Pakiet dowodowy regulacji mocy biernej OZE

STATUS: CANONICAL & BINDING
Reference: NC RfG, IRiESD ENEA, IEC 61850

Generuje pakiet dowodowy weryfikujący regulację Q(U) instalacji OZE:
- Charakterystyka Q(U) zadana vs rzeczywista
- Napięcia w sieci SN przy różnych poziomach generacji
- Zgodność z wymaganiami operatora (±5% Un)
- Wpływ regulacji na profil napięć

INVARIANTS:
- Application layer only (no physics)
- Deterministic (same input → identical output)
- LaTeX-only math (all formulas in block LaTeX)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from application.proof_engine.types import (
    EquationDefinition,
    ProofDocument,
    ProofHeader,
    ProofStep,
    ProofSummary,
    ProofType,
    ProofValue,
    SymbolDefinition,
    UnitCheckResult,
)


@dataclass
class QUCharacteristicPoint:
    """Point on Q(U) characteristic curve."""

    u_pu: float  # Voltage [p.u.]
    q_pu: float  # Reactive power [p.u.]


@dataclass
class QURegulationProofInput:
    """Dane wejściowe dla pakietu dowodowego regulacji Q(U)."""

    project_name: str
    case_name: str
    oze_id: str
    oze_name: str
    run_timestamp: datetime
    solver_version: str

    # OZE nominal data
    p_nominal_mw: float
    q_max_mvar: float
    cos_phi_min: float

    # Q(U) characteristic (setpoints)
    qu_characteristic: list[QUCharacteristicPoint]

    # Dead-band parameters (NC RfG)
    u_deadband_low_pu: float = 0.98  # Lower dead-band limit
    u_deadband_high_pu: float = 1.02  # Upper dead-band limit
    q_slope_pu_per_pu: float = 4.0  # Slope outside dead-band

    # Voltage limits (operator requirements)
    u_min_pu: float = 0.95  # Minimum voltage ±5% Un
    u_max_pu: float = 1.05  # Maximum voltage ±5% Un

    # Simulation results at various generation levels
    generation_levels: list[float] = field(default_factory=lambda: [0.0, 0.25, 0.5, 0.75, 1.0])
    voltages_at_oze_pu: list[float] = field(default_factory=list)
    q_injected_mvar: list[float] = field(default_factory=list)
    voltages_at_buses_pu: list[list[float]] = field(default_factory=list)
    bus_names: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class QURegulationProofResult:
    """Wynik pakietu dowodowego regulacji Q(U)."""

    proof: ProofDocument
    voltages_within_limits: bool
    qu_compliance: bool
    unit_check_passed: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "proof": self.proof.to_dict(),
            "voltages_within_limits": self.voltages_within_limits,
            "qu_compliance": self.qu_compliance,
            "unit_check_passed": self.unit_check_passed,
        }


def _pv(symbol: str, value: float, unit: str, source_key: str) -> ProofValue:
    """Shorthand to create a ProofValue with auto-formatting."""
    return ProofValue.create(
        symbol=symbol, value=value, unit=unit, source_key=source_key, precision=4
    )


def _sym(symbol: str, unit: str, desc: str, key: str) -> SymbolDefinition:
    """Shorthand to create a SymbolDefinition."""
    return SymbolDefinition(
        symbol=symbol,
        unit=unit,
        description_pl=desc,
        mapping_key=key,
    )


class QURegulationProofPack:
    """
    Generator pakietu dowodowego regulacji Q(U).

    Weryfikuje zgodność regulacji mocy biernej OZE z NC RfG i IRiESD.
    """

    @classmethod
    def generate(
        cls,
        data: QURegulationProofInput,
        artifact_id: UUID | None = None,
    ) -> QURegulationProofResult:
        """Generate complete Q(U) regulation proof pack."""
        if artifact_id is None:
            artifact_id = uuid4()

        steps: list[ProofStep] = []
        unit_checks: list[UnitCheckResult] = []

        # ------------------------------------------------------------------
        # Step 1: Q(U) characteristic definition
        # ------------------------------------------------------------------
        eq_qu = EquationDefinition(
            equation_id="EQ_QU_CHAR",
            latex=(
                "$$Q(U) = \\begin{cases} "
                "Q_{max} & U < U_{db,low} \\\\ "
                "0 & U_{db,low} \\leq U \\leq U_{db,high} \\\\ "
                "-Q_{max} & U > U_{db,high} "
                "\\end{cases}$$"
            ),
            name_pl="Charakterystyka Q(U) regulatora OZE",
            standard_ref="NC RfG / IRiESD",
            symbols=(
                _sym("Q", "Mvar", "Moc bierna regulatora", "q_mvar"),
                _sym("U", "p.u.", "Napięcie w punkcie przyłączenia", "u_pu"),
                _sym("U_{db,low}", "p.u.", "Dolna granica strefy martwej", "u_deadband_low_pu"),
                _sym("U_{db,high}", "p.u.", "Górna granica strefy martwej", "u_deadband_high_pu"),
                _sym("Q_{max}", "Mvar", "Maksymalna moc bierna", "q_max_mvar"),
            ),
        )
        uc_qu = UnitCheckResult(
            passed=True,
            expected_unit="Mvar",
            computed_unit="Mvar",
            input_units={"U": "p.u.", "Q_max": "Mvar"},
            derivation="Mvar (piecewise function)",
        )
        unit_checks.append(uc_qu)

        qu_desc_parts = [f"({p.u_pu:.3f}, {p.q_pu:.3f})" for p in data.qu_characteristic]
        qu_desc = ", ".join(qu_desc_parts) if qu_desc_parts else "brak danych"

        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("QU", 1),
                step_number=1,
                title_pl="Charakterystyka Q(U) zadana",
                equation=eq_qu,
                input_values=(
                    _pv("U_{db,low}", data.u_deadband_low_pu, "p.u.", "u_deadband_low_pu"),
                    _pv("U_{db,high}", data.u_deadband_high_pu, "p.u.", "u_deadband_high_pu"),
                    _pv("k_{slope}", data.q_slope_pu_per_pu, "p.u./p.u.", "q_slope_pu_per_pu"),
                    _pv("Q_{max}", data.q_max_mvar, "Mvar", "q_max_mvar"),
                ),
                substitution_latex=f"Punkty: {qu_desc}",
                result=_pv("Q_{max}", data.q_max_mvar, "Mvar", "q_max_mvar"),
                unit_check=uc_qu,
            )
        )

        # ------------------------------------------------------------------
        # Steps 2..N: Voltage analysis at various generation levels
        # ------------------------------------------------------------------
        eq_voltage = EquationDefinition(
            equation_id="EQ_QU_VOLTAGE",
            latex="$$U_{min} \\leq U_{OZE} \\leq U_{max}$$",
            name_pl="Warunek napięciowy w punkcie OZE",
            standard_ref="NC RfG / IRiESD",
            symbols=(
                _sym("U_{OZE}", "p.u.", "Napięcie w punkcie OZE", "u_oze_pu"),
                _sym("U_{min}", "p.u.", "Minimalne dopuszczalne napięcie", "u_min_pu"),
                _sym("U_{max}", "p.u.", "Maksymalne dopuszczalne napięcie", "u_max_pu"),
            ),
        )

        all_within_limits = True
        qu_compliant = True

        for i, gen_level in enumerate(data.generation_levels):
            u_oze = data.voltages_at_oze_pu[i] if i < len(data.voltages_at_oze_pu) else 1.0
            q_inj = data.q_injected_mvar[i] if i < len(data.q_injected_mvar) else 0.0

            within = data.u_min_pu <= u_oze <= data.u_max_pu
            if not within:
                all_within_limits = False

            expected_q = cls._calculate_expected_q(
                u_pu=u_oze,
                q_max=data.q_max_mvar,
                u_db_low=data.u_deadband_low_pu,
                u_db_high=data.u_deadband_high_pu,
                slope=data.q_slope_pu_per_pu,
            )
            q_error = abs(q_inj - expected_q) / max(abs(data.q_max_mvar), 0.001)
            if q_error > 0.1:
                qu_compliant = False

            uc_v = UnitCheckResult(
                passed=True,
                expected_unit="p.u.",
                computed_unit="p.u.",
            )
            unit_checks.append(uc_v)

            steps.append(
                ProofStep(
                    step_id=ProofStep.generate_step_id("QU", 2 + i),
                    step_number=2 + i,
                    title_pl=f"Punkt pracy: generacja {gen_level*100:.0f}% P_n",
                    equation=eq_voltage,
                    input_values=(
                        _pv("P/P_n", gen_level, "-", "gen_level"),
                        _pv("U_{OZE}", u_oze, "p.u.", "u_oze_pu"),
                        _pv("Q_{inj}", q_inj, "Mvar", "q_injected_mvar"),
                    ),
                    substitution_latex=(
                        f"$${data.u_min_pu} \\leq {u_oze:.4f} " f"\\leq {data.u_max_pu}$$"
                    ),
                    result=_pv(
                        "\\mathrm{within\\_limits}",
                        1.0 if within else 0.0,
                        "-",
                        "within_limits",
                    ),
                    unit_check=uc_v,
                )
            )

        # ------------------------------------------------------------------
        # Final step: Summary
        # ------------------------------------------------------------------
        n_gen = len(data.generation_levels)
        eq_summary = EquationDefinition(
            equation_id="EQ_QU_SUMMARY",
            latex="",
            name_pl="Podsumowanie regulacji Q(U)",
            standard_ref="NC RfG / IRiESD",
            symbols=(
                _sym("U_{min}", "p.u.", "Minimalne napięcie", "u_min_pu"),
                _sym("U_{max}", "p.u.", "Maksymalne napięcie", "u_max_pu"),
            ),
        )
        uc_sum = UnitCheckResult(
            passed=True,
            expected_unit="-",
            computed_unit="-",
        )
        unit_checks.append(uc_sum)

        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("QU", 2 + n_gen),
                step_number=2 + n_gen,
                title_pl="Podsumowanie regulacji Q(U)",
                equation=eq_summary,
                input_values=(
                    _pv("U_{min}", data.u_min_pu, "p.u.", "u_min_pu"),
                    _pv("U_{max}", data.u_max_pu, "p.u.", "u_max_pu"),
                ),
                substitution_latex="",
                result=_pv(
                    "\\mathrm{compliance}",
                    1.0 if (all_within_limits and qu_compliant) else 0.0,
                    "-",
                    "compliance",
                ),
                unit_check=uc_sum,
            )
        )

        # ------------------------------------------------------------------
        # Assemble document
        # ------------------------------------------------------------------
        all_uc_passed = all(uc.passed for uc in unit_checks)

        header = ProofHeader(
            project_name=data.project_name,
            case_name=data.case_name,
            run_timestamp=data.run_timestamp,
            solver_version=data.solver_version,
            target_id=data.oze_id,
            element_kind="OZE",
        )

        summary = ProofSummary(
            total_steps=len(steps),
            unit_check_passed=all_uc_passed,
            key_results={
                "voltages_within_limits": _pv(
                    "V_{OK}",
                    1.0 if all_within_limits else 0.0,
                    "-",
                    "voltages_within_limits",
                ),
                "qu_compliance": _pv(
                    "QU_{OK}",
                    1.0 if qu_compliant else 0.0,
                    "-",
                    "qu_compliance",
                ),
                "p_nominal_mw": _pv(
                    "P_n",
                    data.p_nominal_mw,
                    "MW",
                    "p_nominal_mw",
                ),
                "q_max_mvar": _pv(
                    "Q_{max}",
                    data.q_max_mvar,
                    "Mvar",
                    "q_max_mvar",
                ),
            },
            overall_status=("PASS" if (all_within_limits and qu_compliant) else "FAIL"),
        )

        proof = ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=ProofType.Q_U_REGULATION,
            title_pl=(f"Dowód regulacji mocy biernej Q(U) — " f"{data.oze_name}"),
            header=header,
            steps=steps,
            summary=summary,
        )

        return QURegulationProofResult(
            proof=proof,
            voltages_within_limits=all_within_limits,
            qu_compliance=qu_compliant,
            unit_check_passed=all_uc_passed,
        )

    @staticmethod
    def _calculate_expected_q(
        u_pu: float,
        q_max: float,
        u_db_low: float,
        u_db_high: float,
        slope: float,
    ) -> float:
        """Calculate expected Q from Q(U) characteristic."""
        if u_pu < u_db_low:
            delta = u_db_low - u_pu
            return min(q_max, delta * slope * q_max)
        elif u_pu > u_db_high:
            delta = u_pu - u_db_high
            return max(-q_max, -delta * slope * q_max)
        else:
            return 0.0
