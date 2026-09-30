"""Fizyka odbiorow rdzenia dynamiki RMS: charakterystyka statyczna z przejsciem PQ -> Z.

JEDEN MODEL ODBIORU. Kazdy odbior ma charakterystyke statyczna
(`kontrakty.CharakterystykaOdbioru`): wielomian ZIP rozplywu razy liniowy czynnik
czestotliwosciowy, a ponizej zadeklarowanego napiecia przejscia `U_min` — stala
impedancja. Odbior stalej mocy (`a = b = 0`, `c = 1`, `k = 0`) jest szczegolnym
ksztaltem tej charakterystyki, nie osobnym modelem: te same funkcje, te same wzory.

GALAZ CHARAKTERYSTYKI (`|V| >= U_min`, `r = |V|/v0`):

    P(V, f) = P0 * F_P(f) * [a_p r^2 + b_p r + c_p] ,   F_P = 1 + k_pf (f - f0)/f0
    Q(V, f) = Q0 * F_Q(f) * [a_q r^2 + b_q r + c_q] ,   F_Q = 1 + k_qf (f - f0)/f0
    I_wstrz = -conj(S)/conj(V)

to sa DOKLADNIE wzory rozpływu (`power_flow_zip.zip_factor`, `frequency_factor`) —
rdzen ich nie importuje (granica B-01), parytet dowodzi test.

GALAZ IMPEDANCYJNA (`|V| < U_min`):

    S(V, f) = S(U_min, f) * (|V|/U_min)^2 ,  I_wstrz = -Y V ,  Y = conj(S(U_min, f))/U_min^2

bez dzielenia przez napiecie: w `V = 0` prad jest ZEREM, jakobian skonczony (`-Y`).
Moc i prad sa CIAGLE w `U_min` z konstrukcji (ta sama `S(U_min)` po obu stronach);
pochodna `dS/d|V|` ma w `U_min` zalamanie — to cecha modelu, nazwana w zalozeniach
wyniku. Odbior CZYSTO impedancyjny (`b = c = 0` dla P i Q) liczy sie zawsze wzorem
admitancji (`Y = conj(S(v0))/v0^2` — ta sama charakterystyka, bez dzielenia przez V).

DLACZEGO PRZECHODZI TEZ SKLADOWA STALOPRADOWA. Prad skladowej `b` ma staly modul
`b P0/v0` i kierunek `V/|V|` — w `V = 0` kierunek nie istnieje (0/0). Przejscie
wylacznie skladowej stalomocowej zostawiloby te sama osobliwosc w innej skladowej.

JEDEN PREDYKAT GALEZI (`w_galezi_impedancyjnej`) rozstrzyga wartosc pradu, jakobian,
moc pobierana i kod `tryb_odbioru@` — cztery miejsca, jedno zrodlo prawdy.

PARYTET BITOWY STALEJ MOCY. Dla `v0 = None` (brak skladowej Z i I) wielomian jest
DOKLADNIE `c`, dla `f0 = None` czynnik czestotliwosciowy jest DOKLADNIE `1,0`, a prad i
jakobian bazowy licza sie tym samym wyrazeniem, co przed ta karta (`prad_mocy_pu`,
`jakobian_pradu_mocy`); wklad `dS/d|V|` jest dopisywany wylacznie przy niezerowych
`a`, `b` (warunek strukturalny `v0 is not None`, nie tolerancja). Bieg ze stala moca,
w ktorym zaden iterat nie schodzi ponizej `U_min`, jest wiec bitowo ten sam.

CZESTOTLIWOSC WIDZIANA PRZEZ ODBIOR — ESTYMATOR KATOWY, JEDEN STAN. Odbior czuly
czestotliwosciowo (`k_pf != 0` albo `k_qf != 0`) ma stan `x = kat_pomiaru_rad` i wejscie
`e = arg(V e^{-jx})` (argument w (-pi, pi], BEZ roznicowania katow):

    dx/dt = e / T_f ,     dw_hat = e / (w_n T_f) ,     f_hat = f_n (1 + dw_hat)

Miedzy zdarzeniami, gdy `|theta - x| < pi`, zachodzi DOKLADNIE `T_f d(dw_hat)/dt =
dw_szyny - dw_hat` z `dw_szyny = theta_dot / w_n` — ta sama wielkosc, ktora publikuje
`f_hz@` szyny (obserwabla, W6-A par. 3). Wyprowadzenie: `e = theta - x` (bez zawijania,
gdy `|theta - x| < pi`), wiec `de/dt = theta_dot - e/T_f`, a `dw_hat = e/(w_n T_f)` daje
`T_f d(dw_hat)/dt = theta_dot/w_n - dw_hat`. To nie jest przyblizenie malosygnalowe, tylko
tozsamosc (test `test_estymator_jest_inercja_pierwszego_rzedu_czestotliwosci_szyny`).

* `x(0) = arg V_pf` => `e(0) = 0` => `f_hat(0) = f_n` = czestotliwosc studium rozpływu
  (parytet t = 0 czynnika czestotliwosciowego).
* `V = 0` dokladnie (obszar beznapieciowy, wezel zwarty metalicznie): `e := 0` i
  `de/dV := 0` (0 nalezy do subrozniczki) => `x` trzymane; prad odbioru w `V = 0` jest zerem
  niezaleznie od `f_hat` (galaz impedancyjna).
* Ponowne zasilenie wezla odbioru: `x := arg V+` w re-inicjalizacji chwili (silnik; algebra
  tej chwili liczy odbior z `f_hat = f_n`, `estymator_wyzerowany`) — odbior odciety nie
  mierzyl, a faza po przerwie jest dowolna.
* Odbior odlaczony zdarzeniem na zywej szynie: estymator sledzi napiecie szyny (regula
  szczegolna nie jest potrzebna), prad jest zerem.
* Zakres waznosci (sprawdzany po kazdym przyjetym kroku i po kazdej re-inicjalizacji,
  `sprawdz_zakres_waznosci`): czynnik czestotliwosciowy `F > 0` (odbior nie zmienia znaku
  mocy bazowej) oraz brak poslizgu estymatora (`|theta - x| < pi` — przejscie `e` przez
  +-pi miedzy krokami jest skokiem 2 pi, a nie ruchem fizycznym).

Estymator jest czescia MODELU ODBIORU (odbiorniki reaguja na czestotliwosc przez predkosc
napedow, nie natychmiast), a nie obserwabla ze stanem: `f_hz@` szyny zostaje obserwabla
(`obserwable.py`). `f_hz@` wprost w pradzie odbioru zrobiloby z `g(x, y) = 0` uklad z `ydot`
w algebrze (indeks wyzszy niz 1), a filtr fazora (`z_dot = (V - z)/T_f`) dawalby po przerwie
beznapieciowej estymate rosnaca jak `1/|z|`; estymator katowy ma `|dw_hat| <= pi/(w_n T_f)`.
"""

