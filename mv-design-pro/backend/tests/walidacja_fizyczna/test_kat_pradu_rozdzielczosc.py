"""KAT FAZORA PRADU A ROZDZIELCZOSC ROZWIAZANIA SIECI (karta DETERMINIZM-KATA-FAZORA, 2026-09-29).

DEFEKT, KTORY TE TESTY PRZYPINAJA. Kanaly `i_od_kat_deg@`, `i_do_kat_deg@` i
`i_zwarcia_kat_deg@` publikowaly kat KAZDEGO niezerowego fazora pradu. Prad zacisku galezi,
za ktora fizycznie nic nie plynie (transformator bez obciazenia strony dolnej, otwarty koniec
odcinka, pole bez odbioru), jest roznica dwoch skladnikow rzedu |y|*|V|, ktore sie znosza:
zostaje blad zaokraglen 1e-16...1e-12 pu, a jego „kat" (45, -135, 180 stopni) jest kierunkiem
bledu i zalezy od kolejnosci sumowania zmiennoprzecinkowego. Pomiar na scenie dynamiki harnessu
(`dynamika_scena_przebiegi`): 1, 2 i 4 watki OpenBLAS daly trzy rozne zestawy katow, a test
fikstur harnessu padal na maszynie o innej liczbie rdzeni niz ta, na ktorej fikstura powstala.

REGULA. Kat fazora pradu istnieje tylko dla |I| > `NastawySolvera.tolerancja`: Newton czesci
algebraicznej konczy przy normie residuum bilansu pradow wezlow <= tolerancja, wiec prad nie
wiekszy niz tolerancja jest nierozroznialny od niezbilansowania, ktore rozwiazanie dopuszcza
(prad zacisku galezi slepej jest DOKLADNIE residuum bilansu wezla koncowego). Modul pradu
zostaje bez zmian. Kat NAPIECIA ma kryterium „dokladnie zero": napiecie jest zmienna rozwiazania,
nie roznica skladnikow, a wezel z ograniczeniem `V = 0` ma zero dokladne — co tez jest tu
przypiete, bo to zdanie stoi w docstringu `_kat_deg`.

ILOCZYN CECH: {kanal: i_od, i_do, i_zwarcia, kat napiecia} x {fazor: dokladnie zerowy, szum
ponizej rozdzielczosci, rowny rozdzielczosci, tuz powyzej, pelny prad}. Os liczby watkow BLAS
(cala scena dynamiki harnessu, wszystkie kanaly) pilnuje
`test_niepewnosc_na_granicy_zaokraglen.py::test_scena_dynamiki_nie_zalezy_od_jadra_i_liczby_watkow_blas`.
"""

from __future__ import annotations

import dataclasses
import math
from functools import cache

import pytest
from network_model.solvers.dynamika import (
    HarmonogramDynamiki,
    SilnikDynamiki,
    WejscieDynamiki,
    ZwarcieWezla,
)
from network_model.solvers.dynamika.kontrakty import GalazDynamiki, WezelDynamiki
from network_model.solvers.dynamika.silnik import _kat_deg, _kat_pradu_deg
from network_model.solvers.dynamika.wynik import WynikDynamiki

from tests.network_model.dynamika.uklady import U_N_KV, nastawy, zbuduj_smib_z_odbiorem

#: Przekladnia transformatora galezi slepej: modul 1,025 i przesuniecie 30 stopni (Yd11) —
#: dokladnie ten mechanizm dawal szum pradu transformatora bez obciazenia w scenie harnessu
#: (dwie drogi obliczenia tej samej wartosci przez `a` i `conj(a)`).
PRZEKLADNIA_SLEPA = complex(
    1.025 * math.cos(math.radians(30.0)), 1.025 * math.sin(math.radians(30.0))
)
T_ZWARCIA_S = 0.1
T_USUNIECIA_S = 0.2


# ---------------------------------------------------------------------------
# Funkcja kata — tablica przypadkow
# ---------------------------------------------------------------------------

ROZDZIELCZOSC_PU = 1.0e-10


@pytest.mark.parametrize(
    ("prad", "oczekiwany_kat"),
    (
        pytest.param(0j, None, id="zero-dokladne"),
        pytest.param(complex(1e-12, 1e-12), None, id="szum-ponizej-rozdzielczosci"),
        pytest.param(complex(-3e-16, 2e-16), None, id="szum-rzedu-ulp"),
        pytest.param(complex(ROZDZIELCZOSC_PU, 0.0), None, id="rowny-rozdzielczosci"),
        pytest.param(complex(0.0, -2.0 * ROZDZIELCZOSC_PU), -90.0, id="tuz-powyzej"),
        pytest.param(complex(0.3, -0.4), math.degrees(math.atan2(-0.4, 0.3)), id="pelny-prad"),
        pytest.param(complex(-5.0, 0.0), 180.0, id="pelny-prad-przeciwny"),
    ),
)
def test_kat_pradu_istnieje_tylko_ponad_rozdzielczoscia(
    prad: complex, oczekiwany_kat: float | None
) -> None:
    kat = _kat_pradu_deg(prad, ROZDZIELCZOSC_PU)
    if oczekiwany_kat is None:
        assert kat is None
    else:
        assert kat == pytest.approx(oczekiwany_kat, abs=1e-12)


