"""Typ pary danych przyjętych wyniku w interfejsie jest lustrem pomocnika pary backendu.

Po co: każdy ekran wyniku czyta parę ``status_danych`` + ``dane_przyjete`` typem
``ParaDanychPrzyjetych`` (``frontend/src/ui2/wyniki/wzorzec/danePrzyjete.ts``) i pokazuje ją
wspólnym zapisem ``StanDanychWyniku`` (kontrakt werdyktu §3, ZASADA NR 4 pkt 4). Para nie jest
klasą ``werdykt.kontrakt`` (płaskie pola słownika odpowiedzi), więc lustro ``werdykt.ts``
(``test_parytet_kontraktu_werdyktu_fe.py``) jej nie obejmuje — ten test przypina zbiór pól
pary do pomocników ``enm.dane_przyjete_galezi.pola_danych_przyjetych_biegu/_wiersza``:

- lista niepusta → oba pomocniki zwracają DOKŁADNIE pola interfejsu, ze stanem
  ``UNVALIDATED_INPUT`` (wartość unii ``StanDanych``);
- lista pusta → żadnego pola (wynik na danych projektu bez zmian, ekran bez zapisu).
"""

from __future__ import annotations

import re
from pathlib import Path

from enm.dane_przyjete_galezi import (
    KLUCZ_WIERSZA_DANE_GALEZI,
    KOD_Z0_ROBOCZE,
    pola_danych_przyjetych_biegu,
    pola_danych_przyjetych_wiersza,
)
from werdykt.kontrakt import DanaPrzyjeta, StatusDanych

_PARA_TS = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "src"
    / "ui2"
    / "wyniki"
    / "wzorzec"
    / "danePrzyjete.ts"
)


def _pola_interfejsu() -> frozenset[str]:
    tresc = _PARA_TS.read_text(encoding="utf-8")
    dopasowanie = re.search(
        r"^export interface ParaDanychPrzyjetych \{(.*?)^\}", tresc, re.M | re.S
    )
    assert dopasowanie, "Brak interfejsu ParaDanychPrzyjetych w danePrzyjete.ts."
    return frozenset(re.findall(r"^\s+readonly (\w+)\?:", dopasowanie.group(1), re.M))


def _dana() -> dict[str, object]:
    return {
        "nazwa_pl": "położenie przewodów fazowych na słupie (Linia 110 kV A–B)",
        "wartosc": None,
        "powod_pl": "wartość robocza (założenie inżynierskie): słup typowy linii 110 kV",
        "jakosc": "ESTIMATED",
    }


def _zalozenie_biegu(dane: list[dict[str, object]]) -> dict[str, object]:
    # Założenie biegu z kodem danych gałęzi — czytane przez ``dane_przyjete_biegu``.
    return {"zalozenia": [{"code": KOD_Z0_ROBOCZE, "dane_przyjete": dane}]}


def test_pola_interfejsu_to_pola_statusu_danych_kontraktu() -> None:
    assert _pola_interfejsu() == {"status_danych", "dane_przyjete"}
    assert "dane_przyjete" in StatusDanych.model_fields
    assert set(DanaPrzyjeta.model_fields) == set(_dana())


def test_pomocniki_pary_zwracaja_pola_interfejsu_przy_liscie_niepustej() -> None:
    wiersz = {KLUCZ_WIERSZA_DANE_GALEZI: [_dana()]}
    for pola in (
        pola_danych_przyjetych_wiersza(wiersz),
        pola_danych_przyjetych_biegu(_zalozenie_biegu([_dana()])),
    ):
        assert set(pola) == _pola_interfejsu()
        assert pola["status_danych"] == "UNVALIDATED_INPUT"
        assert [d["nazwa_pl"] for d in pola["dane_przyjete"]] == [_dana()["nazwa_pl"]]


def test_pomocniki_pary_bez_pol_przy_liscie_pustej() -> None:
    assert pola_danych_przyjetych_wiersza({}) == {}
    assert pola_danych_przyjetych_wiersza(None) == {}
    assert pola_danych_przyjetych_biegu({"zalozenia": []}) == {}
    assert pola_danych_przyjetych_biegu(None) == {}
