"""
Test kontraktowy Result API dla solvera IEC 60909.

Ten test weryfikuje stabilność struktury wyniku ShortCircuitResult.
NIE sprawdza wartości liczbowych - tylko kontrakt/struktura pól.

Cel: zabezpieczenie API przed przypadkowym złamaniem w przyszłych PR.
"""

from __future__ import annotations

import json

import numpy as np
import pytest
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.inverter import InverterSource
from network_model.core.node import Node, NodeType
from network_model.core.ybus import AdmittanceMatrixBuilder
from network_model.solvers.short_circuit_contributions import (
    ShortCircuitBranchContribution,
    ShortCircuitSourceContribution,
)
from network_model.solvers.short_circuit_core import ShortCircuitType
from network_model.solvers.short_circuit_iec60909 import (
    EXPECTED_SHORT_CIRCUIT_RESULT_KEYS,
    OPTIONAL_SHORT_CIRCUIT_RESULT_KEYS,
    ShortCircuitIEC60909Solver,
    ShortCircuitResult,
)


# -----------------------------------------------------------------------------
# Helpers (reuse z istniejących testów)
# -----------------------------------------------------------------------------
def create_pq_node(node_id: str, voltage_level: float) -> Node:
    return Node(
        id=node_id,
        name=f"Node {node_id}",
        node_type=NodeType.PQ,
        voltage_level=voltage_level,
        active_power=5.0,
        reactive_power=2.0,
    )


def create_reference_node(node_id: str, voltage_level: float) -> Node:
    return Node(
        id=node_id,
        name=f"Reference {node_id}",
        node_type=NodeType.PQ,
        voltage_level=voltage_level,
        active_power=0.0,
        reactive_power=0.0,
    )


def create_transformer_branch(
    branch_id: str,
    from_node_id: str,
    to_node_id: str,
    rated_power_mva: float,
    voltage_hv_kv: float,
    voltage_lv_kv: float,
    uk_percent: float,
    pk_kw: float,
) -> TransformerBranch:
    return TransformerBranch(
        id=branch_id,
        name=f"Transformer {branch_id}",
        branch_type=BranchType.TRANSFORMER,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        in_service=True,
        rated_power_mva=rated_power_mva,
        voltage_hv_kv=voltage_hv_kv,
        voltage_lv_kv=voltage_lv_kv,
        uk_percent=uk_percent,
        pk_kw=pk_kw,
        i0_percent=0.0,
        p0_kw=0.0,
        vector_group="Dyn11",
        tap_position=0,
        tap_step_percent=2.5,
    )


def create_reference_branch(
    branch_id: str,
    from_node_id: str,
    to_node_id: str,
    r_ohm: float,
) -> LineBranch:
    return LineBranch(
        id=branch_id,
        name=f"Reference {branch_id}",
        branch_type=BranchType.LINE,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        r_ohm_per_km=r_ohm,
        x_ohm_per_km=0.0,
        b_us_per_km=0.0,
        length_km=1.0,
        rated_current_a=0.0,
    )


def create_inverter_source(
    source_id: str,
    node_id: str,
    in_rated_a: float,
    k_sc: float = 1.2,
    contributes_negative_sequence: bool = False,
    contributes_zero_sequence: bool = False,
) -> InverterSource:
    return InverterSource(
        id=source_id,
        name=f"Inverter {source_id}",
        node_id=node_id,
        in_rated_a=in_rated_a,
        k_sc=k_sc,
        contributes_negative_sequence=contributes_negative_sequence,
        contributes_zero_sequence=contributes_zero_sequence,
        in_service=True,
    )


def build_transformer_only_graph() -> NetworkGraph:
    """Minimalny graf testowy z transformatorem."""
    graph = NetworkGraph()
    graph.add_node(create_pq_node("A", 110.0))
    graph.add_node(create_pq_node("B", 20.0))
    graph.add_node(create_reference_node("GND", 20.0))

    transformer = create_transformer_branch(
        "T1",
        "A",
        "B",
        rated_power_mva=25.0,
        voltage_hv_kv=110.0,
        voltage_lv_kv=20.0,
        uk_percent=10.0,
        pk_kw=120.0,
    )
    graph.add_branch(transformer)
    graph.add_branch(create_reference_branch("REF", "B", "GND", r_ohm=1e9))
    return graph


def build_z_bus(graph: NetworkGraph) -> np.ndarray:
    builder = AdmittanceMatrixBuilder(graph)
    y_bus = builder.build()
    return np.linalg.inv(y_bus)


