"""Resolver profili dynamicznych DER — łańcuch katalog → profil → default.

Umowa: `resolve_der_dynamic_profile(...)` ZAWSZE zwraca profil. Brak wyników
oznaczałby leftover — niezgodne z briefem 2 §15/§16.

Strategia rozwiązania:
1. Jeśli `dynamic_profile_id` jest podany i istnieje w rejestrze → użyj go.
2. Jeśli wpis katalogu (PV/BESS/Wind) ma jawne `dynamic_profile_id` → użyj.
3. W przeciwnym razie wybierz default per kind/converter:
   - PV: GFL (większość komercyjnych) lub GFM jeśli `control_mode` wskazuje.
   - BESS: GFL chyba że jawnie GFM.
   - Wind: per `converter_type`:
        SCIG → type_1, hydraulic/WRIG → type_2,
        DFIG → type_3, full_converter → type_4.

Każdy resolve dostaje `DerDynamicResolution` zawierające źródło rozwiązania
(WHITE BOX trace zgodnie z AGENTS.md §2).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from src.network_model.catalog.der_dynamic.defaults import (
    DEFAULT_BESS_GFL,
    DEFAULT_BESS_GFM,
    DEFAULT_PV_GFL,
    DEFAULT_PV_GFM,
    DEFAULT_WIND_TYPE_1,
    DEFAULT_WIND_TYPE_2,
    DEFAULT_WIND_TYPE_3,
    DEFAULT_WIND_TYPE_4,
    INVERTER_DYNAMIC_PROFILES,
    WIND_DYNAMIC_PROFILES,
)
from src.network_model.catalog.der_dynamic.models import (
    DerDynamicProfile,
    DerKind,
    InverterControlMode,
    InverterDynamicProfile,
    WindTurbineDynamicProfile,
)

ResolutionSource = Literal[
    "explicit_profile_id",
    "catalog_entry_dynamic_profile_id",
    "default_per_kind",
    "default_per_converter_type",
]


@dataclass(frozen=True)
class DerDynamicResolution:
    """Wynik rozwiązania profilu dynamicznego DER (WHITE BOX trace)."""

    profile: DerDynamicProfile
    source: ResolutionSource
    rationale_pl: str

    @property
    def profile_id(self) -> str:
        return self.profile.profile_id


def _resolve_inverter(
    der_kind: DerKind,
    control_mode: InverterControlMode,
    explicit_profile_id: str | None,
    catalog_dynamic_profile_id: str | None,
) -> DerDynamicResolution:
    """Resolve dla PV / BESS."""
    if explicit_profile_id and explicit_profile_id in INVERTER_DYNAMIC_PROFILES:
        return DerDynamicResolution(
            profile=INVERTER_DYNAMIC_PROFILES[explicit_profile_id],
            source="explicit_profile_id",
            rationale_pl=(
                f"Wskazany profil '{explicit_profile_id}' znaleziony w rejestrze."
            ),
        )
    if (
        catalog_dynamic_profile_id
        and catalog_dynamic_profile_id in INVERTER_DYNAMIC_PROFILES
    ):
        return DerDynamicResolution(
            profile=INVERTER_DYNAMIC_PROFILES[catalog_dynamic_profile_id],
            source="catalog_entry_dynamic_profile_id",
            rationale_pl=(
                f"Wpis katalogu wskazuje profil '{catalog_dynamic_profile_id}'."
            ),
        )

    if der_kind == "PV":
        default_profile = (
            DEFAULT_PV_GFM if control_mode == "grid_forming" else DEFAULT_PV_GFL
        )
    else:
        default_profile = (
            DEFAULT_BESS_GFM if control_mode == "grid_forming" else DEFAULT_BESS_GFL
        )

    return DerDynamicResolution(
        profile=default_profile,
        source="default_per_kind",
        rationale_pl=(
            f"Brak wskazanego profilu — przyjęto default {default_profile.profile_id} "
            f"({der_kind} {control_mode}, zgodny z IEEE 1547 / NC RfG)."
        ),
    )


def _resolve_wind(
    converter_type: str | None,
    explicit_profile_id: str | None,
    catalog_dynamic_profile_id: str | None,
) -> DerDynamicResolution:
    """Resolve dla turbin wiatrowych — mapping per converter_type."""
    if explicit_profile_id and explicit_profile_id in WIND_DYNAMIC_PROFILES:
        return DerDynamicResolution(
            profile=WIND_DYNAMIC_PROFILES[explicit_profile_id],
            source="explicit_profile_id",
            rationale_pl=(
                f"Wskazany profil turbiny '{explicit_profile_id}'."
            ),
        )
    if (
        catalog_dynamic_profile_id
        and catalog_dynamic_profile_id in WIND_DYNAMIC_PROFILES
    ):
        return DerDynamicResolution(
            profile=WIND_DYNAMIC_PROFILES[catalog_dynamic_profile_id],
            source="catalog_entry_dynamic_profile_id",
            rationale_pl=(
                f"Wpis katalogu turbiny wskazuje profil '{catalog_dynamic_profile_id}'."
            ),
        )

    converter_to_default: dict[str, WindTurbineDynamicProfile] = {
        "SCIG": DEFAULT_WIND_TYPE_1,
        "WRIG": DEFAULT_WIND_TYPE_2,
        "hydraulic": DEFAULT_WIND_TYPE_2,
        "DFIG": DEFAULT_WIND_TYPE_3,
        "full_converter": DEFAULT_WIND_TYPE_4,
    }
    default_profile = converter_to_default.get(
        converter_type or "full_converter",
        DEFAULT_WIND_TYPE_4,
    )

    return DerDynamicResolution(
        profile=default_profile,
        source="default_per_converter_type",
        rationale_pl=(
            f"Mapowanie converter_type='{converter_type}' → "
            f"{default_profile.profile_id} (IEC 61400-27)."
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
    """Główny entry-point — zwraca profil dynamiczny per DER.

    Args:
        der_kind: 'PV' | 'BESS' | 'FW'
        explicit_profile_id: wprost wskazany profile_id (np. operator NC RfG).
        catalog_dynamic_profile_id: profile_id z wpisu katalogu (PVInverterType, …).
        control_mode: 'grid_following' | 'grid_forming' (PV/BESS).
        converter_type: 'SCIG' | 'WRIG' | 'DFIG' | 'full_converter' (FW).

    Returns:
        `DerDynamicResolution` z `profile`, `source` i `rationale_pl`.
        ZAWSZE zwraca profil — żaden DER nie zostanie bez modelu.
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
    return sorted(
        list(INVERTER_DYNAMIC_PROFILES.keys()) + list(WIND_DYNAMIC_PROFILES.keys())
    )


def get_profile(profile_id: str) -> DerDynamicProfile:
    """Pobranie profilu po id (KeyError gdy nie istnieje — używaj resolvera)."""
    if profile_id in INVERTER_DYNAMIC_PROFILES:
        return INVERTER_DYNAMIC_PROFILES[profile_id]
    if profile_id in WIND_DYNAMIC_PROFILES:
        return WIND_DYNAMIC_PROFILES[profile_id]
    available = ", ".join(list_all_profile_ids())
    raise KeyError(
        f"Profil dynamiczny '{profile_id}' nieznany. Dostępne: {available}"
    )


# Re-export używany przez konsumentów
__all__ = [
    "DerDynamicResolution",
    "ResolutionSource",
    "get_profile",
    "list_all_profile_ids",
    "resolve_der_dynamic_profile",
    # type aliases re-exported for convenience
    "InverterDynamicProfile",
    "WindTurbineDynamicProfile",
]
