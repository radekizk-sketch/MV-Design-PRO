from __future__ import annotations

import pytest

pytest.importorskip("fastapi")

# Karta FAB-J: `POST .../generators` weryfikuje `nc_rfg_module` względem
# `compliance.nc_rfg_modul.modul_nc_rfg(power_mw, napiecie_kv)` — 422 przy
# niezgodności. Naprawa 2026-09-05 (odbiór FAB-J): `modul_nc_rfg` deleguje do
# `NcRfgProfile.classify_module` (profil YAML solvera PTPiREE), którego progi
# różnią się od progów URE — patrz `compliance/nc_rfg_modul.py` (rozbieżność
# opisana liczbowo). Fikstury tego pliku łączą `power_mw: 0.5` (500 kW) na
# szynie nN 0,4 kV (`_seed_station_enm`), co klasyfikuje się jako moduł „A”
# (YAML: A 0,8-1 000 kW), NIE „B" jak przed tą naprawą (URE: A 0,8-200 kW,
# B 200 kW-10 MW) — testy poniżej nie sprawdzają WARTOŚCI modułu (jest tu
# daną incydentalną dla innych asercji), więc etykieta jest tylko poprawiona
# do zgodności z klasyfikacją.


def _create_project_and_case(app_client) -> tuple[str, str]:
    project_resp = app_client.post("/api/projects", json={"name": "Projekt DER"})
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    case_resp = app_client.post(
        "/api/study-cases",
        json={"project_id": project_id, "name": "Przypadek DER"},
    )
    assert case_resp.status_code == 201
    return project_id, case_resp.json()["id"]


def _seed_station_enm(case_id: str, *, transformer_sn_mva: float = 0.63) -> None:
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    from tests.test_execution_api import _klucz_modelu

    enm = EnergyNetworkModel.model_validate(
        {
            "header": {
                "name": "Model DER",
                "defaults": {"frequency_hz": 50.0, "unit_system": "SI", "sn_nominal_kv": 15.0},
            },
            "buses": [
                {
                    "ref_id": "station/1/sn_bus",
                    "name": "Szyna SN",
                    "voltage_kv": 15.0,
                    "tags": [],
                    "meta": {},
                },
                {
                    "ref_id": "station/1/nn_bus",
                    "name": "Szyna nN",
                    "voltage_kv": 0.4,
                    "tags": [],
                    "meta": {},
                },
            ],
            "branches": [],
            "sources": [],
            "loads": [],
            "transformers": [
                {
                    "ref_id": "station/1/tr",
                    "name": "Transformator SN/nN",
                    "hv_bus_ref": "station/1/sn_bus",
                    "lv_bus_ref": "station/1/nn_bus",
                    "sn_mva": transformer_sn_mva,
                    "uhv_kv": 15.0,
                    "ulv_kv": 0.4,
                    "uk_percent": 6.0,
                    "pk_kw": 6.5,
                    "tags": [],
                    "meta": {},
                }
            ],
            "generators": [],
            "substations": [
                {
                    "ref_id": "station/1",
                    "name": "Stacja 1",
                    "station_type": "mv_lv",
                    "bus_refs": ["station/1/sn_bus", "station/1/nn_bus"],
                    "transformer_refs": ["station/1/tr"],
                    "tags": [],
                    "meta": {},
                }
            ],
            "bays": [],
            "junctions": [],
            "corridors": [],
            "measurements": [],
            "protection_assignments": [],
            "branch_points": [],
        }
    )
    # CV-2-W: model zyje pod kluczem PROJEKTU; zasiew surowym `case_id` dzialal
    # tylko dopoki zadna wczesniejsza odpowiedz API nie przetlumaczyla przypadku.
    set_enm(_klucz_modelu(case_id), enm)


def test_der_bez_catalog_ref_to_422_bez_cichego_podstawienia(app_client) -> None:
    """Typ przekształtnika jest daną projektową: brak wyboru = 422, nie mapa domyślna.

    Klasa „ciche podstawienia" (FAB-D1): do 2026-09-05 pominięty `catalog_ref`
    dostawał typ z `_DEFAULT_CATALOG_BY_VARIANT` i odpowiedź 201 udawała zapis
    wyboru użytkownika. Iloczyn cech: pole pominięte × pole z samych białych
    znaków × wariant z transformatorem blokowym × puste pole wymagane `station_ref`.
    """
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)
    baza = {"station_ref": "station/1", "der_kind": "PV", "power_mw": 0.5}
    odrzucane = (
        {**baza, "connection_variant": "nn_side"},
        {**baza, "connection_variant": "nn_side", "catalog_ref": "   "},
        {
            **baza,
            "der_kind": "BESS",
            "connection_variant": "block_transformer",
            "block_transformer_catalog_ref": "btr_pv_15_069_1250",
            "sn_connection_bus_ref": "station/1/sn_bus",
        },
        {**baza, "station_ref": "   ", "catalog_ref": "conv-pv-nn-0p5mw-0p4kv"},
    )
    for payload in odrzucane:
        response = app_client.post(
            f"/api/projects/{project_id}/cases/{case_id}/generators",
            json=payload,
        )
        assert response.status_code == 422, payload

    persisted = app_client.get(f"/api/cases/{case_id}/enm")
    assert persisted.status_code == 200
    assert persisted.json()["generators"] == []


