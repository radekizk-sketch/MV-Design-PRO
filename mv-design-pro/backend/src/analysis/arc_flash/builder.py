"""Builder Arc Flash — STRUKTURA IEEE 1584-2018 parametryzowana TABLICĄ.

Liczy prąd łuku, energię incydentu, granicę łuku i kategorię ŚOI wg STRUKTURY
równań IEEE 1584-2018, z pełnym wywodem White Box. STRUKTURA jest publiczna;
WARTOŚCI współczynników pochodzą z TABLICY (w repozytorium PUSTEJ — proweniencja
``norma_IEEE_1584``). Gdy tablica jest pusta, KAŻDA ścieżka IEEE zwraca status
``dane niekompletne — tablice współczynników IEEE 1584`` (NIE liczbę). Gdy
właściciel wypełni tablicę, TEN SAM przepływ policzy wynik.

Poza zakresem ważności IEEE 1584-2018 (zwł. > 15 kV) builder przełącza się na
ODRĘBNĄ metodę Ralpha Lee (postać zamknięta, bez tablicy), JAWNIE oznaczoną.

Granica warstw (arch_guard): moduł konsumuje wynik zwarciowy jako zwykłe
wejście (``ArcFlashInput``, odwzorowane z ``ShortCircuitResult`` w warstwie
application) — NIE importuje solvera. ŻADEN współczynnik IEEE/NFPA nie jest tu
zmyślany — brakujący współczynnik to None/BRAK, nigdy fałszywy float.
"""

from __future__ import annotations

import math
from collections.abc import Iterable

from analysis.arc_flash.models import (
    ARC_FLASH_COEFF_MISSING_MARKER,
    ARC_FLASH_RALPH_LEE_LABEL,
    ARC_FLASH_TABLE_INCOMPLETE_STATUS,
    INCIDENT_ENERGY_AFB_CAL_CM2,
    JOULE_PER_CAL_CM2,
    PPE_CATEGORY_INCOMPLETE,
    PRODUCTION_IEEE_1584_TABLE,
    PRODUCTION_NFPA_70E_PPE_TABLE,
    REFERENCE_DISTANCE_MM,
    REFERENCE_TIME_S,
    VALIDITY_IBF_MAX_KA,
    VALIDITY_IBF_MIN_KA,
    VALIDITY_VOLTAGE_MAX_KV,
    VALIDITY_VOLTAGE_MIN_KV,
    ArcCurrentCoeffs,
    ArcFlashCoefficientTable,
    ArcFlashContext,
    ArcFlashInput,
    ArcFlashMethod,
    ArcFlashResult,
    ArcFlashStatus,
    ArcFlashView,
    ElectrodeConfig,
    EnclosureCorrectionCoeffs,
    IncidentEnergyCoeffs,
    PpeCategoryTable,
    VoltageAnchor,
    WhiteBoxStep,
    compute_arc_flash_id,
)


def _round(value: float | None, digits: int = 4) -> float | None:
    if value is None:
        return None
    if not math.isfinite(value):
        return value
    return round(float(value), digits)


