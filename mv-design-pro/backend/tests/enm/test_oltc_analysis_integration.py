"""OLTC end-to-end at the analysis-run level (V12K-045, OLTC F4).

Proves the canonical tap changer flows through the whole chain:
    ENM Transformer.tap_changer -> mapping -> domain TapChanger
    -> canonical load-flow OLTC control loop -> run.raw_result["oltc_control"].

The regulated SN busbar is driven toward the setpoint; the regulator decision
trace, final positions and switch counts are surfaced on the run result.
"""

from __future__ import annotations

import pytest
from enm.assembler import (
    _graph_id_from_ref,
)
from enm.canonical_analysis import (
    create_run,
    execute_run,
    reset_canonical_runs,
)
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm

from tests.catalog_test_helpers import gpz_source_record


@pytest.fixture(autouse=True)
def reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _payload(name: str, *, with_oltc: bool, setpoint_kv: float = 15.5) -> dict:
    """110 kV slack -> 110/15 transformer -> SN busbar -> line -> load.

    The transformer + line drop depress the SN busbar; an OLTC regulated on the
    HV winding steps down to raise it toward the setpoint.
    """
    transformer = {
        "id": "00000000-0000-0000-0000-000000000010",
        "ref_id": "tr1",
        "name": "TR 110/15",
        "tags": [],
        "meta": {},
        "hv_bus_ref": "b_hv",
        "lv_bus_ref": "b_sn",
        "sn_mva": 25.0,
        "uhv_kv": 110.0,
        "ulv_kv": 15.0,
        "uk_percent": 12.0,
        "pk_kw": 120.0,
        "catalog_ref": "tr-wn-sn-110-15-25mva-yd11",
        "catalog_namespace": "TRAFO_SN_NN",
    }
    if with_oltc:
        transformer["tap_changer"] = {
            "regulation_type": "OLTC",
            "regulated_winding": "HV",
            "neutral_position": 0,
            "current_position": 0,
            "min_position": -9,
            "max_position": 9,
            "step_percent": 1.25,
            "control_mode": "AUTOMATIC",
            "voltage_setpoint_kv": setpoint_kv,
            "deadband_kv": 0.2,
            "controlled_bus_ref": "b_sn",
            "catalog_ref": "tc_oltc_110sn_19_125",
        }
    return {
        "header": {
            "name": name,
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "ref_id": "b_hv",
                "name": "110 kV",
                "tags": [],
                "meta": {},
                "voltage_kv": 110,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000000002",
                "ref_id": "b_sn",
                "name": "SN",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000000003",
                "ref_id": "b_load",
                "name": "Odbior",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
        ],
        "branches": [
            {
                "id": "00000000-0000-0000-0000-000000000011",
                "ref_id": "ln-1",
                "name": "Linia SN",
                "tags": [],
                "meta": {},
                "from_bus_ref": "b_sn",
                "to_bus_ref": "b_load",
                "status": "closed",
                "type": "line_overhead",
                "length_km": 5.0,
                "r_ohm_per_km": 0.3,
                "x_ohm_per_km": 0.4,
                "catalog_ref": "LINIA_SN:reczne",
                "catalog_namespace": "LINIA_SN",
            },
        ],
        "transformers": [transformer],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000000004",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="s1",
                    name="S1",
                    bus_ref="b_hv",
                    voltage_kv=110.0,
                    sk3_mva=3000.0,
                    rx_ratio=0.1,
                ),
            },
        ],
        "loads": [
            {
                "id": "00000000-0000-0000-0000-000000000020",
                "ref_id": "load-1",
                "name": "Odbior",
                "tags": [],
                "meta": {},
                "bus_ref": "b_load",
                "p_mw": 15.0,
                "q_mvar": 7.0,
                "model": "pq",
            },
        ],
        "generators": [],
        "shunt_capacitors": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


def _v_kv(run, ref_id: str) -> float:
    return run.raw_result["node_voltage_kv"][_graph_id_from_ref(ref_id)]


