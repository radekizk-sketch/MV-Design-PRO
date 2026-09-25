"""Stabilność dynamiczna z kątów wpisanych przez użytkownika — bez werdyktu i bez narracji.

Bieg `dynamic_stability` nie rozwiązuje sieci: kąty mocy przed/w czasie/po zwarciu,
napięcie i częstotliwość po zwarciu oraz czas wyłączenia WPISUJE użytkownik, a dawny
„werdykt" STABLE/UNSTABLE był porównaniem tych liczb z progami, zaś „ślad automatyki"
opowiadał, że zwarcie zostało wyłączone przez zabezpieczenia w czasie, który podał
użytkownik (żadne zabezpieczenie nie zostało zasymulowane). Bieg nadal się wykonuje —
echo danych wejściowych zostaje — ale bez werdyktu i bez narracji.

Iloczyn cech: {dane „stabilne", dane „niestabilne"} × {wiersz wyniku, podsumowanie biegu,
nakładka SLD, ślad automatyki, ślad White Box, przebieg czasowy}.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

import pytest
from api.canonical_run_views import build_run_summary_json
from enm.canonical_analysis import create_run, execute_run, get_run
from enm.store import set_enm

from tests.cgmes.golden_enm import build_golden_enm
from tests.uczciwosc.pomocnicze import braki_tekstem, sprawdz_ocene_niewykonana

_SCENARIUSZ_STABILNY: dict[str, Any] = {
    "scenario_id": "dyn-uczciwosc-a",
    "faulted_element_id": "cab_main_b",
    "cleared_by_element_ids": ["cb-a"],
    "clearing_time_ms": 90.0,
    "pre_fault_angle_deg": 8.0,
    "during_fault_angle_deg": 48.0,
    "post_fault_angle_deg": 18.0,
    "post_fault_voltage_pu": 0.98,
    "post_fault_frequency_pu": 0.995,
    "recovery_time_constant_s": 0.3,
}
_SCENARIUSZ_NIESTABILNY: dict[str, Any] = {
    **_SCENARIUSZ_STABILNY,
    "scenario_id": "dyn-uczciwosc-b",
    "clearing_time_ms": 220.0,
    "during_fault_angle_deg": 150.0,
    "post_fault_angle_deg": 140.0,
    "post_fault_voltage_pu": 0.82,
    "post_fault_frequency_pu": 0.95,
}

#: Pola dawnego werdyktu progowego — nie mają wartości neutralnej (bool, lista
#: naruszeń, czynnik ograniczający, indeks, margines wobec progu), więc znikają.
_POLA_WERDYKTU = (
    "stable",
    "checks",
    "violated_checks",
    "limiting_factor",
    "stability_index",
    "clearing_margin_ms",
    "max_clearing_time_ms",
    "threshold_criteria",
)


def _bieg(opcje: dict[str, Any]) -> str:
    set_enm("c-kat", build_golden_enm())
    bieg = execute_run(
        create_run(
            case_id="c-kat",
            klucz_twin="c-kat",
            analysis_type="dynamic_stability",
            options=dict(opcje),
        ).id
    )
    assert bieg.status == "FINISHED", bieg.error_message
    return str(bieg.id)


def _sprawdz_powod(ocena: dict[str, Any]) -> None:
    """Rekord kontraktu ``NIE_OCENIONO``: wartości wpisane przez użytkownika są danymi
    przyjętymi bez walidacji (``UNVALIDATED_INPUT``), brak (bieg kanoniczny z wyrocznią,
    zabezpieczenia niesymulowane) nazwany w „czego brakuje"."""
    rekord = sprawdz_ocene_niewykonana(ocena)
    assert rekord.dowod.status_danych.stan == "UNVALIDATED_INPUT"
    przyjete = {dana.nazwa_pl for dana in rekord.dowod.status_danych.dane_przyjete}
    assert {"kąt mocy przed zwarciem", "kąt mocy po zwarciu", "czas wyłączenia zwarcia"} <= przyjete
    assert all(
        "wpisana przez użytkownika" in dana.powod_pl
        for dana in rekord.dowod.status_danych.dane_przyjete
    )
    braki = braki_tekstem(ocena)
    assert "wpisanych przez użytkownika" in braki and "nie z rozwiązania sieci" in braki
    assert "silnik" in braki and "wyroczni" in braki
    assert "zabezpieczeń" in braki


