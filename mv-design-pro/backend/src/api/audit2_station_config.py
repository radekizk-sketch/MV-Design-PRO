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
    # Phase 23: real device + power persisted (nie wiecej median fallback).
    device_catalog_ref: str | None = None
    nominal_power_kw: float | None = None


class BayDeviceWithstandSpec(BaseModel):
    device_id: str
    i_peak_calculated_ka: float
    i_thermal_calculated_ka: float
    t_clearing_s: float


class StationAudit2ConfigBody(BaseModel):
    mv_neutral_grounding_ref: str | None = None
    tap_changer_refs: list[str] = Field(default_factory=list)
    der_specs: list[DerAudit2SpecPayload] = Field(default_factory=list)
    # Phase 8: per-transformer/bay mappings.
    transformer_tap_changers: dict[str, str] = Field(default_factory=dict)
    bay_hv_fuses: dict[str, str] = Field(default_factory=dict)
    bay_vts: dict[str, str] = Field(default_factory=dict)
    bay_device_withstand: dict[str, BayDeviceWithstandSpec] = Field(default_factory=dict)


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
            existing.transformer_tap_changers = dict(body.transformer_tap_changers)
            existing.bay_hv_fuses = dict(body.bay_hv_fuses)
            existing.bay_vts = dict(body.bay_vts)
            existing.bay_device_withstand = {
                k: v.model_dump() for k, v in body.bay_device_withstand.items()
            }
            uow.session.flush()
            return _to_dict(existing)

        new_row = StationAudit2ConfigORM(
            id=uuid4(),
            project_id=project_id,
            station_id=station_id,
            mv_neutral_grounding_ref=body.mv_neutral_grounding_ref,
            tap_changer_refs=list(body.tap_changer_refs),
            der_specs=[spec.model_dump() for spec in body.der_specs],
            transformer_tap_changers=dict(body.transformer_tap_changers),
            bay_hv_fuses=dict(body.bay_hv_fuses),
            bay_vts=dict(body.bay_vts),
            bay_device_withstand={
                k: v.model_dump() for k, v in body.bay_device_withstand.items()
            },
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


@router.post("/{station_id}/_apply-to-network-model")
def apply_audit2_to_network_model_endpoint(
    project_id: UUID,
    station_id: str,
    uow_factory=Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Phase 26: aplikuje audit2 config (z DB) do dummy graph i zwraca audit trail
    aplikowanych zmian. Sprawdza ze pelna petla dziala:
      DB audit2 config -> build_station_audit2_payload ->
      extract_solver_extensions -> apply_audit2_to_network_model -> applied dict.

    Endpoint dla diagnostyki + integracji UI (uruchamia adjustment przed run'em).
    """
    from solver_input.audit2_der_payload import (
        build_station_audit2_payload,
        extract_solver_extensions_from_payload,
    )
    from solver_input.audit2_solver_adjuster import apply_audit2_to_network_model

    with uow_factory() as uow:
        assert uow.session is not None
        cfg = (
            uow.session.query(StationAudit2ConfigORM)
            .filter(
                StationAudit2ConfigORM.project_id == project_id,
                StationAudit2ConfigORM.station_id == station_id,
            )
            .one_or_none()
        )
        if cfg is None:
            raise HTTPException(status_code=404, detail="Brak audit2 config")

        payload = build_station_audit2_payload(
            station_id=cfg.station_id,
            mv_neutral_grounding_ref=cfg.mv_neutral_grounding_ref,
            tap_changer_refs=list(cfg.tap_changer_refs or []),
            der_specs=list(cfg.der_specs or []),
            transformer_tap_changers=dict(cfg.transformer_tap_changers or {}),
        )
        extensions = extract_solver_extensions_from_payload(payload)

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
    uow_factory=Depends(get_uow_factory),
) -> dict[str, Any]:
    """
    Phase 13: walidacja audytu 2 dla wszystkich stacji projektu (parallel to physics).

    Wywoluje walidatory + proof packs dla kazdej zapisanej stacji w projekcie.
    Zwraca agregat: per-station + global pass/fail.

    Bezpieczne: nie modyfikuje physics solvers, dziala obok istniejacego pipeline'u.
    """
    from application.proof_engine.packs.audit2_validation import (
        generate_device_withstand_proof,
        generate_hosting_capacity_export_proof,
        generate_station_audit2_proof_pack,
        generate_tap_changer_plan_proof,
        generate_vt_grounding_validation_proof,
    )
    from network_model.catalog.audit2_catalogs import (
        VT_CATALOG_FOR_FACTOR,
        estimate_der_power_kw,
        get_tap_changer,
    )

    with uow_factory() as uow:
        assert uow.session is not None
        configs = (
            uow.session.query(StationAudit2ConfigORM)
            .filter(StationAudit2ConfigORM.project_id == project_id)
            .all()
        )
        per_station_results: list[dict[str, Any]] = []
        all_pass = True

        for cfg in configs:
            proofs = []
            # Phase 23: hosting capacity z realnych mocy DER. Priorytet:
            # 1. spec["nominal_power_kw"] (jesli zapisane przy attach DER)
            # 2. block_transformer.sn_kva (z catalogu)
            # 3. estimate (median per kind) — ostatnia deska ratunku.
            if cfg.der_specs:
                p_export_real = 0.0
                for spec in cfg.der_specs:
                    if not isinstance(spec, dict):
                        continue
                    real_p = spec.get("nominal_power_kw")
                    if real_p is not None:
                        p_export_real += float(real_p)
                    else:
                        p_export_real += estimate_der_power_kw(
                            der_kind=str(spec.get("der_kind", "")),
                            block_transformer_catalog_ref=spec.get("block_transformer_catalog_ref"),
                        )
                proofs.append(
                    generate_hosting_capacity_export_proof(
                        station_id=cfg.station_id,
                        p_export_kw=p_export_real,
                        p_import_kw=0.0,  # TODO: dolaczyc loady ze snapshotu
                    )
                )
            # Phase 20: tap-changer z realnym typem transformatora (ekstrakcja z catalog applicable_to).
            for tr_id, tc_ref in (cfg.transformer_tap_changers or {}).items():
                if not tc_ref:
                    continue
                tc = get_tap_changer(str(tc_ref))
                # Wybor typu transformatora: pierwszy applicable z katalogu (deterministyczne).
                tr_type = tc.applicable_to[0] if tc and tc.applicable_to else "transformer_15_04"
                proofs.append(
                    generate_tap_changer_plan_proof(
                        transformer_id=str(tr_id),
                        transformer_type=tr_type,
                        tap_changer_ref=str(tc_ref),
                        # AVR wymagany gdy tap-changer go obsluguje (real-data)
                        requires_avr=tc.supports_avr if tc else False,
                    )
                )
            # Phase 20: VT grounding z realnym voltage_factor z VT catalogu (nie hardcoded 1.9).
            grounding = cfg.mv_neutral_grounding_ref
            if grounding:
                grounding_type = (
                    "isolated"
                    if grounding == "mng_isolated"
                    else "petersen_coil"
                    if grounding == "mng_petersen"
                    else "resistor_grounded"
                    if grounding.startswith("mng_resistor")
                    else "directly_grounded"
                    if grounding == "mng_directly"
                    else "isolated"
                )
                for bay_id, vt_ref in (cfg.bay_vts or {}).items():
                    # Real voltage_factor z catalogu VT (zamiast 1.9 hardcoded).
                    vt_factor = VT_CATALOG_FOR_FACTOR.get(str(vt_ref), 1.9)
                    proofs.append(
                        generate_vt_grounding_validation_proof(
                            bay_designation=str(bay_id),
                            vt_voltage_factor=vt_factor,
                            grounding_type=grounding_type,
                        )
                    )
            # Device withstand (per bay).
            for bay_id, spec in (cfg.bay_device_withstand or {}).items():
                if isinstance(spec, dict):
                    proofs.append(
                        generate_device_withstand_proof(
                            device_id=str(spec.get("device_id", "")),
                            i_peak_calculated_ka=float(spec.get("i_peak_calculated_ka", 0)),
                            i_thermal_calculated_ka=float(spec.get("i_thermal_calculated_ka", 0)),
                            t_clearing_s=float(spec.get("t_clearing_s", 1.0)),
                        )
                    )

            pack = generate_station_audit2_proof_pack(
                station_id=cfg.station_id,
                proofs=proofs,
                generated_at_iso="1970-01-01T00:00:00Z",
            )
            per_station_results.append(pack.to_dict())
            if not pack.all_pass:
                all_pass = False

        return {
            "project_id": str(project_id),
            "all_pass": all_pass,
            "station_count": len(per_station_results),
            "per_station": per_station_results,
        }
