from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Literal, cast

from application.analyses.dobor_toru_der_sn import OpisUlozeniaKabla, dobierz_tor_der_sn
from application.analyses.ocena_doboru_magistrali import (
    OdcinekMagistrali,
    ocen_dobor_magistrali,
)
from domain.generator_validation import (
    BEZ_REDUKCJI,
    JawneWejsciaKontroliMocy,
    blad_wejsc_kontroli_mocy,
    moc_pozorna_z_nastawy_mva,
)
from fastapi import APIRouter, HTTPException
from network_model.catalog.wartosci_robocze import (
    TolerancjaNnRozstrzygnieta,
    tolerancja_nn_napiecia,
)
from network_model.core.voltage_factor import TolerancjaNapieciaNn
from network_model.odmowa_danych import OdmowaDanychError
from network_model.pochodne import ka_na_a, kv_na_v, moc_zwarciowa_z_pradu_mva
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
    RejectedCandidate,
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
from werdykt import OcenaKryterium

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
    # CV-4.3 K7: dane scenariusza MIN (addytywne) — podgląd oddaje blok ``min`` z DRUGIEGO
    # wywołania tej samej zamrożonej funkcji; tryb impedancyjny nie ma wariantu MIN.
    sk3_min_mva: float | None = Field(default=None, gt=0)
    ik3_min_ka: float | None = Field(default=None, gt=0)
    rx_ratio_min: float | None = Field(default=None, ge=0)
    zero_sequence_enabled: bool = False
    r0_ohm: float | None = Field(default=None, ge=0)
    x0_ohm: float | None = Field(default=None, gt=0)
    z0_z1_ratio: float | None = Field(default=None, gt=0)
    tk_s: float = Field(default=1.0, gt=0)
    # Karta WSPOLCZYNNIK-C-JEDEN-NOSNIK (addytywnie): tolerancja sieci nN dla U_nQ w paśmie nN
    # (wiersz nN tabeli 1 IEC 60909-0); dla SN/WN bez znaczenia. Karta
    # TOLERANCJA-NN-WARTOSC-ROBOCZA: brak przy U_nQ nN = wartość robocza rejestru
    # (`wartosci_robocze.rozstrzygnij_tolerancje_nn`), nazwana w odpowiedzi (`tolerancja_nn`).
    lv_voltage_tolerance: TolerancjaNapieciaNn | None = None


class GridSourcePreviewMinResponse(BaseModel):
    """Blok scenariusza MIN podglądu (CV-4.3 K7): te same wielkości co dla MAX, policzone
    zamrożonym solverem podglądu z S''_kQmin (albo S''_kQmin = √3·U·I''_kQmin dla danych
    prądowych) i R/X = rx_ratio_min → rx_ratio."""

    sk_mva: float
    ik3_ka: float
    ik1_ka: float | None
    ip_ka: float
    ith_ka: float
    kappa: float
    z1_ohm: ComplexOhmResponse
    z0_ohm: ComplexOhmResponse | None
    tryb_danych: Literal["MOC_ZWARCIOWA", "PRAD_ZWARCIOWY"]
    rx_ratio_zrodlo: Literal["MODEL_MIN", "MODEL_MAX"]


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
    #: Karta TOLERANCJA-NN-WARTOSC-ROBOCZA (addytywnie): klasa tolerancji sieci nN użyta w c
    #: dla U_nQ w paśmie nN (pochodzenie: deklaracja żądania albo wartość robocza rejestru,
    #: zdanie źródła); ``None`` dla U_nQ SN/WN (jeden wiersz tabeli 1, tolerancja bez znaczenia).
    tolerancja_nn: dict[str, Any] | None = None
    #: CV-4.3 K7: ``None`` = nie podano danych MIN (scenariusz MIN biegu liczony z danych
    #: MAX z jawnym założeniem ``source.sk_min_missing``). Nazwa ``scenariusz_min`` (nie
    #: ``min``): nazwy pól kontraktów trafiają do inwentarza guarda podstawień.
    scenariusz_min: GridSourcePreviewMinResponse | None = None


