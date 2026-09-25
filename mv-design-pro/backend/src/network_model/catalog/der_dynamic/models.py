"""Schematy profili dynamicznych DER (PV / BESS / FW) — szablony katalogu.

Konsument: WYŁĄCZNIE materializacja katalog -> ENM (`enm.dynamika_z_katalogu`), która
przez `to_parametry_dynamiczne` robi z profilu KOPIĘ `Generator.dynamika` (kontrakt
kanoniczny `enm.dynamika_modele.ParametryDynamiczne`, karta W6-1), czytaną przez
adapter biegu `dynamika_rms`. Dawne rzuty profilu na słowniki drugiego, skasowanego
solvera stabilności zniknęły razem z nim (karta AB-P1; bramka wskrzeszenia
w `scripts/legacy_public_path_guard.py`).

PROFIL JEST KOMPLETNY (karta AB-P1 §0.3). Do tej karty `to_parametry_dynamiczne`
wymagało od wołającego pięciu parametrów regulacji (wzmocnienia PLL i regulatora
prądu, współczynnik k FRT) i nie miało ani jednego wołającego — bo żadne źródło tych
liczb nie istniało. Profil katalogowy, który nie wystarcza do zbudowania modelu, nie
jest szablonem modelu. Pola regulacji są więc CZĘŚCIĄ profilu, wymagane zależnie od
trybu sterowania (walidator `_pola_trybu_sterowania`): grid-following wymaga PLL,
regulatora prądu i k FRT, grid-forming — sposobu tworzenia napięcia, impedancji
i tłumienia wirtualnego oraz strategii ograniczenia prądu. Pole spoza trybu jest
BŁĘDEM profilu, nie ignorowanym nadmiarem.

Zero fabrykacji (karta W6-1 SS0 p.3, S-2): żadne pole fizyczne nie ma liczbowej
domyślki — profil bez wartości odmawia się zbudować (Pydantic `ValidationError`).
Każdy profil niesie WYMAGANĄ `proweniencja` (`enm.dynamika_modele.ProweniencjaParametrow`);
osiem profili katalogu (`defaults.py`) ma `zrodlo="profil_typowy_normy"` — wartości
TYPOWE klasy urządzenia (jakość `ESTIMATED`), nigdy „zmierzone na urządzeniu".
"""

from __future__ import annotations

from typing import Literal

from enm.dynamika_modele import (
    PriorytetOgranicznika,
    ProweniencjaParametrow,
    PrzeksztaltnikGFL,
    PrzeksztaltnikGFM,
    StrategiaOgraniczeniaGfm,
    TurbinaWiatrowa,
)
from network_model.pochodne import ms_na_s
from pydantic import BaseModel, ConfigDict, Field, model_validator

DerKind = Literal["PV", "BESS", "FW"]
InverterControlMode = Literal["grid_following", "grid_forming"]
WindIecType = Literal["type_1", "type_2", "type_3", "type_4"]
GfmControl = Literal["droop", "vsm"]

#: Rodzina `ParametryDynamiczne` (`enm.dynamika_modele`) docelowa dla `to_parametry_dynamiczne`
#: per `iec_type` turbiny — jedno zrodlo prawdy dla mapowania IEC 61400-27 -> rodzina kanonu.
_WIND_IEC_TO_RODZINA: dict[
    WindIecType, Literal["wiatr_typ_1", "wiatr_typ_2", "wiatr_typ_3", "wiatr_typ_4"]
] = {
    "type_1": "wiatr_typ_1",
    "type_2": "wiatr_typ_2",
    "type_3": "wiatr_typ_3",
    "type_4": "wiatr_typ_4",
}

#: Typy turbin z przekształtnikiem mocy (częściowym — typ 3, pełnym — typ 4); tylko one
#: niosą pola regulacji przekształtnika (`TurbinaWiatrowa.przeksztaltnik` jest dla nich
#: WYMAGANY, dla typu 1/2 ZABRONIONY — ta sama reguła co kontrakt ENM).
TYPY_Z_PRZEKSZTALTNIKIEM: frozenset[WindIecType] = frozenset({"type_3", "type_4"})

#: Pola regulacji przekształtnika nadążnego — wymagane dla GFL i dla turbin typu 3/4.
POLA_REGULACJI_GFL: tuple[str, ...] = (
    "pll_kp",
    "pll_ki",
    "current_kp",
    "current_ki",
    "frt_k_factor",
)

