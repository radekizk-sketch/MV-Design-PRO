"""Szyna sztywna — zrodlo napieciowe o stalej SEM za impedancja Thevenina.

PO CO. Rdzen DAE nie ma wezla bilansujacego: w symulacji czasowej nie ma
„slacka", bo kazde zrodlo ma wlasna dynamike i wlasny kat. Uklad odniesienia kata
i bilans mocy musi wiec ustalic konkretne urzadzenie. Szyna sztywna jest tym
urzadzeniem: modeluje siec nadrzedna (GPZ / system) jako SEM za skonczona
impedancja zwarciowa. Impedancja jest WYMAGANA — sieci o nieskonczonej mocy
zwarciowej nie ma, a zerowa impedancja nie ma skonczonej admitancji.

STANY. `E_re`, `E_im` (skladowe SEM w ukladzie sieciowym) o ZEROWYCH pochodnych.
Ten sam wzorzec, co `P_m`/`E'` maszyny klasycznej: wielkosc rownowagi wyznaczona
z punktu pracy jest STANEM, nie polem — dzieki temu nie ma drogi, ktora
wprowadzilaby do biegu SEM niezgodna z rozplywem (skok napiecia przy t = 0).

CZEGO TO URZADZENIE NIE ROBI. Nie reguluje napiecia, nie ma inercji i nie
odpowiada na zmiane czestotliwosci — jest warunkiem brzegowym, nie modelem
systemu. Kazda wlasnosc dynamiczna sieci nadrzednej (ekwiwalent inercyjny,
regulacja pierwotna) wymaga urzadzenia z wlasna dynamika, nie rozszerzania tego.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ..konwencje import zmiana_bazy_impedancji
from .bazowe import (
    admitancja_wewnetrzna,
    blok_mnozenia_zespolonego,
    jakobian_prad_napiecie_zrodla,
    prad_zrodla_napieciowego,
)

#: Nazwy stanow — kolejnosc jest czescia kontraktu.
NAZWY_STANOW_SZYNY_SZTYWNEJ: tuple[str, ...] = ("sem_re_pu", "sem_im_pu")

INDEKS_SEM_RE = 0
INDEKS_SEM_IM = 1


@dataclass(frozen=True)
class SzynaSztywna:
    """Zrodlo o stalej SEM za impedancja, z parametrami JUZ w bazie ukladu."""

    ident: str
    wezel: str
    r_pu: float
    x_pu: float

    @property
    def nazwy_stanow(self) -> tuple[str, ...]:
        return NAZWY_STANOW_SZYNY_SZTYWNEJ

    @property
    def granice_stanow(self) -> tuple[tuple[float, float] | None, ...]:
        """Szyna sztywna nie ma ogranicznikow — obie skladowe SEM sa wolne."""
        return (None, None)

    @property
    def zakresy_waznosci(self) -> tuple[tuple[float, float] | None, ...]:
        """Model szyny sztywnej jest wazny dla kazdej wartosci SEM — nie ma zasobu,
        ktory moglby sie wyczerpac, ani zalozenia o zakresie skladowych."""
        return (None, None)

    @property
    def stany_bez_rownowagi(self) -> tuple[str, ...]:
        """SEM szyny sztywnej jest stala — obie skladowe sa rownowaga."""
        return ()

    @property
    def admitancja_pu(self) -> complex:
        return admitancja_wewnetrzna(self.r_pu, self.x_pu)

    def sem(self, stan: np.ndarray) -> complex:
        return complex(float(stan[INDEKS_SEM_RE]), float(stan[INDEKS_SEM_IM]))

    def stan_poczatkowy(self, napiecie_pu: complex, moc_pu: complex) -> np.ndarray:
        """SEM z punktu pracy: `E = V + (R + jX) * conj(S)/conj(V)`."""
        prad = moc_pu.conjugate() / napiecie_pu.conjugate()
        sem = napiecie_pu + complex(self.r_pu, self.x_pu) * prad
        return np.array([sem.real, sem.imag], dtype=float)

    def pochodne(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        del stan, napiecie_pu
        return np.zeros(2, dtype=float)

    def jakobian_stan_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        del stan, napiecie_pu
        return np.zeros((2, 2), dtype=float)

    def jakobian_stan_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        del stan, napiecie_pu
        return np.zeros((2, 2), dtype=float)

    def prad_pu(self, stan: np.ndarray, napiecie_pu: complex) -> complex:
        return prad_zrodla_napieciowego(self.sem(stan), napiecie_pu, self.admitancja_pu)

    def jakobian_prad_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        del stan, napiecie_pu
        return jakobian_prad_napiecie_zrodla(self.admitancja_pu)

    def napiecie_bez_obciazenia(self, stan: np.ndarray) -> complex:
        """Napiecie jalowe zrodla napieciowego za impedancja to jego wlasna SEM."""
        return self.sem(stan)

    def jakobian_napiecia_bez_obciazenia(self, stan: np.ndarray) -> np.ndarray:
        """∂E/∂(E_re, E_im) = macierz jednostkowa (SEM JEST stanem)."""
        del stan
        return np.eye(2, dtype=float)

    def jakobian_prad_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        """∂I/∂(E_re, E_im) = blok mnozenia przez `y` (`I = (E - V) y`)."""
        del stan, napiecie_pu
        return blok_mnozenia_zespolonego(self.admitancja_pu)


def zbuduj_szyne_sztywna(
    *,
    ident: str,
    wezel: str,
    s_zwarciowa_mva: float,
    r_pu: float,
    x_pu: float,
    s_bazowa_mva: float,
) -> SzynaSztywna:
    """Zbuduj szyne sztywna, przeliczajac impedancje z bazy zrodla na baze ukladu.

    `r_pu`/`x_pu` sa odniesione do mocy zwarciowej zrodla (`s_zwarciowa_mva`) —
    tak, jak opisuje sie ekwiwalent sieci nadrzednej (`Z = c*U^2/S_k''` daje
    `|z| = 1 pu` w bazie mocy zwarciowej).
    """
    return SzynaSztywna(
        ident=ident,
        wezel=wezel,
        r_pu=zmiana_bazy_impedancji(r_pu, s_zwarciowa_mva, s_bazowa_mva),
        x_pu=zmiana_bazy_impedancji(x_pu, s_zwarciowa_mva, s_bazowa_mva),
    )


__all__ = [
    "INDEKS_SEM_IM",
    "INDEKS_SEM_RE",
    "NAZWY_STANOW_SZYNY_SZTYWNEJ",
    "SzynaSztywna",
    "zbuduj_szyne_sztywna",
]