@pytest.mark.parametrize(
    ("napiecie", "oczekiwany_kat"),
    (
        pytest.param(0j, None, id="zero-dokladne"),
        pytest.param(complex(1e-170, 0.0), 0.0, id="najmniejsze-niezerowe"),
        pytest.param(complex(0.0, 1.0), 90.0, id="znamionowe"),
    ),
)
def test_kat_napiecia_ma_kryterium_zera_dokladnego(
    napiecie: complex, oczekiwany_kat: float | None
) -> None:
    """Napiecie jest zmienna rozwiazania: `None` wylacznie dla zera dokladnego."""
    kat = _kat_deg(napiecie)
    if oczekiwany_kat is None:
        assert kat is None
    else:
        assert kat == pytest.approx(oczekiwany_kat, abs=1e-12)


# ---------------------------------------------------------------------------
# Bieg rdzenia: galaz slepa z przekladnia zespolona + zwarcie metaliczne
# ---------------------------------------------------------------------------


def wejscie_z_galezia_slepa() -> WejscieDynamiki:
    """SMIB z odbiorem + wezel F bez odbioru + galaz slepa F -> DEAD (transformator Yd11).

    Galaz `DOJSCIE` (od szyny odbioru do F) przewodzi prad wylacznie w czasie zwarcia
    metalicznego w F; galaz `SLEPA` nie przewodzi nigdy (za DEAD nie ma nic), a jej prad
    zaciskow jest roznica skladnikow liczonych przez `a` i `conj(a)` — szum zaokraglen.
    """
    uklad = zbuduj_smib_z_odbiorem()
    bazowe = uklad.wejscie(HarmonogramDynamiki(()), nastawy())
    wezel_odbioru = bazowe.odbiory[0].wezel
    dojscie = GalazDynamiki(
        ident="DOJSCIE",
        wezel_od=wezel_odbioru,
        wezel_do="F",
        y_szeregowa_pu=1.0 / complex(0.02, 0.1),
        b_poprzeczna_pu=0.0,
        przekladnia=complex(1.0, 0.0),
        aktywna_na_starcie=True,
        rodzaj="linia",
    )
    slepa = GalazDynamiki(
        ident="SLEPA",
        wezel_od="F",
        wezel_do="DEAD",
        y_szeregowa_pu=1.0 / complex(0.01, 0.05),
        b_poprzeczna_pu=0.0,
        przekladnia=PRZEKLADNIA_SLEPA,
        aktywna_na_starcie=True,
        rodzaj="transformator",
    )
    napiecia = dict(bazowe.punkt_pracy.napiecia_pu)
    napiecia["F"] = napiecia[wezel_odbioru]
    # Prad zacisku `do` galezi slepej jest zerowy, gdy V_do = V_od / a (model pi z przekladnia).
    napiecia["DEAD"] = napiecia[wezel_odbioru] / PRZEKLADNIA_SLEPA
    return dataclasses.replace(
        bazowe,
        wezly=bazowe.wezly + (WezelDynamiki("F", U_N_KV), WezelDynamiki("DEAD", U_N_KV)),
        galezie=bazowe.galezie + (dojscie, slepa),
        punkt_pracy=dataclasses.replace(bazowe.punkt_pracy, napiecia_pu=napiecia),
        harmonogram=HarmonogramDynamiki(
            (
                ZwarcieWezla(
                    t_s=T_ZWARCIA_S,
                    wezel="F",
                    typ="3F",
                    r_f_ohm=0.0,
                    x_f_ohm=0.0,
                    t_usuniecia_s=T_USUNIECIA_S,
                    sposob_usuniecia="samoczynne",
                ),
            )
        ),
        nastawy=nastawy(horyzont_s=0.4, krok_wyjscia_s=0.05),
    )


@cache
def _bieg() -> tuple[WynikDynamiki, float]:
    wejscie = wejscie_z_galezia_slepa()
    return SilnikDynamiki(wejscie=wejscie).uruchom(), wejscie.nastawy.tolerancja


