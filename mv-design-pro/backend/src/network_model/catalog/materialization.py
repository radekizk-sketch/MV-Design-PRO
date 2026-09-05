"""
Catalog Materialization Engine — copies solver_fields from catalog to snapshot.

CANONICAL: This module performs deterministic materialization of catalog parameters
into snapshot elements. Every technical element in the snapshot MUST have its
solver_fields populated from the catalog (via CatalogBinding + MaterializationContract).

INVARIANTS:
- Deterministic: same catalog item + same binding → identical materialized fields
- No physics calculations (pure data copy)
- Audit trail: every materialization logged with catalog_item_id, version, fields
- Failure: returns structured error (never silent fail)
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any

from .repository import CatalogRepository
from .types import (
    MATERIALIZATION_CONTRACTS,
    CatalogBinding,
    CatalogNamespace,
)

# ---------------------------------------------------------------------------
# Materialization Result
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class MaterializationAuditEntry:
    """Single audit entry for a materialized field."""

    field_name: str
    value: Any
    catalog_item_id: str
    catalog_item_version: str
    namespace: str


@dataclass(frozen=True)
class MaterializationResult:
    """Result of materializing a catalog binding into snapshot fields."""

    success: bool
    solver_fields: dict[str, Any]
    ui_fields: list[dict[str, Any]]
    audit: list[MaterializationAuditEntry]
    error_code: str | None = None
    error_message_pl: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "solver_fields": self.solver_fields,
            "ui_fields": self.ui_fields,
            "audit": [
                {
                    "field_name": a.field_name,
                    "value": a.value,
                    "catalog_item_id": a.catalog_item_id,
                    "catalog_item_version": a.catalog_item_version,
                    "namespace": a.namespace,
                }
                for a in self.audit
            ],
            "error_code": self.error_code,
            "error_message_pl": self.error_message_pl,
        }


@dataclass(frozen=True)
class MaterializationError:
    """Structured materialization error."""

    code: str
    message_pl: str
    element_id: str | None = None
    namespace: str | None = None


# ---------------------------------------------------------------------------
# Namespace → catalog accessor mapping
# ---------------------------------------------------------------------------

_NAMESPACE_ACCESSOR: dict[str, str] = {
    CatalogNamespace.KABEL_SN.value: "get_cable_type",
    CatalogNamespace.LINIA_SN.value: "get_line_type",
    CatalogNamespace.TRAFO_SN_NN.value: "get_transformer_type",
    CatalogNamespace.APARAT_SN.value: "get_mv_apparatus_type",
    CatalogNamespace.APARAT_NN.value: "get_lv_apparatus_type",
    CatalogNamespace.KABEL_NN.value: "get_lv_cable_type",
    CatalogNamespace.APARAT_NN_MCB.value: "get_lv_breaker_mcb_type",
    CatalogNamespace.WKLADKA_NN.value: "get_lv_fuse_link_type",
    CatalogNamespace.CT.value: "get_ct_type",
    CatalogNamespace.VT.value: "get_vt_type",
    CatalogNamespace.OGRANICZNIK_SN.value: "get_surge_arrester_type",
    CatalogNamespace.OBCIAZENIE.value: "get_load_type",
    CatalogNamespace.KOMPENSATOR_SN.value: "get_shunt_capacitor_type",
    CatalogNamespace.ZRODLO_SN.value: "get_source_system_type",
    CatalogNamespace.ZRODLO_NN_PV.value: "get_pv_inverter_type",
    CatalogNamespace.ZRODLO_NN_BESS.value: "get_bess_inverter_type",
    CatalogNamespace.BATERIA_BESS.value: "get_bess_battery_type",
    CatalogNamespace.ZABEZPIECZENIE.value: "get_protection_device_type",
    CatalogNamespace.NASTAWY_ZABEZPIECZEN.value: "get_protection_setting_template",
    CatalogNamespace.PTPIREE_CERTYFIKAT_GENERATORA.value: "get_ptpiree_generator_certificate",
    CatalogNamespace.CONVERTER.value: "get_converter_type",
    CatalogNamespace.INVERTER.value: "get_inverter_type",
}

# Fallbacks for switch equipment
_SWITCH_NAMESPACE_ACCESSOR: dict[str, str] = {
    CatalogNamespace.APARAT_SN.value: "get_switch_equipment_type",
}


# ---------------------------------------------------------------------------
# Core materialization function
# ---------------------------------------------------------------------------


def materialize_catalog_binding(
    binding: CatalogBinding,
    catalog: CatalogRepository,
) -> MaterializationResult:
    """Materialize catalog parameters from a CatalogBinding.

    Looks up the catalog item by namespace + id, then copies solver_fields
    and ui_fields per the MaterializationContract.

    Args:
        binding: The CatalogBinding with namespace, item_id, version
        catalog: The catalog repository

    Returns:
        MaterializationResult with solver_fields, ui_fields, audit trail
    """
    if not binding.materialize:
        return MaterializationResult(
            success=False,
            solver_fields={},
            ui_fields=[],
            audit=[],
            error_code="catalog.materialization_required",
            error_message_pl="Materializacja jest wymagana dla elementów technicznych",
        )

    # Get the contract for this namespace
    contract = MATERIALIZATION_CONTRACTS.get(binding.catalog_namespace)
    if contract is None:
        return MaterializationResult(
            success=False,
            solver_fields={},
            ui_fields=[],
            audit=[],
            error_code="catalog.unknown_namespace",
            error_message_pl=(f"Nieznana kategoria katalogu: {binding.catalog_namespace}"),
        )

    # Look up the catalog item
    catalog_item = _lookup_catalog_item(catalog, binding.catalog_namespace, binding.catalog_item_id)
    if catalog_item is None:
        return MaterializationResult(
            success=False,
            solver_fields={},
            ui_fields=[],
            audit=[],
            error_code="catalog.item_not_found",
            error_message_pl=(
                f"Nie znaleziono rekordu katalogu: {binding.catalog_item_id} "
                f"w kategorii {binding.catalog_namespace}"
            ),
        )

    # Convert catalog item to dict for field extraction
    item_dict = catalog_item.to_dict()

    # Extract solver_fields
    solver_fields: dict[str, Any] = {}
    audit_entries: list[MaterializationAuditEntry] = []
    for field_name in contract.solver_fields:
        value = item_dict.get(field_name)
        solver_fields[field_name] = value
        audit_entries.append(
            MaterializationAuditEntry(
                field_name=field_name,
                value=value,
                catalog_item_id=binding.catalog_item_id,
                catalog_item_version=binding.catalog_item_version,
                namespace=binding.catalog_namespace,
            )
        )

    # Extract ui_fields
    ui_fields: list[dict[str, Any]] = []
    for field_name, label_pl, unit in contract.ui_fields:
        value = item_dict.get(field_name)
        ui_fields.append(
            {
                "field": field_name,
                "label_pl": label_pl,
                "unit": unit,
                "value": value,
            }
        )

    return MaterializationResult(
        success=True,
        solver_fields=solver_fields,
        ui_fields=ui_fields,
        audit=audit_entries,
    )


def _lookup_catalog_item(
    catalog: CatalogRepository,
    namespace: str,
    item_id: str,
) -> Any | None:
    """Look up a catalog item by namespace and ID."""
    accessor_name = _NAMESPACE_ACCESSOR.get(namespace)
    if accessor_name is not None:
        accessor = getattr(catalog, accessor_name, None)
        if accessor is not None:
            result = accessor(item_id)
            if result is not None:
                return result

    # Fallback for switch equipment types
    fallback = _SWITCH_NAMESPACE_ACCESSOR.get(namespace)
    if fallback is not None:
        accessor = getattr(catalog, fallback, None)
        if accessor is not None:
            result = accessor(item_id)
            if result is not None:
                return result

    return None


# ---------------------------------------------------------------------------
# Batch materialization
# ---------------------------------------------------------------------------


def materialize_snapshot_elements(
    elements: list[dict[str, Any]],
    catalog: CatalogRepository,
) -> tuple[list[dict[str, Any]], list[MaterializationError]]:
    """Materialize catalog bindings for all elements in a snapshot.

    For each element that has a catalog_binding, performs materialization
    and merges solver_fields into the element dict.

    Returns:
        Tuple of (updated_elements, errors)
    """
    updated: list[dict[str, Any]] = []
    errors: list[MaterializationError] = []

    for element in elements:
        binding_data = element.get("catalog_binding")
        if binding_data is None:
            updated.append(element)
            continue

        binding = CatalogBinding.from_dict(binding_data)
        result = materialize_catalog_binding(binding, catalog)

        if not result.success:
            errors.append(
                MaterializationError(
                    code=result.error_code or "catalog.materialization_failed",
                    message_pl=result.error_message_pl or "Błąd materializacji",
                    element_id=element.get("id"),
                    namespace=binding.catalog_namespace,
                )
            )
            updated.append(element)
            continue

        # Merge solver_fields into element
        merged = dict(element)
        merged["materialized_params"] = result.solver_fields
        merged["materialization_audit"] = result.to_dict().get("audit", [])
        updated.append(merged)

    return updated, errors


# ---------------------------------------------------------------------------
# Validation: check binding completeness
# ---------------------------------------------------------------------------


def validate_catalog_binding(
    binding_data: dict[str, Any] | None,
    *,
    element_id: str | None = None,
    require_version: bool = True,
) -> list[MaterializationError]:
    """Validate a CatalogBinding dict for completeness.

    Checks:
    - binding exists
    - materialize is True
    - catalog_item_version is present (if require_version=True)
    - namespace is known
    """
    errors: list[MaterializationError] = []

    if binding_data is None:
        errors.append(
            MaterializationError(
                code="catalog.binding_required",
                message_pl="Element techniczny wymaga powiązania z katalogiem",
                element_id=element_id,
            )
        )
        return errors

    binding = CatalogBinding.from_dict(binding_data)

    if not binding.catalog_namespace:
        errors.append(
            MaterializationError(
                code="catalog.namespace_missing",
                message_pl="Brak kategorii katalogu w powiązaniu",
                element_id=element_id,
            )
        )

    if not binding.catalog_item_id:
        errors.append(
            MaterializationError(
                code="catalog.item_id_missing",
                message_pl="Brak identyfikatora rekordu katalogu",
                element_id=element_id,
            )
        )

    if require_version and not binding.catalog_item_version:
        errors.append(
            MaterializationError(
                code="catalog.binding_version_missing",
                message_pl="Brak wersji katalogu w powiązaniu elementu",
                element_id=element_id,
            )
        )

    if not binding.materialize:
        errors.append(
            MaterializationError(
                code="catalog.materialization_required",
                message_pl="Materializacja jest wymagana (materialize musi być true)",
                element_id=element_id,
            )
        )

    # Check namespace is known
    known = {ns.value for ns in CatalogNamespace}
    if binding.catalog_namespace and binding.catalog_namespace not in known:
        errors.append(
            MaterializationError(
                code="catalog.unknown_namespace",
                message_pl=f"Nieznana kategoria katalogu: {binding.catalog_namespace}",
                element_id=element_id,
                namespace=binding.catalog_namespace,
            )
        )

    return errors


# ---------------------------------------------------------------------------
# Deterministic hash for materialized params
# ---------------------------------------------------------------------------


def materialization_hash(solver_fields: dict[str, Any]) -> str:
    """Compute deterministic hash of materialized solver fields."""
    canonical = json.dumps(solver_fields, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
