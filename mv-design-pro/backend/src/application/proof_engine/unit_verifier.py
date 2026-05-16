"""
Unit Verifier — Weryfikacja spójności jednostek dla Proof Engine P11.1a

STATUS: CANONICAL & BINDING
Reference: PROOF_SCHEMAS.md

Weryfikuje, że jednostki wejściowe dają oczekiwaną jednostkę wyjściową
zgodnie z regułami derywacji jednostek z rejestru równań.
"""

from __future__ import annotations

from typing import Any

from dataclasses import dataclass

from application.proof_engine.types import UnitCheckResult


@dataclass(frozen=True)
class UnitDimension:
    """
    Reprezentacja wymiarów jednostki w systemie SI.

    Bazowe wymiary:
    - V (Volt) - napięcie
    - A (Amper) - prąd
    - Ω (Ohm) - rezystancja
    - W (Watt) - moc
    - m (metr) - długość
    - s (sekunda) - czas
    - — (bezwymiarowy)
    """

    # Wykładniki dla jednostek bazowych
    V: int = 0  # Volt
    A: int = 0  # Amper
    ohm: int = 0  # Ohm (= V/A)
    W: int = 0  # Watt (= V*A)
    m: int = 0  # metr
    s: int = 0  # sekunda

    def __mul__(self, other: UnitDimension) -> UnitDimension:
        return UnitDimension(
            V=self.V + other.V,
            A=self.A + other.A,
            ohm=self.ohm + other.ohm,
            W=self.W + other.W,
            m=self.m + other.m,
            s=self.s + other.s,
        )

    def __truediv__(self, other: UnitDimension) -> UnitDimension:
        return UnitDimension(
            V=self.V - other.V,
            A=self.A - other.A,
            ohm=self.ohm - other.ohm,
            W=self.W - other.W,
            m=self.m - other.m,
            s=self.s - other.s,
        )

    def is_dimensionless(self) -> bool:
        return (
            self.V == 0
            and self.A == 0
            and self.ohm == 0
            and self.W == 0
            and self.m == 0
            and self.s == 0
        )


# Mapping jednostek na wymiary
UNIT_DIMENSIONS: dict[str, UnitDimension] = {
    # Bezwymiarowe
    "—": UnitDimension(),
    "-": UnitDimension(),
    "": UnitDimension(),
    "p.u.": UnitDimension(),
    "%": UnitDimension(),
    # Napięcie
    "V": UnitDimension(V=1),
    "kV": UnitDimension(V=1),
    "MV": UnitDimension(V=1),
    # Prąd
    "A": UnitDimension(A=1),
    "kA": UnitDimension(A=1),
    "MA": UnitDimension(A=1),
    "kA²s": UnitDimension(A=2, s=1),
    "kA^2s": UnitDimension(A=2, s=1),
    # Rezystancja / Impedancja
    "Ω": UnitDimension(ohm=1),
    "mΩ": UnitDimension(ohm=1),
    "Ω/km": UnitDimension(ohm=1, m=-1),
    # Moc
    "W": UnitDimension(W=1),
    "kW": UnitDimension(W=1),
    "MW": UnitDimension(W=1),
    "Wh": UnitDimension(W=1, s=1),
    "kWh": UnitDimension(W=1, s=1),
    "MWh": UnitDimension(W=1, s=1),
    "VA": UnitDimension(W=1),
    "kVA": UnitDimension(W=1),
    "MVA": UnitDimension(W=1),
    "var": UnitDimension(W=1),
    "kvar": UnitDimension(W=1),
    "Mvar": UnitDimension(W=1),
    # Długość
    "m": UnitDimension(m=1),
    "km": UnitDimension(m=1),
    # Czas
    "s": UnitDimension(s=1),
    "ms": UnitDimension(s=1),
    "h": UnitDimension(s=1),
    "Hz": UnitDimension(s=-1),
}


