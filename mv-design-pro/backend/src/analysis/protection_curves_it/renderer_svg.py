from __future__ import annotations

import math
from collections.abc import Iterable

from analysis.normative.models import NormativeStatus
from analysis.protection_curves_it.models import (
    ITCurvePoint,
    ITCurveRole,
    ITCurveSeries,
    ITMarker,
    ProtectionCurvesITView,
)

_PRIMARY_COLOR = "#1f77b4"
_BACKUP_COLOR = "#2ca02c"
_UNKNOWN_COLOR = "#7f7f7f"
_FAIL_OVERLAY = "#d62728"

_STATUS_COLOR = {
    NormativeStatus.PASS: "#2ca02c",
    NormativeStatus.WARNING: "#ff7f0e",
    NormativeStatus.FAIL: "#d62728",
    NormativeStatus.NOT_EVALUATED: "#7f7f7f",
    NormativeStatus.NOT_COMPUTED: "#7f7f7f",
}


def render_protection_curves_svg(view: ProtectionCurvesITView) -> str:
    width = 900
    height = 620
    margin_left = 70
    margin_right = 250
    margin_top = 40
    margin_bottom = 70

    plot_width = width - margin_left - margin_right
    plot_height = height - margin_top - margin_bottom

    series_points = _collect_points(view.series)
    marker_points = _collect_marker_points(view.markers)

    bounds = _resolve_bounds(series_points + marker_points)

    svg_lines: list[str] = []
    svg_lines.append(
        f'<svg width="{width}" height="{height}" viewBox="0 0 {width} {height}" '
        'xmlns="http://www.w3.org/2000/svg">'
    )
    svg_lines.append(f"<title>{_escape(view.why_pl)}</title>")

    if view.normative_status == NormativeStatus.FAIL:
        svg_lines.append(
            f'<rect x="0" y="0" width="{width}" height="{height}" '
            f'fill="{_FAIL_OVERLAY}" opacity="0.03" />'
        )

    svg_lines.append(
        f'<rect x="{margin_left}" y="{margin_top}" width="{plot_width}" '
        f'height="{plot_height}" fill="white" stroke="#333" stroke-width="1" />'
    )

    svg_lines.extend(
        _render_axes(
            margin_left,
            margin_top,
            plot_width,
            plot_height,
            bounds,
        )
    )

    for series in view.series:
        svg_lines.extend(
            _render_series(
                series,
                bounds,
                margin_left,
                margin_top,
                plot_width,
                plot_height,
            )
        )

    for marker in view.markers:
        svg_lines.extend(
            _render_marker(
                marker,
                bounds,
                margin_left,
                margin_top,
                plot_width,
                plot_height,
            )
        )

    svg_lines.extend(
        _render_legend(
            view,
            margin_left + plot_width + 20,
            margin_top,
        )
    )

    svg_lines.append("</svg>")
    return "\n".join(svg_lines)


def _render_axes(
    x: int,
    y: int,
    width: int,
    height: int,
    bounds: tuple[float, float, float, float],
) -> list[str]:
    min_i, max_i, min_t, max_t = bounds
    axis_lines = [
        f'<line x1="{x}" y1="{y + height}" x2="{x + width}" y2="{y + height}" '
        'stroke="#333" stroke-width="1" />',
        f'<line x1="{x}" y1="{y}" x2="{x}" y2="{y + height}" ' 'stroke="#333" stroke-width="1" />',
        f'<text x="{x}" y="{y + height + 40}" font-size="12">I [A] (log)</text>',
        f'<text x="{x - 50}" y="{y + 10}" font-size="12" '
        'transform="rotate(-90 {x - 50} {y + 10})">t [s] (log)</text>',
    ]

    ticks = 4
    for idx in range(ticks + 1):
        frac = idx / ticks
        value_i = _log_value(min_i, max_i, frac)
        value_t = _log_value(min_t, max_t, frac)
        x_pos = x + width * frac
        y_pos = y + height - height * frac
        axis_lines.append(
            f'<line x1="{_fmt(x_pos)}" y1="{y + height}" x2="{_fmt(x_pos)}" '
            f'y2="{y + height + 5}" stroke="#333" stroke-width="1" />'
        )
        axis_lines.append(
            f'<text x="{_fmt(x_pos - 5)}" y="{y + height + 20}" font-size="10">'
            f"{_format_si(value_i)}</text>"
        )
        axis_lines.append(
            f'<line x1="{x - 5}" y1="{_fmt(y_pos)}" x2="{x}" y2="{_fmt(y_pos)}" '
            'stroke="#333" stroke-width="1" />'
        )
        axis_lines.append(
            f'<text x="{x - 60}" y="{_fmt(y_pos + 4)}" font-size="10">'
            f"{_format_si(value_t)}</text>"
        )
    return axis_lines


def _render_series(
    series: ITCurveSeries,
    bounds: tuple[float, float, float, float],
    x: int,
    y: int,
    width: int,
    height: int,
) -> list[str]:
    points = sorted(series.points, key=lambda point: point.i_a)
    if not points:
        return []

    color = _series_color(series.role)
    path = []
    for idx, point in enumerate(points):
        px, py = _map_point(point, bounds, x, y, width, height)
        cmd = "M" if idx == 0 else "L"
        path.append(f"{cmd}{_fmt(px)},{_fmt(py)}")

    title = (
        f"{series.series_id} | {series.device_id} | {series.role.value} | "
        f"{series.curve_type.value} | {series.source.value}"
    )

    return [
        f"<path d=\"{' '.join(path)}\" fill=\"none\" stroke=\"{color}\" stroke-width=\"2\">",
        f"<title>{_escape(title)}</title>",
        "</path>",
    ]


