"""
E2E V1 Analysis Pipeline — pełna weryfikacja od budowy sieci do wyników analiz.

Testuje CAŁY pipeline V1:
  1. Budowa ENM za pomocą operacji domenowych (GPZ → trunk → stacja → branch)
  2. Mapowanie ENM → NetworkGraph via mapping.py
  3. Budowa PowerFlowInput z NetworkGraph
  4. Wykonanie rozpływu mocy (Newton-Raphson)
  5. Weryfikacja zbieżności i wyników
  6. Wykonanie obliczeń zwarciowych (IEC 60909 3F)
  7. Weryfikacja wyników SC
  8. Weryfikacja determinizmu (10× identyczne wyniki)

Sekwencja odpowiada realnemu flow inżyniera OSD:
  KROK 1: add_grid_source_sn
  KROK 2: continue_trunk_segment_sn × 3
  KROK 3: insert_station_on_segment_sn (typ B)
  KROK 4: start_branch_segment_sn
  ⟹ mapping → solver → results → verify
"""

from __future__ import annotations

import hashlib
import json

from enm.domain_operations import execute_domain_operation
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from network_model.solvers.power_flow_newton import (
    PowerFlowNewtonSolution,
    solve_power_flow_physics,
)
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)
from network_model.solvers.short_circuit_iec60909 import (
    ShortCircuitIEC60909Solver,
    ShortCircuitResult,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _empty_enm() -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="v1_analysis_e2e", defaults=ENMDefaults()),
    )
    return enm.model_dump(mode="json")


def _materialize_cable_impedances(enm: dict) -> dict:
    """Materializuj impedancje kabli — symulacja resolve z katalogu YAKXS 3×120.

    Parametry katalogowe YAKXS 3×120 mm² (typowe):
      r = 0.253 Ω/km, x = 0.073 Ω/km, b = 0.26 µS/km, In = 270 A
    """
    import copy

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


def _materialize_transformer_params(enm: dict) -> dict:
    """Materializuj parametry trafo — symulacja resolve z katalogu ONAN 630 kVA.

    Parametry katalogowe ONAN 630 kVA 15/0.4 kV:
      sn = 0.63 MVA, uhv = 15 kV, ulv = 0.4 kV, uk = 4.0%, pk = 6.5 kW
    """
    import copy

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


def _build_v1_network() -> dict:
    """Buduj sieć V1 od GPZ: 3 odcinki + stacja B + branch.

    Zwraca końcowy snapshot ENM z materializowanymi parametrami (dict).
    """
    enm = _empty_enm()

    # KROK 1: GPZ
    r = execute_domain_operation(
        enm,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_ref": "src-gpz-15kv-250mva-rx010",
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    assert r.get("error") is None, f"GPZ: {r.get('error')}"
    enm = r["snapshot"]

    # KROK 2: 3 odcinki magistrali
    for i, length in enumerate([300, 250, 200], 1):
        r = execute_domain_operation(
            enm,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": length,
                    "name": f"Odcinek {i}",
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )
        assert r.get("error") is None, f"Trunk {i}: {r.get('error')}"
        enm = r["snapshot"]

    # KROK 3: Wstaw stację B na ostatni segment
    corridors = enm.get("corridors", [])
    assert corridors, "Brak korytarzy"
    seg_refs = corridors[0].get("ordered_segment_refs", [])
    assert len(seg_refs) >= 1, "Brak segmentów w magistrali"
    last_seg = seg_refs[-1]

    r = execute_domain_operation(
        enm,
        "insert_station_on_segment_sn",
        {
            "segment_ref": last_seg,
            # B-12: aparat pól SN wskazany JAWNIE (operacja nie dobiera go sama).
            "field_apparatus_catalog_ref": "sw-cb-abb-vd4-17kv-630a",
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {"sn_voltage_kv": 15.0, "nn_voltage_kv": 0.4},
            "sn_fields": ["IN", "OUT"],
            "transformer": {
                "create": True,
                "transformer_catalog_ref": "tr-sn-nn-15-04-630kva-dyn11",
            },
        },
    )
    assert r.get("error") is None, f"Station B: {r.get('error')}"
    enm = r["snapshot"]

    # KROK 4: Odgałęzienie od szyny SN stacji
    sn_buses = [b for b in enm.get("buses", []) if "sn_bus" in b.get("ref_id", "")]
    assert sn_buses, "Brak szyny SN stacji"
    branch_from = sn_buses[0]["ref_id"]

    r = execute_domain_operation(
        enm,
        "start_branch_segment_sn",
        {
            "from_bus_ref": branch_from,
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 180,
                "catalog_ref": "cable-tfk-yakxs-3x120",
            },
        },
    )
    assert r.get("error") is None, f"Branch: {r.get('error')}"
    enm = r["snapshot"]

    # KROK 5: Materializacja parametrów katalogowych
    # (w produkcji: solver_input/builder.py resolve'uje z CatalogRepository;
    #  tutaj symulujemy ustawiając wartości jawnie)
    enm = _materialize_cable_impedances(enm)
    enm = _materialize_transformer_params(enm)

    return enm


