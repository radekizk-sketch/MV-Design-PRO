"""Parytet liczbowy relokacji ΔU doboru kabla (kreator -> backend, karta R1).

Reprodukuje wzory TypeScript, ktore liczyly fizyke w warstwie prezentacji
(`cableSelectionContract.ts::computeCableVoltageDrop`,
`voltageDropValidator.ts::calculateVoltageDrop`,
`cableSelectionContract.ts::computeRatedCurrentFromPower`) i wymusza identyczny
wynik funkcji solvera do 6 miejsc po przecinku dla dotychczasowych przypadkow.
"""

from __future__ import annotations

import math

import pytest
from network_model.solvers.cable_voltage_drop import (
    CableRatedCurrentInput,
    CableVoltageDropInput,
    compute_cable_rated_current,
    compute_cable_voltage_drop,
)


def _ts_voltage_drop_v(
    current_a: float,
    length_km: float,
    r_per_km: float,
    x_per_km: float,
    cos_phi: float,
    line_voltage_v: float,
) -> tuple[float, float]:
    """Dokladna reprodukcja wzoru TS: ΔU = √3·I·(R·cosφ + X·sinφ)."""

    sin_phi = math.sqrt(1.0 - cos_phi * cos_phi)
    r = r_per_km * length_km
    x = x_per_km * length_km
    delta_u = math.sqrt(3.0) * current_a * (r * cos_phi + x * sin_phi)
    pct = delta_u / line_voltage_v * 100.0
    return delta_u, pct


def _ts_rated_current_a(active_power_kw: float, cos_phi: float, line_voltage_v: float) -> float:
    """Dokladna reprodukcja wzoru TS: I = (P/cosφ) / (√3·U)."""

    apparent_va = active_power_kw * 1000.0 / cos_phi
    return apparent_va / (math.sqrt(3.0) * line_voltage_v)


# (current_a, length_km, r_per_km, x_per_km, cos_phi, line_voltage_v)
# Przypadki 1-4: cableSelectionContract (kabel XRUHAKXS 120: R=0.253, X=0.115).
# Przypadki A-D: voltageDropValidator (jawne R/X).
_VDROP_CASES = [
    (162.06, 0.520, 0.253, 0.115, 0.95, 15000.0),
    (280.0, 30.0, 0.253, 0.115, 0.93, 15000.0),
    (100.0, 1.0, 0.253, 0.115, 0.95, 15000.0),
    (100.0, 2.0, 0.253, 0.115, 0.95, 15000.0),
    (200.0, 5.0, 0.125, 0.10, 0.95, 15000.0),
    (400.0, 20.0, 0.5, 0.15, 0.9, 15000.0),
    (300.0, 13.0, 0.2, 0.1, 0.9, 15000.0),
    (100.0, 1.0, 1.0, 0.1, 0.85, 400.0),
]


@pytest.mark.parametrize("current_a,length_km,r,x,cos_phi,voltage_v", _VDROP_CASES)
def test_voltage_drop_parity_with_legacy_ts_formula(
    current_a: float,
    length_km: float,
    r: float,
    x: float,
    cos_phi: float,
    voltage_v: float,
) -> None:
    expected_v, expected_pct = _ts_voltage_drop_v(current_a, length_km, r, x, cos_phi, voltage_v)
    result = compute_cable_voltage_drop(
        CableVoltageDropInput(
            current_a=current_a,
            length_km=length_km,
            r_ohm_per_km=r,
            x_ohm_per_km=x,
            cos_phi=cos_phi,
            line_voltage_v=voltage_v,
        )
    )
    assert result.delta_u_v == pytest.approx(expected_v, abs=1e-6)
    assert result.delta_u_pct == pytest.approx(expected_pct, abs=1e-6)


def test_voltage_drop_components_sum_to_total() -> None:
    result = compute_cable_voltage_drop(
        CableVoltageDropInput(
            current_a=162.06,
            length_km=0.520,
            r_ohm_per_km=0.253,
            x_ohm_per_km=0.115,
            cos_phi=0.95,
            line_voltage_v=15000.0,
        )
    )
    assert result.delta_u_resistive_v + result.delta_u_reactive_v == pytest.approx(
        result.delta_u_v, abs=1e-9
    )
    assert result.r_total_ohm == pytest.approx(0.253 * 0.520, abs=1e-9)
    assert result.x_total_ohm == pytest.approx(0.115 * 0.520, abs=1e-9)
    assert result.assumptions  # WHITE BOX: zalozenia nie sa puste.


def test_voltage_drop_scales_linearly_with_length() -> None:
    base = compute_cable_voltage_drop(
        CableVoltageDropInput(100.0, 1.0, 0.253, 0.115, 0.95, 15000.0)
    )
    double = compute_cable_voltage_drop(
        CableVoltageDropInput(100.0, 2.0, 0.253, 0.115, 0.95, 15000.0)
    )
    assert double.delta_u_pct == pytest.approx(base.delta_u_pct * 2.0, abs=1e-9)


