"""
Katalog punktów rozgałęzienia SN.

Pozycje reprezentują złożone byty techniczne osadzane na odcinku SN:
- słup rozgałęźny na linii napowietrznej,
- ZKSN na odcinku kablowym.

To nie jest katalog samej aparatury. Rekord opisuje cały obiekt
pośredni zgodnie z kontraktem branch point w ENM.
"""

from __future__ import annotations

from typing import Any

from .types import CATALOG_CONTRACT_VERSION, CatalogStatus, CatalogVerificationStatus

_DEFAULT_SOURCE_REFERENCE = "Matryca obiektów pośrednich SN MV-DESIGN-PRO / katalog branch point"


def _quality(note: str) -> dict[str, Any]:
    return {
        "verification_status": CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value,
        "source_reference": _DEFAULT_SOURCE_REFERENCE,
        "catalog_status": CatalogStatus.REFERENCYJNY_V1.value,
        "contract_version": CATALOG_CONTRACT_VERSION,
        "verification_note": note,
    }


def _route_ports(*, branch_ports_count: int, medium: str) -> list[dict[str, Any]]:
    ports = [
        {"port_id": "MAIN_IN", "role": "ciag_wejscie", "medium": medium},
        {"port_id": "MAIN_OUT", "role": "ciag_wyjscie", "medium": medium},
    ]
    ports.extend(
        {
            "port_id": f"BRANCH_{idx}" if branch_ports_count > 1 else "BRANCH",
            "role": "odgalezienie",
            "medium": medium,
        }
        for idx in range(1, branch_ports_count + 1)
    )
    return ports


def _zksn_field_specs(branch_ports_count: int) -> list[dict[str, Any]]:
    fields = [
        {
            "field_ref": "FIELD_IN",
            "designation": "WE",
            "bay_role": "IN",
            "field_type": "pole_liniowe",
            "port_id": "MAIN_IN",
        },
        {
            "field_ref": "FIELD_OUT",
            "designation": "WY",
            "bay_role": "OUT",
            "field_type": "pole_liniowe",
            "port_id": "MAIN_OUT",
        },
    ]
    fields.extend(
        {
            "field_ref": f"FIELD_BRANCH_{idx}",
            "designation": f"ODG {idx}",
            "bay_role": "BRANCH",
            "field_type": "pole_odgalezne",
            "port_id": f"BRANCH_{idx}" if branch_ports_count > 1 else "BRANCH",
        }
        for idx in range(1, branch_ports_count + 1)
    )
    return fields


def _zksn_solution(branch_ports_count: int) -> dict[str, Any]:
    return {
        "object_role": "MV_SWITCHGEAR_BRANCH_NODE",
        "standard_topology": "ZKSN_WITH_LINE_AND_BRANCH_FIELDS",
        "switchgear_kind": "ROZDZIELNIA_SN_BEZ_TRANSFORMATORA",
        "has_transformer": False,
        "route_ports": _route_ports(branch_ports_count=branch_ports_count, medium="CABLE"),
        "switchgear_field_specs": _zksn_field_specs(branch_ports_count),
    }


def _branch_pole_solution(
    *, switch_device_kind: str, switch_rated_current_a: float
) -> dict[str, Any]:
    return {
        "object_role": "OVERHEAD_BRANCH_POLE",
        "standard_topology": "OVERHEAD_LINE_POLE_WITH_BRANCH_SWITCH",
        "has_switchgear": False,
        "has_transformer": False,
        "route_ports": _route_ports(branch_ports_count=1, medium="LINE_OVERHEAD"),
        "apparatus_specs": [
            {
                "apparatus_role": "BRANCH_SWITCH",
                "device_kind": switch_device_kind,
                "rated_current_a": switch_rated_current_a,
                "port_id": "BRANCH",
            }
        ],
    }


