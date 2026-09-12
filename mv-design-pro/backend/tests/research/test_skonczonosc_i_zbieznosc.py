"""NaN/Inf i fałszywa zbieżność ścisła — kontrprzykład audytu musi być martwy.

KOD BADAWCZY — patrz `backend/research/README.md`. Nie jest dowodem regulacyjnym.

KONTRPRZYKŁAD Z AUDYTU (plan naprawy §2), ODTWORZONY NA HEAD PRZED NAPRAWĄ::

    pochodna zwracająca NaN  ->  rk4 daje stan NaN
                             ->  nakładka niezmienników RZUTUJE NaN na granicę
                             ->  stan wraca SKOŃCZONY (1,0), dziennik: "nan -> 1.0"
                             ->  sprawozdanie: STRICT_CONVERGENCE, rho = 0,0
                             ->  silnik melduje bieg jako zbieżny

Ta sama ścieżka dla ``+Inf`` dawała ten sam wynik. Metoda niejawna kończyła
wyjątkiem, ale dopiero po WYCZERPANIU 50 iteracji i z komunikatem wskazującym
drabinę tolerancji — czyli nie tę przyczynę.

CO TE TESTY PINUJĄ (iloczyn cech, nie przykład z karty):
(rodzaj wartości: NaN, +Inf, -Inf) × (miejsce iniekcji: pochodna, residuum
Newtona, napięcie sieci, moc magazynu) × (metoda: jawna, jawna z nakładką,
niejawna) — plus kontrakt wyniku, który nie może przyjąć przebiegu z NaN.
"""

from __future__ import annotations

import numpy as np
import pytest
from dynamic_lab.calkowanie import (
    DT_KALIBRACJI_S,
    INTEGRATORY,
    KRYTERIUM_DOMYSLNE,
    KryteriumZbieznosci,
    OgraniczenieStanu,
    StatusKroku,
    z_niezmiennikami,
)
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.skonczonosc import (
    WartoscNieskonczonaError,
    jest_skonczone,
    wymagaj_skonczonosci,
)
from dynamic_lab.urzadzenia_oze import MagazynEnergiiBESS
from dynamic_lab.wynik import (
    DiagnostykaSolvera,
    KompletnoscPrzebiegu,
    PrzestrzenSygnalu,
    Sygnal,
    WynikDynamiczny,
)

WARTOSCI_NIESKONCZONE = (float("nan"), float("inf"), float("-inf"))
NAZWY_WARTOSCI = ("NaN", "+Inf", "-Inf")

_OGRANICZENIE = (
    OgraniczenieStanu(
        indeks=0,
        dol=-1.0,
        gora=1.0,
        nazwa="x0",
        znaczenie="stan testowy zawarty w przedziale [-1, 1]",
    ),
)


# ---------------------------------------------------------------------------
# Sam predykat skończoności
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("wartosc", "nazwa"), list(zip(WARTOSCI_NIESKONCZONE, NAZWY_WARTOSCI, strict=True))
)
def test_predykat_lapie_kazda_postac_nieskonczonosci(wartosc: float, nazwa: str) -> None:
    """``NaN``, ``+Inf`` i ``-Inf`` to trzy RÓŻNE wartości i każda musi być łapana.

    Predykat pisany jako ``x > gora or x < dol`` łapie nieskończoności, a gubi
    ``NaN``; pisany jako ``x != x`` łapie ``NaN``, a gubi nieskończoności. Iloczyn
    trzech wartości wyklucza obie połowiczne naprawy.
    """
    assert not jest_skonczone(wartosc)
    with pytest.raises(WartoscNieskonczonaError, match="nie jest liczbą skończoną"):
        wymagaj_skonczonosci(wartosc, co="wielkość testowa", gdzie=nazwa)


def test_komunikat_wskazuje_INDEKSY_niepoprawnych_pozycji() -> None:
    """„Coś jest NaN" nie pozwala znaleźć modelu, który to wyprodukował."""
    wektor = np.array([0.1, float("nan"), 0.3, float("inf")], dtype=np.float64)
    with pytest.raises(WartoscNieskonczonaError) as blad:
        wymagaj_skonczonosci(wektor, co="stan", gdzie="urządzenie X")
    tresc = str(blad.value)
    assert "[1]" in tresc and "[3]" in tresc
    assert "urządzenie X" in tresc


