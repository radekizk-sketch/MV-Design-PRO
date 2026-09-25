"""Probki obustronne, kanaly galezi i jakosc czestotliwosci — iloczyn cech (karta AB-1b.1 P5).

Karta wymaga pokrycia ILOCZYNU cech, w ktorym defekt probkowania moglby sie schowac, a nie
jednego przykladu (CLAUDE.md, regula KLASA, NIE INSTANCJA pkt 2). Trzy iloczyny:

1. os czasu: {na siatce, poza siatka, t = 0, t = horyzont} x {jedno zdarzenie, dwa
   rownoczesne (topologia + zwarcie)} — para `L`/`P`, siatka `C`, ciaglosc stanu x,
   czestotliwosc niedostepna w chwili zdarzenia;
2. kanaly galezi: {aktywna, otwarta, w obszarze beznapieciowym, zwarta w x*L} x
   {modul, kat} x {`L`, `P`, `C`} — zero DOKLADNE i kat `None` tam, gdzie fazora nie ma;
3. jakosc czestotliwosci: {stan ustalony, zapad, chwila zdarzenia, obszar beznapieciowy,
   zwarcie metaliczne} — kazdy stan z WLASNYM kodem (kula niepewnosci, kod 2, ma wlasne
   testy w `tests/network_model/dynamika/test_obserwable.py`).

Stany planowane z P6-P8 (przypisanie stanu, profil, zdarzenia warunkowe) nie istnieja w
rdzeniu tej karty — ich wiersze iloczynu dochodza w pakietach, ktore je wprowadzaja.
"""

from __future__ import annotations

import math

import pytest
from network_model.solvers.dynamika import ZmianaGalezi, ZwarcieGalezi, ZwarcieWezla
from network_model.solvers.dynamika.obserwable import (
    JAKOSC_BEZ_NAPIECIA,
    JAKOSC_CHWILA_ZDARZENIA,
    JAKOSC_NIEROZROZNIALNA,
    JAKOSC_ROZROZNIALNA,
)

from . import bramki, stanowisko

HORYZONT_S = 0.2
KROK_WYJSCIA_S = 0.01
POLOZENIA = {"na_siatce": 0.1, "poza_siatka": 0.1037, "t0": 0.0, "horyzont": HORYZONT_S}


def _zdarzenia(t_s: float, krotnosc: str) -> tuple:
    otwarcie = ZmianaGalezi(t_s=t_s, galaz="LINIA2", zalaczona=False)
    if krotnosc == "jedno":
        return (otwarcie,)
    zwarcie = ZwarcieWezla(
        t_s=t_s,
        wezel="GEN",
        typ="3F",
        r_f_ohm=0.0,
        x_f_ohm=0.5 * stanowisko.Z_BAZOWA_OM,
        t_usuniecia_s=None,
        sposob_usuniecia=None,
    )
    return (otwarcie, zwarcie)


