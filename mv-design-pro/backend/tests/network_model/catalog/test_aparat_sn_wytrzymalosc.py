"""Znamiona wytrzymałości zwarciowej pozycji APARAT_SN (karta KD-6, poz. 1).

DLACZEGO. Pole stacji wskazuje aparat pozycją katalogu APARAT_SN, ale pozycja
nie niosła prądu dynamicznego ani cieplnego — więc weryfikacja wytrzymałości
mogła się oprzeć WYŁĄCZNIE na ręcznie wskazanym aparacie z osobnego katalogu
wytrzymałości (konfiguracja stacji). To był rozspojony łańcuch: model wiedział,
jaki aparat stoi w polu, i mimo to nie dało się go sprawdzić.

ZASADA (rozstrzygnięcie karty): znamiona wytrzymałości to DANE TABLICZKOWE —
należą do pozycji katalogowej. Wartość, której karta katalogowa nie niesie,
zostaje ``None`` (kod gotowości w walidacji), a nie przelicznik z prądu
łączeniowego. Jedyne dopuszczone wyprowadzenie to ugruntowana relacja normowa
I_dyn = 2,5 · I_th (IEC 62271-1) — ZAWSZE z jawnym pochodzeniem
``derived_iec62271``.
"""

from __future__ import annotations

from network_model.catalog import get_default_mv_catalog
from network_model.catalog.types import (
    POCHODZENIE_DERYWACJA_IEC62271,
    POCHODZENIE_PRODUCENT,
    POCHODZENIE_REFERENCYJNY,
    WSPOLCZYNNIK_IDYN_DO_ITH_APARAT_SN,
    MVApparatusType,
    idyn_aparatu_sn_z_ith,
)

# Pozycje z REALNEGO katalogu (nie fixture) — most ma działać na danych, które
# wskazują operacje domenowe budujące pola stacji.
WYLACZNIK_ABB_12KV = "sw-cb-abb-vd4-12kv-630a"
BEZPIECZNIK_ETI = "sw-fuse-eti-vv-12kv-63a"
UZIEMNIK_GENERYCZNY = "sw-es-generic-12kv"


def _pozycja(item_id: str) -> MVApparatusType:
    pozycja = get_default_mv_catalog().get_mv_apparatus_type(item_id)
    assert pozycja is not None, f"Katalog APARAT_SN musi zawierać {item_id}"
    return pozycja


def test_pozycja_producenta_niesie_prad_cieplny_z_czasem_odniesienia() -> None:
    """I_th pochodzi z karty producenta (Icw 1 s) — razem z czasem odniesienia."""
    pozycja = _pozycja(WYLACZNIK_ABB_12KV)

    assert pozycja.i_th_ka == 20.0
    assert pozycja.i_th_duration_s == 1.0
    assert pozycja.pochodzenie_i_th() == POCHODZENIE_PRODUCENT
    assert pozycja.to_dict()["i_th_pochodzenie"] == POCHODZENIE_PRODUCENT


def test_prad_dynamiczny_wyprowadzony_normowo_ma_pochodzenie_derived_iec62271() -> None:
    """I_dyn bez wartości producenta = 2,5 · I_th, z JAWNYM pochodzeniem.

    Wariant derywacji jest asertowany OSOBNO od wariantu producenckiego: to dwa
    różne stany wiedzy o aparacie i odbiorca musi je rozróżniać.
    """
    pozycja = _pozycja(WYLACZNIK_ABB_12KV)
    zapis = pozycja.to_dict()

    assert pozycja.i_dyn_ka is None, "Katalog nie niesie jawnej wartości producenta"
    assert zapis["i_dyn_ka"] == 20.0 * WSPOLCZYNNIK_IDYN_DO_ITH_APARAT_SN
    assert zapis["i_dyn_pochodzenie"] == POCHODZENIE_DERYWACJA_IEC62271


def test_wartosc_producenta_ma_pierwszenstwo_przed_derywacja() -> None:
    pozycja = MVApparatusType(
        id="test-cb",
        name="Wyłącznik z kartą producenta",
        manufacturer="ABB",
        i_th_ka=20.0,
        i_th_duration_s=1.0,
        i_dyn_ka=52.5,
    )
    zapis = pozycja.to_dict()

    assert zapis["i_dyn_ka"] == 52.5
    assert zapis["i_dyn_pochodzenie"] == POCHODZENIE_PRODUCENT


