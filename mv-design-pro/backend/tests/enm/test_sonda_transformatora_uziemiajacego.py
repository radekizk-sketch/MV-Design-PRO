"""Sonda D1 (karta POLA-GPZ-SZABLONY): ten sam punkt neutralny na źródle GPZ i na transformatorze
uziemiającym ZNyn11 pola zespołu uziemiającego (ENEA Operator, Stacje 110 kV, Zeszyt 1 §16 s.30,
Z.13–Z.15) daje I″k1 zgodne z teorią składowej zerowej.

Teoria (składowe symetryczne, IEC 60909-0 §4.3.1 wzór 29): zygzak uziemiony to bocznik zacisku
SN do ziemi o impedancji Z_0 = Z_0,zyg + 3·Z_N. Z_0,zyg — impedancja zerowa na fazę uzwojenia
zygzakowego z parametru R0/X0 transformatora (IEC 60076-6; decyzja architekta karty: NIE z u_k,
które opisuje parę uzwojeń GN–DN), a bez parametru — wartość robocza
``pochodne.impedancja_zerowa_zygzaka_robocza_ohm``. Zatem:

* źródło z jawną impedancją zerową Z_0,Q = Z_0,zyg + 3·Z_N i transformator bez uziemienia ≡
  źródło bez drogi zerowej i transformator ZNyn11 z Z_N — I″k1 identyczne (do 1e-9);
* źródło z Z_0,Q = 3·Z_N (ten sam typ uziemienia „na źródle”) różni się od transformatora
  WYŁĄCZNIE o Z_0,zyg, a oba I″k1 spełniają √3·c·U_n/|2·Z_1 + Z_0|;
* u_k i P_k transformatora z zygzakiem NIE wpływają na drogę zerową (iniekcja „Z0 z u_k”).

Iloczyn cech: typ punktu neutralnego (bezpośrednio, rezystor, dławik, dławik z AWSC) × miejsce
nośnika (źródło / transformator) × grupa (ZNyn11, ZNd0) × Z0 zygzaka {z elementu, z wartości
roboczej} × u_k {4 %, 6 %}.
"""

from __future__ import annotations

import math

import pytest
from enm.mapping import build_zero_sequence_zbus, map_enm_to_network_graph
from enm.models import Bus, EnergyNetworkModel, ENMHeader, GroundingConfig, Source, Transformer
from network_model.core.czas_wylaczenia import czas_tb_roboczy
from network_model.pochodne import impedancja_zerowa_zygzaka_robocza_ohm
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


#: Z_0,zyg podana na elemencie (dana producenta) — inna niż wartość robocza.
_Z0_ZYG_ELEMENTU = complex(1.2, 5.5)
Z0_ZYGZAKA = ("element", "robocza")


def _z_t0_ohm_sn(z0_zygzaka: str = "element") -> complex:
    """Z_0,zyg po stronie SN [Ω] — z elementu albo wartość robocza na napięciu SN."""
    if z0_zygzaka == "element":
        return _Z0_ZYG_ELEMENTU
    return impedancja_zerowa_zygzaka_robocza_ohm(_UN_KV)


def _model(
    z0_zrodla: complex | None,
    grupa: str,
    uziemienie: GroundingConfig | None,
    z0_zygzaka: str = "element",
    uk_percent: float = _UK_PCT,
):
    zero = {} if z0_zrodla is None else {"r0_ohm": z0_zrodla.real, "x0_ohm": z0_zrodla.imag}
    z0_tr = (
        {"r0_ohm": _Z0_ZYG_ELEMENTU.real, "x0_ohm": _Z0_ZYG_ELEMENTU.imag}
        if z0_zygzaka == "element"
        else {}
    )
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
                uk_percent=uk_percent,
                pk_kw=_PK_KW,
                vector_group=grupa,
                **z0_tr,
                hv_neutral=(
                    uziemienie if uziemienie is not None else GroundingConfig(type="isolated")
                ),
            )
        ],
    )


def _z0_bus_wezla(enm: EnergyNetworkModel, graph, wezel: str):
    """JEDYNE miejsce sondy, które pobiera Z0-bus. Przy scaleniu z kartą PRZERWA-ZEROWA
    (publiczna droga `enm.mapping.zbuduj_siec_zerowa`, macierz razem z przyczynami braku
    wyniku zerowego) ta funkcja przechodzi na `wynik = zbuduj_siec_zerowa(enm, graph)`,
    `assert wezel not in wynik.przyczyny` i zwraca `wynik.z0_bus` — reszta sondy bez zmian."""
    return build_zero_sequence_zbus(enm, graph)


