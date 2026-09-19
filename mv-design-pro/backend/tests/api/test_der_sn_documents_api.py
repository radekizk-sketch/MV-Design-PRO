"""Testy końcówek API dokumentów toru DER-SN (D4): raport zgodności + BOM.

Kontrakt GET (200 z widokiem, 404 gdy brak toru), determinizm dwóch wywołań oraz
opt-in ``zapisz_do_magazynu`` przechwytujący REALNY dokument do magazynu F-E8.3.
"""

from __future__ import annotations

import pytest
from enm.domain_operations import execute_domain_operation
from enm.models import EnergyNetworkModel, ENMDefaults, ENMHeader
from enm.store import reset_enm_store, set_enm
from infrastructure.persistence.repositories.document_store_repository import (
    document_store_repository_scope,
)

_TR_BLOCK = "tr-sn-nn-15-04-1000kva-dyn11"
_CABLE = "cable-base-epr-al-1c-240"
#: Aparat pola SN — RZECZYWISTA pozycja katalogu (dawne „ap-sn-cb-630" nie
#: istniało; operacja przyjmowała je bez sprawdzenia — defekt G).
_APARAT_SN = "sw-cb-abb-vd4-17kv-630a"


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_enm_store()
    yield
    reset_enm_store()


def _nowy_przypadek(client) -> str:
    """Utwórz REALNY projekt + przypadek przez API; zwróć `case_id`.

    CV-1-W: przypadek bez wiersza w bazie dostaje teraz 404 z magazynu ENM
    (inwariant I-2) — testy tego pliku potrzebują prawdziwej pary
    projekt+przypadek zamiast dowolnego napisu.
    """
    project_resp = client.post("/api/projects", json={"name": "DER-SN dokumenty — test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = client.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
    )
    assert case_resp.status_code == 201, case_resp.text
    return str(case_resp.json()["id"])


def _klucz(client, case_id: str) -> str:
    """Klucz magazynu ENM dla `case_id` — TO SAMO tłumaczenie co warstwa API (CV-1)."""
    from application.twin_key import klucz_twin_dla_przypadku

    return klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)


def _sn_station_enm() -> dict:
    enm = EnergyNetworkModel(
        header=ENMHeader(name="der-sn", defaults=ENMDefaults(sn_nominal_kv=15.0)),
    ).model_dump(mode="json")
    enm["buses"] = [
        {
            "ref_id": "bus_sn",
            "name": "Szyna SN",
            "voltage_kv": 15.0,
            "frequency_hz": 50.0,
            "phase_system": "3ph",
            "tags": [],
            "meta": {},
        }
    ]
    enm["transformers"] = []
    enm["substations"] = [
        {
            "ref_id": "st_1",
            "name": "Stacja 1",
            "station_type": "mv_lv",
            "bus_refs": ["bus_sn"],
            "transformer_refs": [],
            "tags": [],
            "meta": {},
        }
    ]
    enm["sources"] = [
        {
            "ref_id": "src_gpz",
            "name": "GPZ",
            "bus_ref": "bus_sn",
            "model": "short_circuit_power",
            "sk3_mva": 500.0,
            "rx_ratio": 0.1,
            "tags": [],
            "meta": {},
        }
    ]
    return enm