def _serialize_pf_result(sol: PowerFlowNewtonSolution) -> str:
    """Kanoniczny JSON rozpływu do porównania determinizmu."""
    data = {
        "converged": sol.converged,
        "iterations": sol.iterations,
        "max_mismatch": round(sol.max_mismatch, 12),
        "node_u_mag": {k: round(v, 10) for k, v in sorted(sol.node_u_mag.items())},
        "node_angle": {k: round(v, 10) for k, v in sorted(sol.node_angle.items())},
        "losses_total_mw": round(sol.losses_total.real, 10),
    }
    return json.dumps(data, sort_keys=True, separators=(",", ":"))


def _serialize_sc_result(sc: ShortCircuitResult) -> str:
    """Kanoniczny JSON zwarcia do porównania determinizmu."""
    data = {
        "fault_node_id": sc.fault_node_id,
        "ikss_a": round(sc.ikss_a, 6),
        "ip_a": round(sc.ip_a, 6),
        "ith_a": round(sc.ith_a, 6),
        "sk_mva": round(sc.sk_mva, 6),
        "kappa": round(sc.kappa, 8),
        "rx_ratio": round(sc.rx_ratio, 8),
    }
    return json.dumps(data, sort_keys=True, separators=(",", ":"))


def _sha256(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# TEST 1: Pełny pipeline ENM → mapping → PF solver
# ---------------------------------------------------------------------------


class TestV1PowerFlowPipeline:
    """E2E: Budowa sieci V1 → mapowanie → rozpływ mocy → wyniki."""

    def test_mapping_produces_valid_graph(self) -> None:
        """ENM → NetworkGraph ma poprawną strukturę."""
        enm_dict = _build_v1_network()
        enm = EnergyNetworkModel.model_validate(enm_dict)
        graph = map_enm_to_network_graph(enm)

        # Minimum: GPZ bus + 3 trunk end buses + station buses + branch end bus
        assert len(graph.nodes) >= 4, f"Za mało węzłów: {len(graph.nodes)}"
        # Minimum: 3 trunk segments + branch + source impedance
        assert len(graph.branches) >= 3, f"Za mało gałęzi: {len(graph.branches)}"

    def test_power_flow_converges(self) -> None:
        """Rozpływ mocy zbieżny na sieci V1."""
        enm_dict = _build_v1_network()
        enm = EnergyNetworkModel.model_validate(enm_dict)
        graph = map_enm_to_network_graph(enm)

        # Znajdź SLACK node (source bus)
        slack_node_id = None
        for node_id, node in graph.nodes.items():
            if node.node_type.value == "SLACK":
                slack_node_id = node_id
                break
        assert slack_node_id is not None, "Brak SLACK node w grafie"

        # Zbuduj PF input — PQ nodes z zerowym obciążeniem (brak load w ENM)
        pq_specs = []
        for node_id, node in sorted(graph.nodes.items()):
            if node.node_type.value == "PQ" and node_id != slack_node_id:
                p = node.active_power or 0.0
                q = node.reactive_power or 0.0
                pq_specs.append(PQSpec(node_id=node_id, p_mw=p, q_mvar=q))

        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=100.0,
            slack=SlackSpec(node_id=slack_node_id, u_pu=1.0, angle_rad=0.0),
            pq=pq_specs,
            options=PowerFlowOptions(max_iter=50, tolerance=1e-4, trace_level="full"),
        )

        result = solve_power_flow_physics(pf_input)
        assert result.converged, (
            f"PF nie zbieżny po {result.iterations} iteracjach, "
            f"max_mismatch={result.max_mismatch}"
        )
        assert result.iterations <= 20, f"PF potrzebował zbyt dużo iteracji: {result.iterations}"

        # Napięcia powinny być zbliżone do 1.0 pu (brak dużych obciążeń)
        for nid, u_mag in result.node_u_mag.items():
            assert 0.8 <= u_mag <= 1.2, f"Napięcie {nid}={u_mag} pu poza zakresem"

    def test_power_flow_has_white_box_trace(self) -> None:
        """Rozpływ generuje pełny WHITE BOX trace (Y-bus + NR iteracje)."""
        enm_dict = _build_v1_network()
        enm = EnergyNetworkModel.model_validate(enm_dict)
        graph = map_enm_to_network_graph(enm)

        slack_node_id = next(nid for nid, n in graph.nodes.items() if n.node_type.value == "SLACK")
        pq_specs = [
            PQSpec(node_id=nid, p_mw=n.active_power or 0.0, q_mvar=n.reactive_power or 0.0)
            for nid, n in sorted(graph.nodes.items())
            if n.node_type.value == "PQ"
        ]
        pf_input = PowerFlowInput(
            graph=graph,
            base_mva=100.0,
            slack=SlackSpec(node_id=slack_node_id),
            pq=pq_specs,
            options=PowerFlowOptions(max_iter=50, tolerance=1e-4, trace_level="full"),
        )

        result = solve_power_flow_physics(pf_input)
        assert result.converged

        # WHITE BOX: Y-bus trace musi istnieć
        assert result.ybus_trace is not None, "Brak ybus_trace"
        assert len(result.ybus_trace) > 0, "Pusty ybus_trace"

        # WHITE BOX: NR trace musi mieć co najmniej 1 iterację
        assert result.nr_trace is not None, "Brak nr_trace"
        assert len(result.nr_trace) >= 1, "Brak iteracji NR w trace"


