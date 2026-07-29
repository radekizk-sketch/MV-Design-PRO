"""
Energy validation builder.

Interprets PowerFlowResult + NetworkGraph to produce energy validation items.
This is ANALYSIS, not SOLVER - no physics calculations, only interpretation.
"""

from __future__ import annotations

import math

from analysis.energy_validation.models import (
    EnergyCheckType,
    EnergyValidationConfig,
    EnergyValidationContext,
    EnergyValidationItem,
    EnergyValidationStatus,
    EnergyValidationSummary,
    EnergyValidationView,
)
from analysis.energy_validation.serializer import STATUS_ORDER
from analysis.power_flow.result import PowerFlowResult
from network_model.core.branch import LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph


class EnergyValidationBuilder:
    def __init__(
        self,
        context: EnergyValidationContext | None = None,
    ) -> None:
        self._context = context

    def build(
        self,
        power_flow_result: PowerFlowResult,
        graph: NetworkGraph,
        config: EnergyValidationConfig,
    ) -> EnergyValidationView:
        items: list[EnergyValidationItem] = []
        items.extend(self._check_branch_loading(power_flow_result, graph, config))
        items.extend(self._check_transformer_loading(power_flow_result, graph, config))
        items.extend(self._check_voltage_deviation(power_flow_result, graph, config))
        items.extend(self._check_loss_budget(power_flow_result, graph, config))
        items.extend(self._check_reactive_balance(power_flow_result, graph))

        items_sorted = sorted(items, key=_item_sort_key)
        summary = _build_summary(items_sorted)

        return EnergyValidationView(
            context=self._context,
            config=config,
            items=tuple(items_sorted),
            summary=summary,
        )

    def _check_branch_loading(
        self,
        pf: PowerFlowResult,
        graph: NetworkGraph,
        config: EnergyValidationConfig,
    ) -> list[EnergyValidationItem]:
        items: list[EnergyValidationItem] = []
        for branch_id in sorted(graph.branches.keys()):
            branch = graph.branches[branch_id]
            if not isinstance(branch, LineBranch):
                continue
            if not branch.in_service:
                continue

            i_ka = pf.branch_current_ka.get(branch_id)
            if i_ka is None:
                items.append(
                    EnergyValidationItem(
                        check_type=EnergyCheckType.BRANCH_LOADING,
                        target_id=branch_id,
                        target_name=branch.name,
                        observed_value=None,
                        unit="%",
                        limit_warn=config.loading_warn_pct,
                        limit_fail=config.loading_fail_pct,
                        margin_pct=None,
                        status=EnergyValidationStatus.NOT_COMPUTED,
                        why_pl="Brak pradu galezi w wynikach PF.",
                    )
                )
                continue

            rated_ka = branch.rated_current_a / 1000.0
            if rated_ka <= 0:
                items.append(
                    EnergyValidationItem(
                        check_type=EnergyCheckType.BRANCH_LOADING,
                        target_id=branch_id,
                        target_name=branch.name,
                        observed_value=None,
                        unit="%",
                        limit_warn=config.loading_warn_pct,
                        limit_fail=config.loading_fail_pct,
                        margin_pct=None,
                        status=EnergyValidationStatus.NOT_COMPUTED,
                        why_pl="Brak pradu znamionowego galezi.",
                    )
                )
                continue

            loading_pct = (abs(i_ka) / rated_ka) * 100.0
            status, why = _threshold_check(
                loading_pct,
                config.loading_warn_pct,
                config.loading_fail_pct,
                "Obciazenie",
                "%",
            )
            margin = loading_pct - config.loading_fail_pct

            items.append(
                EnergyValidationItem(
                    check_type=EnergyCheckType.BRANCH_LOADING,
                    target_id=branch_id,
                    target_name=branch.name,
                    observed_value=loading_pct,
                    unit="%",
                    limit_warn=config.loading_warn_pct,
                    limit_fail=config.loading_fail_pct,
                    margin_pct=margin,
                    status=status,
                    why_pl=why,
                    white_box=_white_box_progowe(
                        "obciazenie = |I| / I_n * 100%",
                        r"\varepsilon = \frac{|I|}{I_n} \cdot 100\%",
                        f"|I| = {abs(i_ka):.4f} kA (wynik PF), I_n = {rated_ka:.4f} kA (dane galezi)",
                        rf"\varepsilon = \frac{{{abs(i_ka):.4f}}}{{{rated_ka:.4f}}} \cdot 100\% = {loading_pct:.2f}\%",
                        f"obciazenie = {loading_pct:.2f} %",
                        config.loading_warn_pct,
                        config.loading_fail_pct,
                        "%",
                        status,
                    ),
                )
            )
        return items

    def _check_transformer_loading(
        self,
        pf: PowerFlowResult,
        graph: NetworkGraph,
        config: EnergyValidationConfig,
    ) -> list[EnergyValidationItem]:
        items: list[EnergyValidationItem] = []
        for branch_id in sorted(graph.branches.keys()):
            branch = graph.branches[branch_id]
            if not isinstance(branch, TransformerBranch):
                continue
            if not branch.in_service:
                continue

            s_from = pf.branch_s_from_mva.get(branch_id)
            s_to = pf.branch_s_to_mva.get(branch_id)

            if s_from is None and s_to is None:
                items.append(
                    EnergyValidationItem(
                        check_type=EnergyCheckType.TRANSFORMER_LOADING,
                        target_id=branch_id,
                        target_name=branch.name,
                        observed_value=None,
                        unit="%",
                        limit_warn=config.loading_warn_pct,
                        limit_fail=config.loading_fail_pct,
                        margin_pct=None,
                        status=EnergyValidationStatus.NOT_COMPUTED,
                        why_pl="Brak mocy pozornej transformatora w wynikach PF.",
                    )
                )
                continue

            s_mva = max(
                abs(s_from) if s_from is not None else 0.0,
                abs(s_to) if s_to is not None else 0.0,
            )

            if branch.rated_power_mva <= 0:
                items.append(
                    EnergyValidationItem(
                        check_type=EnergyCheckType.TRANSFORMER_LOADING,
                        target_id=branch_id,
                        target_name=branch.name,
                        observed_value=None,
                        unit="%",
                        limit_warn=config.loading_warn_pct,
                        limit_fail=config.loading_fail_pct,
                        margin_pct=None,
                        status=EnergyValidationStatus.NOT_COMPUTED,
                        why_pl="Brak mocy znamionowej transformatora.",
                    )
                )
                continue

            loading_pct = (s_mva / branch.rated_power_mva) * 100.0
            status, why = _threshold_check(
                loading_pct,
                config.loading_warn_pct,
                config.loading_fail_pct,
                "Obciazenie",
                "%",
            )
            margin = loading_pct - config.loading_fail_pct

            items.append(
                EnergyValidationItem(
                    check_type=EnergyCheckType.TRANSFORMER_LOADING,
                    target_id=branch_id,
                    target_name=branch.name,
                    observed_value=loading_pct,
                    unit="%",
                    limit_warn=config.loading_warn_pct,
                    limit_fail=config.loading_fail_pct,
                    margin_pct=margin,
                    status=status,
                    why_pl=why,
                    white_box=_white_box_progowe(
                        "obciazenie = max(|S_gora|, |S_dol|) / S_n * 100%",
                        r"\varepsilon = \frac{\max(|S_{\text{gora}}|, |S_{\text{dol}}|)}{S_n} \cdot 100\%",
                        f"S = {s_mva:.4f} MVA (wynik PF), S_n = {branch.rated_power_mva:.4f} MVA",
                        rf"\varepsilon = \frac{{{s_mva:.4f}}}{{{branch.rated_power_mva:.4f}}} \cdot 100\% = {loading_pct:.2f}\%",
                        f"obciazenie = {loading_pct:.2f} %",
                        config.loading_warn_pct,
                        config.loading_fail_pct,
                        "%",
                        status,
                    ),
                )
            )
        return items

    def _check_voltage_deviation(
        self,
        pf: PowerFlowResult,
        graph: NetworkGraph,
        config: EnergyValidationConfig,
    ) -> list[EnergyValidationItem]:
        items: list[EnergyValidationItem] = []
        for node_id in sorted(graph.nodes.keys()):
            node = graph.nodes[node_id]
            u_kv = pf.node_voltage_kv.get(node_id)
            u_nom_kv = node.voltage_level

            if u_kv is None or u_nom_kv <= 0:
                items.append(
                    EnergyValidationItem(
                        check_type=EnergyCheckType.VOLTAGE_DEVIATION,
                        target_id=node_id,
                        target_name=node.name,
                        observed_value=None,
                        unit="%",
                        limit_warn=config.voltage_warn_pct,
                        limit_fail=config.voltage_fail_pct,
                        margin_pct=None,
                        status=EnergyValidationStatus.NOT_COMPUTED,
                        why_pl="Brak danych napieciowych.",
                    )
                )
                continue

            delta_pct = abs((u_kv - u_nom_kv) / u_nom_kv) * 100.0
            status, why = _threshold_check(
                delta_pct,
                config.voltage_warn_pct,
                config.voltage_fail_pct,
                "Odchylenie napieciowe",
                "%",
            )
            margin = delta_pct - config.voltage_fail_pct

            items.append(
                EnergyValidationItem(
                    check_type=EnergyCheckType.VOLTAGE_DEVIATION,
                    target_id=node_id,
                    target_name=node.name,
                    observed_value=delta_pct,
                    unit="%",
                    limit_warn=config.voltage_warn_pct,
                    limit_fail=config.voltage_fail_pct,
                    margin_pct=margin,
                    status=status,
                    why_pl=why,
                    white_box=_white_box_progowe(
                        "odchylenie = |U - U_n| / U_n * 100%",
                        r"\delta U = \frac{|U - U_n|}{U_n} \cdot 100\%",
                        f"U = {u_kv:.4f} kV (wynik PF), U_n = {u_nom_kv:.4f} kV",
                        rf"\delta U = \frac{{|{u_kv:.4f} - {u_nom_kv:.4f}|}}{{{u_nom_kv:.4f}}} \cdot 100\% = {delta_pct:.2f}\%",
                        f"odchylenie = {delta_pct:.2f} %",
                        config.voltage_warn_pct,
                        config.voltage_fail_pct,
                        "%",
                        status,
                    ),
                )
            )
        return items

    def _check_loss_budget(
        self,
        pf: PowerFlowResult,
        graph: NetworkGraph,
        config: EnergyValidationConfig,
    ) -> list[EnergyValidationItem]:
        p_loss_pu = pf.losses_total_pu.real if pf.losses_total_pu else 0.0
        p_slack_pu = pf.slack_power_pu.real if pf.slack_power_pu else 0.0

        if abs(p_slack_pu) < 1e-12:
            return [
                EnergyValidationItem(
                    check_type=EnergyCheckType.LOSS_BUDGET,
                    target_id="network",
                    target_name="Siec",
                    observed_value=None,
                    unit="%",
                    limit_warn=config.loss_warn_pct,
                    limit_fail=config.loss_fail_pct,
                    margin_pct=None,
                    status=EnergyValidationStatus.NOT_COMPUTED,
                    why_pl="Brak mocy bilansowej slack (P_slack ~ 0).",
                )
            ]

        loss_pct = abs(p_loss_pu / p_slack_pu) * 100.0
        status, why = _threshold_check(
            loss_pct,
            config.loss_warn_pct,
            config.loss_fail_pct,
            "Straty sieciowe",
            "%",
        )
        margin = loss_pct - config.loss_fail_pct

        return [
            EnergyValidationItem(
                check_type=EnergyCheckType.LOSS_BUDGET,
                target_id="network",
                target_name="Siec",
                observed_value=loss_pct,
                unit="%",
                limit_warn=config.loss_warn_pct,
                limit_fail=config.loss_fail_pct,
                margin_pct=margin,
                status=status,
                why_pl=why,
                white_box=_white_box_progowe(
                    "straty = |P_strat / P_slack| * 100%",
                    r"\Delta P\% = \left|\frac{P_{\text{strat}}}{P_{\text{slack}}}\right| \cdot 100\%",
                    f"P_strat = {p_loss_pu:.6f} p.u., P_slack = {p_slack_pu:.6f} p.u. (wynik PF)",
                    rf"\Delta P\% = \left|\frac{{{p_loss_pu:.6f}}}{{{p_slack_pu:.6f}}}\right| \cdot 100\% = {loss_pct:.2f}\%",
                    f"straty = {loss_pct:.2f} %",
                    config.loss_warn_pct,
                    config.loss_fail_pct,
                    "%",
                    status,
                ),
            )
        ]

    def _check_reactive_balance(
        self,
        pf: PowerFlowResult,
        graph: NetworkGraph,
    ) -> list[EnergyValidationItem]:
        q_slack_pu = pf.slack_power_pu.imag if pf.slack_power_pu else 0.0
        p_slack_pu = pf.slack_power_pu.real if pf.slack_power_pu else 0.0

        if abs(p_slack_pu) < 1e-12:
            return [
                EnergyValidationItem(
                    check_type=EnergyCheckType.REACTIVE_BALANCE,
                    target_id=pf.slack_node_id,
                    target_name="Slack bus",
                    observed_value=None,
                    unit="p.u.",
                    limit_warn=None,
                    limit_fail=None,
                    margin_pct=None,
                    status=EnergyValidationStatus.NOT_COMPUTED,
                    why_pl="Brak mocy bilansowej slack.",
                )
            ]

        tan_phi = abs(q_slack_pu / p_slack_pu) if abs(p_slack_pu) > 1e-12 else 0.0
        cos_phi = math.cos(math.atan(tan_phi)) if tan_phi < 1e6 else 0.0

        if cos_phi >= 0.9:
            status = EnergyValidationStatus.PASS
            why = f"cos(phi) = {cos_phi:.3f} >= 0.9 — bilans mocy biernej prawidlowy."
        elif cos_phi >= 0.8:
            status = EnergyValidationStatus.WARNING
            why = f"cos(phi) = {cos_phi:.3f} — bilans mocy biernej " "na granicy akceptowalnosci."
        else:
            status = EnergyValidationStatus.FAIL
            why = f"cos(phi) = {cos_phi:.3f} < 0.8 — " "nadmierny pobor mocy biernej z sieci."

        return [
            EnergyValidationItem(
                check_type=EnergyCheckType.REACTIVE_BALANCE,
                target_id=pf.slack_node_id,
                target_name="Slack bus",
                observed_value=cos_phi,
                unit="cos(phi)",
                limit_warn=0.9,
                limit_fail=0.8,
                margin_pct=None,
                status=status,
                why_pl=why,
                white_box=(
                    _krok(
                        "Wzor: tan(phi) = |Q_slack / P_slack|; cos(phi) = cos(arctan(tan(phi)))",
                        r"\cos\varphi = \cos\!\left(\arctan\left|\frac{Q_{\text{slack}}}{P_{\text{slack}}}\right|\right)",
                    ),
                    _krok(
                        f"Dane: Q_slack = {q_slack_pu:.6f} p.u., P_slack = {p_slack_pu:.6f} p.u. (wynik PF)"
                    ),
                    _krok(
                        f"Wynik: tan(phi) = {tan_phi:.4f}, cos(phi) = {cos_phi:.3f}",
                        rf"\tan\varphi = {tan_phi:.4f} \Rightarrow \cos\varphi = {cos_phi:.3f}",
                    ),
                    _krok("Progi: ostrzezenie cos(phi) < 0.9, przekroczenie cos(phi) < 0.8"),
                    _krok(f"Werdykt: {_WERDYKT_PL[status]}"),
                ),
            )
        ]


