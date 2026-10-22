"""Karta P0.3b — c per pasmo napięciowe + scenariusz MIN w kanonicznej ścieżce SC ENM.

docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.3 (kontynuacja P0.3, ścieżka
``enm/canonical_analysis.py::_execute_short_circuit`` — droga użytkownika przez
ENM; dawna równoległa ścieżka ``application/solvers/short_circuit_binding.py::
execute_short_circuit`` skasowana kartą TORY-TYLKO-W-TESTACH 2026-09-30 — jej dowody
z ``tests/network_model/solvers/test_sc_lv_min_max.py`` przeniesione tu, sekcja 9).

REUSE 1:1, zero duplikacji wzorów:
    - ``network_model.core.voltage_factor.c_for_node`` (Tabela 1 IEC 60909:
      ≤1 kV → 1.05/0.95, >1 kV → 1.10/1.00),
    - ``application.solvers.lv_temperature_correction.build_min_scenario_graph``
      (R_θ = R20·[1+0.004·(θk−20)] na KOPII grafu dla scenariusza MIN).

Golden MV+LV (jedyne źródło parametrów: stałe modułu ``_SK_Q_MVA`` … ``_UN_LV_KV``
poniżej; rachunek ręczny Ik''max na tych parametrach — sekcja 9 tego pliku; od karty
TORY-TYLKO-W-TESTACH ``test_sc_lv_min_max.py`` nie zawiera już tej sieci):
grid source Sk''=250 MVA 15 kV -> kabel SN 2 km -> TR 630 kVA 15/0,4 kV Dyn11
uk=6% -> szyna nN -> kabel nN YAKY 4x120 60 m -> koniec obwodu nN.
"""

from __future__ import annotations

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.mapping import map_enm_to_network_graph, ref_to_graph_id
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    Source,
    Transformer,
)
from enm.store import reset_enm_store, set_enm
from network_model.core.czas_wylaczenia import czas_tb_roboczy
from network_model.core.voltage_factor import TolerancjaNapieciaNn
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

from tests.catalog_test_helpers import gpz_source_record

_SK_Q_MVA = 250.0
_UN_HV_KV = 15.0
_RX_SOURCE = 0.1

_R_SN_PER_KM = 0.253
_X_SN_PER_KM = 0.100
_LEN_SN_KM = 2.0
_THETA_SN_C = 250.0  # XLPE

_TR_SR_MVA = 0.630
_TR_UK_PERCENT = 6.0
_TR_PK_KW = 8.0

_R_LV_PER_KM = 0.253
_X_LV_PER_KM = 0.069
_LEN_LV_KM = 0.060
_THETA_LV_C = 160.0  # PVC (YAKY 4x120, katalog)

_UN_LV_KV = 0.4

# Składowa zerowa — dane FIXTURE (nie katalogowe, przybliżenie Z0≈3·Z1 typowe dla
# kabli), wyłącznie po to, by test 7 (1F × MIN) miał kompletną sieć zerową i mógł
# przejść walidator (W001/W002); solver 1F liczy z tego co dostanie, bez fabrykacji.
_R0_SN_PER_KM = 3.0 * _R_SN_PER_KM
_X0_SN_PER_KM = 3.0 * _X_SN_PER_KM
_R0_LV_PER_KM = 3.0 * _R_LV_PER_KM
_X0_LV_PER_KM = 3.0 * _X_LV_PER_KM
_R0_SOURCE_OHM = 0.16
_X0_SOURCE_OHM = 1.6

N0 = "N0_GPZ_SN"
N1 = "N1_SZYNA_SN"
N2 = "N2_SZYNA_NN"
N3 = "N3_KONIEC_NN"


def _build_mv_lv_enm(
    name: str, *, tolerancja: TolerancjaNapieciaNn | None = "PLUS_6"
) -> EnergyNetworkModel:
    """Sieć SN+nN: GPZ -> kabel SN -> szyna SN -> TR 630 kVA -> szyna nN ->
    kabel nN -> koniec obwodu. Wszystkie gałęzie/TR/źródło mają catalog_ref
    (E009 CATALOG-FIRST jest BLOKEREM w ENMValidator).

    ``tolerancja`` — deklarowana tolerancja sieci nN na transformatorze (nośnik wiersza nN
    tabeli 1 IEC 60909-0). Domyślnie +6 % (1,05/0,95) — wartości przypięte w tym pliku
    liczono dla tego wiersza; ``None`` buduje sieć bez deklaracji — liczoną z wartością roboczą
    rejestru (+10 %, karta TOLERANCJA-NN-WARTOSC-ROBOCZA), nie odmowę."""
    return EnergyNetworkModel(
        header=ENMHeader(name=name),
        buses=[
            Bus(ref_id=N0, name="GPZ 15 kV", voltage_kv=_UN_HV_KV),
            Bus(ref_id=N1, name="Szyna SN stacji", voltage_kv=_UN_HV_KV),
            Bus(ref_id=N2, name="Szyna nN", voltage_kv=_UN_LV_KV),
            Bus(ref_id=N3, name="Koniec obwodu nN", voltage_kv=_UN_LV_KV),
        ],
        branches=[
            Cable(
                ref_id="C_SN",
                name="Kabel SN XLPE Al 3x120mm2",
                from_bus_ref=N0,
                to_bus_ref=N1,
                length_km=_LEN_SN_KM,
                r_ohm_per_km=_R_SN_PER_KM,
                x_ohm_per_km=_X_SN_PER_KM,
                r0_ohm_per_km=_R0_SN_PER_KM,
                x0_ohm_per_km=_X0_SN_PER_KM,
                short_circuit_temperature_c=_THETA_SN_C,
                catalog_ref="cable-sn-xlpe-al-120",
                catalog_namespace="mv_cables",
                parameter_source="CATALOG",
            ),
            Cable(
                ref_id="C_NN",
                name="Kabel nN YAKY 4x120",
                from_bus_ref=N2,
                to_bus_ref=N3,
                length_km=_LEN_LV_KM,
                r_ohm_per_km=_R_LV_PER_KM,
                x_ohm_per_km=_X_LV_PER_KM,
                r0_ohm_per_km=_R0_LV_PER_KM,
                x0_ohm_per_km=_X0_LV_PER_KM,
                short_circuit_temperature_c=_THETA_LV_C,
                catalog_ref="cable-nn-yaky-4x120",
                catalog_namespace="KABEL_NN",
                parameter_source="CATALOG",
            ),
        ],
        transformers=[
            Transformer(
                ref_id="TR1",
                name="TR 15/0,4 kV 630 kVA Dyn11",
                hv_bus_ref=N1,
                lv_bus_ref=N2,
                sn_mva=_TR_SR_MVA,
                uhv_kv=_UN_HV_KV,
                ulv_kv=_UN_LV_KV,
                uk_percent=_TR_UK_PERCENT,
                pk_kw=_TR_PK_KW,
                vector_group="Dyn11",
                lv_voltage_tolerance=tolerancja,
                catalog_ref="tr-15-04-630kva-dyn11",
                catalog_namespace="mv_transformers",
                parameter_source="CATALOG",
            ),
        ],
        sources=[
            Source(
                **gpz_source_record(
                    ref_id="GRID_Q",
                    name="Sieć zasilająca 15 kV",
                    bus_ref=N0,
                    voltage_kv=_UN_HV_KV,
                    sk3_mva=_SK_Q_MVA,
                    rx_ratio=_RX_SOURCE,
                    extra={"r0_ohm": _R0_SOURCE_OHM, "x0_ohm": _X0_SOURCE_OHM},
                )
            ),
        ],
    )


