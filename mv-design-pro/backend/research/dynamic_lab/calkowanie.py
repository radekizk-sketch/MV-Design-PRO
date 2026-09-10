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
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

import numpy as np
from numpy.typing import NDArray

Pochodna = Callable[[NDArray[np.float64], float], NDArray[np.float64]]


class BrakZbieznosciIntegratoraError(RuntimeError):
    """Iteracja niejawnego integratora nie zbiegła."""


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


@dataclass(frozen=True)
class EulerNiejawny:
    """Euler wsteczny (rząd 1), A-stabilny, silnie tłumiący.

    Tłumienie numeryczne jest tu ZALETĄ przy sztywnych składowych i WADĄ przy
    ocenie tłumienia fizycznego — mierzone w porównaniu integratorów.
    """

    nazwa: str = "euler_niejawny"
    rzad: int = 1
    jawny: bool = False
    tolerancja: float = 1.0e-9
    maks_iteracji: int = 50

    def krok(
        self, f: Pochodna, x: NDArray[np.float64], t: float, dt: float
    ) -> tuple[NDArray[np.float64], int]:
        return _newton_niejawny(
            f, x, t, dt, wagi=(0.0, 1.0), tol=self.tolerancja, maks=self.maks_iteracji
        )


@dataclass(frozen=True)
class TrapezNiejawny:
    """Trapezy niejawne (rząd 2), A-stabilny, bez tłumienia numerycznego.

    Standard narzędzi RMS. Zachowuje amplitudę oscylacji nietłumionych, więc nie
    maskuje braku tłumienia fizycznego — istotne przy ocenie stabilności.
    """

    nazwa: str = "trapez_niejawny"
    rzad: int = 2
    jawny: bool = False
    tolerancja: float = 1.0e-9
    maks_iteracji: int = 50

    def krok(
        self, f: Pochodna, x: NDArray[np.float64], t: float, dt: float
    ) -> tuple[NDArray[np.float64], int]:
        return _newton_niejawny(
            f, x, t, dt, wagi=(0.5, 0.5), tol=self.tolerancja, maks=self.maks_iteracji
        )


# Krok różnicy przedniej: pierwiastek z epsilona maszynowego to standardowy
# kompromis między błędem obcięcia (rośnie z h) a błędem zaokrągleń (maleje z h).
_KROK_ROZNICOWY = float(np.sqrt(np.finfo(np.float64).eps))


def _newton_niejawny(
    f: Pochodna,
    x: NDArray[np.float64],
    t: float,
    dt: float,
    *,
    wagi: tuple[float, float],
    tol: float,
    maks: int,
) -> tuple[NDArray[np.float64], int]:
    """Wspólne jądro metod niejawnych: ``x1 = x0 + dt*(a*f(x0) + b*f(x1))``.

    ``wagi = (a, b)``: (0,1) → Euler wsteczny, (0.5,0.5) → trapezy.

    DRABINA TOLERANCJI (wniosek zmierzony, nie założony)
    ----------------------------------------------------
    ``f`` nie jest tu funkcją analityczną — każda jej ewaluacja ROZWIĄZUJE
    NUMERYCZNIE algebrę sieci, więc niesie własny szum na poziomie tolerancji
    tamtego solvera. Jakobian liczony różnicą przednią o kroku ``h`` wzmacnia ten
    szum ``1/h`` razy. Przy tolerancji sieci ``1e-10`` i ``h = 1e-7`` szum
    Jakobianu sięga ``1e-3`` — i wtedy zewnętrzny Newton NIE MOŻE zejść do
    ``1e-10``: zatrzymuje się na podłodze szumu i zgłasza brak zbieżności,
    mimo że rozwiązanie jest poprawne.

    To był realny defekt tego laboratorium, ujawniony dopiero pomiarem na
    układzie sztywnym (metody niejawne padały 25 ms PO wyłączeniu zwarcia, przy
    napięciach już wróconych do normy). Wniosek dla architektury docelowej:
    tolerancje zagnieżdżonych solverów muszą tworzyć drabinę
    (sieć << krok różnicowy << tolerancja zewnętrzna), a kryterium zbieżności
    musi być WZGLĘDNE i wyposażone w detekcję zastoju — inaczej solver zgłasza
    porażkę na poprawnym wyniku.
    """
    a, b = wagi
    n = len(x)
    if n == 0:
        return x.copy(), 1
    f0 = f(x, t)
    ewaluacje = 1
    x1 = x + dt * f0
    skala = max(1.0, float(np.max(np.abs(x))))
    prog = tol * skala
    poprzednie = float("inf")
    zastoj = 0
    for _ in range(maks):
        f1 = f(x1, t + dt)
        ewaluacje += 1
        residuum = x1 - x - dt * (a * f0 + b * f1)
        norma = float(np.max(np.abs(residuum)))
        if norma < prog:
            return x1, ewaluacje
        # Detekcja zastoju: gdy residuum przestaje maleć, dalsze iteracje mielą
        # szum. Wynik jest akceptowany, jeśli mieści się w progu praktycznym.
        if norma > 0.5 * poprzednie:
            zastoj += 1
            if zastoj >= 3:
                if norma < prog * 1.0e4:
                    return x1, ewaluacje
                break
        else:
            zastoj = 0
        poprzednie = norma
        jak = np.zeros((n, n), dtype=np.float64)
        for j in range(n):
            h = _KROK_ROZNICOWY * max(abs(float(x1[j])), 1.0)
            x_pert = x1.copy()
            x_pert[j] += h
            f_pert = f(x_pert, t + dt)
            ewaluacje += 1
            jak[:, j] = (f_pert - f1) / h
        g_jak = np.eye(n) - dt * b * jak
        try:
            delta = np.linalg.solve(g_jak, -residuum)
        except np.linalg.LinAlgError as exc:  # pragma: no cover - zależy od danych
            raise BrakZbieznosciIntegratoraError("Jakobian integratora osobliwy") from exc
        x1 = x1 + delta
    raise BrakZbieznosciIntegratoraError(
        f"Integrator niejawny nie zbiegł w {maks} iteracjach (residuum {norma:.3e}, "
        f"próg {prog:.3e}). Sprawdź drabinę tolerancji: solver sieci musi być "
        f"istotnie dokładniejszy niż krok różnicowy Jakobianu."
    )


INTEGRATORY: dict[str, Integrator] = {
    "euler_jawny": EulerJawny(),
    "rk4": Rk4(),
    "euler_niejawny": EulerNiejawny(),
    "trapez_niejawny": TrapezNiejawny(),
}
"""Rejestr integratorów — dostępny dla benchmarków i porównań."""
