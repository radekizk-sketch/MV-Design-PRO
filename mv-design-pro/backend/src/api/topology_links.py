"""
Topology Links API — PR-29

Endpoints for topology link management (relay↔CB↔target mapping).

INVARIANTS:
- No physics calculations (NOT-A-SOLVER)
- 100% Polish error messages and field descriptions
- Deterministic responses (sorted, SHA-256 signed)
- WHITE BOX trace in all responses
"""

from __future__ import annotations

from typing import Any

from domain.topology_links import (
    DuplicateLinkError,
    OrphanRelayError,
    TopologyLink,
    TopologyLinkError,
    build_topology_link_set,
    resolve_relay_to_target,
)
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(
    prefix="/api/topology-links",
    tags=["topology-links"],
)


# =============================================================================
# REQUEST / RESPONSE MODELS
# =============================================================================


class TopologyLinkDTO(BaseModel):
    """Pojedyncze powiązanie topologiczne: przekaźnik → wyłącznik → element."""

    link_id: str = Field(
        ...,
        min_length=1,
        description="Unikalny identyfikator powiązania topologicznego",
    )
    relay_id: str = Field(
        ...,
        min_length=1,
        description="Identyfikator przekaźnika zabezpieczeniowego",
    )
    cb_id: str = Field(
        ...,
        min_length=1,
        description="Identyfikator wyłącznika (CB) z modelu sieci",
    )
    target_ref: str = Field(
        ...,
        min_length=1,
        description="Identyfikator chronionego elementu (linia/szyna)",
    )
    station_id: str | None = Field(
        None,
        description="Identyfikator stacji (opcjonalny kontener logiczny)",
    )
    label_pl: str | None = Field(
        None,
        description="Etykieta polska (opis czytelny dla użytkownika)",
    )


class TopologyLinkSetRequest(BaseModel):
    """Żądanie utworzenia/aktualizacji zbioru powiązań topologicznych."""

    links: list[TopologyLinkDTO] = Field(
        ...,
        description="Lista powiązań topologicznych do zarejestrowania",
    )


class TopologyLinkResponse(BaseModel):
    """Odpowiedź z pojedynczym powiązaniem topologicznym."""

    link_id: str = Field(..., description="Identyfikator powiązania")
    relay_id: str = Field(..., description="Identyfikator przekaźnika")
    cb_id: str = Field(..., description="Identyfikator wyłącznika")
    target_ref: str = Field(..., description="Identyfikator elementu chronionego")
    station_id: str | None = Field(None, description="Identyfikator stacji")
    label_pl: str | None = Field(None, description="Etykieta polska")


class TopologyLinkSetResponse(BaseModel):
    """Odpowiedź ze zbiorem powiązań topologicznych."""

    status: str = Field(..., description="Status operacji")
    links: list[TopologyLinkResponse] = Field(
        ..., description="Posortowane powiązania topologiczne"
    )
    deterministic_signature: str = Field(
        ..., description="Podpis SHA-256 zbioru (deterministyczny)"
    )
    trace: dict[str, Any] = Field(..., description="Ślad WHITE BOX do audytu")


class ResolveResponse(BaseModel):
    """Odpowiedź rozwiązania powiązania przekaźnik → wyłącznik → cel."""

    relay_id: str = Field(..., description="Identyfikator przekaźnika")
    cb_id: str = Field(..., description="Rozwiązany identyfikator wyłącznika")
    target_ref: str = Field(..., description="Rozwiązany identyfikator elementu chronionego")
    link_id: str = Field(..., description="Identyfikator powiązania źródłowego")


# =============================================================================
# IN-MEMORY STORAGE for the process-local topology-link adapter
# =============================================================================

# project_id → TopologyLinkSet (serialized dict)
_storage: dict[str, dict[str, Any]] = {}


# =============================================================================
# ENDPOINTS
# =============================================================================


@router.get(
    "/{project_id}",
    status_code=status.HTTP_200_OK,
    summary="Pobierz powiązania topologiczne projektu",
)
def get_topology_links(project_id: str) -> dict[str, Any]:
    """
    Zwraca wszystkie powiązania topologiczne dla projektu.

    Returns:
        Zbiór powiązań topologicznych z podpisem deterministycznym.
    """
    stored = _storage.get(project_id)
    if stored is None:
        # Return empty link set for new projects
        empty_set = build_topology_link_set(())
        return {
            "status": "OK",
            "project_id": project_id,
            "links": [],
            "deterministic_signature": empty_set.deterministic_signature,
            "trace": empty_set.trace,
        }

    return {
        "status": "OK",
        "project_id": project_id,
        **stored,
    }


@router.post(
    "/{project_id}",
    status_code=status.HTTP_200_OK,
    summary="Utwórz/aktualizuj powiązania topologiczne",
)
def create_or_update_topology_links(
    project_id: str,
    request: TopologyLinkSetRequest,
) -> dict[str, Any]:
    """
    Tworzy lub aktualizuje zbiór powiązań topologicznych dla projektu.

    Waliduje dane wejściowe, sortuje deterministycznie i generuje
    podpis SHA-256.

    Raises:
        400: Nieprawidłowe dane (zduplikowane ID, puste pola, samoreferencja)
    """
    try:
        # Convert DTOs to domain objects
        domain_links = tuple(
            TopologyLink(
                link_id=dto.link_id,
                relay_id=dto.relay_id,
                cb_id=dto.cb_id,
                target_ref=dto.target_ref,
                station_id=dto.station_id,
                label_pl=dto.label_pl,
            )
            for dto in request.links
        )

        # Build validated, signed link set
        link_set = build_topology_link_set(domain_links)

        # Store result
        result = link_set.to_dict()
        _storage[project_id] = result

        return {
            "status": "OK",
            "project_id": project_id,
            **result,
        }

    except DuplicateLinkError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": exc.code,
                "message_pl": exc.message_pl,
                "link_id": exc.link_id,
            },
        ) from exc
    except TopologyLinkError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": exc.code,
                "message_pl": exc.message_pl,
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nieprawidłowe dane wejściowe: {exc}",
        ) from exc


@router.get(
    "/{project_id}/resolve/{relay_id}",
    status_code=status.HTTP_200_OK,
    summary="Rozwiąż powiązanie przekaźnika",
)
def resolve_relay(
    project_id: str,
    relay_id: str,
) -> dict[str, Any]:
    """
    Rozwiązuje powiązanie przekaźnika do wyłącznika i elementu chronionego.

    Dla podanego relay_id zwraca cb_id i target_ref.

    Raises:
        404: Projekt nie posiada powiązań topologicznych
        404: Przekaźnik nie znaleziony w powiązaniach
    """
    stored = _storage.get(project_id)
    if stored is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "topology.project_not_found",
                "message_pl": (
                    f"Projekt {project_id} nie posiada powiązań "
                    f"topologicznych. Utwórz je najpierw."
                ),
            },
        )

    # Rebuild link set from stored data
    from domain.topology_links import TopologyLinkSet

    link_set = TopologyLinkSet.from_dict(stored)

    try:
        cb_id, target_ref = resolve_relay_to_target(link_set, relay_id)
    except OrphanRelayError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": exc.code,
                "message_pl": exc.message_pl,
                "relay_id": exc.relay_id,
            },
        ) from exc

    # Find the link_id for audit
    source_link_id = ""
    for link in link_set.links:
        if link.relay_id == relay_id:
            source_link_id = link.link_id
            break

    return {
        "status": "OK",
        "relay_id": relay_id,
        "cb_id": cb_id,
        "target_ref": target_ref,
        "link_id": source_link_id,
        "project_id": project_id,
    }