#: Pola przekształtnika tworzącego sieć — wymagane dla GFM (razem z inercją wirtualną).
POLA_REGULACJI_GFM: tuple[str, ...] = (
    "gfm_control",
    "virtual_inertia_h_s",
    "virtual_damping_pu",
    "virtual_resistance_pu",
    "virtual_reactance_pu",
    "current_limit_strategy",
)

#: Pola przekształtnika turbiny typu 3/4 poza regulacją GFL — wymagane dla typu 3/4.
POLA_PRZEKSZTALTNIKA_TURBINY: tuple[str, ...] = (
    "converter_i_max_pu",
    "iq_priority_during_fault",
    "p_f_droop_pu",
    "p_f_dead_band_hz",
    "q_u_droop_pu",
    "q_u_dead_band_pu",
    *POLA_REGULACJI_GFL,
)


def priorytet_z_profilu(iq_priority_during_fault: bool) -> PriorytetOgranicznika:
    """Priorytet składowej ogranicznika prądu z deklaracji profilu (A-9).

    Profil deklaruje wprost, czy przy zakłóceniu prąd bierny ma pierwszeństwo przed
    czynnym (NC RfG art. 20 ust. 2 lit. b — szybki prąd zwarciowy). Kontrakt ENM zapisuje
    TO SAMO pytanie jako nazwę składowej: `True` -> `"bierna"`, `False` -> `"czynna"`.
    """
    return "bierna" if iq_priority_during_fault else "czynna"


