"""Warstwa katalogu producentów rozdzielnic SN (goal §11A).

Eksport publiczny:
- Manufacturer / ManufacturerStatus
- SwitchgearFamily / SwitchgearFamilyStatus
- CompleteMvBayTemplate / BayKind / SourceStatus
- ManufacturerRegistry (5 startowych: ZPUE_WLOSZCZOWA, ELEKTROMETAL, ABB,
  SIEMENS, SCHNEIDER_ELECTRIC — wszyscy `requires_catalog`)
"""

from .canonical_fallback import (
    CANONICAL_FALLBACK_REGISTRY,
    get_canonical_fallback_for_bay_kind,
    list_canonical_fallback_for_manufacturer,
    list_canonical_fallback_templates,
    list_switchgear_solution_templates_for_manufacturer,
)
from .complete_mv_bay_template import (
    BayKind,
    CompleteMvBayTemplate,
    SourceStatus,
)
from .device_instance import (
    ApparatusKind,
    BayDeviceInstanceTemplate,
    ElectricalSide,
)
from .families import (
    ABB__SAFERING,
    ABB__UNIGEAR_ZS1,
    ELEKTROMETAL__E2ALPHA,
    SCHNEIDER__SM6_24,
    SIEMENS__8DJH,
    SIEMENS__NXAIR,
    SWITCHGEAR_FAMILY_REGISTRY,
    ZPUE_WLOSZCZOWA__ROTOBLOK,
    get_switchgear_family,
    list_families_for_manufacturer,
    list_switchgear_families,
)
from .manufacturer import Manufacturer, ManufacturerStatus
from .port_definition import (
    DirectionHint,
    PortDefinitionTemplate,
    PortKind,
)
from .registry import (
    ABB,
    ELEKTROMETAL,
    MANUFACTURER_REGISTRY,
    SCHNEIDER_ELECTRIC,
    SIEMENS,
    ZPUE_WLOSZCZOWA,
    get_manufacturer,
    list_manufacturers,
    manufacturers_requiring_catalog,
    verified_manufacturers,
)
from .switchgear_family import (
    BusbarSystem,
    ConstructionType,
    InsulationType,
    SwitchgearFamily,
    SwitchgearFamilyStatus,
)

__all__ = [
    "ABB",
    "ABB__SAFERING",
    "ABB__UNIGEAR_ZS1",
    "ApparatusKind",
    "BayDeviceInstanceTemplate",
    "BayKind",
    "BusbarSystem",
    "CANONICAL_FALLBACK_REGISTRY",
    "CompleteMvBayTemplate",
    "ConstructionType",
    "DirectionHint",
    "ELEKTROMETAL",
    "ELEKTROMETAL__E2ALPHA",
    "ElectricalSide",
    "InsulationType",
    "MANUFACTURER_REGISTRY",
    "Manufacturer",
    "ManufacturerStatus",
    "PortDefinitionTemplate",
    "PortKind",
    "SCHNEIDER_ELECTRIC",
    "SCHNEIDER__SM6_24",
    "SIEMENS",
    "SIEMENS__8DJH",
    "SIEMENS__NXAIR",
    "SWITCHGEAR_FAMILY_REGISTRY",
    "SourceStatus",
    "SwitchgearFamily",
    "SwitchgearFamilyStatus",
    "ZPUE_WLOSZCZOWA",
    "ZPUE_WLOSZCZOWA__ROTOBLOK",
    "get_canonical_fallback_for_bay_kind",
    "get_manufacturer",
    "get_switchgear_family",
    "list_canonical_fallback_for_manufacturer",
    "list_canonical_fallback_templates",
    "list_families_for_manufacturer",
    "list_manufacturers",
    "list_switchgear_solution_templates_for_manufacturer",
    "list_switchgear_families",
    "manufacturers_requiring_catalog",
    "verified_manufacturers",
]