def test_create_der_generator_persists_in_case_enm(app_client) -> None:
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "source_name": "PV Stacja 1",
            "nc_rfg_module": "A",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["error"] is None if "error" in payload else True
    assert payload["changes"]["created_element_ids"]

    generators = payload["snapshot"]["generators"]
    assert len(generators) == 1
    generator = generators[0]
    assert generator["station_ref"] == "station/1"
    assert generator["bus_ref"] == "station/1/nn_bus"
    assert generator["gen_type"] == "pv_inverter"
    assert generator["p_mw"] == 0.5
    assert generator["catalog_ref"] == "conv-pv-nn-0p5mw-0p4kv"
    assert generator["connection_variant"] == "nn_side"

    persisted = app_client.get(f"/api/cases/{case_id}/enm")
    assert persisted.status_code == 200
    assert persisted.json()["generators"][0]["ref_id"] == generator["ref_id"]


def test_create_der_generator_rejects_power_outside_drawer_contract(app_client) -> None:
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.0,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
        },
    )

    assert response.status_code == 422


def test_create_der_generator_rejects_source_above_transformer_capacity(app_client) -> None:
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.063)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "source_name": "PV za duży dla transformatora",
            "nc_rfg_module": "A",
        },
    )

    assert response.status_code == 422
    body = response.json()
    assert body["detail"]["code"] == "converter.transformer_capacity_exceeded"


def test_create_der_generator_materializes_catalog_block_transformer(app_client) -> None:
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.063)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 1.0,
            "connection_variant": "block_transformer",
            "catalog_ref": "pv_inv_system_1000",
            "block_transformer_catalog_ref": "btr_pv_15_069_1250",
            # Karta FAB-K: punkt przyłączenia SN JEST WYMAGANY — szyna ISTNIEJĄCA
            # w modelu (tu: szyna SN stacji zasianej przez `_seed_station_enm`),
            # zamiast dawnego wyszukiwania „najbliższej szyny SN po napięciu".
            "sn_connection_bus_ref": "station/1/sn_bus",
            "source_name": "PV 1000 z transformatorem dedykowanym",
            "nc_rfg_module": "B",
        },
    )

    assert response.status_code == 201
    snapshot = response.json()["snapshot"]
    generator = snapshot["generators"][0]
    assert generator["connection_variant"] == "block_transformer"
    assert generator["catalog_ref"] == "pv_inv_system_1000"
    assert generator["blocking_transformer_ref"]

    block_transformer = next(
        item
        for item in snapshot["transformers"]
        if item["ref_id"] == generator["blocking_transformer_ref"]
    )
    assert block_transformer["catalog_ref"] == "btr_pv_15_069_1250"
    assert block_transformer["sn_mva"] == 1.25
    assert block_transformer["ulv_kv"] == 0.69
    assert block_transformer["hv_bus_ref"] == "station/1/sn_bus"

    generator_bus = next(
        item for item in snapshot["buses"] if item["ref_id"] == generator["bus_ref"]
    )
    assert generator_bus["voltage_kv"] == 0.69
    assert generator["bus_ref"] == block_transformer["lv_bus_ref"]


def test_create_der_generator_sn_connection_bus_ref_missing_is_422(app_client) -> None:
    """Karta FAB-K: `block_transformer` bez `sn_connection_bus_ref` (i bez
    `blocking_transformer_ref` istniejącego) jest 422 — bez punktu przyłączenia
    materializacja transformatora dedykowanego nie ma dokąd wpiąć strony SN."""
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.063)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 1.0,
            "connection_variant": "block_transformer",
            "catalog_ref": "pv_inv_system_1000",
            "block_transformer_catalog_ref": "btr_pv_15_069_1250",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "generator.sn_connection_bus_missing"


def test_create_der_generator_sn_connection_bus_ref_unknown_is_422(app_client) -> None:
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.063)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 1.0,
            "connection_variant": "block_transformer",
            "catalog_ref": "pv_inv_system_1000",
            "block_transformer_catalog_ref": "btr_pv_15_069_1250",
            "sn_connection_bus_ref": "station/1/szyna_ktorej_nie_ma",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "generator.sn_connection_bus_unknown"


def test_create_der_generator_sn_connection_bus_ref_voltage_mismatch_is_422(app_client) -> None:
    """Punkt przyłączenia ISTNIEJE, ale jego napięcie nie zgadza się z HV
    transformatora dedykowanego (tu: szyna nN 0,4 kV vs HV katalogu 15 kV)."""
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.063)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 1.0,
            "connection_variant": "block_transformer",
            "catalog_ref": "pv_inv_system_1000",
            "block_transformer_catalog_ref": "btr_pv_15_069_1250",
            "sn_connection_bus_ref": "station/1/nn_bus",
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "generator.sn_bus_voltage_mismatch"


def test_create_der_generator_nn_side_ignores_stray_block_transformer_catalog_ref(
    app_client,
) -> None:
    """Karta FAB-K: `connection_variant` jest JEDYNYM źródłem prawdy o wariancie —
    zero domysłu z obecności `block_transformer_catalog_ref`. Poprzednia wersja
    kontraktu NADPISYWAŁA jawny `nn_side` na `block_transformer`, gdy to pole było
    obecne — dwie ortogonalne decyzje (poziom / punkt przyłączenia) mieszały się
    w jednym enumie. Dziś pole nieużywane dla `nn_side` jest po prostu ignorowane."""
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "block_transformer_catalog_ref": "btr_pv_15_069_1250",
            "source_name": "PV po stronie nN",
        },
    )

    assert response.status_code == 201, response.text
    generator = response.json()["snapshot"]["generators"][0]
    assert generator["connection_variant"] == "nn_side"
    assert generator["bus_ref"] == "station/1/nn_bus"
    assert not generator.get("blocking_transformer_ref")


