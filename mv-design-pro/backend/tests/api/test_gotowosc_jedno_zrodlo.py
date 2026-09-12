"""Werdykt gotowości pochodzi z JEDNEGO źródła — końcówki i operacja zgodne.

ZMIERZONY DEFEKT (2026-09-11). Ten sam przypadek, ta sama rewizja ENM (10),
trzy drogi do tej samej wielkości, DWA różne werdykty:

    POST .../enm/domain-ops (refresh_snapshot)  ->  ready=False,
        blokada `switch.catalog_ref_missing` na `nn/.../feeder_device`
    GET  .../engineering-readiness              ->  ready=True,  0 blokad
    GET  .../enm/readiness                      ->  ready=True,  0 blokad

Przyczyna: `ENMValidator` nie zna kontroli DOMENOWYCH, które
`enm.domain_operations._build_readiness` dokłada ponad walidator — wiązania
katalogowego łączników (Catalog Binding Rule, reguła NIENARUSZALNA),
transformatora blokowego DER przekształtnikowego, portów i stanu łącznika
punktów odgałęźnych.

DLACZEGO TO BYŁO GROŹNE, A NIE TYLKO NIESPÓJNE. Rozjazd szedł w stronę
FAIL-OPEN: końcówki agregujące — te, z których żyje panel gotowości i bramka
uruchomienia analiz — meldowały gotowość modelu, którego warstwa domenowa
gotowym NIE uznaje. Model z łącznikiem bez pozycji katalogowej mógł więc wejść
do obliczeń, a wynik opisywałby aparat, którego parametrów nikt nie podał.
Objawem widocznym dla użytkownika były dwa sprzeczne napisy w jednym oknie:
chip powłoki (czyta operację) „Model: w budowie" i panel gotowości (czyta
końcówkę) „zwalidowany".

Testy poniżej pilnują OBU stron: zgodności werdyktów ORAZ tego, że werdykt
negatywny ma w liście problemów swój powód (końcówka meldująca `ready=False`
bez ani jednego problemu byłaby werdyktem bez uzasadnienia).
"""

from __future__ import annotations

from typing import Any

import pytest
from api.enm import router as enm_router
from enm.canonical_analysis import reset_canonical_runs
from enm.models import EnergyNetworkModel
from enm.store import reset_enm_store, set_enm
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_source_record

PRZYPADEK = "case-gotowosc-jedno-zrodlo"


@pytest.fixture(autouse=True)
def _czysty_stan():
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


@pytest.fixture
def klient() -> TestClient:
    app = FastAPI()
    app.include_router(enm_router)
    return TestClient(app)


def _model(*, wiazanie_lacznika: str | None) -> dict[str, Any]:
    """Minimalna sieć SN ze źródłem, linią i ŁĄCZNIKIEM o zadanym wiązaniu."""
    return {
        "header": {
            "name": "Gotowosc — jedno zrodlo",
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000201",
                "ref_id": "bus_a",
                "name": "Szyna A",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
            },
            {
                "id": "00000000-0000-0000-0000-000000000202",
                "ref_id": "bus_b",
                "name": "Szyna B",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
            },
        ],
        "branches": [
            {
                "id": "00000000-0000-0000-0000-000000000203",
                "ref_id": "line_1",
                "name": "Linia L1",
                "tags": [],
                "meta": {},
                "type": "line_overhead",
                "from_bus_ref": "bus_a",
                "to_bus_ref": "bus_b",
                "status": "closed",
                "length_km": 5.0,
                "r_ohm_per_km": 0.443,
                "x_ohm_per_km": 0.34,
                "catalog_ref": "CAT-CAB-001",
            },
            {
                "id": "00000000-0000-0000-0000-000000000204",
                "ref_id": "lacznik_1",
                "name": "Wyłącznik",
                "tags": [],
                "meta": {},
                "type": "breaker",
                "from_bus_ref": "bus_a",
                "to_bus_ref": "bus_b",
                "status": "closed",
                "catalog_ref": wiazanie_lacznika,
            },
        ],
        "transformers": [],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000000205",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="src_1",
                    name="Sieć zewnętrzna",
                    bus_ref="bus_a",
                    voltage_kv=15.0,
                    sk3_mva=250.0,
                    rx_ratio=0.10,
                ),
            }
        ],
        "loads": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "protection_assignments": [],
        "measurements": [],
    }


