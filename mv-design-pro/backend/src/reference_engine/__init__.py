"""Reference Engine V1 — globalny silnik referencji SLD (V12K-060).

REFERENCE_ENGINE_SPEC_V1.md: pakiety referencyjne (normy IEC, rodziny
rozdzielnic producentów, standardy OSD) jako Source of Truth walidacji
struktury pól/stacji. Konsumenci: walidator ENM (na żywo), API
`/api/reference/*`, Inspektor ENM, testy parytetu kreatora i słownika §12.4,
agenci AI (pytają registry — nie zgadują).
"""

from .compliance import evaluate_enm
from .models import (
    ApparatusKind,
    ComplianceCheck,
    PackComplianceReport,
    ReferenceComplianceReport,
    ReferenceFieldProfile,
    ReferencePack,
    ReferenceRule,
    ReferenceSymbolMapEntry,
)
from .registry import (
    FIELD_PROFILE_PACK_ID,
    FIELD_PROFILE_REGISTRY,
    REFERENCE_PACK_REGISTRY,
    family_for_pack,
    field_profile_for_bay,
    get_reference_pack,
    list_reference_packs,
    profile_id_for_bay,
)
from .validation import LiveReferenceFinding, reference_validation_issues

__all__ = [
    "ApparatusKind",
    "ComplianceCheck",
    "FIELD_PROFILE_PACK_ID",
    "FIELD_PROFILE_REGISTRY",
    "LiveReferenceFinding",
    "PackComplianceReport",
    "REFERENCE_PACK_REGISTRY",
    "ReferenceComplianceReport",
    "ReferenceFieldProfile",
    "ReferencePack",
    "ReferenceRule",
    "ReferenceSymbolMapEntry",
    "evaluate_enm",
    "family_for_pack",
    "field_profile_for_bay",
    "get_reference_pack",
    "list_reference_packs",
    "profile_id_for_bay",
    "reference_validation_issues",
]
