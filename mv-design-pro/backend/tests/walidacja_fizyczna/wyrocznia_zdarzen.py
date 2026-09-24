"""WYROCZNIA ZDARZEN TOPOLOGICZNYCH — niezalezna od rdzenia dynamiki (karta AB-1b.1, P10).

ZERO importow z `network_model.solvers.dynamika` (sprawdza `test_manifest.py`): wyrocznia
dzielaca kod z produktem potwierdzalaby produkt jego wlasnym bledem. Dwie drogi:

1. **Obszar beznapieciowy i ponowne zasilenie (D-16).** Uklad dwuwezlowy: zrodlo o SEM
   `E` za impedancja `Z_s`, linia `z` i odbior o stalej mocy `S` na koncu. Po zamknieciu
   linii napiecie odbioru spelnia `E conj(V) - |V|^2 = Z conj(S)` (`Z = Z_s + z`). Dla
   `E` rzeczywistego, z `C = Z conj(S)` i `u = |V|^2`:

       u^2 + (2 Re C - E^2) u + |C|^2 = 0 ,

   a kat z `-E |V| sin(theta) = Im C`, `E |V| cos(theta) = |V|^2 + Re C`. Rozwiazaniem
   FIZYCZNYM jest pierwiastek WYZSZY (galaz stabilna charakterystyki P-U); nizszy lezy
   na galezi niestabilnej i jest osiagalny dla Newtona startujacego „od zera".

2. **Predykat izolacji (D-17).** Spojnosc grafu stanu t+ (`networkx`, bez kodu rdzenia):
   miejsce zwarcia jest odizolowane wtedy i tylko wtedy, gdy jego skladowa spojna grafu
   galezi AKTYWNYCH nie zawiera zadnego wezla z urzadzeniem wnoszacym prad.
"""

from __future__ import annotations

import cmath
import math
from collections.abc import Iterable

import networkx as nx


def napiecie_odbioru_stalej_mocy(
    sem: complex, impedancja: complex, moc: complex
) -> tuple[complex, complex]:
    """(pierwiastek wyzszy, pierwiastek nizszy) napiecia odbioru za impedancja od SEM.

    Kat SEM jest dowolny: rownanie rozwiazuje sie w ukladzie obroconym o `arg(E)` i
    wynik obraca z powrotem — obrot nie zmienia modulu, wiec `u` jest niezmiennicze.
    """
    obrot = cmath.exp(1j * cmath.phase(sem))
    e = abs(sem)
    c = impedancja * moc.conjugate()
    b = 2.0 * c.real - e * e
    delta = b * b - 4.0 * abs(c) ** 2
    if delta < 0.0:
        raise ValueError("Brak rozwiazania: moc odbioru ponad granica przesylu (nos krzywej P-U)")
    pierwiastki = []
    for u in ((-b + math.sqrt(delta)) / 2.0, (-b - math.sqrt(delta)) / 2.0):
        modul = math.sqrt(u)
        sinus = -c.imag / (e * modul)
        cosinus = (u + c.real) / (e * modul)
        pierwiastki.append(modul * complex(cosinus, sinus) * obrot)
    return pierwiastki[0], pierwiastki[1]


def miejsce_odizolowane(
    wezly: Iterable[str],
    galezie_aktywne: Iterable[tuple[str, str]],
    wezly_ze_zrodlem: Iterable[str],
    miejsce: str,
) -> bool:
    """Czy wezel `miejsce` lezy w skladowej spojnej grafu BEZ zadnego zrodla."""
    graf = nx.Graph()
    graf.add_nodes_from(wezly)
    graf.add_edges_from(galezie_aktywne)
    skladowa = nx.node_connected_component(graf, miejsce)
    return not (skladowa & set(wezly_ze_zrodlem))


__all__ = ["miejsce_odizolowane", "napiecie_odbioru_stalej_mocy"]
