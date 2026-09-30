"""SWEEP KWALIFIKACYJNY estymat bledu obserwabli W6-A — reprodukowalny, w repozytorium.

PO CO TEN PLIK. Runda 1 zameldowala „140 punktow x 5 tolerancji, najgorszy iloraz 0,769",
ale ta liczba powstala w skrypcie sesyjnym, ktorego w repozytorium NIE BYLO. Liczba
kwalifikacyjna, ktorej nie da sie odtworzyc z drzewa, nie jest dowodem. Ten modul jest
odpowiedzia: bada KLASE przypadkow i podaje rozklad ilorazow, a nie jeden przykład.

    python -m tests.network_model.dynamika.kwalifikacja_niepewnosci            # siatka CI
    python -m tests.network_model.dynamika.kwalifikacja_niepewnosci --pelny    # siatka pelna

CO JEST MIERZONE. Dla kazdego punktu pracy rozwiazujemy algebre z tolerancja BADANA i
porownujemy z WYROCZNIA, licząc:

    rho_V    = |V_obl - V_wyr|         / u_V
    rho_Vdot = |Vdot_obl - Vdot_wyr|   / u_Vdot
    rho_f    = |f_obl - f_wyr|         / u_f

`rho > 1` NIE jest bledem testu: `u_*` sa ESTYMATAMI pierwszego rzedu, nie granicami.
Rozklad ilorazow jest wlasnie ta informacja, ktorej estymata wymaga, zeby dalo sie ja
uczciwie nazwac.

DWIE WYROCZNIE, obie niezalezne od badanej wielkosci:

* `analityczna` — rodzina dwuwezlowa maszyna–linia–odbior ma rozwiazanie ZAMKNIETE,
  wyprowadzone recznie i liczone w 60 cyfrach (`decimal`), wiec nie dzieli z badanym torem
  ani jakobianu, ani Newtona, ani nawet arytmetyki zmiennoprzecinkowej. Uzywana tam, gdzie
  obie galezie krzywej PV sa rozdzielone na tyle, ze przypisanie rozwiazania do galezi jest
  jednoznaczne.
* `zacisniecie` — Newton z tolerancja o rzedy ciasniejsza, startowany Z ROZWIAZANIA
  BADANEGO, wiec pozostajacy na tej samej galezi. Uzywana dla rodzin bez postaci zamknietej
  (rezystancja, susceptancja, przekladnia, wiele wezlow). To wyrocznia SLABSZA — dzieli
  implementacje — i jest tak oznaczona w wyniku.

POCHODNA W PUNKCIE WZORCOWYM liczy sie ta sama formula co w torze badanym, bo przedmiotem
badania jest ESTYMATA BLEDU, nie sama formula pochodnej; wartoscia dokladna `Vdot` jest z
definicji ta formula w punkcie dokladnym.
"""

from __future__ import annotations

import math
import statistics
import sys
from dataclasses import dataclass
from decimal import Decimal, getcontext

import numpy as np
from network_model.solvers.dynamika.kontrakty import (
    GalazDynamiki,
    OdbiorDynamiki,
    WezelDynamiki,
)
from network_model.solvers.dynamika.obserwable import (
    czestotliwosc_wezla,
    pochodna_napiec,
    pochodna_napiec_z_niepewnoscia,
)
from network_model.solvers.dynamika.odbiory import charakterystyka_stalej_mocy
from network_model.solvers.dynamika.siec import rozwiaz_algebre, zloz_model_sieci
from network_model.solvers.dynamika.urzadzenia.maszyna_klasyczna import MaszynaKlasyczna

#: Odbior STALEJ MOCY bez zadeklarowanego napiecia przejscia (karta modeli odbiorow):
#: dokladnie dotychczasowy model tego wzorca — charakterystyka przy kazdym |V| > 0.
STALA_MOC = charakterystyka_stalej_mocy(u_min_pu=None)

getcontext().prec = 60

