"""Schematy profili dynamicznych DER (PV / BESS / FW).

Konsumowane przez dwie generacje kontraktu:
- `network_model.solvers.stability_rms.engine` / `network_model.solvers.frt_hvrt.engine`
  (`to_stability_parameters`/`to_frt_parameters`) — silniki FROZEN do kasacji
  po W6-5 (OD-20), NIETKNIĘTE tą kartą (B-01).
- `enm.dynamika_modele.ParametryDynamiczne` (kontrakt kanoniczny W6-1,
  `to_parametry_dynamiczne`) — jedyny kontrakt konsumowany przez przyszły
  solver W6-2/W6-3.

Karta W6-1 SS0 p.3 (zero fabrykacji — dopelnienie precedensu k_sc DEFAULT_FORBIDDEN,
S-2): pola fizyczne NIE MAJA JUZ `default=` — profil bez jawnie podanej wartosci
odmawia sie zbudowac (Pydantic `ValidationError`), zamiast cicho przyjac liczbe,
ktorej nikt nie zadeklarowal. Kazdy profil niesie `proweniencja` WYMAGANA
(`enm.dynamika_modele.ProweniencjaParametrow`) — 8 profili katalogu
(`defaults.py`) ma `zrodlo="profil_typowy_normy"` z odniesieniem do SANKCJONOWANEJ
normy (IEEE 1547-2018 dla PV/BESS, IEC 61400-27-1:2020 dla wiatru, NC RfG
2016/631 gdzie dotyczy) — NIGDY fikcyjnej "praktyki producenta" bez zrodla.
"""

from __future__ import annotations

from typing import Literal

from enm.dynamika_modele import (
    PriorytetOgranicznika,
    PrzeksztaltnikGFL,
    ProweniencjaParametrow,
    StrategiaOgraniczeniaGfm,
    TurbinaWiatrowa,
)
from network_model.pochodne import ms_na_s
from pydantic import BaseModel, ConfigDict, Field

DerKind = Literal["PV", "BESS", "FW"]
InverterControlMode = Literal["grid_following", "grid_forming"]
WindIecType = Literal["type_1", "type_2", "type_3", "type_4"]

#: Rodzina `ParametryDynamiczne` (`enm.dynamika_modele`) docelowa dla `to_parametry_dynamiczne`
#: per `iec_type` turbiny — jedno zrodlo prawdy dla mapowania IEC 61400-27 -> rodzina kanonu.
_WIND_IEC_TO_RODZINA: dict[WindIecType, Literal["wiatr_typ_1", "wiatr_typ_2", "wiatr_typ_3", "wiatr_typ_4"]] = {
    "type_1": "wiatr_typ_1",
    "type_2": "wiatr_typ_2",
    "type_3": "wiatr_typ_3",
    "type_4": "wiatr_typ_4",
}


