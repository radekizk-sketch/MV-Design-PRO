"""FAB-E (E2, KLASA NIE INSTANCJA §4): kompletnosc ISSUE_SEVERITY_MAP (ochrona).

``application.protection_comparison.service._create_issue`` czyta surowosc
problemu przez subskrypcje wprost (``ISSUE_SEVERITY_MAP[issue_code]``, BEZ
domyslu) — deklaracja w kodzie zrodlowym, ze mapa pokrywa WSZYSTKIE elementy
``IssueCode``, musi miec przypiety test (ten sam wzorzec co
``test_power_flow_comparison_severity_map.py``).
"""

from __future__ import annotations

from domain.protection_comparison import ISSUE_SEVERITY_MAP, IssueCode


def test_severity_map_covers_every_issue_code() -> None:
    brakujace = [code for code in IssueCode if code not in ISSUE_SEVERITY_MAP]
    assert brakujace == [], (
        f"ISSUE_SEVERITY_MAP nie pokrywa kodow: {brakujace} — "
        "subskrypcja wprost w _create_issue rzuci KeyError zamiast fabrykowac "
        "surowosc INFORMATIONAL."
    )


def test_severity_map_has_no_extra_entries() -> None:
    znane_kody = set(IssueCode)
    nadmiarowe = [code for code in ISSUE_SEVERITY_MAP if code not in znane_kody]
    assert nadmiarowe == []