# -----------------------------------------------------------------------------
# Contract schema constants
# -----------------------------------------------------------------------------
EXPECTED_SOURCE_CONTRIBUTION_KEYS = [
    "source_id",
    "source_name",
    "source_type",
    "node_id",
    "i_contrib_a",
    "share",
]

EXPECTED_BRANCH_CONTRIBUTION_KEYS = [
    "source_id",
    "branch_id",
    "from_node_id",
    "to_node_id",
    "i_contrib_a",
    "direction",
]

EXPECTED_WHITE_BOX_STEP_KEYS = {
    "key",
    "title",
    "formula_latex",
    "inputs",
    "substitution",
    "result",
}


# -----------------------------------------------------------------------------
# Test: ShortCircuitResult ma wszystkie wymagane atrybuty
# -----------------------------------------------------------------------------
class TestShortCircuitResultContract:
    """Testy kontraktowe dla ShortCircuitResult."""

    def test_result_has_all_contract_attributes(self):
        """Wynik 3F ma wszystkie wymagane atrybuty kontraktu."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        for key in EXPECTED_SHORT_CIRCUIT_RESULT_KEYS:
            assert hasattr(result, key), f"Brak atrybutu: {key}"

    def test_result_attributes_have_correct_types(self):
        """Typy atrybutów wyniku są zgodne z kontraktem."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        # String/enum fields
        assert isinstance(result.fault_node_id, str)
        assert hasattr(result.short_circuit_type, "value")  # Enum

        # Float fields
        float_fields = [
            "c_factor",
            "un_v",
            "rx_ratio",
            "kappa",
            "tk_s",
            "tb_s",
            "ikss_a",
            "ip_a",
            "ith_a",
            "ib_a",
            "sk_mva",
            "ik_thevenin_a",
            "ik_inverters_a",
            "ik_total_a",
        ]
        for field in float_fields:
            value = getattr(result, field)
            assert isinstance(value, int | float), f"{field} should be numeric"

        # Complex field
        assert isinstance(result.zkk_ohm, complex)

        # List fields
        assert isinstance(result.contributions, list)
        assert isinstance(result.white_box_trace, list)

        # Optional list field
        assert result.branch_contributions is None or isinstance(result.branch_contributions, list)

    def test_white_box_trace_is_non_empty_list(self):
        """white_box_trace jest niepustą listą z wymaganymi krokami."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        assert isinstance(result.white_box_trace, list)
        assert len(result.white_box_trace) >= 1

        # Każdy krok ma wymagane klucze
        for step in result.white_box_trace:
            assert isinstance(step, dict)
            missing = EXPECTED_WHITE_BOX_STEP_KEYS - step.keys()
            assert not missing, f"Brak kluczy w trace step: {missing}"

    def test_contributions_have_correct_structure(self):
        """contributions zawiera elementy o prawidłowej strukturze."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        assert len(result.contributions) >= 1  # Minimum: THEVENIN_GRID
        for contrib in result.contributions:
            assert isinstance(contrib, ShortCircuitSourceContribution)
            assert isinstance(contrib.source_id, str)
            assert isinstance(contrib.source_name, str)
            assert hasattr(contrib.source_type, "value")  # Enum
            assert isinstance(contrib.i_contrib_a, int | float)
            assert isinstance(contrib.share, int | float)