class InverterDynamicProfile(BaseModel):
    """Profil dynamiczny falownika DER (PV lub BESS) zgodny z IEEE 1547 + NC RfG."""

    model_config = ConfigDict(frozen=True)

    profile_id: str
    profile_name_pl: str
    der_kind: DerKind  # "PV" | "BESS"
    control_mode: InverterControlMode
    proweniencja: ProweniencjaParametrow

    # Filtry pomiarowe (1st order)
    tp_s: float = Field(ge=0.001, le=2.0)
    """Stała czasowa filtru P (s)."""

    tq_s: float = Field(ge=0.001, le=2.0)
    """Stała czasowa filtru Q (s)."""

    # Droop P/f (regulacja częstotliwościowa)
    p_f_droop_pu: float = Field(ge=0.0, le=1.0)
    """Droop P/f w p.u. (5% = 0.05). Wymagany B/C/D w NC RfG."""

    p_f_dead_band_hz: float = Field(ge=0.0, le=1.0)
    """Pasmo nieczułości częstotliwości (Hz)."""

    # Droop Q/U (regulacja napięciowa)
    q_u_droop_pu: float = Field(ge=0.0, le=1.0)
    """Droop Q/U w p.u."""

    q_u_dead_band_pu: float = Field(ge=0.0, le=0.2)
    """Pasmo nieczułości napięcia (p.u.)."""

    # Limity prądowo-napięciowe
    i_max_pu: float = Field(ge=1.0, le=3.0)
    """Maksymalny prąd p.u. (typowo 1.1–1.3 × I_n)."""

    v_min_continuous_pu: float = Field(ge=0.5, le=1.0)
    v_max_continuous_pu: float = Field(ge=1.0, le=1.5)

    # Odpowiedź FRT (LVRT/HVRT)
    frt_response_time_ms: float = Field(ge=10.0, le=500.0)
    """Czas odpowiedzi prądu biernego po wykryciu zakłócenia (ms)."""

    iq_max_during_fault_pu: float = Field(ge=0.0, le=2.0)
    """Maksymalny prąd bierny podczas FRT (% nominal)."""

    iq_priority_during_fault: bool
    """Priorytetyzacja Iq nad Ip podczas zakłócenia (NC RfG art. 13)."""

    # Odzysk mocy czynnej po zakłóceniu
    p_recovery_rate_pu_per_s: float = Field(ge=0.1, le=10.0)
    """Tempo odzysku P (p.u. na sekundę). 80% = 0.8."""

    p_recovery_delay_ms: float = Field(ge=0.0, le=5000.0)
    """Opóźnienie startu odzysku po wyzwoleniu zakłócenia (ms)."""

    # Stała inercji wirtualnej (tylko GFM)
    virtual_inertia_h_s: float | None = Field(default=None, ge=0.0, le=20.0)
    """Stała inercji wirtualnej (s). None dla GFL, 2-8 s dla GFM."""

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
            "frt_response_time_s": ms_na_s(self.frt_response_time_ms),
            "p_recovery_rate_pu_per_s": self.p_recovery_rate_pu_per_s,
            "p_recovery_delay_s": ms_na_s(self.p_recovery_delay_ms),
            "v_min_continuous_pu": self.v_min_continuous_pu,
            "v_max_continuous_pu": self.v_max_continuous_pu,
            "iq_priority": 1.0 if self.iq_priority_during_fault else 0.0,
        }

    def to_parametry_dynamiczne(
        self,
        *,
        priorytet_ogranicznika: PriorytetOgranicznika,
        s_n_mva: float,
        pll_kp: float,
        pll_ki: float,
        reg_pradu_kp: float,
        reg_pradu_ki: float,
        k_frt: float,
    ) -> PrzeksztaltnikGFL:
        """Mapowanie 1:1 na kontrakt kanoniczny `PrzeksztaltnikGFL` (karta W6-1 SS0 p.3).

        Pola BEZ odpowiednika w tym profilu (priorytet ogranicznika — A-9, baza
        mocy, wzmocnienia PLL/regulatora pradu, wzmocnienie Iq FRT) są WYMAGANE
        argumentami tej funkcji — nie maja tu zrodla i nie wolno ich zgadywac
        (zero fabrykacji). Wolajacy (resolver/materializacja katalogu) dostarcza
        je z WLASNEGO zrodla (karta katalogowa przeksztaltnika) albo funkcja nie
        jest wywolywana (brak = odmowa nazwana wyzej w lancuchu).
        """
        return PrzeksztaltnikGFL(
            proweniencja=self.proweniencja,
            s_n_mva=s_n_mva,
            i_max_pu=self.i_max_pu,
            priorytet_ogranicznika=priorytet_ogranicznika,
            pll_kp=pll_kp,
            pll_ki=pll_ki,
            reg_pradu_kp=reg_pradu_kp,
            reg_pradu_ki=reg_pradu_ki,
            k_frt=k_frt,
            prog_frt_pu=self.v_min_continuous_pu,
            tp_s=self.tp_s,
            tiq_s=self.tq_s,
            p_odbudowa_pu_na_s=self.p_recovery_rate_pu_per_s,
            p_odbudowa_opoznienie_s=ms_na_s(self.p_recovery_delay_ms),
            droop_p_f_pu=self.p_f_droop_pu,
            martwa_strefa_f_hz=self.p_f_dead_band_hz,
            droop_q_u_pu=self.q_u_droop_pu,
            martwa_strefa_u_pu=self.q_u_dead_band_pu,
            u_min_ciagle_pu=self.v_min_continuous_pu,
            u_max_ciagle_pu=self.v_max_continuous_pu,
        )


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
    proweniencja: ProweniencjaParametrow

    # Drive train (combined inertia rotor + generator)
    h_total_s: float = Field(ge=1.0, le=15.0)
    """Stała inercji równoważna H = J·ω²/(2·S_n) [s]."""

    drive_train_stiffness_pu: float = Field(ge=10.0, le=300.0)
    """Sztywność wału p.u. (typowa 80 dla DFIG, 50 dla PMSG)."""

    # Filtry pomiarowe (type 3/4)
    tp_s: float = Field(ge=0.001, le=2.0)
    tq_s: float = Field(ge=0.001, le=2.0)

    # Pitch control (sterowanie kątem łopaty, dla wiatrów > nominal)
    pitch_rate_deg_per_s: float = Field(ge=0.5, le=20.0)
    pitch_min_deg: float = Field(ge=-5.0, le=10.0)
    pitch_max_deg: float = Field(ge=15.0, le=90.0)

    # FRT response
    frt_response_time_ms: float = Field(ge=10.0, le=500.0)
    iq_max_during_fault_pu: float = Field(ge=0.0, le=2.0)
    p_recovery_rate_pu_per_s: float = Field(ge=0.1, le=5.0)
    p_recovery_delay_ms: float = Field(ge=0.0, le=5000.0)

    # Generator (type 1/2 SCIG/WRIG)
    slip_steady_pu: float = Field(ge=0.0, le=0.1)
    """Steady-state slip (p.u.). 0.0 dla PMSG (type 4), 0.02–0.03 dla SCIG/DFIG."""

    # Limity napięciowe
    v_min_continuous_pu: float = Field(ge=0.5, le=1.0)
    v_max_continuous_pu: float = Field(ge=1.0, le=1.5)

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
            "frt_response_time_s": ms_na_s(self.frt_response_time_ms),
            "p_recovery_rate_pu_per_s": self.p_recovery_rate_pu_per_s,
            "p_recovery_delay_s": ms_na_s(self.p_recovery_delay_ms),
            "v_min_continuous_pu": self.v_min_continuous_pu,
            "v_max_continuous_pu": self.v_max_continuous_pu,
            "iq_priority": 1.0,
        }

    def to_parametry_dynamiczne(
        self,
        *,
        i_max_pu: float | None = None,
        priorytet_ogranicznika: PriorytetOgranicznika | None = None,
        s_n_mva: float | None = None,
        pll_kp: float | None = None,
        pll_ki: float | None = None,
        reg_pradu_kp: float | None = None,
        reg_pradu_ki: float | None = None,
        k_frt: float | None = None,
    ) -> TurbinaWiatrowa:
        """Mapowanie 1:1 na kontrakt kanoniczny `TurbinaWiatrowa` (karta W6-1 SS0 p.3).

        typ_1/typ_2 (bez przekształtnika mocy pełnej/częściowej w tym modelu) nie
        przyjmują żadnego z argumentów przekształtnika (kontrakt `TurbinaWiatrowa`
        odrzuca `przeksztaltnik` dla tych typów — spójność rodziny pilnowana w
        `enm.dynamika_modele`). typ_3/typ_4 WYMAGAJĄ kompletu argumentów
        przekształtnika — brak jest błędem wywołania (zero fabrykacji), nie cichym
        pominięciem bloku.
        """
        rodzina = _WIND_IEC_TO_RODZINA[self.iec_type]
        przeksztaltnik = None
        if self.iec_type in ("type_3", "type_4"):
            brakujace = [
                nazwa
                for nazwa, wartosc in (
                    ("i_max_pu", i_max_pu),
                    ("priorytet_ogranicznika", priorytet_ogranicznika),
                    ("s_n_mva", s_n_mva),
                    ("pll_kp", pll_kp),
                    ("pll_ki", pll_ki),
                    ("reg_pradu_kp", reg_pradu_kp),
                    ("reg_pradu_ki", reg_pradu_ki),
                    ("k_frt", k_frt),
                )
                if wartosc is None
            ]
            if brakujace:
                raise ValueError(
                    f"WindTurbineDynamicProfile.to_parametry_dynamiczne({self.iec_type}): "
                    f"brak argumentow przeksztaltnika: {', '.join(brakujace)}."
                )
            przeksztaltnik = PrzeksztaltnikGFL(
                proweniencja=self.proweniencja,
                s_n_mva=s_n_mva,  # type: ignore[arg-type]
                i_max_pu=i_max_pu,  # type: ignore[arg-type]
                priorytet_ogranicznika=priorytet_ogranicznika,  # type: ignore[arg-type]
                pll_kp=pll_kp,  # type: ignore[arg-type]
                pll_ki=pll_ki,  # type: ignore[arg-type]
                reg_pradu_kp=reg_pradu_kp,  # type: ignore[arg-type]
                reg_pradu_ki=reg_pradu_ki,  # type: ignore[arg-type]
                k_frt=k_frt,  # type: ignore[arg-type]
                prog_frt_pu=self.v_min_continuous_pu,
                tp_s=self.tp_s,
                tiq_s=self.tq_s,
                p_odbudowa_pu_na_s=self.p_recovery_rate_pu_per_s,
                p_odbudowa_opoznienie_s=ms_na_s(self.p_recovery_delay_ms),
                droop_p_f_pu=0.0,
                martwa_strefa_f_hz=0.0,
                droop_q_u_pu=0.0,
                martwa_strefa_u_pu=0.0,
                u_min_ciagle_pu=self.v_min_continuous_pu,
                u_max_ciagle_pu=self.v_max_continuous_pu,
            )
        return TurbinaWiatrowa(
            rodzina=rodzina,
            proweniencja=self.proweniencja,
            h_calkowite_s=self.h_total_s,
            sztywnosc_walu_pu=self.drive_train_stiffness_pu,
            tlumienie_walu_pu=0.0,
            poslizg_ustalony_pu=self.slip_steady_pu,
            pitch_tempo_deg_s=self.pitch_rate_deg_per_s,
            pitch_min_deg=self.pitch_min_deg,
            pitch_max_deg=self.pitch_max_deg,
            przeksztaltnik=przeksztaltnik,
        )


# Unia konsumowana przez resolver
DerDynamicProfile = InverterDynamicProfile | WindTurbineDynamicProfile
