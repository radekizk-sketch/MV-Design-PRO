"""CV-4.3 K6: impedancja zasilania systemowego Z_Q z współczynnikiem c (IEC 60909-0:2016 §6.2.1 eq. 6).

Klasa defektu (pomiar 2026-09-06, ``scratchpad/karta_cv43_k6.md``): ``enm/mapping.py`` liczyło
Z_Q = U²/Sk'' BEZ c, więc bieg kanoniczny w samym węźle przyłączenia dawał Ik'' = c·I''_kQ —
o 10 % (SN/WN) / 5 % (nN) ponad prąd DEKLAROWANY przez OSD (rejestr równań dowodu
EQ_SC3F_002 i wyrocznia P0.3 zakładały c; most pandapower kompensował różnicę). Po K6:
Z_Q = c_max·U_nQ²/S''_kQ, więc Ik''(PCC, MAX) = I''_kQ dokładnie.

Iloczyn cech: {110 kV, 15 kV, 0,4 kV} × {MAX, MIN} × {tryb mocy zwarciowej, impedancja
jawna} × {PCC, szyna za transformatorem} × {ślad White Box, podgląd FROZEN, sekwencja
zerowa}.
"""

from __future__ import annotations

import math

import pytest
from enm.mapping import (
    _source_positive_impedance_ohm,
    _source_zero_impedance_ohm,
    build_grid_source_trace,
    impedancja_zrodla_sieciowego,
    map_enm_to_network_graph,
)
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Source, Transformer
from network_model.core.voltage_factor import c_for_node
from network_model.solvers.grid_source_preview import (
    GridSourcePreviewInput,
    compute_grid_source_preview,
)
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

from tests.golden.parytet_assemblera.harness import _bieg

PASMA = [(110.0, 4000.0, "SN/WN"), (15.0, 250.0, "SN/WN"), (0.4, 10.0, "nN")]


def _enm_pcc(u_kv: float, sk_mva: float, rx: float | None = 0.1) -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="k6"),
        buses=[Bus(ref_id="b1", name="B1", voltage_kv=u_kv)],
        sources=[
            Source(
                ref_id="s1",
                name="Grid",
                bus_ref="b1",
                model="short_circuit_power",
                sk3_mva=sk_mva,
                rx_ratio=rx,
            )
        ],
    )


def _ik_deklarowane_a(u_kv: float, sk_mva: float) -> float:
    return sk_mva / (math.sqrt(3.0) * u_kv) * 1000.0


@pytest.mark.parametrize(("u_kv", "sk_mva", "pasmo"), PASMA)
def test_z_q_rowna_sie_c_max_u2_przez_sk(u_kv: float, sk_mva: float, pasmo: str) -> None:
    enm = _enm_pcc(u_kv, sk_mva)
    z_q = _source_positive_impedance_ohm(enm.sources[0], u_kv)
    assert z_q is not None
    c_max = c_for_node(u_kv, "MAX")
    assert abs(z_q) == pytest.approx(c_max * u_kv**2 / sk_mva, rel=1e-12)
    assert z_q.real / z_q.imag == pytest.approx(0.1, rel=1e-12)
    wpis = build_grid_source_trace(enm)[0]
    assert wpis["tryb"] == "MOC_ZWARCIOWA"
    assert wpis["c"] == c_max and wpis["pasmo_c"] == pasmo
    assert wpis["sk3_mva"] == sk_mva and wpis["u_nq_kv"] == u_kv
    assert wpis["rx_ratio_zrodlo"] == "MODEL"
    assert "eq. 6" in wpis["formula"]
    assert wpis["z_q_ohm"] == {"re": z_q.real, "im": z_q.imag}


@pytest.mark.parametrize(("u_kv", "sk_mva", "pasmo"), PASMA)
def test_bieg_w_pcc_odtwarza_prad_deklarowany_osd(u_kv: float, sk_mva: float, pasmo: str) -> None:
    """Ik''(PCC, MAX) = I''_kQ = S''_kQ/(√3·U_nQ) — bez c z K6 wychodziło c·I''_kQ."""
    graph = map_enm_to_network_graph(_enm_pcc(u_kv, sk_mva))
    node_id = next(iter(graph.nodes))
    solver = ShortCircuitIEC60909Solver()
    ik_max = solver.compute_3ph_short_circuit(graph, node_id, c_for_node(u_kv, "MAX"), 1.0)
    ik_min = solver.compute_3ph_short_circuit(graph, node_id, c_for_node(u_kv, "MIN"), 1.0)
    deklarowane = _ik_deklarowane_a(u_kv, sk_mva)
    assert ik_max.ikss_a == pytest.approx(deklarowane, rel=1e-9)
    # MIN: Z_Q z (c_max, Sk''max) = impedancja fizyczna; c_min tylko w źródle napięciowym
    assert ik_min.ikss_a == pytest.approx(
        deklarowane * c_for_node(u_kv, "MIN") / c_for_node(u_kv, "MAX"), rel=1e-9
    )


