"""Werdykt stabilności SSCI — analiza BADAWCZA wycofana z powierzchni (karta AB-1d_min).

Kanon od 2026-09-23 (przegląd adwersarialny §6.4, audyt harmonicznych #10/#21/#22/#49
KEEP_RESEARCH_ONLY): werdykt Nyquista z zapasem fazy 30° zaszytym w kodzie i Z_grid(f)
z impedancji źródła przyjętej z założenia NIE trafia na żaden ekran. Końcówka
``GET /api/analysis-runs/{run_id}/results/v126/ssci_impedance/stability`` odpowiada
410 z ciałem wycofania dla KAŻDEGO przebiegu (iloczyn cech: sieć słaba / sztywna /
bez przekształtnika / bieg nieznany / inny rodzaj), bez tokenu werdyktu w ciele.

Intencja dawnych testów „werdykt na realnym przebiegu" (metryki, flagi, White Box,
uczciwy stan zerowy) zostaje na warstwie, która werdykt liczy
(`application/analyses/ssci_stability`) — kod badawczy pod testem do AB-5H.
Payloady liczy REALNY solver (karta referencyjna Huawei); ścieżka HTTP natywna.
"""

from __future__ import annotations

from uuid import UUID, uuid4

import pytest
from analysis.ssci_stability import (
    VERDICT_NO_DATA,
    VERDICT_RISK,
    VERDICT_STABLE,
    VERDICT_UNSTABLE,
)
from enm.canonical_analysis import reset_canonical_runs
from network_model.catalog.repository import get_default_mv_catalog
from solver_input.v126_contracts import (
    V126AcademicInput,
    V126AnalysisType,
    V126BranchInput,
    V126BusInput,
    V126ConverterInput,
)

STABILITY = "/api/analysis-runs/{run_id}/results/v126/ssci_impedance/stability"
_HUAWEI_CARD_ID = "conv-pv-card-huawei-sun2000-215ktl"


@pytest.fixture(autouse=True)
def _reset_v126_runs() -> None:
    # CV-4.3-A4 (K5.2): biegi V12.6 żyją odtąd w rejestrze kanonicznym R1
    # (`CanonicalRun`), nie w słowniku `_runs` modułu — reset tego samego
    # rejestru, którego używają WSZYSTKIE typy analiz.
    reset_canonical_runs()
    yield
    reset_canonical_runs()


def _reference_card():
    repo = get_default_mv_catalog()
    by_id = {c.id: c for c in repo.list_converter_types()}
    return by_id[_HUAWEI_CARD_ID]


def _converter_from_card(card) -> V126ConverterInput:
    return V126ConverterInput(
        ref="INV1",
        bus_ref="CONV",
        mode="GFL",
        rated_mva=card.sn_mva,
        rated_kv=card.un_kv,
        current_loop_bandwidth_hz=card.current_loop_bandwidth_hz,
        voltage_loop_bandwidth_hz=card.voltage_loop_bandwidth_hz,
        pll_bandwidth_hz=card.pll_bandwidth_hz,
        control_delay_ms=card.control_delay_ms,
        filter_l_pu=card.filter_l_pu,
        filter_r_pu=card.filter_r_pu,
        p_mw=0.2,
        q_mvar=0.0,
    )


def _model(card, *, scr: float, with_converter: bool = True) -> V126AcademicInput:
    fault_level_mva = scr * card.sn_mva
    return V126AcademicInput(
        buses=[
            V126BusInput(
                ref="PCC", name="PCC", nominal_kv=card.un_kv, fault_level_mva=fault_level_mva
            ),
            V126BusInput(ref="CONV", name="Konwerter", nominal_kv=card.un_kv),
        ],
        branches=[
            V126BranchInput(
                ref="L1",
                from_bus_ref="PCC",
                to_bus_ref="CONV",
                kind="cable",
                length_km=0.05,
                r_ohm_per_km=0.1,
                x_ohm_per_km=0.08,
            )
        ],
        converters=[_converter_from_card(card)] if with_converter else [],
    )


def _seed_run(
    model: V126AcademicInput,
    analysis_type: V126AnalysisType = V126AnalysisType.SSCI_IMPEDANCE,
) -> UUID:
    """Zapisz przebieg V12.6 PRZEZ REJESTR KANONICZNY R1 (CV-4.3-A4, K5.2) —
    ten sam ``create_run``+``execute_run`` i wykonawca ``_execute_v126``,
    których używa prawdziwa końcówka POST ``run_v126_analysis`` (zero
    duplikatu logiki budowy ``proof``/``report``). Numery pochodzą z REALNEGO
    solvera (adapter, zero fizyki), nie są fabrykowane. Końcówka GET pod
    testem jest wykonywana natywnie przez ``app_client``.
    """
    from enm.canonical_analysis import create_run, execute_run

    run = create_run(
        case_id="c-ssci",
        klucz_twin="c-ssci",
        analysis_type=f"v126:{analysis_type.value}",
        options={"model": model.model_dump(mode="json")},
    )
    run = execute_run(run.id)
    assert run.status == "FINISHED", run.error_message
    return run.id


