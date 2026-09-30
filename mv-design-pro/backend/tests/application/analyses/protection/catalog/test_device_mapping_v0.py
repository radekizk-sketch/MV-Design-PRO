from __future__ import annotations

import pytest
from application.analyses.protection.catalog.mapper import (
    map_requirement_to_device,
    wymaganie_z_nastaw,
)
from application.analyses.protection.catalog.models import (
    DeviceCapability,
    ProtectionRequirementV0,
)
from application.analyses.protection.catalog.pipeline import dopasuj_do_aparatu
from application.analyses.protection.catalog.validator import validate_requirement
from application.protection_settings.engine import (
    DelayedSettings,
    InstantaneousSettings,
    InstantaneousSettingWindow,
    LocalGenerationDiagnostic,
    ProtectionSettingsResult,
    SPZAnalysisResult,
    ThermalWithstandResult,
)


def _wynik_hoppela(
    *, i_pickup_51_a: float = 120.0, i_inst_50_a: float = 800.0
) -> ProtectionSettingsResult:
    return ProtectionSettingsResult(
        line_id="line-1",
        line_name="Odcinek testowy",
        delayed=DelayedSettings(
            i_setting_a=i_pickup_51_a,
            t_setting_s=0.6,
            i_load_max_a=100.0,
            k_b=1.2,
            sensitivity_ratio=2.0,
            is_valid=True,
            validation_notes=[],
            trace=[],
        ),
        instantaneous=InstantaneousSettings(
            i_setting_a=i_inst_50_a,
            i_min_selectivity_a=i_inst_50_a * 0.9,
            i_max_thermal_a=i_inst_50_a * 1.5,
            i_max_sensitivity_a=i_inst_50_a * 1.3,
            range_valid=True,
            k_b=1.2,
            k_bth=1.1,
            is_valid=True,
            validation_notes=[],
            trace=[],
        ),
        thermal=ThermalWithstandResult(
            i_th_dop_a=5000.0,
            j_thn=94.0,
            cross_section_mm2=120.0,
            t_fault_s=0.37,
            ik_max_a=4000.0,
            is_adequate=True,
            margin_percent=20.0,
            trace=[],
        ),
        spz=SPZAnalysisResult(
            spz_allowed=True,
            total_fault_time_s=0.6,
            i_th_required_a=4000.0,
            i_th_available_a=5000.0,
            blocking_recommended=False,
            trace=[],
        ),
        # W3-C2 (2026-09-09) rozszerzyla wynik Hoppla o diagnostyke generacji lokalnej
        # i okno nastaw I>> — pola WYMAGANE; helper buduje wynik bez E-L (aktywna=False,
        # zera = brak wkladu zrodla lokalnego, nie fabrykacja pomiaru) i okno spojne
        # z `instantaneous` powyzej (odbior fali 2 W3, 2026-09-10).
        local_generation=LocalGenerationDiagnostic(
            aktywna=False,
            typ_zrodla=None,
            prad_widziany_lacznie_a=0.0,
            wklad_el_a=0.0,
            wklad_systemu_a=0.0,
            udzial_el=None,
            prog_udzialu_zsz=None,
            ryzyko_blokady_zsz=None,
            uwagi_pl=[],
            trace=[],
        ),
        setting_window=InstantaneousSettingWindow(
            i_min_a=i_inst_50_a * 0.9,
            i_max_a=i_inst_50_a * 1.3,
            limiting_criterion_min="selektywnosc",
            limiting_criterion_max="czulosc",
            window_valid=True,
            conflict_pl=None,
            recommendations_pl=[],
            trace=[],
        ),
        overall_valid=True,
        summary_notes=[],
    )


def _requirement(
    *,
    curve: str = "DT",
    i_pickup_51_a: float | None = 120.0,
    tms_51: float | None = None,
    t_51_s: float | None = 0.6,
    i_inst_50_a: float | None = 800.0,
) -> ProtectionRequirementV0:
    return ProtectionRequirementV0(
        curve=curve,
        i_pickup_51_a=i_pickup_51_a,
        tms_51=tms_51,
        t_51_s=t_51_s,
        i_inst_50_a=i_inst_50_a,
        i_pickup_51n_a=None,
        tms_51n=None,
        i_inst_50n_a=None,
    )


