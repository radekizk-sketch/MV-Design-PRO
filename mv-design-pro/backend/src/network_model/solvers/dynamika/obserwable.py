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

NIEPEWNOSC JEST MIERZONA, NIE ZAKLADANA (korekta W6-A par. 5, 2026-09-18). Wczesniejsza
wersja brala za niepewnosc napiecia SAMA TOLERANCJE Newtona. To zalozenie jest falszywe i
zostalo obalone pomiarem: Newton konczy przy `||r|| <= tol`, ale blad rozwiazania spelnia
`Delta y = J^-1 r`, wiec jest wzmocniony przez `J^-1`. W punkcie pracy blisko nosa krzywej PV
zmierzono wzmocnienie 8,4x, a meldowana niepewnosc byla 2,45 raza MNIEJSZA od rzeczywistego
bledu czestotliwosci — przy kodzie jakosci „wiarygodna". Dlatego obie niepewnosci sa dzis
LICZONE, kazda z wielkosci, ktore solver i tak ma:

* `u_V` — pierwszorzedowy blad napiecia `|J^-1 r|` NA WEZLE (residuum i jakobian z tego
  samego punktu; rozklad LU jest ten sam, ktorym liczymy pochodna, wiec to jeden dodatkowy
  podstawienie w przod i w tyl),
* `u_Vdot` — rzeczywista zmiana pochodnej miedzy punktem obliczonym a skorygowanym
  `y - Delta y`, czyli WLASNY blad pochodnej. Zalozenie „blad wzgledny pochodnej rowna sie
  bledowi wzglednemu napiecia" tez zostalo obalone pomiarem (iloraz 1,83), wiec go nie ma.

Propagacja jest WYPROWADZONA, nie dobrana. Dla `theta_dot = Im(Vdot conj(V))/|V|^2`:

    |d theta_dot / d Vdot| <= 1/|V|            (zaburzenie samej pochodnej)
    |d theta_dot / d V|    <= 3 |Vdot| / |V|^2 (licznik 1x + mianownik 2x, bo
                                                |theta_dot| <= |Vdot|/|V|)

    u_theta_dot <= u_Vdot/|V| + 3 |Vdot| u_V / |V|^2 ,   u_f = u_theta_dot / 2pi .

ZASIEG TEJ POLITYKI — UCZCIWIE. Kryterium jest NUMERYCZNE: orzeka o wiarygodnosci kata
wobec bledu rozwiazania algebry, a NIE o tym, od jak glebokiego zapadu inzynier ma przestac
mowic o czestotliwosci wezla. Ta druga, FIZYCZNA granica wymaga polityki wyprowadzonej i
ZWALIDOWANEJ (fala walidacyjna) i pozostaje jawna luka — nie zastepujemy jej progiem
przyjetym z gory.

DOMENA WAZNOSCI (decyzja wlasciciela OD-36: to NIE jest nastawa uzytkownika). Kat fazora
traci sens, gdy fazor lezy WEWNATRZ WLASNEJ KULI NIEPEWNOSCI, czyli gdy `|V| <= u_V`. To
kryterium jest wyprowadzone z pomiaru, nie z progu napieciowego przyjetego z gory.
Obserwabla wraca jako WARTOSC + NIEPEWNOSC + STAN JAKOSCI; wartosc niedostepna NIE jest
zastepowana czestotliwoscia znamionowa.

ZBIEZNOSC NIE JEST WIARYGODNOSCIA (par. 6). Jesli jakobian algebry jest osobliwy w punkcie
probki albo w punkcie skorygowanym, niepewnosci NIE DA SIE zmierzyc — i wtedy obserwabla
jest NIEDOSTEPNA, a bieg trwa dalej. Zbiezny Newton nie jest dowodem, ze wyprowadzona z
niego czestotliwosc cokolwiek znaczy.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy.sparse import linalg as sparse_linalg

from .kontrakty import (
    KOD_ALGEBRA_NIEZBIEZNA,
    GalazDynamiki,
    OdbiorDynamiki,
    OdmowaDynamiki,
    Urzadzenie,
)
from .siec import ModelSieci, jakobian_algebry, residuum_algebry

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

