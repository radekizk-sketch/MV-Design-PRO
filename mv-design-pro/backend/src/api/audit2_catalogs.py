"""
FastAPI router dla katalogow audytu 2 (read-only).

6 endpointow GET /api/v1/catalog/audit2/...:
  - bess-operation-modes
  - tap-changers
  - hv-fuses
  - device-withstand
  - pf-curves
  - block-transformers
+ 1 endpoint agregujacy: GET /api/v1/catalog/audit2/snapshot

+ 3 endpointy walidatorow (POST):
  - /api/v1/catalog/audit2/validate-vt-grounding
  - /api/v1/catalog/audit2/validate-device-withstand
  - /api/v1/catalog/audit2/validate-hosting-capacity-export
"""

from __future__ import annotations

from typing import Any, cast

from fastapi import APIRouter, HTTPException
from network_model.catalog.audit2_catalogs import (
    BESS_OPERATION_MODE_CATALOG,
    BLOCK_TRANSFORMER_CATALOG,
    DEVICE_WITHSTAND_CATALOG,
    HV_FUSE_CATALOG,
    PF_CURVE_CATALOG,
    TAP_CHANGER_CATALOG,
    get_audit2_catalog_snapshot,
)
from network_model.catalog.audit2_oceny import (
    ocen_aparat_katalogu_wytrzymalosci,
    ocena_eksportu_stacji,
    ocena_wspolczynnika_napieciowego_vt,
)
from network_model.core.uziemienie import (
    ETYKIETA_PL_PUNKTU_NEUTRALNEGO,
    TYPY_PUNKTU_NEUTRALNEGO,
    TypPunktuNeutralnego,
)
from pydantic import BaseModel
from werdykt import Przedmiot

router = APIRouter(prefix="/api/v1/catalog/audit2", tags=["Audit2 Catalogs"])


@router.get("/bess-operation-modes")
def list_bess_operation_modes() -> list[dict[str, Any]]:
    """Tryby pracy BESS (eng.10): peak shaving / FCR / aFRR / mFRR / Q(U) / island / etc."""
    return [m.to_dict() for m in BESS_OPERATION_MODE_CATALOG]


@router.get("/tap-changers")
def list_tap_changers() -> list[dict[str, Any]]:
    """Przelaczniki zaczepow (eng.13): OLTC 110/SN, DETC SN/nN, OLTC SN/nN."""
    return [tc.to_dict() for tc in TAP_CHANGER_CATALOG]


@router.get("/hv-fuses")
def list_hv_fuses() -> list[dict[str, Any]]:
    """Bezpieczniki SN/HV (eng.17): full-range / general-purpose / back-up."""
    return [f.to_dict() for f in HV_FUSE_CATALOG]


@router.get("/device-withstand")
def list_device_withstand() -> list[dict[str, Any]]:
    """Wytrzymalosc aparatury I_dyn / I_th (eng.18, IEC 60909)."""
    return [d.to_dict() for d in DEVICE_WITHSTAND_CATALOG]


@router.get("/pf-curves")
def list_pf_curves() -> list[dict[str, Any]]:
    """Krzywe P(f) (eng.9, NC RfG Art. 13/15)."""
    return [c.to_dict() for c in PF_CURVE_CATALOG]


@router.get("/block-transformers")
def list_block_transformers() -> list[dict[str, Any]]:
    """Transformatory dedykowane block-trafo (B.5) dla DER PV/BESS/FW."""
    return [b.to_dict() for b in BLOCK_TRANSFORMER_CATALOG]


@router.get("/snapshot")
def get_snapshot() -> dict[str, Any]:
    """Snapshot wszystkich katalogow audytu 2 (jednym wywolaniem)."""
    return get_audit2_catalog_snapshot().to_dict()


# =============================================================================
# Walidatory POST
# =============================================================================


# Odpowiedzi walidatorów niosą rekord werdyktu wyjaśnialnego (`ocena` — rekord K, `wymaganie` —
# rekord W) i zdanie tego rekordu (`message_pl`); status żyje wyłącznie w rekordzie (karta
# WERDYKT-MIGRACJA-190 — dawne flagi `ok` / `i_dyn_ok` / `i_th_ok`, komunikaty „OK: …" i słowa
# statusu eksportu z progów bez podstawy usunięte).


