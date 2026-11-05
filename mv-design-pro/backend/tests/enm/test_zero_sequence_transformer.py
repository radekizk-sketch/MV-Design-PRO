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
from enm.assembler import zloz_wejscie_zwarcia
from enm.mapping import (
    build_zero_sequence_zbus,
    build_zero_sequence_zbus_with_trace,
    map_enm_to_network_graph,
)
from enm.models import (
    Bus,
    Cable,
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
from network_model.core.czas_wylaczenia import czas_tb_roboczy
from network_model.odmowa_danych import OdmowaDanychError
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
# 1b) Audyt fizyki fala F: zakaz fabrykacji Z_N brakującej dla urządzeń
#     impedancyjnych (rezystor NER / dławik Petersena). Precedens: te typy
#     GroundingConfig niosą NIEZEROWĄ, dominującą impedancję ograniczającą
#     prąd doziemny — cichy fallback na 0 Ω zamieniałby je w uziemienie
#     BEZPOŚREDNIE i SZTUCZNIE ZAWYŻAŁ I''k1 (fizyka odwrotna: sieć
#     kompensowana/rezystancyjna ma z założenia mały prąd doziemny).
# ---------------------------------------------------------------------------


class TestGroundingImpedanceNoFabrication:
    def test_petersen_coil_missing_x_ohm_raises_not_defaults_to_zero(self):
        """Cewka Petersena bez podanej reaktancji X_N MUSI zgłosić błąd danych,
        NIE cicho przyjąć X_N=0 (co dałoby uziemienie bezpośrednie)."""
        trafo = _mk_transformer("YNyn0", hv_neutral=GroundingConfig(type="petersen_coil"))
        with pytest.raises(ValueError, match="Petersena wymaga dodatniej reaktancji"):
            build_transformer_zero_seq_model(trafo)

    def test_resistor_grounded_missing_r_ohm_raises_not_defaults_to_zero(self):
        """Rezystor NER bez podanej rezystancji R_N MUSI zgłosić błąd danych,
        NIE cicho przyjąć R_N=0 (co dałoby uziemienie bezpośrednie)."""
        trafo = _mk_transformer("YNyn0", hv_neutral=GroundingConfig(type="resistor_grounded"))
        with pytest.raises(ValueError, match="rezystor wymaga dodatniej rezystancji"):
            build_transformer_zero_seq_model(trafo)

    def test_petersen_coil_with_x_ohm_dominates_z0_not_zero(self):
        """Gdy X_N dławika JEST podane, Z0 = Z_T0 + 3·X_N (rozproszenie TR w
        szeregu z dławikiem), NIE samo Z_T0 (co byłoby przypadkiem uziemienia
        bezpośredniego, gdzie dławik zniknąłby z obwodu)."""
        x_coil_ohm = 120.0
        model = build_transformer_zero_seq_model(
            _mk_transformer(
                "YNyn0", hv_neutral=GroundingConfig(type="petersen_coil", x_ohm=x_coil_ohm)
            )
        )
        z0_ohm_hv = model.z0_pu * (_UHV_KV**2 / S_BASE_MVA)
        # Hand-calc: Z_T0(HV) = (r_pu + j·x_pu)·Zbase_HV, patrz _hand_zt0_ohm_lv
        # (tu strona HV zamiast LV: Zbase = UHV²/Sn = 484 Ω).
        z_pu = _UK_PCT / 100.0
        r_pu = (_PK_KW / 1000.0) / _SN_MVA
        x_pu = math.sqrt(z_pu * z_pu - r_pu * r_pu)
        z_t0_hv = complex(r_pu, x_pu) * (_UHV_KV**2 / _SN_MVA)
        expected = z_t0_hv + complex(0.0, 3.0 * x_coil_ohm)
        assert z0_ohm_hv == pytest.approx(expected, rel=1e-6)
        # Dławik (3·X_N = 360 Ω) musi być OBECNY w Z0, nie zerowy: różnica
        # względem Z_T0 samego transformatora równa się dokładnie 3·X_N.
        assert (z0_ohm_hv - z_t0_hv).imag == pytest.approx(3.0 * x_coil_ohm, rel=1e-6)

    def test_resistor_grounded_missing_r_ohm_does_not_silently_ground_directly(self):
        """Regresja: przed naprawą (fala F) brak r_ohm dawał Z_N=0 (identyczne
        z 'directly_grounded'). Po naprawie brak danych jest błędem, więc gdy
        r_ohm JEST podane, wynik MUSI różnić się od uziemienia bezpośredniego."""
        r_ner_ohm = 50.0
        directly = build_transformer_zero_seq_model(
            _mk_transformer("YNyn0", hv_neutral=GroundingConfig(type="directly_grounded"))
        )
        ner = build_transformer_zero_seq_model(
            _mk_transformer(
                "YNyn0", hv_neutral=GroundingConfig(type="resistor_grounded", r_ohm=r_ner_ohm)
            )
        )
        assert ner.z0_pu != pytest.approx(directly.z0_pu)


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
            graph=graph,
            fault_node_id=lv,
            c_factor=1.1,
            tk_s=1.0,
            z0_bus=z0_bus,
            czas_tb=czas_tb_roboczy(),
        )
        assert result.z0_ohm == pytest.approx(_hand_zt0_ohm_lv())

    def test_ik1_matches_iec_formula(self):
        """I_k1'' = √3·c·U_n / |Z1 + Z2 + Z0| (IEC 60909, składowe symetryczne)."""
        enm, graph, lv = _build_network()
        z0_bus = build_zero_sequence_zbus(enm, graph)
        result = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=graph,
            fault_node_id=lv,
            c_factor=1.1,
            tk_s=1.0,
            z0_bus=z0_bus,
            czas_tb=czas_tb_roboczy(),
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
            graph=g_a,
            fault_node_id=lv_a,
            c_factor=1.1,
            tk_s=1.0,
            z0_bus=z0_a,
            czas_tb=czas_tb_roboczy(),
        )
        r_b = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=g_b,
            fault_node_id=lv_b,
            c_factor=1.1,
            tk_s=1.0,
            z0_bus=z0_b,
            czas_tb=czas_tb_roboczy(),
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
            graph=g_a,
            fault_node_id=lv_a,
            c_factor=1.1,
            tk_s=1.0,
            z0_bus=z0_a,
            czas_tb=czas_tb_roboczy(),
        )
        r_b = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=g_b,
            fault_node_id=lv_b,
            c_factor=1.1,
            tk_s=1.0,
            z0_bus=z0_b,
            czas_tb=czas_tb_roboczy(),
        )
        assert r_b.z0_ohm != pytest.approx(r_a.z0_ohm)


