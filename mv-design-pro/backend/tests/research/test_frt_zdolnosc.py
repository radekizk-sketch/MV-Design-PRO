"""FRT: kontrakt szeregu, kwantyfikator ∀ przyłączenia, prawo znaku, manifest, odbudowa.

PO CO TEN PLIK. Audyt kontradyktoryjny wykazał kolejno dwie fale defektów, z
których każdy otwierał ocenę FRT w tę samą stronę — w stronę werdyktu
pozytywnego.

FALA 2 (pokrycie okna, dokładne minimum, przyłączenie, trwała odbudowa):

  1. przebieg kończył się przed końcem wymaganego okna (0,4 s danych oceniane
     jako spełnienie wymagania na 2 s);
  2. margines liczony był WYŁĄCZNIE w chwilach próbek przebiegu, więc załamanie
     obwiedni wypadające między dwiema próbkami było niewidoczne;
  3. moduł mógł się odłączyć w trakcie zapadu, a ocena tego nie widziała, bo
     „brak sygnału wyłączenia" czytano jako „był przyłączony";
  4. odbudowa mocy była pierwszą próbką powyżej progu, więc jednopróbkowy
     przeskok liczył się jak odbudowa.

FALA 3 (pięć luk fail-open, każda o innej naturze):

  5. ``np.interp`` poza nośnikiem zwraca wartość brzegową — ocena prądu biernego
     FABRYKOWAŁA przebieg po końcu danych;
  6. jedna próbka ``True`` stanu przyłączenia była czytana jako „przyłączony
     przez całe okno", choć wymaganie ma postać ``∀t∈[t_f,t_e]: c(t)=1``;
  7. prąd bierny nie miał prawa znaku — surowe ``Im(I)`` dawało werdykt
     ODWRÓCONY względem fizyki wsparcia napięcia;
  8. ``None`` w wymaganiu profilu znaczyło naraz „nie dotyczy" i „zapomniano
     zmapować";
  9. ``czas_utrzymania_s = 0`` i progi ``0.9`` / ``0.1`` były domyślne, a reguła
     ``α·P_pre`` stosowana bez dziedziny (także do ``P_pre <= 0``).

Każdy test poniżej jest skonstruowany tak, żeby przy STARYM zachowaniu wypaść
na zielono z błędnym werdyktem — dlatego mierzy naprawę, a nie samą składnię.
"""

from __future__ import annotations

import cmath
import math

import numpy as np
import pytest
from dynamic_lab.frt import (
    KRYTERIA_FRT,
    KRYTERIA_OCENIANE,
    KRYTERIA_POZA_MODELEM,
    KRYTERIUM_CZAS_ODPOWIEDZI_BIERNEJ,
    KRYTERIUM_OBWIEDNIA,
    KRYTERIUM_ODBUDOWA_MOCY,
    KRYTERIUM_PRAD_WSPARCIA,
    KRYTERIUM_STAN_PRZYLACZENIA,
    DziedzinaOdbudowy,
    DziennikPrzylaczenia,
    EkstrapolacjaZabronionaError,
    KryteriumOdbudowyMocy,
    ManifestKryteriowProfilu,
    ObwiedniaFrt,
    OcenaZdolnosciFrt,
    PrzebiegNapiecia,
    PrzebiegPraduWsparcia,
    PrzebiegSkalarny,
    StatusKryterium,
    WadaSzereguCzasowego,
    WerdyktFrt,
    WymaganiePraduBiernego,
    WymaganieZdolnosciFrt,
    ZdarzenieStanuPrzylaczenia,
    interpoluj_w_nosniku,
    moc_pozorna_z_fazorow,
    ocen_obwiednie_napiecia,
    ocen_odbudowe_mocy,
    ocen_zdolnosc_frt,
    prad_wsparcia_z_fazora,
    sprawdz_szereg_czasowy,
)

OBWIEDNIA_PLASKA = ObwiedniaFrt(rodzaj="lvrt", punkty=((0.0, 0.15), (2.0, 0.15)))

#: Kryterium odbudowy używane w testach, które nie badają samej odbudowy.
#: Wszystkie parametry podane JAWNIE — w tym module nie ma progów domyślnych.
KRYTERIUM_ODBUDOWY_TESTOWE = KryteriumOdbudowyMocy(
    prog_wzgledny=0.9,
    czas_utrzymania_s=0.2,
    dziedzina=DziedzinaOdbudowy.GENERACJA,
    minimalna_moc_odniesienia_pu=0.05,
    maksymalny_czas_s=1.0,
)


def _przebieg_u(czas, napiecie) -> PrzebiegNapiecia:
    return PrzebiegNapiecia(
        czas_s=tuple(czas),
        napiecie_pu=tuple(napiecie),
        zrodlo="symulacja_laboratoryjna",
        element_ref="DER-1",
    )


def _przebieg_p(czas, moc) -> PrzebiegSkalarny:
    return PrzebiegSkalarny(
        czas_s=tuple(czas),
        wartosci=tuple(moc),
        wielkosc="moc_czynna",
        jednostka="p.u.",
        zrodlo="symulacja_laboratoryjna",
        element_ref="DER-1",
    )


def _przebieg_iq(czas, wartosci) -> PrzebiegPraduWsparcia:
    return PrzebiegPraduWsparcia(
        czas_s=tuple(czas),
        wartosci_pu=tuple(wartosci),
        zrodlo="symulacja_laboratoryjna",
        element_ref="DER-1",
    )


def _fazory(*, p_pu: float, q_pu: float, modul_v_pu: float, kat_v_rad: float):
    """Para (V, I) w konwencji generatorowej ``S = V·conj(I)``.

    Wyprowadzenie z definicji mocy: ``I = conj((P+jQ)/V) = (P − jQ)·e^{jθ}/|V|``.
    Dzięki temu testy prawa znaku nie zakładają niczego o implementacji — liczą
    prąd z mocy, a nie moc z prądu.
    """
    v = modul_v_pu * cmath.exp(1j * kat_v_rad)
    i = ((p_pu - 1j * q_pu) / modul_v_pu) * cmath.exp(1j * kat_v_rad)
    return v, i


def _dziennik_ciagly(od_s: float = 0.0, do_s: float = 1.5) -> DziennikPrzylaczenia:
    return DziennikPrzylaczenia(
        stan_poczatkowy=True,
        zdarzenia=(),
        obowiazuje_od_s=od_s,
        obowiazuje_do_s=do_s,
        zrodlo="model_zabezpieczen",
    )


def _manifest(**nadpisania: StatusKryterium) -> ManifestKryteriowProfilu:
    """Manifest KOMPLETNY: każde kryterium z listy zamkniętej dostaje status.

    Domyślnie wymagane są obwiednia i stan przyłączenia, reszta „nie dotyczy".
    Test badający lukę w manifeście buduje go sam, bez tego pomocnika — inaczej
    pomocnik zasłaniałby dokładnie ten defekt, który ma być mierzony.
    """
    mapa = dict.fromkeys(KRYTERIA_FRT, StatusKryterium.NIE_DOTYCZY)
    mapa[KRYTERIUM_OBWIEDNIA] = StatusKryterium.WYMAGANE
    mapa[KRYTERIUM_STAN_PRZYLACZENIA] = StatusKryterium.WYMAGANE
    mapa.update(nadpisania)
    return ManifestKryteriowProfilu.z_mapy(mapa)


def _wymaganie(**nadpisania) -> WymaganieZdolnosciFrt:
    parametry: dict = {
        "obwiednia": OBWIEDNIA_PLASKA,
        "horyzont_s": 1.5,
        "manifest": _manifest(),
        "identyfikator_profilu": "PROFIL-TESTOWY-1",
    }
    parametry.update(nadpisania)
    return WymaganieZdolnosciFrt(**parametry)


