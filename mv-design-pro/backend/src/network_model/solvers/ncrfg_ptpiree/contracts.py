"""Kontrakty solvera testow NC RfG / PTPiREE.

Ten kontrakt jest addytywny wobec frozen wynikow SC/PF. Wejscie opisuje jawnie
deklarowane zdolnosci modulu wytwarzania energii; solver nie dobiera ich sam.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

PtpireeCertificateStatus = Literal["ptpiree_verified", "none", "expired", "unknown"]
PtpireeDerKind = Literal["PV", "BESS", "FW", "OTHER"]
PtpireeModuleFamily = Literal["PPM", "SyPGM", "Morski_PPM"]
PtpireeVerdict = Literal["pass", "fail", "no_data", "not_required"]


class NcRfgPtpireeModuleInput(BaseModel):
    """Dane jednego PGM/PPM do pakietu testow zgodnosci."""

    der_ref: str = Field(min_length=1)
    der_name: str | None = None
    der_kind: PtpireeDerKind = "PV"
    module_family: PtpireeModuleFamily = "PPM"
    operator_id: str = "enea"
    p_max_kw: float = Field(gt=0)
    p_min_kw: float | None = Field(default=None, ge=0)
    voltage_kv: float = Field(gt=0)
    certificate_status: PtpireeCertificateStatus = "unknown"

    has_lvrt_curve: bool = False
    has_hvrt_curve: bool = False
    has_pf_droop: bool = False
    has_qu_curve: bool = False
    has_dynamic_model: bool = False
    has_scada_communication: bool = False
    has_disturbance_recorder: bool = False
    active_power_control_enabled: bool = False
    stop_generation_enabled: bool = False
    reduction_generation_enabled: bool = False
    island_operation_required: bool = False
    island_operation_capable: bool = False
    black_start_required: bool = False
    black_start_capable: bool = False
    power_oscillation_damping_required: bool = False
    power_oscillation_damping_enabled: bool = False

    droop_percent: float | None = Field(default=None, gt=0)
    dead_band_hz: float | None = Field(default=None, ge=0)
    ramp_rate_pct_per_min: float | None = Field(default=None, gt=0)
    cos_phi_min: float | None = Field(default=None, gt=0, le=1)
    q_range_pct_pn_min: float | None = None
    q_range_pct_pn_max: float | None = None
    reactive_current_gain: float | None = Field(default=None, ge=0)
    p_recovery_time_s: float | None = Field(default=None, ge=0)
    harmonic_thdu_percent: float | None = Field(default=None, ge=0)


class NcRfgPtpireeRunRequest(BaseModel):
    """Pakiet uruchomienia testow dla jednego lub wielu modulow."""

    modules: list[NcRfgPtpireeModuleInput] = Field(min_length=1)
    requested_test_ids: list[str] = Field(default_factory=list)
    procedure_version: str = "PTPiREE Procedura testowania v3.0"
    deterministic_seed: int = 0


class NcRfgTraceStep(BaseModel):
    step: int
    test_id: str
    key: str
    formula: str
    data: dict[str, Any]
    substitution: str
    result: dict[str, Any]
    unit_check: str
    proof_ref: str


class NcRfgPtpireeTestDefinition(BaseModel):
    test_id: str
    ability_pl: str
    procedure_basis_pl: str
    default_for_modules: list[str]
    conditional_pl: str | None = None


class NcRfgPtpireeTestResult(BaseModel):
    test_id: str
    ability_pl: str
    required: bool
    required_reason_pl: str
    verdict: PtpireeVerdict
    summary_pl: str
    metrics: dict[str, Any] = Field(default_factory=dict)
    trace_refs: list[str] = Field(default_factory=list)
    fix_actions: list[str] = Field(default_factory=list)


class NcRfgPtpireeModuleResult(BaseModel):
    der_ref: str
    der_name: str | None
    operator_id: str
    operator_name_pl: str
    module_type: str
    module_family: PtpireeModuleFamily
    p_max_kw: float
    voltage_kv: float
    required_count: int
    pass_count: int
    fail_count: int
    no_data_count: int
    not_required_count: int
    overall_status: Literal["zgodny", "niezgodny", "brak_danych"]
    tests: list[NcRfgPtpireeTestResult]


class NcRfgPtpireeRunResult(BaseModel):
    contract: str = "NcRfgPtpireeTestResultV1"
    procedure_version: str
    solver_version: str
    input_hash: str
    deterministic_hash: str
    modules: list[NcRfgPtpireeModuleResult]
    test_catalog: list[NcRfgPtpireeTestDefinition]
    white_box_trace: list[NcRfgTraceStep]
    report_pl: str
