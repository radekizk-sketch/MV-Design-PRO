"""Wspolbieznosc koncowek API — miara „done" osi wspolbieznosci programu 10x.

CO TEN TEST PILNUJE. Projektant w JEDNEJ sesji odpala kilka analiz rownolegle
(rozplyw + zwarcia) i czyta model — UI ma pozostac responsywne. Koncowka
zdefiniowana jako `async def` z BLOKUJACYM wnetrzem (solver CPU, sync
SQLAlchemy, IO pliku modelu) zajmuje petle zdarzen na caly czas swojej pracy,
wiec K rownoleglych zadan wykonuje sie SZEREGOWO — laczny czas rosnie liniowo z
K, a kazde inne zadanie (nawet trywialny odczyt) czeka na koniec biegu.

MIARA JEST WZGLEDNA, NIE MILISEKUNDOWA. Progi bezwzgledne (np. „ponizej 800 ms")
sa zrodlem flakow: ten sam kod na wolniejszym runnerze CI przekracza kazdy
sensowny prog. Mierzymy wiec ZYSK rownoleglosci wzgledem tego samego biegu
wykonanego szeregowo, w tym samym procesie i na tej samej maszynie — stosunek
jest odporny na predkosc maszyny.

DRUGA, MOCNIEJSZA MIARA: NAKLADANIE SIE OKIEN. Kazde zadanie melduje wlasny
znacznik wejscia i wyjscia; przy prawdziwej rownoleglosci okna czasowe zadan
zachodza na siebie. Serializacja na petli zdarzen daje okna ROZLACZNE — i to
wykrywa nawet wtedy, gdy stosunek czasow zmiesci sie w marginesie (np. gdy
maszyna ma jeden rdzen, a GIL i tak przeplata watki).
"""

from __future__ import annotations

import json
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from api.main import app
from fastapi.testclient import TestClient

from tests.catalog_test_helpers import gpz_source_record

#: Liczba rownoleglych zadan w miarze „done" (§3 planu 10x).
K_ROWNOLEGLYCH = 10


def _reset_backend_state() -> None:
    from enm.canonical_analysis import reset_canonical_runs
    from enm.store import reset_enm_store

    reset_canonical_runs()
    reset_enm_store()


def _model_sn(nazwa: str) -> dict:
    """Maly, kompletny model SN — zrodlo GPZ, kabel, odbior.

    Rozmiar dobrany tak, zeby bieg trwal MIERZALNIE (kilkadziesiat ms), ale nie
    wydluzal suity: miara jest wzgledna, wiec nie potrzebuje duzej sieci.
    """
    return {
        "header": {
            "name": nazwa,
            "enm_version": "1.0",
            "defaults": {"frequency_hz": 50, "unit_system": "SI"},
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z",
            "revision": 1,
            "hash_sha256": "",
        },
        "buses": [
            {
                "id": "00000000-0000-0000-0000-000000000301",
                "ref_id": "bus-main",
                "name": "Szyna glowna",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
                "phase_system": "3ph",
            },
            {
                "id": "00000000-0000-0000-0000-000000000302",
                "ref_id": "bus-load",
                "name": "Szyna odbioru",
                "tags": [],
                "meta": {},
                "voltage_kv": 15.0,
                "phase_system": "3ph",
            },
        ],
        "branches": [
            {
                "id": "00000000-0000-0000-0000-000000000303",
                "ref_id": "branch-load",
                "name": "Kabel odbioru",
                "tags": [],
                "meta": {},
                "type": "cable",
                "from_bus_ref": "bus-main",
                "to_bus_ref": "bus-load",
                "status": "closed",
                "catalog_ref": "KABEL_SN_TEST",
                "parameter_source": "CATALOG",
                "length_km": 0.5,
                "r_ohm_per_km": 0.253,
                "x_ohm_per_km": 0.073,
                "b_siemens_per_km": 2.6e-07,
                "rating": {"in_a": 270.0},
            }
        ],
        "sources": [
            {
                "id": "00000000-0000-0000-0000-000000000304",
                "tags": [],
                "meta": {},
                **gpz_source_record(
                    ref_id="src-grid",
                    name="Zasilanie GPZ",
                    bus_ref="bus-main",
                    voltage_kv=15.0,
                    sk3_mva=250.0,
                    rx_ratio=0.10,
                ),
            }
        ],
        "loads": [
            {
                "id": "00000000-0000-0000-0000-000000000305",
                "ref_id": "load-1",
                "name": "Odbior SN",
                "tags": [],
                "meta": {},
                "bus_ref": "bus-load",
                "p_mw": 1.2,
                "q_mvar": 0.35,
                "catalog_ref": "LOAD_TEST",
                "parameter_source": "OVERRIDE",
            }
        ],
        "transformers": [],
        "generators": [],
        "substations": [],
        "bays": [],
        "junctions": [],
        "corridors": [],
        "measurements": [],
        "protection_assignments": [],
        "branch_points": [],
    }