# ---------------------------------------------------------------------------
# 6.1 — WSPÓLNY KONTRAKT SZEREGU CZASOWEGO, ZAKAZ EKSTRAPOLACJI
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("czas", "wartosci", "okno_do", "maks_odstep", "oczekiwana"),
    [
        ((0.0, 1.0, 2.0), (1.0, 1.0, 1.0), 3.0, None, WadaSzereguCzasowego.OKNO_NIEDOMKNIETE),
        ((0.5, 1.0, 2.0), (1.0, 1.0, 1.0), 2.0, None, WadaSzereguCzasowego.POCZATEK_PO_ZAKLOCENIU),
        ((0.0, 0.5, 0.4), (1.0, 1.0, 1.0), 0.4, None, WadaSzereguCzasowego.CZAS_NIEMONOTONICZNY),
        ((0.0, 0.5, 0.5), (1.0, 1.0, 1.0), 0.5, None, WadaSzereguCzasowego.CZAS_ZDUBLOWANY),
        ((0.0, 1.0), (1.0, 1.0), 1.0, 0.1, WadaSzereguCzasowego.ZBYT_RZADKIE_PROBKI),
        ((0.0, float("nan")), (1.0, 1.0), 1.0, None, WadaSzereguCzasowego.CZAS_NIESKONCZONY),
        ((0.0, 1.0), (1.0, float("inf")), 1.0, None, WadaSzereguCzasowego.WARTOSC_NIESKONCZONA),
        ((0.0, 1.0), (1.0, float("nan")), 1.0, None, WadaSzereguCzasowego.WARTOSC_NIESKONCZONA),
    ],
)
def test_kontrakt_szeregu_wykrywa_kazda_klase_wady(
    czas, wartosci, okno_do, maks_odstep, oczekiwana
) -> None:
    """JEDEN mechanizm, pełny zakres wad — przypięty wprost, nie przez konsumenta.

    To jest inwentarz KLASY, nie instancji: gdyby kontrakt sprawdzał tylko te
    wady, które akurat zauważył konsument napięcia, sygnały dołożone później
    znowu miałyby własną, słabszą kontrolę.
    """
    wady = sprawdz_szereg_czasowy(
        np.asarray(czas, dtype=np.float64),
        np.asarray(wartosci, dtype=np.float64),
        okno_od_s=0.0,
        okno_do_s=okno_do,
        maks_odstep_probek_s=maks_odstep,
    )
    assert oczekiwana in wady


def test_kontrakt_szeregu_przepuszcza_dane_zdatne() -> None:
    """Strona pozytywna — bez niej test wyżej przechodziłby też dla funkcji
    odrzucającej WSZYSTKO."""
    czas = np.linspace(0.0, 2.0, 21)
    assert (
        sprawdz_szereg_czasowy(
            czas,
            np.full(21, 0.9),
            okno_od_s=0.0,
            okno_do_s=2.0,
            maks_odstep_probek_s=0.1,
        )
        == ()
    )


def test_interpolacja_poza_nosnikiem_jest_bledem_a_nie_wartoscia_brzegowa() -> None:
    """``np.interp`` zwróciłby tu 5,0 i nic nie powiedział — czyli zmyśliłby pomiar."""
    czas = np.array([0.0, 1.0], dtype=np.float64)
    wartosci = np.array([5.0, 5.0], dtype=np.float64)
    zapytanie = np.array([0.5, 1.5], dtype=np.float64)

    assert float(np.interp(zapytanie, czas, wartosci)[1]) == 5.0, "kontrola założenia testu"
    with pytest.raises(EkstrapolacjaZabronionaError, match="fabrykacj"):
        interpoluj_w_nosniku(zapytanie, czas, wartosci, nazwa_sygnalu="test")

    w_nosniku = interpoluj_w_nosniku(
        np.array([0.0, 0.5, 1.0]), czas, wartosci, nazwa_sygnalu="test"
    )
    assert w_nosniku.tolist() == [5.0, 5.0, 5.0]


def test_prad_wsparcia_urwany_przed_koncem_okna_nie_moze_spelnic() -> None:
    """ATAK EKSTRAPOLACJĄ: prąd wsparcia kończy się w 0,5 s, okno sięga 1,5 s.

    Przy ``np.interp`` bez kontroli nośnika wartość z 0,5 s (wysoka, bo w zapadzie)
    byłaby powielona do końca okna i kryterium orzekłoby SPELNIA na danych,
    których nie ma. Napięcie pokrywa całe okno, więc jedyną różnicą jest brak
    pokrycia po stronie prądu.
    """
    czas_u = np.linspace(0.0, 1.5, 31)
    napiecie = np.where(czas_u < 0.6, 0.6, 1.0)
    czas_iq = np.linspace(0.0, 0.5, 11)

    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(czas_u, napiecie),
        wymaganie=_wymaganie(
            manifest=_manifest(prad_bierny_wsparcia=StatusKryterium.WYMAGANE),
            wymaganie_pradu_biernego=WymaganiePraduBiernego(
                wspolczynnik_k=2.0, pasmo_martwe_pu=0.1
            ),
        ),
        chwila_zaklocenia_s=0.0,
        dziennik_przylaczenia=_dziennik_ciagly(),
        przebieg_pradu_wsparcia=_przebieg_iq(czas_iq, np.full(11, 0.9)),
        napiecie_przed_zaklocaniem_pu=1.0,
        prad_wsparcia_przed_zaklocaniem_pu=0.0,
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE, ocena.uzasadnienie_pl
    assert KRYTERIUM_PRAD_WSPARCIA in ocena.kryteria_niepokryte
    wiersz = next(w for w in ocena.wiersze if w.kryterium == KRYTERIUM_PRAD_WSPARCIA)
    assert WadaSzereguCzasowego.OKNO_NIEDOMKNIETE.value in wiersz.uzasadnienie_pl


