"""API contract tests — koordynacja zabezpieczen (karta ZAB-100-BACKEND).

Pokrywa montaz routera `api/protection_coordination.py` pod `/api` (decyzja
D10, `docs/uiux/DECYZJE_ARCHITEKTONICZNE_2026-08.md`):
  - 7 tras FIX-12 (bieg, odczyt, tcc, trace, 3x checks) na REALNYCH danych
    (2 urzadzenia w lancuchu selektywnosci, prady zwarciowe + robocze),
  - bramka eligibility (`_check_run_eligibility`) — iloczyn cech
    {devices puste} x {fault_currents puste} x {operating_currents puste},
    kazda kombinacja daje 400 PL, NIGDY 201 z fabrykowanym PASS,
  - 2 nowe eksporty (PDF/DOCX) — obecnosc, naglowki, determinizm bajt-w-bajt,
  - 404 dla nieznanego run_id na WSZYSTKICH 9 trasach odczytu/eksportu
    (iloczyn cech {trasa} x {model z/bez zabezpieczen} z karty).

NOT-A-SOLVER: testy nie liczba fizyki — wywoluja istniejacy silnik
(`OvercurrentCoordinationAnalyzer` + `protection.curves.curve_calculator`)
przez warstwe API i sprawdzaja ksztalt/status odpowiedzi.
"""

from __future__ import annotations

import hashlib
import time
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest

pytest.importorskip("fastapi")

from enm.canonical_analysis import (  # noqa: E402
    CanonicalRun,
    _execute_short_circuit,
    canonical_run_repository_scope,
)
from enm.models import Bus, Cable, EnergyNetworkModel, ENMHeader, Source, Transformer  # noqa: E402

# =============================================================================
# Karta S-2 AUTORYTET: prądy zwarciowe koordynacji pochodzą z DWÓCH ZAPISANYCH
# BIEGÓW kanonicznych (MAX + MIN), nie z gołych liczb w żądaniu. Sieć: GPZ
# 110 kV -> T1 -> bus_2 (10 kV, upstream) -> kabel -> bus_1 (10 kV, downstream)
# — TE SAME identyfikatory lokalizacji ("bus_1"/"bus_2"), których cała reszta
# tego pliku już używa (`element_id` biegu = `ref_id` ENM, dopasowanie przez
# `application.autorytet_biegu_zwarciowego._identyfikatory_wiersza`).
# =============================================================================


def _siec_koordynacji() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Siec koordynacji (karta S-2)", revision=1),
        buses=[
            Bus(ref_id="bus_source", name="GPZ 110", voltage_kv=110.0),
            Bus(ref_id="bus_2", name="Bus gorny (upstream)", voltage_kv=10.0),
            Bus(ref_id="bus_1", name="Bus dolny (downstream)", voltage_kv=10.0),
        ],
        sources=[
            Source(
                ref_id="s1",
                name="System 110 kV",
                bus_ref="bus_source",
                model="short_circuit_power",
                sk3_mva=300.0,
                rx_ratio=0.1,
                sk3_min_mva=150.0,
                rx_ratio_min=0.15,
            )
        ],
        transformers=[
            Transformer(
                ref_id="t1",
                name="T1",
                hv_bus_ref="bus_source",
                lv_bus_ref="bus_2",
                sn_mva=10.0,
                uhv_kv=110.0,
                ulv_kv=10.0,
                uk_percent=10.5,
                pk_kw=80.0,
                vector_group="YNd11",
            )
        ],
        branches=[
            Cable(
                ref_id="c1",
                name="Kabel bus_2-bus_1",
                from_bus_ref="bus_2",
                to_bus_ref="bus_1",
                length_km=1.0,
                r_ohm_per_km=0.25,
                x_ohm_per_km=0.1,
            )
        ],
    )


