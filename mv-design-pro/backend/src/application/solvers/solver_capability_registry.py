from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

AnalysisCapability = Literal[
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
]


@dataclass(frozen=True)
class SolverCapability:
    capability: AnalysisCapability
    analysis_type: str
    availability: Literal["available"]
    implementation_status: Literal["implemented"]
    solver_version: str
    required_inputs: tuple[str, ...]
    output_contract: str
    proof_support: bool
    reportable: bool
    reference_test: str
    applicability: str

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


SOLVER_CAPABILITY_REGISTRY: dict[AnalysisCapability, SolverCapability] = {
    "SC_3F": SolverCapability(
        capability="SC_3F",
        analysis_type="short_circuit_sn",
        availability="available",
        implementation_status="implemented",
        solver_version="iec60909-sn-v1",
        required_inputs=("snapshot", "fault_node_id", "voltage_level_kv"),
        output_contract="ShortCircuitResultV1",
        proof_support=True,
        reportable=True,
        reference_test="short-circuit-all-fault-types.test.py::test_short_circuit_three_phase_reportable",
        applicability="Zwarcie trojfazowe na wezle SN zgodnie z IEC 60909.",
    ),
    "SC_1F": SolverCapability(
        capability="SC_1F",
        analysis_type="short_circuit_sn",
        availability="available",
        implementation_status="implemented",
        solver_version="iec60909-sn-v1",
        required_inputs=("snapshot", "fault_node_id", "zero_sequence_network", "grounding_model"),
        output_contract="ShortCircuitResultV1",
        proof_support=True,
        reportable=True,
        reference_test="short-circuit-all-fault-types.test.py::test_short_circuit_single_phase_reportable",
        applicability="Zwarcie jednofazowe doziemne z siecia zerowa, pojemnosciami doziemnymi i uziemieniem.",
    ),
    "SC_2F": SolverCapability(
        capability="SC_2F",
        analysis_type="short_circuit_sn",
        availability="available",
        implementation_status="implemented",
        solver_version="iec60909-sn-v1",
        required_inputs=(
            "snapshot",
            "fault_node_id",
            "positive_sequence_network",
            "negative_sequence_network",
        ),
        output_contract="ShortCircuitResultV1",
        proof_support=True,
        reportable=True,
        reference_test="short-circuit-all-fault-types.test.py::test_short_circuit_two_phase_reportable",
        applicability="Zwarcie dwufazowe bez udzialu ziemi.",
    ),
    "SC_2F_G": SolverCapability(
        capability="SC_2F_G",
        analysis_type="short_circuit_sn",
        availability="available",
        implementation_status="implemented",
        solver_version="iec60909-sn-v1",
        required_inputs=("snapshot", "fault_node_id", "zero_sequence_network", "grounding_model"),
        output_contract="ShortCircuitResultV1",
        proof_support=True,
        reportable=True,
        reference_test="short-circuit-all-fault-types.test.py::test_short_circuit_two_phase_ground_reportable",
        applicability="Zwarcie dwufazowe z ziemia z uwzglednieniem toru zerowego.",
    ),
    "LOAD_FLOW_NR": SolverCapability(
        capability="LOAD_FLOW_NR",
        analysis_type="PF",
        availability="available",
        implementation_status="implemented",
        solver_version="load-flow-nr-v1",
        required_inputs=("snapshot", "slack_node", "pq_nodes", "branch_admittance"),
        output_contract="PowerFlowResultV1",
        proof_support=True,
        reportable=True,
        reference_test="load-flow-nr-reference.test.py::test_newton_result_contract",
        applicability="Kanoniczny rozpływ mocy Newtona-Raphsona.",
    ),
    "LOAD_FLOW_GS_DIAGNOSTIC": SolverCapability(
        capability="LOAD_FLOW_GS_DIAGNOSTIC",
        analysis_type="PF",
        availability="available",
        implementation_status="implemented",
        solver_version="load-flow-gs-v1",
        required_inputs=("snapshot", "slack_node", "pq_nodes", "branch_admittance"),
        output_contract="PowerFlowResultV1",
        proof_support=True,
        reportable=True,
        reference_test="load-flow-gs-diagnostic.test.py::test_gauss_seidel_trace_and_report_status",
        applicability="Tryb diagnostyczny Gaussa-Seidla dla przypadkow zbieznosciowo kontrolowanych.",
    ),
    "LOAD_FLOW_FD_PERFORMANCE": SolverCapability(
        capability="LOAD_FLOW_FD_PERFORMANCE",
        analysis_type="PF",
        availability="available",
        implementation_status="implemented",
        solver_version="load-flow-fd-v1",
        required_inputs=(
            "snapshot",
            "slack_node",
            "pq_nodes",
            "branch_admittance",
            "xd_ratio_applicability",
        ),
        output_contract="PowerFlowResultV1",
        proof_support=True,
        reportable=True,
        reference_test="load-flow-fast-decoupled.test.py::test_fast_decoupled_trace_and_applicability",
        applicability="Tryb wydajnosciowy fast-decoupled przy spelnionych warunkach stosowalnosci.",
    ),
    "PHASE_STATE_SN": SolverCapability(
        capability="PHASE_STATE_SN",
        analysis_type="phase_state_sn",
        availability="available",
        implementation_status="implemented",
        solver_version="phase-state-sn-v1",
        required_inputs=("snapshot", "phase_loads", "open_phase_flags"),
        output_contract="PhaseStateSNResultV1",
        proof_support=True,
        reportable=True,
        reference_test="phase-state-sn-reference.test.py::test_phase_state_has_proof",
        applicability="Analiza stanu fazowego SN dla asymetrii, przerw fazowych i niezrownowazenia.",
    ),
    "SOURCE_FRT_LVRT_HVRT": SolverCapability(
        capability="SOURCE_FRT_LVRT_HVRT",
        analysis_type="source_compliance",
        availability="available",
        implementation_status="implemented",
        solver_version="source-compliance-v1",
        required_inputs=("source_type", "operator_profile", "source_profile", "frt_curve"),
        output_contract="SourceComplianceResultV1",
        proof_support=True,
        reportable=True,
        reference_test="frt-lvrt-hvrt-compliance.test.py::test_source_frt_compliance_for_supported_sources",
        applicability="PV, BESS oraz farmy wiatrowe PMSG, DFIG i SCIG z LVRT/HVRT/FRT.",
    ),
    "DYNAMIC_STABILITY": SolverCapability(
        capability="DYNAMIC_STABILITY",
        analysis_type="dynamic_stability",
        availability="available",
        implementation_status="implemented",
        solver_version="dynamic-stability-v1",
        required_inputs=("source_state", "fault_clear_scenario", "critical_clear_time"),
        output_contract="DynamicStabilityResultV1",
        proof_support=True,
        reportable=True,
        reference_test="dynamic-stability-reference.test.py::test_fault_clear_stability_reportable",
        applicability="Ocena stabilnosci w zdefiniowanym zakresie zaklocen i czasu wylaczenia.",
    ),
    "SOURCE_COMPLIANCE": SolverCapability(
        capability="SOURCE_COMPLIANCE",
        analysis_type="source_compliance",
        availability="available",
        implementation_status="implemented",
        solver_version="source-compliance-v1",
        required_inputs=("source_type", "operator_profile", "source_profile", "grid_code_profile"),
        output_contract="SourceComplianceResultV1",
        proof_support=True,
        reportable=True,
        reference_test="advanced-results-reportability.test.py::test_source_compliance_reportable",
        applicability="Zgodnosc przyłączeniowa z profilami operatora, Q(U), cos phi(P), FRT/LVRT/HVRT.",
    ),
    "POWER_QUALITY_HARMONICS": SolverCapability(
        capability="POWER_QUALITY_HARMONICS",
        analysis_type="power_quality_harmonics",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "harmonic_sources", "branch_admittance"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_power_quality_trace_and_hash_are_deterministic",
        applicability="Harmonic power flow, THDU/TDD, skan Z(f), rezonans i kompatybilnosc jakosci energii.",
    ),
    "SSCI_IMPEDANCE": SolverCapability(
        capability="SSCI_IMPEDANCE",
        analysis_type="ssci_impedance",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "converter_card", "fault_level"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_ssci_impedance.py::test_ssci_envelope_shape_and_arrays",
        applicability=(
            "Stabilnosc impedancyjna SSCI (Sun 2011/Wen 2016): Z_grid(f)/Z_conv(f), "
            "wzmocnienie petli mniejszej L(f) i werdykt Nyquista."
        ),
    ),
    "VOLTAGE_STABILITY": SolverCapability(
        capability="VOLTAGE_STABILITY",
        analysis_type="voltage_stability",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "load_generation_balance", "fault_level"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_voltage_stability_returns_modal_contract",
        applicability="P-V, Q-V, modalny wskaznik krytyczny i L-Index dla wezlow SN.",
    ),
    "RELIABILITY_CONTINGENCY": SolverCapability(
        capability="RELIABILITY_CONTINGENCY",
        analysis_type="reliability_contingency",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "failure_rates", "mttr", "customer_counts"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_reliability_indices_are_reportable",
        applicability="Ranking N-1/N-2 oraz SAIDI/SAIFI/CAIDI/MAIFI.",
    ),
    "EARTHING_SAFETY": SolverCapability(
        capability="EARTHING_SAFETY",
        analysis_type="earthing_safety",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "soil_model", "grid_geometry", "fault_current"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_earthing_uses_ieee80_contract",
        applicability="IEEE 80 / PN-EN 50522: Rg, GPR, napiecie dotykowe i krokowe.",
    ),
    "NEUTRAL_EARTHING_DESIGN": SolverCapability(
        capability="NEUTRAL_EARTHING_DESIGN",
        analysis_type="neutral_earthing_design",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "line_to_earth_capacitance_b0", "neutral_earthing_type"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test=(
            "test_v126_neutral_earthing_design.py::"
            "TestPetersenResonanceTuning::test_coil_inductance_matches_resonance_formula"
        ),
        applicability=(
            "Projekt uziemienia punktu neutralnego: dlawik Petersena (kompensacja "
            "rezonansowa Ic) albo rezystor NER (dobor R i sprawdzenie cieplne)."
        ),
    ),
    "INSULATION_COORDINATION": SolverCapability(
        capability="INSULATION_COORDINATION",
        analysis_type="insulation_coordination",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "u_m", "arrester", "tov"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_insulation_margin_is_computed",
        applicability="IEC 60071/60099: BIL, MCOV, TOV i margines ogranicznika.",
    ),
    "EARTH_FAULT_DETECTION": SolverCapability(
        capability="EARTH_FAULT_DETECTION",
        analysis_type="earth_fault_detection",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("neutral_grounding", "relay_methods"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_earth_fault_method_decision_table",
        applicability="Dobor watometrycznej, admitancyjnej, transient directional albo 5 harmonicznej.",
    ),
    "TRANSIENT_TRV": SolverCapability(
        capability="TRANSIENT_TRV",
        analysis_type="transient_trv",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "breaker_rated_voltage", "trv_envelope"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_transient_trv_contract",
        applicability="TRV, inrush transformatora i alert ferrorezonansu.",
    ),
    "MOTOR_STARTING": SolverCapability(
        capability="MOTOR_STARTING",
        analysis_type="motor_starting",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "motor_cards", "source_impedance"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_motor_starting_voltage_dip",
        applicability="Zapad napiecia rozruchowego, moment-poslizg i termika I2t.",
    ),
    "HOSTING_CAPACITY": SolverCapability(
        capability="HOSTING_CAPACITY",
        analysis_type="hosting_capacity",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "stochastic_profiles", "limits"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_hosting_capacity_is_seeded",
        applicability="Stochastyczna hosting capacity OZE z deterministycznym Monte Carlo.",
    ),
    "OPF_LOSS_LCC": SolverCapability(
        capability="OPF_LOSS_LCC",
        analysis_type="opf_loss_lcc",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "branch_limits", "cost_profile"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_opf_losses_lcc_contract",
        applicability="Minimalizacja strat, energia strat, LCC i emisja CO2.",
    ),
    "BENCHMARK_VALIDATION": SolverCapability(
        capability="BENCHMARK_VALIDATION",
        analysis_type="benchmark_validation",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("benchmark_references",),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_benchmark_validation_passes_reference_contract",
        applicability="Regresja IEEE 9/14/39 oraz CIGRE MV.",
    ),
    "UNCERTAINTY_SENSITIVITY": SolverCapability(
        capability="UNCERTAINTY_SENSITIVITY",
        analysis_type="uncertainty_sensitivity",
        availability="available",
        implementation_status="implemented",
        solver_version="v126-academic-whitebox-1.0",
        required_inputs=("committed_enm", "catalog_tolerances"),
        output_contract="AcademicAnalysisResultV1",
        proof_support=True,
        reportable=True,
        reference_test="test_v126_academic_solver.py::test_uncertainty_contract",
        applicability="Niepewnosc k=2 i ranking wrazliwosci parametrow.",
    ),
}


def list_solver_capabilities() -> list[SolverCapability]:
    return [SOLVER_CAPABILITY_REGISTRY[key] for key in sorted(SOLVER_CAPABILITY_REGISTRY)]


def get_solver_capability(capability: AnalysisCapability | str) -> SolverCapability:
    key = str(capability)
    if key not in SOLVER_CAPABILITY_REGISTRY:
        raise KeyError(f"Unknown solver capability: {key}")
    return SOLVER_CAPABILITY_REGISTRY[key]  # type: ignore[index]


def solver_capabilities_by_analysis_type(analysis_type: str) -> list[SolverCapability]:
    return [
        capability
        for capability in list_solver_capabilities()
        if capability.analysis_type == analysis_type
    ]


def solver_capabilities_contract() -> dict[str, object]:
    capabilities = [capability.to_dict() for capability in list_solver_capabilities()]
    return {
        "contract": "SolverCapabilityRegistryV1",
        "capabilities": capabilities,
        "all_available": all(item["availability"] == "available" for item in capabilities),
        "all_implemented": all(
            item["implementation_status"] == "implemented" for item in capabilities
        ),
        "all_proof_supported": all(bool(item["proof_support"]) for item in capabilities),
        "all_reportable": all(bool(item["reportable"]) for item in capabilities),
    }