@pytest.mark.parametrize("sygnal", ["napiecie", "moc", "prad_wsparcia", "przylaczenie"])
def test_zaden_sygnal_urwany_przed_koncem_okna_nie_daje_spelnienia(sygnal: str) -> None:
    """ILOCZYN CECH {sygnał} × {urwanie przed końcem okna} — kontrakt jest wspólny.

    Poprzednio kontrolę pokrycia miało WYŁĄCZNIE napięcie. Ten test wypisuje
    inwentarz sygnałów i sprawdza KLASĘ defektu na każdym z nich, zamiast ufać,
    że skoro naprawiono jeden, pozostałe też są zabezpieczone.
    """
    czas_pelny = np.linspace(0.0, 1.5, 31)
    czas_krotki = np.linspace(0.0, 0.5, 11)
    napiecie = np.where(czas_pelny < 0.6, 0.6, 1.0)

    argumenty: dict = {
        "przebieg_napiecia": _przebieg_u(czas_pelny, napiecie),
        "chwila_zaklocenia_s": 0.0,
        "dziennik_przylaczenia": _dziennik_ciagly(),
        "przebieg_mocy": _przebieg_p(czas_pelny, np.full(31, 1.0)),
        "moc_przed_zaklocaniem_pu": 1.0,
        "chwila_wylaczenia_s": 0.6,
        "przebieg_pradu_wsparcia": _przebieg_iq(czas_pelny, np.full(31, 0.9)),
        "napiecie_przed_zaklocaniem_pu": 1.0,
        "prad_wsparcia_przed_zaklocaniem_pu": 0.0,
    }
    if sygnal == "napiecie":
        argumenty["przebieg_napiecia"] = _przebieg_u(czas_krotki, np.full(11, 0.9))
    elif sygnal == "moc":
        argumenty["przebieg_mocy"] = _przebieg_p(czas_krotki, np.full(11, 1.0))
    elif sygnal == "prad_wsparcia":
        argumenty["przebieg_pradu_wsparcia"] = _przebieg_iq(czas_krotki, np.full(11, 0.9))
    else:
        argumenty["dziennik_przylaczenia"] = _dziennik_ciagly(do_s=0.5)

    ocena = ocen_zdolnosc_frt(
        wymaganie=_wymaganie(
            manifest=_manifest(
                prad_bierny_wsparcia=StatusKryterium.WYMAGANE,
                odbudowa_mocy=StatusKryterium.WYMAGANE,
            ),
            wymaganie_pradu_biernego=WymaganiePraduBiernego(
                wspolczynnik_k=2.0, pasmo_martwe_pu=0.1
            ),
            kryterium_odbudowy=KRYTERIUM_ODBUDOWY_TESTOWE,
        ),
        **argumenty,
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE, ocena.uzasadnienie_pl
    assert ocena.kryteria_niepokryte != ()


def test_obwiednia_konczaca_sie_przed_koncem_okna_nie_rozstrzyga() -> None:
    """Wymaganie też ma nośnik: poza ostatnim punktem profil NIC nie stawia.

    Wcześniej obwiednia „obowiązywała dalej" wartością ostatniego punktu, więc
    ocena na 2 s przy profilu opisanym do 1,0 s porównywała przebieg z
    wymaganiem, którego profil nie formułuje — ekstrapolacja po stronie
    wymagania, ta sama klasa defektu, co ekstrapolacja pomiaru.
    """
    obwiednia = ObwiedniaFrt(rodzaj="lvrt", punkty=((0.0, 0.15), (1.0, 0.15)))
    przebieg = _przebieg_u(np.linspace(0.0, 2.0, 21), np.full(21, 0.9))
    ocena = ocen_obwiednie_napiecia(przebieg, obwiednia, chwila_zaklocenia_s=0.0, horyzont_s=2.0)
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert WadaSzereguCzasowego.OBWIEDNIA_NIE_POKRYWA_OKNA in ocena.wady_szeregu


def test_profil_z_horyzontem_poza_obwiednia_jest_odrzucany_przy_budowie() -> None:
    """Ten sam predykat (``ObwiedniaFrt.pokrywa``) w dwóch miejscach — jedno źródło prawdy."""
    with pytest.raises(ValueError, match="nie stawia wymagania"):
        WymaganieZdolnosciFrt(
            obwiednia=ObwiedniaFrt(rodzaj="lvrt", punkty=((0.0, 0.15), (1.0, 0.15))),
            horyzont_s=2.0,
            manifest=_manifest(),
        )


def test_obwiednia_z_powtorzonym_czasem_jest_odrzucana() -> None:
    """Powtórzony węzeł czyni wartość wymagania zależną od kolejności, nie od profilu."""
    with pytest.raises(ValueError, match="ŚCIŚLE rosnące"):
        ObwiedniaFrt(rodzaj="lvrt", punkty=((0.0, 0.15), (0.5, 0.15), (0.5, 0.9)))


def test_obwiednia_musi_zaczynac_sie_w_chwili_zaklocenia() -> None:
    with pytest.raises(ValueError, match="t=0"):
        ObwiedniaFrt(rodzaj="lvrt", punkty=((0.05, 0.15), (1.5, 0.15)))


# ---------------------------------------------------------------------------
# FALA 2 — pokrycie horyzontu (zachowane, nie cofać)
# ---------------------------------------------------------------------------


def test_przebieg_krotszy_od_horyzontu_nie_moze_spelnic() -> None:
    """0,4 s poprawnych danych NIE jest spełnieniem wymagania na 2 s."""
    przebieg = _przebieg_u(np.linspace(0.0, 0.4, 5), np.full(5, 0.9))
    ocena = ocen_obwiednie_napiecia(
        przebieg, OBWIEDNIA_PLASKA, chwila_zaklocenia_s=0.0, horyzont_s=2.0
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert WadaSzereguCzasowego.OKNO_NIEDOMKNIETE in ocena.wady_szeregu
    assert ocena.margines_pu is None


def test_przebieg_pokrywajacy_horyzont_rozstrzyga() -> None:
    przebieg = _przebieg_u(np.linspace(0.0, 2.0, 21), np.full(21, 0.9))
    ocena = ocen_obwiednie_napiecia(
        przebieg, OBWIEDNIA_PLASKA, chwila_zaklocenia_s=0.0, horyzont_s=2.0
    )
    assert ocena.werdykt is WerdyktFrt.SPELNIA
    assert ocena.wady_szeregu == ()


def test_przebieg_zaczynajacy_sie_po_zaklocaniu_jest_nierozstrzygalny() -> None:
    przebieg = _przebieg_u(np.linspace(0.5, 2.0, 16), np.full(16, 0.9))
    ocena = ocen_obwiednie_napiecia(
        przebieg, OBWIEDNIA_PLASKA, chwila_zaklocenia_s=0.0, horyzont_s=2.0
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert WadaSzereguCzasowego.POCZATEK_PO_ZAKLOCENIU in ocena.wady_szeregu


@pytest.mark.parametrize(
    ("czas", "oczekiwany"),
    [
        ((0.0, 0.5, 0.4, 1.0, 2.0), WadaSzereguCzasowego.CZAS_NIEMONOTONICZNY),
        ((0.0, 0.5, 0.5, 1.0, 2.0), WadaSzereguCzasowego.CZAS_ZDUBLOWANY),
    ],
)
def test_wadliwa_os_czasu_jest_wykrywana(czas, oczekiwany) -> None:
    przebieg = _przebieg_u(czas, (0.9,) * len(czas))
    ocena = ocen_obwiednie_napiecia(
        przebieg, OBWIEDNIA_PLASKA, chwila_zaklocenia_s=0.0, horyzont_s=2.0
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert oczekiwany in ocena.wady_szeregu


def test_zbyt_rzadkie_probkowanie_jest_wykrywane_gdy_profil_tego_wymaga() -> None:
    przebieg = _przebieg_u((0.0, 1.0, 2.0), (0.9, 0.9, 0.9))
    ocena = ocen_obwiednie_napiecia(
        przebieg,
        OBWIEDNIA_PLASKA,
        chwila_zaklocenia_s=0.0,
        horyzont_s=2.0,
        maks_odstep_probek_s=0.1,
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert WadaSzereguCzasowego.ZBYT_RZADKIE_PROBKI in ocena.wady_szeregu


# ---------------------------------------------------------------------------
# FALA 2 — dokładne minimum marginesu na wspólnej siatce (zachowane)
# ---------------------------------------------------------------------------


def test_zalamanie_obwiedni_miedzy_probkami_nie_moze_zostac_pominiete() -> None:
    """Dowód poprawki: margines liczony wyłącznie w chwilach próbek był zawyżony.

    Obwiednia ma krótkie podwyższenie do 0,90 p.u. na przedziale [0,25; 0,35] s.
    Przebieg ma próbki w 0,0 / 0,2 / 0,4 / 1,0 s — ANI JEDNEJ wewnątrz
    podwyższenia. Liczony wyłącznie w chwilach próbek margines jest wszędzie
    dodatni, więc stare zachowanie orzekłoby SPELNIA. Na wspólnej siatce
    (próbki ∪ załamania obwiedni) minimum wypada w podwyższeniu i jest ujemne.
    """
    obwiednia = ObwiedniaFrt(
        rodzaj="lvrt",
        punkty=((0.0, 0.15), (0.20, 0.15), (0.25, 0.90), (0.35, 0.90), (0.40, 0.15), (1.5, 0.15)),
    )
    przebieg = _przebieg_u((0.0, 0.2, 0.4, 1.0), (1.0, 0.5, 0.5, 0.5))

    # Kontrola założenia testu: w SAMYCH chwilach próbek margines jest dodatni.
    w_probkach = [
        u - obwiednia.wymagane_napiecie(t)
        for t, u in zip(przebieg.czas_s, przebieg.napiecie_pu, strict=True)
    ]
    assert min(w_probkach) > 0.0, "test przestałby mierzyć poprawkę"

    ocena = ocen_obwiednie_napiecia(przebieg, obwiednia, chwila_zaklocenia_s=0.0, horyzont_s=1.0)
    assert ocena.werdykt is WerdyktFrt.NIE_SPELNIA
    assert ocena.margines_pu is not None and ocena.margines_pu == pytest.approx(-0.40, abs=1e-9)
    assert ocena.chwila_krytyczna_s is not None
    assert 0.25 - 1e-9 <= ocena.chwila_krytyczna_s <= 0.35 + 1e-9
    assert ocena.liczba_wezlow_siatki > len(przebieg.czas_s)


def test_dokladne_dotkniecie_obwiedni_jest_spelnieniem() -> None:
    """Margines dokładnie 0 to spełnienie — granica ma być domknięta, nie losowa."""
    przebieg = _przebieg_u(np.linspace(0.0, 2.0, 21), np.full(21, 0.15))
    ocena = ocen_obwiednie_napiecia(
        przebieg, OBWIEDNIA_PLASKA, chwila_zaklocenia_s=0.0, horyzont_s=2.0
    )
    assert ocena.werdykt is WerdyktFrt.SPELNIA
    assert ocena.margines_pu == pytest.approx(0.0, abs=1e-12)


# ---------------------------------------------------------------------------
# 6.2 — STAN PRZYŁĄCZENIA: KWANTYFIKATOR ∀, NIE POJEDYNCZA PRÓBKA
# ---------------------------------------------------------------------------


def test_jedna_probka_przylaczenia_nie_dowodzi_calego_okna() -> None:
    """ATAK: jedna próbka ``(t=0.5, True)`` jako „dowód" przyłączenia na [0; 1,5] s.

    Stara implementacja szukała pierwszego ``False``, nie znajdowała go i wydawała
    werdykt SPELNIA. Wymaganie ma postać ``∀t∈[t_f,t_e]: c(t)=1`` i z jednej
    próbki nie wynika: dziennik zbudowany z takiego kanału obowiązuje wyłącznie
    na [0,5; 0,5] s.
    """
    dziennik = DziennikPrzylaczenia.z_probek(
        czas_s=(0.5,),
        przylaczony=(True,),
        zrodlo="model_zabezpieczen",
        maks_odstep_s=0.1,
    )
    assert dziennik.obowiazuje_od_s == pytest.approx(0.5)
    assert dziennik.obowiazuje_do_s == pytest.approx(0.5)
    assert dziennik.pokrywa(0.0, 1.5) is False
    with pytest.raises(EkstrapolacjaZabronionaError):
        dziennik.pierwsze_odlaczenie(0.0, 1.5)

    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(np.linspace(0.0, 1.5, 31), np.full(31, 0.9)),
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=0.0,
        dziennik_przylaczenia=dziennik,
    )
    assert ocena.werdykt is not WerdyktFrt.SPELNIA
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE, ocena.uzasadnienie_pl
    assert KRYTERIUM_STAN_PRZYLACZENIA in ocena.kryteria_niepokryte


def test_dziennik_kompletny_potwierdza_kwantyfikator() -> None:
    """Strona pozytywna: dziennik obowiązujący na CAŁYM oknie orzeka ∀."""
    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(np.linspace(0.0, 1.5, 31), np.full(31, 0.9)),
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=0.0,
        dziennik_przylaczenia=_dziennik_ciagly(),
    )
    assert ocena.werdykt is WerdyktFrt.SPELNIA, ocena.uzasadnienie_pl
    wiersz = next(w for w in ocena.wiersze if w.kryterium == KRYTERIUM_STAN_PRZYLACZENIA)
    assert wiersz.werdykt is WerdyktFrt.SPELNIA
    assert "każdej chwili" in wiersz.uzasadnienie_pl


def test_brak_stanu_przylaczenia_daje_nierozstrzygalne() -> None:
    """BRAK sygnału wyłączenia NIE jest dowodem przyłączenia."""
    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(np.linspace(0.0, 1.5, 16), np.full(16, 0.9)),
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=0.0,
        dziennik_przylaczenia=None,
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert KRYTERIUM_STAN_PRZYLACZENIA in ocena.kryteria_niepokryte


def test_odlaczenie_przy_poprawnym_napieciu_daje_niespelnienie() -> None:
    """Napięcie cały czas nad obwiednią, a mimo to moduł wypada — bo się odłączył."""
    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(np.linspace(0.0, 1.5, 16), np.full(16, 0.9)),
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=0.0,
        dziennik_przylaczenia=DziennikPrzylaczenia(
            stan_poczatkowy=True,
            zdarzenia=(ZdarzenieStanuPrzylaczenia(0.6, False),),
            obowiazuje_od_s=0.0,
            obowiazuje_do_s=1.5,
            zrodlo="model_zabezpieczen",
        ),
    )
    assert ocena.werdykt is WerdyktFrt.NIE_SPELNIA
    wiersz = next(w for w in ocena.wiersze if w.kryterium == KRYTERIUM_STAN_PRZYLACZENIA)
    assert wiersz.werdykt is WerdyktFrt.NIE_SPELNIA
    assert wiersz.chwila_s == pytest.approx(0.6)


def test_powrot_po_wylaczeniu_nadal_jest_niespelnieniem() -> None:
    """Moduł, który wypadł i wrócił, NIE spełnił ``∀t`` — powrót nie kasuje wyjścia."""
    dziennik = DziennikPrzylaczenia(
        stan_poczatkowy=True,
        zdarzenia=(
            ZdarzenieStanuPrzylaczenia(0.4, False),
            ZdarzenieStanuPrzylaczenia(0.8, True),
        ),
        obowiazuje_od_s=0.0,
        obowiazuje_do_s=1.5,
        zrodlo="model_zabezpieczen",
    )
    assert dziennik.przylaczony_w(0.2) is True
    assert dziennik.przylaczony_w(0.4) is False
    assert dziennik.przylaczony_w(0.9) is True
    assert dziennik.pierwsze_odlaczenie(0.0, 1.5) == pytest.approx(0.4)


def test_rekonstrukcja_z_probek_datuje_niepewnosc_na_niekorzysc_modulu() -> None:
    """Reguła ostrożna: wyłączenie na POCZĄTEK, powrót na KONIEC przedziału niepewności."""
    dziennik = DziennikPrzylaczenia.z_probek(
        czas_s=(0.0, 0.1, 0.2),
        przylaczony=(True, False, True),
        zrodlo="kanal_logiczny_symulacji",
        maks_odstep_s=0.1,
    )
    assert dziennik.przylaczony_w(0.0) is False  # wyłączenie datowane na 0,0 s
    assert dziennik.przylaczony_w(0.05) is False
    assert dziennik.przylaczony_w(0.15) is False  # powrót dopiero na końcu przedziału
    assert dziennik.przylaczony_w(0.2) is True
    assert dziennik.pierwsze_odlaczenie(0.0, 0.2) == pytest.approx(0.0)


def test_epizod_przylaczenia_o_zerowej_dlugosci_znika() -> None:
    """Pojedyncza próbka ``True`` między dwiema ``False`` nie tworzy okresu pracy."""
    dziennik = DziennikPrzylaczenia.z_probek(
        czas_s=(0.0, 0.1, 0.2),
        przylaczony=(False, True, False),
        zrodlo="kanal_logiczny_symulacji",
        maks_odstep_s=0.1,
    )
    assert dziennik.zdarzenia == ()
    assert dziennik.przylaczony_w(0.1) is False


@pytest.mark.parametrize(
    ("czas", "stany", "maks_odstep"),
    [
        ((0.0, 1.0), (True, True), 0.1),  # kanał rzadszy niż deklaracja
        ((0.0, 0.1, 0.05), (True, True, True), 0.1),  # czas niemonotoniczny
        ((0.0, 0.1, 0.1), (True, True, True), 0.1),  # znacznik zdublowany
    ],
)
def test_kanal_lamiacy_deklaracje_kompletnosci_jest_odrzucany(czas, stany, maks_odstep) -> None:
    """Deklaracja ``maks_odstep_s`` jest SPRAWDZANA, a nie przyjmowana na słowo."""
    with pytest.raises(ValueError, match="kontraktu"):
        DziennikPrzylaczenia.z_probek(
            czas_s=czas,
            przylaczony=stany,
            zrodlo="kanal_logiczny_symulacji",
            maks_odstep_s=maks_odstep,
        )


def test_pytanie_o_stan_poza_dziennikiem_jest_bledem() -> None:
    dziennik = _dziennik_ciagly(od_s=0.0, do_s=1.0)
    with pytest.raises(EkstrapolacjaZabronionaError, match="NIEZNANY"):
        dziennik.przylaczony_w(1.5)


def test_zdarzenie_niezmieniajace_stanu_jest_odrzucane() -> None:
    """Postać kanoniczna: zdarzenie bez zmiany stanu psuje zliczanie parzystości."""
    with pytest.raises(ValueError, match="postaci kanonicznej|naprzemienne"):
        DziennikPrzylaczenia(
            stan_poczatkowy=True,
            zdarzenia=(ZdarzenieStanuPrzylaczenia(0.4, True),),
            obowiazuje_od_s=0.0,
            obowiazuje_do_s=1.5,
            zrodlo="model_zabezpieczen",
        )


def test_zdarzenie_poza_zakresem_obowiazywania_jest_odrzucane() -> None:
    with pytest.raises(ValueError, match="poza przedziałem obowiązywania"):
        DziennikPrzylaczenia(
            stan_poczatkowy=True,
            zdarzenia=(ZdarzenieStanuPrzylaczenia(2.0, False),),
            obowiazuje_od_s=0.0,
            obowiazuje_do_s=1.5,
            zrodlo="model_zabezpieczen",
        )


# ---------------------------------------------------------------------------
# 6.3 — PRĄD WSPARCIA: JAWNE PRAWO ZNAKU
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("kat_stopnie", [0.0, 30.0, -70.0])
@pytest.mark.parametrize("q_pu", [0.4, -0.4])
def test_prawo_znaku_pradu_wsparcia(kat_stopnie: float, q_pu: float) -> None:
    """ILOCZYN CECH {kąt V} × {znak Q}: ``I_q_wsparcie = Q/|V|``, zawsze.

    Konwencja generatorowa ``S = V·conj(I)`` daje ``Im(I·e^{-jθ}) = −Q/|V|``,
    więc dodatnie wsparcie napięcia (Q wstrzykiwana) ma UJEMNĄ część urojoną
    prądu w ramie napięcia. Kto podałby surowe ``Im(I)`` jako „Iq", dostałby
    werdykt odwrócony — dlatego wielkość jest liczona z fazorów, a nie przyjmowana.
    """
    modul_v = 0.6
    v, i = _fazory(p_pu=0.3, q_pu=q_pu, modul_v_pu=modul_v, kat_v_rad=math.radians(kat_stopnie))

    moc = moc_pozorna_z_fazorow(v, i)
    assert moc.real == pytest.approx(0.3, abs=1e-12)
    assert moc.imag == pytest.approx(q_pu, abs=1e-12)

    iq = prad_wsparcia_z_fazora(v, i)
    assert iq == pytest.approx(q_pu / modul_v, abs=1e-12)
    assert (iq > 0.0) is (q_pu > 0.0)

    # Surowa część urojona prądu w ramie NAPIĘCIA jest dokładnie przeciwna —
    # to jest ta pułapka, w którą wpadał poprzedni kontrakt.
    w_ramie_napiecia = i * (v.conjugate() / abs(v))
    assert w_ramie_napiecia.imag == pytest.approx(-iq, abs=1e-12)


@pytest.mark.parametrize("obrot_stopnie", [0.0, 17.0, 90.0, 180.0, -123.0, 359.0])
def test_prad_wsparcia_jest_niezmienniczy_wzgledem_obrotu_ukladu(obrot_stopnie: float) -> None:
    """Obrót ramy odniesienia nie może zmienić P, Q ani prądu wsparcia.

    To jest własność silniejsza od pojedynczej fikstury: gdyby wzór zawierał
    jakiekolwiek odniesienie do osi układu (np. brał ``Im(I)`` zamiast
    ``Im(I·e^{-jθ_V})``), obrót o φ zmieniłby wynik.
    """
    v, i = _fazory(p_pu=0.25, q_pu=0.4, modul_v_pu=0.7, kat_v_rad=math.radians(-40.0))
    obrot = cmath.exp(1j * math.radians(obrot_stopnie))

    moc_bazowa = moc_pozorna_z_fazorow(v, i)
    moc_obrocona = moc_pozorna_z_fazorow(v * obrot, i * obrot)
    assert moc_obrocona.real == pytest.approx(moc_bazowa.real, abs=1e-12)
    assert moc_obrocona.imag == pytest.approx(moc_bazowa.imag, abs=1e-12)

    assert prad_wsparcia_z_fazora(v * obrot, i * obrot) == pytest.approx(
        prad_wsparcia_z_fazora(v, i), abs=1e-12
    )


def test_prad_wsparcia_bez_napiecia_nie_istnieje() -> None:
    """Bez fazy napięcia wielkość nie jest zdefiniowana — i nie wolno jej zgadywać."""
    with pytest.raises(ValueError, match="faza nie istnieje"):
        prad_wsparcia_z_fazora(0j, 1 + 1j)


def test_przebieg_z_fazorow_liczy_wsparcie_probka_po_probce() -> None:
    v0, i0 = _fazory(p_pu=0.5, q_pu=0.0, modul_v_pu=1.0, kat_v_rad=0.0)
    v1, i1 = _fazory(p_pu=0.2, q_pu=0.45, modul_v_pu=0.5, kat_v_rad=math.radians(25.0))
    przebieg = PrzebiegPraduWsparcia.z_fazorow(
        czas_s=(0.0, 0.1),
        napiecie_zespolone=(v0, v1),
        prad_zespolony=(i0, i1),
        zrodlo="symulacja_laboratoryjna",
        element_ref="DER-1",
    )
    assert przebieg.wartosci_pu[0] == pytest.approx(0.0, abs=1e-12)
    assert przebieg.wartosci_pu[1] == pytest.approx(0.45 / 0.5, abs=1e-12)


def test_odwrocony_znak_pradu_wsparcia_zmienia_werdykt() -> None:
    """Falownik wstrzykujący Q spełnia, pobierający NIE — i to musi być rozróżnione.

    Oba przebiegi są zbudowane z fazorów o TEJ SAMEJ mocy czynnej i tym samym
    module prądu; różni je wyłącznie znak Q. Przy odwróconym prawie znaku werdykty
    zamieniłyby się miejscami, więc test mierzy fizykę, a nie kształt danych.
    """
    czas = np.linspace(0.0, 1.5, 31)
    napiecie = np.where(czas < 0.6, 0.6, 1.0)
    wymaganie = _wymaganie(
        manifest=_manifest(prad_bierny_wsparcia=StatusKryterium.WYMAGANE),
        wymaganie_pradu_biernego=WymaganiePraduBiernego(wspolczynnik_k=2.0, pasmo_martwe_pu=0.1),
    )

    def _ocena(znak_q: float) -> OcenaZdolnosciFrt:
        fazory = [
            _fazory(
                p_pu=0.2, q_pu=znak_q * (0.42 if u < 0.9 else 0.05), modul_v_pu=u, kat_v_rad=0.3
            )
            for u in napiecie
        ]
        przebieg_iq = PrzebiegPraduWsparcia.z_fazorow(
            czas_s=tuple(czas),
            napiecie_zespolone=tuple(v for v, _ in fazory),
            prad_zespolony=tuple(i for _, i in fazory),
            zrodlo="symulacja_laboratoryjna",
            element_ref="DER-1",
        )
        return ocen_zdolnosc_frt(
            przebieg_napiecia=_przebieg_u(czas, napiecie),
            wymaganie=wymaganie,
            chwila_zaklocenia_s=0.0,
            dziennik_przylaczenia=_dziennik_ciagly(),
            przebieg_pradu_wsparcia=przebieg_iq,
            napiecie_przed_zaklocaniem_pu=1.0,
            prad_wsparcia_przed_zaklocaniem_pu=0.0,
        )

    wspierajacy = _ocena(+1.0)
    pobierajacy = _ocena(-1.0)
    assert wspierajacy.werdykt is WerdyktFrt.SPELNIA, wspierajacy.uzasadnienie_pl
    assert pobierajacy.werdykt is WerdyktFrt.NIE_SPELNIA, pobierajacy.uzasadnienie_pl
    wiersz = next(w for w in pobierajacy.wiersze if w.kryterium == KRYTERIUM_PRAD_WSPARCIA)
    assert wiersz.zmierzone is not None and wiersz.zmierzone < 0.0


def test_niedostateczne_wsparcie_bierne_daje_niespelnienie() -> None:
    """Wsparcie dodatnie, ale za małe względem k·ΔU — kryterium ma być ilościowe."""
    czas = np.linspace(0.0, 1.5, 31)
    napiecie = np.where(czas < 0.6, 0.6, 1.0)
    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(czas, napiecie),
        wymaganie=_wymaganie(
            manifest=_manifest(prad_bierny_wsparcia=StatusKryterium.WYMAGANE),
            wymaganie_pradu_biernego=WymaganiePraduBiernego(
                wspolczynnik_k=2.0, pasmo_martwe_pu=0.1
            ),
        ),
        chwila_zaklocenia_s=0.0,
        dziennik_przylaczenia=_dziennik_ciagly(),
        przebieg_pradu_wsparcia=_przebieg_iq(czas, np.where(czas < 0.6, 0.3, 0.05)),
        napiecie_przed_zaklocaniem_pu=1.0,
        prad_wsparcia_przed_zaklocaniem_pu=0.0,
    )
    assert ocena.werdykt is WerdyktFrt.NIE_SPELNIA
    wiersz = next(w for w in ocena.wiersze if w.kryterium == KRYTERIUM_PRAD_WSPARCIA)
    assert wiersz.wymagane == pytest.approx(2.0 * (1.0 - 0.6 - 0.1))
    assert wiersz.margines is not None and wiersz.margines < 0.0


# ---------------------------------------------------------------------------
# 6.4 — MANIFEST KRYTERIÓW: KONIEC Z `None` JAKO „NIE WYMAGA"
# ---------------------------------------------------------------------------


def test_lista_kryteriow_jest_zamknieta() -> None:
    """Przypięcie deklaracji z docstringa modułu — obietnica bez testu to fałszywa pewność."""
    assert set(KRYTERIA_FRT) == set(KRYTERIA_OCENIANE) | set(KRYTERIA_POZA_MODELEM)
    assert not set(KRYTERIA_OCENIANE) & set(KRYTERIA_POZA_MODELEM)
    with pytest.raises(ValueError, match="spoza listy zamkniętej"):
        ManifestKryteriowProfilu.z_mapy({"obwiednia_napiecie": StatusKryterium.WYMAGANE})


def test_pominiete_kryterium_jest_niezmapowane_a_nie_niewymagane() -> None:
    """ATAK: profil MILCZY o odbudowie mocy. Milczenie ≠ „nie dotyczy".

    Stara reprezentacja (``kryterium_odbudowy = None``) czytała brak mapowania
    jako „profil tego nie wymaga" i przepuszczała werdykt pozytywny. Tutaj brak
    statusu daje ``NIEZMAPOWANE``, które blokuje SPELNIA.
    """
    manifest = ManifestKryteriowProfilu.z_mapy(
        {
            KRYTERIUM_OBWIEDNIA: StatusKryterium.WYMAGANE,
            KRYTERIUM_STAN_PRZYLACZENIA: StatusKryterium.WYMAGANE,
            KRYTERIUM_PRAD_WSPARCIA: StatusKryterium.NIE_DOTYCZY,
            KRYTERIUM_CZAS_ODPOWIEDZI_BIERNEJ: StatusKryterium.NIE_DOTYCZY,
            "logika_wylaczenia_oem": StatusKryterium.NIE_DOTYCZY,
            "obwod_dc_modulu": StatusKryterium.NIE_DOTYCZY,
            # KRYTERIUM_ODBUDOWA_MOCY celowo pominięte — to jest cała treść ataku.
        }
    )
    assert manifest.status(KRYTERIUM_ODBUDOWA_MOCY) is StatusKryterium.NIEZMAPOWANE

    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(np.linspace(0.0, 1.5, 31), np.full(31, 0.9)),
        wymaganie=_wymaganie(manifest=manifest),
        chwila_zaklocenia_s=0.0,
        dziennik_przylaczenia=_dziennik_ciagly(),
    )
    assert ocena.werdykt is not WerdyktFrt.SPELNIA
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE, ocena.uzasadnienie_pl
    assert KRYTERIUM_ODBUDOWA_MOCY in ocena.kryteria_niezmapowane
    assert ocena.manifest_kompletny is False


