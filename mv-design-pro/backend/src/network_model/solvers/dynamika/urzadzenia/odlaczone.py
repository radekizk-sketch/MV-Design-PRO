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
from typing import ClassVar

import numpy as np

from ..kontrakty import WIELKOSCI_NASTAW, NastawaRegulacji, SprzezenieUrzadzenia, Urzadzenie


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
    def granice_stanow(self) -> tuple[tuple[float, float] | None, ...]:
        """Odlaczenie nie zmienia ogranicznikow urzadzenia — przenosimy je bez zmian."""
        return self.bazowe.granice_stanow

    @property
    def zakresy_waznosci(self) -> tuple[tuple[float, float] | None, ...]:
        """Odlaczenie nie zmienia zakresu waznosci modelu — przenosimy go bez zmian.

        Urzadzenie odlaczone od sieci nadal calkuje swoje stany (magazyn dalej
        zmienia stan naladowania, jesli jego przeksztaltnik pracuje na wyspie), wiec
        zalozenia badania obowiazuja tak samo."""
        return self.bazowe.zakresy_waznosci

    @property
    def stany_bez_rownowagi(self) -> tuple[str, ...]:
        """Opakowanie PRZENOSI deklaracje urzadzenia bazowego, nie tworzy wlasnej."""
        return self.bazowe.stany_bez_rownowagi

    POLA_POZA_ODCISKIEM: ClassVar[tuple[tuple[str, str], ...]] = ()

    @property
    def sprzezenie(self) -> SprzezenieUrzadzenia:
        """Odlaczone urzadzenie NIE narzuca napiecia i nie wstrzykuje pradu: sprzezenie
        pradowe z pradem tozsamosciowo zerowym — takze wtedy, gdy urzadzenie bazowe
        bylo zrodlem napieciowym (wezel wraca wtedy do zwyklego rownania KCL)."""
        return "pradowe"

    @property
    def stany_przypisywalne(self) -> tuple[str, ...]:
        """Zaden: urzadzenie odlaczone nie ma czynnej regulacji, ktora nastawa mialaby
        sterowac — przypisanie konczy sie odmowa `dynamika.zdarzenie_przypisania_niedozwolone`
        (ponowne przylaczenie, przy ktorym nastawa zaczelaby dzialac, nie jest wykonywane)."""
        return ()

    @property
    def nastawy_regulacji(self) -> tuple[NastawaRegulacji, ...]:
        """Kazda wielkosc odmawiana — urzadzenie jest odlaczone od sieci."""
        return tuple(
            NastawaRegulacji(
                wielkosc=wielkosc,
                stan=None,
                powod_pl=f"urządzenie {self.bazowe.ident} jest odlaczone od sieci — nastawa "
                "nie miałaby skutku do ponownego przyłączenia, którego rdzeń nie wykonuje",
                zakres=None,
                mnoznik=1.0,
            )
            for wielkosc in WIELKOSCI_NASTAW
        )

    @property
    def agregat_jednostek(self) -> bool:
        """Odlaczenie nie zmienia natury urzadzenia — deklaracja bazowego. Czesciowej
        utraty urzadzenia JUZ odlaczonego rdzen i tak odmawia (stan scenariusza)."""
        return self.bazowe.agregat_jednostek

    def parametry_tozsamosci(self) -> dict[str, object]:
        """Parametry urzadzenia bazowego — opakowanie jest rozpoznawane po nazwie klasy."""
        return {"bazowe": self.bazowe.parametry_tozsamosci()}

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
