"""Składowe symetryczne — impedancja własna i wzajemna gałęzi z impedancji
składowej zgodnej i zerowej (karta W5-D, §1 p. 7 karty W5; algebra wielkości
pochodnych, CV-4.3 K4, konstytucja C.2.3).

Po co: solver FROZEN ``network_model/solvers/power_flow_unbalanced.py`` przyjmuje
gałąź jako parę (impedancja własna fazy, impedancja wzajemna między fazami)
w kontrakcie ``UnbalancedBranchSpec`` — model ENM niesie natomiast impedancję
składowej zgodnej Z₁ (``r_ohm_per_km``/``x_ohm_per_km``) i zerowej Z₀
(``r0_ohm_per_km``/``x0_ohm_per_km``). Dla linii transponowanej (macierz
impedancji fazowych z jednakową przekątną Z_s i jednakowymi wyrazami
pozadiagonalnymi Z_m) transformacja Fortescue daje dokładnie:

    Z₁ = Z_s − Z_m,   Z₀ = Z_s + 2·Z_m
    ⇒ Z_s = (Z₀ + 2·Z₁)/3,   Z_m = (Z₀ − Z₁)/3

(Kersting, „Distribution System Modeling and Analysis", 2. wyd., rozdz. 4;
Anderson, „Analysis of Faulted Power Systems", rozdz. 2). Odwrotność (Z₁, Z₀ z
Z_s, Z_m) też jest tutaj — test tożsamości sprawdza, że złożenie obu jest
identycznością bit w bit na liczbach z rejestru sieci.

Reguły (K4.1/K4.5): moduł importuje WYŁĄCZNIE ``cmath``/``math`` — liść grafu
importów jak siostrzany ``wielkosci_pochodne.py``; czyste funkcje bez decyzji
(brak Z₀ rozstrzyga WOŁAJĄCY odmową nazwaną — tu nie ma żadnej wartości
domyślnej, w szczególności NIE ma podstawienia Z₀ = Z₁). Wynik dla obciążenia
symetrycznego nie zależy od Z₀ (suma prądów faz = 0 ⇒ spadek na fazie =
(Z_s − Z_m)·I = Z₁·I) — pilnuje tego test klasy w
``tests/enm/test_rozplyw_niesymetryczny_symetria.py``.
"""

from __future__ import annotations


def impedancja_wlasna_ohm(z0_ohm: complex, z1_ohm: complex) -> complex:
    """Impedancja własna fazy: Z_s = (Z₀ + 2·Z₁)/3 [Ω] (spójna jednostka obu wejść)."""
    return (z0_ohm + 2.0 * z1_ohm) / 3.0


def impedancja_wzajemna_ohm(z0_ohm: complex, z1_ohm: complex) -> complex:
    """Impedancja wzajemna między fazami: Z_m = (Z₀ − Z₁)/3 [Ω]."""
    return (z0_ohm - z1_ohm) / 3.0


def impedancja_zgodna_ohm(z_s_ohm: complex, z_m_ohm: complex) -> complex:
    """Odwrotność: składowa zgodna Z₁ = Z_s − Z_m [Ω]."""
    return z_s_ohm - z_m_ohm


def impedancja_zerowa_ohm(z_s_ohm: complex, z_m_ohm: complex) -> complex:
    """Odwrotność: składowa zerowa Z₀ = Z_s + 2·Z_m [Ω]."""
    return z_s_ohm + 2.0 * z_m_ohm
