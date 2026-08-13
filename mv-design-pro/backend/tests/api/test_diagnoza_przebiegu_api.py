"""Testy tras diagnostyki i diagnozy przebiegu (karta DIAGNOZA-PRZEBIEGU, D7).

DLACZEGO TEN PLIK ISTNIEJE. Moduł `api/diagnostics.py` nie miał ANI JEDNEGO
testu trasy (istniały wyłącznie testy silnika i diff-a), więc przez cały czas
życia kodu nikt nie zauważył, że wszystkie jego końcówki są martwe: model
przypadku rozwiązywano metodami repozytoriów, które nie istnieją, a
`AttributeError` połykał `except Exception` i zamieniał go na 404. Testy niżej
idą REALNĄ ścieżką produkcyjną (golden ENM → create_run/execute_run → HTTP),
więc powtórka tamtego defektu (dowolna zmiana źródła modelu na nieistniejące
API) natychmiast je czerwieni.

Iloczyn cech pokrycia (reguła KLASA, NIE INSTANCJA): trasa (diagnostyka /
pre-flight / diagnoza biegu) × rodzaj analizy (iteracyjny PF / nieiteracyjne
zwarcie) × stan biegu (zbieżny / niezbieżny przez limit iteracji / nieistniejący)
× determinizm (dwa wywołania identyczne).
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from enm.canonical_analysis import create_run, execute_run, reset_canonical_runs
from enm.store import reset_enm_store, set_enm

from tests.cgmes.golden_enm import build_golden_enm

DIAGNOSTYKA = "/api/cases/{case_id}/diagnostics"
PREFLIGHT = "/api/cases/{case_id}/diagnostics/preflight"
DIAGNOZA_BIEGU = "/api/execution/runs/{run_id}/diagnostics"


@pytest.fixture(autouse=True)
def _reset() -> None:
    reset_canonical_runs()
    reset_enm_store()
    yield
    reset_canonical_runs()
    reset_enm_store()


def _bieg_pf(case_id: str = "c-pf", **opcje):
    """Zbieżny bieg rozpływu na sieci golden — realna ścieżka produkcyjna."""
    set_enm(case_id, build_golden_enm())
    run = create_run(case_id=case_id, analysis_type="PF", options=opcje or None)
    return execute_run(run.id)


def _bieg_zwarciowy(case_id: str = "c-sc"):
    set_enm(case_id, build_golden_enm())
    return execute_run(create_run(case_id=case_id, analysis_type="short_circuit_sn").id)


# ---------------------------------------------------------------------------
# Trasy diagnostyki modelu — pin przeciwko martwemu odczytowi
# ---------------------------------------------------------------------------


def test_diagnostyka_modelu_zwraca_raport_dla_istniejacego_przypadku(app_client):
    """Trasa diagnostyki ODPOWIADA danymi (przed naprawą: zawsze 404)."""
    set_enm("c-diag", build_golden_enm())

    odpowiedz = app_client.get(DIAGNOSTYKA.format(case_id="c-diag"))

    assert odpowiedz.status_code == 200, odpowiedz.text
    ciało = odpowiedz.json()
    assert ciało["status"] in ("OK", "WARN", "FAIL")
    assert isinstance(ciało["issues"], list)
    assert isinstance(ciało["analysis_matrix"]["entries"], list)
    assert ciało["analysis_matrix"]["entries"], "macierz analiz nie może być pusta"


def test_preflight_zwraca_tabele_analiz_dla_istniejacego_przypadku(app_client):
    """Trasa pre-flight ODPOWIADA danymi (przed naprawą: zawsze 404)."""
    set_enm("c-pre", build_golden_enm())

    odpowiedz = app_client.get(PREFLIGHT.format(case_id="c-pre"))

    assert odpowiedz.status_code == 200, odpowiedz.text
    ciało = odpowiedz.json()
    assert isinstance(ciało["ready"], bool)
    assert ciało["overall_status"] in ("OK", "WARN", "FAIL")
    kontrole = ciało["checks"]
    assert kontrole, "pre-flight bez kontroli byłby pustym ekranem"
    for kontrola in kontrole:
        assert kontrola["analysis_type"]
        assert kontrola["analysis_label_pl"]
        assert kontrola["status"] in ("AVAILABLE", "BLOCKED")
        assert isinstance(kontrola["blocking_codes"], list)


def test_diagnostyka_i_preflight_opisuja_ten_sam_model_co_bieg(app_client):
    """Diagnostyka bierze model tą samą funkcją co tworzenie biegu.

    Gdyby źródło modelu się rozjechało (dwie ścieżki tej samej prawdy), macierz
    analiz opisywałaby inną sieć niż ta policzona — pin trzyma je razem.
    """
    bieg = _bieg_pf("c-spojnosc")

    diagnostyka = app_client.get(DIAGNOSTYKA.format(case_id="c-spojnosc"))
    assert diagnostyka.status_code == 200, diagnostyka.text

    diagnoza = app_client.get(DIAGNOZA_BIEGU.format(run_id=bieg.id))
    assert diagnoza.status_code == 200, diagnoza.text
    assert diagnoza.json()["case_id"] == "c-spojnosc"


def test_diagnostyka_nieznanego_przypadku_nie_wywraca_trasy(app_client):
    """Nieznany przypadek = model domyślny (pusty), nie błąd serwera."""
    odpowiedz = app_client.get(DIAGNOSTYKA.format(case_id="c-nieznany"))

    assert odpowiedz.status_code == 200, odpowiedz.text
    assert odpowiedz.json()["status"] in ("OK", "WARN", "FAIL")


# ---------------------------------------------------------------------------
# Diagnoza przebiegu — bieg zbieżny
# ---------------------------------------------------------------------------


def test_diagnoza_biegu_zbieznego_niesie_dowod_liczbowy(app_client):
    bieg = _bieg_pf("c-zb")

    odpowiedz = app_client.get(DIAGNOZA_BIEGU.format(run_id=bieg.id))

    assert odpowiedz.status_code == 200, odpowiedz.text
    ciało = odpowiedz.json()
    assert ciało["code"] == "PRZ-ZBIEZNY"
    assert ciało["converged"] is True
    assert ciało["iterative"] is True
    assert ciało["run_status"] == "DONE"
    assert ciało["analysis_type"] == "PF"
    assert ciało["iterations_count"] is not None and ciało["iterations_count"] >= 1
    assert ciało["max_iterations"] is not None and ciało["max_iterations"] >= 1
    assert ciało["tolerance"] is not None and ciało["tolerance"] > 0
    assert ciało["unsolved_node_ids"] == []
    assert ciało["error_message"] is None
    assert ciało["iteration_history"], "ślad iteracji jest dowodem WHITE BOX"
    for wpis in ciało["iteration_history"]:
        assert wpis["iteracja"] >= 1
        assert wpis["niedopasowanie_pu"] is not None


def test_diagnoza_biegu_jest_deterministyczna(app_client):
    bieg = _bieg_pf("c-det")
    trasa = DIAGNOZA_BIEGU.format(run_id=bieg.id)

    pierwsza = app_client.get(trasa)
    druga = app_client.get(trasa)

    assert pierwsza.status_code == 200
    assert druga.status_code == 200
    assert pierwsza.json() == druga.json()


# ---------------------------------------------------------------------------
# Diagnoza przebiegu — brak zbieżności (limit iteracji)
# ---------------------------------------------------------------------------


def test_diagnoza_biegu_bez_zbieznosci_wskazuje_limit_iteracji(app_client):
    """Limit iteracji ścięty do jednej — solver melduje brak zbieżności.

    To JEDYNY przypadek w tym pliku, w którym bieg celowo nie zbiega; opcja
    `max_iterations` jest realnym parametrem solvera (`canonical_analysis.py`
    czyta ją z `run.options`), więc ścieżka pozostaje produkcyjna.
    """
    bieg = _bieg_pf("c-nzb", max_iterations=1)

    odpowiedz = app_client.get(DIAGNOZA_BIEGU.format(run_id=bieg.id))

    assert odpowiedz.status_code == 200, odpowiedz.text
    ciało = odpowiedz.json()
    assert ciało["converged"] is False
    assert ciało["code"] == "PRZ-NIEZBIEZNY-LIMIT"
    assert ciało["cause_if_failed"] == "max_iter"
    assert ciało["max_iterations"] == 1
    assert ciało["final_mismatch_pu"] is not None
    assert "solver_non_convergence" in ciało["reporting_limitations"]
    assert ciało["quality_status"] == "failed"


# ---------------------------------------------------------------------------
# Diagnoza przebiegu — analiza nieiteracyjna i braki
# ---------------------------------------------------------------------------


def test_diagnoza_biegu_zwarciowego_melduje_brak_pojecia_zbieznosci(app_client):
    """Zwarcie wg IEC 60909 liczy się wprost — zbieżność nie występuje."""
    bieg = _bieg_zwarciowy("c-zwar")

    odpowiedz = app_client.get(DIAGNOZA_BIEGU.format(run_id=bieg.id))

    assert odpowiedz.status_code == 200, odpowiedz.text
    ciało = odpowiedz.json()
    assert ciało["code"] == "PRZ-BEZ-ITERACJI"
    assert ciało["iterative"] is False
    assert ciało["converged"] is None
    assert ciało["iteration_history"] == []


def test_diagnoza_nieistniejacego_biegu_zwraca_404(app_client):
    odpowiedz = app_client.get(DIAGNOZA_BIEGU.format(run_id=uuid4()))

    assert odpowiedz.status_code == 404


def test_diagnoza_biegu_wystawia_zamkniety_zestaw_pol(app_client):
    """Kontrakt trasy przypięty polami — adapter UI konsumuje podzbiór tego."""
    bieg = _bieg_pf("c-pola")

    ciało = app_client.get(DIAGNOZA_BIEGU.format(run_id=bieg.id)).json()

    assert set(ciało) == {
        "run_id",
        "case_id",
        "analysis_type",
        "run_status",
        "iterative",
        "code",
        "converged",
        "iterations_count",
        "max_iterations",
        "tolerance",
        "final_mismatch_pu",
        "cause_if_failed",
        "unsolved_node_ids",
        "reporting_limitations",
        "quality_status",
        "error_message",
        "iteration_history",
    }


# ---------------------------------------------------------------------------
# Porównanie rewizji ENM — trzecia trasa tego samego modułu
# ---------------------------------------------------------------------------
#
# Ta trasa cierpiała na TĘ SAMĄ klasę defektu co dwie powyższe: wołała
# `uow.snapshots.get(...)`, metodę, której repozytorium nie ma (jest
# `get_snapshot`). Naprawa bez testu byłaby fałszywą pewnością — inwentarz
# klasy obejmuje WSZYSTKIE trzy trasy modułu, więc pin też.


def _snapshot_dwoch_szyn(snapshot_id: str, *, napiecie_kv: float):
    from network_model.core.graph import NetworkGraph
    from network_model.core.node import Node, NodeType
    from network_model.core.snapshot import create_network_snapshot

    graf = NetworkGraph(network_model_id="model-diff")
    graf.add_node(
        Node(
            id="bus-1",
            name="Szyna A",
            node_type=NodeType.SLACK,
            voltage_level=napiecie_kv,
            voltage_magnitude=1.0,
            voltage_angle=0.0,
        )
    )
    return create_network_snapshot(graf, snapshot_id=snapshot_id)


def test_porownanie_rewizji_enm_zwraca_zmiany(app_client, uow_factory):
    """Trasa diff ODPOWIADA danymi (przed naprawą: zawsze 500)."""
    with uow_factory() as uow:
        uow.snapshots.add_snapshot(_snapshot_dwoch_szyn("snap-a", napiecie_kv=110.0))
        uow.snapshots.add_snapshot(_snapshot_dwoch_szyn("snap-b", napiecie_kv=15.0))

    odpowiedz = app_client.get("/api/cases/c-diff/enm/diff?from=snap-a&to=snap-b")

    assert odpowiedz.status_code == 200, odpowiedz.text
    ciało = odpowiedz.json()
    assert ciało["is_identical"] is False
    assert ciało["changes"], "zmiana napięcia szyny musi być widoczna w porównaniu"


def test_porownanie_rewizji_enm_melduje_brak_snapshotu(app_client):
    """Nieznana rewizja to uczciwe 404, nie błąd serwera."""
    odpowiedz = app_client.get("/api/cases/c-diff/enm/diff?from=nie-ma&to=tez-nie-ma")

    assert odpowiedz.status_code == 404
