"""FRT: pokrycie horyzontu, dokładne minimum, stan przyłączenia, trwała odbudowa.

PO CO TEN PLIK. Audyt kontradyktoryjny wykazał, że ocena FRT mogła wypaść
pozytywnie w czterech sytuacjach, w których wypaść pozytywnie nie mogła:

  1. przebieg kończył się przed końcem wymaganego okna (0,4 s danych oceniane
     jako spełnienie wymagania na 2 s);
  2. margines liczony był WYŁĄCZNIE w chwilach próbek przebiegu, więc załamanie
     obwiedni wypadające między dwiema próbkami było niewidoczne;
  3. moduł mógł się odłączyć w trakcie zapadu, a ocena tego nie widziała, bo
     „brak sygnału wyłączenia" czytano jako „był przyłączony";
  4. odbudowa mocy była pierwszą próbką powyżej progu, więc jednopróbkowy
     przeskok liczył się jak odbudowa.

Każdy test poniżej jest skonstruowany tak, żeby przy STARYM zachowaniu wypaść
na zielono z błędnym werdyktem — dlatego mierzy naprawę, a nie samą składnię.
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.frt import (
    BrakPokryciaOkna,
    KryteriumOdbudowyMocy,
    ObwiedniaFrt,
    PrzebiegNapiecia,
    PrzebiegSkalarny,
    StanPrzylaczenia,
    WerdyktFrt,
    WymaganiePraduBiernego,
    WymaganieZdolnosciFrt,
    ocen_obwiednie_napiecia,
    ocen_odbudowe_mocy,
    ocen_zdolnosc_frt,
)

OBWIEDNIA_PLASKA = ObwiedniaFrt(rodzaj="lvrt", punkty=((0.0, 0.15), (1.5, 0.15)))


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


# ---------------------------------------------------------------------------
# C2 — pokrycie horyzontu
# ---------------------------------------------------------------------------


def test_przebieg_krotszy_od_horyzontu_nie_moze_spelnic() -> None:
    """0,4 s poprawnych danych NIE jest spełnieniem wymagania na 2 s.

    Napięcie w całym dostępnym oknie leży wysoko nad obwiednią, więc przy starym
    zachowaniu (maska ``t <= chwila + horyzont`` bez sprawdzenia, czy przebieg
    sięga końca) werdykt byłby SPELNIA.
    """
    przebieg = _przebieg_u(np.linspace(0.0, 0.4, 5), np.full(5, 0.9))
    ocena = ocen_obwiednie_napiecia(
        przebieg, OBWIEDNIA_PLASKA, chwila_zaklocenia_s=0.0, horyzont_s=2.0
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert BrakPokryciaOkna.OKNO_NIEDOMKNIETE in ocena.braki_pokrycia
    assert ocena.margines_pu is None


def test_przebieg_pokrywajacy_horyzont_rozstrzyga() -> None:
    """Strona pozytywna — bez niej test wyżej przechodziłby też przy funkcji
    odrzucającej WSZYSTKO."""
    przebieg = _przebieg_u(np.linspace(0.0, 2.0, 21), np.full(21, 0.9))
    ocena = ocen_obwiednie_napiecia(
        przebieg, OBWIEDNIA_PLASKA, chwila_zaklocenia_s=0.0, horyzont_s=2.0
    )
    assert ocena.werdykt is WerdyktFrt.SPELNIA
    assert ocena.braki_pokrycia == ()


def test_przebieg_zaczynajacy_sie_po_zaklocaniu_jest_nierozstrzygalny() -> None:
    przebieg = _przebieg_u(np.linspace(0.5, 2.0, 16), np.full(16, 0.9))
    ocena = ocen_obwiednie_napiecia(
        przebieg, OBWIEDNIA_PLASKA, chwila_zaklocenia_s=0.0, horyzont_s=2.0
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert BrakPokryciaOkna.POCZATEK_PO_ZAKLOCENIU in ocena.braki_pokrycia


@pytest.mark.parametrize(
    ("czas", "oczekiwany"),
    [
        ((0.0, 0.5, 0.4, 1.0, 2.0), BrakPokryciaOkna.CZAS_NIEMONOTONICZNY),
        ((0.0, 0.5, 0.5, 1.0, 2.0), BrakPokryciaOkna.CZAS_ZDUBLOWANY),
    ],
)
def test_wadliwa_os_czasu_jest_wykrywana(czas, oczekiwany) -> None:
    przebieg = _przebieg_u(czas, (0.9,) * len(czas))
    ocena = ocen_obwiednie_napiecia(
        przebieg, OBWIEDNIA_PLASKA, chwila_zaklocenia_s=0.0, horyzont_s=2.0
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert oczekiwany in ocena.braki_pokrycia


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
    assert BrakPokryciaOkna.ZBYT_RZADKIE_PROBKI in ocena.braki_pokrycia


# ---------------------------------------------------------------------------
# C3 — dokładne minimum marginesu na wspólnej siatce
# ---------------------------------------------------------------------------


def test_zalamanie_obwiedni_miedzy_probkami_nie_moze_zostac_pominiete() -> None:
    """To jest dowód poprawki C3 — i sam w sobie dowód, że stary sposób był błędny.

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
    assert min(w_probkach) > 0.0, "test przestałby mierzyć poprawkę C3"

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
# C5 — odbudowa mocy jako zdarzenie TRWAŁE
# ---------------------------------------------------------------------------


