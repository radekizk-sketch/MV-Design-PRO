"""Wiersze rodzin zabezpieczeń ziemnozwarciowych: k_b, k_c, k_c przy U₀ = 50 %, R_F,max,
algorytm 67N i wykres wskazowy, U_E ≠ U_T (karta EKRANY-EAZ-ZIEMNOZWARCIOWE).

ILOCZYN CECH:
* sposób pracy punktu neutralnego {izolowany, skompensowany, skompensowany z AWSC, rezystor}
  × rodzina {zerowoprądowe 51N, kierunkowe 67N, zerowonapięciowe 59N (odmowa)} — wiersze sceny
  zbudowanej operacjami projektanta;
* algorytm 67N: położenie wskazu {wewnątrz, na granicy, poza sektorem} × moduł {poniżej, powyżej
  progu} × tryb {rzut, sektor} × kierunek {do linii, do szyn} × U₀ {poniżej, powyżej U₀>} —
  parytet werdyktu i położenia na wykresie z danych wykresu;
* rezystancja przejścia: R_F,max odwzorowane solverem z R_F = R_F,max daje wielkość = próg.

Ręczne rachunki w komentarzach testów; liczby oczekiwane wyprowadzone z wartości wiersza
(parytet wzoru), nie przepisane z wyniku.
"""

from __future__ import annotations

import cmath
import json
import math
from dataclasses import replace
from functools import cache
from typing import Any

import pytest
from application.analyses.protection.ocena_ziemnozwarciowa import (
    FunkcjaZiemnozwarciowa,
    _wskaz,
    ocen_zabezpieczenia_ziemnozwarciowe,
    rusza,
    warunki_67n,
    wykres_wskazowy_67n,
)
from application.analyses.protection.rodziny_eaz import (
    RODZINA_KODU,
    RODZINY_EAZ,
    wymaganie_k_b,
    wymaganie_k_c,
    wymaganie_k_c_opor,
)
from enm.mapping import map_enm_to_network_graph
from enm.models import EnergyNetworkModel
from network_model.catalog.funkcje_eaz import FUNKCJE_EAZ
from network_model.solvers.doziemienie_sn import (
    STAN_PRZED,
    WielkosciPola,
    WynikPunktuDoziemienia,
    mnoznik_rezystancji_przejscia,
    oblicz_doziemienie,
    rezystancja_przejscia_dla_mnoznika,
)

from tests.reference_networks.scena_doziemienia import (
    SPOSOBY_PRACY,
    scena_z_nastawami,
    ustaw_uziom_stacji,
)


@cache
def _enm(sposob: str) -> EnergyNetworkModel:
    return EnergyNetworkModel.model_validate(
        ustaw_uziom_stacji(scena_z_nastawami(sposob), rezystancja_ohm=0.5, wspolczynnik_r=None)
    )


@cache
def _wynik(sposob: str) -> dict[str, Any]:
    enm = _enm(sposob)
    return ocen_zabezpieczenia_ziemnozwarciowe(
        enm, map_enm_to_network_graph(enm), odniesienie="test"
    ).to_dict()


# --- rejestr rodzin ---------------------------------------------------------------------------


def test_kazda_funkcja_ziemnozwarciowa_ma_rodzine_i_unikalne_kolumny():
    oceniane = {k for k, f in FUNKCJE_EAZ.items() if f.ocena == "ZIEMNOZWARCIOWA"}
    assert oceniane == set(RODZINA_KODU)
    for rodzina in RODZINY_EAZ.values():
        klucze = [k.klucz for k in rodzina.kolumny]
        assert len(klucze) == len(set(klucze))
        # Nagłówek z jednostką albo bezwymiarowy współczynnik — nigdy kolumna bez nazwy.
        assert all(k.naglowek_pl.strip() for k in rodzina.kolumny)