def _build_sn_only_enm(name: str) -> EnergyNetworkModel:
    """Sieć czysto SN (bez TR, bez nN) — dla testu determinizmu wstecznego."""
    return EnergyNetworkModel(
        header=ENMHeader(name=name),
        buses=[
            Bus(ref_id=N0, name="GPZ 15 kV", voltage_kv=_UN_HV_KV),
            Bus(ref_id=N1, name="Szyna SN stacji", voltage_kv=_UN_HV_KV),
        ],
        branches=[
            Cable(
                ref_id="C_SN",
                name="Kabel SN XLPE Al 3x120mm2",
                from_bus_ref=N0,
                to_bus_ref=N1,
                length_km=_LEN_SN_KM,
                r_ohm_per_km=_R_SN_PER_KM,
                x_ohm_per_km=_X_SN_PER_KM,
                short_circuit_temperature_c=_THETA_SN_C,
                catalog_ref="cable-sn-xlpe-al-120",
                catalog_namespace="mv_cables",
                parameter_source="CATALOG",
            ),
        ],
        sources=[
            Source(
                **gpz_source_record(
                    ref_id="GRID_Q",
                    name="Sieć zasilająca 15 kV",
                    bus_ref=N0,
                    voltage_kv=_UN_HV_KV,
                    sk3_mva=_SK_Q_MVA,
                    rx_ratio=_RX_SOURCE,
                )
            ),
        ],
    )


def _rows_by_node(run) -> dict[str, dict]:
    return {row["fault_node_id"]: row for row in run.raw_result["results"]}


@pytest.fixture(autouse=True)
def reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


# =============================================================================
# 1. scenario=max (domyślny, brak options): c per pasmo — CAŁY inwentarz węzłów
# =============================================================================


def test_scenario_max_default_uses_c_per_band_for_every_node():
    case_id = "p03b-max-default"
    set_enm(case_id, _build_mv_lv_enm("Siec MV+LV — MAX domyslny"))

    run = create_run(case_id=case_id, klucz_twin=case_id, analysis_type="short_circuit_sn")
    result = execute_run(run.id)

    assert result.status == "FINISHED", result.error_message
    assert result.raw_result is not None
    rows = _rows_by_node(result)

    # Metadane biegu.
    assert result.raw_result["scenario"] == "MAX"
    assert result.raw_result["c_factor_override"] is False
    assert "temperature_correction_notes" not in result.raw_result

    expected_c = {
        N0: 1.10,  # SN (15 kV) > 1 kV
        N1: 1.10,  # SN (15 kV) > 1 kV
        N2: 1.05,  # nN (0,4 kV) <= 1 kV
        N3: 1.05,  # nN (0,4 kV) <= 1 kV
    }
    assert set(rows.keys()) == {ref_to_graph_id(ref) for ref in expected_c}
    for bus_ref, c_expected in expected_c.items():
        row = rows[ref_to_graph_id(bus_ref)]
        assert row["c_factor"] == pytest.approx(c_expected), bus_ref
        assert row["scenario"] == "MAX", bus_ref
        assert row["c_factor_override"] is False, bus_ref


# =============================================================================
# 2. scenario=min: c per pasmo MIN + korekta temperaturowa + Ik_min < Ik_max
# =============================================================================


