"""Testy D-01 Arc Flash — STRUKTURA IEEE 1584-2018 z PUSTĄ TABLICĄ współczynników.

╔══════════════════════════════════════════════════════════════════════════╗
║  TE TESTY SPRAWDZAJĄ STRUKTURĘ, NIE WARTOŚCI NORMY.                        ║
║                                                                            ║
║  Tablica współczynników IEEE 1584-2018 jest w repozytorium PUSTA (dane     ║
║  tablicowe objęte prawem autorskim — dostarcza je właściciel). Dlatego:    ║
║    • na PUSTEJ tablicy produkcyjnej KAŻDA ścieżka IEEE zwraca status        ║
║      "dane niekompletne — tablice współczynników IEEE 1584" (NIE liczbę);  ║
║    • MATEMATYKĘ przepływu sprawdzamy WYŁĄCZNIE na WYRAŹNIE oznaczonej       ║
║      tablicy-ATRAPIE (TEST-ONLY) — atrapa NIE jest normą IEEE 1584, służy  ║
║      tylko do weryfikacji algebry struktury (Iarc/E/AFB);                  ║
║    • ścieżka Ralpha Lee (> 15 kV) jest oznaczona jako Lee, NIE IEEE 1584;  ║
║    • mapowanie ŚOI zwraca "dane niekompletne" przy pustej tablicy NFPA;     ║
║    • czas łuku z czasu wyłączenia + "dane niekompletne" gdy brak;          ║
║    • determinizm; pusta tablica niesie proweniencję norma_IEEE_1584 + BRAK.║
║                                                                            ║
║  USUNIĘTO stare testy „wiarygodności” (E≈9,93 itd.) zależne od             ║
║  współczynników best-effort — nie istnieją już żadne wartości best-effort. ║
╚══════════════════════════════════════════════════════════════════════════╝

Moduł konsumuje wynik zwarciowy jako zwykłe wejście (NIE importuje solvera —
arch_guard zabrania analysis -> solvers).
"""

from __future__ import annotations

import math

import pytest
from analysis.arc_flash import (
    ARC_FLASH_COEFF_MISSING_MARKER,
    ARC_FLASH_RALPH_LEE_LABEL,
    ARC_FLASH_TABLE_INCOMPLETE_STATUS,
    OSD_ARC_FLASH_BLOCKER_CODE,
    PPE_CATEGORY_INCOMPLETE,
    PRODUCTION_IEEE_1584_TABLE,
    ArcCurrentCoeffs,
    ArcFlashBuilder,
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
    TableProvenance,
    VoltageAnchor,
    osd_arc_flash_gate,
)
from analysis.arc_flash.models import (
    JOULE_PER_CAL_CM2,
    REFERENCE_DISTANCE_MM,
    REFERENCE_TIME_S,
)

# ---------------------------------------------------------------------------
# TEST-ONLY tablica-ATRAPA współczynników. NIE jest to norma IEEE 1584-2018 —
# to sztuczne liczby dobrane WYŁĄCZNIE do sprawdzenia algebry przepływu. NIGDY
# nie wolno traktować ich jako wartości normatywnych. Proweniencja pozostaje
# norma_IEEE_1584 (oś źródła), ale wartości są jawnie testowe (TEST-ONLY).
# ---------------------------------------------------------------------------

# Atrapa prądu łuku: log10(I_arc) = 0 + 1*log10(I_bf) + 0*log10(G) + ... ⇒
# I_arc = I_bf (algebraicznie sprawdzalne). Wektor k dobrany TYLKO do testu.
_DUMMY_ARC_K = (0.0, 1.0, 0.0, 0.0, 0.0, 0.0)

# Atrapa energii: log10(E_n) = 0 + 1*log10(I_arc) + 0*log10(G) + ... ⇒
# E_n = I_arc [J/cm²] (sztuczne, TEST-ONLY). Wykładnik odległości x = 1.
_DUMMY_E_B = (0.0, 1.0, 0.0, 0.0, 0.0, 0.0)
_DUMMY_E_X = 1.0

# Atrapa korekcji obudowy: b[0] = rozmiar odniesienia [mm], b[1] = wykładnik 0 ⇒
# CF = (ref/equiv)^0 = 1 (neutralna, TEST-ONLY) — upraszcza algebrę asercji.
_DUMMY_ENCLOSURE_B = (508.0, 0.0)


