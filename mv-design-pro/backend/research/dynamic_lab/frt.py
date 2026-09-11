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

DRUGA RUNDA AUDYTU — ROZDZIELENIE OBWIEDNI OD ZDOLNOŚCI (pakiet C)
------------------------------------------------------------------
Poprzednia wersja miała JEDNĄ funkcję ``ocen_frt`` sprawdzającą wyłącznie
``U(t)`` względem obwiedni — i nazwę, która obiecywała ocenę FRT. To jest ta
sama klasa błędu, co tautologia wyżej, tylko o piętro wyżej: nazwa mówiła
więcej niż liczyła treść. Warunek

    U(t) >= U_LVRT(t)

NIE znaczy „moduł spełnił wymaganie FRT". Moduł mógł się w tym czasie odłączyć,
nie podać prądu biernego, nie odbudować mocy albo przebieg mógł się skończyć
przed końcem wymaganego okna.

Dlatego moduł ma dziś DWA poziomy, z różnymi typami wyniku:

  * ``ocen_obwiednie_napiecia`` -> ``OcenaObwiedniNapiecia``
    Jedno kryterium: przebieg napięcia względem obwiedni. Nazwa mówi dokładnie
    tyle, ile funkcja liczy.
  * ``ocen_zdolnosc_frt`` -> ``OcenaZdolnosciFrt``
    Składa obwiednię, stan przyłączenia, prąd bierny i odbudowę mocy w jeden
    werdykt. Werdykt pozytywny wymaga, żeby KAŻDE wymagane kryterium było
    rozstrzygnięte pozytywnie; brak danych do któregokolwiek daje
    ``NIEROZSTRZYGALNE``, nigdy ``SPELNIA``.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

import numpy as np
from numpy.typing import NDArray

#: Tolerancja porównań czasu [s]. Przebieg kończący się o ułamek kroku przed
#: końcem okna jest traktowany jak pokrywający okno — inaczej każdy bieg z
#: krokiem niebędącym dzielnikiem horyzontu byłby NIEROZSTRZYGALNY.
TOLERANCJA_CZASU_S = 1.0e-9


class WerdyktFrt(StrEnum):
    """Trzy stany — trzeci jest OBOWIĄZKOWY i nie wolno go zwijać do „spełnia"."""

    SPELNIA = "spelnia"
    NIE_SPELNIA = "nie_spelnia"
    NIEROZSTRZYGALNE = "nierozstrzygalne"


class BrakPokryciaOkna(StrEnum):
    """Dlaczego przebieg NIE nadaje się do orzekania w zadanym oknie.

    Rozdzielone, bo wymagają różnych reakcji: skrócony bieg to inna usterka niż
    przebieg z powtórzonymi znacznikami czasu albo zbyt rzadkim próbkowaniem.
    """

    BRAK_PROBEK = "brak_probek_w_oknie"
    OKNO_NIEDOMKNIETE = "przebieg_konczy_sie_przed_koncem_okna"
    POCZATEK_PO_ZAKLOCENIU = "przebieg_zaczyna_sie_po_chwili_zaklocenia"
    CZAS_NIEMONOTONICZNY = "czas_nie_jest_rosnacy"
    CZAS_ZDUBLOWANY = "powtorzone_znaczniki_czasu"
    ZBYT_RZADKIE_PROBKI = "odstep_probek_przekracza_dopuszczalny"


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

    @property
    def czasy_zalamania(self) -> NDArray[np.float64]:
        """Chwile załamania obwiedni [s od zakłócenia] — węzły funkcji kawałkami liniowej."""
        return np.array([p[0] for p in self.punkty], dtype=np.float64)

    @property
    def wartosci_zalamania(self) -> NDArray[np.float64]:
        return np.array([p[1] for p in self.punkty], dtype=np.float64)

    def wymagane_napiecie(self, czas_od_zaklocenia_s: float) -> float:
        """Wartość graniczna obwiedni w danej chwili [p.u.]."""
        return float(np.interp(czas_od_zaklocenia_s, self.czasy_zalamania, self.wartosci_zalamania))


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
class PrzebiegSkalarny:
    """Dowolny przebieg skalarny towarzyszący ocenie (P, Iq, ...).

    Osobny typ od ``PrzebiegNapiecia``, bo napięcie jest porównywane z obwiednią,
    a te wielkości z progami — pomylenie ich było źródłem defektu P0-01.
    """

    czas_s: tuple[float, ...]
    wartosci: tuple[float, ...]
    wielkosc: str
    jednostka: str
    zrodlo: str
    element_ref: str

    def __post_init__(self) -> None:
        if len(self.czas_s) != len(self.wartosci):
            raise ValueError("Niezgodne długości osi czasu i wartości")
        if len(self.czas_s) < 2:
            raise ValueError("Przebieg wymaga co najmniej dwóch próbek")