class ArcFlashBuilder:
    """Liczy Arc Flash (STRUKTURA IEEE 1584-2018) z White Box, parametr. tablicą.

    NIEZMIENNIK DANYCH BEZPIECZEŃSTWA:
    - Brak obowiązkowego wejścia ⇒ ``INCOMPLETE_INPUT`` ("dane niekompletne").
    - Tablica współczynników pusta ⇒ ``INCOMPLETE_TABLE`` ("dane niekompletne —
      tablice współczynników IEEE 1584"); wartości pośrednie None.
    - Poza zakresem ważności ⇒ ``COMPUTED_RALPH_LEE`` (jawnie metoda Lee).
    - Tablica wypełniona, w zakresie ⇒ ``COMPUTED_IEEE_1584``.
    ŻADEN współczynnik nie jest zmyślany.
    """

    def __init__(
        self,
        coefficient_table: ArcFlashCoefficientTable | None = None,
        ppe_table: PpeCategoryTable | None = None,
    ) -> None:
        # Domyślnie tablice PRODUKCYJNE (puste). Test-only może wstrzyknąć
        # WYRAŹNIE oznaczoną tablicę-atrapę, by sprawdzić MATEMATYKĘ struktury.
        self._table = coefficient_table or PRODUCTION_IEEE_1584_TABLE
        self._ppe_table = ppe_table or PRODUCTION_NFPA_70E_PPE_TABLE

    def build(
        self,
        inputs: Iterable[ArcFlashInput],
        context: ArcFlashContext | None = None,
    ) -> ArcFlashView:
        ordered = sorted(inputs, key=lambda i: i.bus_ref)
        results = tuple(self._build_result(item) for item in ordered)
        view_status = self._aggregate_status(results)
        analysis_id = compute_arc_flash_id(context, results)
        return ArcFlashView(
            analysis_id=analysis_id,
            context=context,
            status=view_status,
            coefficient_table=self._table,
            ppe_table=self._ppe_table,
            results=results,
        )

    @staticmethod
    def _aggregate_status(results: tuple[ArcFlashResult, ...]) -> ArcFlashStatus:
        """Status widoku = najgorszy ze statusów (brak wejść > brak tablicy > Lee > IEEE)."""
        if not results:
            return ArcFlashStatus.INCOMPLETE_INPUT
        statuses = {r.status for r in results}
        for worst in (
            ArcFlashStatus.INCOMPLETE_INPUT,
            ArcFlashStatus.INCOMPLETE_TABLE,
            ArcFlashStatus.COMPUTED_RALPH_LEE,
        ):
            if worst in statuses:
                return worst
        return ArcFlashStatus.COMPUTED_IEEE_1584

    # ------------------------------------------------------------------

    def _build_result(self, item: ArcFlashInput) -> ArcFlashResult:
        # 1) Walidacja wejść (bez zmyślania). Obowiązkowe: I_bf, U, t, G, D.
        missing = self._missing_inputs(item)
        if missing:
            return self._incomplete_input_result(item, missing)

        i_bf = float(item.i_bf_ka)  # type: ignore[arg-type]
        voltage = float(item.voltage_kv)  # type: ignore[arg-type]
        arc_time = float(item.arc_time_s)  # type: ignore[arg-type]
        gap = float(item.conductor_gap_mm)  # type: ignore[arg-type]
        working_distance = float(item.working_distance_mm)  # type: ignore[arg-type]

        # 2) Zakres ważności IEEE 1584-2018. Poza zakresem → ścieżka Ralpha Lee.
        in_range = self._within_validity(i_bf, voltage)
        if not in_range:
            return self._ralph_lee_result(
                item,
                i_bf=i_bf,
                voltage=voltage,
                arc_time=arc_time,
                gap=gap,
                working_distance=working_distance,
            )

        # 3) Ścieżka IEEE 1584-2018 — wymaga WYPEŁNIONEJ tablicy dla konfiguracji.
        return self._ieee_1584_result(
            item,
            i_bf=i_bf,
            voltage=voltage,
            arc_time=arc_time,
            gap=gap,
            working_distance=working_distance,
        )

    # --- walidacja wejść -------------------------------------------------

    @staticmethod
    def _missing_inputs(item: ArcFlashInput) -> list[str]:
        missing: list[str] = []
        if item.i_bf_ka is None or item.i_bf_ka <= 0.0:
            missing.append("i_bf_ka")
        if item.voltage_kv is None or item.voltage_kv <= 0.0:
            missing.append("voltage_kv")
        # Czas łuku = czas wyłączenia z koordynacji zabezpieczeń (to samo źródło,
        # co U_touch / uziemienie). Brak ⇒ "dane niekompletne" (nie zmyślamy).
        if item.arc_time_s is None or item.arc_time_s <= 0.0:
            missing.append("arc_time_s")
        # Odstęp elektrod i odległość robocza to wejścia projektowe — bez domyślnych.
        if item.conductor_gap_mm is None or item.conductor_gap_mm <= 0.0:
            missing.append("conductor_gap_mm")
        if item.working_distance_mm is None or item.working_distance_mm <= 0.0:
            missing.append("working_distance_mm")
        return missing

    @staticmethod
    def _within_validity(i_bf_ka: float, voltage_kv: float) -> bool:
        return (
            VALIDITY_VOLTAGE_MIN_KV <= voltage_kv <= VALIDITY_VOLTAGE_MAX_KV
            and VALIDITY_IBF_MIN_KA <= i_bf_ka <= VALIDITY_IBF_MAX_KA
        )

    # --- ścieżka IEEE 1584-2018 -----------------------------------------

    def _ieee_1584_result(
        self,
        item: ArcFlashInput,
        *,
        i_bf: float,
        voltage: float,
        arc_time: float,
        gap: float,
        working_distance: float,
    ) -> ArcFlashResult:
        cfg = item.electrode_config
        table = self._table

        # Tablica niewypełniona dla tej konfiguracji ⇒ "dane niekompletne — tablice".
        if not table.is_complete_for(cfg):
            return self._incomplete_table_result(item, table.missing_for(cfg))

        steps: list[WhiteBoxStep] = []

        # 3a) Prąd łuku I_arc w trzech kotwach napięcia + interpolacja (§ struktura).
        i_arc_anchors: dict[str, float] = {}
        for anchor in VoltageAnchor:
            coeffs = table.arc_entry(cfg, anchor)
            i_arc_anchors[anchor.name] = self._arc_current_at_anchor(i_bf, gap, coeffs)
        i_arc = self._interpolate_anchor(voltage, i_arc_anchors)
        steps.append(
            WhiteBoxStep(
                symbol="I_arc",
                formula_latex=(
                    r"\log_{10} I_{arc,anchor} = f_k(\log_{10} I_{bf}, G)\;;\quad "
                    r"I_{arc} = \mathrm{interp}_{U}\big(I_{arc,600},I_{arc,2700},I_{arc,14300}\big)"
                ),
                substitution_pl=(
                    f"I_bf={_round(i_bf)} kA, G={_round(gap)} mm, U={_round(voltage)} kV "
                    f"[{cfg.value}]; kotwy: "
                    + ", ".join(f"{k}={_round(v)} kA" for k, v in sorted(i_arc_anchors.items()))
                ),
                result_pl=f"I_arc = {_round(i_arc)} kA (IEEE 1584-2018, tablice zweryfikowane)",
                unit_check_pl="I_bf,I_arc w kA; G w mm; interpolacja po U [kV] między kotwami.",
                table_ref=f"I_arc[{cfg.value}, kotwy 600/2700/14300 V] = norma_IEEE_1584",
            )
        )

        # 3b) Korekcja rozmiaru obudowy CF (tablicowa; CF=1 w otwartym powietrzu).
        cf = self._enclosure_correction(item, table.enclosure_entry(cfg))
        steps.append(
            WhiteBoxStep(
                symbol="CF",
                formula_latex=r"E = E_{n} \cdot CF \quad (CF=1 \text{ w otwartym powietrzu})",
                substitution_pl=(
                    f"konfiguracja {cfg.value} "
                    f"({'w obudowie' if cfg.is_boxed else 'otwarte powietrze'})"
                ),
                result_pl=f"CF = {_round(cf)}",
                unit_check_pl="CF bezwymiarowe; mnożnik energii dla obudowy.",
                table_ref=(
                    f"CF[{cfg.value}] = norma_IEEE_1584"
                    if cfg.is_boxed
                    else "CF = 1 (otwarte powietrze, brak wpisu tablicy)"
                ),
            )
        )

        # 3c) Energia incydentu E na odległości roboczej (interpolacja po kotwach).
        e_anchors: dict[str, float] = {}
        for anchor in VoltageAnchor:
            e_anchors[anchor.name] = self._incident_energy_at_anchor(
                i_arc, gap, arc_time, working_distance, cf, table.energy_entry(cfg, anchor)
            )
        incident_energy = self._interpolate_anchor(voltage, e_anchors)
        steps.append(
            WhiteBoxStep(
                symbol="E",
                formula_latex=(
                    r"\log_{10} E_{n} = g_b(\log_{10} I_{arc}, G)\;;\quad "
                    r"E = \frac{CF\cdot E_n}{4{,}184}\cdot\frac{t}{0{,}2}"
                    r"\left(\frac{610}{D}\right)^{x}\;;\quad E=\mathrm{interp}_U(\cdots)"
                ),
                substitution_pl=(
                    f"I_arc={_round(i_arc)} kA, G={_round(gap)} mm, t={_round(arc_time)} s, "
                    f"D={_round(working_distance)} mm, CF={_round(cf)}; kotwy: "
                    + ", ".join(f"{k}={_round(v)} cal/cm²" for k, v in sorted(e_anchors.items()))
                ),
                result_pl=(
                    f"E = {_round(incident_energy)} cal/cm² (IEEE 1584-2018, zweryfikowane)"
                ),
                unit_check_pl=(
                    "E_n w J/cm² (610 mm, 0,2 s); 1/4,184 J/cm²→cal/cm²; "
                    "t/0,2 i 610/D bezwymiarowe; interpolacja po U."
                ),
                table_ref=f"E[{cfg.value}, kotwy 600/2700/14300 V] = norma_IEEE_1584",
            )
        )

        # 3d) Granica łuku AFB — odległość, na której E = 1,2 cal/cm² (publiczny próg).
        afb = self._arc_flash_boundary(voltage, i_arc, gap, arc_time, cf, cfg, table)
        steps.append(
            WhiteBoxStep(
                symbol="AFB",
                formula_latex=(
                    r"D_{AFB} = 610\left(\frac{CF\cdot E_n\cdot (t/0{,}2)}"
                    r"{1{,}2\cdot 4{,}184}\right)^{1/x}\quad(\mathrm{interp}_U)"
                ),
                substitution_pl=(
                    f"E_próg = {INCIDENT_ENERGY_AFB_CAL_CM2} cal/cm² = "
                    f"{_round(INCIDENT_ENERGY_AFB_CAL_CM2 * JOULE_PER_CAL_CM2)} J/cm²; "
                    f"I_arc={_round(i_arc)} kA, t={_round(arc_time)} s, CF={_round(cf)}, "
                    f"U={_round(voltage)} kV"
                ),
                result_pl=f"AFB = {_round(afb)} mm (IEEE 1584-2018, zweryfikowane)",
                unit_check_pl="D_AFB w mm; odległość, na której E spada do 1,2 cal/cm².",
                table_ref=f"E[{cfg.value}] (odwrócone) = norma_IEEE_1584; próg 1,2 cal/cm² publiczny",
            )
        )

        # 3e) Kategoria ŚOI (progi NFPA 70E — tablica PUSTA ⇒ "dane niekompletne").
        ppe, ppe_prov = self._ppe_category(incident_energy)
        steps.append(
            WhiteBoxStep(
                symbol="ŚOI",
                formula_latex=r"\text{kategoria} = f_{NFPA\,70E}(E)",
                substitution_pl=(
                    f"E = {_round(incident_energy)} cal/cm²; tablica progów NFPA 70E: "
                    + ("PUSTA" if self._ppe_table.is_empty else "wypełniona")
                ),
                result_pl=f"kategoria ŚOI = {ppe}",
                unit_check_pl="E w cal/cm² → kategoria (klasyfikacja jakościowa NFPA 70E).",
                table_ref=(
                    f"{ARC_FLASH_COEFF_MISSING_MARKER}"
                    if self._ppe_table.is_empty
                    else f"progi ŚOI = {self._ppe_table.provenance.value}"
                ),
            )
        )

        why = (
            f"Arc Flash (konfiguracja {cfg.value}, IEEE 1584-2018): prąd łuku "
            f"I_arc ≈ {_round(i_arc, 2)} kA, energia incydentu E ≈ "
            f"{_round(incident_energy, 2)} cal/cm² na odległości roboczej, granica "
            f"łuku AFB ≈ {_round(afb, 1)} mm, kategoria ŚOI = {ppe}. Wartości "
            "policzone na zweryfikowanej tablicy współczynników (norma_IEEE_1584)."
        )

        return ArcFlashResult(
            bus_ref=item.bus_ref,
            status=ArcFlashStatus.COMPUTED_IEEE_1584,
            method=ArcFlashMethod.IEEE_1584_2018,
            electrode_config=cfg.value,
            i_bf_ka=_round(i_bf),
            voltage_kv=_round(voltage),
            arc_time_s=_round(arc_time),
            conductor_gap_mm=_round(gap),
            working_distance_mm=_round(working_distance),
            coefficient_table_provenance=table.provenance.value,
            coefficient_table_marker=None,
            i_arc_ka=_round(i_arc),
            i_arc_at_anchors_ka={k: _round(v) for k, v in i_arc_anchors.items()},
            enclosure_correction_cf=_round(cf),
            incident_energy_cal_cm2=_round(incident_energy),
            arc_flash_boundary_mm=_round(afb),
            ppe_category=ppe,
            ppe_table_provenance=ppe_prov,
            why_pl=why,
            missing_data=(),
            white_box=tuple(steps),
        )

    # --- ścieżka Ralpha Lee (poza zakresem IEEE 1584-2018) ---------------

    def _ralph_lee_result(
        self,
        item: ArcFlashInput,
        *,
        i_bf: float,
        voltage: float,
        arc_time: float,
        gap: float,
        working_distance: float,
    ) -> ArcFlashResult:
        """Metoda Ralpha Lee — teoretyczna maksymalna moc łuku (postać zamknięta).

        Publiczna postać zamknięta (BEZ tablicy współczynników): energia maksimum
        mocy łuku przy napięciu źródła. JAWNIE oznaczona jako Ralph Lee — NIE
        prezentowana jako IEEE 1584. Stosowana POZA zakresem ważności IEEE
        1584-2018 (zwł. > 15 kV).

        Postać (publiczna): E[cal/cm²] = 2,142e6 · V · I_bf · t / D², gdzie V w kV,
        I_bf w kA, t w s, D w mm. Współczynnik 2,142e6 jest stałą postaci zamkniętej
        Ralpha Lee (nie tablicą regresji objętą prawem autorskim).
        """
        cfg = item.electrode_config
        steps: list[WhiteBoxStep] = []

        # E maksymalnej mocy łuku (Ralph Lee). Stała postaci zamkniętej.
        lee_constant = 2.142e6
        e_lee = lee_constant * voltage * i_bf * arc_time / (working_distance**2)
        steps.append(
            WhiteBoxStep(
                symbol="E_Lee",
                formula_latex=(r"E = 2{,}142\times10^{6}\cdot V\cdot I_{bf}\cdot t \big/ D^{2}"),
                substitution_pl=(
                    f"V={_round(voltage)} kV, I_bf={_round(i_bf)} kA, t={_round(arc_time)} s, "
                    f"D={_round(working_distance)} mm [poza zakresem IEEE 1584-2018]"
                ),
                result_pl=f"E = {_round(e_lee)} cal/cm² ({ARC_FLASH_RALPH_LEE_LABEL})",
                unit_check_pl="V w kV, I_bf w kA, t w s, D w mm; E w cal/cm² (postać Lee).",
                table_ref="metoda Ralpha Lee — postać zamknięta (bez tablicy IEEE 1584)",
            )
        )

        # AFB Lee: odległość, na której E = 1,2 cal/cm² (próg publiczny).
        afb_lee = math.sqrt(lee_constant * voltage * i_bf * arc_time / INCIDENT_ENERGY_AFB_CAL_CM2)
        steps.append(
            WhiteBoxStep(
                symbol="AFB_Lee",
                formula_latex=(
                    r"D_{AFB} = \sqrt{2{,}142\times10^{6}\cdot V\cdot I_{bf}\cdot t \big/ 1{,}2}"
                ),
                substitution_pl=(
                    f"V={_round(voltage)} kV, I_bf={_round(i_bf)} kA, t={_round(arc_time)} s; "
                    f"E_próg = {INCIDENT_ENERGY_AFB_CAL_CM2} cal/cm²"
                ),
                result_pl=f"AFB = {_round(afb_lee)} mm ({ARC_FLASH_RALPH_LEE_LABEL})",
                unit_check_pl="D_AFB w mm; odległość, na której E = 1,2 cal/cm².",
                table_ref="metoda Ralpha Lee — postać zamknięta (bez tablicy IEEE 1584)",
            )
        )

        ppe, ppe_prov = self._ppe_category(e_lee)
        steps.append(
            WhiteBoxStep(
                symbol="ŚOI",
                formula_latex=r"\text{kategoria} = f_{NFPA\,70E}(E)",
                substitution_pl=(
                    f"E = {_round(e_lee)} cal/cm²; tablica progów NFPA 70E: "
                    + ("PUSTA" if self._ppe_table.is_empty else "wypełniona")
                ),
                result_pl=f"kategoria ŚOI = {ppe}",
                unit_check_pl="E w cal/cm² → kategoria (klasyfikacja jakościowa NFPA 70E).",
                table_ref=(
                    ARC_FLASH_COEFF_MISSING_MARKER
                    if self._ppe_table.is_empty
                    else f"progi ŚOI = {self._ppe_table.provenance.value}"
                ),
            )
        )

        why = (
            f"POZA zakresem ważności IEEE 1584-2018 (U={_round(voltage, 2)} kV, "
            f"I_bf={_round(i_bf, 2)} kA; zakres: {VALIDITY_VOLTAGE_MIN_KV*1000:.0f} V–"
            f"{VALIDITY_VOLTAGE_MAX_KV:.0f} kV, {VALIDITY_IBF_MIN_KA*1000:.0f} A–"
            f"{VALIDITY_IBF_MAX_KA:.0f} kA). Zastosowano {ARC_FLASH_RALPH_LEE_LABEL}: "
            f"E ≈ {_round(e_lee, 2)} cal/cm², AFB ≈ {_round(afb_lee, 1)} mm, ŚOI = {ppe}. "
            "To NIE jest wynik IEEE 1584 — metoda Lee jest teoretyczna (maksymalna moc łuku)."
        )

        return ArcFlashResult(
            bus_ref=item.bus_ref,
            status=ArcFlashStatus.COMPUTED_RALPH_LEE,
            method=ArcFlashMethod.RALPH_LEE,
            electrode_config=cfg.value,
            i_bf_ka=_round(i_bf),
            voltage_kv=_round(voltage),
            arc_time_s=_round(arc_time),
            conductor_gap_mm=_round(gap),
            working_distance_mm=_round(working_distance),
            coefficient_table_provenance=ArcFlashMethod.RALPH_LEE.value,
            coefficient_table_marker=None,
            i_arc_ka=None,  # metoda Lee nie liczy I_arc (zakłada bolted)
            i_arc_at_anchors_ka=None,
            enclosure_correction_cf=None,
            incident_energy_cal_cm2=_round(e_lee),
            arc_flash_boundary_mm=_round(afb_lee),
            ppe_category=ppe,
            ppe_table_provenance=ppe_prov,
            why_pl=why,
            missing_data=(),
            white_box=tuple(steps),
        )

    # --- wyniki "dane niekompletne" -------------------------------------

    def _incomplete_input_result(self, item: ArcFlashInput, missing: list[str]) -> ArcFlashResult:
        why = (
            "Dane niekompletne — brak: "
            + ", ".join(missing)
            + ". Model Arc Flash wymaga prądu zwarcia bolted I_bf (z solvera "
            "IEC 60909), napięcia U, czasu łuku t (z koordynacji zabezpieczeń — "
            "to samo źródło co U_touch/uziemienie), odstępu elektrod G oraz "
            "odległości roboczej D. Wejścia NIE są zmyślane."
        )
        return self._bare_result(
            item,
            status=ArcFlashStatus.INCOMPLETE_INPUT,
            why=why,
            missing=tuple(missing),
            table_marker=None,
        )

    def _incomplete_table_result(
        self, item: ArcFlashInput, missing_entries: tuple[str, ...]
    ) -> ArcFlashResult:
        why = (
            f"{ARC_FLASH_TABLE_INCOMPLETE_STATUS}. Brakujące wpisy tablicy "
            f"(konfiguracja {item.electrode_config.value}): "
            + ", ".join(missing_entries)
            + f". {ARC_FLASH_COEFF_MISSING_MARKER}. STRUKTURA modelu jest gotowa — "
            "po wstawieniu autorytatywnych współczynników IEEE 1584-2018 ten sam "
            "przepływ policzy wynik. Współczynniki NIE są zmyślane."
        )
        return self._bare_result(
            item,
            status=ArcFlashStatus.INCOMPLETE_TABLE,
            why=why,
            missing=missing_entries,
            table_marker=ARC_FLASH_COEFF_MISSING_MARKER,
        )

    def _bare_result(
        self,
        item: ArcFlashInput,
        *,
        status: ArcFlashStatus,
        why: str,
        missing: tuple[str, ...],
        table_marker: str | None,
    ) -> ArcFlashResult:
        return ArcFlashResult(
            bus_ref=item.bus_ref,
            status=status,
            method=ArcFlashMethod.IEEE_1584_2018,
            electrode_config=item.electrode_config.value,
            i_bf_ka=item.i_bf_ka,
            voltage_kv=item.voltage_kv,
            arc_time_s=item.arc_time_s,
            conductor_gap_mm=item.conductor_gap_mm,
            working_distance_mm=item.working_distance_mm,
            coefficient_table_provenance=self._table.provenance.value,
            coefficient_table_marker=table_marker,
            i_arc_ka=None,
            i_arc_at_anchors_ka=None,
            enclosure_correction_cf=None,
            incident_energy_cal_cm2=None,
            arc_flash_boundary_mm=None,
            ppe_category=None,
            ppe_table_provenance=None,
            why_pl=why,
            missing_data=missing,
            white_box=(),
        )

    # --- równania (STRUKTURA IEEE 1584-2018, współczynniki z TABLICY) ----

    @staticmethod
    def _arc_current_at_anchor(i_bf_ka: float, gap_mm: float, c: ArcCurrentCoeffs) -> float:
        """Prąd łuku I_arc [kA] dla JEDNEJ kotwy (STRUKTURA log-wielomianowa).

        STRUKTURA: log10(I_arc) jako wielomian log10(I_bf) z członem odstępu G.
        Współczynniki ``c.k`` pochodzą z TABLICY. Postać ogólna parametryzowana:
            log10(I_arc) = k0 + k1*log10(I_bf) + k2*log10(G) + k3*log10(I_bf)*log10(G) + ...
        Builder ewaluuje wielomian wg DŁUGOŚCI dostarczonego wektora k — bez
        zaszytych wartości. (Pusta tablica nie dotrze tutaj: ścieżka blokowana
        wcześniej przez ``is_complete_for``.)
        """
        assert c.k is not None  # gwarantowane przez is_complete_for
        log_ibf = math.log10(i_bf_ka)
        log_g = math.log10(gap_mm)
        terms = (1.0, log_ibf, log_g, log_ibf * log_g, log_ibf**2, log_g**2)
        log_iarc = sum(k * t for k, t in zip(c.k, terms, strict=False))
        return 10.0**log_iarc

    @staticmethod
    def _normalized_energy(i_arc_ka: float, gap_mm: float, c: IncidentEnergyCoeffs) -> float:
        """Energia ZNORMALIZOWANA E_n [J/cm²] na 610 mm / 0,2 s (STRUKTURA).

        STRUKTURA: log10(E_n) jako wielomian log10(I_arc) z członem odstępu G.
        Współczynniki ``c.b`` z TABLICY; ewaluacja wg długości wektora b.
        """
        assert c.b is not None
        log_iarc = math.log10(i_arc_ka)
        log_g = math.log10(gap_mm)
        terms = (1.0, log_iarc, log_g, log_iarc * log_g, log_iarc**2, log_g**2)
        log_en = sum(b * t for b, t in zip(c.b, terms, strict=False))
        return 10.0**log_en

    @classmethod
    def _incident_energy_at_anchor(
        cls,
        i_arc_ka: float,
        gap_mm: float,
        arc_time_s: float,
        working_distance_mm: float,
        cf: float,
        c: IncidentEnergyCoeffs,
    ) -> float:
        """Energia incydentu E [cal/cm²] dla JEDNEJ kotwy (STRUKTURA §...).

        E[cal/cm²] = CF * E_n * (t/0,2) * (610/D)^x / 4,184. Współczynniki z TABLICY.
        """
        assert c.distance_exponent_x is not None
        e_n = cls._normalized_energy(i_arc_ka, gap_mm, c)
        e_jcm2 = (
            cf
            * e_n
            * (arc_time_s / REFERENCE_TIME_S)
            * (REFERENCE_DISTANCE_MM / working_distance_mm) ** c.distance_exponent_x
        )
        return e_jcm2 / JOULE_PER_CAL_CM2

    @staticmethod
    def _enclosure_correction(item: ArcFlashInput, c: EnclosureCorrectionCoeffs) -> float:
        """Korekcja rozmiaru obudowy CF (STRUKTURA §...; współczynniki z TABLICY).

        Otwarte powietrze (VOA/HOA) ⇒ CF = 1 (brak obudowy, brak wpisu tablicy).
        W obudowie ⇒ CF z wymiarów obudowy i współczynników ``c.b`` z tablicy. Gdy
        wymiarów brak — używany jest „rozmiar ekwiwalentny” z pierwszego
        współczynnika tablicy jako odniesienia (tablicowe, nie zmyślone).
        """
        if not item.electrode_config.is_boxed:
            return 1.0
        assert c.b is not None and len(c.b) >= 2  # gwarantowane przez is_complete_for
        dims = [
            d
            for d in (
                item.enclosure_width_mm,
                item.enclosure_height_mm,
                item.enclosure_depth_mm,
            )
            if d and d > 0.0
        ]
        # b[0] = rozmiar odniesienia [mm]; b[1] = wykładnik skali; pozostałe rezerwa.
        ref_mm = c.b[0]
        exponent = c.b[1]
        if not dims:
            equiv = ref_mm
        else:
            equiv = sum(float(d) for d in dims) / len(dims)
        cf = (ref_mm / equiv) ** exponent
        return cf

    @classmethod
    def _arc_flash_boundary(
        cls,
        voltage_kv: float,
        i_arc_ka: float,
        gap_mm: float,
        arc_time_s: float,
        cf: float,
        cfg: ElectrodeConfig,
        table: ArcFlashCoefficientTable,
    ) -> float:
        """Granica łuku AFB [mm] — interpolacja AFB z trzech kotew.

        Dla każdej kotwy odwraca model energii względem D przy E = 1,2 cal/cm²,
        następnie interpoluje wynik po napięciu. Publiczny próg 1,2 cal/cm².
        """
        afb_anchors: dict[str, float] = {}
        e_threshold_jcm2 = INCIDENT_ENERGY_AFB_CAL_CM2 * JOULE_PER_CAL_CM2
        for anchor in VoltageAnchor:
            c = table.energy_entry(cfg, anchor)
            assert c.distance_exponent_x is not None
            e_n = cls._normalized_energy(i_arc_ka, gap_mm, c)
            denom = cf * e_n * (arc_time_s / REFERENCE_TIME_S)
            ratio = e_threshold_jcm2 / denom  # = (610/D)^x
            afb_anchors[anchor.name] = REFERENCE_DISTANCE_MM / (
                ratio ** (1.0 / c.distance_exponent_x)
            )
        return cls._interpolate_anchor(voltage_kv, afb_anchors)

    @staticmethod
    def _interpolate_anchor(voltage_kv: float, anchor_values: dict[str, float]) -> float:
        """Interpolacja liniowa wartości między kotwami otaczającymi napięcie U.

        Publiczne ramy interpolacji IEEE 1584-2018: policz na kotwach otaczających
        U i interpoluj liniowo; poniżej najniższej / powyżej najwyższej kotwy
        przyjmij wartość skrajnej kotwy (clamp). Kotwy: 600 / 2700 / 14300 V.
        """
        pts = sorted((VoltageAnchor[name].value, value) for name, value in anchor_values.items())
        if voltage_kv <= pts[0][0]:
            return pts[0][1]
        if voltage_kv >= pts[-1][0]:
            return pts[-1][1]
        for (v_lo, e_lo), (v_hi, e_hi) in zip(pts, pts[1:], strict=False):
            if v_lo <= voltage_kv <= v_hi:
                frac = (voltage_kv - v_lo) / (v_hi - v_lo)
                return e_lo + frac * (e_hi - e_lo)
        return pts[-1][1]  # nieosiągalne (clamp wyżej)

    def _ppe_category(self, incident_energy_cal_cm2: float) -> tuple[str, str | None]:
        """Kategoria ŚOI z progów NFPA 70E. PUSTA tablica ⇒ "dane niekompletne".

        Zwraca (etykieta_kategorii, proweniencja_tablicy_lub_None). Gdy tablica
        progów jest pusta, kategoria = "dane niekompletne — tablice NFPA 70E"
        i proweniencja None (NIE zmyślamy granic kategorii).
        """
        table = self._ppe_table
        if table.is_empty:
            return (PPE_CATEGORY_INCOMPLETE, None)
        for threshold, category in table.boundaries:
            if incident_energy_cal_cm2 < threshold:
                return (category, table.provenance.value)
        return (
            table.over_limit_label_pl or PPE_CATEGORY_INCOMPLETE,
            table.provenance.value,
        )