def _dummy_table(*, anchors_differ: bool = False) -> ArcFlashCoefficientTable:
    """Buduje WYRAŹNIE oznaczoną TEST-ONLY tablicę-atrapę (NIE norma IEEE 1584).

    Domyślnie wszystkie kotwy mają IDENTYCZNE współczynniki, więc interpolacja po
    napięciu daje tę samą wartość niezależnie od U (łatwa algebra asercji). Gdy
    ``anchors_differ`` True — kotwy mają różne k, by sprawdzić interpolację.
    """
    arc: dict[tuple[ElectrodeConfig, VoltageAnchor], ArcCurrentCoeffs] = {}
    energy: dict[tuple[ElectrodeConfig, VoltageAnchor], IncidentEnergyCoeffs] = {}
    enclosure: dict[ElectrodeConfig, EnclosureCorrectionCoeffs] = {}
    for cfg in ElectrodeConfig:
        for anchor in VoltageAnchor:
            k = _DUMMY_ARC_K
            if anchors_differ and anchor is VoltageAnchor.V14300:
                # Inna kotwa 14,3 kV: I_arc = 0,5*I_bf (10^(log10(I_bf)-log10 2)).
                k = (-math.log10(2.0), 1.0, 0.0, 0.0, 0.0, 0.0)
            arc[(cfg, anchor)] = ArcCurrentCoeffs(k=k)
            energy[(cfg, anchor)] = IncidentEnergyCoeffs(
                b=_DUMMY_E_B, distance_exponent_x=_DUMMY_E_X
            )
        enclosure[cfg] = EnclosureCorrectionCoeffs(b=_DUMMY_ENCLOSURE_B)
    return ArcFlashCoefficientTable(
        provenance=TableProvenance.NORMA_IEEE_1584,
        arc_current=arc,
        incident_energy=energy,
        enclosure_correction=enclosure,
        source_note_pl="TEST-ONLY atrapa — NIE norma IEEE 1584",
    )


def _dummy_ppe_table() -> PpeCategoryTable:
    """TEST-ONLY tablica progów ŚOI (NIE norma NFPA 70E). Sztuczne progi."""
    return PpeCategoryTable(
        provenance=TableProvenance.NORMA_NFPA_70E,
        boundaries=((1.2, "0"), (4.0, "1"), (8.0, "2"), (25.0, "3"), (40.0, "4")),
        over_limit_label_pl="POWYŻEJ 40 cal/cm² (TEST-ONLY)",
        source_note_pl="TEST-ONLY atrapa — NIE norma NFPA 70E",
    )


# Wejście w zakresie ważności IEEE 1584-2018 (20 kV jest > 15 kV ⇒ Lee; tu 14 kV).
def _in_range_input(**overrides: object) -> ArcFlashInput:
    base: dict[str, object] = {
        "bus_ref": "SZYNA-14kV",
        "i_bf_ka": 25.0,
        "voltage_kv": 14.0,
        "arc_time_s": 0.2,
        "electrode_config": ElectrodeConfig.VOA,  # otwarte powietrze ⇒ CF=1
        "conductor_gap_mm": 102.0,
        "working_distance_mm": 457.0,
    }
    base.update(overrides)
    return ArcFlashInput(**base)  # type: ignore[arg-type]


def _build_one(item: ArcFlashInput, **builder_kwargs: object) -> ArcFlashResult:
    return ArcFlashBuilder(**builder_kwargs).build([item]).results[0]  # type: ignore[arg-type]


# ===========================================================================
# (1) PUSTA TABLICA PRODUKCYJNA → "dane niekompletne — tablice współczynników
#     IEEE 1584" na KAŻDEJ ścieżce IEEE. FAILUJE, jeśli zwrócono jakąkolwiek
#     liczbę z pustej tablicy.
# ===========================================================================


def test_empty_production_table_blocks_every_compute_path() -> None:
    """Na PUSTEJ tablicy produkcyjnej KAŻDa konfiguracja w zakresie zwraca
    INCOMPLETE_TABLE — bez ŻADNEJ policzonej liczby (zakaz fabrykacji)."""
    assert PRODUCTION_IEEE_1584_TABLE.is_empty
    for cfg in ElectrodeConfig:
        r = _build_one(_in_range_input(electrode_config=cfg))
        assert r.status is ArcFlashStatus.INCOMPLETE_TABLE, cfg
        assert r.status.label_pl == ARC_FLASH_TABLE_INCOMPLETE_STATUS
        # ŻADNEJ liczby z pustej tablicy.
        assert r.i_arc_ka is None, cfg
        assert r.i_arc_at_anchors_ka is None, cfg
        assert r.incident_energy_cal_cm2 is None, cfg
        assert r.arc_flash_boundary_mm is None, cfg
        assert r.ppe_category is None, cfg
        assert r.white_box == ()
        # Marker BRAK i lista brakujących wpisów tablicy obecne.
        assert r.coefficient_table_marker == ARC_FLASH_COEFF_MISSING_MARKER
        assert r.missing_data, cfg
        assert ARC_FLASH_TABLE_INCOMPLETE_STATUS in r.why_pl


def test_empty_table_view_status_is_incomplete_table() -> None:
    """Widok na pustej tablicy ma status INCOMPLETE_TABLE i niesie proweniencję."""
    view = ArcFlashBuilder().build([_in_range_input()])
    assert view.status is ArcFlashStatus.INCOMPLETE_TABLE
    assert view.coefficient_table.is_empty
    assert view.coefficient_table.provenance is TableProvenance.NORMA_IEEE_1584


