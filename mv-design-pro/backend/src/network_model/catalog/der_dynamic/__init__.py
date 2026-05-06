"""Katalog dynamicznych modeli DER (PV/BESS/FW) — produkcyjny end-to-end.

Każdy DER wymaga modelu dynamicznego (`InverterDynamicProfile` lub
`WindTurbineDynamicProfile`). Resolver `resolve_der_dynamic_profile` zawsze
zwraca model — łańcuch: katalog → profil operatora → default per kind.

Integracja:
- `PVInverterType.dynamic_model_id` / `BESSInverterType.dynamic_model_id` /
  `WindTurbineCatalogEntry.dynamic_model_id` — opcjonalna referencja
  do profilu w tym katalogu.
- `network_model.solvers.stability_rms` — konsumuje
  `profile.to_stability_parameters()`.
- `network_model.solvers.frt_hvrt` — konsumuje
  `profile.to_frt_parameters()`.
"""

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
    WindIecType,
    WindTurbineDynamicProfile,
)
from src.network_model.catalog.der_dynamic.resolver import (
    DerDynamicResolution,
    get_profile,
    list_all_profile_ids,
    resolve_der_dynamic_profile,
)

__all__ = [
    "DerDynamicProfile",
    "DerDynamicResolution",
    "DerKind",
    "InverterControlMode",
    "InverterDynamicProfile",
    "WindIecType",
    "WindTurbineDynamicProfile",
    "DEFAULT_PV_GFL",
    "DEFAULT_PV_GFM",
    "DEFAULT_BESS_GFL",
    "DEFAULT_BESS_GFM",
    "DEFAULT_WIND_TYPE_1",
    "DEFAULT_WIND_TYPE_2",
    "DEFAULT_WIND_TYPE_3",
    "DEFAULT_WIND_TYPE_4",
    "INVERTER_DYNAMIC_PROFILES",
    "WIND_DYNAMIC_PROFILES",
    "get_profile",
    "list_all_profile_ids",
    "resolve_der_dynamic_profile",
]