@dataclass(frozen=True)
class StanPrzylaczenia:
    """Czy moduł BYŁ PRZYŁĄCZONY — informacja, której nie wolno domniemywać.

    Defekt audytu: pozytywna ocena FRT wydawana modułowi, który w trakcie
    zapadu się odłączył, bo „brak sygnału trip" czytano jako „był przyłączony".
    Brak tej informacji jest BRAKIEM DANYCH, nie potwierdzeniem.
    """

    czas_s: tuple[float, ...]
    przylaczony: tuple[bool, ...]
    zrodlo: str

    def __post_init__(self) -> None:
        if len(self.czas_s) != len(self.przylaczony):
            raise ValueError("Niezgodne długości osi czasu i stanu przyłączenia")
        if not self.czas_s:
            raise ValueError("Stan przyłączenia bez ani jednej próbki nie niesie informacji")

    def pierwsze_odlaczenie(self, od_s: float, do_s: float) -> float | None:
        """Pierwsza chwila w oknie, w której moduł NIE był przyłączony."""
        for t, stan in zip(self.czas_s, self.przylaczony, strict=True):
            if od_s - TOLERANCJA_CZASU_S <= t <= do_s + TOLERANCJA_CZASU_S and not stan:
                return float(t)
        return None


@dataclass(frozen=True)
class KryteriumOdbudowyMocy:
    """Kryterium odbudowy mocy czynnej — z JAWNYM czasem utrzymania.

    Definicja (zamiast „pierwsza próbka powyżej progu"):

        t_rec = inf { t : P(tau) >= alpha * P_pre  dla KAŻDEGO tau w [t, t+T_hold] }

    ``czas_utrzymania_s`` jest parametrem kryterium/profilu, nie stałą w kodzie.
    Przy ``T_hold = 0`` definicja degeneruje się do pierwszego przekroczenia —
    to jest dokładnie zachowanie uznane w audycie za niewystarczające, więc
    zero trzeba podać ŚWIADOMIE.
    """

    prog_wzgledny: float = 0.9
    czas_utrzymania_s: float = 0.0
    maksymalny_czas_s: float | None = None
    """Wymagany limit czasu odbudowy [s od wyłączenia zwarcia]; ``None`` = nie oceniamy."""

    def __post_init__(self) -> None:
        if not 0.0 < self.prog_wzgledny <= 1.0:
            raise ValueError("prog_wzgledny musi być w (0, 1]")
        if self.czas_utrzymania_s < 0.0:
            raise ValueError("czas_utrzymania_s nie może być ujemny")


@dataclass(frozen=True)
class OcenaObwiedniNapiecia:
    """Wynik JEDNEGO kryterium: przebieg napięcia względem obwiedni.

    NIE jest oceną zdolności FRT — patrz ``OcenaZdolnosciFrt``. Nazwa typu jest
    tu zabezpieczeniem: konsument nie może wziąć tego wyniku za pełną ocenę,
    bo nie ma w nim pól, które pełna ocena musi nieść.
    """

    werdykt: WerdyktFrt
    margines_pu: float | None
    chwila_krytyczna_s: float | None
    napiecie_zmierzone_pu: float | None
    napiecie_wymagane_pu: float | None
    uzasadnienie_pl: str
    liczba_probek_ocenionych: int
    liczba_wezlow_siatki: int = 0
    """Rozmiar WSPÓLNEJ siatki (próbki + załamania obwiedni + krańce okna)."""
    okno_od_s: float | None = None
    okno_do_s: float | None = None
    braki_pokrycia: tuple[BrakPokryciaOkna, ...] = ()


def _sprawdz_pokrycie_okna(
    t: NDArray[np.float64],
    *,
    okno_od_s: float,
    okno_do_s: float | None,
    maks_odstep_probek_s: float | None,
) -> tuple[BrakPokryciaOkna, ...]:
    """Czy oś czasu w ogóle nadaje się do orzekania w zadanym oknie.

    Rozdzielone od samej oceny marginesu, bo to są różne pytania: „czy dane są
    zdatne" poprzedza „jaki wyszedł margines". Przebieg urwany w 0,4 s nie ma
    marginesu dla okna 2 s — ma brak danych.
    """
    braki: list[BrakPokryciaOkna] = []
    if t.size == 0:
        return (BrakPokryciaOkna.BRAK_PROBEK,)

    roznice = np.diff(t)
    if roznice.size:
        if np.any(roznice < -TOLERANCJA_CZASU_S):
            braki.append(BrakPokryciaOkna.CZAS_NIEMONOTONICZNY)
        if np.any(np.abs(roznice) <= TOLERANCJA_CZASU_S):
            braki.append(BrakPokryciaOkna.CZAS_ZDUBLOWANY)

    if float(t[0]) > okno_od_s + TOLERANCJA_CZASU_S:
        braki.append(BrakPokryciaOkna.POCZATEK_PO_ZAKLOCENIU)
    if okno_do_s is not None and float(t[-1]) < okno_do_s - TOLERANCJA_CZASU_S:
        braki.append(BrakPokryciaOkna.OKNO_NIEDOMKNIETE)

    if maks_odstep_probek_s is not None and roznice.size:
        w_oknie = (t[:-1] >= okno_od_s - TOLERANCJA_CZASU_S) & (
            t[1:] <= (okno_do_s if okno_do_s is not None else t[-1]) + TOLERANCJA_CZASU_S
        )
        if np.any(roznice[w_oknie] > maks_odstep_probek_s + TOLERANCJA_CZASU_S):
            braki.append(BrakPokryciaOkna.ZBYT_RZADKIE_PROBKI)

    return tuple(braki)


