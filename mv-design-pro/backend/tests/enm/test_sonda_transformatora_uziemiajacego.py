"""Sonda D1 (karta POLA-GPZ-SZABLONY) w modelu jednego nośnika (karta ZU-JEDEN-NOSNIK): bocznik
zerowy transformatora uziemiającego ZNyn11 zespołu uziemiającego (ENEA Operator, Stacje 110 kV,
Zeszyt 1 §16 s.30, Z.13–Z.15) zgodny z teorią składowej zerowej.

Teoria (składowe symetryczne, IEC 60909-0 §4.3.1 wzór 29): zygzak uziemiony to bocznik zacisku
SN do ziemi o impedancji Z_0 = Z_0,zyg + 3·Z_N. Z_0,zyg — impedancja zerowa na fazę uzwojenia
zygzakowego z parametru R0/X0 transformatora (IEC 60076-6; NIE z u_k, które opisuje parę uzwojeń
GN–DN), a bez parametru — wartość robocza ``pochodne.impedancja_zerowa_zygzaka_robocza_ohm``.
Z_N — gałęzie wyposażenia punktu neutralnego z pozycji katalogu (wyrocznia ręczna):
dławik jX_L = j·U_f/I_nastawy; rezystor R_N z katalogu; Z.14 R_N‖jX_L; AWSC załączony
R_W‖jX_L, R_W = U_f/I_W; gałąź za otwartym odłącznikiem nie wchodzi do Z_N.

Dawny wariant tej sondy (model B) porównywał transformator ze źródłem SN o jawnej impedancji
zerowej Z_0,Q = Z_0,zyg + 3·Z_N. W modelu jednej prawdy źródło na szynie SN nie opisuje drogi
zerowej (jego Z0 fizyka pomija — W-W5-02), a impedancję punktu neutralnego opisują gałęzie
z katalogu, nie wpisane wprost R_N/X_N — porównanie straciło przedmiot; jego intencja (Z_0 =
Z_0,zyg + 3·Z_N do 1e-9, u_k bez wpływu) jest sprawdzana wprost na macierzy Z0 jedynej publicznej
drogi ``enm.mapping.zbuduj_siec_zerowa`` i na I″k1 solvera IEC 60909.

Iloczyn cech: wyposażenie {bezpośrednio, rezystor (Z.15), dławik (Z.13 bez AWSC), dławik
z AWSC × {spoczynek, załączony}, dławik ‖ rezystor (Z.14), Z.14 z otwartym odłącznikiem rezystora,
Z.14 z otwartym odłącznikiem dławika} × grupa (ZNyn11, ZNd0) × Z0 zygzaka {z elementu, z wartości
roboczej} × u_k {4 %, 6 %}.
"""

from __future__ import annotations

import math
from typing import Any

import pytest
from enm.mapping import map_enm_to_network_graph, zbuduj_siec_zerowa
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Source, Transformer
from network_model.catalog.mv_zespol_uziemiajacy_catalog import (
    get_all_neutral_earthing_resistor_records,
)
from network_model.core.czas_wylaczenia import czas_tb_roboczy
from network_model.core.ybus import AdmittanceMatrixBuilder
from network_model.pochodne import impedancja_zerowa_zygzaka_robocza_ohm
from network_model.solvers.short_circuit_iec60909 import ShortCircuitIEC60909Solver

from tests.utils.zespol_uziemiajacy import zespol_uziemiajacy_rekordy

_UN_KV = 15.0
_U_F_V = _UN_KV * 1e3 / math.sqrt(3.0)
_Z1_OHM = complex(0.35, 3.5)
_C = 1.1
_REZYSTOR = "REZ_200A_15KV"
_I_NASTAWY_A = 100.0
_I_AWSC_A = 30.0
_R_N = float(
    next(r for r in get_all_neutral_earthing_resistor_records() if r["id"] == _REZYSTOR)["params"][
        "r_ohm"
    ]
)
_X_L = _U_F_V / _I_NASTAWY_A
_R_W = _U_F_V / _I_AWSC_A


def _rownolegle(a: complex, b: complex) -> complex:
    return a * b / (a + b)


