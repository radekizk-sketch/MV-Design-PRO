r"""Porównanie trajektorii z ANDES — POMIAR NUMERYCZNY, nie walidacja fizyczna.

KOD BADAWCZY — patrz `backend/research/README.md`. **PROTOTYP, NIE KANON.**

CZYM TO JEST, A CZYM NIE JEST (plan naprawy §5)
------------------------------------------------
Porównanie SMIB zostaje, ale NIE WOLNO przedstawiać go jako dowodu, że model
opisuje rzeczywistą maszynę. Oba narzędzia całkują TEN SAM podręcznikowy model
klasyczny (stały moduł napięcia za reaktancją przejściową, bez regulatorów, bez
nasycenia, bez składowych przeciwnej i zerowej). Zgodność dwóch implementacji
tego samego równania dowodzi, że zgadza się RACHUNEK — całkowanie, obsługa
zdarzenia, algebra sieci. O tym, czy równanie opisuje maszynę, nie mówi nic.
To jest cross-check numeryczny; walidacja fizyczna wymagałaby pomiaru na
obiekcie i pozostaje POZA zakresem laboratorium.

DLACZEGO WZORZEC NIE JEST PRAWDĄ — ZMIERZONE, NIE ZAŁOŻONE
------------------------------------------------------------
Porównanie „narzędzie kontra narzędzie" ma wadę zasadniczą: rozbieżność nie
wskazuje winnego. Dlatego wprowadzony jest TRZECI ARBITER, niezależny od obu.
Dla maszyny klasycznej BEZ TŁUMIENIA (``D = 0``) istnieje ścisła całka pierwsza

.. math::

    V(\delta, \Delta\omega)
        = \frac{H}{\omega_b}\,\Delta\omega^{2}
        - P_m\,\delta
        - \frac{E' V_s}{X}\cos\delta = \mathrm{const},

bo :math:`dV/dt = \Delta\omega(P_m - P_e) - P_m\Delta\omega + P_e\Delta\omega = 0`.
Trajektoria dryfująca po tej całce całkuje niedokładnie — i mówi to bez
odwoływania się do drugiego narzędzia. ZMIERZONY dryf na horyzoncie 4 s
(≈5 okresów kołysania), odcinek po zdarzeniu:

    ============================  ==========  ==========  ==========  ==========
    bieg                            4 ms        2 ms        1 ms       0,5 ms
    ============================  ==========  ==========  ==========  ==========
    LAB rk4                        5,20e-11    1,66e-12    4,46e-14    1,29e-14
    LAB trapez_niejawny            2,54e-08    6,36e-09    1,59e-09    3,98e-10
    ANDES                          5,07e-08        —       1,03e-06   (0,125 ms:
                                                                       1,34e-06)
    ============================  ==========  ==========  ==========  ==========

Wnioski, wszystkie z pomiaru:

1. ``rk4`` laboratorium trzyma całkę na poziomie zaokrąglenia maszynowego już
   przy 1 ms (rzędy obserwowane +4,97, +5,22, potem podłoga). Jego błąd
   całkowania NIE MOŻE być źródłem rozbieżności rzędu 1e-05 rad.
2. ``trapez_niejawny`` laboratorium maleje jak ``dt^2`` (rzędy obserwowane
   +2,00, +2,00, +2,00) — dokładnie tyle, ile deklaruje ``TrapezNiejawny.rzad``.
3. Dryf ANDES ROŚNIE przy zagęszczaniu kroku: 5,07e-08 (4 ms) -> 1,03e-06 (1 ms)
   -> 1,34e-06 (0,125 ms). Kierunek jest odwrotny do obu powyższych.

DEFEKT ZNALEZIONY PRZY OKAZJI — WE WŁASNYM KODZIE, NAPRAWIONY
...............................................................
Punkt 2 brzmi dziś dobrze, ale PIERWSZY pomiar wyglądał inaczej::

    LAB trapez_niejawny (przed naprawą):  2,54e-08  6,36e-09  7,57e-06  1,55e-05
                                          ilorazy:    4,00      0,00      0,49

czyli laboratorium miało tę samą patologię, którą widać po stronie ANDES:
zagęszczanie kroku POGARSZAŁO wynik. Przyczyna została ustalona pomiarem i
usunięta u źródła (``calkowanie.wspolczynnik_kroku``): tolerancja równania kroku
była STAŁA i BEZWZGLĘDNA, a błąd jej rozwiązania kumuluje się liniowo z LICZBĄ
kroków (``N = T/dt``), podczas gdy błąd obcięcia maleje jak ``dt^p``. Poniżej
pewnego kroku wygrywał pierwszy. Po powiązaniu tolerancji z krokiem
(``dt^(rzad+1)``) rząd metody stał się osiągalny w całym zakresie.

Dla ANDES ta sama SYGNATURA (dryf rosnący z zagęszczaniem) jest przesłanką tej
samej klasy przyczyn — i tak, jako HIPOTEZA, jest tu nazwana. Nie jest to
twierdzenie o kodzie ANDES: jego wnętrza ten moduł nie bada i nie ma do tego
danych. Twierdzeniem jest wyłącznie POMIAR: bieg wzorca gubi wielkość, która ma
być zachowana, i gubi jej więcej przy krótszym kroku.

Konsekwencja rozstrzygająca: bieg ANDES o kroku 0,125 ms NIE jest — w sensie tej
całki — przybliżeniem prawdy lepszym niż bieg o kroku 4 ms (jest gorszy). Wobec
tego NIE WOLNO używać go jako wzorca RZĘDU ZBIEŻNOŚCI laboratorium. Rząd metody
laboratorium mierzy się tu po całce pierwszej, nie po wzorcu.

PODŁOGA ≈3e-05 rad — WYJAŚNIONA, NIE UKRYTA
---------------------------------------------
Poprzednia wersja raportowała, że błąd trajektorii przestaje maleć około
3e-05 rad, i stawiała hipotezę: „ANDES zagęszcza krok w otoczeniu przełączenia,
a laboratorium przechodzi przez tę chwilę krokiem stałym". Hipoteza została
OBALONA POMIAREM. Gdyby chodziło o traktowanie nieciągłości, błąd zależałby od
kroku LABORATORIUM. Zmierzone max |Δδ| wobec ANDES(0,125 ms), ``rk4``, odcinek
po zdarzeniu::

    dt = 4 ms     -> 3,2478e-05
    dt = 2 ms     -> 3,2492e-05
    dt = 1 ms     -> 3,2495e-05
    dt = 0,5 ms   -> 3,2495e-05

czyli błąd jest STAŁY co do czwartej cyfry przy ośmiokrotnej zmianie kroku.
Poprzedni „spadek z krokiem" był artefaktem metody: zmieniano JEDNOCZEŚNIE krok
obu narzędzi, więc malał błąd WZORCA, a przypisywano to laboratorium.

Czym podłoga jest naprawdę — zmierzone na tym samym biegu:

* okres kołysania zgadza się do rozdzielczości próbkowania (0,788000 s w obu
  narzędziach, różnica < 1e-06 s) — błędu FAZY nie ma;
* amplituda laboratorium jest STAŁA przez cztery okresy (0,37649387, 0,37649344,
  0,37649377, 0,37649392 rad) — jedyne poprawne zachowanie przy ``D = 0``;
* amplituda ANDES MALEJE monotonicznie (0,37649246, 0,37648925, 0,37648703,
  0,37648440 rad), a minima rosną — bieg wzorca jest DYSYPATYWNY tam, gdzie
  fizyka dysypacji nie przewiduje;
* obwiednia różnicy ROŚNIE z czasem i osiąga maksimum na końcu horyzontu
  (1,19e-05 rad przy t = 1,05 s wobec 3,25e-05 rad przy t = 4,00 s).

Podłoga jest więc TŁUMIENIEM NUMERYCZNYM WZORCA narastającym z liczbą okresów,
a nie błędem laboratorium ani różnicą traktowania przełączenia. Zgadza się to z
tabelą całki pierwszej: dryfuje ten bieg, którego amplituda opada.

SEMANTYKA CHWILI PRZEŁĄCZENIA — NAZWANA, BO SIATKI SIĘ RÓŻNIĄ
---------------------------------------------------------------
ZMIERZONE osie czasu wokół ``t_zd = 1,0 s``:

* ANDES: ``… 0,9970 0,9980 0,9990 0,99990 1,00000 1,00010 1,0011 …`` — wzorzec
  WSTAWIA trzy punkty w otoczeniu przełączenia z krokiem 1e-04 s niezależnie od
  zadanego ``tstep`` (zmierzone min ``dt`` = 1,000000e-04 s przy ``tstep`` 4 ms
  ORAZ 1 ms). Wzorzec nie zapisuje też próbki dla ``t = 0``: pierwsza próbka
  przypada na ``t = tstep``;
* laboratorium: ``… 0,997 0,998 0,999 1,000 1,001 …`` — krok stały, ale siatka
  ZAWIERA chwilę zdarzenia dokładnie (``SilnikRMS.siatka_czasu``), a pierwsza
  próbka przypada na ``t = 0``.

WSPÓLNA SEMANTYKA przyjęta w tym module: próbka w chwili ``t_zd`` opisuje stan
``0+`` (PO zmianie topologii) w OBU narzędziach. Dla porównywanych wielkości
(``delta_rad``, ``omega_pu``) jest to bez znaczenia, bo są to stany RÓŻNICZKOWE,
ciągłe na przełączeniu; różnica dotyczyłaby wielkości ALGEBRAICZNYCH (napięcia,
moce), których ten moduł nie porównuje — i to jest powód, dla którego ich nie
porównuje. Mimo to otoczenie przełączenia jest RAPORTOWANE OSOBNO
(``Odcinek.OKNO_PRZELACZENIA``): tam pochodna jest nieciągła, więc interpolacja
liniowa ma tam największy błąd, a mieszanie tego odcinka z gładkimi zamazywałoby
jedno w drugim.

ZAKRES DOWODU — granice nazwane, żeby nikt ich nie rozszerzył
--------------------------------------------------------------
* model: maszyna KLASYCZNA (GENCLS po stronie ANDES), bez regulatorów, ``D = 0``;
* zdarzenie: wyłączenie jednego z dwóch torów równoległych; zwarć NIE obejmuje;
* wielkości: kąt wirnika i prędkość; napięć i mocy NIE porównuje;
* wynik: zgodność RACHUNKU dwóch implementacji tego samego równania.
"""