# -----------------------------------------------------------------------------
# Test: to_dict() zwraca JSON-ready dict
# -----------------------------------------------------------------------------
class TestToDictContract:
    """Testy kontraktowe dla metody to_dict()."""

    def test_to_dict_returns_dict_with_contract_keys(self):
        """to_dict() zwraca dict z wszystkimi kluczami kontraktu."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        d = result.to_dict()
        assert isinstance(d, dict)

        for key in EXPECTED_SHORT_CIRCUIT_RESULT_KEYS:
            assert key in d, f"Brak klucza w to_dict(): {key}"

    def test_to_dict_is_json_serializable(self):
        """to_dict() zwraca dane możliwe do serializacji JSON."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        d = result.to_dict()

        # Próba serializacji do JSON - nie powinna rzucić wyjątku
        json_str = json.dumps(d)
        assert isinstance(json_str, str)

        # Deserializacja powinna zwrócić równoważny dict
        parsed = json.loads(json_str)
        assert parsed.keys() == d.keys()

    def test_to_dict_complex_is_serialized_as_dict(self):
        """zkk_ohm (complex) jest serializowany jako dict z re/im."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        d = result.to_dict()
        zkk = d["zkk_ohm"]

        assert isinstance(zkk, dict)
        assert "re" in zkk
        assert "im" in zkk
        assert isinstance(zkk["re"], float)
        assert isinstance(zkk["im"], float)

    def test_to_dict_enum_is_string(self):
        """short_circuit_type (Enum) jest serializowany jako string."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        d = result.to_dict()
        assert isinstance(d["short_circuit_type"], str)
        assert d["short_circuit_type"] == "3F"

    def test_to_dict_contributions_are_list_of_dicts(self):
        """contributions są serializowane jako lista dict."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        d = result.to_dict()
        assert isinstance(d["contributions"], list)

        for contrib_dict in d["contributions"]:
            assert isinstance(contrib_dict, dict)
            for key in EXPECTED_SOURCE_CONTRIBUTION_KEYS:
                assert key in contrib_dict, f"Brak klucza w contribution: {key}"

    def test_to_dict_white_box_trace_is_list(self):
        """white_box_trace jest przekazywany jako lista."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
        )

        d = result.to_dict()
        assert isinstance(d["white_box_trace"], list)
        assert len(d["white_box_trace"]) >= 1


# -----------------------------------------------------------------------------
# Test: 1-fazowy kontrakt (z Z0)
# -----------------------------------------------------------------------------
class TestSinglePhaseResultContract:
    """Testy kontraktowe dla wyników 1F (wymaga Z0)."""

    def test_1ph_result_has_all_contract_attributes(self):
        """Wynik 1F ma wszystkie wymagane atrybuty kontraktu."""
        graph = build_transformer_only_graph()
        z0_bus = build_z_bus(graph) * 3.0

        result = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
            z0_bus=z0_bus,
        )

        for key in EXPECTED_SHORT_CIRCUIT_RESULT_KEYS:
            assert hasattr(result, key), f"Brak atrybutu: {key}"

    def test_1ph_white_box_trace_has_z0_info(self):
        """white_box_trace dla 1F zawiera informacje o Z0."""
        graph = build_transformer_only_graph()
        z0_bus = build_z_bus(graph) * 3.0

        result = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
            z0_bus=z0_bus,
        )

        assert len(result.white_box_trace) >= 1
        # Pierwszy krok (Zk) powinien zawierać z0 w inputs
        zk_step = result.white_box_trace[0]
        assert zk_step["key"] == "Zk"
        assert "z0_ohm" in zk_step["inputs"]

    def test_1ph_to_dict_is_json_serializable(self):
        """to_dict() dla 1F jest JSON-serializable."""
        graph = build_transformer_only_graph()
        z0_bus = build_z_bus(graph) * 3.0

        result = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
            z0_bus=z0_bus,
        )

        d = result.to_dict()
        json_str = json.dumps(d)
        assert isinstance(json_str, str)


# -----------------------------------------------------------------------------
# Test: branch_contributions kontrakt
# -----------------------------------------------------------------------------
class TestBranchContributionsContract:
    """Testy kontraktowe dla branch_contributions."""

    def test_branch_contributions_when_enabled(self):
        """branch_contributions zawiera prawidłową strukturę gdy włączone."""
        graph = build_transformer_only_graph()
        inverter = create_inverter_source("INV-1", "A", in_rated_a=100.0, k_sc=1.2)
        graph.add_inverter_source(inverter)

        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
            include_branch_contributions=True,
        )

        assert result.branch_contributions is not None
        assert isinstance(result.branch_contributions, list)

        for contrib in result.branch_contributions:
            assert isinstance(contrib, ShortCircuitBranchContribution)

    def test_branch_contributions_to_dict_structure(self):
        """branch_contributions są prawidłowo serializowane w to_dict()."""
        graph = build_transformer_only_graph()
        inverter = create_inverter_source("INV-1", "A", in_rated_a=100.0, k_sc=1.2)
        graph.add_inverter_source(inverter)

        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph,
            fault_node_id="B",
            c_factor=1.0,
            tk_s=1.0,
            include_branch_contributions=True,
        )

        d = result.to_dict()
        assert d["branch_contributions"] is not None
        assert isinstance(d["branch_contributions"], list)

        for bc_dict in d["branch_contributions"]:
            assert isinstance(bc_dict, dict)
            for key in EXPECTED_BRANCH_CONTRIBUTION_KEYS:
                assert key in bc_dict, f"Brak klucza w branch_contribution: {key}"


