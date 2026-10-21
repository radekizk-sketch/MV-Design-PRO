"""Rejestr wartości roboczych aparatu SN — przypięte deklaracje kontraktu (V12K-351, §3c).

Po co: brak danej karty katalogowej nie blokuje obliczeń — system proponuje wartość roboczą
z jawnym źródłem, a projektant może ją zmienić. Każde mocne zdanie modułu
``network_model/catalog/wartosci_robocze.py`` ma tu test (reguła „deklaracja bez testu =
fałszywa pewność"):

* pierwszeństwo projektant > karta > propozycja — dla KAŻDEJ pozycji REALNEGO katalogu i KAŻDEGO
  parametru (iloczyn: rodzaj aparatu × parametr × pochodzenie);
* propozycja nigdy nie zasłania danej karty i nigdy nie trafia do pozycji katalogu;
* propozycja na propozycji jest zakazana (I_dyn tylko z I_th karty albo projektanta);
* wartość robocza → dana przyjęta ``ESTIMATED`` (nigdy ``DATASHEET``), kompletność rekordu K
  NIEPEŁNA, a para SPEŁNIA + NIEPEŁNY na poziomie W daje BRAK_DOWODU;
* brama wartości projektanta (zakresy, typy, parametr spoza rejestru);
* determinizm rozstrzygnięcia.
"""

from __future__ import annotations

import dataclasses
import json
import math

import pytest
from application.analyses.aparaty_pol import AparatPola, dana_przyjeta, parametry_aparatu
from network_model.catalog import get_default_mv_catalog
from network_model.catalog.types import MVApparatusType
from network_model.catalog.wartosci_robocze import (
    CZAS_WLASNY_PROFIL_S,
    CZAS_ZWARCIA_ZALECANY_S,
    OPISY_PARAMETROW_APARATU_SN,
    PARAMETR_CZAS_WLASNY,
    PARAMETR_I_DYN,
    PARAMETR_I_TH,
    PARAMETR_T_TH,
    PARAMETRY_APARATU_SN,
    WSPOLCZYNNIK_IP_DO_IK_50HZ,
    WartoscProjektanta,
    blad_wartosci_projektanta,
    propozycje_aparatu_sn,
    rozstrzygnij_parametry_aparatu_sn,
)
from werdykt import StatusDanych
from werdykt.proweniencja import FieldQuality

from tests.werdykt import fabryki as f

POZYCJE = sorted(get_default_mv_catalog().list_mv_apparatus_types(), key=lambda p: p.id)
RODZAJE_Z_CZASEM_WLASNYM = {"WYLACZNIK", "REKLOZER"}


def _pole_karty(pozycja: MVApparatusType, parametr: str) -> float | None:
    wartosc = getattr(pozycja, parametr)
    return None if wartosc is None else float(wartosc)


def test_katalog_obejmuje_wszystkie_rodzaje_aparatu() -> None:
    """Iloczyn niżej jest pełny tylko wtedy, gdy katalog niesie każdy rodzaj aparatu SN."""
    assert {p.device_kind for p in POZYCJE} >= {
        "WYLACZNIK",
        "REKLOZER",
        "ROZLACZNIK",
        "ODLACZNIK",
        "UZIEMNIK",
        "ROZLACZNIK_BEZPIECZNIKOWY",
    }


@pytest.mark.parametrize("pozycja", POZYCJE, ids=lambda p: p.id)
def test_karta_wygrywa_z_propozycja_a_propozycja_jest_tylko_dla_braku(
    pozycja: MVApparatusType,
) -> None:
    """Każda pozycja × każdy parametr: dana karty → KATALOG (nigdy robocza); brak danej →
    propozycja albo jawny powód braku; czas własny tylko dla aparatu z komorą gaszeniową."""
    wynik = rozstrzygnij_parametry_aparatu_sn(pozycja)
    assert tuple(wynik) == PARAMETRY_APARATU_SN
    for parametr, w in wynik.items():
        z_karty = _pole_karty(pozycja, parametr)
        if z_karty is not None:
            assert (w.pochodzenie, w.wartosc, w.robocza) == ("KATALOG", z_karty, False)
            assert w.propozycja is None
        elif w.pochodzenie == "PROPOZYCJA":
            assert w.robocza and w.propozycja is not None and w.wartosc == w.propozycja.wartosc
        else:
            assert w.wartosc is None and w.pochodzenie is None and w.powod_braku_pl
    czas = wynik[PARAMETR_CZAS_WLASNY]
    if pozycja.device_kind in RODZAJE_Z_CZASEM_WLASNYM:
        assert czas.wartosc == CZAS_WLASNY_PROFIL_S
        assert czas.propozycja is not None
        oczekiwany = "PROFIL_URZADZENIA" if pozycja.device_kind == "WYLACZNIK" else None
        assert czas.propozycja.rodzaj_zrodla == (oczekiwany or "ZALOZENIE_INZYNIERSKIE")
    else:
        assert czas.wartosc is None
        assert "nie dotyczy" in (czas.powod_braku_pl or "")
    # Propozycja nigdy nie trafia do pozycji katalogu (katalog niesie wyłącznie dane ze źródłem).
    for parametr in PARAMETRY_APARATU_SN:
        assert pozycja.to_dict()[parametr] == getattr(pozycja, parametr)


