"""Karta W10-2a (OD-16): cennik wersjonowany i funkcje kosztowe — testy jako iloczyn cech.

Cechy, w których defekt mógłby się schować:
  * stan ceny typu: {z ceną CAPEX i OPEX, bez ceny, OPEX bez CAPEX, CAPEX bez OPEX,
    cena w innej jednostce, pozycja bez typu katalogowego, brak jakiegokolwiek cennika};
  * funkcja kosztowa: {lista materiałowa, koszt cyklu życia, porównanie wariantów};
  * ścieżka: {gotowość (rekord), wykonanie (wynik albo odmowa)} — predykaty parami.
Oczekiwanie jest wyprowadzone z tabeli wymagań zakresu (BOM: CAPEX; LCC i porównanie po LCC:
CAPEX + OPEX), nie z implementacji.
"""

from __future__ import annotations

import hashlib
import math
from collections.abc import Callable
from dataclasses import fields
from typing import Any

import pytest
from application.koszty.wycena import (
    KOD_BRAK_CENNIKA,
    OdmowaBrakuCennika,
    ParametryLcc,
    PozycjaDoWyceny,
    WariantDoWyceny,
    gotowosc_kosztow,
    porownaj_warianty,
    wycen_lcc,
    wycen_liste_materialowa,
)
from catalog.cenniki import (
    BladCennika,
    Cennik,
    aktualny_cennik,
    cennik_z_danych,
    identyfikatory_typow,
)
from network_model.catalog.repository import get_default_mv_catalog
from network_model.odmowa_danych import OdmowaDanychError, OdmowaNazwana

TYP_KABLA = "cable-base-epr-al-1c-120"
TYP_TR = "bench_iec60909example_tr110_33"
TYP_WYLACZNIKA = "sw-cb-abb-vd4-12kv-1250a"
TYP_FALOWNIKA = "bess_pcs_abb_500"

ZRODLO_WSKAZANE = {"status": "WSKAZANE", "dokument": "oferta 12/2026", "data": "2026-09-01"}
ZRODLO_NIEUSTALONE = {"status": "NIEUSTALONE", "uwagi_pl": "cena z rozmowy telefonicznej"}


def _cennik(
    pozycje: list[dict[str, Any]], *, cena_energii: float | None = 400.0, wersja: str = "2026-09"
) -> Cennik:
    return cennik_z_danych(
        {
            "wersja": wersja,
            "waluta": "PLN",
            "data_cen": f"{wersja}-15",
            "opis_pl": "cennik testowy",
            "energia_strat": {
                "cena_pln_mwh": cena_energii,
                "zrodlo": (
                    ZRODLO_WSKAZANE
                    if cena_energii is not None
                    else {"status": "NIEUSTALONE", "uwagi_pl": "brak ceny energii"}
                ),
            },
            "pozycje": pozycje,
        },
        nazwa_pliku=f"cennik_{wersja}.yaml",
    )


def _cena(
    type_id: str,
    *,
    capex: float | None,
    opex: float | None,
    jednostka: str = "szt.",
    zrodlo: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "type_id": type_id,
        "jednostka": jednostka,
        "capex_pln": capex,
        "opex_pln_rok": opex,
        "zrodlo": zrodlo or ZRODLO_WSKAZANE,
    }


POZ_TR = PozycjaDoWyceny("Transformator blokowy", TYP_TR, 1.0, "szt.")
POZ_KABEL = PozycjaDoWyceny("Kabel SN", TYP_KABLA, 2.5, "km")
POZ_WYL = PozycjaDoWyceny("Wyłącznik pola", TYP_WYLACZNIKA, 2.0, "szt.")
PARAMETRY = ParametryLcc(stopa_dyskontowa=0.05, horyzont_lat=2, straty_roczne_mwh=10.0)
WSP = 1 / 1.05 + 1 / 1.05**2

#: Stan ceny transformatora (pozycja badana) — pozostałe pozycje wycenione w pełni.
STANY: dict[str, dict[str, Any] | None] = {
    "z_cena": _cena(TYP_TR, capex=100_000.0, opex=2_000.0),
    "bez_ceny": None,
    "opex_bez_capex": _cena(TYP_TR, capex=None, opex=2_000.0),
    "capex_bez_opex": _cena(TYP_TR, capex=100_000.0, opex=None),
    "inna_jednostka": _cena(TYP_TR, capex=100_000.0, opex=2_000.0, jednostka="km"),
}
#: Oczekiwanie: czy zakres wymagający CAPEX / CAPEX+OPEX jest wyceniony przy danym stanie.
WYCENIONE_BOM = {"z_cena": True, "capex_bez_opex": True}
WYCENIONE_LCC = {"z_cena": True}


