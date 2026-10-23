"""Jedna polityka wątków BLAS procesu liczącego fizykę — wynik nie zależy od otoczenia procesu.

Moduł ładowany przez ``network_model/__init__.py``, więc działa w KAŻDYM procesie, który
importuje cokolwiek z ``network_model`` (solvery, modele, ``enm`` — budowa modelu solvera),
zanim którykolwiek solver policzy pierwszą macierz.

DLACZEGO (karta DETERMINIZM-HISTORII-PROCESU, pomiar 2026-10-23, numpy 1.26.4 z OpenBLAS
0.3.23 ``openblas64_``, scipy 1.17.0 z ``scipy_openblas``). OpenBLAS dzieli pracę LU,
odwrócenia i iloczynu macierzy między wątki, a podział zmienia kolejność sumowania. Ta sama
macierz dawała więc inne ostatnie bity przy 1, 2 i 4 wątkach (``openblas_set_num_threads``
w jednym procesie, macierz losowa z dominującą przekątną):

* ``numpy.linalg.inv``/``solve`` zespolone od n = 8, rzeczywiste od n = 20;
* ``scipy.linalg.lu_factor``/``lu_solve``, ``numpy.linalg.pinv``/``eigvals``/``cond`` oraz
  ``@`` macierz × macierz i macierz × wektor od n = 150;
* ``scipy.sparse.linalg.splu`` zespolone (SuperLU woła BLAS na superwęzłach) od n = 300.

Liczbę wątków biblioteka czyta ze zmiennej ``OPENBLAS_NUM_THREADS`` przy załadowaniu, więc
proces bez tej zmiennej (generator fixtur uruchomiony z powłoki: 4 wątki na 4 rdzeniach)
i proces z nią (robotnik pytest-xdist, obraz Dockera: 1 wątek) liczyły ten sam model
różnie. Miejsca w rdzeniach, które przestawiły wyniki scen harnessu (sonda: każde wywołanie
liczone przy 1 i przy 4 wątkach na tym samym wejściu):

* ``solvers/short_circuit_core.py`` ``np.linalg.inv(y_bus)`` — Z_bus zwarć i koordynacji
  zabezpieczeń (318 z 318 wywołań różnych);
* ``solvers/power_flow_newton_internal.py`` ``np.linalg.solve(jacobian, mismatch)`` — krok
  Newtona (25 z 27), stąd punkt pracy i ``odcisk_punktu_pracy`` biegu dynamiki;
* ``solvers/state_estimation_wls.py`` ``np.linalg.inv(gain_g)`` i ``np.linalg.inv(g_final)``
  — macierz wzmocnienia estymacji WLS (7 z 7).

Historia procesu (wcześniejsze importy, alokacje przesuwające adresy tablic) NIE zmienia
wyniku przy ustalonej liczbie wątków: przesunięcie argumentów o wielokrotność 16 bajtów
(jedyne, jakie daje alokator — ``malloc`` wyrównuje do 16) nie zmienia żadnego bitu
w jądrach Prescott, Haswell i SkylakeX; przesunięcie o 8 bajtów zmienia ``dot``
i macierz × wektor w jądrze Prescott, ale powstaje wyłącznie z wycinka tablicy, czyli
z kształtu danych, nie z historii procesu. Przypina to ``tests/network_model/
test_determinizm_watkow_blas.py``.

Naprawa: jeden wątek w KAŻDEJ załadowanej bibliotece BLAS, ustawiony w procesie (nie
w otoczeniu), po załadowaniu obu bibliotek. Jeden wątek, bo tyle liczy już obraz Dockera
i robotnik pytest (pomiar PERF-DYN-0: dynamika sieci złotej 1 wątek 42,1 s, 4 wątki
40,5 s — różnica w szumie). Poza zakresem tej polityki zostaje jądro OpenBLAS wybrane dla
procesora maszyny (inna maszyna = inne ostatnie bity) — tę klasę obsługuje tolerancja
międzymaszynowa porównania fixtur (``tests/ci/tolerancja_fikstur.py``).
"""

from __future__ import annotations

# Oba importy ładują biblioteki BLAS, zanim polityka zostanie ustawiona: numpy niesie
# `openblas64_`, scipy własną kopię `scipy_openblas` (z niej korzystają także `scipy.linalg`
# i SuperLU w `scipy.sparse.linalg`). Biblioteka załadowana PO ustawieniu polityki
# miałaby liczbę wątków z otoczenia.
import numpy  # noqa: F401
import scipy.linalg  # noqa: F401
import scipy.sparse.linalg  # noqa: F401
from threadpoolctl import threadpool_info, threadpool_limits

#: Liczba wątków każdej biblioteki BLAS procesu liczącego fizykę.
LICZBA_WATKOW_BLAS = 1


def biblioteki_blas() -> list[dict[str, object]]:
    """Załadowane biblioteki BLAS procesu (ścieżka, interfejs, liczba wątków)."""
    return [biblioteka for biblioteka in threadpool_info() if biblioteka["user_api"] == "blas"]


def przypnij_watki_blas() -> None:
    """Ustaw `LICZBA_WATKOW_BLAS` w każdej załadowanej bibliotece BLAS i sprawdź skutek.

    Brak biblioteki albo biblioteka, która nie przyjęła ustawienia, to błąd procesu, a nie
    ciche liczenie z liczbą wątków otoczenia."""
    threadpool_limits(limits=LICZBA_WATKOW_BLAS, user_api="blas")
    biblioteki = biblioteki_blas()
    if not biblioteki:
        raise RuntimeError("brak załadowanej biblioteki BLAS — polityki wątków nie ustawiono")
    odstajace = [b for b in biblioteki if b["num_threads"] != LICZBA_WATKOW_BLAS]
    if odstajace:
        raise RuntimeError(
            f"biblioteki BLAS bez polityki {LICZBA_WATKOW_BLAS} wątku: "
            + ", ".join(f"{b['filepath']} ({b['num_threads']})" for b in odstajace)
        )


przypnij_watki_blas()
