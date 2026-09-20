"""Rozklad sieci na WYSPY i odmowa dla wyspy BEZ ZRODLA (R10 par. 9, defekt F-8).

CO TU JEST. Podzial zbioru wezlow na spojne skladowe grafu AKTYWNYCH galezi oraz
JEDEN predykat fizyczny: czy wyspa, ktora niesie odbior, ma cokolwiek, co moze go
zasilic. Zero rownan ruchu, zero calkowania — to jest warunek ISTNIENIA punktu
pracy, sprawdzany ZANIM Newton dostanie uklad, ktorego rozwiazania nie ma.

PO CO. Pomiar (R10 par. 8, odtworzenie kontrprzykladu recenzenta) pokazal, ze
uklad `Ybus = 0` + odbior o stalej mocy `S = 1,0 + j0,2` konczy sie na DWA sposoby,
zaleznie wylacznie od nastaw, i zaden z nich nie jest uczciwy:

* `tolerancja = 1e-100, max_iteracji = 400` -> surowy `OverflowError` z
  `siec.jakobian_pradu_odbioru` (`mianownik**2` przy `|V| ~ 1e154`),
* `tolerancja = 1e-11, max_iteracji = 60` (nastawy ROBOCZE) -> „ZBIEZNOSC" po 37
  iteracjach z `|V| = 137 438 953 472 pu` i residuum `7,42e-12`.

Drugi przypadek jest grozniejszy od pierwszego, bo nie zostawia zadnego sladu:
wynik jest skonczony (wiec przechodzi straznika skonczonosci) i ma residuum
ponizej tolerancji (wiec przechodzi kryterium zbieznosci). Mechanizm jest
elementarny: dla `Ybus = 0` residuum wynosi `‖g‖ = |S| / |V|`, wiec KAZDA
tolerancja jest osiagalna przez samo odjechanie napiecia do nieskonczonosci.
NORMA RESIDUUM NIE JEST SWIADECTWEM WAZNOSCI, gdy rozwiazanie istnieje wylacznie
w granicy — i zadne zaostrzenie tolerancji tego nie naprawia, bo dziala w zla
strone (mniejsza tolerancja = wieksze `|V|`).

Dlatego naprawa jest STRUKTURALNA, nie wyjatkowa: nie `except OverflowError`,
tylko rozpoznanie stanu sieci, w ktorym punktu pracy nie ma.

PREDYKAT. Wyspa jest BEZ ZRODLA, gdy ZADNE przylaczone do niej urzadzenie nie
wnosi nic do jej algebry — ani pradu (`prad_pu == 0`), ani pochodnej pradu po
napieciu (`jakobian_prad_napiecie == 0`). Predykat jest MIERZONY z samych rownan
urzadzenia, nie z listy rodzin: dzieki temu obejmuje bez osobnej galezi zarowno
urzadzenie odlaczone zdarzeniem (`UrzadzenieOdlaczone` zwraca dokladnie te dwa
zera), jak i przeksztaltnik sieciowy (grid-following) o zerowym zadaniu pradu.
Lista rodzin rozjechalaby sie z fizyka przy pierwszym nowym modelu; rownania nie.

DLACZEGO WARUNKIEM JEST ODBIOR, A NIE SAMO ZRODLO. Wyspa bez zrodla i BEZ odbioru
ma rozwiazanie fizyczne (`V = 0` — wyspa martwa) i ten rdzen jej nie odmawia; gdy
wyspa nie ma drogi do ziemi, konczy sie to osobliwym jakobianem i nazwana odmowa
`dynamika.algebra_niezbiezna`. Odmowa nalezy sie dokladnie temu przypadkowi, w
ktorym odbior o stalej mocy ZADA mocy, ktorej w wyspie nie ma z czego wziac:

* bez drogi do ziemi rozwiazania nie ma wcale (`|V| -> nieskonczonosc`),
* z sama droga do ziemi (bocznik, admitancja zwarcia, pojemnosc poprzeczna)
  rownanie wyznacza co najwyzej MODUL napiecia, a kat zostaje swobodny, wiec
  rozwiazania IZOLOWANEGO nadal nie ma.

W obu przypadkach nie istnieje punkt pracy, wokol ktorego mozna calkowac.
"""

from __future__ import annotations

import numpy as np

from .kontrakty import (
    KOD_WYSPA_BEZ_ZRODLA,
    GalazDynamiki,
    OdbiorDynamiki,
    OdmowaDynamiki,
    Urzadzenie,
)


def przydzial_wysp(
    identy_wezlow: tuple[str, ...],
    indeks_wezla: dict[str, int],
    galezie: tuple[GalazDynamiki, ...],
    galezie_aktywne: frozenset[str],
) -> tuple[int, ...]:
    """Numer wyspy dla kazdego wezla — spojne skladowe grafu AKTYWNYCH galezi.

    Numeracja jest DETERMINISTYCZNA i wyprowadzona z kolejnosci wezlow: wyspa
    dostaje numer w chwili, gdy przeszukiwanie dosiega jej wezla o najmniejszym
    indeksie. Dzieki temu ten sam stan topologii zawsze daje ten sam przydzial,
    niezaleznie od kolejnosci zapisu galezi (wymog determinizmu rdzenia).

    Galaz nieaktywna NIE laczy wezlow — to jest cala tresc zdarzenia „otwarcie
    galezi" w tym rozkladzie. Galaz poprzeczna (`b_poprzeczna_pu`) nie tworzy
    polaczenia miedzy wyspami, bo prowadzi do ziemi, a nie do drugiego wezla.
    """
    liczba = len(identy_wezlow)
    sasiedzi: list[list[int]] = [[] for _ in range(liczba)]
    for galaz in galezie:
        if galaz.ident not in galezie_aktywne:
            continue
        od = indeks_wezla[galaz.wezel_od]
        do = indeks_wezla[galaz.wezel_do]
        if od == do:
            continue
        sasiedzi[od].append(do)
        sasiedzi[do].append(od)

    przydzial = [-1] * liczba
    numer = 0
    for korzen in range(liczba):
        if przydzial[korzen] != -1:
            continue
        przydzial[korzen] = numer
        kolejka = [korzen]
        while kolejka:
            biezacy = kolejka.pop()
            for sasiad in sasiedzi[biezacy]:
                if przydzial[sasiad] == -1:
                    przydzial[sasiad] = numer
                    kolejka.append(sasiad)
        numer += 1
    return tuple(przydzial)


