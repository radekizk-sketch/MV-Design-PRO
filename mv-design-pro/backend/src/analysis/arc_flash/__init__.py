"""D-01 Arc Flash — IEEE 1584-2018 (model publiczny, współczynniki open-source).

╔══════════════════════════════════════════════════════════════════════════╗
║  PROWENIENCJA — OPEN-SOURCE / AUDIT-PENDING (UCZCIWIE, BEZ ZAWYŻANIA)       ║
║  RÓWNANIA modelu IEEE 1584-2018 są publiczne i zbudowane w całości. WARTOŚCI║
║  współczynników pochodzą z OPEN-SOURCE'OWEJ implementacji MIT               ║
║  ``rwl/arcflash`` (NIE z licencjonowanej IEEE Std 1584-2018) i są ŁADOWANE  ║
║  z trwałego pliku danych w repo (audytowalnie, bez magicznych liczb w       ║
║  kodzie). Wynik liczy się NAPRAWDĘ ze statusem                             ║
║  ``COMPUTED_IEEE_1584_OPEN_SOURCE`` i polskim zastrzeżeniem; bramka OSD     ║
║  blokuje użycie CERTYFIKOWANE, dopóki inżynier świadomie nie zaakceptuje    ║
║  proweniencji open-source. Po weryfikacji z licencjonowaną normą status     ║
║  przełącza się na ``COMPUTED_IEEE_1584`` (zweryfikowany) BEZ zmiany kodu.   ║
╚══════════════════════════════════════════════════════════════════════════╝

Warstwa OBLICZENIA / interpretacji (Z15): odczytuje gotowy wynik zwarciowy
(prąd zwarcia bolted I_bf z solvera IEC 60909) i liczy energię incydentu,
granicę łuku oraz kategorię ŚOI z pełnym wywodem White Box. NIE liczy fizyki
solvera, NIE importuje solvera (granica warstw, arch_guard).

Zakres ważności IEEE 1584-2018: 208 V–15 kV; I_bf zależny od klasy napięcia —
500 A–106 kA dla U<=600 V, 200 A–65 kA dla 600 V<U<=15 kV. Poza zakresem
(zwł. > 15 kV) — ODRĘBNA metoda Ralpha Lee (postać zamknięta, jawnie oznaczona,
NIE jako IEEE 1584).

Kategoria ŚOI (NFPA 70E): plik danych NIE zawiera granic kategorii NFPA 70E,
więc mapowanie ŚOI pozostaje „dane niekompletne — tablice NFPA 70E" (granice
NIE są zmyślane). AFB przy publicznym progu 1,2 cal/cm² liczy się niezależnie.

IAC IEC 62271-200 (łuk wewnętrzny) jest ODRĘBNYM obliczeniem — NIE należy do
modelu energii incydentu IEEE 1584 i nie jest tu zaimplementowany.
"""

from analysis.arc_flash.builder import ArcFlashBuilder
from analysis.arc_flash.loader import (
    PRODUCTION_IEEE_1584_TABLE,
    build_table_from_payload,
    load_ieee_1584_table,
    load_production_ieee_1584_table,
)
from analysis.arc_flash.models import (
    ARC_FLASH_COEFF_MISSING_MARKER,
    ARC_FLASH_INPUT_INCOMPLETE_STATUS,
    ARC_FLASH_OPEN_SOURCE_CAVEAT_PL,
    ARC_FLASH_OPEN_SOURCE_PROVENANCE,
    ARC_FLASH_RALPH_LEE_LABEL,
    ARC_FLASH_SOURCE_URLS,
    ARC_FLASH_TABLE_INCOMPLETE_STATUS,
    INCIDENT_ENERGY_AFB_CAL_CM2,
    INCIDENT_ENERGY_AFB_JOULE_CM2,
    OSD_ARC_FLASH_BLOCKER_CODE,
    PPE_CATEGORY_INCOMPLETE,
    PRODUCTION_NFPA_70E_PPE_TABLE,
    VALIDITY_IBF_MAX_KA_HV,
    VALIDITY_IBF_MAX_KA_LV,
    VALIDITY_IBF_MIN_KA_HV,
    VALIDITY_IBF_MIN_KA_LV,
    VALIDITY_VOLTAGE_MAX_KV,
    VALIDITY_VOLTAGE_MIN_KV,
    ArcCurrentCoeffs,
    ArcCurrentVariationCoeffs,
    ArcFlashCoefficientTable,
    ArcFlashContext,
    ArcFlashInput,
    ArcFlashMethod,
    ArcFlashResult,
    ArcFlashStatus,
    ArcFlashView,
    ElectrodeConfig,
    EnclosureCorrectionCoeffs,
    EnclosureType,
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
    "ARC_FLASH_OPEN_SOURCE_CAVEAT_PL",
    "ARC_FLASH_OPEN_SOURCE_PROVENANCE",
    "ARC_FLASH_RALPH_LEE_LABEL",
    "ARC_FLASH_SOURCE_URLS",
    "ARC_FLASH_TABLE_INCOMPLETE_STATUS",
    "INCIDENT_ENERGY_AFB_CAL_CM2",
    "INCIDENT_ENERGY_AFB_JOULE_CM2",
    "OSD_ARC_FLASH_BLOCKER_CODE",
    "PPE_CATEGORY_INCOMPLETE",
    "PRODUCTION_IEEE_1584_TABLE",
    "PRODUCTION_NFPA_70E_PPE_TABLE",
    "VALIDITY_IBF_MAX_KA_HV",
    "VALIDITY_IBF_MAX_KA_LV",
    "VALIDITY_IBF_MIN_KA_HV",
    "VALIDITY_IBF_MIN_KA_LV",
    "VALIDITY_VOLTAGE_MAX_KV",
    "VALIDITY_VOLTAGE_MIN_KV",
    "ArcCurrentCoeffs",
    "ArcCurrentVariationCoeffs",
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
    "EnclosureType",
    "IncidentEnergyCoeffs",
    "PpeCategoryTable",
    "TableProvenance",
    "VoltageAnchor",
    "WhiteBoxStep",
    "build_table_from_payload",
    "compute_arc_flash_id",
    "empty_ieee_1584_table",
    "empty_nfpa_70e_ppe_table",
    "load_ieee_1584_table",
    "load_production_ieee_1584_table",
    "osd_arc_flash_gate",
]
