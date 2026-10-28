"""
Rotating-machine short-circuit contributions — IEC 60909-0:2016 §6.6.

This module is the "full machine model" layer on top of the (UNTOUCHED, frozen)
short-circuit core. The machine impedances are already in the Y-bus (see
``ybus.AdmittanceMatrixBuilder._add_machine_shunts``), so the frozen core already
yields the correct initial symmetrical current I″k, peak ip, and thermal ith for any
network containing machines. What the frozen core does NOT do — and what this module
adds — is the PER-MACHINE breakdown and the symmetrical BREAKING current i_b, which
requires the machine-specific decay factors μ and, for asynchronous motors, q
(IEC 60909-0:2016 pkt 9.1.1 wzór (67) rys. 13 oraz pkt 9.1.2 wzór (69) rys. 14: krzywe węzłów
t_min, między węzłami interpolacja liniowa po t_min — dla μ dopuszczona jawnie przez pkt 9.1.1,
dla q interpretacja inżynierska, `podstawa_reguly`; `slad_mu` / `slad_q`). It also applies the
small-motor omission rule.

WHITE BOX: every partial current is derived from the Z-bus by superposition —
    I_partial,m = c · Z_mk / (Z_kk · Z_m)   (referred to the fault-bus current base)
— which for a machine AT the fault bus reduces exactly to the terminal value c·Un/
(√3·Z″). All intermediate values (Z_mk, Z_kk, Z_m, μ, q) are exposed and auditable.

This file is NEW (not one of the 7 frozen solver files); it CALLS the frozen
``build_zbus`` read-only and never mutates the core.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from typing import Any, Final, Literal

from network_model.core.graph import NetworkGraph
from network_model.core.impedancja_przejscia import (
    OPISY_ODMOW_IMPEDANCJI,
    impedancja_przejscia_obliczeniowa,
    kod_odmowy_impedancji,
)
from network_model.core.machine import AsynchronousMachineSource, SynchronousMachineSource
from network_model.core.modul_zespolony import modul_zespolony
from network_model.core.ybus import S_BASE_MVA
from network_model.nazwy import opis_rodzaju_i_nazwy
from network_model.odmowa_danych import (
    RODZAJ_WEZEL,
    OdmowaWejsciaRdzenia,
    OdwolanieElementu,
    RekordOdmowy,
    odmowa_rdzenia_b01,
)
from network_model.solvers.short_circuit_core import (
    build_zbus,
    odmowa_wezla_zwarcia_spoza_grafu,
)

_SQRT3 = math.sqrt(3.0)


# ── Krzywe zaniku μ i q (IEC 60909-0:2016 pkt 9.1.1 i 9.1.2) ────────────────────────────────
#
# Norma podaje krzywe μ (zanik składowej okresowej maszyny synchronicznej i asynchronicznej;
# pkt 9.1.1, wzór (67), rysunek 13) oraz q (dodatkowy zanik maszyny asynchronicznej; pkt 9.1.2,
# wzór (69), rysunek 14) dla czterech wartości minimalnego czasu zwłoki t_min: 0,02 / 0,05 /
# 0,10 / ≥ 0,25 s. Podstawa reguły pomiędzy węzłami NIE jest wspólna dla μ i q:
#
#   μ — pkt 9.1.1 dopuszcza interpolację wprost: „For other values of minimum time delay, linear
#       interpolation between curves is acceptable." (podstawa normowa, jawna);
#   q — pkt 9.1.2 tego zezwolenia nie powtarza. Interpolacja liniowa po t_min między krzywymi
#       sąsiednich węzłów rysunku 14 jest metodą numeryczną spójną z ich parametryzacją
#       (te same węzły t_min, q ≤ 1), ale jest INTERPRETACJĄ INŻYNIERSKĄ, nie zapisem normy.
#
# Algorytm jest jeden dla obu wielkości (reguła węzeł / interpolacja / zakres, liczby bez zmian
# od karty MU-INTERPOLACJA); podstawę każdej pary (wielkość, reguła) podaje JEDNA tablica
# `PODSTAWY_REGUL_KRZYWYCH` — czyta ją ślad, wywód, dowód SC3F i rejestr równań. Interpoluje się
# po t_min, nigdy po krotności prądu ani po mocy silnika; interpoluje się WARTOŚCI krzywych obu
# sąsiednich węzłów (już przyciętych do [0; 1], tak jak krzywe na rysunkach normy), nie
# współczynniki a, b, c:
#
#     X(t_min) = X(t₁) + (t_min − t₁)/(t₂ − t₁) · (X(t₂) − X(t₁)),   t₁ < t_min < t₂.
#
# Poza zakresem węzłów: t_min ≥ 0,25 s → krzywa 0,25 s (norma: „t_min ≥ 0,25 s");
# t_min < 0,02 s → krzywa 0,02 s (norma krzywych poniżej 0,02 s nie podaje — interpretacja
# inżynierska). W węźle wynik jest wartością krzywej węzła bez żadnej arytmetyki interpolacji.
#
# Wydanie: brzmienie pkt 9.1.1 i 9.1.2 zweryfikowane przez właściciela w wydaniu 2016
# (s. 53–55); `UWAGA_WYDANIA_NORMY_KRZYWYCH` i rejestr dostaw danych właściciela
# (`docs/plan/DANE_WLASCICIELA_O59_2026-09.md`, pakiet P-N).

#: Węzły krzywej μ = a + b·e^(−c·I″k/I_r): (t_min [s], (a, b, c)) — JEDYNA tablica krzywych μ
#: w programie (solver liczy, dowód SC3F czyta ślad `SladKrzywejZaniku`).
WEZLY_KRZYWEJ_MU: tuple[tuple[float, tuple[float, float, float]], ...] = (
    (0.02, (0.84, 0.26, 0.26)),
    (0.05, (0.71, 0.51, 0.30)),
    (0.10, (0.62, 0.72, 0.32)),
    (0.25, (0.56, 0.94, 0.38)),
)

#: Węzły krzywej q = a + b·ln m: (t_min [s], (a, b)) — JEDYNA tablica krzywych q w programie.
WEZLY_KRZYWEJ_Q: tuple[tuple[float, tuple[float, float]], ...] = (
    (0.02, (1.03, 0.12)),
    (0.05, (0.79, 0.12)),
    (0.10, (0.57, 0.12)),
    (0.25, (0.26, 0.10)),
)

#: Reguły wyznaczenia współczynnika (pole `SladKrzywejZaniku.regula`).
#: μ: I″k/I_r ≤ 2 (zwarcie odległe od generatora) → μ = 1 przy każdym t_min;
#: q: m ≤ 0 (brak mocy na parę biegunów) → q = 1.
REGULA_BEZ_ZANIKU = "BEZ_ZANIKU"
#: t_min równy węzłowi normy — wartość krzywej węzła.
REGULA_WEZEL = "WEZEL"
#: t_min między sąsiednimi węzłami — interpolacja liniowa wartości krzywych obu węzłów.
REGULA_INTERPOLACJA = "INTERPOLACJA"
#: t_min < 0,02 s — krzywa najkrótszego węzła 0,02 s.
REGULA_PONIZEJ_ZAKRESU = "PONIZEJ_ZAKRESU"
#: t_min > 0,25 s — krzywa węzła 0,25 s (norma: „t_min ≥ 0,25 s").
REGULA_POWYZEJ_ZAKRESU = "POWYZEJ_ZAKRESU"

#: Odwołanie normowe krzywych per wielkość (ślad, wywód, dowód SC3F, rejestr równań).
NORMA_KRZYWYCH_ZANIKU: dict[str, str] = {
    "mu": "IEC 60909-0:2016 pkt 9.1.1, wzór (67), rys. 13",
    "q": "IEC 60909-0:2016 pkt 9.1.2, wzór (69), rys. 14",
}

#: Stan wydania normy krzywych — zapis źródła (rejestr: `DANE_WLASCICIELA_O59_2026-09.md` P-N).
UWAGA_WYDANIA_NORMY_KRZYWYCH = (
    "IEC 60909-0:2026 (wyd. 3.0) zastępuje 2016; brzmienie pkt 9.1.1/9.1.2 wyd. 2026 "
    "niezweryfikowane"
)

#: Podstawa reguły (pole śladu `podstawa_reguly`) — słownik rodzajów źródła kontraktu werdyktu
#: (§3c: `NORMA` / `ZALOZENIE_INZYNIERSKIE`): zapis normy albo jawne założenie inżynierskie.
PODSTAWA_NORMA: Final = "NORMA"
PODSTAWA_ZALOZENIE_INZYNIERSKIE: Final = "ZALOZENIE_INZYNIERSKIE"
RodzajPodstawyKrzywej = Literal["NORMA", "ZALOZENIE_INZYNIERSKIE"]

#: Cytat zezwolenia na interpolację krzywych μ (IEC 60909-0:2016 pkt 9.1.1, s. 53–55).
CYTAT_INTERPOLACJI_MU = (
    "For other values of minimum time delay, linear interpolation between curves is acceptable."
)


@dataclass(frozen=True)
class PodstawaRegulyKrzywej:
    """Podstawa jednej pary (wielkość, reguła) — JEDNO źródło tekstu podstawy.

    ``rodzaj_zrodla`` — ``PODSTAWA_NORMA`` albo ``PODSTAWA_ZALOZENIE_INZYNIERSKIE`` (nazwa pola
    jak w ``catalog.wartosci_robocze``: rodzaj źródła wartości, nie werdykt); ``norma`` —
    punkt, wzór i rysunek wielkości; ``opis_pl`` — zdanie podstawy (ślad, wywód); ``skrot_pl`` —
    ta sama podstawa krótko, bez znaków specjalnych LaTeX-a (dowód SC3F w ``\\text{}``,
    rejestr równań).
    """

    rodzaj_zrodla: RodzajPodstawyKrzywej
    norma: str
    opis_pl: str
    skrot_pl: str


def _podstawy_regul() -> dict[tuple[str, str], PodstawaRegulyKrzywej]:
    mu, q = NORMA_KRZYWYCH_ZANIKU["mu"], NORMA_KRZYWYCH_ZANIKU["q"]
    ponizej = (
        "interpretacja inżynierska: norma nie podaje krzywych dla t_min < 0,02 s, przyjęto "
        "krzywą t_min = 0,02 s"
    )
    return {
        ("mu", REGULA_WEZEL): PodstawaRegulyKrzywej(
            PODSTAWA_NORMA,
            mu,
            f"wartość krzywej węzła t_min ({mu})",
            "krzywa normy, IEC 60909-0:2016 pkt 9.1.1",
        ),
        ("mu", REGULA_POWYZEJ_ZAKRESU): PodstawaRegulyKrzywej(
            PODSTAWA_NORMA,
            mu,
            f"krzywa normy dla t_min ≥ 0,25 s ({mu})",
            "krzywa normy dla czasu zwłoki od 0,25 s, IEC 60909-0:2016 pkt 9.1.1",
        ),
        ("mu", REGULA_PONIZEJ_ZAKRESU): PodstawaRegulyKrzywej(
            PODSTAWA_ZALOZENIE_INZYNIERSKIE,
            mu,
            f"{ponizej} ({mu})",
            "interpretacja inżynierska: poniżej 0,02 s krzywa 0,02 s, IEC 60909-0:2016 pkt 9.1.1",
        ),
        ("mu", REGULA_INTERPOLACJA): PodstawaRegulyKrzywej(
            PODSTAWA_NORMA,
            mu,
            "interpolacja liniowa między krzywymi μ dopuszczona jawnie przez IEC 60909-0:2016 "
            f"pkt 9.1.1: „{CYTAT_INTERPOLACJI_MU}”",
            "interpolacja liniowa między krzywymi dopuszczona przez IEC 60909-0:2016 pkt 9.1.1",
        ),
        ("mu", REGULA_BEZ_ZANIKU): PodstawaRegulyKrzywej(
            PODSTAWA_NORMA,
            mu,
            f"μ = 1 przy każdym t_min dla I″k/I_r ≤ 2, zwarcie odległe od generatora ({mu})",
            "zwarcie odległe od generatora, IEC 60909-0:2016 pkt 9.1.1",
        ),
        ("q", REGULA_WEZEL): PodstawaRegulyKrzywej(
            PODSTAWA_NORMA,
            q,
            f"wartość krzywej węzła t_min ({q})",
            "krzywa normy, IEC 60909-0:2016 pkt 9.1.2",
        ),
        ("q", REGULA_POWYZEJ_ZAKRESU): PodstawaRegulyKrzywej(
            PODSTAWA_NORMA,
            q,
            f"krzywa normy dla t_min ≥ 0,25 s ({q})",
            "krzywa normy dla czasu zwłoki od 0,25 s, IEC 60909-0:2016 pkt 9.1.2",
        ),
        ("q", REGULA_PONIZEJ_ZAKRESU): PodstawaRegulyKrzywej(
            PODSTAWA_ZALOZENIE_INZYNIERSKIE,
            q,
            f"{ponizej} ({q})",
            "interpretacja inżynierska: poniżej 0,02 s krzywa 0,02 s, IEC 60909-0:2016 pkt 9.1.2",
        ),
        ("q", REGULA_INTERPOLACJA): PodstawaRegulyKrzywej(
            PODSTAWA_ZALOZENIE_INZYNIERSKIE,
            q,
            "interpretacja inżynierska: IEC 60909-0:2016 pkt 9.1.2 nie przewiduje interpolacji "
            "między krzywymi q; przyjęto interpolację liniową po t_min między krzywymi "
            f"sąsiednich węzłów, spójną z krzywymi {q} (q ≤ 1)",
            "interpolacja liniowa po czasie zwłoki: interpretacja inżynierska, IEC 60909-0:2016 "
            "pkt 9.1.2 jej nie przewiduje",
        ),
        ("q", REGULA_BEZ_ZANIKU): PodstawaRegulyKrzywej(
            PODSTAWA_ZALOZENIE_INZYNIERSKIE,
            q,
            f"interpretacja inżynierska: wzór (69) nie jest określony dla m ≤ 0 (ln m) — "
            f"przyjęto q = 1, brak dodatkowego zaniku, zachowawczo dla I_b ({q})",
            "interpretacja inżynierska: m niedodatnie, q = 1, IEC 60909-0:2016 pkt 9.1.2",
        ),
    }


#: JEDNA tablica podstaw: (wielkość, reguła) → podstawa. Każda reguła × każda wielkość.
PODSTAWY_REGUL_KRZYWYCH: dict[tuple[str, str], PodstawaRegulyKrzywej] = _podstawy_regul()


def podstawa_reguly(wielkosc: str, regula: str) -> PodstawaRegulyKrzywej:
    """Podstawa pary (wielkość, reguła) z jedynej tablicy `PODSTAWY_REGUL_KRZYWYCH`."""
    return PODSTAWY_REGUL_KRZYWYCH[(wielkosc, regula)]


@dataclass(frozen=True)
class WezelKrzywejZaniku:
    """Jeden węzeł krzywej normy użyty w biegu (WHITE BOX).

    ``wspolczynniki`` — (a, b, c) krzywej μ albo (a, b) krzywej q; ``wartosc_surowa`` — wartość
    wzoru węzła przed przycięciem; ``wartosc`` — wartość węzła przycięta do [0; 1] (krzywa
    z rysunku normy), wchodząca do interpolacji.
    """

    t_min_s: float
    wspolczynniki: tuple[float, ...]
    wartosc_surowa: float
    wartosc: float

    def to_dict(self) -> dict:
        return {
            "t_min_s": float(self.t_min_s),
            "wspolczynniki": [float(w) for w in self.wspolczynniki],
            "wartosc_surowa": float(self.wartosc_surowa),
            "wartosc": float(self.wartosc),
        }


@dataclass(frozen=True)
class SladKrzywejZaniku:
    """Ślad wyznaczenia μ albo q przy t_min biegu — JEDNA funkcja liczy, dowód tylko czyta.

    ``wielkosc`` — ``"mu"`` albo ``"q"``; ``argument`` — I″k/I_r (μ) albo m [MW] (q);
    ``regula`` — jedna z ``REGULA_*``. Dla reguł węzłowych (``WEZEL``, ``PONIZEJ_ZAKRESU``,
    ``POWYZEJ_ZAKRESU``) oba węzły są tym samym węzłem, a ``waga`` = 0; dla ``INTERPOLACJA``
    ``waga`` = (t_min − t₁)/(t₂ − t₁) ∈ (0; 1); dla ``BEZ_ZANIKU`` węzłów brak (``None``).

    ``podstawa`` (karta PODSTAWA-Q) — WYPROWADZONA z pary (``wielkosc``, ``regula``) przez
    `podstawa_reguly`, nie przechowywana osobno: status podstawy nie może rozjechać się z regułą,
    która dała liczbę (predykaty parami).
    """

    wielkosc: str
    t_min_s: float
    argument: float
    regula: str
    wezel_dolny: WezelKrzywejZaniku | None
    wezel_gorny: WezelKrzywejZaniku | None
    waga: float
    wynik: float

    @property
    def podstawa(self) -> PodstawaRegulyKrzywej:
        return podstawa_reguly(self.wielkosc, self.regula)

    def to_dict(self) -> dict:
        podstawa = self.podstawa
        return {
            "wielkosc": self.wielkosc,
            "norma": podstawa.norma,
            "t_min_s": float(self.t_min_s),
            "argument": float(self.argument),
            "regula": self.regula,
            # Karta PODSTAWA-Q (addytywnie): status i zdanie podstawy reguły — `NORMA` albo
            # `ZALOZENIE_INZYNIERSKIE` (interpolacja q, krzywa 0,02 s poniżej zakresu, q przy m ≤ 0).
            "podstawa_reguly": podstawa.rodzaj_zrodla,
            "podstawa_reguly_pl": podstawa.opis_pl,
            "wezel_dolny": None if self.wezel_dolny is None else self.wezel_dolny.to_dict(),
            "wezel_gorny": None if self.wezel_gorny is None else self.wezel_gorny.to_dict(),
            "waga": float(self.waga),
            "wynik": float(self.wynik),
        }


def _wartosc_krzywej_mu(wspolczynniki: tuple[float, ...], ratio_ik_ir: float) -> float:
    a, b, c = wspolczynniki
    return a + b * math.exp(-c * ratio_ik_ir)


def _wartosc_krzywej_q(wspolczynniki: tuple[float, ...], p_per_pole_mw: float) -> float:
    a, b = wspolczynniki
    return a + b * math.log(p_per_pole_mw)


def _slad_krzywej(
    *,
    wielkosc: str,
    t_min_s: float,
    argument: float,
    wezly: tuple[tuple[float, tuple[float, ...]], ...],
    wartosc_krzywej: Callable[[tuple[float, ...], float], float],
) -> SladKrzywejZaniku:
    """Reguła węzeł / interpolacja / zakres — wspólna dla μ i q (jedno źródło prawdy)."""
    if not (isinstance(t_min_s, int | float) and math.isfinite(t_min_s) and t_min_s > 0.0):
        # t_min = t_b punktu jest rozstrzygnięte i sprawdzone przed rdzeniem (karta
        # TB-WARTOSC-ROBOCZA); niefizyczna liczba tutaj to błąd wołającego, nie krzywa.
        raise ValueError(
            f"Minimalny czas zwłoki t_min = {t_min_s!r} s nie jest dodatnią liczbą skończoną — "
            f"krzywej {wielkosc} ({NORMA_KRZYWYCH_ZANIKU[wielkosc]}) nie da się wyznaczyć."
        )

    def wezel(indeks: int) -> WezelKrzywejZaniku:
        t_wezla, wspolczynniki = wezly[indeks]
        surowa = wartosc_krzywej(wspolczynniki, argument)
        return WezelKrzywejZaniku(
            t_min_s=t_wezla,
            wspolczynniki=wspolczynniki,
            wartosc_surowa=surowa,
            wartosc=min(1.0, max(0.0, surowa)),
        )

    def jeden_wezel(indeks: int, regula: str) -> SladKrzywejZaniku:
        w = wezel(indeks)
        return SladKrzywejZaniku(
            wielkosc=wielkosc,
            t_min_s=t_min_s,
            argument=argument,
            regula=regula,
            wezel_dolny=w,
            wezel_gorny=w,
            waga=0.0,
            wynik=w.wartosc,
        )

    if t_min_s < wezly[0][0]:
        return jeden_wezel(0, REGULA_PONIZEJ_ZAKRESU)
    if t_min_s > wezly[-1][0]:
        return jeden_wezel(len(wezly) - 1, REGULA_POWYZEJ_ZAKRESU)
    for indeks, (t_wezla, _) in enumerate(wezly):
        if t_min_s == t_wezla:
            return jeden_wezel(indeks, REGULA_WEZEL)
    for indeks in range(len(wezly) - 1):
        t_1, t_2 = wezly[indeks][0], wezly[indeks + 1][0]
        if t_1 < t_min_s < t_2:
            dolny, gorny = wezel(indeks), wezel(indeks + 1)
            waga = (t_min_s - t_1) / (t_2 - t_1)
            return SladKrzywejZaniku(
                wielkosc=wielkosc,
                t_min_s=t_min_s,
                argument=argument,
                regula=REGULA_INTERPOLACJA,
                wezel_dolny=dolny,
                wezel_gorny=gorny,
                waga=waga,
                wynik=dolny.wartosc + waga * (gorny.wartosc - dolny.wartosc),
            )
    raise AssertionError(f"t_min = {t_min_s!r} s poza pokryciem węzłów krzywej {wielkosc}")


def slad_mu(ratio_ik_ir: float, t_min_s: float) -> SladKrzywejZaniku:
    """Współczynnik zaniku μ składowej okresowej maszyny (IEC 60909-0:2016 pkt 9.1.1) ze śladem.

    ``ratio_ik_ir`` = I″k,m / I_r,m (oba prądy na zaciskach maszyny). μ = 1 dla krotności ≤ 2
    przy każdym t_min (zwarcie odległe od generatora). W przeciwnym razie μ z krzywych
    μ = a + b·e^(−c·I″k/I_r) węzłów t_min = 0,02 / 0,05 / 0,10 / ≥ 0,25 s; dla t_min pomiędzy
    węzłami — interpolacja liniowa wartości krzywych obu sąsiednich węzłów, dopuszczona jawnie
    przez pkt 9.1.1 (`CYTAT_INTERPOLACJI_MU`).

    ``t_min_s`` — t_b punktu zwarcia z pochodzeniem rozstrzygniętym poza rdzeniem (karta
    TB-WARTOSC-ROBOCZA: scenariusz projektanta, najkrótszy czas wyłączenia pól lokalnych albo
    wartość robocza `network_model.core.czas_wylaczenia`); zawsze liczba dodatnia.
    """
    if ratio_ik_ir <= 2.0:
        return SladKrzywejZaniku(
            wielkosc="mu",
            t_min_s=t_min_s,
            argument=ratio_ik_ir,
            regula=REGULA_BEZ_ZANIKU,
            wezel_dolny=None,
            wezel_gorny=None,
            waga=0.0,
            wynik=1.0,
        )
    return _slad_krzywej(
        wielkosc="mu",
        t_min_s=t_min_s,
        argument=ratio_ik_ir,
        wezly=WEZLY_KRZYWEJ_MU,
        wartosc_krzywej=_wartosc_krzywej_mu,
    )


def slad_q(p_per_pole_mw: float, t_min_s: float) -> SladKrzywejZaniku:
    """Dodatkowy współczynnik zaniku q maszyny asynchronicznej (IEC 60909-0:2016 pkt 9.1.2,
    wzór (69), rys. 14) ze śladem. m = moc czynna na parę biegunów [MW]; krzywe q = a + b·ln m
    węzłów t_min; q ∈ [0; 1]. Algorytm węzeł / interpolacja / zakres ten sam co dla μ, ale
    podstawa interpolacji jest inna: pkt 9.1.2 nie przewiduje interpolacji między krzywymi q,
    więc wynik pomiędzy węzłami stoi na interpretacji inżynierskiej (`podstawa_reguly`).
    m ≤ 0 → q = 1 (wzór (69) nie jest tam określony — także interpretacja inżynierska).
    """
    if p_per_pole_mw <= 0.0:
        return SladKrzywejZaniku(
            wielkosc="q",
            t_min_s=t_min_s,
            argument=p_per_pole_mw,
            regula=REGULA_BEZ_ZANIKU,
            wezel_dolny=None,
            wezel_gorny=None,
            waga=0.0,
            wynik=1.0,
        )
    return _slad_krzywej(
        wielkosc="q",
        t_min_s=t_min_s,
        argument=p_per_pole_mw,
        wezly=WEZLY_KRZYWEJ_Q,
        wartosc_krzywej=_wartosc_krzywej_q,
    )


def mu_factor(ratio_ik_ir: float, t_min_s: float) -> float:
    """μ (IEC 60909-0:2016 pkt 9.1.1) — wartość ze śladu `slad_mu`."""
    return slad_mu(ratio_ik_ir, t_min_s).wynik


def q_factor(p_per_pole_mw: float, t_min_s: float) -> float:
    """q (IEC 60909-0:2016 pkt 9.1.2) — wartość ze śladu `slad_q`."""
    return slad_q(p_per_pole_mw, t_min_s).wynik


def _t_pl(t_s: float) -> str:
    """Czas w zdaniu wywodu — dwa miejsca, przecinek dziesiętny."""
    return f"{t_s:.2f}".replace(".", ",")


def _wzor_wezla_latex(slad: SladKrzywejZaniku, wezel: WezelKrzywejZaniku, symbol: str) -> str:
    """Wzór krzywej węzła z podstawieniem i wynikiem (z notą przycięcia do [0; 1])."""
    if slad.wielkosc == "mu":
        a, b, c = wezel.wspolczynniki
        wzor = (
            rf"{symbol} = {a:.2f} + {b:.2f}\,e^{{-{c:.2f}\,I''_k/I_r}}"
            rf" = {a:.2f} + {b:.2f}\,e^{{-{c:.2f} \cdot {slad.argument:.2f}}}"
        )
    else:
        a, b = wezel.wspolczynniki
        wzor = (
            rf"{symbol} = {a:.2f} + {b:.2f}\,\ln m"
            rf" = {a:.2f} + {b:.2f}\,\ln({slad.argument:.3f})"
        )
    wzor += rf" = {wezel.wartosc_surowa:.3f}"
    if abs(wezel.wartosc_surowa - wezel.wartosc) >= 5e-4:
        wzor += rf" \rightarrow {symbol} = {wezel.wartosc:.3f}"
    return wzor


def kroki_krzywej_zaniku(slad: SladKrzywejZaniku) -> tuple[dict, ...]:
    """Kroki wywodu {tekst, latex} wyznaczenia μ albo q — budowane wyłącznie ze śladu.

    Węzeł: jeden krok (krzywa węzła z podstawieniem). Interpolacja: krzywa węzła dolnego,
    krzywa węzła górnego i krok interpolacji z wagą. ``BEZ_ZANIKU``: jeden krok bez krzywej.
    Odwołanie normy i podstawa reguły pochodzą wyłącznie z `slad.podstawa` (jedna tablica):
    interpolacja μ cytuje zezwolenie pkt 9.1.1, interpolacja q mówi „interpretacja inżynierska".
    """
    nazwa = (
        "Współczynnik zaniku μ"
        if slad.wielkosc == "mu"
        else "Współczynnik q silnika asynchronicznego"
    )
    symbol = r"\mu" if slad.wielkosc == "mu" else "q"
    znak = "μ" if slad.wielkosc == "mu" else "q"
    podstawa = slad.podstawa
    if slad.regula == REGULA_BEZ_ZANIKU:
        if slad.wielkosc == "mu":
            return (
                {
                    "tekst": (
                        "Współczynnik zaniku: I″k/Ir ≤ 2 → μ = 1 "
                        f"(zwarcie odległe od generatora, {podstawa.norma})"
                    ),
                    "latex": r"\mu = 1{,}0 \quad (I''_k/I_r \le 2)",
                },
            )
        return (
            {
                "tekst": f"Brak mocy na parę biegunów → q = 1 ({podstawa.opis_pl})",
                "latex": r"q = 1{,}0",
            },
        )
    dolny, gorny = slad.wezel_dolny, slad.wezel_gorny
    if dolny is None or gorny is None:
        raise AssertionError(f"Ślad krzywej {slad.wielkosc} reguły {slad.regula} bez węzłów")
    argument = (
        f"I″k/Ir = {slad.argument:.2f}"
        if slad.wielkosc == "mu"
        else f"m = {slad.argument:.3f} MW na parę biegunów"
    )
    if slad.regula != REGULA_INTERPOLACJA:
        zakres = {
            REGULA_WEZEL: f"krzywa normy t_min = {_t_pl(dolny.t_min_s)} s",
            REGULA_PONIZEJ_ZAKRESU: (
                f"t_min = {_t_pl(slad.t_min_s)} s poniżej najkrótszej krzywej normy — "
                f"krzywa t_min = {_t_pl(dolny.t_min_s)} s"
            ),
            REGULA_POWYZEJ_ZAKRESU: (
                f"t_min = {_t_pl(slad.t_min_s)} s, krzywa normy dla t_min ≥ "
                f"{_t_pl(dolny.t_min_s)} s"
            ),
        }[slad.regula]
        # Podstawa węzła normy = sam wzór i rysunek wielkości; poniżej zakresu — jawne założenie
        # (zdanie podstawy niesie też odwołanie normy).
        zrodlo = podstawa.norma if podstawa.rodzaj_zrodla == PODSTAWA_NORMA else podstawa.opis_pl
        return (
            {
                "tekst": f"{nazwa} ({zakres}, {argument}, {zrodlo}): {znak} = {slad.wynik:.3f}",
                "latex": _wzor_wezla_latex(slad, dolny, symbol),
            },
        )
    t_1, t_2 = _t_pl(dolny.t_min_s), _t_pl(gorny.t_min_s)
    indeks_1 = f"{dolny.t_min_s:.2f}"
    indeks_2 = f"{gorny.t_min_s:.2f}"
    return (
        {
            "tekst": (
                f"{nazwa} — krzywa normy węzła t_min = {t_1} s ({argument}, {podstawa.norma}): "
                f"{znak}({t_1} s) = {dolny.wartosc:.3f}"
            ),
            "latex": _wzor_wezla_latex(slad, dolny, rf"{symbol}_{{{indeks_1}}}"),
        },
        {
            "tekst": (
                f"{nazwa} — krzywa normy węzła t_min = {t_2} s ({argument}, {podstawa.norma}): "
                f"{znak}({t_2} s) = {gorny.wartosc:.3f}"
            ),
            "latex": _wzor_wezla_latex(slad, gorny, rf"{symbol}_{{{indeks_2}}}"),
        },
        {
            "tekst": (
                f"{nazwa}: t_min = {_t_pl(slad.t_min_s)} s leży między krzywymi normy "
                f"{t_1} s i {t_2} s — {podstawa.opis_pl}; waga = {slad.waga:.4f}, "
                f"{znak} = {slad.wynik:.3f}"
            ),
            "latex": (
                rf"{symbol} = {symbol}_{{{indeks_1}}} + "
                rf"\frac{{t_{{min}} - {indeks_1}}}{{{indeks_2} - {indeks_1}}}"
                rf"\left({symbol}_{{{indeks_2}}} - {symbol}_{{{indeks_1}}}\right)"
                rf" = {dolny.wartosc:.3f} + \frac{{{slad.t_min_s:.3f} - {indeks_1}}}"
                rf"{{{indeks_2} - {indeks_1}}} \cdot ({gorny.wartosc:.3f} - {dolny.wartosc:.3f})"
                rf" = {dolny.wartosc:.3f} + {slad.waga:.4f} \cdot "
                rf"({gorny.wartosc:.3f} - {dolny.wartosc:.3f}) = {slad.wynik:.3f}"
            ),
        },
    )


@dataclass(frozen=True)
class MachinePartialContribution:
    """One machine's partial short-circuit contribution at the fault bus."""

    source_id: str
    source_name: str
    machine_type: str  # "SYNCHRONOUS" | "ASYNCHRONOUS" | "DFIG"
    node_id: str
    z_internal_ohm: complex
    ir_a: float
    ikss_partial_a: float  # partial I″k from this machine
    ratio_ik_ir: float
    # μ, q, i_b = μ·q·I″k_partial (q = 1 dla synchronicznej) przy t_min = t_b punktu zwarcia
    # (karta TB-WARTOSC-ROBOCZA: t_b zawsze rozstrzygnięte, z pochodzeniem poza rdzeniem).
    mu: float
    q: float
    ib_a: float
    is_synchronous_machine: bool
    # Karta MU-INTERPOLACJA: ślad wyznaczenia μ i q (węzły krzywych normy, ich wartości, waga
    # interpolacji, wynik) — `mu`/`q` powyżej są jego wynikiem; dowód SC3F czyta ślad, nie
    # liczy krzywych drugi raz. `slad_q` = None dla maszyny synchronicznej (q = 1 bez krzywej).
    slad_mu: SladKrzywejZaniku
    slad_q: SladKrzywejZaniku | None
    p_per_pole_mw: float = 0.0  # moc czynna na parę biegunów m (krzywa q, pkt 9.1.2; 0 dla sync)
    # Karta SC-IB-ITH-ZRODLA: prąd początkowy maszyny NA JEJ ZACISKACH [A] (w poziomie napięcia
    # maszyny — podstawa krotności I″k/I_r krzywej μ; `ikss_partial_a` jest odniesiony do miejsca
    # zwarcia) oraz ΔU″/(c·U_n/√3) — spadek na reaktancji podprzejściowej maszyny odniesiony
    # do napięcia źródła zastępczego (waga zaniku maszyny w I_b sieci oczkowej, rozdz. 9).
    ikss_zaciski_a: float = 0.0
    delta_u_wzgledne: float = 0.0
    # WHITE BOX (zasada wywodow 2026-07-22): pelny wywod dyplomowy per maszyna —
    # kazdy krok {tekst, latex}: wzor ogolny -> podstawienie liczbowe -> wynik.
    # Budowany W SOLVERZE z wartosci posrednich tego biegu (audytowalnosc 1:1).
    wywod: tuple = ()

    def to_dict(self) -> dict:
        return {
            "source_id": self.source_id,
            "source_name": self.source_name,
            "machine_type": self.machine_type,
            "node_id": self.node_id,
            "z_internal_ohm": {"re": self.z_internal_ohm.real, "im": self.z_internal_ohm.imag},
            "ir_a": float(self.ir_a),
            "ikss_partial_a": float(self.ikss_partial_a),
            "ratio_ik_ir": float(self.ratio_ik_ir),
            "mu": float(self.mu),
            "q": float(self.q),
            "ib_a": float(self.ib_a),
            "is_synchronous_machine": self.is_synchronous_machine,
            "slad_mu": self.slad_mu.to_dict(),
            "slad_q": None if self.slad_q is None else self.slad_q.to_dict(),
            "p_per_pole_mw": float(self.p_per_pole_mw),
            "ikss_zaciski_a": float(self.ikss_zaciski_a),
            "delta_u_wzgledne": float(self.delta_u_wzgledne),
            "wywod": list(self.wywod),
        }


