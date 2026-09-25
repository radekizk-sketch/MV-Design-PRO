"""Przypisanie stanu, komenda regulacji P/Q/U i czesciowa utrata zrodla (karta AB-1b.1, P6).

ILOCZYN CECH (CLAUDE.md „KLASA, NIE INSTANCJA" p. 2), nie przyklad z karty:

* {rodzina urzadzenia} x {P, Q, U} — tablica odwzorowania komendy na stan-odniesienie z
  DEKLARACJI klasy (`nastawy_regulacji`) albo odmowa `dynamika.nastawa_nieobslugiwana`;
  kazda obslugiwana para jest WYKONANA w biegu (przypisanie z adresem, przed i po;
  stany nieprzypisane bitowo ciagle),
* {w zakresie nastawy, na granicy, poza nia — odmowa} dla rodzin z oknem mocy,
* {jednoczesnie ze zdarzeniem topologicznym w tej samej chwili} — jedna chwila, jedna
  re-inicjalizacja, przypisanie na urzadzeniach PO zdarzeniach topologicznych,
* stan spoza `stany_przypisywalne`, wartosc nieskonczona, wartosc poza ogranicznikiem,
* czesciowa utrata x {GFL, GFM, magazyn GFL/GFM, synchroniczna, wiatr 3/4} x {udzial
  malejacy, rosnacy — odmowa, rowny — odmowa, po odlaczeniu — odmowa} oraz szyna sztywna
  i zrodlo testowe — odmowa (nie sa agregatami jednostek); komenda po utracie dzieli
  nastawe mocy przez udzial.

Rownowaznosc agregatu i utrata jako zaklocenie wyspy (twierdzenie D-20) oraz ciaglosc
stanow przy przypisaniu wobec wyroczni (D-13): `tests/walidacja_fizyczna/
test_zdarzenia_rdzenia.py` i bramki G18/G21.
"""

from __future__ import annotations

import math

import numpy as np
import pytest
from network_model.solvers.dynamika import (
    HarmonogramDynamiki,
    KomendaRegulacji,
    OdlaczenieZrodla,
    OdmowaDynamiki,
    PrzypisanieStanu,
    SilnikDynamiki,
    UtrataCzesciowaZrodla,
    ZmianaGalezi,
)
from network_model.solvers.dynamika.kontrakty import (
    KOD_NASTAWA_NIEOBSLUGIWANA,
    KOD_PUNKT_PRACY_POZA_OGRANICZENIEM,
    KOD_UDZIAL_ZRODLA_NIEDOZWOLONY,
    KOD_ZDARZENIE_PRZYPISANIA_NIEDOZWOLONE,
    KOD_ZDARZENIE_SPRZECZNE,
    WIELKOSCI_NASTAW,
)
from network_model.solvers.dynamika.silnik import ZALOZENIE_PRZYPISANIA_STANU
from network_model.solvers.dynamika.urzadzenia import (
    UrzadzenieCzesciowe,
    UrzadzenieOdlaczone,
    zbuduj_zrodlo_testowe,
)
from network_model.solvers.dynamika.zdarzenia import (
    nastawa_regulacji,
    sprawdz_przypisanie,
    zbuduj_harmonogram,
)

from tests.network_model.dynamika import biblioteka_urzadzen as b
from tests.network_model.dynamika import uklady

#: Rodzina -> (fabryka urzadzenia, moc czynna punktu pracy [pu]) — te same punkty pracy,
#: co przebiegi biblioteki (`test_biblioteka_przebiegi`).
RODZINY = {
    "synchroniczna_AVR_TGOV1": (
        lambda: b.maszyna(z_wzbudzeniem=True, z_turbina=True, z_stabilizatorem=True),
        0.8,
    ),
    "synchroniczna_bez_regulatorow": (lambda: b.maszyna(), 0.8),
    "gfl": (lambda: b.przeksztaltnik_gfl(), 0.25),
    "gfm_statyzm": (lambda: b.przeksztaltnik_gfm(tryb="droop"), 0.3),
    "gfm_vsm": (lambda: b.przeksztaltnik_gfm(tryb="vsm"), 0.3),
    "magazyn_gfl": (lambda: b.magazyn(), 0.2),
    "magazyn_gfm": (lambda: b.magazyn(rdzen=b.rdzen_gfm(tryb="vsm")), 0.2),
    "wiatr_typ_3": (lambda: b.turbina(typ="wiatr_typ_3", crowbar=b.crowbar_typowy()), 0.2),
    "wiatr_typ_4": (lambda: b.turbina(), 0.2),
}

