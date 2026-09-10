"""Benchmark SZTYWNY — pozycja decyzyjna D-02 (wybór integratora), z pomiarem.

KOD BADAWCZY — patrz `backend/research/README.md`. Nie jest dowodem regulacyjnym.
Taksonomia dowodów: `dynamic_lab.drabina` (ten moduł dostarcza pozycje C2/W2 i C2/W1).

PO CO TEN MODUŁ ISTNIEJE — SPROSTOWANIE WCZEŚNIEJSZEGO POMIARU
--------------------------------------------------------------
``benchmarki.porownaj_integratory`` porównuje integratory na zadaniu SMIB z jedną
maszyną klasyczną. To zadanie **NIE JEST SZTYWNE**: najszybsza stała czasowa
(``Tq0' = 0,4 s``) i najwolniejsza (``Td0' = 8 s``) dzielą niecałe dwa rzędy, a
wahania elektromechaniczne mieszczą się w paśmie ~1 Hz. Na takim zadaniu wygrywa
RK4 i **nie mówi to nic o wyborze integratora dla produktu**, bo przewaga metod
A-stabilnych ujawnia się dopiero wtedy, gdy stabilność, a nie dokładność,
ogranicza krok.

Wcześniejszy meldunek twierdził, że integratory zbiegają „na układzie sztywnym".
To było **nieprawdą**: żaden przypadek w laboratorium nie miał zmierzonej
sztywności. Ten moduł zamyka tę lukę — buduje przypadek jawnie sztywny, MIERZY
jego sztywność liczbą i dopiero na nim porównuje metody.

CO ZNACZY „SZTYWNY" — DEFINICJA UŻYWANA TUTAJ
---------------------------------------------
Wskaźnik sztywności = ``max|Re(λ)| / min|Re(λ)|`` po **niezerowych** wartościach
własnych jakobianu ``df/dx`` w punkcie pracy. Bez tej liczby „sztywny" jest
przymiotnikiem, nie pomiarem. Zerowe wartości własne są tu strukturalne, nie
numeryczne (patrz ``WidmoJakobianu.liczba_zerowych``) i muszą być odfiltrowane, inaczej
wskaźnik byłby nieskończonością bez treści.

ŹRÓDŁO SZTYWNOŚCI JEST FIZYCZNE, NIE WYMYŚLONE
----------------------------------------------
Przypadek składa się z maszyny synchronicznej (``H = 4 s``, ``Td0' = 8 s`` —
sekundy) oraz falownika przekształtnikowego z **kaskadą regulacji**: wolną pętlą
mocy (``T = 0,2 s``) i **szybką pętlą prądową** (``T = 1 ms``). Taka kaskada jest
standardem w przekształtnikach: pętla prądowa musi być o rzędy szybsza od pętli
mocy, żeby ta druga „widziała" ją jako natychmiastową. Rozstaw stałych czasowych
1 ms ↔ 8 s to trzy i pół rzędu wielkości — i to jest dokładnie ta sytuacja,
w której produkt MV-DESIGN-PRO będzie liczył sieć SN z DER.

ZMIERZONE WIDMO (T pętli prądowej = 1 ms, punkt pracy przypadku)
----------------------------------------------------------------
    λ = −1000,00 · −999,96 · −5,13 · −5,00 · −4,87
        · −0,826 ± 7,376j · −0,233 · 0 · 0

    max|Re λ| = 1000,0 s⁻¹     (pętla prądowa)
    min|Re λ| = 0,2333 s⁻¹     (zanik strumienia, tor e_q')
    WSKAŹNIK SZTYWNOŚCI = 4,29 · 10³
    mod wahań elektromechanicznych: 7,376 rad/s = 1,174 Hz — wielkość realna.

WYNIK PORÓWNANIA — LICZBY ZMIERZONE, NIE PRZEPISANE
---------------------------------------------------
Warunki: zaburzenie kątem wirnika 5°, ``T_koniec = 1,0 s``, tolerancja algebry
sieci 1e-13. Odniesienie: ``scipy.integrate.solve_ivp`` metodą ``Radau``
(rtol 1e-10, atol 1e-12) na TEJ SAMEJ funkcji ``f``, z gęstym wyjściem.
Błąd = maksimum po wszystkich 10 stanach i wszystkich chwilach próbkowania.
Tabelę odtwarza ``raport_sztywnosci()`` — liczb nie przepisuje się ręcznie.

    | integrator      |  dt=1 ms |  dt=2 ms |  dt=5 ms | dt=10 ms | dt=20 ms |
    |-----------------|----------|----------|----------|----------|----------|
    | euler_jawny     | 1,08e−03 | 2,19e−03 | ROZBIEGŁ | ROZBIEGŁ | ROZBIEGŁ |
    | rk4             | 7,92e−09 | 2,20e−07 | ROZBIEGŁ | ROZBIEGŁ | ROZBIEGŁ |
    | euler_niejawny  | 1,06e−03 | 2,09e−03 | 5,04e−03 | 9,53e−03 | 1,71e−02 |
    | trapez_niejawny | 1,38e−06 | 5,50e−06 | 3,44e−05 | 1,38e−04 | 5,49e−04 |

    Ewaluacje pochodnych (ten sam przebieg):
    | euler_jawny     |     1001 |      501 |       13 |        9 |        7 |
    | rk4             |     4001 |     2001 |       25 |       13 |        9 |
    | euler_niejawny  |    13001 |     6501 |     2601 |     1389 |     1113 |
    | trapez_niejawny |    13001 |     6501 |     2601 |     1301 |      992 |

    (Metody jawne przy dt ≥ 5 ms padają po kilkunastu krokach — stąd znikome
    liczby ewaluacji. Iteracje Newtona zmierzone bezpośrednio: 2,0 na krok dla
    obu metod niejawnych do dt = 5 ms; 2,7–2,8 przy dt = 20 ms. Przy n = 10
    stanach i jakobianie liczonym różnicami daje to 13 ewaluacji ``f`` na krok.)

KROK GRANICZNY STABILNOŚCI — POMIAR WOBEC ZAMKNIĘTEGO WZORU
------------------------------------------------------------
Bisekcja po kryterium „przebieg nie wybiega", przedział 0,5…50 ms:

    | integrator      | zmierzony | wzór teorii liniowej      | odchyłka |
    |-----------------|-----------|---------------------------|----------|
    | euler_jawny     |  2,034 ms | 2/|λ|max      = 2,000 ms  |  +1,7 %  |
    | rk4             |  2,812 ms | 2,7853/|λ|max = 2,785 ms  |  +1,0 %  |
    | euler_niejawny  | > 50 ms   | brak (A-stabilny)         |     —    |
    | trapez_niejawny | > 50 ms   | brak (A-stabilny)         |     —    |

Dla metod niejawnych ``> 50 ms`` jest GÓRNYM KOŃCEM BADANEGO PRZEDZIAŁU, a nie
zmierzoną granicą — sygnalizuje to ``KrokGraniczny.ograniczony_przedzialem``.

MAKSYMALNY KROK PRZY WYMAGANEJ DOKŁADNOŚCI (próg błędu 1e−3 rad)
-----------------------------------------------------------------
    euler_jawny      0,922 ms   (ogranicza DOKŁADNOŚĆ, tuż pod granicą stabilności)
    euler_niejawny   0,922 ms   (A-stabilny, ale 1. rzędu — ogranicza DOKŁADNOŚĆ)
    rk4              2,712 ms   (ogranicza STABILNOŚĆ: przy 2 ms błąd to 2,2e−07)
    trapez_niejawny 26,165 ms   (28× więcej niż RK4, 28× więcej niż Euler)

WŁASNOŚĆ METAMORFICZNA — ISTOTA SZTYWNOŚCI, ZMIERZONA
------------------------------------------------------
Dwukrotne SPOWOLNIENIE pętli prądowej (1 ms → 2 ms) dwukrotnie wydłuża krok
graniczny metod jawnych i NIE ZMIENIA metod niejawnych:

    T_pradu = 1 ms:  euler_jawny 2,034 ms · rk4 2,812 ms · niejawne > 50 ms
    T_pradu = 2 ms:  euler_jawny 4,330 ms · rk4 5,774 ms · niejawne > 50 ms

Koszt metody jawnej jest więc związany z najszybszym elementem MODELU, a nie z
wymaganiami WYNIKU. To jest cała treść pojęcia „sztywność".

WNIOSEK DLA D-02 — UCZCIWY, Z GRANICĄ WAŻNOŚCI
-----------------------------------------------
1. Na zadaniu sztywnym metody jawne **nie mają wyboru kroku**: sufit wyznacza
   najszybsza stała czasowa modelu (2,0 ms dla Eulera, 2,8 ms dla RK4 przy pętli
   prądowej 1 ms), a nie wymagana dokładność.
2. Trapez niejawny przy dt = 20 ms daje błąd 5,49e−04 rad w 992 ewaluacjach —
   **dwa razy dokładniej niż Euler jawny przy dt = 1 ms** (1,08e−03 rad w 1001
   ewaluacjach), przy 20× dłuższym kroku. To jest przewaga A-stabilności wyrażona
   liczbą, a nie deklaracją.
3. **RK4 nadal wygrywa w reżimie bardzo wysokiej dokładności** mieszczącym się
   w jego oknie stabilności: 2,20e−07 rad w 2001 ewaluacjach (dt = 2 ms), podczas
   gdy trapez przy dt = 1 ms daje 1,38e−06 rad w 13001 ewaluacjach. Raportowane
   wprost, bo tak wyszło z pomiaru: przewaga metody niejawnej NIE jest
   bezwarunkowa — jest związana z reżimem dokładności typowym dla RMS
   (10⁻³…10⁻⁴ rad) i z krokami 5–20 ms.
4. **A-stabilność sama nie wystarcza.** Euler niejawny jest A-stabilny, ale
   pierwszego rzędu: jego maksymalny krok przy progu 1e−3 rad (0,922 ms) jest
   IDENTYCZNY z Eulerem jawnym, a kosztuje 13 ewaluacji na krok zamiast jednej.
   Potrzebny jest rząd ≥ 2 — co wskazuje **trapez** jako kandydata domyślnego,
   zgodnie z praktyką narzędzi RMS.
5. Czasy wykonania (maszyna testowa, ~26 s na całą tabelę) są tu wielkością
   POMOCNICZĄ: jakobian liczony różnicami skończonymi (n+1 ewaluacji na iterację)
   jest kosztem IMPLEMENTACJI laboratorium, nie własnością metody. Produkcja z
   jakobianem analitycznym i faktoryzacją LU trzymaną między krokami przesunie
   ten bilans dalej na korzyść metod niejawnych. Dlatego wnioski 1–4 opierają się
   na liczbie ewaluacji i kroku, a nie na sekundach.

GRANICE TEGO BENCHMARKU (czego on NIE mierzy)
---------------------------------------------
- Zadanie jest **gładkie**: nie zawiera zdarzeń. Zachowanie metod niejawnych na
  NIECIĄGŁOŚCI (zwarcie, przełączenie trybu FRT) jest osobnym pytaniem i jest
  udokumentowane w ``calkowanie._newton_niejawny`` oraz w
  ``FalownikGFL.pasmo_przejscia_frt_pu``. Nie wolno przenosić wniosku „trapez
  wygrywa" na przypadek ze zdarzeniem bez osobnego pomiaru.
- Mierzy **metody całkowania wobec siebie i wobec Radau**, a nie fizykę modelu.
  Zgodność dwóch integratorów nie dowodzi poprawności równań (to robi wyrocznia
  analityczna w ``walidacja``).
- Nie mierzy **tłumienia numerycznego przy modzie oscylacyjnym o wysokiej
  częstotliwości** — mod wahań (1,17 Hz) jest tu wielokrotnie wolniejszy od
  kroku, więc różnica między Eulerem wstecznym a trapezem w tłumieniu amplitudy
  ujawnia się w błędzie, ale nie jest osobno wyodrębniona.
"""