def test_wartosci_skonczone_przechodza_bez_zmian() -> None:
    """DRUGA STRONA PREDYKATU — kontrola, która blokuje wszystko, jest zaporą."""
    wymagaj_skonczonosci(np.array([1.0, -2.5, 0.0]), co="stan", gdzie="test")
    wymagaj_skonczonosci(0.0, co="skalar", gdzie="test")
    wymagaj_skonczonosci(np.array([], dtype=np.float64), co="pusty", gdzie="test")
    assert jest_skonczone(np.array([1.0, 2.0]))


# ---------------------------------------------------------------------------
# §2 iniekcja 1 — POCHODNA
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("wartosc", WARTOSCI_NIESKONCZONE)
@pytest.mark.parametrize("integrator", ["euler_jawny", "rk4"])
def test_metoda_jawna_nie_melduje_zbieznosci_przy_niepoprawnej_pochodnej(
    wartosc: float, integrator: str
) -> None:
    """Kontrprzykład audytu, część pierwsza: metoda JAWNA bez nakładki.

    „Nie ma układu nieliniowego, więc nie ma czego nie zbiec" jest prawdą tylko
    wtedy, gdy krok w ogóle WYPRODUKOWAŁ liczby.
    """

    def pochodna(x: np.ndarray, t: float) -> np.ndarray:
        return np.array([wartosc], dtype=np.float64)

    with pytest.raises(WartoscNieskonczonaError):
        INTEGRATORY[integrator].krok_ze_sprawozdaniem(
            pochodna, np.array([0.5], dtype=np.float64), 0.0, 0.01
        )


@pytest.mark.parametrize("wartosc", WARTOSCI_NIESKONCZONE)
def test_nakladka_niezmiennikow_NIE_RZUTUJE_wartosci_niepoprawnej(wartosc: float) -> None:
    """Kontrprzykład audytu, część druga: rzutowanie zamieniało awarię w przebieg.

    Zmierzone przed naprawą: ``x0: nan -> 1.0 (granica gora)`` w dzienniku
    rzutowań, stan skończony, status ``STRICT_CONVERGENCE``. ``NaN`` nie jest ani
    w przedziale, ani poza nim — nie ma czego rzutować.
    """

    def pochodna(x: np.ndarray, t: float) -> np.ndarray:
        return np.array([wartosc], dtype=np.float64)

    integrator = z_niezmiennikami("rk4", _OGRANICZENIE)
    with pytest.raises(WartoscNieskonczonaError):
        integrator.krok_ze_sprawozdaniem(pochodna, np.array([0.5], dtype=np.float64), 0.0, 0.01)
    assert integrator.dziennik.bez_rzutowan, (
        "wartość niepoprawna NIE MOŻE trafić do dziennika rzutowań — "
        f"zapisano: {[z.wartosc_przed for z in integrator.dziennik.zapisy]}"
    )


@pytest.mark.parametrize("wartosc", WARTOSCI_NIESKONCZONE)
def test_krok_BEZ_sprawozdania_tez_nie_rzutuje_wartosci_niepoprawnej(wartosc: float) -> None:
    """Druga ścieżka nakładki: ``krok()`` NIE przechodzi przez sprawozdanie kroku.

    LUKA ZNALEZIONA PRZEZ KAMPANIĘ MUTACYJNĄ (mutacja M-NUM-03, plan naprawy §4).
    Przy pierwszym przebiegu kampanii mutacja przywracająca rzutowanie ``NaN`` na
    granicę PRZEŻYŁA: testy nakładki wołały wyłącznie ``krok_ze_sprawozdaniem``,
    a tam kontrola skończoności stanu stoi już w `_sprawozdanie_metody_jawnej` i
    podnosi wyjątek WCZEŚNIEJ. Ścieżka ``krok()`` — używana wszędzie tam, gdzie
    wołający nie potrzebuje sprawozdania — nie była badana wcale, więc jej jedyny
    strażnik (kontrola przed rzutowaniem) mógł zniknąć niezauważony.
    """

    def pochodna(x: np.ndarray, t: float) -> np.ndarray:
        return np.array([wartosc], dtype=np.float64)

    integrator = z_niezmiennikami("rk4", _OGRANICZENIE)
    with pytest.raises(WartoscNieskonczonaError, match="przed rzutowaniem"):
        integrator.krok(pochodna, np.array([0.5], dtype=np.float64), 0.0, 0.01)
    assert integrator.dziennik.bez_rzutowan


