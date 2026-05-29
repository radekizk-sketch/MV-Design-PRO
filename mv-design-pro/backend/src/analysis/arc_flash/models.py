"""Modele D-01 Arc Flash — energia incydentu wg STRUKTURY IEEE 1584-2018.

WARSTWA ANALIZY / OBLICZENIA (interpretacja wyniku zwarciowego, NIE fizyka
solvera — Z15). Moduł odczytuje GOTOWY wynik zwarciowy (prąd zwarcia bolted
``I_bf`` z solvera IEC 60909 — ``ShortCircuitResult.ikss_a``) i wylicza energię
incydentu, granicę łuku oraz kategorię ŚOI wg STRUKTURY (równań) opublikowanej
w IEEE 1584-2018.

╔══════════════════════════════════════════════════════════════════════════╗
║  OSTRZEŻENIE BEZPIECZEŃSTWA — WERSJA BEST-EFFORT, NIEZWERYFIKOWANA          ║
║                                                                            ║
║  To jest FIZYKA BEZPIECZEŃSTWA (kategorie ŚOI, granice łuku elektrycznego).║
║  Właściciel ŚWIADOMIE zlecił wersję best-effort, PONIEWAŻ autorytatywne    ║
║  tablice współczynników IEEE 1584-2018 NIE są dostępne w repozytorium.     ║
║                                                                            ║
║  • STRUKTURA / równania modelu są odtworzone wiernie wg publikacji normy.  ║
║  • WARTOŚCI współczynników są best-effort z wiedzy i NIEZWERYFIKOWANE      ║
║    wobec autorytatywnych tablic normy.                                     ║
║  • Model NIE został zwalidowany wobec przykładu obliczeniowego z normy     ║
║    (brak dostępu do tego przykładu) — to ograniczenie jest jawne.          ║
║                                                                            ║
║  KAŻDY wynik i KAŻDY współczynnik nosi maszynowo-czytelną etykietę         ║
║  ``DO WERYFIKACJI wobec IEEE 1584-2018``. Żaden konsument (UI, raport,     ║
║  pakiet OSD) NIE może pomylić tych wartości ze zweryfikowanymi wartościami ║
║  bezpieczeństwa. Wynik jest ZABLOKOWANY przed pakietem OSD bez świadomej   ║
║  akceptacji inżyniera (ReadinessBlocker).                                  ║
╚══════════════════════════════════════════════════════════════════════════╝

Struktura modelu (IEEE 1584-2018, odtworzona — sekcje/równania wskazane gdzie
znane; współczynniki best-effort):
  - Prąd łuku ``I_arc`` — model log-liniowy 2018 (równania §4.3, wsp. k1..k13
    per konfiguracja elektrod) z interpolacją między trzema punktami napięcia
    600 V / 2700 V / 14300 V (równanie interpolacji §4.4).
  - Energia incydentu ``E`` na odległości roboczej (równania §4.6) z korekcją
    rozmiaru obudowy ``CF`` (równanie §4.5) dla konfiguracji w obudowie.
  - Granica łuku ``AFB`` — odległość, na której ``E = 1,2 cal/cm²`` (§4.7).
  - Kategoria ŚOI — progi NFPA 70E (również best-effort, oznaczone).

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
# Maszynowo-czytelna etykieta nieautoryzowania (warunek nienegocjowalny).
# ---------------------------------------------------------------------------

# Stabilny tag tekstowy (maszynowo-czytelny) — używany przez UI/raport/OSD do
# wykrycia, że wynik jest niezweryfikowany. NIE zmieniać bez przeglądu
# wszystkich konsumentów (to kontrakt bezpieczeństwa).
ARC_FLASH_UNVERIFIED_TAG = "DO WERYFIKACJI wobec IEEE 1584-2018"

# Pełna polska nota dołączana do każdego wyniku i każdego współczynnika.
ARC_FLASH_UNVERIFIED_NOTE_PL = (
    "DO WERYFIKACJI wobec IEEE 1584-2018 — współczynniki best-effort, "
    "niezweryfikowane wobec normy"
)

# Jawna nota o braku walidacji wobec przykładu obliczeniowego z normy.
ARC_FLASH_NO_WORKED_EXAMPLE_NOTE_PL = (
    "Model NIE zwalidowany wobec przykładu obliczeniowego z IEEE 1584-2018 "
    "(brak dostępu do przykładu) — wynik wyłącznie poglądowy"
)


class ArcFlashVerificationStatus(str, Enum):
    """Status WERYFIKACJI BEZPIECZEŃSTWA wyniku Arc Flash.

    Oś ODRĘBNA od :class:`solver_input.provenance.FieldQuality` (która mówi o
    jakości DANYCH WEJŚCIOWYCH: datasheet / oszacowane / domyślne). Tu chodzi o
    weryfikację wobec NORMY bezpieczeństwa, nie o jakość danych — dlatego osobny,
    jawny enum (zgodnie z zaleceniem: nie nadużywać FieldQuality do statusu
    weryfikacji bezpieczeństwa).

    - ``UNVERIFIED_BEST_EFFORT`` — model best-effort; współczynniki odtworzone z
      wiedzy, NIEZWERYFIKOWANE wobec autorytatywnych tablic IEEE 1584-2018. To
      JEDYNY status, jaki ta implementacja może wydać dla policzonego wyniku
      (norma niedostępna w repo). Wynik MUSI być oznaczony i zablokowany przed
      OSD bez świadomej akceptacji.
    - ``INCOMPLETE_INPUT`` — brak obowiązkowego wejścia; wynik niepoliczony
      ("dane niekompletne"). Odróżnione od best-effort: tu NIE zmyślamy wejść.
    """

    UNVERIFIED_BEST_EFFORT = "UNVERIFIED_BEST_EFFORT"
    INCOMPLETE_INPUT = "INCOMPLETE_INPUT"

    @property
    def label_pl(self) -> str:
        return _STATUS_LABEL_PL[self]


_STATUS_LABEL_PL: dict[ArcFlashVerificationStatus, str] = {
    ArcFlashVerificationStatus.UNVERIFIED_BEST_EFFORT: (
        "niezweryfikowany (best-effort wobec IEEE 1584-2018)"
    ),
    ArcFlashVerificationStatus.INCOMPLETE_INPUT: "dane niekompletne",
}


class ElectrodeConfig(str, Enum):
    """Pięć konfiguracji elektrod IEEE 1584-2018."""

    VCB = "VCB"  # pionowe pręty w obudowie
    VCBB = "VCBB"  # pionowe pręty z barierą izolacyjną w obudowie
    HCB = "HCB"  # poziome pręty w obudowie
    VOA = "VOA"  # pionowe pręty w otwartym powietrzu
    HOA = "HOA"  # poziome pręty w otwartym powietrzu

    @property
    def is_boxed(self) -> bool:
        """True dla konfiguracji w obudowie (wymaga korekcji rozmiaru CF)."""
        return self in (ElectrodeConfig.VCB, ElectrodeConfig.VCBB, ElectrodeConfig.HCB)


# ---------------------------------------------------------------------------
# Współczynniki — KAŻDY wpis nosi jawną proweniencję best-effort.
# ---------------------------------------------------------------------------

# Trzy punkty napięcia (kotwy interpolacji) zdefiniowane w IEEE 1584-2018 §4.4.
# Wartości napięć to definicja modelu (nie współczynniki dopasowania) i są
# pewne; współczynniki PRZY tych napięciach są best-effort.
ANCHOR_VOLTAGES_KV: tuple[float, float, float] = (0.6, 2.7, 14.3)

# Granica energii dla granicy łuku AFB: 1,2 cal/cm² (≈ próg oparzenia II°
# wg Stoll/Chianta przyjęty w IEEE 1584 i NFPA 70E). To definicja, nie wsp.
INCIDENT_ENERGY_AFB_CAL_CM2 = 1.2


@dataclass(frozen=True)
class CoefficientProvenance:
    """Proweniencja JEDNEGO współczynnika lub tablicy współczynników.

    KAŻDY współczynnik użyty w obliczeniu MUSI nieść taki wpis — to czyni
    niemożliwym pomylenie wartości best-effort ze zweryfikowaną.
    """

    name: str
    approximates_section: str  # sekcja/równanie normy, które przybliża
    note_pl: str = ARC_FLASH_UNVERIFIED_NOTE_PL
    verified: bool = False  # ZAWSZE False w tej implementacji

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "approximates_section": self.approximates_section,
            "note_pl": self.note_pl,
            "verified": bool(self.verified),
        }


@dataclass(frozen=True)
class ArcCurrentCoeffs:
    """Współczynniki log-liniowego modelu prądu łuku 2018 per konfiguracja.

    STRUKTURA (IEEE 1584-2018 §4.3): log10(I_arc) wyrażone jako wielomian
    log10(I_bf) i odległości łuku G na każdym z trzech poziomów napięcia, z
    interpolacją między poziomami. Tu zachowano UPROSZCZONĄ, wierną wobec
    struktury postać log-liniową:

        log10(I_arc) = k1 + k2*log10(I_bf) + k3*log10(G)

    Współczynnik k2 jest < 1, więc prąd łuku I_arc jest MNIEJSZY od prądu
    zwarcia bolted I_bf (fizycznie poprawnie — rezystancja łuku tłumi prąd).
    WARTOŚCI k1,k2,k3 są BEST-EFFORT (odtworzone z wiedzy, nie z tablic normy).
    Pełny model normy ma wielomian wyższego rzędu (k1..k13) interpolowany między
    trzema poziomami napięcia — tu świadomie uproszczono do członów dominujących,
    co jest CZĘŚCIĄ powodu oznaczenia "do weryfikacji".
    """

    k1: float
    k2: float
    k3: float
    provenance: CoefficientProvenance

    def to_dict(self) -> dict[str, Any]:
        return {
            "k1": self.k1,
            "k2": self.k2,
            "k3": self.k3,
            "provenance": self.provenance.to_dict(),
        }


@dataclass(frozen=True)
class IncidentEnergyCoeffs:
    """Współczynniki modelu energii incydentu per konfiguracja (best-effort).

    STRUKTURA (IEEE 1584 — postać znormalizowana energii, §4.6): najpierw energia
    ZNORMALIZOWANA E_n [J/cm²] na odległości odniesienia 610 mm i w czasie
    odniesienia 0,2 s:

        log10(E_n) = c1 + c2*log10(I_arc) + c3*G

    a następnie skalowanie do rzeczywistego czasu t i odległości roboczej D z
    wykładnikiem odległości x oraz przeliczenie J/cm² → cal/cm²:

        E[cal/cm²] = CF * E_n * (t/0,2) * (610/D)^x

    Człon c1 jest UJEMNY, dzięki czemu energia znormalizowana pozostaje
    ograniczona (poprawny rząd wielkości). To różni się od naiwnej postaci
    log-liniowej bez normalizacji (która eksploduje). WARTOŚCI c1,c2,c3,x są
    BEST-EFFORT (odtworzone z wiedzy, nie z autorytatywnych tablic normy).
    """

    c1: float
    c2: float
    c3: float
    distance_exponent_x: float
    provenance: CoefficientProvenance

    def to_dict(self) -> dict[str, Any]:
        return {
            "c1": self.c1,
            "c2": self.c2,
            "c3": self.c3,
            "distance_exponent_x": self.distance_exponent_x,
            "provenance": self.provenance.to_dict(),
        }


def _arc_prov(name: str, section: str) -> CoefficientProvenance:
    return CoefficientProvenance(name=name, approximates_section=section)


# Tablica współczynników prądu łuku per konfiguracja elektrod (BEST-EFFORT).
# Każda konfiguracja nosi własną proweniencję. k2 < 1 ⇒ I_arc < I_bf (poprawnie).
# Wartości są rzędu wielkości zgodnego ze strukturą modelu, ale NIEZWERYFIKOWANE
# wobec autorytatywnych tablic normy.
ARC_CURRENT_COEFFS: dict[ElectrodeConfig, ArcCurrentCoeffs] = {
    # Konfiguracje w obudowie: nieco silniejsze tłumienie i zależność od odstępu.
    ElectrodeConfig.VCB: ArcCurrentCoeffs(
        k1=0.00402,
        k2=0.983,
        k3=-0.0040,
        provenance=_arc_prov(
            "I_arc[VCB]", "IEEE 1584-2018 §4.3 (model prądu łuku, postać log-liniowa)"
        ),
    ),
    ElectrodeConfig.VCBB: ArcCurrentCoeffs(
        k1=0.00402,
        k2=0.983,
        k3=-0.0050,
        provenance=_arc_prov(
            "I_arc[VCBB]", "IEEE 1584-2018 §4.3 (model prądu łuku, postać log-liniowa)"
        ),
    ),
    ElectrodeConfig.HCB: ArcCurrentCoeffs(
        k1=0.00402,
        k2=0.983,
        k3=-0.0030,
        provenance=_arc_prov(
            "I_arc[HCB]", "IEEE 1584-2018 §4.3 (model prądu łuku, postać log-liniowa)"
        ),
    ),
    # Otwarte powietrze: zbliżone tłumienie, minimalny wpływ odstępu.
    ElectrodeConfig.VOA: ArcCurrentCoeffs(
        k1=0.00402,
        k2=0.983,
        k3=-0.0020,
        provenance=_arc_prov(
            "I_arc[VOA]", "IEEE 1584-2018 §4.3 (model prądu łuku, postać log-liniowa)"
        ),
    ),
    ElectrodeConfig.HOA: ArcCurrentCoeffs(
        k1=0.00402,
        k2=0.983,
        k3=-0.0020,
        provenance=_arc_prov(
            "I_arc[HOA]", "IEEE 1584-2018 §4.3 (model prądu łuku, postać log-liniowa)"
        ),
    ),
}

# Tablica współczynników energii incydentu per konfiguracja (BEST-EFFORT).
# Postać ZNORMALIZOWANA: c1 ujemne (energia znormalizowana ograniczona), c2≈1.08
# (wpływ prądu łuku), c3≈0.0011 (wpływ odstępu G [mm]), x — wykładnik odległości.
# Konfiguracje w obudowie mają wyższe c1 (skupienie energii) i większe x.
INCIDENT_ENERGY_COEFFS: dict[ElectrodeConfig, IncidentEnergyCoeffs] = {
    ElectrodeConfig.VCB: IncidentEnergyCoeffs(
        c1=-0.097,
        c2=1.081,
        c3=0.0011,
        distance_exponent_x=0.973,
        provenance=_arc_prov(
            "E[VCB]", "IEEE 1584-2018 §4.6 (energia incydentu, postać znormalizowana)"
        ),
    ),
    ElectrodeConfig.VCBB: IncidentEnergyCoeffs(
        c1=-0.082,
        c2=1.081,
        c3=0.0011,
        distance_exponent_x=1.473,
        provenance=_arc_prov(
            "E[VCBB]", "IEEE 1584-2018 §4.6 (energia incydentu, postać znormalizowana)"
        ),
    ),
    ElectrodeConfig.HCB: IncidentEnergyCoeffs(
        c1=-0.105,
        c2=1.081,
        c3=0.0011,
        distance_exponent_x=0.660,
        provenance=_arc_prov(
            "E[HCB]", "IEEE 1584-2018 §4.6 (energia incydentu, postać znormalizowana)"
        ),
    ),
    ElectrodeConfig.VOA: IncidentEnergyCoeffs(
        c1=-0.555,
        c2=1.081,
        c3=0.0011,
        distance_exponent_x=0.554,
        provenance=_arc_prov(
            "E[VOA]", "IEEE 1584-2018 §4.6 (energia incydentu, postać znormalizowana)"
        ),
    ),
    ElectrodeConfig.HOA: IncidentEnergyCoeffs(
        c1=-0.519,
        c2=1.081,
        c3=0.0011,
        distance_exponent_x=0.532,
        provenance=_arc_prov(
            "E[HOA]", "IEEE 1584-2018 §4.6 (energia incydentu, postać znormalizowana)"
        ),
    ),
}

# Typowa odległość robocza i odstęp przewodów per klasa napięcia (mm) — tylko
# jako DOMYŚLNE poglądowe, jeśli użytkownik nie poda; również best-effort.
DEFAULT_WORKING_DISTANCE_MM = 457.0  # 18" — typowa dla aparatury SN/nn
DEFAULT_CONDUCTOR_GAP_MM = 102.0  # typowy odstęp dla rozdzielnic SN ~15 kV

# Odległość odniesienia energii (24" = 610 mm) i czas odniesienia (0.2 s) —
# definicje modelu IEEE 1584-2018 §4.6 (nie współczynniki dopasowania).
REFERENCE_DISTANCE_MM = 610.0
REFERENCE_TIME_S = 0.2


# ---------------------------------------------------------------------------
# Kategorie ŚOI (PPE) — progi NFPA 70E (BEST-EFFORT, oznaczone).
# ---------------------------------------------------------------------------

# Progi energii (cal/cm²) → kategoria ŚOI. STRUKTURA wg NFPA 70E (kategorie 1–4
# + brak/przekroczenie). WARTOŚCI graniczne best-effort — oznaczone do
# weryfikacji, NIE wolno traktować jako autorytatywne progi bezpieczeństwa.
PPE_THRESHOLDS_CAL_CM2: tuple[tuple[float, str], ...] = (
    (1.2, "0"),  # E < 1.2 → brak wymaganej kategorii (poniżej granicy łuku)
    (4.0, "1"),  # 1.2 ≤ E < 4   → kategoria 1
    (8.0, "2"),  # 4   ≤ E < 8   → kategoria 2
    (25.0, "3"),  # 8   ≤ E < 25  → kategoria 3
    (40.0, "4"),  # 25  ≤ E < 40  → kategoria 4
)
PPE_OVER_LIMIT_LABEL = "POWYŻEJ 40 cal/cm² — strefa zabroniona (brak ŚOI)"

PPE_PROVENANCE = CoefficientProvenance(
    name="PPE_thresholds[NFPA 70E]",
    approximates_section="NFPA 70E (kategorie ŚOI) — progi best-effort",
)


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
    - ``arc_time_s`` ← czas wyłączenia zwarcia (z koordynacji zabezpieczeń) [s].

    Pola obowiązkowe: ``i_bf_ka``, ``voltage_kv``, ``arc_time_s``. Brak
    któregokolwiek ⇒ "dane niekompletne" (BEZ zmyślania wejść). ``electrode_config``
    domyślnie VCB (typowa rozdzielnica w obudowie); odstęp i odległość mają
    poglądowe domyślne, ale gdy podane — używane wprost.
    """

    bus_ref: str
    i_bf_ka: float | None
    voltage_kv: float | None
    arc_time_s: float | None
    electrode_config: ElectrodeConfig = ElectrodeConfig.VCB
    conductor_gap_mm: float | None = None
    working_distance_mm: float | None = None
    # Wymiary obudowy (mm) dla korekcji CF konfiguracji w obudowie; opcjonalne.
    enclosure_width_mm: float | None = None
    enclosure_height_mm: float | None = None
    enclosure_depth_mm: float | None = None