#: Tablica odwzorowania karty (par. 0 pkt 9): rodzina -> stan-odniesienie P, Q, U (None =
#: odmowa nazwana). Wpisana JAWNIE — test pilnuje, ze deklaracje klas sie z nia zgadzaja.
TABLICA: dict[str, tuple[str | None, str | None, str | None]] = {
    "synchroniczna_AVR_TGOV1": ("turbina_odniesienie_pu", None, "wzbudzenie_odniesienie_pu"),
    "synchroniczna_bez_regulatorow": ("p_mechaniczna_pu", None, None),
    "gfl": ("p_zadane_pu", "q_zadane_pu", "u_odniesienia_pu"),
    "gfm_statyzm": ("p_zadane_pu", "q_zadane_pu", "u_odniesienia_pu"),
    "gfm_vsm": ("p_zadane_pu", "q_zadane_pu", "u_odniesienia_pu"),
    "magazyn_gfl": ("p_zadane_pu", "q_zadane_pu", "u_odniesienia_pu"),
    "magazyn_gfm": ("p_zadane_pu", "q_zadane_pu", "u_odniesienia_pu"),
    "wiatr_typ_3": (None, "q_zadane_pu", "u_odniesienia_pu"),
    "wiatr_typ_4": (None, "q_zadane_pu", "u_odniesienia_pu"),
    "maszyna_klasyczna": ("p_mechaniczna_pu", None, None),
    "szyna_sztywna": (None, None, None),
    "zrodlo_testowe": (None, None, None),
    "odlaczone": (None, None, None),
}

T_KOMENDY_S = 0.1


def _urzadzenie(rodzina: str):
    if rodzina in RODZINY:
        return RODZINY[rodzina][0]()
    if rodzina == "maszyna_klasyczna":
        return uklady._maszyna(2.0, 0.01)
    if rodzina == "szyna_sztywna":
        return uklady._szyna()
    if rodzina == "zrodlo_testowe":
        return zbuduj_zrodlo_testowe(
            ident="ZT", wezel="SYS", impedancja_pu=complex(0.0, 0.05), f_bazowa_hz=50.0
        )
    return UrzadzenieOdlaczone(uklady._maszyna(2.0, 0.01))


def _bieg(urzadzenie, p_pu: float, zdarzenia: tuple, horyzont_s: float = 0.2):
    uklad = b.zloz_uklad(urzadzenie, p_pu=p_pu)
    return SilnikDynamiki(
        uklad.wejscie(
            HarmonogramDynamiki(zdarzenia),
            b.nastawy(dt_s=0.002, horyzont_s=horyzont_s, krok_wyjscia_s=0.01),
        )
    ).uruchom()


def _stan_poczatkowy(rodzina: str) -> tuple[object, np.ndarray, float]:
    fabryka, p_pu = RODZINY[rodzina]
    urzadzenie = fabryka()
    uklad = b.zloz_uklad(urzadzenie, p_pu=p_pu)
    return urzadzenie, urzadzenie.stan_poczatkowy(uklad.napiecie_gen_pu, uklad.moc_gen_pu), p_pu


# --------------------------------------------------------------------------- tablica
@pytest.mark.parametrize("rodzina", sorted(TABLICA))
@pytest.mark.parametrize("wielkosc", WIELKOSCI_NASTAW)
def test_tablica_odwzorowania_komendy_na_stan(rodzina: str, wielkosc: str) -> None:
    """Deklaracja klasy == tablica karty; brak stanu = odmowa NAZWANA z powodem z deklaracji."""
    urzadzenie = _urzadzenie(rodzina)
    oczekiwany = TABLICA[rodzina][WIELKOSCI_NASTAW.index(wielkosc)]  # type: ignore[arg-type]
    if oczekiwany is None:
        with pytest.raises(OdmowaDynamiki) as blad:
            nastawa_regulacji(urzadzenie, wielkosc, 0.5)  # type: ignore[arg-type]
        assert blad.value.kod == KOD_NASTAWA_NIEOBSLUGIWANA
        assert blad.value.szczegoly["wielkosc"] == wielkosc
        assert blad.value.szczegoly["powod"]
    else:
        assert nastawa_regulacji(urzadzenie, wielkosc, 0.5) == oczekiwany  # type: ignore[arg-type]


