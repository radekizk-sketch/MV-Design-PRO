"""Testy D-01 Arc Flash (warstwa analizy) — energia incydentu wg STRUKTURY IEEE 1584-2018.

╔══════════════════════════════════════════════════════════════════════════╗
║  TO JEST WERSJA BEST-EFFORT, NIEZWERYFIKOWANA wobec normy.                 ║
║                                                                            ║
║  Te testy CELOWO NIE sprawdzają zgodności z przykładem obliczeniowym z     ║
║  IEEE 1584-2018 (brak dostępu do przykładu — nie da się zweryfikować).     ║
║  Sprawdzają wyłącznie:                                                     ║
║    • STRUKTURĘ (przepływ obliczenia liczy się end-to-end z wyniku SC),     ║
║    • WIARYGODNOŚĆ (rząd wielkości — zakresy, NIE dokładne wartości normy),  ║
║    • OBOWIĄZKOWE OZNACZENIE (każdy wynik nosi UNVERIFIED_BEST_EFFORT),      ║
║    • DETERMINIZM (identyczny hash przy powtórzeniu),                        ║
║    • "dane niekompletne" przy brakujących wejściach (bez zmyślania),       ║
║    • bramkę OSD (wynik zablokowany bez świadomej akceptacji).              ║
╚══════════════════════════════════════════════════════════════════════════╝

Moduł konsumuje wynik zwarciowy jako zwykłe wejście (NIE importuje solvera —
arch_guard zabrania analysis -> solvers).
"""

from __future__ import annotations

import pytest
from analysis.arc_flash import (
    ARC_FLASH_UNVERIFIED_NOTE_PL,
    ARC_FLASH_UNVERIFIED_TAG,
    OSD_ARC_FLASH_UNVERIFIED_BLOCKER_CODE,
    ArcFlashBuilder,
    ArcFlashContext,
    ArcFlashInput,
    ArcFlashResult,
    ArcFlashVerificationStatus,
    ArcFlashView,
    ElectrodeConfig,
    osd_arc_flash_gate,
)

# --- Przypadek typowy (poglądowy): 20 kV, ~25 kA bolted, 0.2 s, VCB ----------
_PLAUSIBILITY_INPUT = ArcFlashInput(
    bus_ref="SZYNA-20kV",
    i_bf_ka=25.0,
    voltage_kv=20.0,
    arc_time_s=0.2,
    electrode_config=ElectrodeConfig.VCB,
    conductor_gap_mm=102.0,
    working_distance_mm=457.0,
)


def _build_one(item: ArcFlashInput) -> ArcFlashResult:
    return ArcFlashBuilder().build([item]).results[0]


# ---------------------------------------------------------------------------
# Struktura: przepływ liczy się end-to-end z wyniku zwarciowego (SC).
# ---------------------------------------------------------------------------


def test_structure_runs_end_to_end_from_short_circuit_result() -> None:
    """Wejście odwzorowane z prawdziwego ShortCircuitResult (ikss_a [A] / un_v [V]
    → i_bf_ka [kA] / voltage_kv [kV]). Dowodzi konsumpcji wyniku SC read-only
    bez importu solvera w warstwie analizy (mapowanie należy do warstwy
    application; tu robimy je jawnie w teście)."""
    from network_model.solvers.short_circuit_iec60909 import (
        ShortCircuitResult,
        ShortCircuitType,
    )

    sc = ShortCircuitResult(
        short_circuit_type=ShortCircuitType.THREE_PHASE,
        fault_node_id="SZYNA-20kV",
        c_factor=1.1,
        un_v=20_000.0,
        zkk_ohm=complex(0.2, 0.46),
        ikss_a=25_000.0,
        ip_a=63_000.0,
        ith_a=26_000.0,
        sk_mva=866.0,
        rx_ratio=0.1,
        kappa=1.8,
        tk_s=0.2,
        ib_a=25_000.0,
        tb_s=0.2,
    )
    # Mapowanie wyniku SC -> wejście Arc Flash (read-only odczyt frozen API).
    item = ArcFlashInput(
        bus_ref=sc.fault_node_id,
        i_bf_ka=sc.ikss_a / 1000.0,
        voltage_kv=sc.un_v / 1000.0,
        arc_time_s=sc.tk_s,
        electrode_config=ElectrodeConfig.VCB,
        conductor_gap_mm=102.0,
        working_distance_mm=457.0,
    )
    view = ArcFlashBuilder().build([item])
    assert isinstance(view, ArcFlashView)
    r = view.results[0]
    assert r.status is ArcFlashVerificationStatus.UNVERIFIED_BEST_EFFORT
    assert r.i_arc_ka is not None
    assert r.incident_energy_cal_cm2 is not None
    assert r.arc_flash_boundary_mm is not None
    assert r.ppe_category is not None
    # White-box ma kształt Wzór→Dane→Podstawienie→Wynik→Jednostka dla każdego kroku.
    assert len(r.white_box) == 5
    for step in r.white_box:
        assert step.symbol and step.formula_latex
        assert step.substitution_pl and step.result_pl and step.unit_check_pl


