"""Testy serwisu aplikacyjnego sanity-bounds Ik'' per węzeł oraz rozpływu — D2/W3-G2.

Zakres zwarciowy (``build_sanity_bounds_view``): mapowanie wejść (Ik'' z wyniku
zwarciowego, napięcie znamionowe ze snapshotu grafu), pasma napięciowe
(nN/SN/WN/NN), absurdalne Ik'' → „poza zakresem wiarygodności" + blokada pakietu
OSD, dane niepełne → uczciwy status „dane niekompletne" bez wyjątków,
determinizm oraz błędy rodzaju/statusu przebiegu.

Zakres rozpływu (``build_power_flow_sanity_bounds_view``, karta W3-G2): pasma
napięć szyn (Un ± 10 %), obciążeń gałęzi (In katalogu) i strat czynnych sieci —
testy jako ILOCZYN CECH {napięcie w paśmie / poza} × {In katalogu obecne / brak}
× {straty ≤ / >} × {bieg zbieżny / niezbieżny}, każda oś wobec WIARYGODNEGO
przypadku bazowego (golden PF run) — dowodzi też, że osie są NIEZALEŻNE
(zmiana jednej nie zmienia werdyktu pozostałych, reguła KLASA NIE INSTANCJA
„predykaty parami").
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from application.analyses.sanity_bounds import (
    build_power_flow_sanity_bounds_view,
    build_sanity_bounds_view,
)
from enm.canonical_analysis import (
    CanonicalRun,
    create_run,
    execute_run,
    reset_canonical_runs,
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


def _sc_run(
    *,
    sc_rows: list[dict],
    graph_nodes: dict[str, dict],
    status: str = "FINISHED",
    analysis_type: str = "short_circuit_sn",
) -> CanonicalRun:
    """Zbuduj przebieg zwarciowy z kontrolowanym wynikiem i grafem."""
    return CanonicalRun(
        id=uuid4(),
        case_id="case-1",
        project_id="proj-1",
        analysis_type=analysis_type,
        status=status,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash",
        input_hash="in-hash",
        snapshot={"header": {"name": "Projekt"}},
        validation={},
        readiness={},
        raw_result={"results": sc_rows, "graph": {"nodes": graph_nodes}},
    )


def _node(element_id: str, name: str, voltage_level: float) -> dict:
    return {"element_id": element_id, "name": name, "voltage_level": voltage_level}


# --------------------------------------------------------------------------
# Mapowanie i statusy wiarygodności
# --------------------------------------------------------------------------


def test_credible_ikss_within_sn_band() -> None:
    run = _sc_run(
        sc_rows=[{"fault_node_id": "n1", "ikss_a": 8000.0}],  # 8 kA
        graph_nodes={"n1": _node("bus_sn", "Szyna SN", 15.0)},
    )
    view = build_sanity_bounds_view(run)
    assert len(view["items"]) == 1
    item = view["items"][0]
    assert item["target_id"] == "n1"
    assert item["element_id"] == "bus_sn"
    assert item["voltage_band"] == "SN"
    assert item["ikss_ka"] == pytest.approx(8.0)
    assert item["status"] == "zweryfikowany"
    assert item["in_range"] is True
    assert item["blocks_osd_package"] is False


def test_absurd_ikss_out_of_range_blocks_osd() -> None:
    # 116 kA na SN 15 kV — powyżej górnej granicy 50 kA → poza zakresem.
    run = _sc_run(
        sc_rows=[{"fault_node_id": "n1", "ikss_a": 116000.0}],
        graph_nodes={"n1": _node("bus_sn", "Szyna SN", 15.0)},
    )
    item = build_sanity_bounds_view(run)["items"][0]
    assert item["status"] == "poza zakresem wiarygodności"
    assert item["in_range"] is False
    assert item["blocks_osd_package"] is True


def test_voltage_bands_assigned_per_level() -> None:
    run = _sc_run(
        sc_rows=[
            {"fault_node_id": "nn", "ikss_a": 20000.0},
            {"fault_node_id": "sn", "ikss_a": 8000.0},
            {"fault_node_id": "wn", "ikss_a": 14000.0},
            {"fault_node_id": "nnn", "ikss_a": 30000.0},
        ],
        graph_nodes={
            "nn": _node("b_nn", "nN", 0.4),
            "sn": _node("b_sn", "SN", 15.0),
            "wn": _node("b_wn", "WN", 110.0),
            "nnn": _node("b_nnn", "NN", 400.0),
        },
    )
    bands = {
        item["target_id"]: item["voltage_band"] for item in build_sanity_bounds_view(run)["items"]
    }
    assert bands == {"nn": "nN", "sn": "SN", "wn": "WN", "nnn": "NN"}


def test_incomplete_when_missing_voltage() -> None:
    run = _sc_run(
        sc_rows=[{"fault_node_id": "n1", "ikss_a": 8000.0}],
        graph_nodes={"n1": {"element_id": "b1", "name": "B1"}},  # brak voltage_level
    )
    item = build_sanity_bounds_view(run)["items"][0]
    assert item["status"] == "dane niekompletne"
    assert item["voltage_band"] is None
    assert item["blocks_osd_package"] is False


def test_incomplete_when_missing_ikss() -> None:
    run = _sc_run(
        sc_rows=[{"fault_node_id": "n1"}],  # brak ikss_a
        graph_nodes={"n1": _node("b1", "B1", 15.0)},
    )
    item = build_sanity_bounds_view(run)["items"][0]
    assert item["ikss_ka"] is None
    assert item["status"] == "dane niekompletne"


def test_summary_counts() -> None:
    run = _sc_run(
        sc_rows=[
            {"fault_node_id": "ok", "ikss_a": 8000.0},
            {"fault_node_id": "bad", "ikss_a": 116000.0},
            {"fault_node_id": "incomplete", "ikss_a": 8000.0},
        ],
        graph_nodes={
            "ok": _node("b_ok", "OK", 15.0),
            "bad": _node("b_bad", "BAD", 15.0),
            "incomplete": {"element_id": "b_inc", "name": "INC"},  # brak napięcia
        },
    )
    summary = build_sanity_bounds_view(run)["summary"]
    assert summary["credible_count"] == 1
    assert summary["out_of_range_count"] == 1
    assert summary["incomplete_count"] == 1
    assert summary["blocks_osd_package_count"] == 1


def test_view_is_deterministic() -> None:
    run = _sc_run(
        sc_rows=[{"fault_node_id": "n1", "ikss_a": 8000.0}],
        graph_nodes={"n1": _node("b1", "B1", 15.0)},
    )
    assert build_sanity_bounds_view(run) == build_sanity_bounds_view(run)


# --------------------------------------------------------------------------
# Błędy rodzaju/statusu przebiegu
# --------------------------------------------------------------------------


def test_rejects_non_short_circuit_run() -> None:
    run = _sc_run(sc_rows=[], graph_nodes={}, analysis_type="PF")
    with pytest.raises(ValueError, match="przebiegu zwarciowego"):
        build_sanity_bounds_view(run)


def test_rejects_unfinished_run() -> None:
    run = _sc_run(sc_rows=[], graph_nodes={}, status="RUNNING")
    with pytest.raises(ValueError, match="nie jest zakończony"):
        build_sanity_bounds_view(run)


# --------------------------------------------------------------------------
# Realny przebieg (golden network)
# --------------------------------------------------------------------------


def test_real_short_circuit_run_produces_verdicts() -> None:
    set_enm("c1", build_golden_enm())
    run = execute_run(
        create_run(case_id="c1", klucz_twin="c1", analysis_type="short_circuit_sn").id
    )
    assert run.status == "FINISHED", run.error_message

    view = build_sanity_bounds_view(run)
    assert view["analysis_id"] == str(run.id)
    assert len(view["items"]) >= 5
    statuses = {item["status"] for item in view["items"]}
    # RE-BASELINE (V12K-184). Wcześniej ten test utrwalał DEFEKT: węzeł zasilający
    # był uziemiany admitancją idealną, co zwierało impedancję sieci Z_Q i dawało
    # absurdalny Ik'' — a test asertował, że taki węzeł MUSI wyjść „poza zakresem
    # wiarygodności". Po naprawie (zasilanie systemowe = SEM za Z_Q, bocznik
    # Y_Q = 1/Z_Q) wszystkie węzły sieci wzorcowej mieszczą się w granicach
    # wiarygodności, więc pakiet OSD nie jest blokowany. Ścieżkę werdyktu
    # „poza zakresem" pokrywa test syntetyczny (116 kA na SN 15 kV) wyżej.
    assert statuses == {"zweryfikowany"}
    assert view["summary"]["blocks_osd_package_count"] == 0


# --------------------------------------------------------------------------
# Rozpływ — pasma zdrowego rozsądku (karta W3-G2)
# --------------------------------------------------------------------------


def _pf_run() -> CanonicalRun:
    set_enm("c-pf-sanity", build_golden_enm())
    return execute_run(
        create_run(case_id="c-pf-sanity", klucz_twin="c-pf-sanity", analysis_type="PF").id
    )


def _synthetic_pf_run(
    *,
    snapshot: dict,
    raw_result: dict | None,
    status: str = "FINISHED",
) -> CanonicalRun:
    """Przebieg PF z KONTROLOWANYM snapshotem/wynikiem (bazuje na realnym golden run)."""
    return CanonicalRun(
        id=uuid4(),
        case_id="case-1",
        project_id="proj-1",
        analysis_type="PF",
        status=status,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash",
        input_hash="in-hash",
        snapshot=snapshot,
        validation={},
        readiness={},
        raw_result=raw_result,
    )


def test_pf_real_run_all_dimensions_credible() -> None:
    """Bieg zbieżny, siec wzorcowa: napięcia/obciążenia/straty w pasmach."""
    run = _pf_run()
    assert run.status == "FINISHED", run.error_message

    view = build_power_flow_sanity_bounds_view(run)
    assert view["analysis_id"] == str(run.id)
    assert view["converged"] is True
    assert len(view["napiecia"]["items"]) >= 5
    assert {item["status"] for item in view["napiecia"]["items"]} == {"zweryfikowany"}
    assert view["napiecia"]["summary"] == {
        "credible_count": len(view["napiecia"]["items"]),
        "out_of_range_count": 0,
        "incomplete_count": 0,
    }
    assert view["napiecia"]["band_pct"] == 10.0
    assert "PN-EN 50160" in view["napiecia"]["norm_ref"]
    assert len(view["obciazenia"]["items"]) >= 1
    assert {item["status"] for item in view["obciazenia"]["items"]} == {"zweryfikowany"}
    assert view["straty"]["status"] == "zweryfikowany"
    assert view["straty"]["threshold_pct"] == 10.0
    assert view["straty"]["threshold_why_pl"]  # uzasadnienie progu nienazwane pustym


def test_pf_view_is_deterministic() -> None:
    run = _pf_run()
    assert build_power_flow_sanity_bounds_view(run) == build_power_flow_sanity_bounds_view(run)


def test_pf_voltage_out_of_range_is_isolated_to_that_bus() -> None:
    """Oś 1: napięcie poza pasmem — TYLKO ta szyna, reszta osi bez zmian
    (dowód niezależności predykatów, KLASA NIE INSTANCJA)."""
    run = _pf_run()
    node_id = next(iter(run.raw_result["node_voltage_kv"]))
    modified = dict(run.raw_result)
    modified["node_voltage_kv"] = dict(run.raw_result["node_voltage_kv"])
    modified["node_voltage_kv"][node_id] = 999.0
    run2 = _synthetic_pf_run(snapshot=run.snapshot, raw_result=modified)

    view = build_power_flow_sanity_bounds_view(run2)
    item = next(i for i in view["napiecia"]["items"] if i["target_id"] == node_id)
    assert item["status"] == "poza zakresem wiarygodności"
    assert item["actual_kv"] == 999.0
    assert item["in_range"] is False
    assert "wątpliwy" in item["why_pl"]
    assert view["napiecia"]["summary"]["out_of_range_count"] == 1

    inne = [i for i in view["napiecia"]["items"] if i["target_id"] != node_id]
    assert all(i["status"] == "zweryfikowany" for i in inne), "reszta szyn nietknięta"
    assert view["obciazenia"]["items"] and all(
        i["status"] == "zweryfikowany" for i in view["obciazenia"]["items"]
    ), "obciążenia gałęzi nietknięte przez zmianę napięcia jednej szyny"
    assert view["straty"]["status"] == "zweryfikowany", "straty nietknięte"


def test_pf_branch_missing_catalog_current_is_incomplete_not_zero_or_inf() -> None:
    """Oś 2: brak In katalogu — „dane niekompletne", NIGDY podstawienie 0/inf
    (solver_input_substitute_guard). Reszta osi (napięcia, straty) bez zmian."""
    run = _pf_run()
    branch_name = run.snapshot["branches"][0]["name"]
    mutated_branches = [dict(b) for b in run.snapshot["branches"]]
    mutated_branches[0] = dict(mutated_branches[0])
    mutated_branches[0]["rating"] = None
    mutated_snapshot = dict(run.snapshot)
    mutated_snapshot["branches"] = mutated_branches
    run2 = _synthetic_pf_run(snapshot=mutated_snapshot, raw_result=run.raw_result)

    view = build_power_flow_sanity_bounds_view(run2)
    item = next(i for i in view["obciazenia"]["items"] if i["target_name"] == branch_name)
    assert item["status"] == "dane niekompletne"
    assert item["rated_current_a"] in (None, 0.0)
    assert item["loading_pct"] is None
    assert "katalog" in item["why_pl"]
    assert item["current_ka"] is not None, "prąd ZNANY z wyniku PF — brakuje wyłącznie In"

    inne = [i for i in view["obciazenia"]["items"] if i["target_name"] != branch_name]
    assert all(i["status"] == "zweryfikowany" for i in inne), "reszta gałęzi nietknięta"
    assert {i["status"] for i in view["napiecia"]["items"]} == {
        "zweryfikowany"
    }, "napięcia nietknięte"
    assert view["straty"]["status"] == "zweryfikowany", "straty nietknięte"


def test_pf_losses_out_of_range_is_isolated() -> None:
    """Oś 3: straty > próg — TYLKO pozycja strat, napięcia/obciążenia bez zmian."""
    run = _pf_run()
    modified_result_v1 = dict(run.raw_result["result_v1"])
    modified_summary = dict(modified_result_v1["summary"])
    modified_summary["total_losses_p_mw"] = 100.0  # absurdalnie wysokie wobec obciążeń sieci
    modified_result_v1["summary"] = modified_summary
    modified = dict(run.raw_result)
    modified["result_v1"] = modified_result_v1
    run2 = _synthetic_pf_run(snapshot=run.snapshot, raw_result=modified)

    view = build_power_flow_sanity_bounds_view(run2)
    assert view["straty"]["status"] == "poza zakresem wiarygodności"
    assert view["straty"]["losses_active_mw"] == 100.0
    assert view["straty"]["losses_pct_of_load"] > 10.0
    assert "wątpliwy" in view["straty"]["why_pl"]

    assert {i["status"] for i in view["napiecia"]["items"]} == {
        "zweryfikowany"
    }, "napięcia nietknięte"
    assert {i["status"] for i in view["obciazenia"]["items"]} == {
        "zweryfikowany"
    }, "obciążenia nietknięte"


def test_pf_losses_missing_is_incomplete() -> None:
    run = _pf_run()
    modified_result_v1 = dict(run.raw_result["result_v1"])
    modified_summary = dict(modified_result_v1["summary"])
    del modified_summary["total_losses_p_mw"]
    modified_result_v1["summary"] = modified_summary
    modified = dict(run.raw_result)
    modified["result_v1"] = modified_result_v1
    run2 = _synthetic_pf_run(snapshot=run.snapshot, raw_result=modified)

    view = build_power_flow_sanity_bounds_view(run2)
    assert view["straty"]["status"] == "dane niekompletne"
    assert view["straty"]["losses_active_mw"] is None
    assert view["straty"]["losses_pct_of_load"] is None


def test_pf_load_total_unknown_when_any_bus_p_injected_missing() -> None:
    """ZERO FABRYKACJI: brak ``p_injected_mw`` na JEDNEJ szynie → suma mocy
    czynnej odbiorów NIEZNANA (None), NIGDY suma częściowa (częściowa suma
    zaniżałaby odbiory i dawała fałszywie niski budżet strat)."""
    run = _pf_run()
    modified_result_v1 = dict(run.raw_result["result_v1"])
    bus_results = [dict(b) for b in modified_result_v1["bus_results"]]
    assert bus_results, "golden PF run musi mieć przynajmniej jedną szynę"
    del bus_results[0]["p_injected_mw"]
    modified_result_v1["bus_results"] = bus_results
    modified = dict(run.raw_result)
    modified["result_v1"] = modified_result_v1
    run2 = _synthetic_pf_run(snapshot=run.snapshot, raw_result=modified)

    view = build_power_flow_sanity_bounds_view(run2)
    assert view["straty"]["status"] == "dane niekompletne"
    assert view["straty"]["load_active_total_mw"] is None


def test_pf_not_converged_marks_everything_incomplete_never_fabricated_verdict() -> None:
    """Oś 4: bieg NIEZBIEŻNY → WSZYSTKIE pozycje „dane niekompletne" z nazwanym
    powodem — nigdy fabrykowany werdykt z niewiarygodnych danych. Un/In (dane
    modelu/katalogu) zostają widoczne — tylko WYNIK solvera jest nieznany."""
    run = _pf_run()
    modified_result_v1 = dict(run.raw_result["result_v1"])
    modified_result_v1["converged"] = False
    modified = dict(run.raw_result)
    modified["result_v1"] = modified_result_v1
    run2 = _synthetic_pf_run(snapshot=run.snapshot, raw_result=modified)

    view = build_power_flow_sanity_bounds_view(run2)
    assert view["converged"] is False
    assert view["napiecia"]["items"], "sekcja napięć niepusta mimo niezbieżności"
    for item in view["napiecia"]["items"]:
        assert item["status"] == "dane niekompletne"
        assert item["actual_kv"] is None
        assert item["nominal_kv"] is not None, "Un jest daną modelu — zostaje widoczna"
        assert "zbieżności" in item["why_pl"]
    assert view["obciazenia"]["items"], "sekcja obciążeń niepusta mimo niezbieżności"
    for item in view["obciazenia"]["items"]:
        assert item["status"] == "dane niekompletne"
        assert item["current_ka"] is None
        assert "zbieżności" in item["why_pl"]
    assert view["straty"]["status"] == "dane niekompletne"
    assert "zbieżności" in view["straty"]["why_pl"]
    assert view["napiecia"]["summary"] == {
        "credible_count": 0,
        "out_of_range_count": 0,
        "incomplete_count": len(view["napiecia"]["items"]),
    }


def test_pf_view_rejects_short_circuit_run() -> None:
    run = _sc_run(sc_rows=[], graph_nodes={})  # analysis_type domyślnie short_circuit_sn
    with pytest.raises(ValueError, match="przebiegu rozpływu mocy"):
        build_power_flow_sanity_bounds_view(run)


def test_pf_view_rejects_unfinished_run() -> None:
    run = _pf_run()
    run.status = "RUNNING"
    with pytest.raises(ValueError, match="nie jest zakończony"):
        build_power_flow_sanity_bounds_view(run)
