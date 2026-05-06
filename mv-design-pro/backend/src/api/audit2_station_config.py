"""
FastAPI router dla persystencji audit2 station config (Punkt 3 Phase 2).

Persystencja per (project_id, station_id) konfiguracji audytu 2:
  - mv_neutral_grounding_ref (B.1)
  - tap_changer_refs (eng.13, lista per transformator)
  - der_specs (lista DER z polami audit2: BESS modes, block-trafo, P(f))

Endpointy (UPSERT pattern):
  GET  /api/v1/projects/{project_id}/audit2-station-config
  GET  /api/v1/projects/{project_id}/audit2-station-config/{station_id}
  PUT  /api/v1/projects/{project_id}/audit2-station-config/{station_id}
  DELETE /api/v1/projects/{project_id}/audit2-station-config/{station_id}
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from api.dependencies import get_uow_factory
from fastapi import APIRouter, Depends, HTTPException, Response, status
from infrastructure.persistence.models import StationAudit2ConfigORM
from pydantic import BaseModel, Field

router = APIRouter(
    prefix="/api/v1/projects/{project_id}/audit2-station-config",
    tags=["Audit2 Station Config"],
)


class DerAudit2SpecPayload(BaseModel):
    der_id: str
    der_kind: str  # "PV" | "BESS" | "FW"
    bess_operation_mode_refs: list[str] | None = None
    block_transformer_catalog_ref: str | None = None
    pf_curve_ref: str | None = None


class StationAudit2ConfigBody(BaseModel):
    mv_neutral_grounding_ref: str | None = None
    tap_changer_refs: list[str] = Field(default_factory=list)
    der_specs: list[DerAudit2SpecPayload] = Field(default_factory=list)


def _to_dict(orm: StationAudit2ConfigORM) -> dict[str, Any]:
    return {
        "id": str(orm.id),
        "project_id": str(orm.project_id),
        "station_id": orm.station_id,
        "mv_neutral_grounding_ref": orm.mv_neutral_grounding_ref,
        "tap_changer_refs": list(orm.tap_changer_refs or []),
        "der_specs": list(orm.der_specs or []),
        "created_at": orm.created_at.isoformat() if orm.created_at else None,
        "updated_at": orm.updated_at.isoformat() if orm.updated_at else None,
    }


@router.get("")
def list_station_audit2_configs(
    project_id: UUID, uow_factory=Depends(get_uow_factory)
) -> list[dict[str, Any]]:
    """Lista wszystkich konfiguracji audytu 2 dla projektu."""
    with uow_factory() as uow:
        assert uow.session is not None
        rows = (
            uow.session.query(StationAudit2ConfigORM)
            .filter(StationAudit2ConfigORM.project_id == project_id)
            .order_by(StationAudit2ConfigORM.station_id)
            .all()
        )
        return [_to_dict(row) for row in rows]


@router.get("/{station_id}")
def get_station_audit2_config(
    project_id: UUID, station_id: str, uow_factory=Depends(get_uow_factory)
) -> dict[str, Any]:
    """Pobiera konfiguracje audytu 2 dla (project_id, station_id)."""
    with uow_factory() as uow:
        assert uow.session is not None
        row = (
            uow.session.query(StationAudit2ConfigORM)
            .filter(
                StationAudit2ConfigORM.project_id == project_id,
                StationAudit2ConfigORM.station_id == station_id,
            )
            .one_or_none()
        )
        if row is None:
            # 404 gdy brak — frontend traktuje jako pusta konfiguracja.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Brak audit2 config dla project={project_id} station={station_id}",
            )
        return _to_dict(row)


@router.put("/{station_id}")
def upsert_station_audit2_config(
    project_id: UUID,
    station_id: str,
    body: StationAudit2ConfigBody,
    uow_factory=Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    UPSERT konfiguracji audytu 2.

    Jesli wiersz istnieje (project_id, station_id) - update.
    Jesli nie - insert nowy.
    """
    with uow_factory() as uow:
        assert uow.session is not None
        existing = (
            uow.session.query(StationAudit2ConfigORM)
            .filter(
                StationAudit2ConfigORM.project_id == project_id,
                StationAudit2ConfigORM.station_id == station_id,
            )
            .one_or_none()
        )
        if existing is not None:
            existing.mv_neutral_grounding_ref = body.mv_neutral_grounding_ref
            existing.tap_changer_refs = list(body.tap_changer_refs)
            existing.der_specs = [spec.model_dump() for spec in body.der_specs]
            uow.session.flush()
            return _to_dict(existing)

        new_row = StationAudit2ConfigORM(
            id=uuid4(),
            project_id=project_id,
            station_id=station_id,
            mv_neutral_grounding_ref=body.mv_neutral_grounding_ref,
            tap_changer_refs=list(body.tap_changer_refs),
            der_specs=[spec.model_dump() for spec in body.der_specs],
        )
        uow.session.add(new_row)
        uow.session.flush()
        return _to_dict(new_row)


@router.delete("/{station_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_station_audit2_config(
    project_id: UUID,
    station_id: str,
    uow_factory=Depends(get_uow_factory),
) -> Response:
    """Usuwa konfiguracje audytu 2 dla (project_id, station_id)."""
    with uow_factory() as uow:
        assert uow.session is not None
        deleted = (
            uow.session.query(StationAudit2ConfigORM)
            .filter(
                StationAudit2ConfigORM.project_id == project_id,
                StationAudit2ConfigORM.station_id == station_id,
            )
            .delete(synchronize_session=False)
        )
        if deleted == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brak konfiguracji")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