@pytest.mark.parametrize("sposob", SPOSOBY_PRACY)
def test_wiersz_niesie_wylacznie_kolumny_swojej_rodziny(sposob: str):
    wynik = _wynik(sposob)
    kolumny = {r["id"]: {k["klucz"] for k in r["kolumny"]} for r in wynik["rodziny"]}
    assert wynik["wiersze"], "scena ma funkcje ziemnozwarciowe"
    for w in wynik["wiersze"]:
        assert set(w["wartosci"]) <= kolumny[w["rodzina"]], (w["kod"], set(w["wartosci"]))
        assert w["rodzina"] == RODZINA_KODU[w["kod"]]
        assert w["grupa"] == 1
        assert w["pole_pl"]


@pytest.mark.parametrize("sposob", SPOSOBY_PRACY)
def test_k_b_k_c_z_wartosci_wiersza(sposob: str):
    """k_b = I0>/3I0,wł; k_c = 3I0,dz/I0>; k_c(U0 = 50 %) ≤ k_c (mnożnik 50 %/U0 < 1)."""
    for w in _wynik(sposob)["wiersze"]:
        v = w["wartosci"]
        if w["rodzina"] == "ZEROWOPRADOWE":
            assert v["k_b"]["wartosc"] == pytest.approx(v["prog"]["wartosc"] / v["wl"]["wartosc"])
            assert v["k_c"]["wartosc"] == pytest.approx(v["dz"]["wartosc"] / v["prog"]["wartosc"])
            assert v["k_c_opor"]["wartosc"] < v["k_c"]["wartosc"]
            assert v["k_b"]["spelnia"] == (v["k_b"]["wartosc"] >= w["wymagania"]["k_b"]["wartosc"])
        if w["rodzina"] == "KIERUNKOWE_67N":
            assert v["k_c"]["wartosc"] == pytest.approx(
                v["rzut_w"]["wartosc"] / v["prog"]["wartosc"]
            )
            # Doziemienie poza polem: rzut ujemny — odstrojenie kierunkiem, k_b nie dotyczy.
            assert v["rzut_poza"]["wartosc"] < 0
            assert v["k_b"]["wartosc"] is None and v["k_b"]["tekst"] == "kierunek"


def test_u0_robocze_67n_gorna_granica_zakresu_iriesd():
    """IRiESD ENEA II.4.5.4.1.5: izolowana 5–15 %, skompensowana 10–20 %, rezystor 5–10 %."""
    oczekiwane = {
        "IZOLOWANY": 15.0,
        "KOMPENSOWANY": 20.0,
        "KOMPENSOWANY_AWSC": 20.0,
        "REZYSTOR": 10.0,
    }
    for sposob, u0 in oczekiwane.items():
        wiersze = [w for w in _wynik(sposob)["wiersze"] if w["kod"] == "67N"]
        assert wiersze
        for w in wiersze:
            assert w["wartosci"]["u0_prog"]["wartosc"] == u0
            assert "II.4.5.4.1.5" in w["wartosci"]["u0_prog"]["powod_pl"]


def test_wymagania_k_c_podstawa_i_stan_zrodla():
    """Tabela IRiESD ENEA II.4.5.4.1.4 (s. 51) × przypadki spoza punktu (ESTIMATED)."""
    przypadki = [
        ("51N", "IZOLOWANY", 1.5, "1", False),
        ("67N", "KOMPENSOWANY", 1.5, "1", False),
        ("Yo>", "UZIEMIONY_REZYSTOR", 2.0, "3", False),
        ("Go>", "UZIEMIONY_REZYSTOR", 2.0, "3", False),
        ("Go>", "KOMPENSOWANY_AWSC", 1.5, "4", False),
        ("Yo>", "IZOLOWANY", 1.2, "5", False),
        ("Bo>", "KOMPENSOWANY", 1.2, "5", False),
        ("Go>", "IZOLOWANY", 1.5, None, True),
        ("32N", "KOMPENSOWANY_AWSC", 1.5, None, True),
    ]
    for kod, sposob, wartosc, ppkt, przyjete in przypadki:
        w = wymaganie_k_c(kod, sposob)  # type: ignore[arg-type]
        assert w is not None and w.wartosc == wartosc and w.przyjete is przyjete, kod
        if ppkt is not None:
            assert w.podstawa.status == "ZWERYFIKOWANE"
            assert f"ppkt {ppkt}" in (w.podstawa.jednostka_redakcyjna or "")
    assert wymaganie_k_c("59N", "IZOLOWANY") is None
    assert wymaganie_k_c_opor("51N").wartosc == 1.2  # type: ignore[union-attr]
    assert wymaganie_k_c_opor("Yo>") is None
    kb = wymaganie_k_b("ZEROWOPRADOWE")
    assert kb is not None and kb.przyjete and kb.podstawa.rodzaj == "ZALOZENIE_PROJEKTOWE"
    # Wymaganie z przypadku obliczeniowego zastępuje wartość roboczą.
    assert wymaganie_k_b("ZEROWOPRADOWE", {"k_b": 1.5}).wartosc == 1.5  # type: ignore[union-attr]


