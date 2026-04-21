"""
Tests for Line Overcurrent Setting Analysis — FIX-12D

Tests cover:
- Selectivity criterion
- Sensitivity criterion
- Thermal criterion
- SPZ blocking logic
- Local generation (E-L) diagnostics
- Setting window calculation
- Determinism verification
- Polish labels

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: Tests verify interpretation, not physics
- WHITE BOX: Tests verify trace generation
- DETERMINISM: Tests verify 2x run → identical result
"""

import json

import pytest
from application.analyses.protection.line_overcurrent_setting import (
    SPZ_THRESHOLD_TABLE_DEFAULT,
    # Data classes
    ConductorData,
    # Enums
    ConductorMaterial,
    GenerationSourceType,
    # Analyzer
    LineOvercurrentSettingAnalyzer,
    LineOvercurrentSettingInput,
    LineOvercurrentVerdict,
    LocalGenerationConfig,
    SPZConfig,
    # SPZ lookup
    SPZMode,
    get_spz_blocking_decision,
)

# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def standard_conductor() -> ConductorData:
    """Standard XLPE Al 150mm² conductor."""
    return ConductorData(
        material=ConductorMaterial.XLPE_AL,
        cross_section_mm2=150.0,
        jthn_a_mm2=94.0,  # Al standard
    )


@pytest.fixture
def spz_single() -> SPZConfig:
    """SPZ single cycle configuration."""
    return SPZConfig(
        mode=SPZMode.SINGLE,
        t_dead_1_s=0.5,
        t_fault_max_s=0.5,
    )


@pytest.fixture
def spz_disabled() -> SPZConfig:
    """SPZ disabled configuration."""
    return SPZConfig(mode=SPZMode.DISABLED)


@pytest.fixture
def valid_input(
    standard_conductor: ConductorData, spz_single: SPZConfig
) -> LineOvercurrentSettingInput:
    """Valid input with conforming setting window."""
    return LineOvercurrentSettingInput(
        line_id="line-001",
        line_name="Linia SN 15kV Pole A - Pole B",
        ct_ratio=80.0,  # 400/5
        conductor=standard_conductor,
        spz_config=spz_single,
        # Use lower currents that won't trigger SPZ blocking
        # At tk=0.55s, threshold is 4 kA, so use 3.5 kA
        ik_max_busbars_a=3500.0,  # Below 4 kA threshold for SPZ at 0.55s
        ik_min_busbars_a=3000.0,
        ik_max_next_protection_a=1200.0,
        ik_min_2f_busbars_a=2600.0,  # ~0.866 * 3000
        kb=1.2,
        kc=1.5,
        kbth=0.9,
    )


@pytest.fixture
def conflicting_input(
    standard_conductor: ConductorData, spz_single: SPZConfig
) -> LineOvercurrentSettingInput:
    """Input with conflicting (invalid) setting window."""
    return LineOvercurrentSettingInput(
        line_id="line-002",
        line_name="Linia SN 15kV - okno sprzeczne",
        ct_ratio=80.0,
        conductor=standard_conductor,
        spz_config=spz_single,
        # High ik_max_next pushes min up
        ik_max_busbars_a=8000.0,
        ik_min_busbars_a=6000.0,
        ik_max_next_protection_a=6000.0,  # High value
        kb=1.2,
        kc=1.5,
        kbth=0.9,
    )


@pytest.fixture
def el_mode_input(
    standard_conductor: ConductorData, spz_disabled: SPZConfig
) -> LineOvercurrentSettingInput:
    """Input with E-L (local generation) mode enabled."""
    return LineOvercurrentSettingInput(
        line_id="line-003",
        line_name="Linia SN z OZE - tryb E-L",
        ct_ratio=80.0,
        conductor=standard_conductor,
        spz_config=spz_disabled,
        local_generation=LocalGenerationConfig(
            enabled=True,
            source_type=GenerationSourceType.SYNCHRONOUS,
            ik_contribution_max_a=3000.0,  # 3 kA from E-L
            ik_contribution_min_a=1500.0,
            zsz_blocking_risk=True,
        ),
        ik_max_busbars_a=10000.0,  # 10 kA total (7 kA system + 3 kA E-L)
        ik_min_busbars_a=8000.0,
        ik_max_next_protection_a=3000.0,
        kb=1.2,
        kc=1.5,
        kbth=0.9,
    )


