"""Rdzenie CT i uzwojenia VT jako lista — kontrakt liścia `network_model/catalog/przekladniki`.

PO CO. Pole liniowe GPZ wg ENEA (Z.10 s.89, Z.11 s.90, Z.11.1 s.91) opisuje przekładniki listą
rdzeni/uzwojeń z przeznaczeniem; dawna liczba `ct_cores` nie mówiła, do czego rdzeń służy.
Ten sam model niesie typ katalogowy (`CTType`/`VTType`), aparat pola (`BayPrimaryDevice`)
i przekładnik modelu (`Measurement`) — test pilnuje reguł raz, w liściu, i spójności nośników.

Iloczyn cech rdzenia CT: klasa {pomiarowa liczbowa, pomiarowa „S", zabezpieczeniowa,
nierozpoznana, złożona} × FS {brak, podany} × przeznaczenie {pomiarowe, zabezpieczeniowe,
mieszane, puste}. Uzwojenie VT: klasa {pomiarowa, zabezpieczeniowa, podwójna 0,5/3P,
nierozpoznana} × przeznaczenie × otwarty trójkąt.
"""

from __future__ import annotations

import itertools

import pytest
from network_model.catalog.przekladniki import (
    PRZEZNACZENIA_POMIAROWE,
    PRZEZNACZENIA_ZABEZPIECZENIOWE,
    RdzenPrzekladnikaPradowego,
    UzwojeniePrzekladnikaNapieciowego,
    rdzen_ct_z_klasy,
)
from network_model.catalog.types import CTType, VTType
from pydantic import ValidationError

KLASY_CT = {
    "0,2": "metering",
    "0.5": "metering",
    "0,2S": "metering",
    "0.5s": "metering",
    "5P20": "protection",
    "10P10": "protection",
    "X1": None,
    "5P10/0,5": None,
}
FS = [None, 5.0]
PRZEZNACZENIA = {
    "pomiarowe": ("ROZLICZENIE", "JAKOSC_ENERGII"),
    "zabezpieczeniowe": ("ZABEZPIECZENIA",),
    "mieszane": ("POMIAR", "ZABEZPIECZENIA"),
    "regulacja": ("REGULACJA",),
    "puste": (),
}


def _oczekiwana_poprawnosc_rdzenia(klasa: str, fs: float | None, przeznaczenie: tuple) -> bool:
    rodzaj = KLASY_CT[klasa]
    if rodzaj is None or not przeznaczenie:
        return False
    if rodzaj == "protection" and fs is not None:
        return False
    zakazane = PRZEZNACZENIA_ZABEZPIECZENIOWE if rodzaj == "metering" else PRZEZNACZENIA_POMIAROWE
    return not (zakazane & set(przeznaczenie))


@pytest.mark.parametrize(
    "klasa,fs,przeznaczenie",
    list(itertools.product(KLASY_CT, FS, PRZEZNACZENIA)),
)
def test_rdzen_ct_iloczyn_klasa_fs_przeznaczenie(klasa, fs, przeznaczenie):
    dane = {
        "przekladnia": "200-400/5",
        "moc_va": 10.0,
        "klasa": klasa,
        "fs": fs,
        "przeznaczenie": list(PRZEZNACZENIA[przeznaczenie]),
    }
    if _oczekiwana_poprawnosc_rdzenia(klasa, fs, PRZEZNACZENIA[przeznaczenie]):
        rdzen = RdzenPrzekladnikaPradowego.model_validate(dane)
        assert rdzen.rodzaj == KLASY_CT[klasa]
        assert rdzen.fs == fs
    else:
        with pytest.raises(ValidationError):
            RdzenPrzekladnikaPradowego.model_validate(dane)


def test_klasa_rozszerzonego_zakresu_rozpoznana() -> None:
    # Dawna funkcja w `types.py` nie rozpoznawała „0,2S" (float('0.2S') → ValueError → None)
    # — rdzeń rozliczeniowy Z.11 byłby „nieustalony". Karta UX-04/POLE-LINIOWE-WZORZEC.
    assert rdzen_ct_z_klasy("0,2S") == "metering"
    assert rdzen_ct_z_klasy("0.5S") == "metering"
    assert rdzen_ct_z_klasy("S") is None


def test_alf_z_klasy_rdzenia() -> None:
    zab = RdzenPrzekladnikaPradowego(
        przekladnia="200-400/5", moc_va=15.0, klasa="5P20", przeznaczenie=("ZABEZPIECZENIA",)
    )
    pom = RdzenPrzekladnikaPradowego(
        przekladnia="200-400/5", moc_va=10.0, klasa="0,2S", fs=5.0, przeznaczenie=("ROZLICZENIE",)
    )
    assert zab.alf == 20.0
    assert pom.alf is None


def test_rdzen_niezmienny_i_bez_obcych_kluczy() -> None:
    rdzen = RdzenPrzekladnikaPradowego(
        przekladnia="200-400/5", moc_va=15.0, klasa="5P20", przeznaczenie=("ZABEZPIECZENIA",)
    )
    with pytest.raises(ValidationError):
        rdzen.moc_va = 30.0  # type: ignore[misc]
    with pytest.raises(ValidationError):
        RdzenPrzekladnikaPradowego.model_validate({**rdzen.model_dump(), "alf": 20})
    with pytest.raises(ValidationError):
        RdzenPrzekladnikaPradowego.model_validate({**rdzen.model_dump(), "moc_va": 0})


KLASY_VT = ["0,2", "0,5", "3P", "6P", "0,5/3P", "Q", "0,5/Q"]