def test_wymagania_przypadku_zmieniaja_ocene_k_b():
    enm = _enm("IZOLOWANY")
    graf = map_enm_to_network_graph(enm)
    luzne = ocen_zabezpieczenia_ziemnozwarciowe(
        enm, graf, odniesienie="t", wymagania={"k_b": 0.05}
    ).to_dict()
    for w in luzne["wiersze"]:
        if w["kod"] == "51N":
            assert w["wartosci"]["k_b"]["spelnia"] is True
            assert w["wymagania"]["k_b"]["przyjete"] is False


# --- rezystancja przejścia --------------------------------------------------------------------


def _punkt(z_petli: complex, z_base: float, r_f: float = 0.0) -> WynikPunktuDoziemienia:
    return WynikPunktuDoziemienia(
        punkt_ref="p",
        nazwa_pl="p",
        stan=STAN_PRZED,
        skladowa=0,
        prad_doziemny_a=0j,
        u0_punktu_v=0j,
        u0_punktu_proc=0.0,
        pola=(),
        prady_punktow_neutralnych_a=(),
        z_petli_pu=z_petli,
        z_base_ohm=z_base,
        r_f_ohm=r_f,
    )


def test_mnoznik_i_rezystancja_przejscia_recznie():
    """Z_p = 0,3 + j4 p.u., Z_b = 2,25 Ω. m(R) = |Z_p| / |Z_p + 3R/Z_b|.
    R = 1,5 Ω: 3R/Z_b = 2 → |2,3 + j4| = 4,6141; |Z_p| = 4,01123 → m = 0,86934.
    m = 0,5: ρ = 8,02247; 3R/Z_b = −0,3 + √(8,02247² − 16) = −0,3 + 6,95374 = 6,65374
    → R = 6,65374·2,25/3 = 4,99031 Ω."""
    p = _punkt(complex(0.3, 4.0), 2.25)
    assert mnoznik_rezystancji_przejscia(p, 1.5) == pytest.approx(4.01123 / 4.61411, rel=1e-4)
    assert rezystancja_przejscia_dla_mnoznika(p, 0.5) == pytest.approx(4.99031, rel=1e-4)
    assert rezystancja_przejscia_dla_mnoznika(p, 1.2) is None  # nieosiągalne nawet przy R_F = 0
    assert rezystancja_przejscia_dla_mnoznika(p, 0.0) == math.inf
    # Wynik policzony z R_F,obl > 0: m odniesione do niego (m(R_F,obl) = 1).
    p2 = _punkt(complex(0.3, 4.0), 2.25, r_f=1.5)
    assert mnoznik_rezystancji_przejscia(p2, 1.5) == pytest.approx(1.0)
    assert rezystancja_przejscia_dla_mnoznika(p2, 1.0) == pytest.approx(1.5)


