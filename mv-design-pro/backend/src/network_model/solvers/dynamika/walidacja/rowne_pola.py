"""Wyrocznia RÓWNYCH PÓL: krytyczny czas usuniecia zwarcia dla ukladu SMIB (SS0 p.7 a).

PO CO WYROCZNIA. Rdzen DAE mozna sprawdzic dwoma sposobami: przez porownanie z
innym narzedziem (wyrocznia zewnetrzna) albo przez porownanie z ROZWIAZANIEM
ANALITYCZNYM tego samego zadania. Ten modul jest drugim sposobem — liczy CCT z
kryterium rownych pol, czyli z CALKI PIERWSZEJ rownania ruchu, zupelnie inna
droga niz silnik: bez sieci wezlowej, bez Newtona, bez trapezu, na zredukowanym
ukladzie dwoch wezlow wewnetrznych.

KRYTERIUM RÓWNYCH PÓL (Kundur 13.2, Anderson & Fouad 2.7). Dla maszyny
klasycznej bez tlumienia pole przyspieszajace w czasie zwarcia rowna sie polu
hamujacemu po jego usunieciu:

    cos(delta_c) = [ P_m (delta_max - delta_0)
                     + P_max3 cos(delta_max) - P_max2 cos(delta_0) ]
                   / (P_max3 - P_max2)

gdzie `delta_0 = asin(P_m/P_max1)`, `delta_max = pi - asin(P_m/P_max3)`, a
`P_max1/2/3` sa amplitudami charakterystyki mocy przed zwarciem, w zwarciu i po
jego usunieciu. Kat krytyczny przeliczany jest na CZAS przez scalkowanie
rownania ruchu W ZWARCIU — wlasnym, skalarnym RK4 o kroku o rzedy wielkosci
mniejszym od kroku biegu (jedno rownanie drugiego rzedu, zero algebry sieciowej).

REDUKCJA. `P_max = |E1| |E2| |Y12|` oraz `P_e = |E1|^2 G11 + P_max cos(delta12 -
theta12)` powstaja z macierzy 2x2 zredukowanej Kronem do wezlow WEWNETRZNYCH obu
zrodel. Redukcja Krona jest dokladna dla sieci o elementach STALEJ ADMITANCJI, i
tylko dla takiej ta wyrocznia jest wazna — odbior o stalej mocy nie ma
rownowaznej admitancji niezaleznej od napiecia, wiec uklad z takim odbiorem jest
ODRZUCANY, a nie liczony „w przyblizeniu".
"""

from __future__ import annotations

import cmath
import math
from dataclasses import dataclass

import numpy as np

from ..kontrakty import OdbiorDynamiki
from ..siec import ModelSieci
from ..urzadzenia.maszyna_klasyczna import (
    INDEKS_DELTA,
    INDEKS_MOCY_MECHANICZNEJ,
    INDEKS_MODULU_SEM,
    MaszynaKlasyczna,
)
from ..urzadzenia.szyna_sztywna import SzynaSztywna
from .niezmienniki import ParametryCalkiPierwszej

#: Krok calkowania rownania ruchu w zwarciu przy wyznaczaniu CCT [s]. Jest o trzy
#: rzedy wielkosci mniejszy od typowego kroku biegu (1 ms), zeby blad wyroczni byl
#: pomijalny wobec bledu badanej metody — wyrocznia mierzaca z ta sama dokladnoscia
#: co przedmiot pomiaru niczego nie orzeka.
KROK_WYROCZNI_S = 1.0e-6


@dataclass(frozen=True)
class CharakterystykaMocy:
    """Charakterystyka `P_e(delta)` ukladu dwumaszynowego po redukcji Krona."""

    p_max_pu: float
    theta_12_rad: float
    g11_pu: float
    sem_maszyny_pu: float
    sem_szyny_pu: float

    def moc_elektryczna_pu(self, delta_rad: float, delta_szyny_rad: float) -> float:
        return self.sem_maszyny_pu**2 * self.g11_pu + self.p_max_pu * math.cos(
            delta_rad - delta_szyny_rad - self.theta_12_rad
        )


class UkladNieprzystajeDoWyroczni(ValueError):
    """Uklad nie spelnia zalozen kryterium rownych pol (dokladnie nazwany powod)."""


