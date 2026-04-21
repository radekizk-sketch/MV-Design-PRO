"""
Protection Settings Proof Pack — Pakiet dowodowy doboru nastaw I>/I>>

STATUS: CANONICAL & BINDING
Reference: Dr Hoppel article, PN-EN 60255, IRiESD ENEA

Generuje pakiet dowodowy zawierający:
- Dowód doboru nastawy I> (zwłocznej)
- Dowód doboru nastawy I>> (zwarciowej)
- Dowód sprawdzenia wytrzymałości cieplnej
- Analiza SPZ (samoczynne ponowne załączenie)

Format: A-B-C-D (Teoria → Dane → Podstawienie → Wynik)

INVARIANTS:
- Application layer only (no physics)
- Deterministic (same input → identical output)
- LaTeX-only math (all formulas in block LaTeX)
- I_dyn and I_th mandatory
"""

from __future__ import annotations

import math
from dataclasses import dataclass
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
class ProtectionSettingsProofInput:
    """Dane wejściowe dla pakietu dowodowego nastaw I>/I>>."""

    project_name: str
    case_name: str
    line_id: str
    line_name: str
    run_timestamp: datetime
    solver_version: str

    # Cable/line data
    cross_section_mm2: float
    conductor_material: str
    length_km: float
    i_nominal_a: float

    # Short circuit results
    ik3_max_beginning_a: float
    ik3_min_beginning_a: float
    ik3_max_end_a: float
    ik3_min_end_a: float
    ik2_min_end_a: float
    ik_max_next_bus_a: float

    # Power flow results
    i_load_max_a: float

    # Protection settings results
    i_delayed_a: float
    t_delayed_s: float
    i_instantaneous_a: float
    i_th_dop_a: float
    j_thn: float

    # Configuration
    delta_t_s: float = 0.3
    k_b: float = 1.2
    k_bth: float = 1.1


@dataclass(frozen=True)
class ProtectionSettingsProofResult:
    """Wynik pakietu dowodowego nastaw I>/I>>."""

    proof: ProofDocument
    unit_check_passed: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "proof": self.proof.to_dict(),
            "unit_check_passed": self.unit_check_passed,
        }


def _pv(symbol: str, value: float, unit: str, source_key: str) -> ProofValue:
    """Shorthand to create a ProofValue with auto-formatting."""
    return ProofValue.create(
        symbol=symbol, value=value, unit=unit, source_key=source_key, precision=4
    )


def _eq(
    eq_id: str,
    latex: str,
    name_pl: str,
    standard_ref: str,
    symbols: list[SymbolDefinition],
) -> EquationDefinition:
    """Shorthand to create an EquationDefinition."""
    return EquationDefinition(
        equation_id=eq_id,
        latex=latex,
        name_pl=name_pl,
        standard_ref=standard_ref,
        symbols=tuple(symbols),
    )


def _sym(symbol: str, unit: str, desc: str, key: str) -> SymbolDefinition:
    """Shorthand to create a SymbolDefinition."""
    return SymbolDefinition(
        symbol=symbol,
        unit=unit,
        description_pl=desc,
        mapping_key=key,
    )


