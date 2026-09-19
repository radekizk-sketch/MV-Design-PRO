"""Sprzezenie sieciowe: Ybus skladowej zgodnej i rozwiazanie `g(x, y) = 0` (SS0 p.1).

CO TU JEST. Macierz admitancyjna skladowej zgodnej zlozona z tego samego opisu
galezi, ktorym liczy rozplyw (model pi z przekladnia zespolona), rownanie
algebraiczne `g(x, y) = Y*V - I(x, V) = 0` i jego rozwiazanie Newtonem z
globalizacja Armijo. Algebra jest RZADKA od poczatku (`scipy.sparse`) — lekcja
wydajnosciowa z wczesniejszej fali (gesty jakobian rosnie kwadratem liczby szyn,
a budzet biegu jest sekundowy, nie minutowy).

NIEZMIENNIK ZLOZENIA. Kazdy stan topologii (zdrowa siec, siec ze zwarciem, siec
z otwarta galezia) powstaje przez ZLOZENIE OD NOWA z listy elementow, nigdy przez
dodawanie i odejmowanie wkladow do istniejacej macierzy. Powod jest pomiarowy, nie
estetyczny: dodanie i pozniejsze odjecie tej samej admitancji NIE wraca bitowo do
punktu wyjscia, wiec „zwarcie zalozone i zdjete" zostawialoby siec inna niz
wyjsciowa, a odcisk topologii przestalby odpowiadac topologii. Skladanie od nowa
czyni te dwie rzeczy tozsamymi Z KONSTRUKCJI.

POSTAC RZECZYWISTA. Niewiadoma jest wektor `[Re V; Im V]` (2n), a nie fazor
zespolony, bo residuum odbioru o stalej mocy zalezy od `conj(V)` i NIE jest
funkcja holomorficzna — jakobian zespolony dla niej nie istnieje. Wklad `Y*V`
w postaci rzeczywistej to blok `[[G, -B], [B, G]]`, wklad kazdego urzadzenia i
odbioru to blok 2x2 w wierszu/kolumnie jego wezla.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import sparse
from scipy.sparse import linalg as sparse_linalg

from .kontrakty import (
    KOD_ALGEBRA_NIEZBIEZNA,
    KOD_SIEC_NIESPOJNA,
    GalazDynamiki,
    OdbiorDynamiki,
    OdmowaDynamiki,
    OdsprzegDynamiki,
    Urzadzenie,
    WezelDynamiki,
)
from .skonczonosc import sprawdz_napiecia

#: Wspolczynnik warunku Armijo — wymagany spadek normy residuum na krok o dlugosci
#: `alfa`. Wartosc klasyczna dla nawrotu z poloweniem kroku; nie jest strojona per
#: siec (strojenie progu globalizacji pod konkretny przypadek byloby heurystyka).
WSPOLCZYNNIK_ARMIJO = 1.0e-4


@dataclass(frozen=True)
class ModelSieci:
    """Zlozony stan sieci: indeksacja wezlow + Ybus skladowej zgodnej.

    Obiekt jest NIEMUTOWALNY. Zmiana topologii (zwarcie, otwarcie galezi) zwraca
    NOWY `ModelSieci` zlozony od nowa z tej samej listy elementow o zmienionym
    zbiorze aktywnych galezi / admitancji zwarc.
    """

    identy_wezlow: tuple[str, ...]
    indeks_wezla: dict[str, int]
    ybus: sparse.csc_matrix
    wezly: tuple[WezelDynamiki, ...]
    galezie: tuple[GalazDynamiki, ...]
    odsprzegi: tuple[OdsprzegDynamiki, ...]
    galezie_aktywne: frozenset[str]
    admitancje_zwarc: tuple[tuple[str, complex], ...]

    @property
    def liczba_wezlow(self) -> int:
        return len(self.identy_wezlow)


def _indeksacja(wezly: tuple[WezelDynamiki, ...]) -> tuple[tuple[str, ...], dict[str, int]]:
    """Kolejnosc wezlow = KOLEJNOSC ZAPISU wejscia (nie sortowanie alfabetyczne).

    Kolejnosc zapisu pochodzi z IR assemblera, ktory jest juz deterministyczny;
    przesortowanie jej tutaj zrobiloby DRUGI porzadek kanoniczny dla tej samej
    sieci i rozjechaloby indeksy wyniku dynamiki z indeksami rozpływu.
    """
    identy = tuple(wezel.ident for wezel in wezly)
    if len(set(identy)) != len(identy):
        powtorzone = sorted({ident for ident in identy if identy.count(ident) > 1})
        raise OdmowaDynamiki(
            KOD_SIEC_NIESPOJNA,
            f"Powtorzone identyfikatory wezlow: {powtorzone}",
            wezly=tuple(powtorzone),
        )
    return identy, {ident: pozycja for pozycja, ident in enumerate(identy)}


def zloz_model_sieci(
    wezly: tuple[WezelDynamiki, ...],
    galezie: tuple[GalazDynamiki, ...],
    odsprzegi: tuple[OdsprzegDynamiki, ...],
    *,
    galezie_aktywne: frozenset[str] | None = None,
    admitancje_zwarc: tuple[tuple[str, complex], ...] = (),
) -> ModelSieci:
    """Zloz Ybus skladowej zgodnej dla zadanego stanu topologii.

    Model galezi (ten sam, ktorym liczy rozplyw): galaz o admitancji szeregowej
    `y`, calkowitej susceptancji poprzecznej `b` i przekladni zespolonej `a` po
    stronie `od` wnosi

        Y_ff = (y + j b/2) / |a|^2 ,  Y_ft = -y / conj(a)
        Y_tf = -y / a             ,  Y_tt =  y + j b/2

    Dla `a = 1` (linia, kabel, transformator na zaczepie znamionowym bez
    przesuniecia grupy) sprowadza sie to do klasycznego modelu pi.
    """
    identy, indeks = _indeksacja(wezly)
    liczba = len(identy)
    aktywne = (
        frozenset(galaz.ident for galaz in galezie)
        if galezie_aktywne is None
        else (galezie_aktywne)
    )

    wiersze: list[int] = []
    kolumny: list[int] = []
    wartosci: list[complex] = []

    for galaz in galezie:
        if galaz.ident not in aktywne:
            continue
        if galaz.wezel_od not in indeks or galaz.wezel_do not in indeks:
            raise OdmowaDynamiki(
                KOD_SIEC_NIESPOJNA,
                f"Galaz {galaz.ident!r} laczy wezel spoza modelu "
                f"({galaz.wezel_od!r} -> {galaz.wezel_do!r})",
                galaz=galaz.ident,
            )
        if galaz.przekladnia == 0:
            raise OdmowaDynamiki(
                KOD_SIEC_NIESPOJNA,
                f"Galaz {galaz.ident!r} ma zerowa przekladnie",
                galaz=galaz.ident,
            )
        od = indeks[galaz.wezel_od]
        do = indeks[galaz.wezel_do]
        y_szeregowa = galaz.y_szeregowa_pu
        y_poprzeczna_polowa = complex(0.0, galaz.b_poprzeczna_pu / 2.0)
        a = galaz.przekladnia
        modul_kwadrat = (a * a.conjugate()).real
        wiersze.extend((od, od, do, do))
        kolumny.extend((od, do, od, do))
        wartosci.extend(
            (
                (y_szeregowa + y_poprzeczna_polowa) / modul_kwadrat,
                -y_szeregowa / a.conjugate(),
                -y_szeregowa / a,
                y_szeregowa + y_poprzeczna_polowa,
            )
        )

    for odsprzeg in odsprzegi:
        if odsprzeg.wezel not in indeks:
            raise OdmowaDynamiki(
                KOD_SIEC_NIESPOJNA,
                f"Odsprzeg {odsprzeg.ident!r} wskazuje wezel spoza modelu ({odsprzeg.wezel!r})",
                odsprzeg=odsprzeg.ident,
            )
        pozycja = indeks[odsprzeg.wezel]
        wiersze.append(pozycja)
        kolumny.append(pozycja)
        wartosci.append(complex(odsprzeg.g_pu, odsprzeg.b_pu))

    for wezel_zwarcia, admitancja in admitancje_zwarc:
        if wezel_zwarcia not in indeks:
            raise OdmowaDynamiki(
                KOD_SIEC_NIESPOJNA,
                f"Zwarcie wskazuje wezel spoza modelu ({wezel_zwarcia!r})",
                wezel=wezel_zwarcia,
            )
        pozycja = indeks[wezel_zwarcia]
        wiersze.append(pozycja)
        kolumny.append(pozycja)
        wartosci.append(admitancja)

    ybus = sparse.coo_matrix(
        (
            np.array(wartosci, dtype=complex),
            (np.array(wiersze, dtype=int), np.array(kolumny, dtype=int)),
        ),
        shape=(liczba, liczba),
    ).tocsc()
    ybus.sum_duplicates()
    return ModelSieci(
        identy_wezlow=identy,
        indeks_wezla=indeks,
        ybus=ybus,
        wezly=wezly,
        galezie=galezie,
        odsprzegi=odsprzegi,
        galezie_aktywne=frozenset(aktywne),
        admitancje_zwarc=tuple(sorted(admitancje_zwarc, key=lambda pozycja: pozycja[0])),
    )


def przezloz(
    model: ModelSieci,
    *,
    galezie_aktywne: frozenset[str] | None = None,
    admitancje_zwarc: tuple[tuple[str, complex], ...] | None = None,
) -> ModelSieci:
    """Nowy stan topologii zlozony OD NOWA (nigdy przyrostowo — patrz docstring modulu)."""
    return zloz_model_sieci(
        model.wezly,
        model.galezie,
        model.odsprzegi,
        galezie_aktywne=(model.galezie_aktywne if galezie_aktywne is None else galezie_aktywne),
        admitancje_zwarc=(model.admitancje_zwarc if admitancje_zwarc is None else admitancje_zwarc),
    )


# ---------------------------------------------------------------------------
# Wstrzykniecia pradu i ich pochodne
# ---------------------------------------------------------------------------


def prad_odbioru_pu(odbior_p_pu: float, odbior_q_pu: float, napiecie_pu: complex) -> complex:
    """Prad WSTRZYKIWANY do wezla przez odbior o stalej mocy (konwencja generacji).

    Odbior pobiera `S = P + jQ`, wiec do wezla wstrzykuje `-conj(S)/conj(V)`.
    """
    return -complex(odbior_p_pu, odbior_q_pu).conjugate() / napiecie_pu.conjugate()


def jakobian_pradu_odbioru(
    odbior_p_pu: float, odbior_q_pu: float, napiecie_pu: complex
) -> np.ndarray:
    """∂(Re I, Im I)/∂(Re V, Im V) odbioru o stalej mocy — postac analityczna.

    Z `I = -(P - jQ)(a + jb)/(a^2 + b^2)` dla `V = a + jb` wychodzi wprost
    (rozniczkowanie ilorazu; zadnej roznicy skonczonej w torze gorącym).
    """
    a = napiecie_pu.real
    b = napiecie_pu.imag
    mianownik = a * a + b * b
    licznik_re = odbior_p_pu * a + odbior_q_pu * b
    licznik_im = odbior_p_pu * b - odbior_q_pu * a
    return np.array(
        [
            [
                -odbior_p_pu / mianownik + 2.0 * a * licznik_re / mianownik**2,
                -odbior_q_pu / mianownik + 2.0 * b * licznik_re / mianownik**2,
            ],
            [
                odbior_q_pu / mianownik + 2.0 * a * licznik_im / mianownik**2,
                -odbior_p_pu / mianownik + 2.0 * b * licznik_im / mianownik**2,
            ],
        ],
        dtype=float,
    )


def wstrzykniecia(
    model: ModelSieci,
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> np.ndarray:
    """Wektor pradow wstrzykiwanych do wezlow (pu, konwencja generacji)."""
    prady = np.zeros(model.liczba_wezlow, dtype=complex)
    for odbior in odbiory:
        pozycja = model.indeks_wezla[odbior.wezel]
        prady[pozycja] += prad_odbioru_pu(odbior.p_pu, odbior.q_pu, complex(napiecia[pozycja]))
    for urzadzenie, stan in zip(urzadzenia, stany, strict=True):
        pozycja = model.indeks_wezla[urzadzenie.wezel]
        prady[pozycja] += urzadzenie.prad_pu(stan, complex(napiecia[pozycja]))
    return prady


def residuum_algebry(
    model: ModelSieci,
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> np.ndarray:
    """`g(x, y) = Y*V - I(x, V)` w postaci rzeczywistej (2n)."""
    niezbilansowanie = model.ybus @ napiecia - wstrzykniecia(
        model, odbiory, urzadzenia, stany, napiecia
    )
    return np.concatenate((niezbilansowanie.real, niezbilansowanie.imag))


def jakobian_algebry(
    model: ModelSieci,
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> sparse.csc_matrix:
    """∂g/∂(Re V, Im V) — rzadki jakobian 2n x 2n, wklady analityczne."""
    liczba = model.liczba_wezlow
    czesc_g = model.ybus.real
    czesc_b = model.ybus.imag
    baza = sparse.bmat(
        [[czesc_g, -czesc_b], [czesc_b, czesc_g]],
        format="coo",
    )

    wiersze: list[int] = []
    kolumny: list[int] = []
    wartosci: list[float] = []

    def dopisz_blok(pozycja: int, blok: np.ndarray) -> None:
        for wiersz_lokalny in (0, 1):
            for kolumna_lokalna in (0, 1):
                wiersze.append(pozycja + wiersz_lokalny * liczba)
                kolumny.append(pozycja + kolumna_lokalna * liczba)
                wartosci.append(-float(blok[wiersz_lokalny, kolumna_lokalna]))

    for odbior in odbiory:
        pozycja = model.indeks_wezla[odbior.wezel]
        dopisz_blok(
            pozycja,
            jakobian_pradu_odbioru(odbior.p_pu, odbior.q_pu, complex(napiecia[pozycja])),
        )
    for urzadzenie, stan in zip(urzadzenia, stany, strict=True):
        pozycja = model.indeks_wezla[urzadzenie.wezel]
        dopisz_blok(pozycja, urzadzenie.jakobian_prad_napiecie(stan, complex(napiecia[pozycja])))

    korekta = sparse.coo_matrix(
        (
            np.array(wartosci, dtype=float),
            (np.array(wiersze, dtype=int), np.array(kolumny, dtype=int)),
        ),
        shape=(2 * liczba, 2 * liczba),
    )
    return (baza + korekta).tocsc()


@dataclass(frozen=True)
class WynikAlgebry:
    """Rozwiazanie `g(x, y) = 0` wraz z pomiarem zbieznosci."""

    napiecia: np.ndarray
    iteracje: int
    residuum: float
    nawroty: int


def rozwiaz_algebre(
    model: ModelSieci,
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia_startowe: np.ndarray,
    *,
    tolerancja: float,
    max_iteracji: int,
    max_nawrotow: int,
    t_s: float,
) -> WynikAlgebry:
    """Newton na `g(x, y) = 0` z globalizacja Armijo (poloweniem kroku).

    Globalizacja NIE jest ozdoba: bez niej zbieznosc przy glebokiej zapadzie
    napiecia jest loteria zaleznie od punktu startowego. Kazdy krok musi obnizyc
    norme residuum o `WSPOLCZYNNIK_ARMIJO * alfa` jej wartosci; jesli po
    `max_nawrotow` poloweniach zadna dlugosc kroku tego nie osiaga, rdzen ODMAWIA
    z pomiarem (residuum, liczba iteracji, liczba nawrotow) — nie melduje
    „rozjazdu" i nie zwraca ostatniego przyblizenia jako wyniku.
    """
    napiecia = np.array(napiecia_startowe, dtype=complex)
    sprawdz_napiecia(napiecia, model.identy_wezlow, t_s)
    residuum = residuum_algebry(model, odbiory, urzadzenia, stany, napiecia)
    norma = float(np.linalg.norm(residuum))
    nawroty_lacznie = 0

    for iteracja in range(1, max_iteracji + 1):
        if norma <= tolerancja:
            return WynikAlgebry(napiecia, iteracja - 1, norma, nawroty_lacznie)
        jakobian = jakobian_algebry(model, odbiory, urzadzenia, stany, napiecia)
        try:
            rozklad = sparse_linalg.splu(jakobian)
        except RuntimeError as blad:
            raise OdmowaDynamiki(
                KOD_ALGEBRA_NIEZBIEZNA,
                f"Jakobian czesci algebraicznej osobliwy przy t={t_s} s "
                f"(iteracja {iteracja}, residuum {norma}): {blad}",
                t_s=t_s,
                iteracja=iteracja,
                residuum=norma,
            ) from blad
        kierunek = rozklad.solve(-residuum)
        liczba = model.liczba_wezlow
        krok_zespolony = kierunek[:liczba] + 1j * kierunek[liczba:]

        alfa = 1.0
        przyjeto = False
        for nawrot in range(max_nawrotow + 1):
            kandydat = napiecia + alfa * krok_zespolony
            if not (np.isfinite(kandydat.real).all() and np.isfinite(kandydat.imag).all()):
                alfa *= 0.5
                nawroty_lacznie += 1
                continue
            residuum_kandydata = residuum_algebry(model, odbiory, urzadzenia, stany, kandydat)
            norma_kandydata = float(np.linalg.norm(residuum_kandydata))
            if norma_kandydata <= (1.0 - WSPOLCZYNNIK_ARMIJO * alfa) * norma:
                napiecia = kandydat
                residuum = residuum_kandydata
                norma = norma_kandydata
                nawroty_lacznie += nawrot
                przyjeto = True
                break
            alfa *= 0.5
        if not przyjeto:
            raise OdmowaDynamiki(
                KOD_ALGEBRA_NIEZBIEZNA,
                f"Zaden nawrot nie obnizyl residuum algebry przy t={t_s} s "
                f"(iteracja {iteracja}, residuum {norma}, nawrotow {max_nawrotow})",
                t_s=t_s,
                iteracja=iteracja,
                residuum=norma,
                nawroty=max_nawrotow,
            )
        sprawdz_napiecia(napiecia, model.identy_wezlow, t_s)

    if norma <= tolerancja:
        return WynikAlgebry(napiecia, max_iteracji, norma, nawroty_lacznie)
    raise OdmowaDynamiki(
        KOD_ALGEBRA_NIEZBIEZNA,
        f"Newton czesci algebraicznej nie zbiegl przy t={t_s} s "
        f"({max_iteracji} iteracji, residuum {norma} > tolerancja {tolerancja})",
        t_s=t_s,
        iteracja=max_iteracji,
        residuum=norma,
        tolerancja=tolerancja,
    )


def residuum_kcl_niezalezne(
    model: ModelSieci,
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> float:
    """Maksymalne residuum I prawa Kirchhoffa policzone NIEZALEZNIE od solvera.

    DLACZEGO OSOBNA DROGA. Gdyby diagnostyka uzywala tej samej macierzy `Y`, co
    Newton, mierzylaby wylacznie to, ze Newton zbiegl — a nie to, ze zbiegl do
    fizycznie poprawnego punktu. Tutaj prad galezi liczony jest ELEMENT PO
    ELEMENCIE z modelu pi (`I_od = (V_od/a - V_do)*y/conj(a) + V_od*j*b/(2|a|^2)`),
    odsprzegi i admitancje zwarc z ich wlasnych definicji, a wstrzykniecia z
    urzadzen i odbiorow. Zaden skladnik tej sumy nie przechodzi przez Ybus.
    """
    liczba = model.liczba_wezlow
    bilans = np.zeros(liczba, dtype=complex)

    for galaz in model.galezie:
        if galaz.ident not in model.galezie_aktywne:
            continue
        od = model.indeks_wezla[galaz.wezel_od]
        do = model.indeks_wezla[galaz.wezel_do]
        a = galaz.przekladnia
        modul_kwadrat = (a * a.conjugate()).real
        napiecie_od = complex(napiecia[od])
        napiecie_do = complex(napiecia[do])
        y_szeregowa = galaz.y_szeregowa_pu
        b_polowa = complex(0.0, galaz.b_poprzeczna_pu / 2.0)
        prad_szeregowy = (napiecie_od / a - napiecie_do) * y_szeregowa
        bilans[od] += prad_szeregowy / a.conjugate() + napiecie_od * b_polowa / modul_kwadrat
        bilans[do] += -prad_szeregowy + napiecie_do * b_polowa

    for odsprzeg in model.odsprzegi:
        pozycja = model.indeks_wezla[odsprzeg.wezel]
        bilans[pozycja] += complex(odsprzeg.g_pu, odsprzeg.b_pu) * complex(napiecia[pozycja])

    for wezel_zwarcia, admitancja in model.admitancje_zwarc:
        pozycja = model.indeks_wezla[wezel_zwarcia]
        bilans[pozycja] += admitancja * complex(napiecia[pozycja])

    for odbior in odbiory:
        pozycja = model.indeks_wezla[odbior.wezel]
        bilans[pozycja] -= prad_odbioru_pu(odbior.p_pu, odbior.q_pu, complex(napiecia[pozycja]))
    for urzadzenie, stan in zip(urzadzenia, stany, strict=True):
        pozycja = model.indeks_wezla[urzadzenie.wezel]
        bilans[pozycja] -= urzadzenie.prad_pu(stan, complex(napiecia[pozycja]))

    return float(np.max(np.abs(bilans))) if liczba else 0.0


__all__ = [
    "WSPOLCZYNNIK_ARMIJO",
    "ModelSieci",
    "WynikAlgebry",
    "jakobian_algebry",
    "jakobian_pradu_odbioru",
    "prad_odbioru_pu",
    "przezloz",
    "residuum_algebry",
    "residuum_kcl_niezalezne",
    "rozwiaz_algebre",
    "wstrzykniecia",
    "zloz_model_sieci",
]
