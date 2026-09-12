from __future__ import annotations

from api.schemas.equipment_proof import DeviceRatingPayload, EquipmentProofRequest
from application.autorytet_biegu_zwarciowego import (
    BiegNiemiarodajnyError,
    wejscie_zwarciowe_z_biegu,
)
from application.equipment_proof.catalog_bridge import resolve_um_icu_from_catalog
from application.equipment_proof.proof_pack import build_equipment_proof_pack
from application.equipment_proof.types import DeviceRating, EquipmentProofInput
from fastapi import APIRouter, HTTPException, Response, status
from network_model.core.autorytet_wyniku_zwarciowego import BrakAutorytetuWyniku

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


def _wielkosci_kontraktu_klienta(wielkosci_biegu: dict[str, object]) -> dict[str, object]:
    """Wielkosci solvera (A, V) -> klucze kontraktu doboru aparatury (kA, kV).

    CZYSTE MAPOWANIE JEDNOSTEK, ZERO FIZYKI: dzielimy przez 1000 i zmieniamy
    nazwe klucza. ``idyn_ka`` NIE POWSTAJE tutaj — nie jest wielkoscia zwarciowa,
    tylko wymaganiem wytrzymalosci dynamicznej; generator uzywa ``ip_ka`` jako
    jawnie oznaczonego zastepstwa. Dopisanie tu ``idyn_ka`` byloby fabrykacja.
    """

    def na_kilo(klucz: str) -> float | None:
        wartosc = wielkosci_biegu.get(klucz)
        return None if wartosc is None else float(wartosc) / 1000.0

    wynik: dict[str, object] = {}
    for klucz_klienta, wartosc in (
        ("u_kv", na_kilo("un_v")),
        ("ikss_ka", na_kilo("ikss_a")),
        ("ip_ka", na_kilo("ip_a")),
        ("ith_ka", na_kilo("ith_a")),
        ("tk_s", wielkosci_biegu.get("tk_s")),
    ):
        if wartosc is not None:
            wynik[klucz_klienta] = wartosc
    return wynik


@router.post("/pack")
def download_equipment_proof_pack(payload: EquipmentProofRequest) -> Response:
    """Pakiet dowodowy doboru aparatury — WYŁĄCZNIE z liczb ZAPISANEGO BIEGU.

    OBEJŚCIE, KTÓRE TO ZAMYKA (odtworzone na HEAD, plan naprawy §3): to żądanie
    przyjmowało ``required_fault_results`` jako gołe liczby i wystawiało kompletny
    pakiet dowodowy, nie pytając, skąd pochodzą. Przy ``run_id`` wskazującym bieg,
    którego nigdy nie było, dowód powstawał tak samo dla 12,5 kA jak dla 999 kA.

    DWIE RÓŻNE BRAMKI, OBIE KONIECZNE:
    1. wielkości pochodzą z BIEGU wskazanego przez ``run_id`` (nie z żądania), a
       liczby przysłane przez klienta są wyłącznie ECHEM — rozbieżność jest odmową;
    2. proweniencja ``k_sc`` wyprowadzona z migawki TEGO biegu (nie z migawki
       dołączonej do żądania) musi być miarodajna.

    Pierwsza bramka bez drugiej przepuściłaby liczby policzone z domyślki
    systemowej; druga bez pierwszej — liczby z powietrza policzone na dobrym
    modelu. Dlatego są obie.
    """
    try:
        wejscie = wejscie_zwarciowe_z_biegu(
            run_id=payload.run_id, punkt_zwarcia=payload.connection_node_id
        )
    except BiegNiemiarodajnyError as brak:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"powod": brak.powod, "komunikat_pl": brak.komunikat_pl},
        ) from brak

    niezgodnosci = wejscie.niezgodnosci_z_echem(payload.required_fault_results)
    if niezgodnosci:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "powod": "WYNIK_NIEZGODNY_Z_BIEGIEM",
                "komunikat_pl": (
                    "Wielkości zwarciowe podane w żądaniu różnią się od wielkości policzonych "
                    "w biegu. Dowód powstaje z wyniku solvera — popraw dane w żądaniu albo "
                    "przelicz bieg ponownie."
                ),
                "niezgodnosci": list(niezgodnosci),
            },
        )

    proof_input = EquipmentProofInput(
        project_id=payload.project_id,
        case_id=payload.case_id,
        run_id=payload.run_id,
        connection_node_id=payload.connection_node_id,
        device=_device_rating_from_payload(payload.device),
        required_fault_results=_wielkosci_kontraktu_klienta(wejscie.wielkosci),
        proweniencja=wejscie.proweniencja,
    )
    try:
        filename, pack_bytes = build_equipment_proof_pack(proof_input)
    except BrakAutorytetuWyniku as brak:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "powod": "WEJSCIE_NIEMIARODAJNE",
                "blokady": [b.to_dict() for b in brak.blokady],
            },
        ) from brak
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=pack_bytes, media_type="application/zip", headers=headers)
