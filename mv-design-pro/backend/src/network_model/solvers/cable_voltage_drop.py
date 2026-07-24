from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass(frozen=True)
class CableVoltageDropInput:
    """Dane wejsciowe podgladu zmiany napiecia na kablu SN (linia 3-fazowa).

    V12K-190: doszly dwa pola KIERUNKU mocy. Do tej pory przelicznik znal wylacznie
    przypadek „odbior indukcyjny" i zwracal zawsze SPADEK, a jest uzywany rowniez
    przez dobor kabla dla zrodel OZE (`der_selection_preview`) — tam moc czynna
    plynie W PRZECIWNA STRONE i napiecie w punkcie przylaczenia ROSNIE. Wzrost
    napiecia jest przy przylaczaniu generacji GLOWNYM ograniczeniem, wiec podglad,
    ktory potrafi pokazac tylko spadek, prowadzil projektanta na manowce.

    Domyslne wartosci odtwarzaja dawne zachowanie co do bitu (odbior indukcyjny).
    """

    current_a: float
    length_km: float
    r_ohm_per_km: float
    x_ohm_per_km: float
    cos_phi: float
    line_voltage_v: float
    # "load" = moc czynna pobierana (napiecie maleje), "generation" = oddawana do
    # sieci (napiecie rosnie). Dotyczy WYLACZNIE skladowej czynnej R·cosφ.
    flow_direction: str = "load"
    # "inductive" = moc bierna POBIERANA z sieci (obniza napiecie — tak dziala
    # regulacja Q(U) falownika), "capacitive" = ODDAWANA (podnosi napiecie).
    # Dotyczy WYLACZNIE skladowej biernej X·sinφ i jest NIEZALEZNA od kierunku P:
    # falownik moze oddawac moc czynna i jednoczesnie pobierac bierna.
    reactive_character: str = "inductive"


@dataclass(frozen=True)
class CableVoltageDropResult:
    """Wynik podgladu spadku napiecia (WHITE BOX: skladowe R/X + zalozenia)."""

    delta_u_v: float
    delta_u_pct: float
    r_total_ohm: float
    x_total_ohm: float
    delta_u_resistive_v: float
    delta_u_reactive_v: float
    # Kierunek mocy, dla ktorego policzono wynik — bez tego znak ΔU jest nieczytelny.
    flow_direction: str = "load"
    reactive_character: str = "inductive"
    formula_ref: str = "ΔU = √3·I·(s_P·R·cosφ + s_Q·X·sinφ)"
    assumptions: tuple[str, ...] = field(
        default_factory=lambda: (
            "Uklad 3-fazowy symetryczny; wspolczynnik linii √3.",
            "sinφ = √(1 − cos²φ); znak skladowej biernej z charakteru Q.",
            "s_P = +1 dla odbioru, −1 dla generacji (moc czynna).",
            "s_Q = +1 dla poboru Q (indukcyjny), −1 dla oddawania Q (pojemnosciowy).",
            "ΔU > 0 = spadek napiecia; ΔU < 0 = WZROST (typowy przy generacji).",
            "R = r_jedn · L, X = x_jedn · L (impedancja odcinka).",
            "ΔU% = ΔU / U_linii · 100 (U_linii miedzyfazowe).",
        )
    )

    @property
    def is_voltage_rise(self) -> bool:
        """Czy wynik to WZROST napiecia (ograniczenie przylaczeniowe generacji)."""
        return self.delta_u_v < 0.0


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
    if data.flow_direction not in ("load", "generation"):
        raise ValueError("flow_direction musi byc 'load' albo 'generation'.")
    if data.reactive_character not in ("inductive", "capacitive"):
        raise ValueError("reactive_character musi byc 'inductive' albo 'capacitive'.")

    # Znaki skladowych sa NIEZALEZNE, bo kierunek mocy czynnej i biernej moze byc
    # rozny: falownik OZE oddaje P (napiecie rosnie) i moze jednoczesnie pobierac Q
    # (napiecie obniza) — na tym polega regulacja Q(U). Skladowa R·cosφ idzie za
    # kierunkiem P, skladowa X·sinφ za charakterem Q.
    sign_active = 1.0 if data.flow_direction == "load" else -1.0
    sign_reactive = 1.0 if data.reactive_character == "inductive" else -1.0

    sin_phi = math.sqrt(1.0 - data.cos_phi * data.cos_phi)
    r_total = data.r_ohm_per_km * data.length_km
    x_total = data.x_ohm_per_km * data.length_km
    delta_u_resistive = sign_active * math.sqrt(3.0) * data.current_a * r_total * data.cos_phi
    delta_u_reactive = sign_reactive * math.sqrt(3.0) * data.current_a * x_total * sin_phi
    delta_u = delta_u_resistive + delta_u_reactive
    delta_u_pct = delta_u / data.line_voltage_v * 100.0

    return CableVoltageDropResult(
        delta_u_v=delta_u,
        delta_u_pct=delta_u_pct,
        r_total_ohm=r_total,
        x_total_ohm=x_total,
        delta_u_resistive_v=delta_u_resistive,
        delta_u_reactive_v=delta_u_reactive,
        flow_direction=data.flow_direction,
        reactive_character=data.reactive_character,
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
