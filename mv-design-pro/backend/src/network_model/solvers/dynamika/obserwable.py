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
wersja brala za niepewnosc napiecia SAMA TOLERANCJE Newtona. To zalozenie jest falszywe:
Newton konczy przy `||r|| <= tol`, ale blad rozwiazania spelnia `Delta y = J^-1 r`, wiec
jest wzmocniony przez `J^-1` (zmierzone wzmocnienie 8,4x blisko granicy obciazalnosci).

ESTYMATA, NIE CERTYFIKAT (korekta W6-A par. 2, runda niezaleznej kwalifikacji 2026-09-18).
Nazywanie `J^-1 r` GRANICA bledu jest nieuprawnione i zostalo obalone. Z rozwiniecia Taylora
wokol punktu obliczonego `y`:

    0 = g(y*) = g(y) + J(y)(y* - y) + R_2  =>  y - y* = J^-1 r + J^-1 R_2 ,

gdzie `R_2` jest reszta drugiego rzedu. Dla odbioru o stalej mocy `I ~ 1/conj(V)`, wiec
jakobian jest lipschitzowski jedynie LOKALNIE, ze stala rosnaca jak `1/|V|^3`; czlon
`J^-1 R_2` nie znika i blisko granicy obciazalnosci potrafi przewazyc. Pomiar wobec
wyroczni ANALITYCZNEJ liczonej w 60 cyfrach pokazuje `|y - y*| / |J^-1 r|` powyzej jedynki.
Dlatego:

    u_V, u_Vdot, u_f  SA ESTYMATAMI BLEDU PIERWSZEGO RZEDU (a posteriori),
    NIE SA certyfikowanymi ograniczeniami gornymi.

Nazwy kanalu (`u_f_est_hz`) i stanow jakosci mowia dokladnie to i nic wiecej.

PROPAGACJA JEST SKONCZONA, NIE ROZNICZKOWA. Poprzednia formula
`u_Vdot/|V| + 3 |Vdot| u_V/|V|^2` jest poprawna tylko w granicy `u_V -> 0` i PADA przy
zaburzeniu skonczonym: dla `V = 1`, `Vdot = j`, `dV = -0,9` rzeczywista zmiana wynosi 9,
a formula daje 2,7. Poniewaz `theta_dot = Im(Vdot/V)` (tozsamosc), zachodzi DOKLADNIE

    Vdot*/V* - Vdot/V = (dVdot * V - Vdot * dV) / (V (V + dV)) ,

skad przy `|dV| <= u_V < |V|` oraz `|dVdot| <= u_Vdot` (nierownosc trojkata i
`|V + dV| >= |V| - u_V`) wynika nierownosc SKONCZONA, ciasna i osiagana:

    |d theta_dot| <= u_Vdot/(|V| - u_V) + |Vdot| u_V / (|V| (|V| - u_V)) ,
    u_f = |d theta_dot| / 2pi .

Ta nierownosc jest DOWIEDZIONA — ale warunkowo: obowiazuje POD ZALOZENIEM `|dV| <= u_V`,
a samo `u_V` jest estymata. Kontrakt niesie wiec: rygorystyczna propagacje estymaty, nie
rygorystyczna granice bledu.

CZEGO `u_f_est_hz` NIE OBEJMUJE — nazwane wprost:
* bledu CALKOWANIA w czasie (stany `x` traktowane jako dokladne w chwili probki),
* bledu modelu i parametrow,
* bledu reprezentacji fazorowej wobec przebiegu chwilowego,
* jakiejkolwiek oceny SENSU FIZYCZNEGO pojecia „czestotliwosc szyny".

ZASIEG POLITYKI JAKOSCI — UCZCIWIE. Predykat stanu jest NUMERYCZNY i brzmi doslownie:
„odchylka od czestotliwosci znamionowej jest wieksza od oszacowanego bledu numerycznego",
czyli odchylka jest ROZROZNIALNA na tle szumu numerycznego. Nie orzeka, ze wartosc jest
wiarygodna inzyniersko ani ze ma sens fizyczny — stad nazwy stanow po korekcie.

DOMENA WAZNOSCI (decyzja wlasciciela OD-36: to NIE jest nastawa uzytkownika). Kat fazora
traci sens, gdy fazor lezy WEWNATRZ WLASNEJ KULI NIEPEWNOSCI, czyli gdy `|V| <= u_V` — to
jest dokladnie warunek, przy ktorym mianownik nierownosci skonczonej przestaje byc dodatni.
Kryterium jest wyprowadzone z pomiaru, nie z progu napieciowego przyjetego z gory.

