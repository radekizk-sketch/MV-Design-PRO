"""
ProjectGeometryOverridesV1 — domain model for SLD geometry overrides.

CANONICAL CONTRACT (BINDING — RUN #3H):
- Overrides are a SEPARATE layer — NOT part of LayoutEngine.
- LayoutResultV1 remains unchanged (hash-stable).
- Hashing: canonical SHA-256 (permutation invariant, no timestamps).
- Validation: elementId must exist in LayoutResult; no collisions.

PIPELINE:
  LayoutResultV1 + ProjectGeometryOverridesV1 → applyOverrides → EffectiveLayoutV1
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

# =============================================================================
# VERSION
# =============================================================================

OVERRIDES_VERSION = "1.0"


# =============================================================================
# ENUMS
# =============================================================================


class OverrideScopeV1(str, Enum):
    """Scope (zakres) nadpisania geometrii."""

    NODE = "NODE"
    BLOCK = "BLOCK"
    FIELD = "FIELD"
    LABEL = "LABEL"
    EDGE_CHANNEL = "EDGE_CHANNEL"


class OverrideOperationV1(str, Enum):
    """Typ operacji geometrycznej."""

    MOVE_DELTA = "MOVE_DELTA"
    REORDER_FIELD = "REORDER_FIELD"
    MOVE_LABEL = "MOVE_LABEL"


# =============================================================================
# OVERRIDE ITEM
# =============================================================================


@dataclass(frozen=True)
class GeometryOverrideItemV1:
    """Pojedynczy rekord nadpisania geometrii."""

    element_id: str
    scope: OverrideScopeV1
    operation: OverrideOperationV1
    payload: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        """Serializacja do dict (kanoniczny format)."""
        return {
            "element_id": self.element_id,
            "operation": self.operation.value,
            "payload": self.payload,
            "scope": self.scope.value,
        }


# =============================================================================
# TOP-LEVEL CONTRACT
# =============================================================================


@dataclass(frozen=True)
class ProjectGeometryOverridesV1:
    """Zamrozony kontrakt nadpisan geometrii SLD."""

    overrides_version: str = OVERRIDES_VERSION
    study_case_id: str = ""
    snapshot_hash: str = ""
    items: tuple[GeometryOverrideItemV1, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        """Serializacja do dict."""
        return {
            "overrides_version": self.overrides_version,
            "study_case_id": self.study_case_id,
            "snapshot_hash": self.snapshot_hash,
            "items": [item.to_dict() for item in self.items],
        }

    @staticmethod
    def from_dict(data: dict[str, Any]) -> ProjectGeometryOverridesV1:
        """Deserializacja z dict."""
        items = tuple(
            GeometryOverrideItemV1(
                element_id=item["element_id"],
                scope=OverrideScopeV1(item["scope"]),
                operation=OverrideOperationV1(item["operation"]),
                payload=item.get("payload", {}),
            )
            for item in data.get("items", [])
        )
        return ProjectGeometryOverridesV1(
            overrides_version=data.get("overrides_version", OVERRIDES_VERSION),
            study_case_id=data.get("study_case_id", ""),
            snapshot_hash=data.get("snapshot_hash", ""),
            items=items,
        )


# =============================================================================
# CANONICAL SERIALIZATION + HASHING
# =============================================================================


def canonicalize_overrides(
    overrides: ProjectGeometryOverridesV1,
) -> ProjectGeometryOverridesV1:
    """Kanonizuje overrides — sortuje items deterministycznie.

    Sortowanie: element_id → scope → operation (leksykograficznie).
    """
    sorted_items = tuple(
        sorted(
            overrides.items,
            key=lambda item: (
                item.element_id,
                item.scope.value,
                item.operation.value,
            ),
        )
    )
    return ProjectGeometryOverridesV1(
        overrides_version=overrides.overrides_version,
        study_case_id=overrides.study_case_id,
        snapshot_hash=overrides.snapshot_hash,
        items=sorted_items,
    )


def compute_overrides_hash(overrides: ProjectGeometryOverridesV1) -> str:
    """Oblicza deterministyczny SHA-256 hash nadpisan.

    Hash liczy sie WYLACZNIE z items (kanoniczny JSON):
    - Klucze JSON w kolejnosci alfabetycznej (sort_keys=True).
    - BEZ timestampow, identyfikatorow sesji.
    - Permutation invariant (sort po element_id/scope/operation).
    """
    canonical = canonicalize_overrides(overrides)
    items_data = [item.to_dict() for item in canonical.items]
    json_str = json.dumps(items_data, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(json_str.encode("utf-8")).hexdigest()


# =============================================================================
# VALIDATION
# =============================================================================


@dataclass(frozen=True)
class OverrideValidationErrorV1:
    """Blad walidacji nadpisania."""

    element_id: str
    code: str
    message: str


@dataclass(frozen=True)
class OverrideValidationResultV1:
    """Wynik walidacji nadpisan."""

    valid: bool
    errors: tuple[OverrideValidationErrorV1, ...] = field(default_factory=tuple)


SCOPE_ALLOWED_OPERATIONS: dict[OverrideScopeV1, set[OverrideOperationV1]] = {
    OverrideScopeV1.NODE: {OverrideOperationV1.MOVE_DELTA},
    OverrideScopeV1.BLOCK: {OverrideOperationV1.MOVE_DELTA},
    OverrideScopeV1.FIELD: {OverrideOperationV1.REORDER_FIELD},
    OverrideScopeV1.LABEL: {OverrideOperationV1.MOVE_LABEL},
    OverrideScopeV1.EDGE_CHANNEL: set(),  # reserved
}


def validate_overrides(
    overrides: ProjectGeometryOverridesV1,
    known_node_ids: set[str] | frozenset[str],
    known_block_ids: set[str] | frozenset[str],
) -> OverrideValidationResultV1:
    """Waliduje overrides przeciwko znanym elementom layoutu.

    Reguly:
    1. element_id musi istniec w layoucie (node lub block).
    2. Operacja musi byc dozwolona dla danego scope.
    3. Payload musi miec wymagane pola.
    """
    errors: list[OverrideValidationErrorV1] = []

    for item in overrides.items:
        # Rule 1: element_id musi istniec
        if item.scope == OverrideScopeV1.NODE:
            if item.element_id not in known_node_ids:
                errors.append(
                    OverrideValidationErrorV1(
                        element_id=item.element_id,
                        code="geometry.override_invalid_element",
                        message=f"Element '{item.element_id}' nie istnieje (NODE scope)",
                    )
                )
                continue
        elif item.scope == OverrideScopeV1.BLOCK:
            if item.element_id not in known_block_ids:
                errors.append(
                    OverrideValidationErrorV1(
                        element_id=item.element_id,
                        code="geometry.override_invalid_element",
                        message=f"Blok '{item.element_id}' nie istnieje (BLOCK scope)",
                    )
                )
                continue
        elif item.scope == OverrideScopeV1.LABEL:
            if item.element_id not in known_node_ids and item.element_id not in known_block_ids:
                errors.append(
                    OverrideValidationErrorV1(
                        element_id=item.element_id,
                        code="geometry.override_invalid_element",
                        message=f"Element '{item.element_id}' nie istnieje (LABEL scope)",
                    )
                )
                continue

        # Rule 2: scope-operation compatibility
        allowed = SCOPE_ALLOWED_OPERATIONS.get(item.scope, set())
        if item.operation not in allowed:
            errors.append(
                OverrideValidationErrorV1(
                    element_id=item.element_id,
                    code="geometry.override_forbidden_for_station_type",
                    message=(
                        f"Operacja {item.operation.value} niedozwolona "
                        f"dla scope {item.scope.value}"
                    ),
                )
            )
            continue

        # Rule 3: payload validation
        if item.operation == OverrideOperationV1.MOVE_DELTA:
            if "dx" not in item.payload or "dy" not in item.payload:
                errors.append(
                    OverrideValidationErrorV1(
                        element_id=item.element_id,
                        code="geometry.override_invalid_element",
                        message="MOVE_DELTA: payload musi miec dx/dy",
                    )
                )
        elif item.operation == OverrideOperationV1.MOVE_LABEL:
            if "anchorX" not in item.payload or "anchorY" not in item.payload:
                errors.append(
                    OverrideValidationErrorV1(
                        element_id=item.element_id,
                        code="geometry.override_invalid_element",
                        message="MOVE_LABEL: payload musi miec anchorX/anchorY",
                    )
                )
        elif item.operation == OverrideOperationV1.REORDER_FIELD:
            if "fieldOrder" not in item.payload:
                errors.append(
                    OverrideValidationErrorV1(
                        element_id=item.element_id,
                        code="geometry.override_forbidden_for_station_type",
                        message="REORDER_FIELD: payload musi miec fieldOrder",
                    )
                )

    return OverrideValidationResultV1(
        valid=len(errors) == 0,
        errors=tuple(errors),
    )


# =============================================================================
# FIXACTION CODES (CAD)
# =============================================================================


class GeometryFixCode(str, Enum):
    """Stabilne kody FixActions dla trybu projektowego (CAD)."""

    OVERRIDE_INVALID_ELEMENT = "geometry.override_invalid_element"
    OVERRIDE_CAUSES_COLLISION = "geometry.override_causes_collision"
    OVERRIDE_BREAKS_PORT_CONSTRAINTS = "geometry.override_breaks_port_constraints"
    OVERRIDE_FORBIDDEN_FOR_STATION_TYPE = "geometry.override_forbidden_for_station_type"
    OVERRIDE_REQUIRES_UNLOCK = "geometry.override_requires_unlock"