#: Wyposażenie → (wariant operacji, modyfikacja hv_neutral, stan AWSC, Z_N wyroczni [Ω]).
WYPOSAZENIA: dict[str, tuple[str, dict[str, Any], str, complex]] = {
    "bezposrednio": ("bezposrednie", {}, "spoczynek", 0j),
    "rezystor": ("rezystor", {}, "spoczynek", complex(_R_N, 0.0)),
    "dlawik": ("dlawik", {}, "spoczynek", complex(0.0, _X_L)),
    "dlawik_awsc_spoczynek": ("dlawik_awsc", {}, "spoczynek", complex(0.0, _X_L)),
    "dlawik_awsc_zalaczony": (
        "dlawik_awsc",
        {},
        "zalaczony",
        _rownolegle(complex(_R_W, 0.0), complex(0.0, _X_L)),
    ),
    "z14": (
        "dlawik_rezystor",
        {},
        "spoczynek",
        _rownolegle(complex(_R_N, 0.0), complex(0.0, _X_L)),
    ),
    "z14_rezystor_odlaczony": (
        "dlawik_rezystor",
        {"rezystor": "otwarty"},
        "spoczynek",
        complex(0.0, _X_L),
    ),
    "z14_dlawik_odlaczony": (
        "dlawik_rezystor",
        {"dlawik": "otwarty"},
        "spoczynek",
        complex(_R_N, 0.0),
    ),
}
#: Wyposażenie, którego sieć jest skompensowana (sam dławik w ruchu, z AWSC w obu stanach — Z.13):
#: prąd doziemny nie jest prądem zwarciowym IEC 60909 (rozdz. 1) — węzeł ma przyczynę braku
#: wyniku, Z0 sprawdzane w macierzy. Z.14 z rezystorem w ruchu jest siecią uziemioną przez
#: impedancję R_N‖jX_L — I″k1 liczone.
SKOMPENSOWANE = {
    "dlawik",
    "dlawik_awsc_spoczynek",
    "dlawik_awsc_zalaczony",
    "z14_rezystor_odlaczony",
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
    wyposazenie: str,
    grupa: str = "ZNyn11",
    z0_zygzaka: str = "element",
    uk_percent: float | None = None,
) -> EnergyNetworkModel:
    wariant, odlaczniki, _stan, _z_n = WYPOSAZENIA[wyposazenie]
    trafo, szyna_nn = zespol_uziemiajacy_rekordy(
        "tu",
        "sn",
        wariant="dlawik" if wariant == "dlawik_awsc" else wariant,  # type: ignore[arg-type]
        rezystor_ref=_REZYSTOR,
        i_nastawy_a=_I_NASTAWY_A if "dlawik" in wariant else None,
        awsc={"i_wymuszany_a": _I_AWSC_A} if wariant == "dlawik_awsc" else None,
        r0_ohm=_Z0_ZYG_ELEMENTU.real if z0_zygzaka == "element" else None,
        x0_ohm=_Z0_ZYG_ELEMENTU.imag if z0_zygzaka == "element" else None,
    )
    trafo["vector_group"] = grupa
    if z0_zygzaka == "robocza":
        # Pozycja katalogu niesie Z0 zygzaka jako wartość roboczą tej samej funkcji pochodnej;
        # bez pozycji (parametry wpisane, ``catalog_ref`` pusty) zostaje sama funkcja robocza.
        trafo.update({"catalog_ref": None, "catalog_namespace": None, "materialized_params": None})
        trafo.update({"r0_ohm": None, "x0_ohm": None, "parameter_source": None})
    if uk_percent is not None:
        trafo.update({"uk_percent": uk_percent, "parameter_source": "OVERRIDE"})
    for galaz, stan in odlaczniki.items():
        trafo["hv_neutral"][galaz]["stan_odlacznika"] = stan
    return EnergyNetworkModel(
        header=ENMHeader(name="sonda ZU"),
        buses=[Bus(ref_id="sn", name="SN", voltage_kv=_UN_KV), Bus.model_validate(szyna_nn)],
        sources=[
            Source(
                ref_id="gpz",
                name="GPZ",
                bus_ref="sn",
                model="thevenin",
                r_ohm=_Z1_OHM.real,
                x_ohm=_Z1_OHM.imag,
            )
        ],
        transformers=[Transformer.model_validate(trafo)],
    )