def test_kryterium_nieobslugiwane_blokuje_werdykt_pozytywny() -> None:
    """Profil wymaga czasu odpowiedzi biernej — laboratorium tego NIE liczy."""
    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(np.linspace(0.0, 1.5, 31), np.full(31, 0.9)),
        wymaganie=_wymaganie(
            manifest=_manifest(czas_odpowiedzi_biernej=StatusKryterium.NIEOBSLUGIWANE)
        ),
        chwila_zaklocenia_s=0.0,
        dziennik_przylaczenia=_dziennik_ciagly(),
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE, ocena.uzasadnienie_pl
    assert KRYTERIUM_CZAS_ODPOWIEDZI_BIERNEJ in ocena.kryteria_nieobslugiwane
    assert ocena.manifest_kompletny is False


def test_tylko_nie_dotyczy_wolno_pominac() -> None:
    """Strona pozytywna manifestu: „nie dotyczy" nie blokuje i nie tworzy wiersza."""
    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(np.linspace(0.0, 1.5, 31), np.full(31, 0.9)),
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=0.0,
        dziennik_przylaczenia=_dziennik_ciagly(),
    )
    assert ocena.werdykt is WerdyktFrt.SPELNIA, ocena.uzasadnienie_pl
    assert ocena.manifest_kompletny is True
    assert KRYTERIUM_CZAS_ODPOWIEDZI_BIERNEJ in ocena.kryteria_nie_dotyczy
    assert all(w.kryterium not in ocena.kryteria_nie_dotyczy for w in ocena.wiersze)


