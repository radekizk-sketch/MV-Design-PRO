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
from analysis.obciazenie_galezi import (
    obciazenie_galezi,
    prad_zacisku_do_a,
    prad_zacisku_od_a,
)
from analysis.power_flow.result import PowerFlowResult
from enm.nazwy_elementow import nazwa_elementu
from network_model.core.branch import LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.pochodne import a_na_ka


def _znana(wartosc: float | None) -> float | None:
    """Wielkosc z wyniku rozplywu, o ile jest ZNANA (podana i skonczona).

    Solver rozplywu oznacza wezly SPOZA WYSPY WEZLA BILANSUJACEGO wartoscia NaN
    (kontrakt FROZEN, `power_flow_newton.py`: „not_solved_nodes z NaN marker";
    `BusResult.status = "not_solved"`, `v_pu = null`). Predykat `is None` tego
    znacznika NIE lapal, wiec szyna POZBAWIONA ZASILANIA dostawala od walidacji
    energetycznej werdykt PASS „Odchylenie napieciowe nan % ponizej limitu"
    (porownania z NaN sa falszywe, wiec kazdy prog „przechodzil"), a `nan`
    wychodzil w polu `observed_value` odpowiedzi JSON — literal spoza RFC 8259.
    Interpretacja znacznika nalezy do TEJ warstwy (analiza czyta wynik solvera),
    dlatego rozstrzygamy go w jednym miejscu dla WSZYSTKICH kontroli tego modulu:
    obciazenia galezi, obciazenia transformatora, odchylenia napiecia, budzetu
    strat i bilansu mocy biernej. Brak danej ma byc pozycja NOT_COMPUTED z
    powodem po polsku — nigdy wynikiem „w normie".

    Zwraca wartosc, gdy jest znana, albo `None` — dzieki temu KAZDA kontrola ma
    dalej dokladnie JEDEN warunek braku (`is None`), a znacznik NaN nie przecieka
    do arytmetyki progow.
    """
    if wartosc is None or not math.isfinite(wartosc):
        return None
    return wartosc


