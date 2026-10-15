"""
Tests for PR-18: Short-Circuit Solver Integration (Engine Binding)

Test categories:
1. Determinism — identical inputs produce identical hashes and signatures
3. Contract shape — ResultSet v1 structure invariants
6. Result mapper — `map_short_circuit_to_resultset_v1` unit tests

INVARIANTS UNDER TEST:
- ZERO randomness: same graph + same config → same hash + same signature
- ResultSet v1 contains expected keys and sorted elements

Karta TORY-TYLKO-W-TESTACH (2026-09-30): kategoria 5 (testy adaptera
`execute_short_circuit`) skasowana razem z adapterem — tor bez konsumenta w produkcie.
Fizyka, której dowodziła, jest dowodzona na biegu kanonicznym zwarć:
3F/2F z dodatnimi prądami, Z0 wymagane dla 1F (jawna odmowa) —
`tests/enm/test_short_circuit_migracja_e3_golden.py`; scenariusz MIN z c per pasmo
i niższym Ik'', noty korekty R_θ, nieznany scenariusz i nieznany węzeł zwarcia jako
jawna odmowa — `tests/enm/test_canonical_sc_c_per_pasmo.py`. Kategoria 6 (zamrożony
mapper, decyzja właściciela B-01 w karcie CV-3.3-A2) dostaje wejście z
`tests/utils/wynik_wiazania_zwarcia.py` — z tych samych ogniw, z których bieg
kanoniczny składa wejście zwarciowe.

Karta CV-3.3-A (2026-09-05): kategorie 2 (Gating) i 4 (Golden fixtures, przez
`ExecutionEngineService.execute_run_sc`) skasowane razem z E3
(`application.execution_engine` — drugi tor wykonania biegów bez konsumenta
produkcyjnego). Gating byl mechanika WYLACZNIE E3 (kwargs `readiness=`/
`eligibility=` na `create_run`, ktorych kanoniczny `enm.canonical_analysis.
create_run` nie ma — waliduje sam, z ENM). Fizyka golden fixtures (zbieznosc,
dodatnie prady, 3F>2F, Z0 wymagane dla 1F, determinizm, ksztalt kontraktu,
slad WHITE BOX) przepisana na tor kanoniczny na sieci koncepcyjnie tej samej:
`tests/enm/test_short_circuit_migracja_e3_golden.py`.
"""

from __future__ import annotations

import copy
from uuid import uuid4

import pytest
from application.result_mapping.sc_binding_meta import (
    wzbogac_resultset_o_meta_bindingu,
)
from application.result_mapping.short_circuit_to_resultset_v1 import (
    map_short_circuit_to_resultset_v1,
)
from domain.execution import (
    ExecutionAnalysisType,
    ResultSet,
    compute_result_signature,
    compute_solver_input_hash,
)
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.inverter import InverterSource
from network_model.core.node import Node, NodeType

from tests.utils.wynik_wiazania_zwarcia import wynik_wiazania_zwarcia_3f

# =============================================================================
# Fixtures: Golden network (production-grade MV network)
# =============================================================================


