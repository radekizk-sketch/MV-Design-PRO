from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from domain.analysis_run import (
    AnalysisRun,
    build_analysis_run_case_context,
    build_analysis_run_reproducibility,
    infer_analysis_run_completeness,
)
from infrastructure.persistence.models import AnalysisRunORM
from infrastructure.persistence.time_utils import ensure_utc
from sqlalchemy import select, update
from sqlalchemy.orm import Session


class AnalysisRunRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, run: AnalysisRun) -> None:
        materialized = self._materialize_contract_fields(
            AnalysisRunORM(
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
            ),
            analysis_case_context=run.analysis_case_context or None,
            reproducibility=run.reproducibility or None,
            proof_pack_ref=run.proof_pack_ref,
            completeness_status=run.completeness_status,
            export_artifacts=run.export_artifacts or None,
        )
        self._session.add(
            AnalysisRunORM(
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
                analysis_case_context=materialized["analysis_case_context"],
                reproducibility_json=materialized["reproducibility"],
                proof_pack_ref=materialized["proof_pack_ref"],
                completeness_status=materialized["completeness_status"],
                export_artifacts_json=materialized["export_artifacts"],
                trace_json=run.trace_json,
                white_box_trace=run.white_box_trace,
                error_message=run.error_message,
            )
        )
        self._session.commit()

    def get(self, run_id: UUID) -> AnalysisRun | None:
        stmt = select(AnalysisRunORM).where(AnalysisRunORM.id == run_id)
        row = self._session.execute(stmt).scalar_one_or_none()
        return self._to_domain(row) if row else None

    def list_by_project(
        self, project_id: UUID, filters: dict[str, Any] | None = None
    ) -> list[AnalysisRun]:
        stmt = (
            select(AnalysisRunORM)
            .where(AnalysisRunORM.project_id == project_id)
            .order_by(AnalysisRunORM.created_at.desc(), AnalysisRunORM.id.desc())
        )
        filters = filters or {}
        if analysis_type := filters.get("analysis_type"):
            stmt = stmt.where(AnalysisRunORM.analysis_type == analysis_type)
        if status := filters.get("status"):
            stmt = stmt.where(AnalysisRunORM.status == status)
        if operating_case_id := filters.get("operating_case_id"):
            stmt = stmt.where(AnalysisRunORM.operating_case_id == operating_case_id)
        rows = self._session.execute(stmt).scalars().all()
        return [self._to_domain(row) for row in rows]

    def get_by_deterministic_key(
        self,
        project_id: UUID,
        operating_case_id: UUID,
        analysis_type: str,
        input_hash: str,
    ) -> AnalysisRun | None:
        stmt = (
            select(AnalysisRunORM)
            .where(AnalysisRunORM.project_id == project_id)
            .where(AnalysisRunORM.operating_case_id == operating_case_id)
            .where(AnalysisRunORM.analysis_type == analysis_type)
            .where(AnalysisRunORM.input_hash == input_hash)
        )
        row = self._session.execute(stmt).scalar_one_or_none()
        return self._to_domain(row) if row else None

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

    def mark_results_outdated(self, project_id: UUID, *, commit: bool = True) -> int:
        stmt = (
            update(AnalysisRunORM)
            .where(AnalysisRunORM.project_id == project_id)
            .values(result_status="OUTDATED")
        )
        result = self._session.execute(stmt)
        if commit:
            self._session.commit()
        return int(result.rowcount or 0)

    def mark_results_outdated_for_case(
        self, project_id: UUID, case_id: UUID, *, commit: bool = True
    ) -> int:
        """
        PR-4: Mark all AnalysisRuns for a specific case as OUTDATED.

        Called when case configuration or protection config changes.
        Only invalidates VALID runs bound to this case (via operating_case_id).
        """
        stmt = (
            update(AnalysisRunORM)
            .where(AnalysisRunORM.project_id == project_id)
            .where(AnalysisRunORM.operating_case_id == case_id)
            .where(AnalysisRunORM.result_status == "VALID")
            .values(result_status="OUTDATED")
        )
        result = self._session.execute(stmt)
        if commit:
            self._session.commit()
        return int(result.rowcount or 0)

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