def _brakujace_i_nadmiarowe(
    profil: BaseModel, wymagane: tuple[str, ...], zabronione: tuple[str, ...]
) -> tuple[list[str], list[str]]:
    brakujace = [pole for pole in wymagane if getattr(profil, pole) is None]
    nadmiarowe = [pole for pole in zabronione if getattr(profil, pole) is not None]
    return brakujace, nadmiarowe


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
    """Priorytetyzacja Iq nad Ip podczas zakłócenia (NC RfG art. 20)."""

    # Odzysk mocy czynnej po zakłóceniu
    p_recovery_rate_pu_per_s: float = Field(ge=0.1, le=10.0)
    """Tempo odzysku P (p.u. na sekundę). 80% = 0.8."""

    p_recovery_delay_ms: float = Field(ge=0.0, le=5000.0)
    """Opóźnienie startu odzysku po wyzwoleniu zakłócenia (ms)."""

    # --- Regulacja przekształtnika nadążnego (tylko grid_following) ---------------
    pll_kp: float | None = Field(default=None, gt=0.0, le=500.0)
    """Wzmocnienie proporcjonalne pętli PLL (tylko GFL)."""

    pll_ki: float | None = Field(default=None, gt=0.0, le=50000.0)
    """Wzmocnienie całkujące pętli PLL (tylko GFL)."""

    current_kp: float | None = Field(default=None, gt=0.0, le=100.0)
    """Wzmocnienie proporcjonalne regulatora prądu (tylko GFL)."""

    current_ki: float | None = Field(default=None, gt=0.0, le=100000.0)
    """Wzmocnienie całkujące regulatora prądu (tylko GFL)."""

    frt_k_factor: float | None = Field(default=None, ge=0.0, le=10.0)
    """Współczynnik k dodatkowego prądu biernego przy zapadzie ΔI_q = k·ΔU (tylko GFL)."""

    # --- Przekształtnik tworzący sieć (tylko grid_forming) -------------------------
    gfm_control: GfmControl | None = None
    """Sposób tworzenia napięcia: statyzm (`droop`) albo maszyna wirtualna (`vsm`)."""

    virtual_inertia_h_s: float | None = Field(default=None, ge=0.0, le=20.0)
    """Stała inercji wirtualnej (s) — tylko GFM."""

    virtual_damping_pu: float | None = Field(default=None, ge=0.0, le=100.0)
    """Tłumienie wirtualne (pu) — tylko GFM."""

    virtual_resistance_pu: float | None = Field(default=None, ge=0.0, le=1.0)
    """Rezystancja wirtualna wyjścia (pu) — tylko GFM."""

    virtual_reactance_pu: float | None = Field(default=None, ge=0.0, le=1.0)
    """Reaktancja wirtualna wyjścia (pu) — tylko GFM."""

    current_limit_strategy: StrategiaOgraniczeniaGfm | None = None
    """Strategia ograniczenia prądu GFM — tylko GFM."""

    @model_validator(mode="after")
    def _pola_trybu_sterowania(self) -> InverterDynamicProfile:
        """Komplet pól trybu sterowania — ani brak, ani nadmiar (predykat JEDEN dla obu)."""
        if self.control_mode == "grid_following":
            brakujace, nadmiarowe = _brakujace_i_nadmiarowe(
                self, POLA_REGULACJI_GFL, POLA_REGULACJI_GFM
            )
        else:
            brakujace, nadmiarowe = _brakujace_i_nadmiarowe(
                self, POLA_REGULACJI_GFM, POLA_REGULACJI_GFL
            )
        if brakujace or nadmiarowe:
            raise ValueError(
                f"InverterDynamicProfile '{self.profile_id}' ({self.control_mode}): "
                f"brak pól trybu: {', '.join(brakujace) or '—'}; "
                f"pola spoza trybu: {', '.join(nadmiarowe) or '—'}."
            )
        return self

    def to_parametry_dynamiczne(self, *, s_n_mva: float) -> PrzeksztaltnikGFL | PrzeksztaltnikGFM:
        """Mapowanie 1:1 na kontrakt kanoniczny przekształtnika (karta W6-1 SS0 p.3).

        Grid-following -> `PrzeksztaltnikGFL`, grid-forming -> `PrzeksztaltnikGFM` (do
        karty AB-P1 oba tryby mapowały się na GFL — profil tworzący sieć stawał się
        przekształtnikiem nadążnym bez śladu). Jedyna dana spoza profilu to baza mocy
        `s_n_mva` — cecha URZĄDZENIA (tabliczka × liczba jednostek), nie typu regulacji;
        dostarcza ją materializacja z tabliczki elementu.
        """
        if self.control_mode == "grid_forming":
            # Walidator trybu gwarantuje komplet pól GFM.
            assert self.gfm_control is not None and self.virtual_inertia_h_s is not None
            assert self.virtual_damping_pu is not None and self.virtual_resistance_pu is not None
            assert self.virtual_reactance_pu is not None
            assert self.current_limit_strategy is not None
            return PrzeksztaltnikGFM(
                proweniencja=self.proweniencja,
                s_n_mva=s_n_mva,
                tryb=self.gfm_control,
                mp_pu=self.p_f_droop_pu,
                mq_pu=self.q_u_droop_pu,
                h_wirtualne_s=self.virtual_inertia_h_s,
                d_wirtualne_pu=self.virtual_damping_pu,
                r_wirtualne_pu=self.virtual_resistance_pu,
                x_wirtualne_pu=self.virtual_reactance_pu,
                i_max_pu=self.i_max_pu,
                strategia_ograniczenia=self.current_limit_strategy,
                tp_s=self.tp_s,
                tiq_s=self.tq_s,
            )
        assert self.pll_kp is not None and self.pll_ki is not None
        assert self.current_kp is not None and self.current_ki is not None
        assert self.frt_k_factor is not None
        return PrzeksztaltnikGFL(
            proweniencja=self.proweniencja,
            s_n_mva=s_n_mva,
            i_max_pu=self.i_max_pu,
            priorytet_ogranicznika=priorytet_z_profilu(self.iq_priority_during_fault),
            pll_kp=self.pll_kp,
            pll_ki=self.pll_ki,
            reg_pradu_kp=self.current_kp,
            reg_pradu_ki=self.current_ki,
            k_frt=self.frt_k_factor,
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

    drive_train_damping_pu: float = Field(ge=0.0, le=10.0)
    """Tłumienie wału p.u. Do karty AB-P1 zaszyte w mapowaniu jako 0,0 — teraz dana
    profilu, widoczna i z proweniencją profilu."""

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

    # --- Przekształtnik turbiny (tylko type_3/type_4) -----------------------------
    converter_i_max_pu: float | None = Field(default=None, ge=1.0, le=3.0)
    """Maksymalny prąd przekształtnika (pu) — tylko typ 3/4."""

    iq_priority_during_fault: bool | None = None
    """Priorytet prądu biernego przy zakłóceniu — tylko typ 3/4."""

    p_f_droop_pu: float | None = Field(default=None, ge=0.0, le=0.2)
    """Statyzm P/f przekształtnika (pu); 0 = regulacja wyłączona — tylko typ 3/4."""

    p_f_dead_band_hz: float | None = Field(default=None, ge=0.0, le=1.0)
    q_u_droop_pu: float | None = Field(default=None, ge=0.0, le=0.2)
    """Statyzm Q/U przekształtnika (pu); 0 = regulacja wyłączona — tylko typ 3/4."""

    q_u_dead_band_pu: float | None = Field(default=None, ge=0.0, le=0.2)
    pll_kp: float | None = Field(default=None, gt=0.0, le=500.0)
    pll_ki: float | None = Field(default=None, gt=0.0, le=50000.0)
    current_kp: float | None = Field(default=None, gt=0.0, le=100.0)
    current_ki: float | None = Field(default=None, gt=0.0, le=100000.0)
    frt_k_factor: float | None = Field(default=None, ge=0.0, le=10.0)

    @model_validator(mode="after")
    def _pola_przeksztaltnika(self) -> WindTurbineDynamicProfile:
        """Typ 3/4 wymaga KOMPLETU pól przekształtnika, typ 1/2 nie dopuszcza żadnego."""
        if self.iec_type in TYPY_Z_PRZEKSZTALTNIKIEM:
            brakujace, nadmiarowe = _brakujace_i_nadmiarowe(self, POLA_PRZEKSZTALTNIKA_TURBINY, ())
        else:
            brakujace, nadmiarowe = _brakujace_i_nadmiarowe(self, (), POLA_PRZEKSZTALTNIKA_TURBINY)
        if brakujace or nadmiarowe:
            raise ValueError(
                f"WindTurbineDynamicProfile '{self.profile_id}' ({self.iec_type}): "
                f"brak pól przekształtnika: {', '.join(brakujace) or '—'}; "
                f"pola przekształtnika niedopuszczalne dla typu: {', '.join(nadmiarowe) or '—'}."
            )
        return self

    def to_parametry_dynamiczne(self, *, s_n_mva: float) -> TurbinaWiatrowa:
        """Mapowanie 1:1 na kontrakt kanoniczny `TurbinaWiatrowa` (karta W6-1 SS0 p.3).

        Typ 1/2 nie ma przekształtnika (kontrakt ENM go odrzuca); typ 3/4 dostaje
        `PrzeksztaltnikGFL` z pól profilu — do karty AB-P1 statyzmy P/f i Q/U oraz
        tłumienie wału były tu stałymi 0,0 zaszytymi w kodzie, a pięć parametrów
        regulacji musiał podać wołający, którego nie było. `s_n_mva` (baza mocy
        przekształtnika) to cecha URZĄDZENIA z tabliczki, nie profilu.
        """
        rodzina = _WIND_IEC_TO_RODZINA[self.iec_type]
        przeksztaltnik = None
        if self.iec_type in TYPY_Z_PRZEKSZTALTNIKIEM:
            # Walidator `_pola_przeksztaltnika` gwarantuje komplet pól.
            assert self.converter_i_max_pu is not None
            assert self.iq_priority_during_fault is not None
            assert self.pll_kp is not None and self.pll_ki is not None
            assert self.current_kp is not None and self.current_ki is not None
            assert self.frt_k_factor is not None
            assert self.p_f_droop_pu is not None and self.p_f_dead_band_hz is not None
            assert self.q_u_droop_pu is not None and self.q_u_dead_band_pu is not None
            przeksztaltnik = PrzeksztaltnikGFL(
                proweniencja=self.proweniencja,
                s_n_mva=s_n_mva,
                i_max_pu=self.converter_i_max_pu,
                priorytet_ogranicznika=priorytet_z_profilu(self.iq_priority_during_fault),
                pll_kp=self.pll_kp,
                pll_ki=self.pll_ki,
                reg_pradu_kp=self.current_kp,
                reg_pradu_ki=self.current_ki,
                k_frt=self.frt_k_factor,
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
        return TurbinaWiatrowa(
            rodzina=rodzina,
            proweniencja=self.proweniencja,
            h_calkowite_s=self.h_total_s,
            sztywnosc_walu_pu=self.drive_train_stiffness_pu,
            tlumienie_walu_pu=self.drive_train_damping_pu,
            poslizg_ustalony_pu=self.slip_steady_pu,
            pitch_tempo_deg_s=self.pitch_rate_deg_per_s,
            pitch_min_deg=self.pitch_min_deg,
            pitch_max_deg=self.pitch_max_deg,
            przeksztaltnik=przeksztaltnik,
        )


# Unia konsumowana przez resolver
DerDynamicProfile = InverterDynamicProfile | WindTurbineDynamicProfile
