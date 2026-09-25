"""Zdarzenia warunkowe (dozory) i detektory przekroczen (karta AB-1b.1, P8).

ILOCZYN CECH (CLAUDE.md „KLASA, NIE INSTANCJA" p. 2):

* wielkosc {|V| wezla, f wezla, |I| zacisku od i do, stan urzadzenia, P i Q urzadzenia} x
  kierunek {spadek, wzrost} x integrator {trapez, RK4} x krok {staly, adaptacyjny} —
  przejscie CIAGLE lokalizowane z tolerancja i zgodne z siatka probek biegu bez dozorow
  (detektor nie zmienia trajektorii),
* przejscie {ciagle, skokowe w chwili zdarzenia, spelnione w t = 0},
* zwloka {0, > 0 z kasowaniem, > 0 bez kasowania} przy zapadzie krotszym niz zwloka,
* akcje {otwarcie galezi, odlaczenie zrodla, przypisanie stanu} wykonane w `t*` (para
  probek L/P w chwili pobudzenia), dwa dozory o tym samym progu (remis) w kolejnosci
  kanonicznej, petla pobudzen w jednej chwili — odmowa nazwana,
* detektor czestotliwosci nie pobudza sie w probkach chwili zdarzenia,
* walidacja specyfikacji (wielkosc spoza modelu, akcja trwala, zwloka bez akcji, brak
  tolerancji lokalizacji), determinizm trzech ziaren `PYTHONHASHSEED`.

Twierdzenie D-12 (lokalizacja wobec postaci zamknietych) i bramka G14 —
`tests/walidacja_fizyczna`.
"""

from __future__ import annotations

import functools
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest
from network_model.solvers.dynamika import (
    HarmonogramDynamiki,
    KomendaRegulacji,
    OdlaczenieZrodla,
    OdmowaDynamiki,
    PrzypisanieStanu,
    SilnikDynamiki,
    ZmianaGalezi,
    ZwarcieWezla,
)
from network_model.solvers.dynamika.dozory import (
    CzestotliwoscElektrycznaWezla,
    Dozor,
    MocUrzadzenia,
    ModulNapieciaWezla,
    ModulPraduZacisku,
    StanUrzadzenia,
)
from network_model.solvers.dynamika.kontrakty import (
    KOD_NASTAWY_SPRZECZNE,
    KOD_PETLA_ZDARZEN_WARUNKOWYCH,
    KOD_ZDARZENIE_BEZ_ELEMENTU,
    KOD_ZDARZENIE_SPRZECZNE,
)
from network_model.solvers.dynamika.silnik import TOLERANCJA_CZASU_S

from tests.network_model.dynamika import biblioteka_urzadzen as b
from tests.network_model.dynamika import uklady

KORZEN_BACKENDU = Path(__file__).resolve().parents[3]
TOLERANCJA_S = 1e-7
T_SKOKU_S = 0.05
P_M_PO_SKOKU = 0.9
#: Prog kata wirnika dozorow ukladu dwutorowego: kat startuje z 0,431 rad i po skoku P_m
#: 0,8 -> 0,9 dochodzi do 0,561 rad (pomiar 2026-09-24, bieg bez dozorow, horyzont 0,6 s).
#: Prog 0,5 rad jest PRZECINANY w pierwszym wahnieciu; dawny prog 0,6 rad lezal ponad
#: szczytem, wiec dozor nigdy sie nie pobudzal (testy akcji padaly na braku akcji).
PROG_KATA_RAD = 0.5


def _skok_mocy() -> PrzypisanieStanu:
    return PrzypisanieStanu(
        t_s=T_SKOKU_S, urzadzenie="G1", stan="p_mechaniczna_pu", wartosc=P_M_PO_SKOKU
    )


def _nastawy(integrator: str = "trapez_niejawny", adaptacyjny: bool = False, **kw):
    dt = 1e-3
    return uklady.nastawy(
        dt_s=dt,
        horyzont_s=kw.pop("horyzont_s", 1.2),
        krok_wyjscia_s=kw.pop("krok_wyjscia_s", 1e-3),
        integrator=integrator,
        dt_min_s=dt / 16.0 if adaptacyjny else None,
        dt_max_s=dt * 4.0 if adaptacyjny else None,
        tolerancja_kroku=1e-7,
        tolerancja_lokalizacji_zdarzen_s=kw.pop("tolerancja", TOLERANCJA_S),
    )