def test_default_builder_uses_empty_production_tables() -> None:
    """Builder bez argumentów używa PUSTYCH tablic produkcyjnych (bezpieczny default)."""
    b = ArcFlashBuilder()
    assert b._table is PRODUCTION_IEEE_1584_TABLE  # noqa: SLF001 (test introspekcji)
    assert b._table.is_empty  # noqa: SLF001


# ===========================================================================
# (2) MATEMATYKA przepływu na TEST-ONLY atrapie (NIE wartości normy).
#     Atrapa: I_arc = I_bf, E_n = I_arc [J/cm²], x = 1, CF = 1.
# ===========================================================================


def test_pipeline_math_arc_current_matches_dummy_algebra() -> None:
    """Przy atrapie k=(0,1,0,...) ⇒ I_arc = I_bf (algebraicznie). Test STRUKTURY,
    NIE wartości IEEE 1584 (atrapa jest jawnie testowa)."""
    r = _build_one(
        _in_range_input(i_bf_ka=25.0, electrode_config=ElectrodeConfig.VOA),
        coefficient_table=_dummy_table(),
    )
    assert r.status is ArcFlashStatus.COMPUTED_IEEE_1584
    assert r.method is ArcFlashMethod.IEEE_1584_2018
    assert r.i_arc_ka is not None
    assert r.i_arc_ka == pytest.approx(25.0, rel=1e-9)


def test_pipeline_math_incident_energy_matches_dummy_algebra() -> None:
    """E = CF*E_n*(t/0,2)*(610/D)^x / 4,184, z E_n=I_arc, x=1, CF=1, I_arc=I_bf.

    Dla I_bf=25, t=0,2 s, D=457 mm:
        E = 1*25*(0,2/0,2)*(610/457)^1 / 4,184  [cal/cm²].
    Sprawdza algebrę struktury (atrapa TEST-ONLY, nie norma)."""
    i_bf, arc_time, working_distance = 25.0, 0.2, 457.0
    r = _build_one(
        _in_range_input(
            i_bf_ka=i_bf,
            arc_time_s=arc_time,
            working_distance_mm=working_distance,
            electrode_config=ElectrodeConfig.VOA,
        ),
        coefficient_table=_dummy_table(),
    )
    expected_e = (
        1.0
        * i_bf  # E_n = I_arc = I_bf
        * (arc_time / REFERENCE_TIME_S)
        * (REFERENCE_DISTANCE_MM / working_distance) ** 1.0
        / JOULE_PER_CAL_CM2
    )
    # Builder zaokrągla wynik do 4 miejsc (kontrakt wyjścia) — porównaj tak samo.
    assert r.incident_energy_cal_cm2 is not None
    assert r.incident_energy_cal_cm2 == pytest.approx(round(expected_e, 4), abs=1e-4)


def test_pipeline_math_afb_is_distance_where_energy_equals_1_2() -> None:
    """AFB to odległość, na której E = 1,2 cal/cm². Re-podstawienie D=AFB do
    wzoru energii musi dać 1,2 cal/cm² (spójność odwrócenia, struktura)."""
    item = _in_range_input(electrode_config=ElectrodeConfig.VOA)
    r = _build_one(item, coefficient_table=_dummy_table())
    assert r.arc_flash_boundary_mm is not None
    afb = r.arc_flash_boundary_mm
    # Policz energię na D=afb tą samą algebrą atrapy (CF=1, E_n=I_arc=I_bf, x=1).
    e_at_afb = (
        1.0
        * 25.0
        * (0.2 / REFERENCE_TIME_S)
        * (REFERENCE_DISTANCE_MM / afb) ** 1.0
        / JOULE_PER_CAL_CM2
    )
    assert e_at_afb == pytest.approx(1.2, rel=1e-6)


def test_pipeline_math_longer_time_doubles_energy() -> None:
    """Dwukrotny czas łuku ⇒ dwukrotna energia (struktura t/0,2)."""
    short = _build_one(_in_range_input(arc_time_s=0.2), coefficient_table=_dummy_table())
    longer = _build_one(_in_range_input(arc_time_s=0.4), coefficient_table=_dummy_table())
    assert short.incident_energy_cal_cm2 is not None
    assert longer.incident_energy_cal_cm2 is not None
    # Liniowość w czasie (t/0,2); tolerancja na ziarno zaokrąglenia wyjścia (4 m.).
    assert longer.incident_energy_cal_cm2 == pytest.approx(
        2.0 * short.incident_energy_cal_cm2, abs=2e-4
    )


