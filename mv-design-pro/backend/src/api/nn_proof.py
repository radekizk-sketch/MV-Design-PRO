"""API pakietu dowodowego weryfikacji obwodu nN (karta P0.10, G-21).

Endpoint jest ORKIESTRACJĄ WARSTWY API — czyta model ENM (``enm.store``, ta
sama przestrzeń ``case_id`` co pozostałe endpointy nN pod ``/api/cases/{case_id}/
enm/...``), woła REUSE dostawców (``cable_ampacity_derating.wspolczynniki_nn``,
``conductor_thermal_withstand.check_conductor_thermal_withstand``,
``lv_circuit_verification_binding.zbuduj_wejscie_dowodu_obwodu_nn``) i pakuje
wynik do ZIP przez ``ProofPackBuilder`` (REUSE, ta sama mechanika co wszystkie
inne pakiety dowodowe). ZERO fizyki tutaj — endpoint tylko składa wejście.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from application.proof_engine.lv_circuit_verification_binding import (
    zbuduj_wejscie_dowodu_obwodu_nn,
)
from application.proof_engine.packs.lv_circuit_verification import (
    LVCircuitVerificationProofPack,
    serialize_lv_circuit_verification_pack,
)
from application.proof_engine.proof_pack import ProofPackContext, resolve_mv_design_pro_version
from enm.store import get_enm
from fastapi import APIRouter, HTTPException, Response, status
from network_model.solvers.cable_ampacity_derating import wspolczynniki_nn
from network_model.solvers.conductor_thermal_withstand import (
    ConductorThermalInput,
    check_conductor_thermal_withstand,
)
from pydantic import BaseModel

router = APIRouter(prefix="/api/nn-proof", tags=["nn-proof"])


class LVCircuitVerificationPackRequest(BaseModel):
    """Wejście pakietu dowodowego weryfikacji obwodu nN.

    Grupuje parametry wg dostawcy: (1) tożsamość pakietu/kontekst, (2) obwód w
    modelu ENM (``case_id`` — ta sama przestrzeń co ``/api/cases/{case_id}/
    enm/...``), (3) dane mocy dla Ib, (4) warunki ułożenia G-D1 dla Iz′ (REUSE
    ``wspolczynniki_nn``), (5) Ik″max w punkcie zabudowy (osobny bieg zwarciowy
    — parametr wejściowy, wzorzec ``nn_device_selection``), (6) dane cieplne
    I²t (REUSE ``check_conductor_thermal_withstand``), (7) ΔU (REUSE pakietu
    VDROP / ``vdrop_chain_binding`` — headline U_source/ΔU_total).
    """

    # (1) Tożsamość pakietu
    project_id: str
    case_id: str
    run_id: str
    snapshot_id: str
    project_name: str
    case_name: str
    run_timestamp: datetime
    solver_version: str = "lv-circuit-verification-1.0"

    # (2) Obwód w modelu ENM
    station_ref: str
    bus_ref: str
    breaker_ref: str
    segment_ref: str
    apparatus_branch_ref: str | None = None

    # (3) Dane mocy dla Ib (kroki 1-2)
    p_mw: float
    q_mvar: float
    u_ll_kv: float

    # (4) Warunki ułożenia G-D1 dla Iz′ (krok 3, REUSE wspolczynniki_nn)
    iz_katalogowe_a: float
    srodowisko: Literal["powietrze", "grunt"]
    izolacja: Literal["PVC", "XLPE"]
    temperatura_c: float
    liczba_obwodow: int
    rezystywnosc_gruntu_km_w: float | None = None

    # (5) Ik″max w punkcie zabudowy (krok 6) — osobny bieg zwarciowy IEC 60909
    ik_max_ka: float | None = None

    # (6) Dane cieplne I²t≤k²S² (krok 7, REUSE check_conductor_thermal_withstand)
    ith_a: float | None = None
    fault_duration_s: float | None = None
    ith_1s_a: float | None = None
    jth_1s_a_per_mm2: float | None = None
    cross_section_mm2: float | None = None
    conductor_material: str | None = None
    temp_operating_c: float | None = None
    temp_short_circuit_c: float | None = None

    # (7) ΔU dowód — headline (krok 8, REUSE pakietu VDROP/vdrop_chain_binding)
    vdrop_u_source_kv: float
    vdrop_delta_u_total_kv: float
    vdrop_delta_u_total_percent: float | None = None


@router.post("/circuit/pack")
def download_lv_circuit_verification_pack(payload: LVCircuitVerificationPackRequest) -> Response:
    """Pakiet dowodowy LV_CIRCUIT_VERIFICATION (ZIP) dla obwodu nN.

    10 kroków (Ib → Iz′ → dobór → I2 → zdolność wyłączania → I²t → ΔU →
    Ik1_min → SWZ), Formula→Data→Substitution→Result→Unit, deterministyczny
    dla identycznego modelu ENM i identycznych parametrów wejściowych.
    """
    enm = get_enm(payload.case_id)

    wspolczynniki = wspolczynniki_nn(
        srodowisko=payload.srodowisko,
        izolacja=payload.izolacja,
        temperatura_c=payload.temperatura_c,
        liczba_obwodow=payload.liczba_obwodow,
        rezystywnosc_gruntu_km_w=payload.rezystywnosc_gruntu_km_w,
    )
    thermal = check_conductor_thermal_withstand(
        ConductorThermalInput(
            ith_a=payload.ith_a,
            fault_duration_s=payload.fault_duration_s,
            ith_1s_a=payload.ith_1s_a,
            jth_1s_a_per_mm2=payload.jth_1s_a_per_mm2,
            cross_section_mm2=payload.cross_section_mm2,
            conductor_material=payload.conductor_material,
            temp_operating_c=payload.temp_operating_c,
            temp_short_circuit_c=payload.temp_short_circuit_c,
        )
    )

    try:
        wynik = zbuduj_wejscie_dowodu_obwodu_nn(
            enm=enm,
            station_ref=payload.station_ref,
            bus_ref=payload.bus_ref,
            breaker_ref=payload.breaker_ref,
            segment_ref=payload.segment_ref,
            project_name=payload.project_name,
            case_name=payload.case_name,
            run_timestamp=payload.run_timestamp,
            solver_version=payload.solver_version,
            p_mw=payload.p_mw,
            q_mvar=payload.q_mvar,
            u_ll_kv=payload.u_ll_kv,
            iz_katalogowe_a=payload.iz_katalogowe_a,
            wspolczynniki=wspolczynniki,
            ik_max_ka=payload.ik_max_ka,
            thermal=thermal,
            vdrop_u_source_kv=payload.vdrop_u_source_kv,
            vdrop_delta_u_total_kv=payload.vdrop_delta_u_total_kv,
            vdrop_delta_u_total_percent=payload.vdrop_delta_u_total_percent,
            apparatus_branch_ref=payload.apparatus_branch_ref,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Nie udało się złożyć dowodu obwodu nN: {exc}",
        ) from exc

    if wynik["status"] != "OK":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                wynik.get("reason_pl")
                or f"Brak danych do pakietu dowodowego: {', '.join(wynik.get('missing_data', []))}"
            ),
        )

    context = ProofPackContext(
        project_id=payload.project_id,
        case_id=payload.case_id,
        run_id=payload.run_id,
        snapshot_id=payload.snapshot_id,
        mv_design_pro_version=resolve_mv_design_pro_version(),
    )
    content = LVCircuitVerificationProofPack.generate_zip(wynik["wejscie"], context)
    headers = {
        "Content-Disposition": (
            f'attachment; filename="pakiet_dowodowy_obwod_nn__{payload.segment_ref}.zip"'
        )
    }
    return Response(content=content, media_type="application/zip", headers=headers)


@router.post("/circuit/preview")
def preview_lv_circuit_verification_pack(payload: LVCircuitVerificationPackRequest) -> dict:
    """Podgląd JSON pakietu (bez ZIP) — do prezentacji w UI (kroki + podsumowanie)."""
    enm = get_enm(payload.case_id)

    wspolczynniki = wspolczynniki_nn(
        srodowisko=payload.srodowisko,
        izolacja=payload.izolacja,
        temperatura_c=payload.temperatura_c,
        liczba_obwodow=payload.liczba_obwodow,
        rezystywnosc_gruntu_km_w=payload.rezystywnosc_gruntu_km_w,
    )
    thermal = check_conductor_thermal_withstand(
        ConductorThermalInput(
            ith_a=payload.ith_a,
            fault_duration_s=payload.fault_duration_s,
            ith_1s_a=payload.ith_1s_a,
            jth_1s_a_per_mm2=payload.jth_1s_a_per_mm2,
            cross_section_mm2=payload.cross_section_mm2,
            conductor_material=payload.conductor_material,
            temp_operating_c=payload.temp_operating_c,
            temp_short_circuit_c=payload.temp_short_circuit_c,
        )
    )

    try:
        wynik = zbuduj_wejscie_dowodu_obwodu_nn(
            enm=enm,
            station_ref=payload.station_ref,
            bus_ref=payload.bus_ref,
            breaker_ref=payload.breaker_ref,
            segment_ref=payload.segment_ref,
            project_name=payload.project_name,
            case_name=payload.case_name,
            run_timestamp=payload.run_timestamp,
            solver_version=payload.solver_version,
            p_mw=payload.p_mw,
            q_mvar=payload.q_mvar,
            u_ll_kv=payload.u_ll_kv,
            iz_katalogowe_a=payload.iz_katalogowe_a,
            wspolczynniki=wspolczynniki,
            ik_max_ka=payload.ik_max_ka,
            thermal=thermal,
            vdrop_u_source_kv=payload.vdrop_u_source_kv,
            vdrop_delta_u_total_kv=payload.vdrop_delta_u_total_kv,
            vdrop_delta_u_total_percent=payload.vdrop_delta_u_total_percent,
            apparatus_branch_ref=payload.apparatus_branch_ref,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Nie udało się złożyć dowodu obwodu nN: {exc}",
        ) from exc

    if wynik["status"] != "OK":
        return wynik

    document = LVCircuitVerificationProofPack.generate(wynik["wejscie"])
    return serialize_lv_circuit_verification_pack(document)


class LVCircuitReportRequest(BaseModel):
    """Sekcje nN raportu (karta P0.10 §0.4, zakres minimalny P0).

    Provenance (``run_id``/``revision_id``/``przypadek_decydujacy``) jest
    PARAMETREM WEJŚCIOWYM — analizy nN nie są persystowane jako ``AnalysisRun``
    (zob. docstring ``build_nn_circuit_report_section``), więc nie ma obiektu
    przebiegu, z którego dałoby się je odczytać.
    """

    case_id: str
    station_ref: str
    bus_ref: str
    breaker_ref: str
    run_id: str
    revision_id: str
    przypadek_decydujacy: str
    ib_a: float | None = None
    iz_prime_a: float | None = None
    ik_max_ka: float | None = None
    vdrop_u_source_kv: float | None = None
    vdrop_delta_u_total_kv: float | None = None


@router.post("/circuit/report")
def build_lv_circuit_report(payload: LVCircuitReportRequest) -> dict[str, Any]:
    """Sekcje nN raportu dla obwodu (dane źródłowe, TR, odcinki, ΔU, Ik max/min,
    SWZ, dobór) — zakres minimalny P0 (karta P0.10 §0.4, pełny spis §63 w P1).
    """
    from api.analysis_run_exports import build_nn_circuit_report_section

    enm = get_enm(payload.case_id)
    return build_nn_circuit_report_section(
        enm=enm,
        station_ref=payload.station_ref,
        bus_ref=payload.bus_ref,
        breaker_ref=payload.breaker_ref,
        run_id=payload.run_id,
        revision_id=payload.revision_id,
        przypadek_decydujacy=payload.przypadek_decydujacy,
        ib_a=payload.ib_a,
        iz_prime_a=payload.iz_prime_a,
        ik_max_ka=payload.ik_max_ka,
        vdrop_u_source_kv=payload.vdrop_u_source_kv,
        vdrop_delta_u_total_kv=payload.vdrop_delta_u_total_kv,
    )