from __future__ import annotations

import math
import time
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from dynamic_lab.calkowanie import INTEGRATORY
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import ModelDynamiczny, SilnikRMS
from dynamic_lab.urzadzenia import (
    MaszynaSynchroniczna4Rzedu,
    OdbiorStalejMocy,
    ZespolSynchroniczny,
)


class PozaZakresemModeluError(RuntimeError):
    """Model został wywołany poza zakresem, w którym jego równania mają sens.

    Istnieje po to, żeby zamiast liczby powstał błąd. Falownik z tego modułu nie
    ma ogranicznika prądu ani trybu FRT, więc przy głębokim zapadzie napięcia
    jego równania (prąd = moc/napięcie) dawałyby prąd rosnący bez ograniczenia —
    liczbę wyglądającą wiarygodnie i fizycznie fałszywą. Zaślepka zwracająca
    „coś" byłaby fabrykacją.
    """


# --------------------------------------------------------------------------
# Urządzenie wnoszące szybką skalę czasową
# --------------------------------------------------------------------------


@dataclass
class FalownikZKaskadaRegulacji:
    """Falownik sieciowy z KASKADĄ regulacji: wolna pętla mocy + szybka pętla prądowa.

    PO CO TEN MODEL ISTNIEJE. Laboratorium miało falowniki o jednej skali czasowej
    (``FalownikGFL``: ``T_p = T_q = 50 ms``), więc żaden przypadek nie był sztywny
    i wybór integratora nie miał na czym się rozstrzygnąć. Ten model wnosi drugą,
    o rzędy szybszą skalę — i robi to w sposób, w jaki działa rzeczywisty
    przekształtnik, a nie przez sztuczne dołożenie szybkiego równania.

    STANY (4): ``[i_d_zad, i_q_zad, i_d, i_q]`` — zadane i faktyczne składowe
    prądu w ramie związanej z **napięciem szyny** (``d`` = czynna, ``q`` = bierna).

    RÓWNANIA
        d(i_d_zad)/dt = (P_ref/|V| − i_d_zad) / T_mocy      (pętla zewnętrzna, wolna)
        d(i_q_zad)/dt = (Q_ref/|V| − i_q_zad) / T_mocy
        d(i_d)/dt     = (i_d_zad − i_d)     / T_pradu       (pętla wewnętrzna, SZYBKA)
        d(i_q)/dt     = (i_q_zad − i_q)     / T_pradu
        I             = (i_d − j·i_q) · V/|V|

    Z definicji wstrzyknięcia wynika ``S = V·conj(I) = |V|·(i_d + j·i_q)``, czyli
    ``P = |V|·i_d`` i ``Q = |V|·i_q`` — konwencja generatorowa całego laboratorium.
    W punkcie pracy ``i_d = i_d_zad = P_ref/|V|``, więc **wszystkie cztery pochodne
    są dokładnie zerowe** i inicjalizacja przechodzi bramkę równowagi silnika.
    (Przypięte testem ``test_falownik_startuje_w_scislej_rownowadze``.)

    KASKADA JEST ŹRÓDŁEM SZTYWNOŚCI. Wiersze jakobianu pętli prądowej mają na
    przekątnej ``−1/T_pradu`` i sprzęgają się z resztą modelu wyłącznie przez
    ``i_zad``. Dlatego dwie najszybsze wartości własne całego układu leżą (dla
    ``T_pradu ≤ 5 ms``) w granicach 1 % od ``−1/T_pradu`` — to jest wyrocznia
    analityczna tego przypadku, przypięta testem
    ``test_najszybsze_wartosci_wlasne_zgadzaja_sie_z_odwrotnoscia_stalej``.

    CZEGO TEN MODEL NIE MA (jawnie, żeby nikt nie wziął go za więcej)
    ----------------------------------------------------------------
    - **Ogranicznika prądu** i trybu FRT — do zapadów napięcia służy
      ``urzadzenia.FalownikGFL``, który to ma. Ten model jest przeznaczony do
      badania własności NUMERYCZNYCH wokół punktu pracy.
    - **Dynamiki PLL**: rama odniesienia jest związana z kątem napięcia szyny
      natychmiast, więc model nie odwzorowuje niestabilności synchronizacji
      w sieci słabej.
    - **Ograniczeń mocy, dynamiki obwodu DC, nasyceń regulatorów.**

    Poniżej ``napiecie_minimalne_pu`` model **podnosi wyjątek** zamiast liczyć:
    tam jego równania przestają opisywać rzeczywisty przekształtnik.
    """

    ref: str
    szyna: str
    t_pradu_s: float = 0.001
    """Stała czasowa pętli prądowej [s] — SZYBKA skala (1…5 ms w praktyce)."""
    t_mocy_s: float = 0.2
    """Stała czasowa pętli mocy [s] — WOLNA skala."""
    p_ref_pu: float = 0.0
    q_ref_pu: float = 0.0
    napiecie_minimalne_pu: float = 0.2
    """Dolna granica ważności modelu [p.u.] — poniżej: wyjątek, nigdy liczba."""

    def __post_init__(self) -> None:
        if self.t_pradu_s <= 0.0 or self.t_mocy_s <= 0.0:
            raise ValueError(f"{self.ref}: stałe czasowe pętli muszą być > 0")
        if self.t_pradu_s >= self.t_mocy_s:
            raise ValueError(
                f"{self.ref}: pętla prądowa (T = {self.t_pradu_s} s) musi być SZYBSZA "
                f"od pętli mocy (T = {self.t_mocy_s} s) — inaczej kaskada nie jest kaskadą."
            )
        if self.napiecie_minimalne_pu <= 0.0:
            raise ValueError(f"{self.ref}: napiecie_minimalne_pu musi być > 0")

    def nazwy_stanow(self) -> tuple[str, ...]:
        return ("i_d_zad_pu", "i_q_zad_pu", "i_d_pu", "i_q_pu")

    def _modul_napiecia(self, v_szyny: complex) -> float:
        v = abs(v_szyny)
        if v < self.napiecie_minimalne_pu:
            raise PozaZakresemModeluError(
                f"{self.ref}: napięcie {v:.4f} p.u. poniżej granicy ważności modelu "
                f"({self.napiecie_minimalne_pu} p.u.). Ten falownik nie ma ogranicznika "
                f"prądu ani trybu FRT — policzona wartość byłaby fabrykacją. Do zapadów "
                f"napięcia służy `urzadzenia.FalownikGFL`."
            )
        return v

    def pochodne(self, x: NDArray[np.float64], v_szyny: complex) -> NDArray[np.float64]:
        v = self._modul_napiecia(v_szyny)
        i_d_zad, i_q_zad = float(x[0]), float(x[1])
        i_d, i_q = float(x[2]), float(x[3])
        return np.array(
            [
                (self.p_ref_pu / v - i_d_zad) / self.t_mocy_s,
                (self.q_ref_pu / v - i_q_zad) / self.t_mocy_s,
                (i_d_zad - i_d) / self.t_pradu_s,
                (i_q_zad - i_q) / self.t_pradu_s,
            ],
            dtype=np.float64,
        )

    def wstrzykniecie(self, x: NDArray[np.float64], v_szyny: complex) -> complex:
        v = self._modul_napiecia(v_szyny)
        i_d, i_q = float(x[2]), float(x[3])
        return complex(complex(i_d, -i_q) * (v_szyny / v))

    def inicjalizuj(self, v_szyny: complex, s_zadane: complex) -> NDArray[np.float64]:
        """Punkt pracy z rozpływu: ``i = S_zadane/|V|`` w obu pętlach (pochodne = 0)."""
        v = self._modul_napiecia(v_szyny)
        self.p_ref_pu = s_zadane.real
        self.q_ref_pu = s_zadane.imag
        i_d = s_zadane.real / v
        i_q = s_zadane.imag / v
        return np.array([i_d, i_q, i_d, i_q], dtype=np.float64)


