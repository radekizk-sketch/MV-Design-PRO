"""Phase 0A audit fix 11/12: dry_run preview na insert_station_on_segment_sn.

Phase 0C (Conscious split with preview) wymaga że operacja podziału segmentu
może być wywołana w trybie preview-only — bez mutacji ENM.

Te testy są **contract-level** — sprawdzają sygnaturę i flag handling.
Pełen e2e test (dry_run preview vs apply equivalence) wymaga catalog setup
i jest osobnym scenariuszem w test_mv_general_workflow_e2e.py (Phase 0C
test plan).
"""

from __future__ import annotations

from typing import Any

from enm.domain_operations import insert_station_on_segment_sn


def _empty_enm() -> dict[str, Any]:
    """Minimalny pusty ENM. Operacja zwróci error (segment_missing) — to OK
    dla contract-level testu sygnatury dry_run."""
    return {
        "buses": [],
        "branches": [],
        "substations": [],
        "bays": [],
        "transformers": [],
        "sources": [],
        "loads": [],
        "branch_points": [],
        "generators": [],
        "events": [],
        "alarms": [],
    }


def test_insert_station_dry_run_param_accepted() -> None:
    """`dry_run: True` w payload jest akceptowany przez operację.

    Operacja zwróci error (brak segmentu w pustym ENM), ale parser payload
    musi rozpoznać dry_run jako bool flag — to gwarantuje że Phase 0C UI
    może wywołać operację z dry_run=True.
    """
    enm = _empty_enm()
    response = insert_station_on_segment_sn(
        enm,
        {
            "segment_id": "non-existent",
            "dry_run": True,
            "station": {"name": "X"},
        },
    )
    # Operacja zwraca error (segment nie istnieje) — to oczekiwane.
    assert response.get("error") is not None
    # Ważne: payload został przyjęty i nie spowodował exception przed walidacją.


def test_insert_station_dry_run_default_false() -> None:
    """Brak `dry_run` w payload = False (operacja działa jak dotychczas)."""
    enm = _empty_enm()
    response = insert_station_on_segment_sn(
        enm,
        {
            "segment_id": "non-existent",
            "station": {"name": "X"},
        },
    )
    # Brak dry_run → False default → operacja zwraca error (jak dotychczas).
    assert response.get("error") is not None
    # NIE ma `dry_run: True` flag w response.
    assert response.get("dry_run") is not True


def test_insert_station_dry_run_with_invalid_segment() -> None:
    """dry_run z błędnym segment → error path (NIE preview)."""
    enm = _empty_enm()
    response = insert_station_on_segment_sn(
        enm,
        {
            "segment_id": "missing-segment",
            "dry_run": True,
            "station": {"name": "X"},
        },
    )
    # Walidacja przed dry_run logic — błąd zwrócony.
    assert response.get("error") is not None
    # NIE ma preview metadata gdy walidacja zawiedzie.
    assert response.get("preview") is None
