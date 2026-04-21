"""
P21: Power Flow Proof Engine - warstwa akademicka/audytowa.

Ten moduł eksportuje struktury i funkcje do generowania
formalnych dowodów matematycznych dla obliczeń Power Flow NR.
"""

from network_model.proof.power_flow_equations import (
    POWER_FLOW_EQUATION_REGISTRY,
    EquationEntry,
    SymbolDefinition,
    get_equation_by_id,
    get_equations_by_category,
)
from network_model.proof.power_flow_proof_builder import (
    PowerFlowProofBuilder,
    build_power_flow_proof,
)
from network_model.proof.power_flow_proof_document import (
    POWER_FLOW_PROOF_VERSION,
    EquationDefinition,
    FinalStateSection,
    InitialStateSection,
    IterationProofSection,
    NetworkDefinitionSection,
    PowerFlowProofDocument,
    ProofHeader,
    ProofStep,
    ProofSummary,
    ProofValue,
    UnitCheckResult,
    VerificationSection,
    generate_document_id,
    generate_step_id,
)
from network_model.proof.power_flow_proof_export import (
    export_proof_to_json,
    export_proof_to_latex,
    export_proof_to_pdf,
    export_proof_to_pdf_simple,
)

__all__ = [
    # Document structures
    "POWER_FLOW_PROOF_VERSION",
    "EquationDefinition",
    "FinalStateSection",
    "InitialStateSection",
    "IterationProofSection",
    "NetworkDefinitionSection",
    "PowerFlowProofDocument",
    "ProofHeader",
    "ProofStep",
    "ProofSummary",
    "ProofValue",
    "UnitCheckResult",
    "VerificationSection",
    "generate_document_id",
    "generate_step_id",
    # Builder
    "PowerFlowProofBuilder",
    "build_power_flow_proof",
    # Export functions
    "export_proof_to_json",
    "export_proof_to_latex",
    "export_proof_to_pdf",
    "export_proof_to_pdf_simple",
    # Equation registry
    "POWER_FLOW_EQUATION_REGISTRY",
    "EquationEntry",
    "SymbolDefinition",
    "get_equation_by_id",
    "get_equations_by_category",
]