def test_jednoprobkowy_przeskok_mocy_nie_jest_odbudowa() -> None:
    """Przypadek wprost z karty: P przekracza 90 % na jedną próbkę, spada,
    później wraca trwale. Wynik ma wskazać DOPIERO drugi moment."""
    czas = (0.0, 0.5, 0.6, 0.7, 0.8, 1.0, 1.1, 1.2, 1.5, 2.0)
    moc = (1.0, 0.20, 0.30, 0.95, 0.30, 0.30, 0.95, 0.95, 0.95, 0.95)
    ocena = ocen_odbudowe_mocy(
        _przebieg_p(czas, moc),
        KryteriumOdbudowyMocy(prog_wzgledny=0.9, czas_utrzymania_s=0.2),
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
        KryteriumOdbudowyMocy(prog_wzgledny=0.9, czas_utrzymania_s=0.5),
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
        KryteriumOdbudowyMocy(prog_wzgledny=0.9, czas_utrzymania_s=0.2, maksymalny_czas_s=0.5),
        moc_przed_zaklocaniem_pu=1.0,
        chwila_wylaczenia_s=0.5,
    )
    assert ocena.werdykt is WerdyktFrt.NIE_SPELNIA
    assert ocena.czas_odbudowy_s is not None and ocena.czas_odbudowy_s > 0.5


# ---------------------------------------------------------------------------
# C1 + C4 — pełna zdolność FRT i stan przyłączenia
# ---------------------------------------------------------------------------


def _wymaganie(**nadpisania) -> WymaganieZdolnosciFrt:
    parametry = {
        "obwiednia": OBWIEDNIA_PLASKA,
        "horyzont_s": 1.5,
        "wymaga_stanu_przylaczenia": True,
        "identyfikator_profilu": "PROFIL-TESTOWY-1",
    }
    parametry.update(nadpisania)
    return WymaganieZdolnosciFrt(**parametry)  # type: ignore[arg-type]


def test_brak_stanu_przylaczenia_daje_nierozstrzygalne() -> None:
    """BRAK sygnału wyłączenia NIE jest dowodem przyłączenia."""
    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(np.linspace(0.0, 1.5, 16), np.full(16, 0.9)),
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=0.0,
        stan_przylaczenia=None,
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert "stan_przylaczenia" in ocena.kryteria_niepokryte