def test_scenario_min_uses_c_min_per_band_and_temperature_correction():
    case_id = "p03b-min"
    enm = _build_mv_lv_enm("Siec MV+LV — MIN")
    set_enm(case_id, enm)

    run_max = create_run(case_id=case_id, klucz_twin=case_id, analysis_type="short_circuit_sn")
    result_max = execute_run(run_max.id)
    assert result_max.status == "FINISHED", result_max.error_message

    run_min = create_run(
        case_id=case_id,
        klucz_twin=case_id,
        analysis_type="short_circuit_sn",
        options={"scenario": "min"},
    )
    result_min = execute_run(run_min.id)
    assert result_min.status == "FINISHED", result_min.error_message
    assert result_min.raw_result is not None

    # Bieg MIN ma inny input_hash niż MAX (opcja scenariusza różnicuje cache).
    assert run_min.input_hash != run_max.input_hash

    rows_max = _rows_by_node(result_max)
    rows_min = _rows_by_node(result_min)

    assert result_min.raw_result["scenario"] == "MIN"
    assert result_min.raw_result["c_factor_override"] is False

    expected_c_min = {
        N0: 1.00,  # SN (15 kV) > 1 kV
        N1: 1.00,
        N2: 0.95,  # nN (0,4 kV) <= 1 kV
        N3: 0.95,
    }
    for bus_ref, c_expected in expected_c_min.items():
        row = rows_min[ref_to_graph_id(bus_ref)]
        assert row["c_factor"] == pytest.approx(c_expected), bus_ref
        assert row["scenario"] == "MIN", bus_ref
        assert row["c_factor_override"] is False, bus_ref

    # Noty korekty temperaturowej obecne (2 gałęzie liniowe: C_SN + C_NN, obie
    # z theta_k znanym) i faktycznie korygują R (corrected=True).
    notes = result_min.raw_result["temperature_correction_notes"]
    assert {note["branch_id"] for note in notes} == {
        ref_to_graph_id("C_SN"),
        ref_to_graph_id("C_NN"),
    }
    assert all(note["corrected"] is True for note in notes)

    # Ik''min < Ik''max na TYM SAMYM węźle (fizyka: c_min<c_max ORAZ R_theta>R20
    # dla theta_k>20degC — obie korekty ciągną Ik w dół dla MIN).
    for bus_ref in (N0, N1, N2, N3):
        node_id = ref_to_graph_id(bus_ref)
        assert rows_min[node_id]["ikss_a"] < rows_max[node_id]["ikss_a"], bus_ref


# =============================================================================
# 3. nadpisanie_c z uzasadnieniem -> OVERRIDE płaski dla wszystkich węzłów
#    (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK: dawny klucz `c_factor` jest odmową —
#    `tests/enm/test_wspolczynnik_c_jeden_nosnik.py`)
# =============================================================================


def test_explicit_c_factor_overrides_auto_for_every_node():
    case_id = "p03b-override"
    set_enm(case_id, _build_mv_lv_enm("Siec MV+LV — override"))

    run = create_run(
        case_id=case_id,
        klucz_twin=case_id,
        analysis_type="short_circuit_sn",
        options={"nadpisanie_c": {"wartosc": 1.2, "uzasadnienie": "Uzgodnienie z OSD"}},
    )
    result = execute_run(run.id)

    assert result.status == "FINISHED", result.error_message
    assert result.raw_result is not None
    assert result.raw_result["scenario"] == "MAX"
    assert result.raw_result["c_factor_override"] is True

    rows = _rows_by_node(result)
    assert len(rows) == 4
    for bus_ref in (N0, N1, N2, N3):
        row = rows[ref_to_graph_id(bus_ref)]
        assert row["c_factor"] == pytest.approx(1.2), bus_ref
        assert row["c_factor_override"] is True, bus_ref
        assert row["c_zrodlo"] == "nadpisanie ręczne: Uzgodnienie z OSD", bus_ref
        assert row["scenario"] == "MAX", bus_ref


# =============================================================================
# 4. Determinizm wsteczny: sieć czysto SN, options bez scenario/c_factor
# =============================================================================


def test_backward_determinism_pure_mv_network_matches_flat_c_110():
    case_id = "p03b-backward-mv-only"
    enm = _build_sn_only_enm("Siec czysto SN")
    set_enm(case_id, enm)

    run = create_run(case_id=case_id, klucz_twin=case_id, analysis_type="short_circuit_sn")
    result = execute_run(run.id)

    assert result.status == "FINISHED", result.error_message
    assert result.raw_result is not None
    rows = _rows_by_node(result)
    assert len(rows) == 2

    # Referencja: wywołanie solvera WPROST z c=1.10 (płaska wartość sprzed karty
    # P0.3b) na tym samym grafie mapowanym z tego samego ENM.
    graph = map_enm_to_network_graph(enm)
    for bus_ref in (N0, N1):
        node_id = ref_to_graph_id(bus_ref)
        row = rows[node_id]
        assert row["c_factor"] == pytest.approx(1.10), bus_ref
        assert row["scenario"] == "MAX", bus_ref
        assert row["c_factor_override"] is False, bus_ref

        reference = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id=node_id,
            c_factor=1.10,
            tk_s=1.0,
            include_branch_contributions=True,
            czas_tb=czas_tb_roboczy(),
        )
        assert row["ikss_a"] == pytest.approx(reference.ikss_a), bus_ref
        assert row["ip_a"] == pytest.approx(reference.ip_a), bus_ref
        assert row["ith_a"] == pytest.approx(reference.ith_a), bus_ref


# =============================================================================
# 5. Determinizm: dwa identyczne biegi -> identyczne payloady
# =============================================================================


def _strip_run_scoped_proof_refs(raw_result: dict) -> dict:
    """Usuń `proof_ref`/`proof_binding.proof_ref` przed porównaniem determinizmu.

    `_short_circuit_proof_ref` (enm/canonical_analysis.py) jawnie miesza
    ``run.id`` do hasha proof_ref (dowód MUSI być przypięty do KONKRETNEGO
    biegu audytowego) — to zachowanie SPRZED karty P0.3b i nie jest fizyką,
    więc dwa niezależne biegi (dwa różne ``run.id`` z ``uuid4()``) legitnie
    dostają różne proof_ref nawet dla identycznego wejścia. Determinizm karty
    P0.3b dotyczy WYNIKU FIZYCZNEGO (c_factor/scenario/Ik/korekta R), nie
    identyfikatora audytowego biegu.
    """
    stripped = {k: v for k, v in raw_result.items() if k != "results"}
    stripped_rows = []
    for row in raw_result["results"]:
        row = dict(row)
        row.pop("proof_ref", None)
        if isinstance(row.get("proof_binding"), dict):
            row["proof_binding"] = {
                k: v for k, v in row["proof_binding"].items() if k != "proof_ref"
            }
        stripped_rows.append(row)
    stripped["results"] = stripped_rows
    return stripped


def _strip_run_scoped_proof_refs_from_trace(trace: list[dict]) -> list[dict]:
    return [{k: v for k, v in step.items() if k != "proof_ref"} for step in trace]


