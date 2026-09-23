from application.solvers.solver_capability_registry import (
    SOLVER_CAPABILITY_REGISTRY,
    solver_capabilities_contract,
)

#: Karta AB-1a D1 (2026-09-23): `reportable` jest WYPROWADZANY z rejestru dowodowego
#: (`solver_input/provenance.py`), a nie zapisany w literale. POMIAR na drzewie karty
#: (`solver_capabilities_contract()["not_reportable"]`): dotad KAZDY wpis mowil
#: `reportable=True`; po wyprowadzeniu raportowalne zostaja wylacznie zdolnosci z
#: niezalezna wyrocznia w repozytorium (zwarcia IEC 60909, rozplywy NR/GS/FD/BFS, stan
#: fazowy SN, zabezpieczenia IEC 60255). Nieraportowalne — ponizej, kazda z nazwanym
#: powodem w `ocena_dowodowa.rationale_pl` odpowiedzi API.
NIERAPORTOWALNE_ZMIERZONE = [
    "BENCHMARK_VALIDATION",
    "DYNAMIC_STABILITY",
    "DYNAMIKA_RMS",
    "EARTHING_SAFETY",
    "EARTH_FAULT_DETECTION",
    "HOSTING_CAPACITY",
    "INSULATION_COORDINATION",
    "MOTOR_STARTING",
    "NEUTRAL_EARTHING_DESIGN",
    "OPF_LOSS_LCC",
    "POWER_QUALITY_HARMONICS",
    "RELIABILITY_CONTINGENCY",
    "SSCI_IMPEDANCE",
    "TRANSIENT_TRV",
    "UNCERTAINTY_SENSITIVITY",
    "VOLTAGE_STABILITY",
]


def test_advanced_solver_capability_registry_is_complete_and_real() -> None:
    expected = {
        "SC_3F",
        "SC_1F",
        "SC_2F",
        "SC_2F_G",
        "LOAD_FLOW_NR",
        "LOAD_FLOW_GS_DIAGNOSTIC",
        "LOAD_FLOW_FD_PERFORMANCE",
        # Karta W5-D (2026-09-16): rozpływ niesymetryczny (BFS per faza) jako bieg
        # produktu `PF_UNBALANCED` — nowa zdolność w rejestrze.
        "LOAD_FLOW_UNBALANCED_BFS",
        "PHASE_STATE_SN",
        # Karta AB-1a D1 (2026-09-23): dwa rodzaje biegow obslugiwane przez dyspozytor
        # `enm/canonical_analysis.py`, a nieobecne w rejestrze — `protection_sn` i
        # `dynamika_rms` (przeglad adwersarialny §5.2). Test parytetu dyspozytor <->
        # rejestr (`tests/application/test_rejestr_domen_fizycznych.py`) wymaga obu.
        "PROTECTION_SN",
        "DYNAMIKA_RMS",
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
    # dwóch jest UCZCIWE.
    wycofane = {"HOSTING_CAPACITY", "OPF_LOSS_LCC"}
    assert set(SOLVER_CAPABILITY_REGISTRY) == expected
    for capability in SOLVER_CAPABILITY_REGISTRY.values():
        oczekiwana_dostepnosc = "withdrawn" if capability.capability in wycofane else "available"
        assert capability.availability == oczekiwana_dostepnosc, capability.capability
        assert capability.implementation_status == "implemented"
        assert capability.proof_support is True
        # Intencja dawnej asercji `reportable is True` („rejestr mowi prawde o
        # raportowalnosci") zostaje — ale prawda pochodzi teraz z proweniencji.
        assert capability.reportable is (
            capability.capability not in NIERAPORTOWALNE_ZMIERZONE
        ), capability.capability
        assert capability.output_contract
        assert capability.reference_test.endswith(".py") or ".py::" in capability.reference_test


def test_advanced_solver_capability_contract_reports_full_support() -> None:
    contract = solver_capabilities_contract()

    assert contract["contract"] == "SolverCapabilityRegistryV1"
    # Karta W3-E: dwie zdolności "withdrawn" — `all_available` jest UCZCIWIE False.
    assert contract["all_available"] is False
    assert contract["all_implemented"] is True
    assert contract["all_proof_supported"] is True
    # Karta AB-1a D1: `all_reportable` jest UCZCIWIE False, a lista nieraportowalnych
    # jest NAZWANA w kontrakcie (nie tylko zagregowana do jednego `false`).
    assert contract["all_reportable"] is False
    assert contract["not_reportable"] == NIERAPORTOWALNE_ZMIERZONE
    # W3-D (2026-09-09): 25 -> 23 (kasacja source_compliance x2); W3-E: 2 pozycje "withdrawn", nie skasowane;
    # W5-D (2026-09-16): 23 -> 24 (LOAD_FLOW_UNBALANCED_BFS — rozpływ niesymetryczny jako bieg produktu);
    # AB-1a D1 (2026-09-23): 24 -> 26 (PROTECTION_SN, DYNAMIKA_RMS — biegi dyspozytora bez wpisu).
    assert len(contract["capabilities"]) == 26
    niedostepne = sorted(
        item["capability"]
        for item in contract["capabilities"]
        if item["availability"] != "available"
    )
    assert niedostepne == ["HOSTING_CAPACITY", "OPF_LOSS_LCC"]
    for item in contract["capabilities"]:
        if not item["reportable"]:
            ocena = item["ocena_dowodowa"]
            assert ocena["regulatory_evidence_eligible"] is False
            assert ocena["rationale_pl"], item["capability"]
            assert ocena["tier"] != "VALIDATED_SIMULATION", item["capability"]