@dataclass(frozen=True)
class WhiteBoxStep:
    """Pojedynczy krok wywodu White Box (Wzór→Dane→Podstawienie→Wynik→Jednostka).

    Identyczny kontrakt jak w ``analysis.ssci_stability`` (spójność warstwy).
    """

    symbol: str
    formula_latex: str
    substitution_pl: str
    result_pl: str
    unit_check_pl: str


@dataclass(frozen=True)
class ArcFlashResult:
    """Wynik Arc Flash dla jednego punktu — ZAWSZE oznaczony best-effort.

    Pole ``status`` jest OBOWIĄZKOWE i dla policzonego wyniku ZAWSZE wynosi
    ``UNVERIFIED_BEST_EFFORT`` (norma niedostępna). ``unverified_tag`` i
    ``unverified_note_pl`` powielają etykietę maszynowo-czytelną tak, by żaden
    konsument nie mógł zignorować statusu.
    """

    bus_ref: str
    status: ArcFlashVerificationStatus
    unverified_tag: str
    unverified_note_pl: str
    no_worked_example_note_pl: str
    electrode_config: str
    # --- wejścia użyte ---
    i_bf_ka: float | None
    voltage_kv: float | None
    arc_time_s: float | None
    conductor_gap_mm: float | None
    working_distance_mm: float | None
    # --- wyniki pośrednie (White Box) ---
    i_arc_ka: float | None
    enclosure_correction_cf: float | None
    incident_energy_cal_cm2: float | None
    arc_flash_boundary_mm: float | None
    ppe_category: str | None
    # --- proweniencja współczynników użytych ---
    coefficient_provenance: tuple[CoefficientProvenance, ...]
    # --- audyt / komunikaty ---
    why_pl: str
    missing_data: tuple[str, ...]
    white_box: tuple[WhiteBoxStep, ...]


