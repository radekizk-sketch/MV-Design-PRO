"""
Protection Current Resolver — PR-27: SC ↔ Protection Bridge

Resolves current values for Protection Engine from either:
- TEST_POINTS: user-supplied explicit test currents (pass-through)
- SC_RESULT: reads SC ResultSet (read-only) and maps to test points

INVARIANTS:
- No auto-mapping: ambiguous or missing mapping → deterministic error + FixActions
- No fallback: incomplete specification → error
- No default selection: candidates ranked deterministically, no pre-selection
- SC ResultSet is NEVER modified (read-only access)
- Deterministic: identical inputs → identical test points
"""

from __future__ import annotations

from domain.execution import (
    ElementResult,
    ExecutionAnalysisType,
    ResultSet,
)
from domain.protection_current_source import (
    AmbiguousMappingError,
    CurrentSourceType,
    DuplicateMappingError,
    InvalidQuantityError,
    MissingMappingError,
    ProtectionCurrentSource,
    SCCurrentSelection,
    SCRunNotFoundError,
    TargetRefMapping,
)
from domain.protection_engine_v1 import TestPoint


class ProtectionCurrentResolver:
    """Resolves test point currents from the configured current source.

    Architecture:
    - Lives in APPLICATION layer (not domain, not solver)
    - Reads SC ResultSet (read-only) — NEVER modifies it
    - Produces TestPoint tuples for Protection Engine v1
    - All errors are deterministic with FixAction suggestions
    """

    def resolve(
        self,
        *,
        current_source: ProtectionCurrentSource,
        relay_ids: tuple[str, ...],
        test_points: tuple[TestPoint, ...] | None = None,
        sc_result_set: ResultSet | None = None,
    ) -> tuple[TestPoint, ...]:
        """Resolve test point currents from configured source.

        Args:
            current_source: User's explicit current source selection
            relay_ids: IDs of relays to resolve currents for
            test_points: User-defined test points (when TEST_POINTS mode)
            sc_result_set: SC ResultSet (when SC_RESULT mode, read-only)

        Returns:
            Tuple of resolved TestPoint objects (sorted by point_id)

        Raises:
            CurrentSourceError subclasses for any resolution issue
        """
        if current_source.source_type == CurrentSourceType.TEST_POINTS:
            return self._resolve_test_points(test_points)
        elif current_source.source_type == CurrentSourceType.SC_RESULT:
            return self._resolve_from_sc(
                sc_selection=current_source.sc_selection,
                relay_ids=relay_ids,
                sc_result_set=sc_result_set,
            )
        else:
            raise ValueError(f"Nieobsługiwany typ źródła prądu: {current_source.source_type}")

    def _resolve_test_points(
        self,
        test_points: tuple[TestPoint, ...] | None,
    ) -> tuple[TestPoint, ...]:
        """Pass through user-defined test points (sorted for determinism)."""
        if test_points is None or len(test_points) == 0:
            from domain.protection_current_source import CurrentSourceError

            raise CurrentSourceError(
                code="protection.test_points_empty",
                message_pl="Brak punktów testowych prądu. Dodaj co najmniej jeden punkt testowy.",
                fix_actions=[{"action_type": "ADD_MISSING_DEVICE"}],
            )
        return tuple(sorted(test_points, key=lambda tp: tp.point_id))

    def _resolve_from_sc(
        self,
        *,
        sc_selection: SCCurrentSelection | None,
        relay_ids: tuple[str, ...],
        sc_result_set: ResultSet | None,
    ) -> tuple[TestPoint, ...]:
        """Resolve currents from SC ResultSet using explicit mapping."""
        if sc_selection is None:
            from domain.protection_current_source import CurrentSourceError

            raise CurrentSourceError(
                code="protection.sc_selection_missing",
                message_pl="Brak konfiguracji źródła prądu SC. Wybierz przebieg SC i mapowanie.",
            )

        # Validate quantity
        if sc_selection.quantity not in SCCurrentSelection.ALLOWED_QUANTITIES:
            raise InvalidQuantityError(sc_selection.quantity)

        # Validate SC ResultSet exists
        if sc_result_set is None:
            raise SCRunNotFoundError(sc_selection.run_id)

        # Validate SC ResultSet is actually SC type
        sc_types = {
            ExecutionAnalysisType.SC_3F,
            ExecutionAnalysisType.SC_1F,
            ExecutionAnalysisType.SC_2F,
        }
        if sc_result_set.analysis_type not in sc_types:
            from domain.protection_current_source import CurrentSourceError

            raise CurrentSourceError(
                code="protection.sc_result_wrong_type",
                message_pl=(
                    f"Wynik o typie {sc_result_set.analysis_type.value} "
                    f"nie jest wynikiem zwarciowym."
                ),
            )

        # Validate no duplicate relay_ids in mapping
        self._validate_no_duplicate_mappings(sc_selection.target_ref_mapping)

        # Validate all relays have mappings
        self._validate_all_relays_mapped(
            relay_ids=relay_ids,
            mapping=sc_selection.target_ref_mapping,
        )

        # Build element lookup from SC ResultSet (read-only)
        element_lookup = self._build_element_lookup(sc_result_set)

        # Resolve each mapping to a test point
        resolved: list[TestPoint] = []
        for mapping in sc_selection.target_ref_mapping:
            current_a = self._extract_current(
                mapping=mapping,
                quantity=sc_selection.quantity,
                element_lookup=element_lookup,
            )
            resolved.append(
                TestPoint(
                    point_id=f"sc_{mapping.relay_id}_{sc_selection.quantity}",
                    i_a_primary=current_a,
                )
            )

        # Sort for determinism
        return tuple(sorted(resolved, key=lambda tp: tp.point_id))

    def _validate_no_duplicate_mappings(
        self,
        mapping: tuple[TargetRefMapping, ...],
    ) -> None:
        """Ensure no relay_id appears twice in mapping."""
        seen: set[str] = set()
        for m in mapping:
            if m.relay_id in seen:
                raise DuplicateMappingError(m.relay_id)
            seen.add(m.relay_id)

    def _validate_all_relays_mapped(
        self,
        *,
        relay_ids: tuple[str, ...],
        mapping: tuple[TargetRefMapping, ...],
    ) -> None:
        """Ensure every relay has exactly one mapping entry."""
        mapped_relay_ids = {m.relay_id for m in mapping}
        for relay_id in relay_ids:
            if relay_id not in mapped_relay_ids:
                raise MissingMappingError(relay_id)

    def _build_element_lookup(
        self,
        sc_result_set: ResultSet,
    ) -> dict[str, ElementResult]:
        """Build deterministic element lookup from SC ResultSet (read-only)."""
        lookup: dict[str, ElementResult] = {}
        for er in sc_result_set.element_results:
            lookup[er.element_ref] = er
        return lookup

    def _extract_current(
        self,
        *,
        mapping: TargetRefMapping,
        quantity: str,
        element_lookup: dict[str, ElementResult],
    ) -> float:
        """Extract current value from SC element using mapping.

        Raises:
            AmbiguousMappingError: If element_ref exists but has multiple
                matching entries (should not happen with explicit mapping,
                but guard is here for safety)
            MissingMappingError: If element_ref not found in results
        """
        element = element_lookup.get(mapping.element_ref)
        if element is None:
            # Build candidate list from all elements of matching type
            # (sorted deterministically by element_ref for stable FixActions)
            candidates = [
                {
                    "element_ref": er.element_ref,
                    "element_type": er.element_type,
                    "available_values": {
                        k: v for k, v in sorted(er.values.items()) if isinstance(v, int | float)
                    },
                }
                for er in sorted(
                    element_lookup.values(),
                    key=lambda e: e.element_ref,
                )
                if er.element_type == mapping.element_type
            ]
            if candidates:
                raise AmbiguousMappingError(
                    relay_id=mapping.relay_id,
                    candidates=candidates,
                )
            raise MissingMappingError(mapping.relay_id)

        # Extract the requested quantity from element values
        value = element.values.get(quantity)
        if value is None:
            from domain.protection_current_source import CurrentSourceError

            raise CurrentSourceError(
                code="protection.sc_quantity_not_in_element",
                message_pl=(
                    f"Element {mapping.element_ref} nie zawiera wielkości '{quantity}'. "
                    f"Dostępne: {', '.join(sorted(element.values.keys()))}"
                ),
            )

        if not isinstance(value, int | float):
            from domain.protection_current_source import CurrentSourceError

            raise CurrentSourceError(
                code="protection.sc_quantity_not_numeric",
                message_pl=(
                    f"Wielkość '{quantity}' w elemencie {mapping.element_ref} "
                    f"nie jest wartością liczbową."
                ),
            )

        return float(value)
