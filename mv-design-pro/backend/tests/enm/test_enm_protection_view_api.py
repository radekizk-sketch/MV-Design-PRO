"""Tests for the ENM protection read-model endpoint."""

from uuid import uuid4

import pytest
from api.enm import router as enm_router
from domain.models import Project
from domain.study_case import StudyCase
from enm.canonical_analysis import reset_canonical_runs
from enm.store import get_enm, reset_enm_store
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_source_record
from tests.utils.sterownik import rekord_sterownika, stopien


def _seed_enm(client: TestClient, case_id: str, payload: dict) -> None:
    """Zasiej ENM przez REALNA koncowke `PUT /enm` (jedyna droga zapisu z API).

    CV-1-W: magazyn jest kluczowany kluczem projektu, nie surowym `case_id` —
    pisanie wprost przez `enm.store.set_enm(case_id, ...)` ladowalo dane pod
    klucz, ktorego zaden odczyt API juz nie widzi. `PUT /api/cases/{case_id}/enm`
    przechodzi przez to samo tlumaczenie `KluczTwin`, co kazdy odczyt.
    """
    resp = client.put(f"/api/cases/{case_id}/enm", json=payload)
    assert resp.status_code == 200, resp.text


def _nowy_przypadek(client: TestClient) -> str:
    """Utworz REALNY projekt + przypadek wprost przez UoW; zwroc `case_id`.

    CV-1-W: przypadek bez wiersza w bazie dostaje teraz 404 z magazynu ENM
    (inwariant I-2). Ta aplikacja testowa montuje WYLACZNIE `enm_router` (bez
    tras projektow/przypadkow), wiec pary nie da sie utworzyc przez HTTP —
    tworzymy ja tak samo jak `tests/invariants/test_wlasnosc_modelu_projektu.py
    ::_projekt_z_przypadkami`, wprost przez `uow_factory` zawieszony na
    `client.app.state`.
    """
    uow_factory = client.app.state.uow_factory
    project_id = uuid4()
    case_id = uuid4()
    with uow_factory() as uow:
        uow.projects.add(Project(id=project_id, name="Test protection-view API"), commit=False)
        uow.cases.add_study_case(
            StudyCase(id=case_id, project_id=project_id, name="Przypadek testu"),
            commit=False,
        )
        uow.commit()
    return str(case_id)


def _klucz(client: TestClient, case_id: str) -> str:
    """Klucz magazynu ENM dla `case_id` — TO SAMO tlumaczenie co warstwa API (CV-1)."""
    from application.twin_key import klucz_twin_dla_przypadku

    return klucz_twin_dla_przypadku(case_id, client.app.state.uow_factory)


@pytest.fixture(autouse=True)
def reset_state():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


@pytest.fixture
def client(uow_factory):
    """Lightweight app with only ENM router, wired to a real uow_factory (CV-1)."""
    test_app = FastAPI()
    test_app.include_router(enm_router)
    test_app.state.uow_factory = uow_factory
    return TestClient(test_app)