def _zapisz_bieg_koordynacji(*, scenario: str) -> CanonicalRun:
    utworzony = datetime(2026, 1, 1, tzinfo=UTC)
    run = CanonicalRun(
        id=uuid4(),
        case_id="case-koordynacja-s2",
        project_id="proj-koordynacja-s2",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=utworzony,
        snapshot_hash="snap-koordynacja-s2",
        input_hash=f"in-koordynacja-{scenario}",
        snapshot=_siec_koordynacji().model_dump(mode="json"),
        validation={},
        readiness={},
        options={"fault_type": "3F", "scenario": scenario, "thermal_time_seconds": 1.0},
    )
    run.finished_at = utworzony
    _execute_short_circuit(run)
    with canonical_run_repository_scope() as repository:
        repository.save(run)
    return run


def _ikss_a_per_lokalizacja(run: CanonicalRun) -> dict[str, float]:
    """``element_id`` (== `ref_id` ENM) -> I''k [A] — ta sama droga dopasowania
    co `application.autorytet_biegu_zwarciowego._identyfikatory_wiersza`."""
    grafy = run.raw_result["graph"]["nodes"]
    wynik: dict[str, float] = {}
    for wiersz in run.raw_result["results"]:
        ikss = wiersz.get("ikss_a")
        if ikss is None:
            continue
        element_id = grafy.get(wiersz["fault_node_id"], {}).get("element_id")
        if element_id:
            wynik[element_id] = float(ikss)
    return wynik


def _device(
    device_id: str,
    *,
    name: str,
    location_element_id: str,
    pickup_current_a: float,
    time_multiplier: float,
) -> dict[str, Any]:
    return {
        "id": device_id,
        "name": name,
        "device_type": "RELAY",
        "location_element_id": location_element_id,
        "settings": {
            "stage_51": {
                "enabled": True,
                "pickup_current_a": pickup_current_a,
                "curve_settings": {
                    "standard": "IEC",
                    "variant": "SI",
                    "pickup_current_a": pickup_current_a,
                    "time_multiplier": time_multiplier,
                },
            }
        },
        "manufacturer": "ABB",
    }


def _reference_payload() -> dict[str, Any]:
    """Siec referencyjna: dwa urzadzenia w lancuchu selektywnosci (dol/gora).

    Karta S-2 AUTORYTET: ``fault_currents`` jest ECHEM porównywanym z DWOMA
    ZAPISANYMI BIEGAMI (``sc_run_id``=MAX, ``sc_run_id_min``=MIN) — liczby
    poniżej są WPROST z realnych biegów (`_zapisz_bieg_koordynacji`), nie
    wymyślone; test „obejście 999 kA" niżej dowodzi, że wymyślone liczby są
    teraz odrzucane.
    """
    downstream_id = str(uuid4())
    upstream_id = str(uuid4())
    bieg_max = _zapisz_bieg_koordynacji(scenario="max")
    bieg_min = _zapisz_bieg_koordynacji(scenario="min")
    prady_max = _ikss_a_per_lokalizacja(bieg_max)
    prady_min = _ikss_a_per_lokalizacja(bieg_min)
    return {
        "devices": [
            _device(
                downstream_id,
                name="Zabezpieczenie_dolne",
                location_element_id="bus_1",
                pickup_current_a=400.0,
                time_multiplier=0.3,
            ),
            _device(
                upstream_id,
                name="Zabezpieczenie_gorne",
                location_element_id="bus_2",
                pickup_current_a=600.0,
                time_multiplier=0.5,
            ),
        ],
        "fault_currents": [
            {
                "location_id": "bus_1",
                "ik_max_3f_a": prady_max["bus_1"],
                "ik_min_3f_a": prady_min["bus_1"],
            },
            {
                "location_id": "bus_2",
                "ik_max_3f_a": prady_max["bus_2"],
                "ik_min_3f_a": prady_min["bus_2"],
            },
        ],
        "operating_currents": [
            {"location_id": "bus_1", "i_operating_a": 150.0},
            {"location_id": "bus_2", "i_operating_a": 120.0},
        ],
        "sc_run_id": str(bieg_max.id),
        "sc_run_id_min": str(bieg_min.id),
    }