def _device(
    *,
    curves_supported: tuple[str, ...] = ("DT",),
    t_51_s_min: float | None = None,
    t_51_s_max: float | None = None,
    i_inst_50_a_min: float = 50.0,
    i_inst_50_a_max: float = 5000.0,
) -> DeviceCapability:
    return DeviceCapability(
        device_id="TEST-DEV",
        vendor=None,
        model="TEST",
        functions_supported=("50", "51"),
        curves_supported=curves_supported,
        i_pickup_51_a_min=0.5,
        i_pickup_51_a_max=1000.0,
        tms_51_min=0.05,
        tms_51_max=1.0,
        t_51_s_min=t_51_s_min,
        t_51_s_max=t_51_s_max,
        i_inst_50_a_min=i_inst_50_a_min,
        i_inst_50_a_max=i_inst_50_a_max,
        i_pickup_51n_a_min=0.2,
        i_pickup_51n_a_max=400.0,
        tms_51n_min=0.05,
        tms_51n_max=1.0,
        i_inst_50n_a_min=20.0,
        i_inst_50n_a_max=2500.0,
        meta={},
        # Zakresy syntetyczne w amperach strony wtórnej; testy tej grupy używają przekładni
        # 1:1, więc prąd wymagania (pierwotny) równa się wartości w jednostce zakresu.
        jednostka_zakresow_pradowych="A_WTORNY",
        podstawa_zakresow_pl="aparat syntetyczny testu",
    )


#: Przekładnia 1:1 — prąd pierwotny wymagania równy wartości strony wtórnej zakresu.
PRZEKLADNIA_1_1 = (1.0, 1.0)
#: Przekładnik 600/5 A — ten sam co w sieci złotej G08.
PRZEKLADNIA_600_5 = (600.0, 5.0)


# ---------------------------------------------------------------------------
# Dobór aparatu z wymagania Hoppela (ścieżka realna — karta W3-C1)
# ---------------------------------------------------------------------------


def test_device_mapping_accepts_supported_dt_device() -> None:
    """Profil referencyjny z zakresami w ×In i przekładnik 600/5 A: I> 120 A → 1 A wtórny →
    0,2 ×In (zakres 0,05–5), I>> 800 A → 6,67 A → 1,33 ×In (zakres 0,1–40) — zgodny."""
    wymaganie = wymaganie_z_nastaw(_wynik_hoppela())

    wynik = dopasuj_do_aparatu(wymaganie, device_id="REF-OC-200", przekladnia_a=PRZEKLADNIA_600_5)

    assert wynik["compatible"] is True
    assert wynik["violations"] == ()
    assert wynik["przekladnia_a"] == [600.0, 5.0]


def test_device_mapping_rejects_device_without_dt_curve() -> None:
    """Aparat czysto odwrotnoczasowy (bez DT) jest niezgodny z wymaganiem Hoppela —
    kanon = curve, nie zgadywanie „to chyba jest to samo co IEC_NI"."""
    wymaganie = wymaganie_z_nastaw(_wynik_hoppela())

    wynik = dopasuj_do_aparatu(
        wymaganie, device_id="EM_ETANGO_400_V0", przekladnia_a=PRZEKLADNIA_600_5
    )

    assert wynik["compatible"] is False
    assert "UNSUPPORTED_CURVE" in wynik["violations"]


def test_device_mapping_is_deterministic() -> None:
    wymaganie = wymaganie_z_nastaw(_wynik_hoppela())

    wynik1 = dopasuj_do_aparatu(wymaganie, device_id="REF-OC-200", przekladnia_a=PRZEKLADNIA_600_5)
    wynik2 = dopasuj_do_aparatu(wymaganie, device_id="REF-OC-200", przekladnia_a=PRZEKLADNIA_600_5)

    assert wynik1 == wynik2


@pytest.mark.parametrize(
    ("device_id", "przekladnia", "naruszenie"),
    [
        ("ABB_REF601", PRZEKLADNIA_600_5, "ZAKRES_PRADOWY_NIEUSTALONY"),
        ("REF-OC-200", None, "ZAKRES_PRADOWY_BEZ_PRZEKLADNI"),
        ("REF-OC-200", (10000.0, 5.0), "I51_OUT_OF_RANGE"),
        ("REF-OC-200", (15.0, 5.0), "I50_OUT_OF_RANGE"),
    ],
)
def test_zakres_pradowy_porownywany_po_stronie_wtornej(
    device_id: str, przekladnia: tuple[float, float] | None, naruszenie: str
) -> None:
    """PZ-09: prąd PIERWOTNY wymagania nigdy nie jest porównywany wprost z zakresem strony
    wtórnej. Iloczyn: jednostka zakresu {nieustalona, ×In} × przekładnia {brak, jest} ×
    próg {w zakresie, poniżej (10000/5: 0,06 A = 0,012 ×In), powyżej (15/5: I>> 800 A → 266,7 A = 53 ×In)}.
    """
    wymaganie = wymaganie_z_nastaw(_wynik_hoppela())

    wynik = dopasuj_do_aparatu(wymaganie, device_id=device_id, przekladnia_a=przekladnia)

    assert wynik["compatible"] is False
    assert naruszenie in wynik["violations"]


def test_device_not_found_is_named_not_silently_incompatible() -> None:
    wymaganie = wymaganie_z_nastaw(_wynik_hoppela())

    wynik = dopasuj_do_aparatu(wymaganie, device_id="NIE-ISTNIEJE", przekladnia_a=None)

    assert wynik["compatible"] is False
    assert wynik["violations"] == ("DEVICE_NOT_FOUND",)
    assert wynik["capability"] is None
    assert wynik["status"] == "FAILED"


