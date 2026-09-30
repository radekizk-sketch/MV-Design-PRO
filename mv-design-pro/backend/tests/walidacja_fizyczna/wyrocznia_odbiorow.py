"""WYROCZNIA MODELU ODBIORU: postac zamknieta ukladow twierdzen D-23 i D-24.

ZERO IMPORTOW Z RDZENIA (`network_model`, `enm`, `solvers`) — przypiete testem AST
w `test_manifest.py`. Wzory modelu odbioru sa tu zapisane OD NOWA z rownan karty modeli
odbiorow, a nie wywolane z `odbiory.py`: wyrocznia dzielaca kod z produktem potwierdzalaby
produkt jego wlasnym bledem.

MODEL ODBIORU (karta modeli odbiorow, par. 0 pkt 1 i 4)

    |V| >= U_min :  S(|V|, f) = P0 F_P(f) w_P(|V|) + j Q0 F_Q(f) w_Q(|V|)
                    w(|V|) = a r^2 + b r + c ,  r = |V|/v0 ,  F = 1 + k (f - f0)/f0
    |V| <  U_min :  S = S(U_min, f) (|V|/U_min)^2        (stala impedancja, I = -Y_eq V)

Odbior czysto impedancyjny (b = c = 0) nie ma `U_min`: jego charakterystyka JEST
impedancja przy kazdym napieciu.

D-23 — UKLAD DWUWEZLOWY. SEM `E` za admitancja szeregowa `y` (szyna sztywna + linia), w
wezle odbioru admitancja zwarcia `Y_f`. Bilans wezla:

    y E - (y + Y_f) V = conj(S(|V|, f)) / conj(V)

* galaz impedancyjna: `V = y E / (y + Y_f + Y_eq)`, `Y_eq = conj(S(U_min, f))/U_min^2`
  (rownanie LINIOWE — postac jawna);
* galaz charakterystyki: modul z rownania skalarnego `|y E| m = |(y + Y_f) m^2 + conj S(m)|`
  (gorny pierwiastek, `brentq`), kat z `conj(V) = ((y + Y_f) m^2 + conj S(m)) / (y E)`;
* zwarcie metaliczne (`Y_f = inf`): `V = 0` dokladnie.

D-24 — WYSPA SAMOREGULACJI. Maszyna klasyczna (SEM `E'`, bezwladnosc `H`, `D = 0`) za
reaktancja `X = X'd + X_L` zasila odbior stalej mocy czynnej (`Q0 = 0`) czuly
czestotliwosciowo (`k = k_pf`, `f0 = f_n`) z estymatorem katowym:

    x' = e / T_f ,   e = arg(V_B e^{-jx}) ,   dw_hat = e / (w_n T_f)

Dla odbioru czysto czynnego za reaktancja `V_B` opoznia sie za `E'` o kat `psi`,
`|V_B| = E' cos(psi)`, `sin(2 psi) = 2 X P_L / E'^2`, `P_L = P0' (1 + k dw_hat)`.
Z `theta_B = delta - psi`, `delta' = w_n dw` i `psi` zaleznego od `e` wychodzi UKLAD
ZREDUKOWANY (dokladny, nie zlinearyzowany; stany `dw`, `e`):

    2H dw' = P_m - P_L(e)
    e' (1 + psi'(e)) = w_n dw - e / T_f ,   psi'(e) = X P0' k / (w_n T_f E'^2 cos 2psi)

rownowazny zapisowi karty `(T_f + a) dw_hat' = dw - dw_hat`, `a = T_f psi'(e)`. Czestotliwosc
szyny `f_B = f_n (1 + dw - psi'(e) e' / w_n)`. Stan ustalony po skoku mocy bazowej
`P0 -> P0'`: `dw_inf = (P_m/P0' - 1)/k` (odbior zmniejsza pobor, az zrowna sie z moca
mechaniczna — samoregulacja). Linearyzacja w rownowadze `dw = dw_hat = 0` przy mocy `P0`:
`lambda^2 + lambda/tau + c/tau = 0`, `c = P0 k / (2H)`, `tau = T_f + a`; pelny uklad rdzenia
ma dodatkowo wartosci wlasne zerowe (sztywny obrot `delta` i `x` oraz stany stale maszyny).

SKOK W CHWILI ZDARZENIA. `delta` i `x` sa ciagle, `psi` zmienia sie skokowo wraz z moca bazowa:
`e+ = e- - (psi(e+; P0') - psi-)` — rownanie skalarne w `e+` (`brentq`).
"""

from __future__ import annotations

import cmath
import math
from dataclasses import dataclass

import numpy as np
from scipy.integrate import solve_ivp
from scipy.optimize import brentq

# --------------------------------------------------------------------------- model odbioru