from __future__ import annotations

import contextlib
import io
import math
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

import numpy as np
from numpy.typing import NDArray

from dynamic_lab.benchmarki import maszyna_klasyczna
from dynamic_lab.konwencje import OMEGA_S
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.skonczonosc import wymagaj_skonczonosci
from dynamic_lab.urzadzenia import ZespolSynchroniczny
from dynamic_lab.wzorzec_zewnetrzny import (
    F_BAZOWA_HZ,
    BrakWzorcaError,
    czy_wzorzec_dostepny,
    wersja_wzorca,
)
from dynamic_lab.zdarzenia import HarmonogramZdarzen, WylaczenieGalezi

#: Tożsamość toru wyłączanego w scenariuszu — ta sama po obu stronach.
IDENT_TORU_WYLACZANEGO = "TOR_B"
IDENT_TORU_POZOSTAJACEGO = "TOR_A"

#: Wspólna semantyka chwili przełączenia — patrz sekcja docstringu modułu.
SEMANTYKA_PRZELACZENIA = (
    "Próbka w chwili zdarzenia opisuje stan 0+ (po zmianie topologii) w OBU "
    "narzędziach. Porównywane są wyłącznie stany RÓŻNICZKOWE (delta, omega), "
    "ciągłe na przełączeniu; wielkości algebraiczne nie są porównywane, bo dla "
    "nich ta semantyka musiałaby zostać rozstrzygnięta osobno."
)

#: Połowa szerokości okna przełączenia — STAŁA, niezależna od kroku laboratorium.
#:
#: PIERWSZA WERSJA SKALOWAŁA JĄ KROKIEM (``5 * dt``) i było to błędne. Skutek
#: ZMIERZONY na drabinie ``rk4``: max|Δδ| w oknie wychodziło 4,87e-06, 2,43e-06,
#: 1,20e-06, 5,92e-07, czyli „rząd obserwowany 1,00/1,01/1,03" — liczba, którą
#: łatwo wziąć za rząd metody. Nie była nim: błąd po zdarzeniu rośnie z odległością
#: od zdarzenia, więc okno KURCZĄCE SIĘ jak ``dt`` obcinało maksimum proporcjonalnie
#: do ``dt``. Mierzono szerokość okna, nie zbieżność.
#:
#: Okno musi mieć szerokość zjawiska, a nie kroku: trzy punkty, które wzorzec
#: wstawia wokół przełączenia (zmierzony min krok wzorca 1,0e-04 s), plus kilka
#: kroków najgrubszego szczebla drabiny (4 ms). Stąd 20 ms = 5 x 4 ms.
POLOWA_OKNA_PRZELACZENIA_S = 0.020

#: Ile kroków laboratorium musi zmieścić się w połowie okna, żeby okno w ogóle
#: obejmowało przejście. Sprawdzane, a nie zakładane.
MINIMUM_KROKOW_W_OKNIE = 3

#: Drabina kroku wymagana przez plan naprawy §5: dt, dt/2, dt/4, dt/8.
DRABINA_KROKOW_S: tuple[float, ...] = (0.004, 0.002, 0.001, 0.0005)

#: Krok biegu wzorcowego używanego jako ODNIESIENIE trajektorii. Najgęstszy, na
#: jaki stać pomiar — i jawnie NIE „prawda": patrz tabela całki pierwszej.
KROK_ODNIESIENIA_WZORCA_S = 0.000125

#: Tolerancja dopasowania chwili do próbki przy odczycie bez interpolacji.
TOLERANCJA_CZASU_S = 1.0e-9


class OsCzasuNiepoprawnaError(ValueError):
    """Oś czasu przebiegu nie jest skończona albo nie jest ściśle rosnąca.

    Oś malejąca lub z powtórzoną chwilą wywraca KAŻDĄ interpolację po cichu:
    ``numpy.interp`` nie sprawdza monotoniczności i zwraca liczby, tyle że
    bezsensowne. Wynik wygląda wtedy na policzony.
    """


class EkstrapolacjaZabronionaError(ValueError):
    """Żądany punkt leży poza zakresem danych przebiegu.

    ``numpy.interp`` poza zakresem PRZYTRZYMUJE wartość skrajną i nie mówi o tym
    ani słowa. Różnica dwóch przebiegów liczona na takim odcinku mierzy stałą
    wartość brzegową jednego z nich, a nie modele — i wychodzi tym mniejsza, im
    dalej poza dane sięgnie. Cichej ekstrapolacji nie da się odróżnić od zgody.
    """


class Odcinek(StrEnum):
    """Odcinki horyzontu raportowane OSOBNO (plan naprawy §5).

    Mieszanie ich w jedną liczbę zamazuje trzy różne zjawiska: dokładność punktu
    pracy, traktowanie nieciągłości i dokładność całkowania na gładkim.
    """

    PRZED = "przed_zdarzeniem"
    """Gładki odcinek przed zdarzeniem — układ stoi w punkcie pracy."""
    OKNO_PRZELACZENIA = "okno_przelaczenia"
    """Otoczenie zdarzenia: pochodna nieciągła, siatki narzędzi najbardziej różne."""
    PO = "po_zdarzeniu"
    """Gładki odcinek po zdarzeniu — kołysanie, tu widać błąd całkowania."""


class StatusPorownania(StrEnum):
    """Werdykt porównania. ``NIEROZSTRZYGNIETE`` jest pełnoprawnym wynikiem."""

    ZGODNE_W_GRANICACH_WZORCA = "zgodne_w_granicach_wzorca"
    """Różnica mieści się w niepewności WŁASNEJ wzorca — nie „model poprawny"."""
    NIEZGODNE = "niezgodne"
    NIEROZSTRZYGNIETE = "nierozstrzygniete"
    """Danych nie starczyło, żeby cokolwiek orzec (np. odcinek bez pokrycia)."""


@dataclass(frozen=True)
class PrzypadekTrajektorii:
    """Wspólna specyfikacja przypadku dla OBU narzędzi.

    Dwa tory po ``x_toru_pu``; po wyłączeniu jednego reaktancja korytarza się
    podwaja, co daje skokową zmianę mocy synchronizującej i wyraźne kołysanie.

    ``d_tlumienie = 0`` NIE jest wygodą, tylko warunkiem istnienia całki
    pierwszej, na której opiera się trzeci arbiter. Przy ``D != 0`` całka nie
    jest zachowana i cały mechanizm rozstrzygania „kto całkuje gorzej" znika —
    dlatego zmiana tej wartości jest zablokowana (patrz ``__post_init__``).
    """

    xd_prim_pu: float = 0.30
    h_s: float = 4.0
    d_tlumienie: float = 0.0
    x_toru_pu: float = 0.30
    p_gen_pu: float = 0.50
    v_gen_pu: float = 1.00
    v_sys_pu: float = 1.00
    s_bazowa_mva: float = 100.0
    u_znamionowe_kv: float = 110.0
    czas_wylaczenia_s: float = 1.0
    czas_koncowy_s: float = 4.0

    def __post_init__(self) -> None:
        if not 0.0 < self.czas_wylaczenia_s < self.czas_koncowy_s:
            raise ValueError(
                "Chwila wyłączenia musi leżeć wewnątrz horyzontu symulacji — inaczej "
                "porównywalibyśmy przebiegi bez zaburzenia."
            )
        if self.d_tlumienie != 0.0:
            raise ValueError(
                "Ten przypadek wymaga D = 0. Całka pierwsza maszyny klasycznej, "
                "będąca w tym module NIEZALEŻNYM arbitrem dokładności całkowania, "
                "jest zachowana tylko bez tłumienia. Z D != 0 porównanie zostałoby "
                'bez rozjemcy i wróciłoby do postaci „narzędzie kontra narzędzie", '
                "w której rozbieżność nie wskazuje winnego."
            )

    @property
    def x_korytarza_przed_pu(self) -> float:
        """Dwa tory równolegle."""
        return self.x_toru_pu / 2.0

    @property
    def x_korytarza_po_pu(self) -> float:
        return self.x_toru_pu

    @property
    def x_calkowite_przed_pu(self) -> float:
        """Reaktancja od źródła napięcia przejściowego do szyny sztywnej, przed."""
        return self.xd_prim_pu + self.x_korytarza_przed_pu

    @property
    def x_calkowite_po_pu(self) -> float:
        return self.xd_prim_pu + self.x_korytarza_po_pu

    def e_prim_pu(self, delta0_rad: float) -> float:
        """``E'`` wyprowadzone z WARUNKU RÓWNOWAGI, nie odczytane z narzędzia.

        W punkcie pracy ``P_e = P_m``, a dla maszyny klasycznej
        ``P_e = (E' V_s / X) sin(delta)``. Stąd

            ``E' = P_m X_przed / (V_s sin(delta_0))``.

        Wzór, a nie wartość wyjęta z wnętrza ANDES albo laboratorium — arbiter,
        który pożycza liczbę od jednej ze stron, przestaje być niezależny.
        """
        sinus = math.sin(delta0_rad)
        if abs(sinus) < 1.0e-12:
            raise ValueError(
                f"delta_0 = {delta0_rad!r} rad daje sin(delta_0) ≈ 0 — z warunku "
                f"równowagi nie da się wyznaczyć E'."
            )
        return self.p_gen_pu * self.x_calkowite_przed_pu / (self.v_sys_pu * sinus)