_WERDYKT_PL: dict[EnergyValidationStatus, str] = {
    EnergyValidationStatus.PASS: "ZGODNY",
    EnergyValidationStatus.WARNING: "OSTRZEZENIE",
    EnergyValidationStatus.FAIL: "PRZEKROCZENIE",
    EnergyValidationStatus.NOT_COMPUTED: "NIE OBLICZONO",
}


def _krok(tekst: str, latex: str | None = None) -> dict:
    """Krok sladu WHITE BOX: tekst (raporty/ASCII) + opcjonalny LaTeX (UI/KaTeX)."""
    return {"tekst": tekst, "latex": latex}


def _white_box_progowe(
    wzor: str,
    wzor_latex: str,
    dane: str,
    podstawienie_latex: str,
    wynik: str,
    warn: float,
    fail: float,
    unit: str,
    status: EnergyValidationStatus,
) -> tuple[dict, ...]:
    """Wywod WHITE BOX pozycji progowej (R2-A / K3-G1; struktura R3-D):
    wzor (LaTeX) -> dane (pochodzenie) -> podstawienie z wynikiem (LaTeX) ->
    progi -> werdykt. Ciagi deterministyczne (stale formaty); tekst ASCII-PL
    jak why_pl, matematyka w LaTeX (kanon Proof Engine)."""
    return (
        _krok(f"Wzor: {wzor}", wzor_latex),
        _krok(f"Dane: {dane}"),
        _krok(f"Wynik: {wynik}", podstawienie_latex),
        _krok(f"Progi: ostrzezenie {warn:.1f} {unit}, przekroczenie {fail:.1f} {unit}"),
        _krok(f"Werdykt: {_WERDYKT_PL[status]}"),
    )


