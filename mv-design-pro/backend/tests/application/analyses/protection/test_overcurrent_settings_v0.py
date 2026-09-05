from __future__ import annotations

from application.analyses.iec60909.envelope_adapter import to_run_envelope
from application.analyses.protection.overcurrent.pipeline import run_overcurrent_v0
from application.analyses.run_index import index_run
from network_model.solvers.short_circuit_core import ShortCircuitType
from network_model.solvers.short_circuit_iec60909 import ShortCircuitResult

from tests.utils.determinism import assert_deterministic


def _build_short_circuit_result() -> ShortCircuitResult:
    # c = 0,95 ⇒ gałąź MINIMALNA (IEC 60909-0, Tabela 1). Nastawy zabezpieczeń
    # dobiera się z prądu zwarciowego minimalnego — zabezpieczenie ma zadziałać
    # także przy najsłabszym zwarciu. Dawne c = 1,0 dawało gałąź maksymalną, więc
    # nastawa I>> nie miała danych i wpadała w wartość zastępczą (V12K-189).
    return ShortCircuitResult(
        short_circuit_type=ShortCircuitType.THREE_PHASE,
        fault_node_id="node-1",
        c_factor=0.95,
        un_v=400.0,
        zkk_ohm=complex(0.05, 0.12),
        ikss_a=1234.0,
        ip_a=1500.0,
        ith_a=1100.0,
        sk_mva=1.2,
        rx_ratio=0.4,
        kappa=1.05,
        tk_s=0.2,
        ib_a=1200.0,
        tb_s=0.1,
        ik_thevenin_a=1000.0,
        ik_inverters_a=200.0,
        ik_total_a=1200.0,
        contributions=[],
        branch_contributions=None,
        white_box_trace=[{"step": "init"}],
    )


def _store_short_circuit_run(uow_factory) -> str:
    sc_result = _build_short_circuit_result()
    sc_run_id = "sc-run-oc-v0"
    sc_envelope = to_run_envelope(
        sc_result,
        run_id=sc_run_id,
        case_id="case-1",
        base_snapshot_id="snapshot-1",
        inputs_inline={"fault_node_id": "node-1"},
        trace_inline={"steps": [{"name": "init"}]},
    )
    sc_index_entry = index_run(
        sc_envelope,
        primary_artifact_type="short_circuit_result",
        primary_artifact_id=sc_run_id,
        base_snapshot_id="snapshot-1",
        case_id="case-1",
        meta={"short_circuit_result": sc_result.to_dict()},
    )
    with uow_factory() as uow:
        if uow.analysis_runs_index.get(sc_index_entry.run_id) is None:
            uow.analysis_runs_index.add(sc_index_entry)
    return sc_run_id


def _find_step(steps: list[dict[str, object]], name: str) -> dict[str, object]:
    for step in steps:
        if step.get("step") == name:
            return step
    raise AssertionError(f"Step {name} not found")


def test_overcurrent_v0_happy_path(uow_factory) -> None:
    sc_run_id = _store_short_circuit_run(uow_factory)
    envelope = run_overcurrent_v0(
        sc_run_id=sc_run_id,
        connection_node={"id": "BoundaryNode-1", "voltage_kv": 15.0, "rated_current_a": 250.0},
        topology_ref=None,
        uow_factory=uow_factory,
    )

    assert envelope.analysis_type == "protection.overcurrent.v0"
    assert envelope.trace is not None
    steps = envelope.trace.inline["steps"]
    settings_step = _find_step(steps, "compute_settings")
    report_step = _find_step(steps, "build_report")
    settings = settings_step["settings"]
    report = report_step["report"]

    # Nastawy fazowe: mamy prąd znamionowy pola i bieg zwarciowy 3F (gałąź
    # minimalna, c = 0,95), więc obie dają się wyznaczyć z DANYCH.
    assert settings["i_pickup_51_a"] > 0
    assert settings["i_inst_50_a"] > settings["i_pickup_51_a"]
    # Nastawy ziemnozwarciowe: fixtura niesie WYŁĄCZNIE bieg 3F, więc prądu
    # zwarcia doziemnego nie ma i 51N/50N są NIEDOSTĘPNE (V12K-189). Wcześniej
    # podstawiano tu nastawę fazową przemnożoną przez k_ef — mieszanie dwóch
    # różnych wielkości; teraz brak jest jawny i wskazany kodem gotowości.
    assert settings["i_pickup_51n_a"] is None
    assert settings["i_inst_50n_a"] is None
    assert settings["is_complete"] is False
    assert "protection.fault_current_missing" in settings["readiness_codes"]
    assert report["inputs"]["connection_node"]["id"] == "BoundaryNode-1"
    assert "fingerprint" in report

    with uow_factory() as uow:
        stored = uow.analysis_runs_index.get(envelope.run_id)
    assert stored is not None
    assert stored.status in {"SUCCEEDED", "DEGRADED"}


