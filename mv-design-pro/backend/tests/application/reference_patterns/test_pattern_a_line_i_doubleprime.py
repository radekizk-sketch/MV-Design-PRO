"""
Tests for Reference Pattern A: Dobór I>> dla linii SN

Tests cover:
- Verdict ZGODNE (valid window, all criteria pass)
- Verdict NIEZGODNE (invalid window, I_min > I_max)
- Verdict GRANICZNE (narrow window or SPZ warning)
- Determinism (2× run → identical result)
- WHITE-BOX trace completeness
- Artifacts correctness

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: Tests verify interpretation, not physics
- WHITE BOX: Tests verify trace generation
- DETERMINISM: Tests verify 2× run → identical result
"""

import json

import pytest
from application.analyses.protection.line_overcurrent_setting import (
    ConductorData,
    ConductorMaterial,
    LineOvercurrentSettingAnalyzer,
    LineOvercurrentSettingInput,
    SPZConfig,
    SPZMode,
)
from application.reference_patterns import (
    # Pattern A
    PATTERN_ID,
    PATTERN_NAME_PL,
    LineIDoublePrimeReferencePattern,
    compare_results_deterministic,
    run_pattern_a,
    # Helpers
    stable_json,
)

# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def valid_input() -> LineOvercurrentSettingInput:
    """
    Valid input producing ZGODNE verdict.

    Based on reference case A:
    - XLPE Al 150mm², CT ratio 80, SPZ single
    - Ik_max=3500A, Ik_min=3000A, Ik_next=1200A
    - kb=1.2, kc=1.5, kbth=0.9
    """
    return LineOvercurrentSettingInput(
        line_id="line-test-zgodne",
        line_name="Linia SN 15kV - test ZGODNE",
        ct_ratio=80.0,
        conductor=ConductorData(
            material=ConductorMaterial.XLPE_AL,
            cross_section_mm2=150.0,
            jthn_a_mm2=94.0,
        ),
        spz_config=SPZConfig(
            mode=SPZMode.SINGLE,
            t_fault_max_s=0.5,
        ),
        ik_max_busbars_a=3500.0,
        ik_min_busbars_a=3000.0,
        ik_max_next_protection_a=1200.0,
        ik_min_2f_busbars_a=2600.0,
        t_breaker_s=0.05,
        kb=1.2,
        kc=1.5,
        kbth=0.9,
    )


@pytest.fixture
def conflicting_input() -> LineOvercurrentSettingInput:
    """
    Input producing NIEZGODNE verdict (I_min > I_max).

    High Ik_max_next pushes minimum up, low Ik_min pushes max down.
    """
    return LineOvercurrentSettingInput(
        line_id="line-test-niezgodne",
        line_name="Linia SN 15kV - test NIEZGODNE",
        ct_ratio=80.0,
        conductor=ConductorData(
            material=ConductorMaterial.XLPE_AL,
            cross_section_mm2=150.0,
            jthn_a_mm2=94.0,
        ),
        spz_config=SPZConfig(
            mode=SPZMode.SINGLE,
            t_fault_max_s=0.5,
        ),
        # High Ik_max_next → high I_min_sel
        ik_max_busbars_a=8000.0,
        ik_min_busbars_a=6000.0,
        ik_max_next_protection_a=6000.0,  # Very high
        ik_min_2f_busbars_a=5200.0,
        t_breaker_s=0.05,
        kb=1.2,
        kc=1.5,
        kbth=0.9,
    )


@pytest.fixture
def borderline_input() -> LineOvercurrentSettingInput:
    """
    Input producing GRANICZNE verdict (narrow window).

    Window exists but is very narrow (< 5%).

    Calculation:
    - I_min_sel = kb * Ik_max_next = 1.2 * 1666.67 = 2000 A
    - I_max_sens = Ik_min_2f / kc = 3100 / 1.5 = 2066.67 A
    - Window width = 66.67 A
    - Relative width = 66.67 / 2000 = 3.3% < 5% → GRANICZNE
    """
    return LineOvercurrentSettingInput(
        line_id="line-test-graniczne",
        line_name="Linia SN 15kV - test GRANICZNE",
        ct_ratio=80.0,
        conductor=ConductorData(
            material=ConductorMaterial.XLPE_AL,
            cross_section_mm2=150.0,
            jthn_a_mm2=94.0,
        ),
        spz_config=SPZConfig(
            mode=SPZMode.SINGLE,
            t_fault_max_s=0.5,
        ),
        # Values chosen to create narrow but valid window
        # I_min_sel = 1.2 * 1666.67 = 2000 A
        # I_max_sens = 3100 / 1.5 = 2066.67 A
        # Width = 66.67 A, relative = 3.3% < 5%
        ik_max_busbars_a=3500.0,
        ik_min_busbars_a=3100.0,
        ik_max_next_protection_a=1666.67,
        ik_min_2f_busbars_a=3100.0,
        t_breaker_s=0.05,
        kb=1.2,
        kc=1.5,
        kbth=0.9,
    )


