"""Biegi LEGACY (`AnalysisRun`) — kiedy wynik wolno pokazac (tor P2–P12, kasacja CV-4).

CO SIE Z TYM PLIKIEM STALO (CV-2-W). Do tej karty plik mieszal DWA byty: legacy
bieg `AnalysisRun` (slownik VALID/OUTDATED, kolumna `analysis_runs.result_status`)
i PRZYPADEK obliczeniowy (`StudyCase.result_status`). Czesc przypadkowa zostala
usunieta razem z mechanizmem: status wynikow przypadku jest odtad WYPROWADZANY z
jego biegow kanonicznych i koperty rewizji, a nie zapisywany, wiec „testy przejsc”
(`mark_as_fresh` → `mark_as_outdated`) sprawdzalyby wylacznie to, ze setter
ustawia to, co ustawil. INTENCJA („wynik policzony przed zmiana modelu nie moze
udawac aktualnego”) zyje dalej, ale na REALNEJ sciezce HTTP:
`tests/api/test_status_wynikow_przypadku.py`.

Zostaje tu wylacznie predykat legacy biegu (`AnalysisRun.results_valid`), bo ten
byt i jego kolumna nadal istnieja — do kasacji razem z torem P2–P12 w CV-4.
"""

from __future__ import annotations

from uuid import uuid4

from domain.analysis_run import AnalysisRun


def _bieg(*, status: str, result_status: str, **reszta) -> AnalysisRun:
    return AnalysisRun(
        id=uuid4(),
        project_id=uuid4(),
        operating_case_id=uuid4(),
        analysis_type="short_circuit_sn",
        status=status,
        result_status=result_status,
        input_snapshot={"test": True},
        input_hash="hash",
        **reszta,
    )


class TestLegacyAnalysisRunResultsValid:
    """INWARIANT: wynik legacy biegu wolno pokazac WYLACZNIE, gdy bieg jest
    zakonczony (`FINISHED`) i jego wynik nie zostal uniewazniony (`VALID`)."""

    def test_zakonczony_i_wazny_bieg_pozwala_na_odczyt(self):
        bieg = _bieg(status="FINISHED", result_status="VALID", result_summary={"ikss_a": 12345.0})
        assert bieg.results_valid is True

    def test_uniewazniony_bieg_blokuje_odczyt(self):
        bieg = _bieg(
            status="FINISHED", result_status="OUTDATED", result_summary={"ikss_a": 12345.0}
        )
        assert bieg.results_valid is False

    def test_bieg_utworzony_ale_nieliczony_blokuje_odczyt(self):
        bieg = _bieg(status="CREATED", result_status="VALID")
        assert bieg.results_valid is False

    def test_bieg_nieudany_blokuje_odczyt(self):
        bieg = _bieg(status="FAILED", result_status="VALID", error_message="Validation failed")
        assert bieg.results_valid is False

    def test_bieg_w_trakcie_blokuje_odczyt(self):
        bieg = _bieg(status="RUNNING", result_status="VALID")
        assert bieg.results_valid is False