def _czesci(klasa: str) -> set[str] | None:
    wynik: set[str] = set()
    for czesc in klasa.split("/"):
        czesc = czesc.strip().upper()
        if "P" in czesc:
            wynik.add("protection")
            continue
        try:
            float(czesc.replace(",", "."))
        except ValueError:
            return None
        wynik.add("metering")
    return wynik


@pytest.mark.parametrize(
    "klasa,przeznaczenie,otwarty_trojkat",
    list(itertools.product(KLASY_VT, PRZEZNACZENIA, [False, True])),
)
def test_uzwojenie_vt_iloczyn(klasa, przeznaczenie, otwarty_trojkat):
    cele = PRZEZNACZENIA[przeznaczenie]
    dane = {
        "przekladnia": "15/√3 / 0,1/3",
        "moc_va": 7.5,
        "klasa": klasa,
        "przeznaczenie": list(cele),
        "otwarty_trojkat": otwarty_trojkat,
    }
    czesci = _czesci(klasa)
    poprawne = (
        czesci is not None
        and bool(cele)
        and "ROZNICOWE" not in cele
        and (not (PRZEZNACZENIA_POMIAROWE & set(cele)) or "metering" in czesci)
        and ("ZABEZPIECZENIA" not in cele or "protection" in czesci)
    )
    if poprawne:
        uzw = UzwojeniePrzekladnikaNapieciowego.model_validate(dane)
        assert set(uzw.rodzaje) == czesci
        assert uzw.otwarty_trojkat is otwarty_trojkat
    else:
        with pytest.raises(ValidationError):
            UzwojeniePrzekladnikaNapieciowego.model_validate(dane)


def test_uzwojenia_z11_1_z_rysunku() -> None:
    """Z.11.1 s.91: SN/√3 / 0,1/√3 / 0,1/√3 / 0,1/3 — trzy uzwojenia."""
    uzwojenia = [
        UzwojeniePrzekladnikaNapieciowego(
            przekladnia="15/√3 / 0,1/√3", moc_va=10.0, klasa="0,2", przeznaczenie=("ROZLICZENIE",)
        ),
        UzwojeniePrzekladnikaNapieciowego(
            przekladnia="15/√3 / 0,1/√3", moc_va=7.5, klasa="0,2", przeznaczenie=("POMIAR",)
        ),
        UzwojeniePrzekladnikaNapieciowego(
            przekladnia="15/√3 / 0,1/3",
            moc_va=7.5,
            klasa="0,5/3P",
            przeznaczenie=("POMIAR", "ZABEZPIECZENIA"),
            otwarty_trojkat=True,
        ),
    ]
    assert [u.otwarty_trojkat for u in uzwojenia] == [False, False, True]


# --- typy katalogowe: lista jawna albo wyprowadzona z pól skalarnych ---------------------------


def test_ct_type_jednordzeniowy_z_pol_skalarnych() -> None:
    typ = CTType(
        id="ct-x",
        name="CT 400/5",
        ratio_primary_a=400.0,
        ratio_secondary_a=5.0,
        accuracy_class="5P20",
        burden_va=15.0,
    )
    rdzenie = typ.lista_rdzeni()
    assert len(rdzenie) == 1
    assert rdzenie[0].klasa == "5P20"
    assert rdzenie[0].przeznaczenie == ("ZABEZPIECZENIA",)
    slownik = typ.to_dict()
    assert slownik["liczba_rdzeni"] == 1
    assert CTType.from_dict(slownik).lista_rdzeni() == rdzenie


def test_ct_type_bez_mocy_nie_fabrykuje_rdzenia() -> None:
    typ = CTType(
        id="ct-y", name="CT", ratio_primary_a=400.0, ratio_secondary_a=5.0, accuracy_class="5P20"
    )
    assert typ.lista_rdzeni() == ()
    assert typ.to_dict()["liczba_rdzeni"] == 0


def test_ct_type_trojrdzeniowy_lista_jawna_round_trip() -> None:
    rdzenie = (
        RdzenPrzekladnikaPradowego(
            przekladnia="200-400/5",
            moc_va=10.0,
            klasa="0,2S",
            fs=5.0,
            przeznaczenie=("ROZLICZENIE", "JAKOSC_ENERGII"),
        ),
        RdzenPrzekladnikaPradowego(
            przekladnia="200-400/5", moc_va=10.0, klasa="0,2", fs=5.0, przeznaczenie=("POMIAR",)
        ),
        RdzenPrzekladnikaPradowego(
            przekladnia="200-400/5", moc_va=15.0, klasa="5P20", przeznaczenie=("ZABEZPIECZENIA",)
        ),
    )
    typ = CTType(
        id="ct-z11",
        name="CT 200-400/5/5/5",
        ratio_primary_a=400.0,
        ratio_secondary_a=5.0,
        rdzenie=rdzenie,
    )
    slownik = typ.to_dict()
    assert slownik["liczba_rdzeni"] == 3
    assert CTType.from_dict(slownik).lista_rdzeni() == rdzenie


def test_vt_type_uzwojenia_z_pol_skalarnych_bez_resztkowego() -> None:
    typ = VTType(
        id="vt-x",
        name="VT",
        ratio_primary_v=15000.0,
        ratio_secondary_v=100.0,
        accuracy_class="3P",
        accuracy_class_metering="0,5",
        burden_va=30.0,
        has_residual_winding=True,
    )
    uzwojenia = typ.lista_uzwojen()
    # Uzwojenie resztkowe bez klasy z tabliczki nie jest dopisywane (klasa nieznana).
    assert [u.klasa for u in uzwojenia] == ["3P", "0,5"]
    slownik = typ.to_dict()
    assert slownik["liczba_uzwojen"] == 2
    assert VTType.from_dict(slownik).lista_uzwojen() == uzwojenia