class VtGroundingValidationRequest(BaseModel):
    # `None` — karta typu nie podaje współczynnika: rekord `NIE_OCENIONO` z nazwanym brakiem
    # (brak danych ≠ spełnia), nigdy wartość domyślna.
    voltage_factor: float | None
    grounding_type: str  # "isolated" | "petersen_coil" | "resistor_grounded" | "directly_grounded"


def _typ_uziemienia(wartosc: str) -> TypPunktuNeutralnego:
    """Typ punktu neutralnego z żądania — wartość spoza słownika to błąd żądania (422), nie
    ocena przekładnika."""
    if wartosc in TYPY_PUNKTU_NEUTRALNEGO:
        # Przynależność do `get_args(TypPunktuNeutralnego)` sprawdzona wyżej.
        return cast(TypPunktuNeutralnego, wartosc)
    raise HTTPException(
        status_code=422,
        detail=f"Nieznany typ uziemienia punktu neutralnego sieci: {wartosc}",
    )


@router.post("/validate-vt-grounding")
def validate_vt_grounding(req: VtGroundingValidationRequest) -> dict[str, Any]:
    """Naprawa eng.20: współczynnik napięciowy VT wobec sposobu uziemienia sieci (rekord K)."""
    grounding = _typ_uziemienia(req.grounding_type)
    ocena = ocena_wspolczynnika_napieciowego_vt(
        voltage_factor=req.voltage_factor,
        grounding_type=grounding,
        przedmiot=Przedmiot(
            element_ref=None,
            nazwa_pl="przekładnik napięciowy",
            opis_pl=(
                "przekładnik napięciowy wobec sieci o punkcie neutralnym "
                f"{ETYKIETA_PL_PUNKTU_NEUTRALNEGO[grounding]}"
            ),
        ),
    )
    return {
        "ocena": ocena.model_dump(mode="json"),
        "message_pl": ocena.wyjasnienie.zdanie_pl,
    }


class DeviceWithstandValidationRequest(BaseModel):
    device_id: str
    i_peak_calculated_ka: float
    i_thermal_calculated_ka: float
    t_clearing_s: float


@router.post("/validate-device-withstand")
def validate_device_withstand_endpoint(req: DeviceWithstandValidationRequest) -> dict[str, Any]:
    """Naprawa eng.18: wytrzymałość I_dyn / I_th aparatury z katalogu (rekordy K i W)."""
    ocena = ocen_aparat_katalogu_wytrzymalosci(
        device_id=req.device_id,
        i_peak_calculated_ka=req.i_peak_calculated_ka,
        i_thermal_calculated_ka=req.i_thermal_calculated_ka,
        t_clearing_s=req.t_clearing_s,
    )
    if ocena is None:
        raise HTTPException(
            status_code=404,
            detail="Brak aparatury w katalogu wytrzymałości zwarciowej.",
        )
    return ocena.to_dict()


class HostingCapacityExportRequest(BaseModel):
    station_id: str
    p_export_kw: float
    p_import_kw: float


@router.post("/validate-hosting-capacity-export")
def validate_hosting_capacity_export_endpoint(
    req: HostingCapacityExportRequest,
) -> dict[str, Any]:
    """Naprawa eng.15: eksport netto stacji wobec granicy zdolności przyłączeniowej (rekord K).

    Granica eksportu wynika z warunków przyłączenia OSD, których model nie niesie — eksport
    netto daje ``BRAK_PODSTAWY`` z wynikiem informacyjnym, brak eksportu — ``NIE_DOTYCZY``.
    """
    ocena = ocena_eksportu_stacji(
        stacja_nazwa="wskazana w żądaniu",
        przedmiot=Przedmiot(
            element_ref=req.station_id,
            nazwa_pl="stacja wskazana w żądaniu",
            opis_pl="stacja — bilans mocy źródeł i odbiorów wobec sieci OSD",
        ),
        p_export_kw=req.p_export_kw,
        p_import_kw=req.p_import_kw,
    )
    return {
        "station_id": req.station_id,
        "p_export_kw": req.p_export_kw,
        "p_import_kw": req.p_import_kw,
        "p_net_export_kw": req.p_export_kw - req.p_import_kw,
        "ocena": ocena.model_dump(mode="json"),
        "message_pl": ocena.wyjasnienie.zdanie_pl,
    }


