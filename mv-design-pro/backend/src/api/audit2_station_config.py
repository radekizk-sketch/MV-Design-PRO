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

from collections.abc import Callable
from typing import Any
from uuid import UUID

from api.dependencies import get_uow_factory
from application.proof_engine.packs.audit2_skladanie import (
    StationAudit2ConfigBody,
    zloz_pakiety_projektu,
)
from application.twin_key import klucz_twin_dla_projektu
from enm.models import EnergyNetworkModel
from enm.store import get_enm, has_enm
from fastapi import APIRouter, Depends, HTTPException, Response, status
from infrastructure.persistence.models import StationAudit2ConfigORM
from infrastructure.persistence.unit_of_work import UnitOfWork

router = APIRouter(
    prefix="/api/v1/projects/{project_id}/audit2-station-config",
    tags=["Audit2 Station Config"],
)


def _model_projektu(
    project_id: UUID, uow_factory: Callable[[], object]
) -> EnergyNetworkModel | None:
    """Model ENM projektu albo `None`, gdy projekt nie ma modelu.

    Klucz magazynu WYŁĄCZNIE przez tłumacza `application/twin_key.py` (migracja zastanych
    plików per przypadek przed odczytem).
    """
    klucz = klucz_twin_dla_projektu(project_id, uow_factory)
    return get_enm(klucz) if has_enm(klucz) else None


def _to_dict(orm: StationAudit2ConfigORM) -> dict[str, Any]:
    return {
        "id": str(orm.id),
        "project_id": str(orm.project_id),
        "station_id": orm.station_id,
        "mv_neutral_grounding_ref": orm.mv_neutral_grounding_ref,
        "tap_changer_refs": list(orm.tap_changer_refs or []),
        "der_specs": list(orm.der_specs or []),
        "transformer_tap_changers": dict(orm.transformer_tap_changers or {}),
        "bay_hv_fuses": dict(orm.bay_hv_fuses or {}),
        "bay_vts": dict(orm.bay_vts or {}),
        "bay_device_withstand": dict(orm.bay_device_withstand or {}),
        "created_at": orm.created_at.isoformat() if orm.created_at else None,
        "updated_at": orm.updated_at.isoformat() if orm.updated_at else None,
    }