def test_pozycja_bez_wytrzymalosci_krotkotrwalej_zostaje_bez_znamion() -> None:
    """Bezpiecznik topikowy nie ma Icw — i nie dostaje żadnej liczby zastępczej.

    W katalogu zapisano `icw_ka = 0.0` („nie dotyczy"). Przepisanie tego zera do
    znamion dałoby werdykt „nie wytrzymuje" tam, gdzie kryterium nie istnieje.
    """
    pozycja = _pozycja(BEZPIECZNIK_ETI)
    zapis = pozycja.to_dict()

    assert pozycja.i_th_ka is None
    assert pozycja.i_th_duration_s is None
    assert zapis["i_dyn_ka"] is None
    assert zapis["i_th_pochodzenie"] is None
    assert zapis["i_dyn_pochodzenie"] is None
    # Prąd łączeniowy ISTNIEJE (31,5 kA) i NIE stał się wytrzymałością cieplną.
    assert pozycja.breaking_capacity_ka == 31.5


def test_pozycja_generyczna_ma_pochodzenie_referencyjne_nie_producenckie() -> None:
    """Szereg generyczny (bez producenta) niesie wartość normy, nie tabliczki."""
    pozycja = _pozycja(UZIEMNIK_GENERYCZNY)

    assert pozycja.manufacturer is None
    assert pozycja.i_th_ka == 20.0
    assert pozycja.pochodzenie_i_th() == POCHODZENIE_REFERENCYJNY
    assert pozycja.to_dict()["i_dyn_pochodzenie"] == POCHODZENIE_DERYWACJA_IEC62271


def test_obieg_zapis_odczyt_nie_awansuje_derywacji_na_tabliczke() -> None:
    """to_dict → from_dict zachowuje STAN WIEDZY, nie tylko liczbę."""
    pozycja = _pozycja(WYLACZNIK_ABB_12KV)
    odtworzona = MVApparatusType.from_dict(pozycja.to_dict())

    assert odtworzona.i_dyn_ka is None
    assert odtworzona.to_dict()["i_dyn_pochodzenie"] == POCHODZENIE_DERYWACJA_IEC62271
    assert odtworzona.to_dict()["i_dyn_ka"] == pozycja.to_dict()["i_dyn_ka"]


def test_brak_pradu_cieplnego_daje_brak_dynamicznego() -> None:
    assert idyn_aparatu_sn_z_ith(None) is None
    assert idyn_aparatu_sn_z_ith(0.0) is None
    assert idyn_aparatu_sn_z_ith(25.0) == 62.5


def test_caly_katalog_aparatow_ma_spojne_znamiona() -> None:
    """Nigdzie nie ma I_dyn bez I_th ani I_th bez czasu odniesienia."""
    pozycje = get_default_mv_catalog().list_mv_apparatus_types()
    assert pozycje, "Katalog APARAT_SN nie może być pusty"

    for pozycja in pozycje:
        zapis = pozycja.to_dict()
        if zapis["i_dyn_ka"] is not None:
            assert pozycja.i_th_ka is not None, pozycja.id
        if pozycja.i_th_ka is not None:
            assert pozycja.i_th_duration_s is not None, pozycja.id
            assert pozycja.i_th_duration_s > 0, pozycja.id


def test_prad_zalaczalny_szczytowy_nie_jest_kopia_wytrzymalosci_krotkotrwalej() -> None:
    """Making capacity to wartość SZCZYTOWA — nie wolno jej mylić z Icw.

    Do KD-6 pozycje derywowane niosły w `making_capacity_ka` kopię `icw_ka`,
    czyli wartość skuteczną pod nazwą szczytowej. Danej producenta nie ma, więc
    pole zostaje puste (dług nazwany), a Icw trafiło tam, gdzie jego miejsce.
    """
    pozycja = _pozycja(WYLACZNIK_ABB_12KV)

    assert pozycja.making_capacity_ka is None
    assert pozycja.i_th_ka == 20.0