@dataclass(frozen=True)
class ArcFlashView:
    """Widok analizy Arc Flash (jeden lub wiele punktów)."""

    analysis_id: str
    context: ArcFlashContext | None
    status: ArcFlashVerificationStatus
    unverified_tag: str
    unverified_note_pl: str
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
        "unverified_tag": ARC_FLASH_UNVERIFIED_TAG,
        "results": [
            {
                "bus_ref": r.bus_ref,
                "status": r.status.value,
                "electrode_config": r.electrode_config,
                "i_bf_ka": r.i_bf_ka,
                "voltage_kv": r.voltage_kv,
                "arc_time_s": r.arc_time_s,
                "conductor_gap_mm": r.conductor_gap_mm,
                "working_distance_mm": r.working_distance_mm,
                "i_arc_ka": r.i_arc_ka,
                "enclosure_correction_cf": r.enclosure_correction_cf,
                "incident_energy_cal_cm2": r.incident_energy_cal_cm2,
                "arc_flash_boundary_mm": r.arc_flash_boundary_mm,
                "ppe_category": r.ppe_category,
                "missing_data": list(r.missing_data),
            }
            for r in results
        ],
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


# Kod gotowości (jedno źródło prawdy) blokujący pakiet OSD na niezweryfikowanym
# wyniku Arc Flash. Mirroruje wzorzec OSD_CARD_FIELD_BLOCKER_CODE — bez
# równoległego systemu gotowości.
OSD_ARC_FLASH_UNVERIFIED_BLOCKER_CODE = "arc_flash.unverified_best_effort"


