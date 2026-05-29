"""Builder Arc Flash — warstwa OBLICZENIA wg STRUKTURY IEEE 1584-2018.

WERSJA BEST-EFFORT, NIEZWERYFIKOWANA wobec normy (patrz nagłówek modeli). Liczy
prąd łuku, energię incydentu, granicę łuku i kategorię ŚOI wg STRUKTURY równań
IEEE 1584-2018, z pełnym wywodem White Box (Wzór→Dane→Podstawienie→Wynik→
Jednostka). KAŻDY wynik nosi status ``UNVERIFIED_BEST_EFFORT`` i etykietę
``DO WERYFIKACJI wobec IEEE 1584-2018``; KAŻDY użyty współczynnik niesie swoją
proweniencję best-effort.

Granica warstw (arch_guard): moduł konsumuje wynik zwarciowy jako zwykłe
wejście (``ArcFlashInput``, odwzorowane z ``ShortCircuitResult`` w warstwie
application) — NIE importuje solvera.

OGRANICZENIE (jawne): model NIE został zwalidowany wobec przykładu obliczeniowego
z IEEE 1584-2018 (brak dostępu do przykładu). Wartości współczynników są
odtworzone z wiedzy, nie z autorytatywnych tablic normy.
"""

from __future__ import annotations

import math
from collections.abc import Iterable

from analysis.arc_flash.models import (
    ARC_CURRENT_COEFFS,
    ARC_FLASH_NO_WORKED_EXAMPLE_NOTE_PL,
    ARC_FLASH_UNVERIFIED_NOTE_PL,
    ARC_FLASH_UNVERIFIED_TAG,
    DEFAULT_CONDUCTOR_GAP_MM,
    DEFAULT_WORKING_DISTANCE_MM,
    INCIDENT_ENERGY_AFB_CAL_CM2,
    INCIDENT_ENERGY_COEFFS,
    PPE_OVER_LIMIT_LABEL,
    PPE_PROVENANCE,
    PPE_THRESHOLDS_CAL_CM2,
    REFERENCE_DISTANCE_MM,
    REFERENCE_TIME_S,
    ArcCurrentCoeffs,
    ArcFlashContext,
    ArcFlashInput,
    ArcFlashResult,
    ArcFlashVerificationStatus,
    ArcFlashView,
    ElectrodeConfig,
    IncidentEnergyCoeffs,
    WhiteBoxStep,
    compute_arc_flash_id,
)


def _round(value: float, digits: int = 4) -> float:
    if not math.isfinite(value):
        return value
    return round(float(value), digits)


