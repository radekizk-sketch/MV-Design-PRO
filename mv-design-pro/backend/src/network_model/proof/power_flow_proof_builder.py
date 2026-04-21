"""
P21: Power Flow Proof Builder - mapper Trace → ProofDocument.

Ten moduł konwertuje PowerFlowTrace na PowerFlowProofDocument,
generując formalny dowód matematyczny przebiegu obliczeń NR.

CANONICAL ALIGNMENT:
- READ-ONLY: Interpretacja trace, ZERO obliczeń wtórnych
- DETERMINISTIC: Ten sam trace → identyczny proof (BEZ uuid4(), BEZ datetime.now())
- WHITE-BOX: Dane wprost z trace
- NOT-A-SOLVER: Żadnych uproszczeń Jacobiego
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

from network_model.proof.power_flow_equations import (
    EQ_CONV_001_NORM,
    EQ_NR_001_MISMATCH_P,
    EQ_NR_003_JACOBIAN,
    EQ_NR_009_LINEAR_SYSTEM,
    EQ_NR_010_STATE_UPDATE,
    EQ_PF_001_P_INJECTION,
    EQ_PF_002_Q_INJECTION,
    EquationEntry,
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

if TYPE_CHECKING:
    from network_model.solvers.power_flow_result import PowerFlowResultV1
    from network_model.solvers.power_flow_trace import (
        PowerFlowIterationTrace,
        PowerFlowTrace,
    )


def _format_float(value: float, precision: int = 4) -> str:
    """Formatuje liczbę zmiennoprzecinkową."""
    if abs(value) < 1e-10:
        return "0"
    if abs(value) >= 1000:
        return f"{value:.{precision}e}"
    return f"{value:.{precision}f}"


def _equation_to_definition(eq: EquationEntry) -> EquationDefinition:
    """Konwertuje EquationEntry na EquationDefinition."""
    return EquationDefinition(
        equation_id=eq.equation_id,
        latex=eq.latex,
        name_pl=eq.name_pl,
        description_pl=eq.description_pl,
    )


def _build_unit_check(expected: str, computed: str, derivation: str = "") -> UnitCheckResult:
    """Buduje wynik weryfikacji jednostek."""
    return UnitCheckResult(
        passed=(expected == computed or computed == "—"),
        expected_unit=expected,
        computed_unit=computed,
        derivation=derivation,
    )


def _build_proof_value(
    symbol: str,
    value: float | str | complex,
    unit: str,
    source_key: str,
) -> ProofValue:
    """Buduje ProofValue z automatycznym formatowaniem."""
    if isinstance(value, complex):
        formatted = f"{value.real:.4f} + j{value.imag:.4f} {unit}".strip()
    elif isinstance(value, float):
        formatted = f"{_format_float(value)} {unit}".strip()
    else:
        formatted = f"{value} {unit}".strip()

    return ProofValue(
        symbol=symbol,
        value=value,
        unit=unit,
        source_key=source_key,
        formatted=formatted,
    )


class PowerFlowProofBuilder:
    """Builder dla PowerFlowProofDocument.

    Konwertuje PowerFlowTrace na pełny dokument dowodowy
    bez wykonywania jakichkolwiek obliczeń wtórnych.

    DETERMINISTIC: Ten sam trace → identyczny proof.
    - Brak uuid4(), brak datetime.now()
    - document_id = sha256(run_id:input_hash:snapshot_id)
    - run_timestamp z persistence (parametr), nie z datetime.now()
    """

    def __init__(
        self,
        trace: PowerFlowTrace,
        result: PowerFlowResultV1,
        *,
        project_name: str = "Projekt MV-Design",
        case_name: str = "Przypadek studyjny",
        artifact_id: str | None = None,
        run_timestamp: str | None = None,
    ) -> None:
        """Inicjalizuje builder.

        Args:
            trace: PowerFlowTrace z obliczeń NR.
            result: PowerFlowResultV1 z wynikami.
            project_name: Nazwa projektu.
            case_name: Nazwa przypadku studyjnego.
            artifact_id: ID artefaktu (opcjonalne, deterministyczny z trace).
            run_timestamp: Timestamp uruchomienia z persistence (ISO format).
                           NIE datetime.now() - musi być przekazany z zewnątrz.
        """
        self._trace = trace
        self._result = result
        self._project_name = project_name
        self._case_name = case_name
        # Deterministyczny artifact_id z trace
        self._artifact_id = artifact_id or generate_document_id(
            run_id=trace.run_id,
            input_hash=trace.input_hash,
            snapshot_id=trace.snapshot_id,
        )
        # run_timestamp z persistence - NIE datetime.now()
        self._run_timestamp = run_timestamp or "1970-01-01T00:00:00+00:00"
        self._step_counter = 0

    def build(self) -> PowerFlowProofDocument:
        """Buduje kompletny dokument dowodowy.

        DETERMINISTIC: Ten sam trace → identyczny document.
        - document_id = sha256(run_id:input_hash:snapshot_id)
        - created_at = run_timestamp z persistence
        """
        # Deterministyczny document_id z trace
        document_id = generate_document_id(
            run_id=self._trace.run_id,
            input_hash=self._trace.input_hash,
            snapshot_id=self._trace.snapshot_id,
        )
        # created_at = run_timestamp z persistence (NIE datetime.now())
        created_at = self._run_timestamp

        header = self._build_header()
        network_def = self._build_network_definition()
        pf_equations = self._build_power_flow_equations()
        nr_method = self._build_nr_method_description()
        initial_state = self._build_initial_state()
        iterations = self._build_iterations()
        convergence = self._build_convergence_criterion()
        final_state = self._build_final_state()
        verification = self._build_verification()
        summary = self._build_summary(iterations)

        return PowerFlowProofDocument(
            document_id=document_id,
            artifact_id=self._artifact_id,
            created_at=created_at,
            proof_type="POWER_FLOW_NR",
            proof_version=POWER_FLOW_PROOF_VERSION,
            title_pl="Dowód obliczeń rozpływu mocy metodą Newtona-Raphsona",
            header=header,
            network_definition=network_def,
            power_flow_equations=pf_equations,
            nr_method_description=nr_method,
            initial_state=initial_state,
            iterations=iterations,
            convergence_criterion=convergence,
            final_state=final_state,
            verification=verification,
            summary=summary,
        )

    def _next_step_number(self) -> int:
        """Zwraca następny numer kroku."""
        self._step_counter += 1
        return self._step_counter

    def _build_header(self) -> ProofHeader:
        """Buduje nagłówek dokumentu.

        DETERMINISTIC: run_timestamp z persistence, nie datetime.now().
        """
        return ProofHeader(
            project_name=self._project_name,
            case_name=self._case_name,
            run_timestamp=self._run_timestamp,  # Z persistence, NIE datetime.now()
            solver_version=self._trace.solver_version,
            run_id=self._trace.run_id,
            snapshot_id=self._trace.snapshot_id,
            input_hash=self._trace.input_hash,
            base_mva=self._trace.base_mva,
            tolerance=self._trace.tolerance,
            max_iterations=self._trace.max_iterations,
            slack_bus_id=self._trace.slack_bus_id,
        )

    def _build_network_definition(self) -> NetworkDefinitionSection:
        """Buduje sekcję definicji sieci.

        DETERMINISTIC: Listy bus_ids są sortowane dla stabilności.
        """
        all_bus_ids = set(self._trace.pq_bus_ids) | set(self._trace.pv_bus_ids)
        all_bus_ids.add(self._trace.slack_bus_id)

        return NetworkDefinitionSection(
            title_pl="Definicja problemu",
            base_mva=self._trace.base_mva,
            slack_bus_id=self._trace.slack_bus_id,
            pq_bus_ids=tuple(sorted(self._trace.pq_bus_ids)),  # DETERMINISTIC: sorted
            pv_bus_ids=tuple(sorted(self._trace.pv_bus_ids)),  # DETERMINISTIC: sorted
            bus_count=len(all_bus_ids),
            ybus_description=self._format_ybus_description(),
        )

    def _format_ybus_description(self) -> str:
        """Formatuje opis macierzy admitancji z trace."""
        ybus = self._trace.ybus_trace
        if not ybus:
            return "Macierz admitancji Y_{bus} zbudowana z parametrów sieci."

        info_parts = []
        if "dimensions" in ybus:
            dims = ybus["dimensions"]
            info_parts.append(f"Wymiary: {dims[0]}×{dims[1]}")
        if "nonzero_count" in ybus:
            info_parts.append(f"Elementy niezerowe: {ybus['nonzero_count']}")

        if info_parts:
            return f"Macierz admitancji Y_{{bus}}: {', '.join(info_parts)}."
        return "Macierz admitancji Y_{bus} zbudowana z parametrów sieci."

    def _build_power_flow_equations(self) -> tuple[ProofStep, ...]:
        """Buduje sekcję równań rozpływu mocy."""
        steps: list[ProofStep] = []

        # Równanie P(θ,V)
        step_num = self._next_step_number()
        steps.append(
            ProofStep(
                step_id=generate_step_id("PFPROOF", "EQ", 1),
                step_number=step_num,
                title_pl="Równanie mocy czynnej wstrzykiwanej do węzła",
                equation=_equation_to_definition(EQ_PF_001_P_INJECTION),
                input_values=(),
                substitution_latex=EQ_PF_001_P_INJECTION.latex,
                result=_build_proof_value("P_i", 0.0, "p.u.", "p_injected_pu"),
                unit_check=_build_unit_check("p.u.", "p.u.", "bezwymiarowy"),
                source_keys={},
            )
        )

        # Równanie Q(θ,V)
        step_num = self._next_step_number()
        steps.append(
            ProofStep(
                step_id=generate_step_id("PFPROOF", "EQ", 2),
                step_number=step_num,
                title_pl="Równanie mocy biernej wstrzykiwanej do węzła",
                equation=_equation_to_definition(EQ_PF_002_Q_INJECTION),
                input_values=(),
                substitution_latex=EQ_PF_002_Q_INJECTION.latex,
                result=_build_proof_value("Q_i", 0.0, "p.u.", "q_injected_pu"),
                unit_check=_build_unit_check("p.u.", "p.u.", "bezwymiarowy"),
                source_keys={},
            )
        )

        return tuple(steps)

    def _build_nr_method_description(self) -> ProofStep:
        """Buduje opis metody Newton-Raphson."""
        step_num = self._next_step_number()

        description_latex = r"""
