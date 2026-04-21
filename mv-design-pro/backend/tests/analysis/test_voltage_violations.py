"""FIX-02: Tests for Voltage Violations Detector and PDF Report.

Tests:
- No violations when all voltages are within limits
- Undervoltage detection
- Overvoltage detection
- Custom limits per bus
- Worst violation identification
- Determinism
- Serialization
- PDF Report generation
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import pytest
from analysis.power_flow.violations import (
    BusInfo,
    ViolationType,
    VoltageViolation,
    VoltageViolationsDetector,
    VoltageViolationsResult,
)
from analysis.power_flow.violations_report import (
    export_violations_report_to_bytes,
    export_violations_report_to_pdf,
)
from network_model.solvers.power_flow_result import (
    PowerFlowBusResult,
    PowerFlowResultV1,
    PowerFlowSummary,
)

# =============================================================================
# Test Fixtures
# =============================================================================


def _make_pf_result(
    bus_voltages: dict[str, float],
    converged: bool = True,
) -> PowerFlowResultV1:
    """Helper to create PowerFlowResultV1 from voltage dict."""
    bus_results = tuple(
        PowerFlowBusResult(
            bus_id=bus_id,
            v_pu=v_pu,
            angle_deg=0.0,
            p_injected_mw=0.0,
            q_injected_mvar=0.0,
        )
        for bus_id, v_pu in sorted(bus_voltages.items())
    )

    v_values = list(bus_voltages.values())
    summary = PowerFlowSummary(
        total_losses_p_mw=0.0,
        total_losses_q_mvar=0.0,
        min_v_pu=min(v_values) if v_values else 0.0,
        max_v_pu=max(v_values) if v_values else 0.0,
        slack_p_mw=0.0,
        slack_q_mvar=0.0,
    )

    return PowerFlowResultV1(
        result_version="1.0.0",
        converged=converged,
        iterations_count=5,
        tolerance_used=1e-8,
        base_mva=100.0,
        slack_bus_id="slack",
        bus_results=bus_results,
        branch_results=(),
        summary=summary,
    )


@pytest.fixture
def sample_pf_result_all_ok() -> PowerFlowResultV1:
    """PowerFlowResultV1 with all voltages within default limits (0.95-1.05 pu)."""
    return _make_pf_result(
        {
            "bus_a": 1.00,
            "bus_b": 0.98,
            "bus_c": 1.02,
            "bus_d": 0.96,
            "bus_e": 1.04,
        }
    )


@pytest.fixture
def sample_pf_result_with_violations() -> PowerFlowResultV1:
    """PowerFlowResultV1 with undervoltage and overvoltage violations."""
    return _make_pf_result(
        {
            "bus_ok_1": 1.00,  # OK
            "bus_ok_2": 0.98,  # OK
            "bus_under_1": 0.90,  # Undervoltage (below 0.95)
            "bus_under_2": 0.92,  # Undervoltage (below 0.95)
            "bus_over_1": 1.08,  # Overvoltage (above 1.05)
            "bus_over_2": 1.12,  # Overvoltage (above 1.05)
        }
    )


@pytest.fixture
def sample_bus_info() -> dict[str, BusInfo]:
    """Sample BusInfo dictionary with names and nominal voltages."""
    return {
        "bus_ok_1": BusInfo(bus_id="bus_ok_1", bus_name="Szyna Glowna", u_nom_kv=20.0),
        "bus_ok_2": BusInfo(bus_id="bus_ok_2", bus_name="Szyna A", u_nom_kv=20.0),
        "bus_under_1": BusInfo(bus_id="bus_under_1", bus_name="Szyna B", u_nom_kv=15.0),
        "bus_under_2": BusInfo(bus_id="bus_under_2", bus_name="Szyna C", u_nom_kv=15.0),
        "bus_over_1": BusInfo(bus_id="bus_over_1", bus_name="Szyna D", u_nom_kv=10.0),
        "bus_over_2": BusInfo(bus_id="bus_over_2", bus_name="Szyna E", u_nom_kv=10.0),
    }


# =============================================================================
# Basic Detection Tests
# =============================================================================


class TestVoltageViolationsBasic:
    """Basic voltage violations detection tests."""

    def test_no_violations_when_all_ok(
        self,
        sample_pf_result_all_ok: PowerFlowResultV1,
    ) -> None:
        """Test: brak naruszen gdy wszystko w normie."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_all_ok)

        assert result.all_within_limits is True
        assert result.violations_count == 0
        assert result.undervoltage_count == 0
        assert result.overvoltage_count == 0
        assert len(result.violations) == 0
        assert result.worst_undervoltage is None
        assert result.worst_overvoltage is None
        assert result.total_buses == 5

    def test_detects_undervoltage(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
    ) -> None:
        """Test: wykrywa niedopiecie."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations)

        assert result.undervoltage_count == 2
        undervoltages = [
            v for v in result.violations if v.violation_type == ViolationType.UNDERVOLTAGE
        ]
        assert len(undervoltages) == 2

        # Check specific undervoltage buses
        under_bus_ids = {v.bus_id for v in undervoltages}
        assert "bus_under_1" in under_bus_ids
        assert "bus_under_2" in under_bus_ids

    def test_detects_overvoltage(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
    ) -> None:
        """Test: wykrywa przepiecie."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations)

        assert result.overvoltage_count == 2
        overvoltages = [
            v for v in result.violations if v.violation_type == ViolationType.OVERVOLTAGE
        ]
        assert len(overvoltages) == 2

        # Check specific overvoltage buses
        over_bus_ids = {v.bus_id for v in overvoltages}
        assert "bus_over_1" in over_bus_ids
        assert "bus_over_2" in over_bus_ids

    def test_total_violations_count(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
    ) -> None:
        """Test: poprawna suma naruszen."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations)

        assert result.violations_count == 4  # 2 under + 2 over
        assert result.all_within_limits is False
        assert result.total_buses == 6


# =============================================================================
# Custom Limits Tests
# =============================================================================


class TestCustomLimits:
    """Tests for custom voltage limits per bus."""

    def test_custom_limits_per_bus(self) -> None:
        """Test: rozne limity dla roznych wezlow."""
        # Create PF result with borderline voltages
        pf_result = _make_pf_result(
            {
                "bus_normal": 0.96,  # OK with default (0.95-1.05)
                "bus_strict": 0.96,  # Should violate strict limits (0.98-1.02)
                "bus_loose": 0.85,  # OK with loose limits (0.80-1.10)
            }
        )

        custom_limits: dict[str, tuple[float, float]] = {
            "bus_strict": (0.98, 1.02),  # Strict limits
            "bus_loose": (0.80, 1.10),  # Loose limits
        }

        detector = VoltageViolationsDetector()
        result = detector.detect(pf_result, custom_limits=custom_limits)

        # Only bus_strict should have violation
        assert result.violations_count == 1
        assert result.violations[0].bus_id == "bus_strict"
        assert result.violations[0].violation_type == ViolationType.UNDERVOLTAGE

    def test_bus_info_limits_used(self) -> None:
        """Test: limity z BusInfo sa uzywane."""
        pf_result = _make_pf_result(
            {
                "bus_a": 0.92,  # Should be OK with BusInfo limits (0.90-1.10)
                "bus_b": 0.92,  # Should be violation with default limits (0.95-1.05)
            }
        )

        bus_info = {
            "bus_a": BusInfo(
                bus_id="bus_a",
                bus_name="Szyna A",
                u_nom_kv=20.0,
                u_min_pu=0.90,
                u_max_pu=1.10,
            ),
        }

        detector = VoltageViolationsDetector()
        result = detector.detect(pf_result, bus_info=bus_info)

        # Only bus_b should have violation (uses default 0.95-1.05)
        assert result.violations_count == 1
        assert result.violations[0].bus_id == "bus_b"

    def test_custom_limits_override_bus_info(self) -> None:
        """Test: custom_limits maja priorytet nad BusInfo."""
        pf_result = _make_pf_result(
            {
                "bus_a": 0.96,
            }
        )

        bus_info = {
            "bus_a": BusInfo(
                bus_id="bus_a",
                bus_name="Szyna A",
                u_nom_kv=20.0,
                u_min_pu=0.90,  # Would allow 0.96
                u_max_pu=1.10,
            ),
        }

        # Custom limits that reject 0.96
        custom_limits = {
            "bus_a": (0.98, 1.02),
        }

        detector = VoltageViolationsDetector()
        result = detector.detect(pf_result, bus_info=bus_info, custom_limits=custom_limits)

        # Should have violation because custom_limits override bus_info
        assert result.violations_count == 1
        assert result.violations[0].bus_id == "bus_a"


# =============================================================================
# Worst Violation Tests
# =============================================================================


class TestWorstViolation:
    """Tests for worst violation identification."""

    def test_worst_undervoltage_identified(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
    ) -> None:
        """Test: identyfikuje najgorsze niedopiecie."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations)

        worst = result.worst_undervoltage
        assert worst is not None
        assert worst.bus_id == "bus_under_1"  # 0.90 is lower than 0.92
        assert worst.voltage_pu == 0.90

    def test_worst_overvoltage_identified(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
    ) -> None:
        """Test: identyfikuje najgorsze przepiecie."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations)

        worst = result.worst_overvoltage
        assert worst is not None
        assert worst.bus_id == "bus_over_2"  # 1.12 is higher than 1.08
        assert worst.voltage_pu == 1.12

    def test_deviation_percent_correct(self) -> None:
        """Test: poprawne obliczenie odchylenia procentowego."""
        pf_result = _make_pf_result(
            {
                "bus_under": 0.90,  # 5.26% below 0.95
                "bus_over": 1.10,  # 4.76% above 1.05
            }
        )

        detector = VoltageViolationsDetector()
        result = detector.detect(pf_result)

        under = next(v for v in result.violations if v.bus_id == "bus_under")
        over = next(v for v in result.violations if v.bus_id == "bus_over")

        # Deviation = (limit - actual) / limit * 100
        expected_under_dev = (0.95 - 0.90) / 0.95 * 100  # ~5.26%
        expected_over_dev = (1.10 - 1.05) / 1.05 * 100  # ~4.76%

        assert abs(under.deviation_percent - expected_under_dev) < 0.01
        assert abs(over.deviation_percent - expected_over_dev) < 0.01


# =============================================================================
# Bus Info Tests
# =============================================================================


class TestBusInfo:
    """Tests for BusInfo integration."""

    def test_bus_name_from_bus_info(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
        sample_bus_info: dict[str, BusInfo],
    ) -> None:
        """Test: nazwa szyny pobierana z BusInfo."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations, bus_info=sample_bus_info)

        under = next(v for v in result.violations if v.bus_id == "bus_under_1")
        assert under.bus_name == "Szyna B"

    def test_voltage_kv_calculated(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
        sample_bus_info: dict[str, BusInfo],
    ) -> None:
        """Test: napiecie kV obliczane z U_nom."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations, bus_info=sample_bus_info)

        # bus_under_1: v_pu=0.90, u_nom_kv=15.0 -> v_kv=13.5
        under = next(v for v in result.violations if v.bus_id == "bus_under_1")
        assert under.voltage_kv is not None
        assert abs(under.voltage_kv - 13.5) < 0.01

    def test_voltage_kv_none_without_bus_info(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
    ) -> None:
        """Test: napiecie kV jest None bez BusInfo."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations)

        for violation in result.violations:
            assert violation.voltage_kv is None

    def test_bus_id_as_name_fallback(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
    ) -> None:
        """Test: bus_id uzywany jako nazwa gdy brak BusInfo."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations)

        for violation in result.violations:
            assert violation.bus_name == violation.bus_id


# =============================================================================
# Alternative API Tests
# =============================================================================


class TestDetectFromDict:
    """Tests for detect_from_dict alternative API."""

    def test_detect_from_dict_basic(self) -> None:
        """Test: detekcja z prostego slownika napiec."""
        bus_voltages = {
            "bus_1": 1.00,
            "bus_2": 0.90,  # Undervoltage
            "bus_3": 1.10,  # Overvoltage
        }

        detector = VoltageViolationsDetector()
        result = detector.detect_from_dict(bus_voltages)

        assert result.total_buses == 3
        assert result.violations_count == 2
        assert result.undervoltage_count == 1
        assert result.overvoltage_count == 1

    def test_detect_from_dict_with_custom_limits(self) -> None:
        """Test: detekcja ze slownika z custom limitami."""
        bus_voltages = {
            "bus_1": 0.96,
            "bus_2": 0.96,
        }

        custom_limits = {
            "bus_1": (0.90, 1.10),  # Should be OK
            "bus_2": (0.98, 1.02),  # Should violate
        }

        detector = VoltageViolationsDetector()
        result = detector.detect_from_dict(bus_voltages, custom_limits=custom_limits)

        assert result.violations_count == 1
        assert result.violations[0].bus_id == "bus_2"


# =============================================================================
# Determinism Tests
# =============================================================================


class TestDeterminism:
    """Tests for deterministic behavior."""

    def test_detection_determinism(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
    ) -> None:
        """Test: to samo wejscie daje identyczny wynik."""
        detector = VoltageViolationsDetector()

        result1 = detector.detect(sample_pf_result_with_violations)
        result2 = detector.detect(sample_pf_result_with_violations)

        # Compare serialized output
        json1 = json.dumps(result1.to_dict(), sort_keys=True, ensure_ascii=False)
        json2 = json.dumps(result2.to_dict(), sort_keys=True, ensure_ascii=False)

        assert json1 == json2

    def test_violations_sorted_by_bus_id(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
    ) -> None:
        """Test: naruszenia posortowane po bus_id (deterministycznie)."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations)

        bus_ids = [v.bus_id for v in result.violations]
        assert bus_ids == sorted(bus_ids)


