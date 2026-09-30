"""Wyrocznie analityczne i niezmienniki rdzenia dynamiki (SS0 p.1, p.7).

Trzy NIEZALEZNE miary tego samego rdzenia:

* `rowne_pola` — krytyczny czas usuniecia zwarcia z kryterium rownych pol
  (calka pierwsza rownania ruchu na ukladzie zredukowanym Kronem; zero sieci
  wezlowej, zero Newtona, zero trapezu);
* `malosygnalowa` — czestotliwosc i tlumienie modu z WARTOSCI WLASNYCH macierzy
  stanu w punkcie pracy (algebra liniowa w jednym punkcie, zero calkowania);
* `niezmienniki` — calka pierwsza przy `D = 0` i bilans energii liczone
  WYLACZNIE z probek wyniku.

Moduly te sa czescia PRODUKTU, nie testow: kazdy z nich jest wielkoscia
inzynierska, ktora projektant moze chciec zobaczyc (CCT, czestotliwosc kolysan,
dryf energii). Testy ich UZYWAJA, ale nie sa ich jedynym konsumentem.
"""

from .malosygnalowa import Mod, macierz_stanu, mod_oscylacyjny, mody
from .niezmienniki import (
    ParametryCalkiPierwszej,
    calka_pierwsza,
    dryf_calki_pierwszej,
    energia_kinetyczna,
    niezbilansowanie_bilansu_energii,
)
from .rowne_pola import (
    CharakterystykaMocy,
    UkladNieprzystajeDoWyroczni,
    WynikRownychPol,
    charakterystyka_mocy,
    czas_krytyczny_rownych_pol,
    czas_z_kata,
    kat_krytyczny,
    kat_maszyny,
    kat_szyny,
    parametry_calki_pierwszej,
)

__all__ = [
    "CharakterystykaMocy",
    "Mod",
    "ParametryCalkiPierwszej",
    "UkladNieprzystajeDoWyroczni",
    "WynikRownychPol",
    "calka_pierwsza",
    "charakterystyka_mocy",
    "czas_krytyczny_rownych_pol",
    "czas_z_kata",
    "dryf_calki_pierwszej",
    "energia_kinetyczna",
    "kat_krytyczny",
    "kat_maszyny",
    "kat_szyny",
    "macierz_stanu",
    "mod_oscylacyjny",
    "mody",
    "niezbilansowanie_bilansu_energii",
    "parametry_calki_pierwszej",
]
