"""Klucz ładunku operacji spoza jej kontraktu — dziennik dyspozytora i czujnik testów.

Defekt (pomiar 2026-10-22, sonda wszystkich nadawców ćwiczonych testami backendu): dyspozytor
przyjmował każdy klucz ładunku, a handler czytał tylko swoje. 15 par (operacja, klucz) było
wysyłanych i nieczytanych, w tym w kodzie produktu: kompilator grafu sieci i szablon GPZ
(``line_fields_count`` zamiast ``line_fields_per_section`` — GPZ dostawał po cichu jedno pole
liniowe na sekcję), końcówka generatorów (``nc_rfg_module``), szablon stacji (``station_ref``
odbioru nN).

Iloczyn cech: operacja (każda z rejestru) × ładunek (pełny kontrakt, kontrakt + klucz obcy)
→ lista kluczy spoza kontraktu; dyspozytor × (klucz obcy, sam kontrakt) → wpis dziennika
albo jego brak; czujnik ``tests/conftest.py`` zbiera wpis (test oznaczony
``ladunek_spoza_kontraktu``, więc nie zamienia go w błąd).
"""

from __future__ import annotations

import pytest
from domain.canonical_operations import (
    CANONICAL_OPERATIONS,
    klucze_kontraktu,
    klucze_spoza_kontraktu,
)
from enm.domain_operations import execute_domain_operation

from tests.enm.siec_lacznikowa import _pusty

_OBCY = "klucz_ktorego_nikt_nie_czyta"


@pytest.mark.parametrize("operacja", sorted(CANONICAL_OPERATIONS))
def test_pelny_kontrakt_bez_kluczy_obcych(operacja: str) -> None:
    ladunek = dict.fromkeys(klucze_kontraktu(operacja))
    assert klucze_spoza_kontraktu(operacja, ladunek) == []


@pytest.mark.parametrize("operacja", sorted(CANONICAL_OPERATIONS))
def test_klucz_obcy_nazwany(operacja: str) -> None:
    ladunek = {**dict.fromkeys(klucze_kontraktu(operacja)), _OBCY: 1}
    assert klucze_spoza_kontraktu(operacja, ladunek) == [_OBCY]


_GPZ = {
    "voltage_kv": 15.0,
    "sk3_mva": 250.0,
    "catalog_ref": "src-gpz-15kv-250mva-rx010",
    "hv_voltage_kv": 110.0,
    "transformer_sn_mva": 25.0,
}


@pytest.mark.ladunek_spoza_kontraktu
def test_dyspozytor_melduje_klucz_obcy_i_czujnik_go_zbiera(
    caplog: pytest.LogCaptureFixture, _ladunek_operacji_w_kontrakcie: list[str]
) -> None:
    with caplog.at_level("WARNING", logger="enm.domain_operations"):
        wynik = execute_domain_operation(
            _pusty(), "add_grid_source_sn", {**_GPZ, "line_fields_count": 3}
        )
    assert wynik.get("error") is None, wynik.get("error")
    zapisy = [z for z in caplog.records if getattr(z, "klucze_spoza_kontraktu", None)]
    assert [z.klucze_spoza_kontraktu for z in zapisy] == [("line_fields_count",)]
    assert len(_ladunek_operacji_w_kontrakcie) == 1
    assert "line_fields_count" in _ladunek_operacji_w_kontrakcie[0]


def test_dyspozytor_milczy_dla_ladunku_z_kontraktu(
    caplog: pytest.LogCaptureFixture, _ladunek_operacji_w_kontrakcie: list[str]
) -> None:
    with caplog.at_level("WARNING", logger="enm.domain_operations"):
        wynik = execute_domain_operation(
            _pusty(), "add_grid_source_sn", {**_GPZ, "line_fields_per_section": 3}
        )
    assert wynik.get("error") is None, wynik.get("error")
    assert not [z for z in caplog.records if getattr(z, "klucze_spoza_kontraktu", None)]
    assert _ladunek_operacji_w_kontrakcie == []


@pytest.mark.parametrize("liczba_pol", [1, 3])
def test_kompilator_grafu_daje_gpz_tyle_pol_ile_zada(liczba_pol: int) -> None:
    """Kompilator grafu sieci (sieci referencyjne z literatury) wysyła liczbę pól liniowych
    kluczem kontraktu — dawny klucz poziomu sekcji dawał jedno pole przy każdej liczbie."""
    from enm.kompilator_grafu import _gpz_line_fields, dodaj_zrodlo_slack

    enm, _szyna = dodaj_zrodlo_slack(
        _pusty(), voltage_kv=15.0, sk3_mva=250.0, rx_ratio=0.1, line_fields_count=liczba_pol
    )
    assert len(_gpz_line_fields(enm)) == liczba_pol
