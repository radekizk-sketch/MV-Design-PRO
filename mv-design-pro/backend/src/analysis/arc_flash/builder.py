"""Builder Arc Flash — równania IEEE 1584-2018 (publiczne) na współczynnikach z danych.

Liczy prąd łuku, zmienność, energię incydentu, granicę łuku i kategorię ŚOI wg
RÓWNAŃ opublikowanych w IEEE 1584-2018, z pełnym wywodem White Box. Równania są
publiczne; WARTOŚCI współczynników pochodzą z TABLICY ładowanej z pliku danych
(open-source MIT rwl/arcflash — proweniencja ``open_source_IEEE_1584``,
audit-pending). Wynik liczy się NAPRAWDĘ, ze statusem
``COMPUTED_IEEE_1584_OPEN_SOURCE`` i polskim zastrzeżeniem. Gdy tablica jest
pusta/niepełna dla konfiguracji, ścieżka IEEE zwraca status ``dane niekompletne
— tablice współczynników IEEE 1584`` (NIE liczbę).

Poza zakresem ważności IEEE 1584-2018 (zwł. > 15 kV) builder przełącza się na
ODRĘBNĄ metodę Ralpha Lee (postać zamknięta, bez tablicy), JAWNIE oznaczoną.

Granica warstw (arch_guard): moduł konsumuje wynik zwarciowy jako zwykłe
wejście (``ArcFlashInput``, odwzorowane z ``ShortCircuitResult`` w warstwie
application) — NIE importuje solvera. ŻADEN współczynnik IEEE/NFPA nie jest tu
zmyślany — brakujący współczynnik to None/BRAK, nigdy fałszywy float. Jedyne
stałe inline to publiczne stałe modelu/fizyki (1,2 cal/cm², stała Lee, przeliczniki
jednostek, napięcia kotew, progi rozmiaru obudowy 508/660,4/1244,6 mm) — NIE
współczynniki regresji.
"""

from __future__ import annotations

import math
from collections.abc import Iterable

from analysis.arc_flash.loader import PRODUCTION_IEEE_1584_TABLE
from analysis.arc_flash.models import (
    ARC_FLASH_COEFF_MISSING_MARKER,
    ARC_FLASH_OPEN_SOURCE_CAVEAT_PL,
    ARC_FLASH_OPEN_SOURCE_PROVENANCE,
    ARC_FLASH_RALPH_LEE_LABEL,
    ARC_FLASH_SOURCE_URLS,
    ARC_FLASH_TABLE_INCOMPLETE_STATUS,
    INCIDENT_ENERGY_AFB_CAL_CM2,
    INCIDENT_ENERGY_AFB_JOULE_CM2,
    INCIDENT_ENERGY_TIME_FACTOR,
    JOULE_PER_CAL_CM2,
    MM_PER_INCH,
    PPE_CATEGORY_INCOMPLETE,
    PRODUCTION_NFPA_70E_PPE_TABLE,
    VALIDITY_IBF_MAX_KA_HV,
    VALIDITY_IBF_MAX_KA_LV,
    VALIDITY_IBF_MIN_KA_HV,
    VALIDITY_IBF_MIN_KA_LV,
    VALIDITY_VOLTAGE_MAX_KV,
    VALIDITY_VOLTAGE_MIN_KV,
    ArcCurrentCoeffs,
    ArcCurrentVariationCoeffs,
    ArcFlashCoefficientTable,
    ArcFlashContext,
    ArcFlashInput,
    ArcFlashMethod,
    ArcFlashResult,
    ArcFlashStatus,
    ArcFlashView,
    ElectrodeConfig,
    EnclosureCorrectionCoeffs,
    EnclosureType,
    IncidentEnergyCoeffs,
    PpeCategoryTable,
    VoltageAnchor,
    WhiteBoxStep,
    compute_arc_flash_id,
)

# Publiczne progi rozmiaru obudowy IEEE 1584-2018 (Tab. 7 / model EES) [mm].
# To ramy modelu (granice przedziałów), nie współczynniki regresji.
_ENCLOSURE_LOW_MM = 508.0
_ENCLOSURE_MID_MM = 660.4
_ENCLOSURE_HIGH_MM = 1244.6
# Domyślny ekwiwalentny wymiar obudowy gdy wymiarów nie podano: publiczna
# „typowa" obudowa 20 cali = 508 mm (gałąź dim<508 → 20" w modelu Tab. 7).
_DEFAULT_BOX_INCH = _ENCLOSURE_LOW_MM / MM_PER_INCH  # 20"
# Tab.6 IEEE 1584-2018: dla konfiguracji VCB WYSOKOŚĆ obudowy > 1244,6 mm ma
# STAŁY limit ekwiwalentny 49" (NIE rośnie dalej wg transformacji eq.11/12,
# w przeciwieństwie do szerokości i do wysokości VCBB/HCB). Publiczna stała
# modelu rozmiaru obudowy, nie współczynnik regresji energii.
_VCB_HEIGHT_CAP_INCH = 49.0


def _round(value: float | None, digits: int = 4) -> float | None:
    if value is None:
        return None
    if not math.isfinite(value):
        return value
    return round(float(value), digits)


