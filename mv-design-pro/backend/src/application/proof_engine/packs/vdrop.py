"""
VDROP Proof Pack — Pakiet dowodowy spadku napięcia

STATUS: CANONICAL & BINDING
Reference: EQUATIONS_VDROP.md, P11_1a_MVP_SC3F_AND_VDROP.md, V12K-015

Generuje pakiet dowodowy spadku napięcia (voltage drop) na ŁAŃCUCHU odcinków
od źródła do wskazanego punktu (karta P0.5b, 2026-08-13 — likwidacja limitu
MVP=1 i drugiej formuły ΔU, N-D6). Pakiet domyka brakujący P0 element z
IMPLEMENTATION_GAP_ANALYSIS § 2.3 i V12K-015 w REJESTR_KONFLIKTOW.

Kroki obowiązkowe dowodu (per generate_vdrop_proof w ProofGenerator), PER
ODCINEK linii/kabla na łańcuchu:
1. Rezystancja odcinka R = r_per_km × L
2. Reaktancja odcinka X = x_per_km × L
3. Składowa czynna ΔU_R = R·P / U_n² × 100%
4. Składowa bierna ΔU_X = X·Q / U_n² × 100%
5. Spadek na odcinku ΔU = ΔU_R + ΔU_X

PER GRANICA TRANSFORMATORA na łańcuchu (uzgodnienie U4, EQ_VDROP_010):
zmiana podstawy napięcia U_1→U_2 z rozwiązania rozpływu — transformator NIE
JEST odcinkiem VDROP (zmienia napięcie przekładnią, nie spadkiem wzdłużnym).

Kroki końcowe (raz, po całym łańcuchu):
6. Suma spadków ΔU_total (%, prezentacyjna — łańcuch multi-segment)
7. Napięcie w punkcie U_target = U_source − ΔU_total^{kV} (kV, karta
   PODSTAWA-VDROP 2026-08-12, rozszerzona kartą P0.5b na łańcuch n≥1: odjęcie
   w kV, nie mnożenie U_source przez ułamek % odniesiony do U_n — te dwie
   podstawy mieszały się, gdy U_source ≠ U_n; suma w kV pozostaje spójna także
   gdy łańcuch krzyżuje transformator i zmienia podstawę napięcia)

Eksport: JSON + LaTeX + PDF + DOCX (V12K-007 light_technical).

DROGA DO INŻYNIERA (karta PACK-BEZ-KONSUMENTA). Do 2026-08-08 ten generator nie
miał ŻADNEGO konsumenta poza własnym re-eksportem w ``packs/__init__.py``.
Konsumentem jest brama pakietu przebiegu (``application/proof_engine/pakiet_biegu.py``
→ ``GET /api/analysis-runs/{run}/pakiet-dowodowy?punkt=<odcinek>``): pakiet biegu
rozpływu jest ZBIORCZY i niesie dowód spadku napięcia dla ŁAŃCUCHA od źródła do
ODCINKA WSKAZANEGO przez użytkownika — tą samą drogą, którą wskazuje się punkt
zwarcia. Odcinek (koniec łańcucha) wybiera użytkownik ze zbioru odcinków, które
bieg policzył (``application/solvers/voltage_drop_binding.py``); łańcuch od
źródła do niego składa ``application/proof_engine/vdrop_chain_binding.py``
(REUŻYCIE dekompozycji ΔU per odcinek P0.4, ``analysis/voltage_profile/
segment_decomposition.py``, jako jedynego źródła topologii ścieżki — kod NIE
wybiera punktu za użytkownika, bo wybór za użytkownika byłby fabrykacją ZAKRESU
dowodu).

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
    VDROPTransformerBoundaryInput,
)
from application.proof_engine.proof_pack import (
    ProofPackBuilder,
    ProofPackContext,
    deterministic_artifact_id,
    dokument_deterministyczny,
)
from application.proof_engine.types import ProofDocument

if TYPE_CHECKING:
    from application.proof_engine.vdrop_chain_binding import LancuchSpadkuNapiecia


@dataclass
class VDROPPackSegment:
    """Pojedynczy odcinek (linia/kabel) dla pakietu VDROP."""

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
class VDROPPackTransformerBoundary:
    """Granica transformatora na łańcuchu pakietu VDROP (karta P0.5b, U4).

    Odpowiednik ``VDROPTransformerBoundaryInput`` na poziomie pakietu — patrz
    docstring tamtej klasy dla uzasadnienia (transformator poza domeną VDROP).
    """

    segment_id: str
    from_bus_id: str
    to_bus_id: str
    u_primary_kv: float
    u_secondary_kv: float


@dataclass
class VDROPPackInput:
    """
    Dane wejściowe dla pakietu dowodowego VDROP.

    Pack-level wrapper nad VDROPInput w ProofGenerator. Trzyma kontekst projektu
    (project_name, case_name, run_timestamp) + ŁAŃCUCH kroków (odcinki linii/kabla
    i granice transformatora, w kolejności od źródła do punktu docelowego — karta
    P0.5b) + napięcie źródłowe u_source_kv (do obliczenia U_target = U_source −
    ΔU_total, oba w kV — karta PODSTAWA-VDROP).
    """

    project_name: str
    case_name: str
    source_bus_id: str
    target_bus_id: str
    run_timestamp: datetime
    solver_version: str
    segments: list[VDROPPackSegment | VDROPPackTransformerBoundary]
    u_source_kv: float

    @classmethod
    def z_lancucha_biegu(
        cls,
        lancuch: LancuchSpadkuNapiecia,
        *,
        project_name: str,
        case_name: str,
        run_timestamp: datetime,
        solver_version: str,
    ) -> VDROPPackInput:
        """Składa wejście dowodu z ŁAŃCUCHA odtworzonego z zapisu biegu (karta P0.5b).

        ZERO FABRYKACJI I ZERO ZEGARA (karta PACK-BEZ-KONSUMENTA, rozszerzona
        na łańcuch kartą P0.5b — ta sama klasa defektu). Łańcuch REUŻYWA
        dekompozycji ΔU per odcinek P0.4 (``analysis/voltage_profile/
        segment_decomposition.py``) jako JEDYNEGO źródła topologii ścieżki
        źródło→punkt (``application/proof_engine/vdrop_chain_binding.py``);
        fizyczne parametry odcinków linii/kabla pochodzą z ISTNIEJĄCEJ warstwy
        wiązania (``application/solvers/voltage_drop_binding.py``) — bez
        powielania ani drugiej ekstrakcji R/X/P/Q.

        ``u_source_kv`` to napięcie POCZĄTKU łańcucha (źródło ścieżki, domyślnie
        SLACK) POLICZONE PRZEZ SOLVER, a nie napięcie znamionowe. Dzięki temu
        ostatni krok dowodu (``U = U_źr − ΔU_total``, oba w kV — karta
        PODSTAWA-VDROP) jest zakotwiczony w tym samym przebiegu, który dowód
        opisuje. ΔU_total w kV pochodzi z sumy wkładów WSZYSTKICH kroków
        łańcucha (EQ_VDROP_001..005 per odcinek, EQ_VDROP_010 per granica
        transformatora), NIE z ``u_source_kv`` powyżej ani z żadnej innej
        wielkości spoza tego łańcucha — inaczej krok końcowy dowodziłby
        cyrkularnie.
        """
        segments: list[VDROPPackSegment | VDROPPackTransformerBoundary] = []
        for krok in lancuch.kroki:
            if krok.jest_transformatorem:
                segments.append(
                    VDROPPackTransformerBoundary(
                        segment_id=krok.segment_id,
                        from_bus_id=krok.from_bus,
                        to_bus_id=krok.to_bus,
                        u_primary_kv=krok.u_from_kv,
                        u_secondary_kv=krok.u_to_kv,
                    )
                )
                continue
            fizyka = krok.odcinek_fizyczny
            if fizyka is None:
                raise ValueError(
                    f"Krok łańcucha '{krok.segment_id}' nie jest transformatorem, "
                    "ale nie niesie danych fizycznych odcinka — niezmiennik "
                    "LancuchSpadkuNapiecia naruszony."
                )
            segments.append(
                VDROPPackSegment(
                    segment_id=fizyka.id_galezi,
                    from_bus_id=fizyka.od_szyny,
                    to_bus_id=fizyka.do_szyny,
                    r_ohm_per_km=fizyka.r_ohm_per_km,
                    x_ohm_per_km=fizyka.x_ohm_per_km,
                    length_km=fizyka.length_km,
                    p_mw=fizyka.p_mw,
                    q_mvar=fizyka.q_mvar,
                    u_n_kv=fizyka.u_n_kv,
                )
            )
        return cls(
            project_name=project_name,
            case_name=case_name,
            source_bus_id=lancuch.source_id,
            target_bus_id=lancuch.target_id,
            run_timestamp=run_timestamp,
            solver_version=solver_version,
            segments=segments,
            u_source_kv=lancuch.u_source_kv,
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
                (
                    VDROPTransformerBoundaryInput(
                        segment_id=s.segment_id,
                        from_bus_id=s.from_bus_id,
                        to_bus_id=s.to_bus_id,
                        u_primary_kv=s.u_primary_kv,
                        u_secondary_kv=s.u_secondary_kv,
                    )
                    if isinstance(s, VDROPPackTransformerBoundary)
                    else VDROPSegmentInput(
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
        ValueError: gdy segments jest puste (łańcuch bez kroków).
    """
    if artifact_id is None:
        artifact_id = uuid4()

    return ProofGenerator.generate_vdrop_proof(
        pack_input.to_generator_input(),
        artifact_id=artifact_id,
    )