@pytest.mark.parametrize("rodzina", sorted(TABLICA))
def test_deklaracja_nastaw_jest_kompletna_i_spojna(rodzina: str) -> None:
    """Trzy pozycje w kolejnosci P, Q, U; stan obslugiwany nalezy do stanow przypisywalnych;
    stany przypisywalne sa stanami urzadzenia (deklaracja z przypietym testem, nie zdanie)."""
    urzadzenie = _urzadzenie(rodzina)
    nastawy = urzadzenie.nastawy_regulacji
    assert tuple(nastawa.wielkosc for nastawa in nastawy) == WIELKOSCI_NASTAW
    assert set(urzadzenie.stany_przypisywalne) <= set(urzadzenie.nazwy_stanow)
    for nastawa in nastawy:
        assert nastawa.mnoznik > 0.0
        if nastawa.stan is None:
            assert nastawa.powod_pl.strip()
        else:
            assert nastawa.stan in urzadzenie.stany_przypisywalne
    for zakazany in ("delta_rad", "omega_pu", "soc_pu", "kat_rad", "pll_kat_rad"):
        assert zakazany not in urzadzenie.stany_przypisywalne


@pytest.mark.parametrize(
    ("rodzina", "wielkosc"),
    [
        (rodzina, wielkosc)
        for rodzina in sorted(RODZINY)
        for wielkosc, stan in zip(WIELKOSCI_NASTAW, TABLICA[rodzina], strict=True)
        if stan is not None
    ],
)
def test_komenda_wykonana_na_kazdej_rodzinie(rodzina: str, wielkosc: str) -> None:
    """Kazda obslugiwana para (rodzina, wielkosc) WYKONANA w biegu: przypisanie z adresem,
    wartoscia przed i po (MW/Mvar przeliczone w rdzeniu), stany nieprzypisane bitowo ciagle."""
    urzadzenie, stan0, p_pu = _stan_poczatkowy(rodzina)
    stan = TABLICA[rodzina][WIELKOSCI_NASTAW.index(wielkosc)]  # type: ignore[arg-type]
    assert stan is not None
    przed = float(stan0[urzadzenie.nazwy_stanow.index(stan)])
    nowa_pu = przed - 0.01 if wielkosc == "p" else przed + 0.01
    komenda = KomendaRegulacji(
        t_s=T_KOMENDY_S,
        urzadzenie=urzadzenie.ident,
        p_mw=nowa_pu * b.S_BAZOWA_MVA if wielkosc == "p" else None,
        q_mvar=nowa_pu * b.S_BAZOWA_MVA if wielkosc == "q" else None,
        u_pu=nowa_pu if wielkosc == "u" else None,
    )
    wynik = _bieg(urzadzenie, p_pu, (komenda,))
    (zdarzenie,) = wynik.zdarzenia_wykonane
    assert zdarzenie.rodzaj == "komenda_regulacji"
    assert zdarzenie.przyczyna == "harmonogram"
    (przypisanie,) = zdarzenie.przypisania
    assert przypisanie.adres == f"{urzadzenie.ident}.{stan}"
    assert przypisanie.po == pytest.approx(nowa_pu, rel=1e-15, abs=1e-15)
    assert przypisanie.przed == pytest.approx(przed, rel=1e-9, abs=1e-12)
    assert zdarzenie.delta_x_nieprzypisane_max == 0.0
    assert zdarzenie.residuum_kcl_max < 1e-9
    assert ZALOZENIE_PRZYPISANIA_STANU in wynik.zalozenia
    i_p = wynik.os_czasu_s.index(T_KOMENDY_S) + 1
    assert wynik.strona_probki[i_p] == "P"
    assert wynik.probki[f"{stan}@{urzadzenie.ident}"][i_p] == przypisanie.po


