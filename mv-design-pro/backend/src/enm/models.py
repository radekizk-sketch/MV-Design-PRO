"""
EnergyNetworkModel (ENM) — Pydantic v2 canonical models.

Kanoniczny kontrakt modelu sieci elektroenergetycznej.
Jedno źródło prawdy dla projektu (case-bound).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Supporting types
# ---------------------------------------------------------------------------


class GroundingConfig(BaseModel):
    type: Literal["isolated", "petersen_coil", "directly_grounded", "resistor_grounded"]
    r_ohm: float | None = None
    x_ohm: float | None = None


class BusLimits(BaseModel):
    u_min_pu: float | None = None
    u_max_pu: float | None = None


class BranchRating(BaseModel):
    in_a: float | None = None
    ith_ka: float | None = None
    idyn_ka: float | None = None


class GenLimits(BaseModel):
    p_min_mw: float | None = None
    p_max_mw: float | None = None
    q_min_mvar: float | None = None
    q_max_mvar: float | None = None


class MeasurementRating(BaseModel):
    """Parametry znamionowe przekładnika CT/VT."""

    ratio_primary: float
    ratio_secondary: float
    accuracy_class: str | None = None
    burden_va: float | None = None


class ProtectionSetting(BaseModel):
    """Nastawa zabezpieczenia (stub — bez pełnego solvera ochrony)."""

    function_type: Literal[
        "overcurrent_50",
        "overcurrent_51",
        "earth_fault_50N",
        "earth_fault_51N",
        "directional_67",
        "directional_67N",
    ]
    threshold_a: float | None = None
    time_delay_s: float | None = None
    curve_type: Literal["DT", "IEC_SI", "IEC_VI", "IEC_EI", "IEC_LI"] | None = None
    is_directional: bool = False


# ---------------------------------------------------------------------------
# ENMElement — base for all elements
# ---------------------------------------------------------------------------


class ParameterOverride(BaseModel):
    """Audytowalny override parametru katalogowego (tryb EKSPERT)."""

    key: str
    value: float | str
    reason: str | None = None


class ENMElement(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    ref_id: str
    name: str
    tags: list[str] = []
    meta: dict = {}


# ---------------------------------------------------------------------------
# Header + Defaults
# ---------------------------------------------------------------------------


class ENMDefaults(BaseModel):
    frequency_hz: float = 50.0
    unit_system: Literal["SI"] = "SI"
    sn_nominal_kv: float | None = None


class ENMHeader(BaseModel):
    enm_version: Literal["1.0"] = "1.0"
    name: str
    description: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    revision: int = 1
    hash_sha256: str = ""
    defaults: ENMDefaults = Field(default_factory=ENMDefaults)


# ---------------------------------------------------------------------------
# Bus (node)
# ---------------------------------------------------------------------------


class Bus(ENMElement):
    voltage_kv: float
    frequency_hz: float | None = None
    phase_system: Literal["3ph"] = "3ph"
    zone: str | None = None
    grounding: GroundingConfig | None = None
    nominal_limits: BusLimits | None = None


# ---------------------------------------------------------------------------
# Branch — discriminated union
# ---------------------------------------------------------------------------


class BranchBase(ENMElement):
    from_bus_ref: str
    to_bus_ref: str
    status: Literal["closed", "open"] = "closed"
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    parameter_source: Literal["CATALOG", "OVERRIDE", "MANUAL_EQUIVALENT"] | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] | None = None
    materialized_params: dict | None = None
    overrides: list[ParameterOverride] = []


class OverheadLine(BranchBase):
    type: Literal["line_overhead"] = "line_overhead"
    length_km: float
    r_ohm_per_km: float
    x_ohm_per_km: float
    b_siemens_per_km: float | None = None
    r0_ohm_per_km: float | None = None
    x0_ohm_per_km: float | None = None
    b0_siemens_per_km: float | None = None
    rating: BranchRating | None = None


class Cable(BranchBase):
    type: Literal["cable"] = "cable"
    length_km: float
    r_ohm_per_km: float
    x_ohm_per_km: float
    b_siemens_per_km: float | None = None
    r0_ohm_per_km: float | None = None
    x0_ohm_per_km: float | None = None
    b0_siemens_per_km: float | None = None
    rating: BranchRating | None = None
    insulation: Literal["XLPE", "PVC", "PAPER"] | None = None


class SwitchBranch(BranchBase):
    """Wyłącznik, rozłącznik, sprzęgło, sekcjoner."""

    type: Literal["switch", "breaker", "bus_coupler", "disconnector"]
    r_ohm: float | None = None
    x_ohm: float | None = None


class FuseBranch(BranchBase):
    type: Literal["fuse"] = "fuse"
    rated_current_a: float | None = None
    rated_voltage_kv: float | None = None


Branch = Annotated[
    OverheadLine | Cable | SwitchBranch | FuseBranch,
    Field(discriminator="type"),
]


# ---------------------------------------------------------------------------
# Transformer
# ---------------------------------------------------------------------------


class Transformer(ENMElement):
    hv_bus_ref: str
    lv_bus_ref: str
    sn_mva: float
    uhv_kv: float
    ulv_kv: float
    uk_percent: float
    pk_kw: float
    p0_kw: float | None = None
    i0_percent: float | None = None
    vector_group: str | None = None
    hv_neutral: GroundingConfig | None = None
    lv_neutral: GroundingConfig | None = None
    tap_position: int | None = None
    tap_min: int | None = None
    tap_max: int | None = None
    tap_step_percent: float | None = None
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    parameter_source: Literal["CATALOG", "OVERRIDE"] | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] | None = None
    materialized_params: dict | None = None
    overrides: list[ParameterOverride] = []


# ---------------------------------------------------------------------------
# Source (punkt zasilania)
# ---------------------------------------------------------------------------


class Source(ENMElement):
    bus_ref: str
    model: Literal["thevenin", "short_circuit_power", "external_grid"]
    substation_ref: str | None = None
    gpz_section_id: str | None = None
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    parameter_source: Literal["CATALOG", "OVERRIDE", "MANUAL_EQUIVALENT"] | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] | None = None
    materialized_params: dict | None = None
    overrides: list[ParameterOverride] = []
    sk3_mva: float | None = None
    ik3_ka: float | None = None
    r_ohm: float | None = None
    x_ohm: float | None = None
    rx_ratio: float | None = None
    r0_ohm: float | None = None
    x0_ohm: float | None = None
    z0_z1_ratio: float | None = None
    c_max: float | None = None
    c_min: float | None = None


# ---------------------------------------------------------------------------
# Load
# ---------------------------------------------------------------------------


class Load(ENMElement):
    bus_ref: str
    p_mw: float
    q_mvar: float
    model: Literal["pq", "zip"] = "pq"
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    quantity: int | None = None
    parameter_source: Literal["CATALOG", "OVERRIDE"] | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] | None = None
    materialized_params: dict | None = None
    overrides: list[ParameterOverride] = []


# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------


class Generator(ENMElement):
    bus_ref: str
    p_mw: float
    q_mvar: float | None = None
    gen_type: Literal["synchronous", "pv_inverter", "wind_inverter", "bess"] | None = None
    limits: GenLimits | None = None
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    quantity: int | None = None
    n_parallel: int | None = None
    parameter_source: Literal["CATALOG", "OVERRIDE"] | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] | None = None
    materialized_params: dict | None = None
    overrides: list[ParameterOverride] = []

    # PV/BESS connection variant (KROK 2: explicit, no guessing)
    connection_variant: Literal[
        "LV_BEHIND_STATION_TRANSFORMER",
        "DEDICATED_MV_CONNECTION",
        "SOURCE_CONNECTION_STATION",
        "nn_side",
        "block_transformer",
    ] | None = None
    """
    Wariant przylaczenia PV/BESS:
    - 'nn_side': po stronie nN stacji (przez transformator stacji SN/nN)
    - 'block_transformer': przez transformator blokowy do SN
    - None: brak informacji → FixAction generator.connection_variant_missing
    Dotyczy TYLKO gen_type in ('pv_inverter', 'wind_inverter', 'bess').
    Generatory synchroniczne nie wymagaja wariantu.
    """

    blocking_transformer_ref: str | None = None
    """
    Referencja do transformatora blokowego (ref_id).
    Wymagana TYLKO gdy connection_variant == 'block_transformer'.
    Brak przy wariancie 'block_transformer' → FixAction generator.block_transformer_missing.
    """

    station_ref: str | None = None
    """
    Referencja do stacji (ref_id substacji).
    Wymagana dla wariantu 'nn_side' (wskazuje stacje SN/nN).
    """


# ---------------------------------------------------------------------------
# Measurement (przekładnik CT/VT)
# ---------------------------------------------------------------------------


class Measurement(ENMElement):
    """Przekładnik prądowy (CT) lub napięciowy (VT)."""

    measurement_type: Literal["CT", "VT"]
    bus_ref: str
    bay_ref: str | None = None
    rating: MeasurementRating
    connection: Literal["star", "delta", "single_phase"] = "star"
    purpose: Literal["protection", "metering", "combined"] = "protection"
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    parameter_source: Literal["CATALOG", "OVERRIDE"] | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] | None = None
    materialized_params: dict | None = None
    overrides: list[ParameterOverride] = []


# ---------------------------------------------------------------------------
# ProtectionAssignment (przypięcie zabezpieczenia do wyłącznika)
# ---------------------------------------------------------------------------


class ProtectionAssignment(ENMElement):
    """Powiązanie zabezpieczenia z wyłącznikiem — modelowanie, nie solver."""

    breaker_ref: str
    ct_ref: str | None = None
    vt_ref: str | None = None
    device_type: Literal[
        "overcurrent",
        "earth_fault",
        "directional_overcurrent",
        "distance",
        "differential",
        "custom",
    ]
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    settings: list[ProtectionSetting] = []
    is_enabled: bool = True
    parameter_source: Literal["CATALOG", "OVERRIDE"] | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] | None = None
    materialized_params: dict | None = None
    overrides: list[ParameterOverride] = []


# ---------------------------------------------------------------------------
# Substation (stacja SN/nn — kontener logiczny z rozdzielnicami)
# ---------------------------------------------------------------------------


class Substation(ENMElement):
    """Stacja SN/nn — logiczny kontener z rozdzielnicami.

    station_type semantics:
    - gpz: Główny Punkt Zasilający (source substation)
    - mv_lv: Stacja transformatorowa SN/nN (distribution substation)
    - switching: Stacja rozłącznikowa / sekcyjna (switching station)
    - customer: Stacja odbiorcza (customer substation)
    - inline: Stacja przelotowa (pass-through on main feeder)
    - branch: Stacja odgałęźna (branch from main feeder)
    - terminal: Stacja końcowa (feeder terminus)
    - sectional: Stacja sekcyjna (sectional splitting station)
    """

    station_type: Literal[
        "gpz",
        "mv_lv",
        "switching",
        "customer",
        "inline",
        "branch",
        "terminal",
        "sectional",
    ]
    bus_refs: list[str] = []
    transformer_refs: list[str] = []
    entry_point_ref: str | None = None
    gpz_sections: list[GPZSection] = []


class GPZSection(BaseModel):
    """Jawna sekcja szyny GPZ.

    Sekcja GPZ jest prawdą domenową dla wielosekcyjnej rozdzielni źródłowej.
    Nie jest wyliczana wyłącznie z layoutu SLD.
    """

    section_id: str
    order: int
    name: str | None = None
    line_field_name: str | None = None
    bus_ref: str
    incoming_source_ref: str | None = None
    left_coupler_ref: str | None = None
    right_coupler_ref: str | None = None


# ---------------------------------------------------------------------------
# Bay (pole rozdzielcze SN)
# ---------------------------------------------------------------------------


class Bay(ENMElement):
    """Pole rozdzielcze SN (IN, OUT, TR, COUPLER, FEEDER, MEASUREMENT, OZE)."""

    bay_role: Literal["IN", "OUT", "TR", "COUPLER", "FEEDER", "MEASUREMENT", "OZE"]
    substation_ref: str
    bus_ref: str
    gpz_section_id: str | None = None
    equipment_refs: list[str] = []
    protection_ref: str | None = None


# ---------------------------------------------------------------------------
# Bay Canonical Model V10 (read-model contract)
# ---------------------------------------------------------------------------


class BaySwitchState(BaseModel):
    actual_state: Literal[
        "zamkniety",
        "otwarty",
        "zamkniety_naped_rozbrojony",
        "otwarty_naped_rozbrojony",
        "nieznany",
        "awaria",
    ]
    commanded_state: Literal["zamknij", "otworz"] | None = None
    control_mode: Literal["miejscowe", "zdalne", "lokalne_zablokowane", "odstawione"]
    armed_for_close: bool | None = None
    armed_for_open: bool | None = None
    communication_ok: bool = False
    interlock_blocked: bool = False
    cause_code: str | None = None
    last_state_change_at: datetime | None = None
    last_command_at: datetime | None = None


class BayOperatingState(BaseModel):
    normal_position: Literal["zamkniety", "otwarty"]
    current_position: Literal["zamkniety", "otwarty", "nieznany"]
    discrepancy_alarm: bool = False


class BayPrimaryDevice(BaseModel):
    device_ref: str
    linked_ref: str | None = None
    catalog_ref: str | None = None
    symbol_ref: str
    kind: Literal[
        "CB",
        "LOAD_SWITCH",
        "DS",
        "ES",
        "CT",
        "VT",
        "CABLE_HEAD",
        "TRANSFORMER_DEVICE",
        "FUSE",
        "GENERATOR_PV",
        "GENERATOR_BESS",
        "GENERATOR_FW",
        "PCS",
        "BATTERY",
    ]
    placement: Literal["UPSTREAM", "MIDSTREAM", "DOWNSTREAM", "OFF_PATH", "GROUND_BRANCH"]
    section_side: Literal["LEFT", "CENTER", "RIGHT"] | None = None
    is_controllable: bool = False
    render_variant: str | None = None
    switch_state: BaySwitchState | None = None
    operating_state: BayOperatingState | None = None


class BayMeasurements(BaseModel):
    ia_a: float | None = None
    ib_a: float | None = None
    ic_a: float | None = None
    zero_sequence_current_a: float | None = None
    uab_kv: float | None = None
    ubc_kv: float | None = None
    uca_kv: float | None = None
    zero_sequence_voltage_kv: float | None = None
    active_power_mw: float | None = None
    reactive_power_mvar: float | None = None
    apparent_power_mva: float | None = None
    current_a: float | None = None
    power_factor: float | None = None
    frequency_hz: float | None = None


class BayMeasurementSet(BaseModel):
    side: Literal["pole", "strona_szyn", "strona_odplywu", "strona_lewa", "strona_prawa"]
    values: BayMeasurements = Field(default_factory=BayMeasurements)


class BayMeasurementChain(BaseModel):
    chain_ref: str
    ct_refs: list[str] = []
    vt_refs: list[str] = []
    uses_3i0: bool = False
    uses_3u0: bool = False
    zero_sequence_current_source: Literal[
        "suma_ct", "przekladnik_ferrantiego", "zewnetrzne", "brak"
    ] = "brak"
    zero_sequence_voltage_source: Literal[
        "otwarty_trojkat_vt", "uzwojenie_resztkowe_vt", "obliczone", "brak"
    ] = "brak"
    topology: Literal["ct_only", "ct_vt", "ct_vt_3u0", "vt_only"] = "ct_only"
    measurement_sets: list[BayMeasurementSet] = []


class BaySecondaryUnitRef(BaseModel):
    unit_ref: str
    unit_kind: Literal["zabezpieczenie", "sterownik", "pomiar", "rejestrator"]
    shared_with_bay_refs: list[str] = []


class BaySecondaryArchitecture(BaseModel):
    type: Literal[
        "zintegrowane_zabezpieczenie_i_sterownik",
        "oddzielne_zabezpieczenie_i_sterownik",
        "tylko_zabezpieczenie",
        "tylko_sterownik",
        "brak_urzadzenia_wtornego",
    ]
    measurement_provider: Literal[
        "zabezpieczenie",
        "sterownik",
        "osobny_uklad_pomiarowy",
        "mieszany",
        "brak",
    ] = "brak"


class ProtectionSettingValue(BaseModel):
    key: str
    value: float | str | bool | None = None
    unit: str | None = None
    quality: Literal["obliczone", "reczne", "domyslne"] = "domyslne"


class ProtectionFunctionState(BaseModel):
    code: str
    available: bool = False
    enabled: bool = False
    picked_up: bool = False
    tripped: bool = False
    blocked: bool = False
    required_inputs: list[Literal["ct", "vt", "3i0", "3u0"]] = []
    optional_inputs: list[Literal["ct", "vt", "3i0", "3u0"]] = []
    missing_input_policy: Literal[
        "blokada_zapisu",
        "blokada_obliczen",
        "ostrzezenie",
        "degradacja_funkcji",
        "wynik_czesciowy",
    ] = "ostrzezenie"
    settings_ref: str | None = None
    settings: list[ProtectionSettingValue] = []
    execution_mode: Literal["tylko_alarm", "pobudzenie", "wyzwolenie"] = "tylko_alarm"
    execution_device_ref: str | None = None
    starts_spz: bool = False
    blocks_reclose: bool = False
    operator_ack_required_after_trip: bool = False


class SpzState(BaseModel):
    bound_breaker_ref: str
    enabled: bool = False
    fast_attempts_max: int = 0
    slow_attempts_max: int = 0
    attempts_done: int = 0
    fast_time_s: float | None = None
    slow_time_s: float | None = None
    blocked: bool = False
    blocked_reason: str | None = None
    state: Literal["gotowe", "w_trakcie", "zakonczone", "odstawione"] = "odstawione"


class AlarmEntry(BaseModel):
    code: str
    active: bool = False
    acknowledged: bool = False
    severity: Literal["informacja", "ostrzezenie", "alarm", "awaria"] = "informacja"
    timestamp: datetime
    message_pl: str


class EventEntry(BaseModel):
    code: str
    timestamp: datetime
    source: Literal["sterowanie", "ochrona", "pomiar", "komunikacja", "system"]
    message_pl: str


class DisturbanceRecorderState(BaseModel):
    available: bool = False
    last_record_at: datetime | None = None
    records_count: int = 0


class TrendState(BaseModel):
    available: bool = False
    channels: list[str] = []


class BayProtectionControlUnit(BaseModel):
    unit_ref: str
    manufacturer: str | None = None
    model: str | None = None
    functions: list[ProtectionFunctionState] = []
    measurement_inputs: dict[str, bool] = Field(default_factory=dict)
    automation_features: dict[str, bool] = Field(default_factory=dict)
    spz: SpzState | None = None
    alarms: list[AlarmEntry] = []
    events: list[EventEntry] = []
    disturbance_recorder: DisturbanceRecorderState = Field(default_factory=DisturbanceRecorderState)
    trends: TrendState = Field(default_factory=TrendState)
    settings_mode: Literal["automatyczne", "reczne"] = "reczne"
    settings_ref: str | None = None


class InterlockEntry(BaseModel):
    code: str
    active: bool = False
    reason: str
    blocking_device_refs: list[str] = []


class BayInterlockSet(BaseModel):
    entries: list[InterlockEntry] = []


class BayControlSurface(BaseModel):
    controllable_device_refs: list[str] = []
    open_requires_confirmation: bool = False
    close_requires_confirmation: bool = True
    kas_available: bool = False
    local_remote_transfer_supported: bool = False


class BayCommandExecutionState(BaseModel):
    command_ref: str
    target_device_ref: str
    command: Literal["zamknij", "otworz", "kas"]
    state: Literal["oczekuje", "przyjete", "odrzucone", "wykonane", "przeterminowane"]
    rejected_reason: str | None = None
    created_at: datetime
    finished_at: datetime | None = None


class BayEnergizationSafetyState(BaseModel):
    energized_from_bus_side: bool = False
    energized_from_feeder_side: bool = False
    grounded: bool = False
    visible_isolation_gap: bool = False
    safe_to_work: bool = False
    unsafe_reason_pl: str | None = None


class BayRuntimeState(BaseModel):
    secondary_communication_status: Literal["ok", "degraded", "offline"] = "offline"
    last_good_update_at: datetime | None = None
    control_availability: Literal["dostepne", "czesciowo_dostepne", "niedostepne"] = "niedostepne"
    measurement_availability: Literal["dostepne", "czesciowe", "niedostepne"] = "niedostepne"
    primary_device_states: dict[str, BaySwitchState] = {}
    active_alarms: list[AlarmEntry] = []
    pending_command: BayCommandExecutionState | None = None
    energization_and_safety: BayEnergizationSafetyState = Field(
        default_factory=BayEnergizationSafetyState
    )


class BayScenarioState(BaseModel):
    scenario_ref: str
    overridden_position: Literal["zamkniety", "otwarty", "nieznany"] | None = None
    source: Literal["bazowy", "wariant", "symulacja_przelaczen", "ruch"] = "bazowy"


class BaySourceEndpoint(BaseModel):
    source_kind: Literal["PV", "BESS", "FW"]
    inverter_ref: str | None = None
    storage_ref: str | None = None
    turbine_ref: str | None = None
    block_transformer_ref: str | None = None
    requires_vt: bool = False
    requires_synchrocheck: bool = False
    operating_mode: Literal[
        "praca_sieciowa", "ladowanie", "rozladowanie", "gotowosc", "odstawione"
    ] = "gotowosc"


class BayBaseModel(BaseModel):
    bay_ref: str
    bay_role: Literal[
        "LINIA_IN",
        "LINIA_OUT",
        "TRANSFORMATOROWE",
        "LINIA_ODG",
        "SPRZEGLO",
        "POMIAROWE",
        "PV_SN",
        "BESS_SN",
        "FW_SN",
    ]
    specialization: Literal["BRAK", "POTRZEBY_WLASNE"] = "BRAK"
    substation_ref: str
    gpz_section_id: str | None = None
    primary_devices: list[BayPrimaryDevice] = []
    measurement_chain: BayMeasurementChain | None = None
    secondary_units: list[BaySecondaryUnitRef] = []
    secondary_architecture: BaySecondaryArchitecture
    protection_config: BayProtectionControlUnit | None = None
    control_surface: BayControlSurface = Field(default_factory=BayControlSurface)
    interlocks: BayInterlockSet = Field(default_factory=BayInterlockSet)
    source_endpoint: BaySourceEndpoint | None = None


class BayShortCircuitSourceContribution(BaseModel):
    source_ref: str
    source_kind: Literal["GPZ", "TRANSFORMATOR", "PV", "BESS", "FW", "INNE"]
    reference_point: str
    fault_type: Literal["3F", "2F", "1F", "1F_ZIEMIA"]
    ikss_ka: float | None = None
    ip_ka: float | None = None
    ith_ka: float | None = None
    percent_share: float | None = None
    zero_sequence_share_percent: float | None = None
    direction: Literal["do_pola", "od_pola"] = "do_pola"


class BayPowerFlowSourceContribution(BaseModel):
    source_ref: str
    source_kind: Literal["GPZ", "TRANSFORMATOR", "PV", "BESS", "FW", "INNE"]
    reference_point: str
    p_mw: float | None = None
    q_mvar: float | None = None
    s_mva: float | None = None
    i_a: float | None = None
    percent_share_p: float | None = None
    percent_share_q: float | None = None
    direction: Literal["do_odplywu", "do_szyn"] = "do_odplywu"


class BayEarthFaultPath(BaseModel):
    neutral_grounding_mode: Literal[
        "izolowany",
        "cewka_petersena",
        "rezystor",
        "bezposrednio_uziemiony",
        "nieznany",
    ] = "nieznany"
    zero_sequence_current_source: Literal[
        "suma_ct", "przekladnik_ferrantiego", "zewnetrzne", "brak"
    ] = "brak"
    zero_sequence_voltage_source: Literal[
        "otwarty_trojkat_vt", "uzwojenie_resztkowe_vt", "obliczone", "brak"
    ] = "brak"
    closure_path_elements: list[str] = []
    transformer_contribution_ref: str | None = None
    grounding_device_ref: str | None = None


class BayVerificationResult(BaseModel):
    continuous_current_ok: bool | None = None
    thermal_withstand_ok: bool | None = None
    dynamic_withstand_ok: bool | None = None
    ct_ok: bool | None = None
    vt_ok: bool | None = None
    cable_head_ok: bool | None = None
    main_switch_ok: bool | None = None
    whole_power_path_ok: bool | None = None


class BayProofBinding(BaseModel):
    proof_ref: str
    primary_result_refs: list[str] = []
    secondary_result_refs: list[str] = []
    source_contribution_refs: list[str] = []
    formula_refs: list[str] = []
    input_data_refs: list[str] = []


class BayProjectResults(BaseModel):
    run_ref: str
    result_state: Literal["pelny", "czesciowy", "bledny"] = "pelny"
    result_message_pl: str | None = None
    main_short_circuit_results_ref: str | None = None
    main_power_flow_results_ref: str | None = None
    source_contributions_sc: list[BayShortCircuitSourceContribution] = []
    source_contributions_pf: list[BayPowerFlowSourceContribution] = []
    verification: BayVerificationResult = Field(default_factory=BayVerificationResult)
    earth_fault_path: BayEarthFaultPath | None = None
    proof_binding: BayProofBinding


class BayCanonicalModel(BaseModel):
    schema_version: Literal["v10.bay.1"] = "v10.bay.1"
    created_from: Literal["szablon", "recznie", "migracja", "przebudowa"] = "migracja"
    integrity_status: Literal["kompletny", "po_migracji", "wymaga_uzupelnienia"] = "po_migracji"
    audit_trail_ref: str | None = None
    base_model: BayBaseModel
    runtime_state: BayRuntimeState | None = None
    scenario_state: BayScenarioState | None = None
    project_results_ref: str | None = None


# ---------------------------------------------------------------------------
# Junction (węzeł T — rozgałęzienie magistrali)
# ---------------------------------------------------------------------------


class Junction(ENMElement):
    """Węzeł T (rozgałęzienie magistrali)."""

    connected_branch_refs: list[str]
    junction_type: Literal["T_node", "sectionalizer", "recloser_point", "NO_point"]


# ---------------------------------------------------------------------------
# Corridor (magistrala — ciąg linii SN)
# ---------------------------------------------------------------------------


class Corridor(ENMElement):
    """Magistrala (ciąg linii SN od GPZ do stacji końcowej)."""

    corridor_type: Literal["radial", "ring", "mixed"]
    ordered_segment_refs: list[str]
    no_point_ref: str | None = None


# ---------------------------------------------------------------------------
# BranchPointSN — Punkt rozgałęzienia SN (Słup rozgałęźny / ZKSN)
# ---------------------------------------------------------------------------


class BranchPointSNPorts(BaseModel):
    """Porty topologiczne punktu rozgałęzienia SN."""

    MAIN_IN: str
    MAIN_OUT: str
    BRANCH: list[str] = []


class BranchPointSN(ENMElement):
    """Punkt rozgałęzienia SN — słup rozgałęźny lub ZKSN.

    HARD RULES:
    - BranchPoleMV (branch_point_type='branch_pole'): tylko na linii napowietrznej
    - ZksnMV (branch_point_type='zksn'): tylko na kablu SN

    Pola katalogowe:
    - catalog_ref: identyfikator pozycji katalogowej
    - catalog_namespace: przestrzeń nazw katalogu (domyślnie 'mv_branch_points')
    - catalog_version: wersja pozycji katalogowej
    - source_mode: sposób wprowadzenia parametrów

    Pola runtime:
    - materialized_params: zmaterializowane parametry z katalogu
    - completeness_status: status kompletności
    - runtime_inputs: dane wejściowe podane przez użytkownika
    """

    branch_point_type: Literal["branch_pole", "zksn"]
    parent_segment_id: str
    bus_ref: str
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    catalog_version: str | None = None
    source_mode: Literal["KATALOG", "MIGRACJA", "EKSPERCKI_RECZNY"] = "KATALOG"
    ports: BranchPointSNPorts | None = None
    branch_occupied: dict[str, str] = {}
    switch_state: Literal["open", "closed"] | None = None
    materialized_params: dict | None = None
    completeness_status: Literal["KOMPLETNY", "NIEKOMPLETNY", "BRAK_KATALOGU"] | None = None
    runtime_inputs: dict | None = None


# ---------------------------------------------------------------------------
# ROOT
# ---------------------------------------------------------------------------


class EnergyNetworkModel(BaseModel):
    header: ENMHeader
    buses: list[Bus] = []
    branches: list[Branch] = []
    transformers: list[Transformer] = []
    sources: list[Source] = []
    loads: list[Load] = []
    generators: list[Generator] = []
    substations: list[Substation] = []
    bays: list[Bay] = []
    junctions: list[Junction] = []
    corridors: list[Corridor] = []
    measurements: list[Measurement] = []
    protection_assignments: list[ProtectionAssignment] = []
    branch_points: list[BranchPointSN] = []