def _run(app_client: Any, payload: dict[str, Any] | None = None) -> Any:
    project_id = str(uuid4())
    body = payload if payload is not None else _reference_payload()
    return app_client.post(f"/api/protection-coordination/projects/{project_id}/run", json=body)


# =============================================================================
# Audyt 7 tras — dane referencyjne (siec z zabezpieczeniami)
# =============================================================================


def test_run_coordination_analysis_on_reference_network(app_client: Any) -> None:
    response = _run(app_client)
    assert response.status_code == 201
    body = response.json()
    assert body["total_devices"] == 2
    # 2 czulosc + 1 selektywnosc + 2 przeciazalnosc = 5
    assert body["total_checks"] == 5
    assert body["overall_verdict"] in {"PASS", "MARGINAL", "FAIL"}
    assert body["overall_verdict_pl"]


def test_get_coordination_result_returns_full_shape(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}")
    assert response.status_code == 200
    body = response.json()
    for key in (
        "run_id",
        "project_id",
        "devices",
        "sensitivity_checks",
        "selectivity_checks",
        "overload_checks",
        "tcc_curves",
        "fault_markers",
        "overall_verdict",
        "summary",
        "trace_steps",
    ):
        assert key in body
    # ZAB-100-BACKEND: devices NIE JEST puste, mimo ze 2 urzadzenia byly badane
    # (naprawa audytu — wczesniej pole nie istnialo w ogole w to_dict()).
    assert len(body["devices"]) == 2
    assert {d["name"] for d in body["devices"]} == {
        "Zabezpieczenie_dolne",
        "Zabezpieczenie_gorne",
    }


def test_get_tcc_data_returns_curves_and_markers(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}/tcc")
    assert response.status_code == 200
    body = response.json()
    assert len(body["curves"]) == 2
    assert len(body["fault_markers"]) >= 4  # 2 lokalizacje x (max3f, min3f)


def test_get_trace_returns_white_box_steps(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}/trace")
    assert response.status_code == 200
    body = response.json()
    assert body["run_id"] == run_id
    assert len(body["trace_steps"]) > 0
    assert body["created_at"]


def test_get_sensitivity_checks_returns_verdicts(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}/checks/sensitivity")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    for check in body:
        assert check["verdict"] in {"PASS", "MARGINAL", "FAIL", "ERROR"}


def test_get_selectivity_checks_returns_verdicts(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}/checks/selectivity")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["verdict"] in {"PASS", "MARGINAL", "FAIL", "ERROR"}


def test_get_overload_checks_returns_verdicts(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}/checks/overload")
    assert response.status_code == 200
    body = response.json()
    assert len(body) == 2
    for check in body:
        assert check["verdict"] in {"PASS", "MARGINAL", "FAIL", "ERROR"}


# =============================================================================
# Granica autorytetu (karta S-2 AUTORYTET) — bieg zwarciowy niemiarodajny
# =============================================================================


def test_sc_run_id_brak_jest_odrzucony(app_client: Any) -> None:
    """`sc_run_id`/`sc_run_id_min` obowiązkowe przy egzekucji (§0 p.5 karty) —
    brak = 422 z komunikatem PL, nie 201 z fabrykowanym werdyktem."""
    payload = _reference_payload()
    payload.pop("sc_run_id")
    payload.pop("sc_run_id_min")
    response = _run(app_client, payload)

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["powod"] == "BIEG_NIE_WSKAZANY"


def test_obejscie_sc_run_id_nieistniejacy_plus_prady_wymyslone_odrzucony(app_client: Any) -> None:
    """OBEJŚCIE ODTWORZONE (karta S-2, ten sam wzorzec co equipment-proof):
    `sc_run_id` wskazujący bieg, którego nigdy nie było, plus wymyślone prądy
    zwarciowe — PRZED kartą S-2 dawało to kompletny werdykt koordynacji."""
    payload = _reference_payload()
    payload["sc_run_id"] = "BIEG-KTORY-NIGDY-NIE-ISTNIAL"
    payload["sc_run_id_min"] = "BIEG-KTORY-NIGDY-NIE-ISTNIAL-MIN"
    for wpis in payload["fault_currents"]:
        wpis["ik_max_3f_a"] = 999000.0
        wpis["ik_min_3f_a"] = 999000.0
    response = _run(app_client, payload)

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["powod"] == "BIEG_NIE_ISTNIEJE"