#: Czulosc pochodnej kata na blad MODULU napiecia — wyprowadzona, nie dobrana:
#: zaburzenie `V` wchodzi raz przez licznik `Im(Vdot conj(V))` i dwa razy przez mianownik
#: `|V|^2`, a `|theta_dot| <= |Vdot|/|V|`, wiec `|d theta_dot / d V| <= 3 |Vdot| / |V|^2`.
#: Czlon od bledu samej pochodnej ma wspolczynnik `1/|V|` i nie potrzebuje stalej.
WSPOLCZYNNIK_CZULOSCI_MODULU = 3.0


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


@dataclass(frozen=True)
class PochodnaZNiepewnoscia:
    """Pochodna napiec wezlowych wraz ze ZMIERZONYMI niepewnosciami obu skladnikow."""

    pochodna_pu_s: np.ndarray
    niepewnosc_napiecia_pu: np.ndarray
    niepewnosc_pochodnej_pu_s: np.ndarray


def _prawa_strona_dae(
    model: ModelSieci,
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> np.ndarray:
    """`(dI/dx) xdot` — wklady urzadzen do prawej strony zroznikowanej algebry.

    Odbiory o stalej mocy nie maja stanow, wiec nie wnosza tu nic — wnosza wylacznie
    do jakobianu po lewej stronie.
    """
    liczba = model.liczba_wezlow
    prawa_strona = np.zeros(2 * liczba, dtype=float)
    for urzadzenie, stan in zip(urzadzenia, stany, strict=True):
        pozycja = model.indeks_wezla[urzadzenie.wezel]
        napiecie = complex(napiecia[pozycja])
        wklad = urzadzenie.jakobian_prad_stan(stan, napiecie) @ urzadzenie.pochodne(stan, napiecie)
        prawa_strona[pozycja] += float(wklad[0])
        prawa_strona[pozycja + liczba] += float(wklad[1])
    return prawa_strona


def _rozloz_jakobian(jakobian: Any, t_s: float | None = None) -> Any:
    """Rozklad LU jakobianu algebry z odmowa NAZWANA zamiast surowego bledu scipy.

    Jakobian osobliwy w chwili probki oznacza, ze pochodna rozwiazania algebraicznego NIE
    ISTNIEJE — zbiezny Newton tego nie wyklucza. Wolajacy rozstrzyga, czy to konczy bieg,
    czy czyni obserwable niedostepnymi; tutaj wraca nazwana odmowa, nie `RuntimeError`.
    """
    try:
        return sparse_linalg.splu(jakobian)
    except RuntimeError as blad:
        raise OdmowaDynamiki(
            KOD_ALGEBRA_NIEZBIEZNA,
            "Jakobian czesci algebraicznej osobliwy przy wyznaczaniu pochodnej napiec"
            + (f" (t={t_s} s)" if t_s is not None else "")
            + f": {blad}",
            t_s=t_s,
        ) from blad


def _zespolone(rozwiazanie: np.ndarray, liczba: int) -> np.ndarray:
    return np.asarray(rozwiazanie[:liczba] + 1j * rozwiazanie[liczba:], dtype=complex)


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
    pomnozonych przez ich pochodne stanu.
    """
    liczba = model.liczba_wezlow
    jakobian = jakobian_algebry(model, odbiory, urzadzenia, stany, napiecia)
    rozklad = _rozloz_jakobian(jakobian)
    return _zespolone(rozklad.solve(_prawa_strona_dae(model, urzadzenia, stany, napiecia)), liczba)


def pochodna_napiec_z_niepewnoscia(
    model: ModelSieci,
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> PochodnaZNiepewnoscia:
    """Pochodna napiec i obie niepewnosci — KAZDA ZMIERZONA, zadna zalozona.

    `u_V` bierze sie z pierwszorzedowego bledu rozwiazania algebry: skoro `g(y_obl) = r`
    i `g(y_scisle) = 0`, to `y_obl - y_scisle = J^-1 r` z dokladnoscia do wyrazow drugiego
    rzedu. Rozklad LU jest TEN SAM, ktorym liczymy pochodna, wiec kosztuje to jedno
    dodatkowe podstawienie, nie druga faktoryzacje.

    `u_Vdot` bierze sie z ponownego wyznaczenia pochodnej w punkcie SKORYGOWANYM
    `y_obl - J^-1 r`. To druga faktoryzacja i jest konieczna: pomiar pokazal, ze blad
    pochodnej NIE jest proporcjonalny do bledu napiecia (jakobian tez jest zlozony w
    punkcie obarczonym bledem), a zalozenie proporcjonalnosci niedoszacowywalo niepewnosc
    1,83 raza w ukladzie blisko granicy obciazalnosci.
    """
    liczba = model.liczba_wezlow
    jakobian = jakobian_algebry(model, odbiory, urzadzenia, stany, napiecia)
    rozklad = _rozloz_jakobian(jakobian)
    pochodna = _zespolone(
        rozklad.solve(_prawa_strona_dae(model, urzadzenia, stany, napiecia)), liczba
    )
    blad_napiecia = _zespolone(
        rozklad.solve(residuum_algebry(model, odbiory, urzadzenia, stany, napiecia)), liczba
    )
    pochodna_skorygowana = pochodna_napiec(
        model, odbiory, urzadzenia, stany, napiecia - blad_napiecia
    )
    return PochodnaZNiepewnoscia(
        pochodna_pu_s=pochodna,
        niepewnosc_napiecia_pu=np.abs(blad_napiecia),
        niepewnosc_pochodnej_pu_s=np.abs(pochodna_skorygowana - pochodna),
    )


def czestotliwosc_niedostepna(f_bazowa_hz: float) -> CzestotliwoscWezla:
    """Obserwabla, ktorej nie da sie wyznaczyc ani ograniczyc — jeden ksztalt na caly modul.

    Niepewnosc rowna CALEJ czestotliwosci znamionowej: nawet konsument ignorujacy kod
    jakosci widzi wtedy, ze liczba nie niesie tresci. Zero byloby gorsze niz brak —
    sugerowaloby pomiar dokladny.
    """
    return CzestotliwoscWezla(
        f_hz=f_bazowa_hz, niepewnosc_hz=f_bazowa_hz, jakosc=JAKOSC_NIEDOSTEPNA
    )


def czestotliwosc_wezla(
    napiecie_pu: complex,
    pochodna_napiecia_pu_s: complex,
    *,
    f_bazowa_hz: float,
    niepewnosc_napiecia_pu: float,
    niepewnosc_pochodnej_pu_s: float,
) -> CzestotliwoscWezla:
    """Czestotliwosc elektryczna JEDNEGO wezla z fazora, jego pochodnej i niepewnosci obu.

    `d theta/dt = Im(Vdot conj(V)) / |V|^2` — tozsamosc, nie przyblizenie: dla
    `V = |V| e^{j theta}` zachodzi `Vdot conj(V) = |V| d|V|/dt + j |V|^2 d theta/dt`.

    Obie niepewnosci sa WEJSCIEM, bo obie sa MIERZONE przez
    `pochodna_napiec_z_niepewnoscia`; ta funkcja niczego nie zaklada o dokladnosci
    rozwiazania algebry. Propagacja wg wyprowadzenia z naglowka modulu:

        u_theta_dot <= u_Vdot/|V| + 3 |Vdot| u_V / |V|^2 .
    """
    modul = abs(napiecie_pu)
    if modul <= niepewnosc_napiecia_pu:
        # Fazor lezy WEWNATRZ wlasnej kuli niepewnosci — jego kat nie niesie informacji.
        return czestotliwosc_niedostepna(f_bazowa_hz)

    pochodna_kata = (pochodna_napiecia_pu_s * napiecie_pu.conjugate()).imag / (modul * modul)
    f_hz = f_bazowa_hz + pochodna_kata / (2.0 * math.pi)
    niepewnosc_hz = (
        niepewnosc_pochodnej_pu_s / modul
        + WSPOLCZYNNIK_CZULOSCI_MODULU
        * abs(pochodna_napiecia_pu_s)
        * niepewnosc_napiecia_pu
        / (modul * modul)
    ) / (2.0 * math.pi)
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
    "WSPOLCZYNNIK_CZULOSCI_MODULU",
    "CzestotliwoscWezla",
    "PochodnaZNiepewnoscia",
    "WielkosciGalezi",
    "czestotliwosc_niedostepna",
    "czestotliwosc_wezla",
    "pochodna_napiec",
    "pochodna_napiec_z_niepewnoscia",
    "wielkosci_galezi",
]
