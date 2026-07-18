from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass(frozen=True)
class CableVoltageDropInput:
    """Dane wejsciowe podgladu spadku napiecia na kablu SN (linia 3-fazowa)."""

    current_a: float
    length_km: float
    r_ohm_per_km: float
    x_ohm_per_km: float
    cos_phi: float
    line_voltage_v: float


@dataclass(frozen=True)
class CableVoltageDropResult:
    """Wynik podgladu spadku napiecia (WHITE BOX: skladowe R/X + zalozenia)."""

    delta_u_v: float
    delta_u_pct: float
    r_total_ohm: float
    x_total_ohm: float
    delta_u_resistive_v: float
    delta_u_reactive_v: float
    formula_ref: str = "ΔU = √3·I·(R·cosφ + X·sinφ)"
    assumptions: tuple[str, ...] = field(
        default_factory=lambda: (
            "Uklad 3-fazowy symetryczny; wspolczynnik linii √3.",
            "sinφ = √(1 − cos²φ) (obciazenie indukcyjne).",
            "R = r_jedn · L, X = x_jedn · L (impedancja odcinka).",
            "ΔU% = ΔU / U_linii · 100 (U_linii miedzyfazowe).",
        )
    )


@dataclass(frozen=True)
class CableRatedCurrentInput:
    """Dane wejsciowe podgladu pradu znamionowego z mocy przylaczeniowej."""

    active_power_kw: float
    cos_phi: float
    line_voltage_v: float


@dataclass(frozen=True)
class CableRatedCurrentResult:
    """Wynik podgladu pradu znamionowego (WHITE BOX)."""

    rated_current_a: float
    apparent_power_kva: float
    formula_ref: str = "I = S_n / (√3·U);  S_n = P / cosφ"
    assumptions: tuple[str, ...] = field(
        default_factory=lambda: (
            "Uklad 3-fazowy symetryczny; wspolczynnik linii √3.",
            "S_n = P / cosφ (moc pozorna z mocy czynnej).",
            "I = S_n / (√3 · U_linii) (U_linii miedzyfazowe).",
        )
    )


def compute_cable_voltage_drop(data: CableVoltageDropInput) -> CableVoltageDropResult:
    """Oblicz spadek napiecia na odcinku kabla SN wg wzoru linii 3-fazowej.

    WHITE BOX: zwraca skladowe czynna/bierna oraz impedancje odcinka.
    """

    if data.current_a <= 0:
        raise ValueError("Prad obciazenia musi byc dodatni.")
    if data.length_km <= 0:
        raise ValueError("Dlugosc odcinka musi byc dodatnia.")
    if data.line_voltage_v <= 0:
        raise ValueError("Napiecie linii musi byc dodatnie.")
    if data.r_ohm_per_km < 0:
        raise ValueError("Rezystancja jednostkowa nie moze byc ujemna.")
    if data.x_ohm_per_km < 0:
        raise ValueError("Reaktancja jednostkowa nie moze byc ujemna.")
    if not 0.0 < data.cos_phi <= 1.0:
        raise ValueError("Wspolczynnik mocy cosφ musi lezec w zakresie (0, 1].")

    sin_phi = math.sqrt(1.0 - data.cos_phi * data.cos_phi)
    r_total = data.r_ohm_per_km * data.length_km
    x_total = data.x_ohm_per_km * data.length_km
    delta_u_resistive = math.sqrt(3.0) * data.current_a * r_total * data.cos_phi
    delta_u_reactive = math.sqrt(3.0) * data.current_a * x_total * sin_phi
    delta_u = delta_u_resistive + delta_u_reactive
    delta_u_pct = delta_u / data.line_voltage_v * 100.0

    return CableVoltageDropResult(
        delta_u_v=delta_u,
        delta_u_pct=delta_u_pct,
        r_total_ohm=r_total,
        x_total_ohm=x_total,
        delta_u_resistive_v=delta_u_resistive,
        delta_u_reactive_v=delta_u_reactive,
    )


def compute_cable_rated_current(data: CableRatedCurrentInput) -> CableRatedCurrentResult:
    """Oblicz prad znamionowy z mocy przylaczeniowej dla ukladu 3-fazowego."""

    if data.active_power_kw <= 0:
        raise ValueError("Moc czynna musi byc dodatnia.")
    if data.line_voltage_v <= 0:
        raise ValueError("Napiecie linii musi byc dodatnie.")
    if not 0.0 < data.cos_phi <= 1.0:
        raise ValueError("Wspolczynnik mocy cosφ musi lezec w zakresie (0, 1].")

    apparent_va = data.active_power_kw * 1000.0 / data.cos_phi
    rated_current = apparent_va / (math.sqrt(3.0) * data.line_voltage_v)

    return CableRatedCurrentResult(
        rated_current_a=rated_current,
        apparent_power_kva=apparent_va / 1000.0,
    )
