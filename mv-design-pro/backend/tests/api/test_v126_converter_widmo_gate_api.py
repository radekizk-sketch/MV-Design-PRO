"""Bramki `generator.harmonic_spectrum_missing` / `generator.converter_card_missing`
dla V12.6 (karta W2-C, zero fabrykacji wejścia — parametry przekształtnika).

Przed tą kartą `build_v126_input_from_enm` wstrzykiwał JEDNO zaszyte widmo
harmoniczne ({5:3%, 7:2%, 11:1,2%, 13:1%}) każdemu przekształtnikowi PV/BESS/
wiatrowemu, niezależnie od karty katalogowej — fabrykacja usunięta w
`tests/solver_input/test_most_v126_bez_podstawien.py` (kratki mostu ENM->V12.6).
Ten plik pokrywa DRUGĄ POŁOWĘ tej samej klasy: warstwę API, wzorzec identyczny z
bramką `generator.q_missing` (`tests/api/test_v126_generator_q_missing_api.py`) —

* ŻADNE źródło nie ma danych => 422 z kodem gotowości i listą generatorów
  (`power_quality_harmonics` czyta `harmonic_sources`, `ssci_impedance` czyta
  `converters` — jedyne dwa rodzaje V12.6, które te pola w ogóle czytają);
* BRAK kandydatów (sieć bez PV/BESS/wiatru) NIE jest blokowany bramką widma —
  od karty B-02 (2026-09-10) gotowość analizy odmawia go JAWNYM warunkiem
  `zrodla.odksztalcajace` („brak źródeł odkształcających do wstrzyknięcia" —
  bieg dałby zerowe odkształcenie z braku danych, nie z pomiaru), a NIE kodem
  `generator.harmonic_spectrum_missing`; test pilnuje, że oba kody się nie mylą;
* CZĘŚĆ źródeł ma dane => bieg przechodzi, `pominiete_zrodla` w odpowiedzi
  nazywa pominięte źródła, `zrodla_widma` niesie proweniencję (KATALOG/RECZNE)
  źródeł, które DO wejścia trafiły;
* inna analiza V12.6 (nieczytająca tych pól) nie jest blokowana w ogóle.
"""

from __future__ import annotations

from api.main import app
from enm.klucz_twin import klucz_twin_projektu
from enm.models import EnergyNetworkModel, ENMHeader
from enm.store import reset_enm_store, set_enm
from fastapi.testclient import TestClient

_SZYNA_A = "BUS_A"
_SZYNA_B = "BUS_B"

_KARTA_Z_WIDMEM = {
    "un_kv": 15.0,
    "sn_mva": 2.2,
    "control_mode": "Q_OF_U",
    "harmonic_spectrum_percent": {5: 4.5, 7: 2.1},
}
_KARTA_BEZ_WIDMA = {"un_kv": 15.0, "sn_mva": 2.2, "control_mode": "Q_OF_U"}


def _generator(ref_id: str, **nadpisania: object) -> dict:
    dane: dict = {
        "ref_id": ref_id,
        "name": f"Przekształtnik {ref_id}",
        "bus_ref": _SZYNA_A,
        "p_mw": 2.0,
        "gen_type": "pv_inverter",
    }
    dane.update(nadpisania)
    return dane


def _model(*, generators: list[dict] | None = None) -> EnergyNetworkModel:
    return EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="test-v126-widmo-gate").model_dump(),
            "buses": [
                {"ref_id": _SZYNA_A, "name": "Szyna A", "voltage_kv": 15.0},
                {"ref_id": _SZYNA_B, "name": "Szyna B", "voltage_kv": 15.0},
            ],
            "branches": [
                {
                    "ref_id": "L-1",
                    "name": "Odcinek",
                    "type": "cable",
                    "from_bus_ref": _SZYNA_A,
                    "to_bus_ref": _SZYNA_B,
                    "length_km": 2.0,
                    "r_ohm_per_km": 0.206,
                    "x_ohm_per_km": 0.118,
                }
            ],
            "generators": generators or [],
        }
    )