def _enm_with_protection() -> dict:
    return {
        "header": {
            "name": "Protection View Test",
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 3,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000010101",
                "ref_id": "bus_sn_a",
                "name": "Szyna SN A",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000010102",
                "ref_id": "bus_sn_b",
                "name": "Szyna SN B",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000010103",
                "ref_id": "bus_sn_c",
                "name": "Szyna SN C",
                "tags": [],
                "meta": {},
                "voltage_kv": 15,
                "phase_system": "3ph",
            },
        ],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000010104",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="src_grid",
                    name="GPZ",
                    bus_ref="bus_sn_a",
                    voltage_kv=15.0,
                    sk3_mva=250.0,
                    rx_ratio=0.1,
                ),
            },
        ],
        "branches": [
            {
                "id": "00000000-0000-0000-0000-000000010105",
                "ref_id": "cb_in_1",
                "name": "Wyłącznik pola IN",
                "tags": [],
                "meta": {},
                "type": "breaker",
                "from_bus_ref": "bus_sn_a",
                "to_bus_ref": "bus_sn_b",
                "status": "closed",
                "materialized_params": {"in_a": 630.0},
            },
            {
                "id": "00000000-0000-0000-0000-000000010106",
                "ref_id": "line_1",
                "name": "Linia SN 1",
                "tags": [],
                "meta": {},
                "type": "line_overhead",
                "from_bus_ref": "bus_sn_b",
                "to_bus_ref": "bus_sn_c",
                "status": "closed",
                "length_km": 4.2,
                "r_ohm_per_km": 0.443,
                "x_ohm_per_km": 0.34,
                "rating": {"in_a": 250.0},
            },
        ],
        "transformers": [],
        "loads": [],
        "generators": [],
        "substations": [
            {
                "id": "00000000-0000-0000-0000-000000010107",
                "ref_id": "sub_1",
                "name": "Stacja 1",
                "tags": [],
                "meta": {},
                "station_type": "mv_lv",
                "bus_refs": ["bus_sn_b"],
            },
        ],
        "bays": [
            {
                "id": "00000000-0000-0000-0000-000000010108",
                "ref_id": "bay_in_1",
                "name": "Pole IN",
                "tags": [],
                "meta": {},
                "bay_role": "IN",
                "substation_ref": "sub_1",
                "bus_ref": "bus_sn_b",
                "equipment_refs": ["cb_in_1", "line_1"],
            },
        ],
        "junctions": [],
        "corridors": [],
        "measurements": [
            {
                "id": "00000000-0000-0000-0000-000000010109",
                "ref_id": "ct_in_1",
                "name": "CT pola IN",
                "tags": [],
                "meta": {},
                "measurement_type": "CT",
                "bus_ref": "bus_sn_b",
                "bay_ref": "bay_in_1",
                "rating": {
                    "ratio_primary": 200.0,
                    "ratio_secondary": 1.0,
                    "accuracy_class": "5P20",
                },
                "connection": "star",
                "purpose": "protection",
            },
        ],
        "protection_assignments": [
            {
                "id": "00000000-0000-0000-0000-000000010110",
                "tags": [],
                "meta": {},
                # Karta BIEG-ZABEZPIECZEN-Z-MODELU: urządzenie kompletne — pozycja katalogu
                # z zakresami (×In) i progi ze ZADEKLAROWANĄ stroną przekładnika (PZ-09).
                # Stopień zależny nie ma zwłoki niezależnej (sprzeczność odrzucana przy zapisie).
                **rekord_sterownika(
                    "prot_oc_1",
                    name="Zabezpieczenie pola IN",
                    bay_ref="bay_in_1",
                    wylacznik="cb_in_1",
                    ct_ref="ct_in_1",
                    catalog_ref="REF-OC-200",
                    stopnie=[
                        stopien("51", prog=240.0, jednostka_progu="A_PIERWOTNY", krzywa="IEC_SI"),
                        stopien(
                            "50",
                            prog=800.0,
                            jednostka_progu="A_PIERWOTNY",
                            zwloka_s=0.05,
                            krzywa="DT",
                        ),
                    ],
                ),
            },
        ],
        "branch_points": [],
    }


def _ustaw_nastawe(sterownik: dict, funkcja_ref: str, klucz: str, wartosc: object) -> None:
    """Nastawa funkcji w grupie aktywnej rekordu sterownika; ``None`` zdejmuje nastawę."""
    (grupa,) = (g for g in sterownik["grupy_nastaw"] if g["numer"] == sterownik["aktywna_grupa"])
    wpis = next(f for f in grupa["funkcje"] if f["funkcja_ref"] == funkcja_ref)
    wpis["nastawy"] = [n for n in wpis["nastawy"] if n["klucz"] != klucz]
    if wartosc is not None:
        wpis["nastawy"].append({"klucz": klucz, "wartosc": wartosc, "pochodzenie": "PROJEKTANT"})


def test_get_protection_view_empty(client):
    case_id = _nowy_przypadek(client)
    response = client.get(f"/api/cases/{case_id}/enm/protection-view")
    assert response.status_code == 200
    data = response.json()

    assert data["case_id"] == case_id
    assert data["view_status"] == {
        "data_source": "ENM_PROTECTION_READ_MODEL",
        "result_state": "NONE",
        "has_protection_data": False,
    }
    assert data["summary"] == {
        "total_elements": 0,
        "total_assignments": 0,
        "active_assignments": 0,
        "blocked_assignments": 0,
        "complete_count": 0,
        "incomplete_count": 0,
        "verified_count": 0,
        "failed_count": 0,
        "no_data_count": 0,
        "error_count": 0,
        "warn_count": 0,
        "info_count": 0,
    }
    assert data["assignments"] == []
    assert data["diagnostics"] == []
    assert data["summaries"] == []


