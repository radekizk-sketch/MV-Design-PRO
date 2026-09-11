"""Integratory za wspólnym, solver-neutralnym kontraktem + porównanie ilościowe.

KOD BADAWCZY — patrz `backend/research/README.md`.

Kontrakt celowo oddziela METODĘ CAŁKOWANIA od MODELU FIZYCZNEGO: integrator widzi
wyłącznie ``f(x, t)``, gdzie wewnątrz ``f`` rozwiązywana jest algebra sieci
(schemat rozdzielony / partitioned, standard narzędzi RMS). Dzięki temu wybór
metody jest decyzją mierzalną, a nie architektoniczną — i można go zmienić bez
dotykania modeli urządzeń.

Uwaga o audycie: produkcyjny silnik miał w kontrakcie pole
``integrator: Literal["trapezoidal_implicit", "rk4"]``, którego NIGDY nie
odczytywał (phantom, defekt P2-01). Tutaj wybór metody realnie zmienia wynik i
jest to zmierzone w ``benchmarki.porownaj_integratory``.

DWIE RZECZY, KTÓRE TEN MODUŁ ROZSTRZYGA JAWNIE
----------------------------------------------

1. **Czy krok nieliniowy zbiegł ŚCIŚLE, czy tylko usiadł na podłodze numerycznej.**
   Poprzednia wersja zwracała sukces DWIEMA drogami — przy ``||r|| < tol*skala``
   oraz przy zastoju z ``||r|| < 10^4 * tol*skala`` — i wołający nie miał jak ich
   rozróżnić (``krok`` zwracał tylko stan i licznik ewaluacji). Zmierzone na
   podłodze ``f`` rzędu ``2e-5``: krok wracał jako „sukces" z residuum
   ``9,976e-07`` przy progu ścisłym ``1e-9``, czyli 998 razy powyżej progu,
   nieodróżnialnie od kroku z residuum ``6,6e-14``. Teraz wynik kroku ma trzy
   stany (``StatusKroku``) i niesie osiągnięte residuum skalowane.

2. **Niezmienniki dyskretne stanu** (``IntegratorZNiezmiennikami``). Ogranicznik
   zapisany wyłącznie w pochodnej NIE gwarantuje ``x_min <= x_n <= x_max`` przy
   skończonym kroku — patrz `regulatory` i pomiar tam opisany. Niezmiennik jest
   egzekwowany po przyjęciu kroku, a fakt rzutowania ZAPISYWANY; ciche
   ``min(max())`` jest w tym module zakazane i strukturalnie niemożliwe
   (``OgraniczenieStanu`` wymaga podania znaczenia fizycznego, a rzutowanie
   zawsze trafia do dziennika).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Protocol

import numpy as np
from numpy.typing import NDArray

Pochodna = Callable[[NDArray[np.float64], float], NDArray[np.float64]]


class BrakZbieznosciIntegratoraError(RuntimeError):
    """Iteracja niejawnego integratora nie zbiegła."""


class StatusKroku(StrEnum):
    """Wynik kroku nieliniowego — trzy stany, bez trzeciej drogi „sukcesu"."""

    STRICT_CONVERGENCE = "STRICT_CONVERGENCE"
    """``rho <= 1``: residuum zeszło poniżej ŻĄDANEJ tolerancji komponentowej."""

    STAGNATED_AT_NUMERICAL_FLOOR = "STAGNATED_AT_NUMERICAL_FLOOR"
    """Iteracja zrobiła postęp i STANĘŁA powyżej progu — podłoga numeryczna ``f``.

    Bieg badawczy MOŻE być po tym kontynuowany, ale wyłącznie gdy skonfigurowano
    to jawnie (``dopuszczaj_zastoj=True`` RAZEM z dziennikiem). Taki krok ma
    ``strict_convergence = False`` i nie może po cichu stać się dowodem.
    """

    FAILED = "FAILED"
    """Rozbieżność albo wyczerpanie iteracji bez postępu. ZAWSZE podnosi wyjątek."""


