"""Budowa wyniku czasowego — ksztalt kontraktu `resultset_dynamic_v1` (SS0 p.1/p.6).

DLACZEGO SLOWNIK, A NIE MODEL PYDANTIC. Rdzen nie importuje warstwy aplikacyjnej
(SS0 p.1) — model `ResultSetDynamicV1` zyje w `application/contracts/`, wiec
import stad bylby zlamaniem granicy pakietu. Rdzen buduje wiec LADUNEK o polach
1:1 z tym kontraktem, a warstwa aplikacyjna waliduje go swoim modelem. Ze ladunek
naprawde pasuje do kontraktu, nie jest tu deklaracja: testy pakietu wolaja
`ResultSetDynamicV1.model_validate(...)` na ladunku z prawdziwego biegu, wiec
kazdy rozjazd pol wywraca test, a nie dopiero produkcje.

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
class ZdarzenieWykonane:
    """Zdarzenie FAKTYCZNIE wykonane — z pomiarem skoku i bilansu.

    Zdarzenia ROWNOCZESNE (ta sama chwila) dziela JEDEN pomiar re-inicjalizacji:
    `delta_x_max`, `delta_y_max` i `residuum_kcl_max` opisuja skok CHWILI, bo
    algebra jest rozwiazywana raz, po naniesieniu wszystkich zdarzen tej chwili.
    Rozdzielanie pomiaru na „wklad kazdego zdarzenia" wymagaloby posrednich
    topologii, ktore w rzeczywistosci nigdy nie istnialy.
    """

    t_zaplanowany_s: float
    t_wykonany_s: float
    rodzaj: str
    ref: str | None
    delta_x_max: float
    delta_y_max: float
    residuum_kcl_max: float


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
    probki: dict[str, tuple[float, ...]]
    zdarzenia_wykonane: tuple[ZdarzenieWykonane, ...]
    wlasnosci: WlasnosciBiegu
    tozsamosc: TozsamoscBiegu
    metryki: tuple[Metryka, ...]
    zalozenia: tuple[str, ...]
    slad_white_box: dict[str, Any]


def ladunek_resultset_dynamic_v1(wynik: WynikDynamiki, run_id: str) -> dict[str, Any]:
    """Ladunek o polach 1:1 z kontraktem `resultset_dynamic_v1`, skwantyzowany.

    `stopien_dowodowy` wychodzi PUSTY: klasyfikacja mocy dowodowej zdolnosci jest
    rozstrzygnieciem rejestru proweniencji, nie rdzenia obliczeniowego — solver,
    ktory sam sobie nadaje stopien dowodowy, jest dokladnie tym, czego zakazuje
    zasada zero fabrykacji.
    """
    return {
        "kontrakt": "resultset_dynamic_v1",
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
        "probki": {
            klucz: [kwantyzuj(wartosc) for wartosc in szereg]
            for klucz, szereg in wynik.probki.items()
        },
        "zdarzenia_wykonane": [
            {
                "t_zaplanowany_s": kwantyzuj(zdarzenie.t_zaplanowany_s),
                "t_wykonany_s": kwantyzuj(zdarzenie.t_wykonany_s),
                "rodzaj": zdarzenie.rodzaj,
                "ref": zdarzenie.ref,
                "delta_x_max": kwantyzuj(zdarzenie.delta_x_max),
                "delta_y_max": kwantyzuj(zdarzenie.delta_y_max),
                "residuum_kcl_max": kwantyzuj(zdarzenie.residuum_kcl_max),
            }
            for zdarzenie in wynik.zdarzenia_wykonane
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
    "WlasnosciBiegu",
    "WynikDynamiki",
    "ZdarzenieWykonane",
    "ladunek_resultset_dynamic_v1",
]