ZBIEZNOSC NIE JEST WIARYGODNOSCIA (par. 6). Jesli jakobian algebry jest osobliwy, albo
punkt skorygowany lezy tam, gdzie model odbioru o stalej mocy przestaje byc obliczalny,
niepewnosci NIE DA SIE zmierzyc — i wtedy obserwabla jest NIEDOSTEPNA, a bieg trwa dalej.
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
#:
#: NAZWY MOWIA, CO PREDYKAT SPRAWDZA. Poprzednie `WIARYGODNA` sugerowalo werdykt
#: inzynierski, a sprawdzane jest wylacznie to, czy odchylka od czestotliwosci znamionowej
#: przewyzsza OSZACOWANY blad numeryczny. Bieg scenariusza odniesienia publikowal z kodem
#: „wiarygodna" wartosc -17,15 Hz na szynie w glebokim zapadzie — liczbe poprawna dla modelu
#: fazorowego, ale nie bedaca „czestotliwoscia szyny" w sensie inzynierskim.
JAKOSC_ROZROZNIALNA = 0.0
JAKOSC_NIEROZROZNIALNA = 1.0
JAKOSC_NIEDOSTEPNA = 2.0

#: Opisy stanow jakosci — jedno zrodlo prawdy dla wyniku i dla prezentacji.
OPIS_JAKOSCI_PL: dict[float, str] = {
    JAKOSC_ROZROZNIALNA: "odchylka rozroznialna numerycznie",
    JAKOSC_NIEROZROZNIALNA: "odchylka nierozroznialna od bledu numerycznego",
    JAKOSC_NIEDOSTEPNA: "niedostepna",
}