@dataclass(frozen=True)
class KryteriumZbieznosci:
    """Kryterium KOMPONENTOWE zbieżności: ``rho = max_i |r_i| / (atol_i + rtol*skala_i)``.

    Warunek ścisły to ``rho <= 1``.

    DLACZEGO NIE JEDEN PRÓG BEZWZGLĘDNY. Stan laboratorium miesza wielkości o
    różnych jednostkach i różnych rzędach: kąt wirnika [rad] ~ 0,5, prędkość
    [p.u.] ~ 1,0, stan naładowania [1] ~ 0,8, SEM i wzbudzenie [p.u.] ~ 2,5.
    Poprzednia wersja porównywała je wszystkie z jednym progiem
    ``tol * max(1, max|x|)``, czyli z progiem WYZNACZONYM PRZEZ NAJWIĘKSZY stan.
    Zmierzone skutki: dla wektora ``(0,5; 1,0; 0,8; 2,5)`` próg wynosił
    ``2,5e-09`` dla każdej współrzędnej — względnie 5,0e-09 dla kąta i 2,5e-09
    dla prędkości, a dla stanu bliskiego zeru był praktycznie nieosiągalny.
    Kryterium komponentowe daje każdej współrzędnej własną wagę.

    Args:
        atol: bezwzględna część wagi, wspólna dla wszystkich stanów.
        rtol: część względna wagi.
        atol_na_stan: bezwzględna część wagi PER STAN — nadpisuje ``atol``.
            Tu wchodzi wiedza o jednostkach (inny próg dla [rad], inny dla [1]).
        skale_stanow: skala każdego stanu ZADEKLAROWANA PRZEZ MODEL (metadane
            stanu). Gdy ``None``, skalą jest ``max(|x_0|, |x_1|)`` danego stanu —
            dynamika kroku, standard rodziny SUNDIALS/LSODA.

    PUNKT ROZSZERZENIA (świadomie niezrealizowany w tej rundzie): pełne
    skalowanie per-unit wymaga, żeby KAŻDY model deklarował bazę swojego stanu
    (``jednostki_stanow`` deklaruje dziś jednostkę, nie bazę). Do czasu tej
    deklaracji ``skale_stanow`` jest kanałem, którym wołający może podać skale
    wprost — bez zgadywania ich z nazwy stanu.
    """

    atol: float = 1.0e-9
    rtol: float = 1.0e-7
    atol_na_stan: tuple[float, ...] | None = None
    skale_stanow: tuple[float, ...] | None = None

    def __post_init__(self) -> None:
        if self.atol <= 0.0:
            raise ValueError("atol musi być > 0")
        if self.rtol < 0.0:
            raise ValueError("rtol musi być >= 0")
        if self.atol_na_stan is not None and any(a <= 0.0 for a in self.atol_na_stan):
            raise ValueError("każdy atol_na_stan musi być > 0")
        if self.skale_stanow is not None and any(s <= 0.0 for s in self.skale_stanow):
            raise ValueError("każda skala_stanow musi być > 0")

    def wagi(
        self, x_poczatkowe: NDArray[np.float64], x_biezace: NDArray[np.float64]
    ) -> NDArray[np.float64]:
        """Wagi ``atol_i + rtol*skala_i`` — mianownik kryterium, jedna na stan."""
        n = len(x_biezace)
        if self.atol_na_stan is not None:
            if len(self.atol_na_stan) != n:
                raise ValueError(
                    f"atol_na_stan ma {len(self.atol_na_stan)} pozycji dla {n} stanów"
                )
            atol = np.asarray(self.atol_na_stan, dtype=np.float64)
        else:
            atol = np.full(n, self.atol, dtype=np.float64)
        if self.skale_stanow is not None:
            if len(self.skale_stanow) != n:
                raise ValueError(
                    f"skale_stanow ma {len(self.skale_stanow)} pozycji dla {n} stanów"
                )
            skale = np.abs(np.asarray(self.skale_stanow, dtype=np.float64))
        else:
            skale = np.maximum(np.abs(x_poczatkowe), np.abs(x_biezace))
        return atol + self.rtol * skale

    def rho(
        self,
        residuum: NDArray[np.float64],
        x_poczatkowe: NDArray[np.float64],
        x_biezace: NDArray[np.float64],
    ) -> float:
        """Residuum SKALOWANE. ``rho <= 1`` to zbieżność ścisła."""
        return float(np.max(np.abs(residuum) / self.wagi(x_poczatkowe, x_biezace)))


KRYTERIUM_DOMYSLNE = KryteriumZbieznosci()
"""Domyślne kryterium laboratorium: ``atol = 1e-9``, ``rtol = 1e-7``.

Dobrane wobec DRABINY TOLERANCJI (patrz ``_newton_niejawny``): solver sieci
pracuje z tolerancją ``1e-12``, krok różnicowy jakobianu to ``~1,5e-8``.
Poprzednia ścieżka zastoju milcząco akceptowała residuum do ``1e-5``
bezwzględnie; ten próg ścisły jest dla stanu rzędu 1 około stu razy ostrzejszy
(``1,01e-7``) i — w odróżnieniu od tamtego — jest WZGLĘDNY.
"""