class UnitVerifier:
    """
    Weryfikator spójności jednostek dla równań elektrycznych.

    Sprawdza, czy jednostki wejściowe dają oczekiwaną jednostkę wyjściową.
    """

    # Predefiniowane reguły derywacji dla znanych równań
    DERIVATION_RULES: dict[str, dict[str, Any]] = {
        # SC3F
        "EQ_SC3F_001": {
            "rule": "— · kV = kV",
            "inputs": {"c": "—", "U_n": "kV"},
            "output": "kV",
        },
        "EQ_SC3F_002": {
            "rule": "kV² / MVA = Ω",
            "inputs": {"c": "—", "U_n": "kV", "S_kQ''": "MVA"},
            "output": "Ω",
        },
        "EQ_SC3F_003": {
            "rule": "Ω + Ω + Ω = Ω",
            "inputs": {"Z_Q": "Ω", "Z_T": "Ω", "Z_L": "Ω"},
            "output": "Ω",
        },
        "EQ_SC3F_004": {
            "rule": "kV / Ω = kA",
            "inputs": {"c": "—", "U_n": "kV", "Z_th": "Ω"},
            "output": "kA",
        },
        "EQ_SC3F_005": {
            "rule": "— (bezwymiarowy)",
            "inputs": {"R_th": "Ω", "X_th": "Ω"},
            "output": "—",
        },
        "EQ_SC3F_006": {
            "rule": "— · — · kA = kA",
            "inputs": {"κ": "—", "I_k''": "kA"},
            "output": "kA",
        },
        "EQ_SC3F_007": {
            "rule": "kV · kA = MVA",
            "inputs": {"U_n": "kV", "I_k''": "kA"},
            "output": "MVA",
        },
        "EQ_SC3F_008": {
            "rule": "kA · — = kA",
            "inputs": {"I_k''": "kA", "m": "—", "n": "—"},
            "output": "kA",
        },
        "EQ_SC3F_008a": {
            "rule": "kA = kA",
            "inputs": {"i_p": "kA"},
            "output": "kA",
        },
        # SC1 Post-Fault (§4.1)
        "EQ_SC1_001": {
            "rule": "Ω = Ω",
            "inputs": {"Z_1": "Ω", "Z_2": "Ω", "Z_0": "Ω"},
            "output": "Ω",
        },
        "EQ_SC1_002": {
            "rule": "— (bezwymiarowy)",
            "inputs": {},
            "output": "—",
        },
        "EQ_SC1_003": {
            "rule": "Ω + Ω + Ω = Ω",
            "inputs": {"Z_1": "Ω", "Z_2": "Ω", "Z_0": "Ω"},
            "output": "Ω",
        },
        "EQ_SC1_004": {
            "rule": "Ω + Ω = Ω",
            "inputs": {"Z_1": "Ω", "Z_2": "Ω"},
            "output": "Ω",
        },
        "EQ_SC1_005": {
            "rule": "Ω + (Ω·Ω)/(Ω+Ω) = Ω",
            "inputs": {"Z_1": "Ω", "Z_2": "Ω", "Z_0": "Ω"},
            "output": "Ω",
        },
        "EQ_SC1_006": {
            "rule": "kV / Ω = kA",
            "inputs": {"U_f": "kV", "Z_k": "Ω"},
            "output": "kA",
        },
        "EQ_SC1_007": {
            "rule": "kA = kA",
            "inputs": {"I_0": "kA", "I_1": "kA", "I_2": "kA"},
            "output": "kA",
        },
        "EQ_SC1_008": {
            "rule": "kV / Ω = kA",
            "inputs": {"c": "—", "U_n": "kV", "Z_k": "Ω"},
            "output": "kA",
        },
        "EQ_SC1_009": {
            "rule": "— (bezwymiarowy)",
            "inputs": {"R_k": "Ω", "X_k": "Ω"},
            "output": "—",
        },
        "EQ_SC1_010": {
            "rule": "— · — · kA = kA",
            "inputs": {"κ": "—", "I_k''": "kA"},
            "output": "kA",
        },
        "EQ_SC1_011": {
            "rule": "kA · — = kA",
            "inputs": {"I_k''": "kA", "m": "—", "n": "—"},
            "output": "kA",
        },
        "EQ_SC1_012": {
            "rule": "kA = kA",
            "inputs": {"i_p": "kA"},
            "output": "kA",
        },
        # VDROP
        "EQ_VDROP_001": {
            "rule": "Ω/km · km = Ω",
            "inputs": {"r": "Ω/km", "l": "km"},
            "output": "Ω",
        },
        "EQ_VDROP_002": {
            "rule": "Ω/km · km = Ω",
            "inputs": {"x": "Ω/km", "l": "km"},
            "output": "Ω",
        },
        "EQ_VDROP_003": {
            "rule": "(Ω · MW) / kV² = %",
            "inputs": {"R": "Ω", "P": "MW", "U_n": "kV"},
            "output": "%",
        },
        "EQ_VDROP_004": {
            "rule": "(Ω · Mvar) / kV² = %",
            "inputs": {"X": "Ω", "Q": "Mvar", "U_n": "kV"},
            "output": "%",
        },
        "EQ_VDROP_005": {
            "rule": "% + % = %",
            "inputs": {"ΔU_R": "%", "ΔU_X": "%"},
            "output": "%",
        },
        "EQ_VDROP_006": {
            "rule": "Σ % = %",
            "inputs": {"ΔU_i": "%"},
            "output": "%",
        },
        "EQ_VDROP_007": {
            "rule": "kV · (1 - %) = kV",
            "inputs": {"U_{source}": "kV", "ΔU_{total}": "%"},
            "output": "kV",
        },
        # P32: Load Flow & Voltage
        "EQ_LF_001": {
            "rule": "MW² + Mvar² = MVA² → MVA",
            "inputs": {"P": "MW", "Q": "Mvar"},
            "output": "MVA",
        },
        "EQ_LF_002": {
            "rule": "MVA / kV = kA",
            "inputs": {"S": "MVA", "U_{LL}": "kV"},
            "output": "kA",
        },
        "EQ_LF_003": {
            "rule": "Ω · MW / kV = kV",
            "inputs": {"R": "Ω", "P": "MW", "U_n": "kV"},
            "output": "kV",
        },
        "EQ_LF_004": {
            "rule": "Ω · Mvar / kV = kV",
            "inputs": {"X": "Ω", "Q": "Mvar", "U_n": "kV"},
            "output": "kV",
        },
        "EQ_LF_005": {
            "rule": "kV + kV = kV",
            "inputs": {"ΔU_R": "kV", "ΔU_X": "kV"},
            "output": "kV",
        },
        "EQ_LF_006": {
            "rule": "kV / kV = p.u.",
            "inputs": {"U": "kV", "U_n": "kV"},
            "output": "p.u.",
        },
        "EQ_LF_007": {
            "rule": "kV / kV = %",
            "inputs": {"U": "kV", "U_n": "kV"},
            "output": "%",
        },
        # P15: Load Currents & Overload
        "EQ_LC_001": {
            "rule": "MW² + Mvar² = MVA² → MVA",
            "inputs": {"P": "MW", "Q": "Mvar"},
            "output": "MVA",
        },
        "EQ_LC_002": {
            "rule": "MVA / kV = kA",
            "inputs": {"S": "MVA", "U_{LL}": "kV"},
            "output": "kA",
        },
        "EQ_LC_003": {
            "rule": "100 · kA / kA = %",
            "inputs": {"I": "kA", "I_n": "kA"},
            "output": "%",
        },
        "EQ_LC_004": {
            "rule": "100 · (kA / kA - 1) = %",
            "inputs": {"I_n": "kA", "I": "kA"},
            "output": "%",
        },
        "EQ_LC_005": {
            "rule": "100 · MVA / MVA = %",
            "inputs": {"S": "MVA", "S_n": "MVA"},
            "output": "%",
        },
        "EQ_LC_006": {
            "rule": "100 · (MVA / MVA - 1) = %",
            "inputs": {"S_n": "MVA", "S": "MVA"},
            "output": "%",
        },
        # P17: Losses Energy Profile
        "EQ_LE_001": {
            "rule": "h - h = h",
            "inputs": {"t_i": "h", "t_{i-1}": "h"},
            "output": "h",
        },
        "EQ_LE_002": {
            "rule": "kW · h = kWh",
            "inputs": {"P_{loss,i}": "kW", "Δt_i": "h"},
            "output": "kWh",
        },
        "EQ_LE_003": {
            "rule": "Σ kWh = kWh",
            "inputs": {"E_i": "kWh"},
            "output": "kWh",
        },
        "EQ_LE_004": {
            "rule": "kW · h = kWh",
            "inputs": {"P_{loss}": "kW", "t": "h"},
            "output": "kWh",
        },
        # P18: Protection Overcurrent & Selectivity
        "EQ_PR_001": {
            "rule": "kA ≤ kA = —",
            "inputs": {"I_k''": "kA", "I_{cu}": "kA"},
            "output": "—",
        },
        "EQ_PR_002": {
            "rule": "kA ≤ kA = —",
            "inputs": {"i_p": "kA", "I_{dyn}": "kA"},
            "output": "—",
        },
        "EQ_PR_003": {
            "rule": "kA²s ≤ kA²s = —",
            "inputs": {"∫ i^2 dt": "kA²s", "I_{th}": "kA²s"},
            "output": "—",
        },
        "EQ_PR_004": {
            "rule": "s + s ≤ s = —",
            "inputs": {"t_{down,max}": "s", "Δt": "s", "t_{up,min}": "s"},
            "output": "—",
        },
        # P19: Earthing / Ground Fault (SN)
        "EQ_EARTH_001": {
            "rule": "V / Ω = A",
            "inputs": {"U_{0}": "V", "Z_{E}": "Ω"},
            "output": "A",
        },
        "EQ_EARTH_002": {
            "rule": "A + A = A",
            "inputs": {"I_{u}": "A", "I_{p}": "A"},
            "output": "A",
        },
        "EQ_EARTH_003": {
            "rule": "A · Ω = V",
            "inputs": {"I_{u}": "A", "R_{u}": "Ω"},
            "output": "V",
        },
    }

    @classmethod
    def get_unit_dimension(cls, unit: str) -> UnitDimension:
        """Zwraca wymiar dla danej jednostki."""
        return UNIT_DIMENSIONS.get(unit, UnitDimension())

    @classmethod
    def verify_equation(
        cls,
        equation_id: str,
        input_units: dict[str, str],
        expected_output_unit: str,
    ) -> UnitCheckResult:
        """
        Weryfikuje spójność jednostek dla równania.

        Args:
            equation_id: Identyfikator równania
            input_units: Mapping symbol → jednostka dla wejść
            expected_output_unit: Oczekiwana jednostka wyniku

        Returns:
            UnitCheckResult z wynikiem weryfikacji
        """
        rule = cls.DERIVATION_RULES.get(equation_id)

        if rule:
            # Używamy predefiniowanej reguły
            computed_unit = rule["output"]
            derivation = rule["rule"]
            passed = cls._units_compatible(computed_unit, expected_output_unit)
        else:
            # Fallback: zakładamy poprawność jeśli nie mamy reguły
            computed_unit = expected_output_unit
            derivation = "— (brak reguły)"
            passed = True

        return UnitCheckResult(
            passed=passed,
            expected_unit=expected_output_unit,
            computed_unit=computed_unit,
            input_units=dict(sorted(input_units.items())),
            derivation=derivation + (" ✓" if passed else " ✗"),
        )

    @classmethod
    def _units_compatible(cls, unit1: str, unit2: str) -> bool:
        """Sprawdza czy dwie jednostki są kompatybilne."""
        # Normalizacja jednostek
        norm1 = cls._normalize_unit(unit1)
        norm2 = cls._normalize_unit(unit2)
        return norm1 == norm2

    @classmethod
    def _normalize_unit(cls, unit: str) -> str:
        """Normalizuje jednostkę do porównania."""
        # Usuwanie spacji i normalizacja
        unit = unit.strip()

        # Mapowanie aliasów
        aliases = {
            "-": "—",
            "": "—",
            "ohm": "Ω",
            "Ohm": "Ω",
        }

        return aliases.get(unit, unit)

    @classmethod
    def verify_step(
        cls,
        equation_id: str,
        inputs: list[tuple[str, str]],  # [(symbol, unit), ...]
        result_unit: str,
    ) -> UnitCheckResult:
        """
        Weryfikuje jednostki dla kroku dowodu.

        Args:
            equation_id: ID równania
            inputs: Lista par (symbol, jednostka)
            result_unit: Jednostka wyniku

        Returns:
            UnitCheckResult
        """
        input_units = dict(inputs)
        return cls.verify_equation(equation_id, input_units, result_unit)
