from __future__ import annotations

from datetime import datetime

from analysis.energy_validation.models import EnergyCheckType
from analysis.energy_validation.oceny import ocena_pozycji, status_pozycji
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
from enm.nazwy_elementow import opis_bez_nazwy
from network_model.core.graph import NetworkGraph
from network_model.nazwy import nazwa_nadana


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

        return wiersz_profilu(
            bus_id=node_id,
            bus_name=bus_name,
            u_nom_kv=u_nom_kv,
            u_kv=u_kv,
            u_pu=u_pu,
            config=config,
            case_name=self._context.case_name if self._context else None,
            run_timestamp=self._context.run_timestamp if self._context else None,
        )


def wiersz_profilu(
    *,
    bus_id: str,
    bus_name: str | None,
    u_nom_kv: float | None,
    u_kv: float | None,
    u_pu: float | None,
    config: NormativeConfig,
    case_name: str | None = None,
    run_timestamp: datetime | None = None,
    p_mw: float | None = None,
    q_mvar: float | None = None,
) -> VoltageProfileRow:
    """Wiersz profilu napięć z rekordem K odchylenia napięcia — jedyne miejsce składania wiersza
    (builder i każdy konsument budujący wiersz z gotowych napięć).

    Kod zastany ``status`` jest projekcją rekordu tą samą funkcją co pozycja walidacji
    energetycznej (``analysis/energy_validation/oceny.py``): jedno rozstrzygnięcie |ΔU| wobec
    progów, także na równości z progiem przekroczenia (równość spełnia relację)."""
    delta_pct = None
    braki: tuple[str, ...] = ()
    if u_kv is not None and u_nom_kv:
        delta_pct = (u_kv - u_nom_kv) / u_nom_kv * 100.0
    elif u_kv is None:
        braki = ("napięcie szyny w wyniku rozpływu",)
    else:
        braki = ("napięcie znamionowe szyny w modelu",)

    odchylenie = abs(delta_pct) if delta_pct is not None else None
    ocena = ocena_pozycji(
        check_type=EnergyCheckType.VOLTAGE_DEVIATION,
        nazwa_pl=nazwa_nadana(bus_name) or opis_bez_nazwy("buses"),
        wynik=odchylenie,
        limit=config.voltage_fail_pct,
        braki=braki,
        slad_krok="voltage_profile.odchylenie_napiecia",
        odniesienie="analysis/voltage_profile/builder.py",
    )
    status = VoltageProfileStatus(
        status_pozycji(ocena, wynik=odchylenie, prog_ostrzezenia=config.voltage_warn_pct).value
    )
    return VoltageProfileRow(
        bus_id=bus_id,
        bus_name=bus_name,
        u_nom_kv=u_nom_kv,
        u_kv=u_kv,
        u_pu=u_pu,
        delta_pct=delta_pct,
        status=status,
        p_mw=p_mw,
        q_mvar=q_mvar,
        case_name=case_name,
        run_timestamp=run_timestamp,
        ocena=ocena,
        wyjasnienie=ocena.wyjasnienie,
    )


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