def _klasa_tolerancji(
    tolerancja: TolerancjaNnRozstrzygnieta | None,
) -> TolerancjaNapieciaNn | None:
    return tolerancja.wartosc if tolerancja is not None else None


def _podglad_min(request: GridSourcePreviewRequest) -> GridSourcePreviewMinResponse | None:
    if request.sk3_min_mva is None and request.ik3_min_ka is None:
        if request.rx_ratio_min is not None:
            raise OdmowaDanychError(
                "rx_ratio_min bez sk3_min_mva/ik3_min_ka nie ma zastosowania — scenariusz MIN "
                "bez własnej mocy zwarciowej liczy się z danych MAX."
            )
        return None
    if request.short_circuit_mode == "IMPEDANCE":
        raise OdmowaDanychError(
            "Tryb impedancyjny (R+jX) nie ma wariantu MIN: dane sk3_min_mva/ik3_min_ka/"
            "rx_ratio_min podaj w trybie mocy zwarciowej albo je usuń."
        )
    if request.sk3_min_mva is not None:
        sk_min_mva = request.sk3_min_mva
        tryb: Literal["MOC_ZWARCIOWA", "PRAD_ZWARCIOWY"] = "MOC_ZWARCIOWA"
    else:
        assert request.ik3_min_ka is not None
        sk_min_mva = moc_zwarciowa_z_pradu_mva(
            kv_na_v(request.voltage_kv), ka_na_a(request.ik3_min_ka)
        )
        tryb = "PRAD_ZWARCIOWY"
    if request.sk3_mva is not None and sk_min_mva > request.sk3_mva:
        raise OdmowaDanychError(
            f"Sk3 min ({sk_min_mva:g} MVA) przekracza Sk3 max ({request.sk3_mva:g} MVA) — dane "
            "scenariusza minimalnego muszą być nie większe niż maksymalnego."
        )
    rx_min: float | None
    rx_zrodlo: Literal["MODEL_MIN", "MODEL_MAX"]
    if request.rx_ratio_min is not None:
        rx_min, rx_zrodlo = request.rx_ratio_min, "MODEL_MIN"
    else:
        rx_min, rx_zrodlo = request.rx_ratio, "MODEL_MAX"
    wynik = compute_grid_source_preview(
        GridSourcePreviewInput(
            voltage_kv=request.voltage_kv,
            short_circuit_mode="SHORT_CIRCUIT_POWER",
            scenariusz="MIN",
            tolerancja_nn=_klasa_tolerancji(
                tolerancja_nn_napiecia(request.voltage_kv, request.lv_voltage_tolerance)
            ),
            sk3_mva=sk_min_mva,
            rx_ratio=rx_min,
            zero_sequence_enabled=request.zero_sequence_enabled,
            r0_ohm=request.r0_ohm,
            x0_ohm=request.x0_ohm,
            z0_z1_ratio=request.z0_z1_ratio,
            tk_s=request.tk_s,
        )
    )
    return GridSourcePreviewMinResponse(
        sk_mva=wynik.sk_mva,
        ik3_ka=wynik.ik3_ka,
        ik1_ka=wynik.ik1_ka,
        ip_ka=wynik.ip_ka,
        ith_ka=wynik.ith_ka,
        kappa=wynik.kappa,
        z1_ohm=ComplexOhmResponse(r_ohm=wynik.z1_ohm.real, x_ohm=wynik.z1_ohm.imag),
        z0_ohm=(
            ComplexOhmResponse(r_ohm=wynik.z0_ohm.real, x_ohm=wynik.z0_ohm.imag)
            if wynik.z0_ohm is not None
            else None
        ),
        tryb_danych=tryb,
        rx_ratio_zrodlo=rx_zrodlo,
    )


