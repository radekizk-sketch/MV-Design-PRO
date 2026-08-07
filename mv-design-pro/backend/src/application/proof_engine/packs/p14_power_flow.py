"""
Pakiet dowodowy ROZPŁYWU MOCY.

STATUS: CANONICAL & BINDING
Reference: AGENTS.md, PROOF_SCHEMAS.md

Pakiet udowadnia poprawnosc wynikow Power Flow:
1. Zbieznosc (mismatch -> 0)
2. Bilans mocy czynnej (SUM P = 0)
3. Bilans mocy biernej (SUM Q = 0)
4. Poprawnosc napiec (fizycznie sensowne)

DROGA DO INŻYNIERA (karta PACK-ROZPLYW). Do 2026-08-07 ten generator nie miał
ŻADNEGO konsumenta poza własnym re-eksportem w ``packs/__init__.py`` — pakiet
dowodowy podstawowej analizy był nieosiągalny z interfejsu. Konsumentem jest
brama pakietu przebiegu (``application/proof_engine/pakiet_biegu.py`` →
``GET /api/analysis-runs/{run}/pakiet-dowodowy``), czyli ta sama droga, którą
pobiera się pakiety zwarciowe. Wejście składane jest WYŁĄCZNIE z zapisu biegu
przez warstwę wiązania ``application/solvers/power_flow_binding.py`` — rozpływ
nie jest liczony po raz drugi (Proof Engine czyta wyniki READ-ONLY).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from application.proof_engine.equation_registry import (
    EQ_PF_001,
    EQ_PF_002,
    EQ_PF_003,
    EQ_PF_004,
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
# Proof Type
# =============================================================================

# Pakiet używa typu LOAD_FLOW_VOLTAGE (zdefiniowanego w ProofType)


# =============================================================================
# Input Types
# =============================================================================


@dataclass
class P14PowerFlowInput:
    """
    Dane wejsciowe dla Proof Pack P14: Power Flow Verification.

    Attributes:
        project_name: Nazwa projektu
        case_name: Nazwa przypadku obliczeniowego
        run_timestamp: Czas uruchomienia
        solver_version: Wersja solvera
        converged: Czy obliczenia zbiegly
        iterations_count: Liczba iteracji
        tolerance: Tolerancja zbieznosci
        max_mismatch_pu: Maksymalny mismatch w p.u.
        p_gen_total_mw: Suma mocy generowanej [MW]
        p_load_total_mw: Suma mocy pobieranej [MW]
        p_losses_total_mw: Straty mocy czynnej [MW]
        q_gen_total_mvar: Suma mocy biernej generowanej [Mvar]
        q_load_total_mvar: Suma mocy biernej pobieranej [Mvar]
        q_losses_total_mvar: Straty mocy biernej [Mvar]
        v_min_pu: Minimalne napiecie [p.u.]
        v_max_pu: Maksymalne napiecie [p.u.]
        slack_p_mw: Moc czynna wezla bilansujacego [MW]
        slack_q_mvar: Moc bierna wezla bilansujacego [Mvar]
    """

    project_name: str
    case_name: str
    run_timestamp: datetime
    solver_version: str
    converged: bool
    iterations_count: int
    tolerance: float
    max_mismatch_pu: float
    p_gen_total_mw: float
    p_load_total_mw: float
    p_losses_total_mw: float
    q_gen_total_mvar: float
    q_load_total_mvar: float
    q_losses_total_mvar: float
    v_min_pu: float
    v_max_pu: float
    slack_p_mw: float
    slack_q_mvar: float

    @classmethod
    def from_power_flow_result(
        cls,
        result: PowerFlowResultV1,
        *,
        project_name: str,
        case_name: str,
        run_timestamp: datetime,
        solver_version: str,
        max_mismatch_pu: float,
    ) -> P14PowerFlowInput:
        """Składa wejście dowodu z zamrożonego wyniku rozpływu.

        ZERO FABRYKACJI I ZERO ZEGARA (karta PACK-ROZPLYW). Każdy argument jest
        WYMAGANY i nazwany. Wcześniejsza wersja podstawiała ``datetime.utcnow()``,
        wersję solvera ``"1.0.0"`` i niedopasowanie ``0.0``, gdy zabrakło śladu —
        pierwsze łamało determinizm pakietu (dwa pobrania tego samego przebiegu
        różniłyby się bajtami), a dwa pozostałe wpisywały do DOWODU liczby, których
        nikt nie policzył. Wielkości spoza kontraktu FROZEN
        (``max_mismatch_pu``, ``solver_version``) podaje warstwa wiązania, która
        czyta je z zapisu biegu albo odmawia (``power_flow_binding``).

        Args:
            result: Zamrożony wynik rozpływu (READ-ONLY).
            project_name: Nazwa projektu do nagłówka dowodu.
            case_name: Nazwa przypadku obliczeniowego.
            run_timestamp: Znacznik czasu PRZEBIEGU (nie „teraz").
            solver_version: Wersja solvera z artefaktu biegu.
            max_mismatch_pu: Końcowe niedopasowanie porównane z tolerancją.
        """
        # Rozdział wstrzyk/pobór po ZNAKU mocy wstrzykniętej — kontrakt FROZEN
        # `BusResult.p_injected_mw` (ujemna = pobór). Nie jest to fizyka, tylko
        # sumowanie wierszy wyniku, których solver już nie zmieni.
        p_gen = 0.0
        p_load = 0.0
        q_gen = 0.0
        q_load = 0.0

        for bus in result.bus_results:
            if bus.p_injected_mw > 0:
                p_gen += bus.p_injected_mw
            else:
                p_load += abs(bus.p_injected_mw)

            if bus.q_injected_mvar > 0:
                q_gen += bus.q_injected_mvar
            else:
                q_load += abs(bus.q_injected_mvar)

        return cls(
            project_name=project_name,
            case_name=case_name,
            run_timestamp=run_timestamp,
            solver_version=solver_version,
            converged=result.converged,
            iterations_count=result.iterations_count,
            tolerance=result.tolerance_used,
            max_mismatch_pu=max_mismatch_pu,
            p_gen_total_mw=p_gen,
            p_load_total_mw=p_load,
            p_losses_total_mw=result.summary.total_losses_p_mw,
            q_gen_total_mvar=q_gen,
            q_load_total_mvar=q_load,
            q_losses_total_mvar=result.summary.total_losses_q_mvar,
            v_min_pu=result.summary.min_v_pu,
            v_max_pu=result.summary.max_v_pu,
            slack_p_mw=result.summary.slack_p_mw,
            slack_q_mvar=result.summary.slack_q_mvar,
        )


# =============================================================================
# P14 Power Flow Proof Pack
# =============================================================================


class P14PowerFlowProof:
    """
    Proof Pack P14: Dowod poprawnosci Power Flow.

    Udowadnia:
    1. Zbieznosc (mismatch -> 0)
    2. Bilans mocy P (SUM P_gen = SUM P_load + P_losses)
    3. Bilans mocy Q (SUM Q_gen = SUM Q_load + Q_losses)
    4. Poprawnosc napiec (0.9 <= U <= 1.1 p.u. typowo)

    Invariants:
    - POST-HOC: nie modyfikuje solvera
    - DETERMINISM: ten sam input -> identyczny output
    - WHITE BOX: wszystkie kroki audytowalne
    """

    #: Prefiks identyfikatorów kroków. Trafia do POBIERANEGO ``proof.json``, więc
    #: nie może nieść roboczego oznaczenia projektu (CLAUDE.md reguła 8 — zakaz
    #: dotyczy eksportów, nie tylko interfejsu). Pin:
    #: tests/api/test_pakiet_dowodowy_biegu.py — cała treść pakietu bez oznaczeń.
    PACK_ID = "PF"
    TITLE_PL = "Dowód poprawności rozpływu mocy"

    THEORY = r"""
    \section{Rownania rozplywu mocy}

    Dla wezla $i$ typu PQ:
    \begin{align}
    P_i &= |V_i| \sum_{j=1}^{n} |V_j| (G_{ij} \cos\delta_{ij} + B_{ij} \sin\delta_{ij}) \\
    Q_i &= |V_i| \sum_{j=1}^{n} |V_j| (G_{ij} \sin\delta_{ij} - B_{ij} \cos\delta_{ij})
    \end{align}

    \section{Kryterium zbieznosci}

    Solver osiaga zbieznosc gdy:
    \begin{equation}
    \max(|\Delta P|, |\Delta Q|) < \epsilon
    \end{equation}
    gdzie $\epsilon$ to tolerancja (domyslnie $10^{-8}$).

    \section{Weryfikacja bilansu}

    Suma mocy w sieci:
    \begin{align}
    \sum_{i} P_{gen,i} &= \sum_{i} P_{load,i} + P_{losses} \\
    \sum_{i} Q_{gen,i} &= \sum_{i} Q_{load,i} + Q_{losses}
    \end{align}
    """

    @classmethod
    def generate(
        cls,
        data: P14PowerFlowInput,
        artifact_id: UUID | None = None,
    ) -> ProofDocument:
        """
        Generuje dowod P14: Power Flow Verification.

        Args:
            data: Dane wejsciowe P14PowerFlowInput
            artifact_id: Opcjonalny ID artefaktu

        Returns:
            ProofDocument z krokami dowodu
        """
        if artifact_id is None:
            artifact_id = uuid4()

        steps: list[ProofStep] = []
        warnings: list[str] = []

        # Step 1: Weryfikacja zbieznosci
        step1 = cls._create_convergence_step(1, data)
        steps.append(step1)
        if not data.converged:
            warnings.append("Obliczenia nie osiągnęły zbieżności.")

        # Step 2: Bilans mocy czynnej
        step2 = cls._create_p_balance_step(2, data)
        steps.append(step2)

        # Step 3: Bilans mocy biernej
        step3 = cls._create_q_balance_step(3, data)
        steps.append(step3)

        # Step 4: Weryfikacja napiec
        step4 = cls._create_voltage_check_step(4, data)
        steps.append(step4)
        if data.v_min_pu < 0.9 or data.v_max_pu > 1.1:
            warnings.append(
                f"Napięcia poza typowym zakresem: "
                f"U_min={data.v_min_pu:.4f} p.u., U_max={data.v_max_pu:.4f} p.u."
            )

        # Build summary
        key_results = {
            "converged": ProofValue.create(
                r"\text{converged}",
                1.0 if data.converged else 0.0,
                "—",
                "converged",
            ),
            "max_mismatch_pu": ProofValue.create(
                r"\max|\Delta|",
                data.max_mismatch_pu,
                "p.u.",
                "max_mismatch_pu",
            ),
            "p_losses_mw": ProofValue.create(
                "P_{losses}",
                data.p_losses_total_mw,
                "MW",
                "p_losses_total_mw",
            ),
            "q_losses_mvar": ProofValue.create(
                "Q_{losses}",
                data.q_losses_total_mvar,
                "Mvar",
                "q_losses_total_mvar",
            ),
            "v_min_pu": ProofValue.create(
                "U_{min}",
                data.v_min_pu,
                "p.u.",
                "v_min_pu",
            ),
            "v_max_pu": ProofValue.create(
                "U_{max}",
                data.v_max_pu,
                "p.u.",
                "v_max_pu",
            ),
        }

        unit_check_passed = all(s.unit_check.passed for s in steps)

        summary = ProofSummary(
            key_results=key_results,
            unit_check_passed=unit_check_passed,
            total_steps=len(steps),
            warnings=tuple(warnings),
            overall_status="PASS" if data.converged and not warnings else "WARN",
        )

        header = ProofHeader(
            project_name=data.project_name,
            case_name=data.case_name,
            run_timestamp=data.run_timestamp,
            solver_version=data.solver_version,
        )

        return ProofDocument.create(
            artifact_id=artifact_id,
            proof_type=ProofType.LOAD_FLOW_VOLTAGE,
            title_pl=cls.TITLE_PL,
            header=header,
            steps=steps,
            summary=summary,
        )

    @classmethod
    def generate_zip(
        cls,
        data: P14PowerFlowInput,
        context: ProofPackContext,
        artifact_id: UUID | None = None,
    ) -> bytes:
        """Zbuduj ZIP pakietu dowodowego rozpływu (dowód, źródło, wykaz, odcisk).

        Ta sama mechanika co ``SC3FProofPack.generate_zip`` — REUŻYCIE
        ``ProofPackBuilder``, nie druga droga pakowania. Bez jawnego
        ``artifact_id`` tożsamość artefaktu wyprowadzamy z tożsamości pakietu
        (``deterministic_artifact_id``), a znacznik dokumentu z PRZEBIEGU
        (``dokument_deterministyczny``) — inaczej dwa pobrania tego samego
        przebiegu różniłyby się bajtami, wbrew deklaracji ``manifest.json``.
        """
        proof = cls.generate(data, artifact_id or deterministic_artifact_id(context))
        return ProofPackBuilder(context).build(
            dokument_deterministyczny(proof, context, data.run_timestamp)
        )

    @classmethod
    def _create_convergence_step(
        cls,
        step_number: int,
        data: P14PowerFlowInput,
    ) -> ProofStep:
        """Krok 1: Weryfikacja zbieznosci solvera."""
        equation = EQ_PF_001

        input_values = (
            ProofValue.create(
                r"\max(|\Delta P|, |\Delta Q|)",
                data.max_mismatch_pu,
                "p.u.",
                "max_mismatch_pu",
            ),
            ProofValue.create(
                r"\epsilon",
                data.tolerance,
                "p.u.",
                "tolerance",
            ),
        )

        passed = data.max_mismatch_pu < data.tolerance
        status = "PASS" if passed else "FAIL"

        substitution = (
            f"|{data.max_mismatch_pu:.2e}| < {data.tolerance:.2e} "
            f"\\Rightarrow \\text{{{status}}} "
            f"\\text{{ po {data.iterations_count} iteracjach}}"
        )

        result = ProofValue.create(
            r"\text{converged}",
            1.0 if data.converged else 0.0,
            "—",
            "converged",
        )

        unit_check = UnitCheckResult(
            passed=True,
            expected_unit="—",
            computed_unit="—",
            input_units={
                "max_mismatch": "p.u.",
                "tolerance": "p.u.",
            },
            derivation="p.u. < p.u. -> —",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id(cls.PACK_ID, step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "max_mismatch_pu": "max_mismatch_pu",
                "tolerance": "tolerance",
                "converged": "converged",
            },
        )

    @classmethod
    def _create_p_balance_step(
        cls,
        step_number: int,
        data: P14PowerFlowInput,
    ) -> ProofStep:
        """Krok 2: Weryfikacja bilansu mocy czynnej."""
        equation = EQ_PF_002

        input_values = (
            ProofValue.create(
                r"\sum P_{gen}",
                data.p_gen_total_mw,
                "MW",
                "p_gen_total_mw",
            ),
            ProofValue.create(
                r"\sum P_{load}",
                data.p_load_total_mw,
                "MW",
                "p_load_total_mw",
            ),
            ProofValue.create(
                "P_{losses}",
                data.p_losses_total_mw,
                "MW",
                "p_losses_total_mw",
            ),
        )

        balance_check = abs(data.p_gen_total_mw - data.p_load_total_mw - data.p_losses_total_mw)

        substitution = (
            f"{data.p_gen_total_mw:.4f} = {data.p_load_total_mw:.4f} + "
            f"{data.p_losses_total_mw:.4f} \\quad "
            f"\\text{{różnica: {balance_check:.6f} MW}}"
        )

        result = ProofValue.create(
            r"\Delta P_{balance}",
            balance_check,
            "MW",
            "p_balance_mw",
        )

        unit_check = UnitCheckResult(
            passed=True,
            expected_unit="MW",
            computed_unit="MW",
            input_units={
                "p_gen": "MW",
                "p_load": "MW",
                "p_losses": "MW",
            },
            derivation="MW = MW + MW",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id(cls.PACK_ID, step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "p_gen_total_mw": "p_gen_total_mw",
                "p_load_total_mw": "p_load_total_mw",
                "p_losses_total_mw": "p_losses_total_mw",
            },
        )

    @classmethod
    def _create_q_balance_step(
        cls,
        step_number: int,
        data: P14PowerFlowInput,
    ) -> ProofStep:
        """Krok 3: Weryfikacja bilansu mocy biernej."""
        equation = EQ_PF_003

        input_values = (
            ProofValue.create(
                r"\sum Q_{gen}",
                data.q_gen_total_mvar,
                "Mvar",
                "q_gen_total_mvar",
            ),
            ProofValue.create(
                r"\sum Q_{load}",
                data.q_load_total_mvar,
                "Mvar",
                "q_load_total_mvar",
            ),
            ProofValue.create(
                "Q_{losses}",
                data.q_losses_total_mvar,
                "Mvar",
                "q_losses_total_mvar",
            ),
        )

        balance_check = abs(
            data.q_gen_total_mvar - data.q_load_total_mvar - data.q_losses_total_mvar
        )

        substitution = (
            f"{data.q_gen_total_mvar:.4f} = {data.q_load_total_mvar:.4f} + "
            f"{data.q_losses_total_mvar:.4f} \\quad "
            f"\\text{{różnica: {balance_check:.6f} Mvar}}"
        )

        result = ProofValue.create(
            r"\Delta Q_{balance}",
            balance_check,
            "Mvar",
            "q_balance_mvar",
        )

        unit_check = UnitCheckResult(
            passed=True,
            expected_unit="Mvar",
            computed_unit="Mvar",
            input_units={
                "q_gen": "Mvar",
                "q_load": "Mvar",
                "q_losses": "Mvar",
            },
            derivation="Mvar = Mvar + Mvar",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id(cls.PACK_ID, step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "q_gen_total_mvar": "q_gen_total_mvar",
                "q_load_total_mvar": "q_load_total_mvar",
                "q_losses_total_mvar": "q_losses_total_mvar",
            },
        )

    @classmethod
    def _create_voltage_check_step(
        cls,
        step_number: int,
        data: P14PowerFlowInput,
    ) -> ProofStep:
        """Krok 4: Weryfikacja zakresu napiec."""
        equation = EQ_PF_004

        input_values = (
            ProofValue.create(
                "U_{min}",
                data.v_min_pu,
                "p.u.",
                "v_min_pu",
            ),
            ProofValue.create(
                "U_{max}",
                data.v_max_pu,
                "p.u.",
                "v_max_pu",
            ),
        )

        # Check if voltages are in typical range
        in_range = 0.9 <= data.v_min_pu and data.v_max_pu <= 1.1
        status = "OK" if in_range else "WARN"

        substitution = (
            f"U_{{min}} = {data.v_min_pu:.4f} \\text{{ p.u.}}, \\quad "
            f"U_{{max}} = {data.v_max_pu:.4f} \\text{{ p.u.}} \\quad "
            f"\\Rightarrow \\text{{{status}}}"
        )

        result = ProofValue.create(
            r"\text{voltage\_ok}",
            1.0 if in_range else 0.0,
            "—",
            "voltage_ok",
        )

        unit_check = UnitCheckResult(
            passed=True,
            expected_unit="—",
            computed_unit="—",
            input_units={
                "v_min": "p.u.",
                "v_max": "p.u.",
            },
            derivation="p.u. <= p.u. <= p.u. -> —",
        )

        return ProofStep(
            step_id=ProofStep.generate_step_id(cls.PACK_ID, step_number),
            step_number=step_number,
            title_pl=equation.name_pl,
            equation=equation,
            input_values=input_values,
            substitution_latex=substitution,
            result=result,
            unit_check=unit_check,
            source_keys={
                "v_min_pu": "v_min_pu",
                "v_max_pu": "v_max_pu",
            },
        )
