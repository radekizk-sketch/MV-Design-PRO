from __future__ import annotations

from api.schemas.equipment_proof import EquipmentProofRequest
from application.equipment_proof.proof_pack import build_equipment_proof_pack
from application.equipment_proof.types import DeviceRating, EquipmentProofInput
from fastapi import APIRouter, Response

router = APIRouter(prefix="/api/equipment-proof", tags=["equipment-proof"])


@router.post("/pack")
def download_equipment_proof_pack(payload: EquipmentProofRequest) -> Response:
    proof_input = EquipmentProofInput(
        project_id=payload.project_id,
        case_id=payload.case_id,
        run_id=payload.run_id,
        connection_node_id=payload.connection_node_id,
        device=DeviceRating(
            device_id=payload.device.device_id,
            name_pl=payload.device.name_pl,
            type_ref=payload.device.type_ref,
            u_m_kv=payload.device.u_m_kv,
            i_cu_ka=payload.device.i_cu_ka,
            i_dyn_ka=payload.device.i_dyn_ka,
            i_th_ka=payload.device.i_th_ka,
            t_th_s=payload.device.t_th_s,
            meta=payload.device.meta,
        ),
        required_fault_results=payload.required_fault_results,
    )
    filename, pack_bytes = build_equipment_proof_pack(proof_input)
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=pack_bytes, media_type="application/zip", headers=headers)
