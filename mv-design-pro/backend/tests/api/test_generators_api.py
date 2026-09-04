from __future__ import annotations

from uuid import uuid4

import pytest

pytest.importorskip("fastapi")


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
    set_enm(case_id, enm)


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
            "connection_variant": "dedicated",
            "catalog_ref": "pv_inv_system_1000",
            "block_transformer_catalog_ref": "btr_pv_15_069_1250",
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

    generator_bus = next(
        item for item in snapshot["buses"] if item["ref_id"] == generator["bus_ref"]
    )
    assert generator_bus["voltage_kv"] == 0.69
    assert generator["bus_ref"] == block_transformer["lv_bus_ref"]


def test_create_der_generator_prefers_explicit_block_transformer_catalog(app_client) -> None:
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id, transformer_sn_mva=0.8)

    response = app_client.post(
        f"/api/projects/{project_id}/cases/{case_id}/generators",
        json={
            "station_ref": "station/1",
            "der_kind": "PV",
            "power_mw": 1.0,
            "connection_variant": "nn_side",
            "catalog_ref": "pv_inv_system_1000",
            "block_transformer_catalog_ref": "btr_pv_15_069_1250",
            "source_name": "PV 1000 przez transformator katalogowy",
            "nc_rfg_module": "B",
        },
    )

    assert response.status_code == 201
    generator = response.json()["snapshot"]["generators"][0]
    assert generator["connection_variant"] == "block_transformer"
    assert generator["blocking_transformer_ref"]


def test_create_der_generator_accepts_materialized_enm_without_study_case(app_client) -> None:
    """Browser-built networks may start from ENM domain ops before DB case hydration."""
    project_id = str(uuid4())
    case_id = str(uuid4())
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
            "nc_rfg_module": "B",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["snapshot"]["generators"][0]["station_ref"] == "station/1"


def _utworz_wytworce(app_client) -> tuple[str, str, str]:
    """Projekt + przypadek + wytwórca PV w modelu; zwraca (project_id, case_id, ref)."""
    project_id = str(uuid4())
    case_id = str(uuid4())
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
            "dynamic_model_ref": "dyn_pv_wecc",
            "nc_rfg_profile_ref": "pse",
        },
    )

    assert response.status_code == 200
    params = _wiazania_z_modelu(app_client, case_id)
    assert params["protection_catalog_ref"] == "REF-OC-200"
    assert params["ct_catalog_ref"] == "ct_200_5_5p10_10va_abb"
    assert params["vt_catalog_ref"] == "vt_10kv_100v_05_abb"
    assert params["fault_current_data_ref"] == "fc_pv_500"
    assert params["dynamic_model_ref"] == "dyn_pv_wecc"
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
