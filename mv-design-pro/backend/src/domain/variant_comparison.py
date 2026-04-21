"""
Variant Comparison Domain Model — Industrial Grade.

Extends StudyCaseComparison with full delta analysis:
- Configuration delta (calc parameters)
- Network topology delta (added/removed/modified elements)
- Result delta (SC, LF, Protection metrics)
- Deterministic hash for CI verification

INVARIANTS:
- Read-only: no model mutation
- Deterministic: same inputs → identical output
- Pure interpretation: no physics calculations
- Frozen dataclasses throughout
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class VariantDeltaKind(str, Enum):
    """Kind of variant difference."""

    CONFIG = "CONFIG"
    TOPOLOGY = "TOPOLOGY"
    RESULT_SC = "RESULT_SC"
    RESULT_LF = "RESULT_LF"
    RESULT_PROTECTION = "RESULT_PROTECTION"


class DeltaDirection(str, Enum):
    """Direction of a numeric change."""

    INCREASED = "INCREASED"
    DECREASED = "DECREASED"
    UNCHANGED = "UNCHANGED"
    NOT_COMPARABLE = "NOT_COMPARABLE"


@dataclass(frozen=True)
class VariantConfigDelta:
    """Single configuration parameter difference between two variants.

    Attributes:
        field_name: Configuration field name.
        label_pl: Polish label for the field.
        value_a: Value in variant A.
        value_b: Value in variant B.
        unit: Unit of the field (optional).
    """

    field_name: str
    label_pl: str
    value_a: object | None
    value_b: object | None
    unit: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "field_name": self.field_name,
            "label_pl": self.label_pl,
            "value_a": self.value_a,
            "value_b": self.value_b,
            "unit": self.unit,
        }


# Polish labels for StudyCaseConfig fields
CONFIG_FIELD_LABELS: dict[str, tuple[str, str]] = {
    "c_factor_max": ("Współczynnik c (max)", ""),
    "c_factor_min": ("Współczynnik c (min)", ""),
    "base_mva": ("Moc bazowa", "MVA"),
    "max_iterations": ("Maks. iteracji", ""),
    "tolerance": ("Tolerancja zbieżności", ""),
    "include_motor_contribution": ("Wkład silników", ""),
    "include_inverter_contribution": ("Wkład falowników", ""),
    "thermal_time_seconds": ("Czas cieplny", "s"),
}


@dataclass(frozen=True)
class VariantResultDelta:
    """Result metric comparison between two variants.

    Attributes:
        metric_name: Metric identifier (e.g., "ik3f_max_ka").
        label_pl: Polish display label.
        value_a: Value in variant A (None if not available).
        value_b: Value in variant B (None if not available).
        unit: Unit of the metric.
        direction: Direction of change A→B.
        delta_abs: Absolute difference |B - A|.
        delta_percent: Percentage difference ((B-A)/A * 100).
    """

    metric_name: str
    label_pl: str
    value_a: float | None
    value_b: float | None
    unit: str = ""
    direction: DeltaDirection = DeltaDirection.NOT_COMPARABLE
    delta_abs: float | None = None
    delta_percent: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "metric_name": self.metric_name,
            "label_pl": self.label_pl,
            "value_a": self.value_a,
            "value_b": self.value_b,
            "unit": self.unit,
            "direction": self.direction.value,
            "delta_abs": self.delta_abs,
            "delta_percent": self.delta_percent,
        }


@dataclass(frozen=True)
class VariantTopologySummary:
    """Summary of topology differences between two variants.

    Attributes:
        elements_added: Count of elements added in B vs A.
        elements_removed: Count of elements removed in B vs A.
        elements_modified: Count of elements with changed parameters.
        added_element_ids: Tuple of added element IDs.
        removed_element_ids: Tuple of removed element IDs.
        modified_element_ids: Tuple of modified element IDs.
    """

    elements_added: int = 0
    elements_removed: int = 0
    elements_modified: int = 0
    added_element_ids: tuple[str, ...] = ()
    removed_element_ids: tuple[str, ...] = ()
    modified_element_ids: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "elements_added": self.elements_added,
            "elements_removed": self.elements_removed,
            "elements_modified": self.elements_modified,
            "added_element_ids": list(self.added_element_ids),
            "removed_element_ids": list(self.removed_element_ids),
            "modified_element_ids": list(self.modified_element_ids),
        }


@dataclass(frozen=True)
class VariantComparisonResult:
    """Complete variant comparison result.

    Combines configuration, topology, and result deltas into a single
    deterministic, auditable report.

    Attributes:
        case_a_id: ID of the first study case.
        case_b_id: ID of the second study case.
        case_a_name: Name of variant A.
        case_b_name: Name of variant B.
        config_deltas: Configuration parameter differences.
        topology_summary: Topology change summary.
        result_deltas: Result metric differences.
        comparison_hash: SHA-256 hash for determinism verification.
    """

    case_a_id: str
    case_b_id: str
    case_a_name: str
    case_b_name: str
    config_deltas: tuple[VariantConfigDelta, ...] = ()
    topology_summary: VariantTopologySummary = field(default_factory=VariantTopologySummary)
    result_deltas: tuple[VariantResultDelta, ...] = ()
    comparison_hash: str = ""

    @property
    def has_config_changes(self) -> bool:
        return len(self.config_deltas) > 0

    @property
    def has_topology_changes(self) -> bool:
        return (
            self.topology_summary.elements_added > 0
            or self.topology_summary.elements_removed > 0
            or self.topology_summary.elements_modified > 0
        )

    @property
    def has_result_changes(self) -> bool:
        return any(
            d.direction != DeltaDirection.UNCHANGED and d.direction != DeltaDirection.NOT_COMPARABLE
            for d in self.result_deltas
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "case_a_id": self.case_a_id,
            "case_b_id": self.case_b_id,
            "case_a_name": self.case_a_name,
            "case_b_name": self.case_b_name,
            "config_deltas": [d.to_dict() for d in self.config_deltas],
            "topology_summary": self.topology_summary.to_dict(),
            "result_deltas": [d.to_dict() for d in self.result_deltas],
            "comparison_hash": self.comparison_hash,
            "has_config_changes": self.has_config_changes,
            "has_topology_changes": self.has_topology_changes,
            "has_result_changes": self.has_result_changes,
        }


def compute_config_deltas(
    config_a: dict[str, Any],
    config_b: dict[str, Any],
) -> tuple[VariantConfigDelta, ...]:
    """Compare two study case configurations.

    Returns tuple of VariantConfigDelta for each differing field.
    Deterministic: sorted by field_name.
    """
    deltas: list[VariantConfigDelta] = []
    all_keys = sorted(set(config_a.keys()) | set(config_b.keys()))

    for key in all_keys:
        val_a = config_a.get(key)
        val_b = config_b.get(key)
        if val_a != val_b:
            label_pl, unit = CONFIG_FIELD_LABELS.get(key, (key, ""))
            deltas.append(
                VariantConfigDelta(
                    field_name=key,
                    label_pl=label_pl,
                    value_a=val_a,
                    value_b=val_b,
                    unit=unit,
                )
            )

    return tuple(deltas)


def compute_result_delta(
    metric_name: str,
    label_pl: str,
    value_a: float | None,
    value_b: float | None,
    unit: str = "",
) -> VariantResultDelta:
    """Compute a single result metric delta.

    Pure function, deterministic, no physics.
    """
    if value_a is None or value_b is None:
        return VariantResultDelta(
            metric_name=metric_name,
            label_pl=label_pl,
            value_a=value_a,
            value_b=value_b,
            unit=unit,
            direction=DeltaDirection.NOT_COMPARABLE,
        )

    delta_abs = abs(value_b - value_a)
    delta_percent = ((value_b - value_a) / value_a * 100.0) if value_a != 0 else None

    if value_b > value_a:
        direction = DeltaDirection.INCREASED
    elif value_b < value_a:
        direction = DeltaDirection.DECREASED
    else:
        direction = DeltaDirection.UNCHANGED

    return VariantResultDelta(
        metric_name=metric_name,
        label_pl=label_pl,
        value_a=value_a,
        value_b=value_b,
        unit=unit,
        direction=direction,
        delta_abs=round(delta_abs, 6),
        delta_percent=round(delta_percent, 4) if delta_percent is not None else None,
    )


def build_variant_comparison(
    case_a_id: str,
    case_b_id: str,
    case_a_name: str,
    case_b_name: str,
    config_deltas: tuple[VariantConfigDelta, ...],
    topology_summary: VariantTopologySummary,
    result_deltas: tuple[VariantResultDelta, ...],
) -> VariantComparisonResult:
    """Build a complete variant comparison with deterministic hash.

    All inputs are frozen — result is deterministic.
    """
    # Build canonical representation for hashing
    canonical_data = {
        "case_a_id": case_a_id,
        "case_b_id": case_b_id,
        "config_deltas": [d.to_dict() for d in config_deltas],
        "topology_summary": topology_summary.to_dict(),
        "result_deltas": [d.to_dict() for d in result_deltas],
    }
    canonical_json = json.dumps(
        canonical_data, sort_keys=True, ensure_ascii=True, separators=(",", ":")
    )
    comparison_hash = hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()

    return VariantComparisonResult(
        case_a_id=case_a_id,
        case_b_id=case_b_id,
        case_a_name=case_a_name,
        case_b_name=case_b_name,
        config_deltas=config_deltas,
        topology_summary=topology_summary,
        result_deltas=result_deltas,
        comparison_hash=comparison_hash,
    )
