from __future__ import annotations

from enum import Enum
from typing import Any

from enm.models import EnergyNetworkModel
from pydantic import BaseModel, Field


class V126AnalysisType(str, Enum):
    POWER_QUALITY_HARMONICS = "power_quality_harmonics"
    SSCI_IMPEDANCE = "ssci_impedance"
    VOLTAGE_STABILITY = "voltage_stability"
    RELIABILITY_CONTINGENCY = "reliability_contingency"
    EARTHING_SAFETY = "earthing_safety"
    INSULATION_COORDINATION = "insulation_coordination"
    EARTH_FAULT_DETECTION = "earth_fault_detection"
    TRANSIENT_TRV = "transient_trv"
    MOTOR_STARTING = "motor_starting"
    HOSTING_CAPACITY = "hosting_capacity"
    OPF_LOSS_LCC = "opf_loss_lcc"
    BENCHMARK_VALIDATION = "benchmark_validation"
    UNCERTAINTY_SENSITIVITY = "uncertainty_sensitivity"


class V126BusInput(BaseModel):
    ref: str
    name: str
    nominal_kv: float = Field(gt=0)
    voltage_pu: float = Field(default=1.0, gt=0)
    load_mw: float = 0.0
    load_mvar: float = 0.0
    generation_mw: float = 0.0
    generation_mvar: float = 0.0
    customer_count: int = Field(default=0, ge=0)
    fault_level_mva: float | None = Field(default=None, gt=0)


class V126BranchInput(BaseModel):
    ref: str
    from_bus_ref: str
    to_bus_ref: str
    kind: str
    length_km: float = Field(default=1.0, gt=0)
    r_ohm_per_km: float = Field(default=0.18, ge=0)
    x_ohm_per_km: float = Field(default=0.12, ge=0)
    b_siemens_per_km: float = Field(default=0.0, ge=0)
    ampacity_a: float = Field(default=300.0, gt=0)
    failure_rate_per_year: float = Field(default=0.015, ge=0)
    mttr_h: float = Field(default=12.0, ge=0)
    is_open: bool = False


class V126TransformerInput(BaseModel):
    ref: str
    hv_bus_ref: str
    lv_bus_ref: str
    sn_mva: float = Field(gt=0)
    uhv_kv: float = Field(gt=0)
    ulv_kv: float = Field(gt=0)
    uk_percent: float = Field(gt=0)
    pk_kw: float = Field(default=0.0, ge=0)
    p0_kw: float = Field(default=0.0, ge=0)
    vector_group: str | None = None


class V126HarmonicSourceInput(BaseModel):
    bus_ref: str
    source_ref: str
    base_current_a: float = Field(gt=0)
    spectrum_percent: dict[int, float] = Field(default_factory=dict)


class V126ConverterInput(BaseModel):
    ref: str
    bus_ref: str
    mode: str = "GFL"
    rated_mva: float = Field(default=1.0, gt=0)
    virtual_inertia_h_s: float | None = Field(default=None, ge=0)
    damping_d_pu: float | None = Field(default=None, ge=0)
    droop_p_f_percent: float | None = Field(default=None, ge=0)
    droop_q_u_percent: float | None = Field(default=None, ge=0)
    black_start_capable: bool = False
    # SSCI / Z_conv(f) small-signal output-impedance card fields (D-03). Flow
    # from the converter's ConverterType catalog card via build_v126_input_from_enm.
    # All optional: a missing mandatory field surfaces as missing-data in the SSCI
    # solver (no fabrication / no fallback).
    rated_kv: float | None = Field(default=None, gt=0)
    current_loop_bandwidth_hz: float | None = Field(default=None, gt=0)
    voltage_loop_bandwidth_hz: float | None = Field(default=None, gt=0)
    pll_bandwidth_hz: float | None = Field(default=None, gt=0)
    control_delay_ms: float | None = Field(default=None, ge=0)
    filter_l_pu: float | None = Field(default=None, gt=0)
    filter_r_pu: float | None = Field(default=None, ge=0)
    # Operating point (P,Q) at the converter terminal for the SSCI coupling term.
    p_mw: float | None = None
    q_mvar: float | None = None


