"""R14 — IZOLowany adapter laboratoryjny DIGPRO -> kanoniczne operacje ENM.

Domyślnie endpoint nie jest montowany. Nie jest autoryzacją produkcyjną.
Służy do dowodu pojedynczego zapisu całej grupy pod blokadą jednego procesu.
"""
from __future__ import annotations

import os
from typing import Any

from api.klucz_twin_dep import KluczTwin
from api.domain_ops_policy import (
    extract_catalog_binding, validate_and_materialize_catalog_binding,
)
from application.gis.digpro_atomic_r14 import (
    AtomicImportRejected, commit_once, prepare_atomic_import,
)
from domain.canonical_operations import resolve_operation_name
from enm.domain_operations import execute_domain_operation
from enm.katalog_projektu import kontekst_katalogu
from enm.models import EnergyNetworkModel
from enm.store import ZrodloZmiany, blokada_twin
from enm.store import get_enm as _get_enm
from enm.store import set_enm as _set_enm
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix="/api/gis-lab/r14", tags=["gis-r14-atomic-laboratory"])

# Początkowy, nieusuwający zakres; nie zamienia importu w edytor grafu poza ENM.
DOPUSZCZONE = frozenset({
    "add_grid_source_sn", "add_gpz_section", "add_sn_bay",
    "continue_trunk_segment_sn", "start_branch_segment_sn",
    "insert_station_on_segment_sn", "insert_section_switch_sn",
    "add_transformer_sn_nn", "add_nn_outgoing_field", "add_nn_load",
})
BLOKADY = frozenset({"BLOCKER", "ERROR", "CRITICAL"})


