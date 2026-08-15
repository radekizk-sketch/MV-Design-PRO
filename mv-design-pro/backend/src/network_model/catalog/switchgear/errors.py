"""Twarde błędy zgodności katalogowej rodzin rozdzielnic SN.

Osobny moduł, bo z tego wyjątku korzystają zarówno konfiguracje fabryczne, jak
i walidator rodziny — a te dwa moduły nie mogą importować się nawzajem.
"""

from __future__ import annotations


class NiezgodnoscKonfiguracjiError(ValueError):
    """Kombinacja spoza katalogu producenta — twardy błąd z polskim zdaniem.

    Reguła (`docs/domain/KONFIGURATOR_ROZDZIELNIC_SN_RMU.md` §4): zgodność
    pola, aparatu, napięcia, prądu i zwarcia wynika z katalogu rodziny, a nie
    z dowolnego dropdownu. Kombinacja, której katalog nie przewiduje, kończy
    się TWARDYM błędem — nigdy cichym przycięciem ani domyślną wartością.
    """
