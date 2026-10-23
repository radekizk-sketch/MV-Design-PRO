"""Końcówka katalogu aparatów SN niesie propozycje wartości roboczych (zasada nr 4, V12K-351).

Przegląd katalogu pokazuje przy pozycji, CZYM obliczenie uzupełni brak karty. Pozycja katalogu
zostaje czysta (dane karty bez wartości roboczych), a lista propozycji pochodzi z TEGO SAMEGO
rejestru, który rozstrzyga parametry w analizach.
"""

from __future__ import annotations

from network_model.catalog import get_default_mv_catalog
from network_model.catalog.wartosci_robocze import PARAMETRY_APARATU_SN, propozycje_aparatu_sn


def test_pozycje_niosa_propozycje_z_rejestru_i_czyste_dane_karty(app_client) -> None:
    resp = app_client.get("/api/catalog/mv-apparatus-types")
    assert resp.status_code == 200
    pozycje = {p["id"]: p for p in resp.json()}
    katalog = get_default_mv_catalog().list_mv_apparatus_types()
    assert set(pozycje) == {p.id for p in katalog}
    for pozycja in katalog:
        zapis = pozycje[pozycja.id]
        assert zapis["wartosci_robocze"] == [p.to_dict() for p in propozycje_aparatu_sn(pozycja)]
        for propozycja in zapis["wartosci_robocze"]:
            # Propozycja tylko dla braku karty — pole pozycji zostaje puste.
            assert zapis[propozycja["parametr"]] is None
            assert propozycja["parametr"] in PARAMETRY_APARATU_SN
            assert propozycja["nazwa_pl"] and propozycja["odniesienie"] and propozycja["wplyw_pl"]
    wylacznik = pozycje["sw-cb-abb-vd4-17kv-630a"]
    assert [(p["parametr"], p["wartosc"]) for p in wylacznik["wartosci_robocze"]] == [
        ("break_time_s", 0.06),
        ("i_dyn_ka", 50.0),
    ]