def osd_arc_flash_gate(
    view: ArcFlashView,
    accepted: bool = False,
) -> tuple[bool, list[Any]]:
    """Bramka akceptacji OSD dla wyniku Arc Flash. Blokuje TYLKO pakiet OSD.

    Wynik Arc Flash jest best-effort (niezweryfikowany wobec IEEE 1584-2018),
    więc — jak werdykt SSCI / pola karty falownika — NIE może wejść do pakietu
    OSD / wniosku przyłączeniowego bez ŚWIADOMEJ akceptacji inżyniera. Analiza
    sama w sobie liczy się normalnie (model best-effort, jawnie oznaczony); ta
    bramka chroni wyłącznie eksport do formalnego pakietu.

    Emituje :class:`~enm.domain_ops_models.ReadinessBlocker` (istniejący model
    gotowości — bez drugiej prawdy) z polskim komunikatem niosącym etykietę
    ``DO WERYFIKACJI wobec IEEE 1584-2018``. ``DATASHEET``-owy odpowiednik nie
    istnieje: ten wynik NIGDY nie jest "zweryfikowany" w tej implementacji.

    Args:
        view: widok analizy Arc Flash.
        accepted: czy inżynier świadomie zaakceptował wynik best-effort do OSD.

    Returns:
        ``(ready, blockers)`` — ``ready`` True tylko gdy ``accepted`` True.
    """
    from enm.domain_ops_models import ReadinessBlocker  # lazy: granica warstw

    if accepted:
        return (True, [])

    return (
        False,
        [
            ReadinessBlocker(
                code=OSD_ARC_FLASH_UNVERIFIED_BLOCKER_CODE,
                message_pl=(
                    "Wynik Arc Flash jest best-effort i niezweryfikowany "
                    f"({ARC_FLASH_UNVERIFIED_TAG}); wymaga świadomej akceptacji "
                    "inżyniera przed pakietem OSD"
                ),
                element_ref=None,
            )
        ],
    )