@pytest.mark.parametrize("wartosc", WARTOSCI_NIESKONCZONE)
@pytest.mark.parametrize("integrator", ["euler_niejawny", "trapez_niejawny"])
def test_metoda_niejawna_zglasza_przyczyne_a_nie_drabine_tolerancji(
    wartosc: float, integrator: str
) -> None:
    """Metoda niejawna kończyła wyjątkiem, ale po 50 iteracjach i z złym powodem.

    Komunikat „nie zbiegł w 50 iteracjach — sprawdź drabinę tolerancji" wysyłał
    czytelnika w miejsce, w którym nic nie było. Przyczyna jest znana w pierwszej
    ewaluacji ``f`` i tam musi zostać nazwana.
    """

    def pochodna(x: np.ndarray, t: float) -> np.ndarray:
        return np.array([wartosc], dtype=np.float64)

    with pytest.raises(WartoscNieskonczonaError, match="pochodna"):
        INTEGRATORY[integrator].krok_ze_sprawozdaniem(
            pochodna, np.array([0.5], dtype=np.float64), 0.0, 0.01
        )


# ---------------------------------------------------------------------------
# §2 iniekcja 2 — RESIDUUM kryterium zbieżności
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("wartosc", WARTOSCI_NIESKONCZONE)
def test_kryterium_zbieznosci_nie_porownuje_wartosci_niepoprawnej(wartosc: float) -> None:
    """``rho = NaN`` przechodziło przez OBA warunki iteracji jako fałsz.

    ``NaN <= 1`` jest fałszem (więc brak zbieżności) i ``NaN > 0,5·poprzednia``
    też jest fałszem (więc brak zastoju) — iteracja nie widziała ani jednego, ani
    drugiego i paliła komplet kroków.
    """
    residuum = np.array([wartosc], dtype=np.float64)
    with pytest.raises(WartoscNieskonczonaError, match="residuum"):
        KRYTERIUM_DOMYSLNE.rho(
            residuum,
            np.array([1.0], dtype=np.float64),
            np.array([1.0], dtype=np.float64),
            dt=DT_KALIBRACJI_S,
            rzad=2,
        )


def test_kryterium_zbieznosci_dziala_dla_residuum_poprawnego() -> None:
    """DRUGA STRONA PREDYKATU — kryterium musi nadal liczyć rho.

    Krok równy ``DT_KALIBRACJI_S`` dobrany świadomie: przy nim współczynnik
    skalowania wynosi dokładnie 1, więc ``atol`` znaczy to, co deklaruje, i test
    sprawdza SAMO kryterium, nie kalibrację.
    """
    kryterium = KryteriumZbieznosci(atol=1.0e-9, rtol=0.0)
    rho = kryterium.rho(
        np.array([1.0e-9], dtype=np.float64),
        np.array([1.0], dtype=np.float64),
        np.array([1.0], dtype=np.float64),
        dt=DT_KALIBRACJI_S,
        rzad=2,
    )
    assert rho == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# §2 — STRICT_CONVERGENCE jest twierdzeniem, nie wartością domyślną
# ---------------------------------------------------------------------------


def test_status_zastoju_i_niepowodzenia_pozostaja_rozlaczne() -> None:
    """Trzy stany, bez trzeciej drogi „sukcesu" — i żaden nie jest tym samym."""
    assert StatusKroku.STRICT_CONVERGENCE is not StatusKroku.STAGNATED_AT_NUMERICAL_FLOOR
    assert StatusKroku.STRICT_CONVERGENCE is not StatusKroku.FAILED
    assert StatusKroku.STAGNATED_AT_NUMERICAL_FLOOR is not StatusKroku.FAILED
    assert len({s.value for s in StatusKroku}) == 3


def test_krok_poprawny_nadal_melduje_zbieznosc_scisla() -> None:
    """DRUGA STRONA PREDYKATU — kontrola, która nigdy nie przepuszcza, jest zaporą."""

    def pochodna(x: np.ndarray, t: float) -> np.ndarray:
        return -x

    x1, sprawozdanie = INTEGRATORY["rk4"].krok_ze_sprawozdaniem(
        pochodna, np.array([0.5], dtype=np.float64), 0.0, 0.01
    )
    assert sprawozdanie.status is StatusKroku.STRICT_CONVERGENCE
    assert sprawozdanie.strict_convergence
    assert jest_skonczone(x1)


