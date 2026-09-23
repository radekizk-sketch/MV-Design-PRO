"""Adapter wyników FROZEN V12.6 na wynik inżynierski (karta AB-1a D7).

Iloczyn cech: rodzaj (NER / walidacja porównawcza / rodzaj bez werdyktu) × stan
(spełnia / nie spełnia / brak danych) — na REALNYM solverze FROZEN, bez atrap.
"""

from __future__ import annotations

import math

import pytest
from application.analyses.werdykt_projektowy import (
    STAN_NARUSZONE,
    STAN_NIESPRAWDZONE,
    STAN_SPELNIONE,
    WYNIK_NIE_SPELNIA,
    WYNIK_SPELNIA,
)
from application.analyses.wynik_inzynierski_v126 import (
    wynik_inzynierski_v126,
    z_proby_cieplnej_ner,
    z_walidacji_benchmarkow,
)
from network_model.solvers.v126_academic import V126AcademicSolver
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126BranchInput,
    V126BusInput,
)

_B0_PER_KM = 2.0 * math.pi * 50.0 * 0.25e-6


def _siec(parameters: dict) -> V126AcademicInput:
    return V126AcademicInput(
        base_frequency_hz=50.0,
        buses=[
            V126BusInput(ref="B1", name="GPZ", nominal_kv=20.0),
            V126BusInput(ref="B2", name="S1", nominal_kv=20.0),
        ],
        branches=[
            V126BranchInput(
                ref="K1",
                from_bus_ref="B1",
                to_bus_ref="B2",
                kind="cable",
                length_km=30.0,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.12,
                b0_siemens_per_km=_B0_PER_KM,
            )
        ],
        parameters=parameters,
    )


def _ner(**dodatkowe: float) -> dict:
    wynik = V126AcademicSolver().run(
        V126AnalysisType.NEUTRAL_EARTHING_DESIGN,
        _siec(
            {
                "neutral_earthing_type": "resistor_grounded",
                "ner_target_earth_fault_current_a": 300.0,
                **dodatkowe,
            }
        ),
    )
    return wynik["result"]


@pytest.mark.parametrize(
    ("energia_znamionowa", "wynik", "stan"),
    [(5.0e6, WYNIK_SPELNIA, STAN_SPELNIONE), (100.0, WYNIK_NIE_SPELNIA, STAN_NARUSZONE)],
)
def test_ner_liczby_z_wyniku_solvera(energia_znamionowa: float, wynik: str, stan: str) -> None:
    wynik_solvera = _ner(ner_clearing_time_s=1.0, ner_energy_rating_j=energia_znamionowa)
    pozycja = z_proby_cieplnej_ner("run-ner", wynik_solvera)
    element = pozycja.elementy[0]
    proba = wynik_solvera["thermal_check"]
    assert element.wynik == wynik and pozycja.stan == stan
    assert element.wartosc == proba["energy_dissipated_j"]
    assert element.odniesienie == proba["energy_rating_j"]
    assert element.margines is not None and (element.margines > 0) is (wynik == WYNIK_SPELNIA)
    assert element.dowod == {
        "run_id": "run-ner",
        "element_id": "rezystor_uziemiajacy",
        "trace_ref": None,
    }
    assert pozycja.podstawa is not None and pozycja.podstawa.zrodlo_status == "UNVERIFIED_SOURCE"
    assert pozycja.physics_domain == "SEQUENCE_DOMAIN"


def test_ner_bez_danych_cieplnych_to_brak_podstaw_bez_liczb() -> None:
    pozycja = z_proby_cieplnej_ner("run-ner", _ner())
    element = pozycja.elementy[0]
    assert pozycja.stan == STAN_NIESPRAWDZONE
    assert (element.wartosc, element.odniesienie, element.margines) == (None, None, None)
    assert "ner_clearing_time_s" in (element.uzasadnienie_pl or "")


def test_ner_bez_celu_pradu_nie_ma_proby() -> None:
    wynik_solvera = V126AcademicSolver().run(
        V126AnalysisType.NEUTRAL_EARTHING_DESIGN,
        _siec({"neutral_earthing_type": "resistor_grounded"}),
    )["result"]
    pozycja = z_proby_cieplnej_ner("run-ner", wynik_solvera)
    assert pozycja.stan == STAN_NIESPRAWDZONE and pozycja.elementy == ()


def test_walidacja_porownawcza_wiersze_i_brak_domeny() -> None:
    wynik_solvera = V126AcademicSolver().run(
        V126AnalysisType.BENCHMARK_VALIDATION,
        _siec(
            {
                "benchmark_references": [
                    {
                        "network": "IEEE 9",
                        "test": "U_bus5",
                        "reference": 1.0,
                        "calculated": 1.001,
                        "tolerance_percent": 0.5,
                    },
                    {
                        "network": "IEEE 9",
                        "test": "P_line",
                        "reference": 10.0,
                        "calculated": 11.0,
                        "tolerance_percent": 1.0,
                    },
                ]
            }
        ),
    )["result"]
    pozycja = z_walidacji_benchmarkow("run-b", wynik_solvera)
    assert [e.wynik for e in pozycja.elementy] == [WYNIK_SPELNIA, WYNIK_NIE_SPELNIA]
    assert pozycja.stan == STAN_NARUSZONE
    assert pozycja.elementy[1].wartosc == pytest.approx(10.0)
    assert pozycja.elementy[1].odniesienie == 1.0
    # Walidacja porownawcza nie liczy fizyki — brak domeny fizycznej.
    assert pozycja.physics_domain is None


def test_rodzaj_bez_werdyktu_nie_dostaje_pola() -> None:
    assert wynik_inzynierski_v126("voltage_stability", "run", {}) is None
    assert wynik_inzynierski_v126("power_quality_harmonics", "run", {}) is None
    slownik = wynik_inzynierski_v126("benchmark_validation", "run", {"validation_report": []})
    assert slownik is not None and slownik["stan"] == STAN_NIESPRAWDZONE
