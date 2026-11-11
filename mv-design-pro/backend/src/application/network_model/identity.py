from __future__ import annotations

from uuid import UUID

from network_model.core import NetworkSnapshot

from .errors import MultipleNetworkModelsError


def network_model_id_for_project(project_id: UUID) -> str:
    return str(project_id)


def ensure_snapshot_matches_project(snapshot: NetworkSnapshot, project_id: UUID) -> None:
    expected_model_id = network_model_id_for_project(project_id)
    actual_model_id = snapshot.meta.network_model_id
    if actual_model_id != expected_model_id:
        raise MultipleNetworkModelsError(
            f"Wykryto więcej niż jeden model sieci w projekcie {project_id} "
            f"(migawka {snapshot.meta.snapshot_id}) — projekt ma dokładnie jeden model sieci."
        )
