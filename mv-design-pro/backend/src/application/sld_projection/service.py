from __future__ import annotations

from collections.abc import Callable
from uuid import UUID

from infrastructure.persistence.unit_of_work import UnitOfWork
from network_model.sld_projection import SldDiagram, project_snapshot_to_sld


class SldProjectionService:
    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory

    def get_sld_for_case(self, case_id: UUID) -> SldDiagram:
        with self._uow_factory() as uow:
            case = uow.cases.get_operating_case(case_id)
            if case is None:
                raise ValueError(f"OperatingCase {case_id} not found")
            snapshot_id = (case.case_payload or {}).get("active_snapshot_id")
            if not snapshot_id:
                raise ValueError(f"OperatingCase {case_id} has no active_snapshot_id")
            snapshot = uow.snapshots.get_snapshot(str(snapshot_id))
            if snapshot is None:
                raise ValueError(f"Snapshot {snapshot_id} not found")
        return project_snapshot_to_sld(snapshot)
