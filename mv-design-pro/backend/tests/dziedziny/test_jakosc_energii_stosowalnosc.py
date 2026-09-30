"""Stosowalność wymagania jakości energii — zakaz przenoszenia (karta AB-H0 §0.12.2).

Iloczyn cech: rodzaj wymagania (5) × poziom wpisu (3) × poziom przedmiotu (3) × punkt
oceny (4) × podmiot oceny (3) × rodzaj oceny (3) = 1620 przypadków z niezależną wyrocznią.
Trzy rodziny zakazu przenoszenia (nN→SN, urządzenie→instalacja, kompatybilność→emisja)
przypięte OSOBNYMI testami z nazwą reguły w komunikacie.
"""

from __future__ import annotations

import itertools
from typing import get_args

import pytest
from dziedziny.jakosc_energii import (
    AgregacjaWymagania,
    ParametrMetody,
    PodmiotWymagania,
    PoziomNapieciaWymagania,
    PozycjaTabeliLimitow,
    PrzedmiotOceny,
    PunktPomiaruWymagania,
    RodzajOceny,
    RodzajWymaganiaJakosci,
    WymaganieJakosciEnergii,
    ZakresNapieciaWymagania,
    ZakresPasma,
    stosowalnosc_wymagania_jakosci,
)
from pydantic import ValidationError
from werdykt.kontrakt import Wielkosc

from tests.dziedziny import fabryki as f

RODZAJE: tuple[RodzajWymaganiaJakosci, ...] = get_args(RodzajWymaganiaJakosci)
POZIOMY: tuple[PoziomNapieciaWymagania, ...] = get_args(PoziomNapieciaWymagania)
PUNKTY: tuple[PunktPomiaruWymagania, ...] = get_args(PunktPomiaruWymagania)
PODMIOTY: tuple[PodmiotWymagania, ...] = get_args(PodmiotWymagania)
OCENY: tuple[RodzajOceny, ...] = get_args(RodzajOceny)

PUNKT_WPISU: PunktPomiaruWymagania = "PUNKT_PRZYLACZENIA"
PODMIOT_WPISU: dict[str, PodmiotWymagania] = {
    "LIMIT_EMISJI_URZADZENIA": "URZADZENIE",
    "LIMIT_EMISJI_PRZYDZIELONY": "PODMIOT_PRZYLACZANY",
    "POZIOM_KOMPATYBILNOSCI": "OSD",
    "CHARAKTERYSTYKA_NAPIECIA_ZASILANIA": "OSD",
    "POZIOM_PLANOWANIA": "OSD",
}


def wpis(
    rodzaj: RodzajWymaganiaJakosci = "CHARAKTERYSTYKA_NAPIECIA_ZASILANIA",
    poziom: PoziomNapieciaWymagania = "SN",
    **inne: object,
) -> WymaganieJakosciEnergii:
    dane: dict[str, object] = {
        "ident": "PN-EN-50160-THD-U-SN",
        "wielkosc": "THD_U",
        "rodzaj_wymagania": rodzaj,
        "podmiot": PODMIOT_WPISU[rodzaj],
        "poziom_napiecia": ZakresNapieciaWymagania(poziom=poziom),
        "punkt_pomiaru": PUNKT_WPISU,
        "agregacja": AgregacjaWymagania(okno_s=600.0, statystyka_pl="95 % wartości 10-min"),
        "wartosc": Wielkosc(wartosc=8.0, jednostka="%"),
        "odniesienie": "U_1",
        "podstawa": f.podstawa(rodzaj="NORMA", status="NIEUSTALONE", dokument="PN-EN 50160"),
        "wersja": "1",
    }
    dane.update(inne)
    return WymaganieJakosciEnergii(**dane)


def oczekiwane_reguly(
    rodzaj: str, poziom_wpisu: str, poziom: str, punkt: str, podmiot: str, ocena: str
) -> set[str]:
    reguly: set[str] = set()
    if poziom_wpisu != poziom:
        reguly.add("brak przenoszenia")
    if rodzaj == "LIMIT_EMISJI_URZADZENIA" and ocena != "EMISJA_URZADZENIA":
        reguly.add("urządzenie ≠ instalacja")
    if rodzaj == "LIMIT_EMISJI_PRZYDZIELONY" and ocena == "EMISJA_URZADZENIA":
        reguly.add("instalacja ≠ urządzenie")
    if (
        rodzaj
        in ("POZIOM_KOMPATYBILNOSCI", "CHARAKTERYSTYKA_NAPIECIA_ZASILANIA", "POZIOM_PLANOWANIA")
        and ocena != "KOMPATYBILNOSC_SIECI"
    ):
        reguly.add("kompatybilność/charakterystyka ≠ emisja")
    if rodzaj in ("LIMIT_EMISJI_PRZYDZIELONY", "LIMIT_EMISJI_URZADZENIA") and (
        ocena == "KOMPATYBILNOSC_SIECI"
    ):
        reguly.add("emisja ≠ kompatybilność")
    if punkt != PUNKT_WPISU:
        reguly.add("punkt pomiaru wpisu")
    if podmiot != PODMIOT_WPISU[rodzaj]:
        reguly.add("wymaganie adresowane do")
    return reguly


