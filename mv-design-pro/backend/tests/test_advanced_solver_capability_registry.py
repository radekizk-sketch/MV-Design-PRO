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
        "DYNAMIC_STABILITY",
        "POWER_QUALITY_HARMONICS",
        "SSCI_IMPEDANCE",
        "VOLTAGE_STABILITY",
        "RELIABILITY_CONTINGENCY",
        "EARTHING_SAFETY",
        "NEUTRAL_EARTHING_DESIGN",
        "INSULATION_COORDINATION",
        "EARTH_FAULT_DETECTION",
        "TRANSIENT_TRV",
        "MOTOR_STARTING",
        "HOSTING_CAPACITY",
        "OPF_LOSS_LCC",
        "BENCHMARK_VALIDATION",
        "UNCERTAINTY_SENSITIVITY",
    }

    # Karta W3-E (2026-09-09): HOSTING_CAPACITY i OPF_LOSS_LCC duplikują kanon
    # liczony gdzie indziej (impedancja Thevenina lokalna / β zaszyte) i nie
    # uruchamiają już NOWYCH biegów (410) — `availability` "withdrawn" dla tych
    # dwóch jest UCZCIWE (solver je nadal implementuje i solver_version/
    # proof_support/reportable zostają bez zmian; "available" na tej
    # powierzchni sugerowałoby nieprawdę: że nowy bieg jest możliwy).
    wycofane = {"HOSTING_CAPACITY", "OPF_LOSS_LCC"}
    assert set(SOLVER_CAPABILITY_REGISTRY) == expected
    for capability in SOLVER_CAPABILITY_REGISTRY.values():
        oczekiwana_dostepnosc = "withdrawn" if capability.capability in wycofane else "available"
        assert capability.availability == oczekiwana_dostepnosc, capability.capability
        assert capability.implementation_status == "implemented"
        assert capability.proof_support is True
        assert capability.reportable is True
        assert capability.output_contract
        assert capability.reference_test.endswith(".py") or ".py::" in capability.reference_test


def test_advanced_solver_capability_contract_reports_full_support() -> None:
    contract = solver_capabilities_contract()

    assert contract["contract"] == "SolverCapabilityRegistryV1"
    # Karta W3-E: dwie zdolności "withdrawn" — `all_available` jest teraz
    # UCZCIWIE False (nie fabrykujemy "wszystko dostępne", gdy dwie z 25
    # zdolności nie przyjmują już nowego biegu). Pozostałe trzy agregaty
    # (implemented/proof/reportable) opisują SOLVER, nie powierzchnię API, i
    # zostają True bez zmian — żadnej zdolności nie odebrano implementacji.
    assert contract["all_available"] is False
    assert contract["all_implemented"] is True
    assert contract["all_proof_supported"] is True
    assert contract["all_reportable"] is True
    # W3-D (2026-09-09): 25 -> 23 (kasacja source_compliance x2); W3-E: 2 pozycje "withdrawn", nie skasowane.
    assert len(contract["capabilities"]) == 23
    niedostepne = sorted(
        item["capability"]
        for item in contract["capabilities"]
        if item["availability"] != "available"
    )
    assert niedostepne == ["HOSTING_CAPACITY", "OPF_LOSS_LCC"]
