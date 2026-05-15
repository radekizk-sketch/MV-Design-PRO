from __future__ import annotations

from collections.abc import Callable
from infrastructure.persistence.unit_of_work import UnitOfWork

import io
import zipfile
from datetime import datetime
from uuid import UUID

from api.dependencies import get_uow_factory
from application.proof_engine.packs.sc_asymmetrical import (
    SCAsymmetricalPackInput,
    SCAsymmetricalProofPack,
)
from application.proof_engine.proof_pack import ProofPackContext, resolve_mv_design_pro_version
from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel

_FIXED_ZIP_TIMESTAMP = (1980, 1, 1, 0, 0, 0)

router = APIRouter(prefix="/api/proof", tags=["proof-pack"])


class SCAsymmetricalPackRequest(BaseModel):
    project_id: str
    case_id: str
    run_id: str
    snapshot_id: str
    project_name: str
    case_name: str
    fault_node_id: str
    run_timestamp: datetime
    solver_version: str
    u_n_kv: float
    c_factor: float
    u_prefault_kv: float
    z1_re_ohm: float
    z1_im_ohm: float
    z2_re_ohm: float
    z2_im_ohm: float
    z0_re_ohm: float
    z0_im_ohm: float
    a_re: float
    a_im: float
    tk_s: float = 1.0
    m_factor: float = 1.0
    n_factor: float = 0.0


@router.get("/{project_id}/{case_id}/{run_id}/pack")
def download_proof_pack(
    project_id: UUID,
    case_id: UUID,
    run_id: UUID,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> Response:
    _ = project_id, case_id, run_id, uow_factory
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "Legacy proof-pack GET oparty o AnalysisRun/OperatingCase został wycofany z toru "
            "produkcyjnego V12.xx. Użyj kanonicznych eksportów i proof dla StudyCase."
        ),
    )


def _extract_snapshot_id(payload: dict) -> str:
    snapshot_id = payload.get("snapshot_id")
    if snapshot_id:
        return str(snapshot_id)
    active_snapshot = payload.get("active_snapshot_id")
    if active_snapshot:
        return str(active_snapshot)
    return "unknown"


@router.post("/sc-asymmetrical/pack")
def download_sc_asymmetrical_pack(payload: SCAsymmetricalPackRequest) -> Response:
    context = ProofPackContext(
        project_id=payload.project_id,
        case_id=payload.case_id,
        run_id=payload.run_id,
        snapshot_id=payload.snapshot_id,
        mv_design_pro_version=resolve_mv_design_pro_version(),
    )
    pack_input = SCAsymmetricalPackInput(
        project_name=payload.project_name,
        case_name=payload.case_name,
        fault_node_id=payload.fault_node_id,
        run_timestamp=payload.run_timestamp,
        solver_version=payload.solver_version,
        u_n_kv=payload.u_n_kv,
        c_factor=payload.c_factor,
        u_prefault_kv=payload.u_prefault_kv,
        z1_ohm=complex(payload.z1_re_ohm, payload.z1_im_ohm),
        z2_ohm=complex(payload.z2_re_ohm, payload.z2_im_ohm),
        z0_ohm=complex(payload.z0_re_ohm, payload.z0_im_ohm),
        a_operator=complex(payload.a_re, payload.a_im),
        tk_s=payload.tk_s,
        m_factor=payload.m_factor,
        n_factor=payload.n_factor,
    )
    packs = SCAsymmetricalProofPack.generate_zip(pack_input, context)
    content = _build_sc_asymmetrical_bundle_zip(packs)
    headers = {
        "Content-Disposition": (
            f'attachment; filename="pakiet_dowodowy_sc_asymetryczne__{payload.run_id}.zip"'
        )
    }
    return Response(content=content, media_type="application/zip", headers=headers)


def _build_sc_asymmetrical_bundle_zip(packs: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(
        buffer,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
        compresslevel=9,
    ) as bundle:
        for fault_type in sorted(packs.keys()):
            path = f"pakiet_dowodowy/{fault_type}.zip"
            info = zipfile.ZipInfo(path, date_time=_FIXED_ZIP_TIMESTAMP)
            info.create_system = 0
            info.external_attr = 0o100644 << 16
            bundle.writestr(info, packs[fault_type])
    return buffer.getvalue()