# -----------------------------------------------------------------------------
# Test: stałość kontraktu EXPECTED_SHORT_CIRCUIT_RESULT_KEYS
# -----------------------------------------------------------------------------
class TestContractConstant:
    """Test weryfikujący, że stała EXPECTED_SHORT_CIRCUIT_RESULT_KEYS jest kompletna."""

    def test_contract_keys_match_dataclass_fields(self):
        """EXPECTED_SHORT_CIRCUIT_RESULT_KEYS zawiera wszystkie pola dataclass."""
        from dataclasses import fields

        dataclass_fields = {f.name for f in fields(ShortCircuitResult)}

        # Klucze kontraktu (bazowe + addytywne opcjonalne z delty FROZEN V12K-128)
        # powinny objąć wszystkie pola dataclass.
        contract_keys = set(EXPECTED_SHORT_CIRCUIT_RESULT_KEYS) | set(
            OPTIONAL_SHORT_CIRCUIT_RESULT_KEYS
        )
        missing_in_contract = dataclass_fields - contract_keys

        # Nie powinno być brakujących pól (chyba że są wewnętrzne)
        assert (
            not missing_in_contract
        ), f"Pola dataclass nie ujęte w kontrakcie: {missing_in_contract}"

    def test_contract_has_minimum_required_keys(self):
        """Kontrakt zawiera minimalne wymagane klucze."""
        required = {
            "short_circuit_type",
            "fault_node_id",
            "c_factor",
            "un_v",
            "zkk_ohm",
            "rx_ratio",
            "kappa",
            "tk_s",
            "tb_s",
            "ikss_a",
            "ip_a",
            "ith_a",
            "ib_a",
            "sk_mva",
            "white_box_trace",
        }
        contract = set(EXPECTED_SHORT_CIRCUIT_RESULT_KEYS)
        missing = required - contract
        assert not missing, f"Brakujące wymagane klucze w kontrakcie: {missing}"


