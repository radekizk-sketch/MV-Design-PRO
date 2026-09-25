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

WIERSZ OGRANICZENIA (karta AB-1b.1 par. 0 pkt 3). Wezel o napieciu NARZUCONYM nie ma
rownania KCL, tylko rownanie `V_k - E_k(x) = 0`: wezel obszaru beznapieciowego i wezel
zwarty metalicznie (`E = 0`) oraz wezel urzadzenia o sprzezeniu napieciowym (`E = E(x)`,
idealne zrodlo). JEDEN mechanizm dla trzech przypadkow, wymiar `y` zostaje `2n`. Prad
elementu narzucajacego napiecie jest WYPROWADZANY z bilansu wezla
(`prad_wezla_ograniczonego`), a nie z rownania elementu. Siec BEZ ograniczen idzie
dokladnie dotychczasowa sciezka (parytet bitowy wzorcow L5).

ZWARCIE W GALEZI x*L (karta AB-1b.1 par. 0 pkt 5). Galaz z trwajacym zwarciem jest
stemplowana CZWORNIKIEM z redukcji Krona wezlow wewnetrznych (`czwornik_galezi`): odcinki
pi o admitancjach `y/dx` i susceptancjach `B*dx`, admitancja zwarcia w kazdym wezle
wewnetrznym, wezel zwarty metalicznie uziemiony (V = 0 — w postaci zredukowanej
skonczony, bez wiersza ograniczenia). Galaz zdrowa idzie dotychczasowym wzorem pi.

POSTAC RZECZYWISTA. Niewiadoma jest wektor `[Re V; Im V]` (2n), a nie fazor
zespolony, bo residuum odbioru w galezi charakterystyki zalezy od `conj(V)` i od `|V|`
(`odbiory.py`), wiec NIE jest funkcja holomorficzna — jakobian zespolony dla niej nie
istnieje. Wklad `Y*V`
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
    KOD_NAPIECIE_NARZUCONE_SPRZECZNE,
    KOD_SIEC_NIESPOJNA,
    KOD_ZWARCIE_GALEZI_NIEOBSLUGIWANE,
    GalazDynamiki,
    OdbiorDynamiki,
    OdmowaDynamiki,
    OdsprzegDynamiki,
    Urzadzenie,
    WezelDynamiki,
)
from .odbiory import jakobian_pradu_pu, prad_wstrzykiwany_pu, wymaga_napiecia_niezerowego
from .skonczonosc import sprawdz_napiecia
from .wyspy import przydzial_wysp, sprawdz_zasilanie_wysp

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
    odsprzegi_aktywne: frozenset[str]
    admitancje_zwarc: tuple[tuple[str, complex], ...]
    przydzial_wysp: tuple[int, ...]
    #: Wezly zwarte METALICZNIE (R_f = X_f = 0): wiersz ograniczenia `V = 0`.
    zwarcia_metaliczne: frozenset[str]
    #: Wezly OBSZARU BEZNAPIECIOWEGO (wyspa bez urzadzenia wnoszacego do algebry,
    #: klasyfikowana przez silnik w chwilach zdarzen): wiersz ograniczenia `V = 0`.
    wezly_beznapieciowe: frozenset[str]
    #: Posortowane pozycje wezlow z ograniczeniem `V = 0` (suma dwoch zbiorow wyzej).
    pozycje_zerowe: tuple[int, ...]
    #: Zwarcia w galeziach: (galaz, polozenie wzgledne x, admitancja zwarcia pu albo
    #: `None` dla zwarcia metalicznego), posortowane po (galaz, x).
    zwarcia_galezi: tuple[tuple[str, float, complex | None], ...]

    @property
    def liczba_wezlow(self) -> int:
        return len(self.identy_wezlow)


ZwarcieWGalezi = tuple[float, complex | None]
"""(polozenie wzgledne x w (0, 1), admitancja zwarcia pu albo `None` = metaliczne)."""