# ---------------------------------------------------------------------------
# Werdykt ANALIZY BADAWCZEJ na realnym przebiegu (warstwa aplikacji, bez HTTP)
# ---------------------------------------------------------------------------
#
# Karta AB-1d_min krok 3: końcówka HTTP werdyktu odpowiada 410 (analiza badawcza
# wycofana z powierzchni, przegląd adwersarialny §6.4 — niżej). Intencja dawnych
# testów „werdykt na realnym przebiegu" zostaje na warstwie, która werdykt liczy
# (`build_ssci_stability_view`, KEEP_RESEARCH_ONLY do AB-5H): ta sama funkcja, ten
# sam rekord biegu z rejestru kanonicznego, bez ekspozycji na ekranie.


def _widok_badawczy(run_id: UUID) -> dict:
    from application.analyses.ssci_stability import build_ssci_stability_view
    from enm.canonical_analysis import get_run

    bieg = get_run(run_id)
    assert bieg is not None and bieg.raw_result is not None
    return build_ssci_stability_view(bieg.raw_result)


def test_badawczy_werdykt_slabej_sieci_sygnalizuje_ryzyko() -> None:
    card = _reference_card()
    verdict = _widok_badawczy(_seed_run(_model(card, scr=1.5)))["verdict"]
    assert verdict["verdict"] in (VERDICT_RISK, VERDICT_UNSTABLE), verdict["verdict"]
    assert verdict["is_risk"] is True
    assert verdict["has_magnitude_crossover"] is True
    assert verdict["offending_frequency_hz"] is not None
    for step in verdict["white_box"]:
        assert step["formula_latex"] and step["result_pl"] and step["unit_check_pl"]
    assert verdict["provenance"] is not None


def test_badawczy_werdykt_sztywnej_sieci_stabilny() -> None:
    card = _reference_card()
    verdict = _widok_badawczy(_seed_run(_model(card, scr=50.0)))["verdict"]
    assert verdict["verdict"] == VERDICT_STABLE, verdict["verdict"]
    assert verdict["is_risk"] is False
    assert verdict["offending_frequency_hz"] is None


def test_badawczy_werdykt_bez_przeksztaltnika_to_brak_danych() -> None:
    card = _reference_card()
    verdict = _widok_badawczy(_seed_run(_model(card, scr=1.5, with_converter=False)))["verdict"]
    assert verdict["verdict"] == VERDICT_NO_DATA
    assert verdict["missing_data"]
    assert verdict["max_minor_loop_gain"] is None


# ---------------------------------------------------------------------------
# Końcówka HTTP: 410 dla KAŻDEGO przebiegu (iloczyn cech) — bez tokenu werdyktu
# ---------------------------------------------------------------------------


def _przypadki_biegu() -> list[tuple[str, object]]:
    return [
        ("siec_slaba", lambda: _seed_run(_model(_reference_card(), scr=1.5))),
        ("siec_sztywna", lambda: _seed_run(_model(_reference_card(), scr=50.0))),
        (
            "bez_przeksztaltnika",
            lambda: _seed_run(_model(_reference_card(), scr=1.5, with_converter=False)),
        ),
        ("bieg_nieznany", lambda: uuid4()),
        (
            "inny_rodzaj_v126",
            lambda: _seed_run(
                _model(_reference_card(), scr=1.5),
                analysis_type=V126AnalysisType.INSULATION_COORDINATION,
            ),
        ),
    ]


@pytest.mark.parametrize("przypadek", [nazwa for nazwa, _ in _przypadki_biegu()])
def test_koncowka_werdyktu_odpowiada_410_bez_werdyktu(app_client, przypadek: str) -> None:
    """Przegląd adwersarialny §6.4: werdykt SSCI nie trafia na ŻADEN ekran — 410 zapada
    przed odczytem biegu, dla biegu historycznego, nieznanego i innego rodzaju."""
    tworca = dict(_przypadki_biegu())[przypadek]
    run_id = tworca()  # type: ignore[operator]
    resp = app_client.get(STABILITY.format(run_id=run_id))
    assert resp.status_code == 410, resp.text
    body = resp.json()
    assert body["code"] == "v126.analysis_withdrawn"
    assert body["analysis_type"] == "ssci_impedance"
    assert body["zamiennik"] == []
    assert body["powod_pl"]
    assert "verdict" not in body
    tekst = resp.text.lower()
    for token in (
        "stabilny",
        "niestabilny",
        "ryzyko ssci",
        VERDICT_STABLE,
        VERDICT_UNSTABLE,
    ):
        assert f'"{token}"' not in tekst
