from __future__ import annotations

import uuid

import pytest
from application.station_templates import get_template, list_templates
from application.station_templates.schema import wymagania_transformatora_stacji
from domain.generator_validation import moc_pozorna_wymagana_generatora_mva
from network_model.pochodne import mva_na_kva

pytest.importorskip("fastapi")

CATALOG_VERSION = "2024.1"
CABLE_ID = "cable-tfk-yakxs-3x120"
SOURCE_ID = "src-gpz-15kv-250mva-rx010"


def _binding(namespace: str, item_id: str) -> dict[str, str]:
    return {
        "catalog_namespace": namespace,
        "catalog_item_id": item_id,
        "catalog_item_version": CATALOG_VERSION,
    }


def _create_project_and_case(app_client) -> tuple[str, str]:
    from enm.store import reset_enm_store

    reset_enm_store()
    suffix = uuid.uuid4().hex[:8]
    project_resp = app_client.post(
        "/api/projects",
        json={
            "name": f"Projekt szablonu {suffix}",
            "description": "Regresja aplikowania szablonu",
            "mode": "TO-BE",
            "voltage_level_kv": 15.0,
            "frequency_hz": 50.0,
        },
    )
    assert project_resp.status_code == 201
    project_id = project_resp.json()["id"]

    case_resp = app_client.post(
        "/api/study-cases",
        json={
            "project_id": project_id,
            "name": f"Przypadek szablonu {suffix}",
            "description": "",
            "config": {},
            "set_active": True,
        },
    )
    assert case_resp.status_code == 201
    return project_id, case_resp.json()["id"]


def _execute_domain_op(app_client, case_id: str, name: str, payload: dict) -> dict:
    response = app_client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "project_id": "",
            "snapshot_base_hash": "",
            "operation": {
                "name": name,
                "idempotency_key": f"station-template-apply-{uuid.uuid4()}",
                "payload": payload,
            },
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body.get("error") is None
    return body


