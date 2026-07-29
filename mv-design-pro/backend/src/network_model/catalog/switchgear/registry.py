"""ManufacturerRegistry — startowi producenci rozdzielnic SN.

Goal §11A.3: minimum biblioteki = ZPUE Włoszczowa, Elektrometal, ABB, Siemens.

**Reguła nadrzędna: nie fabrykuj danych producenta.** Wszyscy 4 producenci
mają na start status `requires_catalog` i puste `source_refs`. Dopiero gdy
ktoś doda zweryfikowane oficjalne katalogi (PDF / karta katalogowa / repo
verified entry), status zmienia się na `verified`.

Brak rodzin (`SwitchgearFamily`) i kompletnych szablonów (`CompleteMvBayTemplate`)
producenta — istniejące 10 kanonicznych `BayTemplate` w `bay_templates.py`
pozostaje jako fallback z `source_status='canonical_fallback'`.

UI (PR 5 frontend):
- `ManufacturerPicker` pokazuje 4 producentów z badge „Wymaga uzupełnienia
  katalogu".
- `SwitchgearFamilyPicker` pusty (brak verified family) — proponuje fallback
  do canonical.
- `BayTemplatePicker` fallback do canonical `BayTemplate` z badge ostrzegawczym.
"""

from __future__ import annotations

from .manufacturer import Manufacturer

# ---------------------------------------------------------------------------
# Startowi producenci (wszyscy `requires_catalog`)
# ---------------------------------------------------------------------------

ZPUE_WLOSZCZOWA = Manufacturer(
    manufacturer_ref="ZPUE_WLOSZCZOWA",
    name="ZPUE S.A. (Włoszczowa)",
    normalized_code="ZPUE",
    country="PL",
    status="requires_catalog",
    source_refs=[],
    lifecycle_status="current",
    verified_at=None,
    catalog_policy_pl=(
        "Dane techniczne mogą pochodzić wyłącznie z oficjalnych katalogów ZPUE "
        "S.A. (Włoszczowa), kart produktów lub dokumentacji zatwierdzonej "
        "przez producenta. Niezweryfikowane wartości nie mogą być oznaczone "
        "jako 'official_catalog'."
    ),
    notes_pl=(
        "Producent rozdzielnic SN i stacji transformatorowych w Polsce. "
        "Wymaga uzupełnienia danych katalogowych z oficjalnych źródeł "
        "(katalog PDF, karta produktu, dokumentacja zatwierdzona)."
    ),
)

ELEKTROMETAL = Manufacturer(
    manufacturer_ref="ELEKTROMETAL",
    name="Elektrometal Energetyka S.A.",
    normalized_code="ELEKTROMETAL",
    country="PL",
    status="requires_catalog",
    source_refs=[],
    lifecycle_status="current",
    verified_at=None,
    catalog_policy_pl=(
        "Dane techniczne mogą pochodzić wyłącznie z oficjalnych katalogów "
        "Elektrometal Energetyka S.A. lub dokumentacji zatwierdzonej "
        "przez producenta."
    ),
    notes_pl=(
        "Polski producent rozdzielnic SN. Wymaga uzupełnienia danych "
        "katalogowych z oficjalnych źródeł producenta."
    ),
)

ABB = Manufacturer(
    manufacturer_ref="ABB",
    name="ABB Ltd.",
    normalized_code="ABB",
    country="CH",
    status="requires_catalog",
    source_refs=[],
    lifecycle_status="current",
    verified_at=None,
    catalog_policy_pl=(
        "Dane techniczne mogą pochodzić wyłącznie z oficjalnych kart "
        "produktów ABB lub dokumentacji zatwierdzonej przez producenta. "
        "Rodziny produktowe (UniGear, SafeRing, SafePlus itp.) wymagają "
        "weryfikacji wersji katalogu."
    ),
    notes_pl=(
        "Międzynarodowy producent rozdzielnic SN. Wymaga uzupełnienia "
        "danych katalogowych z oficjalnych kart produktów ABB."
    ),
)

SIEMENS = Manufacturer(
    manufacturer_ref="SIEMENS",
    name="Siemens AG",
    normalized_code="SIEMENS",
    country="DE",
    status="requires_catalog",
    source_refs=[],
    lifecycle_status="current",
    verified_at=None,
    catalog_policy_pl=(
        "Dane techniczne mogą pochodzić wyłącznie z oficjalnych kart "
        "produktów Siemens lub dokumentacji zatwierdzonej przez producenta. "
        "Rodziny produktowe (NXAIR, 8DJH, SIMOSEC itp.) wymagają weryfikacji "
        "wersji katalogu."
    ),
    notes_pl=(
        "Międzynarodowy producent rozdzielnic SN. Wymaga uzupełnienia "
        "danych katalogowych z oficjalnych kart produktów Siemens."
    ),
)

SCHNEIDER_ELECTRIC = Manufacturer(
    manufacturer_ref="SCHNEIDER_ELECTRIC",
    name="Schneider Electric SE",
    normalized_code="SCHNEIDER",
    country="FR",
    status="requires_catalog",
    source_refs=[],
    lifecycle_status="current",
    verified_at=None,
    catalog_policy_pl=(
        "Dane techniczne mogą pochodzić wyłącznie z oficjalnych kart "
        "produktów Schneider Electric lub dokumentacji zatwierdzonej przez "
        "producenta. Rodziny produktowe (SM6, RM6, Premset itp.) wymagają "
        "weryfikacji wersji katalogu."
    ),
    notes_pl=(
        "Międzynarodowy producent rozdzielnic SN. Dodany w programie "
        "Reference Engine V1 (REFERENCE_ENGINE_SPEC_V1.md) — rodzina SM6-24 "
        "w rejestrze rodzin ze statusem repo_verified. Status producenta "
        "requires_catalog do czasu zatwierdzenia oficjalnych kart PDF."
    ),
)

_STARTING_MANUFACTURERS: tuple[Manufacturer, ...] = (
    ZPUE_WLOSZCZOWA,
    ELEKTROMETAL,
    ABB,
    SIEMENS,
    SCHNEIDER_ELECTRIC,
)

# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

MANUFACTURER_REGISTRY: dict[str, Manufacturer] = {
    m.manufacturer_ref: m for m in _STARTING_MANUFACTURERS
}


def list_manufacturers() -> list[Manufacturer]:
    """Lista producentów posortowana deterministycznie (manufacturer_ref)."""
    return sorted(MANUFACTURER_REGISTRY.values(), key=lambda m: m.manufacturer_ref)


def get_manufacturer(manufacturer_ref: str) -> Manufacturer:
    """Pobiera producenta po ref. Raises KeyError gdy brak."""
    if manufacturer_ref not in MANUFACTURER_REGISTRY:
        available = ", ".join(sorted(MANUFACTURER_REGISTRY.keys()))
        raise KeyError(f"Unknown manufacturer_ref: {manufacturer_ref}. Available: {available}")
    return MANUFACTURER_REGISTRY[manufacturer_ref]


def manufacturers_requiring_catalog() -> list[Manufacturer]:
    """Producenci wymagający uzupełnienia katalogu (status requires_catalog)."""
    return [m for m in list_manufacturers() if m.status == "requires_catalog"]


def verified_manufacturers() -> list[Manufacturer]:
    """Producenci ze zweryfikowanymi katalogami (status verified + source_refs)."""
    return [m for m in list_manufacturers() if m.is_verified()]
