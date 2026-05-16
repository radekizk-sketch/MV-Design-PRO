"""
Earthing / Ground Fault SN Proof Pack — Pakiet dowodowy uziemienia i doziemienia SN

STATUS: CANONICAL & BINDING
Reference: P19_EARTHING_GROUND_FAULT_SN.md, V12K-015

Generuje pakiet dowodowy dla:
- Uziemień stanowisk SN (R_u, U_t, U_d)
- Prądu doziemnego (zwarcia 1F-Z w sieciach o niskim/skompensowanym/izolowanym
  punkcie neutralnym)
- Napięcia zerowego U_0 i rozpływu prądu przez uziom I_u vs. ścieżki pozostałe I_p
- Impedancji uziemienia Z_E

Pakiet domyka brakujący P0 element z IMPLEMENTATION_GAP_ANALYSIS § 2.3
i V12K-015 w REJESTR_KONFLIKTOW (ProofType.EARTHING_GROUND_FAULT_SN
zdefiniowany od dawna, ale brak standalone pack/ wrappera).

INVARIANTS:
- Solver untouched — pack tylko mapuje wyniki na ProofDocument
- Deterministic — same input → identical proof
- LaTeX-only math
- Jednostki explicit (Ω, V, A) — bez fabrykacji
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from application.proof_engine.proof_generator import ProofGenerator
from application.proof_engine.types import EarthingGroundFaultInput, ProofDocument


@dataclass
class EarthingGroundFaultPackInput:
    """
    Dane wejściowe dla pakietu dowodowego Earthing / Ground Fault SN.

    Pack-level wrapper nad EarthingGroundFaultInput (tożsamy zakres pól,
    pack zachowuje spójność API jak vdrop/sc_asymmetrical/qu_regulation).
    """

    project_name: str
    case_name: str
    run_timestamp: datetime
    solver_version: str
    fault_location: str | None = None
    fault_type: str | None = None
    earthing_mode: str | None = None  # np. "rezystor 200 Ω" / "Petersen coil" / "izolowana"
    u0_v: float | None = None
    z_e_ohm: float | None = None
    i_u_a: float | None = None
    i_p_a: float | None = None
    r_u_ohm: float | None = None

    def to_generator_input(self) -> EarthingGroundFaultInput:
        """Konwersja do formatu wymaganego przez ProofGenerator."""
        return EarthingGroundFaultInput(
            project_name=self.project_name,
            case_name=self.case_name,
            run_timestamp=self.run_timestamp,
            solver_version=self.solver_version,
            fault_location=self.fault_location,
            fault_type=self.fault_type,
            earthing_mode=self.earthing_mode,
            u0_v=self.u0_v,
            z_e_ohm=self.z_e_ohm,
            i_u_a=self.i_u_a,
            i_p_a=self.i_p_a,
            r_u_ohm=self.r_u_ohm,
        )


def generate_earthing_ground_fault_pack(
    pack_input: EarthingGroundFaultPackInput,
    artifact_id: UUID | None = None,
) -> ProofDocument:
    """
    Generuje pakiet dowodowy Earthing / Ground Fault SN.

    Wrapper nad ProofGenerator.generate_earthing_ground_fault_proof
    zapewniający spójny pack-level kontrakt.

    Args:
        pack_input: Dane wejściowe pakietu
        artifact_id: Opcjonalny ID artefaktu

    Returns:
        ProofDocument z dowodem uziemienia gotowym do eksportu
        (JSON / LaTeX / PDF / DOCX).
    """
    if artifact_id is None:
        artifact_id = uuid4()

    return ProofGenerator.generate_earthing_ground_fault_proof(
        pack_input.to_generator_input(),
        artifact_id=artifact_id,
    )


def serialize_earthing_pack(document: ProofDocument) -> dict[str, Any]:
    """Serializuje pakiet Earthing do słownika (kompatybilny z API response)."""
    return {
        "pack_type": "EARTHING_GROUND_FAULT_SN",
        "artifact_id": str(document.artifact_id),
        "created_at": document.created_at.isoformat(),
        "title_pl": document.title_pl,
        "proof": document.to_dict(),
        "summary": {
            "total_steps": document.summary.total_steps,
            "proof_type": document.proof_type.value,
        },
    }