F_BAZOWA_HZ = 50.0
OMEGA_BAZOWA = 2.0 * math.pi * F_BAZOWA_HZ
#: Rozdzielenie galezi krzywej PV, przy ktorym przypisanie rozwiazania do galezi jest
#: jednoznaczne. Wartosc pochodzi z POMIARU: przy mniejszym rozstepie Newton z roznych
#: punktow startowych laduje raz na jednej, raz na drugiej galezi, a porownanie mierzyloby
#: wtedy odleglosc miedzy ROZWIAZANIAMI, nie blad jednego z nich.
MIN_ROZSTEP_GALEZI_PU = 5.0e-3

#: Podloga szumu pomiarowego. Przy ciasnej tolerancji zarowno blad, jak i estymata schodza
#: do poziomu zaokraglenia podwojnej precyzji; iloraz dwoch takich liczb mierzy wtedy szum
#: arytmetyki, a nie jakosc estymaty. Wartosc jest wyprowadzona: `eps * |V| ~ 2e-16`, a po
#: przejsciu przez `1/(2 pi)` i typowe `|Vdot|` rzedu jednosci daje okolice 1e-13 Hz — bierzemy
#: dekade zapasu. Rozdzial jest RAPORTOWANY, nie ukrywany: raport podaje OBA zbiory.
PODLOGA_SZUMU_HZ = 1.0e-12
PODLOGA_SZUMU_PU = 1.0e-13


@dataclass(frozen=True)
class Przypadek:
    """Jeden punkt siatki kwalifikacyjnej."""

    rodzina: str
    p_pu: float
    q_pu: float
    x_linii_pu: float
    r_linii_pu: float
    b_poprzeczna_pu: float
    przekladnia: complex
    sem_pu: float
    x_prim_pu: float
    modul_startu: float
    tolerancja: float


@dataclass(frozen=True)
class Wynik:
    """Zmierzone ilorazy dla jednego przypadku."""

    przypadek: Przypadek
    wyrocznia: str
    rho_v: float
    rho_vdot: float
    rho_f: float
    modul_napiecia: float
    blad_v: float
    blad_f: float

    @property
    def nad_szumem(self) -> bool:
        """Czy wielkosci mierzone leza powyzej poziomu zaokraglenia podwojnej precyzji."""
        return self.blad_f > PODLOGA_SZUMU_HZ and self.blad_v > PODLOGA_SZUMU_PU


def _rozwiazanie_zamkniete(
    *, sem: float, x_linii: float, x_prim: float, p_pu: float, q_pu: float, gorna: bool
) -> tuple[complex, complex] | None:
    """(V_A, V_B) rodziny dwuwezlowej, liczone w 60 cyfrach; None poza granica istnienia.

    Z `g_A = 0` wychodzi podzial napiecia miedzy dwie reaktancje, z `g_B = 0` po pomnozeniu
    przez `conj(V_B)` i przez `j X_tot` — uklad dwoch rownan rzeczywistych:
    `u^2 + v^2 - E u + X_tot Q = 0` oraz `E v + X_tot P = 0`.
    """
    e = Decimal(repr(sem))
    xl, xp = Decimal(repr(x_linii)), Decimal(repr(x_prim))
    p, q = Decimal(repr(p_pu)), Decimal(repr(q_pu))
    x_tot = xl + xp
    v = -x_tot * p / e
    wyroznik = e * e - 4 * (v * v + x_tot * q)
    if wyroznik <= 0:
        return None
    pierwiastek = wyroznik.sqrt()
    u = (e + pierwiastek) / 2 if gorna else (e - pierwiastek) / 2
    napiecie_b = complex(float(u), float(v))
    napiecie_a = complex(float((xp * u + xl * e) / x_tot), float((xp * v) / x_tot))
    return napiecie_a, napiecie_b


def _rozstep_galezi(
    *, sem: float, x_linii: float, x_prim: float, p_pu: float, q_pu: float
) -> float:
    gorna = _rozwiazanie_zamkniete(
        sem=sem, x_linii=x_linii, x_prim=x_prim, p_pu=p_pu, q_pu=q_pu, gorna=True
    )
    dolna = _rozwiazanie_zamkniete(
        sem=sem, x_linii=x_linii, x_prim=x_prim, p_pu=p_pu, q_pu=q_pu, gorna=False
    )
    if gorna is None or dolna is None:
        return 0.0
    return abs(gorna[1] - dolna[1])


