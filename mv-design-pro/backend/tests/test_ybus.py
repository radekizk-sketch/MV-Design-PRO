"""
Testy jednostkowe dla AdmittanceMatrixBuilder (Y-bus).
"""

import math

import numpy as np
import pytest
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.ybus import S_BASE_MVA, AdmittanceMatrixBuilder
from network_model.odmowa_danych import OdmowaDanychError


def create_pq_node(node_id: str) -> Node:
    return Node(
        id=node_id,
        name=f"Node {node_id}",
        node_type=NodeType.PQ,
        voltage_level=20.0,
        active_power=5.0,
        reactive_power=2.0,
    )


def create_line_branch(
    branch_id: str,
    from_node_id: str,
    to_node_id: str,
    r_ohm_per_km: float,
    x_ohm_per_km: float,
    b_us_per_km: float,
    length_km: float,
    in_service: bool = True,
) -> LineBranch:
    return LineBranch(
        id=branch_id,
        name=f"Line {branch_id}",
        branch_type=BranchType.LINE,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        in_service=in_service,
        r_ohm_per_km=r_ohm_per_km,
        x_ohm_per_km=x_ohm_per_km,
        b_us_per_km=b_us_per_km,
        length_km=length_km,
        rated_current_a=200.0,
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
    in_service: bool = True,
) -> TransformerBranch:
    return TransformerBranch(
        id=branch_id,
        name=f"Transformer {branch_id}",
        branch_type=BranchType.TRANSFORMER,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        in_service=in_service,
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


def test_ybus_single_line_between_two_nodes():
    graph = NetworkGraph()
    graph.add_node(create_pq_node("A"))
    graph.add_node(create_pq_node("B"))

    line = create_line_branch("AB", "A", "B", 0.2, 0.4, 5.0, 10.0)
    graph.add_branch(line)

    builder = AdmittanceMatrixBuilder(graph)
    y_bus = builder.build()

    z_base = 20.0**2 / S_BASE_MVA
    y_series = line.get_series_admittance() * z_base
    y_shunt = line.get_shunt_admittance_per_end() * z_base

    expected = np.array(
        [
            [y_series + y_shunt, -y_series],
            [-y_series, y_series + y_shunt],
        ],
        dtype=complex,
    )

    np.testing.assert_allclose(y_bus, expected)


def test_ybus_parallel_lines_between_two_nodes():
    graph = NetworkGraph()
    graph.add_node(create_pq_node("A"))
    graph.add_node(create_pq_node("B"))

    line1 = create_line_branch("AB1", "A", "B", 0.2, 0.4, 5.0, 10.0)
    line2 = create_line_branch("AB2", "A", "B", 0.1, 0.3, 8.0, 8.0)

    graph.add_branch(line1)
    graph.add_branch(line2)

    builder = AdmittanceMatrixBuilder(graph)
    y_bus = builder.build()

    z_base = 20.0**2 / S_BASE_MVA
    y_series_total = (line1.get_series_admittance() + line2.get_series_admittance()) * z_base
    y_shunt_total = (
        line1.get_shunt_admittance_per_end() + line2.get_shunt_admittance_per_end()
    ) * z_base

    expected = np.array(
        [
            [y_series_total + y_shunt_total, -y_series_total],
            [-y_series_total, y_series_total + y_shunt_total],
        ],
        dtype=complex,
    )

    np.testing.assert_allclose(y_bus, expected)


def test_ybus_ignores_out_of_service_branch():
    graph = NetworkGraph()
    graph.add_node(create_pq_node("A"))
    graph.add_node(create_pq_node("B"))

    active_line = create_line_branch("AB1", "A", "B", 0.2, 0.4, 5.0, 10.0)
    inactive_line = create_line_branch("AB2", "A", "B", 0.1, 0.3, 8.0, 8.0, in_service=False)

    graph.add_branch(active_line)
    graph.add_branch(inactive_line)

    builder = AdmittanceMatrixBuilder(graph)
    y_bus = builder.build()

    z_base = 20.0**2 / S_BASE_MVA
    y_series = active_line.get_series_admittance() * z_base
    y_shunt = active_line.get_shunt_admittance_per_end() * z_base

    expected = np.array(
        [
            [y_series + y_shunt, -y_series],
            [-y_series, y_series + y_shunt],
        ],
        dtype=complex,
    )

    np.testing.assert_allclose(y_bus, expected)


def test_ybus_includes_isolated_node_in_matrix_size():
    graph = NetworkGraph()
    graph.add_node(create_pq_node("A"))
    graph.add_node(create_pq_node("B"))
    graph.add_node(create_pq_node("C"))

    line = create_line_branch("AB", "A", "B", 0.2, 0.4, 5.0, 10.0)
    graph.add_branch(line)

    builder = AdmittanceMatrixBuilder(graph)
    y_bus = builder.build()

    assert y_bus.shape == (3, 3)

    node_indices = builder.node_id_to_index
    c_index = node_indices["C"]

    assert np.allclose(y_bus[c_index, :], 0.0)
    assert np.allclose(y_bus[:, c_index], 0.0)


def test_transformer_zk_rk_xk_pu():
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

    zk_pu = transformer.uk_percent / 100.0
    rk_pu = (transformer.pk_kw / 1000.0) / transformer.rated_power_mva
    xk_pu = math.sqrt(max(zk_pu * zk_pu - rk_pu * rk_pu, 0.0))

    assert transformer.get_short_circuit_impedance_pu() == complex(rk_pu, xk_pu)
    assert transformer.get_short_circuit_resistance_pu() == rk_pu
    assert transformer.get_short_circuit_reactance_pu() == xk_pu


def test_transformer_impedance_ohm_lv():
    transformer = create_transformer_branch(
        "T1",
        "A",
        "B",
        rated_power_mva=16.0,
        voltage_hv_kv=110.0,
        voltage_lv_kv=15.0,
        uk_percent=6.0,
        pk_kw=40.0,
    )

    zk_pu = transformer.uk_percent / 100.0
    rk_pu = (transformer.pk_kw / 1000.0) / transformer.rated_power_mva
    xk_pu = math.sqrt(max(zk_pu * zk_pu - rk_pu * rk_pu, 0.0))
    z_base_lv = (transformer.voltage_lv_kv**2) / transformer.rated_power_mva
    z_expected = complex(rk_pu, xk_pu) * z_base_lv

    assert transformer.get_short_circuit_impedance_ohm_lv() == z_expected


@pytest.mark.parametrize(("tolerancja", "c_max"), [("PLUS_6", 1.05), ("PLUS_10", 1.10)])
def test_voltage_factor_c_lv(tolerancja, c_max):
    """K_T (IEC 60909-0 eq. 12a): c_max strony dolnej nN z tolerancji sieci nN deklarowanej na
    transformatorze (karta WSPOLCZYNNIK-C-JEDEN-NOSNIK; dawne c_min/I''k strony dolnej bez
    konsumenta w produkcie — skasowane)."""
    transformer = create_transformer_branch(
        "T1",
        "A",
        "B",
        rated_power_mva=25.0,
        voltage_hv_kv=110.0,
        voltage_lv_kv=0.4,
        uk_percent=10.0,
        pk_kw=120.0,
    )
    transformer.tolerancja_nn_dolna = tolerancja

    assert transformer.get_voltage_factor_c_max() == c_max


def test_voltage_factor_c_lv_bez_rozstrzygnietej_tolerancji_to_blad_programu():
    """Karta TOLERANCJA-NN-WARTOSC-ROBOCZA: klasę tolerancji sieci nN strony dolnej rozstrzyga
    mapowanie (deklaracja albo wartość robocza wyspy, `enm.tolerancja_nn`). Gałąź bez klasy
    przy stronie dolnej nN to błąd PROGRAMU (``ValueError``), nie odmowa dziedziny — K_T i c
    nigdy nie biorą wiersza tabeli po cichu."""
    transformer = create_transformer_branch(
        "T1",
        "A",
        "B",
        rated_power_mva=25.0,
        voltage_hv_kv=110.0,
        voltage_lv_kv=0.4,
        uk_percent=10.0,
        pk_kw=120.0,
    )

    with pytest.raises(ValueError) as blad:
        transformer.get_voltage_factor_c_max()
    assert not isinstance(blad.value, OdmowaDanychError)
    with pytest.raises(ValueError):
        transformer.get_kt_correction_factor()


def test_voltage_factor_c_mv():
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

    assert transformer.get_voltage_factor_c_max() == 1.10


def _node_at(node_id: str, voltage_kv: float) -> Node:
    return Node(
        id=node_id,
        name=f"Node {node_id}",
        node_type=NodeType.PQ,
        voltage_level=voltage_kv,
        active_power=5.0,
        reactive_power=2.0,
    )


def test_transformer_stamping_between_two_nodes():
    """Stempel przy szynach ZGODNYCH z tabliczką (110/20 kV) — przekładnia a = 1.

    To jest przypadek odniesienia dla V12K-186: gdy napięcia znamionowe szyn są
    w stosunku równym przekładni transformatora, model z przekładnią redukuje
    się do symetrycznego stempla i macierz jest BIT-IDENTYCZNA jak przed zmianą.
    """
    graph = NetworkGraph()
    graph.add_node(_node_at("A", 110.0))
    graph.add_node(_node_at("B", 20.0))

    transformer = create_transformer_branch(
        "T1",
        "A",
        "B",
        rated_power_mva=20.0,
        voltage_hv_kv=110.0,
        voltage_lv_kv=20.0,
        uk_percent=8.0,
        pk_kw=60.0,
    )
    graph.add_branch(transformer)

    builder = AdmittanceMatrixBuilder(graph)
    y_bus = builder.build()

    # IEC 60909-0 §3.3.3: the SC/Z-bus network stamps the K_T-corrected network
    # transformer impedance Z_TK = K_T·(R_T + jX_T), not the nominal impedance.
    z_pu_sn = transformer.get_short_circuit_impedance_pu_corrected()
    z_pu_base = z_pu_sn * (S_BASE_MVA / transformer.rated_power_mva)
    y_series = 1.0 / z_pu_base
    expected = np.array(
        [
            [y_series, -y_series],
            [-y_series, y_series],
        ],
        dtype=complex,
    )

    np.testing.assert_allclose(y_bus, expected)


def test_transformer_stamping_uses_bus_voltage_base_and_off_nominal_ratio():
    """Szyna LV NIEZGODNA z tabliczką ⇒ zmiana bazy + przekładnia poza-znamionowa.

    V12K-186: transformator katalogowy 110/20 kV pracujący na szynie 21 kV.
    Przeliczenie na bazę systemową wymaga członu (U_lv_TR/U_szyny)², a różnica
    przekładni znamionowej i bazowej daje a = (110/110)/(20/21) = 1,05. Bez tych
    dwóch członów macierz opisywała INNY transformator niż model — i to cicho,
    bo walidator porównuje napięcia szyn tylko względem siebie.
    """
    graph = NetworkGraph()
    graph.add_node(_node_at("A", 110.0))
    graph.add_node(_node_at("B", 21.0))

    transformer = create_transformer_branch(
        "T1",
        "A",
        "B",
        rated_power_mva=20.0,
        voltage_hv_kv=110.0,
        voltage_lv_kv=20.0,
        uk_percent=8.0,
        pk_kw=60.0,
    )
    graph.add_branch(transformer)

    y_bus = AdmittanceMatrixBuilder(graph).build()

    v_scale = 20.0 / 21.0
    z_pu_base = (
        transformer.get_short_circuit_impedance_pu_corrected()
        * (S_BASE_MVA / transformer.rated_power_mva)
        * v_scale**2
    )
    y_series = 1.0 / z_pu_base
    ratio = (110.0 / 110.0) / v_scale  # = 1.05
    expected = np.array(
        [
            [y_series / ratio**2, -y_series / ratio],
            [-y_series / ratio, y_series],
        ],
        dtype=complex,
    )

    np.testing.assert_allclose(y_bus, expected)
    # Stempel jest ASYMETRYCZNY (a ≠ 1) — to odróżnia poprawny model od starego.
    assert y_bus[0, 0] != y_bus[1, 1]


def test_transformer_stamping_follows_tap_position():
    """Zaczep zmienia przekładnię także w sieci ZWARCIOWEJ (V12K-186).

    Do V12K-186 macierz zwarciowa ignorowała pozycję zaczepu, więc rozpływ mocy
    i zwarcie widziały DWA różne transformatory tego samego modelu. Źródłem
    przekładni jest `get_tap_ratio()` — ta sama metoda domenowa, z której
    korzysta Y-bus rozpływu.
    """

    def build(tap: int) -> np.ndarray:
        graph = NetworkGraph()
        graph.add_node(_node_at("A", 110.0))
        graph.add_node(_node_at("B", 20.0))
        tr = create_transformer_branch(
            "T1",
            "A",
            "B",
            rated_power_mva=20.0,
            voltage_hv_kv=110.0,
            voltage_lv_kv=20.0,
            uk_percent=8.0,
            pk_kw=60.0,
        )
        tr.tap_position = tap
        tr.tap_step_percent = 1.5
        graph.add_branch(tr)
        return AdmittanceMatrixBuilder(graph).build()

    y0 = build(0)
    y5 = build(5)
    # Strona LV (indeks 1) jest odniesieniem admitancji — bez zmian.
    np.testing.assert_allclose(y0[1, 1], y5[1, 1])
    # Strona HV i sprzężenie skalują się przekładnią 1 + 5·1,5% = 1,075.
    ratio = 1.075
    np.testing.assert_allclose(y5[0, 0], y0[0, 0] / ratio**2, rtol=1e-12)
    np.testing.assert_allclose(y5[0, 1], y0[0, 1] / ratio, rtol=1e-12)


def test_transformer_ignored_when_out_of_service():
    graph = NetworkGraph()
    graph.add_node(create_pq_node("A"))
    graph.add_node(create_pq_node("B"))

    transformer = create_transformer_branch(
        "T1",
        "A",
        "B",
        rated_power_mva=20.0,
        voltage_hv_kv=110.0,
        voltage_lv_kv=20.0,
        uk_percent=8.0,
        pk_kw=60.0,
        in_service=False,
    )
    graph.add_branch(transformer)

    builder = AdmittanceMatrixBuilder(graph)
    y_bus = builder.build()

    expected = np.zeros((2, 2), dtype=complex)
    np.testing.assert_allclose(y_bus, expected)