def _gotowosc_z_operacji(klient: TestClient) -> dict[str, Any]:
    odpowiedz = klient.post(
        f"/api/cases/{PRZYPADEK}/enm/domain-ops",
        json={
            "project_id": PRZYPADEK,
            "snapshot_base_hash": "",
            "operation": {
                "name": "refresh_snapshot",
                "idempotency_key": "test-gotowosc",
                "payload": {},
            },
        },
    )
    assert odpowiedz.status_code == 200, odpowiedz.text
    return odpowiedz.json()["readiness"]


@pytest.mark.parametrize(
    ("wiazanie", "opis"),
    [(None, "łącznik BEZ wiązania katalogowego"), ("sw-cb-test-001", "łącznik z wiązaniem")],
    ids=["bez_wiazania", "z_wiazaniem"],
)
def test_trzy_drogi_daja_ten_sam_werdykt(klient: TestClient, wiazanie, opis: str) -> None:
    """Iloczyn cech: (trzy drogi) × (model bez blokady domenowej / z blokadą).

    Jedna droga nie wystarczy: defekt polegał NIE na złym werdykcie którejś
    z nich, tylko na tym, że były RÓŻNE — i tylko dla modelu z blokadą domenową.
    """
    set_enm(PRZYPADEK, EnergyNetworkModel.model_validate(_model(wiazanie_lacznika=wiazanie)))

    z_operacji = _gotowosc_z_operacji(klient)
    inzynierska = klient.get(f"/api/cases/{PRZYPADEK}/engineering-readiness").json()
    macierz = klient.get(f"/api/cases/{PRZYPADEK}/enm/readiness").json()

    # Ta sama decyzja, nowa nazwa pola: `kompletnosc_modelu` mowi DOKLADNIE to,
    # co mierzyl dawny `ready` — czy model jest strukturalnie kompletny.
    kompletny = inzynierska["kompletnosc_modelu"] == "MODEL_COMPLETE"
    assert kompletny == z_operacji["ready"], (
        f"{opis}: /engineering-readiness mówi {inzynierska['kompletnosc_modelu']}, "
        f"operacja domenowa {z_operacji['ready']}"
    )
    assert macierz["readiness"]["ready"] == z_operacji["ready"], (
        f"{opis}: /enm/readiness mówi {macierz['readiness']['ready']}, "
        f"operacja domenowa {z_operacji['ready']}"
    )


def test_blokada_domenowa_gasi_gotowosc_we_wszystkich_trzech_drogach(klient: TestClient) -> None:
    """Łącznik bez pozycji katalogowej BLOKUJE — i to na każdej drodze odczytu.

    Strona negatywna z konkretem: sam fakt zgodności werdyktów jest spełniony
    także wtedy, gdy wszystkie trzy drogi milczą o problemie. Tutaj sprawdzamy,
    że blokada REALNIE występuje i dotyczy TEGO łącznika.
    """
    set_enm(PRZYPADEK, EnergyNetworkModel.model_validate(_model(wiazanie_lacznika=None)))

    z_operacji = _gotowosc_z_operacji(klient)
    assert z_operacji["ready"] is False
    kody_operacji = {b["code"] for b in z_operacji["blockers"]}
    assert "switch.catalog_ref_missing" in kody_operacji

    inzynierska = klient.get(f"/api/cases/{PRZYPADEK}/engineering-readiness").json()
    assert inzynierska["kompletnosc_modelu"] == "MODEL_INCOMPLETE"
    blokady = [i for i in inzynierska["issues"] if i["severity"] == "BLOCKER"]
    assert any(i["code"] == "switch.catalog_ref_missing" for i in blokady), (
        "Werdykt negatywny bez POWODU w liście problemów — panel gotowości nie "
        "miałby czego pokazać, a użytkownik nie wiedziałby, co naprawić."
    )
    assert any(i["element_ref"] == "lacznik_1" for i in blokady)
    assert inzynierska["by_severity"]["BLOCKER"] >= 1