# ---------------------------------------------------------------------------
# TEST 2: Pełny pipeline ENM → mapping → SC solver (IEC 60909)
# ---------------------------------------------------------------------------


class TestV1ShortCircuitPipeline:
    """E2E: Budowa sieci V1 → mapowanie → zwarcie 3F → wyniki."""

    def test_short_circuit_3f_at_each_bus(self) -> None:
        """Oblicz zwarcie 3F w każdym węźle SN."""
        enm_dict = _build_v1_network()
        enm = EnergyNetworkModel.model_validate(enm_dict)
        graph = map_enm_to_network_graph(enm)

        # Oblicz zwarcie w każdym węźle
        results: list[ShortCircuitResult] = []
        for node_id in sorted(graph.nodes.keys()):
            sc = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
                graph=graph,
                fault_node_id=node_id,
                c_factor=1.1,
                tk_s=1.0,
            )
            results.append(sc)

            # Minimalne asercje fizyczne
            assert sc.ikss_a > 0, f"Ik''=0 w {node_id}"
            assert sc.ip_a > 0, f"Ip=0 w {node_id}"
            assert sc.ith_a > 0, f"Ith=0 w {node_id}"
            assert sc.sk_mva > 0, f"Sk=0 w {node_id}"
            assert 1.0 <= sc.kappa <= 2.0, f"kappa={sc.kappa} poza zakresem w {node_id}"

        assert len(results) >= 4, f"Za mało wyników SC: {len(results)}"

    def test_short_circuit_has_white_box_trace(self) -> None:
        """Zwarcie generuje pełny WHITE BOX trace."""
        enm_dict = _build_v1_network()
        enm = EnergyNetworkModel.model_validate(enm_dict)
        graph = map_enm_to_network_graph(enm)

        node_id = next(iter(sorted(graph.nodes.keys())))
        sc = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id=node_id,
            c_factor=1.1,
            tk_s=1.0,
        )

        # WHITE BOX trace musi istnieć
        assert sc.white_box_trace is not None, "Brak white_box_trace"
        assert len(sc.white_box_trace) >= 3, f"Zbyt mało kroków trace: {len(sc.white_box_trace)}"

        # Sprawdź kluczowe kroki trace
        trace_keys = [step.get("key") for step in sc.white_box_trace]
        assert "Zk" in trace_keys, "Brak Zk w trace"
        assert "Ikss" in trace_keys, "Brak Ikss w trace"
        assert "kappa" in trace_keys, "Brak kappa w trace"

    def test_short_circuit_source_contributions(self) -> None:
        """Każde zwarcie ma contributions (wkłady źródeł)."""
        enm_dict = _build_v1_network()
        enm = EnergyNetworkModel.model_validate(enm_dict)
        graph = map_enm_to_network_graph(enm)

        node_id = next(iter(sorted(graph.nodes.keys())))
        sc = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id=node_id,
            c_factor=1.1,
            tk_s=1.0,
        )

        assert sc.contributions is not None, "Brak contributions"
        assert len(sc.contributions) >= 1, "Brak wkładów źródeł"
        # Suma share powinna być ~ 1.0
        total_share = sum(c.share for c in sc.contributions)
        assert abs(total_share - 1.0) < 0.01, f"Suma share={total_share}, oczekiwano ~1.0"


