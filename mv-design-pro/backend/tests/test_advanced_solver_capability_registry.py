from application.solvers.solver_capability_registry import (
    SOLVER_CAPABILITY_REGISTRY,
    solver_capabilities_contract,
)


def test_advanced_solver_capability_registry_is_complete_and_real() -> None:
    expected = {
        "SC_3F",
        "SC_1F",
        "SC_2F",
        "SC_2F_G",
        "LOAD_FLOW_NR",
        "LOAD_FLOW_GS_DIAGNOSTIC",
        "LOAD_FLOW_FD_PERFORMANCE",
        "PHASE_STATE_SN",
        "SOURCE_FRT_LVRT_HVRT",
        "DYNAMIC_STABILITY",
        "SOURCE_COMPLIANCE",
    }

    assert set(SOLVER_CAPABILITY_REGISTRY) == expected
    for capability in SOLVER_CAPABILITY_REGISTRY.values():
        assert capability.availability == "available"
        assert capability.implementation_status == "implemented"
        assert capability.proof_support is True
        assert capability.reportable is True
        assert capability.output_contract
        assert capability.reference_test.endswith(".py") or ".test.py::" in capability.reference_test


def test_advanced_solver_capability_contract_reports_full_support() -> None:
    contract = solver_capabilities_contract()

    assert contract["contract"] == "SolverCapabilityRegistryV1"
    assert contract["all_available"] is True
    assert contract["all_implemented"] is True
    assert contract["all_proof_supported"] is True
    assert contract["all_reportable"] is True
    assert len(contract["capabilities"]) == 11