@dataclass(frozen=True)
class WynikKrokuNieliniowego:
    """Sprawozdanie z jednego kroku: co osiągnięto i czy wolno to nazwać zbieżnością."""

    status: StatusKroku
    kryterium: KryteriumZbieznosci
    """Tolerancja ŻĄDANA — komplet parametrów, nie sama liczba."""
    rho: float
    """Osiągnięte residuum SKALOWANE (``rho <= 1`` = próg ścisły osiągnięty)."""
    residuum_maks: float
    """Surowe ``||r||_inf`` — informacyjnie, do porównań między krokami."""
    iteracje: int
    ewaluacje_f: int
    ewaluacje_jakobianu: int
    przyczyna: str

    @property
    def strict_convergence(self) -> bool:
        """Czy TEN krok wolno traktować jako ściśle zbieżny."""
        return self.status is StatusKroku.STRICT_CONVERGENCE


class DziennikKrokow:
    """Rejestr sprawozdań z kroków nieliniowych.

    Istnieje po to, żeby zastój NIE MÓGŁ przejść niezauważony: włączenie
    ``dopuszczaj_zastoj`` bez dziennika jest odrzucane przy budowie integratora,
    więc każdy bieg kontynuowany po zastoju ma zapis tego faktu.
    """

    def __init__(self) -> None:
        self._wyniki: list[WynikKrokuNieliniowego] = []

    def zapisz(self, wynik: WynikKrokuNieliniowego) -> None:
        self._wyniki.append(wynik)

    @property
    def wyniki(self) -> tuple[WynikKrokuNieliniowego, ...]:
        return tuple(self._wyniki)

    @property
    def zastoje(self) -> tuple[WynikKrokuNieliniowego, ...]:
        return tuple(
            w for w in self._wyniki if w.status is StatusKroku.STAGNATED_AT_NUMERICAL_FLOOR
        )

    @property
    def strict_convergence(self) -> bool:
        """Czy CAŁY zapisany bieg był ściśle zbieżny.

        Pusty dziennik daje ``False`` świadomie: „nic nie zapisano" nie jest
        dowodem zbieżności, tylko brakiem dowodu. ``all([])`` dałoby tu ciche
        ``True`` — czyli dokładnie tę fałszywą pewność, przed którą ten typ ma
        chronić.
        """
        return bool(self._wyniki) and all(w.strict_convergence for w in self._wyniki)


class Integrator(Protocol):
    """Kontrakt integratora: jeden krok o długości ``dt``."""

    nazwa: str
    rzad: int
    jawny: bool

    def krok(
        self, f: Pochodna, x: NDArray[np.float64], t: float, dt: float
    ) -> tuple[NDArray[np.float64], int]:
        """Wykonaj krok. Zwraca ``(x_next, liczba_ewaluacji_f)``."""
        ...

    def krok_ze_sprawozdaniem(
        self, f: Pochodna, x: NDArray[np.float64], t: float, dt: float
    ) -> tuple[NDArray[np.float64], WynikKrokuNieliniowego]:
        """Wykonaj krok i zwróć ``(x_next, sprawozdanie)``."""
        ...


def _sprawozdanie_metody_jawnej(ewaluacje: int) -> WynikKrokuNieliniowego:
    """Sprawozdanie kroku JAWNEGO: nie ma układu nieliniowego, więc nie ma czego nie zbiec.

    Status ``STRICT_CONVERGENCE`` jest tu twierdzeniem o ROZWIĄZANIU UKŁADU
    NIELINIOWEGO (rozwiązany dokładnie, bo go nie ma), a nie o błędzie metody —
    ten dla metod jawnych bywa duży i mierzy go ``benchmarki``/``sztywnosc``.
    """
    return WynikKrokuNieliniowego(
        status=StatusKroku.STRICT_CONVERGENCE,
        kryterium=KRYTERIUM_DOMYSLNE,
        rho=0.0,
        residuum_maks=0.0,
        iteracje=0,
        ewaluacje_jakobianu=0,
        ewaluacje_f=ewaluacje,
        przyczyna="metoda jawna: krok wyznaczony wprost, brak układu nieliniowego",
    )


@dataclass(frozen=True)
class EulerJawny:
    """Euler jawny (rząd 1). Referencja dolna — pokazuje koszt błędu metody."""

    nazwa: str = "euler_jawny"
    rzad: int = 1
    jawny: bool = True

    def krok(
        self, f: Pochodna, x: NDArray[np.float64], t: float, dt: float
    ) -> tuple[NDArray[np.float64], int]:
        return x + dt * f(x, t), 1

    def krok_ze_sprawozdaniem(
        self, f: Pochodna, x: NDArray[np.float64], t: float, dt: float
    ) -> tuple[NDArray[np.float64], WynikKrokuNieliniowego]:
        x1, ewaluacje = self.krok(f, x, t, dt)
        return x1, _sprawozdanie_metody_jawnej(ewaluacje)