from __future__ import annotations

import cmath
import math
from dataclasses import dataclass

import numpy as np

from .kontrakty import (
    KOD_ODBIOR_PONIZEJ_NAPIECIA_PRZEJSCIA,
    KOD_ZAKRES_WAZNOSCI_PRZEKROCZONY,
    CharakterystykaOdbioru,
    OdbiorDynamiki,
    OdmowaDynamiki,
    WymaganiaOdbioru,
    wymagane_parametry_odbioru,
)
from .tozsamosc import kwantyzuj

#: Kody kanalu `tryb_odbioru@` — zbior ZAMKNIETY, przypiety testem.
TRYB_CHARAKTERYSTYKA = 0.0
TRYB_IMPEDANCJA = 1.0
TRYB_ODLACZONY = 2.0
TRYB_ODCIETY = 3.0

OPIS_TRYBU_ODBIORU_PL: dict[float, str] = {
    TRYB_CHARAKTERYSTYKA: (
        "charakterystyka odbioru (napięcie nie niższe niż napięcie przejścia albo odbiór "
        "czysto impedancyjny)"
    ),
    TRYB_IMPEDANCJA: "stała impedancja (napięcie poniżej napięcia przejścia)",
    TRYB_ODLACZONY: "odłączony zdarzeniem",
    TRYB_ODCIETY: "odcięty — obszar beznapięciowy",
}


# ---------------------------------------------------------------------------
# Budowa charakterystyki (regula „pole nieuzywane = None" zyje TUTAJ, nie u wolajacego)
# ---------------------------------------------------------------------------


def charakterystyka_stalej_mocy(*, u_min_pu: float) -> CharakterystykaOdbioru:
    """Charakterystyka odbioru stalej mocy (`c = 1`, bez czulosci czestotliwosciowej).

    Napiecie przejscia `U_min` jest WYMAGANE: prad skladowej stalomocowej nie istnieje przy
    `V = 0`, wiec kazdy odbior z ta skladowa deklaruje, ponizej jakiego napiecia staje sie
    stala impedancja (`wymagane_parametry_odbioru`).
    """
    return CharakterystykaOdbioru(
        a_p=0.0,
        b_p=0.0,
        c_p=1.0,
        a_q=0.0,
        b_q=0.0,
        c_q=1.0,
        v0_pu=None,
        k_pf=0.0,
        k_qf=0.0,
        f0_hz=None,
        u_min_pu=u_min_pu,
        t_pomiaru_czestotliwosci_s=None,
    )


def charakterystyka_z_wielomianu(
    *,
    a_p: float,
    b_p: float,
    c_p: float,
    a_q: float,
    b_q: float,
    c_q: float,
    v0_pu: float,
    k_pf: float,
    k_qf: float,
    f0_hz: float,
    u_min_pu: float | None,
    t_pomiaru_czestotliwosci_s: float | None,
) -> CharakterystykaOdbioru:
    """Charakterystyka z KOMPLETU wspolczynnikow rozpływu (`ZipCoeffs` po stronie ENM) i
    parametrow modelu dynamicznego odbioru (blok `Load.dynamika`).

    Rozplyw niesie zawsze `v0` i `f0`; tutaj staja sie `None`, gdy ksztalt wielomianu ich
    nie uzywa (brak skladowej Z i I, brak czulosci czestotliwosciowej) — wolajacy (adapter)
    nie ma wlasnego predykatu „kiedy pole ma znaczenie". Parametry dynamiczne (`U_min`,
    `T_f`) przychodza z bloku odbioru takie, jakie sa: ich zgodnosc z wielomianem sprawdza
    kontrakt (`wymagane_parametry_odbioru` — ta sama funkcja, co bramka danych adaptera).
    """
    wymagania = wymagane_parametry_odbioru(
        a_p=a_p, b_p=b_p, c_p=c_p, a_q=a_q, b_q=b_q, c_q=c_q, k_pf=k_pf, k_qf=k_qf
    )
    return CharakterystykaOdbioru(
        a_p=a_p,
        b_p=b_p,
        c_p=c_p,
        a_q=a_q,
        b_q=b_q,
        c_q=c_q,
        v0_pu=v0_pu if wymagania.v0_pu else None,
        k_pf=k_pf,
        k_qf=k_qf,
        f0_hz=f0_hz if wymagania.f0_hz else None,
        u_min_pu=u_min_pu,
        t_pomiaru_czestotliwosci_s=t_pomiaru_czestotliwosci_s,
    )


def wymagania_charakterystyki(charakterystyka: CharakterystykaOdbioru) -> WymaganiaOdbioru:
    """`wymagane_parametry_odbioru` dla gotowej charakterystyki (jedno zrodlo regul,
    policzone raz przy konstrukcji kontraktu)."""
    return charakterystyka.wymagania


