"""
Protection Analysis Service — P15a FOUNDATION

Orchestrates protection analysis runs:
1. CREATE: Validate inputs, build canonical snapshot, compute hash
2. EXECUTE: Run evaluation engine, store results
3. CACHE: Return existing run if input_hash matches (determinism)

INVARIANTS:
- Zero physics calculations (only interprets SC results)
- Deterministic: same inputs → same run_id (via input_hash)
- Auditable: every run has full trace
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from application.protection_analysis.engine import (
    ProtectionEvaluationEngine,
    ProtectionEvaluationInput,
    build_device_from_template,
    build_fault_from_sc_result,
)
from domain.protection_analysis import (
    ProtectionAnalysisRun,
    ProtectionResult,
    ProtectionRunStatus,
    ProtectionTrace,
    new_protection_analysis_run,
)
from domain.study_case import StudyCase
from infrastructure.persistence.unit_of_work import UnitOfWork
from network_model.catalog.types import (
    ProtectionCurve,
    ProtectionDeviceType,
    ProtectionSettingTemplate,
)

# =============================================================================
# CANONICAL JSON UTILITIES
# =============================================================================


def canonicalize(value: Any) -> Any:
    """
    Recursively canonicalize a value for deterministic hashing.
    """
    if isinstance(value, dict):
        return {key: canonicalize(value[key]) for key in sorted(value.keys())}
    if isinstance(value, list):
        return [canonicalize(item) for item in value]
    return value


def compute_input_hash(snapshot: dict) -> str:
    """
    Compute SHA-256 hash of canonical input snapshot.
    """
    canonical = canonicalize(snapshot)
    payload = json.dumps(canonical, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


# =============================================================================
# PROTECTION ANALYSIS SERVICE
# =============================================================================


class ProtectionAnalysisService:
    """
    Service for creating and executing protection analysis runs.
    """

    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory
        self._engine = ProtectionEvaluationEngine()

    def create_run(
        self,
        project_id: UUID,
        sc_run_id: str,
        protection_case_id: UUID,
    ) -> ProtectionAnalysisRun:
        """
        Create a new protection analysis run.

        Args:
            project_id: Project ID
            sc_run_id: Source short-circuit run ID (must be FINISHED)
            protection_case_id: Study case ID with ProtectionConfig

        Returns:
            ProtectionAnalysisRun in CREATED status

        Raises:
            ValueError: If SC run not found, not FINISHED, or case not found
        """
        with self._uow_factory() as uow:
            # Validate SC run exists and is FINISHED
            sc_run_data = self._get_sc_run_data(uow, sc_run_id)
            if sc_run_data is None:
                raise ValueError(f"Short-circuit run '{sc_run_id}' not found")
            if sc_run_data.get("status") != "FINISHED":
                raise ValueError(f"Short-circuit run '{sc_run_id}' is not FINISHED")

            # Validate case exists
            case = uow.cases.get_study_case(protection_case_id)
            if case is None:
                raise ValueError(f"Study case '{protection_case_id}' not found")
            if case.project_id != project_id:
                raise ValueError(f"Study case '{protection_case_id}' does not belong to project")

            # Validate protection config
            protection_config = case.protection_config
            if protection_config.template_ref is None:
                raise ValueError("Protection config has no template_ref")

            # Build input snapshot
            snapshot = self._build_input_snapshot(
                sc_run_id=sc_run_id,
                sc_run_data=sc_run_data,
                case=case,
            )
            input_hash = compute_input_hash(snapshot)

            # Check for existing run with same input_hash (cache)
            existing_run = self._get_existing_run(uow, project_id, input_hash)
            if existing_run is not None:
                return existing_run

            # Create new run
            run = new_protection_analysis_run(
                project_id=project_id,
                sc_run_id=sc_run_id,
                protection_case_id=protection_case_id,
                input_snapshot=snapshot,
                input_hash=input_hash,
            )

            # Store run (use results repository with analysis type)
            uow.results.add_result(
                run_id=run.id,
                project_id=project_id,
                result_type="protection_analysis_run",
                payload=run.to_dict(),
            )

        return run

    def execute_run(self, run_id: UUID) -> ProtectionAnalysisRun:
        """
        Execute a protection analysis run.

        Args:
            run_id: Run ID to execute

        Returns:
            Updated ProtectionAnalysisRun (FINISHED or FAILED)

        Raises:
            ValueError: If run not found
        """
        with self._uow_factory() as uow:
            # Get run
            run = self._get_run(uow, run_id)
            if run is None:
                raise ValueError(f"Protection analysis run '{run_id}' not found")

            # Skip if already done
            if run.status in {ProtectionRunStatus.FINISHED, ProtectionRunStatus.FAILED}:
                return run

            # Update status to RUNNING
            run = self._update_run_status(
                uow,
                run,
                ProtectionRunStatus.RUNNING,
                started_at=datetime.now(UTC),
            )

            try:
                # Build evaluation input
                evaluation_input = self._build_evaluation_input(uow, run)

                # Execute evaluation
                result, trace = self._engine.evaluate(evaluation_input)

                # Store result
                uow.results.add_result(
                    run_id=run.id,
                    project_id=run.project_id,
                    result_type="protection_result",
                    payload=result.to_dict(),
                )

                # Store trace
                uow.results.add_result(
                    run_id=run.id,
                    project_id=run.project_id,
                    result_type="protection_trace",
                    payload=trace.to_dict(),
                )

                # Update run to FINISHED
                run = self._update_run_status(
                    uow,
                    run,
                    ProtectionRunStatus.FINISHED,
                    finished_at=datetime.now(UTC),
                    result_summary=result.summary.to_dict(),
                    trace_json=trace.to_dict(),
                )

            except Exception as exc:
                # Update run to FAILED
                run = self._update_run_status(
                    uow,
                    run,
                    ProtectionRunStatus.FAILED,
                    finished_at=datetime.now(UTC),
                    error_message=str(exc),
                )

        return run

    def get_run(self, run_id: UUID) -> ProtectionAnalysisRun:
        """
        Get a protection analysis run by ID.
        """
        with self._uow_factory() as uow:
            run = self._get_run(uow, run_id)
        if run is None:
            raise ValueError(f"Protection analysis run '{run_id}' not found")
        return run

    def get_result(self, run_id: UUID) -> ProtectionResult | None:
        """
        Get the result of a protection analysis run.
        """
        with self._uow_factory() as uow:
            results = uow.results.list_results(run_id)
            for result in results:
                if result.get("result_type") == "protection_result":
                    return ProtectionResult.from_dict(result.get("payload", {}))
        return None

    def get_trace(self, run_id: UUID) -> ProtectionTrace | None:
        """
        Get the trace of a protection analysis run.
        """
        with self._uow_factory() as uow:
            results = uow.results.list_results(run_id)
            for result in results:
                if result.get("result_type") == "protection_trace":
                    return ProtectionTrace.from_dict(result.get("payload", {}))
        return None

    def list_runs(
        self,
        project_id: UUID,
        status_filter: str | None = None,
    ) -> list[ProtectionAnalysisRun]:
        """
        List protection analysis runs for a project.
        """
        with self._uow_factory() as uow:
            # Query runs stored as results
            runs = []
            # This is a simplified implementation - in production you'd use a proper index
            # For now we scan all results of type "protection_analysis_run"
            try:
                stmt_results = uow.session.execute(
                    """
                    SELECT DISTINCT result_jsonb
                    FROM study_results
                    WHERE project_id = :project_id
                    AND result_type = 'protection_analysis_run'
                    ORDER BY created_at DESC
                    """,
                    {"project_id": str(project_id)},
                )
                for row in stmt_results:
                    try:
                        run = ProtectionAnalysisRun.from_dict(row[0])
                        if status_filter is None or run.status.value == status_filter:
                            runs.append(run)
                    except Exception:
                        continue
            except Exception:
                # Fall back to in-memory approach if raw SQL fails
                pass
        return runs

    # =========================================================================
    # PRIVATE METHODS
    # =========================================================================

    def _get_sc_run_data(self, uow: UnitOfWork, sc_run_id: str) -> dict | None:
        """
        Get short-circuit run data.
        """
        # Try analysis runs index first
        entry = uow.analysis_runs_index.get(sc_run_id)
        if entry is not None:
            return {
                "run_id": entry.run_id,
                "analysis_type": entry.analysis_type,
                "status": entry.status,
                "meta_json": entry.meta_json,
            }

        # Try UUID-based run
        try:
            run_uuid = UUID(sc_run_id)
            run = uow.analysis_runs.get(run_uuid)
            if run is not None:
                return {
                    "run_id": str(run.id),
                    "analysis_type": run.analysis_type,
                    "status": run.status,
                    "result_summary": run.result_summary,
                    "input_snapshot": run.input_snapshot,
                }
        except ValueError:
            pass

        return None

    def _get_sc_result(self, uow: UnitOfWork, sc_run_id: str) -> dict | None:
        """
        Get short-circuit result payload.
        """
        try:
            run_uuid = UUID(sc_run_id)
            results = uow.results.list_results(run_uuid)
            for result in results:
                if result.get("result_type") == "short_circuit_sn":
                    return result.get("payload")
        except ValueError:
            # Try index-based lookup
            entry = uow.analysis_runs_index.get(sc_run_id)
            if entry is not None and entry.meta_json:
                return entry.meta_json.get("short_circuit_result")
        return None

    def _get_run(self, uow: UnitOfWork, run_id: UUID) -> ProtectionAnalysisRun | None:
        """
        Get a protection analysis run by ID.
        """
        results = uow.results.list_results(run_id)
        for result in results:
            if result.get("result_type") == "protection_analysis_run":
                return ProtectionAnalysisRun.from_dict(result.get("payload", {}))
        return None

    def _get_existing_run(
        self, uow: UnitOfWork, project_id: UUID, input_hash: str
    ) -> ProtectionAnalysisRun | None:
        """
        Check for existing run with same input_hash.
        """
        # This is a simplified implementation - in production you'd use an index
        return None  # For now, always create new runs

    def _update_run_status(
        self,
        uow: UnitOfWork,
        run: ProtectionAnalysisRun,
        status: ProtectionRunStatus,
        *,
        started_at: datetime | None = None,
        finished_at: datetime | None = None,
        error_message: str | None = None,
        result_summary: dict | None = None,
        trace_json: dict | None = None,
    ) -> ProtectionAnalysisRun:
        """
        Update run status by creating a new immutable run object.
        """
        updated = ProtectionAnalysisRun(
            id=run.id,
            project_id=run.project_id,
            sc_run_id=run.sc_run_id,
            protection_case_id=run.protection_case_id,
            status=status,
            input_hash=run.input_hash,
            input_snapshot=run.input_snapshot,
            result_summary=result_summary or run.result_summary,
            trace_json=trace_json or run.trace_json,
            error_message=error_message or run.error_message,
            created_at=run.created_at,
            started_at=started_at or run.started_at,
            finished_at=finished_at or run.finished_at,
        )

        # Update stored run
        uow.results.add_result(
            run_id=run.id,
            project_id=run.project_id,
            result_type="protection_analysis_run",
            payload=updated.to_dict(),
        )

        return updated

    def _build_input_snapshot(
        self,
        sc_run_id: str,
        sc_run_data: dict,
        case: StudyCase,
    ) -> dict:
        """
        Build canonical input snapshot for deterministic hashing.
        """
        protection_config = case.protection_config
        return {
            "sc_run_id": sc_run_id,
            "protection_case_id": str(case.id),
            "template_ref": protection_config.template_ref,
            "template_fingerprint": protection_config.template_fingerprint,
            "overrides": protection_config.overrides,
            "library_manifest_ref": protection_config.library_manifest_ref,
        }

    def _build_evaluation_input(
        self,
        uow: UnitOfWork,
        run: ProtectionAnalysisRun,
    ) -> ProtectionEvaluationInput:
        """
        Build the complete input for the evaluation engine.
        """
        # Get case and protection config
        case = uow.cases.get_study_case(run.protection_case_id)
        if case is None:
            raise ValueError(f"Study case '{run.protection_case_id}' not found")

        protection_config = case.protection_config

        # Get template from catalog
        template = self._get_template(uow, protection_config.template_ref)
        if template is None:
            raise ValueError(f"Template '{protection_config.template_ref}' not found")

        # Get curve from catalog
        curve = self._get_curve(uow, template.curve_ref) if template.curve_ref else None

        # Get device type from catalog
        device_type = (
            self._get_device_type(uow, template.device_type_ref)
            if template.device_type_ref
            else None
        )

        # Get SC result
        sc_result = self._get_sc_result(uow, run.sc_run_id)
        if sc_result is None:
            raise ValueError(f"SC result not found for run '{run.sc_run_id}'")

        # Build devices (simplified: one device per protected element)
        # In P15a foundation, we use the fault node as the protected element
        fault_node_id = sc_result.get("fault_node_id", "unknown")

        device = build_device_from_template(
            device_id=f"device_{fault_node_id}",
            protected_element_ref=fault_node_id,
            template=template,
            curve=curve,
            device_type=device_type,
            overrides=protection_config.overrides,
        )

        # Build faults from SC result
        fault = build_fault_from_sc_result(
            fault_node_id=fault_node_id,
            ikss_a=float(sc_result.get("ikss_a", 0.0)),
            short_circuit_type=str(sc_result.get("short_circuit_type", "3F")),
        )

        return ProtectionEvaluationInput(
            run_id=str(run.id),
            sc_run_id=run.sc_run_id,
            protection_case_id=str(run.protection_case_id),
            template_ref=protection_config.template_ref,
            template_fingerprint=protection_config.template_fingerprint,
            library_manifest_ref=protection_config.library_manifest_ref,
            devices=(device,),
            faults=(fault,),
            snapshot_id=case.network_snapshot_id,
            overrides=protection_config.overrides,
        )

    def _get_template(
        self, uow: UnitOfWork, template_ref: str | None
    ) -> ProtectionSettingTemplate | None:
        """
        Get protection setting template from catalog.
        """
        if template_ref is None:
            return None
        # Use the catalog repository via network repository
        try:
            from network_model.catalog import CatalogRepository

            catalog = CatalogRepository(uow.session)
            return catalog.get_protection_setting_template(template_ref)
        except Exception:
            return None

    def _get_curve(self, uow: UnitOfWork, curve_ref: str | None) -> ProtectionCurve | None:
        """
        Get protection curve from catalog.
        """
        if curve_ref is None:
            return None
        try:
            from network_model.catalog import CatalogRepository

            catalog = CatalogRepository(uow.session)
            return catalog.get_protection_curve(curve_ref)
        except Exception:
            return None

    def _get_device_type(
        self, uow: UnitOfWork, device_type_ref: str | None
    ) -> ProtectionDeviceType | None:
        """
        Get protection device type from catalog.
        """
        if device_type_ref is None:
            return None
        try:
            from network_model.catalog import CatalogRepository

            catalog = CatalogRepository(uow.session)
            return catalog.get_protection_device_type(device_type_ref)
        except Exception:
            return None
