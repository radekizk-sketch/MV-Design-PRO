"""Kryteria WYPOSAZENIA stacji — cztery zdolnosci bez dostawcy (karta KD-3).

DLACZEGO TEN PAKIET POWSTAL. Karta K7-B (`docs/uiux/DLUG_FIZYKA_W_UI_2026-07.md`
§7.4) usunela z warstwy prezentacji cztery rachunki, ktore byly tam liczone
lokalnie i bez sladu, i NAZWALA luke: backend nie mial ich odpowiednika. Ten
pakiet te luke zamyka — fizyka wraca do warstwy solverow, z pelnym WHITE BOX.

CO TU JEST (jeden modul = jedno kryterium):
  * ``ct_burden_saturation``   — bilans mocy wtornej i nasycenie przekladnika
                                 pradowego (IEC 61869-2),
  * ``vt_burden_voltage_drop`` — bilans mocy wtornej i zmiana napiecia obwodu
                                 przekladnika napieciowego (IEC 61869-3),
  * ``cable_thermal_aging``    — wzgledne starzenie izolacji kabla (regula
                                 Montsingera),
  * ``transformer_losses``     — straty transformatora i optymalny wspolczynnik
                                 obciazenia.

ZASADY WSPOLNE (CLAUDE.md):
  * WHITE BOX — kazdy wynik niesie kroki (wzor → dane → podstawienie → wynik →
    uwagi), wartosci posrednie, zalozenia i jednostki;
  * ZERO FABRYKACJI — brak danej daje status NIEDOSTEPNY i kod gotowosci, nigdy
    wartosc zastepcza ani „typowa" stala z tablic;
  * DANE ZNAMIONOWE Z KATALOGU — moduly przyjmuja je jako WEJSCIE; wiazanie
    katalogowe (``catalog_ref`` → pozycja) robi warstwa koncowki, dzieki czemu
    solver zostaje funkcja czysta i deterministyczna.
"""

from __future__ import annotations

from network_model.solvers.equipment_checks.cable_thermal_aging import (
    CableThermalAgingInput,
    CableThermalAgingResult,
    check_cable_thermal_aging,
)
from network_model.solvers.equipment_checks.ct_burden_saturation import (
    CtBurdenInput,
    CtBurdenResult,
    CtDeviceBurden,
    check_ct_burden_saturation,
)
from network_model.solvers.equipment_checks.slad import (
    STATUS_FAIL,
    STATUS_PASS,
    STATUS_UNAVAILABLE,
)
from network_model.solvers.equipment_checks.transformer_losses import (
    TransformerLossesInput,
    TransformerLossesResult,
    compute_transformer_losses,
)
from network_model.solvers.equipment_checks.vt_burden_voltage_drop import (
    VtBurdenInput,
    VtBurdenResult,
    VtDeviceBurden,
    check_vt_burden_voltage_drop,
)

__all__ = [
    "STATUS_FAIL",
    "STATUS_PASS",
    "STATUS_UNAVAILABLE",
    "CableThermalAgingInput",
    "CableThermalAgingResult",
    "CtBurdenInput",
    "CtBurdenResult",
    "CtDeviceBurden",
    "TransformerLossesInput",
    "TransformerLossesResult",
    "VtBurdenInput",
    "VtBurdenResult",
    "VtDeviceBurden",
    "check_cable_thermal_aging",
    "check_ct_burden_saturation",
    "check_vt_burden_voltage_drop",
    "compute_transformer_losses",
]