@dataclass(frozen=True)
class Rk4:
    """Runge-Kutta 4. rzędu, jawny. Dokładny, ale bez własności A-stabilności."""

    nazwa: str = "rk4"
    rzad: int = 4
    jawny: bool = True

    def krok(
        self, f: Pochodna, x: NDArray[np.float64], t: float, dt: float
    ) -> tuple[NDArray[np.float64], int]:
        k1 = f(x, t)
        k2 = f(x + 0.5 * dt * k1, t + 0.5 * dt)
        k3 = f(x + 0.5 * dt * k2, t + 0.5 * dt)
        k4 = f(x + dt * k3, t + dt)
        return x + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4), 4

    def krok_ze_sprawozdaniem(
        self, f: Pochodna, x: NDArray[np.float64], t: float, dt: float
    ) -> tuple[NDArray[np.float64], WynikKrokuNieliniowego]:
        x1, ewaluacje = self.krok(f, x, t, dt)
        return x1, _sprawozdanie_metody_jawnej(ewaluacje)


@dataclass(frozen=True)
class EulerNiejawny:
    """Euler wsteczny (rząd 1), A-stabilny, silnie tłumiący.

    Tłumienie numeryczne jest tu ZALETĄ przy sztywnych składowych i WADĄ przy
    ocenie tłumienia fizycznego — mierzone w porównaniu integratorów.
    """

    nazwa: str = "euler_niejawny"
    rzad: int = 1
    jawny: bool = False
    kryterium: KryteriumZbieznosci = KRYTERIUM_DOMYSLNE
    maks_iteracji: int = 50
    dopuszczaj_zastoj: bool = False
    dziennik: DziennikKrokow | None = None

    def __post_init__(self) -> None:
        _sprawdz_konfiguracje_zastoju(self.dopuszczaj_zastoj, self.dziennik)

    def krok(
        self, f: Pochodna, x: NDArray[np.float64], t: float, dt: float
    ) -> tuple[NDArray[np.float64], int]:
        x1, wynik = self.krok_ze_sprawozdaniem(f, x, t, dt)
        return x1, wynik.ewaluacje_f

    def krok_ze_sprawozdaniem(
        self, f: Pochodna, x: NDArray[np.float64], t: float, dt: float
    ) -> tuple[NDArray[np.float64], WynikKrokuNieliniowego]:
        return _krok_niejawny(self, f, x, t, dt, wagi=(0.0, 1.0))


@dataclass(frozen=True)
class TrapezNiejawny:
    """Trapezy niejawne (rząd 2), A-stabilny, bez tłumienia numerycznego.

    Standard narzędzi RMS. Zachowuje amplitudę oscylacji nietłumionych, więc nie
    maskuje braku tłumienia fizycznego — istotne przy ocenie stabilności.
    """

    nazwa: str = "trapez_niejawny"
    rzad: int = 2
    jawny: bool = False
    kryterium: KryteriumZbieznosci = KRYTERIUM_DOMYSLNE
    maks_iteracji: int = 50
    dopuszczaj_zastoj: bool = False
    dziennik: DziennikKrokow | None = None

    def __post_init__(self) -> None:
        _sprawdz_konfiguracje_zastoju(self.dopuszczaj_zastoj, self.dziennik)

    def krok(
        self, f: Pochodna, x: NDArray[np.float64], t: float, dt: float
    ) -> tuple[NDArray[np.float64], int]:
        x1, wynik = self.krok_ze_sprawozdaniem(f, x, t, dt)
        return x1, wynik.ewaluacje_f

    def krok_ze_sprawozdaniem(
        self, f: Pochodna, x: NDArray[np.float64], t: float, dt: float
    ) -> tuple[NDArray[np.float64], WynikKrokuNieliniowego]:
        return _krok_niejawny(self, f, x, t, dt, wagi=(0.5, 0.5))


def _sprawdz_konfiguracje_zastoju(dopuszczaj: bool, dziennik: DziennikKrokow | None) -> None:
    """Zastój wolno dopuścić TYLKO razem z dziennikiem.

    To jest mechanizm, nie zalecenie: bez dziennika krok po zastoju nie miałby
    gdzie zostawić śladu, więc wynik po cichu wyglądałby jak ściśle zbieżny.
    """
    if dopuszczaj and dziennik is None:
        raise ValueError(
            "dopuszczaj_zastoj=True wymaga dziennika: bieg kontynuowany po zastoju "
            "musi mieć zapis (strict_convergence = False), inaczej wynik po cichu "
            "stałby się dowodem."
        )


# Krok różnicy przedniej: pierwiastek z epsilona maszynowego to standardowy
# kompromis między błędem obcięcia (rośnie z h) a błędem zaokrągleń (maleje z h).
_KROK_ROZNICOWY = float(np.sqrt(np.finfo(np.float64).eps))

#: Ile razy residuum może wzrosnąć ponad swoje minimum, żeby stan nadal uznać za
#: ZASTÓJ (plateau), a nie za rozbieżność. Powyżej — iteracja się rozjeżdża.
_MARGINES_PLATEAU = 10.0

