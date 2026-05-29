"""Builder werdyktu stabilności SSCI — warstwa interpretacji (Z15).

Czysta interpretacja gotowego wyniku solvera D-03 SSCI: NIE liczy fizyki
(tablice ``z_grid(f)``/``z_conv(f)``/``L(f)`` pochodzą z solvera), wylicza
metryki kryterium impedancyjnego Nyquista (Sun 2011, Wen 2016) i wydaje werdykt
z pełnym wywodem White Box (Wzór→Dane→Podstawienie→Wynik→Jednostka).

Granica warstw (arch_guard): moduł konsumuje ZSERIALIZOWANY słownik wyniku
solvera (``result["result"]``) oraz kartę przekształtnika (``ConverterType``)
do proweniencji — NIE importuje solvera.
"""

from __future__ import annotations

from typing import Any

from analysis.ssci_stability.models import (
    DEFAULT_GAIN_CROSSOVER_MAG,
    DEFAULT_PM_RISK_DEG,
    DEFAULT_PM_UNSTABLE_DEG,
    SOLVER_INCOMPLETE_STATUS,
    SSCI_MANDATORY_FIELDS,
    SSCI_OPTIONAL_FIELDS,
    VERDICT_NO_DATA,
    VERDICT_RISK,
    VERDICT_STABLE,
    VERDICT_UNSTABLE,
    CrossoverPoint,
    NyquistPoint,
    ProvenanceTag,
    SsciStabilityContext,
    SsciStabilityVerdict,
    SsciStabilityView,
    WhiteBoxStep,
    compute_ssci_stability_id,
    worst_field_quality,
)


def _round(value: float, digits: int = 4) -> float:
    return round(float(value), digits)


def _phase_margin(phase_deg: float) -> float:
    """Margines różnicy faz Δφ = 180° − |∠L| (kryterium fazowe Sun 2011)."""
    return 180.0 - abs(phase_deg)


