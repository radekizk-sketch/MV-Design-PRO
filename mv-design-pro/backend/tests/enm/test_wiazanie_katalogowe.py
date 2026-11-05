"""Jedyny odczyt wiązania katalogowego (``enm.wiazanie_katalogowe``) — kontrakt funkcji.

ILOCZYN CECH: klucz {``catalog_binding``, ``<rola>_catalog_binding``} × węzeł {bez wiązania,
wiązanie poprawne, wiązanie bez pozycji, wiązanie nie-słownik, zamiennik klucza obok,
zamiennik pola wewnątrz} × przestrzeń rodzaju {brak, zgodna, niezgodna, niezadeklarowana
w wiązaniu}. Odczyt jest wspólny dla bramy API i operacji, więc każda gałąź ma tu test
niezależny od obrony w głąb dyspozytora (kontrola kluczy spoza kontraktu).
"""

from __future__ import annotations

import pytest
from enm.wiazanie_katalogowe import (
    KOD_PRZESTRZENI_NIEZGODNEJ,
    KOD_WIAZANIA_NIEPOPRAWNEGO,
    KOD_ZAMIENNIKA_KLUCZA,
    ZAMIENNIKI_W_WIAZANIU,
    odczytaj_wiazanie,
    zamienniki_klucza,
)

KLUCZE = ("catalog_binding", "transformer_catalog_binding")


@pytest.mark.parametrize("klucz", KLUCZE)
def test_wiazanie_poprawne_i_brak_wiazania(klucz: str) -> None:
    odczyt = odczytaj_wiazanie(
        {klucz: {"catalog_item_id": " POZ ", "catalog_item_version": "v"}}, klucz
    )
    assert (odczyt.pozycja, odczyt.wersja, odczyt.kod_bledu) == ("POZ", "v", None)
    assert odczytaj_wiazanie({}, klucz).wskazuje is False
    assert odczytaj_wiazanie({klucz: None}, klucz).kod_bledu is None


@pytest.mark.parametrize("klucz", KLUCZE)
@pytest.mark.parametrize("wartosc", [{}, {"catalog_item_id": "  "}, "POZ", ["POZ"]])
def test_wiazanie_niepoprawne(klucz: str, wartosc: object) -> None:
    assert odczytaj_wiazanie({klucz: wartosc}, klucz).kod_bledu == KOD_WIAZANIA_NIEPOPRAWNEGO


@pytest.mark.parametrize("klucz", KLUCZE)
def test_kazdy_zamiennik_klucza_obok_wiazania_odrzucony(klucz: str) -> None:
    for zamiennik in zamienniki_klucza(klucz):
        for wiazanie in ({"catalog_item_id": "POZ"}, None):
            odczyt = odczytaj_wiazanie({klucz: wiazanie, zamiennik: "POZ"}, klucz)
            assert odczyt.kod_bledu == KOD_ZAMIENNIKA_KLUCZA, zamiennik
            assert odczyt.pozycja is None


def test_zamienniki_klucza_roli_i_glownego() -> None:
    assert zamienniki_klucza("transformer_catalog_binding") == (
        "transformer_catalog_ref",
        "transformer_catalog_item_id",
    )
    assert set(zamienniki_klucza("catalog_binding")) == {
        "catalog_ref",
        "catalog_item_id",
        "catalog_item_version",
        "catalog_namespace",
        "catalog_version",
    }
    with pytest.raises(ValueError):
        zamienniki_klucza("catalog_ref")


@pytest.mark.parametrize("klucz", KLUCZE)
def test_kazdy_zamiennik_pola_w_wiazaniu_odrzucony(klucz: str) -> None:
    assert set(ZAMIENNIKI_W_WIAZANIU) == {"catalog_ref", "item_id", "namespace"}
    for zamiennik in ZAMIENNIKI_W_WIAZANIU:
        odczyt = odczytaj_wiazanie({klucz: {"catalog_item_id": "POZ", zamiennik: "X"}}, klucz)
        assert odczyt.kod_bledu == KOD_ZAMIENNIKA_KLUCZA, zamiennik


@pytest.mark.parametrize(
    ("przestrzen_wiazania", "przestrzen_rodzaju", "kod", "wynik"),
    [
        (None, None, None, None),
        ("KABEL_SN", None, None, "KABEL_SN"),
        (None, "KABEL_SN", None, "KABEL_SN"),
        ("KABEL_SN", "KABEL_SN", None, "KABEL_SN"),
        ("LINIA_SN", "KABEL_SN", KOD_PRZESTRZENI_NIEZGODNEJ, None),
    ],
)
def test_przestrzen_z_rodzaju_elementu(
    przestrzen_wiazania: str | None,
    przestrzen_rodzaju: str | None,
    kod: str | None,
    wynik: str | None,
) -> None:
    wiazanie = {"catalog_item_id": "POZ"}
    if przestrzen_wiazania is not None:
        wiazanie["catalog_namespace"] = przestrzen_wiazania
    odczyt = odczytaj_wiazanie({"catalog_binding": wiazanie}, przestrzen_rodzaju=przestrzen_rodzaju)
    assert odczyt.kod_bledu == kod
    assert odczyt.przestrzen == wynik