class V126MotorInput(BaseModel):
    ref: str
    bus_ref: str
    rated_kw: float = Field(gt=0)
    rated_voltage_kv: float = Field(gt=0)
    locked_rotor_multiplier: float = Field(default=6.0, gt=0)
    start_power_factor: float = Field(default=0.22, gt=0, le=1)
    start_time_s: float = Field(default=8.0, gt=0)
    allowable_locked_rotor_time_s: float = Field(default=20.0, gt=0)
    max_torque_pu: float = Field(default=2.0, gt=0)
    critical_slip: float = Field(default=0.2, gt=0, lt=1)
    load_start_torque_pu: float = Field(default=0.6, ge=0)


class V126EarthingInput(BaseModel):
    gpz_ref: str = "GPZ"
    rho1_ohm_m: float = Field(default=100.0, gt=0)
    rho2_ohm_m: float = Field(default=500.0, gt=0)
    h1_m: float = Field(default=0.5, gt=0)
    length_m: float = Field(default=60.0, gt=0)
    width_m: float = Field(default=40.0, gt=0)
    mesh_spacing_m: float = Field(default=6.0, gt=0)
    buried_depth_m: float = Field(default=0.6, gt=0)
    rods_total_length_m: float = Field(default=40.0, ge=0)
    split_factor: float = Field(default=0.65, gt=0, le=1)
    fault_current_ka: float = Field(default=10.0, gt=0)
    fault_clearing_time_s: float = Field(default=0.5, gt=0)
    surface_layer_rho_ohm_m: float = Field(default=2500.0, gt=0)
    surface_layer_derating: float = Field(default=0.74, gt=0)


class V126InsulationInput(BaseModel):
    location_bus_ref: str
    u_m_kv: float = Field(gt=0)
    network_neutral: str = "isolated"
    arrester_mcov_kv: float | None = Field(default=None, gt=0)
    arrester_residual_10ka_kv: float | None = Field(default=None, gt=0)
    predicted_tov_kv: float | None = Field(default=None, gt=0)
    predicted_energy_kj_per_kv: float = Field(default=2.0, ge=0)


class V126AcademicInput(BaseModel):
    base_frequency_hz: float = Field(default=50.0, gt=0)
    buses: list[V126BusInput]
    branches: list[V126BranchInput] = Field(default_factory=list)
    transformers: list[V126TransformerInput] = Field(default_factory=list)
    harmonic_sources: list[V126HarmonicSourceInput] = Field(default_factory=list)
    converters: list[V126ConverterInput] = Field(default_factory=list)
    motors: list[V126MotorInput] = Field(default_factory=list)
    earthing: V126EarthingInput | None = None
    insulation: list[V126InsulationInput] = Field(default_factory=list)
    parameters: dict[str, Any] = Field(default_factory=dict)


class V126RunRequest(BaseModel):
    parameters: dict[str, Any] = Field(default_factory=dict)


