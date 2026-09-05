"""Materializacja pola z katalogu rozdzielnic PRODUKCYJNĄ drogą zapisu (S5).

Kanon: `docs/domain/KONFIGURATOR_ROZDZIELNIC_SN_RMU.md` §7 etap S5; karta S5 §0
pkt 3 („rozszerzenie ISTNIEJĄCEJ trasy operacji domenowych, żadnych nowych
równoległych tras do tej samej prawdy").

Operacja `add_sn_bay_from_catalog` NIE ma własnej trasy: wchodzi tą samą
końcówką, co każda operacja domenowa (`POST /api/cases/{id}/enm/domain-ops`),
więc dziedziczy jej blokadę współbieżności, dziennik zmian i bramę katalogową.
Ten moduł dowodzi TRZECH własności tej drogi:

(a) TRYB PRÓBY NIE ZAPISUJE — `dry_run` zwraca werdykt konfiguracji bez migawki,
    więc końcówka nie ma czego utrwalić (odcisk modelu bez zmian);
(b) WYKONANIE ZAPISUJE POLE Z KATALOGU — pole trafia do modelu z pełnym
    wyposażeniem i referencjami katalogowymi;
(c) BRAMA KATALOGOWA OBEJMUJE NOWĄ OPERACJĘ — nieistniejąca pozycja aparatu
    kończy żądanie kodem 422, tak samo jak przy `add_sn_bay`. Brama kluczuje po
    NAZWIE operacji, więc nowa nazwa bez wpisu byłaby bocznymi drzwiami wokół
    kontraktu HTTP (ta sama literówka: raz 422, raz `HTTP 200` z kodem w treści).
"""

from __future__ import annotations

from typing import Any

import pytest
from api.main import app
from enm.dziennik_zmian import wyczysc_dziennik
from enm.store import reset_enm_store
from fastapi.testclient import TestClient

REF_ZRODLO = "src-gpz-15kv-250mva-rx010"
REF_KABEL = "cable-tfk-yakxs-3x120"
REF_APARAT_SN = "sw-cb-abb-vd4-17kv-630a"
REF_TRAFO = "tr-sn-nn-15-04-2500kva-dyn11"
POLE_KATALOGOWE = "ZPUE_WLOSZCZOWA__ROTOBLOK__TRANSFORMER"


@pytest.fixture()
def klient(tmp_path, monkeypatch, uow_factory) -> TestClient:  # type: ignore[no-untyped-def]
    from api.dependencies import get_uow_factory

    monkeypatch.setenv("ENM_STORE_DIR", str(tmp_path))
    reset_enm_store()
    wyczysc_dziennik()
    app.dependency_overrides[get_uow_factory] = lambda: uow_factory
    app.state.uow_factory = uow_factory
    yield TestClient(app)
    app.dependency_overrides.pop(get_uow_factory, None)
    app.state.uow_factory = None
    reset_enm_store()
    wyczysc_dziennik()


def _nowy_przypadek(klient: TestClient) -> str:
    """Utwórz REALNY projekt + przypadek przez API; zwróć `case_id`.

    CV-1-W: przypadek bez wiersza w bazie dostaje teraz 404 z magazynu ENM
    (inwariant I-2) — testy tego pliku potrzebują prawdziwej pary
    projekt+przypadek zamiast dowolnego napisu.
    """
    project_resp = klient.post("/api/projects", json={"name": "Pole katalogowe — test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = klient.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
    )
    assert case_resp.status_code == 201, case_resp.text
    return str(case_resp.json()["id"])


def _operacja(
    klient: TestClient, case_id: str, nazwa: str, payload: dict[str, Any]
) -> dict[str, Any]:
    odpowiedz = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={"operation": {"name": nazwa, "payload": payload}},
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    return dict(odpowiedz.json())


def _ciag_sn(klient: TestClient, case_id: str) -> dict[str, Any]:
    """Źródło 15 kV → kabel → stacja SN/nN (ta sama droga, co kreator sieci)."""
    _operacja(
        klient,
        case_id,
        "add_grid_source_sn",
        {"voltage_kv": 15.0, "sk3_mva": 250.0, "catalog_ref": REF_ZRODLO},
    )
    wynik = _operacja(
        klient,
        case_id,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 500.0, "catalog_ref": REF_KABEL}},
    )
    snapshot = wynik["snapshot"]
    wynik = _operacja(
        klient,
        case_id,
        "append_station_on_endpoint",
        {
            "endpoint_bus_ref": str(snapshot["branches"][-1]["to_bus_ref"]),
            "station": {"name": "Stacja koncowa", "station_type": "terminal"},
            "nn_voltage_kv": 0.4,
            "sn_fields": [{"field_role": "LINIA_IN"}],
            "field_apparatus_catalog_ref": REF_APARAT_SN,
            "transformer": {"create": True, "transformer_catalog_ref": REF_TRAFO},
            "nn_block": {"outgoing_feeders_nn_count": 1},
        },
    )
    return dict(wynik["snapshot"])


