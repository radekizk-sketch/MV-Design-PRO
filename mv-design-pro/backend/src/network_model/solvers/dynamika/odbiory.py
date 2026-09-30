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

CZESTOTLIWOSC WIDZIANA PRZEZ ODBIOR. Czynnik `F(f)` jest zaimplementowany i sprawdzany
testami, ale bieg nie ma jeszcze modelu czestotliwosci widzianej przez odbior
(estymatora): odbior czuly czestotliwosciowo jest odmowa nazwana przed biegiem
(`sprawdz_odbior_biegu`), a funkcje biegu dostaja `f_hz = None` — co przy `k = 0`
daje czynnik dokladnie `1,0`.
"""

from __future__ import annotations

import numpy as np

from .kontrakty import (
    KOD_ODBIOR_CZULY_CZESTOTLIWOSCIOWO,
    KOD_ODBIOR_PONIZEJ_NAPIECIA_PRZEJSCIA,
    CharakterystykaOdbioru,
    OdbiorDynamiki,
    OdmowaDynamiki,
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


def charakterystyka_stalej_mocy(*, u_min_pu: float | None) -> CharakterystykaOdbioru:
    """Charakterystyka odbioru stalej mocy (`c = 1`, bez czulosci czestotliwosciowej)."""
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
) -> CharakterystykaOdbioru:
    """Charakterystyka z KOMPLETU wspolczynnikow rozpływu (`ZipCoeffs` po stronie ENM).

    Rozplyw niesie zawsze `v0` i `f0`; tutaj staja sie `None`, gdy ksztalt wielomianu ich
    nie uzywa (brak skladowej Z i I, brak czulosci czestotliwosciowej) — wolajacy (adapter)
    nie ma wlasnego predykatu „kiedy pole ma znaczenie".
    """
    zalezny_od_napiecia = any(udzial != 0.0 for udzial in (a_p, b_p, a_q, b_q))
    zalezny_od_czestotliwosci = k_pf != 0.0 or k_qf != 0.0
    return CharakterystykaOdbioru(
        a_p=a_p,
        b_p=b_p,
        c_p=c_p,
        a_q=a_q,
        b_q=b_q,
        c_q=c_q,
        v0_pu=v0_pu if zalezny_od_napiecia else None,
        k_pf=k_pf,
        k_qf=k_qf,
        f0_hz=f0_hz if zalezny_od_czestotliwosci else None,
        u_min_pu=u_min_pu,
    )


# ---------------------------------------------------------------------------
# Predykaty
# ---------------------------------------------------------------------------


def jest_czysta_impedancja(charakterystyka: CharakterystykaOdbioru) -> bool:
    """Odbior czysto impedancyjny: brak skladowej stalopradowej i stalomocowej (P i Q)."""
    return (
        charakterystyka.b_p == 0.0
        and charakterystyka.c_p == 0.0
        and charakterystyka.b_q == 0.0
        and charakterystyka.c_q == 0.0
    )


def w_galezi_impedancyjnej(charakterystyka: CharakterystykaOdbioru, modul_v: float) -> bool:
    """JEDEN predykat galezi: `|V| < U_min` (przejscie niezadeklarowane = nigdy)."""
    return charakterystyka.u_min_pu is not None and modul_v < charakterystyka.u_min_pu


def _wzorem_admitancji(charakterystyka: CharakterystykaOdbioru, modul_v: float) -> bool:
    return jest_czysta_impedancja(charakterystyka) or w_galezi_impedancyjnej(
        charakterystyka, modul_v
    )


def _moc_zerowa(odbior: OdbiorDynamiki) -> bool:
    return odbior.p_pu == 0.0 and odbior.q_pu == 0.0


def wymaga_napiecia_niezerowego(odbior: OdbiorDynamiki) -> bool:
    """Czy prad odbioru NIE ISTNIEJE przy `V = 0`.

    Tak jest wylacznie dla odbioru z mocą bazowa niezerowa, ze skladowa stalopradowa albo
    stalomocowa i BEZ zadeklarowanego `U_min` (charakterystyka `-conj(S)/conj(V)` przy
    kazdym |V| > 0). JEDEN predykat dla odmowy w wezle zwartym metalicznie i dla odmowy
    punktu startowego Newtona z napieciem zerowym (`siec._sprawdz_start_odbiorow`).
    """
    charakterystyka = odbior.charakterystyka
    return (
        charakterystyka.u_min_pu is None
        and not jest_czysta_impedancja(charakterystyka)
        and not _moc_zerowa(odbior)
    )


def jest_czuly_czestotliwosciowo(charakterystyka: CharakterystykaOdbioru) -> bool:
    return charakterystyka.k_pf != 0.0 or charakterystyka.k_qf != 0.0


def sprawdz_odbior_biegu(odbior: OdbiorDynamiki) -> None:
    """Warunek BIEGU (nie kontraktu danych): odbior czuly czestotliwosciowo — odmowa nazwana.

    JEDEN predykat dla biegu (`silnik`) i dla bramki gotowosci adaptera
    (`enm/adapter_dynamiki.py::braki_modelu_dynamiki`).
    """
    charakterystyka = odbior.charakterystyka
    if jest_czuly_czestotliwosciowo(charakterystyka):
        raise OdmowaDynamiki(
            KOD_ODBIOR_CZULY_CZESTOTLIWOSCIOWO,
            f"Odbiór {odbior.ident!r} ma czułość częstotliwościową (k_pf = "
            f"{charakterystyka.k_pf}, k_qf = {charakterystyka.k_qf}), a rdzeń dynamiki nie ma "
            "jeszcze modelu częstotliwości widzianej przez odbiór — bieg z częstotliwością "
            "zamrożoną na znamionowej dałby zły pobór mocy przy każdej odchyłce "
            "częstotliwości.",
            odbior=odbior.ident,
            k_pf=charakterystyka.k_pf,
            k_qf=charakterystyka.k_qf,
        )


# ---------------------------------------------------------------------------
# Wzory
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
    """`1 + k (f - f0)/f0`; DOKLADNIE 1,0 dla odbioru bez czulosci (`f0 = None`)."""
    if f0_hz is None:
        return 1.0
    if f_hz is None:
        raise OdmowaDynamiki(
            KOD_ODBIOR_CZULY_CZESTOTLIWOSCIOWO,
            "Czynnik częstotliwościowy odbioru czułego częstotliwościowo wymaga "
            "częstotliwości widzianej przez odbiór, której bieg nie wyznacza.",
            k=k,
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


def admitancja_rownowazna_pu(odbior: OdbiorDynamiki, f_hz: float | None) -> complex | None:
    """Admitancja galezi impedancyjnej `Y = conj(S(U_ref))/U_ref^2` (pobor, konwencja odbioru).

    `U_ref = U_min` dla odbioru z zadeklarowanym przejsciem, `U_ref = v0` dla odbioru
    czysto impedancyjnego (charakterystyka jest tam impedancja przy kazdym napieciu);
    `None`, gdy odbior nie ma galezi impedancyjnej (przejscie niezadeklarowane).
    """
    ch = odbior.charakterystyka
    if jest_czysta_impedancja(ch):
        assert ch.v0_pu is not None  # czysta impedancja ma a = 1, wiec v0 jest wymagane
        odniesienie = ch.v0_pu
    elif ch.u_min_pu is not None:
        odniesienie = ch.u_min_pu
    else:
        return None
    moc = moc_charakterystyki_pu(odbior, odniesienie, f_hz)
    return moc.conjugate() / (odniesienie * odniesienie)


def prad_wstrzykiwany_pu(
    odbior: OdbiorDynamiki, napiecie_pu: complex, f_hz: float | None = None
) -> complex:
    """Prad WSTRZYKIWANY do wezla przez odbior (konwencja generacji)."""
    if _moc_zerowa(odbior):
        return 0j
    modul = abs(napiecie_pu)
    if _wzorem_admitancji(odbior.charakterystyka, modul):
        admitancja = admitancja_rownowazna_pu(odbior, f_hz)
        assert admitancja is not None
        return -admitancja * napiecie_pu
    moc = moc_charakterystyki_pu(odbior, modul, f_hz)
    return prad_mocy_pu(moc.real, moc.imag, napiecie_pu)


def jakobian_pradu_pu(
    odbior: OdbiorDynamiki, napiecie_pu: complex, f_hz: float | None = None
) -> np.ndarray:
    """∂(Re I, Im I)/∂(Re V, Im V) pradu wstrzykiwanego przez odbior — postac analityczna.

    Galaz impedancyjna: `-[[G, -B], [B, G]]` (liniowa). Galaz charakterystyki: jakobian przy
    STALYM `S(|V|)` plus wklad zaleznosci mocy od modulu napiecia
    `-conj(dS/d|V|)/conj(V) * ∂|V|/∂(Re V, Im V)` — dopisywany WYLACZNIE przy skladowej Z/I
    (`v0 is not None`; warunek strukturalny, nie tolerancja).
    """
    if _moc_zerowa(odbior):
        return np.zeros((2, 2), dtype=float)
    ch = odbior.charakterystyka
    modul = abs(napiecie_pu)
    if _wzorem_admitancji(ch, modul):
        admitancja = admitancja_rownowazna_pu(odbior, f_hz)
        assert admitancja is not None
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


def moc_poboru_pu(
    odbior: OdbiorDynamiki, napiecie_pu: complex, f_hz: float | None = None
) -> complex:
    """Moc POBIERANA przez odbior przy napieciu `V` — ta sama galaz, co prad.

    W galezi impedancyjnej `S = conj(Y)|V|^2` (dokladnie `V conj(I_pobierany)`), w galezi
    charakterystyki wielomian. Wezel o napieciu zerowym daje zero dokladnie (galaz
    impedancyjna); odbior bez `U_min` w takim wezle jest odmowa wczesniej.
    """
    if _moc_zerowa(odbior):
        return 0j
    modul = abs(napiecie_pu)
    if _wzorem_admitancji(odbior.charakterystyka, modul):
        admitancja = admitancja_rownowazna_pu(odbior, f_hz)
        assert admitancja is not None
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


def moc_poboru_w_punkcie_pracy(odbior: OdbiorDynamiki, napiecie_pf_pu: complex) -> complex:
    """Moc pobierana przez odbior w punkcie pracy rozpływu (czestotliwosc znamionowa).

    Adapter sklada z niej podzial mocy wezla (`S_urz = S_net + sum S_odb(V_pf)`), zeby moc
    urzadzen i pobor odbiorow sumowaly sie do wstrzyku wezlowego rozpływu — fizyka w
    rdzeniu, adapter tylko sklada. Dla stalej mocy wynik jest bitowo `P0 + jQ0`.
    """
    return moc_poboru_pu(odbior, napiecie_pf_pu)


def sprawdz_punkt_pracy_odbioru(odbior: OdbiorDynamiki, napiecie_pf_pu: complex) -> None:
    """`|V_pf| >= U_min` — punkt pracy ponizej przejscia nie jest rownowaga modelu (odmowa)."""
    ch = odbior.charakterystyka
    modul = abs(napiecie_pf_pu)
    if w_galezi_impedancyjnej(ch, modul):
        raise OdmowaDynamiki(
            KOD_ODBIOR_PONIZEJ_NAPIECIA_PRZEJSCIA,
            f"Napięcie punktu pracy w węźle {odbior.wezel!r} odbioru {odbior.ident!r} wynosi "
            f"{modul:.6f} pu i jest niższe od napięcia przejścia U_min = {ch.u_min_pu} pu — "
            "rozpływ liczył charakterystykę bez przejścia do stałej impedancji, więc punkt "
            "pracy nie jest stanem równowagi modelu dynamicznego odbioru.",
            odbior=odbior.ident,
            wezel=odbior.wezel,
            modul_v_pu=modul,
            u_min_pu=ch.u_min_pu,
        )


def _liczba_sladu(wartosc: float | None) -> float | None:
    return None if wartosc is None else kwantyzuj(wartosc)


def opis_odbioru_sladu(odbior: OdbiorDynamiki, napiecie_pf_pu: complex | None) -> dict[str, object]:
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
        moc = moc_poboru_w_punkcie_pracy(odbior, napiecie_pf_pu)
        wpis["moc_w_punkcie_pracy_pu"] = [kwantyzuj(moc.real), kwantyzuj(moc.imag)]
        wpis["tryb_t0"] = tryb_odbioru(odbior, napiecie_pf_pu)
    return wpis


__all__ = [
    "OPIS_TRYBU_ODBIORU_PL",
    "TRYB_CHARAKTERYSTYKA",
    "TRYB_IMPEDANCJA",
    "TRYB_ODCIETY",
    "TRYB_ODLACZONY",
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
    "opis_odbioru_sladu",
    "prad_mocy_pu",
    "prad_wstrzykiwany_pu",
    "sprawdz_odbior_biegu",
    "sprawdz_punkt_pracy_odbioru",
    "tryb_odbioru",
    "w_galezi_impedancyjnej",
    "wymaga_napiecia_niezerowego",
]