def test_overcurrent_v0_is_deterministic(uow_factory) -> None:
    sc_run_id = _store_short_circuit_run(uow_factory)
    envelope1 = run_overcurrent_v0(
        sc_run_id=sc_run_id,
        connection_node={"id": "BoundaryNode-1", "voltage_kv": 15.0, "rated_current_a": 250.0},
        topology_ref=None,
        uow_factory=uow_factory,
    )
    envelope2 = run_overcurrent_v0(
        sc_run_id=sc_run_id,
        connection_node={"id": "BoundaryNode-1", "voltage_kv": 15.0, "rated_current_a": 250.0},
        topology_ref=None,
        uow_factory=uow_factory,
    )

    assert envelope1.fingerprint == envelope2.fingerprint
    assert envelope1.run_id == envelope2.run_id
    report1 = _find_step(envelope1.trace.inline["steps"], "build_report")["report"]
    report2 = _find_step(envelope2.trace.inline["steps"], "build_report")["report"]
    assert report1["fingerprint"] == report2["fingerprint"]
    assert_deterministic(
        envelope1.to_dict(),
        envelope2.to_dict(),
        scrub_keys=("created_at_utc",),
    )


def test_overcurrent_v0_settings_unavailable_without_input_data(uow_factory) -> None:
    """Brak danych ⇒ nastawa NIEDOSTĘPNA + kod gotowości, nigdy liczba domyślna.

    V12K-189 (decyzja właściciela: „nastawa bez danych powinna być niedostępna").
    Wcześniej brak prądu znamionowego dawał nastawę 100,0 A, a brak prądu
    zwarciowego mnożnik 5× nastawy rozruchowej — obie oznaczone ostrzeżeniem
    `fallback_*`, ale bez ŻADNEJ podstawy w danych projektu. W raporcie wyglądały
    jak wynik obliczeń, więc projektant mógł nastawić przekaźnik na wartość
    wziętą z powietrza. Test pilnuje, że takich liczb NIE MA.
    """
    sc_run_id = _store_short_circuit_run(uow_factory)
    envelope = run_overcurrent_v0(
        sc_run_id=sc_run_id,
        connection_node={"id": "BoundaryNode-1", "voltage_kv": 15.0},  # bez prądu znamionowego
        topology_ref=None,
        uow_factory=uow_factory,
    )

    settings_step = _find_step(envelope.trace.inline["steps"], "compute_settings")
    warnings = settings_step["warnings"]
    assert "unavailable_pickup_51_a_missing_nominal_current" in warnings
    assert "unavailable_pickup_51n_a_missing_ik_min_1ph" in warnings

    settings = settings_step["settings"]
    # Nastawy niewyznaczalne — jawnie puste, bez wartości zastępczych.
    assert settings["i_pickup_51_a"] is None  # brak prądu znamionowego pola
    assert settings["i_pickup_51n_a"] is None  # brak biegu zwarciowego 1F
    assert settings["i_inst_50n_a"] is None
    assert settings["is_complete"] is False
    # Żaden ślad po dawnych liczbach z powietrza (100 A oraz 5× pickup).
    assert 100.0 not in {
        settings[key] for key in ("i_pickup_51_a", "i_inst_50_a", "i_pickup_51n_a", "i_inst_50n_a")
    }
    # Powód niedostępności niesie kanoniczny kod gotowości z akcją naprawczą.
    assert "protection.nominal_current_missing" in settings["readiness_codes"]
    assert "protection.fault_current_missing" in settings["readiness_codes"]
    # Krzywa bez nastawy rozruchowej nie istnieje — brak zmyślonych czasów.
    assert settings["computed_points"]["phase"]["pickup_a"] is None
    assert settings["computed_points"]["phase"]["t_2x_s"] is None

    with uow_factory() as uow:
        stored = uow.analysis_runs_index.get(envelope.run_id)
    assert stored is not None
    assert stored.status == "DEGRADED"


def test_readiness_codes_are_canonical() -> None:
    """Kody gotowości muszą istnieć w kanonicznym rejestrze (z nawigacją naprawczą)."""
    from application.analyses.protection.overcurrent.calculator import (
        READINESS_FAULT_CURRENT_MISSING,
        READINESS_NOMINAL_CURRENT_MISSING,
    )
    from domain.canonical_operations import READINESS_CODES

    for code in (READINESS_NOMINAL_CURRENT_MISSING, READINESS_FAULT_CURRENT_MISSING):
        assert code in READINESS_CODES, f"kod {code} spoza kanonicznego rejestru"
        assert READINESS_CODES[code].fix_navigation
