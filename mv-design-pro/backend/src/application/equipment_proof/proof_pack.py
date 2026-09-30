from __future__ import annotations

from application.equipment_proof.generator import EquipmentProofGenerator
from application.equipment_proof.types import EquipmentProofInput
from application.proof_engine.proof_pack import (
    ProofPackBuilder,
    ProofPackContext,
    resolve_mv_design_pro_version,
)
from network_model.core.autorytet_wyniku_zwarciowego import wymagaj_autorytetu
from network_model.core.zdolnosci_wkladu_zwarciowego import ZdolnoscMiarodajna


def build_equipment_proof_pack(proof_input: EquipmentProofInput) -> tuple[str, bytes]:
    """Pakiet dowodowy doboru aparatury — bramkowany autorytetem wyniku zwarciowego.

    Karta S-2 AUTORYTET: pakiet jest jednocześnie dowodem doboru zdolności
    wyłączalnej (`BREAKING_CAPACITY_SELECTION`) i dowodem wytrzymałości
    zwarciowej (`SC_WITHSTAND_EVIDENCE`) — obie zdolności są zależne od wkładu
    zwarciowego falownika (`ZDOLNOSCI_ZALEZNE_OD_WKLADU_ZWARCIOWEGO`), więc obie
    muszą przejść bramkę. Podnosi `BrakAutorytetuWyniku` (mapowane na HTTP 422 w
    `api/equipment_proof_pack.py`) zanim jakikolwiek bajt pakietu powstanie.
    """
    wymagaj_autorytetu(
        (ZdolnoscMiarodajna.BREAKING_CAPACITY_SELECTION, ZdolnoscMiarodajna.SC_WITHSTAND_EVIDENCE),
        proof_input.proweniencja,
    )
    bundle = EquipmentProofGenerator.generate(proof_input)
    snapshot_id = _snapshot_id_from_connection_node(proof_input.connection_node_id)
    context = ProofPackContext(
        project_id=proof_input.project_id,
        case_id=proof_input.case_id,
        run_id=proof_input.run_id,
        snapshot_id=snapshot_id,
        mv_design_pro_version=resolve_mv_design_pro_version(),
    )
    pack_bytes = ProofPackBuilder(context).build(bundle.proof_document)
    filename = _proof_pack_filename(proof_input)
    return filename, pack_bytes


def _snapshot_id_from_connection_node(connection_node_id: str) -> str:
    return f"connection_node:{connection_node_id}" if connection_node_id else "unknown"


def _proof_pack_filename(proof_input: EquipmentProofInput) -> str:
    """Nazwa pobieranego pliku — bez oznaczeń roboczych projektu.

    Nazwa pliku JEST widoczna dla użytkownika (trafia do jego katalogu pobrań),
    więc obowiązuje ją zakaz nazw roboczych z CLAUDE.md tak samo jak łańcuchy
    ekranu. Wcześniejsza nazwa niosła oznaczenie robocze karty.
    """
    return (
        "pakiet_dowodowy_dobor_aparatury__"
        f"{proof_input.project_id}__{proof_input.case_id}__"
        f"{proof_input.run_id}__{proof_input.device.device_id}.zip"
    )
