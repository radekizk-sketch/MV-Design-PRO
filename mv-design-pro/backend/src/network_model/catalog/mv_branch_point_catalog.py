"""
Katalog punktow rozgalezienia SN.

Pozycje reprezentuja zlozone byty techniczne osadzane na odcinku SN:
- slup rozgalezny na linii napowietrznej
- ZKSN na odcinku kablowym

To nie jest katalog samej aparatury. Rekord opisuje caly obiekt
posredni zgodnie z kontraktem branch point w ENM.
"""

from __future__ import annotations

from typing import Any

from .types import CATALOG_CONTRACT_VERSION, CatalogStatus, CatalogVerificationStatus

_DEFAULT_SOURCE_REFERENCE = "Matryca obiektow posrednich SN MV-DESIGN-PRO / katalog branch point"


def _quality(note: str) -> dict[str, Any]:
    return {
        "verification_status": CatalogVerificationStatus.CZESCIOWO_ZWERYFIKOWANY.value,
        "source_reference": _DEFAULT_SOURCE_REFERENCE,
        "catalog_status": CatalogStatus.REFERENCYJNY_V1.value,
        "contract_version": CATALOG_CONTRACT_VERSION,
        "verification_note": note,
    }


BRANCH_POINT_TYPES: list[dict[str, Any]] = [
    {
        "id": "AFL-SLUP",
        "name": "Slup rozgalezny SN AFL",
        "params": {
            "kind": "BRANCH_POLE",
            "medium": "LINE_OVERHEAD",
            "manufacturer": "MV-DESIGN-PRO",
            "series": "Slup rozgalezny SN",
            "switch_device_kind": "ODLACZNIK",
            "switch_rated_current_a": 400.0,
            "branch_ports_count": 1,
            "topology_role": "BRANCH_POINT",
            "catalog_namespace": "mv_branch_points",
            **_quality(
                "Referencyjny slup rozgalezny dla linii napowietrznej SN z jednym portem BRANCH."
            ),
        },
    },
    {
        "id": "SLUP-ODG-12",
        "name": "Slup odgalezny 12/20 kV",
        "params": {
            "kind": "BRANCH_POLE",
            "medium": "LINE_OVERHEAD",
            "manufacturer": "MV-DESIGN-PRO",
            "series": "Slup rozgalezny SN 12/20 kV",
            "switch_device_kind": "ROZLACZNIK",
            "switch_rated_current_a": 630.0,
            "branch_ports_count": 1,
            "topology_role": "BRANCH_POINT",
            "catalog_namespace": "mv_branch_points",
            **_quality("Referencyjny slup odgalezny z rozlacznikem dla sieci napowietrznej SN."),
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
            **_quality("Referencyjny ZKSN dla odcinka kablowego SN z jednym portem BRANCH."),
        },
    },
    {
        "id": "RSN-12",
        "name": "ZKSN odgalezny RSN-12",
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
            **_quality(
                "Referencyjny ZKSN dla kabla SN z dwoma portami BRANCH i wariantem odgaleznym."
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
            **_quality("Referencyjny ZKSN 2-portowy 630 A dla odgalezien kablowych SN."),
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
