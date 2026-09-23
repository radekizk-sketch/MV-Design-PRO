"""Harmoniczne i SSCI V12.6 po wycofaniu — 410 niezależnie od danych przekształtnika
(karta AB-1d_min krok 3).

HISTORIA. Karta W2-C dodała tu bramki 422 `generator.harmonic_spectrum_missing` /
`generator.converter_card_missing` (zero fabrykacji widma i karty przekształtnika)
oraz pola addytywne `pominiete_zrodla`/`zrodla_widma` biegu. Karta AB-1d_min
wycofała OBA rodzaje, które te pola czytały (`power_quality_harmonics`,
`ssci_impedance`): rejestr `availability="withdrawn"` + 410 przed jakąkolwiek
logiką trasy. Bramki, pola i ich testy zniknęły razem z rodzajem (precedens W3-E:
bramka istniała wyłącznie po to, żeby chronić uruchomienie analizy, która teraz
w ogóle się nie uruchamia).

INTENCJA, KTÓRA ZOSTAJE. Stan danych przekształtnika NIE może zmienić odpowiedzi
rodzaju wycofanego — ani brak karty, ani karta bez widma, ani karta z widmem, ani
widmo ręczne nie przywracają biegu (iloczyn cech: rodzaj × stan danych). Rodzaj
wciąż uruchamialny, który tych pól nie czyta, nie jest blokowany niczym z tej klasy.
"""

from __future__ import annotations

import pytest
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


#: Stany danych przekształtnika, które PRZED wycofaniem dawały różne odpowiedzi
#: (422 brak karty / 422 brak widma / 422 brak źródeł / 200 z pominięciami / 200).
_STANY_DANYCH: dict[str, tuple[list[dict], dict]] = {
    "brak_karty": ([_generator("PV-1")], {}),
    "karta_bez_widma": ([_generator("PV-1", materialized_params=_KARTA_BEZ_WIDMA)], {}),
    "karta_z_widmem": ([_generator("PV-1", materialized_params=_KARTA_Z_WIDMEM)], {}),
    "czesc_zrodel_z_widmem": (
        [
            _generator("PV-OK", materialized_params=_KARTA_Z_WIDMEM),
            _generator("PV-BRAK", bus_ref=_SZYNA_B, materialized_params=_KARTA_BEZ_WIDMA),
        ],
        {},
    ),
    "widmo_reczne": (
        [_generator("PV-1", materialized_params=_KARTA_BEZ_WIDMA)],
        {"harmonic_spectra": {"PV-1": {"5": 6.0}}},
    ),
    "bez_przeksztaltnikow": ([], {}),
}


@pytest.mark.parametrize("rodzaj", ["power_quality_harmonics", "ssci_impedance"])
@pytest.mark.parametrize("stan", sorted(_STANY_DANYCH))
def test_rodzaj_wycofany_odpowiada_410_niezaleznie_od_danych_przeksztaltnika(
    rodzaj: str, stan: str
) -> None:
    generatory, parametry = _STANY_DANYCH[stan]
    with TestClient(app) as client:
        case_id = _seed_case(client, _model(generators=generatory))
        resp = _uruchom(client, case_id, rodzaj, parametry)
    assert resp.status_code == 410, resp.text
    cialo = resp.json()
    assert cialo["code"] == "v126.analysis_withdrawn"
    assert cialo["analysis_type"] == rodzaj
    for kod_dawnej_bramki in (
        "generator.harmonic_spectrum_missing",
        "generator.converter_card_missing",
        "zrodla.odksztalcajace",
    ):
        assert kod_dawnej_bramki not in resp.text


def test_inna_analiza_v126_nie_jest_blokowana_brakiem_widma() -> None:
    """`uncertainty_sensitivity` nie czyta `harmonic_sources` ani `converters`
    (świadomie NIE `earthing_safety`: od karty B-02 ten rodzaj odmawia biegu bez
    danych uziomu projektanta, `parametr.earthing`, niezależnie od widma). Wynik
    biegu nie niesie usuniętych pól W2-C."""
    with TestClient(app) as client:
        case_id = _seed_case(
            client, _model(generators=[_generator("PV-1", materialized_params=_KARTA_BEZ_WIDMA)])
        )
        resp = _uruchom(client, case_id, "uncertainty_sensitivity")
        assert resp.status_code == 200, resp.text
        wynik = client.get(resp.json()["result_url"])
    assert wynik.status_code == 200
    assert "pominiete_zrodla" not in wynik.json()
    assert "zrodla_widma" not in wynik.json()