def test_odlaczenie_przy_poprawnym_napieciu_daje_niespelnienie() -> None:
    """Napięcie cały czas nad obwiednią, a mimo to moduł wypada — bo się odłączył."""
    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(np.linspace(0.0, 1.5, 16), np.full(16, 0.9)),
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=0.0,
        stan_przylaczenia=StanPrzylaczenia(
            czas_s=(0.0, 0.3, 0.6, 1.5),
            przylaczony=(True, True, False, False),
            zrodlo="model_zabezpieczen",
        ),
    )
    assert ocena.werdykt is WerdyktFrt.NIE_SPELNIA
    wiersz = next(w for w in ocena.wiersze if w.kryterium == "stan_przylaczenia")
    assert wiersz.werdykt is WerdyktFrt.NIE_SPELNIA
    assert wiersz.chwila_s == pytest.approx(0.6)


def test_pelna_zdolnosc_spelniona_gdy_komplet_kryteriow_przechodzi() -> None:
    czas = np.linspace(0.0, 1.5, 31)
    moc = np.where(czas < 0.3, 0.2, 0.95)
    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(czas, np.full(czas.size, 0.9)),
        wymaganie=_wymaganie(
            kryterium_odbudowy=KryteriumOdbudowyMocy(
                prog_wzgledny=0.9, czas_utrzymania_s=0.2, maksymalny_czas_s=1.0
            )
        ),
        chwila_zaklocenia_s=0.0,
        stan_przylaczenia=StanPrzylaczenia(
            czas_s=(0.0, 1.5), przylaczony=(True, True), zrodlo="model_zabezpieczen"
        ),
        przebieg_mocy=_przebieg_p(czas, moc),
        moc_przed_zaklocaniem_pu=1.0,
        chwila_wylaczenia_s=0.2,
    )
    assert ocena.werdykt is WerdyktFrt.SPELNIA, ocena.uzasadnienie_pl
    assert ocena.kryteria_niepokryte == ()


def test_jedno_nierozstrzygniete_kryterium_psuje_calosc() -> None:
    """Nie ma sumowania „większość kryteriów przeszła"."""
    czas = np.linspace(0.0, 1.5, 31)
    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(czas, np.full(czas.size, 0.9)),
        wymaganie=_wymaganie(
            wymaganie_pradu_biernego=WymaganiePraduBiernego(wspolczynnik_k=2.0),
        ),
        chwila_zaklocenia_s=0.0,
        stan_przylaczenia=StanPrzylaczenia(
            czas_s=(0.0, 1.5), przylaczony=(True, True), zrodlo="model_zabezpieczen"
        ),
    )
    assert ocena.werdykt is WerdyktFrt.NIEROZSTRZYGALNE
    assert "prad_bierny" in ocena.kryteria_niepokryte


def test_white_box_nie_moze_podac_wymagania_jako_wielkosci_zmierzonej() -> None:
    """Reprodukcja P0-01 na poziomie śladu: dwa osobne pola, dwa osobne źródła."""
    czas = np.linspace(0.0, 1.5, 31)
    ocena = ocen_zdolnosc_frt(
        przebieg_napiecia=_przebieg_u(czas, np.full(czas.size, 0.35)),
        wymaganie=_wymaganie(),
        chwila_zaklocenia_s=0.0,
        stan_przylaczenia=StanPrzylaczenia(
            czas_s=(0.0, 1.5), przylaczony=(True, True), zrodlo="model_zabezpieczen"
        ),
    )
    wiersz = next(w for w in ocena.wiersze if w.kryterium.startswith("obwiednia"))
    assert wiersz.zmierzone == pytest.approx(0.35)
    assert wiersz.wymagane == pytest.approx(0.15)
    assert wiersz.zmierzone != wiersz.wymagane
    assert wiersz.zrodlo_przebiegu == "symulacja_laboratoryjna"
    assert wiersz.margines == pytest.approx(0.20)