@dataclass(frozen=True)
class Przebieg:
    """Przebieg jednej wielkości na własnej siatce czasu — z KONTROLĄ osi.

    Kontrola jest w ``__post_init__``, a nie w funkcji porównującej, bo przebieg
    o wywróconej osi jest niepoprawny SAM W SOBIE: każdy odczyt z niego jest
    wtedy fikcją, niezależnie od tego, kto go czyta.
    """

    czas_s: NDArray[np.float64]
    wartosci: NDArray[np.float64]
    jednostka: str
    zrodlo: str = ""
    """Skąd przebieg pochodzi — wchodzi do komunikatów błędów."""

    def __post_init__(self) -> None:
        gdzie = self.zrodlo or "przebieg"
        wymagaj_skonczonosci(self.czas_s, co="oś czasu", gdzie=gdzie)
        wymagaj_skonczonosci(self.wartosci, co="wartości przebiegu", gdzie=gdzie)
        if self.czas_s.ndim != 1 or self.wartosci.ndim != 1:
            raise OsCzasuNiepoprawnaError(f"{gdzie}: przebieg musi być jednowymiarowy.")
        if self.czas_s.size != self.wartosci.size:
            raise OsCzasuNiepoprawnaError(
                f"{gdzie}: {self.czas_s.size} chwil wobec {self.wartosci.size} wartości."
            )
        if self.czas_s.size < 2:
            raise OsCzasuNiepoprawnaError(
                f"{gdzie}: przebieg z {self.czas_s.size} próbki nie jest trajektorią."
            )
        roznice = np.diff(self.czas_s)
        if not bool(np.all(roznice > 0.0)):
            zle = int(np.argmin(roznice))
            raise OsCzasuNiepoprawnaError(
                f"{gdzie}: oś czasu nie jest ściśle rosnąca — t[{zle}] = "
                f"{self.czas_s[zle]!r}, t[{zle + 1}] = {self.czas_s[zle + 1]!r}. "
                f"Interpolacja na takiej osi zwraca liczby bez znaczenia, a nie błąd."
            )

    @property
    def poczatek_s(self) -> float:
        return float(self.czas_s[0])

    @property
    def koniec_s(self) -> float:
        return float(self.czas_s[-1])

    def obejmuje(self, lo: float, hi: float) -> bool:
        """Czy dane pokrywają CAŁY przedział ``[lo, hi]`` bez ekstrapolacji."""
        return (
            self.poczatek_s <= lo + TOLERANCJA_CZASU_S and hi <= self.koniec_s + TOLERANCJA_CZASU_S
        )

    def na_siatce(self, siatka_s: NDArray[np.float64]) -> NDArray[np.float64]:
        """Interpolacja liniowa na zadaną siatkę — BEZ prawa do ekstrapolacji.

        Interpolacja jest liniowa świadomie: wyższy rząd wygładzałby przebieg i
        mógłby ukryć różnicę tuż po zdarzeniu, czyli dokładnie tam, gdzie
        porównanie jest najbardziej interesujące.

        Ekstrapolacja jest ZABRONIONA, a nie „niezalecana": ``numpy.interp`` poza
        zakresem zwraca wartość skrajną i milczy, więc odcinek bez danych
        wyglądałby jak odcinek o stałej, bardzo dobrej zgodności.
        """
        if siatka_s.size == 0:
            return np.asarray([], dtype=np.float64)
        lo = float(np.min(siatka_s))
        hi = float(np.max(siatka_s))
        if not self.obejmuje(lo, hi):
            raise EkstrapolacjaZabronionaError(
                f"{self.zrodlo or 'przebieg'}: żądany zakres [{lo!r}, {hi!r}] wychodzi "
                f"poza dane [{self.poczatek_s!r}, {self.koniec_s!r}]. Ekstrapolacja "
                f"dałaby wartość brzegową udającą wynik."
            )
        return np.interp(siatka_s, self.czas_s, self.wartosci)

    def w_zakresie(self, lo: float, hi: float) -> tuple[NDArray[np.float64], NDArray[np.float64]]:
        """WŁASNE próbki przebiegu leżące w ``[lo, hi]`` — bez interpolacji.

        Używane po stronie badanej: błąd liczony na punktach WŁASNYCH nie miesza
        błędu metody z błędem interpolacji tejże metody na obcą siatkę.
        """
        maska = (self.czas_s >= lo - TOLERANCJA_CZASU_S) & (self.czas_s <= hi + TOLERANCJA_CZASU_S)
        return self.czas_s[maska], self.wartosci[maska]


# ---------------------------------------------------------------------------
# TRZECI ARBITER: całka pierwsza maszyny klasycznej bez tłumienia
# ---------------------------------------------------------------------------


def energia_maszyny_klasycznej(
    przypadek: PrzypadekTrajektorii,
    delta_rad: NDArray[np.float64],
    omega_pu: NDArray[np.float64],
    *,
    e_prim_pu: float,
    x_pu: float,
) -> NDArray[np.float64]:
    r"""``V(delta, omega)`` — wielkość ZACHOWANA przy ``D = 0``.

    .. math::

        V = \frac{H}{\omega_b}\,\Delta\omega^{2} - P_m\,\delta
            - \frac{E' V_s}{X}\cos\delta

    przy ``Δω = ω_b (ω − 1)``. Jest to funkcja Lapunowa kryterium równych pól,
    użyta tutaj nie do oceny stabilności, tylko jako NIEZALEŻNA MIARA JAKOŚCI
    CAŁKOWANIA: jej dryf nie zależy od żadnego z dwóch porównywanych narzędzi.
    """
    d_omega = OMEGA_S * (omega_pu - 1.0)
    return (
        (przypadek.h_s / OMEGA_S) * d_omega**2
        - przypadek.p_gen_pu * delta_rad
        - (e_prim_pu * przypadek.v_sys_pu / x_pu) * np.cos(delta_rad)
    )


@dataclass(frozen=True)
class DryfNiezmiennika:
    """Dryf całki pierwszej na odcinku PO zdarzeniu — miara błędu całkowania."""

    zrodlo: str
    krok_s: float
    wartosc_poczatkowa: float
    maks_dryf_bezwzgledny: float
    dryf_koncowy: float
    maks_dryf_wzgledny: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "zrodlo": self.zrodlo,
            "krok_s": self.krok_s,
            "wartosc_poczatkowa": self.wartosc_poczatkowa,
            "maks_dryf_bezwzgledny": self.maks_dryf_bezwzgledny,
            "dryf_koncowy": self.dryf_koncowy,
            "maks_dryf_wzgledny": self.maks_dryf_wzgledny,
        }