def test_arc_flash_does_not_import_solver_layer() -> None:
    """arch_guard: warstwa analizy nie może importować solverów. Sprawdzamy, że
    moduł arc_flash nie wciąga modułu solverów na poziomie importu."""
    import sys

    # Import czystego modułu analizy nie powinien wymagać solverów.
    for mod in list(sys.modules):
        if mod.startswith("network_model.solvers"):
            del sys.modules[mod]
    import analysis.arc_flash.builder  # noqa: F401
    import analysis.arc_flash.models  # noqa: F401

    assert not any(
        m.startswith("network_model.solvers") for m in sys.modules
    ), "arc_flash nie powinien importować warstwy solverów"


# ---------------------------------------------------------------------------
# Wiarygodność (rząd wielkości) — zakresy, NIE dokładne wartości normy.
# ---------------------------------------------------------------------------


def test_plausibility_typical_mv_case_orders_of_magnitude() -> None:
    """20 kV, ~25 kA bolted, 0.2 s, VCB, 102 mm odstęp, 457 mm odl. robocza.
    Asercje na ZAKRESY (rząd wielkości), bo wartości są niezweryfikowane."""
    r = _build_one(_PLAUSIBILITY_INPUT)

    # Prąd łuku musi być DODATNI i MNIEJSZY od prądu bolted (rezystancja łuku).
    assert r.i_arc_ka is not None
    assert 0.0 < r.i_arc_ka < 25.0, r.i_arc_ka
    assert r.i_arc_ka > 15.0, r.i_arc_ka  # nie nierealistycznie niski

    # Energia incydentu w wiarygodnym rzędzie wielkości dla SN (1..100 cal/cm²).
    assert r.incident_energy_cal_cm2 is not None
    assert 1.0 <= r.incident_energy_cal_cm2 <= 100.0, r.incident_energy_cal_cm2

    # Granica łuku: dodatnia, w wiarygodnym zakresie (0.1 m .. 30 m).
    assert r.arc_flash_boundary_mm is not None
    assert 100.0 <= r.arc_flash_boundary_mm <= 30_000.0, r.arc_flash_boundary_mm

    # Kategoria ŚOI to jeden z dozwolonych łańcuchów.
    assert r.ppe_category in {"0", "1", "2", "3", "4"} or "POWYŻEJ" in r.ppe_category


def test_plausibility_open_air_energy_below_boxed() -> None:
    """Konfiguracja w otwartym powietrzu (VOA) skupia mniej energii niż w
    obudowie (VCB) — różnica jakościowa wiarygodna (nie wartość normy)."""
    boxed = _build_one(_PLAUSIBILITY_INPUT)
    open_air = _build_one(
        ArcFlashInput(
            bus_ref="SZYNA-20kV",
            i_bf_ka=25.0,
            voltage_kv=20.0,
            arc_time_s=0.2,
            electrode_config=ElectrodeConfig.VOA,
            conductor_gap_mm=102.0,
            working_distance_mm=457.0,
        )
    )
    assert boxed.incident_energy_cal_cm2 is not None
    assert open_air.incident_energy_cal_cm2 is not None
    assert open_air.incident_energy_cal_cm2 < boxed.incident_energy_cal_cm2