def test_pipeline_math_interpolates_between_voltage_anchors() -> None:
    """Interpolacja po napięciu: przy różnych kotwach (I_arc=I_bf przy 600/2700 V,
    I_arc=0,5*I_bf przy 14300 V) wartość przy 8,5 kV leży MIĘDZY wartościami
    kotew otaczających (2700 i 14300 V). Test STRUKTURY interpolacji."""
    table = _dummy_table(anchors_differ=True)
    # Przy 2,7 kV: I_arc = I_bf = 25; przy 14,3 kV: I_arc = 12,5.
    r_mid = _build_one(
        _in_range_input(voltage_kv=8.5, electrode_config=ElectrodeConfig.VOA),
        coefficient_table=table,
    )
    assert r_mid.i_arc_ka is not None
    # Liniowa interpolacja między (2,7 kV, 25) i (14,3 kV, 12,5).
    frac = (8.5 - 2.7) / (14.3 - 2.7)
    expected = 25.0 + frac * (12.5 - 25.0)
    assert r_mid.i_arc_ka == pytest.approx(expected, rel=1e-6)
    # Wartości na kotwach też raportowane (White Box / pole anchors).
    assert r_mid.i_arc_at_anchors_ka is not None
    assert r_mid.i_arc_at_anchors_ka["V2700"] == pytest.approx(25.0, rel=1e-6)
    assert r_mid.i_arc_at_anchors_ka["V14300"] == pytest.approx(12.5, rel=1e-6)


def test_pipeline_computed_result_has_full_white_box() -> None:
    """Policzony wynik IEEE ma 5 kroków White Box, każdy z table_ref."""
    r = _build_one(
        _in_range_input(), coefficient_table=_dummy_table(), ppe_table=_dummy_ppe_table()
    )
    assert r.status is ArcFlashStatus.COMPUTED_IEEE_1584
    assert len(r.white_box) == 5
    for step in r.white_box:
        assert step.symbol and step.formula_latex
        assert step.substitution_pl and step.result_pl and step.unit_check_pl
        assert step.table_ref  # KTÓRY wpis tablicy użyto (lub publiczny próg)


def test_all_five_configs_compute_on_dummy_table() -> None:
    """Wszystkie 5 konfiguracji IEEE 1584-2018 liczą się na atrapie."""
    for cfg in ElectrodeConfig:
        r = _build_one(_in_range_input(electrode_config=cfg), coefficient_table=_dummy_table())
        assert r.status is ArcFlashStatus.COMPUTED_IEEE_1584, cfg
        assert r.i_arc_ka is not None and r.i_arc_ka > 0.0
        assert r.incident_energy_cal_cm2 is not None and r.incident_energy_cal_cm2 > 0.0


def test_enclosure_correction_present_only_for_boxed_configs() -> None:
    """Otwarte powietrze (VOA/HOA) ⇒ CF=1; w obudowie (VCB) ⇒ CF z tablicy."""
    open_air = _build_one(
        _in_range_input(electrode_config=ElectrodeConfig.VOA), coefficient_table=_dummy_table()
    )
    boxed = _build_one(
        _in_range_input(electrode_config=ElectrodeConfig.VCB), coefficient_table=_dummy_table()
    )
    assert open_air.enclosure_correction_cf == pytest.approx(1.0)
    # Atrapa CF: wykładnik 0 ⇒ CF=1 też dla obudowy (neutralna atrapa) — ale
    # wpis tablicy CF[VCB] MUSI istnieć (inaczej INCOMPLETE_TABLE).
    assert boxed.status is ArcFlashStatus.COMPUTED_IEEE_1584
    assert boxed.enclosure_correction_cf is not None


def test_partial_table_for_config_is_incomplete() -> None:
    """Tablica wypełniona dla VOA, ale NIE dla VCB ⇒ VCB = INCOMPLETE_TABLE
    (kompletność sprawdzana per konfiguracja; brak częściowego zmyślania)."""
    full = _dummy_table()
    # Usuń jeden wpis energii VCB@600 V → VCB niekompletne, VOA nadal kompletne.
    partial_energy = dict(full.incident_energy)
    partial_energy[(ElectrodeConfig.VCB, VoltageAnchor.V600)] = IncidentEnergyCoeffs()
    partial = ArcFlashCoefficientTable(
        provenance=full.provenance,
        arc_current=full.arc_current,
        incident_energy=partial_energy,
        enclosure_correction=full.enclosure_correction,
    )
    vcb = _build_one(
        _in_range_input(electrode_config=ElectrodeConfig.VCB), coefficient_table=partial
    )
    voa = _build_one(
        _in_range_input(electrode_config=ElectrodeConfig.VOA), coefficient_table=partial
    )
    assert vcb.status is ArcFlashStatus.INCOMPLETE_TABLE
    assert "E[VCB,V600]" in vcb.missing_data
    assert voa.status is ArcFlashStatus.COMPUTED_IEEE_1584


# ===========================================================================
# (3) Ralph Lee dla > 15 kV, OZNACZONY jako Lee (NIE IEEE 1584).
# ===========================================================================