def _uklad(przypadek: Przypadek):
    wezly = (WezelDynamiki(ident="A", u_n_kv=15.0), WezelDynamiki(ident="B", u_n_kv=15.0))
    galezie = (
        GalazDynamiki(
            ident="L1",
            wezel_od="A",
            wezel_do="B",
            y_szeregowa_pu=1.0 / complex(przypadek.r_linii_pu, przypadek.x_linii_pu),
            b_poprzeczna_pu=przypadek.b_poprzeczna_pu,
            przekladnia=przypadek.przekladnia,
            aktywna_na_starcie=True,
            rodzaj="linia",
        ),
    )
    odbiory = (
        OdbiorDynamiki(
            ident="O1",
            wezel="B",
            p_pu=przypadek.p_pu,
            q_pu=przypadek.q_pu,
            charakterystyka=STALA_MOC,
        ),
    )
    maszyna = MaszynaKlasyczna(
        ident="G1",
        wezel="A",
        h_s=3.5,
        d_pu=0.0,
        x_prim_pu=przypadek.x_prim_pu,
        ra_pu=0.0,
        omega_bazowa_rad_s=OMEGA_BAZOWA,
    )
    stany = (np.array([0.0, 1.002, przypadek.p_pu, przypadek.sem_pu], dtype=float),)
    return zloz_model_sieci(wezly, galezie, ()), odbiory, (maszyna,), stany


def _czestotliwosci(model, odbiory, urzadzenia, stany, napiecia):
    pomiar = pochodna_napiec_z_niepewnoscia(model, odbiory, urzadzenia, stany, napiecia)
    wartosci = [
        czestotliwosc_wezla(
            complex(napiecia[i]),
            complex(pomiar.pochodna_pu_s[i]),
            f_bazowa_hz=F_BAZOWA_HZ,
            niepewnosc_napiecia_pu=float(pomiar.niepewnosc_napiecia_pu[i]),
            niepewnosc_pochodnej_pu_s=float(pomiar.niepewnosc_pochodnej_pu_s[i]),
        )
        for i in range(model.liczba_wezlow)
    ]
    return pomiar, wartosci


