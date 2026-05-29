"""Modele D-01 Arc Flash — STRUKTURA IEEE 1584-2018 z PUSTĄ TABLICĄ współczynników.

WARSTWA ANALIZY / OBLICZENIA (interpretacja wyniku zwarciowego, NIE fizyka
solvera — Z15). Moduł odczytuje GOTOWY wynik zwarciowy (prąd zwarcia bolted
``I_bf`` z solvera IEC 60909 — ``ShortCircuitResult.ikss_a``) i wylicza energię
incydentu, granicę łuku oraz kategorię ŚOI wg STRUKTURY (równań) opublikowanej
w IEEE 1584-2018.

╔══════════════════════════════════════════════════════════════════════════╗
║  DYSCYPLINA DANYCH BEZPIECZEŃSTWA — TABLICA WSPÓŁCZYNNIKÓW JEST PUSTA       ║
║                                                                            ║
║  To jest FIZYKA BEZPIECZEŃSTWA (kategorie ŚOI, granice łuku elektrycznego).║
║  Błędna wartość współczynnika to DOKŁADNIE to zagrożenie, przed którym     ║
║  chronimy — dlatego ŻADEN współczynnik NIE jest tu zmyślany ani odtwarzany ║
║  z pamięci.                                                                ║
║                                                                            ║
║  • STRUKTURA / równania modelu są publiczne i zbudowane w pełni (przepływ  ║
║    parametryzowany tablicą).                                               ║
║  • WARTOŚCI współczynników regresji to dane tablicowe IEEE 1584-2018       ║
║    (objęte prawem autorskim). Tablica jest dostarczona PUSTA — każdy wpis  ║
║    nosi marker ``BRAK — wymaga tablic IEEE 1584-2018 od właściciela``.     ║
║    BRAK liczby udającej współczynnik: brakujący współczynnik to None.      ║
║                                                                            ║
║  Obliczenie na pustej tablicy zwraca STATUS                                ║
║  ``dane niekompletne — tablice współczynników IEEE 1584`` (NIE liczbę).    ║
║  Gdy właściciel wypełni tablicę autorytatywnymi wartościami, TEN SAM       ║
║  przepływ policzy wynik, a proweniencja stanie się ``norma_IEEE_1584``     ║
║  (zweryfikowana). Ścieżka „przełączenia na zweryfikowane” jest gotowa.     ║
╚══════════════════════════════════════════════════════════════════════════╝

Struktura modelu (IEEE 1584-2018, publiczna — parametryzowana tablicą):
  - Prąd łuku ``I_arc`` z prądu zwarcia bolted ``I_bf``, napięcia, odstępu
    elektrod ``G`` i konfiguracji elektrod; liczony w trzech kotwach napięcia
    600 / 2700 / 14300 V i interpolowany między kotwami otaczającymi napięcie.
  - Energia incydentu ``E`` na odległości roboczej ``D`` w czasie łuku ``t`` z
    korekcją rozmiaru obudowy (również tablicowa, pusta).
  - Granica łuku ``AFB`` — odległość, na której ``E = 1,2 cal/cm²`` (publiczny
    próg oparzenia II°).
  - Kategoria ŚOI — mapowanie progów NFPA 70E:2024 (granice również tablicowe,
    puste — proweniencja ``norma_NFPA_70E``).

Zakres ważności IEEE 1584-2018: 208 V–15 kV, I_bf 500 A–106 kA. POZA zakresem
(zwłaszcza > 15 kV) — ODRĘBNA ścieżka metody Ralpha Lee (teoretyczna metoda
maksymalnej mocy łuku), JAWNIE oznaczona jako Ralph Lee (NIE jako IEEE 1584).
Metoda Lee to publiczna postać zamknięta (bez tablicy) — zaimplementowana.

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
from enum import Enum
from typing import Any

# ---------------------------------------------------------------------------
# Markery i etykiety (maszynowo-czytelne, nienegocjowalne kontrakty).
# ---------------------------------------------------------------------------

# Marker pojedynczego BRAKUJĄCEGO wpisu tablicy. Pojawia się wszędzie, gdzie
# autorytatywna wartość IEEE 1584-2018 NIE jest jeszcze dostarczona. Stabilny —
# konsumenci (UI/raport/OSD/White Box) wykrywają po nim brak danych tablicowych.
ARC_FLASH_COEFF_MISSING_MARKER = "BRAK — wymaga tablic IEEE 1584-2018 od właściciela"

# Status zwracany, gdy obliczenie napotka pustą tablicę współczynników IEEE.
# Mirroruje wzorzec "dane niekompletne" z solverów (np. v126_academic) — wynik
# NIE jest liczbą, tylko jawnym brakiem danych normatywnych.
ARC_FLASH_TABLE_INCOMPLETE_STATUS = "dane niekompletne — tablice współczynników IEEE 1584"

# Status zwracany, gdy brakuje OBOWIĄZKOWEGO wejścia (I_bf / U / czas łuku).
ARC_FLASH_INPUT_INCOMPLETE_STATUS = "dane niekompletne"

# Etykieta ścieżki Ralpha Lee (poza zakresem IEEE 1584-2018). JAWNIE odrębna —
# nie wolno mylić tej wartości z wynikiem IEEE 1584.
ARC_FLASH_RALPH_LEE_LABEL = "metoda Ralpha Lee (teoretyczna, poza zakresem IEEE 1584-2018)"


class ArcFlashStatus(str, Enum):
    """Status WYNIKU Arc Flash — odrębna oś od jakości danych wejściowych.

    Oś ODRĘBNA od :class:`solver_input.provenance.FieldQuality` (jakość DANYCH
    wejściowych: datasheet / oszacowane / domyślne). Tu chodzi o to, czy wynik
    został policzony i z jakiej ścieżki — nie o jakość pojedynczego pola.

    - ``COMPUTED_IEEE_1584`` — policzono ścieżką IEEE 1584-2018 na WYPEŁNIONEJ,
      autorytatywnej tablicy współczynników (proweniencja ``norma_IEEE_1584``,
      zweryfikowana). W pustym repozytorium ten status NIE wystąpi — pojawi się
      dopiero, gdy właściciel dostarczy tablice. Ścieżka jest gotowa.
    - ``COMPUTED_RALPH_LEE`` — policzono ODRĘBNĄ metodą Ralpha Lee (poza
      zakresem ważności IEEE 1584-2018, > 15 kV). Postać zamknięta, bez tablicy.
    - ``INCOMPLETE_TABLE`` — obowiązkowe wejścia są, ale tablica współczynników
      IEEE 1584-2018 jest PUSTA; wynik niepoliczony ("dane niekompletne —
      tablice współczynników IEEE 1584"). NIE zmyślamy współczynników.
    - ``INCOMPLETE_INPUT`` — brak obowiązkowego wejścia (I_bf / U / czas łuku);
      wynik niepoliczony ("dane niekompletne"). NIE zmyślamy wejść.
    """

    COMPUTED_IEEE_1584 = "COMPUTED_IEEE_1584"
    COMPUTED_RALPH_LEE = "COMPUTED_RALPH_LEE"
    INCOMPLETE_TABLE = "INCOMPLETE_TABLE"
    INCOMPLETE_INPUT = "INCOMPLETE_INPUT"

    @property
    def label_pl(self) -> str:
        return _STATUS_LABEL_PL[self]

    @property
    def is_computed(self) -> bool:
        return self in (ArcFlashStatus.COMPUTED_IEEE_1584, ArcFlashStatus.COMPUTED_RALPH_LEE)


_STATUS_LABEL_PL: dict[ArcFlashStatus, str] = {
    ArcFlashStatus.COMPUTED_IEEE_1584: "policzony (IEEE 1584-2018, tablice zweryfikowane)",
    ArcFlashStatus.COMPUTED_RALPH_LEE: ARC_FLASH_RALPH_LEE_LABEL,
    ArcFlashStatus.INCOMPLETE_TABLE: ARC_FLASH_TABLE_INCOMPLETE_STATUS,
    ArcFlashStatus.INCOMPLETE_INPUT: ARC_FLASH_INPUT_INCOMPLETE_STATUS,
}


class ArcFlashMethod(str, Enum):
    """Metoda obliczeniowa zastosowana dla punktu."""

    IEEE_1584_2018 = "IEEE_1584_2018"
    RALPH_LEE = "RALPH_LEE"


class ElectrodeConfig(str, Enum):
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


# ---------------------------------------------------------------------------
# Kotwy napięcia i progi/definicje publiczne (NIE współczynniki dopasowania).
# ---------------------------------------------------------------------------


class VoltageAnchor(float, Enum):
    """Trzy kotwy napięcia IEEE 1584-2018 (definicja modelu, publiczna).

    Wartości napięć są DEFINICJĄ struktury interpolacji (nie współczynnikami
    regresji objętymi prawem autorskim). Tablica współczynników jest indeksowana
    parą ``(ElectrodeConfig, VoltageAnchor)``.
    """

    V600 = 0.600  # 600 V
    V2700 = 2.700  # 2700 V
    V14300 = 14.300  # 14300 V


# Granica energii dla granicy łuku AFB: 1,2 cal/cm² (publiczny próg oparzenia
# II° wg Stoll/Chianta przyjęty w IEEE 1584 i NFPA 70E). To DEFINICJA fizyczna,
# nie współczynnik objęty prawem autorskim — wolno użyć.
INCIDENT_ENERGY_AFB_CAL_CM2 = 1.2

# Przelicznik J/cm² → cal/cm² (stała fizyczna).
JOULE_PER_CAL_CM2 = 4.184

# Odległość odniesienia energii (610 mm) i czas odniesienia (0,2 s) — definicje
# modelu IEEE 1584-2018 (publiczne ramy normalizacji, nie współczynniki regresji).
REFERENCE_DISTANCE_MM = 610.0
REFERENCE_TIME_S = 0.2

# Zakres ważności IEEE 1584-2018 (jawne ograniczenia specyfikacji, fakty —
# nie dane twórcze). Poza zakresem → ścieżka Ralpha Lee.
VALIDITY_VOLTAGE_MIN_KV = 0.208  # 208 V
VALIDITY_VOLTAGE_MAX_KV = 15.0  # 15 kV
VALIDITY_IBF_MIN_KA = 0.5  # 500 A
VALIDITY_IBF_MAX_KA = 106.0  # 106 kA


# ---------------------------------------------------------------------------
# Proweniencja tablicy — tag NORMATYWNY (nie "oszacowane").
# ---------------------------------------------------------------------------


class TableProvenance(str, Enum):
    """Proweniencja ŹRÓDŁA tablicy współczynników (oś normatywna).

    To NIE jest :class:`FieldQuality` (jakość danych pojedynczego pola karty):
    tu chodzi o ŹRÓDŁO NORMATYWNE tablicy współczynników. Tag ``norma_IEEE_1584``
    / ``norma_NFPA_70E`` oznacza, że tablica MA pochodzić z autorytatywnej normy
    (nie z oszacowania). Pusta tablica nadal nosi ten tag — deklaruje, JAKIE
    źródło jest wymagane do jej wypełnienia.
    """

    NORMA_IEEE_1584 = "norma_IEEE_1584"
    NORMA_NFPA_70E = "norma_NFPA_70E"

    @property
    def label_pl(self) -> str:
        return _TABLE_PROV_LABEL_PL[self]


_TABLE_PROV_LABEL_PL: dict[TableProvenance, str] = {
    TableProvenance.NORMA_IEEE_1584: "norma IEEE 1584-2018 (tablice współczynników)",
    TableProvenance.NORMA_NFPA_70E: "norma NFPA 70E:2024 (progi kategorii ŚOI)",
}


@dataclass(frozen=True)
class ArcCurrentCoeffs:
    """Współczynniki modelu prądu łuku IEEE 1584-2018 dla JEDNEJ kotwy napięcia.

    STRUKTURA (publiczna): wielomian ``log10(I_arc)`` w ``log10(I_bf)`` i odstępie
    elektrod ``G`` na danym poziomie napięcia (kotwie). Pełna postać normy ma
    człony ``k1..k13`` per ``(konfiguracja, kotwa)``. Tu pola są ``None`` dopóki
    właściciel nie wstawi autorytatywnych wartości — ŻADNEJ liczby udającej
    współczynnik. ``is_present`` == True dopiero, gdy KOMPLET współczynników
    został dostarczony.
    """

    # Współczynniki wielomianu IEEE 1584-2018 §... (k1..k13). None = BRAK.
    k: tuple[float, ...] | None = None

    @property
    def is_present(self) -> bool:
        return self.k is not None and len(self.k) > 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "k": list(self.k) if self.k is not None else None,
            "present": self.is_present,
            "marker": None if self.is_present else ARC_FLASH_COEFF_MISSING_MARKER,
        }


@dataclass(frozen=True)
class IncidentEnergyCoeffs:
    """Współczynniki modelu energii incydentu IEEE 1584-2018 dla JEDNEJ kotwy.

    STRUKTURA (publiczna): postać znormalizowana energii na 610 mm / 0,2 s,
    skalowana do czasu ``t`` i odległości roboczej ``D`` z wykładnikiem odległości.
    Pełna postać normy ma człony per ``(konfiguracja, kotwa)`` + wykładnik. Tu
    pola są ``None`` dopóki właściciel nie wstawi autorytatywnych wartości.
    """

    # Współczynniki energii (b1..bN). None = BRAK.
    b: tuple[float, ...] | None = None
    # Wykładnik odległości x. None = BRAK.
    distance_exponent_x: float | None = None

    @property
    def is_present(self) -> bool:
        return self.b is not None and len(self.b) > 0 and self.distance_exponent_x is not None

    def to_dict(self) -> dict[str, Any]:
        return {
            "b": list(self.b) if self.b is not None else None,
            "distance_exponent_x": self.distance_exponent_x,
            "present": self.is_present,
            "marker": None if self.is_present else ARC_FLASH_COEFF_MISSING_MARKER,
        }


@dataclass(frozen=True)
class EnclosureCorrectionCoeffs:
    """Współczynniki korekcji rozmiaru obudowy IEEE 1584-2018 (tablicowe, puste).

    STRUKTURA (publiczna): korekcja energii dla konfiguracji w obudowie zależna od
    wymiarów obudowy (rozmiar ekwiwalentny) per konfiguracja. Pełna postać normy
    używa tablicowych współczynników — tu pola ``None`` dopóki nie dostarczono
    autorytatywnych wartości. Otwarte powietrze nie wymaga korekcji (CF = 1).
    """

    # Współczynniki korekcji obudowy (b1..bN). None = BRAK.
    b: tuple[float, ...] | None = None

    @property
    def is_present(self) -> bool:
        return self.b is not None and len(self.b) > 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "b": list(self.b) if self.b is not None else None,
            "present": self.is_present,
            "marker": None if self.is_present else ARC_FLASH_COEFF_MISSING_MARKER,
        }


@dataclass(frozen=True)
class ArcFlashCoefficientTable:
    """TYPOWANA tablica współczynników IEEE 1584-2018 — DOSTARCZANA PUSTA.

    Struktura indeksu: ``konfiguracja elektrod × kotwa napięcia × zestaw
    współczynników``. Proweniencja całej tablicy = ``norma_IEEE_1584``
    (źródło NORMATYWNE, nie ``oszacowane``).

    PUSTA tablica (fabryka :func:`empty_ieee_1584_table`) ma KAŻDY wpis pusty
    (``is_present`` == False) — obliczenie na niej zwraca status
    ``INCOMPLETE_TABLE``. Gdy właściciel dostarczy autorytatywne wartości i
    zbuduje tablicę z ``is_complete`` == True, TEN SAM przepływ policzy wynik
    IEEE 1584-2018 (``COMPUTED_IEEE_1584``). Konstrukcja gotowa na to przełączenie.
    """

    provenance: TableProvenance
    # Prąd łuku per (konfiguracja, kotwa).
    arc_current: dict[tuple[ElectrodeConfig, VoltageAnchor], ArcCurrentCoeffs]
    # Energia incydentu per (konfiguracja, kotwa).
    incident_energy: dict[tuple[ElectrodeConfig, VoltageAnchor], IncidentEnergyCoeffs]
    # Korekcja rozmiaru obudowy per konfiguracja (tylko w obudowie).
    enclosure_correction: dict[ElectrodeConfig, EnclosureCorrectionCoeffs]
    # Opis źródła wymaganego do wypełnienia (jawny komunikat dla właściciela).
    source_note_pl: str = ARC_FLASH_COEFF_MISSING_MARKER

    def arc_entry(self, cfg: ElectrodeConfig, anchor: VoltageAnchor) -> ArcCurrentCoeffs:
        return self.arc_current.get((cfg, anchor), ArcCurrentCoeffs())

    def energy_entry(self, cfg: ElectrodeConfig, anchor: VoltageAnchor) -> IncidentEnergyCoeffs:
        return self.incident_energy.get((cfg, anchor), IncidentEnergyCoeffs())

    def enclosure_entry(self, cfg: ElectrodeConfig) -> EnclosureCorrectionCoeffs:
        return self.enclosure_correction.get(cfg, EnclosureCorrectionCoeffs())

    @property
    def is_empty(self) -> bool:
        """True, gdy ŻADEN wpis nie jest wypełniony (stan produkcyjny w repo)."""
        if any(c.is_present for c in self.arc_current.values()):
            return False
        if any(c.is_present for c in self.incident_energy.values()):
            return False
        if any(c.is_present for c in self.enclosure_correction.values()):
            return False
        return True

    def is_complete_for(self, cfg: ElectrodeConfig) -> bool:
        """True, gdy KOMPLET współczynników dla konfiguracji ``cfg`` jest obecny.

        Wymaga: prądu łuku i energii dla WSZYSTKICH trzech kotew oraz — dla
        konfiguracji w obudowie — wpisu korekcji obudowy. Tylko wtedy ścieżka
        IEEE 1584-2018 może policzyć wynik dla tej konfiguracji.
        """
        for anchor in VoltageAnchor:
            if not self.arc_entry(cfg, anchor).is_present:
                return False
            if not self.energy_entry(cfg, anchor).is_present:
                return False
        if cfg.is_boxed and not self.enclosure_entry(cfg).is_present:
            return False
        return True

    def missing_for(self, cfg: ElectrodeConfig) -> tuple[str, ...]:
        """Lista brakujących wpisów tablicy dla konfiguracji (audyt White Box)."""
        missing: list[str] = []
        for anchor in VoltageAnchor:
            if not self.arc_entry(cfg, anchor).is_present:
                missing.append(f"I_arc[{cfg.value},{anchor.name}]")
            if not self.energy_entry(cfg, anchor).is_present:
                missing.append(f"E[{cfg.value},{anchor.name}]")
        if cfg.is_boxed and not self.enclosure_entry(cfg).is_present:
            missing.append(f"CF[{cfg.value}]")
        return tuple(missing)

    def to_dict(self) -> dict[str, Any]:
        def _key(cfg: ElectrodeConfig, anchor: VoltageAnchor) -> str:
            return f"{cfg.value}|{anchor.name}"

        return {
            "provenance": self.provenance.value,
            "provenance_label_pl": self.provenance.label_pl,
            "is_empty": self.is_empty,
            "source_note_pl": self.source_note_pl,
            "arc_current": {
                _key(cfg, anchor): self.arc_current[(cfg, anchor)].to_dict()
                for (cfg, anchor) in sorted(
                    self.arc_current.keys(), key=lambda t: (t[0].value, t[1].name)
                )
            },
            "incident_energy": {
                _key(cfg, anchor): self.incident_energy[(cfg, anchor)].to_dict()
                for (cfg, anchor) in sorted(
                    self.incident_energy.keys(), key=lambda t: (t[0].value, t[1].name)
                )
            },
            "enclosure_correction": {
                cfg.value: self.enclosure_correction[cfg].to_dict()
                for cfg in sorted(self.enclosure_correction.keys(), key=lambda c: c.value)
            },
        }


def empty_ieee_1584_table() -> ArcFlashCoefficientTable:
    """Buduje PUSTĄ tablicę współczynników IEEE 1584-2018 (stan produkcyjny).

    Każdy wpis (prąd łuku per kotwa, energia per kotwa, korekcja obudowy) jest
    PUSTY — ``is_present`` == False, marker ``BRAK — wymaga tablic IEEE 1584-2018
    od właściciela``. ŻADNEJ liczby udającej współczynnik. Proweniencja całej
    tablicy = ``norma_IEEE_1584``.

    Gdy właściciel dostarczy autorytatywne wartości, zbuduje analogiczną tablicę
    z wypełnionymi ``ArcCurrentCoeffs(k=...)`` / ``IncidentEnergyCoeffs(b=..., x=...)``
    / ``EnclosureCorrectionCoeffs(b=...)`` — i TEN SAM przepływ policzy wynik.
    """
    arc: dict[tuple[ElectrodeConfig, VoltageAnchor], ArcCurrentCoeffs] = {}
    energy: dict[tuple[ElectrodeConfig, VoltageAnchor], IncidentEnergyCoeffs] = {}
    enclosure: dict[ElectrodeConfig, EnclosureCorrectionCoeffs] = {}
    for cfg in ElectrodeConfig:
        for anchor in VoltageAnchor:
            arc[(cfg, anchor)] = ArcCurrentCoeffs()  # k=None ⇒ BRAK
            energy[(cfg, anchor)] = IncidentEnergyCoeffs()  # b=None, x=None ⇒ BRAK
        enclosure[cfg] = EnclosureCorrectionCoeffs()  # b=None ⇒ BRAK
    return ArcFlashCoefficientTable(
        provenance=TableProvenance.NORMA_IEEE_1584,
        arc_current=arc,
        incident_energy=energy,
        enclosure_correction=enclosure,
        source_note_pl=ARC_FLASH_COEFF_MISSING_MARKER,
    )


# Tablica PRODUKCYJNA — PUSTA. Konsumenci importują tę instancję; jest pusta,
# więc każda ścieżka IEEE 1584-2018 zwraca "dane niekompletne — tablice
# współczynników IEEE 1584" dopóki właściciel jej nie wypełni.
PRODUCTION_IEEE_1584_TABLE: ArcFlashCoefficientTable = empty_ieee_1584_table()


# ---------------------------------------------------------------------------
# Kategorie ŚOI (PPE) — progi NFPA 70E:2024 (tablicowe, PUSTE).
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class PpeCategoryTable:
    """TYPOWANA tablica progów kategorii ŚOI wg NFPA 70E:2024 — DOSTARCZANA PUSTA.

    STRUKTURA (publiczna): rosnące progi energii [cal/cm²] mapowane na kategorie
    ŚOI (Tab. 130.7(C)(15)(a)). WARTOŚCI granic są danymi tablicowymi NFPA 70E
    (objęte prawem autorskim) — tu ``boundaries`` jest PUSTA dopóki właściciel
    nie wstawi autorytatywnych granic. ŻADNEJ liczby granicy udającej próg NFPA.
    Proweniencja = ``norma_NFPA_70E``.

    Publiczny próg granicy łuku 1,2 cal/cm² (AFB) jest definicją fizyczną i
    NIE należy do tej tablicy — używany niezależnie.
    """

    provenance: TableProvenance
    # Rosnące pary (próg_cal_cm2, kategoria). PUSTA ⇒ kategoria niedostępna.
    boundaries: tuple[tuple[float, str], ...] = ()
    over_limit_label_pl: str | None = None  # etykieta strefy zabronionej; None = BRAK
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
    """Buduje PUSTĄ tablicę progów ŚOI NFPA 70E:2024 (stan produkcyjny).

    ``boundaries`` puste, marker ``BRAK — wymaga tablic IEEE 1584-2018 od
    właściciela`` (analogiczna dyscyplina dla danych NFPA). Mapowanie kategorii
    zwraca "dane niekompletne" dopóki właściciel nie wstawi granic.
    """
    return PpeCategoryTable(
        provenance=TableProvenance.NORMA_NFPA_70E,
        boundaries=(),
        over_limit_label_pl=None,
        source_note_pl=ARC_FLASH_COEFF_MISSING_MARKER,
    )


# Tablica PRODUKCYJNA progów ŚOI — PUSTA.
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
    run_timestamp: datetime | None = None
    snapshot_id: str | None = None
    trace_id: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_name": self.project_name,
            "case_name": self.case_name,
            "run_timestamp": self.run_timestamp.isoformat() if self.run_timestamp else None,
            "snapshot_id": self.snapshot_id,
            "trace_id": self.trace_id,
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
    """

    bus_ref: str
    i_bf_ka: float | None
    voltage_kv: float | None
    arc_time_s: float | None
    electrode_config: ElectrodeConfig = ElectrodeConfig.VCB
    conductor_gap_mm: float | None = None
    working_distance_mm: float | None = None
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

    Pole ``status`` jest OBOWIĄZKOWE. Na pustej tablicy produkcyjnej przyjmuje
    ``INCOMPLETE_TABLE`` (wartości pośrednie None — NIE zmyślamy). Gdy tablica
    wypełniona — ``COMPUTED_IEEE_1584``. Poza zakresem ważności — ścieżka Lee
    (``COMPUTED_RALPH_LEE``, jawnie oznaczona). Brak wejść — ``INCOMPLETE_INPUT``.
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
    # --- wyniki pośrednie (White Box) ---
    i_arc_ka: float | None
    i_arc_at_anchors_ka: dict[str, float | None] | None
    enclosure_correction_cf: float | None
    incident_energy_cal_cm2: float | None
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
        "context": context.to_dict() if context else None,
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
                "i_arc_ka": r.i_arc_ka,
                "i_arc_at_anchors_ka": r.i_arc_at_anchors_ka,
                "enclosure_correction_cf": r.enclosure_correction_cf,
                "incident_energy_cal_cm2": r.incident_energy_cal_cm2,
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
# nie jest policzony ścieżką IEEE 1584-2018 (pusta tablica lub ścieżka Lee).
# Mirroruje wzorzec OSD_CARD_FIELD_BLOCKER_CODE — bez równoległego systemu.
OSD_ARC_FLASH_BLOCKER_CODE = "arc_flash.not_computed_ieee_1584"


def osd_arc_flash_gate(
    view: ArcFlashView,
    accepted: bool = False,
) -> tuple[bool, list[Any]]:
    """Bramka akceptacji OSD dla wyniku Arc Flash. Blokuje TYLKO pakiet OSD.

    Wynik Arc Flash może wejść do pakietu OSD bez blokady TYLKO gdy KAŻDY punkt
    został policzony ścieżką IEEE 1584-2018 na wypełnionej tablicy
    (``COMPUTED_IEEE_1584``). Jeżeli którykolwiek punkt jest ``INCOMPLETE_TABLE``
    (pusta tablica), ``INCOMPLETE_INPUT`` lub ``COMPUTED_RALPH_LEE`` (poza
    zakresem normy) — wynik wymaga ŚWIADOMEJ akceptacji inżyniera.

    Emituje :class:`~enm.domain_ops_models.ReadinessBlocker` (istniejący model
    gotowości — bez drugiej prawdy) z polskim komunikatem.

    Args:
        view: widok analizy Arc Flash.
        accepted: czy inżynier świadomie zaakceptował wynik do OSD.

    Returns:
        ``(ready, blockers)``.
    """
    from enm.domain_ops_models import ReadinessBlocker  # lazy: granica warstw

    all_ieee = bool(view.results) and all(
        r.status is ArcFlashStatus.COMPUTED_IEEE_1584 for r in view.results
    )
    if all_ieee or accepted:
        return (True, [])

    return (
        False,
        [
            ReadinessBlocker(
                code=OSD_ARC_FLASH_BLOCKER_CODE,
                message_pl=(
                    "Wynik Arc Flash nie jest policzony ścieżką IEEE 1584-2018 na "
                    f"wypełnionej tablicy ({view.status.label_pl}); wymaga świadomej "
                    "akceptacji inżyniera przed pakietem OSD"
                ),
                element_ref=None,
            )
        ],
    )


__all__ = [
    "ARC_FLASH_COEFF_MISSING_MARKER",
    "ARC_FLASH_INPUT_INCOMPLETE_STATUS",
    "ARC_FLASH_RALPH_LEE_LABEL",
    "ARC_FLASH_TABLE_INCOMPLETE_STATUS",
    "INCIDENT_ENERGY_AFB_CAL_CM2",
    "JOULE_PER_CAL_CM2",
    "OSD_ARC_FLASH_BLOCKER_CODE",
    "PPE_CATEGORY_INCOMPLETE",
    "PRODUCTION_IEEE_1584_TABLE",
    "PRODUCTION_NFPA_70E_PPE_TABLE",
    "REFERENCE_DISTANCE_MM",
    "REFERENCE_TIME_S",
    "VALIDITY_IBF_MAX_KA",
    "VALIDITY_IBF_MIN_KA",
    "VALIDITY_VOLTAGE_MAX_KV",
    "VALIDITY_VOLTAGE_MIN_KV",
    "ArcCurrentCoeffs",
    "ArcFlashCoefficientTable",
    "ArcFlashContext",
    "ArcFlashInput",
    "ArcFlashMethod",
    "ArcFlashResult",
    "ArcFlashStatus",
    "ArcFlashView",
    "ElectrodeConfig",
    "EnclosureCorrectionCoeffs",
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