BRANCH_POINT_TYPES: list[dict[str, Any]] = [
    {
        "id": "AFL-SLUP",
        "name": "Słup rozgałęźny SN AFL",
        "params": {
            "kind": "BRANCH_POLE",
            "medium": "LINE_OVERHEAD",
            "manufacturer": "MV-DESIGN-PRO",
            "series": "Słup rozgałęźny SN",
            "switch_device_kind": "ODLACZNIK",
            "switch_rated_current_a": 400.0,
            "branch_ports_count": 1,
            "topology_role": "BRANCH_POINT",
            "catalog_namespace": "mv_branch_points",
            **_branch_pole_solution(
                switch_device_kind="ODLACZNIK",
                switch_rated_current_a=400.0,
            ),
            **_quality(
                "Referencyjny słup rozgałęźny dla linii napowietrznej SN z jednym portem BRANCH."
            ),
        },
    },
    {
        "id": "SLUP-ODG-12",
        "name": "Słup odgałęźny 12/20 kV",
        "params": {
            "kind": "BRANCH_POLE",
            "medium": "LINE_OVERHEAD",
            "manufacturer": "MV-DESIGN-PRO",
            "series": "Słup rozgałęźny SN 12/20 kV",
            "switch_device_kind": "ROZLACZNIK",
            "switch_rated_current_a": 630.0,
            "branch_ports_count": 1,
            "topology_role": "BRANCH_POINT",
            "catalog_namespace": "mv_branch_points",
            **_branch_pole_solution(
                switch_device_kind="ROZLACZNIK",
                switch_rated_current_a=630.0,
            ),
            **_quality("Referencyjny słup odgałęźny z rozłącznikiem dla sieci napowietrznej SN."),
        },
    },
    {
        "id": "RSN-6",
        "name": "ZKSN przelotowy RSN-6",
        "params": {
            "kind": "ZKSN",
            "medium": "CABLE",
            "manufacturer": "MV-DESIGN-PRO",
            "series": "RSN",
            "switch_device_kind": "ROZLACZNIK",
            "switch_rated_current_a": 630.0,
            "branch_ports_count": 1,
            "topology_role": "BRANCH_POINT",
            "catalog_namespace": "mv_branch_points",
            **_zksn_solution(1),
            **_quality("Referencyjny ZKSN dla odcinka kablowego SN z jednym portem BRANCH."),
        },
    },
    {
        "id": "RSN-12",
        "name": "ZKSN odgałęźny RSN-12",
        "params": {
            "kind": "ZKSN",
            "medium": "CABLE",
            "manufacturer": "MV-DESIGN-PRO",
            "series": "RSN",
            "switch_device_kind": "ROZLACZNIK",
            "switch_rated_current_a": 630.0,
            "branch_ports_count": 2,
            "topology_role": "BRANCH_POINT",
            "catalog_namespace": "mv_branch_points",
            **_zksn_solution(2),
            **_quality(
                "Referencyjny ZKSN dla kabla SN z dwoma portami BRANCH i wariantem odgałęźnym."
            ),
        },
    },
    {
        "id": "ZKSN-2P-630A",
        "name": "ZKSN 2P 630 A",
        "params": {
            "kind": "ZKSN",
            "medium": "CABLE",
            "manufacturer": "MV-DESIGN-PRO",
            "series": "ZKSN 2P",
            "switch_device_kind": "ROZLACZNIK",
            "switch_rated_current_a": 630.0,
            "branch_ports_count": 2,
            "topology_role": "BRANCH_POINT",
            "catalog_namespace": "mv_branch_points",
            **_zksn_solution(2),
            **_quality("Referencyjny ZKSN 2-portowy 630 A dla odgałęzień kablowych SN."),
        },
    },
]


def get_all_branch_point_types(kind: str | None = None) -> list[dict[str, Any]]:
    """Zwraca katalog branch point, opcjonalnie przefiltrowany po rodzaju."""
    if kind is None:
        return list(BRANCH_POINT_TYPES)

    normalized = str(kind).strip().upper()
    if not normalized:
        return list(BRANCH_POINT_TYPES)

    return [
        record
        for record in BRANCH_POINT_TYPES
        if str((record.get("params") or {}).get("kind", "")).upper() == normalized
    ]