def _macierz_odcinkow(y: complex, b: float, zwarcia: tuple[ZwarcieWGalezi, ...]) -> np.ndarray:
    """Gesta macierz admitancyjna galezi rozcietej w miejscach zwarc — BEZ admitancji zwarc.

    Wezly: 0 = zacisk `od`, 1..k = miejsca zwarc w kolejnosci `x`, k+1 = zacisk `do`.
    Odcinek o dlugosci wzglednej `dx` to pi o admitancji szeregowej `y/dx` i
    susceptancji `B*dx` rozdzielonej po polowie na konce.
    """
    punkty = (0.0, *(x for x, _ in zwarcia), 1.0)
    liczba = len(punkty)
    macierz = np.zeros((liczba, liczba), dtype=complex)
    for i in range(liczba - 1):
        dlugosc = punkty[i + 1] - punkty[i]
        szeregowa = y / dlugosc
        polowa = complex(0.0, b * dlugosc / 2.0)
        macierz[i, i] += szeregowa + polowa
        macierz[i + 1, i + 1] += szeregowa + polowa
        macierz[i, i + 1] -= szeregowa
        macierz[i + 1, i] -= szeregowa
    return macierz


def _podzial_wezlow(
    zwarcia: tuple[ZwarcieWGalezi, ...],
) -> tuple[list[int], list[int]]:
    """(wezly wewnetrzne SWOBODNE, wezly wewnetrzne UZIEMIONE — zwarcia metaliczne)."""
    swobodne = [m for m, (_, y_f) in enumerate(zwarcia, start=1) if y_f is not None]
    uziemione = [m for m, (_, y_f) in enumerate(zwarcia, start=1) if y_f is None]
    return swobodne, uziemione


def czwornik_galezi(
    y: complex, b: float, zwarcia: tuple[ZwarcieWGalezi, ...]
) -> tuple[complex, complex, complex, complex]:
    """Stempel `(Y_oo, Y_od, Y_do, Y_dd)` galezi ze zwarciami — redukcja Krona.

    `Y_zred = Y_ee - Y_ei Y_ii^-1 Y_ie` po wezlach wewnetrznych SWOBODNYCH (z admitancja
    zwarcia na przekatnej); wezel zwarty metalicznie ma `V = 0`, wiec jego wiersz i
    kolumna po prostu znikaja — jego polaczenia z sasiadami zostaja jako boczniki do
    ziemi na ich przekatnych. Dla jednego zwarcia w `x` z admitancja `y_f`:

        Y_mm = y/x + y/(1-x) + jB/2 + y_f
        Y_oo = y/x + jBx/2 - (y/x)^2 / Y_mm,     Y_od = Y_do = -(y/x)(y/(1-x)) / Y_mm
        Y_dd = y/(1-x) + jB(1-x)/2 - (y/(1-x))^2 / Y_mm
    """
    macierz = _macierz_odcinkow(y, b, zwarcia)
    swobodne, _ = _podzial_wezlow(zwarcia)
    for m in swobodne:
        admitancja = zwarcia[m - 1][1]
        assert admitancja is not None
        macierz[m, m] += admitancja
    zaciski = [0, len(zwarcia) + 1]
    zredukowana = macierz[np.ix_(zaciski, zaciski)]
    if swobodne:
        zredukowana = zredukowana - macierz[np.ix_(zaciski, swobodne)] @ np.linalg.solve(
            macierz[np.ix_(swobodne, swobodne)], macierz[np.ix_(swobodne, zaciski)]
        )
    return (
        complex(zredukowana[0, 0]),
        complex(zredukowana[0, 1]),
        complex(zredukowana[1, 0]),
        complex(zredukowana[1, 1]),
    )


def stempel_czwornika_zwarcia(
    y: complex, b: float, polozenie: float, admitancja_zwarcia: complex | None
) -> tuple[complex, complex, complex, complex]:
    """Stempel galezi z JEDNYM zwarciem w `x*L` (`None` = zwarcie metaliczne)."""
    return czwornik_galezi(y, b, ((polozenie, admitancja_zwarcia),))


