"""Biblioteka urzadzen dynamicznych rdzenia RMS.

ZAKRES WYZNACZA KONTRAKT DANYCH, NIE WYGODA SOLVERA. Kontrakt ENM
(`enm/dynamika_modele.py`) definiuje piec rodzin, ktore projektant realnie
wprowadza; ta biblioteka ma model dla kazdej z nich albo NAZWANA odmowe z
powodem — cicha degradacja do maszyny klasycznej jest zakazana.

* `maszyna_klasyczna` — model 2. rzedu (E' za X'd); wyrocznie rownych pol i
  malosygnalowa rdzenia sa sformulowane dokladnie dla niego;
* `szyna_sztywna` — warunek brzegowy ukladu SMIB (SEM za impedancja Thevenina);
* `odlaczone` — opakowanie urzadzenia odlaczonego zdarzeniem scenariusza;
* `maszyna_synchroniczna` — model 6. rzedu (osie d/q) z AVR, regulatorem obrotow
  i stabilizatorem systemowym;
* `przeksztaltnik_gfl` — przeksztaltnik nadazny (PLL, ogranicznik pradu z
  priorytetem Z KATALOGU, FRT, statyzmy P/f i Q/U, odbudowa mocy);
* `przeksztaltnik_gfm` — przeksztaltnik tworzacy siec (statyzm albo maszyna
  wirtualna, impedancja wirtualna, dwie strategie ograniczenia pradu);
* `magazyn` — zasobnik energii + rdzen przeksztaltnika na JEDNEJ bazie mocy;
* `turbina_wiatrowa` — IEC 61400-27-1 typ 3/4 (wirnik, kat lopat, crowbar,
  przeksztaltnik); typy 1/2 koncza sie nazwana odmowa, bo kontrakt nie niesie ich
  modelu elektrycznego;
* `fabryka` — JEDYNY szew miedzy kontraktem danych a rdzeniem.

WSPOLNE MECHANIZMY (jeden mechanizm, wielu konsumentow):
`pochodne_kierunkowe` (rozniczkowanie w przod — funkcja i jej jakobian z jednego
przebiegu obliczen), `uklad_stanow` (zmienny uklad stanow + zaszczepienie
gradientow), `okno_mocy` (jeden predykat granicy mocy czynnej), `regulatory`
(bloki AVR/GOV/PSS), `bazowe` (zrodlo napieciowe za impedancja).
"""

from .bazowe import (
    admitancja_wewnetrzna,
    blok_mnozenia_zespolonego,
    jakobian_prad_napiecie_zrodla,
    modul_niezerowy,
    prad_zrodla_napieciowego,
)
from .fabryka import (
    INWENTARZ_POL,
    RODZINY_BEZ_MODELU,
    RODZINY_OBSLUGIWANE,
    PolaRodziny,
    PunktPracyUrzadzenia,
    moc_znamionowa_rodziny_pu,
    zbuduj_urzadzenie,
)
from .magazyn import STAN_NALADOWANIA, Magazyn, Zasobnik, zbuduj_magazyn, zbuduj_zasobnik
from .maszyna_klasyczna import (
    INDEKS_DELTA,
    INDEKS_MOCY_MECHANICZNEJ,
    INDEKS_MODULU_SEM,
    INDEKS_OMEGA,
    NAZWY_STANOW_MASZYNY_KLASYCZNEJ,
    MaszynaKlasyczna,
    zbuduj_maszyne_klasyczna,
)
from .maszyna_synchroniczna import (
    STANY_RDZENIA,
    MaszynaSynchroniczna,
    WspolczynnikiNasycenia,
    dopasuj_nasycenie,
    zbuduj_maszyne_synchroniczna,
)
from .odlaczone import UrzadzenieOdlaczone
from .okno_mocy import (
    OknoMocy,
    moc_znamionowa_pu,
    okno_symetryczne,
    okno_tylko_oddawanie,
)
from .przeksztaltnik_gfl import (
    STANY_GFL,
    PrzeksztaltnikGFL,
    RdzenGFL,
    ogranicz_prad,
    zbuduj_rdzen_gfl,
)
from .przeksztaltnik_gfm import (
    STRATEGIA_IMPEDANCJA,
    STRATEGIA_NASYCENIE,
    STRATEGIE_GFM,
    TRYB_MASZYNA_WIRTUALNA,
    TRYB_STATYZM,
    TRYBY_GFM,
    PrzeksztaltnikGFM,
    RdzenGFM,
    zbuduj_rdzen_gfm,
)
from .regulatory import (
    WARIANTY_STABILIZATORA_ZLOZALNE,
    WARIANTY_TURBINY_ZLOZALNE,
    WARIANTY_WZBUDZENIA_ZLOZALNE,
    RegulatorNapieciaSEXS,
    RegulatorObrotowTGOV1,
    StabilizatorPSS1A,
    zbuduj_regulator_napiecia,
    zbuduj_regulator_obrotow,
    zbuduj_stabilizator,
)
from .szyna_sztywna import (
    INDEKS_SEM_IM,
    INDEKS_SEM_RE,
    NAZWY_STANOW_SZYNY_SZTYWNEJ,
    SzynaSztywna,
    zbuduj_szyne_sztywna,
)
from .turbina_wiatrowa import (
    TYPY_BEZ_MODELU_ELEKTRYCZNEGO,
    TYPY_ZLOZALNE,
    Crowbar,
    NastawyCrowbar,
    TorMechaniczny,
    TurbinaWiatrowa,
    zbuduj_turbine_wiatrowa,
)
from .uklad_stanow import UkladStanow

