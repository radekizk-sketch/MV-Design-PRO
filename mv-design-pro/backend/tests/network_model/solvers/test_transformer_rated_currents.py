"""Parytet liczbowy relokacji pradow znamionowych transformatora (kreator -> backend, karta R2).

Reprodukuje wzor TypeScript, ktory liczyl fizyke w warstwie prezentacji
(`transformerContract.ts::computeTransformerNominalCurrents`) i wymusza identyczny
wynik funkcji solvera do 6 miejsc po przecinku dla dotychczasowych przypadkow
katalogu referencyjnego.
"""

from __future__ import annotations

import math

import pytest
from network_model.solvers.transformer_rated_currents import (
    TransformerRatedCurrentsInput,
    compute_transformer_rated_currents,
)


def _ts_rated_current_a(rated_power_kva: float, voltage_kv: float) -> float:
    """Dokladna reprodukcja wzoru TS: I = (kVA·1000) / (√3·(kV·1000))."""

    return (rated_power_kva * 1000.0) / (math.sqrt(3.0) * voltage_kv * 1000.0)


# (rated_power_kva, primary_kv, secondary_kv) — katalog referencyjny TR 15/0.4 kV.
_CASES = [
    (630.0, 15.0, 0.4),
    (1000.0, 15.0, 0.4),
    (250.0, 20.0, 0.4),
]


@pytest.mark.parametrize("kva,u1,u2", _CASES)
def test_rated_currents_parity_with_legacy_ts_formula(kva: float, u1: float, u2: float) -> None:
    expected_i1 = _ts_rated_current_a(kva, u1)
    expected_i2 = _ts_rated_current_a(kva, u2)
    result = compute_transformer_rated_currents(
        TransformerRatedCurrentsInput(
            rated_power_kva=kva,
            primary_voltage_kv=u1,
            secondary_voltage_kv=u2,
        )
    )
    assert result.primary_current_a == pytest.approx(expected_i1, abs=1e-6)
    assert result.secondary_current_a == pytest.approx(expected_i2, abs=1e-6)


def test_rated_currents_reference_values() -> None:
    result = compute_transformer_rated_currents(
        TransformerRatedCurrentsInput(
            rated_power_kva=630.0,
            primary_voltage_kv=15.0,
            secondary_voltage_kv=0.4,
        )
    )
    # I1 = 630_000 / (√3 × 15_000) ≈ 24.25 A; I2 = 630_000 / (√3 × 400) ≈ 909.3 A.
    assert result.primary_current_a == pytest.approx(24.25, abs=0.05)
    assert result.secondary_current_a == pytest.approx(909.3, abs=0.5)
    assert result.assumptions  # WHITE BOX: zalozenia nie sa puste.


@pytest.mark.parametrize(
    "kwargs,message",
    [
        (
            {"rated_power_kva": 0.0, "primary_voltage_kv": 15.0, "secondary_voltage_kv": 0.4},
            "Moc znamionowa",
        ),
        (
            {"rated_power_kva": 630.0, "primary_voltage_kv": 0.0, "secondary_voltage_kv": 0.4},
            "Napiecie pierwotne",
        ),
        (
            {"rated_power_kva": 630.0, "primary_voltage_kv": 15.0, "secondary_voltage_kv": 0.0},
            "Napiecie wtorne",
        ),
    ],
)
def test_rated_currents_rejects_invalid_input(kwargs: dict[str, float], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        compute_transformer_rated_currents(TransformerRatedCurrentsInput(**kwargs))