def _bieg(uklad, zdarzenia: tuple, dozory: tuple, nastawy):
    return SilnikDynamiki(uklad.wejscie(HarmonogramDynamiki(zdarzenia, dozory), nastawy)).uruchom()


WIELKOSCI = {
    "u_wezla": ModulNapieciaWezla("GEN"),
    "f_wezla": CzestotliwoscElektrycznaWezla("GEN"),
    "i_zacisku_od": ModulPraduZacisku("LINIA", "od"),
    "i_zacisku_do": ModulPraduZacisku("LINIA", "do"),
    "stan": StanUrzadzenia("G1", "delta_rad"),
    "moc_p": MocUrzadzenia("G1", "p"),
    "moc_q": MocUrzadzenia("G1", "q"),
}


@functools.cache
def _bieg_wzorca_bez_dozorow(integrator: str, adaptacyjny: bool):
    """Bieg wzorcowy BEZ dozorow — jeden na pare (integrator, krok), wspolny dla siedmiu
    wielkosci (wynik jest niezmienny; testy tylko go czytaja)."""
    return _bieg(uklady.zbuduj_smib(), (_skok_mocy(),), (), _nastawy(integrator, adaptacyjny))


@pytest.mark.parametrize("integrator", ["trapez_niejawny", "rk4_jawny"])
@pytest.mark.parametrize("adaptacyjny", [False, True], ids=["krok_staly", "krok_adaptacyjny"])
@pytest.mark.parametrize("nazwa", sorted(WIELKOSCI))
def test_przejscie_ciagle_obu_kierunkow_zgodne_z_siatka(
    nazwa: str, adaptacyjny: bool, integrator: str
) -> None:
    """Skok P_m pobudza wahania: wielkosc przechodzi przez prog w gore i w dol. Detektor
    NIE zmienia trajektorii, wiec chwila przekroczenia musi lezec miedzy dwiema sasiednimi
    probkami biegu bez detektorow, po wlasciwych stronach progu."""
    uklad = uklady.zbuduj_smib()
    nastawy = _nastawy(integrator, adaptacyjny)
    wielkosc = WIELKOSCI[nazwa]
    bez = _bieg_wzorca_bez_dozorow(integrator, adaptacyjny)
    klucz = wielkosc.klucz_kanalu
    indeksy = [i for i, s in enumerate(bez.strona_probki) if s == "C" and bez.os_czasu_s[i] > 0.06]
    wartosci = [bez.probki[klucz][i] for i in indeksy]
    # Prog na 3/4 zakresu, nie w polowie: dla wielkosci oscylujacej symetrycznie wokol
    # wartosci poczatkowej (f = 50 Hz przed skokiem P_m) polowa zakresu JEST wartoscia
    # poczatkowa, wiec przejscie wypada w pierwszym kroku po skoku — przed pierwsza probka
    # wzorca `C` (zmierzone 2026-09-24: RK4, `f_wezla`). 3/4 zakresu odsuwa oba przejscia
    # od chwili skoku; oscylacja tlumiona wraca ponizej tego poziomu po pierwszym szczycie.
    prog = min(wartosci) + 0.75 * (max(wartosci) - min(wartosci))
    dozory = (
        Dozor("gora", wielkosc, prog, "w_gore", 0.0, False, (), False),
        Dozor("dol", wielkosc, prog, "w_dol", 0.0, False, (), False),
    )
    z = _bieg(uklad, (_skok_mocy(),), dozory, nastawy)
    assert z.probki == bez.probki, "detektor zmienil trajektorie"
    assert z.os_czasu_s == bez.os_czasu_s
    kierunki = {p.kierunek for p in z.przekroczenia if p.t_s > T_SKOKU_S}
    assert kierunki == {"w_gore", "w_dol"}, z.przekroczenia
    for przekroczenie in z.przekroczenia:
        if przekroczenie.t_s <= T_SKOKU_S:
            continue
        assert przekroczenie.wielkosc == klucz
        assert przekroczenie.szerokosc_przedzialu_s <= TOLERANCJA_S or przekroczenie.iteracje == 0
        # Probki C przed i po chwili przekroczenia leza po WLASCIWYCH stronach progu.
        przed = max(i for i in indeksy if bez.os_czasu_s[i] < przekroczenie.t_s)
        po = min(i for i in indeksy if bez.os_czasu_s[i] >= przekroczenie.t_s)
        znak = 1.0 if przekroczenie.kierunek == "w_gore" else -1.0
        assert znak * (bez.probki[klucz][przed] - prog) <= 0.0
        assert znak * (bez.probki[klucz][po] - prog) > 0.0


