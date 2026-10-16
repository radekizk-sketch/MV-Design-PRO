"""Sprzeczne dane transformatora P_k/u_k — odmowa nazwana we WSZYSTKICH miejscach liczenia.

Klasa defektu (zgłoszona przez kartę PROT-LTI, naprawiona w partii 9): impedancja zwarciowa
transformatora z = u_k/100, r = P_k/S_n, x = √(z² − r²) była liczona w pięciu miejscach,
z których trzy po cichu obcinały dane sprzeczne (r > z): ``max(z² − r², 0)`` dawało x = 0
w gałęzi modelu (``get_short_circuit_impedance_pu``, ``get_short_circuit_reactance_pu``,
``_compute_transformer_impedance_pu`` przez ``computed_equivalent_pu``), a pętla zwarcia nN
(``fault_loop_builder.transformer_lv_impedance_ohm``) robiła ``r = min(r, z)``. Jedno miejsce
(``get_impedance_pu``) odmawiało gołym ``ValueError``, ``validate`` zwracało ``False``.

Predykat jest teraz jeden (``odmowa_gdy_pk_sprzeczne_z_uk``). Iloczyn cech: miejsce liczenia
(siedem dróg, w tym droga aplikacji układu IT) × dane (zgodne, P_k = 0, granica r = z,
sprzeczne). Dane zgodne dają wynik bit w bit jak wzór wprost (bez zmiany liczb).
"""

from __future__ import annotations

import math

import pytest
from application.analyses.fault_loop.service import (
    KOD_PK_SPRZECZNE_Z_UK,
    impedancja_transformatora_dla_ukladu,
)
from enm.models import Transformer
from network_model.core.branch import BranchType, TransformerBranch
from network_model.odmowa_danych import OdmowaDanychError
from network_model.solvers.fault_loop_builder import transformer_lv_impedance_ohm

SN_MVA = 0.63
UK = 4.0

#: (nazwa przypadku, P_k [kW], sprzeczne?) — granica r = z: P_k = u_k/100 · S_n · 1000.
DANE = [
    ("zgodne", 6.5, False),
    ("pk_zero", 0.0, False),
    ("granica_r_rowne_z", UK / 100.0 * SN_MVA * 1000.0, False),
    ("sprzeczne", 40.0, True),
]


def _galaz(pk_kw: float) -> TransformerBranch:
    return TransformerBranch(
        id="T1",
        name="Transformator T1",
        branch_type=BranchType.TRANSFORMER,
        from_node_id="SN",
        to_node_id="NN",
        rated_power_mva=SN_MVA,
        voltage_hv_kv=15.0,
        voltage_lv_kv=0.4,
        uk_percent=UK,
        pk_kw=pk_kw,
        i0_percent=0.0,
        p0_kw=0.0,
        vector_group="Dyn11",
        tap_position=0,
        tap_step_percent=2.5,
    )


def _wprost_pu(pk_kw: float) -> tuple[float, float]:
    z = UK / 100.0
    r = (pk_kw / 1000.0) / SN_MVA
    return r, math.sqrt(z * z - r * r)


DROGI_GALEZI = {
    "get_short_circuit_impedance_pu": lambda g: g.get_short_circuit_impedance_pu(),
    "get_short_circuit_reactance_pu": lambda g: complex(
        0.0, g.get_short_circuit_reactance_pu()
    ),
    "get_impedance_pu_baza_sn": lambda g: g.get_impedance_pu(base_mva=SN_MVA),
    "computed_equivalent_pu": lambda g: g.computed_equivalent_pu(None),
}


@pytest.mark.parametrize("droga", sorted(DROGI_GALEZI))
@pytest.mark.parametrize(
    ("przypadek", "pk_kw", "sprzeczne"), DANE, ids=[d[0] for d in DANE]
)
def test_galaz_modelu_odmawia_danych_sprzecznych_i_liczy_zgodne_bez_zmian(
    droga: str, przypadek: str, pk_kw: float, sprzeczne: bool
) -> None:
    galaz = _galaz(pk_kw)
    if sprzeczne:
        with pytest.raises(OdmowaDanychError, match="Sprzeczne dane transformatora"):
            DROGI_GALEZI[droga](galaz)
        assert galaz.validate() is False
        return
    wynik = DROGI_GALEZI[droga](galaz)
    r, x = _wprost_pu(pk_kw)
    if droga == "get_short_circuit_reactance_pu":
        assert wynik.imag == x
    else:
        assert wynik == pytest.approx(complex(r, x), rel=0, abs=1e-15)
    assert galaz.validate() is True, przypadek


@pytest.mark.parametrize(
    ("przypadek", "pk_kw", "sprzeczne"), DANE, ids=[d[0] for d in DANE]
)
def test_petla_nn_odmawia_danych_sprzecznych_zamiast_obcinac_r_do_z(
    przypadek: str, pk_kw: float, sprzeczne: bool
) -> None:
    if sprzeczne:
        with pytest.raises(OdmowaDanychError, match="Sprzeczne dane transformatora"):
            transformer_lv_impedance_ohm(
                sn_mva=SN_MVA, uk_percent=UK, ulv_kv=0.4, pk_kw=pk_kw
            )
        return
    z_tr = transformer_lv_impedance_ohm(
        sn_mva=SN_MVA, uk_percent=UK, ulv_kv=0.4, pk_kw=pk_kw
    )
    z_base = 0.4**2 / SN_MVA
    r_pu = pk_kw / (SN_MVA * 1000.0)
    z_pu = UK / 100.0
    # Wzór wprost w tej samej arytmetyce co przed naprawą — liczby bit w bit.
    assert z_tr.r_ohm == r_pu * z_base, przypadek
    assert z_tr.x_ohm == math.sqrt(max(z_pu**2 - r_pu**2, 0.0)) * z_base, przypadek


def test_petla_nn_odmawia_ujemnych_strat() -> None:
    with pytest.raises(OdmowaDanychError, match="ujemne"):
        transformer_lv_impedance_ohm(
            sn_mva=SN_MVA, uk_percent=UK, ulv_kv=0.4, pk_kw=-1.0
        )


def _trafo_enm(pk_kw: float) -> Transformer:
    return Transformer(
        ref_id="tr",
        name="TR",
        hv_bus_ref="sn",
        lv_bus_ref="nn",
        sn_mva=SN_MVA,
        uhv_kv=15.0,
        ulv_kv=0.4,
        uk_percent=UK,
        pk_kw=pk_kw,
        vector_group="Dyn11",
    )


@pytest.mark.parametrize(
    ("przypadek", "pk_kw", "sprzeczne"), DANE, ids=[d[0] for d in DANE]
)
def test_droga_aplikacji_ukladu_it_nazywa_sprzecznosc_w_liscie_brakow(
    przypadek: str, pk_kw: float, sprzeczne: bool
) -> None:
    """Kontrakt ``impedancja_transformatora_dla_ukladu`` to lista braków (pre-kontrola
    gotowości, SWZ, dowód obwodu nN) — sprzeczność jest nazwanym brakiem, nie wyjątkiem
    przerywającym całą analizę i nie cichym X = 0."""
    z_tr, braki = impedancja_transformatora_dla_ukladu(_trafo_enm(pk_kw), "IT")
    if sprzeczne:
        assert z_tr is None
        assert braki == [KOD_PK_SPRZECZNE_Z_UK]
    else:
        assert braki == [], przypadek
        assert z_tr is not None and z_tr.x_ohm >= 0.0