@pytest.fixture
def analyzer() -> LineOvercurrentSettingAnalyzer:
    """Standard analyzer instance."""
    return LineOvercurrentSettingAnalyzer()


# =============================================================================
# CONDUCTOR DATA TESTS
# =============================================================================


class TestConductorData:
    """Tests for ConductorData model."""

    def test_get_ithn_from_cross_section(self, standard_conductor: ConductorData):
        """Test Ithn calculation from cross-section and jthn."""
        ithn = standard_conductor.get_ithn()
        # 150 mm² * 94 A/mm² = 14100 A
        assert ithn == pytest.approx(14100.0, rel=0.01)

    def test_get_ithn_direct_value(self):
        """Test Ithn when provided directly."""
        conductor = ConductorData(
            material=ConductorMaterial.XLPE_CU,
            cross_section_mm2=95.0,
            ithn_a=15000.0,  # Provided directly
        )
        assert conductor.get_ithn() == 15000.0

    def test_to_dict_serialization(self, standard_conductor: ConductorData):
        """Test serialization to dictionary."""
        data = standard_conductor.to_dict()
        assert data["material"] == "XLPE_AL"
        assert data["material_pl"] == "Kabel XLPE aluminiowy"
        assert data["cross_section_mm2"] == 150.0
        assert "computed_ithn_a" in data


# =============================================================================
# SPZ CONFIG TESTS
# =============================================================================


class TestSPZConfig:
    """Tests for SPZConfig model."""

    def test_total_fault_time_disabled(self):
        """Test fault time with SPZ disabled."""
        spz = SPZConfig(mode=SPZMode.DISABLED, t_fault_max_s=0.5)
        tk = spz.get_total_fault_time_s(breaker_time_s=0.05)
        # Single trip: 0.5 + 0.05 = 0.55
        assert tk == pytest.approx(0.55, rel=0.01)

    def test_total_fault_time_single(self):
        """Test fault time with single SPZ."""
        spz = SPZConfig(mode=SPZMode.SINGLE, t_fault_max_s=0.5)
        tk = spz.get_total_fault_time_s(breaker_time_s=0.05)
        # 2 cycles: 2 * (0.5 + 0.05) = 1.1
        assert tk == pytest.approx(1.1, rel=0.01)

    def test_total_fault_time_double(self):
        """Test fault time with double SPZ."""
        spz = SPZConfig(mode=SPZMode.DOUBLE, t_fault_max_s=0.5)
        tk = spz.get_total_fault_time_s(breaker_time_s=0.05)
        # 3 cycles: 3 * (0.5 + 0.05) = 1.65
        assert tk == pytest.approx(1.65, rel=0.01)


# =============================================================================
# SPZ LOOKUP TESTS
# =============================================================================


class TestSPZLookup:
    """Tests for SPZ lookup table."""

    def test_default_table_exists(self):
        """Test default SPZ table is defined."""
        assert SPZ_THRESHOLD_TABLE_DEFAULT is not None
        assert len(SPZ_THRESHOLD_TABLE_DEFAULT.entries) > 0

    def test_lookup_blocking(self):
        """Test SPZ blocking decision."""
        # High current, short time - should block
        block, reason = get_spz_blocking_decision(
            fault_current_a=10000.0,  # 10 kA
            fault_time_s=0.25,
        )
        assert block is True
        assert "blokada" in reason.lower()

    def test_lookup_allowed(self):
        """Test SPZ allowed decision."""
        # Low current - should allow
        block, reason = get_spz_blocking_decision(
            fault_current_a=2000.0,  # 2 kA
            fault_time_s=0.5,
        )
        assert block is False
        assert "dozwolone" in reason.lower()

    def test_lookup_stability(self):
        """Test lookup is deterministic (stable)."""
        # Run twice with same input
        result1 = get_spz_blocking_decision(7500.0, 0.55)
        result2 = get_spz_blocking_decision(7500.0, 0.55)
        assert result1 == result2


