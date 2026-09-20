"""Maszyna synchroniczna — model KLASYCZNY (2. rzedu), E' za X'd.

ROWNANIA (Anderson & Fouad, rozdz. 2; Kundur rozdz. 12 — model klasyczny):

    d(delta)/dt = omega_0 * (omega - 1)
    d(omega)/dt = (P_m - P_e - D * (omega - 1)) / (2H)
    d(P_m)/dt   = 0
    d(E')/dt    = 0

gdzie `E = E' * exp(j*delta)` (napiecie wewnetrzne na osi q — patrz
`konwencje.dq_na_siec`), prad wstrzykiwany do wezla `I = (E - V) * y`,
`y = 1/(Ra + jX'd)`, a moc elektryczna to moc PRZEZ SZCZELINE

    P_e = Re(E * conj(I)) = Re(V * conj(I)) + Ra * |I|^2

(tozsamosc z `E = V + (Ra + jX'd) I`, wiec do rownania ruchu wchodzi moc
zaciskow POWIEKSZONA o straty w uzwojeniu stojana, a nie moc zaciskow).

DLACZEGO `P_m` I `E'` SA STANAMI, A NIE POLAMI. Zadna z tych dwoch wielkosci nie
jest dana wejsciowa — obie WYNIKAJA z punktu pracy (SS0 p.3: „stany urzadzen ...
stany regulatorow (Efd, P_m z rownowagi)"). Gdyby byly polami zamrozonej
dataklasy, wolajacy musialby je podac, a kazda wartosc niezgodna z rozplywem
dawalaby skok momentu albo skok napiecia w chwili t = 0 — dokladnie ten „artefakt
rozruchu", ktorego karta zabrania. Jako stany o zerowej pochodnej sa wyznaczane z
rownowagi, sa jawnie widoczne w sladzie, i sa gotowe na regulatory: nastepny
wycinek nadaje im niezerowe pochodne (regulator obrotow -> P_m, wzbudnica -> E'),
nie zmieniajac ani wymiaru stanu, ani kontraktu, ani jednego wiersza sprzezenia
sieciowego.

BAZY. Parametry wchodza w bazie URZADZENIA (`s_n_mva`) i sa przeliczane na baze
UKLADU JEDEN RAZ, w `zbuduj_maszyne_klasyczna`: reaktancja i rezystancja
proporcjonalnie do stosunku baz, stala bezwladnosci i wspolczynnik tlumienia
odwrotnie. Dwie bazy tej samej wielkosci pu w jednym biegu to blad skali, ktory
NIE maleje przy dt -> 0 (kontrprzyklad 100/50 MVA z przegladu watku badawczego).
"""

from __future__ import annotations

import cmath
from dataclasses import dataclass

import numpy as np

from ..konwencje import (
    pulsacja_bazowa_rad_s,
    sprawdz_stala_bezwladnosci,
    zmiana_bazy_impedancji,
    zmiana_bazy_stalej_bezwladnosci,
)
from .bazowe import (
    admitancja_wewnetrzna,
    jakobian_prad_napiecie_zrodla,
    prad_zrodla_napieciowego,
)

#: Nazwy stanow — kolejnosc jest czescia kontraktu (indeksy czyta silnik i wynik).
NAZWY_STANOW_MASZYNY_KLASYCZNEJ: tuple[str, ...] = (
    "delta_rad",
    "omega_pu",
    "p_mechaniczna_pu",
    "sem_modul_pu",
)

INDEKS_DELTA = 0
INDEKS_OMEGA = 1
INDEKS_MOCY_MECHANICZNEJ = 2
INDEKS_MODULU_SEM = 3


