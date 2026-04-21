"""
P16c — Testy Base Values Resolver.

Przypadki testowe zgodne z DoD:
1. linia: IN znane → computed dla 3×In
2. trafo: IN wyliczane z Sn/Un (strona) → computed
3. brak danych → computed brak, źródło UNKNOWN
4. 27/59: UN z busbar → computed dla 0,8×Un / 1,15×Un
5. 81U/81O/81R: ABS Hz/Hz/s → computed_from='wartosc bezwzgledna'
6. computed_from zawsze wypełnione

100% POLISH UI where applicable.
"""

from __future__ import annotations

import math

import pytest
from application.analyses.protection.base_values.compute import (
    compute_from_setpoint,
    enrich_with_computed,
)
from application.analyses.protection.base_values.models import (
    BaseValues,
    BaseValueSourceIn,
    BaseValueSourceUn,
    ProtectedElementContext,
    ProtectedElementType,
    ProtectionComputedValue,
    ProtectionSetpoint,
    ProtectionSetpointBasis,
    ProtectionSetpointOperator,
    TransformerSide,
)
from application.analyses.protection.base_values.resolver import resolve_base_values

# =============================================================================
# Test: Linia — IN znane → computed dla 3×In
# =============================================================================


class TestLineInKnown:
    """Linia z known rated_current_a."""

    def test_resolve_in_from_line(self) -> None:
        """IN = line.rated_current_a."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.LINE,
            element_id="line-001",
            bus_voltage_kv=15.0,
            line_rated_current_a=503.0,
        )
        base = resolve_base_values(ctx)

        assert base.in_a == 503.0
        assert base.source_in == BaseValueSourceIn.LINE
        assert "503" in base.notes_pl
        assert "linia" in base.notes_pl.lower()

    def test_computed_3x_in(self) -> None:
        """I>> = 3×In → computed = 3 × 503 = 1509 A."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.LINE,
            element_id="line-001",
            bus_voltage_kv=15.0,
            line_rated_current_a=503.0,
        )
        base = resolve_base_values(ctx)

        setpoint = ProtectionSetpoint(
            basis=ProtectionSetpointBasis.IN,
            operator=ProtectionSetpointOperator.GT,
            multiplier=3.0,
            unit="pu",
            display_pl="3×In",
        )

        computed = compute_from_setpoint(setpoint, base)

        assert computed is not None
        assert computed.value == pytest.approx(1509.0)
        assert computed.unit == "A"
        assert "3" in computed.computed_from
        assert "In" in computed.computed_from
        assert "503" in computed.computed_from


# =============================================================================
# Test: Transformator — IN wyliczane z Sn/Un (strona) → computed
# =============================================================================


