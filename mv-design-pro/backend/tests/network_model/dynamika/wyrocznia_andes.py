"""Most do wyroczni ZEWNETRZNEJ (ANDES) — import LENIWY, poza glownym biegiem.

PO CO WYROCZNIA ZEWNETRZNA. Wyrocznie analityczne (rowne pola, malosygnalowa,
calka pierwsza) sprawdzaja rdzen wobec ROZWIAZANIA TEGO SAMEGO ZADANIA, ale
wyprowadzonego przez tego samego autora. Odniesienie o wyzszej niezaleznosci to
INNE NARZEDZIE, napisane przez innych ludzi, z wlasnym modelem maszyny, wlasnym
skladaniem sieci i wlasnym calkowaniem. ANDES jest takim narzedziem.

DLACZEGO OSOBNE SRODOWISKO I OSOBNY JOB (regula A-10). ANDES nie wchodzi do
zaleznosci produkcyjnych backendu: jest wyrocznia, nie skladnikiem produktu.
Testy, ktore go wymagaja, nosza marker `andes` i biegna w izolowanym venv
(wzorzec `pandapower`). W biegu glownym sa DESELEKCJONOWANE markerem, a nie
pomijane warunkowo — `pytest.importorskip` na poziomie modulu zamienialby brak
wyroczni w „zielono", czego przeglad watku badawczego zabronil wprost
(P1-B55-03: modulowe pominiecie ukrylo sonde, ktora nie wymagala ANDES).
Import ANDES jest tu LENIWY (wewnatrz funkcji), wiec sam modul importuje sie w
kazdym srodowisku i nie blokuje zbierania testow.

RÓWNOWAZNOSC UKLADOW. Nasz SMIB ma szyne sztywna o SKONCZONEJ impedancji
wewnetrznej (`x_sys`), bo siec nadrzedna o nieskonczonej mocy zwarciowej nie
istnieje. ANDES modeluje wezel bilansujacy jako IDEALNE zrodlo napieciowe na
szynie. Oba uklady sa elektrycznie TOZSAME, gdy reaktancja linii ANDES wynosi
`x_linii + x_sys`, a napiecie wezla bilansujacego rowna sie SEM naszej szyny
sztywnej (modul i kat). Zgodnosc warunkow poczatkowych jest wtedy dokladna —
zmierzone `|delta_rel| = 7e-10 rad` przy inicjalizacji — i to jest warunek
wstepny kazdego porownania trajektorii.
"""

from __future__ import annotations

import cmath
from dataclasses import dataclass
from typing import Any

import numpy as np

from tests.network_model.dynamika.uklady import (
    F_BAZOWA_HZ,
    S_BAZOWA_MVA,
    U_N_KV,
    X_LINII_PU,
    X_SYSTEMU_PU,
    UkladSmib,
)

#: Tolerancja Newtona wyroczni — o rzedy wielkosci ciasniejsza od domyslnej 1e-4,
#: zeby porownanie mierzylo NASZ blad, a nie blad wyroczni.
TOLERANCJA_NEWTONA_WYROCZNI = 1.0e-10


@dataclass(frozen=True)
class PrzebiegWzorcowy:
    """Trajektoria kata wirnika z wyroczni zewnetrznej (kat WZGLEDNY)."""

    czas_s: np.ndarray
    delta_wzgledny_rad: np.ndarray


def sem_szyny(uklad: UkladSmib) -> complex:
    """SEM szyny sztywnej z punktu pracy — napiecie wezla bilansujacego ANDES."""
    stan = uklad.szyna.stan_poczatkowy(
        uklad.punkt_pracy.napiecia_pu["SYS"], uklad.punkt_pracy.moce_zrodel_pu["SYS1"]
    )
    return complex(float(stan[0]), float(stan[1]))