@pytest.mark.parametrize("pozycja", POZYCJE, ids=lambda p: p.id)
@pytest.mark.parametrize("parametr", PARAMETRY_APARATU_SN)
def test_projektant_wygrywa_z_karta_i_propozycja(pozycja: MVApparatusType, parametr: str) -> None:
    opis = OPISY_PARAMETROW_APARATU_SN[parametr]
    wartosc = round((opis.dopuszczalne_od + opis.dopuszczalne_do) / 3.0, 4)
    projektant = {parametr: WartoscProjektanta(parametr, wartosc, "tabliczka znamionowa")}
    w = rozstrzygnij_parametry_aparatu_sn(pozycja, projektant)[parametr]
    assert (w.pochodzenie, w.wartosc, w.robocza) == ("PROJEKTANT", wartosc, True)
    assert "tabliczka znamionowa" in w.opis_zrodla_pl()


def _wylacznik(**pola: object) -> MVApparatusType:
    baza = MVApparatusType(
        id="sw-test", name="Wyłącznik testowy", device_kind="WYLACZNIK", u_n_kv=15.0, i_n_a=630.0
    )
    return dataclasses.replace(baza, **pola)  # type: ignore[arg-type]


def test_wylacznik_bez_i_th_dostaje_propozycje_z_pradu_wylaczalnego_bez_i_dyn() -> None:
    """I_th z prądu wyłączalnego (założenie inżynierskie), t_th z normy, ale I_dyn NIE
    jest proponowany z propozycji I_th (założenie na założeniu jest zakazane)."""
    wynik = rozstrzygnij_parametry_aparatu_sn(_wylacznik(breaking_capacity_ka=16.0))
    i_th, t_th, i_dyn = wynik[PARAMETR_I_TH], wynik[PARAMETR_T_TH], wynik[PARAMETR_I_DYN]
    assert (i_th.pochodzenie, i_th.wartosc) == ("PROPOZYCJA", 16.0)
    assert i_th.propozycja is not None
    assert i_th.propozycja.rodzaj_zrodla == "ZALOZENIE_INZYNIERSKIE"
    assert (t_th.pochodzenie, t_th.wartosc) == ("PROPOZYCJA", CZAS_ZWARCIA_ZALECANY_S)
    assert t_th.propozycja is not None and t_th.propozycja.rodzaj_zrodla == "NORMA"
    assert i_dyn.wartosc is None and "relacja normowa wymaga" in (i_dyn.powod_braku_pl or "")


@pytest.mark.parametrize(
    ("pola", "projektant_i_th", "oczekiwane_i_dyn", "zrodlo"),
    [
        ({"i_th_ka": 20.0, "i_th_duration_s": 1.0}, None, 50.0, "z karty"),
        ({"breaking_capacity_ka": 16.0}, 12.5, 31.25, "nadanego przez projektanta"),
        ({"i_th_ka": 20.0, "i_th_duration_s": 3.0}, 25.0, 62.5, "nadanego przez projektanta"),
    ],
    ids=["i_th_karty", "i_th_projektanta_bez_karty", "i_th_projektanta_nad_karta"],
)
def test_i_dyn_z_relacji_normowej_tylko_z_i_th_karty_albo_projektanta(
    pola: dict[str, float], projektant_i_th: float | None, oczekiwane_i_dyn: float, zrodlo: str
) -> None:
    projektant = (
        {PARAMETR_I_TH: WartoscProjektanta(PARAMETR_I_TH, projektant_i_th)}
        if projektant_i_th is not None
        else {}
    )
    i_dyn = rozstrzygnij_parametry_aparatu_sn(_wylacznik(**pola), projektant)[PARAMETR_I_DYN]
    assert (i_dyn.pochodzenie, i_dyn.wartosc) == ("PROPOZYCJA", oczekiwane_i_dyn)
    assert i_dyn.propozycja is not None and i_dyn.propozycja.rodzaj_zrodla == "NORMA"
    assert i_dyn.propozycja.odniesienie == "IEC 62271-1:2017 p. 5.7"
    assert oczekiwane_i_dyn == pytest.approx(
        (projektant_i_th or pola["i_th_ka"]) * WSPOLCZYNNIK_IP_DO_IK_50HZ
    )
    assert zrodlo in i_dyn.propozycja.uzasadnienie_pl