def test_ralph_lee_path_triggers_above_15kv() -> None:
    """U > 15 kV (poza zakresem IEEE 1584-2018) ⇒ metoda Ralpha Lee, OZNACZONA
    jako Lee, NIE jako IEEE 1584. Liczy się NAWET na pustej tablicy IEEE."""
    assert PRODUCTION_IEEE_1584_TABLE.is_empty
    r = _build_one(_in_range_input(voltage_kv=20.0))  # 20 kV > 15 kV, pusta tablica
    assert r.status is ArcFlashStatus.COMPUTED_RALPH_LEE
    assert r.method is ArcFlashMethod.RALPH_LEE
    # Wynik policzony postacią zamkniętą Lee (bez tablicy IEEE).
    assert r.incident_energy_cal_cm2 is not None and r.incident_energy_cal_cm2 > 0.0
    assert r.arc_flash_boundary_mm is not None and r.arc_flash_boundary_mm > 0.0
    # JAWNE oznaczenie Lee w uzasadnieniu i krokach — NIE udaje IEEE 1584.
    assert ARC_FLASH_RALPH_LEE_LABEL in r.why_pl
    assert "NIE jest wynik IEEE 1584" in r.why_pl
    for step in r.white_box:
        if step.symbol.startswith("E") or step.symbol.startswith("AFB"):
            assert "Lee" in step.result_pl


def test_ralph_lee_energy_matches_closed_form() -> None:
    """Postać Lee: E = 2,142e6 * V * I_bf * t / D². Sprawdza algebrę publicznej
    postaci zamkniętej (nie tablicy)."""
    v, i_bf, t, d = 20.0, 30.0, 0.2, 457.0
    r = _build_one(_in_range_input(voltage_kv=v, i_bf_ka=i_bf, arc_time_s=t, working_distance_mm=d))
    expected = 2.142e6 * v * i_bf * t / (d**2)
    assert r.incident_energy_cal_cm2 is not None
    assert r.incident_energy_cal_cm2 == pytest.approx(expected, rel=1e-6)


def test_ieee_path_not_used_above_range_even_with_full_table() -> None:
    """Nawet z WYPEŁNIONĄ tablicą, > 15 kV używa Lee (zakres ważności normy)."""
    r = _build_one(_in_range_input(voltage_kv=30.0), coefficient_table=_dummy_table())
    assert r.status is ArcFlashStatus.COMPUTED_RALPH_LEE
    assert r.method is ArcFlashMethod.RALPH_LEE


# ===========================================================================
# (4) Bramkowanie zakresu ważności (out-of-range I_bf / napięcie).
# ===========================================================================


@pytest.mark.parametrize(
    "voltage_kv,i_bf_ka,expect_lee",
    [
        (14.0, 25.0, False),  # w zakresie ⇒ IEEE (na atrapie)
        (20.0, 25.0, True),  # U > 15 kV ⇒ Lee
        (0.1, 25.0, True),  # U < 208 V ⇒ poza zakresem ⇒ Lee
        (14.0, 120.0, True),  # I_bf > 106 kA ⇒ poza zakresem ⇒ Lee
        (14.0, 0.3, True),  # I_bf < 500 A ⇒ poza zakresem ⇒ Lee
    ],
)
def test_validity_range_gating(voltage_kv: float, i_bf_ka: float, expect_lee: bool) -> None:
    """Poza zakresem ważności (U lub I_bf) builder przełącza na Lee; w zakresie
    używa ścieżki IEEE (tu na atrapie, by ścieżka się policzyła)."""
    r = _build_one(
        _in_range_input(voltage_kv=voltage_kv, i_bf_ka=i_bf_ka),
        coefficient_table=_dummy_table(),
    )
    if expect_lee:
        assert r.status is ArcFlashStatus.COMPUTED_RALPH_LEE, (voltage_kv, i_bf_ka)
        assert r.method is ArcFlashMethod.RALPH_LEE
    else:
        assert r.status is ArcFlashStatus.COMPUTED_IEEE_1584, (voltage_kv, i_bf_ka)
        assert r.method is ArcFlashMethod.IEEE_1584_2018


# ===========================================================================
# (5) Mapowanie ŚOI + "dane niekompletne" gdy granice NFPA nieobecne.
# ===========================================================================


def test_ppe_incomplete_when_nfpa_table_empty() -> None:
    """Pusta tablica progów NFPA (produkcyjna) ⇒ kategoria ŚOI = "dane
    niekompletne — tablice NFPA 70E"; proweniencja ŚOI None (zakaz zmyślania
    granic kategorii). Ścieżka IEEE liczy resztę (na atrapie)."""
    r = _build_one(_in_range_input(), coefficient_table=_dummy_table())  # domyślna pusta NFPA
    assert r.status is ArcFlashStatus.COMPUTED_IEEE_1584
    assert r.incident_energy_cal_cm2 is not None  # energia policzona…
    assert r.ppe_category == PPE_CATEGORY_INCOMPLETE  # …ale kategoria niedostępna
    assert r.ppe_table_provenance is None


def test_ppe_mapping_structure_with_dummy_nfpa_table() -> None:
    """Z TEST-ONLY tablicą progów ŚOI mapowanie zwraca kategorię i proweniencję
    norma_NFPA_70E. Test STRUKTURY mapowania (atrapa, nie norma)."""
    r = _build_one(
        _in_range_input(),
        coefficient_table=_dummy_table(),
        ppe_table=_dummy_ppe_table(),
    )
    assert r.ppe_category in {"0", "1", "2", "3", "4"} or "POWYŻEJ" in (r.ppe_category or "")
    assert r.ppe_table_provenance == TableProvenance.NORMA_NFPA_70E.value