def _wezly_wewnetrzne(
    model: ModelSieci,
    maszyna: MaszynaKlasyczna,
    szyna: SzynaSztywna,
) -> tuple[np.ndarray, int, int]:
    """Ybus rozszerzona o dwa wezly WEWNETRZNE zrodel (gesta, uklad jest maly)."""
    liczba = model.liczba_wezlow
    rozszerzona = np.zeros((liczba + 2, liczba + 2), dtype=complex)
    rozszerzona[:liczba, :liczba] = model.ybus.toarray()
    for pozycja_wewnetrzna, urzadzenie in ((liczba, maszyna), (liczba + 1, szyna)):
        pozycja_zacisku = model.indeks_wezla[urzadzenie.wezel]
        admitancja = urzadzenie.admitancja_pu
        rozszerzona[pozycja_zacisku, pozycja_zacisku] += admitancja
        rozszerzona[pozycja_wewnetrzna, pozycja_wewnetrzna] += admitancja
        rozszerzona[pozycja_zacisku, pozycja_wewnetrzna] -= admitancja
        rozszerzona[pozycja_wewnetrzna, pozycja_zacisku] -= admitancja
    return rozszerzona, liczba, liczba + 1


def charakterystyka_mocy(
    model: ModelSieci,
    odbiory: tuple[OdbiorDynamiki, ...],
    maszyna: MaszynaKlasyczna,
    szyna: SzynaSztywna,
    stan_maszyny: np.ndarray,
    stan_szyny: np.ndarray,
) -> CharakterystykaMocy:
    """Zreduguj siec do dwoch wezlow wewnetrznych i zwroc charakterystyke mocy.

    KAZDY odbior ODRZUCA wyrocznie: redukcja Krona jest dokladna wylacznie dla
    elementow o stalej admitancji; odbior o charakterystyce innej niz stala impedancja
    jej nie ma, a odbioru czysto impedancyjnego ta wyrocznia nie redukuje (nie ma go w
    macierzy, ktora sklada). Udawanie stalej admitancji byloby cichym przyblizeniem w
    narzedziu, ktore ma sluzyc za miare.
    """
    if odbiory:
        raise UkladNieprzystajeDoWyroczni(
            "Kryterium rownych pol wymaga sieci o stalych admitancjach; uklad ma "
            f"{len(odbiory)} odbiór(ów) — wyrocznia nie redukuje odbiorów "
            f"({', '.join(odbior.ident for odbior in odbiory)})."
        )
    rozszerzona, pozycja_maszyny, pozycja_szyny = _wezly_wewnetrzne(model, maszyna, szyna)
    zachowane = [pozycja_maszyny, pozycja_szyny]
    usuwane = [pozycja for pozycja in range(rozszerzona.shape[0]) if pozycja not in zachowane]

    blok_zz = rozszerzona[np.ix_(zachowane, zachowane)]
    blok_zu = rozszerzona[np.ix_(zachowane, usuwane)]
    blok_uz = rozszerzona[np.ix_(usuwane, zachowane)]
    blok_uu = rozszerzona[np.ix_(usuwane, usuwane)]
    zredukowana: np.ndarray = blok_zz - blok_zu @ np.linalg.solve(blok_uu, blok_uz)

    y12 = complex(zredukowana[0, 1])
    sem_maszyny = float(stan_maszyny[INDEKS_MODULU_SEM])
    sem_szyny = abs(complex(float(stan_szyny[0]), float(stan_szyny[1])))
    return CharakterystykaMocy(
        p_max_pu=sem_maszyny * sem_szyny * abs(y12),
        theta_12_rad=cmath.phase(y12),
        g11_pu=float(zredukowana[0, 0].real),
        sem_maszyny_pu=sem_maszyny,
        sem_szyny_pu=sem_szyny,
    )


@dataclass(frozen=True)
class WynikRownychPol:
    """Kat i czas krytyczny wraz z wielkosciami posrednimi (WHITE BOX wyroczni)."""

    delta_0_rad: float
    delta_krytyczny_rad: float
    delta_max_rad: float
    czas_krytyczny_s: float
    p_max_przed_pu: float
    p_max_w_zwarciu_pu: float
    p_max_po_pu: float