def miejsca_zwarcia_galezi(
    y: complex,
    b: float,
    zwarcia: tuple[ZwarcieWGalezi, ...],
    napiecie_od: complex,
    napiecie_do: complex,
) -> tuple[tuple[complex, complex], ...]:
    """(napiecie w miejscu zwarcia, prad DO ZIEMI w miejscu zwarcia) dla kazdego zwarcia.

    Wezly wewnetrzne sa rozwiazywane JAWNIE (`Y_ii V_i = -Y_ie V_e`) — ta sama siec co
    stempel, ale bez redukcji. Prad zwarcia: `y_f V_m` dla admitancji skonczonej, a dla
    zwarcia metalicznego (`V_m = 0`) z bilansu wezla: `I_f = -(Y_odc V)_m`.
    """
    macierz = _macierz_odcinkow(y, b, zwarcia)
    swobodne, _ = _podzial_wezlow(zwarcia)
    napiecia = np.zeros(len(zwarcia) + 2, dtype=complex)
    napiecia[0] = napiecie_od
    napiecia[-1] = napiecie_do
    if swobodne:
        z_admitancja = macierz.copy()
        for m in swobodne:
            admitancja = zwarcia[m - 1][1]
            assert admitancja is not None
            z_admitancja[m, m] += admitancja
        zaciski = [0, len(zwarcia) + 1]
        napiecia[swobodne] = np.linalg.solve(
            z_admitancja[np.ix_(swobodne, swobodne)],
            -(z_admitancja[np.ix_(swobodne, zaciski)] @ napiecia[zaciski]),
        )
    wynik: list[tuple[complex, complex]] = []
    for m, (_, admitancja) in enumerate(zwarcia, start=1):
        napiecie = complex(napiecia[m])
        prad = (
            admitancja * napiecie if admitancja is not None else -complex(macierz[m, :] @ napiecia)
        )
        wynik.append((napiecie, prad))
    return tuple(wynik)


def galezie_laczace(
    galezie_aktywne: frozenset[str],
    zwarcia_galezi: tuple[tuple[str, float, complex | None], ...],
) -> frozenset[str]:
    """Galezie ELEKTRYCZNIE laczace swoje zaciski: aktywne i bez zwarcia METALICZNEGO wewnatrz.

    Zwarcie metaliczne w `x*L` uziemia punkt linii: stempel czwornika ma wtedy
    `Y_od = Y_do = 0` DOKLADNIE (`czwornik_galezi`), wiec zaciski galezi nie sa juz
    polaczone — kazdy z nich widzi tylko swoj odcinek do ziemi. Rozklad na wyspy musi
    to widziec, inaczej odcinek za zwarciem (bez zrodla) bylby klasyfikowany jako zywy,
    a Newton oddawalby tam `|V|` rzedu 1e-170 zamiast zera. Jedno zrodlo prawdy dla
    `ModelSieci.przydzial_wysp` i dla klasyfikacji obszarow w silniku.
    """
    metaliczne = {galaz for galaz, _, admitancja in zwarcia_galezi if admitancja is None}
    if not metaliczne:
        return galezie_aktywne
    return frozenset(galezie_aktywne - metaliczne)