def test_warunek_spelniony_w_t0_pobudza_w_zerze() -> None:
    uklad = uklady.zbuduj_smib()
    dozory = (
        Dozor("od_poczatku", ModulNapieciaWezla("GEN"), 0.5, "w_gore", 0.0, False, (), True),
        Dozor("nigdy", ModulNapieciaWezla("GEN"), 0.5, "w_dol", 0.0, False, (), True),
    )
    wynik = _bieg(uklad, (), dozory, _nastawy(horyzont_s=0.05))
    (przekroczenie,) = wynik.przekroczenia
    assert (przekroczenie.dozor, przekroczenie.t_s, przekroczenie.szerokosc_przedzialu_s) == (
        "od_poczatku",
        0.0,
        0.0,
    )


@pytest.mark.parametrize("wielkosc", ["stan", "u_wezla"])
def test_przejscie_skokowe_w_chwili_zdarzenia_dokladnie_w_tej_chwili(wielkosc: str) -> None:
    """Zmiana warunku miedzy probka L i P chwili zdarzenia: pobudzenie w chwili zdarzenia,
    szerokosc 0, bez iteracji, `g` przed i po z probek L i P."""
    uklad = uklady.zbuduj_smib()
    if wielkosc == "stan":
        dozor = Dozor(
            "pm", StanUrzadzenia("G1", "p_mechaniczna_pu"), 0.85, "w_gore", 0.0, False, (), True
        )
        zdarzenia: tuple = (_skok_mocy(),)
        t_z = T_SKOKU_S
    else:
        dozor = Dozor("zapad", ModulNapieciaWezla("GEN"), 0.6, "w_dol", 0.0, False, (), True)
        zdarzenia = (ZwarcieWezla(0.1, "GEN", "3F", 0.0, 0.05, 0.15, "samoczynne"),)
        t_z = 0.1
    wynik = _bieg(uklad, zdarzenia, (dozor,), _nastawy(horyzont_s=0.2))
    (przekroczenie,) = wynik.przekroczenia
    assert przekroczenie.t_s == t_z
    assert przekroczenie.szerokosc_przedzialu_s == 0.0
    assert przekroczenie.iteracje == 0


def test_detektor_czestotliwosci_nie_pobudza_sie_w_probkach_chwili_zdarzenia() -> None:
    """f w probkach L/P jest niedostepna — przejscie przez chwile zdarzenia rozstrzyga
    pierwsza ocena PO niej, z uczciwa szerokoscia przedzialu (nie zero)."""
    uklad = uklady.zbuduj_smib()
    zdarzenia = (ZwarcieWezla(0.1, "GEN", "3F", 0.0, 0.05, 0.15, "samoczynne"),)
    bez = _bieg(uklad, zdarzenia, (), _nastawy(horyzont_s=0.3))
    f = [v for v, s in zip(bez.probki["f_hz@GEN"], bez.strona_probki, strict=True) if s == "C"]
    prog = 50.0 + 0.3 * (max(f) - 50.0)
    dozor = Dozor("f", CzestotliwoscElektrycznaWezla("GEN"), prog, "w_gore", 0.0, False, (), False)
    wynik = _bieg(uklad, zdarzenia, (dozor,), _nastawy(horyzont_s=0.3))
    assert wynik.przekroczenia
    chwile_zdarzen = {z.t_wykonany_s for z in wynik.zdarzenia_wykonane}
    for przekroczenie in wynik.przekroczenia:
        assert not (
            przekroczenie.t_s in chwile_zdarzen and przekroczenie.szerokosc_przedzialu_s == 0.0
        ), przekroczenie


