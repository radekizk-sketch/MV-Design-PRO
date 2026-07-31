"""Koncowki czterech kryteriow WYPOSAZENIA stacji (karta KD-3).

Warstwa koncowki robi DOKLADNIE dwie rzeczy:
  1. WIAZANIE KATALOGOWE — zamienia ``catalog_ref`` na wielkosci znamionowe
     (CLAUDE.md §10: dane znamionowe wylacznie z katalogu, zero wstrzykiwania
     parametrow z zewnatrz);
  2. przekazanie danych OBWODU (podanych przez projektanta) do solvera i zwrot
     jego wyniku 1:1 — bez zadnego rachunku po drodze.

Fizyka zostaje w `network_model/solvers/equipment_checks/**`. Odpowiedz niesie
slad WHITE BOX, zalozenia i kody gotowosci, wiec UI moze byc czystym readoutem.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from network_model.catalog.repository import get_default_mv_catalog
from network_model.solvers.equipment_checks.cable_thermal_aging import (
    CableThermalAgingInput,
    check_cable_thermal_aging,
)
from network_model.solvers.equipment_checks.ct_burden_saturation import (
    CtBurdenInput,
    CtDeviceBurden,
    alf_z_klasy,
    check_ct_burden_saturation,
)
from network_model.solvers.equipment_checks.transformer_losses import (
    TransformerLossesInput,
    compute_transformer_losses,
)
from network_model.solvers.equipment_checks.vt_burden_voltage_drop import (
    VtBurdenInput,
    VtDeviceBurden,
    check_vt_burden_voltage_drop,
    kategoria_z_klasy,
)
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/solver", tags=["equipment-checks"])


class ObciazenieAparatu(BaseModel):
    """Pojedyncze obciazenie obwodu wtornego podane przez projektanta."""

    nazwa: str
    moc_va: float = Field(ge=0.0)


class SladKroku(BaseModel):
    """Krok sladu WHITE BOX (kanon pieciu pol)."""

    step: int
    key: str
    title: str
    formula_latex: str
    inputs: dict[str, Any]
    substitution: str = ""
    result: dict[str, Any]
    notes: str = ""


# ---------------------------------------------------------------------------
# Bilans wtorny i nasycenie CT
# ---------------------------------------------------------------------------


class CtBurdenRequest(BaseModel):
    """Wejscie bilansu CT: pozycja katalogowa + obwod wtorny."""

    ct_catalog_ref: str
    dlugosc_przewodu_m: float | None = Field(default=None, gt=0)
    przekroj_przewodu_mm2: float | None = Field(default=None, gt=0)
    obciazenia_aparatow: list[ObciazenieAparatu] = Field(default_factory=list)
    alf_wymagany: float | None = Field(default=None, gt=0)
    moc_stykow_va: float | None = Field(default=None, ge=0)


class CtBurdenResponse(BaseModel):
    status: str
    status_obciazenia: str
    status_nasycenia: str
    rezystancja_przewodow_ohm: float | None = None
    moc_przewodow_va: float | None = None
    moc_aparatow_va: float | None = None
    moc_stykow_va: float | None = None
    moc_obliczeniowa_va: float | None = None
    moc_wewnetrzna_va: float | None = None
    wykorzystanie_mocy: float | None = None
    alf_efektywny: float | None = None
    zapas_alf: float | None = None
    wariant_alf: str | None = None
    readiness_codes: list[str] = Field(default_factory=list)
    formula_ref: str
    assumptions: list[str] = Field(default_factory=list)
    white_box_trace: list[SladKroku] = Field(default_factory=list)
    # Echo danych katalogowych — projektant musi widziec, CZYM policzono werdykt.
    pozycja_katalogowa: str
    klasa_dokladnosci: str | None = None
    moc_znamionowa_va: float | None = None
    prad_wtorny_znamionowy_a: float | None = None


@router.post("/ct-burden-check", response_model=CtBurdenResponse)
def sprawdz_bilans_ct(request: CtBurdenRequest) -> CtBurdenResponse:
    """Bilans mocy wtornej i nasycenie przekladnika pradowego (IEC 61869-2)."""
    katalog = get_default_mv_catalog()
    pozycja = katalog.ct_types.get(request.ct_catalog_ref)
    if pozycja is None:
        raise HTTPException(
            status_code=404,
            detail=f"Pozycja katalogowa przekładnika prądowego '{request.ct_catalog_ref}' "
            "nie istnieje.",
        )

    wynik = check_ct_burden_saturation(
        CtBurdenInput(
            i2n_a=pozycja.ratio_secondary_a,
            sn_va=pozycja.burden_va,
            alf=alf_z_klasy(pozycja.accuracy_class),
            dlugosc_przewodu_m=request.dlugosc_przewodu_m,
            przekroj_przewodu_mm2=request.przekroj_przewodu_mm2,
            obciazenia_aparatow=tuple(
                CtDeviceBurden(nazwa=o.nazwa, moc_va=o.moc_va) for o in request.obciazenia_aparatow
            ),
            rct_ohm=pozycja.rct_ohm,
            alf_wymagany=request.alf_wymagany,
            moc_stykow_va=request.moc_stykow_va,
        )
    )

    return CtBurdenResponse(
        status=wynik.status,
        status_obciazenia=wynik.status_obciazenia,
        status_nasycenia=wynik.status_nasycenia,
        rezystancja_przewodow_ohm=wynik.rezystancja_przewodow_ohm,
        moc_przewodow_va=wynik.moc_przewodow_va,
        moc_aparatow_va=wynik.moc_aparatow_va,
        moc_stykow_va=wynik.moc_stykow_va,
        moc_obliczeniowa_va=wynik.moc_obliczeniowa_va,
        moc_wewnetrzna_va=wynik.moc_wewnetrzna_va,
        wykorzystanie_mocy=wynik.wykorzystanie_mocy,
        alf_efektywny=wynik.alf_efektywny,
        zapas_alf=wynik.zapas_alf,
        wariant_alf=wynik.wariant_alf,
        readiness_codes=list(wynik.readiness_codes),
        formula_ref=wynik.formula_ref,
        assumptions=list(wynik.assumptions),
        white_box_trace=[SladKroku(**krok) for krok in wynik.white_box_trace],
        pozycja_katalogowa=pozycja.name,
        klasa_dokladnosci=pozycja.accuracy_class,
        moc_znamionowa_va=pozycja.burden_va,
        prad_wtorny_znamionowy_a=pozycja.ratio_secondary_a,
    )


# ---------------------------------------------------------------------------
# Bilans wtorny i ΔU obwodu VT
# ---------------------------------------------------------------------------


class VtBurdenRequest(BaseModel):
    """Wejscie bilansu VT: pozycja katalogowa + wybrane uzwojenie + obwod."""

    vt_catalog_ref: str
    #: Ktore uzwojenie sprawdzamy. Przekladnik dwuuzwojeniowy niesie DWIE klasy
    #: (``accuracy_class`` zabezpieczeniowa, ``accuracy_class_metering`` pomiarowa)
    #: — kategoria wynika z klasy TEGO uzwojenia, nie z domyslu.
    uzwojenie: Literal["POMIAROWE", "ZABEZPIECZENIOWE"] = "POMIAROWE"
    dlugosc_przewodu_m: float | None = Field(default=None, gt=0)
    przekroj_przewodu_mm2: float | None = Field(default=None, gt=0)
    obciazenia_aparatow: list[ObciazenieAparatu] = Field(default_factory=list)
    moc_stykow_va: float | None = Field(default=None, ge=0)


class VtBurdenResponse(BaseModel):
    status: str
    status_obciazenia: str
    status_spadku: str
    rezystancja_przewodow_ohm: float | None = None
    moc_aparatow_va: float | None = None
    moc_stykow_va: float | None = None
    moc_obliczeniowa_va: float | None = None
    wykorzystanie_mocy: float | None = None
    prad_obwodu_a: float | None = None
    delta_u_v: float | None = None
    delta_u_procent: float | None = None
    limit_delta_u_procent: float | None = None
    kategoria_uzwojenia: str | None = None
    readiness_codes: list[str] = Field(default_factory=list)
    formula_ref: str
    assumptions: list[str] = Field(default_factory=list)
    white_box_trace: list[SladKroku] = Field(default_factory=list)
    pozycja_katalogowa: str
    klasa_dokladnosci: str | None = None
    moc_znamionowa_va: float | None = None
    napiecie_wtorne_v: float | None = None


@router.post("/vt-burden-check", response_model=VtBurdenResponse)
def sprawdz_bilans_vt(request: VtBurdenRequest) -> VtBurdenResponse:
    """Bilans mocy wtornej i zmiana napiecia obwodu VT (IEC 61869-3)."""
    katalog = get_default_mv_catalog()
    pozycja = katalog.vt_types.get(request.vt_catalog_ref)
    if pozycja is None:
        raise HTTPException(
            status_code=404,
            detail=f"Pozycja katalogowa przekładnika napięciowego '{request.vt_catalog_ref}' "
            "nie istnieje.",
        )

    # Klasa TEGO uzwojenia: przekladnik dwuuzwojeniowy niesie obie. Gdy katalog nie
    # podaje klasy pomiarowej osobno, uzwojenie pomiarowe opisuje `accuracy_class`.
    if request.uzwojenie == "POMIAROWE":
        klasa = pozycja.accuracy_class_metering or pozycja.accuracy_class
    else:
        klasa = pozycja.accuracy_class

    wynik = check_vt_burden_voltage_drop(
        VtBurdenInput(
            u2n_v=pozycja.ratio_secondary_v,
            sn_va=pozycja.burden_va,
            kategoria_uzwojenia=kategoria_z_klasy(klasa),
            dlugosc_przewodu_m=request.dlugosc_przewodu_m,
            przekroj_przewodu_mm2=request.przekroj_przewodu_mm2,
            obciazenia_aparatow=tuple(
                VtDeviceBurden(nazwa=o.nazwa, moc_va=o.moc_va) for o in request.obciazenia_aparatow
            ),
            moc_stykow_va=request.moc_stykow_va,
        )
    )

    return VtBurdenResponse(
        status=wynik.status,
        status_obciazenia=wynik.status_obciazenia,
        status_spadku=wynik.status_spadku,
        rezystancja_przewodow_ohm=wynik.rezystancja_przewodow_ohm,
        moc_aparatow_va=wynik.moc_aparatow_va,
        moc_stykow_va=wynik.moc_stykow_va,
        moc_obliczeniowa_va=wynik.moc_obliczeniowa_va,
        wykorzystanie_mocy=wynik.wykorzystanie_mocy,
        prad_obwodu_a=wynik.prad_obwodu_a,
        delta_u_v=wynik.delta_u_v,
        delta_u_procent=wynik.delta_u_procent,
        limit_delta_u_procent=wynik.limit_delta_u_procent,
        kategoria_uzwojenia=wynik.kategoria_uzwojenia,
        readiness_codes=list(wynik.readiness_codes),
        formula_ref=wynik.formula_ref,
        assumptions=list(wynik.assumptions),
        white_box_trace=[SladKroku(**krok) for krok in wynik.white_box_trace],
        pozycja_katalogowa=pozycja.name,
        klasa_dokladnosci=klasa,
        moc_znamionowa_va=pozycja.burden_va,
        napiecie_wtorne_v=pozycja.ratio_secondary_v,
    )


# ---------------------------------------------------------------------------
# Starzenie termiczne izolacji kabla
# ---------------------------------------------------------------------------


class CableAgingRequest(BaseModel):
    cable_catalog_ref: str
    temperatura_pracy_c: float | None = None


class CableAgingResponse(BaseModel):
    status: str
    roznica_temperatur_c: float | None = None
    wspolczynnik_starzenia: float | None = None
    wzgledna_zywotnosc: float | None = None
    temperatura_znamionowa_c: float | None = None
    typ_izolacji: str | None = None
    readiness_codes: list[str] = Field(default_factory=list)
    formula_ref: str
    assumptions: list[str] = Field(default_factory=list)
    white_box_trace: list[SladKroku] = Field(default_factory=list)
    pozycja_katalogowa: str


@router.post("/cable-thermal-aging", response_model=CableAgingResponse)
def sprawdz_starzenie_kabla(request: CableAgingRequest) -> CableAgingResponse:
    """Wzgledne starzenie izolacji kabla (regula Montsingera)."""
    katalog = get_default_mv_catalog()
    pozycja_sn = katalog.cable_types.get(request.cable_catalog_ref)
    pozycja_nn = katalog.lv_cable_types.get(request.cable_catalog_ref)
    if pozycja_sn is None and pozycja_nn is None:
        raise HTTPException(
            status_code=404,
            detail=f"Pozycja katalogowa kabla '{request.cable_catalog_ref}' nie istnieje.",
        )

    if pozycja_sn is not None:
        nazwa = pozycja_sn.name
        izolacja = pozycja_sn.insulation_type
        # Kable nN katalogu nie niosa temperatury znamionowej — wtedy kryterium
        # konczy sie kodem gotowosci, a nie temperatura wywnioskowana z izolacji.
        temperatura_znamionowa: float | None = pozycja_sn.max_temperature_c
    else:
        assert pozycja_nn is not None
        nazwa = pozycja_nn.name
        izolacja = pozycja_nn.insulation_type
        temperatura_znamionowa = None

    wynik = check_cable_thermal_aging(
        CableThermalAgingInput(
            temperatura_pracy_c=request.temperatura_pracy_c,
            temperatura_znamionowa_c=temperatura_znamionowa,
            typ_izolacji=izolacja,
        )
    )

    return CableAgingResponse(
        status=wynik.status,
        roznica_temperatur_c=wynik.roznica_temperatur_c,
        wspolczynnik_starzenia=wynik.wspolczynnik_starzenia,
        wzgledna_zywotnosc=wynik.wzgledna_zywotnosc,
        temperatura_znamionowa_c=wynik.temperatura_znamionowa_c,
        typ_izolacji=wynik.typ_izolacji,
        readiness_codes=list(wynik.readiness_codes),
        formula_ref=wynik.formula_ref,
        assumptions=list(wynik.assumptions),
        white_box_trace=[SladKroku(**krok) for krok in wynik.white_box_trace],
        pozycja_katalogowa=nazwa,
    )


# ---------------------------------------------------------------------------
# Straty transformatora
# ---------------------------------------------------------------------------


class TransformerLossesRequest(BaseModel):
    transformer_catalog_ref: str
    beta: float | None = Field(default=None, gt=0)


class TransformerLossesResponse(BaseModel):
    status: str
    straty_jalowe_kw: float | None = None
    straty_obciazeniowe_kw: float | None = None
    straty_calkowite_kw: float | None = None
    beta: float | None = None
    beta_optymalny: float | None = None
    straty_przy_beta_opt_kw: float | None = None
    moc_obciazenia_mva: float | None = None
    udzial_strat_jalowych: float | None = None
    readiness_codes: list[str] = Field(default_factory=list)
    formula_ref: str
    assumptions: list[str] = Field(default_factory=list)
    white_box_trace: list[SladKroku] = Field(default_factory=list)
    pozycja_katalogowa: str
    moc_znamionowa_mva: float | None = None


@router.post("/transformer-losses", response_model=TransformerLossesResponse)
def policz_straty_transformatora(request: TransformerLossesRequest) -> TransformerLossesResponse:
    """Straty transformatora i optymalny wspolczynnik obciazenia."""
    katalog = get_default_mv_catalog()
    pozycja = katalog.transformer_types.get(request.transformer_catalog_ref)
    if pozycja is None:
        raise HTTPException(
            status_code=404,
            detail=f"Pozycja katalogowa transformatora '{request.transformer_catalog_ref}' "
            "nie istnieje.",
        )

    wynik = compute_transformer_losses(
        TransformerLossesInput(
            p0_kw=pozycja.p0_kw,
            pk_kw=pozycja.pk_kw,
            beta=request.beta,
            sn_mva=pozycja.rated_power_mva,
        )
    )

    return TransformerLossesResponse(
        status=wynik.status,
        straty_jalowe_kw=wynik.straty_jalowe_kw,
        straty_obciazeniowe_kw=wynik.straty_obciazeniowe_kw,
        straty_calkowite_kw=wynik.straty_calkowite_kw,
        beta=wynik.beta,
        beta_optymalny=wynik.beta_optymalny,
        straty_przy_beta_opt_kw=wynik.straty_przy_beta_opt_kw,
        moc_obciazenia_mva=wynik.moc_obciazenia_mva,
        udzial_strat_jalowych=wynik.udzial_strat_jalowych,
        readiness_codes=list(wynik.readiness_codes),
        formula_ref=wynik.formula_ref,
        assumptions=list(wynik.assumptions),
        white_box_trace=[SladKroku(**krok) for krok in wynik.white_box_trace],
        pozycja_katalogowa=pozycja.name,
        moc_znamionowa_mva=pozycja.rated_power_mva,
    )