#: Największy udział residuum w WŁASNEJ SKALI RÓWNANIA, przy którym zatrzymanie
#: iteracji wolno nazwać podłogą numeryczną. Skalą równania jest większy z
#: członów, z których residuum powstaje: przyrost stanu ``||x1 - x0||`` i człon
#: całkujący ``dt*||a*f0 + b*f1||``. Miara jest BEZWYMIAROWA i mówi wprost:
#: „równanie niejawne jest rozwiązane z dokładnością do 0,1 % kroku, ale nie do
#: żądanej tolerancji". Zmierzone na dwóch skrajnych przypadkach: iteracja, która
#: niczego nie rozwiązała, ma ten udział równy 1,000 (residuum JEST całym
#: równaniem); realna podłoga numeryczna daje 1e-5 i mniej.
#:
#: UWAGA O ROLI TEJ STAŁEJ: rozdziela ona dwa stany, z których ŻADEN nie jest
#: zbieżnością ścisłą (``strict_convergence = False`` w obu). Pomyłka w
#: klasyfikacji zmienia więc komunikat i politykę kontynuacji, a NIE może
#: zamienić wyniku niezbieżnego w dowód. To jest zasadnicza różnica wobec
#: poprzedniego progu ``10^4 * tol``, który decydował o zwróceniu SUKCESU.
_UDZIAL_PODLOGI = 1.0e-3

#: Iteracja zmniejszająca residuum wolniej niż o połowę „nie robi postępu".
#: Trzy takie z rzędu to zastój, a nie chwilowe spowolnienie.
_PROG_POSTEPU = 0.5
_ZASTOJ_POD_RZAD = 3


class _IntegratorNiejawny(Protocol):
    kryterium: KryteriumZbieznosci
    maks_iteracji: int
    dopuszczaj_zastoj: bool
    dziennik: DziennikKrokow | None


def _krok_niejawny(
    integrator: _IntegratorNiejawny,
    f: Pochodna,
    x: NDArray[np.float64],
    t: float,
    dt: float,
    *,
    wagi: tuple[float, float],
) -> tuple[NDArray[np.float64], WynikKrokuNieliniowego]:
    """Wykonaj krok niejawny, zapisz sprawozdanie i wyegzekwuj politykę zastoju."""
    x1, wynik = _newton_niejawny(
        f,
        x,
        t,
        dt,
        wagi=wagi,
        kryterium=integrator.kryterium,
        maks=integrator.maks_iteracji,
    )
    if integrator.dziennik is not None:
        integrator.dziennik.zapisz(wynik)
    if wynik.status is StatusKroku.FAILED:
        raise BrakZbieznosciIntegratoraError(wynik.przyczyna)
    if wynik.status is StatusKroku.STAGNATED_AT_NUMERICAL_FLOOR and not integrator.dopuszczaj_zastoj:
        raise BrakZbieznosciIntegratoraError(
            f"{wynik.przyczyna} Bieg NIE jest kontynuowany: kontynuacja po zastoju "
            f"wymaga jawnej konfiguracji (dopuszczaj_zastoj=True + dziennik), bo "
            f"taki krok nie jest ściśle zbieżny."
        )
    return x1, wynik


