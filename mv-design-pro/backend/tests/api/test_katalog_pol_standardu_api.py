"""Końcówki katalogu pól standardu i wyposażenia pól SN (karta GPZ-H5-APARATURA).

Po co: tryb „z szablonu pola standardu" operacji ``set_bay_equipment`` przyjmuje
``szablon_standardu_ref``, a gniazda ZU/BKR/pola SN przyjmują pozycje przestrzeni
ELEMENT_POLA_SN — formularz pola musi je wskazać z REALNEJ listy backendu (zero fantomu).
Kontrakt: lista szablonów = ``SZABLONY_POL_STANDARDU`` (każdy z gniazdami w kolejności od szyny
i wymaganiami z jednostką i podstawą), lista elementów pola = katalog ELEMENT_POLA_SN
z rodzajem dopuszczonym przez rodzaj aparatu pola. Obie listy deterministyczne.
"""

from __future__ import annotations

from enm.sklad_pola import PRZESTRZEN_KATALOGU_APARATU, RODZAJE_KATALOGOWE_APARATU
from network_model.catalog.gniazda_pol_enea import DOKUMENT_ENEA, SZABLONY_POL_STANDARDU
from network_model.catalog.repository import get_default_mv_catalog


def test_szablony_pol_standardu_sa_lista_katalogu(app_client) -> None:
    odpowiedz = app_client.get("/api/catalog/bay-standard-templates")
    assert odpowiedz.status_code == 200
    szablony = odpowiedz.json()
    assert [s["id"] for s in szablony] == sorted(SZABLONY_POL_STANDARDU)
    for szablon in szablony:
        wzorzec = SZABLONY_POL_STANDARDU[szablon["id"]]
        assert szablon == wzorzec.to_dict()
        # Strona 110 kV jest granicą zasilania sieci SN (decyzja właściciela 2026-10-22) —
        # szablonów pól 110 kV nie ma; każdy szablon jest polem rozdzielnicy SN.
        assert szablon["id"].startswith("ENEA_SN_"), szablon["id"]
        assert "poziom" not in szablon
        assert szablon["role_pola"], szablon["id"]
        assert szablon["gniazda"], szablon["id"]
        assert DOKUMENT_ENEA in szablon["podstawa_pl"]
        for gniazdo in szablon["gniazda"]:
            assert gniazdo["podstawa_pl"], (szablon["id"], gniazdo["id"])
            for wymaganie in gniazdo["wymagania"]:
                assert wymaganie["podstawa_pl"], (szablon["id"], gniazdo["id"], wymaganie)
                assert wymaganie["relacja"] in {"CO_NAJMNIEJ", "CO_NAJWYZEJ", "ROWNE"}
    assert app_client.get("/api/catalog/bay-standard-templates").json() == szablony


def test_elementy_pola_sn_pokrywaja_rodzaje_przestrzeni(app_client) -> None:
    odpowiedz = app_client.get("/api/catalog/field-element-types")
    assert odpowiedz.status_code == 200
    pozycje = odpowiedz.json()
    assert [p["id"] for p in pozycje] == [
        t.id for t in get_default_mv_catalog().list_element_pola_types()
    ]
    rodzaje_przestrzeni = {
        rodzaj_pozycji
        for rodzaj, przestrzen in PRZESTRZEN_KATALOGU_APARATU.items()
        if przestrzen == "ELEMENT_POLA_SN"
        for rodzaj_pozycji in RODZAJE_KATALOGOWE_APARATU[rodzaj]
    }
    # Każdy rodzaj pozycji przestrzeni ma co najmniej jedną pozycję; żadna pozycja nie jest
    # rodzaju, którego nie przyjmuje żaden aparat pola.
    assert {p["rodzaj"] for p in pozycje} == rodzaje_przestrzeni
    for pozycja in pozycje:
        # Pozycja „wymagania standardu" niesie podstawę (dokument operatora + punkt); U_m
        # podaje tylko tam, gdzie standard je podaje (§13: wskaźnik napięcia rozdzielnicy
        # 24 kV) — brak U_m to brak danej standardu, nie wartość domyślna.
        assert pozycja["catalog_status"] == "WYMAGANIE_STANDARDU_V1", pozycja["id"]
        assert pozycja["source_reference"].startswith(DOKUMENT_ENEA), pozycja["id"]
        assert (pozycja["u_m_kv"] is not None) == (pozycja["rodzaj"] == "WSKAZNIK_NAPIECIA")
    assert app_client.get("/api/catalog/field-element-types").json() == pozycje


def test_element_pola_from_dict_i_to_dict_niosa_ten_sam_zbior_pol() -> None:
    """Para predykatów odczyt/zapis pozycji ELEMENT_POLA_SN: `to_dict` wypisuje pola z krotek
    `_POLA_LICZBOWE`/`_POLA_TEKSTOWE`/`_POLA_LOGICZNE`, `from_dict` odczytuje je jawnie —
    zbiór pól obu stron jest ZBIOREM PÓL dataclassy (bez pola pominiętego w jednej z nich),
    a odczyt zapisu każdej pozycji katalogu odtwarza ją bez zmiany. Identyfikator jest
    wymagany — rekord bez niego jest odmową, nie pozycją z losowym identyfikatorem."""
    import dataclasses

    import pytest
    from network_model.catalog.types import ElementPolaType
    from network_model.ir_fields import BrakujacePoleIRError

    pola_dataclassy = {p.name for p in dataclasses.fields(ElementPolaType)}
    metadane = {
        "verification_status",
        "source_reference",
        "catalog_status",
        "contract_version",
        "verification_note",
    }
    krotki = {
        *ElementPolaType._POLA_LICZBOWE,
        *ElementPolaType._POLA_TEKSTOWE,
        *ElementPolaType._POLA_LOGICZNE,
    }
    assert krotki == pola_dataclassy - {"id", "name", "rodzaj"} - metadane
    pozycje = get_default_mv_catalog().list_element_pola_types()
    assert pozycje
    for pozycja in pozycje:
        zapis = pozycja.to_dict()
        assert set(zapis) >= pola_dataclassy - {"verification_note"}
        assert ElementPolaType.from_dict(zapis) == pozycja, pozycja.id
    # Pozycje katalogu nie niosą wszystkich pól (np. `jednostki_pl` jest puste w każdej) —
    # pole pominięte w `from_dict` byłoby wtedy niewidoczne. Rekord syntetyczny z KAŻDYM polem
    # niepustym (iniekcja: usunięcie jednego pola z `from_dict` musi zaczerwienić test).
    pelny: dict[str, object] = {"id": "syntetyczny", "name": "pełny", "rodzaj": pozycje[0].rodzaj}
    for indeks, nazwa in enumerate(ElementPolaType._POLA_LICZBOWE):
        pelny[nazwa] = 1.5 + indeks
    for nazwa in ElementPolaType._POLA_TEKSTOWE:
        pelny[nazwa] = f"wartość {nazwa}"
    for nazwa in ElementPolaType._POLA_LOGICZNE:
        pelny[nazwa] = True
    odczyt = ElementPolaType.from_dict(pelny)
    for nazwa in krotki:
        assert getattr(odczyt, nazwa) == pelny[nazwa], nazwa
    assert ElementPolaType.from_dict(odczyt.to_dict()) == odczyt
    with pytest.raises(BrakujacePoleIRError):
        ElementPolaType.from_dict({"name": "bez identyfikatora", "rodzaj": "WSKAZNIK_NAPIECIA"})
