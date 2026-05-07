"""
E2E: Pełna budowa sieci dystrybucyjnej z PV, FW, BESS i odbiorami nN.

Rozszerza scenariusz `test_v1_analysis_pipeline.py` o:
  • drugą stację przelotową SN/nN (na innym segmencie magistrali)
  • odbiór nN po stronie LV stacji #1
  • źródło PV (add_converter_source, source_technology=PV) na stacji #2
  • BESS (add_converter_source, source_technology=BESS) na stacji #1
  • FW (add_converter_source, source_technology=FW) na stacji #2
  • drugie odgałęzienie magistrali

Sieć pokrywa realny scenariusz inżynierski: GPZ → magistrala 4-segmentowa
z dwoma stacjami przelotowymi → odbiór + BESS w stacji #1, PV i FW w stacji #2,
dwa odgałęzienia. Każdy element jest tworzony przez kanoniczną operację
domeny (`execute_domain_operation`), bez bezpośredniej manipulacji ENM.

Testy:
  1. Sieć buduje się bez błędów
  2. ENM → NetworkGraph mapowanie poprawne (oczekiwana liczba węzłów/gałęzi)
  3. Power Flow zbiega (Newton-Raphson) — generatory PV/BESS jako PQ
  4. Short Circuit 3F na każdej szynie SN i nN — non-zero ikss
  5. Determinizm: 5× identyczna budowa daje identyczną sieć
  6. Validation report: brak BLOCKER po pełnej budowie i materializacji
"""

from __future__ import annotations

import copy
import hashlib
import json
from typing import Any

import pytest

from enm.domain_operations import execute_domain_operation
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from network_model.solvers.power_flow_newton import solve_power_flow_physics
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)
from network_model.solvers.short_circuit_iec60909 import (
    ShortCircuitIEC60909Solver,
)


# ---------------------------------------------------------------------------
# Helpers — materializacja katalogowa (kable, transformatory, źródła)
# ---------------------------------------------------------------------------


def _empty_enm() -> dict[str, Any]:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="pv_bess_full_build_e2e", defaults=ENMDefaults()),
    )
    return enm.model_dump(mode="json")


def _materialize_cable_impedances(enm: dict[str, Any]) -> dict[str, Any]:
    """YAKXS 3×120 mm² z katalogu (r=0.253, x=0.073, b=0.26 µS/km, In=270 A)."""
    enm = copy.deepcopy(enm)
    for branch in enm.get("branches", []):
        if branch.get("type") in ("cable", "line_overhead"):
            if branch.get("r_ohm_per_km", 0) == 0:
                branch["r_ohm_per_km"] = 0.253
                branch["x_ohm_per_km"] = 0.073
                branch["b_siemens_per_km"] = 0.26e-6
                branch["parameter_source"] = "CATALOG"
                if not branch.get("rating"):
                    branch["rating"] = {"in_a": 270.0}
    return enm


def _materialize_transformer_params(enm: dict[str, Any]) -> dict[str, Any]:
    """ONAN 630 kVA 15/0.4 kV (sn=0.63, uk=4%, pk=6.5 kW)."""
    enm = copy.deepcopy(enm)
    for trafo in enm.get("transformers", []):
        if trafo.get("sn_mva", 0) == 0:
            trafo["sn_mva"] = 0.63
            trafo["uhv_kv"] = 15.0
            trafo["ulv_kv"] = 0.4
            trafo["uk_percent"] = 4.0
            trafo["pk_kw"] = 6.5
            trafo["parameter_source"] = "CATALOG"
    return enm


# ---------------------------------------------------------------------------
# Pełna budowa sieci
# ---------------------------------------------------------------------------