def zbuduj_system(uklad: UkladSmib, *, zwarcie: dict[str, float] | None) -> Any:
    """Zloz w ANDES uklad ELEKTRYCZNIE ROWNOWAZNY naszemu SMIB.

    `zwarcie` (opcjonalne) ma klucze `t_s`, `t_usuniecia_s`, `r_f_pu`, `x_f_pu`
    i opisuje zwarcie na szynie generatora — te same wielkosci, ktore nasz rdzen
    dostaje z harmonogramu (juz przeliczone na jednostki wzgledne).
    """
    import andes  # noqa: PLC0415 — wyrocznia opcjonalna, import leniwy z zasady

    sem = sem_szyny(uklad)
    napiecie_generatora = abs(uklad.punkt_pracy.napiecia_pu["GEN"])
    moc_generatora = uklad.punkt_pracy.moce_zrodel_pu["G1"].real

    # CZESTOTLIWOSC BAZOWA. Domyslna `fn` w ANDES to 60 Hz; nasz uklad pracuje przy
    # 50 Hz, a `omega_0 = 2 pi fn` stoi wprost w rownaniu kata. Pozostawienie
    # domyslnej wartosci daje rozjazd trajektorii rzedu 0,3 rad (zmierzone) przy
    # IDENTYCZNYCH warunkach poczatkowych — blad, ktory wyglada jak roznica metod,
    # a jest roznica ukladu. Ustawiamy ja jawnie w konfiguracji systemu i na
    # kazdym elemencie, ktory ja niesie.
    system = andes.System(setup=False)
    system.config.freq = F_BAZOWA_HZ
    system.add("Bus", {"idx": 1, "Vn": U_N_KV, "v0": napiecie_generatora, "a0": 0.0})
    system.add("Bus", {"idx": 2, "Vn": U_N_KV, "v0": abs(sem), "a0": cmath.phase(sem)})
    system.add(
        "Line",
        {
            "idx": "L12",
            "bus1": 1,
            "bus2": 2,
            "r": 0.0,
            "x": X_LINII_PU + X_SYSTEMU_PU,
            "b": 0.0,
            "Sn": S_BAZOWA_MVA,
            "fn": F_BAZOWA_HZ,
            "Vn1": U_N_KV,
            "Vn2": U_N_KV,
        },
    )
    system.add(
        "Slack",
        {
            "idx": "SL",
            "bus": 2,
            "u": 1,
            "Sn": S_BAZOWA_MVA,
            "Vn": U_N_KV,
            "v0": abs(sem),
            "a0": cmath.phase(sem),
            "p0": 0.0,
            "q0": 0.0,
            "busr": 2,
        },
    )
    system.add(
        "PV",
        {
            "idx": "G1",
            "bus": 1,
            "Sn": S_BAZOWA_MVA,
            "Vn": U_N_KV,
            "v0": napiecie_generatora,
            "p0": moc_generatora,
            "qmax": 5.0,
            "qmin": -5.0,
            "busr": 1,
        },
    )
    system.add(
        "GENCLS",
        {
            "idx": "GC1",
            "bus": 1,
            "gen": "G1",
            "Sn": S_BAZOWA_MVA,
            "Vn": U_N_KV,
            "D": uklad.maszyna.d_pu,
            "M": 2.0 * uklad.maszyna.h_s,
            "xd1": uklad.maszyna.x_prim_pu,
            "ra": uklad.maszyna.ra_pu,
            "fn": F_BAZOWA_HZ,
        },
    )
    if zwarcie is not None:
        system.add(
            "Fault",
            {
                "idx": "F1",
                "bus": 1,
                "tf": zwarcie["t_s"],
                "tc": zwarcie["t_usuniecia_s"],
                "xf": zwarcie["x_f_pu"],
                "rf": zwarcie["r_f_pu"],
            },
        )
    system.setup()
    return system


def przebieg(
    uklad: UkladSmib,
    *,
    horyzont_s: float,
    dt_s: float,
    zwarcie: dict[str, float] | None,
) -> PrzebiegWzorcowy:
    """Uruchom symulacje czasowa ANDES i zwroc kat wirnika WZGLEDEM SEM szyny."""
    system = zbuduj_system(uklad, zwarcie=zwarcie)
    system.PFlow.run()
    system.TDS.config.tf = horyzont_s
    system.TDS.config.tstep = dt_s
    # TOLERANCJA NEWTONA WYROCZNI. Domyslna `tol` w ANDES to 1e-4 — przy tej
    # wartosci roznica trajektorii wzgledem naszego rdzenia (tolerancja 1e-11)
    # zatrzymuje sie na podlodze ~2e-4 rad i NIE maleje z krokiem (zmierzone dla
    # dt = 0,5 / 0,25 / 0,125 ms: 2,71e-04 / 2,83e-04 / 3,07e-04 rad). Wyrocznia
    # liczona lużniej od przedmiotu pomiaru mierzy wlasny blad, nie nasz.
    system.TDS.config.tol = TOLERANCJA_NEWTONA_WYROCZNI
    system.TDS.run()

    odniesienie = cmath.phase(sem_szyny(uklad))
    czas = np.array(system.dae.ts.t, dtype=float)
    indeks_delty = system.GENCLS.delta.a[0]
    delta = np.array([wiersz[indeks_delty] for wiersz in system.dae.ts.x], dtype=float)
    return PrzebiegWzorcowy(czas_s=czas, delta_wzgledny_rad=delta - odniesienie)


@dataclass(frozen=True)
class PorownanieTrajektorii:
    """Blad kata RAZEM z pomiarem POKRYCIA — jedno bez drugiego nie jest wynikiem."""

    blad_rad: float
    od_wymagane_s: float
    do_wymagane_s: float
    od_wzorca_s: float
    do_wzorca_s: float
    pokrycie_udzial: float
    probek_porownanych: int
    probek_odrzuconych: int