# =============================================================================
# ANALYZER TESTS - VALID WINDOW
# =============================================================================


class TestAnalyzerValidWindow:
    """Tests for analyzer with valid setting window."""

    def test_analyze_returns_result(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test analyze returns complete result."""
        result = analyzer.analyze(valid_input)

        assert result.run_id is not None
        assert result.line_id == "line-001"
        assert result.line_name == "Linia SN 15kV Pole A - Pole B"

    def test_selectivity_criterion(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test selectivity criterion calculation."""
        result = analyzer.analyze(valid_input)

        # I_min = kb * Ik_max_next = 1.2 * 1200 = 1440 A
        assert result.selectivity.i_min_primary_a == pytest.approx(1440.0, rel=0.01)
        # Secondary = 1440 / 80 = 18 A
        assert result.selectivity.i_min_secondary_a == pytest.approx(18.0, rel=0.01)
        assert result.selectivity.verdict == LineOvercurrentVerdict.PASS

    def test_sensitivity_criterion(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test sensitivity criterion calculation."""
        result = analyzer.analyze(valid_input)

        # Uses 2-phase min: 2600 A
        # I_max = Ik_min / kc = 2600 / 1.5 = 1733.3 A
        assert result.sensitivity.i_max_primary_a == pytest.approx(1733.3, rel=0.01)
        assert result.sensitivity.verdict == LineOvercurrentVerdict.PASS

    def test_thermal_criterion(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test thermal criterion calculation."""
        result = analyzer.analyze(valid_input)

        # Ithn = 150 * 94 = 14100 A
        assert result.thermal.ithn_a == pytest.approx(14100.0, rel=0.01)
        # tk = 2 * (0.5 + 0.05) = 1.1 s (SPZ single)
        assert result.thermal.tk_s == pytest.approx(1.1, rel=0.01)
        # Ithdop = 14100 / sqrt(1.1) = 13442 A
        assert result.thermal.ithdop_a == pytest.approx(13442.0, rel=0.02)
        assert result.thermal.verdict == LineOvercurrentVerdict.PASS

    def test_setting_window_valid(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test setting window is valid."""
        result = analyzer.analyze(valid_input)

        assert result.setting_window.window_valid is True
        # Min from selectivity: 1440 A
        assert result.setting_window.i_min_primary_a == pytest.approx(1440.0, rel=0.01)
        # Max from sensitivity (lower than thermal): ~1733 A
        assert result.setting_window.i_max_primary_a > result.setting_window.i_min_primary_a

    def test_overall_verdict_pass(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test overall verdict is PASS."""
        result = analyzer.analyze(valid_input)

        assert result.overall_verdict == LineOvercurrentVerdict.PASS

    def test_recommendations_generated(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test recommendations are generated."""
        result = analyzer.analyze(valid_input)

        assert len(result.recommendations_pl) > 0
        # Should recommend a setting
        assert any("Zalecana nastawa" in r for r in result.recommendations_pl)


# =============================================================================
# ANALYZER TESTS - CONFLICTING WINDOW
# =============================================================================


class TestAnalyzerConflictingWindow:
    """Tests for analyzer with conflicting setting window."""

    def test_setting_window_invalid(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        conflicting_input: LineOvercurrentSettingInput,
    ):
        """Test setting window is invalid (conflicting)."""
        result = analyzer.analyze(conflicting_input)

        assert result.setting_window.window_valid is False
        # Min > Max indicates conflict
        assert result.setting_window.i_min_primary_a > result.setting_window.i_max_primary_a

    def test_overall_verdict_fail(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        conflicting_input: LineOvercurrentSettingInput,
    ):
        """Test overall verdict is FAIL for conflicting window."""
        result = analyzer.analyze(conflicting_input)

        assert result.overall_verdict == LineOvercurrentVerdict.FAIL

    def test_recommendations_for_conflict(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        conflicting_input: LineOvercurrentSettingInput,
    ):
        """Test recommendations explain conflict."""
        result = analyzer.analyze(conflicting_input)

        # Should mention conflict
        assert any("sprzeczne" in r.lower() for r in result.recommendations_pl)


# =============================================================================
# ANALYZER TESTS - SPZ BLOCKING
# =============================================================================


class TestAnalyzerSPZBlocking:
    """Tests for SPZ blocking analysis."""

    def test_spz_blocking_check_present(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test SPZ blocking check is present when SPZ enabled."""
        result = analyzer.analyze(valid_input)

        assert result.spz_blocking is not None

    def test_spz_blocking_absent_when_disabled(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        standard_conductor: ConductorData,
    ):
        """Test SPZ blocking check is absent when SPZ disabled."""
        input_data = LineOvercurrentSettingInput(
            line_id="line-004",
            line_name="Linia bez SPZ",
            ct_ratio=80.0,
            conductor=standard_conductor,
            spz_config=SPZConfig(mode=SPZMode.DISABLED),
            ik_max_busbars_a=10000.0,
            ik_min_busbars_a=8000.0,
            ik_max_next_protection_a=4000.0,
        )
        result = analyzer.analyze(input_data)

        assert result.spz_blocking is None

    def test_spz_blocking_high_current(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        standard_conductor: ConductorData,
    ):
        """Test SPZ blocking for high fault current."""
        input_data = LineOvercurrentSettingInput(
            line_id="line-005",
            line_name="Linia z wysokim prądem zwarciowym",
            ct_ratio=80.0,
            conductor=standard_conductor,
            spz_config=SPZConfig(mode=SPZMode.SINGLE, t_fault_max_s=0.5),
            ik_max_busbars_a=20000.0,  # 20 kA - high
            ik_min_busbars_a=15000.0,
            ik_max_next_protection_a=5000.0,
        )
        result = analyzer.analyze(input_data)

        assert result.spz_blocking is not None
        # High current should trigger blocking
        assert result.spz_blocking.spz_allowed is False
        assert result.spz_blocking.verdict == LineOvercurrentVerdict.FAIL


# =============================================================================
# ANALYZER TESTS - E-L MODE
# =============================================================================


class TestAnalyzerELMode:
    """Tests for E-L (local generation) mode diagnostics."""

    def test_el_diagnostic_present(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        el_mode_input: LineOvercurrentSettingInput,
    ):
        """Test E-L diagnostic is present when enabled."""
        result = analyzer.analyze(el_mode_input)

        assert result.local_generation is not None
        assert result.local_generation.el_mode_active is True

    def test_el_contributions_calculated(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        el_mode_input: LineOvercurrentSettingInput,
    ):
        """Test E-L contributions are calculated."""
        result = analyzer.analyze(el_mode_input)

        lg = result.local_generation
        assert lg.ik_el_contribution_a == 3000.0
        # System = Total - E-L = 10000 - 3000 = 7000 A
        assert lg.ik_system_contribution_a == pytest.approx(7000.0, rel=0.01)
        assert lg.ik_total_seen_a == 10000.0

    def test_zsz_blocking_risk(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        el_mode_input: LineOvercurrentSettingInput,
    ):
        """Test ZSZ blocking risk detection."""
        result = analyzer.analyze(el_mode_input)

        lg = result.local_generation
        # E-L ratio = 3000 / 10000 = 0.3 = 30% - at threshold
        assert lg.zsz_blocking_risk is True
        assert lg.zsz_blocking_notes_pl is not None

    def test_el_recommendations(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        el_mode_input: LineOvercurrentSettingInput,
    ):
        """Test E-L mode recommendations."""
        result = analyzer.analyze(el_mode_input)

        lg = result.local_generation
        assert len(lg.recommendations_pl) > 0
        # Synchronous generator should have specific recommendation
        assert any("synchroniczny" in r.lower() for r in lg.recommendations_pl)


# =============================================================================
# DETERMINISM TESTS
# =============================================================================


class TestDeterminism:
    """Tests for deterministic behavior."""

    def test_identical_results_twice(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test 2x run produces identical results (except run_id)."""
        result1 = analyzer.analyze(valid_input)
        result2 = analyzer.analyze(valid_input)

        # Results should match (excluding run_id and created_at)
        dict1 = result1.to_dict()
        dict2 = result2.to_dict()

        # Remove non-deterministic fields
        del dict1["run_id"]
        del dict1["created_at"]
        del dict2["run_id"]
        del dict2["created_at"]

        assert dict1 == dict2

    def test_trace_deterministic(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test trace is deterministic."""
        result1 = analyzer.analyze(valid_input)
        result2 = analyzer.analyze(valid_input)

        # Trace should be identical
        assert result1.trace_steps == result2.trace_steps

    def test_json_serializable(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test result is JSON serializable."""
        result = analyzer.analyze(valid_input)
        data = result.to_dict()

        # Should not raise
        json_str = json.dumps(data, ensure_ascii=False)
        assert len(json_str) > 0

        # Should round-trip
        loaded = json.loads(json_str)
        assert loaded["line_id"] == "line-001"


# =============================================================================
# WHITE BOX TRACE TESTS
# =============================================================================


class TestWhiteBoxTrace:
    """Tests for white-box trace generation."""

    def test_trace_steps_present(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test trace steps are present."""
        result = analyzer.analyze(valid_input)

        assert len(result.trace_steps) > 0

    def test_trace_has_required_keys(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test each trace step has required keys."""
        result = analyzer.analyze(valid_input)

        for step in result.trace_steps:
            assert "step" in step
            assert "description_pl" in step
            assert "inputs" in step
            assert "outputs" in step

    def test_trace_covers_all_criteria(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test trace covers all analysis criteria."""
        result = analyzer.analyze(valid_input)

        step_names = [s["step"] for s in result.trace_steps]

        assert "selectivity_criterion" in step_names
        assert "sensitivity_criterion" in step_names
        assert "thermal_criterion" in step_names
        assert "setting_window_calculation" in step_names


# =============================================================================
# POLISH LABELS TESTS
# =============================================================================


class TestPolishLabels:
    """Tests for Polish labels compliance."""

    def test_verdict_labels_pl(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test verdict labels are in Polish."""
        result = analyzer.analyze(valid_input)
        data = result.to_dict()

        assert data["overall_verdict_pl"] in ["Zgodne", "Graniczne", "Niezgodne", "Błąd analizy"]

    def test_criterion_labels_pl(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test criterion labels are in Polish."""
        result = analyzer.analyze(valid_input)
        data = result.to_dict()

        criteria = data["criteria_results"]
        assert criteria["selectivity"]["criterion_pl"] == "Selektywność I>>"
        assert criteria["sensitivity"]["criterion_pl"] == "Czułość I>>"
        assert criteria["thermal"]["criterion_pl"] == "Wytrzymałość cieplna"

    def test_notes_in_polish(
        self,
        analyzer: LineOvercurrentSettingAnalyzer,
        valid_input: LineOvercurrentSettingInput,
    ):
        """Test notes are in Polish."""
        result = analyzer.analyze(valid_input)

        # Check selectivity notes
        assert result.selectivity.notes_pl is not None
        # Should contain Polish words
        assert any(
            w in result.selectivity.notes_pl.lower()
            for w in ["selektywność", "strona", "pierwotna"]
        )


# =============================================================================
# EDGE CASES
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases."""

    def test_zero_ct_ratio(self, standard_conductor: ConductorData):
        """Test handling of zero CT ratio."""
        input_data = LineOvercurrentSettingInput(
            line_id="line-zero-ct",
            line_name="Test CT ratio zero",
            ct_ratio=0.0,  # Invalid
            conductor=standard_conductor,
            ik_max_busbars_a=10000.0,
            ik_min_busbars_a=8000.0,
            ik_max_next_protection_a=4000.0,
        )

        analyzer = LineOvercurrentSettingAnalyzer()
        result = analyzer.analyze(input_data)

        # Should handle gracefully
        assert result.selectivity.i_min_secondary_a == 0.0

    def test_zero_fault_currents(self, standard_conductor: ConductorData):
        """Test handling of zero fault currents."""
        input_data = LineOvercurrentSettingInput(
            line_id="line-zero-ik",
            line_name="Test zero Ik",
            ct_ratio=80.0,
            conductor=standard_conductor,
            ik_max_busbars_a=0.0,  # Zero
            ik_min_busbars_a=0.0,  # Zero
            ik_max_next_protection_a=0.0,  # Zero
        )

        analyzer = LineOvercurrentSettingAnalyzer()
        result = analyzer.analyze(input_data)

        # Should mark as error
        assert result.selectivity.verdict == LineOvercurrentVerdict.ERROR
        assert result.sensitivity.verdict == LineOvercurrentVerdict.ERROR

    def test_very_high_kb(self, standard_conductor: ConductorData, spz_disabled: SPZConfig):
        """Test warning for very high kb coefficient."""
        input_data = LineOvercurrentSettingInput(
            line_id="line-high-kb",
            line_name="Test high kb",
            ct_ratio=80.0,
            conductor=standard_conductor,
            spz_config=spz_disabled,
            ik_max_busbars_a=10000.0,
            ik_min_busbars_a=8000.0,
            ik_max_next_protection_a=4000.0,
            kb=1.5,  # High value
        )

        analyzer = LineOvercurrentSettingAnalyzer()
        result = analyzer.analyze(input_data)

        # Should have warning about high kb
        assert any("kb" in r.lower() and "wysoki" in r.lower() for r in result.recommendations_pl)


# =============================================================================
# INTEGRATION WITH FIX-12 CHECKS
# =============================================================================


class TestFix12Integration:
    """Tests for FIX-12 integration check types."""

    def test_instantaneous_selectivity_check_import(self):
        """Test InstantaneousSelectivityCheck can be imported."""
        from domain.protection_device import InstantaneousSelectivityCheck

        assert InstantaneousSelectivityCheck is not None

    def test_instantaneous_sensitivity_check_import(self):
        """Test InstantaneousSensitivityCheck can be imported."""
        from domain.protection_device import InstantaneousSensitivityCheck

        assert InstantaneousSensitivityCheck is not None

    def test_instantaneous_thermal_check_import(self):
        """Test InstantaneousThermalCheck can be imported."""
        from domain.protection_device import InstantaneousThermalCheck

        assert InstantaneousThermalCheck is not None

    def test_spz_from_instantaneous_check_import(self):
        """Test SPZFromInstantaneousCheck can be imported."""
        from domain.protection_device import SPZFromInstantaneousCheck

        assert SPZFromInstantaneousCheck is not None

    def test_check_serialization(self):
        """Test check types serialize correctly."""
        from domain.protection_device import (
            CoordinationVerdict,
            InstantaneousSelectivityCheck,
        )

        check = InstantaneousSelectivityCheck(
            line_id="line-001",
            i_setting_a=6000.0,
            i_min_required_a=5400.0,
            ik_max_next_a=4500.0,
            kb_used=1.2,
            ct_ratio=80.0,
            verdict=CoordinationVerdict.PASS,
            notes_pl="Selektywność prawidłowa",
        )

        data = check.to_dict()
        assert data["check_type"] == "instantaneous_selectivity"
        assert data["check_type_pl"] == "Selektywność I>>"
        assert data["verdict"] == "PASS"
        assert data["verdict_pl"] == "Prawidłowa"