def test_create_der_generator_rejects_legacy_variant_aliases(app_client) -> None:
    """Karta FAB-K: aliasy `sn_side`/`dedicated` SKASOWANE bez kompatybilności
    wstecznej — kontrakt przyjmuje WYŁĄCZNIE `nn_side`/`block_transformer`."""
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    for legacy_variant in ("sn_side", "dedicated"):
        response = app_client.post(
            f"/api/projects/{project_id}/cases/{case_id}/generators",
            json={
                "station_ref": "station/1",
                "der_kind": "PV",
                "power_mw": 0.5,
                "connection_variant": legacy_variant,
                "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            },
        )
        assert response.status_code == 422, legacy_variant


def test_create_der_generator_accepts_materialized_enm_seeded_directly(app_client) -> None:
    """ENM zasiane wprost do magazynu (nie przez `POST .../enm/domain-ops`) —
    tor tworzenia wytwórcy MUSI czytać model, a nie zakładać, że jedyną drogą
    zapisu ENM jest operacja domenowa.

    CV-1-W: przypadek MUSI należeć do realnego projektu w bazie (inwariant
    I-2) — poprzednia wersja tego testu ("Browser-built networks may start
    from ENM domain ops before DB case hydration") zakładała przypadek BEZ
    wiersza w bazie; ten stan już nie istnieje w architekturze (PROJECT
    posiada ENM, `docs/architecture/CANONICAL_DIGITAL_TWIN.md` §2).
    """
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "source_name": "PV Stacja 1",
            "nc_rfg_module": "A",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["snapshot"]["generators"][0]["station_ref"] == "station/1"


class TestBateriaBess:
    """Karta FAB-K (R2): `battery_catalog_ref` — katalog `BATERIA_BESS` istnieje
    od FAB-J, ale kreator wybierał pakiet BEZ wysłania referencji do backendu.
    Iloczyn cech: obecność pola × der_kind (BESS/PV) × istnienie w katalogu."""

    def test_battery_catalog_ref_bess_materializuje_tabliczke_pakietu(self, app_client) -> None:
        project_id, case_id = _create_project_and_case(app_client)
        _seed_station_enm(case_id)

        response = app_client.post(
            f"/api/projects/{project_id}/cases/{case_id}/generators",
            json={
                "station_ref": "station/1",
                "der_kind": "BESS",
                "power_mw": 0.5,
                "connection_variant": "nn_side",
                "catalog_ref": "conv-bess-nn-0p5mw-0p4kv",
                "battery_catalog_ref": "bess_bat_lfp_2880kwh_1230vdc",
                "source_name": "BESS z pakietem baterii",
            },
        )

        assert response.status_code == 201, response.text
        generator = response.json()["snapshot"]["generators"][0]
        params = generator["materialized_params"]
        assert params["battery_catalog_ref"] == "bess_bat_lfp_2880kwh_1230vdc"
        assert params["battery"]["capacity_kwh"] == 2880.0
        assert params["battery"]["nominal_voltage_dc_v"] == 1230.0
        assert params["battery"]["chemistry"] == "LFP"

    def test_battery_catalog_ref_nieznany_jest_422(self, app_client) -> None:
        project_id, case_id = _create_project_and_case(app_client)
        _seed_station_enm(case_id)

        response = app_client.post(
            f"/api/projects/{project_id}/cases/{case_id}/generators",
            json={
                "station_ref": "station/1",
                "der_kind": "BESS",
                "power_mw": 0.5,
                "connection_variant": "nn_side",
                "catalog_ref": "conv-bess-nn-0p5mw-0p4kv",
                "battery_catalog_ref": "bess_bat_ktorego_nie_ma",
            },
        )

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "converter.battery_catalog_ref_unknown"

    def test_battery_catalog_ref_dla_pv_jest_422(self, app_client) -> None:
        """Bateria dotyczy WYŁĄCZNIE BESS — dla PV/FW pole nie ma zastosowania."""
        project_id, case_id = _create_project_and_case(app_client)
        _seed_station_enm(case_id)

        response = app_client.post(
            f"/api/projects/{project_id}/cases/{case_id}/generators",
            json={
                "station_ref": "station/1",
                "der_kind": "PV",
                "power_mw": 0.5,
                "connection_variant": "nn_side",
                "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
                "battery_catalog_ref": "bess_bat_lfp_2880kwh_1230vdc",
            },
        )

        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "converter.battery_catalog_not_applicable"

    def test_battery_catalog_ref_pominiety_nie_blokuje_zapisu_bess(self, app_client) -> None:
        """Pole opcjonalne — pakiet może zostać dobrany później (bindings)."""
        project_id, case_id = _create_project_and_case(app_client)
        _seed_station_enm(case_id)

        response = app_client.post(
            f"/api/projects/{project_id}/cases/{case_id}/generators",
            json={
                "station_ref": "station/1",
                "der_kind": "BESS",
                "power_mw": 0.5,
                "connection_variant": "nn_side",
                "catalog_ref": "conv-bess-nn-0p5mw-0p4kv",
            },
        )

        assert response.status_code == 201, response.text
        params = response.json()["snapshot"]["generators"][0]["materialized_params"]
        assert "battery_catalog_ref" not in params


def _seed_station_z_szyna_110kv(case_id: str) -> None:
    """Stacja jak `_seed_station_enm`, plus szyna 110 kV (GPZ) dla testu
    kryterium napięcia modułu D — przyłączenie WPROST na szynie WN.
    """
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    from tests.test_execution_api import _klucz_modelu

    enm = EnergyNetworkModel.model_validate(
        {
            "header": {
                "name": "Model DER GPZ",
                "defaults": {"frequency_hz": 50.0, "unit_system": "SI", "sn_nominal_kv": 15.0},
            },
            "buses": [
                {
                    "ref_id": "station/1/wn_bus",
                    "name": "Szyna WN 110 kV",
                    "voltage_kv": 110.0,
                    "tags": [],
                    "meta": {},
                },
                {
                    "ref_id": "station/1/sn_bus",
                    "name": "Szyna SN",
                    "voltage_kv": 15.0,
                    "tags": [],
                    "meta": {},
                },
                {
                    "ref_id": "station/1/nn_bus",
                    "name": "Szyna nN",
                    "voltage_kv": 0.4,
                    "tags": [],
                    "meta": {},
                },
            ],
            "branches": [],
            "sources": [],
            "loads": [],
            "transformers": [
                {
                    "ref_id": "station/1/tr",
                    "name": "Transformator SN/nN",
                    "hv_bus_ref": "station/1/sn_bus",
                    "lv_bus_ref": "station/1/nn_bus",
                    # 3,15 MVA — pokrywa moc katalogową źródła 2 MW/2200 kVA użytego
                    # w testach tej klasy; sam transformator SN/nN nie jest torem
                    # mocy w tych testach (generator przyłącza się jawną `bus_ref`).
                    "sn_mva": 3.15,
                    "uhv_kv": 15.0,
                    "ulv_kv": 0.4,
                    "uk_percent": 6.0,
                    "pk_kw": 6.5,
                    "tags": [],
                    "meta": {},
                }
            ],
            "generators": [],
            "substations": [
                {
                    "ref_id": "station/1",
                    "name": "GPZ 1",
                    "station_type": "mv_lv",
                    "bus_refs": ["station/1/wn_bus", "station/1/sn_bus", "station/1/nn_bus"],
                    "transformer_refs": ["station/1/tr"],
                    "tags": [],
                    "meta": {},
                }
            ],
            "bays": [],
            "junctions": [],
            "corridors": [],
            "measurements": [],
            "protection_assignments": [],
            "branch_points": [],
        }
    )
    # CV-2-W: model zyje pod kluczem PROJEKTU (patrz ten sam komentarz w
    # `_seed_station_enm` powyzej) — ta funkcja zasiewala surowym `case_id`,
    # wiec po rebase na galaz z CV-2-W jedyny test korzystajacy z niej
    # (`test_bus_ref_jawny_ma_pierwszenstwo_nad_szyna_nn_wariantu`) dostawal
    # "station.not_found": endpoint tlumaczy case_id -> klucz projektu przed
    # odczytem modelu, a ten zasiew pisal pod INNYM kluczem.
    set_enm(_klucz_modelu(case_id), enm)


class TestWeryfikacjaModuluNcRfgPrzyTworzeniuGeneratora:
    """Karta FAB-J: `nc_rfg_module` z żądania musi zgadzać się z klasyfikacją
    (moc × napięcie punktu przyłączenia) — niezgodność jest 422, nie cichą
    korektą. Iloczyn cech: próg mocy × wariant przyłączenia (nN / transformator
    dedykowany / szyna WN jawna) × obecność/brak pola.
    """

    def test_niezgodny_modul_na_szynie_nn_jest_422(self, app_client) -> None:
        project_id, case_id = _create_project_and_case(app_client)
        _seed_station_enm(case_id)

        response = app_client.post(
            f"/api/projects/{project_id}/cases/{case_id}/generators",
            json={
                "station_ref": "station/1",
                "der_kind": "PV",
                "power_mw": 0.5,
                "connection_variant": "nn_side",
                "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
                "nc_rfg_module": "B",
            },
        )

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert detail["code"] == "generator.nc_rfg_module_mismatch"
        assert detail["expected_module"] == "A"
        assert "500 kW" not in detail["message_pl"]  # liczby w MW/kV, nie zgadywanka

        persisted = app_client.get(f"/api/cases/{case_id}/enm")
        assert persisted.json()["generators"] == [], "odrzucone żądanie nie zapisuje generatora"

    def test_zgodny_modul_na_granicy_progu_1_mw_jest_akceptowany(self, app_client) -> None:
        """Granica A/B wg profilu YAML solvera PTPiREE (delegacja
        `modul_nc_rfg`, naprawa 2026-09-05) to 1 000 kW, nie 200 kW jak przed
        naprawą (próg URE) — transformator stacji podniesiony do 1,5 MVA, żeby
        1 MW PV nie oberwał NIEZWIĄZANEGO `converter.transformer_capacity_exceeded`.
        """
        project_id, case_id = _create_project_and_case(app_client)
        _seed_station_enm(case_id, transformer_sn_mva=1.5)

        response = app_client.post(
            f"/api/projects/{project_id}/cases/{case_id}/generators",
            json={
                "station_ref": "station/1",
                "der_kind": "PV",
                "power_mw": 1.0,
                "connection_variant": "nn_side",
                "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
                "nc_rfg_module": "B",
            },
        )

        assert response.status_code == 201, response.text

    def test_transformator_dedykowany_klasyfikuje_wg_strony_sn_nie_szyny_wewnetrznej(
        self, app_client
    ) -> None:
        """`btr_pv_15_069_1250` ma `hv_kv=15`: napięciem przyłączenia jest 15 kV
        (strona SN transformatora dedykowanego), nie 0,69 kV szyny wewnętrznej
        pakietu DER — obie strony < 110 kV, więc o module decyduje MOC.
        """
        project_id, case_id = _create_project_and_case(app_client)
        _seed_station_enm(case_id, transformer_sn_mva=0.063)

        response = app_client.post(
            f"/api/projects/{project_id}/cases/{case_id}/generators",
            json={
                "station_ref": "station/1",
                "der_kind": "PV",
                "power_mw": 1.0,
                "connection_variant": "block_transformer",
                "catalog_ref": "pv_inv_system_1000",
                "block_transformer_catalog_ref": "btr_pv_15_069_1250",
                "sn_connection_bus_ref": "station/1/sn_bus",
                "nc_rfg_module": "C",
            },
        )

        assert response.status_code == 422
        assert response.json()["detail"]["expected_module"] == "B"

    def test_bus_ref_jawny_ma_pierwszenstwo_nad_szyna_nn_wariantu(self, app_client) -> None:
        """`bus_ref` jawny (kreator/szuflada wskazały konkretną szynę) kieruje
        klasyfikację na WSKAZANĄ szynę, nie na domyślnie wyprowadzoną szynę nN
        stacji — sprawdzone tym, że wybór szyny SN (15 kV, zgodnej z katalogiem
        źródła) faktycznie zmienia miejsce przyłączenia generatora w modelu.
        Kryterium napięcia ≥110 kV samego resolvera ma dedykowany test
        jednostkowy `TestNapiecicPrzylaczeniaKv` niżej (żaden typ w katalogu
        przekształtników nie jest dziś homologowany na ≥110 kV, więc pełna
        ścieżka HTTP nie może fizycznie skonstruować tego przypadku — regułę
        walidacji „napięcie katalogowe = napięcie szyny" sprawdza inna karta).
        """
        project_id, case_id = _create_project_and_case(app_client)
        _seed_station_z_szyna_110kv(case_id)

        response = app_client.post(
            f"/api/projects/{project_id}/cases/{case_id}/generators",
            json={
                "station_ref": "station/1",
                "der_kind": "FW",
                "power_mw": 2.0,
                "connection_variant": "nn_side",
                "bus_ref": "station/1/sn_bus",
                "catalog_ref": "conv-wind-2mw-15kv",
                "nc_rfg_module": "B",
            },
        )
        assert response.status_code == 201, response.text
        assert response.json()["snapshot"]["generators"][0]["bus_ref"] == "station/1/sn_bus"

    def test_brak_modulu_ncrfg_w_zadaniu_pomija_weryfikacje(self, app_client) -> None:
        """Pole opcjonalne: brak deklaracji nie ma z czym porównać, więc nie blokuje."""
        project_id, case_id = _create_project_and_case(app_client)
        _seed_station_enm(case_id)

        response = app_client.post(
            f"/api/projects/{project_id}/cases/{case_id}/generators",
            json={
                "station_ref": "station/1",
                "der_kind": "PV",
                "power_mw": 0.5,
                "connection_variant": "nn_side",
                "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            },
        )
        assert response.status_code == 201, response.text


class TestNapiecicPrzylaczeniaKv:
    """Resolver `_napiecie_przylaczenia_kv` w izolacji — pokrywa gałęzie, których
    pełna ścieżka HTTP nie może dziś skonstruować (żaden typ w katalogu
    przekształtników nie jest homologowany na ≥110 kV, więc walidacja
    `converter.voltage_mismatch` zablokowałaby zapis wcześniej niż dotarłby do
    tego resolvera). Iloczyn cech: 4 źródła napięcia (bus_ref jawny / katalog
    transformatora blokowego / transformator istniejący / szyna nN) × pierwszeństwo.
    """

    @staticmethod
    def _req(**kwargs):
        from api.generators import DerGeneratorCreateRequest

        baza = {
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
        }
        return DerGeneratorCreateRequest(**{**baza, **kwargs})

    def test_bus_ref_jawny_ma_najwyzszy_priorytet(self) -> None:
        from api.generators import _napiecie_przylaczenia_kv

        enm_dict = {"buses": [{"ref_id": "b/wn", "voltage_kv": 110.0}]}
        req = self._req(bus_ref="b/wn", connection_variant="nn_side")
        assert _napiecie_przylaczenia_kv(enm_dict, req, {}, "nn_side") == 110.0

    def test_transformator_blokowy_z_katalogu_daje_strone_sn(self) -> None:
        from api.generators import _napiecie_przylaczenia_kv

        req = self._req(
            connection_variant="block_transformer",
            block_transformer_catalog_ref="btr_pv_15_069_1250",
        )
        assert _napiecie_przylaczenia_kv({}, req, {}, "block_transformer") == 15.0

    def test_transformator_blokowy_istniejacy_czyta_uhv_z_modelu(self) -> None:
        """Bez `block_transformer_catalog_ref` (transformator istniał już w
        modelu) resolver czyta `uhv_kv` wskazanego transformatora wprost."""
        from api.generators import _napiecie_przylaczenia_kv

        enm_dict = {
            "transformers": [
                {"ref_id": "station/1/tr_wn_sn", "uhv_kv": 110.0, "ulv_kv": 15.0},
            ],
        }
        req = self._req(
            connection_variant="block_transformer", blocking_transformer_ref="station/1/tr_wn_sn"
        )
        assert _napiecie_przylaczenia_kv(enm_dict, req, {}, "block_transformer") == 110.0

    def test_transformator_blokowy_bez_zadnej_referencji_daje_none(self) -> None:
        from api.generators import _napiecie_przylaczenia_kv

        req = self._req(connection_variant="block_transformer")
        assert _napiecie_przylaczenia_kv({}, req, {}, "block_transformer") is None

    def test_nn_side_czyta_wolt_bus_nn_ref_z_payloadu(self) -> None:
        from api.generators import _napiecie_przylaczenia_kv

        enm_dict = {"buses": [{"ref_id": "station/1/nn_bus", "voltage_kv": 0.4}]}
        req = self._req(connection_variant="nn_side")
        payload = {"bus_nn_ref": "station/1/nn_bus"}
        assert _napiecie_przylaczenia_kv(enm_dict, req, payload, "nn_side") == 0.4

    def test_nn_side_bez_rozpoznanej_szyny_daje_none(self) -> None:
        from api.generators import _napiecie_przylaczenia_kv

        req = self._req(connection_variant="nn_side")
        assert _napiecie_przylaczenia_kv({}, req, {}, "nn_side") is None


def _utworz_wytworce(app_client) -> tuple[str, str, str]:
    """Projekt + przypadek + wytwórca PV w modelu; zwraca (project_id, case_id, ref)."""
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "source_name": "PV wiązania",
        },
    )
    assert response.status_code == 201
    return project_id, case_id, response.json()["snapshot"]["generators"][0]["ref_id"]


