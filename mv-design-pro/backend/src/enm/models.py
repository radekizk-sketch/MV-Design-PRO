"""
EnergyNetworkModel (ENM) — Pydantic v2 canonical models.

Kanoniczny kontrakt modelu sieci elektroenergetycznej.
Jedno źródło prawdy dla projektu (case-bound).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field, model_validator

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
        # D10 (addytywnie): funkcje ochrony od pracy wyspowej (Loss of Mains).
        # Rozszerzenie WYŁĄCZNIE dodaje literały — istniejące dokumenty ENM bez
        # tych typów walidują się bez zmian.
        "rocof_81R",
        "vector_shift_78",
        "underfrequency_81U",
        "overfrequency_81O",
    ]
    threshold_a: float | None = None
    time_delay_s: float | None = None
    curve_type: Literal["DT", "IEC_SI", "IEC_VI", "IEC_EI", "IEC_LI"] | None = None
    time_multiplier: float | None = None
    """Mnożnik czasowy (TMS) dla charakterystyk odwrotnych IEC 60255 (SI/VI/EI/LTI).

    Addytywne, opcjonalne (default None). Dokumenty ENM bez tego pola walidują się
    bez zmian, a serializacja z ``exclude_none`` pomija je dla istniejących nastaw —
    determinizm dotychczasowych payloadów pozostaje nienaruszony. Wymagany do
    wyznaczenia krzywej I-t dla charakterystyk odwrotnych (nie dotyczy DT).
    """
    is_directional: bool = False
    # D10 (addytywnie, opcjonalne — default None): nastawy funkcji LoM.
    # Zachowanie istniejących typów funkcji NIE zmienia się (pola pozostają None).
    threshold_hz_s: float | None = None
    """Nastawa df/dt [Hz/s] dla ROCOF (81R)."""
    threshold_deg: float | None = None
    """Nastawa przesunięcia wektora [°] dla funkcji 78."""
    threshold_hz: float | None = None
    """Próg częstotliwościowy [Hz] dla 81U/81O."""


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


class ConnectionConditions(BaseModel):
    """Warunki przyłączenia z dokumentu OSD (dane WEJŚCIOWE projektu, nie wynik).

    Karta K2 programu FLOW EKSPERT+ (GAP B1/B2 audytu FLOW): statyczny limit
    mocy z umowy/warunków przyłączeniowych + wymagany współczynnik mocy +
    opis trybu pracy przyłącza (tekst z dokumentu OSD — bez zgadywania enuma).
    Wszystkie pola opcjonalne (blok addytywny — istniejące payloady bez zmian).
    """

    moc_przylaczeniowa_mw: float | None = Field(default=None, gt=0)
    wymagany_cos_phi: float | None = Field(default=None, gt=0, le=1)
    tryb_pracy: str | None = None


class ENMHeader(BaseModel):
    enm_version: Literal["1.0"] = "1.0"
    name: str
    description: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    revision: int = 1
    hash_sha256: str = ""
    defaults: ENMDefaults = Field(default_factory=ENMDefaults)

    # V12S-010: chain hashy (additive, opcjonalne dla wstecznej kompatybilnosci)
    semantic_hash: str | None = None
    """Hash topologii + rol + pasm napieciowych + catalog_ref."""
    input_hash: str | None = None
    """Hash wejsc obliczeniowych BEZ switching state."""
    case_hash: str | None = None
    """Hash parametrow przypadku obliczeniowego."""
    variant_hash: str | None = None
    """Hash delty wariantu (overlay)."""
    switching_snapshot_hash: str | None = None
    """Hash TYLKO stanow lacznikow."""


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
    # Karta F-K1 faza 7: dane cieplne i materialowe PRZEWODU GOLEGO. Model niosl
    # dotad wylacznie impedancje i obciazalnosc — a poniewaz pydantic domyslnie
    # IGNORUJE nadmiarowe pola, dane cieplne z materializacji katalogowej byly cicho
    # POLYKANE. Objaw: kryterium IEC 60949 dla kazdej linii napowietrznej konczylo
    # sie werdyktem NIEDOSTEPNY, mimo ze katalog mial Jth(1 s) od poczatku.
    # Pola opcjonalne (blok addytywny) — dokumenty bez nich walidowaly sie i walidują dalej.
    conductor_material: str | None = None
    cross_section_mm2: float | None = None
    jth_1s_a_per_mm2: float | None = None
    ith_1s_a: float | None = None
    # Para temperatur uzasadniajaca k. Dla przewodu GOLEGO granice wyznacza utrata
    # wytrzymalosci mechanicznej zyly i osprzet, nie izolacja — dlatego linia nie ma
    # (i nie moze miec) pola `insulation`.
    operating_temperature_c: float | None = None
    short_circuit_temperature_c: float | None = None
    thermal_source_ref: str | None = None
    rating: BranchRating | None = None
    # PR-3 rebuild SLD: jawne porty endpointów (opcjonalne, automigracja w PR-3)
    endpoint_a_port: PortRef | None = None
    endpoint_b_port: PortRef | None = None


class Cable(BranchBase):
    type: Literal["cable"] = "cable"
    length_km: float
    r_ohm_per_km: float
    x_ohm_per_km: float
    b_siemens_per_km: float | None = None
    r0_ohm_per_km: float | None = None
    x0_ohm_per_km: float | None = None
    b0_siemens_per_km: float | None = None
    conductor_material: str | None = None
    cross_section_mm2: float | None = None
    number_of_cores: int | None = None
    return_conductor_cross_section_mm2: float | None = None
    return_conductor_material: str | None = None
    return_conductor_r_ohm_per_km_20c: float | None = None
    return_conductor_jth_1s_a_per_mm2: float | None = None
    return_conductor_ith_1s_a: float | None = None
    # Karta F-K1 faza 3: wytrzymalosc cieplna zwarciowa ZYLY FAZOWEJ (IEC 60949).
    # Model niosl dotad wylacznie dane zyly POWROTNEJ; kryterium cieplne przewodu
    # nie mialo z czego liczyc pradu dopuszczalnego. Pola opcjonalne — brak = dana
    # nieznana, nigdy zero.
    jth_1s_a_per_mm2: float | None = None
    ith_1s_a: float | None = None
    rating: BranchRating | None = None
    # EPR dolozony w karcie F-K1 faza 6: katalog SN ma 18 rekordow z ta izolacja,
    # a model ich NIE PRZYJMOWAL — materializacja takiego kabla wywracala walidacje
    # dokumentu. Defekt byl niewidoczny, dopoki izolacja nie trafila do modelu.
    insulation: Literal["XLPE", "EPR", "PVC", "PAPER"] | None = None
    # Karta F-K1 faza 6 (Calculation Evidence): para temperatur uzasadniajaca k.
    # Addytywne, opcjonalne — dokumenty bez tych pol walidowaly sie i walidują dalej.
    operating_temperature_c: float | None = None
    short_circuit_temperature_c: float | None = None
    thermal_source_ref: str | None = None
    # PR-3 rebuild SLD: jawne porty endpointów (opcjonalne, automigracja w PR-3)
    endpoint_a_port: PortRef | None = None
    endpoint_b_port: PortRef | None = None
    # Mufy kablowe (brief 1 §4 pkt 4) — punkty na segmencie kabla bez podziału topologii
    cable_joints: list[CableJoint] = []


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
# Transformer + tap changer (V12K-045)
# ---------------------------------------------------------------------------


class LineDropCompensation(BaseModel):
    """Line-drop compensation (LDC) for an OLTC regulator [Ω]."""

    enabled: bool = False
    r_ohm: float = 0.0
    x_ohm: float = 0.0


class TapChanger(BaseModel):
    """Canonical tap-changer state on a transformer — single source of truth.

    Additive/optional: a transformer without a tap_changer keeps the legacy
    tap_position/tap_step_percent behaviour. None is excluded from the ENM
    fingerprint (model_dump exclude_none), so existing fixtures are unchanged.
    """

    regulation_type: Literal["NONE", "DETC", "OLTC"] = "NONE"
    regulated_winding: Literal["HV", "LV"] = "HV"
    neutral_position: int = 0
    current_position: int = 0
    min_position: int = 0
    max_position: int = 0
    step_percent: float = 0.0
    control_mode: Literal["MANUAL", "AUTOMATIC", "PROFILE", "REMOTE"] = "MANUAL"
    voltage_setpoint_kv: float | None = None
    deadband_kv: float | None = None
    delay_seconds: float | None = None
    controlled_bus_ref: str | None = None
    line_drop_compensation: LineDropCompensation | None = None
    catalog_ref: str | None = None


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
    # G-STK-6: liczba identycznych jednostek pracujących równolegle w polu
    # transformatorowym. None/1 = pojedynczy transformator (bez zmiany fizyki).
    # Agregacja: n jednostek → impedancja zastępcza Z/n (mapper skaluje Sn×n).
    n_parallel: int | None = None
    tap_position: int | None = None
    tap_min: int | None = None
    tap_max: int | None = None
    tap_step_percent: float | None = None
    # V12K-045: canonical tap-changer (single source of truth). Additive/optional;
    # None excluded from ENM fingerprint (exclude_none). The legacy tap_* fields
    # above remain for backward compatibility.
    tap_changer: TapChanger | None = None
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
    source_side: Literal["SN", "HV_110"] | None = None
    sn_voltage_kv: float | None = None
    voltage_hv_kv: float | None = None
    sk3_hv_mva: float | None = None
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
# ShuntCapacitor (bank kondensatorow — kompensacja mocy biernej)
# ---------------------------------------------------------------------------


class ShuntCapacitor(ENMElement):
    """Stała bateria kondensatorów (kompensacja mocy biernej) na szynie.

    Element FIRST-CLASS ENM: reprezentuje równoległą susceptancję pojemnościową
    przyłączoną do jednej szyny. W rozpływie mocy mapuje się na istniejący
    mechanizm shuntów solvera (ShuntSpec) przez susceptancję b_pu liczoną z
    pierwszych zasad: B = Q_rated / U_rated² → b_pu = Q_rated / S_base.

    Przełączanie dyskretne (sterowane napięciem) NIE jest w zakresie —
    modelujemy stały bank (status in_service: closed/open).
    """

    bus_ref: str
    rated_mvar: float
    rated_kv: float
    status: Literal["closed", "open"] = "closed"
    catalog_ref: str | None = None
    catalog_namespace: str | None = None
    parameter_source: Literal["CATALOG", "OVERRIDE", "MANUAL_EQUIVALENT"] | None = None
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
    gen_type: (
        Literal[
            "synchronous",
            "pv_inverter",
            "wind_inverter",
            "fw_pmsg",
            "fw_dfig",
            "fw_scig",
            "bess",
        ]
        | None
    ) = None
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
    connection_variant: (
        Literal[
            "LV_BEHIND_STATION_TRANSFORMER",
            "DEDICATED_MV_CONNECTION",
            "SOURCE_CONNECTION_STATION",
            "nn_side",
            "block_transformer",
        ]
        | None
    ) = None
    """
    Wariant przylaczenia PV/BESS:
    - 'nn_side': po stronie nN stacji (przez transformator stacji SN/nN)
    - 'block_transformer': przez transformator blokowy do SN
    - None: brak informacji → FixAction generator.connection_variant_missing
    Dotyczy TYLKO gen_type in ('pv_inverter', 'wind_inverter',
    'fw_pmsg', 'fw_dfig', 'fw_scig', 'bess').
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

    @model_validator(mode="after")
    def _validate_connection_variant_consistency(self) -> Generator:
        """V12S-008: connection_variant musi byc spojny z station_ref/blocking_transformer_ref.

        Tabela prawdy:
          LV_BEHIND_STATION_TRANSFORMER → station_ref WYMAGANY, blocking_transformer_ref WYMAGANY
          DEDICATED_MV_CONNECTION       → station_ref ZABRONIONY, blocking_transformer_ref opcjonalny
          nn_side                       → station_ref WYMAGANY, blocking_transformer_ref ZABRONIONY
          block_transformer             → blocking_transformer_ref WYMAGANY, station_ref opcjonalny
          SOURCE_CONNECTION_STATION     → permisywne (legacy bus-only connection)
          None                          → permisywne (dane przed migracja)

        Walidator NIE jest blokujacy dla wariantow None oraz SOURCE_CONNECTION_STATION,
        zeby umozliwic ladowanie danych legacy. Eligibility (ELIG_GEN_CONNECTION_VARIANT_INCONSISTENT)
        sygnalizuje brakujacy connection_variant osobno.
        """
        variant = self.connection_variant
        if variant is None or variant == "SOURCE_CONNECTION_STATION":
            return self

        if variant == "LV_BEHIND_STATION_TRANSFORMER":
            if self.station_ref is None:
                raise ValueError(
                    f"Generator '{self.ref_id}': connection_variant="
                    f"'LV_BEHIND_STATION_TRANSFORMER' wymaga station_ref."
                )
            if self.blocking_transformer_ref is None:
                raise ValueError(
                    f"Generator '{self.ref_id}': connection_variant="
                    f"'LV_BEHIND_STATION_TRANSFORMER' wymaga blocking_transformer_ref."
                )
        elif variant == "DEDICATED_MV_CONNECTION":
            if self.station_ref is not None:
                raise ValueError(
                    f"Generator '{self.ref_id}': connection_variant="
                    f"'DEDICATED_MV_CONNECTION' nie moze miec station_ref "
                    f"(generator ma dedykowane przylacze SN, nie idzie przez stacje)."
                )
        elif variant == "nn_side":
            if self.station_ref is None:
                raise ValueError(
                    f"Generator '{self.ref_id}': connection_variant='nn_side' "
                    f"wymaga station_ref (wskazuje stacje SN/nN)."
                )
            if self.blocking_transformer_ref is not None:
                raise ValueError(
                    f"Generator '{self.ref_id}': connection_variant='nn_side' "
                    f"nie moze miec blocking_transformer_ref "
                    f"(generator po stronie nN, transformator stacji wystarczy)."
                )
        elif variant == "block_transformer":
            if self.blocking_transformer_ref is None:
                raise ValueError(
                    f"Generator '{self.ref_id}': connection_variant="
                    f"'block_transformer' wymaga blocking_transformer_ref."
                )
        return self


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
    # F10.6 (SLD_CAD_SPEC_V3 §18.3, D3, V12K-036): układ pomiarowy CT —
    # 3×CT fazowe vs przekładnik sumujący/Ferranti dla składowej zerowej I0.
    # WYŁĄCZNIE dla measurement_type=='CT'; None = dana niedostarczona (WHITE
    # BOX — konsument NIE zgaduje, patrz `application/field_read_model.py`
    # `_build_measurement_chain`, wyczyszczenie heurystyki F10.4/F10.6).
    ct_arrangement: Literal["3xCT", "ferranti"] | None = None
    # F10.6 (SLD_CAD_SPEC_V3 §20.2, D4): układ VT — otwarty trójkąt (do
    # pomiaru 3U0, warunek konieczny dla 67N kierunkowego ziemnozwarciowego)
    # vs gwiazda. WYŁĄCZNIE dla measurement_type=='VT'; None = dana
    # niedostarczona (dotychczasowe uproszczenie §20.2 pozostaje w mocy).
    vt_arrangement: Literal["open_delta", "star"] | None = None
    # CTVT-MODEL (W5/V12K-173): liczba rdzeni przekładnika prądowego (rdzeń =
    # osobne uzwojenie wtórne, każdy o własnej klasie/mocy — np. rdzeń pomiarowy
    # 0,2S + rdzeń zabezpieczeniowy 5P10). Dane PRODUCENTA (tabliczka CT wg
    # IEC 61869-2); WYŁĄCZNIE dla measurement_type=='CT'. `gt=0` = liczba
    # rdzeni musi być dodatnia. None = dana niedostarczona przez producenta
    # (uczciwy brak, ZERO fabrykacji — konsument NIE zgaduje). Oś ODRĘBNA od
    # `ct_arrangement` (3×CT vs Ferranti opisuje układ dla I0, `ct_cores`
    # opisuje liczbę uzwojeń wtórnych każdego przekładnika).
    ct_cores: int | None = Field(default=None, gt=0)
    # CTVT-MODEL (W5/V12K-173): typ montażu przekładnika napięciowego — szynowy
    # (`bus`, VT na szynach zbiorczych) vs kablowy (`cable`, VT w polu
    # kablowym/na głowicy). Dane PRODUCENTA/projektowe rozdzielni; WYŁĄCZNIE
    # dla measurement_type=='VT'. Oś ODRĘBNA od `vt_arrangement`
    # (open_delta/star = oś składowej zerowej 3U0; `vt_mounting` = lokalizacja
    # fizyczna montażu). None = dana niedostarczona (uczciwy brak, ZERO
    # fabrykacji).
    vt_mounting: Literal["bus", "cable"] | None = None

    @model_validator(mode="after")
    def _validate_arrangement_matches_measurement_type(self) -> Measurement:
        """F10.6: `ct_arrangement`/`vt_arrangement` to dane WYŁĄCZNIE dla
        odpowiadającego `measurement_type` — zero niejednoznaczności (WHITE
        BOX, `domain_no_guessing_guard`)."""
        if self.ct_arrangement is not None and self.measurement_type != "CT":
            raise ValueError(
                f"Measurement '{self.ref_id}': ct_arrangement wymaga measurement_type='CT'."
            )
        if self.vt_arrangement is not None and self.measurement_type != "VT":
            raise ValueError(
                f"Measurement '{self.ref_id}': vt_arrangement wymaga measurement_type='VT'."
            )
        return self

    @model_validator(mode="after")
    def _validate_ctvt_variant_matches_measurement_type(self) -> Measurement:
        """CTVT-MODEL: `ct_cores`/`vt_mounting` to dane WYŁĄCZNIE dla
        odpowiadającego `measurement_type` — CT nie ma montażu VT, a VT nie ma
        rdzeni CT (spójność osi, WHITE BOX, `domain_no_guessing_guard`).
        Dodatnia liczba rdzeni jest egzekwowana przez `Field(gt=0)`."""
        if self.ct_cores is not None and self.measurement_type != "CT":
            raise ValueError(f"Measurement '{self.ref_id}': ct_cores wymaga measurement_type='CT'.")
        if self.vt_mounting is not None and self.measurement_type != "VT":
            raise ValueError(
                f"Measurement '{self.ref_id}': vt_mounting wymaga measurement_type='VT'."
            )
        return self