def test_aparat_bez_i_th_nie_dostaje_czasu_odniesienia() -> None:
    """Sam czas odniesienia bez prądu krótkotrwałego niczego nie ocenia — brak propozycji."""
    wynik = rozstrzygnij_parametry_aparatu_sn(
        _wylacznik(device_kind="ROZLACZNIK_BEZPIECZNIKOWY", breaking_capacity_ka=31.5)
    )
    assert wynik[PARAMETR_I_TH].wartosc is None
    assert wynik[PARAMETR_T_TH].wartosc is None
    assert wynik[PARAMETR_T_TH].powod_braku_pl


def test_propozycje_pozycji_to_tylko_braki_karty() -> None:
    pozycja = get_default_mv_catalog().get_mv_apparatus_type("sw-cb-abb-vd4-17kv-630a")
    assert pozycja is not None
    assert [p.parametr for p in propozycje_aparatu_sn(pozycja)] == [
        PARAMETR_CZAS_WLASNY,
        PARAMETR_I_DYN,
    ]


@pytest.mark.parametrize(
    ("parametr", "wartosc", "odmowa"),
    [
        (PARAMETR_CZAS_WLASNY, 0.005, False),
        (PARAMETR_CZAS_WLASNY, 0.3, False),
        (PARAMETR_CZAS_WLASNY, 0.0049, True),
        (PARAMETR_CZAS_WLASNY, 0.31, True),
        (PARAMETR_I_TH, 0.1, False),
        (PARAMETR_I_TH, 100, False),
        (PARAMETR_I_TH, 100.5, True),
        (PARAMETR_T_TH, 5.0, False),
        (PARAMETR_T_TH, 0.05, True),
        (PARAMETR_I_DYN, 250.0, False),
        (PARAMETR_I_DYN, -1.0, True),
        (PARAMETR_I_TH, math.nan, True),
        (PARAMETR_I_TH, math.inf, True),
        (PARAMETR_I_TH, True, True),
        (PARAMETR_I_TH, "20", True),
        (PARAMETR_I_TH, None, True),
        ("u_m_kv", 17.5, True),
        (None, 17.5, True),
    ],
)
def test_brama_wartosci_projektanta(parametr: object, wartosc: object, odmowa: bool) -> None:
    blad = blad_wartosci_projektanta(parametr, wartosc)
    assert (blad is not None) is odmowa, blad


def test_rozstrzygniecie_jest_deterministyczne_i_serializowalne() -> None:
    projektant = {PARAMETR_CZAS_WLASNY: WartoscProjektanta(PARAMETR_CZAS_WLASNY, 0.07, "pomiar")}
    for pozycja in POZYCJE:
        pierwsze = {
            k: v.to_dict()
            for k, v in rozstrzygnij_parametry_aparatu_sn(pozycja, projektant).items()
        }
        drugie = {
            k: v.to_dict()
            for k, v in rozstrzygnij_parametry_aparatu_sn(pozycja, projektant).items()
        }
        assert json.dumps(pierwsze, sort_keys=True) == json.dumps(drugie, sort_keys=True)


# ---------------------------------------------------------------------------
# Wartość robocza w werdykcie (kontrakt werdyktu §3c pkt 4)
# ---------------------------------------------------------------------------


def _aparat(*wartosci: WartoscProjektanta) -> AparatPola:
    return AparatPola(
        aparat_ref="wyl-1",
        aparat_nazwa="Wyłącznik pola 1",
        catalog_ref="sw-cb-abb-vd4-17kv-630a",
        wartosci_projektanta=tuple(wartosci),
    )