def test_ppe_boundary_selection_is_monotone_with_dummy_table() -> None:
    """Większa energia ⇒ kategoria nie niższa (monotoniczność mapowania progów,
    sprawdzona na TEST-ONLY atrapie progów)."""
    table = _dummy_table()
    ppe = _dummy_ppe_table()
    low = _build_one(
        _in_range_input(i_bf_ka=1.0, working_distance_mm=2000.0),
        coefficient_table=table,
        ppe_table=ppe,
    )
    high = _build_one(
        _in_range_input(i_bf_ka=100.0, working_distance_mm=200.0),
        coefficient_table=table,
        ppe_table=ppe,
    )
    assert low.incident_energy_cal_cm2 is not None
    assert high.incident_energy_cal_cm2 is not None
    assert high.incident_energy_cal_cm2 > low.incident_energy_cal_cm2
    order = {"0": 0, "1": 1, "2": 2, "3": 3, "4": 4}
    lo_rank = order.get(low.ppe_category or "", 99)
    hi_rank = order.get(high.ppe_category or "", 99)
    assert hi_rank >= lo_rank


# ===========================================================================
# (6) Czas łuku z czasu wyłączenia + "dane niekompletne" gdy brak.
# ===========================================================================


def test_arc_time_wired_from_trip_clearing_time() -> None:
    """arc_time_s pochodzi z czasu wyłączenia (koordynacja zabezpieczeń — to
    samo źródło co U_touch/uziemienie). Tu jawnie podany; wynik go używa."""
    clearing_time_s = 0.35  # z nastaw zabezpieczeń / koordynacji
    r = _build_one(_in_range_input(arc_time_s=clearing_time_s), coefficient_table=_dummy_table())
    assert r.arc_time_s == pytest.approx(clearing_time_s)
    assert r.status is ArcFlashStatus.COMPUTED_IEEE_1584


def test_missing_arc_time_is_incomplete_input() -> None:
    """Brak czasu łuku (czas wyłączenia niedostępny) ⇒ "dane niekompletne",
    bez zmyślania. Nawet z wypełnioną tablicą współczynników."""
    r = _build_one(_in_range_input(arc_time_s=None), coefficient_table=_dummy_table())
    assert r.status is ArcFlashStatus.INCOMPLETE_INPUT
    assert "arc_time_s" in r.missing_data
    assert r.incident_energy_cal_cm2 is None
    assert r.white_box == ()


@pytest.mark.parametrize(
    "field_name,kwargs",
    [
        ("i_bf_ka", {"i_bf_ka": None}),
        ("voltage_kv", {"voltage_kv": None}),
        ("arc_time_s", {"arc_time_s": None}),
        ("conductor_gap_mm", {"conductor_gap_mm": None}),
        ("working_distance_mm", {"working_distance_mm": None}),
        ("i_bf_ka", {"i_bf_ka": 0.0}),  # niedodatni traktowany jak brak
    ],
)
def test_missing_mandatory_input_is_incomplete(field_name: str, kwargs: dict) -> None:
    """Brak któregokolwiek obowiązkowego wejścia ⇒ INCOMPLETE_INPUT, bez liczb."""
    r = _build_one(_in_range_input(**kwargs), coefficient_table=_dummy_table())
    assert r.status is ArcFlashStatus.INCOMPLETE_INPUT
    assert field_name in r.missing_data
    assert r.i_arc_ka is None
    assert r.incident_energy_cal_cm2 is None
    assert r.arc_flash_boundary_mm is None
    assert r.ppe_category is None
    assert r.white_box == ()
    assert "dane niekompletne" in r.why_pl.lower()


# ===========================================================================
# (7) Determinizm.
# ===========================================================================


def test_analysis_id_is_deterministic() -> None:
    ctx = ArcFlashContext(project_name="P", case_name="C")
    first = ArcFlashBuilder(coefficient_table=_dummy_table()).build(
        [_in_range_input()], context=ctx
    )
    second = ArcFlashBuilder(coefficient_table=_dummy_table()).build(
        [_in_range_input()], context=ctx
    )
    assert first.analysis_id == second.analysis_id
    assert first.to_dict() == second.to_dict()


def test_analysis_id_is_deterministic_on_empty_table() -> None:
    """Determinizm także na pustej tablicy produkcyjnej (status incomplete)."""
    first = ArcFlashBuilder().build([_in_range_input()])
    second = ArcFlashBuilder().build([_in_range_input()])
    assert first.analysis_id == second.analysis_id
    assert first.to_dict() == second.to_dict()


def test_analysis_id_changes_with_inputs() -> None:
    a = ArcFlashBuilder(coefficient_table=_dummy_table()).build([_in_range_input(i_bf_ka=25.0)])
    b = ArcFlashBuilder(coefficient_table=_dummy_table()).build([_in_range_input(i_bf_ka=30.0)])
    assert a.analysis_id != b.analysis_id