# ---------------------------------------------------------------------------
# 2b) Audyt fizyki fala F: pojemność doziemna linii/kabli (B0) w sieci Z0.
#     Sieć IZOLOWANA (bez uziemienia punktu neutralnego nigdzie) — jedyna
#     droga powrotu prądu zerowego to pojemność doziemna kabla. Przed naprawą
#     Y0 była tu macierzą OSOBLIWĄ (brak jakiegokolwiek bocznika do ziemi) —
#     build_zero_sequence_zbus rzucał ValueError. Hand-calc: obwód 2-węzłowy
#     (blv=A, b2=B) z JEDNĄ gałęzią niosącą Z0 szeregowe I B0 bocznikowe;
#     transformator Dyn11+izolowany LV blokuje/nie wnosi Z0 (OPEN), źródło
#     odcięte deltą HV — jedyne admitancje w podsieci {A,B} to y_s (szereg
#     kabla) i y_sh (bocznik B0/2 na każdym końcu).
# ---------------------------------------------------------------------------


def _build_isolated_cable_network(
    b0_siemens_per_km: float | None,
    lv_neutral: GroundingConfig | None = None,
):
    """Sieć SN za TR Dyn11 (trójkąt HV blokuje Z0 źródła), jeden kabel blv→b2 z B0 jawnym.
    ``lv_neutral`` — punkt neutralny uzwojenia SN (domyślnie izolowany: jedyna droga zerowa to
    pojemność doziemna kabla)."""
    ulv_kv = 15.0
    r0_per_km, x0_per_km, length_km = 0.6, 0.3, 10.0
    enm = EnergyNetworkModel(
        header=ENMHeader(name="F-shunt-c0"),
        buses=[
            Bus(ref_id="bhv", name="HV", voltage_kv=110.0),
            Bus(ref_id="blv", name="LV", voltage_kv=ulv_kv),
            Bus(ref_id="b2", name="B2", voltage_kv=ulv_kv),
        ],
        sources=[
            Source(
                ref_id="src",
                name="Siec",
                bus_ref="bhv",
                model="thevenin",
                r_ohm=0.8,
                x_ohm=8.0,
                r0_ohm=0.16,
                x0_ohm=1.6,
            ),
        ],
        transformers=[
            Transformer(
                ref_id="tr1",
                name="TR",
                hv_bus_ref="bhv",
                lv_bus_ref="blv",
                sn_mva=_SN_MVA,
                uhv_kv=_UHV_KV,
                ulv_kv=ulv_kv,
                uk_percent=_UK_PCT,
                pk_kw=_PK_KW,
                vector_group="Dyn11",
                lv_neutral=lv_neutral or GroundingConfig(type="isolated"),
            )
        ],
        branches=[
            Cable(
                ref_id="c1",
                name="C1",
                from_bus_ref="blv",
                to_bus_ref="b2",
                length_km=length_km,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.1,
                r0_ohm_per_km=r0_per_km,
                x0_ohm_per_km=x0_per_km,
                b0_siemens_per_km=b0_siemens_per_km,
            ),
        ],
    )
    graph = map_enm_to_network_graph(enm)
    b2_node = next(n.id for n in graph.nodes.values() if n.name == "B2")
    return enm, graph, b2_node, ulv_kv, r0_per_km, x0_per_km, length_km


