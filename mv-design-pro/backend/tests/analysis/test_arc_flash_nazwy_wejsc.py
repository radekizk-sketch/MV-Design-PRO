"""Braki łuku elektrycznego w tekście dla projektanta — nazwy wielkości, nigdy kody.

Brak wejścia (``ArcFlashBuilder._missing_inputs``) i brak wpisu tablicy współczynników
(``ArcFlashCoefficientTable.missing_for``) trafiają do zdania ``why_pl`` i do listy
``missing_data_pl``, którą ekran jakości pokazuje wprost. Kod maszynowy (nazwa pola wejścia,
adres wpisu pliku danych ``I_arc[VCB,V600]``) zostaje wyłącznie w ``missing_data``.
Iloczyn cech: rodzaj braku (wejście / tablica) × konfiguracja elektrod (w obudowie /
w otwartym powietrzu — korekcja obudowy tylko w obudowie) × typ obudowy.
"""

from __future__ import annotations

import pytest
from analysis.arc_flash import ArcFlashBuilder, ArcFlashInput, ArcFlashStatus
from analysis.arc_flash.models import (
    NAZWY_WEJSC_ARC_FLASH_PL,
    ElectrodeConfig,
    EnclosureType,
    empty_ieee_1584_table,
)
from analysis.arc_flash.serializer import result_to_dict

_PUSTE = ArcFlashInput(bus_ref="szyna_1", i_bf_ka=None, voltage_kv=None, arc_time_s=None)


def test_nazwy_wejsc_kompletne_wobec_bramki_wejsc() -> None:
    """Klucze słownika = komplet kodów, które bramka wejść może zgłosić (wszystkie wejścia
    puste)."""
    assert list(NAZWY_WEJSC_ARC_FLASH_PL) == ArcFlashBuilder._missing_inputs(_PUSTE)


def test_zdanie_braku_wejsc_nazywa_wielkosci_bez_kodow_pol() -> None:
    """Zdanie wyniku „dane niekompletne” i lista ``missing_data_pl`` wymieniają nazwy
    wielkości, a pola maszynowe zostają wyłącznie w ``missing_data``."""
    wynik = ArcFlashBuilder().build([_PUSTE]).results[0]
    assert wynik.status is ArcFlashStatus.INCOMPLETE_INPUT
    assert wynik.missing_data == tuple(NAZWY_WEJSC_ARC_FLASH_PL)
    assert wynik.missing_data_pl == tuple(NAZWY_WEJSC_ARC_FLASH_PL.values())
    for kod, nazwa in NAZWY_WEJSC_ARC_FLASH_PL.items():
        assert nazwa in wynik.why_pl, kod
        assert kod not in wynik.why_pl, kod
    assert result_to_dict(wynik)["missing_data_pl"] == list(wynik.missing_data_pl)


@pytest.mark.parametrize("konfiguracja", list(ElectrodeConfig))
@pytest.mark.parametrize("obudowa", list(EnclosureType))
def test_brak_tablicy_nazywa_wspolczynniki_bez_adresow_wpisow(
    konfiguracja: ElectrodeConfig, obudowa: EnclosureType
) -> None:
    """Pusta tablica: każdy brak ma parę (adres wpisu, opis), opisy idą do zdania i do
    ``missing_data_pl``, a ani adres wpisu, ani kod konfiguracji/obudowy nie stoi w zdaniu
    bez opisu słownego."""
    tablica = empty_ieee_1584_table()
    kody = tablica.missing_for(konfiguracja, obudowa)
    opisy = tablica.missing_for_pl(konfiguracja, obudowa)
    assert len(kody) == len(opisy) == (8 if konfiguracja.is_boxed else 7)
    wejscie = ArcFlashInput(
        bus_ref="szyna_1",
        i_bf_ka=10.0,
        voltage_kv=15.0,
        arc_time_s=0.2,
        conductor_gap_mm=152.0,
        working_distance_mm=914.0,
        electrode_config=konfiguracja,
        enclosure_type=obudowa,
    )
    wynik = ArcFlashBuilder(coefficient_table=tablica).build([wejscie]).results[0]
    assert wynik.status is ArcFlashStatus.INCOMPLETE_TABLE
    assert wynik.missing_data == kody
    assert wynik.missing_data_pl == opisy
    for kod in kody:
        assert kod not in wynik.why_pl, kod
    for opis in opisy:
        assert opis in wynik.why_pl, opis
    assert konfiguracja.nazwa_pl in wynik.why_pl
    if konfiguracja.is_boxed:
        assert obudowa.nazwa_pl in wynik.why_pl
        assert f"{obudowa.value}," not in wynik.why_pl
