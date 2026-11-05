"""API pakietu dowodowego weryfikacji obwodu nN (karta P0.10, G-21).

Endpoint jest ORKIESTRACJĄ WARSTWY API — czyta model ENM (``enm.store``, ta
sama przestrzeń ``case_id`` co pozostałe endpointy nN pod ``/api/cases/{case_id}/
enm/...``), woła REUSE dostawców (``cable_ampacity_derating.wspolczynniki_nn``,
``conductor_thermal_withstand.check_conductor_thermal_withstand``,
``lv_circuit_verification_binding.zbuduj_wejscie_dowodu_obwodu_nn``) i pakuje
wynik do ZIP przez ``ProofPackBuilder`` (REUSE, ta sama mechanika co wszystkie
inne pakiety dowodowe). ZERO fizyki tutaj — endpoint tylko wskazuje model i bieg;
wejście z modelu składa ``nn_circuit_sheet.wejscie_dowodu_obwodu_nn_z_modelu``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from api.klucz_twin_dep import klucz_twin_z_sciezki
from api.odmowa_http import OdmowaHttpError
from application.analyses.nn_circuit_sheet import wejscie_dowodu_obwodu_nn_z_modelu
from application.proof_engine.packs.lv_circuit_verification import (
    LVCircuitVerificationProofPack,
    serialize_lv_circuit_verification_pack,
)
from application.proof_engine.proof_pack import ProofPackContext, resolve_mv_design_pro_version
from enm.store import get_enm
from fastapi import APIRouter, HTTPException, Request, Response, status
from network_model.odmowa_danych import OdmowaDanychError
from pydantic import BaseModel, ConfigDict

router = APIRouter(prefix="/api/nn-proof", tags=["nn-proof"])


class LVCircuitVerificationPackRequest(BaseModel):
    """Wejście pakietu dowodowego weryfikacji obwodu nN.

    Karta EDYTOR-DELT-SCENARIUSZA-ZABEZPIECZEN (6a): żądanie niesie wyłącznie tożsamość
    pakietu, obwód w modelu ENM i dane, których model nie przechowuje (P/Q obwodu dla Ib,
    ΔU całkowite z pakietu VDROP). Napięcie, obciążalność i warunki ułożenia, dane cieplne
    przewodu, I″k i κ oraz czas wyłączenia pochodzą z MODELU i BIEGU zwarciowego
    (`nn_circuit_sheet.wejscie_dowodu_obwodu_nn_z_modelu`). ``short_circuit_run_id`` pominięty
    — najnowszy zakończony bieg zwarciowy przypadku (scenariusz MAX, zwarcie metaliczne);
    brak biegu = kryterium cieplne i zdolność wyłączania nieocenione, z akcją naprawczą.
    Pole spoza kontraktu (dawne ``u_ll_kv``, ``fault_duration_s``…) to 422, nie cicha ignorancja.
    """

    model_config = ConfigDict(extra="forbid")

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

    # (3) Bieg zwarciowy, z którego biorą się I″k i κ punktu
    short_circuit_run_id: str | None = None

    # (4) Dane mocy dla Ib (kroki 1-2)
    p_mw: float
    q_mvar: float

    # (5) ΔU dowód — headline (krok 8, REUSE pakietu VDROP/vdrop_chain_binding)
    vdrop_delta_u_total_kv: float
    vdrop_delta_u_total_percent: float | None = None


def _bieg_zwarciowy_dowodu(case_id: str, run_id: str | None) -> Any | None:
    """Bieg zwarciowy dowodu: wskazany (walidacja jak w arkuszu nN) albo najnowszy zakończony
    bieg przypadku w zakresie IEC 60909 o scenariuszu MAX (wytrzymałość cieplna przewodu
    i zdolność wyłączania ocenia się przy prądzie maksymalnym)."""
    from api.enm import _resolve_run_for_sheet
    from application.autorytet_biegu_zwarciowego import bieg_w_zakresie_iec60909
    from enm.canonical_analysis import list_runs_for_case, scenariusz_biegu_zwarciowego

    if run_id is not None:
        return _resolve_run_for_sheet(
            case_id=case_id,
            run_id=run_id,
            param_name="short_circuit_run_id",
            expected_analysis_type="short_circuit_sn",
        )
    kandydaci = [
        bieg
        for bieg in list_runs_for_case(case_id)
        if bieg.analysis_type == "short_circuit_sn"
        and bieg.status == "FINISHED"
        and bieg_w_zakresie_iec60909(bieg)
        and scenariusz_biegu_zwarciowego(bieg) == "MAX"
    ]
    return max(kandydaci, key=lambda b: (b.created_at, str(b.id))) if kandydaci else None


def _wejscie_dowodu(payload: LVCircuitVerificationPackRequest, request: Request) -> dict[str, Any]:
    """Wejście dowodu z modelu i biegu; model = migawka biegu (prąd i aparat z jednego stanu
    sieci), bez biegu — model bieżący przypadku."""
    from api.enm import _model_biegu

    bieg = _bieg_zwarciowy_dowodu(payload.case_id, payload.short_circuit_run_id)
    enm = (
        _model_biegu(bieg)
        if bieg is not None
        else get_enm(klucz_twin_z_sciezki(payload.case_id, request))
    )
    try:
        return wejscie_dowodu_obwodu_nn_z_modelu(
            enm=enm,
            short_circuit_run=bieg,
            station_ref=payload.station_ref,
            bus_ref=payload.bus_ref,
            breaker_ref=payload.breaker_ref,
            segment_ref=payload.segment_ref,
            apparatus_branch_ref=payload.apparatus_branch_ref,
            project_name=payload.project_name,
            case_name=payload.case_name,
            run_timestamp=payload.run_timestamp,
            solver_version=payload.solver_version,
            p_mw=payload.p_mw,
            q_mvar=payload.q_mvar,
            vdrop_delta_u_total_kv=payload.vdrop_delta_u_total_kv,
            vdrop_delta_u_total_percent=payload.vdrop_delta_u_total_percent,
        )
    except OdmowaDanychError as exc:
        raise OdmowaHttpError(
            exc,
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            prefiks="Nie udało się złożyć dowodu obwodu nN",
        ) from exc


@router.post("/circuit/pack")
def download_lv_circuit_verification_pack(
    payload: LVCircuitVerificationPackRequest, request: Request
) -> Response:
    """Pakiet dowodowy LV_CIRCUIT_VERIFICATION (ZIP) dla obwodu nN.

    10 kroków (Ib → Iz′ → dobór → I2 → zdolność wyłączania → I²t → ΔU →
    Ik1_min → SWZ), Formula→Data→Substitution→Result→Unit, deterministyczny
    dla identycznego modelu ENM, biegu i parametrów wejściowych.
    """
    wynik = _wejscie_dowodu(payload, request)
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
def preview_lv_circuit_verification_pack(
    payload: LVCircuitVerificationPackRequest, request: Request
) -> dict:
    """Podgląd JSON pakietu (bez ZIP) — do prezentacji w UI (kroki + podsumowanie + źródła)."""
    wynik = _wejscie_dowodu(payload, request)
    if wynik["status"] != "OK":
        return wynik

    document = LVCircuitVerificationProofPack.generate(wynik["wejscie"])
    return {**serialize_lv_circuit_verification_pack(document), "zrodla": wynik["zrodla"]}


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
def build_lv_circuit_report(payload: LVCircuitReportRequest, request: Request) -> dict[str, Any]:
    """Sekcje nN raportu dla obwodu (dane źródłowe, TR, odcinki, ΔU, Ik max/min,
    SWZ, dobór) — zakres minimalny P0 (karta P0.10 §0.4, pełny spis §63 w P1).
    """
    from api.analysis_run_exports import build_nn_circuit_report_section

    klucz = klucz_twin_z_sciezki(payload.case_id, request)
    enm = get_enm(klucz)
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
