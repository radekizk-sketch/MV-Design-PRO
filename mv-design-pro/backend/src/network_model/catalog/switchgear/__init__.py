"""Warstwa katalogu producentów rozdzielnic SN (goal §11A).

Eksport publiczny:
- Manufacturer / ManufacturerStatus
- SwitchgearFamily / SwitchgearFamilyStatus
- CompleteMvBayTemplate / BayKind / SourceStatus
- ManufacturerRegistry (4 startowych: ZPUE_WLOSZCZOWA, ELEKTROMETAL, ABB,
  SIEMENS — wszyscy `requires_catalog`)
"""

from .canonical_fallback import (
    CANONICAL_FALLBACK_REGISTRY,
    get_canonical_fallback_for_bay_kind,
    list_canonical_fallback_for_manufacturer,
    list_canonical_fallback_templates,
)
from .complete_mv_bay_template import (
    BayKind,
    CompleteMvBayTemplate,
    SourceStatus,
)
from .manufacturer import Manufacturer, ManufacturerStatus
from .registry import (
    ABB,
    ELEKTROMETAL,
    MANUFACTURER_REGISTRY,
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
    "BayKind",
    "BusbarSystem",
    "CANONICAL_FALLBACK_REGISTRY",
    "CompleteMvBayTemplate",
    "ConstructionType",
    "ELEKTROMETAL",
    "InsulationType",
    "MANUFACTURER_REGISTRY",
    "Manufacturer",
    "ManufacturerStatus",
    "SIEMENS",
    "SourceStatus",
    "SwitchgearFamily",
    "SwitchgearFamilyStatus",
    "ZPUE_WLOSZCZOWA",
    "get_canonical_fallback_for_bay_kind",
    "get_manufacturer",
    "list_canonical_fallback_for_manufacturer",
    "list_canonical_fallback_templates",
    "list_manufacturers",
    "manufacturers_requiring_catalog",
    "verified_manufacturers",
]