def _cennik_stanu(stan: str) -> Cennik:
    pozycje = [
        _cena(TYP_KABLA, capex=300_000.0, opex=1_000.0, jednostka="km"),
        _cena(TYP_WYLACZNIKA, capex=40_000.0, opex=500.0),
    ]
    cena_tr = STANY[stan]
    if cena_tr is not None:
        pozycje.append(cena_tr)
    return _cennik(pozycje)


def _bom(cennik: Cennik) -> object:
    return wycen_liste_materialowa([POZ_TR, POZ_KABEL, POZ_WYL], cennik)


def _lcc(cennik: Cennik) -> object:
    return wycen_lcc([POZ_TR, POZ_KABEL, POZ_WYL], cennik, PARAMETRY)


def _warianty_capex(cennik: Cennik) -> object:
    return porownaj_warianty(
        [
            WariantDoWyceny("Wariant A", (POZ_TR, POZ_KABEL)),
            WariantDoWyceny("Wariant B", (POZ_WYL,)),
        ],
        cennik,
    )


def _warianty_lcc(cennik: Cennik) -> object:
    return porownaj_warianty(
        [
            WariantDoWyceny("Wariant A", (POZ_TR, POZ_KABEL)),
            WariantDoWyceny("Wariant B", (POZ_WYL,)),
        ],
        cennik,
        PARAMETRY,
    )


FUNKCJE: dict[str, tuple[Callable[[Cennik], object], dict[str, bool], str]] = {
    "bom": (_bom, WYCENIONE_BOM, "BOM"),
    "lcc": (_lcc, WYCENIONE_LCC, "LCC"),
    "warianty_capex": (_warianty_capex, WYCENIONE_BOM, "BOM"),
    "warianty_lcc": (_warianty_lcc, WYCENIONE_LCC, "LCC"),
}


@pytest.mark.parametrize("stan", sorted(STANY))
@pytest.mark.parametrize("funkcja", sorted(FUNKCJE))
def test_iloczyn_stan_ceny_x_funkcja_kosztowa(stan: str, funkcja: str) -> None:
    wykonaj, wycenione, zakres = FUNKCJE[funkcja]
    cennik = _cennik_stanu(stan)
    gotowosc = gotowosc_kosztow(
        [POZ_TR, POZ_KABEL, POZ_WYL], cennik, zakres, straty_roczne_mwh=10.0  # type: ignore[arg-type]
    )
    if wycenione.get(stan, False):
        assert gotowosc.status == "GOTOWE"
        wynik = wykonaj(cennik)
        assert wynik.to_dict()["status"] == "WYCENIONE"  # type: ignore[attr-defined]
        return
    # Predykaty parami: gotowość nazywa brak ⇔ wykonanie odmawia, tą samą listą typów.
    assert gotowosc.status == "BRAK_CENNIKA"
    assert gotowosc.kod == KOD_BRAK_CENNIKA
    with pytest.raises(OdmowaBrakuCennika) as odmowa:
        wykonaj(cennik)
    assert odmowa.value.kod == KOD_BRAK_CENNIKA
    assert odmowa.value.dane["type_ids"] == [TYP_TR]
    assert gotowosc.to_dict()["type_ids"] == [TYP_TR]
    assert KOD_BRAK_CENNIKA not in str(odmowa.value)
    assert TYP_TR not in str(odmowa.value), "identyfikator maszynowy w zdaniu dla projektanta"
    assert "Transformator blokowy" in str(odmowa.value)
    # Nigdy ciche zero ani suma częściowa: odmowa jest wyjątkiem, nie wynikiem.
    assert isinstance(odmowa.value, OdmowaNazwana)


