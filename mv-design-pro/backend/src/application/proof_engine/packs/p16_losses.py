"""Pakiet dowodowy STRAT MOCY.

STATUS: CANONICAL & BINDING
Reference: AGENTS.md, PROOF_SCHEMAS.md

Pakiet dokumentuje straty mocy przebiegu rozplywu:
1. Straty P na galeziach
2. Straty Q na galeziach
3. Suma strat w sieci
4. Procentowe straty wzgledem generacji

DROGA DO INZYNIERA (karta PACK-BEZ-KONSUMENTA). Do 2026-08-08 ten generator nie
mial ZADNEGO konsumenta poza wlasnym re-eksportem w ``packs/__init__.py`` — bilans
strat sieci, czyli pozycja obowiazkowa opracowania, byl nieosiagalny z interfejsu.
Konsumentem jest brama pakietu przebiegu (``application/proof_engine/pakiet_biegu.py``
→ ``GET /api/analysis-runs/{run}/pakiet-dowodowy``), ta sama droga, ktora wydaje
pakiet rozplywu: pakiet biegu LOAD_FLOW jest ZBIORCZY i niesie oba dowody.

DLACZEGO JEDEN PAKIET, A NIE DWA RODZAJE (rozstrzygniecie zapisane w rejestrze jako
otwarte). Straty i bilans rozplywu czyta sie z TEGO SAMEGO zamrozonego wyniku
(``raw_result["result_v1"]``), wiec nie moga sie ze soba rozjechac. Zmuszanie
projektanta do wyboru miedzy dwiema pozycjami wyprowadzonymi z identycznych danych
byloby wyborem pozornym; jeden pakiet przebiegu = jedna kompletna dokumentacja
tego przebiegu.

INVARIANTS:
- Solver untouched — pakiet wylacznie opisuje zamrozony wynik (READ-ONLY)
- ZERO ZEGARA I ZERO ZAPASOW — znacznik i wersja solvera pochodza z zapisu biegu
- Deterministic — ten sam przebieg → identyczne bajty
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from application.proof_engine.equation_registry import (
    EQ_LOSS_001,
    EQ_LOSS_002,
    EQ_LOSS_003,
    EQ_LOSS_004,
    EQ_LOSS_005,
)
from application.proof_engine.proof_pack import (
    ProofPackBuilder,
    ProofPackContext,
    deterministic_artifact_id,
    dokument_deterministyczny,
)
from application.proof_engine.types import (
    ProofDocument,
    ProofHeader,
    ProofStep,
    ProofSummary,
    ProofType,
    ProofValue,
    UnitCheckResult,
)

if TYPE_CHECKING:
    from network_model.solvers.power_flow_result import PowerFlowResultV1


# =============================================================================
# Input Types
# =============================================================================


@dataclass
class P16BranchLossInput:
    """
    Dane wejsciowe dla strat na pojedynczej galezi.

    Attributes:
        branch_id: ID galezi
        p_from_mw: Moc czynna wchodzaca [MW]
        q_from_mvar: Moc bierna wchodzaca [Mvar]
        p_to_mw: Moc czynna wychodzaca [MW]
        q_to_mvar: Moc bierna wychodzaca [Mvar]
        p_loss_mw: Straty mocy czynnej [MW]
        q_loss_mvar: Straty mocy biernej [Mvar]
    """

    branch_id: str
    p_from_mw: float
    q_from_mvar: float
    p_to_mw: float
    q_to_mvar: float
    p_loss_mw: float
    q_loss_mvar: float


@dataclass
class P16LossesInput:
    """
    Dane wejsciowe dla Proof Pack P16: Losses Proof.

    Attributes:
        project_name: Nazwa projektu
        case_name: Nazwa przypadku obliczeniowego
        run_timestamp: Czas uruchomienia
        solver_version: Wersja solvera
        branches: Lista strat na galeziach
        p_losses_total_mw: Calkowite straty P [MW]
        q_losses_total_mvar: Calkowite straty Q [Mvar]
        p_gen_total_mw: Suma mocy generowanej [MW]
    """

    project_name: str
    case_name: str
    run_timestamp: datetime
    solver_version: str
    branches: list[P16BranchLossInput]
    p_losses_total_mw: float
    q_losses_total_mvar: float
    p_gen_total_mw: float

    @classmethod
    def from_power_flow_result(
        cls,
        result: PowerFlowResultV1,
        *,
        project_name: str,
        case_name: str,
        run_timestamp: datetime,
        solver_version: str,
    ) -> P16LossesInput:
        """Sklada wejscie dowodu strat z zamrozonego wyniku rozplywu.

        ZERO FABRYKACJI I ZERO ZEGARA (karta PACK-BEZ-KONSUMENTA, ta sama klasa
        defektu co w pakiecie rozplywu). Wczesniejsza wersja podstawiala
        ``datetime.utcnow()`` oraz nazwy „Projekt"/„Przypadek", a jako wersje
        solvera brala ``result.result_version`` — czyli wersje KONTRAKTU wyniku,
        nie narzedzia, ktorym go policzono. Zegar lamal determinizm pakietu (dwa
        pobrania tego samego przebiegu roznilyby sie bajtami), a pozostale trzy
        wpisywaly do DOWODU dane, ktorych nikt nie ustalil. Wszystkie argumenty
        sa teraz WYMAGANE i nazwane; podaje je warstwa wiazania, ktora czyta je z
        zapisu biegu albo odmawia (``power_flow_binding``).

        Args:
            result: Zamrozony wynik rozplywu (READ-ONLY).
            project_name: Nazwa projektu do naglowka dowodu.
            case_name: Nazwa przypadku obliczeniowego.
            run_timestamp: Znacznik czasu PRZEBIEGU (nie „teraz").
            solver_version: Wersja solvera z artefaktu biegu.
        """
        branches: list[P16BranchLossInput] = []

        for branch in result.branch_results:
            branches.append(
                P16BranchLossInput(
                    branch_id=branch.branch_id,
                    p_from_mw=branch.p_from_mw,
                    q_from_mvar=branch.q_from_mvar,
                    p_to_mw=branch.p_to_mw,
                    q_to_mvar=branch.q_to_mvar,
                    p_loss_mw=branch.losses_p_mw,
                    q_loss_mvar=branch.losses_q_mvar,
                )
            )

        # Calculate total generation
        p_gen = sum(bus.p_injected_mw for bus in result.bus_results if bus.p_injected_mw > 0)

        return cls(
            project_name=project_name,
            case_name=case_name,
            run_timestamp=run_timestamp,
            solver_version=solver_version,
            branches=branches,
            p_losses_total_mw=result.summary.total_losses_p_mw,
            q_losses_total_mvar=result.summary.total_losses_q_mvar,
            p_gen_total_mw=p_gen,
        )


# =============================================================================
# P16 Losses Proof Pack
# =============================================================================


class P16LossesProof:
    """
    Pakiet dowodowy strat mocy.

    Oblicza:
    1. Straty P na galeziach (P_from + P_to)
    2. Straty Q na galeziach (Q_from + Q_to)
    3. Suma strat P w sieci
    4. Suma strat Q w sieci
    5. Procent strat wzgledem generacji

    Invariants:
    - POST-HOC: nie modyfikuje solvera
    - DETERMINISM: ten sam input -> identyczny output
    - WHITE BOX: wszystkie kroki audytowalne
    """

    #: Prefiks identyfikatorow krokow. Trafia do POBIERANEGO ``proof.json``, wiec
    #: nie moze niesc roboczego oznaczenia projektu (CLAUDE.md regula 8 — zakaz
    #: dotyczy eksportow, nie tylko interfejsu). Pin: caly pakiet rozplywu bez
    #: oznaczen roboczych w tests/api/test_pakiet_dowodowy_biegu.py.
    PACK_ID = "STRAT"
    TITLE_PL = "Dowód strat mocy"

    THEORY = r"""
    \section{Straty mocy czynnej}

    Dla galezi $(i,j)$:
    \begin{equation}
    P_{loss,ij} = P_{from,ij} + P_{to,ij}
    \end{equation}

    \section{Straty mocy biernej}

    \begin{equation}
    Q_{loss,ij} = Q_{from,ij} + Q_{to,ij}
    \end{equation}

    \section{Suma strat w sieci}

    \begin{align}
    P_{losses,total} &= \sum_{ij} P_{loss,ij} \\
    Q_{losses,total} &= \sum_{ij} Q_{loss,ij}
    \end{align}

    \section{Procent strat}

    \begin{equation}
    \eta_P = 100 \cdot \frac{P_{losses}}{P_{gen}} \%
    \end{equation}
    """

    @classmethod
    def generate(
        cls,
        data: P16LossesInput,
        artifact_id: UUID | None = None,
        max_branch_steps: int = 10,
    ) -> ProofDocument:
        """
        Generuje dowod P16: Losses Proof.

        Args:
            data: Dane wejsciowe P16LossesInput
            artifact_id: Opcjonalny ID artefaktu
            max_branch_steps: Maksymalna liczba galezi do wyswietlenia

        Returns:
            ProofDocument z krokami dowodu
        """
        if artifact_id is None:
            artifact_id = uuid4()

        steps: list[ProofStep] = []
        warnings: list[str] = []
        step_number = 0

        # Steps for individual branches (limited)
        branches_to_show = sorted(
            data.branches,
            key=lambda b: abs(b.p_loss_mw),
            reverse=True,
        )[:max_branch_steps]

        for branch in branches_to_show:
            step_number += 1
            steps.append(cls._create_branch_p_loss_step(step_number, branch))

            step_number += 1
            steps.append(cls._create_branch_q_loss_step(step_number, branch))

        if len(data.branches) > max_branch_steps:
            warnings.append(
                f"Pokazano {max_branch_steps} z {len(data.branches)} gałęzi "
                "(posortowane malejąco według strat mocy czynnej); "
                "sumy poniżej obejmują WSZYSTKIE gałęzie przebiegu."
            )

        # Total losses steps
        step_number += 1
        steps.append(cls._create_total_p_loss_step(step_number, data))

        step_number += 1
        steps.append(cls._create_total_q_loss_step(step_number, data))

        # Percentage step
        step_number += 1
        steps.append(cls._create_loss_percent_step(step_number, data))

        # Build summary
        p_loss_percent = (
            100.0 * data.p_losses_total_mw / data.p_gen_total_mw if data.p_gen_total_mw > 0 else 0.0
        )

        key_results = {
            "p_losses_total_mw": ProofValue.create(
                "P_{losses,total}",
                data.p_losses_total_mw,
                "MW",
                "p_losses_total_mw",
            ),
            "q_losses_total_mvar": ProofValue.create(
                "Q_{losses,total}",
                data.q_losses_total_mvar,
                "Mvar",
                "q_losses_total_mvar",
            ),
            "p_loss_percent": ProofValue.create(
                r"\eta_P",
                p_loss_percent,
                "%",
                "p_loss_percent",
            ),
            "branch_count": ProofValue.create(
                "N_{branches}",
                float(len(data.branches)),
                "—",
                "branch_count",
            ),
        }

        unit_check_passed = all(s.unit_check.passed for s in steps)

        summary = ProofSummary(
            key_results=key_results,
            unit_check_passed=unit_check_passed,
            total_steps=len(steps),
            warnings=tuple(warnings),
            overall_status="COMPUTED",
        )

        header = ProofHeader(
            project_name=data.project_name,
            case_name=data.case_name,
            run_timestamp=data.run_timestamp,
            solver_version=data.solver_version,
        )

        return ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=ProofType.LOSSES_ENERGY,
            title_pl=cls.TITLE_PL,
            header=header,
            steps=steps,
            summary=summary,
        )

    #: Rozroznik tozsamosci dokumentu w pakiecie ZBIORCZYM przebiegu. Bez niego
    #: dowod strat i dowod rozplywu — skladane z tego samego przebiegu — dostalyby
    #: ten sam identyfikator artefaktu, czyli pakiet twierdzilby, ze to jeden dowod.
    ROZROZNIK = "straty"

    @classmethod
    def generate_zip(
        cls,
        data: P16LossesInput,
        context: ProofPackContext,
        artifact_id: UUID | None = None,
    ) -> bytes:
        """Zbuduj ZIP pakietu dowodowego strat (dowod, zrodlo, wykaz, odcisk).

        Ta sama mechanika co ``P14PowerFlowProof.generate_zip`` — REUZYCIE
        ``ProofPackBuilder``, nie druga droga pakowania. Bez jawnego ``artifact_id``
        tozsamosc artefaktu i dokumentu wyprowadzamy z tozsamosci pakietu wraz z
        ``ROZROZNIK``, a znacznik dokumentu z PRZEBIEGU — inaczej dwa pobrania tego
        samego przebiegu roznilyby sie bajtami, wbrew deklaracji ``manifest.json``.
        """
        proof = cls.generate(data, artifact_id or deterministic_artifact_id(context, cls.ROZROZNIK))
        return ProofPackBuilder(context).build(
            dokument_deterministyczny(proof, context, data.run_timestamp, cls.ROZROZNIK)
        )

    @classmethod
    def _create_branch_p_loss_step(
        cls,
        step_number: int,
        branch: P16BranchLossInput,
    ) -> ProofStep:
        """Krok: Straty mocy czynnej na galezi."""
        equation = EQ_LOSS_001

        input_values = (
            ProofValue.create(
                "P_{from}",
                branch.p_from_mw,
                "MW",
                "p_from_mw",
            ),
            ProofValue.create(
                "P_{to}",
                branch.p_to_mw,
                "MW",
                "p_to_mw",
            ),
        )

        substitution = (
            f"P_{{loss,{branch.branch_id}}} = "
            f"{branch.p_from_mw:.4f} + ({branch.p_to_mw:.4f}) = "
            f"{branch.p_loss_mw:.4f} \\text{{ MW}}"
        )

        result = ProofValue.create(
            f"P_{{loss,{branch.branch_id}}}",
            branch.p_loss_mw,
            "MW",
            "p_loss_mw",
        )

        unit_check = UnitCheckResult(
            passed=True,
            expected_unit="MW",
            computed_unit="MW",
            input_units={
                "p_from": "MW",
                "p_to": "MW",
            },
            derivation="MW + MW = MW",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("P16", step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} ({branch.branch_id})",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "branch_id": branch.branch_id,
                "p_from_mw": "p_from_mw",
                "p_to_mw": "p_to_mw",
                "p_loss_mw": "p_loss_mw",
            },
        )

    @classmethod
    def _create_branch_q_loss_step(
        cls,
        step_number: int,
        branch: P16BranchLossInput,
    ) -> ProofStep:
        """Krok: Straty mocy biernej na galezi."""
        equation = EQ_LOSS_002

        input_values = (
            ProofValue.create(
                "Q_{from}",
                branch.q_from_mvar,
                "Mvar",
                "q_from_mvar",
            ),
            ProofValue.create(
                "Q_{to}",
                branch.q_to_mvar,
                "Mvar",
                "q_to_mvar",
            ),
        )

        substitution = (
            f"Q_{{loss,{branch.branch_id}}} = "
            f"{branch.q_from_mvar:.4f} + ({branch.q_to_mvar:.4f}) = "
            f"{branch.q_loss_mvar:.4f} \\text{{ Mvar}}"
        )

        result = ProofValue.create(
            f"Q_{{loss,{branch.branch_id}}}",
            branch.q_loss_mvar,
            "Mvar",
            "q_loss_mvar",
        )

        unit_check = UnitCheckResult(
            passed=True,
            expected_unit="Mvar",
            computed_unit="Mvar",
            input_units={
                "q_from": "Mvar",
                "q_to": "Mvar",
            },
            derivation="Mvar + Mvar = Mvar",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("P16", step_number),
            step_number=step_number,
            title_pl=f"{equation.name_pl} ({branch.branch_id})",
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "branch_id": branch.branch_id,
                "q_from_mvar": "q_from_mvar",
                "q_to_mvar": "q_to_mvar",
                "q_loss_mvar": "q_loss_mvar",
            },
        )

    @classmethod
    def _create_total_p_loss_step(
        cls,
        step_number: int,
        data: P16LossesInput,
    ) -> ProofStep:
        """Krok: Suma strat mocy czynnej."""
        equation = EQ_LOSS_003

        # Calculate from branches
        computed_total = sum(b.p_loss_mw for b in data.branches)

        input_values = tuple(
            ProofValue.create(
                f"P_{{loss,{i+1}}}",
                b.p_loss_mw,
                "MW",
                f"p_loss_mw_{b.branch_id}",
            )
            for i, b in enumerate(data.branches[:5])  # Show first 5
        )

        if len(data.branches) > 5:
            substitution = (
                f"P_{{losses,total}} = \\sum_{{ij}} P_{{loss,ij}} = "
                f"{computed_total:.4f} \\text{{ MW}} "
                f"\\text{{ ({len(data.branches)} galezi)}}"
            )
        else:
            branch_sum = " + ".join(f"{b.p_loss_mw:.4f}" for b in data.branches)
            substitution = (
                f"P_{{losses,total}} = {branch_sum} = " f"{computed_total:.4f} \\text{{ MW}}"
            )

        result = ProofValue.create(
            "P_{losses,total}",
            data.p_losses_total_mw,
            "MW",
            "p_losses_total_mw",
        )

        unit_check = UnitCheckResult(
            passed=True,
            expected_unit="MW",
            computed_unit="MW",
            input_units={"p_loss_i": "MW"},
            derivation="SUM MW = MW",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("P16", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "p_losses_total_mw": "p_losses_total_mw",
            },
        )

    @classmethod
    def _create_total_q_loss_step(
        cls,
        step_number: int,
        data: P16LossesInput,
    ) -> ProofStep:
        """Krok: Suma strat mocy biernej."""
        equation = EQ_LOSS_004

        # Calculate from branches
        computed_total = sum(b.q_loss_mvar for b in data.branches)

        input_values = tuple(
            ProofValue.create(
                f"Q_{{loss,{i+1}}}",
                b.q_loss_mvar,
                "Mvar",
                f"q_loss_mvar_{b.branch_id}",
            )
            for i, b in enumerate(data.branches[:5])  # Show first 5
        )

        substitution = (
            f"Q_{{losses,total}} = \\sum_{{ij}} Q_{{loss,ij}} = "
            f"{computed_total:.4f} \\text{{ Mvar}} "
            f"\\text{{ ({len(data.branches)} galezi)}}"
        )

        result = ProofValue.create(
            "Q_{losses,total}",
            data.q_losses_total_mvar,
            "Mvar",
            "q_losses_total_mvar",
        )

        unit_check = UnitCheckResult(
            passed=True,
            expected_unit="Mvar",
            computed_unit="Mvar",
            input_units={"q_loss_i": "Mvar"},
            derivation="SUM Mvar = Mvar",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("P16", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "q_losses_total_mvar": "q_losses_total_mvar",
            },
        )

    @classmethod
    def _create_loss_percent_step(
        cls,
        step_number: int,
        data: P16LossesInput,
    ) -> ProofStep:
        """Krok: Procent strat mocy czynnej."""
        equation = EQ_LOSS_005

        p_loss_percent = (
            100.0 * data.p_losses_total_mw / data.p_gen_total_mw if data.p_gen_total_mw > 0 else 0.0
        )

        input_values = (
            ProofValue.create(
                "P_{losses}",
                data.p_losses_total_mw,
                "MW",
                "p_losses_total_mw",
            ),
            ProofValue.create(
                "P_{gen}",
                data.p_gen_total_mw,
                "MW",
                "p_gen_total_mw",
            ),
        )

        if data.p_gen_total_mw > 0:
            substitution = (
                f"\\eta_P = 100 \\cdot \\frac{{{data.p_losses_total_mw:.4f}}}"
                f"{{{data.p_gen_total_mw:.4f}}} = "
                f"{p_loss_percent:.4f} \\%"
            )
        else:
            substitution = r"\eta_P = 0 \% \text{ (brak generacji)}"

        result = ProofValue.create(
            r"\eta_P",
            p_loss_percent,
            "%",
            "p_loss_percent",
        )

        unit_check = UnitCheckResult(
            passed=True,
            expected_unit="%",
            computed_unit="%",
            input_units={
                "p_losses": "MW",
                "p_gen": "MW",
            },
            derivation="100 * MW / MW = %",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id("P16", step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "p_losses_total_mw": "p_losses_total_mw",
                "p_gen_total_mw": "p_gen_total_mw",
                "p_loss_percent": "p_loss_percent",
            },
        )
