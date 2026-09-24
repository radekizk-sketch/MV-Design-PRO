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
from .siec import (
    ModelSieci,
    czwornik_galezi,
    jakobian_algebry,
    ograniczenia_napiecia,
    residuum_algebry,
    zwarcia_galezi_modelu,
)

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
#: Niedostepna NUMERYCZNIE: fazor w kuli wlasnej niepewnosci (`|V| <= u_V`), osobliwy
#: jakobian w punkcie probki albo w punkcie skorygowanym.
JAKOSC_NIEDOSTEPNA = 2.0
#: Niedostepna w CHWILI NIECIAGLOSCI zdarzenia (probki `L` i `P`, karta AB-1b.1 par. 0
#: pkt 7): kat skacze, pochodna dwustronna nie istnieje, a jednostronne sa zdominowane
#: podokresowym stanem przejsciowym, ktorego model RMS nie reprezentuje.
JAKOSC_CHWILA_ZDARZENIA = 3.0
#: Niedostepna w wezle BEZ NAPIECIA: obszar beznapieciowy albo napiecie narzucone zerem
#: (zwarcie metaliczne) — fazor zerowy nie ma kata.
JAKOSC_BEZ_NAPIECIA = 4.0

#: Opisy stanow jakosci — jedno zrodlo prawdy dla wyniku i dla prezentacji. Zbior kodow
#: jest ZAMKNIETY (przypiety testem): wartosc niedostepna to `None` z jednym z kodow 2-4,
#: nigdy liczba podstawiona (W6-A par. 4: zakaz zastepowania czestotliwoscia znamionowa).
OPIS_JAKOSCI_PL: dict[float, str] = {
    JAKOSC_ROZROZNIALNA: "odchylka rozroznialna numerycznie",
    JAKOSC_NIEROZROZNIALNA: "odchylka nierozroznialna od bledu numerycznego",
    JAKOSC_NIEDOSTEPNA: "niedostepna — nieokreslona numerycznie",
    JAKOSC_CHWILA_ZDARZENIA: "niedostepna — chwila nieciaglosci zdarzenia",
    JAKOSC_BEZ_NAPIECIA: "niedostepna — wezel bez napiecia",
}

#: Propagacja skonczona NIE ma dobieranej stalej: wspolczynniki `1/(|V| - u_V)` oraz
#: `|Vdot|/(|V| (|V| - u_V))` wychodza wprost z tozsamosci `theta_dot = Im(Vdot/V)` i
#: nierownosci trojkata. Poprzednia stala 3,0 pochodzila z oszacowania ROZNICZKOWEGO, ktore
#: dla zaburzen skonczonych jest falszywe (kontrprzyklad V=1, Vdot=j, dV=-0,9: 9 wobec 2,7).


