"""Testy modelu składowej zerowej transformatora wg grupy połączeń (SM-3,
V12K-181) + zwarcia niesymetryczne 1F/2F-Z z hand-calc IEC 60909.

Zdolność ADDYTYWNA: przed SM-3 transformatory były pomijane w sieci składowej
zerowej (grupa wektorowa nie sterowała ścieżką I0). Tu weryfikujemy:
    - tablicę połączeń sekwencji zerowej (Dyn/YNyn/YNd/Yyn/Dd → ścieżka/bocznik/otwarte),
    - hand-calc: source + Dyn TR + zwarcie 1F na szynie yn → Z0 = Z_T0 (delta
      blokuje Z0 źródła), I_k1 = √3·c·U_n/|Z1+Z2+Z0|,
    - drogę SZEREGOWĄ YNyn (Z0 źródła DOCIERA na stronę LV),
    - 3·Z_N dla uziemienia przez impedancję,
    - determinizm śladu WHITE BOX.
"""

from __future__ import annotations

import math

import pytest
from enm.mapping import (
    build_zero_sequence_trace,
    build_zero_sequence_zbus,
    map_enm_to_network_graph,
)
from enm.models import (
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    GroundingConfig,
    Source,
    Transformer,
)
from enm.zero_sequence_transformer import (
    WindingZeroSeq,
    ZeroSeqConnection,
    build_transformer_zero_seq_model,
)
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

S_BASE_MVA = 100.0

# Transformator wzorcowy do hand-calc: 25 MVA, 110/15 kV, uk=11%, pk=110 kW.
_SN_MVA = 25.0
_UHV_KV = 110.0
_ULV_KV = 15.0
_UK_PCT = 11.0
_PK_KW = 110.0


def _hand_zt0_ohm_lv() -> complex:
    """Z_T0 = Z_T (rozproszenie zgodnej) referowane na stronę LV [Ω] — hand-calc.

    z = uk/100 = 0.11; r = (pk/1000)/Sn = 0.11/25 = 0.0044;
    x = sqrt(z² - r²) = 0.109912...; Zbase_LV = ULV²/Sn = 225/25 = 9.0 Ω;
    Z_T0 = (0.0044 + j0.109912)·9 = 0.0396 + j0.989208 Ω.
    """
    z_pu = _UK_PCT / 100.0
    r_pu = (_PK_KW / 1000.0) / _SN_MVA
    x_pu = math.sqrt(z_pu * z_pu - r_pu * r_pu)
    z_base_lv = (_ULV_KV**2) / _SN_MVA
    return complex(r_pu, x_pu) * z_base_lv


def _mk_transformer(vector_group, hv_neutral=None, lv_neutral=None) -> Transformer:
    return Transformer(
        ref_id="tr1",
        name="TR",
        hv_bus_ref="bhv",
        lv_bus_ref="blv",
        sn_mva=_SN_MVA,
        uhv_kv=_UHV_KV,
        ulv_kv=_ULV_KV,
        uk_percent=_UK_PCT,
        pk_kw=_PK_KW,
        vector_group=vector_group,
        hv_neutral=hv_neutral,
        lv_neutral=lv_neutral,
    )


# ---------------------------------------------------------------------------
# 1) Tablica połączeń sekwencji zerowej (model czysty)
# ---------------------------------------------------------------------------