@pytest.mark.parametrize(("u_kv", "sk_mva", "pasmo"), PASMA)
def test_podglad_frozen_i_bieg_zgadzaja_sie_w_pcc(u_kv: float, sk_mva: float, pasmo: str) -> None:
    """Podgląd źródła (solver FROZEN, c=1 przy Z=U²/Sk) i bieg kanoniczny dają TEN SAM Ik3
    w węźle przyłączenia — dwie ścieżki, jedna liczba (przed K6 różniły się o c)."""
    podglad = compute_grid_source_preview(
        GridSourcePreviewInput(
            voltage_kv=u_kv, short_circuit_mode="SHORT_CIRCUIT_POWER", sk3_mva=sk_mva, rx_ratio=0.1
        )
    )
    graph = map_enm_to_network_graph(_enm_pcc(u_kv, sk_mva))
    node_id = next(iter(graph.nodes))
    bieg = ShortCircuitIEC60909Solver().compute_3ph_short_circuit(
        graph, node_id, c_for_node(u_kv, "MAX"), 1.0
    )
    assert bieg.ikss_a / 1000.0 == pytest.approx(podglad.ik3_ka, rel=1e-9)


def test_impedancja_jawna_bez_c_i_bez_zmian() -> None:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="k6"),
        buses=[Bus(ref_id="b1", name="B1", voltage_kv=15.0)],
        sources=[
            Source(
                ref_id="s1",
                name="Grid",
                bus_ref="b1",
                model="thevenin",
                r_ohm=0.09,
                x_ohm=0.9,
            )
        ],
    )
    wynik = impedancja_zrodla_sieciowego(enm.sources[0], 15.0)
    assert wynik is not None
    z_q, wpis = wynik
    assert z_q == complex(0.09, 0.9)
    assert wpis["tryb"] == "IMPEDANCJA_JAWNA" and "c" not in wpis


def test_zrodlo_bez_danych_nie_ma_impedancji_ani_sladu() -> None:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="k6"),
        buses=[Bus(ref_id="b1", name="B1", voltage_kv=15.0)],
        sources=[Source(ref_id="s1", name="Grid", bus_ref="b1", model="short_circuit_power")],
    )
    assert impedancja_zrodla_sieciowego(enm.sources[0], 15.0) is None
    assert build_grid_source_trace(enm) == []
    assert map_enm_to_network_graph(enm).get_grid_sc_sources() == []


def test_rx_domyslne_iec_oznaczone_w_sladzie() -> None:
    enm = _enm_pcc(15.0, 250.0, rx=None)
    wpis = build_grid_source_trace(enm)[0]
    assert wpis["rx_ratio"] == 0.1 and wpis["rx_ratio_zrodlo"] == "IEC_60909_DOMYSLNY_0_1"


def _enm_za_transformatorem() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="k6-trafo"),
        buses=[
            Bus(ref_id="hv", name="HV", voltage_kv=110.0),
            Bus(ref_id="mv", name="MV", voltage_kv=33.0),
        ],
        sources=[
            Source(
                ref_id="s1",
                name="Grid",
                bus_ref="hv",
                model="short_circuit_power",
                sk3_mva=4000.0,
                rx_ratio=0.1,
                z0_z1_ratio=1.5,
            )
        ],
        transformers=[
            Transformer(
                ref_id="t1",
                name="T1",
                hv_bus_ref="hv",
                lv_bus_ref="mv",
                sn_mva=25.0,
                uhv_kv=110.0,
                ulv_kv=33.0,
                uk_percent=10.0,
                pk_kw=0.0,
                vector_group="YNd11",
            )
        ],
    )


def test_szyna_za_transformatorem_niesie_z_q_z_c() -> None:
    """Sieć iec60909_example (A1): Z_Q' przy 33 kV = c_max·U²/Sk''·(33/110)²; Ik'' 3F
    z pełnym wyprowadzeniem IEC 60909 (K_T dla transformatora sieciowego)."""
    graph = map_enm_to_network_graph(_enm_za_transformatorem())
    z_q = graph.get_grid_sc_sources()[0].z_ohm
    assert abs(z_q) == pytest.approx(1.1 * 110.0**2 / 4000.0, rel=1e-12)
    mv = next(n for n in graph.nodes.values() if n.voltage_level == 33.0)
    res = ShortCircuitIEC60909Solver().compute_3ph_short_circuit(graph, mv.id, 1.1, 1.0)
    z_q_33 = z_q * (33.0 / 110.0) ** 2
    k_t = 0.95 * 1.1 / (1.0 + 0.6 * 0.10)
    z_t = complex(0.0, 0.10 * 33.0**2 / 25.0) * k_t
    z_k = z_q_33 + z_t
    assert res.ikss_a == pytest.approx(1.1 * 33000.0 / (math.sqrt(3.0) * abs(z_k)), rel=1e-6)


def test_sekwencja_zerowa_idzie_za_z_q_z_c() -> None:
    """Z0 źródła = (Z0/Z1)·Z_Q — jedna funkcja Z_Q, więc c wchodzi też do sekwencji zerowej."""
    enm = _enm_za_transformatorem()
    z_q = _source_positive_impedance_ohm(enm.sources[0], 110.0)
    z0 = _source_zero_impedance_ohm(enm.sources[0], 110.0)
    assert z_q is not None and z0 is not None
    assert z0 == z_q * 1.5
    assert abs(z0) == pytest.approx(1.5 * 1.1 * 110.0**2 / 4000.0, rel=1e-12)


def test_bieg_kanoniczny_publikuje_slad_z_q() -> None:
    run = _bieg(
        _enm_za_transformatorem(),
        klucz="k6-slad",
        analysis_type="short_circuit_sn",
        options={"fault_type": "3F", "scenario": "max", "thermal_time_seconds": 1.0},
    )
    from enm.canonical_analysis import _execute_short_circuit

    _execute_short_circuit(run)
    slad = run.raw_result["zrodla_sieciowe"]
    assert len(slad) == 1 and slad[0]["ref_id"] == "s1" and slad[0]["c"] == 1.1
    assert slad[0]["z_q_ohm"]["im"] > 0