# ---------------------------------------------------------------------------
# Predykaty
# ---------------------------------------------------------------------------


def jest_czysta_impedancja(charakterystyka: CharakterystykaOdbioru) -> bool:
    """Odbior czysto impedancyjny: brak skladowej stalopradowej i stalomocowej (P i Q).

    Ten sam warunek, ktory w `wymagane_parametry_odbioru` zwalnia odbior z `U_min`.
    """
    return not wymagania_charakterystyki(charakterystyka).u_min_pu


def w_galezi_impedancyjnej(charakterystyka: CharakterystykaOdbioru, modul_v: float) -> bool:
    """JEDEN predykat galezi: `|V| < U_min` (odbior czysto impedancyjny — nigdy)."""
    return charakterystyka.u_min_pu is not None and modul_v < charakterystyka.u_min_pu


def _wzorem_admitancji(charakterystyka: CharakterystykaOdbioru, modul_v: float) -> bool:
    return jest_czysta_impedancja(charakterystyka) or w_galezi_impedancyjnej(
        charakterystyka, modul_v
    )


def _moc_zerowa(odbior: OdbiorDynamiki) -> bool:
    return odbior.p_pu == 0.0 and odbior.q_pu == 0.0


def jest_czuly_czestotliwosciowo(charakterystyka: CharakterystykaOdbioru) -> bool:
    """Czulosc czestotliwosciowa — ten sam warunek, co `f0`/`T_f` w wymaganiach."""
    return wymagania_charakterystyki(charakterystyka).t_pomiaru_czestotliwosci_s


# ---------------------------------------------------------------------------
# Wzory charakterystyki statycznej (przy zadanej czestotliwosci widzianej przez odbior)
# ---------------------------------------------------------------------------


def prad_mocy_pu(moc_p_pu: float, moc_q_pu: float, napiecie_pu: complex) -> complex:
    """Prad WSTRZYKIWANY do wezla przez pobor `S = P + jQ` przy napieciu `V` (generacja).

    Odbior pobiera `S`, wiec do wezla wstrzykuje `-conj(S)/conj(V)`.
    """
    return -complex(moc_p_pu, moc_q_pu).conjugate() / napiecie_pu.conjugate()


def jakobian_pradu_mocy(moc_p_pu: float, moc_q_pu: float, napiecie_pu: complex) -> np.ndarray:
    """∂(Re I, Im I)/∂(Re V, Im V) pradu `-conj(S)/conj(V)` przy STALYM `S` — postac analityczna.

    Z `I = -(P - jQ)(a + jb)/(a^2 + b^2)` dla `V = a + jb` wychodzi wprost
    (rozniczkowanie ilorazu; zadnej roznicy skonczonej w torze gorącym).
    """
    a = napiecie_pu.real
    b = napiecie_pu.imag
    mianownik = a * a + b * b
    licznik_re = moc_p_pu * a + moc_q_pu * b
    licznik_im = moc_p_pu * b - moc_q_pu * a
    return np.array(
        [
            [
                -moc_p_pu / mianownik + 2.0 * a * licznik_re / mianownik**2,
                -moc_q_pu / mianownik + 2.0 * b * licznik_re / mianownik**2,
            ],
            [
                moc_q_pu / mianownik + 2.0 * a * licznik_im / mianownik**2,
                -moc_p_pu / mianownik + 2.0 * b * licznik_im / mianownik**2,
            ],
        ],
        dtype=float,
    )


def czynnik_czestotliwosci(k: float, f0_hz: float | None, f_hz: float | None) -> float:
    """`1 + k (f - f0)/f0`; DOKLADNIE 1,0 dla odbioru bez czulosci (`f0 = None`).

    Odbior czuly czestotliwosciowo MUSI dostac czestotliwosc widziana (estymator,
    `OdbiorCharakterystyczny`); jej brak jest bledem programu, nie danych.
    """
    if f0_hz is None:
        return 1.0
    if f_hz is None:
        raise AssertionError(
            "Czynnik częstotliwościowy odbioru czułego częstotliwościowo wymaga "
            "częstotliwości widzianej przez odbiór — wołający nie podał estymaty."
        )
    return 1.0 + k * (f_hz - f0_hz) / f0_hz


def _wielomian(a: float, b: float, c: float, modul_v: float, v0_pu: float | None) -> float:
    """`a r^2 + b r + c`; DOKLADNIE `c` dla `v0 = None` (brak skladowej Z i I)."""
    if v0_pu is None:
        return c
    r = modul_v / v0_pu
    return a * r * r + b * r + c


def _pochodna_wielomianu(a: float, b: float, modul_v: float, v0_pu: float) -> float:
    """d/d|V| wielomianu: `(2 a r + b)/v0`."""
    return (2.0 * a * (modul_v / v0_pu) + b) / v0_pu


def moc_charakterystyki_pu(odbior: OdbiorDynamiki, modul_v: float, f_hz: float | None) -> complex:
    """Moc pobierana wg GALEZI CHARAKTERYSTYKI (wielomian x czynnik) przy |V| i f."""
    ch = odbior.charakterystyka
    return complex(
        odbior.p_pu
        * czynnik_czestotliwosci(ch.k_pf, ch.f0_hz, f_hz)
        * _wielomian(ch.a_p, ch.b_p, ch.c_p, modul_v, ch.v0_pu),
        odbior.q_pu
        * czynnik_czestotliwosci(ch.k_qf, ch.f0_hz, f_hz)
        * _wielomian(ch.a_q, ch.b_q, ch.c_q, modul_v, ch.v0_pu),
    )


