"""Rozplyw mocy na sieci promieniowej i pierscieniowej przez tor kanoniczny —
migracja fizyki z dawnego testu E3 (`ExecutionEngineService.execute_run_load_flow`,
`tests/test_execution_engine_load_flow_integration.py`, kasacja karta CV-3.3-A).
E3 nie mial ANI JEDNEJ trasy HTTP ani konsumenta produkcyjnego — zyl wylacznie w
testach; R1 (`enm.canonical_analysis`) jest jedynym torem produkcyjnym biegow.

Asercje liczbowe zachowuja INTENCJE dawnego testu E3 (zbieznosc rozplywu na
sieci promieniowej, komplet wynikow na kazdej szynie i galezi; determinizm na
sieci pierscieniowej — dwie migawki tej samej tresci daja bit w bit ten sam
wynik) — nie kopiuja bajtowo starej fikstury (inne wartosci P/Q odbiorow, ta
sama fizyka Newtona-Raphsona).

Tor: `set_enm` + `create_run(..., klucz_twin=)` + `execute_run`
(`enm.canonical_analysis`) — jedyny tor produkcyjny biegow (R1). Kazda galaz i
zrodlo niesie `catalog_ref` (E009 CATALOG-FIRST jest BLOKEREM w ENMValidator na
tej sciezce — `_execute_power_flow` wywolane bezposrednio, z pominieciem
walidatora, jak robia niektore testy fikstur w innych plikach, NIE jest torem
produkcyjnym, wiec tu go nie uzywamy).
"""

from __future__ import annotations

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Load, OverheadLine, Source
from enm.store import reset_enm_store, set_enm

from tests.catalog_test_helpers import gpz_source_record

_UN_KV = 15.0
_R_PER_KM = 0.253
_X_PER_KM = 0.100
_LEN_KM = 2.0


@pytest.fixture(autouse=True)
def _reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _linia(ref_id: str, *, od: str, do: str) -> OverheadLine:
    return OverheadLine(
        ref_id=ref_id,
        name=f"Linia {ref_id}",
        from_bus_ref=od,
        to_bus_ref=do,
        length_km=_LEN_KM,
        r_ohm_per_km=_R_PER_KM,
        x_ohm_per_km=_X_PER_KM,
        catalog_ref="linia-sn-referencyjna",
        catalog_namespace="LINIA_SN",
        parameter_source="CATALOG",
    )


def _zrodlo() -> Source:
    return Source(
        **gpz_source_record(
            ref_id="src",
            name="System 15 kV",
            bus_ref="b_src",
            voltage_kv=_UN_KV,
            sk3_mva=500.0,
            rx_ratio=0.1,
        )
    )


def _siec_promieniowa() -> EnergyNetworkModel:
    """b_src --l1--> b_n1 --l2--> b_n2, odbior na b_n1/b_n2 — byla siec
    dawnego testu E3 `test_execute_run_load_flow_radial`."""
    return EnergyNetworkModel(
        header=ENMHeader(name="Siec E3->kanon - promien"),
        buses=[
            Bus(ref_id="b_src", name="GPZ SN", voltage_kv=_UN_KV),
            Bus(ref_id="b_n1", name="Stacja N1", voltage_kv=_UN_KV),
            Bus(ref_id="b_n2", name="Stacja N2", voltage_kv=_UN_KV),
        ],
        sources=[_zrodlo()],
        loads=[
            Load(ref_id="ld_n1", name="Odbior N1", bus_ref="b_n1", p_mw=2.0, q_mvar=0.8),
            Load(ref_id="ld_n2", name="Odbior N2", bus_ref="b_n2", p_mw=1.5, q_mvar=0.6),
        ],
        branches=[
            _linia("l1", od="b_src", do="b_n1"),
            _linia("l2", od="b_n1", do="b_n2"),
        ],
    )


