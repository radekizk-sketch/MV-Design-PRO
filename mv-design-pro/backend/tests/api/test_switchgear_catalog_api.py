"""Kontrakt koncówek katalogu rozdzielnic SN (scalenie kanonu 2026-08-14).

Zakres:
- `GET /api/catalog/switchgear-families` — rozszerzenie ADDYTYWNE o
  `tor_konfiguracji`; pola istniejące (kontrakt czytany przez kreator i
  `SwitchgearFamilyPicker`) pozostają nietknięte,
- `GET /api/catalog/switchgear-families/{ref}/factory-configurations` —
  subzasób bloków fabrycznych RMU: sekwencja jednostek, uczciwy stan zerowy
  dla rodzin modułowych, 404 z polskim zdaniem dla rodziny spoza katalogu.
"""

from __future__ import annotations


def test_rodziny_niosa_tor_konfiguracji_bez_utraty_dotychczasowych_pol(app_client) -> None:
    response = app_client.get("/api/catalog/switchgear-families")

    assert response.status_code == 200
    rodziny = response.json()
    assert rodziny
    for rodzina in rodziny:
        # Pola kontraktu sprzed rozszerzenia — brak regresji dla konsumentów.
        for pole in (
            "switchgear_family_ref",
            "manufacturer_ref",
            "family_name",
            "voltage_levels",
            "rated_current_options",
            "short_time_current_options",
            "insulation_type",
            "construction_type",
            "busbar_system",
            "allowed_bay_kinds",
            "status",
            "source_refs",
        ):
            assert pole in rodzina, f"{rodzina['switchgear_family_ref']}: brak pola {pole}"
        assert rodzina["tor_konfiguracji"] in {"MODULARNY", "BLOK_RMU", None}


def test_tor_konfiguracji_idzie_za_konstrukcja_rodziny(app_client) -> None:
    rodziny = {
        r["switchgear_family_ref"]: r
        for r in app_client.get("/api/catalog/switchgear-families").json()
    }
    for ref, konstrukcja, tor in [
        ("ZPUE_WLOSZCZOWA__TPM_AIR", "RMU", "BLOK_RMU"),
        ("ABB__SAFERING", "RMU", "BLOK_RMU"),
        ("ZPUE_WLOSZCZOWA__ROTOBLOK", "wnetrzowa", "MODULARNY"),
        ("ZPUE_WLOSZCZOWA__RELF_2S", "dwuczlonowa", "MODULARNY"),
    ]:
        assert rodziny[ref]["construction_type"] == konstrukcja
        assert rodziny[ref]["tor_konfiguracji"] == tor


def test_filtr_producenta_zwraca_rodziny_tego_producenta(app_client) -> None:
    response = app_client.get(
        "/api/catalog/switchgear-families", params={"manufacturer_ref": "ABB"}
    )

    assert response.status_code == 200
    rodziny = response.json()
    assert {r["family_name"] for r in rodziny} == {
        "UniGear ZS1",
        "SafeRing",
        "SafePlus",
        "UniSec",
    }


def test_bloki_fabryczne_rodziny_rmu(app_client) -> None:
    response = app_client.get(
        "/api/catalog/switchgear-families/ZPUE_WLOSZCZOWA__TPM_AIR/factory-configurations"
    )

    assert response.status_code == 200
    bloki = {b["code"]: b for b in response.json()}
    assert "LLT" in bloki
    llt = bloki["LLT"]
    assert llt["unit_sequence"] == "L-L-T"
    assert [u["unit_code"] for u in llt["units"]] == ["L", "L", "T"]
    assert llt["units"][-1]["apparatus_kinds"] == ["switch_disconnector", "fuse_set"]
    # Karta producenta nie podaje szerokości jednostek — jawny brak, nie zero.
    assert llt["total_width_mm"] is None
    assert llt["source_refs"]


def test_rodzina_modulowa_ma_pusta_liste_blokow(app_client) -> None:
    """Uczciwy stan zerowy: rozdzielnica składana z pojedynczych pól nie ma
    bloków fabrycznych — to nie jest błąd ani brak danych."""
    response = app_client.get(
        "/api/catalog/switchgear-families/ZPUE_WLOSZCZOWA__ROTOBLOK/factory-configurations"
    )

    assert response.status_code == 200
    assert response.json() == []


def test_nieznana_rodzina_konczy_sie_404_z_polskim_zdaniem(app_client) -> None:
    response = app_client.get(
        "/api/catalog/switchgear-families/NIE_MA_TAKIEJ/factory-configurations"
    )

    assert response.status_code == 404
    detail = response.json()["detail"]
    assert "nie istnieje w katalogu" in detail
    assert "NIE_MA_TAKIEJ" in detail


def test_szablony_pol_nie_wystawiaja_rodziny_bez_karty_katalogowej(app_client) -> None:
    """Rodzina `requires_catalog` (ABB UniSec) jest w katalogu rodzin, ale NIE
    produkuje katalogowych pól — inaczej oferta miałaby pokrycie w niczym."""
    rodziny = app_client.get("/api/catalog/switchgear-families").json()
    unisec = next(r for r in rodziny if r["switchgear_family_ref"] == "ABB__UNISEC")
    assert unisec["status"] == "requires_catalog"

    szablony = app_client.get("/api/catalog/complete-bay-templates").json()
    assert szablony
    assert all(t["switchgear_family_ref"] != "ABB__UNISEC" for t in szablony)


def test_szablony_pol_niosa_wyposazenie_ze_statusem(app_client) -> None:
    """Kompletne pole katalogowe wystawia listę aparatów ze statusem
    FABRYCZNY/OPCJA — kreator nie musi rekonstruować składu pola."""
    szablony = app_client.get("/api/catalog/complete-bay-templates").json()
    transformatorowe = [t for t in szablony if t["bay_kind"] == "transformatorowe"]
    assert transformatorowe
    for szablon in transformatorowe:
        aparaty = szablon["device_instances"]
        assert aparaty, szablon["template_ref"]
        assert {a["apparatus_kind"] for a in aparaty} >= {"earthing_switch", "transformer"}
        for aparat in aparaty:
            assert aparat["status_wyposazenia"] in {"FABRYCZNY", "OPCJA"}