@pytest.mark.parametrize("sposob", ["IZOLOWANY", "KOMPENSOWANY"])
@pytest.mark.parametrize("kod", ["51N", "67N"])
def test_rf_max_odwzorowane_solverem(sposob: str, kod: str):
    """Solver z R_F = R_F,max: w punkcie decydującym funkcja jest DOKŁADNIE na granicy działania
    (najmniejsza wielkość strefy / próg = 1 albo U0 = U0>), czyli R_F,max nie jest zgadywane."""
    enm = _enm(sposob)
    graf = map_enm_to_network_graph(enm)
    wynik = ocen_zabezpieczenia_ziemnozwarciowe(enm, graf, odniesienie="t")
    obliczenie = wynik.obliczenie
    assert obliczenie is not None
    wiersz = next(w for w in wynik.wiersze if w["kod"] == kod)
    r_f_max = wiersz["wartosci"]["r_f_max"]["wartosc"]
    assert r_f_max is not None and r_f_max > 0
    f = next(
        f for f in wynik.funkcje if f.urzadzenie_ref == wiersz["urzadzenie_ref"] and f.kod == kod
    )
    f = replace(
        f,
        nastawy={
            **f.nastawy,
            "prog_u0_proc": wiersz["wartosci"].get("u0_prog", {}).get("wartosc", 0.0),
        },
    )
    wejscie = replace(obliczenie.wejscie_max, c=obliczenie.c_min, r_f_ohm=r_f_max)
    rozw = oblicz_doziemienie(wejscie)
    marginesy = []
    for p in rozw.punkty:
        if p.stan != STAN_PRZED:
            continue
        pole = p.pole(f.klucz)
        if not pole.zwarcie_w_strefie:
            continue
        marginesy.append(
            min(c.wartosc / c.nastawa for c in warunki_67n(f, pole) if c.klucz != "SEKTOR")
            if kod == "67N"
            else abs(pole.prad_3i0_a) / f.prog
        )
    assert min(marginesy) == pytest.approx(1.0, rel=1e-6)


# --- algorytm 67N: parytet werdyktu i wykresu ------------------------------------------------


def _f67(tryb: str, kierunek: str, polowa: float = 80.0) -> FunkcjaZiemnozwarciowa:
    from application.analyses.protection.ocena_nadpradowa import StopienNastaw

    stopien = StopienNastaw(
        funkcja="67N",
        krzywa="DT",
        wartosc_progu=2.0,
        jednostka_progu="A_PIERWOTNY",
        prog_wtorny_a=2.0,
        prog_pierwotny_a=2.0,
        tms=None,
        zwloka_s=0.5,
        slad={},
    )
    return FunkcjaZiemnozwarciowa(
        urzadzenie_ref="r",
        nazwa_urzadzenia_pl="r",
        funkcja_ref="f",
        kod="67N",
        nastawy={
            "prog": 2.0,
            "jednostka_progu": "A_PIERWOTNY",
            "krzywa": "DT",
            "zwloka_s": 0.5,
            "kierunek": kierunek,
            "kat_charakterystyczny_deg": 90.0,
            "tryb_kryterium": tryb,
            "polowa_sektora_deg": polowa,
            "prog_u0_proc": 15.0,
        },
        breaker_ref="b",
        strefa=None,
        wezel_pomiaru="w",
        stopien=stopien,
        przekladnia_3i0=None,
        braki=(),
    )


def _pole(modul: float, kat_deg: float, u0: float) -> WielkosciPola:
    prad = cmath.rect(modul, math.radians(kat_deg))
    return WielkosciPola(
        strefa_ref="r/f",
        zwarcie_w_strefie=True,
        prad_3i0_a=prad,
        u0_v=complex(-1000.0, 0.0),
        u0_proc=u0,
        admitancja_y0_s=None,
        moc_p0_w=0.0,
        kat_phi0_deg=kat_deg,
    )