def _pochodna_mocy_charakterystyki(
    odbior: OdbiorDynamiki, modul_v: float, f_hz: float | None
) -> complex:
    ch = odbior.charakterystyka
    assert ch.v0_pu is not None  # wolane wylacznie dla skladowej Z/I (warunek strukturalny)
    return complex(
        odbior.p_pu
        * czynnik_czestotliwosci(ch.k_pf, ch.f0_hz, f_hz)
        * _pochodna_wielomianu(ch.a_p, ch.b_p, modul_v, ch.v0_pu),
        odbior.q_pu
        * czynnik_czestotliwosci(ch.k_qf, ch.f0_hz, f_hz)
        * _pochodna_wielomianu(ch.a_q, ch.b_q, modul_v, ch.v0_pu),
    )


def _pochodna_mocy_po_czestotliwosci(odbior: OdbiorDynamiki, modul_v: float) -> complex:
    """dS/df charakterystyki przy |V| — czynnik liniowy: `dF/df = k/f0` (odbior czuly)."""
    ch = odbior.charakterystyka
    assert ch.f0_hz is not None  # wolane wylacznie dla odbioru czulego (warunek strukturalny)
    return complex(
        odbior.p_pu * (ch.k_pf / ch.f0_hz) * _wielomian(ch.a_p, ch.b_p, ch.c_p, modul_v, ch.v0_pu),
        odbior.q_pu * (ch.k_qf / ch.f0_hz) * _wielomian(ch.a_q, ch.b_q, ch.c_q, modul_v, ch.v0_pu),
    )


def _napiecie_odniesienia_admitancji(charakterystyka: CharakterystykaOdbioru) -> float:
    """`U_min` dla odbioru z przejsciem, `v0` dla odbioru czysto impedancyjnego."""
    if jest_czysta_impedancja(charakterystyka):
        assert charakterystyka.v0_pu is not None  # czysta impedancja ma a = 1, wiec v0
        return charakterystyka.v0_pu
    assert charakterystyka.u_min_pu is not None  # kontrakt: U_min wymagane poza czystym Z
    return charakterystyka.u_min_pu


def admitancja_rownowazna_pu(odbior: OdbiorDynamiki, f_hz: float | None) -> complex:
    """Admitancja galezi impedancyjnej `Y = conj(S(U_ref))/U_ref^2` (pobor, konwencja odbioru).

    `U_ref = U_min` dla odbioru z przejsciem, `U_ref = v0` dla odbioru czysto
    impedancyjnego (charakterystyka jest tam impedancja przy kazdym napieciu).
    """
    odniesienie = _napiecie_odniesienia_admitancji(odbior.charakterystyka)
    moc = moc_charakterystyki_pu(odbior, odniesienie, f_hz)
    return moc.conjugate() / (odniesienie * odniesienie)


def prad_wstrzykiwany_pu(
    odbior: OdbiorDynamiki, napiecie_pu: complex, f_hz: float | None = None
) -> complex:
    """Prad WSTRZYKIWANY do wezla przez odbior (konwencja generacji) przy czestotliwosci
    widzianej `f_hz` (`None` = odbior bez czulosci czestotliwosciowej)."""
    if _moc_zerowa(odbior):
        return 0j
    modul = abs(napiecie_pu)
    if _wzorem_admitancji(odbior.charakterystyka, modul):
        return -admitancja_rownowazna_pu(odbior, f_hz) * napiecie_pu
    moc = moc_charakterystyki_pu(odbior, modul, f_hz)
    return prad_mocy_pu(moc.real, moc.imag, napiecie_pu)


def jakobian_pradu_pu(
    odbior: OdbiorDynamiki, napiecie_pu: complex, f_hz: float | None = None
) -> np.ndarray:
    """∂(Re I, Im I)/∂(Re V, Im V) pradu wstrzykiwanego przez odbior przy STALEJ czestotliwosci
    widzianej — postac analityczna.

    Galaz impedancyjna: `-[[G, -B], [B, G]]` (liniowa). Galaz charakterystyki: jakobian przy
    STALYM `S(|V|)` plus wklad zaleznosci mocy od modulu napiecia
    `-conj(dS/d|V|)/conj(V) * ∂|V|/∂(Re V, Im V)` — dopisywany WYLACZNIE przy skladowej Z/I
    (`v0 is not None`; warunek strukturalny, nie tolerancja). Zaleznosc czestotliwosci
    widzianej od napiecia (estymator) dopisuje `OdbiorCharakterystyczny`.
    """
    if _moc_zerowa(odbior):
        return np.zeros((2, 2), dtype=float)
    ch = odbior.charakterystyka
    modul = abs(napiecie_pu)
    if _wzorem_admitancji(ch, modul):
        admitancja = admitancja_rownowazna_pu(odbior, f_hz)
        g = admitancja.real
        b = admitancja.imag
        return np.array([[-g, b], [-b, -g]], dtype=float)
    moc = moc_charakterystyki_pu(odbior, modul, f_hz)
    jakobian = jakobian_pradu_mocy(moc.real, moc.imag, napiecie_pu)
    if ch.v0_pu is None:
        return jakobian
    pochodna = _pochodna_mocy_charakterystyki(odbior, modul, f_hz)
    wklad = -pochodna.conjugate() / napiecie_pu.conjugate()
    kierunek_re = napiecie_pu.real / modul
    kierunek_im = napiecie_pu.imag / modul
    return jakobian + np.array(
        [
            [wklad.real * kierunek_re, wklad.real * kierunek_im],
            [wklad.imag * kierunek_re, wklad.imag * kierunek_im],
        ],
        dtype=float,
    )


