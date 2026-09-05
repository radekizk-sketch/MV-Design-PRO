"""Testy serwisu aplikacyjnego sanity-bounds Ik'' per węzeł — D2.

Zakres: mapowanie wejść (Ik'' z wyniku zwarciowego, napięcie znamionowe ze
snapshotu grafu), pasma napięciowe (nN/SN/WN/NN), absurdalne Ik'' → „poza
zakresem wiarygodności" + blokada pakietu OSD, dane niepełne → uczciwy status
„dane niekompletne" bez wyjątków, determinizm oraz błędy rodzaju/statusu
przebiegu.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from application.analyses.sanity_bounds import build_sanity_bounds_view
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