def test_multiple_points_sorted_deterministically() -> None:
    unsorted = [
        _in_range_input(bus_ref="Z"),
        _in_range_input(bus_ref="A"),
        _in_range_input(bus_ref="M"),
    ]
    view = ArcFlashBuilder(coefficient_table=_dummy_table()).build(unsorted)
    refs = [r.bus_ref for r in view.results]
    assert refs == ["A", "M", "Z"]


# ===========================================================================
# (8) Pusta tablica niesie proweniencję norma_IEEE_1584 + marker BRAK.
# ===========================================================================


def test_empty_table_carries_norma_provenance_and_brak_marker() -> None:
    """Pusta tablica produkcyjna deklaruje proweniencję norma_IEEE_1584 (oś
    NORMATYWNA, NIE 'oszacowane') i marker BRAK na każdym wpisie. ŻADNEJ liczby
    udającej współczynnik."""
    table = PRODUCTION_IEEE_1584_TABLE
    assert table.provenance is TableProvenance.NORMA_IEEE_1584
    assert table.provenance.value == "norma_IEEE_1584"
    assert table.source_note_pl == ARC_FLASH_COEFF_MISSING_MARKER

    d = table.to_dict()
    assert d["provenance"] == "norma_IEEE_1584"
    assert d["is_empty"] is True
    # Każdy wpis prądu łuku / energii ma marker BRAK i k/b == None (nie float).
    for entry in d["arc_current"].values():
        assert entry["present"] is False
        assert entry["k"] is None
        assert entry["marker"] == ARC_FLASH_COEFF_MISSING_MARKER
    for entry in d["incident_energy"].values():
        assert entry["present"] is False
        assert entry["b"] is None
        assert entry["distance_exponent_x"] is None
        assert entry["marker"] == ARC_FLASH_COEFF_MISSING_MARKER
    for entry in d["enclosure_correction"].values():
        assert entry["present"] is False
        assert entry["b"] is None


def test_empty_ppe_table_carries_norma_nfpa_provenance() -> None:
    """Pusta tablica progów ŚOI deklaruje proweniencję norma_NFPA_70E + BRAK."""
    from analysis.arc_flash import PRODUCTION_NFPA_70E_PPE_TABLE

    t = PRODUCTION_NFPA_70E_PPE_TABLE
    assert t.provenance is TableProvenance.NORMA_NFPA_70E
    assert t.is_empty
    assert t.source_note_pl == ARC_FLASH_COEFF_MISSING_MARKER
    assert t.boundaries == ()


def test_no_fabricated_coefficient_anywhere_in_empty_tables() -> None:
    """Niezmiennik zakazu fabrykacji: w PUSTYCH tablicach produkcyjnych NIE ma
    ŻADNEJ liczbowej wartości współczynnika (wszystkie k/b/x są None)."""
    from analysis.arc_flash import PRODUCTION_NFPA_70E_PPE_TABLE

    for entry in PRODUCTION_IEEE_1584_TABLE.arc_current.values():
        assert entry.k is None
    for entry in PRODUCTION_IEEE_1584_TABLE.incident_energy.values():
        assert entry.b is None
        assert entry.distance_exponent_x is None
    for entry in PRODUCTION_IEEE_1584_TABLE.enclosure_correction.values():
        assert entry.b is None
    assert PRODUCTION_NFPA_70E_PPE_TABLE.boundaries == ()
    assert PRODUCTION_NFPA_70E_PPE_TABLE.over_limit_label_pl is None


# ===========================================================================
# Serializacja, bramka OSD, granica warstw (arch_guard).
# ===========================================================================


def test_serialized_view_carries_table_provenance_and_status() -> None:
    """Zserializowany widok niesie status, proweniencję tablicy i marker BRAK."""
    view = ArcFlashBuilder().build([_in_range_input()])  # pusta tablica
    d = view.to_dict()
    assert d["status"] == ArcFlashStatus.INCOMPLETE_TABLE.value
    assert d["status_label_pl"] == ARC_FLASH_TABLE_INCOMPLETE_STATUS
    assert d["coefficient_table"]["provenance"] == "norma_IEEE_1584"
    assert d["coefficient_table"]["is_empty"] is True
    for rd in d["results"]:
        assert rd["status"] == ArcFlashStatus.INCOMPLETE_TABLE.value
        assert rd["coefficient_table_marker"] == ARC_FLASH_COEFF_MISSING_MARKER
        assert rd["i_arc_ka"] is None
        assert rd["incident_energy_cal_cm2"] is None


def test_status_enum_is_distinct_from_field_quality() -> None:
    """Status wyniku Arc Flash to ODRĘBNA oś od FieldQuality (jakości danych) —
    nie nadużywamy DATASHEET/ESTIMATED do statusu obliczenia/tablicy."""
    from solver_input.provenance import FieldQuality

    status_values = {s.value for s in ArcFlashStatus}
    quality_values = {q.value for q in FieldQuality}
    assert status_values.isdisjoint(quality_values)
    # Proweniencja tablicy też odrębna od FieldQuality (norma_*, nie oszacowane).
    table_prov_values = {p.value for p in TableProvenance}
    assert table_prov_values.isdisjoint(quality_values)
    assert "oszacowane" not in table_prov_values  # NIE 'oszacowane' (FieldQuality.ESTIMATED)