def test_sc_run_id_realny_ale_prady_rozbiezne_odrzucony(app_client: Any) -> None:
    """Bieg MAX/MIN istnieją i są poprawne, ale `fault_currents` w żądaniu
    różni się od tego, co biegi policzyły — 422 WYNIK_NIEZGODNY, nie 201."""
    payload = _reference_payload()
    payload["fault_currents"][0]["ik_max_3f_a"] = 999000.0
    response = _run(app_client, payload)

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["powod"] == "PRADY_NIEZGODNE_Z_BIEGIEM"


# =============================================================================
# Decyzja O-51 pkt 7 — miejsce urządzenia: lokalizacja-GAŁĄŹ ze wskazanym zaciskiem.
# Prąd zwarciowy lokalizacji-gałęzi to prąd SZYNY zacisku (kabel c1: od = bus_2,
# do = bus_1) i tak jest potwierdzany wobec biegów — ten sam resolver, z którego
# ekran czyta prąd (`zacisk_zabezpieczenia.szyny_zwarcia_lokalizacji`).
# Iloczyn cech: zacisk {od, do, brak} × prąd {prąd szyny zacisku, prąd drugiej szyny}.
# =============================================================================

_SZYNA_ZACISKU_KABLA = {"od": "bus_2", "do": "bus_1"}


def _payload_na_kablu(zacisk: str | None, szyna_pradu: str) -> dict[str, Any]:
    payload = _reference_payload()
    urzadzenie = payload["devices"][0]
    urzadzenie["location_element_id"] = "c1"
    if zacisk is not None:
        urzadzenie["zacisk"] = zacisk
    payload["devices"] = [urzadzenie]
    zrodlo = next(f for f in payload["fault_currents"] if f["location_id"] == szyna_pradu)
    payload["fault_currents"] = [{**zrodlo, "location_id": "c1"}]
    payload["operating_currents"] = [{"location_id": "c1", "i_operating_a": 150.0}]
    return payload


@pytest.mark.parametrize("zacisk", ["od", "do"])
def test_lokalizacja_galaz_prad_szyny_zacisku_przyjety(app_client: Any, zacisk: str) -> None:
    response = _run(app_client, _payload_na_kablu(zacisk, _SZYNA_ZACISKU_KABLA[zacisk]))
    assert response.status_code == 201, response.text
    assert response.json()["total_devices"] == 1


@pytest.mark.parametrize("zacisk", ["od", "do"])
def test_lokalizacja_galaz_prad_drugiej_szyny_odrzucony(app_client: Any, zacisk: str) -> None:
    druga = _SZYNA_ZACISKU_KABLA["do" if zacisk == "od" else "od"]
    response = _run(app_client, _payload_na_kablu(zacisk, druga))
    assert response.status_code == 422, response.text
    detail = response.json()["detail"]
    assert detail["powod"] == "PRADY_NIEZGODNE_Z_BIEGIEM"
    assert any(
        f"c1 (szyna {_SZYNA_ZACISKU_KABLA[zacisk]})" in n for n in detail["niezgodnosci"]
    ), detail


def test_lokalizacja_galaz_bez_zacisku_odmowa_nazwana(app_client: Any) -> None:
    response = _run(app_client, _payload_na_kablu(None, "bus_2"))
    assert response.status_code == 422, response.text
    niezgodnosci = response.json()["detail"]["niezgodnosci"]
    assert any(
        "c1: brak szyny zwarcia lokalizacji" in n and "wskaż zacisk" in n for n in niezgodnosci
    )


def test_zacisk_spoza_od_do_odrzucony_walidacja(app_client: Any) -> None:
    payload = _payload_na_kablu("od", "bus_2")
    payload["devices"][0]["zacisk"] = "srodek"
    assert _run(app_client, payload).status_code == 422


