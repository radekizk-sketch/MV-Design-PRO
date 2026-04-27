from application.compliance.source_compliance import evaluate_source_compliance


def _profile(generator_type: str | None = None) -> dict[str, object]:
    payload: dict[str, object] = {
        "frt": [
            {"u_pu": 0.15, "min_duration_ms": 150},
            {"u_pu": 0.90, "min_duration_ms": 1500},
            {"u_pu": 1.15, "min_duration_ms": 500},
        ],
        "q_u": [
            {"u_pu": 0.95, "q_pu": 0.20},
            {"u_pu": 1.05, "q_pu": -0.20},
        ],
        "cos_phi_p": [
            {"p_pu": 0.50, "cos_phi": 0.98},
            {"p_pu": 1.00, "cos_phi": 0.95},
        ],
    }
    if generator_type:
        payload["generator_model"] = {"type": generator_type}
    return payload


def test_source_frt_compliance_for_supported_sources() -> None:
    for source_type, generator in [
        ("PV", None),
        ("BESS", None),
        ("FW_PMSG", "PMSG"),
        ("FW_DFIG", "DFIG"),
        ("FW_SCIG", "SCIG"),
    ]:
        result = evaluate_source_compliance(
            source_type=source_type,
            operator_profile=_profile(generator),
            source_profile=_profile(generator),
        ).to_dict()

        assert result["verdict"] == "compliant"
        assert result["reporting_status"] == "reportable"
        assert result["proof_status"] == "complete"
        assert result["limitations"] == []
        assert result["checks"]["frt"]["verdict"] == "compliant"


def test_source_frt_compliance_blocks_missing_profiles_from_reporting() -> None:
    result = evaluate_source_compliance(
        source_type="PV",
        operator_profile=_profile(),
        source_profile=None,
    ).to_dict()

    assert result["verdict"] == "undetermined"
    assert result["reporting_status"] == "not_reportable"
    assert result["proof_status"] == "incomplete"
    assert "missing_source_profile" in result["limitations"]