def _der_sn_payload() -> dict:
    return {
        "source_technology": "PV",
        "connection_variant": "block_transformer",
        "station_ref": "st_1",
        "bus_nn_ref": "bus_sn",
        "source_name": "Blok PV SN",
        "quantity": 1,
        "power_setpoint_mw": 0.998,
        # Tabliczka WYŁĄCZNIE z katalogu (defekt G): payload wskazuje pozycję,
        # a nie liczby. Pozycja 1 MW / 0,4 kV mieści się w TR blokowym 1 MVA.
        "catalog_binding": {
            "catalog_namespace": "ZRODLO_NN_PV",
            "catalog_item_id": "conv-pv-nn-1mw-0p4kv",
            "catalog_item_version": "2024.1",
            "materialize": True,
            "snapshot_mapping_version": "1.0",
        },
        "der_topology": {
            "connection_level": "sn",
            "inverter_output_voltage_kv": 0.4,
            "has_manufacturer_lv_switchgear": True,
            "lv_switchgear_variant": "multi-feeder",
            "has_block_transformer": True,
            "block_transformer": {
                "rated_power_mva": 1.0,
                "primary_voltage_kv": 15.0,
                "secondary_voltage_kv": 0.4,
                "catalog_ref": _TR_BLOCK,
                "catalog_binding": {
                    "catalog_namespace": "TRAFO_SN_NN",
                    "catalog_item_id": _TR_BLOCK,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
            },
            "has_dedicated_mv_field": True,
            "mv_bus_ref": "bus_sn",
            "mv_field_configuration": {
                "switching_device": "CB",
                "ct": True,
                "vt": True,
                "earthing_switch": True,
                "surge_arrester": True,
                "protection_relay": True,
                "cable_head": True,
                "cable_length_km": 0.05,
                "apparatus_catalog_binding": {
                    "catalog_namespace": "APARAT_SN",
                    "catalog_item_id": _APARAT_SN,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
                "cable_catalog_ref": _CABLE,
                "cable_catalog_binding": {
                    "catalog_namespace": "KABEL_SN",
                    "catalog_item_id": _CABLE,
                    "catalog_item_version": "2024.1",
                    "materialize": True,
                    "snapshot_mapping_version": "1.0",
                },
            },
        },
    }


def _seed_case(client, case_id: str) -> None:
    result = execute_domain_operation(_sn_station_enm(), "add_converter_source", _der_sn_payload())
    assert not result.get("error"), result.get("error")
    set_enm(_klucz(client, case_id), EnergyNetworkModel.model_validate(result["snapshot"]))


def test_compliance_report_endpoint_returns_checklist(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_case(app_client, case_id)
    resp = app_client.get(f"/api/der-sn/{case_id}/compliance-report", params={"run_status": "DONE"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["werdykt"] in {"ZGODNY", "ZGODNY_Z_UWAGAMI"}
    assert body["podsumowanie"]["fail"] == 0
    # Determinizm dwóch wywołań.
    assert (
        app_client.get(
            f"/api/der-sn/{case_id}/compliance-report", params={"run_status": "DONE"}
        ).json()
        == body
    )


def test_bom_endpoint_returns_positions(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_case(app_client, case_id)
    resp = app_client.get(f"/api/der-sn/{case_id}/bom")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    kategorie = [p["kategoria"] for p in body["pozycje"]]
    assert "transformator_blokowy" in kategorie and "falownik" in kategorie
    assert body["pozycje"][0]["lp"] == 1


def test_missing_track_returns_404(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    set_enm(_klucz(app_client, case_id), EnergyNetworkModel.model_validate(_sn_station_enm()))
    assert app_client.get(f"/api/der-sn/{case_id}/bom").status_code == 404
    assert app_client.get(f"/api/der-sn/{case_id}/compliance-report").status_code == 404


def test_missing_case_returns_404(app_client) -> None:
    assert app_client.get("/api/der-sn/nieznany/bom").status_code == 404


def test_opt_in_store_captures_documents(app_client) -> None:
    case_id = _nowy_przypadek(app_client)
    _seed_case(app_client, case_id)
    resp = app_client.get(
        f"/api/der-sn/{case_id}/bom",
        params={"zapisz_do_magazynu": True, "project_id": "proj-d4"},
    )
    assert resp.status_code == 200
    app_client.get(
        f"/api/der-sn/{case_id}/compliance-report",
        params={"zapisz_do_magazynu": True, "project_id": "proj-d4", "run_status": "DONE"},
    )
    with document_store_repository_scope() as repo:
        records = repo.list_by_project("proj-d4")
    doc_types = {r.doc_type for r in records}
    assert "LISTA_MATERIALOWA" in doc_types
    assert "RAPORT_ZGODNOSCI" in doc_types


# ===========================================================================
# Karta F-K7 (V12K-207): raport zgodności liczy propozycję dla TYCH SAMYCH
# warunków ułożenia, które przyjęto w doborze.
#
# Bez tego powiązania raport porównywałby zastosowany kabel z propozycją policzoną
# przy warunkach KATALOGOWYCH i zgłaszał ⚠ „odstępstwo od propozycji D2" za kabel
# dobrany POPRAWNIE dla warunków ziemnych. To nie jest ozdoba: fałszywe odstępstwo
# każe projektantowi cofnąć dobrą decyzję.
# ===========================================================================

_TR_BLOCK_4MVA = "tr-sn-nn-15-0p69-4mva-dyn11-inverter"


def _der_payload_4mva(*, cable_ref: str, laying_conditions: object | None) -> dict:
    """Tor 4 MVA / 15 kV ⇒ I_SN = 153,96 A — jedyne okno, w którym korekta ziemna
    (0,74538) przesuwa dobór: 50 mm² ma Iz 160 A (przechodzi katalogowo), a po korekcie
    119,3 A (nie przechodzi)."""
    payload = _der_sn_payload()
    payload["source_name"] = "Blok PV SN 4 MVA"
    payload["quantity"] = 2
    payload["power_setpoint_mw"] = 2.0
    payload["catalog_binding"]["catalog_item_id"] = "conv-pv-nn-2mw-0p69kv"
    topology = payload["der_topology"]
    topology["inverter_output_voltage_kv"] = 0.69
    topology["block_transformer"] = {
        "rated_power_mva": 4.0,
        "primary_voltage_kv": 15.0,
        "secondary_voltage_kv": 0.69,
        "catalog_ref": _TR_BLOCK_4MVA,
        "catalog_binding": {
            "catalog_namespace": "TRAFO_SN_NN",
            "catalog_item_id": _TR_BLOCK_4MVA,
            "catalog_item_version": "2024.1",
            "materialize": True,
            "snapshot_mapping_version": "1.0",
        },
    }
    field = topology["mv_field_configuration"]
    field["cable_catalog_ref"] = cable_ref
    field["cable_catalog_binding"]["catalog_item_id"] = cable_ref
    if laying_conditions is not None:
        field["cable_laying_conditions"] = laying_conditions
    return payload


def _seed_case_4mva(
    client, case_id: str, *, cable_ref: str, laying_conditions: object | None
) -> None:
    result = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _der_payload_4mva(cable_ref=cable_ref, laying_conditions=laying_conditions),
    )
    assert not result.get("error"), result.get("error")
    set_enm(_klucz(client, case_id), EnergyNetworkModel.model_validate(result["snapshot"]))


def _odstepstwo_przekroju(body: dict) -> dict | None:
    """Pozycja raportu dotycząca doboru przekroju kabla (sekcja odstępstw D2)."""
    for pozycja in body.get("pozycje", []):
        if pozycja.get("check_id") == "d2.przekroj_kabla_mm2":
            return pozycja
    return None


def test_warunki_ulozenia_z_modelu_nie_daja_falszywego_odstepstwa(app_client) -> None:
    """Kabel 70 mm² dobrany dla warunków ziemnych NIE MOŻE być odstępstwem.

    Propozycja przy warunkach ziemnych to 70 mm² (50 mm² odpada: 119,3 A < 154,0 A),
    więc zastosowanie 70 mm² jest zgodne z propozycją. Gdyby raport liczył propozycję
    dla warunków katalogowych, dostałby 50 mm² i zgłosił ⚠ za dobrą decyzję.
    """
    case_id = _nowy_przypadek(app_client)
    _seed_case_4mva(
        app_client,
        case_id,
        cable_ref="cable-base-xlpe-cu-1c-70",
        laying_conditions={"set_name": "ziemia_3_kable_warstwa_200mm"},
    )
    resp = app_client.get(f"/api/der-sn/{case_id}/compliance-report", params={"run_status": "DONE"})
    assert resp.status_code == 200, resp.text
    pozycja = _odstepstwo_przekroju(resp.json())
    assert pozycja is not None, "sekcja odstępstw D2 musi zawierać przekrój kabla"
    assert pozycja["zastosowano"] == pytest.approx(70.0)
    assert pozycja["propozycja"] == pytest.approx(70.0)
    assert pozycja["status"] == "PASS"
    assert pozycja["code"] == "der_sn.d2.zgodne"


def test_realne_odstepstwo_przekroju_nadal_jest_zglaszane(app_client) -> None:
    """Odwrotna strona: 50 mm² przy warunkach ziemnych to PRAWDZIWE odstępstwo (⚠).

    Kabel przechodzi katalogowo (160 A ≥ 154,0 A), ale w ziemi w grupie przenosi
    119,3 A — czyli mniej niż prąd toru. Powiązanie warunków z modelem musi ten
    przypadek nadal wyłapać, a nie „wyciszyć" odstępstw w ogóle.
    """
    case_id = _nowy_przypadek(app_client)
    _seed_case_4mva(
        app_client,
        case_id,
        cable_ref="cable-polish-yhakxs-1c-50",
        laying_conditions={"set_name": "ziemia_3_kable_warstwa_200mm"},
    )
    resp = app_client.get(f"/api/der-sn/{case_id}/compliance-report", params={"run_status": "DONE"})
    assert resp.status_code == 200, resp.text
    pozycja = _odstepstwo_przekroju(resp.json())
    assert pozycja is not None
    assert pozycja["zastosowano"] == pytest.approx(50.0)
    assert pozycja["propozycja"] == pytest.approx(70.0)
    assert pozycja["status"] == "WARN"
    assert pozycja["code"] == "der_sn.d2.odstepstwo"


def _seed_case_4mva_bez_przekroju_kabla(client, case_id: str, *, cable_ref: str) -> None:
    """Jak ``_seed_case_4mva``, ale kabel MV traci ``cross_section_mm2`` PO
    materializacji (symuluje tor zapisany zanim to pole zaczęło być
    materializowane — nadal PRZECHODZI walidację modelu, bo pole jest
    opcjonalne, więc to REALNY, osiągalny stan magazynu, nie fikcja testu)."""
    result = execute_domain_operation(
        _sn_station_enm(),
        "add_converter_source",
        _der_payload_4mva(cable_ref=cable_ref, laying_conditions=None),
    )
    assert not result.get("error"), result.get("error")
    for branch in result["snapshot"].get("branches", []):
        if branch.get("type") == "cable":
            branch["cross_section_mm2"] = None
    set_enm(_klucz(client, case_id), EnergyNetworkModel.model_validate(result["snapshot"]))


def test_brak_przekroju_kabla_pomija_sekcje_d2_nie_fabrykuje_zera(app_client) -> None:
    """FAB-E (E1): kabel zastosowany bez znanego ``cross_section_mm2`` (pole
    opcjonalne w modelu) → sekcja odstępstw D2 pominięta ("brak" — ``None``),
    NIE zgłasza fikcyjnego „zastosowano 0 mm²" jako fałszywego odstępstwa.
    Przypadek seedowany przez realny projekt (klucz twin, CV-1-W)."""
    case_id = _nowy_przypadek(app_client)
    _seed_case_4mva_bez_przekroju_kabla(app_client, case_id, cable_ref="cable-polish-yhakxs-1c-50")
    resp = app_client.get(f"/api/der-sn/{case_id}/compliance-report", params={"run_status": "DONE"})
    assert resp.status_code == 200, resp.text
    pozycja = _odstepstwo_przekroju(resp.json())
    assert pozycja is None, "brak danych zastosowanego przekroju nie może dać pozycji odstępstw"


def test_tor_bez_zapisu_warunkow_liczy_sie_jak_dotad(app_client) -> None:
    """Tory zbudowane przed tą kartą: warunki katalogowe ⇒ propozycja 50 mm²."""
    case_id = _nowy_przypadek(app_client)
    _seed_case_4mva(
        app_client,
        case_id,
        cable_ref="cable-polish-yhakxs-1c-50",
        laying_conditions=None,
    )
    resp = app_client.get(f"/api/der-sn/{case_id}/compliance-report", params={"run_status": "DONE"})
    assert resp.status_code == 200, resp.text
    pozycja = _odstepstwo_przekroju(resp.json())
    assert pozycja is not None
    assert pozycja["propozycja"] == pytest.approx(50.0)
    assert pozycja["status"] == "PASS"