class TestPustaSiecZ0:
    """Partia integracji 11: graf bez węzłów dawał surowy ``ValueError`` numpy
    (``matrix_rank`` na tablicy 0x0) — koperta wejścia zwarcia 1F pustego przypadku kończyła
    się 500. Iloczyn cech: {scenariusz MAX, MIN} × {macierz pusta, ślad pusty} — pusta sieć
    to macierz 0x0, nie wyjątek i nie fabrykacja."""

    @pytest.mark.parametrize("scenariusz", ["MAX", "MIN"])
    def test_pusta_siec_daje_macierz_zerowego_rozmiaru(self, scenariusz):
        enm = EnergyNetworkModel(header=ENMHeader(name="Pusta", revision=1))
        graph = map_enm_to_network_graph(enm)
        z0 = build_zero_sequence_zbus(enm, graph, scenario=scenariusz)
        assert z0.shape == (0, 0)
        assert z0.dtype == complex

    def test_pusta_siec_koperta_zwarcia_1f_bez_wyjatku(self):
        enm = EnergyNetworkModel(header=ENMHeader(name="Pusta", revision=1))
        for scenariusz in ("max", "min"):
            wejscie = zloz_wejscie_zwarcia(
                enm.model_dump(mode="json"), {"fault_type": "1F", "scenario": scenariusz}
            )
            assert len(wejscie.graph.nodes) == 0


def _k_reczny(z1: complex, z0: complex) -> float:
    """Wyrocznia współczynnika zwarcia doziemnego (IEC 60071-1) niezależna od kodu programu:
    napięcia faz zdrowych przy zwarciu 1F metalicznym fazy a, Z_2 = Z_1 —
    U_b/U_f = |a² − (Z0 − Z1)/(2·Z1 + Z0)|, U_c/U_f = |a − (Z0 − Z1)/(2·Z1 + Z0)|."""
    a = complex(-0.5, math.sqrt(3.0) / 2.0)
    m = (z0 - z1) / (2.0 * z1 + z0)
    return max(abs(a * a - m), abs(a - m))


