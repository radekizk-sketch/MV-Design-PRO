"""DOCX-DETERMINIZM-RESZTA: domkniecie klasy niedeterminizmu eksportow DOCX.

Karta naprawcza wykryla dlug zrodlowy w `api/power_flow_comparisons.py`
(meldunek ZAB-100-BACKEND): DOCX budowany inline `Document().save()` bez
przejscia przez `network_model.reporting.docx_determinism` — dwa zapisy w tej
samej sekundzie roznia sie bajtowo (znaczniki czasu wpisow ZIP + docProps/core.xml,
ktorych sam python-docx NIE zeruje).

KLASA, NIE INSTANCJA: przeszukano CALY backend za kazdym miejscem budujacym
DOCX (`python-docx`, `Document(`, `.save(`). Ten modul testuje bit-w-bit
determinizm binarny wszystkich miejsc, ktore NIE mialy jeszcze pokrycia:

- `api/analysis_run_exports.py::export_run_docx_response` (bundle rozplywu mocy)
- `api/analysis_run_exports.py::export_run_report_docx_response` (raport analizy)
- `api/power_flow_comparisons.py::export_power_flow_comparison_docx` (endpoint HTTP)
- `api/power_flow_runs.py::export_power_flow_run_docx` (endpoint HTTP)
- `api/reference_patterns.py::export_pattern_result_docx` (endpoint HTTP)

(`network_model/reporting/proof_inspector/exporters.py::InspectorExporter.export_docx`
ma wlasny test w `tests/proof_engine/test_inspector.py`; miejsca w
`analysis/reporting/arc_flash_report.py` i `analysis/reporting/audit2_report.py`
maja wlasne testy w `tests/analysis/reporting/`.)

Odstep >2s MIEDZY wywolaniami jest CELOWY, nie kosmetyczny: DOCX jest ZIP-em,
a `zipfile` znakuje kazdy wpis biezacym czasem lokalnym w formacie DOS, ktory
ma rozdzielczosc DWOCH SEKUND (pole sekund koduje wartosc/2) — dwa wywolania
oddalone o <=2s moga trafic w TEN SAM znacznik nawet bez normalizacji, co
dawaloby falszywa zielen (lekcja karty ZAB-100-BACKEND, iniekcja I2 —
zweryfikowane empirycznie: `deterministic=False` w warstwie API przechodzil
test bez odstepu czasowego). Ziarnistosc 2s zamiast zakladanej 1s zostala
odkryta empirycznie w tej karcie: odstep 1.1s dawal falszywa zielen w ok. 30%
powtorzen (mierzone bezposrednia iniekcja na `arc_flash_report.py`).
"""

from __future__ import annotations

import dataclasses
import hashlib
import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.api.test_analysis_run_report_exports import _build_pf_run
from tests.test_canonical_analysis_api import (
    _nowy_przypadek,
    _reset_backend_state,
    _seed_power_flow_enm,
)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# =============================================================================
# api/analysis_run_exports.py — 2 miejsca budowy DOCX (funkcje wywolywane
# bezposrednio na CanonicalRun, bez HTTP)
# =============================================================================


class TestAnalysisRunExportsDocxDeterminism:
    def test_export_run_docx_response_is_byte_deterministic(self) -> None:
        """`export_run_docx_response` (bundle rozplywu mocy) — 2x eksport
        z odstepem >2s -> identyczne bajty."""
        from api.analysis_run_exports import export_run_docx_response

        # `power_flow_trace` musi byc jawnie ustawiony (nie None) — wymagany
        # przez `get_power_flow_trace` w budowie bundle (`_build_pf_run` go
        # nie ustawia, bo domyslny sciezka testowa idzie przez raport, nie
        # przez bundle).
        run = dataclasses.replace(_build_pf_run(), power_flow_trace={})

        first = export_run_docx_response(run, filename_stem="power_flow")
        time.sleep(2.1)
        second = export_run_docx_response(run, filename_stem="power_flow")

        assert first.body[:2] == b"PK", "DOCX powinien byc plikiem ZIP"
        hash_1 = _sha256(first.body)
        hash_2 = _sha256(second.body)
        assert hash_1 == hash_2, (
            f"export_run_docx_response nie deterministyczny\n" f"Hash 1: {hash_1}\nHash 2: {hash_2}"
        )

    def test_export_run_report_docx_response_is_byte_deterministic(self) -> None:
        """`export_run_report_docx_response` (raport analizy) — 2x eksport
        z odstepem >2s -> identyczne bajty."""
        from api.analysis_run_exports import export_run_report_docx_response

        run = _build_pf_run()

        first = export_run_report_docx_response(run, filename_stem="raport")
        time.sleep(2.1)
        second = export_run_report_docx_response(run, filename_stem="raport")

        assert first.body[:2] == b"PK", "DOCX powinien byc plikiem ZIP"
        hash_1 = _sha256(first.body)
        hash_2 = _sha256(second.body)
        assert hash_1 == hash_2, (
            f"export_run_report_docx_response nie deterministyczny\n"
            f"Hash 1: {hash_1}\nHash 2: {hash_2}"
        )


# =============================================================================
# api/power_flow_comparisons.py — dlug zrodlowy karty (endpoint HTTP)
# =============================================================================