def _newton_niejawny(
    f: Pochodna,
    x: NDArray[np.float64],
    t: float,
    dt: float,
    *,
    wagi: tuple[float, float],
    kryterium: KryteriumZbieznosci,
    maks: int,
) -> tuple[NDArray[np.float64], WynikKrokuNieliniowego]:
    """Wspólne jądro metod niejawnych: ``x1 = x0 + dt*(a*f(x0) + b*f(x1))``.

    ``wagi = (a, b)``: (0,1) → Euler wsteczny, (0.5,0.5) → trapezy.

    DRABINA TOLERANCJI (wniosek zmierzony, nie założony)
    ----------------------------------------------------
    ``f`` nie jest tu funkcją analityczną — każda jej ewaluacja ROZWIĄZUJE
    NUMERYCZNIE algebrę sieci, więc niesie własny szum na poziomie tolerancji
    tamtego solvera. Jakobian liczony różnicą przednią o kroku ``h`` wzmacnia ten
    szum ``1/h`` razy. Przy tolerancji sieci ``1e-10`` i ``h = 1e-7`` szum
    Jakobianu sięga ``1e-3`` — i wtedy zewnętrzny Newton NIE MOŻE zejść do
    ``1e-10``: zatrzymuje się na podłodze szumu.

    To był realny defekt tego laboratorium, ujawniony dopiero pomiarem na
    układzie sztywnym (metody niejawne padały 25 ms PO wyłączeniu zwarcia, przy
    napięciach już wróconych do normy). Wniosek dla architektury docelowej:
    tolerancje zagnieżdżonych solverów muszą tworzyć drabinę
    (sieć << krok różnicowy << tolerancja zewnętrzna), a kryterium zbieżności
    musi być WZGLĘDNE i wyposażone w detekcję zastoju.

    CO SIĘ ZMIENIŁO I DLACZEGO. Poprzednia wersja reagowała na tę wiedzę,
    zwracając zastój jako SUKCES, o ile residuum mieściło się w ``10^4 * próg``.
    Wołający dostawał wtedy tę samą wartość co po zbieżności ścisłej i nie miał
    jak ich rozróżnić — zmierzone: residuum ``9,976e-07`` przy progu ``1e-9``
    wracało jako sukces. Zastój nie zniknął (jest realną własnością zagnieżdżonych
    solverów), ale przestał udawać zbieżność: jest osobnym STANEM wyniku, a
    kontynuacja po nim wymaga jawnej zgody wołającego.

    ROZRÓŻNIENIE ZASTÓJ vs ROZBIEŻNOŚĆ. Oba objawiają się brakiem postępu
    residuum, więc ten sam licznik je wykrywa. Rozdziela je HISTORIA: zastój to
    iteracja, która postęp ZROBIŁA i stanęła w pobliżu swojego minimum
    (``||r|| <= 10 * min||r||`` i ``min||r|| < ||r_0||``); wszystko inne —
    residuum rosnące albo nigdy nieporawione — jest rozbieżnością.
    """
    a, b = wagi
    n = len(x)
    if n == 0:
        return x.copy(), WynikKrokuNieliniowego(
            status=StatusKroku.STRICT_CONVERGENCE,
            kryterium=kryterium,
            rho=0.0,
            residuum_maks=0.0,
            iteracje=0,
            ewaluacje_f=1,
            ewaluacje_jakobianu=0,
            przyczyna="stan pusty: układ nieliniowy zerowego wymiaru",
        )
    f0 = f(x, t)
    ewaluacje = 1
    ewaluacje_jak = 0
    x1 = x + dt * f0
    poprzednia_norma = float("inf")
    norma_poczatkowa = float("inf")
    najmniejsza_norma = float("inf")
    zastoj = 0
    norma = float("inf")
    rho = float("inf")
    iteracje = 0

    for _ in range(maks):
        f1 = f(x1, t + dt)
        ewaluacje += 1
        iteracje += 1
        residuum = x1 - x - dt * (a * f0 + b * f1)
        norma = float(np.max(np.abs(residuum)))
        rho = kryterium.rho(residuum, x, x1)
        if norma_poczatkowa == float("inf"):
            norma_poczatkowa = norma
        najmniejsza_norma = min(najmniejsza_norma, norma)

        if rho <= 1.0:
            return x1, WynikKrokuNieliniowego(
                status=StatusKroku.STRICT_CONVERGENCE,
                kryterium=kryterium,
                rho=rho,
                residuum_maks=norma,
                iteracje=iteracje,
                ewaluacje_f=ewaluacje,
                ewaluacje_jakobianu=ewaluacje_jak,
                przyczyna=f"rho = {rho:.3e} <= 1 — próg ścisły osiągnięty.",
            )

        if norma > _PROG_POSTEPU * poprzednia_norma:
            zastoj += 1
            if zastoj >= _ZASTOJ_POD_RZAD:
                skala_rownania = max(
                    float(np.max(np.abs(x1 - x))),
                    float(np.max(np.abs(dt * (a * f0 + b * f1)))),
                )
                udzial = norma / skala_rownania if skala_rownania > 0.0 else float("inf")
                plateau = (
                    norma <= _MARGINES_PLATEAU * najmniejsza_norma
                    and najmniejsza_norma < norma_poczatkowa
                    and udzial <= _UDZIAL_PODLOGI
                )
                status = (
                    StatusKroku.STAGNATED_AT_NUMERICAL_FLOOR if plateau else StatusKroku.FAILED
                )
                przyczyna = (
                    (
                        f"Residuum przestało maleć po {iteracje} iteracjach i stanęło na "
                        f"{norma:.3e} (minimum biegu {najmniejsza_norma:.3e}, start "
                        f"{norma_poczatkowa:.3e}, udział w skali równania {udzial:.3e}); "
                        f"rho = {rho:.3e} > 1, więc próg ścisły "
                        f"NIE został osiągnięty. To podłoga numeryczna f — sprawdź drabinę "
                        f"tolerancji: solver sieci musi być istotnie dokładniejszy niż krok "
                        f"różnicowy jakobianu."
                    )
                    if plateau
                    else (
                        f"Iteracja rozbieżna po {iteracje} krokach: residuum {norma:.3e} wobec "
                        f"minimum {najmniejsza_norma:.3e} i startu {norma_poczatkowa:.3e}; "
                        f"residuum stanowi {udzial:.3e} skali równania (podłoga numeryczna "
                        f"wymaga <= {_UDZIAL_PODLOGI:.0e}); rho = {rho:.3e}."
                    )
                )
                return x1, WynikKrokuNieliniowego(
                    status=status,
                    kryterium=kryterium,
                    rho=rho,
                    residuum_maks=norma,
                    iteracje=iteracje,
                    ewaluacje_f=ewaluacje,
                    ewaluacje_jakobianu=ewaluacje_jak,
                    przyczyna=przyczyna,
                )
        else:
            zastoj = 0
        poprzednia_norma = norma

        jak = np.zeros((n, n), dtype=np.float64)
        for j in range(n):
            h = _KROK_ROZNICOWY * max(abs(float(x1[j])), 1.0)
            x_pert = x1.copy()
            x_pert[j] += h
            f_pert = f(x_pert, t + dt)
            ewaluacje += 1
            jak[:, j] = (f_pert - f1) / h
        ewaluacje_jak += 1
        g_jak = np.eye(n) - dt * b * jak
        try:
            delta = np.linalg.solve(g_jak, -residuum)
        except np.linalg.LinAlgError as exc:  # pragma: no cover - zależy od danych
            raise BrakZbieznosciIntegratoraError("Jakobian integratora osobliwy") from exc
        x1 = x1 + delta

    return x1, WynikKrokuNieliniowego(
        status=StatusKroku.FAILED,
        kryterium=kryterium,
        rho=rho,
        residuum_maks=norma,
        iteracje=iteracje,
        ewaluacje_f=ewaluacje,
        ewaluacje_jakobianu=ewaluacje_jak,
        przyczyna=(
            f"Integrator niejawny nie zbiegł w {maks} iteracjach (residuum {norma:.3e}, "
            f"rho {rho:.3e} > 1). Sprawdź drabinę tolerancji: solver sieci musi być "
            f"istotnie dokładniejszy niż krok różnicowy jakobianu."
        ),
    )