def dryf_niezmiennika(
    przypadek: PrzypadekTrajektorii,
    przebiegi: dict[str, Przebieg],
    *,
    zrodlo: str,
    krok_s: float,
    delta0_rad: float,
) -> DryfNiezmiennika:
    """Zmierz dryf całki pierwszej na odcinku PO zdarzeniu.

    Odcinek po zdarzeniu, bo przed zdarzeniem układ stoi (dryf jest wtedy zerowy
    z definicji i nic nie mierzy), a okno przełączenia zmienia ``X``, więc całka
    jest tam INNĄ funkcją — porównywanie jej wartości w poprzek zdarzenia byłoby
    porównywaniem dwóch różnych wielkości.
    """
    delta = przebiegi["delta_rad"]
    omega = przebiegi["omega_pu"]
    lo = przypadek.czas_wylaczenia_s + TOLERANCJA_CZASU_S
    hi = min(delta.koniec_s, omega.koniec_s)
    t_delta, w_delta = delta.w_zakresie(lo, hi)
    t_omega, w_omega = omega.w_zakresie(lo, hi)
    if t_delta.size < 2 or t_delta.size != t_omega.size:
        raise EkstrapolacjaZabronionaError(
            f"{zrodlo}: odcinek po zdarzeniu ma {t_delta.size} próbek kąta i "
            f"{t_omega.size} prędkości — dryfu całki nie da się zmierzyć."
        )
    wartosci = energia_maszyny_klasycznej(
        przypadek,
        w_delta,
        w_omega,
        e_prim_pu=przypadek.e_prim_pu(delta0_rad),
        x_pu=przypadek.x_calkowite_po_pu,
    )
    dryf = wartosci - wartosci[0]
    skala = float(np.max(np.abs(wartosci)))
    maks = float(np.max(np.abs(dryf)))
    return DryfNiezmiennika(
        zrodlo=zrodlo,
        krok_s=krok_s,
        wartosc_poczatkowa=float(wartosci[0]),
        maks_dryf_bezwzgledny=maks,
        dryf_koncowy=float(dryf[-1]),
        maks_dryf_wzgledny=maks / skala if skala > 0.0 else float("inf"),
    )


def granice_odcinkow(
    przypadek: PrzypadekTrajektorii,
    *,
    krok_laboratorium_s: float,
    poczatek_s: float,
    koniec_s: float,
) -> dict[Odcinek, tuple[float, float]]:
    """Granice trzech odcinków raportowanych osobno.

    Okno przełączenia ma szerokość STAŁĄ (``POLOWA_OKNA_PRZELACZENIA_S`` w każdą
    stronę) — patrz uzasadnienie przy tej stałej. Stałość jest warunkiem
    porównywalności szczebli drabiny: błąd liczony na RÓŻNYCH przedziałach dla
    różnych kroków nie jest jedną wielkością i nie wolno z niego czytać rzędu.
    """
    polowa = POLOWA_OKNA_PRZELACZENIA_S
    if polowa < MINIMUM_KROKOW_W_OKNIE * krok_laboratorium_s:
        raise ValueError(
            f"Krok laboratorium {krok_laboratorium_s!r} s jest za duży wobec okna "
            f"przełączenia ±{polowa!r} s: mieści się w nim mniej niż "
            f"{MINIMUM_KROKOW_W_OKNIE} kroków, więc okno nie objęłoby przejścia."
        )
    t_zd = przypadek.czas_wylaczenia_s
    return {
        Odcinek.PRZED: (poczatek_s, t_zd - polowa),
        Odcinek.OKNO_PRZELACZENIA: (t_zd - polowa, t_zd + polowa),
        Odcinek.PO: (t_zd + polowa, koniec_s),
    }


# ---------------------------------------------------------------------------
# Wzorzec: ANDES, symulacja CZASOWA
# ---------------------------------------------------------------------------


def _dodaj_szkielet_smib(ss: Any, przypadek: PrzypadekTrajektorii) -> None:
    """Szyny, DWA tory, PV i szyna sztywna — JEDNA definicja dla obu biegów.

    Rozpływ i symulacja czasowa MUSZĄ dostać identyczną sieć: gdyby definicje
    się rozeszły, punkt pracy odczytany do inicjalizacji laboratorium opisywałby
    inny układ niż ten, z którym potem porównujemy trajektorię. Dwie kopie tego
    samego opisu rozjeżdżają się przy pierwszej zmianie jednej z nich.
    """
    ss.add(
        "Bus", {"idx": 1, "Vn": przypadek.u_znamionowe_kv, "v0": przypadek.v_gen_pu, "name": "GEN"}
    )
    ss.add(
        "Bus",
        {
            "idx": 2,
            "Vn": przypadek.u_znamionowe_kv,
            "v0": przypadek.v_sys_pu,
            "a0": 0.0,
            "name": "SYS",
        },
    )
    for idx in (1, 2):
        ss.add(
            "Line",
            {
                "idx": idx,
                "bus1": 1,
                "bus2": 2,
                "r": 0.0,
                "x": przypadek.x_toru_pu,
                "b": 0.0,
                "fn": F_BAZOWA_HZ,
                "Sn": przypadek.s_bazowa_mva,
            },
        )
    ss.add(
        "PV",
        {
            "idx": 1,
            "bus": 1,
            "p0": przypadek.p_gen_pu,
            "v0": przypadek.v_gen_pu,
            "Sn": przypadek.s_bazowa_mva,
            "qmax": 99.0,
            "qmin": -99.0,
        },
    )
    ss.add(
        "Slack",
        {
            "idx": 2,
            "bus": 2,
            "v0": przypadek.v_sys_pu,
            "a0": 0.0,
            "Sn": przypadek.s_bazowa_mva,
            "qmax": 99.0,
            "qmin": -99.0,
        },
    )


def _zbuduj_andes(przypadek: PrzypadekTrajektorii, *, krok_s: float) -> Any:
    """SMIB o DWÓCH torach z wyłączeniem jednego — model GENCLS."""
    import andes

    ss = andes.System()
    _dodaj_szkielet_smib(ss, przypadek)
    ss.add(
        "GENCLS",
        {
            "idx": 1,
            "bus": 1,
            "gen": 1,
            "Sn": przypadek.s_bazowa_mva,
            "fn": F_BAZOWA_HZ,
            "xd1": przypadek.xd_prim_pu,
            "ra": 0.0,
            # ANDES parametryzuje bezwładność przez M = 2H.
            "M": 2.0 * przypadek.h_s,
            "D": przypadek.d_tlumienie,
        },
    )
    # Wyłączenie DRUGIEGO toru — odpowiednik `IDENT_TORU_WYLACZANEGO`.
    ss.add("Toggle", {"model": "Line", "dev": 2, "t": przypadek.czas_wylaczenia_s})

    cisza = io.StringIO()
    with contextlib.redirect_stdout(cisza), contextlib.redirect_stderr(cisza):
        ss.setup()
        if not ss.PFlow.run():
            raise BrakWzorcaError("ANDES: rozpływ mocy nie zbiegł — brak punktu odniesienia")
        ss.TDS.config.tf = przypadek.czas_koncowy_s
        ss.TDS.config.tstep = krok_s
        ss.TDS.init()
        if not ss.TDS.run():
            raise BrakWzorcaError("ANDES: symulacja czasowa nie powiodła się")
    return ss


def _zbuduj_andes_tylko_rozplyw(przypadek: PrzypadekTrajektorii) -> Any:
    """Sam rozpływ — bez symulacji czasowej, do odczytu punktu pracy."""
    import andes

    ss = andes.System()
    _dodaj_szkielet_smib(ss, przypadek)
    cisza = io.StringIO()
    with contextlib.redirect_stdout(cisza), contextlib.redirect_stderr(cisza):
        ss.setup()
        if not ss.PFlow.run():
            raise BrakWzorcaError("ANDES: rozpływ mocy nie zbiegł.")
    return ss


def przebiegi_wzorca(
    przypadek: PrzypadekTrajektorii, *, krok_s: float
) -> tuple[dict[str, Przebieg], float]:
    """Przebiegi kąta i prędkości z ANDES. Zwraca też ``delta`` pierwszej próbki.

    UWAGA NA CHWILĘ PIERWSZEJ PRÓBKI: ANDES nie zapisuje ``t = 0``, więc zwracana
    wartość to ``delta(tstep)``, nie ``delta(0)``. Na tym odcinku układ stoi w
    punkcie pracy (zmierzona różnica przy 1 ms wynosi 0,0 rad co do bitu), ale
    nazwanie tego „delta zerowe" byłoby nieprawdą o dane wejściowe porównania.
    """
    ss = _zbuduj_andes(przypadek, krok_s=krok_s)
    czas = np.asarray(ss.dae.ts.t, dtype=np.float64)
    stany = np.asarray(ss.dae.ts.x, dtype=np.float64)
    delta = stany[:, ss.GENCLS.delta.a[0]]
    omega = stany[:, ss.GENCLS.omega.a[0]]
    zrodlo = f"ANDES dt={krok_s:g} s"
    return (
        {
            "delta_rad": Przebieg(czas, delta, "rad", zrodlo),
            "omega_pu": Przebieg(czas, omega, "p.u.", zrodlo),
        },
        float(delta[0]),
    )


def _moc_bierna_wzorca(przypadek: PrzypadekTrajektorii) -> float:
    """Moc bierna generatora w punkcie pracy WZORCA.

    Liczona ze wzoru sieciowego na rozwiązaniu rozpływu ANDES, a nie zgadywana:
    laboratorium musi odtworzyć TEN punkt pracy, żeby porównanie trajektorii
    zaczynało się z tego samego miejsca.
    """
    ss = _zbuduj_andes_tylko_rozplyw(przypadek)
    v_gen = float(ss.Bus.v.v[0])
    a_gen = float(ss.Bus.a.v[0])
    v_sys = float(ss.Bus.v.v[1])
    a_sys = float(ss.Bus.a.v[1])
    x = przypadek.x_korytarza_przed_pu
    # Q wpływająca z szyny GEN do korytarza: (V1² − V1·V2·cos(δ12)) / X
    return (v_gen**2 - v_gen * v_sys * math.cos(a_gen - a_sys)) / x


