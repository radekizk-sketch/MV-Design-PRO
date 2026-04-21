"""
Topology Links — PR-29: Relay-CB-Target ID Mapping

Unified topology link model that maps:
    relay_id  →  cb_id  →  target_ref

Each TopologyLink binds a protection relay to the circuit breaker
it controls and the network element (branch/bus) it protects.

CANONICAL ALIGNMENT:
- SYSTEM_SPEC.md: Domain layer model
- ARCHITECTURE.md: Domain entities

DOMAIN LAYER RULES:
    TopologyLink is a DATA MODEL only, not a calculation.
    It captures the structural relationship between protection
    devices and network elements.

NOT-A-SOLVER (BINDING):
    This module does NOT contain any physics calculations.
    It defines data structures for relay↔CB↔target mappings.

INVARIANTS:
- Frozen/immutable data structures (dataclass frozen=True)
- Full Polish validation messages
- Deterministic serialization (to_dict / from_dict)
- Deterministic signature (SHA-256 of canonical JSON)
- No randomness in data structures
- WHITE BOX trace for audit
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any

# =============================================================================
# ERRORS
# =============================================================================


class TopologyLinkError(Exception):
    """Base error for topology link operations."""

    def __init__(self, code: str, message_pl: str) -> None:
        super().__init__(message_pl)
        self.code = code
        self.message_pl = message_pl


class DuplicateLinkError(TopologyLinkError):
    """Duplicate link_id detected in topology link set."""

    def __init__(self, link_id: str) -> None:
        super().__init__(
            code="topology.duplicate_link_id",
            message_pl=(
                f"Zduplikowane link_id: {link_id}. "
                f"Każde powiązanie topologiczne musi mieć unikalny identyfikator."
            ),
        )
        self.link_id = link_id


class OrphanRelayError(TopologyLinkError):
    """Relay has no topology link (orphan)."""

    def __init__(self, relay_id: str) -> None:
        super().__init__(
            code="topology.orphan_relay",
            message_pl=(
                f"Przekaźnik {relay_id} nie posiada powiązania topologicznego. "
                f"Każdy przekaźnik musi być przypisany do wyłącznika (CB)."
            ),
        )
        self.relay_id = relay_id


class SelfReferenceError(TopologyLinkError):
    """relay_id and cb_id are the same (self-reference)."""

    def __init__(self, element_id: str) -> None:
        super().__init__(
            code="topology.self_reference",
            message_pl=(
                f"Przekaźnik i wyłącznik mają ten sam identyfikator: {element_id}. "
                f"Przekaźnik (relay) i wyłącznik (CB) muszą być różnymi elementami."
            ),
        )
        self.element_id = element_id


class EmptyIdError(TopologyLinkError):
    """Required ID field is empty."""

    def __init__(self, field_name: str, link_id: str) -> None:
        super().__init__(
            code="topology.empty_id",
            message_pl=(
                f"Pole '{field_name}' jest puste w powiązaniu {link_id}. "
                f"Wymagane identyfikatory nie mogą być puste."
            ),
        )
        self.field_name = field_name
        self.link_id = link_id


# =============================================================================
# TOPOLOGY LINK
# =============================================================================


@dataclass(frozen=True)
class TopologyLink:
    """Single topology link: relay → CB → target.

    Maps a protection relay to the circuit breaker it controls
    and the network element (branch/bus) being protected.

    Attributes:
        link_id: Unique identifier for this topology link
        relay_id: Protection relay UUID/ID
        cb_id: Circuit breaker (switch) element ID from NetworkModel
        target_ref: The element being protected (branch/bus ID)
        station_id: Optional station container ID
        label_pl: Optional Polish human-readable label
    """

    link_id: str
    relay_id: str
    cb_id: str
    target_ref: str
    station_id: str | None = None
    label_pl: str | None = None

    def __post_init__(self) -> None:
        """Validate link fields."""
        # Check for empty required IDs
        if not self.link_id or not self.link_id.strip():
            raise EmptyIdError("link_id", self.link_id or "(pusty)")
        if not self.relay_id or not self.relay_id.strip():
            raise EmptyIdError("relay_id", self.link_id)
        if not self.cb_id or not self.cb_id.strip():
            raise EmptyIdError("cb_id", self.link_id)
        if not self.target_ref or not self.target_ref.strip():
            raise EmptyIdError("target_ref", self.link_id)

        # Check self-reference: relay and CB must be different
        if self.relay_id == self.cb_id:
            raise SelfReferenceError(self.relay_id)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "link_id": self.link_id,
            "relay_id": self.relay_id,
            "cb_id": self.cb_id,
            "target_ref": self.target_ref,
            "station_id": self.station_id,
            "label_pl": self.label_pl,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TopologyLink:
        """Deserialize from dictionary."""
        return cls(
            link_id=str(data["link_id"]),
            relay_id=str(data["relay_id"]),
            cb_id=str(data["cb_id"]),
            target_ref=str(data["target_ref"]),
            station_id=str(data["station_id"]) if data.get("station_id") else None,
            label_pl=str(data["label_pl"]) if data.get("label_pl") else None,
        )


# =============================================================================
# TOPOLOGY LINK SET
# =============================================================================


@dataclass(frozen=True)
class TopologyLinkSet:
    """Validated, deterministic set of topology links.

    INVARIANTS:
    - links sorted by link_id lexicographically
    - deterministic_signature = SHA-256 of canonical JSON
    - No duplicate link_ids
    - All links individually valid

    Attributes:
        links: Tuple of TopologyLink, sorted by link_id
        deterministic_signature: SHA-256 hex digest of canonical JSON
        trace: WHITE BOX audit trace
    """

    links: tuple[TopologyLink, ...] = field(default_factory=tuple)
    deterministic_signature: str = ""
    trace: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Serialize to dictionary."""
        return {
            "links": [link.to_dict() for link in self.links],
            "deterministic_signature": self.deterministic_signature,
            "trace": self.trace,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TopologyLinkSet:
        """Deserialize from dictionary."""
        return cls(
            links=tuple(TopologyLink.from_dict(link) for link in data.get("links", [])),
            deterministic_signature=str(data.get("deterministic_signature", "")),
            trace=data.get("trace", {}),
        )


# =============================================================================
# VALIDATION
# =============================================================================


def validate_topology_links(
    links: tuple[TopologyLink, ...],
) -> list[dict[str, Any]]:
    """Validate a collection of topology links.

    Checks:
    1. No duplicate link_ids
    2. No empty IDs (already enforced by TopologyLink.__post_init__)
    3. No self-references (already enforced by TopologyLink.__post_init__)
    4. No duplicate relay_id → cb_id mappings

    Args:
        links: Tuple of TopologyLink objects to validate.

    Returns:
        List of validation issues (empty if all valid).

    Raises:
        DuplicateLinkError: If duplicate link_id found.
    """
    issues: list[dict[str, Any]] = []

    # Check for duplicate link_ids
    seen_link_ids: set[str] = set()
    for link in links:
        if link.link_id in seen_link_ids:
            raise DuplicateLinkError(link.link_id)
        seen_link_ids.add(link.link_id)

    # Check for duplicate relay_id → cb_id mappings
    seen_relay_cb: set[tuple[str, str]] = set()
    for link in links:
        key = (link.relay_id, link.cb_id)
        if key in seen_relay_cb:
            issues.append(
                {
                    "code": "topology.duplicate_relay_cb_mapping",
                    "relay_id": link.relay_id,
                    "cb_id": link.cb_id,
                    "link_id": link.link_id,
                    "message_pl": (
                        f"Zduplikowane mapowanie przekaźnik→wyłącznik: "
                        f"relay={link.relay_id}, cb={link.cb_id} "
                        f"(powiązanie {link.link_id})."
                    ),
                }
            )
        seen_relay_cb.add(key)

    return issues


# =============================================================================
# FACTORY
# =============================================================================


def build_topology_link_set(
    links: tuple[TopologyLink, ...],
) -> TopologyLinkSet:
    """Create a validated, deterministically signed TopologyLinkSet.

    Factory function that:
    1. Validates all links (no duplicates, no empty IDs)
    2. Sorts links by link_id for determinism
    3. Computes SHA-256 signature of canonical JSON
    4. Builds WHITE BOX trace

    Args:
        links: Tuple of TopologyLink objects.

    Returns:
        TopologyLinkSet with deterministic signature.

    Raises:
        DuplicateLinkError: If duplicate link_id found.
    """
    # Step 1: Validate
    validation_issues = validate_topology_links(links)

    # Step 2: Sort by link_id for determinism
    sorted_links = tuple(sorted(links, key=lambda lk: lk.link_id))

    # Step 3: Compute deterministic signature
    sig_data = {
        "links": [link.to_dict() for link in sorted_links],
    }
    sig_json = json.dumps(sig_data, sort_keys=True, separators=(",", ":"))
    signature = hashlib.sha256(sig_json.encode("utf-8")).hexdigest()

    # Step 4: Build WHITE BOX trace
    relay_ids = sorted({link.relay_id for link in sorted_links})
    cb_ids = sorted({link.cb_id for link in sorted_links})
    target_refs = sorted({link.target_ref for link in sorted_links})
    station_ids = sorted({link.station_id for link in sorted_links if link.station_id})

    trace: dict[str, Any] = {
        "total_links": len(sorted_links),
        "unique_relays": len(relay_ids),
        "unique_cbs": len(cb_ids),
        "unique_targets": len(target_refs),
        "unique_stations": len(station_ids),
        "relay_ids": relay_ids,
        "cb_ids": cb_ids,
        "target_refs": target_refs,
        "station_ids": station_ids,
        "validation_issues": validation_issues,
        "signature_algorithm": "SHA-256",
        "description_pl": (
            "Zbiór powiązań topologicznych: przekaźnik → wyłącznik → element chroniony"
        ),
    }

    return TopologyLinkSet(
        links=sorted_links,
        deterministic_signature=signature,
        trace=trace,
    )


# =============================================================================
# RESOLUTION HELPERS
# =============================================================================


def resolve_relay_to_cb(
    link_set: TopologyLinkSet,
    relay_id: str,
) -> str:
    """Resolve relay_id to its associated cb_id.

    Args:
        link_set: TopologyLinkSet to search.
        relay_id: Relay identifier to look up.

    Returns:
        cb_id associated with the relay.

    Raises:
        OrphanRelayError: If relay_id not found in link set.
    """
    for link in link_set.links:
        if link.relay_id == relay_id:
            return link.cb_id
    raise OrphanRelayError(relay_id)


def resolve_cb_to_target(
    link_set: TopologyLinkSet,
    cb_id: str,
) -> str:
    """Resolve cb_id to its associated target_ref.

    Args:
        link_set: TopologyLinkSet to search.
        cb_id: Circuit breaker identifier to look up.

    Returns:
        target_ref associated with the CB.

    Raises:
        TopologyLinkError: If cb_id not found in link set.
    """
    for link in link_set.links:
        if link.cb_id == cb_id:
            return link.target_ref
    raise TopologyLinkError(
        code="topology.cb_not_found",
        message_pl=(
            f"Wyłącznik {cb_id} nie występuje w zbiorze powiązań "
            f"topologicznych. Sprawdź konfigurację."
        ),
    )


def resolve_relay_to_target(
    link_set: TopologyLinkSet,
    relay_id: str,
) -> tuple[str, str]:
    """Resolve relay_id to both cb_id and target_ref.

    Convenience function: relay → (cb_id, target_ref).

    Args:
        link_set: TopologyLinkSet to search.
        relay_id: Relay identifier to look up.

    Returns:
        Tuple of (cb_id, target_ref).

    Raises:
        OrphanRelayError: If relay_id not found in link set.
    """
    for link in link_set.links:
        if link.relay_id == relay_id:
            return link.cb_id, link.target_ref
    raise OrphanRelayError(relay_id)


def get_links_by_station(
    link_set: TopologyLinkSet,
    station_id: str,
) -> tuple[TopologyLink, ...]:
    """Get all topology links for a given station.

    Args:
        link_set: TopologyLinkSet to search.
        station_id: Station identifier to filter by.

    Returns:
        Tuple of TopologyLink objects belonging to the station.
    """
    return tuple(link for link in link_set.links if link.station_id == station_id)