@router.get("")
def list_station_audit2_configs(
    project_id: UUID,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> list[dict[str, Any]]:
    """Lista wszystkich konfiguracji audytu 2 dla projektu."""
    with uow_factory() as uow:
        rows = uow.audit2_station_configs.list_for_project(project_id)
        return [_to_dict(row) for row in rows]


@router.get("/{station_id:path}")
def get_station_audit2_config(
    project_id: UUID,
    station_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """Pobiera konfiguracje audytu 2 dla (project_id, station_id)."""
    with uow_factory() as uow:
        row = uow.audit2_station_configs.get(project_id, station_id)
        if row is None:
            # 404 gdy brak — frontend traktuje jako pusta konfiguracja.
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Brak audit2 config dla project={project_id} station={station_id}",
            )
        return _to_dict(row)


@router.put("/{station_id:path}")
def upsert_station_audit2_config(
    project_id: UUID,
    station_id: str,
    body: StationAudit2ConfigBody,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    UPSERT konfiguracji audytu 2.

    Jesli wiersz istnieje (project_id, station_id) - update.
    Jesli nie - insert nowy.
    """
    with uow_factory() as uow:
        # CV-4.2b: UPSERT przez repozytorium (identyfikator istniejącego wiersza
        # zachowany — pin `test_put_upserts_existing_config`).
        row = uow.audit2_station_configs.upsert(
            project_id,
            station_id,
            mv_neutral_grounding_ref=body.mv_neutral_grounding_ref,
            tap_changer_refs=list(body.tap_changer_refs),
            der_specs=[spec.model_dump() for spec in body.der_specs],
            transformer_tap_changers=dict(body.transformer_tap_changers),
            bay_hv_fuses=dict(body.bay_hv_fuses),
            bay_vts=dict(body.bay_vts),
            bay_device_withstand={k: v.model_dump() for k, v in body.bay_device_withstand.items()},
        )
        return _to_dict(row)


@router.delete("/{station_id:path}", status_code=status.HTTP_204_NO_CONTENT)
def delete_station_audit2_config(
    project_id: UUID,
    station_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> Response:
    """Usuwa konfiguracje audytu 2 dla (project_id, station_id)."""
    with uow_factory() as uow:
        if not uow.audit2_station_configs.delete(project_id, station_id):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brak konfiguracji")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{station_id:path}/_apply-to-network-model")
def apply_audit2_to_network_model_endpoint(
    project_id: UUID,
    station_id: str,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Phase 26: aplikuje audit2 config (z DB) do dummy graph i zwraca audit trail
    aplikowanych zmian. Sprawdza ze pelna petla dziala:
      DB audit2 config -> build_station_audit2_payload ->
      extract_solver_extensions -> apply_audit2_to_network_model -> applied dict.

    Endpoint dla diagnostyki + integracji UI (uruchamia adjustment przed run'em).
    """
    from solver_input.audit2_der_payload import rozszerzenia_audit2_z_konfiguracji
    from solver_input.audit2_solver_adjuster import apply_audit2_to_network_model

    with uow_factory() as uow:
        cfg = uow.audit2_station_configs.get(project_id, station_id)
        if cfg is None:
            raise HTTPException(status_code=404, detail="Brak audit2 config")

        # CV-4.2b: ta sama droga wiersz -> rozszerzenia co w biegu kanonicznym.
        extensions = rozszerzenia_audit2_z_konfiguracji(cfg)

        # Dummy graph z transformerami z config'u (do diagnostyki integracji).
        class _DummyTr:
            def __init__(self, tr_id: str):
                self.id = tr_id
                self.tap_position = 5  # pre-adjustment
                self.tap_step_percent = 2.5
                self.uk_percent = 6.0
                self.pk_kw = 24.0
                self.p0_kw = 3.5
                self.i0_percent = 0.4

        class _DummyGraph:
            def __init__(self, tr_ids: list[str]):
                self.branches = {tid: _DummyTr(tid) for tid in tr_ids}

        graph = _DummyGraph(list((cfg.transformer_tap_changers or {}).keys()))
        applied = apply_audit2_to_network_model(graph=graph, audit2_extensions=extensions)

        # Zwracaj audit trail + post-adjustment branch state (snapshot dla frontendu).
        return {
            "project_id": str(project_id),
            "station_id": station_id,
            "applied": applied,
            "extensions": extensions,
            "post_adjustment_branches": {
                tid: {
                    "tap_position": br.tap_position,
                    "tap_step_percent": br.tap_step_percent,
                    "uk_percent": br.uk_percent,
                    "pk_kw": br.pk_kw,
                }
                for tid, br in graph.branches.items()
            },
        }


@router.post("/_validate-all")
def validate_all_audit2(
    project_id: UUID,
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Pakiet dowodów walidacji rozszerzeń dla KAŻDEJ stacji z zapisaną konfiguracją.

    Jedyna droga produktu do pakietu (karta PROOFPACK-KONTRAKT): pakiet składa backend
    z utrwalonych konfiguracji stacji i z modelu sieci projektu
    (`application.proof_engine.packs.audit2_skladanie`) — nazwy z modelu, bilans mocy
    w backendzie, rodzaj bez danych jawnie oznaczony z przyczyną. Dawna końcówka
    `POST /api/v1/catalog/audit2/generate-proof-pack` (nietypowane specyfikacje
    składane przez interfejs) została usunięta.

    Bezpieczne: nie modyfikuje modelu ani konfiguracji; te same dane dają te same bajty.
    """
    with uow_factory() as uow:
        wiersze = [_to_dict(row) for row in uow.audit2_station_configs.list_for_project(project_id)]
    pakiety = zloz_pakiety_projektu(wiersze, _model_projektu(project_id, uow_factory))
    return {
        "project_id": str(project_id),
        "all_pass": all(pakiet.all_pass for pakiet in pakiety),
        "station_count": len(pakiety),
        "per_station": [pakiet.to_dict() for pakiet in pakiety],
    }
