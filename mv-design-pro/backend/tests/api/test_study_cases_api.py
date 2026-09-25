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
    assert odczyt["coordination_device:dev-1"]["settings"]["stage_51"]["pickup_current_a"] == 180.0
    assert odczyt["TMS"] == {"value": 0.3}


def test_protection_config_unknown_template_ref_rejected(app_client) -> None:
    """P14c (naprawa u źródła, guard klasy TODO/FIXME): trasa PUT .../protection-config
    obiecuje w docstringu i w mapowaniu wyjątków 422 „template_ref musi istnieć w
    katalogu" — serwis miał TODO zamiast realnej walidacji („trust the frontend
    validation"). `template_ref` nieznany katalogowi zabezpieczeń → 422, nie 200."""
    case_id = _utworz_projekt_i_przypadek(app_client)

    put_resp = app_client.put(
        f"/api/study-cases/{case_id}/protection-config",
        json={
            "template_ref": "nieistniejacy_szablon_zzz",
            "template_fingerprint": None,
            "library_manifest_ref": None,
            "overrides": {},
        },
    )
    assert put_resp.status_code == 422
    assert "nieistniejacy_szablon_zzz" in put_resp.json()["detail"]


def test_protection_config_known_template_ref_accepted(app_client) -> None:
    """Predykat parami z `test_protection_config_unknown_template_ref_rejected`:
    JEDNO źródło prawdy (`get_protection_template`, katalog domyślny MV) — ref
    ZNANY katalogowi (`template_ref_oc_ef_500`, `mv_auxiliary_catalog.py`) musi
    przejść ten sam warunek wejścia, którego brak odrzucił ref nieznany."""
    case_id = _utworz_projekt_i_przypadek(app_client)

    put_resp = app_client.put(
        f"/api/study-cases/{case_id}/protection-config",
        json={
            "template_ref": "template_ref_oc_ef_500",
            "template_fingerprint": None,
            "library_manifest_ref": None,
            "overrides": {},
        },
    )
    assert put_resp.status_code == 200
    assert put_resp.json()["template_ref"] == "template_ref_oc_ef_500"


# ---------------------------------------------------------------------------
# Decyzja O-51 (pkt 7): zacisk urządzenia koordynacji — ten sam resolver co pakiet
# nastaw; walidacja ADDYTYWNA zapisu i odczyt rozstrzygnięcia dla interfejsu.
# ---------------------------------------------------------------------------


def _przypadek_z_modelem(app_client) -> str:
    """Przypadek, którego projekt ma model: linia L (F → T), wyłącznik pola CB_od
    (S_od → F) w szeregu z zaciskiem `od` linii (sieć resolvera z testów aplikacji)."""
    from application.twin_key import klucz_twin_dla_przypadku
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    from tests.application.test_zacisk_zabezpieczenia import _siec_resolvera

    case_id = _utworz_projekt_i_przypadek(app_client)
    klucz = klucz_twin_dla_przypadku(case_id, app_client.app.state.uow_factory)
    set_enm(klucz, EnergyNetworkModel.model_validate(_siec_resolvera("wprost", "od")))
    return case_id


def _urzadzenie_z_zaciskiem(lokalizacja: str, zacisk: str | None) -> dict:
    urzadzenie: dict = {
        "id": "dev-1",
        "name": "Zabezpieczenie pola",
        "device_type": "RELAY",
        "location_element_id": lokalizacja,
        "settings": {"stage_51": {"enabled": True, "pickup_current_a": 120.0}},
    }
    if zacisk is not None:
        urzadzenie["zacisk"] = zacisk
    return urzadzenie


def _zapisz(app_client, case_id: str, urzadzenie: dict):
    return app_client.put(
        f"/api/study-cases/{case_id}/protection-config",
        json={
            "template_ref": None,
            "template_fingerprint": None,
            "library_manifest_ref": None,
            "overrides": {"coordination_device:dev-1": urzadzenie},
        },
    )


@pytest.mark.parametrize(
    ("lokalizacja", "zacisk", "status", "fragment"),
    [
        ("L", "do", 200, None),
        ("L", None, 200, None),
        ("CB_od", "od", 200, None),
        ("CB_od", None, 200, None),
        ("L", "srodek", 422, "'srodek'"),
        ("F", "od", 422, "bez zacisków"),
        (
            "CB_od",
            "do",
            422,
            "Wskazany zacisk nie odpowiada żadnemu zabezpieczeniu z modelu",
        ),
    ],
)
def test_protection_config_zacisk_urzadzenia_walidacja_addytywna(
    app_client, lokalizacja: str, zacisk: str | None, status: int, fragment: str | None
) -> None:
    case_id = _przypadek_z_modelem(app_client)
    odpowiedz = _zapisz(app_client, case_id, _urzadzenie_z_zaciskiem(lokalizacja, zacisk))
    assert odpowiedz.status_code == status, odpowiedz.json()
    if fragment is not None:
        assert fragment in odpowiedz.json()["detail"]
    else:
        zapisane = odpowiedz.json()["overrides"]["coordination_device:dev-1"]
        assert zapisane.get("zacisk") == zacisk


@pytest.mark.parametrize(
    ("lokalizacja", "zacisk", "oczekiwane"),
    [
        ("CB_od", None, {"galaz_ref": "L", "zacisk": "od", "zrodlo_zacisku": "model"}),
        ("L", "do", {"galaz_ref": "L", "zacisk": "do", "zrodlo_zacisku": "wskazanie"}),
        ("L", None, {"galaz_ref": None, "zacisk": None, "zrodlo_zacisku": None}),
        ("F", None, {"galaz_ref": None, "zacisk": None, "zrodlo_zacisku": None}),
    ],
)
def test_zacisk_lokalizacji_endpoint(
    app_client, lokalizacja: str, zacisk: str | None, oczekiwane: dict
) -> None:
    case_id = _przypadek_z_modelem(app_client)
    params = {"lokalizacja": lokalizacja}
    if zacisk is not None:
        params["zacisk"] = zacisk
    odpowiedz = app_client.get(f"/api/cases/{case_id}/enm/zacisk-lokalizacji", params=params)
    assert odpowiedz.status_code == 200
    opis = odpowiedz.json()
    assert {k: opis[k] for k in oczekiwane} == oczekiwane
    if lokalizacja == "L":
        assert opis["wymaga_wskazania_zacisku"] is True
        assert opis["zaciski"]["od"]["etykieta_pl"] == "Zacisk początkowy — szyna Stacja F"
    if lokalizacja == "L" and zacisk is None:
        assert opis["odmowa_zacisku"]["kod"] == "protection.relay_terminal_indication_missing"
    if lokalizacja == "F":
        assert opis["rodzaj_lokalizacji"] == "szyna" and opis["zaciski"] is None