def test_determinism_two_identical_runs_produce_identical_raw_result():
    case_id = "p03b-determinism"
    enm = _build_mv_lv_enm("Siec MV+LV — determinizm")
    set_enm(case_id, enm)

    run_a = create_run(
        case_id=case_id,
        klucz_twin=case_id,
        analysis_type="short_circuit_sn",
        options={"scenario": "min"},
    )
    result_a = execute_run(run_a.id)

    set_enm(case_id, enm)
    run_b = create_run(
        case_id=case_id,
        klucz_twin=case_id,
        analysis_type="short_circuit_sn",
        options={"scenario": "min"},
    )
    result_b = execute_run(run_b.id)

    assert result_a.status == "FINISHED", result_a.error_message
    assert result_b.status == "FINISHED", result_b.error_message
    assert run_a.input_hash == run_b.input_hash
    assert _strip_run_scoped_proof_refs(result_a.raw_result) == _strip_run_scoped_proof_refs(
        result_b.raw_result
    )
    assert _strip_run_scoped_proof_refs_from_trace(
        result_a.white_box_trace
    ) == _strip_run_scoped_proof_refs_from_trace(result_b.white_box_trace)


# =============================================================================
# 6. Nieznany scenariusz -> błąd jawny (zero cichego domysłu)
# =============================================================================


def test_unknown_scenario_raises_explicit_error():
    case_id = "p03b-unknown-scenario"
    set_enm(case_id, _build_mv_lv_enm("Siec MV+LV — zly scenariusz"))

    run = create_run(
        case_id=case_id,
        klucz_twin=case_id,
        analysis_type="short_circuit_sn",
        options={"scenario": "nominal"},
    )
    result = execute_run(run.id)

    assert result.status == "FAILED"
    assert "scenariusz" in (result.error_message or "").lower()


# =============================================================================
# 7. Iloczyn cech (reguła KLASA NIE INSTANCJA): typ zwarcia 1F (konsumuje
# z0_bus zbudowane z NIEskorygowanego grafu) x scenariusz MIN (solver dostaje
# solve_graph SKOrygowany R_theta) — zmiana objela WSZYSTKIE cztery gałęzie
# dysponowania solvera (3F/1F/2F/2F+Z) jednym mechanizmem (`solve_graph`), więc
# kombinacja "wymaga z0_bus" x "MIN" musi byc zweryfikowana wprost, nie tylko 3F.
# =============================================================================


def test_single_phase_fault_with_min_scenario_uses_c_min_and_does_not_crash():
    case_id = "p03b-1f-min"
    set_enm(case_id, _build_mv_lv_enm("Siec MV+LV — 1F MIN"))

    run = create_run(
        case_id=case_id,
        klucz_twin=case_id,
        analysis_type="short_circuit_sn",
        options={"scenario": "min", "fault_type": "1F"},
    )
    result = execute_run(run.id)

    assert result.status == "FINISHED", result.error_message
    assert result.raw_result is not None
    assert result.raw_result["short_circuit_type"] == "1F"
    assert result.raw_result["scenario"] == "MIN"
    rows = _rows_by_node(result)
    assert len(rows) == 4

    expected_c_min = {N0: 1.00, N1: 1.00, N2: 0.95, N3: 0.95}
    for bus_ref, c_expected in expected_c_min.items():
        row = rows[ref_to_graph_id(bus_ref)]
        assert row["c_factor"] == pytest.approx(c_expected), bus_ref
        assert row["scenario"] == "MIN", bus_ref
        # 1F zwarcie wymaga Z0: prąd zwarciowy musi byc dodatni i skonczony —
        # dowod, ze solve_graph (R_theta skorygowany) i z0_bus (zbudowany z
        # ORYGINALNEGO grafu) maja zgodne wymiary/kolejnosc wezlow.
        assert row["ikss_a"] > 0.0, bus_ref


# =============================================================================
# 8. Karta C6-PERSIST — lokalizacja zwarcia ze scenariusza HONOROWANA
# =============================================================================


def _stripped_rows_by_node(run) -> dict:
    """`_rows_by_node`, ale bez pól zależnych od TEGO, ile węzłów liczy dany
    bieg (nie od fizyki): `proof_ref` (run-scoped — patrz `_strip_run_scoped_
    proof_refs`) oraz `proof_binding.trace_step_refs` (indeksy do WŁASNEJ listy
    kroków biegu — bieg liczący 1 węzeł ma inne indeksy niż bieg liczący 4,
    nawet dla identycznej fizyki tego samego węzła). Parytet fizyki (karta
    C6-PERSIST, test (d)) dotyczy WIELKOŚCI, nie pozycji w liście śladu."""
    stripped = _strip_run_scoped_proof_refs(run.raw_result)
    wynik = {}
    for row in stripped["results"]:
        row = dict(row)
        if isinstance(row.get("proof_binding"), dict):
            row["proof_binding"] = {
                k: v for k, v in row["proof_binding"].items() if k != "trace_step_refs"
            }
        wynik[row["fault_node_id"]] = row
    return wynik


def test_location_bus_restricts_to_single_node_with_identical_physics():
    """(d) Lokalizacja BUS -> dokładnie JEDEN wiersz wyniku dla wskazanego
    węzła, wartości identyczne z wierszem TEGO SAMEGO węzła w biegu bez
    lokalizacji (parytet fizyki — ten sam solver, ta sama sieć, inny podzbiór
    węzłów raportowalnych)."""
    case_id = "c6-location-bus"
    set_enm(case_id, _build_mv_lv_enm("Siec MV+LV — lokalizacja BUS"))

    result_all = execute_run(
        create_run(case_id=case_id, klucz_twin=case_id, analysis_type="short_circuit_sn").id
    )
    assert result_all.status == "FINISHED", result_all.error_message
    rows_all = _stripped_rows_by_node(result_all)

    result_located = execute_run(
        create_run(
            case_id=case_id,
            klucz_twin=case_id,
            analysis_type="short_circuit_sn",
            options={"location": {"element_ref": N2, "location_type": "BUS", "position": None}},
        ).id
    )
    assert result_located.status == "FINISHED", result_located.error_message
    rows_located = _stripped_rows_by_node(result_located)

    assert set(rows_located.keys()) == {ref_to_graph_id(N2)}
    assert rows_located[ref_to_graph_id(N2)] == rows_all[ref_to_graph_id(N2)]