def urzadzenie_wnosi_do_algebry(
    urzadzenie: Urzadzenie, stan: np.ndarray, napiecie_pu: complex
) -> bool:
    """Czy urzadzenie wnosi cokolwiek do `g(x, y)` albo do `dg/dy` w swoim wezle.

    Miara pochodzi z rownan urzadzenia, nie z jego rodziny — patrz docstring
    modulu. Porownanie jest z ZEREM DOKLADNYM, bo pytanie jest strukturalne
    (czy skladnik w ogole wchodzi do rownania), a nie ilosciowe; kazdy prog
    bylby tutaj wymyslona granica miedzy „male zrodlo" a „brak zrodla".
    """
    if urzadzenie.prad_pu(stan, napiecie_pu) != 0:
        return True
    return bool(np.any(urzadzenie.jakobian_prad_napiecie(stan, napiecie_pu) != 0.0))


def sprawdz_zasilanie_wysp(
    identy_wezlow: tuple[str, ...],
    indeks_wezla: dict[str, int],
    przydzial: tuple[int, ...],
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
    t_s: float,
) -> None:
    """Odmow, gdy wyspa niesie odbior, a zadne jej urzadzenie nie wnosi do algebry.

    Odmowa niesie PELNY KONTEKST wymagany kontraktem R10 par. 9: numer i sklad
    wyspy, wezly i identyfikatory odbiorow wraz z zadana moca, identyfikatory
    urzadzen stojacych w wyspie mimo braku wkladu (zero cichego pominiecia
    urzadzenia odlaczonego), chwile biegu oraz powod nazwany wprost.
    """
    if not identy_wezlow:
        return

    liczba_wysp = max(przydzial) + 1
    zapotrzebowanie: list[float] = [0.0] * liczba_wysp
    odbiory_wyspy: list[list[tuple[str, str, float, float]]] = [[] for _ in range(liczba_wysp)]
    for odbior in odbiory:
        moc = abs(complex(odbior.p_pu, odbior.q_pu))
        if moc == 0.0:
            continue
        wyspa = przydzial[indeks_wezla[odbior.wezel]]
        zapotrzebowanie[wyspa] += moc
        odbiory_wyspy[wyspa].append((odbior.ident, odbior.wezel, odbior.p_pu, odbior.q_pu))

    if not any(zapotrzebowanie):
        return

    zasilane = [False] * liczba_wysp
    bezczynne: list[list[str]] = [[] for _ in range(liczba_wysp)]
    for urzadzenie, stan in zip(urzadzenia, stany, strict=True):
        pozycja = indeks_wezla[urzadzenie.wezel]
        wyspa = przydzial[pozycja]
        if zapotrzebowanie[wyspa] == 0.0:
            continue
        if urzadzenie_wnosi_do_algebry(urzadzenie, stan, complex(napiecia[pozycja])):
            zasilane[wyspa] = True
        else:
            bezczynne[wyspa].append(urzadzenie.ident)

    for wyspa in range(liczba_wysp):
        if zapotrzebowanie[wyspa] == 0.0 or zasilane[wyspa]:
            continue
        wezly_wyspy = tuple(
            ident for pozycja, ident in enumerate(identy_wezlow) if przydzial[pozycja] == wyspa
        )
        opis_odbiorow = ", ".join(
            f"{ident}@{wezel} S=({p_pu}+j{q_pu}) pu"
            for ident, wezel, p_pu, q_pu in odbiory_wyspy[wyspa]
        )
        raise OdmowaDynamiki(
            KOD_WYSPA_BEZ_ZRODLA,
            f"Wyspa {wezly_wyspy} niesie odbior ({opis_odbiorow}) przy t={t_s} s, a zadne "
            f"przylaczone do niej urzadzenie nie wnosi pradu ani pochodnej pradu po napieciu"
            + (
                f" (urzadzenia bez wkladu: {tuple(bezczynne[wyspa])})"
                if bezczynne[wyspa]
                else " (w wyspie nie ma zadnego urzadzenia)"
            )
            + ". Punkt pracy nie istnieje: odbior o stalej mocy zada mocy, ktorej w wyspie "
            "nie ma z czego wziac.",
            t_s=t_s,
            wyspa=wyspa,
            wezly=wezly_wyspy,
            odbiory=tuple(ident for ident, _, _, _ in odbiory_wyspy[wyspa]),
            moc_odbiorow_pu=zapotrzebowanie[wyspa],
            urzadzenia_bez_wkladu=tuple(bezczynne[wyspa]),
        )


__all__ = [
    "przydzial_wysp",
    "sprawdz_zasilanie_wysp",
    "urzadzenie_wnosi_do_algebry",
]