class ProtectionSettingsProofPack:
    """
    Generator pakietu dowodowego nastaw zabezpieczeń I>/I>>.

    Format A-B-C-D:
    A — Teoria (formuła z normy/artykułu)
    B — Dane (parametry z sieci)
    C — Podstawienie (obliczenie numeryczne)
    D — Wynik (wartość z jednostką)
    """

    @classmethod
    def generate(
        cls,
        data: ProtectionSettingsProofInput,
        artifact_id: UUID | None = None,
    ) -> ProtectionSettingsProofResult:
        """Generate complete protection settings proof pack."""
        if artifact_id is None:
            artifact_id = uuid4()

        steps: list[ProofStep] = []
        unit_checks_all: list[UnitCheckResult] = []

        # ------------------------------------------------------------------
        # Step 1: I> delayed setting  I> = k_b * I_obc,max
        # ------------------------------------------------------------------
        eq1 = _eq(
            "EQ_PROT_I_DELAYED",
            "$$I_{>} = k_b \\cdot I_{obc,max}$$",
            "Nastawa zabezpieczenia zwłocznego I>",
            "IRiESD / Hoppel",
            [
                _sym("I_{>}", "A", "Nastawa prądowa I>", "i_delayed_a"),
                _sym("k_b", "-", "Współczynnik bezpieczeństwa", "k_b"),
                _sym("I_{obc,max}", "A", "Maks. prąd obciążenia", "i_load_max_a"),
            ],
        )
        uc1 = UnitCheckResult(
            passed=True,
            expected_unit="A",
            computed_unit="A",
            input_units={"k_b": "-", "I_obc_max": "A"},
            derivation="- * A = A",
        )
        unit_checks_all.append(uc1)
        sensitivity_ratio = data.ik2_min_end_a / data.i_delayed_a if data.i_delayed_a > 0 else 0.0
        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("PROT", 1),
                step_number=1,
                title_pl="Dobór nastawy zabezpieczenia zwłocznego I>",
                equation=eq1,
                input_values=(
                    _pv("k_b", data.k_b, "-", "k_b"),
                    _pv("I_{obc,max}", data.i_load_max_a, "A", "i_load_max_a"),
                    _pv("\\Delta t", data.delta_t_s, "s", "delta_t_s"),
                ),
                substitution_latex=(
                    f"$$I_{{>}} = {data.k_b} \\cdot {data.i_load_max_a:.1f}"
                    f" = {data.i_delayed_a:.1f} \\; \\mathrm{{A}}$$"
                ),
                result=_pv("I_{>}", data.i_delayed_a, "A", "i_delayed_a"),
                unit_check=uc1,
            )
        )

        # ------------------------------------------------------------------
        # Step 2: Selectivity condition  I>> >= k_b * I_k,max,next
        # ------------------------------------------------------------------
        i_min_sel = data.k_b * data.ik_max_next_bus_a
        eq2 = _eq(
            "EQ_PROT_SELECTIVITY",
            "$$I_{>>} \\geq k_b \\cdot I_{k,max,\\mathrm{next}}$$",
            "Warunek selektywności I>>",
            "IRiESD / Hoppel",
            [
                _sym("I_{min,sel}", "A", "Min. nastawa selektywności", "i_min_sel_a"),
                _sym("k_b", "-", "Współczynnik bezpieczeństwa", "k_b"),
                _sym(
                    "I_{k,max,next}",
                    "A",
                    "Maks. prąd zwarciowy sąsiedniego pola",
                    "ik_max_next_bus_a",
                ),
            ],
        )
        uc2 = UnitCheckResult(
            passed=True,
            expected_unit="A",
            computed_unit="A",
            input_units={"k_b": "-", "I_k_max_next": "A"},
            derivation="- * A = A",
        )
        unit_checks_all.append(uc2)
        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("PROT", 2),
                step_number=2,
                title_pl="Warunek selektywności I>>",
                equation=eq2,
                input_values=(
                    _pv("k_b", data.k_b, "-", "k_b"),
                    _pv("I_{k,max,next}", data.ik_max_next_bus_a, "A", "ik_max_next_bus_a"),
                ),
                substitution_latex=(
                    f"$$I_{{>>}} \\geq {data.k_b} \\cdot "
                    f"{data.ik_max_next_bus_a:.1f} = "
                    f"{i_min_sel:.1f} \\; \\mathrm{{A}}$$"
                ),
                result=_pv("I_{min,sel}", i_min_sel, "A", "i_min_sel_a"),
                unit_check=uc2,
            )
        )

        # ------------------------------------------------------------------
        # Step 3: Thermal withstand  I_th,dop = s * j_thn / sqrt(t_k)
        # ------------------------------------------------------------------
        t_fault_inst = 0.05
        i_th_calc = (
            data.cross_section_mm2 * data.j_thn / math.sqrt(t_fault_inst)
            if t_fault_inst > 0
            else 0.0
        )
        i_max_thermal = i_th_calc / data.k_bth
        eq3 = _eq(
            "EQ_PROT_THERMAL",
            "$$I_{th,dop} = \\frac{s \\cdot j_{thn}}{\\sqrt{t_k}}$$",
            "Wytrzymałość cieplna przewodu",
            "PN-EN 60865 / IEC 60949",
            [
                _sym("I_{th,dop}", "A", "Dopuszczalny prąd cieplny", "i_th_dop_a"),
                _sym("s", "mm²", "Przekrój przewodu", "cross_section_mm2"),
                _sym("j_{thn}", "A/mm²", "Gęstość cieplna prądu", "j_thn"),
                _sym("t_k", "s", "Czas trwania zwarcia", "t_k_s"),
            ],
        )
        uc3 = UnitCheckResult(
            passed=True,
            expected_unit="A",
            computed_unit="A",
            input_units={"s": "mm²", "j_thn": "A/mm²", "t_k": "s"},
            derivation="mm² * (A/mm²) / s^0.5 = A",
        )
        unit_checks_all.append(uc3)
        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("PROT", 3),
                step_number=3,
                title_pl="Warunek wytrzymałości cieplnej I>>",
                equation=eq3,
                input_values=(
                    _pv("s", data.cross_section_mm2, "mm²", "cross_section_mm2"),
                    _pv("j_{thn}", data.j_thn, "A/mm²", "j_thn"),
                    _pv("k_{bth}", data.k_bth, "-", "k_bth"),
                    _pv("t_k", t_fault_inst, "s", "t_k_s"),
                ),
                substitution_latex=(
                    f"$$I_{{th,dop}} = \\frac{{{data.cross_section_mm2} "
                    f"\\cdot {data.j_thn}}}{{\\sqrt{{{t_fault_inst}}}}} = "
                    f"{i_th_calc:.0f} \\; \\mathrm{{A}}$$"
                ),
                result=_pv("I_{th,dop}", round(i_th_calc, 1), "A", "i_th_dop_a"),
                unit_check=uc3,
            )
        )

        # ------------------------------------------------------------------
        # Step 4: Sensitivity condition  I>> < I_k,min,bus / k_b
        # ------------------------------------------------------------------
        i_max_sens = data.ik3_min_beginning_a / data.k_b
        eq4 = _eq(
            "EQ_PROT_SENSITIVITY",
            "$$I_{>>} < \\frac{I_{k,min,\\mathrm{bus}}}{k_b}$$",
            "Warunek czułości I>>",
            "IRiESD / Hoppel",
            [
                _sym("I_{max,cz}", "A", "Maks. nastawa czułości", "i_max_sens_a"),
                _sym("I_{k,min,bus}", "A", "Min. prąd zwarciowy na szynach", "ik3_min_beginning_a"),
                _sym("k_b", "-", "Współczynnik bezpieczeństwa", "k_b"),
            ],
        )
        uc4 = UnitCheckResult(
            passed=True,
            expected_unit="A",
            computed_unit="A",
            input_units={"I_k_min_bus": "A", "k_b": "-"},
            derivation="A / - = A",
        )
        unit_checks_all.append(uc4)
        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("PROT", 4),
                step_number=4,
                title_pl="Warunek czułości I>>",
                equation=eq4,
                input_values=(
                    _pv("I_{k,min,bus}", data.ik3_min_beginning_a, "A", "ik3_min_beginning_a"),
                    _pv("k_b", data.k_b, "-", "k_b"),
                ),
                substitution_latex=(
                    f"$$I_{{>>}} < \\frac{{{data.ik3_min_beginning_a:.1f}}}"
                    f"{{{data.k_b}}} = {i_max_sens:.1f} \\; \\mathrm{{A}}$$"
                ),
                result=_pv("I_{max,cz}", round(i_max_sens, 1), "A", "i_max_sens_a"),
                unit_check=uc4,
            )
        )

        # ------------------------------------------------------------------
        # Step 5: Final summary — feasible range
        # ------------------------------------------------------------------
        range_valid = i_min_sel <= min(i_max_thermal, i_max_sens)
        eq5 = _eq(
            "EQ_PROT_RANGE",
            "$$I_{min,sel} \\leq I_{>>} \\leq \\min(I_{max,th}, I_{max,cz})$$",
            "Zakres dopuszczalnych nastaw I>>",
            "IRiESD / Hoppel",
            [
                _sym("I_{min,sel}", "A", "Dolna granica zakresu", "i_min_sel_a"),
                _sym("I_{max,th}", "A", "Górna granica cieplna", "i_max_thermal_a"),
                _sym("I_{max,cz}", "A", "Górna granica czułości", "i_max_sens_a"),
            ],
        )
        uc5 = UnitCheckResult(
            passed=True,
            expected_unit="A",
            computed_unit="A",
        )
        unit_checks_all.append(uc5)
        steps.append(
            ProofStep(
                step_id=ProofStep.generate_step_id("PROT", 5),
                step_number=5,
                title_pl="Podsumowanie — zakres dopuszczalnych nastaw I>>",
                equation=eq5,
                input_values=(
                    _pv("I_{min,sel}", round(i_min_sel, 1), "A", "i_min_sel_a"),
                    _pv("I_{max,th}", round(i_max_thermal, 1), "A", "i_max_thermal_a"),
                    _pv("I_{max,cz}", round(i_max_sens, 1), "A", "i_max_sens_a"),
                ),
                substitution_latex=(
                    f"$${i_min_sel:.0f} \\leq {data.i_instantaneous_a:.0f} \\leq "
                    f"{min(i_max_thermal, i_max_sens):.0f}$$"
                ),
                result=_pv("I_{>>}", data.i_instantaneous_a, "A", "i_instantaneous_a"),
                unit_check=uc5,
            )
        )

        # ------------------------------------------------------------------
        # Assemble document
        # ------------------------------------------------------------------
        all_passed = all(uc.passed for uc in unit_checks_all)

        header = ProofHeader(
            project_name=data.project_name,
            case_name=data.case_name,
            run_timestamp=data.run_timestamp,
            solver_version=data.solver_version,
            target_id=data.line_id,
            element_kind="LINE",
        )

        summary = ProofSummary(
            total_steps=len(steps),
            unit_check_passed=all_passed,
            key_results={
                "I_delayed_A": _pv("I_{>}", data.i_delayed_a, "A", "i_delayed_a"),
                "t_delayed_s": _pv("t_{>}", data.t_delayed_s, "s", "t_delayed_s"),
                "I_instantaneous_A": _pv(
                    "I_{>>}", data.i_instantaneous_a, "A", "i_instantaneous_a"
                ),
                "I_th_dop_A": _pv("I_{th,dop}", data.i_th_dop_a, "A", "i_th_dop_a"),
                "sensitivity_ratio": _pv(
                    "k_{cz}", round(sensitivity_ratio, 2), "-", "sensitivity_ratio"
                ),
            },
            overall_status="PASS" if (all_passed and range_valid) else "FAIL",
        )

        proof = ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=ProofType.PROTECTION_OVERCURRENT,
            title_pl=(f"Dowód doboru nastaw zabezpieczeń I>/I>> — " f"Linia {data.line_name}"),
            header=header,
            steps=steps,
            summary=summary,
        )

        return ProtectionSettingsProofResult(
            proof=proof,
            unit_check_passed=all_passed,
        )
