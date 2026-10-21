"""Końcówka werdyktów wytrzymałości aparatury pól — REALNA ścieżka (karta KD-6).

Sieć powstaje operacjami domenowymi (jedyna produkcyjna droga budowy modelu),
a stacja jest wstawiana z JAWNIE wskazaną pozycją katalogu APARAT_SN — dokładnie
tak, jak robi to kreator. Żaden aparat nie jest tu wstrzykiwany „na skróty",
więc test dowodzi, że werdykt naprawdę bierze się z modelu.

Karta WYTRZYMALOSC-PRAD-POLA: żądanie niesie stację i ZAPISANY bieg zwarciowy (nie liczby);
prąd każdego pola to wiersz biegu dla jego punktu zabudowy. Bieg jest liczony produkcyjnym
torem (``create_run`` + ``execute_run`` — ten sam, który uruchamia ekran wyników).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest
from api.main import app
from enm.canonical_analysis import build_short_circuit_results, create_run, execute_run
from enm.dziennik_zmian import wyczysc_dziennik
from enm.store import reset_enm_store
from fastapi.testclient import TestClient

APARAT_POLA = "sw-cb-abb-vd4-17kv-630a"
KABEL = "cable-tfk-yakxs-3x120"
TRAFO = "tr-sn-nn-15-04-630kva-dyn11"
ZRODLO = "src-gpz-15kv-250mva-rx010"
CT = "ct_400_5_5p20_15va_abb"
PRZEKAZNIK = "REF-OC-100"


@pytest.fixture()
def klient(tmp_path, monkeypatch, uow_factory) -> TestClient:
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
    project_resp = klient.post("/api/projects", json={"name": "Wytrzymalosc aparatury — test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = klient.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
    )
    assert case_resp.status_code == 201, case_resp.text
    return str(case_resp.json()["id"])


def _operacja(klient: TestClient, case_id: str, nazwa: str, payload: dict) -> dict:
    odp = klient.post(
        f"/api/cases/{case_id}/enm/domain-ops",
        json={"operation": {"name": nazwa, "payload": payload}},
    )
    assert odp.status_code == 200, odp.text
    dane = odp.json()
    assert not dane.get("error"), dane.get("error")
    return dane


def _stacja_z_polami(klient: TestClient, case_id: str, *, z_zabezpieczeniem: bool = False) -> str:
    _operacja(
        klient,
        case_id,
        "add_grid_source_sn",
        {
            "voltage_kv": 15.0,
            "sk3_mva": 250.0,
            "catalog_ref": ZRODLO,
            "hv_voltage_kv": 110.0,
            "transformer_sn_mva": 25.0,
        },
    )
    odp = _operacja(
        klient,
        case_id,
        "continue_trunk_segment_sn",
        {"segment": {"rodzaj": "KABEL", "dlugosc_m": 400, "catalog_ref": KABEL}},
    )
    segmenty = odp["snapshot"]["corridors"][0]["ordered_segment_refs"]
    # Wyposażenie pola (CT + przekaźnik z NASTAWAMI) powstaje w TEJ SAMEJ
    # operacji co stacja (B-3) — to produkcyjna droga zapisu nastaw pola.
    pole_in: Any = (
        {
            "field_role": "LINIA_IN",
            "equipment": {
                "ct": {
                    "catalog_ref": CT,
                    "ratio_primary_a": 400.0,
                    "ratio_secondary_a": 5.0,
                },
                "relay": {
                    "catalog_ref": PRZEKAZNIK,
                    "relay_type": "NADPRADOWY",
                    "settings": [
                        {
                            "function_type": "overcurrent_51",
                            "threshold_a": 400.0,
                            "threshold_unit": "A_PIERWOTNY",
                            "curve_type": "DT",
                            "time_delay_s": 0.3,
                        }
                    ],
                },
            },
        }
        if z_zabezpieczeniem
        else "IN"
    )
    odp = _operacja(
        klient,
        case_id,
        "insert_station_on_segment_sn",
        {
            "field_apparatus_catalog_ref": APARAT_POLA,
            "segment_id": segmenty[-1],
            "station_type": "B",
            "insert_at": {"value": 0.5},
            "station": {
                "sn_voltage_kv": 15.0,
                "nn_voltage_kv": 0.4,
                # Bieg zwarciowy liczy też sieć nN stacji — tabela 1 IEC 60909-0 wymaga jej
                # zadeklarowanej tolerancji napięcia; odbiór potrzeb własnych pozwala policzyć
                # rozpływ (bieg innego rodzaju w teście odrzucenia).
                "station_auxiliary": {"active_power_kw": 10.0, "cos_phi": 0.95},
                "nn_earthing": {"lv_system": "TN-S", "lv_voltage_tolerance": "PLUS_6"},
            },
            "sn_fields": [pole_in, "OUT"],
            "transformer": {
                "create": True,
                "catalog_binding": {
                    "catalog_namespace": "TRAFO_SN_NN",
                    "catalog_item_id": TRAFO,
                    "catalog_item_version": "2024.1",
                },
            },
        },
    )
    stacje = [s for s in odp["snapshot"]["substations"] if "/station" in s["ref_id"]]
    assert stacje, "Operacja musi utworzyć stację"
    return str(stacje[0]["ref_id"])


def _bieg(
    klient: TestClient,
    case_id: str,
    *,
    analysis_type: str = "short_circuit_sn",
    options: dict[str, Any] | None = None,
) -> str:
    """Zapisany bieg liczony produkcyjnym torem; zwraca jego identyfikator."""
    from application.twin_key import klucz_twin_dla_przypadku

    klucz = klucz_twin_dla_przypadku(case_id, klient.app.state.uow_factory)
    run = execute_run(
        create_run(
            case_id=case_id, klucz_twin=klucz, analysis_type=analysis_type, options=options
        ).id
    )
    assert run.status == "FINISHED", run.error_message
    return str(run.id)


def _wytrzymalosc(klient: TestClient, case_id: str, station_ref: str, run_id: str) -> Any:
    return klient.post(
        f"/api/cases/{case_id}/enm/wytrzymalosc-aparatury",
        json={"station_ref": station_ref, "short_circuit_run_id": run_id},
    )


def _ocena(pole: dict[str, Any], rodzaj: str) -> dict[str, Any]:
    return next(o for o in pole["oceny"] if o["kryterium_id"].endswith(f".{rodzaj}"))


def test_werdykty_powstaja_z_modelu_i_pradow_pola_z_biegu(klient: TestClient):
    """SEDNO: żadnego zapisu konfiguracji i żadnej liczby w żądaniu — a pola stacji dostają
    werdykt przy prądach z wiersza biegu dla SWOJEGO punktu zabudowy."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)
    run_id = _bieg(klient, case_id)

    odp = _wytrzymalosc(klient, case_id, station_ref, run_id)
    assert odp.status_code == 200, odp.text
    widok = odp.json()

    from enm.canonical_analysis import get_run

    wiersze = {
        w["element_id"]: w
        for w in build_short_circuit_results(get_run(UUID(run_id)))["rows"]
        if w["fault_type"] == "3F"
    }
    assert widok["status"] == "OK"
    assert widok["bieg_zwarciowy_ref"] == run_id
    assert widok["pola"], "Stacja z aparatami w modelu musi dać wiersze werdyktu"
    assert {p["zrodlo"] for p in widok["pola"]} == {"model"}
    for pole in widok["pola"]:
        assert pole["aparat_catalog_ref"] == APARAT_POLA
        # Znamiona z pozycji katalogu — z jawnym pochodzeniem każdej liczby.
        assert pole["znamiona"]["i_th_ka"] is not None
        assert pole["znamiona"]["i_th_pochodzenie"] == "producent"
        assert pole["znamiona"]["i_dyn_pochodzenie"] == "derived_iec62271"
        # Prądy pola = wiersz biegu dla punktu zabudowy pola (nie liczba z żądania).
        wiersz = wiersze[pole["prady_pola"]["punkt_ref"]]
        assert pole["prady_pola"]["ip_ka"] == wiersz["ip_ka"]
        assert pole["prady_pola"]["ith_ka"] == wiersz["ith_ka"]
        assert pole["werdykt"]["i_dyn_ok"] is True
        assert _ocena(pole, "dynamiczna")["status_maszynowy"] == "SPELNIA"