def test_plausibility_longer_arc_time_increases_energy() -> None:
    """Energia rośnie liniowo z czasem łuku (t/0,2) — monotoniczność wiarygodna."""
    short = _build_one(_PLAUSIBILITY_INPUT)
    longer = _build_one(
        ArcFlashInput(
            bus_ref="SZYNA-20kV",
            i_bf_ka=25.0,
            voltage_kv=20.0,
            arc_time_s=0.4,  # dwukrotny czas
            electrode_config=ElectrodeConfig.VCB,
            conductor_gap_mm=102.0,
            working_distance_mm=457.0,
        )
    )
    assert short.incident_energy_cal_cm2 is not None
    assert longer.incident_energy_cal_cm2 is not None
    # ~ dwukrotny czas → ~ dwukrotna energia (tolerancja na zaokrąglenia).
    assert longer.incident_energy_cal_cm2 == pytest.approx(
        2.0 * short.incident_energy_cal_cm2, rel=1e-3
    )


def test_plausibility_farther_working_distance_reduces_energy() -> None:
    """Większa odległość robocza → mniejsza energia (wykładnik odległości)."""
    near = _build_one(_PLAUSIBILITY_INPUT)
    far = _build_one(
        ArcFlashInput(
            bus_ref="SZYNA-20kV",
            i_bf_ka=25.0,
            voltage_kv=20.0,
            arc_time_s=0.2,
            electrode_config=ElectrodeConfig.VCB,
            conductor_gap_mm=102.0,
            working_distance_mm=914.0,  # dwukrotna odległość
        )
    )
    assert near.incident_energy_cal_cm2 is not None
    assert far.incident_energy_cal_cm2 is not None
    assert far.incident_energy_cal_cm2 < near.incident_energy_cal_cm2


def test_all_five_electrode_configs_compute() -> None:
    """Wszystkie 5 konfiguracji IEEE 1584-2018 liczą się i dają I_arc < I_bf."""
    for cfg in ElectrodeConfig:
        r = _build_one(
            ArcFlashInput(
                bus_ref="S",
                i_bf_ka=25.0,
                voltage_kv=20.0,
                arc_time_s=0.2,
                electrode_config=cfg,
            )
        )
        assert r.status is ArcFlashVerificationStatus.UNVERIFIED_BEST_EFFORT
        assert r.i_arc_ka is not None and 0.0 < r.i_arc_ka < 25.0, (cfg, r.i_arc_ka)
        assert r.incident_energy_cal_cm2 is not None and r.incident_energy_cal_cm2 > 0.0


# ---------------------------------------------------------------------------
# OBOWIĄZKOWE OZNACZENIE — każdy wynik nosi UNVERIFIED_BEST_EFFORT + etykietę.
# Ten test FAILUJE, jeśli jakikolwiek policzony wynik nie jest oznaczony.
# ---------------------------------------------------------------------------


def test_every_computed_result_carries_unverified_marking() -> None:
    """Niezmiennik bezpieczeństwa: KAŻDY policzony wynik nosi status
    UNVERIFIED_BEST_EFFORT i maszynowo-czytelną etykietę 'DO WERYFIKACJI'."""
    inputs = [
        ArcFlashInput(
            bus_ref=f"S{i}",
            i_bf_ka=10.0 + i,
            voltage_kv=15.0,
            arc_time_s=0.2,
            electrode_config=cfg,
        )
        for i, cfg in enumerate(ElectrodeConfig)
    ]
    view = ArcFlashBuilder().build(inputs)

    # Widok i każdy wynik niosą etykietę.
    assert view.unverified_tag == ARC_FLASH_UNVERIFIED_TAG
    assert view.status is ArcFlashVerificationStatus.UNVERIFIED_BEST_EFFORT
    for r in view.results:
        assert r.status is ArcFlashVerificationStatus.UNVERIFIED_BEST_EFFORT, r.bus_ref
        assert r.unverified_tag == ARC_FLASH_UNVERIFIED_TAG, r.bus_ref
        assert r.unverified_note_pl == ARC_FLASH_UNVERIFIED_NOTE_PL, r.bus_ref
        assert "DO WERYFIKACJI" in r.unverified_note_pl
        assert r.no_worked_example_note_pl  # jawne ograniczenie walidacji
        # Etykieta jest też w uzasadnieniu (czytelne dla człowieka).
        assert ARC_FLASH_UNVERIFIED_NOTE_PL in r.why_pl