def test_kryterium_poza_modelem_nie_moze_byc_wymagane() -> None:
    """„Wymagane" dla rzeczy, której nikt nie liczy, byłoby pustą obietnicą."""
    with pytest.raises(ValueError, match="poza modelem"):
        _manifest(obwod_dc_modulu=StatusKryterium.WYMAGANE)


def test_obwiednia_musi_byc_wymagana_w_manifescie() -> None:
    with pytest.raises(ValueError, match="definicyjnym rdzeniem"):
        WymaganieZdolnosciFrt(
            obwiednia=OBWIEDNIA_PLASKA,
            horyzont_s=1.5,
            manifest=_manifest(obwiednia_napiecia=StatusKryterium.NIE_DOTYCZY),
        )


def test_wymaganie_bez_progu_nie_jest_wymaganiem() -> None:
    with pytest.raises(ValueError, match="jest puste"):
        _wymaganie(manifest=_manifest(odbudowa_mocy=StatusKryterium.WYMAGANE))


def test_prog_bez_wymagania_sugerowalby_ocene_ktorej_nie_bedzie() -> None:
    with pytest.raises(ValueError, match="nie nadaje kryterium"):
        _wymaganie(kryterium_odbudowy=KRYTERIUM_ODBUDOWY_TESTOWE)


