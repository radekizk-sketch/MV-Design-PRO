"""`konfiguracja_biegu` w `GET /api/analysis-runs/{run_id}/results/short-circuit`
(karta TODO-UI2, 2026-09-16, p.7).

DLACZEGO. `EkranZwarc`/`WynikiWarsztat` czytały współczynnik c i czas cieplny
z konfiguracji AKTYWNEGO przypadku obliczeniowego (`activeCase.config.*`) —
to nie jest konfiguracja PRZEBIEGU, którego wynik jest wyświetlany (aktywny
przypadek może się zmienić po zapisaniu biegu). Odpowiedź dostaje addytywnie
`konfiguracja_biegu` z ZAPISANYCH opcji TEGO biegu (`run.options` —
`enm/assembler.zloz_wejscie_zwarcia`), nie z aktywnego przypadku.

ILOCZYN CECH (KLASA, NIE INSTANCJA §2): {c_factor jawny w opcjach biegu /
c_factor nieobecny -> auto-per-węzeł} × {thermal_time_seconds jawny /
nieobecny -> wartość domyślna assemblera 1.0 s, OZNACZONA jako domyślna, nie
ukryta}. Router realny (`TestClient`) — ten sam wzorzec fixture co
`test_short_circuit_band.py` (`_zapisz_bieg`/`_siec`/`client`).
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from api.main import app
from enm.canonical_analysis import (
    CanonicalRun,
    _execute_short_circuit,
    canonical_run_repository_scope,
    reset_canonical_runs,
)
from enm.models import Bus, EnergyNetworkModel, ENMHeader, Source, Transformer
from fastapi.testclient import TestClient


@pytest.fixture()
def client() -> TestClient:
    reset_canonical_runs()
    with TestClient(app) as test_client:
        yield test_client


def _siec() -> EnergyNetworkModel:
    return EnergyNetworkModel(
        header=ENMHeader(name="Siec konfiguracji biegu", revision=1),
        buses=[
            Bus(ref_id="hv", name="GPZ 110", voltage_kv=110.0),
            Bus(ref_id="mv", name="Stacja SN", voltage_kv=15.0),
        ],
        sources=[
            Source(
                ref_id="s1",
                name="System 110 kV",
                bus_ref="hv",
                model="short_circuit_power",
                sk3_mva=2000.0,
                rx_ratio=0.1,
            )
        ],
        transformers=[
            Transformer(
                ref_id="t1",
                name="T1",
                hv_bus_ref="hv",
                lv_bus_ref="mv",
                sn_mva=16.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=10.5,
                pk_kw=80.0,
                vector_group="YNd11",
            )
        ],
    )


def _zapisz_bieg(run_id: UUID, *, opcje: dict[str, object]) -> CanonicalRun:
    utworzony = datetime(2026, 1, 1, tzinfo=UTC)
    run = CanonicalRun(
        id=run_id,
        case_id="case-konfiguracja-biegu",
        project_id="proj-konfiguracja-biegu",
        analysis_type="short_circuit_sn",
        status="FINISHED",
        created_at=utworzony,
        snapshot_hash=f"snap-{run_id}",
        input_hash=f"in-{run_id}",
        snapshot=_siec().model_dump(mode="json"),
        validation={},
        readiness={},
        options=opcje,
    )
    run.finished_at = utworzony
    _execute_short_circuit(run)
    with canonical_run_repository_scope() as repository:
        repository.save(run)
    return run


def _wynik(client: TestClient, run_id: UUID) -> dict:
    response = client.get(f"/api/analysis-runs/{run_id}/results/short-circuit")
    assert response.status_code == 200, response.text
    return response.json()


def test_c_factor_jawny_w_opcjach_biegu_zwracany_wprost(client: TestClient) -> None:
    run_id = uuid4()
    _zapisz_bieg(
        run_id,
        opcje={
            "fault_type": "3F",
            "scenario": "max",
            "c_factor": 1.05,
            "thermal_time_seconds": 1.0,
        },
    )
    konfiguracja = _wynik(client, run_id)["konfiguracja_biegu"]
    assert konfiguracja["c_factor"] == {"tryb": "jawny", "wartosc": 1.05}


def test_c_factor_nieobecny_w_opcjach_biegu_auto_per_wezel(client: TestClient) -> None:
    """Predykat parami z testem wyżej: JEDNO źródło prawdy (`run.options`) —
    brak klucza (nie `None` zapisane wprost, brak w ogóle) daje `auto_per_wezel`
    z `wartosc: None`, ZGODNIE z tym, co `zloz_wejscie_zwarcia` faktycznie robi
    (dobiera c PER WĘZEŁ z jego pasma napięciowego — nie ma jednej liczby)."""
    run_id = uuid4()
    _zapisz_bieg(run_id, opcje={"fault_type": "3F", "scenario": "max", "thermal_time_seconds": 1.0})
    konfiguracja = _wynik(client, run_id)["konfiguracja_biegu"]
    assert konfiguracja["c_factor"] == {"tryb": "auto_per_wezel", "wartosc": None}


def test_thermal_time_seconds_jawny_w_opcjach_biegu(client: TestClient) -> None:
    run_id = uuid4()
    _zapisz_bieg(
        run_id,
        opcje={"fault_type": "3F", "scenario": "max", "c_factor": 1.1, "thermal_time_seconds": 3.0},
    )
    konfiguracja = _wynik(client, run_id)["konfiguracja_biegu"]
    assert konfiguracja["thermal_time_seconds"] == {"wartosc": 3.0, "pochodzenie": "opcje_biegu"}


def test_thermal_time_seconds_nieobecny_domyslna_assemblera_nazwana(client: TestClient) -> None:
    """Predykat parami z testem wyżej: brak klucza w opcjach -> wartość, którą
    assembler FAKTYCZNIE zastosował (1.0 s — `zloz_wejscie_zwarcia`), ale
    NAZWANA jako domyślna assemblera, nie ukryta jako gdyby pochodziła z opcji."""
    run_id = uuid4()
    _zapisz_bieg(run_id, opcje={"fault_type": "3F", "scenario": "max", "c_factor": 1.1})
    konfiguracja = _wynik(client, run_id)["konfiguracja_biegu"]
    assert konfiguracja["thermal_time_seconds"] == {
        "wartosc": 1.0,
        "pochodzenie": "domyslna_assemblera",
    }


def test_metoda_jest_stala_normatywna_iec_60909(client: TestClient) -> None:
    run_id = uuid4()
    _zapisz_bieg(run_id, opcje={"fault_type": "3F", "scenario": "max"})
    konfiguracja = _wynik(client, run_id)["konfiguracja_biegu"]
    assert konfiguracja["metoda"] == "IEC 60909"


def test_konfiguracja_biegu_nie_zmienia_istniejacych_pol_odpowiedzi(client: TestClient) -> None:
    """Kontrakt FROZEN: pole addytywne obok istniejących (`rows`,
    `analysis_case_context`), nie zamiast nich."""
    run_id = uuid4()
    _zapisz_bieg(run_id, opcje={"fault_type": "3F", "scenario": "max"})
    wynik = _wynik(client, run_id)
    assert "rows" in wynik
    assert "analysis_case_context" in wynik
    assert "konfiguracja_biegu" in wynik