class SsciStabilityBuilder:
    """Wydaje werdykt stabilności SSCI z wywodem White Box."""

    def __init__(
        self,
        gain_crossover_mag: float = DEFAULT_GAIN_CROSSOVER_MAG,
        pm_risk_deg: float = DEFAULT_PM_RISK_DEG,
        pm_unstable_deg: float = DEFAULT_PM_UNSTABLE_DEG,
    ) -> None:
        if pm_unstable_deg > pm_risk_deg:
            raise ValueError("pm_unstable_deg nie może być większy niż pm_risk_deg")
        self.gain_crossover_mag = float(gain_crossover_mag)
        self.pm_risk_deg = float(pm_risk_deg)
        self.pm_unstable_deg = float(pm_unstable_deg)

    def build(
        self,
        solver_payload: dict[str, Any],
        converter: Any | None = None,
        context: SsciStabilityContext | None = None,
    ) -> SsciStabilityView:
        """Buduje widok werdyktu z gotowego payloadu solvera.

        Args:
            solver_payload: ``result["result"]`` z solvera SSCI (zserializowany).
            converter: karta przekształtnika (``ConverterType``) do proweniencji;
                opcjonalna — przy braku werdykt nie nosi etykiety jakości.
            context: kontekst raportu (deterministyczny identyfikator).
        """
        verdict = self._build_verdict(solver_payload, converter)
        analysis_id = compute_ssci_stability_id(
            context,
            self.gain_crossover_mag,
            self.pm_risk_deg,
            self.pm_unstable_deg,
            verdict,
        )
        return SsciStabilityView(
            analysis_id=analysis_id,
            context=context,
            gain_crossover_mag=self.gain_crossover_mag,
            pm_risk_deg=self.pm_risk_deg,
            pm_unstable_deg=self.pm_unstable_deg,
            verdict=verdict,
        )

    # ------------------------------------------------------------------

    def _build_provenance(self, converter: Any | None) -> ProvenanceTag | None:
        """Najgorsza (najniższa) jakość pól karty, od których zależał werdykt.

        Pola obowiązkowe: ``current_loop_bandwidth_hz``, ``pll_bandwidth_hz``,
        ``filter_l_pu``; pola opcjonalne dołączane TYLKO gdy obecne na karcie.
        Kolejność DATASHEET ≻ ESTIMATED ≻ SYSTEM_DEFAULT; werdykt nosi najgorszą.
        """
        if converter is None:
            return None
        from solver_input.provenance import FieldQuality, resolve_card_field_quality_map

        quality_map = resolve_card_field_quality_map(converter)
        consumed: list[str] = list(SSCI_MANDATORY_FIELDS)
        for name in SSCI_OPTIONAL_FIELDS:
            if getattr(converter, name, None) is not None:
                consumed.append(name)
        consumed = sorted(set(consumed))

        qualities = [quality_map[name].quality for name in consumed if name in quality_map]
        worst = worst_field_quality(qualities)
        if worst is None:
            return None

        is_estimated = worst is FieldQuality.ESTIMATED
        if is_estimated:
            tag_pl = "werdykt oparty na oszacowanych pasmach regulatora"
        elif worst is FieldQuality.SYSTEM_DEFAULT:
            tag_pl = "werdykt oparty na domyślnych technicznych polach karty falownika"
        else:  # DATASHEET
            tag_pl = "werdykt oparty na danych z karty technicznej (wszystkie pola)"

        return ProvenanceTag(
            worst_quality=worst.value,
            worst_quality_label_pl=worst.label_pl,
            is_estimated=is_estimated,
            consumed_fields=tuple(consumed),
            tag_pl=tag_pl,
        )

    def _no_data_verdict(
        self, solver_payload: dict[str, Any], converter: Any | None
    ) -> SsciStabilityVerdict:
        missing = list(solver_payload.get("missing_fields") or ())
        why = (
            "Brak werdyktu — solver SSCI zwrócił status „"
            + SOLVER_INCOMPLETE_STATUS
            + "”. Kryterium impedancyjne wymaga tablic Z_grid(f)/Z_conv(f)/L(f), "
            "które powstają tylko przy komplecie pól karty falownika."
        )
        if missing:
            why += " Brakuje: " + ", ".join(missing) + "."
        return SsciStabilityVerdict(
            converter_ref=solver_payload.get("converter_ref"),
            bus_ref=solver_payload.get("bus_ref"),
            verdict=VERDICT_NO_DATA,
            is_risk=False,
            why_pl=why,
            max_minor_loop_gain=None,
            has_magnitude_crossover=False,
            gain_crossover=None,
            worst_phase_margin_deg=None,
            worst_phase_margin_f_hz=None,
            offending_frequency_hz=None,
            nearest_to_minus_one=None,
            encirclement_count=0,
            negative_resistance_present=False,
            negative_resistance_f_hz=None,
            provenance=self._build_provenance(converter),
            missing_data=tuple(missing) if missing else (SOLVER_INCOMPLETE_STATUS,),
            white_box=(),
        )

    def _build_verdict(
        self, solver_payload: dict[str, Any], converter: Any | None
    ) -> SsciStabilityVerdict:
        # Przepływ „brak danych”: solver zwrócił niekompletne dane.
        if solver_payload.get("status") == SOLVER_INCOMPLETE_STATUS:
            return self._no_data_verdict(solver_payload, converter)
        rows = solver_payload.get("minor_loop_gain")
        if not rows:
            return self._no_data_verdict(
                {**solver_payload, "status": SOLVER_INCOMPLETE_STATUS}, converter
            )

        provenance = self._build_provenance(converter)

        # --- metryki kryterium impedancyjnego ---
        max_mag = max(float(r["mag"]) for r in rows)
        max_row = max(rows, key=lambda r: float(r["mag"]))

        gain_crossover = self._first_gain_crossover(rows)
        has_crossover = max_mag >= self.gain_crossover_mag
        worst_pm, worst_pm_f = self._worst_in_band_phase_margin(rows)
        nearest = self._nearest_to_minus_one(rows)
        encirclements = self._approx_encirclements(rows)

        neg = solver_payload.get("z_conv_negative_resistance") or {}
        neg_present = bool(neg.get("present"))
        neg_f = float(neg["f_at_re_min_hz"]) if neg.get("f_at_re_min_hz") is not None else None

        # --- klasyfikacja ---
        # niestabilny: okrążenie −1 lub margines różnicy faz ≤ 0 przy |L| ≥ 1.
        unstable_by_pm = has_crossover and worst_pm is not None and worst_pm <= self.pm_unstable_deg
        if encirclements >= 1 or unstable_by_pm:
            verdict = VERDICT_UNSTABLE
        elif has_crossover:
            verdict = VERDICT_RISK
        else:
            verdict = VERDICT_STABLE

        is_risk = verdict in (VERDICT_RISK, VERDICT_UNSTABLE)
        # Częstotliwość winna: punkt najgorszego marginesu w paśmie |L| ≥ 1
        # (najbliżej warunku −1). Przy braku przecięcia — brak częstotliwości.
        offending = worst_pm_f if has_crossover else None

        why = self._why_text(
            verdict=verdict,
            max_mag=max_mag,
            max_row=max_row,
            gain_crossover=gain_crossover,
            worst_pm=worst_pm,
            offending=offending,
            nearest=nearest,
            encirclements=encirclements,
            neg_present=neg_present,
            neg_f=neg_f,
            provenance=provenance,
        )

        white_box = self._white_box(
            max_mag=max_mag,
            max_row=max_row,
            gain_crossover=gain_crossover,
            worst_pm=worst_pm,
            worst_pm_f=worst_pm_f,
            nearest=nearest,
            encirclements=encirclements,
            verdict=verdict,
        )

        return SsciStabilityVerdict(
            converter_ref=solver_payload.get("converter_ref"),
            bus_ref=solver_payload.get("bus_ref"),
            verdict=verdict,
            is_risk=is_risk,
            why_pl=why,
            max_minor_loop_gain=_round(max_mag),
            has_magnitude_crossover=has_crossover,
            gain_crossover=gain_crossover,
            worst_phase_margin_deg=(_round(worst_pm, 3) if worst_pm is not None else None),
            worst_phase_margin_f_hz=(_round(worst_pm_f, 4) if worst_pm_f is not None else None),
            offending_frequency_hz=(_round(offending, 4) if offending is not None else None),
            nearest_to_minus_one=nearest,
            encirclement_count=encirclements,
            negative_resistance_present=neg_present,
            negative_resistance_f_hz=(_round(neg_f, 4) if neg_f is not None else None),
            provenance=provenance,
            missing_data=(),
            white_box=white_box,
        )

    # --- metryki na L(f) -------------------------------------------------

    @staticmethod
    def _first_gain_crossover(rows: list[dict[str, Any]]) -> CrossoverPoint | None:
        """Najniższa częstotliwość przecięcia |L|=1 (interpolacja liniowa w f),
        z fazą i marginesem fazy w tym punkcie."""
        for a, b in zip(rows, rows[1:], strict=False):
            ma, mb = float(a["mag"]), float(b["mag"])
            if (ma - 1.0) * (mb - 1.0) < 0.0:
                denom = mb - ma
                t = (1.0 - ma) / denom if denom else 0.0
                fc = float(a["f_hz"]) + t * (float(b["f_hz"]) - float(a["f_hz"]))
                ph = float(a["phase_deg"]) + t * (float(b["phase_deg"]) - float(a["phase_deg"]))
                return CrossoverPoint(
                    f_hz=_round(fc, 4),
                    phase_l_deg=_round(ph, 3),
                    phase_margin_deg=_round(_phase_margin(ph), 3),
                )
            if ma == 1.0:  # dokładne trafienie w węzeł skanu
                return CrossoverPoint(
                    f_hz=_round(float(a["f_hz"]), 4),
                    phase_l_deg=_round(float(a["phase_deg"]), 3),
                    phase_margin_deg=_round(_phase_margin(float(a["phase_deg"])), 3),
                )
        return None

    def _worst_in_band_phase_margin(
        self, rows: list[dict[str, Any]]
    ) -> tuple[float | None, float | None]:
        """Najgorszy (najmniejszy) margines różnicy faz Δφ=180−|∠L| w paśmie
        przecięcia modułów (|L| ≥ próg). Zwraca (Δφ_min, f_at_min)."""
        worst: float | None = None
        worst_f: float | None = None
        for r in rows:
            if float(r["mag"]) >= self.gain_crossover_mag:
                pm = _phase_margin(float(r["phase_deg"]))
                if worst is None or pm < worst:
                    worst = pm
                    worst_f = float(r["f_hz"])
        return worst, worst_f

    @staticmethod
    def _nearest_to_minus_one(rows: list[dict[str, Any]]) -> NyquistPoint:
        """Najbliższy punkt przebiegu L(jω) względem punktu −1 (proximity −1)."""
        best: NyquistPoint | None = None
        for r in rows:
            d = abs(complex(float(r["re"]) + 1.0, float(r["im"])))
            if best is None or d < best.distance_to_minus_one:
                best = NyquistPoint(
                    f_hz=_round(float(r["f_hz"]), 4),
                    mag=_round(float(r["mag"])),
                    phase_deg=_round(float(r["phase_deg"]), 3),
                    distance_to_minus_one=_round(d),
                )
        assert best is not None  # rows niepuste (sprawdzone w wywołaniu)
        return best

    @staticmethod
    def _approx_encirclements(rows: list[dict[str, Any]]) -> int:
        """Przybliżona liczba okrążeń punktu −1 przez jednostronny przebieg
        L(jω): zliczenie zmian znaku Im(L) przy Re(L) < −1 (przecięcia ujemnej
        półosi rzeczywistej na lewo od −1). PRZYBLIŻENIE skończonego skanu — metryka
        wspierająca, NIE pierwotna (różnica faz/margines jest pierwotna)."""
        count = 0
        for a, b in zip(rows, rows[1:], strict=False):
            ima, imb = float(a["im"]), float(b["im"])
            if ima == 0.0 and imb == 0.0:
                continue
            if ima * imb < 0.0:  # przejście Im przez zero
                # interpoluj Re w punkcie Im=0
                denom = imb - ima
                t = (0.0 - ima) / denom if denom else 0.0
                re_cross = float(a["re"]) + t * (float(b["re"]) - float(a["re"]))
                if re_cross < -1.0:
                    count += 1
        return count

    # --- opis i White Box ------------------------------------------------

    def _why_text(
        self,
        *,
        verdict: str,
        max_mag: float,
        max_row: dict[str, Any],
        gain_crossover: CrossoverPoint | None,
        worst_pm: float | None,
        offending: float | None,
        nearest: NyquistPoint,
        encirclements: int,
        neg_present: bool,
        neg_f: float | None,
        provenance: ProvenanceTag | None,
    ) -> str:
        neg_txt = ""
        if neg_present and neg_f is not None:
            neg_txt = (
                f" Strefa ujemnej rezystancji Re(Z_conv)<0 przy f≈{_round(neg_f, 2)} Hz "
                "(poniżej pasma PLL) tworzy mechanizm umożliwiający SSCI."
            )

        if verdict == VERDICT_STABLE:
            base = (
                f"Stabilny: max|L| = {_round(max_mag)} < {self.gain_crossover_mag} — moduły "
                "impedancji NIE przecinają się w całym paśmie (|Z_grid| < |Z_conv| dla każdej "
                "częstotliwości). Zgodnie z kryterium Sun (2011) sieć jest mocna, a układ "
                f"stabilny BEZWARUNKOWO niezależnie od fazy. Najbliższe podejście do −1: "
                f"|L+1| = {nearest.distance_to_minus_one} przy f = {nearest.f_hz} Hz."
            )
        elif verdict == VERDICT_RISK:
            pm_txt = (
                f"margines różnicy faz Δφ = {_round(worst_pm, 2)}° w paśmie przecięcia"
                if worst_pm is not None
                else "margines różnicy faz nieokreślony"
            )
            sev = (
                " Margines NISKI (poniżej progu " f"{self.pm_risk_deg}°) — podwyższone ryzyko."
                if (worst_pm is not None and worst_pm < self.pm_risk_deg)
                else ""
            )
            xover = (
                f" Przecięcie |L|=1 przy f = {gain_crossover.f_hz} Hz, "
                f"∠L = {gain_crossover.phase_l_deg}° (Δφ = {gain_crossover.phase_margin_deg}°)."
                if gain_crossover
                else ""
            )
            base = (
                f"Ryzyko SSCI: max|L| = {_round(max_mag)} ≥ {self.gain_crossover_mag} — moduły "
                "impedancji PRZECINAJĄ się, więc stabilność jest WARUNKOWA (kryterium Sun 2011 / "
                f"Wen 2016). {pm_txt[0].upper() + pm_txt[1:]}.{sev}{xover} Częstotliwość winna "
                f"≈ {_round(offending, 2) if offending is not None else '—'} Hz "
                f"(najbliżej warunku −1; |L+1|_min = {nearest.distance_to_minus_one} przy "
                f"f = {nearest.f_hz} Hz). Zalecana weryfikacja stabilności impedancyjnej / "
                "pasywności i strojenia PLL.{neg}"
            ).replace("{neg}", neg_txt)
        elif verdict == VERDICT_UNSTABLE:
            enc_txt = (
                f" Wykryto {encirclements} okrążenie/okrążenia punktu −1 (przybliżenie "
                "skończonego skanu)."
                if encirclements >= 1
                else ""
            )
            pm_txt = (
                f" Margines różnicy faz Δφ = {_round(worst_pm, 2)}° ≤ {self.pm_unstable_deg}° "
                "przy |L| ≥ 1 (∠L osiąga ±180°)."
                if (worst_pm is not None and worst_pm <= self.pm_unstable_deg)
                else ""
            )
            base = (
                f"Niestabilny: kryterium Nyquista naruszone.{enc_txt}{pm_txt} max|L| = "
                f"{_round(max_mag)} przy f = {_round(float(max_row['f_hz']), 2)} Hz; "
                f"|L+1|_min = {nearest.distance_to_minus_one} przy f = {nearest.f_hz} Hz. "
                "Wymagane przeprojektowanie regulatora / wzmocnienie sieci.{neg}"
            ).replace("{neg}", neg_txt)
        else:  # pragma: no cover - obsłużone wcześniej
            base = ""

        if provenance is not None and provenance.is_estimated:
            base += f" Uwaga proweniencji: {provenance.tag_pl}."
        return base

    def _white_box(
        self,
        *,
        max_mag: float,
        max_row: dict[str, Any],
        gain_crossover: CrossoverPoint | None,
        worst_pm: float | None,
        worst_pm_f: float | None,
        nearest: NyquistPoint,
        encirclements: int,
        verdict: str,
    ) -> tuple[WhiteBoxStep, ...]:
        steps: list[WhiteBoxStep] = []

        # 1) Wzmocnienie pętli mniejszej i przecięcie modułów.
        steps.append(
            WhiteBoxStep(
                symbol="L(jω)",
                formula_latex=r"L(j\omega) = \dfrac{Z_{grid}(j\omega)}{Z_{conv}(j\omega)}",
                substitution_pl=(
                    f"max|L| = {_round(max_mag)} przy f = {_round(float(max_row['f_hz']), 2)} Hz; "
                    f"próg przecięcia |L| = {self.gain_crossover_mag}"
                ),
                result_pl=(
                    "moduły impedancji "
                    + (
                        "przecinają się (|L| ≥ 1)"
                        if max_mag >= self.gain_crossover_mag
                        else "NIE przecinają się (|L| < 1)"
                    )
                ),
                unit_check_pl="L = Ω/Ω → bezwymiarowe; |L|=1 ⟺ |Z_grid|=|Z_conv|.",
            )
        )

        # 2) Margines różnicy faz / przecięcie wzmocnienia.
        if gain_crossover is not None:
            steps.append(
                WhiteBoxStep(
                    symbol="Δφ@|L|=1",
                    formula_latex=r"\Delta\varphi = 180^\circ - \left|\angle L\right|",
                    substitution_pl=(
                        f"przy |L|=1: f = {gain_crossover.f_hz} Hz, "
                        f"∠L = {gain_crossover.phase_l_deg}°"
                    ),
                    result_pl=f"Δφ = {gain_crossover.phase_margin_deg}° (margines fazy przy przecięciu)",
                    unit_check_pl="∠L w stopniach; Δφ = 180° − |∠L| w stopniach.",
                )
            )
        if worst_pm is not None:
            steps.append(
                WhiteBoxStep(
                    symbol="Δφ_min",
                    formula_latex=(
                        r"\Delta\varphi_{min} = \min_{f:\,|L(f)|\geq 1}"
                        r"\left(180^\circ - |\angle L(f)|\right)"
                    ),
                    substitution_pl=(
                        f"min po paśmie |L| ≥ {self.gain_crossover_mag}; "
                        f"f = {_round(worst_pm_f, 2) if worst_pm_f is not None else '—'} Hz"
                    ),
                    result_pl=(
                        f"Δφ_min = {_round(worst_pm, 3)}° "
                        f"(próg ryzyka {self.pm_risk_deg}°, próg niestabilności {self.pm_unstable_deg}°)"
                    ),
                    unit_check_pl="stopnie; Δφ ≤ 0° ⟺ ∠L osiąga ±180° ⟺ okrążenie −1.",
                )
            )

        # 3) Proximity −1.
        steps.append(
            WhiteBoxStep(
                symbol="|L+1|_min",
                formula_latex=r"d_{-1} = \min_{f}\left|L(j\omega) + 1\right|",
                substitution_pl=(
                    f"f = {nearest.f_hz} Hz, |L| = {nearest.mag}, ∠L = {nearest.phase_deg}°"
                ),
                result_pl=f"d(−1) = {nearest.distance_to_minus_one} (odległość przebiegu od −1)",
                unit_check_pl="bezwymiarowe (na płaszczyźnie L); d→0 ⟺ podejście do −1.",
            )
        )

        # 4) Okrążenia (wsparcie).
        steps.append(
            WhiteBoxStep(
                symbol="N(−1)",
                formula_latex=(
                    r"N \approx \#\{\,\mathrm{Im}\,L = 0 \wedge \mathrm{Re}\,L < -1\,\}"
                ),
                substitution_pl="zliczenie przejść Im(L)=0 na lewo od −1 (skan jednostronny)",
                result_pl=f"N ≈ {encirclements} (przybliżenie skończonego skanu, wskaźnik wspierający)",
                unit_check_pl="liczba całkowita; N ≥ 1 ⟺ okrążenie −1 ⟺ niestabilność.",
            )
        )

        # 5) Werdykt.
        steps.append(
            WhiteBoxStep(
                symbol="werdykt",
                formula_latex=(
                    r"\text{stabilny} \Leftarrow \max|L| < 1;\;"
                    r"\text{niestabilny} \Leftarrow N\geq 1 \vee \Delta\varphi_{min}\leq 0"
                ),
                substitution_pl=(
                    f"max|L| = {_round(max_mag)}; N = {encirclements}; "
                    f"Δφ_min = {_round(worst_pm, 3) if worst_pm is not None else '—'}°"
                ),
                result_pl=f"werdykt: {verdict}",
                unit_check_pl="klasyfikacja jakościowa wg kryterium impedancyjnego Sun 2011.",
            )
        )
        return tuple(steps)
