"""Budowa wyniku czasowego — ksztalt kontraktu `resultset_dynamic_v2` (SS0 p.1/p.6).

DLACZEGO SLOWNIK, A NIE MODEL PYDANTIC. Rdzen nie importuje warstwy aplikacyjnej
(SS0 p.1) — model `ResultSetDynamicV2` zyje w `application/contracts/`, wiec
import stad bylby zlamaniem granicy pakietu. Rdzen buduje wiec LADUNEK o polach
1:1 z tym kontraktem, a warstwa aplikacyjna waliduje go swoim modelem. Ze ladunek
naprawde pasuje do kontraktu, nie jest tu deklaracja: testy pakietu wolaja
`ResultSetDynamicV2.model_validate(...)` na ladunku z prawdziwego biegu, wiec
kazdy rozjazd pol wywraca test, a nie dopiero produkcje.

DLACZEGO V2 (karta AB-1b.1 par. 0 pkt 14). Zmiany nie sa addytywne: probki moga byc
`None` (wartosc niedostepna, kat fazora zerowego), a powtorzone chwile osi czasu (probki
obustronne `L`/`P`) rozroznia `strona_probki`. Kontrakt v1 zostal usuniety bez warstwy
zgodnosci (konsumentow interfejsu: zero).

SZEREGI CZASOWE NIE WCHODZA DO `raw_result` biegu — `os_czasu_s` i `probki` sa
w ladunku obecne, ale wolajacy zapisuje je do osobnej tabeli szeregow, a w
wierszu biegu zostawia same metadane (lekcja wydajnosciowa: pelny szereg w
wierszu biegu zabija odczyt listy biegow). Kwantyzacja do 9 cyfr znaczacych
dzieje sie TUTAJ, na granicy kontraktu.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .tozsamosc import TozsamoscBiegu, kwantyzuj


@dataclass(frozen=True)
class KanalWyniku:
    """Opis jednego kanalu szeregu czasowego."""

    klucz: str
    przestrzen: str
    jednostka: str
    element_ref: str | None
    opis_pl: str


@dataclass(frozen=True)
class PrzypisanieWykonane:
    """Jedno przypisanie stanu wykonane w chwili zdarzenia: adres, wartosc PRZED i PO.

    `adres` = `urzadzenie.stan`. Wartosc `po` jest wartoscia zadana DOKLADNIE (komenda
    regulacji: po przeliczeniu MW/Mvar na jednostki wzgledne i mnozniku agregatu).
    """

    adres: str
    przed: float
    po: float


@dataclass(frozen=True)
class ZdarzenieWykonane:
    """Zdarzenie FAKTYCZNIE wykonane — z pomiarem skoku i bilansu.

    Zdarzenia ROWNOCZESNE (ta sama chwila) dziela JEDEN pomiar re-inicjalizacji:
    `delta_x_nieprzypisane_max`, `delta_y_max` i `residuum_kcl_max` opisuja skok CHWILI,
    bo algebra jest rozwiazywana raz, po naniesieniu wszystkich zdarzen tej chwili.
    Rozdzielanie pomiaru na „wklad kazdego zdarzenia" wymagaloby posrednich
    topologii, ktore w rzeczywistosci nigdy nie istnialy. Ta sama zasada dotyczy
    skutkow topologicznych chwili (karta AB-1b.1 par. 0 pkt 2): `obszary_odciete`
    (wezly, ktore w tej chwili STALY sie beznapieciowe), `odbiory_odciete` (odbiory,
    ktore w tej chwili stracily obwod — identyfikator i moc zadana sprzed odciecia,
    pu, konwencja poboru) oraz `obszary_zasilone_ponownie` (wezly, ktore w tej
    chwili PRZESTALY byc beznapieciowe). Kolejnosc = kolejnosc wezlow/odbiorow wejscia.

    CIAGLOSC STANOW MIERZONA, NIE DEKLAROWANA (karta AB-1b.1 par. 0 pkt 9, S19).
    `delta_x_nieprzypisane_max` to najwiekszy skok stanu rozniczkowego, ktorego ZADNE
    przypisanie tej chwili nie wskazalo, liczony wobec stanow sprzed CALEJ chwili (przed
    zdarzeniami, przypisaniami i re-inicjalizacja) — musi byc 0,0 bitowo. Dawne
    `delta_x_max` mierzylo wylacznie brak mutacji kopii stanow w algebrze, a bylo czytane
    jako dowod ciaglosci przez zdarzenie. `przypisania` — adres, wartosc przed i po
    kazdego przypisania wykonanego przez ten wpis (przypisanie stanu, komenda regulacji).

    ZDARZENIE WARUNKOWE (karta AB-1b.1 par. 0 pkt 12): `przyczyna` = `dozor:<ident>`,
    `t_zlokalizowany_s` — chwila pobudzenia dozoru (prawy koniec przedzialu lokalizacji;
    przy zwloce `t_wykonany_s` = `t_zlokalizowany_s` + zwloka), `szerokosc_przedzialu_s` i
    `iteracje_lokalizacji` — pomiar lokalizacji, `g_przed`/`g_po` — funkcja przekroczenia
    (wielkosc - prog) na koncach przedzialu. Wpis harmonogramu planowanego ma
    `przyczyna` = `harmonogram` i te pola puste.
    """

    t_zaplanowany_s: float
    t_wykonany_s: float
    rodzaj: str
    ref: str | None
    przyczyna: str
    delta_x_nieprzypisane_max: float
    delta_y_max: float
    residuum_kcl_max: float
    obszary_odciete: tuple[str, ...]
    odbiory_odciete: tuple[tuple[str, complex], ...]
    obszary_zasilone_ponownie: tuple[str, ...]
    przypisania: tuple[PrzypisanieWykonane, ...]
    t_zlokalizowany_s: float | None
    szerokosc_przedzialu_s: float | None
    iteracje_lokalizacji: int | None
    g_przed: float | None
    g_po: float | None


@dataclass(frozen=True)
class Przekroczenie:
    """Chwila przekroczenia progu przez wielkosc DETEKTORA (dozor bez akcji, par. 0 pkt 12).

    `wielkosc` = klucz kanalu wyniku, ktory dozor czyta (ta sama funkcja, co kanal);
    `t_s` = prawy koniec przedzialu lokalizacji (strona po przekroczeniu) w PELNEJ
    precyzji rdzenia — ladunek kontraktu kwantyzuje go do 9 cyfr znaczacych (rozdzielczosc
    publikacji nazwana w kontrakcie). Przekroczenie w chwili zdarzenia (miedzy probkami `L`
    i `P`) ma `t_s` rowne chwili zdarzenia, szerokosc 0 i zero iteracji.
    """

    dozor: str
    wielkosc: str
    prog: float
    kierunek: str
    t_s: float
    szerokosc_przedzialu_s: float
    iteracje: int


@dataclass(frozen=True)
class WlasnosciBiegu:
    """Wlasnosci numeryczne biegu."""

    zbiegl: bool
    kroki: int
    kroki_odrzucone: int
    max_residuum_f: float
    max_residuum_g: float
    czas_obliczen_s: float
    integrator: str
    dt_s: float
    tolerancja: float


@dataclass(frozen=True)
class Metryka:
    """Skalarna wielkosc wyprowadzona z przebiegu."""

    klucz: str
    wartosc: float
    jednostka: str
    wzor_ref: str | None
    element_ref: str | None


@dataclass(frozen=True)
class WynikDynamiki:
    """Kompletny wynik biegu czasowego po stronie rdzenia."""

    kanaly: tuple[KanalWyniku, ...]
    os_czasu_s: tuple[float, ...]
    #: Strona kazdej probki (`C` siatka, `L` przed zdarzeniami chwili, `P` po nich) —
    #: rownolegle do `os_czasu_s` (ta sama dlugosc, przypiete testem).
    strona_probki: tuple[str, ...]
    probki: dict[str, tuple[float | None, ...]]
    zdarzenia_wykonane: tuple[ZdarzenieWykonane, ...]
    #: `siec` — zaklocenia fizyczne sieci; `stanowisko` — siec zasilana zrodlem testowym
    #: U/f/theta (karta AB-1b.1 par. 0 pkt 11). Tryb WYPROWADZONY z wejscia, nie deklarowany.
    tryb_scenariusza: str
    #: Przekroczenia progow przez wielkosci detektorow — w kolejnosci chwil.
    przekroczenia: tuple[Przekroczenie, ...]
    wlasnosci: WlasnosciBiegu
    tozsamosc: TozsamoscBiegu
    metryki: tuple[Metryka, ...]
    zalozenia: tuple[str, ...]
    slad_white_box: dict[str, Any]


def _kwantyzuj_lub_brak(wartosc: float | None) -> float | None:
    """`None` (wartosc niedostepna) przechodzi bez zmiany — kwantyzowana jest tylko liczba."""
    return None if wartosc is None else kwantyzuj(wartosc)


def ladunek_resultset_dynamic_v2(wynik: WynikDynamiki, run_id: str) -> dict[str, Any]:
    """Ladunek o polach 1:1 z kontraktem `resultset_dynamic_v2`, skwantyzowany.

    `stopien_dowodowy` wychodzi PUSTY: klasyfikacja mocy dowodowej zdolnosci jest
    rozstrzygnieciem rejestru proweniencji, nie rdzenia obliczeniowego — solver,
    ktory sam sobie nadaje stopien dowodowy, jest dokladnie tym, czego zakazuje
    zasada zero fabrykacji.
    """
    return {
        "kontrakt": "resultset_dynamic_v2",
        "run_id": run_id,
        "analysis_type": "dynamika_rms",
        "kanaly": [
            {
                "klucz": kanal.klucz,
                "przestrzen": kanal.przestrzen,
                "jednostka": kanal.jednostka,
                "element_ref": kanal.element_ref,
                "opis_pl": kanal.opis_pl,
            }
            for kanal in wynik.kanaly
        ],
        "os_czasu_s": [kwantyzuj(chwila) for chwila in wynik.os_czasu_s],
        "strona_probki": list(wynik.strona_probki),
        "probki": {
            klucz: [_kwantyzuj_lub_brak(wartosc) for wartosc in szereg]
            for klucz, szereg in wynik.probki.items()
        },
        "zdarzenia_wykonane": [
            {
                "t_zaplanowany_s": kwantyzuj(zdarzenie.t_zaplanowany_s),
                "t_wykonany_s": kwantyzuj(zdarzenie.t_wykonany_s),
                "rodzaj": zdarzenie.rodzaj,
                "ref": zdarzenie.ref,
                "przyczyna": zdarzenie.przyczyna,
                "delta_x_nieprzypisane_max": kwantyzuj(zdarzenie.delta_x_nieprzypisane_max),
                "delta_y_max": kwantyzuj(zdarzenie.delta_y_max),
                "residuum_kcl_max": kwantyzuj(zdarzenie.residuum_kcl_max),
                "obszary_odciete": list(zdarzenie.obszary_odciete),
                "odbiory_odciete": [
                    {"ref": ident, "p_pu": kwantyzuj(moc.real), "q_pu": kwantyzuj(moc.imag)}
                    for ident, moc in zdarzenie.odbiory_odciete
                ],
                "obszary_zasilone_ponownie": list(zdarzenie.obszary_zasilone_ponownie),
                "przypisania": [
                    {
                        "adres": przypisanie.adres,
                        "przed": kwantyzuj(przypisanie.przed),
                        "po": kwantyzuj(przypisanie.po),
                    }
                    for przypisanie in zdarzenie.przypisania
                ],
                "t_zlokalizowany_s": _kwantyzuj_lub_brak(zdarzenie.t_zlokalizowany_s),
                "szerokosc_przedzialu_s": _kwantyzuj_lub_brak(zdarzenie.szerokosc_przedzialu_s),
                "iteracje_lokalizacji": zdarzenie.iteracje_lokalizacji,
                "g_przed": _kwantyzuj_lub_brak(zdarzenie.g_przed),
                "g_po": _kwantyzuj_lub_brak(zdarzenie.g_po),
            }
            for zdarzenie in wynik.zdarzenia_wykonane
        ],
        "tryb_scenariusza": wynik.tryb_scenariusza,
        "przekroczenia": [
            {
                "dozor": przekroczenie.dozor,
                "wielkosc": przekroczenie.wielkosc,
                "prog": kwantyzuj(przekroczenie.prog),
                "kierunek": przekroczenie.kierunek,
                "t_s": kwantyzuj(przekroczenie.t_s),
                "szerokosc_przedzialu_s": kwantyzuj(przekroczenie.szerokosc_przedzialu_s),
                "iteracje": przekroczenie.iteracje,
            }
            for przekroczenie in wynik.przekroczenia
        ],
        "wlasnosci_biegu": {
            "zbiegl": wynik.wlasnosci.zbiegl,
            "kroki": wynik.wlasnosci.kroki,
            "kroki_odrzucone": wynik.wlasnosci.kroki_odrzucone,
            "max_residuum_f": kwantyzuj(wynik.wlasnosci.max_residuum_f),
            "max_residuum_g": kwantyzuj(wynik.wlasnosci.max_residuum_g),
            "czas_obliczen_s": kwantyzuj(wynik.wlasnosci.czas_obliczen_s),
            "integrator": wynik.wlasnosci.integrator,
            "dt_s": kwantyzuj(wynik.wlasnosci.dt_s),
            "tolerancja": kwantyzuj(wynik.wlasnosci.tolerancja),
        },
        "tozsamosc": {
            "odcisk_migawki": wynik.tozsamosc.odcisk_migawki,
            "odcisk_punktu_pracy": wynik.tozsamosc.odcisk_punktu_pracy,
            "odcisk_nastaw_solvera": wynik.tozsamosc.odcisk_nastaw_solvera,
            "odcisk_harmonogramu": wynik.tozsamosc.odcisk_harmonogramu,
            "odcisk_implementacji": wynik.tozsamosc.odcisk_implementacji,
            "wersja_solvera": wynik.tozsamosc.wersja_solvera,
        },
        "metryki": [
            {
                "klucz": metryka.klucz,
                "wartosc": kwantyzuj(metryka.wartosc),
                "jednostka": metryka.jednostka,
                "wzor_ref": metryka.wzor_ref,
                "element_ref": metryka.element_ref,
            }
            for metryka in wynik.metryki
        ],
        "stopien_dowodowy": [],
        "zalozenia": list(wynik.zalozenia),
    }


__all__ = [
    "KanalWyniku",
    "Metryka",
    "Przekroczenie",
    "PrzypisanieWykonane",
    "WlasnosciBiegu",
    "WynikDynamiki",
    "ZdarzenieWykonane",
    "ladunek_resultset_dynamic_v2",
]