def _render_marker(
    marker: ITMarker,
    bounds: tuple[float, float, float, float],
    x: int,
    y: int,
    width: int,
    height: int,
) -> list[str]:
    if marker.t_s is None:
        return []

    point = ITCurvePoint(i_a=marker.i_a, t_s=marker.t_s)
    px, py = _map_point(point, bounds, x, y, width, height)
    label = f"{marker.kind.value} | proof={marker.source_proof_id}"
    return [
        f'<circle cx="{_fmt(px)}" cy="{_fmt(py)}" r="4" fill="#000">',
        f"<title>{_escape(label)}</title>",
        "</circle>",
        f'<text x="{_fmt(px + 6)}" y="{_fmt(py - 6)}" font-size="10">'
        f"{marker.kind.value}</text>",
    ]


def _render_legend(view: ProtectionCurvesITView, x: int, y: int) -> list[str]:
    lines = [
        f'<text x="{x}" y="{y}" font-size="12" font-weight="bold">Legenda</text>',
    ]
    y_offset = y + 20

    status_color = _STATUS_COLOR.get(view.normative_status, "#333")
    lines.append(
        f'<text x="{x}" y="{y_offset}" font-size="11" fill="{status_color}">'
        f"Status: {view.normative_status.value}</text>"
    )
    y_offset += 16

    for label in _legend_series_labels(view.series):
        lines.append(f'<text x="{x}" y="{y_offset}" font-size="10">{_escape(label)}</text>')
        y_offset += 14

    if view.margins_pct:
        lines.append(
            f'<text x="{x}" y="{y_offset}" font-size="11" font-weight="bold">'
            "Marginesy [%]</text>"
        )
        y_offset += 14
        for key, value in sorted(view.margins_pct.items()):
            lines.append(f'<text x="{x}" y="{y_offset}" font-size="10">{key}: {value:.2f}%</text>')
            y_offset += 14

    if view.missing_data:
        lines.append(
            f'<text x="{x}" y="{y_offset}" font-size="11" font-weight="bold">' "missing_data</text>"
        )
        y_offset += 14
        for entry in view.missing_data:
            lines.append(f'<text x="{x}" y="{y_offset}" font-size="9">{_escape(entry)}</text>')
            y_offset += 12

    marker_only = _marker_text_list(view.markers)
    if marker_only:
        lines.append(
            f'<text x="{x}" y="{y_offset}" font-size="11" font-weight="bold">'
            "Markery (opis)</text>"
        )
        y_offset += 14
        for entry in marker_only:
            lines.append(f'<text x="{x}" y="{y_offset}" font-size="9">{_escape(entry)}</text>')
            y_offset += 12

    return lines


def _marker_text_list(markers: Iterable[ITMarker]) -> list[str]:
    lines = []
    for marker in markers:
        if marker.t_s is None:
            lines.append(f"{marker.kind.value}: {marker.i_a:.2f} (proof {marker.source_proof_id})")
    return lines


def _legend_series_labels(series: Iterable[ITCurveSeries]) -> list[str]:
    labels = []
    for item in series:
        role = item.role.value
        labels.append(f"{item.series_id} ({role})")
    return labels


def _series_color(role: ITCurveRole) -> str:
    if role == ITCurveRole.PRIMARY:
        return _PRIMARY_COLOR
    if role == ITCurveRole.BACKUP:
        return _BACKUP_COLOR
    return _UNKNOWN_COLOR


def _collect_points(series: Iterable[ITCurveSeries]) -> list[ITCurvePoint]:
    points = []
    for item in series:
        points.extend(item.points)
    return points


def _collect_marker_points(markers: Iterable[ITMarker]) -> list[ITCurvePoint]:
    points = []
    for marker in markers:
        if marker.t_s is None:
            continue
        points.append(ITCurvePoint(i_a=marker.i_a, t_s=marker.t_s))
    return points


def _resolve_bounds(points: list[ITCurvePoint]) -> tuple[float, float, float, float]:
    positive_i = [p.i_a for p in points if p.i_a > 0]
    positive_t = [p.t_s for p in points if p.t_s > 0]

    min_i = min(positive_i) if positive_i else 10.0
    max_i = max(positive_i) if positive_i else 10000.0
    min_t = min(positive_t) if positive_t else 0.01
    max_t = max(positive_t) if positive_t else 10.0

    if min_i == max_i:
        max_i = min_i * 10.0
    if min_t == max_t:
        max_t = min_t * 10.0

    return min_i, max_i, min_t, max_t


def _map_point(
    point: ITCurvePoint,
    bounds: tuple[float, float, float, float],
    x: int,
    y: int,
    width: int,
    height: int,
) -> tuple[float, float]:
    min_i, max_i, min_t, max_t = bounds
    log_min_i = math.log10(min_i)
    log_max_i = math.log10(max_i)
    log_min_t = math.log10(min_t)
    log_max_t = math.log10(max_t)

    log_i = math.log10(max(point.i_a, min_i))
    log_t = math.log10(max(point.t_s, min_t))

    frac_x = (log_i - log_min_i) / (log_max_i - log_min_i)
    frac_y = (log_t - log_min_t) / (log_max_t - log_min_t)

    px = x + frac_x * width
    py = y + height - frac_y * height
    return px, py


def _log_value(min_val: float, max_val: float, frac: float) -> float:
    log_min = math.log10(min_val)
    log_max = math.log10(max_val)
    return 10 ** (log_min + (log_max - log_min) * frac)


def _format_si(value: float) -> str:
    if value >= 1000:
        return f"{value/1000:.1f}k"
    if value < 1:
        return f"{value:.3f}"
    return f"{value:.2f}"


def _fmt(value: float) -> str:
    return f"{value:.2f}"


def _escape(text: str) -> str:
    return str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