# --------------------------------------------------------------------------- zakres nastawy
@pytest.mark.parametrize(
    "rodzina",
    ["gfl", "gfm_statyzm", "gfm_vsm", "magazyn_gfl", "magazyn_gfm", "synchroniczna_AVR_TGOV1"],
)
@pytest.mark.parametrize("polozenie", ["granica_gorna", "granica_dolna", "ponad", "ponizej"])
def test_komenda_P_wobec_zakresu_urzadzenia(rodzina: str, polozenie: str) -> None:
    """Zakres nastawy P = TEN SAM predykat, co punkt poczatkowy (okno mocy, granice turbiny):
    granica przyjeta (przedzial domkniety), poza nia — odmowa, nie ciche nasycenie."""
    urzadzenie, _, p_pu = _stan_poczatkowy(rodzina)
    (nastawa,) = (n for n in urzadzenie.nastawy_regulacji if n.wielkosc == "p")
    assert nastawa.zakres is not None
    dol, gora = nastawa.zakres
    wartosc = {
        "granica_gorna": gora,
        "granica_dolna": dol,
        "ponad": gora + 0.01,
        "ponizej": dol - 0.01,
    }[polozenie]
    # Moc w MW tak, jak poda ja projektant (liczba „okragla"): przeliczenie MW -> pu robi
    # rdzen, a granica okna powstaje z tej samej liczby MW, wiec granica trafia bitowo.
    komenda = KomendaRegulacji(
        t_s=T_KOMENDY_S,
        urzadzenie=urzadzenie.ident,
        p_mw=round(wartosc * b.S_BAZOWA_MVA, 9),
        q_mvar=None,
        u_pu=None,
    )
    if polozenie.startswith("granica"):
        wynik = _bieg(urzadzenie, p_pu, (komenda,), horyzont_s=0.12)
        (zdarzenie,) = wynik.zdarzenia_wykonane
        assert zdarzenie.przypisania[0].po == pytest.approx(wartosc, abs=1e-15)
        return
    with pytest.raises(OdmowaDynamiki) as blad:
        _bieg(urzadzenie, p_pu, (komenda,), horyzont_s=0.12)
    assert blad.value.kod == KOD_PUNKT_PRACY_POZA_OGRANICZENIEM
    assert blad.value.szczegoly["zakres"] == (dol, gora)


# --------------------------------------------------------------------------- odmowy przypisania
@pytest.mark.parametrize(
    ("rodzina", "stan"),
    [
        ("maszyna_klasyczna", "delta_rad"),
        ("maszyna_klasyczna", "omega_pu"),
        ("maszyna_klasyczna", "sem_modul_pu"),
        ("magazyn_gfl", "soc_pu"),
        ("gfl", "pll_kat_rad"),
        ("gfm_vsm", "omega_pu"),
        ("synchroniczna_AVR_TGOV1", "eq_prim_pu"),
        ("wiatr_typ_4", "p_zadane_pu"),
        ("szyna_sztywna", "sem_re_pu"),
        ("zrodlo_testowe", "sem_kat_rad"),
        ("gfl", "stan_ktorego_nie_ma"),
    ],
)
def test_przypisanie_stanu_spoza_deklaracji_to_odmowa_przed_biegiem(
    rodzina: str, stan: str
) -> None:
    """Strumien, kat, predkosc, stan naladowania — nigdy (skok wymagalby nieskonczonej
    wielkosci fizycznej); odmowa pada przy budowie harmonogramu, przed pierwszym krokiem."""
    urzadzenie = _urzadzenie(rodzina)
    zdarzenie = PrzypisanieStanu(t_s=0.1, urzadzenie=urzadzenie.ident, stan=stan, wartosc=0.5)
    with pytest.raises(OdmowaDynamiki) as blad:
        zbuduj_harmonogram(
            HarmonogramDynamiki((zdarzenie,)),
            wezly=(),
            galezie=(),
            odsprzegi=(),
            odbiory=(),
            urzadzenia=(urzadzenie,),
            s_bazowa_mva=100.0,
            horyzont_s=1.0,
        )
    assert blad.value.kod == KOD_ZDARZENIE_PRZYPISANIA_NIEDOZWOLONE
    assert blad.value.szczegoly["stan"] == stan


