"""Builder analizy adekwatnosci mocy biernej (D-06d) — warstwa interpretacji (Z15).

Czysta interpretacja gotowych wynikow: NIE liczy fizyki (napiecia |V| pochodza z
solvera power-flow, granice Q z karty/regulatora), wylicza rezerwy biernej per
zrodlo, bilans bierny i naruszenia napiecia, oraz wydaje werdykt z pelnym wywodem
White Box (Wzor→Dane→Podstawienie→Wynik→Jednostka).

Granica warstw (arch_guard): moduł konsumuje plain dataclass'y wejscia (napiecia
z power-flow + granice Q zrodel) — NIE importuje solvera. Proweniencja jest
kompozycja jakosci pol Q-granic (jak SSCI), liczona przez warstwe application
przez ``resolve_card_field_quality_map`` i podana w ``SourceReactiveInput``.

Werdykty (PL):
  - "wystarczajaca rezerwa Q": brak nasyconych zrodel i brak naruszen napiecia,
  - "rezerwa Q wyczerpana": >=1 zrodlo nasycone LUB >=1 wezel z naruszeniem,
  - "dane niekompletne": brak wyniku power-flow lub brak granic zrodla.

ZAKRES (D-06d) celowo NIE obejmuje (odroczone):
  - rekomendacji konkretnej mocy kompensacji [Mvar] do usuniecia naruszenia
    (wymaga czulosci dV/dQ — osobny przyszly element; brak fabrykowania doboru),
  - modelowania baterii kondensatorow (to D-06c, osobny element),
  - modyfikacji jakiegokolwiek solvera.
"""

from __future__ import annotations

from collections.abc import Iterable

from analysis.reactive_adequacy.models import (
    DEFAULT_SATURATION_TOL_MVAR,
    DEFAULT_U_MAX_PU,
    DEFAULT_U_MIN_PU,
    VERDICT_ADEQUATE,
    VERDICT_EXHAUSTED,
    VERDICT_NO_DATA,
    BusVoltageInput,
    LoadReactiveInput,
    ProvenanceTag,
    ReactiveAdequacyContext,
    ReactiveAdequacySummary,
    ReactiveAdequacyView,
    ReactiveBalance,
    SourceReactiveEntry,
    SourceReactiveInput,
    VoltageViolationEntry,
    WhiteBoxStep,
    compute_reactive_adequacy_id,
    worst_field_quality,
)


def _round(value: float, digits: int = 4) -> float:
    return round(float(value), digits)