# ---------------------------------------------------------------------------
# ProtectionAssignment (przypięcie zabezpieczenia do wyłącznika)
# ---------------------------------------------------------------------------


class ProtectionAssignment(ENMElement):
    """Powiązanie zabezpieczenia z wyłącznikiem — modelowanie, nie solver."""

    breaker_ref: str
    ct_ref: str | None = None
    vt_ref: str | None = None
    # F10.6 (SLD_CAD_SPEC_V3 §20.2, D5, V12K-036): CT dodatkowe strefy
    # różnicowej (87T wymaga CT po OBU stronach transformatora — `ct_ref`
    # niesie JEDEN CT, ta lista niesie pozostałe CT granicy strefy). Pusta
    # lista = strefa różnicowa 2×CT NIE jest modelowana (dana niedostarczona,
    # nie błąd — `protectionFunctionTopologyGaps` degraduje do dotychczasowego
    # uproszczenia „obecność transformatora" gdy lista pusta).
    ct_refs_secondary: list[str] = []
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


# ---------------------------------------------------------------------------
# PR-3 rebuild SLD: Port, ConnectionNode, LineRun, CableJoint
# Addytywne rozszerzenia ENM dla konstruktywnego builder-a SLD.
# ---------------------------------------------------------------------------


class PortKind(str):
    """Typy portów technicznych w ENM (PR-3 rebuild SLD).

    Reprezentuje funkcjonalną rolę portu w polu / stacji / DER.
    """

    SN_INPUT = "sn_input"
    SN_OUTPUT = "sn_output"
    SN_BRANCH = "sn_branch"
    SN_TRANSFORMER = "sn_transformer"
    SN_MEASUREMENT = "sn_measurement"
    SN_DER_PV = "sn_der_pv"
    SN_DER_BESS = "sn_der_bess"
    SN_DER_FW = "sn_der_fw"
    SN_COUPLER = "sn_coupler"
    SN_RESERVE = "sn_reserve"
    NN_FEEDER = "nn_feeder"
    NN_LOAD = "nn_load"
    NN_DER_PV = "nn_der_pv"
    NN_DER_BESS = "nn_der_bess"
    NN_DER_FW = "nn_der_fw"


