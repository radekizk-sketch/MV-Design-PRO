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
        required_inputs=("snapshot", "fault_node_id", "positive_sequence_network", "negative_sequence_network"),
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
        required_inputs=("snapshot", "slack_node", "pq_nodes", "branch_admittance", "xd_ratio_applicability"),
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
