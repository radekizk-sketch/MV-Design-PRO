"""Re-inicjalizacja po zmianie topologii — operacja pierwszej klasy, z diagnostyką.

KOD BADAWCZY — patrz `backend/research/README.md`. Nie jest dowodem regulacyjnym.

DŁUG, KTÓRY TEN MODUŁ ZAMYKA (raport §11.3: „re-inicjalizacja po topologii
zwarciowej, ``max Δx0 = 1,09421789``"). Jedyną drogą do punktu startowego było
``SilnikRMS.inicjalizuj``, czyli ROZPŁYW USTALONY. Wywołanie go na topologii
zwarciowej liczy NOWY punkt pracy całego układu i nadpisuje stany dynamiczne —
stąd zmierzone ``Δx0 ≈ 1,09``. To nie jest re-inicjalizacja tego samego biegu,
tylko zaczęcie innego zagadnienia i nazwanie go tym samym.

FIZYKA, KTÓRA TU ROZSTRZYGA. Przy idealnym przełączeniu (zwarcie, zdjęcie
zwarcia, wyłączenie gałęzi) zmienne RÓŻNICZKOWE są CIĄGŁE:

* strumień skojarzony nie może skoczyć — skok wymagałby nieskończonego napięcia
  (``u = dψ/dt``);
* kąt i prędkość wirnika nie mogą skoczyć — skok wymagałby nieskończonego
  momentu (``J dω/dt = M``);
* zapas energii (SOC) nie może skoczyć — skok wymagałby nieskończonej mocy.

Skacze WYŁĄCZNIE algebra: napięcia węzłowe i prądy. Poprawna re-inicjalizacja
jest więc dokładnie tym: **stany różniczkowe TRZYMANE, algebra ROZWIĄZANA OD
NOWA na nowej topologii**. Nie „policzona jeszcze raz od rozpływu".

CO WOLNO UZGODNIĆ. Wyłącznie stan, który po zdarzeniu leży poza ZADEKLAROWANYM
przez model ogranicznikiem stanu (`OgraniczenieStanu`) — bo ogranicznik jest
częścią modelu urządzenia, a nie poprawką numeryczną. Każde takie uzgodnienie
jest zapisane z nazwą stanu, wartością przed i po oraz granicą, o którą zostało
oparte. Lista powodów jest ZAMKNIĘTA: powód spoza `PowodUzgodnienia` nie ma jak
powstać, bo uzgodnienia buduje wyłącznie ten moduł.

BRAK UKRYTEJ HISTORII. `reinicjalizuj` jest FUNKCJĄ ``(topologia, x)`` — nie
czyta ani nie zostawia niczego, co zależałoby od tego, jakimi zdarzeniami układ
do tego punktu doszedł. Punkt startowy Newtona jest wyprowadzany z argumentów
(``szyny sztywne`` + jedynki), a nie z napięć poprzedniego biegu; to jest ta sama
zasada, którą `rozplyw_ustalony` stosuje do ``_v_startowe``. Własność „ta sama
para (topologia, x) daje ten sam wynik niezależnie od drogi" jest PRZYPIĘTA
testem, a nie zadeklarowana tutaj.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING, Any, Protocol

import numpy as np
from numpy.typing import NDArray

from .calkowanie import OgraniczenieStanu
from .siec import TopologiaSieci
from .skonczonosc import wymagaj_skonczonosci

if TYPE_CHECKING:  # pragma: no cover - tylko dla typów
    from .silnik import SilnikRMS


class ReinicjalizacjaNieudanaError(RuntimeError):
    """Algebra nowej topologii nie ma rozwiązania dla TRZYMANEGO stanu.

    To NIE jest sygnał do zresetowania stanów. Sieć bez rozwiązania przy
    fizycznie poprawnym stanie oznacza albo topologię odciętą od źródła, albo
    model urządzenia bez punktu pracy w tych warunkach — i jedno, i drugie jest
    informacją, nie usterką do zamaskowania.
    """


class PowodUzgodnienia(StrEnum):
    """ZAMKNIĘTY zbiór powodów, dla których stan różniczkowy wolno zmienić.

    Jeden element. To nie jest niedopatrzenie: każdy inny powód, jaki przychodzi
    do głowy (urządzenie odłączone, wyspa bez źródła, „stan wygląda dziwnie"),
    jest fizycznie NIEUPRAWNIONY — odłączona maszyna nadal się kręci, a wyspa bez
    źródła nadal ma strumień w uzwojeniach. Dopisanie tu pozycji wymaga podania
    równania, które wymusza skok.
    """

    #: Trzymana wartość leży poza granicą ZADEKLAROWANĄ przez model urządzenia.
    #: Granica jest częścią modelu (`OgraniczenieStanu` niesie `znaczenie`
    #: fizyczne), więc rzut na zbiór dopuszczalny jest zastosowaniem modelu, a
    #: nie poprawianiem liczby.
    OGRANICZNIK_STANU = "ogranicznik_stanu"


@dataclass(frozen=True)
class Uzgodnienie:
    """Jedna zmiana stanu różniczkowego przy re-inicjalizacji — z pełnym śladem."""

    indeks: int
    nazwa: str
    powod: PowodUzgodnienia
    przed: float
    po: float
    granica: float
    znaczenie: str

    @property
    def skok(self) -> float:
        return abs(self.po - self.przed)


@dataclass(frozen=True)
class DiagnostykaReinicjalizacji:
    """Wszystkie wielkości wymagane przez plan napraw §1 — mierzone, nie deklarowane."""

    #: ``max |x_po - x_przed|`` po stanach różniczkowych.
    delta_x_max: float
    #: Per stan, posortowane malejąco — żeby było widać, KTÓRY stan się ruszył.
    delta_x_per_stan: tuple[tuple[str, float], ...]
    #: ``max |V_po - V_przed|`` po szynach (moduł liczby zespolonej).
    delta_y_max: float
    delta_y_per_szyna: tuple[tuple[str, float], ...]
    #: ``||f(x0, y0)||_inf`` — stany elektromechaniczne (zasobowe osobno, jak w silniku).
    norma_f: float
    #: ``||f_zasobowe(x0, y0)||_inf`` — dryf zapasu energii, raportowany OSOBNO.
    norma_f_zasobowa: float
    #: Residuum ZGŁOSZONE przez solver sieci.
    norma_g: float
    #: Residuum KCL policzone NIEZALEŻNIE od solvera: ``||I_wstrzyk - Ybus·V||_inf``.
    #: Osobna liczba właśnie dlatego, że „solver powiedział, że zbiegł" nie jest
    #: sprawdzeniem solvera.
    residuum_kcl: float
    #: ``max |V_szyny_sztywnej - V_zadane|`` — czy rozwiązanie honoruje szyny sztywne.
    residuum_napiecia_szyn: float
    uzgodnienia: tuple[Uzgodnienie, ...]
    iteracje_sieci: int

    def jako_slownik(self) -> dict[str, Any]:
        return {
            "delta_x_max": self.delta_x_max,
            "delta_x_per_stan": [list(p) for p in self.delta_x_per_stan],
            "delta_y_max": self.delta_y_max,
            "delta_y_per_szyna": [list(p) for p in self.delta_y_per_szyna],
            "norma_f": self.norma_f,
            "norma_f_zasobowa": self.norma_f_zasobowa,
            "norma_g": self.norma_g,
            "residuum_kcl": self.residuum_kcl,
            "residuum_napiecia_szyn": self.residuum_napiecia_szyn,
            "iteracje_sieci": self.iteracje_sieci,
            "uzgodnienia": [
                {
                    "nazwa": u.nazwa,
                    "powod": str(u.powod),
                    "przed": u.przed,
                    "po": u.po,
                    "granica": u.granica,
                    "skok": u.skok,
                    "znaczenie": u.znaczenie,
                }
                for u in self.uzgodnienia
            ],
        }


@dataclass(frozen=True)
class WynikReinicjalizacji:
    """Nowy spójny punkt ``(x, V)`` na nowej topologii + pełna diagnostyka."""

    x: NDArray[np.float64]
    v: NDArray[np.complex128]
    topologia: TopologiaSieci
    diagnostyka: DiagnostykaReinicjalizacji


class _SilnikDoReinicjalizacji(Protocol):  # pragma: no cover - kontrakt typów
    model: Any
    uklad: Any
    solver_sieci: Any

    def _wstrzykniecia(self, x: NDArray[np.float64]) -> Any: ...
    def _etykiety_stanow(self) -> tuple[str, ...]: ...
    def _zbierz_ograniczniki(self) -> tuple[OgraniczenieStanu, ...]: ...


def punkt_startowy_algebry(topologia: TopologiaSieci) -> NDArray[np.complex128]:
    """Ziarno Newtona wyprowadzone WYŁĄCZNIE z topologii.

    Świadomie NIE bierzemy napięć sprzed zdarzenia. Ziarno zależne od historii
    dawałoby wynik zależny od historii przy wielu rozwiązaniach algebry (a sieć z
    ogranicznikiem prądu falownika je ma), czyli dokładnie ukrytą historię, której
    ten moduł zakazuje. Cena — więcej iteracji Newtona — jest mierzona i
    raportowana w `DiagnostykaReinicjalizacji.iteracje_sieci`.
    """
    v = np.ones(len(topologia.szyny), dtype=np.complex128)
    idx = topologia.indeks
    for szyna, v_zadane in topologia.szyny_sztywne.items():
        v[idx[szyna]] = v_zadane
    return v


def residuum_kcl(
    topologia: TopologiaSieci,
    wstrzykniecia: NDArray[np.complex128],
    v: NDArray[np.complex128],
) -> float:
    """``||I_wstrzyk - Ybus·V||_inf`` na szynach NIESZTYWNYCH.

    Szyny sztywne są wyłączone, bo ich równanie węzłowe zostało zastąpione przez
    ``V = V_zadane`` — bilans prądu domyka tam system nadrzędny, którego ta sieć
    nie modeluje. Liczenie ich do KCL dawałoby residuum równe prądowi zasilania,
    czyli miarę wielkości układu, nie jego niespójności.
    """
    ybus = topologia.zbuduj_ybus()
    niezgodnosc = wstrzykniecia - ybus @ v
    idx = topologia.indeks
    maska = np.ones(len(topologia.szyny), dtype=bool)
    for szyna in topologia.szyny_sztywne:
        maska[idx[szyna]] = False
    if not maska.any():
        return 0.0
    return float(np.max(np.abs(niezgodnosc[maska])))


def residuum_szyn_sztywnych(topologia: TopologiaSieci, v: NDArray[np.complex128]) -> float:
    """``max |V - V_zadane|`` po szynach sztywnych."""
    idx = topologia.indeks
    if not topologia.szyny_sztywne:
        return 0.0
    return max(
        float(abs(complex(v[idx[szyna]]) - v_zadane))
        for szyna, v_zadane in topologia.szyny_sztywne.items()
    )


def _uzgodnij_ograniczniki(
    x: NDArray[np.float64],
    ograniczniki: tuple[OgraniczenieStanu, ...],
    etykiety: tuple[str, ...],
) -> tuple[NDArray[np.float64], tuple[Uzgodnienie, ...]]:
    """Rzut stanu na zbiór dopuszczalny modeli — z zapisem KAŻDEGO rzutu."""
    uzgodniony = x.copy()
    zapis: list[Uzgodnienie] = []
    for ogr in ograniczniki:
        wartosc = float(uzgodniony[ogr.indeks])
        if wartosc < ogr.dol:
            granica = ogr.dol
        elif wartosc > ogr.gora:
            granica = ogr.gora
        else:
            continue
        uzgodniony[ogr.indeks] = granica
        zapis.append(
            Uzgodnienie(
                indeks=ogr.indeks,
                nazwa=etykiety[ogr.indeks] if ogr.indeks < len(etykiety) else ogr.nazwa,
                powod=PowodUzgodnienia.OGRANICZNIK_STANU,
                przed=wartosc,
                po=granica,
                granica=granica,
                znaczenie=ogr.znaczenie,
            )
        )
    return uzgodniony, tuple(zapis)


def reinicjalizuj(
    silnik: SilnikRMS,
    *,
    topologia_docelowa: TopologiaSieci,
    x_przed: NDArray[np.float64],
) -> WynikReinicjalizacji:
    """Spójny punkt startowy na NOWEJ topologii przy TRZYMANYM stanie różniczkowym.

    Kolejność jest dokładnie ta z planu §1 i nie wolno jej zamienić:

    1. stan sprzed zdarzenia (argument, nie odczyt z silnika),
    2. mutacja topologii (argument — wykonana przez zdarzenie),
    3. uzgodnienie stanu WYŁĄCZNIE wobec zadeklarowanych ograniczników,
    4. rozwiązanie algebry ``g(x, V) = 0`` na nowej topologii,
    5. weryfikacja residuów: KCL liczone niezależnie, szyny sztywne, ``f``.

    Silnik jest po wywołaniu USTAWIONY na topologię docelową — ta funkcja nie
    udaje, że nic nie zmieniła. Zwracany wynik niesie komplet liczb, więc
    wywołujący nie musi (i nie powinien) dopytywać silnika o stan wewnętrzny.
    """
    wymagaj_skonczonosci(x_przed, co="stan przed re-inicjalizacją", gdzie="wejście")

    etykiety = silnik._etykiety_stanow()
    poprzednia_topologia = silnik.model.topologia

    # Krok 3 — uzgodnienie WYŁĄCZNIE wobec ograniczników zadeklarowanych przez
    # modele. Ograniczniki zbieramy na topologii docelowej, bo urządzenie może
    # deklarować granicę zależną od swojej konfiguracji; zbiór stanów i ich
    # kolejność od topologii nie zależą.
    silnik.model.topologia = topologia_docelowa
    silnik.solver_sieci.ustaw_topologie(topologia_docelowa)
    udane = False
    try:
        ograniczniki = silnik._zbierz_ograniczniki()
        x_po, uzgodnienia = _uzgodnij_ograniczniki(x_przed, ograniczniki, etykiety)

        # Krok 4 — algebra od nowa, z ziarnem NIEZALEŻNYM od historii.
        funkcja_wstrzyknięć = silnik._wstrzykniecia(x_po)
        try:
            rozwiazanie = silnik.solver_sieci.rozwiaz(
                funkcja_wstrzyknięć, punkt_startowy_algebry(topologia_docelowa)
            )
        except Exception as blad:  # noqa: BLE001 — klasa błędu solvera jest różna
            raise ReinicjalizacjaNieudanaError(
                "Algebra sieci nie ma rozwiązania dla trzymanego stanu na topologii "
                f"docelowej: {type(blad).__name__}: {blad}"
            ) from blad
        v_po = rozwiazanie.napiecia
        wymagaj_skonczonosci(v_po, co="napięcia po re-inicjalizacji", gdzie="algebra sieci")

        # Krok 5 — residua. KCL liczone NIEZALEŻNIE od solvera (patrz docstring
        # `residuum_kcl`): „solver zgłosił zbieżność" nie jest sprawdzeniem solvera.
        kcl = residuum_kcl(topologia_docelowa, funkcja_wstrzyknięć(v_po), v_po)
        residuum_szyn = residuum_szyn_sztywnych(topologia_docelowa, v_po)

        # `norma_pochodnej` liczy algebrę po swojemu; zatwierdzamy napięcia, żeby
        # startowała z rozwiązania, które przed chwilą policzyliśmy.
        silnik.zatwierdz_punkt_pracy(v_po)
        norma_f = silnik.norma_pochodnej(x_po)
        norma_f_zasobowa = silnik.norma_pochodnej_zasobowej(x_po)
        udane = True
    finally:
        # Silnik ZOSTAJE na topologii docelowej, gdy operacja się udała — to jest
        # cel wywołania. Gdy cokolwiek wyżej rzuciło, wycofujemy topologię do
        # stanu sprzed próby: nieudana re-inicjalizacja nie może zostawić silnika
        # liczącego na sieci, której nikt nie przyjął. Operacja meldująca błąd
        # nie zostawia żadnego skutku.
        if not udane:
            silnik.model.topologia = poprzednia_topologia
            silnik.solver_sieci.ustaw_topologie(poprzednia_topologia)

    delta_x = np.abs(x_po - x_przed)
    delta_v = np.abs(v_po - _napiecia_odniesienia(silnik, poprzednia_topologia, topologia_docelowa))

    diagnostyka = DiagnostykaReinicjalizacji(
        delta_x_max=float(np.max(delta_x)) if delta_x.size else 0.0,
        delta_x_per_stan=_posortowane(etykiety, delta_x),
        delta_y_max=float(np.max(delta_v)) if delta_v.size else 0.0,
        delta_y_per_szyna=_posortowane(topologia_docelowa.szyny, delta_v),
        norma_f=norma_f,
        norma_f_zasobowa=norma_f_zasobowa,
        norma_g=float(rozwiazanie.residuum),
        residuum_kcl=kcl,
        residuum_napiecia_szyn=residuum_szyn,
        uzgodnienia=uzgodnienia,
        iteracje_sieci=int(rozwiazanie.iteracje),
    )
    return WynikReinicjalizacji(
        x=x_po, v=v_po, topologia=topologia_docelowa, diagnostyka=diagnostyka
    )


def _napiecia_odniesienia(
    silnik: SilnikRMS,
    poprzednia: TopologiaSieci,
    docelowa: TopologiaSieci,
) -> NDArray[np.complex128]:
    """Napięcia sprzed zdarzenia do policzenia ``Δy`` — albo jawny brak.

    Gdy zbiór szyn się zmienił, ``Δy`` nie ma sensu jako różnica wektorów i
    zwracamy wektor zerowy o rozmiarze docelowym; sama diagnostyka nadal niesie
    residua, które od porównania z przeszłością nie zależą. Zgadywanie
    odpowiedniości szyn byłoby wymyślaniem danych.
    """
    poprzednie = getattr(silnik, "_v_zatwierdzone", None)
    if poprzednie is None or poprzednia.szyny != docelowa.szyny:
        return np.zeros(len(docelowa.szyny), dtype=np.complex128)
    return np.asarray(poprzednie, dtype=np.complex128)


def _posortowane(
    etykiety: tuple[str, ...], wartosci: NDArray[np.float64]
) -> tuple[tuple[str, float], ...]:
    pary = [
        (etykiety[i] if i < len(etykiety) else f"[{i}]", float(wartosci[i]))
        for i in range(len(wartosci))
    ]
    pary.sort(key=lambda p: (-p[1], p[0]))
    return tuple(pary)


@dataclass(frozen=True)
class KryteriumReinicjalizacji:
    """Progi odbioru re-inicjalizacji — WYPROWADZONE, nie dobrane pod wynik.

    ``maks_residuum_kcl`` i ``maks_residuum_szyn`` są o rząd luźniejsze od
    tolerancji Newtona sieci (1e-10), czyli mieszczą jego własny błąd zbieżności,
    a nie tolerują niespójności fizycznej. Obowiązują ZAWSZE — spójność algebry
    nie zależy od tego, co zrobiło zdarzenie.

    KOREKTA WŁASNA (pomiar, nie przewidywanie). Pierwsza wersja tego kryterium
    bramkowała także ``||f(x0,y0)||`` progiem równowagi 1e-6 i padała na zwarciu
    na zaciskach maszyny z wartością 6,250e-02. To NIE był defekt kodu, tylko
    błąd w kryterium: po przyłożeniu zwarcia układ NIE JEST w równowadze i być
    nie może — moc elektryczna spada do zera, a mechaniczna zostaje, więc wirnik
    przyspiesza. Zmierzone ``6,2496e-02`` zgadza się z postacią zamkniętą
    ``dω/dt = (P_m - P_e)/(2H) = 0,5/8 = 0,0625``. Żądanie równowagi po zwarciu
    było żądaniem, żeby zwarcie nic nie robiło.

    Dlatego ``||f||`` jest MIERZONE zawsze, a BRAMKOWANE tylko wtedy, gdy
    wywołujący jawnie tego zażąda (`wymagaj_rownowagi=True`) — czyli dla
    przełączenia, po którym równowaga ma prawo się utrzymać: ta sama topologia,
    powrót do topologii wyjściowej, zdjęcie zwarcia do stanu sprzed niego.
    """

    maks_residuum_kcl: float = 1.0e-9
    maks_residuum_szyn: float = 1.0e-9
    #: Próg równowagi — ten sam co domyślna `tolerancja_rownowagi` silnika, bo
    #: pyta o to samo. Stosowany WYŁĄCZNIE przy `wymagaj_rownowagi=True`.
    maks_norma_f: float = 1.0e-6
    wymagaj_rownowagi: bool = False

    def naruszenia(self, diagnostyka: DiagnostykaReinicjalizacji) -> tuple[str, ...]:
        braki: list[str] = []
        if not math.isfinite(diagnostyka.norma_f):
            braki.append(f"||f(x0,y0)|| = {diagnostyka.norma_f} — wartość nieskończona")
        elif self.wymagaj_rownowagi and diagnostyka.norma_f > self.maks_norma_f:
            braki.append(
                f"||f(x0,y0)|| = {diagnostyka.norma_f:.3e} > {self.maks_norma_f:.1e} "
                "przy jawnie zażądanej równowadze"
            )
        if (
            not math.isfinite(diagnostyka.residuum_kcl)
            or diagnostyka.residuum_kcl > self.maks_residuum_kcl
        ):
            braki.append(
                f"residuum KCL = {diagnostyka.residuum_kcl:.3e} > {self.maks_residuum_kcl:.1e}"
            )
        if (
            not math.isfinite(diagnostyka.residuum_napiecia_szyn)
            or diagnostyka.residuum_napiecia_szyn > self.maks_residuum_szyn
        ):
            braki.append(
                f"residuum szyn sztywnych = {diagnostyka.residuum_napiecia_szyn:.3e} > "
                f"{self.maks_residuum_szyn:.1e}"
            )
        return tuple(braki)