@pytest.mark.parametrize("funkcja", sorted(FUNKCJE))
def test_brak_jakiegokolwiek_cennika_odmawia_wszystkimi_typami(funkcja: str) -> None:
    wykonaj, _, _ = FUNKCJE[funkcja]
    with pytest.raises(OdmowaBrakuCennika) as odmowa:
        wykonaj(None)  # type: ignore[arg-type]
    assert odmowa.value.dane["type_ids"] == sorted([TYP_TR, TYP_KABLA, TYP_WYLACZNIKA])
    assert odmowa.value.dane["wersja_cennika"] is None
    assert "nie ma żadnego cennika" in str(odmowa.value)


@pytest.mark.parametrize("funkcja", sorted(FUNKCJE))
def test_pozycja_bez_typu_katalogowego_odmawia(funkcja: str) -> None:
    wykonaj, _, zakres = FUNKCJE[funkcja]
    bez_typu = PozycjaDoWyceny("Szyna nN producenta", None, 1.0, "szt.")
    cennik = _cennik_stanu("z_cena")
    gotowosc = gotowosc_kosztow([POZ_TR, bez_typu], cennik, zakres)  # type: ignore[arg-type]
    assert gotowosc.status == "BRAK_CENNIKA"
    assert gotowosc.to_dict()["pozycje_bez_typu"] == ["Szyna nN producenta"]
    with pytest.raises(OdmowaBrakuCennika):
        if funkcja.startswith("warianty"):
            porownaj_warianty(
                [WariantDoWyceny("A", (POZ_TR,)), WariantDoWyceny("B", (bez_typu,))],
                cennik,
                PARAMETRY if zakres == "LCC" else None,
            )
        elif funkcja == "bom":
            wycen_liste_materialowa([POZ_TR, bez_typu], cennik)
        else:
            wycen_lcc([POZ_TR, bez_typu], cennik, PARAMETRY)


def test_wartosci_bom_lcc_i_warianty() -> None:
    cennik = _cennik_stanu("z_cena")
    bom = wycen_liste_materialowa([POZ_TR, POZ_KABEL, POZ_WYL], cennik)
    capex = 100_000.0 + 2.5 * 300_000.0 + 2 * 40_000.0
    assert bom.suma_capex == pytest.approx(capex)
    assert [p.koszt for p in bom.pozycje] == pytest.approx([100_000.0, 750_000.0, 80_000.0])

    lcc = wycen_lcc([POZ_TR, POZ_KABEL, POZ_WYL], cennik, PARAMETRY)
    opex = 2_000.0 + 2.5 * 1_000.0 + 2 * 500.0
    assert lcc.opex_roczny == pytest.approx(opex)
    assert lcc.koszt_strat_roczny == pytest.approx(10.0 * 400.0)
    assert lcc.wspolczynnik_wartosci_biezacej == pytest.approx(WSP)
    assert lcc.lcc == pytest.approx(capex + (opex + 4_000.0) * WSP)

    porownanie = porownaj_warianty(
        [
            WariantDoWyceny("Wariant A", (POZ_TR, POZ_KABEL)),
            WariantDoWyceny("Wariant B", (POZ_WYL,)),
        ],
        cennik,
    )
    assert [w.nazwa_pl for w in porownanie.wiersze] == ["Wariant B", "Wariant A"]
    assert porownanie.wiersze[1].roznica_do_najtanszego == pytest.approx(850_000.0 - 80_000.0)
    assert porownanie.to_dict()["kryterium"] == "CAPEX"


def test_lcc_straty_zero_nie_wymaga_ceny_energii_a_niezerowe_wymagaja() -> None:
    cennik = _cennik([_cena(TYP_TR, capex=1.0, opex=1.0)], cena_energii=None)
    bez_strat = ParametryLcc(stopa_dyskontowa=0.0, horyzont_lat=3, straty_roczne_mwh=0.0)
    wynik = wycen_lcc([POZ_TR], cennik, bez_strat)
    assert wynik.lcc == pytest.approx(1.0 + 1.0 * 3)
    with pytest.raises(OdmowaBrakuCennika) as odmowa:
        wycen_lcc([POZ_TR], cennik, PARAMETRY)
    assert odmowa.value.dane["brak_ceny_energii"] is True
    assert odmowa.value.dane["type_ids"] == []
    assert gotowosc_kosztow([POZ_TR], cennik, "LCC", straty_roczne_mwh=10.0).status == (
        "BRAK_CENNIKA"
    )