@pytest.mark.parametrize("tb_s", [None, 0.1], ids=["bez_tb", "tb_0_1"])
def test_kryterium_wylaczania_z_realnego_biegu_porownuje_ib(klient: TestClient, tb_s: float | None):
    """Karta SC-IB-ITH-ZRODLA — realna ścieżka: bieg produkcyjny (z t_b albo bez), końcówka
    HTTP, trzeci rekord K. Sieć bez maszyn wirujących: I_b = I″k (IEC 60909-0 rozdz. 9) jest
    wyznaczalne także bez t_b, więc kryterium wyłączania wyłącznika SN jest rozstrzygnięte
    wobec I_b z wiersza biegu i nazywa tę wielkość; t_b i i_DC(t_b) wiersza idą do śladu."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)
    opcje = None if tb_s is None else {"breaking_time_seconds": tb_s}
    run_id = _bieg(klient, case_id, options=opcje)

    odp = _wytrzymalosc(klient, case_id, station_ref, run_id)
    assert odp.status_code == 200, odp.text
    from enm.canonical_analysis import get_run

    wiersze = {
        w["element_id"]: w
        for w in build_short_circuit_results(get_run(UUID(run_id)))["rows"]
        if w["fault_type"] == "3F"
    }
    for pole in odp.json()["pola"]:
        wiersz = wiersze[pole["prady_pola"]["punkt_ref"]]
        assert pole["prady_pola"]["ib_ka"] == wiersz["ib_ka"] == wiersz["ikss_ka"]
        assert pole["prady_pola"]["tb_s"] == tb_s
        assert pole["prady_pola"]["un_kv"] == wiersz["un_kv"]
        ocena = _ocena(pole, "wylaczanie")
        assert ocena["status_maszynowy"] == "SPELNIA"
        assert ocena["wynik"]["symbol_latex"] == "I_b"
        assert ocena["wynik"]["wartosc"]["wartosc"] == wiersz["ib_ka"]
        assert ocena["podstawa"]["dokument"].startswith("IEC 62271-100")
        assert "fault.czas_tb_brak" not in pole["kody_gotowosci"]
        if tb_s is None:
            assert pole["prady_pola"]["i_dc_ka"] is None
        else:
            assert pole["prady_pola"]["i_dc_ka"] == wiersz["i_dc_ka"] is not None


def test_koncowka_jest_deterministyczna(klient: TestClient):
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)
    run_id = _bieg(klient, case_id)

    pierwsza_odp = _wytrzymalosc(klient, case_id, station_ref, run_id)
    druga_odp = _wytrzymalosc(klient, case_id, station_ref, run_id)
    # Przypina status PRZED porownaniem cial — dwie identyczne odpowiedzi
    # bledu (np. 404 tlumaczenia case_id) rownie chetnie przeszlyby ten
    # test (test maskujacy defekt).
    assert pierwsza_odp.status_code == 200, pierwsza_odp.text
    assert druga_odp.status_code == 200, druga_odp.text

    assert pierwsza_odp.json() == druga_odp.json()


def test_stacja_spoza_modelu_nie_udaje_pustej(klient: TestClient):
    case_id = _nowy_przypadek(klient)
    _stacja_z_polami(klient, case_id)
    run_id = _bieg(klient, case_id)

    odp = _wytrzymalosc(klient, case_id, "nie-ma-takiej", run_id)
    assert odp.status_code == 200
    widok = odp.json()
    assert widok["status"] == "brak danych"
    assert widok["kody_gotowosci"] == ["aparatura.stacja_nieznana"]


def test_zadanie_bez_biegu_jest_odrzucane(klient: TestClient):
    """Liczby z żądania zniknęły — bez biegu nie ma czego oceniać (422, nie werdykt)."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)

    odp = klient.post(
        f"/api/cases/{case_id}/enm/wytrzymalosc-aparatury",
        json={"station_ref": station_ref, "i_peak_ka": 10.0, "i_thermal_ka": 4.0, "ik_ka": 8.0},
    )
    assert odp.status_code == 422


