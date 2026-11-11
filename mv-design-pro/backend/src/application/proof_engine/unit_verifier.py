"""
Weryfikator jednostek kroków dowodu (Proof Engine).

Sprawdza, czy jednostka wyniku równania wyprowadzona z jednostek danych równa się jednostce
wyniku kroku. JEDNO źródło wyprowadzenia: zapis LaTeX `EquationDefinition.unit_derivation_latex`
rejestru równań (`equation_registry.py`) — ten sam tekst, który eksport LaTeX/PDF stawia
w bloku „Weryfikacja jednostek". Tu zostaje wyłącznie jednostka wyniku każdej reguły
(porównywana z jednostką kroku); dawna kopia zapisu wyprowadzenia w tym module rozjeżdżała się
z rejestrem (pomiar 2026-11-04: sześć równań z innym zapisem po obu stronach, jedna reguła bez
równania w rejestrze).

Brak reguły dla równania NIE jest zgodnością: wynik ma `passed=False`, puste wyprowadzenie
i prozę „zgodności jednostek nie sprawdzono" (`UnitCheckResult.opis_pl`).
"""

from __future__ import annotations

from application.proof_engine.equation_registry import EquationRegistry
from application.proof_engine.types import UnitCheckResult


class UnitVerifier:
    """Weryfikator spójności jednostek równań rejestru."""

    #: Jednostka wyniku reguły wyprowadzenia równania (klucz: `equation_id` rejestru).
    JEDNOSTKA_WYNIKU: dict[str, str] = {
        # SC3F
        "EQ_SC3F_002": "Ω",
        "EQ_SC3F_003": "Ω",
        "EQ_SC3F_004": "kA",
        "EQ_SC3F_005": "—",
        "EQ_SC3F_006": "kA",
        "EQ_SC3F_007": "MVA",
        "EQ_SC3F_008": "kA",
        "EQ_SC3F_008a": "kA",
        # Maszyny wirujące — prąd wyłączeniowy z zanikiem (IEC 60909-0:2016 rozdz. 9)
        "EQ_SC3F_011": "—",
        "EQ_SC3F_012": "—",
        "EQ_SC3F_013": "kA",
        # Pełny bilans punktu zwarcia: I_b, i_DC(t_b) oraz I²t (karta SC-IB-ITH-ZRODLA)
        "EQ_SC3F_014": "kA",
        "EQ_SC3F_020": "kA",
        "EQ_SC3F_015": "kA²s",
        # Zwarcie przez impedancję przejścia Z_f (karta OD-14, partia integracji 10)
        "EQ_SC3F_016": "Ω",
        "EQ_SC3F_017": "kA",
        "EQ_SC3F_018": "—",
        # SC1 Post-Fault (§4.1)
        "EQ_SC1_001": "Ω",
        "EQ_SC1_002": "—",
        "EQ_SC1_003": "Ω",
        "EQ_SC1_004": "Ω",
        "EQ_SC1_005": "Ω",
        "EQ_SC1_006": "kA",
        "EQ_SC1_007": "kA",
        "EQ_SC1_008": "kA",
        "EQ_SC1_013": "Ω",
        "EQ_SC1_014": "Ω",
        "EQ_SC1_015": "Ω",
        "EQ_SC1_016": "kA",
        "EQ_SC1_009": "—",
        "EQ_SC1_010": "kA",
        "EQ_SC1_011": "kA",
        "EQ_SC1_012": "kA",
        # VDROP
        "EQ_VDROP_001": "Ω",
        "EQ_VDROP_002": "Ω",
        "EQ_VDROP_003": "%",
        "EQ_VDROP_004": "%",
        "EQ_VDROP_005": "%",
        "EQ_VDROP_006": "%",
        "EQ_VDROP_007": "kV",
        # Karta PODSTAWA-VDROP (2026-08-12): odjęcie w kV zamiast mnożenia
        # przez ułamek odniesiony do U_n — obie strony w tej samej podstawie.
        "EQ_VDROP_010": "kV",
        # Karta P0.5b (2026-08-13): granica transformatora na łańcuchu VDROP —
        # U_1/U_2 z rozwiązania rozpływu, obie strony w kV.
        # P32: Load Flow & Voltage
        "EQ_LF_001": "MVA",
        "EQ_LF_002": "kA",
        "EQ_LF_003": "kV",
        "EQ_LF_004": "kV",
        "EQ_LF_005": "kV",
        "EQ_LF_006": "p.u.",
        "EQ_LF_007": "%",
        # P15: Load Currents & Overload
        "EQ_LC_001": "MVA",
        "EQ_LC_002": "kA",
        "EQ_LC_003": "%",
        "EQ_LC_004": "%",
        "EQ_LC_005": "%",
        "EQ_LC_006": "%",
        # P17: Losses Energy Profile
        "EQ_LE_001": "h",
        "EQ_LE_002": "kWh",
        "EQ_LE_003": "kWh",
        "EQ_LE_004": "kWh",
    }

    #: Zapisy tej samej jednostki (porównanie jednostki wyprowadzonej z jednostką kroku).
    _ALIASY: dict[str, str] = {"-": "—", "": "—", "ohm": "Ω", "Ohm": "Ω"}

    @classmethod
    def verify_equation(
        cls,
        equation_id: str,
        input_units: dict[str, str],
        expected_output_unit: str,
    ) -> UnitCheckResult:
        """Weryfikuje jednostkę wyniku równania wobec jednostki kroku.

        Args:
            equation_id: Identyfikator równania rejestru
            input_units: Symbol → jednostka danych kroku
            expected_output_unit: Jednostka wyniku kroku

        Returns:
            UnitCheckResult z wyprowadzeniem LaTeX z rejestru równań; bez reguły albo bez
            wyprowadzenia w rejestrze: `passed=False` i puste wyprowadzenie (nie sprawdzono).
        """
        jednostka = cls.JEDNOSTKA_WYNIKU.get(equation_id)
        rownanie = EquationRegistry.get_equation(equation_id)
        if jednostka is None or rownanie is None or not rownanie.unit_derivation_latex:
            return UnitCheckResult(
                passed=False,
                expected_unit=expected_output_unit,
                computed_unit=jednostka or "",
                input_units=dict(sorted(input_units.items())),
                derivation_latex="",
            )
        return UnitCheckResult(
            passed=cls._normalizuj(jednostka) == cls._normalizuj(expected_output_unit),
            expected_unit=expected_output_unit,
            computed_unit=jednostka,
            input_units=dict(sorted(input_units.items())),
            derivation_latex=rownanie.unit_derivation_latex,
        )

    @classmethod
    def _normalizuj(cls, jednostka: str) -> str:
        jednostka = jednostka.strip()
        return cls._ALIASY.get(jednostka, jednostka)

    @classmethod
    def verify_step(
        cls,
        equation_id: str,
        inputs: list[tuple[str, str]],
        result_unit: str,
    ) -> UnitCheckResult:
        """Weryfikuje jednostki kroku dowodu (pary symbol, jednostka danych)."""
        return cls.verify_equation(equation_id, dict(inputs), result_unit)
