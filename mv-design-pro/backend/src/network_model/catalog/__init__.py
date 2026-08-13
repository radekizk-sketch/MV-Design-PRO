"""
Type Catalog module for network elements.

PowerFactory Alignment:
- Types are IMMUTABLE once created
- Types are SHARED across projects
- Instances store only: type reference + local parameters (e.g., length)

The Catalog is the single source of physical parameters for network elements.
"""

from .repository import CatalogRepository, get_default_mv_catalog
from .resolver import (
    ParameterSource,
    ResolvedLineParams,
    ResolvedThermalParams,
    ResolvedTransformerParams,
    TypeNotFoundError,
    resolve_line_params,
    resolve_thermal_params,
    resolve_transformer_params,
)
from .types import (
    MATERIALIZATION_CONTRACTS,
    BESSInverterType,
    CableType,
    CatalogBinding,
    CatalogNamespace,
    ConverterKind,
    ConverterType,
    CTType,
    InverterType,
    LineType,
    LoadType,
    LVApparatusType,
    LVBreakerMcbType,
    LVCableType,
    LVFuseLinkType,
    MaterializationContract,
    MVApparatusType,
    PtpireeGeneratorCertificate,
    PVInverterType,
    ShuntCapacitorType,
    SurgeArresterType,
    SwitchEquipmentType,
    TransformerType,
    VTType,
)

__all__ = [
    "LineType",
    "CableType",
    "TransformerType",
    "SwitchEquipmentType",
    "ConverterKind",
    "ConverterType",
    "InverterType",
    # Phase 1 — extended namespaces
    "LVCableType",
    "LoadType",
    "MVApparatusType",
    "LVApparatusType",
    "LVBreakerMcbType",
    "LVFuseLinkType",
    "CTType",
    "VTType",
    "PVInverterType",
    "BESSInverterType",
    "SurgeArresterType",
    "ShuntCapacitorType",
    "PtpireeGeneratorCertificate",
    "CatalogNamespace",
    "CatalogBinding",
    "MaterializationContract",
    "MATERIALIZATION_CONTRACTS",
    # Repository
    "CatalogRepository",
    "get_default_mv_catalog",
    # Resolver
    "ParameterSource",
    "ResolvedLineParams",
    "ResolvedThermalParams",
    "ResolvedTransformerParams",
    "TypeNotFoundError",
    "resolve_line_params",
    "resolve_thermal_params",
    "resolve_transformer_params",
]