class ArcFlashBuilder:
    """Liczy Arc Flash (równania IEEE 1584-2018) z White Box, współczynniki z tablicy.

    NIEZMIENNIK DANYCH BEZPIECZEŃSTWA:
    - Brak obowiązkowego wejścia ⇒ ``INCOMPLETE_INPUT`` ("dane niekompletne").
    - Tablica współczynników pusta/niepełna ⇒ ``INCOMPLETE_TABLE`` ("dane
      niekompletne — tablice współczynników IEEE 1584"); wartości pośrednie None.
    - Poza zakresem ważności ⇒ ``COMPUTED_RALPH_LEE`` (jawnie metoda Lee).
    - Tablica wypełniona (open-source), w zakresie ⇒ ``COMPUTED_IEEE_1584_OPEN_SOURCE``
      (realny wynik + proweniencja open-source, audit-pending).
    ŻADEN współczynnik nie jest zmyślany.
    """

    def __init__(
        self,
        coefficient_table: ArcFlashCoefficientTable | None = None,
        ppe_table: PpeCategoryTable | None = None,
    ) -> None:
        # Domyślnie tablica PRODUKCYJNA wypełniona z pliku danych (open-source).
        # Tablica progów ŚOI jest pusta (brak danych NFPA 70E).
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
        """Status widoku = najgorszy ze statusów.

        Kolejność „najgorszy → najlepszy": brak wejść > brak tablicy > Lee >
        IEEE open-source > IEEE zweryfikowany.
        """
        if not results:
            return ArcFlashStatus.INCOMPLETE_INPUT
        statuses = {r.status for r in results}
        for worst in (
            ArcFlashStatus.INCOMPLETE_INPUT,
            ArcFlashStatus.INCOMPLETE_TABLE,
            ArcFlashStatus.COMPUTED_RALPH_LEE,
            ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE,
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
        """Zakres ważności IEEE 1584-2018 — I_bf ZALEŻNY od klasy napięcia.

        Norma (i referencyjna implementacja open-source rwl/arcflash,
        ``i_arc.rs::i_arc()``) NIE używa jednego wspólnego przedziału I_bf dla
        LV i HV: dla U<=600 V zakres to 500 A-106 kA, dla 600 V<U<=15 kV —
        200 A-65 kA. Jeden wspólny przedział (poprzedni stan kodu) błędnie
        kwalifikował punkty SN z I_bf 200-500 A jako "poza zakresem" i punkty
        z I_bf 65-106 kA jako "w zakresie" — dla narzędzia SN to błąd bramki
        na głównym zakresie zastosowania.
        """
        if not (VALIDITY_VOLTAGE_MIN_KV <= voltage_kv <= VALIDITY_VOLTAGE_MAX_KV):
            return False
        if voltage_kv <= float(VoltageAnchor.V600.value):
            return VALIDITY_IBF_MIN_KA_LV <= i_bf_ka <= VALIDITY_IBF_MAX_KA_LV
        return VALIDITY_IBF_MIN_KA_HV <= i_bf_ka <= VALIDITY_IBF_MAX_KA_HV

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
        """Rozdziela na ścieżkę LV (U<=600 V, Eq.25, bez interpolacji kotew) i HV
        (600 V<U<=15 kV, interpolacja trzech kotew 600/2700/14300 V).

        Norma NIE interpoluje między kotwami dla układów <=600 V — liczy prąd
        łuku pośredni przy kotwie 600 V (Eq.1), po czym KORYGUJE go do
        RZECZYWISTEGO napięcia układu (Eq.25). Zweryfikowane wobec referencyjnej
        implementacji open-source rwl/arcflash (``equations.rs::i_arc_final_lv``,
        ``e_afb.rs::e_afb`` gałąź ``IArc::LowVoltage``).
        """
        if voltage <= float(VoltageAnchor.V600.value):
            return self._ieee_1584_result_lv(
                item,
                i_bf=i_bf,
                voltage=voltage,
                arc_time=arc_time,
                gap=gap,
                working_distance=working_distance,
            )
        return self._ieee_1584_result_hv(
            item,
            i_bf=i_bf,
            voltage=voltage,
            arc_time=arc_time,
            gap=gap,
            working_distance=working_distance,
        )

    def _ieee_1584_result_hv(
        self,
        item: ArcFlashInput,
        *,
        i_bf: float,
        voltage: float,
        arc_time: float,
        gap: float,
        working_distance: float,
    ) -> ArcFlashResult:
        """Ścieżka HV/SN (600 V<U<=15 kV): interpolacja trzech kotew napięcia."""
        cfg = item.electrode_config
        enc_type = item.enclosure_type
        table = self._table

        # Tablica niewypełniona dla tej konfiguracji ⇒ "dane niekompletne — tablice".
        if not table.is_complete_for(cfg, enc_type):
            return self._incomplete_table_result(item, table.missing_for(cfg, enc_type))

        arc_time_ms = arc_time * 1000.0  # równanie energii IEEE używa t w ms
        steps: list[WhiteBoxStep] = []

        # 3a) Prąd łuku I_arc w trzech kotwach + interpolacja po U (Tab. 1, Eq 1).
        i_arc_anchors: dict[str, float] = {}
        for anchor in VoltageAnchor:
            coeffs = table.arc_entry(cfg, anchor)
            i_arc_anchors[anchor.name] = self._arc_current_at_anchor(i_bf, gap, coeffs)
        i_arc = self._interpolate_anchor(voltage, i_arc_anchors)

        # 3b) Zmienność prądu łuku var_cf i prąd minimalny (Tab. 2, Eq 2/25).
        var_cf = self._arc_variation_cf(voltage, table.variation_entry(cfg))
        i_arc_min = i_arc * (1.0 - 0.5 * var_cf)
        steps.append(
            WhiteBoxStep(
                symbol="I_arc",
                formula_latex=(
                    r"I_{arc,kotwa} = 10^{k_1+k_2\lg I_{bf}+k_3\lg G}\cdot"
                    r"\sum_{i} k_{i}\,I_{bf}^{\,p_i}\;;\quad "
                    r"I_{arc}=\mathrm{interp}_{U}(\cdot)\;;\quad "
                    r"I_{arc,min}=I_{arc}(1-0{,}5\,\mathrm{VarCf})"
                ),
                substitution_pl=(
                    f"I_bf={_round(i_bf)} kA, G={_round(gap)} mm, U={_round(voltage)} kV "
                    f"[{cfg.value}]; kotwy: "
                    + ", ".join(f"{k}={_round(v)} kA" for k, v in sorted(i_arc_anchors.items()))
                    + f"; VarCf={_round(var_cf)}"
                ),
                result_pl=(
                    f"I_arc = {_round(i_arc)} kA, I_arc_min = {_round(i_arc_min)} kA "
                    "(IEEE 1584-2018, współczynniki open-source)"
                ),
                unit_check_pl=(
                    "I_bf,I_arc w kA; G w mm; VarCf bezwymiarowe; interpolacja po U [kV]."
                ),
                table_ref=(
                    f"I_arc[{cfg.value}, kotwy 600/2700/14300 V] (Tab.1) + "
                    f"VarCf[{cfg.value}] (Tab.2) = open_source_IEEE_1584"
                ),
            )
        )

        # 3c) Korekcja rozmiaru obudowy CF (Tab. 7; CF=1 w otwartym powietrzu).
        cf = self._enclosure_correction(item, table.enclosure_entry(enc_type, cfg))
        steps.append(
            WhiteBoxStep(
                symbol="CF",
                formula_latex=(
                    r"CF = b_1\,EES^2 + b_2\,EES + b_3 \quad"
                    r"(CF=1 \text{ w otwartym powietrzu; } CF=1/x \text{ obudowa płytka})"
                ),
                substitution_pl=(
                    f"konfiguracja {cfg.value} "
                    f"({'w obudowie ' + enc_type.value if cfg.is_boxed else 'otwarte powietrze'})"
                ),
                result_pl=f"CF = {_round(cf)}",
                unit_check_pl="CF bezwymiarowe; EES w calach; mnożnik energii dla obudowy.",
                table_ref=(
                    f"CF[{enc_type.value},{cfg.value}] (Tab.7) = open_source_IEEE_1584"
                    if cfg.is_boxed
                    else "CF = 1 (otwarte powietrze, brak wpisu tablicy)"
                ),
            )
        )

        # 3d) Energia incydentu E [J/cm²] na odległości roboczej (Tab. 3/4/5, Eq 3-6).
        #     Każda kotwa używa SWOJEGO I_arc kotwy; wynik interpolowany po U.
        e_anchors_jcm2: dict[str, float] = {}
        for anchor in VoltageAnchor:
            e_anchors_jcm2[anchor.name] = self._incident_energy_at_anchor(
                i_bf,
                i_arc_anchors[anchor.name],
                gap,
                arc_time_ms,
                working_distance,
                cf,
                table.energy_entry(cfg, anchor),
            )
        incident_energy_jcm2 = self._interpolate_anchor(voltage, e_anchors_jcm2)
        incident_energy_cal = incident_energy_jcm2 / JOULE_PER_CAL_CM2
        steps.append(
            WhiteBoxStep(
                symbol="E",
                formula_latex=(
                    r"E_{kotwa} = \tfrac{12{,}552}{50}\,t\cdot 10^{\,x_2+x_3+x_4+x_5}\;;\quad "
                    r"x_4 = k_{11}\lg I_{bf}+k_{13}\lg I_{arc}+\lg(1/CF)\;;\quad "
                    r"x_5 = k_{12}\lg D\;;\quad E=\mathrm{interp}_U(\cdot)\;[\mathrm{J/cm^2}]"
                ),
                substitution_pl=(
                    f"I_bf={_round(i_bf)} kA, G={_round(gap)} mm, t={_round(arc_time_ms)} ms, "
                    f"D={_round(working_distance)} mm, CF={_round(cf)}; kotwy: "
                    + ", ".join(f"{k}={_round(v)} J/cm²" for k, v in sorted(e_anchors_jcm2.items()))
                ),
                result_pl=(
                    f"E = {_round(incident_energy_jcm2)} J/cm² = "
                    f"{_round(incident_energy_cal)} cal/cm² "
                    "(IEEE 1584-2018, współczynniki open-source)"
                ),
                unit_check_pl=(
                    "E w J/cm² (t w ms, D w mm); 1/4,184 J/cm²→cal/cm²; interpolacja po U."
                ),
                table_ref=f"E[{cfg.value}, kotwy 600/2700/14300 V] (Tab.3/4/5) = open_source_IEEE_1584",
            )
        )

        # 3e) Granica łuku AFB — odległość, na której E = 1,2 cal/cm² (= 5,0208 J/cm²).
        afb = self._arc_flash_boundary(voltage, e_anchors_jcm2, working_distance, cfg, table)
        steps.append(
            WhiteBoxStep(
                symbol="AFB",
                formula_latex=(
                    r"D_{AFB,kotwa} = \left(\frac{5{,}0208}{E/D^{k_{12}}}\right)^{1/k_{12}}"
                    r"\quad(\mathrm{interp}_U);\quad 5{,}0208\,\mathrm{J/cm^2}=1{,}2\,\mathrm{cal/cm^2}"
                ),
                substitution_pl=(
                    f"E_próg = {INCIDENT_ENERGY_AFB_CAL_CM2} cal/cm² = "
                    f"{_round(INCIDENT_ENERGY_AFB_JOULE_CM2)} J/cm²; "
                    f"U={_round(voltage)} kV, D={_round(working_distance)} mm"
                ),
                result_pl=(f"AFB = {_round(afb)} mm (IEEE 1584-2018, współczynniki open-source)"),
                unit_check_pl="D_AFB w mm; odległość, na której E spada do 1,2 cal/cm².",
                table_ref=(
                    f"E[{cfg.value}] (odwrócone wzgl. D) (Tab.3/4/5) = open_source_IEEE_1584; "
                    "próg 1,2 cal/cm² publiczny"
                ),
            )
        )

        # 3f) Kategoria ŚOI (progi NFPA 70E — tablica PUSTA ⇒ "dane niekompletne").
        ppe, ppe_prov = self._ppe_category(incident_energy_cal)
        steps.append(
            WhiteBoxStep(
                symbol="ŚOI",
                formula_latex=r"\text{kategoria} = f_{NFPA\,70E}(E)",
                substitution_pl=(
                    f"E = {_round(incident_energy_cal)} cal/cm²; tablica progów NFPA 70E: "
                    + ("PUSTA (dane niekompletne)" if self._ppe_table.is_empty else "wypełniona")
                ),
                result_pl=f"kategoria ŚOI = {ppe}",
                unit_check_pl="E w cal/cm² → kategoria (klasyfikacja jakościowa NFPA 70E).",
                table_ref=(
                    f"{ARC_FLASH_COEFF_MISSING_MARKER} (tablice NFPA 70E)"
                    if self._ppe_table.is_empty
                    else f"progi ŚOI = {self._ppe_table.provenance.value}"
                ),
            )
        )

        why = (
            f"Arc Flash (konfiguracja {cfg.value}, IEEE 1584-2018): prąd łuku "
            f"I_arc ≈ {_round(i_arc, 2)} kA (I_arc_min ≈ {_round(i_arc_min, 2)} kA), energia "
            f"incydentu E ≈ {_round(incident_energy_cal, 2)} cal/cm² na odległości roboczej, "
            f"granica łuku AFB ≈ {_round(afb, 1)} mm, kategoria ŚOI = {ppe}. "
            f"{ARC_FLASH_OPEN_SOURCE_CAVEAT_PL}."
        )

        return ArcFlashResult(
            bus_ref=item.bus_ref,
            status=ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE,
            method=ArcFlashMethod.IEEE_1584_2018,
            electrode_config=cfg.value,
            i_bf_ka=_round(i_bf),
            voltage_kv=_round(voltage),
            arc_time_s=_round(arc_time),
            conductor_gap_mm=_round(gap),
            working_distance_mm=_round(working_distance),
            coefficient_table_provenance=table.provenance.value,
            coefficient_table_marker=None,
            provenance=ARC_FLASH_OPEN_SOURCE_PROVENANCE,
            provenance_caveat_pl=ARC_FLASH_OPEN_SOURCE_CAVEAT_PL,
            source_urls=table.source_urls or ARC_FLASH_SOURCE_URLS,
            i_arc_ka=_round(i_arc),
            i_arc_min_ka=_round(i_arc_min),
            i_arc_at_anchors_ka={k: _round(v) for k, v in i_arc_anchors.items()},
            arc_variation_cf=_round(var_cf),
            enclosure_correction_cf=_round(cf),
            incident_energy_cal_cm2=_round(incident_energy_cal),
            incident_energy_joule_cm2=_round(incident_energy_jcm2),
            arc_flash_boundary_mm=_round(afb),
            ppe_category=ppe,
            ppe_table_provenance=ppe_prov,
            why_pl=why,
            missing_data=(),
            white_box=tuple(steps),
        )

    # --- ścieżka LV (U<=600 V): Eq.1 @ kotwa 600 V + korekcja Eq.25 ------

    def _ieee_1584_result_lv(
        self,
        item: ArcFlashInput,
        *,
        i_bf: float,
        voltage: float,
        arc_time: float,
        gap: float,
        working_distance: float,
    ) -> ArcFlashResult:
        """Ścieżka LV/niskie napięcie (U<=600 V) — BEZ interpolacji kotew.

        Norma IEEE 1584-2018 dla U<=600 V liczy prąd łuku pośredni I_arc,600
        przy kotwie 600 V (Eq.1, Tab.1), po czym KORYGUJE go do RZECZYWISTEGO
        napięcia układu (Eq.25, postać zamknięta, publiczna — bez tablicy).
        Energia (Eq.6, Tab.3 — wiersz 600 V) używa I_arc,600 (NIESKORYGOWANY,
        Eq.1) w członie x3 i I_arc SKORYGOWANEGO (Eq.25) w członie x4 —
        zweryfikowane wobec referencyjnej implementacji open-source
        rwl/arcflash (``equations.rs::intermediate_e``, gałąź LV).

        Bez korekcji Eq.25 układ 208 V liczyłby się TAK, jakby miał 600 V —
        błąd energii incydentu rzędu dziesiątek procent (np. ok. 46% zawyżenia
        prądu łuku dla typowego przypadku 208 V/20 kA/32 mm — patrz test
        reprodukujący defekt w tests/analysis/test_arc_flash.py).
        """
        cfg = item.electrode_config
        enc_type = item.enclosure_type
        table = self._table

        if not table.is_complete_for(cfg, enc_type):
            return self._incomplete_table_result(item, table.missing_for(cfg, enc_type))

        arc_time_ms = arc_time * 1000.0
        steps: list[WhiteBoxStep] = []

        arc_coeffs_600 = table.arc_entry(cfg, VoltageAnchor.V600)
        i_arc_600 = self._arc_current_at_anchor(i_bf, gap, arc_coeffs_600)
        i_arc = self._arc_current_final_lv(voltage, i_arc_600, i_bf)

        var_cf = self._arc_variation_cf(voltage, table.variation_entry(cfg))
        i_arc_min = i_arc * (1.0 - 0.5 * var_cf)
        steps.append(
            WhiteBoxStep(
                symbol="I_arc",
                formula_latex=(
                    r"I_{arc,600} = 10^{k_1+k_2\lg I_{bf}+k_3\lg G}\cdot"
                    r"\sum_{i} k_{i}\,I_{bf}^{\,p_i}\quad(\text{Eq.1, kotwa }600\text{ V});\quad"
                    r"I_{arc} = \left[\left(\tfrac{0{,}6}{U}\right)^{2}"
                    r"\!\left(\tfrac{1}{I_{arc,600}^{2}}-\tfrac{0{,}6^{2}-U^{2}}"
                    r"{0{,}6^{2}\,I_{bf}^{2}}\right)\right]^{-1/2}\quad(\text{Eq.25});\quad"
                    r"I_{arc,min}=I_{arc}(1-0{,}5\,\mathrm{VarCf})"
                ),
                substitution_pl=(
                    f"I_bf={_round(i_bf)} kA, G={_round(gap)} mm, U={_round(voltage)} kV "
                    f"[{cfg.value}, ścieżka LV — U<=600 V, BEZ interpolacji kotew]; "
                    f"I_arc,600(Eq.1)={_round(i_arc_600)} kA; VarCf={_round(var_cf)}"
                ),
                result_pl=(
                    f"I_arc = {_round(i_arc)} kA (Eq.25, skorygowany do U={_round(voltage)} kV), "
                    f"I_arc_min = {_round(i_arc_min)} kA "
                    "(IEEE 1584-2018, współczynniki open-source)"
                ),
                unit_check_pl=(
                    "I_bf,I_arc,I_arc,600 w kA; G w mm; U w kV; Eq.25 koryguje prąd łuku "
                    "kotwy 600 V do RZECZYWISTEGO napięcia układu (≤600 V)."
                ),
                table_ref=(
                    f"I_arc,600[{cfg.value},V600] (Tab.1) = open_source_IEEE_1584; "
                    "Eq.25 publiczna postać zamknięta (bez tablicy)"
                ),
            )
        )

        cf = self._enclosure_correction(item, table.enclosure_entry(enc_type, cfg))
        steps.append(
            WhiteBoxStep(
                symbol="CF",
                formula_latex=(
                    r"CF = b_1\,EES^2 + b_2\,EES + b_3 \quad"
                    r"(CF=1 \text{ w otwartym powietrzu; } CF=1/x \text{ obudowa płytka})"
                ),
                substitution_pl=(
                    f"konfiguracja {cfg.value} "
                    f"({'w obudowie ' + enc_type.value if cfg.is_boxed else 'otwarte powietrze'})"
                ),
                result_pl=f"CF = {_round(cf)}",
                unit_check_pl="CF bezwymiarowe; EES w calach; mnożnik energii dla obudowy.",
                table_ref=(
                    f"CF[{enc_type.value},{cfg.value}] (Tab.7) = open_source_IEEE_1584"
                    if cfg.is_boxed
                    else "CF = 1 (otwarte powietrze, brak wpisu tablicy)"
                ),
            )
        )

        energy_coeffs_600 = table.energy_entry(cfg, VoltageAnchor.V600)
        incident_energy_jcm2 = self._incident_energy_lv(
            i_bf,
            i_arc,
            i_arc_600,
            gap,
            arc_time_ms,
            working_distance,
            cf,
            energy_coeffs_600,
        )
        incident_energy_cal = incident_energy_jcm2 / JOULE_PER_CAL_CM2
        steps.append(
            WhiteBoxStep(
                symbol="E",
                formula_latex=(
                    r"E = \tfrac{12{,}552}{50}\,t\cdot 10^{\,x_2+x_3+x_4+x_5}\;;\quad "
                    r"x_3 = k_3\,I_{arc,600}/\mathrm{denom}(I_{bf})\;;\quad "
                    r"x_4 = k_{11}\lg I_{bf}+k_{13}\lg I_{arc}+\lg(1/CF)\;[\mathrm{J/cm^2}]"
                ),
                substitution_pl=(
                    f"I_bf={_round(i_bf)} kA, I_arc,600={_round(i_arc_600)} kA (nieskorygowany, "
                    f"człon x3), I_arc={_round(i_arc)} kA (Eq.25, człon x4), G={_round(gap)} mm, "
                    f"t={_round(arc_time_ms)} ms, D={_round(working_distance)} mm, CF={_round(cf)} "
                    f"[wiersz kotwy 600 V, U rzeczywiste={_round(voltage)} kV]"
                ),
                result_pl=(
                    f"E = {_round(incident_energy_jcm2)} J/cm² = "
                    f"{_round(incident_energy_cal)} cal/cm² "
                    "(IEEE 1584-2018, współczynniki open-source)"
                ),
                unit_check_pl=(
                    "E w J/cm² (t w ms, D w mm); 1/4,184 J/cm²→cal/cm²; BEZ interpolacji "
                    "po U (ścieżka LV liczy bezpośrednio dla U rzeczywistego)."
                ),
                table_ref=f"E[{cfg.value},V600] (Tab.3) = open_source_IEEE_1584",
            )
        )

        afb = self._arc_flash_boundary_lv(working_distance, incident_energy_jcm2, energy_coeffs_600)
        steps.append(
            WhiteBoxStep(
                symbol="AFB",
                formula_latex=(
                    r"D_{AFB} = \left(\frac{5{,}0208}{E/D^{k_{12}}}\right)^{1/k_{12}}"
                    r"\quad(\text{wiersz 600 V});\quad 5{,}0208\,\mathrm{J/cm^2}=1{,}2\,\mathrm{cal/cm^2}"
                ),
                substitution_pl=(
                    f"E_próg = {INCIDENT_ENERGY_AFB_CAL_CM2} cal/cm² = "
                    f"{_round(INCIDENT_ENERGY_AFB_JOULE_CM2)} J/cm²; "
                    f"U={_round(voltage)} kV, D={_round(working_distance)} mm"
                ),
                result_pl=(f"AFB = {_round(afb)} mm (IEEE 1584-2018, współczynniki open-source)"),
                unit_check_pl="D_AFB w mm; odległość, na której E spada do 1,2 cal/cm².",
                table_ref=(
                    f"E[{cfg.value},V600] (odwrócone wzgl. D) (Tab.3) = open_source_IEEE_1584; "
                    "próg 1,2 cal/cm² publiczny"
                ),
            )
        )

        ppe, ppe_prov = self._ppe_category(incident_energy_cal)
        steps.append(
            WhiteBoxStep(
                symbol="ŚOI",
                formula_latex=r"\text{kategoria} = f_{NFPA\,70E}(E)",
                substitution_pl=(
                    f"E = {_round(incident_energy_cal)} cal/cm²; tablica progów NFPA 70E: "
                    + ("PUSTA (dane niekompletne)" if self._ppe_table.is_empty else "wypełniona")
                ),
                result_pl=f"kategoria ŚOI = {ppe}",
                unit_check_pl="E w cal/cm² → kategoria (klasyfikacja jakościowa NFPA 70E).",
                table_ref=(
                    f"{ARC_FLASH_COEFF_MISSING_MARKER} (tablice NFPA 70E)"
                    if self._ppe_table.is_empty
                    else f"progi ŚOI = {self._ppe_table.provenance.value}"
                ),
            )
        )

        why = (
            f"Arc Flash LV (konfiguracja {cfg.value}, IEEE 1584-2018, U<=600 V — Eq.25): "
            f"prąd łuku I_arc,600 (Eq.1) ≈ {_round(i_arc_600, 2)} kA skorygowany do U="
            f"{_round(voltage, 2)} kV ⇒ I_arc ≈ {_round(i_arc, 2)} kA "
            f"(I_arc_min ≈ {_round(i_arc_min, 2)} kA), energia incydentu E ≈ "
            f"{_round(incident_energy_cal, 2)} cal/cm² na odległości roboczej, granica łuku "
            f"AFB ≈ {_round(afb, 1)} mm, kategoria ŚOI = {ppe}. {ARC_FLASH_OPEN_SOURCE_CAVEAT_PL}."
        )

        return ArcFlashResult(
            bus_ref=item.bus_ref,
            status=ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE,
            method=ArcFlashMethod.IEEE_1584_2018,
            electrode_config=cfg.value,
            i_bf_ka=_round(i_bf),
            voltage_kv=_round(voltage),
            arc_time_s=_round(arc_time),
            conductor_gap_mm=_round(gap),
            working_distance_mm=_round(working_distance),
            coefficient_table_provenance=table.provenance.value,
            coefficient_table_marker=None,
            provenance=ARC_FLASH_OPEN_SOURCE_PROVENANCE,
            provenance_caveat_pl=ARC_FLASH_OPEN_SOURCE_CAVEAT_PL,
            source_urls=table.source_urls or ARC_FLASH_SOURCE_URLS,
            i_arc_ka=_round(i_arc),
            i_arc_min_ka=_round(i_arc_min),
            i_arc_at_anchors_ka={"V600": _round(i_arc_600)},
            arc_variation_cf=_round(var_cf),
            enclosure_correction_cf=_round(cf),
            incident_energy_cal_cm2=_round(incident_energy_cal),
            incident_energy_joule_cm2=_round(incident_energy_jcm2),
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
                    + ("PUSTA (dane niekompletne)" if self._ppe_table.is_empty else "wypełniona")
                ),
                result_pl=f"kategoria ŚOI = {ppe}",
                unit_check_pl="E w cal/cm² → kategoria (klasyfikacja jakościowa NFPA 70E).",
                table_ref=(
                    f"{ARC_FLASH_COEFF_MISSING_MARKER} (tablice NFPA 70E)"
                    if self._ppe_table.is_empty
                    else f"progi ŚOI = {self._ppe_table.provenance.value}"
                ),
            )
        )

        ibf_range_pl = (
            f"{VALIDITY_IBF_MIN_KA_LV * 1000:.0f} A–{VALIDITY_IBF_MAX_KA_LV:.0f} kA (U<=600 V)"
            if voltage <= float(VoltageAnchor.V600.value)
            else f"{VALIDITY_IBF_MIN_KA_HV * 1000:.0f} A–{VALIDITY_IBF_MAX_KA_HV:.0f} kA (600 V<U<=15 kV)"
        )
        why = (
            f"POZA zakresem ważności IEEE 1584-2018 (U={_round(voltage, 2)} kV, "
            f"I_bf={_round(i_bf, 2)} kA; zakres: {VALIDITY_VOLTAGE_MIN_KV*1000:.0f} V–"
            f"{VALIDITY_VOLTAGE_MAX_KV:.0f} kV, I_bf {ibf_range_pl} dla tej klasy napięcia). "
            f"Zastosowano {ARC_FLASH_RALPH_LEE_LABEL}: "
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
            provenance=None,  # metoda Lee to postać zamknięta, nie współczynniki open-source
            provenance_caveat_pl=None,
            source_urls=(),
            i_arc_ka=None,  # metoda Lee nie liczy I_arc (zakłada bolted)
            i_arc_min_ka=None,
            i_arc_at_anchors_ka=None,
            arc_variation_cf=None,
            enclosure_correction_cf=None,
            incident_energy_cal_cm2=_round(e_lee),
            incident_energy_joule_cm2=_round(e_lee * JOULE_PER_CAL_CM2),
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
            + f". {ARC_FLASH_COEFF_MISSING_MARKER}. Równania modelu są gotowe — "
            "po wstawieniu kompletu współczynników IEEE 1584-2018 ten sam przepływ "
            "policzy wynik. Współczynniki NIE są zmyślane."
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
            provenance=None,
            provenance_caveat_pl=None,
            source_urls=(),
            i_arc_ka=None,
            i_arc_min_ka=None,
            i_arc_at_anchors_ka=None,
            arc_variation_cf=None,
            enclosure_correction_cf=None,
            incident_energy_cal_cm2=None,
            incident_energy_joule_cm2=None,
            arc_flash_boundary_mm=None,
            ppe_category=None,
            ppe_table_provenance=None,
            why_pl=why,
            missing_data=missing,
            white_box=(),
        )

    # --- równania (IEEE 1584-2018, współczynniki z TABLICY) -------------

    @staticmethod
    def _arc_current_at_anchor(i_bf_ka: float, gap_mm: float, c: ArcCurrentCoeffs) -> float:
        """Prąd łuku pośredni I_arc [kA] dla JEDNEJ kotwy (IEEE 1584-2018, Eq 1).

        x1 = k1 + k2·lg(I_bf) + k3·lg(G)
        x2 = k4·I_bf^6 + k5·I_bf^5 + k6·I_bf^4 + k7·I_bf^3 + k8·I_bf^2 + k9·I_bf + k10
        I_arc = 10^x1 · x2
        Współczynniki ``c.k`` = k1..k10 z TABLICY. (Pusta tablica nie dotrze tutaj:
        ścieżka blokowana wcześniej przez ``is_complete_for``.)
        """
        assert c.k is not None and len(c.k) == 10  # gwarantowane przez is_complete_for
        k = c.k
        x1 = k[0] + k[1] * math.log10(i_bf_ka) + k[2] * math.log10(gap_mm)
        x2 = (
            k[3] * i_bf_ka**6
            + k[4] * i_bf_ka**5
            + k[5] * i_bf_ka**4
            + k[6] * i_bf_ka**3
            + k[7] * i_bf_ka**2
            + k[8] * i_bf_ka
            + k[9]
        )
        return float(10.0**x1 * x2)

    @staticmethod
    def _arc_variation_cf(voltage_kv: float, c: ArcCurrentVariationCoeffs) -> float:
        """Współczynnik zmienności prądu łuku VarCf (IEEE 1584-2018, Tab. 2, Eq 2).

        VarCf = k1·V_oc^6 + k2·V_oc^5 + k3·V_oc^4 + k4·V_oc^3 + k5·V_oc^2
                + k6·V_oc + k7   (V_oc w kV). Współczynniki ``c.k`` = k1..k7 z TABLICY.
        """
        assert c.k is not None and len(c.k) == 7
        k = c.k
        return (
            k[0] * voltage_kv**6
            + k[1] * voltage_kv**5
            + k[2] * voltage_kv**4
            + k[3] * voltage_kv**3
            + k[4] * voltage_kv**2
            + k[5] * voltage_kv
            + k[6]
        )

    @staticmethod
    def _arc_current_final_lv(voltage_kv: float, i_arc_600_ka: float, i_bf_ka: float) -> float:
        """Prąd łuku SKORYGOWANY do rzeczywistego napięcia LV (IEEE 1584-2018, Eq 25).

        I_arc = [ (0,6/U)^2 · (1/I_arc,600^2 − (0,6^2−U^2)/(0,6^2·I_bf^2)) ]^(−1/2)

        gdzie ``I_arc,600`` to wartość POŚREDNIA z Eq.1 (kotwa 600 V, Tab.1), ``U``
        to RZECZYWISTE napięcie układu [kV] (U<=0,6 kV — NIE kotwa), ``I_bf`` prąd
        zwarcia bolted [kA]. Stała postać zamknięta (publiczna, bez tablicy
        regresji) — stosowana WYŁĄCZNIE dla U<=600 V. Bez tej korekcji układ 208 V
        liczyłby się tak, jakby miał dokładnie 600 V (błąd rzędu dziesiątek %).
        Zweryfikowane wobec referencyjnej implementacji open-source rwl/arcflash
        (``equations.rs::i_arc_final_lv``).
        """
        x1 = (0.6 / voltage_kv) ** 2
        x2 = 1.0 / i_arc_600_ka**2
        x3 = (0.6**2 - voltage_kv**2) / (0.6**2 * i_bf_ka**2)
        x4 = math.sqrt(x1 * (x2 - x3))
        return float(1.0 / x4)

    @classmethod
    def _incident_energy_at_anchor(
        cls,
        i_bf_ka: float,
        i_arc_ka: float,
        gap_mm: float,
        arc_time_ms: float,
        working_distance_mm: float,
        cf: float,
        c: IncidentEnergyCoeffs,
    ) -> float:
        """Energia incydentu E [J/cm²] dla JEDNEJ kotwy (IEEE 1584-2018, Eq 3-6).

        x1 = (12,552/50)·t
        x2 = k1 + k2·lg(G)
        x3 = k3·I_arc / (k4·I_bf^7 + k5·I_bf^6 + k6·I_bf^5 + k7·I_bf^4
                          + k8·I_bf^3 + k9·I_bf^2 + k10·I_bf)
        x4 = k11·lg(I_bf) + k13·lg(I_arc) + lg(1/CF)
        x5 = k12·lg(D)
        E  = x1 · 10^(x2 + x3 + x4 + x5)
        Współczynniki ``c.k`` = k1..k13 z TABLICY (t w ms, D w mm).
        """
        assert c.k is not None and len(c.k) == 13
        # Guard dodatniości argumentów log10 (obronny): I_bf i D są zapewnione
        # dodatnie przez _missing_inputs; I_arc jest wielkością obliczoną, a CF
        # mnożnikiem — w modelu IEEE 1584 (w zakresie ważności) obie są dodatnie.
        # Jawny guard zamienia ewentualną domenę log10 na czytelny warunek.
        assert i_arc_ka > 0.0, "I_arc musi być dodatni dla log10 (model IEEE 1584)"
        assert cf > 0.0, "CF musi być dodatni dla log10(1/CF)"
        k = c.k
        x1 = INCIDENT_ENERGY_TIME_FACTOR * arc_time_ms
        x2 = k[0] + k[1] * math.log10(gap_mm)
        denom = (
            k[3] * i_bf_ka**7
            + k[4] * i_bf_ka**6
            + k[5] * i_bf_ka**5
            + k[6] * i_bf_ka**4
            + k[7] * i_bf_ka**3
            + k[8] * i_bf_ka**2
            + k[9] * i_bf_ka
        )
        x3 = (k[2] * i_arc_ka) / denom
        x4 = k[10] * math.log10(i_bf_ka) + k[12] * math.log10(i_arc_ka) + math.log10(1.0 / cf)
        x5 = k[11] * math.log10(working_distance_mm)
        return float(x1 * 10.0 ** (x2 + x3 + x4 + x5))

    @classmethod
    def _incident_energy_lv(
        cls,
        i_bf_ka: float,
        i_arc_final_ka: float,
        i_arc_600_ka: float,
        gap_mm: float,
        arc_time_ms: float,
        working_distance_mm: float,
        cf: float,
        c: IncidentEnergyCoeffs,
    ) -> float:
        """Energia incydentu E [J/cm²] dla ścieżki LV (IEEE 1584-2018, Eq 6).

        Jak :meth:`_incident_energy_at_anchor`, ALE z DWOMA różnymi wartościami
        prądu łuku: człon x3 (licznik) używa ``i_arc_600_ka`` (Eq.1, NIESKORYGOWANY
        — wartość pośrednia przy kotwie 600 V), człon x4 (log) używa
        ``i_arc_final_ka`` (Eq.25, SKORYGOWANY do rzeczywistego napięcia układu).
        To rozróżnienie jest częścią normy dla U<=600 V — zweryfikowane wobec
        referencyjnej implementacji open-source rwl/arcflash
        (``equations.rs::intermediate_e``, gałąź ``i_arc_600.is_some()``).
        """
        assert c.k is not None and len(c.k) == 13
        assert i_arc_final_ka > 0.0, "I_arc musi być dodatni dla log10 (model IEEE 1584)"
        assert i_arc_600_ka > 0.0, "I_arc,600 musi być dodatni (Eq.1, kotwa 600 V)"
        assert cf > 0.0, "CF musi być dodatni dla log10(1/CF)"
        k = c.k
        x1 = INCIDENT_ENERGY_TIME_FACTOR * arc_time_ms
        x2 = k[0] + k[1] * math.log10(gap_mm)
        denom = (
            k[3] * i_bf_ka**7
            + k[4] * i_bf_ka**6
            + k[5] * i_bf_ka**5
            + k[6] * i_bf_ka**4
            + k[7] * i_bf_ka**3
            + k[8] * i_bf_ka**2
            + k[9] * i_bf_ka
        )
        x3 = (k[2] * i_arc_600_ka) / denom
        x4 = k[10] * math.log10(i_bf_ka) + k[12] * math.log10(i_arc_final_ka) + math.log10(1.0 / cf)
        x5 = k[11] * math.log10(working_distance_mm)
        return float(x1 * 10.0 ** (x2 + x3 + x4 + x5))

    @staticmethod
    def _enclosure_correction(item: ArcFlashInput, c: EnclosureCorrectionCoeffs) -> float:
        """Korekcja rozmiaru obudowy CF (IEEE 1584-2018, Tab. 7; współczynniki z TABLICY).

        Otwarte powietrze (VOA/HOA) ⇒ CF = 1 (brak obudowy, brak wpisu tablicy).
        W obudowie ⇒ EES (ekwiwalentny rozmiar obudowy, cale) z wymiarów obudowy
        wg publicznych progów 508/660,4/1244,6 mm, następnie
            x = b1·EES² + b2·EES + b3 ;  CF = x (typowa) lub 1/x (płytka).
        Gdy wymiarów nie podano — publiczna „typowa" obudowa 20" (508 mm) wg modelu
        (gałąź dim<508 → 20"); to PUBLICZNY domyślny rozmiar modelu, NIE współczynnik.
        """
        cfg = item.electrode_config
        enc_type = item.enclosure_type
        if not cfg.is_boxed:
            return 1.0
        assert c.b is not None and len(c.b) == 3  # gwarantowane przez is_complete_for
        b = c.b
        height_in = ArcFlashBuilder._equivalent_dimension_inch(
            item.enclosure_height_mm, item.voltage_kv, cfg, enc_type, is_height=True
        )
        width_in = ArcFlashBuilder._equivalent_dimension_inch(
            item.enclosure_width_mm, item.voltage_kv, cfg, enc_type, is_height=False
        )
        ees_in = (height_in + width_in) / 2.0
        x = b[0] * ees_in**2 + b[1] * ees_in + b[2]
        if enc_type is EnclosureType.SHALLOW:
            return 1.0 / x
        return x

    @staticmethod
    def _equivalent_dimension_inch(
        dim_mm: float | None,
        voltage_kv: float | None,
        cfg: ElectrodeConfig,
        enc_type: EnclosureType,
        *,
        is_height: bool,
    ) -> float:
        """Ekwiwalentny wymiar obudowy [cale] wg progów IEEE 1584-2018 (Tab. 6 / model).

        Progi publiczne (ramy modelu, nie współczynniki):
          - dim < 508 mm   : typowa → 20" (508 mm); płytka → faktyczny wymiar (mm→in).
          - 508..660,4 mm  : dim·0,03937 (mm→in bezpośrednio) — dla OBU wymiarów.
          - 660,4..1244,6 mm:
              * WYSOKOŚĆ, konfiguracja VCB → dim·0,03937 (mm→in bezpośrednio,
                BEZ transformacji eq.11/12 — Tab.6 wyróżnia VCB dla wysokości).
              * inne przypadki (szerokość dowolnej konfiguracji, wysokość
                VCBB/HCB) → transformacja eq.11/12 z V_oc i parametrami (a,b).
          - > 1244,6 mm:
              * WYSOKOŚĆ, konfiguracja VCB → STAŁY limit 49" (Tab.6; NIE
                eq.11/12 — wysokość VCB nie rośnie dalej z wymiarem/napięciem).
              * inne przypadki → eq.11/12 przy dim=1244,6 mm (clamp).
        Brak wymiaru ⇒ publiczna „typowa" obudowa 20" (508 mm).
        Zweryfikowane wobec referencyjnej implementacji open-source rwl/arcflash
        (``cubicle.rs::calc_cf``, gałęzie ``height``/``width``).
        """
        if dim_mm is None or dim_mm <= 0.0:
            return _DEFAULT_BOX_INCH
        if dim_mm < _ENCLOSURE_LOW_MM:
            if enc_type is EnclosureType.TYPICAL:
                return _DEFAULT_BOX_INCH  # 20"
            return dim_mm / MM_PER_INCH
        if dim_mm <= _ENCLOSURE_MID_MM:
            return dim_mm / MM_PER_INCH
        vcb_height = is_height and cfg is ElectrodeConfig.VCB
        if dim_mm <= _ENCLOSURE_HIGH_MM:
            if vcb_height:
                return dim_mm / MM_PER_INCH
            return ArcFlashBuilder._eq_11_12_inch(dim_mm, voltage_kv, cfg)
        if vcb_height:
            return _VCB_HEIGHT_CAP_INCH  # Tab.6: wysokość VCB > 1244,6 mm -> stały limit 49"
        return ArcFlashBuilder._eq_11_12_inch(_ENCLOSURE_HIGH_MM, voltage_kv, cfg)

    @staticmethod
    def _eq_11_12_inch(dim_mm: float, voltage_kv: float | None, cfg: ElectrodeConfig) -> float:
        """Transformacja eq.11/12 IEEE 1584-2018 dla wymiaru obudowy > 660,4 mm [cale].

        dim_in = (660,4 + (dim − 660,4)·(V_oc + a)/b) / 25,4, gdzie (a,b) zależą od
        konfiguracji (VCB 4/20, VCBB 10/24, HCB 10/22). Parametry (a,b) to publiczne
        stałe modelu rozmiaru obudowy (nie współczynniki regresji energii).
        """
        a, b = _EQ_11_12_PARAMS.get(cfg, (4.0, 20.0))
        voc = voltage_kv if voltage_kv is not None else 0.0
        y1 = dim_mm - _ENCLOSURE_MID_MM
        y2 = (voc + a) / b
        return (_ENCLOSURE_MID_MM + (y1 * y2)) / MM_PER_INCH

    @classmethod
    def _arc_flash_boundary(
        cls,
        voltage_kv: float,
        e_anchors_jcm2: dict[str, float],
        working_distance_mm: float,
        cfg: ElectrodeConfig,
        table: ArcFlashCoefficientTable,
    ) -> float:
        """Granica łuku AFB [mm] — interpolacja AFB z trzech kotew (IEEE 1584-2018).

        Dla każdej kotwy: D_AFB = (5,0208 / (E/D^k12))^(1/k12) (odwrócenie modelu
        energii względem D przy E = 1,2 cal/cm² = 5,0208 J/cm²), gdzie E to energia
        TEJ kotwy na odległości roboczej D. Następnie interpolacja po napięciu.
        """
        afb_anchors: dict[str, float] = {}
        for anchor in VoltageAnchor:
            c = table.energy_entry(cfg, anchor)
            assert c.k is not None and len(c.k) == 13
            k12 = c.k[11]
            e_jcm2 = e_anchors_jcm2[anchor.name]
            f = e_jcm2 / working_distance_mm**k12
            afb_anchors[anchor.name] = (INCIDENT_ENERGY_AFB_JOULE_CM2 / f) ** (1.0 / k12)
        return cls._interpolate_anchor(voltage_kv, afb_anchors)

    @staticmethod
    def _arc_flash_boundary_lv(
        working_distance_mm: float,
        e_jcm2: float,
        c: IncidentEnergyCoeffs,
    ) -> float:
        """Granica łuku AFB [mm] dla ścieżki LV — BEZ interpolacji kotew.

        D_AFB = (5,0208 / (E/D^k12))^(1/k12), k12 z wiersza kotwy 600 V (Tab.3) —
        ta sama odwrócona zależność co :meth:`_arc_flash_boundary`, ale liczona
        RAZ (energia LV jest już bezpośrednio dla rzeczywistego U, bez interpolacji
        po napięciu — zweryfikowane wobec rwl/arcflash ``equations.rs::
        intermediate_afb_from_e`` wywołanego z gałęzi ``IArc::LowVoltage``).
        """
        assert c.k is not None and len(c.k) == 13
        k12 = c.k[11]
        f = e_jcm2 / working_distance_mm**k12
        return (INCIDENT_ENERGY_AFB_JOULE_CM2 / f) ** (1.0 / k12)

    @staticmethod
    def _interpolate_anchor(voltage_kv: float, anchor_values: dict[str, float]) -> float:
        """Interpolacja po napięciu między kotwami (IEEE 1584-2018, Eq 16-24).

        Postać publiczna (kotwy 600/2700/14300 V):
          - U ≤ 0,6 kV          : wartość kotwy 600 V (clamp dolny),
          - 0,6 < U ≤ 2,7 kV    : mieszanka x3 par 600↔2700 V,
          - U > 2,7 kV          : x2 = ((x14300−x2700)/11,6)·(U−14,3) + x14300
                                  (interpolacja na parze 2700↔14300 V; kotwa 14300 V
                                  dla U bliskiego 14,3 kV).
        """
        x600 = anchor_values["V600"]
        x2700 = anchor_values["V2700"]
        x14300 = anchor_values["V14300"]
        if voltage_kv <= float(VoltageAnchor.V600.value):
            return x600
        x1 = ((x2700 - x600) / 2.1) * (voltage_kv - 2.7) + x2700
        x2 = ((x14300 - x2700) / 11.6) * (voltage_kv - 14.3) + x14300
        if voltage_kv <= float(VoltageAnchor.V2700.value):
            x3 = (x1 * (2.7 - voltage_kv)) / 2.1 + (x2 * (voltage_kv - 0.6)) / 2.1
            return x3
        return x2

    def _ppe_category(self, incident_energy_cal_cm2: float) -> tuple[str, str | None]:
        """Kategoria ŚOI z progów NFPA 70E. PUSTA tablica ⇒ "dane niekompletne".

        Zwraca (etykieta_kategorii, proweniencja_tablicy_lub_None). Gdy tablica
        progów jest pusta (brak danych NFPA 70E), kategoria = "dane niekompletne —
        tablice NFPA 70E" i proweniencja None (NIE zmyślamy granic kategorii).
        AFB (1,2 cal/cm²) liczy się niezależnie od tej tablicy.
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


# Parametry (a,b) transformacji eq.11/12 rozmiaru obudowy IEEE 1584-2018 (Tab. ~9):
# publiczne stałe modelu rozmiaru obudowy (NIE współczynniki regresji energii).
_EQ_11_12_PARAMS: dict[ElectrodeConfig, tuple[float, float]] = {
    ElectrodeConfig.VCB: (4.0, 20.0),
    ElectrodeConfig.VCBB: (10.0, 24.0),
    ElectrodeConfig.HCB: (10.0, 22.0),
}