@pytest.mark.parametrize("krotnosc", ("jedno", "dwa_rownoczesne"))
@pytest.mark.parametrize("polozenie", tuple(POLOZENIA))
def test_os_czasu_i_strony_probek(polozenie: str, krotnosc: str) -> None:
    t_zd = POLOZENIA[polozenie]
    wynik = stanowisko.uruchom(
        stanowisko.zbuduj(x_linii_pu=0.15, dwutorowa=True),
        _zdarzenia(t_zd, krotnosc),
        horyzont_s=HORYZONT_S,
        dt_s=1e-3,
        krok_wyjscia_s=KROK_WYJSCIA_S,
    )
    os_czasu, strony, probki = wynik.os_czasu_s, wynik.strona_probki, wynik.probki
    assert len(strony) == len(os_czasu)
    assert all(b >= a for a, b in zip(os_czasu[:-1], os_czasu[1:], strict=True))
    # Dokladnie jedna para L/P, w chwili zdarzenia, L bezposrednio przed P — niezaleznie
    # od liczby zdarzen tej chwili (zdarzenia rownoczesne sa nanoszone atomowo).
    lewa = stanowisko.indeks_probki(wynik, t_zd, "L")
    prawa = stanowisko.indeks_probki(wynik, t_zd, "P")
    assert prawa == lewa + 1
    assert strony.count("L") == strony.count("P") == 1
    # Siatka C nietknieta poza chwila zdarzenia (tam para L/P ZASTEPUJE probke C).
    siatka = [round(i * KROK_WYJSCIA_S, 9) for i in range(round(HORYZONT_S / KROK_WYJSCIA_S) + 1)]
    oczekiwana_c = [t for t in siatka if abs(t - t_zd) > 1e-9]
    assert [round(t, 9) for t, s in zip(os_czasu, strony, strict=True) if s == "C"] == (
        oczekiwana_c
    )
    # Stan rozniczkowy ciagly: kat wirnika w L i P identyczny bitowo.
    assert probki["delta_rad@G1"][lewa] == probki["delta_rad@G1"][prawa]
    # L = stan PRZED zdarzeniem: w t = 0 punkt pracy, poza t = 0 — probka poprzedzajaca
    # (stan ustalony przed pierwszym zdarzeniem).
    u_przed = 1.05 if lewa == 0 else probki["u_pu@GEN"][lewa - 1]
    assert probki["u_pu@GEN"][lewa] == pytest.approx(u_przed, rel=1e-9)
    assert probki["stan_galezi@LINIA2"][lewa] == 1.0
    assert probki["stan_galezi@LINIA2"][prawa] == 0.0
    assert probki["u_pu@GEN"][prawa] != probki["u_pu@GEN"][lewa]
    # Czestotliwosc w chwili zdarzenia: niedostepna (kod 3) w OBU probkach.
    for indeks in (lewa, prawa):
        for wezel in ("GEN", "SYS"):
            assert probki[f"f_hz@{wezel}"][indeks] is None
            assert probki[f"u_f_est_hz@{wezel}"][indeks] is None
            assert probki[f"jakosc_f@{wezel}"][indeks] == JAKOSC_CHWILA_ZDARZENIA
    assert len(wynik.zdarzenia_wykonane) == (1 if krotnosc == "jedno" else 2)


T_D15_S = 0.01
HORYZONT_D15_S = 0.03


def _bieg_stanu_galezi(stan: str):
    if stan == "aktywna":
        return bramki.siec_d15((ZmianaGalezi(T_D15_S, "L-BC", True),), horyzont_s=HORYZONT_D15_S)
    if stan == "otwarta":
        return bramki.siec_d15((ZmianaGalezi(T_D15_S, "L-TB", False),), horyzont_s=HORYZONT_D15_S)
    if stan == "w_obszarze_beznapieciowym":
        return bramki.siec_d15(
            (ZmianaGalezi(T_D15_S, "TR-AT", False), ZmianaGalezi(T_D15_S, "L-BC", False)),
            horyzont_s=HORYZONT_D15_S,
        )
    return bramki.siec_d15(
        (ZwarcieGalezi(T_D15_S, "L-SA", 0.4, "3F", 0.0, 0.5, None, None),),
        horyzont_s=HORYZONT_D15_S,
    )


#: Galaz obserwowana w kazdym stanie.
GALAZ_STANU = {
    "aktywna": "L-TB",
    "otwarta": "L-TB",
    "w_obszarze_beznapieciowym": "L-TB",
    "zwarta_xL": "L-SA",
}


@pytest.mark.parametrize("strona", ("L", "P", "C"))
@pytest.mark.parametrize("stan", tuple(GALAZ_STANU))
def test_kanaly_galezi_modul_i_kat(stan: str, strona: str) -> None:
    wynik = _bieg_stanu_galezi(stan)
    galaz = GALAZ_STANU[stan]
    indeks = (
        stanowisko.indeks_probki(wynik, T_D15_S, strona)
        if strona != "C"
        else stanowisko.indeks_probki(wynik, HORYZONT_D15_S, "C")
    )
    probki = wynik.probki
    # Probka L opisuje galaz PRZED zdarzeniem: we wszystkich stanach przewodzi.
    przewodzi = strona == "L" or stan in ("aktywna", "zwarta_xL")
    for zacisk in ("od", "do"):
        modul = probki[f"i_{zacisk}_pu@{galaz}"][indeks]
        kat = probki[f"i_{zacisk}_kat_deg@{galaz}"][indeks]
        if przewodzi:
            assert modul > 1e-3, (zacisk, modul)
            assert kat is not None and math.isfinite(kat)
        else:
            # Fazor zerowy nie ma kata: zero DOKLADNE i `None`, nigdy 0,0 stopni z angle(0).
            assert modul == 0.0, (zacisk, modul)
            assert kat is None
    stan_galezi = probki[f"stan_galezi@{galaz}"][indeks]
    assert stan_galezi == (0.0 if stan == "otwarta" and strona != "L" else 1.0)
    if stan == "w_obszarze_beznapieciowym" and strona != "L":
        assert probki["stan_zasilania@T"][indeks] == probki["stan_zasilania@B"][indeks] == 0.0
        assert probki["u_pu@T"][indeks] == probki["u_pu@B"][indeks] == 0.0
    if stan == "zwarta_xL":
        miejsce = "L-SA:x=0.4"
        prad = probki[f"i_zwarcia_pu@{miejsce}"][indeks]
        kat_zwarcia = probki[f"i_zwarcia_kat_deg@{miejsce}"][indeks]
        if strona == "L":
            assert prad == 0.0 and kat_zwarcia is None
        else:
            assert prad > 0.1 and kat_zwarcia is not None