# --------------------------------------------------------------------------
# Przypadek sztywny
# --------------------------------------------------------------------------

#: Tolerancja algebry sieci w tym module. Świadomie ostrzejsza niż domyślna
#: (1e-12): jakobian widma liczony jest różnicami centralnymi o kroku 1e-6, więc
#: szum sieci jest wzmacniany 1e6 razy. Drabina tolerancji opisana w
#: `calkowanie._newton_niejawny` wymaga: sieć << krok różnicowy << tolerancja.
TOLERANCJA_SIECI: float = 1.0e-13

#: Krok różnicy CENTRALNEJ przy liczeniu jakobianu widma. Kompromis: błąd
#: obcięcia rośnie jak h², szum sieci maleje jak 1/h. Przy h = 1e-6 i sieci
#: 1e-13 oba składniki są rzędu 1e-7 w wyrazach jakobianu.
KROK_ROZNICOWY_WIDMA: float = 1.0e-6

#: Zaburzenie startowe benchmarku: przyrost kąta wirnika [stopnie]. Wzbudza
#: WOLNY mod elektromechaniczny — czyli ten, którego wynik dotyczy — a szybkie
#: stany podąża za nim po rozmaitości wolnej. To jest istota sztywności: krok
#: metody jawnej jest ograniczony przez mod, którego nikt nie chce oglądać.
PRZYROST_KATA_DEG: float = 5.0