def _create_golden_graph() -> NetworkGraph:
    """
    Create a production-grade MV network for golden fixture tests.

    Topology:
        SLACK (110 kV) --[Transformer T1]--> BUS_MV (20 kV) --[Cable C1]--> BUS_LOAD (20 kV)
                                                                  |
                                                             [Inverter INV1]

    This covers: source (via SLACK), transformer, cable, load bus, inverter source.
    All catalog_ref and impedance parameters are complete (no eligibility blockers for SC_3F).
    """
    graph = NetworkGraph()

    # Nodes
    graph.add_node(
        Node(
            id="SLACK",
            name="Stacja 110kV",
            node_type=NodeType.PQ,
            voltage_level=110.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graph.add_node(
        Node(
            id="BUS_MV",
            name="Szyna SN 20kV",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=5.0,
            reactive_power=2.0,
        )
    )
    graph.add_node(
        Node(
            id="BUS_LOAD",
            name="Szyna odbiorcza 20kV",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=10.0,
            reactive_power=4.0,
        )
    )
    # Reference node for Y-bus invertibility
    graph.add_node(
        Node(
            id="GND",
            name="Uziemienie",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )

    # Transformer: 110/20 kV, 25 MVA, uk=10%, pk=120 kW
    graph.add_branch(
        TransformerBranch(
            id="T1",
            name="Transformator T1",
            branch_type=BranchType.TRANSFORMER,
            from_node_id="SLACK",
            to_node_id="BUS_MV",
            in_service=True,
            rated_power_mva=25.0,
            voltage_hv_kv=110.0,
            voltage_lv_kv=20.0,
            uk_percent=10.0,
            pk_kw=120.0,
            i0_percent=0.5,
            p0_kw=25.0,
            vector_group="Dyn11",
            tap_position=0,
            tap_step_percent=2.5,
            type_ref="TRAFO_110_20_25MVA",
        )
    )

    # Cable: BUS_MV -> BUS_LOAD (YAKY 3x240, 5 km)
    graph.add_branch(
        LineBranch(
            id="C1",
            name="Kabel C1",
            branch_type=BranchType.CABLE,
            from_node_id="BUS_MV",
            to_node_id="BUS_LOAD",
            in_service=True,
            r_ohm_per_km=0.125,
            x_ohm_per_km=0.08,
            b_us_per_km=260.0,
            length_km=5.0,
            rated_current_a=400.0,
            type_ref="YAKY_3x240",
        )
    )

    # Reference branch to GND (for Y-bus invertibility)
    graph.add_branch(
        LineBranch(
            id="REF",
            name="Ref GND",
            branch_type=BranchType.LINE,
            from_node_id="BUS_LOAD",
            to_node_id="GND",
            in_service=True,
            r_ohm_per_km=1e9,
            x_ohm_per_km=0.0,
            b_us_per_km=0.0,
            length_km=1.0,
            rated_current_a=1.0,
        )
    )

    # Inverter source (PV, 100 A rated, k_sc=1.1)
    graph.add_inverter_source(
        InverterSource(
            id="INV1",
            name="Falownik PV 1",
            node_id="BUS_LOAD",
            in_rated_a=100.0,
            k_sc=1.1,
            contributes_negative_sequence=False,
            contributes_zero_sequence=False,
            in_service=True,
        )
    )

    return graph


def _sample_solver_input() -> dict:
    """Realistic solver input dict for hash tests."""
    return {
        "buses": [
            {"ref_id": "SLACK", "voltage_level_kv": 110.0},
            {"ref_id": "BUS_MV", "voltage_level_kv": 20.0},
            {"ref_id": "BUS_LOAD", "voltage_level_kv": 20.0},
        ],
        "branches": [
            {"ref_id": "C1", "r_ohm_per_km": 0.125, "x_ohm_per_km": 0.08},
        ],
        "transformers": [
            {"ref_id": "T1", "uk_percent": 10.0, "rated_power_mva": 25.0},
        ],
        "inverter_sources": [
            {"ref_id": "INV1", "in_rated_a": 100.0, "k_sc": 1.1},
        ],
        "switches": [],
        "c_factor_max": 1.10,
    }


# =============================================================================
# 1. DETERMINISM TESTS
# =============================================================================


class TestDeterminism:
    """Identical inputs produce identical hashes and signatures."""

    def test_solver_input_hash_deterministic(self):
        """Same solver input → same hash."""
        input_a = _sample_solver_input()
        input_b = copy.deepcopy(input_a)
        assert compute_solver_input_hash(input_a) == compute_solver_input_hash(input_b)

    def test_solver_input_hash_key_order_independent(self):
        """Dict key order does not affect hash."""
        input_a = {"z": 1, "a": 2, "m": 3}
        input_b = {"a": 2, "m": 3, "z": 1}
        assert compute_solver_input_hash(input_a) == compute_solver_input_hash(input_b)

    def test_solver_input_hash_bus_order_independent(self):
        """Bus list order does not affect hash (canonical sorting by ref_id)."""
        input_a = _sample_solver_input()
        input_b = copy.deepcopy(input_a)
        input_b["buses"] = list(reversed(input_b["buses"]))
        assert compute_solver_input_hash(input_a) == compute_solver_input_hash(input_b)

    def test_result_signature_deterministic(self):
        """Same result data → same signature."""
        data = {"ikss_a": 12345.0, "ip_a": 25000.0}
        assert compute_result_signature(data) == compute_result_signature(data)

    def test_result_signature_differs_on_change(self):
        """Different result data → different signature."""
        data_a = {"ikss_a": 12345.0}
        data_b = {"ikss_a": 12346.0}
        assert compute_result_signature(data_a) != compute_result_signature(data_b)


# =============================================================================
# 3. CONTRACT SHAPE TESTS
# =============================================================================


class TestContractShape:
    """ResultSet v1 structure invariants."""

    def test_sc_2f_analysis_type_in_enum(self):
        """SC_2F is a valid ExecutionAnalysisType."""
        assert ExecutionAnalysisType.SC_2F.value == "SC_2F"


# =============================================================================
# 6. RESULT MAPPER UNIT TESTS
# =============================================================================


class TestResultMapper:
    """Unit tests for the short-circuit → ResultSet v1 mapper."""

    def test_mapper_produces_resultset(self):
        """Mapper transforms binding result to ResultSet."""
        graph = _create_golden_graph()
        run_id = uuid4()

        binding_result = wynik_wiazania_zwarcia_3f(graph, "BUS_MV")

        rs = map_short_circuit_to_resultset_v1(
            binding_result=binding_result,
            run_id=run_id,
            graph=graph,
            validation_snapshot={"is_valid": True},
            readiness_snapshot={"ready": True},
        )

        assert isinstance(rs, ResultSet)
        assert rs.run_id == run_id
        assert rs.analysis_type == ExecutionAnalysisType.SC_3F
        assert len(rs.element_results) > 0
        assert len(rs.deterministic_signature) == 64

    def test_mapper_global_results_complete(self):
        """Mapper produces complete global results."""
        graph = _create_golden_graph()
        run_id = uuid4()

        binding_result = wynik_wiazania_zwarcia_3f(graph, "BUS_MV")

        # Klucze P0.3 dokłada wrapper POZA zamrożonym mapperem — test ćwiczy
        # ten sam wzorzec kompozycji, jaki stosował dawny E3
        # (`application.execution_engine`, skasowany kartą CV-3.3-A, 2026-09-05).
        # `map_short_circuit_to_resultset_v1` i `wzbogac_resultset_o_meta_bindingu`
        # nie mają konsumenta produkcyjnego (tylko ten test); zostają zamrożone
        # decyzją właściciela (B-01, CV-3.3-A2, `resultset_v1_schema_guard.py`) —
        # kasacja wymaga jego sankcji, nie zmierzenia „zero importera" (pozycja
        # zatrzymana także w karcie TORY-TYLKO-W-TESTACH, 2026-09-30).
        rs = wzbogac_resultset_o_meta_bindingu(
            map_short_circuit_to_resultset_v1(
                binding_result=binding_result,
                run_id=run_id,
                graph=graph,
                validation_snapshot={},
                readiness_snapshot={},
            ),
            binding_result,
        )

        gr = rs.global_results
        assert gr["analysis_type"] == "SC_3F"
        assert gr["short_circuit_type"] == "3F"
        assert isinstance(gr["zkk_ohm"], dict)
        assert "re" in gr["zkk_ohm"]
        assert "im" in gr["zkk_ohm"]
        assert gr["contributions_count"] >= 1
        assert gr["white_box_steps_count"] >= 7
        # D-14b: guard sanity-bounds Ik'' wpięty na ścieżce konsumpcji (overlay/proof
        # czytają global_results). Golden MV → Ik'' wiarygodny.
        assert "ikss_sanity" in gr
        # Zmiana kanonu (uczciwość natychmiastowa 2026-09-23): „w paśmie wiarygodności"
        # zamiast „zweryfikowany" — intencja bez zmian (Ik'' golden MV wiarygodny).
        assert gr["ikss_sanity"]["status"] == "w paśmie wiarygodności"
        assert gr["ikss_sanity"]["in_range"] is True
        assert gr["ikss_sanity"]["voltage_band"] == "SN"
        assert gr["ikss_sanity"]["blocks_osd_package"] is False
        # Karta P0.3: scenario/override metadata additive on ResultSet v1.
        assert gr["scenario"] == "MAX"
        assert gr["c_factor_override"] is False
        assert gr["c_factor_auto"] == pytest.approx(1.10)

    def test_mapper_global_results_min_scenario_carries_temperature_notes(self):
        graph = _create_golden_graph()
        run_id = uuid4()

        binding_result = wynik_wiazania_zwarcia_3f(graph, "BUS_MV", scenario="MIN")

        rs = wzbogac_resultset_o_meta_bindingu(
            map_short_circuit_to_resultset_v1(
                binding_result=binding_result,
                run_id=run_id,
                graph=graph,
                validation_snapshot={},
                readiness_snapshot={},
            ),
            binding_result,
        )

        gr = rs.global_results
        assert gr["scenario"] == "MIN"
        assert gr["c_factor"] == pytest.approx(1.00)
        assert "temperature_correction_notes" in gr
        assert len(gr["temperature_correction_notes"]) >= 1

    def test_mapper_deterministic(self):
        """Same binding result → same ResultSet signature."""
        graph = _create_golden_graph()
        run_id = uuid4()

        binding_result = wynik_wiazania_zwarcia_3f(graph, "BUS_MV")

        rs1 = map_short_circuit_to_resultset_v1(
            binding_result=binding_result,
            run_id=run_id,
            graph=graph,
            validation_snapshot={},
            readiness_snapshot={},
        )
        rs2 = map_short_circuit_to_resultset_v1(
            binding_result=binding_result,
            run_id=run_id,
            graph=graph,
            validation_snapshot={},
            readiness_snapshot={},
        )

        assert rs1.deterministic_signature == rs2.deterministic_signature