class TestSequenceConnectionTable:
    @pytest.mark.parametrize(
        "vector_group,expected_conn,expected_hv,expected_lv",
        [
            (
                "Dyn11",
                ZeroSeqConnection.LV_SHUNT_GROUND,
                WindingZeroSeq.DELTA,
                WindingZeroSeq.GROUNDED_WYE,
            ),
            (
                "YNyn0",
                ZeroSeqConnection.SERIES_THROUGH,
                WindingZeroSeq.GROUNDED_WYE,
                WindingZeroSeq.GROUNDED_WYE,
            ),
            (
                "YNd11",
                ZeroSeqConnection.HV_SHUNT_GROUND,
                WindingZeroSeq.GROUNDED_WYE,
                WindingZeroSeq.DELTA,
            ),
            ("Yyn0", ZeroSeqConnection.OPEN, WindingZeroSeq.OPEN, WindingZeroSeq.GROUNDED_WYE),
            ("Dd0", ZeroSeqConnection.OPEN, WindingZeroSeq.DELTA, WindingZeroSeq.DELTA),
        ],
    )
    def test_connection_table(self, vector_group, expected_conn, expected_hv, expected_lv):
        model = build_transformer_zero_seq_model(_mk_transformer(vector_group))
        assert model.connection == expected_conn
        assert model.hv_winding == expected_hv
        assert model.lv_winding == expected_lv

    def test_missing_vector_group_is_open(self):
        """Brak grupy → OPEN (uczciwy brak danych, brak wkładu do Z0)."""
        model = build_transformer_zero_seq_model(_mk_transformer(None))
        assert model.connection == ZeroSeqConnection.OPEN
        assert model.z0_pu is None

    def test_z0_equals_leakage_impedance(self):
        """Z_T0 (pu@Sbase) odpowiada rozproszeniu zgodnej referowanemu na Sbase."""
        model = build_transformer_zero_seq_model(_mk_transformer("Dyn11"))
        # z0_pu na Sbase → Ω na stronie LV (Zbase_LV = ULV²/Sbase).
        z0_ohm_lv = model.z0_pu * (_ULV_KV**2 / S_BASE_MVA)
        assert z0_ohm_lv == pytest.approx(_hand_zt0_ohm_lv())

    def test_neutral_impedance_adds_three_zn(self):
        """Uziemienie przez rezystor R_N=5 Ω dodaje dokładnie 3·R_N = 15 Ω do Z0."""
        base = build_transformer_zero_seq_model(_mk_transformer("Dyn11"))
        grounded = build_transformer_zero_seq_model(
            _mk_transformer(
                "Dyn11", lv_neutral=GroundingConfig(type="resistor_grounded", r_ohm=5.0, x_ohm=0.0)
            )
        )
        delta_ohm = (grounded.z0_pu - base.z0_pu) * (_ULV_KV**2 / S_BASE_MVA)
        assert delta_ohm == pytest.approx(complex(15.0, 0.0))

    def test_isolated_neutral_blocks_path(self):
        """Punkt neutralny izolowany na stronie yn → droga otwarta mimo litery 'n'."""
        model = build_transformer_zero_seq_model(
            _mk_transformer("Dyn11", lv_neutral=GroundingConfig(type="isolated"))
        )
        assert model.connection == ZeroSeqConnection.OPEN

    def test_trace_present_and_deterministic(self):
        a = build_transformer_zero_seq_model(_mk_transformer("Dyn11")).trace
        b = build_transformer_zero_seq_model(_mk_transformer("Dyn11")).trace
        assert len(a) >= 3
        assert a == b
        keys = [s["key"] for s in a]
        assert any("parse" in k for k in keys)
        assert any("conn" in k for k in keys)


# ---------------------------------------------------------------------------
# 2) Hand-calc IEC 60909: source + Dyn TR + zwarcie 1F na szynie yn
# ---------------------------------------------------------------------------


def _build_network(source_z0=(0.16, 1.6), vector_group="Dyn11"):
    enm = EnergyNetworkModel(
        header=ENMHeader(name="SM3"),
        buses=[
            Bus(ref_id="bhv", name="HV", voltage_kv=_UHV_KV),
            Bus(ref_id="blv", name="LV", voltage_kv=_ULV_KV),
        ],
        sources=[
            Source(
                ref_id="src",
                name="Sieć",
                bus_ref="bhv",
                model="thevenin",
                r_ohm=0.8,
                x_ohm=8.0,
                r0_ohm=source_z0[0],
                x0_ohm=source_z0[1],
            ),
        ],
        transformers=[_mk_transformer(vector_group)],
    )
    graph = map_enm_to_network_graph(enm)
    lv_node = next(n.id for n in graph.nodes.values() if n.name == "LV")
    return enm, graph, lv_node


