from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any

from application.proof_engine.types import (
    EquationDefinition,
    ProofDocument,
    ProofHeader,
    ProofStep,
    ProofSummary,
    ProofType,
    ProofValue,
    SymbolDefinition,
    UnitCheckResult,
)

_COMPLEX_PATTERN = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\+j(-?\d+(?:\.\d+)?)\s*$")


def proof_document_from_dict(payload: dict[str, Any]) -> ProofDocument:
    return ProofDocument(
        document_id=_require_uuid(payload.get("document_id")),
        artifact_id=_require_uuid(payload.get("artifact_id")),
        created_at=_parse_datetime(payload.get("created_at")),
        proof_type=_parse_proof_type(payload.get("proof_type")),
        title_pl=str(payload.get("title_pl", "")),
        header=_proof_header_from_dict(payload.get("header", {})),
        steps=tuple(_proof_step_from_dict(step) for step in payload.get("steps", [])),
        summary=_proof_summary_from_dict(payload.get("summary", {})),
    )


def _proof_header_from_dict(payload: dict[str, Any]) -> ProofHeader:
    return ProofHeader(
        project_name=str(payload.get("project_name", "")),
        case_name=str(payload.get("case_name", "")),
        run_timestamp=_parse_datetime(payload.get("run_timestamp")),
        solver_version=str(payload.get("solver_version", "")),
        target_id=payload.get("target_id"),
        element_kind=payload.get("element_kind"),
        fault_location=payload.get("fault_location"),
        fault_type=payload.get("fault_type"),
        voltage_factor=_optional_float(payload.get("voltage_factor")),
        source_bus=payload.get("source_bus"),
        target_bus=payload.get("target_bus"),
    )


def _proof_summary_from_dict(payload: dict[str, Any]) -> ProofSummary:
    key_results = {
        key: _proof_value_from_dict(value) for key, value in payload.get("key_results", {}).items()
    }
    counterfactual_diff = {
        key: _proof_value_from_dict(value)
        for key, value in payload.get("counterfactual_diff", {}).items()
    }
    warnings = tuple(payload.get("warnings", []) or ())
    return ProofSummary(
        key_results=key_results,
        unit_check_passed=bool(payload.get("unit_check_passed", False)),
        total_steps=int(payload.get("total_steps", 0)),
        warnings=warnings,
        overall_status=payload.get("overall_status"),
        failed_checks=tuple(payload.get("failed_checks", []) or ()),
        counterfactual_diff=counterfactual_diff,
    )


def _proof_step_from_dict(payload: dict[str, Any]) -> ProofStep:
    return ProofStep(
        step_id=str(payload.get("step_id", "")),
        step_number=int(payload.get("step_number", 0)),
        title_pl=str(payload.get("title_pl", "")),
        equation=_equation_from_dict(payload.get("equation", {})),
        input_values=tuple(
            _proof_value_from_dict(item) for item in payload.get("input_values", [])
        ),
        substitution_latex=str(payload.get("substitution_latex", "")),
        result=_proof_value_from_dict(payload.get("result", {})),
        unit_check=_unit_check_from_dict(payload.get("unit_check", {})),
        source_keys=dict(payload.get("source_keys", {}) or {}),
    )


def _equation_from_dict(payload: dict[str, Any]) -> EquationDefinition:
    symbols = tuple(_symbol_from_dict(symbol) for symbol in payload.get("symbols", []))
    return EquationDefinition(
        equation_id=str(payload.get("equation_id", "")),
        latex=str(payload.get("latex", "")),
        name_pl=str(payload.get("name_pl", "")),
        standard_ref=str(payload.get("standard_ref", "")),
        symbols=symbols,
        unit_derivation=str(payload.get("unit_derivation", "")),
        notes=payload.get("notes"),
    )


def _symbol_from_dict(payload: dict[str, Any]) -> SymbolDefinition:
    return SymbolDefinition(
        symbol=str(payload.get("symbol", "")),
        unit=str(payload.get("unit", "")),
        description_pl=str(payload.get("description_pl", "")),
        mapping_key=str(payload.get("mapping_key", "")),
    )


def _proof_value_from_dict(payload: dict[str, Any]) -> ProofValue:
    value = payload.get("value")
    parsed_value = _parse_complex(value)
    return ProofValue(
        symbol=str(payload.get("symbol", "")),
        value=parsed_value,
        unit=str(payload.get("unit", "")),
        formatted=str(payload.get("formatted", "")),
        source_key=str(payload.get("source_key", "")),
    )


def _unit_check_from_dict(payload: dict[str, Any]) -> UnitCheckResult:
    return UnitCheckResult(
        passed=bool(payload.get("passed", False)),
        expected_unit=str(payload.get("expected_unit", "")),
        computed_unit=str(payload.get("computed_unit", "")),
        input_units=dict(payload.get("input_units", {}) or {}),
        derivation=str(payload.get("derivation", "")),
    )


def _parse_proof_type(value: Any) -> ProofType:
    try:
        return ProofType(str(value))
    except ValueError as exc:
        raise ValueError(f"Unsupported proof_type: {value}") from exc


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if not value:
        return datetime(1970, 1, 1, tzinfo=UTC)
    text = str(value)
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    return datetime.fromisoformat(text)


def _parse_complex(value: Any) -> float | complex | str:
    if isinstance(value, complex):
        return value
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        match = _COMPLEX_PATTERN.match(value)
        if match:
            real = float(match.group(1))
            imag = float(match.group(2))
            return complex(real, imag)
    return str(value) if value is not None else ""


def _optional_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _require_uuid(value: Any):
    from uuid import UUID

    if isinstance(value, UUID):
        return value
    if value is None:
        raise ValueError("UUID value is required")
    return UUID(str(value))
