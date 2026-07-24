"""
FastAPI router dla katalogow audytu 2 (read-only).

7 endpointow GET /api/v1/catalog/audit2/...:
  - bess-operation-modes
  - tap-changers
  - hv-fuses
  - device-withstand
  - pf-curves
  - block-transformers
  - mv-neutral-groundings
+ 1 endpoint agregujacy: GET /api/v1/catalog/audit2/snapshot

+ 3 endpointy walidatorow (POST):
  - /api/v1/catalog/audit2/validate-vt-grounding
  - /api/v1/catalog/audit2/validate-device-withstand
  - /api/v1/catalog/audit2/validate-hosting-capacity-export
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from network_model.catalog.audit2_catalogs import (
    BESS_OPERATION_MODE_CATALOG,
    BLOCK_TRANSFORMER_CATALOG,
    DEVICE_WITHSTAND_CATALOG,
    HV_FUSE_CATALOG,
    MV_NEUTRAL_GROUNDING_CATALOG,
    PF_CURVE_CATALOG,
    TAP_CHANGER_CATALOG,
    get_audit2_catalog_snapshot,
    is_vt_voltage_factor_valid_for_grounding,
    validate_device_withstand,
    validate_hosting_capacity_export,
)
from pydantic import BaseModel

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


@router.get("/mv-neutral-groundings")
def list_mv_neutral_groundings() -> list[dict[str, Any]]:
    """Typy uziemienia neutralnego SN (B.1): isolated / petersen / R-grounded / directly."""
    return [g.to_dict() for g in MV_NEUTRAL_GROUNDING_CATALOG]


@router.get("/snapshot")
def get_snapshot() -> dict[str, Any]:
    """Snapshot wszystkich katalogow audytu 2 (jednym wywolaniem)."""
    return get_audit2_catalog_snapshot().to_dict()


# =============================================================================
# Walidatory POST
# =============================================================================


class VtGroundingValidationRequest(BaseModel):
    voltage_factor: float
    grounding_type: str  # "isolated" | "petersen_coil" | "resistor_grounded" | "directly_grounded"


@router.post("/validate-vt-grounding")
def validate_vt_grounding(req: VtGroundingValidationRequest) -> dict[str, Any]:
    """Naprawa eng.20: walidacja VT voltage_factor vs typ uziemienia."""
    grounding = req.grounding_type
    if grounding not in {"isolated", "petersen_coil", "resistor_grounded", "directly_grounded"}:
        return {"ok": False, "message_pl": f"Nieznany typ uziemienia: {grounding}"}
    ok, message = is_vt_voltage_factor_valid_for_grounding(req.voltage_factor, grounding)  # type: ignore[arg-type]
    return {"ok": ok, "message_pl": message}


class DeviceWithstandValidationRequest(BaseModel):
    device_id: str
    i_peak_calculated_ka: float
    i_thermal_calculated_ka: float
    t_clearing_s: float


@router.post("/validate-device-withstand")
def validate_device_withstand_endpoint(req: DeviceWithstandValidationRequest) -> dict[str, Any]:
    """Naprawa eng.18: walidacja I_dyn / I_th aparatury (IEC 60909)."""
    return validate_device_withstand(
        device_id=req.device_id,
        i_peak_calculated_ka=req.i_peak_calculated_ka,
        i_thermal_calculated_ka=req.i_thermal_calculated_ka,
        t_clearing_s=req.t_clearing_s,
    )


class HostingCapacityExportRequest(BaseModel):
    station_id: str
    p_export_kw: float
    p_import_kw: float


@router.post("/validate-hosting-capacity-export")
def validate_hosting_capacity_export_endpoint(
    req: HostingCapacityExportRequest,
) -> dict[str, Any]:
    """Naprawa eng.15: walidacja eksportu vs import dla stacji."""
    return validate_hosting_capacity_export(
        station_id=req.station_id,
        p_export_kw=req.p_export_kw,
        p_import_kw=req.p_import_kw,
    )


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
    mv_neutral_grounding_ref: str | None = None
    tap_changer_refs: list[str] | None = None
    der_specs: list[DerAudit2Spec] = []


# =============================================================================
# Phase 4: Proof Pack endpoint
# =============================================================================


class GenerateAudit2ProofPackRequest(BaseModel):
    station_id: str
    bess_modes_specs: list[dict[str, Any]] = []
    tap_changer_specs: list[dict[str, Any]] = []
    hosting_capacity_specs: list[dict[str, Any]] = []
    device_withstand_specs: list[dict[str, Any]] = []
    vt_grounding_specs: list[dict[str, Any]] = []
    generated_at_iso: str = "1970-01-01T00:00:00Z"


@router.post("/generate-proof-pack")
def generate_audit2_proof_pack_endpoint(
    req: GenerateAudit2ProofPackRequest,
) -> dict[str, Any]:
    """
    Naprawy Phase 4: generuje ProofPack audytu 2 dla stacji.
    Zwraca all_pass + lista dowodow (5 typow walidacji).
    """
    from application.proof_engine.packs.audit2_validation import (
        generate_bess_modes_proof,
        generate_device_withstand_proof,
        generate_hosting_capacity_export_proof,
        generate_station_audit2_proof_pack,
        generate_tap_changer_plan_proof,
        generate_vt_grounding_validation_proof,
    )

    proofs = []
    for spec in req.bess_modes_specs:
        proofs.append(generate_bess_modes_proof(generated_at_iso=req.generated_at_iso, **spec))
    for spec in req.tap_changer_specs:
        proofs.append(
            generate_tap_changer_plan_proof(generated_at_iso=req.generated_at_iso, **spec)
        )
    for spec in req.hosting_capacity_specs:
        proofs.append(
            generate_hosting_capacity_export_proof(generated_at_iso=req.generated_at_iso, **spec)
        )
    for spec in req.device_withstand_specs:
        proofs.append(
            generate_device_withstand_proof(generated_at_iso=req.generated_at_iso, **spec)
        )
    for spec in req.vt_grounding_specs:
        proofs.append(
            generate_vt_grounding_validation_proof(generated_at_iso=req.generated_at_iso, **spec)
        )

    pack = generate_station_audit2_proof_pack(
        station_id=req.station_id,
        proofs=proofs,
        generated_at_iso=req.generated_at_iso,
    )
    return pack.to_dict()


# =============================================================================
# Phase 5: Report endpoint
# =============================================================================


class GenerateAudit2ReportRequest(BaseModel):
    project_name: str
    station_id: str
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
    Zwraca rozwiniete katalogi (BESS modes, block-trafo, P(f), tap-changer, grounding)
    + ekstraktor dla solverow (SC/PF/Protection).
    """
    from solver_input.audit2_der_payload import (
        build_station_audit2_payload,
        extract_solver_extensions_from_payload,
    )

    payload = build_station_audit2_payload(
        station_id=req.station_id,
        mv_neutral_grounding_ref=req.mv_neutral_grounding_ref,
        tap_changer_refs=req.tap_changer_refs,
        der_specs=[spec.model_dump() for spec in req.der_specs],
    )
    extensions = extract_solver_extensions_from_payload(payload)
    return {
        "payload": payload.to_dict(),
        "solver_extensions": extensions,
    }
