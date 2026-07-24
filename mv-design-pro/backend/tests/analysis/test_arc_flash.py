"""Testy D-01 Arc Flash — IEEE 1584-2018 (współczynniki open-source / audit-pending).

╔══════════════════════════════════════════════════════════════════════════╗
║  TE TESTY SPRAWDZAJĄ STRUKTURĘ, PLAUSYBILNOŚĆ I PROWENIENCJĘ —             ║
║  NIE ZGODNOŚĆ Z LICENCJONOWANĄ NORMĄ (nie posiadamy jej kopii).            ║
║                                                                            ║
║  Tablica współczynników IEEE 1584-2018 jest ŁADOWANA z trwałego pliku      ║
║  danych w repo; WARTOŚCI pochodzą z open-source'owej implementacji MIT     ║
║  rwl/arcflash (NIE z licencjonowanej IEEE Std 1584-2018). Dlatego:         ║
║    • na tablicy produkcyjnej (wypełnionej) ścieżka IEEE liczy REALNY wynik ║
║      ze statusem COMPUTED_IEEE_1584_OPEN_SOURCE i polskim zastrzeżeniem;   ║
║    • asercje sprawdzają: I_arc < I_bf, E/AFB skończone i dodatnie, rząd    ║
║      wielkości, NIE konkretną liczbę normy (nie mamy normy do porównania); ║
║    • interpolacja po napięciu działa (15 kV używa regionu 14300 V);        ║
║    • ścieżka Ralpha Lee (> 15 kV) jest oznaczona jako Lee, NIE IEEE 1584;  ║
║    • mapowanie ŚOI zwraca "dane niekompletne" — plik NIE ma granic NFPA;   ║
║    • bramka OSD blokuje użycie certyfikowane bez świadomej akceptacji      ║
║      (open-source/audit-pending); determinizm;                            ║
║    • KAŻDY policzony wynik niesie proweniencję open-source + URL-e źródeł. ║
║                                                                            ║
║  MATEMATYKĘ przepływu (algebrę) weryfikujemy także na WYRAŹNIE oznaczonej  ║
║  tablicy-ATRAPIE (TEST-ONLY) — atrapa NIE jest normą, służy tylko do       ║
║  sprawdzenia algebry struktury (interpolacja, liniowość czasu).           ║
╚══════════════════════════════════════════════════════════════════════════╝

Moduł konsumuje wynik zwarciowy jako zwykłe wejście (NIE importuje solvera —
arch_guard zabrania analysis -> solvers).
"""

from __future__ import annotations

import math

import pytest
from analysis.arc_flash import (
    ARC_FLASH_OPEN_SOURCE_CAVEAT_PL,
    ARC_FLASH_OPEN_SOURCE_PROVENANCE,
    ARC_FLASH_RALPH_LEE_LABEL,
    ARC_FLASH_TABLE_INCOMPLETE_STATUS,
    OSD_ARC_FLASH_BLOCKER_CODE,
    PPE_CATEGORY_INCOMPLETE,
    PRODUCTION_IEEE_1584_TABLE,
    ArcCurrentCoeffs,
    ArcCurrentVariationCoeffs,
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
    EnclosureType,
    IncidentEnergyCoeffs,
    PpeCategoryTable,
    TableProvenance,
    VoltageAnchor,
    empty_ieee_1584_table,
    load_ieee_1584_table,
    osd_arc_flash_gate,
)
from analysis.arc_flash.loader import DATA_FILE, build_table_from_payload
from analysis.arc_flash.models import INCIDENT_ENERGY_AFB_JOULE_CM2

# ---------------------------------------------------------------------------
# TEST-ONLY tablica-ATRAPA — NIE norma, NIE open-source: sztuczne liczby tylko
# do sprawdzenia algebry przepływu (interpolacja, liniowość czasu). Buduje się
# w realnej postaci k1..k10 / k1..k7 / k1..k13 / b1,b2,b3, dobranej tak, by
# algebra była sprawdzalna ręcznie.
# ---------------------------------------------------------------------------

# Atrapa prądu łuku (Tab.1, k1..k10): x1 = 0+1*lg(Ibf)+0*lg(G); x2 = 1 (k10=1,
# reszta 0) ⇒ I_arc = 10^lg(Ibf) * 1 = I_bf. Algebraicznie sprawdzalne.
_DUMMY_ARC_K = (0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0)

# Atrapa zmienności (Tab.2, k1..k7): same zera ⇒ VarCf = 0 ⇒ I_arc_min = I_arc.
_DUMMY_VAR_K = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)

# Atrapa energii (Tab.3/4/5, k1..k13): chcemy E = (12,552/50)*t * 10^(k12*lg(D)).
# k1..k11=0, k13=0, k12 = -1 ⇒ x5 = -lg(D); x2=x4=0 (CF=1 ⇒ lg(1)=0).
# x3 = k3*I_arc/denom = 0 (k3=0), ALE denom musi być ≠0 → k10=1 (mianownik = I_bf).
# ⇒ E = (12,552/50)*t * (1/D)  [J/cm²]. (indeksy: k1..k13 = pozycje 0..12)
_DUMMY_E_K = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, -1.0, 0.0)

# Atrapa korekcji obudowy (Tab.7, b1,b2,b3): b1=0,b2=0,b3=1 ⇒ x=1 ⇒ CF=1
# (neutralna, TEST-ONLY) niezależnie od EES.
_DUMMY_ENCLOSURE_B = (0.0, 0.0, 1.0)


def _dummy_table(*, anchors_differ: bool = False) -> ArcFlashCoefficientTable:
    """Buduje WYRAŹNIE oznaczoną TEST-ONLY tablicę-atrapę (NIE norma/open-source).

    Domyślnie wszystkie kotwy mają IDENTYCZNE współczynniki, więc interpolacja po
    napięciu daje tę samą wartość (łatwa algebra). Gdy ``anchors_differ`` True —
    kotwa 14300 V daje I_arc = 0,5*I_bf, by sprawdzić interpolację.
    """
    arc: dict[tuple[ElectrodeConfig, VoltageAnchor], ArcCurrentCoeffs] = {}
    variation: dict[ElectrodeConfig, ArcCurrentVariationCoeffs] = {}
    energy: dict[tuple[ElectrodeConfig, VoltageAnchor], IncidentEnergyCoeffs] = {}
    enclosure: dict[tuple[EnclosureType, ElectrodeConfig], EnclosureCorrectionCoeffs] = {}
    for cfg in ElectrodeConfig:
        for anchor in VoltageAnchor:
            k = _DUMMY_ARC_K
            if anchors_differ and anchor is VoltageAnchor.V14300:
                # I_arc = 0,5*I_bf: x2 = 0,5 (k10=0,5), x1 = lg(Ibf).
                k = (0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.5)
            arc[(cfg, anchor)] = ArcCurrentCoeffs(k=k)
            energy[(cfg, anchor)] = IncidentEnergyCoeffs(k=_DUMMY_E_K)
        variation[cfg] = ArcCurrentVariationCoeffs(k=_DUMMY_VAR_K)
        if cfg.is_boxed:
            for enc in EnclosureType:
                enclosure[(enc, cfg)] = EnclosureCorrectionCoeffs(b=_DUMMY_ENCLOSURE_B)
    return ArcFlashCoefficientTable(
        provenance=TableProvenance.OPEN_SOURCE_IEEE_1584,
        arc_current=arc,
        arc_variation=variation,
        incident_energy=energy,
        enclosure_correction=enclosure,
        source_urls=("test://dummy",),
        source_note_pl="TEST-ONLY atrapa — NIE norma IEEE 1584 ani open-source",
    )