def test_get_protection_view_with_assignments_and_diagnostics(client):
    case_id = _nowy_przypadek(client)
    _seed_enm(client, case_id, _enm_with_protection())

    response = client.get(f"/api/cases/{case_id}/enm/protection-view")
    assert response.status_code == 200
    data = response.json()
    stored_enm = get_enm(_klucz(client, case_id))

    assert data["case_id"] == case_id
    assert data["enm_revision"] == stored_enm.header.revision
    assert data["view_status"] == {
        "data_source": "ENM_PROTECTION_READ_MODEL",
        "result_state": "FRESH",
        "has_protection_data": True,
    }
    assert len(data["assignments"]) >= 2
    assert any(item["element_id"] == "line_1" for item in data["assignments"])
    assert any(item["element_id"] == "cb_in_1" for item in data["assignments"])
    assert any(item["device_id"] == "prot_oc_1" for item in data["assignments"])
    assert any(item["device_kind"] == "RELAY_OVERCURRENT" for item in data["assignments"])
    assert all(item["status"] == "ACTIVE" for item in data["assignments"])
    assert isinstance(data["diagnostics"], list)
    assert any(item["element_id"] == "line_1" for item in data["summaries"])
    assert data["summary"]["total_elements"] >= 2
    assert data["summary"]["total_assignments"] >= 2
    assert data["summary"]["active_assignments"] >= 2
    assert data["summary"]["blocked_assignments"] == 0
    assert data["summary"]["complete_count"] >= 1
    assert data["summary"]["incomplete_count"] >= 0
    assert data["summary"]["verified_count"] >= 0
    assert data["summary"]["failed_count"] >= 0
    assert data["summary"]["no_data_count"] >= 0
    assert data["summary"]["error_count"] >= 0
    assert data["summary"]["warn_count"] >= 0
    assert data["summary"]["info_count"] >= 0

    line_summary = next(item for item in data["summaries"] if item["element_id"] == "line_1")
    assert line_summary["ct"]["label"] == "200/1"
    assert line_summary["overcurrent"]["time_overcurrent"]["pickup_a"] == pytest.approx(240.0)


def test_protection_view_serializes_it_curve_from_iec60255_solver(client):
    """protection_ref → funkcje z krzywą I-t (punkty t_s z solvera IEC 60255).

    - Funkcja niezależna (DT, 50 I>>) ma płaską krzywę I-t z solvera.
    - Funkcja odwrotna (IEC_SI, 51 I>) bez TMS w modelu ENM → brak krzywej,
      brak danych ``time_multiplier`` (zero fabrykacji mnożnika czasowego).
    """
    case_id = _nowy_przypadek(client)
    _seed_enm(client, case_id, _enm_with_protection())

    response = client.get(f"/api/cases/{case_id}/enm/protection-view")
    assert response.status_code == 200
    data = response.json()

    assignment = next(item for item in data["assignments"] if item["device_id"] == "prot_oc_1")
    functions = assignment["settings_summary"]["functions"]

    inst = next(fn for fn in functions if fn["code"] == "OVERCURRENT_INST")  # 50 I>>, DT
    it_curve = inst["it_curve"]
    assert it_curve is not None
    assert it_curve["standard"] == "IEC_60255"
    assert it_curve["curve_kind"] == "DEFINITE"
    assert it_curve["curve_code"] == "DT"
    assert it_curve["pickup_a"] == pytest.approx(800.0)
    assert len(it_curve["points"]) >= 2
    # Charakterystyka niezależna: czas zadziałania stały = zwłoka (0,05 s) z solvera.
    assert all(point["t_s"] == pytest.approx(0.05) for point in it_curve["points"])
    assert all(point["i_a"] > 800.0 for point in it_curve["points"])
    assert "it_curve_missing_data" not in inst

    time_fn = next(fn for fn in functions if fn["code"] == "OVERCURRENT_TIME")  # 51 I>, IEC_SI
    assert time_fn["it_curve"] is None
    assert time_fn["it_curve_missing_data"] == ["time_multiplier"]


#: Kody braku krzywej I-t emitowane przez ``protection_read_model`` — para z tłumaczeniem
#: w interfejsie (``frontend/src/ui/protection-curves/itCurveAdapter.ts``,
#: ``IT_CURVE_MISSING_REASON_PL``; pin w ``ItCurvePanel.test.tsx``).
KODY_BRAKU_KRZYWEJ_IT = {
    "time_multiplier",
    "definite_time",
    "curve_type",
    "ct_ratio",
    "it_curve_points",
}


