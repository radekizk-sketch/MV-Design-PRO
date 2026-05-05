"""Kontrakty domeny solvera stabilności RMS (PR-15).

FROZEN API — zgodnie z AGENTS.md §2.6 Frozen Result API Rule. Dostawca solvera
RMS musi spełnić ten kontrakt; pole `solver_module_available` informuje czy
moduł numeryczny jest podpięty.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Modele dynamiczne — 8 typów wymaganych przez brief 2 §15 (PR-15)
# ---------------------------------------------------------------------------

DynamicModelKind = Literal[
    "synchronous_machine_6th_order",  # GENROU/GENSAL z saturacją
    "avr_ieee_t1",                     # AVR IEEE Type 1
    "avr_ieee_t2",                     # AVR IEEE Type 2
    "avr_ac4a",                        # AVR AC4A
    "avr_st5b",                        # AVR ST5B (statyczny)
    "governor_tgov1",                  # Governor TGOV1
    "governor_gast",                   # Governor GAST
    "governor_ieee_g1",                # IEEE-G1
    "pss_ieee_pss2a",                  # PSS IEEE PSS2A
    "pss_ieee_pss2b",                  # PSS IEEE PSS2B
    "induction_motor_5th_order",       # Silnik indukcyjny 5-rzędowy
    "wind_type_1",                     # IEC 61400-27 Type 1 (asynchroniczna)
    "wind_type_2",                     # Type 2 (asynchroniczna z rezystancją)
    "wind_type_3",                     # Type 3 (DFIG)
    "wind_type_4",                     # Type 4 (full converter)
    "pv_inverter_grid_following",      # Generic PV inverter (GFL)
    "pv_inverter_grid_forming",        # Grid-forming PV
    "bess_pcs_grid_following",         # BESS PCS grid-following
    "bess_pcs_grid_forming",           # BESS PCS grid-forming + droop
]


class DynamicModelParameters(BaseModel):
    """Parametry modelu dynamicznego dla pojedynczego elementu DER/source."""

    element_ref: str  # ref do generator/source/load w ENM
    model_kind: DynamicModelKind
    parameters: dict[str, float] = Field(default_factory=dict)
    """np. {"H": 4.5, "Td0_prim": 8.0, ...} dla machine 6-rzędowy."""


class DisturbanceEvent(BaseModel):
    """Zakłócenie symulowane w time-domain."""

    event_id: str
    event_type: Literal[
        "three_phase_fault",
        "single_phase_fault",
        "line_trip",
        "load_step",
        "der_trip",
        "voltage_step",
    ]
    time_s: float
    duration_s: float
    target_ref: str | None = None  # ref do bus/branch dla fault/trip
    magnitude_pu: float | None = None  # dla load_step/voltage_step


class StabilitySolverInput(BaseModel):
    """Wejście solvera stabilności RMS."""

    enm_ref: str  # snapshot fingerprint
    simulation_duration_s: float = 10.0
    integration_step_s: float = 0.005
    dynamic_models: list[DynamicModelParameters] = Field(default_factory=list)
    events: list[DisturbanceEvent] = Field(default_factory=list)
    linearize_at_t0: bool = False  # eigenvalue analysis
    integrator: Literal["trapezoidal_implicit", "rk4"] = "trapezoidal_implicit"
    convergence_tolerance: float = 1.0e-6


# ---------------------------------------------------------------------------
# Wynik solvera (FROZEN API)
# ---------------------------------------------------------------------------

StabilityStatus = Literal[
    "ok",                # Solver zbiegł
    "diverged",          # Solver nie zbiegł (małe-sygnał lub time-domain)
    "no_module",         # Brak modułu numerycznego (PR-15-impl pending)
    "input_invalid",     # Walidacja wejścia się nie powiodła
]


class EigenvaluePoint(BaseModel):
    """Pojedyncza wartość własna w analizie małosygnałowej."""

    real: float
    imag: float
    damping_ratio: float | None = None  # ξ
    natural_frequency_hz: float | None = None


class TrajectorySample(BaseModel):
    """Pojedynczy punkt trajektorii czasowej."""

    time_s: float
    voltage_pu: float | None = None
    active_power_mw: float | None = None
    reactive_power_mvar: float | None = None
    rotor_angle_rad: float | None = None
    speed_pu: float | None = None


class ElementTrajectory(BaseModel):
    """Trajektoria czasowo-domeny dla pojedynczego elementu."""

    element_ref: str
    samples: list[TrajectorySample] = Field(default_factory=list)


class StabilityResult(BaseModel):
    """FROZEN API solvera stabilności RMS (PR-15)."""

    status: StabilityStatus
    no_module_reason_pl: str | None = None  # gdy status=no_module
    eigenvalues: list[EigenvaluePoint] = Field(default_factory=list)
    trajectories: list[ElementTrajectory] = Field(default_factory=list)
    small_signal_stability_margin: float | None = None
    convergence_iterations: int | None = None
    white_box_trace_path: str | None = None  # ścieżka do pełnego trace audit


# ---------------------------------------------------------------------------
# Adapter API
# ---------------------------------------------------------------------------


class StabilitySolverAdapter:
    """Adapter API solvera stabilności RMS.

    Status `no_module` zwracany dopóki nie zostanie podpięty solver
    numeryczny. Schema, walidacja, UI są gotowe do podpięcia w PR-15-impl.
    """

    NO_MODULE_REASON_PL = (
        "Solver stabilności RMS (Newton-Raphson dynamic + 8 modeli: "
        "synchronous 6-rzędowy, AVR IEEE T1/T2/AC4A/ST5B, governor "
        "TGOV1/GAST/IEEE-G1, PSS, induction motor, wind type 1-4, "
        "PV inverter, BESS PCS) nie jest podpięty w aktualnym module "
        "obliczeniowym. Schema StabilitySolverInput, walidacja, UI w "
        "konfiguratorze DER (PR-9/10/11) i adapter API są gotowe — "
        "pełna implementacja numeryczna w osobnej sesji eksperta solver "
        "(~42 osobodni)."
    )

    def validate_input(
        self, solver_input: StabilitySolverInput,
    ) -> tuple[bool, list[str]]:
        """Walidacja wejścia solvera. Zwraca (valid, errors_pl)."""
        errors: list[str] = []
        if solver_input.simulation_duration_s <= 0:
            errors.append("Czas symulacji musi być większy od 0.")
        if solver_input.integration_step_s <= 0:
            errors.append("Krok integracji musi być większy od 0.")
        if solver_input.integration_step_s > solver_input.simulation_duration_s:
            errors.append("Krok integracji większy niż czas symulacji.")
        if not solver_input.dynamic_models:
            errors.append("Lista modeli dynamicznych jest pusta.")
        if not solver_input.events:
            errors.append("Lista zdarzeń (events) jest pusta — symulacja bez zaburzeń.")
        for ev in solver_input.events:
            if ev.time_s < 0:
                errors.append(f"Event {ev.event_id}: czas startu < 0.")
            if ev.duration_s <= 0:
                errors.append(f"Event {ev.event_id}: duration_s <= 0.")
            if ev.time_s + ev.duration_s > solver_input.simulation_duration_s:
                errors.append(
                    f"Event {ev.event_id}: koniec zdarzenia poza horyzontem symulacji."
                )
        return len(errors) == 0, errors

    def run(self, solver_input: StabilitySolverInput) -> StabilityResult:
        """Uruchom solver. Aktualnie zwraca status=no_module zgodnie z PR-15-impl pending."""
        valid, errors = self.validate_input(solver_input)
        if not valid:
            return StabilityResult(
                status="input_invalid",
                no_module_reason_pl="Walidacja wejścia: " + "; ".join(errors),
            )
        # PR-15-impl: tutaj będzie podpięcie solver_rms_engine.
        return StabilityResult(
            status="no_module",
            no_module_reason_pl=self.NO_MODULE_REASON_PL,
        )
