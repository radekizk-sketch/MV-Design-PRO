"""Testy bramki `generator.q_missing` dla analiz V12.6 (karta FAB-H, H2).

`_branch_current_a` (`network_model/solvers/v126_academic.py`, solver FROZEN —
B-01, nie edytujemy go z tej karty) czyta `bus.generation_mvar` — agregat Q
generatorów zbudowany przez `build_v126_input_from_enm`. Gdy Q wytwórcy jest
naprawdę nieznane (brak pola, brak Q-set-pointu karty katalogowej), kontrakt
podstawia 0,0 jako WYŁĄCZNIE strukturalne wypełnienie (ten sam agregat karmi też
analizy, które Q w ogóle nie czytają) — więc solver policzyłby ciche zero
zamiast melduje brak. Warstwa API odmawia PRZED wejściem do solvera, kodem
gotowości `generator.q_missing` (reużytym z `calculation_readiness/service.py`,
Reużycie zamiast duplikacji).

KARTA W3-E (2026-09-09): `OPF_LOSS_LCC` czytał `_branch_current_a` tak samo
jak `RELIABILITY_CONTINGENCY`, więc do tej karty ta sama bramka chroniła OBA
rodzaje (drugi test tej pary testował właśnie `opf_loss_lcc`). Karta W3-E
wycofała CAŁY rodzaj `opf_loss_lcc` z powierzchni nowych biegów (410, patrz
`tests/api/test_v126_opf_loss_lcc_api.py`) — 410 zapada PRZED tą bramką, więc
test bramki dla `opf_loss_lcc` testowałby dziś kod nieosiągalny i został zdjęty
(nie przepisany: bramka istniała WYŁĄCZNIE po to, żeby chronić uruchomienie
analizy, która teraz w ogóle się nie uruchamia — intencja „opf_loss_lcc bez Q
generatora" nie ma już odpowiednika w kanonie, bo `opf_loss_lcc` nie liczy się
wcale).

Predykaty parami: brak Q blokuje TYLKO analizy jeszcze URUCHAMIALNE, które
faktycznie czytają `generation_mvar` przez `_branch_current_a` —
RELIABILITY_CONTINGENCY (test 1) — a NIE blokuje inną analizę V12.6, która
tego Q nie czyta (test 4, UNCERTAINTY_SENSITIVITY — świadomie NIE
`hosting_capacity`: ten rodzaj jest wycofany 410-em niezależnym od tej bramki,
i NIE `insulation_coordination`: od karty B-02 ten rodzaj odmawia biegu bez
ograniczników przepięć w modelu (`model.ograniczniki`), również niezależnie od
bramki Q; `uncertainty_sensitivity` czyta wyłącznie tolerancje katalogowe
transformatorów/gałęzi/szyn, więc jest uczciwym dowodem, że bramka Q sama w
sobie nie blokuje rodzajów spoza swojego zakresu) — bramka nie jest szersza niż
potrzeba. Dana jawna (nawet 0.0) przechodzi bez zastrzeżeń (test 3); Q
wyprowadzalne z jawnego Q-set-pointu karty katalogowej też przechodzi (test 5).

KARTA B-02 (2026-09-10): bramka Q jest jednym z warunków gotowości analizy
(`application/analyses/v126_gotowosc.py`, ta sama funkcja zasila ekran
„Analizy specjalistyczne" i odmowę 422). Model ENM nie niesie liczby odbiorców
zasilanych z szyn, a wskaźniki niezawodności są nią ważone, więc bieg
niezawodności wymaga jawnego parametru `customer_counts` — testy bramki Q
podają go (`_ODBIORCY`), żeby izolować WYŁĄCZNIE brak Q; brak samego
parametru ma własny test (`parametr.customer_counts`).
"""

from __future__ import annotations

from api.main import app
from enm.klucz_twin import klucz_twin_projektu
from enm.models import EnergyNetworkModel, ENMHeader
from enm.store import reset_enm_store, set_enm
from fastapi.testclient import TestClient

_SZYNA_A = "BUS_A"
_SZYNA_B = "BUS_B"


