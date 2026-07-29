"""
Tests for Study Cases API — basic creation flow.

Regression coverage:
- POST /api/projects → 201
- POST /api/study-cases → 201 (no 500 when UoW session is required)
- PUT/GET /api/study-cases/{id}/protection-config — kontrakt K5-B (H-2):
  nadpisania kluczowane per urządzenie koordynacji TRWAJĄ w konfiguracji
  przypadku (wykonawca nastaw E-28).
"""

from __future__ import annotations

import pytest

pytest.importorskip("fastapi")


def _utworz_projekt_i_przypadek(app_client) -> str:
    project_resp = app_client.post("/api/projects", json={"name": "Projekt testowy"})
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    case_resp = app_client.post(
        "/api/study-cases",
        json={
            "project_id": project_id,
            "name": "Przypadek bazowy",
        },
    )
    assert case_resp.status_code == 201
    payload = case_resp.json()
    assert payload["project_id"] == project_id
    return str(payload["id"])


def test_create_study_case_after_project_creation(app_client) -> None:
    """POST /api/projects + POST /api/study-cases — brak 500 i poprawne 201."""
    project_resp = app_client.post("/api/projects", json={"name": "Projekt testowy"})
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    case_resp = app_client.post(
        "/api/study-cases",
        json={
            "project_id": project_id,
            "name": "Przypadek bazowy",
        },
    )
    assert case_resp.status_code == 201
    payload = case_resp.json()
    assert payload["project_id"] == project_id
    assert payload["name"] == "Przypadek bazowy"


def test_protection_config_overrides_per_device_roundtrip(app_client) -> None:
    """K5-B (H-2): PUT protection-config z nadpisaniami per urządzenie
    (`coordination_device:<id>` = pełne urządzenie koordynacji) → GET oddaje
    IDENTYCZNY słownik. Wpisy koordynacji współistnieją z nadpisaniami pól
    szablonu (P14c, klucze po nazwach pól — np. "I>"), bo prefiks nigdy nie
    koliduje z nazwą pola."""
    case_id = _utworz_projekt_i_przypadek(app_client)

    urzadzenie = {
        "id": "dev-1",
        "name": "Zabezpieczenie GPZ",
        "device_type": "RELAY",
        "location_element_id": "bus_1",
        "settings": {
            "stage_51": {
                "enabled": True,
                "pickup_current_a": 120.0,
                "directional": False,
                "curve_settings": {
                    "standard": "IEC",
                    "variant": "SI",
                    "pickup_current_a": 120.0,
                    "time_multiplier": 0.25,
                },
            }
        },
    }
    overrides = {
        "coordination_device:dev-1": urzadzenie,
        # Nadpisanie pola szablonu (P14c) — musi przetrwać obok wpisu urządzenia.
        "I>": {"value": 90.0, "unit": "A"},
    }

    put_resp = app_client.put(
        f"/api/study-cases/{case_id}/protection-config",
        json={
            "template_ref": None,
            "template_fingerprint": None,
            "library_manifest_ref": None,
            "overrides": overrides,
        },
    )
    assert put_resp.status_code == 200
    assert put_resp.json()["overrides"] == overrides

    get_resp = app_client.get(f"/api/study-cases/{case_id}/protection-config")
    assert get_resp.status_code == 200
    odczyt = get_resp.json()
    assert odczyt["overrides"] == overrides
    zapisane = odczyt["overrides"]["coordination_device:dev-1"]
    assert zapisane["settings"]["stage_51"]["pickup_current_a"] == 120.0
    assert zapisane["location_element_id"] == "bus_1"


def test_protection_config_second_put_replaces_device_setting(app_client) -> None:
    """K5-B (H-2): kolejny PUT (zmiana nastawy urządzenia) nadpisuje wpis tego
    urządzenia, zachowując pozostałe klucze — dokładnie ścieżka „popraw nastawę
    → zapisz → wróć" wykonawcy E-28."""
    case_id = _utworz_projekt_i_przypadek(app_client)

    def _overrides(pickup: float) -> dict:
        return {
            "coordination_device:dev-1": {
                "id": "dev-1",
                "name": "Zabezpieczenie GPZ",
                "device_type": "RELAY",
                "location_element_id": "bus_1",
                "settings": {
                    "stage_51": {
                        "enabled": True,
                        "pickup_current_a": pickup,
                        "directional": False,
                    }
                },
            },
            "TMS": {"value": 0.3},
        }

    for pickup in (120.0, 180.0):
        resp = app_client.put(
            f"/api/study-cases/{case_id}/protection-config",
            json={
                "template_ref": None,
                "template_fingerprint": None,
                "library_manifest_ref": None,
                "overrides": _overrides(pickup),
            },
        )
        assert resp.status_code == 200

    get_resp = app_client.get(f"/api/study-cases/{case_id}/protection-config")
    assert get_resp.status_code == 200
    odczyt = get_resp.json()["overrides"]
    assert (
        odczyt["coordination_device:dev-1"]["settings"]["stage_51"]["pickup_current_a"]
        == 180.0
    )
    assert odczyt["TMS"] == {"value": 0.3}
