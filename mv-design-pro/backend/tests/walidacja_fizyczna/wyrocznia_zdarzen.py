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

3. **Lokalizacja zdarzen warunkowych (D-12).** (a) Rampa amplitudy SEM przez prog:
   `t = t_0 + (prog - m_0)/tempo` w postaci zamknietej. (b) Czlon inercyjny pierwszego
   rzedu `dx/dt = (x_inf - x)/T` calkowany trapezem: JEDEN krok dlugosci `tau` z punktu
   `x_n` daje `x(tau) = x_inf + (x_n - x_inf) (1 - tau/2T)/(1 + tau/2T)` — pierwiastek
   TRAJEKTORII DYSKRETNEJ `x(tau) = prog` ma postac zamknieta
   `tau = 2T (1 - d)/(1 + d)`, `d = (prog - x_inf)/(x_n - x_inf)`, a wezly kroku staly
   `x_n = x_inf + (x_0 - x_inf) r^n`, `r = (1 - h/2T)/(1 + h/2T)`.

4. **Profil zrodla testowego (D-14).** Amplituda SEM odcinkami liniowa, odchylka pulsacji
   odcinkami liniowa, kat — calka odchylki (odcinkami kwadratowy), przesuniecie fazy —
   suma skokow. Postac zamknieta liczona wprost z listy segmentow, bez rozwijania na
   przypisania stanow (inna droga niz rdzen).
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


def chwila_przeciecia_rampy(m_0: float, t_0: float, tempo: float, prog: float) -> float:
    """Chwila, w ktorej rampa `m(t) = m_0 + tempo (t - t_0)` osiaga `prog` (postac zamknieta)."""
    return t_0 + (prog - m_0) / tempo


def wezel_trajektorii_trapezu(
    x_0: float, x_inf: float, stala_czasowa_s: float, krok_s: float, n: int
) -> float:
    """`x_n` trapezu dla czlonu `dx/dt = (x_inf - x)/T` przy kroku stalym `h`."""
    r = (1.0 - krok_s / (2.0 * stala_czasowa_s)) / (1.0 + krok_s / (2.0 * stala_czasowa_s))
    return x_inf + (x_0 - x_inf) * r**n


def pierwiastek_kroku_trapezu(
    x_n: float, x_inf: float, stala_czasowa_s: float, prog: float
) -> float:
    """`tau` JEDNEGO kroku trapezu z `x_n`, dla ktorego `x(tau) = prog` (postac zamknieta)."""
    d = (prog - x_inf) / (x_n - x_inf)
    return 2.0 * stala_czasowa_s * (1.0 - d) / (1.0 + d)


def profil_zamkniety(
    segmenty: tuple[tuple[str, float, float, float], ...],
    *,
    m_0: float,
    kat_0_rad: float,
    f_n_hz: float,
    t_s: float,
    strona: str,
) -> tuple[float, float, float]:
    """(amplituda, kat calkowity theta + phi [rad], odchylka pulsacji [pu]) w chwili `t_s`.

    `segmenty`: (`rodzaj`, `t_poczatku`, `wartosc`, `czas_trwania`) z rodzajem `skok_u`
    (wartosc = amplituda), `rampa_u` (wartosc = tempo pu/s), `skok_f` (wartosc = odchylka
    Hz), `rampa_f` (wartosc = tempo Hz/s), `skok_fazy` (wartosc = przyrost w stopniach).
    `strona` rozstrzyga wartosc W CHWILI segmentu: `L` — przed nim, `P`/`C` — po nim.
    Calka odchylki liczona odcinkami w postaci zamknietej (bez calkowania numerycznego).
    """
    omega_0 = 2.0 * math.pi * f_n_hz

    def po(t_segmentu: float) -> bool:
        return t_s > t_segmentu or (t_s == t_segmentu and strona != "L")

    zdarzenia: list[tuple[float, str, float]] = []
    for rodzaj, t_0, wartosc, czas in segmenty:
        if rodzaj == "rampa_u":
            zdarzenia += [(t_0, "tempo_u", wartosc), (t_0 + czas, "tempo_u", 0.0)]
        elif rodzaj == "rampa_f":
            zdarzenia += [(t_0, "tempo_f", wartosc), (t_0 + czas, "tempo_f", 0.0)]
        elif rodzaj == "skok_u":
            zdarzenia.append((t_0, "u", wartosc))
        elif rodzaj == "skok_f":
            zdarzenia.append((t_0, "f", wartosc))
        elif rodzaj == "skok_fazy":
            zdarzenia.append((t_0, "faza", wartosc))
        else:  # pragma: no cover — lista zamknieta
            raise ValueError(rodzaj)
    # Koniec rampy przed poczatkiem nastepnej w tej samej chwili (tempo zero, potem nowe).
    kolejnosc = {"tempo_u": 0, "tempo_f": 0}
    zdarzenia.sort(key=lambda z: (z[0], kolejnosc.get(z[1], 1) if z[2] == 0.0 else 1))
    m, tempo_u = m_0, 0.0
    odchylka_hz, tempo_f = 0.0, 0.0
    kat, faza_deg = kat_0_rad, 0.0
    t_biezace = 0.0
    for t_z, rodzaj, wartosc in zdarzenia:
        if not po(t_z):
            break
        dt = t_z - t_biezace
        m += tempo_u * dt
        kat += omega_0 * (odchylka_hz * dt + 0.5 * tempo_f * dt * dt) / f_n_hz
        odchylka_hz += tempo_f * dt
        t_biezace = t_z
        if rodzaj == "tempo_u":
            tempo_u = wartosc
        elif rodzaj == "tempo_f":
            tempo_f = wartosc
        elif rodzaj == "u":
            m = wartosc
        elif rodzaj == "f":
            odchylka_hz = wartosc
        else:
            faza_deg += wartosc
    dt = t_s - t_biezace
    m += tempo_u * dt
    kat += omega_0 * (odchylka_hz * dt + 0.5 * tempo_f * dt * dt) / f_n_hz
    odchylka_hz += tempo_f * dt
    return m, kat + math.radians(faza_deg), odchylka_hz / f_n_hz


__all__ = [
    "chwila_przeciecia_rampy",
    "miejsce_odizolowane",
    "napiecie_odbioru_stalej_mocy",
    "pierwiastek_kroku_trapezu",
    "profil_zamkniety",
    "wezel_trajektorii_trapezu",
]
