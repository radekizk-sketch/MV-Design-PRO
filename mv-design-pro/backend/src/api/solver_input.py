"""
API endpoints for solver-input contract (read-only, no side-effects).

Endpoints:
    GET /api/cases/{case_id}/analysis/solver-input/{analysis_type}
    GET /api/cases/{case_id}/analysis/eligibility
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from api.dependencies import get_uow_factory
from api.klucz_twin_dep import KluczTwin
from domain.study_case import StudyCaseConfig
from enm.assembler import zbuduj_graf, zloz_wejscie_rozplywu, zloz_wejscie_zwarcia
from enm.store import get_enm
from fastapi import APIRouter, Depends, HTTPException, Path
from infrastructure.persistence.unit_of_work import UnitOfWork
from network_model.catalog.repository import get_default_mv_catalog
from network_model.core.graph import NetworkGraph
from pydantic import BaseModel
from solver_input.builder import build_solver_input
from solver_input.contracts import (
    SolverAnalysisType,
)
from solver_input.eligibility import build_eligibility_map

router = APIRouter(
    prefix="/api/cases",
    tags=["solver-input"],
)


def _graph_for_analysis(
    *,
    klucz: str,
    analysis_type: SolverAnalysisType,
    scenario_lower: str,
    solver_options: dict[str, Any],
    rozszerzenia_audit2: dict[str, Any] | None,
) -> NetworkGraph:
    """Karta CV-4.2: kontrakt P11 wypełniany PRZEZ assembler (`zloz_wejscie_*`),
    nie przez pusty graf-stub (P11 przed kartą zawsze budował payload z
    ``NetworkGraph(network_model_id=case_id)`` — 0 elementów, niezależnie od
    realnego modelu przypadku). Zero własnego składania slacka/PQ/PV/Z0
    równolegle do assemblera — ten sam ``zloz_wejscie_rozplywu``/
    ``zloz_wejscie_zwarcia`` co tor kanoniczny biegów.

    PROTECTION nie ma własnej analizy assemblera (payload jest jawnym stubem
    w ``build_solver_input``) — wystarcza IR bez montażu PF/SC.

    ``rozszerzenia_audit2`` (CV-4.2b): rozszerzenia z konfiguracji audytu 2 stacji
    odczytanej RAZ fabryką ``UnitOfWork`` żądania — assembler dostaje dane, nie
    otwiera bazy (do tej karty czytał ją drugi raz własnym silnikiem z
    ``DATABASE_URL``, więc kontrakt P11 potrafił nie widzieć zapisanej konfiguracji).
    """
    snapshot = get_enm(klucz).model_dump(mode="json")
    if analysis_type == SolverAnalysisType.LOAD_FLOW:
        return zloz_wejscie_rozplywu(
            snapshot, solver_options, rozszerzenia_audit2=rozszerzenia_audit2
        ).graph
    if analysis_type in (
        SolverAnalysisType.SHORT_CIRCUIT_3F,
        SolverAnalysisType.SHORT_CIRCUIT_1F,
    ):
        sc_options = dict(solver_options)
        sc_options["fault_type"] = (
            "3F" if analysis_type == SolverAnalysisType.SHORT_CIRCUIT_3F else "1F"
        )
        sc_options["scenario"] = scenario_lower
        return zloz_wejscie_zwarcia(
            snapshot, sc_options, rozszerzenia_audit2=rozszerzenia_audit2
        ).graph
    return zbuduj_graf(snapshot)


def _get_config_for_case(case_id: str) -> StudyCaseConfig:
    """Stub: retrieve StudyCaseConfig for a given case."""
    return StudyCaseConfig()


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------


class SolverInputResponse(BaseModel):
    """Response wrapper for solver-input endpoint."""

    solver_input_version: str
    case_id: str
    enm_revision: str
    analysis_type: str
    eligibility: dict[str, Any]
    provenance_summary: dict[str, Any]
    payload: dict[str, Any]
    trace: list[dict[str, Any]]
    # Phase 17: audit2 extensions exposed via API for solver consumers.
    audit2_extensions: dict[str, Any] | None = None


class EligibilityMapResponse(BaseModel):
    """Response wrapper for eligibility endpoint."""

    entries: list[dict[str, Any]]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "/{case_id}/analysis/solver-input/{analysis_type}",
    response_model=SolverInputResponse,
    summary="Get solver-input envelope for a specific analysis type",
    description=(
        "Returns the canonical solver-input envelope with payload, "
        "eligibility, and provenance trace. Read-only, no side-effects."
    ),
)
def get_solver_input(
    klucz: KluczTwin,
    case_id: str = Path(..., description="Study case ID"),
    analysis_type: str = Path(
        ...,
        description="Analysis type: short_circuit_3f, short_circuit_1f, load_flow, protection",
    ),
    project_id: str | None = None,
    station_id: str | None = None,
    scenario: str = "MAX",
    uow_factory: Callable[[], UnitOfWork] = Depends(get_uow_factory),
) -> SolverInputResponse:
    """
    Generate and return solver-input for the given case and analysis type.

    Karta CV-4.2: wejście budowane PRZEZ assembler (`zloz_wejscie_rozplywu`/
    `zloz_wejscie_zwarcia`) z REALNEJ migawki ENM przypadku (`klucz` — CV-1-W),
    nie z pustego grafu-stubu.

    Phase 17 / CV-4.2b: jesli `project_id` + `station_id` przekazane, konfiguracja
    audytu 2 jest czytana RAZ (fabryka `UnitOfWork` żądania, repozytorium
    `audit2_station_configs`) i idzie w DWA miejsca: do envelope
    (`audit2_extensions`) oraz — jako rozszerzenia solvera — do assemblera,
    więc payload odzwierciedla model PO korektach audit2 (tap/statyzm/impedancja
    bloku), nie tylko surowy model obok osobno raportowanych rozszerzeń.
    Niepoprawny UUID projektu = 400 (nie cichy payload bez konfiguracji).

    Karta P0.3: `scenario` (MAX default | MIN) selects the IEC 60909-0
    Table 1 voltage factor c per bus (BusPayload.c_factor_iec60909) — see
    docs/nn/H_PLAN_IMPLEMENTACJI_NN.md §P0.3.
    """
    # Validate analysis_type
    try:
        at = SolverAnalysisType(analysis_type)
    except ValueError:
        valid_types = [t.value for t in SolverAnalysisType]
        raise HTTPException(
            status_code=400,
            detail=f"Invalid analysis_type '{analysis_type}'. Valid: {valid_types}",
        )

    scenario_normalized = scenario.upper()
    if scenario_normalized not in ("MAX", "MIN"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid scenario '{scenario}'. Valid: ['MAX', 'MIN']",
        )

    # Phase 17 / CV-4.2b: konfiguracja audytu 2 z bazy RAZ, fabryką UnitOfWork żądania.
    audit2_payload: dict[str, Any] | None = None
    rozszerzenia_audit2: dict[str, Any] | None = None
    if project_id and station_id:
        from uuid import UUID

        from solver_input.audit2_der_payload import rozszerzenia_audit2_z_konfiguracji

        try:
            pid_uuid = UUID(project_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=400, detail=f"project_id nie jest poprawnym UUID: {project_id!r}"
            ) from exc
        with uow_factory() as uow:
            cfg = uow.audit2_station_configs.get(pid_uuid, station_id)
            if cfg is not None:
                audit2_payload = {
                    "station_id": cfg.station_id,
                    "mv_neutral_grounding_ref": cfg.mv_neutral_grounding_ref,
                    "tap_changer_refs": list(cfg.tap_changer_refs or []),
                    "der_specs": list(cfg.der_specs or []),
                    # Phase 22: per-transformer mapping dla apply_audit2_to_network_model.
                    "transformer_tap_changers": dict(cfg.transformer_tap_changers or {}),
                }
                rozszerzenia_audit2 = rozszerzenia_audit2_z_konfiguracji(cfg)

    try:
        graph = _graph_for_analysis(
            klucz=klucz,
            analysis_type=at,
            scenario_lower=scenario_normalized.lower(),
            solver_options={},
            rozszerzenia_audit2=rozszerzenia_audit2,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    config = _get_config_for_case(case_id)
    catalog = get_default_mv_catalog()

    envelope = build_solver_input(
        graph=graph,
        catalog=catalog,
        case_id=case_id,
        enm_revision="current",
        analysis_type=at,
        config=config,
        audit2_station_payload=audit2_payload,
        scenario=scenario_normalized,  # type: ignore[arg-type]
    )

    return SolverInputResponse(
        solver_input_version=envelope.solver_input_version,
        case_id=envelope.case_id,
        enm_revision=envelope.enm_revision,
        analysis_type=envelope.analysis_type.value,
        eligibility=envelope.eligibility.model_dump(mode="json"),
        provenance_summary=envelope.provenance_summary.model_dump(mode="json"),
        payload=envelope.payload,
        trace=[t.model_dump(mode="json") for t in envelope.trace],
        audit2_extensions=envelope.audit2_extensions,
    )


@router.get(
    "/{case_id}/analysis/eligibility",
    response_model=EligibilityMapResponse,
    summary="Get eligibility map for all analysis types",
    description=(
        "Returns eligibility status (READY/NOT_READY + blockers/warnings) "
        "for each analysis type. Read-only, no side-effects."
    ),
)
def get_eligibility(
    klucz: KluczTwin,
    case_id: str = Path(..., description="Study case ID"),
) -> EligibilityMapResponse:
    """Check eligibility for all analysis types for the given case.

    Karta CV-4.2: IR budowany z REALNEJ migawki ENM przypadku (`zbuduj_graf`,
    ten sam assembler co reszta toru kanonicznego), nie z pustego grafu-stubu.
    """
    graph = zbuduj_graf(get_enm(klucz).model_dump(mode="json"))
    catalog = get_default_mv_catalog()

    emap = build_eligibility_map(graph, catalog)

    return EligibilityMapResponse(
        entries=[e.model_dump(mode="json") for e in emap.entries],
    )