def _model(*, generator: dict | None) -> EnergyNetworkModel:
    generatory = [generator] if generator is not None else []
    return EnergyNetworkModel.model_validate(
        {
            "header": ENMHeader(name="test-v126-generator-q-missing").model_dump(),
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
            "generators": generatory,
        }
    )


_GENERATOR_BEZ_Q = {
    "ref_id": "GEN-1",
    "name": "Generator",
    "bus_ref": _SZYNA_A,
    "p_mw": 1.0,
}

#: Liczba odbiorców zasilanych z szyny B — jawne wejście projektanta (karta B-02),
#: bo model jej nie niesie; bez niej gotowość niezawodności odmawia biegu.
_ODBIORCY = {"customer_counts": {_SZYNA_B: 120}}


def _seed_case(client: TestClient, model: EnergyNetworkModel) -> str:
    """Realny projekt + przypadek przez API, model pod kluczem PROJEKTU (CV-1-W:
    koncowka tlumaczy `case_id` na klucz twin; przypadek spoza bazy = 404)."""
    reset_enm_store()
    project_resp = client.post("/api/projects", json={"name": "V12.6 Q generatora - test"})
    assert project_resp.status_code == 201, project_resp.text
    project_id = project_resp.json()["id"]
    case_resp = client.post(
        "/api/study-cases", json={"project_id": project_id, "name": "Przypadek testu"}
    )
    assert case_resp.status_code == 201, case_resp.text
    set_enm(klucz_twin_projektu(project_id), model)
    return str(case_resp.json()["id"])


def test_reliability_contingency_bez_q_generatora_zwraca_422_nie_liczy_po_cichu() -> None:
    """PIN NA DEFEKT: przed naprawą brak Q wchodziłby do solvera jako 0,0."""
    with TestClient(app) as client:
        case_id = _seed_case(client, _model(generator=_GENERATOR_BEZ_Q))
        resp = client.post(
            f"/api/cases/{case_id}/runs/v126/reliability_contingency",
            json={"parameters": _ODBIORCY},
        )
    assert resp.status_code == 422, resp.text
    assert "generator.q_missing" in resp.text
    assert "GEN-1" in resp.text


def test_reliability_contingency_bez_liczby_odbiorcow_zwraca_422() -> None:
    """Karta B-02: bez `customer_counts` wskaźniki SAIDI/SAIFI byłyby zerami z braku
    danych (model nie niesie liczby odbiorców) — gotowość odmawia jawnie, a odmowa
    NIE jest przebrana za brak Q (Q jawne)."""
    with TestClient(app) as client:
        case_id = _seed_case(client, _model(generator={**_GENERATOR_BEZ_Q, "q_mvar": 0.0}))
        resp = client.post(
            f"/api/cases/{case_id}/runs/v126/reliability_contingency",
            json={"parameters": {}},
        )
    assert resp.status_code == 422, resp.text
    assert "parametr.customer_counts" in resp.text
    assert "generator.q_missing" not in resp.text


def test_reliability_contingency_z_jawnym_q_liczy_normalnie() -> None:
    """Kontrola dwustronna: Q jawne (nawet gdyby było 0.0) przechodzi."""
    with TestClient(app) as client:
        case_id = _seed_case(client, _model(generator={**_GENERATOR_BEZ_Q, "q_mvar": 0.0}))
        resp = client.post(
            f"/api/cases/{case_id}/runs/v126/reliability_contingency",
            json={"parameters": _ODBIORCY},
        )
    assert resp.status_code == 200, resp.text
    result = client.get(resp.json()["result_url"])
    assert result.status_code == 200


