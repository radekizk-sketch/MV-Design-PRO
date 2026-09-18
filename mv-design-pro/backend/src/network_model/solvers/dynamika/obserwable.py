"""Obserwable inzynierskie `z(t)` — czestotliwosc wezlow i wielkosci zaciskow galezi (W6-A).

TRZY ROZLACZNE PRZESTRZENIE (zamrozenie W6-A par. 2).

* `x(t)` — stany rozniczkowe urzadzen; kazdy ma swoje rownanie ruchu,
* `y(t)` — zmienne algebraiczne sieci: zespolone napiecia wezlowe, rozwiazanie `g(x,y)=0`,
* `z(t)` — TEN modul: wielkosci WYPROWADZONE z `x` i `y` jawnym wzorem, z jednostka,
  orientacja i domena waznosci.

Obserwabla NIGDY nie zostaje stanem. Dodanie czestotliwosci jako stanu rozniczkowego, zeby
„miec pochodna za darmo", wprowadziloby do macierzy stanu dodatkowa wartosc wlasna, ktorej
uklad fizycznie nie ma — i zaklamalo analize malosygnalowa.

CZESTOTLIWOSC WEZLA — SKAD SIE BIERZE POCHODNA KATA.

Rdzen calkuje kat KAZDEJ rodziny jako odchylke predkosci pomnozona przez pulsacje bazowa
(maszyna: `d delta/dt = (omega - 1) omega_0`; przeksztaltnik tworzacy siec: to samo;
petla synchronizacji nadazna: to samo), a Ybus nie zalezy od czasu. Fazory zyja wiec w ukladzie
wirujacym z `omega_0`, czyli faza chwilowa wezla to `fi_i(t) = omega_0 t + theta_i(t)`, a stad

    f_i(t) = f_n + (1/2pi) d theta_i/dt .

Czlon `f_n` jest konsekwencja ukladu odniesienia, nie zalozeniem — i ma przypiety test
falsyfikacyjny (wyspa z jednym urzadzeniem tworzacym siec o predkosci `1+s` musi dac
`f_i = f_n (1+s)` na KAZDYM wezle).

POCHODNA JEST ANALITYCZNA, NIE ROZNICOWA. Rozniczkowanie `g(x,y) = Y V - I(x,V) = 0` po czasie
daje uklad liniowy na pochodna napiec:

    (dg/dy) ydot = (dI/dx) xdot

gdzie `dg/dy` to DOKLADNIE ten jakobian, ktorym Newton rozwiazuje algebre (`jakobian_algebry`),
a `dI/dx` sklada sie z blokow `jakobian_prad_stan` urzadzen. Dzieki temu:

* nie ma roznicy skonczonej na siatce wyjscia (krok wyjscia bywa rzedu 10 ms — roznica wsteczna
  na takiej siatce ma blad rzedu `dt * d2theta/dt2`),
* nie ma zawijania fazy do rozwijania, bo kat nie jest w ogole rozniczkowany numerycznie,
* nieciaglosc laczeniowa NIE produkuje impulsu: wartosc w chwili `t` liczy sie z biezacego
  stanu, nigdy przez granice zdarzenia.

ZASIEG TEJ POLITYKI — UCZCIWIE. Kryterium ponizej jest NUMERYCZNE: wychodzi z tolerancji
algebry i modulu napiecia. Podstawienie wzorow daje `u > |f - f_n|` dokladnie dla
`|V| < 4 * tolerancja`, czyli pasmo ograniczonej wiarygodnosci jest WASKIE i przylega do
pasma niedostepnosci. Innymi slowy: ta polityka chroni przed NUMERYCZNA bezsensownoscia
kata, a NIE orzeka, od jak glebokiego zapadu inzynier ma przestac mowic o czestotliwosci
wezla. Ta druga, FIZYCZNA granica wymaga polityki wyprowadzonej i ZWALIDOWANEJ (fala
walidacyjna) i pozostaje jawna luka — nie zastepujemy jej progiem przyjetym z gory.

DOMENA WAZNOSCI (decyzja wlasciciela OD-36: to NIE jest nastawa uzytkownika). Kat fazora traci
sens, gdy modul napiecia zbiega do zera. Polityka jakosci jest wyprowadzona z wielkosci, ktore
solver i tak zna — tolerancji algebry i modulu napiecia — a nie z progu napieciowego przyjetego
z gory. Obserwabla wraca jako WARTOSC + NIEPEWNOSC + STAN JAKOSCI; wartosc niedostepna NIE jest
zastepowana czestotliwoscia znamionowa.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from scipy.sparse import linalg as sparse_linalg

from .kontrakty import GalazDynamiki, OdbiorDynamiki, Urzadzenie
from .siec import ModelSieci, jakobian_algebry

#: Kody stanu jakosci obserwabli (szeregi wyniku sa float-only i bez NaN, wiec stan
#: jakosci jest kodem liczbowym o ZAMKNIETYM zbiorze wartosci; mapowanie jest czescia
#: kontraktu i ma przypiety test).
JAKOSC_WIARYGODNA = 0.0
JAKOSC_OGRANICZONA = 1.0
JAKOSC_NIEDOSTEPNA = 2.0

#: Opisy stanow jakosci — jedno zrodlo prawdy dla wyniku i dla prezentacji.
OPIS_JAKOSCI_PL: dict[float, str] = {
    JAKOSC_WIARYGODNA: "wiarygodna",
    JAKOSC_OGRANICZONA: "ograniczona wiarygodnosc",
    JAKOSC_NIEDOSTEPNA: "niedostepna",
}

#: Stala ograniczenia propagacji niepewnosci katowej — wynika z oszacowania pochodnych
#: czastkowych `d(theta_dot)/d(V)` i `d(theta_dot)/d(Vdot)`, nie z dobrania wartosci:
#: |d theta_dot / d Vdot| <= 1/|V| oraz |d theta_dot / d V| <= 3 |Vdot| / |V|^2, a przy
#: zalozeniu rownych bledow wzglednych `u_Vdot/|Vdot| = u_V/|V|` suma daje 4 |Vdot| u_V / |V|^2.
WSPOLCZYNNIK_PROPAGACJI_KATA = 4.0


@dataclass(frozen=True)
class CzestotliwoscWezla:
    """Czestotliwosc elektryczna wezla: wartosc, niepewnosc i stan jakosci."""

    f_hz: float
    niepewnosc_hz: float
    jakosc: float


@dataclass(frozen=True)
class WielkosciGalezi:
    """Wielkosci OBU zaciskow galezi `od -> do` (pu, skladowa zgodna).

    ORIENTACJA I ZNAK: prad dodatni plynie Z WEZLA DO GALEZI na danym zacisku. Przy tej
    umowie `s_od + s_do` jest STRATA galezi (czesc rzeczywista dodatnia) — ta sama umowa,
    ktora niesie tor rozplywu. Publikujemy OBA zaciski; pojedyncza, bezprzymiotnikowa
    wielkosc „prad galezi" jest w tym kontrakcie zakazana.
    """

    i_od_pu: complex
    i_do_pu: complex
    s_od_pu: complex
    s_do_pu: complex


def pochodna_napiec(
    model: ModelSieci,
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> np.ndarray:
    """`dV/dt` z ROZNICZKOWANIA rownania algebraicznego (nie z roznicy probek).

    `(dg/dy) ydot = (dI/dx) xdot`, gdzie lewa strona to jakobian algebry (ten sam, ktorym
    Newton rozwiazuje `g = 0`), a prawa sklada sie z blokow `jakobian_prad_stan` urzadzen
    pomnozonych przez ich pochodne stanu. Odbiory o stalej mocy nie maja stanow, wiec nie
    wnosza do prawej strony — wnosza wylacznie do jakobianu.
    """
    liczba = model.liczba_wezlow
    prawa_strona = np.zeros(2 * liczba, dtype=float)
    for urzadzenie, stan in zip(urzadzenia, stany, strict=True):
        pozycja = model.indeks_wezla[urzadzenie.wezel]
        napiecie = complex(napiecia[pozycja])
        wklad = urzadzenie.jakobian_prad_stan(stan, napiecie) @ urzadzenie.pochodne(stan, napiecie)
        prawa_strona[pozycja] += float(wklad[0])
        prawa_strona[pozycja + liczba] += float(wklad[1])

    jakobian = jakobian_algebry(model, odbiory, urzadzenia, stany, napiecia)
    rozwiazanie = sparse_linalg.splu(jakobian).solve(prawa_strona)
    return np.asarray(rozwiazanie[:liczba] + 1j * rozwiazanie[liczba:], dtype=complex)


def czestotliwosc_wezla(
    napiecie_pu: complex,
    pochodna_napiecia_pu_s: complex,
    *,
    f_bazowa_hz: float,
    tolerancja_algebry: float,
) -> CzestotliwoscWezla:
    """Czestotliwosc elektryczna JEDNEGO wezla z fazora i jego pochodnej.

    `d theta/dt = Im(Vdot conj(V)) / |V|^2` — tozsamosc, nie przyblizenie: dla
    `V = |V| e^{j theta}` zachodzi `Vdot conj(V) = |V| d|V|/dt + j |V|^2 d theta/dt`.

    Niepewnosc i stan jakosci wg polityki z naglowka modulu. `tolerancja_algebry` jest
    granica normy residuum, do ktorej zbiega Newton — uzywamy jej jako oszacowania
    niepewnosci napiecia (zalozenie nazwane wprost, nie ukryte).
    """
    modul = abs(napiecie_pu)
    if modul <= tolerancja_algebry:
        # Fazor lezy wewnatrz kuli niepewnosci numerycznej — jego kat nie niesie informacji.
        # Niepewnosc rowna CALEJ czestotliwosci znamionowej: nawet konsument ignorujacy kod
        # jakosci widzi wtedy, ze liczba nie niesie tresci. Zero bylo by gorsze niz brak —
        # sugerowaloby pomiar dokladny.
        return CzestotliwoscWezla(
            f_hz=f_bazowa_hz, niepewnosc_hz=f_bazowa_hz, jakosc=JAKOSC_NIEDOSTEPNA
        )

    pochodna_kata = (pochodna_napiecia_pu_s * napiecie_pu.conjugate()).imag / (modul * modul)
    f_hz = f_bazowa_hz + pochodna_kata / (2.0 * math.pi)
    niepewnosc_hz = (
        WSPOLCZYNNIK_PROPAGACJI_KATA
        * abs(pochodna_napiecia_pu_s)
        * tolerancja_algebry
        / (2.0 * math.pi * modul * modul)
    )
    odchylka_hz = abs(f_hz - f_bazowa_hz)
    jakosc = JAKOSC_OGRANICZONA if niepewnosc_hz > odchylka_hz else JAKOSC_WIARYGODNA
    return CzestotliwoscWezla(f_hz=f_hz, niepewnosc_hz=niepewnosc_hz, jakosc=jakosc)


def wielkosci_galezi(
    model: ModelSieci, galaz: GalazDynamiki, napiecia: np.ndarray
) -> WielkosciGalezi:
    """Prady i moce OBU zaciskow galezi — model pi z przekladnia zespolona.

    Te same wyrazenia, ktorymi sklada sie Ybus (`siec.zloz_model_sieci`) i ktorymi liczy
    przeplywy tor rozplywu; zgodnosc w chwili zerowej biegu jest bramka odbioru, nie deklaracja.

    GALAZ WYLACZONA nie przewodzi: oba prady i obie moce sa DOKLADNIE zerowe. To jest fakt
    fizyczny, nie ciche zero — kanal pozostaje obecny, a wartosc jest prawdziwa.
    """
    if galaz.ident not in model.galezie_aktywne:
        return WielkosciGalezi(i_od_pu=0j, i_do_pu=0j, s_od_pu=0j, s_do_pu=0j)

    napiecie_od = complex(napiecia[model.indeks_wezla[galaz.wezel_od]])
    napiecie_do = complex(napiecia[model.indeks_wezla[galaz.wezel_do]])
    y_szeregowa = galaz.y_szeregowa_pu
    y_poprzeczna_polowa = complex(0.0, galaz.b_poprzeczna_pu / 2.0)
    a = galaz.przekladnia
    modul_kwadrat = (a * a.conjugate()).real

    i_od = (napiecie_od * (y_szeregowa + y_poprzeczna_polowa)) / modul_kwadrat - (
        napiecie_do * y_szeregowa
    ) / a.conjugate()
    i_do = -(napiecie_od * y_szeregowa) / a + napiecie_do * (y_szeregowa + y_poprzeczna_polowa)
    return WielkosciGalezi(
        i_od_pu=i_od,
        i_do_pu=i_do,
        s_od_pu=napiecie_od * i_od.conjugate(),
        s_do_pu=napiecie_do * i_do.conjugate(),
    )


__all__ = [
    "JAKOSC_NIEDOSTEPNA",
    "JAKOSC_OGRANICZONA",
    "JAKOSC_WIARYGODNA",
    "OPIS_JAKOSCI_PL",
    "WSPOLCZYNNIK_PROPAGACJI_KATA",
    "CzestotliwoscWezla",
    "WielkosciGalezi",
    "czestotliwosc_wezla",
    "pochodna_napiec",
    "wielkosci_galezi",
]