class _FakeComparisonResult:
    """Minimalny stub wyniku porownania — tyle pol, ile czyta budowniczy DOCX."""

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_a_id": "11111111-1111-1111-1111-111111111111",
            "run_b_id": "22222222-2222-2222-2222-222222222222",
            "summary": {
                "total_buses": 2,
                "total_branches": 1,
                "converged_a": True,
                "converged_b": True,
                "delta_total_losses_p_mw": 0.0123,
                "max_delta_v_pu": 0.0034,
                "total_issues": 1,
                "critical_issues": 0,
                "major_issues": 1,
            },
            "ranking": [
                {
                    "severity": 4,
                    "issue_code": "V_DROP_DELTA",
                    "element_ref": "bus-load",
                    "description_pl": "Zmiana spadku napiecia miedzy przebiegami",
                }
            ],
        }


class _FakeComparisonService:
    def get_comparison(self, comparison_id: str) -> _FakeComparisonResult:
        return _FakeComparisonResult()


def test_power_flow_comparison_export_docx_is_byte_deterministic(app_client, monkeypatch) -> None:
    """DLUG ZRODLOWY (ZAB-100-BACKEND): `export_power_flow_comparison_docx`
    budowal DOCX inline BEZ `docx_determinism.make_docx_bytes_deterministic`.
    2x eksport z odstepem >2s musi dawac identyczne bajty."""
    from api import power_flow_comparisons as power_flow_comparisons_api

    monkeypatch.setattr(
        power_flow_comparisons_api,
        "_build_service",
        lambda uow_factory: _FakeComparisonService(),
    )

    comparison_id = "cmp-deterministic-test"

    first = app_client.get(f"/api/power-flow-comparisons/{comparison_id}/export/docx")
    time.sleep(2.1)
    second = app_client.get(f"/api/power-flow-comparisons/{comparison_id}/export/docx")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.content[:2] == b"PK", "DOCX powinien byc plikiem ZIP"
    hash_1 = _sha256(first.content)
    hash_2 = _sha256(second.content)
    assert hash_1 == hash_2, (
        f"Eksport DOCX porownania rozplywu mocy nie deterministyczny\n"
        f"Hash 1: {hash_1}\nHash 2: {hash_2}"
    )


# =============================================================================
# api/power_flow_runs.py (endpoint HTTP)
# =============================================================================


@pytest.fixture
def canonical_client() -> TestClient:
    from api.main import app

    _reset_backend_state()
    with TestClient(app) as test_client:
        yield test_client


def test_power_flow_run_export_docx_endpoint_is_byte_deterministic(
    canonical_client: TestClient,
) -> None:
    """`api/power_flow_runs.py::export_power_flow_run_docx` — 2x eksport
    tego samego biegu z odstepem >2s -> identyczne bajty."""
    case_id = _nowy_przypadek(canonical_client)
    _seed_power_flow_enm(canonical_client, case_id)

    # K5.1 (CV-4.3-A4): `POST /api/cases/{id}/runs/power-flow` skasowany procedurą
    # siedmiu kroków — bieg powstaje odtąd torem kanonicznym (ta sama fizyka,
    # inny klucz identyfikatora: `id`, nie `run_id`).
    created_response = canonical_client.post(
        f"/api/execution/study-cases/{case_id}/runs",
        json={"analysis_type": "LOAD_FLOW", "solver_input": {}},
    )
    assert created_response.status_code == 201, created_response.text
    run_id = created_response.json()["id"]
    executed_response = canonical_client.post(f"/api/execution/runs/{run_id}/execute")
    assert executed_response.status_code == 200, executed_response.text

    first = canonical_client.get(f"/api/power-flow-runs/{run_id}/export/docx")
    time.sleep(2.1)
    second = canonical_client.get(f"/api/power-flow-runs/{run_id}/export/docx")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.content[:2] == b"PK", "DOCX powinien byc plikiem ZIP"
    hash_1 = _sha256(first.content)
    hash_2 = _sha256(second.content)
    assert hash_1 == hash_2, (
        f"Eksport DOCX power-flow-runs nie deterministyczny\n" f"Hash 1: {hash_1}\nHash 2: {hash_2}"
    )


# =============================================================================
# api/reference_patterns.py (endpoint HTTP)
# =============================================================================


def test_reference_pattern_export_docx_endpoint_is_byte_deterministic() -> None:
    """`api/reference_patterns.py::export_pattern_result_docx` — 2x eksport
    tego samego wzorca z odstepem >2s -> identyczne bajty."""
    from api.main import app

    client = TestClient(app)
    fixture_file = "case_A_zgodne.json"

    first = client.get(f"/api/reference-patterns/fixtures/{fixture_file}/export/docx")
    time.sleep(2.1)
    second = client.get(f"/api/reference-patterns/fixtures/{fixture_file}/export/docx")

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.content[:2] == b"PK", "DOCX powinien byc plikiem ZIP"
    hash_1 = _sha256(first.content)
    hash_2 = _sha256(second.content)
    assert hash_1 == hash_2, (
        f"Eksport DOCX wzorca odniesienia nie deterministyczny\n"
        f"Hash 1: {hash_1}\nHash 2: {hash_2}"
    )
