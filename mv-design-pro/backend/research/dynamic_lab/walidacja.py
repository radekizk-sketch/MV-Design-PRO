"""Framework walidacyjny: metryki zgodności + wyrocznie analityczne.

KOD BADAWCZY — patrz `backend/research/README.md`.

Rozdziela pięć POZIOMÓW POPRAWNOŚCI, których mylenie było źródłem fałszywej
pewności w audytowanym systemie (§28: 84% testów dynamicznych sprawdzało wyłącznie
kształt kontraktu, a mimo to całość raportowano jako działającą):

1. **Poprawność kodu** — czy się wykonuje, czy kontrakt się zgadza (testy kształtu).
2. **Poprawność numeryczna** — czy metoda zbiega, czy krok nie psuje wyniku.
3. **Poprawność modelu** — czy równania odpowiadają zamierzonej fizyce
   (WYROCZNIA ANALITYCZNA — jedyny poziom dający dowód bez narzędzia zewnętrznego).
4. **Zgodność z wzorcem** — czy wynik zgadza się z niezależnym narzędziem/normą.
5. **Przydatność dowodowa** — decyzja rejestru proweniencji, NIE własność liczby.

Poziom 3 jest tu zaimplementowany w pełni, bo nie wymaga żadnej zależności
zewnętrznej — a jest mocniejszym dowodem niż porównanie z innym narzędziem,
które samo może być błędne.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from dynamic_lab.konwencje import OMEGA_S


@dataclass(frozen=True)
class MetrykiTrajektorii:
    """Metryki porównania dwóch przebiegów na wspólnej osi czasu."""

    blad_max: float
    blad_sredniokwadratowy: float
    blad_ustalony: float
    blad_wzgledny_szczytu: float

    def spelnia(
        self,
        *,
        max_blad_max: float = float("inf"),
        max_rmse: float = float("inf"),
        max_blad_ustalony: float = float("inf"),
    ) -> bool:
        return (
            self.blad_max <= max_blad_max
            and self.blad_sredniokwadratowy <= max_rmse
            and self.blad_ustalony <= max_blad_ustalony
        )


def porownaj_trajektorie(
    odniesienie: NDArray[np.float64] | list[float],
    badana: NDArray[np.float64] | list[float],
    *,
    udzial_ustalony: float = 0.2,
) -> MetrykiTrajektorii:
    """Policz metryki zgodności przebiegu badanego z odniesieniem.

    ``udzial_ustalony`` określa, jaka końcowa część przebiegu jest traktowana
    jako stan ustalony przy liczeniu ``blad_ustalony``.
    """
    a = np.asarray(odniesienie, dtype=np.float64)
    b = np.asarray(badana, dtype=np.float64)
    if a.shape != b.shape:
        raise ValueError(f"Różne długości przebiegów: {a.shape} vs {b.shape}")
    if a.size == 0:
        raise ValueError("Pusty przebieg")
    roznica = np.abs(a - b)
    n_ust = max(1, int(a.size * udzial_ustalony))
    szczyt_a = float(np.max(np.abs(a)))
    return MetrykiTrajektorii(
        blad_max=float(np.max(roznica)),
        blad_sredniokwadratowy=float(np.sqrt(np.mean((a - b) ** 2))),
        blad_ustalony=float(np.mean(roznica[-n_ust:])),
        blad_wzgledny_szczytu=(
            float(abs(np.max(np.abs(b)) - szczyt_a) / szczyt_a) if szczyt_a > 1e-12 else 0.0
        ),
    )


def czas_ustalenia(
    czas: NDArray[np.float64] | list[float],
    sygnal: NDArray[np.float64] | list[float],
    *,
    wartosc_docelowa: float,
    pasmo: float,
    od_chwili_s: float = 0.0,
) -> float | None:
    """Chwila, od której sygnał na trwałe pozostaje w paśmie wokół wartości docelowej.

    Zwraca ``None``, gdy sygnał nigdy się nie ustala — i to jest wynik uczciwy,
    a nie powód, by podstawić wartość domyślną.
    """
    t = np.asarray(czas, dtype=np.float64)
    y = np.asarray(sygnal, dtype=np.float64)
    poza = np.abs(y - wartosc_docelowa) > pasmo
    dozwolone = t >= od_chwili_s
    indeksy = np.where(poza & dozwolone)[0]
    if indeksy.size == 0:
        kandydaci = np.where(dozwolone)[0]
        return float(t[kandydaci[0]]) if kandydaci.size else None
    ostatni = int(indeksy[-1])
    if ostatni + 1 >= t.size:
        return None
    return float(t[ostatni + 1])


def przeregulowanie(sygnal: NDArray[np.float64] | list[float], *, wartosc_ustalona: float) -> float:
    """Względne przeregulowanie ponad wartość ustaloną (0.0 = brak)."""
    y = np.asarray(sygnal, dtype=np.float64)
    if abs(wartosc_ustalona) < 1e-12:
        return float(np.max(np.abs(y)))
    return float(max(0.0, (np.max(y) - wartosc_ustalona) / abs(wartosc_ustalona)))


# ---------------------------------------------------------------------------
# WYROCZNIE ANALITYCZNE (poziom 3 — dowód bez narzędzia zewnętrznego)
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WyroczniaWahan:
    """Analityczna wyrocznia elektromechanicznych wahań maszyny klasycznej.

    Zakres stosowalności (poza nim wyrocznia NIE obowiązuje):
      - maszyna klasyczna: ``Xd = Xd' = Xq = Xq'``, ``Ra = 0``,
        stała SEM przejściowa ``E'`` (brak AVR i regulatora turbiny),
      - szyna sztywna o napięciu ``v_sys`` za reaktancją ``x_zewnetrzna``,
      - małe odchyłki wokół punktu pracy ``delta0``.

    Linearyzacja równania wahań:

        2H * d²(Δδ)/dt² + D * d(Δδ)/dt + ω_s * P_s * Δδ = 0
        P_s = dPe/dδ = E' * V_sys * cos(δ0) / X_całkowite    [moc synchronizująca]

    stąd:

        ω_n = sqrt(ω_s * P_s / (2H))         [rad/s]
        f_n = ω_n / (2π)                      [Hz]
        ζ   = D / (2 * sqrt(2H * ω_s * P_s))  [-]
    """

    e_prim_pu: float
    v_sys_pu: float
    x_calkowite_pu: float
    delta0_rad: float
    h_s: float
    d_tlumienie: float = 0.0

    @property
    def moc_synchronizujaca(self) -> float:
        return self.e_prim_pu * self.v_sys_pu * math.cos(self.delta0_rad) / self.x_calkowite_pu

    @property
    def pulsacja_wlasna_rad_s(self) -> float:
        ps = self.moc_synchronizujaca
        if ps <= 0.0:
            raise ValueError(
                "Ujemna moc synchronizująca — punkt pracy poza obszarem stabilności "
                "statycznej; wyrocznia nie obowiązuje."
            )
        return math.sqrt(OMEGA_S * ps / (2.0 * self.h_s))

    @property
    def czestotliwosc_wlasna_hz(self) -> float:
        return self.pulsacja_wlasna_rad_s / (2.0 * math.pi)

    @property
    def wspolczynnik_tlumienia(self) -> float:
        ps = self.moc_synchronizujaca
        return self.d_tlumienie / (2.0 * math.sqrt(2.0 * self.h_s * OMEGA_S * ps))


def zmierz_czestotliwosc_oscylacji(
    czas: NDArray[np.float64] | list[float],
    sygnal: NDArray[np.float64] | list[float],
) -> float | None:
    """Częstotliwość oscylacji z przejść przez wartość średnią (w górę).

    Zwraca ``None``, gdy przebieg nie ma co najmniej dwóch przejść — brak
    pomiaru jest wynikiem, nie powodem do zgadywania.
    """
    t = np.asarray(czas, dtype=np.float64)
    y = np.asarray(sygnal, dtype=np.float64)
    if t.size < 3:
        return None
    odchylka = y - float(np.mean(y))
    znaki = np.sign(odchylka)
    przejscia = np.where((znaki[:-1] < 0) & (znaki[1:] >= 0))[0]
    if przejscia.size < 2:
        return None
    okresy = np.diff(t[przejscia])
    if okresy.size == 0 or float(np.mean(okresy)) <= 0.0:
        return None
    return float(1.0 / np.mean(okresy))


@dataclass(frozen=True)
class WyroczniaRownychPol:
    """Analityczna wyrocznia CZASU KRYTYCZNEGO zwarcia (kryterium równych pól).

    Uzupełnia ``WyroczniaWahan`` o drugą, NIEZALEŻNĄ oś: tamta sprawdza
    zachowanie MAŁOSYGNAŁOWE (częstotliwość wahań w granicy amplitudy → 0),
    ta sprawdza zachowanie DUŻOSYGNAŁOWE — nieliniowe równanie wahań przy
    zwarciu i jego zdjęciu. Model może być poprawny małosygnałowo i błędny
    dużosygnałowo (np. gdy zwarcie jest stałą, a nie zmianą sieci), więc
    zgodność z jedną wyrocznią nie zastępuje drugiej.

    Zakres stosowalności (poza nim wyrocznia NIE obowiązuje):
      - maszyna klasyczna: ``Xd = Xd' = Xq = Xq'``, ``Ra = 0``, ``E' = const``
        (bez AVR i bez regulatora turbiny),
      - zwarcie **metaliczne na zaciskach maszyny**, więc ``Pe = 0`` w czasie
        zwarcia — dla zwarcia przez impedancję albo w innym węźle moc w czasie
        zwarcia jest niezerowa i wzór wymaga trzeciej charakterystyki,
      - **pełna odbudowa sieci** po zdjęciu zwarcia (nic nie zostaje wyłączone),
      - ``D = 0`` — tłumienie zwiększa rzeczywisty czas krytyczny, więc wyrocznia
        jest wtedy oszacowaniem OSTROŻNYM, nie dokładnym,
      - ``Pm = const`` w czasie zakłócenia.

    Wyprowadzenie (Kundur, *Power System Stability and Control*, rozdz. 13):

        pole przyspieszające   A1 = P0 · (δ_kr − δ0)
        pole hamujące          A2 = Pmax(cos δ_kr − cos δ_max) − P0(δ_max − δ_kr)
        A1 = A2  ⟹  cos δ_kr = P0 (δ_max − δ0) / Pmax + cos δ_max
        δ_max = π − δ0                       [punkt niestabilnej równowagi]

    a ponieważ w czasie zwarcia ``Pe = 0``:

        2H/ω_s · d²δ/dt² = P0   ⟹   δ(t) = δ0 + ω_s P0 t² / (4H)
        t_kr = sqrt( 4H (δ_kr − δ0) / (ω_s P0) )
    """

    e_prim_pu: float
    v_sys_pu: float
    x_calkowite_pu: float
    delta0_rad: float
    p0_pu: float
    h_s: float

    @property
    def moc_maksymalna(self) -> float:
        return self.e_prim_pu * self.v_sys_pu / self.x_calkowite_pu

    @property
    def delta_maksymalny_rad(self) -> float:
        """Punkt niestabilnej równowagi ``π − δ0``."""
        return math.pi - self.delta0_rad

    @property
    def delta_krytyczny_rad(self) -> float:
        """Kąt, powyżej którego pole hamujące nie wystarcza."""
        p_max = self.moc_maksymalna
        if p_max <= 0.0:
            raise ValueError("Zerowa moc maksymalna — wyrocznia nie obowiązuje")
        cos_kr = self.p0_pu * (self.delta_maksymalny_rad - self.delta0_rad) / p_max + math.cos(
            self.delta_maksymalny_rad
        )
        if not (-1.0 <= cos_kr <= 1.0):
            raise ValueError(
                f"cos(delta_kr) = {cos_kr:.6f} poza [-1, 1] — punkt pracy leży poza "
                "obszarem, w którym kryterium równych pól ma rozwiązanie "
                "(maszyna nie przetrwa nawet zwarcia chwilowego albo jest "
                "trwale stabilna w tym modelu)."
            )
        return math.acos(cos_kr)

    @property
    def czas_krytyczny_s(self) -> float:
        """CCT — największy czas trwania zwarcia zachowujący synchronizm."""
        if self.p0_pu <= 0.0:
            raise ValueError(
                "Kryterium wymaga dodatniej mocy początkowej — przy P0 = 0 "
                "wirnik nie przyspiesza i czas krytyczny nie istnieje."
            )
        return math.sqrt(
            4.0 * self.h_s * (self.delta_krytyczny_rad - self.delta0_rad) / (OMEGA_S * self.p0_pu)
        )