@router.post("/api/solver/grid-source-preview", response_model=GridSourcePreviewResponse)
def preview_grid_source_short_circuit(
    request: GridSourcePreviewRequest,
) -> GridSourcePreviewResponse:
    tolerancja_nn = tolerancja_nn_napiecia(request.voltage_kv, request.lv_voltage_tolerance)
    result = compute_grid_source_preview(
        GridSourcePreviewInput(
            voltage_kv=request.voltage_kv,
            short_circuit_mode=request.short_circuit_mode,
            scenariusz="MAX",
            tolerancja_nn=_klasa_tolerancji(tolerancja_nn),
            sk3_mva=request.sk3_mva,
            rx_ratio=request.rx_ratio,
            r_ohm=request.r_ohm,
            x_ohm=request.x_ohm,
            zero_sequence_enabled=request.zero_sequence_enabled,
            r0_ohm=request.r0_ohm,
            x0_ohm=request.x0_ohm,
            z0_z1_ratio=request.z0_z1_ratio,
            tk_s=request.tk_s,
        )
    )
    blok_min = _podglad_min(request)

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
        tolerancja_nn=tolerancja_nn.to_dict() if tolerancja_nn is not None else None,
        scenariusz_min=blok_min,
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
    result = compute_cable_rated_current(
        CableRatedCurrentInput(
            active_power_kw=request.active_power_kw,
            cos_phi=request.cos_phi,
            line_voltage_v=request.line_voltage_v,
        )
    )

    return CableRatedCurrentResponse(
        rated_current_a=result.rated_current_a,
        apparent_power_kva=result.apparent_power_kva,
        formula_ref=result.formula_ref,
        assumptions=list(result.assumptions),
    )


class OdcinekMagistraliRequest(BaseModel):
    """Odcinek magistrali SN z kreatora: typ z katalogu, długość, prąd roboczy, cosφ.

    Parametry R, X i obciążalność NIE przychodzą z klienta — backend czyta je z katalogu po
    `catalog_ref` (reguła katalogu). Pole puste = projektant nie podał wartości; ocena nazywa
    brak (`NIE_OCENIONO`), niczego nie zgaduje.
    """

    rodzaj: Literal["KABEL", "LINIA"]
    catalog_ref: str | None = None
    dlugosc_m: float | None = Field(default=None, gt=0)
    prad_roboczy_a: float | None = Field(default=None, gt=0)
    cos_phi: float = Field(gt=0, le=1)
    nazwa: str | None = None


class OcenaDoboruMagistraliRequest(BaseModel):
    """Ocena doboru przekroju odcinka bieżącego i ciągu (karta MAGISTRALA-OCENA).

    `odcinki_zbudowane` — odcinki zapisane wcześniej w tej sesji kreatora, w kolejności od
    startu ciągu; odcinek bieżący domyka ciąg.
    """

    napiecie_kv: float = Field(gt=0)
    odcinek: OdcinekMagistraliRequest
    odcinki_zbudowane: list[OdcinekMagistraliRequest] = Field(default_factory=list)


class SpadekOdcinkaMagistraliResponse(BaseModel):
    """Spadek napięcia odcinka bieżącego (WHITE BOX solvera) i prąd, przy którym policzony."""

    prad_obliczeniowy_a: float
    prad_z_obciazalnosci: bool
    delta_u_v: float
    delta_u_pct: float
    r_total_ohm: float
    x_total_ohm: float
    delta_u_resistive_v: float
    delta_u_reactive_v: float
    formula_ref: str
    assumptions: list[str]


class CiagMagistraliResponse(BaseModel):
    """Ciąg budowany w kreatorze: liczba odcinków, długość i spadek skumulowany (albo brak)."""

    liczba_odcinkow: int
    dlugosc_m: float | None
    delta_u_v: float | None
    delta_u_pct: float | None
    formula_ref: str | None
    assumptions: list[str]


class OcenaDoboruMagistraliResponse(BaseModel):
    """Podgląd liczb odcinka i ciągu + rekordy werdyktu wyjaśnialnego (poziom K).

    `oceny_odcinka`: obciążalność długotrwała i spadek napięcia odcinka bieżącego;
    `ocena_ciagu`: spadek skumulowany ciągu. Interfejs renderuje rekordy kartą werdyktu —
    nie liczy statusu, progu ani sumy.
    """

    spadek_odcinka: SpadekOdcinkaMagistraliResponse | None
    ciag: CiagMagistraliResponse
    oceny_odcinka: list[OcenaKryterium]
    ocena_ciagu: OcenaKryterium