# ---------------------------------------------------------------------------
# §2 iniekcja 3 — NAPIĘCIE SIECI, iniekcja 4 — MOC MAGAZYNU
# ---------------------------------------------------------------------------


def _model_z_magazynem() -> tuple[ModelDynamiczny, MagazynEnergiiBESS]:
    topologia = TopologiaSieci(
        szyny=("BAT", "SYS"),
        galezie=[Galaz("BAT", "SYS", 0.01, 0.05)],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    magazyn = MagazynEnergiiBESS(ref="BAT", szyna="BAT", e_pojemnosc_mwh=1.0, s_bazowa_mva=100.0)
    return (
        ModelDynamiczny(topologia=topologia, urzadzenia=[magazyn], s_bazowa_mva=100.0),
        magazyn,
    )


@pytest.mark.parametrize("wartosc", WARTOSCI_NIESKONCZONE)
def test_niepoprawna_moc_magazynu_zatrzymuje_bieg(
    monkeypatch: pytest.MonkeyPatch, wartosc: float
) -> None:
    """Iniekcja w MOC URZĄDZENIA — wielkość, z której bierze się prąd i SOC.

    Magazyn jest tu wybrany nieprzypadkowo: jego moc wchodzi jednocześnie do
    algebry sieci, do zapisu przebiegu i do równania stanu naładowania. Cicha
    ``NaN`` rozlałaby się na wszystkie trzy.
    """
    model, magazyn = _model_z_magazynem()
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.005)
    x0 = silnik.inicjalizuj({"BAT": complex(0.3, 0.0)})

    def wstrzykniecie_zepsute(x, v_szyny):  # noqa: ANN001, ANN202
        return complex(wartosc, 0.0)

    monkeypatch.setattr(magazyn, "wstrzykniecie", wstrzykniecie_zepsute)
    with pytest.raises(WartoscNieskonczonaError, match="prąd wstrzykiwany"):
        silnik.symuluj(x0, czas_koncowy_s=0.05)


@pytest.mark.parametrize("wartosc", WARTOSCI_NIESKONCZONE)
def test_niepoprawna_pochodna_urzadzenia_zatrzymuje_bieg(
    monkeypatch: pytest.MonkeyPatch, wartosc: float
) -> None:
    """Iniekcja w POCHODNĄ URZĄDZENIA — bieg zatrzymany i ADRES defektu w wyniku.

    INTENCJA BEZ ZMIAN, DROGA MELDUNKU PRZEPISANA DO KANONU SILNIKA. Pierwsza
    wersja żądała wyjątku z ``symuluj()``. Było to niespójne z pozostałymi
    niepowodzeniami biegu (rozbieżny Newton, osobliwa macierz, limit iteracji),
    które silnik od dawna melduje przez ``diagnostyka.blad`` — a wyciek wyjątku
    z ``symuluj()`` jest w tym module udokumentowany jako DEFEKT (patrz komentarz
    o ``BrakZbieznosciSieciError``). Skutkiem było zgłaszanie JEDNEGO zjawiska —
    wartości nieskończonej w trakcie biegu — dwiema drogami zależnie od tego,
    która wielkość ją niosła.

    Granica przebiega po pytaniu „czy zagadnienie początkowe istnieje":
    niepoprawny PRĄD albo NAPIĘCIE uniemożliwiają wyznaczenie ``y(0)``, więc
    zagadnienia nie ma i leci wyjątek (dwa testy obok). Niepoprawna POCHODNA
    zostawia ``x0`` i ``y0`` policzone i skończone — zagadnienie istnieje, więc
    bieg rusza i melduje przyczynę w wyniku.

    Test sprawdza to, po co powstał: bieg NIE UCHODZI za zbieżny, a wynik
    wskazuje URZĄDZENIE i STAN.
    """
    model, magazyn = _model_z_magazynem()
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.005)
    x0 = silnik.inicjalizuj({"BAT": complex(0.3, 0.0)})

    def pochodne_zepsute(x, v_szyny):  # noqa: ANN001, ANN202
        return np.array([wartosc, 0.0, 0.0, 0.0, 0.0], dtype=np.float64)

    monkeypatch.setattr(magazyn, "pochodne", pochodne_zepsute)
    wynik = silnik.symuluj(x0, czas_koncowy_s=0.05)

    blad = wynik.diagnostyka.blad
    assert wynik.diagnostyka.zbiegl is False
    assert blad is not None
    assert blad.klasa == "WartoscNieskonczonaError"
    assert blad.faza == "calkowanie"
    assert blad.wielkosc_niesksonczona == "pochodna stanu"
    assert "BAT" in blad.komunikat
    # ADRES: pierwszy stan magazynu, nie „któryś".
    assert blad.stany_niesksonczone
    assert all(nazwa.startswith("BAT.") for nazwa in blad.stany_niesksonczone)
    # Bieg NIE dostaje statusu pełnego przebiegu ani zmierzonej normy startowej.
    assert wynik.diagnostyka.kompletnosc is KompletnoscPrzebiegu.PRZERWANY_BLEDEM
    assert wynik.diagnostyka.norma_pochodnej_w_t0 is None


