"""
VDROP Proof Pack — Pakiet dowodowy spadku napięcia

STATUS: CANONICAL & BINDING
Reference: EQUATIONS_VDROP.md, P11_1a_MVP_SC3F_AND_VDROP.md, V12K-015

Generuje pakiet dowodowy spadku napięcia (voltage drop) na odcinku linii/kabla
SN. Pakiet domyka brakujący P0 element z IMPLEMENTATION_GAP_ANALYSIS § 2.3
i V12K-015 w REJESTR_KONFLIKTOW.

Kroki obowiązkowe dowodu (per generate_vdrop_proof w ProofGenerator):
1. Rezystancja odcinka R = r_per_km × L
2. Reaktancja odcinka X = x_per_km × L
3. Składowa czynna ΔU_R = R·P / U_n² × 100%
4. Składowa bierna ΔU_X = X·Q / U_n² × 100%
5. Spadek na odcinku ΔU = ΔU_R + ΔU_X
6. Suma spadków ΔU_total (multi-segment ready, MVP=1)
7. Napięcie w punkcie U_target = U_source × (1 - ΔU/100)

Eksport: JSON + LaTeX + PDF + DOCX (V12K-007 light_technical).

INVARIANTS:
- Solver untouched — pack tylko mapuje wyniki na ProofDocument
- Deterministic — same input → identical proof
- LaTeX-only math (block $$...$$)
- ΔU% — bez fabrykacji jednostek (kV/V/% explicit)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from application.proof_engine.proof_generator import (
    ProofGenerator,
    VDROPInput,
    VDROPSegmentInput,
)
from application.proof_engine.types import ProofDocument


@dataclass
class VDROPPackSegment:
    """Pojedynczy odcinek dla pakietu VDROP."""

    segment_id: str
    from_bus_id: str
    to_bus_id: str
    r_ohm_per_km: float
    x_ohm_per_km: float
    length_km: float
    p_mw: float
    q_mvar: float
    u_n_kv: float


@dataclass
class VDROPPackInput:
    """
    Dane wejściowe dla pakietu dowodowego VDROP.

    Pack-level wrapper nad VDROPInput w ProofGenerator. Trzyma kontekst projektu
    (project_name, case_name, run_timestamp) + listę odcinków od source do target
    + napięcie źródłowe u_source_kv (do obliczenia U_target = U_source · (1-ΔU/100)).
    """

    project_name: str
    case_name: str
    source_bus_id: str
    target_bus_id: str
    run_timestamp: datetime
    solver_version: str
    segments: list[VDROPPackSegment]
    u_source_kv: float

    def to_generator_input(self) -> VDROPInput:
        """Konwersja do formatu wymaganego przez ProofGenerator.generate_vdrop_proof."""
        return VDROPInput(
            project_name=self.project_name,
            case_name=self.case_name,
            source_bus_id=self.source_bus_id,
            target_bus_id=self.target_bus_id,
            run_timestamp=self.run_timestamp,
            solver_version=self.solver_version,
            segments=[
                VDROPSegmentInput(
                    segment_id=s.segment_id,
                    from_bus_id=s.from_bus_id,
                    to_bus_id=s.to_bus_id,
                    r_ohm_per_km=s.r_ohm_per_km,
                    x_ohm_per_km=s.x_ohm_per_km,
                    length_km=s.length_km,
                    p_mw=s.p_mw,
                    q_mvar=s.q_mvar,
                    u_n_kv=s.u_n_kv,
                )
                for s in self.segments
            ],
            u_source_kv=self.u_source_kv,
        )


def generate_vdrop_pack(
    pack_input: VDROPPackInput,
    artifact_id: UUID | None = None,
) -> ProofDocument:
    """
    Generuje pakiet dowodowy VDROP (spadku napięcia).

    Wrapper nad ProofGenerator.generate_vdrop_proof zapewniający spójny
    pack-level kontrakt (jak sc_asymmetrical, qu_regulation, p14_power_flow,
    p16_losses, protection_settings).

    Args:
        pack_input: Dane wejściowe pakietu (project, case, segments)
        artifact_id: Opcjonalny ID artefaktu (deterministyczny gdy podany)

    Returns:
        ProofDocument z pełnym dowodem VDROP gotowym do eksportu
        (JSON / LaTeX / PDF / DOCX).

    Raises:
        ValueError: gdy segments jest pusty lub niezgodny z MVP (n=1).
    """
    if artifact_id is None:
        artifact_id = uuid4()

    return ProofGenerator.generate_vdrop_proof(
        pack_input.to_generator_input(),
        artifact_id=artifact_id,
    )


def serialize_vdrop_pack(document: ProofDocument) -> dict[str, Any]:
    """
    Serializuje pakiet VDROP do słownika (kompatybilny z API response).

    Standardowy kontrakt pack serializer: pack_type + proof + summary.
    """
    return {
        "pack_type": "VDROP",
        "artifact_id": str(document.artifact_id),
        "created_at": document.created_at.isoformat(),
        "title_pl": document.title_pl,
        "proof": document.to_dict(),
        "summary": {
            "total_steps": document.summary.total_steps,
            "proof_type": document.proof_type.value,
        },
    }
