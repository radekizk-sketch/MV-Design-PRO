"""Testy końcówki `GET /api/cases/{case_id}/v126/gotowosc` (karta B02-BE-TESTY, §4).

Wzorzec zasiewu przypadku: `tests/api/test_v126_generator_q_missing_api.py::_seed_case`
(REALNY projekt + przypadek przez API, model pod kluczem PROJEKTU — CV-1-W).

Sedno tej końcówki (karta B-02 §3.3 E / reguła KLASA §3, predykaty parami):
GET pokazuje projektantowi PRZED uruchomieniem DOKŁADNIE to, co POST sprawdza
przy uruchomieniu — więc parytet GET↔POST na KOMPLECIE 14 rodzajów jest testem
najwyższej wagi tego pliku, nie jednym przykładem.
"""

from __future__ import annotations

import json
from uuid import uuid4

from api.main import app
from application.analyses.v126_gotowosc import przedmiot_modelu
from enm.hash import compute_enm_hash
from enm.klucz_twin import klucz_twin_projektu
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm
from fastapi.testclient import TestClient
from solver_input.v126_contracts import V126AnalysisType

from tests.cgmes.golden_enm import build_golden_enm

GOTOWOSC_URL = "{case_id}/v126/gotowosc"


def _seed_case(client: TestClient, model: EnergyNetworkModel | None) -> str:
    """Realny projekt + przypadek przez API, model pod kluczem PROJEKTU (CV-1-W:
    końcówka tłumaczy `case_id` na klucz twin; przypadek spoza bazy = 404)."""
    reset_enm_store()
    project_resp = client.post("/api/projects", json={"name": "V12.6 gotowosc - test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = client.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
    )
    assert case_resp.status_code == 201, case_resp.text
    if model is not None:
        set_enm(klucz_twin_projektu(project_id), model)
    return str(case_resp.json()["id"])


def _url(case_id: str) -> str:
    return f"/api/cases/{GOTOWOSC_URL.format(case_id=case_id)}"


def _komunikat_z_braki(braki: list[dict]) -> str:
    """Odtwarza `GotowoscAnalizy.komunikat_odmowy()` Z ODPOWIEDZI GET (pole
    `braki`) — sprawdza, że POST-owy `detail` jest DOSŁOWNIE tym, co GET pokazał
    projektantowi (parytet przez format przewodowy, nie przez ponowne wywołanie
    tej samej funkcji Pythona)."""
    czesci = []
    for brak in braki:
        elementy = f" — {', '.join(brak['elementy'])}" if brak["elementy"] else ""
        czesci.append(f"{brak['opis_pl']} ({brak['kod']}){elementy}")
    return "; ".join(czesci)


# ---------------------------------------------------------------------------
# Kształt odpowiedzi
# ---------------------------------------------------------------------------


def test_get_bez_analysis_type_zwraca_komplet_14_rodzajow() -> None:
    enm = build_golden_enm()
    with TestClient(app) as client:
        case_id = _seed_case(client, enm)
        resp = client.get(_url(case_id))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body.keys()) == {"case_id", "model_hash", "przedmiot", "analizy"}
    assert body["case_id"] == case_id
    assert len(body["analizy"]) == 14
    assert {a["kod"] for a in body["analizy"]} == {t.value for t in V126AnalysisType}
    assert body["model_hash"] == compute_enm_hash(enm)
    assert body["przedmiot"] == przedmiot_modelu(enm)


def test_get_z_analysis_type_i_customer_counts_daje_jedna_pozycje_potwierdzona() -> None:
    enm = build_golden_enm()
    with TestClient(app) as client:
        case_id = _seed_case(client, enm)
        parametry = json.dumps({"customer_counts": {"bus_sn_c": 120}})
        resp = client.get(
            _url(case_id),
            params={"analysis_type": "reliability_contingency", "parametry": parametry},
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["analizy"]) == 1
    assert body["analizy"][0]["kod"] == "reliability_contingency"
    assert body["analizy"][0]["gotowosc"] == "POTWIERDZONA"


def test_get_z_niepoprawnym_json_w_parametry_zwraca_422() -> None:
    with TestClient(app) as client:
        case_id = _seed_case(client, build_golden_enm())
        resp = client.get(_url(case_id), params={"parametry": "{nie json"})
    assert resp.status_code == 422, resp.text
    assert "JSON" in resp.json()["detail"]


def test_get_z_parametry_nie_obiektem_json_zwraca_422() -> None:
    with TestClient(app) as client:
        case_id = _seed_case(client, build_golden_enm())
        resp = client.get(_url(case_id), params={"parametry": "[1, 2, 3]"})
    assert resp.status_code == 422, resp.text
    assert "obiektem" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Parytet GET <-> POST na KOMPLECIE 14 rodzajów (sedno karty §4)
# ---------------------------------------------------------------------------


