"""Schematy profili dynamicznych DER (PV / BESS / FW).

Brief 2 §15 (PR-15) + §16 (PR-16): każdy DER musi dostarczyć parametry modelu
dynamicznego konsumowane przez:
- `network_model.solvers.stability_rms.engine` (Newton-Raphson trapezoidal)
- `network_model.solvers.frt_hvrt.engine` (voltage dip simulation)

Profile produkują słowniki `parameters: dict[str, float]` zgodne z kontraktem
`DynamicModelParameters.parameters` w `stability_rms/contracts.py` oraz pola
FRT/HVRT konsumowane przez `frt_hvrt/engine.py`.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

DerKind = Literal["PV", "BESS", "FW"]
InverterControlMode = Literal["grid_following", "grid_forming"]
WindIecType = Literal["type_1", "type_2", "type_3", "type_4"]


class InverterDynamicProfile(BaseModel):
    """Profil dynamiczny falownika DER (PV lub BESS) zgodny z IEEE 1547 + NC RfG.

    Wartości domyślne odpowiadają typowemu falownikowi grid-following (GFL)
    podpiętemu po SN, certyfikowanemu wg NC RfG (typ B/C). Dla GFM wartości
    droop P/f są skalowane (mniejsze stałe czasowe).
    """

    model_config = ConfigDict(frozen=True)

    profile_id: str
    profile_name_pl: str
    der_kind: DerKind  # "PV" | "BESS"
    control_mode: InverterControlMode

    # Filtry pomiarowe (1st order)
    tp_s: float = Field(default=0.05, ge=0.001, le=2.0)
    """Stała czasowa filtru P (s)."""

    tq_s: float = Field(default=0.05, ge=0.001, le=2.0)
    """Stała czasowa filtru Q (s)."""

    # Droop P/f (regulacja częstotliwościowa)
    p_f_droop_pu: float = Field(default=0.05, ge=0.0, le=1.0)
    """Droop P/f w p.u. (5% = 0.05). Wymagany B/C/D w NC RfG."""

    p_f_dead_band_hz: float = Field(default=0.2, ge=0.0, le=1.0)
    """Pasmo nieczułości częstotliwości (Hz)."""

    # Droop Q/U (regulacja napięciowa)
    q_u_droop_pu: float = Field(default=0.10, ge=0.0, le=1.0)
    """Droop Q/U w p.u."""

    q_u_dead_band_pu: float = Field(default=0.02, ge=0.0, le=0.2)
    """Pasmo nieczułości napięcia (p.u.)."""

    # Limity prądowo-napięciowe
    i_max_pu: float = Field(default=1.20, ge=1.0, le=3.0)
    """Maksymalny prąd p.u. (typowo 1.1–1.3 × I_n)."""

    v_min_continuous_pu: float = Field(default=0.85, ge=0.5, le=1.0)
    v_max_continuous_pu: float = Field(default=1.10, ge=1.0, le=1.5)

    # Odpowiedź FRT (LVRT/HVRT)
    frt_response_time_ms: float = Field(default=60.0, ge=10.0, le=500.0)
    """Czas odpowiedzi prądu biernego po wykryciu zakłócenia (ms)."""

    iq_max_during_fault_pu: float = Field(default=1.0, ge=0.0, le=2.0)
    """Maksymalny prąd bierny podczas FRT (% nominal)."""

    iq_priority_during_fault: bool = True
    """Priorytetyzacja Iq nad Ip podczas zakłócenia (NC RfG art. 13)."""

    # Odzysk mocy czynnej po zakłóceniu
    p_recovery_rate_pu_per_s: float = Field(default=0.80, ge=0.1, le=10.0)
    """Tempo odzysku P (p.u. na sekundę). 80% = 0.8."""

    p_recovery_delay_ms: float = Field(default=100.0, ge=0.0, le=5000.0)
    """Opóźnienie startu odzysku po wyzwoleniu zakłócenia (ms)."""

    # Stała inercji wirtualnej (tylko GFM)
    virtual_inertia_h_s: float | None = Field(default=None, ge=0.0, le=20.0)
    """Stała inercji wirtualnej (s). None dla GFL, 2-8 s dla GFM."""

    # Źródło danych
    source_reference: str = "IEEE 1547-2018 + NC RfG (Komisja UE 2016/631)"
    standard_compliance: tuple[str, ...] = ("IEEE 1547", "NC RfG", "IEC 62116")

    # Identyfikator zgodny z `DynamicModelKind` w stability contract
    @property
    def stability_model_kind(self) -> str:
        if self.der_kind == "PV":
            return (
                "pv_inverter_grid_forming"
                if self.control_mode == "grid_forming"
                else "pv_inverter_grid_following"
            )
        return (
            "bess_pcs_grid_forming"
            if self.control_mode == "grid_forming"
            else "bess_pcs_grid_following"
        )

    def to_stability_parameters(self) -> dict[str, float]:
        """Słownik konsumowany przez `stability_rms.engine._model_derivative`.

        Klucze odpowiadają parametrom oczekiwanym przez engine dla
        pv_inverter_grid_following/forming i bess_pcs_grid_following/forming:
        Tp, Tq, Q_droop, V_ref, P_ref.
        """
        return {
            "Tp": self.tp_s,
            "Tq": self.tq_s,
            "Q_droop": self.q_u_droop_pu,
            "V_ref": 1.0,
            "P_ref": 1.0,
            "I_max_pu": self.i_max_pu,
            "P_f_droop": self.p_f_droop_pu,
            "Iq_max_fault": self.iq_max_during_fault_pu,
            "P_recovery_rate": self.p_recovery_rate_pu_per_s,
            "FRT_response_ms": self.frt_response_time_ms,
            "H_virtual": self.virtual_inertia_h_s or 0.0,
        }

    def to_frt_parameters(self) -> dict[str, float]:
        """Parametry konsumowane przez `frt_hvrt.engine` dla pojedynczego DER."""
        return {
            "iq_max_during_fault_pu": self.iq_max_during_fault_pu,
            "frt_response_time_s": self.frt_response_time_ms / 1000.0,
            "p_recovery_rate_pu_per_s": self.p_recovery_rate_pu_per_s,
            "p_recovery_delay_s": self.p_recovery_delay_ms / 1000.0,
            "v_min_continuous_pu": self.v_min_continuous_pu,
            "v_max_continuous_pu": self.v_max_continuous_pu,
            "iq_priority": 1.0 if self.iq_priority_during_fault else 0.0,
        }


class WindTurbineDynamicProfile(BaseModel):
    """Profil dynamiczny turbiny wiatrowej zgodny z IEC 61400-27.

    Mapping IEC type → tryb pracy:
    - type_1: SCIG (Squirrel Cage Induction Generator), bez konwertera
    - type_2: WRIG (Wound Rotor Induction Generator), z rezystancją w wirniku
    - type_3: DFIG (Doubly Fed Induction Generator)
    - type_4: PMSG / FSC (Full Scale Converter — synchroniczny PMSG lub asynchr.)
    """

    model_config = ConfigDict(frozen=True)

    profile_id: str
    profile_name_pl: str
    iec_type: WindIecType

    # Drive train (combined inertia rotor + generator)
    h_total_s: float = Field(default=5.0, ge=1.0, le=15.0)
    """Stała inercji równoważna H = J·ω²/(2·S_n) [s]."""

    drive_train_stiffness_pu: float = Field(default=80.0, ge=10.0, le=300.0)
    """Sztywność wału p.u. (typowa 80 dla DFIG, 50 dla PMSG)."""

    # Filtry pomiarowe (type 3/4)
    tp_s: float = Field(default=0.10, ge=0.001, le=2.0)
    tq_s: float = Field(default=0.10, ge=0.001, le=2.0)

    # Pitch control (sterowanie kątem łopaty, dla wiatrów > nominal)
    pitch_rate_deg_per_s: float = Field(default=8.0, ge=0.5, le=20.0)
    pitch_min_deg: float = Field(default=0.0, ge=-5.0, le=10.0)
    pitch_max_deg: float = Field(default=27.0, ge=15.0, le=90.0)

    # FRT response
    frt_response_time_ms: float = Field(default=80.0, ge=10.0, le=500.0)
    iq_max_during_fault_pu: float = Field(default=1.0, ge=0.0, le=2.0)
    p_recovery_rate_pu_per_s: float = Field(default=0.50, ge=0.1, le=5.0)
    p_recovery_delay_ms: float = Field(default=200.0, ge=0.0, le=5000.0)

    # Generator (type 1/2 SCIG/WRIG)
    slip_steady_pu: float = Field(default=0.02, ge=0.0, le=0.1)
    """Steady-state slip (p.u.). 0.0 dla PMSG (type 4), 0.02–0.03 dla SCIG/DFIG."""

    # Limity napięciowe
    v_min_continuous_pu: float = Field(default=0.85, ge=0.5, le=1.0)
    v_max_continuous_pu: float = Field(default=1.10, ge=1.0, le=1.5)

    source_reference: str = "IEC 61400-27-1:2020 generic dynamic model"
    standard_compliance: tuple[str, ...] = ("IEC 61400-27", "NC RfG")

    @property
    def stability_model_kind(self) -> str:
        return f"wind_{self.iec_type}"

    def to_stability_parameters(self) -> dict[str, float]:
        if self.iec_type in ("type_1", "type_2"):
            return {
                "Tw": self.h_total_s,
                "omega_ref_pu": 1.0,
                "slip_steady": self.slip_steady_pu,
                "K_drive_train": self.drive_train_stiffness_pu,
                "Iq_max_fault": self.iq_max_during_fault_pu,
                "P_recovery_rate": self.p_recovery_rate_pu_per_s,
                "FRT_response_ms": self.frt_response_time_ms,
            }
        # type_3 (DFIG) i type_4 (full converter)
        return {
            "Tp": self.tp_s,
            "Tq": self.tq_s,
            "P_ref": 1.0,
            "Q_ref": 0.0,
            "H": self.h_total_s,
            "K_drive_train": self.drive_train_stiffness_pu,
            "Pitch_rate": self.pitch_rate_deg_per_s,
            "Iq_max_fault": self.iq_max_during_fault_pu,
            "P_recovery_rate": self.p_recovery_rate_pu_per_s,
            "FRT_response_ms": self.frt_response_time_ms,
        }

    def to_frt_parameters(self) -> dict[str, float]:
        return {
            "iq_max_during_fault_pu": self.iq_max_during_fault_pu,
            "frt_response_time_s": self.frt_response_time_ms / 1000.0,
            "p_recovery_rate_pu_per_s": self.p_recovery_rate_pu_per_s,
            "p_recovery_delay_s": self.p_recovery_delay_ms / 1000.0,
            "v_min_continuous_pu": self.v_min_continuous_pu,
            "v_max_continuous_pu": self.v_max_continuous_pu,
            "iq_priority": 1.0,
        }


# Unia konsumowana przez resolver
DerDynamicProfile = InverterDynamicProfile | WindTurbineDynamicProfile
