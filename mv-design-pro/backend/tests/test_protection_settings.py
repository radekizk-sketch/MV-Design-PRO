"""
Tests for Protection Settings Engine — Dobor nastaw zabezpieczen nadpradowych I>/I>>

Tests cover:
- ProtectionSettingsEngine.calculate() with valid input
- I> delayed setting calculation (sensitivity check)
- I>> instantaneous setting (selectivity, thermal, sensitivity conditions)
- Thermal withstand check
- SPZ analysis
- Edge cases: zero load current, very high fault currents
- Different conductor materials (Cu, Al, AlFe)
- WHITE BOX trace presence
"""

from __future__ import annotations

import math

import pytest
from application.protection_settings.engine import (
    THERMAL_DENSITY,
    DelayedSettings,
    InstantaneousSettings,
    ProtectionSettingsEngine,
    ProtectionSettingsInput,
    ProtectionSettingsResult,
    SPZAnalysisResult,
    ThermalWithstandResult,
)

# =============================================================================
# Fixtures
# =============================================================================


def _make_input(**overrides) -> ProtectionSettingsInput:
    """Create a ProtectionSettingsInput with reasonable MV network defaults.

    Represents a typical 15 kV line: YAKY 3x120mm2 Al, 5 km,
    Ik3max(beginning)=8000A, Ik3min(beginning)=5000A,
    Ik3max(end)=4000A, Ik3min(end)=2500A,
    Ik2min(end)=2000A, I_load_max=200A.
    """
    defaults = {
        "line_id": "L-001",
        "line_name": "Linia SN nr 1",
        "cross_section_mm2": 120.0,
        "conductor_material": "Al",
        "length_km": 5.0,
        "i_nominal_a": 300.0,
        "ik3_max_beginning_a": 8000.0,
        "ik3_min_beginning_a": 5000.0,
        "ik3_max_end_a": 4000.0,
        "ik3_min_end_a": 2500.0,
        "ik2_min_end_a": 2000.0,
        "ik_max_next_bus_a": 3000.0,
        "i_load_max_a": 200.0,
        "delta_t_s": 0.3,
        "k_b": 1.2,
        "k_bth": 1.1,
        "t_upstream_s": 0.0,
        "spz_enabled": True,
        "spz_pause_s": 0.5,
    }
    defaults.update(overrides)
    return ProtectionSettingsInput(**defaults)


# =============================================================================
# Test: ProtectionSettingsEngine.calculate() with valid input
# =============================================================================


class TestProtectionSettingsEngineCalculate:
    """Test the top-level calculate() method."""

    def test_calculate_returns_result(self):
        inp = _make_input()
        result = ProtectionSettingsEngine.calculate(inp)
        assert isinstance(result, ProtectionSettingsResult)
        assert result.line_id == "L-001"
        assert result.line_name == "Linia SN nr 1"

    def test_calculate_has_all_subresults(self):
        inp = _make_input()
        result = ProtectionSettingsEngine.calculate(inp)
        assert isinstance(result.delayed, DelayedSettings)
        assert isinstance(result.instantaneous, InstantaneousSettings)
        assert isinstance(result.thermal, ThermalWithstandResult)
        assert isinstance(result.spz, SPZAnalysisResult)

    def test_calculate_valid_input_overall_valid(self):
        """With reasonable default values, I> delayed setting should be valid."""
        inp = _make_input()
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.delayed.is_valid is True
        assert isinstance(result.overall_valid, bool)

    def test_calculate_to_dict_serializable(self):
        """to_dict() should return a JSON-compatible dictionary."""
        inp = _make_input()
        result = ProtectionSettingsEngine.calculate(inp)
        d = result.to_dict()
        assert isinstance(d, dict)
        assert d["line_id"] == "L-001"
        assert "delayed" in d
        assert "instantaneous" in d
        assert "thermal" in d
        assert "spz" in d
        assert "overall_valid" in d
        assert "summary_notes" in d

    def test_calculate_to_dict_nested_keys(self):
        """Nested result dicts should contain the expected keys."""
        inp = _make_input()
        d = ProtectionSettingsEngine.calculate(inp).to_dict()
        delayed = d["delayed"]
        assert "i_setting_a" in delayed
        assert "t_setting_s" in delayed
        assert "sensitivity_ratio" in delayed
        assert "is_valid" in delayed
        assert "trace" in delayed

    def test_calculate_deterministic(self):
        """Same input must produce identical output (determinism)."""
        inp = _make_input()
        r1 = ProtectionSettingsEngine.calculate(inp)
        r2 = ProtectionSettingsEngine.calculate(inp)
        assert r1.to_dict() == r2.to_dict()