class Port(BaseModel):
    """Port techniczny obiektu ENM (PR-3 rebuild SLD).

    Adres wewnątrz `Bay` lub `Substation` — endpoint dla kabla / linii / DER.
    Port nie jest węzłem fizycznym; służy jako jawne miejsce przyłączenia.
    """

    id: str
    kind: Literal[
        "sn_input",
        "sn_output",
        "sn_branch",
        "sn_transformer",
        "sn_measurement",
        "sn_der_pv",
        "sn_der_bess",
        "sn_der_fw",
        "sn_coupler",
        "sn_reserve",
        "nn_feeder",
        "nn_load",
        "nn_der_pv",
        "nn_der_bess",
        "nn_der_fw",
    ]
    nominal_voltage_kv: float
    bay_ref: str | None = None
    substation_ref: str
    occupied_by: str | None = None  # ref do segmentu kabla/linii
    meta: dict = Field(default_factory=dict)


class PortRef(BaseModel):
    """Referencja do portu (immutable adres)."""

    port_id: str


class ConnectionNode(BaseModel):
    """Punkt przyłączenia (interpretacja, nie węzeł fizyczny).

    Konieczny dla wnioskowania typu topologicznego stacji z portów (PR-6).
    """

    id: str
    location: Literal["bay", "bus", "der_terminal", "branch_point"]
    voltage_kv: float
    parent_ref: str  # bay_id / bus_id / der_id / branch_point_id