@pytest.fixture
def pattern() -> LineIDoublePrimeReferencePattern:
    """Pattern A validator instance."""
    return LineIDoublePrimeReferencePattern()


# =============================================================================
# TEST: VERDICT ZGODNE
# =============================================================================


class TestVerdictZgodne:
    """Tests for ZGODNE (compliant) verdict."""

    def test_verdict_ok_from_input(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test ZGODNE verdict from valid input."""
        result = pattern.validate(input_data=valid_input)

        assert result.verdict == "ZGODNE"
        assert result.pattern_id == PATTERN_ID
        assert result.name_pl == PATTERN_NAME_PL

    def test_verdict_ok_from_fixture(self, pattern: LineIDoublePrimeReferencePattern):
        """Test ZGODNE verdict from fixture file."""
        result = pattern.validate(fixture_file="line_i_doubleprime_case_a.json")

        assert result.verdict == "ZGODNE"

    def test_verdict_ok_via_public_api(self, valid_input: LineOvercurrentSettingInput):
        """Test ZGODNE verdict via run_pattern_a function."""
        result = run_pattern_a(input_data=valid_input)

        assert result.verdict == "ZGODNE"

    def test_summary_pl_for_zgodne(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test Polish summary for ZGODNE verdict."""
        result = pattern.validate(input_data=valid_input)

        assert "ZGODNY" in result.summary_pl
        assert "okno nastaw" in result.summary_pl.lower()

    def test_checks_all_pass_for_zgodne(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test all checks PASS for ZGODNE verdict."""
        result = pattern.validate(input_data=valid_input)

        # Find the main criteria checks
        check_names = [c["name_pl"] for c in result.checks]
        assert "Selektywność I>>" in check_names
        assert "Czułość I>>" in check_names
        assert "Kryterium cieplne" in check_names
        assert "Okno nastaw" in check_names

        # All main criteria should be PASS
        for check in result.checks:
            if check["name_pl"] in ["Selektywność I>>", "Czułość I>>", "Kryterium cieplne"]:
                assert check["status"] == "PASS", f"{check['name_pl']} should be PASS"


# =============================================================================
# TEST: VERDICT NIEZGODNE
# =============================================================================


class TestVerdictNiezgodne:
    """Tests for NIEZGODNE (non-compliant) verdict."""

    def test_verdict_conflict_from_input(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        conflicting_input: LineOvercurrentSettingInput,
    ):
        """Test NIEZGODNE verdict from conflicting input."""
        result = pattern.validate(input_data=conflicting_input)

        assert result.verdict == "NIEZGODNE"

    def test_window_invalid_for_niezgodne(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        conflicting_input: LineOvercurrentSettingInput,
    ):
        """Test window is invalid for NIEZGODNE verdict."""
        result = pattern.validate(input_data=conflicting_input)

        assert result.artifacts["window_valid"] is False
        # I_min > I_max
        assert (
            result.artifacts["window_i_min_primary_a"] > result.artifacts["window_i_max_primary_a"]
        )

    def test_summary_pl_for_niezgodne(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        conflicting_input: LineOvercurrentSettingInput,
    ):
        """Test Polish summary for NIEZGODNE verdict."""
        result = pattern.validate(input_data=conflicting_input)

        assert "NIEZGODNY" in result.summary_pl
        assert "sprzeczne" in result.summary_pl.lower()

    def test_window_check_fail_for_niezgodne(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        conflicting_input: LineOvercurrentSettingInput,
    ):
        """Test window check is FAIL for NIEZGODNE verdict."""
        result = pattern.validate(input_data=conflicting_input)

        window_check = next(c for c in result.checks if c["name_pl"] == "Okno nastaw")
        assert window_check["status"] == "FAIL"


# =============================================================================
# TEST: VERDICT GRANICZNE
# =============================================================================


class TestVerdictGraniczne:
    """Tests for GRANICZNE (borderline) verdict."""

    def test_verdict_borderline_from_input(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        borderline_input: LineOvercurrentSettingInput,
    ):
        """Test GRANICZNE verdict from borderline input."""
        result = pattern.validate(input_data=borderline_input)

        assert result.verdict == "GRANICZNE"

    def test_window_valid_but_narrow_for_graniczne(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        borderline_input: LineOvercurrentSettingInput,
    ):
        """Test window is valid but narrow for GRANICZNE verdict."""
        result = pattern.validate(input_data=borderline_input)

        assert result.artifacts["window_valid"] is True

        # Calculate relative width
        i_min = result.artifacts["window_i_min_primary_a"]
        i_max = result.artifacts["window_i_max_primary_a"]
        relative_width = (i_max - i_min) / i_min

        assert relative_width < 0.05, "Window should be narrow (< 5%)"

    def test_summary_pl_for_graniczne(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        borderline_input: LineOvercurrentSettingInput,
    ):
        """Test Polish summary for GRANICZNE verdict."""
        result = pattern.validate(input_data=borderline_input)

        assert "GRANICZNY" in result.summary_pl

    def test_window_check_warn_for_graniczne(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        borderline_input: LineOvercurrentSettingInput,
    ):
        """Test window check is WARN for GRANICZNE verdict."""
        result = pattern.validate(input_data=borderline_input)

        window_check = next(c for c in result.checks if c["name_pl"] == "Okno nastaw")
        assert window_check["status"] == "WARN"


# =============================================================================
# TEST: DETERMINISM
# =============================================================================


class TestDeterminism:
    """Tests for deterministic behavior."""

    def test_identical_results_twice(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test 2× run produces identical results."""
        result1 = pattern.validate(input_data=valid_input)
        result2 = pattern.validate(input_data=valid_input)

        assert compare_results_deterministic(result1, result2)

    def test_stable_json_identical(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test stable_json produces identical output for 2× run."""
        result1 = pattern.validate(input_data=valid_input)
        result2 = pattern.validate(input_data=valid_input)

        json1 = stable_json(result1.to_dict())
        json2 = stable_json(result2.to_dict())

        assert json1 == json2

    def test_trace_deterministic(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test trace is deterministic."""
        result1 = pattern.validate(input_data=valid_input)
        result2 = pattern.validate(input_data=valid_input)

        assert result1.trace == result2.trace

    def test_checks_deterministic(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test checks are deterministic (same order)."""
        result1 = pattern.validate(input_data=valid_input)
        result2 = pattern.validate(input_data=valid_input)

        assert result1.checks == result2.checks

    def test_json_serializable(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test result is JSON serializable."""
        result = pattern.validate(input_data=valid_input)
        data = result.to_dict()

        # Should not raise
        json_str = json.dumps(data, ensure_ascii=False)
        assert len(json_str) > 0

        # Should round-trip
        loaded = json.loads(json_str)
        assert loaded["pattern_id"] == PATTERN_ID
        assert loaded["verdict"] == result.verdict


# =============================================================================
# TEST: WHITE-BOX TRACE
# =============================================================================


class TestWhiteBoxTrace:
    """Tests for WHITE-BOX trace generation."""

    def test_trace_steps_present(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test trace steps are present."""
        result = pattern.validate(input_data=valid_input)

        assert len(result.trace) > 0

    def test_trace_has_required_steps(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test trace covers all required steps."""
        result = pattern.validate(input_data=valid_input)

        step_names = [s["step"] for s in result.trace]

        assert "run_analysis" in step_names
        assert "extract_values" in step_names
        assert "check_selectivity" in step_names
        assert "check_sensitivity" in step_names
        assert "check_thermal" in step_names
        assert "check_window" in step_names
        assert "check_spz" in step_names
        assert "determine_verdict" in step_names

    def test_trace_has_required_keys(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test each trace step has required keys."""
        result = pattern.validate(input_data=valid_input)

        for step in result.trace:
            assert "step" in step
            assert "description_pl" in step
            assert "inputs" in step or "outputs" in step

    def test_trace_has_formulas(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test criterion steps have formulas."""
        result = pattern.validate(input_data=valid_input)

        criteria_steps = ["check_selectivity", "check_sensitivity", "check_thermal"]
        for step in result.trace:
            if step["step"] in criteria_steps:
                assert "formula" in step, f"{step['step']} should have formula"


# =============================================================================
# TEST: ARTIFACTS
# =============================================================================


class TestArtifacts:
    """Tests for artifacts correctness."""

    def test_artifacts_present(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test artifacts dictionary is present."""
        result = pattern.validate(input_data=valid_input)

        assert result.artifacts is not None
        assert len(result.artifacts) > 0

    def test_artifacts_has_key_values(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test artifacts has required keys."""
        result = pattern.validate(input_data=valid_input)

        required_keys = [
            "tk_total_s",
            "ithn_a",
            "ithdop_a",
            "i_min_sel_primary_a",
            "i_max_sens_primary_a",
            "i_max_th_primary_a",
            "window_i_min_primary_a",
            "window_i_max_primary_a",
            "window_valid",
            "recommended_setting_secondary_a",
        ]

        for key in required_keys:
            assert key in result.artifacts, f"Missing artifact: {key}"

    def test_artifacts_values_correct(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test artifact values are correct for reference case."""
        result = pattern.validate(input_data=valid_input)

        # tk = 2 * (0.5 + 0.05) = 1.1 s
        assert result.artifacts["tk_total_s"] == pytest.approx(1.1, rel=0.01)

        # Ithn = 150 * 94 = 14100 A
        assert result.artifacts["ithn_a"] == pytest.approx(14100.0, rel=0.01)

        # I_min_sel = 1.2 * 1200 = 1440 A
        assert result.artifacts["i_min_sel_primary_a"] == pytest.approx(1440.0, rel=0.01)

        # Window should be valid
        assert result.artifacts["window_valid"] is True


# =============================================================================
# TEST: POLISH LABELS
# =============================================================================


class TestPolishLabels:
    """Tests for Polish labels compliance."""

    def test_verdict_description_pl(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test verdict description is in Polish."""
        result = pattern.validate(input_data=valid_input)
        data = result.to_dict()

        assert "verdict_description_pl" in data
        # Should be Polish description for ZGODNE
        assert "spełnione" in data["verdict_description_pl"].lower()

    def test_check_names_pl(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test check names are in Polish."""
        result = pattern.validate(input_data=valid_input)

        for check in result.checks:
            assert "name_pl" in check
            # Names should contain Polish words
            name = check["name_pl"].lower()
            assert any(w in name for w in ["selektywność", "czułość", "cieplne", "okno", "spz"])

    def test_check_status_pl(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test check status_pl is in Polish."""
        result = pattern.validate(input_data=valid_input)

        polish_statuses = ["Spełnione", "Niespełnione", "Ostrzeżenie", "Informacja"]
        for check in result.checks:
            assert "status_pl" in check
            assert check["status_pl"] in polish_statuses

    def test_no_codenames(
        self,
        pattern: LineIDoublePrimeReferencePattern,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test no project codenames appear in output."""
        result = pattern.validate(input_data=valid_input)
        json_str = json.dumps(result.to_dict(), ensure_ascii=False)

        # Forbidden project codenames (not internal module references)
        codenames = ["P7", "P11", "P14", "P17", "P20"]
        for codename in codenames:
            assert codename not in json_str, f"Codename {codename} should not appear"


# =============================================================================
# TEST: FIXTURE LOADING
# =============================================================================


class TestFixtureLoading:
    """Tests for fixture loading."""

    def test_load_fixture_case_a(self):
        """Test loading case A fixture."""
        from application.reference_patterns import load_fixture

        fixture = load_fixture("line_i_doubleprime_case_a.json")

        assert fixture["line_id"] == "line-ref-001"
        assert fixture["ct_ratio"] == 80.0
        assert fixture["conductor"]["material"] == "XLPE_AL"

    def test_fixture_to_input_conversion(self):
        """Test fixture to input conversion."""
        from application.reference_patterns import fixture_to_input, load_fixture

        fixture = load_fixture("line_i_doubleprime_case_a.json")
        input_data = fixture_to_input(fixture)

        assert input_data.line_id == "line-ref-001"
        assert input_data.ct_ratio == 80.0
        assert input_data.conductor.material == ConductorMaterial.XLPE_AL


# =============================================================================
# TEST: EDGE CASES
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases."""

    def test_spz_disabled_info_check(self, pattern: LineIDoublePrimeReferencePattern):
        """Test SPZ check is INFO when SPZ disabled."""
        input_data = LineOvercurrentSettingInput(
            line_id="line-no-spz",
            line_name="Linia bez SPZ",
            ct_ratio=80.0,
            conductor=ConductorData(
                material=ConductorMaterial.XLPE_AL,
                cross_section_mm2=150.0,
                jthn_a_mm2=94.0,
            ),
            spz_config=SPZConfig(mode=SPZMode.DISABLED),
            ik_max_busbars_a=3500.0,
            ik_min_busbars_a=3000.0,
            ik_max_next_protection_a=1200.0,
            kb=1.2,
            kc=1.5,
            kbth=0.9,
        )

        result = pattern.validate(input_data=input_data)

        spz_check = next(c for c in result.checks if "SPZ" in c["name_pl"])
        assert spz_check["status"] == "INFO"

    def test_validates_without_fixture(self, pattern: LineIDoublePrimeReferencePattern):
        """Test validation works without fixture file."""
        input_data = LineOvercurrentSettingInput(
            line_id="line-direct",
            line_name="Linia bezpośrednia",
            ct_ratio=100.0,
            conductor=ConductorData(
                material=ConductorMaterial.COPPER,
                cross_section_mm2=95.0,
                jthn_a_mm2=143.0,
            ),
            ik_max_busbars_a=5000.0,
            ik_min_busbars_a=4000.0,
            ik_max_next_protection_a=2000.0,
        )

        result = pattern.validate(input_data=input_data)

        assert result.verdict in ["ZGODNE", "GRANICZNE", "NIEZGODNE"]

    def test_validates_with_precomputed_result(self, valid_input: LineOvercurrentSettingInput):
        """Test validation with pre-computed analysis result."""
        # First run analysis
        analyzer = LineOvercurrentSettingAnalyzer()
        analysis_result = analyzer.analyze(valid_input)

        # Then validate with pre-computed result
        pattern = LineIDoublePrimeReferencePattern()
        result = pattern.validate(analysis_result=analysis_result)

        assert result.verdict == "ZGODNE"
        # Should skip run_analysis step
        step_names = [s["step"] for s in result.trace]
        assert "run_analysis" not in step_names


# =============================================================================
# TEST: FIXTURE-BASED VERDICTS (CASE A, B, C)
# =============================================================================


class TestFixtureVerdicts:
    """Tests for verdicts from the three reference fixtures."""

    def test_case_A_verdict_zgodne(self, pattern: LineIDoublePrimeReferencePattern):
        """Test ZGODNE verdict from case_A_zgodne.json fixture."""
        result = pattern.validate(fixture_file="case_A_zgodne.json")

        assert result.verdict == "ZGODNE"
        assert result.artifacts["window_valid"] is True

        # Verify window is not narrow (relative width > 5%)
        i_min = result.artifacts["window_i_min_primary_a"]
        i_max = result.artifacts["window_i_max_primary_a"]
        relative_width = (i_max - i_min) / i_min
        assert relative_width > 0.05, "Window should not be narrow for ZGODNE"

    def test_case_B_verdict_niezgodne(self, pattern: LineIDoublePrimeReferencePattern):
        """Test NIEZGODNE verdict from case_B_niezgodne_konflikt.json fixture."""
        result = pattern.validate(fixture_file="case_B_niezgodne_konflikt.json")

        assert result.verdict == "NIEZGODNE"
        assert result.artifacts["window_valid"] is False

        # Verify I_min > I_max (conflict)
        i_min = result.artifacts["window_i_min_primary_a"]
        i_max = result.artifacts["window_i_max_primary_a"]
        assert i_min > i_max, "I_min should be > I_max for NIEZGODNE"

    def test_case_C_verdict_graniczne(self, pattern: LineIDoublePrimeReferencePattern):
        """Test GRANICZNE verdict from case_C_graniczne_waskie_okno.json fixture."""
        result = pattern.validate(fixture_file="case_C_graniczne_waskie_okno.json")

        assert result.verdict == "GRANICZNE"
        assert result.artifacts["window_valid"] is True

        # Verify window is narrow (relative width < 5%)
        i_min = result.artifacts["window_i_min_primary_a"]
        i_max = result.artifacts["window_i_max_primary_a"]
        relative_width = (i_max - i_min) / i_min
        assert relative_width < 0.05, "Window should be narrow for GRANICZNE"


# =============================================================================
# TEST: DETERMINISM WITH FIXTURES
# =============================================================================


class TestDeterminismWithFixtures:
    """Tests for deterministic behavior using fixtures."""

    def test_determinism_case_A(self, pattern: LineIDoublePrimeReferencePattern):
        """Test 2× run with case_A produces identical results."""
        result1 = pattern.validate(fixture_file="case_A_zgodne.json")
        result2 = pattern.validate(fixture_file="case_A_zgodne.json")

        assert compare_results_deterministic(result1, result2)

        # Verify stable JSON is identical
        json1 = stable_json(result1.to_dict())
        json2 = stable_json(result2.to_dict())
        assert json1 == json2

    def test_determinism_case_B(self, pattern: LineIDoublePrimeReferencePattern):
        """Test 2× run with case_B produces identical results."""
        result1 = pattern.validate(fixture_file="case_B_niezgodne_konflikt.json")
        result2 = pattern.validate(fixture_file="case_B_niezgodne_konflikt.json")

        assert compare_results_deterministic(result1, result2)

    def test_determinism_case_C(self, pattern: LineIDoublePrimeReferencePattern):
        """Test 2× run with case_C produces identical results."""
        result1 = pattern.validate(fixture_file="case_C_graniczne_waskie_okno.json")
        result2 = pattern.validate(fixture_file="case_C_graniczne_waskie_okno.json")

        assert compare_results_deterministic(result1, result2)


# =============================================================================
# TEST: TRACE ORDERING
# =============================================================================


class TestTraceOrdering:
    """Tests for deterministic trace/checks/artifacts ordering."""

    def test_trace_ordering_case_A(self, pattern: LineIDoublePrimeReferencePattern):
        """Test trace steps have deterministic order for case_A."""
        result1 = pattern.validate(fixture_file="case_A_zgodne.json")
        result2 = pattern.validate(fixture_file="case_A_zgodne.json")

        # Trace should have identical order
        assert result1.trace == result2.trace

        # Steps should be in expected order
        step_names = [s["step"] for s in result1.trace]
        expected_order = [
            "load_fixture",
            "run_analysis",
            "analysis_completed",
            "extract_values",
            "check_selectivity",
            "check_sensitivity",
            "check_thermal",
            "check_window",
            "check_spz",
            "determine_verdict",
        ]
        assert step_names == expected_order

    def test_checks_ordering_deterministic(self, pattern: LineIDoublePrimeReferencePattern):
        """Test checks are sorted alphabetically by name_pl."""
        result = pattern.validate(fixture_file="case_A_zgodne.json")

        check_names = [c["name_pl"] for c in result.checks]
        assert check_names == sorted(check_names), "Checks should be sorted alphabetically"

    def test_artifacts_keys_sorted(self, pattern: LineIDoublePrimeReferencePattern):
        """Test artifacts dictionary has sorted keys."""
        result = pattern.validate(fixture_file="case_A_zgodne.json")

        artifact_keys = list(result.artifacts.keys())
        assert artifact_keys == sorted(artifact_keys), "Artifact keys should be sorted"


# =============================================================================
# TEST: FIXTURE LOADING FROM SUBDIRECTORY
# =============================================================================


class TestFixtureSubdirectory:
    """Tests for fixture loading from pattern-specific subdirectory."""

    def test_load_case_A_from_subdirectory(self):
        """Test loading case_A fixture from subdirectory."""
        from application.reference_patterns import load_fixture

        fixture = load_fixture("case_A_zgodne.json")
        assert fixture["line_id"] == "line-ref-A-zgodne"
        assert fixture["_expected_verdict"] == "ZGODNE"

    def test_load_case_B_from_subdirectory(self):
        """Test loading case_B fixture from subdirectory."""
        from application.reference_patterns import load_fixture

        fixture = load_fixture("case_B_niezgodne_konflikt.json")
        assert fixture["line_id"] == "line-ref-B-niezgodne"
        assert fixture["_expected_verdict"] == "NIEZGODNE"

    def test_load_case_C_from_subdirectory(self):
        """Test loading case_C fixture from subdirectory."""
        from application.reference_patterns import load_fixture

        fixture = load_fixture("case_C_graniczne_waskie_okno.json")
        assert fixture["line_id"] == "line-ref-C-graniczne"
        assert fixture["_expected_verdict"] == "GRANICZNE"

    def test_backwards_compatibility_with_root_fixture(self):
        """Test loading fixture from root directory (backwards compatibility)."""
        from application.reference_patterns import load_fixture

        # The old fixture in root should still work
        fixture = load_fixture("line_i_doubleprime_case_a.json")
        assert fixture["line_id"] == "line-ref-001"

    def test_fixture_not_found_error(self):
        """Test helpful error message when fixture not found."""
        from application.reference_patterns import load_fixture

        with pytest.raises(FileNotFoundError) as exc_info:
            load_fixture("nonexistent_fixture.json")

        assert "nie znaleziony" in str(exc_info.value)


# =============================================================================
# TEST: CASE-SPECIFIC ARTIFACTS
# =============================================================================


class TestCaseSpecificArtifacts:
    """Tests for case-specific artifact values."""

    def test_case_A_artifacts_correctness(self, pattern: LineIDoublePrimeReferencePattern):
        """Test case A artifacts match expected values."""
        result = pattern.validate(fixture_file="case_A_zgodne.json")

        # tk = 2 * (0.5 + 0.05) = 1.1 s
        assert result.artifacts["tk_total_s"] == pytest.approx(1.1, rel=0.01)

        # Ithn = 150 * 94 = 14100 A
        assert result.artifacts["ithn_a"] == pytest.approx(14100.0, rel=0.01)

        # I_min_sel = 1.2 * 1200 = 1440 A
        assert result.artifacts["i_min_sel_primary_a"] == pytest.approx(1440.0, rel=0.01)

        # I_max_sens = ik_min_2f / 1.5 = 2600 / 1.5 = 1733.33 A
        # Note: FIX-12D uses ik_min_2f_busbars_a (2-phase min) when available
        assert result.artifacts["i_max_sens_primary_a"] == pytest.approx(1733.33, rel=0.01)

    def test_case_B_artifacts_conflict(self, pattern: LineIDoublePrimeReferencePattern):
        """Test case B artifacts show conflict correctly."""
        result = pattern.validate(fixture_file="case_B_niezgodne_konflikt.json")

        # I_min_sel = 1.2 * 6000 = 7200 A
        assert result.artifacts["i_min_sel_primary_a"] == pytest.approx(7200.0, rel=0.01)

        # I_max_sens = ik_min_2f / 1.5 = 5200 / 1.5 = 3466.67 A
        # Note: FIX-12D uses ik_min_2f_busbars_a (2-phase min) when available
        assert result.artifacts["i_max_sens_primary_a"] == pytest.approx(3466.67, rel=0.01)

        # Conflict: I_min > I_max
        assert (
            result.artifacts["window_i_min_primary_a"] > result.artifacts["window_i_max_primary_a"]
        )

    def test_case_C_narrow_window(self, pattern: LineIDoublePrimeReferencePattern):
        """Test case C artifacts show narrow window correctly."""
        result = pattern.validate(fixture_file="case_C_graniczne_waskie_okno.json")

        # I_min_sel = 1.2 * 1666.67 ≈ 2000 A
        assert result.artifacts["i_min_sel_primary_a"] == pytest.approx(2000.0, rel=0.01)

        # I_max_sens = ik_min_2f / 1.5 = 3120 / 1.5 = 2080 A
        # Note: FIX-12D uses ik_min_2f_busbars_a (2-phase min) when available
        assert result.artifacts["i_max_sens_primary_a"] == pytest.approx(2080.0, rel=0.01)

        # Window width ≈ 80 A
        window_width = (
            result.artifacts["window_i_max_primary_a"] - result.artifacts["window_i_min_primary_a"]
        )
        assert window_width == pytest.approx(80.0, rel=0.02)