def zalozenia_krzywych_wkladow(
    wklady: Iterable[MachinePartialContribution],
) -> list[dict[str, Any]]:
    """Krzywe zaniku wkładów maszyn wyznaczone na ZAŁOŻENIU INŻYNIERSKIM (karta PODSTAWA-Q).

    Jeden wpis na ślad μ albo q, którego podstawa (`SladKrzywejZaniku.podstawa`, jedyna tablica
    `PODSTAWY_REGUL_KRZYWYCH`) ma rodzaj źródła ``ZALOZENIE_INZYNIERSKIE``: interpolacja q po
    t_min (pkt 9.1.2 jej nie przewiduje), krzywa 0,02 s dla t_min < 0,02 s (μ i q), q = 1 dla
    m ≤ 0. Ślad o podstawie normowej (węzeł, interpolacja μ wg pkt 9.1.1, powyżej zakresu) nie
    daje wpisu — lista pusta znaczy: I_b punktu stoi na samych zapisach normy. Kolejność wkładów
    jak w `compute_machine_contributions` (deterministyczna), w maszynie μ przed q.

    Predykat parami: wpis powstaje z TEGO SAMEGO śladu, który dał liczbę μ/q, więc deklaracja
    podstawy w wierszu wyniku nie może rozjechać się z regułą rachunku.
    """
    wynik: list[dict[str, Any]] = []
    for wklad in wklady:
        for slad in (wklad.slad_mu, wklad.slad_q):
            if slad is None:
                continue
            podstawa = slad.podstawa
            if podstawa.rodzaj_zrodla != PODSTAWA_ZALOZENIE_INZYNIERSKIE:
                continue
            wynik.append(
                {
                    "source_id": wklad.source_id,
                    "source_name": wklad.source_name,
                    "machine_type": wklad.machine_type,
                    "wielkosc": slad.wielkosc,
                    "regula": slad.regula,
                    "t_min_s": float(slad.t_min_s),
                    "argument": float(slad.argument),
                    "wynik": float(slad.wynik),
                    "norma": podstawa.norma,
                    "podstawa_reguly": podstawa.rodzaj_zrodla,
                    "podstawa_reguly_pl": podstawa.opis_pl,
                }
            )
    return wynik


