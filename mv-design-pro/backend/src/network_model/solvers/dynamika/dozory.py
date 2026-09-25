"""Zdarzenia WARUNKOWE (dozory) — prymityw rdzenia z lokalizacja chwili przekroczenia.

PO CO. Zdarzenie planowane ma chwile z harmonogramu; zdarzenie warunkowe — z PRZEBIEGU:
„gdy napiecie szyny spadnie ponizej progu", „gdy prad zacisku przekroczy nastawe". Chwila
takiego zdarzenia nie lezy na siatce kroku — lezy tam, gdzie trajektoria przecina prog.
Ten modul niesie specyfikacje dozoru (DANA, haszowalna — nie funkcja), ocene wielkosci
dozorowanej i lokalizacje chwili przekroczenia; silnik wykonuje akcje tym samym
mechanizmem, co zdarzenie planowane (ladowanie kroku, probki `L`/`P`, jedna
re-inicjalizacja, wpis w `zdarzenia_wykonane`).

WIELKOSC DOZOROWANA — TE SAME FUNKCJE, CO KANALY WYNIKU (jedno zrodlo prawdy):
modul napiecia wezla (`u_pu@`), czestotliwosc wezla (`obserwable.czestotliwosci_wezlow`,
kanal `f_hz@`), modul pradu ZACISKU galezi (`obserwable.wielkosci_galezi`, kanaly `i_od_pu@`
/ `i_do_pu@` — zacisk nazwany JAWNIE, nigdy przez konwencje „od"), stan urzadzenia
(kanal `<stan>@`) i moc urzadzenia (`obserwable.moc_urzadzenia_pu`, kanaly `p_pu@`/`q_pu@`).
Prog jest w jednostce kanalu. Czestotliwosc nie jest oceniana tam, gdzie kanal jej nie
publikuje (chwila zdarzenia, jakosc NIEDOSTEPNA, wezel bez napiecia) — przejscie przez
taka chwile rozstrzyga pierwsza ocena po niej, z UCZCIWA szerokoscia przedzialu.

WARUNEK. `h = s * (wartosc - prog)`, `s = +1` dla kierunku `w_gore`, `-1` dla `w_dol`;
warunek jest spelniony, gdy `h > 0`. Pobudzenie = przejscie warunku z falszu w prawde;
przejscie odwrotne (powrotne) kasuje oczekujace akcje dozoru z `kasowanie_przy_powrocie`
i uzbraja ponownie dozor niejednorazowy.

LOKALIZACJA (Illinois z krokiem bisekcji i krokiem tolerancji). Po kazdym przyjetym kroku `[t0, t1]` dozor jest
oceniany w `t1`; zmiana warunku przy znanej ocenie w `t0` uruchamia metode Illinois na
dlugosci kroku `tau in (0, t1 - t0]`: KAZDA proba to JEDEN krok tego samego integratora z
zapisanego stanu `t0` (krok nie ma pamieci), wiec lokalizowany jest pierwiastek
TRAJEKTORII DYSKRETNEJ, a nie interpolacji. Iteracja konczy sie, gdy szerokosc
przedzialu nie przekracza `tolerancja_lokalizacji_zdarzen_s`; `t*` jest PRAWYM koncem
przedzialu (strona po przekroczeniu). Gdy krok Illinois nie zweza przedzialu co najmniej
o polowe, nastepny krok jest bisekcja — zakonczenie jest gwarantowane w
`2 * log2((t1 - t0) / tolerancja) + 2` probach. Proba lezy zawsze co najmniej pol
tolerancji od kazdego konca (krok tolerancji metody Brenta), wiec pierwiastek trafiony
dokladnie jedna sieczna (wielkosc liniowa w czasie) zamyka przedzial w nastepnej probie.

PRECYZJA PUBLIKOWANA. Czas w ladunku `resultset_dynamic_v2` jest kwantyzowany do 9 cyfr
znaczacych; wynik rdzenia (`WynikDynamiki`) zachowuje pelna precyzje, a bramka
lokalizacji porownuje wartosci NIEskwantyzowane.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace
from typing import TYPE_CHECKING, Any, Literal, Protocol

import numpy as np

from .kontrakty import (
    KOD_PETLA_ZDARZEN_WARUNKOWYCH,
    KOD_ZDARZENIE_SPRZECZNE,
    KomendaRegulacji,
    OdbiorDynamiki,
    OdlaczenieZrodla,
    OdmowaDynamiki,
    PrzypisanieStanu,
    SkokObciazenia,
    Urzadzenie,
    UtrataCzesciowaZrodla,
    ZdarzenieDynamiki,
    ZmianaGalezi,
    ZmianaOdbioru,
    ZmianaOdsprzegu,
)
from .obserwable import czestotliwosci_wezlow, moc_urzadzenia_pu, wielkosci_galezi
from .siec import ModelSieci

if TYPE_CHECKING:  # pragma: no cover — wylacznie adnotacja (zdarzenia importuje ten modul)
    from .zdarzenia import WpisHarmonogramu

KierunekDozoru = Literal["w_dol", "w_gore"]
ZaciskGalezi = Literal["od", "do"]
SkladowaMocy = Literal["p", "q"]
#: Strona oceny: `C` — punkt ciaglej trajektorii (koniec kroku, proba lokalizacji),
#: `L`/`P` — przed/po zdarzeniach chwili (czestotliwosc nieoceniana).
StronaOceny = Literal["C", "L", "P"]

#: Zdarzenia, ktore moga byc AKCJA dozoru — wylacznie chwilowe (zwarcie ma czas trwania i
#: sposob usuniecia, wiec nie jest akcja; akcje zabezpieczen dochodza z modelu, AB-5).
AKCJE_DOZORU: tuple[type, ...] = (
    ZmianaGalezi,
    ZmianaOdsprzegu,
    ZmianaOdbioru,
    OdlaczenieZrodla,
    UtrataCzesciowaZrodla,
    SkokObciazenia,
    PrzypisanieStanu,
    KomendaRegulacji,
)


class ProbaWarunku(Protocol):
    """`h` po JEDNYM kroku integratora dlugosci `tau` z zapisanego stanu `t0` (`None` —
    wielkosc nieoceniana w tym punkcie). Protokol zamiast `collections.abc.Callable`:
    rdzen jest lisciem grafu importow z zamknieta allowlista modulow jezykowych."""

    def __call__(self, tau_s: float, /) -> float | None: ...


class ProbaKroku(Protocol):
    """Stan ukladu po JEDNYM kroku integratora dlugosci `tau` z zapisanego stanu `t0`."""

    def __call__(self, tau_s: float, /) -> StanUkladu: ...


@dataclass(frozen=True)
class ModulNapieciaWezla:
    """Modul napiecia wezla [pu] — kanal `u_pu@<wezel>`."""

    wezel: str

    @property
    def klucz_kanalu(self) -> str:
        return f"u_pu@{self.wezel}"


@dataclass(frozen=True)
class CzestotliwoscElektrycznaWezla:
    """Czestotliwosc elektryczna wezla [Hz] — kanal `f_hz@<wezel>`."""

    wezel: str

    @property
    def klucz_kanalu(self) -> str:
        return f"f_hz@{self.wezel}"


@dataclass(frozen=True)
class ModulPraduZacisku:
    """Modul pradu JAWNIE nazwanego zacisku galezi [pu] — kanal `i_od_pu@`/`i_do_pu@`."""

    galaz: str
    zacisk: ZaciskGalezi

    @property
    def klucz_kanalu(self) -> str:
        return f"i_{self.zacisk}_pu@{self.galaz}"


@dataclass(frozen=True)
class StanUrzadzenia:
    """Stan rozniczkowy urzadzenia (jednostka z sufiksu nazwy) — kanal `<stan>@<urzadzenie>`."""

    urzadzenie: str
    stan: str

    @property
    def klucz_kanalu(self) -> str:
        return f"{self.stan}@{self.urzadzenie}"


@dataclass(frozen=True)
class MocUrzadzenia:
    """Moc czynna albo bierna oddawana przez urzadzenie [pu] — kanal `p_pu@`/`q_pu@`."""

    urzadzenie: str
    skladowa: SkladowaMocy

    @property
    def klucz_kanalu(self) -> str:
        return f"{self.skladowa}_pu@{self.urzadzenie}"


WielkoscDozoru = (
    ModulNapieciaWezla
    | CzestotliwoscElektrycznaWezla
    | ModulPraduZacisku
    | StanUrzadzenia
    | MocUrzadzenia
)


@dataclass(frozen=True)
class Dozor:
    """Specyfikacja zdarzenia warunkowego — DANA wchodzaca do odcisku harmonogramu.

    * `prog` — w jednostce kanalu wielkosci; `kierunek` — `w_dol` (wartosc spada ponizej
      progu) albo `w_gore` (wartosc rosnie powyzej),
    * `opoznienie_s` — akcje wykonuja sie w `t* + opoznienie_s` (0 = w chwili `t*`),
    * `kasowanie_przy_powrocie` — przejscie powrotne przed `t* + opoznienie_s` usuwa
      oczekujace akcje (wymaga opoznienia dodatniego — bez niego nie ma czego kasowac),
    * `akcje` — zdarzenia CHWILOWE z `t_s = 0` (chwila wzgledna — silnik przesuwa je do
      chwili wykonania); krotka pusta = DETEKTOR (wynik `przekroczenia`, bez skutku),
    * `jednorazowy` — dozor pobudza sie najwyzej raz w biegu; niejednorazowy uzbraja sie
      ponownie po przejsciu powrotnym.
    """

    ident: str
    wielkosc: WielkoscDozoru
    prog: float
    kierunek: KierunekDozoru
    opoznienie_s: float
    kasowanie_przy_powrocie: bool
    akcje: tuple[ZdarzenieDynamiki, ...]
    jednorazowy: bool

    def __post_init__(self) -> None:
        if not math.isfinite(self.prog):
            raise _odmowa(self, f"próg {self.prog!r} nie jest liczba skończona")
        if self.kierunek not in ("w_dol", "w_gore"):
            raise _odmowa(self, f"kierunek {self.kierunek!r} spoza {{w_dol, w_gore}}")
        if not (math.isfinite(self.opoznienie_s) and self.opoznienie_s >= 0.0):
            raise _odmowa(self, f"opóźnienie {self.opoznienie_s!r} s nie jest liczba nieujemna")
        if self.kasowanie_przy_powrocie and self.opoznienie_s == 0.0:
            raise _odmowa(
                self,
                "kasowanie przy powrocie bez opóźnienia — akcja wykonuje się w chwili "
                "pobudzenia, więc nie ma czego kasowac",
            )
        if self.kasowanie_przy_powrocie and not self.akcje:
            raise _odmowa(self, "kasowanie przy powrocie w detektorze bez akcji")
        for akcja in self.akcje:
            if not isinstance(akcja, AKCJE_DOZORU):
                raise _odmowa(
                    self,
                    f"akcja {type(akcja).__name__} nie jest zdarzeniem chwilowym "
                    "(zwarcie ma czas trwania i sposób usunięcia)",
                )
            if akcja.t_s != 0.0:
                raise _odmowa(
                    self,
                    f"akcja {type(akcja).__name__} ma t_s={akcja.t_s} — chwila akcji jest "
                    "WZGLEDNA (0 = chwila wykonania dozoru)",
                )

    @property
    def znak(self) -> float:
        """`+1` dla `w_gore`, `-1` dla `w_dol` — warunek spelniony przy `h > 0`."""
        return 1.0 if self.kierunek == "w_gore" else -1.0


def _odmowa(dozor: Dozor, komunikat: str) -> OdmowaDynamiki:
    return OdmowaDynamiki(
        KOD_ZDARZENIE_SPRZECZNE,
        f"Dozor {dozor.ident!r}: {komunikat}",
        dozor=dozor.ident,
    )


@dataclass(frozen=True)
class StanUkladu:
    """Punkt, w ktorym ocenia sie dozory: model, odbiory, urzadzenia, stany, napiecia, strona."""

    model: ModelSieci
    odbiory: tuple[OdbiorDynamiki, ...]
    urzadzenia: tuple[Urzadzenie, ...]
    stany: tuple[np.ndarray, ...]
    napiecia: np.ndarray
    strona: StronaOceny


def wartosc_wielkosci(
    wielkosc: WielkoscDozoru, uklad: StanUkladu, *, f_bazowa_hz: float
) -> float | None:
    """Wartosc wielkosci dozorowanej w punkcie `uklad` — te same funkcje, co kanaly wyniku.

    `None` = wielkosc nieoceniana w tym punkcie (wylacznie czestotliwosc: chwila zdarzenia
    albo jakosc, przy ktorej kanal publikuje brak wartosci).
    """
    model = uklad.model
    if isinstance(wielkosc, ModulNapieciaWezla):
        return abs(complex(uklad.napiecia[model.indeks_wezla[wielkosc.wezel]]))
    if isinstance(wielkosc, CzestotliwoscElektrycznaWezla):
        if uklad.strona != "C":
            return None
        return czestotliwosci_wezlow(
            model,
            uklad.odbiory,
            uklad.urzadzenia,
            uklad.stany,
            uklad.napiecia,
            f_bazowa_hz=f_bazowa_hz,
        )[model.indeks_wezla[wielkosc.wezel]].f_hz
    if isinstance(wielkosc, ModulPraduZacisku):
        galaz = next(g for g in model.galezie if g.ident == wielkosc.galaz)
        wielkosci = wielkosci_galezi(model, galaz, uklad.napiecia)
        return abs(wielkosci.i_od_pu if wielkosc.zacisk == "od" else wielkosci.i_do_pu)
    indeks = next(
        pozycja
        for pozycja, urzadzenie in enumerate(uklad.urzadzenia)
        if urzadzenie.ident == wielkosc.urzadzenie
    )
    if isinstance(wielkosc, StanUrzadzenia):
        pozycja_stanu = uklad.urzadzenia[indeks].nazwy_stanow.index(wielkosc.stan)
        return float(uklad.stany[indeks][pozycja_stanu])
    moc = moc_urzadzenia_pu(
        model, uklad.odbiory, uklad.urzadzenia, uklad.stany, uklad.napiecia, indeks
    )
    return float(moc.real if wielkosc.skladowa == "p" else moc.imag)


def funkcja_warunku(dozor: Dozor, uklad: StanUkladu, *, f_bazowa_hz: float) -> float | None:
    """`h = s (wartosc - prog)`; warunek spelniony przy `h > 0`; `None` — nieoceniane."""
    wartosc = wartosc_wielkosci(dozor.wielkosc, uklad, f_bazowa_hz=f_bazowa_hz)
    if wartosc is None:
        return None
    return dozor.znak * (wartosc - dozor.prog)


@dataclass(frozen=True)
class Lokalizacja:
    """Wynik lokalizacji przekroczenia: `t*` (prawy koniec przedzialu), szerokosc przedzialu,
    liczba prob oraz wartosci `h` na koncach (`None` — koniec nieoceniony)."""

    t_s: float
    szerokosc_s: float
    iteracje: int
    g_przed: float | None
    g_po: float | None


def lokalizuj(
    t0_s: float,
    krok_s: float,
    g_lewy: float,
    g_prawy: float,
    proba: ProbaWarunku,
    *,
    tolerancja_s: float,
    przejscie_w_gore: bool,
) -> tuple[Lokalizacja, float]:
    """Illinois z krokiem bisekcji na `tau in (0, krok_s]` — zwraca lokalizacje i `tau*`.

    `przejscie_w_gore=True`: `g_lewy <= 0 < g_prawy` (pobudzenie); `False`: `g_lewy > 0 >=
    g_prawy` (przejscie powrotne). `proba(tau)` zwraca `h` po JEDNYM kroku integratora
    dlugosci `tau` z zapisanego stanu `t0` (albo `None`, gdy wielkosc w tym punkcie jest
    nieoceniana — wtedy lokalizacja konczy sie na biezacym przedziale, z jego szerokoscia).
    """
    lewy, prawy = 0.0, krok_s
    # Wartosci `h` na koncach przedzialu (publikowane) i ich WAGI metody Illinois (koniec
    # zachowany dwa razy z rzedu ma wage polowiona — bez tego regula falsi utyka na jednym
    # koncu); wagi nie sa wartosciami funkcji i nie wychodza poza te petle.
    h_a, h_b = g_lewy, g_prawy
    w_a, w_b = g_lewy, g_prawy
    iteracje = 0
    zachowany_lewy: bool | None = None
    bisekcja = False
    while prawy - lewy > tolerancja_s:
        szerokosc_przed = prawy - lewy
        if bisekcja or w_b == w_a:
            srodek = 0.5 * (lewy + prawy)
        else:
            srodek = prawy - w_b * (prawy - lewy) / (w_b - w_a)
        # Krok co najmniej POLOWY tolerancji od kazdego konca (jak w metodzie Brenta): gdy
        # jeden koniec lezy juz na pierwiastku (funkcja liniowa — jeden krok siecznej trafia
        # dokladnie), sieczna wskazuje ten sam koniec i przedzial nie zweza sie z drugiej
        # strony; proba o pol tolerancji w glab zamyka go w nastepnym kroku.
        srodek = min(max(srodek, lewy + 0.5 * tolerancja_s), prawy - 0.5 * tolerancja_s)
        if not (lewy < srodek < prawy):
            break  # przedzial ponizej rozdzielczosci osi czasu — wezszego nie ma
        h_c = proba(srodek)
        iteracje += 1
        if h_c is None:
            break
        po_przekroczeniu = (h_c > 0.0) if przejscie_w_gore else (h_c <= 0.0)
        if po_przekroczeniu:
            prawy, h_b, w_b = srodek, h_c, h_c
            if zachowany_lewy is True:
                w_a *= 0.5
            zachowany_lewy = True
        else:
            lewy, h_a, w_a = srodek, h_c, h_c
            if zachowany_lewy is False:
                w_b *= 0.5
            zachowany_lewy = False
        bisekcja = (prawy - lewy) > 0.5 * szerokosc_przed
    return (
        Lokalizacja(
            t_s=t0_s + prawy,
            szerokosc_s=prawy - lewy,
            iteracje=iteracje,
            g_przed=h_a,
            g_po=h_b,
        ),
        prawy,
    )


@dataclass(frozen=True)
class AkcjaOczekujaca:
    """Akcja dozoru czekajaca na wykonanie w chwili `t_s` (`t* + opoznienie`).

    `wpis` jest wpisem harmonogramu z JUZ przesunieta chwila; `lokalizacja` opisuje
    przekroczenie, ktore akcje wywolalo (trafia do `zdarzenia_wykonane`).
    """

    t_s: float
    dozor: int
    akcja: int
    wpis: WpisHarmonogramu
    lokalizacja: Lokalizacja


@dataclass(frozen=True)
class PrzekroczenieDozoru:
    """Przekroczenie progu przez DETEKTOR (dozor bez akcji) — rekord wyniku."""

    dozor: int
    lokalizacja: Lokalizacja


@dataclass(frozen=True)
class _Przejscie:
    dozor: int
    w_gore: bool
    lokalizacja: Lokalizacja


class NadzorDozorow:
    """Stan dozorow JEDNEGO biegu (obiekt lokalny `SilnikDynamiki.uruchom`, bez historii).

    Trzyma ostatnia ocene kazdego dozoru, uzbrojenie dozorow jednorazowych, akcje
    oczekujace i zapisy dla wyniku. Silnik wola go w trzech miejscach: po chwili
    poczatkowej (`start` — warunek spelniony w `t = 0+` pobudza w 0), po kazdym przyjetym
    kroku (`po_kroku` — przejscie ciagle z lokalizacja; zwraca chwile ladowania kroku,
    gdy akcja ma sie wykonac przed jego koncem) i po kazdej chwili zdarzen (`po_chwili` —
    przejscie skokowe w chwili zdarzenia, DOKLADNIE w tej chwili).
    """

    def __init__(
        self,
        dozory: tuple[Dozor, ...],
        szablony_akcji: tuple[tuple[WpisHarmonogramu, ...], ...],
        *,
        tolerancja_s: float,
        tolerancja_czasu_s: float,
        f_bazowa_hz: float,
    ) -> None:
        self.dozory = dozory
        self.szablony_akcji = szablony_akcji
        #: Tolerancja LOKALIZACJI (nastawa biegu) i epsilon POROWNANIA CZASU silnika — dwie
        #: rozne wielkosci: pierwsza zaweza przedzial przekroczenia, druga rozstrzyga, czy
        #: dwie chwile osi czasu sa ta sama chwila.
        self.tolerancja_s = tolerancja_s
        self.tolerancja_czasu_s = tolerancja_czasu_s
        self.f_bazowa_hz = f_bazowa_hz
        liczba = len(dozory)
        #: Ostatni ZNANY stan warunku (przed pierwsza ocena — falsz: warunek spelniony
        #: w `t = 0+` jest przejsciem i pobudza w 0).
        self.warunek: list[bool] = [False] * liczba
        #: `h` w ostatnim punkcie oceny (`None` — wielkosc nieoceniona w tym punkcie).
        self.h: list[float | None] = [None] * liczba
        #: Chwila ostatniego punktu oceny (wspolna dla wszystkich dozorow).
        self.t_oceny_s: float | None = None
        #: Chwila ostatniej oceny LICZBOWEJ danego dozoru — lewy koniec uczciwego
        #: przedzialu, gdy wielkosc byla przez chwile nieoceniana.
        self.t_znany_s: list[float] = [0.0] * liczba
        self.uzbrojony: list[bool] = [True] * liczba
        self.oczekujace: list[AkcjaOczekujaca] = []
        self.przekroczenia: list[PrzekroczenieDozoru] = []
        self.zapisy: list[dict[str, Any]] = []
        self._chwila_pobudzen_s: float | None = None
        self._pobudzone_w_chwili: set[int] = set()

    # -- ocena -------------------------------------------------------------

    def ocen(self, uklad: StanUkladu) -> list[float | None]:
        return [
            funkcja_warunku(dozor, uklad, f_bazowa_hz=self.f_bazowa_hz) for dozor in self.dozory
        ]

    def start(self, t_s: float, uklad: StanUkladu) -> None:
        """Ocena w `t = 0+`: warunek spelniony (wobec falszu przed biegiem) pobudza w `t_s`."""
        wartosci = self.ocen(uklad)
        przejscia = [
            _Przejscie(indeks, True, Lokalizacja(t_s, 0.0, 0, None, wartosc))
            for indeks, wartosc in enumerate(wartosci)
            if wartosc is not None and wartosc > 0.0
        ]
        self._zatwierdz(t_s, przejscia, wartosci)

    def po_chwili(self, t_s: float, uklad_po: StanUkladu) -> None:
        """Przejscie SKOKOWE w chwili zdarzenia: ocena w `P` wobec oceny w `L` tej chwili."""
        wartosci = self.ocen(uklad_po)
        przejscia: list[_Przejscie] = []
        for indeks, wartosc in enumerate(wartosci):
            if wartosc is None or (wartosc > 0.0) == self.warunek[indeks]:
                continue
            znany_w_chwili = self.t_oceny_s == t_s and self.h[indeks] is not None
            przejscia.append(
                _Przejscie(
                    indeks,
                    wartosc > 0.0,
                    Lokalizacja(
                        t_s=t_s,
                        szerokosc_s=0.0 if znany_w_chwili else t_s - self.t_znany_s[indeks],
                        iteracje=0,
                        g_przed=self.h[indeks] if znany_w_chwili else None,
                        g_po=wartosc,
                    ),
                )
            )
        self._zatwierdz(t_s, przejscia, wartosci)

    def po_kroku(
        self,
        t0_s: float,
        t1_s: float,
        uklad_konca: StanUkladu,
        proba: ProbaKroku,
    ) -> float | None:
        """Przejscia ciagle w przyjetym kroku `[t0, t1]` — zwraca chwile LADOWANIA kroku.

        `None` — krok zostaje przyjety w calosci; liczba — chwila, w ktorej wykonuje sie
        akcja pobudzonego dozoru, najpozniej `t1`: silnik skraca krok do niej (proba
        `proba(t_lad - t0)`) i wykonuje w niej akcje. Chwila ladowania jest wyznaczana
        iteracyjnie: kazde zawezenie konca kroku ocenia WSZYSTKIE dozory na nowo w punkcie
        ladowania (przejscie podwojne w kroku, niewidoczne na jego koncu, moze byc widoczne
        wczesniej), az najwczesniejsza chwila wykonania akcji przestanie sie przesuwac —
        kazda iteracja przesuwa ja scisle wczesniej, wiec petla jest skonczona.
        """
        eps = self.tolerancja_czasu_s
        znane_na_poczatku = self.t_oceny_s == t0_s
        pamiec: dict[int, tuple[bool, Lokalizacja]] = {}
        t_lad = t1_s
        uklad = uklad_konca
        while True:
            wartosci = self.ocen(uklad)
            przejscia: list[_Przejscie] = []
            for indeks, wartosc in enumerate(wartosci):
                if wartosc is None or (wartosc > 0.0) == self.warunek[indeks]:
                    continue
                w_gore = wartosc > 0.0
                h_lewy = self.h[indeks]
                zapamietana = pamiec.get(indeks)
                if (
                    zapamietana is not None
                    and zapamietana[0] == w_gore
                    and zapamietana[1].t_s <= t_lad
                ):
                    lokalizacja = zapamietana[1]
                elif znane_na_poczatku and h_lewy is not None:
                    dozor = self.dozory[indeks]

                    def proba_h(tau_proby: float, dozor: Dozor = dozor) -> float | None:
                        return funkcja_warunku(
                            dozor, proba(tau_proby), f_bazowa_hz=self.f_bazowa_hz
                        )

                    lokalizacja, _ = lokalizuj(
                        t0_s,
                        t_lad - t0_s,
                        h_lewy,
                        wartosc,
                        proba_h,
                        tolerancja_s=self.tolerancja_s,
                        przejscie_w_gore=w_gore,
                    )
                    pamiec[indeks] = (w_gore, lokalizacja)
                else:
                    # Lewy koniec nieoceniony (czestotliwosc w chwili zdarzenia albo przy
                    # jakosci NIEDOSTEPNA): bez lokalizacji — t* = koniec, a przedzial siega
                    # ostatniej oceny liczbowej (uczciwa szerokosc, nie tolerancja).
                    lokalizacja = Lokalizacja(
                        t_s=t_lad,
                        szerokosc_s=t_lad - self.t_znany_s[indeks],
                        iteracje=0,
                        g_przed=None,
                        g_po=wartosc,
                    )
                przejscia.append(_Przejscie(indeks, w_gore, lokalizacja))
            najwczesniej = min(
                (
                    przejscie.lokalizacja.t_s + self.dozory[przejscie.dozor].opoznienie_s
                    for przejscie in przejscia
                    if przejscie.w_gore
                    and self.uzbrojony[przejscie.dozor]
                    and self.dozory[przejscie.dozor].akcje
                ),
                default=None,
            )
            if najwczesniej is not None and najwczesniej < t_lad - eps:
                t_lad = najwczesniej
                uklad = proba(t_lad - t0_s)
                continue
            break
        self._zatwierdz(t_lad, przejscia, wartosci)
        if najwczesniej is not None and najwczesniej <= t_lad + eps:
            return t_lad
        return None

    # -- zapis -------------------------------------------------------------

    def _zatwierdz(
        self, t_s: float, przejscia: list[_Przejscie], wartosci: list[float | None]
    ) -> None:
        if self._chwila_pobudzen_s != t_s:
            self._chwila_pobudzen_s = t_s
            self._pobudzone_w_chwili = set()
        for przejscie in przejscia:
            indeks = przejscie.dozor
            dozor = self.dozory[indeks]
            lokalizacja = przejscie.lokalizacja
            if przejscie.w_gore:
                self.warunek[indeks] = True
                if not self.uzbrojony[indeks]:
                    continue
                if indeks in self._pobudzone_w_chwili:
                    raise OdmowaDynamiki(
                        KOD_PETLA_ZDARZEN_WARUNKOWYCH,
                        f"Dozor {dozor.ident!r} pobudzil się drugi raz w tej samej chwili "
                        f"t={t_s} s — akcje dozorow przelaczaja warunek w pętli bez uplywu "
                        "czasu; taki układ nie ma rozwiazania w dziedzinie czasu",
                        dozor=dozor.ident,
                        t_s=t_s,
                    )
                self._pobudzone_w_chwili.add(indeks)
                if dozor.jednorazowy:
                    self.uzbrojony[indeks] = False
                t_wykonania = lokalizacja.t_s + dozor.opoznienie_s
                self.zapisy.append(
                    {
                        "powod": "pobudzenie_dozoru",
                        "dozor": dozor.ident,
                        "t_zlokalizowany_s": lokalizacja.t_s,
                        "szerokosc_przedzialu_s": lokalizacja.szerokosc_s,
                        "iteracje": lokalizacja.iteracje,
                        "g_przed": lokalizacja.g_przed,
                        "g_po": lokalizacja.g_po,
                        "t_akcji_s": t_wykonania if dozor.akcje else None,
                    }
                )
                if not dozor.akcje:
                    self.przekroczenia.append(PrzekroczenieDozoru(indeks, lokalizacja))
                    continue
                for pozycja, szablon in enumerate(self.szablony_akcji[indeks]):
                    self.oczekujace.append(
                        AkcjaOczekujaca(
                            t_s=t_wykonania,
                            dozor=indeks,
                            akcja=pozycja,
                            wpis=replace(szablon, t_s=t_wykonania),
                            lokalizacja=lokalizacja,
                        )
                    )
                self.oczekujace.sort(key=lambda akcja: (akcja.t_s, akcja.dozor, akcja.akcja))
            else:
                self.warunek[indeks] = False
                if not dozor.kasowanie_przy_powrocie:
                    continue
                skasowane = [
                    akcja
                    for akcja in self.oczekujace
                    if akcja.dozor == indeks and akcja.t_s > lokalizacja.t_s
                ]
                if skasowane:
                    self.oczekujace = [akcja for akcja in self.oczekujace if akcja not in skasowane]
                    self.zapisy.append(
                        {
                            "powod": "kasowanie_akcji_dozoru",
                            "dozor": dozor.ident,
                            "t_powrotu_s": lokalizacja.t_s,
                            "szerokosc_przedzialu_s": lokalizacja.szerokosc_s,
                            "skasowane_t_s": sorted({akcja.t_s for akcja in skasowane}),
                        }
                    )
        self.h = list(wartosci)
        self.t_oceny_s = t_s
        for indeks, wartosc in enumerate(wartosci):
            if wartosc is not None:
                self.t_znany_s[indeks] = t_s

    # -- akcje oczekujace ----------------------------------------------------

    def nastepna_akcja_s(self, po_s: float, tolerancja_czasu_s: float) -> float | None:
        """Chwila najblizszej akcji oczekujacej POZNIEJSZEJ niz `po_s`."""
        for akcja in self.oczekujace:
            if akcja.t_s > po_s + tolerancja_czasu_s:
                return akcja.t_s
        return None

    def akcje_chwili(self, t_s: float, tolerancja_czasu_s: float) -> list[AkcjaOczekujaca]:
        """Akcje do wykonania w chwili `t_s` (prefiks listy — nie rownosc bitowa, jak wpisy
        planowane w `silnik._wpisy_chwili`)."""
        return [akcja for akcja in self.oczekujace if akcja.t_s <= t_s + tolerancja_czasu_s]

    def zdejmij(self, akcje: list[AkcjaOczekujaca]) -> None:
        self.oczekujace = [akcja for akcja in self.oczekujace if akcja not in akcje]


__all__ = [
    "AKCJE_DOZORU",
    "AkcjaOczekujaca",
    "NadzorDozorow",
    "PrzekroczenieDozoru",
    "CzestotliwoscElektrycznaWezla",
    "Dozor",
    "KierunekDozoru",
    "Lokalizacja",
    "ModulNapieciaWezla",
    "ModulPraduZacisku",
    "MocUrzadzenia",
    "SkladowaMocy",
    "StanUkladu",
    "StanUrzadzenia",
    "StronaOceny",
    "WielkoscDozoru",
    "ZaciskGalezi",
    "funkcja_warunku",
    "lokalizuj",
    "wartosc_wielkosci",
]