class ArcFlashBuilder:
    """Liczy Arc Flash (IEEE 1584-2018 STRUKTURA, best-effort) z White Box.

    NIEZMIENNIK BEZPIECZEŃSTWA: każdy policzony wynik wychodzi ze statusem
    ``UNVERIFIED_BEST_EFFORT`` i etykietą maszynowo-czytelną. Brak obowiązkowego
    wejścia ⇒ ``INCOMPLETE_INPUT`` ("dane niekompletne") — bez zmyślania wejść.
    """

    def build(
        self,
        inputs: Iterable[ArcFlashInput],
        context: ArcFlashContext | None = None,
    ) -> ArcFlashView:
        # Determinizm: sortuj po bus_ref.
        ordered = sorted(inputs, key=lambda i: i.bus_ref)
        results = tuple(self._build_result(item) for item in ordered)

        # Status widoku = najgorszy ze statusów wyników; gdy cokolwiek policzono,
        # widok jest jawnie best-effort (nie "kompletny/zweryfikowany").
        view_status = (
            ArcFlashVerificationStatus.UNVERIFIED_BEST_EFFORT
            if any(r.status is ArcFlashVerificationStatus.UNVERIFIED_BEST_EFFORT for r in results)
            else ArcFlashVerificationStatus.INCOMPLETE_INPUT
        )
        analysis_id = compute_arc_flash_id(context, results)
        return ArcFlashView(
            analysis_id=analysis_id,
            context=context,
            status=view_status,
            unverified_tag=ARC_FLASH_UNVERIFIED_TAG,
            unverified_note_pl=ARC_FLASH_UNVERIFIED_NOTE_PL,
            results=results,
        )

    # ------------------------------------------------------------------

    def _incomplete_result(self, item: ArcFlashInput, missing: list[str]) -> ArcFlashResult:
        why = (
            "Dane niekompletne — brak: "
            + ", ".join(missing)
            + ". Model Arc Flash wymaga prądu zwarcia bolted I_bf (z solvera "
            "IEC 60909), napięcia U oraz czasu łuku t (z koordynacji "
            "zabezpieczeń). Wejścia NIE są zmyślane."
        )
        return ArcFlashResult(
            bus_ref=item.bus_ref,
            status=ArcFlashVerificationStatus.INCOMPLETE_INPUT,
            unverified_tag=ARC_FLASH_UNVERIFIED_TAG,
            unverified_note_pl=ARC_FLASH_UNVERIFIED_NOTE_PL,
            no_worked_example_note_pl=ARC_FLASH_NO_WORKED_EXAMPLE_NOTE_PL,
            electrode_config=item.electrode_config.value,
            i_bf_ka=item.i_bf_ka,
            voltage_kv=item.voltage_kv,
            arc_time_s=item.arc_time_s,
            conductor_gap_mm=item.conductor_gap_mm,
            working_distance_mm=item.working_distance_mm,
            i_arc_ka=None,
            enclosure_correction_cf=None,
            incident_energy_cal_cm2=None,
            arc_flash_boundary_mm=None,
            ppe_category=None,
            coefficient_provenance=(),
            why_pl=why,
            missing_data=tuple(missing),
            white_box=(),
        )

    def _build_result(self, item: ArcFlashInput) -> ArcFlashResult:
        # 1) Walidacja wejść (bez zmyślania). Obowiązkowe: I_bf, U, t.
        missing: list[str] = []
        if item.i_bf_ka is None or item.i_bf_ka <= 0.0:
            missing.append("i_bf_ka")
        if item.voltage_kv is None or item.voltage_kv <= 0.0:
            missing.append("voltage_kv")
        if item.arc_time_s is None or item.arc_time_s <= 0.0:
            missing.append("arc_time_s")
        if missing:
            return self._incomplete_result(item, missing)

        cfg = item.electrode_config
        i_bf = float(item.i_bf_ka)  # type: ignore[arg-type]
        voltage = float(item.voltage_kv)  # type: ignore[arg-type]
        arc_time = float(item.arc_time_s)  # type: ignore[arg-type]
        gap = float(item.conductor_gap_mm) if item.conductor_gap_mm else DEFAULT_CONDUCTOR_GAP_MM
        working_distance = (
            float(item.working_distance_mm)
            if item.working_distance_mm
            else DEFAULT_WORKING_DISTANCE_MM
        )

        arc_coeffs = ARC_CURRENT_COEFFS[cfg]
        e_coeffs = INCIDENT_ENERGY_COEFFS[cfg]

        steps: list[WhiteBoxStep] = []

        # 2) Prąd łuku I_arc (log-liniowy, STRUKTURA §4.3).
        i_arc = self._arc_current(i_bf, gap, arc_coeffs)
        steps.append(
            WhiteBoxStep(
                symbol="I_arc",
                formula_latex=(
                    r"\log_{10} I_{arc} = k_1 + k_2 \log_{10} I_{bf} " r"+ k_3 \log_{10} G"
                ),
                substitution_pl=(
                    f"k1={arc_coeffs.k1}, k2={arc_coeffs.k2}, k3={arc_coeffs.k3}; "
                    f"I_bf={_round(i_bf)} kA, G={_round(gap)} mm "
                    f"[{cfg.value}; {ARC_FLASH_UNVERIFIED_TAG}]"
                ),
                result_pl=f"I_arc = {_round(i_arc)} kA (best-effort, niezweryfikowany)",
                unit_check_pl="I_bf,I_arc w kA; G w mm; log-liniowo bezwymiarowe w logarytmie.",
            )
        )

        # 3) Korekcja rozmiaru obudowy CF (STRUKTURA §4.5) — tylko dla obudowy.
        cf = self._enclosure_correction(item)
        steps.append(
            WhiteBoxStep(
                symbol="CF",
                formula_latex=r"E = E_{ref} \cdot CF \quad (CF=1 \text{ w otwartym powietrzu})",
                substitution_pl=(
                    f"konfiguracja {cfg.value} "
                    f"({'w obudowie' if cfg.is_boxed else 'otwarte powietrze'}); "
                    f"CF best-effort [{ARC_FLASH_UNVERIFIED_TAG}]"
                ),
                result_pl=f"CF = {_round(cf)} (best-effort)",
                unit_check_pl="CF bezwymiarowe; mnożnik energii dla obudowy (§4.5).",
            )
        )

        # 4) Energia incydentu E na odległości roboczej (STRUKTURA §4.6).
        e_n = self._normalized_energy(i_arc, gap, e_coeffs)
        incident_energy = self._incident_energy(
            i_arc, gap, arc_time, working_distance, cf, e_coeffs
        )
        steps.append(
            WhiteBoxStep(
                symbol="E",
                formula_latex=(
                    r"\log_{10} E_n = c_1 + c_2 \log_{10} I_{arc} + c_3 G \;;\quad "
                    r"E = \frac{CF \cdot E_n}{4{,}184}\cdot\frac{t}{0{,}2}"
                    r"\left(\frac{610}{D}\right)^{x}"
                ),
                substitution_pl=(
                    f"c1={e_coeffs.c1}, c2={e_coeffs.c2}, c3={e_coeffs.c3}, "
                    f"x={e_coeffs.distance_exponent_x}; "
                    f"I_arc={_round(i_arc)} kA, G={_round(gap)} mm, t={_round(arc_time)} s, "
                    f"D={_round(working_distance)} mm, CF={_round(cf)}, "
                    f"E_n={_round(e_n)} J/cm² [{ARC_FLASH_UNVERIFIED_TAG}]"
                ),
                result_pl=(
                    f"E = {_round(incident_energy)} cal/cm² (best-effort, niezweryfikowany)"
                ),
                unit_check_pl=(
                    "E_n w J/cm² (610 mm, 0,2 s); 1/4,184 J/cm²→cal/cm²; "
                    "t/0,2 i 610/D bezwymiarowe."
                ),
            )
        )

        # 5) Granica łuku AFB (odległość, na której E = 1,2 cal/cm²; §4.7).
        afb = self._arc_flash_boundary(i_arc, gap, arc_time, cf, e_coeffs)
        steps.append(
            WhiteBoxStep(
                symbol="AFB",
                formula_latex=(
                    r"D_{AFB} = 610 \left(\frac{CF\cdot E_n\cdot (t/0{,}2)}"
                    r"{1{,}2\cdot 4{,}184}\right)^{1/x}"
                ),
                substitution_pl=(
                    f"E_próg = {INCIDENT_ENERGY_AFB_CAL_CM2} cal/cm² = "
                    f"{_round(INCIDENT_ENERGY_AFB_CAL_CM2 * 4.184)} J/cm²; "
                    f"I_arc={_round(i_arc)} kA, t={_round(arc_time)} s, CF={_round(cf)}, "
                    f"E_n={_round(e_n)} J/cm² [{ARC_FLASH_UNVERIFIED_TAG}]"
                ),
                result_pl=f"AFB = {_round(afb)} mm (best-effort, niezweryfikowany)",
                unit_check_pl="D_AFB w mm; odległość, na której E spada do 1,2 cal/cm².",
            )
        )

        # 6) Kategoria ŚOI (progi NFPA 70E, best-effort).
        ppe = self._ppe_category(incident_energy)
        steps.append(
            WhiteBoxStep(
                symbol="ŚOI",
                formula_latex=r"\text{kategoria} = f_{NFPA\,70E}(E)",
                substitution_pl=(
                    f"E = {_round(incident_energy)} cal/cm²; progi best-effort "
                    f"[{ARC_FLASH_UNVERIFIED_TAG}]"
                ),
                result_pl=f"kategoria ŚOI = {ppe} (best-effort, niezweryfikowany)",
                unit_check_pl="E w cal/cm² → kategoria (klasyfikacja jakościowa NFPA 70E).",
            )
        )

        coeff_prov = (
            arc_coeffs.provenance,
            e_coeffs.provenance,
            PPE_PROVENANCE,
        )
        why = self._why_text(
            cfg=cfg,
            i_arc=i_arc,
            incident_energy=incident_energy,
            afb=afb,
            ppe=ppe,
        )

        return ArcFlashResult(
            bus_ref=item.bus_ref,
            status=ArcFlashVerificationStatus.UNVERIFIED_BEST_EFFORT,
            unverified_tag=ARC_FLASH_UNVERIFIED_TAG,
            unverified_note_pl=ARC_FLASH_UNVERIFIED_NOTE_PL,
            no_worked_example_note_pl=ARC_FLASH_NO_WORKED_EXAMPLE_NOTE_PL,
            electrode_config=cfg.value,
            i_bf_ka=_round(i_bf),
            voltage_kv=_round(voltage),
            arc_time_s=_round(arc_time),
            conductor_gap_mm=_round(gap),
            working_distance_mm=_round(working_distance),
            i_arc_ka=_round(i_arc),
            enclosure_correction_cf=_round(cf),
            incident_energy_cal_cm2=_round(incident_energy),
            arc_flash_boundary_mm=_round(afb),
            ppe_category=ppe,
            coefficient_provenance=coeff_prov,
            why_pl=why,
            missing_data=(),
            white_box=tuple(steps),
        )

    # --- równania (STRUKTURA IEEE 1584-2018, współczynniki best-effort) ----

    @staticmethod
    def _arc_current(i_bf_ka: float, gap_mm: float, c: ArcCurrentCoeffs) -> float:
        """Prąd łuku I_arc [kA] — model log-liniowy 2018 (STRUKTURA §4.3).

        log10(I_arc) = k1 + k2*log10(I_bf) + k3*log10(G). Współczynniki best-effort.
        """
        log_iarc = c.k1 + c.k2 * math.log10(i_bf_ka) + c.k3 * math.log10(gap_mm)
        return 10.0**log_iarc

    @staticmethod
    def _enclosure_correction(item: ArcFlashInput) -> float:
        """Współczynnik korekcji rozmiaru obudowy CF (STRUKTURA §4.5, best-effort).

        Otwarte powietrze (VOA/HOA) ⇒ CF = 1 (brak obudowy). W obudowie ⇒ CF
        rośnie powyżej 1 dla małych obudów (skupienie energii). Tu UPROSZCZONA,
        wierna strukturze postać oparta na „rozmiarze ekwiwalentnym” obudowy
        względem odniesienia ~508 mm (20"); pełny model normy używa tablicowych
        współczynników EES per klasa napięcia/konfiguracja — stąd best-effort.
        """
        if not item.electrode_config.is_boxed:
            return 1.0
        ref_mm = 508.0  # odniesienie ~20"
        dims = [
            d
            for d in (
                item.enclosure_width_mm,
                item.enclosure_height_mm,
                item.enclosure_depth_mm,
            )
            if d and d > 0.0
        ]
        if not dims:
            # Brak wymiarów obudowy → typowa rozdzielnica: umiarkowane skupienie.
            return 1.0
        equiv = sum(float(d) for d in dims) / len(dims)
        # Mniejsza obudowa → większy CF (ograniczone do rozsądnego zakresu).
        cf = (ref_mm / equiv) ** 0.5
        return max(1.0, min(cf, 3.0))

    @staticmethod
    def _normalized_energy(i_arc_ka: float, gap_mm: float, c: IncidentEnergyCoeffs) -> float:
        """Energia ZNORMALIZOWANA E_n [J/cm²] na 610 mm / 0,2 s (STRUKTURA §4.6).

        log10(E_n) = c1 + c2*log10(I_arc) + c3*G. c1 ujemne ⇒ E_n ograniczona.
        Współczynniki best-effort.
        """
        log_en = c.c1 + c.c2 * math.log10(i_arc_ka) + c.c3 * gap_mm
        return 10.0**log_en

    @classmethod
    def _incident_energy(
        cls,
        i_arc_ka: float,
        gap_mm: float,
        arc_time_s: float,
        working_distance_mm: float,
        cf: float,
        c: IncidentEnergyCoeffs,
    ) -> float:
        """Energia incydentu E [cal/cm²] na odległości roboczej (STRUKTURA §4.6).

        E[cal/cm²] = CF * E_n * (t/0,2) * (610/D)^x, gdzie E_n to energia
        znormalizowana [J/cm²]; przeliczenie J/cm² → cal/cm² przez 1/4,184.
        Współczynniki best-effort.
        """
        e_n = cls._normalized_energy(i_arc_ka, gap_mm, c)
        e_jcm2 = (
            cf
            * e_n
            * (arc_time_s / REFERENCE_TIME_S)
            * (REFERENCE_DISTANCE_MM / working_distance_mm) ** c.distance_exponent_x
        )
        return e_jcm2 / 4.184  # J/cm² → cal/cm²

    @classmethod
    def _arc_flash_boundary(
        cls,
        i_arc_ka: float,
        gap_mm: float,
        arc_time_s: float,
        cf: float,
        c: IncidentEnergyCoeffs,
    ) -> float:
        """Granica łuku AFB [mm] — odległość, na której E = 1,2 cal/cm² (§4.7).

        Odwrócenie modelu energii względem D:
            (610/D)^x = E_próg[J/cm²] / (CF * E_n * (t/0,2))
        gdzie E_próg = 1,2 cal/cm² * 4,184 = 5,0208 J/cm². Współczynniki best-effort.
        """
        e_n = cls._normalized_energy(i_arc_ka, gap_mm, c)
        e_threshold_jcm2 = INCIDENT_ENERGY_AFB_CAL_CM2 * 4.184
        denom = cf * e_n * (arc_time_s / REFERENCE_TIME_S)
        ratio = e_threshold_jcm2 / denom  # = (610/D)^x
        # D = 610 / ratio^(1/x)
        return REFERENCE_DISTANCE_MM / (ratio ** (1.0 / c.distance_exponent_x))

    @staticmethod
    def _ppe_category(incident_energy_cal_cm2: float) -> str:
        """Kategoria ŚOI z progów NFPA 70E (best-effort)."""
        for threshold, category in PPE_THRESHOLDS_CAL_CM2:
            if incident_energy_cal_cm2 < threshold:
                return category
        return PPE_OVER_LIMIT_LABEL

    @staticmethod
    def _why_text(
        *,
        cfg: ElectrodeConfig,
        i_arc: float,
        incident_energy: float,
        afb: float,
        ppe: str,
    ) -> str:
        return (
            f"Arc Flash (konfiguracja {cfg.value}): prąd łuku I_arc ≈ {_round(i_arc, 2)} kA, "
            f"energia incydentu E ≈ {_round(incident_energy, 2)} cal/cm² na odległości "
            f"roboczej, granica łuku AFB ≈ {_round(afb, 1)} mm, kategoria ŚOI = {ppe}. "
            f"UWAGA: {ARC_FLASH_UNVERIFIED_NOTE_PL}. {ARC_FLASH_NO_WORKED_EXAMPLE_NOTE_PL}. "
            "Wartości WYŁĄCZNIE poglądowe — nie wolno ich użyć jako autorytatywnych "
            "wartości bezpieczeństwa bez weryfikacji wobec autorytatywnych tablic normy."
        )