def ocen_obwiednie_napiecia(
    przebieg: PrzebiegNapiecia,
    obwiednia: ObwiedniaFrt,
    *,
    chwila_zaklocenia_s: float,
    tolerancja_pu: float = 0.0,
    horyzont_s: float | None = None,
    maks_odstep_probek_s: float | None = None,
) -> OcenaObwiedniNapiecia:
    """Oceń zgodność PRZEBIEGU z OBWIEDNIĄ — dwa różne obiekty, dwa różne typy.

    Margines liczony jako minimalna rezerwa względem obwiedni:
      - LVRT: ``min(U_zmierzone(t) - U_wymagane(t))`` — ujemny = zejście pod obwiednię;
      - HVRT: ``min(U_wymagane(t) - U_zmierzone(t))`` — ujemny = wyjście ponad obwiednię.

    MINIMUM LICZONE DOKŁADNIE (poprawka C3 audytu). Oba przebiegi są kawałkami
    liniowe: symulacja między próbkami, obwiednia między swoimi załamaniami.
    Różnica ``m(t) = U_sim(t) - U_req(t)`` jest więc również kawałkami liniowa na
    SUMIE obu zbiorów węzłów, a funkcja kawałkami liniowa osiąga minimum na
    końcu przedziału. Poprzednia wersja liczyła margines WYŁĄCZNIE w chwilach
    próbek przebiegu, więc krótkie załamanie obwiedni wypadające między dwiema
    próbkami było pomijane i wynik mógł być zawyżony. Tutaj budowana jest wspólna
    siatka (próbki ∪ załamania obwiedni ∪ krańce okna), na którą interpolowany
    jest przebieg — minimum na tej siatce jest dokładnym minimum modelu
    kawałkami liniowego.

    Zwraca ``NIEROZSTRZYGALNE``, gdy przebieg nie pokrywa okna oceny — brak
    danych NIE jest wynikiem pozytywnym. W szczególności przebieg kończący się
    przed końcem żądanego horyzontu NIE może dać werdyktu ``SPELNIA``.
    """
    t = np.asarray(przebieg.czas_s, dtype=np.float64)
    u = np.asarray(przebieg.napiecie_pu, dtype=np.float64)
    okno_od = float(chwila_zaklocenia_s)
    okno_do = None if horyzont_s is None else okno_od + float(horyzont_s)

    braki = _sprawdz_pokrycie_okna(
        t,
        okno_od_s=okno_od,
        okno_do_s=okno_do,
        maks_odstep_probek_s=maks_odstep_probek_s,
    )

    maska = t >= okno_od - TOLERANCJA_CZASU_S
    if okno_do is not None:
        maska &= t <= okno_do + TOLERANCJA_CZASU_S
    if not bool(np.any(maska)):
        braki = braki + (BrakPokryciaOkna.BRAK_PROBEK,)

    if braki:
        return OcenaObwiedniNapiecia(
            werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
            margines_pu=None,
            chwila_krytyczna_s=None,
            napiecie_zmierzone_pu=None,
            napiecie_wymagane_pu=None,
            uzasadnienie_pl=(
                "Przebieg nie nadaje się do orzekania w oknie "
                f"[{okno_od:.4f}, {okno_do if okno_do is not None else float(t[-1]):.4f}] s: "
                + ", ".join(b.value for b in braki)
                + ". Brak danych NIE jest wynikiem pozytywnym."
            ),
            liczba_probek_ocenionych=int(np.count_nonzero(maska)),
            liczba_wezlow_siatki=0,
            okno_od_s=okno_od,
            okno_do_s=okno_do,
            braki_pokrycia=braki,
        )

    koniec = okno_do if okno_do is not None else float(t[-1])
    wezly = [t[maska], obwiednia.czasy_zalamania + okno_od, np.array([okno_od, koniec])]
    siatka = np.unique(np.concatenate(wezly))
    siatka = siatka[
        (siatka >= okno_od - TOLERANCJA_CZASU_S) & (siatka <= koniec + TOLERANCJA_CZASU_S)
    ]

    u_siatka = np.interp(siatka, t, u)
    wymagane = np.interp(siatka - okno_od, obwiednia.czasy_zalamania, obwiednia.wartosci_zalamania)
    margines = (u_siatka - wymagane) if obwiednia.rodzaj == "lvrt" else (wymagane - u_siatka)

    i_min = int(np.argmin(margines))
    margines_min = float(margines[i_min])
    spelnia = margines_min >= -tolerancja_pu
    return OcenaObwiedniNapiecia(
        werdykt=WerdyktFrt.SPELNIA if spelnia else WerdyktFrt.NIE_SPELNIA,
        margines_pu=margines_min,
        chwila_krytyczna_s=float(siatka[i_min]),
        napiecie_zmierzone_pu=float(u_siatka[i_min]),
        napiecie_wymagane_pu=float(wymagane[i_min]),
        uzasadnienie_pl=(
            f"Punkt krytyczny t={float(siatka[i_min]):.4f} s: "
            f"U_zmierzone={float(u_siatka[i_min]):.4f} p.u., "
            f"U_wymagane={float(wymagane[i_min]):.4f} p.u., "
            f"margines={margines_min:+.4f} p.u. "
            f"(minimum dokładne na wspólnej siatce {siatka.size} węzłów)"
        ),
        liczba_probek_ocenionych=int(np.count_nonzero(maska)),
        liczba_wezlow_siatki=int(siatka.size),
        okno_od_s=okno_od,
        okno_do_s=okno_do,
        braki_pokrycia=(),
    )


