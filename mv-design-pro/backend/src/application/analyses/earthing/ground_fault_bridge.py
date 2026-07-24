"""Most produkcyjny SC_1F → pakiet dowodowy uziemień (Earthing / Ground Fault SN).

Domyka lukę „(a)" z mapy konsumpcji V-SM-1/V12K-182: pakiet dowodowy zwarcia
doziemnego (``earthing_ground_fault_sn``) był wołany WYŁĄCZNIE z testów — brak
produkcyjnego dostawcy prądu doziemnego 1F. Ten most dostarcza go analogicznie
do ``build_protection_input`` (zabezpieczenia 50N/51N), tak by napięcie dotykowe
i krokowe liczyły się od POPRAWNEGO prądu doziemnego — a więc od poprawnej
składowej zerowej zależnej od grupy połączeń transformatora.

Łańcuch (każde ogniwo to realny kod, zero fabrykacji):

    vector_group ─► build_zero_sequence_zbus (SM-3)
                 ─► compute_1ph_short_circuit
                 ─► ShortCircuitResult.ikss_a  (I″k1 = prąd doziemny)
                 ─► build_earthing_ground_fault_input  (TEN most)
                 ─► generate_earthing_ground_fault_pack
                 ─► U_d / U_s (napięcie dotykowe / krokowe)

Fizyka:
    * I″k1 pochodzi WYŁĄCZNIE z solvera SC_1F (``ShortCircuitResult``).
    * Podział I_u = r·I″k1 / I_p = (1−r)·I″k1 to przejrzyste zastosowanie
      JAWNEGO współczynnika projektowego r (dane uziomu) do wyniku solvera —
      taka sama arytmetyka interpretacyjna, jaką pack już wykonuje
      (``i_earth = I_u + I_p``, ``U_d = I_u · R_u``). NIE jest to solver ani
      heurystyka: r jest daną wejściową, nie zgadywaniem.

ZERO fabrykacji: gdy model nie niesie R_u (Z_E) lub r, most NIE zgaduje —
zwraca ``ReadinessIssueV1`` (fix-action) z jawnym komunikatem, a pack nie jest
wołany dla tego elementu.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from application.proof_engine.packs.earthing_ground_fault_sn import (
    EarthingGroundFaultPackInput,
)
from domain.readiness import ReadinessAreaV1, ReadinessIssueV1, ReadinessPriority
from network_model.solvers.short_circuit_core import ShortCircuitType
from network_model.solvers.short_circuit_iec60909 import ShortCircuitResult

# Stabilne kody gotowości (fix-action). Zsynchronizowane z READINESS_CODES
# (``domain/canonical_operations.py``: earthing.electrode_data_missing).
EARTHING_ELECTRODE_DATA_MISSING = "earthing.electrode_data_missing"
EARTHING_WRONG_FAULT_TYPE = "earthing.wrong_fault_type"


@dataclass(frozen=True)
class EarthingBridgeResult:
    """Wynik mostu: gotowe wejście packa ALBO braki gotowości (nie oba naraz)."""

    pack_input: EarthingGroundFaultPackInput | None
    readiness_issues: tuple[ReadinessIssueV1, ...]

    @property
    def is_ready(self) -> bool:
        return self.pack_input is not None


def build_earthing_ground_fault_input(
    sc_result: ShortCircuitResult,
    *,
    project_name: str,
    case_name: str,
    run_timestamp: datetime,
    solver_version: str,
    earth_electrode_resistance_ohm: float | None,
    earth_return_split_factor: float | None,
    earthing_mode: str | None = None,
    fault_location: str | None = None,
    element_id: str | None = None,
) -> EarthingBridgeResult:
    """Buduje wejście packa uziemień z wyniku SC_1F i danych uziomu.

    Args:
        sc_result: Wynik zwarcia — MUSI być SINGLE_PHASE_GROUND (I″k1 = prąd
            doziemny). Inny typ → readiness (zły typ zwarcia).
        earth_electrode_resistance_ohm: R_u = Z_E [Ω] z modelu (dana projektowa).
        earth_return_split_factor: r ∈ (0..1] z modelu — udział prądu wracający
            uziomem (reszta 1−r torami powrotnymi ekran/OPGW).
        earthing_mode: Opisowy tryb punktu neutralnego (informacyjnie).
        element_id: Identyfikator elementu (szyna/stacja) do fix-action.

    Returns:
        EarthingBridgeResult z ``pack_input`` gdy dane kompletne, albo z
        ``readiness_issues`` gdy brak danych uziomu / zły typ zwarcia.
    """
    if sc_result.short_circuit_type is not ShortCircuitType.SINGLE_PHASE_GROUND:
        return EarthingBridgeResult(
            pack_input=None,
            readiness_issues=(
                ReadinessIssueV1(
                    code=EARTHING_WRONG_FAULT_TYPE,
                    area=ReadinessAreaV1.STATIONS,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl=(
                        "Napięcia dotykowe/krokowe wymagają zwarcia doziemnego "
                        "1F (SINGLE_PHASE_GROUND) — dostarczono inny typ."
                    ),
                    element_id=element_id,
                    fix_hint_pl="Uruchom analizę zwarcia jednofazowego doziemnego.",
                ),
            ),
        )

    if earth_electrode_resistance_ohm is None or earth_return_split_factor is None:
        return EarthingBridgeResult(
            pack_input=None,
            readiness_issues=(
                ReadinessIssueV1(
                    code=EARTHING_ELECTRODE_DATA_MISSING,
                    area=ReadinessAreaV1.STATIONS,
                    priority=ReadinessPriority.BLOCKER,
                    message_pl=(
                        "Brak danych uziomu (Z_E, r) — uzupełnij, by policzyć "
                        "napięcia dotykowe/krokowe."
                    ),
                    element_id=element_id,
                    fix_hint_pl=(
                        "Podaj rezystancję uziomu R_u [Ω] i współczynnik "
                        "podziału r na drodze uziemienia stacji."
                    ),
                ),
            ),
        )

    i_k1_a = sc_result.ikss_a
    r = earth_return_split_factor
    i_u_a = r * i_k1_a
    i_p_a = (1.0 - r) * i_k1_a

    pack_input = EarthingGroundFaultPackInput(
        project_name=project_name,
        case_name=case_name,
        run_timestamp=run_timestamp,
        solver_version=solver_version,
        fault_location=fault_location,
        fault_type="1F-Z",
        earthing_mode=earthing_mode,
        z_e_ohm=earth_electrode_resistance_ohm,
        i_u_a=i_u_a,
        i_p_a=i_p_a,
        r_u_ohm=earth_electrode_resistance_ohm,
    )
    return EarthingBridgeResult(pack_input=pack_input, readiness_issues=())