@pytest.mark.parametrize(
    ("bieg", "kod"),
    [
        (lambda klient, case_id: "nie-uuid", 422),
        (lambda klient, case_id: str(uuid4()), 404),
        (lambda klient, case_id: _bieg(klient, case_id, analysis_type="PF"), 422),
        (lambda klient, case_id: _bieg(klient, case_id, options={"scenario": "min"}), 422),
    ],
    ids=["niepoprawny_uuid", "bieg_nieistniejacy", "bieg_rozplywu", "scenariusz_min"],
)
def test_bieg_niewlasciwy_jest_odrzucany(klient: TestClient, bieg: Any, kod: int):
    """Scenariusz MIN zaniżyłby prąd i dał werdykt optymistyczny — wytrzymałość ocenia
    się przy prądzie maksymalnym."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)

    odp = _wytrzymalosc(klient, case_id, station_ref, bieg(klient, case_id))
    assert odp.status_code == kod, odp.text


def test_czas_z_nastaw_pola_bez_czasu_wlasnego_daje_brak_podstawy(klient: TestClient):
    """KD-6 poz. 3 + karta WYTRZYMALOSC-PRAD-POLA: człon nastawczy wyprowadzony z NASTAW przy
    prądzie TEGO pola, ale katalog wyłącznika nie niesie czasu własnego — czasu wyłączenia
    nie ma, a kryterium cieplne ma BRAK_PODSTAWY z przyczyną (dawniej SPEŁNIA na 0,3 s)."""
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id, z_zabezpieczeniem=True)
    run_id = _bieg(klient, case_id)

    odp = _wytrzymalosc(klient, case_id, station_ref, run_id)
    assert odp.status_code == 200, odp.text
    widok = odp.json()

    z_nastaw = [p for p in widok["pola"] if p["czas_wylaczenia"]["zrodlo"] == "nastawy_pola"]
    assert z_nastaw, "Pole z nastawami musi dostać człon wyprowadzony z charakterystyki"
    pole = z_nastaw[0]
    czas = pole["czas_wylaczenia"]
    # WHITE BOX: człon i ślad nastawy, prąd = Ik″ punktu zabudowy TEGO pola.
    assert czas["czlon_nastawczy_s"] == 0.3
    assert czas["funkcja"] == "overcurrent_51"
    assert czas["prad_zwarciowy_a"] == pytest.approx(pole["prady_pola"]["ik_ka"] * 1000.0)
    assert czas["t_clearing_s"] is None
    assert czas["czas_wlasny_wylacznika_s"] is None
    assert "aparatura.brak_czasu_wlasnego_wylacznika" in pole["kody_gotowosci"]
    assert pole["werdykt"]["i_th_ok"] is None
    cieplna = _ocena(pole, "cieplna")
    assert cieplna["status_maszynowy"] == "BRAK_PODSTAWY"
    assert cieplna["wyjasnienie"]["czego_brakuje"]


def test_pole_bez_nastaw_dostaje_kod_gotowosci_zamiast_czasu_z_powietrza(klient: TestClient):
    case_id = _nowy_przypadek(klient)
    station_ref = _stacja_z_polami(klient, case_id)
    run_id = _bieg(klient, case_id)

    odp = _wytrzymalosc(klient, case_id, station_ref, run_id)
    assert odp.status_code == 200, odp.text
    widok = odp.json()

    assert widok["pola"], "Stacja ma pola z aparatami — werdykt dynamiczny nadal powstaje"
    for pole in widok["pola"]:
        assert pole["czas_wylaczenia"]["t_clearing_s"] is None
        assert "aparatura.czas_wylaczenia_nieustalony" in pole["kody_gotowosci"]
        # Kryterium dynamiczne rozstrzygnięte MIMO braku czasu.
        assert pole["werdykt"]["i_dyn_ok"] is True
        assert pole["werdykt"]["i_th_ok"] is None
        assert _ocena(pole, "cieplna")["status_maszynowy"] == "BRAK_PODSTAWY"