@dataclass(frozen=True)
class OcenaOdbudowyMocy:
    """Wynik kryterium odbudowy mocy — z rozróżnieniem „nie odbudował" od „nie wiadomo"."""

    werdykt: WerdyktFrt
    czas_odbudowy_s: float | None
    """Czas od wyłączenia zwarcia do TRWAŁEGO przekroczenia progu; ``None`` = brak."""
    prog_pu: float
    uzasadnienie_pl: str


def _przedzialy_powyzej_progu(
    t: NDArray[np.float64], wartosci: NDArray[np.float64], prog: float
) -> list[tuple[float, float]]:
    """Maksymalne przedziały, w których przebieg kawałkami liniowy jest >= progu.

    Krańce liczone DOKŁADNIE z przecięcia liniowego, nie zaokrąglane do próbek —
    inaczej próg przekroczony tuż po próbce przesuwałby początek utrzymania o
    cały krok i kryterium czasu utrzymania dawałoby inny wynik dla tej samej
    fizyki przy innym dt.
    """
    m = wartosci - prog
    przedzialy: list[tuple[float, float]] = []
    poczatek: float | None = float(t[0]) if m[0] >= 0.0 else None

    for i in range(len(t) - 1):
        a, b = float(m[i]), float(m[i + 1])
        ta, tb = float(t[i]), float(t[i + 1])
        if a >= 0.0 and b < 0.0:
            przeciecie = ta + (tb - ta) * (a / (a - b))
            if poczatek is not None:
                przedzialy.append((poczatek, przeciecie))
            poczatek = None
        elif a < 0.0 and b >= 0.0:
            poczatek = ta + (tb - ta) * (a / (a - b))
    if poczatek is not None:
        przedzialy.append((poczatek, float(t[-1])))
    return przedzialy


def ocen_odbudowe_mocy(
    przebieg: PrzebiegSkalarny,
    kryterium: KryteriumOdbudowyMocy,
    *,
    moc_przed_zaklocaniem_pu: float,
    chwila_wylaczenia_s: float,
) -> OcenaOdbudowyMocy:
    """Odbudowa P po wyłączeniu zwarcia — z WYMAGANYM czasem utrzymania.

    Defekt audytu (C5): poprzednia wersja zwracała chwilę PIERWSZEJ próbki
    powyżej progu. Przebieg, który na jedną próbkę przeskakuje 90 % mocy, zaraz
    potem opada i dopiero później wraca trwale, dostawał czas odbudowy z tego
    pierwszego, przypadkowego przeskoku. Tutaj odbudowa jest zdarzeniem TRWAŁYM:
    liczy się początek pierwszego przedziału, na którym warunek utrzymuje się
    przez pełne ``T_hold``.

    Gdy przebieg kończy się, zanim da się potwierdzić pełne okno utrzymania,
    wynik jest ``NIEROZSTRZYGALNE`` — nie ``NIE_SPELNIA``, bo brak obserwacji to
    nie jest obserwacja braku.
    """
    t = np.asarray(przebieg.czas_s, dtype=np.float64)
    p = np.asarray(przebieg.wartosci, dtype=np.float64)
    prog = kryterium.prog_wzgledny * moc_przed_zaklocaniem_pu

    maska = t >= chwila_wylaczenia_s - TOLERANCJA_CZASU_S
    if np.count_nonzero(maska) < 2:
        return OcenaOdbudowyMocy(
            werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
            czas_odbudowy_s=None,
            prog_pu=prog,
            uzasadnienie_pl=(
                "Przebieg mocy nie pokrywa czasu po wyłączeniu zwarcia — "
                "odbudowy nie da się ani potwierdzić, ani wykluczyć."
            ),
        )
    t_po, p_po = t[maska], p[maska]
    koniec_danych = float(t_po[-1])

    for poczatek, koniec in _przedzialy_powyzej_progu(t_po, p_po, prog):
        if koniec - poczatek >= kryterium.czas_utrzymania_s - TOLERANCJA_CZASU_S:
            czas = float(poczatek - chwila_wylaczenia_s)
            if (
                kryterium.maksymalny_czas_s is not None
                and czas > kryterium.maksymalny_czas_s + TOLERANCJA_CZASU_S
            ):
                return OcenaOdbudowyMocy(
                    werdykt=WerdyktFrt.NIE_SPELNIA,
                    czas_odbudowy_s=czas,
                    prog_pu=prog,
                    uzasadnienie_pl=(
                        f"Moc odbudowana trwale po {czas:.4f} s, wymagane "
                        f"≤ {kryterium.maksymalny_czas_s:.4f} s "
                        f"(próg {prog:.4f} p.u. utrzymany przez "
                        f"{kryterium.czas_utrzymania_s:.4f} s)."
                    ),
                )
            return OcenaOdbudowyMocy(
                werdykt=WerdyktFrt.SPELNIA,
                czas_odbudowy_s=czas,
                prog_pu=prog,
                uzasadnienie_pl=(
                    f"Moc przekroczyła próg {prog:.4f} p.u. po {czas:.4f} s "
                    f"i utrzymała go przez wymagane {kryterium.czas_utrzymania_s:.4f} s."
                ),
            )

    # Żaden przedział nie osiągnął pełnego okna utrzymania. Rozstrzygnięcie zależy
    # od tego, CZY dane w ogóle pozwalały je zaobserwować.
    otwarte = [
        (a, b)
        for a, b in _przedzialy_powyzej_progu(t_po, p_po, prog)
        if abs(b - koniec_danych) <= TOLERANCJA_CZASU_S
    ]
    if otwarte:
        return OcenaOdbudowyMocy(
            werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
            czas_odbudowy_s=None,
            prog_pu=prog,
            uzasadnienie_pl=(
                f"Moc jest powyżej progu {prog:.4f} p.u. od t={otwarte[-1][0]:.4f} s, ale "
                f"przebieg kończy się w {koniec_danych:.4f} s, zanim upłynie wymagane "
                f"{kryterium.czas_utrzymania_s:.4f} s utrzymania — odbudowy nie da się potwierdzić."
            ),
        )
    if kryterium.maksymalny_czas_s is not None:
        wymagany_koniec = (
            chwila_wylaczenia_s + kryterium.maksymalny_czas_s + kryterium.czas_utrzymania_s
        )
        if koniec_danych < wymagany_koniec - TOLERANCJA_CZASU_S:
            return OcenaOdbudowyMocy(
                werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
                czas_odbudowy_s=None,
                prog_pu=prog,
                uzasadnienie_pl=(
                    f"Przebieg kończy się w {koniec_danych:.4f} s, przed chwilą "
                    f"{wymagany_koniec:.4f} s, do której wymaganie dopuszcza odbudowę — "
                    "braku odbudowy nie da się stwierdzić."
                ),
            )
    return OcenaOdbudowyMocy(
        werdykt=WerdyktFrt.NIE_SPELNIA,
        czas_odbudowy_s=None,
        prog_pu=prog,
        uzasadnienie_pl=(
            f"Moc ani razu nie utrzymała progu {prog:.4f} p.u. przez wymagane "
            f"{kryterium.czas_utrzymania_s:.4f} s do końca obserwacji ({koniec_danych:.4f} s)."
        ),
    )