def test_granica_wyjatek_kontra_blad_w_wyniku_jest_jednym_predykatem() -> None:
    """REGUŁA, nie przypadek: co wychodzi wyjątkiem, a co wynikiem.

    Ten test istnieje, bo dwa poprzednie i trzy sąsiednie opisują DWIE różne
    drogi meldunku. Bez przypięcia samej reguły wyglądałyby na niekonsekwencję,
    a pierwsza zmiana w silniku rozjechałaby je po cichu (deklaracja bez testu
    jest fałszywą pewnością).

    REGUŁA: rozstrzyga ISTNIENIE zagadnienia początkowego ``(x₀, y₀)``.
    Nieobliczalne ``y₀`` -> wyjątek (nie ma biegu). Obliczalne ``y₀`` i zerwana
    kontynuacja -> wynik z ``diagnostyka.blad`` (bieg był, nie doszedł).
    """
    model, magazyn = _model_z_magazynem()
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.005)
    x0 = silnik.inicjalizuj({"BAT": complex(0.3, 0.0)})

    # STRONA „NIE MA ZAGADNIENIA": prąd niepoprawny => `y0` nie istnieje.
    oryginalne_wstrzykniecie = magazyn.wstrzykniecie
    magazyn.wstrzykniecie = lambda x, v: complex(float("nan"), 0.0)  # type: ignore[method-assign]
    try:
        with pytest.raises(WartoscNieskonczonaError):
            silnik.symuluj(x0, czas_koncowy_s=0.05)
    finally:
        magazyn.wstrzykniecie = oryginalne_wstrzykniecie  # type: ignore[method-assign]

    # STRONA „ZAGADNIENIE JEST, BIEG SIĘ URWAŁ": pochodna niepoprawna.
    oryginalne_pochodne = magazyn.pochodne
    magazyn.pochodne = lambda x, v: np.full(5, float("nan"))  # type: ignore[method-assign]
    try:
        wynik = silnik.symuluj(x0, czas_koncowy_s=0.05)
    finally:
        magazyn.pochodne = oryginalne_pochodne  # type: ignore[method-assign]
    assert wynik.diagnostyka.blad is not None
    assert wynik.diagnostyka.zbiegl is False


@pytest.mark.parametrize("wartosc", WARTOSCI_NIESKONCZONE)
def test_niepoprawne_napiecie_sieci_zatrzymuje_bieg(
    monkeypatch: pytest.MonkeyPatch, wartosc: float
) -> None:
    """Iniekcja w NAPIĘCIE — wejście KAŻDEGO modelu urządzenia w tym kroku."""
    model, _ = _model_z_magazynem()
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.005)
    x0 = silnik.inicjalizuj({"BAT": complex(0.3, 0.0)})

    oryginalny = silnik.solver_sieci.rozwiaz

    def rozwiaz_zepsuty(wstrzykniecia, start):  # noqa: ANN001, ANN202
        wynik = oryginalny(wstrzykniecia, start)
        zepsute = wynik.napiecia.copy()
        zepsute[0] = complex(wartosc, 0.0)
        return type(wynik)(napiecia=zepsute, residuum=wynik.residuum, iteracje=wynik.iteracje)

    monkeypatch.setattr(silnik.solver_sieci, "rozwiaz", rozwiaz_zepsuty)
    with pytest.raises(WartoscNieskonczonaError, match="napięcia sieci"):
        silnik.symuluj(x0, czas_koncowy_s=0.05)


# ---------------------------------------------------------------------------
# §2 — KONTRAKT WYNIKU odrzuca wynik nieinterpretowalny
# ---------------------------------------------------------------------------


