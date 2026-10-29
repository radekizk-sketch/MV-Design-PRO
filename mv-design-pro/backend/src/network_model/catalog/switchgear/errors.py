"""Twarde błędy zgodności katalogowej rodzin rozdzielnic SN.

Osobny moduł, bo z tego wyjątku korzystają zarówno konfiguracje fabryczne, jak
i walidator rodziny — a te dwa moduły nie mogą importować się nawzajem.
"""

from __future__ import annotations

from network_model.catalog.gazy_fluorowane import KOD_ODMOWY_GAZU_FLUOROWANEGO
from network_model.odmowa_danych import OdmowaDanychError


class NiezgodnoscKonfiguracjiError(OdmowaDanychError):
    """Kombinacja spoza katalogu producenta — twardy błąd z polskim zdaniem.

    Reguła (`docs/domain/KONFIGURATOR_ROZDZIELNIC_SN_RMU.md` §4): zgodność
    pola, aparatu, napięcia, prądu i zwarcia wynika z katalogu rodziny, a nie
    z dowolnego dropdownu. Kombinacja, której katalog nie przewiduje, kończy
    się TWARDYM błędem — nigdy cichym przycięciem ani domyślną wartością.
    """


class GazFluorowanyError(NiezgodnoscKonfiguracjiError):
    """Odmowa nowego pola SN z gazem fluorowanym (SF₆) — rodzina, aparat albo szablon pola.

    Podklasa niezgodności katalogowej, bo każda droga budowy pola już ją obsługuje; własny kod
    (``kod``) odróżnia tę odmowę od zwykłej niezgodności rodziny, a zdanie niesie podstawę
    i akcję naprawczą (``gazy_fluorowane.powod_odmowy_gazu_fluorowanego_pl``).
    """

    def __init__(self, komunikat: str) -> None:
        super().__init__(komunikat)
        self.kod = KOD_ODMOWY_GAZU_FLUOROWANEGO


def kod_odmowy_konfiguracji(blad: NiezgodnoscKonfiguracjiError, domyslny: str) -> str:
    """Kod odmowy operacji dla niezgodności konfiguracji: własny kod podklasy albo domyślny
    kod drogi budowy pola (``sn.pole_katalogowe_niezgodne``)."""
    kod = getattr(blad, "kod", None)
    return kod if isinstance(kod, str) and kod else domyslny