# ---------------------------------------------------------------------------
# Niezmienniki dyskretne stanu
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class OgraniczenieStanu:
    """Niezmiennik ``dol <= x[indeks] <= gora`` przy KAŻDEJ przyjętej próbce.

    ``znaczenie`` jest polem WYMAGANYM: ogranicznik bez podanego znaczenia
    fizycznego byłby cichym ``min(max())``, czyli poprawianiem liczby bez
    powiedzenia, co ona reprezentuje.
    """

    indeks: int
    dol: float
    gora: float
    nazwa: str
    znaczenie: str

    def __post_init__(self) -> None:
        if self.indeks < 0:
            raise ValueError("indeks stanu musi być >= 0")
        if self.dol > self.gora:
            raise ValueError(f"{self.nazwa}: dol ({self.dol}) > gora ({self.gora})")
        if not self.nazwa.strip():
            raise ValueError("ogranicznik bez nazwy stanu")
        if not self.znaczenie.strip():
            raise ValueError(
                f"{self.nazwa}: ogranicznik bez znaczenia fizycznego — "
                "zakaz cichego min(max()) po kroku."
            )


@dataclass(frozen=True)
class ZapisRzutowania:
    """Ślad JEDNEGO rzutowania: co, kiedy, o ile i dlaczego."""

    chwila_s: float
    indeks: int
    nazwa: str
    znaczenie: str
    wartosc_przed: float
    wartosc_po: float
    granica: str
    """``"dol"`` albo ``"gora"``."""

    @property
    def nadmiar(self) -> float:
        """O ile krok wyszedł poza dopuszczalny przedział."""
        return abs(self.wartosc_przed - self.wartosc_po)


class DziennikRzutowan:
    """Rejestr rzutowań stanu na przedział dopuszczalny."""

    def __init__(self) -> None:
        self._zapisy: list[ZapisRzutowania] = []

    def zapisz(self, zapis: ZapisRzutowania) -> None:
        self._zapisy.append(zapis)

    @property
    def zapisy(self) -> tuple[ZapisRzutowania, ...]:
        return tuple(self._zapisy)

    @property
    def bez_rzutowan(self) -> bool:
        """Czy krok ani razu nie musiał być rzutowany (niezmiennik trzymał się sam)."""
        return not self._zapisy

    @property
    def najwiekszy_nadmiar(self) -> float:
        return max((z.nadmiar for z in self._zapisy), default=0.0)