def kat_krytyczny(
    *,
    p_mechaniczna_pu: float,
    p_max_przed_pu: float,
    p_max_w_zwarciu_pu: float,
    p_max_po_pu: float,
) -> tuple[float, float, float]:
    """Katy `(delta_0, delta_krytyczny, delta_max)` z kryterium rownych pol."""
    if p_max_przed_pu <= 0.0 or p_max_po_pu <= 0.0:
        raise UkladNieprzystajeDoWyroczni(
            "Amplituda charakterystyki mocy przed zwarciem i po jego usunieciu musi "
            f"byc dodatnia (otrzymano {p_max_przed_pu} i {p_max_po_pu})."
        )
    if abs(p_mechaniczna_pu) > p_max_przed_pu or abs(p_mechaniczna_pu) > p_max_po_pu:
        raise UkladNieprzystajeDoWyroczni(
            f"Moc mechaniczna {p_mechaniczna_pu} przekracza amplitude charakterystyki "
            f"(przed {p_max_przed_pu}, po {p_max_po_pu}) — punkt pracy nie istnieje."
        )
    delta_0 = math.asin(p_mechaniczna_pu / p_max_przed_pu)
    delta_max = math.pi - math.asin(p_mechaniczna_pu / p_max_po_pu)
    if p_max_po_pu == p_max_w_zwarciu_pu:
        raise UkladNieprzystajeDoWyroczni(
            "Charakterystyka w zwarciu jest identyczna jak po usunieciu — zwarcie nie "
            "zmienia ukladu, wiec kat krytyczny nie istnieje."
        )
    cos_krytyczny = (
        p_mechaniczna_pu * (delta_max - delta_0)
        + p_max_po_pu * math.cos(delta_max)
        - p_max_w_zwarciu_pu * math.cos(delta_0)
    ) / (p_max_po_pu - p_max_w_zwarciu_pu)
    if not -1.0 <= cos_krytyczny <= 1.0:
        raise UkladNieprzystajeDoWyroczni(
            f"Kryterium rownych pol daje cos(delta_c) = {cos_krytyczny} poza [-1, 1]: "
            "uklad jest stabilny dla dowolnego czasu zwarcia albo niestabilny od razu."
        )
    return delta_0, math.acos(cos_krytyczny), delta_max


def czas_z_kata(
    *,
    delta_0_rad: float,
    delta_krytyczny_rad: float,
    p_mechaniczna_pu: float,
    p_max_w_zwarciu_pu: float,
    h_s: float,
    omega_bazowa_rad_s: float,
) -> float:
    """Czas dojscia do kata krytycznego W ZWARCIU — wlasne, skalarne RK4.

    Dla `P_max_w_zwarciu = 0` istnieje postac zamknieta
    `t = sqrt(4 H (delta_c - delta_0) / (omega_0 P_m))`; jest liczona wprost, bo
    calkowanie numeryczne czegos, co ma rozwiazanie dokladne, dokladalo by wlasny
    blad do miary sluzacej do mierzenia bledu.
    """
    if delta_krytyczny_rad <= delta_0_rad:
        raise UkladNieprzystajeDoWyroczni(
            f"Kat krytyczny {delta_krytyczny_rad} nie przekracza kata poczatkowego "
            f"{delta_0_rad} — zwarcie nie przyspiesza wirnika."
        )
    if p_max_w_zwarciu_pu == 0.0:
        return math.sqrt(
            4.0
            * h_s
            * (delta_krytyczny_rad - delta_0_rad)
            / (omega_bazowa_rad_s * p_mechaniczna_pu)
        )

    def przyspieszenie(delta: float) -> float:
        return (
            omega_bazowa_rad_s
            * (p_mechaniczna_pu - p_max_w_zwarciu_pu * math.sin(delta))
            / (2.0 * h_s)
        )

    delta = delta_0_rad
    predkosc = 0.0
    czas = 0.0
    while delta < delta_krytyczny_rad:
        k1_d, k1_v = predkosc, przyspieszenie(delta)
        k2_d, k2_v = (
            predkosc + 0.5 * KROK_WYROCZNI_S * k1_v,
            przyspieszenie(delta + 0.5 * KROK_WYROCZNI_S * k1_d),
        )
        k3_d, k3_v = (
            predkosc + 0.5 * KROK_WYROCZNI_S * k2_v,
            przyspieszenie(delta + 0.5 * KROK_WYROCZNI_S * k2_d),
        )
        k4_d, k4_v = (
            predkosc + KROK_WYROCZNI_S * k3_v,
            przyspieszenie(delta + KROK_WYROCZNI_S * k3_d),
        )
        delta_poprzedni = delta
        delta += (KROK_WYROCZNI_S / 6.0) * (k1_d + 2.0 * k2_d + 2.0 * k3_d + k4_d)
        predkosc += (KROK_WYROCZNI_S / 6.0) * (k1_v + 2.0 * k2_v + 2.0 * k3_v + k4_v)
        czas += KROK_WYROCZNI_S
        if delta <= delta_poprzedni:
            raise UkladNieprzystajeDoWyroczni(
                "Wirnik nie przyspiesza w zwarciu — kat krytyczny nie zostanie osiagniety."
            )
    return czas


