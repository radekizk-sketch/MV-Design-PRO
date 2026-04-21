"""
Catalog Drift Detection — industrial-grade version tracking.

Detects when catalog item versions have changed relative to what elements
in a Snapshot were materialized from. This is critical for industrial use:
if a cable type's parameters change in the catalog, every element using
that type must be flagged for review.

INVARIANTS:
- Read-only: does NOT modify Snapshot or Catalog
- Deterministic: same inputs → identical output
- Pure interpretation: analysis layer, no physics

Usage:
    drifts = detect_catalog_drift(snapshot_bindings, catalog_repo)
    for drift in drifts:
        print(f"Element {drift.element_id}: catalog {drift.namespace} "
              f"version changed {drift.bound_version} → {drift.current_version}")
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from enum import Enum
from typing import Any


class DriftSeverity(str, Enum):
    """Severity of catalog drift."""

    BREAKING = "BREAKING"  # solver_fields changed — results invalid
    INFORMATIONAL = "INFORMATIONAL"  # ui_fields changed — cosmetic only
    REMOVED = "REMOVED"  # catalog item no longer exists


@dataclass(frozen=True)
class CatalogDriftEntry:
    """Single drift entry — one element's catalog binding is out of date.

    Attributes:
        element_id: ID of the network element affected.
        element_label: Human-readable label (optional).
        namespace: Catalog namespace (e.g., KABEL_SN).
        catalog_item_id: Catalog item ID.
        bound_version: Version stored in element's CatalogBinding.
        current_version: Current version in the catalog (None if removed).
        severity: Impact level of the drift.
        changed_solver_fields: Tuple of solver field names that changed.
        changed_ui_fields: Tuple of UI field names that changed.
    """

    element_id: str
    element_label: str
    namespace: str
    catalog_item_id: str
    bound_version: str
    current_version: str | None
    severity: DriftSeverity
    changed_solver_fields: tuple[str, ...] = ()
    changed_ui_fields: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "element_id": self.element_id,
            "element_label": self.element_label,
            "namespace": self.namespace,
            "catalog_item_id": self.catalog_item_id,
            "bound_version": self.bound_version,
            "current_version": self.current_version,
            "severity": self.severity.value,
            "changed_solver_fields": list(self.changed_solver_fields),
            "changed_ui_fields": list(self.changed_ui_fields),
        }


@dataclass(frozen=True)
class DriftReport:
    """Complete drift detection report.

    Attributes:
        total_bindings_checked: Number of catalog bindings inspected.
        drifts: Tuple of drift entries found.
        has_breaking_drifts: True if any BREAKING drifts exist.
        report_hash: SHA-256 hash of the report for determinism verification.
    """

    total_bindings_checked: int
    drifts: tuple[CatalogDriftEntry, ...]
    has_breaking_drifts: bool
    report_hash: str

    @property
    def is_clean(self) -> bool:
        return len(self.drifts) == 0

    @property
    def breaking_count(self) -> int:
        return sum(1 for d in self.drifts if d.severity == DriftSeverity.BREAKING)

    @property
    def informational_count(self) -> int:
        return sum(1 for d in self.drifts if d.severity == DriftSeverity.INFORMATIONAL)

    @property
    def removed_count(self) -> int:
        return sum(1 for d in self.drifts if d.severity == DriftSeverity.REMOVED)

    def to_dict(self) -> dict[str, Any]:
        return {
            "total_bindings_checked": self.total_bindings_checked,
            "drifts": [d.to_dict() for d in self.drifts],
            "has_breaking_drifts": self.has_breaking_drifts,
            "report_hash": self.report_hash,
            "summary": {
                "breaking": self.breaking_count,
                "informational": self.informational_count,
                "removed": self.removed_count,
            },
        }


@dataclass(frozen=True)
class ElementBinding:
    """Lightweight binding record extracted from a snapshot element.

    Attributes:
        element_id: Element ID in the snapshot.
        element_label: Human-readable label.
        namespace: Catalog namespace.
        catalog_item_id: Catalog item ID.
        catalog_item_version: Version at materialization time.
        materialized_values: Dict of solver_field values at materialization time.
    """

    element_id: str
    element_label: str
    namespace: str
    catalog_item_id: str
    catalog_item_version: str
    materialized_values: dict[str, Any]


def extract_bindings_from_snapshot(snapshot_dict: dict[str, Any]) -> list[ElementBinding]:
    """Extract all catalog bindings from a snapshot dict.

    Scans all elements in the graph for 'catalog_binding' field.

    Returns:
        List of ElementBinding records, sorted by element_id for determinism.
    """
    bindings: list[ElementBinding] = []
    graph = snapshot_dict.get("graph", {})

    for collection_key in ("nodes", "branches", "inverter_sources", "switches"):
        for element in graph.get(collection_key, []):
            element_id = element.get("id")
            binding_data = element.get("catalog_binding")
            if element_id is not None and binding_data is not None:
                bindings.append(
                    ElementBinding(
                        element_id=str(element_id),
                        element_label=element.get("name", element.get("label", str(element_id))),
                        namespace=str(binding_data.get("catalog_namespace", "")),
                        catalog_item_id=str(binding_data.get("catalog_item_id", "")),
                        catalog_item_version=str(binding_data.get("catalog_item_version", "")),
                        materialized_values=element.get("materialized_params", {}),
                    )
                )

    bindings.sort(key=lambda b: b.element_id)
    return bindings


def _compute_item_version_hash(item_dict: dict[str, Any]) -> str:
    """Compute a deterministic version hash from a catalog item dict.

    Uses canonical JSON serialization (sorted keys, no indent).
    """
    canonical = json.dumps(item_dict, sort_keys=True, ensure_ascii=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]


def detect_drift(
    bindings: list[ElementBinding],
    catalog_items: dict[str, dict[str, Any]],
    solver_fields_by_namespace: dict[str, tuple[str, ...]],
    ui_fields_by_namespace: dict[str, tuple[str, ...]],
) -> DriftReport:
    """Detect catalog drift for a set of element bindings.

    Args:
        bindings: Element bindings extracted from a snapshot.
        catalog_items: Current catalog items keyed by "{namespace}:{item_id}".
        solver_fields_by_namespace: Solver field names per namespace
            (from MaterializationContract).
        ui_fields_by_namespace: UI field names per namespace.

    Returns:
        Frozen DriftReport with all detected drifts.
    """
    drifts: list[CatalogDriftEntry] = []

    for binding in bindings:
        lookup_key = f"{binding.namespace}:{binding.catalog_item_id}"
        current_item = catalog_items.get(lookup_key)

        if current_item is None:
            # Catalog item was removed
            drifts.append(
                CatalogDriftEntry(
                    element_id=binding.element_id,
                    element_label=binding.element_label,
                    namespace=binding.namespace,
                    catalog_item_id=binding.catalog_item_id,
                    bound_version=binding.catalog_item_version,
                    current_version=None,
                    severity=DriftSeverity.REMOVED,
                )
            )
            continue

        # Check version match
        current_version = str(current_item.get("version", current_item.get("id", "")))
        if current_version == binding.catalog_item_version:
            continue  # No drift

        # Version differs — determine severity
        solver_fields = solver_fields_by_namespace.get(binding.namespace, ())
        ui_only_fields = ui_fields_by_namespace.get(binding.namespace, ())

        changed_solver: list[str] = []
        changed_ui: list[str] = []

        materialized = binding.materialized_values
        for field_name in solver_fields:
            old_val = materialized.get(field_name)
            new_val = current_item.get(field_name)
            if old_val != new_val:
                changed_solver.append(field_name)

        for field_name in ui_only_fields:
            if field_name not in solver_fields:
                old_val = materialized.get(field_name)
                new_val = current_item.get(field_name)
                if old_val != new_val:
                    changed_ui.append(field_name)

        severity = DriftSeverity.BREAKING if changed_solver else DriftSeverity.INFORMATIONAL

        drifts.append(
            CatalogDriftEntry(
                element_id=binding.element_id,
                element_label=binding.element_label,
                namespace=binding.namespace,
                catalog_item_id=binding.catalog_item_id,
                bound_version=binding.catalog_item_version,
                current_version=current_version,
                severity=severity,
                changed_solver_fields=tuple(sorted(changed_solver)),
                changed_ui_fields=tuple(sorted(changed_ui)),
            )
        )

    # Sort for determinism
    drifts.sort(key=lambda d: (d.severity.value, d.element_id))

    # Compute report hash
    report_data = json.dumps(
        [d.to_dict() for d in drifts],
        sort_keys=True,
        ensure_ascii=True,
        separators=(",", ":"),
    )
    report_hash = hashlib.sha256(report_data.encode("utf-8")).hexdigest()

    return DriftReport(
        total_bindings_checked=len(bindings),
        drifts=tuple(drifts),
        has_breaking_drifts=any(d.severity == DriftSeverity.BREAKING for d in drifts),
        report_hash=report_hash,
    )