def _w_zwarciu(wynik: WynikDynamiki, indeks: int) -> bool:
    """Czy probka opisuje siec ze zwarciem (P w chwili zwarcia .. L w chwili usuniecia)."""
    t = wynik.os_czasu_s[indeks]
    strona = wynik.strona_probki[indeks]
    if math.isclose(t, T_ZWARCIA_S, abs_tol=1e-12):
        return strona == "P"
    if math.isclose(t, T_USUNIECIA_S, abs_tol=1e-12):
        return strona == "L"
    return T_ZWARCIA_S < t < T_USUNIECIA_S


def test_kat_pradu_jest_none_wtedy_i_tylko_wtedy_gdy_prad_nie_przekracza_rozdzielczosci() -> None:
    """Rownowaznosc na WSZYSTKICH kanalach katow pradu biegu, w kazdej probce."""
    wynik, tolerancja = _bieg()
    sprawdzone = 0
    for klucz, szereg in wynik.probki.items():
        rodzina, _, element = klucz.partition("@")
        if rodzina not in ("i_od_kat_deg", "i_do_kat_deg", "i_zwarcia_kat_deg"):
            continue
        modul_rodziny = rodzina.replace("_kat_deg", "_pu")
        for indeks, kat in enumerate(szereg):
            modul = wynik.probki[f"{modul_rodziny}@{element}"][indeks]
            assert modul is not None and math.isfinite(modul), (klucz, indeks)
            assert (kat is None) == (modul <= tolerancja), (klucz, indeks, modul, kat)
            sprawdzone += 1
    assert sprawdzone > 0, "bieg bez kanalow katow pradu nie sprawdzilby niczego"


def test_galaz_slepa_z_przekladnia_zespolona_nie_ma_kata_mimo_niezerowego_szumu() -> None:
    """Sedno defektu: modul pradu SLEPEJ galezi jest NIEZEROWY (szum), a kata nie ma.

    Pierwsza asercja pilnuje, ze wzorzec naprawde wytwarza szum — bez niej test przeszedlby
    takze na rdzeniu z dawnym kryterium „dokladnie zero" i niczego by nie dowodzil.
    """
    wynik, tolerancja = _bieg()
    moduly = [
        wynik.probki[f"i_{zacisk}_pu@SLEPA"][indeks]
        for zacisk in ("od", "do")
        for indeks in range(len(wynik.os_czasu_s))
    ]
    assert any(modul > 0.0 for modul in moduly), "wzorzec nie wytworzyl szumu pradu"
    assert max(moduly) <= tolerancja, max(moduly)
    for zacisk in ("od", "do"):
        assert set(wynik.probki[f"i_{zacisk}_kat_deg@SLEPA"]) == {None}, zacisk


def test_prad_dojscia_i_prad_zwarcia_maja_kat_wylacznie_w_czasie_zwarcia() -> None:
    wynik, tolerancja = _bieg()
    miejsce = next(
        klucz.partition("@")[2]
        for klucz in wynik.probki
        if klucz.startswith("i_zwarcia_kat_deg@") and klucz.endswith("F")
    )
    for indeks in range(len(wynik.os_czasu_s)):
        w_zwarciu = _w_zwarciu(wynik, indeks)
        prad_zwarcia = wynik.probki[f"i_zwarcia_pu@{miejsce}"][indeks]
        kat_zwarcia = wynik.probki[f"i_zwarcia_kat_deg@{miejsce}"][indeks]
        for zacisk in ("od", "do"):
            kat_dojscia = wynik.probki[f"i_{zacisk}_kat_deg@DOJSCIE"][indeks]
            assert (kat_dojscia is not None) == w_zwarciu, (zacisk, indeks)
        if w_zwarciu:
            assert prad_zwarcia > 1.0 and kat_zwarcia is not None and math.isfinite(kat_zwarcia)
        else:
            assert prad_zwarcia <= tolerancja and kat_zwarcia is None, (indeks, prad_zwarcia)


def test_napiecie_wezlow_za_zwarciem_metalicznym_jest_zerem_dokladnym_bez_kata() -> None:
    """Przypina zdanie z docstringu `_kat_deg`: kryterium zera dokladnego dla napiec jest pelne.

    Wezel F ma ograniczenie `V = 0`; wezel DEAD lezy za nim na galezi slepej z przekladnia
    zespolona — mimo to jego napiecie w zwarciu jest zerem DOKLADNYM, nie szumem.
    """
    wynik, _ = _bieg()
    for indeks in range(len(wynik.os_czasu_s)):
        for wezel in ("F", "DEAD"):
            modul = wynik.probki[f"u_pu@{wezel}"][indeks]
            kat = wynik.probki[f"kat_deg@{wezel}"][indeks]
            if _w_zwarciu(wynik, indeks):
                assert modul == 0.0 and kat is None, (wezel, indeks, modul, kat)
            else:
                assert modul > 0.5 and kat is not None and math.isfinite(kat), (wezel, indeks)