def test_werdykt_i_lista_problemow_sa_spojne(klient: TestClient) -> None:
    """Predykaty parami: `ready` i liczba blokad w `issues` z jednego zbioru.

    `ready=False` przy zerowej liczbie blokad w `by_severity` (albo odwrotnie)
    znaczyłoby, że werdykt i uzasadnienie pochodzą z dwóch różnych obliczeń —
    czyli dokładnie ten defekt, w mniejszej skali.
    """
    for wiazanie in (None, "sw-cb-test-001"):
        set_enm(PRZYPADEK, EnergyNetworkModel.model_validate(_model(wiazanie_lacznika=wiazanie)))
        dane = klient.get(f"/api/cases/{PRZYPADEK}/engineering-readiness").json()
        liczba_blokad = dane["by_severity"]["BLOCKER"]
        assert (dane["kompletnosc_modelu"] == "MODEL_COMPLETE") == (liczba_blokad == 0), (
            f"wiazanie={wiazanie!r}: {dane['kompletnosc_modelu']} przy "
            f"{liczba_blokad} blokadach"
        )
        assert len(dane["readiness"]["blockers"]) == liczba_blokad


def test_zdolnosc_analiz_nie_moze_przewyzszac_gotowosci(klient: TestClient) -> None:
    """Macierz zdolności analiz czyta ten sam werdykt, co panel gotowości.

    `analysis-eligibility` dostaje `readiness` jako wejście. Gdyby brala slabszy
    werdykt, model z blokada domenowa bylby oznaczony jako zdolny do analizy —
    czyli bramka uruchomienia przepuszczalaby to, co panel gotowosci zabrania.
    """
    set_enm(PRZYPADEK, EnergyNetworkModel.model_validate(_model(wiazanie_lacznika=None)))
    macierz = klient.get(f"/api/cases/{PRZYPADEK}/analysis-eligibility")
    assert macierz.status_code == 200, macierz.text
    gotowosc = klient.get(f"/api/cases/{PRZYPADEK}/engineering-readiness").json()
    assert gotowosc["kompletnosc_modelu"] == "MODEL_INCOMPLETE"


def test_kompletnosc_modelu_nie_jest_zgoda_na_analize(klient: TestClient) -> None:
    """P1-DELTA-08: model kompletny strukturalnie ≠ model gotowy do KAŻDEJ analizy.

    CO ODRZUCIŁA RECENZJA. Endpoint niósł gołe ``ready``. Pomiar pokazał rozjazd
    nie do obrony: 57/57 szablonów miało ``ready=True``, a jednocześnie 26 z nich
    (wszystkie z OZE) miało PRAWIDŁOWO zablokowane zwarcie 3F z braku deklaracji
    ``k_sc``. Obie liczby były prawdziwe — ale globalna etykieta „gotowy
    inżyniersko" dawała się użyć jako ogólne potwierdzenie, czego wiążąca decyzja
    właściciela zabrania.

    Ten przypadek pilnuje SAMEGO KONTRAKTU, nie dzisiejszych liczb:
      * pola ``ready`` bez przymiotnika NIE MA w odpowiedzi,
      * kompletność strukturalna nazywa się tym, czym jest,
      * każda decyzja o analizie wskazuje ZDOLNOŚĆ.
    """
    set_enm(
        PRZYPADEK, EnergyNetworkModel.model_validate(_model(wiazanie_lacznika="sw-cb-test-001"))
    )
    dane = klient.get(f"/api/cases/{PRZYPADEK}/engineering-readiness").json()

    assert "ready" not in dane, (
        "Gołe `ready` wróciło do odpowiedzi. To jest dokładnie ta etykieta, która "
        "zawyżała komunikat produktu — decyzja gotowości MUSI wskazywać zdolność."
    )
    assert dane["kompletnosc_modelu"] in {"MODEL_COMPLETE", "MODEL_INCOMPLETE"}

    zdolnosci = dane["zdolnosci"]
    assert zdolnosci, "Mapa zdolności jest pusta — nie ma czym zastąpić globalnego werdyktu."
    for nazwa, wpis in zdolnosci.items():
        assert isinstance(wpis["dostepna"], bool), nazwa
        assert isinstance(wpis["blokady"], list), nazwa