def przypadek_sztywny(
    *,
    t_pradu_s: float = 0.001,
    t_mocy_s: float = 0.2,
    h_s: float = 4.0,
    d_tlumienie: float = 2.0,
) -> tuple[ModelDynamiczny, dict[str, complex]]:
    """Przypadek C2 z JAWNIE ZMIERZONĄ sztywnością: maszyna + falownik kaskadowy.

    Topologia: ``GEN —(0,005+j0,10)— SN —(0,010+j0,15)— SYS`` (SYS sztywna).
    Na ``GEN`` maszyna 4. rzędu (sekundy), na ``SN`` falownik z pętlą prądową
    (milisekundy) i odbiór. Rozstaw skal czasowych: ``T_pradu`` ↔ ``Td0'``.

    ``d_tlumienie > 0`` jest tu WARUNKIEM SENSOWNOŚCI POMIARU, nie kosmetyką: przy
    ``D = 0`` część rzeczywista modu wahań dąży do zera, ``min|Re λ|`` schodzi do
    szumu numerycznego, a wskaźnik sztywności przestaje mierzyć cokolwiek
    (rośnie nieograniczenie z dokładnością obliczeń). Wartość ``D = 2`` p.u.
    mieści się w typowym zakresie 0…5 p.u.

    Maszyna pracuje **bez AVR i bez governora** — dzięki temu ``Efd`` i ``Pm`` są
    stanami stałymi, dającymi DWIE dokładnie zerowe wartości własne. To jest
    świadomy wybór: zera są strukturalne i policzalne z góry, więc filtr
    niezerowości we wskaźniku sztywności ma jawne uzasadnienie, a nie jest
    ukrywaniem szumu. (Przypięte testem
    ``test_zerowe_wartosci_wlasne_sa_strukturalne``.)
    """
    topologia = TopologiaSieci(
        szyny=("GEN", "SN", "SYS"),
        galezie=[
            Galaz("GEN", "SN", r_pu=0.005, x_pu=0.10),
            Galaz("SN", "SYS", r_pu=0.010, x_pu=0.15),
        ],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )
    zespol = ZespolSynchroniczny(
        maszyna=MaszynaSynchroniczna4Rzedu(
            ref="G1",
            szyna="GEN",
            h_s=h_s,
            d_tlumienie=d_tlumienie,
            ra_pu=0.0,
            xd_pu=1.8,
            xq_pu=1.7,
            xd_prim_pu=0.3,
            xq_prim_pu=0.55,
            td0_prim_s=8.0,
            tq0_prim_s=0.4,
        )
    )
    falownik = FalownikZKaskadaRegulacji(
        ref="INV", szyna="SN", t_pradu_s=t_pradu_s, t_mocy_s=t_mocy_s
    )
    odbior = OdbiorStalejMocy(ref="ODB", szyna="SN", p_pu=-0.7, q_pu=-0.2)
    model = ModelDynamiczny(topologia=topologia, urzadzenia=[zespol, falownik, odbior])
    moce = {
        "G1": complex(0.5, 0.15),
        "INV": complex(0.4, 0.05),
        "ODB": complex(-0.7, -0.2),
    }
    return model, moce


def silnik_przypadku(
    *,
    integrator: str = "rk4",
    krok_s: float = 0.001,
    t_pradu_s: float = 0.001,
    t_mocy_s: float = 0.2,
) -> tuple[SilnikRMS, NDArray[np.float64]]:
    """Zbuduj ŚWIEŻY silnik przypadku sztywnego i zwróć ``(silnik, x0)``.

    Świeży za każdym razem, bo ``inicjalizuj`` urządzeń MUTUJE je (falownik
    zapamiętuje ``P_ref``, zespół podmienia regulatory). Ponowne użycie
    zainicjalizowanego modelu dawałoby wynik zależny od historii wywołań —
    dokładnie to, czego zakazuje reguła determinizmu.
    """
    model, moce = przypadek_sztywny(t_pradu_s=t_pradu_s, t_mocy_s=t_mocy_s)
    silnik = SilnikRMS(
        model,
        integrator=integrator,
        krok_s=krok_s,
        tolerancja_sieci=TOLERANCJA_SIECI,
    )
    return silnik, silnik.inicjalizuj(moce)


def stan_zaburzony(
    x0: NDArray[np.float64], *, przyrost_kata_deg: float = PRZYROST_KATA_DEG
) -> NDArray[np.float64]:
    """Stan startowy benchmarku: równowaga + przyrost kąta wirnika maszyny.

    Indeks 0 wektora globalnego to ``delta`` maszyny ``G1`` — pierwsze urządzenie
    modelu. Zależność od kolejności urządzeń jest przypięta testem
    ``test_zaburzenie_trafia_w_kat_wirnika_maszyny``.
    """
    x = x0.astype(np.float64).copy()
    x[0] += math.radians(przyrost_kata_deg)
    return x


# --------------------------------------------------------------------------
# Widmo jakobianu — POMIAR sztywności
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class WidmoJakobianu:
    """Zmierzone widmo ``df/dx`` w punkcie pracy — sztywność wyrażona liczbą."""

    wartosci_wlasne: tuple[complex, ...]
    maks_re: float
    """``max|Re λ|`` — najszybszy mod [s⁻¹]."""
    min_re_niezerowe: float
    """``min|Re λ|`` po wartościach powyżej progu zera [s⁻¹]."""
    wskaznik_sztywnosci: float
    """``maks_re / min_re_niezerowe``. Powyżej ~100 zadanie uznajemy za sztywne."""
    liczba_zerowych: int
    """Ile wartości własnych odfiltrowano jako zerowe (strukturalne stany stałe)."""
    prog_zera: float
    """Bezwzględny próg [s⁻¹], poniżej którego ``Re λ`` uznano za zero."""

    @property
    def czestotliwosc_modu_wahan_hz(self) -> float | None:
        """Częstotliwość najwolniejszego modu oscylacyjnego [Hz], albo ``None``.

        ``None``, gdy widmo nie ma pary zespolonej — i to jest odpowiedź uczciwa,
        a nie powód, żeby podstawić wartość domyślną.
        """
        oscylacyjne = [w for w in self.wartosci_wlasne if abs(w.imag) > 1.0e-6]
        if not oscylacyjne:
            return None
        najwolniejszy = min(oscylacyjne, key=lambda w: abs(w.imag))
        return abs(najwolniejszy.imag) / (2.0 * math.pi)


def jakobian_numeryczny(
    silnik: SilnikRMS,
    x0: NDArray[np.float64],
    *,
    krok: float = KROK_ROZNICOWY_WIDMA,
) -> NDArray[np.float64]:
    """``df/dx`` różnicami CENTRALNYMI (błąd O(h²), nie O(h)).

    Różnica przednia zostawiłaby błąd O(h) rzędu 1e-6·|λ|, czyli 1e-3 s⁻¹ przy
    ``λ = 1000`` — porównywalny z najwolniejszą wartością własną (0,23 s⁻¹) i
    zafałszowałby wskaźnik sztywności. Koszt centralnej: dwa razy więcej
    ewaluacji, co przy jednorazowym pomiarze widma jest bez znaczenia.
    """
    n = len(x0)
    jakobian = np.zeros((n, n), dtype=np.float64)
    for kolumna in range(n):
        h = krok * max(abs(float(x0[kolumna])), 1.0)
        w_przod = x0.astype(np.float64).copy()
        w_przod[kolumna] += h
        w_tyl = x0.astype(np.float64).copy()
        w_tyl[kolumna] -= h
        jakobian[:, kolumna] = (silnik.pochodne(w_przod, 0.0) - silnik.pochodne(w_tyl, 0.0)) / (
            2.0 * h
        )
    return jakobian


