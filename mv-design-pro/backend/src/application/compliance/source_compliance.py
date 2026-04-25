from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from application.analyses.design_synth.canonical import canonicalize_json

SUPPORTED_SOURCE_TYPES = ("BESS", "FW", "FW_DFIG", "FW_PMSG", "FW_SCIG", "PV")
WIND_SOURCE_TYPES = ("FW_DFIG", "FW_PMSG", "FW_SCIG")
SOURCE_TYPE_ALIASES = {
    "DFIG": "FW_DFIG",
    "FW-DFIG": "FW_DFIG",
    "FW_DFIG": "FW_DFIG",
    "PMSG": "FW_PMSG",
    "FW-PMSG": "FW_PMSG",
    "FW_PMSG": "FW_PMSG",
    "SCIG": "FW_SCIG",
    "FW-SCIG": "FW_SCIG",
    "FW_SCIG": "FW_SCIG",
}
REQUIRED_PROFILE_KEYS = ("frt", "q_u", "cos_phi_p")


@dataclass(frozen=True)
class SourceComplianceResult:
    source_type: str
    verdict: str
    reporting_status: str
    proof_status: str
    limitations: tuple[str, ...]
    checks: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "source_type": self.source_type,
            "verdict": self.verdict,
            "reporting_status": self.reporting_status,
            "proof_status": self.proof_status,
            "limitations": self.limitations,
            "checks": self.checks,
        }
        return canonicalize_json(payload)


def evaluate_source_compliance(
    *,
    source_type: str,
    operator_profile: Mapping[str, Any] | None,
    source_profile: Mapping[str, Any] | None,
) -> SourceComplianceResult:
    normalized_source_type = _normalize_source_type(source_type)
    limitations: list[str] = []
    checks: dict[str, Any] = {
        "operator_profile": {
            "verdict": "present" if isinstance(operator_profile, Mapping) else "missing"
        },
        "source_profile": {
            "verdict": "present" if isinstance(source_profile, Mapping) else "missing"
        },
    }

    if normalized_source_type not in SUPPORTED_SOURCE_TYPES:
        limitations.append(f"unsupported_source_type:{normalized_source_type or 'UNKNOWN'}")

    if not isinstance(operator_profile, Mapping):
        limitations.append("missing_operator_profile")
        operator_profile = {}

    if not isinstance(source_profile, Mapping):
        limitations.append("missing_source_profile")
        source_profile = {}

    checks["frt"] = _evaluate_frt(operator_profile, source_profile, limitations)
    checks["q_u"] = _evaluate_exact_curve(
        profile_key="q_u",
        axis_key="u_pu",
        value_key="q_pu",
        operator_profile=operator_profile,
        source_profile=source_profile,
        limitations=limitations,
    )
    checks["cos_phi_p"] = _evaluate_exact_curve(
        profile_key="cos_phi_p",
        axis_key="p_pu",
        value_key="cos_phi",
        operator_profile=operator_profile,
        source_profile=source_profile,
        limitations=limitations,
    )
    checks["generator_technology"] = _evaluate_generator_technology(
        source_type=normalized_source_type,
        source_profile=source_profile,
        limitations=limitations,
    )

    if limitations:
        return SourceComplianceResult(
            source_type=normalized_source_type,
            verdict="undetermined",
            reporting_status="not_reportable",
            proof_status="incomplete",
            limitations=tuple(sorted(set(limitations))),
            checks=canonicalize_json(checks),
        )

    required_keys = list(REQUIRED_PROFILE_KEYS)
    if normalized_source_type in WIND_SOURCE_TYPES:
        required_keys.append("generator_technology")
    family_verdicts = [checks[key]["verdict"] for key in required_keys]
    verdict = (
        "compliant" if all(item == "compliant" for item in family_verdicts) else "non_compliant"
    )

    return SourceComplianceResult(
        source_type=normalized_source_type,
        verdict=verdict,
        reporting_status="reportable",
        proof_status="complete",
        limitations=(),
        checks=canonicalize_json(checks),
    )


def _normalize_source_type(source_type: str) -> str:
    cleaned = str(source_type or "").strip().upper().replace(" ", "_")
    return SOURCE_TYPE_ALIASES.get(cleaned, cleaned)


def _evaluate_generator_technology(
    *,
    source_type: str,
    source_profile: Mapping[str, Any],
    limitations: list[str],
) -> dict[str, Any]:
    if source_type not in WIND_SOURCE_TYPES:
        return {"verdict": "not_applicable", "expected": None, "actual": None}

    generator_model = source_profile.get("generator_model")
    expected = source_type.removeprefix("FW_")
    if not isinstance(generator_model, Mapping):
        limitations.append("missing_generator_model")
        return {"verdict": "missing", "expected": expected, "actual": None}

    actual = _normalize_generator_model(
        generator_model.get("type")
        or generator_model.get("technology")
        or generator_model.get("generator_type")
    )
    if actual is None:
        limitations.append("missing_generator_model_type")
        return {"verdict": "missing", "expected": expected, "actual": None}

    return {
        "verdict": "compliant" if actual == expected else "non_compliant",
        "expected": expected,
        "actual": actual,
    }