@pytest.mark.parametrize("wartosc", [math.nan, math.inf, -math.inf])
@pytest.mark.parametrize("przez", ["przypisanie", "komenda"])
def test_wartosc_nieskonczona_to_odmowa(wartosc: float, przez: str) -> None:
    uklad = uklady.zbuduj_smib()
    zdarzenie = (
        PrzypisanieStanu(t_s=0.1, urzadzenie="G1", stan="p_mechaniczna_pu", wartosc=wartosc)
        if przez == "przypisanie"
        else KomendaRegulacji(t_s=0.1, urzadzenie="G1", p_mw=wartosc, q_mvar=None, u_pu=None)
    )
    with pytest.raises(OdmowaDynamiki) as blad:
        SilnikDynamiki(
            uklad.wejscie(HarmonogramDynamiki((zdarzenie,)), uklady.nastawy(horyzont_s=0.2))
        ).uruchom()
    assert blad.value.kod == KOD_ZDARZENIE_SPRZECZNE


def test_komenda_bez_zadnej_wielkosci_to_odmowa() -> None:
    with pytest.raises(OdmowaDynamiki) as blad:
        KomendaRegulacji(t_s=0.1, urzadzenie="G1", p_mw=None, q_mvar=None, u_pu=None)
    assert blad.value.kod == KOD_ZDARZENIE_SPRZECZNE


def test_przypisanie_poza_ogranicznikiem_stanu_to_odmowa() -> None:
    """Amplituda zrodla testowego ma ogranicznik [0, inf): wartosc ujemna to odmowa, a nie
    przyciecie po cichu — ten sam predykat dla kazdego stanu z ogranicznikiem."""
    zrodlo = _urzadzenie("zrodlo_testowe")
    with pytest.raises(OdmowaDynamiki) as blad:
        sprawdz_przypisanie(zrodlo, "sem_modul_pu", -0.1, 0.3)
    assert blad.value.kod == KOD_ZDARZENIE_SPRZECZNE
    sprawdz_przypisanie(zrodlo, "sem_modul_pu", 0.0, 0.3)


# --------------------------------------------------------------------------- ta sama chwila
@pytest.mark.parametrize("kolejnosc", ["topologia_pierwsza", "przypisanie_pierwsze"])
def test_przypisanie_i_zdarzenie_topologiczne_w_tej_samej_chwili(kolejnosc: str) -> None:
    """Jedna chwila, jedna re-inicjalizacja; przypisanie na urzadzeniach po zdarzeniach
    topologicznych; kolejnosc zapisu nie zmienia skutku (przypisania ida po topologii)."""
    uklad = uklady.zbuduj_smib_dwutorowy()
    otwarcie = ZmianaGalezi(t_s=0.2, galaz="LINIA2", zalaczona=False)
    przypisanie = PrzypisanieStanu(t_s=0.2, urzadzenie="G1", stan="p_mechaniczna_pu", wartosc=0.6)
    zdarzenia = (
        (otwarcie, przypisanie) if kolejnosc == "topologia_pierwsza" else (przypisanie, otwarcie)
    )
    wynik = SilnikDynamiki(
        uklad.wejscie(
            HarmonogramDynamiki(zdarzenia),
            uklady.nastawy(dt_s=0.001, horyzont_s=0.4, krok_wyjscia_s=0.01),
        )
    ).uruchom()
    assert [z.t_wykonany_s for z in wynik.zdarzenia_wykonane] == [0.2, 0.2]
    pomiary = {z.delta_x_nieprzypisane_max for z in wynik.zdarzenia_wykonane}
    assert pomiary == {0.0}
    (wpis,) = (z for z in wynik.zdarzenia_wykonane if z.rodzaj == "przypisanie_stanu")
    assert wpis.przypisania[0].po == 0.6
    chwile = [k for k in wynik.slad_white_box["kroki_szczegolne"] if k["powod"] == "zdarzenie"]
    assert len(chwile) == 1, "jedna chwila zdarzen = jedna re-inicjalizacja"
    strony = [s for t, s in zip(wynik.os_czasu_s, wynik.strona_probki, strict=True) if t == 0.2]
    assert strony == ["L", "P"]