def _bieg_smib_z_zapadem():
    return stanowisko.uruchom(
        stanowisko.zbuduj(),
        (bramki._zwarcie(0.1, 0.5, 0.2)),
        horyzont_s=0.4,
        dt_s=1e-3,
        krok_wyjscia_s=KROK_WYJSCIA_S,
    )


@pytest.mark.parametrize(
    "przypadek",
    ("stan_ustalony", "zapad", "chwila_zdarzenia", "obszar_beznapieciowy", "zwarcie_metaliczne"),
)
def test_jakosc_czestotliwosci_ma_kod_przyczyny(przypadek: str) -> None:
    if przypadek == "stan_ustalony":
        wynik = stanowisko.uruchom(
            stanowisko.zbuduj(), (), horyzont_s=0.1, dt_s=1e-3, krok_wyjscia_s=KROK_WYJSCIA_S
        )
        for i in range(len(wynik.os_czasu_s)):
            assert wynik.probki["jakosc_f@GEN"][i] == JAKOSC_NIEROZROZNIALNA
            assert wynik.probki["f_hz@GEN"][i] == pytest.approx(50.0, abs=1e-9)
        return
    if przypadek in ("zapad", "chwila_zdarzenia"):
        wynik = _bieg_smib_z_zapadem()
        for i, (t, strona) in enumerate(zip(wynik.os_czasu_s, wynik.strona_probki, strict=True)):
            jakosc, f = wynik.probki["jakosc_f@GEN"][i], wynik.probki["f_hz@GEN"][i]
            if strona != "C":
                assert f is None and jakosc == JAKOSC_CHWILA_ZDARZENIA
            elif 0.1 < t < 0.2 and przypadek == "zapad":
                assert jakosc == JAKOSC_ROZROZNIALNA
                assert f is not None and abs(f - 50.0) > wynik.probki["u_f_est_hz@GEN"][i]
        return
    if przypadek == "obszar_beznapieciowy":
        wynik = _bieg_stanu_galezi("w_obszarze_beznapieciowym")
        martwe, zywe = ("T", "B"), ("S", "A", "C")
    else:
        wynik = bramki.bieg_d15("B", 0j)
        martwe, zywe = ("B",), ("S", "A", "T", "C")
    indeks = stanowisko.indeks_probki(wynik, HORYZONT_D15_S, "C")
    for wezel in martwe:
        assert wynik.probki[f"f_hz@{wezel}"][indeks] is None
        assert wynik.probki[f"jakosc_f@{wezel}"][indeks] == JAKOSC_BEZ_NAPIECIA
    for wezel in zywe:
        assert wynik.probki[f"f_hz@{wezel}"][indeks] is not None
        assert wynik.probki[f"jakosc_f@{wezel}"][indeks] != JAKOSC_BEZ_NAPIECIA
    if przypadek == "zwarcie_metaliczne":
        # Wezel z napieciem NARZUCONYM (wiersz ograniczenia) — stan zasilania 2, nie 0.
        assert wynik.probki["stan_zasilania@B"][indeks] == 2.0


def test_szereg_stanowiska_odmawia_zamiany_None_na_liczbe() -> None:
    """Pomocnik bramek NIE zamienia `None` na NaN (w G7 `max(0.0, nan)` dawalo 0,0)."""
    wynik = _bieg_smib_z_zapadem()
    with pytest.raises(ValueError, match="niedostepna"):
        stanowisko.szereg(wynik, "f_hz@GEN", strony="CLP")
    assert len(stanowisko.szereg(wynik, "f_hz@GEN", strony="C")) == wynik.strona_probki.count("C")
