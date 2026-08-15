"""Piny granicy typow i normalizacji PTPiREE (dlugi 2 i 3 z rejestru V12K-321).

Dlug 2: adnotacja `annotate_with_ptpiree_status` produkowala 11 pol
`ptpiree_*`, a typowane klasy katalogu (ConverterType, InverterType,
PVInverterType, BESSInverterType) niosly tylko 9 — `ptpiree_note` i
`ptpiree_certificate_condition` ginely na granicy typow, wiec API katalogowe
ich nie serwowalo (most kreatora DER omijal granice reczna adnotacja).

Dlug 3: druga, SLABSZA normalizacja kluczy w `types.normalize_ptpiree_key`
(lista separatorow zamiast [^A-Za-z0-9]) — klucz eksportowy certyfikatu mogl
nie rownac sie kluczowi dopasowania dla tego samego urzadzenia.

Testy klasa-nie-instancja: produkty adnotacji wyznaczaja komplet pol typow
(nowe pole adnotacji => czerwony test, dopoki typy go nie przeniosa), a
normalizacja jest JEDNYM obiektem, nie para funkcji o zbieznych cialach.
"""

from dataclasses import fields

from network_model.catalog import mv_ptpiree_catalog
from network_model.catalog.mv_ptpiree_catalog import annotate_with_ptpiree_status
from network_model.catalog.types import (
    BESSInverterType,
    ConverterType,
    InverterType,
    PVInverterType,
    normalize_ptpiree_key,
)

#: Urzadzenie POWIAZANE z pelnym wykazem (pomiar P1: wiersz WiPWC 1.2).
_TABLICZKA_POWIAZANA = {
    "id": "conv-test",
    "name": "Huawei SUN2000-215KTL-H3",
    "params": {"manufacturer": "Huawei", "model": "SUN2000-215KTL-H3"},
}
_TABLICZKA_NIEPOWIAZANA = {
    "id": "conv-none",
    "name": "Brak takiego urzadzenia",
    "params": {"manufacturer": "Nie istnieje", "model": "XYZ-0"},
}

_KLASY_TYPOWANE = (ConverterType, InverterType, PVInverterType, BESSInverterType)


def _produkty_adnotacji() -> set[str]:
    """Komplet kluczy `ptpiree_*`, jakie adnotacja potrafi ustawic (oba tory)."""
    klucze: set[str] = set()
    for tabliczka in (_TABLICZKA_POWIAZANA, _TABLICZKA_NIEPOWIAZANA):
        wynik = annotate_with_ptpiree_status(dict(tabliczka))
        klucze |= {k for k in wynik["params"] if k.startswith("ptpiree_")}
    return klucze


def test_typy_katalogu_niosa_komplet_produktow_adnotacji() -> None:
    produkty = _produkty_adnotacji()
    assert produkty, "kontrola dodatnia: adnotacja musi cokolwiek produkowac"
    for klasa in _KLASY_TYPOWANE:
        pola = {f.name for f in fields(klasa) if f.name.startswith("ptpiree_")}
        assert produkty <= pola, (
            f"{klasa.__name__} gubi na granicy typow pola adnotacji: "
            f"{sorted(produkty - pola)} — API katalogowe ich nie poda"
        )


def test_granica_typow_przenosi_note_i_warunek_w_obie_strony() -> None:
    for klasa in _KLASY_TYPOWANE:
        obiekt = klasa.from_dict(
            {
                "name": "Testowa przetwornica",
                "ptpiree_note": "Pozycja wykazu: wiersz 1.",
                "ptpiree_certificate_condition": "tylko z modulem X",
            }
        )
        eksport = obiekt.to_dict()
        assert eksport["ptpiree_note"] == "Pozycja wykazu: wiersz 1."
        assert eksport["ptpiree_certificate_condition"] == "tylko z modulem X"


def test_normalizacja_jest_jednym_obiektem_nie_para_funkcji() -> None:
    assert mv_ptpiree_catalog._fold is normalize_ptpiree_key


def test_normalizacja_sklada_kazdy_znak_spoza_alfanumerykow() -> None:
    # Stara lista separatorow zostawiala '.', '+', '&' w kluczu — te przypadki
    # przypinaja wzmocnienie do reguly dopasowania [^A-Za-z0-9].
    assert normalize_ptpiree_key("S.A.+B&C") == "S A B C"
    assert normalize_ptpiree_key("Zażółć-Gęślą (jaźń)/x") == "ZAZOLC GESLA JAZN X"
    assert normalize_ptpiree_key(None) == ""