# =============================================================================
# Serialization Tests
# =============================================================================


class TestSerialization:
    """Tests for JSON serialization."""

    def test_violation_to_dict(self) -> None:
        """Test: VoltageViolation serializuje sie poprawnie."""
        violation = VoltageViolation(
            bus_id="bus_1",
            bus_name="Szyna Glowna",
            voltage_pu=0.92,
            voltage_kv=18.4,
            limit_min_pu=0.95,
            limit_max_pu=1.05,
            violation_type=ViolationType.UNDERVOLTAGE,
            deviation_percent=3.16,
        )

        d = violation.to_dict()

        assert d["bus_id"] == "bus_1"
        assert d["bus_name"] == "Szyna Glowna"
        assert d["voltage_pu"] == 0.92
        assert d["voltage_kv"] == 18.4
        assert d["limit_min_pu"] == 0.95
        assert d["limit_max_pu"] == 1.05
        assert d["violation_type"] == "undervoltage"
        assert d["deviation_percent"] == 3.16

    def test_result_to_dict(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
    ) -> None:
        """Test: VoltageViolationsResult serializuje sie poprawnie."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations)

        d = result.to_dict()

        assert d["total_buses"] == 6
        assert d["violations_count"] == 4
        assert d["undervoltage_count"] == 2
        assert d["overvoltage_count"] == 2
        assert d["all_within_limits"] is False
        assert len(d["violations"]) == 4
        assert d["worst_undervoltage"] is not None
        assert d["worst_overvoltage"] is not None

    def test_serialization_roundtrip(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
    ) -> None:
        """Test: serializacja do JSON jest poprawna."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations)

        # Should be JSON-serializable
        json_str = json.dumps(result.to_dict(), ensure_ascii=False)

        # Should be parseable
        parsed = json.loads(json_str)

        assert parsed["violations_count"] == 4