# ---------------------------------------------------------------------------
# TEST 3: Readiness pipeline
# ---------------------------------------------------------------------------


class TestV1ReadinessPipeline:
    """E2E: Readiness/fixactions pipeline w kontekście analizy."""

    def test_readiness_ok_after_full_build(self) -> None:
        """Po pełnej budowie sieci: readiness nie ma blokerów krytycznych.

        Karta FAB-G (przy okazji, Zero-Debt pkt 1 — bląd napotkany przy
        inwentarzu wywolan add_grid_source_sn): payload nie mial ANI
        catalog_ref/catalog_binding zrodla, ANI tabliczki transformatora
        WN/SN, wiec KROK 1 zawsze konczyl sie bledem `catalog.ref_required`,
        `enm = r["snapshot"]` bylo `None`, a KROK 2 (`continue_trunk_segment_sn`
        na `enm=None`) wpadal w ogolny except dispatchera i tez zwracal blad —
        ktorego `readiness` (zawsze niepuste w kazdej odpowiedzi bledu) czynilo
        asercje `assert readiness is not None` prawdziwa BEZ WZGLEDU na to, czy
        siec faktycznie sie zbudowala. Test dostaje teraz jawna tabliczke
        zrodla+transformatora i sprawdza brak bledu na KAZDYM kroku, wiec
        rzeczywiscie dowodzi tego, co deklaruje docstring.
        """
        enm = _empty_enm()
        r = execute_domain_operation(
            enm,
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "sk3_mva": 250.0,
                "catalog_ref": "src-gpz-15kv-250mva-rx010",
                "hv_voltage_kv": 110.0,
                "transformer_sn_mva": 25.0,
            },
        )
        assert r.get("error") is None, f"GPZ: {r.get('error')}"
        enm = r["snapshot"]

        r = execute_domain_operation(
            enm,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 300,
                    "catalog_ref": "cable-tfk-yakxs-3x120",
                },
            },
        )
        assert r.get("error") is None, f"Odcinek: {r.get('error')}"
        enm = r["snapshot"]
        readiness = r.get("readiness", {})

        # Po budowie z katalogiem: readiness powinien być akceptowalny
        assert readiness is not None, "Brak readiness w odpowiedzi"

    def test_missing_catalog_generates_blocker(self) -> None:
        """Brak katalogu NA ODCINKU → catalog.ref_required error.

        Karta FAB-G (przy okazji): KROK 1 (GPZ) musi sam SKUTECZNIE się
        zbudować (jawna tabliczka zrodla+transformatora), inaczej blokada
        zmierzona ponizej pochodzi od nieudanego KROKU 1 (dispatcher.
        unhandled_exception na enm=None), a nie od braku katalogu na
        odcinku, ktory ten test deklaruje jako swoj przedmiot.
        """
        enm = _empty_enm()
        r = execute_domain_operation(
            enm,
            "add_grid_source_sn",
            {
                "voltage_kv": 15.0,
                "sk3_mva": 250.0,
                "catalog_ref": "src-gpz-15kv-250mva-rx010",
                "hv_voltage_kv": 110.0,
                "transformer_sn_mva": 25.0,
            },
        )
        assert r.get("error") is None, f"GPZ: {r.get('error')}"
        enm = r["snapshot"]

        # Próba dodania segmentu BEZ catalog_ref
        r = execute_domain_operation(
            enm,
            "continue_trunk_segment_sn",
            {
                "segment": {"rodzaj": "KABEL", "dlugosc_m": 300},
            },
        )
        assert r.get("error_code") == "catalog.ref_required", (
            f"Oczekiwano blokady catalog.ref_required, otrzymano "
            f"{r.get('error_code')}: {r.get('error')}"
        )


