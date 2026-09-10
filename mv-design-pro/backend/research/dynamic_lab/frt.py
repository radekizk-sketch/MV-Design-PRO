"""Ocena FRT: WYMAGANIE (obwiednia) i WYNIK (przebieg) jako dwa ROZDZIELNE byty.

KOD BADAWCZY — patrz `backend/research/README.md`.

To jest bezpośrednia odpowiedź na defekt P0-01 audytu. W produkcyjnym ewaluatorze
kod robił:

    limiting = min(curve, key=...)          # punkt obwiedni WYMAGANIA
    simulated_voltage = limiting.voltage_pu # ...przypisany jako wielkość "symulowana"
    margin = simulated_voltage - limiting.voltage_pu   # x - x, tożsamościowo 0
    ok = margin >= -1e-9                    # zawsze prawda

Wymaganie było porównywane samo ze sobą, więc test nie mógł wypaść negatywnie,
a ślad White Box zapisywał limit normatywny jako ``U_sim``.

REGUŁA KONSTRUKCYJNA tego modułu: obwiednia i przebieg mają RÓŻNE TYPY
(``ObwiedniaFrt`` vs ``PrzebiegNapiecia``) i funkcja oceny wymaga OBU. Nie da się
podać tego samego obiektu dwa razy — tautologia z audytu jest tu niewyrażalna
w typach, a nie tylko zakazana w komentarzu.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

import numpy as np
from numpy.typing import NDArray


class WerdyktFrt(StrEnum):
    """Trzy stany — trzeci jest OBOWIĄZKOWY i nie wolno go zwijać do „spełnia"."""

    SPELNIA = "spelnia"
    NIE_SPELNIA = "nie_spelnia"
    NIEROZSTRZYGALNE = "nierozstrzygalne"


@dataclass(frozen=True)
class ObwiedniaFrt:
    """WYMAGANIE: dolna (LVRT) lub górna (HVRT) obwiednia czas→napięcie.

    Punkty ``(czas_s, napiecie_pu)`` liczone OD CHWILI ZAKŁÓCENIA. Między punktami
    interpolacja liniowa; poza ostatnim punktem obowiązuje wartość ostatniego.
    """

    rodzaj: str  # "lvrt" | "hvrt"
    punkty: tuple[tuple[float, float], ...]

    def __post_init__(self) -> None:
        if self.rodzaj not in ("lvrt", "hvrt"):
            raise ValueError("rodzaj musi być 'lvrt' albo 'hvrt'")
        if len(self.punkty) < 2:
            raise ValueError("Obwiednia wymaga co najmniej dwóch punktów")
        czasy = [p[0] for p in self.punkty]
        if czasy != sorted(czasy):
            raise ValueError("Punkty obwiedni muszą być posortowane po czasie")

    def wymagane_napiecie(self, czas_od_zaklocenia_s: float) -> float:
        """Wartość graniczna obwiedni w danej chwili [p.u.]."""
        czasy = np.array([p[0] for p in self.punkty], dtype=np.float64)
        wartosci = np.array([p[1] for p in self.punkty], dtype=np.float64)
        if czas_od_zaklocenia_s <= czasy[0]:
            return float(wartosci[0])
        if czas_od_zaklocenia_s >= czasy[-1]:
            return float(wartosci[-1])
        return float(np.interp(czas_od_zaklocenia_s, czasy, wartosci))


@dataclass(frozen=True)
class PrzebiegNapiecia:
    """WYNIK: zmierzony/zasymulowany przebieg napięcia — TYP RÓŻNY od obwiedni.

    ``zrodlo`` mówi wprost, skąd pochodzi przebieg. Wartość ``"obwiednia_profilu"``
    jest ZAKAZANA — to była właśnie fabrykacja z audytu.
    """

    czas_s: tuple[float, ...]
    napiecie_pu: tuple[float, ...]
    zrodlo: str
    element_ref: str

    def __post_init__(self) -> None:
        if len(self.czas_s) != len(self.napiecie_pu):
            raise ValueError("Niezgodne długości osi czasu i napięcia")
        if len(self.czas_s) < 2:
            raise ValueError("Przebieg wymaga co najmniej dwóch próbek")
        if self.zrodlo in ("obwiednia_profilu", "profil", "wymaganie"):
            raise ValueError(
                "Przebieg nie może pochodzić z obwiedni wymagania — to jest "
                "dokładnie fabrykacja wykryta w audycie (P0-01)."
            )