def _wiazania_z_modelu(app_client, case_id: str) -> dict:
    persisted = app_client.get(f"/api/cases/{case_id}/enm")
    assert persisted.status_code == 200
    return persisted.json()["generators"][0].get("materialized_params", {})


def test_wiazania_wytworcy_trafiaja_do_modelu_przez_endpoint(app_client) -> None:
    """V12K-238: wybory z konfiguratora DER mają ścieżkę do modelu.

    Przed tą kartą katalog zabezpieczeń, przekładniki CT/VT, dane prądu zwarciowego i
    model dynamiczny żyły wyłącznie w store przeglądarki (pomiar: V12K-237) — sześć osi
    gotowości opierało werdykt na danych, których model nie zna.
    """
    project_id, case_id, ref = _utworz_wytworce(app_client)

    response = app_client.patch(
        f"/api/projects/{project_id}/cases/{case_id}/generators/{ref}/bindings",
        json={
            "protection_catalog_ref": "REF-OC-200",
            "ct_catalog_ref": "ct_200_5_5p10_10va_abb",
            "vt_catalog_ref": "vt_10kv_100v_05_abb",
            "fault_current_data_ref": "fc_pv_500",
            # Karta FAB-K: `dynamic_model_ref` MA katalog (der_dynamic) od tej karty —
            # identyfikator realny, nie dowolny lancuch (`dyn_pv_wecc` nie istnieje).
            "dynamic_model_ref": "default_pv_gfl",
            "nc_rfg_profile_ref": "pse",
        },
    )

    assert response.status_code == 200
    params = _wiazania_z_modelu(app_client, case_id)
    assert params["protection_catalog_ref"] == "REF-OC-200"
    assert params["ct_catalog_ref"] == "ct_200_5_5p10_10va_abb"
    assert params["vt_catalog_ref"] == "vt_10kv_100v_05_abb"
    assert params["fault_current_data_ref"] == "fc_pv_500"
    assert params["dynamic_model_ref"] == "default_pv_gfl"
    assert params["profiles"]["nc_rfg_profile_ref"] == "pse"