def test_iloczyn_cech_stosowalnosci_z_wyrocznia() -> None:
    przypadki = 0
    rozbieznosci: list[str] = []
    for rodzaj, poziom_wpisu, poziom, punkt, podmiot, ocena in itertools.product(
        RODZAJE, POZIOMY, POZIOMY, PUNKTY, PODMIOTY, OCENY
    ):
        przypadki += 1
        wynik = stosowalnosc_wymagania_jakosci(
            wpis(rodzaj, poziom_wpisu),
            PrzedmiotOceny(
                poziom_napiecia=poziom, punkt=punkt, podmiot=podmiot, rodzaj_oceny=ocena
            ),
        )
        reguly = oczekiwane_reguly(rodzaj, poziom_wpisu, poziom, punkt, podmiot, ocena)
        if wynik.dotyczy == bool(reguly):
            rozbieznosci.append(f"{rodzaj}/{poziom_wpisu}/{poziom}/{punkt}/{podmiot}/{ocena}")
            continue
        brakujace = [r for r in reguly if r not in wynik.powod_pl]
        if brakujace:
            rozbieznosci.append(f"{rodzaj}/{poziom_wpisu}/{poziom}: brak {brakujace}")
        assert wynik.powod_pl.strip()
        assert wynik.podstawa is not None
    assert przypadki == 1620
    assert not rozbieznosci, f"{len(rozbieznosci)} rozbieżności:\n" + "\n".join(rozbieznosci[:20])


# --- Trzy rodziny zakazu przenoszenia (osobno, z nazwą w komunikacie) -------------------


@pytest.mark.parametrize(
    ("poziom_wpisu", "poziom", "nazwa"),
    [("NN", "SN", "nN→SN"), ("SN", "NN", "SN→nN"), ("SN", "WN", "SN→WN"), ("WN", "SN", "WN→SN")],
)
def test_rodzina_1_brak_przenoszenia_miedzy_poziomami(
    poziom_wpisu: PoziomNapieciaWymagania, poziom: PoziomNapieciaWymagania, nazwa: str
) -> None:
    wynik = stosowalnosc_wymagania_jakosci(
        wpis("CHARAKTERYSTYKA_NAPIECIA_ZASILANIA", poziom_wpisu),
        PrzedmiotOceny(
            poziom_napiecia=poziom,
            punkt=PUNKT_WPISU,
            podmiot="OSD",
            rodzaj_oceny="KOMPATYBILNOSC_SIECI",
        ),
    )
    assert wynik.dotyczy is False
    assert f"brak przenoszenia {nazwa}" in wynik.powod_pl


def test_rodzina_2_urzadzenie_nie_jest_instalacja() -> None:
    wynik = stosowalnosc_wymagania_jakosci(
        wpis("LIMIT_EMISJI_URZADZENIA", "SN", wielkosc="I_H"),
        PrzedmiotOceny(
            poziom_napiecia="SN",
            punkt=PUNKT_WPISU,
            podmiot="URZADZENIE",
            rodzaj_oceny="EMISJA_INSTALACJI",
        ),
    )
    assert wynik.dotyczy is False
    assert wynik.powod_pl.startswith("urządzenie ≠ instalacja")


def test_rodzina_3_kompatybilnosc_nie_jest_emisja() -> None:
    for rodzaj in (
        "POZIOM_KOMPATYBILNOSCI",
        "CHARAKTERYSTYKA_NAPIECIA_ZASILANIA",
        "POZIOM_PLANOWANIA",
    ):
        wynik = stosowalnosc_wymagania_jakosci(
            wpis(rodzaj, "SN"),
            PrzedmiotOceny(
                poziom_napiecia="SN",
                punkt=PUNKT_WPISU,
                podmiot="OSD",
                rodzaj_oceny="EMISJA_INSTALACJI",
            ),
        )
        assert wynik.dotyczy is False
        assert "kompatybilność/charakterystyka ≠ emisja" in wynik.powod_pl


