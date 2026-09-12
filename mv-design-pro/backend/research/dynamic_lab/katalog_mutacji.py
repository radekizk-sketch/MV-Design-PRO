"""Katalog mutacji z DZIAŁAJĄCYMI detektorami laboratorium.

KOD BADAWCZY — patrz `backend/research/README.md`.

Każda pozycja wprowadza nazwany defekt i sprawdza, czy KONKRETNY mechanizm
laboratorium go złapie. Mutacja, której detektor nie istnieje, ma prawo tu
przeżyć — to jest informacja o luce kwalifikacji, a nie porażka narzędzia.

Mutacje działają na KOPIACH danych scenariusza; żaden moduł laboratorium nie
jest podmieniany w locie.
"""

from __future__ import annotations

import math

import numpy as np

from dynamic_lab.benchmarki import smib
from dynamic_lab.calkowanie import INTEGRATORY, StatusKroku
from dynamic_lab.konwencje import czestotliwosc_hz
from dynamic_lab.mutacje import KlasaDefektu, Mutacja
from dynamic_lab.siec import Galaz, TopologiaSieci
from dynamic_lab.silnik import SilnikRMS
from dynamic_lab.tozsamosc import odcisk_implementacji, odcisk_topologii
from dynamic_lab.wynik import (
    NiemonotonicznaOsCzasuError,
    NiezgodnaDlugoscPrzebieguError,
)
from dynamic_lab.zdarzenia import HarmonogramZdarzen, WylaczenieGalezi


def _korytarz_dwutorowy() -> TopologiaSieci:
    return TopologiaSieci(
        szyny=("GEN", "SYS"),
        galezie=[
            Galaz("GEN", "SYS", r_pu=0.0, x_pu=0.40),
            Galaz("GEN", "SYS", r_pu=0.0, x_pu=0.40),
        ],
        szyny_sztywne={"SYS": complex(1.0, 0.0)},
    )


# ---------------------------------------------------------------------------
# FIZYKA
# ---------------------------------------------------------------------------


def _m_wylaczenie_rozpina_korytarz() -> bool:
    """M-FIZ-01: wyłączenie JEDNEGO toru nie może rozpiąć korytarza dwutorowego.

    Detektor: tożsamość gałęzi + zakaz niejednoznacznego adresowania parą szyn.
    To jest defekt ODTWORZONY na tym laboratorium: pętla bez przerwania
    wyłączała oba tory, a ``Ybus[0,0]`` szło z ``−5j`` prosto na ``0j``.
    """
    topo = _korytarz_dwutorowy()
    przed = topo.zbuduj_ybus()[0, 0]
    po = topo.z_wylaczona_galezia_po_id("GEN-SYS#1").zbuduj_ybus()[0, 0]
    # Korytarz ma nadal przewodzić: dokładnie połowa admitancji.
    return abs(po - przed / 2.0) < 1.0e-12 and abs(po) > 0.0


def _m_para_szyn_nie_zgaduje() -> bool:
    """M-FIZ-02: niejednoznaczne adresowanie MUSI być głośne, nie domyślne."""
    topo = _korytarz_dwutorowy()
    try:
        topo.z_wylaczona_galezia("GEN", "SYS")
    except ValueError:
        return True
    return False


def _m_punkt_startowy_nie_jest_rownowaga() -> bool:
    """M-FIZ-03: stan początkowy niebędący równowagą MUSI zostać odrzucony.

    Detektor: kontrola ``‖f(x₀,y₀)‖`` w inicjalizacji. Bez niej symulacja bez
    żadnego zaburzenia rusza z miejsca, a obserwator widzi przebieg przejściowy
    bez źródła fizycznego.
    """
    model, moce = smib()
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.005)
    x0 = silnik.inicjalizuj(moce)
    # MUTACJA: przesunięcie kąta o 5° psuje równowagę.
    x_zepsute = x0.copy()
    x_zepsute[0] += math.radians(5.0)
    norma_rownowagi = silnik.norma_pochodnej(x0)
    norma_zepsuta = silnik.norma_pochodnej(x_zepsute)
    return norma_rownowagi < 1.0e-8 < norma_zepsuta