class ReactiveAdequacyBuilder:
    """Wydaje werdykt adekwatnosci mocy biernej z wywodem White Box."""

    def __init__(
        self,
        saturation_tol_mvar: float = DEFAULT_SATURATION_TOL_MVAR,
        default_u_min_pu: float = DEFAULT_U_MIN_PU,
        default_u_max_pu: float = DEFAULT_U_MAX_PU,
    ) -> None:
        if saturation_tol_mvar < 0.0:
            raise ValueError("saturation_tol_mvar nie moze byc ujemny")
        if default_u_min_pu >= default_u_max_pu:
            raise ValueError("default_u_min_pu musi byc mniejszy niz default_u_max_pu")
        self.saturation_tol_mvar = float(saturation_tol_mvar)
        self.default_u_min_pu = float(default_u_min_pu)
        self.default_u_max_pu = float(default_u_max_pu)

    def build(
        self,
        buses: Iterable[BusVoltageInput],
        sources: Iterable[SourceReactiveInput],
        loads: Iterable[LoadReactiveInput] | None = None,
        context: ReactiveAdequacyContext | None = None,
        *,
        power_flow_converged: bool = True,
    ) -> ReactiveAdequacyView:
        """Buduje widok adekwatnosci.

        Args:
            buses: napiecia wezlow z power-flow + pasma dopuszczalne.
            sources: regulowalne zrodla mocy biernej (Q_actual, Q_min, Q_max).
            loads: pobor mocy biernej odbiorow (do bilansu); opcjonalny.
            context: kontekst raportu (deterministyczny identyfikator).
            power_flow_converged: gdy False — brak wiarygodnych |V|, werdykt
                "dane niekompletne" (brak fabrykowania na rozbieznym wyniku).
        """
        ordered_buses = sorted(buses, key=lambda b: b.bus_ref)
        ordered_sources = sorted(sources, key=lambda s: s.ref)
        ordered_loads = sorted(loads or [], key=lambda load: load.ref)

        # --- Przeplyw "dane niekompletne": brak wyniku power-flow / brak zrodel.
        top_missing = self._top_level_missing(ordered_buses, ordered_sources, power_flow_converged)

        source_entries = tuple(self._build_source(s) for s in ordered_sources)
        violations = self._build_violations(ordered_buses)
        balance = self._build_balance(ordered_sources, ordered_loads)
        provenance = self._build_provenance(ordered_sources)

        saturated = tuple(s.ref for s in source_entries if s.is_saturated)
        not_computed = sum(1 for s in source_entries if s.missing_data)
        violated_buses = tuple(v.bus_ref for v in violations)

        # Rezerwa systemowa — suma rezerw z NIENASYCONYCH zrodel (nasycone nie
        # daja dostepnej rezerwy w kierunku nasycenia).
        net_up = self._network_headroom(source_entries, "headroom_up_mvar")
        net_down = self._network_headroom(source_entries, "headroom_down_mvar")

        summary = ReactiveAdequacySummary(
            total_sources=len(source_entries),
            saturated_source_count=len(saturated),
            not_computed_source_count=not_computed,
            voltage_violation_count=len(violations),
            network_headroom_up_mvar=net_up,
            network_headroom_down_mvar=net_down,
            saturated_source_refs=saturated,
            violated_bus_refs=violated_buses,
        )

        verdict, is_adequate, why = self._classify(
            top_missing=top_missing,
            saturated=saturated,
            violations=violations,
            net_up=net_up,
            net_down=net_down,
            provenance=provenance,
        )

        analysis_id = compute_reactive_adequacy_id(
            context,
            self.saturation_tol_mvar,
            self.default_u_min_pu,
            self.default_u_max_pu,
            verdict,
            source_entries,
            violations,
            balance,
            summary,
            provenance,
            top_missing,
        )

        return ReactiveAdequacyView(
            analysis_id=analysis_id,
            context=context,
            saturation_tol_mvar=self.saturation_tol_mvar,
            default_u_min_pu=self.default_u_min_pu,
            default_u_max_pu=self.default_u_max_pu,
            verdict=verdict,
            is_adequate=is_adequate,
            why_pl=why,
            sources=source_entries,
            voltage_violations=violations,
            balance=balance,
            summary=summary,
            provenance=provenance,
            missing_data=top_missing,
        )

    # ------------------------------------------------------------------

    def _top_level_missing(
        self,
        buses: list[BusVoltageInput],
        sources: list[SourceReactiveInput],
        converged: bool,
    ) -> tuple[str, ...]:
        missing: list[str] = []
        if not converged:
            missing.append("power_flow_not_converged")
        # Brak wyniku power-flow: zaden wezel nie ma rozwiazanego |V|.
        if not any(b.v_pu is not None for b in buses):
            missing.append("bus_voltages")
        if not sources:
            missing.append("controllable_sources")
        return tuple(missing)

    # --- per zrodlo ------------------------------------------------------

    def _build_source(self, item: SourceReactiveInput) -> SourceReactiveEntry:
        missing: list[str] = []
        if item.q_actual_mvar is None:
            missing.append("q_actual_mvar")
        if item.q_min_mvar is None:
            missing.append("q_min_mvar")
        if item.q_max_mvar is None:
            missing.append("q_max_mvar")

        if missing:
            why = (
                "Dane niekompletne — brak: "
                + ", ".join(missing)
                + ". Ocena rezerwy biernej wymaga aktualnego Q (z wyniku "
                "power-flow) oraz granic regulatora Q_min/Q_max zrodla."
            )
            return SourceReactiveEntry(
                ref=item.ref,
                bus_ref=item.bus_ref,
                q_actual_mvar=item.q_actual_mvar,
                q_min_mvar=item.q_min_mvar,
                q_max_mvar=item.q_max_mvar,
                headroom_up_mvar=None,
                headroom_down_mvar=None,
                is_saturated=False,
                at_limit_pl=None,
                why_pl=why,
                missing_data=tuple(missing),
                white_box=(),
            )

        q = float(item.q_actual_mvar)  # type: ignore[arg-type]
        q_min = float(item.q_min_mvar)  # type: ignore[arg-type]
        q_max = float(item.q_max_mvar)  # type: ignore[arg-type]
        if q_min > q_max:
            why = (
                f"Dane niespojne — Q_min = {_round(q_min)} Mvar > "
                f"Q_max = {_round(q_max)} Mvar. Granice regulatora musza spelniac "
                "Q_min <= Q_max."
            )
            return SourceReactiveEntry(
                ref=item.ref,
                bus_ref=item.bus_ref,
                q_actual_mvar=_round(q),
                q_min_mvar=_round(q_min),
                q_max_mvar=_round(q_max),
                headroom_up_mvar=None,
                headroom_down_mvar=None,
                is_saturated=False,
                at_limit_pl=None,
                why_pl=why,
                missing_data=("q_limits_inconsistent",),
                white_box=(),
            )

        headroom_up = _round(q_max - q)
        headroom_down = _round(q - q_min)
        at_upper = (q_max - q) <= self.saturation_tol_mvar
        at_lower = (q - q_min) <= self.saturation_tol_mvar
        is_saturated = at_upper or at_lower
        # Przy zdegenerowanym zakresie (Q_min==Q_max) zrodlo nie reguluje Q —
        # oba kierunki przy granicy; raportujemy Q_max (gorny limit wstrzykiwania).
        at_limit = "Q_max" if at_upper else ("Q_min" if at_lower else None)

        if is_saturated and at_limit == "Q_max":
            why = (
                f"Zrodlo nasycone przy Q_max = {_round(q_max)} Mvar "
                f"(Q_actual = {_round(q)} Mvar; rezerwa w gore = {headroom_up} Mvar "
                f"<= tol {self.saturation_tol_mvar}). Brak dalszej rezerwy do "
                "wstrzykiwania mocy biernej (podtrzymania napiecia w gore)."
            )
        elif is_saturated and at_limit == "Q_min":
            why = (
                f"Zrodlo nasycone przy Q_min = {_round(q_min)} Mvar "
                f"(Q_actual = {_round(q)} Mvar; rezerwa w dol = {headroom_down} Mvar "
                f"<= tol {self.saturation_tol_mvar}). Brak dalszej rezerwy do "
                "absorpcji mocy biernej (obnizenia napiecia)."
            )
        else:
            why = (
                f"Zrodlo w obszarze regulacji: Q_actual = {_round(q)} Mvar w zakresie "
                f"[{_round(q_min)}; {_round(q_max)}] Mvar. Rezerwa w gore = "
                f"{headroom_up} Mvar, w dol = {headroom_down} Mvar."
            )

        white_box = (
            WhiteBoxStep(
                symbol="ΔQ↑",
                formula_latex=r"\Delta Q_{\uparrow} = Q_{max} - Q_{akt}",
                substitution_pl=f"ΔQ↑ = {_round(q_max)} − {_round(q)}",
                result_pl=f"ΔQ↑ = {headroom_up} Mvar (rezerwa do wstrzykiwania)",
                unit_check_pl="Mvar − Mvar = Mvar; ΔQ↑ >= 0 w obszarze regulacji.",
            ),
            WhiteBoxStep(
                symbol="ΔQ↓",
                formula_latex=r"\Delta Q_{\downarrow} = Q_{akt} - Q_{min}",
                substitution_pl=f"ΔQ↓ = {_round(q)} − {_round(q_min)}",
                result_pl=f"ΔQ↓ = {headroom_down} Mvar (rezerwa do absorpcji)",
                unit_check_pl="Mvar − Mvar = Mvar; ΔQ↓ >= 0 w obszarze regulacji.",
            ),
            WhiteBoxStep(
                symbol="nasycenie",
                formula_latex=(
                    r"\text{nasycenie} \Leftarrow \Delta Q_{\uparrow} \leq \varepsilon "
                    r"\vee \Delta Q_{\downarrow} \leq \varepsilon"
                ),
                substitution_pl=(
                    f"ε = {self.saturation_tol_mvar} Mvar; "
                    f"ΔQ↑ = {headroom_up}, ΔQ↓ = {headroom_down}"
                ),
                result_pl=(
                    f"zrodlo nasycone przy {at_limit}"
                    if is_saturated
                    else "zrodlo w obszarze regulacji (nienasycone)"
                ),
                unit_check_pl="porownanie rezerwy [Mvar] z tolerancja [Mvar].",
            ),
        )
        return SourceReactiveEntry(
            ref=item.ref,
            bus_ref=item.bus_ref,
            q_actual_mvar=_round(q),
            q_min_mvar=_round(q_min),
            q_max_mvar=_round(q_max),
            headroom_up_mvar=headroom_up,
            headroom_down_mvar=headroom_down,
            is_saturated=is_saturated,
            at_limit_pl=at_limit,
            why_pl=why,
            missing_data=(),
            white_box=white_box,
        )

    # --- naruszenia napiecia --------------------------------------------

    def _build_violations(self, buses: list[BusVoltageInput]) -> tuple[VoltageViolationEntry, ...]:
        out: list[VoltageViolationEntry] = []
        for b in buses:
            if b.v_pu is None:
                continue  # wezel nierozwiazany — brak |V| do oceny
            v = float(b.v_pu)
            u_min = float(b.u_min_pu) if b.u_min_pu is not None else self.default_u_min_pu
            u_max = float(b.u_max_pu) if b.u_max_pu is not None else self.default_u_max_pu
            if v > u_max:
                dev = _round(v - u_max)
                kind = "przekroczenie U_max"
                why = (
                    f"|V| = {_round(v)} p.u. > U_max = {_round(u_max)} p.u. w wezle "
                    f"{b.bus_ref}; przekroczenie o {dev} p.u. Wskazuje na nadmiar "
                    "mocy biernej / potrzebe absorpcji Q."
                )
            elif v < u_min:
                dev = _round(v - u_min)  # ujemne
                kind = "ponizej U_min"
                why = (
                    f"|V| = {_round(v)} p.u. < U_min = {_round(u_min)} p.u. w wezle "
                    f"{b.bus_ref}; niedobor {dev} p.u. Wskazuje na niedobor mocy "
                    "biernej / potrzebe wstrzykiwania Q (podtrzymania napiecia)."
                )
            else:
                continue
            white_box = (
                WhiteBoxStep(
                    symbol="ΔU",
                    formula_latex=(r"\Delta U = |V| - U_{max}\ (\text{lub}\ |V| - U_{min})"),
                    substitution_pl=(
                        f"|V| = {_round(v)} p.u.; pasmo [{_round(u_min)}; " f"{_round(u_max)}] p.u."
                    ),
                    result_pl=f"ΔU = {dev} p.u. ({kind})",
                    unit_check_pl="p.u. − p.u. = p.u.; znak + powyzej U_max, − ponizej U_min.",
                ),
            )
            out.append(
                VoltageViolationEntry(
                    bus_ref=b.bus_ref,
                    v_pu=_round(v),
                    u_min_pu=_round(u_min),
                    u_max_pu=_round(u_max),
                    deviation_pu=dev,
                    kind_pl=kind,
                    why_pl=why,
                    white_box=white_box,
                )
            )
        return tuple(out)

    # --- bilans bierny ---------------------------------------------------

    def _build_balance(
        self, sources: list[SourceReactiveInput], loads: list[LoadReactiveInput]
    ) -> ReactiveBalance:
        q_actuals = [float(s.q_actual_mvar) for s in sources if s.q_actual_mvar is not None]
        q_loads = [float(load.q_mvar) for load in loads if load.q_mvar is not None]

        if not q_actuals and not q_loads:
            return ReactiveBalance(
                q_generated_mvar=None,
                q_absorbed_by_sources_mvar=None,
                q_load_mvar=None,
                net_source_q_mvar=None,
                white_box=(),
            )

        q_gen = _round(sum(q for q in q_actuals if q > 0.0))
        q_abs = _round(sum(-q for q in q_actuals if q < 0.0))
        q_load = _round(sum(q_loads))
        net_source = _round(sum(q_actuals))
        white_box = (
            WhiteBoxStep(
                symbol="ΣQ_zrodla",
                formula_latex=r"\sum Q_{zrodla} = \sum_i Q_{akt,i}",
                substitution_pl=(
                    f"Q_gen(+) = {q_gen} Mvar; Q_abs(−) = {q_abs} Mvar; "
                    f"netto = {net_source} Mvar"
                ),
                result_pl=f"ΣQ_zrodla(netto) = {net_source} Mvar",
                unit_check_pl="suma Mvar = Mvar; (+) generacja, (−) absorpcja.",
            ),
            WhiteBoxStep(
                symbol="ΣQ_odbiory",
                formula_latex=r"\sum Q_{odbiory} = \sum_j Q_{odb,j}",
                substitution_pl=f"liczba odbiorow z Q = {len(q_loads)}",
                result_pl=f"ΣQ_odbiory = {q_load} Mvar",
                unit_check_pl="suma Mvar = Mvar; (+) pobor Q indukcyjny.",
            ),
        )
        return ReactiveBalance(
            q_generated_mvar=q_gen,
            q_absorbed_by_sources_mvar=q_abs,
            q_load_mvar=q_load,
            net_source_q_mvar=net_source,
            white_box=white_box,
        )

    # --- rezerwa systemowa ----------------------------------------------

    @staticmethod
    def _network_headroom(entries: tuple[SourceReactiveEntry, ...], attr: str) -> float | None:
        vals = [
            getattr(e, attr) for e in entries if not e.is_saturated and getattr(e, attr) is not None
        ]
        if not vals:
            return None
        return _round(sum(vals))

    # --- proweniencja ----------------------------------------------------

    def _build_provenance(self, sources: list[SourceReactiveInput]) -> ProvenanceTag | None:
        """Najgorsza jakosc pol Q-granic, od ktorych zalezal werdykt.

        Jakosc per zrodlo (``limits_field_quality``) liczy warstwa application
        przez ``resolve_card_field_quality_map`` (najgorsza z pol Q-granic karty).
        Tu jedynie KOMPONUJEMY najgorsza po wszystkich zrodlach (jak SSCI).
        """
        qualities = [s.limits_field_quality for s in sources if s.limits_field_quality is not None]
        if not qualities:
            return None
        from solver_input.provenance import FieldQuality

        worst = worst_field_quality(qualities)
        if worst is None:
            return None
        is_estimated = worst is FieldQuality.ESTIMATED
        if is_estimated:
            tag_pl = "werdykt oparty na oszacowanych granicach mocy biernej zrodla"
        elif worst is FieldQuality.SYSTEM_DEFAULT:
            tag_pl = "werdykt oparty na domyslnych granicach mocy biernej zrodla"
        else:  # DATASHEET
            tag_pl = "werdykt oparty na granicach mocy biernej z karty technicznej"
        return ProvenanceTag(
            worst_quality=worst.value,
            worst_quality_label_pl=worst.label_pl,
            is_estimated=is_estimated,
            tag_pl=tag_pl,
        )

    # --- klasyfikacja werdyktu ------------------------------------------

    def _classify(
        self,
        *,
        top_missing: tuple[str, ...],
        saturated: tuple[str, ...],
        violations: tuple[VoltageViolationEntry, ...],
        net_up: float | None,
        net_down: float | None,
        provenance: ProvenanceTag | None,
    ) -> tuple[str, bool, str]:
        if top_missing:
            why = (
                "Werdykt niemozliwy — dane niekompletne: "
                + ", ".join(top_missing)
                + ". Ocena adekwatnosci mocy biernej wymaga zbieznego wyniku "
                "power-flow (napiecia |V|) oraz co najmniej jednego regulowalnego "
                "zrodla z granicami Q."
            )
            return VERDICT_NO_DATA, False, why

        if saturated or violations:
            parts: list[str] = []
            if saturated:
                parts.append("zrodla nasycone: " + ", ".join(saturated))
            if violations:
                parts.append(
                    "wezly z naruszeniem napiecia: " + ", ".join(v.bus_ref for v in violations)
                )
            why = (
                "Rezerwa Q wyczerpana — "
                + "; ".join(parts)
                + ". "
                + self._headroom_phrase(net_up, net_down)
            )
            why = self._append_provenance(why, provenance)
            return VERDICT_EXHAUSTED, False, why

        why = (
            "Wystarczajaca rezerwa Q — zaden regulowalny zrodlo nie jest nasycone "
            "i zaden wezel nie narusza pasma napieciowego. "
            + self._headroom_phrase(net_up, net_down)
        )
        why = self._append_provenance(why, provenance)
        return VERDICT_ADEQUATE, True, why

    @staticmethod
    def _headroom_phrase(net_up: float | None, net_down: float | None) -> str:
        up = f"{net_up} Mvar" if net_up is not None else "brak (wszystkie zrodla nasycone w gore)"
        down = (
            f"{net_down} Mvar" if net_down is not None else "brak (wszystkie zrodla nasycone w dol)"
        )
        return f"Rezerwa systemowa z nienasyconych zrodel: w gore = {up}, w dol = {down}."

    @staticmethod
    def _append_provenance(why: str, provenance: ProvenanceTag | None) -> str:
        if provenance is not None and provenance.is_estimated:
            why += f" Uwaga proweniencji: {provenance.tag_pl}."
        return why