@pytest.mark.parametrize(
    "aparat",
    [
        _aparat(),
        _aparat(WartoscProjektanta(PARAMETR_CZAS_WLASNY, 0.07, "pomiar odbiorczy")),
        _aparat(WartoscProjektanta(PARAMETR_I_TH, 16.0), WartoscProjektanta(PARAMETR_T_TH, 3.0)),
    ],
    ids=["propozycje", "projektant_czas", "projektant_znamiona"],
)
def test_wartosc_robocza_jest_dana_przyjeta_estimated_nigdy_datasheet(aparat: AparatPola) -> None:
    """Każda wartość robocza (propozycja i projektant) tłumaczy się na daną przyjętą
    ``ESTIMATED`` ze źródłem i wpływem; dana karty nie jest daną przyjętą (odmowa)."""
    _, parametry = parametry_aparatu(aparat)
    robocze = [w for w in parametry.values() if w.robocza]
    katalogowe = [w for w in parametry.values() if w.pochodzenie == "KATALOG"]
    assert robocze
    # Pierwszy przypadek (same propozycje) ma dane karty I_th/t_th — odmowa jest ćwiczona.
    assert katalogowe or aparat.wartosci_projektanta
    for w in robocze:
        dana = dana_przyjeta(w.to_dict(), aparat_pl=aparat.aparat_nazwa)
        assert dana.jakosc is FieldQuality.ESTIMATED
        assert dana.jakosc is not FieldQuality.DATASHEET
        assert dana.wartosc.wartosc == w.wartosc
        assert "Wpływ:" in dana.powod_pl
    for w in katalogowe:
        with pytest.raises(AssertionError, match="nie jest wartością roboczą"):
            dana_przyjeta(w.to_dict(), aparat_pl=aparat.aparat_nazwa)


def test_spelnia_na_wartosci_roboczej_daje_brak_dowodu_na_poziomie_wymagania() -> None:
    """Para SPEŁNIA + NIEPEŁNY (dana przyjęta) nie awansuje na SPEŁNIA wymagania: poziom W
    mówi BRAK_DOWODU. Kontrola parami: ta sama ocena na danych zwalidowanych → SPEŁNIA."""
    _, parametry = parametry_aparatu(_aparat())
    dana = dana_przyjeta(parametry[PARAMETR_CZAS_WLASNY].to_dict(), aparat_pl="Wyłącznik pola 1")
    wzor = f.dowod_obliczenia()
    na_roboczej = f.ocena(
        "NIE_WIECEJ",
        metoda_wyniku="OBLICZENIE",
        dowod_oceny=f.dowod(
            metoda="OBLICZENIE",
            poziom=wzor.poziom,
            twierdzenie=wzor.rodzaj_twierdzenia,
            dane=StatusDanych(stan="UNVALIDATED_INPUT", dane_przyjete=(dana,)),
        ),
    )
    na_zwalidowanych = f.ocena(
        "NIE_WIECEJ", metoda_wyniku="OBLICZENIE", dowod_oceny=f.dowod_obliczenia()
    )
    assert na_roboczej.status_maszynowy == "SPELNIA"
    assert na_roboczej.kompletnosc_dowodu == "NIEPELNY"
    assert any("Dana przyjęta" in p for p in na_roboczej.powody_niepelnosci)
    assert na_zwalidowanych.status_maszynowy == "SPELNIA"
    assert na_zwalidowanych.kompletnosc_dowodu == "PELNY"

    w_robocze = f.wymaganie([na_roboczej], sposob="OBLICZENIE")
    w_zwalidowane = f.wymaganie([na_zwalidowanych], sposob="OBLICZENIE")
    assert w_robocze.status_maszynowy == "BRAK_DOWODU"
    assert w_zwalidowane.status_maszynowy == "SPELNIA"


# =============================================================================
# Tolerancja napięcia sieci nN (karta TOLERANCJA-NN-WARTOSC-ROBOCZA): pierwszeństwo
# deklaracji nad wartością roboczą — JEDNO miejsce rozstrzygnięcia, iloczyn deklaracji
# elementów zasilających sieci × (klasa, pochodzenie, powód propozycji).
# =============================================================================

_ROZSTRZYGNIECIA_NN = [
    ((), ("PLUS_10", True, "BRAK_ZASILAJACEGO")),
    ((None,), ("PLUS_10", True, "BRAK_DEKLARACJI")),
    ((None, None), ("PLUS_10", True, "BRAK_DEKLARACJI")),
    (("PLUS_6",), ("PLUS_6", False, None)),
    (("PLUS_10",), ("PLUS_10", False, None)),
    (("PLUS_6", None), ("PLUS_6", False, None)),
    ((None, "PLUS_10"), ("PLUS_10", False, None)),
    (("PLUS_6", "PLUS_6"), ("PLUS_6", False, None)),
    (("PLUS_6", "PLUS_10"), ("PLUS_10", True, "DEKLARACJE_SPRZECZNE")),
    (("PLUS_10", None, "PLUS_6"), ("PLUS_10", True, "DEKLARACJE_SPRZECZNE")),
]


