"""Calkowanie DAE: trapez NIEJAWNY (domyslny) i RK4 JAWNY (diagnostyczny) — SS0 p.4.

UKLAD. Rozwiazywany jest uklad rownan rozniczkowo-algebraicznych

    dx/dt = f(x, y),    0 = g(x, y),

gdzie `x` to stany urzadzen (zlaczone w jeden wektor w kolejnosci urzadzen), a
`y = [Re V; Im V]` to napiecia wezlowe.

TRAPEZ NIEJAWNY rozwiazuje krok na ukladzie SPRZEZONYM (x, y) — jednym Newtonem
po obu grupach niewiadomych naraz, z jakobianem analitycznym skladanym z blokow
urzadzen i sieci:

    R_x = x_1 - x_0 - (dt/2) [ f(x_0, y_0) + f(x_1, y_1) ]
    R_y = g(x_1, y_1)

    dR_x/dx = I - (dt/2) df/dx      dR_x/dy = -(dt/2) df/dy
    dR_y/dx = -dI/dx                dR_y/dy = dg/dy

Schemat rozdzielony (najpierw stany, potem algebra) bylby tansza, ale INNA
metoda: przy silnym sprzezeniu (zwarcie na zaciskach) traci rzad i potrafi
„zbiegac" do punktu, ktory nie spelnia obu rownan naraz. Wybor jest zapisany
tutaj, a nie domyslny.

RK4 JAWNY jest DIAGNOSTYCZNY (drabina rzedu, kontrola implementacji pochodnych).
Dla DAE jest schematem ROZDZIELONYM z konstrukcji: kazde stadium wymaga
rozwiazania algebry dla zadanego `x`, wiec nie jest rownowaznikiem trapezu i NIE
jest przeznaczony do biegow produkcyjnych. Jest nazwany, nie ukryty.

KONTROLA BLEDU KROKU. Oszacowanie bledu lokalnego powstaje przez PODWOJENIE
KROKU: jeden krok `dt` wobec dwoch krokow `dt/2`, roznica podzielona przez
`2^p - 1` (p = rzad metody). Wynikiem kroku pozostaje przebieg jednokrokowy —
podwojenie sluzy WYLACZNIE oszacowaniu, nie ekstrapolacji (ekstrapolacja
zmienilaby rzad metody, a razem z nim znaczenie drabiny z SS0 p.7 a).
Oszacowanie liczy sie WYLACZNIE przy kroku adaptacyjnym (`nastawy.krok_staly`
jest `False`); przy kroku stalym nie ma czym skrocic kroku, wiec placenie za
oszacowanie 3x kosztem byloby pomiarem bez konsumenta.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

import numpy as np
from scipy import sparse
from scipy.sparse import linalg as sparse_linalg

from .kontrakty import (
    KOD_KROK_NIEZBIEZNY,
    NastawySolvera,
    OdbiorDynamiki,
    OdmowaDynamiki,
    Urzadzenie,
)
from .siec import (
    WSPOLCZYNNIK_ARMIJO,
    ModelSieci,
    jakobian_algebry,
    residuum_algebry,
    rozwiaz_algebre,
)
from .skonczonosc import sprawdz_wektor


@dataclass(frozen=True)
class KontekstKroku:
    """Wszystko, co krok calkowania potrzebuje poza `(x, y, t, dt)`."""

    model: ModelSieci
    odbiory: tuple[OdbiorDynamiki, ...]
    urzadzenia: tuple[Urzadzenie, ...]
    nastawy: NastawySolvera

    @property
    def wymiary_stanow(self) -> tuple[int, ...]:
        return tuple(len(urzadzenie.nazwy_stanow) for urzadzenie in self.urzadzenia)

    @property
    def adresy_stanow(self) -> tuple[str, ...]:
        return tuple(
            f"{urzadzenie.ident}.{nazwa}"
            for urzadzenie in self.urzadzenia
            for nazwa in urzadzenie.nazwy_stanow
        )


def spakuj_stany(stany: tuple[np.ndarray, ...]) -> np.ndarray:
    """Zlacz stany urzadzen w jeden wektor (kolejnosc = kolejnosc urzadzen)."""
    if not stany:
        return np.zeros(0, dtype=float)
    return np.concatenate([np.asarray(stan, dtype=float) for stan in stany])


def rozpakuj_stany(wektor: np.ndarray, wymiary: tuple[int, ...]) -> tuple[np.ndarray, ...]:
    """Rozdziel wektor stanow na stany poszczegolnych urzadzen."""
    czesci: list[np.ndarray] = []
    poczatek = 0
    for wymiar in wymiary:
        czesci.append(np.asarray(wektor[poczatek : poczatek + wymiar], dtype=float))
        poczatek += wymiar
    if poczatek != wektor.shape[0]:
        raise AssertionError(
            f"rozpakuj_stany: wektor ma {wektor.shape[0]} skladowych wobec sumy wymiarow {poczatek}"
        )
    return tuple(czesci)


def pochodne_ukladu(
    kontekst: KontekstKroku,
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
    t_s: float,
) -> np.ndarray:
    """Zlaczony wektor `f(x, y)` z kontrola skonczonosci w chwili powstania."""
    czesci: list[np.ndarray] = []
    for urzadzenie, stan in zip(kontekst.urzadzenia, stany, strict=True):
        pozycja = kontekst.model.indeks_wezla[urzadzenie.wezel]
        czesci.append(urzadzenie.pochodne(stan, complex(napiecia[pozycja])))
    pochodne = spakuj_stany(tuple(czesci))
    sprawdz_wektor(pochodne, kontekst.adresy_stanow, "pochodne stanow", t_s)
    return pochodne


def _jakobian_sprzezony(
    kontekst: KontekstKroku,
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
    dt_s: float,
) -> sparse.csc_matrix:
    """Jakobian ukladu sprzezonego trapezu: bloki `dR_x/dx`, `dR_x/dy`, `dR_y/dx`, `dR_y/dy`."""
    liczba_wezlow = kontekst.model.liczba_wezlow
    wymiary = kontekst.wymiary_stanow
    liczba_stanow = int(sum(wymiary))
    polowa_kroku = dt_s / 2.0

    wiersze: list[int] = []
    kolumny: list[int] = []
    wartosci: list[float] = []

    przesuniecie = 0
    for urzadzenie, stan, wymiar in zip(kontekst.urzadzenia, stany, wymiary, strict=True):
        pozycja = kontekst.model.indeks_wezla[urzadzenie.wezel]
        napiecie = complex(napiecia[pozycja])
        blok_ff = urzadzenie.jakobian_stan_stan(stan, napiecie)
        blok_fy = urzadzenie.jakobian_stan_napiecie(stan, napiecie)
        blok_iy = urzadzenie.jakobian_prad_stan(stan, napiecie)
        for wiersz in range(wymiar):
            for kolumna in range(wymiar):
                wartosc = -polowa_kroku * float(blok_ff[wiersz, kolumna])
                if wiersz == kolumna:
                    wartosc += 1.0
                wiersze.append(przesuniecie + wiersz)
                kolumny.append(przesuniecie + kolumna)
                wartosci.append(wartosc)
            for kolumna_napiecia in (0, 1):
                wiersze.append(przesuniecie + wiersz)
                kolumny.append(liczba_stanow + pozycja + kolumna_napiecia * liczba_wezlow)
                wartosci.append(-polowa_kroku * float(blok_fy[wiersz, kolumna_napiecia]))
        for wiersz_pradu in (0, 1):
            for kolumna in range(wymiar):
                wiersze.append(liczba_stanow + pozycja + wiersz_pradu * liczba_wezlow)
                kolumny.append(przesuniecie + kolumna)
                wartosci.append(-float(blok_iy[wiersz_pradu, kolumna]))
        przesuniecie += wymiar

    blok_stanow = sparse.coo_matrix(
        (
            np.array(wartosci, dtype=float),
            (np.array(wiersze, dtype=int), np.array(kolumny, dtype=int)),
        ),
        shape=(liczba_stanow + 2 * liczba_wezlow, liczba_stanow + 2 * liczba_wezlow),
    )
    blok_algebry = sparse.coo_matrix(
        jakobian_algebry(kontekst.model, kontekst.odbiory, kontekst.urzadzenia, stany, napiecia)
    )
    blok_algebry = sparse.coo_matrix(
        (
            blok_algebry.data,
            (blok_algebry.row + liczba_stanow, blok_algebry.col + liczba_stanow),
        ),
        shape=(liczba_stanow + 2 * liczba_wezlow, liczba_stanow + 2 * liczba_wezlow),
    )
    return (blok_stanow + blok_algebry).tocsc()


@dataclass(frozen=True)
class WynikKroku:
    """Stan po kroku wraz z pomiarem zbieznosci Newtona.

    `residuum` to laczna norma druga residuum kroku (wielkosc, ktora steruje
    globalizacja). `residuum_stanow` i `residuum_algebry` to normy NIESKONCZONOSCI
    obu czesci OSOBNO — rownania rozniczkowego (R_x) i algebraicznego (g) — bo
    kontrakt wyniku raportuje je oddzielnie, a laczna norma nie pozwala orzec,
    ktora czesc nie domknela sie do tolerancji.
    """

    stany: tuple[np.ndarray, ...]
    napiecia: np.ndarray
    iteracje: int
    residuum: float
    nawroty: int
    residuum_stanow: float
    residuum_algebry: float


def _wynik_kroku(
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
    iteracje: int,
    norma: float,
    nawroty: int,
    wektor_residuum: np.ndarray,
    liczba_stanow: int,
) -> WynikKroku:
    """Zloz `WynikKroku`, rozdzielajac residuum na czesc rozniczkowa i algebraiczna."""
    czesc_stanow = wektor_residuum[:liczba_stanow]
    czesc_algebry = wektor_residuum[liczba_stanow:]
    return WynikKroku(
        stany=stany,
        napiecia=napiecia,
        iteracje=iteracje,
        residuum=norma,
        nawroty=nawroty,
        residuum_stanow=float(np.max(np.abs(czesc_stanow))) if czesc_stanow.size else 0.0,
        residuum_algebry=float(np.max(np.abs(czesc_algebry))) if czesc_algebry.size else 0.0,
    )


@runtime_checkable
class Integrator(Protocol):
    """Jednokrokowa metoda calkowania DAE.

    Wszystkie skladowe sa WLASCIWOSCIAMI TYLKO DO ODCZYTU — zamrozona dataklasa
    implementujaca ten protokol ma go PRZECHODZIC (dlug zmierzony w watku
    badawczym: protokoly z polami modyfikowalnymi nie byly spelniane przez zadna
    konkretna klase, wiec system typow byl bezczynny dla calej warstwy).
    """

    @property
    def nazwa(self) -> str:
        """Nazwa metody — wchodzi do tozsamosci biegu i do wlasnosci wyniku."""

    @property
    def rzad(self) -> int:
        """Rzad zbieznosci na odcinku gladkim (wykladnik drabiny kroku)."""

    def krok(
        self,
        kontekst: KontekstKroku,
        stany: tuple[np.ndarray, ...],
        napiecia: np.ndarray,
        t_s: float,
        dt_s: float,
    ) -> WynikKroku:
        """Jeden krok z `t` do `t + dt`."""


@dataclass(frozen=True)
class TrapezNiejawny:
    """Trapez niejawny na ukladzie sprzezonym (x, y) — metoda DOMYSLNA, rzad 2."""

    @property
    def nazwa(self) -> str:
        return "trapez_niejawny"

    @property
    def rzad(self) -> int:
        return 2

    def krok(
        self,
        kontekst: KontekstKroku,
        stany: tuple[np.ndarray, ...],
        napiecia: np.ndarray,
        t_s: float,
        dt_s: float,
    ) -> WynikKroku:
        nastawy = kontekst.nastawy
        wymiary = kontekst.wymiary_stanow
        liczba_stanow = int(sum(wymiary))
        liczba_wezlow = kontekst.model.liczba_wezlow
        polowa_kroku = dt_s / 2.0

        stan_poczatkowy = spakuj_stany(stany)
        pochodne_poczatkowe = pochodne_ukladu(kontekst, stany, napiecia, t_s)

        niewiadome = np.concatenate((stan_poczatkowy, napiecia.real.copy(), napiecia.imag.copy()))

        def rozloz(wektor: np.ndarray) -> tuple[tuple[np.ndarray, ...], np.ndarray]:
            stany_biezace = rozpakuj_stany(wektor[:liczba_stanow], wymiary)
            napiecia_biezace = (
                wektor[liczba_stanow : liczba_stanow + liczba_wezlow]
                + 1j * wektor[liczba_stanow + liczba_wezlow :]
            )
            return stany_biezace, napiecia_biezace

        def residuum(wektor: np.ndarray) -> np.ndarray:
            stany_biezace, napiecia_biezace = rozloz(wektor)
            pochodne_biezace = pochodne_ukladu(
                kontekst, stany_biezace, napiecia_biezace, t_s + dt_s
            )
            reszta_stanow = (
                wektor[:liczba_stanow]
                - stan_poczatkowy
                - polowa_kroku * (pochodne_poczatkowe + pochodne_biezace)
            )
            reszta_algebry = residuum_algebry(
                kontekst.model,
                kontekst.odbiory,
                kontekst.urzadzenia,
                stany_biezace,
                napiecia_biezace,
            )
            return np.concatenate((reszta_stanow, reszta_algebry))

        wektor_residuum = residuum(niewiadome)
        norma = float(np.linalg.norm(wektor_residuum))
        nawroty_lacznie = 0

        for iteracja in range(1, nastawy.max_iteracji_newtona + 1):
            if norma <= nastawy.tolerancja:
                stany_koncowe, napiecia_koncowe = rozloz(niewiadome)
                return _wynik_kroku(
                    stany_koncowe,
                    napiecia_koncowe,
                    iteracja - 1,
                    norma,
                    nawroty_lacznie,
                    wektor_residuum,
                    liczba_stanow,
                )
            stany_biezace, napiecia_biezace = rozloz(niewiadome)
            jakobian = _jakobian_sprzezony(kontekst, stany_biezace, napiecia_biezace, dt_s)
            try:
                rozklad = sparse_linalg.splu(jakobian)
            except RuntimeError as blad:
                raise OdmowaDynamiki(
                    KOD_KROK_NIEZBIEZNY,
                    f"Jakobian kroku osobliwy przy t={t_s} s (dt={dt_s} s, "
                    f"iteracja {iteracja}, residuum {norma}): {blad}",
                    t_s=t_s,
                    dt_s=dt_s,
                    iteracja=iteracja,
                    residuum=norma,
                ) from blad
            kierunek = rozklad.solve(-wektor_residuum)

            alfa = 1.0
            przyjeto = False
            for nawrot in range(nastawy.max_nawrotow + 1):
                kandydat = niewiadome + alfa * kierunek
                if not np.isfinite(kandydat).all():
                    alfa *= 0.5
                    nawroty_lacznie += 1
                    continue
                residuum_kandydata = residuum(kandydat)
                norma_kandydata = float(np.linalg.norm(residuum_kandydata))
                if norma_kandydata <= (1.0 - WSPOLCZYNNIK_ARMIJO * alfa) * norma:
                    niewiadome = kandydat
                    wektor_residuum = residuum_kandydata
                    norma = norma_kandydata
                    nawroty_lacznie += nawrot
                    przyjeto = True
                    break
                alfa *= 0.5
            if not przyjeto:
                raise OdmowaDynamiki(
                    KOD_KROK_NIEZBIEZNY,
                    f"Zaden nawrot nie obnizyl residuum kroku przy t={t_s} s "
                    f"(dt={dt_s} s, iteracja {iteracja}, residuum {norma})",
                    t_s=t_s,
                    dt_s=dt_s,
                    iteracja=iteracja,
                    residuum=norma,
                )

        if norma <= nastawy.tolerancja:
            stany_koncowe, napiecia_koncowe = rozloz(niewiadome)
            return _wynik_kroku(
                stany_koncowe,
                napiecia_koncowe,
                nastawy.max_iteracji_newtona,
                norma,
                nawroty_lacznie,
                wektor_residuum,
                liczba_stanow,
            )
        raise OdmowaDynamiki(
            KOD_KROK_NIEZBIEZNY,
            f"Newton kroku nie zbiegl przy t={t_s} s (dt={dt_s} s, "
            f"{nastawy.max_iteracji_newtona} iteracji, residuum {norma} > "
            f"tolerancja {nastawy.tolerancja})",
            t_s=t_s,
            dt_s=dt_s,
            iteracja=nastawy.max_iteracji_newtona,
            residuum=norma,
        )


@dataclass(frozen=True)
class RungeKutta4Jawny:
    """RK4 jawny, ROZDZIELONY (algebra rozwiazywana w kazdym stadium) — rzad 4.

    Metoda DIAGNOSTYCZNA: sluzy do kontroli implementacji pochodnych i do
    drabiny rzedu, nie do biegow produkcyjnych. Powod jest fizyczny, nie
    wydajnosciowy: uklad maszyna-siec jest sztywny (stale czasowe algebry sa o
    rzedy wielkosci krotsze od mechanicznych), wiec metoda jawna wymaga kroku
    narzuconego stabilnoscia, a nie dokladnoscia.
    """

    @property
    def nazwa(self) -> str:
        return "rk4_jawny"

    @property
    def rzad(self) -> int:
        return 4

    def _algebra(
        self,
        kontekst: KontekstKroku,
        stany: tuple[np.ndarray, ...],
        napiecia_startowe: np.ndarray,
        t_s: float,
    ) -> np.ndarray:
        wynik = rozwiaz_algebre(
            kontekst.model,
            kontekst.odbiory,
            kontekst.urzadzenia,
            stany,
            napiecia_startowe,
            tolerancja=kontekst.nastawy.tolerancja,
            max_iteracji=kontekst.nastawy.max_iteracji_newtona,
            max_nawrotow=kontekst.nastawy.max_nawrotow,
            t_s=t_s,
        )
        return wynik.napiecia

    def krok(
        self,
        kontekst: KontekstKroku,
        stany: tuple[np.ndarray, ...],
        napiecia: np.ndarray,
        t_s: float,
        dt_s: float,
    ) -> WynikKroku:
        wymiary = kontekst.wymiary_stanow
        stan_poczatkowy = spakuj_stany(stany)

        def pochodne_w(wektor: np.ndarray, chwila: float, start: np.ndarray) -> np.ndarray:
            stany_biezace = rozpakuj_stany(wektor, wymiary)
            napiecia_biezace = self._algebra(kontekst, stany_biezace, start, chwila)
            return pochodne_ukladu(kontekst, stany_biezace, napiecia_biezace, chwila)

        k1 = pochodne_w(stan_poczatkowy, t_s, napiecia)
        k2 = pochodne_w(stan_poczatkowy + 0.5 * dt_s * k1, t_s + 0.5 * dt_s, napiecia)
        k3 = pochodne_w(stan_poczatkowy + 0.5 * dt_s * k2, t_s + 0.5 * dt_s, napiecia)
        k4 = pochodne_w(stan_poczatkowy + dt_s * k3, t_s + dt_s, napiecia)
        stan_koncowy = stan_poczatkowy + (dt_s / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)

        stany_koncowe = rozpakuj_stany(stan_koncowy, wymiary)
        wynik_algebry = rozwiaz_algebre(
            kontekst.model,
            kontekst.odbiory,
            kontekst.urzadzenia,
            stany_koncowe,
            napiecia,
            tolerancja=kontekst.nastawy.tolerancja,
            max_iteracji=kontekst.nastawy.max_iteracji_newtona,
            max_nawrotow=kontekst.nastawy.max_nawrotow,
            t_s=t_s + dt_s,
        )
        return WynikKroku(
            stany_koncowe,
            wynik_algebry.napiecia,
            wynik_algebry.iteracje,
            wynik_algebry.residuum,
            wynik_algebry.nawroty,
            # Metoda JAWNA nie rozwiazuje rownania stanu — stan po kroku jest
            # wyliczony wprost ze stadiow, wiec residuum rownania rozniczkowego
            # jest zerowe Z KONSTRUKCJI (blad metody mierzy drabina kroku, nie ta
            # liczba). Zero jest tu POMIAREM, nie zaslepka.
            0.0,
            float(
                np.max(
                    np.abs(
                        residuum_algebry(
                            kontekst.model,
                            kontekst.odbiory,
                            kontekst.urzadzenia,
                            stany_koncowe,
                            wynik_algebry.napiecia,
                        )
                    )
                )
            ),
        )


#: Rejestr integratorow — ZAMKNIETY (nazwa z `kontrakty.NazwaIntegratora`).
INTEGRATORY: dict[str, Integrator] = {
    "trapez_niejawny": TrapezNiejawny(),
    "rk4_jawny": RungeKutta4Jawny(),
}


def blad_lokalny(
    integrator: Integrator,
    kontekst: KontekstKroku,
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
    t_s: float,
    dt_s: float,
    wynik_pelnego_kroku: WynikKroku,
) -> float:
    """Oszacowanie bledu lokalnego przez podwojenie kroku (norma nieskonczonosci).

    `||x(dt) - x(dt/2, 2 kroki)|| / (2^p - 1)`. Sluzy WYLACZNIE sterowaniu
    dlugoscia kroku; wynikiem kroku pozostaje przebieg jednokrokowy.
    """
    polowa = dt_s / 2.0
    posredni = integrator.krok(kontekst, stany, napiecia, t_s, polowa)
    dokladniejszy = integrator.krok(
        kontekst, posredni.stany, posredni.napiecia, t_s + polowa, polowa
    )
    roznica = spakuj_stany(dokladniejszy.stany) - spakuj_stany(wynik_pelnego_kroku.stany)
    if roznica.size == 0:
        return 0.0
    return float(np.max(np.abs(roznica))) / float(2**integrator.rzad - 1)


__all__ = [
    "INTEGRATORY",
    "Integrator",
    "KontekstKroku",
    "RungeKutta4Jawny",
    "TrapezNiejawny",
    "WynikKroku",
    "blad_lokalny",
    "pochodne_ukladu",
    "rozpakuj_stany",
    "spakuj_stany",
]