# ---------------------------------------------------------------------------
# Laboratorium
# ---------------------------------------------------------------------------


def _model_laboratorium(przypadek: PrzypadekTrajektorii) -> ModelDynamiczny:
    topo = TopologiaSieci(
        szyny=("GEN", "SYS"),
        galezie=[
            Galaz(
                "GEN",
                "SYS",
                r_pu=0.0,
                x_pu=przypadek.x_toru_pu,
                ident=IDENT_TORU_POZOSTAJACEGO,
            ),
            Galaz(
                "GEN",
                "SYS",
                r_pu=0.0,
                x_pu=przypadek.x_toru_pu,
                ident=IDENT_TORU_WYLACZANEGO,
            ),
        ],
        szyny_sztywne={"SYS": complex(przypadek.v_sys_pu, 0.0)},
    )
    zespol = ZespolSynchroniczny(
        maszyna=maszyna_klasyczna(
            x_pu=przypadek.xd_prim_pu,
            h_s=przypadek.h_s,
            d_tlumienie=przypadek.d_tlumienie,
        ),
        avr=None,
        governor=None,
    )
    return ModelDynamiczny(topologia=topo, urzadzenia=[zespol], s_bazowa_mva=przypadek.s_bazowa_mva)


def przebiegi_laboratorium(
    przypadek: PrzypadekTrajektorii,
    *,
    q_gen_pu: float,
    krok_s: float,
    integrator: str = "rk4",
) -> tuple[dict[str, Przebieg], float]:
    """Ten sam przypadek i to samo zdarzenie policzone laboratorium.

    ``q_gen_pu`` pochodzi z rozwiązania wzorca — laboratorium nie ma węzła PV,
    więc musi ODTWORZYĆ punkt pracy wzorca z mocy zespolonej. Ta kolejność jest
    celowa: punkt pracy ustala wzorzec, więc zgodność napięcia nie jest
    tautologią.
    """
    model = _model_laboratorium(przypadek)
    silnik = SilnikRMS(model, integrator=integrator, krok_s=krok_s)
    x0 = silnik.inicjalizuj({"G1": complex(przypadek.p_gen_pu, q_gen_pu)})
    harmonogram = HarmonogramZdarzen(
        [
            WylaczenieGalezi(
                czas_s=przypadek.czas_wylaczenia_s,
                ident=IDENT_TORU_WYLACZANEGO,
                opis="wyłączenie jednego z dwóch torów",
            )
        ]
    )
    wynik = silnik.symuluj(x0, czas_koncowy_s=przypadek.czas_koncowy_s, harmonogram=harmonogram)
    # BIEG PRZERWANY NIE JEST TRAJEKTORIĄ. Bez tego sprawdzenia urwany przebieg
    # wchodziłby do porównania jako krótszy, a krótszy przebieg daje WĘŻSZE
    # pokrycie, czyli mniejszy zmierzony błąd — niepowodzenie wyglądałoby na
    # poprawę zgodności.
    if wynik.diagnostyka.blad is not None:
        raise BrakWzorcaError(
            f"Laboratorium nie policzyło trajektorii ({integrator}, dt={krok_s:g} s): "
            f"{wynik.diagnostyka.blad.klasa} w fazie {wynik.diagnostyka.blad.faza} — "
            f"{wynik.diagnostyka.blad.komunikat}"
        )
    czas = np.asarray(wynik.czas_s, dtype=np.float64)
    delta = np.asarray(wynik.sygnal("delta_rad", "G1").wartosci, dtype=np.float64)
    omega = np.asarray(wynik.sygnal("omega_pu", "G1").wartosci, dtype=np.float64)
    zrodlo = f"LAB {integrator} dt={krok_s:g} s"
    return (
        {
            "delta_rad": Przebieg(czas, delta, "rad", zrodlo),
            "omega_pu": Przebieg(czas, omega, "p.u.", zrodlo),
        },
        float(delta[0]),
    )


# ---------------------------------------------------------------------------
# Porównanie odcinek po odcinku
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class BladOdcinka:
    """Błąd punkt-po-punkcie JEDNEJ wielkości na JEDNYM odcinku."""

    kanal: str
    odcinek: Odcinek
    jednostka: str
    rozstrzygniety: bool
    """``False`` = odcinka NIE dało się zmierzyć (brak pokrycia); liczby są wtedy ``nan``."""
    powod_nierozstrzygniecia: str = ""
    liczba_punktow: int = 0
    maks_blad_bezwzgledny: float = float("nan")
    sredni_blad_bezwzgledny: float = float("nan")
    rms_bledu: float = float("nan")
    zakres_odniesienia: float = float("nan")
    maks_blad_wzgledny_zakresu: float = float("nan")
    chwila_maks_bledu_s: float = float("nan")

    def to_dict(self) -> dict[str, Any]:
        return {
            "kanal": self.kanal,
            "odcinek": self.odcinek.value,
            "jednostka": self.jednostka,
            "rozstrzygniety": self.rozstrzygniety,
            "powod_nierozstrzygniecia": self.powod_nierozstrzygniecia,
            "liczba_punktow": self.liczba_punktow,
            "maks_blad_bezwzgledny": self.maks_blad_bezwzgledny,
            "sredni_blad_bezwzgledny": self.sredni_blad_bezwzgledny,
            "rms_bledu": self.rms_bledu,
            "zakres_odniesienia": self.zakres_odniesienia,
            "maks_blad_wzgledny_zakresu": self.maks_blad_wzgledny_zakresu,
            "chwila_maks_bledu_s": self.chwila_maks_bledu_s,
        }


def _blad_odcinka(
    kanal: str,
    odcinek: Odcinek,
    granice: tuple[float, float],
    wzorzec: Przebieg,
    badany: Przebieg,
) -> BladOdcinka:
    """Błąd na WŁASNYCH punktach badanego przebiegu, wzorzec interpolowany.

    KIERUNEK INTERPOLACJI JEST ISTOTNY. Gdyby interpolować badany przebieg na
    siatkę wzorca, do wyniku wchodziłby błąd interpolacji LINIOWEJ przebiegu o
    kroku 4 ms, czyli wielkość rzędu ``dt²·|δ''|`` — dla ``dt`` grubego większa
    niż mierzony błąd metody. Mierzylibyśmy wtedy jakość interpolacji, a nie
    jakość całkowania. Wzorzec jest gęstszy, więc jego interpolacja wnosi
    nieporównanie mniej.
    """
    lo, hi = granice
    if not hi > lo:
        return BladOdcinka(
            kanal=kanal,
            odcinek=odcinek,
            jednostka=badany.jednostka,
            rozstrzygniety=False,
            powod_nierozstrzygniecia=(
                f"Odcinek pusty: [{lo!r}, {hi!r}]. Przy tym kroku okno przełączenia "
                f"pochłania odcinek gładki."
            ),
        )
    if not badany.obejmuje(lo, hi) or not wzorzec.obejmuje(lo, hi):
        brakujacy = badany if not badany.obejmuje(lo, hi) else wzorzec
        return BladOdcinka(
            kanal=kanal,
            odcinek=odcinek,
            jednostka=badany.jednostka,
            rozstrzygniety=False,
            powod_nierozstrzygniecia=(
                f'Brak pokrycia [{lo!r}, {hi!r}] przez „{brakujacy.zrodlo}" '
                f"(dane od {brakujacy.poczatek_s!r} do {brakujacy.koniec_s!r}). "
                f"Ekstrapolacja jest zabroniona, więc odcinek pozostaje "
                f"NIEROZSTRZYGNIĘTY — to wynik, nie awaria."
            ),
        )
    t, w_badany = badany.w_zakresie(lo, hi)
    if t.size < 2:
        return BladOdcinka(
            kanal=kanal,
            odcinek=odcinek,
            jednostka=badany.jednostka,
            rozstrzygniety=False,
            powod_nierozstrzygniecia=(
                f"Badany przebieg ma na tym odcinku {t.size} próbek — za mało, "
                f"żeby mówić o błędzie trajektorii."
            ),
        )
    w_wzorca = wzorzec.na_siatce(t)
    roznica = np.abs(w_badany - w_wzorca)
    zakres = float(np.max(w_wzorca) - np.min(w_wzorca))
    indeks = int(np.argmax(roznica))
    maks = float(np.max(roznica))
    return BladOdcinka(
        kanal=kanal,
        odcinek=odcinek,
        jednostka=badany.jednostka,
        rozstrzygniety=True,
        liczba_punktow=int(t.size),
        maks_blad_bezwzgledny=maks,
        sredni_blad_bezwzgledny=float(np.mean(roznica)),
        rms_bledu=float(np.sqrt(np.mean(roznica**2))),
        zakres_odniesienia=zakres,
        # Odniesienie do ZAKRESU przebiegu, nie do wartości chwilowej: prędkość
        # oscyluje wokół jedności, więc błąd względny liczony punktowo byłby
        # sztucznie mały, a kąt przechodzi blisko zera — tam byłby sztucznie duży.
        maks_blad_wzgledny_zakresu=(maks / zakres if zakres > 0.0 else float("inf")),
        chwila_maks_bledu_s=float(t[indeks]),
    )


