"""W5-A: brak układu sieci nN = odmowa NAZWANA (`missing_data=['lv_earthing_system']`),
nigdy domyślka TN-C-S. Karta W5-E-TTIT: układy TT/IT NIE są już „nie dotyczy" — liczy je
pętla doziemna (`petla_zwarcia_tt_it`) przez to samo wejście, a brak danych TT/IT (R_A, R_B,
RCD, pojemności) to odmowa nazwana KODEM. Jeden predykat dla pętli zwarcia, SWZ, doboru
aparatów nN i wiązania dowodu (iloczyn: widok × układ × dane).
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
from application.analyses.fault_loop.tt_it import (
    KOD_BRAK_POJEMNOSCI,
    KOD_BRAK_R_A,
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
    # Każdy zadeklarowany układ jest liczony — TT/IT przestały być „nie dotyczy" (W5-E-TTIT).
    for uklad in ("TN-S", "TN-C-S", "TN-C", "TT", "IT"):
        assert odmowa_ukladu_nn({}, uklad) is None


@pytest.mark.parametrize("uklad", [None, "TT", "IT", "TN-C-S"])
def test_widoki_petli_i_swz_odmawiaja_tym_samym_predykatem(uklad):
    """Bez danych TT/IT w modelu: TT odmawia kodem braku R_A (u źródła nie ma instalacji;
    R_B jest sprawdzane pierwsze, więc fikstura niesie R_B), IT — kodem braku pojemności
    doziemnych; TN liczy jak dotąd; brak układu = odmowa bez kodu (jak przed kartą)."""
    enm = zbuduj_stacje_nn(uklad_uziemienia=uklad, r_b_ohm=2.0 if uklad == "TT" else None)
    trafo = enm.transformers[0]
    assert uklad_nn_transformatora(trafo) == uklad
    stacja = build_station_fault_loop_view(enm, REF_STACJA)
    odplywy = build_feeder_fault_loop_view(enm, REF_STACJA)
    oczekiwany = {None: "brak danych", "TT": "brak danych", "IT": "brak danych", "TN-C-S": "OK"}[
        uklad
    ]
    assert stacja["status"] == oczekiwany
    if uklad is None:
        assert odplywy["status"] == "brak danych"
        assert stacja["missing_data"] == [BRAK_UKLADU_NN]
        assert odplywy["missing_data"] == [BRAK_UKLADU_NN]
        assert stacja.get("network_system") is None
        assert stacja.get("kod_odmowy") is None
    elif uklad == "TT":
        assert stacja["kod_odmowy"] == KOD_BRAK_R_A
        # Odpływy TT: widok liczy się, punkty bez R_A odmawiają PER PUNKT tym samym kodem.
        assert odplywy["status"] == "OK"
        punkty = [p for f in odplywy["feeders"] for p in f["points"]]
        assert punkty and all(p["kod_odmowy"] == KOD_BRAK_R_A for p in punkty)
    elif uklad == "IT":
        assert stacja["kod_odmowy"] == KOD_BRAK_POJEMNOSCI
        assert odplywy["status"] == "brak danych"
        assert odplywy["kod_odmowy"] == KOD_BRAK_POJEMNOSCI
    swz = build_swz_view(enm, REF_STACJA, "a1", "ap_a")
    if uklad is None:
        assert swz["status"] == "brak danych" and BRAK_UKLADU_NN in swz["missing_data"]
    elif uklad == "TT":
        assert swz["status"] == "brak danych" and swz["kod_odmowy"] == KOD_BRAK_R_A
    elif uklad == "IT":
        assert swz["status"] == "brak danych" and swz["kod_odmowy"] == KOD_BRAK_POJEMNOSCI
    else:
        assert swz["status"] == "OK"


def test_siec_it_bez_szyny_nn_transformatora_to_odmowa_trasy_nie_wyjatek():
    """Szyna nN transformatora poza modelem: wyznaczenie sieci IT zgłasza nazwany błąd trasy,
    a dane sieci IT zamieniają go w odmowę „brak danych" z komunikatem trasy i brakiem
    `lv_bus_ref` transformatora (nie połknięty wyjątek, nie fałszywy brak pojemności)."""
    from application.analyses.fault_loop.route import RouteExtractionError
    from application.analyses.fault_loop.tt_it import dane_sieci_it, pojemnosci_sieci_it

    enm = zbuduj_stacje_nn(uklad_uziemienia="IT")
    trafo = enm.transformers[0].model_copy(update={"lv_bus_ref": "szyna-spoza-modelu"})
    with pytest.raises(RouteExtractionError):
        pojemnosci_sieci_it(enm, trafo)
    odmowa = dane_sieci_it(enm, trafo, {"station_ref": REF_STACJA})
    assert isinstance(odmowa, dict)
    assert odmowa["status"] == "brak danych"
    assert odmowa["missing_data"] == [f"{trafo.ref_id}:lv_bus_ref"]
    # Partia integracji 10: komunikat trasy mówi, czego brakuje, bez identyfikatora szyny
    # (identyfikator zostaje w `missing_data`).
    assert "Szyna źródłowa trasy nie istnieje w modelu" in odmowa["reason_pl"]
    assert "szyna-spoza-modelu" not in odmowa["reason_pl"]
    assert odmowa["station_ref"] == REF_STACJA
    assert odmowa.get("kod_odmowy") != KOD_BRAK_POJEMNOSCI