@pytest.mark.parametrize(("deklaracje", "oczekiwane"), _ROZSTRZYGNIECIA_NN)
def test_rozstrzygniecie_tolerancji_nn_deklaracja_przed_wartoscia_robocza(
    deklaracje: tuple, oczekiwane: tuple
) -> None:
    from network_model.catalog.wartosci_robocze import rozstrzygnij_tolerancje_nn

    wynik = rozstrzygnij_tolerancje_nn(deklaracje)
    assert (wynik.wartosc, wynik.robocza, wynik.powod_propozycji) == oczekiwane
    slownik = wynik.to_dict()
    assert slownik["parametr"] == "lv_voltage_tolerance"
    assert slownik["wartosc_robocza"] is wynik.robocza
    assert (slownik["propozycja"] is not None) is wynik.robocza
    opis = wynik.opis_zrodla_pl()
    if wynik.robocza:
        assert opis.startswith("wartość robocza tolerancji +10 % (założenie inżynierskie")
        assert "IEC 60909-0:2016 tabela 1" in opis
        assert "Wpływ:" in opis
    else:
        assert "zadeklarowana przez projektanta" in opis


def test_rozstrzygniecie_tolerancji_spoza_slownika_to_blad_programu() -> None:
    from network_model.catalog.wartosci_robocze import rozstrzygnij_tolerancje_nn
    from network_model.odmowa_danych import OdmowaDanychError

    with pytest.raises(ValueError) as blad:
        rozstrzygnij_tolerancje_nn(("PLUS_7",))  # type: ignore[arg-type]
    assert not isinstance(blad.value, OdmowaDanychError)


@pytest.mark.parametrize(
    ("napiecie_kv", "deklaracja", "oczekiwane"),
    [
        (0.4, None, ("PLUS_10", True)),
        (0.4, "PLUS_6", ("PLUS_6", False)),
        (0.4, "PLUS_10", ("PLUS_10", False)),
        (0.23, None, ("PLUS_10", True)),
        (15.0, None, None),
        (15.0, "PLUS_6", None),
        (110.0, None, None),
    ],
)
def test_tolerancja_napiecia_zadania_tylko_w_pasmie_nn(
    napiecie_kv: float, deklaracja: str | None, oczekiwane: tuple | None
) -> None:
    """Żądanie bez modelu (podgląd źródła, pakiet dowodowy): ta sama reguła pierwszeństwa;
    poza pasmem nN tabela 1 ma jeden wiersz — brak rozstrzygnięcia (``None``)."""
    from network_model.catalog.wartosci_robocze import tolerancja_nn_napiecia

    wynik = tolerancja_nn_napiecia(napiecie_kv, deklaracja)  # type: ignore[arg-type]
    assert (None if wynik is None else (wynik.wartosc, wynik.robocza)) == oczekiwane


def test_propozycja_tolerancji_nn_wplyw_liczbowo_z_tabeli_1() -> None:
    """Zdanie wpływu propozycji podaje różnicę prądów między klasami z tabeli 1 IEC 60909-0:
    I_max(+6 %)/I_max(+10 %) = 1,05/1,10 → −4,5 %; I_min(+6 %)/I_min(+10 %) = 0,95/0,90 →
    +5,6 % (ta sama impedancja, prąd proporcjonalny do c)."""
    from network_model.catalog.wartosci_robocze import PROPOZYCJA_TOLERANCJI_NN

    assert PROPOZYCJA_TOLERANCJI_NN.wartosc == "PLUS_10"
    assert PROPOZYCJA_TOLERANCJI_NN.rodzaj_zrodla == "ZALOZENIE_INZYNIERSKIE"
    assert f"{abs(1.05 / 1.10 - 1.0) * 100.0:.1f}" == "4.5"
    assert f"{abs(0.95 / 0.90 - 1.0) * 100.0:.1f}" == "5.6"
    assert "mniejszy o 4,5 %" in PROPOZYCJA_TOLERANCJI_NN.wplyw_pl
    assert "większy o 5,6 %" in PROPOZYCJA_TOLERANCJI_NN.wplyw_pl
    assert "c_max 1,10, c_min 0,90" in PROPOZYCJA_TOLERANCJI_NN.odniesienie
