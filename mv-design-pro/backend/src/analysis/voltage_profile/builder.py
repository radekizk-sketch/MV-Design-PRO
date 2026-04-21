from __future__ import annotations

from analysis.normative.models import NormativeConfig
from analysis.power_flow.result import PowerFlowResult
from analysis.voltage_profile.models import (
    VoltageProfileContext,
    VoltageProfileRow,
    VoltageProfileStatus,
    VoltageProfileSummary,
    VoltageProfileView,
)
from analysis.voltage_profile.serializer import STATUS_ORDER
from network_model.core.graph import NetworkGraph


class VoltageProfileBuilder:
    def __init__(
        self,
        graph: NetworkGraph | None = None,
        context: VoltageProfileContext | None = None,
    ) -> None:
        self._graph = graph
        self._context = context

    def build(
        self,
        power_flow_result: PowerFlowResult,
        config: NormativeConfig,
    ) -> VoltageProfileView:
        node_ids = self._collect_node_ids(power_flow_result)
        rows = [self._build_row(node_id, power_flow_result, config) for node_id in node_ids]
        rows_sorted = sorted(rows, key=_row_sort_key)
        summary = _build_summary(rows_sorted)

        return VoltageProfileView(
            context=self._context,
            thresholds={
                "voltage_warn_pct": config.voltage_warn_pct,
                "voltage_fail_pct": config.voltage_fail_pct,
            },
            rows=tuple(rows_sorted),
            summary=summary,
        )

    def _collect_node_ids(self, power_flow_result: PowerFlowResult) -> list[str]:
        node_ids = set(power_flow_result.node_u_mag_pu.keys())
        node_ids.update(power_flow_result.node_voltage_kv.keys())
        if self._graph is not None:
            node_ids.update(self._graph.nodes.keys())
        return sorted(node_ids)

    def _build_row(
        self,
        node_id: str,
        power_flow_result: PowerFlowResult,
        config: NormativeConfig,
    ) -> VoltageProfileRow:
        node = self._graph.nodes.get(node_id) if self._graph else None
        bus_name = node.name if node else None
        u_nom_kv = node.voltage_level if node and node.voltage_level > 0 else None
        u_kv = power_flow_result.node_voltage_kv.get(node_id)
        u_pu = power_flow_result.node_u_mag_pu.get(node_id)

        if u_pu is None and u_kv is not None and u_nom_kv:
            u_pu = u_kv / u_nom_kv

        delta_pct = None
        status = VoltageProfileStatus.NOT_COMPUTED

        if u_kv is not None and u_nom_kv:
            delta_pct = (u_kv - u_nom_kv) / u_nom_kv * 100.0
            status = _status_from_delta(delta_pct, config)

        return VoltageProfileRow(
            bus_id=node_id,
            bus_name=bus_name,
            u_nom_kv=u_nom_kv,
            u_kv=u_kv,
            u_pu=u_pu,
            delta_pct=delta_pct,
            status=status,
            p_mw=None,
            q_mvar=None,
            case_name=self._context.case_name if self._context else None,
            run_timestamp=self._context.run_timestamp if self._context else None,
        )


def _status_from_delta(
    delta_pct: float,
    config: NormativeConfig,
) -> VoltageProfileStatus:
    warn = config.voltage_warn_pct
    fail = config.voltage_fail_pct
    abs_delta = abs(delta_pct)
    if abs_delta >= fail:
        return VoltageProfileStatus.FAIL
    if abs_delta >= warn:
        return VoltageProfileStatus.WARNING
    return VoltageProfileStatus.PASS


def _build_summary(rows: list[VoltageProfileRow]) -> VoltageProfileSummary:
    pass_count = sum(1 for row in rows if row.status == VoltageProfileStatus.PASS)
    warning_count = sum(1 for row in rows if row.status == VoltageProfileStatus.WARNING)
    fail_count = sum(1 for row in rows if row.status == VoltageProfileStatus.FAIL)
    not_computed_count = sum(1 for row in rows if row.status == VoltageProfileStatus.NOT_COMPUTED)

    computed = [
        row
        for row in rows
        if row.delta_pct is not None and row.status != VoltageProfileStatus.NOT_COMPUTED
    ]
    worst_bus_id = None
    worst_delta_pct_abs = None
    if computed:
        computed_sorted = sorted(
            computed,
            key=lambda row: (
                -abs(row.delta_pct or 0.0),
                row.bus_id,
            ),
        )
        worst = computed_sorted[0]
        worst_bus_id = worst.bus_id
        worst_delta_pct_abs = abs(worst.delta_pct or 0.0)

    return VoltageProfileSummary(
        worst_bus_id=worst_bus_id,
        worst_delta_pct_abs=worst_delta_pct_abs,
        pass_count=pass_count,
        warning_count=warning_count,
        fail_count=fail_count,
        not_computed_count=not_computed_count,
    )


def _row_sort_key(row: VoltageProfileRow) -> tuple[int, float, str]:
    abs_delta = abs(row.delta_pct) if row.delta_pct is not None else -1.0
    return (STATUS_ORDER[row.status], -abs_delta, row.bus_id)