@pytest.mark.parametrize(
    ("zwloka", "kasowanie", "wykonana"),
    [(0.0, False, True), (0.1, False, True), (0.1, True, False), (0.02, True, True)],
    ids=["bez_zwloki", "zwloka_bez_kasowania", "zwloka_skasowana", "zwloka_krotsza_od_zapadu"],
)
def test_zwloka_i_kasowanie_przy_zapadzie_krotszym_niz_zwloka(
    zwloka: float, kasowanie: bool, wykonana: bool
) -> None:
    """Zapad 50 ms (zwarcie 0,20-0,25 s): akcja ze zwloka 100 ms wykonuje sie tylko bez
    kasowania; zwloka 20 ms konczy sie przed powrotem, wiec akcja wykonuje sie zawsze."""
    uklad = uklady.zbuduj_smib_dwutorowy()
    zdarzenia = (ZwarcieWezla(0.2, "GEN", "3F", 0.0, 0.2, 0.25, "samoczynne"),)
    dozor = Dozor(
        "zapad",
        ModulNapieciaWezla("GEN"),
        0.8,
        "w_dol",
        zwloka,
        kasowanie,
        (ZmianaGalezi(t_s=0.0, galaz="LINIA2", zalaczona=False),),
        True,
    )
    wynik = _bieg(uklad, zdarzenia, (dozor,), _nastawy(horyzont_s=0.5))
    akcje = [z for z in wynik.zdarzenia_wykonane if z.przyczyna == "dozor:zapad"]
    assert bool(akcje) == wykonana
    if wykonana:
        (akcja,) = akcje
        assert akcja.rodzaj == "wylaczenie_galezi"
        assert akcja.t_zlokalizowany_s == 0.2  # przejscie skokowe w chwili zwarcia
        assert akcja.t_wykonany_s == pytest.approx(0.2 + zwloka, abs=1e-15)
        # Chwila akcji `t* + zwloka` jest liczona w arytmetyce zmiennoprzecinkowej
        # (0,2 + 0,1 = 0,30000000000000004); z punktem siatki 0,3 lezy w granicy rownosci
        # czasu silnika, wiec jest TA SAMA chwila osi — ta sama regula, co dla zdarzenia
        # planowanego wypadajacego na punkt siatki (`silnik.TOLERANCJA_CZASU_S`).
        assert abs(akcja.t_zaplanowany_s - akcja.t_wykonany_s) <= TOLERANCJA_CZASU_S
    kasowania = [
        k
        for k in wynik.slad_white_box["kroki_szczegolne"]
        if k["powod"] == "kasowanie_akcji_dozoru"
    ]
    assert bool(kasowania) == (kasowanie and not wykonana)