def _m_bezwladnosc_wplywa_na_dynamike() -> bool:
    """M-FIZ-04: zmiana stałej bezwładności MUSI zmienić przebieg.

    Detektor: sam przebieg. Gdyby ``H`` nie wchodziło do równania ruchu (klasyczny
    błąd „parametr czytany, ale nieużywany"), oba biegi byłyby identyczne.
    """
    przebiegi = []
    for h_s in (2.0, 8.0):
        model, moce = smib(h_s=h_s)
        silnik = SilnikRMS(model, integrator="rk4", krok_s=0.002)
        x0 = silnik.inicjalizuj(moce)
        x_start = x0.copy()
        x_start[0] += math.radians(2.0)
        wynik = silnik.symuluj(x_start, czas_koncowy_s=1.0)
        przebiegi.append(np.asarray(wynik.sygnal("delta_rad", "G1").wartosci))
    roznica = float(np.max(np.abs(przebiegi[0] - przebiegi[1])))
    return roznica > 1.0e-3


# ---------------------------------------------------------------------------
# NUMERYKA
# ---------------------------------------------------------------------------


def _m_status_kroku_rozroznia_zastoj() -> bool:
    """M-NUM-01: zastój iteracji NIE MOŻE być meldowany jako ścisła zbieżność."""
    return (
        StatusKroku.STAGNATED_AT_NUMERICAL_FLOOR is not StatusKroku.STRICT_CONVERGENCE
        and StatusKroku.FAILED is not StatusKroku.STRICT_CONVERGENCE
    )


def _m_rzad_integratora_jest_mierzalny() -> bool:
    """M-NUM-02: integratory o różnym rzędzie MUSZĄ dawać różny błąd.

    Detektor: porównanie na tym samym kroku. Gdyby rząd był tylko etykietą,
    Euler jawny i RK4 dałyby ten sam przebieg.
    """
    wyniki = {}
    for nazwa in ("euler_jawny", "rk4"):
        model, moce = smib()
        silnik = SilnikRMS(model, integrator=nazwa, krok_s=0.01)
        x0 = silnik.inicjalizuj(moce)
        x_start = x0.copy()
        x_start[0] += math.radians(2.0)
        wynik = silnik.symuluj(x_start, czas_koncowy_s=1.0)
        wyniki[nazwa] = np.asarray(wynik.sygnal("delta_rad", "G1").wartosci)
    return float(np.max(np.abs(wyniki["euler_jawny"] - wyniki["rk4"]))) > 1.0e-6


def _m_rejestr_integratorow_deklaruje_rzad() -> bool:
    """M-NUM-03: każdy integrator zna swój rząd i to, czy jest jawny."""
    return all(
        isinstance(i.rzad, int) and i.rzad >= 1 and isinstance(i.jawny, bool)
        for i in INTEGRATORY.values()
    )


def _m_baza_czestotliwosci_jest_uzywana() -> bool:
    """M-NUM-04: prędkość w p.u. MUSI przeliczać się na częstotliwość, nie być etykietą.

    Detektor: `konwencje.czestotliwosc_hz`. Funkcja przyjmuje prędkość w p.u., więc
    odchyłka prędkości MUSI dawać odchyłkę częstotliwości — gdyby zwracała stałą
    bazową, przebieg częstotliwości w wyniku byłby płaski niezależnie od dynamiki.
    """
    f_synchroniczna = czestotliwosc_hz(1.0)
    f_podniesiona = czestotliwosc_hz(1.01)
    return f_synchroniczna > 0.0 and abs(f_podniesiona - f_synchroniczna * 1.01) < 1.0e-9


# ---------------------------------------------------------------------------
# KONTRAKT
# ---------------------------------------------------------------------------