def test_serialized_result_carries_marking_on_every_path() -> None:
    """Zserializowany słownik (to_dict) niesie status + etykietę na każdym
    poziomie — konsument (UI/raport/OSD) nie może pominąć oznaczenia."""
    view = ArcFlashBuilder().build([_PLAUSIBILITY_INPUT])
    d = view.to_dict()

    assert d["status"] == ArcFlashVerificationStatus.UNVERIFIED_BEST_EFFORT.value
    assert d["unverified_tag"] == ARC_FLASH_UNVERIFIED_TAG
    assert "DO WERYFIKACJI" in d["unverified_note_pl"]
    for rd in d["results"]:
        assert rd["status"] == ArcFlashVerificationStatus.UNVERIFIED_BEST_EFFORT.value
        assert rd["unverified_tag"] == ARC_FLASH_UNVERIFIED_TAG
        assert "DO WERYFIKACJI" in rd["unverified_note_pl"]
        assert rd["no_worked_example_note_pl"]


def test_every_coefficient_carries_best_effort_provenance() -> None:
    """KAŻDY współczynnik użyty w wyniku niesie proweniencję best-effort
    (verified=False, nota 'DO WERYFIKACJI', sekcja normy, którą przybliża)."""
    view = ArcFlashBuilder().build([_PLAUSIBILITY_INPUT])
    r = view.results[0]
    assert r.coefficient_provenance, "wynik musi deklarować użyte współczynniki"
    for prov in r.coefficient_provenance:
        assert prov.verified is False, prov.name
        assert "DO WERYFIKACJI" in prov.note_pl, prov.name
        assert prov.approximates_section, prov.name

    # Po serializacji też widoczne.
    d = view.to_dict()
    for rd in d["results"]:
        for cp in rd["coefficient_provenance"]:
            assert cp["verified"] is False
            assert "DO WERYFIKACJI" in cp["note_pl"]


def test_status_enum_is_distinct_from_field_quality() -> None:
    """Status weryfikacji bezpieczeństwa to ODRĘBNA oś od FieldQuality
    (jakości danych) — nie nadużywamy DATASHEET/ESTIMATED do statusu normy."""
    from solver_input.provenance import FieldQuality

    status_values = {s.value for s in ArcFlashVerificationStatus}
    quality_values = {q.value for q in FieldQuality}
    assert status_values.isdisjoint(quality_values)
    assert "UNVERIFIED_BEST_EFFORT" in status_values


# ---------------------------------------------------------------------------
# "dane niekompletne" przy brakujących wejściach (bez zmyślania).
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "field_name,kwargs",
    [
        ("i_bf_ka", {"i_bf_ka": None}),
        ("voltage_kv", {"voltage_kv": None}),
        ("arc_time_s", {"arc_time_s": None}),
        ("i_bf_ka", {"i_bf_ka": 0.0}),  # niedodatni traktowany jak brak
    ],
)
def test_missing_mandatory_input_is_incomplete(field_name: str, kwargs: dict) -> None:
    base = {
        "bus_ref": "S",
        "i_bf_ka": 25.0,
        "voltage_kv": 20.0,
        "arc_time_s": 0.2,
        "electrode_config": ElectrodeConfig.VCB,
    }
    base.update(kwargs)
    r = _build_one(ArcFlashInput(**base))  # type: ignore[arg-type]

    assert r.status is ArcFlashVerificationStatus.INCOMPLETE_INPUT
    assert field_name in r.missing_data
    # Brak policzonych wartości — NIE zmyślamy.
    assert r.i_arc_ka is None
    assert r.incident_energy_cal_cm2 is None
    assert r.arc_flash_boundary_mm is None
    assert r.ppe_category is None
    assert r.white_box == ()
    assert "dane niekompletne" in r.why_pl.lower()