@pytest.mark.parametrize(
    ("zmiana", "brak"),
    [
        ({"zwloka_s": None}, "definite_time"),
        ({"krzywa": None}, "curve_type"),
    ],
    ids=["bez_zwloki", "bez_charakterystyki"],
)
def test_protection_view_brak_danych_stopnia_bezzwlocznego_nazwany(client, zmiana, brak):
    """Stopień bezzwłoczny (50 I>>, DT) bez zwłoki albo bez charakterystyki → krzywa I-t NIE
    jest rysowana, brak jest nazwany kodem z pary backend↔interfejs (próg bez strony
    przekładnika nie wchodzi do modelu — PZ-09, `test_prog_bez_strony_przekladnika_odrzuca_model`;
    brak przekładni — kod ``ct_ratio``, test niżej). Czerwony na bazie: bez zwłoki read model podstawiał podłogę czasową
    solvera 0,001 s (cichy zapas „DT bez zwłoki = 0 s"), sprzeczny z jedną ścieżką oceny,
    która takiej nastawy nie ocenia."""
    import copy

    payload = copy.deepcopy(_enm_with_protection())
    device = next(d for d in payload["protection_assignments"] if d["ref_id"] == "prot_oc_1")
    for klucz, wartosc in zmiana.items():
        _ustaw_nastawe(device, "50", klucz, wartosc)
    case_id = _nowy_przypadek(client)
    _seed_enm(client, case_id, payload)

    data = client.get(f"/api/cases/{case_id}/enm/protection-view").json()
    assignment = next(item for item in data["assignments"] if item["device_id"] == "prot_oc_1")
    inst = next(
        fn for fn in assignment["settings_summary"]["functions"] if fn["code"] == "OVERCURRENT_INST"
    )
    assert inst["it_curve"] is None
    assert inst["it_curve_missing_data"] == [brak]
    assert set(inst["it_curve_missing_data"]) <= KODY_BRAKU_KRZYWEJ_IT


def test_protection_view_prog_wtorny_bez_przekladni_nazwany(client):
    """Próg po stronie WTÓRNEJ, a wejście prądów fazowych bez przekładnika (przekładni nie ma
    z czego wziąć) — prądu pierwotnego nie ma, krzywa I-t nie jest rysowana, brak nazwany kodem
    ``ct_ratio`` (para z interfejsem)."""
    import copy

    payload = copy.deepcopy(_enm_with_protection())
    device = next(d for d in payload["protection_assignments"] if d["ref_id"] == "prot_oc_1")
    _ustaw_nastawe(device, "50", "jednostka_progu", "A_WTORNY")
    _ustaw_nastawe(device, "50", "prog", 4.0)
    device["wejscia"].pop("ct_ref")
    case_id = _nowy_przypadek(client)
    _seed_enm(client, case_id, payload)

    data = client.get(f"/api/cases/{case_id}/enm/protection-view").json()
    assignment = next(item for item in data["assignments"] if item["device_id"] == "prot_oc_1")
    inst = next(
        fn for fn in assignment["settings_summary"]["functions"] if fn["code"] == "OVERCURRENT_INST"
    )
    assert inst["setpoint"] is None
    assert inst["it_curve"] is None
    assert inst["it_curve_missing_data"] == ["ct_ratio"]
    assert set(inst["it_curve_missing_data"]) <= KODY_BRAKU_KRZYWEJ_IT


def test_protection_view_inverse_it_curve_with_tms_from_solver(client):
    """Charakterystyka odwrotna (IEC_SI, 51 I>) Z nastawą TMS → krzywa I-t z solvera.

    Gdy ``ProtectionSetting.time_multiplier`` jest podane, read model liczy krzywą
    solverem IEC 60255 (charakterystyka odwrotna, opadająca) — brak fabrykacji.
    """
    import copy

    payload = copy.deepcopy(_enm_with_protection())
    device = next(d for d in payload["protection_assignments"] if d["ref_id"] == "prot_oc_1")
    _ustaw_nastawe(device, "51", "tms", 0.2)  # TMS stopnia IEC_SI
    case_id = _nowy_przypadek(client)
    _seed_enm(client, case_id, payload)

    response = client.get(f"/api/cases/{case_id}/enm/protection-view")
    assert response.status_code == 200
    data = response.json()

    assignment = next(item for item in data["assignments"] if item["device_id"] == "prot_oc_1")
    functions = assignment["settings_summary"]["functions"]

    time_fn = next(fn for fn in functions if fn["code"] == "OVERCURRENT_TIME")  # 51 I>, IEC_SI
    it_curve = time_fn["it_curve"]
    assert it_curve is not None
    assert "it_curve_missing_data" not in time_fn
    assert it_curve["standard"] == "IEC_60255"
    assert it_curve["curve_kind"] == "INVERSE"
    assert it_curve["curve_code"] == "SI"
    assert it_curve["pickup_a"] == pytest.approx(240.0)
    assert it_curve["time_multiplier"] == pytest.approx(0.2)
    assert len(it_curve["points"]) > 2
    # Charakterystyka odwrotna: czas maleje monotonicznie ze wzrostem prądu (solver).
    times = [point["t_s"] for point in it_curve["points"]]
    assert all(earlier > later for earlier, later in zip(times, times[1:], strict=False))
    assert all(point["i_a"] > 240.0 for point in it_curve["points"])