def test_location_node_type_behaves_like_bus():
    """`location_type=NODE` jest równoważny `BUS` (v2, PR-25) — ta sama
    restrykcja do jednego węzła."""
    case_id = "c6-location-node"
    set_enm(case_id, _build_mv_lv_enm("Siec MV+LV — lokalizacja NODE"))

    result = execute_run(
        create_run(
            case_id=case_id,
            klucz_twin=case_id,
            analysis_type="short_circuit_sn",
            options={"location": {"element_ref": N1, "location_type": "NODE", "position": None}},
        ).id
    )
    assert result.status == "FINISHED", result.error_message
    rows = _rows_by_node(result)
    assert set(rows.keys()) == {ref_to_graph_id(N1)}


def test_location_unknown_element_ref_is_explicit_refusal():
    """Węzeł wskazany przez scenariusz, którego nie ma w modelu -> błąd z
    nazwą elementu (zero cichego domysłu, zero pustej listy wyników)."""
    case_id = "c6-location-unknown"
    set_enm(case_id, _build_mv_lv_enm("Siec MV+LV — lokalizacja nieznana"))

    result = execute_run(
        create_run(
            case_id=case_id,
            klucz_twin=case_id,
            analysis_type="short_circuit_sn",
            options={
                "location": {
                    "element_ref": "nie-ma-takiego-wezla",
                    "location_type": "BUS",
                    "position": None,
                }
            },
        ).id
    )
    assert result.status == "FAILED"
    # Partia integracji 10: odmowa jawnie mówi, że węzła nie ma w modelu — identyfikator
    # wskazania nie trafia do treści (zostaje w opcjach biegu `location.element_ref`).
    assert "nie istnieje w modelu sieci" in (result.error_message or "")
    assert "nie-ma-takiego-wezla" not in (result.error_message or "")


def test_location_helper_bus_is_explicit_refusal():
    """Węzeł istniejący, ale POMOCNICZY (`skip_short_circuit_target`) — scenariusz
    wskazujący go dostaje odmowę z nazwą, nie cichy brak wyników."""
    case_id = "c6-location-helper-bus"
    snapshot = _build_mv_lv_enm("Siec MV+LV — lokalizacja pomocnicza").model_dump(mode="json")
    for bus in snapshot["buses"]:
        if bus["ref_id"] == N2:
            bus["tags"] = ["helper_bus"]
    set_enm(case_id, EnergyNetworkModel.model_validate(snapshot))

    result = execute_run(
        create_run(
            case_id=case_id,
            klucz_twin=case_id,
            analysis_type="short_circuit_sn",
            options={"location": {"element_ref": N2, "location_type": "BUS", "position": None}},
        ).id
    )
    assert result.status == "FAILED"
    # Partia integracji 10: węzeł nazwą z modelu, nie identyfikatorem.
    assert "Węzeł zwarcia „Szyna nN”" in (result.error_message or "")
    assert N2 not in (result.error_message or "")
    assert "pomocniczym" in (result.error_message or "")


def test_location_branch_point_is_explicit_refusal_defense_in_depth():
    """(e, druga linia obrony) BRANCH/BRANCH_POINT — `_execute_short_circuit`
    odmawia jawnie, GDYBY ktoś ominął eligibility (`FaultScenarioService.
    check_scenario_eligibility` blokuje to samo wcześniej, przez API)."""
    case_id = "c6-location-branch-point"
    set_enm(case_id, _build_mv_lv_enm("Siec MV+LV — lokalizacja BRANCH_POINT"))

    result = execute_run(
        create_run(
            case_id=case_id,
            klucz_twin=case_id,
            analysis_type="short_circuit_sn",
            options={
                "location": {
                    "element_ref": "C_SN",
                    "location_type": "BRANCH_POINT",
                    "position": 0.5,
                }
            },
        ).id
    )
    assert result.status == "FAILED"
    assert "adapter obliczeniowy" in (result.error_message or "")


def test_location_branch_is_explicit_refusal_same_code_as_branch_point():
    """`location_type=BRANCH` (v1) dostaje DOKŁADNIE ten sam komunikat co
    BRANCH_POINT — jeden kod kanonu dla całej klasy ograniczenia (KLASA, NIE
    INSTANCJA), nie dwa niezależne teksty dla dwóch nazw tego samego problemu."""
    case_id = "c6-location-branch"
    set_enm(case_id, _build_mv_lv_enm("Siec MV+LV — lokalizacja BRANCH"))

    wynik_branch = execute_run(
        create_run(
            case_id=case_id,
            klucz_twin=case_id,
            analysis_type="short_circuit_sn",
            options={
                "location": {"element_ref": "C_SN", "location_type": "BRANCH", "position": 0.5}
            },
        ).id
    )
    wynik_branch_point = execute_run(
        create_run(
            case_id=case_id,
            klucz_twin=case_id,
            analysis_type="short_circuit_sn",
            options={
                "location": {
                    "element_ref": "C_SN",
                    "location_type": "BRANCH_POINT",
                    "position": 0.5,
                }
            },
        ).id
    )
    assert wynik_branch.status == wynik_branch_point.status == "FAILED"
    assert "adapter obliczeniowy" in (wynik_branch.error_message or "")
    assert "adapter obliczeniowy" in (wynik_branch_point.error_message or "")


def test_location_absent_keeps_all_nodes_parity():
    """Brak `location` w opcjach — zachowanie BEZ ZMIAN (wszystkie węzły
    raportowalne), parytet z biegiem sprzed karty C6-PERSIST."""
    case_id = "c6-location-absent"
    set_enm(case_id, _build_mv_lv_enm("Siec MV+LV — brak lokalizacji"))

    result = execute_run(
        create_run(case_id=case_id, klucz_twin=case_id, analysis_type="short_circuit_sn").id
    )
    assert result.status == "FINISHED", result.error_message
    rows = _rows_by_node(result)
    assert set(rows.keys()) == {ref_to_graph_id(ref) for ref in (N0, N1, N2, N3)}


