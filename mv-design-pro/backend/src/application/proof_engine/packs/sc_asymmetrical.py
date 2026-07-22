"""
SC Asymmetrical Proof Pack — Pakiet dowodowy dla zwarć asymetrycznych

STATUS: CANONICAL & BINDING
Reference: P11_1c_SC_ASYMMETRICAL.md, PROOF_SCHEMAS.md, §4.1 EXECPLAN

Generuje pakiet dowodowy zawierający dowody dla WSZYSTKICH typów
zwarć asymetrycznych IEC 60909:
- 1F-Z (jednofazowe doziemne)
- 2F   (dwufazowe)
- 2F-Z (dwufazowe doziemne)

Każdy dowód zawiera OBOWIĄZKOWE wyniki:
- I''k (początkowy prąd zwarciowy)
- ip   (prąd udarowy)
- I_th (prąd cieplny równoważny)
- I_dyn (prąd dynamiczny)

INVARIANTS:
- Fizyka WYŁĄCZNIE w warstwie solverów (V12K-118): wielkości zwarciowe liczy
  ``compute_sc1_asymmetrical_quantities`` (network_model/solvers), a generator
  dowodu dostaje gotowy wynik i wyłącznie formatuje kroki (NOT-A-SOLVER)
- Deterministic (same input → identical output)
- Anti-double-counting c (c appears ONLY in EQ_SC1_008)
- LaTeX-only math (all formulas in block LaTeX)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from application.proof_engine.proof_generator import ProofGenerator, SC1Input
from application.proof_engine.proof_pack import ProofPackBuilder, ProofPackContext
from application.proof_engine.types import ProofDocument
from network_model.solvers.short_circuit_asymmetrical_quantities import (
    compute_sc1_asymmetrical_quantities,
)


@dataclass
class SCAsymmetricalPackInput:
    """
    Dane wejściowe dla pakietu dowodowego SC Asymmetrical.

    Zawiera wspólne parametry sieci (impedancje składowe) oraz
    konfigurację dla generowania dowodów 1F-Z, 2F, 2F-Z.
    """

    project_name: str
    case_name: str
    fault_node_id: str
    run_timestamp: datetime
    solver_version: str

    # Dane znamionowe
    u_n_kv: float
    c_factor: float
    u_prefault_kv: float

    # Impedancje składowe (wymagane dla wszystkich typów)
    z1_ohm: complex
    z2_ohm: complex
    z0_ohm: complex

    # Operator Fortescue (domyślnie a = e^{j120°})
    a_operator: complex

    # Post-fault parameters
    tk_s: float = 1.0
    m_factor: float = 1.0
    n_factor: float = 0.0


@dataclass(frozen=True)
class SCAsymmetricalPackResult:
    """
    Wynik pakietu dowodowego SC Asymmetrical.

    Zawiera:
    - proof_1fz: Dowód zwarcia 1F-Z
    - proof_2f:  Dowód zwarcia 2F
    - proof_2fz: Dowód zwarcia 2F-Z
    - all_passed: Czy wszystkie unit checks przeszły
    """

    proof_1fz: ProofDocument
    proof_2f: ProofDocument
    proof_2fz: ProofDocument
    all_passed: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "proof_1fz": self.proof_1fz.to_dict(),
            "proof_2f": self.proof_2f.to_dict(),
            "proof_2fz": self.proof_2fz.to_dict(),
            "all_passed": self.all_passed,
        }


class SCAsymmetricalProofPack:
    """
    Generator pakietu dowodowego SC Asymmetrical.

    Generuje dowody dla WSZYSTKICH trzech typów zwarć asymetrycznych
    z jednego zestawu danych wejściowych.
    """

    FAULT_TYPES = ("ONE_PHASE_TO_GROUND", "TWO_PHASE", "TWO_PHASE_TO_GROUND")

    @classmethod
    def generate(
        cls,
        data: SCAsymmetricalPackInput,
        artifact_id: UUID | None = None,
    ) -> SCAsymmetricalPackResult:
        """
        Generuje kompletny pakiet dowodowy SC Asymmetrical.

        Args:
            data: Dane wejściowe
            artifact_id: Opcjonalny wspólny artifact_id

        Returns:
            SCAsymmetricalPackResult z trzema dowodami
        """
        if artifact_id is None:
            artifact_id = uuid4()

        proofs: dict[str, ProofDocument] = {}
        for fault_type in cls.FAULT_TYPES:
            # Fizyka w warstwie solverów (NOT-A-SOLVER): komplet wielkości
            # zwarciowych liczy solver, generator dowodu tylko formatuje.
            quantities = compute_sc1_asymmetrical_quantities(
                fault_type=fault_type,
                u_n_kv=data.u_n_kv,
                c_factor=data.c_factor,
                u_prefault_kv=data.u_prefault_kv,
                z1_ohm=data.z1_ohm,
                z2_ohm=data.z2_ohm,
                z0_ohm=data.z0_ohm,
                a_operator=data.a_operator,
                m_factor=data.m_factor,
                n_factor=data.n_factor,
            )
            sc1_input = SC1Input(
                project_name=data.project_name,
                case_name=f"{data.case_name} — {fault_type}",
                fault_node_id=data.fault_node_id,
                fault_type=fault_type,
                run_timestamp=data.run_timestamp,
                solver_version=data.solver_version,
                u_n_kv=data.u_n_kv,
                c_factor=data.c_factor,
                u_prefault_kv=data.u_prefault_kv,
                z1_ohm=data.z1_ohm,
                z2_ohm=data.z2_ohm,
                z0_ohm=data.z0_ohm,
                a_operator=data.a_operator,
                tk_s=data.tk_s,
                m_factor=data.m_factor,
                n_factor=data.n_factor,
                quantities=quantities,
            )
            proofs[fault_type] = ProofGenerator.generate_sc1_proof(sc1_input, artifact_id)

        all_passed = all(p.summary.unit_check_passed for p in proofs.values())

        return SCAsymmetricalPackResult(
            proof_1fz=proofs["ONE_PHASE_TO_GROUND"],
            proof_2f=proofs["TWO_PHASE"],
            proof_2fz=proofs["TWO_PHASE_TO_GROUND"],
            all_passed=all_passed,
        )

    @classmethod
    def generate_zip(
        cls,
        data: SCAsymmetricalPackInput,
        context: ProofPackContext,
    ) -> dict[str, bytes]:
        """
        Generuje ZIP-y z dowodami dla każdego typu zwarcia.

        Returns:
            dict mapping fault_type → ZIP bytes
        """
        result = cls.generate(data)
        builder = ProofPackBuilder(context)

        return {
            "SC1FZ": builder.build(result.proof_1fz),
            "SC2F": builder.build(result.proof_2f),
            "SC2FZ": builder.build(result.proof_2fz),
        }

    @classmethod
    def validate_completeness(cls, result: SCAsymmetricalPackResult) -> list[str]:
        """
        Weryfikuje kompletność pakietu dowodowego.

        MANDATORY results per §4.1:
        - ikss_ka (I''k)
        - ip_ka (ip)
        - ith_ka (I_th)
        - idyn_ka (I_dyn)

        Returns:
            Lista brakujących kluczy (pusta = PASS)
        """
        required_keys = {"ikss_ka", "ip_ka", "ith_ka", "idyn_ka"}
        missing: list[str] = []

        for label, proof in [
            ("1F-Z", result.proof_1fz),
            ("2F", result.proof_2f),
            ("2F-Z", result.proof_2fz),
        ]:
            for key in required_keys:
                if key not in proof.summary.key_results:
                    missing.append(f"{label}: {key}")

        return missing
