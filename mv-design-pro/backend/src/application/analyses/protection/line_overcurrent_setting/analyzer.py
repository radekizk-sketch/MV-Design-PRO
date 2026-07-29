"""
Line Overcurrent Setting Analyzer — FIX-12D

Main analyzer for I>> setting determination.

CANONICAL ALIGNMENT:
- SYSTEM_SPEC.md: Analysis layer (NOT-A-SOLVER)
- ARCHITECTURE.md: Interpretation layer

NOT-A-SOLVER RULE (BINDING):
    This module is an ANALYSIS/INTERPRETATION layer component.
    It does NOT perform any physics calculations (no IEC 60909 computing).
    All physics data (fault currents) comes from Short Circuit solver results.
    This module ONLY interprets pre-computed results to determine I>> settings.

WHITE BOX:
    Full trace of all evaluation steps is recorded.
    Every intermediate value is exposed for audit.

DETERMINISM:
    Same inputs → identical outputs.
    No randomness, no timestamps in calculations.

METHODOLOGY (from lecture materials):
    1. Selectivity criterion: I_nast >= kb * Ikmax(next_protection) / θi
       - Ensures coordination with downstream protection
       - kb accounts for CT errors and relay tolerance

    2. Sensitivity criterion: Ikmin(busbars) / θi >= kc * I_nast
       - Ensures reliable trip for minimum fault at busbar
       - kc provides safety margin for measurement errors

    3. Thermal criterion: I_nast <= kbth * Ithdop / θi
       - Ensures conductor thermal protection
       - Ithdop = Ithn / sqrt(tk) where tk includes SPZ cycles
       - kbth provides safety margin

    4. SPZ blocking: Based on lookup table thresholds
       - Block SPZ when fault current exceeds thermal limits
       - Consider repeated fault cycles
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace
from typing import Any
from uuid import uuid4

from .models import (
    GenerationSourceType,
    LineOvercurrentSettingInput,
    LineOvercurrentSettingResult,
    LineOvercurrentVerdict,
    LocalGenerationDiagnostic,
    SelectivityCriterionResult,
    SensitivityCriterionResult,
    SettingWindow,
    SPZBlockingResult,
    SPZMode,
    ThermalCriterionResult,
)
from .spz_lookup import (
    SPZ_THRESHOLD_TABLE_DEFAULT,
    SPZLookupTable,
    get_spz_blocking_decision,
)


@dataclass
class LineOvercurrentSettingAnalyzer:
    """
    Analyzer for I>> protection settings on MV lines.

    Implements methodology from lecture materials:
    - Selectivity with downstream protection
    - Sensitivity to minimum fault current
    - Thermal capacity of conductor
    - SPZ blocking logic

    NOT-A-SOLVER: Only interprets pre-computed fault currents.

    Attributes:
        spz_lookup_table: Custom SPZ threshold table (uses default if None)
    """

    spz_lookup_table: SPZLookupTable | None = None

    def analyze(
        self,
        input_data: LineOvercurrentSettingInput,
    ) -> LineOvercurrentSettingResult:
        """
        Perform complete I>> setting analysis.

        Args:
            input_data: LineOvercurrentSettingInput with line data and fault currents

        Returns:
            LineOvercurrentSettingResult with all criteria and recommendations
        """
        run_id = str(uuid4())
        trace_steps: list[dict[str, Any]] = []

        # Step 1: Log input data
        trace_steps.append(
            {
                "step": "input_validation",
                "description_pl": "Walidacja danych wejściowych",
                "inputs": {
                    "line_id": input_data.line_id,
                    "line_name": input_data.line_name,
                    "ct_ratio": input_data.ct_ratio,
                    "ik_max_busbars_a": input_data.ik_max_busbars_a,
                    "ik_min_busbars_a": input_data.ik_min_busbars_a,
                    "ik_max_next_protection_a": input_data.ik_max_next_protection_a,
                },
                "outputs": {
                    "validation_passed": True,
                },
            }
        )

        # Step 2: Selectivity criterion
        selectivity = self._check_selectivity(input_data, trace_steps)

        # Step 3: Sensitivity criterion
        sensitivity = self._check_sensitivity(input_data, trace_steps)

        # Step 4: Thermal criterion
        thermal = self._check_thermal(input_data, trace_steps)

        # Step 5: SPZ blocking (if SPZ enabled)
        spz_blocking = None
        if input_data.spz_config.mode != SPZMode.DISABLED:
            spz_blocking = self._check_spz_blocking(input_data, trace_steps)

        # Step 6: Local generation diagnostic (if E-L enabled)
        local_generation = None
        if input_data.local_generation.enabled:
            local_generation = self._check_local_generation(input_data, trace_steps)

        # Step 7: Determine setting window
        setting_window = self._calculate_setting_window(
            selectivity=selectivity,
            sensitivity=sensitivity,
            thermal=thermal,
            trace_steps=trace_steps,
        )

        # Step 7b: Konflikt kryteriów — werdykt CZĄSTKOWY musi mówić prawdę.
        #
        # V12K-188: kryteria selektywności i czułości wyznaczają PRZECIWSTAWNE
        # granice tego samego nastawienia (dół z selektywności, góra z czułości/
        # termiki). Dotąd każde z nich zwracało PASS na podstawie samego faktu, że
        # dane wejściowe są dodatnie — nigdy nie porównywały granic ze sobą. Przy
        # PUSTYM oknie (I_min > I_max), czyli gdy ŻADNA nastawa nie spełnia obu
        # warunków naraz, raport pokazywał „Selektywność: PASS" i „Czułość: PASS"
        # obok werdyktu ogólnego FAIL — projektant nie miał z czego odczytać, które
        # kryteria się wykluczają i o ile. Werdykt ogólny był poprawny (bramka
        # `window_valid`), więc defekt nie fałszował decyzji, ale czynił ją
        # nieczytelną — a to jest dokładnie ta informacja, która prowadzi do zmiany
        # przekroju, nastawy czasowej albo podziału odcinka.
        selectivity, sensitivity, thermal = self._mark_window_conflict(
            selectivity=selectivity,
            sensitivity=sensitivity,
            thermal=thermal,
            setting_window=setting_window,
            trace_steps=trace_steps,
        )

        # Step 8: Calculate overall verdict
        overall_verdict = self._calculate_overall_verdict(
            selectivity=selectivity,
            sensitivity=sensitivity,
            thermal=thermal,
            spz_blocking=spz_blocking,
            local_generation=local_generation,
            setting_window=setting_window,
        )

        # Step 9: Generate recommendations
        recommendations = self._generate_recommendations(
            input_data=input_data,
            selectivity=selectivity,
            sensitivity=sensitivity,
            thermal=thermal,
            spz_blocking=spz_blocking,
            local_generation=local_generation,
            setting_window=setting_window,
        )

        # Step 10: Finalize
        trace_steps.append(
            {
                "step": "finalize",
                "description_pl": "Finalizacja analizy nastaw I>>",
                "inputs": {},
                "outputs": {
                    "overall_verdict": overall_verdict.value,
                    "window_valid": setting_window.window_valid,
                    "recommendations_count": len(recommendations),
                },
            }
        )

        return LineOvercurrentSettingResult(
            run_id=run_id,
            line_id=input_data.line_id,
            line_name=input_data.line_name,
            input_data=input_data.to_dict(),
            selectivity=selectivity,
            sensitivity=sensitivity,
            thermal=thermal,
            spz_blocking=spz_blocking,
            local_generation=local_generation,
            setting_window=setting_window,
            overall_verdict=overall_verdict,
            recommendations_pl=tuple(recommendations),
            trace_steps=tuple(trace_steps),
        )

    def _check_selectivity(
        self,
        input_data: LineOvercurrentSettingInput,
        trace_steps: list[dict[str, Any]],
    ) -> SelectivityCriterionResult:
        """
        Check selectivity criterion.

        Criterion: I_nast >= kb * Ikmax(next_protection) / θi

        This ensures the I>> setting is above the maximum fault current
        at the next downstream protection point (scaled by selectivity factor).
        """
        kb = input_data.kb
        ct_ratio = input_data.ct_ratio
        ik_max_next = input_data.ik_max_next_protection_a

        # Calculate minimum setting (primary side)
        # I_nast_min_primary = kb * Ik_max_next
        i_min_primary = kb * ik_max_next

        # Convert to secondary (relay) side
        # I_nast_min_secondary = I_nast_min_primary / θi
        i_min_secondary = i_min_primary / ct_ratio if ct_ratio > 0 else 0.0

        # Determine verdict
        if i_min_primary > 0 and ik_max_next > 0:
            verdict = LineOvercurrentVerdict.PASS
            notes_pl = (
                f"Selektywność: I_nast >= {kb:.2f} × {ik_max_next/1000:.2f} kA = "
                f"{i_min_primary/1000:.2f} kA (strona pierwotna)"
            )
        else:
            verdict = LineOvercurrentVerdict.ERROR
            notes_pl = "Brak danych o prądzie zwarciowym w punkcie kolejnego zabezpieczenia"

        trace_steps.append(
            {
                "step": "selectivity_criterion",
                "description_pl": "Kryterium selektywności I>>",
                "formula": "I_nast >= kb × Ik_max(next) / θi",
                "inputs": {
                    "kb": kb,
                    "ik_max_next_protection_a": ik_max_next,
                    "ct_ratio": ct_ratio,
                },
                "calculation": {
                    "i_min_primary_a": i_min_primary,
                    "i_min_secondary_a": i_min_secondary,
                },
                "outputs": {
                    "i_nast_min_primary_a": i_min_primary,
                    "i_nast_min_secondary_a": i_min_secondary,
                    "verdict": verdict.value,
                },
            }
        )

        return SelectivityCriterionResult(
            i_min_secondary_a=i_min_secondary,
            i_min_primary_a=i_min_primary,
            ik_max_next_a=ik_max_next,
            kb_used=kb,
            ct_ratio=ct_ratio,
            verdict=verdict,
            notes_pl=notes_pl,
        )

    def _check_sensitivity(
        self,
        input_data: LineOvercurrentSettingInput,
        trace_steps: list[dict[str, Any]],
    ) -> SensitivityCriterionResult:
        """
        Check sensitivity criterion.

        Criterion: Ikmin(busbars) / θi >= kc * I_nast
        Rearranged: I_nast <= Ikmin(busbars) / (kc * θi)

        This ensures reliable trip for minimum fault at the busbars.
        """
        kc = input_data.kc
        ct_ratio = input_data.ct_ratio

        # Use 2-phase minimum if available, otherwise 3-phase minimum
        ik_min = input_data.ik_min_2f_busbars_a or input_data.ik_min_busbars_a

        # Calculate maximum setting (primary side)
        # I_nast_max_primary = Ik_min / kc
        i_max_primary = ik_min / kc if kc > 0 else 0.0

        # Convert to secondary (relay) side
        # I_nast_max_secondary = I_nast_max_primary / θi
        i_max_secondary = i_max_primary / ct_ratio if ct_ratio > 0 else 0.0

        # Determine verdict
        if i_max_primary > 0 and ik_min > 0:
            verdict = LineOvercurrentVerdict.PASS
            notes_pl = (
                f"Czułość: I_nast <= {ik_min/1000:.2f} kA / {kc:.2f} = "
                f"{i_max_primary/1000:.2f} kA (strona pierwotna)"
            )
        else:
            verdict = LineOvercurrentVerdict.ERROR
            notes_pl = "Brak danych o minimalnym prądzie zwarciowym na szynach"

        trace_steps.append(
            {
                "step": "sensitivity_criterion",
                "description_pl": "Kryterium czułości I>>",
                "formula": "I_nast <= Ik_min(busbars) / (kc × θi)",
                "inputs": {
                    "kc": kc,
                    "ik_min_busbars_a": ik_min,
                    "ct_ratio": ct_ratio,
                },
                "calculation": {
                    "i_max_primary_a": i_max_primary,
                    "i_max_secondary_a": i_max_secondary,
                },
                "outputs": {
                    "i_nast_max_primary_a": i_max_primary,
                    "i_nast_max_secondary_a": i_max_secondary,
                    "verdict": verdict.value,
                },
            }
        )

        return SensitivityCriterionResult(
            i_max_secondary_a=i_max_secondary,
            i_max_primary_a=i_max_primary,
            ik_min_busbars_a=ik_min,
            kc_used=kc,
            ct_ratio=ct_ratio,
            verdict=verdict,
            notes_pl=notes_pl,
        )

    def _check_thermal(
        self,
        input_data: LineOvercurrentSettingInput,
        trace_steps: list[dict[str, Any]],
    ) -> ThermalCriterionResult:
        """
        Check thermal criterion.

        Criterion: I_nast <= kbth * Ithdop / θi
        where Ithdop = Ithn / sqrt(tk)

        This ensures the conductor can withstand the fault current
        for the total fault duration (including SPZ cycles).
        """
        kbth = input_data.kbth
        ct_ratio = input_data.ct_ratio

        # Get Ithn from conductor data
        ithn = input_data.conductor.get_ithn()

        # Calculate total fault time (including SPZ cycles)
        tk = input_data.spz_config.get_total_fault_time_s(input_data.t_breaker_s)

        # Calculate permissible thermal current
        # Ithdop = Ithn / sqrt(tk)
        if tk > 0:
            ithdop = ithn / math.sqrt(tk)
        else:
            ithdop = ithn

        # Calculate maximum setting (primary side)
        # I_nast_max_primary = kbth * Ithdop
        i_max_primary = kbth * ithdop

        # Convert to secondary (relay) side
        # I_nast_max_secondary = I_nast_max_primary / θi
        i_max_secondary = i_max_primary / ct_ratio if ct_ratio > 0 else 0.0

        # Determine verdict
        if i_max_primary > 0 and ithn > 0:
            verdict = LineOvercurrentVerdict.PASS
            notes_pl = (
                f"Kryterium cieplne: I_nast <= {kbth:.2f} × {ithn/1000:.2f} kA / √{tk:.2f}s = "
                f"{kbth:.2f} × {ithdop/1000:.2f} kA = {i_max_primary/1000:.2f} kA"
            )
        else:
            verdict = LineOvercurrentVerdict.ERROR
            notes_pl = "Brak danych o wytrzymałości cieplnej przewodu"

        trace_steps.append(
            {
                "step": "thermal_criterion",
                "description_pl": "Kryterium wytrzymałości cieplnej I>>",
                "formula": "I_nast <= kbth × Ithn / (sqrt(tk) × θi)",
                "inputs": {
                    "kbth": kbth,
                    "ithn_a": ithn,
                    "tk_s": tk,
                    "ct_ratio": ct_ratio,
                    "spz_mode": input_data.spz_config.mode.value,
                },
                "calculation": {
                    "sqrt_tk": math.sqrt(tk) if tk > 0 else 0,
                    "ithdop_a": ithdop,
                    "i_max_primary_a": i_max_primary,
                    "i_max_secondary_a": i_max_secondary,
                },
                "outputs": {
                    "i_nast_max_primary_a": i_max_primary,
                    "i_nast_max_secondary_a": i_max_secondary,
                    "verdict": verdict.value,
                },
            }
        )

        return ThermalCriterionResult(
            i_max_secondary_a=i_max_secondary,
            i_max_primary_a=i_max_primary,
            ithn_a=ithn,
            ithdop_a=ithdop,
            tk_s=tk,
            kbth_used=kbth,
            ct_ratio=ct_ratio,
            verdict=verdict,
            notes_pl=notes_pl,
        )

    def _check_spz_blocking(
        self,
        input_data: LineOvercurrentSettingInput,
        trace_steps: list[dict[str, Any]],
    ) -> SPZBlockingResult:
        """
        Check SPZ blocking from I>>.

        Uses lookup table to determine if SPZ should be blocked
        based on fault current at line start and fault duration.
        """
        # Use maximum fault current at busbars as "fault at line start"
        i_fault_start = input_data.ik_max_busbars_a
        tk_single = input_data.spz_config.t_fault_max_s + input_data.t_breaker_s

        # Lookup decision
        lookup_table = self.spz_lookup_table or SPZ_THRESHOLD_TABLE_DEFAULT
        block_spz, reason = get_spz_blocking_decision(
            fault_current_a=i_fault_start,
            fault_time_s=tk_single,
            lookup_table=lookup_table,
        )

        # Get threshold from first matching entry
        i_threshold = 0.0
        for entry in lookup_table.entries:
            if tk_single <= entry.max_fault_time_s and entry.block_spz:
                i_threshold = entry.current_threshold_ka * 1000.0
                break

        # Determine verdict
        if block_spz:
            verdict = LineOvercurrentVerdict.FAIL
            notes_pl = f"SPZ powinno być zablokowane: {reason}"
            blocking_reason = reason
        else:
            verdict = LineOvercurrentVerdict.PASS
            notes_pl = f"SPZ dozwolone: {reason}"
            blocking_reason = None

        trace_steps.append(
            {
                "step": "spz_blocking_check",
                "description_pl": "Analiza blokady SPZ od I>>",
                "inputs": {
                    "i_fault_start_a": i_fault_start,
                    "tk_single_s": tk_single,
                    "spz_mode": input_data.spz_config.mode.value,
                },
                "lookup": {
                    "table_name": lookup_table.name,
                    "threshold_ka": i_threshold / 1000.0,
                },
                "outputs": {
                    "block_spz": block_spz,
                    "reason_pl": reason,
                    "verdict": verdict.value,
                },
            }
        )

        return SPZBlockingResult(
            spz_allowed=not block_spz,
            blocking_reason_pl=blocking_reason,
            i_threshold_a=i_threshold,
            i_fault_start_a=i_fault_start,
            tk_single_s=tk_single,
            verdict=verdict,
            notes_pl=notes_pl,
        )

    def _check_local_generation(
        self,
        input_data: LineOvercurrentSettingInput,
        trace_steps: list[dict[str, Any]],
    ) -> LocalGenerationDiagnostic:
        """
        Check local generation (E-L) mode diagnostics.

        Reports fault current contributions and ZSZ blocking risk.
        """
        el_config = input_data.local_generation

        # Calculate contributions
        ik_el = el_config.ik_contribution_max_a
        ik_system = input_data.ik_max_busbars_a - ik_el
        ik_total = input_data.ik_max_busbars_a

        # Check ZSZ blocking risk
        zsz_risk = False
        zsz_notes = None
        recommendations: list[str] = []

        if el_config.zsz_blocking_risk:
            # E-L contribution might cause ZSZ blocking issues
            if ik_el > 0:
                el_ratio = ik_el / ik_total if ik_total > 0 else 0
                if el_ratio >= 0.3:  # >=30% contribution from E-L
                    zsz_risk = True
                    zsz_notes = (
                        f"Wkład E-L stanowi {el_ratio*100:.1f}% prądu zwarciowego - "
                        f"ryzyko niepożądanej blokady ZSZ"
                    )
                    recommendations.append("Rozważ zastosowanie blokady kierunkowej dla ZSZ")
                    recommendations.append("Sprawdź nastawy ZSZ pod kątem wkładu od E-L")

        # Source-specific recommendations
        if el_config.source_type == GenerationSourceType.INVERTER:
            recommendations.append(
                "Źródło falownikowe - ograniczony wkład do prądów zwarciowych (typowo 1.1-1.5 In)"
            )
        elif el_config.source_type == GenerationSourceType.SYNCHRONOUS:
            recommendations.append("Generator synchroniczny - znaczący wkład do prądów zwarciowych")
            recommendations.append("Uwzględnij wkład E-L w analizie czułości zabezpieczeń")

        # Determine verdict
        if zsz_risk:
            verdict = LineOvercurrentVerdict.MARGINAL
            notes_pl = (
                f"Tryb E-L aktywny: wkład systemu {ik_system/1000:.2f} kA, "
                f"wkład E-L {ik_el/1000:.2f} kA - wykryto ryzyko blokady ZSZ"
            )
        elif ik_el > 0:
            verdict = LineOvercurrentVerdict.PASS
            notes_pl = (
                f"Tryb E-L aktywny: wkład systemu {ik_system/1000:.2f} kA, "
                f"wkład E-L {ik_el/1000:.2f} kA - bez istotnych ryzyk"
            )
        else:
            verdict = LineOvercurrentVerdict.PASS
            notes_pl = "Tryb E-L aktywny, ale brak wkładu od generacji lokalnej"

        trace_steps.append(
            {
                "step": "local_generation_diagnostic",
                "description_pl": "Diagnostyka trybu sieci z generacją lokalną (E-L)",
                "inputs": {
                    "el_mode_active": el_config.enabled,
                    "source_type": el_config.source_type.value if el_config.source_type else None,
                    "ik_el_contribution_a": ik_el,
                    "zsz_blocking_risk_check": el_config.zsz_blocking_risk,
                },
                "calculation": {
                    "ik_system_a": ik_system,
                    "ik_total_a": ik_total,
                    "el_ratio": ik_el / ik_total if ik_total > 0 else 0,
                },
                "outputs": {
                    "zsz_risk": zsz_risk,
                    "recommendations_count": len(recommendations),
                    "verdict": verdict.value,
                },
            }
        )

        return LocalGenerationDiagnostic(
            el_mode_active=el_config.enabled,
            source_type=el_config.source_type,
            ik_system_contribution_a=ik_system,
            ik_el_contribution_a=ik_el,
            ik_total_seen_a=ik_total,
            zsz_blocking_risk=zsz_risk,
            zsz_blocking_notes_pl=zsz_notes,
            recommendations_pl=tuple(recommendations),
            verdict=verdict,
            notes_pl=notes_pl,
        )

    def _calculate_setting_window(
        self,
        selectivity: SelectivityCriterionResult,
        sensitivity: SensitivityCriterionResult,
        thermal: ThermalCriterionResult,
        trace_steps: list[dict[str, Any]],
    ) -> SettingWindow:
        """
        Calculate allowable I>> setting window.

        Window is bounded by:
        - Minimum: selectivity criterion
        - Maximum: min(sensitivity, thermal) criterion
        """
        # Minimum from selectivity
        i_min_secondary = selectivity.i_min_secondary_a
        i_min_primary = selectivity.i_min_primary_a

        # Maximum from sensitivity or thermal (whichever is lower)
        if sensitivity.i_max_primary_a <= thermal.i_max_primary_a:
            i_max_secondary = sensitivity.i_max_secondary_a
            i_max_primary = sensitivity.i_max_primary_a
            limiting_max = "sensitivity"
        else:
            i_max_secondary = thermal.i_max_secondary_a
            i_max_primary = thermal.i_max_primary_a
            limiting_max = "thermal"

        # Check if window is valid
        window_valid = i_max_primary > i_min_primary

        trace_steps.append(
            {
                "step": "setting_window_calculation",
                "description_pl": "Wyznaczenie okna nastaw I>>",
                "inputs": {
                    "selectivity_min_a": i_min_primary,
                    "sensitivity_max_a": sensitivity.i_max_primary_a,
                    "thermal_max_a": thermal.i_max_primary_a,
                },
                "calculation": {
                    "i_min_primary_a": i_min_primary,
                    "i_max_primary_a": i_max_primary,
                    "limiting_max": limiting_max,
                },
                "outputs": {
                    "window_valid": window_valid,
                    "window_width_a": i_max_primary - i_min_primary,
                },
            }
        )

        return SettingWindow(
            i_min_secondary_a=i_min_secondary,
            i_max_secondary_a=i_max_secondary,
            i_min_primary_a=i_min_primary,
            i_max_primary_a=i_max_primary,
            window_valid=window_valid,
            limiting_criterion_min="selectivity",
            limiting_criterion_max=limiting_max,
        )

    def _mark_window_conflict(
        self,
        *,
        selectivity: SelectivityCriterionResult,
        sensitivity: SensitivityCriterionResult,
        thermal: ThermalCriterionResult,
        setting_window: SettingWindow,
        trace_steps: list[dict[str, Any]],
    ) -> tuple[SelectivityCriterionResult, SensitivityCriterionResult, ThermalCriterionResult]:
        """Oznacz kryteria, które wykluczają się nawzajem (puste okno nastaw).

        Zwraca krotkę (selektywność, czułość, termika) — niezmienioną, gdy okno
        jest poprawne. Przy pustym oknie FAIL dostaje kryterium wyznaczające dolną
        granicę (selektywność) oraz to, które wyznaczyło granicę górną; drugie z
        górnych pozostaje bez zmian, bo nie ono ogranicza. Kryterium bez danych
        (ERROR) nie jest nadpisywane — brak danych to inna sytuacja niż konflikt.
        """
        if setting_window.window_valid:
            return selectivity, sensitivity, thermal

        deficit_a = setting_window.i_min_primary_a - setting_window.i_max_primary_a
        conflict_pl = (
            f"Konflikt kryteriów: dolna granica {setting_window.i_min_primary_a / 1000:.2f} kA "
            f"(selektywność) przewyższa górną {setting_window.i_max_primary_a / 1000:.2f} kA "
            f"({'czułość' if setting_window.limiting_criterion_max == 'sensitivity' else 'termika'})"
            f" o {deficit_a / 1000:.2f} kA — żadna nastawa I>> nie spełnia obu warunków."
        )

        def _fail(result: Any) -> Any:
            if result.verdict == LineOvercurrentVerdict.ERROR:
                return result
            return replace(
                result,
                verdict=LineOvercurrentVerdict.FAIL,
                notes_pl=f"{result.notes_pl} {conflict_pl}",
            )

        selectivity = _fail(selectivity)
        if setting_window.limiting_criterion_max == "sensitivity":
            sensitivity = _fail(sensitivity)
        else:
            thermal = _fail(thermal)

        trace_steps.append(
            {
                "step": "setting_window_conflict",
                "description_pl": "Konflikt kryteriów nastawy I>>",
                "inputs": {
                    "i_min_primary_a": setting_window.i_min_primary_a,
                    "i_max_primary_a": setting_window.i_max_primary_a,
                    "limiting_criterion_max": setting_window.limiting_criterion_max,
                },
                "outputs": {
                    "deficit_a": deficit_a,
                    "selectivity_verdict": selectivity.verdict.value,
                    "sensitivity_verdict": sensitivity.verdict.value,
                    "thermal_verdict": thermal.verdict.value,
                    "notes_pl": conflict_pl,
                },
            }
        )
        return selectivity, sensitivity, thermal

    def _calculate_overall_verdict(
        self,
        selectivity: SelectivityCriterionResult,
        sensitivity: SensitivityCriterionResult,
        thermal: ThermalCriterionResult,
        spz_blocking: SPZBlockingResult | None,
        local_generation: LocalGenerationDiagnostic | None,
        setting_window: SettingWindow,
    ) -> LineOvercurrentVerdict:
        """
        Calculate overall verdict for I>> setting analysis.
        """
        verdicts = [
            selectivity.verdict,
            sensitivity.verdict,
            thermal.verdict,
        ]

        if spz_blocking:
            verdicts.append(spz_blocking.verdict)
        if local_generation:
            verdicts.append(local_generation.verdict)

        # Check for errors
        if any(v == LineOvercurrentVerdict.ERROR for v in verdicts):
            return LineOvercurrentVerdict.ERROR

        # Check for failures (including invalid window)
        if any(v == LineOvercurrentVerdict.FAIL for v in verdicts):
            return LineOvercurrentVerdict.FAIL

        if not setting_window.window_valid:
            return LineOvercurrentVerdict.FAIL

        # Check for marginal cases
        if any(v == LineOvercurrentVerdict.MARGINAL for v in verdicts):
            return LineOvercurrentVerdict.MARGINAL

        return LineOvercurrentVerdict.PASS

    def _generate_recommendations(
        self,
        input_data: LineOvercurrentSettingInput,
        selectivity: SelectivityCriterionResult,
        sensitivity: SensitivityCriterionResult,
        thermal: ThermalCriterionResult,
        spz_blocking: SPZBlockingResult | None,
        local_generation: LocalGenerationDiagnostic | None,
        setting_window: SettingWindow,
    ) -> list[str]:
        """
        Generate Polish recommendations based on analysis results.
        """
        recommendations: list[str] = []

        # Window validity
        if not setting_window.window_valid:
            recommendations.append(
                f"Okno nastaw jest sprzeczne (I_min = {setting_window.i_min_primary_a/1000:.2f} kA > "
                f"I_max = {setting_window.i_max_primary_a/1000:.2f} kA)"
            )

            # Suggest fixes based on limiting criteria
            if setting_window.limiting_criterion_max == "sensitivity":
                recommendations.append(
                    "Możliwe rozwiązania: obniż współczynnik kb, zmień przekładnię CT, "
                    "lub przenieś punkt kolejnego zabezpieczenia"
                )
            else:  # thermal
                recommendations.append(
                    "Możliwe rozwiązania: zwiększ przekrój przewodu, skróć czas wyłączenia, "
                    "lub wyłącz SPZ"
                )
        else:
            # Valid window - recommend middle setting
            recommended = setting_window.get_recommended_setting_secondary()
            recommendations.append(
                f"Zalecana nastawa I>>: {recommended:.1f} A (strona wtórna) = "
                f"{recommended * input_data.ct_ratio / 1000:.2f} kA (strona pierwotna)"
            )

        # SPZ recommendations
        if spz_blocking and not spz_blocking.spz_allowed:
            recommendations.append(
                f"SPZ powinno być zablokowane od I>> (próg: {spz_blocking.i_threshold_a/1000:.1f} kA)"
            )

        # E-L recommendations
        if local_generation:
            recommendations.extend(local_generation.recommendations_pl)

        # Coefficient warnings
        if input_data.kb > 1.3:
            recommendations.append(
                f"Współczynnik kb = {input_data.kb:.2f} jest wysoki - rozważ obniżenie do 1.1-1.2"
            )

        if input_data.kc < 1.2:
            recommendations.append(
                f"Współczynnik kc = {input_data.kc:.2f} jest niski - rozważ zwiększenie do 1.5"
            )

        return recommendations
