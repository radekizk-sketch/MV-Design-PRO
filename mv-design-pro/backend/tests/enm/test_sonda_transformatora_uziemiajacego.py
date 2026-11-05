"""Sonda D1 (karta POLA-GPZ-SZABLONY): ten sam punkt neutralny na źródle GPZ i na transformatorze
uziemiającym ZNyn11 pola zespołu uziemiającego (ENEA Operator, Stacje 110 kV, Zeszyt 1 §16 s.30,
Z.13–Z.15) daje I″k1 zgodne z teorią składowej zerowej.

Teoria (składowe symetryczne, IEC 60909-0 §4.3.1 wzór 29): zygzak uziemiony to bocznik zacisku
SN do ziemi o impedancji Z_0 = Z_T0 + 3·Z_N (Z_T0 — impedancja zerowa transformatora, w modelu
równa impedancji rozproszenia, ``zero_sequence_transformer``). Zatem:

* źródło z jawną impedancją zerową Z_0,Q = Z_T0 + 3·Z_N i transformator bez uziemienia ≡
  źródło bez drogi zerowej i transformator ZNyn11 z Z_N — I″k1 identyczne (do 1e-9);
* źródło z Z_0,Q = 3·Z_N (ten sam typ uziemienia „na źródle”) różni się od transformatora
  WYŁĄCZNIE o Z_T0 policzone jawnie w teście, a oba I″k1 spełniają √3·c·U_n/|2·Z_1 + Z_0|.

Iloczyn cech: typ punktu neutralnego (bezpośrednio, rezystor, dławik, dławik z AWSC) × miejsce
nośnika (źródło / transformator) × grupa (ZNyn11, ZNd0).
"""

from __future__ import annotations

import math

import pytest
from enm.mapping import build_zero_sequence_zbus, map_enm_to_network_graph
from enm.models import Bus, EnergyNetworkModel, ENMHeader, GroundingConfig, Source, Transformer
from network_model.core.czas_wylaczenia import czas_tb_roboczy
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

_UN_KV = 15.0
_Z1_OHM = complex(0.35, 3.5)
_SN_MVA = 0.63
_UK_PCT = 4.0
_PK_KW = 6.5
_C = 1.1

TYPY = {
    "bezposrednio": (GroundingConfig(type="directly_grounded"), 0j),
    "rezystor": (GroundingConfig(type="resistor_grounded", r_ohm=40.0), complex(40.0, 0.0)),
    "dlawik": (GroundingConfig(type="petersen_coil", x_ohm=120.0), complex(0.0, 120.0)),
    "dlawik_awsc": (
        GroundingConfig(type="petersen_coil", x_ohm=120.0, awsc_prad_wymuszenia_a=40.0),
        complex(0.0, 120.0),
    ),
}


def _z_t0_ohm_sn() -> complex:
    """Z_T0 po stronie SN [Ω] — jawnie: z = u_k/100, r = P_k/S_rT, x = √(z² − r²), · U²/S_rT."""
    z = _UK_PCT / 100.0
    r = (_PK_KW / 1000.0) / _SN_MVA
    return complex(r, math.sqrt(z * z - r * r)) * (_UN_KV**2 / _SN_MVA)


def _model(z0_zrodla: complex | None, grupa: str, uziemienie: GroundingConfig | None):
    zero = {} if z0_zrodla is None else {"r0_ohm": z0_zrodla.real, "x0_ohm": z0_zrodla.imag}
    return EnergyNetworkModel(
        header=ENMHeader(name="sonda ZU"),
        buses=[
            Bus(ref_id="sn", name="SN", voltage_kv=_UN_KV),
            Bus(ref_id="nn", name="nN", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="gpz",
                name="GPZ",
                bus_ref="sn",
                model="thevenin",
                r_ohm=_Z1_OHM.real,
                x_ohm=_Z1_OHM.imag,
                **zero,
            )
        ],
        transformers=[
            Transformer(
                ref_id="tu",
                name="Transformator uziemiający",
                hv_bus_ref="sn",
                lv_bus_ref="nn",
                sn_mva=_SN_MVA,
                uhv_kv=_UN_KV,
                ulv_kv=0.4,
                uk_percent=_UK_PCT,
                pk_kw=_PK_KW,
                vector_group=grupa,
                hv_neutral=(
                    uziemienie if uziemienie is not None else GroundingConfig(type="isolated")
                ),
            )
        ],
    )