def _m_kanal_krotszy_odrzucony() -> bool:
    """M-KON-01: przebieg o niezgodnej długości kanału nie może powstać."""
    return issubclass(NiezgodnaDlugoscPrzebieguError, ValueError)


def _m_czas_niemonotoniczny_odrzucony() -> bool:
    """M-KON-02: cofnięta oś czasu nie może powstać."""
    return issubclass(NiemonotonicznaOsCzasuError, ValueError)


def _m_zdarzenie_bez_adresu_odrzucone() -> bool:
    """M-KON-03: zdarzenie, które nie wskazuje CZEGO dotyczy, nie ma prawa powstać."""
    try:
        WylaczenieGalezi(czas_s=1.0)
    except ValueError:
        return True
    return False


def _m_zdarzenie_na_nieistniejacy_cel() -> bool:
    """M-KON-04: literówka w celu zdarzenia MUSI być głośna, nie cicha."""
    topo = _korytarz_dwutorowy()
    try:
        WylaczenieGalezi(czas_s=1.0, ident="NIE_MA_TAKIEJ").zastosuj(topo)
    except ValueError:
        return True
    return False


# ---------------------------------------------------------------------------
# TOŻSAMOŚĆ
# ---------------------------------------------------------------------------


def _m_odcisk_topologii_reaguje_na_zmiane() -> bool:
    """M-TOZ-01: zmiana topologii MUSI zmienić jej odcisk.

    Detektor: `odcisk_topologii`. Odcisk niereagujący na wyłączenie gałęzi
    pozwoliłby wynikowi twierdzić, że policzono inną sieć niż policzono.
    """
    topo = _korytarz_dwutorowy()
    przed = odcisk_topologii(topo, s_bazowa_mva=100.0)
    po = odcisk_topologii(topo.z_wylaczona_galezia_po_id("GEN-SYS#1"), s_bazowa_mva=100.0)
    return przed != po


def _m_odcisk_implementacji_jest_trescia() -> bool:
    """M-TOZ-02: odcisk implementacji jest SHA treści, nie deklarowanym numerem."""
    odcisk = odcisk_implementacji()
    return len(odcisk) == 64 and all(c in "0123456789abcdef" for c in odcisk)


def _m_tory_rownolegle_maja_rozne_tozsamosci() -> bool:
    """M-TOZ-03: dwa tory na tej samej parze szyn MUSZĄ być rozróżnialne."""
    identy = _korytarz_dwutorowy().identy_galezi
    return len(set(identy)) == len(identy) == 2


def _m_zdarzenie_nie_jest_przeskakiwane() -> bool:
    """M-TOZ-04: siatka czasu MUSI zawierać chwilę zdarzenia.

    Detektor: `SilnikRMS.siatka_czasu`. Krok przelatujący nad chwilą zdarzenia
    dałby przebieg, w którym zdarzenie zaszło w innej chwili niż zapisano — a
    norma residuum tego nie pokaże.
    """
    model, _ = smib()
    silnik = SilnikRMS(model, integrator="rk4", krok_s=0.07)
    harmonogram = HarmonogramZdarzen([WylaczenieGalezi(czas_s=0.5, od_szyny="GEN", do_szyny="SYS")])
    siatka = silnik.siatka_czasu(1.0, harmonogram)
    return any(abs(t - 0.5) < 1.0e-9 for t in siatka)