def widmo_jakobianu(
    *,
    t_pradu_s: float = 0.001,
    t_mocy_s: float = 0.2,
    prog_zera_wzgledny: float = 1.0e-6,
) -> WidmoJakobianu:
    """Zmierz widmo jakobianu przypadku sztywnego w jego punkcie pracy.

    ``prog_zera_wzgledny`` jest odniesiony do ``max|Re λ|``. Dobór nie jest
    dowolny: zmierzone zera są **dokładnie** zerowe (wiersze jakobianu dla
    ``Efd`` i ``Pm`` są identycznie zerowe, bo maszyna nie ma regulatorów), a
    najwolniejsza NIEZEROWA wartość własna wynosi 0,233 s⁻¹, czyli 2,3·10⁵ razy
    więcej niż próg przy ``max|Re λ| = 1000``. Margines jest o rzędy większy niż
    jakakolwiek niepewność pomiaru.

    Raises:
        ValueError: gdy po odfiltrowaniu zer nie zostaje żadna wartość własna —
            wtedy wskaźnik sztywności nie istnieje i nie wolno go zwrócić.
    """
    silnik, x0 = silnik_przypadku(t_pradu_s=t_pradu_s, t_mocy_s=t_mocy_s)
    wartosci = np.linalg.eigvals(jakobian_numeryczny(silnik, x0))
    czesci_re = np.abs(wartosci.real)
    maks_re = float(np.max(czesci_re))
    prog = prog_zera_wzgledny * maks_re
    niezerowe = czesci_re[czesci_re > prog]
    if niezerowe.size == 0:
        raise ValueError(
            "Wszystkie wartości własne uznano za zerowe — wskaźnik sztywności "
            "nie istnieje dla tego punktu pracy."
        )
    min_re = float(np.min(niezerowe))
    return WidmoJakobianu(
        wartosci_wlasne=tuple(complex(w) for w in wartosci),
        maks_re=maks_re,
        min_re_niezerowe=min_re,
        wskaznik_sztywnosci=maks_re / min_re,
        liczba_zerowych=int(czesci_re.size - niezerowe.size),
        prog_zera=prog,
    )


# --------------------------------------------------------------------------
# Rozwiązanie odniesienia
# --------------------------------------------------------------------------


def rozwiazanie_odniesienia(
    *,
    czas_koncowy_s: float,
    t_pradu_s: float = 0.001,
    t_mocy_s: float = 0.2,
    rtol: float = 1.0e-10,
    atol: float = 1.0e-12,
) -> Callable[[NDArray[np.float64]], NDArray[np.float64]]:
    """Odniesienie: ``solve_ivp`` metodą ``Radau`` na TEJ SAMEJ funkcji ``f``.

    Radau (niejawna Runge-Kutta, rząd 5, L-stabilna) z adaptacyjnym krokiem jest
    właściwym odniesieniem dla zadania sztywnego: RK4 o stałym, bardzo małym
    kroku (odniesienie w ``benchmarki.porownaj_integratory``) musiałby tutaj
    zejść poniżej 2 ms z powodu stabilności, a nie dokładności, co czyni go
    kosztownym i — przy nieostrożnym doborze kroku — po prostu rozbieżnym.

    Zwraca funkcję interpolującą ``t -> x`` (gęste wyjście solvera), żeby błąd
    liczyć na DOKŁADNIE tych chwilach, w których metoda badana zapisała próbki,
    bez dodatkowej interpolacji liniowej po stronie porównania.

    Raises:
        RuntimeError: gdy solver odniesienia nie zbiegł — wtedy nie ma wobec
            czego mierzyć błędu i żaden wynik porównania nie jest ważny.
    """
    from scipy.integrate import solve_ivp

    silnik, x0 = silnik_przypadku(t_pradu_s=t_pradu_s, t_mocy_s=t_mocy_s)
    x_start = stan_zaburzony(x0)
    rozwiazanie = solve_ivp(
        lambda t, x: silnik.pochodne(np.asarray(x, dtype=np.float64), float(t)),
        (0.0, czas_koncowy_s),
        x_start,
        method="Radau",
        rtol=rtol,
        atol=atol,
        dense_output=True,
    )
    if not rozwiazanie.success:
        raise RuntimeError(f"Rozwiązanie odniesienia (Radau) nie zbiegło: {rozwiazanie.message}")

    def w_chwilach(czasy: NDArray[np.float64]) -> NDArray[np.float64]:
        return np.asarray(rozwiazanie.sol(czasy), dtype=np.float64)

    return w_chwilach


# --------------------------------------------------------------------------
# Pomiar pojedynczego integratora
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class PomiarIntegratora:
    """Zmierzone własności jednego integratora na przypadku sztywnym."""

    nazwa: str
    krok_s: float
    stabilny: bool
    """``False`` = przebieg rozbiegł się albo solver zgłosił błąd."""
    blad_max: float | None
    """Maksimum po WSZYSTKICH stanach i chwilach wobec Radau. ``None``, gdy niestabilny."""
    blad_kata_rad: float | None
    """To samo, ale tylko dla ``delta`` maszyny — wielkość o interpretacji fizycznej."""
    ewaluacje_pochodnych: int
    ewaluacje_na_krok: float
    liczba_krokow: int
    czas_wykonania_s: float
    powod_niepowodzenia: str | None
    """Klasa wyjątku i chwila, w której przebieg padł — adres defektu, nie flaga."""


#: Próg rozbiegnięcia: odchyłka kąta wirnika [rad] uznawana za utratę sensu
#: przebiegu. 1 rad ≈ 57° przy zaburzeniu 5° to 11-krotność zaburzenia; żaden
#: przebieg stabilny w tym przypadku nawet się do tego nie zbliża (zmierzone
#: maksimum ~0,09 rad), a przebieg rozbieżny przekracza to w kilkanaście kroków.
PROG_ROZBIEGNIECIA_RAD: float = 1.0

#: Kolejność stanów w wektorze globalnym przypadku sztywnego (G1, INV, ODB).
STANY_PRZYPADKU: tuple[tuple[str, str], ...] = (
    ("G1", "delta_rad"),
    ("G1", "omega_pu"),
    ("G1", "e_q_prim_pu"),
    ("G1", "e_d_prim_pu"),
    ("G1", "efd_pu"),
    ("G1", "pm_pu"),
    ("INV", "i_d_zad_pu"),
    ("INV", "i_q_zad_pu"),
    ("INV", "i_d_pu"),
    ("INV", "i_q_pu"),
)