def zwarcia_galezi_modelu(model: ModelSieci, galaz: str) -> tuple[ZwarcieWGalezi, ...]:
    """Zwarcia trwajace w galezi (w kolejnosci polozenia) — pusta krotka dla galezi zdrowej."""
    return tuple(
        (polozenie, admitancja)
        for ident, polozenie, admitancja in model.zwarcia_galezi
        if ident == galaz
    )


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
    odsprzegi_aktywne: frozenset[str] | None = None,
    admitancje_zwarc: tuple[tuple[str, complex], ...] = (),
    zwarcia_metaliczne: frozenset[str] = frozenset(),
    wezly_beznapieciowe: frozenset[str] = frozenset(),
    zwarcia_galezi: tuple[tuple[str, float, complex | None], ...] = (),
) -> ModelSieci:
    """Zloz Ybus skladowej zgodnej dla zadanego stanu topologii.

    `galezie_aktywne`/`odsprzegi_aktywne` rowne `None` znacza STAN POCZATKOWY z flag
    elementow (`aktywna_na_starcie`) — nie „wszystko zalaczone". Element nieaktywny nie
    jest stemplowany, wiec macierz jest bitowo ta sama, co bez niego na liscie.

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
        frozenset(galaz.ident for galaz in galezie if galaz.aktywna_na_starcie)
        if galezie_aktywne is None
        else galezie_aktywne
    )
    odsprzegi_czynne = (
        frozenset(odsprzeg.ident for odsprzeg in odsprzegi if odsprzeg.aktywna_na_starcie)
        if odsprzegi_aktywne is None
        else odsprzegi_aktywne
    )

    zwarcia_uporzadkowane = tuple(sorted(zwarcia_galezi, key=lambda z: (z[0], z[1])))
    identy_galezi = {galaz.ident: galaz for galaz in galezie}
    for ident_galezi, polozenie, _ in zwarcia_uporzadkowane:
        galaz_zwarta = identy_galezi.get(ident_galezi)
        if galaz_zwarta is None:
            raise OdmowaDynamiki(
                KOD_SIEC_NIESPOJNA,
                f"Zwarcie w galezi spoza modelu ({ident_galezi!r}, x = {polozenie})",
                galaz=ident_galezi,
            )
        if galaz_zwarta.rodzaj not in ("linia", "kabel") or galaz_zwarta.przekladnia != 1:
            raise OdmowaDynamiki(
                KOD_ZWARCIE_GALEZI_NIEOBSLUGIWANE,
                f"Zwarcie w miejscu x*L galezi {ident_galezi!r} (rodzaj "
                f"{galaz_zwarta.rodzaj!r}, przekladnia {galaz_zwarta.przekladnia}) — dlugosc "
                "elektryczna istnieje wylacznie dla linii i kabla",
                galaz=ident_galezi,
                rodzaj=galaz_zwarta.rodzaj,
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
        wiersze.extend((od, od, do, do))
        kolumny.extend((od, do, od, do))
        zwarcia_tej_galezi = tuple(
            (polozenie, admitancja)
            for ident_galezi, polozenie, admitancja in zwarcia_uporzadkowane
            if ident_galezi == galaz.ident
        )
        if zwarcia_tej_galezi:
            wartosci.extend(
                czwornik_galezi(galaz.y_szeregowa_pu, galaz.b_poprzeczna_pu, zwarcia_tej_galezi)
            )
            continue
        y_szeregowa = galaz.y_szeregowa_pu
        y_poprzeczna_polowa = complex(0.0, galaz.b_poprzeczna_pu / 2.0)
        a = galaz.przekladnia
        modul_kwadrat = (a * a.conjugate()).real
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
        if odsprzeg.ident not in odsprzegi_czynne:
            continue
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
    for wezel_ograniczony in (*zwarcia_metaliczne, *wezly_beznapieciowe):
        if wezel_ograniczony not in indeks:
            raise OdmowaDynamiki(
                KOD_SIEC_NIESPOJNA,
                f"Wiersz ograniczenia wskazuje wezel spoza modelu ({wezel_ograniczony!r})",
                wezel=wezel_ograniczony,
            )
    aktywne_zamrozone = frozenset(aktywne)
    return ModelSieci(
        identy_wezlow=identy,
        indeks_wezla=indeks,
        ybus=ybus,
        wezly=wezly,
        galezie=galezie,
        odsprzegi=odsprzegi,
        galezie_aktywne=aktywne_zamrozone,
        odsprzegi_aktywne=frozenset(odsprzegi_czynne),
        admitancje_zwarc=tuple(sorted(admitancje_zwarc, key=lambda pozycja: pozycja[0])),
        przydzial_wysp=przydzial_wysp(
            identy,
            indeks,
            galezie,
            galezie_laczace(aktywne_zamrozone, zwarcia_uporzadkowane),
        ),
        zwarcia_metaliczne=frozenset(zwarcia_metaliczne),
        wezly_beznapieciowe=frozenset(wezly_beznapieciowe),
        pozycje_zerowe=tuple(
            sorted({indeks[wezel] for wezel in (*zwarcia_metaliczne, *wezly_beznapieciowe)})
        ),
        zwarcia_galezi=zwarcia_uporzadkowane,
    )


def przezloz(
    model: ModelSieci,
    *,
    galezie_aktywne: frozenset[str] | None = None,
    odsprzegi_aktywne: frozenset[str] | None = None,
    admitancje_zwarc: tuple[tuple[str, complex], ...] | None = None,
    zwarcia_metaliczne: frozenset[str] | None = None,
    wezly_beznapieciowe: frozenset[str] | None = None,
    zwarcia_galezi: tuple[tuple[str, float, complex | None], ...] | None = None,
) -> ModelSieci:
    """Nowy stan topologii zlozony OD NOWA (nigdy przyrostowo — patrz docstring modulu)."""
    return zloz_model_sieci(
        model.wezly,
        model.galezie,
        model.odsprzegi,
        galezie_aktywne=(model.galezie_aktywne if galezie_aktywne is None else galezie_aktywne),
        odsprzegi_aktywne=(
            model.odsprzegi_aktywne if odsprzegi_aktywne is None else odsprzegi_aktywne
        ),
        admitancje_zwarc=(model.admitancje_zwarc if admitancje_zwarc is None else admitancje_zwarc),
        zwarcia_metaliczne=(
            model.zwarcia_metaliczne if zwarcia_metaliczne is None else zwarcia_metaliczne
        ),
        wezly_beznapieciowe=(
            model.wezly_beznapieciowe if wezly_beznapieciowe is None else wezly_beznapieciowe
        ),
        zwarcia_galezi=(model.zwarcia_galezi if zwarcia_galezi is None else zwarcia_galezi),
    )


# ---------------------------------------------------------------------------
# Wstrzykniecia pradu i ich pochodne
# ---------------------------------------------------------------------------


def ograniczenia_napiecia(
    model: ModelSieci, urzadzenia: tuple[Urzadzenie, ...]
) -> tuple[tuple[int, int | None], ...]:
    """Wiersze ograniczenia `V_k - E_k(x) = 0`: (pozycja wezla, indeks urzadzenia | None).

    `None` oznacza `E = 0` (obszar beznapieciowy albo zwarcie metaliczne); indeks wskazuje
    urzadzenie o sprzezeniu napieciowym, ktorego SEM `napiecie_bez_obciazenia(x)` narzuca
    napiecie wezla. Dwa rozne warunki w jednym wezle (np. zwarcie metaliczne na zaciskach
    idealnego zrodla) sa sprzeczne fizycznie i koncza sie NAZWANA odmowa — scalane sa
    wylacznie dwa warunki `V = 0` (obszar odciety, w ktorym trwa zwarcie metaliczne).
    """
    wynik: dict[int, int | None] = {pozycja: None for pozycja in model.pozycje_zerowe}
    for indeks, urzadzenie in enumerate(urzadzenia):
        if urzadzenie.sprzezenie != "napieciowe":
            continue
        pozycja = model.indeks_wezla[urzadzenie.wezel]
        if pozycja in wynik:
            poprzedni = wynik[pozycja]
            raise OdmowaDynamiki(
                KOD_NAPIECIE_NARZUCONE_SPRZECZNE,
                f"Wezel {urzadzenie.wezel!r} ma dwa warunki narzucajace napiecie: urzadzenie "
                f"{urzadzenie.ident!r} (sprzezenie napieciowe) oraz "
                + (
                    "zwarcie metaliczne albo obszar odciety (V = 0)"
                    if poprzedni is None
                    else f"urzadzenie {urzadzenia[poprzedni].ident!r}"
                )
                + " — pierwsze prawo Kirchhoffa zadaloby nieskonczonego pradu",
                wezel=urzadzenie.wezel,
                urzadzenie=urzadzenie.ident,
            )
        wynik[pozycja] = indeks
    return tuple(sorted(wynik.items()))


def rzutuj_napiecia_zerowe(model: ModelSieci, napiecia: np.ndarray) -> np.ndarray:
    """Napiecia z ZEREM DOKLADNYM w wezlach o napieciu narzuconym zerem.

    Wiersz `V_k = 0` jest liniowy i jawny, wiec jego rozwiazaniem jest zero, a nie liczba
    rzedu 1e-17, ktora zostawilby rozklad LU z wyborem elementu glownego (pomiar: zwarcie
    metaliczne przy maszynie dawalo |V| = 4,1e-17 pu). Rzut jest tym samym, czym
    `calkowanie.rzutuj_stany` dla granic stanow: niewiadoma o wartosci wyznaczonej
    rownaniem liniowym przyjmuje ja DOKLADNIE, a Newton dziala na pozostalych — to jest
    Newton na ukladzie zredukowanym, nie korekta rozwiazania. Siec bez takich wezlow
    dostaje TEN SAM obiekt (parytet bitowy).
    """
    if not model.pozycje_zerowe:
        return napiecia
    wynik = np.array(napiecia, dtype=complex, copy=True)
    wynik[list(model.pozycje_zerowe)] = 0j
    return wynik


def wstrzykniecia(
    model: ModelSieci,
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> np.ndarray:
    """Wektor pradow wstrzykiwanych do wezlow (pu, konwencja generacji).

    Wezly z wierszem ograniczenia sa POMIJANE (ich rownanie nie jest bilansem pradow),
    a urzadzenie o sprzezeniu napieciowym nie ma lokalnego wzoru na prad — jego prad
    wyprowadza `prad_wezla_ograniczonego`. Bez ograniczen petla jest dokladnie
    dotychczasowa (parytet bitowy).
    """
    prady = np.zeros(model.liczba_wezlow, dtype=complex)
    ograniczone = {pozycja for pozycja, _ in ograniczenia_napiecia(model, urzadzenia)}
    for odbior in odbiory:
        pozycja = model.indeks_wezla[odbior.wezel]
        if pozycja in ograniczone:
            continue
        prady[pozycja] += prad_wstrzykiwany_pu(odbior, complex(napiecia[pozycja]))
    for urzadzenie, stan in zip(urzadzenia, stany, strict=True):
        pozycja = model.indeks_wezla[urzadzenie.wezel]
        if pozycja in ograniczone:
            continue
        prady[pozycja] += urzadzenie.prad_pu(stan, complex(napiecia[pozycja]))
    return prady


def residuum_algebry(
    model: ModelSieci,
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> np.ndarray:
    """`g(x, y) = Y*V - I(x, V)` w postaci rzeczywistej (2n); wiersz ograniczenia `V - E(x)`."""
    niezbilansowanie = model.ybus @ napiecia - wstrzykniecia(
        model, odbiory, urzadzenia, stany, napiecia
    )
    for pozycja, indeks in ograniczenia_napiecia(model, urzadzenia):
        narzucone = (
            0j if indeks is None else urzadzenia[indeks].napiecie_bez_obciazenia(stany[indeks])
        )
        niezbilansowanie[pozycja] = complex(napiecia[pozycja]) - narzucone
    return np.concatenate((niezbilansowanie.real, niezbilansowanie.imag))


def jakobian_algebry(
    model: ModelSieci,
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
) -> sparse.csc_matrix:
    """∂g/∂(Re V, Im V) — rzadki jakobian 2n x 2n, wklady analityczne.

    Wiersz ograniczenia `V_k - E_k(x) = 0` ma po napieciach wiersz JEDNOSTKOWY (blok
    `dR_y/dx = -dE/dx` tego wiersza sklada jakobian sprzezony kroku).
    """
    liczba = model.liczba_wezlow
    czesc_g = model.ybus.real
    czesc_b = model.ybus.imag
    baza = sparse.bmat(
        [[czesc_g, -czesc_b], [czesc_b, czesc_g]],
        format="coo",
    )
    ograniczenia = ograniczenia_napiecia(model, urzadzenia)
    ograniczone = {pozycja for pozycja, _ in ograniczenia}

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
        if pozycja in ograniczone:
            continue
        dopisz_blok(pozycja, jakobian_pradu_pu(odbior, complex(napiecia[pozycja])))
    for urzadzenie, stan in zip(urzadzenia, stany, strict=True):
        pozycja = model.indeks_wezla[urzadzenie.wezel]
        if pozycja in ograniczone:
            continue
        dopisz_blok(pozycja, urzadzenie.jakobian_prad_napiecie(stan, complex(napiecia[pozycja])))

    korekta = sparse.coo_matrix(
        (
            np.array(wartosci, dtype=float),
            (np.array(wiersze, dtype=int), np.array(kolumny, dtype=int)),
        ),
        shape=(2 * liczba, 2 * liczba),
    )
    jakobian = (baza + korekta).tocsc()
    if not ograniczenia:
        return jakobian
    maska = np.ones(2 * liczba, dtype=float)
    for pozycja in ograniczone:
        maska[pozycja] = 0.0
        maska[pozycja + liczba] = 0.0
    return (sparse.diags(maska) @ jakobian + sparse.diags(1.0 - maska)).tocsc()


def prad_wezla_ograniczonego(
    model: ModelSieci,
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    stany: tuple[np.ndarray, ...],
    napiecia: np.ndarray,
    wezel: str,
) -> complex:
    """Prad WSTRZYKIWANY do wezla przez element narzucajacy jego napiecie (konwencja generacji).

    `I = sum_j Y_kj V_j - (pozostale wstrzykniecia wezla k)` — bilans wezla, bo element
    narzucajacy napiecie (idealne zrodlo, zwarcie metaliczne) nie ma wlasnego wzoru na
    prad. Dla zwarcia metalicznego prad PLYNACY DO ZIEMI w miejscu zwarcia jest liczba
    przeciwna. JEDNA funkcja dla mocy urzadzenia o sprzezeniu napieciowym i dla kanalow
    pradu zwarcia metalicznego.
    """
    pozycja = model.indeks_wezla[wezel]
    wiersz = model.ybus.getrow(pozycja)
    prad = complex((wiersz @ napiecia)[0])
    napiecie = complex(napiecia[pozycja])
    # W wezle o napieciu narzuconym ZEREM odbior nie pobiera pradu: w obszarze
    # beznapieciowym jest odciety (silnik nie podaje go wcale), w wezle zwartym
    # metalicznie odbior z zadeklarowanym `U_min` (i czysto impedancyjny) jest w galezi
    # impedancyjnej, gdzie `I = -Y*0 = 0` dokladnie, a odbior bez `U_min` z moca niezerowa
    # jest odmowa nazwana (`silnik._sprawdz_wezly_zerowe`). Pominiecie jest wiec DOKLADNE,
    # a nie przyblizeniem (i nie dzieli 0/0 dla odbioru bez `U_min` o mocy zerowej).
    zerowy = pozycja in model.pozycje_zerowe
    for odbior in odbiory:
        if odbior.wezel == wezel and not zerowy:
            prad -= prad_wstrzykiwany_pu(odbior, napiecie)
    for urzadzenie, stan in zip(urzadzenia, stany, strict=True):
        if urzadzenie.wezel == wezel and urzadzenie.sprzezenie != "napieciowe":
            prad -= urzadzenie.prad_pu(stan, napiecie)
    return prad


def _sprawdz_start_odbiorow(
    model: ModelSieci,
    odbiory: tuple[OdbiorDynamiki, ...],
    urzadzenia: tuple[Urzadzenie, ...],
    napiecia: np.ndarray,
    t_s: float,
) -> None:
    """Zerowy punkt startowy w wezle odbioru BEZ napiecia przejscia — odmowa NAZWANA, nie 0/0.

    Prad odbioru w galezi charakterystyki `-conj(S)/conj(V)` nie istnieje przy `V = 0`, gdy
    odbior nie ma zadeklarowanego `U_min` (`odbiory.wymaga_napiecia_niezerowego` — TEN SAM
    predykat, co odmowa w wezle zwartym metalicznie). Odbior z `U_min` (albo czysto
    impedancyjny) ma w `V = 0` prad zerowy i skonczony jakobian — startuje bez odmowy.
    Silnik nie podaje takiego punktu (wezel ponownie zasilony startuje od sasiada albo od
    SEM urzadzenia), ale warunek jest sprawdzany TU, na wejsciu jedynej funkcji, ktora
    liczy prad odbioru w Newtonie — zeby kazda inna sciezka wywolania konczyla sie kodem,
    a nie surowym `ZeroDivisionError` (pomiar: mutacja startu od zera).
    """
    ograniczone = {pozycja for pozycja, _ in ograniczenia_napiecia(model, urzadzenia)}
    zerowe = sorted(
        {
            odbior.wezel
            for odbior in odbiory
            if model.indeks_wezla[odbior.wezel] not in ograniczone
            and complex(napiecia[model.indeks_wezla[odbior.wezel]]) == 0
            and wymaga_napiecia_niezerowego(odbior)
        }
    )
    if zerowe:
        raise OdmowaDynamiki(
            KOD_ALGEBRA_NIEZBIEZNA,
            f"Punkt startowy algebry przy t={t_s} s ma napięcie zerowe w węzłach {tuple(zerowe)} "
            "odbiorów bez zadeklarowanego napięcia przejścia U_min — prąd charakterystyki "
            "-conj(S)/conj(V) nie istnieje przy V = 0, więc Newton nie ma od czego wystartować",
            t_s=t_s,
            wezly=tuple(zerowe),
        )


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

    WARUNEK ISTNIENIA IDZIE PRZED NEWTONEM. Zanim jakikolwiek krok zostanie
    policzony, sprawdzany jest warunek strukturalny: czy kazda wyspa niosaca
    odbior ma cokolwiek, co moze go zasilic (`wyspy.sprawdz_zasilanie_wysp`).
    Powod jest pomiarowy: dla wyspy bez zrodla residuum wynosi `|S|/|V|`, wiec
    Newton osiaga DOWOLNA tolerancje przez samo odjechanie napiecia — i melduje
    „zbieznosc" przy `|V| ~ 1e11 pu`. Sprawdzenie zbieznosci nie jest w stanie
    tego wylapac z zasady (residuum naprawde jest male), wiec warunek istnienia
    musi byc sprawdzony OSOBNO i WCZESNIEJ.
    """
    napiecia = rzutuj_napiecia_zerowe(model, np.array(napiecia_startowe, dtype=complex))
    sprawdz_napiecia(napiecia, model.identy_wezlow, t_s)
    _sprawdz_start_odbiorow(model, odbiory, urzadzenia, napiecia, t_s)
    sprawdz_zasilanie_wysp(
        model.identy_wezlow,
        model.indeks_wezla,
        model.przydzial_wysp,
        odbiory,
        urzadzenia,
        stany,
        napiecia,
        t_s,
    )
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
            kandydat = rzutuj_napiecia_zerowe(model, napiecia + alfa * krok_zespolony)
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
        zwarcia_tej_galezi = zwarcia_galezi_modelu(model, galaz.ident)
        if zwarcia_tej_galezi:
            # Galaz zwarta: prady zaciskow z JAWNYCH wezlow wewnetrznych (odcinki pi),
            # nie ze zredukowanego stempla, ktorym sklada sie Ybus.
            bilans[od] += _prad_zacisku_odcinkami(
                galaz, zwarcia_tej_galezi, complex(napiecia[od]), complex(napiecia[do]), True
            )
            bilans[do] += _prad_zacisku_odcinkami(
                galaz, zwarcia_tej_galezi, complex(napiecia[od]), complex(napiecia[do]), False
            )
            continue
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
        if odsprzeg.ident not in model.odsprzegi_aktywne:
            continue
        pozycja = model.indeks_wezla[odsprzeg.wezel]
        bilans[pozycja] += complex(odsprzeg.g_pu, odsprzeg.b_pu) * complex(napiecia[pozycja])

    for wezel_zwarcia, admitancja in model.admitancje_zwarc:
        pozycja = model.indeks_wezla[wezel_zwarcia]
        bilans[pozycja] += admitancja * complex(napiecia[pozycja])

    ograniczone = {pozycja for pozycja, _ in ograniczenia_napiecia(model, urzadzenia)}
    for odbior in odbiory:
        pozycja = model.indeks_wezla[odbior.wezel]
        if pozycja in ograniczone:
            continue
        bilans[pozycja] -= prad_wstrzykiwany_pu(odbior, complex(napiecia[pozycja]))
    for urzadzenie, stan in zip(urzadzenia, stany, strict=True):
        pozycja = model.indeks_wezla[urzadzenie.wezel]
        if pozycja in ograniczone:
            continue
        bilans[pozycja] -= urzadzenie.prad_pu(stan, complex(napiecia[pozycja]))

    # Wezly z wierszem ograniczenia sa raportowane OSOBNO (`wezly_ograniczone`): prad
    # elementu narzucajacego napiecie jest z definicji domknieciem ich bilansu, wiec
    # „residuum niezalezne" takiego wezla byloby tautologia, nie pomiarem.
    for pozycja in ograniczone:
        bilans[pozycja] = 0j
    return float(np.max(np.abs(bilans))) if liczba else 0.0


