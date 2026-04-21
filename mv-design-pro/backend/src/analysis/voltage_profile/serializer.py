from __future__ import annotations

from typing import Any

from analysis.voltage_profile.models import (
    VoltageProfileContext,
    VoltageProfileRow,
    VoltageProfileStatus,
    VoltageProfileSummary,
    VoltageProfileView,
)

STATUS_ORDER: dict[VoltageProfileStatus, int] = {
    VoltageProfileStatus.FAIL: 0,
    VoltageProfileStatus.WARNING: 1,
    VoltageProfileStatus.PASS: 2,
    VoltageProfileStatus.NOT_COMPUTED: 3,
}


def row_to_dict(row: VoltageProfileRow) -> dict[str, Any]:
    return {
        "bus_id": row.bus_id,
        "bus_name": row.bus_name,
        "u_nom_kv": float(row.u_nom_kv) if row.u_nom_kv is not None else None,
        "u_kv": float(row.u_kv) if row.u_kv is not None else None,
        "u_pu": float(row.u_pu) if row.u_pu is not None else None,
        "delta_pct": float(row.delta_pct) if row.delta_pct is not None else None,
        "status": row.status.value,
        "p_mw": float(row.p_mw) if row.p_mw is not None else None,
        "q_mvar": float(row.q_mvar) if row.q_mvar is not None else None,
        "case_name": row.case_name,
        "run_timestamp": row.run_timestamp.isoformat() if row.run_timestamp else None,
    }


def summary_to_dict(summary: VoltageProfileSummary) -> dict[str, Any]:
    return {
        "worst_bus_id": summary.worst_bus_id,
        "worst_delta_pct_abs": (
            float(summary.worst_delta_pct_abs) if summary.worst_delta_pct_abs is not None else None
        ),
        "pass_count": int(summary.pass_count),
        "warning_count": int(summary.warning_count),
        "fail_count": int(summary.fail_count),
        "not_computed_count": int(summary.not_computed_count),
    }


def context_to_dict(context: VoltageProfileContext | None) -> dict[str, Any] | None:
    if context is None:
        return None
    return context.to_dict()


def view_to_dict(view: VoltageProfileView) -> dict[str, Any]:
    return {
        "context": context_to_dict(view.context),
        "thresholds": {
            "voltage_warn_pct": float(view.thresholds["voltage_warn_pct"]),
            "voltage_fail_pct": float(view.thresholds["voltage_fail_pct"]),
        },
        "rows": [row_to_dict(row) for row in view.rows],
        "summary": summary_to_dict(view.summary),
    }
