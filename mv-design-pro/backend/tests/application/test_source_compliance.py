from __future__ import annotations

from application.compliance.source_compliance import evaluate_source_compliance


def _base_operator_profile() -> dict[str, object]:
    return {
        "frt": {
            "points": [
                {"u_pu": 0.15, "min_duration_ms": 150.0},
                {"u_pu": 0.90, "min_duration_ms": 1000.0},
            ]
        },
        "q_u": {
            "points": [
                {"u_pu": 0.95, "q_pu": 1.0},
                {"u_pu": 1.00, "q_pu": 0.0},
                {"u_pu": 1.05, "q_pu": -1.0},
            ]
        },
        "cos_phi_p": {
            "points": [
                {"p_pu": 0.50, "cos_phi": 0.98},
                {"p_pu": 1.00, "cos_phi": 0.95},
            ]
        },
    }


def _base_source_profile() -> dict[str, object]:
    return {
        "generator_model": {"type": "PMSG"},
        "frt": {
            "points": [
                {"u_pu": 0.90, "min_duration_ms": 1000.0},
                {"u_pu": 0.15, "min_duration_ms": 200.0},
            ]
        },
        "q_u": {
            "points": [
                {"u_pu": 1.05, "q_pu": -1.0},
                {"u_pu": 0.95, "q_pu": 1.0},
                {"u_pu": 1.00, "q_pu": 0.0},
            ]
        },
        "cos_phi_p": {
            "points": [
                {"p_pu": 1.00, "cos_phi": 0.95},
                {"p_pu": 0.50, "cos_phi": 0.98},
            ]
        },
    }


def test_source_compliance_marks_pv_as_compliant_when_all_profiles_match() -> None:
    result = evaluate_source_compliance(
        source_type="PV",
        operator_profile=_base_operator_profile(),
        source_profile=_base_source_profile(),
    )

    assert result.verdict == "compliant"
    assert result.reporting_status == "reportable"
    assert result.proof_status == "complete"
    assert result.limitations == ()
    assert result.checks["frt"]["verdict"] == "compliant"
    assert result.checks["q_u"]["verdict"] == "compliant"
    assert result.checks["cos_phi_p"]["verdict"] == "compliant"


def test_source_compliance_marks_bess_as_non_compliant_when_frt_envelope_is_shorter() -> None:
    source_profile = _base_source_profile()
    source_profile["frt"] = {
        "points": [
            {"u_pu": 0.15, "min_duration_ms": 120.0},
            {"u_pu": 0.90, "min_duration_ms": 1000.0},
        ]
    }

    result = evaluate_source_compliance(
        source_type="BESS",
        operator_profile=_base_operator_profile(),
        source_profile=source_profile,
    )

    assert result.verdict == "non_compliant"
    assert result.reporting_status == "reportable"
    assert result.proof_status == "complete"
    assert result.limitations == ()
    assert result.checks["frt"]["mismatches"] == [
        {"required_duration_ms": 150.0, "source_duration_ms": 120.0, "u_pu": 0.15}
    ]


def test_source_compliance_marks_fw_as_undetermined_when_profile_is_missing() -> None:
    source_profile = _base_source_profile()
    source_profile.pop("q_u")

    result = evaluate_source_compliance(
        source_type="FW",
        operator_profile=_base_operator_profile(),
        source_profile=source_profile,
    )

    assert result.verdict == "undetermined"
    assert result.reporting_status == "not_reportable"
    assert result.proof_status == "incomplete"
    assert result.limitations == ("missing_source_q_u",)
    assert result.checks["q_u"]["verdict"] == "missing"


def test_source_compliance_supports_precise_wind_generator_types() -> None:
    for source_type, generator_model in (
        ("FW_PMSG", "PMSG"),
        ("FW_DFIG", "DFIG"),
        ("FW_SCIG", "SCIG"),
    ):
        source_profile = _base_source_profile()
        source_profile["generator_model"] = {"type": generator_model}

        result = evaluate_source_compliance(
            source_type=source_type,
            operator_profile=_base_operator_profile(),
            source_profile=source_profile,
        )

        assert result.source_type == source_type
        assert result.verdict == "compliant"
        assert result.reporting_status == "reportable"
        assert result.proof_status == "complete"
        assert result.checks["generator_technology"] == {
            "actual": generator_model,
            "expected": generator_model,
            "verdict": "compliant",
        }


def test_source_compliance_normalizes_wind_generator_aliases() -> None:
    result = evaluate_source_compliance(
        source_type="pmsg",
        operator_profile=_base_operator_profile(),
        source_profile=_base_source_profile(),
    )

    assert result.source_type == "FW_PMSG"
    assert result.verdict == "compliant"


def test_source_compliance_blocks_precise_wind_type_without_generator_model() -> None:
    source_profile = _base_source_profile()
    source_profile.pop("generator_model")

    result = evaluate_source_compliance(
        source_type="FW_DFIG",
        operator_profile=_base_operator_profile(),
        source_profile=source_profile,
    )

    assert result.verdict == "undetermined"
    assert result.reporting_status == "not_reportable"
    assert result.proof_status == "incomplete"
    assert result.limitations == ("missing_generator_model",)
    assert result.checks["generator_technology"] == {
        "actual": None,
        "expected": "DFIG",
        "verdict": "missing",
    }


def test_source_compliance_marks_wind_technology_mismatch_as_non_compliant() -> None:
    source_profile = _base_source_profile()
    source_profile["generator_model"] = {"type": "SCIG"}

    result = evaluate_source_compliance(
        source_type="FW_DFIG",
        operator_profile=_base_operator_profile(),
        source_profile=source_profile,
    )

    assert result.verdict == "non_compliant"
    assert result.reporting_status == "reportable"
    assert result.proof_status == "complete"
    assert result.limitations == ()
    assert result.checks["generator_technology"] == {
        "actual": "SCIG",
        "expected": "DFIG",
        "verdict": "non_compliant",
    }


def test_source_compliance_returns_undetermined_for_unsupported_source_type() -> None:
    result = evaluate_source_compliance(
        source_type="CHP",
        operator_profile=_base_operator_profile(),
        source_profile=_base_source_profile(),
    )

    assert result.verdict == "undetermined"
    assert result.reporting_status == "not_reportable"
    assert result.proof_status == "incomplete"
    assert result.limitations == ("unsupported_source_type:CHP",)


def test_source_compliance_is_deterministic_for_equivalent_curve_ordering() -> None:
    operator_profile = _base_operator_profile()
    source_profile = _base_source_profile()

    first = evaluate_source_compliance(
        source_type="PV",
        operator_profile=operator_profile,
        source_profile=source_profile,
    )
    second = evaluate_source_compliance(
        source_type="pv",
        operator_profile={
            "cos_phi_p": list(reversed(operator_profile["cos_phi_p"]["points"])),
            "frt": list(reversed(operator_profile["frt"]["points"])),
            "q_u": list(reversed(operator_profile["q_u"]["points"])),
        },
        source_profile={
            "cos_phi_p": list(reversed(source_profile["cos_phi_p"]["points"])),
            "frt": list(reversed(source_profile["frt"]["points"])),
            "q_u": list(reversed(source_profile["q_u"]["points"])),
        },
    )

    assert first.to_dict() == second.to_dict()
