"""W5-A: JEDEN predykat braku układu nN i JEDNA mapa układ modelu → enum solvera."""

from __future__ import annotations

from typing import get_args

import pytest
from enm.models import (
    UKLADY_SIECI_NN,
    Bus,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Generator,
    Load,
    Substation,
    Transformer,
    UkladSieciNn,
)
from enm.uklad_sieci_nn import stacje_z_odbiorami_nn, transformatory_bez_ukladu_nn, uklad_nn_stacji
from network_model.solvers.fault_loop_iec60364 import NetworkType, ProtectionArrangement
from solver_input.uklad_sieci_nn import UKLADY_TN, typ_sieci_solvera, uklad_tn


def test_literal_modelu_i_enum_solvera_to_jeden_zbior():
    assert set(get_args(UkladSieciNn)) == {t.value for t in NetworkType}
    assert tuple(get_args(UkladSieciNn)) == UKLADY_SIECI_NN
    for uklad in UKLADY_SIECI_NN:
        typ, ochrona = typ_sieci_solvera(uklad)
        assert typ.value == uklad
        assert (ochrona is ProtectionArrangement.NONE) == (not uklad_tn(uklad))
    assert UKLADY_TN == {"TN-S", "TN-C-S", "TN-C"}
    assert not uklad_tn(None)
    with pytest.raises(ValueError):
        typ_sieci_solvera("TN-X")  # type: ignore[arg-type]


def _tr(ref: str, lv: str, uklad: str | None) -> Transformer:
    return Transformer(
        ref_id=ref,
        name=ref,
        hv_bus_ref="sn",
        lv_bus_ref=lv,
        sn_mva=0.4,
        uhv_kv=15.0,
        ulv_kv=0.4,
        uk_percent=4.0,
        pk_kw=4.6,
        vector_group="Dyn11",
        lv_earthing_system=uklad,
    )


def _model(
    *, uklady: tuple[str | None, str | None], odbior: bool, generator: bool
) -> EnergyNetworkModel:
    loads = [Load(ref_id="l", name="l", bus_ref="nn_a", p_mw=0.01, q_mvar=0.0)] if odbior else []
    gens = (
        [
            Generator(
                ref_id="g", name="g", bus_ref="nn_b", gen_type="pv_inverter", p_mw=0.01, q_mvar=0.0
            )
        ]
        if generator
        else []
    )
    return EnergyNetworkModel(
        header=ENMHeader(name="uklad", defaults=ENMDefaults()),
        buses=[
            Bus(ref_id="sn", name="sn", voltage_kv=15.0),
            Bus(ref_id="nn_a", name="nn_a", voltage_kv=0.4),
            Bus(ref_id="nn_b", name="nn_b", voltage_kv=0.4),
        ],
        transformers=[_tr("tr1", "nn_a", uklady[0]), _tr("tr2", "nn_b", uklady[1])],
        substations=[
            Substation(
                ref_id="st",
                name="st",
                station_type="mv_lv",
                bus_refs=["sn", "nn_a", "nn_b"],
                transformer_refs=["tr1", "tr2"],
            )
        ],
        loads=loads,
        generators=gens,
    )


def test_predykat_braku_ukladu_per_transformator_odbior_albo_generator_nn():
    m = _model(uklady=("TN-S", None), odbior=True, generator=False)
    assert [(s.ref_id, t.ref_id) for s, t in transformatory_bez_ukladu_nn(m)] == [("st", "tr2")]
    # Generator nN (PV) to też sieć nN wymagająca układu — ta sama klasa co odbiór.
    m = _model(uklady=(None, None), odbior=False, generator=True)
    assert [t.ref_id for _, t in transformatory_bez_ukladu_nn(m)] == ["tr1", "tr2"]
    # Stacja bez odbioru i generatora nN — walidator milczy, ale gotowość pętli (parametr
    # `stacje`) pyta o KAŻDĄ wskazaną stację.
    m = _model(uklady=(None, "TT"), odbior=False, generator=False)
    assert transformatory_bez_ukladu_nn(m) == []
    assert stacje_z_odbiorami_nn(m) == []
    assert [t.ref_id for _, t in transformatory_bez_ukladu_nn(m, m.substations)] == ["tr1"]


def test_wspolny_uklad_stacji_tylko_gdy_jednoznaczny():
    assert (
        uklad_nn_stacji(
            *(lambda m: (m, m.substations[0]))(
                _model(uklady=("TN-S", "TN-S"), odbior=True, generator=False)
            )
        )
        == "TN-S"
    )
    assert (
        uklad_nn_stacji(
            *(lambda m: (m, m.substations[0]))(
                _model(uklady=("TN-S", "TT"), odbior=True, generator=False)
            )
        )
        is None
    )
    assert (
        uklad_nn_stacji(
            *(lambda m: (m, m.substations[0]))(
                _model(uklady=(None, None), odbior=True, generator=False)
            )
        )
        is None
    )
    assert (
        uklad_nn_stacji(
            *(lambda m: (m, m.substations[0]))(
                _model(uklady=("IT", None), odbior=True, generator=False)
            )
        )
        == "IT"
    )
