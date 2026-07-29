"""Modele D-01 Arc Flash — IEEE 1584-2018 (model publiczny, współczynniki z danych).

WARSTWA ANALIZY / OBLICZENIA (interpretacja wyniku zwarciowego, NIE fizyka
solvera — Z15). Moduł odczytuje GOTOWY wynik zwarciowy (prąd zwarcia bolted
``I_bf`` z solvera IEC 60909 — ``ShortCircuitResult.ikss_a``) i wylicza energię
incydentu, granicę łuku oraz kategorię ŚOI wg równań opublikowanych w
IEEE 1584-2018.

╔══════════════════════════════════════════════════════════════════════════╗
║  PROWENIENCJA WSPÓŁCZYNNIKÓW — OPEN-SOURCE / AUDIT-PENDING (UCZCIWIE)       ║
║                                                                            ║
║  To jest FIZYKA BEZPIECZEŃSTWA (kategorie ŚOI, granice łuku elektrycznego).║
║  Dlatego proweniencja jest deklarowana DOKŁADNIE, bez zawyżania:           ║
║                                                                            ║
║  • RÓWNANIA modelu są publiczne (postać IEEE 1584-2018) i zbudowane w      ║
║    pełni — przepływ parametryzowany TYPOWANĄ tablicą współczynników.       ║
║  • WARTOŚCI współczynników pochodzą z OPEN-SOURCE'OWEJ implementacji MIT   ║
║    ``rwl/arcflash`` (GitHub), odwołującej się do kalkulatorów IEEE         ║
║    DataPort — NIE z licencjonowanej kopii IEEE Std 1584-2018.              ║
║    Ładowane z pliku danych w repo (``data/norm_coefficients/...``),        ║
║    NIE rozsypane w kodzie — każda liczba ma jawne źródło (audytowalne).    ║
║                                                                            ║
║  Wynik liczy się NAPRAWDĘ (realne E/AFB), ale nosi status                  ║
║  ``COMPUTED_IEEE_1584_OPEN_SOURCE`` z proweniencją                         ║
║  ``IEEE 1584-2018 via open-source MIT impl rwl/arcflash; NOT               ║
║  licensed-norm-verified`` i polskim zastrzeżeniem. Bramka OSD nadal        ║
║  BLOKUJE użycie CERTYFIKOWANE/przyłączeniowe, dopóki inżynier świadomie    ║
║  nie zaakceptuje proweniencji open-source. Gdy właściciel dostarczy        ║
║  tablicę ZWERYFIKOWANĄ z licencjonowaną normą, TEN SAM przepływ przełączy  ║
║  status na ``COMPUTED_IEEE_1584`` (zweryfikowany) BEZ zmiany kodu.         ║
╚══════════════════════════════════════════════════════════════════════════╝

Struktura modelu (IEEE 1584-2018, publiczna — parametryzowana tablicą):
  - Prąd łuku pośredni ``I_arc`` z prądu zwarcia bolted ``I_bf``, napięcia,
    odstępu elektrod ``G`` i konfiguracji elektrod; liczony w trzech kotwach
    napięcia 600 / 2700 / 14300 V i interpolowany między kotwami (Tab. 1).
  - Współczynnik zmienności prądu łuku ``var_cf`` (Tab. 2) i prąd minimalny
    ``I_arc_min = I_arc·(1 − 0,5·var_cf)`` (czuły scenariusz koordynacji).
  - Energia incydentu ``E`` [J/cm²] na odległości roboczej ``D`` w czasie łuku
    ``t`` [ms] z korekcją rozmiaru obudowy ``CF`` (Tab. 3/4/5 + Tab. 7),
    raportowana także w cal/cm².
  - Granica łuku ``AFB`` — odległość, na której ``E = 1,2 cal/cm²``
    (= 5,0208 J/cm², publiczny próg oparzenia II°).
  - Kategoria ŚOI — mapowanie progów NFPA 70E (granice tablicowe; dane NFPA
    NIE są dostarczone → mapowanie pozostaje „dane niekompletne").

Zakres ważności IEEE 1584-2018: 208 V–15 kV; I_bf ZALEŻNY od klasy napięcia —
500 A–106 kA dla U<=600 V (LV), 200 A–65 kA dla 600 V<U<=15 kV (HV/SN, główny
zakres tego narzędzia). POZA zakresem (zwłaszcza > 15 kV) — ODRĘBNA ścieżka
metody Ralpha Lee (teoretyczna metoda maksymalnej mocy łuku), JAWNIE oznaczona
jako Ralph Lee (NIE jako IEEE 1584). Metoda Lee to publiczna postać zamknięta
(bez tablicy) — zaimplementowana.

Ścieżka LV (U<=600 V) NIE interpoluje między kotwami napięcia — liczy prąd
łuku pośredni przy kotwie 600 V (Eq.1), po czym KORYGUJE go do RZECZYWISTEGO
napięcia układu (Eq.25, publiczna postać zamknięta). Bez tej korekcji układ
208 V liczyłby się TAK, jakby miał 600 V (błąd rzędu dziesiątek procent).

Konfiguracje elektrod IEEE 1584-2018 (5):
  VCB  — pionowe pręty w obudowie (Vertical Conductors in a Box).
  VCBB — pionowe pręty zakończone barierą izolacyjną w obudowie.
  HCB  — poziome pręty w obudowie (Horizontal Conductors in a Box).
  VOA  — pionowe pręty w powietrzu otwartym (Vertical Conductors in Open Air).
  HOA  — poziome pręty w powietrzu otwartym (Horizontal Conductors in Open Air).

Moduł NIE liczy fizyki solvera, NIE importuje solvera (granica warstw,
arch_guard). Wynik jest deterministyczny: identyczne wejście daje identyczny
identyfikator SHA-256.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime
from enum import Enum, StrEnum
from typing import Any

from analysis.odcisk_kontekstu import odcisk_kontekstu

# ---------------------------------------------------------------------------
# Markery, proweniencja i etykiety (maszynowo-czytelne, nienegocjowalne).
# ---------------------------------------------------------------------------

# Marker pojedynczego BRAKUJĄCEGO wpisu tablicy. Pojawia się wszędzie, gdzie
# autorytatywna wartość współczynnika NIE jest dostarczona (np. tablica NFPA 70E
# albo niepełna tablica IEEE). Stabilny — konsumenci (UI/raport/OSD/White Box)
# wykrywają po nim brak danych tablicowych.
ARC_FLASH_COEFF_MISSING_MARKER = "BRAK — wymaga tablic IEEE 1584-2018 od właściciela"

# Status zwracany, gdy obliczenie napotka pustą/niepełną tablicę współczynników.
# Mirroruje wzorzec "dane niekompletne" z innych modułów — wynik NIE jest liczbą,
# tylko jawnym brakiem danych.
ARC_FLASH_TABLE_INCOMPLETE_STATUS = "dane niekompletne — tablice współczynników IEEE 1584"

# Status zwracany, gdy brakuje OBOWIĄZKOWEGO wejścia (I_bf / U / czas łuku).
ARC_FLASH_INPUT_INCOMPLETE_STATUS = "dane niekompletne"

# Etykieta ścieżki Ralpha Lee (poza zakresem IEEE 1584-2018). JAWNIE odrębna —
# nie wolno mylić tej wartości z wynikiem IEEE 1584.
ARC_FLASH_RALPH_LEE_LABEL = "metoda Ralpha Lee (teoretyczna, poza zakresem IEEE 1584-2018)"

# Proweniencja wartości współczynników IEEE — open-source, NIE licencjonowana norma.
# String maszynowo-czytelny niesiony na KAŻDYM policzonym wyniku IEEE.
ARC_FLASH_OPEN_SOURCE_PROVENANCE = (
    "IEEE 1584-2018 via open-source MIT impl rwl/arcflash; NOT licensed-norm-verified"
)

# Polskie zastrzeżenie towarzyszące KAŻDEMU policzonemu wynikowi IEEE (open-source).
ARC_FLASH_OPEN_SOURCE_CAVEAT_PL = (
    "Współczynniki z implementacji open-source MIT rwl/arcflash; do obliczeń "
    "certyfikowanych wymagana weryfikacja z licencjonowaną IEEE Std 1584-2018"
)

# URL-e źródeł do cytowania (z pliku danych ``sources``). Niesione na wyniku, by
# proweniencja była audytowalna bez sięgania do pliku.
ARC_FLASH_SOURCE_URLS: tuple[str, ...] = (
    "https://standards.ieee.org/ieee/1584/5802/",
    "https://ieee-dataport.org/open-access/arc-flash-ie-and-iarc-calculators",
    "https://raw.githubusercontent.com/rwl/arcflash/master/src/tables/table1.rs",
    "https://raw.githubusercontent.com/rwl/arcflash/master/src/tables/table2.rs",
    "https://raw.githubusercontent.com/rwl/arcflash/master/src/tables/table3_4_5.rs",
    "https://raw.githubusercontent.com/rwl/arcflash/master/src/tables/table7.rs",
)


class ArcFlashStatus(StrEnum):
    """Status WYNIKU Arc Flash — odrębna oś od jakości danych wejściowych.

    Oś ODRĘBNA od :class:`solver_input.provenance.FieldQuality` (jakość DANYCH
    wejściowych: datasheet / oszacowane / domyślne). Tu chodzi o to, czy wynik
    został policzony, JAKĄ ścieżką i z JAKĄ proweniencją współczynników.

    - ``COMPUTED_IEEE_1584_OPEN_SOURCE`` — policzono ścieżką IEEE 1584-2018 na
      tablicy współczynników z implementacji OPEN-SOURCE MIT ``rwl/arcflash``
      (proweniencja open-source, NIE zweryfikowana z licencjonowaną normą).
      Wynik jest realny i skończony; bramka OSD blokuje użycie certyfikowane bez
      świadomej akceptacji proweniencji. To bieżący stan repo.
    - ``COMPUTED_IEEE_1584`` — policzono ścieżką IEEE 1584-2018 na tablicy
      ZWERYFIKOWANEJ wobec licencjonowanej IEEE Std 1584-2018 (proweniencja
      ``norma_IEEE_1584``). Docelowy stan po dostarczeniu zweryfikowanej tablicy;
      ten sam przepływ, BEZ zmiany kodu.
    - ``COMPUTED_RALPH_LEE`` — policzono ODRĘBNĄ metodą Ralpha Lee (poza
      zakresem ważności IEEE 1584-2018, > 15 kV). Postać zamknięta, bez tablicy.
    - ``INCOMPLETE_TABLE`` — obowiązkowe wejścia są, ale tablica współczynników
      IEEE 1584-2018 jest PUSTA/niepełna dla konfiguracji; wynik niepoliczony.
      NIE zmyślamy współczynników.
    - ``INCOMPLETE_INPUT`` — brak obowiązkowego wejścia (I_bf / U / czas łuku);
      wynik niepoliczony ("dane niekompletne"). NIE zmyślamy wejść.
    """

    COMPUTED_IEEE_1584_OPEN_SOURCE = "COMPUTED_IEEE_1584_OPEN_SOURCE"
    COMPUTED_IEEE_1584 = "COMPUTED_IEEE_1584"
    COMPUTED_RALPH_LEE = "COMPUTED_RALPH_LEE"
    INCOMPLETE_TABLE = "INCOMPLETE_TABLE"
    INCOMPLETE_INPUT = "INCOMPLETE_INPUT"

    @property
    def label_pl(self) -> str:
        return _STATUS_LABEL_PL[self]

    @property
    def is_computed(self) -> bool:
        return self in (
            ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE,
            ArcFlashStatus.COMPUTED_IEEE_1584,
            ArcFlashStatus.COMPUTED_RALPH_LEE,
        )

    @property
    def is_ieee(self) -> bool:
        """True dla ścieżki IEEE (open-source lub zweryfikowanej)."""
        return self in (
            ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE,
            ArcFlashStatus.COMPUTED_IEEE_1584,
        )


_STATUS_LABEL_PL: dict[ArcFlashStatus, str] = {
    ArcFlashStatus.COMPUTED_IEEE_1584_OPEN_SOURCE: (
        "policzony (IEEE 1584-2018, współczynniki open-source — weryfikacja z normą wymagana)"
    ),
    ArcFlashStatus.COMPUTED_IEEE_1584: "policzony (IEEE 1584-2018, tablice zweryfikowane)",
    ArcFlashStatus.COMPUTED_RALPH_LEE: ARC_FLASH_RALPH_LEE_LABEL,
    ArcFlashStatus.INCOMPLETE_TABLE: ARC_FLASH_TABLE_INCOMPLETE_STATUS,
    ArcFlashStatus.INCOMPLETE_INPUT: ARC_FLASH_INPUT_INCOMPLETE_STATUS,
}


class ArcFlashMethod(StrEnum):
    """Metoda obliczeniowa zastosowana dla punktu."""

    IEEE_1584_2018 = "IEEE_1584_2018"
    RALPH_LEE = "RALPH_LEE"


class ElectrodeConfig(StrEnum):
    """Pięć konfiguracji elektrod IEEE 1584-2018."""

    VCB = "VCB"  # pionowe pręty w obudowie
    VCBB = "VCBB"  # pionowe pręty z barierą izolacyjną w obudowie
    HCB = "HCB"  # poziome pręty w obudowie
    VOA = "VOA"  # pionowe pręty w otwartym powietrzu
    HOA = "HOA"  # poziome pręty w otwartym powietrzu

    @property
    def is_boxed(self) -> bool:
        """True dla konfiguracji w obudowie (wymaga korekcji rozmiaru obudowy)."""
        return self in (ElectrodeConfig.VCB, ElectrodeConfig.VCBB, ElectrodeConfig.HCB)


class EnclosureType(StrEnum):
    """Typ obudowy dla korekcji rozmiaru (IEEE 1584-2018, Tab. 7)."""

    TYPICAL = "Typical"  # obudowa typowa
    SHALLOW = "Shallow"  # obudowa płytka (CF = 1/x)


# ---------------------------------------------------------------------------
# Kotwy napięcia i progi/definicje publiczne (NIE współczynniki dopasowania).
# ---------------------------------------------------------------------------


class VoltageAnchor(float, Enum):
    """Trzy kotwy napięcia IEEE 1584-2018 (definicja modelu, publiczna).

    Wartości napięć są DEFINICJĄ struktury interpolacji (nie współczynnikami
    regresji). Tablica współczynników prądu/energii jest indeksowana parą
    ``(ElectrodeConfig, VoltageAnchor)``.
    """

    V600 = 0.600  # 600 V
    V2700 = 2.700  # 2700 V
    V14300 = 14.300  # 14300 V

    @property
    def voc_v(self) -> int:
        """Napięcie kotwy V_oc [V] (klucz wierszy w pliku danych)."""
        return int(round(self.value * 1000.0))


# Granica energii dla granicy łuku AFB: 1,2 cal/cm² (publiczny próg oparzenia
# II° wg Stoll/Chianta przyjęty w IEEE 1584 i NFPA 70E). To DEFINICJA fizyczna,
# nie współczynnik objęty prawem autorskim — wolno użyć.
INCIDENT_ENERGY_AFB_CAL_CM2 = 1.2

# Przelicznik J/cm² → cal/cm² (stała fizyczna). 1,2 cal/cm² = 5,0208 J/cm².
JOULE_PER_CAL_CM2 = 4.184
INCIDENT_ENERGY_AFB_JOULE_CM2 = INCIDENT_ENERGY_AFB_CAL_CM2 * JOULE_PER_CAL_CM2  # 5.0208

# Współczynnik czasu w równaniu energii IEEE 1584-2018 (publiczny, t w ms):
# E = (12,552/50)·t · 10^(...). Stała postaci równania, nie współczynnik regresji.
INCIDENT_ENERGY_TIME_FACTOR = 12.552 / 50.0

# Przelicznik mm → cal (model Tab. 7 IEEE 1584-2018 liczy EES w calach; publiczny).
MM_PER_INCH = 25.4

# Zakres ważności IEEE 1584-2018 (jawne ograniczenia specyfikacji, fakty —
# nie dane twórcze). Poza zakresem → ścieżka Ralpha Lee.
#
# UWAGA (audyt fizyki, fala G, 2026-07): zakres I_bf jest RÓŻNY dla układów
# LV (U<=600 V) i HV/SN (600 V<U<=15 kV) — norma NIE używa jednego wspólnego
# przedziału (poprzedni kod błędnie stosował 500 A-106 kA do OBU klas, co dla
# SN — GŁÓWNEGO zastosowania tego narzędzia — błędnie kwalifikowało punkty z
# I_bf 200-500 A jako "poza zakresem" i punkty z I_bf 65-106 kA jako "w
# zakresie"; zweryfikowane wobec referencyjnej implementacji open-source
# rwl/arcflash, i_arc.rs::i_arc()).
VALIDITY_VOLTAGE_MIN_KV = 0.208  # 208 V
VALIDITY_VOLTAGE_MAX_KV = 15.0  # 15 kV
VALIDITY_IBF_MIN_KA_LV = 0.5  # 500 A (208 V-600 V)
VALIDITY_IBF_MAX_KA_LV = 106.0  # 106 kA (208 V-600 V)
VALIDITY_IBF_MIN_KA_HV = 0.2  # 200 A (600 V<U<=15 kV — zakres SN tego narzędzia)
VALIDITY_IBF_MAX_KA_HV = 65.0  # 65 kA (600 V<U<=15 kV — zakres SN tego narzędzia)


# ---------------------------------------------------------------------------
# Proweniencja tablicy — tag NORMATYWNY/OPEN-SOURCE (nie "oszacowane").
# ---------------------------------------------------------------------------


class TableProvenance(StrEnum):
    """Proweniencja ŹRÓDŁA tablicy współczynników (oś normatywna/open-source).

    To NIE jest :class:`FieldQuality` (jakość danych pojedynczego pola karty):
    tu chodzi o ŹRÓDŁO tablicy współczynników.

    - ``OPEN_SOURCE_IEEE_1584`` — wartości z open-source'owej implementacji MIT
      ``rwl/arcflash`` (NIE z licencjonowanej normy). Bieżący stan repo.
    - ``NORMA_IEEE_1584`` — wartości zweryfikowane z licencjonowaną IEEE Std
      1584-2018 (docelowy stan po weryfikacji).
    - ``NORMA_NFPA_70E`` — progi kategorii ŚOI z NFPA 70E (gdy dostarczone).
    """

    OPEN_SOURCE_IEEE_1584 = "open_source_IEEE_1584"
    NORMA_IEEE_1584 = "norma_IEEE_1584"
    NORMA_NFPA_70E = "norma_NFPA_70E"

    @property
    def label_pl(self) -> str:
        return _TABLE_PROV_LABEL_PL[self]

    @property
    def is_open_source(self) -> bool:
        return self is TableProvenance.OPEN_SOURCE_IEEE_1584

    @property
    def is_verified_norm(self) -> bool:
        return self is TableProvenance.NORMA_IEEE_1584


_TABLE_PROV_LABEL_PL: dict[TableProvenance, str] = {
    TableProvenance.OPEN_SOURCE_IEEE_1584: (
        "open-source MIT rwl/arcflash (IEEE 1584-2018; NIE zweryfikowane z licencjonowaną normą)"
    ),
    TableProvenance.NORMA_IEEE_1584: "norma IEEE 1584-2018 (tablice współczynników, zweryfikowane)",
    TableProvenance.NORMA_NFPA_70E: "norma NFPA 70E (progi kategorii ŚOI)",
}


@dataclass(frozen=True)
class ArcCurrentCoeffs:
    """Współczynniki prądu łuku pośredniego IEEE 1584-2018, Tab. 1 (k1..k10).

    Postać równania (publiczna, IEEE 1584-2018):
        x1 = k1 + k2·lg(I_bf) + k3·lg(G)
        x2 = k4·I_bf^6 + k5·I_bf^5 + k6·I_bf^4 + k7·I_bf^3 + k8·I_bf^2 + k9·I_bf + k10
        I_arc = 10^x1 · x2   [kA]
    per ``(konfiguracja, kotwa napięcia)``. Pola są ``None`` dopóki tablica nie
    zostanie wypełniona — ŻADNEJ liczby udającej współczynnik. ``is_present`` ==
    True dopiero, gdy KOMPLET k1..k10 (10 wartości) został dostarczony.
    """

    k: tuple[float, ...] | None = None  # k1..k10 (10 wartości). None = BRAK.

    @property
    def is_present(self) -> bool:
        return self.k is not None and len(self.k) == 10

    def to_dict(self) -> dict[str, Any]:
        return {
            "k": list(self.k) if self.k is not None else None,
            "present": self.is_present,
            "marker": None if self.is_present else ARC_FLASH_COEFF_MISSING_MARKER,
        }


@dataclass(frozen=True)
class ArcCurrentVariationCoeffs:
    """Współczynniki zmienności prądu łuku IEEE 1584-2018, Tab. 2 (k1..k7).

    Postać równania (publiczna):
        var_cf = k1·V_oc^6 + k2·V_oc^5 + k3·V_oc^4 + k4·V_oc^3 + k5·V_oc^2
                 + k6·V_oc + k7        (V_oc w kV)
        I_arc_min = I_arc·(1 − 0,5·var_cf)
    per konfiguracja (NIE per kotwa). ``None`` dopóki niewypełnione.
    """

    k: tuple[float, ...] | None = None  # k1..k7 (7 wartości). None = BRAK.

    @property
    def is_present(self) -> bool:
        return self.k is not None and len(self.k) == 7

    def to_dict(self) -> dict[str, Any]:
        return {
            "k": list(self.k) if self.k is not None else None,
            "present": self.is_present,
            "marker": None if self.is_present else ARC_FLASH_COEFF_MISSING_MARKER,
        }


@dataclass(frozen=True)
class IncidentEnergyCoeffs:
    """Współczynniki energii incydentu / AFB IEEE 1584-2018, Tab. 3/4/5 (k1..k13).

    Postać równania (publiczna, t w ms, D w mm, E w J/cm²):
        x1 = (12,552/50)·t
        x2 = k1 + k2·lg(G)
        x3 = k3·I_arc / (k4·I_bf^7 + k5·I_bf^6 + k6·I_bf^5 + k7·I_bf^4
                          + k8·I_bf^3 + k9·I_bf^2 + k10·I_bf)
        x4 = k11·lg(I_bf) + k13·lg(I_arc) + lg(1/CF)
        x5 = k12·lg(D)
        E  = x1 · 10^(x2 + x3 + x4 + x5)   [J/cm²]
    per ``(konfiguracja, kotwa)``. Wykładnik odległości w AFB to ``k12``.
    ``None`` dopóki niewypełnione; ``is_present`` wymaga kompletu k1..k13 (13).
    """

    k: tuple[float, ...] | None = None  # k1..k13 (13 wartości). None = BRAK.

    @property
    def is_present(self) -> bool:
        return self.k is not None and len(self.k) == 13

    @property
    def distance_exponent_k12(self) -> float | None:
        """Wykładnik odległości k12 (publiczny człon ``k12·lg(D)``) — wejście AFB."""
        if self.k is None or len(self.k) != 13:
            return None
        return self.k[11]

    def to_dict(self) -> dict[str, Any]:
        return {
            "k": list(self.k) if self.k is not None else None,
            "distance_exponent_k12": self.distance_exponent_k12,
            "present": self.is_present,
            "marker": None if self.is_present else ARC_FLASH_COEFF_MISSING_MARKER,
        }


@dataclass(frozen=True)
class EnclosureCorrectionCoeffs:
    """Współczynniki korekcji rozmiaru obudowy IEEE 1584-2018, Tab. 7 (b1,b2,b3).

    Postać równania (publiczna; EES = ekwiwalentny rozmiar obudowy w calach):
        x1 = b1·EES^2 + b2·EES + b3
        CF = x1            (obudowa typowa)
        CF = 1/x1          (obudowa płytka)
    per ``(typ obudowy, konfiguracja)``. Otwarte powietrze (VOA/HOA) nie ma wpisu
    (CF = 1). ``None`` dopóki niewypełnione; ``is_present`` wymaga b1,b2,b3 (3).
    """

    b: tuple[float, ...] | None = None  # b1,b2,b3 (3 wartości). None = BRAK.

    @property
    def is_present(self) -> bool:
        return self.b is not None and len(self.b) == 3

    def to_dict(self) -> dict[str, Any]:
        return {
            "b": list(self.b) if self.b is not None else None,
            "present": self.is_present,
            "marker": None if self.is_present else ARC_FLASH_COEFF_MISSING_MARKER,
        }


@dataclass(frozen=True)
class ArcFlashCoefficientTable:
    """TYPOWANA tablica współczynników IEEE 1584-2018.

    Struktura indeksu (dopasowana do REALNEJ postaci normy):
      - ``arc_current``        : (konfiguracja, kotwa) → Tab. 1, k1..k10
      - ``arc_variation``      : konfiguracja → Tab. 2, k1..k7
      - ``incident_energy``    : (konfiguracja, kotwa) → Tab. 3/4/5, k1..k13
      - ``enclosure_correction``: (typ obudowy, konfiguracja) → Tab. 7, b1,b2,b3

    Proweniencja całej tablicy = ``OPEN_SOURCE_IEEE_1584`` (wartości z
    implementacji open-source MIT rwl/arcflash) lub ``NORMA_IEEE_1584`` (po
    weryfikacji z licencjonowaną normą — przełączenie BEZ zmiany kodu).

    PUSTA tablica (fabryka :func:`empty_ieee_1584_table`) ma KAŻDY wpis pusty —
    obliczenie na niej zwraca status ``INCOMPLETE_TABLE``. Tablica wypełniona z
    pliku danych (:func:`analysis.arc_flash.loader.load_production_ieee_1584_table`)
    liczy realny wynik (``COMPUTED_IEEE_1584_OPEN_SOURCE``).
    """

    provenance: TableProvenance
    arc_current: dict[tuple[ElectrodeConfig, VoltageAnchor], ArcCurrentCoeffs]
    arc_variation: dict[ElectrodeConfig, ArcCurrentVariationCoeffs]
    incident_energy: dict[tuple[ElectrodeConfig, VoltageAnchor], IncidentEnergyCoeffs]
    enclosure_correction: dict[tuple[EnclosureType, ElectrodeConfig], EnclosureCorrectionCoeffs]
    # Cytowane źródła współczynników (URL-e) — proweniencja audytowalna.
    source_urls: tuple[str, ...] = ()
    # Opis źródła / zastrzeżenie (jawny komunikat dla właściciela/inżyniera).
    source_note_pl: str = ARC_FLASH_COEFF_MISSING_MARKER

    def arc_entry(self, cfg: ElectrodeConfig, anchor: VoltageAnchor) -> ArcCurrentCoeffs:
        return self.arc_current.get((cfg, anchor), ArcCurrentCoeffs())

    def variation_entry(self, cfg: ElectrodeConfig) -> ArcCurrentVariationCoeffs:
        return self.arc_variation.get(cfg, ArcCurrentVariationCoeffs())

    def energy_entry(self, cfg: ElectrodeConfig, anchor: VoltageAnchor) -> IncidentEnergyCoeffs:
        return self.incident_energy.get((cfg, anchor), IncidentEnergyCoeffs())

    def enclosure_entry(
        self, enclosure_type: EnclosureType, cfg: ElectrodeConfig
    ) -> EnclosureCorrectionCoeffs:
        return self.enclosure_correction.get((enclosure_type, cfg), EnclosureCorrectionCoeffs())

    @property
    def is_empty(self) -> bool:
        """True, gdy ŻADEN wpis nie jest wypełniony (stan PUSTEJ tablicy)."""
        if any(c.is_present for c in self.arc_current.values()):
            return False
        if any(c.is_present for c in self.arc_variation.values()):
            return False
        if any(c.is_present for c in self.incident_energy.values()):
            return False
        if any(c.is_present for c in self.enclosure_correction.values()):
            return False
        return True

    def is_complete_for(
        self, cfg: ElectrodeConfig, enclosure_type: EnclosureType = EnclosureType.TYPICAL
    ) -> bool:
        """True, gdy KOMPLET współczynników dla konfiguracji ``cfg`` jest obecny.

        Wymaga: prądu łuku (Tab. 1) i energii (Tab. 3/4/5) dla WSZYSTKICH trzech
        kotew, zmienności (Tab. 2) per konfiguracja oraz — dla konfiguracji w
        obudowie — wpisu korekcji obudowy (Tab. 7) dla danego typu obudowy.
        """
        for anchor in VoltageAnchor:
            if not self.arc_entry(cfg, anchor).is_present:
                return False
            if not self.energy_entry(cfg, anchor).is_present:
                return False
        if not self.variation_entry(cfg).is_present:
            return False
        if cfg.is_boxed and not self.enclosure_entry(enclosure_type, cfg).is_present:
            return False
        return True

    def missing_for(
        self, cfg: ElectrodeConfig, enclosure_type: EnclosureType = EnclosureType.TYPICAL
    ) -> tuple[str, ...]:
        """Lista brakujących wpisów tablicy dla konfiguracji (audyt White Box)."""
        missing: list[str] = []
        for anchor in VoltageAnchor:
            if not self.arc_entry(cfg, anchor).is_present:
                missing.append(f"I_arc[{cfg.value},{anchor.name}]")
            if not self.energy_entry(cfg, anchor).is_present:
                missing.append(f"E[{cfg.value},{anchor.name}]")
        if not self.variation_entry(cfg).is_present:
            missing.append(f"var_cf[{cfg.value}]")
        if cfg.is_boxed and not self.enclosure_entry(enclosure_type, cfg).is_present:
            missing.append(f"CF[{enclosure_type.value},{cfg.value}]")
        return tuple(missing)

    def to_dict(self) -> dict[str, Any]:
        def _ckey(cfg: ElectrodeConfig, anchor: VoltageAnchor) -> str:
            return f"{cfg.value}|{anchor.name}"

        def _ekey(enc: EnclosureType, cfg: ElectrodeConfig) -> str:
            return f"{enc.value}|{cfg.value}"

        return {
            "provenance": self.provenance.value,
            "provenance_label_pl": self.provenance.label_pl,
            "is_empty": self.is_empty,
            "source_note_pl": self.source_note_pl,
            "source_urls": list(self.source_urls),
            "arc_current": {
                _ckey(cfg, anchor): self.arc_current[(cfg, anchor)].to_dict()
                for (cfg, anchor) in sorted(
                    self.arc_current.keys(), key=lambda t: (t[0].value, t[1].name)
                )
            },
            "arc_variation": {
                cfg.value: self.arc_variation[cfg].to_dict()
                for cfg in sorted(self.arc_variation.keys(), key=lambda c: c.value)
            },
            "incident_energy": {
                _ckey(cfg, anchor): self.incident_energy[(cfg, anchor)].to_dict()
                for (cfg, anchor) in sorted(
                    self.incident_energy.keys(), key=lambda t: (t[0].value, t[1].name)
                )
            },
            "enclosure_correction": {
                _ekey(enc, cfg): self.enclosure_correction[(enc, cfg)].to_dict()
                for (enc, cfg) in sorted(
                    self.enclosure_correction.keys(), key=lambda t: (t[0].value, t[1].value)
                )
            },
        }


def empty_ieee_1584_table() -> ArcFlashCoefficientTable:
    """Buduje PUSTĄ tablicę współczynników IEEE 1584-2018 (wzorzec dla testów).

    Każdy wpis jest PUSTY — ``is_present`` == False, marker BRAK. ŻADNEJ liczby
    udającej współczynnik. Proweniencja całej tablicy = ``OPEN_SOURCE_IEEE_1584``
    (oś źródła), ale bez wartości obliczenie zwraca ``INCOMPLETE_TABLE``.
    """
    arc: dict[tuple[ElectrodeConfig, VoltageAnchor], ArcCurrentCoeffs] = {}
    variation: dict[ElectrodeConfig, ArcCurrentVariationCoeffs] = {}
    energy: dict[tuple[ElectrodeConfig, VoltageAnchor], IncidentEnergyCoeffs] = {}
    enclosure: dict[tuple[EnclosureType, ElectrodeConfig], EnclosureCorrectionCoeffs] = {}
    for cfg in ElectrodeConfig:
        for anchor in VoltageAnchor:
            arc[(cfg, anchor)] = ArcCurrentCoeffs()  # k=None ⇒ BRAK
            energy[(cfg, anchor)] = IncidentEnergyCoeffs()  # k=None ⇒ BRAK
        variation[cfg] = ArcCurrentVariationCoeffs()  # k=None ⇒ BRAK
        if cfg.is_boxed:
            for enc in EnclosureType:
                enclosure[(enc, cfg)] = EnclosureCorrectionCoeffs()  # b=None ⇒ BRAK
    return ArcFlashCoefficientTable(
        provenance=TableProvenance.OPEN_SOURCE_IEEE_1584,
        arc_current=arc,
        arc_variation=variation,
        incident_energy=energy,
        enclosure_correction=enclosure,
        source_urls=(),
        source_note_pl=ARC_FLASH_COEFF_MISSING_MARKER,
    )


# ---------------------------------------------------------------------------
# Kategorie ŚOI (PPE) — progi NFPA 70E (tablicowe, PUSTE — brak danych NFPA).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PpeCategoryTable:
    """TYPOWANA tablica progów kategorii ŚOI wg NFPA 70E — DOSTARCZANA PUSTA.

    STRUKTURA (publiczna): rosnące progi energii [cal/cm²] mapowane na kategorie
    ŚOI. Plik danych NIE zawiera granic kategorii NFPA 70E — ``boundaries`` jest
    PUSTA i mapowanie zwraca "dane niekompletne — tablice NFPA 70E". ŻADNEJ
    liczby granicy udającej próg NFPA. Proweniencja = ``norma_NFPA_70E``.

    Publiczny próg granicy łuku 1,2 cal/cm² (AFB) jest definicją fizyczną i NIE
    należy do tej tablicy — używany niezależnie (AFB liczy się zawsze).
    """

    provenance: TableProvenance
    boundaries: tuple[tuple[float, str], ...] = ()
    over_limit_label_pl: str | None = None
    source_note_pl: str = ARC_FLASH_COEFF_MISSING_MARKER

    @property
    def is_empty(self) -> bool:
        return len(self.boundaries) == 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "provenance": self.provenance.value,
            "provenance_label_pl": self.provenance.label_pl,
            "is_empty": self.is_empty,
            "boundaries": [list(b) for b in self.boundaries],
            "over_limit_label_pl": self.over_limit_label_pl,
            "source_note_pl": self.source_note_pl,
        }


def empty_nfpa_70e_ppe_table() -> PpeCategoryTable:
    """Buduje PUSTĄ tablicę progów ŚOI NFPA 70E (stan produkcyjny).

    Plik danych NIE zawiera granic kategorii NFPA 70E (brak tablic NFPA), więc
    ``boundaries`` puste, marker BRAK. Mapowanie kategorii zwraca "dane
    niekompletne" dopóki właściciel nie wstawi granic. NIE fabrykujemy granic.
    """
    return PpeCategoryTable(
        provenance=TableProvenance.NORMA_NFPA_70E,
        boundaries=(),
        over_limit_label_pl=None,
        source_note_pl=ARC_FLASH_COEFF_MISSING_MARKER,
    )


# Tablica PRODUKCYJNA progów ŚOI — PUSTA (brak danych NFPA 70E).
PRODUCTION_NFPA_70E_PPE_TABLE: PpeCategoryTable = empty_nfpa_70e_ppe_table()

# Wartość zwracana jako kategoria ŚOI, gdy tablica progów jest pusta.
PPE_CATEGORY_INCOMPLETE = "dane niekompletne — tablice NFPA 70E"


# ---------------------------------------------------------------------------
# Kontekst, wejście, krok White Box, wynik.
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ArcFlashContext:
    """Kontekst raportu (deterministyczny identyfikator)."""

    project_name: str | None = None
    case_name: str | None = None
    case_id: str | None = None
    run_timestamp: datetime | None = None
    snapshot_hash: str | None = None
    run_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_name": self.project_name,
            "case_name": self.case_name,
            "case_id": self.case_id,
            "run_timestamp": self.run_timestamp.isoformat() if self.run_timestamp else None,
            "snapshot_hash": self.snapshot_hash,
            "run_id": self.run_id,
        }


@dataclass(frozen=True)
class ArcFlashInput:
    """Wejście Arc Flash dla JEDNEGO punktu (szyny/rozdzielnicy).

    Odwzorowanie z modelu (warstwa application):
    - ``i_bf_ka`` ← ``ShortCircuitResult.ikss_a`` (prąd zwarcia bolted Ik'') [kA],
    - ``voltage_kv`` ← ``ShortCircuitResult.un_v`` [kV],
    - ``arc_time_s`` ← czas wyłączenia zwarcia (z koordynacji zabezpieczeń) [s];
      to TO SAMO źródło czasu wyłączenia, którego używa obliczenie U_touch /
      uziemienia (wire-up w warstwie application).

    Pola obowiązkowe: ``i_bf_ka``, ``voltage_kv``, ``arc_time_s``. Brak
    któregokolwiek ⇒ "dane niekompletne" (BEZ zmyślania wejść).
    ``conductor_gap_mm`` i ``working_distance_mm`` są wejściami projektowymi —
    NIE mają domyślnych zmyślonych wartości (brak ⇒ "dane niekompletne").
    ``enclosure_type`` wybiera wiersz Tab. 7 (typowa/płytka) dla obudowy.
    """

    bus_ref: str
    i_bf_ka: float | None
    voltage_kv: float | None
    arc_time_s: float | None
    electrode_config: ElectrodeConfig = ElectrodeConfig.VCB
    conductor_gap_mm: float | None = None
    working_distance_mm: float | None = None
    enclosure_type: EnclosureType = EnclosureType.TYPICAL
    # Wymiary obudowy (mm) dla korekcji rozmiaru obudowy; opcjonalne.
    enclosure_width_mm: float | None = None
    enclosure_height_mm: float | None = None
    enclosure_depth_mm: float | None = None


@dataclass(frozen=True)
class WhiteBoxStep:
    """Pojedynczy krok wywodu White Box (Wzór→Dane→Podstawienie→Wynik→Jednostka).

    Identyczny kontrakt jak w ``analysis.ssci_stability`` (spójność warstwy).
    Pole ``table_ref`` wskazuje, KTÓRY wpis tablicy został użyty (lub marker BRAK).
    """

    symbol: str
    formula_latex: str
    substitution_pl: str
    result_pl: str
    unit_check_pl: str
    table_ref: str | None = None


@dataclass(frozen=True)
class ArcFlashResult:
    """Wynik Arc Flash dla jednego punktu.

    Pole ``status`` jest OBOWIĄZKOWE. Na wypełnionej tablicy open-source przyjmuje
    ``COMPUTED_IEEE_1584_OPEN_SOURCE`` (realne E/AFB + proweniencja open-source).
    Na pustej tablicy — ``INCOMPLETE_TABLE``. Poza zakresem ważności — ścieżka
    Lee (``COMPUTED_RALPH_LEE``, jawnie oznaczona). Brak wejść — ``INCOMPLETE_INPUT``.

    Pola proweniencji (``provenance``, ``provenance_caveat_pl``, ``source_urls``)
    niosą UCZCIWY status: skąd pochodzą współczynniki i że certyfikacja wymaga
    weryfikacji z licencjonowaną normą.
    """

    bus_ref: str
    status: ArcFlashStatus
    method: ArcFlashMethod
    electrode_config: str
    # --- wejścia użyte ---
    i_bf_ka: float | None
    voltage_kv: float | None
    arc_time_s: float | None
    conductor_gap_mm: float | None
    working_distance_mm: float | None
    # --- proweniencja tablic użytych ---
    coefficient_table_provenance: str  # TableProvenance.value (IEEE) lub Lee
    coefficient_table_marker: str | None  # marker BRAK gdy tablica pusta
    provenance: str | None  # ARC_FLASH_OPEN_SOURCE_PROVENANCE (na wyniku IEEE)
    provenance_caveat_pl: str | None  # polskie zastrzeżenie (na wyniku IEEE)
    source_urls: tuple[str, ...]  # cytowane URL-e źródeł
    # --- wyniki pośrednie (White Box) ---
    i_arc_ka: float | None
    i_arc_min_ka: float | None
    i_arc_at_anchors_ka: dict[str, float | None] | None
    arc_variation_cf: float | None
    enclosure_correction_cf: float | None
    incident_energy_cal_cm2: float | None
    incident_energy_joule_cm2: float | None
    arc_flash_boundary_mm: float | None
    ppe_category: str | None
    ppe_table_provenance: str | None
    # --- audyt / komunikaty ---
    why_pl: str
    missing_data: tuple[str, ...]
    white_box: tuple[WhiteBoxStep, ...]


@dataclass(frozen=True)
class ArcFlashView:
    """Widok analizy Arc Flash (jeden lub wiele punktów)."""

    analysis_id: str
    context: ArcFlashContext | None
    status: ArcFlashStatus
    coefficient_table: ArcFlashCoefficientTable
    ppe_table: PpeCategoryTable
    results: tuple[ArcFlashResult, ...]

    def to_dict(self) -> dict[str, Any]:
        from analysis.arc_flash.serializer import view_to_dict

        return view_to_dict(self)


def compute_arc_flash_id(
    context: ArcFlashContext | None,
    results: tuple[ArcFlashResult, ...],
) -> str:
    """Deterministyczny identyfikator analizy (SHA-256 kanonicznego payloadu).

    Wzorzec ``compute_ssci_stability_id`` / ``compute_grid_strength_id``.
    """
    payload = {
        "context": odcisk_kontekstu(context),
        "results": [
            {
                "bus_ref": r.bus_ref,
                "status": r.status.value,
                "method": r.method.value,
                "electrode_config": r.electrode_config,
                "i_bf_ka": r.i_bf_ka,
                "voltage_kv": r.voltage_kv,
                "arc_time_s": r.arc_time_s,
                "conductor_gap_mm": r.conductor_gap_mm,
                "working_distance_mm": r.working_distance_mm,
                "coefficient_table_provenance": r.coefficient_table_provenance,
                "coefficient_table_marker": r.coefficient_table_marker,
                "provenance": r.provenance,
                "i_arc_ka": r.i_arc_ka,
                "i_arc_min_ka": r.i_arc_min_ka,
                "i_arc_at_anchors_ka": r.i_arc_at_anchors_ka,
                "arc_variation_cf": r.arc_variation_cf,
                "enclosure_correction_cf": r.enclosure_correction_cf,
                "incident_energy_cal_cm2": r.incident_energy_cal_cm2,
                "incident_energy_joule_cm2": r.incident_energy_joule_cm2,
                "arc_flash_boundary_mm": r.arc_flash_boundary_mm,
                "ppe_category": r.ppe_category,
                "ppe_table_provenance": r.ppe_table_provenance,
                "missing_data": list(r.missing_data),
            }
            for r in results
        ],
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


# Kod gotowości (jedno źródło prawdy) blokujący pakiet OSD, gdy wynik Arc Flash
# nie nadaje się do użycia CERTYFIKOWANEGO bez świadomej akceptacji. Obejmuje
# wynik open-source (audit-pending), pustą tablicę i ścieżkę Lee. Mirroruje
# wzorzec OSD_CARD_FIELD_BLOCKER_CODE — bez równoległego systemu.
OSD_ARC_FLASH_BLOCKER_CODE = "arc_flash.not_computed_ieee_1584"


def osd_arc_flash_gate(
    view: ArcFlashView,
    accepted: bool = False,
) -> tuple[bool, list[Any]]:
    """Bramka akceptacji OSD dla wyniku Arc Flash. Blokuje TYLKO pakiet OSD.

    Wynik Arc Flash może wejść do pakietu OSD/przyłączeniowego bez blokady TYLKO
    gdy KAŻDY punkt został policzony ścieżką IEEE 1584-2018 na tablicy
    ZWERYFIKOWANEJ z licencjonowaną normą (``COMPUTED_IEEE_1584``). Wynik
    policzony na współczynnikach OPEN-SOURCE (``COMPUTED_IEEE_1584_OPEN_SOURCE``)
    jest realny, ale audit-pending — wymaga ŚWIADOMEJ akceptacji proweniencji
    open-source. Tak samo ``INCOMPLETE_TABLE``, ``INCOMPLETE_INPUT`` i
    ``COMPUTED_RALPH_LEE``.

    Emituje :class:`~enm.domain_ops_models.ReadinessBlocker` (istniejący model
    gotowości — bez drugiej prawdy) z polskim komunikatem.

    Args:
        view: widok analizy Arc Flash.
        accepted: czy inżynier świadomie zaakceptował wynik (w tym proweniencję
            open-source) do pakietu OSD.

    Returns:
        ``(ready, blockers)``.
    """
    from enm.domain_ops_models import ReadinessBlocker  # lazy: granica warstw

    all_verified = bool(view.results) and all(
        r.status is ArcFlashStatus.COMPUTED_IEEE_1584 for r in view.results
    )
    if all_verified or accepted:
        return (True, [])

    return (
        False,
        [
            ReadinessBlocker(
                code=OSD_ARC_FLASH_BLOCKER_CODE,
                message_pl=(
                    "Wynik Arc Flash nie jest policzony ścieżką IEEE 1584-2018 na "
                    f"tablicy ZWERYFIKOWANEJ z licencjonowaną normą ({view.status.label_pl}); "
                    "wymaga świadomej akceptacji inżyniera (w tym proweniencji open-source) "
                    "przed pakietem OSD/przyłączeniowym"
                ),
                element_ref=None,
            )
        ],
    )


__all__ = [
    "ARC_FLASH_COEFF_MISSING_MARKER",
    "ARC_FLASH_INPUT_INCOMPLETE_STATUS",
    "ARC_FLASH_OPEN_SOURCE_CAVEAT_PL",
    "ARC_FLASH_OPEN_SOURCE_PROVENANCE",
    "ARC_FLASH_RALPH_LEE_LABEL",
    "ARC_FLASH_SOURCE_URLS",
    "ARC_FLASH_TABLE_INCOMPLETE_STATUS",
    "INCIDENT_ENERGY_AFB_CAL_CM2",
    "INCIDENT_ENERGY_AFB_JOULE_CM2",
    "INCIDENT_ENERGY_TIME_FACTOR",
    "JOULE_PER_CAL_CM2",
    "MM_PER_INCH",
    "OSD_ARC_FLASH_BLOCKER_CODE",
    "PPE_CATEGORY_INCOMPLETE",
    "PRODUCTION_NFPA_70E_PPE_TABLE",
    "VALIDITY_IBF_MAX_KA_HV",
    "VALIDITY_IBF_MAX_KA_LV",
    "VALIDITY_IBF_MIN_KA_HV",
    "VALIDITY_IBF_MIN_KA_LV",
    "VALIDITY_VOLTAGE_MAX_KV",
    "VALIDITY_VOLTAGE_MIN_KV",
    "ArcCurrentCoeffs",
    "ArcCurrentVariationCoeffs",
    "ArcFlashCoefficientTable",
    "ArcFlashContext",
    "ArcFlashInput",
    "ArcFlashMethod",
    "ArcFlashResult",
    "ArcFlashStatus",
    "ArcFlashView",
    "ElectrodeConfig",
    "EnclosureCorrectionCoeffs",
    "EnclosureType",
    "IncidentEnergyCoeffs",
    "PpeCategoryTable",
    "TableProvenance",
    "VoltageAnchor",
    "WhiteBoxStep",
    "compute_arc_flash_id",
    "empty_ieee_1584_table",
    "empty_nfpa_70e_ppe_table",
    "osd_arc_flash_gate",
]