@dataclass(frozen=True)
class PorownanieTrajektorii:
    """Wynik porównania przebieg-z-przebiegiem, z jawnym zakresem ważności."""

    przypadek: PrzypadekTrajektorii
    wersja_wzorca: str
    integrator: str
    krok_wzorca_s: float
    krok_laboratorium_s: float
    granice_odcinkow: dict[Odcinek, tuple[float, float]]
    bledy: tuple[BladOdcinka, ...]
    delta_pierwszej_probki_wzorca_rad: float
    delta_pierwszej_probki_laboratorium_rad: float
    dryf_wzorca: DryfNiezmiennika
    dryf_laboratorium: DryfNiezmiennika

    @property
    def blad_punktu_pracy_rad(self) -> float:
        """Różnica kątów w pierwszych próbkach — OSOBNO od błędu trajektorii.

        Rozdzielenie jest istotne: przesunięty punkt startowy daje stałe
        przesunięcie całej trajektorii, które nie jest błędem całkowania. Gdyby
        obie wielkości siedziały w jednej liczbie, nie dałoby się powiedzieć,
        która warstwa się rozjeżdża.
        """
        return abs(
            self.delta_pierwszej_probki_wzorca_rad - self.delta_pierwszej_probki_laboratorium_rad
        )

    @property
    def przewaga_niezmiennika(self) -> float:
        """Ile razy laboratorium trzyma całkę pierwszą lepiej niż wzorzec.

        Liczba > 1 znaczy: rozbieżność trajektorii NIE MOŻE być przypisana
        laboratorium, bo to wzorzec gubi wielkość, która ma być zachowana.
        """
        lab = self.dryf_laboratorium.maks_dryf_bezwzgledny
        wzorzec = self.dryf_wzorca.maks_dryf_bezwzgledny
        if lab <= 0.0:
            return float("inf")
        return wzorzec / lab

    def blad(self, kanal: str, odcinek: Odcinek) -> BladOdcinka:
        for b in self.bledy:
            if b.kanal == kanal and b.odcinek is odcinek:
                return b
        dostepne = sorted({(b.kanal, b.odcinek.value) for b in self.bledy})
        raise KeyError(f'Brak („{kanal}", {odcinek}). Dostępne: {dostepne}')

    @property
    def odcinki_nierozstrzygniete(self) -> tuple[BladOdcinka, ...]:
        return tuple(b for b in self.bledy if not b.rozstrzygniety)

    def to_dict(self) -> dict[str, Any]:
        return {
            "czym_to_jest": (
                "Cross-check NUMERYCZNY dwóch implementacji tego samego modelu "
                "klasycznego. NIE jest walidacją fizyczną i nie może nią być: oba "
                "narzędzia całkują to samo równanie."
            ),
            "semantyka_przelaczenia": SEMANTYKA_PRZELACZENIA,
            "wersja_wzorca": self.wersja_wzorca,
            "integrator": self.integrator,
            "krok_wzorca_s": self.krok_wzorca_s,
            "krok_laboratorium_s": self.krok_laboratorium_s,
            "blad_punktu_pracy_rad": self.blad_punktu_pracy_rad,
            "czas_wylaczenia_s": self.przypadek.czas_wylaczenia_s,
            "x_korytarza_przed_pu": self.przypadek.x_korytarza_przed_pu,
            "x_korytarza_po_pu": self.przypadek.x_korytarza_po_pu,
            "granice_odcinkow": {
                odcinek.value: [lo, hi] for odcinek, (lo, hi) in self.granice_odcinkow.items()
            },
            "odcinki": [b.to_dict() for b in self.bledy],
            "odcinki_nierozstrzygniete": [b.odcinek.value for b in self.odcinki_nierozstrzygniete],
            "niezmiennik": {
                "opis": (
                    "Całka pierwsza maszyny klasycznej przy D = 0. Dryf mierzy błąd "
                    "całkowania NIEZALEŻNIE od drugiego narzędzia."
                ),
                "wzorzec": self.dryf_wzorca.to_dict(),
                "laboratorium": self.dryf_laboratorium.to_dict(),
                "przewaga_laboratorium": self.przewaga_niezmiennika,
            },
        }


def porownaj_trajektorie(
    przypadek: PrzypadekTrajektorii | None = None,
    *,
    krok_wzorca_s: float = KROK_ODNIESIENIA_WZORCA_S,
    krok_laboratorium_s: float = 0.001,
    integrator: str = "rk4",
) -> PorownanieTrajektorii:
    """Porównaj przebieg z przebiegiem, ODCINKAMI, bez prawa do ekstrapolacji.

    Zakres porównania to część WSPÓLNA obu przebiegów — poza nią nie ma danych,
    a nie „jest zgodnie". Odcinek nieobjęty przez któreś narzędzie wraca jako
    NIEROZSTRZYGNIĘTY i tak jest raportowany.
    """
    if not czy_wzorzec_dostepny():
        raise BrakWzorcaError(
            "ANDES nie jest zainstalowany — porównanie trajektorii NIE zostało wykonane. "
            "To jest brak dowodu, nie jego posiadanie."
        )
    przypadek = przypadek or PrzypadekTrajektorii()

    wzorzec, delta0_wzorzec = przebiegi_wzorca(przypadek, krok_s=krok_wzorca_s)
    q = _moc_bierna_wzorca(przypadek)
    lab, delta0_lab = przebiegi_laboratorium(
        przypadek, q_gen_pu=q, krok_s=krok_laboratorium_s, integrator=integrator
    )

    poczatek = max(wzorzec["delta_rad"].poczatek_s, lab["delta_rad"].poczatek_s)
    koniec = min(wzorzec["delta_rad"].koniec_s, lab["delta_rad"].koniec_s)
    if not koniec > poczatek:
        raise BrakWzorcaError(
            f"Przebiegi nie mają wspólnego zakresu czasu: wzorzec "
            f"[{wzorzec['delta_rad'].poczatek_s!r}, {wzorzec['delta_rad'].koniec_s!r}], "
            f"laboratorium [{lab['delta_rad'].poczatek_s!r}, {lab['delta_rad'].koniec_s!r}]."
        )
    granice = granice_odcinkow(
        przypadek,
        krok_laboratorium_s=krok_laboratorium_s,
        poczatek_s=poczatek,
        koniec_s=koniec,
    )
    bledy = tuple(
        _blad_odcinka(kanal, odcinek, granice[odcinek], wzorzec[kanal], lab[kanal])
        for kanal in ("delta_rad", "omega_pu")
        for odcinek in Odcinek
    )
    return PorownanieTrajektorii(
        przypadek=przypadek,
        wersja_wzorca=wersja_wzorca(),
        integrator=integrator,
        krok_wzorca_s=krok_wzorca_s,
        krok_laboratorium_s=krok_laboratorium_s,
        granice_odcinkow=granice,
        bledy=bledy,
        delta_pierwszej_probki_wzorca_rad=delta0_wzorzec,
        delta_pierwszej_probki_laboratorium_rad=delta0_lab,
        dryf_wzorca=dryf_niezmiennika(
            przypadek,
            wzorzec,
            zrodlo=f"ANDES dt={krok_wzorca_s:g} s",
            krok_s=krok_wzorca_s,
            delta0_rad=delta0_lab,
        ),
        dryf_laboratorium=dryf_niezmiennika(
            przypadek,
            lab,
            zrodlo=f"LAB {integrator} dt={krok_laboratorium_s:g} s",
            krok_s=krok_laboratorium_s,
            delta0_rad=delta0_lab,
        ),
    )


# ---------------------------------------------------------------------------
# Drabina kroku: dt, dt/2, dt/4, dt/8 — DWIE miary, bo jedna jest nasycona
# ---------------------------------------------------------------------------


def _rzedy_obserwowane(wartosci: tuple[float, ...]) -> tuple[float, ...]:
    """``p = log2(e_i / e_(i+1))`` dla kolejnych połowień kroku.

    Zwraca ``nan`` tam, gdzie ilorazu nie ma (zero, wartość niepoprawna) —
    zamiast liczby udającej pomiar. Rząd ujemny NIE jest błędem odczytu: znaczy,
    że błąd ROŚNIE przy zagęszczaniu kroku, i to jest wynik, który trzeba widzieć.
    """
    rzedy: list[float] = []
    for a, b in zip(wartosci[:-1], wartosci[1:], strict=True):
        if not (math.isfinite(a) and math.isfinite(b)) or a <= 0.0 or b <= 0.0:
            rzedy.append(float("nan"))
        else:
            rzedy.append(math.log2(a / b))
    return tuple(rzedy)


