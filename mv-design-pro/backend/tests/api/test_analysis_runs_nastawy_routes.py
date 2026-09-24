"""Trasy JSON nastaw Hoppela — `/api/analysis-runs/{run_id}/nastawy[/dopasowanie]`
(karta W3-C1, decyzja §0.2/§0.4). Router HTTP realny (`TestClient`), w
przeciwieństwie do `tests/application/test_pakiet_nastaw.py`, które testuje
bramę bezpośrednio na warstwie aplikacji (konwencja TEJ bramy — router jest
cienki i tu sprawdzany jest WYŁĄCZNIE na poziomie wpięcia: 404 kotwicy,
parytet liczb JSON z pakietem ZIP, determinizm, 422 na brak danych.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from api.main import app
from application.proof_engine.pakiet_nastaw import zbuduj_pakiet_nastaw
from application.protection_settings.zacisk_zabezpieczenia import (
    KOD_BRAK_WSKAZANIA,
    KOD_SPRZECZNY_Z_MODELEM,
)
from domain.canonical_operations import READINESS_CODES
from enm.canonical_analysis import (
    CanonicalRun,
    _execute_short_circuit,
    canonical_run_repository_scope,
)
from enm.models import (
    BranchRating,
    Bus,
    EnergyNetworkModel,
    ENMHeader,
    Load,
    OverheadLine,
    ProtectionAssignment,
    Source,
    SwitchBranch,
)
from fastapi.testclient import TestClient


def _reset_backend_state() -> None:
    from enm.canonical_analysis import reset_canonical_runs

    reset_canonical_runs()


@pytest.fixture()
def client() -> TestClient:
    _reset_backend_state()
    with TestClient(app) as test_client:
        yield test_client


def _siec() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Siec tras JSON nastaw"),
        buses=[
            Bus(ref_id="b_src", name="GPZ SN", voltage_kv=15.0),
            Bus(ref_id="b_a", name="Stacja A", voltage_kv=15.0),
            Bus(ref_id="b_b", name="Stacja B", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="src",
                name="System 15 kV",
                bus_ref="b_src",
                model="short_circuit_power",
                sk3_mva=500.0,
                r_ohm=0.1,
                x_ohm=1.0,
            )
        ],
        loads=[Load(ref_id="ld_b", name="Odbior B", bus_ref="b_b", p_mw=1.0, q_mvar=0.3)],
        branches=[
            OverheadLine(
                ref_id="ln1",
                name="Linia ln1",
                from_bus_ref="b_src",
                to_bus_ref="b_a",
                length_km=2.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.35,
                rating=BranchRating(in_a=200.0),
                cross_section_mm2=120.0,
                conductor_material="Al",
            ),
            OverheadLine(
                ref_id="ln2",
                name="Linia ln2",
                from_bus_ref="b_a",
                to_bus_ref="b_b",
                length_km=2.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.35,
                rating=BranchRating(in_a=200.0),
                cross_section_mm2=120.0,
                conductor_material="Al",
            ),
        ],
    )


def _zapisana_kotwica(run_id: UUID, siec: EnergyNetworkModel | None = None) -> CanonicalRun:
    run = CanonicalRun(
        id=run_id,
        case_id="case-nastawy-json",
        project_id="proj-nastawy-json",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=datetime(2024, 1, 1, tzinfo=UTC),
        snapshot_hash="snap-hash-nastawy-json",
        input_hash="in-hash-nastawy-json",
        snapshot=(siec or _siec()).model_dump(mode="json"),
        validation={},
        readiness={},
        options={"fault_type": "3F", "c_factor": 1.10, "thermal_time_seconds": 1.0},
    )
    run.finished_at = run.created_at
    _execute_short_circuit(run)
    with canonical_run_repository_scope() as repository:
        repository.save(run)
    return run


def test_404_gdy_kotwica_nie_istnieje(client: TestClient) -> None:
    response = client.get(
        f"/api/analysis-runs/{uuid4()}/nastawy",
        params={"linia": "ln1", "nastepna_szyna": "b_b"},
    )
    assert response.status_code == 404


def _wartosc_kluczowa(dowod: dict, klucz: str) -> float:
    """Wartość z `summary.key_results` dowodu — KAŻDY klucz tam jest unikalny
    (w przeciwieństwie do `steps[].result.source_key`, który ten sam identyfikator
    zmiennej silnika potrafi nazwać w kilku krokach o różnym znaczeniu lokalnym,
    np. „i_th_dop_a" pojawia się zarówno w ogólnym sprawdzeniu cieplnym linii,
    jak i w warunku cieplnym I>> — dwie różne fizycznie liczby pod tą samą nazwą
    zmiennej silnika)."""
    return float(dowod["summary"]["key_results"][klucz]["value"])


def test_nastawy_json_parytet_z_pakietem_zip(client: TestClient) -> None:
    run = _zapisana_kotwica(uuid4())
    params = {
        "linia": "ln1",
        "nastepna_szyna": "b_b",
        "c_min": 1.0,
        "zacisk_zabezpieczenia": "od",
    }

    response = client.get(f"/api/analysis-runs/{run.id}/nastawy", params=params)
    assert response.status_code == 200
    body = response.json()
    assert body["dostepnosc_pakietu"] is True

    import io
    import json
    import zipfile

    _, zawartosc = zbuduj_pakiet_nastaw(
        run, line_id="ln1", next_bus_id="b_b", c_min=1.0, zacisk_zabezpieczenia="od"
    )
    with zipfile.ZipFile(io.BytesIO(zawartosc)) as zf:
        dowod = json.loads(zf.read("proof_pack/proof.json"))

    # Parytet liczb: JSON i ZIP liczą DOKŁADNIE tę samą fizykę (`oblicz_nastawy`,
    # jeden rachunek — reguła KLASA-NIE-INSTANCJA, predykaty parami).
    wynik = body["wynik"]
    assert wynik["delayed"]["i_setting_a"] == _wartosc_kluczowa(dowod, "I_delayed_A")
    assert wynik["instantaneous"]["i_setting_a"] == _wartosc_kluczowa(dowod, "I_instantaneous_A")
    assert wynik["thermal"]["i_th_dop_a"] == _wartosc_kluczowa(dowod, "I_th_dop_A")


def test_nastawy_json_jest_deterministyczny(client: TestClient) -> None:
    run = _zapisana_kotwica(uuid4())
    params = {
        "linia": "ln1",
        "nastepna_szyna": "b_b",
        "c_min": 1.0,
        "zacisk_zabezpieczenia": "od",
    }

    r1 = client.get(f"/api/analysis-runs/{run.id}/nastawy", params=params)
    r2 = client.get(f"/api/analysis-runs/{run.id}/nastawy", params=params)
    assert r1.status_code == r2.status_code == 200
    assert r1.json() == r2.json()


def test_nastawy_json_422_gdy_szyna_poza_kandydatami(client: TestClient) -> None:
    run = _zapisana_kotwica(uuid4())
    response = client.get(
        f"/api/analysis-runs/{run.id}/nastawy",
        params={
            "linia": "ln1",
            "nastepna_szyna": "b-nieznana",
            "c_min": 1.0,
            "zacisk_zabezpieczenia": "od",
        },
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["kod"] is None
    assert "b-nieznana" in detail["powod_pl"]


def test_nastawy_dopasowanie_json(client: TestClient) -> None:
    run = _zapisana_kotwica(uuid4())
    response = client.get(
        f"/api/analysis-runs/{run.id}/nastawy/dopasowanie",
        params={
            "device_id": "ABB_REF601",
            "linia": "ln1",
            "nastepna_szyna": "b_b",
            "c_min": 1.0,
            "zacisk_zabezpieczenia": "od",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["wymaganie"]["curve"] == "DT"
    assert body["vendor_mapping"]["vendor"] == "ABB"
    assert body["proweniencja_nastaw"]["kotwica_run_id"] == str(run.id)


def test_nastawy_dopasowanie_404_gdy_kotwica_nie_istnieje(client: TestClient) -> None:
    response = client.get(
        f"/api/analysis-runs/{uuid4()}/nastawy/dopasowanie",
        params={"device_id": "ABB_REF601", "linia": "ln1", "nastepna_szyna": "b_b"},
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Decyzja O-51 (wariant (b)): zacisk zabezpieczenia na granicy HTTP
# ---------------------------------------------------------------------------


def test_dostepnosc_niesie_zaciski_z_etykietami_i_rekord_odmowy(
    client: TestClient,
) -> None:
    run = _zapisana_kotwica(uuid4())
    response = client.get(f"/api/analysis-runs/{run.id}/pakiet-dowodowy-nastaw/dostepnosc")
    assert response.status_code == 200
    linie = {pozycja["line_id"]: pozycja for pozycja in response.json()["linie"]}
    ln1 = linie["ln1"]
    assert ln1["zacisk_z_modelu"] is None
    assert ln1["wymaga_wskazania_zacisku"] is True
    assert ln1["zaciski_dozwolone"] == ["od", "do"]
    assert ln1["odmowa_zacisku"]["kod"] == KOD_BRAK_WSKAZANIA
    assert ln1["zaciski"]["od"]["etykieta_pl"] == "Zacisk początkowy — szyna GPZ SN"
    assert ln1["nastepne_szyny_wg_zacisku"] == {"od": ["b_b"], "do": []}


@pytest.mark.parametrize("sciezka", ["nastawy", "pakiet-dowodowy-nastaw"])
def test_brak_wskazania_gdy_model_milczy_to_422_z_kodem(client: TestClient, sciezka: str) -> None:
    run = _zapisana_kotwica(uuid4())
    response = client.get(
        f"/api/analysis-runs/{run.id}/{sciezka}",
        params={"linia": "ln1", "nastepna_szyna": "b_b", "c_min": 1.0},
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["kod"] == KOD_BRAK_WSKAZANIA
    assert detail["powod_pl"].startswith(READINESS_CODES[KOD_BRAK_WSKAZANIA].message_pl)


def test_wskazanie_poza_literalem_to_422_walidacji(client: TestClient) -> None:
    run = _zapisana_kotwica(uuid4())
    response = client.get(
        f"/api/analysis-runs/{run.id}/nastawy",
        params={
            "linia": "ln1",
            "nastepna_szyna": "b_b",
            "zacisk_zabezpieczenia": "srodek",
        },
    )
    assert response.status_code == 422


def test_model_rozstrzyga_wskazanie_sprzeczne_to_422_z_kodem(
    client: TestClient,
) -> None:
    """Pole GPZ: wyłącznik CB1 w szeregu z zaciskiem `od` linii ln1 i przypięte do niego
    zabezpieczenie nadprądowe — model rozstrzyga; wskazanie `do` jest sprzeczne."""
    siec = _siec()
    szyna_pola = Bus(ref_id="b_p1", name="Pole ln1", voltage_kv=15.0)
    ln1 = next(galaz for galaz in siec.branches if galaz.ref_id == "ln1")
    ln1.from_bus_ref = "b_p1"
    siec.buses.append(szyna_pola)
    siec.branches.append(
        SwitchBranch(
            ref_id="CB1",
            name="Wyłącznik pola",
            from_bus_ref="b_src",
            to_bus_ref="b_p1",
            type="breaker",
        )
    )
    siec.protection_assignments.append(
        ProtectionAssignment(
            ref_id="PA1",
            name="Zabezpieczenie pola",
            breaker_ref="CB1",
            device_type="overcurrent",
        )
    )
    run = _zapisana_kotwica(uuid4(), siec)
    bez_wskazania = client.get(
        f"/api/analysis-runs/{run.id}/nastawy",
        params={"linia": "ln1", "nastepna_szyna": "b_b"},
    )
    assert bez_wskazania.status_code == 200
    assert bez_wskazania.json()["wejscie"]["zrodlo_zacisku"] == "model"
    sprzeczne = client.get(
        f"/api/analysis-runs/{run.id}/nastawy",
        params={"linia": "ln1", "nastepna_szyna": "b_b", "zacisk_zabezpieczenia": "do"},
    )
    assert sprzeczne.status_code == 422
    assert sprzeczne.json()["detail"]["kod"] == KOD_SPRZECZNY_Z_MODELEM
