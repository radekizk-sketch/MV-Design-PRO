"""
Protection Sanity Checks — Data Models.

CANONICAL ALIGNMENT:
- Frozen dataclasses for immutability and determinism
- Stable codes for UI/reports/future solver
- Polish labels per UI convention

Ten modul definiuje struktury danych dla wynikow walidacji:
- ProtectionSanityCheckResult: wynik pojedynczej reguly
- SanityCheckSeverity: poziom waznosci (ERROR/WARN/INFO)

100% POLISH LABELS (UI po polsku).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any


class SanityCheckSeverity(StrEnum):
    """
    Poziom waznosci wyniku walidacji.

    - ERROR: Blad krytyczny — konfiguracja nieprawidlowa
    - WARN: Ostrzezenie — konfiguracja moze byc problematyczna
    - INFO: Informacja — brak danych do pelnej analizy
    """

    ERROR = "ERROR"
    WARN = "WARN"
    INFO = "INFO"

    def __lt__(self, other: SanityCheckSeverity) -> bool:
        """Porownanie dla sortowania: ERROR > WARN > INFO."""
        order = {
            SanityCheckSeverity.ERROR: 0,
            SanityCheckSeverity.WARN: 1,
            SanityCheckSeverity.INFO: 2,
        }
        return order[self] < order[other]


# =============================================================================
# Rule Codes — stabilne kody regul
# =============================================================================


class SanityCheckCode(StrEnum):
    """
    Kody regul walidacji — STABILNE dla UI/raportow.

    Konwencja nazewnictwa:
    - PREFIX: typ reguly (VOLT_, FREQ_, OC_, SPZ_, GEN_)
    - SUFFIX: opis bledu (MISSING_UN, OVERLAP, etc.)
    """

    # Napieciowe (27/59)
    VOLT_MISSING_UN = "VOLT_MISSING_UN"
    VOLT_OVERLAP = "VOLT_OVERLAP"
    VOLT_U_LT_TOO_LOW = "VOLT_U_LT_TOO_LOW"
    VOLT_U_GT_TOO_HIGH = "VOLT_U_GT_TOO_HIGH"

    # Czestotliwosciowe (81U/81O)
    FREQ_OVERLAP = "FREQ_OVERLAP"
    FREQ_F_LT_TOO_LOW = "FREQ_F_LT_TOO_LOW"
    FREQ_F_GT_TOO_HIGH = "FREQ_F_GT_TOO_HIGH"

    # ROCOF (81R)
    ROCOF_NON_POSITIVE = "ROCOF_NON_POSITIVE"
    ROCOF_TOO_HIGH = "ROCOF_TOO_HIGH"

    # Nadpradowe (50/51)
    OC_MISSING_IN = "OC_MISSING_IN"
    OC_OVERLAP = "OC_OVERLAP"
    OC_I_GT_TOO_LOW = "OC_I_GT_TOO_LOW"
    OC_I_INST_TOO_LOW = "OC_I_INST_TOO_LOW"

    # SPZ (79)
    SPZ_NO_TRIP_FUNCTION = "SPZ_NO_TRIP_FUNCTION"
    SPZ_MISSING_CYCLE_DATA = "SPZ_MISSING_CYCLE_DATA"

    # Ogolne
    GEN_NEGATIVE_SETPOINT = "GEN_NEGATIVE_SETPOINT"
    GEN_PARTIAL_ANALYSIS = "GEN_PARTIAL_ANALYSIS"


# =============================================================================
# Sanity Check Result — wynik pojedynczej reguly
# =============================================================================


@dataclass(frozen=True)
class ProtectionSanityCheckResult:
    """
    Wynik pojedynczej reguly walidacji.

    INVARIANTY:
    - code: stabilny kod reguly (dla UI/raportow)
    - severity: ERROR > WARN > INFO
    - message_pl: komunikat po polsku (100% PL)
    - element_id: identyfikator elementu chronionego
    - element_type: typ elementu (dla kontekstu)

    Opcjonalne:
    - function_ansi: kod ANSI funkcji (np. '27', '50')
    - function_code: kod wewnetrzny funkcji (np. 'UNDERVOLTAGE')
    - evidence: dane wejsciowe jako dowod (bez obliczen)

    Attributes:
        severity: poziom waznosci
        code: stabilny kod reguly
        message_pl: komunikat po polsku
        element_id: identyfikator elementu
        element_type: typ elementu
        function_ansi: kod ANSI (opcjonalny)
        function_code: kod wewnetrzny (opcjonalny)
        evidence: dane wejsciowe jako dowod (opcjonalny)
    """

    severity: SanityCheckSeverity
    code: SanityCheckCode
    message_pl: str
    element_id: str
    element_type: str
    function_ansi: str | None = None
    function_code: str | None = None
    evidence: dict[str, Any] | None = None

    def __post_init__(self) -> None:
        """Validate invariants."""
        if not self.message_pl or self.message_pl.strip() == "":
            raise ValueError("message_pl nie moze byc puste")
        if not self.element_id or self.element_id.strip() == "":
            raise ValueError("element_id nie moze byc puste")
        if not self.element_type or self.element_type.strip() == "":
            raise ValueError("element_type nie moze byc puste")

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict."""
        return {
            "severity": self.severity.value,
            "code": self.code.value,
            "message_pl": self.message_pl,
            "element_id": self.element_id,
            "element_type": self.element_type,
            "function_ansi": self.function_ansi,
            "function_code": self.function_code,
            "evidence": self.evidence,
        }