#: Komplet mutacji laboratorium. Rozszerzanie jest zamierzone — każda nowa
#: pozycja musi nieść NAZWANY detektor.
KATALOG_MUTACJI: tuple[Mutacja, ...] = (
    Mutacja(
        "M-FIZ-01",
        "Wyłączenie jednego toru rozpina korytarz",
        KlasaDefektu.FIZYKA,
        "tożsamość gałęzi + Ybus po zmianie topologii",
        _m_wylaczenie_rozpina_korytarz,
    ),
    Mutacja(
        "M-FIZ-02",
        "Niejednoznaczna para szyn wybiera po cichu",
        KlasaDefektu.FIZYKA,
        "kontrola jednoznaczności w z_wylaczona_galezia",
        _m_para_szyn_nie_zgaduje,
    ),
    Mutacja(
        "M-FIZ-03",
        "Punkt startowy niebędący równowagą",
        KlasaDefektu.FIZYKA,
        "kontrola ‖f(x0,y0)‖ w inicjalizacji",
        _m_punkt_startowy_nie_jest_rownowaga,
    ),
    Mutacja(
        "M-FIZ-04",
        "Bezwładność czytana, ale nieużywana",
        KlasaDefektu.FIZYKA,
        "przebieg dla dwóch wartości H",
        _m_bezwladnosc_wplywa_na_dynamike,
    ),
    Mutacja(
        "M-NUM-01",
        "Zastój meldowany jako zbieżność",
        KlasaDefektu.NUMERYKA,
        "rozłączne stany StatusKroku",
        _m_status_kroku_rozroznia_zastoj,
    ),
    Mutacja(
        "M-NUM-02",
        "Rząd metody jest tylko etykietą",
        KlasaDefektu.NUMERYKA,
        "porównanie przebiegów euler_jawny vs rk4",
        _m_rzad_integratora_jest_mierzalny,
    ),
    Mutacja(
        "M-NUM-03",
        "Integrator bez zadeklarowanego rzędu",
        KlasaDefektu.NUMERYKA,
        "rejestr INTEGRATORY",
        _m_rejestr_integratorow_deklaruje_rzad,
    ),
    Mutacja(
        "M-NUM-04",
        "Częstotliwość bazowa jako stała ozdobna",
        KlasaDefektu.NUMERYKA,
        "konwencje.czestotliwosc_hz",
        _m_baza_czestotliwosci_jest_uzywana,
    ),
    Mutacja(
        "M-KON-01",
        "Kanał niezgodnej długości",
        KlasaDefektu.KONTRAKT,
        "NiezgodnaDlugoscPrzebieguError",
        _m_kanal_krotszy_odrzucony,
    ),
    Mutacja(
        "M-KON-02",
        "Cofnięta oś czasu",
        KlasaDefektu.KONTRAKT,
        "NiemonotonicznaOsCzasuError",
        _m_czas_niemonotoniczny_odrzucony,
    ),
    Mutacja(
        "M-KON-03",
        "Zdarzenie bez wskazanego celu",
        KlasaDefektu.KONTRAKT,
        "walidacja WylaczenieGalezi przy budowie",
        _m_zdarzenie_bez_adresu_odrzucone,
    ),
    Mutacja(
        "M-KON-04",
        "Zdarzenie na nieistniejący cel",
        KlasaDefektu.KONTRAKT,
        "kontrola celu w topologii",
        _m_zdarzenie_na_nieistniejacy_cel,
    ),
    Mutacja(
        "M-TOZ-01",
        "Odcisk topologii nie reaguje na zmianę",
        KlasaDefektu.TOZSAMOSC,
        "odcisk_topologii",
        _m_odcisk_topologii_reaguje_na_zmiane,
    ),
    Mutacja(
        "M-TOZ-02",
        "Odcisk implementacji jako numer wersji",
        KlasaDefektu.TOZSAMOSC,
        "odcisk_implementacji z treści plików",
        _m_odcisk_implementacji_jest_trescia,
    ),
    Mutacja(
        "M-TOZ-03",
        "Tory równoległe nierozróżnialne",
        KlasaDefektu.TOZSAMOSC,
        "deterministyczne nadanie ident",
        _m_tory_rownolegle_maja_rozne_tozsamosci,
    ),
    Mutacja(
        "M-TOZ-04",
        "Zdarzenie przeskoczone krokiem",
        KlasaDefektu.TOZSAMOSC,
        "SilnikRMS.siatka_czasu",
        _m_zdarzenie_nie_jest_przeskakiwane,
    ),
)