@dataclass(frozen=True)
class WymaganiePraduBiernego:
    """Wymaganie wsparcia napięcia prądem biernym w czasie zapadu (typu NC RfG k).

    ``wspolczynnik_k`` [p.u./p.u.]: wymagany przyrost prądu biernego na jednostkę
    zapadu napięcia poza pasmem martwym.

    GRANICA TEGO KRYTERIUM — nazwana, nie ukryta: sprawdzany jest wyłącznie
    warunek amplitudowy ``ΔIq >= k·(ΔU − pasmo_martwe)`` w oknie zapadu. NIE są
    sprawdzane: czas narastania odpowiedzi, dokładność regulacji w stanie
    ustalonym ani zachowanie po ustąpieniu zapadu. Profil operatora, który stawia
    te wymagania, NIE jest tym kryterium pokryty i nie wolno twierdzić inaczej.
    """

    wspolczynnik_k: float
    pasmo_martwe_pu: float = 0.1

    def __post_init__(self) -> None:
        if self.wspolczynnik_k < 0.0:
            raise ValueError("wspolczynnik_k nie może być ujemny")


@dataclass(frozen=True)
class WymaganieZdolnosciFrt:
    """CO profil wymaga — komplet kryteriów podlegających ocenie.

    Każde pole ``None`` znaczy „profil tego nie wymaga", a NIE „pomijamy". Jeżeli
    profil wymaga kryterium, a danych brak, ocena kończy się NIEROZSTRZYGALNE.
    """

    obwiednia: ObwiedniaFrt
    horyzont_s: float
    wymaga_stanu_przylaczenia: bool = True
    kryterium_odbudowy: KryteriumOdbudowyMocy | None = None
    wymaganie_pradu_biernego: WymaganiePraduBiernego | None = None
    tolerancja_napiecia_pu: float = 0.0
    maks_odstep_probek_s: float | None = None
    identyfikator_profilu: str = ""

    def __post_init__(self) -> None:
        if self.horyzont_s <= 0.0:
            raise ValueError("horyzont_s musi być dodatni — okno zerowej długości nic nie orzeka")


@dataclass(frozen=True)
class WierszWhiteBox:
    """Jeden wiersz uzasadnienia: co zmierzono, wobec czego, z jakim marginesem.

    Defekt P0-01 polegał na tym, że ślad zapisywał wartość WYMAGANIA w kolumnie
    wielkości zmierzonej. Tutaj to są dwa osobne pola i osobne źródła — wiersz,
    w którym ``zmierzone`` pochodzi z obwiedni, jest niewyrażalny.
    """

    kryterium: str
    werdykt: WerdyktFrt
    zmierzone: float | None
    jednostka_zmierzonego: str
    wymagane: float | None
    margines: float | None
    chwila_s: float | None
    okno_od_s: float
    okno_do_s: float
    dane_kompletne: bool
    zrodlo_przebiegu: str
    uzasadnienie_pl: str