# =============================================================================
# 9. Rachunek ręczny IEC 60909 i korekta R_θ na biegu kanonicznym
# =============================================================================
#
# Karta TORY-TYLKO-W-TESTACH (2026-09-30): te dowody żyły dotąd w
# `tests/network_model/solvers/test_sc_lv_min_max.py` na adapterze
# `application.solvers.short_circuit_binding.execute_short_circuit` — torze bez
# konsumenta w produkcie (skasowany). Przeniesione tutaj na bieg kanoniczny, na tę samą
# sieć SN+nN (parametry identyczne), z intencją każdej asercji bez zmian.
#
# Rachunek ręczny (metoda sumowania impedancji szeregowych — dla sieci promieniowej z
# jednym źródłem dokładnie to, co liczy solver Z-bus, więc tolerancja 1 % ma duży zapas):
#
#   Źródło:      |Z_Q| = c_max(SN)·Un²/Sk'' = 1,10·15²/250 = 0,9900 Ω
#                X_Q = |Z_Q|/√(1+0,1²) = 0,9850868183 Ω, R_Q = 0,1·X_Q = 0,0985086818 Ω
#   Kabel SN:    R = 0,253·2 = 0,506 Ω, X = 0,100·2 = 0,200 Ω (MAX, bez korekty)
#   TR 630 kVA:  z = 0,06, r = (pk/1000)/Sr = 0,0126984127, x = √(z²−r²) = 0,0586408588
#                K_T = 0,95·c_max(nN=1,05)/(1+0,6·x) = 0,9635963302
#                Z_T = K_T·(r+jx)·(0,4²/0,63) = 0,0031075921 + j0,0143507597 Ω
#   Z_N1 (15 kV) = Z_Q + Z_kabelSN = 0,6045086818 + j1,1850868183 Ω
#   Z_N2 (0,4 kV) = Z_N1·(0,4/15)² + Z_T = 0,0035374649 + j0,0151934881 Ω,
#                   |Z_N2| = 0,0155998634 Ω
#   Ik''max(N2) = 1,05·400/(√3·|Z_N2|) = 15 544,18 A;  Ik''max(N1) = 7 160,67 A.

_OCZEKIWANE_IKSS_N2_MAX_A = 15544.18
_OCZEKIWANE_IKSS_N1_MAX_A = 7160.67
_TOLERANCJA_RACHUNKU = 0.01  # 1 %


def _bieg_zwarciowy(case_id: str, enm: EnergyNetworkModel, options: dict | None = None):
    set_enm(case_id, enm)
    run = create_run(
        case_id=case_id,
        klucz_twin=case_id,
        analysis_type="short_circuit_sn",
        **({"options": options} if options is not None else {}),
    )
    wynik = execute_run(run.id)
    assert wynik.status == "FINISHED", wynik.error_message
    assert wynik.raw_result is not None
    return wynik


def test_ikss_max_na_szynie_nn_i_sn_zgodny_z_rachunkiem_recznym():
    """Ik''max na szynie nN (c=1,05) i SN (c=1,10) = rachunek ręczny w granicy 1 %."""
    wynik = _bieg_zwarciowy("tory-reczny-max", _build_mv_lv_enm("Siec MV+LV — rachunek"))
    wiersze = _rows_by_node(wynik)

    wiersz_n2 = wiersze[ref_to_graph_id(N2)]
    assert wiersz_n2["ikss_a"] == pytest.approx(_OCZEKIWANE_IKSS_N2_MAX_A, rel=_TOLERANCJA_RACHUNKU)
    assert wiersz_n2["c_factor"] == pytest.approx(1.05)

    wiersz_n1 = wiersze[ref_to_graph_id(N1)]
    assert wiersz_n1["ikss_a"] == pytest.approx(_OCZEKIWANE_IKSS_N1_MAX_A, rel=_TOLERANCJA_RACHUNKU)
    assert wiersz_n1["c_factor"] == pytest.approx(1.10)


def test_korekta_r_theta_obniza_ikss_min_na_koncu_kabla_nn():
    """Korekta R_θ w scenariuszu MIN nie jest pusta: Ik''min na końcu kabla nN z korektą
    jest ściśle mniejszy niż Ik''min liczony tym samym c_min na grafie MIN BEZ korekty
    (odniesienie izoluje wyłącznie wkład R_θ)."""
    enm = _build_mv_lv_enm("Siec MV+LV — R_theta")
    wynik_min = _bieg_zwarciowy("tory-r-theta", enm, {"scenario": "min"})
    n3 = ref_to_graph_id(N3)

    odniesienie_bez_korekty = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
        graph=map_enm_to_network_graph(enm, scenario="MIN"),
        fault_node_id=n3,
        c_factor=0.95,
        tk_s=1.0,
        czas_tb=czas_tb_roboczy(),
    )
    assert _rows_by_node(wynik_min)[n3]["ikss_a"] < odniesienie_bez_korekty.ikss_a

    # Oba kable (SN θk=250 °C, nN θk=160 °C) skorygowane — jawnie w nocie White Box.
    noty = {
        nota["branch_id"]: nota for nota in wynik_min.raw_result["temperature_correction_notes"]
    }
    assert noty[ref_to_graph_id("C_SN")]["corrected"] is True
    nota_nn = noty[ref_to_graph_id("C_NN")]
    assert nota_nn["corrected"] is True
    assert nota_nn["theta_k_c"] == pytest.approx(_THETA_LV_C)
    assert nota_nn["r_theta_ohm_per_km"] > nota_nn["r20_ohm_per_km"]