def _znana_zespolona(wartosc: complex | None) -> complex | None:
    """Jak `_znana`, dla wielkosci zespolonych (moce pozorne z wyniku PF)."""
    if wartosc is None or not (math.isfinite(wartosc.real) and math.isfinite(wartosc.imag)):
        return None
    return wartosc


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
        return [
            self._pozycja_obciazenia(EnergyCheckType.BRANCH_LOADING, branch_id, branch, pf, config)
            for branch_id, branch in sorted(graph.branches.items())
            if isinstance(branch, LineBranch) and branch.in_service
        ]

    def _check_transformer_loading(
        self,
        pf: PowerFlowResult,
        graph: NetworkGraph,
        config: EnergyValidationConfig,
    ) -> list[EnergyValidationItem]:
        return [
            self._pozycja_obciazenia(
                EnergyCheckType.TRANSFORMER_LOADING, branch_id, branch, pf, config
            )
            for branch_id, branch in sorted(graph.branches.items())
            if isinstance(branch, TransformerBranch) and branch.in_service
        ]

    @staticmethod
    def _pozycja_obciazenia(
        check_type: EnergyCheckType,
        branch_id: str,
        branch: LineBranch | TransformerBranch,
        pf: PowerFlowResult,
        config: EnergyValidationConfig,
    ) -> EnergyValidationItem:
        """Obciążenie linii, kabla albo transformatora — JEDNA definicja (decyzja O-51).

        ε = max(|I_od| / I_r,od ; |I_do| / I_r,do) · 100 % przez
        `analysis/obciazenie_galezi.py` (ta sama funkcja co tabela gałęzi i pasma
        wiarygodności): prąd zacisku `od` z rdzenia rozpływu, prąd zacisku `do` z mocy
        strony `to` i napięcia węzła `to`; prąd znamionowy linii z obciążalności, a
        transformatora z S_n i U_n każdej strony. Dla transformatora to definicja
        prądowa (IEC 60076-7: współczynnik obciążenia K = I / I_r) — różni się od
        dawnego max(|S|) / S_n, gdy napięcie strony odbiega od znamionowego. Brak danej
        = pozycja NOT_COMPUTED z nazwanym powodem.
        """
        wynik = obciazenie_galezi(
            branch,
            prad_od_a=prad_zacisku_od_a(pf.branch_current_ka.get(branch_id)),
            prad_do_a=prad_zacisku_do_a(
                pf.branch_s_to_mva.get(branch_id),
                pf.node_voltage_kv.get(branch.to_node_id),
            ),
        )
        if wynik.obciazenie_pct is None:
            return EnergyValidationItem(
                check_type=check_type,
                target_id=branch_id,
                target_name=nazwa_elementu(
                    branch,
                    "transformers" if isinstance(branch, TransformerBranch) else "branches",
                ),
                observed_value=None,
                unit="%",
                limit_warn=config.loading_warn_pct,
                limit_fail=config.loading_fail_pct,
                margin_pct=None,
                status=EnergyValidationStatus.NOT_COMPUTED,
                why_pl=wynik.powod_braku_pl or "",
            )
        loading_pct = wynik.obciazenie_pct
        status, why = _threshold_check(
            loading_pct,
            config.loading_warn_pct,
            config.loading_fail_pct,
            "Obciążenie",
            "%",
        )
        assert wynik.prad_od_a is not None and wynik.prad_do_a is not None
        assert wynik.prad_znamionowy_od_a is not None and wynik.prad_znamionowy_do_a is not None
        assert wynik.zacisk_decydujacy is not None
        i_od_ka = a_na_ka(abs(wynik.prad_od_a))
        i_do_ka = a_na_ka(abs(wynik.prad_do_a))
        ir_od_ka = a_na_ka(wynik.prad_znamionowy_od_a)
        ir_do_ka = a_na_ka(wynik.prad_znamionowy_do_a)
        zrodlo_znamionowych = (
            "S_n i U_n strony transformatora"
            if isinstance(branch, TransformerBranch)
            else "obciążalność gałęzi"
        )
        return EnergyValidationItem(
            check_type=check_type,
            target_id=branch_id,
            target_name=nazwa_elementu(
                branch,
                "transformers" if isinstance(branch, TransformerBranch) else "branches",
            ),
            observed_value=loading_pct,
            unit="%",
            limit_warn=config.loading_warn_pct,
            limit_fail=config.loading_fail_pct,
            margin_pct=loading_pct - config.loading_fail_pct,
            status=status,
            why_pl=why,
            white_box=_white_box_progowe(
                "obciążenie = max(|I_od| / I_r,od; |I_do| / I_r,do) · 100 %",
                r"\varepsilon = \max\left(\frac{|I_{od}|}{I_{r,od}}, "
                r"\frac{|I_{do}|}{I_{r,do}}\right) \cdot 100\%",
                f"|I_od| = {_pl(i_od_ka, 4)} kA, |I_do| = {_pl(i_do_ka, 4)} kA (wynik rozpływu), "
                f"I_r,od = {_pl(ir_od_ka, 4)} kA, I_r,do = {_pl(ir_do_ka, 4)} kA "
                f"({zrodlo_znamionowych}); decyduje zacisk "
                f"{_ZACISK_PL[wynik.zacisk_decydujacy]}",
                rf"\varepsilon = \max\left(\frac{{{i_od_ka:.4f}}}{{{ir_od_ka:.4f}}}, "
                rf"\frac{{{i_do_ka:.4f}}}{{{ir_do_ka:.4f}}}\right) \cdot 100\% "
                rf"= {loading_pct:.2f}\%",
                f"obciążenie = {_pl(loading_pct, 2)} %",
                config.loading_warn_pct,
                config.loading_fail_pct,
                "%",
                why,
            ),
        )

    def _check_voltage_deviation(
        self,
        pf: PowerFlowResult,
        graph: NetworkGraph,
        config: EnergyValidationConfig,
    ) -> list[EnergyValidationItem]:
        items: list[EnergyValidationItem] = []
        for node_id in sorted(graph.nodes.keys()):
            node = graph.nodes[node_id]
            u_kv = _znana(pf.node_voltage_kv.get(node_id))
            u_nom_kv = node.voltage_level

            if u_kv is None or u_nom_kv <= 0:
                items.append(
                    EnergyValidationItem(
                        check_type=EnergyCheckType.VOLTAGE_DEVIATION,
                        target_id=node_id,
                        target_name=nazwa_elementu(node, "buses"),
                        observed_value=None,
                        unit="%",
                        limit_warn=config.voltage_warn_pct,
                        limit_fail=config.voltage_fail_pct,
                        margin_pct=None,
                        status=EnergyValidationStatus.NOT_COMPUTED,
                        why_pl="Brak danych napięciowych.",
                    )
                )
                continue

            delta_pct = abs((u_kv - u_nom_kv) / u_nom_kv) * 100.0
            status, why = _threshold_check(
                delta_pct,
                config.voltage_warn_pct,
                config.voltage_fail_pct,
                "Odchylenie napięcia",
                "%",
            )
            margin = delta_pct - config.voltage_fail_pct

            items.append(
                EnergyValidationItem(
                    check_type=EnergyCheckType.VOLTAGE_DEVIATION,
                    target_id=node_id,
                    target_name=nazwa_elementu(node, "buses"),
                    observed_value=delta_pct,
                    unit="%",
                    limit_warn=config.voltage_warn_pct,
                    limit_fail=config.voltage_fail_pct,
                    margin_pct=margin,
                    status=status,
                    why_pl=why,
                    white_box=_white_box_progowe(
                        "odchylenie = |U − U_n| / U_n · 100 %",
                        r"\delta U = \frac{|U - U_n|}{U_n} \cdot 100\%",
                        f"U = {_pl(u_kv, 4)} kV (wynik rozpływu), U_n = {_pl(u_nom_kv, 4)} kV",
                        rf"\delta U = \frac{{|{u_kv:.4f} - {u_nom_kv:.4f}|}}{{{u_nom_kv:.4f}}} \cdot 100\% = {delta_pct:.2f}\%",
                        f"odchylenie = {_pl(delta_pct, 2)} %",
                        config.voltage_warn_pct,
                        config.voltage_fail_pct,
                        "%",
                        why,
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
        straty_pu = _znana_zespolona(pf.losses_total_pu)
        moc_slack_pu = _znana_zespolona(pf.slack_power_pu)
        p_loss_pu = straty_pu.real if straty_pu else 0.0
        p_slack_pu = moc_slack_pu.real if moc_slack_pu else 0.0

        if straty_pu is None or moc_slack_pu is None or abs(p_slack_pu) < 1e-12:
            return [
                EnergyValidationItem(
                    check_type=EnergyCheckType.LOSS_BUDGET,
                    target_id="network",
                    target_name="Sieć",
                    observed_value=None,
                    unit="%",
                    limit_warn=config.loss_warn_pct,
                    limit_fail=config.loss_fail_pct,
                    margin_pct=None,
                    status=EnergyValidationStatus.NOT_COMPUTED,
                    why_pl=(
                        "Bilans strat nieoznaczony w wyniku rozpływu (wartość nieokreślona)."
                        if (straty_pu is None or moc_slack_pu is None)
                        else "Brak mocy bilansowej węzła bilansującego (P ≈ 0)."
                    ),
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
                target_name="Sieć",
                observed_value=loss_pct,
                unit="%",
                limit_warn=config.loss_warn_pct,
                limit_fail=config.loss_fail_pct,
                margin_pct=margin,
                status=status,
                why_pl=why,
                white_box=_white_box_progowe(
                    "straty = |P_strat / P_bil| · 100 %",
                    r"\Delta P\% = \left|\frac{P_{\text{strat}}}{P_{\text{slack}}}\right| \cdot 100\%",
                    f"P_strat = {_pl(p_loss_pu, 6)} j.w., P_bil = {_pl(p_slack_pu, 6)} j.w. "
                    "(wynik rozpływu, węzeł bilansujący)",
                    rf"\Delta P\% = \left|\frac{{{p_loss_pu:.6f}}}{{{p_slack_pu:.6f}}}\right| \cdot 100\% = {loss_pct:.2f}\%",
                    f"straty = {_pl(loss_pct, 2)} %",
                    config.loss_warn_pct,
                    config.loss_fail_pct,
                    "%",
                    why,
                ),
            )
        ]

    def _check_reactive_balance(
        self,
        pf: PowerFlowResult,
        graph: NetworkGraph,
    ) -> list[EnergyValidationItem]:
        moc_slack_pu = _znana_zespolona(pf.slack_power_pu)
        q_slack_pu = moc_slack_pu.imag if moc_slack_pu else 0.0
        p_slack_pu = moc_slack_pu.real if moc_slack_pu else 0.0

        if moc_slack_pu is None or abs(p_slack_pu) < 1e-12:
            return [
                EnergyValidationItem(
                    check_type=EnergyCheckType.REACTIVE_BALANCE,
                    target_id=pf.slack_node_id,
                    target_name="Węzeł bilansujący",
                    observed_value=None,
                    unit="p.u.",
                    limit_warn=None,
                    limit_fail=None,
                    margin_pct=None,
                    status=EnergyValidationStatus.NOT_COMPUTED,
                    why_pl=(
                        "Moc węzła bilansującego nieoznaczona w wyniku rozpływu (wartość "
                        "nieokreślona)."
                        if moc_slack_pu is None
                        else "Brak mocy bilansowej węzła bilansującego."
                    ),
                )
            ]

        tan_phi = abs(q_slack_pu / p_slack_pu) if abs(p_slack_pu) > 1e-12 else 0.0
        cos_phi = math.cos(math.atan(tan_phi)) if tan_phi < 1e6 else 0.0

        if cos_phi >= 0.9:
            status = EnergyValidationStatus.PASS
            why = f"cosφ = {_pl(cos_phi, 3)} ≥ 0,9 — bilans mocy biernej prawidłowy."
        elif cos_phi >= 0.8:
            status = EnergyValidationStatus.WARNING
            why = f"cosφ = {_pl(cos_phi, 3)} — bilans mocy biernej na granicy akceptowalności."
        else:
            status = EnergyValidationStatus.FAIL
            why = f"cosφ = {_pl(cos_phi, 3)} < 0,8 — nadmierny pobór mocy biernej z sieci."

        return [
            EnergyValidationItem(
                check_type=EnergyCheckType.REACTIVE_BALANCE,
                target_id=pf.slack_node_id,
                target_name="Węzeł bilansujący",
                observed_value=cos_phi,
                unit="cos(phi)",
                limit_warn=0.9,
                limit_fail=0.8,
                margin_pct=None,
                status=status,
                why_pl=why,
                white_box=(
                    _krok(
                        "Wzór: tgφ = |Q_bil / P_bil|; cosφ = cos(arctg(tgφ))",
                        r"\cos\varphi = \cos\!\left(\arctan\left|\frac{Q_{\text{slack}}}{P_{\text{slack}}}\right|\right)",
                    ),
                    _krok(
                        f"Dane: Q_bil = {_pl(q_slack_pu, 6)} j.w., P_bil = {_pl(p_slack_pu, 6)} j.w. "
                        "(wynik rozpływu, węzeł bilansujący)"
                    ),
                    _krok(
                        f"Wynik: tgφ = {_pl(tan_phi, 4)}, cosφ = {_pl(cos_phi, 3)}",
                        rf"\tan\varphi = {tan_phi:.4f} \Rightarrow \cos\varphi = {cos_phi:.3f}",
                    ),
                    _krok("Progi: ostrzeżenie cosφ < 0,9, przekroczenie cosφ < 0,8"),
                    _krok(f"Porównanie z progami: {why}"),
                ),
            )
        ]


def _pl(wartosc: float, cyfry: int) -> str:
    """Liczba o stałej liczbie cyfr po przecinku, zapis polski (przecinek dziesiętny)."""
    return f"{wartosc:.{cyfry}f}".replace(".", ",")


#: Zacisk decydujący o obciążeniu gałęzi (`obciazenie_galezi.zacisk_decydujacy`).
_ZACISK_PL: dict[str, str] = {"od": "początkowy", "do": "końcowy"}


def _krok(tekst: str, latex: str | None = None) -> dict:
    """Krok śladu WHITE BOX: tekst po polsku (raporty i ekran) + opcjonalny LaTeX (KaTeX)."""
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
    porownanie: str,
) -> tuple[dict, ...]:
    """Wywod WHITE BOX pozycji progowej (R2-A / K3-G1; struktura R3-D):
    wzor (LaTeX) -> dane (pochodzenie) -> podstawienie z wynikiem (LaTeX) ->
    progi -> porównanie z progami (to samo zdanie co `why_pl`, z liczbami; bez etykiety
    statusu — karta #145, kontrakt werdyktu wyjaśnialnego). Ciągi deterministyczne (stałe formaty); tekst po polsku z
    przecinkiem dziesiętnym jak why_pl (karta #145), matematyka w LaTeX (kanon Proof
    Engine)."""
    return (
        _krok(f"Wzór: {wzor}", wzor_latex),
        _krok(f"Dane: {dane}"),
        _krok(f"Wynik: {wynik}", podstawienie_latex),
        _krok(f"Progi: ostrzeżenie {_pl(warn, 1)} {unit}, przekroczenie {_pl(fail, 1)} {unit}"),
        _krok(f"Porównanie z progami: {porownanie}"),
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
            f"{label} {_pl(value, 2)} {unit} przekracza limit {_pl(fail, 1)} {unit}.",
        )
    if value >= warn:
        return (
            EnergyValidationStatus.WARNING,
            f"{label} {_pl(value, 2)} {unit} zbliża się do limitu {_pl(fail, 1)} {unit}.",
        )
    return (
        EnergyValidationStatus.PASS,
        f"{label} {_pl(value, 2)} {unit} poniżej limitu {_pl(warn, 1)} {unit}.",
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
