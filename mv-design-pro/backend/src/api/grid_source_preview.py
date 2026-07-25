from __future__ import annotations

from typing import Literal

from enm.der_sn_validation import (
    DEFAULT_SIMULTANEITY_FACTOR,
    DEFAULT_TRANSFORMER_LOADABILITY_PU,
    NN_VOLTAGE_TOLERANCE_KV,
    SN_VOLTAGE_TOLERANCE_KV,
    converter_apparent_power_mva,
    rated_current_a,
)
from fastapi import APIRouter, HTTPException
from network_model.catalog.mv_cable_line_catalog import get_all_cable_types
from network_model.catalog.mv_switch_catalog import get_all_switch_equipment_types
from network_model.catalog.mv_transformer_catalog import get_sn_nn_transformer_types
from network_model.solvers.cable_ampacity_derating import (
    NAZWA_WARUNKI_KATALOGOWE,
    NAZWA_WLASNE,
    obciazalnosc_skorygowana,
    widok_zestawow,
    wspolczynniki_z_opisu,
)
from network_model.solvers.cable_voltage_drop import (
    CableRatedCurrentInput,
    CableVoltageDropInput,
    compute_cable_rated_current,
    compute_cable_voltage_drop,
)
from network_model.solvers.der_selection_preview import (
    BlockTransformerCandidate,
    BlockTransformerSelectionInput,
    CableCandidate,
    CableSelectionInput,
    FieldApparatusCandidate,
    FieldApparatusSelectionInput,
    propose_block_transformer,
    propose_mv_cable,
    propose_mv_field_apparatus,
)
from network_model.solvers.grid_source_preview import (
    GridSourcePreviewInput,
    compute_grid_source_preview,
)
from network_model.solvers.shunt_compensator_preview import (
    ShuntCompensatorPreviewInput,
    compute_shunt_compensator_preview,
)
from network_model.solvers.transformer_rated_currents import (
    TransformerRatedCurrentsInput,
    compute_transformer_rated_currents,
)
from pydantic import BaseModel, Field, model_validator

router = APIRouter(tags=["grid-source-preview"])


class ComplexOhmResponse(BaseModel):
    r_ohm: float
    x_ohm: float


class GridSourcePreviewRequest(BaseModel):
    voltage_kv: float = Field(gt=0)
    short_circuit_mode: Literal["SHORT_CIRCUIT_POWER", "IMPEDANCE"] = "SHORT_CIRCUIT_POWER"
    sk3_mva: float | None = Field(default=None, gt=0)
    rx_ratio: float | None = Field(default=None, ge=0)
    r_ohm: float | None = Field(default=None, ge=0)
    x_ohm: float | None = Field(default=None, gt=0)
    zero_sequence_enabled: bool = False
    r0_ohm: float | None = Field(default=None, ge=0)
    x0_ohm: float | None = Field(default=None, gt=0)
    z0_z1_ratio: float | None = Field(default=None, gt=0)
    tk_s: float = Field(default=1.0, gt=0)
    tb_s: float = Field(default=0.1, gt=0)


class GridSourcePreviewResponse(BaseModel):
    sk_mva: float
    ik3_ka: float
    ik1_ka: float | None
    ip_ka: float
    ith_ka: float
    kappa: float
    z1_ohm: ComplexOhmResponse
    z0_ohm: ComplexOhmResponse | None
    formula_ref: str


