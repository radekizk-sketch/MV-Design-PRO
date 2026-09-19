"""Ranking N-1/N-2 zdjęty z `reliability_contingency` V12.6 (karta W3-E).

`_reliability` (`network_model/solvers/v126_academic.py:1069-1188`, solver
FROZEN — B-01, NIETKNIĘTY) liczy dotkliwość kontyngencji z `_branch_current_a`
— prąd wyliczony z obciążenia WĘZŁA DOCELOWEGO gałęzi, bez sprzężenia sieci
(nie jest to rozpływ). Kanon rankingu N-1 = `application/analyses/
kontyngencje_n1.py` (pełny re-solve solvera rozpływu dla każdej kontyngencji,
ekran „Wyniki › Kontyngencje"). Wskaźniki niezawodności (SAIDI/SAIFI/CAIDI/
MAIFI, klucz `indices`) mają JEDYNĄ implementację w `_reliability` i ZOSTAJĄ
widoczne bez zmian — wycofanie dotyczy WYŁĄCZNIE rankingu.

Postprocess: `application.v126_artifacts.bez_rankingu_n1`, wywołany RAZ w
`enm/canonical_analysis.py::_execute_v126`. Predykaty parami: usuwane są
WSZYSTKIE klucze pochodne `_branch_current_a` w wyniku `_reliability` — nie
tylko `contingency_ranking` nazwany w audycie, ale też `brak_danych`/
`elementy_bez_obciazalnosci` (meldunek ZBIORCZY o gałęziach bez obciążalności,
sensowny WYŁĄCZNIE jako komentarz do rankingu, który po zdjęciu rankingu byłby
osieroconym fragmentem) i naruszenie `n1_overload` w bloku `sanity` (ten sam
prąd gałęzi przez filtr `overloaded`) — ze statusem `sanity.status`
PRZELICZONYM tym samym predykatem co `_sanity_block` solvera.

ILOCZYN CECH: {results, proof, report} × {klucze rankingu obecne? / ranking_n1
obecny? / indices nietknięte?}; fikstura wywołuje WSZYSTKIE gałęzie kodu
warte sprawdzenia naraz — gałąź przeciążona (n1_overload), gałąź bez
obciążalności (brak_danych), N-2 (para gałęzi).
"""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from api.main import app
from application.v126_artifacts import bez_rankingu_n1
from enm.canonical_analysis import create_run, execute_run
from fastapi.testclient import TestClient
from solver_input.v126_contracts import V126AcademicInput

_KLUCZE_RANKINGU = ("contingency_ranking", "brak_danych", "elementy_bez_obciazalnosci")


def _model_reliability() -> V126AcademicInput:
    """Fikstura precyzyjnie zaprojektowana, żeby wywołać RAZEM: gałąź
    przeciążoną (prąd >> obciążalność, dla `n1_overload`), gałąź bez
    obciążalności (`brak_danych`/`elementy_bez_obciazalnosci`) i kontyngencję
    N-2 (para gałęzi) — jeden bieg wywołuje wszystkie gałęzie kodu, które ta
    karta dotyka.

    L1-przeciazona: `to_bus=B2` ma `load_mw=5.0` przy `nominal_kv=15.0`, więc
    `_branch_current_a` daje prąd ≈192,45 A wobec zaszytej obciążalności
    `ampacity_a=10.0` — ponad 19-krotne przeciążenie, > 100 % (zapala
    `n1_overload`). L2-bez-obciazalnosci nie niesie `ampacity_a`.
    """
    return V126AcademicInput.model_validate(
        {
            "buses": [
                {"ref": "B1", "name": "GPZ", "nominal_kv": 15.0, "customer_count": 100},
                {
                    "ref": "B2",
                    "name": "Stacja przeciazona",
                    "nominal_kv": 15.0,
                    "customer_count": 50,
                    "load_mw": 5.0,
                },
                {
                    "ref": "B3",
                    "name": "Stacja bez obciazalnosci",
                    "nominal_kv": 15.0,
                    "customer_count": 20,
                    "load_mw": 0.5,
                },
            ],
            "branches": [
                {
                    "ref": "L1-przeciazona",
                    "from_bus_ref": "B1",
                    "to_bus_ref": "B2",
                    "kind": "cable",
                    "length_km": 1.0,
                    "ampacity_a": 10.0,
                    "failure_rate_per_year": 0.02,
                    "mttr_h": 5.0,
                },
                {
                    "ref": "L2-bez-obciazalnosci",
                    "from_bus_ref": "B1",
                    "to_bus_ref": "B3",
                    "kind": "cable",
                    "length_km": 1.0,
                    "failure_rate_per_year": 0.01,
                    "mttr_h": 3.0,
                },
            ],
        }
    )