def build_v126_input_from_enm(
    enm: EnergyNetworkModel,
    *,
    parameters: dict[str, Any] | None = None,
) -> V126AcademicInput:
    load_by_bus: dict[str, tuple[float, float]] = {}
    for load in enm.loads:
        p, q = load_by_bus.get(load.bus_ref, (0.0, 0.0))
        load_by_bus[load.bus_ref] = (p + load.p_mw, q + load.q_mvar)

    gen_by_bus: dict[str, tuple[float, float]] = {}
    converters: list[V126ConverterInput] = []
    harmonic_sources: list[V126HarmonicSourceInput] = []
    for generator in enm.generators:
        q_mvar = generator.q_mvar or 0.0
        p, q = gen_by_bus.get(generator.bus_ref, (0.0, 0.0))
        gen_by_bus[generator.bus_ref] = (p + generator.p_mw, q + q_mvar)
        if generator.gen_type in {"pv_inverter", "bess", "fw_pmsg", "fw_dfig", "fw_scig"}:
            rated = max(abs(generator.p_mw), 0.1)
            mode = "GFL" if generator.gen_type != "bess" else "GFM_droop"
            # SSCI / Z_conv(f) card fields flow from the converter's ConverterType
            # catalog card (materialized into the generator's solver params). No
            # fabrication: a field absent from the card stays None and the SSCI
            # solver surfaces it as missing-data.
            card = generator.materialized_params or {}

            def _card_float(key: str, _card: dict[str, Any] = card) -> float | None:
                value = _card.get(key)
                return float(value) if value is not None else None

            rated_kv = _card_float("un_kv")
            converters.append(
                V126ConverterInput(
                    ref=generator.ref_id,
                    bus_ref=generator.bus_ref,
                    mode=mode,
                    rated_mva=rated,
                    droop_p_f_percent=4.0 if mode != "GFL" else None,
                    droop_q_u_percent=3.0 if mode != "GFL" else None,
                    rated_kv=rated_kv,
                    current_loop_bandwidth_hz=_card_float("current_loop_bandwidth_hz"),
                    voltage_loop_bandwidth_hz=_card_float("voltage_loop_bandwidth_hz"),
                    pll_bandwidth_hz=_card_float("pll_bandwidth_hz"),
                    control_delay_ms=_card_float("control_delay_ms"),
                    filter_l_pu=_card_float("filter_l_pu"),
                    filter_r_pu=_card_float("filter_r_pu"),
                    p_mw=generator.p_mw,
                    q_mvar=generator.q_mvar,
                )
            )
            harmonic_sources.append(
                V126HarmonicSourceInput(
                    bus_ref=generator.bus_ref,
                    source_ref=generator.ref_id,
                    base_current_a=1000.0 * rated / (1.7320508075688772 * 15.0),
                    spectrum_percent={5: 3.0, 7: 2.0, 11: 1.2, 13: 1.0},
                )
            )

    buses = [
        V126BusInput(
            ref=bus.ref_id,
            name=bus.name,
            nominal_kv=bus.voltage_kv,
            load_mw=load_by_bus.get(bus.ref_id, (0.0, 0.0))[0],
            load_mvar=load_by_bus.get(bus.ref_id, (0.0, 0.0))[1],
            generation_mw=gen_by_bus.get(bus.ref_id, (0.0, 0.0))[0],
            generation_mvar=gen_by_bus.get(bus.ref_id, (0.0, 0.0))[1],
            fault_level_mva=next(
                (source.sk3_mva for source in enm.sources if source.bus_ref == bus.ref_id), None
            ),
        )
        for bus in enm.buses
    ]

    branches: list[V126BranchInput] = []
    for branch in enm.branches:
        if getattr(branch, "status", "closed") == "open":
            is_open = True
        else:
            is_open = False
        if branch.type in {"line_overhead", "cable"}:
            length_km = float(getattr(branch, "length_km", 1.0))
            rating = getattr(branch, "rating", None)
            branches.append(
                V126BranchInput(
                    ref=branch.ref_id,
                    from_bus_ref=branch.from_bus_ref,
                    to_bus_ref=branch.to_bus_ref,
                    kind=branch.type,
                    length_km=length_km,
                    r_ohm_per_km=float(getattr(branch, "r_ohm_per_km", 0.18)),
                    x_ohm_per_km=float(getattr(branch, "x_ohm_per_km", 0.12)),
                    b_siemens_per_km=float(getattr(branch, "b_siemens_per_km", 0.0) or 0.0),
                    ampacity_a=float(getattr(rating, "in_a", None) or 300.0),
                    failure_rate_per_year=(0.08 if branch.type == "line_overhead" else 0.015)
                    * length_km,
                    mttr_h=3.5 if branch.type == "line_overhead" else 12.0,
                    is_open=is_open,
                )
            )
        elif branch.type in {"switch", "breaker", "bus_coupler", "disconnector"}:
            branches.append(
                V126BranchInput(
                    ref=branch.ref_id,
                    from_bus_ref=branch.from_bus_ref,
                    to_bus_ref=branch.to_bus_ref,
                    kind=branch.type,
                    length_km=0.001,
                    r_ohm_per_km=float(getattr(branch, "r_ohm", None) or 0.001),
                    x_ohm_per_km=float(getattr(branch, "x_ohm", None) or 0.001),
                    ampacity_a=630.0,
                    failure_rate_per_year=0.015,
                    mttr_h=4.0,
                    is_open=is_open,
                )
            )

    transformers = [
        V126TransformerInput(
            ref=transformer.ref_id,
            hv_bus_ref=transformer.hv_bus_ref,
            lv_bus_ref=transformer.lv_bus_ref,
            sn_mva=transformer.sn_mva,
            uhv_kv=transformer.uhv_kv,
            ulv_kv=transformer.ulv_kv,
            uk_percent=transformer.uk_percent,
            pk_kw=transformer.pk_kw,
            p0_kw=transformer.p0_kw or 0.0,
            vector_group=transformer.vector_group,
        )
        for transformer in enm.transformers
    ]

    return V126AcademicInput(
        base_frequency_hz=enm.buses[0].frequency_hz or 50.0 if enm.buses else 50.0,
        buses=buses,
        branches=branches,
        transformers=transformers,
        harmonic_sources=harmonic_sources,
        converters=converters,
        parameters=parameters or {},
    )