@pytest.mark.parametrize("akcja", ["otwarcie_galezi", "odlaczenie_zrodla", "przypisanie_stanu"])
def test_akcja_wykonana_dokladnie_w_chwili_pobudzenia(akcja: str) -> None:
    """Akcja bez zwloki: krok LADUJE w t* (para probek L/P w chwili pobudzenia), wpis
    `zdarzenia_wykonane` niesie przyczyne i pomiar lokalizacji."""
    if akcja == "odlaczenie_zrodla":
        urzadzenie = b.przeksztaltnik_gfl()
        uklad = b.zloz_uklad(urzadzenie, p_pu=0.25)
        zdarzenia: tuple = (
            KomendaRegulacji(t_s=0.05, urzadzenie="PV1", p_mw=15.0, q_mvar=None, u_pu=None),
        )
        wielkosc = MocUrzadzenia("PV1", "p")
        prog = 0.2
        kierunek = "w_dol"
        akcje: tuple = (OdlaczenieZrodla(t_s=0.0, zrodlo="PV1"),)
        nastawy = b.nastawy(
            dt_s=0.002,
            horyzont_s=0.4,
            krok_wyjscia_s=0.01,
            tolerancja_lokalizacji_zdarzen_s=TOLERANCJA_S,
        )
        wynik = SilnikDynamiki(
            uklad.wejscie(
                HarmonogramDynamiki(
                    zdarzenia, (Dozor("d", wielkosc, prog, kierunek, 0.0, False, akcje, True),)
                ),
                nastawy,
            )
        ).uruchom()
    else:
        uklad = uklady.zbuduj_smib_dwutorowy()
        akcje = (
            (ZmianaGalezi(t_s=0.0, galaz="LINIA2", zalaczona=False),)
            if akcja == "otwarcie_galezi"
            else (PrzypisanieStanu(t_s=0.0, urzadzenie="G1", stan="p_mechaniczna_pu", wartosc=0.8),)
        )
        wynik = _bieg(
            uklad,
            (_skok_mocy(),),
            (
                Dozor(
                    "d",
                    StanUrzadzenia("G1", "delta_rad"),
                    PROG_KATA_RAD,
                    "w_gore",
                    0.0,
                    False,
                    akcje,
                    True,
                ),
            ),
            _nastawy(horyzont_s=0.6),
        )
    (wykonana,) = (z for z in wynik.zdarzenia_wykonane if z.przyczyna == "dozor:d")
    assert wykonana.t_wykonany_s == wykonana.t_zlokalizowany_s
    assert wykonana.szerokosc_przedzialu_s <= TOLERANCJA_S
    assert wykonana.iteracje_lokalizacji >= 1
    assert wykonana.g_przed is not None and wykonana.g_przed <= 0.0 < wykonana.g_po
    strony = [
        s
        for t, s in zip(wynik.os_czasu_s, wynik.strona_probki, strict=True)
        if t == wykonana.t_wykonany_s
    ]
    assert strony == ["L", "P"]
    assert wykonana.delta_x_nieprzypisane_max == 0.0


def test_dwa_dozory_o_tym_samym_progu_w_kolejnosci_kanonicznej() -> None:
    """Remis: oba dozory lokalizuja te sama chwile; akcje w kolejnosci indeksu dozoru."""
    uklad = uklady.zbuduj_smib_dwutorowy()
    wielkosc = StanUrzadzenia("G1", "delta_rad")
    dozory = (
        Dozor(
            "pierwszy",
            wielkosc,
            PROG_KATA_RAD,
            "w_gore",
            0.0,
            False,
            (ZmianaGalezi(t_s=0.0, galaz="LINIA2", zalaczona=False),),
            True,
        ),
        Dozor(
            "drugi",
            wielkosc,
            PROG_KATA_RAD,
            "w_gore",
            0.0,
            False,
            (PrzypisanieStanu(t_s=0.0, urzadzenie="G1", stan="p_mechaniczna_pu", wartosc=0.8),),
            True,
        ),
    )
    wynik = _bieg(uklad, (_skok_mocy(),), dozory, _nastawy(horyzont_s=0.6))
    akcje = [z for z in wynik.zdarzenia_wykonane if z.przyczyna.startswith("dozor:")]
    assert [z.przyczyna for z in akcje] == ["dozor:pierwszy", "dozor:drugi"]
    assert akcje[0].t_wykonany_s == akcje[1].t_wykonany_s


def test_petla_pobudzen_w_jednej_chwili_to_odmowa_nazwana() -> None:
    """Dwa dozory przelaczajace nawzajem swoj warunek bez uplywu czasu — odmowa."""
    uklad = uklady.zbuduj_smib()
    p_m = StanUrzadzenia("G1", "p_mechaniczna_pu")
    dozory = (
        Dozor(
            "w_gore",
            p_m,
            0.85,
            "w_gore",
            0.0,
            False,
            (PrzypisanieStanu(t_s=0.0, urzadzenie="G1", stan="p_mechaniczna_pu", wartosc=0.8),),
            False,
        ),
        Dozor(
            "w_dol",
            p_m,
            0.85,
            "w_dol",
            0.0,
            False,
            (PrzypisanieStanu(t_s=0.0, urzadzenie="G1", stan="p_mechaniczna_pu", wartosc=0.9),),
            False,
        ),
    )
    with pytest.raises(OdmowaDynamiki) as blad:
        _bieg(uklad, (), dozory, _nastawy(horyzont_s=0.05))
    assert blad.value.kod == KOD_PETLA_ZDARZEN_WARUNKOWYCH