def test_pole_pominiete_w_zadaniu_nie_kasuje_wiazania_z_modelu(app_client) -> None:
    """Pominięcie ≠ null. Bez tego rozróżnienia każda edycja jednego pola kasowałaby
    pozostałe wiązania projektowe — cicha utrata danych."""
    project_id, case_id, ref = _utworz_wytworce(app_client)
    baza = f"/api/projects/{project_id}/cases/{case_id}/generators/{ref}/bindings"

    assert (
        app_client.patch(baza, json={"ct_catalog_ref": "ct_150_1_0_5_10va_abb"}).status_code == 200
    )
    assert app_client.patch(baza, json={"vt_catalog_ref": "vt_10kv_100v_05_abb"}).status_code == 200

    params = _wiazania_z_modelu(app_client, case_id)
    assert params["ct_catalog_ref"] == "ct_150_1_0_5_10va_abb"  # PRZEŻYŁO drugie żądanie
    assert params["vt_catalog_ref"] == "vt_10kv_100v_05_abb"


def test_jawny_null_usuwa_wiazanie(app_client) -> None:
    """Jawne wyczyszczenie wiązania musi przywrócić BRAK DANEJ, a nie puste pole."""
    project_id, case_id, ref = _utworz_wytworce(app_client)
    baza = f"/api/projects/{project_id}/cases/{case_id}/generators/{ref}/bindings"

    assert (
        app_client.patch(baza, json={"ct_catalog_ref": "ct_150_1_0_5_10va_abb"}).status_code == 200
    )
    assert app_client.patch(baza, json={"ct_catalog_ref": None}).status_code == 200

    assert "ct_catalog_ref" not in _wiazania_z_modelu(app_client, case_id)


