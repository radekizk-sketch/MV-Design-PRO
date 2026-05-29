"""D-01 Arc Flash — STRUKTURA IEEE 1584-2018 z PUSTĄ TABLICĄ współczynników.

╔══════════════════════════════════════════════════════════════════════════╗
║  DANE BEZPIECZEŃSTWA — TABLICA WSPÓŁCZYNNIKÓW JEST PUSTA                    ║
║  STRUKTURA (równania) modelu IEEE 1584-2018 jest publiczna i zbudowana w   ║
║  całości. WARTOŚCI współczynników regresji to dane tablicowe IEEE          ║
║  1584-2018 (objęte prawem autorskim) — dostarczane jako PUSTA tablica      ║
║  typowana (proweniencja ``norma_IEEE_1584``), z markerem ``BRAK — wymaga   ║
║  tablic IEEE 1584-2018 od właściciela``. ŻADEN współczynnik nie jest       ║
║  zmyślany. Obliczenie na pustej tablicy zwraca status                      ║
║  ``dane niekompletne — tablice współczynników IEEE 1584``. Gdy właściciel  ║
║  wypełni tablicę, TEN SAM przepływ policzy wynik (norma_IEEE_1584).        ║
╚══════════════════════════════════════════════════════════════════════════╝

Warstwa OBLICZENIA / interpretacji (Z15): odczytuje gotowy wynik zwarciowy
(prąd zwarcia bolted I_bf z solvera IEC 60909) i liczy energię incydentu,
granicę łuku oraz kategorię ŚOI z pełnym wywodem White Box. NIE liczy fizyki
solvera, NIE importuje solvera (granica warstw, arch_guard).

Zakres ważności IEEE 1584-2018: 208 V–15 kV, I_bf 500 A–106 kA. Poza zakresem
(zwł. > 15 kV) — ODRĘBNA metoda Ralpha Lee (postać zamknięta, jawnie oznaczona,
NIE jako IEEE 1584).

IAC IEC 62271-200 (łuk wewnętrzny) jest ODRĘBNYM obliczeniem — NIE należy do
modelu energii incydentu IEEE 1584 i nie jest tu zaimplementowany.
"""

from analysis.arc_flash.builder import ArcFlashBuilder
from analysis.arc_flash.models import (
    ARC_FLASH_COEFF_MISSING_MARKER,
    ARC_FLASH_INPUT_INCOMPLETE_STATUS,
    ARC_FLASH_RALPH_LEE_LABEL,
    ARC_FLASH_TABLE_INCOMPLETE_STATUS,
    INCIDENT_ENERGY_AFB_CAL_CM2,
    OSD_ARC_FLASH_BLOCKER_CODE,
    PPE_CATEGORY_INCOMPLETE,
    PRODUCTION_IEEE_1584_TABLE,
    PRODUCTION_NFPA_70E_PPE_TABLE,
    VALIDITY_IBF_MAX_KA,
    VALIDITY_IBF_MIN_KA,
    VALIDITY_VOLTAGE_MAX_KV,
    VALIDITY_VOLTAGE_MIN_KV,
    ArcCurrentCoeffs,
    ArcFlashCoefficientTable,
    ArcFlashContext,
    ArcFlashInput,
    ArcFlashMethod,
    ArcFlashResult,
    ArcFlashStatus,
    ArcFlashView,
    ElectrodeConfig,
    EnclosureCorrectionCoeffs,
    IncidentEnergyCoeffs,
    PpeCategoryTable,
    TableProvenance,
    VoltageAnchor,
    WhiteBoxStep,
    compute_arc_flash_id,
    empty_ieee_1584_table,
    empty_nfpa_70e_ppe_table,
    osd_arc_flash_gate,
)

__all__ = [
    "ARC_FLASH_COEFF_MISSING_MARKER",
    "ARC_FLASH_INPUT_INCOMPLETE_STATUS",
    "ARC_FLASH_RALPH_LEE_LABEL",
    "ARC_FLASH_TABLE_INCOMPLETE_STATUS",
    "INCIDENT_ENERGY_AFB_CAL_CM2",
    "OSD_ARC_FLASH_BLOCKER_CODE",
    "PPE_CATEGORY_INCOMPLETE",
    "PRODUCTION_IEEE_1584_TABLE",
    "PRODUCTION_NFPA_70E_PPE_TABLE",
    "VALIDITY_IBF_MAX_KA",
    "VALIDITY_IBF_MIN_KA",
    "VALIDITY_VOLTAGE_MAX_KV",
    "VALIDITY_VOLTAGE_MIN_KV",
    "ArcCurrentCoeffs",
    "ArcFlashBuilder",
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