def zmierz_integrator(
    nazwa: str,
    krok_s: float,
    *,
    czas_koncowy_s: float,
    odniesienie: Callable[[NDArray[np.float64]], NDArray[np.float64]] | None = None,
    t_pradu_s: float = 0.001,
    t_mocy_s: float = 0.2,
) -> PomiarIntegratora:
    """Uruchom jeden integrator z jednym krokiem i zmierz wszystko, co mierzalne.

    Niepowodzenie JEST wynikiem pomiaru, nie wyjątkiem do połknięcia: metoda
    jawna na zadaniu sztywnym rozbiega się i sposób, w jaki to robi, jest
    informacją. W tym laboratorium wybieg stanu ujawnia się jako
    ``BrakZbieznosciSieciError`` — algebra sieci przestaje mieć rozwiązanie,
    zanim stan zdąży stać się ``NaN``. To ten sam fakt, zapisany przez pierwszą
    warstwę, która go wykrywa.
    """
    if nazwa not in INTEGRATORY:
        raise KeyError(f"Nieznany integrator {nazwa!r}; dostępne: {sorted(INTEGRATORY)}")
    silnik, x0 = silnik_przypadku(
        integrator=nazwa, krok_s=krok_s, t_pradu_s=t_pradu_s, t_mocy_s=t_mocy_s
    )
    x_start = stan_zaburzony(x0)
    zegar = time.perf_counter()
    wynik = silnik.symuluj(x_start, czas_koncowy_s=czas_koncowy_s)
    czas_wykonania = time.perf_counter() - zegar

    diagnostyka = wynik.diagnostyka
    liczba_krokow = max(1, diagnostyka.liczba_krokow)
    ewaluacje_na_krok = (diagnostyka.ewaluacje_pochodnych - 1) / liczba_krokow

    if not diagnostyka.zbiegl:
        blad = diagnostyka.blad
        powod = (
            f"{blad.klasa} w fazie {blad.faza} przy t = {blad.czas_s:.4f} s"
            if blad is not None
            else "solver nie zbiegł bez zapisanej przyczyny"
        )
        return PomiarIntegratora(
            nazwa=nazwa,
            krok_s=krok_s,
            stabilny=False,
            blad_max=None,
            blad_kata_rad=None,
            ewaluacje_pochodnych=diagnostyka.ewaluacje_pochodnych,
            ewaluacje_na_krok=ewaluacje_na_krok,
            liczba_krokow=liczba_krokow,
            czas_wykonania_s=czas_wykonania,
            powod_niepowodzenia=powod,
        )

    czasy = np.asarray(wynik.czas_s, dtype=np.float64)
    stany = np.array(
        [wynik.sygnal(nazwa_stanu, ref).wartosci for ref, nazwa_stanu in STANY_PRZYPADKU],
        dtype=np.float64,
    )
    kat = stany[0]
    if float(np.max(np.abs(kat - kat[0]))) > PROG_ROZBIEGNIECIA_RAD:
        return PomiarIntegratora(
            nazwa=nazwa,
            krok_s=krok_s,
            stabilny=False,
            blad_max=None,
            blad_kata_rad=None,
            ewaluacje_pochodnych=diagnostyka.ewaluacje_pochodnych,
            ewaluacje_na_krok=ewaluacje_na_krok,
            liczba_krokow=liczba_krokow,
            czas_wykonania_s=czas_wykonania,
            powod_niepowodzenia=(
                f"kąt wirnika wybiegł o {float(np.max(np.abs(kat - kat[0]))):.3f} rad "
                f"(próg {PROG_ROZBIEGNIECIA_RAD} rad)"
            ),
        )

    if odniesienie is None:
        odniesienie = rozwiazanie_odniesienia(
            czas_koncowy_s=czas_koncowy_s, t_pradu_s=t_pradu_s, t_mocy_s=t_mocy_s
        )
    wzorzec = odniesienie(czasy)
    roznica = np.abs(stany - wzorzec)
    return PomiarIntegratora(
        nazwa=nazwa,
        krok_s=krok_s,
        stabilny=True,
        blad_max=float(np.max(roznica)),
        blad_kata_rad=float(np.max(roznica[0])),
        ewaluacje_pochodnych=diagnostyka.ewaluacje_pochodnych,
        ewaluacje_na_krok=ewaluacje_na_krok,
        liczba_krokow=liczba_krokow,
        czas_wykonania_s=czas_wykonania,
        powod_niepowodzenia=None,
    )


def porownaj_integratory_na_przypadku_sztywnym(
    *,
    kroki_s: tuple[float, ...] = (0.001, 0.002, 0.005, 0.010, 0.020),
    czas_koncowy_s: float = 1.0,
    nazwy: tuple[str, ...] | None = None,
    t_pradu_s: float = 0.001,
    t_mocy_s: float = 0.2,
) -> tuple[PomiarIntegratora, ...]:
    """Pełne porównanie: każdy integrator × każdy krok, wobec jednego odniesienia.

    Odniesienie liczone JEDEN raz i współdzielone — inaczej porównanie mierzyłoby
    też rozrzut solvera odniesienia między wywołaniami.

    Kolejność wyników jest deterministyczna (sortowana po nazwie, potem po kroku)
    i **nie zależy od kolejności wywołań** — przypięte testem
    ``test_wynik_nie_zalezy_od_kolejnosci_wywolan``.
    """
    wybrane = tuple(sorted(nazwy)) if nazwy is not None else tuple(sorted(INTEGRATORY))
    odniesienie = rozwiazanie_odniesienia(
        czas_koncowy_s=czas_koncowy_s, t_pradu_s=t_pradu_s, t_mocy_s=t_mocy_s
    )
    return tuple(
        zmierz_integrator(
            nazwa,
            krok,
            czas_koncowy_s=czas_koncowy_s,
            odniesienie=odniesienie,
            t_pradu_s=t_pradu_s,
            t_mocy_s=t_mocy_s,
        )
        for nazwa in wybrane
        for krok in sorted(kroki_s)
    )


# --------------------------------------------------------------------------
# Iteracje Newtona — POMIAR BEZPOŚREDNI
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class PomiarNewtona:
    """Zmierzona praca iteracji niejawnej w jednym kroku całkowania."""

    nazwa: str
    krok_s: float
    iteracje_na_krok: float
    """Średnia liczba ewaluacji REZYDUALNYCH (iteracji Newtona) na krok."""
    ewaluacje_na_krok: float
    """Średnia liczba wszystkich ewaluacji ``f`` na krok (z sondami jakobianu)."""
    zbadane_kroki: int


#: Największa względna zmiana współrzędnej, przy której wywołanie ``f`` uznajemy
#: za SONDĘ jakobianu, a nie za nową iterację. `calkowanie._KROK_ROZNICOWY` to
#: ~1,49e-8; próg 1e-5 daje trzy rzędy marginesu, a jednocześnie jest o rzędy
#: mniejszy niż realny krok Newtona.
PROG_SONDY_JAKOBIANU: float = 1.0e-5