def test_arc_flash_does_not_import_solver_layer() -> None:
    """arch_guard: warstwa analizy nie może importować solverów."""
    import sys

    for mod in list(sys.modules):
        if mod.startswith("network_model.solvers"):
            del sys.modules[mod]
    import analysis.arc_flash.builder  # noqa: F401
    import analysis.arc_flash.models  # noqa: F401

    assert not any(
        m.startswith("network_model.solvers") for m in sys.modules
    ), "arc_flash nie powinien importować warstwy solverów"


def test_structure_runs_end_to_end_from_short_circuit_result() -> None:
    """Wejście odwzorowane z prawdziwego ShortCircuitResult (read-only odczyt
    frozen API). Na pustej tablicy produkcyjnej daje INCOMPLETE_TABLE — dowodzi
    konsumpcji wyniku SC bez importu solvera w warstwie analizy."""
    from network_model.solvers.short_circuit_iec60909 import (
        ShortCircuitResult,
        ShortCircuitType,
    )

    sc = ShortCircuitResult(
        short_circuit_type=ShortCircuitType.THREE_PHASE,
        fault_node_id="SZYNA-14kV",
        c_factor=1.1,
        un_v=14_000.0,
        zkk_ohm=complex(0.2, 0.46),
        ikss_a=25_000.0,
        ip_a=63_000.0,
        ith_a=26_000.0,
        sk_mva=606.0,
        rx_ratio=0.1,
        kappa=1.8,
        tk_s=0.2,
        ib_a=25_000.0,
        tb_s=0.2,
    )
    item = ArcFlashInput(
        bus_ref=sc.fault_node_id,
        i_bf_ka=sc.ikss_a / 1000.0,
        voltage_kv=sc.un_v / 1000.0,
        arc_time_s=sc.tk_s,  # czas wyłączenia z wyniku SC / koordynacji
        electrode_config=ElectrodeConfig.VCB,
        conductor_gap_mm=102.0,
        working_distance_mm=457.0,
    )
    view = ArcFlashBuilder().build([item])  # pusta tablica produkcyjna
    assert isinstance(view, ArcFlashView)
    r = view.results[0]
    assert r.status is ArcFlashStatus.INCOMPLETE_TABLE
    assert r.i_bf_ka == pytest.approx(25.0)
    assert r.voltage_kv == pytest.approx(14.0)
    assert r.i_arc_ka is None  # pusta tablica ⇒ brak liczby


def test_osd_gate_blocks_incomplete_table_result() -> None:
    """Pusta tablica (INCOMPLETE_TABLE) blokuje OSD bez świadomej akceptacji."""
    view = ArcFlashBuilder().build([_in_range_input()])
    ready, blockers = osd_arc_flash_gate(view, accepted=False)
    assert ready is False
    assert len(blockers) == 1
    assert blockers[0].code == OSD_ARC_FLASH_BLOCKER_CODE
    assert blockers[0].severity == "BLOKUJACE"


def test_osd_gate_blocks_ralph_lee_result_without_acceptance() -> None:
    """Wynik Ralpha Lee (poza zakresem IEEE) też wymaga świadomej akceptacji OSD."""
    view = ArcFlashBuilder().build([_in_range_input(voltage_kv=20.0)])
    ready, blockers = osd_arc_flash_gate(view, accepted=False)
    assert ready is False
    assert blockers[0].code == OSD_ARC_FLASH_BLOCKER_CODE


def test_osd_gate_passes_for_ieee_computed_result() -> None:
    """Wynik policzony ścieżką IEEE 1584-2018 (wypełniona tablica) przechodzi
    bramkę OSD bez dodatkowej akceptacji (to docelowy stan po dostarczeniu tablic)."""
    view = ArcFlashBuilder(coefficient_table=_dummy_table()).build([_in_range_input()])
    assert view.status is ArcFlashStatus.COMPUTED_IEEE_1584
    ready, blockers = osd_arc_flash_gate(view, accepted=False)
    assert ready is True
    assert blockers == []


def test_osd_gate_passes_with_conscious_acceptance() -> None:
    """Z jawną akceptacją inżyniera nawet wynik incomplete/Lee może wejść do OSD."""
    view = ArcFlashBuilder().build([_in_range_input()])
    ready, blockers = osd_arc_flash_gate(view, accepted=True)
    assert ready is True
    assert blockers == []


def test_osd_blocker_uses_readiness_blocker_model() -> None:
    """Bramka używa istniejącego modelu ReadinessBlocker (bez drugiej prawdy)."""
    from enm.domain_ops_models import ReadinessBlocker

    view = ArcFlashBuilder().build([_in_range_input()])
    _, blockers = osd_arc_flash_gate(view, accepted=False)
    assert all(isinstance(b, ReadinessBlocker) for b in blockers)