def _odcinek_magistrali(odcinek: OdcinekMagistraliRequest) -> OdcinekMagistrali:
    return OdcinekMagistrali(
        rodzaj=odcinek.rodzaj,
        catalog_ref=odcinek.catalog_ref,
        dlugosc_m=odcinek.dlugosc_m,
        prad_roboczy_a=odcinek.prad_roboczy_a,
        cos_phi=odcinek.cos_phi,
        nazwa=odcinek.nazwa,
    )


@router.post(
    "/api/solver/trunk-sizing-assessment",
    response_model=OcenaDoboruMagistraliResponse,
)
def assess_trunk_sizing(request: OcenaDoboruMagistraliRequest) -> OcenaDoboruMagistraliResponse:
    """Ocena doboru przekroju odcinka i ciągu magistrali SN rekordami werdyktu wyjaśnialnego."""
    ocena = ocen_dobor_magistrali(
        napiecie_kv=request.napiecie_kv,
        odcinek=_odcinek_magistrali(request.odcinek),
        odcinki_zbudowane=[_odcinek_magistrali(o) for o in request.odcinki_zbudowane],
    )

    spadek = ocena.spadek_odcinka
    ciag = ocena.ciag
    return OcenaDoboruMagistraliResponse(
        spadek_odcinka=(
            SpadekOdcinkaMagistraliResponse(
                prad_obliczeniowy_a=spadek.prad_obliczeniowy_a,
                prad_z_obciazalnosci=spadek.prad_z_obciazalnosci,
                delta_u_v=spadek.wynik.delta_u_v,
                delta_u_pct=spadek.wynik.delta_u_pct,
                r_total_ohm=spadek.wynik.r_total_ohm,
                x_total_ohm=spadek.wynik.x_total_ohm,
                delta_u_resistive_v=spadek.wynik.delta_u_resistive_v,
                delta_u_reactive_v=spadek.wynik.delta_u_reactive_v,
                formula_ref=spadek.wynik.formula_ref,
                assumptions=list(spadek.wynik.assumptions),
            )
            if spadek is not None
            else None
        ),
        ciag=CiagMagistraliResponse(
            liczba_odcinkow=ciag.liczba_odcinkow,
            dlugosc_m=ciag.dlugosc_m,
            delta_u_v=ciag.spadek.delta_u_v if ciag.spadek is not None else None,
            delta_u_pct=ciag.spadek.delta_u_pct if ciag.spadek is not None else None,
            formula_ref=ciag.spadek.formula_ref if ciag.spadek is not None else None,
            assumptions=list(ciag.spadek.assumptions) if ciag.spadek is not None else [],
        ),
        oceny_odcinka=list(ocena.oceny_odcinka),
        ocena_ciagu=ocena.ocena_ciagu,
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
            raise OdmowaDanychError(
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
    derating = wspolczynniki_z_opisu(
        laying.set_name if laying is not None else None,
        f_grunt=laying.f_grunt if laying is not None else None,
        f_wiazka=laying.f_wiazka if laying is not None else None,
        f_grupa=laying.f_grupa if laying is not None else None,
        opis_pl=laying.opis_pl if laying is not None else None,
    )
    effective = obciazalnosc_skorygowana(request.rated_ampacity_a, derating)

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
    result = compute_transformer_rated_currents(
        TransformerRatedCurrentsInput(
            rated_power_kva=request.rated_power_kva,
            primary_voltage_kv=request.primary_voltage_kv,
            secondary_voltage_kv=request.secondary_voltage_kv,
        )
    )

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
    result = compute_shunt_compensator_preview(
        ShuntCompensatorPreviewInput(
            rated_mvar=request.rated_mvar,
            rated_kv=request.rated_kv,
        )
    )

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
    # Decyzja O-53: dziedzinę cosφ, k_j i k_obc sprawdza JEDNA funkcja domenowa
    # (`blad_wejsc_kontroli_mocy`, ta sama co w operacji dodania źródła) — nie osobne
    # ograniczenia pól, które dawniej przepuszczały k_j > 1 odrzucane potem przez operację.
    cos_phi: float | None = None
    inverter_output_kv: float = Field(gt=0)
    sn_bus_voltage_kv: float = Field(gt=0)
    cable_length_km: float = Field(gt=0)
    # Decyzja O-53: brak jawnego współczynnika = 1,0, element neutralny (bez redukcji i bez
    # ulgi) — ta sama stała co kontrola mocy operacji domenowych.
    simultaneity_factor: float = BEZ_REDUKCJI
    loadability_pu: float = BEZ_REDUKCJI
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


def _rejected_response(
    rejected: Sequence[RejectedCandidate],
) -> list[RejectedCandidateResponse]:
    return [
        RejectedCandidateResponse(
            catalog_ref=item.catalog_ref,
            name=item.name,
            reason_code=item.reason_code,
            reason_pl=item.reason_pl,
        )
        for item in rejected
    ]


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
        sets=[
            CableLayingConditionsSetResponse(**item)
            for item in cast(list[dict[str, Any]], view["sets"])
        ],
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

    ΣS liczy człon nastawy kontroli mocy O-53 (`moc_pozorna_z_nastawy_mva`: ΣP/cosφ).
    Podgląd nie zna karty jednostki ani liczby jednostek, więc człon S_n,jedn·n kontroli
    operacji nie wchodzi tu do wymagania — operacja dodania źródła sprawdza go osobno.
    Prąd znamionowy TR
    (strona SN) z D1 `rated_current_a`. Kabel i pole dobierane od prądu SN
    zaproponowanego TR (kaskada I_TR ≤ Iz ≤ In). Zero fizyki rozpływu/zwarcia.
    """
    odmowa = blad_wejsc_kontroli_mocy(
        JawneWejsciaKontroliMocy(
            cos_phi=request.cos_phi,
            wspolczynnik_jednoczesnosci=request.simultaneity_factor,
            przeciazalnosc_transformatora_pu=request.loadability_pu,
        )
    )
    if odmowa is not None:
        raise HTTPException(status_code=422, detail=odmowa.komunikat_pl)
    laying = request.laying_conditions
    sum_apparent_power_mva = moc_pozorna_z_nastawy_mva(request.sum_active_power_mw, request.cos_phi)
    wynik = dobierz_tor_der_sn(
        moc_pozorna_mva=sum_apparent_power_mva,
        napiecie_sn_kv=request.sn_bus_voltage_kv,
        napiecie_falownika_kv=request.inverter_output_kv,
        dlugosc_kabla_km=request.cable_length_km,
        nosnik_cos_phi=request,
        wspolczynnik_jednoczesnosci=request.simultaneity_factor,
        przeciazalnosc_pu=request.loadability_pu,
        rezerwa_transformatora_pu=request.transformer_reserve_pu,
        rezerwa_kabla_pu=request.cable_reserve_pu,
        rezerwa_pola_pu=request.field_reserve_pu,
        maks_spadek_napiecia_pct=request.max_delta_u_pct,
        charakter_mocy_biernej=request.reactive_character,
        ulozenie=(
            OpisUlozeniaKabla(
                set_name=laying.set_name,
                f_grunt=laying.f_grunt,
                f_wiazka=laying.f_wiazka,
                f_grupa=laying.f_grupa,
                opis_pl=laying.opis_pl,
            )
            if laying is not None
            else None
        ),
    )
    tr_result = wynik.transformator

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
    cable_result = wynik.kabel
    field_result = wynik.aparat_pola
    transformer_current_a = wynik.prad_transformatora_a
    if cable_result is None or field_result is None or transformer_current_a is None:
        return DerSelectionPreviewResponse(
            sum_apparent_power_mva=sum_apparent_power_mva,
            transformer_current_a=None,
            transformer=transformer_response,
            cable=None,
            field_apparatus=None,
        )

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