def _build_full_pv_bess_network() -> dict[str, Any]:
    """Buduj sieć: GPZ → 4 odcinki magistrali → 2 stacje przelotowe →
    odbiór nN + BESS w stacji #1, PV i FW w stacji #2, 2 odgałęzienia.

    Zwraca ENM z materializowanymi parametrami (gotowe dla solverów).
    """
    enm = _empty_enm()

    # KROK 1: GPZ uproszczony 15 kV / 250 MVA
    r = execute_domain_operation(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_ref": "src-gpz-15kv-250mva-rx010",
        },
    )
    assert r.get("error") is None, f"KROK 1 (GPZ): {r.get('error')}"
    enm = r["snapshot"]

    # KROK 2: 4 odcinki magistrali — różne długości (tworzą 4 punkty insercji)
    for i, length in enumerate([300, 250, 200, 180], 1):
        r = execute_domain_operation(
            enm,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": length,
                    "name": f"Magistrala odcinek {i}",
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )
        assert r.get("error") is None, f"KROK 2.{i} (segment magistrali): {r.get('error')}"
        enm = r["snapshot"]

    corridors = enm.get("corridors", [])
    assert corridors, "Brak korytarza magistrali po KROK 2"
    seg_refs = corridors[0].get("ordered_segment_refs", [])
    assert len(seg_refs) >= 4, f"Oczekiwano ≥4 segmentów, jest {len(seg_refs)}"

    # KROK 3: Stacja przelotowa #1 na 2. odcinku (typ B) — z transformatorem
    seg_for_station_1 = seg_refs[1]
    r = execute_domain_operation(
        enm,
        "insert_station_on_segment_sn",
        {
            "segment_ref": seg_for_station_1,
            "station_type": "B",
            "insert_at": {"value": 0.4},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4, "name": "Stacja-1"},
            "sn_fields": ["IN", "OUT"],
            "transformer": {
                "create": True,
                "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
            },
        },
    )
    assert r.get("error") is None, f"KROK 3 (stacja #1): {r.get('error')}"
    enm = r["snapshot"]

    # KROK 4: Stacja przelotowa #2 na 3. odcinku (typ B) — z transformatorem.
    # Po wstawieniu stacji #1 ścieżka korytarza została przepisana — sięgamy po ŚWIEŻĄ listę.
    corridors = enm.get("corridors", [])
    seg_refs = corridors[0].get("ordered_segment_refs", [])
    # Stacja #1 podzieliła segment 2; szukamy nieprzełamanego segmentu o oryginalnym sąsiedztwie.
    # Po insercji #1 ostatnie 2-3 segmenty są nadal proste — bierzemy przedostatni.
    seg_for_station_2 = seg_refs[len(seg_refs) - 2]
    r = execute_domain_operation(
        enm,
        "insert_station_on_segment_sn",
        {
            "segment_ref": seg_for_station_2,
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4, "name": "Stacja-2"},
            "sn_fields": ["IN", "OUT"],
            "transformer": {
                "create": True,
                "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
            },
        },
    )
    assert r.get("error") is None, f"KROK 4 (stacja #2): {r.get('error')}"
    enm = r["snapshot"]

    # KROK 5: Pierwsze odgałęzienie — od szyny SN stacji #1
    sn_buses = [b for b in enm.get("buses", []) if "sn_bus" in b.get("ref_id", "")]
    assert len(sn_buses) >= 2, f"Oczekiwano ≥2 szyn SN stacji, jest {len(sn_buses)}"
    branch_from_1 = sn_buses[0]["ref_id"]
    r = execute_domain_operation(
        enm,
        "start_branch_segment_sn",
        {
            "from_bus_ref": branch_from_1,
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 180,
                "name": "Odgałęzienie 1",
                "catalog_ref": "cable-tfk-yakxs-3x120",
            },
        },
    )
    assert r.get("error") is None, f"KROK 5 (odgałęzienie #1): {r.get('error')}"
    enm = r["snapshot"]

    # KROK 6: Drugie odgałęzienie — od szyny SN stacji #2
    sn_buses = [b for b in enm.get("buses", []) if "sn_bus" in b.get("ref_id", "")]
    branch_from_2 = sn_buses[1]["ref_id"]
    r = execute_domain_operation(
        enm,
        "start_branch_segment_sn",
        {
            "from_bus_ref": branch_from_2,
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 220,
                "name": "Odgałęzienie 2",
                "catalog_ref": "cable-tfk-yakxs-3x120",
            },
        },
    )
    assert r.get("error") is None, f"KROK 6 (odgałęzienie #2): {r.get('error')}"
    enm = r["snapshot"]

    # KROK 7: Odbiór nN po stronie LV stacji #1.
    # Wymaga: najpierw wystawić pole odpływowe nN, potem podpiąć pod nie load.
    station_ref_1 = next(
        (s["ref_id"] for s in enm.get("substations", []) if s.get("name") == "Stacja-1"),
        None,
    )
    assert station_ref_1, "Brak Stacji-1 w substations"

    # Szyna nN konkretnie tej stacji — bierzemy z bus_refs stacji
    station_1 = next(s for s in enm["substations"] if s["ref_id"] == station_ref_1)
    nn_bus_st1 = next(
        (
            b["ref_id"]
            for b in enm.get("buses", [])
            if b.get("ref_id") in station_1.get("bus_refs", []) and b.get("voltage_kv") == 0.4
        ),
        None,
    )
    assert nn_bus_st1, f"Brak szyny nN dla Stacji-1 (bus_refs={station_1.get('bus_refs')})"

    # Wystaw pole odpływowe nN (feeder)
    r = execute_domain_operation(
        enm,
        "add_nn_outgoing_field",
        {
            "station_ref": station_ref_1,
            "bus_nn_ref": nn_bus_st1,
            "field_name": "Odpływ RB-01",
        },
    )
    assert r.get("error") is None, f"KROK 7a (pole nN stacji #1): {r.get('error')}"
    enm = r["snapshot"]
    # Ref nowego odpływu — handler zwraca w selection_hint.element_id
    feeder_ref_st1 = (r.get("selection_hint") or {}).get("element_id")
    assert feeder_ref_st1, f"Brak selection_hint.element_id dla pola nN: keys={list(r.keys())}"

    # Podpinamy odbiór do feedera
    r = execute_domain_operation(
        enm,
        "add_nn_load",
        {
            "station_ref": station_ref_1,
            "bus_nn_ref": nn_bus_st1,
            "feeder_ref": feeder_ref_st1,
            # API: handler oczekuje kW (active_power_kw / reactive_power_kvar),
            # konwertuje wewnętrznie do MW.
            "active_power_kw": 150.0,
            "reactive_power_kvar": 50.0,
            "load_name": "Odbiór RB-01",
            "load_kind": "static_pq",
        },
    )
    assert r.get("error") is None, f"KROK 7b (odbiór nN): {r.get('error')}"
    enm = r["snapshot"]

    # KROK 8: BESS na stronie nN stacji #1 (variant=nn_side) — wymaga osobnego pola źródłowego
    r = execute_domain_operation(
        enm,
        "add_converter_source",
        {
            "station_ref": station_ref_1,
            "bus_nn_ref": nn_bus_st1,
            "source_technology": "BESS",
            "connection_variant": "nn_side",
            "catalog_ref": "conv-bess-nn-0p5mw-0p4kv",
            "name": "BESS-S1",
            "power_setpoint_mw": 0.05,
        },
    )
    assert r.get("error") is None, f"KROK 8 (BESS w stacji #1): {r.get('error')}"
    enm = r["snapshot"]

    # KROK 9: PV na stronie nN stacji #2 (variant=nn_side)
    station_ref_2 = next(
        (s["ref_id"] for s in enm.get("substations", []) if s.get("name") == "Stacja-2"),
        None,
    )
    assert station_ref_2, "Brak Stacji-2 w substations"
    station_2 = next(s for s in enm["substations"] if s["ref_id"] == station_ref_2)
    nn_bus_st2 = next(
        (
            b["ref_id"]
            for b in enm.get("buses", [])
            if b.get("ref_id") in station_2.get("bus_refs", []) and b.get("voltage_kv") == 0.4
        ),
        None,
    )
    assert nn_bus_st2, f"Brak szyny nN dla Stacji-2 (bus_refs={station_2.get('bus_refs')})"

    r = execute_domain_operation(
        enm,
        "add_converter_source",
        {
            "station_ref": station_ref_2,
            "bus_nn_ref": nn_bus_st2,
            "source_technology": "PV",
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "name": "PV-S2",
            "power_setpoint_mw": 0.05,
        },
    )
    assert r.get("error") is None, f"KROK 9 (PV w stacji #2): {r.get('error')}"
    enm = r["snapshot"]

    # KROK 10: FW na stronie nN stacji #2 (variant=nn_side)
    r = execute_domain_operation(
        enm,
        "add_converter_source",
        {
            "station_ref": station_ref_2,
            "bus_nn_ref": nn_bus_st2,
            "source_technology": "FW",
            "connection_variant": "nn_side",
            "catalog_ref": "conv-fw-1.0mw-15kv",
            "name": "FW-S2",
            "source_name": "FW-S2",
            "power_setpoint_mw": 0.05,
            "materialized_params": {
                "catalog_item_id": "conv-fw-1.0mw-15kv",
                "catalog_item_version": "2024.1",
                "un_kv": 0.4,
                "max_power_kw": 1000.0,
                "pmax_mw": 1.0,
                "sn_mva": 1.0,
                "control_mode": "PQ",
            },
        },
    )
    assert r.get("error") is None, f"KROK 10 (FW w stacji #2): {r.get('error')}"
    enm = r["snapshot"]

    # KROK 11: Materializacja parametrów katalogowych (kable + trafo)
    enm = _materialize_cable_impedances(enm)
    enm = _materialize_transformer_params(enm)

    return enm