def test_incomplete_input_still_carries_marking_fields() -> None:
    """Nawet wynik 'dane niekompletne' niesie etykietę (status to odrębna oś)."""
    r = _build_one(ArcFlashInput(bus_ref="S", i_bf_ka=None, voltage_kv=20.0, arc_time_s=0.2))
    assert r.unverified_tag == ARC_FLASH_UNVERIFIED_TAG
    assert r.status is ArcFlashVerificationStatus.INCOMPLETE_INPUT


# ---------------------------------------------------------------------------
# Determinizm — identyczny hash przy powtórzeniu.
# ---------------------------------------------------------------------------


def test_analysis_id_is_deterministic() -> None:
    ctx = ArcFlashContext(project_name="P", case_name="C")
    first = ArcFlashBuilder().build([_PLAUSIBILITY_INPUT], context=ctx)
    second = ArcFlashBuilder().build([_PLAUSIBILITY_INPUT], context=ctx)
    assert first.analysis_id == second.analysis_id
    assert first.to_dict() == second.to_dict()


def test_analysis_id_changes_with_inputs() -> None:
    a = ArcFlashBuilder().build([_PLAUSIBILITY_INPUT])
    b = ArcFlashBuilder().build(
        [
            ArcFlashInput(
                bus_ref="SZYNA-20kV",
                i_bf_ka=30.0,  # inny prąd
                voltage_kv=20.0,
                arc_time_s=0.2,
                electrode_config=ElectrodeConfig.VCB,
                conductor_gap_mm=102.0,
                working_distance_mm=457.0,
            )
        ]
    )
    assert a.analysis_id != b.analysis_id


def test_multiple_points_sorted_deterministically() -> None:
    """Wiele punktów sortowanych po bus_ref — kolejność deterministyczna."""
    unsorted = [
        ArcFlashInput(bus_ref="Z", i_bf_ka=20.0, voltage_kv=15.0, arc_time_s=0.2),
        ArcFlashInput(bus_ref="A", i_bf_ka=20.0, voltage_kv=15.0, arc_time_s=0.2),
        ArcFlashInput(bus_ref="M", i_bf_ka=20.0, voltage_kv=15.0, arc_time_s=0.2),
    ]
    view = ArcFlashBuilder().build(unsorted)
    refs = [r.bus_ref for r in view.results]
    assert refs == ["A", "M", "Z"]


# ---------------------------------------------------------------------------
# Bramka OSD — wynik best-effort zablokowany bez świadomej akceptacji.
# ---------------------------------------------------------------------------


def test_osd_gate_blocks_unverified_result() -> None:
    """Bez akceptacji inżyniera: wynik Arc Flash blokuje pakiet OSD."""
    view = ArcFlashBuilder().build([_PLAUSIBILITY_INPUT])
    ready, blockers = osd_arc_flash_gate(view, accepted=False)
    assert ready is False
    assert len(blockers) == 1
    blocker = blockers[0]
    assert blocker.code == OSD_ARC_FLASH_UNVERIFIED_BLOCKER_CODE
    assert blocker.severity == "BLOKUJACE"
    assert ARC_FLASH_UNVERIFIED_TAG in blocker.message_pl


def test_osd_gate_passes_only_with_conscious_acceptance() -> None:
    """Z jawną akceptacją inżyniera: wynik może wejść do pakietu OSD."""
    view = ArcFlashBuilder().build([_PLAUSIBILITY_INPUT])
    ready, blockers = osd_arc_flash_gate(view, accepted=True)
    assert ready is True
    assert blockers == []


def test_osd_blocker_uses_readiness_blocker_model() -> None:
    """Bramka używa istniejącego modelu ReadinessBlocker (bez drugiej prawdy)."""
    from enm.domain_ops_models import ReadinessBlocker

    view = ArcFlashBuilder().build([_PLAUSIBILITY_INPUT])
    _, blockers = osd_arc_flash_gate(view, accepted=False)
    assert all(isinstance(b, ReadinessBlocker) for b in blockers)