#: Propagacja skonczona NIE ma dobieranej stalej: wspolczynniki `1/(|V| - u_V)` oraz
#: `|Vdot|/(|V| (|V| - u_V))` wychodza wprost z tozsamosci `theta_dot = Im(Vdot/V)` i
#: nierownosci trojkata. Poprzednia stala 3,0 pochodzila z oszacowania ROZNICZKOWEGO, ktore
#: dla zaburzen skonczonych jest falszywe (kontrprzyklad V=1, Vdot=j, dV=-0,9: 9 wobec 2,7).


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
    """Pochodna napiec i obie ESTYMATY bledu — kazda mierzona, zadna zalozona.

    `u_V` to pierwszorzedowa poprawka Newtona `|J^-1 r|` na wezle. Rozklad LU jest TEN SAM,
    ktorym liczymy pochodna, wiec kosztuje to jedno dodatkowe podstawienie.

    `u_Vdot` to zmiana pochodnej miedzy punktem obliczonym a skorygowanym `y - J^-1 r`.
    Druga faktoryzacja jest konieczna: pomiar obalil zalozenie, ze blad pochodnej jest
    proporcjonalny do bledu napiecia.

    KOLEJNOSC JEST CZESCIA KONTRAKTU (korekta par. 7 rundy kwalifikacyjnej). Punkt
    skorygowany liczymy DOPIERO po sprawdzeniu, czy w ogole wolno go dotknac. Gdy
    ktorykolwiek wezel spelnia `|V| <= u_V`, punkt skorygowany lezy na zerze fazora albo za
    nim, a odbior o stalej mocy ma tam `1/|V|^2` i `1/|V|^4` — jakobian w takim punkcie jest
    smieciem, ktory zanieczyscilby `u_Vdot` WSZYSTKICH wezlow (faktoryzacja jest wspolna).
    Wtedy niepewnosci pochodnej sa NIESKONCZONE, co przez nierownosc propagacji czyni kazdy
    wezel NIEDOSTEPNYM — bez zadnego progu i bez podstawionej liczby.
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
    niepewnosc_napiecia = np.abs(blad_napiecia)
    napiecia_skorygowane = napiecia - blad_napiecia

    punkt_skorygowany_obliczalny = bool(
        np.all(np.abs(napiecia) > niepewnosc_napiecia)
        and np.all(np.isfinite(niepewnosc_napiecia))
        and np.all(np.isfinite(napiecia_skorygowane.real))
        and np.all(np.isfinite(napiecia_skorygowane.imag))
        and np.all(np.abs(napiecia_skorygowane) > 0.0)
    )
    if not punkt_skorygowany_obliczalny:
        return PochodnaZNiepewnoscia(
            pochodna_pu_s=pochodna,
            niepewnosc_napiecia_pu=niepewnosc_napiecia,
            niepewnosc_pochodnej_pu_s=np.full(liczba, np.inf, dtype=float),
        )

    try:
        pochodna_skorygowana = pochodna_napiec(
            model, odbiory, urzadzenia, stany, napiecia_skorygowane
        )
    except OdmowaDynamiki:
        return PochodnaZNiepewnoscia(
            pochodna_pu_s=pochodna,
            niepewnosc_napiecia_pu=niepewnosc_napiecia,
            niepewnosc_pochodnej_pu_s=np.full(liczba, np.inf, dtype=float),
        )

    niepewnosc_pochodnej = np.abs(pochodna_skorygowana - pochodna)
    if not bool(np.all(np.isfinite(niepewnosc_pochodnej))):
        niepewnosc_pochodnej = np.full(liczba, np.inf, dtype=float)
    return PochodnaZNiepewnoscia(
        pochodna_pu_s=pochodna,
        niepewnosc_napiecia_pu=niepewnosc_napiecia,
        niepewnosc_pochodnej_pu_s=niepewnosc_pochodnej,
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
    """Czestotliwosc elektryczna JEDNEGO wezla z fazora, jego pochodnej i estymat bledu obu.

    WARTOSC jest TOZSAMOSCIA: `d theta/dt = Im(Vdot conj(V))/|V|^2 = Im(Vdot/V)`, bo dla
    `V = |V| e^{j theta}` zachodzi `Vdot conj(V) = |V| d|V|/dt + j |V|^2 d theta/dt`.

    NIEPEWNOSC jest ESTYMATA propagowana nierownoscia SKONCZONA (wyprowadzenie w naglowku
    modulu), a nie oszacowaniem rozniczkowym:

        u_theta_dot <= u_Vdot/(|V| - u_V) + |Vdot| u_V / (|V| (|V| - u_V)) ,   u_V < |V| .

    Nierownosc jest ciasna — osiagana dla `dV` antyrownoleglego do `V` — wiec nie zawiera
    zadnego dobranego zapasu. Obowiazuje POD ZALOZENIEM `|dV| <= u_V` i `|dVdot| <= u_Vdot`;
    samo `u_V` jest estymata pierwszego rzedu, wiec wynik NIE jest certyfikowana granica.
    """
    modul = abs(napiecie_pu)
    if not math.isfinite(niepewnosc_napiecia_pu) or modul <= niepewnosc_napiecia_pu:
        # Fazor lezy WEWNATRZ wlasnej kuli niepewnosci — jego kat nie niesie informacji, a
        # mianownik nierownosci propagacji przestaje byc dodatni.
        return czestotliwosc_niedostepna(f_bazowa_hz)

    pochodna_kata = (pochodna_napiecia_pu_s * napiecie_pu.conjugate()).imag / (modul * modul)
    f_hz = f_bazowa_hz + pochodna_kata / (2.0 * math.pi)
    zapas_modulu = modul - niepewnosc_napiecia_pu
    niepewnosc_hz = (
        niepewnosc_pochodnej_pu_s / zapas_modulu
        + abs(pochodna_napiecia_pu_s) * niepewnosc_napiecia_pu / (modul * zapas_modulu)
    ) / (2.0 * math.pi)
    if not math.isfinite(niepewnosc_hz) or not math.isfinite(f_hz):
        return czestotliwosc_niedostepna(f_bazowa_hz)
    odchylka_hz = abs(f_hz - f_bazowa_hz)
    jakosc = JAKOSC_NIEROZROZNIALNA if niepewnosc_hz > odchylka_hz else JAKOSC_ROZROZNIALNA
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
    "JAKOSC_NIEROZROZNIALNA",
    "JAKOSC_ROZROZNIALNA",
    "OPIS_JAKOSCI_PL",
    "CzestotliwoscWezla",
    "PochodnaZNiepewnoscia",
    "WielkosciGalezi",
    "czestotliwosc_niedostepna",
    "czestotliwosc_wezla",
    "pochodna_napiec",
    "pochodna_napiec_z_niepewnoscia",
    "wielkosci_galezi",
]