@dataclass(frozen=True)
class MaszynaKlasyczna:
    """Maszyna klasyczna z parametrami JUZ w bazie ukladu.

    Buduj przez `zbuduj_maszyne_klasyczna`; konstruktor nie przelicza baz, zeby
    nie bylo w klasie drugiego, ukrytego miejsca przeliczania.
    """

    ident: str
    wezel: str
    h_s: float
    d_pu: float
    x_prim_pu: float
    ra_pu: float
    omega_bazowa_rad_s: float

    @property
    def nazwy_stanow(self) -> tuple[str, ...]:
        return NAZWY_STANOW_MASZYNY_KLASYCZNEJ

    @property
    def granice_stanow(self) -> tuple[tuple[float, float] | None, ...]:
        """Model klasyczny nie ma ani jednego ogranicznika — wszystkie stany wolne."""
        return (None, None, None, None)

    @property
    def zakresy_waznosci(self) -> tuple[tuple[float, float] | None, ...]:
        """Rownania modelu klasycznego sa wazne w calej przestrzeni stanow — kat, predkosc
        i obie skladowe SEM nie maja zakresu, poza ktorym model przestaje obowiazywac."""
        return (None, None, None, None)

    @property
    def stany_bez_rownowagi(self) -> tuple[str, ...]:
        """Kazdy stan maszyny klasycznej MUSI byc rownowaga w punkcie pracy."""
        return ()

    @property
    def admitancja_pu(self) -> complex:
        return admitancja_wewnetrzna(self.ra_pu, self.x_prim_pu)

    def sem(self, stan: np.ndarray) -> complex:
        """Napiecie wewnetrzne `E' * exp(j*delta)` w ukladzie sieciowym."""
        return float(stan[INDEKS_MODULU_SEM]) * cmath.exp(1j * float(stan[INDEKS_DELTA]))

    def stan_poczatkowy(self, napiecie_pu: complex, moc_pu: complex) -> np.ndarray:
        """Stan rownowagi z punktu pracy — `delta` i `|E'|` z fazora `E`, `P_m = P_e`.

        `moc_pu` jest moca ODDAWANA do sieci (konwencja generacji), wiec prad
        zaciskow to `conj(S)/conj(V)`.
        """
        prad = moc_pu.conjugate() / napiecie_pu.conjugate()
        sem = napiecie_pu + complex(self.ra_pu, self.x_prim_pu) * prad
        moc_elektryczna = (sem * prad.conjugate()).real
        return np.array(
            [cmath.phase(sem), 1.0, moc_elektryczna, abs(sem)],
            dtype=float,
        )

    def moc_elektryczna_pu(self, stan: np.ndarray, napiecie_pu: complex) -> float:
        """`P_e = Re(E * conj(I))` — moc przez szczeline (zawiera Ra*|I|^2)."""
        sem = self.sem(stan)
        prad = prad_zrodla_napieciowego(sem, napiecie_pu, self.admitancja_pu)
        return float((sem * prad.conjugate()).real)

    def pochodne(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        odchylka_predkosci = float(stan[INDEKS_OMEGA]) - 1.0
        moc_elektryczna = self.moc_elektryczna_pu(stan, napiecie_pu)
        return np.array(
            [
                self.omega_bazowa_rad_s * odchylka_predkosci,
                (
                    float(stan[INDEKS_MOCY_MECHANICZNEJ])
                    - moc_elektryczna
                    - self.d_pu * odchylka_predkosci
                )
                / (2.0 * self.h_s),
                0.0,
                0.0,
            ],
            dtype=float,
        )

    def jakobian_stan_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        """∂f/∂x — postac analityczna (zadnej roznicy skonczonej w torze gorącym).

        Z `P_e = |E'|^2 Re(y) - Re(E conj(V) conj(y))` wychodzi
        `∂P_e/∂delta = Im(E conj(V) conj(y))` oraz
        `∂P_e/∂|E'| = 2|E'| Re(y) - Re(exp(j delta) conj(V) conj(y))`.
        """
        dwa_h = 2.0 * self.h_s
        admitancja = self.admitancja_pu
        sprzezenie = napiecie_pu.conjugate() * admitancja.conjugate()
        iloczyn = self.sem(stan) * sprzezenie
        pochodna_po_kacie = float(iloczyn.imag)
        pochodna_po_module = 2.0 * float(stan[INDEKS_MODULU_SEM]) * admitancja.real - float(
            (cmath.exp(1j * float(stan[INDEKS_DELTA])) * sprzezenie).real
        )
        jakobian = np.zeros((4, 4), dtype=float)
        jakobian[INDEKS_DELTA, INDEKS_OMEGA] = self.omega_bazowa_rad_s
        jakobian[INDEKS_OMEGA, INDEKS_DELTA] = -pochodna_po_kacie / dwa_h
        jakobian[INDEKS_OMEGA, INDEKS_OMEGA] = -self.d_pu / dwa_h
        jakobian[INDEKS_OMEGA, INDEKS_MOCY_MECHANICZNEJ] = 1.0 / dwa_h
        jakobian[INDEKS_OMEGA, INDEKS_MODULU_SEM] = -pochodna_po_module / dwa_h
        return jakobian

    def jakobian_stan_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        """∂f/∂(Re V, Im V) — wylacznie rownanie ruchu, przez `P_e`.

        `P_e = |E'|^2 Re(y) - (K_r Re V + K_i Im V)`, gdzie `K = E conj(y)`,
        wiec `∂P_e/∂Re V = -K_r`, `∂P_e/∂Im V = -K_i`.
        """
        del napiecie_pu
        wspolczynnik = self.sem(stan) * self.admitancja_pu.conjugate()
        dwa_h = 2.0 * self.h_s
        jakobian = np.zeros((4, 2), dtype=float)
        jakobian[INDEKS_OMEGA, 0] = wspolczynnik.real / dwa_h
        jakobian[INDEKS_OMEGA, 1] = wspolczynnik.imag / dwa_h
        return jakobian

    def prad_pu(self, stan: np.ndarray, napiecie_pu: complex) -> complex:
        return prad_zrodla_napieciowego(self.sem(stan), napiecie_pu, self.admitancja_pu)

    def jakobian_prad_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        del stan, napiecie_pu
        return jakobian_prad_napiecie_zrodla(self.admitancja_pu)

    def napiecie_bez_obciazenia(self, stan: np.ndarray) -> complex:
        """Napiecie jalowe zrodla napieciowego za impedancja to jego wlasna SEM."""
        return self.sem(stan)

    def jakobian_napiecia_bez_obciazenia(self, stan: np.ndarray) -> np.ndarray:
        """∂E/∂x dla `E = |E'| exp(j delta)`: kolumny kata i modulu."""
        po_kacie = 1j * self.sem(stan)
        po_module = cmath.exp(1j * float(stan[INDEKS_DELTA]))
        jakobian = np.zeros((2, 4), dtype=float)
        jakobian[0, INDEKS_DELTA] = po_kacie.real
        jakobian[1, INDEKS_DELTA] = po_kacie.imag
        jakobian[0, INDEKS_MODULU_SEM] = po_module.real
        jakobian[1, INDEKS_MODULU_SEM] = po_module.imag
        return jakobian

    def jakobian_prad_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        """∂(Re I, Im I)/∂x dla `I = (E - V) y`: kolumny kata i modulu SEM."""
        del napiecie_pu
        admitancja = self.admitancja_pu
        po_kacie = 1j * self.sem(stan) * admitancja
        po_module = cmath.exp(1j * float(stan[INDEKS_DELTA])) * admitancja
        jakobian = np.zeros((2, 4), dtype=float)
        jakobian[0, INDEKS_DELTA] = po_kacie.real
        jakobian[1, INDEKS_DELTA] = po_kacie.imag
        jakobian[0, INDEKS_MODULU_SEM] = po_module.real
        jakobian[1, INDEKS_MODULU_SEM] = po_module.imag
        return jakobian


def zbuduj_maszyne_klasyczna(
    *,
    ident: str,
    wezel: str,
    s_n_mva: float,
    h_s: float,
    d_pu: float,
    x_prim_pu: float,
    ra_pu: float,
    s_bazowa_mva: float,
    f_bazowa_hz: float,
) -> MaszynaKlasyczna:
    """Zbuduj maszyne, przeliczajac parametry z bazy urzadzenia na baze ukladu.

    JEDYNE miejsce zmiany bazy tej rodziny — klasa nie przelicza niczego w srodku,
    wiec nie ma drugiej drogi, ktora moglaby sie z ta rozejsc.
    """
    return MaszynaKlasyczna(
        ident=ident,
        wezel=wezel,
        h_s=zmiana_bazy_stalej_bezwladnosci(
            sprawdz_stala_bezwladnosci(h_s, urzadzenie=ident, rodzina="maszyna klasyczna"),
            s_n_mva,
            s_bazowa_mva,
        ),
        d_pu=zmiana_bazy_stalej_bezwladnosci(d_pu, s_n_mva, s_bazowa_mva),
        x_prim_pu=zmiana_bazy_impedancji(x_prim_pu, s_n_mva, s_bazowa_mva),
        ra_pu=zmiana_bazy_impedancji(ra_pu, s_n_mva, s_bazowa_mva),
        omega_bazowa_rad_s=pulsacja_bazowa_rad_s(f_bazowa_hz),
    )


__all__ = [
    "INDEKS_DELTA",
    "INDEKS_MOCY_MECHANICZNEJ",
    "INDEKS_MODULU_SEM",
    "INDEKS_OMEGA",
    "NAZWY_STANOW_MASZYNY_KLASYCZNEJ",
    "MaszynaKlasyczna",
    "zbuduj_maszyne_klasyczna",
]