def zbadaj(przypadek: Przypadek) -> list[Wynik]:
    """Zwraca po jednym wyniku na wezel; pusta lista, gdy punkt nie nadaje sie do pomiaru."""
    model, odbiory, urzadzenia, stany = _uklad(przypadek)
    start = np.array([complex(1.0, 0.0), complex(przypadek.modul_startu, -0.25)], dtype=complex)
    wspolne = {"max_iteracji": 500, "max_nawrotow": 100, "t_s": 0.0}
    try:
        badane = rozwiaz_algebre(
            model, odbiory, urzadzenia, stany, start, tolerancja=przypadek.tolerancja, **wspolne
        )
    except Exception:
        return []

    wzorzec: np.ndarray | None = None
    wyrocznia = ""
    if przypadek.rodzina == "analityczna":
        rozstep = _rozstep_galezi(
            sem=przypadek.sem_pu,
            x_linii=przypadek.x_linii_pu,
            x_prim=przypadek.x_prim_pu,
            p_pu=przypadek.p_pu,
            q_pu=przypadek.q_pu,
        )
        if rozstep < MIN_ROZSTEP_GALEZI_PU:
            return []  # galezie zbyt blisko — przypisanie byloby zgadywaniem
        for gorna in (True, False):
            para = _rozwiazanie_zamkniete(
                sem=przypadek.sem_pu,
                x_linii=przypadek.x_linii_pu,
                x_prim=przypadek.x_prim_pu,
                p_pu=przypadek.p_pu,
                q_pu=przypadek.q_pu,
                gorna=gorna,
            )
            if para is None:
                continue
            kandydat = np.array(para, dtype=complex)
            if np.max(np.abs(badane.napiecia - kandydat)) < rozstep / 2.0:
                wzorzec, wyrocznia = kandydat, "analityczna"
                break
        if wzorzec is None:
            return []
    else:
        try:
            zaciete = rozwiaz_algebre(
                model, odbiory, urzadzenia, stany, badane.napiecia, tolerancja=1.0e-14, **wspolne
            )
        except Exception:
            return []
        wzorzec, wyrocznia = zaciete.napiecia, "zacisniecie"

    try:
        pomiar, zmierzone = _czestotliwosci(model, odbiory, urzadzenia, stany, badane.napiecia)
        pochodna_wzorcowa = pochodna_napiec(model, odbiory, urzadzenia, stany, wzorzec)
        _, wzorcowe = _czestotliwosci(model, odbiory, urzadzenia, stany, wzorzec)
    except Exception:
        return []

    wyniki: list[Wynik] = []
    for i in range(model.liczba_wezlow):
        u_v = float(pomiar.niepewnosc_napiecia_pu[i])
        u_vdot = float(pomiar.niepewnosc_pochodnej_pu_s[i])
        u_f = zmierzone[i].niepewnosc_hz
        e_v = float(abs(badane.napiecia[i] - wzorzec[i]))
        e_vdot = float(abs(pomiar.pochodna_pu_s[i] - pochodna_wzorcowa[i]))
        e_f = abs(zmierzone[i].f_hz - wzorcowe[i].f_hz)
        if not (u_v > 0.0 and u_vdot > 0.0 and u_f > 0.0):
            continue  # mianownik zerowy albo nieskonczony — NIE chowamy, po prostu brak ilorazu
        if not all(math.isfinite(x) for x in (u_v, u_vdot, u_f, e_v, e_vdot, e_f)):
            continue
        wyniki.append(
            Wynik(
                przypadek=przypadek,
                wyrocznia=wyrocznia,
                rho_v=e_v / u_v,
                rho_vdot=e_vdot / u_vdot,
                rho_f=e_f / u_f,
                modul_napiecia=float(abs(badane.napiecia[i])),
                blad_v=e_v,
                blad_f=e_f,
            )
        )
    return wyniki


def siatka(*, pelna: bool) -> list[Przypadek]:
    """Siatka przypadkow — iloczyn cech, nie lista przykladow."""
    tolerancje = (1.0e-3, 1.0e-4, 1.0e-5, 1.0e-6, 1.0e-8)
    starty = (1.00, 0.70, 0.40) if pelna else (1.00, 0.55)
    ulamki = (0.3, 0.6, 0.85, 0.95, 0.985) if pelna else (0.3, 0.85, 0.985)
    przypadki: list[Przypadek] = []

    # Rodzina A — postac zamknieta: czysta reaktancja, bez susceptancji i przekladni.
    for sem in (1.00, 1.10) if pelna else (1.10,):
        for x_linii in (0.15, 0.30, 0.50) if pelna else (0.30,):
            for q in (-0.2, 0.0, 0.3) if pelna else (0.0, 0.3):
                x_prim = 0.30
                p_max = sem * sem / (2.0 * (x_linii + x_prim))
                for ulamek in ulamki:
                    for start in starty:
                        for tol in tolerancje:
                            przypadki.append(
                                Przypadek(
                                    rodzina="analityczna",
                                    p_pu=ulamek * p_max,
                                    q_pu=q,
                                    x_linii_pu=x_linii,
                                    r_linii_pu=0.0,
                                    b_poprzeczna_pu=0.0,
                                    przekladnia=complex(1.0, 0.0),
                                    sem_pu=sem,
                                    x_prim_pu=x_prim,
                                    modul_startu=start,
                                    tolerancja=tol,
                                )
                            )

    # Rodzina B — bez postaci zamknietej: rezystancja, susceptancja, przekladnia zespolona.
    warianty = (
        (0.05, 0.00, complex(1.0, 0.0)),
        (0.00, 0.25, complex(1.0, 0.0)),
        (0.08, 0.18, complex(1.0, 0.0)),
        (0.00, 0.00, 1.025 * complex(math.cos(math.pi / 6), math.sin(math.pi / 6))),
        (0.06, 0.20, 0.975 * complex(math.cos(-math.pi / 9), math.sin(-math.pi / 9))),
    )
    if not pelna:
        warianty = warianty[:3]
    for r_linii, b_poprzeczna, przekladnia in warianty:
        for ulamek in ulamki:
            for start in starty:
                for tol in tolerancje:
                    przypadki.append(
                        Przypadek(
                            rodzina="zacisniecie",
                            p_pu=ulamek * 1.008,
                            q_pu=0.1,
                            x_linii_pu=0.30,
                            r_linii_pu=r_linii,
                            b_poprzeczna_pu=b_poprzeczna,
                            przekladnia=przekladnia,
                            sem_pu=1.10,
                            x_prim_pu=0.30,
                            modul_startu=start,
                            tolerancja=tol,
                        )
                    )
    return przypadki


