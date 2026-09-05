"""Testy serwisu doboru kompensacji mocy biernej z katalogu — D8.

Zakres: deterministyczny przegląd rekordów katalogu baterii kondensatorów
(rosnąco po mocy) na modelu przebiegu rozpływu; dobór pierwszego kandydata
spełniającego wymagany cosφ w punkcie przyłączenia (odczyt P/Q gałęzi zasilającej
z wyniku solvera, cosφ = |P|/√(P²+Q²) jako projekcja prezentacyjna); scenariusz
nocny (P generatorów = 0) jako drugi przegląd; werdykty per kandydat; determinizm;
hash; błędy rodzaju/statusu/parametru/szyny (komunikaty PL).

ZERO nowej fizyki: rozpływ liczy istniejący solver przez istniejącą ścieżkę
(``_execute_power_flow``); bateria próbna dopisywana WYŁĄCZNIE do kopii snapshotu
w pamięci. Testy asertują na wartościach z solvera (bez liczenia wzorem w teście).
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from application.analyses.dobor_kompensacji import build_compensation_sizing_view
from enm.canonical_analysis import (
    CanonicalRun,
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.models import (
    BranchRating,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Generator,
    Load,
    OverheadLine,
    Source,
    Transformer,
)
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _compensation_enm(*, load_q_mvar: float, gen_p_mw: float | None) -> EnergyNetworkModel:
    """Deterministyczny model doboru kompensacji: punkt SN 15 kV zasilany jedną
    linią, z lokalnym warunkiem biernym (``load_q_mvar``) i opcjonalnym źródłem OZE.

    Dodatnie ``load_q_mvar`` = odbiór INDUKCYJNY (typowy przypadek doboru
    kompensacji): dopisana bateria z katalogu PODNOSI cosφ punktu kompensowanego
    (``Q_netto = Q_load − Q_cap_eff``, naprawa V12K-040, opcja B). Kierunek i
    wartości pochodzą z solvera (test nie liczy fizyki)."""
    generators = []
    if gen_p_mw is not None:
        generators.append(
            Generator(
                ref_id="gen_pcc",
                name="Źródło OZE",
                bus_ref="bus_pcc",
                p_mw=gen_p_mw,
                q_mvar=0.0,
                gen_type="synchronous",
                catalog_ref="gen-sync-x",
            )
        )
    return EnergyNetworkModel(
        header=ENMHeader(name="Kompensacja net"),
        buses=[
            Bus(ref_id="bus_hv", name="GPZ 110kV", voltage_kv=110.0),
            Bus(ref_id="bus_a", name="Szyna SN", voltage_kv=15.0),
            Bus(ref_id="bus_pcc", name="Punkt przyłączenia", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="src",
                name="System 110kV",
                bus_ref="bus_hv",
                model="short_circuit_power",
                sk3_mva=2500.0,
                r_ohm=0.5,
                x_ohm=5.0,
                rx_ratio=0.1,
                r0_ohm=0.6,
                x0_ohm=6.0,
                catalog_ref="src-x",
                catalog_namespace="ZRODLO_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        transformers=[
            Transformer(
                ref_id="tr",
                name="TR 110/15",
                hv_bus_ref="bus_hv",
                lv_bus_ref="bus_a",
                sn_mva=25.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=12.0,
                pk_kw=120.0,
                p0_kw=18.0,
                i0_percent=0.4,
                vector_group="YNd11",
                tap_position=0,
                tap_min=-9,
                tap_max=9,
                tap_step_percent=1.78,
                catalog_ref="tr-x",
                catalog_namespace="TRAFO_SN_NN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        branches=[
            OverheadLine(
                ref_id="line_a_pcc",
                name="Linia SN",
                from_bus_ref="bus_a",
                to_bus_ref="bus_pcc",
                length_km=5.0,
                r_ohm_per_km=0.306,
                x_ohm_per_km=0.34,
                b_siemens_per_km=3.0e-6,
                r0_ohm_per_km=0.46,
                x0_ohm_per_km=1.2,
                rating=BranchRating(in_a=210.0),
                catalog_ref="line-afl-70",
                catalog_namespace="LINIA_SN",
                parameter_source="CATALOG",
                source_mode="KATALOG",
            )
        ],
        loads=[
            Load(ref_id="load_pcc", name="Odbiór", bus_ref="bus_pcc", p_mw=1.0, q_mvar=load_q_mvar)
        ],
        generators=generators,
    )


def _run(enm: EnergyNetworkModel) -> CanonicalRun:
    set_enm("c", enm)
    return execute_run(create_run(case_id="c", klucz_twin="c", analysis_type="PF").id)


def _golden_run() -> CanonicalRun:
    set_enm("c-golden", build_golden_enm())
    return execute_run(create_run(case_id="c-golden", klucz_twin="c-golden", analysis_type="PF").id)


def _synthetic_run(*, status: str = "FINISHED", analysis_type: str = "PF") -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="case-1",
        project_id="proj-1",
        analysis_type=analysis_type,
        status=status,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash",
        input_hash="in-hash",
        snapshot=build_golden_enm().model_dump(mode="json"),
        validation={},
        readiness={},
    )


# --------------------------------------------------------------------------
# Struktura + kandydaci z katalogu (kolejność rosnąca, wiązanie napięciowe)
# --------------------------------------------------------------------------


def test_view_structure() -> None:
    run = _run(_compensation_enm(load_q_mvar=2.0, gen_p_mw=None))
    view = build_compensation_sizing_view(run, bus_ref="bus_pcc", cos_phi_min=0.95)
    assert view["analysis"] == "compensation_sizing"
    assert view["context"]["run_id"] == str(run.id)
    assert {
        "parameters",
        "input_hash",
        "baseline",
        "candidates",
        "dobor",
        "powod_braku",
        "whitebox",
    } <= set(view)
    assert view["parameters"]["bus_ref"] == "bus_pcc"
    assert view["parameters"]["bus_voltage_kv"] == 15.0
    cand = view["candidates"][0]
    # V12K-040: rozdział dwóch wielkości — cosφ przekroju (1) i cosφ punktu (2).
    assert {
        "catalog_ref",
        "name",
        "rated_mvar",
        "rated_kv",
        "cosfi_przekroju_dzien",
        "cosfi_punktu_dzien",
        "spelnia",
    } <= set(cand)


def test_candidates_only_from_catalog_matching_voltage() -> None:
    """Kandydaci WYŁĄCZNIE z katalogu i tylko dla napięcia szyny (15 kV → 3 rekordy)."""
    run = _run(_compensation_enm(load_q_mvar=2.0, gen_p_mw=None))
    view = build_compensation_sizing_view(run, bus_ref="bus_pcc", cos_phi_min=0.95)
    kv = {c["rated_kv"] for c in view["candidates"]}
    assert kv == {15.0}
    assert [c["catalog_ref"] for c in view["candidates"]] == [
        "KOMP_SN_0V6_15KV",
        "KOMP_SN_1V2_15KV",
        "KOMP_SN_2V4_15KV",
    ]


def test_candidates_sorted_ascending_by_power() -> None:
    run = _run(_compensation_enm(load_q_mvar=2.0, gen_p_mw=None))
    view = build_compensation_sizing_view(run, bus_ref="bus_pcc", cos_phi_min=0.95)
    rated = [c["rated_mvar"] for c in view["candidates"]]
    assert rated == sorted(rated)
    assert rated == [0.6, 1.2, 2.4]


# --------------------------------------------------------------------------
# Dobór znaleziony = pierwszy kandydat spełniający
# --------------------------------------------------------------------------


def test_dobor_found_first_meeting_candidate() -> None:
    # Naprawa V12K-040: odbiór INDUKCYJNY (q=+1,0) — kompensacja PODNOSI cosφ punktu,
    # więc dobór działa fizycznie poprawnie (wcześniej fikstura używała punktu
    # wyprzedzającego q=−2,0 dla obejścia odwróconego kierunku cosφ).
    run = _run(_compensation_enm(load_q_mvar=1.0, gen_p_mw=None))
    view = build_compensation_sizing_view(run, bus_ref="bus_pcc", cos_phi_min=0.90)
    assert view["dobor"] is not None
    assert view["powod_braku"] is None
    # Dobór = PIERWSZY kandydat z spelnia=True (na cosφ PUNKTU kompensowanego).
    first_ok = next(c for c in view["candidates"] if c["spelnia"])
    assert view["dobor"]["catalog_ref"] == first_ok["catalog_ref"]
    assert view["dobor"]["cosfi_punktu_dzien"] >= 0.90
    # Kandydaci przed doborem NIE spełniają.
    for cand in view["candidates"]:
        if cand["catalog_ref"] == view["dobor"]["catalog_ref"]:
            break
        assert cand["spelnia"] is False


def test_baseline_cos_phi_present() -> None:
    run = _run(_compensation_enm(load_q_mvar=1.0, gen_p_mw=None))
    view = build_compensation_sizing_view(run, bus_ref="bus_pcc", cos_phi_min=0.95)
    # V12K-040: rozdział cosφ przekroju (1) i cosφ punktu (2) — oba obecne w baseline.
    assert view["baseline"]["cosfi_przekroju_dzien"] is not None
    assert view["baseline"]["cosfi_punktu_dzien"] is not None
    assert view["baseline"]["cosfi_przekroju_noc"] is None  # noc wyłączona domyślnie
    assert view["baseline"]["cosfi_punktu_noc"] is None


# --------------------------------------------------------------------------
# Brak spełniającego kandydata → dobór null + powód PL
# --------------------------------------------------------------------------


def test_no_candidate_meets_returns_null_with_reason() -> None:
    # Golden: bus_sn_c ma lokalną generację Q; żadna bateria nie dobija cosφ do 0,999.
    run = _golden_run()
    view = build_compensation_sizing_view(run, bus_ref="bus_sn_c", cos_phi_min=0.999)
    assert view["dobor"] is None
    assert view["powod_braku"] is not None
    assert "cosφ" in view["powod_braku"]
    assert all(c["spelnia"] is False for c in view["candidates"])


def test_no_catalog_candidate_for_bus_voltage() -> None:
    # Szyna nN 0,4 kV: brak baterii SN w katalogu dla tego napięcia → brak kandydatów.
    run = _golden_run()
    view = build_compensation_sizing_view(run, bus_ref="bus_nn", cos_phi_min=0.95)
    assert view["candidates"] == []
    assert view["dobor"] is None
    assert "napięcia znamionowego" in view["powod_braku"]


# --------------------------------------------------------------------------
# Scenariusz nocny (P generatorów = 0) zmienia dobór
# --------------------------------------------------------------------------


def test_night_scenario_present_in_verdicts() -> None:
    run = _run(_compensation_enm(load_q_mvar=2.0, gen_p_mw=4.0))
    view = build_compensation_sizing_view(
        run, bus_ref="bus_pcc", cos_phi_min=0.90, uwzglednij_noc=True
    )
    assert view["parameters"]["uwzglednij_noc"] is True
    assert view["baseline"]["cosfi_punktu_noc"] is not None
    for cand in view["candidates"]:
        assert cand["cosfi_punktu_noc"] is not None
        assert cand["cosfi_przekroju_noc"] is not None
        assert cand["spelnia_noc"] is not None


def test_night_scenario_changes_selection() -> None:
    """Noc (P generatorów = 0) obniża cosφ punktu → wymaga większej baterii; dobór
    z uwzględnieniem nocy jest inny (większy) niż dobór tylko dla dnia.

    Naprawa V12K-040: odbiór INDUKCYJNY (q=+2,0) + generacja OZE; dobór na cosφ
    PUNKTU kompensowanego (dzień 0,6 Mvar, noc 2,4 Mvar)."""
    run = _run(_compensation_enm(load_q_mvar=2.0, gen_p_mw=4.0))
    day_only = build_compensation_sizing_view(
        run, bus_ref="bus_pcc", cos_phi_min=0.90, uwzglednij_noc=False
    )
    with_night = build_compensation_sizing_view(
        run, bus_ref="bus_pcc", cos_phi_min=0.90, uwzglednij_noc=True
    )
    assert day_only["dobor"] is not None
    assert with_night["dobor"] is not None
    assert with_night["dobor"]["rated_mvar"] > day_only["dobor"]["rated_mvar"]
    # Bateria dobrana tylko dla dnia NIE spełnia wymagania w nocy.
    day_pick_in_night = next(
        c for c in with_night["candidates"] if c["catalog_ref"] == day_only["dobor"]["catalog_ref"]
    )
    assert day_pick_in_night["spelnia_dzien"] is True
    assert day_pick_in_night["spelnia_noc"] is False
    assert day_pick_in_night["spelnia"] is False


def test_night_verdict_requires_both_scenarios() -> None:
    run = _run(_compensation_enm(load_q_mvar=2.0, gen_p_mw=4.0))
    view = build_compensation_sizing_view(
        run, bus_ref="bus_pcc", cos_phi_min=0.90, uwzglednij_noc=True
    )
    for cand in view["candidates"]:
        assert cand["spelnia"] == (cand["spelnia_dzien"] and cand["spelnia_noc"])


# --------------------------------------------------------------------------
# Determinizm i hash
# --------------------------------------------------------------------------


def test_deterministic_two_calls() -> None:
    run = _run(_compensation_enm(load_q_mvar=2.0, gen_p_mw=4.0))
    first = build_compensation_sizing_view(
        run, bus_ref="bus_pcc", cos_phi_min=0.92, uwzglednij_noc=True
    )
    second = build_compensation_sizing_view(
        run, bus_ref="bus_pcc", cos_phi_min=0.92, uwzglednij_noc=True
    )
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)


def test_input_hash_changes_with_cos_phi_min() -> None:
    run = _run(_compensation_enm(load_q_mvar=2.0, gen_p_mw=None))
    a = build_compensation_sizing_view(run, bus_ref="bus_pcc", cos_phi_min=0.90)
    b = build_compensation_sizing_view(run, bus_ref="bus_pcc", cos_phi_min=0.95)
    assert a["input_hash"] != b["input_hash"]


def test_input_hash_changes_with_night_flag() -> None:
    run = _run(_compensation_enm(load_q_mvar=2.0, gen_p_mw=4.0))
    a = build_compensation_sizing_view(
        run, bus_ref="bus_pcc", cos_phi_min=0.90, uwzglednij_noc=False
    )
    b = build_compensation_sizing_view(
        run, bus_ref="bus_pcc", cos_phi_min=0.90, uwzglednij_noc=True
    )
    assert a["input_hash"] != b["input_hash"]


def test_json_serializable() -> None:
    run = _run(_compensation_enm(load_q_mvar=2.0, gen_p_mw=None))
    view = build_compensation_sizing_view(run, bus_ref="bus_pcc", cos_phi_min=0.95)
    assert len(json.dumps(view, sort_keys=True)) > 100


# --------------------------------------------------------------------------
# Błędy (komunikaty PL)
# --------------------------------------------------------------------------


def test_rejects_non_pf_run() -> None:
    run = _synthetic_run(analysis_type="short_circuit_sn")
    with pytest.raises(ValueError, match="przebiegu rozpływu"):
        build_compensation_sizing_view(run, bus_ref="bus_sn_c", cos_phi_min=0.95)


def test_rejects_unfinished_run() -> None:
    run = _synthetic_run(status="RUNNING")
    with pytest.raises(ValueError, match="nie jest zakończony"):
        build_compensation_sizing_view(run, bus_ref="bus_sn_c", cos_phi_min=0.95)


def test_rejects_cos_phi_out_of_range() -> None:
    run = _golden_run()
    with pytest.raises(ValueError, match="cos_phi_min"):
        build_compensation_sizing_view(run, bus_ref="bus_sn_c", cos_phi_min=1.5)
    with pytest.raises(ValueError, match="cos_phi_min"):
        build_compensation_sizing_view(run, bus_ref="bus_sn_c", cos_phi_min=0.0)


def test_rejects_unknown_bus() -> None:
    run = _golden_run()
    with pytest.raises(ValueError, match="szyna punktu przyłączenia nie istnieje"):
        build_compensation_sizing_view(run, bus_ref="brak", cos_phi_min=0.95)