class TestHandCalc1F:
    def test_z0_at_lv_equals_transformer_leakage(self):
        """Dyn: strona LV (yn) widzi TYLKO Z_T0 do ziemi (delta blokuje sieć HV)."""
        enm, graph, lv = _build_network()
        z0_bus = build_zero_sequence_zbus(enm, graph)
        result = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=graph, fault_node_id=lv, c_factor=1.1, tk_s=1.0, z0_bus=z0_bus
        )
        assert result.z0_ohm == pytest.approx(_hand_zt0_ohm_lv())

    def test_ik1_matches_iec_formula(self):
        """I_k1'' = √3·c·U_n / |Z1 + Z2 + Z0| (IEC 60909, składowe symetryczne)."""
        enm, graph, lv = _build_network()
        z0_bus = build_zero_sequence_zbus(enm, graph)
        result = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=graph, fault_node_id=lv, c_factor=1.1, tk_s=1.0, z0_bus=z0_bus
        )
        z_sum = abs(result.z1_ohm + result.z2_ohm + result.z0_ohm)
        ik1_hand = math.sqrt(3.0) * 1.1 * (_ULV_KV * 1000.0) / z_sum
        assert result.ikss_a == pytest.approx(ik1_hand)
        # Hand-calc wartości referencyjne (dla audytu): Z1 = Z2 = 0.053698 + j1.118529 Ω;
        # Z0 = 0.0396 + j0.98921 Ω; |Z1+Z2+Z0| = 3.229612 Ω; I_k1'' ≈ 8849.00 A.
        #
        # RE-BASELINE 9750.24 → 8849.00 A (V12K-184). Asercja formuły wyżej trzyma
        # bez zmian — zmieniło się WEJŚCIE, nie sposób liczenia. Z0 pozostało
        # BIT-IDENTYCZNE (0.0396 + j0.98921); wzrosło wyłącznie Z1 = Z2, z
        # 0.038824 + j0.969769 na 0.053698 + j1.118529 Ω, o Δ = 0.014874 + j0.148760
        # (X/R = 10.0 — czyli dokładnie impedancja zasilania systemowego). Do V12K-184
        # zasilanie systemowe było modelowane jako wirtualny węzeł ziemi za gałęzią
        # „Z_source", a ten węzeł był w macierzy SC uziemiany admitancją idealną
        # (1e6 pu), co ZWIERAŁO Z_Q — impedancja sieci nie wchodziła do składowej
        # zgodnej wcale. Teraz jest SEM za Z_Q (bocznik Y_Q = 1/Z_Q, IEC 60909-0 §3.2),
        # więc prąd doziemny jest mniejszy — kierunek zmiany jest fizycznie poprawny.
        assert result.ikss_a == pytest.approx(8849.00, rel=1e-4)

    def test_delta_blocks_source_zero_sequence(self):
        """Dyn: strona trójkąta (HV) izoluje Z0 źródła — 10× zmiana Z0 źródła
        NIE zmienia Z0 na szynie LV (kluczowy dowód roli grupy połączeń)."""
        enm_a, g_a, lv_a = _build_network(source_z0=(0.16, 1.6))
        enm_b, g_b, lv_b = _build_network(source_z0=(1.6, 16.0))
        z0_a = build_zero_sequence_zbus(enm_a, g_a)
        z0_b = build_zero_sequence_zbus(enm_b, g_b)
        r_a = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=g_a, fault_node_id=lv_a, c_factor=1.1, tk_s=1.0, z0_bus=z0_a
        )
        r_b = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=g_b, fault_node_id=lv_b, c_factor=1.1, tk_s=1.0, z0_bus=z0_b
        )
        assert r_b.z0_ohm == pytest.approx(r_a.z0_ohm)

    def test_ynyn_through_path_passes_source_zero_sequence(self):
        """YNyn: droga SZEREGOWA — Z0 źródła DOCIERA na stronę LV, więc zmiana
        Z0 źródła ZMIENIA Z0 na szynie LV (kontrast z Dyn)."""
        enm_a, g_a, lv_a = _build_network(source_z0=(0.16, 1.6), vector_group="YNyn0")
        enm_b, g_b, lv_b = _build_network(source_z0=(1.6, 16.0), vector_group="YNyn0")
        z0_a = build_zero_sequence_zbus(enm_a, g_a)
        z0_b = build_zero_sequence_zbus(enm_b, g_b)
        r_a = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=g_a, fault_node_id=lv_a, c_factor=1.1, tk_s=1.0, z0_bus=z0_a
        )
        r_b = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=g_b, fault_node_id=lv_b, c_factor=1.1, tk_s=1.0, z0_bus=z0_b
        )
        assert r_b.z0_ohm != pytest.approx(r_a.z0_ohm)


# ---------------------------------------------------------------------------
# 3) Zwarcie 2F-Z (dwufazowe doziemne) — spójność z Z1/Z2/Z0
# ---------------------------------------------------------------------------


class TestHandCalc2FZ:
    def test_2fz_uses_parallel_z2_z0(self):
        """2F-Z: Z_k = Z1 + (Z2·Z0)/(Z2+Z0) (IEC 60909). Z0 z modelu Dyn."""
        enm, graph, lv = _build_network()
        z0_bus = build_zero_sequence_zbus(enm, graph)
        result = ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit(
            graph=graph, fault_node_id=lv, c_factor=1.1, tk_s=1.0, z0_bus=z0_bus
        )
        z1, z2, z0 = result.z1_ohm, result.z2_ohm, result.z0_ohm
        z_k_hand = z1 + (z2 * z0) / (z2 + z0)
        # voltage_factor dla 2F-Z = 1.0
        ik_hand = 1.1 * (_ULV_KV * 1000.0) / abs(z_k_hand)
        assert result.ikss_a == pytest.approx(ik_hand)
        assert result.z0_ohm == pytest.approx(_hand_zt0_ohm_lv())


# ---------------------------------------------------------------------------
# 4) Ślad WHITE BOX budowy sieci Z0 (rozbicie po elementach)
# ---------------------------------------------------------------------------


class TestZeroSequenceTrace:
    def test_trace_breaks_down_by_element(self):
        enm, graph, _ = _build_network()
        trace = build_zero_sequence_trace(enm, graph)
        keys = [s["key"] for s in trace]
        assert any(k.startswith("z0_source[") for k in keys)
        assert any("tr_z0_conn[" in k for k in keys)

    def test_trace_deterministic(self):
        enm, graph, _ = _build_network()
        assert build_zero_sequence_trace(enm, graph) == build_zero_sequence_trace(enm, graph)
