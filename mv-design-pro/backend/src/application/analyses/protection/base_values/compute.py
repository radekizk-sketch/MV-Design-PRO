"""
Protection Computed Value Generator.

Generuje wartości computed z setpoint + BaseValues.

REGUŁY GENEROWANIA (zgodne z kontraktem P16b):

1. basis='IN' i znamy in_a:
   computed = multiplier × in_a [A]
   computed_from = "multiplier × In (X.X × Y.Y A)"

2. basis='UN' i znamy un_kv:
   computed = multiplier × un_kv [kV] lub un_v [V]
   computed_from = "multiplier × Un (X.X × Y.Y kV)"

3. basis='ABS':
   computed = abs_value [Hz/Hz/s/etc]
   computed_from = "wartosc bezwzgledna"

4. Brak bazy (UNKNOWN):
   computed = None (pominięte)

ZASADA KLUCZOWA:
- computed_from ZAWSZE musi być niepuste i opisowe
- Brak zaokrągleń "na oko" — formatowanie zostawiamy UI
"""

from __future__ import annotations

from application.analyses.protection.base_values.models import (
    BaseValues,
    ProtectionComputedUnit,
    ProtectionComputedValue,
    ProtectionSetpoint,
    ProtectionSetpointBasis,
)


def compute_from_setpoint(
    setpoint: ProtectionSetpoint,
    base_values: BaseValues,
) -> ProtectionComputedValue | None:
    """
    Oblicz wartość computed z setpoint i wartości bazowych.

    Args:
        setpoint: nastawa (źródło prawdy)
        base_values: rozwiązane wartości Un/In

    Returns:
        ProtectionComputedValue jeśli możliwe do obliczenia, None w przeciwnym razie
    """
    basis = setpoint.basis

    # === ABS: wartość bezwzględna ===
    if basis == ProtectionSetpointBasis.ABS:
        return _compute_abs(setpoint)

    # === IN: wielokrotność prądu znamionowego ===
    if basis == ProtectionSetpointBasis.IN:
        return _compute_in_multiplier(setpoint, base_values)

    # === UN: wielokrotność napięcia znamionowego ===
    if basis == ProtectionSetpointBasis.UN:
        return _compute_un_multiplier(setpoint, base_values)

    # === HZ: częstotliwość bazowa (rzadko używane) ===
    if basis == ProtectionSetpointBasis.HZ:
        # HZ basis zwykle używa multipliera względem fn=50Hz
        # Dla uproszczenia traktujemy jak ABS z fn=50Hz
        if setpoint.multiplier is not None:
            fn = 50.0  # Domyślna częstotliwość bazowa [Hz]
            value = setpoint.multiplier * fn
            return ProtectionComputedValue(
                value=value,
                unit="Hz",
                computed_from=f"{_format_number(setpoint.multiplier)} × fn ({fn} Hz) = {_format_number(value)} Hz",
            )
        return None

    return None


def _compute_abs(setpoint: ProtectionSetpoint) -> ProtectionComputedValue | None:
    """Oblicz computed dla basis=ABS."""
    if setpoint.abs_value is None:
        return None

    # Mapuj jednostkę setpoint na computed unit
    unit_mapping: dict[str, ProtectionComputedUnit] = {
        "Hz": "Hz",
        "Hz/s": "Hz/s",
        "A": "A",
        "V": "V",
        "kV": "kV",
    }

    unit = setpoint.unit
    if unit not in unit_mapping:
        # Jednostki jak 'pu', 's', '%' nie mają odpowiednika computed
        return None

    computed_unit = unit_mapping[unit]

    return ProtectionComputedValue(
        value=setpoint.abs_value,
        unit=computed_unit,
        computed_from="wartość bezwzględna",
    )


def _compute_in_multiplier(
    setpoint: ProtectionSetpoint,
    base_values: BaseValues,
) -> ProtectionComputedValue | None:
    """Oblicz computed dla basis=IN (wielokrotność prądu)."""
    if setpoint.multiplier is None:
        return None

    if not base_values.has_in:
        return None

    in_a = base_values.in_a
    assert in_a is not None  # już sprawdzone przez has_in

    value = setpoint.multiplier * in_a

    return ProtectionComputedValue(
        value=value,
        unit="A",
        computed_from=f"{_format_number(setpoint.multiplier)} × In ({_format_number(in_a)} A)",
    )


def _compute_un_multiplier(
    setpoint: ProtectionSetpoint,
    base_values: BaseValues,
) -> ProtectionComputedValue | None:
    """Oblicz computed dla basis=UN (wielokrotność napięcia)."""
    if setpoint.multiplier is None:
        return None

    if not base_values.has_un:
        return None

    un_kv = base_values.un_kv
    assert un_kv is not None  # już sprawdzone przez has_un

    value = setpoint.multiplier * un_kv

    return ProtectionComputedValue(
        value=value,
        unit="kV",
        computed_from=f"{_format_number(setpoint.multiplier)} × Un ({_format_number(un_kv)} kV)",
    )


def _format_number(value: float) -> str:
    """
    Formatuj liczbę do czytelnego stringa.

    Używa polskiego formatowania (przecinek dziesiętny jest na UI,
    tu zostawiamy kropkę dla spójności z Python).
    """
    if value == int(value):
        return str(int(value))
    return f"{value:.2f}".rstrip("0").rstrip(".")


def enrich_with_computed(
    setpoints: list[ProtectionSetpoint],
    base_values: BaseValues,
) -> list[tuple[ProtectionSetpoint, ProtectionComputedValue | None]]:
    """
    Wzbogać listę setpointów o wartości computed.

    Args:
        setpoints: lista nastaw
        base_values: rozwiązane wartości bazowe

    Returns:
        Lista tupli (setpoint, computed) gdzie computed może być None
    """
    result = []
    for sp in setpoints:
        computed = compute_from_setpoint(sp, base_values)
        result.append((sp, computed))
    return result