# =============================================================================
# Test: I> Delayed Setting Calculation
# =============================================================================


class TestDelayedSettings:
    """Test the I> (delayed/time-graded) protection setting calculation."""

    def test_i_delayed_equals_kb_times_iload(self):
        """I> = k_b * I_load_max = 1.2 * 200 = 240 A."""
        inp = _make_input(k_b=1.2, i_load_max_a=200.0)
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.delayed.i_setting_a == pytest.approx(240.0, abs=0.1)

    def test_time_grading_default(self):
        """t> = t_upstream + delta_t = 0.0 + 0.3 = 0.3 s."""
        inp = _make_input(t_upstream_s=0.0, delta_t_s=0.3)
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.delayed.t_setting_s == pytest.approx(0.3, abs=0.01)

    def test_time_grading_with_upstream(self):
        """t> = t_upstream + delta_t = 0.6 + 0.3 = 0.9 s."""
        inp = _make_input(t_upstream_s=0.6, delta_t_s=0.3)
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.delayed.t_setting_s == pytest.approx(0.9, abs=0.01)

    def test_delayed_sensitivity_ratio(self):
        """Sensitivity k_cz = I_k2_min_end / I_setting."""
        inp = _make_input(ik2_min_end_a=2000.0, k_b=1.2, i_load_max_a=200.0)
        result = ProtectionSettingsEngine.calculate(inp)
        # I_setting = 1.2 * 200 = 240
        # k_cz = 2000 / 240 = 8.33
        expected_ratio = round(2000.0 / 240.0, 2)
        assert result.delayed.sensitivity_ratio == pytest.approx(expected_ratio, abs=0.01)

    def test_delayed_sensitivity_passes(self):
        """With high fault current, sensitivity check should pass (k_cz >= 1.5)."""
        inp = _make_input(ik2_min_end_a=2000.0, i_load_max_a=200.0)
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.delayed.sensitivity_ratio >= 1.5
        assert result.delayed.is_valid is True

    def test_delayed_sensitivity_fails(self):
        """With very low fault current, sensitivity check should fail."""
        inp = _make_input(
            ik2_min_end_a=300.0,  # Very low
            i_load_max_a=200.0,
            k_b=1.2,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        # I_setting = 240, k_cz = 300/240 = 1.25 < 1.5
        assert result.delayed.sensitivity_ratio < 1.5
        assert result.delayed.is_valid is False
        assert len(result.delayed.validation_notes) > 0

    def test_delayed_exceeds_nominal_current_note(self):
        """When I> > I_nominal, a warning note should be added."""
        inp = _make_input(
            i_load_max_a=300.0,
            i_nominal_a=300.0,
            k_b=1.2,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        # I_setting = 1.2 * 300 = 360 > 300
        note_found = any("przekracza" in n for n in result.delayed.validation_notes)
        assert note_found

    def test_delayed_trace_has_steps(self):
        """WHITE BOX: delayed calculation should produce trace steps."""
        inp = _make_input()
        result = ProtectionSettingsEngine.calculate(inp)
        assert len(result.delayed.trace) >= 3  # setting, time grading, sensitivity

    def test_delayed_trace_contains_formula_and_result(self):
        """Each trace step should contain formula and result fields."""
        inp = _make_input()
        result = ProtectionSettingsEngine.calculate(inp)
        for step in result.delayed.trace:
            assert "step" in step
            assert "result" in step

    def test_delayed_k_b_stored(self):
        """The k_b value used should be stored in the result."""
        inp = _make_input(k_b=1.5)
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.delayed.k_b == 1.5

    def test_delayed_i_load_max_stored(self):
        """The i_load_max_a value should be stored in the result."""
        inp = _make_input(i_load_max_a=180.0)
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.delayed.i_load_max_a == 180.0


# =============================================================================
# Test: I>> Instantaneous Setting Calculation
# =============================================================================


class TestInstantaneousSettings:
    """Test the I>> (instantaneous) protection setting calculation."""

    def test_selectivity_condition(self):
        """I_min_selectivity = k_b * I_k_max_next_bus."""
        inp = _make_input(k_b=1.2, ik_max_next_bus_a=3000.0)
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.instantaneous.i_min_selectivity_a == pytest.approx(3600.0, abs=0.1)

    def test_thermal_condition_formula(self):
        """I_max_thermal = (s * j_thn / sqrt(t_fault)) / k_bth."""
        inp = _make_input(cross_section_mm2=120.0, conductor_material="Al", k_bth=1.1)
        result = ProtectionSettingsEngine.calculate(inp)
        j_thn = THERMAL_DENSITY["Al"]
        t_fault_inst = 0.05
        i_th_dop = 120.0 * j_thn / math.sqrt(t_fault_inst)
        expected_max_thermal = i_th_dop / 1.1
        assert result.instantaneous.i_max_thermal_a == pytest.approx(expected_max_thermal, rel=0.01)

    def test_sensitivity_condition(self):
        """I_max_sensitivity = I_k3_min_beginning / k_b."""
        inp = _make_input(k_b=1.2, ik3_min_beginning_a=5000.0)
        result = ProtectionSettingsEngine.calculate(inp)
        expected = round(5000.0 / 1.2, 1)
        assert result.instantaneous.i_max_sensitivity_a == pytest.approx(expected, rel=0.01)

    def test_valid_range_exists(self):
        """With low next-bus current and high beginning current, valid range exists."""
        inp = _make_input(
            ik_max_next_bus_a=1000.0,
            ik3_min_beginning_a=10000.0,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.instantaneous.range_valid is True
        assert result.instantaneous.is_valid is True

    def test_no_valid_range(self):
        """When selectivity minimum exceeds sensitivity maximum, no valid range."""
        inp = _make_input(
            ik_max_next_bus_a=10000.0,  # Very high => high i_min_sel
            ik3_min_beginning_a=5000.0,  # Low => low i_max_sens
            k_b=1.2,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        # i_min_sel = 12000, i_max_sens = 5000/1.2 = 4166.7
        assert result.instantaneous.range_valid is False
        assert result.instantaneous.is_valid is False
        assert len(result.instantaneous.validation_notes) > 0

    def test_setting_in_valid_range(self):
        """When range is valid, setting should be between min and max."""
        inp = _make_input()
        result = ProtectionSettingsEngine.calculate(inp)
        if result.instantaneous.range_valid:
            upper = min(
                result.instantaneous.i_max_thermal_a,
                result.instantaneous.i_max_sensitivity_a,
            )
            assert (
                result.instantaneous.i_min_selectivity_a
                <= result.instantaneous.i_setting_a
                <= upper
            )

    def test_setting_is_midpoint_of_valid_range(self):
        """When range is valid, setting should be the midpoint."""
        inp = _make_input()
        result = ProtectionSettingsEngine.calculate(inp)
        if result.instantaneous.range_valid:
            upper = min(
                result.instantaneous.i_max_thermal_a,
                result.instantaneous.i_max_sensitivity_a,
            )
            lower = result.instantaneous.i_min_selectivity_a
            expected_mid = round((lower + upper) / 2.0, 1)
            assert result.instantaneous.i_setting_a == pytest.approx(expected_mid, abs=0.2)

    def test_no_valid_range_uses_selectivity_min(self):
        """When no valid range, setting should equal i_min_selectivity."""
        inp = _make_input(
            ik_max_next_bus_a=10000.0,
            ik3_min_beginning_a=5000.0,
            k_b=1.2,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.instantaneous.range_valid is False
        assert result.instantaneous.i_setting_a == result.instantaneous.i_min_selectivity_a

    def test_instantaneous_trace_has_4_steps(self):
        """WHITE BOX: instantaneous calculation should produce at least 4 trace steps."""
        inp = _make_input()
        result = ProtectionSettingsEngine.calculate(inp)
        assert len(result.instantaneous.trace) >= 4

    def test_k_b_and_k_bth_stored(self):
        """Configuration parameters should be stored in the result."""
        inp = _make_input(k_b=1.3, k_bth=1.15)
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.instantaneous.k_b == 1.3
        assert result.instantaneous.k_bth == 1.15


# =============================================================================
# Test: Thermal Withstand Check
# =============================================================================


class TestThermalWithstand:
    """Test the thermal withstand check."""

    def test_thermal_density_table_values(self):
        """Verify canonical j_thn values from Hoppel/IEC tables."""
        assert THERMAL_DENSITY["Cu"] == 142.0
        assert THERMAL_DENSITY["Al"] == 94.0
        assert THERMAL_DENSITY["AlFe"] == 87.0
        assert THERMAL_DENSITY["ACSR"] == 87.0

    def test_thermal_adequate_with_large_cross_section(self):
        """Large cross-section should withstand the fault current."""
        inp = _make_input(
            cross_section_mm2=240.0,
            conductor_material="Al",
            ik3_max_beginning_a=5000.0,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.thermal.is_adequate is True
        assert result.thermal.margin_percent > 0

    def test_thermal_inadequate_with_small_cross_section(self):
        """Small cross-section with high fault current should fail."""
        inp = _make_input(
            cross_section_mm2=10.0,
            conductor_material="Al",
            ik3_max_beginning_a=50000.0,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.thermal.is_adequate is False

    def test_thermal_uses_correct_j_thn(self):
        """j_thn should match the conductor material from THERMAL_DENSITY table."""
        for material, expected_j in THERMAL_DENSITY.items():
            inp = _make_input(conductor_material=material)
            result = ProtectionSettingsEngine.calculate(inp)
            assert result.thermal.j_thn == expected_j

    def test_thermal_fault_time_includes_breaker(self):
        """Total fault time = t_upstream + delta_t + 0.07 (breaker)."""
        inp = _make_input(t_upstream_s=0.0, delta_t_s=0.3)
        result = ProtectionSettingsEngine.calculate(inp)
        expected_t = 0.0 + 0.3 + 0.07
        assert result.thermal.t_fault_s == pytest.approx(expected_t, abs=0.001)

    def test_thermal_i_th_dop_formula(self):
        """I_th_dop = s * j_thn / sqrt(t_k)."""
        inp = _make_input(
            cross_section_mm2=120.0,
            conductor_material="Cu",
            t_upstream_s=0.0,
            delta_t_s=0.3,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        t_fault = 0.0 + 0.3 + 0.07
        expected = 120.0 * 142.0 / math.sqrt(t_fault)
        assert result.thermal.i_th_dop_a == pytest.approx(expected, rel=0.01)

    def test_thermal_cross_section_stored(self):
        """The cross-section value should be stored in the result."""
        inp = _make_input(cross_section_mm2=185.0)
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.thermal.cross_section_mm2 == 185.0

    def test_thermal_margin_positive_when_adequate(self):
        """When adequate, margin should be positive."""
        inp = _make_input(
            cross_section_mm2=240.0,
            ik3_max_beginning_a=5000.0,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        if result.thermal.is_adequate:
            assert result.thermal.margin_percent > 0

    def test_thermal_margin_negative_when_inadequate(self):
        """When inadequate, margin should be negative."""
        inp = _make_input(
            cross_section_mm2=10.0,
            ik3_max_beginning_a=100000.0,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        if not result.thermal.is_adequate:
            assert result.thermal.margin_percent < 0

    def test_thermal_trace_present(self):
        """WHITE BOX: thermal check should produce trace steps."""
        inp = _make_input()
        result = ProtectionSettingsEngine.calculate(inp)
        assert len(result.thermal.trace) >= 2


# =============================================================================
# Test: SPZ Analysis
# =============================================================================


class TestSPZAnalysis:
    """Test the SPZ (auto-reclose) analysis."""

    def test_spz_disabled(self):
        """When SPZ is disabled, spz_allowed=True, blocking not recommended."""
        inp = _make_input(spz_enabled=False)
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.spz.spz_allowed is True
        assert result.spz.blocking_recommended is False
        assert result.spz.total_fault_time_s == 0.0

    def test_spz_enabled_allowed_large_cable(self):
        """With large cross-section, SPZ should be allowed."""
        inp = _make_input(
            cross_section_mm2=240.0,
            conductor_material="Cu",
            ik3_max_beginning_a=5000.0,
            spz_enabled=True,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.spz.spz_allowed is True
        assert result.spz.blocking_recommended is False

    def test_spz_blocking_recommended(self):
        """With small cross-section and very high fault, SPZ should be blocked."""
        inp = _make_input(
            cross_section_mm2=16.0,
            conductor_material="Al",
            ik3_max_beginning_a=50000.0,
            spz_enabled=True,
            spz_pause_s=0.5,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.spz.blocking_recommended is True
        assert result.spz.spz_allowed is False

    def test_spz_total_fault_time(self):
        """SPZ cycle time = t_trip + t_pause + t_trip = 0.05 + 0.5 + 0.05 = 0.6 s."""
        inp = _make_input(spz_enabled=True, spz_pause_s=0.5)
        result = ProtectionSettingsEngine.calculate(inp)
        expected = 0.05 + 0.5 + 0.05
        assert result.spz.total_fault_time_s == pytest.approx(expected, abs=0.001)

    def test_spz_total_fault_time_long_pause(self):
        """Long SPZ pause increases thermal stress time."""
        inp = _make_input(spz_enabled=True, spz_pause_s=3.0)
        result = ProtectionSettingsEngine.calculate(inp)
        expected = 0.05 + 3.0 + 0.05
        assert result.spz.total_fault_time_s == pytest.approx(expected, abs=0.001)

    def test_spz_i_th_available_computation(self):
        """i_th_available = s * j_thn / sqrt(t_total)."""
        inp = _make_input(
            cross_section_mm2=120.0,
            conductor_material="Al",
            spz_enabled=True,
            spz_pause_s=0.5,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        t_total = 0.05 + 0.5 + 0.05
        j_thn = THERMAL_DENSITY["Al"]
        expected = 120.0 * j_thn / math.sqrt(t_total)
        assert result.spz.i_th_available_a == pytest.approx(expected, rel=0.01)

    def test_spz_trace_present(self):
        """WHITE BOX: SPZ analysis should produce trace steps."""
        inp = _make_input(spz_enabled=True)
        result = ProtectionSettingsEngine.calculate(inp)
        assert len(result.spz.trace) >= 2

    def test_spz_disabled_trace(self):
        """When SPZ is disabled, trace should still be present."""
        inp = _make_input(spz_enabled=False)
        result = ProtectionSettingsEngine.calculate(inp)
        assert len(result.spz.trace) >= 1


# =============================================================================
# Test: Different Conductor Materials
# =============================================================================


class TestConductorMaterials:
    """Test protection settings with different conductor materials."""

    @pytest.mark.parametrize(
        "material,expected_j_thn",
        [
            ("Cu", 142.0),
            ("Al", 94.0),
            ("AlFe", 87.0),
            ("ACSR", 87.0),
        ],
    )
    def test_material_j_thn_values(self, material, expected_j_thn):
        """Thermal density should match IEC/Hoppel values for each material."""
        inp = _make_input(conductor_material=material)
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.thermal.j_thn == expected_j_thn

    def test_unknown_material_uses_default(self):
        """Unknown conductor material should fall back to 94.0 A/mm2 (Al default)."""
        inp = _make_input(conductor_material="UnknownMaterial")
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.thermal.j_thn == 94.0

    def test_copper_higher_thermal_capacity(self):
        """Cu (j=142) should allow higher I_th_dop than Al (j=94)."""
        inp_cu = _make_input(conductor_material="Cu")
        inp_al = _make_input(conductor_material="Al")
        r_cu = ProtectionSettingsEngine.calculate(inp_cu)
        r_al = ProtectionSettingsEngine.calculate(inp_al)
        assert r_cu.thermal.i_th_dop_a > r_al.thermal.i_th_dop_a

    def test_alfe_same_as_acsr(self):
        """AlFe and ACSR should produce identical thermal density."""
        inp_alfe = _make_input(conductor_material="AlFe")
        inp_acsr = _make_input(conductor_material="ACSR")
        r_alfe = ProtectionSettingsEngine.calculate(inp_alfe)
        r_acsr = ProtectionSettingsEngine.calculate(inp_acsr)
        assert r_alfe.thermal.j_thn == r_acsr.thermal.j_thn
        assert r_alfe.thermal.i_th_dop_a == r_acsr.thermal.i_th_dop_a


# =============================================================================
# Test: Edge Cases
# =============================================================================


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_zero_load_current(self):
        """Zero load current should result in I> = 0."""
        inp = _make_input(i_load_max_a=0.0)
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.delayed.i_setting_a == 0.0
        # sensitivity = I_k2_min / 0 => guarded to 0.0
        assert result.delayed.sensitivity_ratio == 0.0

    def test_very_high_fault_currents(self):
        """Very high fault currents should still compute without errors."""
        inp = _make_input(
            ik3_max_beginning_a=100000.0,
            ik3_min_beginning_a=80000.0,
            ik3_max_end_a=50000.0,
            ik3_min_end_a=30000.0,
            ik2_min_end_a=25000.0,
            ik_max_next_bus_a=40000.0,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        assert isinstance(result, ProtectionSettingsResult)
        assert result.delayed.i_setting_a > 0

    def test_very_small_cross_section(self):
        """Very small conductor cross-section should still compute."""
        inp = _make_input(cross_section_mm2=2.5)
        result = ProtectionSettingsEngine.calculate(inp)
        assert isinstance(result, ProtectionSettingsResult)
        assert result.thermal.i_th_dop_a > 0

    def test_very_large_cross_section(self):
        """Large conductor cross-section should give high thermal capacity."""
        inp = _make_input(cross_section_mm2=500.0)
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.thermal.i_th_dop_a > 50000

    def test_equal_selectivity_and_sensitivity_bounds(self):
        """When i_min_sel equals i_max_sensitivity, range should be valid (boundary)."""
        # i_min_sel = k_b * ik_max_next = 1.2 * 3000 = 3600
        # i_max_sens = ik3_min_beg / k_b = 4320 / 1.2 = 3600
        inp = _make_input(
            ik_max_next_bus_a=3000.0,
            ik3_min_beginning_a=4320.0,
            k_b=1.2,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        # i_min_sel = 3600, i_max_sens = 3600 => 3600 <= 3600 = True
        assert result.instantaneous.range_valid is True


# =============================================================================
# Test: Overall Validity and Summary Notes
# =============================================================================


class TestOverallValidity:
    """Test the overall_valid flag and summary notes."""

    def test_all_valid_overall_true(self):
        """When all checks pass, overall_valid should be True."""
        inp = _make_input()
        result = ProtectionSettingsEngine.calculate(inp)
        if result.delayed.is_valid and result.instantaneous.is_valid and result.thermal.is_adequate:
            assert result.overall_valid is True

    def test_delayed_invalid_makes_overall_invalid(self):
        """When I> fails sensitivity, overall_valid should be False."""
        inp = _make_input(ik2_min_end_a=250.0, i_load_max_a=200.0)
        result = ProtectionSettingsEngine.calculate(inp)
        # k_cz = 250 / 240 = 1.04 < 1.5
        assert result.delayed.is_valid is False
        assert result.overall_valid is False

    def test_delayed_invalid_summary_note(self):
        """When I> is invalid, a summary note should mention I>."""
        inp = _make_input(ik2_min_end_a=250.0, i_load_max_a=200.0)
        result = ProtectionSettingsEngine.calculate(inp)
        assert any("I>" in n for n in result.summary_notes)

    def test_instantaneous_invalid_summary_note(self):
        """When I>> has no valid range, a summary note should mention I>>."""
        inp = _make_input(
            ik_max_next_bus_a=10000.0,
            ik3_min_beginning_a=5000.0,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        if not result.instantaneous.is_valid:
            assert any("I>>" in n for n in result.summary_notes)

    def test_thermal_inadequate_summary_note(self):
        """When thermal check fails, a summary note should mention it."""
        inp = _make_input(cross_section_mm2=10.0, ik3_max_beginning_a=50000.0)
        result = ProtectionSettingsEngine.calculate(inp)
        if not result.thermal.is_adequate:
            assert result.overall_valid is False
            assert any("ciepln" in n.lower() for n in result.summary_notes)

    def test_spz_blocking_adds_note(self):
        """When SPZ blocking is recommended, a note should be present."""
        inp = _make_input(
            cross_section_mm2=10.0,
            ik3_max_beginning_a=100000.0,
            spz_enabled=True,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        if result.spz.blocking_recommended:
            assert any("SPZ" in n for n in result.summary_notes)


# =============================================================================
# Test: Rozszerzenie W3-C2 — generacja lokalna (E-L)
# =============================================================================
#
# Iloczyn cech (reguła KLASA NIE INSTANCJA): aktywna/nieaktywna x próg
# podany/brak x ryzyko przekroczone/nie x typ źródła synchroniczne/
# falownikowe/nieznany. Przeniesione z `line_overcurrent_setting/analyzer.py::
# _check_local_generation`, wejścia JAWNE (karta W3-C2 §0.2 pkt 2).


class TestLocalGenerationDiagnostic:
    """Test the `local_generation` (generacja_lokalna) diagnostic block."""

    def test_inactive_by_default(self):
        """Default input has local generation inactive — block is present but inert."""
        inp = _make_input()
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.local_generation.aktywna is False
        assert result.local_generation.ryzyko_blokady_zsz is None
        assert result.local_generation.wklad_el_a == 0.0

    def test_inactive_present_in_to_dict(self):
        inp = _make_input()
        d = ProtectionSettingsEngine.calculate(inp).to_dict()
        assert d["generacja_lokalna"]["aktywna"] is False

    def test_active_without_threshold_is_unavailable(self):
        """No named threshold => werdykt NIEDOSTĘPNY (None), zero zgadywania."""
        inp = _make_input(
            lokalna_generacja_aktywna=True,
            lokalna_generacja_wklad_a=3000.0,
            ik3_max_beginning_a=10000.0,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.local_generation.aktywna is True
        assert result.local_generation.ryzyko_blokady_zsz is None
        assert any("NIEDOSTĘPNE" in n for n in result.local_generation.uwagi_pl)

    def test_active_with_threshold_risk_triggered(self):
        """Contribution ratio >= named threshold => risk True."""
        inp = _make_input(
            lokalna_generacja_aktywna=True,
            lokalna_generacja_wklad_a=3000.0,
            ik3_max_beginning_a=10000.0,  # udział E-L = 30%
            lokalna_generacja_prog_udzialu_zsz=0.3,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        lg = result.local_generation
        assert lg.udzial_el == pytest.approx(0.3, abs=1e-6)
        assert lg.ryzyko_blokady_zsz is True
        assert lg.wklad_systemu_a == pytest.approx(7000.0, abs=0.1)
        assert any("blokady ZSZ" in n for n in lg.uwagi_pl)

    def test_active_with_threshold_risk_not_triggered(self):
        """Contribution ratio below named threshold => risk False."""
        inp = _make_input(
            lokalna_generacja_aktywna=True,
            lokalna_generacja_wklad_a=500.0,
            ik3_max_beginning_a=10000.0,  # udział E-L = 5%
            lokalna_generacja_prog_udzialu_zsz=0.3,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.local_generation.ryzyko_blokady_zsz is False

    def test_synchronous_source_recommendation(self):
        inp = _make_input(
            lokalna_generacja_aktywna=True,
            lokalna_generacja_typ_zrodla="SYNCHRONICZNE",
            lokalna_generacja_wklad_a=1000.0,
            ik3_max_beginning_a=8000.0,
            lokalna_generacja_prog_udzialu_zsz=0.3,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        assert any("synchroniczny" in n.lower() for n in result.local_generation.uwagi_pl)

    def test_inverter_source_recommendation(self):
        inp = _make_input(
            lokalna_generacja_aktywna=True,
            lokalna_generacja_typ_zrodla="FALOWNIKOWE",
            lokalna_generacja_wklad_a=1000.0,
            ik3_max_beginning_a=8000.0,
            lokalna_generacja_prog_udzialu_zsz=0.3,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        assert any("falownikowe" in n.lower() for n in result.local_generation.uwagi_pl)

    def test_trace_present(self):
        inp = _make_input(
            lokalna_generacja_aktywna=True,
            lokalna_generacja_wklad_a=1000.0,
            lokalna_generacja_prog_udzialu_zsz=0.3,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        assert len(result.local_generation.trace) >= 2

    def test_does_not_affect_overall_valid_or_existing_notes(self):
        """Rozszerzenie jest ADDYTYWNE — nie zmienia overall_valid/summary_notes."""
        inp_bez = _make_input()
        inp_z = _make_input(
            lokalna_generacja_aktywna=True,
            lokalna_generacja_wklad_a=1000.0,
            lokalna_generacja_prog_udzialu_zsz=0.3,
        )
        wynik_bez = ProtectionSettingsEngine.calculate(inp_bez)
        wynik_z = ProtectionSettingsEngine.calculate(inp_z)
        assert wynik_bez.overall_valid == wynik_z.overall_valid
        assert wynik_bez.summary_notes == wynik_z.summary_notes


# =============================================================================
# Test: Rozszerzenie W3-C2 — okno nastaw I>> (okno_nastaw)
# =============================================================================
#
# Iloczyn cech: okno poprawne/sprzeczne x kryterium limitujące górną granicę
# czułość/cieplne. Predykat `window_valid` czyta TO SAMO źródło co
# `instantaneous.range_valid` — test niżej to przypina (`test_window_valid_
# matches_range_valid_single_source_of_truth`).


class TestSettingWindow:
    """Test the `setting_window` (okno_nastaw) block."""

    def test_valid_window_matches_instantaneous_bounds(self):
        inp = _make_input(
            ik_max_next_bus_a=1000.0,
            ik3_min_beginning_a=10000.0,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        window = result.setting_window
        assert window.window_valid is True
        assert window.i_min_a == result.instantaneous.i_min_selectivity_a
        assert window.limiting_criterion_min == "selectivity"
        assert window.conflict_pl is None
        assert any("Zalecana nastawa" in r for r in window.recommendations_pl)

    def test_window_valid_matches_range_valid_single_source_of_truth(self):
        """Predykaty parami: window_valid i instantaneous.range_valid z JEDNEGO źródła."""
        for ik_next, ik_min_beg in ((1000.0, 10000.0), (10000.0, 5000.0), (3000.0, 4320.0)):
            inp = _make_input(ik_max_next_bus_a=ik_next, ik3_min_beginning_a=ik_min_beg)
            result = ProtectionSettingsEngine.calculate(inp)
            assert result.setting_window.window_valid == result.instantaneous.range_valid

    def test_limiting_criterion_max_is_sensitivity_when_lower(self):
        inp = _make_input(cross_section_mm2=240.0, ik3_min_beginning_a=5000.0, k_b=1.2)
        result = ProtectionSettingsEngine.calculate(inp)
        # i_max_sens = 5000/1.2 = 4166.7, thermal na przewodzie 240mm2 jest znacznie wyzszy
        assert result.instantaneous.i_max_sensitivity_a < result.instantaneous.i_max_thermal_a
        assert result.setting_window.limiting_criterion_max == "sensitivity"

    def test_limiting_criterion_max_is_thermal_when_lower(self):
        inp = _make_input(cross_section_mm2=10.0, ik3_min_beginning_a=50000.0, k_b=1.2)
        result = ProtectionSettingsEngine.calculate(inp)
        assert result.instantaneous.i_max_thermal_a < result.instantaneous.i_max_sensitivity_a
        assert result.setting_window.limiting_criterion_max == "thermal"

    def test_conflict_window_has_deficit_and_named_criteria(self):
        inp = _make_input(
            ik_max_next_bus_a=10000.0,
            ik3_min_beginning_a=5000.0,
            k_b=1.2,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        window = result.setting_window
        assert window.window_valid is False
        assert window.conflict_pl is not None
        assert "selektywność" in window.conflict_pl.lower()
        assert "kA" in window.conflict_pl
        assert len(window.recommendations_pl) >= 2

    def test_conflict_recommendation_mentions_sensitivity_fix_when_limiting(self):
        inp = _make_input(ik_max_next_bus_a=10000.0, ik3_min_beginning_a=5000.0, k_b=1.2)
        result = ProtectionSettingsEngine.calculate(inp)
        window = result.setting_window
        assert window.limiting_criterion_max == "sensitivity"
        assert any("k_b" in r for r in window.recommendations_pl)

    def test_conflict_recommendation_mentions_thermal_fix_when_limiting(self):
        # Bardzo maly przekroj + niska czulosc utrzymana wysoko -> cieplne staje sie
        # gornym ograniczeniem, a selektywnosc wciaz je przewyzsza.
        inp = _make_input(
            cross_section_mm2=6.0,
            conductor_material="Al",
            ik_max_next_bus_a=10000.0,
            ik3_min_beginning_a=500000.0,
            k_b=1.2,
        )
        result = ProtectionSettingsEngine.calculate(inp)
        window = result.setting_window
        assert window.limiting_criterion_max == "thermal"
        assert window.window_valid is False
        assert any("przekrój" in r.lower() for r in window.recommendations_pl)

    def test_trace_present_and_conflict_step_only_when_invalid(self):
        inp_valid = _make_input(ik_max_next_bus_a=1000.0, ik3_min_beginning_a=10000.0)
        inp_invalid = _make_input(ik_max_next_bus_a=10000.0, ik3_min_beginning_a=5000.0)

        window_valid = ProtectionSettingsEngine.calculate(inp_valid).setting_window
        window_invalid = ProtectionSettingsEngine.calculate(inp_invalid).setting_window

        assert not any(s["step"] == "Konflikt okna nastaw I>>" for s in window_valid.trace)
        assert any(s["step"] == "Konflikt okna nastaw I>>" for s in window_invalid.trace)

    def test_does_not_affect_overall_valid_or_existing_notes(self):
        """Rozszerzenie jest ADDYTYWNE — okno_nastaw nie zmienia overall_valid/notes."""
        inp = _make_input()
        wynik = ProtectionSettingsEngine.calculate(inp)
        d = wynik.to_dict()
        assert "okno_nastaw" in d
        assert d["overall_valid"] == wynik.overall_valid