def _seed_case(client: TestClient, model: EnergyNetworkModel) -> str:
    """Realny projekt + przypadek przez API (wzorzec `test_v126_generator_q_missing_api.py`)."""
    reset_enm_store()
    project_resp = client.post("/api/projects", json={"name": "V12.6 widmo - test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = client.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
    )
    assert case_resp.status_code == 201, case_resp.text
    set_enm(klucz_twin_projektu(project_id), model)
    return str(case_resp.json()["id"])


def _uruchom(client: TestClient, case_id: str, rodzaj: str, parametry: dict | None = None):
    return client.post(
        f"/api/cases/{case_id}/runs/v126/{rodzaj}",
        json={"parameters": parametry or {}},
    )


# ---------------------------------------------------------------------------
# ŻADNE źródło nie ma danych => 422
# ---------------------------------------------------------------------------


def test_power_quality_harmonics_zadne_zrodlo_nie_ma_widma_zwraca_422() -> None:
    """PIN NA DEFEKT: przed naprawą oba źródła dostałyby zaszyte widmo i bieg
    przeszedłby cicho ze zmyślonym THD/TDD."""
    with TestClient(app) as client:
        case_id = _seed_case(
            client,
            _model(
                generators=[
                    _generator("PV-1", materialized_params=_KARTA_BEZ_WIDMA),
                    _generator("PV-2", bus_ref=_SZYNA_B, materialized_params=_KARTA_BEZ_WIDMA),
                ]
            ),
        )
        resp = _uruchom(client, case_id, "power_quality_harmonics")
    assert resp.status_code == 422, resp.text
    assert "generator.harmonic_spectrum_missing" in resp.text
    assert "PV-1" in resp.text
    assert "PV-2" in resp.text


def test_ssci_impedance_zadne_zrodlo_nie_ma_karty_zwraca_422() -> None:
    """Analogiczna bramka dla SSCI: generator BEZ ŻADNEJ karty katalogowej."""
    with TestClient(app) as client:
        case_id = _seed_case(client, _model(generators=[_generator("PV-1")]))
        resp = _uruchom(client, case_id, "ssci_impedance")
    assert resp.status_code == 422, resp.text
    assert "generator.converter_card_missing" in resp.text
    assert "PV-1" in resp.text


# ---------------------------------------------------------------------------
# BRAK kandydatów => NIE blokowane (uczciwy stan zerowy solvera, nie odmowa)
# ---------------------------------------------------------------------------


def test_power_quality_harmonics_bez_zadnych_przeksztaltnikow_odmawia_brakiem_zrodel() -> None:
    """Sieć bez PV/BESS/wiatru: bramka widma NIE strzela (nie ma kandydatów bez
    widma) — odmawia gotowość, warunkiem nazwanym po tym, czego brakuje
    (`zrodla.odksztalcajace`), zamiast biegu z zerowym THD z braku danych."""
    with TestClient(app) as client:
        case_id = _seed_case(client, _model(generators=[]))
        resp = _uruchom(client, case_id, "power_quality_harmonics")
    assert resp.status_code == 422, resp.text
    assert "zrodla.odksztalcajace" in resp.text
    assert "generator.harmonic_spectrum_missing" not in resp.text


# ---------------------------------------------------------------------------
# CZĘŚĆ źródeł ma dane => bieg przechodzi, pominięcia i proweniencja nazwane
# ---------------------------------------------------------------------------


def test_power_quality_harmonics_czesciowe_dane_przechodzi_z_pominietymi_zrodlami() -> None:
    with TestClient(app) as client:
        case_id = _seed_case(
            client,
            _model(
                generators=[
                    _generator("PV-OK", materialized_params=_KARTA_Z_WIDMEM),
                    _generator("PV-BRAK", bus_ref=_SZYNA_B, materialized_params=_KARTA_BEZ_WIDMA),
                ]
            ),
        )
        resp = _uruchom(client, case_id, "power_quality_harmonics")
        assert resp.status_code == 200, resp.text
        wynik = client.get(resp.json()["result_url"])
    assert wynik.status_code == 200
    payload = wynik.json()
    pominiete = {p["ref"]: p for p in payload["pominiete_zrodla"]}
    assert set(pominiete) == {"PV-BRAK"}
    assert pominiete["PV-BRAK"]["kod"] == "generator.harmonic_spectrum_missing"
    zrodla_widma = {z["ref"]: z for z in payload["zrodla_widma"]}
    assert zrodla_widma == {"PV-OK": {"ref": "PV-OK", "proweniencja": "KATALOG"}}


def test_power_quality_harmonics_wszystkie_zrodla_maja_widmo_brak_pominietych_w_odpowiedzi() -> (
    None
):
    """Kontrola dwustronna: gdy WSZYSCY kandydaci mają widmo, `pominiete_zrodla`
    nie pojawia się w odpowiedzi w ogóle (pole addytywne, nie pusta lista)."""
    with TestClient(app) as client:
        case_id = _seed_case(
            client, _model(generators=[_generator("PV-OK", materialized_params=_KARTA_Z_WIDMEM)])
        )
        resp = _uruchom(client, case_id, "power_quality_harmonics")
        assert resp.status_code == 200, resp.text
        wynik = client.get(resp.json()["result_url"])
    payload = wynik.json()
    assert "pominiete_zrodla" not in payload
    assert payload["zrodla_widma"] == [{"ref": "PV-OK", "proweniencja": "KATALOG"}]


def test_widmo_reczne_w_zadaniu_daje_proweniencje_reczne_w_odpowiedzi() -> None:
    """Jawne wejście projektanta (`parameters.harmonic_spectra`) nadpisuje brak
    karty — źródło wchodzi z proweniencją RECZNE, nie ma go w pominiętych."""
    with TestClient(app) as client:
        case_id = _seed_case(
            client, _model(generators=[_generator("PV-1", materialized_params=_KARTA_BEZ_WIDMA)])
        )
        resp = _uruchom(
            client,
            case_id,
            "power_quality_harmonics",
            {"harmonic_spectra": {"PV-1": {"5": 6.0}}},
        )
        assert resp.status_code == 200, resp.text
        wynik = client.get(resp.json()["result_url"])
    payload = wynik.json()
    assert "pominiete_zrodla" not in payload
    assert payload["zrodla_widma"] == [{"ref": "PV-1", "proweniencja": "RECZNE"}]


# ---------------------------------------------------------------------------
# Bramka jest WĄSKA — inna analiza V12.6 nie czyta harmonic_sources/converters
# ---------------------------------------------------------------------------


def test_inna_analiza_v126_nie_jest_blokowana_brakiem_widma() -> None:
    """`uncertainty_sensitivity` nie czyta `harmonic_sources` ani `converters`
    (świadomie NIE `earthing_safety`: od karty B-02 ten rodzaj odmawia biegu bez
    danych uziomu projektanta, `parametr.earthing`, niezależnie od widma)."""
    with TestClient(app) as client:
        case_id = _seed_case(
            client, _model(generators=[_generator("PV-1", materialized_params=_KARTA_BEZ_WIDMA)])
        )
        resp = _uruchom(client, case_id, "uncertainty_sensitivity")
    assert resp.status_code == 200, resp.text