@pytest.mark.parametrize("tryb", ["RZUT", "SEKTOR"])
@pytest.mark.parametrize("kierunek", ["DO_LINII", "DO_SZYN"])
@pytest.mark.parametrize("polozenie", ["wewnatrz", "granica", "poza"])
@pytest.mark.parametrize("modul", [1.0, 10.0])
@pytest.mark.parametrize("u0", [10.0, 90.0])
def test_parytet_werdyktu_67n_i_wykresu(tryb, kierunek, polozenie, modul, u0):
    """Werdykt algorytmu = położenie wskazu na wykresie zbudowanym WYŁĄCZNIE z danych wykresu:
    kąt wskazu (re, im) względem wersora osi ≤ połowa sektora, rzut na oś (tryb rzutu) albo
    moduł (tryb sektora) ≥ próg, U0 ≥ U0>."""
    f = _f67(tryb, kierunek)
    os_deg = 90.0 + (180.0 if kierunek == "DO_SZYN" else 0.0)
    kat = os_deg + {"wewnatrz": 20.0, "granica": 80.0, "poza": 120.0}[polozenie]
    pole = _pole(modul, (kat + 180.0) % 360.0 - 180.0, u0)
    wykres = wykres_wskazowy_67n(f, [_wskaz(f, pole, "W_POLU", "p")])
    wskaz = wykres["wskazy"][0]
    ux, uy = wykres["os"]
    re, im = wskaz["re_a"], wskaz["im_a"]
    cos_kata = (re * ux + im * uy) / math.hypot(re, im)
    graniczny = math.cos(math.radians(wykres["polowa_sektora_deg"]))
    w_sektorze = cos_kata >= graniczny - 1e-9
    nad_progiem = (
        (re * ux + im * uy) >= wykres["prog_a"] - 1e-9
        if wykres["tryb"] == "RZUT"
        else math.hypot(re, im) >= wykres["prog_a"] - 1e-9
    )
    geometria = w_sektorze and nad_progiem and u0 >= wykres["prog_u0_proc"]
    assert wskaz["dziala"] is geometria is rusza(f, pole)
    # Granice sektora i oś: wersory z backendu (ekran ich nie liczy).
    for gx, gy in wykres["granice"]:
        assert math.hypot(gx, gy) == pytest.approx(1.0)
    if not geometria:
        rozstrzygajacy = next(c for c in wskaz["warunki"] if not c["spelniony"])
        assert wskaz["rozstrzygajacy"] == rozstrzygajacy["klucz"]


# --- uziemienia: U_E ≠ U_T --------------------------------------------------------------------


@pytest.mark.parametrize("sposob", SPOSOBY_PRACY)
def test_napiecie_uziomowe_nie_jest_dotykowym(sposob: str):
    wynik = _wynik(sposob)
    for w in wynik["wiersze_uziemien"]:
        assert w["napiecie_uziomowe_v"] == pytest.approx(0.5 * w["prad_uziomowy_a"])
        assert w["napiecie_dotykowe_v"] is None
        assert w["przypisy_kolumn"]["napiecie_dotykowe_v"] == "GEOMETRIA"
    kryteria = {r["kryterium"]: r for r in wynik["uziemienia"]}
    assert kryteria["NAPIECIE_DOTYKOWE"]["status"] == "NIE_OCENIONO"
    assert kryteria["NAPIECIE_DOTYKOWE"]["ocena"]["wynik"] is None
    assert "Warunek wystarczający" in kryteria["NAPIECIE_UZIOMOWE"]["ocena"]["kryterium"]["opis_pl"]
    assert "U_T ≤ U_E" in kryteria["NAPIECIE_UZIOMOWE"]["ocena"]["kryterium"]["opis_pl"]


def test_determinizm_wierszy():
    enm = _enm("KOMPENSOWANY_AWSC")
    graf = map_enm_to_network_graph(enm)
    a = ocen_zabezpieczenia_ziemnozwarciowe(enm, graf, odniesienie="t").to_dict()
    b = ocen_zabezpieczenia_ziemnozwarciowe(enm, graf, odniesienie="t").to_dict()
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
    assert a["siec"][0]["sposob"] == "KOMPENSOWANY_AWSC"
    # Dane sieci: rozstrojenie v = (I_L − I_C)/I_C — dana sieci, nie wymaganie zabezpieczenia.
    s = a["siec"][0]
    assert s["rozstrojenie_proc"] == pytest.approx(
        100.0 * (s["prad_dlawikow_a"] - s["prad_pojemnosciowy_a"]) / s["prad_pojemnosciowy_a"]
    )
    assert s["awsc_prad_a"] == 25.0
