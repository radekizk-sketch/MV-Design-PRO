"""Efekt topologiczny po zwarciu — deklaracja z opcji biegu, bez narracji zdarzeń.

Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): dawny budowniczy śladu automatyki
(`build_automation_trace`) opowiadał sekwencję AUTOMATION_STARTED → FAULT_APPLIED →
FAULT_CLEARED → POST_FAULT_TOPOLOGY_EFFECT → DYNAMIC_STABILITY_EVALUATED z czasu
wyłączenia WPISANEGO przez użytkownika — żadne zabezpieczenie nie było symulowane, a
ostatnie zdarzenie niosło werdykt STABLE z kątów wpisanych ręcznie. Budowniczy skasowany;
test sekwencji ODWRÓCONY (moduł nie ma już narracji). Intencja zachowana: efekt
topologiczny zadeklarowany w opcjach biegu jest kanoniczny i deterministyczny.
"""

from __future__ import annotations

import application.automation.trace as modul_sladu
from application.automation.trace import build_post_fault_topology_effect


def test_post_fault_topology_effect_is_canonical_and_deterministic() -> None:
    effect_a = build_post_fault_topology_effect(
        source_id="src-1",
        faulted_element_id="line-11",
        cleared_by_element_ids=["cb-2", "cb-1", "cb-1"],
        isolated_element_ids=["bus-7", "load-2", "load-2"],
        additionally_opened_element_ids=["sw-5"],
        disconnected_source_ids=["src-backup"],
    )
    effect_b = build_post_fault_topology_effect(
        source_id="src-1",
        faulted_element_id="line-11",
        cleared_by_element_ids=["cb-1", "cb-2"],
        isolated_element_ids=["load-2", "bus-7"],
        additionally_opened_element_ids=["sw-5"],
        disconnected_source_ids=["src-backup"],
    )

    assert effect_a.to_dict() == effect_b.to_dict()
    assert effect_a.opened_element_ids == ("cb-1", "cb-2", "sw-5")
    assert effect_a.isolated_element_ids == ("bus-7", "load-2")
    assert effect_a.disconnected_source_ids == ("src-backup",)
    assert effect_a.network_state == "ISLANDED"
    assert effect_a.outage_scope == "WIDE"


def test_trace_module_has_no_protection_event_narrative() -> None:
    """Brak budowniczego narracji zdarzeń zabezpieczeń i oceny stabilności."""
    assert not hasattr(modul_sladu, "build_automation_trace")
    assert not hasattr(modul_sladu, "AutomationTrace")
    assert not hasattr(modul_sladu, "AutomationEvent")