def zmierz_iteracje_newtona(
    nazwa: str,
    krok_s: float,
    *,
    liczba_krokow: int = 20,
    t_pradu_s: float = 0.001,
    t_mocy_s: float = 0.2,
) -> PomiarNewtona | None:
    """Policz iteracje Newtona BEZPOŚREDNIO, obserwując argumenty wywołań ``f``.

    ``calkowanie.Integrator.krok`` zwraca liczbę ewaluacji ``f``, ale ``SilnikRMS``
    ją **odrzuca** (``x, _ = self.integrator.krok(...)``), a ``DiagnostykaSolvera``
    nie ma pola na iteracje Newtona. Pomiar pośredni (dzielenie ewaluacji przez
    krok) wymagałby założenia o strukturze jądra niejawnego — a założenie nie jest
    pomiarem. Dlatego liczymy wprost.

    REGUŁA ROZPOZNANIA (jedyne miejsce, w którym ten pomiar może się mylić):
    wywołanie ``f`` jest **sondą jakobianu**, jeśli jego argument różni się od
    ostatniego argumentu rezydualnego w DOKŁADNIE jednej współrzędnej i to o mniej
    niż ``PROG_SONDY_JAKOBIANU`` względnie. Pozostałe wywołania to iteracje.
    Pierwsze wywołanie w kroku (``f0`` w punkcie wyjścia) nie jest iteracją.
    Zgodność tej reguły z licznikiem ewaluacji zwracanym przez sam integrator
    jest przypięta testem ``test_pomiar_iteracji_zgadza_sie_z_licznikiem_integratora``.

    Returns:
        ``None`` dla integratorów JAWNYCH — nie mają iteracji Newtona i podanie
        dla nich liczby (choćby zera) byłoby fałszywą informacją.
    """
    integrator = INTEGRATORY[nazwa]
    if integrator.jawny:
        return None
    silnik, x0 = silnik_przypadku(
        integrator=nazwa, krok_s=krok_s, t_pradu_s=t_pradu_s, t_mocy_s=t_mocy_s
    )
    x = stan_zaburzony(x0)

    licznik = {"iteracje": 0, "ewaluacje": 0}
    ostatni_rezydualny: list[NDArray[np.float64] | None] = [None]

    def f_obserwowana(stan: NDArray[np.float64], t: float) -> NDArray[np.float64]:
        licznik["ewaluacje"] += 1
        baza = ostatni_rezydualny[0]
        if baza is not None and _jest_sonda_jakobianu(stan, baza):
            return silnik.pochodne(stan, t)
        if baza is not None:
            licznik["iteracje"] += 1
        ostatni_rezydualny[0] = stan.astype(np.float64).copy()
        return silnik.pochodne(stan, t)

    t = 0.0
    for _ in range(liczba_krokow):
        ostatni_rezydualny[0] = None
        x, _ = integrator.krok(f_obserwowana, x, t, krok_s)
        t += krok_s
        silnik.zatwierdz_punkt_pracy(silnik.rozwiaz_siec(x))
    return PomiarNewtona(
        nazwa=nazwa,
        krok_s=krok_s,
        iteracje_na_krok=licznik["iteracje"] / liczba_krokow,
        ewaluacje_na_krok=licznik["ewaluacje"] / liczba_krokow,
        zbadane_kroki=liczba_krokow,
    )


def _jest_sonda_jakobianu(stan: NDArray[np.float64], baza: NDArray[np.float64]) -> bool:
    """Czy ``stan`` to perturbacja ``baza`` w dokładnie jednej współrzędnej."""
    roznica = np.abs(stan - baza)
    zmienione = np.nonzero(roznica)[0]
    if zmienione.size != 1:
        return False
    k = int(zmienione[0])
    return bool(roznica[k] < PROG_SONDY_JAKOBIANU * max(abs(float(baza[k])), 1.0))


# --------------------------------------------------------------------------
# Kroki graniczne
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class KrokGraniczny:
    """Największy krok spełniający zadane kryterium — z jawną informacją o zakresie."""

    nazwa: str
    krok_s: float
    ograniczony_przedzialem: bool
    """``True`` = kryterium było spełnione w CAŁYM badanym przedziale.

    Wtedy ``krok_s`` jest **górnym końcem przedziału**, a nie zmierzoną granicą.
    Metoda A-stabilna nie ma granicy stabilności — i zwrócenie liczby udającej,
    że ją zmierzono, byłoby fabrykacją.
    """
    przedzial_s: tuple[float, float]
    kryterium: str


def _bisekcja_kroku(
    spelnia: Callable[[float], bool],
    *,
    dolny_s: float,
    gorny_s: float,
    dokladnosc_wzgledna: float,
) -> tuple[float, bool]:
    """Największy krok spełniający ``spelnia`` — bisekcja geometryczna.

    ZAŁOŻENIE: ``spelnia`` jest monotoniczne (raz przestaje zachodzić, nie wraca).
    Dla błędu integratora rosnącego z krokiem jest to prawda i jest **przypięta
    testem** ``test_blad_rosnie_monotonicznie_z_krokiem``. Bez tego założenia
    bisekcja mogłaby zwrócić dowolny punkt przedziału.

    Bisekcja po średniej GEOMETRYCZNEJ, nie arytmetycznej: przedział rozciąga się
    na dwa rzędy wielkości, więc podział logarytmiczny daje tę samą dokładność
    względną w kilkukrotnie mniejszej liczbie symulacji.
    """
    if not spelnia(dolny_s):
        raise ValueError(
            f"Kryterium nie jest spełnione już przy najmniejszym badanym kroku "
            f"{dolny_s * 1000:.3f} ms — granica leży poza badanym przedziałem od dołu."
        )
    if spelnia(gorny_s):
        return gorny_s, True
    dol, gora = dolny_s, gorny_s
    while (gora - dol) / dol > dokladnosc_wzgledna:
        srodek = math.sqrt(dol * gora)
        if spelnia(srodek):
            dol = srodek
        else:
            gora = srodek
    return dol, False


def krok_graniczny_stabilnosci(
    nazwa: str,
    *,
    dolny_s: float = 0.0005,
    gorny_s: float = 0.050,
    czas_koncowy_s: float = 0.4,
    dokladnosc_wzgledna: float = 0.05,
    t_pradu_s: float = 0.001,
    t_mocy_s: float = 0.2,
) -> KrokGraniczny:
    """Największy krok, przy którym przebieg NIE rozbiega się (bez wymogu dokładności).

    To jest wielkość porównywalna z **zamkniętym wzorem** teorii stabilności
    liniowej: dla Eulera jawnego granica wynosi ``2/|λ|max``, dla RK4 —
    ``2,7853/|λ|max``. Zgodność pomiaru ze wzorem jest przypięta testem
    ``test_krok_graniczny_metod_jawnych_zgadza_sie_ze_wzorem`` i to ona czyni ten
    przypadek dowodem na poziomie wyroczni analitycznej, a nie tylko własności.

    ``czas_koncowy_s`` jest krótki celowo: metoda niestabilna rozbiega się w
    kilkunastu krokach (zmierzone: Euler jawny przy 5 ms pada w 0,06 s), więc
    dłuższy przebieg nie wnosi informacji, a kosztuje.
    """

    def stabilny(krok: float) -> bool:
        pomiar = zmierz_integrator(
            nazwa,
            krok,
            czas_koncowy_s=czas_koncowy_s,
            odniesienie=_odniesienie_pomijane,
            t_pradu_s=t_pradu_s,
            t_mocy_s=t_mocy_s,
        )
        return pomiar.stabilny

    krok, przedzialem = _bisekcja_kroku(
        stabilny,
        dolny_s=dolny_s,
        gorny_s=gorny_s,
        dokladnosc_wzgledna=dokladnosc_wzgledna,
    )
    return KrokGraniczny(
        nazwa=nazwa,
        krok_s=krok,
        ograniczony_przedzialem=przedzialem,
        przedzial_s=(dolny_s, gorny_s),
        kryterium=f"kąt wirnika nie wybiega ponad {PROG_ROZBIEGNIECIA_RAD} rad",
    )