__all__ = [
    "INDEKS_DELTA",
    "INDEKS_MOCY_MECHANICZNEJ",
    "INDEKS_MODULU_SEM",
    "INDEKS_OMEGA",
    "INDEKS_SEM_IM",
    "INDEKS_SEM_RE",
    "INWENTARZ_POL",
    "NAZWY_STANOW_MASZYNY_KLASYCZNEJ",
    "NAZWY_STANOW_SZYNY_SZTYWNEJ",
    "RODZINY_BEZ_MODELU",
    "RODZINY_OBSLUGIWANE",
    "STANY_GFL",
    "STANY_RDZENIA",
    "STAN_NALADOWANIA",
    "STRATEGIA_IMPEDANCJA",
    "STRATEGIA_NASYCENIE",
    "STRATEGIE_GFM",
    "TRYBY_GFM",
    "TRYB_MASZYNA_WIRTUALNA",
    "TRYB_STATYZM",
    "TYPY_BEZ_MODELU_ELEKTRYCZNEGO",
    "TYPY_ZLOZALNE",
    "WARIANTY_STABILIZATORA_ZLOZALNE",
    "WARIANTY_TURBINY_ZLOZALNE",
    "WARIANTY_WZBUDZENIA_ZLOZALNE",
    "Crowbar",
    "NastawyCrowbar",
    "Magazyn",
    "MaszynaKlasyczna",
    "MaszynaSynchroniczna",
    "OknoMocy",
    "PolaRodziny",
    "PrzeksztaltnikGFL",
    "PrzeksztaltnikGFM",
    "PunktPracyUrzadzenia",
    "RdzenGFL",
    "RdzenGFM",
    "RegulatorNapieciaSEXS",
    "RegulatorObrotowTGOV1",
    "StabilizatorPSS1A",
    "SzynaSztywna",
    "TorMechaniczny",
    "TurbinaWiatrowa",
    "UkladStanow",
    "UrzadzenieOdlaczone",
    "WspolczynnikiNasycenia",
    "Zasobnik",
    "admitancja_wewnetrzna",
    "blok_mnozenia_zespolonego",
    "dopasuj_nasycenie",
    "jakobian_prad_napiecie_zrodla",
    "moc_znamionowa_pu",
    "moc_znamionowa_rodziny_pu",
    "modul_niezerowy",
    "ogranicz_prad",
    "okno_symetryczne",
    "okno_tylko_oddawanie",
    "prad_zrodla_napieciowego",
    "zbuduj_magazyn",
    "zbuduj_maszyne_klasyczna",
    "zbuduj_maszyne_synchroniczna",
    "zbuduj_rdzen_gfl",
    "zbuduj_rdzen_gfm",
    "zbuduj_regulator_napiecia",
    "zbuduj_regulator_obrotow",
    "zbuduj_stabilizator",
    "zbuduj_szyne_sztywna",
    "zbuduj_turbine_wiatrowa",
    "zbuduj_urzadzenie",
    "zbuduj_zasobnik",
]
