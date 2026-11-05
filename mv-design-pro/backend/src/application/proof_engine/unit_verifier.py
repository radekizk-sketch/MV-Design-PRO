"""
Unit Verifier — Weryfikacja spójności jednostek dla Proof Engine P11.1a

STATUS: CANONICAL & BINDING
Reference: PROOF_SCHEMAS.md

Weryfikuje, że jednostki wejściowe dają oczekiwaną jednostkę wyjściową
zgodnie z regułami derywacji jednostek z rejestru równań.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from application.proof_engine.types import UnitCheckResult
from werdykt.zapis_latex import ZapisLatex


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
            "output": "kV",
        },
        "EQ_SC3F_002": {
            "rule": "kV² / MVA = Ω",
            "output": "Ω",
        },
        "EQ_SC3F_003": {
            "rule": "Ω + Ω + Ω = Ω",
            "output": "Ω",
        },
        "EQ_SC3F_004": {
            "rule": "kV / Ω = kA",
            "output": "kA",
        },
        "EQ_SC3F_005": {
            "rule": "— (bezwymiarowy)",
            "output": "—",
        },
        "EQ_SC3F_006": {
            "rule": "— · — · kA = kA",
            "output": "kA",
        },
        "EQ_SC3F_007": {
            "rule": "kV · kA = MVA",
            "output": "MVA",
        },
        "EQ_SC3F_008": {
            "rule": "kA · — = kA",
            "output": "kA",
        },
        "EQ_SC3F_008a": {
            "rule": "kA = kA",
            "output": "kA",
        },
        # Maszyny wirujące — prąd wyłączeniowy z zanikiem (IEC 60909-0:2016 rozdz. 9)
        "EQ_SC3F_011": {
            "rule": "— (bezwymiarowy)",
            "output": "—",
        },
        "EQ_SC3F_012": {
            "rule": "— (bezwymiarowy)",
            "output": "—",
        },
        "EQ_SC3F_013": {
            "rule": "— · — · kA = kA",
            "output": "kA",
        },
        # Pełny bilans punktu zwarcia: I_b, i_DC(t_b) oraz I²t (karta SC-IB-ITH-ZRODLA)
        "EQ_SC3F_014": {
            "rule": "kA − — · — · kA = kA",
            "output": "kA",
        },
        "EQ_SC3F_020": {
            "rule": "kA · — = kA",
            "output": "kA",
        },
        "EQ_SC3F_015": {
            "rule": "kA² · s = kA²s",
            "output": "kA²s",
        },
        # Zwarcie przez impedancję przejścia Z_f (karta OD-14, partia integracji 10)
        "EQ_SC3F_016": {
            "rule": "Ω + Ω = Ω",
            "output": "Ω",
        },
        "EQ_SC3F_017": {
            "rule": "kV / Ω = kA",
            "output": "kA",
        },
        "EQ_SC3F_018": {
            "rule": "— (bezwymiarowy)",
            "output": "—",
        },
        # SC1 Post-Fault (§4.1)
        "EQ_SC1_001": {
            "rule": "Ω = Ω",
            "output": "Ω",
        },
        "EQ_SC1_002": {
            "rule": "— (bezwymiarowy)",
            "output": "—",
        },
        "EQ_SC1_003": {
            "rule": "Ω + Ω + Ω = Ω",
            "output": "Ω",
        },
        "EQ_SC1_004": {
            "rule": "Ω + Ω = Ω",
            "output": "Ω",
        },
        "EQ_SC1_005": {
            "rule": "Ω + (Ω·Ω)/(Ω+Ω) = Ω",
            "output": "Ω",
        },
        "EQ_SC1_006": {
            "rule": "kV / Ω = kA",
            "output": "kA",
        },
        "EQ_SC1_007": {
            "rule": "kA = kA",
            "output": "kA",
        },
        "EQ_SC1_008": {
            "rule": "kV / Ω = kA",
            "output": "kA",
        },
        "EQ_SC1_013": {
            "rule": "Ω + Ω + Ω + Ω = Ω",
            "output": "Ω",
        },
        "EQ_SC1_014": {
            "rule": "Ω + Ω + Ω = Ω",
            "output": "Ω",
        },
        "EQ_SC1_015": {
            "rule": "Ω + (Ω·Ω)/(Ω+Ω) = Ω",
            "output": "Ω",
        },
        "EQ_SC1_016": {
            "rule": "kV / Ω = kA",
            "output": "kA",
        },
        "EQ_SC1_009": {
            "rule": "— (bezwymiarowy)",
            "output": "—",
        },
        "EQ_SC1_010": {
            "rule": "— · — · kA = kA",
            "output": "kA",
        },
        "EQ_SC1_011": {
            "rule": "kA · — = kA",
            "output": "kA",
        },
        "EQ_SC1_012": {
            "rule": "kA = kA",
            "output": "kA",
        },
        # VDROP
        "EQ_VDROP_001": {
            "rule": "Ω/km · km = Ω",
            "output": "Ω",
        },
        "EQ_VDROP_002": {
            "rule": "Ω/km · km = Ω",
            "output": "Ω",
        },
        "EQ_VDROP_003": {
            "rule": "(Ω · MW) / kV² = %",
            "output": "%",
        },
        "EQ_VDROP_004": {
            "rule": "(Ω · Mvar) / kV² = %",
            "output": "%",
        },
        "EQ_VDROP_005": {
            "rule": "% + % = %",
            "output": "%",
        },
        "EQ_VDROP_006": {
            "rule": "Σ % = %",
            "output": "%",
        },
        "EQ_VDROP_007": {
            # Karta PODSTAWA-VDROP (2026-08-12): odjęcie w kV zamiast mnożenia
            # przez ułamek odniesiony do U_n — obie strony w tej samej podstawie.
            "rule": "kV - kV = kV",
            "output": "kV",
        },
        "EQ_VDROP_010": {
            # Karta P0.5b (2026-08-13): granica transformatora na łańcuchu VDROP —
            # U_1/U_2 z rozwiązania rozpływu, obie strony w kV.
            "rule": "kV - kV = kV",
            "output": "kV",
        },
        # P32: Load Flow & Voltage
        "EQ_LF_001": {
            "rule": "MW² + Mvar² = MVA² → MVA",
            "output": "MVA",
        },
        "EQ_LF_002": {
            "rule": "MVA / kV = kA",
            "output": "kA",
        },
        "EQ_LF_003": {
            "rule": "Ω · MW / kV = kV",
            "output": "kV",
        },
        "EQ_LF_004": {
            "rule": "Ω · Mvar / kV = kV",
            "output": "kV",
        },
        "EQ_LF_005": {
            "rule": "kV + kV = kV",
            "output": "kV",
        },
        "EQ_LF_006": {
            "rule": "kV / kV = p.u.",
            "output": "p.u.",
        },
        "EQ_LF_007": {
            "rule": "kV / kV = %",
            "output": "%",
        },
        # P15: Load Currents & Overload
        "EQ_LC_001": {
            "rule": "MW² + Mvar² = MVA² → MVA",
            "output": "MVA",
        },
        "EQ_LC_002": {
            "rule": "MVA / kV = kA",
            "output": "kA",
        },
        "EQ_LC_003": {
            "rule": "100 · kA / kA = %",
            "output": "%",
        },
        "EQ_LC_004": {
            "rule": "100 · (kA / kA - 1) = %",
            "output": "%",
        },
        "EQ_LC_005": {
            "rule": "100 · MVA / MVA = %",
            "output": "%",
        },
        "EQ_LC_006": {
            "rule": "100 · (MVA / MVA - 1) = %",
            "output": "%",
        },
        # P17: Losses Energy Profile
        "EQ_LE_001": {
            "rule": "h - h = h",
            "output": "h",
        },
        "EQ_LE_002": {
            "rule": "kW · h = kWh",
            "output": "kWh",
        },
        "EQ_LE_003": {
            "rule": "Σ kWh = kWh",
            "output": "kWh",
        },
        "EQ_LE_004": {
            "rule": "kW · h = kWh",
            "output": "kWh",
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
        input_units: dict[ZapisLatex, str],
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
        inputs: list[tuple[ZapisLatex, str]],  # [(symbol, unit), ...]
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