def _threshold_check(
    value: float,
    warn: float,
    fail: float,
    label: str,
    unit: str,
) -> tuple[EnergyValidationStatus, str]:
    if value >= fail:
        return (
            EnergyValidationStatus.FAIL,
            f"{label} {value:.2f} {unit} przekracza limit {fail:.1f} {unit}.",
        )
    if value >= warn:
        return (
            EnergyValidationStatus.WARNING,
            f"{label} {value:.2f} {unit} zbliza sie do limitu {fail:.1f} {unit}.",
        )
    return (
        EnergyValidationStatus.PASS,
        f"{label} {value:.2f} {unit} ponizej limitu {warn:.1f} {unit}.",
    )


def _item_sort_key(
    item: EnergyValidationItem,
) -> tuple[int, float, str, str]:
    status_order = STATUS_ORDER.get(item.status, 3)
    margin = -(item.margin_pct or 0.0)
    return (status_order, margin, item.check_type.value, item.target_id)


def _build_summary(
    items: list[EnergyValidationItem],
) -> EnergyValidationSummary:
    pass_count = sum(1 for i in items if i.status == EnergyValidationStatus.PASS)
    warning_count = sum(1 for i in items if i.status == EnergyValidationStatus.WARNING)
    fail_count = sum(1 for i in items if i.status == EnergyValidationStatus.FAIL)
    not_computed_count = sum(1 for i in items if i.status == EnergyValidationStatus.NOT_COMPUTED)

    worst_id: str | None = None
    worst_margin: float | None = None
    for item in items:
        if item.margin_pct is not None and item.status in {
            EnergyValidationStatus.FAIL,
            EnergyValidationStatus.WARNING,
        }:
            if worst_margin is None or item.margin_pct > worst_margin:
                worst_margin = item.margin_pct
                worst_id = item.target_id

    return EnergyValidationSummary(
        pass_count=pass_count,
        warning_count=warning_count,
        fail_count=fail_count,
        not_computed_count=not_computed_count,
        worst_item_target_id=worst_id,
        worst_item_margin_pct=worst_margin,
    )