@dataclass(frozen=True)
class OdbiorWyroczni:
    """Dane odbioru zapisane od nowa (konwencja poboru, moc bazowa P0 + jQ0 w pu ukladu)."""

    p0_pu: float
    q0_pu: float
    wielomian_p: tuple[float, float, float]
    wielomian_q: tuple[float, float, float]
    v0_pu: float
    k_pf: float
    k_qf: float
    f0_hz: float
    u_min_pu: float | None

    def czynnik(self, k: float, f_hz: float | None) -> float:
        """`F = 1 + k (f - f0)/f0`; bez czestotliwosci widzianej (odbior bez czulosci) F = 1."""
        if f_hz is None:
            return 1.0
        return 1.0 + k * (f_hz - self.f0_hz) / self.f0_hz

    def _w(self, wsp: tuple[float, float, float], modul: float) -> float:
        a, b, c = wsp
        r = modul / self.v0_pu
        return a * r * r + b * r + c

    def moc_charakterystyki(self, modul: float, f_hz: float | None) -> complex:
        return complex(
            self.p0_pu * self.czynnik(self.k_pf, f_hz) * self._w(self.wielomian_p, modul),
            self.q0_pu * self.czynnik(self.k_qf, f_hz) * self._w(self.wielomian_q, modul),
        )

    def moc(self, modul: float, f_hz: float | None) -> complex:
        """Moc pobierana: charakterystyka nad `U_min`, stala impedancja pod nim."""
        if self.u_min_pu is not None and modul < self.u_min_pu:
            return self.moc_charakterystyki(self.u_min_pu, f_hz) * (modul / self.u_min_pu) ** 2
        return self.moc_charakterystyki(modul, f_hz)

    def admitancja_impedancyjna(self, f_hz: float | None) -> complex:
        """`Y_eq = conj(S(U_ref))/U_ref^2`, `U_ref = U_min` (albo `v0` dla czystej impedancji)."""
        odniesienie = self.v0_pu if self.u_min_pu is None else self.u_min_pu
        return self.moc_charakterystyki(odniesienie, f_hz).conjugate() / odniesienie**2

    def w_galezi_impedancyjnej(self, modul: float) -> bool:
        return self.u_min_pu is not None and modul < self.u_min_pu


# --------------------------------------------------------------------------- D-23


def napiecie_dwuwezlowe(
    sem: complex,
    admitancja: complex,
    admitancja_zwarcia: complex | None,
    odbior: OdbiorWyroczni,
    f_hz: float | None,
) -> complex:
    """Napiecie wezla odbioru ukladu dwuwezlowego; `admitancja_zwarcia=None` = metaliczne."""
    if admitancja_zwarcia is None:
        return 0j
    y_eq = odbior.admitancja_impedancyjna(f_hz)
    liniowe = admitancja * sem / (admitancja + admitancja_zwarcia + y_eq)
    if odbior.u_min_pu is None or abs(liniowe) < odbior.u_min_pu:
        return liniowe
    suma = admitancja + admitancja_zwarcia

    def g(modul: float) -> float:
        return (
            abs(suma * modul * modul + odbior.moc(modul, f_hz).conjugate())
            - abs(admitancja * sem) * modul
        )

    # Gorny pierwiastek: przeszukanie od gory siatka, pierwsza zmiana znaku zamknieta Brentem.
    siatka = np.linspace(2.0 * abs(sem), odbior.u_min_pu, 4001)
    for gorna, dolna in zip(siatka[:-1], siatka[1:], strict=True):
        if g(float(gorna)) * g(float(dolna)) <= 0.0:
            modul = brentq(g, float(dolna), float(gorna), xtol=1e-16, rtol=1e-15)
            sprzezone = (suma * modul * modul + odbior.moc(modul, f_hz).conjugate()) / (
                admitancja * sem
            )
            return sprzezone.conjugate()
    raise ValueError("Galaz charakterystyki bez pierwiastka nad U_min — uklad bez rozwiazania")


def skala_admitancji_granicznej(
    sem: complex,
    admitancja: complex,
    kierunek: complex,
    odbior: OdbiorWyroczni,
    f_hz: float | None,
) -> float:
    """Skala `s` admitancji zwarcia `Y_f* = s kierunek`, przy ktorej `|V| = U_min` dokladnie.

    W `|V| = U_min` obie galezie daja te sama moc, wiec punkt lezy na galezi impedancyjnej
    (rownanie liniowe) — modul `|y E / (y + s kierunek + Y_eq)|` maleje z `s`.
    """
    if odbior.u_min_pu is None:
        raise ValueError("Odbior czysto impedancyjny nie ma napiecia przejscia")
    y_eq = odbior.admitancja_impedancyjna(f_hz)
    u_min = odbior.u_min_pu
    return float(
        brentq(
            lambda s: abs(admitancja * sem / (admitancja + s * kierunek + y_eq)) - u_min,
            0.0,
            1e3,
            xtol=1e-15,
            rtol=1e-15,
        )
    )


# --------------------------------------------------------------------------- D-24


def zawin(kat_rad: float) -> float:
    """Kat w (-pi, pi] — argument fazora `e^{j kat}`."""
    return cmath.phase(cmath.exp(1j * kat_rad))