# =============================================================================
# Edge Cases
# =============================================================================


class TestEdgeCases:
    """Tests for edge cases."""

    def test_empty_pf_result(self) -> None:
        """Test: pusty wynik Power Flow."""
        pf_result = _make_pf_result({})
        detector = VoltageViolationsDetector()
        result = detector.detect(pf_result)

        assert result.total_buses == 0
        assert result.violations_count == 0
        assert result.all_within_limits is True

    def test_voltage_exactly_at_limit(self) -> None:
        """Test: napiecie dokladnie na limicie."""
        pf_result = _make_pf_result(
            {
                "bus_min": 0.95,  # Exactly at min limit
                "bus_max": 1.05,  # Exactly at max limit
            }
        )

        detector = VoltageViolationsDetector()
        result = detector.detect(pf_result)

        # Exactly at limit should NOT be a violation
        assert result.violations_count == 0
        assert result.all_within_limits is True

    def test_voltage_just_below_limit(self) -> None:
        """Test: napiecie minimalnie ponizej limitu."""
        pf_result = _make_pf_result(
            {
                "bus_under": 0.9499999,  # Just below 0.95
            }
        )

        detector = VoltageViolationsDetector()
        result = detector.detect(pf_result)

        assert result.violations_count == 1
        assert result.violations[0].violation_type == ViolationType.UNDERVOLTAGE

    def test_voltage_just_above_limit(self) -> None:
        """Test: napiecie minimalnie powyzej limitu."""
        pf_result = _make_pf_result(
            {
                "bus_over": 1.0500001,  # Just above 1.05
            }
        )

        detector = VoltageViolationsDetector()
        result = detector.detect(pf_result)

        assert result.violations_count == 1
        assert result.violations[0].violation_type == ViolationType.OVERVOLTAGE

    def test_invalid_default_limits_raises(self) -> None:
        """Test: nieprawidlowe domyslne limity rzucaja wyjatek."""
        with pytest.raises(ValueError, match="musi byc mniejsze"):
            VoltageViolationsDetector(default_umin_pu=1.05, default_umax_pu=0.95)

    def test_equal_default_limits_raises(self) -> None:
        """Test: rowne domyslne limity rzucaja wyjatek."""
        with pytest.raises(ValueError, match="musi byc mniejsze"):
            VoltageViolationsDetector(default_umin_pu=1.0, default_umax_pu=1.0)

    def test_single_bus_pf_result(self) -> None:
        """Test: pojedynczy wezel."""
        pf_result = _make_pf_result({"only_bus": 0.88})

        detector = VoltageViolationsDetector()
        result = detector.detect(pf_result)

        assert result.total_buses == 1
        assert result.violations_count == 1
        assert result.worst_undervoltage is not None
        assert result.worst_undervoltage.bus_id == "only_bus"
        assert result.worst_overvoltage is None

    def test_custom_default_limits(self) -> None:
        """Test: niestandardowe domyslne limity."""
        pf_result = _make_pf_result(
            {
                "bus_1": 0.92,  # Violation with 0.95-1.05, OK with 0.90-1.10
            }
        )

        # Default limits: 0.95-1.05
        detector_strict = VoltageViolationsDetector()
        result_strict = detector_strict.detect(pf_result)
        assert result_strict.violations_count == 1

        # Custom default limits: 0.90-1.10
        detector_loose = VoltageViolationsDetector(
            default_umin_pu=0.90,
            default_umax_pu=1.10,
        )
        result_loose = detector_loose.detect(pf_result)
        assert result_loose.violations_count == 0