@pytest.mark.parametrize("kolejnosc", ["odlaczenie_pierwsze", "komenda_pierwsza"])
def test_komenda_do_urzadzenia_odlaczonego_w_tej_samej_chwili_to_odmowa(kolejnosc: str) -> None:
    """Urzadzenie odlaczone w tej chwili nie ma nastaw — niezaleznie od kolejnosci zapisu,
    bo przypisania ida na urzadzeniach PO zdarzeniach topologicznych chwili."""
    urzadzenie, stan0, p_pu = _stan_poczatkowy("gfl")
    odlaczenie = OdlaczenieZrodla(t_s=0.1, zrodlo=urzadzenie.ident)
    komenda = KomendaRegulacji(
        t_s=0.1, urzadzenie=urzadzenie.ident, p_mw=None, q_mvar=1.0, u_pu=None
    )
    zdarzenia = (
        (odlaczenie, komenda) if kolejnosc == "odlaczenie_pierwsze" else (komenda, odlaczenie)
    )
    with pytest.raises(OdmowaDynamiki) as blad:
        _bieg(urzadzenie, p_pu, zdarzenia)
    assert blad.value.kod == KOD_NASTAWA_NIEOBSLUGIWANA
    assert "odlaczone" in blad.value.szczegoly["powod"]


# --------------------------------------------------------------------------- czesciowa utrata
RODZINY_AGREGATOW = (
    "gfl",
    "gfm_statyzm",
    "gfm_vsm",
    "magazyn_gfl",
    "magazyn_gfm",
    "synchroniczna_AVR_TGOV1",
    "wiatr_typ_3",
    "wiatr_typ_4",
)


@pytest.mark.parametrize("rodzina", RODZINY_AGREGATOW)
def test_czesciowa_utrata_malejaco_skaluje_prad_i_zachowuje_stany(rodzina: str) -> None:
    """Udzial 0,8 -> 0,5: moc oddawana w probce P skaluje sie udzialem, stany bez skoku."""
    urzadzenie, _, p_pu = _stan_poczatkowy(rodzina)
    zdarzenia = (
        UtrataCzesciowaZrodla(t_s=0.1, zrodlo=urzadzenie.ident, udzial_pozostaly=0.8),
        UtrataCzesciowaZrodla(t_s=0.15, zrodlo=urzadzenie.ident, udzial_pozostaly=0.5),
    )
    wynik = _bieg(urzadzenie, p_pu, zdarzenia)
    assert [z.rodzaj for z in wynik.zdarzenia_wykonane] == ["utrata_czesciowa_zrodla"] * 2
    assert {z.delta_x_nieprzypisane_max for z in wynik.zdarzenia_wykonane} == {0.0}
    from network_model.solvers.dynamika.silnik import ZALOZENIE_UTRATY_CZESCIOWEJ

    assert ZALOZENIE_UTRATY_CZESCIOWEJ in wynik.zalozenia
    for t_s in (0.1, 0.15):
        lewa = [
            i
            for i, (t, s) in enumerate(zip(wynik.os_czasu_s, wynik.strona_probki, strict=True))
            if t == t_s and s == "L"
        ][0]
        for nazwa in urzadzenie.nazwy_stanow:
            klucz = f"{nazwa}@{urzadzenie.ident}"
            assert wynik.probki[klucz][lewa + 1] == wynik.probki[klucz][lewa], klucz