def test_sc_run_id_min_scenariusz_zamieniony_z_max_odrzucony(app_client: Any) -> None:
    """Bieg MAX podstawiony jako MIN (scenariusz odwrócony) — 422, nie ciche
    przyjęcie: czułość liczona z prądu maksymalnego dałaby werdykt zawyżony."""
    payload = _reference_payload()
    bieg_max_id = payload["sc_run_id"]
    payload["sc_run_id_min"] = bieg_max_id
    response = _run(app_client, payload)

    assert response.status_code == 422, response.text
    assert response.json()["detail"]["powod"] == "SCENARIUSZ_BIEGU_NIEZGODNY"


# =============================================================================
# 404 na nieznanym run_id — WSZYSTKIE trasy odczytu/eksportu (uczciwy blad,
# nie 500) — iloczyn cech {trasa} x {model bez zabezpieczen == brak wyniku}.
# =============================================================================


@pytest.mark.parametrize(
    "suffix",
    [
        "",
        "/tcc",
        "/trace",
        "/checks/sensitivity",
        "/checks/selectivity",
        "/checks/overload",
        "/export/pdf",
        "/export/docx",
    ],
)
def test_unknown_run_id_returns_404_not_500(app_client: Any, suffix: str) -> None:
    response = app_client.get(f"/api/protection-coordination/does-not-exist{suffix}")
    assert response.status_code == 404
    assert "detail" in response.json()


# =============================================================================
# Bramka eligibility — iloczyn cech {devices} x {fault_currents} x
# {operating_currents} pustych/niepustych. ZERO kombinacji smie dac 201
# z fabrykowanym werdyktem PASS przy braku danych wejsciowych.
# =============================================================================


def test_run_with_empty_devices_is_rejected_honestly(app_client: Any) -> None:
    payload = _reference_payload()
    payload["devices"] = []
    response = _run(app_client, payload)
    assert response.status_code == 400
    assert "urzadzenia" in response.json()["detail"]


def test_run_with_empty_fault_currents_is_rejected_honestly(app_client: Any) -> None:
    payload = _reference_payload()
    payload["fault_currents"] = []
    response = _run(app_client, payload)
    assert response.status_code == 400
    assert "zwarciowych" in response.json()["detail"]


def test_run_with_empty_operating_currents_is_rejected_honestly(app_client: Any) -> None:
    payload = _reference_payload()
    payload["operating_currents"] = []
    response = _run(app_client, payload)
    assert response.status_code == 400
    assert "roboczych" in response.json()["detail"]


def test_run_with_all_three_empty_reports_all_blockers(app_client: Any) -> None:
    payload = {"devices": [], "fault_currents": [], "operating_currents": []}
    response = _run(app_client, payload)
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "urzadzenia" in detail
    assert "zwarciowych" in detail
    assert "roboczych" in detail


def test_run_with_full_reference_data_never_returns_pass_with_zero_checks(
    app_client: Any,
) -> None:
    """Regresja defektu z audytu: puste devices dawaly 201 PASS/total_checks=0."""
    response = _run(app_client)
    assert response.status_code == 201
    body = response.json()
    if body["overall_verdict"] == "PASS":
        assert body["total_checks"] > 0


# =============================================================================
# Eksporty PDF/DOCX — obecnosc, naglowki, determinizm bajt-w-bajt
# =============================================================================


def test_export_pdf_returns_attachment(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}/export/pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert f"protection_coordination_{run_id}.pdf" in response.headers["content-disposition"]
    assert response.content[:4] == b"%PDF"
    assert len(response.content) > 0