# ---------------------------------------------------------------------------
# 6.5 — ODBUDOWA MOCY: CZAS UTRZYMANIA I DZIEDZINA ZNAKU
# ---------------------------------------------------------------------------


def test_zerowy_czas_utrzymania_wymaga_jawnej_deklaracji() -> None:
    """``T_hold = 0`` to osobne kryterium regulacyjne, nie wartość domyślna."""
    with pytest.raises(ValueError, match="chwilowe przekroczenie"):
        KryteriumOdbudowyMocy(
            prog_wzgledny=0.9,
            czas_utrzymania_s=0.0,
            dziedzina=DziedzinaOdbudowy.GENERACJA,
            minimalna_moc_odniesienia_pu=0.05,
        )


def test_kryterium_chwilowego_przekroczenia_jest_dopuszczalne_jawnie() -> None:
    """Profil, który naprawdę koduje chwilowe przekroczenie, ma jak to powiedzieć."""
    kryterium = KryteriumOdbudowyMocy(
        prog_wzgledny=0.9,
        czas_utrzymania_s=0.0,
        dziedzina=DziedzinaOdbudowy.GENERACJA,
        minimalna_moc_odniesienia_pu=0.05,
        dopuszcza_przekroczenie_chwilowe=True,
    )
    czas = (0.0, 0.5, 0.6, 0.7, 0.8, 1.0)
    moc = (1.0, 0.2, 0.2, 0.95, 0.2, 0.2)
    ocena = ocen_odbudowe_mocy(
        _przebieg_p(czas, moc),
        kryterium,
        moc_przed_zaklocaniem_pu=1.0,
        chwila_wylaczenia_s=0.5,
    )
    assert ocena.werdykt is WerdyktFrt.SPELNIA
    assert ocena.czas_odbudowy_s is not None


