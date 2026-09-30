"""Rdzen dynamiki RMS: uklad rozniczkowo-algebraiczny ze sprzezeniem sieciowym.

Pakiet stoi OBOK zamrozonych rdzeni `network_model/solvers/*` (rozplyw, zwarcia,
zabezpieczenia) i nie dotyka zadnego z nich — ani importem, ani edycja. Granica
importow calego pakietu jest pilnowana przez
`scripts/dynamika_granica_importow_guard.py`: wolno wylacznie `numpy`,
`scipy.sparse`, `network_model.pochodne` i zamkniety zbior modulow jezykowych
biblioteki standardowej.

UKLAD RAZ, W JEDNYM ZDANIU: `dx/dt = f(x, y)` (urzadzenia), `0 = g(x, y)` (siec),
krok trapezem niejawnym na ukladzie SPRZEZONYM, zdarzenia z dokladnym czasem,
re-inicjalizacja algebry przy TRZYMANYCH stanach rozniczkowych, tozsamosc biegu z
pieciu odciskow.

    wynik = SilnikDynamiki(wejscie).uruchom()
    ladunek = ladunek_resultset_dynamic_v2(wynik, run_id="...")
"""

from .calkowanie import (
    INTEGRATORY,
    Integrator,
    KontekstKroku,
    RungeKutta4Jawny,
    TrapezNiejawny,
    WynikKroku,
    blad_lokalny,
)
from .kontrakty import (
    KODY_ODMOW,
    CharakterystykaOdbioru,
    GalazDynamiki,
    HarmonogramDynamiki,
    KomendaRegulacji,
    NastawySolvera,
    OdbiorDynamiki,
    OdlaczenieZrodla,
    OdmowaDynamiki,
    OdsprzegDynamiki,
    PrzypisanieStanu,
    PunktPracy,
    SkokObciazenia,
    Urzadzenie,
    UtrataCzesciowaZrodla,
    WejscieDynamiki,
    WezelDynamiki,
    ZmianaGalezi,
    ZmianaOdbioru,
    ZmianaOdsprzegu,
    ZwarcieGalezi,
    ZwarcieWezla,
)
from .reinicjalizacja import RaportReinicjalizacji, reinicjalizuj
from .siec import ModelSieci, residuum_kcl_niezalezne, rozwiaz_algebre, zloz_model_sieci
from .silnik import SilnikDynamiki
from .tozsamosc import WERSJA_SOLVERA, TozsamoscBiegu, zbuduj_tozsamosc
from .wynik import (
    KanalWyniku,
    Metryka,
    WlasnosciBiegu,
    WynikDynamiki,
    ZdarzenieWykonane,
    ladunek_resultset_dynamic_v2,
)

__all__ = [
    "INTEGRATORY",
    "KODY_ODMOW",
    "WERSJA_SOLVERA",
    "CharakterystykaOdbioru",
    "GalazDynamiki",
    "HarmonogramDynamiki",
    "Integrator",
    "KanalWyniku",
    "KomendaRegulacji",
    "KontekstKroku",
    "Metryka",
    "ModelSieci",
    "NastawySolvera",
    "OdbiorDynamiki",
    "OdlaczenieZrodla",
    "OdmowaDynamiki",
    "OdsprzegDynamiki",
    "PrzypisanieStanu",
    "PunktPracy",
    "RaportReinicjalizacji",
    "RungeKutta4Jawny",
    "SilnikDynamiki",
    "SkokObciazenia",
    "TozsamoscBiegu",
    "TrapezNiejawny",
    "Urzadzenie",
    "UtrataCzesciowaZrodla",
    "WejscieDynamiki",
    "WezelDynamiki",
    "WlasnosciBiegu",
    "WynikDynamiki",
    "WynikKroku",
    "ZdarzenieWykonane",
    "ZmianaGalezi",
    "ZmianaOdbioru",
    "ZmianaOdsprzegu",
    "ZwarcieGalezi",
    "ZwarcieWezla",
    "blad_lokalny",
    "ladunek_resultset_dynamic_v2",
    "reinicjalizuj",
    "residuum_kcl_niezalezne",
    "rozwiaz_algebre",
    "zbuduj_tozsamosc",
    "zloz_model_sieci",
]
