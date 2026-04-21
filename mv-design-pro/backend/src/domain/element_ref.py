"""
ElementRefV1 — Unified Element Identity Contract.

CANONICAL: Kanoniczny kontrakt identyfikacji elementu w calym systemie.
Jedno zrodlo prawdy: elementId + elementType — identyczne we wszystkich warstwach:
  Kreator -> Domena -> Snapshot -> Solver Input -> Wyniki -> SLD -> Eksport

INVARIANTS:
- elementId jest stabilny, deterministyczny, taki sam w ENM (ref_id), Solver (element_ref),
  ResultSet (element_ref), Overlay (ref_id) i SLD (elementId).
- elementType jest enum — nie string heurystyka.
- scope jest walidacyjny — nie wplywowy na logike (uzyj do asercji, nie do branchowania).
- Immutable (frozen dataclass).
- Deterministic (sorted by elementId).

ALIGNMENT:
- ENM: ref_id -> ElementRefV1.element_id
- Solver Input: ref_id -> ElementRefV1.element_id
- ResultSet: element_ref -> ElementRefV1.element_id
- Overlay: ref_id -> ElementRefV1.element_id
- SLD TopologyInput: id -> ElementRefV1.element_id
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

# ---------------------------------------------------------------------------
# ElementTypeV1 — canonical element type enum
# ---------------------------------------------------------------------------


class ElementTypeV1(str, Enum):
    """Typ elementu w systemie — kanoniczny enum.

    Odpowiada OverlayElementKind z result_contract_v1.py
    ale rozszerza o typy nieobecne w overlay (FIELD, BUS_SECTION).
    """

    NODE = "NODE"
    BRANCH = "BRANCH"
    TRANSFORMER = "TRANSFORMER"
    STATION = "STATION"
    BUS_SECTION = "BUS_SECTION"
    FIELD = "FIELD"
    DEVICE = "DEVICE"
    GENERATOR = "GENERATOR"
    SOURCE = "SOURCE"
    LOAD = "LOAD"
    SWITCH = "SWITCH"
    PROTECTION_ASSIGNMENT = "PROTECTION_ASSIGNMENT"
    MEASUREMENT = "MEASUREMENT"
    CORRIDOR = "CORRIDOR"
    JUNCTION = "JUNCTION"


class ElementScopeV1(str, Enum):
    """Zakres elementu — do walidacji, nie do logiki.

    Uzyj do asercji typu: 'ten elementId powinien istniec w danym scope'.
    NIE uzyj do branchowania logiki.
    """

    DOMAIN = "DOMAIN"
    SNAPSHOT = "SNAPSHOT"
    SLD = "SLD"
    RESULT = "RESULT"
    EXPORT = "EXPORT"


# ---------------------------------------------------------------------------
# CatalogRefV1 — reference to catalog entry
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CatalogRefV1:
    """Referencja do wpisu katalogowego.

    catalogId jest stabilne — zmiana katalogu wymaga nowego catalogId.
    Brak catalogRef = FixAction (nigdy domyslna wartosc).
    """

    catalog_id: str
    category: str
    manufacturer: str | None = None
    name: str | None = None
    version: str | None = None


# ---------------------------------------------------------------------------
# ElementRefV1 — unified identity contract
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ElementRefV1:
    """Kanoniczny identyfikator elementu.

    Jedyne zrodlo prawdy: element_id + element_type.
    Identyczny we wszystkich warstwach systemu.

    USAGE:
    - Kreator tworzy element z ElementRefV1
    - Domena przechowuje ElementRefV1 w Snapshot
    - Solver uzywa element_id z ElementRefV1
    - ResultSet odwoluje sie do element_id z ElementRefV1
    - SLD uzywa element_id z ElementRefV1
    - Eksport uzywa element_id z ElementRefV1
    """

    element_id: str
    element_type: ElementTypeV1
    station_id: str | None = None
    catalog_ref: CatalogRefV1 | None = None

    def to_dict(self) -> dict:
        """Canonical dict for hashing/serialization."""
        d: dict = {
            "element_id": self.element_id,
            "element_type": self.element_type.value,
        }
        if self.station_id is not None:
            d["station_id"] = self.station_id
        if self.catalog_ref is not None:
            d["catalog_ref"] = {
                "catalog_id": self.catalog_ref.catalog_id,
                "category": self.catalog_ref.category,
                "manufacturer": self.catalog_ref.manufacturer,
                "name": self.catalog_ref.name,
                "version": self.catalog_ref.version,
            }
        return d


# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------


def build_element_ref_index(
    refs: list[ElementRefV1],
) -> dict[str, ElementRefV1]:
    """Build element_id -> ElementRefV1 index (sorted, deterministic)."""
    return {ref.element_id: ref for ref in sorted(refs, key=lambda r: r.element_id)}