def test_wpis_stosuje_sie_gdy_wszystko_zgodne() -> None:
    wynik = stosowalnosc_wymagania_jakosci(
        wpis("CHARAKTERYSTYKA_NAPIECIA_ZASILANIA", "SN"),
        PrzedmiotOceny(
            poziom_napiecia="SN",
            punkt=PUNKT_WPISU,
            podmiot="OSD",
            rodzaj_oceny="KOMPATYBILNOSC_SIECI",
        ),
    )
    assert wynik.dotyczy is True
    assert "stosuje się" in wynik.powod_pl


# --- Walidacja wpisu -------------------------------------------------------------------


def test_wpis_wartosc_albo_tabela_dokladnie_jedno() -> None:
    with pytest.raises(ValidationError, match="dokładnie jedno"):
        wpis(wartosc=None)
    with pytest.raises(ValidationError, match="dokładnie jedno"):
        wpis(
            tabela=(PozycjaTabeliLimitow(f_hz=250.0, wartosc=Wielkosc(wartosc=6.0, jednostka="%")),)
        )
    tabelaryczny = wpis(
        ident="LIMITY-INDYWIDUALNE",
        wielkosc="U_H",
        wartosc=None,
        tabela=(
            PozycjaTabeliLimitow(f_hz=350.0, wartosc=Wielkosc(wartosc=5.0, jednostka="%")),
            PozycjaTabeliLimitow(f_hz=250.0, wartosc=Wielkosc(wartosc=6.0, jednostka="%")),
        ),
    )
    assert [p.f_hz for p in tabelaryczny.tabela or ()] == [250.0, 350.0]


def test_wpis_procent_bez_odniesienia_jest_odrzucany() -> None:
    with pytest.raises(ValidationError, match="bez odniesienia"):
        wpis(odniesienie=None)


def test_wpis_z_podstawa_spoza_rejestru_jest_odrzucany() -> None:
    for rodzaj in ("KATALOG_PRODUCENTA", "ZALOZENIE_PROJEKTOWE", "WOS", "NIEUSTALONA"):
        with pytest.raises(ValidationError, match="wpis rejestru pochodzi"):
            wpis(podstawa=f.podstawa(rodzaj=rodzaj, status="NIEUSTALONE"))
    for rodzaj in ("NORMA", "PRAWO_KRAJOWE", "OSD"):
        assert wpis(podstawa=f.podstawa(rodzaj=rodzaj, status="NIEUSTALONE"))


def test_wielkosc_pasma_supraharmonicznego_wymaga_pasma() -> None:
    with pytest.raises(ValidationError, match="wymaga pasma"):
        wpis(wielkosc="U_PASMA_SUPRAHARMONICZNEGO")
    assert wpis(
        wielkosc="U_PASMA_SUPRAHARMONICZNEGO", pasmo=ZakresPasma(f_min_hz=2000.0, f_max_hz=150000.0)
    )
    with pytest.raises(ValidationError, match="dwiema drogami"):
        wpis(
            wielkosc="U_PASMA_SUPRAHARMONICZNEGO",
            pasmo=ZakresPasma(f_min_hz=2000.0, f_max_hz=150000.0),
            pasmo_ref="pasmo-1",
        )


def test_limit_urzadzenia_adresowany_do_urzadzenia() -> None:
    with pytest.raises(ValidationError, match="limit urządzenia dotyczy urządzenia"):
        wpis("LIMIT_EMISJI_URZADZENIA", podmiot="OSD")


def test_parametr_metody_wartosc_albo_definicja() -> None:
    m = ParametrMetody(
        ident="PST-M",
        nazwa_pl="wykładnik sumowania migotania",
        wartosc=Wielkosc(wartosc=3.0, jednostka="1"),
        podstawa=f.podstawa(rodzaj="NORMA", dokument="IEC/TR 61000-3-7"),
        wersja="1",
    )
    assert m.wartosc is not None
    with pytest.raises(ValidationError, match="dokładnie jedno"):
        ParametrMetody(
            ident="VUF",
            nazwa_pl="współczynnik asymetrii",
            podstawa=f.podstawa(rodzaj="NORMA", status="NIEUSTALONE"),
            wersja="1",
        )
    assert ParametrMetody(
        ident="VUF",
        nazwa_pl="współczynnik asymetrii",
        definicja_latex=r"\mathrm{VUF} = |U_2| / |U_1|",
        podstawa=f.podstawa(rodzaj="NORMA", status="NIEUSTALONE", dokument="IEC 61000-4-30"),
        wersja="1",
    )