def _prad_zacisku_odcinkami(
    galaz: GalazDynamiki,
    zwarcia: tuple[ZwarcieWGalezi, ...],
    napiecie_od: complex,
    napiecie_do: complex,
    zacisk_od: bool,
) -> complex:
    """Prad WPLYWAJACY do galezi zaciskiem z odcinka pi przy zacisku (wezly jawne)."""
    miejsca = miejsca_zwarcia_galezi(
        galaz.y_szeregowa_pu, galaz.b_poprzeczna_pu, zwarcia, napiecie_od, napiecie_do
    )
    if zacisk_od:
        dlugosc = zwarcia[0][0]
        zacisk, sasiad = napiecie_od, miejsca[0][0]
    else:
        dlugosc = 1.0 - zwarcia[-1][0]
        zacisk, sasiad = napiecie_do, miejsca[-1][0]
    return (zacisk - sasiad) * (galaz.y_szeregowa_pu / dlugosc) + zacisk * complex(
        0.0, galaz.b_poprzeczna_pu * dlugosc / 2.0
    )


def wezly_ograniczone(model: ModelSieci, urzadzenia: tuple[Urzadzenie, ...]) -> tuple[str, ...]:
    """Identyfikatory wezlow z wierszem ograniczenia (kolejnosc wezlow modelu)."""
    return tuple(
        model.identy_wezlow[pozycja] for pozycja, _ in ograniczenia_napiecia(model, urzadzenia)
    )


__all__ = [
    "WSPOLCZYNNIK_ARMIJO",
    "ModelSieci",
    "WynikAlgebry",
    "ZwarcieWGalezi",
    "czwornik_galezi",
    "galezie_laczace",
    "jakobian_algebry",
    "miejsca_zwarcia_galezi",
    "ograniczenia_napiecia",
    "prad_wezla_ograniczonego",
    "przezloz",
    "residuum_algebry",
    "residuum_kcl_niezalezne",
    "rozwiaz_algebre",
    "rzutuj_napiecia_zerowe",
    "stempel_czwornika_zwarcia",
    "wezly_ograniczone",
    "wstrzykniecia",
    "zloz_model_sieci",
    "zwarcia_galezi_modelu",
]
