"""
ReadinessIssueV1 — pojedyncza pozycja braku gotowości z obszarem i priorytetem.

Typy rekordu braku (obszar, priorytet, komunikat PL, wskazanie elementu) używane przez mosty
analiz, które zwracają braki danych obok wyniku (np. most zwarcia doziemnego
``application/analyses/earthing/ground_fault_bridge.py``).

Jedynym walidatorem gotowości modelu do obliczeń jest walidator ENM (``enm/validator.py``)
z ``CalculationReadiness`` (ADR-025, O-65). Dawny profil ``ReadinessProfileV1`` z bramkami
``require_*`` i wyjątkiem ``ReadinessGateError`` — druga, równoległa bramka bez konsumenta
w produkcie (tylko testy) — skasowany w commicie 4 karty komunikatów (2026-10-30).

INVARIANTS:
- Immutable (frozen dataclass).
- Rekord NIE mutuje modelu — tylko informuje.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

# ---------------------------------------------------------------------------
# Readiness Area — logical grouping for FixActions
# ---------------------------------------------------------------------------


class ReadinessAreaV1(StrEnum):
    """Obszar gotowosci — grupy problemow w kreatorze."""

    CATALOGS = "CATALOGS"
    TOPOLOGY = "TOPOLOGY"
    SOURCES = "SOURCES"
    STATIONS = "STATIONS"
    GENERATORS = "GENERATORS"
    PROTECTION = "PROTECTION"
    ANALYSIS = "ANALYSIS"


class ReadinessPriority(StrEnum):
    """Priorytet problemu gotowosci."""

    BLOCKER = "BLOCKER"
    WARNING = "WARNING"
    INFO = "INFO"


# ---------------------------------------------------------------------------
# ReadinessIssueV1 — single readiness issue
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ReadinessIssueV1:
    """Pojedynczy problem gotowosci.

    Stabilny kod, komunikat PL, wskazanie elementu + obszaru + priorytetu.
    """

    code: str
    area: ReadinessAreaV1
    priority: ReadinessPriority
    message_pl: str
    element_id: str | None = None
    element_type: str | None = None
    fix_hint_pl: str | None = None
    wizard_step: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "area": self.area.value,
            "priority": self.priority.value,
            "message_pl": self.message_pl,
            "element_id": self.element_id,
            "element_type": self.element_type,
            "fix_hint_pl": self.fix_hint_pl,
            "wizard_step": self.wizard_step,
        }