#: Punkt neutralny uzwojenia SN transformatora Dyn11 × oczekiwane wejście B0 do Y0 zwarć:
#: rezystor 40 Ω (Z0 ≫ Z1, k ≈ √3 > 1,4) — B0 wchodzi; uziemienie bezpośrednie (Z0 rzędu Z1,
#: k ≈ 1,26 ≤ 1,4) — B0 nie wchodzi; izolowany — poza zakresem IEC 60909 (rozdz. 1), B0 nie
#: wchodzi (prąd pojemnościowy liczy doziemienie sieci).
_PUNKTY_NEUTRALNE = {
    "rezystor": GroundingConfig(type="resistor_grounded", r_ohm=40.0),
    "bezposrednie": GroundingConfig(type="directly_grounded"),
    "izolowany": GroundingConfig(type="isolated"),
}


class TestLineShuntCapacitanceZ0:
    """Pojemność doziemna B0 w sieci zerowej zwarć IEC 60909 — warunek pkt 5.2 f) (karta
    ZEROWA-POJEMNOSCI): B0 wchodzi WYŁĄCZNIE w sieci uziemionej przez małą impedancję
    o współczynniku zwarcia doziemnego k > 1,4 (k z Z1 i Z0 BEZ pojemności). Dawniej (fala F)
    B0 wchodziło bezwarunkowo, a sieć izolowana liczyła „zwarcie 1F” z samej pojemności — prąd
    pojemnościowy nie jest prądem zwarciowym IEC 60909 (rozdz. 1); liczy go doziemienie sieci.

    ILOCZYN: punkt neutralny {rezystor, bezpośrednio, izolowany} × B0 {jest, zero, brak} —
    wynik Z0 z wyroczni ręcznej obwodu (szereg kabla, bocznik uzwojenia, bocznik B0 tylko przy
    k > 1,4), krok śladu warunku z k z wyroczni niezależnej, przyczyna braku wyniku."""

    @staticmethod
    def _z0_reczne_pu(
        z_base_ohm: float, z0_kabla_ohm: complex, z0_uzwojenia_ohm: complex, b0_s: float
    ) -> tuple[complex, complex]:
        """Z0 węzłów (blv, b2) [pu] obwodu: bocznik uzwojenia w blv, szereg kabla blv–b2,
        bocznik jB0·l/2 na każdym końcu (``b0_s`` = 0 — bez pojemności)."""
        y_t = 1.0 / (z0_uzwojenia_ohm / z_base_ohm)
        y_s = 1.0 / (z0_kabla_ohm / z_base_ohm)
        y_sh = complex(0.0, b0_s * z_base_ohm) / 2.0
        a, d = y_t + y_s + y_sh, y_s + y_sh
        det = a * d - y_s * y_s
        return d / det, a / det

    @pytest.mark.parametrize("b0", [3.0e-6, 0.0, None], ids=["b0", "b0_zero", "b0_brak"])
    @pytest.mark.parametrize("neutralny", sorted(_PUNKTY_NEUTRALNE))
    def test_b0_w_y0_wylacznie_przy_k_powyzej_progu(self, neutralny, b0):
        from enm.mapping import zbuduj_siec_zerowa
        from network_model.solvers.short_circuit_core import build_zbus

        konfiguracja = _PUNKTY_NEUTRALNE[neutralny]
        enm, graph, b2, ulv_kv, r0_per_km, x0_per_km, length_km = _build_isolated_cable_network(
            b0_siemens_per_km=b0, lv_neutral=konfiguracja
        )
        siec = zbuduj_siec_zerowa(enm, graph)
        slad = {k["key"]: k for k in siec.slad}
        z_base_ohm = (ulv_kv**2) / S_BASE_MVA
        z0_kabla = complex(r0_per_km, x0_per_km) * length_km
        if neutralny == "izolowany":
            assert {p.przyczyna for p in siec.przyczyny.values()} == {"poza_zakresem_iec60909"}
            assert "z0_line_shunt[c1]" not in slad
            if b0:
                (krok,) = (k for key, k in slad.items() if key.startswith("z0_warunek"))
                assert krok["result"] == {"k_max": None, "pojemnosci_w_y0": False}
            return
        assert siec.przyczyny == {}
        z0_uzwojenia = _hand_zt0_ohm_lv() + 3.0 * (konfiguracja.r_ohm or 0.0)
        # k z wyroczni niezależnej: Z1 sieci zwarciowej, Z0 obwodu bez pojemności.
        builder, z1_bus = build_zbus(graph)
        z0_bez_c = self._z0_reczne_pu(z_base_ohm, z0_kabla, z0_uzwojenia, 0.0)
        k_max = max(
            _k_reczny(complex(z1_bus[builder.node_id_to_index[w], builder.node_id_to_index[w]]), z0)
            for w, z0 in zip(
                (next(n.id for n in graph.nodes.values() if n.name == "LV"), b2),
                z0_bez_c,
                strict=True,
            )
        )
        wchodzi = bool(b0) and k_max > 1.4
        assert wchodzi is (neutralny == "rezystor" and bool(b0))
        assert ("z0_line_shunt[c1]" in slad) is wchodzi
        if b0:
            (krok,) = (k for key, k in slad.items() if key.startswith("z0_warunek"))
            assert krok["result"]["k_max"] == pytest.approx(k_max, abs=1e-6)
            assert krok["result"]["pojemnosci_w_y0"] is wchodzi
            assert "5.2 f)" in krok["notes"] and "1,4" in krok["notes"]
        else:
            assert not any(key.startswith("z0_warunek") for key in slad)
        result = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
            graph=graph,
            fault_node_id=b2,
            c_factor=1.1,
            tk_s=1.0,
            z0_bus=siec.z0_bus,
            czas_tb=czas_tb_roboczy(),
        )
        z0_b2_pu = self._z0_reczne_pu(
            z_base_ohm, z0_kabla, z0_uzwojenia, (b0 or 0.0) * length_km if wchodzi else 0.0
        )[1]
        assert result.z0_ohm == pytest.approx(z0_b2_pu * z_base_ohm, rel=1e-9)

    def test_b0_ujemne_to_odmowa_nazwana(self):
        from enm.mapping import zbuduj_siec_zerowa

        enm, graph, *_ = _build_isolated_cable_network(
            b0_siemens_per_km=-1.0e-6, lv_neutral=_PUNKTY_NEUTRALNE["rezystor"]
        )
        with pytest.raises(OdmowaDanychError, match="B′0 .* jest ujemna"):
            zbuduj_siec_zerowa(enm, graph)

    @pytest.mark.parametrize("b0", [1.0e-4, 0.0, None], ids=["b0", "b0_zero", "b0_brak"])
    def test_siec_nn_izolowana_pojemnosc_klasyfikuje_droge_zerowa(self, b0):
        """Poza siecią SN (tu sieć nN IT za TR Dyn11 z punktem neutralnym izolowanym) przyczynę
        braku wyniku zerowego wyznacza klasyfikacja boczników Y0, nie sposób pracy punktu
        neutralnego sekcji SN: pojemność doziemna odcinka jest fizyczną drogą prądu zerowego
        (doziemienie pojemnościowe — poza zakresem IEC 60909), jej brak (B′0 = 0 albo
        nieznane, bez wartości roboczej w nN) — brak drogi. W obu przypadkach B0 nie wchodzi
        do macierzy Y0 (sieć bez bocznika rezystancyjnego), a blok domyka kotwica."""
        from enm.mapping import zbuduj_siec_zerowa

        enm = EnergyNetworkModel(
            header=ENMHeader(name="nN-IT"),
            buses=[
                Bus(ref_id="bsn", name="SN", voltage_kv=15.0),
                Bus(ref_id="bnn", name="nN", voltage_kv=0.4),
                Bus(ref_id="bnn2", name="nN odbiór", voltage_kv=0.4),
            ],
            sources=[
                Source(
                    ref_id="src",
                    name="Sieć SN",
                    bus_ref="bsn",
                    model="thevenin",
                    r_ohm=0.2,
                    x_ohm=2.0,
                    r0_ohm=0.4,
                    x0_ohm=4.0,
                )
            ],
            transformers=[
                Transformer(
                    ref_id="tr_nn",
                    name="TR SN/nN",
                    hv_bus_ref="bsn",
                    lv_bus_ref="bnn",
                    sn_mva=0.63,
                    uhv_kv=15.0,
                    ulv_kv=0.4,
                    uk_percent=6.0,
                    pk_kw=6.5,
                    vector_group="Dyn11",
                    lv_neutral=GroundingConfig(type="isolated"),
                )
            ],
            branches=[
                Cable(
                    ref_id="c_nn",
                    name="Kabel nN",
                    from_bus_ref="bnn",
                    to_bus_ref="bnn2",
                    length_km=0.3,
                    r_ohm_per_km=0.206,
                    x_ohm_per_km=0.08,
                    r0_ohm_per_km=0.824,
                    x0_ohm_per_km=0.32,
                    b0_siemens_per_km=b0,
                )
            ],
        )
        graph = map_enm_to_network_graph(enm)
        siec = zbuduj_siec_zerowa(enm, graph)
        wezly_nn = [n.id for n in graph.nodes.values() if n.name in ("nN", "nN odbiór")]
        oczekiwana = "poza_zakresem_iec60909" if b0 else "brak_drogi"
        assert {siec.przyczyny[w].przyczyna for w in wezly_nn} == {oczekiwana}
        assert "z0_line_shunt[c_nn]" not in {k["key"] for k in siec.slad}
        (kotwica,) = (k for k in siec.slad if k["key"] == "z0_numerical_reference")
        assert {"nN", "nN odbiór"} <= set(kotwica["inputs"]["wezly"])

    def test_siec_izolowana_bez_b0_nie_jest_odmowa_lecz_przyczyna(self):
        """Sieć SN izolowana bez pojemności w modelu: macierz domyka kotwica numeryczna, węzły
        niosą przyczynę „poza zakresem IEC 60909” (sposób pracy punktu neutralnego sieci SN) —
        nie wyjątek osobliwej macierzy."""
        from enm.mapping import zbuduj_siec_zerowa

        enm, graph, b2, *_ = _build_isolated_cable_network(b0_siemens_per_km=None)
        siec = zbuduj_siec_zerowa(enm, graph)
        assert siec.przyczyny[b2].przyczyna == "poza_zakresem_iec60909"
        (kotwica,) = (k for k in siec.slad if k["key"] == "z0_numerical_reference")
        assert "B2" in kotwica["inputs"]["wezly"]
        assert not any(k["key"].startswith("z0_warunek") for k in siec.slad)