def test_export_docx_returns_attachment(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}/export/docx")
    assert response.status_code == 200
    assert (
        response.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert f"protection_coordination_{run_id}.docx" in response.headers["content-disposition"]
    assert response.content[:2] == b"PK"  # ZIP/OOXML magic bytes
    assert len(response.content) > 0


def test_export_pdf_is_byte_deterministic_across_repeated_calls(app_client: Any) -> None:
    run_id = _run(app_client).json()["run_id"]
    first = app_client.get(f"/api/protection-coordination/{run_id}/export/pdf")
    second = app_client.get(f"/api/protection-coordination/{run_id}/export/pdf")
    assert first.status_code == 200
    assert second.status_code == 200
    assert hashlib.sha256(first.content).hexdigest() == hashlib.sha256(second.content).hexdigest()
    assert first.content == second.content


def test_export_docx_is_byte_deterministic_across_repeated_calls(app_client: Any) -> None:
    """Odstep >2s MIEDZY wywolaniami jest CELOWY, nie kosmetyczny: DOCX jest ZIP-em,
    a `zipfile` znakuje kazdy wpis biezacym czasem lokalnym w formacie DOS, ktory
    ma rozdzielczosc DWOCH SEKUND (pole sekund koduje wartosc/2) — dwa wywolania
    oddalone o <=2s moga trafic w TEN SAM znacznik nawet bez normalizacji
    (`docx_determinism.make_docx_bytes_deterministic`), co dawaloby falszywa
    zielen. Test musi przeciac granice DWOCH sekund, zeby cokolwiek dowodzic
    (zweryfikowane iniekcja I2 karty ZAB-100-BACKEND: `deterministic=False` w
    warstwie API przechodzil ten sam test BEZ odstepu czasowego; DOCX-DETERMINIZM-RESZTA
    2026-08-13 doprecyzowala granulacje — odstep 1.1s dawal ok. 30% falszywych
    zielonych w pomiarze empirycznym z powodu 2-sekundowej ziarnistosci DOS)."""
    run_id = _run(app_client).json()["run_id"]
    first = app_client.get(f"/api/protection-coordination/{run_id}/export/docx")
    time.sleep(2.1)
    second = app_client.get(f"/api/protection-coordination/{run_id}/export/docx")
    assert first.status_code == 200
    assert second.status_code == 200
    assert hashlib.sha256(first.content).hexdigest() == hashlib.sha256(second.content).hexdigest()
    assert first.content == second.content


def test_export_docx_renders_real_device_names_not_brak_urzadzen(app_client: Any) -> None:
    """Regresja audytu: bez pola `devices` w to_dict() raport ZAWSZE pokazywal
    "Brak urzadzen", mimo ze 2 urzadzenia byly analizowane."""
    docx = pytest.importorskip("docx")
    import io

    run_id = _run(app_client).json()["run_id"]
    response = app_client.get(f"/api/protection-coordination/{run_id}/export/docx")
    assert response.status_code == 200
    document = docx.Document(io.BytesIO(response.content))
    cell_texts = [
        cell.text for table in document.tables for row in table.rows for cell in row.cells
    ]
    assert any("Zabezpieczenie_dolne" in text for text in cell_texts)
    assert any("Zabezpieczenie_gorne" in text for text in cell_texts)
    assert not any(text.strip() == "Brak urządzeń" for text in cell_texts)


def test_export_routes_are_mounted_under_api_prefix(app_client: Any) -> None:
    """Karta ZAB-100-BACKEND: router byl wczesniej NIEZAMONTOWANY — pin na montaz."""
    route_paths = {route.path for route in app_client.app.routes}
    assert "/api/protection-coordination/projects/{project_id}/run" in route_paths
    assert "/api/protection-coordination/{run_id}" in route_paths
    assert "/api/protection-coordination/{run_id}/tcc" in route_paths
    assert "/api/protection-coordination/{run_id}/trace" in route_paths
    assert "/api/protection-coordination/{run_id}/checks/sensitivity" in route_paths
    assert "/api/protection-coordination/{run_id}/checks/selectivity" in route_paths
    assert "/api/protection-coordination/{run_id}/checks/overload" in route_paths
    assert "/api/protection-coordination/{run_id}/export/pdf" in route_paths
    assert "/api/protection-coordination/{run_id}/export/docx" in route_paths