def _ik1_i_z0(enm: EnergyNetworkModel) -> tuple[float, complex]:
    graph = map_enm_to_network_graph(enm)
    wezel = next(n.id for n in graph.nodes.values() if n.name == "SN")
    z0_bus = build_zero_sequence_zbus(enm, graph)
    wynik = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
        graph=graph,
        fault_node_id=wezel,
        c_factor=_C,
        tk_s=1.0,
        z0_bus=z0_bus,
        czas_tb=czas_tb_roboczy(),
    )
    from network_model.core.ybus import AdmittanceMatrixBuilder

    builder = AdmittanceMatrixBuilder(graph)
    builder.build(siec_zwarciowa=True)
    idx = builder.node_id_to_index[wezel]
    z_base = builder.get_zbase_ohm(wezel)
    return wynik.ikss_a, complex(z0_bus[idx, idx]) * z_base


def _ik1_teoria(z0: complex) -> float:
    return math.sqrt(3.0) * _C * _UN_KV * 1000.0 / abs(2.0 * _Z1_OHM + z0)


@pytest.mark.parametrize("grupa", ["ZNyn11", "ZNd0"])
@pytest.mark.parametrize("typ", sorted(TYPY))
def test_transformator_uziemiajacy_rownowazny_zrodlu_z_impedancja_zerowa_zt0_plus_3zn(typ, grupa):
    cfg, z_n = TYPY[typ]
    z_t0 = _z_t0_ohm_sn()
    ik_tr, z0_tr = _ik1_i_z0(_model(None, grupa, cfg))
    ik_zr, z0_zr = _ik1_i_z0(_model(z_t0 + 3.0 * z_n, grupa, None))
    assert z0_tr == pytest.approx(z_t0 + 3.0 * z_n, rel=1e-9)
    assert z0_zr == pytest.approx(z0_tr, rel=1e-9)
    assert ik_tr == pytest.approx(ik_zr, rel=1e-9)
    assert ik_tr == pytest.approx(_ik1_teoria(z_t0 + 3.0 * z_n), rel=1e-9)


@pytest.mark.parametrize("typ", sorted(TYPY))
def test_ten_sam_typ_na_zrodle_rozni_sie_tylko_impedancja_zerowa_transformatora(typ):
    cfg, z_n = TYPY[typ]
    z_t0 = _z_t0_ohm_sn()
    ik_tr, z0_tr = _ik1_i_z0(_model(None, "ZNyn11", cfg))
    if z_n == 0j:
        # Bezpośrednie uziemienie „na źródle” = Z_0,Q zero — solver odmawia admitancji
        # nieskończonej; różnica wobec transformatora to wtedy samo Z_T0.
        assert z0_tr == pytest.approx(z_t0, rel=1e-9)
        return
    ik_zr, z0_zr = _ik1_i_z0(_model(3.0 * z_n, "ZNyn11", None))
    assert z0_tr - z0_zr == pytest.approx(z_t0, rel=1e-9, abs=1e-9)
    assert ik_zr == pytest.approx(_ik1_teoria(3.0 * z_n), rel=1e-9)
    assert ik_tr == pytest.approx(_ik1_teoria(3.0 * z_n + z_t0), rel=1e-9)
    assert ik_tr < ik_zr


def test_awsc_nie_zmienia_impedancji_zerowej_dlawika():
    """Rezystor wymuszający AWSC dołącza automatyka po zwłoce (ZAWSC) — nie wchodzi do Z_0
    zwarcia początkowego."""
    assert _ik1_i_z0(_model(None, "ZNyn11", TYPY["dlawik"][0])) == _ik1_i_z0(
        _model(None, "ZNyn11", TYPY["dlawik_awsc"][0])
    )


def test_zygzak_bez_uziemienia_nie_daje_drogi_zerowej():
    """Kontrola pary: ZNyn11 z punktem izolowanym i źródło bez Z_0 — węzeł SN bez drogi do
    ziemi ma Z_0 → ∞ i I″k1 → 0 (dawniej odniesienie numeryczne 1e6 pu dawało Z_0 ≈ 0, czyli
    prąd sieci uziemionej bezpośrednio — fabrykacja)."""
    ik, z0 = _ik1_i_z0(_model(None, "ZNyn11", GroundingConfig(type="isolated")))
    assert abs(z0) > 1e6
    assert ik < 1e-3 * _ik1_teoria(_z_t0_ohm_sn())