@dataclass(frozen=True)
class OcenaZdolnosciFrt:
    """PEŁNA ocena zdolności FRT — złożenie wszystkich wymaganych kryteriów.

    Werdykt ``SPELNIA`` wymaga, żeby KAŻDE wymagane kryterium było rozstrzygnięte
    pozytywnie. Jedno ``NIEROZSTRZYGALNE`` czyni całość nierozstrzygalną; jedno
    ``NIE_SPELNIA`` czyni całość negatywną. Nie ma sumowania „większość kryteriów
    przeszła".
    """

    werdykt: WerdyktFrt
    wiersze: tuple[WierszWhiteBox, ...]
    element_ref: str
    identyfikator_profilu: str
    uzasadnienie_pl: str
    status_dowodowy_pl: str = (
        "UNVALIDATED_MODEL — wynik laboratorium badawczego. Przydatność dowodową "
        "rozstrzyga rejestr `solver_input.provenance` po stronie produkcji, nie ten typ."
    )
    kryteria_niepokryte: tuple[str, ...] = ()
    """Kryteria wymagane przez profil, dla których NIE było danych."""

    @property
    def spelnia(self) -> bool:
        return self.werdykt is WerdyktFrt.SPELNIA


def _ocen_prad_bierny(
    przebieg_iq: PrzebiegSkalarny,
    przebieg_u: PrzebiegNapiecia,
    wymaganie: WymaganiePraduBiernego,
    *,
    okno_od_s: float,
    okno_do_s: float,
    napiecie_przed_pu: float,
    iq_przed_pu: float,
) -> WierszWhiteBox:
    """Amplitudowy warunek wsparcia napięcia — ``ΔIq >= k·(ΔU − pasmo_martwe)``."""
    t_iq = np.asarray(przebieg_iq.czas_s, dtype=np.float64)
    iq = np.asarray(przebieg_iq.wartosci, dtype=np.float64)
    t_u = np.asarray(przebieg_u.czas_s, dtype=np.float64)
    u = np.asarray(przebieg_u.napiecie_pu, dtype=np.float64)

    siatka = np.unique(np.concatenate([t_iq, t_u, np.array([okno_od_s, okno_do_s])]))
    siatka = siatka[
        (siatka >= okno_od_s - TOLERANCJA_CZASU_S) & (siatka <= okno_do_s + TOLERANCJA_CZASU_S)
    ]
    if siatka.size == 0:
        return WierszWhiteBox(
            kryterium="prad_bierny",
            werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
            zmierzone=None,
            jednostka_zmierzonego=przebieg_iq.jednostka,
            wymagane=None,
            margines=None,
            chwila_s=None,
            okno_od_s=okno_od_s,
            okno_do_s=okno_do_s,
            dane_kompletne=False,
            zrodlo_przebiegu=przebieg_iq.zrodlo,
            uzasadnienie_pl="Brak próbek prądu biernego w oknie oceny.",
        )

    iq_s = np.interp(siatka, t_iq, iq)
    u_s = np.interp(siatka, t_u, u)
    zapad = np.maximum(napiecie_przed_pu - u_s - wymaganie.pasmo_martwe_pu, 0.0)
    wymagany_przyrost = wymaganie.wspolczynnik_k * zapad
    margines = (iq_s - iq_przed_pu) - wymagany_przyrost

    i = int(np.argmin(margines))
    ok = float(margines[i]) >= 0.0
    return WierszWhiteBox(
        kryterium="prad_bierny",
        werdykt=WerdyktFrt.SPELNIA if ok else WerdyktFrt.NIE_SPELNIA,
        zmierzone=float(iq_s[i] - iq_przed_pu),
        jednostka_zmierzonego=przebieg_iq.jednostka,
        wymagane=float(wymagany_przyrost[i]),
        margines=float(margines[i]),
        chwila_s=float(siatka[i]),
        okno_od_s=okno_od_s,
        okno_do_s=okno_do_s,
        dane_kompletne=True,
        zrodlo_przebiegu=przebieg_iq.zrodlo,
        uzasadnienie_pl=(
            f"Najmniejsza rezerwa w t={float(siatka[i]):.4f} s: ΔIq={float(iq_s[i] - iq_przed_pu):+.4f}, "
            f"wymagane ≥ {float(wymagany_przyrost[i]):+.4f} (k={wymaganie.wspolczynnik_k:g}, "
            f"pasmo martwe {wymaganie.pasmo_martwe_pu:g} p.u.)."
        ),
    )