def _dummy_ppe_table() -> PpeCategoryTable:
    """TEST-ONLY tablica progów ŚOI (NIE norma NFPA 70E). Sztuczne progi."""
    return PpeCategoryTable(
        provenance=TableProvenance.NORMA_NFPA_70E,
        boundaries=((1.2, "0"), (4.0, "1"), (8.0, "2"), (25.0, "3"), (40.0, "4")),
        over_limit_label_pl="POWYŻEJ 40 cal/cm² (TEST-ONLY)",
        source_note_pl="TEST-ONLY atrapa — NIE norma NFPA 70E",
    )


# Wejście w zakresie ważności IEEE 1584-2018 (standardowy przypadek SN).
def _in_range_input(**overrides: object) -> ArcFlashInput:
    base: dict[str, object] = {
        "bus_ref": "SZYNA-RG",
        "i_bf_ka": 25.0,
        "voltage_kv": 13.8,
        "arc_time_s": 0.2,
        "electrode_config": ElectrodeConfig.VCB,  # w obudowie (typowa) — realny SN
        "conductor_gap_mm": 152.0,
        "working_distance_mm": 914.4,
    }
    base.update(overrides)
    return ArcFlashInput(**base)  # type: ignore[arg-type]


def _build_one(item: ArcFlashInput, **builder_kwargs: object) -> ArcFlashResult:
    return ArcFlashBuilder(**builder_kwargs).build([item]).results[0]  # type: ignore[arg-type]


# ===========================================================================
# (1) TABLICA PRODUKCYJNA jest WYPEŁNIONA z pliku danych (open-source) — liczy
#     REALNY wynik z proweniencją audit-pending.
# ===========================================================================


def test_production_table_is_populated_from_data_file() -> None:
    """Tablica produkcyjna NIE jest pusta — wypełniona z pliku danych, proweniencja
    open-source (audit-pending), z cytowanymi URL-ami źródeł."""
    table = PRODUCTION_IEEE_1584_TABLE
    assert table.is_empty is False
    assert table.provenance is TableProvenance.OPEN_SOURCE_IEEE_1584
    assert table.provenance.value == "open_source_IEEE_1584"
    assert table.provenance.is_open_source is True
    assert table.provenance.is_verified_norm is False
    # Komplet współczynników dla wszystkich 5 konfiguracji (obudowa: typowa).
    for cfg in ElectrodeConfig:
        assert table.is_complete_for(cfg, EnclosureType.TYPICAL), cfg
    # URL-e źródeł obecne (cytowanie).
    assert table.source_urls
    assert any("rwl/arcflash" in u for u in table.source_urls)


def test_coefficients_loaded_from_data_file_match_typed_table() -> None:
    """Współczynniki są ŁADOWANE z pliku danych (audytowalnie) — Tab.1 k1..k10,
    Tab.2 k1..k7, Tab.3/4/5 k1..k13, Tab.7 b1,b2,b3 mają poprawne długości."""
    table = load_ieee_1584_table(DATA_FILE)
    arc = table.arc_entry(ElectrodeConfig.VCB, VoltageAnchor.V600)
    assert arc.k is not None and len(arc.k) == 10  # k1..k10
    var = table.variation_entry(ElectrodeConfig.VCB)
    assert var.k is not None and len(var.k) == 7  # k1..k7
    energy = table.energy_entry(ElectrodeConfig.VCB, VoltageAnchor.V14300)
    assert energy.k is not None and len(energy.k) == 13  # k1..k13
    assert energy.distance_exponent_k12 is not None  # wykładnik AFB = k12
    enc = table.enclosure_entry(EnclosureType.TYPICAL, ElectrodeConfig.VCB)
    assert enc.b is not None and len(enc.b) == 3  # b1,b2,b3
    # Konkretna wartość k1 Tab.1 VCB@600 z pliku (audyt, że ładujemy plik, nie zmyślamy).
    assert arc.k[0] == pytest.approx(-0.04287, rel=1e-9)


def test_default_builder_uses_populated_production_table() -> None:
    """Builder bez argumentów używa WYPEŁNIONEJ tablicy produkcyjnej (open-source)."""
    b = ArcFlashBuilder()
    assert b._table is PRODUCTION_IEEE_1584_TABLE  # noqa: SLF001 (test introspekcji)
    assert b._table.is_empty is False  # noqa: SLF001


# ===========================================================================
# (2) STANDARDOWY PRZYPADEK → COMPUTED_IEEE_1584_OPEN_SOURCE z realnym,
#     skończonym, fizycznie plausybilnym E/AFB + proweniencja audit-pending.
# ===========================================================================


def test_standard_case_computes_open_source_with_plausible_values() -> None:
    """Standardowy SN (VCB, 13,8 kV, 25 kA, 200 ms) liczy się ścieżką IEEE na
    danych open-source: I_arc < I_bf, E i AFB skończone i dodatnie, rząd wielkości.
    NIE porównujemy z licencjonowaną normą (nie mamy jej)."""
    r = _build_one(_in_range_input())
    assert r.status is ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE
    assert r.method is ArcFlashMethod.IEEE_1584_2018
    # Prąd łuku policzony, skończony, MNIEJSZY od prądu zwarcia bolted.
    assert r.i_arc_ka is not None and math.isfinite(r.i_arc_ka)
    assert 0.0 < r.i_arc_ka < r.i_bf_ka  # I_arc < I_bf (fizyka łuku)
    assert r.i_arc_min_ka is not None and r.i_arc_min_ka <= r.i_arc_ka  # redukcja zmienności
    # Energia skończona, dodatnia, w rozsądnym rzędzie wielkości (1–100 cal/cm²
    # dla 25 kA / 200 ms — NIE asercja konkretnej liczby normy).
    assert r.incident_energy_cal_cm2 is not None and math.isfinite(r.incident_energy_cal_cm2)
    assert 1.0 < r.incident_energy_cal_cm2 < 100.0
    # Spójność J/cm² ↔ cal/cm² (oba zaokrąglone niezależnie do 4 m. — tolerancja).
    assert r.incident_energy_joule_cm2 == pytest.approx(r.incident_energy_cal_cm2 * 4.184, abs=5e-3)
    # Granica łuku dodatnia, skończona, dłuższa niż odległość robocza (E>1,2 tam).
    assert r.arc_flash_boundary_mm is not None and math.isfinite(r.arc_flash_boundary_mm)
    assert r.arc_flash_boundary_mm > r.working_distance_mm
    assert len(r.white_box) == 5


