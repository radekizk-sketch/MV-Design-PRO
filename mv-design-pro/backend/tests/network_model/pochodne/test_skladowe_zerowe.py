"""W5-A: algebra składowej zerowej uziemienia (pochodne) — jawne wzory, parytet z modelem TR."""

from __future__ import annotations

import math

import pytest
from enm.models import Transformer
from enm.zero_sequence_transformer import _z_t_leakage_pu_sn
from network_model.pochodne import (
    PROWENIENCJA_WYPROWADZONE,
    impedancja_punktu_neutralnego_ohm,
    impedancja_rozproszenia_transformatora_ohm,
    impedancja_rozproszenia_transformatora_pu,
    impedancja_zerowa_zrodla_z_uziemienia_ohm,
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


def test_z_t_ohm_to_pu_razy_u2_przez_s():
    z_pu = impedancja_rozproszenia_transformatora_pu(11.0, 110.0, 25.0)
    z_ohm = impedancja_rozproszenia_transformatora_ohm(11.0, 110.0, 25.0, 15.0)
    assert z_ohm == pytest.approx(z_pu * (15.0**2 / 25.0))
    assert z_pu.real == pytest.approx(0.11 / 25.0)
    assert z_pu.imag == pytest.approx(math.sqrt(0.11**2 - (0.11 / 25.0) ** 2))
    # Bez strat obciążeniowych R_T = 0, |Z_T| = u_k.
    assert impedancja_rozproszenia_transformatora_pu(6.0, 0.0, 1.0) == 0.0 + 0.06j
    # S_rT = 0 nie dzieli przez zero (R = 0).
    assert impedancja_rozproszenia_transformatora_pu(6.0, 5.0, 0.0).real == 0.0


def test_z0_zrodla_to_z_t0_plus_trzy_z_n():
    z_t0 = 0.4 + 1.8j
    assert impedancja_zerowa_zrodla_z_uziemienia_ohm(z_t0, 12.0 + 0j) == 36.4 + 1.8j
    assert impedancja_zerowa_zrodla_z_uziemienia_ohm(z_t0, 0j) == z_t0
    assert impedancja_zerowa_zrodla_z_uziemienia_ohm(0j, 0.0 + 150.0j) == 0.0 + 450.0j
    assert PROWENIENCJA_WYPROWADZONE == "WYPROWADZONE"
