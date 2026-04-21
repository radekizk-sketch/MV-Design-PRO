"""
Study Case Delta Overlay — snapshot-level element diff.

Computes structural differences between two NetworkSnapshots at the
element level (added, removed, modified elements). This is an
interpretation-layer concept — no physics, no model mutation.

Used by the UI to render visual diffs between study cases that
reference different snapshots.

INVARIANTS:
- Read-only: no model mutation
- Deterministic: same inputs produce identical output
- Pure interpretation: works on serialized snapshot dicts
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from network_model.core.snapshot import NetworkSnapshot


class DeltaOverlayToken(str, Enum):
    """
    Semantic color tokens for UI rendering of delta overlays.

    ADDED: element exists in snapshot B but not in A (green)
    REMOVED: element exists in snapshot A but not in B (red)
    MODIFIED: element exists in both but with different values (amber)
    UNCHANGED: element is identical in both snapshots (no highlight)
    """

    ADDED = "ADDED"
    REMOVED = "REMOVED"
    MODIFIED = "MODIFIED"
    UNCHANGED = "UNCHANGED"


@dataclass(frozen=True)
class FieldChange:
    """
    Single field-level change between two snapshots.

    Attributes:
        element_id: ID of the element that changed.
        field_name: Name of the changed field.
        old_value: Value in snapshot A.
        new_value: Value in snapshot B.
    """

    element_id: str
    field_name: str
    old_value: object
    new_value: object

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "element_id": self.element_id,
            "field_name": self.field_name,
            "old_value": self.old_value,
            "new_value": self.new_value,
        }


@dataclass(frozen=True)
class DeltaOverlay:
    """
    Frozen delta overlay between two snapshots.

    Contains the structural difference between snapshot A and snapshot B
    at the element level.

    Attributes:
        added_elements: Element IDs present in B but not in A.
        removed_elements: Element IDs present in A but not in B.
        modified_elements: Field-level changes for elements in both A and B.
    """

    added_elements: tuple[str, ...] = ()
    removed_elements: tuple[str, ...] = ()
    modified_elements: tuple[FieldChange, ...] = ()

    @property
    def is_empty(self) -> bool:
        """Return True if there are no differences."""
        return (
            len(self.added_elements) == 0
            and len(self.removed_elements) == 0
            and len(self.modified_elements) == 0
        )

    @property
    def total_changes(self) -> int:
        """Return total number of changes."""
        return len(self.added_elements) + len(self.removed_elements) + len(self.modified_elements)

    def token_for(self, element_id: str) -> DeltaOverlayToken:
        """
        Return the semantic token for a given element.

        Args:
            element_id: ID of the element to query.

        Returns:
            DeltaOverlayToken indicating the element's change status.
        """
        if element_id in self.added_elements:
            return DeltaOverlayToken.ADDED
        if element_id in self.removed_elements:
            return DeltaOverlayToken.REMOVED
        modified_ids = {fc.element_id for fc in self.modified_elements}
        if element_id in modified_ids:
            return DeltaOverlayToken.MODIFIED
        return DeltaOverlayToken.UNCHANGED

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "added_elements": list(self.added_elements),
            "removed_elements": list(self.removed_elements),
            "modified_elements": [fc.to_dict() for fc in self.modified_elements],
        }


def _extract_elements(snapshot_dict: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """
    Extract all elements from a snapshot dict, keyed by element id.

    Scans the graph section for nodes, branches, inverter_sources, and switches.

    Returns:
        Dict mapping element id -> element dict.
    """
    elements: dict[str, dict[str, Any]] = {}
    graph = snapshot_dict.get("graph", {})

    for collection_key in ("nodes", "branches", "inverter_sources", "switches"):
        for element in graph.get(collection_key, []):
            element_id = element.get("id")
            if element_id is not None:
                elements[str(element_id)] = element

    return elements


def _diff_fields(
    element_id: str,
    dict_a: dict[str, Any],
    dict_b: dict[str, Any],
) -> list[FieldChange]:
    """
    Compare two element dicts field by field.

    Returns list of FieldChange for differing fields.
    """
    changes: list[FieldChange] = []
    all_keys = sorted(set(dict_a.keys()) | set(dict_b.keys()))

    for key in all_keys:
        val_a = dict_a.get(key)
        val_b = dict_b.get(key)
        if val_a != val_b:
            changes.append(
                FieldChange(
                    element_id=element_id,
                    field_name=key,
                    old_value=val_a,
                    new_value=val_b,
                )
            )

    return changes


def compute_delta(
    snapshot_a: NetworkSnapshot,
    snapshot_b: NetworkSnapshot,
) -> DeltaOverlay:
    """
    Compute the structural delta between two snapshots.

    Identifies elements that were added, removed, or modified
    between snapshot A and snapshot B.

    Args:
        snapshot_a: The baseline snapshot.
        snapshot_b: The comparison snapshot.

    Returns:
        Frozen DeltaOverlay with all detected changes.

    Note:
        This is a pure interpretation function. It does not mutate
        either snapshot or perform any physics calculations.
    """
    dict_a = snapshot_a.to_dict()
    dict_b = snapshot_b.to_dict()

    elements_a = _extract_elements(dict_a)
    elements_b = _extract_elements(dict_b)

    ids_a = set(elements_a.keys())
    ids_b = set(elements_b.keys())

    added = sorted(ids_b - ids_a)
    removed = sorted(ids_a - ids_b)
    common = sorted(ids_a & ids_b)

    modified: list[FieldChange] = []
    for eid in common:
        field_changes = _diff_fields(eid, elements_a[eid], elements_b[eid])
        modified.extend(field_changes)

    # Sort modified by (element_id, field_name) for determinism
    modified.sort(key=lambda fc: (fc.element_id, fc.field_name))

    return DeltaOverlay(
        added_elements=tuple(added),
        removed_elements=tuple(removed),
        modified_elements=tuple(modified),
    )