def _wstaw_bieg_niezawodnosci() -> Any:
    model = _model_reliability()
    run = create_run(
        case_id="case-ranking-n1",
        klucz_twin=f"klucz-ranking-n1-{uuid4()}",
        analysis_type="v126:reliability_contingency",
        options={"model": model.model_dump(mode="json")},
    )
    run = execute_run(run.id)
    assert run.status == "FINISHED", run.error_message
    return run


def test_fikstura_zapala_n1_overload_i_brak_obciazalnosci_w_wyniku_surowym() -> None:
    """Kontrola dodatnia fikstury: BEZ wrappera solver naprawdę zwraca klucze
    rankingu — inaczej testy niżej nie dowodziłyby niczego (sprawdzałyby
    nieobecność czegoś, co nigdy by tam nie było)."""
    from network_model.solvers.v126_academic import V126AcademicSolver
    from solver_input.v126_contracts import V126AnalysisType

    surowy = V126AcademicSolver().run(
        V126AnalysisType.RELIABILITY_CONTINGENCY, _model_reliability()
    )["result"]
    assert "contingency_ranking" in surowy
    assert surowy["elementy_bez_obciazalnosci"] == ["L2-bez-obciazalnosci"]
    naruszenia = [v["check"] for v in surowy["sanity"]["violations"]]
    assert "n1_overload" in naruszenia
    assert surowy["sanity"]["status"] == "poza zakresem wiarygodności"
    # N-2: para jedynych dwóch gałęzi fikstury.
    n2 = [c for c in surowy["contingency_ranking"] if c["order"] == "N-2"]
    assert len(n2) == 1


def test_wrapper_jest_czysty_i_deterministyczny() -> None:
    """`bez_rankingu_n1` na tym samym wejściu daje bajtowo ten sam wynik —
    determinizm postprocessu, niezależnie od determinizmu solvera."""
    from network_model.solvers.v126_academic import V126AcademicSolver
    from solver_input.v126_contracts import V126AnalysisType

    surowy = V126AcademicSolver().run(
        V126AnalysisType.RELIABILITY_CONTINGENCY, _model_reliability()
    )["result"]
    a = bez_rankingu_n1(surowy)
    b = bez_rankingu_n1(surowy)
    assert a == b
    # Wejście NIE jest mutowane (funkcja czysta) — surowy wynik zostaje
    # nietknięty dla innych czytelników (np. testu powyżej).
    assert "contingency_ranking" in surowy


def test_wrapper_zdejmuje_klucze_rankingu_i_przelicza_status_wiarygodnosci() -> None:
    from network_model.solvers.v126_academic import V126AcademicSolver
    from solver_input.v126_contracts import V126AnalysisType

    surowy = V126AcademicSolver().run(
        V126AnalysisType.RELIABILITY_CONTINGENCY, _model_reliability()
    )["result"]
    wynik = bez_rankingu_n1(surowy)

    for klucz in _KLUCZE_RANKINGU:
        assert klucz not in wynik, f"{klucz} nie zostało zdjęte"

    naruszenia = [v["check"] for v in wynik["sanity"]["violations"]]
    assert "n1_overload" not in naruszenia
    # Jedyne naruszenie fikstury było n1_overload — po jego zdjęciu status
    # WRACA do "zweryfikowany" (SAIDI/SAIFI fikstury są w granicach fizycznych).
    assert wynik["sanity"]["status"] == "zweryfikowany"

    assert wynik["ranking_n1"] == {
        "status": "NIEPREZENTOWANY",
        "powod_pl": (
            "ranking liczony z prądu gałęzi bez rozpływu (V12.6); ranking "
            "kanoniczny = pełny re-solve"
        ),
        "ekran": "Wyniki › Kontyngencje",
        "trasa": "/api/insights/n-1-contingency",
    }

    # Wskaźniki niezawodności NIETKNIĘTE (JEDYNA implementacja SAIDI/SAIFI).
    assert wynik["indices"] == surowy["indices"]


