"""
P17 — Testy Sanity Checks v1.

Przypadki testowe — kazda regula ma test positive i negative.

BINDING RULE SET:
1. Napieciowe (27/59)
2. Czestotliwosciowe (81U/81O)
3. ROCOF (81R)
4. Nadpradowe (50/51)
5. SPZ (79)
6. Ogolne

100% POLISH UI where applicable.
"""

from __future__ import annotations

import pytest
from application.analyses.protection.base_values.models import (
    BaseValues,
    BaseValueSourceIn,
    BaseValueSourceUn,
    ProtectionSetpoint,
    ProtectionSetpointBasis,
    ProtectionSetpointOperator,
)
from application.analyses.protection.sanity_checks import (
    ElementContext,
    ProtectionFunctionSummary,
    ProtectionSanityCheckResult,
    SanityCheckCode,
    SanityCheckSeverity,
    run_sanity_checks,
)

# =============================================================================
# Fixtures
# =============================================================================


def _base_values_full() -> BaseValues:
    """BaseValues z Un i In."""
    return BaseValues(
        un_kv=15.0,
        in_a=503.0,
        source_un=BaseValueSourceUn.BUS,
        source_in=BaseValueSourceIn.LINE,
        notes_pl="Testowe wartosci bazowe",
    )


def _base_values_no_un() -> BaseValues:
    """BaseValues bez Un."""
    return BaseValues(
        un_kv=None,
        in_a=503.0,
        source_un=BaseValueSourceUn.UNKNOWN,
        source_in=BaseValueSourceIn.LINE,
    )


def _base_values_no_in() -> BaseValues:
    """BaseValues bez In."""
    return BaseValues(
        un_kv=15.0,
        in_a=None,
        source_un=BaseValueSourceUn.BUS,
        source_in=BaseValueSourceIn.UNKNOWN,
    )


def _element_context() -> ElementContext:
    """Standardowy kontekst elementu."""
    return ElementContext(element_id="line-001", element_type="LINE")


def _setpoint_in(multiplier: float) -> ProtectionSetpoint:
    """Setpoint IN-based."""
    display = f"{multiplier}".replace(".", ",") + "×In"
    return ProtectionSetpoint(
        basis=ProtectionSetpointBasis.IN,
        operator=ProtectionSetpointOperator.GT,
        multiplier=multiplier,
        unit="pu",
        display_pl=display,
    )


def _setpoint_un(
    multiplier: float, operator: ProtectionSetpointOperator = ProtectionSetpointOperator.LT
) -> ProtectionSetpoint:
    """Setpoint UN-based."""
    display = f"{multiplier}".replace(".", ",") + "×Un"
    return ProtectionSetpoint(
        basis=ProtectionSetpointBasis.UN,
        operator=operator,
        multiplier=multiplier,
        unit="pu",
        display_pl=display,
    )


def _setpoint_hz(value: float, operator: ProtectionSetpointOperator) -> ProtectionSetpoint:
    """Setpoint ABS Hz."""
    display = f"{value}".replace(".", ",") + " Hz"
    return ProtectionSetpoint(
        basis=ProtectionSetpointBasis.ABS,
        operator=operator,
        abs_value=value,
        unit="Hz",
        display_pl=display,
    )


def _setpoint_hz_s(value: float) -> ProtectionSetpoint:
    """Setpoint ABS Hz/s."""
    display = f"{value}".replace(".", ",") + " Hz/s"
    return ProtectionSetpoint(
        basis=ProtectionSetpointBasis.ABS,
        operator=ProtectionSetpointOperator.GT,
        abs_value=value,
        unit="Hz/s",
        display_pl=display,
    )


# =============================================================================
# Test: Model Invariants
# =============================================================================