def przemiataj(*, pelna: bool) -> list[Wynik]:
    wyniki: list[Wynik] = []
    for przypadek in siatka(pelna=pelna):
        wyniki.extend(zbadaj(przypadek))
    return wyniki


def _kwantyle(wartosci: list[float]) -> tuple[float, float, float, float]:
    posortowane = sorted(wartosci)
    if not posortowane:
        return (0.0, 0.0, 0.0, 0.0)

    def kwantyl(q: float) -> float:
        return posortowane[min(len(posortowane) - 1, int(q * len(posortowane)))]

    return (statistics.median(posortowane), kwantyl(0.90), kwantyl(0.99), posortowane[-1])


def raport(wyniki: list[Wynik]) -> str:
    nad = [w for w in wyniki if w.nad_szumem]
    wiersze = [
        f"Przypadkow zmierzonych (wezel x punkt): {len(wyniki)}"
        f"   z tego nad podloga szumu: {len(nad)}"
    ]
    wiersze.append(_blok("WSZYSTKIE (z szumem zaokraglen)", wyniki))
    wiersze.append(_blok("NAD PODLOGA SZUMU (wielkosci mierzalne)", nad))
    return "\n".join(wiersze)


def _blok(tytul: str, wyniki: list[Wynik]) -> str:
    wiersze = [f"--- {tytul} ---"]
    for nazwa, klucz in (("rho_V", "rho_v"), ("rho_Vdot", "rho_vdot"), ("rho_f", "rho_f")):
        wartosci = [getattr(w, klucz) for w in wyniki]
        mediana, p90, p99, maks = _kwantyle(wartosci)
        najgorszy = max(wyniki, key=lambda w: getattr(w, klucz)) if wyniki else None
        wiersze.append(
            f"{nazwa:>9}: p50={mediana:9.4f}  p90={p90:9.4f}  p99={p99:9.4f}  max={maks:9.4f}"
            + (
                f"   (najgorszy: rodzina={najgorszy.wyrocznia} "
                f"P={najgorszy.przypadek.p_pu:.4f} Q={najgorszy.przypadek.q_pu:g} "
                f"tol={najgorszy.przypadek.tolerancja:g} start={najgorszy.przypadek.modul_startu:g} "
                f"|V|={najgorszy.modul_napiecia:.4f})"
                if najgorszy is not None
                else ""
            )
        )
    return "\n".join(wiersze)


def main() -> int:
    pelna = "--pelny" in sys.argv
    wyniki = przemiataj(pelna=pelna)
    print(f"SIATKA: {'pelna' if pelna else 'CI'}")
    print(raport(wyniki))
    print(
        "\nUWAGA: rho > 1 NIE jest bledem — u_V, u_Vdot i u_f sa ESTYMATAMI bledu\n"
        "pierwszego rzedu, nie certyfikowanymi granicami. Rozklad powyzej jest\n"
        "informacja o jakosci estymaty na zbadanej klasie, nie twierdzeniem."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
