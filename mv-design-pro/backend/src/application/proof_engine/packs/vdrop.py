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
7. Napięcie w punkcie U_target = U_source − ΔU_total (kV, karta PODSTAWA-VDROP
   2026-08-12: odjęcie w kV, nie mnożenie U_source przez ułamek % odniesiony
   do U_n — te dwie podstawy mieszały się, gdy U_source ≠ U_n)

Eksport: JSON + LaTeX + PDF + DOCX (V12K-007 light_technical).

DROGA DO INŻYNIERA (karta PACK-BEZ-KONSUMENTA). Do 2026-08-08 ten generator nie
miał ŻADNEGO konsumenta poza własnym re-eksportem w ``packs/__init__.py``.
Konsumentem jest brama pakietu przebiegu (``application/proof_engine/pakiet_biegu.py``
→ ``GET /api/analysis-runs/{run}/pakiet-dowodowy?punkt=<odcinek>``): pakiet biegu
rozpływu jest ZBIORCZY i niesie dowód spadku napięcia dla ODCINKA WSKAZANEGO przez
użytkownika — tą samą drogą, którą wskazuje się punkt zwarcia. Odcinek wybiera
użytkownik ze zbioru odcinków, które bieg policzył (``application/solvers/
voltage_drop_binding.py``); kod go NIE wybiera, bo wybór za użytkownika byłby
fabrykacją ZAKRESU dowodu.

INVARIANTS:
- Solver untouched — pack tylko mapuje wyniki na ProofDocument
- Deterministic — same input → identical proof
- LaTeX-only math (block $$...$$)
- ΔU% — bez fabrykacji jednostek (kV/V/% explicit)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

from application.proof_engine.proof_generator import (
    ProofGenerator,
    VDROPInput,
    VDROPSegmentInput,
)
from application.proof_engine.proof_pack import (
    ProofPackBuilder,
    ProofPackContext,
    deterministic_artifact_id,
    dokument_deterministyczny,
)
from application.proof_engine.types import ProofDocument

if TYPE_CHECKING:
    from application.solvers.voltage_drop_binding import OdcinekSpadku


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
    + napięcie źródłowe u_source_kv (do obliczenia U_target = U_source − ΔU_total,
    oba w kV — karta PODSTAWA-VDROP).
    """

    project_name: str
    case_name: str
    source_bus_id: str
    target_bus_id: str
    run_timestamp: datetime
    solver_version: str
    segments: list[VDROPPackSegment]
    u_source_kv: float

    @classmethod
    def z_odcinka_biegu(
        cls,
        odcinek: OdcinekSpadku,
        *,
        project_name: str,
        case_name: str,
        run_timestamp: datetime,
        solver_version: str,
    ) -> VDROPPackInput:
        """Składa wejście dowodu z ODCINKA odtworzonego z zapisu biegu.

        ZERO FABRYKACJI I ZERO ZEGARA (karta PACK-BEZ-KONSUMENTA — ta sama klasa
        defektu co w pakiecie rozpływu). Każdy argument jest WYMAGANY i nazwany;
        wielkości fizyczne przychodzą w komplecie z warstwy wiązania, która czyta
        je z zapisu biegu albo w ogóle nie oferuje odcinka.

        ``u_source_kv`` to napięcie POCZĄTKU odcinka POLICZONE PRZEZ SOLVER
        (``node_voltage_kv``), a nie napięcie znamionowe. Dzięki temu ostatni krok
        dowodu (``U = U_źr − ΔU_total``, oba w kV — karta PODSTAWA-VDROP) jest
        zakotwiczony w tym samym przebiegu, który dowód opisuje — a nie w
        wartości katalogowej, która z wynikiem biegu nie ma nic wspólnego.
        ΔU_total w kV pochodzi z sumy spadków odcinkowych EQ_VDROP_001..006
        (przeliczonych przez U_n odcinka), NIE z ``u_source_kv`` powyżej ani z
        żadnej innej wielkości policzonej przez solver poza kompletem R/X/P/Q —
        inaczej krok końcowy dowodziłby cyrkularnie.
        """
        return cls(
            project_name=project_name,
            case_name=case_name,
            source_bus_id=odcinek.od_szyny,
            target_bus_id=odcinek.do_szyny,
            run_timestamp=run_timestamp,
            solver_version=solver_version,
            segments=[
                VDROPPackSegment(
                    segment_id=odcinek.id_galezi,
                    from_bus_id=odcinek.od_szyny,
                    to_bus_id=odcinek.do_szyny,
                    r_ohm_per_km=odcinek.r_ohm_per_km,
                    x_ohm_per_km=odcinek.x_ohm_per_km,
                    length_km=odcinek.length_km,
                    p_mw=odcinek.p_mw,
                    q_mvar=odcinek.q_mvar,
                    u_n_kv=odcinek.u_n_kv,
                )
            ],
            u_source_kv=odcinek.u_poczatku_kv,
        )

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


def rozroznik_vdrop(pack_input: VDROPPackInput) -> str:
    """Rozróżnik tożsamości dokumentu spadku w pakiecie ZBIORCZYM przebiegu.

    Zawiera identyfikator ODCINKA: dwa pakiety tego samego przebiegu, złożone dla
    różnych odcinków, muszą mieć różne identyfikaty artefaktu — inaczej twierdziłyby,
    że dokumentują to samo. Bez odcinka (pusta lista) rozróżnik jest samą nazwą
    rodzaju — ale takiego wejścia generator i tak nie przyjmuje.
    """
    id_odcinka = pack_input.segments[0].segment_id if pack_input.segments else ""
    return f"spadek-napiecia|{id_odcinka}" if id_odcinka else "spadek-napiecia"


def zbuduj_zip_vdrop(
    pack_input: VDROPPackInput,
    context: ProofPackContext,
    artifact_id: UUID | None = None,
) -> bytes:
    """Zbuduj ZIP pakietu dowodowego spadku (dowód, źródło, wykaz, odcisk).

    Ta sama mechanika co ``P14PowerFlowProof.generate_zip`` — REUŻYCIE
    ``ProofPackBuilder``, nie druga droga pakowania. Bez jawnego ``artifact_id``
    tożsamość artefaktu i dokumentu wyprowadzamy z tożsamości pakietu wraz z
    rozróżnikiem odcinka, a znacznik dokumentu z PRZEBIEGU — inaczej dwa pobrania
    tego samego przebiegu różniłyby się bajtami, wbrew deklaracji ``manifest.json``.
    """
    rozroznik = rozroznik_vdrop(pack_input)
    dokument = generate_vdrop_pack(
        pack_input,
        artifact_id=artifact_id or deterministic_artifact_id(context, rozroznik),
    )
    return ProofPackBuilder(context).build(
        dokument_deterministyczny(dokument, context, pack_input.run_timestamp, rozroznik)
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