def test_wytworca_nieobecny_w_modelu_daje_blad_a_nie_cichy_zapis(app_client) -> None:
    project_id, case_id, _ = _utworz_wytworce(app_client)

    response = app_client.patch(
        f"/api/projects/{project_id}/cases/{case_id}/generators/gen_nie_ma/bindings",
        json={"ct_catalog_ref": "ct_150_1_0_5_10va_abb"},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "der_bindings.generator_not_found"


def test_puste_zadanie_jest_odrzucone(app_client) -> None:
    """Żądanie bez ani jednego wiązania nie może „przejść" — wywołujący musiałby wierzyć,
    że coś zapisał."""
    project_id, case_id, ref = _utworz_wytworce(app_client)

    response = app_client.patch(
        f"/api/projects/{project_id}/cases/{case_id}/generators/{ref}/bindings",
        json={},
    )

    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "der_bindings.payload_empty"


def test_protection_functions_wyprowadzone_z_faktow_pola(app_client) -> None:
    """Endpoint doboru funkcji zabezpieczeniowych (karta E21-3, audyt E-21 P7/P8).

    Do V12K-246 ekran pokazywal STALA liste 13 kodow ANSI, ta sama dla kazdej
    instalacji. Ten test pilnuje, ze odpowiedz jest WYPROWADZENIEM z faktow o polu:
    kazda funkcja niesie podstawe, chroniony obiekt i zrodlo pomiaru, a brak danych
    o torze zerowym daje NAZWANA kwestie otwarta zamiast domyslnej rodziny funkcji.
    """
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    utworzenie = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "source_name": "PV Stacja 1",
            "nc_rfg_module": "A",
        },
    )
    assert utworzenie.status_code == 201
    generator_ref = utworzenie.json()["snapshot"]["generators"][0]["ref_id"]

    odpowiedz = app_client.get(
        f"/api/projects/{project_id}/cases/{case_id}"
        f"/generators/{generator_ref}/protection-functions"
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    dane = odpowiedz.json()

    kody = [f["kod"] for f in dane["dobor"]["wymagane"]]
    # Podstawa pola: zwarcia miedzyfazowe niezaleznie od sposobu uziemienia.
    assert "50" in kody and "51" in kody
    # Wytworca PV po stronie nN → zestaw anty-wyspowy (IEEE 1547 / NC RfG Art. 14).
    assert {"27", "59", "81U", "81O"}.issubset(set(kody))
    # Kazda funkcja z UZASADNIENIEM — sam kod nie jest projektem zabezpieczen.
    for funkcja in dane["dobor"]["wymagane"]:
        assert funkcja["podstawa_pl"].strip()
        assert funkcja["chroniony_obiekt_pl"].strip()
        assert funkcja["zrodlo_pomiaru_pl"].strip()

    # Model tej stacji nie opisuje toru pradu zerowego ani punktu neutralnego, wiec
    # rodzina funkcji ziemnozwarciowej NIE jest zgadywana — brak jest nazwany.
    kwestie = {k["kod"] for k in dane["dobor"]["kwestie_otwarte"]}
    assert "protection.earth_current_source_missing" in kwestie
    assert "protection.osd_requirements_not_modelled" in kwestie
    assert not [k for k in kody if k in ("50N", "51N", "50G", "51G")]

    # Bez wybranego zabezpieczenia komplet wymaganych funkcji jest brakiem, nie zgoda.
    assert dane["urzadzenie"]["protection_catalog_ref"] is None
    assert dane["urzadzenie"]["pokrywa_wymagania"] is False
    assert set(dane["urzadzenie"]["brakujace_funkcje"]) == set(kody)


def test_protection_functions_zglasza_niezgodnosc_przeznaczenia_urzadzenia(app_client) -> None:
    """Zabezpieczenie roznicowe SZYN przypisane wytworcy — ostrzezenie, nie cisza."""
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    utworzenie = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "source_name": "PV Stacja 1",
            "nc_rfg_module": "A",
        },
    )
    generator_ref = utworzenie.json()["snapshot"]["generators"][0]["ref_id"]

    # ABB REB670 to aparat roznicowy SZYN — katalog niesie `87BB`.
    wiazanie = app_client.patch(
        f"/api/projects/{project_id}/cases/{case_id}/generators/{generator_ref}/bindings",
        json={"protection_catalog_ref": "ABB_REB670"},
    )
    assert wiazanie.status_code == 200, wiazanie.text

    dane = app_client.get(
        f"/api/projects/{project_id}/cases/{case_id}"
        f"/generators/{generator_ref}/protection-functions"
    ).json()

    ostrzezenia = dane["urzadzenie"]["ostrzezenia_przeznaczenia"]
    assert ostrzezenia, "aparat innej strefy musi dostac ostrzezenie o przeznaczeniu"
    assert "87BB" in ostrzezenia[0]
    assert dane["urzadzenie"]["nazwa"]