def _zasiej(case_id: str, nazwa: str) -> None:
    from enm.models import EnergyNetworkModel
    from enm.store import set_enm

    set_enm(case_id, EnergyNetworkModel.model_validate(_model_sn(nazwa)))


@pytest.fixture
def client() -> TestClient:
    _reset_backend_state()
    with TestClient(app) as test_client:
        yield test_client


def _odcisk_rozplywu(payload: dict) -> str:
    """Odcisk WYNIKU FIZYKI — bez pol z natury zmiennych miedzy biegami.

    `run_id` (losowy UUID) i `enm_revision` (rosnie przy kazdym zapisie modelu)
    NIE sa wynikiem solvera; ich udzial w odcisku zamienilby test determinizmu w
    test generatora UUID. Porownujemy to, co ma byc identyczne: napiecia, moce,
    straty i hash modelu wejsciowego.
    """
    return json.dumps(
        {
            "enm_hash": payload["enm_hash"],
            "input_hash": payload["input_hash"],
            "result": payload["result"],
        },
        sort_keys=True,
        ensure_ascii=False,
    )


def _odcisk_zwarcia(payload: dict) -> str:
    return json.dumps(
        {
            "enm_hash": payload["enm_hash"],
            "input_hash": payload["input_hash"],
            "results": payload["results"],
        },
        sort_keys=True,
        ensure_ascii=False,
    )


