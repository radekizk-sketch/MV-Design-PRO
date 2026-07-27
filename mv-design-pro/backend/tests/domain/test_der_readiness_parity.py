"""PARZYSTOSC dwoch implementacji reguly gotowosci wytworcy (V12K-244).

Regula zyje w dwoch miejscach: kanonicznie w backendzie i w warstwie warsztatu
w przegladarce (ocena rekordu jeszcze NIEZAPISANEGO w modelu). Dopoki obie istnieja,
musza dawac ten sam werdykt — inaczej ocena zalezy od tego, KTO pyta.

Zrodlem oczekiwan jest WSPOLNY plik przypadkow (`docs/domain/der_readiness_parity_v1.json`),
ten sam, ktory czyta test po stronie frontu. Oczekiwania zapisano z normy i intencji;
gdyby powstaly przez zrzut z ktorejkolwiek implementacji, utrwalilyby jej blad.
"""

from __future__ import annotations

import json
import pathlib

import pytest
from domain.der_readiness import (
    WejscieGotowosciDer,
    macierz_gotowosci_der,
    osie_gotowosci_der,
)

PLIK_PRZYPADKOW = (
    pathlib.Path(__file__).resolve().parents[3] / "docs" / "domain" / "der_readiness_parity_v1.json"
)


def wczytaj_przypadki() -> list[dict]:
    dane = json.loads(PLIK_PRZYPADKOW.read_text(encoding="utf-8"))
    przypadki = dane["przypadki"]
    assert przypadki, "plik przypadkow parzystosci jest pusty"
    return przypadki


PRZYPADKI = wczytaj_przypadki()


def test_plik_przypadkow_jest_tam_gdzie_szuka_go_drugi_stos() -> None:
    # Bramka, ktora nie pozwala „naprawic" parzystosci przez przeniesienie pliku:
    # test frontu wskazuje DOKLADNIE te sciezke.
    assert PLIK_PRZYPADKOW.exists(), PLIK_PRZYPADKOW
    assert PLIK_PRZYPADKOW.name == "der_readiness_parity_v1.json"


@pytest.mark.parametrize("przypadek", PRZYPADKI, ids=[p["nazwa"] for p in PRZYPADKI])
def test_werdykt_zgodny_ze_wspolnym_kontraktem(przypadek: dict) -> None:
    wejscie = WejscieGotowosciDer(**przypadek["wejscie"])
    macierz = macierz_gotowosci_der(wejscie)
    for os, oczekiwany in przypadek["oczekiwane"].items():
        assert macierz[os] == oczekiwany, f"{przypadek['nazwa']}: os {os}"


@pytest.mark.parametrize("przypadek", PRZYPADKI, ids=[p["nazwa"] for p in PRZYPADKI])
def test_powody_zgodne_ze_wspolnym_kontraktem(przypadek: dict) -> None:
    osie = {
        os.axis: [b.code for b in os.blockers]
        for os in osie_gotowosci_der(WejscieGotowosciDer(**przypadek["wejscie"]))
    }
    for os, kody in przypadek["kody_blokad"].items():
        for kod in kody:
            assert kod in osie[os], f"{przypadek['nazwa']}: brak powodu {kod} na osi {os}"