def _ik1_i_z0(enm: EnergyNetworkModel) -> tuple[float, complex]:
    graph = map_enm_to_network_graph(enm)
    wezel = next(n.id for n in graph.nodes.values() if n.name == "SN")
    z0_bus = _z0_bus_wezla(enm, graph, wezel)
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


@pytest.mark.parametrize("z0_zygzaka", Z0_ZYGZAKA)
@pytest.mark.parametrize("grupa", ["ZNyn11", "ZNd0"])
@pytest.mark.parametrize("typ", sorted(TYPY))
def test_transformator_uziemiajacy_rownowazny_zrodlu_z_impedancja_zerowa_zt0_plus_3zn(
    typ, grupa, z0_zygzaka
):
    cfg, z_n = TYPY[typ]
    z_t0 = _z_t0_ohm_sn(z0_zygzaka)
    ik_tr, z0_tr = _ik1_i_z0(_model(None, grupa, cfg, z0_zygzaka))
    ik_zr, z0_zr = _ik1_i_z0(_model(z_t0 + 3.0 * z_n, grupa, None))
    assert z0_tr == pytest.approx(z_t0 + 3.0 * z_n, rel=1e-9)
    assert z0_zr == pytest.approx(z0_tr, rel=1e-9)
    assert ik_tr == pytest.approx(ik_zr, rel=1e-9)
    assert ik_tr == pytest.approx(_ik1_teoria(z_t0 + 3.0 * z_n), rel=1e-9)


@pytest.mark.parametrize("z0_zygzaka", Z0_ZYGZAKA)
@pytest.mark.parametrize("typ", sorted(TYPY))
def test_ten_sam_typ_na_zrodle_rozni_sie_tylko_impedancja_zerowa_transformatora(typ, z0_zygzaka):
    cfg, z_n = TYPY[typ]
    z_t0 = _z_t0_ohm_sn(z0_zygzaka)
    ik_tr, z0_tr = _ik1_i_z0(_model(None, "ZNyn11", cfg, z0_zygzaka))
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


@pytest.mark.parametrize("z0_zygzaka", Z0_ZYGZAKA)
@pytest.mark.parametrize("grupa", ["ZNyn11", "ZNd0"])
def test_u_k_nie_wplywa_na_droge_zerowa_zygzaka(grupa, z0_zygzaka):
    """Iniekcja „Z0 z u_k zamiast z parametru” zapala ten test: zmiana u_k transformatora
    z zygzakiem nie zmienia Z_0 widzianej z szyny SN, a Z_0 jest rzędu pojedynczych omów
    (wzór u_k dawałby 0,04·15²/0,63 ≈ 14 Ω, a dla 100 kVA 90 Ω)."""
    cfg = TYPY["bezposrednio"][0]
    _, z0_a = _ik1_i_z0(_model(None, grupa, cfg, z0_zygzaka, uk_percent=4.0))
    _, z0_b = _ik1_i_z0(_model(None, grupa, cfg, z0_zygzaka, uk_percent=6.0))
    assert z0_a == pytest.approx(z0_b, rel=1e-12)
    assert z0_a == pytest.approx(_z_t0_ohm_sn(z0_zygzaka), rel=1e-9)
    assert abs(z0_a) < 6.0


def test_impedancja_zerowa_dla_grupy_bez_zygzaka_odrzucona():
    """R0/X0 transformatora bez uzwojenia zygzakowego nie ma skutku w modelu — odmowa walidacji
    zamiast fantomu."""
    with pytest.raises(ValueError, match="zygzakowego"):
        Transformer(
            ref_id="t",
            name="T",
            hv_bus_ref="sn",
            lv_bus_ref="nn",
            sn_mva=0.63,
            uhv_kv=15.0,
            ulv_kv=0.4,
            uk_percent=4.0,
            pk_kw=6.5,
            vector_group="Dyn11",
            r0_ohm=1.0,
            x0_ohm=5.0,
        )


def test_wartosc_robocza_z0_zygzaka_liczbowo():
    """Rachunek ręczny: |Z0| = 3·0,05·(U/√3)/400 A; 15 kV → 3,2476 Ω; 20 kV → 4,3301 Ω; X/R 5."""
    for u_kv, z_abs in ((15.0, 3.247595264), (20.0, 4.330127019)):
        z = impedancja_zerowa_zygzaka_robocza_ohm(u_kv)
        assert abs(z) == pytest.approx(z_abs, rel=1e-9)
        assert z.imag / z.real == pytest.approx(5.0, rel=1e-12)