def zdanie_zalozenia_krzywej_pl(wpis: Mapping[str, Any]) -> str:
    """Zdanie o jednym wpisie `zalozenia_krzywych_wkladow` — JEDNO tłumaczenie dla werdyktu
    (zakres ważności), dowodu aparatury, pakietu dowodowego i raportu.

    Treść: która wielkość, której maszyny, przy jakim t_min i argumencie, z jaką podstawą
    (zdanie z jedynej tablicy podstaw). Nazwa maszyny z modelu (``source_name``); brak nazwy
    nazywa rodzaj, nigdy identyfikator.
    """
    symbol = "μ" if wpis.get("wielkosc") == "mu" else "q"
    argument_pl = "I″k/I_r" if wpis.get("wielkosc") == "mu" else "m"
    jednostka = "" if wpis.get("wielkosc") == "mu" else " MW"
    maszyna = opis_rodzaju_i_nazwy("maszyna", wpis.get("source_name"))
    # Wpis z `zalozenia_krzywych_wkladow` zawsze niesie liczby — brak klucza to błąd programu
    # wołającego (KeyError), nie dana do zastąpienia zerem.
    t_min = f"{float(wpis['t_min_s']):g}".replace(".", ",")
    argument = f"{float(wpis['argument']):.4g}".replace(".", ",")
    wynik = f"{float(wpis['wynik']):.4f}".replace(".", ",")
    return (
        f"{symbol} = {wynik} ({maszyna}, t_min = {t_min} s, {argument_pl} = {argument}{jednostka})"
        f" — {wpis.get('podstawa_reguly_pl')}"
    )


