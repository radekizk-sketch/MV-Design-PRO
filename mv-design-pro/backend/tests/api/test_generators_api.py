from __future__ import annotations

import pytest

pytest.importorskip("fastapi")

# Końcówki ODCZYTU pola i gotowości wytwórcy (`api/generators.py`). Wytwórców i ich wiązania
# testy zakładają JEDYNĄ drogą zapisu — operacjami domenowymi przez `…/enm/domain-ops`
# (karta JEDNA-SCIEZKA-EDYCJI); kontrakt samej operacji przypina
# `tests/api/test_zrodlo_przeksztaltnikowe_jedna_droga.py`. Fikstury łączą 0,5 MW na szynie
# nN 0,4 kV (`_seed_station_enm`), co klasyfikuje się jako moduł NC RfG „B".


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


def _dodaj_zrodlo(app_client, case_id: str, ladunek: dict) -> dict:
    """Wytwórca w modelu JEDYNĄ drogą zapisu: operacja `add_converter_source` przez
    `POST …/enm/domain-ops` (karta JEDNA-SCIEZKA-EDYCJI). Zwraca odpowiedź operacji."""
    odpowiedz = app_client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={"operation": {"name": "add_converter_source", "payload": ladunek}},
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    cialo = odpowiedz.json()
    assert not cialo.get("error"), cialo.get("error_code")
    return cialo


def _ustaw_wiazania(app_client, case_id: str, generator_ref: str, pola: dict) -> dict:
    """Wiązania wytwórcy operacją `set_der_catalog_bindings` przez `…/enm/domain-ops`."""
    odpowiedz = app_client.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={
            "operation": {
                "name": "set_der_catalog_bindings",
                "payload": {"generator_ref": generator_ref, **pola},
            }
        },
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    cialo = odpowiedz.json()
    assert not cialo.get("error"), cialo.get("error_code")
    return cialo


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
                {
                    # Druga szyna nN stacji (sekcja rozdzielnicy) — cel jawnego `bus_ref`
                    # w teście pierwszeństwa; różna od szyny nN wyprowadzanej z wariantu.
                    "ref_id": "station/1/nn_bus_2",
                    "name": "Szyna nN sekcja 2",
                    "voltage_kv": 0.4,
                    "tags": [],
                    "meta": {},
                },
            ],
            # Sekcja 2 rozdzielnicy nN jest zasilana przez sprzęgło z sekcji 1 — źródło na
            # sekcji 2 ma transformator w ścieżce zasilania (jeden predykat na grafie
            # galwanicznym, karta POLA-W-TORZE §0 pkt 4). Sekcja bez żadnego połączenia
            # z transformatorem byłaby wyspą bez zasilania i brama słusznie by jej odmówiła.
            "branches": [
                {
                    "ref_id": "station/1/nn_coupler",
                    "name": "Sprzęgło nN",
                    "type": "bus_coupler",
                    "from_bus_ref": "station/1/nn_bus",
                    "to_bus_ref": "station/1/nn_bus_2",
                    "status": "closed",
                    "tags": [],
                    "meta": {},
                }
            ],
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
                    "bus_refs": [
                        "station/1/wn_bus",
                        "station/1/sn_bus",
                        "station/1/nn_bus",
                        "station/1/nn_bus_2",
                    ],
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


def _utworz_wytworce(app_client) -> tuple[str, str, str]:
    """Projekt + przypadek + wytwórca PV w modelu; zwraca (project_id, case_id, ref)."""
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    response = _dodaj_zrodlo(
        app_client,
        case_id,
        {
            "station_ref": "station/1",
            "source_technology": "PV",
            "power_setpoint_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_binding": {"catalog_item_id": "conv-pv-nn-0p5mw-0p4kv"},
            "source_name": "PV wiązania",
        },
    )
    return project_id, case_id, response["snapshot"]["generators"][0]["ref_id"]