class GisAtomicStep(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    step_id: str = Field(min_length=1, max_length=120)
    source_id: str = Field(min_length=1, max_length=160)
    name: str = Field(min_length=1, max_length=120)
    idempotency_key: str = Field(min_length=8, max_length=120)
    payload: dict[str, Any]


class GisAtomicRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    schema_name: str = Field(pattern=r"^MV-DIGPRO-R14-ATOMIC$")
    base_enm_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    engineer_approved: bool
    staged_geojson_verified: bool
    confirmed_ports: bool
    operations: list[GisAtomicStep] = Field(min_length=1, max_length=128)


def _safe_payload(value: Any, *, depth: int = 0) -> bool:
    if depth > 20:
        return False
    if isinstance(value, dict):
        if len(value) > 256:
            return False
        for key, inner in value.items():
            if not isinstance(key, str) or key.casefold() in {
                "pesel", "ppe", "phone", "telefon", "nazwisko", "email",
                "customer_id", "meter_id", "odbiorca",
            } or not _safe_payload(inner, depth=depth + 1):
                return False
        return True
    if isinstance(value, list):
        return len(value) <= 1024 and all(_safe_payload(v, depth=depth + 1) for v in value)
    return isinstance(value, str | int | float | bool | type(None))


def _canonical_checked(snapshot: dict[str, Any], name: str, payload: dict[str, Any]) -> dict[str, Any]:
    from api.enm import rozbieznosc_wobec_bramy

    if name not in DOPUSZCZONE or resolve_operation_name(name) != name:
        raise AtomicImportRejected("NON_CANONICAL_OR_FORBIDDEN_OPERATION")
    if not _safe_payload(payload):
        raise AtomicImportRejected("PAYLOAD_UNSAFE")
    with kontekst_katalogu(snapshot):
        policy_error, catalog_fields = validate_and_materialize_catalog_binding(name, payload)
    if policy_error is not None:
        raise AtomicImportRejected("CATALOG_BINDING_REJECTED")
    result = execute_domain_operation(enm_dict=snapshot, op_name=name, payload=payload)
    if result.get("error") or result.get("error_code"):
        raise AtomicImportRejected("DOMAIN_OPERATION_REJECTED")
    changes = result.get("changes") or {}
    divergence = rozbieznosc_wobec_bramy(
        catalog_fields, extract_catalog_binding(name, payload),
        result.get("snapshot"),
        [*(changes.get("created_element_ids") or ()),
         *(changes.get("updated_element_ids") or ())],
    )
    if divergence is not None:
        raise AtomicImportRejected("CATALOG_RESULT_MISMATCH")
    issues = result.get("semantic_issues") or ()
    if any(isinstance(issue, dict) and
           str(issue.get("severity", "")).upper() in BLOKADY for issue in issues):
        raise AtomicImportRejected("SEMANTIC_BLOCKER")
    return result


def _allowed_environment(request: Request) -> bool:
    host = request.client.host if request.client else ""
    environment = (
        os.getenv("MV_DESIGN_ENV", "") or os.getenv("ENVIRONMENT", "") or os.getenv("APP_ENV", "")
    ).lower()
    return (
        os.getenv("MV_GIS_R14_ATOMIC_ENABLED") == "1"
        and environment in {"development", "test", "testing"}
        and host in {"127.0.0.1", "::1", "localhost"}
    )


@router.post("/cases/{case_id}/atomic-import")
def import_gis_atomowo(
    case_id: str, klucz: KluczTwin, body: GisAtomicRequest, request: Request,
) -> dict[str, Any]:
    """JEDEN zapis ENM dla 1–128 operacji; zakaz uruchomienia produkcyjnego.

    To kontrola na serwerze JEDNOPROCESOWYM; brak DB transaction cross-worker.
    """
    if not _allowed_environment(request):
        raise HTTPException(status_code=404, detail={"code": "GIS_R14_DISABLED"})
    if not (body.engineer_approved and body.staged_geojson_verified and body.confirmed_ports):
        raise HTTPException(status_code=422, detail={"code": "GIS_APPROVAL_MISSING"})
    operations = [item.model_dump(mode="python") for item in body.operations]
    if len({s["source_id"] for s in operations}) > 50000:
        raise HTTPException(status_code=422, detail={"code": "GIS_SOURCE_SCOPE_INVALID"})
    with blokada_twin(klucz):
        current = _get_enm(klucz)
        original = current.model_dump(mode="json")
        try:
            prepared = prepare_atomic_import(
                original,
                expected_hash=body.base_enm_hash,
                operations=operations,
                execute_canonical_operation=_canonical_checked,
            )
            # Przed jedynym zapisem: pełna walidacja Pydantic ENM.
            EnergyNetworkModel.model_validate(prepared.snapshot)

            def save(snapshot: dict[str, Any], evidence: Any) -> dict[str, Any]:
                candidate = EnergyNetworkModel.model_validate(snapshot)
                reason = ZrodloZmiany(
                    operacja=None,
                    utworzone=evidence.created_refs,
                    zmienione=evidence.updated_refs,
                    usuniete=(),
                    opis_pl="Zatwierdzony, wieloelementowy import GIS — laboratorium DIGPRO",
                    ladunek={
                        "source_sha256": body.source_sha256,
                        "schema_name": body.schema_name,
                        "steps": [
                            {"source_id": item.source_id, "step_id": item.step_id,
                             "operation": item.name, "payload": item.payload}
                            for item in body.operations
                        ],
                    },
                )
                return _set_enm(klucz, candidate, zrodlo_zmiany=reason).model_dump(mode="json")

            result = commit_once(
                read_current=lambda: _get_enm(klucz).model_dump(mode="json"),
                save_once=save,
                expected_hash=body.base_enm_hash,
                prepared=prepared,
            )
        except AtomicImportRejected as error:
            raise HTTPException(
                status_code=409 if "CONFLICT" in error.code else 422,
                detail={"code": error.code, "step": error.step},
            ) from error
    return {"schema": "MV-GIS-ATOMIC-RESULT-R14",
            "source_sha256": body.source_sha256,
            "production_approved": False,
            "electrical_topology_independently_verified": False,
            **result}
