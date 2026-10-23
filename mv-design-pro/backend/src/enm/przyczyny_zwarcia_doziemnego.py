"""Przyczyna braku wyniku zwarcia doziemnego w węźle — JEDNO źródło prawdy dla wszystkich
konsumentów sieci składowej zerowej (karta GPZ-H5-SKLADOWA-ZEROWA).

Do tej karty sieć zerowa (``enm.mapping.zbuduj_siec_zerowa``) zwracała jeden zbiór węzłów
„bez drogi zerowej”, zlewając w nim dwie różne sytuacje: BRAK DANYCH (pole zespołu
uziemiającego bez danych zespołu, transformator bez grupy połączeń, kabel bez r0/x0) i
FIZYCZNY BRAK DROGI (uzwojenie w trójkąt, punkt neutralny izolowany). Projektant dostawał to
samo zdanie w obu przypadkach; sieć kompensowana (dławik) była liczona jak sieć uziemiona
przez impedancję, a sieć izolowana z pojemnościami doziemnymi dawała „I″k1” równe prądowi
pojemnościowemu — choć doziemienie w obu nie jest zwarciem w rozumieniu IEC 60909-0.

Klasyfikacja działa na SPÓJNEJ SKŁADOWEJ sieci zerowej (węzły połączone gałęziami zerowymi:
linie i kable z r0/x0, transformatory o połączeniu szeregowym YNyn). Każdy element wnosi do
węzła wpis jednego rodzaju (``RodzajWpisu``). Rozstrzygnięcie odpowiada na jedno z dwóch
pytań konsumenta (``Wymaganie``): czy istnieje prąd zwarciowy jednofazowy I″k1
(``zwarcie_1f``) albo czy impedancja zerowa jest obliczalna (``impedancja_z0`` — zwarcie
dwufazowe z ziemią, kotwica SN domeny nN). Reguły w kolejności:

0. brakuje danych elementu, który na pewno uziemia sieć (pole zespołu uziemiającego bez
   danych zespołu) → ``BRAK_DANYCH`` — także przy innym uziemieniu w tej części sieci;
1. jest uziemiony punkt neutralny (bezpośrednio albo przez rezystor/impedancję, źródło z Z0)
   → liczone (brak przyczyny);
2. ``zwarcie_1f``: jest dławik (sieć kompensowana) → ``NIE_DOTYCZY`` (IEC 60909-0:2016
   rozdz. 1);
3. któremuś elementowi brakuje danych → ``BRAK_DANYCH`` z listą elementów i pól;
4. blok Y0 osobliwy — w modelu nie ma żadnego bocznika do ziemi (ani uziemienia, ani
   pojemności doziemnej) → ``BRAK_DROGI_FIZYCZNEJ`` z elementami przerywającymi drogę
   (trójkąt, punkt izolowany): impedancja zerowa jest nieskończona;
5. ``zwarcie_1f``: droga wyłącznie przez pojemności doziemne — sieć izolowana →
   ``NIE_DOTYCZY`` (prąd pojemnościowy nie jest prądem zwarciowym I″k1);
   ``impedancja_z0``: liczone (Z0 dławika albo pojemności doziemnych).

Moduł nie liczy fizyki: rozstrzyga z wpisów elementów i z rangi bloku macierzy Y0
(``matrix_rank`` — jawne rangowanie, jak dotąd w ``enm.mapping``).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

import numpy as np

#: Rodzaj wpisu elementu do węzła sieci zerowej (wejście klasyfikacji).
#: ``brak_danych_uziemienia`` — brak danych elementu, który NA PEWNO uziemia sieć (pole zespołu
#: uziemiającego bez danych zespołu albo z danymi niepełnymi): bocznik istnieje fizycznie, nie
#: znamy jego impedancji, więc wynik składowej byłby fikcją nawet przy innym uziemieniu.
#: ``brak_danych`` — brak danych elementu, który MOŻE być drogą (kabel bez r0/x0,
#: transformator bez grupy połączeń, równoważnik bez Z0): rozstrzyga tylko, gdy składowa nie
#: ma innego uziemienia.
RodzajWpisu = Literal[
    "uziemienie", "kompensacja", "pojemnosc", "brak_danych", "brak_danych_uziemienia", "przerwa"
]

#: Status przyczyny braku wyniku zwarcia doziemnego (status maszynowy — zawsze z opisem).
StatusPrzyczyny = Literal["BRAK_DANYCH", "BRAK_DROGI_FIZYCZNEJ", "NIE_DOTYCZY"]

#: Czego potrzebuje konsument sieci zerowej (jedno rozstrzygnięcie, dwa pytania):
#: ``zwarcie_1f`` — prąd I″k1: impedancja zerowa obliczalna ORAZ sieć z punktem neutralnym
#: uziemionym bezpośrednio albo przez impedancję (definicja zwarcia jednofazowego z ziemią
#: IEC 60909-0:2016 rozdz. 1 i 3 — w sieci kompensowanej i izolowanej ``NIE_DOTYCZY``);
#: ``impedancja_z0`` — wyłącznie obliczalna impedancja zerowa: zwarcie dwufazowe z ziemią
#: (prądy fazowe i I″kE2E określone także w sieci kompensowanej i izolowanej, z impedancją
#: zerową dławika albo pojemności doziemnych) i kotwica SN domeny nN (Z0 sieci SN).
Wymaganie = Literal["zwarcie_1f", "impedancja_z0"]
WYMAGANIA: tuple[Wymaganie, ...] = ("zwarcie_1f", "impedancja_z0")

#: Kody ``non_physical_reason`` wiersza zwarcia — jeden kod na status.
POWOD_BRAK_DANYCH_SKLADOWEJ_ZEROWEJ = "fault_node_zero_sequence_data_missing"
POWOD_WEZEL_BEZ_DROGI_ZEROWEJ = "fault_node_without_zero_sequence_path"
POWOD_DOZIEMIENIE_NIE_JEST_ZWARCIEM = "earth_fault_not_short_circuit"

KOD_POWODU: dict[str, str] = {
    "BRAK_DANYCH": POWOD_BRAK_DANYCH_SKLADOWEJ_ZEROWEJ,
    "BRAK_DROGI_FIZYCZNEJ": POWOD_WEZEL_BEZ_DROGI_ZEROWEJ,
    "NIE_DOTYCZY": POWOD_DOZIEMIENIE_NIE_JEST_ZWARCIEM,
}

ETYKIETA_STATUSU_PL: dict[str, str] = {
    "BRAK_DANYCH": "brak danych składowej zerowej",
    "BRAK_DROGI_FIZYCZNEJ": "fizyczny brak drogi prądu zerowego do ziemi",
    "NIE_DOTYCZY": (
        "nie dotyczy — doziemienie w sieci kompensowanej albo izolowanej nie jest zwarciem"
    ),
}

PODSTAWA_BRAK_DANYCH = (
    "IEC 60909-0:2016 rozdz. 6 — impedancje składowej zerowej elementów sieci są danymi "
    "wejściowymi obliczenia; brak danej nie jest ani uziemieniem, ani jego brakiem"
)
PODSTAWA_BRAK_DROGI = (
    "IEC 60909-0:2016 rozdz. 1 i 3 — zwarcie doziemne wymaga drogi prądu składowej zerowej "
    "do ziemi; część sieci bez żadnego bocznika do ziemi (punkt neutralny nieuziemiony, brak "
    "pojemności doziemnej w modelu) ma nieskończoną impedancję zerową"
)
PODSTAWA_NIE_DOTYCZY = (
    "IEC 60909-0:2016 rozdz. 1 i 3 — zwarcie jednofazowe z ziemią definiuje się w sieci "
    "z punktem neutralnym uziemionym bezpośrednio albo przez impedancję; doziemienie w sieci "
    "kompensowanej (dławik) i izolowanej nie jest zwarciem w rozumieniu normy — prąd doziemny "
    "takiej sieci wynika z pojemności doziemnej (i odstrojenia dławika), nie z metody "
    "zwarciowej"
)


@dataclass(frozen=True)
class ElementPrzyczyny:
    """Element, który rozstrzyga przyczynę: brakujące dane albo przerwa drogi prądu zerowego."""

    ref_id: str
    nazwa: str
    opis_pl: str
    brakujace_pola: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        wynik: dict[str, Any] = {
            "ref_id": self.ref_id,
            "nazwa": self.nazwa,
            "opis_pl": self.opis_pl,
        }
        if self.brakujace_pola:
            wynik["brakujace_pola"] = list(self.brakujace_pola)
        return wynik


@dataclass(frozen=True)
class WpisSieciZerowej:
    """Wkład jednego elementu do węzła sieci zerowej (wejście klasyfikacji)."""

    rodzaj: RodzajWpisu
    element: ElementPrzyczyny


@dataclass(frozen=True)
class PrzyczynaBrakuZwarciaDoziemnego:
    """Dlaczego zwarcie doziemne (1F, 2F+Z) w węźle nie ma wyniku liczbowego.

    ``status`` — status maszynowy; ``opis_pl`` — wyjaśnienie dla projektanta (co oceniono,
    jaka przyczyna, które elementy); ``podstawa`` — podstawa normowa; ``elementy`` — elementy
    rozstrzygające (z brakującymi polami przy ``BRAK_DANYCH``).
    """

    status: StatusPrzyczyny
    opis_pl: str
    podstawa: str
    elementy: tuple[ElementPrzyczyny, ...] = field(default=())

    @property
    def powod(self) -> str:
        """Kod ``non_physical_reason`` wiersza zwarcia."""
        return KOD_POWODU[self.status]

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "status_pl": ETYKIETA_STATUSU_PL[self.status],
            "kod": self.powod,
            "opis_pl": self.opis_pl,
            "podstawa": self.podstawa,
            "elementy": [element.to_dict() for element in self.elementy],
        }


#: Ile elementów wymienia zdanie opisu (pełna lista zostaje w ``elementy``) — sieć SN z wieloma
#: transformatorami Dyn ma tyle przerw drogi, ile uzwojeń w trójkąt po stronie SN.
LIMIT_ELEMENTOW_W_OPISIE = 5


def _lista_elementow(elementy: Sequence[ElementPrzyczyny]) -> str:
    tekst = "; ".join(f"{e.nazwa} — {e.opis_pl}" for e in elementy[:LIMIT_ELEMENTOW_W_OPISIE])
    reszta = len(elementy) - LIMIT_ELEMENTOW_W_OPISIE
    if reszta > 0:
        tekst += f"; oraz {reszta} dalszych elementów (pełna lista w wyjaśnieniu)"
    return tekst


def _unikalne(wpisy: Sequence[WpisSieciZerowej], rodzaj: str) -> tuple[ElementPrzyczyny, ...]:
    widziane: dict[tuple[str, str], ElementPrzyczyny] = {}
    for wpis in wpisy:
        if wpis.rodzaj == rodzaj:
            widziane.setdefault((wpis.element.ref_id, wpis.element.opis_pl), wpis.element)
    return tuple(widziane[k] for k in sorted(widziane))


def _brak_danych(wpisy: Sequence[WpisSieciZerowej]) -> PrzyczynaBrakuZwarciaDoziemnego:
    braki = tuple(
        sorted(
            set(_unikalne(wpisy, "brak_danych_uziemienia")) | set(_unikalne(wpisy, "brak_danych")),
            key=lambda e: (e.ref_id, e.opis_pl),
        )
    )
    return PrzyczynaBrakuZwarciaDoziemnego(
        status="BRAK_DANYCH",
        opis_pl=(
            "brak danych składowej zerowej elementów na drodze do ziemi ("
            f"{_lista_elementow(braki)}). Zwarcie doziemne nie jest liczone, dopóki tych "
            "danych nie uzupełnisz — brak danej nie jest ani uziemieniem, ani jego brakiem."
        ),
        podstawa=PODSTAWA_BRAK_DANYCH,
        elementy=braki,
    )


def _nie_dotyczy_kompensowana(wpisy: Sequence[WpisSieciZerowej]) -> PrzyczynaBrakuZwarciaDoziemnego:
    dlawiki = _unikalne(wpisy, "kompensacja")
    return PrzyczynaBrakuZwarciaDoziemnego(
        status="NIE_DOTYCZY",
        opis_pl=(
            "sieć kompensowana — punkt neutralny uziemiony przez dławik ("
            f"{_lista_elementow(dlawiki)}). Doziemienie w sieci kompensowanej nie jest "
            "zwarciem w rozumieniu IEC 60909-0, prąd zwarciowy jednofazowy I″k1 nie jest "
            "określony; prąd doziemny takiej sieci wynika z pojemności doziemnej "
            "i odstrojenia dławika. Zwarcie dwufazowe z ziemią jest liczone z impedancją "
            "zerową sieci (z dławikiem)."
        ),
        podstawa=PODSTAWA_NIE_DOTYCZY,
        elementy=dlawiki,
    )


def _nie_dotyczy_izolowana(wpisy: Sequence[WpisSieciZerowej]) -> PrzyczynaBrakuZwarciaDoziemnego:
    przerwy = _unikalne(wpisy, "przerwa")
    pojemnosci = _unikalne(wpisy, "pojemnosc")
    opis = "sieć izolowana — żaden punkt neutralny tej części sieci nie jest uziemiony"
    if przerwy:
        opis += f" ({_lista_elementow(przerwy)})"
    opis += (
        ". Prąd doziemny zamyka się wyłącznie przez pojemności doziemne ("
        + ", ".join(e.nazwa for e in pojemnosci)
        + ") i jest prądem pojemnościowym sieci izolowanej, nie prądem zwarciowym I″k1 "
        "w rozumieniu IEC 60909-0. Zwarcie dwufazowe z ziemią jest liczone z impedancją "
        "zerową pojemności doziemnych."
    )
    return PrzyczynaBrakuZwarciaDoziemnego(
        status="NIE_DOTYCZY", opis_pl=opis, podstawa=PODSTAWA_NIE_DOTYCZY, elementy=przerwy
    )


def _brak_drogi(wpisy: Sequence[WpisSieciZerowej]) -> PrzyczynaBrakuZwarciaDoziemnego:
    przerwy = _unikalne(wpisy, "przerwa")
    opis = (
        "brak drogi prądu składowej zerowej do ziemi — żaden punkt neutralny tej części sieci "
        "nie jest uziemiony i model nie ma pojemności doziemnej (B0) jej elementów"
    )
    if przerwy:
        opis += f" ({_lista_elementow(przerwy)})"
    opis += (
        ". Impedancja zerowa jest nieskończona: prąd zwarciowy do ziemi (I″k1, I″kE2E) nie "
        "istnieje, a zwarcie dwufazowe z ziemią przechodzi w zwarcie dwufazowe (prądy fazowe "
        "w wyniku zwarcia 2F)."
    )
    return PrzyczynaBrakuZwarciaDoziemnego(
        status="BRAK_DROGI_FIZYCZNEJ", opis_pl=opis, podstawa=PODSTAWA_BRAK_DROGI, elementy=przerwy
    )


def rozstrzygnij_skladowa(
    wpisy: Sequence[WpisSieciZerowej], *, osobliwa: bool, wymaganie: Wymaganie
) -> PrzyczynaBrakuZwarciaDoziemnego | None:
    """Przyczyna braku wyniku dla spójnej składowej sieci zerowej albo ``None`` (liczona).

    ``osobliwa`` — blok Y0 składowej jest osobliwy (brak jakiegokolwiek bocznika do ziemi).
    ``wymaganie`` — czego potrzebuje konsument (``Wymaganie``). Kolejność reguł jest faktem
    fizyki i normy (nagłówek modułu); każda reguła ma test.
    """
    rodzaje = {wpis.rodzaj for wpis in wpisy}
    if "brak_danych_uziemienia" in rodzaje:
        return _brak_danych(wpisy)
    if "uziemienie" in rodzaje and not osobliwa:
        return None
    if wymaganie == "zwarcie_1f" and "kompensacja" in rodzaje:
        return _nie_dotyczy_kompensowana(wpisy)
    if "brak_danych" in rodzaje:
        return _brak_danych(wpisy)
    if osobliwa:
        return _brak_drogi(wpisy)
    if wymaganie == "zwarcie_1f":
        return _nie_dotyczy_izolowana(wpisy)
    return None


def skladowe_sieci_zerowej(y0_bus: np.ndarray) -> list[list[int]]:
    """Spójne składowe sieci zerowej: węzły połączone niezerowymi wpisami pozadiagonalnymi Y0
    (gałęzie zerowe linii i kabli z r0/x0 oraz transformatorów o połączeniu szeregowym).
    Kolejność deterministyczna (składowe po najmniejszym indeksie, indeksy rosnąco)."""
    size = y0_bus.shape[0]
    rodzic = list(range(size))

    def korzen(i: int) -> int:
        while rodzic[i] != i:
            rodzic[i] = rodzic[rodzic[i]]
            i = rodzic[i]
        return i

    wiersze, kolumny = np.nonzero(y0_bus)
    for i, j in zip(wiersze.tolist(), kolumny.tolist(), strict=True):
        if i != j:
            ri, rj = korzen(i), korzen(j)
            if ri != rj:
                rodzic[max(ri, rj)] = min(ri, rj)
    skladowe: dict[int, list[int]] = {}
    for i in range(size):
        skladowe.setdefault(korzen(i), []).append(i)
    return [skladowe[k] for k in sorted(skladowe)]


def przyczyny_skladowych(
    y0_bus: np.ndarray, wpisy_wezlow: Mapping[int, Sequence[WpisSieciZerowej]]
) -> tuple[dict[Wymaganie, dict[int, PrzyczynaBrakuZwarciaDoziemnego]], frozenset[int]]:
    """Przyczyny per wymaganie i indeks węzła (wyłącznie węzły bez wyniku) oraz indeksy
    składowych osobliwych.

    Oba wymagania (``WYMAGANIA``) rozstrzyga ta sama funkcja na tych samych wpisach i tej
    samej randze bloku — jedno źródło dla zwarcia 1F, zwarcia 2F+Z i kotwicy SN domeny nN.
    Składowa osobliwa (bez bocznika do ziemi) dostaje w macierzy bocznik jednostkowy
    WYŁĄCZNIE dla odwracalności — wołający uzupełnia ją na podstawie drugiego zbioru; jest
    przyczyną braku wyniku dla każdego wymagania (reguła ``osobliwa``)."""
    przyczyny: dict[Wymaganie, dict[int, PrzyczynaBrakuZwarciaDoziemnego]] = {
        wymaganie: {} for wymaganie in WYMAGANIA
    }
    osobliwe: set[int] = set()
    for indeksy in skladowe_sieci_zerowej(y0_bus):
        blok = y0_bus[np.ix_(indeksy, indeksy)]
        osobliwa = bool(np.linalg.matrix_rank(blok) < len(indeksy))
        if osobliwa:
            osobliwe.update(indeksy)
        wpisy = [wpis for i in indeksy for wpis in wpisy_wezlow.get(i, ())]
        for wymaganie in WYMAGANIA:
            przyczyna = rozstrzygnij_skladowa(wpisy, osobliwa=osobliwa, wymaganie=wymaganie)
            if przyczyna is not None:
                for i in indeksy:
                    przyczyny[wymaganie][i] = przyczyna
    return przyczyny, frozenset(osobliwe)
