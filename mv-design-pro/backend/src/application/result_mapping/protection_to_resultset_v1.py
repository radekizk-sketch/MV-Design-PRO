"""
Protection → ResultSet v1 Mapper — PR-26

Maps the ProtectionResultSetV1 from the Protection Engine v1 to the
canonical ResultSet domain model (PR-14).

INVARIANTS:
- Deterministic: identical protection output → identical ResultSet + signature
- Per-element results sorted by element_ref (guaranteed by build_result_set)
- No physics calculations — pure data mapping
- SC ResultSet remains UNTOUCHED
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from domain.execution import (
    ElementResult,
    ExecutionAnalysisType,
    ResultSet,
    build_result_set,
)
from domain.protection_engine_v1 import ProtectionResultSetV1


def map_protection_to_resultset_v1(
    *,
    protection_result: ProtectionResultSetV1,
    run_id: UUID,
    validation_snapshot: dict[str, Any],
    readiness_snapshot: dict[str, Any],
) -> ResultSet:
    """
    Map a ProtectionResultSetV1 to a canonical ResultSet.

    Args:
        protection_result: Result from Protection Engine v1.
        run_id: UUID of the Run this result belongs to.
        validation_snapshot: Validation state at run time.
        readiness_snapshot: Readiness state at run time.

    Returns:
        Immutable ResultSet with deterministic signature.
    """
    element_results = _build_element_results(protection_result)
    global_results = _build_global_results(protection_result)

    return build_result_set(
        run_id=run_id,
        analysis_type=ExecutionAnalysisType.PROTECTION,
        validation_snapshot=validation_snapshot,
        readiness_snapshot=readiness_snapshot,
        element_results=element_results,
        global_results=global_results,
    )


def _build_element_results(
    protection_result: ProtectionResultSetV1,
) -> list[ElementResult]:
    """Build per-element results from protection result.

    Each relay becomes an element with type 'relay'.
    Each test point becomes a sub-element with type 'relay_test_point'.
    """
    results: list[ElementResult] = []

    for relay_result in protection_result.relay_results:
        # Relay-level summary
        test_point_summaries = []
        for tp in relay_result.per_test_point:
            tp_summary: dict[str, Any] = {
                "point_id": tp.point_id,
                "i_a_secondary": tp.i_a_secondary,
            }
            fr = tp.function_results
            if fr.f51 is not None:
                tp_summary["f51_t_trip_s"] = fr.f51.t_trip_s
                tp_summary["f51_curve_type"] = fr.f51.curve_type
            if fr.f50 is not None:
                tp_summary["f50_picked_up"] = fr.f50.picked_up
                tp_summary["f50_t_trip_s"] = fr.f50.t_trip_s
            test_point_summaries.append(tp_summary)

        results.append(
            ElementResult(
                element_ref=relay_result.relay_id,
                element_type="relay",
                values={
                    "attached_cb_id": relay_result.attached_cb_id,
                    "test_point_count": len(relay_result.per_test_point),
                    "test_points": test_point_summaries,
                },
            )
        )

    return results


def _build_global_results(
    protection_result: ProtectionResultSetV1,
) -> dict[str, Any]:
    """Build global results dict from protection output."""
    total_test_points = 0
    total_f51_trips = 0
    total_f50_pickups = 0

    for rr in protection_result.relay_results:
        for tp in rr.per_test_point:
            total_test_points += 1
            if tp.function_results.f51 is not None:
                total_f51_trips += 1
            if tp.function_results.f50 is not None and tp.function_results.f50.picked_up:
                total_f50_pickups += 1

    return {
        "analysis_type": "PROTECTION",
        "relay_count": len(protection_result.relay_results),
        "total_test_points": total_test_points,
        "total_f51_trips": total_f51_trips,
        "total_f50_pickups": total_f50_pickups,
        "deterministic_signature": protection_result.deterministic_signature,
    }