@pytest.mark.parametrize(
    "kwargs,message",
    [
        (
            {
                "current_a": 0.0,
                "length_km": 1.0,
                "r_ohm_per_km": 0.1,
                "x_ohm_per_km": 0.05,
                "cos_phi": 0.9,
                "line_voltage_v": 15000.0,
            },
            "Prad",
        ),
        (
            {
                "current_a": 100.0,
                "length_km": 0.0,
                "r_ohm_per_km": 0.1,
                "x_ohm_per_km": 0.05,
                "cos_phi": 0.9,
                "line_voltage_v": 15000.0,
            },
            "Dlugosc",
        ),
        (
            {
                "current_a": 100.0,
                "length_km": 1.0,
                "r_ohm_per_km": 0.1,
                "x_ohm_per_km": 0.05,
                "cos_phi": 0.9,
                "line_voltage_v": 0.0,
            },
            "Napiecie",
        ),
        (
            {
                "current_a": 100.0,
                "length_km": 1.0,
                "r_ohm_per_km": 0.1,
                "x_ohm_per_km": 0.05,
                "cos_phi": 1.5,
                "line_voltage_v": 15000.0,
            },
            "cosφ",
        ),
    ],
)
def test_voltage_drop_rejects_invalid_input(kwargs: dict[str, float], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        compute_cable_voltage_drop(CableVoltageDropInput(**kwargs))


@pytest.mark.parametrize(
    "power_kw,cos_phi,voltage_v",
    [(4000.0, 0.93, 15000.0), (4000.0, 0.95, 15000.0)],
)
def test_rated_current_parity_with_legacy_ts_formula(
    power_kw: float, cos_phi: float, voltage_v: float
) -> None:
    expected = _ts_rated_current_a(power_kw, cos_phi, voltage_v)
    result = compute_cable_rated_current(
        CableRatedCurrentInput(active_power_kw=power_kw, cos_phi=cos_phi, line_voltage_v=voltage_v)
    )
    assert result.rated_current_a == pytest.approx(expected, abs=1e-6)


def test_rated_current_rejects_invalid_input() -> None:
    with pytest.raises(ValueError, match="Moc czynna"):
        compute_cable_rated_current(
            CableRatedCurrentInput(active_power_kw=0.0, cos_phi=0.9, line_voltage_v=15000.0)
        )


# ---------------------------------------------------------------------------
# V12K-190: kierunek mocy — spadek vs WZROST napięcia (fala E audytu fizyki)
# ---------------------------------------------------------------------------


def _hand_delta_u(current_a, r_km, x_km, length_km, cos_phi, sign_p, sign_q) -> float:
    """Niezależny rachunek: ΔU = √3·I·(s_P·R·cosφ + s_Q·X·sinφ)."""
    sin_phi = math.sqrt(1.0 - cos_phi * cos_phi)
    return (
        math.sqrt(3.0)
        * current_a
        * (sign_p * (r_km * length_km) * cos_phi + sign_q * (x_km * length_km) * sin_phi)
    )


_BASE = dict(
    current_a=100.0,
    length_km=5.0,
    r_ohm_per_km=0.16,
    x_ohm_per_km=0.10,
    cos_phi=0.95,
    line_voltage_v=15000.0,
)


def test_default_is_load_inductive_and_bit_identical() -> None:
    """Domyślne wartości = dawne zachowanie (odbiór indukcyjny), bit w bit.

    Rozszerzenie o kierunek mocy musi być ADDYTYWNE: istniejący kod, który nie zna
    nowych pól, ma dostać dokładnie ten sam wynik co przed V12K-190.
    """
    result = compute_cable_voltage_drop(CableVoltageDropInput(**_BASE))
    assert result.flow_direction == "load"
    assert result.reactive_character == "inductive"
    assert result.delta_u_v == _hand_delta_u(100.0, 0.16, 0.10, 5.0, 0.95, 1.0, 1.0)
    assert result.is_voltage_rise is False


@pytest.mark.parametrize(
    "flow_direction,reactive_character,sign_p,sign_q,expect_rise",
    [
        ("load", "inductive", 1.0, 1.0, False),  # odbiór indukcyjny — największy spadek
        ("load", "capacitive", 1.0, -1.0, False),  # odbiór skompensowany — mniejszy spadek
        ("generation", "inductive", -1.0, 1.0, True),  # OZE pobierające Q — wzrost tłumiony
        ("generation", "capacitive", -1.0, -1.0, True),  # OZE oddające Q — wzrost największy
    ],
)
def test_flow_direction_signs_match_hand_calculation(
    flow_direction: str, reactive_character: str, sign_p: float, sign_q: float, expect_rise: bool
) -> None:
    """Znaki składowych są NIEZALEŻNE: P steruje członem R·cosφ, Q członem X·sinφ.

    Falownik OZE oddaje moc czynną (napięcie rośnie) i może jednocześnie pobierać
    bierną (napięcie obniża) — na tym polega regulacja Q(U). Model musi umieć
    wyrazić tę kombinację, inaczej podgląd przyłączenia generacji jest bezużyteczny.
    """
    result = compute_cable_voltage_drop(
        CableVoltageDropInput(
            **_BASE, flow_direction=flow_direction, reactive_character=reactive_character
        )
    )
    expected = _hand_delta_u(100.0, 0.16, 0.10, 5.0, 0.95, sign_p, sign_q)
    assert result.delta_u_v == pytest.approx(expected, abs=1e-9)
    assert result.is_voltage_rise is expect_rise


def test_reactive_compensation_reduces_voltage_rise() -> None:
    """Pobór mocy biernej TŁUMI wzrost napięcia od generacji (sedno regulacji Q(U))."""
    absorbing = compute_cable_voltage_drop(
        CableVoltageDropInput(**_BASE, flow_direction="generation", reactive_character="inductive")
    )
    injecting = compute_cable_voltage_drop(
        CableVoltageDropInput(**_BASE, flow_direction="generation", reactive_character="capacitive")
    )
    assert absorbing.is_voltage_rise and injecting.is_voltage_rise
    # Oba to wzrosty (ΔU < 0), ale pobór Q daje wzrost MNIEJSZY co do modułu.
    assert abs(absorbing.delta_u_v) < abs(injecting.delta_u_v)


def test_rejects_unknown_direction_flags() -> None:
    for kwargs in ({"flow_direction": "oze"}, {"reactive_character": "pojemnosciowy"}):
        with pytest.raises(ValueError):
            compute_cable_voltage_drop(CableVoltageDropInput(**_BASE, **kwargs))