@pytest.mark.parametrize(
    ("dozor", "kod"),
    [
        (
            Dozor("x", ModulNapieciaWezla("BRAK"), 0.8, "w_dol", 0.0, False, (), True),
            KOD_ZDARZENIE_BEZ_ELEMENTU,
        ),
        (
            Dozor("x", ModulPraduZacisku("BRAK", "od"), 0.8, "w_dol", 0.0, False, (), True),
            KOD_ZDARZENIE_BEZ_ELEMENTU,
        ),
        (
            Dozor("x", StanUrzadzenia("G1", "brak_pu"), 0.8, "w_dol", 0.0, False, (), True),
            KOD_ZDARZENIE_BEZ_ELEMENTU,
        ),
        (
            Dozor("x", MocUrzadzenia("BRAK", "p"), 0.8, "w_dol", 0.0, False, (), True),
            KOD_ZDARZENIE_BEZ_ELEMENTU,
        ),
        (
            Dozor(
                "x",
                ModulNapieciaWezla("GEN"),
                0.8,
                "w_dol",
                0.0,
                False,
                (ZmianaGalezi(t_s=0.0, galaz="BRAK", zalaczona=False),),
                True,
            ),
            KOD_ZDARZENIE_BEZ_ELEMENTU,
        ),
    ],
    ids=["wezel", "galaz", "stan", "urzadzenie", "akcja"],
)
def test_wielkosc_albo_akcja_spoza_modelu_to_odmowa_przed_biegiem(dozor: Dozor, kod: str) -> None:
    with pytest.raises(OdmowaDynamiki) as blad:
        _bieg(uklady.zbuduj_smib(), (), (dozor,), _nastawy(horyzont_s=0.05))
    assert blad.value.kod == kod


@pytest.mark.parametrize(
    "tworz",
    [
        lambda: Dozor("x", ModulNapieciaWezla("GEN"), float("nan"), "w_dol", 0.0, False, (), True),
        lambda: Dozor("x", ModulNapieciaWezla("GEN"), 0.8, "w_boki", 0.0, False, (), True),  # type: ignore[arg-type]
        lambda: Dozor("x", ModulNapieciaWezla("GEN"), 0.8, "w_dol", -0.1, False, (), True),
        lambda: Dozor(
            "x",
            ModulNapieciaWezla("GEN"),
            0.8,
            "w_dol",
            0.0,
            True,
            (OdlaczenieZrodla(t_s=0.0, zrodlo="G1"),),
            True,
        ),
        lambda: Dozor("x", ModulNapieciaWezla("GEN"), 0.8, "w_dol", 0.1, True, (), True),
        lambda: Dozor(
            "x",
            ModulNapieciaWezla("GEN"),
            0.8,
            "w_dol",
            0.0,
            False,
            (ZwarcieWezla(0.0, "GEN", "3F", 0.0, 0.1, None, None),),
            True,
        ),
        lambda: Dozor(
            "x",
            ModulNapieciaWezla("GEN"),
            0.8,
            "w_dol",
            0.0,
            False,
            (OdlaczenieZrodla(t_s=0.3, zrodlo="G1"),),
            True,
        ),
    ],
    ids=[
        "prog_nan",
        "kierunek",
        "zwloka_ujemna",
        "kasowanie_bez_zwloki",
        "kasowanie_w_detektorze",
        "akcja_trwala",
        "chwila_akcji_niezerowa",
    ],
)
def test_specyfikacja_dozoru_sprzeczna_to_odmowa(tworz) -> None:
    with pytest.raises(OdmowaDynamiki) as blad:
        tworz()
    assert blad.value.kod == KOD_ZDARZENIE_SPRZECZNE


def test_powtorzony_identyfikator_dozoru_to_odmowa() -> None:
    dozor = Dozor("x", ModulNapieciaWezla("GEN"), 0.8, "w_dol", 0.0, False, (), True)
    with pytest.raises(OdmowaDynamiki) as blad:
        _bieg(uklady.zbuduj_smib(), (), (dozor, dozor), _nastawy(horyzont_s=0.05))
    assert blad.value.kod == KOD_ZDARZENIE_SPRZECZNE


