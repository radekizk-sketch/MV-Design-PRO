"""FAB-E (E2, KLASA NIE INSTANCJA §4): kompletnosc ISSUE_SEVERITY_MAP.

``application.power_flow_comparison.service._create_issue`` czyta surowosc
problemu przez subskrypcje wprost (``ISSUE_SEVERITY_MAP[issue_code]``, BEZ
domyslu) — deklaracja w kodzie zrodlowym, ze mapa pokrywa WSZYSTKIE elementy
``PowerFlowIssueCode``, musi miec przypiety test: kazdy nowy kod problemu bez
wpisu w mapie MUSI zostac wykryty tutaj, zanim rzuci nieoczekiwany KeyError w
produkcyjnym raporcie porownania A/B.
"""

from __future__ import annotations

from domain.power_flow_comparison import ISSUE_SEVERITY_MAP, PowerFlowIssueCode


def test_severity_map_covers_every_issue_code() -> None:
    brakujace = [code for code in PowerFlowIssueCode if code not in ISSUE_SEVERITY_MAP]
    assert brakujace == [], (
        f"ISSUE_SEVERITY_MAP nie pokrywa kodow: {brakujace} — "
        "subskrypcja wprost w _create_issue rzuci KeyError zamiast fabrykowac "
        "surowosc INFORMATIONAL."
    )


def test_severity_map_has_no_extra_entries() -> None:
    """Symetria: mapa nie zawiera kluczy spoza aktualnego enum (martwe wpisy)."""
    znane_kody = set(PowerFlowIssueCode)
    nadmiarowe = [code for code in ISSUE_SEVERITY_MAP if code not in znane_kody]
    assert nadmiarowe == []