def _przypadek_z_odcinkiem(app_client) -> tuple[str, str]:
    """Przypadek z GPZ 15 kV i jednym odcinkiem kablowym magistrali — miejsce wcięcia."""
    _, case_id = _create_project_and_case(app_client)
    _execute_domain_op(
        app_client,
        case_id,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_binding": _binding("ZRODLO_SN", SOURCE_ID),
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    segment_result = _execute_domain_op(
        app_client,
        case_id,
        "continue_trunk_segment_sn",
        {
            "segment": {
                "rodzaj": "KABEL",
                "dlugosc_m": 120,
                "name": "Odcinek do szablonu",
                "catalog_binding": _binding("KABEL_SN", CABLE_ID),
            },
        },
    )
    return case_id, segment_result["snapshot"]["corridors"][0]["ordered_segment_refs"][-1]


def _sprawdz_parytet_podgladu_i_modelu(podglad: dict, payload: dict, snapshot: dict) -> None:
    """Podgląd (`/preview`) i model po zastosowaniu (`/apply`) opisują TEN SAM skład DER:
    liczba jednostek, pozycja katalogu i nastawa mocy każdej technologii oraz transformator."""
    utworzone = set(payload["created_element_refs"])
    kind_wg_ref = {
        ref: op["kind"]
        for op in payload["operations_log"]
        if op.get("op") == "add_converter_source"
        for ref in op["created"]
    }
    w_modelu: dict[str, tuple[int, set, set]] = {}
    for generator in snapshot.get("generators", []):
        if generator["ref_id"] not in utworzone:
            continue
        kind = kind_wg_ref[generator["ref_id"]]
        liczba, pozycje, moce = w_modelu.get(kind, (0, set(), set()))
        w_modelu[kind] = (
            liczba + 1,
            pozycje | {generator["catalog_ref"]},
            moce | {generator["p_mw"]},
        )
    cfg = podglad["effective_config"]
    w_podgladzie = {
        item["kind"]: (
            item["expected_count_per_kind"],
            {item["catalog_ref"]},
            {item["p_mw_each"]},
        )
        for item in cfg["der_mix"]
        if item["expected_count_per_kind"] > 0
    }
    assert w_modelu == w_podgladzie
    assert cfg["der_total_count"] == sum(liczba for liczba, _, _ in w_modelu.values())
    transformatory = [t for t in snapshot["transformers"] if t["ref_id"] in utworzone]
    stacyjne = [
        t
        for t in transformatory
        if (t.get("meta") or {}).get("catalog_role") != "TRANSFORMATOR_BLOKOWY_DER"
    ]
    blokowe = [t for t in transformatory if t not in stacyjne]
    if stacyjne:
        assert {t["catalog_ref"] for t in stacyjne} == {cfg["transformer_ref"]}
        # Liczba transformatorów szablonu jest w modelu (n_parallel), nie tylko w podglądzie.
        assert {t.get("n_parallel") or 1 for t in stacyjne} == {cfg["transformer_count"]}
    # Transformatory blokowe: po jednym na jednostkę po stronie SN, refy z podglądu.
    oczekiwane_blokowe = sorted(
        item["block_transformer_ref"]
        for item in cfg["der_mix"]
        if item.get("block_transformer_ref")
        for _ in range(item["expected_count_per_kind"])
    )
    assert sorted(t["catalog_ref"] for t in blokowe) == oczekiwane_blokowe


#: Decyzja O-53 (KLASA, nie instancja): KAŻDY szablon z źródłem przekształtnikowym musi
#: się dać zastosować bez odmowy kontroli mocy (nastawa ≤ moc znamionowa, moc TR) — dawny
#: szablon BESS 5 MW (2 kontenery po 2,5 MW bez pozycji katalogowej 2,5 MW) przechodził
#: tylko dlatego, że tor nie sprawdzał nastawy. Lista wyprowadzona z katalogu szablonów.
_SZABLONY_Z_OZE = tuple(sorted(t.id for t in list_templates() if t.schema.der_options))

#: Karta GPT-478: szablony stacji wstawianych w odcinek z ≥ 2 transformatorami — parytet
#: `n_parallel` == `transformer_count` (dawniej parametr był pokazywany i ignorowany).
#: Lista wyprowadzona z katalogu szablonów; GPZ (korzeń modelu) ma własną ścieżkę.
_SZABLONY_WIELOTRANSFORMATOROWE = tuple(
    sorted(
        t.id
        for t in list_templates()
        if t.schema.transformer_count.default >= 2 and t.category.value != "gpz_110_sn"
    )
)


@pytest.mark.parametrize(
    "template_id",
    sorted(
        {
            "tpl_sn_nn_630kva",
            "tpl_slupowa_100kva",
            "tpl_farma_pv_1mw",
            "tpl_hybrid_pv05_bess05",
            "tpl_bess_5mw_10mwh_fcr_n",
            "tpl_wiatr_3mw",
            *_SZABLONY_Z_OZE,
            *_SZABLONY_WIELOTRANSFORMATOROWE,
        }
    ),
)
def test_apply_station_template_reuses_existing_case_enm_snapshot(
    app_client, template_id: str
) -> None:
    case_id, segment_ref = _przypadek_z_odcinkiem(app_client)
    podglad = app_client.post(
        f"/api/station-templates/{template_id}/preview",
        json={"params_override": {}, "catalog_profile": None},
    )
    assert podglad.status_code == 200, podglad.text

    response = app_client.post(
        f"/api/station-templates/{template_id}/apply",
        json={
            "case_id": case_id,
            "target_segment_id": segment_ref,
            "insert_at_ratio": 0.5,
            "params_override": {},
            "catalog_profile": None,
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["template_id"] == template_id
    assert payload["station_ref"]
    assert payload["created_element_refs"]

    persisted = app_client.get(f"/api/cases/{case_id}/enm")
    assert persisted.status_code == 200
    snapshot = persisted.json()
    assert len(snapshot["substations"]) == 2
    assert any(station["ref_id"] == payload["station_ref"] for station in snapshot["substations"])
    generator_refs = [generator["ref_id"] for generator in snapshot.get("generators", [])]
    assert len(generator_refs) == len(set(generator_refs))

    template = get_template(template_id)
    assert template is not None
    # Dziennik operacji wymienia WYŁĄCZNIE operacje wykonane (błąd przerywa zastosowanie
    # szablonu wyjątkiem) — wpis nie niesie stałego pola „status” (dawniej zawsze „OK”,
    # słowo ze słownika werdyktów bez informacji; karta AB-1a Pakiet E2).
    assert all("status" not in op for op in payload["operations_log"])
    station = next(
        station
        for station in snapshot["substations"]
        if station["ref_id"] == payload["station_ref"]
    )
    nn_specs = station.get("meta", {}).get("nn_field_specs", [])
    feeder_refs = [
        spec["field_ref"]
        for spec in nn_specs
        if spec.get("bay_role") == "FEEDER" and isinstance(spec.get("field_ref"), str)
    ]
    expected_feeders = template.schema.nn_feeders_count.default
    assert len(feeder_refs) == expected_feeders

    expected_load_kw = template.schema.nn_load_default_kw.default
    load_ops = [op for op in payload["operations_log"] if op.get("op") == "add_nn_load"]
    if expected_feeders > 0 and expected_load_kw > 0:
        feeder_ref_set = set(feeder_refs)
        station_loads = [
            load
            for load in snapshot.get("loads", [])
            if load.get("meta", {}).get("feeder_ref") in feeder_ref_set
        ]
        assert len(station_loads) == expected_feeders
        assert len(load_ops) == expected_feeders
        assert all(load.get("catalog_ref") for load in station_loads)
        assert all(load.get("catalog_namespace") == "OBCIAZENIE" for load in station_loads)
    else:
        assert load_ops == []

    expected_der_count = template.schema.der_total_count.default
    der_ops = [op for op in payload["operations_log"] if op.get("op") == "add_converter_source"]
    assert len(der_ops) == expected_der_count
    # Liczebność każdej technologii w modelu wynika z definicji szablonu (dawniej suma była
    # dzielona naprzemiennie między technologie), a podgląd mówi to samo co zapis.
    for spec in template.schema.der_options:
        assert sum(op.get("kind") == spec.kind for op in der_ops) == spec.default_count
    _sprawdz_parytet_podgladu_i_modelu(podglad.json(), payload, snapshot)
    if expected_der_count > 0:
        station_generators = [
            generator
            for generator in snapshot.get("generators", [])
            if generator.get("station_ref") == payload["station_ref"]
            or (
                isinstance(generator.get("meta"), dict)
                and generator["meta"].get("station_ref") == payload["station_ref"]
            )
        ]
        assert len(station_generators) >= expected_der_count
        assert all(generator.get("catalog_ref") for generator in station_generators)
        # Decyzja O-53 (predykaty parami, pomiar 2026-09-24): wielkość, z którą selektor
        # szablonu dobrał transformator, to SUMA reguły domenowej `max(S_n,jedn·n, P/cosφ)`
        # na generatorach, które szablon RZECZYWIŚCIE utworzył (ta sama tabliczka, ta sama
        # funkcja) — dawniej selektor liczył `sn_mva` albo moc czynną nastawy osobno.
        utworzone = set(payload["created_element_refs"])
        generatory_szablonu = [
            generator
            for generator in snapshot.get("generators", [])
            if generator["ref_id"] in utworzone
        ]
        assert len(generatory_szablonu) == expected_der_count
        generatory_nn = [
            generator
            for generator in generatory_szablonu
            if generator.get("connection_variant") == "nn_side"
        ]
        suma_wymagana_mva = sum(
            moc_pozorna_wymagana_generatora_mva(generator) or 0.0 for generator in generatory_nn
        )
        assert wymagania_transformatora_stacji(template, {}).moc_zrodel_nn_kva == pytest.approx(
            mva_na_kva(suma_wymagana_mva)
        )
        # Rozstrzygnięcie 2026-10-15: jednostka po stronie SN ma WŁASNY transformator blokowy
        # z katalogu NA ŚCIEŻCE MOCY (generator na jego szynie nN), ten sam, który pokazał
        # podgląd, o mocy pokrywającej moc wymaganą jednostki (O-53). Żaden generator
        # szablonu nie stoi na szynie SN stacji ani nie wskazuje transformatora stacji.
        transformatory = {tr["ref_id"]: tr for tr in snapshot.get("transformers", [])}
        podglad_mix = {
            wpis["catalog_ref"]: wpis for wpis in podglad.json()["effective_config"]["der_mix"]
        }
        for generator in generatory_szablonu:
            if generator.get("connection_variant") == "nn_side":
                continue
            blokowy = transformatory[generator["blocking_transformer_ref"]]
            assert blokowy["lv_bus_ref"] == generator["bus_ref"]
            assert (blokowy.get("meta") or {}).get("catalog_role") == "TRANSFORMATOR_BLOKOWY_DER"
            assert (
                blokowy["catalog_ref"]
                == podglad_mix[generator["catalog_ref"]]["block_transformer_ref"]
            )
            assert blokowy["sn_mva"] + 1e-9 >= (
                moc_pozorna_wymagana_generatora_mva(generator) or 0.0
            )


def test_szablon_z_pomiarem_przylaczany_odgalezieniem_przez_koncowke_api(app_client) -> None:
    """Karta POMIAR-ODGAŁĘZIENIE — REALNA ścieżka produkcyjna (`/apply`).

    Kontrakt `docs/domain/POMIAR_ROZLICZENIOWY_SN_V1.md` §1/§3: stacja abonencka
    z układem pomiarowo-rozliczeniowym (klasa B) wisi w ODGAŁĘZIENIU, więc
    tranzyt magistrali nie przechodzi przez jej rozdzielnicę. Test sprawdza to
    na końcówce HTTP, a nie tylko na funkcjach warstwy aplikacyjnej — inaczej
    pin nie obejmowałby drogi, którą naprawdę idzie kreator.
    """
    _, case_id = _create_project_and_case(app_client)
    _execute_domain_op(
        app_client,
        case_id,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "rx_ratio": 0.1,
            "catalog_binding": _binding("ZRODLO_SN", SOURCE_ID),
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    segmenty: list[str] = []
    for i in range(2):
        wynik = _execute_domain_op(
            app_client,
            case_id,
            "continue_trunk_segment_sn",
            {
                "segment": {
                    "rodzaj": "KABEL",
                    "dlugosc_m": 300 + 50 * i,
                    "name": f"Odcinek {i + 1}",
                    "catalog_binding": _binding("KABEL_SN", CABLE_ID),
                },
            },
        )
        segmenty.append(wynik["snapshot"]["corridors"][0]["ordered_segment_refs"][-1])

    response = app_client.post(
        "/api/station-templates/tpl_sn_nn_1000kva/apply",
        json={
            "case_id": case_id,
            "target_segment_id": segmenty[0],
            "insert_at_ratio": 0.5,
            "params_override": {},
            "catalog_profile": None,
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    operacje = [op["op"] for op in payload["operations_log"]]
    assert "insert_zksn_on_segment_sn" in operacje
    assert "start_branch_segment_sn" in operacje
    assert "append_station_on_endpoint" in operacje
    assert "insert_station_on_segment_sn" not in operacje

    snapshot = app_client.get(f"/api/cases/{case_id}/enm").json()
    stacja = next(s for s in snapshot["substations"] if s["ref_id"] == payload["station_ref"])
    # Deklaracja zapisana wprost (dawniej „terminal" gubione jako `mv_lv`); zgodna z rodzajem
    # z topologii (jedna reguła `enm/rodzaj_stacji.py`) — pole OUT bez dalszej stacji.
    assert stacja["station_type"] == "terminal", "Stacja klienta musi być KOŃCOWA"
    role = [spec["bay_role"] for spec in stacja["meta"]["field_specs"]]
    assert role == ["IN", "MEASUREMENT", "TR", "OUT"], role
    assert len(snapshot["branch_points"]) == 1


def test_podglad_szablonu_z_pomiarem_ponizej_minimum_pol_zwraca_422(app_client) -> None:
    """Odmowa liczby pól poniżej zestawu nieusuwalnego ma dojść do projektanta
    jako komunikat (422), a nie jako błąd serwera — końcówka podglądu liczy
    role w tym samym miejscu co aplikacja."""
    response = app_client.post(
        "/api/station-templates/tpl_sn_nn_1000kva/preview",
        json={"params_override": {"sn_bays_count": 2}, "catalog_profile": None},
    )
    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "template.sn_bays_count_below_minimum"
    assert "pól SN" in detail["message_pl"]


@pytest.mark.parametrize(
    ("template_id", "overrides", "oczekiwany_sklad"),
    [
        (
            "tpl_hybrid_pv2_bess1",
            {"der_PV_count": 3, "der_BESS_count": 2, "der_total_count": 5},
            {"PV": 3, "BESS": 2},
        ),
        (
            "tpl_hybrid_pv3_bess2",
            {"der_PV_count": 2, "der_BESS_count": 2, "der_BESS_p_mw_each": 2.0},
            {"PV": 2, "BESS": 2},
        ),
        (
            "tpl_hybrid_pv1_bess1",
            {"der_BESS_ref": "conv-bess-nn-2mw-0p69kv"},
            {"PV": 2, "BESS": 1},
        ),
        ("tpl_hybrid_pv1_bess1", {"der_PV_count": 2, "der_BESS_count": 0}, {"PV": 2}),
        ("tpl_farma_pv_2mw", {"der_total_count": 3}, {"PV": 3}),
        ("tpl_bess_1mw_2mwh", {"der_total_count": 2, "der_BESS_p_mw_each": 0.5}, {"BESS": 2}),
    ],
)
def test_nadpisany_sklad_der_podglad_i_model_zgodne(
    app_client, template_id: str, overrides: dict, oczekiwany_sklad: dict[str, int]
) -> None:
    case_id, segment_ref = _przypadek_z_odcinkiem(app_client)
    podglad = app_client.post(
        f"/api/station-templates/{template_id}/preview",
        json={"params_override": overrides, "catalog_profile": None},
    )
    assert podglad.status_code == 200, podglad.text
    response = app_client.post(
        f"/api/station-templates/{template_id}/apply",
        json={
            "case_id": case_id,
            "target_segment_id": segment_ref,
            "insert_at_ratio": 0.5,
            "params_override": overrides,
            "catalog_profile": None,
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    snapshot = app_client.get(f"/api/cases/{case_id}/enm").json()
    _sprawdz_parytet_podgladu_i_modelu(podglad.json(), payload, snapshot)
    der_ops = [op for op in payload["operations_log"] if op.get("op") == "add_converter_source"]
    assert {
        kind: sum(op["kind"] == kind for op in der_ops) for kind in {op["kind"] for op in der_ops}
    } == oczekiwany_sklad


@pytest.mark.parametrize(
    "overrides",
    [
        {"der_total_count": 3},
        {"der_PV_count": 2.5},
        {"der_BESS_p_mw_each": "dużo"},
        {"der_BESS_ref": ""},
    ],
)
def test_niespojny_sklad_der_odmowa_422_bez_sladu_w_modelu(app_client, overrides: dict) -> None:
    case_id, segment_ref = _przypadek_z_odcinkiem(app_client)
    przed = app_client.get(f"/api/cases/{case_id}/enm").json()
    podglad = app_client.post(
        "/api/station-templates/tpl_hybrid_pv2_bess1/preview",
        json={"params_override": overrides, "catalog_profile": None},
    )
    assert podglad.status_code == 422, podglad.text
    assert podglad.json()["detail"]["code"] == "template.der_mix_invalid"
    response = app_client.post(
        "/api/station-templates/tpl_hybrid_pv2_bess1/apply",
        json={
            "case_id": case_id,
            "target_segment_id": segment_ref,
            "insert_at_ratio": 0.5,
            "params_override": overrides,
            "catalog_profile": None,
        },
    )
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == "template.der_mix_invalid"
    assert response.json()["detail"]["message_pl"] == podglad.json()["detail"]["message_pl"]
    assert app_client.get(f"/api/cases/{case_id}/enm").json() == przed


@pytest.mark.parametrize(
    ("template_id", "overrides", "kod"),
    [
        ("tpl_sn_nn_400kva", {"sn_bays_count": 2.5}, "template.param_invalid"),
        ("tpl_sn_nn_400kva", {"nn_feeders_count": "abc"}, "template.param_invalid"),
        ("tpl_sn_nn_400kva", {"transformer_count": 99}, "template.param_invalid"),
        ("tpl_sn_nn_400kva", {"nn_load_default_kw": "dużo"}, "template.param_invalid"),
        ("tpl_sn_nn_1000kva", {"branch_length_m": 12.5}, "template.param_invalid"),
        ("tpl_sn_nn_1000kva", {"branch_length_m": 0}, "template.branch_length_invalid"),
        (
            "tpl_sn_nn_100kva",
            {"nn_load_default_kw": 100.0},
            "template.transformer_capacity_insufficient",
        ),
        (
            "tpl_sn_nn_630kva",
            {"transformer_ref": "tr-sn-nn-15-04-100kva-dyn11"},
            "template.transformer_capacity_insufficient",
        ),
        (
            "tpl_hybrid_pv1_bess1",
            {"der_BESS_ref": "conv-bess-2mw-4mwh-15kv"},
            "converter.der_sn.dobor_tr_brak_kandydata",
        ),
    ],
)
def test_odmowa_parametrow_jedna_w_podgladzie_i_zastosowaniu_bez_sladu(
    app_client, template_id: str, overrides: dict, kod: str
) -> None:
    """Karta GPT-478 pkt 7.3 — iloczyn: rodzaj odmowy (parametr całkowity, obciążenie,
    długość odgałęzienia, niedobór transformatora stacji z tokenu i ze wskazania, brak
    transformatora blokowego) × końcówka (podgląd, zastosowanie) × stan modelu. Dawne
    ciche `int(...)` obcinało ułamek albo kończyło się błędem 500; teraz jedna funkcja
    odmowy daje ten sam kod i komunikat w obu końcówkach, a model zostaje nietknięty."""
    case_id, segment_ref = _przypadek_z_odcinkiem(app_client)
    przed = app_client.get(f"/api/cases/{case_id}/enm").json()
    podglad = app_client.post(
        f"/api/station-templates/{template_id}/preview",
        json={"params_override": overrides, "catalog_profile": None},
    )
    assert podglad.status_code == 422, podglad.text
    assert podglad.json()["detail"]["code"] == kod
    response = app_client.post(
        f"/api/station-templates/{template_id}/apply",
        json={
            "case_id": case_id,
            "target_segment_id": segment_ref,
            "insert_at_ratio": 0.5,
            "params_override": overrides,
            "catalog_profile": None,
        },
    )
    assert response.status_code == 422, response.text
    assert response.json()["detail"]["code"] == kod
    assert response.json()["detail"]["message_pl"] == podglad.json()["detail"]["message_pl"]
    assert app_client.get(f"/api/cases/{case_id}/enm").json() == przed


def test_hybrydowy_podglad_api_zachowuje_jawny_sklad_pv_bess(app_client) -> None:
    response = app_client.post(
        "/api/station-templates/tpl_hybrid_pv2_bess1/preview",
        json={"params_override": {}},
    )
    assert response.status_code == 200, response.text
    cfg = response.json()["effective_config"]
    assert cfg["der_total_count"] == 5
    assert {item["kind"]: item["expected_count_per_kind"] for item in cfg["der_mix"]} == {
        "PV": 4,
        "BESS": 1,
    }


def test_podglad_api_odrzuca_niejawny_podzial_modulow(app_client) -> None:
    response = app_client.post(
        "/api/station-templates/tpl_hybrid_pv2_bess1/preview",
        json={"params_override": {"der_total_count": 3}},
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "template.der_mix_invalid"