def _odniesienie_pomijane(czasy: NDArray[np.float64]) -> NDArray[np.float64]:
    """Odniesienie-zaślepka dla kryterium STABILNOŚCI, gdzie błąd nie jest liczony.

    Zwraca zera, więc ``blad_max`` w takim pomiarze jest bez znaczenia — i
    dlatego ``krok_graniczny_stabilnosci`` czyta z niego WYŁĄCZNIE pole
    ``stabilny``. Alternatywą byłoby liczenie rozwiązania Radau przy każdym
    kroku bisekcji, czyli płacenie za liczbę, której kryterium nie używa.
    """
    return np.zeros((len(STANY_PRZYPADKU), len(czasy)), dtype=np.float64)


def maksymalny_krok_dokladnosci(
    nazwa: str,
    *,
    prog_bledu: float,
    dolny_s: float = 0.0005,
    gorny_s: float = 0.050,
    czas_koncowy_s: float = 1.0,
    dokladnosc_wzgledna: float = 0.05,
    t_pradu_s: float = 0.001,
    t_mocy_s: float = 0.2,
) -> KrokGraniczny:
    """Największy krok, przy którym błąd wobec Radau pozostaje poniżej progu.

    To jest odpowiedź inżynierska na pytanie D-02: „ile kroku kupuje mi ta metoda
    przy wymaganej dokładności". Kryterium stabilności (powyżej) odpowiada na
    pytanie teoretyczne; to — na praktyczne.
    """
    odniesienie = rozwiazanie_odniesienia(
        czas_koncowy_s=czas_koncowy_s, t_pradu_s=t_pradu_s, t_mocy_s=t_mocy_s
    )

    def dokladny(krok: float) -> bool:
        pomiar = zmierz_integrator(
            nazwa,
            krok,
            czas_koncowy_s=czas_koncowy_s,
            odniesienie=odniesienie,
            t_pradu_s=t_pradu_s,
            t_mocy_s=t_mocy_s,
        )
        return pomiar.stabilny and pomiar.blad_max is not None and pomiar.blad_max <= prog_bledu

    krok, przedzialem = _bisekcja_kroku(
        dokladny,
        dolny_s=dolny_s,
        gorny_s=gorny_s,
        dokladnosc_wzgledna=dokladnosc_wzgledna,
    )
    return KrokGraniczny(
        nazwa=nazwa,
        krok_s=krok,
        ograniczony_przedzialem=przedzialem,
        przedzial_s=(dolny_s, gorny_s),
        kryterium=f"blad_max <= {prog_bledu:.1e}",
    )


# --------------------------------------------------------------------------
# Prezentacja
# --------------------------------------------------------------------------


def tabela_porownania(pomiary: tuple[PomiarIntegratora, ...]) -> str:
    """Tabela Markdown do meldunku — żeby liczb nie przepisywać ręcznie.

    Przepisywanie liczb do dokumentu jest miejscem, w którym meldunek rozjeżdża
    się z pomiarem; ta funkcja usuwa ten krok.
    """
    naglowek = (
        "| Integrator | dt [ms] | stabilny | błąd max | błąd δ [rad] | "
        "ewal. | ewal./krok | czas [s] | uwaga |"
    )
    wiersze = [naglowek, "|---|---|---|---|---|---|---|---|---|"]
    for p in pomiary:
        blad = f"{p.blad_max:.3e}" if p.blad_max is not None else "—"
        blad_kata = f"{p.blad_kata_rad:.3e}" if p.blad_kata_rad is not None else "—"
        uwaga = p.powod_niepowodzenia or ""
        wiersze.append(
            f"| `{p.nazwa}` | {p.krok_s * 1000:.2f} | {'tak' if p.stabilny else 'NIE'} | "
            f"{blad} | {blad_kata} | {p.ewaluacje_pochodnych} | {p.ewaluacje_na_krok:.1f} | "
            f"{p.czas_wykonania_s:.2f} | {uwaga} |"
        )
    return "\n".join(wiersze)


def raport_sztywnosci(
    *,
    kroki_s: tuple[float, ...] = (0.001, 0.002, 0.005, 0.010, 0.020),
    czas_koncowy_s: float = 1.0,
) -> str:
    """Pełny raport D-02: widmo + tabela porównania + iteracje Newtona.

    Nie zwraca żadnego werdyktu ani statusu dowodowego — wybór integratora dla
    produkcji jest decyzją właściciela programu podejmowaną NA podstawie tych
    liczb, a nie własnością liczb.
    """
    widmo = widmo_jakobianu()
    czestotliwosc = widmo.czestotliwosc_modu_wahan_hz
    linie = [
        "## Przypadek sztywny — widmo jakobianu w punkcie pracy",
        "",
        f"- `max|Re λ|` = {widmo.maks_re:.4g} s⁻¹",
        f"- `min|Re λ|` (niezerowe) = {widmo.min_re_niezerowe:.4g} s⁻¹",
        f"- **wskaźnik sztywności = {widmo.wskaznik_sztywnosci:.4g}**",
        f"- wartości własne odfiltrowane jako zerowe: {widmo.liczba_zerowych} "
        f"(próg {widmo.prog_zera:.3e} s⁻¹)",
        (
            f"- mod wahań elektromechanicznych: {czestotliwosc:.4g} Hz"
            if czestotliwosc is not None
            else "- brak modu oscylacyjnego w widmie"
        ),
        "",
        "## Porównanie integratorów (odniesienie: Radau, rtol 1e-10)",
        "",
        tabela_porownania(
            porownaj_integratory_na_przypadku_sztywnym(
                kroki_s=kroki_s, czas_koncowy_s=czas_koncowy_s
            )
        ),
        "",
        "## Iteracje Newtona (pomiar bezpośredni, obserwacja argumentów `f`)",
        "",
        "| Integrator | dt [ms] | iteracje/krok | ewaluacje/krok |",
        "|---|---|---|---|",
    ]
    for nazwa in sorted(INTEGRATORY):
        for krok in sorted(kroki_s):
            pomiar = zmierz_iteracje_newtona(nazwa, krok)
            if pomiar is None:
                continue
            linie.append(
                f"| `{nazwa}` | {krok * 1000:.2f} | {pomiar.iteracje_na_krok:.2f} | "
                f"{pomiar.ewaluacje_na_krok:.2f} |"
            )
    return "\n".join(linie)