def test_readiness_endpoint_wola_KANONICZNA_regule_domenowa(app_client) -> None:
    """V12K-251: regula `domain/der_readiness.py` dostaje konsumenta produkcyjnego.

    POMIAR PRZED: `grep -rln der_readiness backend/src` poza samym modulem = ZERO
    trafien — 519 linii reguly utrzymywanych pod kontraktem parzystosci, wolanych
    wylacznie przez testy, podczas gdy jedyna ocena widziana przez uzytkownika byla
    liczona w przegladarce.
    """
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    utworzenie = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "source_name": "PV Stacja 1",
            "nc_rfg_module": "A",
        },
    )
    assert utworzenie.status_code == 201
    generator_ref = utworzenie.json()["snapshot"]["generators"][0]["ref_id"]

    odpowiedz = app_client.get(
        f"/api/projects/{project_id}/cases/{case_id}/generators/{generator_ref}/readiness"
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    dane = odpowiedz.json()

    # Kontrakt: 14 osi w stalej kolejnosci (determinizm odpowiedzi).
    assert len(dane["macierz"]) == 14
    assert len(dane["osie"]) == 14

    # DWIE REPREZENTACJE JEDNEGO WERDYKTU MUSZA SIE ZGADZAC. Odpowiedz niesie macierz
    # (os -> status) i liste osi z powodami; gdyby liczyly sie osobno, klient dostalby
    # w jednym pakiecie dwa rozne werdykty o tym samym wytworcy — dokladnie rozjazd,
    # ktory ta seria zamyka (V12K-243). Pierwsza wersja tego testu tego NIE lapala:
    # splaszczenie macierzy do samych „ready" przechodzilo na zielono.
    for os in dane["osie"]:
        assert (
            dane["macierz"][os["axis"]] == os["status"]
        ), f"macierz i lista osi rozjezdzaja sie na osi {os['axis']}"

    # Kazda os niegotowa niesie NAZWANY powod — status bez powodu jest slepym zaulkiem.
    for os in dane["osie"]:
        if os["status"] in ("blocked", "partial"):
            assert os["blockers"], f"os {os['axis']} bez nazwanego powodu"
            for blokada in os["blockers"]:
                assert blokada["code"].strip()
                assert blokada["message_pl"].strip()

    # Ten wytworca nie ma zabezpieczen ani przekladnikow, wiec os zabezpieczen NIE
    # moze byc gotowa, a powod musi wskazywac brakujaca dana.
    zabezpieczenia = next(os for os in dane["osie"] if os["axis"] == "protection")
    assert zabezpieczenia["status"] != "ready"
    assert zabezpieczenia["blockers"]

    # Podsumowanie niesie licznik `total` OBOK statusow, wiec sumujemy same statusy
    # (moja pierwsza asercja sumowala wszystko i liczyla `total` drugi raz — blad
    # testu, nie reguly).
    podsumowanie = dane["podsumowanie"]
    assert podsumowanie["total"] == 14
    assert (
        podsumowanie["ready"] + podsumowanie["partial"] + podsumowanie["blocked"]
        == podsumowanie["total"]
    )


def test_dobor_przekladnikow_jest_RACHUNKIEM_a_nie_nazwa_katalogowa(app_client) -> None:
    """Endpoint doboru przekladnikow (karta E21-4, audyt E-21 pkt P9).

    Ekran pokazywal przekladniki jako nazwy katalogowe. Wlasciciel: „bez sprawdzenia
    przekladni, obciazalnosci cieplnej i dynamicznej, nasycenia oraz zgodnosci z
    wejsciem przekaznika jego wybor nie ma wiarygodnosci inzynierskiej".

    Test pilnuje trzech rzeczy naraz: (1) kazde kryterium ma podstawe normowa,
    (2) prad roboczy toru przychodzi z SOLWERA (a nie z wlasnego wzoru w API),
    (3) brak przebiegu zwarciowego zostaje NAZWANYM brakiem danej — nigdy zgodnoscia.
    """
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    utworzenie = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "source_name": "PV Stacja 1",
            "nc_rfg_module": "A",
        },
    )
    assert utworzenie.status_code == 201
    generator_ref = utworzenie.json()["snapshot"]["generators"][0]["ref_id"]

    wiazania = app_client.patch(
        f"/api/projects/{project_id}/cases/{case_id}/generators/{generator_ref}/bindings",
        json={
            "ct_catalog_ref": "ct_200_5_5p10_10va_abb",
            "vt_catalog_ref": "vt_20kv_100v_3p_abb",
            "protection_catalog_ref": "ABB_REB670",
        },
    )
    assert wiazania.status_code == 200, wiazania.text

    odpowiedz = app_client.get(
        f"/api/projects/{project_id}/cases/{case_id}"
        f"/generators/{generator_ref}/instrument-transformers"
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    dane = odpowiedz.json()

    # Prad roboczy toru policzony przez kanoniczny solver I = S/(√3·U) — nie przez
    # rownolegly wzor w warstwie API (reuzycie zamiast duplikacji).
    assert dane["wejscia"]["prad_roboczy_a"] is not None
    assert dane["wejscia"]["napiecie_sieci_v"] is not None

    for gniazdo in ("przekladnik_pradowy", "przekladnik_napieciowy"):
        wynik = dane[gniazdo]["wynik"]
        assert wynik is not None, f"{gniazdo}: wiazanie jest, a doboru brak"
        assert wynik["kryteria"], f"{gniazdo}: dobor bez ani jednego kryterium"
        for kryterium in wynik["kryteria"]:
            assert kryterium["podstawa_pl"].strip(), kryterium["kod"]
            assert kryterium["werdykt"] in (
                "spelnione",
                "niespelnione",
                "informacja",
                "brak_danych",
            )

    # Bez zakonczonego przebiegu zwarciowego Ik'' i ip NIE ISTNIEJA — kryteria
    # zwarciowe musza to nazwac, a dobor NIE MOZE byc potwierdzony.
    assert dane["wejscia"]["ik_ka"] is None
    assert dane["wejscia"]["run_ref_zwarciowy"] is None
    prad = dane["przekladnik_pradowy"]["wynik"]
    bez_danych = {k["kod"] for k in prad["kryteria"] if k["werdykt"] == "brak_danych"}
    assert {"ct.alf", "ct.wytrzymalosc_cieplna", "ct.wytrzymalosc_dynamiczna"} <= bez_danych
    assert prad["dobor_potwierdzony"] is False

    # Wejscie pomiarowe urzadzenia przychodzi z katalogu WRAZ Z POCHODZENIEM danej —
    # wartosc bez pochodzenia bylaby nieodroznialna od zmyslonej.
    assert dane["wejscia"]["zrodlo_wejsc_urzadzenia"]
    prad_wtorny = next(k for k in prad["kryteria"] if k["kod"] == "ct.prad_wtorny")
    assert prad_wtorny["werdykt"] == "spelnione"
    assert "szereg_preferowany" in (prad_wtorny["komentarz_pl"] or "")


def test_dobor_przekladnikow_bez_wiazania_nie_udaje_werdyktu(app_client) -> None:
    """Brak wiazania katalogowego to nie „dobor niespelniony" — to brak wyboru."""
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    utworzenie = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_ref": "conv-pv-nn-0p5mw-0p4kv",
            "source_name": "PV Stacja 1",
            "nc_rfg_module": "A",
        },
    )
    generator_ref = utworzenie.json()["snapshot"]["generators"][0]["ref_id"]

    dane = app_client.get(
        f"/api/projects/{project_id}/cases/{case_id}"
        f"/generators/{generator_ref}/instrument-transformers"
    ).json()

    assert dane["przekladnik_pradowy"] == {"catalog_ref": None, "nazwa": None, "wynik": None}
    assert dane["przekladnik_napieciowy"] == {"catalog_ref": None, "nazwa": None, "wynik": None}
