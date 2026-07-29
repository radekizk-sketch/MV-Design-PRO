"""Testy serwisu oceny migotania (Pst/Plt) i szybkich zmian napięcia — D11.

Zakres: emisja pojedynczego źródła (rachunek ręczny), prawo sumowania m=3
(rachunek ręczny), moduł bez współczynnika/mocy pominięty z INFO, węzeł bez
Sk'' bez oceny, przekroczenie poziomu planowania (werdykt PL), szybka zmiana
napięcia d(%) (rachunek ręczny), determinizm z input_hash, błędy rodzaju/statusu
przebiegu, rozwiązanie współczynnika z katalogu, wykluczenie generatora
synchronicznego oraz walidacja katalogowa flicker_c.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from application.analyses.migotanie import build_migotanie_view
from enm.canonical_analysis import CanonicalRun
from network_model.catalog.types import ConverterKind, ConverterType


def _sc_run(
    *,
    generators: list[dict],
    buses: list[dict],
    sc_rows: list[dict],
    graph_nodes: dict[str, dict],
    status: str = "FINISHED",
    analysis_type: str = "short_circuit_sn",
) -> CanonicalRun:
    return CanonicalRun(
        id=uuid4(),
        case_id="case-1",
        project_id="proj-1",
        analysis_type=analysis_type,
        status=status,
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash",
        input_hash="in-hash",
        snapshot={"header": {"name": "Projekt"}, "buses": buses, "generators": generators},
        validation={},
        readiness={},
        raw_result={"results": sc_rows, "graph": {"nodes": graph_nodes}},
    )


def _bus(ref_id: str, kv: float = 15.0) -> dict:
    return {"ref_id": ref_id, "voltage_kv": kv}


def _ibg(
    ref_id: str,
    bus_ref: str,
    *,
    sn_mva: float | None = None,
    flicker_c: float | None = None,
    gen_type: str = "pv_inverter",
    catalog_ref: str | None = None,
) -> dict:
    gen: dict = {"ref_id": ref_id, "bus_ref": bus_ref, "gen_type": gen_type, "q_mvar": 0.0}
    materialized: dict = {}
    if sn_mva is not None:
        materialized["sn_mva"] = sn_mva
    if flicker_c is not None:
        materialized["flicker_c"] = flicker_c
    if materialized:
        gen["materialized_params"] = materialized
    if catalog_ref is not None:
        gen["catalog_ref"] = catalog_ref
    return gen


# --------------------------------------------------------------------------
# Emisja pojedynczego źródła i sumowanie
# --------------------------------------------------------------------------


def test_single_module_pst_equals_c_times_sn_over_sk() -> None:
    # Rachunek ręczny: Pst_i = c · Sn / Sk'' = 0.3 · 2.0 / 100.0 = 0.006.
    run = _sc_run(
        generators=[_ibg("g1", "b1", sn_mva=2.0, flicker_c=0.3)],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_migotanie_view(run)
    entry = view["buses"][0]
    assert entry["bus_ref"] == "b1"
    assert entry["sk_mva"] == 100.0
    module = entry["modules"][0]
    assert module["included"] is True
    assert module["pst_i"] == 0.006
    # Jeden moduł: Pst = (0.006^3)^(1/3) = 0.006; Plt = Pst.
    assert entry["pst"] == 0.006
    assert entry["plt"] == 0.006
    assert entry["verdict_pl"] == "w granicach planowania"
    assert module["white_box"]


def test_two_modules_summation_law_m3() -> None:
    # Pst_1 = 0.3·2/100 = 0.006; Pst_2 = 0.5·3/100 = 0.015.
    # Prawo sumowania m=3: Pst = (0.006^3 + 0.015^3)^(1/3).
    expected = round((0.006**3 + 0.015**3) ** (1.0 / 3.0), 6)
    run = _sc_run(
        generators=[
            _ibg("g1", "b1", sn_mva=2.0, flicker_c=0.3),
            _ibg("g2", "b1", sn_mva=3.0, flicker_c=0.5, gen_type="bess"),
        ],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_migotanie_view(run)
    entry = view["buses"][0]
    assert {m["gen_ref"] for m in entry["modules"]} == {"g1", "g2"}
    assert entry["pst"] == expected
    assert entry["plt"] == expected


def test_n_parallel_doubles_sn_pst_and_rvc() -> None:
    # n_parallel=2 → Sn modułu = 2.0 × 2 = 4.0. Pst_i = 0.3 · 4 / 100 = 0.012
    # (podwojenie względem pojedynczej jednostki 0.006); d = 1 · 4 / 100 · 100 = 4.0 %.
    gen = _ibg("g1", "b1", sn_mva=2.0, flicker_c=0.3)
    gen["n_parallel"] = 2
    run = _sc_run(
        generators=[gen],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    entry = build_migotanie_view(run)["buses"][0]
    module = entry["modules"][0]
    assert module["sn_mva"] == 4.0
    assert module["pst_i"] == 0.012
    assert entry["pst"] == 0.012
    assert entry["d_percent"] == 4.0


def test_module_without_flicker_coefficient_is_skipped_with_info() -> None:
    run = _sc_run(
        generators=[_ibg("g1", "b1", sn_mva=2.0)],  # brak flicker_c
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_migotanie_view(run)
    entry = view["buses"][0]
    module = entry["modules"][0]
    assert module["included"] is False
    assert module["pst_i"] is None
    assert "brak współczynnika" in module["info_pl"]
    assert entry["pst"] is None
    assert entry["verdict_pl"] == "ocena niemożliwa — brak współczynnika/limitu"


def test_bus_without_short_circuit_power_is_not_assessable() -> None:
    # IBG na b2, wynik zwarciowy nie obejmuje b2 → Sk'' = None → brak oceny.
    run = _sc_run(
        generators=[_ibg("g1", "b2", sn_mva=2.0, flicker_c=0.3)],
        buses=[_bus("b2")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_migotanie_view(run)
    entry = view["buses"][0]
    assert entry["sk_mva"] is None
    assert entry["pst"] is None
    assert entry["d_percent"] is None
    assert entry["verdict_pl"] == "ocena niemożliwa — brak współczynnika/limitu"
    assert "brak mocy zwarciowej" in entry["modules"][0]["info_pl"]


def test_exceeded_planning_level_yields_exceeded_verdict() -> None:
    # Pst_i = 2.0 · 50 / 100 = 1.0 > 0.9 (poziom planowania SN) → przekroczenie.
    run = _sc_run(
        generators=[_ibg("g1", "b1", sn_mva=50.0, flicker_c=2.0)],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_migotanie_view(run)
    entry = view["buses"][0]
    assert entry["pst"] == 1.0
    assert entry["verdict_pl"] == "przekroczenie poziomu planowania"
    assert view["summary"]["exceeded_count"] == 1


def test_rapid_voltage_change_hand_calculation() -> None:
    # d = kmax · Sn / Sk'' · 100 = 1 · 5 / 100 · 100 = 5.0 % (Sn = 2 + 3).
    run = _sc_run(
        generators=[
            _ibg("g1", "b1", sn_mva=2.0, flicker_c=0.3),
            _ibg("g2", "b1", sn_mva=3.0, flicker_c=0.3),
        ],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_migotanie_view(run)
    assert view["buses"][0]["d_percent"] == 5.0


def test_rapid_voltage_change_independent_of_missing_coefficient() -> None:
    # Moduł bez c nie liczy Pst, ale wnosi Sn do szybkiej zmiany napięcia d(%).
    run = _sc_run(
        generators=[_ibg("g1", "b1", sn_mva=4.0)],  # brak flicker_c
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 200.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_migotanie_view(run)
    entry = view["buses"][0]
    assert entry["pst"] is None
    assert entry["d_percent"] == 2.0  # 1 · 4 / 200 · 100


# --------------------------------------------------------------------------
# Rozwiązanie z katalogu, wykluczenia
# --------------------------------------------------------------------------


def test_flicker_coefficient_resolved_from_converter_catalog() -> None:
    # Bez materialized → c i Sn z katalogu (conv-pv-card-huawei-sun2000-215ktl:
    # flicker_c=0.30, sn_mva=0.215). Pst_i = 0.30 · 0.215 / 100.
    expected = round(0.30 * 0.215 / 100.0, 6)
    run = _sc_run(
        generators=[_ibg("g1", "b1", catalog_ref="conv-pv-card-huawei-sun2000-215ktl")],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_migotanie_view(run)
    module = view["buses"][0]["modules"][0]
    assert module["flicker_c"] == 0.3
    assert module["sn_mva"] == 0.215
    assert module["pst_i"] == expected


def test_synchronous_generator_excluded() -> None:
    run = _sc_run(
        generators=[_ibg("g1", "b1", sn_mva=5.0, flicker_c=0.3, gen_type="synchronous")],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_migotanie_view(run)
    assert view["buses"] == []


def test_mixed_modules_partial_assessment() -> None:
    # g1 ma c (liczony), g2 bez c (pominięty) — Pst z samego g1.
    run = _sc_run(
        generators=[
            _ibg("g1", "b1", sn_mva=2.0, flicker_c=0.3),
            _ibg("g2", "b1", sn_mva=3.0),
        ],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    view = build_migotanie_view(run)
    entry = view["buses"][0]
    included = {m["gen_ref"]: m["included"] for m in entry["modules"]}
    assert included == {"g1": True, "g2": False}
    assert entry["pst"] == 0.006


# --------------------------------------------------------------------------
# Determinizm i błędy
# --------------------------------------------------------------------------


def test_view_is_deterministic_with_input_hash() -> None:
    run = _sc_run(
        generators=[_ibg("g1", "b1", sn_mva=2.0, flicker_c=0.3)],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    first = build_migotanie_view(run)
    second = build_migotanie_view(run)
    assert first == second
    assert len(first["input_hash"]) == 64
    assert int(first["input_hash"], 16) >= 0  # poprawny hex SHA-256


def test_white_box_contains_summation_plt_and_rvc_steps() -> None:
    run = _sc_run(
        generators=[_ibg("g1", "b1", sn_mva=2.0, flicker_c=0.3)],
        buses=[_bus("b1")],
        sc_rows=[{"fault_node_id": "n1", "sk_mva": 100.0}],
        graph_nodes={"n1": {"element_id": "b1"}},
    )
    entry = build_migotanie_view(run)["buses"][0]
    symbols = [step["symbol"] for step in entry["white_box"]]
    assert "P_{st}" in symbols and "P_{lt}" in symbols and "d" in symbols
    for step in entry["white_box"]:
        assert step["formula_latex"] and step["substitution_pl"] and step["result_pl"]
    assert entry["zalozenia_pl"]


def test_rejects_non_short_circuit_run() -> None:
    run = _sc_run(generators=[], buses=[], sc_rows=[], graph_nodes={}, analysis_type="PF")
    with pytest.raises(ValueError, match="przebiegu zwarciowego"):
        build_migotanie_view(run)


def test_rejects_unfinished_run() -> None:
    run = _sc_run(generators=[], buses=[], sc_rows=[], graph_nodes={}, status="RUNNING")
    with pytest.raises(ValueError, match="nie jest zakończony"):
        build_migotanie_view(run)


# --------------------------------------------------------------------------
# Katalog: pole flicker_c (addytywne)
# --------------------------------------------------------------------------


def test_catalog_flicker_c_must_be_positive() -> None:
    with pytest.raises(ValueError, match="flicker_c musi byc > 0"):
        ConverterType(
            id="t1",
            name="t",
            kind=ConverterKind.PV,
            un_kv=0.4,
            sn_mva=1.0,
            pmax_mw=1.0,
            flicker_c=0.0,
        )


def test_catalog_type_without_flicker_c_round_trips() -> None:
    converter = ConverterType(
        id="t2", name="t", kind=ConverterKind.PV, un_kv=0.4, sn_mva=1.0, pmax_mw=1.0
    )
    assert converter.flicker_c is None
    data = converter.to_dict()
    assert "flicker_c" not in data  # brak klucza → bajt-identyczność starych typów
    assert ConverterType.from_dict(data) == converter


def test_catalog_reference_card_exposes_flicker_c() -> None:
    from network_model.catalog.repository import get_default_mv_catalog

    converter = get_default_mv_catalog().get_converter_type("conv-pv-card-huawei-sun2000-215ktl")
    assert converter is not None
    assert converter.flicker_c == 0.30
    assert ConverterType.from_dict(converter.to_dict()) == converter