@dataclass(frozen=True)
class CzestotliwoscWezla:
    """Czestotliwosc elektryczna wezla: wartosc, niepewnosc i stan jakosci.

    `f_hz` i `niepewnosc_hz` sa `None` WTEDY I TYLKO WTEDY, gdy `jakosc` jest jednym z
    kodow niedostepnosci (2, 3, 4) — przypiete testem.
    """

    f_hz: float | None
    niepewnosc_hz: float | None
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

    Wiersz OGRANICZENIA `V_k - E_k(x) = 0` zrozniczkowany po czasie daje
    `Vdot_k = (dE/dx) xdot` — prawa strona tego wiersza to wklad urzadzenia o
    sprzezeniu napieciowym, a dla `E = 0` (obszar beznapieciowy, zwarcie metaliczne)
    zero. Urzadzenie pradowe w wezle ograniczonym nie wnosi nic (jego wiersz KCL nie
    istnieje).
    """
    liczba = model.liczba_wezlow
    prawa_strona = np.zeros(2 * liczba, dtype=float)
    ograniczone = {pozycja for pozycja, _ in ograniczenia_napiecia(model, urzadzenia)}
    for urzadzenie, stan in zip(urzadzenia, stany, strict=True):
        pozycja = model.indeks_wezla[urzadzenie.wezel]
        napiecie = complex(napiecia[pozycja])
        if urzadzenie.sprzezenie == "napieciowe":
            wklad = urzadzenie.jakobian_napiecia_bez_obciazenia(stan) @ urzadzenie.pochodne(
                stan, napiecie
            )
        elif pozycja in ograniczone:
            continue
        else:
            wklad = urzadzenie.jakobian_prad_stan(stan, napiecie) @ urzadzenie.pochodne(
                stan, napiecie
            )
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

    WEZEL O NAPIECIU NARZUCONYM ZEREM (obszar beznapieciowy, zwarcie metaliczne — karta
    AB-1b.1 par. 0 pkt 2-3) jest z tego warunku WYLACZONY: jego napiecie jest zerem
    DOKLADNYM z definicji wiersza ograniczenia, a nie wynikiem Newtona bliskim zera, wiec
    jakobian w punkcie skorygowanym nie ma tam osobliwosci odbioru (odbiory takiego wezla
    nie wchodza do rownan). Sam wezel dostaje czestotliwosc NIEDOSTEPNA z
    `czestotliwosc_wezla` (`|V| = 0 <= u_V`), a wezly zywe nie sa zatruwane.
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

    badane = np.ones(liczba, dtype=bool)
    badane[list(model.pozycje_zerowe)] = False
    punkt_skorygowany_obliczalny = bool(
        np.all(np.abs(napiecia[badane]) > niepewnosc_napiecia[badane])
        and np.all(np.isfinite(niepewnosc_napiecia))
        and np.all(np.isfinite(napiecia_skorygowane.real))
        and np.all(np.isfinite(napiecia_skorygowane.imag))
        and np.all(np.abs(napiecia_skorygowane[badane]) > 0.0)
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


def czestotliwosc_niedostepna(jakosc: float) -> CzestotliwoscWezla:
    """Obserwabla, ktorej nie da sie wyznaczyc ani ograniczyc — `None` z kodem przyczyny.

    KOREKTA (karta AB-1b.1 par. 0 pkt 7). Dawna wersja podstawiala czestotliwosc
    ZNAMIONOWA jako wartosc i jako niepewnosc — konsument ignorujacy kod jakosci
    dostawal dokladnie 50,0 Hz, czyli liczbe wygladajaca na pomiar. W6-A par. 4 zakazuje
    tego wprost: wartosc niedostepna jest BRAKIEM (`None`), a przyczyne niesie kod.
    """
    if jakosc not in (JAKOSC_NIEDOSTEPNA, JAKOSC_CHWILA_ZDARZENIA, JAKOSC_BEZ_NAPIECIA):
        raise AssertionError(f"Kod {jakosc!r} nie jest kodem niedostepnosci czestotliwosci")
    return CzestotliwoscWezla(f_hz=None, niepewnosc_hz=None, jakosc=jakosc)


def rozdzielczosc_porownania_hz(f_bazowa_hz: float, f_hz: float, niepewnosc_hz: float) -> float:
    """Najmniejsza roznica `|f - f_n| - u_f`, ktora w tej arytmetyce cokolwiek znaczy.

    PO CO TO ISTNIEJE. Kontrakt mowi `ROZROZNIALNA <=> |f - f_n| > u_f`. Postawione
    wprost na liczbach zmiennoprzecinkowych to porownanie ROZSTRZYGA O ETYKIECIE NA
    OSTATNIM BICIE: dwa biegi rozniace sie jednym ULP w `u_f` dostawalyby rozne kody
    jakosci tej samej wielkosci fizycznej. Etykieta ma mowic o odchylce, nie o
    zaokragleniu.

    WYPROWADZENIE (nie dobrana stala). `|f - f_n|` powstaje przez ODEJMOWANIE dwoch
    liczb rzedu `f_n`, wiec traci cyfry znaczace: jego blad bezwzgledny jest rzedu
    `ulp(f_n)` (dla `f_n = 50 Hz` to 7,105e-15 Hz) NIEZALEZNIE od tego, jak mala jest
    sama odchylka. Gdy `f` odjedzie daleko od `f_n`, dominuje `ulp(f)`. Druga strona
    porownania wnosi wlasna ziarnistosc reprezentacji `ulp(u_f)`. Rozdzielczosc calego
    porownania jest wiec najwieksza z tych trzech — i tyle, ile jej jest, tyle wynosi
    prog. Zadnej stalej w rodzaju 1e-6 Hz tu nie ma i byc nie moze: wzielaby sie znikad
    i zaczelaby decydowac o tresci inzynierskiej.

    KIERUNEK ZAOKRAGLENIA JEST ROZSTRZYGNIETY NA KORZYSC OSTROZNOSCI. Roznica mieszczaca
    sie w rozdzielczosci daje NIEROZROZNIALNA — bo skoro arytmetyka nie umie rozstrzygnac,
    czy odchylka przewyzsza wlasny blad, to twierdzenie, ze przewyzsza, byloby
    deklaracja bez pokrycia.
    """
    return max(math.ulp(f_bazowa_hz), math.ulp(f_hz), math.ulp(niepewnosc_hz))


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
        return czestotliwosc_niedostepna(JAKOSC_NIEDOSTEPNA)
    if modul * modul == 0.0:
        # |V|^2 nie jest reprezentowalny (|V| < ~1,5e-162 pu): mianownik tozsamosci
        # znika w arytmetyce, a nie w fizyce. To nie jest prog, tylko granica
        # reprezentacji — kat takiego fazora nie niesie informacji (pomiar: odcinek za
        # zwarciem metalicznym w linii dawal |V| ~ 1e-170 i `ZeroDivisionError`).
        return czestotliwosc_niedostepna(JAKOSC_NIEDOSTEPNA)

    pochodna_kata = (pochodna_napiecia_pu_s * napiecie_pu.conjugate()).imag / (modul * modul)
    f_hz = f_bazowa_hz + pochodna_kata / (2.0 * math.pi)
    zapas_modulu = modul - niepewnosc_napiecia_pu
    niepewnosc_hz = (
        niepewnosc_pochodnej_pu_s / zapas_modulu
        + abs(pochodna_napiecia_pu_s) * niepewnosc_napiecia_pu / (modul * zapas_modulu)
    ) / (2.0 * math.pi)
    if not math.isfinite(niepewnosc_hz) or not math.isfinite(f_hz):
        return czestotliwosc_niedostepna(JAKOSC_NIEDOSTEPNA)
    odchylka_hz = abs(f_hz - f_bazowa_hz)
    jakosc = (
        JAKOSC_ROZROZNIALNA
        if odchylka_hz - niepewnosc_hz
        > rozdzielczosc_porownania_hz(f_bazowa_hz, f_hz, niepewnosc_hz)
        else JAKOSC_NIEROZROZNIALNA
    )
    return CzestotliwoscWezla(f_hz=f_hz, niepewnosc_hz=niepewnosc_hz, jakosc=jakosc)


def wielkosci_galezi(
    model: ModelSieci, galaz: GalazDynamiki, napiecia: np.ndarray
) -> WielkosciGalezi:
    """Prady i moce OBU zaciskow galezi — model pi z przekladnia zespolona.

    Te same wyrazenia, ktorymi sklada sie Ybus (`siec.zloz_model_sieci`) i ktorymi liczy
    przeplywy tor rozplywu; zgodnosc w chwili zerowej biegu jest bramka odbioru, nie deklaracja.

    GALAZ WYLACZONA nie przewodzi: oba prady i obie moce sa DOKLADNIE zerowe. To jest fakt
    fizyczny, nie ciche zero — kanal pozostaje obecny, a wartosc jest prawdziwa.

    GALAZ ZE ZWARCIEM w miejscu x*L (karta AB-1b.1 par. 0 pkt 5): prady zaciskow z TEGO
    SAMEGO stempla czwornika, ktorym galaz wchodzi do Ybus (`siec.czwornik_galezi`) —
    wzor pi zdrowej galezi przestaje wtedy opisywac galaz.
    """
    if galaz.ident not in model.galezie_aktywne:
        return WielkosciGalezi(i_od_pu=0j, i_do_pu=0j, s_od_pu=0j, s_do_pu=0j)

    napiecie_od = complex(napiecia[model.indeks_wezla[galaz.wezel_od]])
    napiecie_do = complex(napiecia[model.indeks_wezla[galaz.wezel_do]])
    zwarcia = zwarcia_galezi_modelu(model, galaz.ident)
    if zwarcia:
        y_oo, y_od, y_do, y_dd = czwornik_galezi(
            galaz.y_szeregowa_pu, galaz.b_poprzeczna_pu, zwarcia
        )
        i_od_zwarcie = y_oo * napiecie_od + y_od * napiecie_do
        i_do_zwarcie = y_do * napiecie_od + y_dd * napiecie_do
        return WielkosciGalezi(
            i_od_pu=i_od_zwarcie,
            i_do_pu=i_do_zwarcie,
            s_od_pu=napiecie_od * i_od_zwarcie.conjugate(),
            s_do_pu=napiecie_do * i_do_zwarcie.conjugate(),
        )
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
    "JAKOSC_BEZ_NAPIECIA",
    "JAKOSC_CHWILA_ZDARZENIA",
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
