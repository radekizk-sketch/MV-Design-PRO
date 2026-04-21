"""
Protection Base Values Resolver — P16c v1

Deterministyczny resolver bazowych wartości Un/In dla funkcji zabezpieczeniowych,
zgodny z regułami PF/ETAP.

CANONICAL ALIGNMENT:
- ANSI/IEEE C37.2: Device function numbers
- IEC 60255: Protection relay characteristics
- PowerFactory/ETAP parity: Base value resolution

ZASADA KLUCZOWA:
- Un = napięcie znamionowe miejsca pomiaru (bus/VT/BoundaryNode)
- In = prąd znamionowy obiektu chronionego (line/transformer/breaker/BoundaryNode)
- computed = wartość wyliczona z setpoint + BaseValues (opcjonalna)

NIE jest to solver protection, NIE selektywność, NIE krzywe.
UI pozostaje pasywne (tylko wyświetla, nic nie liczy).
"""

from application.analyses.protection.base_values.compute import (
    compute_from_setpoint,
    enrich_with_computed,
)
from application.analyses.protection.base_values.models import (
    BaseValues,
    BaseValueSourceIn,
    BaseValueSourceUn,
    ProtectedElementContext,
    ProtectedElementType,
    ProtectionComputedUnit,
    ProtectionComputedValue,
    ProtectionSetpoint,
    ProtectionSetpointBasis,
    ProtectionSetpointOperator,
    ProtectionSetpointUnit,
    TransformerSide,
)
from application.analyses.protection.base_values.resolver import (
    resolve_base_values,
)

__all__ = [
    # Models
    "BaseValues",
    "BaseValueSourceUn",
    "BaseValueSourceIn",
    "ProtectionSetpointBasis",
    "ProtectionSetpointOperator",
    "ProtectionSetpointUnit",
    "ProtectionSetpoint",
    "ProtectionComputedUnit",
    "ProtectionComputedValue",
    "ProtectedElementContext",
    "ProtectedElementType",
    "TransformerSide",
    # Resolver
    "resolve_base_values",
    # Compute
    "compute_from_setpoint",
    "enrich_with_computed",
]