def test_jednoprobkowy_przeskok_mocy_nie_jest_odbudowa() -> None:
    """P przekracza 90 % na jedną próbkę, spada, później wraca trwale."""
    czas = (0.0, 0.5, 0.6, 0.7, 0.8, 1.0, 1.1, 1.2, 1.5, 2.0)
    moc = (1.0, 0.20, 0.30, 0.95, 0.30, 0.30, 0.95, 0.95, 0.95, 0.95)
    ocena = ocen_odbudowe_mocy(
        _przebieg_p(czas, moc),
        KryteriumOdbudowyMocy(
            prog_wzgledny=0.9,
            czas_utrzymania_s=0.2,
            dziedzina=DziedzinaOdbudowy.GENERACJA,
            minimalna_moc_odniesienia_pu=0.05,
        ),
        moc_przed_zaklocaniem_pu=1.0,
        chwila_wylaczenia_s=0.5,
    )
    assert ocena.werdykt is WerdyktFrt.SPELNIA
    assert ocena.czas_odbudowy_s is not None
    # Przeskok w 0,7 s dalby 0,2 s od wylaczenia; trwaly powrot zaczyna sie ~1,05 s.
    assert ocena.czas_odbudowy_s > 0.4


def test_odbudowa_niepotwierdzona_do_konca_przebiegu_jest_nierozstrzygalna() -> None:
    """Brak obserwacji nie jest obserwacją braku."""
    czas = (0.0, 0.5, 1.0, 1.05, 1.10)
    moc = (1.0, 0.2, 0.2, 0.95, 0.95)
    ocena = ocen_odbudowe_mocy(
        _przebieg_p(czas, moc),
        KryteriumOdbudowyMocy(
            prog_wzgledny=0.9,
            czas_utrzymania_s=0.5,
            dziedzina=DziedzinaOdbudowy.GENERACJA,
            minimalna_moc_odniesienia_pu=0.05,
        ),
        moc_przed_zaklocaniem_pu=1.0,
        chwila_wylaczenia_s=0.5,
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert ocena.czas_odbudowy_s is None


def test_odbudowa_po_limicie_czasu_jest_niespelnieniem() -> None:
    czas = (0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0)
    moc = (1.0, 0.2, 0.2, 0.2, 0.95, 0.95, 0.95)
    ocena = ocen_odbudowe_mocy(
        _przebieg_p(czas, moc),
        KryteriumOdbudowyMocy(
            prog_wzgledny=0.9,
            czas_utrzymania_s=0.2,
            dziedzina=DziedzinaOdbudowy.GENERACJA,
            minimalna_moc_odniesienia_pu=0.05,
            maksymalny_czas_s=0.5,
        ),
        moc_przed_zaklocaniem_pu=1.0,
        chwila_wylaczenia_s=0.5,
    )
    assert ocena.werdykt is WerdyktFrt.NIE_SPELNIA
    assert ocena.czas_odbudowy_s is not None and ocena.czas_odbudowy_s > 0.5


def test_regula_progu_wzglednego_nie_jest_stosowana_slepo_do_poboru() -> None:
    """ATAK ZNAKIEM: magazyn ładujący się ``P_pre = −0,8`` p.u.

    Po zwarciu przestaje pobierać (``P ≈ 0``). Reguła ``P >= α·P_pre`` wzięta
    dosłownie jest wtedy SPEŁNIONA (``0 >= −0,72``), czyli zaprzestanie pracy
    „dowodziłoby" odbudowy. Kryterium zadeklarowane dla dziedziny GENERACJA nie
    ma tu treści i musi zwrócić NIEROZSTRZYGALNE, a nie SPELNIA.
    """
    czas = np.linspace(0.0, 2.0, 21)
    moc = np.where(czas < 0.5, -0.8, 0.0)
    przebieg = _przebieg_p(czas, moc)

    # Kontrola założenia testu: naiwna reguła orzekłaby tu spełnienie.
    assert 0.0 >= 0.9 * (-0.8), "test przestałby mierzyć defekt znaku"

    ocena_generacja = ocen_odbudowe_mocy(
        przebieg,
        KryteriumOdbudowyMocy(
            prog_wzgledny=0.9,
            czas_utrzymania_s=0.2,
            dziedzina=DziedzinaOdbudowy.GENERACJA,
            minimalna_moc_odniesienia_pu=0.05,
        ),
        moc_przed_zaklocaniem_pu=-0.8,
        chwila_wylaczenia_s=0.5,
    )
    assert ocena_generacja.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert "dziedzin" in ocena_generacja.uzasadnienie_pl

    ocena_pobor = ocen_odbudowe_mocy(
        przebieg,
        KryteriumOdbudowyMocy(
            prog_wzgledny=0.9,
            czas_utrzymania_s=0.2,
            dziedzina=DziedzinaOdbudowy.POBOR,
            minimalna_moc_odniesienia_pu=0.05,
        ),
        moc_przed_zaklocaniem_pu=-0.8,
        chwila_wylaczenia_s=0.5,
    )
    assert ocena_pobor.werdykt is WerdyktFrt.NIE_SPELNIA, ocena_pobor.uzasadnienie_pl


def test_odbudowa_poboru_liczona_w_kierunku_ladowania() -> None:
    """Strona pozytywna dziedziny POBOR: magazyn wraca do ładowania i spełnia."""
    czas = np.linspace(0.0, 2.0, 21)
    moc = np.where(czas < 0.8, 0.0, -0.78)
    ocena = ocen_odbudowe_mocy(
        _przebieg_p(czas, moc),
        KryteriumOdbudowyMocy(
            prog_wzgledny=0.9,
            czas_utrzymania_s=0.2,
            dziedzina=DziedzinaOdbudowy.POBOR,
            minimalna_moc_odniesienia_pu=0.05,
            maksymalny_czas_s=1.0,
        ),
        moc_przed_zaklocaniem_pu=-0.8,
        chwila_wylaczenia_s=0.5,
    )
    assert ocena.werdykt is WerdyktFrt.SPELNIA, ocena.uzasadnienie_pl
    assert ocena.prog_pu is not None and ocena.prog_pu < 0.0


def test_odbudowa_przy_mocy_bliskiej_zeru_jest_nierozstrzygalna() -> None:
    """``P_pre ≈ 0`` — współczynnik odbudowy P/P_pre jest NIEOKREŚLONY."""
    czas = np.linspace(0.0, 2.0, 21)
    ocena = ocen_odbudowe_mocy(
        _przebieg_p(czas, np.full(21, 0.01)),
        KryteriumOdbudowyMocy(
            prog_wzgledny=0.9,
            czas_utrzymania_s=0.2,
            dziedzina=DziedzinaOdbudowy.GENERACJA,
            minimalna_moc_odniesienia_pu=0.05,
        ),
        moc_przed_zaklocaniem_pu=0.001,
        chwila_wylaczenia_s=0.5,
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert "NIEOKREŚLONY" in ocena.uzasadnienie_pl


def test_wadliwy_przebieg_mocy_nie_jest_obserwacja_braku_odbudowy() -> None:
    """Do rundy 3 przebieg mocy nie miał ŻADNEJ kontroli osi czasu."""
    ocena = ocen_odbudowe_mocy(
        _przebieg_p((0.0, 0.5, 0.4, 1.0), (1.0, 0.2, 0.2, 0.95)),
        KryteriumOdbudowyMocy(
            prog_wzgledny=0.9,
            czas_utrzymania_s=0.05,
            dziedzina=DziedzinaOdbudowy.GENERACJA,
            minimalna_moc_odniesienia_pu=0.05,
        ),
        moc_przed_zaklocaniem_pu=1.0,
        chwila_wylaczenia_s=0.5,
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert WadaSzereguCzasowego.CZAS_NIEMONOTONICZNY in ocena.wady_szeregu


# ---------------------------------------------------------------------------
# Złożenie + 6.6 — uczciwość nazw i zakresu
# ---------------------------------------------------------------------------


def test_pelny_komplet_kryteriow_przechodzi_razem() -> None:
    """Wszystkie CZTERY liczone kryteria naraz — obwiednia, przyłączenie, Iq, odbudowa."""
    czas = np.linspace(0.0, 1.5, 31)
    napiecie = np.where(czas < 0.2, 0.6, 1.0)
    moc = np.where(czas < 0.3, 0.2, 0.95)
    prad = np.where(czas < 0.2, 0.7, 0.05)

    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(czas, napiecie),
        wymaganie=_wymaganie(
            manifest=_manifest(
                odbudowa_mocy=StatusKryterium.WYMAGANE,
                prad_bierny_wsparcia=StatusKryterium.WYMAGANE,
            ),
            kryterium_odbudowy=KRYTERIUM_ODBUDOWY_TESTOWE,
            wymaganie_pradu_biernego=WymaganiePraduBiernego(
                wspolczynnik_k=2.0, pasmo_martwe_pu=0.1
            ),
        ),
        chwila_zaklocenia_s=0.0,
        dziennik_przylaczenia=_dziennik_ciagly(),
        przebieg_mocy=_przebieg_p(czas, moc),
        moc_przed_zaklocaniem_pu=1.0,
        chwila_wylaczenia_s=0.2,
        przebieg_pradu_wsparcia=_przebieg_iq(czas, prad),
        napiecie_przed_zaklocaniem_pu=1.0,
        prad_wsparcia_przed_zaklocaniem_pu=0.0,
    )
    assert ocena.werdykt is WerdyktFrt.SPELNIA, ocena.uzasadnienie_pl
    assert ocena.kryteria_niepokryte == ()
    assert {w.kryterium for w in ocena.wiersze} == set(KRYTERIA_OCENIANE)


def test_jedno_nierozstrzygniete_kryterium_psuje_calosc() -> None:
    """Nie ma sumowania „większość kryteriów przeszła"."""
    czas = np.linspace(0.0, 1.5, 31)
    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(czas, np.full(czas.size, 0.9)),
        wymaganie=_wymaganie(
            manifest=_manifest(prad_bierny_wsparcia=StatusKryterium.WYMAGANE),
            wymaganie_pradu_biernego=WymaganiePraduBiernego(
                wspolczynnik_k=2.0, pasmo_martwe_pu=0.1
            ),
        ),
        chwila_zaklocenia_s=0.0,
        dziennik_przylaczenia=_dziennik_ciagly(),
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert KRYTERIUM_PRAD_WSPARCIA in ocena.kryteria_niepokryte


def test_white_box_nie_moze_podac_wymagania_jako_wielkosci_zmierzonej() -> None:
    """Reprodukcja P0-01 na poziomie śladu: dwa osobne pola, dwa osobne źródła."""
    czas = np.linspace(0.0, 1.5, 31)
    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(czas, np.full(czas.size, 0.35)),
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=0.0,
        dziennik_przylaczenia=_dziennik_ciagly(),
    )
    wiersz = next(w for w in ocena.wiersze if w.kryterium == KRYTERIUM_OBWIEDNIA)
    assert wiersz.zmierzone == pytest.approx(0.35)
    assert wiersz.wymagane == pytest.approx(0.15)
    assert wiersz.zmierzone != wiersz.wymagane
    assert wiersz.zrodlo_przebiegu == "symulacja_laboratoryjna"
    assert wiersz.margines == pytest.approx(0.20)


def test_uzasadnienie_minimum_mowi_o_rekonstrukcji_a_nie_o_prawdzie() -> None:
    """6.6: „dokładne minimum" dotyczy REKONSTRUKCJI liniowej, nie continuum.

    Deklaracja w uzasadnieniu jest przypięta testem, bo zdanie mocniejsze niż
    treść obliczenia wyłącza czujność skuteczniej niż sam defekt.
    """
    przebieg = _przebieg_u(np.linspace(0.0, 2.0, 21), np.full(21, 0.9))
    ocena = ocen_obwiednie_napiecia(
        przebieg, OBWIEDNIA_PLASKA, chwila_zaklocenia_s=0.0, horyzont_s=2.0
    )
    assert "rekonstrukcji" in ocena.uzasadnienie_pl
    assert "między próbkami pozostaje poza obserwacją" in ocena.uzasadnienie_pl


def test_ocena_nie_twierdzi_kompletnosci_poza_manifestem() -> None:
    """Nazwa i pola typu nie mogą sugerować „pełna fizyka FRT zwalidowana"."""
    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(np.linspace(0.0, 1.5, 31), np.full(31, 0.9)),
        wymaganie=_wymaganie(
            manifest=_manifest(
                czas_odpowiedzi_biernej=StatusKryterium.NIEOBSLUGIWANE,
                obwod_dc_modulu=StatusKryterium.NIEOBSLUGIWANE,
            )
        ),
        chwila_zaklocenia_s=0.0,
        dziennik_przylaczenia=_dziennik_ciagly(),
    )
    assert ocena.manifest_kompletny is False
    assert set(ocena.kryteria_nieobslugiwane) == {"czas_odpowiedzi_biernej", "obwod_dc_modulu"}
    assert ocena.spelnia is False
    assert "UNVALIDATED_MODEL" in ocena.status_dowodowy_pl