def _wiazania_z_modelu(app_client, case_id: str) -> dict:
    persisted = app_client.get(f"/api/cases/{case_id}/enm")
    assert persisted.status_code == 200
    return persisted.json()["generators"][0].get("materialized_params", {})


def test_protection_functions_wyprowadzone_z_faktow_pola(app_client) -> None:
    """Endpoint doboru funkcji zabezpieczeniowych (karta E21-3, audyt E-21 P7/P8).

    Do V12K-246 ekran pokazywal STALA liste 13 kodow ANSI, ta sama dla kazdej
    instalacji. Ten test pilnuje, ze odpowiedz jest WYPROWADZENIEM z faktow o polu:
    kazda funkcja niesie podstawe, chroniony obiekt i zrodlo pomiaru, a brak danych
    o torze zerowym daje NAZWANA kwestie otwarta zamiast domyslnej rodziny funkcji.
    """
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    utworzenie = _dodaj_zrodlo(
        app_client,
        case_id,
        {
            "station_ref": "station/1",
            "source_technology": "PV",
            "power_setpoint_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_binding": {"catalog_item_id": "conv-pv-nn-0p5mw-0p4kv"},
            "source_name": "PV Stacja 1",
            "nc_rfg_module": "B",
        },
    )
    generator_ref = utworzenie["snapshot"]["generators"][0]["ref_id"]

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

    utworzenie = _dodaj_zrodlo(
        app_client,
        case_id,
        {
            "station_ref": "station/1",
            "source_technology": "PV",
            "power_setpoint_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_binding": {"catalog_item_id": "conv-pv-nn-0p5mw-0p4kv"},
            "source_name": "PV Stacja 1",
            "nc_rfg_module": "B",
        },
    )
    generator_ref = utworzenie["snapshot"]["generators"][0]["ref_id"]

    # ABB REB670 to aparat roznicowy SZYN — katalog niesie `87BB`.
    _ustaw_wiazania(
        app_client,
        case_id,
        generator_ref,
        {"protection_catalog_ref": "ABB_REB670"},
    )

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

    utworzenie = _dodaj_zrodlo(
        app_client,
        case_id,
        {
            "station_ref": "station/1",
            "source_technology": "PV",
            "power_setpoint_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_binding": {"catalog_item_id": "conv-pv-nn-0p5mw-0p4kv"},
            "source_name": "PV Stacja 1",
            "nc_rfg_module": "B",
        },
    )
    generator_ref = utworzenie["snapshot"]["generators"][0]["ref_id"]

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

    utworzenie = _dodaj_zrodlo(
        app_client,
        case_id,
        {
            "station_ref": "station/1",
            "source_technology": "PV",
            "power_setpoint_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_binding": {"catalog_item_id": "conv-pv-nn-0p5mw-0p4kv"},
            "source_name": "PV Stacja 1",
            "nc_rfg_module": "B",
        },
    )
    generator_ref = utworzenie["snapshot"]["generators"][0]["ref_id"]

    _ustaw_wiazania(
        app_client,
        case_id,
        generator_ref,
        {
            "ct_catalog_ref": "ct_200_5_5p10_10va_abb",
            "vt_catalog_ref": "vt_20kv_100v_3p_abb",
            "protection_catalog_ref": "ABB_REB670",
        },
    )

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