def test_kabel_bez_theta_k_bez_korekty_z_jawna_nota():
    """Zero fabrykacji: kabel bez znanej temperatury zwarciowej zostaje w scenariuszu MIN
    bez korekty, a nota White Box mówi o braku wprost (nie zgadujemy θk)."""
    enm = _build_mv_lv_enm("Siec MV+LV — kabel bez theta_k")
    kabel_nn = next(galaz for galaz in enm.branches if galaz.ref_id == "C_NN")
    kabel_nn.short_circuit_temperature_c = None

    wynik_min = _bieg_zwarciowy("tory-bez-theta", enm, {"scenario": "min"})

    noty = {
        nota["branch_id"]: nota for nota in wynik_min.raw_result["temperature_correction_notes"]
    }
    nota_nn = noty[ref_to_graph_id("C_NN")]
    assert nota_nn["corrected"] is False
    assert nota_nn["theta_k_c"] is None
    assert "brak" in nota_nn["reason"].lower()


# =============================================================================
# 10. Sonda liczbowa wartości roboczej tolerancji nN (karta TOLERANCJA-NN-WARTOSC-ROBOCZA)
# =============================================================================
#
# Sieć jak w sekcji 9, transformator BEZ deklaracji tolerancji sieci nN: wyspa nN liczona z
# wartością roboczą +10 % (IEC 60909-0 tab. 1: c_max 1,10, c_min 0,90 — wpisane RĘCZNIE, nie
# z rejestru). Rachunek ręczny tą samą metodą sumowania impedancji co sekcja 9:
#
#   K_T(+10 %) = 0,95·1,10/(1+0,6·0,0586408588) = 1,0094818698
#   Z_T = K_T·(r+jx)·(0,4²/0,63) = 0,0032555727 + j0,0150341292 Ω
#   MAX: Z_N2 = Z_N1·(0,4/15)² + Z_T = 0,0036854455 + j0,0158768576 Ω
#        I″k,max(N2) = 1,10·400/(√3·|Z_N2|) = 15 585,88 A
#   MIN: źródło bez S″k,min — Z_Q z S″k i c_max SN (jak MAX); kabel SN z R_θ (θ_k 250 °C):
#        R = 0,506·[1+0,004·(250−20)] = 0,97152 Ω; transformator bez korekty, K_T z c_max
#        Z_N2 = 0,0040164820 + j0,0158768576 Ω
#        I″k,min(N2) = 0,90·400/(√3·|Z_N2|) = 12 691,33 A

_SONDA_ROBOCZA_IKSS_N2_A = {"MAX": 15585.88, "MIN": 12691.33}
_SONDA_ROBOCZA_C_N2 = {"MAX": 1.10, "MIN": 0.90}


@pytest.mark.parametrize("scenariusz", ["MAX", "MIN"])
def test_sonda_reczna_wartosci_roboczej_tolerancji_nn(scenariusz: str):
    """I″k szyny nN sieci bez deklaracji = rachunek ręczny dla c 1,10/0,90 (wartość robocza
    +10 %), a wiersz nazywa wartość roboczą w podstawie c i znaczniku."""
    wynik = _bieg_zwarciowy(
        f"sonda-robocza-{scenariusz}",
        _build_mv_lv_enm("Sieć MV+LV — wartość robocza", tolerancja=None),
        {"scenario": scenariusz.lower()},
    )
    wiersz = _rows_by_node(wynik)[ref_to_graph_id(N2)]
    assert wiersz["c_factor"] == pytest.approx(_SONDA_ROBOCZA_C_N2[scenariusz])
    assert wiersz["ikss_a"] == pytest.approx(_SONDA_ROBOCZA_IKSS_N2_A[scenariusz], rel=1e-6)
    assert wiersz["c_zrodlo"] == (
        f"IEC 60909-0 tab. 1, pasmo nN, tolerancja +10 % (wartość robocza), {scenariusz}"
    )
    assert wiersz["tolerancja_nn_robocza"] is True
    # Szyna SN tej samej sieci: wiersz SN, bez znacznika (c węzła nie zależy od tolerancji nN).
    assert "tolerancja_nn_robocza" not in _rows_by_node(wynik)[ref_to_graph_id(N1)]


@pytest.mark.parametrize("scenariusz", ["MAX", "MIN"])
def test_wartosc_robocza_rowna_deklaracji_plus_10_w_liczbach(scenariusz: str):
    """Wartość robocza liczy DOKŁADNIE to, co deklaracja +10 % (te same prądy w każdym
    węźle) — różni ją wyłącznie podstawa c, znacznik wiersza i założenie biegu."""
    robocza = _bieg_zwarciowy(
        f"robocza-{scenariusz}",
        _build_mv_lv_enm("Sieć", tolerancja=None),
        {"scenario": scenariusz.lower()},
    )
    reset_canonical_runs()
    deklaracja = _bieg_zwarciowy(
        f"deklaracja-{scenariusz}",
        _build_mv_lv_enm("Sieć", tolerancja="PLUS_10"),
        {"scenario": scenariusz.lower()},
    )
    w_rob, w_dek = _rows_by_node(robocza), _rows_by_node(deklaracja)
    assert set(w_rob) == set(w_dek)
    for wezel, wiersz in w_dek.items():
        for pole in ("ikss_a", "ip_a", "ith_a", "c_factor"):
            assert w_rob[wezel][pole] == wiersz[pole], (wezel, pole)
    kody_rob = [z["code"] for z in robocza.raw_result.get("zalozenia", [])]
    kody_dek = [z["code"] for z in deklaracja.raw_result.get("zalozenia", [])]
    # Jedyna różnica list założeń to JEDNO założenie tolerancji roboczej. Pozycja nie jest
    # kontraktem: założenia modelu (assembler: źródło, tolerancja nN) poprzedzają założenia
    # konfiguracji biegu (np. `fault.czas_tb_wartosc_robocza`, karta TB-WARTOSC-ROBOCZA).
    tolerancja = "fault.c_tolerancja_nn_robocza"
    assert kody_rob.count(tolerancja) == 1, kody_rob
    assert [kod for kod in kody_rob if kod != tolerancja] == kody_dek


