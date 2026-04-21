from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from analysis.power_flow.types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    PVSpec,
    SlackSpec,
)


def _coerce_slack_spec(slack: SlackSpec | dict[str, Any]) -> SlackSpec:
    if isinstance(slack, SlackSpec):
        return slack
    return SlackSpec(
        node_id=str(slack.get("node_id") or ""),
        u_pu=float(slack.get("u_pu", 1.0)),
        angle_rad=float(slack.get("angle_rad", 0.0)),
    )


def _coerce_pq_specs(pq_specs: Iterable[PQSpec | dict[str, Any]] | None) -> list[PQSpec]:
    items: list[PQSpec] = []
    for spec in pq_specs or []:
        if isinstance(spec, PQSpec):
            items.append(spec)
            continue
        items.append(
            PQSpec(
                node_id=str(spec.get("node_id") or ""),
                p_mw=float(spec.get("p_mw", 0.0)),
                q_mvar=float(spec.get("q_mvar", 0.0)),
            )
        )
    return items


def _coerce_pv_specs(pv_specs: Iterable[PVSpec | dict[str, Any]] | None) -> list[PVSpec]:
    items: list[PVSpec] = []
    for spec in pv_specs or []:
        if isinstance(spec, PVSpec):
            items.append(spec)
            continue
        items.append(
            PVSpec(
                node_id=str(spec.get("node_id") or ""),
                p_mw=float(spec.get("p_mw", 0.0)),
                u_pu=float(spec.get("u_pu", 1.0)),
                q_min_mvar=float(spec.get("q_min_mvar", -1e6)),
                q_max_mvar=float(spec.get("q_max_mvar", 1e6)),
            )
        )
    return items


def _coerce_options(options: PowerFlowOptions | dict[str, Any] | None) -> PowerFlowOptions:
    if isinstance(options, PowerFlowOptions):
        return options
    return PowerFlowOptions(**(options or {}))


def build_power_flow_input(
    *,
    graph: Any,
    base_mva: float,
    slack: SlackSpec | dict[str, Any],
    pq: Iterable[PQSpec | dict[str, Any]] | None = None,
    pv: Iterable[PVSpec | dict[str, Any]] | None = None,
    options: PowerFlowOptions | dict[str, Any] | None = None,
) -> PowerFlowInput:
    return PowerFlowInput(
        graph=graph,
        base_mva=float(base_mva),
        slack=_coerce_slack_spec(slack),
        pq=_coerce_pq_specs(pq),
        pv=_coerce_pv_specs(pv),
        options=_coerce_options(options),
    )