def test_dobor_ct_uzywa_obwodu_wtornego_z_pomiaru_modelu(app_client) -> None:
    """Karta W3-B (mapa 4 #3): `ct.alf` czyta obwod wtorny z `Measurement` TEGO
    SAMEGO pola (`bay_ref`) — tor model -> domena -> jadro, zero liczenia w API.

    Bez zakonczonego przebiegu zwarciowego `alf_wymagany` nie istnieje, wiec
    werdykt zbiorczy zostaje `brak_danych` (kod `ct.required_alf_missing") —
    ale bilans mocy wtornej JEST juz POLICZONY z obwodu zapisanego w modelu:
    dowodem jest slad WHITE BOX z niezerowym S2obl, nie liczba domyslna.
    """
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    from tests.test_execution_api import _klucz_modelu

    project_id, case_id = _create_project_and_case(app_client)

    enm = EnergyNetworkModel.model_validate(
        {
            "header": {
                "name": "Model DER obwod",
                "defaults": {
                    "frequency_hz": 50.0,
                    "unit_system": "SI",
                    "sn_nominal_kv": 15.0,
                },
            },
            "buses": [
                {"ref_id": "b_sn", "name": "Szyna SN", "voltage_kv": 15.0, "tags": [], "meta": {}}
            ],
            "branches": [],
            "sources": [],
            "loads": [],
            "transformers": [],
            "generators": [
                {
                    "ref_id": "gen_1",
                    "name": "PV pole SN",
                    "bus_ref": "b_sn",
                    "p_mw": 1.0,
                    "meta": {
                        # Relacja wytwórcy z polem: `meta.field_ref` (karta W5-B; model
                        # `Generator` nie ma pola `bay_ref`).
                        "field_ref": "field_der",
                        "ct_catalog_ref": "ct_200_5_5p10_10va_abb",
                    },
                    "tags": [],
                }
            ],
            "substations": [],
            "bays": [],
            "junctions": [],
            "corridors": [],
            "measurements": [
                {
                    "ref_id": "ct_field_der",
                    "name": "CT pole DER",
                    "measurement_type": "CT",
                    "bus_ref": "b_sn",
                    "bay_ref": "field_der",
                    "rating": {"ratio_primary": 200.0, "ratio_secondary": 5.0},
                    "catalog_ref": "ct_200_5_5p10_10va_abb",
                    "obwod_wtorny": {
                        "dlugosc_przewodu_m": 60.0,
                        "przekroj_przewodu_mm2": 1.5,
                        "obciazenia_aparatow": [{"nazwa": "Przekaźnik", "moc_va": 5.0}],
                    },
                }
            ],
            "protection_assignments": [],
            "branch_points": [],
        }
    )
    set_enm(_klucz_modelu(case_id), enm)

    odpowiedz = app_client.get(
        f"/api/projects/{project_id}/cases/{case_id}" f"/generators/gen_1/instrument-transformers"
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    dane = odpowiedz.json()
    ct_alf = next(
        k for k in dane["przekladnik_pradowy"]["wynik"]["kryteria"] if k["kod"] == "ct.alf"
    )
    assert ct_alf["werdykt"] == "brak_danych"
    assert "ct.required_alf_missing" in ct_alf["kody_gotowosci"]
    # Bilans wtorny SAM w sobie JEST policzony (obwod przyszedl z modelu, nie
    # z powietrza) — dowod w sladzie WHITE BOX, nie w liczbie zapisanej na sztywno.
    assert ct_alf["slad"], "obwod wtorny z modelu powinien dac slad bilansu mocy wtornej"
    krok_bilansu = next(k for k in ct_alf["slad"] if k["key"] == "ct_bilans_mocy")
    assert krok_bilansu["result"]["s2obl_va"]["value"] > 0


def test_dobor_ct_bez_pomiaru_w_polu_zostaje_brak_danych_obwodu(app_client) -> None:
    """Kontrola granicy: bez `Measurement` w polu obwod NIE jest zmyslany —
    `ct.alf` konczy sie kodem `ct.secondary_circuit_missing`, nie fabrykacja."""
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    from tests.test_execution_api import _klucz_modelu

    project_id, case_id = _create_project_and_case(app_client)

    enm = EnergyNetworkModel.model_validate(
        {
            "header": {
                "name": "Model DER bez obwodu",
                "defaults": {
                    "frequency_hz": 50.0,
                    "unit_system": "SI",
                    "sn_nominal_kv": 15.0,
                },
            },
            "buses": [
                {"ref_id": "b_sn", "name": "Szyna SN", "voltage_kv": 15.0, "tags": [], "meta": {}}
            ],
            "branches": [],
            "sources": [],
            "loads": [],
            "transformers": [],
            "generators": [
                {
                    "ref_id": "gen_1",
                    "name": "PV pole SN",
                    "bus_ref": "b_sn",
                    "p_mw": 1.0,
                    "meta": {
                        # Relacja wytwórcy z polem: `meta.field_ref` (karta W5-B; model
                        # `Generator` nie ma pola `bay_ref`).
                        "field_ref": "field_der",
                        "ct_catalog_ref": "ct_200_5_5p10_10va_abb",
                    },
                    "tags": [],
                }
            ],
            "substations": [],
            "bays": [],
            "junctions": [],
            "corridors": [],
            "measurements": [],
            "protection_assignments": [],
            "branch_points": [],
        }
    )
    set_enm(_klucz_modelu(case_id), enm)

    dane = app_client.get(
        f"/api/projects/{project_id}/cases/{case_id}" f"/generators/gen_1/instrument-transformers"
    ).json()
    ct_alf = next(
        k for k in dane["przekladnik_pradowy"]["wynik"]["kryteria"] if k["kod"] == "ct.alf"
    )
    assert ct_alf["werdykt"] == "brak_danych"
    assert "ct.secondary_circuit_missing" in ct_alf["kody_gotowosci"]
    assert ct_alf["dostepne"] is None


def test_obwod_wtorny_pomiaru_pomija_aparat_bez_mocy_nie_podstawia_zera() -> None:
    """Karta W3-B / `scripts/solver_input_substitute_guard.py`: pozycja
    `obciazenia_aparatow` bez `moc_va` (albo z wartoscia nie-liczbowa) jest
    POMIJANA w bilansie mocy wtornej — NIGDY zastepowana domyslnym zerem.
    Zero VA to POMIAR (aparat nic nie pobiera), nie znacznik braku danej;
    ciche podstawienie zera zanizyloby bilans `S2obl` bez sladu, ze dana byla
    niekompletna. Test schodzi PONIZEJ warstwy Pydantic (ktora w praktyce
    wymusza `moc_va: float` na kazdej pozycji zapisanej przez API) — sam
    `_obwod_wtorny_pomiaru` czyta surowy `dict` ze snapshotu i NIE zaklada
    poprawnosci cudzej warstwy zapisu, zgodnie z duchem guarda."""
    from api.generators import _obwod_wtorny_pomiaru
    from network_model.solvers.equipment_checks.ct_burden_saturation import CtDeviceBurden

    dane: dict = {
        "measurements": [
            {
                "ref_id": "ct_field_der",
                "measurement_type": "CT",
                "bay_ref": "field_der",
                "catalog_ref": "ct_200_5_5p10_10va_abb",
                "obwod_wtorny": {
                    "dlugosc_przewodu_m": 60.0,
                    "przekroj_przewodu_mm2": 1.5,
                    "obciazenia_aparatow": [
                        {"nazwa": "Przekaznik OC", "moc_va": 5.0},
                        {"nazwa": "Uszkodzona pozycja bez mocy"},
                        {"nazwa": "Uszkodzona pozycja z tekstem", "moc_va": "n/d"},
                        {"nazwa": "Watomierz", "moc_va": 3.5},
                    ],
                },
            }
        ]
    }

    wynik = _obwod_wtorny_pomiaru(dane, "field_der", "CT", "ct_200_5_5p10_10va_abb")

    assert wynik.obciazenia_aparatow == (
        CtDeviceBurden(nazwa="Przekaznik OC", moc_va=5.0),
        CtDeviceBurden(nazwa="Watomierz", moc_va=3.5),
    )


def test_dobor_przekladnikow_bez_wiazania_nie_udaje_werdyktu(app_client) -> None:
    """Brak wiazania katalogowego to nie „dobor niespelniony" — to brak wyboru."""
    project_id, case_id = _create_project_and_case(app_client)
    _seed_station_enm(case_id)

    utworzenie = _dodaj_zrodlo(
        app_client,
        case_id,
        {
            "station_ref": "station/1",
            "source_technology": "PV",
            "power_setpoint_mw": 0.5,
            "connection_variant": "nn_side",
            "catalog_binding": {"catalog_item_id": "conv-pv-nn-0p5mw-0p4kv"},
            "source_name": "PV Stacja 1",
            "nc_rfg_module": "B",
        },
    )
    generator_ref = utworzenie["snapshot"]["generators"][0]["ref_id"]

    dane = app_client.get(
        f"/api/projects/{project_id}/cases/{case_id}"
        f"/generators/{generator_ref}/instrument-transformers"
    ).json()

    assert dane["przekladnik_pradowy"] == {"catalog_ref": None, "nazwa": None, "wynik": None}
    assert dane["przekladnik_napieciowy"] == {"catalog_ref": None, "nazwa": None, "wynik": None}


@pytest.mark.parametrize("tolerancja", ["PLUS_6", "PLUS_10", None])
def test_dobor_przekladnikow_pola_nn_na_wartosci_roboczej_tolerancji_niesie_dana_przyjeta(
    app_client, tolerancja: str | None
) -> None:
    """Karta TOLERANCJA-NN-WARTOSC-ROBOCZA: Ik''/ip szyny pola wytwórcy w sieci nN liczonej
    z wartością roboczą tolerancji (sieć bez deklaracji) stoją na danej przyjętej — odpowiedź
    doboru przekładników niesie `dane_przyjete` (ESTIMATED) i stan `UNVALIDATED_INPUT`;
    sieć zadeklarowana (+6 % / +10 %) — odpowiedź bez tych pól. Znacznik pochodzi z TEGO
    SAMEGO wiersza zapisanego biegu, z którego endpoint bierze Ik'' i ip."""
    from enm.canonical_analysis import create_run, execute_run
    from enm.store import set_enm

    from tests.enm.test_canonical_sc_c_per_pasmo import N2, _build_mv_lv_enm
    from tests.test_execution_api import _klucz_modelu

    project_id, case_id = _create_project_and_case(app_client)
    enm = _build_mv_lv_enm("Pole wytwórcy nN", tolerancja=tolerancja)  # type: ignore[arg-type]
    set_enm(_klucz_modelu(case_id), enm)
    bieg = execute_run(
        create_run(
            case_id=case_id, klucz_twin=_klucz_modelu(case_id), analysis_type="short_circuit_sn"
        ).id
    )
    assert bieg.status == "FINISHED", bieg.error_message
    # Generator pola na szynie nN dopisany PO biegu: endpoint czyta generator z modelu,
    # a Ik''/ip z wiersza szyny pola w zakończonym biegu (ten sam punkt zwarcia).
    z_generatorem = type(enm).model_validate(
        {
            **enm.model_dump(mode="json"),
            "generators": [
                {
                    "ref_id": "gen_nn",
                    "name": "PV pole nN",
                    "bus_ref": N2,
                    "p_mw": 0.1,
                    "meta": {"bay_ref": "pole_pv", "ct_catalog_ref": "ct_200_5_5p10_10va_abb"},
                }
            ],
        }
    )
    set_enm(_klucz_modelu(case_id), z_generatorem)

    odpowiedz = app_client.get(
        f"/api/projects/{project_id}/cases/{case_id}/generators/gen_nn/instrument-transformers"
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    dane = odpowiedz.json()
    assert dane["wejscia"]["ik_ka"] is not None
    assert dane["wejscia"]["run_ref_zwarciowy"] == str(bieg.id)
    if tolerancja is None:
        assert dane["status_danych"] == "UNVALIDATED_INPUT"
        (dana,) = dane["dane_przyjete"]
        assert dana["nazwa_pl"] == "tolerancja napięcia sieci nN (szyna pola „Szyna nN”)"
        assert dana["jakosc"] == "ESTIMATED"
    else:
        assert "dane_przyjete" not in dane
        assert "status_danych" not in dane
