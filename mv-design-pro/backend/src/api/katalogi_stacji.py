"""Router katalogow konfiguracji stacji (odczyt) i walidatora przekladnika wobec uziemienia.

Katalogi (GET ``/api/v1/catalog/konfiguracja-stacji/...``): tryby pracy magazynu,
przelaczniki zaczepow, wkladki bezpiecznikowe SN, nastawy P(f), transformatory dedykowane
zrodel; ``/snapshot`` — wszystkie jednym wywolaniem. Wybor pozycji z tych katalogow trafia
do MODELU sieci operacja domenowa (karta JEDNA-SCIEZKA-EDYCJI) — router niczego nie zapisuje.

Walidator (POST ``/validate-vt-grounding``): wspolczynnik napieciowy przekladnika wobec
sposobu uziemienia sieci SN (IEC 61869-3 tab. 2). Raport pakietu dowodow rozszerzen stacji
(POST ``/generate-report``) renderuje pakiet zlozony przez backend
(``api/pakiet_rozszerzen_stacji.py``).

Skasowane karta JEDNA-SCIEZKA-EDYCJI (zero konsumentow po przeniesieniu danych do modelu):
katalog „klas wytrzymalosci aparatury” z walidatorem (znamiona daje pozycja APARAT_SN pola
w modelu), walidator eksportu mocy (liczy go pakiet dowodow z modelu) i budowniczy
rozszerzen solvera z zapisanej konfiguracji stacji (solver czyta wylacznie model).
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from network_model.catalog.katalogi_stacji import (
    BESS_OPERATION_MODE_CATALOG,
    BLOCK_TRANSFORMER_CATALOG,
    HV_FUSE_CATALOG,
    PF_CURVE_CATALOG,
    TAP_CHANGER_CATALOG,
    is_vt_voltage_factor_valid_for_grounding,
    snapshot_katalogow_stacji,
)
from network_model.core.uziemienie import TYPY_PUNKTU_NEUTRALNEGO
from pydantic import BaseModel

router = APIRouter(
    prefix="/api/v1/catalog/konfiguracja-stacji", tags=["Katalogi konfiguracji stacji"]
)


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


@router.get("/pf-curves")
def list_pf_curves() -> list[dict[str, Any]]:
    """Nastawy trybu czestotliwosciowego P(f) (eng.9, NC RfG art. 13/15)."""
    return [c.to_dict() for c in PF_CURVE_CATALOG]


@router.get("/block-transformers")
def list_block_transformers() -> list[dict[str, Any]]:
    """Transformatory dedykowane zrodel (B.5) — wybor pozycji katalogu transformatorow."""
    return [b.to_dict() for b in BLOCK_TRANSFORMER_CATALOG]


@router.get("/snapshot")
def get_snapshot() -> dict[str, Any]:
    """Wszystkie katalogi konfiguracji stacji jednym wywolaniem."""
    return snapshot_katalogow_stacji().to_dict()


class VtGroundingValidationRequest(BaseModel):
    voltage_factor: float
    grounding_type: str  # "isolated" | "petersen_coil" | "resistor_grounded" | "directly_grounded"


@router.post("/validate-vt-grounding")
def validate_vt_grounding(req: VtGroundingValidationRequest) -> dict[str, Any]:
    """Naprawa eng.20: walidacja VT voltage_factor vs typ uziemienia."""
    grounding = req.grounding_type
    if grounding not in TYPY_PUNKTU_NEUTRALNEGO:
        return {"ok": False, "message_pl": f"Nieznany typ uziemienia: {grounding}"}
    ok, message = is_vt_voltage_factor_valid_for_grounding(req.voltage_factor, grounding)  # type: ignore[arg-type]
    return {"ok": ok, "message_pl": message}


class RaportPakietuRozszerzenRequest(BaseModel):
    project_name: str
    station_id: str
    #: Nazwa stacji z modelu — raport pokazuje ją projektantowi; `station_id` zostaje
    #: wyłącznie w strukturze JSON raportu (karta #144: nazwa nigdy z identyfikatora).
    station_name: str
    proof_pack: dict[str, Any]
    operator_pl: str = ""
    generated_at_iso: str = "1970-01-01T00:00:00Z"
    formats: list[str] = ["json", "text_pl", "latex"]


@router.post("/generate-report")
def generate_report_endpoint(req: RaportPakietuRozszerzenRequest) -> dict[str, Any]:
    """Raport pakietu dowodow rozszerzen stacji: struktura JSON, tekst PL i LaTeX."""
    from analysis.reporting.raport_rozszerzen_stacji import (
        KontekstRaportuRozszerzen,
        render_raport_json,
        render_raport_latex,
        render_raport_tekst,
    )

    ctx = KontekstRaportuRozszerzen(
        project_name=req.project_name,
        station_id=req.station_id,
        station_name=req.station_name,
        proof_pack_dict=req.proof_pack,
        operator_pl=req.operator_pl,
        generated_at_iso=req.generated_at_iso,
    )
    out: dict[str, Any] = {}
    if "json" in req.formats:
        out["json"] = render_raport_json(ctx)
    if "text_pl" in req.formats:
        out["text_pl"] = render_raport_tekst(ctx)
    if "latex" in req.formats:
        out["latex"] = render_raport_latex(ctx)
    return out
