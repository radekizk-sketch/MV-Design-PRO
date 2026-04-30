"""
ENM domain invariant exceptions.

Wyjatki rzucane gdy niezmienniki domeny (porty, role, ciaglosc napieciowa)
sa naruszone. Zaprojektowane do uzycia w warstwie ActionEnvelope (wizard_actions)
przed mutacja snapshota.

Wpis V12S-007 w REJESTR_DECYZJI_SEMANTYCZNYCH.md.
"""

from __future__ import annotations


class DomainInvariantError(Exception):
    """Naruszenie niezmiennika domeny ENM (port, rola, ciaglosc napieciowa)."""

    def __init__(
        self,
        code: str,
        message_pl: str,
        element_refs: list[str] | None = None,
    ) -> None:
        self.code = code
        self.message_pl = message_pl
        self.element_refs = list(element_refs or [])
        super().__init__(f"[{code}] {message_pl}")