def pochodna_pradu_po_czestotliwosci(odbior: OdbiorDynamiki, napiecie_pu: complex) -> complex:
    """dI/df pradu WSTRZYKIWANEGO przez odbior czuly czestotliwosciowo (ta sama galaz, co prad).

    Czynnik czestotliwosciowy jest liniowy, wiec pochodna nie zalezy od `f`. Galaz
    charakterystyki: `-conj(dS/df)/conj(V)`; galaz impedancyjna: `-conj(dS(U_ref)/df)/U_ref^2 * V`
    (admitancja przeskalowana tym samym czynnikiem — ciaglosc w `U_min` zachowana dla
    kazdej czestotliwosci).
    """
    if _moc_zerowa(odbior):
        return 0j
    modul = abs(napiecie_pu)
    ch = odbior.charakterystyka
    if _wzorem_admitancji(ch, modul):
        odniesienie = _napiecie_odniesienia_admitancji(ch)
        pochodna = _pochodna_mocy_po_czestotliwosci(odbior, odniesienie)
        return -pochodna.conjugate() / (odniesienie * odniesienie) * napiecie_pu
    pochodna = _pochodna_mocy_po_czestotliwosci(odbior, modul)
    return -pochodna.conjugate() / napiecie_pu.conjugate()


def moc_poboru_pu(
    odbior: OdbiorDynamiki, napiecie_pu: complex, f_hz: float | None = None
) -> complex:
    """Moc POBIERANA przez odbior przy napieciu `V` i czestotliwosci widzianej `f_hz`.

    W galezi impedancyjnej `S = conj(Y)|V|^2` (dokladnie `V conj(I_pobierany)`), w galezi
    charakterystyki wielomian. Wezel o napieciu zerowym daje zero dokladnie (galaz
    impedancyjna).
    """
    if _moc_zerowa(odbior):
        return 0j
    modul = abs(napiecie_pu)
    if _wzorem_admitancji(odbior.charakterystyka, modul):
        admitancja = admitancja_rownowazna_pu(odbior, f_hz)
        return admitancja.conjugate() * (modul * modul)
    return moc_charakterystyki_pu(odbior, modul, f_hz)


def tryb_odbioru(odbior: OdbiorDynamiki, napiecie_pu: complex) -> float:
    """Kod `tryb_odbioru@` odbioru ZASILANEGO: 1 w galezi impedancyjnej, inaczej 0.

    Odbior czysto impedancyjny ma kod 0 (jego charakterystyka JEST impedancja) — ten sam
    predykat `w_galezi_impedancyjnej`, co prad i jakobian.
    """
    if w_galezi_impedancyjnej(odbior.charakterystyka, abs(napiecie_pu)):
        return TRYB_IMPEDANCJA
    return TRYB_CHARAKTERYSTYKA


# ---------------------------------------------------------------------------
# Model odbioru w rdzeniu (ModelOdbioru) — charakterystyka + estymator czestotliwosci
# ---------------------------------------------------------------------------

#: Nazwa stanu estymatora czestotliwosci odbioru (sufiks jednostki `_rad` — kontrakt nazw).
STAN_KATA_POMIARU = "kat_pomiaru_rad"