def test_trzy_konsumenci_api_nie_niosa_kluczy_rankingu() -> None:
    """ILOCZYN CECH: {results, proof, report} × brak kluczy rankingu — bieg
    utworzony przez PRAWDZIWY tor (`create_run`+`execute_run`, ten sam kod co
    API), a trzy odpowiedzi czytane realnym `TestClient`."""
    run = _wstaw_bieg_niezawodnosci()
    with TestClient(app) as client:
        wynik = client.get(f"/api/analysis-runs/{run.id}/results/v126/reliability_contingency")
        dowod = client.get(
            f"/api/analysis-runs/{run.id}/results/v126/reliability_contingency/proof"
        )
        raport = client.get(
            f"/api/analysis-runs/{run.id}/results/v126/reliability_contingency/report"
        )
        slad = client.get(f"/api/analysis-runs/{run.id}/results/v126/reliability_contingency/trace")

    assert wynik.status_code == 200, wynik.text
    assert dowod.status_code == 200, dowod.text
    assert raport.status_code == 200, raport.text
    assert slad.status_code == 200, slad.text

    payload_wyniku = wynik.json()["result"]["result"]
    for klucz in _KLUCZE_RANKINGU:
        assert klucz not in payload_wyniku, f"results: {klucz} nie zostało zdjęte"
    assert payload_wyniku["ranking_n1"]["status"] == "NIEPREZENTOWANY"
    assert payload_wyniku["ranking_n1"]["trasa"] == "/api/insights/n-1-contingency"
    # Wskaźniki niezawodności widoczne bez zmian.
    assert "saidi_min_per_year" in payload_wyniku["indices"]
    assert "saifi_per_year" in payload_wyniku["indices"]
    assert "caidi_min_per_interruption" in payload_wyniku["indices"]
    assert "maifi_per_year" in payload_wyniku["indices"]

    tresc_dowodu = dowod.text
    for klucz in ("contingency_ranking", "elementy_bez_obciazalnosci"):
        assert klucz not in tresc_dowodu, f"proof: {klucz} wyciekł przez trace"

    metryki_raportu = [
        metryka["label"] for sekcja in raport.json()["sections"] for metryka in sekcja["metrics"]
    ]
    for klucz in _KLUCZE_RANKINGU:
        assert not any(
            etykieta.startswith(klucz) for etykieta in metryki_raportu
        ), f"report: {klucz} nie zostało zdjęte z sekcji metryk"
    assert any(etykieta.startswith("ranking_n1") for etykieta in metryki_raportu)

    # `trace` zostaje SUROWY (WHITE BOX solvera nietknięty) — nigdy nie niósł
    # klucza rankingu (jedyny krok śladu `_reliability` to `reliability_indices`
    # z SAIDI/SAIFI), więc test dodatni potwierdza, że krok istnieje.
    klucze_krokow = {krok["key"] for krok in slad.json()["steps"]}
    assert "reliability_indices" in klucze_krokow
    assert "contingency_ranking" not in slad.text


def test_wynik_bez_kontyngencji_przeciazonych_zostaje_zweryfikowany_bez_zmian() -> None:
    """Kontrola dwustronna: sieć BEZ przeciążenia ani braku obciążalności miała
    `sanity.status == "zweryfikowany"` PRZED wrapperem i ma go PO — wrapper nie
    fabrykuje ani nie ukrywa realnego naruszenia spoza rankingu."""
    from network_model.solvers.v126_academic import V126AcademicSolver
    from solver_input.v126_contracts import V126AnalysisType

    model = V126AcademicInput.model_validate(
        {
            "buses": [
                {"ref": "B1", "name": "GPZ", "nominal_kv": 15.0, "customer_count": 100},
                {"ref": "B2", "name": "Stacja", "nominal_kv": 15.0, "customer_count": 50},
            ],
            "branches": [
                {
                    "ref": "L1",
                    "from_bus_ref": "B1",
                    "to_bus_ref": "B2",
                    "kind": "cable",
                    "length_km": 1.0,
                    "ampacity_a": 245.0,
                    "failure_rate_per_year": 0.01,
                    "mttr_h": 3.0,
                },
            ],
        }
    )
    surowy = V126AcademicSolver().run(V126AnalysisType.RELIABILITY_CONTINGENCY, model)["result"]
    assert surowy["sanity"]["status"] == "zweryfikowany"
    wynik = bez_rankingu_n1(surowy)
    assert wynik["sanity"]["status"] == "zweryfikowany"
    assert wynik["sanity"]["violations"] == []