def zdanie_zalozen_zaniku_ib_pl(wpisy: Iterable[Mapping[str, Any]]) -> str | None:
    """Zdanie o WSZYSTKICH założeniach krzywych zaniku, na których stoi I_b punktu (karta
    PODSTAWA-Q) — JEDNO zdanie dla komentarza kroku śladu „Ib", zakresu ważności werdyktu
    I_b ≤ I_cu, uwagi i ostrzeżenia dowodu doboru aparatury oraz ostrzeżenia dowodu SC3F.

    ``None`` dla listy pustej: I_b stoi na samych zapisach normy i nikt nie dopisuje zdania.
    """
    zdania = [zdanie_zalozenia_krzywej_pl(wpis) for wpis in wpisy]
    if not zdania:
        return None
    return (
        "Prąd wyłączeniowy I_b stoi na założeniach inżynierskich krzywych zaniku "
        "(IEC 60909-0:2016 pkt 9.1): " + "; ".join(zdania) + "."
    )


@dataclass(frozen=True)
class MachineShortCircuitResult:
    """Per-machine SC breakdown + decayed breaking current (μ, q: IEC 60909-0:2016 pkt 9.1.1,
    9.1.2)."""

    fault_node_id: str
    c_factor: float
    t_min_s: float
    contributions: list[MachinePartialContribution] = field(default_factory=list)
    ikss_machines_a: float = 0.0  # Σ partial I″k from all machines
    ib_machines_a: float = 0.0  # Σ partial breaking current (decayed, μ·q per maszyna)
    motors_negligible: bool = True  # §6.6 small-motor omission
    white_box: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "standard": "IEC 60909-0:2016 §6.6",
            "fault_node_id": self.fault_node_id,
            "c_factor": float(self.c_factor),
            "t_min_s": float(self.t_min_s),
            "contributions": [c.to_dict() for c in self.contributions],
            "ikss_machines_a": float(self.ikss_machines_a),
            "ib_machines_a": float(self.ib_machines_a),
            "motors_negligible": self.motors_negligible,
            "white_box": self.white_box,
        }