def test_inna_analiza_v126_nie_jest_blokowana_brakiem_q_generatora() -> None:
    """Bramka jest WĄSKA: `uncertainty_sensitivity` nie czyta `generation_mvar`
    przez `_branch_current_a`, więc brak Q generatora nie może jej zablokować
    (inaczej byłaby szersza niż trzeba). Świadomie NIE `hosting_capacity` (410
    niezależne od tej bramki, karta W3-E) ani NIE `insulation_coordination`
    (od karty B-02 odmowa bez ograniczników w modelu, `model.ograniczniki`) —
    ich użycie dowodziłoby innej odmowy, nie „bramka Q nie blokuje"."""
    with TestClient(app) as client:
        case_id = _seed_case(client, _model(generator=_GENERATOR_BEZ_Q))
        resp = client.post(
            f"/api/cases/{case_id}/runs/v126/uncertainty_sensitivity",
            json={"parameters": {}},
        )
    assert resp.status_code == 200, resp.text


def test_reliability_contingency_z_q_set_pointem_karty_liczy_normalnie() -> None:
    """Q nieznane wprost, ale wyprowadzalne z jawnego Q-set-pointu karty
    katalogowej (`qmin_mvar == qmax_mvar`) — TA SAMA funkcja co bramka gotowości
    (`moc_bierna_wytworcy`), więc nie blokuje."""
    generator = {
        **_GENERATOR_BEZ_Q,
        "materialized_params": {"qmin_mvar": 0.3, "qmax_mvar": 0.3},
    }
    with TestClient(app) as client:
        case_id = _seed_case(client, _model(generator=generator))
        resp = client.post(
            f"/api/cases/{case_id}/runs/v126/reliability_contingency",
            json={"parameters": _ODBIORCY},
        )
    assert resp.status_code == 200, resp.text


_PRZEKSZTALTNIK_BEZ_Q = {
    "ref_id": "PV-1",
    "name": "Falownik PV",
    "bus_ref": _SZYNA_A,
    "p_mw": 1.0,
    "gen_type": "pv_inverter",
    "materialized_params": {
        "current_loop_bandwidth_hz": 300.0,
        "pll_bandwidth_hz": 20.0,
        "filter_l_pu": 0.1,
        "filter_r_pu": 0.01,
        "un_kv": 15.0,
        # Karta W2-C: moc znamionowa MUSI być na karcie, inaczej ten przekształtnik
        # jest pominięty CAŁKOWICIE (kod `generator.converter_card_missing`) zanim
        # test zdąży dotrzeć do bramki Q — ta fikstura izoluje WYŁĄCZNIE brak Q.
        "sn_mva": 1.1,
    },
}


def test_ssci_impedance_bez_q_przeksztaltnika_zwraca_422_nie_liczy_po_cichu() -> None:
    """Domkniecie FAB-H (B-01): `_z_conv_components` solvera FROZEN liczy punkt pracy
    z `q_mvar or 0.0` — brak Q wybranego przeksztaltnika blokuje analize SSCI w API,
    zanim payload trafi do solvera (ta sama regula wyboru przeksztaltnika co solver)."""
    with TestClient(app) as client:
        case_id = _seed_case(client, _model(generator=_PRZEKSZTALTNIK_BEZ_Q))
        resp = client.post(
            f"/api/cases/{case_id}/runs/v126/ssci_impedance",
            json={"parameters": {}},
        )
    assert resp.status_code == 422, resp.text
    assert "generator.q_missing" in resp.text
    assert "PV-1" in resp.text


def test_ssci_impedance_z_q_set_pointem_karty_nie_jest_blokowana() -> None:
    """Q wyprowadzalne z karty (`qmin == qmax`) trafia do `V126ConverterInput.q_mvar`
    tym samym zrodlem prawdy co agregat szyny — brama nie blokuje."""
    przeksztaltnik = {
        **_PRZEKSZTALTNIK_BEZ_Q,
        "materialized_params": {
            **_PRZEKSZTALTNIK_BEZ_Q["materialized_params"],
            "qmin_mvar": 0.2,
            "qmax_mvar": 0.2,
        },
    }
    with TestClient(app) as client:
        case_id = _seed_case(client, _model(generator=przeksztaltnik))
        resp = client.post(
            f"/api/cases/{case_id}/runs/v126/ssci_impedance",
            json={"parameters": {}},
        )
    assert resp.status_code == 200, resp.text
    assert "generator.q_missing" not in resp.text
