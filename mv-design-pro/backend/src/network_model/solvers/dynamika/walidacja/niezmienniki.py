"""Niezmienniki biegu: calka pierwsza przy D = 0 i bilans energii (SS0 p.7, SS1).

CALKA PIERWSZA. Dla maszyny klasycznej bez tlumienia (`D = 0`) uklad jest
zachowawczy. Przy charakterystyce mocy

    P_e(d) = |E1|^2 G11 + P_max cos(d - theta_12) ,   d = delta - delta_szyny

funkcja energii

    W(d, omega) = 1/2 M [omega_0 (omega - 1)]^2
                  - (P_m - |E1|^2 G11) (d - d_s)
                  + P_max [sin(d - theta_12) - sin(d_s - theta_12)] ,  M = 2H/omega_0

(znak przy `P_max` jest PLUSEM, bo `W = 1/2 M v^2 - INT (P_m - P_e) dd`, a calka
z `P_e` wchodzi z wlasnym znakiem; dla `theta_12 = pi/2` daje to klasyczna postac
`- P_max [cos(d) - cos(d_s)]`)

spelnia `dW/dt = 0` DOKLADNIE (rozniczkowanie: `dW/dd = -(P_m - P_e)`, a
`d/dt[1/2 M v^2] = v (P_m - P_e)` dla `v = omega_0 (omega-1)`).

KAT JEST WZGLEDNY. Argumentem jest `delta - delta_szyny`, nie sam kat wirnika:
SEM szyny sztywnej ma wlasny, niezerowy kat (`E = V + jX I`), wiec funkcja
energii liczona wzgledem osi odniesienia sieci mialaby staly blad fazy i dryf,
ktory NIE maleje z krokiem — przy pierwszym pomiarze tej wyroczni wyszlo dokladnie
to (`2,9e-02` niezaleznie od `dt`, patrz test drabiny). Blad byl w SPOSOBIE UZYCIA
wyroczni, nie w calkowaniu; kontrakt funkcji nazywa teraz kat wprost, zeby ten
sam blad nie mial gdzie wrocic.

To najmocniejszy dostepny test calkowania: metoda o zlym rzedzie, zly znak momentu
albo pominiety skladnik daja DRYF `W(t)`, ktory maleje z krokiem jak `dt^p`
(p = rzad metody) — albo nie maleje wcale, jesli blad nie jest bledem metody.

BILANS ENERGII. Drugi, ogolniejszy niezmiennik, wazny takze przy `D > 0`:
przyrost energii kinetycznej wirnika rowna sie calce z mocy niezbilansowanej

    d/dt [ 1/2 M (omega_0 (omega-1))^2 ] = omega_0 (omega - 1) (P_m - P_e - D (omega-1)).

Obie funkcje licza sie WYLACZNIE z probek wyniku (kat, predkosc, moc) i ze stalych
maszyny — nie wolaja silnika ani sieci, wiec nie moga „potwierdzic" biegu jego
wlasnym kodem.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class ParametryCalkiPierwszej:
    """Stale maszyny i charakterystyki potrzebne do funkcji energii.

    `p_max_pu`, `theta_12_rad` i `g11_pu` pochodza z tej samej redukcji Krona, co
    wyrocznia rownych pol (`walidacja.rowne_pola.charakterystyka_mocy`) — jedno
    zrodlo prawdy charakterystyki mocy dla obu niezmiennikow.
    """

    h_s: float
    omega_bazowa_rad_s: float
    p_mechaniczna_pu: float
    p_max_pu: float
    theta_12_rad: float
    g11_pu: float
    sem_maszyny_pu: float
    delta12_rownowagi_rad: float

    @property
    def bezwladnosc_m(self) -> float:
        """`M = 2H/omega_0` — bezwladnosc w postaci uzywanej przez funkcje energii."""
        return 2.0 * self.h_s / self.omega_bazowa_rad_s

    @property
    def moc_stala_pu(self) -> float:
        """`P_m - |E1|^2 G11` — czesc bilansu mocy niezalezna od kata."""
        return self.p_mechaniczna_pu - self.sem_maszyny_pu**2 * self.g11_pu


def calka_pierwsza(
    delta12_rad: np.ndarray, omega_pu: np.ndarray, parametry: ParametryCalkiPierwszej
) -> np.ndarray:
    """Szereg `W(t)` funkcji energii (stala w czasie dla `D = 0`).

    `delta12_rad` jest katem WZGLEDNYM `delta - delta_szyny` (patrz docstring
    modulu) — podanie kata bezwzglednego daje staly, niemalejacy z krokiem dryf.
    """
    predkosc_katowa = parametry.omega_bazowa_rad_s * (np.asarray(omega_pu, dtype=float) - 1.0)
    kat = np.asarray(delta12_rad, dtype=float)
    return (
        0.5 * parametry.bezwladnosc_m * predkosc_katowa**2
        - parametry.moc_stala_pu * (kat - parametry.delta12_rownowagi_rad)
        + parametry.p_max_pu
        * (
            np.sin(kat - parametry.theta_12_rad)
            - math.sin(parametry.delta12_rownowagi_rad - parametry.theta_12_rad)
        )
    )


def dryf_calki_pierwszej(
    delta12_rad: np.ndarray, omega_pu: np.ndarray, parametry: ParametryCalkiPierwszej
) -> float:
    """Maksymalne ODCHYLENIE `W(t)` od wartosci poczatkowej (miara dryfu metody)."""
    energia = calka_pierwsza(delta12_rad, omega_pu, parametry)
    if energia.size == 0:
        return 0.0
    return float(np.max(np.abs(energia - energia[0])))


def energia_kinetyczna(omega_pu: np.ndarray, parametry: ParametryCalkiPierwszej) -> np.ndarray:
    """Energia kinetyczna odchylki predkosci `1/2 M (omega_0 (omega-1))^2`."""
    predkosc_katowa = parametry.omega_bazowa_rad_s * (np.asarray(omega_pu, dtype=float) - 1.0)
    return 0.5 * parametry.bezwladnosc_m * predkosc_katowa**2


def niezbilansowanie_bilansu_energii(
    os_czasu_s: np.ndarray,
    omega_pu: np.ndarray,
    p_elektryczna_pu: np.ndarray,
    parametry: ParametryCalkiPierwszej,
    d_pu: float,
) -> float:
    """Maksymalna roznica miedzy przyrostem energii kinetycznej a calka mocy.

    Calkowanie po czasie metoda trapezow na SIATCE PROBEK wyniku — czyli
    niezaleznie od kroku wewnetrznego biegu. Zwracana jest najwieksza roznica
    bezwzgledna miedzy obiema stronami bilansu na calym przebiegu.
    """
    czas = np.asarray(os_czasu_s, dtype=float)
    predkosc = np.asarray(omega_pu, dtype=float) - 1.0
    moc_niezbilansowana = (
        parametry.omega_bazowa_rad_s
        * predkosc
        * (parametry.p_mechaniczna_pu - np.asarray(p_elektryczna_pu, dtype=float) - d_pu * predkosc)
    )
    if czas.size < 2:
        return 0.0
    przyrosty = np.diff(czas)
    calka = np.concatenate(
        ([0.0], np.cumsum(0.5 * przyrosty * (moc_niezbilansowana[:-1] + moc_niezbilansowana[1:])))
    )
    kinetyczna = energia_kinetyczna(omega_pu, parametry)
    return float(np.max(np.abs((kinetyczna - kinetyczna[0]) - calka)))


__all__ = [
    "ParametryCalkiPierwszej",
    "calka_pierwsza",
    "dryf_calki_pierwszej",
    "energia_kinetyczna",
    "niezbilansowanie_bilansu_energii",
]
