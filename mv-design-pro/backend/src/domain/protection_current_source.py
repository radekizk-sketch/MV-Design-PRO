"""
Protection Current Source — PR-27: SC ↔ Protection Bridge

Domain types for explicit current source selection.
Bridges SC ResultSet (read-only) to Protection Engine v1.

INVARIANTS:
- CurrentSourceType is explicit user selection (TEST_POINTS or SC_RESULT)
- No auto-mapping: ambiguous SC → relay mapping raises deterministic error
- No fallback: incomplete specification refuses execution
- No default selection: FixAction candidates presented without pre-selection
- current_source included in hash for determinism
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

# =============================================================================
# ENUMS
# =============================================================================


class CurrentSourceType(StrEnum):
    """How protection test currents are sourced."""

    TEST_POINTS = "TEST_POINTS"  # User-defined explicit test currents
    SC_RESULT = "SC_RESULT"  # Resolved from SC ResultSet (read-only)


# =============================================================================
# SC CURRENT SELECTION
# =============================================================================


@dataclass(frozen=True)
class TargetRefMapping:
    """Explicit mapping: which SC element provides current for which relay.

    Attributes:
        relay_id: Protection relay ID
        element_ref: SC ResultSet element_ref (fault node or contribution)
        element_type: SC element type ("bus", "source_contribution", "branch_contribution")
    """

    relay_id: str
    element_ref: str
    element_type: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "relay_id": self.relay_id,
            "element_ref": self.element_ref,
            "element_type": self.element_type,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> TargetRefMapping:
        return cls(
            relay_id=str(data["relay_id"]),
            element_ref=str(data["element_ref"]),
            element_type=str(data["element_type"]),
        )


@dataclass(frozen=True)
class SCCurrentSelection:
    """Explicit user selection for SC-based current source.

    Attributes:
        run_id: SC Run UUID (binding reference)
        quantity: SC field to extract ("ikss_a", "ip_a", "ith_a", "ib_a", "ik_total_a")
        target_ref_mapping: Explicit relay → SC element mapping
    """

    run_id: str
    quantity: str
    target_ref_mapping: tuple[TargetRefMapping, ...]

    # ZWARCIA-PRO F5 (parytet konsumentow): "ib_a" addytywnie — prad wylaczeniowy
    # I_b (IEC 60909) jest w ResultSet SC od zawsze (short_circuit_to_resultset_v1),
    # a dobor nastaw/koordynacja przy czasie t_b wymaga tej wielkosci 1:1 z solvera.
    ALLOWED_QUANTITIES = frozenset({"ikss_a", "ip_a", "ith_a", "ib_a", "ik_total_a"})

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "quantity": self.quantity,
            "target_ref_mapping": [m.to_dict() for m in self.target_ref_mapping],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SCCurrentSelection:
        return cls(
            run_id=str(data["run_id"]),
            quantity=str(data["quantity"]),
            target_ref_mapping=tuple(
                TargetRefMapping.from_dict(m) for m in data.get("target_ref_mapping", [])
            ),
        )


# =============================================================================
# PROTECTION CURRENT SOURCE (MAIN CONTRACT)
# =============================================================================


@dataclass(frozen=True)
class ProtectionCurrentSource:
    """Complete current source specification for protection analysis.

    INVARIANTS:
    - If source_type == TEST_POINTS: test_points_data must be non-None
    - If source_type == SC_RESULT: sc_selection must be non-None
    - Exactly one branch is active (XOR)
    """

    source_type: CurrentSourceType
    sc_selection: SCCurrentSelection | None = None

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "source_type": self.source_type.value,
        }
        if self.sc_selection is not None:
            result["sc_selection"] = self.sc_selection.to_dict()
        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ProtectionCurrentSource:
        sc_sel = None
        if data.get("sc_selection"):
            sc_sel = SCCurrentSelection.from_dict(data["sc_selection"])
        return cls(
            source_type=CurrentSourceType(data["source_type"]),
            sc_selection=sc_sel,
        )

    def canonical_hash(self) -> str:
        """Compute deterministic SHA-256 of current source specification."""
        payload = json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# =============================================================================
# RESOLVER ERRORS
# =============================================================================


class CurrentSourceError(Exception):
    """Base error for current source resolution."""

    def __init__(
        self, code: str, message_pl: str, fix_actions: list[dict[str, Any]] | None = None
    ) -> None:
        super().__init__(message_pl)
        self.code = code
        self.message_pl = message_pl
        self.fix_actions = fix_actions or []


class AmbiguousMappingError(CurrentSourceError):
    """SC → relay mapping is ambiguous — candidates provided as FixActions."""

    def __init__(
        self,
        relay_id: str,
        candidates: list[dict[str, Any]],
    ) -> None:
        fix_actions = [
            {
                "action_type": "SELECT_TARGET_REF",
                "relay_id": relay_id,
                "candidate": c,
            }
            for c in candidates
        ]
        super().__init__(
            code="protection.sc_mapping_ambiguous",
            message_pl=(
                f"Niejednoznaczne mapowanie wyniku SC na przekaźnik {relay_id}. "
                f"Wybierz źródło prądu z {len(candidates)} kandydatów."
            ),
            fix_actions=fix_actions,
        )
        self.relay_id = relay_id
        self.candidates = candidates


class MissingMappingError(CurrentSourceError):
    """Relay has no mapping to SC element."""

    def __init__(self, relay_id: str) -> None:
        super().__init__(
            code="protection.sc_mapping_missing",
            message_pl=(
                f"Brak mapowania wyniku SC na przekaźnik {relay_id}. "
                f"Uzupełnij mapowanie element → przekaźnik."
            ),
            fix_actions=[
                {
                    "action_type": "ADD_TARGET_REF_MAPPING",
                    "relay_id": relay_id,
                }
            ],
        )
        self.relay_id = relay_id


class InvalidQuantityError(CurrentSourceError):
    """Requested SC quantity is not valid."""

    def __init__(self, quantity: str) -> None:
        super().__init__(
            code="protection.invalid_sc_quantity",
            message_pl=(
                f"Nieprawidłowa wielkość SC: '{quantity}'. "
                f"Dozwolone: {', '.join(sorted(SCCurrentSelection.ALLOWED_QUANTITIES))}"
            ),
        )
        self.quantity = quantity


class SCRunNotFoundError(CurrentSourceError):
    """Referenced SC run does not exist."""

    def __init__(self, run_id: str) -> None:
        super().__init__(
            code="protection.sc_run_not_found",
            message_pl=f"Przebieg SC nie istnieje: {run_id}",
        )


class DuplicateMappingError(CurrentSourceError):
    """Duplicate relay_id in target_ref_mapping."""

    def __init__(self, relay_id: str) -> None:
        super().__init__(
            code="protection.duplicate_relay_mapping",
            message_pl=(
                f"Zduplikowane mapowanie dla przekaźnika {relay_id}. "
                f"Każdy przekaźnik może mieć tylko jedno mapowanie."
            ),
        )
        self.relay_id = relay_id