def _z0_i_ik1(enm: EnergyNetworkModel, stan_awsc: str) -> tuple[complex, float | None]:
    graph = map_enm_to_network_graph(enm)
    wezel = next(n.id for n in graph.nodes.values() if n.name == "SN")
    siec = zbuduj_siec_zerowa(enm, graph, stan_awsc=stan_awsc)  # type: ignore[arg-type]
    builder = AdmittanceMatrixBuilder(graph)
    builder.build(siec_zwarciowa=True)
    idx = builder.node_id_to_index[wezel]
    z0 = complex(siec.z0_bus[idx, idx]) * builder.get_zbase_ohm(wezel)
    if wezel in siec.przyczyny:
        return z0, None
    wynik = ShortCircuitIEC60909Solver.compute_1ph_short_circuit(
        graph=graph,
        fault_node_id=wezel,
        c_factor=_C,
        tk_s=1.0,
        z0_bus=siec.z0_bus,
        czas_tb=czas_tb_roboczy(),
    )
    return z0, wynik.ikss_a


def _ik1_teoria(z0: complex) -> float:
    return math.sqrt(3.0) * _C * _UN_KV * 1000.0 / abs(2.0 * _Z1_OHM + z0)


@pytest.mark.parametrize("z0_zygzaka", Z0_ZYGZAKA)
@pytest.mark.parametrize("grupa", ["ZNyn11", "ZNd0"])
@pytest.mark.parametrize("wyposazenie", sorted(WYPOSAZENIA))
def test_bocznik_zerowy_zt0_plus_3zn_z_wyroczni(wyposazenie: str, grupa: str, z0_zygzaka: str):
    _wariant, _odl, stan, z_n = WYPOSAZENIA[wyposazenie]
    z_oczekiwane = _z_t0_ohm_sn(z0_zygzaka) + 3.0 * z_n
    z0, ik1 = _z0_i_ik1(_model(wyposazenie, grupa, z0_zygzaka), stan)
    assert z0 == pytest.approx(z_oczekiwane, rel=1e-9)
    if wyposazenie in SKOMPENSOWANE:
        assert ik1 is None
    else:
        assert ik1 == pytest.approx(_ik1_teoria(z_oczekiwane), rel=1e-9)


def test_awsc_w_spoczynku_nie_zmienia_impedancji_zerowej_dlawika():
    """Rezystor wymuszający AWSC dołącza automatyka po zwłoce (ZAWSC) — w spoczynku nie wchodzi
    do Z_0; po załączeniu Z_N = R_W‖jX_L (wyrocznia wyżej)."""
    assert _z0_i_ik1(_model("dlawik"), "spoczynek") == _z0_i_ik1(
        _model("dlawik_awsc_spoczynek"), "spoczynek"
    )
    assert _z0_i_ik1(_model("dlawik"), "zalaczony") == _z0_i_ik1(_model("dlawik"), "spoczynek")


@pytest.mark.parametrize("z0_zygzaka", Z0_ZYGZAKA)
@pytest.mark.parametrize("grupa", ["ZNyn11", "ZNd0"])
def test_u_k_nie_wplywa_na_droge_zerowa_zygzaka(grupa: str, z0_zygzaka: str):
    """Iniekcja „Z0 z u_k zamiast z parametru” zapala ten test: zmiana u_k transformatora
    z zygzakiem nie zmienia Z_0 widzianej z szyny SN, a Z_0 jest rzędu pojedynczych omów
    (wzór u_k dawałby 0,04·15²/0,1 ≈ 90 Ω dla 100 kVA)."""
    z0_a, _ = _z0_i_ik1(_model("bezposrednio", grupa, z0_zygzaka, uk_percent=4.0), "spoczynek")
    z0_b, _ = _z0_i_ik1(_model("bezposrednio", grupa, z0_zygzaka, uk_percent=6.0), "spoczynek")
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