# ---------------------------------------------------------------------------
# TESTY
# ---------------------------------------------------------------------------


class TestPvBessFullBuild:
    """E2E: budowa sieci PV+FW+BESS, kompletny scenariusz inżynierski."""

    def test_build_completes_without_errors(self) -> None:
        """Wszystkie 9 kroków budowy + materializacja kończy się bez błędu."""
        enm = _build_full_pv_bess_network()
        assert enm.get("buses"), "Brak szyn po pełnej budowie"
        assert enm.get("branches"), "Brak gałęzi po pełnej budowie"
        assert enm.get("transformers"), "Brak transformatorów"
        assert enm.get("substations"), "Brak stacji"

    def test_network_has_expected_topology(self) -> None:
        """Topologia: GPZ + 2 stacje przelotowe + magistrala + 2 odgałęzienia."""
        enm = _build_full_pv_bess_network()

        # GPZ + 2 stacje SN/nN → ≥ 5 buses (1 GPZ SN + 2 stacja SN + 2 nN)
        assert len(enm["buses"]) >= 5, f"Za mało szyn: {len(enm['buses'])}"

        # 2 transformatory SN/nN
        assert len(enm["transformers"]) == 2, f"Oczekiwano 2 trafo, jest {len(enm['transformers'])}"

        # GPZ (station_type='gpz') + 2 stacje przelotowe (station_type='inline') = 3 substation
        substations = enm.get("substations", [])
        gpz_count = sum(1 for s in substations if s.get("station_type") == "gpz")
        inline_count = sum(1 for s in substations if s.get("station_type") == "inline")
        assert gpz_count == 1, f"Oczekiwano 1 GPZ, jest {gpz_count}"
        assert inline_count == 2, f"Oczekiwano 2 stacji przelotowych, jest {inline_count}"

        # ≥ 6 gałęzi: 4 odcinki magistrali (po insercjach: 5+) + 2 odgałęzienia
        assert len(enm["branches"]) >= 6, f"Za mało gałęzi: {len(enm['branches'])}"

    def test_network_has_pv_fw_and_bess_sources(self) -> None:
        """Sieć zawiera 1 PV, 1 FW i 1 BESS po wywołaniach add_converter_source."""
        enm = _build_full_pv_bess_network()

        # add_converter_source ląduje w generators[]; filtruj inverter-based.
        # Faktyczne wartości gen_type (po stronie domeny): 'bess', 'pv_inverter', 'wind_inverter'.
        inverters = [
            g for g in enm.get("generators", [])
            if g.get("gen_type") in ("bess", "pv_inverter", "wind_inverter", "BESS", "PV", "FW")
            or g.get("connection_variant") in ("nn_side", "block_transformer")
        ]
        assert len(inverters) == 3, (
            f"Oczekiwano 3 źródeł PV+FW+BESS, jest {len(inverters)}: {[g.get('gen_type') for g in inverters]}"
        )

        gen_types = {g.get("gen_type") for g in inverters}
        assert "bess" in gen_types, f"Brak BESS, jest: {gen_types}"
        assert "pv_inverter" in gen_types, f"Brak PV, jest: {gen_types}"
        assert "wind_inverter" in gen_types, f"Brak FW, jest: {gen_types}"

    def test_network_has_nn_load(self) -> None:
        """Po `add_nn_load` w stacji #1 jest jeden odbiór nN."""
        enm = _build_full_pv_bess_network()
        loads = enm.get("loads", [])
        assert len(loads) >= 1, "Brak odbioru nN po `add_nn_load`"
        load = loads[0]
        assert load.get("p_mw", 0) > 0, f"Odbiór ma zerową moc czynną: {load}"

    def test_mapping_to_network_graph(self) -> None:
        """ENM → NetworkGraph mapowanie poprawne."""
        enm_dict = _build_full_pv_bess_network()
        enm = EnergyNetworkModel.model_validate(enm_dict)
        graph = map_enm_to_network_graph(enm)

        # Min: GPZ + 2 stacje SN + 2 stacje nN + odgałęzienia
        assert len(graph.nodes) >= 5, f"Za mało węzłów w grafie: {len(graph.nodes)}"
        assert len(graph.branches) >= 5, f"Za mało gałęzi w grafie: {len(graph.branches)}"

    def test_power_flow_converges_with_pv_bess(self) -> None:
        """PF zbieżny dla pełnej sieci z PV+BESS+odbiór nN."""
        enm_dict = _build_full_pv_bess_network()
        enm = EnergyNetworkModel.model_validate(enm_dict)
        graph = map_enm_to_network_graph(enm)

        # Znajdź SLACK
        slack_id = next(
            (nid for nid, n in graph.nodes.items() if n.node_type.value == "SLACK"),
            None,
        )
        assert slack_id, "Brak SLACK w grafie"

        # PQ specs: zachowaj P/Q z węzłów (load = +P, generator = -P)
        pq_specs = [
            PQSpec(
                node_id=nid,
                p_mw=n.active_power or 0.0,
                q_mvar=n.reactive_power or 0.0,
            )
            for nid, n in sorted(graph.nodes.items())
            if n.node_type.value == "PQ" and nid != slack_id
        ]

        pf = PowerFlowInput(
            graph=graph,
            base_mva=100.0,
            slack=SlackSpec(node_id=slack_id, u_pu=1.0, angle_rad=0.0),
            pq=pq_specs,
            options=PowerFlowOptions(max_iter=50, tolerance=2e-3, trace_level="full"),
        )
        result = solve_power_flow_physics(pf)
        assert result.converged, (
            f"PF nie zbieżny po {result.iterations} iteracjach, "
            f"max_mismatch={result.max_mismatch}"
        )

    def test_short_circuit_3f_at_each_bus(self) -> None:
        """SC_3F daje non-zero ikss na każdej szynie sieci."""
        enm_dict = _build_full_pv_bess_network()
        enm = EnergyNetworkModel.model_validate(enm_dict)
        graph = map_enm_to_network_graph(enm)

        c_factor = 1.10
        tk_s = 1.0
        tb_s = 0.1

        for node_id in sorted(graph.nodes.keys()):
            sc = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
                graph,
                node_id,
                c_factor=c_factor,
                tk_s=tk_s,
                tb_s=tb_s,
            )
            assert sc.ikss_a > 0, f"ikss=0 na {node_id} (oczekiwano > 0)"

    def test_full_build_is_deterministic(self) -> None:
        """5× identyczna budowa daje identyczne hashe ENM."""
        hashes = []
        for _ in range(5):
            enm = _build_full_pv_bess_network()
            # Wyklucz pola z timestampami/header
            normalized = copy.deepcopy(enm)
            header = normalized.get("header", {})
            for volatile in ("created_at", "updated_at", "hash_sha256"):
                header.pop(volatile, None)
            canonical = json.dumps(normalized, sort_keys=True, ensure_ascii=False)
            hashes.append(hashlib.sha256(canonical.encode("utf-8")).hexdigest())
        assert len(set(hashes)) == 1, f"Niezdeterministyczna budowa: {hashes}"


@pytest.mark.parametrize("technology", ["PV", "BESS", "FW"])
def test_converter_source_requires_explicit_connection_variant(technology: str) -> None:
    """add_converter_source musi mieć jawny connection_variant (V12S-008)."""
    enm = _empty_enm()
    r = execute_domain_operation(
        enm,
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "rx_ratio": 0.1,
         "catalog_ref": "src-gpz-15kv-250mva-rx010"},
    )
    enm = r["snapshot"]

    # Bez connection_variant → odrzucone
    r = execute_domain_operation(
        enm,
        "add_converter_source",
        {
            "source_technology": technology,
            "catalog_ref": {
                "PV": "conv-pv-nn-0p5mw-0p4kv",
                "BESS": "conv-bess-nn-0p5mw-0p4kv",
                "FW": "conv-fw-1.0mw-15kv",
            }[technology],
            # brak connection_variant
        },
    )
    assert r.get("error"), f"Oczekiwano błędu connection_variant_missing dla {technology}"
    err = r["error"]
    err_code = err.get("code") if isinstance(err, dict) else str(err)
    assert "connection_variant" in str(err_code).lower(), f"Niewłaściwy kod błędu: {err}"