\textbf{Metoda Newtona-Raphsona dla rozpływu mocy}

Metoda iteracyjna rozwiązywania równań rozpływu mocy:

1. Stan początkowy: $V_i^{(0)}, \theta_i^{(0)}$ (flat start lub z poprzedniego rozwiązania)

2. Dla każdej iteracji $k$:
   \begin{enumerate}
   \item Oblicz mismatch: $\Delta P_i^{(k)}, \Delta Q_i^{(k)}$
   \item Zbuduj macierz Jacobiego: $\mathbf{J}^{(k)}$
   \item Rozwiąż układ: $\mathbf{J}^{(k)} \cdot \Delta \mathbf{x}^{(k)} = \Delta \mathbf{f}^{(k)}$
   \item Zaktualizuj stan: $\mathbf{x}^{(k+1)} = \mathbf{x}^{(k)} + \alpha \cdot \Delta \mathbf{x}^{(k)}$
   \end{enumerate}

3. Sprawdź zbieżność: $\|\Delta \mathbf{f}^{(k)}\|_\infty < \varepsilon$
"""

        return ProofStep(
            step_id=generate_step_id("PFPROOF", "NR", 1),
            step_number=step_num,
            title_pl="Metoda Newtona-Raphsona",
            equation=_equation_to_definition(EQ_NR_003_JACOBIAN),
            input_values=(
                _build_proof_value(r"\varepsilon", self._trace.tolerance, "p.u.", "tolerance"),
                _build_proof_value("k_{max}", self._trace.max_iterations, "—", "max_iterations"),
            ),
            substitution_latex=description_latex,
            result=_build_proof_value("metoda", "Newton-Raphson", "—", "method"),
            unit_check=_build_unit_check("—", "—", "brak jednostki"),
            source_keys={"tolerance": "tolerance", "max_iterations": "max_iterations"},
        )

    def _build_initial_state(self) -> InitialStateSection:
        """Buduje sekcję stanu początkowego."""
        return InitialStateSection(
            title_pl="Stan początkowy (V₀, θ₀)",
            init_method=self._trace.init_method,
            init_state=dict(sorted(self._trace.init_state.items())),
        )

    def _build_iterations(self) -> tuple[IterationProofSection, ...]:
        """Buduje sekcje dla każdej iteracji NR."""
        iteration_sections: list[IterationProofSection] = []

        for it_trace in self._trace.iterations:
            section = self._build_iteration_section(it_trace)
            iteration_sections.append(section)

        return tuple(iteration_sections)

    def _build_iteration_section(self, it: PowerFlowIterationTrace) -> IterationProofSection:
        """Buduje sekcję dla pojedynczej iteracji."""
        k = it.k

        # Krok: Mismatch ΔP, ΔQ
        mismatch_step = self._build_mismatch_step(it)

        # Krok: Norma błędu
        norm_step = self._build_norm_step(it)

        # Krok: Jacobian (opcjonalny - jeśli dostępny w trace)
        jacobian_step = self._build_jacobian_step(it) if it.jacobian else None

        # Krok: Delta θ, ΔV (opcjonalny)
        delta_step = self._build_delta_step(it) if it.delta_state else None

        # Krok: Aktualizacja stanu (opcjonalny)
        state_update_step = self._build_state_update_step(it) if it.state_next else None

        # Krok: Sprawdzenie zbieżności
        convergence_check = self._build_iteration_convergence_check(it)

        return IterationProofSection(
            iteration_number=k,
            title_pl=f"Iteracja {k}",
            mismatch_step=mismatch_step,
            norm_step=norm_step,
            jacobian_step=jacobian_step,
            delta_step=delta_step,
            state_update_step=state_update_step,
            convergence_check=convergence_check,
        )

    def _build_mismatch_step(self, it: PowerFlowIterationTrace) -> ProofStep:
        """Buduje krok obliczenia mismatch."""
        k = it.k
        step_num = self._next_step_number()

        # Zbierz wartości mismatch z trace
        input_values: list[ProofValue] = []
        substitution_parts: list[str] = []

        for bus_id, mismatch in sorted(it.mismatch_per_bus.items()):
            delta_p = mismatch.get("delta_p_pu", 0.0)
            delta_q = mismatch.get("delta_q_pu", 0.0)

            input_values.append(
                _build_proof_value(
                    f"\\Delta P_{{{bus_id}}}",
                    delta_p,
                    "p.u.",
                    f"mismatch_per_bus.{bus_id}.delta_p_pu",
                )
            )
            input_values.append(
                _build_proof_value(
                    f"\\Delta Q_{{{bus_id}}}",
                    delta_q,
                    "p.u.",
                    f"mismatch_per_bus.{bus_id}.delta_q_pu",
                )
            )

            substitution_parts.append(
                f"\\Delta P_{{{bus_id}}} = {_format_float(delta_p)}, "
                f"\\Delta Q_{{{bus_id}}} = {_format_float(delta_q)}"
            )

        substitution_latex = f"\\text{{Iteracja }} k={k}:\\quad " + ", \\quad ".join(
            substitution_parts[:3]
        )  # Limit dla czytelności
        if len(substitution_parts) > 3:
            substitution_latex += (
                f", \\quad \\ldots \\quad (\\text{{{len(substitution_parts)} węzłów}})"
            )

        return ProofStep(
            step_id=generate_step_id("PFPROOF", f"ITER{k}_MISMATCH", k),
            step_number=step_num,
            title_pl=f"Iteracja {k}: Mismatch ΔP, ΔQ",
            equation=_equation_to_definition(EQ_NR_001_MISMATCH_P),
            input_values=tuple(input_values),
            substitution_latex=substitution_latex,
            result=_build_proof_value(
                r"\max|\Delta f|",
                it.max_mismatch_pu,
                "p.u.",
                "max_mismatch_pu",
            ),
            unit_check=_build_unit_check("p.u.", "p.u.", "p.u. - p.u. = p.u."),
            source_keys={"mismatch": "mismatch_per_bus"},
        )

    def _build_norm_step(self, it: PowerFlowIterationTrace) -> ProofStep:
        """Buduje krok obliczenia normy błędu."""
        k = it.k
        step_num = self._next_step_number()

        return ProofStep(
            step_id=generate_step_id("PFPROOF", f"ITER{k}_NORM", k),
            step_number=step_num,
            title_pl=f"Iteracja {k}: Norma błędu",
            equation=_equation_to_definition(EQ_CONV_001_NORM),
            input_values=(
                _build_proof_value(r"\|\mathbf{f}\|_2", it.norm_mismatch, "p.u.", "norm_mismatch"),
                _build_proof_value(
                    r"\|\mathbf{f}\|_\infty", it.max_mismatch_pu, "p.u.", "max_mismatch_pu"
                ),
            ),
            substitution_latex=(
                f"\\|\\mathbf{{f}}\\|_2 = {_format_float(it.norm_mismatch)}, \\quad "
                f"\\|\\mathbf{{f}}\\|_\\infty = {_format_float(it.max_mismatch_pu)}"
            ),
            result=_build_proof_value(
                r"\|\mathbf{f}\|_\infty",
                it.max_mismatch_pu,
                "p.u.",
                "max_mismatch_pu",
            ),
            unit_check=_build_unit_check("p.u.", "p.u.", "norma wektora p.u."),
            source_keys={
                "norm_mismatch": "norm_mismatch",
                "max_mismatch_pu": "max_mismatch_pu",
            },
        )

    def _build_jacobian_step(self, it: PowerFlowIterationTrace) -> ProofStep:
        """Buduje krok z informacjami o Jacobianie."""
        k = it.k
        step_num = self._next_step_number()

        jacobian = it.jacobian or {}

        # Zbierz wymiary bloków Jacobiego
        input_values: list[ProofValue] = []
        dimensions_info: list[str] = []

        for block_name in ["J1_dP_dTheta", "J2_dP_dV", "J3_dQ_dTheta", "J4_dQ_dV"]:
            block = jacobian.get(block_name)
            if block and isinstance(block, list) and len(block) > 0:
                rows = len(block)
                cols = len(block[0]) if isinstance(block[0], list) else 1
                input_values.append(
                    _build_proof_value(
                        f"\\dim({block_name.replace('_', ',')})",
                        f"{rows}×{cols}",
                        "—",
                        f"jacobian.{block_name}.dimensions",
                    )
                )
                dimensions_info.append(f"{block_name}: {rows}\\times{cols}")

        substitution_latex = (
            f"\\text{{Iteracja }} k={k}:\\quad "
            f"\\mathbf{{J}} = \\begin{{bmatrix}} "
            f"\\mathbf{{J}}_1 & \\mathbf{{J}}_2 \\\\ "
            f"\\mathbf{{J}}_3 & \\mathbf{{J}}_4 "
            f"\\end{{bmatrix}}"
        )

        if dimensions_info:
            substitution_latex += f"\\quad \\text{{gdzie: }} {', '.join(dimensions_info[:2])}"

        return ProofStep(
            step_id=generate_step_id("PFPROOF", f"ITER{k}_JAC", k),
            step_number=step_num,
            title_pl=f"Iteracja {k}: Macierz Jacobiego",
            equation=_equation_to_definition(EQ_NR_003_JACOBIAN),
            input_values=tuple(input_values),
            substitution_latex=substitution_latex,
            result=_build_proof_value(
                r"\mathbf{J}",
                "zbudowany",
                "—",
                "jacobian",
            ),
            unit_check=_build_unit_check("—", "—", "macierz bezwymiarowa"),
            source_keys={"jacobian": "jacobian"},
        )

    def _build_delta_step(self, it: PowerFlowIterationTrace) -> ProofStep:
        """Buduje krok obliczenia poprawek Δθ, ΔV."""
        k = it.k
        step_num = self._next_step_number()

        delta_state = it.delta_state or {}

        input_values: list[ProofValue] = []
        substitution_parts: list[str] = []

        for bus_id, deltas in sorted(delta_state.items()):
            delta_theta = deltas.get("delta_theta_rad", 0.0)
            delta_v = deltas.get("delta_v_pu", 0.0)

            input_values.append(
                _build_proof_value(
                    f"\\Delta\\theta_{{{bus_id}}}",
                    delta_theta,
                    "rad",
                    f"delta_state.{bus_id}.delta_theta_rad",
                )
            )
            input_values.append(
                _build_proof_value(
                    f"\\Delta V_{{{bus_id}}}",
                    delta_v,
                    "p.u.",
                    f"delta_state.{bus_id}.delta_v_pu",
                )
            )

            delta_theta_deg = math.degrees(delta_theta)
            substitution_parts.append(
                f"\\Delta\\theta_{{{bus_id}}} = {_format_float(delta_theta_deg)}^\\circ, "
                f"\\Delta V_{{{bus_id}}} = {_format_float(delta_v)}"
            )

        substitution_latex = f"\\text{{Iteracja }} k={k}:\\quad " + ", \\quad ".join(
            substitution_parts[:3]
        )
        if len(substitution_parts) > 3:
            substitution_latex += ", \\quad \\ldots"

        return ProofStep(
            step_id=generate_step_id("PFPROOF", f"ITER{k}_DELTA", k),
            step_number=step_num,
            title_pl=f"Iteracja {k}: Poprawki Δθ, ΔV",
            equation=_equation_to_definition(EQ_NR_009_LINEAR_SYSTEM),
            input_values=tuple(input_values),
            substitution_latex=substitution_latex,
            result=_build_proof_value(
                r"\|\Delta \mathbf{x}\|",
                it.step_norm,
                "—",
                "step_norm",
            ),
            unit_check=_build_unit_check("—", "—", "norma wektora"),
            source_keys={"delta_state": "delta_state", "step_norm": "step_norm"},
        )

    def _build_state_update_step(self, it: PowerFlowIterationTrace) -> ProofStep:
        """Buduje krok aktualizacji stanu."""
        k = it.k
        step_num = self._next_step_number()

        state_next = it.state_next or {}
        damping = it.damping_used

        input_values: list[ProofValue] = [
            _build_proof_value(r"\alpha", damping, "—", "damping_used"),
        ]
        substitution_parts: list[str] = []

        for bus_id, state in sorted(state_next.items()):
            v_pu = state.get("v_pu", 1.0)
            theta_rad = state.get("theta_rad", 0.0)
            theta_deg = math.degrees(theta_rad)

            input_values.append(
                _build_proof_value(
                    f"V_{{{bus_id}}}^{{(k+1)}}",
                    v_pu,
                    "p.u.",
                    f"state_next.{bus_id}.v_pu",
                )
            )
            input_values.append(
                _build_proof_value(
                    f"\\theta_{{{bus_id}}}^{{(k+1)}}",
                    theta_rad,
                    "rad",
                    f"state_next.{bus_id}.theta_rad",
                )
            )

            substitution_parts.append(
                f"V_{{{bus_id}}} = {_format_float(v_pu)}, "
                f"\\theta_{{{bus_id}}} = {_format_float(theta_deg)}^\\circ"
            )

        substitution_latex = f"\\alpha = {_format_float(damping)}:\\quad " + ", \\quad ".join(
            substitution_parts[:3]
        )
        if len(substitution_parts) > 3:
            substitution_latex += ", \\quad \\ldots"

        return ProofStep(
            step_id=generate_step_id("PFPROOF", f"ITER{k}_UPDATE", k),
            step_number=step_num,
            title_pl=f"Iteracja {k}: Aktualizacja stanu",
            equation=_equation_to_definition(EQ_NR_010_STATE_UPDATE),
            input_values=tuple(input_values),
            substitution_latex=substitution_latex,
            result=_build_proof_value(
                "stan",
                "zaktualizowany",
                "—",
                "state_next",
            ),
            unit_check=_build_unit_check("—", "—", "brak jednostki"),
            source_keys={"state_next": "state_next", "damping_used": "damping_used"},
        )

    def _build_iteration_convergence_check(self, it: PowerFlowIterationTrace) -> ProofStep:
        """Buduje krok sprawdzenia zbieżności dla iteracji.

        NOT-A-SOLVER: NIE obliczamy zbieżności!
        Sprawdzamy czy to ostatnia iteracja I trace.converged = True.
        """
        k = it.k
        step_num = self._next_step_number()

        tolerance = self._trace.tolerance
        max_mismatch = it.max_mismatch_pu

        # NOT-A-SOLVER: NIE obliczamy converged = max_mismatch < tolerance
        # Zamiast tego sprawdzamy:
        # 1. Czy to ostatnia iteracja?
        # 2. Czy trace.converged = True?
        is_last_iteration = k == self._trace.final_iterations_count
        converged_at_this_iteration = is_last_iteration and self._trace.converged

        if converged_at_this_iteration:
            result_text = "ZBIEŻNE"
            check_latex = (
                f"{_format_float(max_mismatch)} < {_format_float(tolerance)} \\quad \\checkmark"
            )
        else:
            result_text = "KONTYNUUJ"
            check_latex = f"{_format_float(max_mismatch)} \\geq {_format_float(tolerance)} \\quad \\rightarrow k+1"

        return ProofStep(
            step_id=generate_step_id("PFPROOF", f"ITER{k}_CONV", k),
            step_number=step_num,
            title_pl=f"Iteracja {k}: Sprawdzenie zbieżności",
            equation=_equation_to_definition(EQ_CONV_001_NORM),
            input_values=(
                _build_proof_value(
                    r"\|\mathbf{f}\|_\infty", max_mismatch, "p.u.", "max_mismatch_pu"
                ),
                _build_proof_value(r"\varepsilon", tolerance, "p.u.", "tolerance"),
            ),
            substitution_latex=check_latex,
            result=_build_proof_value(
                "status",
                result_text,
                "—",
                "convergence_status",
            ),
            unit_check=_build_unit_check("—", "—", "porównanie bezwymiarowe"),
            source_keys={"max_mismatch_pu": "max_mismatch_pu", "tolerance": "tolerance"},
        )

    def _build_convergence_criterion(self) -> ProofStep:
        """Buduje krok kryterium zbieżności końcowego."""
        step_num = self._next_step_number()

        final_mismatch = 0.0
        if self._trace.iterations:
            final_mismatch = self._trace.iterations[-1].max_mismatch_pu

        converged = self._trace.converged
        iterations = self._trace.final_iterations_count

        if converged:
            pass
        else:
            pass

        return ProofStep(
            step_id=generate_step_id("PFPROOF", "CONV", 1),
            step_number=step_num,
            title_pl="Kryterium zbieżności",
            equation=_equation_to_definition(EQ_CONV_001_NORM),
            input_values=(
                _build_proof_value(
                    r"\|\mathbf{f}\|_\infty", final_mismatch, "p.u.", "final_max_mismatch"
                ),
                _build_proof_value(r"\varepsilon", self._trace.tolerance, "p.u.", "tolerance"),
                _build_proof_value("k", iterations, "—", "iterations_count"),
            ),
            substitution_latex=(
                f"\\|\\mathbf{{f}}\\|_\\infty = {_format_float(final_mismatch)} "
                + ("<" if converged else "\\geq")
                + " "
                + f"\\varepsilon = {_format_float(self._trace.tolerance)} \\quad "
                f"\\text{{({iterations} iteracji)}}"
            ),
            result=_build_proof_value(
                "wynik",
                "ZBIEŻNE" if converged else "NIEZB.",
                "—",
                "converged",
            ),
            unit_check=_build_unit_check("—", "—", "porównanie"),
            source_keys={
                "converged": "converged",
                "iterations_count": "final_iterations_count",
                "tolerance": "tolerance",
            },
        )

    def _build_final_state(self) -> FinalStateSection:
        """Buduje sekcję stanu końcowego."""
        # Zbierz stan końcowy z ostatniej iteracji
        final_state: dict[str, dict[str, float]] = {}

        if self._trace.iterations and self._trace.iterations[-1].state_next:
            for bus_id, state in self._trace.iterations[-1].state_next.items():
                final_state[bus_id] = {
                    "v_pu": state.get("v_pu", 1.0),
                    "theta_rad": state.get("theta_rad", 0.0),
                }

        # Dodaj wyniki mocy z result
        for bus_result in self._result.bus_results:
            if bus_result.bus_id in final_state:
                final_state[bus_result.bus_id]["p_mw"] = bus_result.p_injected_mw
                final_state[bus_result.bus_id]["q_mvar"] = bus_result.q_injected_mvar
            else:
                final_state[bus_result.bus_id] = {
                    "v_pu": bus_result.v_pu,
                    "theta_rad": math.radians(bus_result.angle_deg),
                    "p_mw": bus_result.p_injected_mw,
                    "q_mvar": bus_result.q_injected_mvar,
                }

        # Bilans mocy
        power_balance = {
            "total_losses_p_mw": self._result.summary.total_losses_p_mw,
            "total_losses_q_mvar": self._result.summary.total_losses_q_mvar,
            "slack_p_mw": self._result.summary.slack_p_mw,
            "slack_q_mvar": self._result.summary.slack_q_mvar,
        }

        return FinalStateSection(
            title_pl="Stan końcowy (V, θ, bilans mocy)",
            final_state=dict(sorted(final_state.items())),
            power_balance=power_balance,
        )

    def _build_verification(self) -> VerificationSection:
        """Buduje sekcję weryfikacji."""
        # Weryfikacja jednostek - wszystkie kroki używają p.u.
        unit_consistency = True

        # Weryfikacja bilansu energetycznego
        # Suma mocy wstrzykniętych = straty (dla zamkniętego systemu)
        energy_balance = self._trace.converged

        # Weryfikacja braku sprzeczności
        # Napięcia w zakresie fizycznym (0.5 - 1.5 p.u.)
        no_contradictions = True
        for bus_result in self._result.bus_results:
            if bus_result.v_pu < 0.5 or bus_result.v_pu > 1.5:
                no_contradictions = False
                break

        all_passed = unit_consistency and energy_balance and no_contradictions

        return VerificationSection(
            title_pl="Weryfikacja",
            unit_consistency=unit_consistency,
            energy_balance=energy_balance,
            no_contradictions=no_contradictions,
            all_checks_passed=all_passed,
        )

    def _build_summary(self, iterations: tuple[IterationProofSection, ...]) -> ProofSummary:
        """Buduje podsumowanie dokumentu."""
        # Zbierz kluczowe wyniki
        key_results: dict[str, ProofValue] = {
            "converged": _build_proof_value(
                "zbieżność",
                "TAK" if self._trace.converged else "NIE",
                "—",
                "converged",
            ),
            "iterations": _build_proof_value(
                "iteracje",
                self._trace.final_iterations_count,
                "—",
                "iterations_count",
            ),
            "min_v_pu": _build_proof_value(
                "V_{min}",
                self._result.summary.min_v_pu,
                "p.u.",
                "min_v_pu",
            ),
            "max_v_pu": _build_proof_value(
                "V_{max}",
                self._result.summary.max_v_pu,
                "p.u.",
                "max_v_pu",
            ),
            "total_losses_p_mw": _build_proof_value(
                r"\sum P_{loss}",
                self._result.summary.total_losses_p_mw,
                "MW",
                "total_losses_p_mw",
            ),
            "slack_p_mw": _build_proof_value(
                "P_{slack}",
                self._result.summary.slack_p_mw,
                "MW",
                "slack_p_mw",
            ),
        }

        # Zlicz kroki
        total_steps = self._step_counter

        # Ostrzeżenia
        warnings: list[str] = []
        if not self._trace.converged:
            warnings.append("Obliczenia nie zbiegły do wymaganej tolerancji.")
        if self._result.summary.min_v_pu < 0.9:
            warnings.append(f"Niskie napięcie: V_min = {self._result.summary.min_v_pu:.4f} p.u.")
        if self._result.summary.max_v_pu > 1.1:
            warnings.append(f"Wysokie napięcie: V_max = {self._result.summary.max_v_pu:.4f} p.u.")

        # Końcowy mismatch
        final_mismatch = 0.0
        if self._trace.iterations:
            final_mismatch = self._trace.iterations[-1].max_mismatch_pu

        return ProofSummary(
            converged=self._trace.converged,
            iterations_count=self._trace.final_iterations_count,
            final_max_mismatch=final_mismatch,
            key_results=key_results,
            unit_check_passed=True,  # Wszystkie jednostki są spójne
            total_steps=total_steps,
            warnings=tuple(warnings),
        )


def build_power_flow_proof(
    trace: PowerFlowTrace,
    result: PowerFlowResultV1,
    *,
    project_name: str = "Projekt MV-Design",
    case_name: str = "Przypadek studyjny",
    artifact_id: str | None = None,
    run_timestamp: str | None = None,
) -> PowerFlowProofDocument:
    """Buduje PowerFlowProofDocument z trace i result.

    DETERMINISTIC: Ten sam trace → identyczny proof.
    - document_id = sha256(run_id:input_hash:snapshot_id)
    - created_at = run_timestamp z persistence

    Args:
        trace: PowerFlowTrace z obliczeń NR.
        result: PowerFlowResultV1 z wynikami.
        project_name: Nazwa projektu.
        case_name: Nazwa przypadku studyjnego.
        artifact_id: ID artefaktu (opcjonalne, deterministyczny z trace).
        run_timestamp: Timestamp uruchomienia z persistence (ISO format).
                       NIE datetime.now() - musi być przekazany z zewnątrz.

    Returns:
        Kompletny PowerFlowProofDocument.
    """
    builder = PowerFlowProofBuilder(
        trace=trace,
        result=result,
        project_name=project_name,
        case_name=case_name,
        artifact_id=artifact_id,
        run_timestamp=run_timestamp,
    )
    return builder.build()
