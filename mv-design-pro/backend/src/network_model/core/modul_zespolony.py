"""Moduł liczby zespolonej niezależny od biblioteki matematycznej platformy.

Moduł liściowy (importuje wyłącznie ``math``): korzystają z niego solvery zwarć i pętli
zwarcia oraz modele maszyn ``network_model/core`` bez cyklu importu przez gorliwe
``network_model/solvers/__init__.py``.
"""

from __future__ import annotations

import math


def modul_zespolony(z: complex) -> float:
    """|z| niezależny od biblioteki matematycznej platformy — JEDYNE źródło modułu liczby
    zespolonej w solverach zwarć i pętli zwarcia (rdzeń IEC 60909, wkłady źródeł, zwarcia
    niesymetryczne, maszyny, pętla TN/TT/IT IEC 60364): prąd, impedancja, współczynnik
    przeniesienia, kierunek. Pin zamknięcia listy: ``test_modul_zespolony_platformy.py``.

    ``abs()`` liczby zespolonej (``complex`` i skalar ``numpy.complex128``) woła ``hypot``
    z libm. glibc w wariancie amd64v3 (Ubuntu 26.04 na procesorze z FMA — obraz runnera CI
    ``ubuntu-26.04``) liczy ``hypot`` jądrem z FMA i różni się od wariantu bazowego o 1 ulp
    w ok. 12 % argumentów (sonda 200 000 par, glibc 2.43 amd64 wobec amd64v3) — ten sam
    bieg dawał na dwóch maszynach różne ostatnie bity I_k'' i różne odciski wyniku.
    ``math.hypot`` to własny algorytm CPython na działaniach IEEE 754 (+, −, ×, ÷, √), bit
    w bit ten sam na każdej platformie. Pozostałe funkcje libm rdzenia (exp, log, atan2,
    sin, cos, pow, sqrt) dały w tej samej sondzie zero różnic. Porównania ``abs(z) == 0``
    zostają przy ``abs``: zero modułu nie zależy od implementacji ``hypot``."""
    return math.hypot(z.real, z.imag)
