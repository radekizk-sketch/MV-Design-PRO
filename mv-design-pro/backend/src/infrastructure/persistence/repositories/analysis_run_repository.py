"""Repozytorium biegow LEGACY (`analysis_runs`) — DANE ZASTANE, bez pisarza produkcyjnego.

CO STAD ZNIKNELO I DLACZEGO (karta KASACJA-UNIEWAZNIACZA, 2026-09-17). Cztery
metody odczytu/kaskady straciły ostatniego wolajacego i zostaly skasowane razem
z `application/analysis_run/result_invalidator.py`:
`mark_results_outdated` (jedyny wolajacy: skasowany modul uniewazniacza), `get`,
`list_by_project` i `get_by_deterministic_key` (0 wolajacych w `backend/src` i w
`backend/tests` — pomiar grepem PRZED kasacja; martwe juz przed ta karta, ta
sama klasa defektu w tym samym pliku, wiec zeszly razem). Bramka wskrzeszenia:
`scripts/legacy_public_path_guard.py::check_uniewazniacz_resurrection`.

DLACZEGO PLIK ZOSTAJE. Tabela `analysis_runs` ma ZYWEGO konsumenta produkcyjnego
— `infrastructure/persistence/repositories/project_repository.py::has_dependencies`
liczy w niej wiersze projektu — wiec wiersze zastane trzeba umiec zapisac w
tescie, ktory dowodzi, ze kanoniczne routery ich NIE pokazuja
(`tests/test_production_canonical_only_api.py`, `tests/api/test_proof_pack_api.py`).
Pisarza produkcyjnego ten rejestr nie ma i miec nie bedzie.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from domain.analysis_run import (
    AnalysisRun,
    build_analysis_run_case_context,
    build_analysis_run_reproducibility,
    infer_analysis_run_completeness,
)
from infrastructure.persistence.models import AnalysisRunORM
from infrastructure.persistence.time_utils import ensure_utc
from sqlalchemy import select
from sqlalchemy.orm import Session


class AnalysisRunRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, run: AnalysisRun) -> None:
        """Zapis wiersza biegu legacy — JEDNA konstrukcja wiersza, nie dwie.

        Bylo tu DWA niezalezne wyliczenia tego samego wiersza (19 pol kazde):
        pierwsze szlo do `_materialize_contract_fields`, drugie — osobno
        przepisane — do `session.add`. Dwie listy pol, ktore „dzis sie zgadzaja",
        to defekt czekajacy na rozjazd: dodanie pola tylko w jednej z nich
        materializowaloby kontrakt z INNEGO wiersza niz zapisany. Teraz wiersz
        powstaje RAZ, a materializacja nadpisuje na nim 5 pol kontraktu.
        """
        row = AnalysisRunORM(
            id=run.id,
            project_id=run.project_id,
            operating_case_id=run.operating_case_id,
            analysis_type=run.analysis_type,
            status=run.status,
            result_status=run.result_status,
            created_at=ensure_utc(run.created_at),
            started_at=ensure_utc(run.started_at),
            finished_at=ensure_utc(run.finished_at),
            input_snapshot=run.input_snapshot,
            input_hash=run.input_hash,
            result_summary=run.result_summary,
            analysis_case_context=run.analysis_case_context,
            reproducibility_json=run.reproducibility,
            proof_pack_ref=run.proof_pack_ref,
            completeness_status=run.completeness_status,
            export_artifacts_json=run.export_artifacts,
            trace_json=run.trace_json,
            white_box_trace=run.white_box_trace,
            error_message=run.error_message,
        )
        materialized = self._materialize_contract_fields(
            row,
            analysis_case_context=run.analysis_case_context or None,
            reproducibility=run.reproducibility or None,
            proof_pack_ref=run.proof_pack_ref,
            completeness_status=run.completeness_status,
            export_artifacts=run.export_artifacts or None,
        )
        row.analysis_case_context = materialized["analysis_case_context"]
        row.reproducibility_json = materialized["reproducibility"]
        row.proof_pack_ref = materialized["proof_pack_ref"]
        row.completeness_status = materialized["completeness_status"]
        row.export_artifacts_json = materialized["export_artifacts"]
        self._session.add(row)
        self._session.commit()

    def update_status(
        self,
        run_id: UUID,
        status: str,
        *,
        started_at: datetime | None = None,
        finished_at: datetime | None = None,
        error_message: str | None = None,
        result_summary: dict | None = None,
        analysis_case_context: dict | None = None,
        reproducibility: dict | None = None,
        proof_pack_ref: str | None = None,
        completeness_status: str | None = None,
        export_artifacts: list[dict] | None = None,
        trace_json: dict | list | None = None,
        white_box_trace: list[dict] | None = None,
    ) -> AnalysisRun:
        stmt = select(AnalysisRunORM).where(AnalysisRunORM.id == run_id)
        row = self._session.execute(stmt).scalar_one()
        row.status = status
        if started_at is not None:
            row.started_at = ensure_utc(started_at)
        if finished_at is not None:
            row.finished_at = ensure_utc(finished_at)
        if error_message is not None or status == "FAILED":
            row.error_message = error_message
        if result_summary is not None:
            row.result_summary = result_summary
        if analysis_case_context is not None:
            row.analysis_case_context = analysis_case_context
        if reproducibility is not None:
            row.reproducibility_json = reproducibility
        if proof_pack_ref is not None:
            row.proof_pack_ref = proof_pack_ref
        if completeness_status is not None:
            row.completeness_status = completeness_status
        if export_artifacts is not None:
            row.export_artifacts_json = export_artifacts
        if trace_json is not None:
            row.trace_json = trace_json
        if white_box_trace is not None:
            row.white_box_trace = white_box_trace
        materialized = self._materialize_contract_fields(
            row,
            analysis_case_context=analysis_case_context,
            reproducibility=reproducibility,
            proof_pack_ref=proof_pack_ref,
            completeness_status=completeness_status,
            export_artifacts=export_artifacts,
        )
        row.analysis_case_context = materialized["analysis_case_context"]
        row.reproducibility_json = materialized["reproducibility"]
        row.proof_pack_ref = materialized["proof_pack_ref"]
        row.completeness_status = materialized["completeness_status"]
        row.export_artifacts_json = materialized["export_artifacts"]
        self._session.commit()
        return self._to_domain(row)

    def _to_domain(self, row: AnalysisRunORM) -> AnalysisRun:
        return AnalysisRun(
            id=row.id,
            project_id=row.project_id,
            operating_case_id=row.operating_case_id,
            analysis_type=row.analysis_type,
            status=row.status,
            result_status=row.result_status,
            created_at=ensure_utc(row.created_at),
            started_at=ensure_utc(row.started_at),
            finished_at=ensure_utc(row.finished_at),
            input_snapshot=row.input_snapshot,
            input_hash=row.input_hash,
            result_summary=row.result_summary,
            analysis_case_context=row.analysis_case_context or {},
            reproducibility=row.reproducibility_json or {},
            proof_pack_ref=row.proof_pack_ref,
            completeness_status=row.completeness_status,
            export_artifacts=row.export_artifacts_json or [],
            trace_json=row.trace_json,
            white_box_trace=row.white_box_trace,
            error_message=row.error_message,
        )

    def _materialize_contract_fields(
        self,
        row: AnalysisRunORM,
        *,
        analysis_case_context: dict | None = None,
        reproducibility: dict | None = None,
        proof_pack_ref: str | None = None,
        completeness_status: str | None = None,
        export_artifacts: list[dict] | None = None,
    ) -> dict[str, object]:
        draft = AnalysisRun(
            id=row.id,
            project_id=row.project_id,
            operating_case_id=row.operating_case_id,
            analysis_type=row.analysis_type,
            status=row.status,
            result_status=row.result_status,
            created_at=ensure_utc(row.created_at),
            started_at=ensure_utc(row.started_at),
            finished_at=ensure_utc(row.finished_at),
            input_snapshot=row.input_snapshot,
            input_hash=row.input_hash,
            result_summary=row.result_summary,
            trace_json=row.trace_json,
            white_box_trace=row.white_box_trace,
            error_message=row.error_message,
            analysis_case_context=row.analysis_case_context or {},
            reproducibility=row.reproducibility_json or {},
            proof_pack_ref=row.proof_pack_ref,
            completeness_status=row.completeness_status,
            export_artifacts=row.export_artifacts_json or [],
        )
        resolved_completeness_status = completeness_status or infer_analysis_run_completeness(draft)
        resolved_proof_pack_ref = proof_pack_ref or draft.proof_pack_ref or f"proof-pack:{draft.id}"
        resolved_reproducibility = (
            reproducibility
            or draft.reproducibility
            or build_analysis_run_reproducibility(
                AnalysisRun(
                    **{
                        **draft.__dict__,
                        "completeness_status": resolved_completeness_status,
                        "proof_pack_ref": resolved_proof_pack_ref,
                    }
                )
            )
        )
        resolved_analysis_case_context = (
            analysis_case_context
            or draft.analysis_case_context
            or build_analysis_run_case_context(
                AnalysisRun(
                    **{
                        **draft.__dict__,
                        "completeness_status": resolved_completeness_status,
                        "proof_pack_ref": resolved_proof_pack_ref,
                        "reproducibility": resolved_reproducibility,
                    }
                )
            )
        )
        return {
            "analysis_case_context": resolved_analysis_case_context,
            "reproducibility": resolved_reproducibility,
            "proof_pack_ref": resolved_proof_pack_ref,
            "completeness_status": resolved_completeness_status,
            "export_artifacts": list(
                export_artifacts if export_artifacts is not None else (draft.export_artifacts or [])
            ),
        }
