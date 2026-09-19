"""W5-A: brak układu sieci nN = odmowa NAZWANA (`missing_data=['lv_earthing_system']`),
nigdy domyślka TN-C-S; TT/IT = „nie dotyczy". Jeden predykat dla pętli zwarcia, SWZ,
doboru aparatów nN i wiązania dowodu (iloczyn: widok × układ).
"""

from __future__ import annotations

import pytest
from application.analyses.fault_loop.service import (
    BRAK_UKLADU_NN,
    build_feeder_fault_loop_view,
    build_station_fault_loop_view,
    odmowa_ukladu_nn,
    uklad_nn_transformatora,
)
from application.analyses.swz.service import build_swz_view

from tests.application.analyses.lv_domain.fixtury_stacji_nn import REF_STACJA, zbuduj_stacje_nn


def test_odmowa_ukladu_nn_jeden_predykat():
    assert odmowa_ukladu_nn({"x": 1}, None) == {
        "x": 1,
        "status": "brak danych",
        "missing_data": [BRAK_UKLADU_NN],
        "reason_pl": odmowa_ukladu_nn({}, None)["reason_pl"],
    }
    assert "domyśln" in odmowa_ukladu_nn({}, None)["reason_pl"]
    for uklad in ("TT", "IT"):
        wynik = odmowa_ukladu_nn({}, uklad)
        assert wynik["status"] == "nie dotyczy" and uklad in wynik["reason_pl"]
    for uklad in ("TN-S", "TN-C-S", "TN-C"):
        assert odmowa_ukladu_nn({}, uklad) is None


@pytest.mark.parametrize("uklad", [None, "TT", "IT", "TN-C-S"])
def test_widoki_petli_i_swz_odmawiaja_tym_samym_predykatem(uklad):
    enm = zbuduj_stacje_nn(uklad_uziemienia=uklad)
    trafo = enm.transformers[0]
    assert uklad_nn_transformatora(trafo) == uklad
    stacja = build_station_fault_loop_view(enm, REF_STACJA)
    odplywy = build_feeder_fault_loop_view(enm, REF_STACJA)
    oczekiwany = {None: "brak danych", "TT": "nie dotyczy", "IT": "nie dotyczy", "TN-C-S": "OK"}[
        uklad
    ]
    assert stacja["status"] == oczekiwany
    assert odplywy["status"] == oczekiwany
    if uklad is None:
        assert stacja["missing_data"] == [BRAK_UKLADU_NN]
        assert odplywy["missing_data"] == [BRAK_UKLADU_NN]
        assert stacja.get("network_system") is None
    swz = build_swz_view(enm, REF_STACJA, "a1", "ap_a")
    if uklad is None:
        assert swz["status"] == "brak danych" and BRAK_UKLADU_NN in swz["missing_data"]
    elif uklad in ("TT", "IT"):
        assert swz["status"] == "nie dotyczy"