# -----------------------------------------------------------------------------
# Test: wszystkie typy zwarć mają spójny kontrakt
# -----------------------------------------------------------------------------
class TestAllFaultTypesContract:
    """Testy weryfikujące spójność kontraktu dla wszystkich typów zwarć."""

    @pytest.fixture
    def graph_with_z0(self):
        graph = build_transformer_only_graph()
        z0_bus = build_z_bus(graph) * 3.0
        return graph, z0_bus

    def test_3ph_contract(self):
        """3F wynik spełnia kontrakt."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_3ph_short_circuit(
            graph=graph, fault_node_id="B", c_factor=1.0, tk_s=1.0
        )
        d = result.to_dict()
        assert d["short_circuit_type"] == "3F"
        # Kontrakt bazowy FROZEN niezmieniony (delta V12K-128 jest ADDYTYWNA).
        assert set(d.keys()) - set(OPTIONAL_SHORT_CIRCUIT_RESULT_KEYS) == set(
            EXPECTED_SHORT_CIRCUIT_RESULT_KEYS
        )
        # 3F: składowe zgodne (Z1/Z2 obecne, Z0 nie dotyczy → pominięte).
        assert "z1_ohm" in d and "z2_ohm" in d
        assert "z0_ohm" not in d

    def test_2ph_contract(self):
        """2F wynik spełnia kontrakt."""
        graph = build_transformer_only_graph()
        result = ShortCircuitIEC60909Solver.compute_2ph_short_circuit(
            graph=graph, fault_node_id="B", c_factor=1.0, tk_s=1.0
        )
        d = result.to_dict()
        assert d["short_circuit_type"] == "2F"
        # Kontrakt bazowy FROZEN niezmieniony (delta V12K-128 jest ADDYTYWNA).
        assert set(d.keys()) - set(OPTIONAL_SHORT_CIRCUIT_RESULT_KEYS) == set(
            EXPECTED_SHORT_CIRCUIT_RESULT_KEYS
        )
        # 2F: Z1/Z2 obecne, Z0 nie dotyczy → pominięte.
        assert "z1_ohm" in d and "z2_ohm" in d
        assert "z0_ohm" not in d

    def test_1ph_contract(self, graph_with_z0):
        """1F wynik spełnia kontrakt."""
        graph, z0_bus = graph_with_z0
        result = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=graph, fault_node_id="B", c_factor=1.0, tk_s=1.0, z0_bus=z0_bus
        )
        d = result.to_dict()
        assert d["short_circuit_type"] == "1F"
        # Kontrakt bazowy FROZEN niezmieniony (delta V12K-128 jest ADDYTYWNA).
        assert set(d.keys()) - set(OPTIONAL_SHORT_CIRCUIT_RESULT_KEYS) == set(
            EXPECTED_SHORT_CIRCUIT_RESULT_KEYS
        )
        # 1F (doziemne): pełny komplet składowych Z1/Z2/Z0 obecny.
        assert "z1_ohm" in d and "z2_ohm" in d and "z0_ohm" in d

    def test_2ph_ground_contract(self, graph_with_z0):
        """2F+G wynik spełnia kontrakt."""
        graph, z0_bus = graph_with_z0
        result = ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit(
            graph=graph, fault_node_id="B", c_factor=1.0, tk_s=1.0, z0_bus=z0_bus
        )
        d = result.to_dict()
        assert d["short_circuit_type"] == "2F+G"
        # Kontrakt bazowy FROZEN niezmieniony (delta V12K-128 jest ADDYTYWNA).
        assert set(d.keys()) - set(OPTIONAL_SHORT_CIRCUIT_RESULT_KEYS) == set(
            EXPECTED_SHORT_CIRCUIT_RESULT_KEYS
        )
        # 2F+G (doziemne): pełny komplet składowych Z1/Z2/Z0 obecny.
        assert "z1_ohm" in d and "z2_ohm" in d and "z0_ohm" in d


# -----------------------------------------------------------------------------
# Delta FROZEN V12K-128: dowód ADDYTYWNOŚCI składowych Z1/Z2/Z0
# -----------------------------------------------------------------------------
class TestSequenceComponentsAdditive:
    """Składowe Z1/Z2/Z0 są ściśle addytywne — payload sprzed delty (pola None)
    serializuje się BAJT-W-BAJT identycznie, a obecność składowych nie zmienia
    żadnego istniejącego klucza ani wartości."""

    @staticmethod
    def _base_result() -> ShortCircuitResult:
        return ShortCircuitResult(
            short_circuit_type=ShortCircuitType.SINGLE_PHASE_GROUND,
            fault_node_id="B",
            c_factor=1.1,
            un_v=15000.0,
            zkk_ohm=complex(0.5, 1.7),
            ikss_a=1234.5,
            ip_a=2469.0,
            ith_a=1234.5,
            sk_mva=32.0,
            rx_ratio=0.294,
            kappa=1.6,
            tk_s=1.0,
            ib_a=1234.5,
            tb_s=0.1,
        )

    def test_legacy_result_omits_sequence_keys_byte_for_byte(self) -> None:
        """Wynik odtworzony BEZ składowych (domyślne None) — to_dict pomija
        wszystkie klucze addytywne i jest bajt-w-bajt jak kontrakt bazowy."""
        legacy = self._base_result()
        d = legacy.to_dict()
        assert set(OPTIONAL_SHORT_CIRCUIT_RESULT_KEYS).isdisjoint(d.keys())
        # Wyłącznie klucze bazowe FROZEN.
        assert set(d.keys()) == set(EXPECTED_SHORT_CIRCUIT_RESULT_KEYS)

    def test_sequence_presence_does_not_mutate_base_payload(self) -> None:
        """Dołożenie Z1/Z2/Z0 nie zmienia żadnego istniejącego klucza/wartości —
        usunięcie kluczy addytywnych z nowego payloadu daje payload bajt-w-bajt
        identyczny z payloadem sprzed delty."""
        from dataclasses import replace

        legacy = self._base_result()
        with_seq = replace(
            legacy,
            z1_ohm=complex(0.1, 0.4),
            z2_ohm=complex(0.1, 0.4),
            z0_ohm=complex(0.3, 0.9),
        )
        d_legacy = legacy.to_dict()
        d_new = with_seq.to_dict()
        d_new_stripped = {
            k: v for k, v in d_new.items() if k not in OPTIONAL_SHORT_CIRCUIT_RESULT_KEYS
        }
        assert json.dumps(d_legacy, sort_keys=True) == json.dumps(d_new_stripped, sort_keys=True)
        # Wartości addytywne to LUSTRO wejść solvera (complex → {re, im}).
        assert d_new["z1_ohm"] == {"re": 0.1, "im": 0.4}
        assert d_new["z0_ohm"] == {"re": 0.3, "im": 0.9}