# ---------------------------------------------------------------------------
# 3) Zwarcie 2F-Z (dwufazowe doziemne) — spójność z Z1/Z2/Z0
# ---------------------------------------------------------------------------


class TestHandCalc2FZ:
    def test_2fz_uses_parallel_z2_z0(self):
        """2F-Z: Z_k = Z1 + (Z2·Z0)/(Z2+Z0) (IEC 60909). Z0 z modelu Dyn."""
        enm, graph, lv = _build_network()
        z0_bus = build_zero_sequence_zbus(enm, graph)
        result = ShortCircuitIEC60909Solver.compute_2ph_ground_short_circuit(
            graph=graph,
            fault_node_id=lv,
            c_factor=1.1,
            tk_s=1.0,
            z0_bus=z0_bus,
            czas_tb=czas_tb_roboczy(),
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
        trace = build_zero_sequence_zbus_with_trace(enm, graph)[1]
        keys = [s["key"] for s in trace]
        assert any(k.startswith("z0_source[") for k in keys)
        assert any("tr_z0_conn[" in k for k in keys)

    def test_trace_deterministic(self):
        enm, graph, _ = _build_network()
        assert (
            build_zero_sequence_zbus_with_trace(enm, graph)[1]
            == build_zero_sequence_zbus_with_trace(enm, graph)[1]
        )