def ocen_zdolnosc_frt(
    *,
    przebieg_napiecia: PrzebiegNapiecia,
    wymaganie: WymaganieZdolnosciFrt,
    chwila_zaklocenia_s: float,
    stan_przylaczenia: StanPrzylaczenia | None = None,
    przebieg_mocy: PrzebiegSkalarny | None = None,
    moc_przed_zaklocaniem_pu: float | None = None,
    chwila_wylaczenia_s: float | None = None,
    przebieg_pradu_biernego: PrzebiegSkalarny | None = None,
    napiecie_przed_zaklocaniem_pu: float | None = None,
    prad_bierny_przed_zaklocaniem_pu: float | None = None,
) -> OcenaZdolnosciFrt:
    """Złóż wszystkie wymagane kryteria FRT w JEDEN werdykt — fail-closed.

    To jest funkcja, której poprzednia wersja modułu nie miała: ``ocen_frt``
    sprawdzała wyłącznie obwiednię napięcia, a nazwa sugerowała pełną ocenę.
    Tutaj każde kryterium wymagane przez profil musi dostać dane; brak danych
    daje ``NIEROZSTRZYGALNE``, nigdy ``SPELNIA``.
    """
    okno_od = float(chwila_zaklocenia_s)
    okno_do = okno_od + float(wymaganie.horyzont_s)
    wiersze: list[WierszWhiteBox] = []
    niepokryte: list[str] = []

    ocena_u = ocen_obwiednie_napiecia(
        przebieg_napiecia,
        wymaganie.obwiednia,
        chwila_zaklocenia_s=okno_od,
        tolerancja_pu=wymaganie.tolerancja_napiecia_pu,
        horyzont_s=wymaganie.horyzont_s,
        maks_odstep_probek_s=wymaganie.maks_odstep_probek_s,
    )
    wiersze.append(
        WierszWhiteBox(
            kryterium=f"obwiednia_{wymaganie.obwiednia.rodzaj}",
            werdykt=ocena_u.werdykt,
            zmierzone=ocena_u.napiecie_zmierzone_pu,
            jednostka_zmierzonego="p.u.",
            wymagane=ocena_u.napiecie_wymagane_pu,
            margines=ocena_u.margines_pu,
            chwila_s=ocena_u.chwila_krytyczna_s,
            okno_od_s=okno_od,
            okno_do_s=okno_do,
            dane_kompletne=not ocena_u.braki_pokrycia,
            zrodlo_przebiegu=przebieg_napiecia.zrodlo,
            uzasadnienie_pl=ocena_u.uzasadnienie_pl,
        )
    )
    if ocena_u.braki_pokrycia:
        niepokryte.append(f"obwiednia_{wymaganie.obwiednia.rodzaj}")

    if wymaganie.wymaga_stanu_przylaczenia:
        if stan_przylaczenia is None:
            niepokryte.append("stan_przylaczenia")
            wiersze.append(
                WierszWhiteBox(
                    kryterium="stan_przylaczenia",
                    werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
                    zmierzone=None,
                    jednostka_zmierzonego="—",
                    wymagane=None,
                    margines=None,
                    chwila_s=None,
                    okno_od_s=okno_od,
                    okno_do_s=okno_do,
                    dane_kompletne=False,
                    zrodlo_przebiegu="—",
                    uzasadnienie_pl=(
                        "Profil wymaga potwierdzenia, że moduł pozostał przyłączony, a "
                        "przebiegu stanu przyłączenia nie podano. BRAK sygnału wyłączenia "
                        "NIE jest dowodem przyłączenia."
                    ),
                )
            )
        else:
            odlaczenie = stan_przylaczenia.pierwsze_odlaczenie(okno_od, okno_do)
            wiersze.append(
                WierszWhiteBox(
                    kryterium="stan_przylaczenia",
                    werdykt=(WerdyktFrt.SPELNIA if odlaczenie is None else WerdyktFrt.NIE_SPELNIA),
                    zmierzone=None if odlaczenie is None else odlaczenie,
                    jednostka_zmierzonego="s",
                    wymagane=None,
                    margines=None,
                    chwila_s=odlaczenie,
                    okno_od_s=okno_od,
                    okno_do_s=okno_do,
                    dane_kompletne=True,
                    zrodlo_przebiegu=stan_przylaczenia.zrodlo,
                    uzasadnienie_pl=(
                        "Moduł pozostał przyłączony przez całe okno oceny."
                        if odlaczenie is None
                        else f"Moduł odłączył się w t={odlaczenie:.4f} s, wewnątrz okna oceny."
                    ),
                )
            )

    if wymaganie.kryterium_odbudowy is not None:
        brakuje = (
            przebieg_mocy is None or moc_przed_zaklocaniem_pu is None or chwila_wylaczenia_s is None
        )
        if brakuje:
            niepokryte.append("odbudowa_mocy")
            wiersze.append(
                WierszWhiteBox(
                    kryterium="odbudowa_mocy",
                    werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
                    zmierzone=None,
                    jednostka_zmierzonego="s",
                    wymagane=wymaganie.kryterium_odbudowy.maksymalny_czas_s,
                    margines=None,
                    chwila_s=None,
                    okno_od_s=okno_od,
                    okno_do_s=okno_do,
                    dane_kompletne=False,
                    zrodlo_przebiegu="—",
                    uzasadnienie_pl=(
                        "Profil wymaga oceny odbudowy mocy, a nie podano kompletu: "
                        "przebiegu P(t), mocy przed zakłóceniem i chwili wyłączenia."
                    ),
                )
            )
        else:
            assert przebieg_mocy is not None
            assert moc_przed_zaklocaniem_pu is not None
            assert chwila_wylaczenia_s is not None
            ocena_p = ocen_odbudowe_mocy(
                przebieg_mocy,
                wymaganie.kryterium_odbudowy,
                moc_przed_zaklocaniem_pu=moc_przed_zaklocaniem_pu,
                chwila_wylaczenia_s=chwila_wylaczenia_s,
            )
            if ocena_p.werdykt is WerdyktFrt.NIEROZSTRZYGALNE:
                niepokryte.append("odbudowa_mocy")
            wiersze.append(
                WierszWhiteBox(
                    kryterium="odbudowa_mocy",
                    werdykt=ocena_p.werdykt,
                    zmierzone=ocena_p.czas_odbudowy_s,
                    jednostka_zmierzonego="s",
                    wymagane=wymaganie.kryterium_odbudowy.maksymalny_czas_s,
                    margines=(
                        None
                        if (
                            ocena_p.czas_odbudowy_s is None
                            or wymaganie.kryterium_odbudowy.maksymalny_czas_s is None
                        )
                        else wymaganie.kryterium_odbudowy.maksymalny_czas_s
                        - ocena_p.czas_odbudowy_s
                    ),
                    chwila_s=ocena_p.czas_odbudowy_s,
                    okno_od_s=okno_od,
                    okno_do_s=okno_do,
                    dane_kompletne=ocena_p.werdykt is not WerdyktFrt.NIEROZSTRZYGALNE,
                    zrodlo_przebiegu=przebieg_mocy.zrodlo,
                    uzasadnienie_pl=ocena_p.uzasadnienie_pl,
                )
            )

    if wymaganie.wymaganie_pradu_biernego is not None:
        brakuje_iq = (
            przebieg_pradu_biernego is None
            or napiecie_przed_zaklocaniem_pu is None
            or prad_bierny_przed_zaklocaniem_pu is None
        )
        if brakuje_iq:
            niepokryte.append("prad_bierny")
            wiersze.append(
                WierszWhiteBox(
                    kryterium="prad_bierny",
                    werdykt=WerdyktFrt.NIEROZSTRZYGALNE,
                    zmierzone=None,
                    jednostka_zmierzonego="p.u.",
                    wymagane=None,
                    margines=None,
                    chwila_s=None,
                    okno_od_s=okno_od,
                    okno_do_s=okno_do,
                    dane_kompletne=False,
                    zrodlo_przebiegu="—",
                    uzasadnienie_pl=(
                        "Profil wymaga wsparcia napięcia prądem biernym, a nie podano "
                        "przebiegu Iq(t) wraz z wartościami sprzed zakłócenia."
                    ),
                )
            )
        else:
            assert przebieg_pradu_biernego is not None
            assert napiecie_przed_zaklocaniem_pu is not None
            assert prad_bierny_przed_zaklocaniem_pu is not None
            wiersze.append(
                _ocen_prad_bierny(
                    przebieg_pradu_biernego,
                    przebieg_napiecia,
                    wymaganie.wymaganie_pradu_biernego,
                    okno_od_s=okno_od,
                    okno_do_s=okno_do,
                    napiecie_przed_pu=napiecie_przed_zaklocaniem_pu,
                    iq_przed_pu=prad_bierny_przed_zaklocaniem_pu,
                )
            )

    werdykty = [w.werdykt for w in wiersze]
    if WerdyktFrt.NIE_SPELNIA in werdykty:
        calosc = WerdyktFrt.NIE_SPELNIA
    elif WerdyktFrt.NIEROZSTRZYGALNE in werdykty:
        calosc = WerdyktFrt.NIEROZSTRZYGALNE
    else:
        calosc = WerdyktFrt.SPELNIA

    negatywne = [w.kryterium for w in wiersze if w.werdykt is WerdyktFrt.NIE_SPELNIA]
    nierozstrzygniete = [w.kryterium for w in wiersze if w.werdykt is WerdyktFrt.NIEROZSTRZYGALNE]
    if calosc is WerdyktFrt.SPELNIA:
        uzasadnienie = (
            f"Wszystkie {len(wiersze)} wymagane kryteria rozstrzygnięte pozytywnie "
            f"w oknie [{okno_od:.4f}, {okno_do:.4f}] s."
        )
    elif calosc is WerdyktFrt.NIE_SPELNIA:
        uzasadnienie = "Kryteria niespełnione: " + ", ".join(negatywne) + "."
    else:
        uzasadnienie = (
            "Kryteria nierozstrzygalne z powodu braku danych: "
            + ", ".join(nierozstrzygniete)
            + ". Brak danych NIE jest spełnieniem wymagania."
        )

    return OcenaZdolnosciFrt(
        werdykt=calosc,
        wiersze=tuple(wiersze),
        element_ref=przebieg_napiecia.element_ref,
        identyfikator_profilu=wymaganie.identyfikator_profilu,
        uzasadnienie_pl=uzasadnienie,
        kryteria_niepokryte=tuple(dict.fromkeys(niepokryte)),
    )