# =============================================================================
# Violation Type Tests
# =============================================================================


class TestViolationType:
    """Tests for ViolationType enum."""

    def test_violation_type_values(self) -> None:
        """Test: wartosci enum ViolationType."""
        assert ViolationType.UNDERVOLTAGE.value == "undervoltage"
        assert ViolationType.OVERVOLTAGE.value == "overvoltage"
        assert ViolationType.WITHIN_LIMITS.value == "ok"

    def test_violation_type_in_result(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
    ) -> None:
        """Test: typy naruszen w wyniku."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations)

        under_types = {v.violation_type for v in result.violations if v.voltage_pu < 0.95}
        over_types = {v.violation_type for v in result.violations if v.voltage_pu > 1.05}

        assert under_types == {ViolationType.UNDERVOLTAGE}
        assert over_types == {ViolationType.OVERVOLTAGE}


# =============================================================================
# PDF Report Tests
# =============================================================================


class TestPdfReport:
    """Tests for PDF report generation."""

    def test_export_to_pdf_creates_file(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
    ) -> None:
        """Test: eksport do PDF tworzy plik."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations)

        with tempfile.TemporaryDirectory() as tmp_dir:
            pdf_path = Path(tmp_dir) / "violations_report.pdf"
            output_path = export_violations_report_to_pdf(result, pdf_path)

            assert output_path.exists()
            assert output_path.suffix == ".pdf"
            # PDF should have content
            assert output_path.stat().st_size > 0

    def test_export_to_pdf_with_metadata(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
    ) -> None:
        """Test: eksport do PDF z metadanymi."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations)

        metadata = {
            "project_name": "Projekt Testowy",
            "run_id": "abc123def456",
            "created_at": "2025-01-15 10:30:00",
        }

        with tempfile.TemporaryDirectory() as tmp_dir:
            pdf_path = Path(tmp_dir) / "violations_with_meta.pdf"
            output_path = export_violations_report_to_pdf(
                result,
                pdf_path,
                metadata=metadata,
                title="Raport testowy",
            )

            assert output_path.exists()
            assert output_path.stat().st_size > 0

    def test_export_to_bytes(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
    ) -> None:
        """Test: eksport do bajtow."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations)

        pdf_bytes = export_violations_report_to_bytes(result)

        # PDF should start with %PDF
        assert pdf_bytes[:4] == b"%PDF"
        # Should have reasonable size
        assert len(pdf_bytes) > 100

    def test_export_empty_violations(self) -> None:
        """Test: eksport raportu bez naruszen."""
        result = VoltageViolationsResult(
            total_buses=5,
            violations_count=0,
            undervoltage_count=0,
            overvoltage_count=0,
            violations=(),
            worst_undervoltage=None,
            worst_overvoltage=None,
            all_within_limits=True,
        )

        pdf_bytes = export_violations_report_to_bytes(result)

        assert pdf_bytes[:4] == b"%PDF"
        assert len(pdf_bytes) > 100

    def test_export_creates_parent_directories(
        self,
        sample_pf_result_with_violations: PowerFlowResultV1,
    ) -> None:
        """Test: eksport tworzy brakujace katalogi nadrzedne."""
        detector = VoltageViolationsDetector()
        result = detector.detect(sample_pf_result_with_violations)

        with tempfile.TemporaryDirectory() as tmp_dir:
            # Deep nested path
            pdf_path = Path(tmp_dir) / "a" / "b" / "c" / "report.pdf"
            output_path = export_violations_report_to_pdf(result, pdf_path)

            assert output_path.exists()
            assert output_path.parent.exists()