@pytest.mark.parametrize("rodzina", RODZINY_AGREGATOW)
@pytest.mark.parametrize("przypadek", ["rosnacy", "rowny", "po_odlaczeniu"])
def test_czesciowa_utrata_niedozwolona_to_odmowa_przed_biegiem(
    rodzina: str, przypadek: str
) -> None:
    urzadzenie, _, p_pu = _stan_poczatkowy(rodzina)
    ident = urzadzenie.ident
    pierwszy = (
        OdlaczenieZrodla(t_s=0.1, zrodlo=ident)
        if przypadek == "po_odlaczeniu"
        else UtrataCzesciowaZrodla(t_s=0.1, zrodlo=ident, udzial_pozostaly=0.5)
    )
    drugi = UtrataCzesciowaZrodla(
        t_s=0.15, zrodlo=ident, udzial_pozostaly={"rosnacy": 0.8}.get(przypadek, 0.5)
    )
    with pytest.raises(OdmowaDynamiki) as blad:
        _bieg(urzadzenie, p_pu, (pierwszy, drugi))
    assert blad.value.kod == KOD_UDZIAL_ZRODLA_NIEDOZWOLONY
    # Odmowa PRZED biegiem — ta sama przy zdarzeniu w tej samej chwili co odlaczenie.
    assert blad.value.szczegoly["t_s"] == 0.15


@pytest.mark.parametrize("rodzina", ["szyna_sztywna", "zrodlo_testowe"])
def test_czesciowa_utrata_urzadzenia_niebedacego_agregatem_to_odmowa(rodzina: str) -> None:
    """Ekwiwalent sieci nadrzednej i zrodlo testowe nie sa agregatami jednostek — ubytek ich
    „czesci" nie opisuje zadnego zjawiska (odmowa przy budowie harmonogramu)."""
    urzadzenie = _urzadzenie(rodzina)
    assert urzadzenie.agregat_jednostek is False
    with pytest.raises(OdmowaDynamiki) as blad:
        zbuduj_harmonogram(
            HarmonogramDynamiki(
                (UtrataCzesciowaZrodla(t_s=0.1, zrodlo=urzadzenie.ident, udzial_pozostaly=0.5),)
            ),
            wezly=(),
            galezie=(),
            odsprzegi=(),
            odbiory=(),
            urzadzenia=(urzadzenie,),
            s_bazowa_mva=100.0,
            horyzont_s=1.0,
        )
    assert blad.value.kod == KOD_UDZIAL_ZRODLA_NIEDOZWOLONY


@pytest.mark.parametrize("udzial", [1.0, 0.0, -0.2, 1.5, math.nan])
def test_udzial_poza_przedzialem_otwartym_to_odmowa(udzial: float) -> None:
    with pytest.raises(OdmowaDynamiki) as blad:
        UtrataCzesciowaZrodla(t_s=0.1, zrodlo="PV1", udzial_pozostaly=udzial)
    assert blad.value.kod == KOD_UDZIAL_ZRODLA_NIEDOZWOLONY


@pytest.mark.parametrize("wielkosc", ["p", "q", "u"])
def test_komenda_po_czesciowej_utracie_dotyczy_jednostek_pozostalych(wielkosc: str) -> None:
    """Stany opisuja agregat WSZYSTKICH jednostek: nastawa mocy P/Q wydana po utracie jest
    dzielona przez udzial (mnoznik 1/u z deklaracji opakowania), nastawa napiecia — nie."""
    urzadzenie, stan0, p_pu = _stan_poczatkowy("gfl")
    udzial = 0.5
    zadana = {"p": 0.1, "q": 0.02, "u": 1.03}[wielkosc]
    zdarzenia = (
        UtrataCzesciowaZrodla(t_s=0.1, zrodlo=urzadzenie.ident, udzial_pozostaly=udzial),
        KomendaRegulacji(
            t_s=0.12,
            urzadzenie=urzadzenie.ident,
            p_mw=zadana * 100.0 if wielkosc == "p" else None,
            q_mvar=zadana * 100.0 if wielkosc == "q" else None,
            u_pu=zadana if wielkosc == "u" else None,
        ),
    )
    wynik = _bieg(urzadzenie, p_pu, zdarzenia)
    komenda = wynik.zdarzenia_wykonane[-1]
    oczekiwana = zadana / udzial if wielkosc in ("p", "q") else zadana
    assert komenda.przypisania[0].po == pytest.approx(oczekiwana, rel=1e-15)
    opakowanie = UrzadzenieCzesciowe(urzadzenie, udzial)
    (nastawa,) = (n for n in opakowanie.nastawy_regulacji if n.wielkosc == wielkosc)
    assert nastawa.mnoznik == (1.0 / udzial if wielkosc in ("p", "q") else 1.0)