@pytest.mark.parametrize("opcje", [_SCENARIUSZ_STABILNY, _SCENARIUSZ_NIESTABILNY])
def test_wiersz_wyniku_nie_niesie_werdyktu_stabilnosci(app_client: Any, opcje: dict) -> None:
    run_id = _bieg(opcje)
    odpowiedz = app_client.get(f"/api/analysis-runs/{run_id}/results/dynamic-stability")
    assert odpowiedz.status_code == 200, odpowiedz.text
    wiersz = odpowiedz.json()["rows"][0]

    assert wiersz["status"] == "NIE_OCENIONO"
    assert wiersz["status"] not in ("STABLE", "UNSTABLE")
    _sprawdz_powod(wiersz["ocena"])
    for pole in _POLA_WERDYKTU:
        assert pole not in wiersz, f"pole dawnego werdyktu „{pole}” zostało w wierszu wyniku"
    # Ograniczenie raportowe (uzasadnienie stopnia dowodowego z rejestru) nie twierdzi, że
    # bieg wydaje werdykt, ani nie pokazuje ścieżki kodu na ekranie projektanta — dawniej:
    # „werdykt jest porownaniem progowym … — enm/canonical_analysis.py::…".
    for ograniczenie in wiersz["reporting_limitations"]:
        assert "werdykt" not in ograniczenie
        assert ".py" not in ograniczenie
    assert "werdykt" not in wiersz["evidence"]["rationale_pl"]
    # Echo danych wejściowych zostaje (bieg się wykonuje).
    assert wiersz["clearing_time_ms"] == pytest.approx(opcje["clearing_time_ms"])
    assert wiersz["post_fault_voltage_pu"] == pytest.approx(opcje["post_fault_voltage_pu"])
    assert wiersz["faulted_element_id"] == opcje["faulted_element_id"]


@pytest.mark.parametrize("opcje", [_SCENARIUSZ_STABILNY, _SCENARIUSZ_NIESTABILNY])
def test_slad_automatyki_bez_narracji_zabezpieczen(app_client: Any, opcje: dict) -> None:
    run_id = _bieg(opcje)
    slad = app_client.get(f"/api/analysis-runs/{run_id}/results/automation-trace").json()

    assert slad["rows"] == [], "narracja automatyki z czasu wpisanego przez użytkownika zostaje"
    _sprawdz_powod(slad["ocena"])

    white_box = app_client.get(f"/api/analysis-runs/{run_id}/results/trace").json()
    klucze = {krok["key"] for krok in white_box["white_box_trace"]}
    assert not klucze & {"FAULT_CLEARED", "DYNAMIC_STABILITY_EVALUATED", "FAULT_APPLIED"}
    tekst = repr(white_box["white_box_trace"])
    # Brak narracji zadziałania (zdarzenia, opis „wyłączone przez zabezpieczenia"); jedyna
    # wzmianka o zabezpieczeniach to jawny brak w rekordzie oceny (nie są symulowane).
    assert "protection" not in tekst
    for narracja in ("wyłączone przez zabezpieczenia", "zabezpieczenia wyłączyły", "zadziałało"):
        assert narracja not in tekst
    assert "zabezpieczenia nie są w tym biegu symulowane" in tekst
    assert "STABLE" not in tekst


def test_podsumowanie_biegu_nie_niesie_werdyktu() -> None:
    run_id = _bieg(_SCENARIUSZ_STABILNY)
    bieg = get_run(UUID(run_id))
    assert bieg is not None
    podsumowanie = build_run_summary_json(bieg)
    assert podsumowanie["status"] == "NIE_OCENIONO"
    assert "stability_index" not in podsumowanie
    assert "limiting_factor" not in podsumowanie


def test_przebieg_czasowy_zadany_jest_nazwany_wprost(app_client: Any) -> None:
    run_id = _bieg(_SCENARIUSZ_STABILNY)
    przebieg = app_client.get(
        f"/api/analysis-runs/{run_id}/results/dynamic-stability/time-series"
    ).json()
    assert przebieg["has_time_series"] is True
    assert "nie jest rozwiązaniem sieci" in przebieg["uwaga_pl"]


def test_tozsamosc_kontraktu_echa_jedna_w_sladzie_wyniku_i_odtwarzalnosci(app_client: Any) -> None:
    """Predykaty parami: echo scenariusza bez werdyktu to NOWY kontrakt wyniku, a jego tożsamość
    pojawia się w trzech miejscach odpowiedzi — wersja kontraktu wiersza, wersja zestawu wzorów
    i podstawa normatywna w odtwarzalności, podstawa metody w śladzie White Box. Wszystkie muszą
    nazywać ten sam kontrakt echa; podstawa „V1" dawnego werdyktu progowego przy wyniku echa to
    rozjazd, którego nie widać w żadnym pojedynczym polu."""
    run_id = _bieg(_SCENARIUSZ_STABILNY)
    wynik = app_client.get(f"/api/analysis-runs/{run_id}/results/dynamic-stability").json()
    odtwarzalnosc = wynik["analysis_case_context"]["reproducibility"]
    slad = app_client.get(f"/api/analysis-runs/{run_id}/results/trace").json()
    podstawy_sladu = {krok["method_basis"] for krok in slad["white_box_trace"]}

    assert wynik["rows"][0]["contract_version"] == odtwarzalnosc["formula_set_version"]
    assert podstawy_sladu == {odtwarzalnosc["standard_basis_ref"]}
    assert odtwarzalnosc["standard_basis_ref"] == "DYNAMIC_STABILITY_FAULT_CLEAR_ECHO_V2"