def test_standard_case_carries_open_source_provenance_and_caveat() -> None:
    """KAŻDY policzony wynik IEEE niesie UCZCIWĄ proweniencję open-source, polskie
    zastrzeżenie i cytowane URL-e źródeł (audit-pending, nie licencjonowana norma)."""
    r = _build_one(_in_range_input())
    assert r.provenance == ARC_FLASH_OPEN_SOURCE_PROVENANCE
    assert "open-source" in r.provenance.lower()
    assert "NOT licensed-norm-verified" in r.provenance
    assert r.provenance_caveat_pl == ARC_FLASH_OPEN_SOURCE_CAVEAT_PL
    assert "weryfikacja" in r.provenance_caveat_pl.lower()
    assert r.source_urls  # cytowane źródła
    assert any("rwl/arcflash" in u for u in r.source_urls)
    # Zastrzeżenie obecne także w uzasadnieniu why_pl.
    assert ARC_FLASH_OPEN_SOURCE_CAVEAT_PL in r.why_pl


def test_all_five_configs_compute_on_production_data() -> None:
    """Wszystkie 5 konfiguracji IEEE 1584-2018 liczą się na danych produkcyjnych
    (open-source), z plausybilnym E/AFB."""
    for cfg in ElectrodeConfig:
        r = _build_one(_in_range_input(electrode_config=cfg))
        assert r.status is ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE, cfg
        assert r.i_arc_ka is not None and r.i_arc_ka > 0.0, cfg
        assert r.i_arc_ka < r.i_bf_ka, cfg
        assert r.incident_energy_cal_cm2 is not None and r.incident_energy_cal_cm2 > 0.0, cfg
        assert r.arc_flash_boundary_mm is not None and r.arc_flash_boundary_mm > 0.0, cfg


def test_open_air_has_cf_one_boxed_uses_table_7() -> None:
    """Otwarte powietrze (VOA/HOA) ⇒ CF=1; w obudowie (VCB) ⇒ CF z Tab.7 (≈1 dla
    domyślnej obudowy 20"). Oba liczą się na danych produkcyjnych."""
    open_air = _build_one(_in_range_input(electrode_config=ElectrodeConfig.VOA))
    boxed = _build_one(_in_range_input(electrode_config=ElectrodeConfig.VCB))
    assert open_air.enclosure_correction_cf == pytest.approx(1.0)
    assert boxed.status is ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE
    assert boxed.enclosure_correction_cf is not None and boxed.enclosure_correction_cf > 0.0


def test_vcb_enclosure_height_above_1244_6mm_uses_fixed_49in_cap() -> None:
    """Tab.6 IEEE 1584-2018: dla VCB WYSOKOŚĆ obudowy > 1244,6 mm ma STAŁY limit
    ekwiwalentny 49" (NIE rośnie dalej wg transformacji eq.11/12, w przeciwieństwie
    do szerokości i do VCBB/HCB) — zweryfikowane wobec rwl/arcflash
    ``cubicle.rs::calc_cf``. Sprawdzone pośrednio: CF dla b. wysokiej obudowy VCB
    (2000 mm) jest NIEZALEŻNE od napięcia (bo EES nasyca się na 49"), podczas gdy
    dla VCBB (ta sama wysokość) CF ZALEŻY od napięcia (eq.11/12 rośnie z U)."""
    tall_low_v = _build_one(
        _in_range_input(
            electrode_config=ElectrodeConfig.VCB,
            voltage_kv=2.7,
            enclosure_height_mm=2000.0,
            enclosure_width_mm=500.0,
        )
    )
    tall_high_v = _build_one(
        _in_range_input(
            electrode_config=ElectrodeConfig.VCB,
            voltage_kv=14.3,
            enclosure_height_mm=2000.0,
            enclosure_width_mm=500.0,
        )
    )
    assert tall_low_v.enclosure_correction_cf is not None
    assert tall_high_v.enclosure_correction_cf is not None
    # VCB: CF NIEZALEŻNE od napięcia dla wysokiej obudowy (limit 49" nasycony).
    assert tall_low_v.enclosure_correction_cf == pytest.approx(
        tall_high_v.enclosure_correction_cf, rel=1e-9
    )

    tall_vcbb_low_v = _build_one(
        _in_range_input(
            electrode_config=ElectrodeConfig.VCBB,
            voltage_kv=2.7,
            enclosure_height_mm=2000.0,
            enclosure_width_mm=500.0,
        )
    )
    tall_vcbb_high_v = _build_one(
        _in_range_input(
            electrode_config=ElectrodeConfig.VCBB,
            voltage_kv=14.3,
            enclosure_height_mm=2000.0,
            enclosure_width_mm=500.0,
        )
    )
    assert tall_vcbb_low_v.enclosure_correction_cf is not None
    assert tall_vcbb_high_v.enclosure_correction_cf is not None
    # VCBB: CF ZALEŻY od napięcia dla wysokiej obudowy (eq.11/12 bez limitu 49").
    assert tall_vcbb_low_v.enclosure_correction_cf != pytest.approx(
        tall_vcbb_high_v.enclosure_correction_cf, rel=1e-6
    )


def test_longer_arc_time_increases_energy() -> None:
    """Dłuższy czas łuku ⇒ większa energia (człon 12,552/50·t liniowy w czasie).
    Dwukrotny czas ⇒ dwukrotna energia (na danych produkcyjnych)."""
    short = _build_one(_in_range_input(arc_time_s=0.2))
    longer = _build_one(_in_range_input(arc_time_s=0.4))
    assert short.incident_energy_cal_cm2 is not None
    assert longer.incident_energy_cal_cm2 is not None
    assert longer.incident_energy_cal_cm2 == pytest.approx(
        2.0 * short.incident_energy_cal_cm2, rel=1e-3
    )


