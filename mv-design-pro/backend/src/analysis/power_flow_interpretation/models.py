"""P22: Power Flow Interpretation Models.

Warstwa interpretacji wynikow rozplywu mocy:
- Czytelna inzyniersko
- Audytowalna
- Deterministyczna
- Gotowa do A/B porownan

KANON (BINDING):
- Analysis != Solver (ZERO obliczen fizycznych)
- Interpretacja WYLACZNIE na podstawie PowerFlowResult
- Determinizm absolutny
- 100% jezyk polski w description_pl
- Brak norm, brak "OK / VIOLATION" - tylko severity (INFO / WARN / HIGH)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Any


class FindingSeverity(StrEnum):
    """Poziom istotnosci obserwacji.

    Reguly (jawne, stale):
    - INFO: |V - 1.0| < 2%
    - WARN: 2-5%
    - HIGH: >5%
    """

    INFO = "INFO"
    WARN = "WARN"
    HIGH = "HIGH"


# =============================================================================
# Voltage Findings (Obserwacje napieciowe)
# =============================================================================


@dataclass(frozen=True)
class VoltageFinding:
    """Obserwacja napieciowa dla pojedynczej szyny.

    Attributes:
        bus_id: Identyfikator szyny
        v_pu: Napiecie w jednostkach wzglednych [pu]
        deviation_pct: Odchylenie od 1.0 pu w procentach
        severity: Poziom istotnosci (INFO / WARN / HIGH)
        description_pl: Opis w jezyku polskim
        evidence_ref: Referencja do zrodla danych
    """

    bus_id: str
    v_pu: float
    deviation_pct: float
    severity: FindingSeverity
    description_pl: str
    evidence_ref: str


# =============================================================================
# Branch Loading Findings (Obserwacje obciazenia galezi)
# =============================================================================


@dataclass(frozen=True)
class BranchLoadingFinding:
    """Obserwacja obciazenia dla pojedynczej galezi.

    Attributes:
        branch_id: Identyfikator galezi
        loading_pct: Obciazenie wzgledne w procentach (jesli dostepne)
        losses_p_mw: Straty mocy czynnej [MW]
        losses_q_mvar: Straty mocy biernej [Mvar]
        severity: Poziom istotnosci (INFO / WARN / HIGH)
        description_pl: Opis w jezyku polskim
        evidence_ref: Referencja do zrodla danych
    """

    branch_id: str
    loading_pct: float | None
    losses_p_mw: float
    losses_q_mvar: float
    severity: FindingSeverity
    description_pl: str
    evidence_ref: str


# =============================================================================
# Summary + Ranking
# =============================================================================


@dataclass(frozen=True)
class InterpretationRankedItem:
    """Element rankingu problemow.

    Ranking deterministyczny: severity + magnitude (odchylenie/obciazenie).
    """

    rank: int
    element_type: str  # "voltage" | "branch_loading"
    element_id: str
    severity: FindingSeverity
    magnitude: float
    description_pl: str


@dataclass(frozen=True)
class InterpretationSummary:
    """Podsumowanie interpretacji rozplywu mocy.

    Attributes:
        total_voltage_findings: Calkowita liczba obserwacji napieciowych
        total_branch_findings: Calkowita liczba obserwacji galeziowych
        high_count: Liczba obserwacji HIGH
        warn_count: Liczba obserwacji WARN
        info_count: Liczba obserwacji INFO
        top_issues: Top N najistotniejszych problemow (deterministyczny ranking)
    """

    total_voltage_findings: int
    total_branch_findings: int
    high_count: int
    warn_count: int
    info_count: int
    top_issues: tuple[InterpretationRankedItem, ...]


# =============================================================================
# Interpretation Trace (Slad interpretacji)
# =============================================================================


@dataclass(frozen=True)
class InterpretationThresholds:
    """Progi uzyte do klasyfikacji severity.

    BINDING: Te progi sa jawne i stale.
    """

    voltage_info_max_pct: float  # |V - 1.0| < 2% -> INFO
    voltage_warn_max_pct: float  # 2-5% -> WARN
    # >5% -> HIGH (implicit)

    branch_loading_info_max_pct: float | None  # Obciazenie < X% -> INFO
    branch_loading_warn_max_pct: float | None  # X-Y% -> WARN
    # >Y% -> HIGH (implicit)


@dataclass(frozen=True)
class InterpretationTrace:
    """Slad interpretacji - pelna audytowalnosc.

    Attributes:
        interpretation_id: Unikalny identyfikator interpretacji
        power_flow_run_id: ID runu rozplywu mocy (zrodlo danych)
        created_at: Timestamp utworzenia interpretacji
        thresholds: Zastosowane progi
        rules_applied: Lista zastosoanych regul (w kolejnosci)
        data_sources: Zrodla danych
        interpretation_version: Wersja algorytmu interpretacji
    """

    interpretation_id: str
    power_flow_run_id: str
    created_at: datetime
    thresholds: InterpretationThresholds
    rules_applied: tuple[str, ...]
    data_sources: tuple[str, ...]
    interpretation_version: str


# =============================================================================
# Context (Kontekst interpretacji)
# =============================================================================


@dataclass(frozen=True)
class InterpretationContext:
    """Kontekst interpretacji.

    Attributes:
        project_name: Nazwa projektu
        case_name: Nazwa przypadku operacyjnego
        run_timestamp: Timestamp wykonania rozplywu
        snapshot_id: ID snapshotu sieci
    """

    project_name: str | None
    case_name: str | None
    run_timestamp: datetime | None
    snapshot_id: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_name": self.project_name,
            "case_name": self.case_name,
            "run_timestamp": self.run_timestamp.isoformat() if self.run_timestamp else None,
            "snapshot_id": self.snapshot_id,
        }


# =============================================================================
# Main Result (Wynik interpretacji)
# =============================================================================


@dataclass(frozen=True)
class PowerFlowInterpretationResult:
    """Wynik interpretacji rozplywu mocy.

    CANONICAL CONTRACT:
    - READ-ONLY: Nie modyfikuje zadnych danych wejsciowych
    - DETERMINISTIC: Ten sam wejsciowy run -> identyczny wynik
    - NO PHYSICS: Tylko interpretacja, zero obliczen fizycznych
    - POLISH: Wszystkie opisy w jezyku polskim

    Attributes:
        context: Kontekst interpretacji
        voltage_findings: Obserwacje napieciowe (posortowane deterministycznie)
        branch_findings: Obserwacje obciazenia galezi (posortowane deterministycznie)
        summary: Podsumowanie z rankingiem
        trace: Slad interpretacji dla audytowalnosci
    """

    context: InterpretationContext | None
    voltage_findings: tuple[VoltageFinding, ...]
    branch_findings: tuple[BranchLoadingFinding, ...]
    summary: InterpretationSummary
    trace: InterpretationTrace

    def to_dict(self) -> dict[str, Any]:
        from analysis.power_flow_interpretation.serializer import result_to_dict

        return result_to_dict(self)
