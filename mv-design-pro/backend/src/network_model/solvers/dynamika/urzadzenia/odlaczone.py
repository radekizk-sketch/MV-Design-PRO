"""Urzadzenie ODLACZONE od sieci — opakowanie, nie rozgalezienie w rdzeniu.

PO CO OPAKOWANIE. Zdarzenie „odlaczenie zrodla" (SS0 p.5) nie usuwa urzadzenia z
biegu: maszyna odlaczona od sieci NADAL sie kreci i nadal ma swoj kat, wiec jej
stany musza byc calkowane do konca horyzontu (inaczej nie da sie ocenic, czy
nadaje sie do ponownej synchronizacji). Zmienia sie wylacznie jej sprzezenie z
siecia: prad wstrzykiwany jest zerowy, a moc elektryczna wynosi dokladnie zero.

ZAMIAST FLAGI. Alternatywa byloby pole „przylaczone" i rozgalezienie `if` w
kazdym miejscu, ktore czyta prad urzadzenia albo jego blok jakobianu — czyli
cztery miejsca w `siec.py` i `calkowanie.py`, ktore mozna rozjechac niezaleznie.
Opakowanie zamyka to w JEDNEJ klasie: rdzen nie wie o istnieniu odlaczenia, bo
odlaczone urzadzenie nadal spelnia ten sam protokol.

ZERO PRZYBLIZENIA. Pochodne licza sie przy napieciu JALOWYM urzadzenia
(`napiecie_bez_obciazenia`), przy ktorym jego wlasny prad jest zerowy — dla
zrodla napieciowego za impedancja daje to `P_e = Re(E * conj(0)) = 0` dokladnie,
a nie „prawie zero".
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..kontrakty import Urzadzenie


@dataclass(frozen=True)
class UrzadzenieOdlaczone:
    """Urzadzenie bez sprzezenia z siecia, z zachowana wlasna dynamika."""

    bazowe: Urzadzenie

    @property
    def ident(self) -> str:
        return self.bazowe.ident

    @property
    def wezel(self) -> str:
        return self.bazowe.wezel

    @property
    def nazwy_stanow(self) -> tuple[str, ...]:
        return self.bazowe.nazwy_stanow

    @property
    def stany_bez_rownowagi(self) -> tuple[str, ...]:
        """Opakowanie PRZENOSI deklaracje urzadzenia bazowego, nie tworzy wlasnej."""
        return self.bazowe.stany_bez_rownowagi

    def stan_poczatkowy(self, napiecie_pu: complex, moc_pu: complex) -> np.ndarray:
        return self.bazowe.stan_poczatkowy(napiecie_pu, moc_pu)

    def pochodne(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        del napiecie_pu
        return self.bazowe.pochodne(stan, self.bazowe.napiecie_bez_obciazenia(stan))

    def jakobian_stan_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        """∂f/∂x z REGULA LANCUCHOWA: napiecie jalowe samo zalezy od stanu.

        `f_odlaczone(x) = f_bazowe(x, E_jalowe(x))`, wiec
        `df/dx = df_bazowe/dx + df_bazowe/dV * dE_jalowe/dx`. Pominiecie drugiego
        skladnika daje jakobian niezgodny z wlasna funkcja — dla zrodla
        napieciowego pierwszy i drugi skladnik znosza sie dokladnie (moc
        elektryczna jest tozsamosciowo zerowa), wiec blad byl widoczny WYLACZNIE
        w porownaniu z roznica skonczona, nie w przebiegu.
        """
        del napiecie_pu
        napiecie_jalowe = self.bazowe.napiecie_bez_obciazenia(stan)
        return self.bazowe.jakobian_stan_stan(
            stan, napiecie_jalowe
        ) + self.bazowe.jakobian_stan_napiecie(
            stan, napiecie_jalowe
        ) @ self.bazowe.jakobian_napiecia_bez_obciazenia(
            stan
        )

    def jakobian_stan_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        """Zero: pochodne urzadzenia odlaczonego nie zaleza od napiecia sieci."""
        del napiecie_pu
        return np.zeros((len(self.bazowe.nazwy_stanow), 2), dtype=float)

    def prad_pu(self, stan: np.ndarray, napiecie_pu: complex) -> complex:
        del stan, napiecie_pu
        return 0j

    def jakobian_prad_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        del stan, napiecie_pu
        return np.zeros((2, 2), dtype=float)

    def jakobian_prad_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        del napiecie_pu
        return np.zeros((2, len(self.bazowe.nazwy_stanow)), dtype=float)

    def napiecie_bez_obciazenia(self, stan: np.ndarray) -> complex:
        return self.bazowe.napiecie_bez_obciazenia(stan)

    def jakobian_napiecia_bez_obciazenia(self, stan: np.ndarray) -> np.ndarray:
        return self.bazowe.jakobian_napiecia_bez_obciazenia(stan)


__all__ = ["UrzadzenieOdlaczone"]