@dataclass(frozen=True)
class IntegratorZNiezmiennikami:
    """Dowolny integrator + egzekwowanie niezmienników dyskretnych po kroku.

    DLACZEGO JAKO NAKŁADKA, A NIE W KAŻDEJ METODZIE. Niezmiennik jest własnością
    MODELU (ogranicznik wzbudnicy, zakres mocy turbiny), a nie metody całkowania;
    wpisany do czterech klas byłby czterema kopiami tej samej reguły. Nakładka
    działa dla wszystkich czterech integratorów jednakowo i zachowuje kontrakt
    ``krok`` — wołający nie musi wiedzieć, że stan jest pilnowany.

    UZASADNIENIE MATEMATYCZNE. Dla pętli pierwszego rzędu ``T*dx/dt = cel - x``
    z ``cel`` należącym do ``[dol, gora]`` przedział ``[dol, gora]`` jest zbiorem
    NIEZMIENNICZYM dokładnego przepływu (rozwiązanie jest kontrakcją do ``cel``).
    Wyjście poza przedział jest więc wyłącznie artefaktem dyskretyzacji, a
    rzutowanie przywraca własność, którą ma rozwiązanie ścisłe — to nie jest
    dokładanie fizyki, tylko odtwarzanie jej po kroku. Cena jest zmierzona i
    opisana w testach: w kroku, w którym rzutowanie działa, metoda spada do
    rzędu 1 (błąd lokalny ma wtedy rozmiar nadmiaru).
    """

    podstawa: Integrator
    ograniczenia: tuple[OgraniczenieStanu, ...]
    dziennik: DziennikRzutowan = field(default_factory=DziennikRzutowan)

    def __post_init__(self) -> None:
        if not self.ograniczenia:
            raise ValueError(
                "IntegratorZNiezmiennikami bez ograniczeń: nakładka bez treści "
                "sugerowałaby ochronę, której nie ma."
            )
        indeksy = [o.indeks for o in self.ograniczenia]
        if len(set(indeksy)) != len(indeksy):
            raise ValueError(f"dwa ograniczenia na ten sam stan: {sorted(indeksy)}")

    @property
    def nazwa(self) -> str:
        return f"{self.podstawa.nazwa}+niezmienniki"

    @property
    def rzad(self) -> int:
        return self.podstawa.rzad

    @property
    def jawny(self) -> bool:
        return self.podstawa.jawny

    def krok(
        self, f: Pochodna, x: NDArray[np.float64], t: float, dt: float
    ) -> tuple[NDArray[np.float64], int]:
        x1, ewaluacje = self.podstawa.krok(f, x, t, dt)
        return self._rzutuj(x1, t + dt), ewaluacje

    def krok_ze_sprawozdaniem(
        self, f: Pochodna, x: NDArray[np.float64], t: float, dt: float
    ) -> tuple[NDArray[np.float64], WynikKrokuNieliniowego]:
        x1, wynik = self.podstawa.krok_ze_sprawozdaniem(f, x, t, dt)
        return self._rzutuj(x1, t + dt), wynik

    def _rzutuj(self, x1: NDArray[np.float64], chwila_s: float) -> NDArray[np.float64]:
        wynik = x1
        for ogr in self.ograniczenia:
            wartosc = float(wynik[ogr.indeks])
            if ogr.dol <= wartosc <= ogr.gora:
                continue
            granica = "dol" if wartosc < ogr.dol else "gora"
            nowa = ogr.dol if wartosc < ogr.dol else ogr.gora
            if wynik is x1:
                wynik = x1.copy()
            wynik[ogr.indeks] = nowa
            self.dziennik.zapisz(
                ZapisRzutowania(
                    chwila_s=chwila_s,
                    indeks=ogr.indeks,
                    nazwa=ogr.nazwa,
                    znaczenie=ogr.znaczenie,
                    wartosc_przed=wartosc,
                    wartosc_po=nowa,
                    granica=granica,
                )
            )
        return wynik


def z_niezmiennikami(
    integrator: Integrator | str,
    ograniczenia: tuple[OgraniczenieStanu, ...],
    *,
    dziennik: DziennikRzutowan | None = None,
) -> IntegratorZNiezmiennikami:
    """Owiń integrator (lub jego nazwę z rejestru) egzekwowaniem niezmienników."""
    podstawa = INTEGRATORY[integrator] if isinstance(integrator, str) else integrator
    return IntegratorZNiezmiennikami(
        podstawa=podstawa,
        ograniczenia=ograniczenia,
        dziennik=dziennik if dziennik is not None else DziennikRzutowan(),
    )


INTEGRATORY: dict[str, Integrator] = {
    "euler_jawny": EulerJawny(),
    "rk4": Rk4(),
    "euler_niejawny": EulerNiejawny(),
    "trapez_niejawny": TrapezNiejawny(),
}
"""Rejestr integratorów — dostępny dla benchmarków i porównań.

Instancje rejestru są BEZSTANOWE: ``dopuszczaj_zastoj=False`` i brak dziennika,
więc współdzielenie ich między biegami nie wprowadza stanu ani niedeterminizmu.
Kto chce kontynuować bieg po zastoju, buduje własną instancję z własnym
dziennikiem — i tym samym robi to jawnie.
"""