@dataclass(frozen=True)
class OcenaFrt:
    """Wynik oceny — z marginesem policzonym z DWÓCH NIEZALEŻNYCH wielkości."""

    werdykt: WerdyktFrt
    margines_pu: float | None
    chwila_krytyczna_s: float | None
    napiecie_zmierzone_pu: float | None
    napiecie_wymagane_pu: float | None
    uzasadnienie_pl: str
    liczba_probek_ocenionych: int


def ocen_frt(
    przebieg: PrzebiegNapiecia,
    obwiednia: ObwiedniaFrt,
    *,
    chwila_zaklocenia_s: float,
    tolerancja_pu: float = 0.0,
    horyzont_s: float | None = None,
) -> OcenaFrt:
    """Oceń zgodność PRZEBIEGU z OBWIEDNIĄ — dwa różne obiekty, dwa różne typy.

    Margines liczony jako minimalna rezerwa względem obwiedni:
      - LVRT: ``min(U_zmierzone(t) - U_wymagane(t))`` — ujemny = zejście pod obwiednię;
      - HVRT: ``min(U_wymagane(t) - U_zmierzone(t))`` — ujemny = wyjście ponad obwiednię.

    Zwraca ``NIEROZSTRZYGALNE``, gdy przebieg nie pokrywa okna oceny — brak
    danych NIE jest wynikiem pozytywnym.
    """
    t = np.asarray(przebieg.czas_s, dtype=np.float64)
    u = np.asarray(przebieg.napiecie_pu, dtype=np.float64)
    maska = t >= chwila_zaklocenia_s
    if horyzont_s is not None:
        maska &= t <= chwila_zaklocenia_s + horyzont_s
    if not bool(np.any(maska)):
        return OcenaFrt(
            werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
            margines_pu=None,
            chwila_krytyczna_s=None,
            napiecie_zmierzone_pu=None,
            napiecie_wymagane_pu=None,
            uzasadnienie_pl=(
                "Przebieg nie pokrywa okna oceny — brak podstawy do orzeczenia."
            ),
            liczba_probek_ocenionych=0,
        )

    t_ocena = t[maska]
    u_ocena = u[maska]
    wymagane = np.array(
        [
            obwiednia.wymagane_napiecie(float(ti) - chwila_zaklocenia_s)
            for ti in t_ocena
        ],
        dtype=np.float64,
    )
    if obwiednia.rodzaj == "lvrt":
        margines = u_ocena - wymagane
    else:
        margines = wymagane - u_ocena

    i_min = int(np.argmin(margines))
    margines_min = float(margines[i_min])
    spelnia = margines_min >= -tolerancja_pu
    return OcenaFrt(
        werdykt=WerdyktFrt.SPELNIA if spelnia else WerdyktFrt.NIE_SPELNIA,
        margines_pu=margines_min,
        chwila_krytyczna_s=float(t_ocena[i_min]),
        napiecie_zmierzone_pu=float(u_ocena[i_min]),
        napiecie_wymagane_pu=float(wymagane[i_min]),
        uzasadnienie_pl=(
            f"Punkt krytyczny t={float(t_ocena[i_min]):.4f} s: "
            f"U_zmierzone={float(u_ocena[i_min]):.4f} p.u., "
            f"U_wymagane={float(wymagane[i_min]):.4f} p.u., "
            f"margines={margines_min:+.4f} p.u."
        ),
        liczba_probek_ocenionych=int(t_ocena.size),
    )


def czas_odbudowy_mocy(
    czas_s: NDArray[np.float64] | list[float],
    moc_pu: NDArray[np.float64] | list[float],
    *,
    moc_przed_zaklocaniem_pu: float,
    chwila_wylaczenia_s: float,
    prog_wzgledny: float = 0.9,
) -> float | None:
    """Czas odbudowy P po wyłączeniu zwarcia — MIERZONY Z PRZEBIEGU.

    Defekt P0-08 audytu: ``p_recovery_time_s`` było albo deklaracją wnioskodawcy
    porównaną z wymaganiem, albo — w silniku FRT — funkcją wyłącznie głębokości
    zapadu (dwa różne DER dawały identyczne 0,275 s). Tutaj wartość wynika z
    przebiegu ``P(t)`` i jest ``None``, gdy odbudowa nie nastąpiła.
    """
    t = np.asarray(czas_s, dtype=np.float64)
    p = np.asarray(moc_pu, dtype=np.float64)
    prog = prog_wzgledny * moc_przed_zaklocaniem_pu
    po = t > chwila_wylaczenia_s
    if not bool(np.any(po)):
        return None
    idx = np.where(po & (p >= prog))[0]
    if idx.size == 0:
        return None
    return float(t[idx[0]] - chwila_wylaczenia_s)