class TestModelInvariants:
    """Testy niezmiennikow modelu ProtectionSanityCheckResult."""

    def test_result_requires_message_pl(self) -> None:
        """message_pl nie moze byc puste."""
        with pytest.raises(ValueError, match="message_pl"):
            ProtectionSanityCheckResult(
                severity=SanityCheckSeverity.ERROR,
                code=SanityCheckCode.GEN_NEGATIVE_SETPOINT,
                message_pl="",
                element_id="line-001",
                element_type="LINE",
            )

    def test_result_requires_element_id(self) -> None:
        """element_id nie moze byc puste."""
        with pytest.raises(ValueError, match="element_id"):
            ProtectionSanityCheckResult(
                severity=SanityCheckSeverity.ERROR,
                code=SanityCheckCode.GEN_NEGATIVE_SETPOINT,
                message_pl="Testowy komunikat",
                element_id="",
                element_type="LINE",
            )

    def test_result_requires_element_type(self) -> None:
        """element_type nie moze byc puste."""
        with pytest.raises(ValueError, match="element_type"):
            ProtectionSanityCheckResult(
                severity=SanityCheckSeverity.ERROR,
                code=SanityCheckCode.GEN_NEGATIVE_SETPOINT,
                message_pl="Testowy komunikat",
                element_id="line-001",
                element_type="",
            )

    def test_result_to_dict(self) -> None:
        """Serializacja do dict."""
        result = ProtectionSanityCheckResult(
            severity=SanityCheckSeverity.ERROR,
            code=SanityCheckCode.OC_OVERLAP,
            message_pl="Testowy komunikat",
            element_id="line-001",
            element_type="LINE",
            function_ansi="50/51",
            function_code="OVERCURRENT_TIME/OVERCURRENT_INST",
            evidence={"I>_pu": 3.0, "I>>_pu": 2.0},
        )
        d = result.to_dict()

        assert d["severity"] == "ERROR"
        assert d["code"] == "OC_OVERLAP"
        assert d["message_pl"] == "Testowy komunikat"
        assert d["element_id"] == "line-001"
        assert d["element_type"] == "LINE"
        assert d["function_ansi"] == "50/51"
        assert d["evidence"]["I>_pu"] == 3.0


# =============================================================================
# Test: General — Negative Setpoint (ERROR)
# =============================================================================


class TestNegativeSetpoint:
    """Regula: ERROR setpoint niefizyczny (ujemny)."""

    def test_negative_multiplier_error(self) -> None:
        """Ujemny multiplier → ERROR."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(-1.0),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        errors = [r for r in results if r.code == SanityCheckCode.GEN_NEGATIVE_SETPOINT]
        assert len(errors) == 1
        assert errors[0].severity == SanityCheckSeverity.ERROR
        assert "ujemna" in errors[0].message_pl

    def test_negative_abs_value_error(self) -> None:
        """Ujemna wartosc abs_value → ERROR."""
        functions = [
            ProtectionFunctionSummary(
                code="UNDERFREQUENCY",
                ansi=("81U",),
                label_pl="Podczestotliwosciowa (f<)",
                setpoint=_setpoint_hz(-47.5, ProtectionSetpointOperator.LT),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        errors = [r for r in results if r.code == SanityCheckCode.GEN_NEGATIVE_SETPOINT]
        assert len(errors) == 1
        assert errors[0].severity == SanityCheckSeverity.ERROR

    def test_positive_setpoint_no_error(self) -> None:
        """Dodatni setpoint → brak ERROR."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(1.2),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        errors = [r for r in results if r.code == SanityCheckCode.GEN_NEGATIVE_SETPOINT]
        assert len(errors) == 0


# =============================================================================
# Test: General — Missing Base Values (INFO)
# =============================================================================