# ---------------------------------------------------------------------------
# 11. Dwie wyspy nN, jedna zadeklarowana (karta TOLERANCJA-NN-WARTOSC-ROBOCZA)
#
# Iloczyn cech: {deklaracja wyspy A: +6 %, +10 %} × {wyspa B: brak deklaracji} × {MAX, MIN}.
# Rozstrzygnięcie jest per wyspa galwaniczna: wartość robocza wyspy B nie przecieka do wyspy A
# (wiersz, podstawa c, prąd), a założenie biegu jest JEDNO i nazywa transformator wyspy B.
# ---------------------------------------------------------------------------

N4 = "N4_SZYNA_NN_B"


def _dwie_wyspy_nn(tolerancja_a: str, tolerancja_b: str | None) -> EnergyNetworkModel:
    enm = _build_mv_lv_enm("Dwie wyspy nN", tolerancja=tolerancja_a)  # type: ignore[arg-type]
    (tr1,) = enm.transformers
    tr2 = tr1.model_copy(
        update={
            "ref_id": "TR2",
            "name": "TR B 15/0,4 kV 630 kVA",
            "lv_bus_ref": N4,
            "lv_voltage_tolerance": tolerancja_b,
        }
    )
    szyna_b = Bus(ref_id=N4, name="Szyna nN wyspy B", voltage_kv=_UN_LV_KV)
    return enm.model_copy(update={"buses": [*enm.buses, szyna_b], "transformers": [tr1, tr2]})


@pytest.mark.parametrize("scenariusz", ["MAX", "MIN"])
@pytest.mark.parametrize("tolerancja_a", ["PLUS_6", "PLUS_10"])
def test_dwie_wyspy_wartosc_robocza_tylko_w_wyspie_bez_deklaracji(
    tolerancja_a: str, scenariusz: str
):
    opcje = {"scenario": scenariusz.lower()}
    mieszana = _bieg_zwarciowy(
        f"wyspy-{tolerancja_a}-{scenariusz}", _dwie_wyspy_nn(tolerancja_a, None), opcje
    )
    reset_canonical_runs()
    zadeklarowana = _bieg_zwarciowy(
        f"wyspy-dekl-{tolerancja_a}-{scenariusz}", _dwie_wyspy_nn(tolerancja_a, "PLUS_10"), opcje
    )
    w_mix, w_dek = _rows_by_node(mieszana), _rows_by_node(zadeklarowana)
    # Wiersze bez odnośników dowodu związanych z identyfikatorem biegu (jedyna różnica tożsama).
    s_mix, s_dek = _stripped_rows_by_node(mieszana), _stripped_rows_by_node(zadeklarowana)
    etykieta_a = {"PLUS_6": "+6 %", "PLUS_10": "+10 %"}[tolerancja_a]
    for ref in (N2, N3):
        wiersz = w_mix[ref_to_graph_id(ref)]
        assert "tolerancja_nn_robocza" not in wiersz, ref
        assert wiersz["c_zrodlo"] == (
            f"IEC 60909-0 tab. 1, pasmo nN, tolerancja {etykieta_a}, {scenariusz}"
        )
    wiersz_b = w_mix[ref_to_graph_id(N4)]
    assert wiersz_b["tolerancja_nn_robocza"] is True
    assert wiersz_b["c_zrodlo"] == (
        f"IEC 60909-0 tab. 1, pasmo nN, tolerancja +10 % (wartość robocza), {scenariusz}"
    )
    # Liczby: wartość robocza wyspy B = deklaracja +10 %; wyspa A i szyny SN bez zmian.
    assert set(w_mix) == set(w_dek)
    for wezel, wiersz in w_dek.items():
        for pole in ("ikss_a", "ip_a", "ith_a", "c_factor"):
            assert w_mix[wezel][pole] == wiersz[pole], (wezel, pole)
        if wezel != ref_to_graph_id(N4):
            assert s_mix[wezel] == s_dek[wezel], wezel
    zalozenia = [
        z
        for z in mieszana.raw_result.get("zalozenia", [])
        if z["code"] == "fault.c_tolerancja_nn_robocza"
    ]
    assert [(z["element_ref"], z["scenariusz"]) for z in zalozenia] == [("TR2", scenariusz)]
    assert "TR B 15/0,4 kV 630 kVA" in zalozenia[0]["message_pl"]
    assert "Szyna nN wyspy B" in zalozenia[0]["message_pl"]
    assert "TR 15/0,4 kV 630 kVA Dyn11" not in zalozenia[0]["message_pl"]
    assert "fault.c_tolerancja_nn_robocza" not in {
        z["code"] for z in zadeklarowana.raw_result.get("zalozenia", [])
    }


@pytest.mark.parametrize("tolerancja", ["PLUS_6", "PLUS_10"])
def test_bieg_na_samych_deklaracjach_bez_sladu_wartosci_roboczej(tolerancja: str):
    """Determinizm i addytywność: sieć z deklaracją nie niesie żadnego śladu karty — brak
    klucza `tolerancja_nn_robocza` w wierszach, brak założenia, podstawa c bez dopisku — a dwa
    biegi tego samego wejścia mają ten sam `input_hash` i te same wiersze."""
    pierwszy = _bieg_zwarciowy(f"det-a-{tolerancja}", _dwie_wyspy_nn(tolerancja, tolerancja))
    reset_canonical_runs()
    drugi = _bieg_zwarciowy(f"det-a-{tolerancja}", _dwie_wyspy_nn(tolerancja, tolerancja))
    assert pierwszy.input_hash == drugi.input_hash
    assert _stripped_rows_by_node(pierwszy) == _stripped_rows_by_node(drugi)
    for wiersz in _rows_by_node(pierwszy).values():
        assert "tolerancja_nn_robocza" not in wiersz
        assert "wartość robocza" not in (wiersz.get("c_zrodlo") or "")
    assert "fault.c_tolerancja_nn_robocza" not in {
        z["code"] for z in pierwszy.raw_result.get("zalozenia", [])
    }