def test_afb_is_distance_where_energy_equals_threshold_on_production_data() -> None:
    """AFB to odległość, na której E spada do 1,2 cal/cm² (= 5,0208 J/cm²).
    Re-podstawienie D=AFB do modelu energii kotwy musi dać próg (spójność
    odwrócenia) — sprawdzone dla VOA (CF=1) na danych produkcyjnych."""
    item = _in_range_input(electrode_config=ElectrodeConfig.VOA)
    r = _build_one(item)
    assert r.arc_flash_boundary_mm is not None
    afb = r.arc_flash_boundary_mm
    # Re-policz energię na D=afb tymi samymi współczynnikami (region 14300 dla 13,8 kV).
    table = PRODUCTION_IEEE_1584_TABLE
    builder = ArcFlashBuilder()
    # I_arc kotwy 14300 (region używany dla 13,8 kV w interpolacji x2 dla U>2,7).
    i_arc_14300 = builder._arc_current_at_anchor(  # noqa: SLF001
        25.0, 152.0, table.arc_entry(ElectrodeConfig.VOA, VoltageAnchor.V14300)
    )
    e_at_afb = builder._incident_energy_at_anchor(  # noqa: SLF001
        25.0,
        i_arc_14300,
        152.0,
        0.2 * 1000.0,
        afb,
        1.0,
        table.energy_entry(ElectrodeConfig.VOA, VoltageAnchor.V14300),
    )
    # Energia na granicy ≈ próg 5,0208 J/cm² (region 14300; 13,8 kV → x2 ≈ kotwa 14300).
    assert e_at_afb == pytest.approx(INCIDENT_ENERGY_AFB_JOULE_CM2, rel=0.05)


# ===========================================================================
# (3) Interpolacja po napięciu (algebra na atrapie + region 14300 dla 15 kV).
# ===========================================================================


def test_voltage_interpolation_uses_14300_region_at_15kv() -> None:
    """15 kV (górny kraniec zakresu IEEE) używa REGIONU 14300 V: wynik 15 kV jest
    BLISKI wynikowi przy 14,3 kV i ODMIENNY od wyniku przy 2,7 kV (kotwa niska).
    Sprawdza, że interpolacja zakotwicza się na 14300 V dla wysokich napięć."""
    r_15 = _build_one(_in_range_input(voltage_kv=15.0, electrode_config=ElectrodeConfig.VOA))
    r_143 = _build_one(_in_range_input(voltage_kv=14.3, electrode_config=ElectrodeConfig.VOA))
    r_27 = _build_one(_in_range_input(voltage_kv=2.7, electrode_config=ElectrodeConfig.VOA))
    assert r_15.status is ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE
    assert r_15.incident_energy_cal_cm2 is not None
    assert r_143.incident_energy_cal_cm2 is not None
    assert r_27.incident_energy_cal_cm2 is not None
    # 15 kV bliżej regionu 14,3 kV niż region 2,7 kV (zakotwiczenie na 14300 V).
    d_to_14300 = abs(r_15.incident_energy_cal_cm2 - r_143.incident_energy_cal_cm2)
    d_to_2700 = abs(r_15.incident_energy_cal_cm2 - r_27.incident_energy_cal_cm2)
    assert d_to_14300 < d_to_2700


def test_pipeline_math_interpolates_between_voltage_anchors_on_dummy() -> None:
    """Algebra interpolacji (TEST-ONLY atrapa): I_arc=I_bf przy 600/2700 V,
    I_arc=0,5*I_bf przy 14300 V. Przy 8,5 kV (>2,7) interpolacja x2 na parze
    2700↔14300 V: x2 = ((I14300−I2700)/11,6)·(U−14,3) + I14300."""
    table = _dummy_table(anchors_differ=True)
    r_mid = _build_one(
        _in_range_input(voltage_kv=8.5, electrode_config=ElectrodeConfig.VOA),
        coefficient_table=table,
    )
    assert r_mid.i_arc_ka is not None
    i2700, i14300 = 25.0, 12.5  # atrapa: 2700→I_bf, 14300→0,5*I_bf
    expected = ((i14300 - i2700) / 11.6) * (8.5 - 14.3) + i14300
    assert r_mid.i_arc_ka == pytest.approx(expected, rel=1e-6)
    # Wartości kotew też raportowane.
    assert r_mid.i_arc_at_anchors_ka is not None
    assert r_mid.i_arc_at_anchors_ka["V2700"] == pytest.approx(25.0, rel=1e-6)
    assert r_mid.i_arc_at_anchors_ka["V14300"] == pytest.approx(12.5, rel=1e-6)


def test_pipeline_math_time_linearity_on_dummy() -> None:
    """Algebra liniowości czasu (atrapa): E = (12,552/50)·t·(1/D). Dwukrotny czas
    ⇒ dwukrotna energia. Sprawdza człon czasu 12,552/50 (t w ms)."""
    short = _build_one(_in_range_input(arc_time_s=0.2), coefficient_table=_dummy_table())
    longer = _build_one(_in_range_input(arc_time_s=0.4), coefficient_table=_dummy_table())
    assert short.incident_energy_cal_cm2 is not None and longer.incident_energy_cal_cm2 is not None
    assert longer.incident_energy_cal_cm2 == pytest.approx(
        2.0 * short.incident_energy_cal_cm2, rel=1e-6
    )


def test_computed_result_has_full_white_box_with_table_refs() -> None:
    """Policzony wynik IEEE ma 5 kroków White Box, każdy z table_ref (Tab.1/2/3-5/7)."""
    r = _build_one(_in_range_input(), ppe_table=_dummy_ppe_table())
    assert r.status is ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE
    assert len(r.white_box) == 5
    for step in r.white_box:
        assert step.symbol and step.formula_latex
        assert step.substitution_pl and step.result_pl and step.unit_check_pl
        assert step.table_ref  # KTÓRY wpis tablicy użyto (lub publiczny próg)
    symbols = {step.symbol for step in r.white_box}
    assert {"I_arc", "CF", "E", "AFB", "ŚOI"}.issubset(symbols)


# ===========================================================================
# (4) PUSTA / NIEPEŁNA tablica → "dane niekompletne — tablice współczynników".
# ===========================================================================


def test_empty_table_blocks_every_compute_path() -> None:
    """Na PUSTEJ tablicy (wzorzec ``empty_ieee_1584_table``) KAŻDa konfiguracja w
    zakresie zwraca INCOMPLETE_TABLE — bez ŻADNEJ policzonej liczby."""
    empty = empty_ieee_1584_table()
    assert empty.is_empty
    for cfg in ElectrodeConfig:
        r = _build_one(_in_range_input(electrode_config=cfg), coefficient_table=empty)
        assert r.status is ArcFlashStatus.INCOMPLETE_TABLE, cfg
        assert r.status.label_pl == ARC_FLASH_TABLE_INCOMPLETE_STATUS
        assert r.i_arc_ka is None, cfg
        assert r.i_arc_at_anchors_ka is None, cfg
        assert r.incident_energy_cal_cm2 is None, cfg
        assert r.arc_flash_boundary_mm is None, cfg
        assert r.ppe_category is None, cfg
        assert r.provenance is None, cfg  # brak proweniencji policzonego wyniku
        assert r.white_box == ()
        assert r.missing_data, cfg
        assert ARC_FLASH_TABLE_INCOMPLETE_STATUS in r.why_pl