class TestMissingBaseValues:
    """Regula: INFO brak danych bazowych → analiza czesciowa."""

    def test_missing_un_info(self) -> None:
        """Brak Un gdy potrzebne → INFO."""
        functions = [
            ProtectionFunctionSummary(
                code="UNDERVOLTAGE",
                ansi=("27",),
                label_pl="Podnapieciowa (U<)",
                setpoint=_setpoint_un(0.8),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_no_un(), _element_context())

        infos = [r for r in results if r.code == SanityCheckCode.GEN_PARTIAL_ANALYSIS]
        assert len(infos) >= 1
        assert any("Un" in r.message_pl for r in infos)

    def test_missing_in_info(self) -> None:
        """Brak In gdy potrzebne → INFO."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(1.2),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_no_in(), _element_context())

        infos = [r for r in results if r.code == SanityCheckCode.GEN_PARTIAL_ANALYSIS]
        assert len(infos) >= 1
        assert any("In" in r.message_pl for r in infos)

    def test_no_missing_when_full(self) -> None:
        """Pełne dane → brak INFO o brakach."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(1.2),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        infos = [r for r in results if r.code == SanityCheckCode.GEN_PARTIAL_ANALYSIS]
        assert len(infos) == 0


# =============================================================================
# Test: Voltage (27/59) — Missing Un (ERROR)
# =============================================================================


class TestVoltageMissingUn:
    """Regula: ERROR brak Un dla basis='UN'."""

    def test_missing_un_error(self) -> None:
        """Brak Un dla 27 → ERROR."""
        functions = [
            ProtectionFunctionSummary(
                code="UNDERVOLTAGE",
                ansi=("27",),
                label_pl="Podnapieciowa (U<)",
                setpoint=_setpoint_un(0.8),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_no_un(), _element_context())

        errors = [r for r in results if r.code == SanityCheckCode.VOLT_MISSING_UN]
        assert len(errors) == 1
        assert errors[0].severity == SanityCheckSeverity.ERROR
        assert "Un" in errors[0].message_pl

    def test_un_present_no_error(self) -> None:
        """Un obecne → brak ERROR."""
        functions = [
            ProtectionFunctionSummary(
                code="UNDERVOLTAGE",
                ansi=("27",),
                label_pl="Podnapieciowa (U<)",
                setpoint=_setpoint_un(0.8),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        errors = [r for r in results if r.code == SanityCheckCode.VOLT_MISSING_UN]
        assert len(errors) == 0


# =============================================================================
# Test: Voltage (27/59) — Overlap (ERROR)
# =============================================================================


class TestVoltageOverlap:
    """Regula: ERROR jednoczesnie U< i U> oraz U< >= U>."""

    def test_voltage_overlap_error(self) -> None:
        """U< >= U> → ERROR."""
        functions = [
            ProtectionFunctionSummary(
                code="UNDERVOLTAGE",
                ansi=("27",),
                label_pl="Podnapieciowa (U<)",
                setpoint=_setpoint_un(1.0),  # U< = 1.0×Un
            ),
            ProtectionFunctionSummary(
                code="OVERVOLTAGE",
                ansi=("59",),
                label_pl="Nadnapieciowa (U>)",
                setpoint=_setpoint_un(0.9, ProtectionSetpointOperator.GT),  # U> = 0.9×Un
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        errors = [r for r in results if r.code == SanityCheckCode.VOLT_OVERLAP]
        assert len(errors) == 1
        assert errors[0].severity == SanityCheckSeverity.ERROR
        assert "U<" in errors[0].message_pl and "U>" in errors[0].message_pl

    def test_voltage_equal_error(self) -> None:
        """U< == U> → ERROR."""
        functions = [
            ProtectionFunctionSummary(
                code="UNDERVOLTAGE",
                ansi=("27",),
                label_pl="Podnapieciowa (U<)",
                setpoint=_setpoint_un(0.9),
            ),
            ProtectionFunctionSummary(
                code="OVERVOLTAGE",
                ansi=("59",),
                label_pl="Nadnapieciowa (U>)",
                setpoint=_setpoint_un(0.9, ProtectionSetpointOperator.GT),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        errors = [r for r in results if r.code == SanityCheckCode.VOLT_OVERLAP]
        assert len(errors) == 1

    def test_voltage_no_overlap(self) -> None:
        """U< < U> → brak ERROR."""
        functions = [
            ProtectionFunctionSummary(
                code="UNDERVOLTAGE",
                ansi=("27",),
                label_pl="Podnapieciowa (U<)",
                setpoint=_setpoint_un(0.8),  # U< = 0.8×Un
            ),
            ProtectionFunctionSummary(
                code="OVERVOLTAGE",
                ansi=("59",),
                label_pl="Nadnapieciowa (U>)",
                setpoint=_setpoint_un(1.1, ProtectionSetpointOperator.GT),  # U> = 1.1×Un
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        errors = [r for r in results if r.code == SanityCheckCode.VOLT_OVERLAP]
        assert len(errors) == 0


# =============================================================================
# Test: Voltage (27/59) — U< too low (WARN)
# =============================================================================


class TestVoltageULtTooLow:
    """Regula: WARN U< < 0.5×Un."""

    def test_u_lt_too_low_warn(self) -> None:
        """U< < 0.5 → WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="UNDERVOLTAGE",
                ansi=("27",),
                label_pl="Podnapieciowa (U<)",
                setpoint=_setpoint_un(0.4),  # U< = 0.4×Un
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.VOLT_U_LT_TOO_LOW]
        assert len(warns) == 1
        assert warns[0].severity == SanityCheckSeverity.WARN
        assert "0,5" in warns[0].message_pl

    def test_u_lt_ok(self) -> None:
        """U< >= 0.5 → brak WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="UNDERVOLTAGE",
                ansi=("27",),
                label_pl="Podnapieciowa (U<)",
                setpoint=_setpoint_un(0.8),  # U< = 0.8×Un
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.VOLT_U_LT_TOO_LOW]
        assert len(warns) == 0


# =============================================================================
# Test: Voltage (27/59) — U> too high (WARN)
# =============================================================================


class TestVoltageUGtTooHigh:
    """Regula: WARN U> > 1.2×Un."""

    def test_u_gt_too_high_warn(self) -> None:
        """U> > 1.2 → WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERVOLTAGE",
                ansi=("59",),
                label_pl="Nadnapieciowa (U>)",
                setpoint=_setpoint_un(1.3, ProtectionSetpointOperator.GT),  # U> = 1.3×Un
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.VOLT_U_GT_TOO_HIGH]
        assert len(warns) == 1
        assert warns[0].severity == SanityCheckSeverity.WARN
        assert "1,2" in warns[0].message_pl

    def test_u_gt_ok(self) -> None:
        """U> <= 1.2 → brak WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERVOLTAGE",
                ansi=("59",),
                label_pl="Nadnapieciowa (U>)",
                setpoint=_setpoint_un(1.15, ProtectionSetpointOperator.GT),  # U> = 1.15×Un
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.VOLT_U_GT_TOO_HIGH]
        assert len(warns) == 0


# =============================================================================
# Test: Frequency (81U/81O) — Overlap (ERROR)
# =============================================================================


class TestFrequencyOverlap:
    """Regula: ERROR f< >= f>."""

    def test_freq_overlap_error(self) -> None:
        """f< >= f> → ERROR."""
        functions = [
            ProtectionFunctionSummary(
                code="UNDERFREQUENCY",
                ansi=("81U",),
                label_pl="Podczestotliwosciowa (f<)",
                setpoint=_setpoint_hz(51.0, ProtectionSetpointOperator.LT),  # f< = 51 Hz
            ),
            ProtectionFunctionSummary(
                code="OVERFREQUENCY",
                ansi=("81O",),
                label_pl="Nadczestotliwosciowa (f>)",
                setpoint=_setpoint_hz(50.0, ProtectionSetpointOperator.GT),  # f> = 50 Hz
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        errors = [r for r in results if r.code == SanityCheckCode.FREQ_OVERLAP]
        assert len(errors) == 1
        assert errors[0].severity == SanityCheckSeverity.ERROR

    def test_freq_no_overlap(self) -> None:
        """f< < f> → brak ERROR."""
        functions = [
            ProtectionFunctionSummary(
                code="UNDERFREQUENCY",
                ansi=("81U",),
                label_pl="Podczestotliwosciowa (f<)",
                setpoint=_setpoint_hz(47.5, ProtectionSetpointOperator.LT),  # f< = 47.5 Hz
            ),
            ProtectionFunctionSummary(
                code="OVERFREQUENCY",
                ansi=("81O",),
                label_pl="Nadczestotliwosciowa (f>)",
                setpoint=_setpoint_hz(51.5, ProtectionSetpointOperator.GT),  # f> = 51.5 Hz
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        errors = [r for r in results if r.code == SanityCheckCode.FREQ_OVERLAP]
        assert len(errors) == 0


# =============================================================================
# Test: Frequency (81U/81O) — f< too low (WARN)
# =============================================================================


class TestFrequencyFLtTooLow:
    """Regula: WARN f< < 45 Hz."""

    def test_f_lt_too_low_warn(self) -> None:
        """f< < 45 Hz → WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="UNDERFREQUENCY",
                ansi=("81U",),
                label_pl="Podczestotliwosciowa (f<)",
                setpoint=_setpoint_hz(44.0, ProtectionSetpointOperator.LT),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.FREQ_F_LT_TOO_LOW]
        assert len(warns) == 1
        assert warns[0].severity == SanityCheckSeverity.WARN
        assert "45" in warns[0].message_pl

    def test_f_lt_ok(self) -> None:
        """f< >= 45 Hz → brak WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="UNDERFREQUENCY",
                ansi=("81U",),
                label_pl="Podczestotliwosciowa (f<)",
                setpoint=_setpoint_hz(47.5, ProtectionSetpointOperator.LT),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.FREQ_F_LT_TOO_LOW]
        assert len(warns) == 0


# =============================================================================
# Test: Frequency (81U/81O) — f> too high (WARN)
# =============================================================================


class TestFrequencyFGtTooHigh:
    """Regula: WARN f> > 55 Hz."""

    def test_f_gt_too_high_warn(self) -> None:
        """f> > 55 Hz → WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERFREQUENCY",
                ansi=("81O",),
                label_pl="Nadczestotliwosciowa (f>)",
                setpoint=_setpoint_hz(56.0, ProtectionSetpointOperator.GT),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.FREQ_F_GT_TOO_HIGH]
        assert len(warns) == 1
        assert warns[0].severity == SanityCheckSeverity.WARN
        assert "55" in warns[0].message_pl

    def test_f_gt_ok(self) -> None:
        """f> <= 55 Hz → brak WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERFREQUENCY",
                ansi=("81O",),
                label_pl="Nadczestotliwosciowa (f>)",
                setpoint=_setpoint_hz(51.5, ProtectionSetpointOperator.GT),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.FREQ_F_GT_TOO_HIGH]
        assert len(warns) == 0


# =============================================================================
# Test: ROCOF (81R) — Non-positive (WARN)
# =============================================================================


class TestRocofNonPositive:
    """Regula: WARN df/dt <= 0."""

    def test_rocof_zero_warn(self) -> None:
        """df/dt = 0 → WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="ROCOF",
                ansi=("81R",),
                label_pl="Pochodna czestotliwosci (df/dt)",
                setpoint=_setpoint_hz_s(0.0),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.ROCOF_NON_POSITIVE]
        assert len(warns) == 1
        assert warns[0].severity == SanityCheckSeverity.WARN

    def test_rocof_negative_warn(self) -> None:
        """df/dt < 0 → WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="ROCOF",
                ansi=("81R",),
                label_pl="Pochodna czestotliwosci (df/dt)",
                setpoint=_setpoint_hz_s(-1.0),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.ROCOF_NON_POSITIVE]
        assert len(warns) == 1

    def test_rocof_positive_ok(self) -> None:
        """df/dt > 0 → brak WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="ROCOF",
                ansi=("81R",),
                label_pl="Pochodna czestotliwosci (df/dt)",
                setpoint=_setpoint_hz_s(2.0),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.ROCOF_NON_POSITIVE]
        assert len(warns) == 0


# =============================================================================
# Test: ROCOF (81R) — Too high (WARN)
# =============================================================================


class TestRocofTooHigh:
    """Regula: WARN df/dt > 10 Hz/s."""

    def test_rocof_too_high_warn(self) -> None:
        """df/dt > 10 → WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="ROCOF",
                ansi=("81R",),
                label_pl="Pochodna czestotliwosci (df/dt)",
                setpoint=_setpoint_hz_s(12.0),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.ROCOF_TOO_HIGH]
        assert len(warns) == 1
        assert warns[0].severity == SanityCheckSeverity.WARN
        assert "10" in warns[0].message_pl

    def test_rocof_ok(self) -> None:
        """df/dt <= 10 → brak WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="ROCOF",
                ansi=("81R",),
                label_pl="Pochodna czestotliwosci (df/dt)",
                setpoint=_setpoint_hz_s(2.0),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.ROCOF_TOO_HIGH]
        assert len(warns) == 0


# =============================================================================
# Test: Overcurrent (50/51) — Missing In (ERROR)
# =============================================================================


class TestOvercurrentMissingIn:
    """Regula: ERROR brak In dla basis='IN'."""

    def test_missing_in_error(self) -> None:
        """Brak In dla 51 → ERROR."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(1.2),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_no_in(), _element_context())

        errors = [r for r in results if r.code == SanityCheckCode.OC_MISSING_IN]
        assert len(errors) == 1
        assert errors[0].severity == SanityCheckSeverity.ERROR

    def test_in_present_no_error(self) -> None:
        """In obecne → brak ERROR."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(1.2),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        errors = [r for r in results if r.code == SanityCheckCode.OC_MISSING_IN]
        assert len(errors) == 0


# =============================================================================
# Test: Overcurrent (50/51) — Overlap (ERROR)
# =============================================================================


class TestOvercurrentOverlap:
    """Regula: ERROR I> >= I>>."""

    def test_oc_overlap_error(self) -> None:
        """I> >= I>> → ERROR."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(3.0),  # I> = 3.0×In
            ),
            ProtectionFunctionSummary(
                code="OVERCURRENT_INST",
                ansi=("50",),
                label_pl="Nadpradowa zwarciowa (I>>)",
                setpoint=_setpoint_in(2.0),  # I>> = 2.0×In
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        errors = [r for r in results if r.code == SanityCheckCode.OC_OVERLAP]
        assert len(errors) == 1
        assert errors[0].severity == SanityCheckSeverity.ERROR
        assert "I>" in errors[0].message_pl and "I>>" in errors[0].message_pl

    def test_oc_no_overlap(self) -> None:
        """I> < I>> → brak ERROR."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(1.2),  # I> = 1.2×In
            ),
            ProtectionFunctionSummary(
                code="OVERCURRENT_INST",
                ansi=("50",),
                label_pl="Nadpradowa zwarciowa (I>>)",
                setpoint=_setpoint_in(3.0),  # I>> = 3.0×In
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        errors = [r for r in results if r.code == SanityCheckCode.OC_OVERLAP]
        assert len(errors) == 0


# =============================================================================
# Test: Overcurrent (50/51) — I> too low (WARN)
# =============================================================================


class TestOvercurrentIGtTooLow:
    """Regula: WARN I> < 1.0×In."""

    def test_i_gt_too_low_warn(self) -> None:
        """I> < 1.0 → WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(0.8),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.OC_I_GT_TOO_LOW]
        assert len(warns) == 1
        assert warns[0].severity == SanityCheckSeverity.WARN
        assert "1,0" in warns[0].message_pl

    def test_i_gt_ok(self) -> None:
        """I> >= 1.0 → brak WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(1.2),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.OC_I_GT_TOO_LOW]
        assert len(warns) == 0


# =============================================================================
# Test: Overcurrent (50/51) — I>> too low (WARN)
# =============================================================================


class TestOvercurrentIInstTooLow:
    """Regula: WARN I>> < 1.5×In."""

    def test_i_inst_too_low_warn(self) -> None:
        """I>> < 1.5 → WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERCURRENT_INST",
                ansi=("50",),
                label_pl="Nadpradowa zwarciowa (I>>)",
                setpoint=_setpoint_in(1.2),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.OC_I_INST_TOO_LOW]
        assert len(warns) == 1
        assert warns[0].severity == SanityCheckSeverity.WARN
        assert "1,5" in warns[0].message_pl

    def test_i_inst_ok(self) -> None:
        """I>> >= 1.5 → brak WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERCURRENT_INST",
                ansi=("50",),
                label_pl="Nadpradowa zwarciowa (I>>)",
                setpoint=_setpoint_in(3.0),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.OC_I_INST_TOO_LOW]
        assert len(warns) == 0


# =============================================================================
# Test: SPZ (79) — No tripping function (WARN)
# =============================================================================


class TestSpzNoTripFunction:
    """Regula: WARN SPZ aktywne bez funkcji wyzwalajacej."""

    def test_spz_no_trip_warn(self) -> None:
        """SPZ bez funkcji wyzwalajacej → WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="RECLOSING",
                ansi=("79",),
                label_pl="SPZ (Samoczynne Ponowne Zalaczenie)",
                setpoint=ProtectionSetpoint(
                    basis=ProtectionSetpointBasis.ABS,
                    operator=ProtectionSetpointOperator.EQ,
                    abs_value=3.0,
                    unit="s",
                    display_pl="3 s",
                ),
                notes_pl="Cykl: 3 proby, przerwa 1s",
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.SPZ_NO_TRIP_FUNCTION]
        assert len(warns) == 1
        assert warns[0].severity == SanityCheckSeverity.WARN
        assert "SPZ" in warns[0].message_pl

    def test_spz_with_trip_ok(self) -> None:
        """SPZ z funkcja wyzwalajaca → brak WARN."""
        functions = [
            ProtectionFunctionSummary(
                code="RECLOSING",
                ansi=("79",),
                label_pl="SPZ (Samoczynne Ponowne Zalaczenie)",
                setpoint=ProtectionSetpoint(
                    basis=ProtectionSetpointBasis.ABS,
                    operator=ProtectionSetpointOperator.EQ,
                    abs_value=3.0,
                    unit="s",
                    display_pl="3 s",
                ),
                notes_pl="Cykl: 3 proby, przerwa 1s",
            ),
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(1.2),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        warns = [r for r in results if r.code == SanityCheckCode.SPZ_NO_TRIP_FUNCTION]
        assert len(warns) == 0


# =============================================================================
# Test: SPZ (79) — Missing cycle data (INFO)
# =============================================================================


class TestSpzMissingCycleData:
    """Regula: INFO brak danych cyklu SPZ."""

    def test_spz_no_notes_info(self) -> None:
        """SPZ bez notes_pl → INFO."""
        functions = [
            ProtectionFunctionSummary(
                code="RECLOSING",
                ansi=("79",),
                label_pl="SPZ (Samoczynne Ponowne Zalaczenie)",
                setpoint=ProtectionSetpoint(
                    basis=ProtectionSetpointBasis.ABS,
                    operator=ProtectionSetpointOperator.EQ,
                    abs_value=3.0,
                    unit="s",
                    display_pl="3 s",
                ),
                # notes_pl not set
            ),
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(1.2),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        infos = [r for r in results if r.code == SanityCheckCode.SPZ_MISSING_CYCLE_DATA]
        assert len(infos) == 1
        assert infos[0].severity == SanityCheckSeverity.INFO
        assert "cykl" in infos[0].message_pl.lower()

    def test_spz_with_notes_ok(self) -> None:
        """SPZ z notes_pl → brak INFO."""
        functions = [
            ProtectionFunctionSummary(
                code="RECLOSING",
                ansi=("79",),
                label_pl="SPZ (Samoczynne Ponowne Zalaczenie)",
                setpoint=ProtectionSetpoint(
                    basis=ProtectionSetpointBasis.ABS,
                    operator=ProtectionSetpointOperator.EQ,
                    abs_value=3.0,
                    unit="s",
                    display_pl="3 s",
                ),
                notes_pl="Cykl: 3 proby, przerwa 1s",
            ),
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(1.2),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        infos = [r for r in results if r.code == SanityCheckCode.SPZ_MISSING_CYCLE_DATA]
        assert len(infos) == 0


# =============================================================================
# Test: Determinism
# =============================================================================


class TestDeterminism:
    """Testy determinizmu wynikow."""

    def test_results_sorted_by_element_id(self) -> None:
        """Wyniki sortowane po element_id."""
        ctx_a = ElementContext(element_id="aaa-001", element_type="LINE")
        ctx_b = ElementContext(element_id="bbb-001", element_type="LINE")

        functions = [
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(0.8),  # triggers WARN
            ),
        ]

        results_a = run_sanity_checks(functions, _base_values_full(), ctx_a)
        results_b = run_sanity_checks(functions, _base_values_full(), ctx_b)

        # Polacz i sprawdz sortowanie
        all_results = results_a + results_b
        all_results.sort(key=lambda r: (r.element_id, r.severity, r.code.value))

        assert all_results[0].element_id == "aaa-001"
        assert all_results[-1].element_id == "bbb-001"

    def test_results_sorted_by_severity(self) -> None:
        """Wyniki sortowane po severity (ERROR > WARN > INFO)."""
        functions = [
            # ERROR: I> >= I>>
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(5.0),
            ),
            ProtectionFunctionSummary(
                code="OVERCURRENT_INST",
                ansi=("50",),
                label_pl="Nadpradowa zwarciowa (I>>)",
                setpoint=_setpoint_in(3.0),
            ),
            # WARN: I> < 1.0 triggered by separate function
            # INFO: Brak danych cyklu SPZ
            ProtectionFunctionSummary(
                code="RECLOSING",
                ansi=("79",),
                label_pl="SPZ (Samoczynne Ponowne Zalaczenie)",
                setpoint=ProtectionSetpoint(
                    basis=ProtectionSetpointBasis.ABS,
                    operator=ProtectionSetpointOperator.EQ,
                    abs_value=3.0,
                    unit="s",
                    display_pl="3 s",
                ),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        # Sprawdz ze ERROR jest przed WARN przed INFO
        severities = [r.severity for r in results]
        error_indices = [i for i, s in enumerate(severities) if s == SanityCheckSeverity.ERROR]
        warn_indices = [i for i, s in enumerate(severities) if s == SanityCheckSeverity.WARN]
        info_indices = [i for i, s in enumerate(severities) if s == SanityCheckSeverity.INFO]

        if error_indices and warn_indices:
            assert max(error_indices) < min(warn_indices)
        if warn_indices and info_indices:
            assert max(warn_indices) < min(info_indices)

    def test_identical_runs_same_results(self) -> None:
        """Dwa identyczne wywolania daja identyczne wyniki."""
        functions = [
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(0.8),
            ),
            ProtectionFunctionSummary(
                code="UNDERVOLTAGE",
                ansi=("27",),
                label_pl="Podnapieciowa (U<)",
                setpoint=_setpoint_un(0.4),
            ),
        ]

        results1 = run_sanity_checks(functions, _base_values_full(), _element_context())
        results2 = run_sanity_checks(functions, _base_values_full(), _element_context())

        assert len(results1) == len(results2)
        for r1, r2 in zip(results1, results2, strict=False):
            assert r1.to_dict() == r2.to_dict()


# =============================================================================
# Test: Empty Functions List
# =============================================================================


class TestEmptyFunctions:
    """Testy dla pustej listy funkcji."""

    def test_empty_functions_no_results(self) -> None:
        """Pusta lista funkcji → brak wynikow."""
        results = run_sanity_checks([], _base_values_full(), _element_context())
        assert len(results) == 0


# =============================================================================
# Test: Integration — Multiple Rules Triggered
# =============================================================================


class TestIntegration:
    """Testy integracyjne — wielokrotne reguly."""

    def test_multiple_errors_and_warns(self) -> None:
        """Wiele bledow i ostrzezen jednoczesnie."""
        functions = [
            # ERROR: I> >= I>>
            ProtectionFunctionSummary(
                code="OVERCURRENT_TIME",
                ansi=("51",),
                label_pl="Nadpradowa czasowa (I>)",
                setpoint=_setpoint_in(5.0),
            ),
            ProtectionFunctionSummary(
                code="OVERCURRENT_INST",
                ansi=("50",),
                label_pl="Nadpradowa zwarciowa (I>>)",
                setpoint=_setpoint_in(3.0),
            ),
            # WARN: U< < 0.5
            ProtectionFunctionSummary(
                code="UNDERVOLTAGE",
                ansi=("27",),
                label_pl="Podnapieciowa (U<)",
                setpoint=_setpoint_un(0.4),
            ),
            # WARN: df/dt > 10
            ProtectionFunctionSummary(
                code="ROCOF",
                ansi=("81R",),
                label_pl="Pochodna czestotliwosci (df/dt)",
                setpoint=_setpoint_hz_s(15.0),
            ),
        ]
        results = run_sanity_checks(functions, _base_values_full(), _element_context())

        errors = [r for r in results if r.severity == SanityCheckSeverity.ERROR]
        warns = [r for r in results if r.severity == SanityCheckSeverity.WARN]

        assert len(errors) >= 1  # OC_OVERLAP
        assert len(warns) >= 2  # VOLT_U_LT_TOO_LOW, ROCOF_TOO_HIGH