class TestTransformerInCalculated:
    """Transformator z In wyliczanym z Sn/Un."""

    def test_resolve_in_from_transformer_lv_side(self) -> None:
        """IN = Sn / (√3 × Un_LV) dla strony nN."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.TRANSFORMER,
            element_id="trafo-001",
            bus_voltage_kv=0.4,
            transformer_rated_power_mva=0.63,  # 630 kVA
            transformer_voltage_hv_kv=15.0,
            transformer_voltage_lv_kv=0.4,
            transformer_side=TransformerSide.LV,
        )
        base = resolve_base_values(ctx)

        # In = 0.63 MVA × 1000 / (√3 × 0.4 kV) = 630 / 0.6928 ≈ 909.3 A
        expected_in = (0.63 * 1000) / (math.sqrt(3) * 0.4)

        assert base.in_a is not None
        assert base.in_a == pytest.approx(expected_in, rel=0.01)
        assert base.source_in == BaseValueSourceIn.TRANSFORMER_SIDE
        assert "Sn" in base.notes_pl or "sqrt" in base.notes_pl

    def test_resolve_in_from_transformer_hv_side(self) -> None:
        """IN = Sn / (√3 × Un_HV) dla strony WN."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.TRANSFORMER,
            element_id="trafo-002",
            bus_voltage_kv=15.0,
            transformer_rated_power_mva=1.6,  # 1.6 MVA
            transformer_voltage_hv_kv=15.0,
            transformer_voltage_lv_kv=0.4,
            transformer_side=TransformerSide.HV,
        )
        base = resolve_base_values(ctx)

        # In = 1.6 MVA × 1000 / (√3 × 15 kV) = 1600 / 25.98 ≈ 61.6 A
        expected_in = (1.6 * 1000) / (math.sqrt(3) * 15.0)

        assert base.in_a is not None
        assert base.in_a == pytest.approx(expected_in, rel=0.01)
        assert base.source_in == BaseValueSourceIn.TRANSFORMER_SIDE

    def test_computed_1_2x_in_transformer(self) -> None:
        """I> = 1.2×In dla transformatora."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.TRANSFORMER,
            element_id="trafo-001",
            transformer_rated_power_mva=0.63,
            transformer_voltage_hv_kv=15.0,
            transformer_voltage_lv_kv=0.4,
            transformer_side=TransformerSide.LV,
        )
        base = resolve_base_values(ctx)

        setpoint = ProtectionSetpoint(
            basis=ProtectionSetpointBasis.IN,
            operator=ProtectionSetpointOperator.GT,
            multiplier=1.2,
            unit="pu",
            display_pl="1,2×In",
        )

        computed = compute_from_setpoint(setpoint, base)

        assert computed is not None
        assert computed.unit == "A"
        assert computed.computed_from != ""
        # 1.2 × ~909.3 ≈ 1091 A
        assert computed.value == pytest.approx(1.2 * base.in_a, rel=0.01)


# =============================================================================
# Test: Brak danych → computed brak, źródło UNKNOWN
# =============================================================================


class TestMissingData:
    """Brak danych znamionowych."""

    def test_line_missing_rated_current(self) -> None:
        """Linia bez rated_current_a → IN = UNKNOWN."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.LINE,
            element_id="line-no-data",
            bus_voltage_kv=15.0,
            # line_rated_current_a not set
        )
        base = resolve_base_values(ctx)

        assert base.in_a is None
        assert base.source_in == BaseValueSourceIn.UNKNOWN
        assert base.has_in is False

    def test_missing_voltage(self) -> None:
        """Brak napięcia → UN = UNKNOWN."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.LINE,
            element_id="line-no-voltage",
            # bus_voltage_kv not set
            line_rated_current_a=250.0,
        )
        base = resolve_base_values(ctx)

        assert base.un_kv is None
        assert base.source_un == BaseValueSourceUn.UNKNOWN
        assert base.has_un is False

    def test_computed_none_when_base_missing(self) -> None:
        """Computed = None gdy brak bazy."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.LINE,
            element_id="line-no-data",
            # all data missing
        )
        base = resolve_base_values(ctx)

        setpoint = ProtectionSetpoint(
            basis=ProtectionSetpointBasis.IN,
            operator=ProtectionSetpointOperator.GT,
            multiplier=3.0,
            unit="pu",
            display_pl="3×In",
        )

        computed = compute_from_setpoint(setpoint, base)

        assert computed is None


# =============================================================================
# Test: 27/59 — UN z busbar → computed dla 0,8×Un / 1,15×Un
# =============================================================================