# Stałe re-eksportowane (wygoda testów/konsumentów).
__all__ = [
    "ARC_FLASH_UNVERIFIED_TAG",
    "ARC_FLASH_UNVERIFIED_NOTE_PL",
    "ARC_FLASH_NO_WORKED_EXAMPLE_NOTE_PL",
    "ANCHOR_VOLTAGES_KV",
    "INCIDENT_ENERGY_AFB_CAL_CM2",
    "DEFAULT_WORKING_DISTANCE_MM",
    "DEFAULT_CONDUCTOR_GAP_MM",
    "REFERENCE_DISTANCE_MM",
    "REFERENCE_TIME_S",
    "ARC_CURRENT_COEFFS",
    "INCIDENT_ENERGY_COEFFS",
    "PPE_THRESHOLDS_CAL_CM2",
    "PPE_OVER_LIMIT_LABEL",
    "PPE_PROVENANCE",
    "OSD_ARC_FLASH_UNVERIFIED_BLOCKER_CODE",
    "ArcCurrentCoeffs",
    "ArcFlashContext",
    "ArcFlashInput",
    "ArcFlashResult",
    "ArcFlashVerificationStatus",
    "ArcFlashView",
    "CoefficientProvenance",
    "ElectrodeConfig",
    "IncidentEnergyCoeffs",
    "WhiteBoxStep",
    "compute_arc_flash_id",
    "osd_arc_flash_gate",
]