def test_parytet_get_gotowosc_i_post_run_na_wszystkich_14_rodzajach() -> None:
    """(GET gotowość == POTWIERDZONA) <=> (POST run -> 200);
    (GET gotowość == NIEPOTWIERDZONA) <=> (POST run -> 422, detail dosłownie z GET);
    (GET gotowość == WYCOFANA) <=> (POST run -> 410)."""
    with TestClient(app) as client:
        case_id = _seed_case(client, build_golden_enm())
        get_resp = client.get(_url(case_id))
        assert get_resp.status_code == 200, get_resp.text
        analizy = get_resp.json()["analizy"]
        assert len(analizy) == 14

        oczekiwany_status = {"POTWIERDZONA": 200, "NIEPOTWIERDZONA": 422, "WYCOFANA": 410}
        for pozycja in analizy:
            rodzaj = pozycja["kod"]
            post_resp = client.post(
                f"/api/cases/{case_id}/runs/v126/{rodzaj}", json={"parameters": {}}
            )
            assert post_resp.status_code == oczekiwany_status[pozycja["gotowosc"]], (
                f"{rodzaj}: GET={pozycja['gotowosc']} ale POST={post_resp.status_code} "
                f"({post_resp.text})"
            )
            if pozycja["gotowosc"] == "NIEPOTWIERDZONA":
                oczekiwany_komunikat = _komunikat_z_braki(pozycja["braki"])
                assert post_resp.json()["detail"] == oczekiwany_komunikat, rodzaj


# ---------------------------------------------------------------------------
# Przypadek bez ENM (nigdy set_enm -> model domyślny bez szyn)
# ---------------------------------------------------------------------------


def test_get_bez_enm_zwraca_model_hash_none_i_niepotwierdzone_albo_wycofane() -> None:
    with TestClient(app) as client:
        case_id = _seed_case(client, None)
        resp = client.get(_url(case_id))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["model_hash"] is None
    assert len(body["analizy"]) == 14
    for pozycja in body["analizy"]:
        assert pozycja["gotowosc"] in ("NIEPOTWIERDZONA", "WYCOFANA"), pozycja["kod"]
        if pozycja["gotowosc"] == "NIEPOTWIERDZONA":
            kody_brakow = {b["kod"] for b in pozycja["braki"]}
            assert "model.wezly" in kody_brakow, pozycja["kod"]


# ---------------------------------------------------------------------------
# Przypadek nieznany
# ---------------------------------------------------------------------------


def test_get_nieznany_case_id_zwraca_404() -> None:
    with TestClient(app) as client:
        resp = client.get(_url(str(uuid4())))
    assert resp.status_code == 404, resp.text


# ---------------------------------------------------------------------------
# Napięcie powrotne: parametry liczbowe i krotność prądu załączania (V12K-352)
# ---------------------------------------------------------------------------

_TRV_KOMPLET = {
    "trv_natural_frequency_hz": 12000,
    "trv_tau_s": 0.00018,
    "inrush_multiple_in": 6.5,
    "neutral_grounding": "isolated",
}


def test_post_trv_niepoprawne_parametry_liczbowe_daja_422_nie_500() -> None:
    """Przed kartą V126-INRUSH-SEPARACJA `inrush_multiple_in=0`, `trv_tau_s=0` i napis
    przechodziły bramkę obecności i kończyły się 500 w rdzeniu FROZEN (dzielenie przez zero,
    konwersja). Iloczyn: parametr × wartość niepoprawna, realna ścieżka POST."""
    with TestClient(app, raise_server_exceptions=False) as client:
        case_id = _seed_case(client, build_golden_enm())
        url = f"/api/cases/{case_id}/runs/v126/transient_trv"
        for klucz in ("inrush_multiple_in", "trv_tau_s", "trv_natural_frequency_hz"):
            for wartosc in (0, -2, "abc", True):
                resp = client.post(url, json={"parameters": {**_TRV_KOMPLET, klucz: wartosc}})
                assert resp.status_code == 422, (klucz, wartosc, resp.status_code, resp.text)
                assert f"parametr.{klucz}" in resp.json()["detail"], (klucz, wartosc)
        resp = client.post(
            url, json={"parameters": {**_TRV_KOMPLET, "breaker_rated_voltage_kv": 0}}
        )
        assert resp.status_code == 422, resp.text


def test_post_trv_bez_krotnosci_422_a_z_krotnoscia_bieg_niesie_ja_jawnie() -> None:
    """Wartość domyślna 8,0 rdzenia jest nieosiągalna: bez krotności bieg nie powstaje (422);
    z krotnością projektanta wejście biegu niesie TĘ wartość, a surowy wynik solvera nadal
    niesie blok `inrush` (kontrakt FROZEN bez zmian — separacja jest po stronie konsumentów)."""
    bez = {k: v for k, v in _TRV_KOMPLET.items() if k != "inrush_multiple_in"}
    with TestClient(app) as client:
        case_id = _seed_case(client, build_golden_enm())
        url = f"/api/cases/{case_id}/runs/v126/transient_trv"
        odmowa = client.post(url, json={"parameters": bez})
        assert odmowa.status_code == 422, odmowa.text
        assert "parametr.inrush_multiple_in" in odmowa.json()["detail"]

        bieg = client.post(url, json={"parameters": _TRV_KOMPLET})
        assert bieg.status_code == 200, bieg.text
        wynik = client.get(bieg.json()["result_url"])
        assert wynik.status_code == 200, wynik.text
        # Rdzeń policzył z wartości projektanta (6,5), nie z domyślnej 8,0.
        assert wynik.json()["result"]["result"]["inrush"]["peak_multiple_in"] == 6.5