class CableJoint(BaseModel):
    """Mufa kablowa — punkt na segmencie kabla SN bez podziału topologii.

    Brief 1 §4 pkt 4. Element pomocniczy do dokumentacji ułożenia.
    """

    id: str
    parent_segment_id: str
    position_km: float  # odległość od endpoint_a w km
    joint_type: Literal[
        "mufa_termoutwardzalna",
        "mufa_zimna",
        "mufa_olejowa",
        "mufa_zywiczna",
    ]
    catalog_ref: str | None = None
    name: str | None = None


class LineRunSegmentRef(BaseModel):
    """Element ciągu liniowego — referencja do segmentu kabla/linii."""

    segment_ref: str  # ref do OverheadLine / Cable
    order: int


class LineRunStationRef(BaseModel):
    """Element ciągu liniowego — stacja na ciągu (między segmentami)."""

    substation_ref: str
    order: int


class LineRun(BaseModel):
    """Ciąg liniowy — sekwencja segmentów + stacji jako jeden konstrukt.

    Brief 1 §8 + Brief 2 §6. W przeciwieństwie do `Corridor` (radial/ring),
    `LineRun` jawnie wymienia porządek elementów wraz ze stacjami pomiędzy.
    """

    id: str
    name: str | None = None
    run_kind: Literal["main_trunk", "branch", "ring", "loop"]
    starting_bay_ref: str  # pole SN GPZ skąd ciąg startuje
    starting_port_ref: str  # konkretny port pola wyjściowego
    segments: list[LineRunSegmentRef] = []
    stations: list[LineRunStationRef] = []
    nop_station_ref: str | None = None  # stacja z punktem normalnie otwartym (dla pierścieni)
    parent_run_ref: str | None = None  # dla odgałęzień: ref do ciągu macierzystego
    branch_origin_station_ref: str | None = None  # punkt startu odgałęzienia


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
    # Phase 0A audit fix 8/8: GPZ HV side (110 kV) — eliminuje synthesize w adapterze.
    # Każda sekcja HV ma własny bus, opcjonalnie source_ref + couplery do innych sekcji.
    # Pusta lista = single 110 kV bus (kanon) — adapter generuje 1 sekcję domyślną.
    gpz_hv_sections: list[GPZSection] = []
    # PR-3 rebuild SLD: porty zewnętrzne stacji + multi-voltage nN
    external_ports: list[Port] = []
    nn_voltage_levels: list[float] = []  # poziomy nN (np. [0.4, 0.69])
    construction_type: (
        Literal["wnetrzowa", "kontenerowa", "slupowa", "prefabrykowana", "inna"] | None
    ) = None


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
    # Kody funkcji zabezpieczeniowych ANSI/IEC do wyświetlenia na SLD, np.
    # ['87T','51','50','51N'] — to są stringi, NIE enum; lustro mechanizmu
    # OzeField.protection_codes (jedno źródło prawdy, wspólny wzorzec SLD).
    # Enum ProtectionSetting pozostaje wyłącznie dla konfiguracji/koordynacji.
    protection_codes: list[str] = Field(default_factory=list)
    # PR-3 rebuild SLD: porty pola — wnioskowane z bay_role + bus + reservation slots
    ports: list[Port] = []
    bay_template_ref: str | None = None  # referencja do BayTemplate w katalogu
    # Phase 0A audit fix 8/8: kanoniczny identyfikator dyspozytorski pola
    # (np. "10", "23/1") — wyświetlany pod kolumną w SLD GPZ. NIE pochodzi
    # z `name` (które może być długie/lokalne), tylko explicit numer pola.
    bay_number: str | None = None
    # Krótka nazwa odpływu/feedera — UI label osobny od `bay.name`. Np.
    # "SADY", "OKRĘŻNA" — używany w nagłówku kolumny w SLD GPZ.
    feeder_short_name: str | None = None
    # Cel feedera (substation ref docelowej stacji). Eliminuje wnioskowanie
    # z grafu w adapterze SLD (BLOCKER system §D). Adapter wyświetla
    # destination jako "→ {substation.name}".
    outgoing_destination_ref: str | None = None
    # Phase 0B-1: runtime_state telemetry pipeline (OPEN Inv 17 → RESOLVED).
    # Snapshot SCADA per-pole — primary_device_states (CB/DS/ES actual_state),
    # control_mode, pending_command, energization_and_safety. Adapter SLD
    # konsumuje to pole gdy obecne; brak → renderer pokazuje neutral 'unknown'
    # (Invariant 9). Field forward-deklarowany — typ BayRuntimeState w
    # późniejszej sekcji modułu.
    runtime_state: BayRuntimeState | None = None
    # Recenzja NO-GO 2026-07-17 pkt 9/10 (spec §12.5): aparaty PIERWOTNE pola
    # NA SNAPSHOTCIE ENM — domknięcie STOP-notatki F9.2 (frontend
    # `enmToSldAdapter.ts::BayWithOptionalPrimaryDevices` czyta to pole
    # DEFENSYWNIE od F9.2 — „projekcja aktywuje się automatycznie, gdy backend
    # zacznie serializować"). Dotąd `primary_devices` istniało wyłącznie na
    # `BayBaseModel`/`BayCanonicalModel` (kanał field-view) — walidator blokad
    # uziemnika (W034, validator.py) i identyfikatory globalne aparatów
    # wymagają tych danych na snapshotcie. Puste = dana niedostarczona
    # (ścieżka konwencji rysunku, zero domysłu).
    primary_devices: list[BayPrimaryDevice] = []


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
        # F9.6 (SLD_CAD_SPEC_V3 §12.5, V12K-028): ogranicznik przepięć — rysowany
        # WYŁĄCZNIE gdy pochodzi z danych (zero konwencji/zgadywania, §12.4).
        "SURGE_ARRESTER",
    ]
    placement: Literal["UPSTREAM", "MIDSTREAM", "DOWNSTREAM", "OFF_PATH", "GROUND_BRANCH"]
    section_side: Literal["LEFT", "CENTER", "RIGHT"] | None = None
    is_controllable: bool = False
    render_variant: str | None = None
    switch_state: BaySwitchState | None = None
    operating_state: BayOperatingState | None = None
    # F10.6 (SLD_CAD_SPEC_V3 §19.1, D1, V12K-035): identyfikator PER-APARAT
    # (np. "Q1", "QE1", "T1") jako DANA projektowa — gdy obecny, ma pierwszeństwo
    # nad fallbackiem konwencji (`compose/apparatusSequence.ts::apparatusIdentifiers`,
    # `data-designation-source="konwencja"`). None = dana niedostarczona,
    # render pozostaje przy konwencji ze znacznikiem źródła.
    designation: str | None = None
    # Recenzja NO-GO 2026-07-17 pkt 10 (spec §12.5): TYPOLOGIA uziemienia —
    # WYŁĄCZNIE dla kind="ES" (albo gałęzi uziemiającej SA): uziemnik pola /
    # uziemienie ekranów kabla / konstrukcji / punktu neutralnego / gałąź
    # ogranicznika. None = dana niedostarczona (rysunek: generyczny uziemnik,
    # zero domysłu).
    earthing_role: (
        Literal[
            "field_earth",
            "cable_screen",
            "structure",
            "neutral_point",
            "surge_ground",
        ]
        | None
    ) = None


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
    # ABB UniSwitch cell type (catalog §4 "Rodzaje pól"). Optional and additive:
    # defaults to None so it is excluded from the deterministic ENM fingerprint
    # (hash uses exclude_none=True / model_dump excludes None) when unset. Do NOT
    # populate on existing fixtures — populating would change their fingerprints.
    cell_type: (
        Literal[
            "SDC",
            "SDF",
            "CBC",
            "DBC",
            "BRC",
            "SEC",
            "SBC",
            "SMC",
            "SDM_V",
            "SDM_C",
        ]
        | None
    ) = None
    # Powiązania producenckie pola (Reference Engine): szablon pola i rodzina
    # rozdzielnicy. Opcjonalne i addytywne — None wykluczane z odcisku ENM
    # (exclude_none). Nie wypełniać na istniejących fixture'ach.
    bay_template_ref: str | None = None
    switchgear_family_ref: str | None = None


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
    # EARTHING-1 (most produkcyjny SC_1F -> uziemienia): dane PROJEKTOWE uziomu
    # potrzebne do napiec dotykowego/krokowego (PN-EN 50522). Addytywne, None =
    # dana niedostarczona (ZERO zgadywania — brak => readiness fix-action,
    # pack nie liczy). Nie sa fizyka: to wejscie projektowe (rezystancja uziomu
    # z pomiaru rezystywnosci gruntu; wspolczynnik podzialu r z torow powrotnych
    # ekran/OPGW). Prad doziemny I''k1 pochodzi z solvera SC_1F.
    earth_electrode_resistance_ohm: float | None = None  # R_u = Z_E [Ω]
    earth_return_split_factor: float | None = None  # r (0..1): udzial wracajacy uziomem


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
    shunt_capacitors: list[ShuntCapacitor] = []
    substations: list[Substation] = []
    bays: list[Bay] = []
    junctions: list[Junction] = []
    corridors: list[Corridor] = []
    measurements: list[Measurement] = []
    protection_assignments: list[ProtectionAssignment] = []
    branch_points: list[BranchPointSN] = []
    # PR-3 rebuild SLD: nowe kolekcje (addytywne, opcjonalne)
    line_runs: list[LineRun] = []
    connection_nodes: list[ConnectionNode] = []


# Phase 0B-1: rebuild Bay aby ForwardRef "BayRuntimeState | None" rozwiązał
# się do faktycznej klasy zdefiniowanej niżej w module (linia 929).
Bay.model_rebuild()