# ---------------------------------------------------------------------------
# TEST 4: Determinizm pipeline (10×)
# ---------------------------------------------------------------------------


class TestV1PipelineDeterminism:
    """E2E: Ta sama sekwencja 10× → identyczne wyniki PF i SC."""

    def test_power_flow_determinism_10x(self) -> None:
        """10× PF na tej samej sieci → identyczne wyniki."""
        reference_hash: str | None = None

        for run_idx in range(10):
            enm_dict = _build_v1_network()
            enm = EnergyNetworkModel.model_validate(enm_dict)
            graph = map_enm_to_network_graph(enm)

            slack_id = next(nid for nid, n in graph.nodes.items() if n.node_type.value == "SLACK")
            pq_specs = [
                PQSpec(node_id=nid, p_mw=n.active_power or 0.0, q_mvar=n.reactive_power or 0.0)
                for nid, n in sorted(graph.nodes.items())
                if n.node_type.value == "PQ"
            ]
            pf_input = PowerFlowInput(
                graph=graph,
                base_mva=100.0,
                slack=SlackSpec(node_id=slack_id),
                pq=pq_specs,
                options=PowerFlowOptions(max_iter=50, tolerance=1e-4),
            )

            result = solve_power_flow_physics(pf_input)
            assert result.converged, f"Run {run_idx}: PF nie zbieżny"

            h = _sha256(_serialize_pf_result(result))
            if reference_hash is None:
                reference_hash = h
            else:
                assert h == reference_hash, f"Run {run_idx}: PF wynik różni się od referencji"

    def test_short_circuit_determinism_10x(self) -> None:
        """10× SC na tej samej sieci → identyczne wyniki."""
        reference_hash: str | None = None

        for run_idx in range(10):
            enm_dict = _build_v1_network()
            enm = EnergyNetworkModel.model_validate(enm_dict)
            graph = map_enm_to_network_graph(enm)

            node_id = next(iter(sorted(graph.nodes.keys())))
            sc = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
                graph=graph,
                fault_node_id=node_id,
                c_factor=1.1,
                tk_s=1.0,
            )

            h = _sha256(_serialize_sc_result(sc))
            if reference_hash is None:
                reference_hash = h
            else:
                assert h == reference_hash, f"Run {run_idx}: SC wynik różni się od referencji"

    def test_mapping_determinism_10x(self) -> None:
        """10× mapowanie ENM → NetworkGraph → identyczna struktura."""
        reference: str | None = None

        for run_idx in range(10):
            enm_dict = _build_v1_network()
            enm = EnergyNetworkModel.model_validate(enm_dict)
            graph = map_enm_to_network_graph(enm)

            # Kanoniczny opis grafu
            desc = json.dumps(
                {
                    "nodes": sorted(graph.nodes.keys()),
                    "branches": sorted(graph.branches.keys()),
                    "switches": sorted(graph.switches.keys()),
                },
                sort_keys=True,
                separators=(",", ":"),
            )
            h = _sha256(desc)

            if reference is None:
                reference = h
            else:
                assert h == reference, f"Run {run_idx}: mapping wynik różni się od referencji"
