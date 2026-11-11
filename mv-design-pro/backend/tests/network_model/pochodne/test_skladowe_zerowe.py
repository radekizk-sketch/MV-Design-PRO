"""W5-A: algebra składowej zerowej uziemienia (pochodne) — jawne wzory, parytet z modelem TR."""

from __future__ import annotations

import math

import pytest
from enm.models import Transformer
from enm.zero_sequence_transformer import _z_t_leakage_pu_sn
from network_model.pochodne import (
    impedancja_punktu_neutralnego_ohm,
    impedancja_rozproszenia_transformatora_pu,
)


def test_z_n_z_r_i_x_brak_skladowej_przeciwnej_jest_zerem():
    assert impedancja_punktu_neutralnego_ohm(12.0, None) == 12.0 + 0j
    assert impedancja_punktu_neutralnego_ohm(None, 150.0) == 0.0 + 150.0j
    assert impedancja_punktu_neutralnego_ohm(1.5, 2.5) == 1.5 + 2.5j
    assert impedancja_punktu_neutralnego_ohm(None, None) == 0j


def test_z_t_pu_bit_w_bit_jak_model_skladowej_zerowej_transformatora():
    trafo = Transformer(
        ref_id="tr",
        name="tr",
        hv_bus_ref="a",
        lv_bus_ref="b",
        sn_mva=25.0,
        uhv_kv=110.0,
        ulv_kv=15.0,
        uk_percent=11.0,
        pk_kw=110.0,
        vector_group="Yd11",
    )
    assert impedancja_rozproszenia_transformatora_pu(11.0, 110.0, 25.0) == _z_t_leakage_pu_sn(trafo)


def test_z_t_pu_skladowe_i_przypadki_brzegowe():
    z_pu = impedancja_rozproszenia_transformatora_pu(11.0, 110.0, 25.0)
    assert z_pu.real == pytest.approx(0.11 / 25.0)
    assert z_pu.imag == pytest.approx(math.sqrt(0.11**2 - (0.11 / 25.0) ** 2))
    # Bez strat obciążeniowych R_T = 0, |Z_T| = u_k.
    assert impedancja_rozproszenia_transformatora_pu(6.0, 0.0, 1.0) == 0.0 + 0.06j
    # S_rT = 0 nie dzieli przez zero (R = 0).
    assert impedancja_rozproszenia_transformatora_pu(6.0, 5.0, 0.0).real == 0.0


def test_reaktancja_dlawika_dostrojonego_rezonans_i_nadkompensacja():
    """X_N = 1/(3·B_0·(1 + v)): przy v = 0 prąd dławika U_f/X_N równa się I_C = 3·B_0·U_f,
    przy v = 0,1 jest o 10 % większy (nadkompensacja)."""
    from network_model.pochodne import reaktancja_dlawika_dostrojonego_ohm

    b0, u_f = 3.0e-4, 15000.0 / 3**0.5
    i_c = 3.0 * b0 * u_f
    assert u_f / reaktancja_dlawika_dostrojonego_ohm(b0, 0.0) == pytest.approx(i_c, rel=1e-12)
    assert u_f / reaktancja_dlawika_dostrojonego_ohm(b0, 0.1) == pytest.approx(1.1 * i_c, rel=1e-12)