def _szyna_sn(snapshot: dict[str, Any]) -> str:
    stacja = next(s for s in snapshot["substations"] if s.get("station_type") != "gpz")
    for bus_ref in stacja.get("bus_refs") or []:
        szyna = next((b for b in snapshot["buses"] if b.get("ref_id") == bus_ref), None)
        if szyna and abs(float(szyna.get("voltage_kv") or 0.0) - 15.0) < 1e-9:
            return str(bus_ref)
    raise AssertionError("Stacja nie ma szyny SN 15 kV")


def _wiazanie_aparatu(catalog_item_id: str) -> dict[str, Any]:
    return {
        "catalog_namespace": "APARAT_SN",
        "catalog_item_id": catalog_item_id,
        "catalog_item_version": "2024.1",
    }


def _odcisk(klient: TestClient, case_id: str) -> str:
    return str(klient.get(f"/api/cases/{case_id}/enm").json()["header"]["hash_sha256"])


def _pola_stacji(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    stacja = next(s for s in snapshot["substations"] if s.get("station_type") != "gpz")
    return list((stacja.get("meta") or {}).get("field_specs") or [])


def test_tryb_proby_zwraca_werdykt_i_niczego_nie_zapisuje(klient: TestClient) -> None:
    """(a) Werdykt konfiguracji bez mutacji — odcisk modelu bez zmian."""
    case_id = _nowy_przypadek(klient)
    snapshot = _ciag_sn(klient, case_id)
    odcisk_przed = _odcisk(klient, case_id)
    pol_przed = len(_pola_stacji(snapshot))

    wynik = _operacja(
        klient,
        case_id,
        "add_sn_bay_from_catalog",
        {
            "bus_ref": _szyna_sn(snapshot),
            "complete_bay_template_ref": POLE_KATALOGOWE,
            "dry_run": True,
        },
    )

    assert wynik["dry_run"] is True
    podglad = wynik["preview"]
    assert podglad["werdykt"] == "VALID"
    assert podglad["bay_role"] == "TR"
    assert podglad["switchgear_family_ref"] == "ZPUE_WLOSZCZOWA__ROTOBLOK"
    assert [aparat["kind"] for aparat in podglad["aparaty"]].count("CB") == 1
    assert all(aparat["catalog_ref"] for aparat in podglad["aparaty"])
    # Brak migawki w odpowiedzi ⇒ końcówka nie ma czego utrwalić.
    assert "snapshot" not in wynik
    assert _odcisk(klient, case_id) == odcisk_przed
    stan_po = klient.get(f"/api/cases/{case_id}/enm").json()
    assert len(_pola_stacji(stan_po)) == pol_przed


def test_wykonanie_zapisuje_pole_z_wyposazeniem_katalogowym(klient: TestClient) -> None:
    """(b) Pole trafia do modelu z pełnym BOM-em i referencjami katalogowymi."""
    case_id = _nowy_przypadek(klient)
    snapshot = _ciag_sn(klient, case_id)
    odcisk_przed = _odcisk(klient, case_id)
    znane = {spec["field_ref"] for spec in _pola_stacji(snapshot)}

    wynik = _operacja(
        klient,
        case_id,
        "add_sn_bay_from_catalog",
        {
            "bus_ref": _szyna_sn(snapshot),
            "complete_bay_template_ref": POLE_KATALOGOWE,
            "catalog_binding": _wiazanie_aparatu(REF_APARAT_SN),
        },
    )

    assert not wynik.get("error"), wynik.get("error")
    assert _odcisk(klient, case_id) != odcisk_przed, "Wykonanie musi zmienić model"
    stan_po = klient.get(f"/api/cases/{case_id}/enm").json()
    nowe = [spec for spec in _pola_stacji(stan_po) if spec["field_ref"] not in znane]
    assert len(nowe) == 1
    pole = nowe[0]
    assert pole["bay_role"] == "TR"
    assert pole["bay_template_ref"] == POLE_KATALOGOWE
    assert pole["switchgear_family_ref"] == "ZPUE_WLOSZCZOWA__ROTOBLOK"
    assert [aparat["kind"] for aparat in pole["primary_devices"]] == [
        "DS",
        "CB",
        "CT",
        "DS",
        "ES",
        "TRANSFORMER_DEVICE",
    ]
    assert all(aparat["catalog_ref"] for aparat in pole["primary_devices"])


def test_konfiguracja_spoza_katalogu_nie_zmienia_modelu(klient: TestClient) -> None:
    """Niezgodność katalogowa: polskie zdanie walidatora, model bez zmian."""
    case_id = _nowy_przypadek(klient)
    snapshot = _ciag_sn(klient, case_id)
    odcisk_przed = _odcisk(klient, case_id)

    wynik = _operacja(
        klient,
        case_id,
        "add_sn_bay_from_catalog",
        {
            "bus_ref": _szyna_sn(snapshot),
            # Rodzina pierścieniowa nie składa się z pojedynczych celek (§3).
            "complete_bay_template_ref": "ABB__SAFERING__TRANSFORMER",
            "dry_run": True,
        },
    )

    assert wynik["error_code"] == "sn.pole_katalogowe_niezgodne"
    assert wynik["preview"]["werdykt"] == "INVALID"
    assert "BLOK" in wynik["preview"]["komunikat_pl"]
    assert _odcisk(klient, case_id) == odcisk_przed


def test_brama_katalogowa_obejmuje_nowa_operacje(klient: TestClient) -> None:
    """(c) Nieistniejąca pozycja aparatu ⇒ 422, tak samo jak przy `add_sn_bay`.

    Brama API kluczuje po NAZWIE operacji. Nowa nazwa bez wpisu w inwentarzu
    przechodziłaby obok bramy i meldowała `HTTP 200` z kodem błędu w treści —
    inny kontrakt odpowiedzi dla dokładnie tej samej literówki.
    """
    case_id = _nowy_przypadek(klient)
    snapshot = _ciag_sn(klient, case_id)
    odcisk_przed = _odcisk(klient, case_id)

    odpowiedz = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "add_sn_bay_from_catalog",
                "payload": {
                    "bus_ref": _szyna_sn(snapshot),
                    "complete_bay_template_ref": POLE_KATALOGOWE,
                    "catalog_binding": _wiazanie_aparatu("sw-cb-nie-istnieje-w-katalogu"),
                },
            }
        },
    )

    assert odpowiedz.status_code == 422, odpowiedz.text
    assert odpowiedz.json()["detail"]["code"] == "catalog.item_not_found"
    assert _odcisk(klient, case_id) == odcisk_przed


def test_proba_z_nieistniejaca_pozycja_aparatu_takze_konczy_sie_422(
    klient: TestClient,
) -> None:
    """Wyjątek bramy dotyczy WYŁĄCZNIE braku wiązania, nie jego poprawności.

    Gdyby tryb próby zwalniał z walidacji PODANEJ pozycji, konfigurator
    meldowałby VALID dla aparatu, którego w katalogu nie ma — a błąd
    wychodziłby dopiero przy zapisie.
    """
    case_id = _nowy_przypadek(klient)
    snapshot = _ciag_sn(klient, case_id)
    odcisk_przed = _odcisk(klient, case_id)

    odpowiedz = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "add_sn_bay_from_catalog",
                "payload": {
                    "bus_ref": _szyna_sn(snapshot),
                    "complete_bay_template_ref": POLE_KATALOGOWE,
                    "catalog_binding": _wiazanie_aparatu("sw-cb-nie-istnieje-w-katalogu"),
                    "dry_run": True,
                },
            }
        },
    )

    assert odpowiedz.status_code == 422, odpowiedz.text
    assert odpowiedz.json()["detail"]["code"] == "catalog.item_not_found"
    assert _odcisk(klient, case_id) == odcisk_przed