def _siec_pierscien() -> EnergyNetworkModel:
    """b_src --lr1--> b_r1 --lr2--> b_r2 --lr3--> b_r3 --lr4--> b_src (petla
    zamknieta), odbior na b_r1/b_r2/b_r3 — byla siec dawnego testu E3
    `test_execute_run_load_flow_ring_deterministic_signature`."""
    return EnergyNetworkModel(
        header=ENMHeader(name="Siec E3->kanon - pierscien"),
        buses=[
            Bus(ref_id="b_src", name="GPZ SN", voltage_kv=_UN_KV),
            Bus(ref_id="b_r1", name="Stacja R1", voltage_kv=_UN_KV),
            Bus(ref_id="b_r2", name="Stacja R2", voltage_kv=_UN_KV),
            Bus(ref_id="b_r3", name="Stacja R3", voltage_kv=_UN_KV),
        ],
        sources=[_zrodlo()],
        loads=[
            Load(ref_id="ld_r1", name="Odbior R1", bus_ref="b_r1", p_mw=1.0, q_mvar=0.4),
            Load(ref_id="ld_r2", name="Odbior R2", bus_ref="b_r2", p_mw=1.2, q_mvar=0.5),
            Load(ref_id="ld_r3", name="Odbior R3", bus_ref="b_r3", p_mw=0.9, q_mvar=0.4),
        ],
        branches=[
            _linia("lr1", od="b_src", do="b_r1"),
            _linia("lr2", od="b_r1", do="b_r2"),
            _linia("lr3", od="b_r2", do="b_r3"),
            _linia("lr4", od="b_r3", do="b_src"),  # zamyka petle
        ],
    )


def test_rozplyw_na_sieci_promieniowej_zbiega_z_kompletem_wynikow() -> None:
    """Siec promieniowa: bieg kanoniczny zbiega i daje wynik na kazdej szynie
    i galezi (byla siec dawnego testu E3 `test_execute_run_load_flow_radial`)."""
    klucz = "e3-kanon-promien"
    set_enm(klucz, _siec_promieniowa())

    run = execute_run(create_run(case_id=klucz, klucz_twin=klucz, analysis_type="PF").id)

    assert run.status == "FINISHED", run.error_message
    assert run.raw_result["reporting_status"] == "reportable"
    result_v1 = run.raw_result["result_v1"]
    # 3 szyny + 2 galezie = 5 elementow (byl `len(result.element_results) >= 5`).
    assert len(result_v1["bus_results"]) + len(result_v1["branch_results"]) >= 5
    assert all(bus["v_pu"] is not None for bus in result_v1["bus_results"])


def test_rozplyw_na_sieci_pierscieniowej_jest_deterministyczny() -> None:
    """Siec pierscieniowa (petla): dwie migawki tej samej tresci daja bit w bit
    ten sam wynik (determinizm), nie tylko ten sam status — byla siec dawnego
    testu E3 `test_execute_run_load_flow_ring_deterministic_signature`."""
    klucz_a, klucz_b = "e3-kanon-pierscien-a", "e3-kanon-pierscien-b"
    siec = _siec_pierscien()
    set_enm(klucz_a, siec)
    set_enm(klucz_b, siec)

    run_a = execute_run(create_run(case_id=klucz_a, klucz_twin=klucz_a, analysis_type="PF").id)
    run_b = execute_run(create_run(case_id=klucz_b, klucz_twin=klucz_b, analysis_type="PF").id)

    assert run_a.status == "FINISHED", run_a.error_message
    assert run_b.status == "FINISHED", run_b.error_message
    assert run_a.snapshot_hash == run_b.snapshot_hash
    assert run_a.raw_result["result_v1"] == run_b.raw_result["result_v1"]
    # Siec ma zamknieta petle (4 galezie miedzy 4 szynami) — nie jest promieniowa.
    assert len(run_a.raw_result["result_v1"]["branch_results"]) == 4
    assert len(run_a.raw_result["result_v1"]["bus_results"]) == 4
