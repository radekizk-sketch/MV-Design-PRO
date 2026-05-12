"""Manufacturer — model producenta rozdzielnicy SN.

PR 5 (infrastruktura) goal §11A:
- producent jest osobnym bytem katalogowym (nie opcjonalnym stringiem),
- status weryfikacji jawny (`verified` / `user_defined` / `requires_catalog` /
  `deprecated`),
- każda pozycja ma `source_refs: list[str]` — pusta lista oznacza brak
  zweryfikowanych źródeł (UI pokazuje blocker katalogowy).

Reguła nadrzędna: **nie fabrykuj danych producenta**. Wszystkie 4 startowi
producenci (ZPUE Włoszczowa, Elektrometal, ABB, Siemens) mają status
`requires_catalog` i puste `source_refs` dopóki ktoś nie doda zweryfikowanych
katalogów (oficjalne PDF / repo verified / karta katalogowa).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ManufacturerStatus = Literal[
    "verified",
    "user_defined",
    "requires_catalog",
    "deprecated",
]


LifecycleStatus = Literal["current", "legacy", "archived", "unknown"]


class Manufacturer(BaseModel):
    """Producent rozdzielnicy SN — pozycja katalogu (goal §11A.2).

    Pola:
        manufacturer_ref: stabilny identyfikator (UPPER_SNAKE_CASE).
        name: pełna nazwa producenta (display).
        normalized_code: znormalizowany kod krótki (np. "ZPUE", "ABB").
        country: kraj siedziby producenta (ISO-2 lub PL nazwa); None gdy nieznane.
        status: status weryfikacji katalogu (kanon §11A.2).
        source_refs: lista identyfikatorów źródeł danych (oficjalne PDF, karty
            katalogowe, repo verified). Pusta lista przy `requires_catalog`.
        lifecycle_status: cykl życia producenta (current/legacy/archived).
        verified_at: ISO-8601 timestamp ostatniej weryfikacji źródeł
            (None gdy `requires_catalog`).
        catalog_policy_pl: opis polityki źródeł dla tego producenta
            (jakie dokumenty są wymagane, jak są weryfikowane).
        notes_pl: komentarz po polsku dla UI / audytu.
    """

    manufacturer_ref: str
    name: str
    normalized_code: str
    country: str | None = None
    status: ManufacturerStatus = "requires_catalog"
    source_refs: list[str] = Field(default_factory=list)
    lifecycle_status: LifecycleStatus = "unknown"
    verified_at: str | None = None
    catalog_policy_pl: str | None = None
    notes_pl: str | None = None

    def is_verified(self) -> bool:
        return self.status == "verified" and len(self.source_refs) > 0

    def is_blocked_for_use(self) -> bool:
        """True gdy nie wolno udawać oficjalnego katalogu producenta."""
        return self.status in {"requires_catalog", "deprecated"}