def test_remis_wariantow_rozstrzyga_nazwa_deterministycznie() -> None:
    cennik = _cennik_stanu("z_cena")
    wynik = porownaj_warianty(
        [WariantDoWyceny("Zeta", (POZ_WYL,)), WariantDoWyceny("Alfa", (POZ_WYL,))], cennik
    )
    assert [w.nazwa_pl for w in wynik.wiersze] == ["Alfa", "Zeta"]


@pytest.mark.parametrize(
    "warianty",
    [
        [WariantDoWyceny("Jedyny", (POZ_WYL,))],
        [WariantDoWyceny("A", (POZ_WYL,)), WariantDoWyceny("A", (POZ_TR,))],
    ],
)
def test_porownanie_odmawia_niepelnego_zestawu(warianty: list[WariantDoWyceny]) -> None:
    with pytest.raises(OdmowaDanychError):
        porownaj_warianty(warianty, _cennik_stanu("z_cena"))


@pytest.mark.parametrize(
    "parametry",
    [
        {"stopa_dyskontowa": -0.01, "horyzont_lat": 10, "straty_roczne_mwh": 0.0},
        {"stopa_dyskontowa": math.inf, "horyzont_lat": 10, "straty_roczne_mwh": 0.0},
        {"stopa_dyskontowa": 0.05, "horyzont_lat": 0, "straty_roczne_mwh": 0.0},
        {"stopa_dyskontowa": 0.05, "horyzont_lat": 2.5, "straty_roczne_mwh": 0.0},
        {"stopa_dyskontowa": 0.05, "horyzont_lat": 10, "straty_roczne_mwh": -1.0},
    ],
)
def test_parametry_lcc_bez_domyslek_i_bez_wartosci_ujemnych(parametry: dict[str, Any]) -> None:
    with pytest.raises(OdmowaDanychError):
        ParametryLcc(**parametry)


# ---------------------------------------------------------------------------
# Stan źródła: obniżenie, przemilczenie, proweniencja wyniku
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("zrodlo", "brak"),
    [
        ({"status": "WSKAZANE", "dokument": "oferta 1", "data": None}, "daty"),
        ({"status": "ZWERYFIKOWANE", "dokument": None, "data": "2026-09-01"}, "dokumentu"),
        ({"status": "WSKAZANE", "dokument": None, "data": None}, "dokumentu i daty"),
    ],
)
def test_wartosc_bez_daty_lub_zrodla_obnizona_do_nieustalone(
    zrodlo: dict[str, Any], brak: str
) -> None:
    cennik = _cennik([_cena(TYP_TR, capex=1.0, opex=None, zrodlo=zrodlo)])
    pozycja = cennik.pozycja(TYP_TR)
    assert pozycja is not None
    assert pozycja.zrodlo.status == "NIEUSTALONE"
    assert pozycja.zrodlo.uwagi_pl is not None and brak in pozycja.zrodlo.uwagi_pl


def test_nieustalone_bez_uwag_odrzucone() -> None:
    with pytest.raises(BladCennika):
        _cennik([_cena(TYP_TR, capex=1.0, opex=None, zrodlo={"status": "NIEUSTALONE"})])


@pytest.mark.parametrize(
    "pozycja",
    [
        _cena(TYP_TR, capex=None, opex=None),
        _cena(TYP_TR, capex=-1.0, opex=None),
        _cena(TYP_TR, capex="sto", opex=None),  # type: ignore[arg-type]
        _cena("typ-spoza-katalogu", capex=1.0, opex=None),
        {**_cena(TYP_TR, capex=1.0, opex=None), "zrodlo": None},
        {**_cena(TYP_TR, capex=1.0, opex=None), "zrodlo": {**ZRODLO_WSKAZANE, "status": "PEWNE"}},
        {
            **_cena(TYP_TR, capex=1.0, opex=None),
            "zrodlo": {**ZRODLO_WSKAZANE, "data": "2026-10-02"},
        },
    ],
)
def test_strażnik_odrzuca_pozycje_naruszajace_kontrakt(pozycja: dict[str, Any]) -> None:
    with pytest.raises(BladCennika):
        _cennik([pozycja])


def test_powtorzony_typ_odrzucony() -> None:
    with pytest.raises(BladCennika):
        _cennik([_cena(TYP_TR, capex=1.0, opex=None), _cena(TYP_TR, capex=2.0, opex=None)])