def test_dozory_bez_tolerancji_lokalizacji_to_odmowa_nastaw() -> None:
    dozor = Dozor("x", ModulNapieciaWezla("GEN"), 0.8, "w_dol", 0.0, False, (), True)
    with pytest.raises(OdmowaDynamiki) as blad:
        _bieg(uklady.zbuduj_smib(), (), (dozor,), _nastawy(horyzont_s=0.05, tolerancja=None))
    assert blad.value.kod == KOD_NASTAWY_SPRZECZNE


def test_dozor_wchodzi_do_odcisku_harmonogramu() -> None:
    from network_model.solvers.dynamika.tozsamosc import odcisk_harmonogramu

    dozor = Dozor("x", ModulNapieciaWezla("GEN"), 0.8, "w_dol", 0.0, False, (), True)
    inny = Dozor("x", ModulNapieciaWezla("GEN"), 0.81, "w_dol", 0.0, False, (), True)
    bez = odcisk_harmonogramu(HarmonogramDynamiki(()))
    assert odcisk_harmonogramu(HarmonogramDynamiki((), (dozor,))) != bez
    assert odcisk_harmonogramu(HarmonogramDynamiki((), (dozor,))) != odcisk_harmonogramu(
        HarmonogramDynamiki((), (inny,))
    )


_PROGRAM = (
    "import json,sys;"
    f"sys.path[:0]=[{str(KORZEN_BACKENDU / 'src')!r},{str(KORZEN_BACKENDU)!r}];"
    "from tests.network_model.dynamika import test_dozory as t;"
    "w=t._bieg_deterministyczny();"
    "print(json.dumps([[p.t_s, p.szerokosc_przedzialu_s] for p in w.przekroczenia]"
    " + [[z.t_wykonany_s, z.t_zlokalizowany_s] for z in w.zdarzenia_wykonane]"
    " + [w.probki['delta_rad@G1']]))"
)


def _bieg_deterministyczny():
    uklad = uklady.zbuduj_smib_dwutorowy()
    dozory = (
        Dozor(
            "gora",
            StanUrzadzenia("G1", "delta_rad"),
            PROG_KATA_RAD,
            "w_gore",
            0.0,
            False,
            (),
            False,
        ),
        # Prad zacisku `do` LINIA1 po skoku P_m: 0,402 -> szczyt 0,502 pu (pomiar 2026-09-24);
        # prog 0,47 pu jest przecinany w pierwszym wahnieciu i trwa dluzej niz zwloka 20 ms,
        # wiec bieg ma akcje (otwarcie LINIA2) — determinizm dotyczy biegu Z akcja, nie pustego.
        Dozor(
            "akcja",
            ModulPraduZacisku("LINIA1", "do"),
            0.47,
            "w_gore",
            0.02,
            True,
            (ZmianaGalezi(t_s=0.0, galaz="LINIA2", zalaczona=False),),
            True,
        ),
    )
    return _bieg(uklad, (_skok_mocy(),), dozory, _nastawy(horyzont_s=0.5))


@pytest.mark.parametrize("ziarno", ["0", "1", "2"])
def test_wynik_z_dozorami_nie_zalezy_od_pythonhashseed(ziarno: str) -> None:
    proces = subprocess.run(
        [sys.executable, "-c", _PROGRAM],
        cwd=str(KORZEN_BACKENDU),
        env=dict(os.environ, PYTHONHASHSEED=ziarno),
        capture_output=True,
        text=True,
        timeout=900,
    )
    assert proces.returncode == 0, proces.stderr[-800:]
    w = _bieg_deterministyczny()
    assert w.przekroczenia, "bieg wzorca bez przekroczen — determinizm bylby pusty"
    assert any(z.przyczyna == "dozor:akcja" for z in w.zdarzenia_wykonane), "bieg bez akcji"
    wzorzec = (
        [[p.t_s, p.szerokosc_przedzialu_s] for p in w.przekroczenia]
        + [[z.t_wykonany_s, z.t_zlokalizowany_s] for z in w.zdarzenia_wykonane]
        + [w.probki["delta_rad@G1"]]
    )
    assert json.loads(proces.stdout) == json.loads(json.dumps(wzorzec))