# ---------------------------------------------------------------------------
# Karta W3-C1 — walidator/mapper jako infrastruktura WSPÓLNA (nie tylko
# Hoppel): iloczyn cech {DT, IEC_NI} × {aparat z zakresem DT, bez} ×
# {I>> wyznaczone, None}. Wymagania budowane RĘCZNIE (nie przez
# `wymaganie_z_nastaw`) — ten test dowodzi ogólnej poprawności kontraktu
# `ProtectionRequirementV0`/`validate_requirement`/`map_requirement_to_device`,
# niezależnie od tego, który silnik go wypełnił.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("curve", ["DT", "IEC_NI"])
@pytest.mark.parametrize("t_51_s_range_declared", [True, False])
def test_t51s_zakres_sprawdzany_tylko_gdy_krzywa_dt_i_zakres_zadeklarowany(
    curve: str, t_51_s_range_declared: bool
) -> None:
    """T51S_OUT_OF_RANGE pojawia się WYŁĄCZNIE gdy: krzywa = DT (inaczej wymaganie
    niesie `t_51_s = None` z definicji krzywej — druga wielkość czasowa, TMS51,
    jest wtedy w użyciu) I aparat deklaruje zakres (inaczej nie ma czego naruszyć
    — brak granicy nie jest granicą zerową)."""
    req = _requirement(
        curve=curve,
        tms_51=None if curve == "DT" else 0.2,
        t_51_s=5.0 if curve == "DT" else None,
    )
    cap = _device(
        curves_supported=(curve,),
        t_51_s_min=(0.1 if t_51_s_range_declared else None),
        t_51_s_max=(1.0 if t_51_s_range_declared else None),
    )

    compatible, violations = validate_requirement(req, cap, przekladnia_a=PRZEKLADNIA_1_1)

    naruszenie_oczekiwane = curve == "DT" and t_51_s_range_declared
    assert ("T51S_OUT_OF_RANGE" in violations) is naruszenie_oczekiwane
    if naruszenie_oczekiwane:
        assert compatible is False


def test_t51s_w_zakresie_nie_narusza_gdy_aparat_deklaruje_zakres() -> None:
    req = _requirement(curve="DT", tms_51=None, t_51_s=0.5)
    cap = _device(curves_supported=("DT",), t_51_s_min=0.1, t_51_s_max=1.0)

    compatible, violations = validate_requirement(req, cap, przekladnia_a=PRZEKLADNIA_1_1)

    assert compatible is True
    assert "T51S_OUT_OF_RANGE" not in violations


@pytest.mark.parametrize("i_inst_50_a", [800.0, None])
def test_niewyznaczone_i_inst_50_a_nie_wywala_doboru_i_nie_staje_sie_zerem(
    i_inst_50_a: float | None,
) -> None:
    """I>> `None` (niewyznaczalna, V12K-189) nie wywala TypeError w mapowaniu i
    nie trafia do przekaźnika jako 0,0 — brak jest zadeklarowany jawnie."""
    req = _requirement(curve="DT", tms_51=None, t_51_s=0.6, i_inst_50_a=i_inst_50_a)
    cap = _device(curves_supported=("DT",))

    compatible, violations = validate_requirement(req, cap, przekladnia_a=PRZEKLADNIA_1_1)
    mapping = map_requirement_to_device(req, cap, przekladnia_a=PRZEKLADNIA_1_1)

    assert "I50_OUT_OF_RANGE" not in violations
    if i_inst_50_a is None:
        assert compatible is True  # brak wartości nie stawia wymagania funkcji 50
        assert "I50" not in mapping.mapped_settings
        assert "SETTINGS_INCOMPLETE_MISSING_INPUT_DATA" in mapping.assumptions
    else:
        assert "I50" in mapping.mapped_settings


def test_tms51_i_t51s_sa_wzajemnie_wykluczajace_w_mapowaniu() -> None:
    """Wymaganie definite-time (Hoppel) mapuje `T51` (czas określony), nie
    `TMS51` (mnożnik krzywej odwrotnoczasowej — DRUGA wielkość czasowa, którą ta
    krzywa po prostu nie używa, nie brakująca wartość TEJ SAMEJ). Jedyny powód
    niekompletności tego wymagania jest ziemnozwarcie (Hoppel go nie liczy) —
    nie fantomowy brak TMS51."""
    req = wymaganie_z_nastaw(_wynik_hoppela())
    cap = _device(curves_supported=("DT",))

    mapping = map_requirement_to_device(req, cap, przekladnia_a=PRZEKLADNIA_1_1)

    assert "T51" in mapping.mapped_settings
    assert "TMS51" not in mapping.mapped_settings
    brakujace_fazowe = {"I51", "T51", "I50", "CURVE"} - mapping.mapped_settings.keys()
    assert brakujace_fazowe == set()