def czas_krytyczny_rownych_pol(
    *,
    p_mechaniczna_pu: float,
    p_max_przed_pu: float,
    p_max_w_zwarciu_pu: float,
    p_max_po_pu: float,
    h_s: float,
    omega_bazowa_rad_s: float,
) -> WynikRownychPol:
    """Pelna wyrocznia: katy z rownych pol + czas krytyczny z rownania ruchu."""
    delta_0, delta_krytyczny, delta_max = kat_krytyczny(
        p_mechaniczna_pu=p_mechaniczna_pu,
        p_max_przed_pu=p_max_przed_pu,
        p_max_w_zwarciu_pu=p_max_w_zwarciu_pu,
        p_max_po_pu=p_max_po_pu,
    )
    return WynikRownychPol(
        delta_0_rad=delta_0,
        delta_krytyczny_rad=delta_krytyczny,
        delta_max_rad=delta_max,
        czas_krytyczny_s=czas_z_kata(
            delta_0_rad=delta_0,
            delta_krytyczny_rad=delta_krytyczny,
            p_mechaniczna_pu=p_mechaniczna_pu,
            p_max_w_zwarciu_pu=p_max_w_zwarciu_pu,
            h_s=h_s,
            omega_bazowa_rad_s=omega_bazowa_rad_s,
        ),
        p_max_przed_pu=p_max_przed_pu,
        p_max_w_zwarciu_pu=p_max_w_zwarciu_pu,
        p_max_po_pu=p_max_po_pu,
    )


def parametry_calki_pierwszej(
    charakterystyka: CharakterystykaMocy,
    maszyna: MaszynaKlasyczna,
    stan_maszyny: np.ndarray,
    delta12_rownowagi_rad: float,
) -> ParametryCalkiPierwszej:
    """Zloz parametry funkcji energii z TEJ SAMEJ charakterystyki, co kryterium rownych pol.

    Jedno zrodlo prawdy `P_max`/`theta_12`/`G11` dla obu niezmiennikow — gdyby
    kazdy z nich liczyl charakterystyke wlasna droga, zgodnosc dowodzilaby
    zgodnosci dwoch kopii, a nie poprawnosci rdzenia.
    """
    return ParametryCalkiPierwszej(
        h_s=maszyna.h_s,
        omega_bazowa_rad_s=maszyna.omega_bazowa_rad_s,
        p_mechaniczna_pu=float(stan_maszyny[INDEKS_MOCY_MECHANICZNEJ]),
        p_max_pu=charakterystyka.p_max_pu,
        theta_12_rad=charakterystyka.theta_12_rad,
        g11_pu=charakterystyka.g11_pu,
        sem_maszyny_pu=charakterystyka.sem_maszyny_pu,
        delta12_rownowagi_rad=delta12_rownowagi_rad,
    )


def kat_maszyny(stan: np.ndarray) -> float:
    """Kat wirnika ze stanu maszyny klasycznej (jedno miejsce odczytu indeksu)."""
    return float(stan[INDEKS_DELTA])


def kat_szyny(stan: np.ndarray) -> float:
    """Kat SEM szyny sztywnej (odniesienie ukladu)."""
    return cmath.phase(complex(float(stan[0]), float(stan[1])))


__all__ = [
    "KROK_WYROCZNI_S",
    "CharakterystykaMocy",
    "UkladNieprzystajeDoWyroczni",
    "WynikRownychPol",
    "charakterystyka_mocy",
    "czas_krytyczny_rownych_pol",
    "czas_z_kata",
    "kat_krytyczny",
    "kat_maszyny",
    "kat_szyny",
    "parametry_calki_pierwszej",
]