@dataclass(frozen=True)
class SzczebelDrabiny:
    """Jeden krok drabiny: błąd wobec wzorca ORAZ dryf całki pierwszej."""

    krok_s: float
    blad_wobec_wzorca: dict[Odcinek, float]
    dryf_niezmiennika: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "krok_s": self.krok_s,
            "blad_wobec_wzorca": {o.value: w for o, w in self.blad_wobec_wzorca.items()},
            "dryf_niezmiennika": self.dryf_niezmiennika,
        }


@dataclass(frozen=True)
class DrabinaKroku:
    """Drabina ``dt, dt/2, dt/4, dt/8`` dla JEDNEGO integratora.

    DWIE MIARY, NIE JEDNA, i to jest sedno tej struktury:

    ``blad_wobec_wzorca``
        różnica trajektorii wobec ANDES. Zmierzona jako NIEZALEŻNA od kroku
        laboratorium (3,2478e-05 … 3,2495e-05 rad dla ``rk4``), więc jej „rząd"
        wychodzi ≈ 0. To NIE jest rząd metody — to nasycenie porównania błędem
        WZORCA. Raportowane mimo to, bo bez tej liczby nie widać, że nasycenie
        w ogóle zachodzi.
    ``dryf_niezmiennika``
        dryf całki pierwszej, czyli błąd WŁASNY laboratorium, mierzony bez
        udziału ANDES. Tu rząd metody jest obserwowalny — dopóki nie wejdzie
        podłoga zaokrągleń (``rk4``) albo podłoga tolerancji równania
        nieliniowego (``trapez_niejawny``).
    """

    integrator: str
    krok_wzorca_s: float
    szczeble: tuple[SzczebelDrabiny, ...]

    @property
    def kroki_s(self) -> tuple[float, ...]:
        return tuple(s.krok_s for s in self.szczeble)

    def rzedy_wobec_wzorca(self, odcinek: Odcinek) -> tuple[float, ...]:
        return _rzedy_obserwowane(tuple(s.blad_wobec_wzorca[odcinek] for s in self.szczeble))

    @property
    def rzedy_niezmiennika(self) -> tuple[float, ...]:
        return _rzedy_obserwowane(tuple(s.dryf_niezmiennika for s in self.szczeble))

    def rozrzut_ogona(self, odcinek: Odcinek, *, ile_szczebli: int = 3) -> float:
        """``max/min`` błędu po OSTATNICH szczeblach — miara NASYCENIA porównania.

        Wartość bliska 1 znaczy, że dalsze zagęszczanie kroku laboratorium nie
        zmienia już różnicy wobec wzorca, czyli że ta różnica nie pochodzi od
        kroku laboratorium. To jest pomiar, na którym opiera się cała atrybucja
        podłogi — dlatego jest wielkością, a nie zdaniem w komentarzu.

        DLACZEGO OGON, A NIE CAŁA DRABINA — I DLACZEGO TO NIE JEST PRZESUWANIE
        BRAMKI. Pierwsza wersja liczyła rozrzut po WSZYSTKICH szczeblach i
        ZMIERZONO, że jest to pytanie o co innego niż podłoga: dla ``rk4`` (rząd 4)
        błąd jest nasycony już przy 4 ms (rozrzut 1,0005), ale dla
        ``trapez_niejawny`` (rząd 2) szczebel 4 ms niesie jeszcze WŁASNY błąd
        obcięcia (1,224e-04 wobec 3,05e-05 na końcu), więc rozrzut po całości
        wychodzi 4,36. Kryterium odrzucałoby wtedy metodę za to, że jest rzędu 2 —
        czyli za zachowanie POPRAWNE.

        Podłoga jest z definicji tym, DO CZEGO drabina zbiega. Zmierzenie jej
        wymaga części ZBIEŻNEJ; szczeble, na których metoda jeszcze się zbiega,
        mierzą zbieżność, a nie podłogę. Rozdział jest więc merytoryczny, nie
        wygodnościowy — i nie gubi niczego, bo zbieżność mierzona jest OSOBNO,
        rzędami obserwowanymi (``rzedy_wobec_wzorca``, ``rzedy_niezmiennika``).

        Ogon krótszy niż ``ile_szczebli`` zwraca ``nan``: „podłoga" ogłoszona z
        jednego punktu nie jest pomiarem.
        """
        if ile_szczebli < 2:
            raise ValueError("Ogon krótszy niż dwa szczeble nie jest rozrzutem.")
        wartosci = [s.blad_wobec_wzorca[odcinek] for s in self.szczeble[-ile_szczebli:]]
        skonczone = [w for w in wartosci if math.isfinite(w) and w > 0.0]
        if len(skonczone) < ile_szczebli:
            return float("nan")
        return max(skonczone) / min(skonczone)

    def to_dict(self) -> dict[str, Any]:
        return {
            "integrator": self.integrator,
            "krok_wzorca_s": self.krok_wzorca_s,
            "szczeble": [s.to_dict() for s in self.szczeble],
            "rzedy_wobec_wzorca": {o.value: list(self.rzedy_wobec_wzorca(o)) for o in Odcinek},
            "rozrzut_ogona": {o.value: self.rozrzut_ogona(o) for o in Odcinek},
            "rzedy_niezmiennika": list(self.rzedy_niezmiennika),
            "uwaga": (
                'Rząd „wobec wzorca" NIE jest rzędem metody, jeżeli rozrzut jest '
                "bliski 1 — porównanie jest wtedy nasycone błędem wzorca. Rząd "
                "metody czytaj z dryfu całki pierwszej."
            ),
        }


def drabina_kroku(
    przypadek: PrzypadekTrajektorii | None = None,
    *,
    integrator: str = "rk4",
    kroki_s: tuple[float, ...] = DRABINA_KROKOW_S,
    krok_wzorca_s: float = KROK_ODNIESIENIA_WZORCA_S,
) -> DrabinaKroku:
    """Zbuduj drabinę kroku dla jednego integratora (jeden bieg wzorca na całość)."""
    if not czy_wzorzec_dostepny():
        raise BrakWzorcaError("ANDES nie jest zainstalowany — drabina NIE została policzona.")
    przypadek = przypadek or PrzypadekTrajektorii()
    wzorzec, _ = przebiegi_wzorca(przypadek, krok_s=krok_wzorca_s)
    q = _moc_bierna_wzorca(przypadek)

    szczeble: list[SzczebelDrabiny] = []
    for krok in kroki_s:
        lab, delta0_lab = przebiegi_laboratorium(
            przypadek, q_gen_pu=q, krok_s=krok, integrator=integrator
        )
        poczatek = max(wzorzec["delta_rad"].poczatek_s, lab["delta_rad"].poczatek_s)
        koniec = min(wzorzec["delta_rad"].koniec_s, lab["delta_rad"].koniec_s)
        granice = granice_odcinkow(
            przypadek, krok_laboratorium_s=krok, poczatek_s=poczatek, koniec_s=koniec
        )
        bledy = {
            odcinek: _blad_odcinka(
                "delta_rad", odcinek, granice[odcinek], wzorzec["delta_rad"], lab["delta_rad"]
            )
            for odcinek in Odcinek
        }
        szczeble.append(
            SzczebelDrabiny(
                krok_s=krok,
                blad_wobec_wzorca={
                    odcinek: b.maks_blad_bezwzgledny for odcinek, b in bledy.items()
                },
                dryf_niezmiennika=dryf_niezmiennika(
                    przypadek,
                    lab,
                    zrodlo=f"LAB {integrator} dt={krok:g} s",
                    krok_s=krok,
                    delta0_rad=delta0_lab,
                ).maks_dryf_bezwzgledny,
            )
        )
    return DrabinaKroku(
        integrator=integrator, krok_wzorca_s=krok_wzorca_s, szczeble=tuple(szczeble)
    )