def _sprawdz_impedancje_przejscia(z_f_ohm: complex | None, fault_node_id: str) -> complex | None:
    """Z_f wkładów maszyn — ta sama reguła danych i ta sama normalizacja Z_f = 0 → metaliczne
    co rdzeń IEC 60909 (`network_model.core.impedancja_przejscia`, karta OD-14): wkłady
    maszyn tego samego biegu nie mogą przyjąć danej, której rdzeń odmawia."""
    if z_f_ohm is None:
        return None
    kod = kod_odmowy_impedancji(float(z_f_ohm.real), float(z_f_ohm.imag))
    if kod is not None:
        raise OdmowaWejsciaRdzenia(
            [
                RekordOdmowy(
                    kod,
                    OPISY_ODMOW_IMPEDANCJI[kod],
                    (OdwolanieElementu(RODZAJ_WEZEL, fault_node_id),),
                )
            ]
        )
    return impedancja_przejscia_obliczeniowa(float(z_f_ohm.real), float(z_f_ohm.imag))


def compute_machine_contributions(
    graph: NetworkGraph,
    fault_node_id: str,
    *,
    c_factor: float,
    t_min_s: float,
    z_f_ohm: complex | None = None,
) -> MachineShortCircuitResult:
    """Per-machine partial I″k + breaking current i_b (μ/q) for a 3-phase fault.

    ``t_min_s`` — minimalny czas zwłoki t_min = t_b biegu (najkrótszy czas zabezpieczenia
    + najkrótszy czas własny wyłącznika), wybiera krzywe μ i q. Parametr WYMAGANY, bez
    wartości domyślnej w sygnaturze: wołający podaje t_b PUNKTU ZWARCIA rozstrzygnięte jedną
    regułą (karta TB-WARTOSC-ROBOCZA — scenariusz projektanta, najkrótszy czas wyłączenia pól
    lokalnych, inaczej wartość robocza z `network_model.core.czas_wylaczenia`).

    Reads the frozen Z-bus (``build_zbus``) READ-ONLY. Returns an empty result (no
    machines) deterministically. Partial currents follow the superposition identity
    I_partial,m = c·Z_mk/(Z_kk·Z_m) referred to the fault-bus base.

    ``z_f_ohm`` (karta OD-14, partia integracji 10): zwarcie trójfazowe przez impedancję
    przejścia Z_f — ta sama superpozycja z pętlą Z_kk + Z_f w mianowniku (rozkład prądu
    zwarciowego na źródła nie zależy od Z_f, zmienia się sam prąd w miejscu zwarcia). Wynik
    poza zakresem IEC 60909; ``None`` = zwarcie metaliczne, bit w bit.
    """
    # Reguła danych Z_f PRZED rozgałęzieniem „brak maszyn": niedopuszczalna Z_f jest odmową
    # niezależnie od tego, czy sieć ma maszyny (ta sama dana, ta sama odmowa co rdzeń).
    z_f_ohm = _sprawdz_impedancje_przejscia(z_f_ohm, fault_node_id)
    slad_z_f: dict[str, object] = (
        {"z_f_ohm": {"re": z_f_ohm.real, "im": z_f_ohm.imag}, "poza_zakresem_iec60909": True}
        if z_f_ohm is not None
        else {}
    )
    sync = graph.get_synchronous_machine_sources()
    asyn = graph.get_asynchronous_machine_sources()
    if not sync and not asyn:
        return MachineShortCircuitResult(
            fault_node_id=fault_node_id,
            c_factor=c_factor,
            t_min_s=t_min_s,
            white_box={
                "note": "Brak maszyn wirujących — udział zerowy (model §6.6 nieaktywny).",
                **slad_z_f,
            },
        )

    # `build_zbus` jest rdzeniem B-01: osobliwa macierz Y (sieć bez drogi do odniesienia)
    # to jego odmowa danych zgłaszana gołym `ValueError` (karta ODMOWA-DANYCH-422).
    with odmowa_rdzenia_b01():
        builder, z_bus = build_zbus(graph)
    index = builder.node_id_to_index
    if fault_node_id not in index:
        raise odmowa_wezla_zwarcia_spoza_grafu(fault_node_id)
    k = index[fault_node_id]
    z_kk = z_bus[k, k]
    # Pętla zwarcia: Z_kk (metaliczne) albo Z_kk + Z_f (karta OD-14) w tej samej bazie pu.
    z_f_pu = None if z_f_ohm is None else z_f_ohm / builder.get_zbase_ohm(fault_node_id)
    z_petli = z_kk if z_f_pu is None else z_kk + z_f_pu
    vn_k_kv = graph.nodes[fault_node_id].voltage_level
    i_base_k = S_BASE_MVA * 1.0e3 / (_SQRT3 * vn_k_kv)  # A — fault-bus current base
    # Total I″k from the Z-bus (machines included): I_f_pu = c / Z_kk_pu.
    ikss_total_a = (c_factor / modul_zespolony(z_petli)) * i_base_k

    def partial_a(node_id: str, z_internal_ohm: complex) -> tuple[float, float, float, dict]:
        """Prad czesciowy maszyny + wartosci posrednie do wywodu WHITE BOX.

        Zwraca (I″k,m w miejscu zwarcia [A], I″k,m na zaciskach maszyny [A],
        ΔU″/(c·U_n/√3) [-], detale wywodu). Maszyna spoza macierzy (węzeł bez połączenia
        z miejscem zwarcia) albo o Z″ = 0 nie oddaje prądu: trzy zera są wynikiem
        fizycznym (brak prądu = brak spadku), a puste detale pomijają krok wywodu.

        Prąd odniesiony do miejsca zwarcia (baza prądu węzła zwarcia) i ten sam prąd na
        zaciskach maszyny (baza prądu węzła maszyny) — krotność I″k/I_r krzywej μ liczy się
        z prądów na zaciskach (ten sam poziom napięcia co I_r); przy maszynie w poziomie
        napięcia węzła zwarcia obie liczby są identyczne. ΔU″/(c·U_n/√3) = X″_m·|I″_m|/c
        w jednostkach względnych (spadek na reaktancji podprzejściowej maszyny).
        """
        m_idx = index.get(node_id)
        if m_idx is None or abs(z_internal_ohm) == 0.0:
            return 0.0, 0.0, 0.0, {}
        z_m_pu = z_internal_ohm / builder.get_zbase_ohm(node_id)
        z_mk = z_bus[m_idx, k]
        i_pu = c_factor * z_mk / (z_petli * z_m_pu)
        i_base_m = S_BASE_MVA * 1.0e3 / (_SQRT3 * graph.nodes[node_id].voltage_level)
        detale = {
            "z_mk_pu": modul_zespolony(z_mk),
            "z_kk_pu": modul_zespolony(z_kk),
            "z_m_pu": modul_zespolony(z_m_pu),
            "i_base_a": i_base_k,
            "i_zaciski_a": modul_zespolony(i_pu) * i_base_m,
            "x_m_pu": z_m_pu.imag,
            "i_m_pu": modul_zespolony(i_pu),
            "delta_u_wzgledne": z_m_pu.imag * modul_zespolony(i_pu) / c_factor,
            **({"z_petli_pu": modul_zespolony(z_petli)} if z_f_pu is not None else {}),
        }
        return (
            modul_zespolony(i_pu) * i_base_k,
            detale["i_zaciski_a"],
            detale["delta_u_wzgledne"],
            detale,
        )

    def wywod_maszyny(
        *,
        z_internal_ohm: complex,
        detale: dict,
        ip_a: float,
        i_zaciski_a: float,
        ir_a: float,
        ratio: float,
        mu: float,
        q: float,
        ib_a: float,
        slad_mu_maszyny: SladKrzywejZaniku,
        slad_q_maszyny: SladKrzywejZaniku | None,
        dfig: bool,
    ) -> tuple:
        """Pelny wywod dyplomowy {tekst, latex}: wzor -> podstawienie -> wynik.

        Kazda liczba w podstawieniach pochodzi z wartosci posrednich TEGO biegu
        (WHITE BOX); formaty stale (determinizm).
        """
        ip_ka = ip_a / 1000.0
        kroki: list[dict] = [
            {
                "tekst": (
                    f"Impedancja zastępcza maszyny: Z″m = "
                    f"{z_internal_ohm.real:.4f} + j{z_internal_ohm.imag:.4f} Ω"
                ),
                "latex": (
                    rf"Z''_m = {z_internal_ohm.real:.4f} + j\,{z_internal_ohm.imag:.4f}"
                    rf"\;\Omega,\qquad |Z''_m| = {modul_zespolony(z_internal_ohm):.4f}\;\Omega"
                ),
            },
        ]
        if detale:
            kroki.append(
                {
                    "tekst": (
                        "Prąd częściowy maszyny (superpozycja macierzy impedancji węzłowych; przy zwarciu "
                        "na zaciskach równoważny c·Un/(√3·Z″))"
                    ),
                    "latex": (
                        (
                            rf"I''_{{k,m}} = \frac{{c\,|Z_{{mk}}|}}{{|Z_{{kk}}|\,|Z_m|}}\,"
                            rf"I_{{\mathrm{{base}}}} = "
                            rf"\frac{{{c_factor:.2f} \cdot {detale['z_mk_pu']:.4f}}}"
                            rf"{{{detale['z_kk_pu']:.4f} \cdot {detale['z_m_pu']:.4f}}}"
                        )
                        if "z_petli_pu" not in detale
                        else (
                            rf"I''_{{k,m}} = \frac{{c\,|Z_{{mk}}|}}{{|Z_{{kk}} + Z_f|\,|Z_m|}}\,"
                            rf"I_{{\mathrm{{base}}}} = "
                            rf"\frac{{{c_factor:.2f} \cdot {detale['z_mk_pu']:.4f}}}"
                            rf"{{{detale['z_petli_pu']:.4f} \cdot {detale['z_m_pu']:.4f}}}"
                        )
                    )
                    + (
                        rf" \cdot {detale['i_base_a']:.0f}\;\mathrm{{A}}"
                        rf" = {ip_ka:.3f}\;\mathrm{{kA}}"
                    ),
                }
            )
        if ir_a > 0:
            # Prąd na zaciskach podaje wołający (ta sama liczba, z której policzono krotność);
            # dawny odczyt `detale.get("i_zaciski_a", 0.0)` podstawiał zero za brak klucza.
            i_zaciski_ka = i_zaciski_a / 1000.0
            kroki.append(
                {
                    "tekst": (
                        f"Krotność prądu znamionowego (prądy na zaciskach maszyny): "
                        f"I″k/Ir = {ratio:.2f}"
                    ),
                    "latex": (
                        rf"\frac{{I''_{{k,m}}}}{{I_{{r,m}}}} = "
                        rf"\frac{{{i_zaciski_ka:.3f}}}{{{ir_a / 1000.0:.3f}}} = {ratio:.2f}"
                    ),
                }
            )
        # Kroki μ i q budowane WYŁĄCZNIE ze śladu krzywych (karta MU-INTERPOLACJA): węzeł,
        # zakres albo interpolacja liniowa między węzłami normy — ta sama funkcja co liczba.
        kroki.extend(kroki_krzywej_zaniku(slad_mu_maszyny))
        if slad_q_maszyny is not None:
            kroki.extend(kroki_krzywej_zaniku(slad_q_maszyny))
        if dfig:
            kroki.append(
                {
                    "tekst": (
                        "Generator asynchroniczny dwustronnie zasilany (typ 3): założono zadziałanie "
                        "układu zwierającego wirnik → model maszyny asynchronicznej (§ 6.7), "
                        "zachowawczo dla I″k,max"
                    ),
                    "latex": None,
                }
            )
        if detale:
            kroki.append(
                {
                    "tekst": (
                        "Spadek napięcia na reaktancji podprzejściowej maszyny odniesiony do "
                        f"napięcia źródła zastępczego: ΔU″/(c·Un/√3) = "
                        f"{detale['delta_u_wzgledne']:.4f}"
                    ),
                    "latex": (
                        rf"\frac{{\Delta U''_m}}{{c\,U_n/\sqrt{{3}}}} = "
                        rf"\frac{{X''_m\,|I''_{{k,m}}|}}{{c}} = "
                        rf"\frac{{{detale['x_m_pu']:.4f} \cdot {detale['i_m_pu']:.4f}}}"
                        rf"{{{c_factor:.2f}}} = {detale['delta_u_wzgledne']:.4f}"
                    ),
                }
            )
        ib_ka = ib_a / 1000.0
        kroki.append(
            {
                "tekst": f"Prąd wyłączeniowy symetryczny: Ib = {ib_ka:.3f} kA",
                "latex": (
                    rf"I_b = \mu \cdot q \cdot I''_{{k,m}} = "
                    rf"{mu:.3f} \cdot {q:.3f} \cdot {ip_ka:.3f}\;\mathrm{{kA}}"
                    rf" = {ib_ka:.3f}\;\mathrm{{kA}}"
                ),
            }
        )
        return tuple(kroki)

    def wklad_maszyny(
        m: SynchronousMachineSource | AsynchronousMachineSource,
        *,
        is_sync: bool,
        p_per_pole_mw: float,
    ) -> MachinePartialContribution:
        """Wkład jednej maszyny: prąd częściowy, krotność na zaciskach, μ, q, i_b, ΔU″.

        ``p_per_pole_mw`` — moc czynna na parę biegunów m (krzywa q, IEC 60909-0:2016
        pkt 9.1.2); maszyna synchroniczna nie ma krzywej q (q = 1) i wołający podaje 0.
        """
        ip_a, i_zaciski_a, delta_u_wzgledne, detale = partial_a(m.node_id, m.z_internal_ohm)
        ir_a = float(m.ir_a)
        if not ir_a > 0.0:
            # Dawne `ratio = ip / I_r if I_r > 0 else 0.0` wpychało krotność 0 do krzywej μ
            # (μ = 1 — „maszyna daleka") za NIEFIZYCZNY prąd znamionowy: dług nazwany
            # w zapadce `solver_input_substitute_guard`, zdjęty kartą SC-IB-ITH-ZRODLA.
            raise ValueError(
                f"{opis_rodzaju_i_nazwy('Maszyna', m.name)}: prąd znamionowy I_r = {ir_a!r} A nie jest "
                f"dodatni — krotności I″k/I_r krzywej μ ({NORMA_KRZYWYCH_ZANIKU['mu']}) nie da się "
                "wyznaczyć; popraw moc i napięcie znamionowe maszyny."
            )
        ratio = i_zaciski_a / ir_a
        slad_mu_maszyny = slad_mu(ratio, t_min_s)
        slad_q_maszyny = None if is_sync else slad_q(p_per_pole_mw, t_min_s)
        mu = slad_mu_maszyny.wynik
        q = 1.0 if slad_q_maszyny is None else slad_q_maszyny.wynik
        ib_a = mu * q * ip_a
        # DFIG (wind Type 3): on a severe fault the crowbar fires (rotor shorted), so
        # the machine is treated as a squirrel-cage induction generator — same §6.7/§6.6
        # μ·q math, only the label differs (the crowbar assumption is documented).
        if is_sync:
            mtype = "SYNCHRONOUS"
        else:
            mtype = "DFIG" if getattr(m, "wind_type_3", False) else "ASYNCHRONOUS"
        return MachinePartialContribution(
            source_id=m.id,
            source_name=m.name,
            machine_type=mtype,
            node_id=m.node_id,
            z_internal_ohm=m.z_internal_ohm,
            ir_a=ir_a,
            ikss_partial_a=ip_a,
            ratio_ik_ir=ratio,
            mu=mu,
            q=q,
            ib_a=ib_a,
            is_synchronous_machine=is_sync,
            slad_mu=slad_mu_maszyny,
            slad_q=slad_q_maszyny,
            p_per_pole_mw=p_per_pole_mw,
            ikss_zaciski_a=i_zaciski_a,
            delta_u_wzgledne=delta_u_wzgledne,
            wywod=wywod_maszyny(
                z_internal_ohm=m.z_internal_ohm,
                detale=detale,
                ip_a=ip_a,
                i_zaciski_a=i_zaciski_a,
                ir_a=ir_a,
                ratio=ratio,
                mu=mu,
                q=q,
                ib_a=ib_a,
                slad_mu_maszyny=slad_mu_maszyny,
                slad_q_maszyny=slad_q_maszyny,
                dfig=mtype == "DFIG",
            ),
        )

    contributions: list[MachinePartialContribution] = [
        wklad_maszyny(m, is_sync=True, p_per_pole_mw=0.0) for m in sync
    ] + [wklad_maszyny(m, is_sync=False, p_per_pole_mw=m.p_per_pole_mw) for m in asyn]

    ikss_machines = sum(c.ikss_partial_a for c in contributions)
    ib_machines = sum(c.ib_a for c in contributions)
    # Small-motor omission (IEC 60909-0:2016 §6.6): asynchronous motors may be
    # neglected if their combined contribution to I″k is ≤ 5 % of the total I″k.
    async_partial = sum(c.ikss_partial_a for c in contributions if not c.is_synchronous_machine)
    motors_negligible = bool(async_partial <= 0.05 * ikss_total_a) if ikss_total_a > 0 else True

    white_box = {
        "model": (
            "IEC 60909-0:2016 §6.6 — prądy częściowe maszyn + zanik (μ — pkt 9.1.1, "
            "q — pkt 9.1.2)"
        ),
        "fault_node_id": fault_node_id,
        "z_kk_ohm": {
            "re": (z_kk * builder.get_zbase_ohm(fault_node_id)).real,
            "im": (z_kk * builder.get_zbase_ohm(fault_node_id)).imag,
        },
        "i_base_a": i_base_k,
        "ikss_total_a": ikss_total_a,
        "partial_formula": "I_partial,m = c·Z_mk/(Z_kk·Z_m) · I_base  (przy zwarciu na zaciskach → c·Un/(√3·Z″))",
        "n_synchronous": len(sync),
        "n_asynchronous": len(asyn),
        "n_dfig": sum(1 for m in asyn if getattr(m, "wind_type_3", False)),
        "small_motor_rule": "silniki pomijalne gdy ΣI″k,M ≤ 0.05·I″k (§6.6)",
        # WHITE BOX (ZWARCIA-PRO F3 pkt 9, addytywnie): liczby reguły małych
        # silników — wartość obliczona ΣI″k,M (asynchroniczne) i próg 0.05·I″k,
        # użyte w werdykcie `motors_negligible` powyżej (audyt 1:1).
        "ikss_async_machines_a": async_partial,
        "small_motor_limit_a": 0.05 * ikss_total_a,
        **slad_z_f,
        "dfig_assumption": (
            "DFIG (Typ 3): założono zadziałanie crowbar (rotor zwarty) → model maszyny "
            "asynchronicznej za Z_M (§6.7); udział przekształtnika pominięty (zachowawczo dla I″k,max)."
        ),
    }
    return MachineShortCircuitResult(
        fault_node_id=fault_node_id,
        c_factor=c_factor,
        t_min_s=t_min_s,
        contributions=contributions,
        ikss_machines_a=ikss_machines,
        ib_machines_a=ib_machines,
        motors_negligible=motors_negligible,
        white_box=white_box,
    )
