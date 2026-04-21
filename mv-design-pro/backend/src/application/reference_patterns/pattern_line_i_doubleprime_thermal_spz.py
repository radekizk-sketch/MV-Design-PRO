"""
Reference Pattern A: Dobór I>> dla linii SN — selektywność, czułość, cieplne, SPZ

PATTERN ID: RP-LINE-I2-THERMAL-SPZ
NAME (PL): Dobór I>> dla linii SN: selektywność, czułość, cieplne, SPZ

PURPOSE:
Benchmark reference pattern for validating I>> setting methodology for MV lines.
Consumes FIX-12D analysis results and verifies methodology coherence.

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: This is INTERPRETATION layer. No physics calculations.
  All physics data comes from the FIX-12D analysis (which itself consumes SC solver results).
- WHITE BOX: Full trace of all validation steps.
- DETERMINISM: Same inputs → identical outputs.

METHODOLOGY VALIDATION:
1. Selectivity (I>> selektywność): I_nast >= kb × Ik_max(next) / θi
2. Sensitivity (I>> czułość): I_nast <= Ik_min / (kc × θi)
3. Thermal (kryterium cieplne): I_nast <= kbth × Ithdop / θi, where Ithdop = Ithn / √tk
4. Setting Window: [I_min_sel, min(I_max_sens, I_max_th)]
5. SPZ Blocking: Block SPZ when fault current exceeds thermal thresholds

VERDICT LOGIC:
- ZGODNE: Valid window exists AND all criteria PASS
- GRANICZNE: Valid window exists BUT (narrow window OR SPZ warning)
- NIEZGODNE: Invalid window (I_min > I_max) OR any criterion FAIL

NO CODENAMES IN UI/PROOF.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Import FIX-12D analyzer (no modification to FIX-12D)
from application.analyses.protection.line_overcurrent_setting import (
    ConductorData,
    ConductorMaterial,
    LineOvercurrentSettingAnalyzer,
    LineOvercurrentSettingInput,
    LineOvercurrentSettingResult,
    LineOvercurrentVerdict,
    LocalGenerationConfig,
    SPZConfig,
    SPZMode,
)

from .base import (
    CheckStatus,
    ReferencePatternResult,
    ReferenceVerdict,
    build_check,
    build_trace_step,
    stable_sort_dict,
)

# =============================================================================
# CONSTANTS
# =============================================================================

PATTERN_ID = "RP-LINE-I2-THERMAL-SPZ"
PATTERN_NAME_PL = "Dobór I>> dla linii SN: selektywność, czułość, cieplne, SPZ"

# Narrow window threshold: (I_max - I_min) / I_min < 0.05 (5%)
NARROW_WINDOW_THRESHOLD = 0.05

# Pattern A fixture subdirectory
PATTERN_A_FIXTURES_SUBDIR = "pattern_a_line_i_doubleprime_thermal_spz"


# =============================================================================
# FIXTURE LOADING
# =============================================================================


def get_fixtures_dir() -> Path:
    """Get path to fixtures directory."""
    return Path(__file__).parent / "fixtures"


def get_pattern_a_fixtures_dir() -> Path:
    """Get path to Pattern A specific fixtures directory."""
    return get_fixtures_dir() / PATTERN_A_FIXTURES_SUBDIR


def load_fixture(filename: str) -> dict[str, Any]:
    """
    Load fixture data from JSON file.

    Searches in the following order:
    1. Pattern A specific subfolder (pattern_a_line_i_doubleprime_thermal_spz/)
    2. Root fixtures folder (for backwards compatibility)

    Args:
        filename: Fixture filename (e.g., "case_A_zgodne.json")

    Returns:
        Parsed fixture data as dictionary.

    Raises:
        FileNotFoundError: If fixture file doesn't exist in any location.
    """
    # Try Pattern A subfolder first
    pattern_a_path = get_pattern_a_fixtures_dir() / filename
    if pattern_a_path.exists():
        with open(pattern_a_path, encoding="utf-8") as f:
            return json.load(f)

    # Fall back to root fixtures folder (backwards compatibility)
    root_path = get_fixtures_dir() / filename
    if root_path.exists():
        with open(root_path, encoding="utf-8") as f:
            return json.load(f)

    # If neither exists, raise error with helpful message
    raise FileNotFoundError(
        f"Fixture '{filename}' nie znaleziony. " f"Sprawdzono: {pattern_a_path}, {root_path}"
    )


def fixture_to_input(fixture: dict[str, Any]) -> LineOvercurrentSettingInput:
    """
    Convert fixture dictionary to LineOvercurrentSettingInput.

    Args:
        fixture: Fixture data dictionary

    Returns:
        LineOvercurrentSettingInput instance
    """
    # Build conductor data
    conductor_data = fixture["conductor"]
    conductor = ConductorData(
        material=ConductorMaterial(conductor_data["material"]),
        cross_section_mm2=conductor_data["cross_section_mm2"],
        ithn_a=conductor_data.get("ithn_a"),
        jthn_a_mm2=conductor_data.get("jthn_a_mm2"),
        theta_b_deg=conductor_data.get("theta_b_deg", 40.0),
        theta_k_deg=conductor_data.get("theta_k_deg", 250.0),
    )

    # Build SPZ config
    spz_data = fixture.get("spz_config", {})
    spz_config = SPZConfig(
        mode=SPZMode(spz_data.get("mode", "DISABLED")),
        t_dead_1_s=spz_data.get("t_dead_1_s", 0.5),
        t_dead_2_s=spz_data.get("t_dead_2_s", 15.0),
        t_fault_max_s=spz_data.get("t_fault_max_s", 0.5),
    )

    # Build local generation config (optional)
    lg_data = fixture.get("local_generation", {})
    local_generation = LocalGenerationConfig(
        enabled=lg_data.get("enabled", False),
    )

    return LineOvercurrentSettingInput(
        line_id=fixture["line_id"],
        line_name=fixture["line_name"],
        ct_ratio=fixture["ct_ratio"],
        conductor=conductor,
        spz_config=spz_config,
        local_generation=local_generation,
        ik_max_busbars_a=fixture["ik_max_busbars_a"],
        ik_min_busbars_a=fixture["ik_min_busbars_a"],
        ik_max_next_protection_a=fixture["ik_max_next_protection_a"],
        ik_min_2f_busbars_a=fixture.get("ik_min_2f_busbars_a"),
        t_nast_1_s=fixture.get("t_nast_1_s", 0.5),
        t_nast_2_s=fixture.get("t_nast_2_s", 0.0),
        t_breaker_s=fixture.get("t_breaker_s", 0.05),
        kb=fixture.get("kb", 1.2),
        kc=fixture.get("kc", 1.5),
        kbth=fixture.get("kbth", 0.9),
    )


# =============================================================================
# REFERENCE PATTERN VALIDATOR
# =============================================================================


@dataclass
class LineIDoublePrimeReferencePattern:
    """
    Reference Pattern A: Dobór I>> dla linii SN.

    Validates methodology coherence by:
    1. Running FIX-12D analysis (or accepting pre-computed result)
    2. Extracting key values (tk, Ithdop, I_min, I_max, window)
    3. Building validation checks
    4. Determining verdict (ZGODNE/GRANICZNE/NIEZGODNE)
    5. Recording WHITE-BOX trace

    NOT-A-SOLVER: Only interprets FIX-12D results.
    """

    def validate(
        self,
        input_data: LineOvercurrentSettingInput | None = None,
        analysis_result: LineOvercurrentSettingResult | None = None,
        fixture_file: str | None = None,
    ) -> ReferencePatternResult:
        """
        Run reference pattern validation.

        Args:
            input_data: LineOvercurrentSettingInput (if provided, runs FIX-12D)
            analysis_result: Pre-computed FIX-12D result (if provided, skips analysis)
            fixture_file: Fixture filename to load (if provided, loads and runs)

        Returns:
            ReferencePatternResult with verdict, checks, and trace.

        Note:
            Exactly one of input_data, analysis_result, or fixture_file must be provided.
        """
        trace_steps: list[dict[str, Any]] = []

        # Step 1: Resolve input and run/use analysis
        if fixture_file:
            trace_steps.append(
                build_trace_step(
                    step="load_fixture",
                    description_pl="Wczytanie danych referencyjnych z pliku fixture",
                    inputs={"fixture_file": fixture_file},
                    outputs={"status": "loaded"},
                )
            )
            fixture = load_fixture(fixture_file)
            input_data = fixture_to_input(fixture)

        if analysis_result is None:
            if input_data is None:
                raise ValueError("Musisz podać input_data, analysis_result lub fixture_file")

            trace_steps.append(
                build_trace_step(
                    step="run_analysis",
                    description_pl="Uruchomienie analizy doboru nastaw I>>",
                    inputs={
                        "line_id": input_data.line_id,
                        "line_name": input_data.line_name,
                        "ct_ratio": input_data.ct_ratio,
                        "kb": input_data.kb,
                        "kc": input_data.kc,
                        "kbth": input_data.kbth,
                    },
                )
            )

            analyzer = LineOvercurrentSettingAnalyzer()
            analysis_result = analyzer.analyze(input_data)

            trace_steps.append(
                build_trace_step(
                    step="analysis_completed",
                    description_pl="Analiza doboru nastaw I>> zakończona",
                    inputs={},
                    outputs={
                        "overall_verdict": analysis_result.overall_verdict.value,
                        "window_valid": analysis_result.setting_window.window_valid,
                    },
                )
            )

        # Step 2: Extract key values
        window = analysis_result.setting_window
        thermal = analysis_result.thermal
        selectivity = analysis_result.selectivity
        sensitivity = analysis_result.sensitivity
        spz_blocking = analysis_result.spz_blocking

        # Extract artifacts
        artifacts: dict[str, Any] = {
            "tk_total_s": thermal.tk_s,
            "ithn_a": thermal.ithn_a,
            "ithdop_a": thermal.ithdop_a,
            "i_min_sel_primary_a": selectivity.i_min_primary_a,
            "i_min_sel_secondary_a": selectivity.i_min_secondary_a,
            "i_max_sens_primary_a": sensitivity.i_max_primary_a,
            "i_max_sens_secondary_a": sensitivity.i_max_secondary_a,
            "i_max_th_primary_a": thermal.i_max_primary_a,
            "i_max_th_secondary_a": thermal.i_max_secondary_a,
            "window_i_min_primary_a": window.i_min_primary_a,
            "window_i_max_primary_a": window.i_max_primary_a,
            "window_i_min_secondary_a": window.i_min_secondary_a,
            "window_i_max_secondary_a": window.i_max_secondary_a,
            "window_valid": window.window_valid,
            "limiting_criterion_min": window.limiting_criterion_min,
            "limiting_criterion_max": window.limiting_criterion_max,
            "recommended_setting_secondary_a": window.get_recommended_setting_secondary(),
        }

        trace_steps.append(
            build_trace_step(
                step="extract_values",
                description_pl="Ekstrakcja kluczowych wartości z analizy",
                inputs={"line_id": analysis_result.line_id},
                outputs=stable_sort_dict(artifacts),
            )
        )

        # Step 3: Build checks
        checks: list[dict[str, Any]] = []

        # Check 1: Selectivity
        sel_check = self._build_selectivity_check(selectivity)
        checks.append(sel_check)
        trace_steps.append(
            build_trace_step(
                step="check_selectivity",
                description_pl="Sprawdzenie kryterium selektywności I>>",
                formula=r"I_{nast} \geq k_b \times I''_{k,max}^{(next)} / \theta_i",
                inputs={
                    "kb": selectivity.kb_used,
                    "ik_max_next_a": selectivity.ik_max_next_a,
                    "ct_ratio": selectivity.ct_ratio,
                },
                calculation={
                    "i_min_primary_a": selectivity.i_min_primary_a,
                    "i_min_secondary_a": selectivity.i_min_secondary_a,
                },
                outputs={
                    "verdict": selectivity.verdict.value,
                    "check_status": sel_check["status"],
                },
            )
        )

        # Check 2: Sensitivity
        sens_check = self._build_sensitivity_check(sensitivity)
        checks.append(sens_check)
        trace_steps.append(
            build_trace_step(
                step="check_sensitivity",
                description_pl="Sprawdzenie kryterium czułości I>>",
                formula=r"I_{nast} \leq I''_{k,min} / (k_c \times \theta_i)",
                inputs={
                    "kc": sensitivity.kc_used,
                    "ik_min_busbars_a": sensitivity.ik_min_busbars_a,
                    "ct_ratio": sensitivity.ct_ratio,
                },
                calculation={
                    "i_max_primary_a": sensitivity.i_max_primary_a,
                    "i_max_secondary_a": sensitivity.i_max_secondary_a,
                },
                outputs={
                    "verdict": sensitivity.verdict.value,
                    "check_status": sens_check["status"],
                },
            )
        )

        # Check 3: Thermal
        th_check = self._build_thermal_check(thermal)
        checks.append(th_check)
        trace_steps.append(
            build_trace_step(
                step="check_thermal",
                description_pl="Sprawdzenie kryterium wytrzymałości cieplnej",
                formula=r"I_{nast} \leq k_{bth} \times I_{th,dop} / \theta_i, \quad I_{th,dop} = I_{th,n} / \sqrt{t_k}",
                inputs={
                    "kbth": thermal.kbth_used,
                    "ithn_a": thermal.ithn_a,
                    "tk_s": thermal.tk_s,
                    "ct_ratio": thermal.ct_ratio,
                },
                calculation={
                    "ithdop_a": thermal.ithdop_a,
                    "i_max_primary_a": thermal.i_max_primary_a,
                    "i_max_secondary_a": thermal.i_max_secondary_a,
                },
                outputs={
                    "verdict": thermal.verdict.value,
                    "check_status": th_check["status"],
                },
            )
        )

        # Check 4: Setting window
        window_check = self._build_window_check(window)
        checks.append(window_check)
        trace_steps.append(
            build_trace_step(
                step="check_window",
                description_pl="Sprawdzenie okna nastaw [I_min, I_max]",
                inputs={
                    "i_min_primary_a": window.i_min_primary_a,
                    "i_max_primary_a": window.i_max_primary_a,
                },
                calculation={
                    "window_width_a": window.i_max_primary_a - window.i_min_primary_a,
                    "window_valid": window.window_valid,
                },
                outputs={
                    "check_status": window_check["status"],
                },
            )
        )

        # Check 5: SPZ blocking (if applicable)
        spz_check = self._build_spz_check(spz_blocking)
        checks.append(spz_check)
        if spz_blocking:
            trace_steps.append(
                build_trace_step(
                    step="check_spz",
                    description_pl="Sprawdzenie decyzji blokady SPZ od I>>",
                    inputs={
                        "spz_enabled": True,
                        "i_fault_start_a": spz_blocking.i_fault_start_a,
                        "tk_single_s": spz_blocking.tk_single_s,
                    },
                    outputs={
                        "spz_allowed": spz_blocking.spz_allowed,
                        "verdict": spz_blocking.verdict.value,
                        "check_status": spz_check["status"],
                    },
                )
            )
        else:
            trace_steps.append(
                build_trace_step(
                    step="check_spz",
                    description_pl="SPZ wyłączone — brak analizy blokady",
                    inputs={"spz_enabled": False},
                    outputs={"check_status": "INFO"},
                )
            )

        # Step 4: Sort checks deterministically
        checks_sorted = sorted(checks, key=lambda c: c["name_pl"])

        # Step 5: Determine verdict
        verdict = self._determine_verdict(
            selectivity=selectivity,
            sensitivity=sensitivity,
            thermal=thermal,
            window=window,
            spz_blocking=spz_blocking,
            checks=checks_sorted,
        )

        trace_steps.append(
            build_trace_step(
                step="determine_verdict",
                description_pl="Wyznaczenie werdyktu końcowego wzorca",
                inputs={
                    "selectivity_verdict": selectivity.verdict.value,
                    "sensitivity_verdict": sensitivity.verdict.value,
                    "thermal_verdict": thermal.verdict.value,
                    "window_valid": window.window_valid,
                },
                outputs={
                    "verdict": verdict,
                },
            )
        )

        # Step 6: Build summary
        summary_pl = self._build_summary(verdict, window, artifacts)

        return ReferencePatternResult(
            pattern_id=PATTERN_ID,
            name_pl=PATTERN_NAME_PL,
            verdict=verdict,
            summary_pl=summary_pl,
            checks=tuple(checks_sorted),
            trace=tuple(trace_steps),
            artifacts=stable_sort_dict(artifacts),
        )

    def _build_selectivity_check(
        self,
        selectivity,
    ) -> dict[str, Any]:
        """Build selectivity criterion check."""
        if selectivity.verdict == LineOvercurrentVerdict.PASS:
            status: CheckStatus = "PASS"
            desc = (
                f"Selektywność spełniona: I_nast,min = {selectivity.i_min_primary_a:.1f} A "
                f"(kb={selectivity.kb_used}, Ik_max_next={selectivity.ik_max_next_a:.1f} A)"
            )
        elif selectivity.verdict == LineOvercurrentVerdict.ERROR:
            status = "FAIL"
            desc = "Błąd danych — brak prądu zwarciowego dla następnej zabezpieczenia"
        else:
            status = "FAIL"
            desc = f"Selektywność niespełniona: {selectivity.notes_pl}"

        return build_check(
            name_pl="Selektywność I>>",
            status=status,
            description_pl=desc,
            details={
                "i_min_primary_a": selectivity.i_min_primary_a,
                "i_min_secondary_a": selectivity.i_min_secondary_a,
                "kb": selectivity.kb_used,
                "ik_max_next_a": selectivity.ik_max_next_a,
            },
        )

    def _build_sensitivity_check(
        self,
        sensitivity,
    ) -> dict[str, Any]:
        """Build sensitivity criterion check."""
        if sensitivity.verdict == LineOvercurrentVerdict.PASS:
            status: CheckStatus = "PASS"
            desc = (
                f"Czułość spełniona: I_nast,max = {sensitivity.i_max_primary_a:.1f} A "
                f"(kc={sensitivity.kc_used}, Ik_min={sensitivity.ik_min_busbars_a:.1f} A)"
            )
        elif sensitivity.verdict == LineOvercurrentVerdict.ERROR:
            status = "FAIL"
            desc = "Błąd danych — brak minimalnego prądu zwarciowego"
        else:
            status = "FAIL"
            desc = f"Czułość niespełniona: {sensitivity.notes_pl}"

        return build_check(
            name_pl="Czułość I>>",
            status=status,
            description_pl=desc,
            details={
                "i_max_primary_a": sensitivity.i_max_primary_a,
                "i_max_secondary_a": sensitivity.i_max_secondary_a,
                "kc": sensitivity.kc_used,
                "ik_min_busbars_a": sensitivity.ik_min_busbars_a,
            },
        )

    def _build_thermal_check(
        self,
        thermal,
    ) -> dict[str, Any]:
        """Build thermal criterion check."""
        if thermal.verdict == LineOvercurrentVerdict.PASS:
            status: CheckStatus = "PASS"
            desc = (
                f"Kryterium cieplne spełnione: I_nast,max = {thermal.i_max_primary_a:.1f} A "
                f"(Ithdop={thermal.ithdop_a:.1f} A, tk={thermal.tk_s:.2f} s)"
            )
        elif thermal.verdict == LineOvercurrentVerdict.ERROR:
            status = "FAIL"
            desc = "Błąd danych — brak parametrów przewodu do obliczeń cieplnych"
        else:
            status = "FAIL"
            desc = f"Kryterium cieplne niespełnione: {thermal.notes_pl}"

        return build_check(
            name_pl="Kryterium cieplne",
            status=status,
            description_pl=desc,
            details={
                "i_max_primary_a": thermal.i_max_primary_a,
                "i_max_secondary_a": thermal.i_max_secondary_a,
                "ithn_a": thermal.ithn_a,
                "ithdop_a": thermal.ithdop_a,
                "tk_s": thermal.tk_s,
                "kbth": thermal.kbth_used,
            },
        )

    def _build_window_check(
        self,
        window,
    ) -> dict[str, Any]:
        """Build setting window check."""
        if not window.window_valid:
            status: CheckStatus = "FAIL"
            desc = (
                f"Okno nastaw sprzeczne: I_min ({window.i_min_primary_a:.1f} A) > "
                f"I_max ({window.i_max_primary_a:.1f} A)"
            )
        else:
            # Check if window is narrow
            window_width = window.i_max_primary_a - window.i_min_primary_a
            relative_width = (
                window_width / window.i_min_primary_a if window.i_min_primary_a > 0 else 0
            )

            if relative_width < NARROW_WINDOW_THRESHOLD:
                status = "WARN"
                desc = (
                    f"Okno nastaw wąskie: [{window.i_min_primary_a:.1f}, {window.i_max_primary_a:.1f}] A, "
                    f"szerokość względna = {relative_width*100:.1f}% < {NARROW_WINDOW_THRESHOLD*100}%"
                )
            else:
                status = "PASS"
                desc = (
                    f"Okno nastaw prawidłowe: [{window.i_min_primary_a:.1f}, {window.i_max_primary_a:.1f}] A, "
                    f"zalecana nastawa: {window.get_recommended_setting_secondary():.1f} A (wtórna)"
                )

        return build_check(
            name_pl="Okno nastaw",
            status=status,
            description_pl=desc,
            details={
                "i_min_primary_a": window.i_min_primary_a,
                "i_max_primary_a": window.i_max_primary_a,
                "i_min_secondary_a": window.i_min_secondary_a,
                "i_max_secondary_a": window.i_max_secondary_a,
                "window_valid": window.window_valid,
                "limiting_min": window.limiting_criterion_min,
                "limiting_max": window.limiting_criterion_max,
            },
        )

    def _build_spz_check(
        self,
        spz_blocking,
    ) -> dict[str, Any]:
        """Build SPZ blocking check."""
        if spz_blocking is None:
            return build_check(
                name_pl="SPZ: dozwolone/blokować",
                status="INFO",
                description_pl="SPZ wyłączone — analiza blokady niedostępna",
            )

        if spz_blocking.spz_allowed:
            status: CheckStatus = "PASS"
            desc = (
                f"SPZ dozwolone: prąd zwarciowy {spz_blocking.i_fault_start_a/1000:.1f} kA "
                f"poniżej progu blokady"
            )
        else:
            status = "FAIL"
            desc = (
                f"SPZ zablokowane: {spz_blocking.blocking_reason_pl or 'przekroczono próg cieplny'}"
            )

        return build_check(
            name_pl="SPZ: dozwolone/blokować",
            status=status,
            description_pl=desc,
            details={
                "spz_allowed": spz_blocking.spz_allowed,
                "i_fault_start_a": spz_blocking.i_fault_start_a,
                "i_threshold_a": spz_blocking.i_threshold_a,
                "tk_single_s": spz_blocking.tk_single_s,
            },
        )

    def _determine_verdict(
        self,
        selectivity,
        sensitivity,
        thermal,
        window,
        spz_blocking,
        checks: list[dict[str, Any]],
    ) -> ReferenceVerdict:
        """
        Determine overall verdict based on criteria results.

        Logic:
        - NIEZGODNE: window invalid OR any criterion FAIL
        - GRANICZNE: window valid BUT (narrow OR SPZ warning)
        - ZGODNE: all criteria PASS, window valid and not narrow
        """
        # Check for FAIL conditions
        if not window.window_valid:
            return "NIEZGODNE"

        if selectivity.verdict == LineOvercurrentVerdict.FAIL:
            return "NIEZGODNE"
        if sensitivity.verdict == LineOvercurrentVerdict.FAIL:
            return "NIEZGODNE"
        if thermal.verdict == LineOvercurrentVerdict.FAIL:
            return "NIEZGODNE"

        # Check for ERROR (treat as FAIL)
        if selectivity.verdict == LineOvercurrentVerdict.ERROR:
            return "NIEZGODNE"
        if sensitivity.verdict == LineOvercurrentVerdict.ERROR:
            return "NIEZGODNE"
        if thermal.verdict == LineOvercurrentVerdict.ERROR:
            return "NIEZGODNE"

        # Check for GRANICZNE conditions
        # 1. Narrow window
        window_width = window.i_max_primary_a - window.i_min_primary_a
        relative_width = window_width / window.i_min_primary_a if window.i_min_primary_a > 0 else 0
        if relative_width < NARROW_WINDOW_THRESHOLD:
            return "GRANICZNE"

        # 2. SPZ blocked (warning condition)
        if spz_blocking and not spz_blocking.spz_allowed:
            return "GRANICZNE"

        # 3. Any WARN in checks
        if any(c["status"] == "WARN" for c in checks):
            return "GRANICZNE"

        # All good
        return "ZGODNE"

    def _build_summary(
        self,
        verdict: ReferenceVerdict,
        window,
        artifacts: dict[str, Any],
    ) -> str:
        """Build Polish summary of validation result."""
        if verdict == "ZGODNE":
            return (
                f"Wzorzec ZGODNY. Okno nastaw I>>: [{window.i_min_primary_a:.1f}, "
                f"{window.i_max_primary_a:.1f}] A (pierwotna). "
                f"Zalecana nastawa: {window.get_recommended_setting_secondary():.1f} A (wtórna). "
                f"Wszystkie kryteria (selektywność, czułość, cieplne) spełnione."
            )
        elif verdict == "GRANICZNE":
            return (
                f"Wzorzec GRANICZNY. Okno nastaw I>>: [{window.i_min_primary_a:.1f}, "
                f"{window.i_max_primary_a:.1f}] A (pierwotna). "
                f"Kryteria spełnione z ograniczeniami — wąskie okno lub ostrzeżenie SPZ."
            )
        else:  # NIEZGODNE
            if not window.window_valid:
                return (
                    f"Wzorzec NIEZGODNY. Okno nastaw sprzeczne: I_min ({window.i_min_primary_a:.1f} A) > "
                    f"I_max ({window.i_max_primary_a:.1f} A). "
                    f"Nie można dobrać nastawy I>> spełniającej wszystkie kryteria."
                )
            return (
                "Wzorzec NIEZGODNY. Jedno lub więcej kryteriów niespełnione. "
                "Wymagana weryfikacja parametrów sieci i metodyki doboru."
            )


# =============================================================================
# PUBLIC API
# =============================================================================


def run_pattern_a(
    input_data: LineOvercurrentSettingInput | None = None,
    analysis_result: LineOvercurrentSettingResult | None = None,
    fixture_file: str | None = None,
) -> ReferencePatternResult:
    """
    Run Reference Pattern A validation.

    Convenience function for running the pattern.

    Args:
        input_data: LineOvercurrentSettingInput (runs FIX-12D analysis)
        analysis_result: Pre-computed FIX-12D result
        fixture_file: Fixture filename to load

    Returns:
        ReferencePatternResult with verdict, checks, and trace.
    """
    pattern = LineIDoublePrimeReferencePattern()
    return pattern.validate(
        input_data=input_data,
        analysis_result=analysis_result,
        fixture_file=fixture_file,
    )