def pokrycie_wzorca(
    wzorzec: PrzebiegWzorcowy, *, od_s: float, do_s: float
) -> tuple[float, float, float]:
    """Jaka CZESC zadanego odcinka wzorzec faktycznie obejmuje (od, do, udzial)."""
    od_wzorca = float(wzorzec.czas_s[0])
    do_wzorca = float(wzorzec.czas_s[-1])
    zadany = do_s - od_s
    if zadany <= 0.0:
        return od_wzorca, do_wzorca, 0.0
    wspolny = min(do_s, do_wzorca) - max(od_s, od_wzorca)
    return od_wzorca, do_wzorca, max(0.0, wspolny) / zadany


def porownaj_trajektorie(
    czas_nasz: np.ndarray,
    delta_nasz: np.ndarray,
    wzorzec: PrzebiegWzorcowy,
    *,
    od_s: float,
    do_s: float,
) -> PorownanieTrajektorii:
    """Maksymalny blad kata na odcinku `[od_s, do_s]` WRAZ z pomiarem pokrycia.

    Wzorzec jest interpolowany LINIOWO na nasza siatke probek — obie siatki
    powstaja z innych krokow calkowania, wiec bez interpolacji porownywaloby sie
    rozne chwile. Blad interpolacji jest rzedu `dt^2` wzorca i przy kroku 0,5 ms
    lezy o rzedy wielkosci ponizej mierzonych roznic.

    POKRYCIE JEST WARUNKIEM, NIE OZDOBA (R10 par. 16). `numpy.interp` poza
    zakresem wzorca NIE ekstrapoluje i nie zglasza bledu — PRZYTRZYMUJE skrajna
    wartosc. Wersja tej funkcji sprzed R10 wymagala wylacznie, zeby maska miala
    „co najmniej jedna probke", wiec wzorzec urwany na 80% odcinka byl
    porownywany ze STALA na pozostalych 20% i — na spokojnym ogonie przebiegu —
    przechodzil. To jest dokladnie ten ksztalt defektu, ktory unicestwia
    wartosc wyroczni: im mniej wzorca, tym latwiej „zgodnosc".

    Dlatego niepelne pokrycie konczy sie `AssertionError` z POMIAREM (ile
    zadano, ile wzorzec obejmuje, ile probek odrzucono), a nie cichym wynikiem.
    """
    maska = (czas_nasz >= od_s) & (czas_nasz <= do_s)
    if not maska.any():
        raise AssertionError(f"Odcinek [{od_s}, {do_s}] nie zawiera ani jednej probki")
    od_wzorca, do_wzorca, udzial = pokrycie_wzorca(wzorzec, od_s=od_s, do_s=do_s)
    poza = int(np.count_nonzero((czas_nasz[maska] < od_wzorca) | (czas_nasz[maska] > do_wzorca)))
    if poza or udzial < 1.0:
        raise AssertionError(
            "WZORZEC NIE POKRYWA ZADANEGO ODCINKA — porownanie odrzucone. "
            f"Zadano [{od_s}, {do_s}] s, wzorzec obejmuje [{od_wzorca}, {do_wzorca}] s "
            f"(pokrycie {udzial:.6f}); probek poza zakresem wzorca: {poza} "
            f"z {int(np.count_nonzero(maska))}. Interpolacja przytrzymalaby skrajna "
            "wartosc wzorca i porownywala nasz przebieg ze STALA."
        )
    wzorzec_na_siatce = np.interp(czas_nasz[maska], wzorzec.czas_s, wzorzec.delta_wzgledny_rad)
    return PorownanieTrajektorii(
        blad_rad=float(np.max(np.abs(delta_nasz[maska] - wzorzec_na_siatce))),
        od_wymagane_s=od_s,
        do_wymagane_s=do_s,
        od_wzorca_s=od_wzorca,
        do_wzorca_s=do_wzorca,
        pokrycie_udzial=udzial,
        probek_porownanych=int(np.count_nonzero(maska)),
        probek_odrzuconych=poza,
    )


def blad_trajektorii(
    czas_nasz: np.ndarray,
    delta_nasz: np.ndarray,
    wzorzec: PrzebiegWzorcowy,
    *,
    od_s: float,
    do_s: float,
) -> float:
    """Sam blad kata — cienka nakladka na `porownaj_trajektorie` (jedno zrodlo prawdy)."""
    return porownaj_trajektorie(czas_nasz, delta_nasz, wzorzec, od_s=od_s, do_s=do_s).blad_rad


__all__ = [
    "PorownanieTrajektorii",
    "PrzebiegWzorcowy",
    "blad_trajektorii",
    "pokrycie_wzorca",
    "porownaj_trajektorie",
    "przebieg",
    "sem_szyny",
    "zbuduj_system",
]