@dataclass(frozen=True)
class WyspaSamoregulacji:
    """Uklad zredukowany wyspy: maszyna klasyczna — reaktancja — odbior stalej mocy czuly f."""

    h_s: float
    x_pu: float
    sem_pu: float
    p_m_pu: float
    k: float
    t_f_s: float
    f_n_hz: float

    @property
    def w_n(self) -> float:
        return 2.0 * math.pi * self.f_n_hz

    def odchylka_widziana(self, e: float) -> float:
        """`dw_hat = e / (w_n T_f)`."""
        return e / (self.w_n * self.t_f_s)

    def moc_odbioru(self, p0: float, e: float) -> float:
        return p0 * (1.0 + self.k * self.odchylka_widziana(e))

    def psi(self, p0: float, e: float) -> float:
        """Kat opoznienia `V_B` za `E'`: `sin 2psi = 2 X P_L / E'^2` (galaz |V_B| > E'/sqrt 2)."""
        return 0.5 * math.asin(2.0 * self.x_pu * self.moc_odbioru(p0, e) / self.sem_pu**2)

    def modul_szyny(self, p0: float, e: float) -> float:
        return self.sem_pu * math.cos(self.psi(p0, e))

    def pochodna_psi(self, p0: float, e: float) -> float:
        """`d psi / d e = X P0 k / (w_n T_f E'^2 cos 2psi)`."""
        return (
            self.x_pu
            * p0
            * self.k
            / (self.w_n * self.t_f_s * self.sem_pu**2 * math.cos(2.0 * self.psi(p0, e)))
        )

    def prawa_strona(self, p0: float, dw: float, e: float) -> tuple[float, float]:
        """(dw', e') ukladu zredukowanego."""
        dw_prim = (self.p_m_pu - self.moc_odbioru(p0, e)) / (2.0 * self.h_s)
        e_prim = (self.w_n * dw - e / self.t_f_s) / (1.0 + self.pochodna_psi(p0, e))
        return dw_prim, e_prim

    def czestotliwosc_szyny_hz(self, p0: float, dw: float, e: float) -> float:
        """`f_B = f_n (1 + dw - psi'(e) e' / w_n)` — pochodna fazy szyny `theta = delta - psi`."""
        _, e_prim = self.prawa_strona(p0, dw, e)
        return self.f_n_hz * (1.0 + dw - self.pochodna_psi(p0, e) * e_prim / self.w_n)

    def odchylka_ustalona(self, p0: float) -> float:
        """`dw_inf = (P_m/P0' - 1)/k` — rownowaga `P_L = P_m`."""
        return (self.p_m_pu / p0 - 1.0) / self.k

    def wartosci_wlasne(self, p0: float) -> tuple[complex, complex]:
        """Pierwiastki `lambda^2 + lambda/tau + c/tau` w rownowadze `dw = dw_hat = 0` mocy `p0`."""
        tau = self.t_f_s * (1.0 + self.pochodna_psi(p0, 0.0))
        c = p0 * self.k / (2.0 * self.h_s)
        delta = complex(1.0 / tau**2 - 4.0 * c / tau)
        pierwiastek = cmath.sqrt(delta)
        return ((-1.0 / tau + pierwiastek) / 2.0, (-1.0 / tau - pierwiastek) / 2.0)

    def skok(self, p0_przed: float, p0_po: float, e_przed: float) -> float:
        """`e+` z rownania skalarnego `e+ - e- + psi(e+; P0') - psi(e-; P0) = 0`."""
        psi_przed = self.psi(p0_przed, e_przed)

        def g(e: float) -> float:
            return e - e_przed + self.psi(p0_po, e) - psi_przed

        zakres = abs(self.psi(p0_po, e_przed) - psi_przed) * 4.0 + 1e-12
        return float(brentq(g, e_przed - zakres, e_przed + zakres, xtol=1e-17, rtol=1e-15))

    def trajektoria(
        self, p0_po: float, dw_start: float, e_start: float, t_start: float, chwile: np.ndarray
    ) -> tuple[np.ndarray, np.ndarray]:
        """(dw, e) w chwilach `chwile >= t_start` — DOP853, rtol 1e-12."""
        rozwiazanie = solve_ivp(
            lambda _t, y: self.prawa_strona(p0_po, float(y[0]), float(y[1])),
            (t_start, float(chwile[-1])),
            (dw_start, e_start),
            method="DOP853",
            rtol=1e-12,
            atol=1e-16,
            t_eval=chwile,
        )
        if not rozwiazanie.success:
            raise ValueError(f"Wyrocznia DOP853 nie domknela calkowania: {rozwiazanie.message}")
        return rozwiazanie.y[0], rozwiazanie.y[1]


__all__ = [
    "OdbiorWyroczni",
    "WyspaSamoregulacji",
    "napiecie_dwuwezlowe",
    "skala_admitancji_granicznej",
    "zawin",
]