# =============================================================================
# Polish Labels — etykiety polskie dla kodow regul
# =============================================================================


SANITY_CHECK_CODE_LABELS_PL: dict[SanityCheckCode, str] = {
    # Napieciowe
    SanityCheckCode.VOLT_MISSING_UN: "Brak wartosci Un dla nastawy napieciowej",
    SanityCheckCode.VOLT_OVERLAP: "Nakladalnie sie prog U< i U> (U< >= U>)",
    SanityCheckCode.VOLT_U_LT_TOO_LOW: "Prog U< zbyt niski (< 0,5×Un)",
    SanityCheckCode.VOLT_U_GT_TOO_HIGH: "Prog U> zbyt wysoki (> 1,2×Un)",
    # Czestotliwosciowe
    SanityCheckCode.FREQ_OVERLAP: "Nakladanie sie progow f< i f> (f< >= f>)",
    SanityCheckCode.FREQ_F_LT_TOO_LOW: "Prog f< zbyt niski (< 45 Hz)",
    SanityCheckCode.FREQ_F_GT_TOO_HIGH: "Prog f> zbyt wysoki (> 55 Hz)",
    # ROCOF
    SanityCheckCode.ROCOF_NON_POSITIVE: "df/dt nieadodatnie (<= 0)",
    SanityCheckCode.ROCOF_TOO_HIGH: "df/dt zbyt wysokie (> 10 Hz/s)",
    # Nadpradowe
    SanityCheckCode.OC_MISSING_IN: "Brak wartosci In dla nastawy pradowej",
    SanityCheckCode.OC_OVERLAP: "Nakladanie sie progow I> i I>> (I> >= I>>)",
    SanityCheckCode.OC_I_GT_TOO_LOW: "Prog I> zbyt niski (< 1,0×In)",
    SanityCheckCode.OC_I_INST_TOO_LOW: "Prog I>> zbyt niski (< 1,5×In)",
    # SPZ
    SanityCheckCode.SPZ_NO_TRIP_FUNCTION: "SPZ aktywne bez funkcji wyzwalajacej",
    SanityCheckCode.SPZ_MISSING_CYCLE_DATA: "Brak danych cyklu SPZ",
    # Ogolne
    SanityCheckCode.GEN_NEGATIVE_SETPOINT: "Nastawa niefizyczna (ujemna)",
    SanityCheckCode.GEN_PARTIAL_ANALYSIS: "Brak danych bazowych — analiza czesciowa",
}


SEVERITY_LABELS_PL: dict[SanityCheckSeverity, str] = {
    SanityCheckSeverity.ERROR: "Blad",
    SanityCheckSeverity.WARN: "Ostrzezenie",
    SanityCheckSeverity.INFO: "Informacja",
}