def test_proweniencja_niesie_najslabszy_stan_i_nazwy_pozycji_nieustalonych() -> None:
    cennik = _cennik(
        [
            _cena(TYP_TR, capex=1.0, opex=1.0, zrodlo=ZRODLO_NIEUSTALONE),
            _cena(TYP_WYLACZNIKA, capex=1.0, opex=1.0),
        ]
    )
    wynik = wycen_liste_materialowa([POZ_TR, POZ_WYL], cennik).to_dict()
    assert wynik["stan_zrodla"] == "NIEUSTALONE"
    assert wynik["pozycje_nieustalone"] == ["Transformator blokowy"]
    assert wynik["wersja_cennika"] == "2026-09"
    assert wynik["hash_cennika"] == cennik.hash_cennika
    pelne = wycen_liste_materialowa([POZ_WYL], cennik).to_dict()
    assert pelne["stan_zrodla"] == "WSKAZANE"
    assert pelne["pozycje_nieustalone"] == []


# ---------------------------------------------------------------------------
# Hash cennika stabilny; katalog i jego hash niezmienione
# ---------------------------------------------------------------------------

#: Hash szablonu cennika 2026-09 w repozytorium (zmiana pliku = nowa wersja, nie edycja).
HASH_SZABLONU_2026_09 = "2cdb2c7100b7a4f4c6ebc380e7a50ae6694495403eb831ee358ba9359aee718e"


def test_hash_cennika_repozytorium_przypiety() -> None:
    cennik = aktualny_cennik()
    assert cennik is not None
    assert cennik.wersja == "2026-09"
    assert cennik.pozycje == ()
    assert cennik.hash_cennika == HASH_SZABLONU_2026_09


def test_hash_cennika_niezalezny_od_kolejnosci_pozycji() -> None:
    a = _cena(TYP_TR, capex=1.0, opex=None)
    b = _cena(TYP_WYLACZNIKA, capex=2.0, opex=None)
    assert _cennik([a, b]).hash_cennika == _cennik([b, a]).hash_cennika
    assert _cennik([a]).hash_cennika != _cennik([a, b]).hash_cennika


TOKENY_CENY = frozenset(
    {"cena", "ceny", "cennik", "price", "cost", "koszt", "capex", "opex", "pln"}
)


def _hash_katalogu() -> str:
    katalog = get_default_mv_catalog()
    kanon = repr(
        sorted(
            (pole.name, sorted((k, repr(v)) for k, v in getattr(katalog, pole.name).items()))
            for pole in fields(katalog)
        )
    )
    return hashlib.sha256(kanon.encode("utf-8")).hexdigest()


def test_katalog_niezmieniony_i_bez_pol_ceny() -> None:
    przed = _hash_katalogu()
    cennik = _cennik_stanu("z_cena")
    wycen_lcc([POZ_TR, POZ_KABEL, POZ_WYL], cennik, PARAMETRY)
    assert _hash_katalogu() == przed
    # Cena nie jest polem typu niemutowalnego (OD-16: osobny cennik po type_id).
    for type_id in (TYP_TR, TYP_KABLA, TYP_WYLACZNIKA, TYP_FALOWNIKA):
        assert type_id in identyfikatory_typow()
        typ = next(
            slownik[type_id]
            for pole in fields(get_default_mv_catalog())
            if isinstance(slownik := getattr(get_default_mv_catalog(), pole.name), dict)
            and type_id in slownik
        )
        nazwy_pol = {pole.name for pole in fields(typ)}
        tokeny = {token for nazwa in nazwy_pol for token in nazwa.split("_")}
        assert not tokeny & TOKENY_CENY, nazwy_pol


def test_zdanie_odmowy_niesie_nazwe_typu_z_modelu_nie_identyfikator() -> None:
    pozycja = PozycjaDoWyceny(
        "Transformator blokowy", TYP_TR, 1.0, "szt.", typ_nazwa_pl="TR 110/33 kV wzorcowy"
    )
    with pytest.raises(OdmowaBrakuCennika) as odmowa:
        wycen_liste_materialowa([pozycja], None)
    assert "Transformator blokowy (typ „TR 110/33 kV wzorcowy”)" in str(odmowa.value)
    assert TYP_TR not in str(odmowa.value)
    assert odmowa.value.dane["type_ids"] == [TYP_TR]