def test_oltc_regulates_sn_bus_through_analysis():
    set_enm("oltc-off", EnergyNetworkModel.model_validate(_payload("bez OLTC", with_oltc=False)))
    set_enm("oltc-on", EnergyNetworkModel.model_validate(_payload("z OLTC", with_oltc=True)))

    run_off = execute_run(
        create_run(case_id="oltc-off", klucz_twin="oltc-off", analysis_type="PF").id
    )
    run_on = execute_run(create_run(case_id="oltc-on", klucz_twin="oltc-on", analysis_type="PF").id)

    assert run_off.status == "FINISHED", run_off.error_message
    assert run_on.status == "FINISHED", run_on.error_message

    # Without OLTC the SN busbar sits below the setpoint.
    v_off = _v_kv(run_off, "b_sn")
    assert v_off < 15.5 - 0.1

    # OLTC surfaced on the run and it acted.
    oltc = run_on.raw_result["oltc_control"]
    assert oltc is not None
    assert oltc["converged"] is True
    tr_key = _graph_id_from_ref("tr1")
    assert oltc["final_positions"][tr_key] < 0  # HV-regulated stepped down to raise SN
    # Licznik łączeń ≥ |pozycja końcowa| (V12K-187). Równość zachodzi przy dojściu
    # monotonicznym; gdy regulator dyskretny przeskoczy pasmo i blokada oscylacji
    # cofnie go na lepszy zaczep, dochodzi łączenie powrotne — resurs przełącznika
    # zużywa KAŻDY ruch, nie tylko ruch „w stronę celu".
    assert oltc["switch_counts"][tr_key] >= abs(oltc["final_positions"][tr_key])
    assert oltc["total_switch_count"] >= 1

    # The regulated SN busbar rose toward the setpoint.
    v_on = _v_kv(run_on, "b_sn")
    assert v_on > v_off
    # V12K-187: regulator zaczepowy jest DYSKRETNY — gdy skok jednego stopnia jest
    # większy niż strefa nieczułości, ŻADNA pozycja nie mieści się w paśmie i
    # dawna asercja `|U − U_zad| ≤ pasmo/2` była nieosiągalna. (Wcześniej przechodziła
    # tylko dlatego, że Y-bus rozpływu zaniżała impedancje sieci i stopień zaczepu
    # ledwo ruszał napięciem.) Weryfikujemy więc mocniejszą własność: regulator stanął
    # na zaczepie o NAJMNIEJSZEJ osiągalnej odchyłce — dowód wprost ze śladu blokady
    # oscylacji, bez utrwalania liczby.
    stops = [
        decision
        for it in oltc["iterations"]
        for decision in it["decisions"]
        if decision.get("reason") == "oscillation_stop" and "oscillation_candidates" in decision
    ]
    if stops:
        candidates = stops[0]["oscillation_candidates"]
        best_position = min(candidates.items(), key=lambda item: (item[1], int(item[0])))[0]
        assert oltc["final_positions"][tr_key] == int(best_position)
        assert abs(v_on - 15.5) == pytest.approx(min(candidates.values()), abs=1e-6)
    else:
        assert abs(v_on - 15.5) <= 0.2 / 2 + 1e-6

    # Without OLTC there is no oltc_control key (backward compatible).
    assert "oltc_control" not in run_off.raw_result


