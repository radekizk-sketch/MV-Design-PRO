from __future__ import annotations

from api.schemas.equipment_proof import DeviceRatingPayload, EquipmentProofRequest
from application.equipment_proof.catalog_bridge import resolve_um_icu_from_catalog
from application.equipment_proof.proof_pack import build_equipment_proof_pack
from application.equipment_proof.types import DeviceRating, EquipmentProofInput
from fastapi import APIRouter, Response

router = APIRouter(prefix="/api/equipment-proof", tags=["equipment-proof"])


def _device_rating_from_payload(payload_device: DeviceRatingPayload) -> DeviceRating:
    """Buduje ``DeviceRating`` z payloadu, uzupelniajac U_m/I_cu z katalogu.

    Karta UM-ICU-KATALOG (most aparat->wytrzymalosc, poz. c): gdy klient poda
    ``type_ref`` wskazujacy pozycje katalogu aparatury (SN albo nN) i NIE
    poda jawnie ``u_m_kv``/``i_cu_ka``, wartosci schodza WPROST z katalogu —
    klient przestaje musiec przepisywac dane tabliczkowe recznie. Jawne
    wartosci w payloadzie sa NADRZEDNE (inzynier moze swiadomie nadpisac).
    Brak ``type_ref`` albo brak pozycji w katalogu zostawia pola bez zmian
    (generator zwroci uczciwe "brak podstawy" — zero fabrykacji).
    """
    u_m_kv = payload_device.u_m_kv
    i_cu_ka = payload_device.i_cu_ka
    i_cu_not_applicable = False

    if payload_device.type_ref and u_m_kv is None and i_cu_ka is None:
        katalog = resolve_um_icu_from_catalog(payload_device.type_ref)
        if katalog.found_in_catalog:
            u_m_kv = katalog.u_m_kv
            i_cu_ka = katalog.i_cu_ka
            i_cu_not_applicable = katalog.i_cu_not_applicable

    return DeviceRating(
        device_id=payload_device.device_id,
        name_pl=payload_device.name_pl,
        type_ref=payload_device.type_ref,
        u_m_kv=u_m_kv,
        i_cu_ka=i_cu_ka,
        i_dyn_ka=payload_device.i_dyn_ka,
        i_th_ka=payload_device.i_th_ka,
        t_th_s=payload_device.t_th_s,
        meta=payload_device.meta,
        i_cu_not_applicable=i_cu_not_applicable,
    )


@router.post("/pack")
def download_equipment_proof_pack(payload: EquipmentProofRequest) -> Response:
    proof_input = EquipmentProofInput(
        project_id=payload.project_id,
        case_id=payload.case_id,
        run_id=payload.run_id,
        connection_node_id=payload.connection_node_id,
        device=_device_rating_from_payload(payload.device),
        required_fault_results=payload.required_fault_results,
    )
    filename, pack_bytes = build_equipment_proof_pack(proof_input)
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=pack_bytes, media_type="application/zip", headers=headers)