# =============================================================================
# Phase 3: Solver-input payload builder
# =============================================================================


class DerAudit2Spec(BaseModel):
    der_id: str
    der_kind: str  # "PV" | "BESS" | "FW"
    bess_operation_mode_refs: list[str] | None = None
    block_transformer_catalog_ref: str | None = None
    pf_curve_ref: str | None = None


class StationAudit2BuildRequest(BaseModel):
    station_id: str
    tap_changer_refs: list[str] | None = None
    der_specs: list[DerAudit2Spec] = []


# =============================================================================
# Phase 4: Proof Pack — USUNIETY z tego routera (karta PROOFPACK-KONTRAKT)
# =============================================================================
#
# `POST /generate-proof-pack` przyjmowal nietypowane specyfikacje (`list[dict]`)
# i rozpakowywal je `**spec` do generatorow: zmiana sygnatury generatora (karta #144,
# wymagane nazwy) byla niewidoczna dla kontraktu i konczyla sie HTTP 500. Pakiet dowodow
# sklada teraz backend z utrwalonych konfiguracji stacji i z modelu sieci:
# `POST /api/v1/projects/{project_id}/audit2-station-config/_validate-all`.


# =============================================================================
# Phase 5: Report endpoint
# =============================================================================


class GenerateAudit2ReportRequest(BaseModel):
    project_name: str
    station_id: str
    #: Nazwa stacji z modelu — raport pokazuje ją projektantowi; `station_id` zostaje
    #: wyłącznie w strukturze JSON raportu (karta #144: nazwa nigdy z identyfikatora).
    station_name: str
    proof_pack: dict[str, Any]
    operator_pl: str = ""
    generated_at_iso: str = "1970-01-01T00:00:00Z"
    formats: list[str] = ["json", "text_pl", "latex"]  # opcjonalne: "pdf", "docx"


@router.post("/generate-report")
def generate_audit2_report_endpoint(
    req: GenerateAudit2ReportRequest,
) -> dict[str, Any]:
    """
    Naprawy Phase 5: generuje raport audytu 2 w wybranych formatach.
    Zwraca JSON struktury + text PL + LaTeX (defaults). PDF/DOCX dostepne
    przez osobne endpointy `/generate-report.pdf` i `/generate-report.docx`.
    """
    from analysis.reporting.audit2_report import (
        Audit2ReportContext,
        render_audit2_report_json,
        render_audit2_report_latex,
        render_audit2_report_text,
    )

    ctx = Audit2ReportContext(
        project_name=req.project_name,
        station_id=req.station_id,
        station_name=req.station_name,
        proof_pack_dict=req.proof_pack,
        operator_pl=req.operator_pl,
        generated_at_iso=req.generated_at_iso,
    )
    out: dict[str, Any] = {}
    if "json" in req.formats:
        out["json"] = render_audit2_report_json(ctx)
    if "text_pl" in req.formats:
        out["text_pl"] = render_audit2_report_text(ctx)
    if "latex" in req.formats:
        out["latex"] = render_audit2_report_latex(ctx)
    return out


@router.post("/build-station-payload")
def build_station_audit2_payload_endpoint(
    req: StationAudit2BuildRequest,
) -> dict[str, Any]:
    """
    Naprawy Phase 3: buduje deterministyczny payload audytu 2 dla stacji + DERs.
    Zwraca rozwiniete katalogi (BESS modes, block-trafo, P(f), tap-changer)
    + ekstraktor dla solverow (SC/PF/Protection).
    """
    from solver_input.audit2_der_payload import (
        build_station_audit2_payload,
        extract_solver_extensions_from_payload,
    )

    payload = build_station_audit2_payload(
        station_id=req.station_id,
        tap_changer_refs=req.tap_changer_refs,
        der_specs=[spec.model_dump() for spec in req.der_specs],
    )
    extensions = extract_solver_extensions_from_payload(payload)
    return {
        "payload": payload.to_dict(),
        "solver_extensions": extensions,
    }