def test_oltc_sweep_study_surfaced_on_run():
    set_enm("oltc-sweep", EnergyNetworkModel.model_validate(_payload("sweep", with_oltc=True)))
    run = execute_run(
        create_run(
            case_id="oltc-sweep",
            klucz_twin="oltc-sweep",
            analysis_type="PF",
            options={"oltc_study": "sweep"},
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    sweep = run.raw_result["oltc_sweep"]
    assert len(sweep["points"]) == 19  # full -9..+9 range
    positions = [p["position"] for p in sweep["points"]]
    assert positions == list(range(-9, 10))
    # Controlled-bus voltage decreases monotonically as the position increases —
    # ale WYŁĄCZNIE po punktach ZBIEŻNYCH (V12K-187). Skrajne zaczepy tej sieci
    # przekraczają punkt krytyczny krzywej PV (kolaps napięciowy): rozpływ nie
    # zbiega i zwraca wartości bez sensu eksploatacyjnego (np. 0,66 kV na szynie
    # 15 kV). Solver oznacza je uczciwie `converged=False` — monotoniczność wolno
    # sprawdzać tylko tam, gdzie rozwiązanie istnieje. Dawniej test obejmował
    # wszystkie punkty i przechodził jedynie dlatego, że zaniżone impedancje
    # rozpływu czyniły sieć sztywną, więc kolaps nie występował.
    solved = [p for p in sweep["points"] if p.get("converged")]
    assert len(solved) >= 10, "oczekiwano zbieżnego rozwiązania w większości zakresu zaczepów"
    vs = [p["controlled_bus_kv"] for p in solved]
    assert all(a >= b - 1e-9 for a, b in zip(vs, vs[1:], strict=False))


def test_oltc_optimize_study_surfaced_on_run():
    set_enm("oltc-opt", EnergyNetworkModel.model_validate(_payload("opt", with_oltc=True)))
    run = execute_run(
        create_run(
            case_id="oltc-opt",
            klucz_twin="oltc-opt",
            analysis_type="PF",
            options={"oltc_study": "optimize", "oltc_objective": "minimize_losses"},
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    opt = run.raw_result["oltc_optimization"]
    assert opt["objective"] == "minimize_losses"
    assert opt["best_position"] is not None
    assert len(opt["candidates"]) == 19


def test_oltc_annual_profile_study_surfaced_on_run():
    set_enm("oltc-prof", EnergyNetworkModel.model_validate(_payload("prof", with_oltc=True)))
    run = execute_run(
        create_run(
            case_id="oltc-prof",
            klucz_twin="oltc-prof",
            analysis_type="PF",
            options={
                "oltc_study": "annual_profile",
                "oltc_load_profile": [
                    {"label": "noc", "load_scale": 0.3},
                    {"label": "szczyt", "load_scale": 1.6},
                ],
            },
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    prof = run.raw_result["oltc_annual_profile"]
    assert len(prof["steps"]) == 2
    assert prof["steps"][0]["label"] == "noc"
    assert "total_switch_count" in prof


def test_oltc_study_surfaced_in_execution_result_set():
    from enm.canonical_analysis import build_execution_result_set, get_run

    set_enm("oltc-rs", EnergyNetworkModel.model_validate(_payload("rs", with_oltc=True)))
    run = execute_run(
        create_run(
            case_id="oltc-rs",
            klucz_twin="oltc-rs",
            analysis_type="PF",
            options={"oltc_study": "sweep"},
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    result_set = build_execution_result_set(get_run(run.id))
    gr = result_set["global_results"]
    # The regulator trace and the sweep study are both surfaced for the UI.
    assert "oltc_control" in gr
    assert "oltc_sweep" in gr
    assert len(gr["oltc_sweep"]["points"]) == 19


def test_pf_run_without_study_option_has_no_study_keys():
    set_enm("oltc-nostudy", EnergyNetworkModel.model_validate(_payload("nostudy", with_oltc=True)))
    run = execute_run(
        create_run(case_id="oltc-nostudy", klucz_twin="oltc-nostudy", analysis_type="PF").id
    )
    assert run.status == "FINISHED", run.error_message
    assert "oltc_sweep" not in run.raw_result
    assert "oltc_optimization" not in run.raw_result
    assert "oltc_annual_profile" not in run.raw_result


def test_oltc_analysis_is_deterministic():
    set_enm("oltc-d1", EnergyNetworkModel.model_validate(_payload("det1", with_oltc=True)))
    set_enm("oltc-d2", EnergyNetworkModel.model_validate(_payload("det2", with_oltc=True)))
    run1 = execute_run(create_run(case_id="oltc-d1", klucz_twin="oltc-d1", analysis_type="PF").id)
    run2 = execute_run(create_run(case_id="oltc-d2", klucz_twin="oltc-d2", analysis_type="PF").id)
    assert run1.raw_result["oltc_control"]["final_positions"] == (
        run2.raw_result["oltc_control"]["final_positions"]
    )
    assert run1.raw_result["oltc_control"]["switch_counts"] == (
        run2.raw_result["oltc_control"]["switch_counts"]
    )