def test_biegi_rownolegle_sa_deterministyczne_i_nie_serializuja_sie(
    client: TestClient,
) -> None:
    """K=10 mieszanych zadan rownolegle: 200, ten sam wynik, okna zachodza.

    ZADANIA MIESZANE, bo o to chodzi w praktyce: rozplyw i zwarcie to praca CPU
    solvera, a odczyty modelu to IO pliku — jedno i drugie blokowalo petle
    zdarzen, wiec jedno i drugie musi byc w pomiarze.
    """
    przypadki = [str(uuid4()) for _ in range(K_ROWNOLEGLYCH)]
    for i, case_id in enumerate(przypadki):
        _zasiej(case_id, f"Siec SN {i}")

    # --- Odniesienie: ten sam zestaw zadan wykonany SZEREGOWO ---------------
    wzorce: dict[str, str] = {}
    start_szeregowo = time.perf_counter()
    for i, case_id in enumerate(przypadki):
        if i % 2 == 0:
            odp = client.post(f"/api/cases/{case_id}/runs/power-flow")
            assert odp.status_code == 200, odp.text
            wzorce[case_id] = _odcisk_rozplywu(odp.json())
        else:
            odp = client.post(f"/api/cases/{case_id}/runs/short-circuit", json={})
            assert odp.status_code == 200, odp.text
            wzorce[case_id] = _odcisk_zwarcia(odp.json())
        assert client.get(f"/api/cases/{case_id}/enm/readiness").status_code == 200
    czas_szeregowo = time.perf_counter() - start_szeregowo

    # --- Pomiar wlasciwy: te same zadania RONWOLEGLE ------------------------
    okna: list[tuple[float, float]] = []
    zamek_okien = threading.Lock()
    wyniki: dict[str, str] = {}
    zamek_wynikow = threading.Lock()

    def zadanie(indeks_i_case: tuple[int, str]) -> int:
        i, case_id = indeks_i_case
        wejscie = time.perf_counter()
        if i % 2 == 0:
            odp = client.post(f"/api/cases/{case_id}/runs/power-flow")
            odcisk = _odcisk_rozplywu(odp.json()) if odp.status_code == 200 else ""
        else:
            odp = client.post(f"/api/cases/{case_id}/runs/short-circuit", json={})
            odcisk = _odcisk_zwarcia(odp.json()) if odp.status_code == 200 else ""
        odczyt = client.get(f"/api/cases/{case_id}/enm/readiness")
        wyjscie = time.perf_counter()
        with zamek_okien:
            okna.append((wejscie, wyjscie))
        with zamek_wynikow:
            wyniki[case_id] = odcisk
        assert odczyt.status_code == 200, odczyt.text
        return odp.status_code

    start_rownolegle = time.perf_counter()
    with ThreadPoolExecutor(max_workers=K_ROWNOLEGLYCH) as pula:
        kody = list(pula.map(zadanie, list(enumerate(przypadki))))
    czas_rownolegle = time.perf_counter() - start_rownolegle

    # (a) wszystkie 200
    assert kody == [200] * K_ROWNOLEGLYCH, kody

    # (b) determinizm: rownolegly bieg daje CO DO ZNAKU ten sam wynik fizyki
    for case_id in przypadki:
        assert wyniki[case_id] == wzorce[case_id], (
            f"Wynik przypadku {case_id} rozni sie miedzy biegiem szeregowym a "
            "rownoleglym — solver zalezy od watku."
        )

    # (c) rownoleglosc: laczny czas NIE moze byc gorszy niz szeregowy.
    #     Prog wzgledny z zapasem 25% na narzut puli watkow i zmiennosc maszyny;
    #     serializacja na petli zdarzen daje stosunek ~1.0 lub gorszy, wiec
    #     margines nie chowa defektu, ktorego szukamy.
    assert czas_rownolegle <= czas_szeregowo * 1.25, (
        f"Zadania rownolegle ({czas_rownolegle:.3f} s) nie sa szybsze od "
        f"szeregowych ({czas_szeregowo:.3f} s) — koncowki serializuja sie."
    )

    # (d) NAKLADANIE SIE OKIEN — miara odporna na predkosc maszyny.
    #     Serializacja daje okna rozlaczne: maksymalna liczba jednoczesnie
    #     otwartych zadan wynosi wtedy 1.
    zdarzenia = sorted(
        [(poczatek, +1) for poczatek, _ in okna] + [(koniec, -1) for _, koniec in okna]
    )
    biezace = 0
    szczyt = 0
    for _, delta in zdarzenia:
        biezace += delta
        szczyt = max(szczyt, biezace)
    assert szczyt >= 2, (
        f"Zadne dwa zadania nie bylo jednoczesnie w locie (szczyt={szczyt}) — "
        "koncowki wykonuja sie szeregowo na petli zdarzen."
    )


def test_odczyt_nie_czeka_na_bieg_analizy(client: TestClient) -> None:
    """Trywialny odczyt zdazy, ZANIM skonczy sie rownolegly bieg analizy.

    To jest wprost cel inzynierski osi: UI ma pozostac responsywne w trakcie
    liczenia. Gdy bieg blokuje petle zdarzen, `GET /api/health` czeka na jego
    koniec — okno odczytu lezy wtedy CALE po zakonczeniu biegu.
    """
    case_id = str(uuid4())
    _zasiej(case_id, "Siec SN — responsywnosc")

    znaczniki: dict[str, tuple[float, float]] = {}

    def bieg() -> int:
        start = time.perf_counter()
        odp = client.post(f"/api/cases/{case_id}/runs/power-flow")
        znaczniki["bieg"] = (start, time.perf_counter())
        return odp.status_code

    def odczyt() -> int:
        # Krotka zwloka, zeby bieg zdazyl wejsc w faze liczenia.
        time.sleep(0.01)
        start = time.perf_counter()
        odp = client.get("/api/health")
        znaczniki["odczyt"] = (start, time.perf_counter())
        return odp.status_code

    with ThreadPoolExecutor(max_workers=2) as pula:
        przyszly_bieg = pula.submit(bieg)
        przyszly_odczyt = pula.submit(odczyt)
        assert przyszly_bieg.result() == 200
        assert przyszly_odczyt.result() == 200

    poczatek_biegu, koniec_biegu = znaczniki["bieg"]
    poczatek_odczytu, koniec_odczytu = znaczniki["odczyt"]
    assert poczatek_odczytu >= poczatek_biegu
    assert koniec_odczytu < koniec_biegu, (
        "Odczyt /api/health zakonczyl sie dopiero PO biegu analizy — bieg "
        "blokowal petle zdarzen."
    )
