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

Obiekty zagnieżdżone (``KSZTALTY_ZAGNIEZDZONE``, kształt równy odczytom handlera —
``tests/ci/test_spec_operacji_rowna_odczytom_handlera.py``): poziom {0, 1, 2} × klucz
{w kontrakcie, obcy} × postać {obiekt, element listy} dla KAŻDEJ ścieżki obiektu każdej
operacji; dyspozytor × klucz obcy na poziomie 1 i 2 → wpis dziennika ze ścieżką klucza.
"""

from __future__ import annotations

import pytest
from domain.canonical_operations import (
    CANONICAL_OPERATIONS,
    KSZTALTY_ZAGNIEZDZONE,
    KsztaltObiektu,
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


def _sciezki(
    ksztalty: dict[str, KsztaltObiektu], przodkowie: tuple[str, ...] = ()
) -> list[tuple[tuple[str, ...], KsztaltObiektu]]:
    wynik = []
    for klucz in sorted(ksztalty):
        sciezka = (*przodkowie, klucz)
        wynik.append((sciezka, ksztalty[klucz]))
        wynik.extend(_sciezki(dict(ksztalty[klucz].zagniezdzone), sciezka))
    return wynik


_SCIEZKI_OBIEKTOW = [
    (operacja, sciezka, ksztalt)
    for operacja in sorted(KSZTALTY_ZAGNIEZDZONE)
    for sciezka, ksztalt in _sciezki(KSZTALTY_ZAGNIEZDZONE[operacja])
]


def _pelny(ksztalt: KsztaltObiektu) -> dict[str, object]:
    """Obiekt z KAŻDYM kluczem kształtu; obiekty zagnieżdżone też pełne."""
    obiekt: dict[str, object] = dict.fromkeys(ksztalt.pola)
    for klucz, pod in ksztalt.zagniezdzone.items():
        obiekt[klucz] = _pelny(pod)
    return obiekt


def _ladunek_z_obiektem(
    operacja: str, sciezka: tuple[str, ...], obcy: bool, lista: bool
) -> tuple[dict[str, object], str]:
    """Pełny kontrakt + pełne obiekty; klucz obcy (albo nie) w obiekcie ``sciezka``.

    ``lista`` — obiekt docelowy jest drugim elementem listy (jak ``sn_fields``).
    Zwraca ładunek i oczekiwaną ścieżkę klucza obcego."""
    ladunek: dict[str, object] = dict.fromkeys(klucze_kontraktu(operacja))
    for klucz, ksztalt in KSZTALTY_ZAGNIEZDZONE[operacja].items():
        ladunek[klucz] = _pelny(ksztalt)
    rodzic: dict[str, object] = ladunek
    for klucz in sciezka[:-1]:
        rodzic = rodzic[klucz]  # type: ignore[assignment]
    cel = rodzic[sciezka[-1]]
    assert isinstance(cel, dict)
    oczekiwana = ".".join(sciezka)
    if lista:
        rodzic[sciezka[-1]] = [dict(cel), cel]
        oczekiwana = f"{oczekiwana}[1]"
    if obcy:
        cel[_OBCY] = 1
    return ladunek, f"{oczekiwana}.{_OBCY}"


@pytest.mark.parametrize("lista", [False, True], ids=["obiekt", "element_listy"])
@pytest.mark.parametrize("obcy", [False, True], ids=["w_kontrakcie", "obcy"])
@pytest.mark.parametrize(
    ("operacja", "sciezka"),
    [(o, s) for o, s, _k in _SCIEZKI_OBIEKTOW],
    ids=[f"{o}.{'.'.join(s)}" for o, s, _k in _SCIEZKI_OBIEKTOW],
)
def test_klucz_obiektu_zagniezdzonego(
    operacja: str, sciezka: tuple[str, ...], obcy: bool, lista: bool
) -> None:
    ladunek, oczekiwana = _ladunek_z_obiektem(operacja, sciezka, obcy, lista)
    assert klucze_spoza_kontraktu(operacja, ladunek) == ([oczekiwana] if obcy else [])


def test_iloczyn_obejmuje_poziomy_1_2_i_3() -> None:
    """Pokrycie poziomów: ścieżki obiektów mają głębokość 1, 2 i 3 (``station.transformer.
    catalog_binding``); poziom 0 — testy wyżej."""
    assert {len(s) for _o, s, _k in _SCIEZKI_OBIEKTOW} == {1, 2, 3}


def test_napis_w_miejscu_obiektu_rozstrzyga_handler() -> None:
    """Typ wartości (napis zamiast obiektu) nie jest kluczem spoza kontraktu."""
    assert klucze_spoza_kontraktu("continue_trunk_segment_sn", {"segment": "KABEL"}) == []


@pytest.mark.ladunek_spoza_kontraktu
@pytest.mark.parametrize(
    ("ladunek", "oczekiwane"),
    [
        ({"segment_id": "brak", "station": {"x_obcy": 1}}, ("station.x_obcy",)),
        (
            {"segment_id": "brak", "station": {"switchgear": {"x_obcy": 1}}},
            ("station.switchgear.x_obcy",),
        ),
        (
            {"segment_id": "brak", "sn_fields": ["POLE", {"x_obcy": 1}]},
            ("sn_fields[1].x_obcy",),
        ),
    ],
    ids=["poziom_1", "poziom_2", "element_listy"],
)
def test_dyspozytor_melduje_sciezke_klucza_obcego_obiektu(
    ladunek: dict[str, object],
    oczekiwane: tuple[str, ...],
    caplog: pytest.LogCaptureFixture,
    _ladunek_operacji_w_kontrakcie: list[str],
) -> None:
    with caplog.at_level("WARNING", logger="enm.domain_operations"):
        execute_domain_operation(_pusty(), "insert_station_on_segment_sn", ladunek)
    zapisy = [z for z in caplog.records if getattr(z, "klucze_spoza_kontraktu", None)]
    assert [z.klucze_spoza_kontraktu for z in zapisy] == [oczekiwane]
    assert len(_ladunek_operacji_w_kontrakcie) == 1


# Równoważnik na szynach SN GPZ bez danych transformatorów 110/SN — granica zasilania
# (karta GPZ-MODEL) odmawia transformatorów przy równoważniku po stronie SN, więc ładunek
# „z kontraktu" nie może ich nieść (scalenie z gałęzią UI/UX, 2026-10-22).
_GPZ = {
    "voltage_kv": 15.0,
    "sk3_mva": 250.0,
    "catalog_ref": "src-gpz-15kv-250mva-rx010",
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


@pytest.fixture(scope="module")
def _operacja_w_fiksturze_modulu() -> dict[str, object]:
    """Operacja wykonana w fiksturze MODUŁU — przed fiksturą funkcji czujnika."""
    return execute_domain_operation(
        _pusty(), "add_grid_source_sn", {**_GPZ, "line_fields_count": 2}
    )


@pytest.mark.ladunek_spoza_kontraktu
def test_czujnik_widzi_operacje_z_fikstury_modulu(
    _operacja_w_fiksturze_modulu: dict[str, object], _ladunek_operacji_w_kontrakcie: list[str]
) -> None:
    """Dawny czujnik przypinał się do dziennika na czas funkcji testowej — operacja z fikstury
    modułu (np. łańcuch przykładów dokumentu kontraktu) przechodziła bez śladu. Wpis obciąża
    teraz pierwszy test korzystający z fikstury (bez znacznika — błąd testu)."""
    assert _operacja_w_fiksturze_modulu.get("error") is None
    assert len(_ladunek_operacji_w_kontrakcie) == 1
    assert "line_fields_count" in _ladunek_operacji_w_kontrakcie[0]
