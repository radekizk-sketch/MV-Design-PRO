from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime
from typing import Any
from uuid import UUID

from application.analysis_run.catalog_context import (
    build_catalog_context,
    build_catalog_context_index,
    build_catalog_context_summary,
    enrich_trace_steps_with_catalog_context,
)
from application.analysis_run.read_model import (
    build_deterministic_id,
    canonicalize_json,
    get_run_trace,
    minimize_summary,
)
from application.sld.overlay import ResultSldOverlayBuilder
from infrastructure.persistence.unit_of_work import UnitOfWork
from network_model.reporting.analysis_run_report_docx import export_analysis_run_to_docx
from network_model.reporting.analysis_run_report_pdf import export_analysis_run_to_pdf


class AnalysisRunExportService:
    def __init__(self, uow_factory: Callable[[], UnitOfWork]) -> None:
        self._uow_factory = uow_factory
        self._overlay_builder = ResultSldOverlayBuilder()

    def export_run_bundle(self, run_id: UUID) -> dict[str, Any]:
        with self._uow_factory() as uow:
            run = uow.analysis_runs.get(run_id)
            if run is None:
                raise ValueError(f"AnalysisRun {run_id} not found")
            project = uow.projects.get(run.project_id)
            if project is None:
                raise ValueError(f"Project {run.project_id} not found")
            operating_case = uow.cases.get_operating_case(run.operating_case_id)
            if operating_case is None:
                raise ValueError(f"OperatingCase {run.operating_case_id} not found")
            results = uow.results.list_results(run_id)
            diagrams = uow.sld.list_by_project(run.project_id)

        result_items = self._build_result_items(results)
        overlay_bundle = self._build_overlay_bundle(diagrams, results)
        catalog_context = build_catalog_context(run.input_snapshot or {})
        trace_steps = self._build_trace_steps(get_run_trace(run), catalog_context=catalog_context)

        bundle = {
            "report_type": "analysis_run",
            "project": {
                "id": str(project.id),
                "name": project.name,
            },
            "operating_case": {
                "id": str(operating_case.id),
                "name": operating_case.name,
            },
            "run": {
                "id": str(run.id),
                "deterministic_id": build_deterministic_id(run),
                "analysis_type": run.analysis_type,
                "status": run.status,
                "result_status": run.result_status,
                "created_at": _format_datetime(run.created_at),
                "started_at": _format_datetime(run.started_at),
                "finished_at": _format_datetime(run.finished_at),
                "duration_seconds": _calculate_duration(run.started_at, run.finished_at),
                "queue_seconds": _calculate_duration(run.created_at, run.started_at),
                "input_hash": run.input_hash,
            },
            "input_snapshot": canonicalize_json(run.input_snapshot),
            "catalog_context": catalog_context,
            "catalog_context_by_element": build_catalog_context_index(catalog_context),
            "catalog_context_summary": build_catalog_context_summary(catalog_context),
            "result_summary": canonicalize_json(run.result_summary),
            "white_box_trace": trace_steps,
            "results": result_items,
            "overlay": overlay_bundle,
        }
        return bundle

    def export_run_docx(self, run_id: UUID) -> bytes:
        bundle = self.export_run_bundle(run_id)
        return self._render_docx(bundle)

    def export_run_pdf(self, run_id: UUID) -> bytes:
        bundle = self.export_run_bundle(run_id)
        return self._render_pdf(bundle)

    def _render_docx(self, bundle: dict[str, Any]) -> bytes:
        return export_analysis_run_to_docx(bundle)

    def _render_pdf(self, bundle: dict[str, Any]) -> bytes:
        return export_analysis_run_to_pdf(bundle)

    def _build_result_items(self, results: list[dict[str, Any]]) -> list[dict[str, Any]]:
        items = []
        for result in results:
            payload = result.get("payload") or {}
            payload_canonical = canonicalize_json(payload)
            payload_size = len(
                json.dumps(payload_canonical, sort_keys=True, separators=(",", ":")).encode("utf-8")
            )
            items.append(
                {
                    "id": str(result.get("id")),
                    "result_type": result.get("result_type"),
                    "created_at": _format_datetime(result.get("created_at")),
                    "payload_size_bytes": payload_size,
                    "payload_summary": minimize_summary(payload),
                }
            )
        items.sort(key=lambda item: (str(item.get("result_type")), str(item.get("id"))))
        return items

    def _build_overlay_bundle(
        self, diagrams: list[dict[str, Any]], results: list[dict[str, Any]]
    ) -> dict[str, Any] | None:
        if not diagrams:
            return None
        diagram = diagrams[0]
        sc_result_payload = None
        for result in results:
            if result.get("result_type") == "short_circuit_sn":
                sc_result_payload = result.get("payload")
                break
        if sc_result_payload is None:
            return None
        overlay_payload = self._overlay_builder.build_short_circuit_overlay(
            diagram.get("payload"), sc_result_payload
        )
        overlay_payload = canonicalize_json(overlay_payload)
        return {
            "diagram": {
                "id": str(diagram.get("id")),
                "name": diagram.get("name"),
            },
            "payload": overlay_payload,
            "summary": {
                "node_count": len(overlay_payload.get("nodes", [])),
                "branch_count": len(overlay_payload.get("branches", [])),
            },
        }

    def _build_trace_steps(
        self,
        trace_payload: dict[str, Any] | list[dict[str, Any]] | None,
        *,
        catalog_context: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if trace_payload is None:
            return []
        if isinstance(trace_payload, list):
            enriched_steps = enrich_trace_steps_with_catalog_context(trace_payload, catalog_context)
            return [
                self._normalize_trace_step(step, index=i) for i, step in enumerate(enriched_steps)
            ]
        steps = []
        for key in sorted(trace_payload.keys()):
            value = trace_payload[key]
            step = {"key": key}
            if isinstance(value, dict):
                step.update(self._normalize_trace_fields(value))
            else:
                step["data"] = value
            steps.append(step)
        return steps

    def _normalize_trace_step(self, step: dict[str, Any], *, index: int) -> dict[str, Any]:
        fields = self._normalize_trace_fields(step)
        key = step.get("key") or step.get("title") or step.get("step") or f"step_{index + 1}"
        fields["key"] = key
        return fields

    @staticmethod
    def _normalize_trace_fields(step: dict[str, Any]) -> dict[str, Any]:
        normalized: dict[str, Any] = {}
        for field_name in (
            "key",
            "step",
            "step_id",
            "title",
            "phase",
            "description",
            "severity",
            "formula_latex",
            "substitution",
            "notes",
            "element_id",
            "target_id",
            "solver_ref",
            "catalog_binding",
            "source_catalog",
            "source_catalog_label",
            "parameter_origin",
            "parameter_source",
            "source_mode",
            "materialized_params",
            "manual_overrides",
            "overrides",
            "manual_override_count",
            "has_manual_overrides",
            "catalog_context_entry",
        ):
            if field_name in step and step.get(field_name) is not None:
                normalized[field_name] = step.get(field_name)
        if "metrics" in step:
            normalized["metrics"] = step.get("metrics")
        if "inputs" in step:
            normalized["inputs"] = step.get("inputs")
        if "result" in step:
            normalized["result"] = step.get("result")
        if "data" in step:
            normalized["data"] = step.get("data")
        return {key: value for key, value in normalized.items() if value is not None}


def _format_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat()


def _calculate_duration(start: datetime | None, end: datetime | None) -> float | None:
    if start is None or end is None:
        return None
    return (end - start).total_seconds()