def _sprawna_diagnostyka(**nadpisania) -> DiagnostykaSolvera:
    parametry = {
        "integrator": "rk4",
        "krok_s": 0.01,
        "liczba_krokow": 2,
        "ewaluacje_pochodnych": 8,
        "maks_residuum_sieci": 1.0e-12,
        "maks_iteracji_sieci": 3,
        "zbiegl": True,
        "norma_pochodnej_w_t0": 0.0,
        "czas_zadany_s": 0.02,
        "czas_osiagniety_s": 0.02,
        "kroki_scisle_zbiezne": 2,
    }
    parametry.update(nadpisania)
    return DiagnostykaSolvera(**parametry)


def _wynik(czas: tuple[float, ...], wartosci: tuple[float, ...]) -> WynikDynamiczny:
    return WynikDynamiczny(
        kontrakt="test",
        czas_s=czas,
        sygnaly=(
            Sygnal(
                klucz="u_pu",
                etykieta_pl="Napięcie",
                jednostka="p.u.",
                element_ref="SZYNA",
                wartosci=wartosci,
                przestrzen=PrzestrzenSygnalu.WYJSCIE,
            ),
        ),
        modele=(),
        zdarzenia=(),
        diagnostyka=_sprawna_diagnostyka(),
        odcisk_scenariusza="a" * 64,
        odcisk_topologii="b" * 64,
    )


def test_wynik_poprawny_daje_sie_zbudowac() -> None:
    """DRUGA STRONA PREDYKATU — kontrakt, który odrzuca wszystko, jest zaporą."""
    wynik = _wynik((0.0, 0.01, 0.02), (1.0, 0.99, 0.98))
    assert wynik.czas_s[-1] == pytest.approx(0.02)


@pytest.mark.parametrize("wartosc", WARTOSCI_NIESKONCZONE)
def test_wynik_z_niepoprawna_probka_przebiegu_jest_odrzucony(wartosc: float) -> None:
    """Przebieg z ``NaN`` rysuje się jako przerwa i bywa brany za „brak danych"."""
    with pytest.raises(WartoscNieskonczonaError, match="przebieg"):
        _wynik((0.0, 0.01, 0.02), (1.0, wartosc, 0.98))


@pytest.mark.parametrize("wartosc", WARTOSCI_NIESKONCZONE)
def test_wynik_z_niepoprawna_chwila_czasu_jest_odrzucony(wartosc: float) -> None:
    """Oś czasu z ``NaN`` odpadała dotąd na monotoniczności — z ZŁYM komunikatem."""
    with pytest.raises(WartoscNieskonczonaError, match="oś czasu"):
        _wynik((0.0, wartosc, 0.02), (1.0, 0.99, 0.98))


@pytest.mark.parametrize(
    "pole",
    ["krok_s", "maks_residuum_sieci", "norma_pochodnej_w_t0", "najgorsze_rho"],
)
@pytest.mark.parametrize("wartosc", WARTOSCI_NIESKONCZONE)
def test_diagnostyka_z_niepoprawna_liczba_jest_odrzucona(pole: str, wartosc: float) -> None:
    """Iloczyn (pole diagnostyki) × (postać nieskończoności).

    ``NaN`` w ``najgorsze_rho`` przechodził przez warunek
    ``kroki_na_podlodze_numerycznej == 0 and najgorsze_rho > 1`` jako fałsz —
    więc bieg z rozjechaną numeryką wyglądał na bieg o doskonałej diagnostyce.
    """
    with pytest.raises(WartoscNieskonczonaError, match=pole):
        _sprawna_diagnostyka(**{pole: wartosc})


def test_kontrakt_wyniku_nadal_lapie_niezgodna_dlugosc_i_niemonotonicznosc() -> None:
    """Kontrole, które BYŁY — dodanie skończoności nie może ich przesłonić.

    Skończoność jest sprawdzana PRZED nimi, więc łatwo było je uczynić martwymi:
    gdyby nowa kontrola odrzucała wszystko, poniższe komunikaty nigdy by nie padły.
    """
    from dynamic_lab.wynik import (
        NiemonotonicznaOsCzasuError,
        NiezgodnaDlugoscPrzebieguError,
    )

    with pytest.raises(NiezgodnaDlugoscPrzebieguError):
        _wynik((0.0, 0.01, 0.02), (1.0, 0.99))
    with pytest.raises(NiemonotonicznaOsCzasuError):
        _wynik((0.0, 0.02, 0.01), (1.0, 0.99, 0.98))
