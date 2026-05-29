"""D-01 Arc Flash — energia incydentu wg STRUKTURY IEEE 1584-2018 / warstwa analizy.

╔══════════════════════════════════════════════════════════════════════════╗
║  WERSJA BEST-EFFORT, NIEZWERYFIKOWANA — FIZYKA BEZPIECZEŃSTWA              ║
║  Właściciel świadomie zlecił wersję best-effort, bo autorytatywne tablice  ║
║  współczynników IEEE 1584-2018 nie są dostępne w repozytorium. STRUKTURA   ║
║  (równania) jest odtworzona wiernie; WARTOŚCI współczynników są best-effort║
║  z wiedzy i NIEZWERYFIKOWANE wobec normy. KAŻDY wynik nosi etykietę        ║
║  ``DO WERYFIKACJI wobec IEEE 1584-2018`` i jest zablokowany przed pakietem ║
║  OSD bez świadomej akceptacji inżyniera. Model NIE zwalidowany wobec       ║
║  przykładu obliczeniowego z normy (brak dostępu).                          ║
╚══════════════════════════════════════════════════════════════════════════╝

Warstwa OBLICZENIA / interpretacji (Z15): odczytuje gotowy wynik zwarciowy
(prąd zwarcia bolted I_bf z solvera IEC 60909) i liczy energię incydentu,
granicę łuku oraz kategorię ŚOI z pełnym wywodem White Box. NIE liczy fizyki
solvera, NIE importuje solvera (granica warstw, arch_guard).

Zakres D-01 (K-25 / §8C.1): energia incydentu IEEE 1584-2018, granice, ŚOI.
IAC IEC 62271-200 (łuk wewnętrzny) jest wymieniony w D-01 jako ODRĘBNE
obliczenie — NIE jest zaimplementowany w tym module (nie należy do modelu
energii incydentu IEEE 1584; pozostaje osobnym elementem do realizacji).
"""

from analysis.arc_flash.builder import ArcFlashBuilder
from analysis.arc_flash.models import (
    ARC_CURRENT_COEFFS,
    ARC_FLASH_NO_WORKED_EXAMPLE_NOTE_PL,
    ARC_FLASH_UNVERIFIED_NOTE_PL,
    ARC_FLASH_UNVERIFIED_TAG,
    INCIDENT_ENERGY_AFB_CAL_CM2,
    INCIDENT_ENERGY_COEFFS,
    OSD_ARC_FLASH_UNVERIFIED_BLOCKER_CODE,
    PPE_THRESHOLDS_CAL_CM2,
    ArcCurrentCoeffs,
    ArcFlashContext,
    ArcFlashInput,
    ArcFlashResult,
    ArcFlashVerificationStatus,
    ArcFlashView,
    CoefficientProvenance,
    ElectrodeConfig,
    IncidentEnergyCoeffs,
    WhiteBoxStep,
    compute_arc_flash_id,
    osd_arc_flash_gate,
)

__all__ = [
    "ARC_CURRENT_COEFFS",
    "ARC_FLASH_NO_WORKED_EXAMPLE_NOTE_PL",
    "ARC_FLASH_UNVERIFIED_NOTE_PL",
    "ARC_FLASH_UNVERIFIED_TAG",
    "INCIDENT_ENERGY_AFB_CAL_CM2",
    "INCIDENT_ENERGY_COEFFS",
    "OSD_ARC_FLASH_UNVERIFIED_BLOCKER_CODE",
    "PPE_THRESHOLDS_CAL_CM2",
    "ArcCurrentCoeffs",
    "ArcFlashBuilder",
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