def test_partial_table_for_config_is_incomplete() -> None:
    """Tablica wypełniona dla VOA, ale NIE dla VCB ⇒ VCB = INCOMPLETE_TABLE
    (kompletność per konfiguracja; brak częściowego zmyślania)."""
    full = _dummy_table()
    partial_energy = dict(full.incident_energy)
    partial_energy[(ElectrodeConfig.VCB, VoltageAnchor.V600)] = IncidentEnergyCoeffs()
    partial = ArcFlashCoefficientTable(
        provenance=full.provenance,
        arc_current=full.arc_current,
        arc_variation=full.arc_variation,
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
    assert voa.status is ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE


def test_missing_variation_table_is_incomplete() -> None:
    """Brak współczynników zmienności (Tab.2) dla konfiguracji ⇒ INCOMPLETE_TABLE
    (Tab.2 jest obowiązkowa w komplecie — bez niej nie liczymy I_arc_min)."""
    full = _dummy_table()
    variation = dict(full.arc_variation)
    variation[ElectrodeConfig.VOA] = ArcCurrentVariationCoeffs()  # usuń Tab.2 dla VOA
    partial = ArcFlashCoefficientTable(
        provenance=full.provenance,
        arc_current=full.arc_current,
        arc_variation=variation,
        incident_energy=full.incident_energy,
        enclosure_correction=full.enclosure_correction,
    )
    r = _build_one(_in_range_input(electrode_config=ElectrodeConfig.VOA), coefficient_table=partial)
    assert r.status is ArcFlashStatus.INCOMPLETE_TABLE
    assert "var_cf[VOA]" in r.missing_data


# ===========================================================================
# (5) Ralph Lee dla > 15 kV, OZNACZONY jako Lee (NIE IEEE 1584).
# ===========================================================================


def test_ralph_lee_path_triggers_above_15kv() -> None:
    """U > 15 kV (poza zakresem IEEE 1584-2018) ⇒ metoda Ralpha Lee, OZNACZONA
    jako Lee, NIE jako IEEE 1584. Liczy się NAWET na danych produkcyjnych IEEE."""
    r = _build_one(_in_range_input(voltage_kv=20.0))
    assert r.status is ArcFlashStatus.COMPUTED_RALPH_LEE
    assert r.method is ArcFlashMethod.RALPH_LEE
    assert r.incident_energy_cal_cm2 is not None and r.incident_energy_cal_cm2 > 0.0
    assert r.arc_flash_boundary_mm is not None and r.arc_flash_boundary_mm > 0.0
    assert ARC_FLASH_RALPH_LEE_LABEL in r.why_pl
    assert "NIE jest wynik IEEE 1584" in r.why_pl
    # Lee to postać zamknięta — bez proweniencji współczynników open-source.
    assert r.provenance is None
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
    r = _build_one(_in_range_input(voltage_kv=30.0))
    assert r.status is ArcFlashStatus.COMPUTED_RALPH_LEE
    assert r.method is ArcFlashMethod.RALPH_LEE


@pytest.mark.parametrize(
    "voltage_kv,i_bf_ka,expect_lee",
    [
        (13.8, 25.0, False),  # w zakresie ⇒ IEEE (open-source)
        (15.0, 25.0, False),  # 15 kV = górny kraniec ⇒ IEEE
        (20.0, 25.0, True),  # U > 15 kV ⇒ Lee
        (0.1, 25.0, True),  # U < 208 V ⇒ poza zakresem ⇒ Lee
        (13.8, 120.0, True),  # HV: I_bf > 65 kA (górny kraniec HV) ⇒ poza zakresem ⇒ Lee
        # RE-BASELINE (audyt fizyki, fala G, 2026-07): poprzedni test zakładał JEDEN
        # wspólny przedział I_bf 500 A-106 kA dla LV i HV (defekt W7 — bramka na złej
        # wielkości/progu). Norma (zweryfikowana wobec referencyjnej implementacji
        # open-source rwl/arcflash, i_arc.rs::i_arc()) używa DWÓCH przedziałów:
        # LV (U<=600 V) 500 A-106 kA, HV (600 V<U<=15 kV) 200 A-65 kA. 13,8 kV/300 A
        # jest W ZAKRESIE HV (300 A > 200 A) ⇒ IEEE, NIE Lee. Stary test utrwalał
        # defekt (test-utrwalający-defekt, W8): 300 A < 500 A (próg LV błędnie
        # stosowany do HV) dawało fałszywe "poza zakresem".
        (13.8, 0.3, False),  # HV: I_bf=300 A >= 200 A (dolny próg HV) ⇒ W ZAKRESIE ⇒ IEEE
        (13.8, 0.199, True),  # HV: I_bf=199 A < 200 A (dolny próg HV) ⇒ poza zakresem ⇒ Lee
        (13.8, 65.0, False),  # HV: I_bf=65 kA = górny próg HV (inclusive) ⇒ IEEE
        (13.8, 65.001, True),  # HV: I_bf=65,001 kA > górny próg HV ⇒ poza zakresem ⇒ Lee
        (0.4, 0.5, False),  # LV: I_bf=500 A = dolny próg LV (inclusive) ⇒ IEEE
        (0.4, 0.499, True),  # LV: I_bf=499 A < dolny próg LV ⇒ poza zakresem ⇒ Lee
        (0.4, 106.0, False),  # LV: I_bf=106 kA = górny próg LV (inclusive) ⇒ IEEE
        (0.4, 106.001, True),  # LV: I_bf=106,001 kA > górny próg LV ⇒ poza zakresem ⇒ Lee
    ],
)
def test_validity_range_gating(voltage_kv: float, i_bf_ka: float, expect_lee: bool) -> None:
    """Poza zakresem ważności (U lub I_bf) builder przełącza na Lee; w zakresie
    używa ścieżki IEEE (na danych produkcyjnych open-source). Przedział I_bf
    ZALEŻY od klasy napięcia (LV 500 A-106 kA; HV 200 A-65 kA) — patrz RE-BASELINE
    powyżej."""
    r = _build_one(_in_range_input(voltage_kv=voltage_kv, i_bf_ka=i_bf_ka))
    if expect_lee:
        assert r.status is ArcFlashStatus.COMPUTED_RALPH_LEE, (voltage_kv, i_bf_ka)
        assert r.method is ArcFlashMethod.RALPH_LEE
    else:
        assert r.status is ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE, (voltage_kv, i_bf_ka)
        assert r.method is ArcFlashMethod.IEEE_1584_2018


# ===========================================================================
# (11) Ścieżka LV (U<=600 V) — korekcja Eq.25 do rzeczywistego napięcia układu.
#      Audyt fizyki, fala G (2026-07): poprzedni kod stosował dla KAŻDEGO
#      U<=600 V wartość policzoną TAK, jakby układ miał dokładnie 600 V (brak
#      Eq.25) — błąd do ok. 46% prądu łuku dla typowego układu 208 V. Poniższe
#      testy weryfikują korektę NIEZALEŻNYM rachunkiem ręcznym (Eq.1 + Eq.25 na
#      współczynnikach Tab.1 VCB@600V z pliku produkcyjnego).
# ===========================================================================


def test_lv_path_applies_eq25_voltage_correction_not_raw_600v_anchor() -> None:
    """208 V/20 kA/32 mm (VCB): I_arc MUSI być skorygowany Eq.25, NIE równy
    surowej wartości pośredniej Eq.1 przy kotwie 600 V (defekt sprzed naprawy).

    Rachunek kontrolny (Tab.1 VCB@600V, produkcyjne dane open-source):
    k1..k10 = -0,04287; 1,035; -0,083; 0; 0; -4,783e-9; 1,962e-6; -0,000229;
    0,003141; 1,092.
        x1 = k1 + k2*lg(20) + k3*lg(32) = -0,04287 + 1,035*1,30103 + (-0,083)*1,50515
           = 1,161719...
        x2 = k6*20^4 + k7*20^3 + k8*20^2 + k9*20 + k10
           = -4,783e-9*160000 + 1,962e-6*8000 + (-0,000229)*400 + 0,003141*20 + 1,092
           = -0,00076528 + 0,015696 - 0,0916 + 0,06282 + 1,092 = 1,0784707...
        I_arc,600 = 10^x1 * x2 = 10^1,161719 * 1,0784707 = 16,2723 kA (Eq.1)
    Eq.25 przy U=0,208 kV:
        I_arc = [ (0,6/0,208)^2 * (1/16,2723^2 - (0,6^2-0,208^2)/(0,6^2*20^2)) ]^(-1/2)
              = 8,7294 kA  (różnica od 16,2723 kA: -46,35% — defekt sprzed naprawy
                zawyżał I_arc, a w ślad za nim E i AFB, dla układów LV < 600 V).
    """
    item = _in_range_input(
        voltage_kv=0.208,
        i_bf_ka=20.0,
        conductor_gap_mm=32.0,
        working_distance_mm=455.0,
        electrode_config=ElectrodeConfig.VCB,
    )
    r = _build_one(item)
    assert r.status is ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE
    assert r.i_arc_ka is not None
    # Rachunek kontrolny Eq.1 (wartość pośrednia, NIESKORYGOWANA) na danych produkcyjnych.
    i_arc_600_expected = 16.2723
    assert r.i_arc_at_anchors_ka is not None
    assert r.i_arc_at_anchors_ka["V600"] == pytest.approx(i_arc_600_expected, abs=2e-3)
    # Rachunek kontrolny Eq.25 (skorygowany do rzeczywistego U=0,208 kV).
    i_arc_corrected_expected = 8.7294
    assert r.i_arc_ka == pytest.approx(i_arc_corrected_expected, abs=2e-3)
    # I_arc SKORYGOWANY musi być WYRAŹNIE mniejszy niż wartość pośrednia 600 V
    # (dowód, że korekcja Eq.25 faktycznie zadziałała, a nie została pominięta).
    assert r.i_arc_ka < 0.6 * i_arc_600_expected


def test_lv_path_voltage_dependence_208v_vs_480v_vs_600v() -> None:
    """Dla STAŁEGO I_bf/G różne napięcia LV (208/480/600 V) MUSZĄ dać RÓŻNE
    I_arc (Eq.25 zależy jawnie od U). Przy U=600 V Eq.25 zwraca dokładnie
    wartość pośrednią Eq.1 (redukuje się do tożsamości — kotwa=napięcie)."""
    base = {
        "i_bf_ka": 20.0,
        "conductor_gap_mm": 32.0,
        "working_distance_mm": 455.0,
        "electrode_config": ElectrodeConfig.VCB,
    }
    r208 = _build_one(_in_range_input(voltage_kv=0.208, **base))
    r480 = _build_one(_in_range_input(voltage_kv=0.48, **base))
    r600 = _build_one(_in_range_input(voltage_kv=0.6, **base))
    assert r208.i_arc_ka is not None and r480.i_arc_ka is not None and r600.i_arc_ka is not None
    # Monotonicznie rosnące I_arc wraz z napięciem LV (Eq.25).
    assert r208.i_arc_ka < r480.i_arc_ka < r600.i_arc_ka
    # Przy U=600 V Eq.25 redukuje się do wartości pośredniej Eq.1 (kotwa=U).
    assert r600.i_arc_ka == pytest.approx(r600.i_arc_at_anchors_ka["V600"], rel=1e-6)  # type: ignore[index]


def test_lv_path_no_anchor_interpolation_only_v600_used() -> None:
    """Ścieżka LV NIE interpoluje między kotwami — raportowany słownik kotew
    zawiera WYŁĄCZNIE V600 (norma liczy bezpośrednio dla U<=600 V, bez 2700/14300)."""
    r = _build_one(_in_range_input(voltage_kv=0.4, i_bf_ka=10.0))
    assert r.i_arc_at_anchors_ka is not None
    assert set(r.i_arc_at_anchors_ka.keys()) == {"V600"}


def test_lv_path_energy_uses_uncorrected_i_arc600_in_x3_and_corrected_in_x4() -> None:
    """Rachunek kontrolny x3 (Eq.6, licznik) używa I_arc,600 NIESKORYGOWANEGO,
    a x4 (człon logarytmiczny) I_arc SKORYGOWANEGO Eq.25 — zweryfikowane wobec
    rwl/arcflash ``equations.rs::intermediate_e`` (gałąź LV). Podmiana obu na tę
    samą wartość dałaby INNY wynik energii — test dowodzi, że kod ich NIE myli."""
    from analysis.arc_flash.loader import PRODUCTION_IEEE_1584_TABLE

    table = PRODUCTION_IEEE_1584_TABLE
    i_bf, gap, u, t_ms, d = 20.0, 32.0, 0.208, 200.0, 455.0
    builder = ArcFlashBuilder()
    arc_coeffs_600 = table.arc_entry(ElectrodeConfig.VCB, VoltageAnchor.V600)
    i_arc_600 = builder._arc_current_at_anchor(i_bf, gap, arc_coeffs_600)  # noqa: SLF001
    i_arc_final = builder._arc_current_final_lv(u, i_arc_600, i_bf)  # noqa: SLF001
    cf = 1.0  # otwarte powietrze / neutralne dla porównania algebry
    energy_coeffs_600 = table.energy_entry(ElectrodeConfig.VCB, VoltageAnchor.V600)
    e_correct = builder._incident_energy_lv(  # noqa: SLF001
        i_bf, i_arc_final, i_arc_600, gap, t_ms, d, cf, energy_coeffs_600
    )
    # Wersja BŁĘDNA (hipotetyczna): oba człony na i_arc_600 (jak przy pomyłce W3/W7).
    e_wrong_both_uncorrected = builder._incident_energy_at_anchor(  # noqa: SLF001
        i_bf, i_arc_600, gap, t_ms, d, cf, energy_coeffs_600
    )
    assert e_correct != pytest.approx(e_wrong_both_uncorrected, rel=1e-6)


# ===========================================================================
# (6) Mapowanie ŚOI: plik danych NIE ma granic NFPA → "dane niekompletne".
# ===========================================================================


def test_ppe_incomplete_because_no_nfpa_data_in_file() -> None:
    """Plik danych NIE zawiera granic kategorii NFPA 70E ⇒ kategoria ŚOI = "dane
    niekompletne — tablice NFPA 70E"; proweniencja ŚOI None (zakaz zmyślania
    granic). Ścieżka IEEE liczy E i AFB niezależnie."""
    r = _build_one(_in_range_input())  # domyślna pusta tablica NFPA
    assert r.status is ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE
    assert r.incident_energy_cal_cm2 is not None  # energia policzona…
    assert r.arc_flash_boundary_mm is not None  # AFB policzona…
    assert r.ppe_category == PPE_CATEGORY_INCOMPLETE  # …ale kategoria niedostępna
    assert r.ppe_table_provenance is None


def test_ppe_mapping_structure_with_dummy_nfpa_table() -> None:
    """Z TEST-ONLY tablicą progów ŚOI mapowanie zwraca kategorię i proweniencję
    norma_NFPA_70E. Test STRUKTURY mapowania (atrapa, nie norma)."""
    r = _build_one(_in_range_input(), ppe_table=_dummy_ppe_table())
    assert r.ppe_category in {"0", "1", "2", "3", "4"} or "POWYŻEJ" in (r.ppe_category or "")
    assert r.ppe_table_provenance == TableProvenance.NORMA_NFPA_70E.value


def test_ppe_boundary_selection_is_monotone_with_dummy_table() -> None:
    """Większa energia ⇒ kategoria nie niższa (monotoniczność mapowania progów)."""
    ppe = _dummy_ppe_table()
    low = _build_one(_in_range_input(i_bf_ka=1.0, working_distance_mm=2000.0), ppe_table=ppe)
    high = _build_one(_in_range_input(i_bf_ka=100.0, working_distance_mm=200.0), ppe_table=ppe)
    assert low.incident_energy_cal_cm2 is not None and high.incident_energy_cal_cm2 is not None
    assert high.incident_energy_cal_cm2 > low.incident_energy_cal_cm2
    order = {"0": 0, "1": 1, "2": 2, "3": 3, "4": 4}
    lo_rank = order.get(low.ppe_category or "", 99)
    hi_rank = order.get(high.ppe_category or "", 99)
    assert hi_rank >= lo_rank


# ===========================================================================
# (7) Czas łuku z czasu wyłączenia + "dane niekompletne" gdy brak wejścia.
# ===========================================================================


def test_arc_time_wired_from_trip_clearing_time() -> None:
    """arc_time_s pochodzi z czasu wyłączenia (koordynacja zabezpieczeń — to samo
    źródło co U_touch/uziemienie). Tu jawnie podany; wynik go używa."""
    clearing_time_s = 0.35
    r = _build_one(_in_range_input(arc_time_s=clearing_time_s))
    assert r.arc_time_s == pytest.approx(clearing_time_s)
    assert r.status is ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE


def test_missing_arc_time_is_incomplete_input() -> None:
    """Brak czasu łuku (czas wyłączenia niedostępny) ⇒ "dane niekompletne",
    bez zmyślania. Nawet na danych produkcyjnych."""
    r = _build_one(_in_range_input(arc_time_s=None))
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
    r = _build_one(_in_range_input(**kwargs))
    assert r.status is ArcFlashStatus.INCOMPLETE_INPUT
    assert field_name in r.missing_data
    assert r.i_arc_ka is None
    assert r.incident_energy_cal_cm2 is None
    assert r.arc_flash_boundary_mm is None
    assert r.ppe_category is None
    assert r.white_box == ()
    assert "dane niekompletne" in r.why_pl.lower()


# ===========================================================================
# (8) Determinizm.
# ===========================================================================


def test_analysis_id_is_deterministic() -> None:
    ctx = ArcFlashContext(project_name="P", case_name="C")
    first = ArcFlashBuilder().build([_in_range_input()], context=ctx)
    second = ArcFlashBuilder().build([_in_range_input()], context=ctx)
    assert first.analysis_id == second.analysis_id
    assert first.to_dict() == second.to_dict()


def test_analysis_id_changes_with_inputs() -> None:
    a = ArcFlashBuilder().build([_in_range_input(i_bf_ka=25.0)])
    b = ArcFlashBuilder().build([_in_range_input(i_bf_ka=30.0)])
    assert a.analysis_id != b.analysis_id


def test_multiple_points_sorted_deterministically() -> None:
    unsorted = [
        _in_range_input(bus_ref="Z"),
        _in_range_input(bus_ref="A"),
        _in_range_input(bus_ref="M"),
    ]
    view = ArcFlashBuilder().build(unsorted)
    refs = [r.bus_ref for r in view.results]
    assert refs == ["A", "M", "Z"]


def test_loader_is_deterministic() -> None:
    """Dwukrotne załadowanie tablicy z pliku daje identyczną serializację (determinizm)."""
    t1 = load_ieee_1584_table(DATA_FILE)
    t2 = load_ieee_1584_table(DATA_FILE)
    assert t1.to_dict() == t2.to_dict()


# ===========================================================================
# (9) Tablica niesie proweniencję open-source + cytowane źródła (audytowalnie).
# ===========================================================================


def test_production_table_serializes_open_source_provenance_and_sources() -> None:
    """Zserializowana tablica produkcyjna deklaruje proweniencję open-source i
    cytuje URL-e źródeł (audytowalna proweniencja każdego współczynnika)."""
    d = PRODUCTION_IEEE_1584_TABLE.to_dict()
    assert d["provenance"] == "open_source_IEEE_1584"
    assert d["is_empty"] is False
    assert d["source_urls"]
    assert any("rwl/arcflash" in u for u in d["source_urls"])
    # Wpisy prądu łuku / energii mają komplet współczynników (present True).
    for entry in d["arc_current"].values():
        assert entry["present"] is True
        assert entry["k"] is not None and len(entry["k"]) == 10
    for entry in d["incident_energy"].values():
        assert entry["present"] is True
        assert entry["k"] is not None and len(entry["k"]) == 13


def test_no_fabricated_numbers_outside_data_file() -> None:
    """Niezmiennik: tablica produkcyjna jest IDENTYCZNA z tablicą zbudowaną wprost
    z pliku danych — żadnych liczb dosypanych poza plikiem (audyt proweniencji)."""
    import json
    from pathlib import Path

    payload = json.loads(Path(DATA_FILE).read_text(encoding="utf-8"))
    rebuilt = build_table_from_payload(payload)
    assert rebuilt.to_dict() == PRODUCTION_IEEE_1584_TABLE.to_dict()


def test_empty_ppe_table_carries_norma_nfpa_provenance() -> None:
    """Pusta tablica progów ŚOI deklaruje proweniencję norma_NFPA_70E + brak granic."""
    from analysis.arc_flash import PRODUCTION_NFPA_70E_PPE_TABLE

    t = PRODUCTION_NFPA_70E_PPE_TABLE
    assert t.provenance is TableProvenance.NORMA_NFPA_70E
    assert t.is_empty
    assert t.boundaries == ()


# ===========================================================================
# (10) Serializacja, bramka OSD, granica warstw (arch_guard).
# ===========================================================================


def test_serialized_view_carries_provenance_status_and_values() -> None:
    """Zserializowany widok niesie status open-source, proweniencję, zastrzeżenie,
    cytowane źródła i policzone wartości E/AFB."""
    view = ArcFlashBuilder().build([_in_range_input()])
    d = view.to_dict()
    assert d["status"] == ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE.value
    assert d["coefficient_table"]["provenance"] == "open_source_IEEE_1584"
    assert d["coefficient_table"]["is_empty"] is False
    for rd in d["results"]:
        assert rd["status"] == ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE.value
        assert rd["provenance"] == ARC_FLASH_OPEN_SOURCE_PROVENANCE
        assert rd["provenance_caveat_pl"] == ARC_FLASH_OPEN_SOURCE_CAVEAT_PL
        assert rd["source_urls"]
        assert rd["i_arc_ka"] is not None
        assert rd["incident_energy_cal_cm2"] is not None
        assert rd["arc_flash_boundary_mm"] is not None


def test_status_enum_is_distinct_from_field_quality() -> None:
    """Status wyniku Arc Flash to ODRĘBNA oś od FieldQuality (jakości danych) —
    nie nadużywamy DATASHEET/ESTIMATED do statusu obliczenia/tablicy."""
    from solver_input.provenance import FieldQuality

    status_values = {s.value for s in ArcFlashStatus}
    quality_values = {q.value for q in FieldQuality}
    assert status_values.isdisjoint(quality_values)
    table_prov_values = {p.value for p in TableProvenance}
    assert table_prov_values.isdisjoint(quality_values)
    assert "oszacowane" not in table_prov_values


def test_arc_flash_does_not_import_solver_layer() -> None:
    """arch_guard: warstwa analizy nie może importować solverów."""
    import sys

    for mod in list(sys.modules):
        if mod.startswith("network_model.solvers"):
            del sys.modules[mod]
    import analysis.arc_flash.builder  # noqa: F401
    import analysis.arc_flash.loader  # noqa: F401
    import analysis.arc_flash.models  # noqa: F401

    assert not any(
        m.startswith("network_model.solvers") for m in sys.modules
    ), "arc_flash nie powinien importować warstwy solverów"


def test_structure_runs_end_to_end_from_short_circuit_result() -> None:
    """Wejście odwzorowane z prawdziwego ShortCircuitResult (read-only odczyt
    frozen API). Na danych produkcyjnych daje COMPUTED_IEEE_1584_OPEN_SOURCE —
    dowodzi konsumpcji wyniku SC bez importu solvera w warstwie analizy."""
    from network_model.solvers.short_circuit_iec60909 import (
        ShortCircuitResult,
        ShortCircuitType,
    )

    sc = ShortCircuitResult(
        short_circuit_type=ShortCircuitType.THREE_PHASE,
        fault_node_id="SZYNA-13.8kV",
        c_factor=1.1,
        un_v=13_800.0,
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
        arc_time_s=sc.tk_s,
        electrode_config=ElectrodeConfig.VCB,
        conductor_gap_mm=152.0,
        working_distance_mm=914.4,
    )
    view = ArcFlashBuilder().build([item])  # dane produkcyjne (open-source)
    assert isinstance(view, ArcFlashView)
    r = view.results[0]
    assert r.status is ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE
    assert r.i_bf_ka == pytest.approx(25.0)
    assert r.voltage_kv == pytest.approx(13.8)
    assert r.i_arc_ka is not None and r.i_arc_ka < r.i_bf_ka  # realny prąd łuku


def test_osd_gate_blocks_open_source_result_without_acceptance() -> None:
    """Wynik open-source (COMPUTED_IEEE_1584_OPEN_SOURCE, audit-pending) BLOKUJE
    użycie certyfikowane/OSD bez świadomej akceptacji proweniencji open-source —
    mimo że liczy realny wynik (to sedno: realny wynik, ale weryfikacja wymagana)."""
    view = ArcFlashBuilder().build([_in_range_input()])
    assert view.status is ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE
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


def test_osd_gate_passes_with_conscious_acceptance() -> None:
    """Z jawną akceptacją inżyniera (świadoma akceptacja proweniencji open-source)
    wynik audit-pending może wejść do pakietu OSD."""
    view = ArcFlashBuilder().build([_in_range_input()])
    ready, blockers = osd_arc_flash_gate(view, accepted=True)
    assert ready is True
    assert blockers == []


def test_osd_gate_passes_only_for_verified_norm_result() -> None:
    """Bramka OSD przechodzi BEZ akceptacji TYLKO dla wyniku ZWERYFIKOWANEGO z
    licencjonowaną normą (COMPUTED_IEEE_1584). Symulujemy stan docelowy:
    tablica z proweniencją norma_IEEE_1584 (po weryfikacji)."""
    import json
    from pathlib import Path

    payload = json.loads(Path(DATA_FILE).read_text(encoding="utf-8"))
    verified_table = build_table_from_payload(payload, provenance=TableProvenance.NORMA_IEEE_1584)
    # Builder oznacza wynik jako zweryfikowany tylko gdy tablica jest zweryfikowana.
    # (Bieżący builder zwraca OPEN_SOURCE; ten test dokumentuje wymóg bramki:
    # przejście bez akceptacji wymaga statusu COMPUTED_IEEE_1584.)
    view = ArcFlashBuilder(coefficient_table=verified_table).build([_in_range_input()])
    # Dopóki builder nie rozróżnia proweniencji tablicy w statusie, wynik pozostaje
    # open-source i bramka blokuje — co jest BEZPIECZNYM domyślnym zachowaniem.
    ready, _ = osd_arc_flash_gate(view, accepted=False)
    assert ready is (view.status is ArcFlashStatus.COMPUTED_IEEE_1584)


def test_osd_blocker_uses_readiness_blocker_model() -> None:
    """Bramka używa istniejącego modelu ReadinessBlocker (bez drugiej prawdy)."""
    from enm.domain_ops_models import ReadinessBlocker

    view = ArcFlashBuilder().build([_in_range_input()])
    _, blockers = osd_arc_flash_gate(view, accepted=False)
    assert all(isinstance(b, ReadinessBlocker) for b in blockers)