# ---------------------------------------------------------------------------
# FORMALNE KRYTERIUM ODBIORU
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class KryteriumOdbioru:
    """Progi odbioru — JAWNE, z uzasadnieniem przy każdym.

    Żaden z tych progów NIE jest normatywny. Wszystkie są zapadkami
    regresyjnymi dla TEGO przypadku, ustawionymi POWYŻEJ wartości zmierzonej i
    PONIŻEJ rzędu, przy którym zjawisko zmieniłoby naturę.
    """

    maks_blad_punktu_pracy_rad: float = 1.0e-6
    """Zmierzone 3,68e-09 rad. Próg 1e-06 rad = 2e-05 stopnia: powyżej tego
    porównanie mierzyłoby RÓŻNICĘ PUNKTÓW PRACY, nie błąd trajektorii."""

    maks_blad_przed_zdarzeniem_rad: float = 1.0e-7
    """Przed zdarzeniem układ STOI, więc błąd musi zostać na poziomie różnicy
    punktów pracy. Wartość większa znaczyłaby, że któreś narzędzie „dryfuje w
    spoczynku" — defekt całkowania widoczny bez żadnego zaburzenia."""

    min_przewaga_niezmiennika: float = 10.0
    """Ile razy laboratorium musi trzymać całkę pierwszą lepiej od wzorca, żeby
    wolno było przypisać rozbieżność WZORCOWI. Zmierzona przewaga przy 1 ms:
    1,03e-06 / 4,46e-14 ≈ 2,3e+07. Próg 10 jest ostrożny o sześć rzędów —
    chodzi o kierunek wnioskowania, nie o pochwałę."""

    maks_rozrzut_ogona_drabiny: float = 1.10
    """``max/min`` błędu wobec wzorca po TRZECH OSTATNICH szczeblach drabiny.
    Zmierzone: 1,0001 (``rk4``) i 1,0844 (``trapez_niejawny``). Wartość bliska 1
    DOWODZI, że różnica nie pochodzi od kroku laboratorium; gdyby urosła, podłoga
    przestałaby być wyjaśniona i werdykt musiałby wrócić do NIEROZSTRZYGNIĘTEGO.
    Dlaczego ogon, a nie cała drabina — patrz ``DrabinaKroku.rozrzut_ogona``."""

    szczebli_w_ogonie: int = 3
    """Ile ostatnich szczebli tworzy „ogon\". Mniej niż trzy nie pozwala odróżnić
    podłogi od dwóch punktów, które przypadkiem wypadły blisko siebie."""

    def to_dict(self) -> dict[str, float]:
        return {
            "maks_blad_punktu_pracy_rad": self.maks_blad_punktu_pracy_rad,
            "maks_blad_przed_zdarzeniem_rad": self.maks_blad_przed_zdarzeniem_rad,
            "min_przewaga_niezmiennika": self.min_przewaga_niezmiennika,
            "maks_rozrzut_ogona_drabiny": self.maks_rozrzut_ogona_drabiny,
            "szczebli_w_ogonie": float(self.szczebli_w_ogonie),
        }


@dataclass(frozen=True)
class OcenaOdbioru:
    """Werdykt wraz z UZASADNIENIEM każdego składnika — nie samo „OK"."""

    status: StatusPorownania
    kryterium: KryteriumOdbioru
    spelnione: tuple[str, ...]
    niespelnione: tuple[str, ...]
    nierozstrzygniete: tuple[str, ...]
    porownanie: PorownanieTrajektorii
    drabina: DrabinaKroku | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status.value,
            "czego_status_NIE_znaczy": (
                'ZGODNE_W_GRANICACH_WZORCA nie znaczy „model poprawny fizycznie" ani '
                '„warstwa dynamiczna zwalidowana". Znaczy: rachunek dwóch '
                "implementacji tego samego równania zgadza się w granicach "
                "niepewności WŁASNEJ wzorca, zmierzonej całką pierwszą."
            ),
            "kryterium": self.kryterium.to_dict(),
            "spelnione": list(self.spelnione),
            "niespelnione": list(self.niespelnione),
            "nierozstrzygniete": list(self.nierozstrzygniete),
            "porownanie": self.porownanie.to_dict(),
            "drabina": self.drabina.to_dict() if self.drabina is not None else None,
        }


def odbior_trajektorii(
    przypadek: PrzypadekTrajektorii | None = None,
    *,
    kryterium: KryteriumOdbioru | None = None,
    integrator: str = "rk4",
    krok_laboratorium_s: float = 0.001,
    krok_wzorca_s: float = KROK_ODNIESIENIA_WZORCA_S,
    z_drabina: bool = True,
) -> OcenaOdbioru:
    """Porównanie + drabina + werdykt wg jawnego kryterium.

    KOLEJNOŚĆ ROZSTRZYGANIA JEST ISTOTNA. Najpierw sprawdzane jest, czy w ogóle
    jest co oceniać (pokrycie odcinków, punkt pracy); dopiero potem, czy wynik
    jest zgodny. Odwrotna kolejność dawałaby „zgodne" dla porównania, które nie
    objęło połowy horyzontu.
    """
    kryterium = kryterium or KryteriumOdbioru()
    przypadek = przypadek or PrzypadekTrajektorii()
    porownanie = porownaj_trajektorie(
        przypadek,
        krok_wzorca_s=krok_wzorca_s,
        krok_laboratorium_s=krok_laboratorium_s,
        integrator=integrator,
    )
    drabina = (
        drabina_kroku(przypadek, integrator=integrator, krok_wzorca_s=krok_wzorca_s)
        if z_drabina
        else None
    )

    spelnione: list[str] = []
    niespelnione: list[str] = []
    nierozstrzygniete: list[str] = []

    for b in porownanie.odcinki_nierozstrzygniete:
        nierozstrzygniete.append(
            f"Odcinek {b.odcinek.value} kanału {b.kanal}: {b.powod_nierozstrzygniecia}"
        )

    blad_pp = porownanie.blad_punktu_pracy_rad
    if blad_pp <= kryterium.maks_blad_punktu_pracy_rad:
        spelnione.append(
            f"Punkt pracy: |Δδ₀| = {blad_pp:.3e} rad "
            f"≤ {kryterium.maks_blad_punktu_pracy_rad:.3e}"
        )
    else:
        niespelnione.append(
            f"Punkt pracy: |Δδ₀| = {blad_pp:.3e} rad przekracza "
            f"{kryterium.maks_blad_punktu_pracy_rad:.3e} — porównanie mierzyłoby "
            f"różnicę punktów pracy, nie błąd trajektorii."
        )

    przed = porownanie.blad("delta_rad", Odcinek.PRZED)
    if przed.rozstrzygniety:
        if przed.maks_blad_bezwzgledny <= kryterium.maks_blad_przed_zdarzeniem_rad:
            spelnione.append(
                f"Odcinek przed zdarzeniem: max|Δδ| = "
                f"{przed.maks_blad_bezwzgledny:.3e} rad "
                f"≤ {kryterium.maks_blad_przed_zdarzeniem_rad:.3e}"
            )
        else:
            niespelnione.append(
                f"Odcinek przed zdarzeniem: max|Δδ| = "
                f"{przed.maks_blad_bezwzgledny:.3e} rad przekracza "
                f"{kryterium.maks_blad_przed_zdarzeniem_rad:.3e} — rozbieżność bez "
                f"zaburzenia znaczy różnicę modeli, nie całkowania."
            )

    przewaga = porownanie.przewaga_niezmiennika
    if przewaga >= kryterium.min_przewaga_niezmiennika:
        spelnione.append(
            f"Całka pierwsza: laboratorium dryfuje "
            f"{porownanie.dryf_laboratorium.maks_dryf_bezwzgledny:.3e}, wzorzec "
            f"{porownanie.dryf_wzorca.maks_dryf_bezwzgledny:.3e} — przewaga "
            f"{przewaga:.3e}× ≥ {kryterium.min_przewaga_niezmiennika:g}. "
            f"Rozbieżność trajektorii NIE jest błędem całkowania laboratorium."
        )
    else:
        niespelnione.append(
            f"Całka pierwsza: przewaga laboratorium {przewaga:.3e}× jest poniżej "
            f"{kryterium.min_przewaga_niezmiennika:g}. Bez niej rozbieżności nie "
            f"wolno przypisać wzorcowi — a wtedy nie jest wyjaśniona."
        )

    if drabina is not None:
        rozrzut = drabina.rozrzut_ogona(Odcinek.PO, ile_szczebli=kryterium.szczebli_w_ogonie)
        if not math.isfinite(rozrzut):
            nierozstrzygniete.append(
                "Drabina kroku: rozrzutu nie dało się policzyć (za mało rozstrzygniętych "
                "szczebli na odcinku po zdarzeniu)."
            )
        elif rozrzut <= kryterium.maks_rozrzut_ogona_drabiny:
            spelnione.append(
                f"Drabina {'/'.join(f'{k * 1000:g}ms' for k in drabina.kroki_s)}: rozrzut "
                f"błędu wobec wzorca na {kryterium.szczebli_w_ogonie} ostatnich "
                f"szczeblach = {rozrzut:.4f} ≤ "
                f"{kryterium.maks_rozrzut_ogona_drabiny:g} — różnica NIE zależy od kroku "
                f"laboratorium, więc nie pochodzi z jego dyskretyzacji."
            )
        else:
            niespelnione.append(
                f"Drabina: rozrzut błędu wobec wzorca na "
                f"{kryterium.szczebli_w_ogonie} ostatnich szczeblach = {rozrzut:.4f} "
                f"przekracza "
                f"{kryterium.maks_rozrzut_ogona_drabiny:g} — różnica zależy od kroku "
                f"laboratorium, więc podłoga NIE jest wyjaśniona błędem wzorca."
            )

    if niespelnione:
        status = StatusPorownania.NIEZGODNE
    elif nierozstrzygniete:
        status = StatusPorownania.NIEROZSTRZYGNIETE
    else:
        status = StatusPorownania.ZGODNE_W_GRANICACH_WZORCA
    return OcenaOdbioru(
        status=status,
        kryterium=kryterium,
        spelnione=tuple(spelnione),
        niespelnione=tuple(niespelnione),
        nierozstrzygniete=tuple(nierozstrzygniete),
        porownanie=porownanie,
        drabina=drabina,
    )
