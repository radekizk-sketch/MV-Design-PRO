"""
FIX-12: Tests for Overcurrent Protection Coordination Analyzer

Tests cover:
- Sensitivity checks
- Selectivity checks
- Overload checks
- TCC curve generation
- Determinism (same input = same output)
- Polish labels
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from application.analyses.protection.coordination import (
    CoordinationConfig,
    CoordinationInput,
    OvercurrentCoordinationAnalyzer,
)
from application.analyses.protection.coordination.models import (
    FaultCurrentData,
    OperatingCurrentData,
)
from domain.protection_device import (
    CoordinationVerdict,
    CurveStandard,
    OvercurrentProtectionSettings,
    OvercurrentStageSettings,
    ProtectionCurveSettings,
    ProtectionDevice,
    ProtectionDeviceType,
)

# =============================================================================
# FIXTURES
# =============================================================================


@pytest.fixture
def default_config() -> CoordinationConfig:
    """Default coordination configuration."""
    return CoordinationConfig(
        breaker_time_s=0.05,
        relay_overtravel_s=0.05,
        safety_factor_s=0.1,
        sensitivity_margin_pass=1.5,
        sensitivity_margin_marginal=1.2,
        overload_margin_pass=1.2,
        overload_margin_marginal=1.1,
    )


@pytest.fixture
def sample_device() -> ProtectionDevice:
    """Create a sample protection device with IEC SI curve."""
    curve_settings = ProtectionCurveSettings(
        standard=CurveStandard.IEC,
        variant="SI",
        pickup_current_a=400.0,
        time_multiplier=0.3,
    )

    stage_51 = OvercurrentStageSettings(
        enabled=True,
        pickup_current_a=400.0,
        curve_settings=curve_settings,
        directional=False,
    )

    settings = OvercurrentProtectionSettings(stage_51=stage_51)

    return ProtectionDevice(
        id=uuid4(),
        name="Zabezpieczenie_1",
        device_type=ProtectionDeviceType.RELAY,
        location_element_id="bus_1",
        settings=settings,
        manufacturer="ABB",
    )


@pytest.fixture
def sample_upstream_device() -> ProtectionDevice:
    """Create an upstream (backup) device with higher TMS."""
    curve_settings = ProtectionCurveSettings(
        standard=CurveStandard.IEC,
        variant="SI",
        pickup_current_a=600.0,
        time_multiplier=0.5,
    )

    stage_51 = OvercurrentStageSettings(
        enabled=True,
        pickup_current_a=600.0,
        curve_settings=curve_settings,
        directional=False,
    )

    settings = OvercurrentProtectionSettings(stage_51=stage_51)

    return ProtectionDevice(
        id=uuid4(),
        name="Zabezpieczenie_nadrzędne",
        device_type=ProtectionDeviceType.RELAY,
        location_element_id="bus_2",
        settings=settings,
        manufacturer="Siemens",
    )


@pytest.fixture
def sample_fault_current() -> FaultCurrentData:
    """Sample fault current data."""
    return FaultCurrentData(
        location_id="bus_1",
        ik_max_3f_a=5000.0,
        ik_min_3f_a=2000.0,
        ik_min_1f_a=1500.0,
    )


@pytest.fixture
def sample_operating_current() -> OperatingCurrentData:
    """Sample operating current data."""
    return OperatingCurrentData(
        location_id="bus_1",
        i_operating_a=280.0,
        loading_percent=70.0,
    )


# =============================================================================
# SENSITIVITY TESTS
# =============================================================================


class TestSensitivityCheck:
    """Tests for sensitivity (czułość) checks."""

    def test_sensitivity_pass(
        self,
        default_config: CoordinationConfig,
        sample_device: ProtectionDevice,
        sample_fault_current: FaultCurrentData,
        sample_operating_current: OperatingCurrentData,
    ):
        """Test sensitivity PASS when I_min/I_pickup >= 1.5."""
        # I_min = 2000A, I_pickup = 400A -> ratio = 5.0 >= 1.5 -> PASS
        analyzer = OvercurrentCoordinationAnalyzer(config=default_config)

        input_data = CoordinationInput(
            devices=(sample_device,),
            fault_currents=(sample_fault_current,),
            operating_currents=(sample_operating_current,),
            config=default_config,
            project_id="test-project",
        )

        result = analyzer.analyze(input_data)

        assert len(result.sensitivity_checks) == 1
        check = result.sensitivity_checks[0]
        assert check.verdict == CoordinationVerdict.PASS
        assert check.i_fault_min_a == 2000.0
        assert check.i_pickup_a == 400.0
        assert check.margin_percent == pytest.approx(400.0, rel=0.01)  # (5.0 - 1) * 100

    def test_sensitivity_marginal(self, default_config: CoordinationConfig):
        """Test sensitivity MARGINAL when 1.2 <= ratio < 1.5."""
        # Create device with pickup close to min fault
        curve_settings = ProtectionCurveSettings(
            standard=CurveStandard.IEC,
            variant="SI",
            pickup_current_a=1600.0,  # 2000/1600 = 1.25 -> MARGINAL
            time_multiplier=0.3,
        )
        stage_51 = OvercurrentStageSettings(
            enabled=True,
            pickup_current_a=1600.0,
            curve_settings=curve_settings,
        )
        settings = OvercurrentProtectionSettings(stage_51=stage_51)
        device = ProtectionDevice(
            id=uuid4(),
            name="Zabezpieczenie_marginal",
            device_type=ProtectionDeviceType.RELAY,
            location_element_id="bus_1",
            settings=settings,
        )

        fault = FaultCurrentData(location_id="bus_1", ik_max_3f_a=5000.0, ik_min_3f_a=2000.0)
        operating = OperatingCurrentData(location_id="bus_1", i_operating_a=100.0)

        analyzer = OvercurrentCoordinationAnalyzer(config=default_config)
        input_data = CoordinationInput(
            devices=(device,),
            fault_currents=(fault,),
            operating_currents=(operating,),
            config=default_config,
        )

        result = analyzer.analyze(input_data)
        check = result.sensitivity_checks[0]

        assert check.verdict == CoordinationVerdict.MARGINAL
        assert 20.0 <= check.margin_percent < 50.0

    def test_sensitivity_fail(self, default_config: CoordinationConfig):
        """Test sensitivity FAIL when ratio < 1.2."""
        # Create device with pickup very close to min fault
        curve_settings = ProtectionCurveSettings(
            standard=CurveStandard.IEC,
            variant="SI",
            pickup_current_a=1800.0,  # 2000/1800 = 1.11 -> FAIL
            time_multiplier=0.3,
        )
        stage_51 = OvercurrentStageSettings(
            enabled=True,
            pickup_current_a=1800.0,
            curve_settings=curve_settings,
        )
        settings = OvercurrentProtectionSettings(stage_51=stage_51)
        device = ProtectionDevice(
            id=uuid4(),
            name="Zabezpieczenie_fail",
            device_type=ProtectionDeviceType.RELAY,
            location_element_id="bus_1",
            settings=settings,
        )

        fault = FaultCurrentData(location_id="bus_1", ik_max_3f_a=5000.0, ik_min_3f_a=2000.0)
        operating = OperatingCurrentData(location_id="bus_1", i_operating_a=100.0)

        analyzer = OvercurrentCoordinationAnalyzer(config=default_config)
        input_data = CoordinationInput(
            devices=(device,),
            fault_currents=(fault,),
            operating_currents=(operating,),
            config=default_config,
        )

        result = analyzer.analyze(input_data)
        check = result.sensitivity_checks[0]

        assert check.verdict == CoordinationVerdict.FAIL


# =============================================================================
# OVERLOAD TESTS
# =============================================================================


class TestOverloadCheck:
    """Tests for overload (przeciążalność) checks."""

    def test_overload_pass(
        self,
        default_config: CoordinationConfig,
        sample_device: ProtectionDevice,
        sample_fault_current: FaultCurrentData,
        sample_operating_current: OperatingCurrentData,
    ):
        """Test overload PASS when I_pickup/I_operating >= 1.2."""
        # I_pickup = 400A, I_operating = 280A -> ratio = 1.43 >= 1.2 -> PASS
        analyzer = OvercurrentCoordinationAnalyzer(config=default_config)

        input_data = CoordinationInput(
            devices=(sample_device,),
            fault_currents=(sample_fault_current,),
            operating_currents=(sample_operating_current,),
            config=default_config,
        )

        result = analyzer.analyze(input_data)

        assert len(result.overload_checks) == 1
        check = result.overload_checks[0]
        assert check.verdict == CoordinationVerdict.PASS
        assert check.i_operating_a == 280.0
        assert check.i_pickup_a == 400.0

    def test_overload_fail(self, default_config: CoordinationConfig):
        """Test overload FAIL when ratio < 1.1."""
        # Pickup too close to operating current
        curve_settings = ProtectionCurveSettings(
            standard=CurveStandard.IEC,
            variant="SI",
            pickup_current_a=300.0,  # 300/280 = 1.07 -> FAIL
            time_multiplier=0.3,
        )
        stage_51 = OvercurrentStageSettings(
            enabled=True,
            pickup_current_a=300.0,
            curve_settings=curve_settings,
        )
        settings = OvercurrentProtectionSettings(stage_51=stage_51)
        device = ProtectionDevice(
            id=uuid4(),
            name="Zabezpieczenie_overload_fail",
            device_type=ProtectionDeviceType.RELAY,
            location_element_id="bus_1",
            settings=settings,
        )

        fault = FaultCurrentData(location_id="bus_1", ik_max_3f_a=5000.0, ik_min_3f_a=2000.0)
        operating = OperatingCurrentData(location_id="bus_1", i_operating_a=280.0)

        analyzer = OvercurrentCoordinationAnalyzer(config=default_config)
        input_data = CoordinationInput(
            devices=(device,),
            fault_currents=(fault,),
            operating_currents=(operating,),
            config=default_config,
        )

        result = analyzer.analyze(input_data)
        check = result.overload_checks[0]

        assert check.verdict == CoordinationVerdict.FAIL


# =============================================================================
# SELECTIVITY TESTS
# =============================================================================


class TestSelectivityCheck:
    """Tests for selectivity (selektywność) checks."""

    def test_selectivity_requires_two_devices(
        self,
        default_config: CoordinationConfig,
        sample_device: ProtectionDevice,
        sample_fault_current: FaultCurrentData,
        sample_operating_current: OperatingCurrentData,
    ):
        """Test that selectivity check requires at least 2 devices."""
        analyzer = OvercurrentCoordinationAnalyzer(config=default_config)

        input_data = CoordinationInput(
            devices=(sample_device,),
            fault_currents=(sample_fault_current,),
            operating_currents=(sample_operating_current,),
            config=default_config,
        )

        result = analyzer.analyze(input_data)

        # With only one device, no selectivity checks
        assert len(result.selectivity_checks) == 0

    def test_selectivity_pass(
        self,
        default_config: CoordinationConfig,
        sample_device: ProtectionDevice,
        sample_upstream_device: ProtectionDevice,
    ):
        """Test selectivity PASS when time margin is sufficient."""
        fault_1 = FaultCurrentData(location_id="bus_1", ik_max_3f_a=5000.0, ik_min_3f_a=2000.0)
        fault_2 = FaultCurrentData(location_id="bus_2", ik_max_3f_a=4000.0, ik_min_3f_a=1500.0)
        operating_1 = OperatingCurrentData(location_id="bus_1", i_operating_a=280.0)
        operating_2 = OperatingCurrentData(location_id="bus_2", i_operating_a=400.0)

        analyzer = OvercurrentCoordinationAnalyzer(config=default_config)

        input_data = CoordinationInput(
            devices=(sample_device, sample_upstream_device),  # downstream, upstream
            fault_currents=(fault_1, fault_2),
            operating_currents=(operating_1, operating_2),
            config=default_config,
        )

        result = analyzer.analyze(input_data)

        # Should have one selectivity check between the two devices
        assert len(result.selectivity_checks) == 1
        check = result.selectivity_checks[0]

        # Upstream device has higher TMS, so should trip later
        assert check.t_upstream_s > check.t_downstream_s
        assert check.margin_s > 0

    def test_selectivity_fail_negative_margin(self, default_config: CoordinationConfig):
        """Test selectivity FAIL when upstream trips before downstream."""
        # Create upstream with LOWER TMS than downstream (wrong coordination)
        downstream_curve = ProtectionCurveSettings(
            standard=CurveStandard.IEC,
            variant="SI",
            pickup_current_a=400.0,
            time_multiplier=0.5,  # Higher TMS
        )
        downstream_stage = OvercurrentStageSettings(
            enabled=True,
            pickup_current_a=400.0,
            curve_settings=downstream_curve,
        )
        downstream_settings = OvercurrentProtectionSettings(stage_51=downstream_stage)
        downstream = ProtectionDevice(
            id=uuid4(),
            name="Downstream",
            device_type=ProtectionDeviceType.RELAY,
            location_element_id="bus_1",
            settings=downstream_settings,
        )

        upstream_curve = ProtectionCurveSettings(
            standard=CurveStandard.IEC,
            variant="SI",
            pickup_current_a=400.0,
            time_multiplier=0.2,  # Lower TMS - will trip first (WRONG!)
        )
        upstream_stage = OvercurrentStageSettings(
            enabled=True,
            pickup_current_a=400.0,
            curve_settings=upstream_curve,
        )
        upstream_settings = OvercurrentProtectionSettings(stage_51=upstream_stage)
        upstream = ProtectionDevice(
            id=uuid4(),
            name="Upstream",
            device_type=ProtectionDeviceType.RELAY,
            location_element_id="bus_2",
            settings=upstream_settings,
        )

        fault = FaultCurrentData(location_id="bus_1", ik_max_3f_a=5000.0, ik_min_3f_a=2000.0)
        operating = OperatingCurrentData(location_id="bus_1", i_operating_a=200.0)

        analyzer = OvercurrentCoordinationAnalyzer(config=default_config)
        input_data = CoordinationInput(
            devices=(downstream, upstream),
            fault_currents=(fault,),
            operating_currents=(operating,),
            config=default_config,
        )

        result = analyzer.analyze(input_data)
        check = result.selectivity_checks[0]

        # Should FAIL because upstream trips before downstream
        assert check.verdict == CoordinationVerdict.FAIL
        assert check.margin_s < 0


# =============================================================================
# TCC CURVE TESTS
# =============================================================================


class TestTCCCurves:
    """Tests for TCC curve generation."""

    def test_tcc_curves_generated(
        self,
        default_config: CoordinationConfig,
        sample_device: ProtectionDevice,
        sample_fault_current: FaultCurrentData,
        sample_operating_current: OperatingCurrentData,
    ):
        """Test that TCC curves are generated for devices with curve settings."""
        analyzer = OvercurrentCoordinationAnalyzer(config=default_config)

        input_data = CoordinationInput(
            devices=(sample_device,),
            fault_currents=(sample_fault_current,),
            operating_currents=(sample_operating_current,),
            config=default_config,
        )

        result = analyzer.analyze(input_data)

        assert len(result.tcc_curves) == 1
        curve = result.tcc_curves[0]
        assert curve.device_id == str(sample_device.id)
        assert curve.device_name == sample_device.name
        assert curve.curve_type == "IEC_SI"
        assert curve.pickup_current_a == 400.0
        assert len(curve.points) > 0

    def test_tcc_curve_points_valid(
        self,
        default_config: CoordinationConfig,
        sample_device: ProtectionDevice,
        sample_fault_current: FaultCurrentData,
        sample_operating_current: OperatingCurrentData,
    ):
        """Test that TCC curve points are valid (positive time, increasing current)."""
        analyzer = OvercurrentCoordinationAnalyzer(config=default_config)

        input_data = CoordinationInput(
            devices=(sample_device,),
            fault_currents=(sample_fault_current,),
            operating_currents=(sample_operating_current,),
            config=default_config,
        )

        result = analyzer.analyze(input_data)
        curve = result.tcc_curves[0]

        # All times should be positive
        for point in curve.points:
            assert point.time_s > 0
            assert point.current_a > 0
            assert point.current_multiple > 1.0


# =============================================================================
# DETERMINISM TESTS
# =============================================================================


class TestDeterminism:
    """Tests for deterministic output."""

    def test_same_input_same_output(
        self,
        default_config: CoordinationConfig,
        sample_device: ProtectionDevice,
        sample_fault_current: FaultCurrentData,
        sample_operating_current: OperatingCurrentData,
    ):
        """Test that same input produces identical output."""
        analyzer = OvercurrentCoordinationAnalyzer(config=default_config)

        input_data = CoordinationInput(
            devices=(sample_device,),
            fault_currents=(sample_fault_current,),
            operating_currents=(sample_operating_current,),
            config=default_config,
            project_id="test-determinism",
        )

        # Run analysis twice
        result1 = analyzer.analyze(input_data)
        result2 = analyzer.analyze(input_data)

        # Results should be identical (except run_id and created_at)
        assert result1.overall_verdict == result2.overall_verdict
        assert len(result1.sensitivity_checks) == len(result2.sensitivity_checks)
        assert len(result1.selectivity_checks) == len(result2.selectivity_checks)
        assert len(result1.overload_checks) == len(result2.overload_checks)

        # Check values match
        for c1, c2 in zip(result1.sensitivity_checks, result2.sensitivity_checks, strict=False):
            assert c1.verdict == c2.verdict
            assert c1.i_fault_min_a == c2.i_fault_min_a
            assert c1.i_pickup_a == c2.i_pickup_a
            assert c1.margin_percent == c2.margin_percent


# =============================================================================
# OVERALL VERDICT TESTS
# =============================================================================


class TestOverallVerdict:
    """Tests for overall verdict calculation."""

    def test_overall_pass_when_all_pass(
        self,
        default_config: CoordinationConfig,
        sample_device: ProtectionDevice,
        sample_fault_current: FaultCurrentData,
        sample_operating_current: OperatingCurrentData,
    ):
        """Test overall PASS when all checks pass."""
        analyzer = OvercurrentCoordinationAnalyzer(config=default_config)

        input_data = CoordinationInput(
            devices=(sample_device,),
            fault_currents=(sample_fault_current,),
            operating_currents=(sample_operating_current,),
            config=default_config,
        )

        result = analyzer.analyze(input_data)

        # All checks should pass with the sample data
        assert result.overall_verdict == "PASS"

    def test_overall_fail_when_any_fails(self, default_config: CoordinationConfig):
        """Test overall FAIL when any check fails."""
        # Create device that will fail sensitivity check
        curve_settings = ProtectionCurveSettings(
            standard=CurveStandard.IEC,
            variant="SI",
            pickup_current_a=1900.0,  # Very close to min fault
            time_multiplier=0.3,
        )
        stage_51 = OvercurrentStageSettings(
            enabled=True,
            pickup_current_a=1900.0,
            curve_settings=curve_settings,
        )
        settings = OvercurrentProtectionSettings(stage_51=stage_51)
        device = ProtectionDevice(
            id=uuid4(),
            name="Failing_device",
            device_type=ProtectionDeviceType.RELAY,
            location_element_id="bus_1",
            settings=settings,
        )

        fault = FaultCurrentData(location_id="bus_1", ik_max_3f_a=5000.0, ik_min_3f_a=2000.0)
        operating = OperatingCurrentData(location_id="bus_1", i_operating_a=100.0)

        analyzer = OvercurrentCoordinationAnalyzer(config=default_config)
        input_data = CoordinationInput(
            devices=(device,),
            fault_currents=(fault,),
            operating_currents=(operating,),
            config=default_config,
        )

        result = analyzer.analyze(input_data)

        # Sensitivity will fail, so overall should be FAIL
        assert result.overall_verdict == "FAIL"


# =============================================================================
# WHITE BOX TRACE TESTS
# =============================================================================


class TestWhiteBoxTrace:
    """Tests for WHITE BOX trace generation."""

    def test_trace_steps_generated(
        self,
        default_config: CoordinationConfig,
        sample_device: ProtectionDevice,
        sample_fault_current: FaultCurrentData,
        sample_operating_current: OperatingCurrentData,
    ):
        """Test that trace steps are generated for all calculations."""
        analyzer = OvercurrentCoordinationAnalyzer(config=default_config)

        input_data = CoordinationInput(
            devices=(sample_device,),
            fault_currents=(sample_fault_current,),
            operating_currents=(sample_operating_current,),
            config=default_config,
        )

        result = analyzer.analyze(input_data)

        # Should have multiple trace steps
        assert len(result.trace_steps) > 0

        # All steps should have required fields
        for step in result.trace_steps:
            assert "step" in step
            assert "description_pl" in step
            assert "inputs" in step
            assert "outputs" in step

    def test_trace_has_polish_descriptions(
        self,
        default_config: CoordinationConfig,
        sample_device: ProtectionDevice,
        sample_fault_current: FaultCurrentData,
        sample_operating_current: OperatingCurrentData,
    ):
        """Test that trace descriptions are in Polish."""
        analyzer = OvercurrentCoordinationAnalyzer(config=default_config)

        input_data = CoordinationInput(
            devices=(sample_device,),
            fault_currents=(sample_fault_current,),
            operating_currents=(sample_operating_current,),
            config=default_config,
        )

        result = analyzer.analyze(input_data)

        # Check for Polish words in descriptions
        polish_indicators = [
            "Sprawdzenie",
            "czułości",
            "selektywności",
            "przeciążalności",
            "prądów",
        ]

        descriptions = [step["description_pl"] for step in result.trace_steps]
        combined = " ".join(descriptions)

        assert any(word in combined for word in polish_indicators)
