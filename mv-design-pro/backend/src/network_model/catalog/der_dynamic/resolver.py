"""Resolver profili dynamicznych DER — WYŁĄCZNIE po jawnym wyborze (karta W6-1 SS0 p.3).

Kasacja "ZAWSZE zwraca profil": `resolve_der_dynamic_profile(...)` zwraca profil
TYLKO gdy istnieje jawny wybór (parametr wołania) albo wpis katalogu przekształtnika
niesie `dynamic_profile_id`. Bez żadnego z nich zwraca `DerDynamicResolution` z
`profile=None`, `source="brak"` — żaden cichy fallback do wartości "typowej
normy" bez świadomego wyboru projektanta/karty katalogowej (zero fabrykacji,
dopełnienie precedensu k_sc DEFAULT_FORBIDDEN — S-2).

Strategia rozwiązania:
1. Jeśli `explicit_profile_id` jest podany i istnieje w rejestrze → użyj go.
2. Jeśli wpis katalogu (PV/BESS/Wind) ma jawne `dynamic_profile_id` → użyj.
3. W przeciwnym razie `source="brak"` — WOŁAJĄCY zgłasza to jako brak danej
   (readiness: `blocked` `der.dynamika_missing`), nigdy jako "n/a" ciche.

Każdy resolve dostaje `DerDynamicResolution` zawierające źródło rozwiązania
(WHITE BOX trace zgodnie z AGENTS.md §2).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from network_model.catalog.der_dynamic.defaults import (
    INVERTER_DYNAMIC_PROFILES,
    WIND_DYNAMIC_PROFILES,
)
from network_model.catalog.der_dynamic.models import (
    DerDynamicProfile,
    DerKind,
    InverterControlMode,
)

ResolutionSource = Literal[
    "explicit_profile_id",
    "catalog_entry_dynamic_profile_id",
    "brak",
]


@dataclass(frozen=True)
class DerDynamicResolution:
    """Wynik rozwiązania profilu dynamicznego DER (WHITE BOX trace).

    `profile` jest `None` WYŁĄCZNIE gdy `source == "brak"` — brak jawnego
    wyboru i brak wskazania katalogowego, nigdy fallback.
    """

    profile: DerDynamicProfile | None
    source: ResolutionSource
    rationale_pl: str

    @property
    def profile_id(self) -> str | None:
        return self.profile.profile_id if self.profile is not None else None


def _resolve_inverter(
    der_kind: DerKind,
    control_mode: InverterControlMode,
    explicit_profile_id: str | None,
    catalog_dynamic_profile_id: str | None,
) -> DerDynamicResolution:
    """Resolve dla PV / BESS."""
    # Uzasadnienie nazywa profil jego nazwą z rejestru (`profile_name_pl`), identyfikator
    # profilu zostaje w `profile.profile_id` (karta #144).
    if explicit_profile_id and explicit_profile_id in INVERTER_DYNAMIC_PROFILES:
        profil = INVERTER_DYNAMIC_PROFILES[explicit_profile_id]
        return DerDynamicResolution(
            profile=profil,
            source="explicit_profile_id",
            rationale_pl=f"Wskazany profil „{profil.profile_name_pl}” znaleziony w rejestrze.",
        )
    if catalog_dynamic_profile_id and catalog_dynamic_profile_id in INVERTER_DYNAMIC_PROFILES:
        profil = INVERTER_DYNAMIC_PROFILES[catalog_dynamic_profile_id]
        return DerDynamicResolution(
            profile=profil,
            source="catalog_entry_dynamic_profile_id",
            rationale_pl=f"Wpis katalogu wskazuje profil „{profil.profile_name_pl}”.",
        )
    return DerDynamicResolution(
        profile=None,
        source="brak",
        rationale_pl=(
            f"Brak jawnie wskazanego profilu dynamicznego dla {der_kind} "
            f"({control_mode}) — ani parametr wywołania, ani wpis katalogu "
            "przekształtnika nie niesie profile_id. Wskaż profil wprost "
            "(operator/karta katalogowa) albo profil typowy normy świadomie."
        ),
    )


def _resolve_wind(
    converter_type: str | None,
    explicit_profile_id: str | None,
    catalog_dynamic_profile_id: str | None,
) -> DerDynamicResolution:
    """Resolve dla turbin wiatrowych."""
    if explicit_profile_id and explicit_profile_id in WIND_DYNAMIC_PROFILES:
        profil_turbiny = WIND_DYNAMIC_PROFILES[explicit_profile_id]
        return DerDynamicResolution(
            profile=profil_turbiny,
            source="explicit_profile_id",
            rationale_pl=f"Wskazany profil turbiny „{profil_turbiny.profile_name_pl}”.",
        )
    if catalog_dynamic_profile_id and catalog_dynamic_profile_id in WIND_DYNAMIC_PROFILES:
        profil_turbiny = WIND_DYNAMIC_PROFILES[catalog_dynamic_profile_id]
        return DerDynamicResolution(
            profile=profil_turbiny,
            source="catalog_entry_dynamic_profile_id",
            rationale_pl=(
                f"Wpis katalogu turbiny wskazuje profil „{profil_turbiny.profile_name_pl}”."
            ),
        )
    return DerDynamicResolution(
        profile=None,
        source="brak",
        rationale_pl=(
            f"Brak jawnie wskazanego profilu dynamicznego turbiny (converter_type="
            f"'{converter_type}') — ani parametr wywołania, ani wpis katalogu nie "
            "niesie profile_id."
        ),
    )


def resolve_der_dynamic_profile(
    *,
    der_kind: DerKind,
    explicit_profile_id: str | None = None,
    catalog_dynamic_profile_id: str | None = None,
    control_mode: InverterControlMode = "grid_following",
    converter_type: str | None = None,
) -> DerDynamicResolution:
    """Główny entry-point — zwraca profil dynamiczny per DER, TYLKO gdy wybrany jawnie.

    Args:
        der_kind: 'PV' | 'BESS' | 'FW'
        explicit_profile_id: wprost wskazany profile_id (np. operator NC RfG).
        catalog_dynamic_profile_id: profile_id z wpisu katalogu (PVInverterType, …).
        control_mode: 'grid_following' | 'grid_forming' (PV/BESS).
        converter_type: 'SCIG' | 'WRIG' | 'DFIG' | 'full_converter' (FW).

    Returns:
        `DerDynamicResolution` z `profile`, `source` i `rationale_pl`.
        `profile=None` (`source="brak"`) gdy brak jawnego wyboru — WOŁAJĄCY
        zgłasza to jako brak danej, NIGDY nie podstawia domyślnej wartości.
    """
    if der_kind == "FW":
        return _resolve_wind(
            converter_type=converter_type,
            explicit_profile_id=explicit_profile_id,
            catalog_dynamic_profile_id=catalog_dynamic_profile_id,
        )
    return _resolve_inverter(
        der_kind=der_kind,
        control_mode=control_mode,
        explicit_profile_id=explicit_profile_id,
        catalog_dynamic_profile_id=catalog_dynamic_profile_id,
    )


def list_all_profile_ids() -> list[str]:
    """Lista wszystkich znanych profile_id (deterministyczna kolejność)."""
    return sorted(list(INVERTER_DYNAMIC_PROFILES.keys()) + list(WIND_DYNAMIC_PROFILES.keys()))


def get_profile(profile_id: str) -> DerDynamicProfile:
    """Pobranie profilu po id (KeyError gdy nie istnieje — używaj resolvera)."""
    if profile_id in INVERTER_DYNAMIC_PROFILES:
        return INVERTER_DYNAMIC_PROFILES[profile_id]
    if profile_id in WIND_DYNAMIC_PROFILES:
        return WIND_DYNAMIC_PROFILES[profile_id]
    available = ", ".join(list_all_profile_ids())
    raise KeyError(f"Profil dynamiczny '{profile_id}' nieznany. Dostępne: {available}")


# Re-export używany przez konsumentów
__all__ = [
    "DerDynamicResolution",
    "ResolutionSource",
    "get_profile",
    "list_all_profile_ids",
    "resolve_der_dynamic_profile",
]