@dataclass(frozen=True)
class OdbiorCharakterystyczny:
    """Odbior rdzenia (`kontrakty.ModelOdbioru`) z DANYCH `OdbiorDynamiki` chwili.

    * `odbior` — dane chwili: moc bazowa po skokach obciazenia i charakterystyka;
    * `f_bazowa_hz` — czestotliwosc znamionowa ukladu (studium), wobec ktorej estymator
      mierzy odchylke;
    * `tryb_poza_obwodem` — `None`, gdy odbior ma obwod; `TRYB_ODLACZONY` (zdarzenie) albo
      `TRYB_ODCIETY` (obszar beznapieciowy) — prad zero, stan estymatora istnieje dalej;
    * `estymator_wyzerowany` — algebra re-inicjalizacji w chwili PONOWNEGO ZASILENIA wezla
      odbioru: czestotliwosc widziana = `f_n` (bez zaleznosci od stanu), bo stan dostaje po
      tej algebrze wartosc `arg V+` (przypisanie zapisane w zdarzeniu wykonanym).
    """

    odbior: OdbiorDynamiki
    f_bazowa_hz: float
    tryb_poza_obwodem: float | None
    estymator_wyzerowany: bool

    # -- tozsamosc i uklad stanow -------------------------------------------------

    @property
    def ident(self) -> str:
        return self.odbior.ident

    @property
    def wezel(self) -> str:
        return self.odbior.wezel

    @property
    def przylaczony(self) -> bool:
        return self.tryb_poza_obwodem is None

    @property
    def moc_bazowa_pu(self) -> complex:
        return complex(self.odbior.p_pu, self.odbior.q_pu)

    @property
    def czuly(self) -> bool:
        return jest_czuly_czestotliwosciowo(self.odbior.charakterystyka)

    @property
    def nazwy_stanow(self) -> tuple[str, ...]:
        return (STAN_KATA_POMIARU,) if self.czuly else ()

    @property
    def granice_stanow(self) -> tuple[tuple[float, float] | None, ...]:
        return (None,) * len(self.nazwy_stanow)

    @property
    def zakresy_waznosci(self) -> tuple[tuple[float, float] | None, ...]:
        # Zakres waznosci odbioru nie jest przedzialem STANU (kat estymatora jest wolny):
        # warunki `F > 0` i brak poslizgu sprawdza `sprawdz_zakres_waznosci`.
        return (None,) * len(self.nazwy_stanow)

    @property
    def stany_bez_rownowagi(self) -> tuple[str, ...]:
        return ()

    def parametry_tozsamosci(self) -> dict[str, object]:
        return {
            "p_pu": self.odbior.p_pu,
            "q_pu": self.odbior.q_pu,
            "charakterystyka": self.odbior.charakterystyka,
            "f_bazowa_hz": self.f_bazowa_hz,
        }

    # -- estymator ------------------------------------------------------------------

    def _t_f(self) -> float:
        t_f = self.odbior.charakterystyka.t_pomiaru_czestotliwosci_s
        assert t_f is not None  # kontrakt: T_f <=> czulosc czestotliwosciowa
        return t_f

    def blad_fazy_rad(self, stan: np.ndarray, napiecie_pu: complex) -> float:
        """`e = arg(V e^{-jx})` w (-pi, pi]; `e := 0` przy `V = 0` (fazor bez kata)."""
        if napiecie_pu == 0:
            return 0.0
        return cmath.phase(napiecie_pu * cmath.exp(-1j * float(stan[0])))

    def _gradient_bledu_fazy(self, napiecie_pu: complex) -> tuple[float, float, float]:
        """(∂e/∂Re V, ∂e/∂Im V, ∂e/∂x): `e = theta - x` lokalnie, `theta = atan2(Im, Re)`."""
        if napiecie_pu == 0:
            return 0.0, 0.0, 0.0
        modul_kwadrat = napiecie_pu.real**2 + napiecie_pu.imag**2
        return -napiecie_pu.imag / modul_kwadrat, napiecie_pu.real / modul_kwadrat, -1.0

    def czestotliwosc_widziana_hz(self, stan: np.ndarray, napiecie_pu: complex) -> float | None:
        """`f_hat = f_n (1 + e/(w_n T_f))`; `None` bez czulosci albo bez obwodu."""
        if not self.czuly or not self.przylaczony:
            return None
        return self._f_hat(stan, napiecie_pu)

    def _f_hat(self, stan: np.ndarray, napiecie_pu: complex) -> float | None:
        if not self.czuly:
            return None
        if self.estymator_wyzerowany:
            return self.f_bazowa_hz
        odchylka = self.blad_fazy_rad(stan, napiecie_pu) / (
            2.0 * math.pi * self.f_bazowa_hz * self._t_f()
        )
        return self.f_bazowa_hz * (1.0 + odchylka)

    def odchylka_czestotliwosci_pu(self, stan: np.ndarray, napiecie_pu: complex) -> float:
        """`dw_hat = e/(w_n T_f)` (stan estymatora w jednostkach wzglednych)."""
        return self.blad_fazy_rad(stan, napiecie_pu) / (
            2.0 * math.pi * self.f_bazowa_hz * self._t_f()
        )

    def _pochodne_f_hat(self, napiecie_pu: complex) -> tuple[float, float, float]:
        """(∂f_hat/∂Re V, ∂f_hat/∂Im V, ∂f_hat/∂x) = (1/(2 pi T_f)) grad e."""
        if self.estymator_wyzerowany:
            return 0.0, 0.0, 0.0
        skala = 1.0 / (2.0 * math.pi * self._t_f())
        d_re, d_im, d_x = self._gradient_bledu_fazy(napiecie_pu)
        return skala * d_re, skala * d_im, skala * d_x

    # -- rownania stanu (ElementStanowy) ----------------------------------------------

    def stan_poczatkowy_odbioru(self, napiecie_pu: complex) -> np.ndarray:
        """`x(0) = arg V_pf` => `e(0) = 0`, `f_hat(0) = f_n`. Odbior odciety w t = 0 (`V = 0`)
        ma kat nieokreslony: `x = 0` jest trzymany (`e := 0`) i nadpisany `arg V+` przy
        ponownym zasileniu — przed nim zadne rownanie go nie czyta."""
        if not self.czuly:
            return np.zeros(0, dtype=float)
        return np.array([cmath.phase(napiecie_pu) if napiecie_pu != 0 else 0.0], dtype=float)

    def pochodne(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        if not self.czuly:
            return np.zeros(0, dtype=float)
        return np.array([self.blad_fazy_rad(stan, napiecie_pu) / self._t_f()], dtype=float)

    def jakobian_stan_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        if not self.czuly:
            return np.zeros((0, 0), dtype=float)
        _, _, d_x = self._gradient_bledu_fazy(napiecie_pu)
        return np.array([[d_x / self._t_f()]], dtype=float)

    def jakobian_stan_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        if not self.czuly:
            return np.zeros((0, 2), dtype=float)
        d_re, d_im, _ = self._gradient_bledu_fazy(napiecie_pu)
        return np.array([[d_re / self._t_f(), d_im / self._t_f()]], dtype=float)

    # -- prad i jego jakobiany --------------------------------------------------------

    def prad_pu(self, stan: np.ndarray, napiecie_pu: complex) -> complex:
        if not self.przylaczony:
            return 0j
        return prad_wstrzykiwany_pu(self.odbior, napiecie_pu, self._f_hat(stan, napiecie_pu))

    def jakobian_prad_napiecie(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        if not self.przylaczony:
            return np.zeros((2, 2), dtype=float)
        jakobian = jakobian_pradu_pu(self.odbior, napiecie_pu, self._f_hat(stan, napiecie_pu))
        if not self.czuly:
            return jakobian
        d_re, d_im, _ = self._pochodne_f_hat(napiecie_pu)
        wrazliwosc = pochodna_pradu_po_czestotliwosci(self.odbior, napiecie_pu)
        return jakobian + np.array(
            [
                [wrazliwosc.real * d_re, wrazliwosc.real * d_im],
                [wrazliwosc.imag * d_re, wrazliwosc.imag * d_im],
            ],
            dtype=float,
        )

    def jakobian_prad_stan(self, stan: np.ndarray, napiecie_pu: complex) -> np.ndarray:
        if not self.czuly:
            return np.zeros((2, 0), dtype=float)
        if not self.przylaczony:
            return np.zeros((2, 1), dtype=float)
        _, _, d_x = self._pochodne_f_hat(napiecie_pu)
        wrazliwosc = pochodna_pradu_po_czestotliwosci(self.odbior, napiecie_pu)
        return np.array([[wrazliwosc.real * d_x], [wrazliwosc.imag * d_x]], dtype=float)

    # -- wielkosci odbioru ------------------------------------------------------------

    def moc_poboru_pu(self, stan: np.ndarray, napiecie_pu: complex) -> complex:
        if not self.przylaczony:
            return 0j
        return moc_poboru_pu(self.odbior, napiecie_pu, self._f_hat(stan, napiecie_pu))

    def tryb(self, napiecie_pu: complex) -> float:
        if self.tryb_poza_obwodem is not None:
            return self.tryb_poza_obwodem
        return tryb_odbioru(self.odbior, napiecie_pu)

    def czynniki_czestotliwosci(
        self, stan: np.ndarray, napiecie_pu: complex
    ) -> tuple[float, float]:
        """(F_P, F_Q) przy czestotliwosci widzianej — do kontroli zakresu waznosci `F > 0`."""
        ch = self.odbior.charakterystyka
        f_hat = self._f_hat(stan, napiecie_pu)
        return (
            czynnik_czestotliwosci(ch.k_pf, ch.f0_hz, f_hat),
            czynnik_czestotliwosci(ch.k_qf, ch.f0_hz, f_hat),
        )


def model_odbioru(
    odbior: OdbiorDynamiki,
    f_bazowa_hz: float,
    *,
    tryb_poza_obwodem: float | None,
    estymator_wyzerowany: bool,
) -> OdbiorCharakterystyczny:
    """Model odbioru z danych chwili — jedyny konstruktor uzywany przez silnik."""
    if tryb_poza_obwodem not in (None, TRYB_ODLACZONY, TRYB_ODCIETY):
        raise AssertionError(f"Nieznany tryb odbioru poza obwodem: {tryb_poza_obwodem!r}")
    return OdbiorCharakterystyczny(
        odbior=odbior,
        f_bazowa_hz=f_bazowa_hz,
        tryb_poza_obwodem=tryb_poza_obwodem,
        estymator_wyzerowany=estymator_wyzerowany,
    )


def sprawdz_zakres_waznosci(
    modele: tuple[OdbiorCharakterystyczny, ...],
    stany: tuple[np.ndarray, ...],
    napiecia_odbiorow: tuple[complex, ...],
    t_s: float,
    *,
    bledy_fazy_przed: tuple[float | None, ...] | None,
) -> None:
    """Zakres waznosci modeli odbiorow po przyjetym kroku i po re-inicjalizacji.

    * `F_P > 0`, `F_Q > 0` (odbior przylaczony, czuly czestotliwosciowo): liniowy czynnik
      nie moze zmienic znaku mocy bazowej — ujemny pobor przy odchylce czestotliwosci jest
      ekstrapolacja modelu, nie fizyka. Adres `<odbior>.czynnik_czestotliwosci_P|Q`.
    * Brak poslizgu estymatora (`bledy_fazy_przed` = `e` z poczatku kroku): miedzy krokami
      `e` zmienia sie w sposob ciagly, wiec zmiana o wiecej niz `pi` jest przejsciem przez
      +-pi (skokiem 2 pi zawiniecia), czyli `|theta - x|` osiagnelo `pi` — tozsamosc
      inercji pierwszego rzedu przestaje obowiazywac. Adres `<odbior>.kat_pomiaru_rad`.
      Chwila zdarzenia (skok fazy szyny) nie jest tu oceniana (`bledy_fazy_przed = None`).
    Odmowa `dynamika.zakres_waznosci_przekroczony` z adresem, chwila i wartoscia.
    """
    for indeks, (model, stan, napiecie) in enumerate(
        zip(modele, stany, napiecia_odbiorow, strict=True)
    ):
        if not model.czuly:
            continue
        if bledy_fazy_przed is not None and bledy_fazy_przed[indeks] is not None:
            przed = bledy_fazy_przed[indeks]
            assert przed is not None
            po = model.blad_fazy_rad(stan, napiecie)
            if abs(po - przed) > math.pi:
                raise OdmowaDynamiki(
                    KOD_ZAKRES_WAZNOSCI_PRZEKROCZONY,
                    f"Poślizg estymatora częstotliwości odbioru {model.ident} przy t={t_s} s: różnica fazy "
                    f"napięcia szyny i stanu estymatora przeszła przez ±π ({przed} -> {po} rad) "
                    "— częstotliwość widziana przez odbiór przestaje być inercją częstotliwości "
                    "szyny; model odbioru leży poza zakresem ważności.",
                    t_s=t_s,
                    adresy=(f"{model.ident}.{STAN_KATA_POMIARU}",),
                    odbior=model.ident,
                    wartosci=(po,),
                    granice=(math.pi,),
                )
        if not model.przylaczony:
            continue
        czynnik_p, czynnik_q = model.czynniki_czestotliwosci(stan, napiecie)
        for os, czynnik, k in (
            ("P", czynnik_p, model.odbior.charakterystyka.k_pf),
            ("Q", czynnik_q, model.odbior.charakterystyka.k_qf),
        ):
            if k != 0.0 and czynnik <= 0.0:
                raise OdmowaDynamiki(
                    KOD_ZAKRES_WAZNOSCI_PRZEKROCZONY,
                    f"Czynnik częstotliwościowy mocy {os} odbioru {model.ident} przy t={t_s} s wynosi "
                    f"{czynnik} ≤ 0 — liniowa zależność mocy od częstotliwości zmieniłaby znak "
                    "mocy bazowej odbioru; model leży poza zakresem ważności.",
                    t_s=t_s,
                    adresy=(f"{model.ident}.czynnik_czestotliwosci_{os}",),
                    odbior=model.ident,
                    wartosci=(czynnik,),
                    granice=(0.0,),
                )


def moc_poboru_w_punkcie_pracy(
    odbior: OdbiorDynamiki, napiecie_pf_pu: complex, f_studium_hz: float
) -> complex:
    """Moc pobierana przez odbior w punkcie pracy rozpływu — przy CZESTOTLIWOSCI STUDIUM.

    W t = 0 estymator stoi na `f_hat = f_n` (stan `x(0) = arg V_pf`), a rozplyw liczyl
    czynnik czestotliwosciowy przy czestotliwosci studium — te dwie liczby sa jedna
    (parytet t = 0, twierdzenie D-22). Adapter sklada z tej mocy podzial mocy wezla
    (`S_urz = S_net + sum S_odb(V_pf)`) — fizyka w rdzeniu, adapter tylko sklada. Dla stalej
    mocy wynik jest bitowo `P0 + jQ0`.
    """
    f_hz = f_studium_hz if jest_czuly_czestotliwosciowo(odbior.charakterystyka) else None
    return moc_poboru_pu(odbior, napiecie_pf_pu, f_hz)


def sprawdz_punkt_pracy_odbioru(odbior: OdbiorDynamiki, napiecie_pf_pu: complex) -> None:
    """`|V_pf| >= U_min` — punkt pracy ponizej przejscia nie jest rownowaga modelu (odmowa)."""
    ch = odbior.charakterystyka
    modul = abs(napiecie_pf_pu)
    if w_galezi_impedancyjnej(ch, modul):
        raise OdmowaDynamiki(
            KOD_ODBIOR_PONIZEJ_NAPIECIA_PRZEJSCIA,
            f"Napięcie punktu pracy odbioru {odbior.ident} w węźle {odbior.wezel} wynosi "
            f"{modul:.6f} pu i jest niższe od "
            f"napięcia przejścia U_min = {ch.u_min_pu} pu — rozpływ liczył charakterystykę bez "
            "przejścia do stałej impedancji, więc punkt pracy nie jest stanem równowagi modelu "
            "dynamicznego odbioru.",
            odbior=odbior.ident,
            wezel=odbior.wezel,
            modul_v_pu=modul,
            u_min_pu=ch.u_min_pu,
        )


def _liczba_sladu(wartosc: float | None) -> float | None:
    return None if wartosc is None else kwantyzuj(wartosc)


def opis_odbioru_sladu(
    odbior: OdbiorDynamiki, napiecie_pf_pu: complex | None, f_studium_hz: float
) -> dict[str, object]:
    """Wpis sekcji `odbiory` sladu White Box: charakterystyka, moc w punkcie pracy, tryb t = 0.

    `napiecie_pf_pu = None` = odbior odciety w t = 0 (obszar beznapieciowy). Liczby
    skwantyzowane jak cala granica kontraktu wyniku (`tozsamosc.kwantyzuj`).
    """
    ch = odbior.charakterystyka
    wpis: dict[str, object] = {
        "ident": odbior.ident,
        "wezel": odbior.wezel,
        "p0_pu": kwantyzuj(odbior.p_pu),
        "q0_pu": kwantyzuj(odbior.q_pu),
        "wielomian_p": [kwantyzuj(ch.a_p), kwantyzuj(ch.b_p), kwantyzuj(ch.c_p)],
        "wielomian_q": [kwantyzuj(ch.a_q), kwantyzuj(ch.b_q), kwantyzuj(ch.c_q)],
        "v0_pu": _liczba_sladu(ch.v0_pu),
        "k_pf": kwantyzuj(ch.k_pf),
        "k_qf": kwantyzuj(ch.k_qf),
        "f0_hz": _liczba_sladu(ch.f0_hz),
        "u_min_pu": _liczba_sladu(ch.u_min_pu),
        "czysta_impedancja": jest_czysta_impedancja(ch),
    }
    if napiecie_pf_pu is None:
        wpis["moc_w_punkcie_pracy_pu"] = None
        wpis["tryb_t0"] = TRYB_ODCIETY
    else:
        moc = moc_poboru_w_punkcie_pracy(odbior, napiecie_pf_pu, f_studium_hz)
        wpis["moc_w_punkcie_pracy_pu"] = [kwantyzuj(moc.real), kwantyzuj(moc.imag)]
        wpis["tryb_t0"] = tryb_odbioru(odbior, napiecie_pf_pu)
    if jest_czuly_czestotliwosciowo(ch):
        # Estymator czestotliwosci widzianej (klucz tylko dla odbioru ze stanem — slad odbioru
        # bez czulosci jest bitowo taki jak przed wprowadzeniem estymatora).
        wpis["t_pomiaru_czestotliwosci_s"] = _liczba_sladu(ch.t_pomiaru_czestotliwosci_s)
    return wpis


__all__ = [
    "OPIS_TRYBU_ODBIORU_PL",
    "STAN_KATA_POMIARU",
    "TRYB_CHARAKTERYSTYKA",
    "TRYB_IMPEDANCJA",
    "TRYB_ODCIETY",
    "TRYB_ODLACZONY",
    "OdbiorCharakterystyczny",
    "admitancja_rownowazna_pu",
    "charakterystyka_stalej_mocy",
    "charakterystyka_z_wielomianu",
    "czynnik_czestotliwosci",
    "jakobian_pradu_mocy",
    "jakobian_pradu_pu",
    "jest_czuly_czestotliwosciowo",
    "jest_czysta_impedancja",
    "moc_charakterystyki_pu",
    "moc_poboru_pu",
    "moc_poboru_w_punkcie_pracy",
    "model_odbioru",
    "opis_odbioru_sladu",
    "pochodna_pradu_po_czestotliwosci",
    "prad_mocy_pu",
    "prad_wstrzykiwany_pu",
    "sprawdz_punkt_pracy_odbioru",
    "sprawdz_zakres_waznosci",
    "tryb_odbioru",
    "w_galezi_impedancyjnej",
    "wymagane_parametry_odbioru",
    "wymagania_charakterystyki",
]