def _normalize_generator_model(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip().upper().replace("-", "_")
    normalized = normalized.removeprefix("FW_")
    if normalized in {"PMSG", "DFIG", "SCIG"}:
        return normalized
    return normalized or None


def _evaluate_frt(
    operator_profile: Mapping[str, Any],
    source_profile: Mapping[str, Any],
    limitations: list[str],
) -> dict[str, Any]:
    operator_points = _normalize_frt_points(operator_profile.get("frt"))
    source_points = _normalize_frt_points(source_profile.get("frt"))

    if operator_points is None:
        limitations.append("missing_operator_frt")
        return {"verdict": "missing", "matched_points": 0, "required_points": 0, "mismatches": []}

    if source_points is None:
        limitations.append("missing_source_frt")
        return {
            "verdict": "missing",
            "matched_points": 0,
            "required_points": len(operator_points),
            "mismatches": [],
        }

    mismatches: list[dict[str, Any]] = []
    matched_points = 0
    for u_pu, required_duration_ms in sorted(operator_points.items()):
        source_duration_ms = source_points.get(u_pu)
        if source_duration_ms is None or source_duration_ms < required_duration_ms:
            mismatches.append(
                {
                    "u_pu": u_pu,
                    "required_duration_ms": required_duration_ms,
                    "source_duration_ms": source_duration_ms,
                }
            )
            continue
        matched_points += 1

    return {
        "verdict": "compliant" if not mismatches else "non_compliant",
        "required_points": len(operator_points),
        "matched_points": matched_points,
        "mismatches": mismatches,
    }


def _evaluate_exact_curve(
    *,
    profile_key: str,
    axis_key: str,
    value_key: str,
    operator_profile: Mapping[str, Any],
    source_profile: Mapping[str, Any],
    limitations: list[str],
) -> dict[str, Any]:
    operator_points = _normalize_exact_curve(operator_profile.get(profile_key), axis_key, value_key)
    source_points = _normalize_exact_curve(source_profile.get(profile_key), axis_key, value_key)

    if operator_points is None:
        limitations.append(f"missing_operator_{profile_key}")
        return {"verdict": "missing", "matched_points": 0, "required_points": 0, "mismatches": []}

    if source_points is None:
        limitations.append(f"missing_source_{profile_key}")
        return {
            "verdict": "missing",
            "matched_points": 0,
            "required_points": len(operator_points),
            "mismatches": [],
        }

    mismatches: list[dict[str, Any]] = []
    matched_points = 0
    for axis_value, required_value in sorted(operator_points.items()):
        source_value = source_points.get(axis_value)
        if source_value != required_value:
            mismatches.append(
                {
                    axis_key: axis_value,
                    f"required_{value_key}": required_value,
                    f"source_{value_key}": source_value,
                }
            )
            continue
        matched_points += 1

    return {
        "verdict": "compliant" if not mismatches else "non_compliant",
        "required_points": len(operator_points),
        "matched_points": matched_points,
        "mismatches": mismatches,
    }


def _normalize_frt_points(section: Any) -> dict[float, float] | None:
    points = _extract_points(section)
    if not points:
        return None

    normalized: dict[float, float] = {}
    for point in points:
        if not isinstance(point, Mapping):
            continue
        u_pu = _as_float(point.get("u_pu"))
        min_duration_ms = _as_float(point.get("min_duration_ms"))
        if u_pu is None or min_duration_ms is None:
            continue
        normalized[u_pu] = max(min_duration_ms, normalized.get(u_pu, min_duration_ms))
    return normalized or None


def _normalize_exact_curve(
    section: Any,
    axis_key: str,
    value_key: str,
) -> dict[float, float] | None:
    points = _extract_points(section)
    if not points:
        return None

    normalized: dict[float, float] = {}
    sortable_points: list[tuple[float, float]] = []
    for point in points:
        if not isinstance(point, Mapping):
            continue
        axis_value = _as_float(point.get(axis_key))
        curve_value = _as_float(point.get(value_key))
        if axis_value is None or curve_value is None:
            continue
        sortable_points.append((axis_value, curve_value))

    for axis_value, curve_value in sorted(sortable_points):
        normalized[axis_value] = curve_value
    return normalized or None


def _extract_points(section: Any) -> Sequence[Any] | None:
    if isinstance(section, Mapping):
        points = section.get("points")
        if isinstance(points, Sequence) and not isinstance(points, str | bytes):
            return points
        return None
    if isinstance(section, Sequence) and not isinstance(section, str | bytes):
        return section
    return None


def _as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return round(float(value), 9)
    except (TypeError, ValueError):
        return None