class TestVoltageProtection:
    """Zabezpieczenia napięciowe 27/59."""

    def test_resolve_un_from_bus(self) -> None:
        """UN = bus_voltage_kv."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.BUS,
            element_id="bus-001",
            bus_voltage_kv=15.0,
        )
        base = resolve_base_values(ctx)

        assert base.un_kv == 15.0
        assert base.source_un == BaseValueSourceUn.BUS
        assert "15" in base.notes_pl
        assert "szyna" in base.notes_pl.lower()

    def test_computed_0_8x_un_undervoltage(self) -> None:
        """U< (27) = 0.8×Un → computed = 0.8 × 15 = 12 kV."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.BUS,
            element_id="bus-001",
            bus_voltage_kv=15.0,
        )
        base = resolve_base_values(ctx)

        setpoint = ProtectionSetpoint(
            basis=ProtectionSetpointBasis.UN,
            operator=ProtectionSetpointOperator.LT,
            multiplier=0.8,
            unit="pu",
            display_pl="0,8×Un",
        )

        computed = compute_from_setpoint(setpoint, base)

        assert computed is not None
        assert computed.value == pytest.approx(12.0)
        assert computed.unit == "kV"
        assert "0.8" in computed.computed_from
        assert "Un" in computed.computed_from
        assert "15" in computed.computed_from

    def test_computed_1_15x_un_overvoltage(self) -> None:
        """U> (59) = 1.15×Un → computed = 1.15 × 15 = 17.25 kV."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.BUS,
            element_id="bus-001",
            bus_voltage_kv=15.0,
        )
        base = resolve_base_values(ctx)

        setpoint = ProtectionSetpoint(
            basis=ProtectionSetpointBasis.UN,
            operator=ProtectionSetpointOperator.GT,
            multiplier=1.15,
            unit="pu",
            display_pl="1,15×Un",
        )

        computed = compute_from_setpoint(setpoint, base)

        assert computed is not None
        assert computed.value == pytest.approx(17.25)
        assert computed.unit == "kV"

    def test_vt_primary_preferred_over_bus(self) -> None:
        """VT primary ma wyższy priorytet niż bus voltage."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.BUS,
            element_id="bus-001",
            bus_voltage_kv=15.0,
            vt_primary_kv=15.75,  # VT primary slightly different
        )
        base = resolve_base_values(ctx)

        assert base.un_kv == 15.75
        assert base.source_un == BaseValueSourceUn.VT_PRIMARY


# =============================================================================
# Test: 81U/81O/81R — ABS Hz/Hz/s → computed_from='wartosc bezwzgledna'
# =============================================================================


class TestFrequencyProtection:
    """Zabezpieczenia częstotliwościowe 81U/81O/81R."""

    def test_underfrequency_abs(self) -> None:
        """f< (81U) = 47.5 Hz → computed_from='wartosc bezwzgledna'."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.BoundaryNode,
            element_id="connection_node-001",
            connection_voltage_kv=15.0,
        )
        base = resolve_base_values(ctx)

        setpoint = ProtectionSetpoint(
            basis=ProtectionSetpointBasis.ABS,
            operator=ProtectionSetpointOperator.LT,
            abs_value=47.5,
            unit="Hz",
            display_pl="47,5 Hz",
        )

        computed = compute_from_setpoint(setpoint, base)

        assert computed is not None
        assert computed.value == 47.5
        assert computed.unit == "Hz"
        assert computed.computed_from == "wartosc bezwzgledna"

    def test_overfrequency_abs(self) -> None:
        """f> (81O) = 51.5 Hz."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.BoundaryNode,
            element_id="connection_node-001",
        )
        base = resolve_base_values(ctx)

        setpoint = ProtectionSetpoint(
            basis=ProtectionSetpointBasis.ABS,
            operator=ProtectionSetpointOperator.GT,
            abs_value=51.5,
            unit="Hz",
            display_pl="51,5 Hz",
        )

        computed = compute_from_setpoint(setpoint, base)

        assert computed is not None
        assert computed.value == 51.5
        assert computed.unit == "Hz"
        assert computed.computed_from == "wartosc bezwzgledna"

    def test_rocof_abs(self) -> None:
        """df/dt (81R) = 2 Hz/s."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.BoundaryNode,
            element_id="connection_node-001",
        )
        base = resolve_base_values(ctx)

        setpoint = ProtectionSetpoint(
            basis=ProtectionSetpointBasis.ABS,
            operator=ProtectionSetpointOperator.GT,
            abs_value=2.0,
            unit="Hz/s",
            display_pl="2 Hz/s",
        )

        computed = compute_from_setpoint(setpoint, base)

        assert computed is not None
        assert computed.value == 2.0
        assert computed.unit == "Hz/s"
        assert computed.computed_from == "wartosc bezwzgledna"


# =============================================================================
# Test: computed_from zawsze wypełnione
# =============================================================================


class TestComputedFromRequired:
    """computed_from musi być zawsze niepuste."""

    def test_computed_value_requires_computed_from(self) -> None:
        """ProtectionComputedValue wymaga computed_from."""
        with pytest.raises(ValueError, match="computed_from"):
            ProtectionComputedValue(
                value=100.0,
                unit="A",
                computed_from="",  # empty string should raise
            )

    def test_all_computed_values_have_computed_from(self) -> None:
        """Wszystkie wyliczone computed mają computed_from."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.LINE,
            element_id="line-001",
            bus_voltage_kv=15.0,
            line_rated_current_a=503.0,
        )
        base = resolve_base_values(ctx)

        setpoints = [
            ProtectionSetpoint(
                basis=ProtectionSetpointBasis.IN,
                operator=ProtectionSetpointOperator.GT,
                multiplier=1.2,
                unit="pu",
                display_pl="1,2×In",
            ),
            ProtectionSetpoint(
                basis=ProtectionSetpointBasis.IN,
                operator=ProtectionSetpointOperator.GT,
                multiplier=3.0,
                unit="pu",
                display_pl="3×In",
            ),
            ProtectionSetpoint(
                basis=ProtectionSetpointBasis.UN,
                operator=ProtectionSetpointOperator.LT,
                multiplier=0.8,
                unit="pu",
                display_pl="0,8×Un",
            ),
            ProtectionSetpoint(
                basis=ProtectionSetpointBasis.ABS,
                operator=ProtectionSetpointOperator.LT,
                abs_value=47.5,
                unit="Hz",
                display_pl="47,5 Hz",
            ),
        ]

        enriched = enrich_with_computed(setpoints, base)

        for _sp, computed in enriched:
            if computed is not None:
                assert computed.computed_from != ""
                assert len(computed.computed_from) > 0