def rozroznik_vdrop(pack_input: VDROPPackInput) -> str:
    """Rozróżnik tożsamości dokumentu spadku w pakiecie ZBIORCZYM przebiegu.

    Zawiera identyfikator ODCINKA WYBRANEGO przez użytkownika (``punkt`` —
    koniec łańcucha, karta P0.5b): dwa pakiety tego samego przebiegu, złożone dla
    różnych punktów docelowych, muszą mieć różne identyfikaty artefaktu — inaczej
    twierdziłyby, że dokumentują to samo. OSTATNI krok łańcucha, NIE pierwszy —
    dwa różne punkty mogą dzielić wspólny POCZĄTEK trasy (ten sam pierwszy
    odcinek od źródła), a to właśnie KONIEC łańcucha jest tym, co użytkownik
    wskazał (``_wybierz_odcinek``/``zbuduj_lancuch_spadku`` w
    ``pakiet_biegu.py``/``vdrop_chain_binding.py``); rozróżnik po pierwszym
    kroku zlepiałby ich tożsamości. Bez kroków (pusta lista) rozróżnik jest samą
    nazwą rodzaju — ale takiego wejścia generator i tak nie przyjmuje.
    """
    id_odcinka = pack_input.segments[-1].segment_id if pack_input.segments else ""
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