@router.post("/api/solver/grid-source-preview", response_model=GridSourcePreviewResponse)
def preview_grid_source_short_circuit(
    request: GridSourcePreviewRequest,
) -> GridSourcePreviewResponse:
    try:
        result = compute_grid_source_preview(
            GridSourcePreviewInput(
                voltage_kv=request.voltage_kv,
                short_circuit_mode=request.short_circuit_mode,
                sk3_mva=request.sk3_mva,
                rx_ratio=request.rx_ratio,
                r_ohm=request.r_ohm,
                x_ohm=request.x_ohm,
                zero_sequence_enabled=request.zero_sequence_enabled,
                r0_ohm=request.r0_ohm,
                x0_ohm=request.x0_ohm,
                z0_z1_ratio=request.z0_z1_ratio,
                tk_s=request.tk_s,
                tb_s=request.tb_s,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return GridSourcePreviewResponse(
        sk_mva=result.sk_mva,
        ik3_ka=result.ik3_ka,
        ik1_ka=result.ik1_ka,
        ip_ka=result.ip_ka,
        ith_ka=result.ith_ka,
        kappa=result.kappa,
        z1_ohm=ComplexOhmResponse(r_ohm=result.z1_ohm.real, x_ohm=result.z1_ohm.imag),
        z0_ohm=(
            ComplexOhmResponse(r_ohm=result.z0_ohm.real, x_ohm=result.z0_ohm.imag)
            if result.z0_ohm is not None
            else None
        ),
        formula_ref=result.formula_ref,
    )


class CableVoltageDropRequest(BaseModel):
    current_a: float
    length_km: float
    r_ohm_per_km: float
    x_ohm_per_km: float
    cos_phi: float
    line_voltage_v: float
    # Karta F-K5 (dlug V12K-190): solver zna kierunek mocy i charakter mocy biernej
    # od fali E audytu fizyki, ale koncowka ich NIE wystawiala — zdolnosc pokazania
    # WZROSTU napiecia od generacji byla w produkcie niedostepna. Pola opcjonalne z
    # domyslnymi wartosciami dawnego zachowania, wiec payload bez nich jest
    # bit-identyczny (odbior indukcyjny).
    flow_direction: str = "load"
    reactive_character: str = "inductive"


class CableVoltageDropResponse(BaseModel):
    delta_u_v: float
    delta_u_pct: float
    r_total_ohm: float
    x_total_ohm: float
    delta_u_resistive_v: float
    delta_u_reactive_v: float
    formula_ref: str
    assumptions: list[str]
    # Znak samego ``delta_u_v`` jest nieczytelny bez kierunkow — dlatego werdykt
    # „wzrost czy spadek" i oba kierunki jada w odpowiedzi (WHITE BOX).
    is_voltage_rise: bool = False
    flow_direction: str = "load"
    reactive_character: str = "inductive"


@router.post(
    "/api/solver/cable-voltage-drop-preview",
    response_model=CableVoltageDropResponse,
)
def preview_cable_voltage_drop(
    request: CableVoltageDropRequest,
) -> CableVoltageDropResponse:
    try:
        result = compute_cable_voltage_drop(
            CableVoltageDropInput(
                current_a=request.current_a,
                length_km=request.length_km,
                r_ohm_per_km=request.r_ohm_per_km,
                x_ohm_per_km=request.x_ohm_per_km,
                cos_phi=request.cos_phi,
                line_voltage_v=request.line_voltage_v,
                flow_direction=request.flow_direction,
                reactive_character=request.reactive_character,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return CableVoltageDropResponse(
        delta_u_v=result.delta_u_v,
        delta_u_pct=result.delta_u_pct,
        r_total_ohm=result.r_total_ohm,
        x_total_ohm=result.x_total_ohm,
        delta_u_resistive_v=result.delta_u_resistive_v,
        delta_u_reactive_v=result.delta_u_reactive_v,
        formula_ref=result.formula_ref,
        assumptions=list(result.assumptions),
        is_voltage_rise=result.is_voltage_rise,
        flow_direction=result.flow_direction,
        reactive_character=result.reactive_character,
    )


class CableRatedCurrentRequest(BaseModel):
    active_power_kw: float
    cos_phi: float
    line_voltage_v: float


class CableRatedCurrentResponse(BaseModel):
    rated_current_a: float
    apparent_power_kva: float
    formula_ref: str
    assumptions: list[str]


@router.post(
    "/api/solver/cable-rated-current-preview",
    response_model=CableRatedCurrentResponse,
)
def preview_cable_rated_current(
    request: CableRatedCurrentRequest,
) -> CableRatedCurrentResponse:
    try:
        result = compute_cable_rated_current(
            CableRatedCurrentInput(
                active_power_kw=request.active_power_kw,
                cos_phi=request.cos_phi,
                line_voltage_v=request.line_voltage_v,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return CableRatedCurrentResponse(
        rated_current_a=result.rated_current_a,
        apparent_power_kva=result.apparent_power_kva,
        formula_ref=result.formula_ref,
        assumptions=list(result.assumptions),
    )


class CableLayingConditionsRequest(BaseModel):
    """Warunki UŁOŻENIA kabla (V12K-207, karta F-K7).

    `set_name` to nazwa zestawu o udokumentowanej podstawie albo „wlasne" — wtedy trzy
    współczynniki i opis warunków są WYMAGANE (bez opisu wynik doboru nie dałby się
    obronić w dokumentacji projektu). Pominięcie całego obiektu = warunki katalogowe,
    czyli zachowanie dotychczasowe co do bitu.
    """

    set_name: str = NAZWA_WARUNKI_KATALOGOWE
    f_grunt: float | None = Field(default=None, gt=0, le=1.5)
    f_wiazka: float | None = Field(default=None, gt=0, le=1.5)
    f_grupa: float | None = Field(default=None, gt=0, le=1.5)
    opis_pl: str | None = None

    @model_validator(mode="after")
    def _wspolczynniki_wymagaja_zestawu_wlasnego(self) -> CableLayingConditionsRequest:
        """Współczynniki podane przy NAZWANYM zestawie nie mogą zostać cicho pominięte.

        Nazwany zestaw ma swoje wartości, więc `f_*` obok niego znaczy, że nadawca chciał
        czegoś innego niż to, co dostanie. Milczące zignorowanie zmieniłoby jego dobór.
        """
        podane = [
            pole
            for pole, wartosc in (
                ("f_grunt", self.f_grunt),
                ("f_wiazka", self.f_wiazka),
                ("f_grupa", self.f_grupa),
            )
            if wartosc is not None
        ]
        if podane and self.set_name != NAZWA_WLASNE:
            raise ValueError(
                f"Współczynniki {', '.join(podane)} można podać tylko dla "
                f"set_name = {NAZWA_WLASNE}; zestaw {self.set_name} ma własne wartości."
            )
        return self


class CableLayingConditionsSetResponse(BaseModel):
    """Jeden nazwany zestaw warunków ułożenia — dla listy w kreatorze."""

    name: str
    label_pl: str
    f_grunt: float
    f_wiazka: float
    f_grupa: float
    total: float
    basis: str
    assumption_pl: str


class CableLayingConditionsResponse(BaseModel):
    """Lista warunków ułożenia + POWÓD, dla którego jest krótka.

    Kreator nie może mieć własnej listy: wartości współczynników są danymi doborowymi,
    nie tekstem interfejsu.
    """

    sets: list[CableLayingConditionsSetResponse]
    custom_name: str
    default_name: str
    limitation_pl: str


class CableAmpacityDeratingRequest(BaseModel):
    """Korekta obciążalności kabla wg warunków ułożenia (V12K-207, karta F-K7).

    Warstwa prezentacji NIE MOŻE mnożyć obciążalności przez współczynniki sama — to
    kryterium doborowe, więc rachunek należy do backendu (reguła braku fizyki w UI).
    """

    rated_ampacity_a: float = Field(gt=0)
    design_current_a: float = Field(gt=0)
    laying_conditions: CableLayingConditionsRequest | None = None


class CableAmpacityDeratingResponse(BaseModel):
    """I′z = Iz · f_grunt · f_wiazka · f_grupa oraz werdykt I_obl ≤ I′z."""

    rated_ampacity_a: float
    effective_ampacity_a: float
    design_current_a: float
    derating_total: float
    derating_set: str
    utilization_pct: float
    ok: bool
    formula_ref: str
    assumption_pl: str


@router.post(
    "/api/solver/cable-ampacity-derating-preview",
    response_model=CableAmpacityDeratingResponse,
)
def preview_cable_ampacity_derating(
    request: CableAmpacityDeratingRequest,
) -> CableAmpacityDeratingResponse:
    """Obciążalność skorygowana warunkami ułożenia + werdykt kryterium prądowego."""
    laying = request.laying_conditions
    try:
        derating = wspolczynniki_z_opisu(
            laying.set_name if laying is not None else None,
            f_grunt=laying.f_grunt if laying is not None else None,
            f_wiazka=laying.f_wiazka if laying is not None else None,
            f_grupa=laying.f_grupa if laying is not None else None,
            opis_pl=laying.opis_pl if laying is not None else None,
        )
        effective = obciazalnosc_skorygowana(request.rated_ampacity_a, derating)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return CableAmpacityDeratingResponse(
        rated_ampacity_a=request.rated_ampacity_a,
        effective_ampacity_a=effective,
        design_current_a=request.design_current_a,
        derating_total=derating.iloczyn,
        derating_set=derating.nazwa,
        utilization_pct=request.design_current_a / effective * 100.0,
        ok=request.design_current_a <= effective,
        formula_ref="I'z = Iz · f_grunt · f_wiazka · f_grupa;  I_obl ≤ I'z",
        assumption_pl=derating.zalozenie_pl(),
    )


class TransformerRatedCurrentsRequest(BaseModel):
    rated_power_kva: float
    primary_voltage_kv: float
    secondary_voltage_kv: float


class TransformerRatedCurrentsResponse(BaseModel):
    primary_current_a: float
    secondary_current_a: float
    formula_ref: str
    assumptions: list[str]


@router.post(
    "/api/solver/transformer-rated-currents-preview",
    response_model=TransformerRatedCurrentsResponse,
)
def preview_transformer_rated_currents(
    request: TransformerRatedCurrentsRequest,
) -> TransformerRatedCurrentsResponse:
    try:
        result = compute_transformer_rated_currents(
            TransformerRatedCurrentsInput(
                rated_power_kva=request.rated_power_kva,
                primary_voltage_kv=request.primary_voltage_kv,
                secondary_voltage_kv=request.secondary_voltage_kv,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return TransformerRatedCurrentsResponse(
        primary_current_a=result.primary_current_a,
        secondary_current_a=result.secondary_current_a,
        formula_ref=result.formula_ref,
        assumptions=list(result.assumptions),
    )


class ShuntCompensatorPreviewRequest(BaseModel):
    rated_mvar: float = Field(gt=0)
    rated_kv: float = Field(gt=0)


class ShuntCompensatorPreviewResponse(BaseModel):
    rated_mvar: float
    rated_kv: float
    reactive_power_var: float
    susceptance_siemens: float
    rated_current_a: float
    formula_ref: str


@router.post(
    "/api/solver/shunt-compensator-preview",
    response_model=ShuntCompensatorPreviewResponse,
)
def preview_shunt_compensator(
    request: ShuntCompensatorPreviewRequest,
) -> ShuntCompensatorPreviewResponse:
    try:
        result = compute_shunt_compensator_preview(
            ShuntCompensatorPreviewInput(
                rated_mvar=request.rated_mvar,
                rated_kv=request.rated_kv,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    return ShuntCompensatorPreviewResponse(
        rated_mvar=result.rated_mvar,
        rated_kv=result.rated_kv,
        reactive_power_var=result.reactive_power_var,
        susceptance_siemens=result.susceptance_siemens,
        rated_current_a=result.rated_current_a,
        formula_ref=result.formula_ref,
    )


# ===========================================================================
# D2 (RECENZJA_DER_SN_DOBORY_2026-07): DOBÓR toru DER po stronie SN.
# Kaskada: ΣS falowników → TR blokowy → prąd znamionowy TR (strona SN) → kabel SN
# i aparat pola SN. Propozycja systemu (kreator pokazuje, projektant decyduje);
# twarde walidacje D1 bronią przed niemożliwym. Katalog-first: kandydaci z realnych
# katalogów (TRAFO_SN_NN, kable SN, aparaty SN). Tolerancje/współczynniki z D1.
# ===========================================================================


class RejectedCandidateResponse(BaseModel):
    catalog_ref: str
    name: str
    reason_code: str
    reason_pl: str


class BlockTransformerProposalResponse(BaseModel):
    catalog_ref: str
    name: str
    sn_mva: float
    primary_kv: float
    secondary_kv: float
    uk_percent: float | None
    vector_group: str | None


class BlockTransformerSelectionResponse(BaseModel):
    proposal: BlockTransformerProposalResponse | None
    required_apparent_power_mva: float
    effective_load_mva: float
    rejected: list[RejectedCandidateResponse]
    error_code: str | None
    error_pl: str | None
    # D3 wymaganie 7: realne układy połączeń dla klasy napięcia toru (z katalogu, nie hardcode);
    # kreator prezentuje je jako listę wyboru grupy TR blokowego.
    available_vector_groups: list[str] = []
    formula_ref: str


class CableProposalResponse(BaseModel):
    catalog_ref: str
    name: str
    cross_section_mm2: float
    rated_current_a: float
    delta_u_v: float
    delta_u_pct: float
    # V12K-203: dla toru DER ΔU jest zwykle WZROSTEM napięcia (ΔU < 0). Kreator musi
    # nazwać wielkość, którą pokazuje — bez tego pola „−1,20 %" wygląda jak spadek.
    is_voltage_rise: bool = False
    # V12K-207 (F-K7): obciążalność SKORYGOWANA warunkami ułożenia obok katalogowej.
    # Dwie liczby, nie jedna — projektant musi widzieć, ile zabrała korekta.
    effective_ampacity_a: float = 0.0
    derating_total: float = 1.0


class CableSelectionResponse(BaseModel):
    proposal: CableProposalResponse | None
    required_ampacity_a: float
    max_delta_u_pct: float
    rejected: list[RejectedCandidateResponse]
    error_code: str | None
    error_pl: str | None
    formula_ref: str
    # V12K-203: echo przypadku pracy toru, dla którego sprawdzono ΔU kandydatów.
    flow_direction: str = "generation"
    reactive_character: str = "inductive"
    # V12K-207: warunki ułożenia, dla których policzono obciążalność, i jawne założenie.
    # Echo jest wymagane także przy braku propozycji — inaczej projektant nie wie, że
    # zamiast szukać grubszego kabla może poprawić warunki ułożenia trasy.
    derating_set: str = NAZWA_WARUNKI_KATALOGOWE
    derating_total: float = 1.0
    derating_assumption_pl: str = ""


class FieldApparatusProposalResponse(BaseModel):
    catalog_ref: str
    name: str
    equipment_kind: str
    un_kv: float
    in_a: float
    ik_ka: float | None


class FieldApparatusSelectionResponse(BaseModel):
    proposal: FieldApparatusProposalResponse | None
    required_current_a: float
    rejected: list[RejectedCandidateResponse]
    error_code: str | None
    error_pl: str | None
    formula_ref: str


class DerSelectionPreviewRequest(BaseModel):
    sum_active_power_mw: float = Field(gt=0)
    cos_phi: float | None = Field(default=None, gt=0, le=1)
    inverter_output_kv: float = Field(gt=0)
    sn_bus_voltage_kv: float = Field(gt=0)
    cable_length_km: float = Field(gt=0)
    simultaneity_factor: float = Field(default=DEFAULT_SIMULTANEITY_FACTOR, gt=0)
    loadability_pu: float = Field(default=DEFAULT_TRANSFORMER_LOADABILITY_PU, gt=0)
    transformer_reserve_pu: float = Field(default=0.0, ge=0)
    cable_reserve_pu: float = Field(default=0.0, ge=0)
    field_reserve_pu: float = Field(default=0.0, ge=0)
    max_delta_u_pct: float = Field(default=2.0, gt=0)
    # V12K-203: charakter mocy biernej falownika w przypadku doboru. Kierunek mocy
    # CZYNNEJ nie jest tu wyborem — tor DER oddaje moc do sieci, więc pozostaje
    # „generation" (stała fizyczna toru, nie pole formularza). Wyborem projektanta
    # jest natomiast, czy falownik POBIERA moc bierną (regulacja Q(U) tłumi wzrost
    # napięcia), czy ją ODDAJE (wzrost największy) — od tego zależy, jaki przekrój
    # kabla przechodzi kryterium |ΔU%|.
    reactive_character: str = Field(default="inductive")
    # V12K-207 (F-K7): warunki UŁOŻENIA kabla. Pominięcie = warunki katalogowe (wynik
    # bit-identyczny z dotychczasowym), ale wtedy odpowiedź MÓWI, że takie założenie
    # przyjęto — dotąd nigdzie nie było napisane, dla jakich warunków obowiązuje dobór.
    laying_conditions: CableLayingConditionsRequest | None = None


class DerSelectionPreviewResponse(BaseModel):
    sum_apparent_power_mva: float
    transformer_current_a: float | None
    transformer: BlockTransformerSelectionResponse
    cable: CableSelectionResponse | None
    field_apparatus: FieldApparatusSelectionResponse | None


def _rejected_response(rejected) -> list[RejectedCandidateResponse]:
    return [
        RejectedCandidateResponse(
            catalog_ref=item.catalog_ref,
            name=item.name,
            reason_code=item.reason_code,
            reason_pl=item.reason_pl,
        )
        for item in rejected
    ]


def _block_transformer_candidates() -> tuple[BlockTransformerCandidate, ...]:
    candidates: list[BlockTransformerCandidate] = []
    for record in get_sn_nn_transformer_types():
        params = record.get("params") or {}
        sn_mva = params.get("rated_power_mva")
        primary_kv = params.get("voltage_hv_kv")
        secondary_kv = params.get("voltage_lv_kv")
        if sn_mva is None or primary_kv is None or secondary_kv is None:
            continue
        candidates.append(
            BlockTransformerCandidate(
                catalog_ref=str(record["id"]),
                name=str(record.get("name", record["id"])),
                sn_mva=float(sn_mva),
                primary_kv=float(primary_kv),
                secondary_kv=float(secondary_kv),
                uk_percent=(
                    float(params["uk_percent"]) if params.get("uk_percent") is not None else None
                ),
                vector_group=params.get("vector_group"),
            )
        )
    return tuple(candidates)


def _cable_candidates() -> tuple[CableCandidate, ...]:
    candidates: list[CableCandidate] = []
    for record in get_all_cable_types():
        params = record.get("params") or {}
        cross = params.get("cross_section_mm2")
        ampacity = params.get("rated_current_a")
        r_km = params.get("r_ohm_per_km")
        x_km = params.get("x_ohm_per_km")
        # Katalog-first: pomijamy rekordy niekompletne (brak obciążalności/impedancji).
        if cross is None or ampacity is None or r_km is None or x_km is None:
            continue
        candidates.append(
            CableCandidate(
                catalog_ref=str(record["id"]),
                name=str(record.get("name", record["id"])),
                cross_section_mm2=float(cross),
                rated_current_a=float(ampacity),
                r_ohm_per_km=float(r_km),
                x_ohm_per_km=float(x_km),
                voltage_rating_kv=(
                    float(params["voltage_rating_kv"])
                    if params.get("voltage_rating_kv") is not None
                    else None
                ),
            )
        )
    return tuple(candidates)


def _field_apparatus_candidates() -> tuple[FieldApparatusCandidate, ...]:
    candidates: list[FieldApparatusCandidate] = []
    for record in get_all_switch_equipment_types():
        params = record.get("params") or {}
        kind = params.get("equipment_kind")
        un_kv = params.get("un_kv")
        in_a = params.get("in_a")
        if kind is None or un_kv is None or in_a is None:
            continue
        candidates.append(
            FieldApparatusCandidate(
                catalog_ref=str(record["id"]),
                name=str(record.get("name", record["id"])),
                equipment_kind=str(kind),
                un_kv=float(un_kv),
                in_a=float(in_a),
                ik_ka=(float(params["ik_ka"]) if params.get("ik_ka") is not None else None),
            )
        )
    return tuple(candidates)


@router.get(
    "/api/solver/cable-laying-conditions",
    response_model=CableLayingConditionsResponse,
)
def list_cable_laying_conditions() -> CableLayingConditionsResponse:
    """Warunki UŁOŻENIA kabla dostępne w doborze (V12K-207, karta F-K7).

    Kreator nie może mieć własnej listy współczynników: to dane doborowe o
    udokumentowanej podstawie, nie tekst interfejsu. Odpowiedź niesie także POWÓD, dla
    którego lista jest krótka — żeby nie wyglądała na kompletną tablicę norm.
    """
    view = widok_zestawow()
    return CableLayingConditionsResponse(
        sets=[CableLayingConditionsSetResponse(**item) for item in view["sets"]],  # type: ignore[arg-type]
        custom_name=str(view["custom_name"]),
        default_name=str(view["default_name"]),
        limitation_pl=str(view["limitation_pl"]),
    )


@router.post(
    "/api/solver/der-selection-preview",
    response_model=DerSelectionPreviewResponse,
)
def preview_der_selection(
    request: DerSelectionPreviewRequest,
) -> DerSelectionPreviewResponse:
    """Kaskadowy dobór toru DER-SN: TR blokowy → kabel SN → aparat pola SN.

    ΣS liczy D1 `converter_apparent_power_mva` (ΣP·/cosφ). Prąd znamionowy TR
    (strona SN) z D1 `rated_current_a`. Kabel i pole dobierane od prądu SN
    zaproponowanego TR (kaskada I_TR ≤ Iz ≤ In). Zero fizyki rozpływu/zwarcia.
    """
    try:
        sum_apparent_power_mva = converter_apparent_power_mva(
            request.sum_active_power_mw, request.cos_phi
        )
        tr_result = propose_block_transformer(
            BlockTransformerSelectionInput(
                sum_apparent_power_mva=sum_apparent_power_mva,
                primary_voltage_kv=request.sn_bus_voltage_kv,
                secondary_voltage_kv=request.inverter_output_kv,
                candidates=_block_transformer_candidates(),
                simultaneity_factor=request.simultaneity_factor,
                reserve_pu=request.transformer_reserve_pu,
                loadability_pu=request.loadability_pu,
                sn_tolerance_kv=SN_VOLTAGE_TOLERANCE_KV,
                nn_tolerance_kv=NN_VOLTAGE_TOLERANCE_KV,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    transformer_response = BlockTransformerSelectionResponse(
        proposal=(
            BlockTransformerProposalResponse(
                catalog_ref=tr_result.proposal.catalog_ref,
                name=tr_result.proposal.name,
                sn_mva=tr_result.proposal.sn_mva,
                primary_kv=tr_result.proposal.primary_kv,
                secondary_kv=tr_result.proposal.secondary_kv,
                uk_percent=tr_result.proposal.uk_percent,
                vector_group=tr_result.proposal.vector_group,
            )
            if tr_result.proposal is not None
            else None
        ),
        required_apparent_power_mva=tr_result.required_apparent_power_mva,
        effective_load_mva=tr_result.effective_load_mva,
        rejected=_rejected_response(tr_result.rejected),
        error_code=tr_result.error_code,
        error_pl=tr_result.error_pl,
        available_vector_groups=list(tr_result.available_vector_groups),
        formula_ref=tr_result.formula_ref,
    )

    # Kaskada kabla/pola zależy od prądu SN zaproponowanego TR — bez TR nie proponujemy.
    if tr_result.proposal is None:
        return DerSelectionPreviewResponse(
            sum_apparent_power_mva=sum_apparent_power_mva,
            transformer_current_a=None,
            transformer=transformer_response,
            cable=None,
            field_apparatus=None,
        )

    transformer_current_a = rated_current_a(tr_result.proposal.sn_mva, request.sn_bus_voltage_kv)
    if transformer_current_a is None:
        raise HTTPException(
            status_code=422,
            detail="Nie można wyznaczyć prądu znamionowego TR (moc/napięcie).",
        )

    cos_phi_load = request.cos_phi if request.cos_phi is not None else 1.0
    try:
        # F-K7: nazwa zestawu / współczynniki własne → współczynniki. Nieznany zestaw i
        # brak opisu warunków własnych kończą się 422 (fail-closed), nie cichym
        # przyjęciem warunków katalogowych.
        laying = request.laying_conditions
        derating = wspolczynniki_z_opisu(
            laying.set_name if laying is not None else None,
            f_grunt=laying.f_grunt if laying is not None else None,
            f_wiazka=laying.f_wiazka if laying is not None else None,
            f_grupa=laying.f_grupa if laying is not None else None,
            opis_pl=laying.opis_pl if laying is not None else None,
        )
        cable_result = propose_mv_cable(
            CableSelectionInput(
                transformer_current_a=transformer_current_a,
                length_km=request.cable_length_km,
                line_voltage_v=request.sn_bus_voltage_kv * 1000.0,
                cos_phi=cos_phi_load,
                candidates=_cable_candidates(),
                reserve_pu=request.cable_reserve_pu,
                max_delta_u_pct=request.max_delta_u_pct,
                reactive_character=request.reactive_character,
                derating=derating,
            )
        )
        field_result = propose_mv_field_apparatus(
            FieldApparatusSelectionInput(
                transformer_current_a=transformer_current_a,
                system_voltage_kv=request.sn_bus_voltage_kv,
                candidates=_field_apparatus_candidates(),
                reserve_pu=request.field_reserve_pu,
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    cable_response = CableSelectionResponse(
        proposal=(
            CableProposalResponse(
                catalog_ref=cable_result.proposal.catalog_ref,
                name=cable_result.proposal.name,
                cross_section_mm2=cable_result.proposal.cross_section_mm2,
                rated_current_a=cable_result.proposal.rated_current_a,
                delta_u_v=cable_result.proposal.delta_u_v,
                delta_u_pct=cable_result.proposal.delta_u_pct,
                is_voltage_rise=cable_result.proposal.is_voltage_rise,
                effective_ampacity_a=cable_result.proposal.effective_ampacity_a,
                derating_total=cable_result.proposal.derating_total,
            )
            if cable_result.proposal is not None
            else None
        ),
        required_ampacity_a=cable_result.required_ampacity_a,
        max_delta_u_pct=cable_result.max_delta_u_pct,
        rejected=_rejected_response(cable_result.rejected),
        error_code=cable_result.error_code,
        error_pl=cable_result.error_pl,
        formula_ref=cable_result.formula_ref,
        flow_direction=cable_result.flow_direction,
        reactive_character=cable_result.reactive_character,
        derating_set=cable_result.derating_set,
        derating_total=cable_result.derating_total,
        derating_assumption_pl=cable_result.derating_assumption_pl,
    )
    field_response = FieldApparatusSelectionResponse(
        proposal=(
            FieldApparatusProposalResponse(
                catalog_ref=field_result.proposal.catalog_ref,
                name=field_result.proposal.name,
                equipment_kind=field_result.proposal.equipment_kind,
                un_kv=field_result.proposal.un_kv,
                in_a=field_result.proposal.in_a,
                ik_ka=field_result.proposal.ik_ka,
            )
            if field_result.proposal is not None
            else None
        ),
        required_current_a=field_result.required_current_a,
        rejected=_rejected_response(field_result.rejected),
        error_code=field_result.error_code,
        error_pl=field_result.error_pl,
        formula_ref=field_result.formula_ref,
    )

    return DerSelectionPreviewResponse(
        sum_apparent_power_mva=sum_apparent_power_mva,
        transformer_current_a=transformer_current_a,
        transformer=transformer_response,
        cable=cable_response,
        field_apparatus=field_response,
    )