# =============================================================================
# Test: BoundaryNode — węzeł przyłączenia
# =============================================================================


class TestPccProtection:
    """BoundaryNode – węzeł przyłączenia."""

    def test_resolve_connection_node_voltage(self) -> None:
        """Un z BoundaryNode voltage."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.BoundaryNode,
            element_id="connection_node-001",
            connection_voltage_kv=110.0,
            connection_rated_current_a=630.0,
        )
        base = resolve_base_values(ctx)

        assert base.un_kv == 110.0
        assert base.source_un == BaseValueSourceUn.BoundaryNode
        assert "BoundaryNode" in base.notes_pl

    def test_resolve_connection_node_current(self) -> None:
        """In z BoundaryNode rated current."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.BoundaryNode,
            element_id="connection_node-001",
            connection_voltage_kv=110.0,
            connection_rated_current_a=630.0,
        )
        base = resolve_base_values(ctx)

        assert base.in_a == 630.0
        assert base.source_in == BaseValueSourceIn.BoundaryNode


# =============================================================================
# Test: Wyłącznik (Breaker)
# =============================================================================


class TestBreakerProtection:
    """Zabezpieczenie na wyłączniku."""

    def test_resolve_breaker_rated_current(self) -> None:
        """In z breaker rated current."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.BREAKER,
            element_id="breaker-001",
            bus_voltage_kv=15.0,
            breaker_rated_current_a=1250.0,
        )
        base = resolve_base_values(ctx)

        assert base.in_a == 1250.0
        assert base.source_in == BaseValueSourceIn.BREAKER
        assert "wylacznik" in base.notes_pl.lower()


# =============================================================================
# Test: Model Invariants
# =============================================================================


class TestModelInvariants:
    """Testy niezmienników modelu."""

    def test_base_values_invariant_un(self) -> None:
        """un_kv=None wymaga source_un=UNKNOWN."""
        with pytest.raises(ValueError):
            BaseValues(
                un_kv=None,
                in_a=100.0,
                source_un=BaseValueSourceUn.BUS,  # powinno być UNKNOWN
                source_in=BaseValueSourceIn.LINE,
            )

    def test_base_values_invariant_in(self) -> None:
        """in_a=None wymaga source_in=UNKNOWN."""
        with pytest.raises(ValueError):
            BaseValues(
                un_kv=15.0,
                in_a=None,
                source_un=BaseValueSourceUn.BUS,
                source_in=BaseValueSourceIn.LINE,  # powinno być UNKNOWN
            )

    def test_setpoint_in_requires_multiplier(self) -> None:
        """Setpoint z basis=IN wymaga multiplier."""
        with pytest.raises(ValueError, match="multiplier"):
            ProtectionSetpoint(
                basis=ProtectionSetpointBasis.IN,
                operator=ProtectionSetpointOperator.GT,
                unit="pu",
                display_pl="3×In",
                # multiplier not set
            )

    def test_setpoint_un_requires_pu_unit(self) -> None:
        """Setpoint z basis=UN wymaga unit='pu'."""
        with pytest.raises(ValueError, match="pu"):
            ProtectionSetpoint(
                basis=ProtectionSetpointBasis.UN,
                operator=ProtectionSetpointOperator.LT,
                multiplier=0.8,
                unit="kV",  # should be 'pu'
                display_pl="0,8×Un",
            )

    def test_setpoint_abs_requires_abs_value(self) -> None:
        """Setpoint z basis=ABS wymaga abs_value."""
        with pytest.raises(ValueError, match="abs_value"):
            ProtectionSetpoint(
                basis=ProtectionSetpointBasis.ABS,
                operator=ProtectionSetpointOperator.LT,
                unit="Hz",
                display_pl="47,5 Hz",
                # abs_value not set
            )


# =============================================================================
# Test: Serialization
# =============================================================================


class TestSerialization:
    """Testy serializacji do dict."""

    def test_base_values_to_dict(self) -> None:
        """BaseValues.to_dict()."""
        base = BaseValues(
            un_kv=15.0,
            in_a=503.0,
            source_un=BaseValueSourceUn.BUS,
            source_in=BaseValueSourceIn.LINE,
            notes_pl="Testowa notatka",
        )
        d = base.to_dict()

        assert d["un_kv"] == 15.0
        assert d["un_v"] == 15000.0
        assert d["in_a"] == 503.0
        assert d["source_un"] == "BUS"
        assert d["source_in"] == "LINE"
        assert d["notes_pl"] == "Testowa notatka"

    def test_setpoint_to_dict(self) -> None:
        """ProtectionSetpoint.to_dict()."""
        sp = ProtectionSetpoint(
            basis=ProtectionSetpointBasis.IN,
            operator=ProtectionSetpointOperator.GT,
            multiplier=3.0,
            unit="pu",
            display_pl="3×In",
        )
        d = sp.to_dict()

        assert d["basis"] == "IN"
        assert d["operator"] == "GT"
        assert d["multiplier"] == 3.0
        assert d["unit"] == "pu"
        assert d["display_pl"] == "3×In"

    def test_computed_to_dict(self) -> None:
        """ProtectionComputedValue.to_dict()."""
        cv = ProtectionComputedValue(
            value=1509.0,
            unit="A",
            computed_from="3 × In (503 A)",
        )
        d = cv.to_dict()

        assert d["value"] == 1509.0
        assert d["unit"] == "A"
        assert d["computed_from"] == "3 × In (503 A)"

    def test_context_to_dict(self) -> None:
        """ProtectedElementContext.to_dict()."""
        ctx = ProtectedElementContext(
            element_type=ProtectedElementType.TRANSFORMER,
            element_id="trafo-001",
            bus_voltage_kv=0.4,
            transformer_rated_power_mva=0.63,
            transformer_voltage_hv_kv=15.0,
            transformer_voltage_lv_kv=0.4,
            transformer_side=TransformerSide.LV,
        )
        d = ctx.to_dict()

        assert d["element_type"] == "TRANSFORMER"
        assert d["element_id"] == "trafo-001"
        assert d["transformer_side"] == "LV"
