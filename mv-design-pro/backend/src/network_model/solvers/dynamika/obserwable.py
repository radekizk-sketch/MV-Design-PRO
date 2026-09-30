"""Obserwable inzynierskie `z(t)` — czestotliwosc wezlow i wielkosci zaciskow galezi (W6-A).

TRZY ROZLACZNE PRZESTRZENIE (zamrozenie W6-A par. 2).

* `x(t)` — stany rozniczkowe urzadzen; kazdy ma swoje rownanie ruchu,
* `y(t)` — zmienne algebraiczne sieci: zespolone napiecia wezlowe, rozwiazanie `g(x,y)=0`,
* `z(t)` — TEN modul: wielkosci WYPROWADZONE z `x` i `y` jawnym wzorem, z jednostka,
  orientacja i domena waznosci.

Obserwabla NIGDY nie zostaje stanem. Dodanie czestotliwosci jako stanu rozniczkowego, zeby
„miec pochodna za darmo", wprowadziloby do macierzy stanu dodatkowa wartosc wlasna, ktorej
uklad fizycznie nie ma — i zaklamalo analize malosygnalowa. Estymator czestotliwosci
ODBIORU (`odbiory.py`) nie jest ta obserwabla: to stan MODELU odbioru (odbiorniki reaguja
na czestotliwosc z inercja `T_f`), z wlasna, fizyczna wartoscia wlasna `-1/T_f`; `f_hz@`
szyny zostaje obserwabla liczona z tego rozniczkowania, a stan estymatora wchodzi do jej
prawej strony jak kazdy stan (`_prawa_strona_dae`).

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

RESIDUUM NA GRANICY WLASNEGO BLEDU ZAOKRAGLEN (korekta 2026-09-29, karta
DETERMINIZM-KATA-FAZORA). Newton moze zakonczyc sie residuum, ktore jest juz tylko szumem
formowania `Y V - I` (np. gdy punkt startowy kroku lezy w tolerancji i iteracja w ogole sie
nie wykonuje). `J^-1 r` jest wtedy realizacja szumu, a nie estymata bledu: w tej samej
probce sceny harnessu dawalo 16x rozne `u_f` zaleznie od liczby watkow BLAS i przelaczalo
kod jakosci. Residuum rozklada sie na czesc PEWNIE obecna ponad granica
`rho = gamma_m (|Y||V| + sum|I|)` (`siec.granica_zaokraglen_residuum`),
`psi(r) = sign(r) max(|r| - rho, 0)`, i reszte mieszczaca sie w `rho`; estymata bledu
rozwiazania to `|J^-1 psi(r)| + |J^-1 rho|` (Higham 2002, par. 7.2; korekta 2026-09-30,
karta PRZENOSNOSC-NIEPEWNOSCI — dawne rozgalezienie `J^-1 r` / `J^-1 rho` bylo nieciagle
na progu i tuz nad nim schodzilo ponizej dna zaokraglen). Na dnie (`psi = 0`) estymata jest
wektorem deterministycznym `|J^-1 rho|`.

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
    ModelOdbioru,
    OdmowaDynamiki,
    Urzadzenie,
    rozdziel_stany,
)
from .siec import (
    JEDNOSTKA_ZAOKRAGLENIA,
    ModelSieci,
    czesc_pewna_residuum,
    czwornik_galezi,
    granica_zaokraglen_residuum,
    jakobian_algebry,
    ograniczenia_napiecia,
    prad_wezla_ograniczonego,
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
    JAKOSC_ROZROZNIALNA: "odchyłka rozróżnialna numerycznie",
    JAKOSC_NIEROZROZNIALNA: "odchyłka nierozróżnialna od błędu numerycznego",
    JAKOSC_NIEDOSTEPNA: "niedostępna — nieokreślona numerycznie",
    JAKOSC_CHWILA_ZDARZENIA: "niedostępna — chwila nieciągłości zdarzenia",
    JAKOSC_BEZ_NAPIECIA: "niedostępna — węzeł bez napięcia",
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
    odbiory: tuple[ModelOdbioru, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> np.ndarray:
    """`(dI/dx) xdot` — wklady ELEMENTOW STANOWYCH do prawej strony zroznikowanej algebry.

    Odbior czuly czestotliwosciowo ma stan (estymator czestotliwosci widzianej), od ktorego
    zalezy jego prad — wnosi wiec `(dI_odb/dx) xdot` tak samo jak urzadzenie; bez tego
    czlonu `f_hz@` szyny z takim odbiorem bylaby liczona z niepelnej pochodnej napiec.
    Odbior bez stanow nie wnosi tu nic (jego wklad jest wylacznie w jakobianie po lewej).

    Wiersz OGRANICZENIA `V_k - E_k(x) = 0` zrozniczkowany po czasie daje
    `Vdot_k = (dE/dx) xdot` — prawa strona tego wiersza to wklad urzadzenia o
    sprzezeniu napieciowym, a dla `E = 0` (obszar beznapieciowy, zwarcie metaliczne)
    zero. Element pradowy w wezle ograniczonym nie wnosi nic (jego wiersz KCL nie
    istnieje), odbior bez obwodu tez nie (prad zero).
    """
    liczba = model.liczba_wezlow
    prawa_strona = np.zeros(2 * liczba, dtype=float)
    ograniczone = {pozycja for pozycja, _ in ograniczenia_napiecia(model, urzadzenia)}
    stany_odbiorow, stany_urzadzen = rozdziel_stany(odbiory, urzadzenia, stany)
    for odbior, stan_odbioru in zip(odbiory, stany_odbiorow, strict=True):
        if not odbior.nazwy_stanow or not odbior.przylaczony:
            continue
        pozycja = model.indeks_wezla[odbior.wezel]
        if pozycja in ograniczone:
            continue
        napiecie = complex(napiecia[pozycja])
        wklad = odbior.jakobian_prad_stan(stan_odbioru, napiecie) @ odbior.pochodne(
            stan_odbioru, napiecie
        )
        prawa_strona[pozycja] += float(wklad[0])
        prawa_strona[pozycja + liczba] += float(wklad[1])
    for urzadzenie, stan in zip(urzadzenia, stany_urzadzen, strict=True):
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
            "Jakobian części algebraicznej osobliwy przy wyznaczaniu pochodnej napięć"
            + (f" (t = {t_s} s)" if t_s is not None else "")
            + f": {blad}",
            t_s=t_s,
        ) from blad


def _zespolone(rozwiazanie: np.ndarray, liczba: int) -> np.ndarray:
    return np.asarray(rozwiazanie[:liczba] + 1j * rozwiazanie[liczba:], dtype=complex)


def pochodna_napiec(
    model: ModelSieci,
    odbiory: tuple[ModelOdbioru, ...],
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
    return _zespolone(
        rozklad.solve(_prawa_strona_dae(model, odbiory, urzadzenia, stany, napiecia)), liczba
    )


#: Najmniejsze WZGLEDNE przesuniecie punktu, przy ktorym roznica skonczona pochodnej napiec
#: niesie zmiane pochodnej, a nie szum jej obliczenia: `sqrt(u)`, `u` — jednostka zaokraglenia
#: (krok optymalny roznicy w przod dla funkcji liczonej z dokladnoscia wzgledna `u`: blad
#: obciecia ~ krok, blad zaokraglen ~ u / krok; Nocedal i Wright, Numerical Optimization,
#: 2 wyd., par. 8.1, wzor (8.6); Gill, Murray i Wright, Practical Optimization, par. 8.6).
#: To nie jest dobrana stala: wynika z tej samej arytmetyki, co `JEDNOSTKA_ZAOKRAGLENIA`.
KROK_WZGLEDNY_POCHODNEJ = math.sqrt(JEDNOSTKA_ZAOKRAGLENIA)


def skala_kroku_pochodnej(
    napiecia: np.ndarray, niepewnosc_napiecia: np.ndarray, badane: np.ndarray
) -> float:
    """Mnoznik `s >= 1` kroku roznicy skonczonej `Vdot(y - s d) - Vdot(y)`.

    `d` to JEDEN skladnik estymaty bledu rozwiazania — `J^-1 psi(r)` albo `J^-1 rho`
    (`pochodna_napiec_z_niepewnoscia`); mnoznik liczony jest dla kazdego skladnika osobno.

    DEFEKT, KTORY TO USUWA (pomiar 2026-09-30, scena dynamiki harnessu, 12 wariantow jadra
    OpenBLAS x liczba watkow). Na dnie zaokraglen estymata bledu `d = J^-1 rho` ma wzgledny
    rozmiar rzedu 1e-10, a roznica `Vdot(y - d) - Vdot(y)` jest wtedy w czesci realizacja
    szumu obliczenia OBU pochodnych — `u_Vdot` roznilo sie miedzy wariantami do 2,3e-5
    wzglednie przy `u_V` zgodnym do 1e-11. Estymata niepewnosci nie moze zalezec od tego,
    jak jadro BLAS zsumowalo iloczyny.

    REGULA. Gdy najwieksze wzgledne przesuniecie wezla zywego `max |d_k| / |V_k|` jest
    MNIEJSZE od `KROK_WZGLEDNY_POCHODNEJ`, krok wzdluz TEGO SAMEGO kierunku `-d` jest
    powiekszony do `KROK_WZGLEDNY_POCHODNEJ` (w najbardziej przesunietym wezle), a roznica
    przeskalowana z powrotem przez `s`. Na tej skali pochodna jest liniowa w przesunieciu
    (czlon drugiego rzedu ~ `s |d|` wzglednie, czyli ~1e-8), wiec wynik jest ta sama
    pierwszorzedowa zmiana pochodnej, tylko ponad szumem. Przesuniecie wieksze od
    `KROK_WZGLEDNY_POCHODNEJ` NIE jest zmniejszane: tam roznica skonczona celowo niesie
    nieliniowosc (blisko granicy obciazalnosci pochodna nie jest liniowa na skali
    tolerancji Newtona) i idzie bitowo dawna droga (`s = 1`).

    DOMENA. Kazdy wezel zywy przesuwa sie wzglednie o co najwyzej
    `KROK_WZGLEDNY_POCHODNEJ`, wiec `|V_k - s d_k| >= |V_k| (1 - sqrt(u)) > 0` — punkt
    przesuniety nie przekracza zera fazora. Estymata nieskonczona albo nieokreslona daje
    `s = 1` (o niedostepnosci rozstrzyga wtedy kontrola domeny wolajacego).
    """
    zywe = badane & (np.abs(napiecia) > 0.0)
    if not bool(np.any(zywe)):
        return 1.0
    przesuniecie_wzgledne = float(np.max(niepewnosc_napiecia[zywe] / np.abs(napiecia[zywe])))
    if 0.0 < przesuniecie_wzgledne < KROK_WZGLEDNY_POCHODNEJ:
        return KROK_WZGLEDNY_POCHODNEJ / przesuniecie_wzgledne
    return 1.0


def _zmiana_pochodnej(
    model: ModelSieci,
    odbiory: tuple[ModelOdbioru, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
    pochodna: np.ndarray,
    blad_napiecia: np.ndarray,
    badane: np.ndarray,
) -> np.ndarray | None:
    """Pierwszorzedowa zmiana pochodnej napiec przy przesunieciu punktu o `-blad_napiecia`.

    `|Vdot(y - s d) - Vdot(y)| / s` z mnoznikiem `s` z `skala_kroku_pochodnej` (jedno
    zrodlo). Kierunek `y - d` jest krokiem W STRONE rozwiazania (przypina to
    `test_obserwable.py::test_a01_znak_korekty_newtona_jest_przypiety_w_zrodle`). `None`,
    gdy punktu przesunietego nie da sie obliczyc (wspolrzedna nieskonczona, wezel zywy na
    zerze fazora, odmowa rozkladu, zmiana nieskonczona) — wolajacy czyni wtedy KAZDA
    niepewnosc pochodnej nieskonczona, bo faktoryzacja jest wspolna dla wszystkich wezlow.
    """
    skala_kroku = skala_kroku_pochodnej(napiecia, np.abs(blad_napiecia), badane)
    napiecia_skorygowane = napiecia - skala_kroku * blad_napiecia
    if not bool(
        np.all(np.isfinite(napiecia_skorygowane.real))
        and np.all(np.isfinite(napiecia_skorygowane.imag))
        and np.all(np.abs(napiecia_skorygowane[badane]) > 0.0)
    ):
        return None
    try:
        pochodna_skorygowana = pochodna_napiec(
            model, odbiory, urzadzenia, stany, napiecia_skorygowane
        )
    except OdmowaDynamiki:
        return None
    zmiana = np.abs(pochodna_skorygowana - pochodna) / skala_kroku
    return zmiana if bool(np.all(np.isfinite(zmiana))) else None


def pochodna_napiec_z_niepewnoscia(
    model: ModelSieci,
    odbiory: tuple[ModelOdbioru, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> PochodnaZNiepewnoscia:
    """Pochodna napiec i obie ESTYMATY bledu — kazda mierzona, zadna zalozona.

    `u_V` to pierwszorzedowa poprawka Newtona na wezle. Rozklad LU jest TEN SAM, ktorym
    liczymy pochodna, wiec kazdy skladnik estymaty kosztuje jedno podstawienie.

    RESIDUUM ROZLOZONE NA CZESC PEWNA I DNO ZAOKRAGLEN (korekta 2026-09-30, karta
    PRZENOSNOSC-NIEPEWNOSCI; zastepuje rozgalezienie „residuum znaczace / na granicy" z karty
    DETERMINIZM-KATA-FAZORA). Obliczone residuum `r` rozni sie od prawdziwego o co najwyzej
    `rho` (`siec.granica_zaokraglen_residuum`), wiec rozklada sie na czesc PEWNIE obecna
    `psi(r) = sign(r) max(|r| - rho, 0)` (`siec.czesc_pewna_residuum`) i reszte, o ktorej
    wiadomo tylko, ze miesci sie w `rho` (Higham 2002, par. 7.2: blad rozwiazania z residuum
    obarczonym bledem zaokraglen). Estymata bledu rozwiazania jest suma modulow OBU
    propagacji:

        u_V = |J^-1 psi(r)| + |J^-1 rho| .

    DLACZEGO NIE ROZGALEZIENIE. Dawna regula brala `J^-1 r`, gdy choc jedna skladowa `r`
    wychodzila poza `rho`, a `J^-1 rho` w przeciwnym razie. Estymata byla wtedy NIECIAGLA
    na progu, a tuz nad nim potrafila lezec GLEBOKO pod dnem, ktore arytmetyka w ogole umie
    rozstrzygnac: pomiar SO-1a (probka 372, 2026-09-30) dal `u_f` 4,6e-15 Hz z galezi
    znaczacej wobec 1,1e-10 Hz propagacji granicy — skladowa ledwie nad progiem, reszta
    residuum szumem, `J^-1 r` przypadkowo male. Ktora galaz wykonala sie w danej probce,
    zalezalo od jadra BLAS, wiec kod jakosci czestotliwosci byl nieprzenosny. Suma jest
    ciagla w `r` (`psi` jest 1-lipschitzowska), NIGDY nie schodzi ponizej `|J^-1 rho|`
    (przypina `test_niepewnosc_na_granicy_zaokraglen.py::test_estymata_tuz_nad_progiem_
    czesci_pewnej_nie_spada_pod_dno`), a na dnie zaokraglen (`psi = 0`) jest dokladnie
    propagacja granicy — skladnik czesci pewnej jest zerem i nie jest liczony (przypina
    `test_estymata_przy_residuum_szumu_jest_propagacja_granicy`).

    `u_Vdot` to suma zmian pochodnej przy przesunieciu punktu o KAZDA z obu estymat bledu
    osobno (`_zmiana_pochodnej`): `|Vdot(y - J^-1 psi) - Vdot(y)| + |Vdot(y - J^-1 rho) -
    Vdot(y)|` — ta sama nierownosc trojkata, co w `u_V`, bo znak czesci ponizej `rho` jest
    nieznany i suma jednego przesuniecia moglaby sie znosic. Skladnik o zerowym wektorze
    bledu nie wnosi nic i nie jest liczony. Druga faktoryzacja na skladnik jest konieczna:
    pomiar obalil zalozenie, ze blad pochodnej jest proporcjonalny do bledu napiecia.
    Przesuniecie wzglednie mniejsze od `KROK_WZGLEDNY_POCHODNEJ` (`sqrt(u)`) jest
    wydluzane wzdluz tego samego kierunku, a roznica dzielona przez ten sam mnoznik
    (`skala_kroku_pochodnej`): inaczej `u_Vdot` na dnie zaokraglen bylo w czesci realizacja
    szumu obliczenia pochodnej i zalezalo od jadra BLAS.

    KOLEJNOSC JEST CZESCIA KONTRAKTU (korekta par. 7 rundy kwalifikacyjnej). Punkty
    przesuniete liczymy DOPIERO po sprawdzeniu, czy w ogole wolno je dotknac. Gdy
    ktorykolwiek wezel spelnia `|V| <= u_V`, przesuniecie o estymate bledu siega zera
    fazora albo za nie, a odbior o stalej mocy ma tam `1/|V|^2` i `1/|V|^4` — jakobian
    w takim punkcie jest smieciem, ktory zanieczyscilby `u_Vdot` WSZYSTKICH wezlow
    (faktoryzacja jest wspolna). Wtedy niepewnosci pochodnej sa NIESKONCZONE, co przez
    nierownosc propagacji czyni kazdy wezel NIEDOSTEPNYM — bez zadnego progu i bez
    podstawionej liczby. Residuum nieokreslone (NaN) daje `u_V` nieokreslone i ten sam skutek.

    WEZEL O NAPIECIU NARZUCONYM ZEREM (obszar beznapieciowy, zwarcie metaliczne — karta
    AB-1b.1 par. 0 pkt 2-3) jest z tego warunku WYLACZONY: jego napiecie jest zerem
    DOKLADNYM z definicji wiersza ograniczenia, a nie wynikiem Newtona bliskim zera, wiec
    jakobian w punkcie przesunietym nie ma tam osobliwosci odbioru (odbiory takiego wezla
    nie wchodza do rownan). Sam wezel dostaje czestotliwosc NIEDOSTEPNA z
    `czestotliwosc_wezla` (`|V| = 0 <= u_V`), a wezly zywe nie sa zatruwane.
    """
    liczba = model.liczba_wezlow
    jakobian = jakobian_algebry(model, odbiory, urzadzenia, stany, napiecia)
    rozklad = _rozloz_jakobian(jakobian)
    pochodna = _zespolone(
        rozklad.solve(_prawa_strona_dae(model, odbiory, urzadzenia, stany, napiecia)), liczba
    )
    residuum = residuum_algebry(model, odbiory, urzadzenia, stany, napiecia)
    granica = granica_zaokraglen_residuum(model, odbiory, urzadzenia, stany, napiecia)
    czesc_pewna = czesc_pewna_residuum(residuum, granica)
    blad_czesci_pewnej = (
        _zespolone(rozklad.solve(czesc_pewna), liczba)
        if bool(np.any(czesc_pewna != 0.0))
        else np.zeros(liczba, dtype=complex)
    )
    blad_dna = _zespolone(rozklad.solve(np.concatenate((granica, granica))), liczba)
    niepewnosc_napiecia = np.abs(blad_czesci_pewnej) + np.abs(blad_dna)

    badane = np.ones(liczba, dtype=bool)
    badane[list(model.pozycje_zerowe)] = False
    niedostepna = PochodnaZNiepewnoscia(
        pochodna_pu_s=pochodna,
        niepewnosc_napiecia_pu=niepewnosc_napiecia,
        niepewnosc_pochodnej_pu_s=np.full(liczba, np.inf, dtype=float),
    )
    if not bool(
        np.all(np.abs(napiecia[badane]) > niepewnosc_napiecia[badane])
        and np.all(np.isfinite(niepewnosc_napiecia))
    ):
        return niedostepna

    niepewnosc_pochodnej = np.zeros(liczba, dtype=float)
    for blad_napiecia in (blad_czesci_pewnej, blad_dna):
        if not bool(np.any(blad_napiecia != 0.0)):
            continue
        zmiana = _zmiana_pochodnej(
            model, odbiory, urzadzenia, stany, napiecia, pochodna, blad_napiecia, badane
        )
        if zmiana is None:
            return niedostepna
        niepewnosc_pochodnej = niepewnosc_pochodnej + zmiana
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
        raise AssertionError(f"Kod {jakosc!r} nie jest kodem niedostępności częstotliwości.")
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


def czestotliwosci_wezlow(
    model: ModelSieci,
    odbiory: tuple[ModelOdbioru, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
    *,
    f_bazowa_hz: float,
) -> list[CzestotliwoscWezla]:
    """Czestotliwosc KAZDEGO wezla w punkcie poza chwila zdarzenia — JEDNA funkcja dla kanalow
    `f_hz@` (probka `C`) i dla dozorow czestotliwosci (karta AB-1b.1 par. 0 pkt 12).

    Pochodna napiec i obie jej niepewnosci licza sie RAZ, z rozniczkowania rownania
    algebraicznego; jakobian osobliwy daje NIEDOSTEPNA w kazdym wezle, wezel o napieciu
    narzuconym zerem — BEZ_NAPIECIA. W chwili zdarzenia (probki `L`, `P`) czestotliwosci
    nie ma w ogole (kod CHWILA_ZDARZENIA) — tej funkcji sie wtedy nie wola.
    """
    try:
        pomiar = pochodna_napiec_z_niepewnoscia(model, odbiory, urzadzenia, stany, napiecia)
    except OdmowaDynamiki:
        return [czestotliwosc_niedostepna(JAKOSC_NIEDOSTEPNA) for _ in model.identy_wezlow]
    zerowe = set(model.pozycje_zerowe)
    return [
        (
            czestotliwosc_niedostepna(JAKOSC_BEZ_NAPIECIA)
            if pozycja in zerowe
            else czestotliwosc_wezla(
                complex(napiecia[pozycja]),
                complex(pomiar.pochodna_pu_s[pozycja]),
                f_bazowa_hz=f_bazowa_hz,
                niepewnosc_napiecia_pu=float(pomiar.niepewnosc_napiecia_pu[pozycja]),
                niepewnosc_pochodnej_pu_s=float(pomiar.niepewnosc_pochodnej_pu_s[pozycja]),
            )
        )
        for pozycja in range(model.liczba_wezlow)
    ]


def moc_urzadzenia_pu(
    model: ModelSieci,
    odbiory: tuple[ModelOdbioru, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
    indeks: int,
) -> complex:
    """Moc oddawana do sieci przez urzadzenie `indeks` (konwencja generacji) — JEDNA funkcja
    dla kanalow `p_pu@`/`q_pu@` i dla dozorow mocy urzadzenia.

    Urzadzenie o sprzezeniu napieciowym nie ma lokalnego wzoru na prad — jego prad jest
    domknieciem bilansu wezla (`siec.prad_wezla_ograniczonego`).
    """
    urzadzenie = urzadzenia[indeks]
    napiecie = complex(napiecia[model.indeks_wezla[urzadzenie.wezel]])
    _, stany_urzadzen = rozdziel_stany(odbiory, urzadzenia, stany)
    prad = (
        prad_wezla_ograniczonego(model, odbiory, urzadzenia, stany, napiecia, urzadzenie.wezel)
        if urzadzenie.sprzezenie == "napieciowe"
        else urzadzenie.prad_pu(stany_urzadzen[indeks], napiecie)
    )
    return napiecie * prad.conjugate()


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
    "czestotliwosci_wezlow",
    "moc_urzadzenia_pu",
    "pochodna_napiec",
    "pochodna_napiec_z_niepewnoscia",
    "wielkosci_galezi",
]
