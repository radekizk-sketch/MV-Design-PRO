from __future__ import annotations

from typing import Any

from analysis.protection_curves_it.models import (
    ITCurvePoint,
    ITCurveSeries,
    ITMarker,
    ProtectionCurvesITContext,
    ProtectionCurvesITView,
)


def context_to_dict(
    context: ProtectionCurvesITContext | None,
) -> dict[str, Any] | None:
    if context is None:
        return None
    return context.to_dict()


def curve_point_to_dict(point: ITCurvePoint) -> dict[str, Any]:
    return {
        "i_a": float(point.i_a),
        "t_s": float(point.t_s),
    }


def curve_series_to_dict(series: ITCurveSeries) -> dict[str, Any]:
    return {
        "series_id": series.series_id,
        "device_id": series.device_id,
        "role": series.role.value,
        "curve_type": series.curve_type.value,
        "points": [curve_point_to_dict(point) for point in series.points],
        "source": series.source.value,
    }


def marker_to_dict(marker: ITMarker) -> dict[str, Any]:
    return {
        "kind": marker.kind.value,
        "i_a": float(marker.i_a),
        "t_s": float(marker.t_s) if marker.t_s is not None else None,
        "source_proof_id": marker.source_proof_id,
    }


def view_to_dict(view: ProtectionCurvesITView) -> dict[str, Any]:
    return {
        "context": context_to_dict(view.context),
        "bus_id": view.bus_id,
        "primary_device_id": view.primary_device_id,
        "backup_device_id": view.backup_device_id,
        "series": [curve_series_to_dict(series) for series in view.series],
        "markers": [marker_to_dict(marker) for marker in view.markers],
        "margins_pct": {key: float(value) for key, value in sorted(view.margins_pct.items())},
        "why_pl": view.why_pl,
        "missing_data": list(view.missing_data),
    }
