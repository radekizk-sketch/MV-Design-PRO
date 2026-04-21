"""
P21: PowerFlowProofDocument - akademicka warstwa dowodowa dla Power Flow NR.

Ten moduł definiuje struktury dla formalnego dowodu matematycznego
przebiegu obliczeń Newton-Raphson, umożliwiając pełną weryfikację akademicką.

CANONICAL ALIGNMENT:
- READ-ONLY: Interpretacja trace, zero obliczeń solvera
- WHITE-BOX: Pełna możliwość ręcznej weryfikacji
- DETERMINISTIC: Ten sam Run → identyczny Proof
- LATEX-ONLY: Wszystkie wzory w notacji LaTeX
- POLISH: 100% język polski
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any

# P21: Proof version for compatibility
POWER_FLOW_PROOF_VERSION = "1.0.0"


@dataclass(frozen=True)
class ProofValue:
    """Wartość w dowodzie z pełną metadataną.

    Attributes:
        symbol: Symbol matematyczny (LaTeX).
        value: Wartość liczbowa lub tekstowa.
        unit: Jednostka SI lub '—' dla bezwymiarowych.
        source_key: Klucz źródłowy w trace/result.
        formatted: Sformatowana wartość z jednostką.
    """

    symbol: str
    value: float | str | complex
    unit: str
    source_key: str
    formatted: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "value": self._serialize_value(),
            "unit": self.unit,
            "source_key": self.source_key,
            "formatted": self.formatted or self._format_value(),
        }

    def _serialize_value(self) -> float | str:
        if isinstance(self.value, complex):
            return f"{self.value.real:.6g}+j{self.value.imag:.6g}"
        return self.value

    def _format_value(self) -> str:
        if isinstance(self.value, complex):
            return f"{self.value.real:.4f} + j{self.value.imag:.4f} {self.unit}".strip()
        if isinstance(self.value, float):
            return f"{self.value:.4f} {self.unit}".strip()
        return f"{self.value} {self.unit}".strip()


@dataclass(frozen=True)
class UnitCheckResult:
    """Wynik weryfikacji spójności jednostek.

    Attributes:
        passed: Czy weryfikacja przeszła pomyślnie.
        expected_unit: Oczekiwana jednostka wyniku.
        computed_unit: Jednostka obliczona z jednostek wejściowych.
        derivation: Ścieżka derywacji jednostek.
    """

    passed: bool
    expected_unit: str
    computed_unit: str
    derivation: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "expected_unit": self.expected_unit,
            "computed_unit": self.computed_unit,
            "derivation": self.derivation,
        }


@dataclass(frozen=True)
class EquationDefinition:
    """Definicja równania z rejestru równań.

    Attributes:
        equation_id: Unikalny identyfikator równania.
        latex: Wzór w notacji LaTeX.
        name_pl: Nazwa równania po polsku.
        description_pl: Opis równania po polsku.
    """

    equation_id: str
    latex: str
    name_pl: str
    description_pl: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "equation_id": self.equation_id,
            "latex": self.latex,
            "name_pl": self.name_pl,
            "description_pl": self.description_pl,
        }


@dataclass(frozen=True)
class ProofStep:
    """Pojedynczy krok w łańcuchu dowodowym.

    Attributes:
        step_id: Unikalny identyfikator kroku (np. NR_ITER_001).
        step_number: Numer porządkowy kroku.
        title_pl: Tytuł kroku po polsku.
        equation: Definicja równania.
        input_values: Wartości wejściowe do podstawienia.
        substitution_latex: Wzór z podstawionymi wartościami (LaTeX).
        result: Wynik obliczenia.
        unit_check: Wynik weryfikacji jednostek.
        source_keys: Mapping: symbol → klucz w trace.
    """

    step_id: str
    step_number: int
    title_pl: str
    equation: EquationDefinition
    input_values: tuple[ProofValue, ...]
    substitution_latex: str
    result: ProofValue
    unit_check: UnitCheckResult
    source_keys: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "step_id": self.step_id,
            "step_number": self.step_number,
            "title_pl": self.title_pl,
            "equation": self.equation.to_dict(),
            "input_values": [v.to_dict() for v in self.input_values],
            "substitution_latex": self.substitution_latex,
            "result": self.result.to_dict(),
            "unit_check": self.unit_check.to_dict(),
            "source_keys": dict(sorted(self.source_keys.items())),
        }


@dataclass(frozen=True)
class IterationProofSection:
    """Sekcja dowodowa dla pojedynczej iteracji NR.

    Attributes:
        iteration_number: Numer iteracji (1-indexed).
        title_pl: Tytuł sekcji po polsku.
        mismatch_step: Krok obliczenia ΔP, ΔQ.
        norm_step: Krok obliczenia normy błędu.
        jacobian_step: Krok budowy Jacobianu (opcjonalny).
        delta_step: Krok obliczenia Δθ, ΔV.
        state_update_step: Krok aktualizacji stanu.
        convergence_check: Krok sprawdzenia zbieżności.
    """

    iteration_number: int
    title_pl: str
    mismatch_step: ProofStep
    norm_step: ProofStep
    jacobian_step: ProofStep | None
    delta_step: ProofStep | None
    state_update_step: ProofStep | None
    convergence_check: ProofStep

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "iteration_number": self.iteration_number,
            "title_pl": self.title_pl,
            "mismatch_step": self.mismatch_step.to_dict(),
            "norm_step": self.norm_step.to_dict(),
            "convergence_check": self.convergence_check.to_dict(),
        }
        if self.jacobian_step:
            result["jacobian_step"] = self.jacobian_step.to_dict()
        if self.delta_step:
            result["delta_step"] = self.delta_step.to_dict()
        if self.state_update_step:
            result["state_update_step"] = self.state_update_step.to_dict()
        return result

    def get_all_steps(self) -> list[ProofStep]:
        """Zwraca wszystkie kroki w sekcji w kolejności."""
        steps = [self.mismatch_step, self.norm_step]
        if self.jacobian_step:
            steps.append(self.jacobian_step)
        if self.delta_step:
            steps.append(self.delta_step)
        if self.state_update_step:
            steps.append(self.state_update_step)
        steps.append(self.convergence_check)
        return steps


@dataclass(frozen=True)
class ProofHeader:
    """Nagłówek dokumentu dowodowego.

    Attributes:
        project_name: Nazwa projektu.
        case_name: Nazwa przypadku studyjnego.
        run_timestamp: Czas uruchomienia (z persistence, NIE datetime.now()).
        solver_version: Wersja solvera.
        run_id: ID uruchomienia.
        snapshot_id: ID snapshotu sieci.
        input_hash: Hash danych wejściowych.
        base_mva: Moc bazowa [MVA].
        tolerance: Tolerancja zbieżności.
        max_iterations: Maksymalna liczba iteracji.
        slack_bus_id: ID węzła bilansującego.
    """

    project_name: str
    case_name: str
    run_timestamp: str
    solver_version: str
    run_id: str | None = None
    snapshot_id: str | None = None
    input_hash: str | None = None
    base_mva: float = 100.0
    tolerance: float = 1e-6
    max_iterations: int = 100
    slack_bus_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_name": self.project_name,
            "case_name": self.case_name,
            "run_timestamp": self.run_timestamp,
            "solver_version": self.solver_version,
            "run_id": self.run_id,
            "snapshot_id": self.snapshot_id,
            "input_hash": self.input_hash,
            "base_mva": self.base_mva,
            "tolerance": self.tolerance,
            "max_iterations": self.max_iterations,
            "slack_bus_id": self.slack_bus_id,
        }


@dataclass(frozen=True)
class ProofSummary:
    """Podsumowanie dokumentu dowodowego.

    Attributes:
        converged: Czy obliczenia zbiegły.
        iterations_count: Liczba wykonanych iteracji.
        final_max_mismatch: Końcowy maksymalny mismatch.
        key_results: Kluczowe wyniki (napięcia, moce).
        unit_check_passed: Czy wszystkie weryfikacje jednostek przeszły.
        total_steps: Całkowita liczba kroków.
        warnings: Lista ostrzeżeń.
    """

    converged: bool
    iterations_count: int
    final_max_mismatch: float
    key_results: dict[str, ProofValue]
    unit_check_passed: bool
    total_steps: int
    warnings: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "converged": self.converged,
            "iterations_count": self.iterations_count,
            "final_max_mismatch": self.final_max_mismatch,
            "key_results": {k: v.to_dict() for k, v in sorted(self.key_results.items())},
            "unit_check_passed": self.unit_check_passed,
            "total_steps": self.total_steps,
            "warnings": list(self.warnings),
        }


@dataclass(frozen=True)
class NetworkDefinitionSection:
    """Sekcja definicji sieci.

    Attributes:
        title_pl: Tytuł sekcji.
        base_mva: Moc bazowa [MVA].
        slack_bus_id: ID węzła bilansującego.
        pq_bus_ids: Lista ID węzłów PQ.
        pv_bus_ids: Lista ID węzłów PV.
        bus_count: Liczba węzłów.
        ybus_description: Opis macierzy admitancji.
    """

    title_pl: str
    base_mva: float
    slack_bus_id: str
    pq_bus_ids: tuple[str, ...]
    pv_bus_ids: tuple[str, ...]
    bus_count: int
    ybus_description: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "title_pl": self.title_pl,
            "base_mva": self.base_mva,
            "slack_bus_id": self.slack_bus_id,
            "pq_bus_ids": list(self.pq_bus_ids),
            "pv_bus_ids": list(self.pv_bus_ids),
            "bus_count": self.bus_count,
            "ybus_description": self.ybus_description,
        }


@dataclass(frozen=True)
class InitialStateSection:
    """Sekcja stanu początkowego.

    Attributes:
        title_pl: Tytuł sekcji.
        init_method: Metoda inicjalizacji ('flat' lub 'last_solution').
        init_state: Stan początkowy per bus {bus_id: {v_pu, theta_rad}}.
    """

    title_pl: str
    init_method: str
    init_state: dict[str, dict[str, float]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "title_pl": self.title_pl,
            "init_method": self.init_method,
            "init_state": dict(sorted(self.init_state.items())),
        }


@dataclass(frozen=True)
class FinalStateSection:
    """Sekcja stanu końcowego.

    Attributes:
        title_pl: Tytuł sekcji.
        final_state: Stan końcowy per bus {bus_id: {v_pu, theta_rad, p_mw, q_mvar}}.
        power_balance: Bilans mocy.
    """

    title_pl: str
    final_state: dict[str, dict[str, float]]
    power_balance: dict[str, float]

    def to_dict(self) -> dict[str, Any]:
        return {
            "title_pl": self.title_pl,
            "final_state": dict(sorted(self.final_state.items())),
            "power_balance": self.power_balance,
        }


@dataclass(frozen=True)
class VerificationSection:
    """Sekcja weryfikacji.

    Attributes:
        title_pl: Tytuł sekcji.
        unit_consistency: Spójność jednostek.
        energy_balance: Bilans energetyczny.
        no_contradictions: Brak sprzeczności.
        all_checks_passed: Czy wszystkie testy przeszły.
    """

    title_pl: str
    unit_consistency: bool
    energy_balance: bool
    no_contradictions: bool
    all_checks_passed: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "title_pl": self.title_pl,
            "unit_consistency": self.unit_consistency,
            "energy_balance": self.energy_balance,
            "no_contradictions": self.no_contradictions,
            "all_checks_passed": self.all_checks_passed,
        }


@dataclass(frozen=True)
class PowerFlowProofDocument:
    """P21: Kompletny dokument dowodowy dla Power Flow NR.

    Struktura:
    1. Nagłówek (header)
    2. Definicja problemu (network_definition)
    3. Równania rozpływu mocy (power_flow_equations) - sekcja statyczna
    4. Metoda Newton-Raphson (nr_method_description) - sekcja statyczna
    5. Stan początkowy (initial_state)
    6. Iteracje NR (iterations)
    7. Kryterium zbieżności (convergence_criterion)
    8. Stan końcowy (final_state)
    9. Weryfikacja (verification)
    10. Podsumowanie (summary)

    IMMUTABLE: Po utworzeniu dokument nie może być modyfikowany.
    DETERMINISTIC: Ten sam trace → identyczny dokument.
    """

    document_id: str
    artifact_id: str
    created_at: str
    proof_type: str
    proof_version: str
    title_pl: str
    header: ProofHeader
    network_definition: NetworkDefinitionSection
    power_flow_equations: tuple[ProofStep, ...]
    nr_method_description: ProofStep
    initial_state: InitialStateSection
    iterations: tuple[IterationProofSection, ...]
    convergence_criterion: ProofStep
    final_state: FinalStateSection
    verification: VerificationSection
    summary: ProofSummary
    latex_representation: str = ""
    json_representation: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Serializacja do JSON (deterministyczna)."""
        return {
            "document_id": self.document_id,
            "artifact_id": self.artifact_id,
            "created_at": self.created_at,
            "proof_type": self.proof_type,
            "proof_version": self.proof_version,
            "title_pl": self.title_pl,
            "header": self.header.to_dict(),
            "network_definition": self.network_definition.to_dict(),
            "power_flow_equations": [eq.to_dict() for eq in self.power_flow_equations],
            "nr_method_description": self.nr_method_description.to_dict(),
            "initial_state": self.initial_state.to_dict(),
            "iterations": [it.to_dict() for it in self.iterations],
            "convergence_criterion": self.convergence_criterion.to_dict(),
            "final_state": self.final_state.to_dict(),
            "verification": self.verification.to_dict(),
            "summary": self.summary.to_dict(),
        }

    def get_all_steps(self) -> list[ProofStep]:
        """Zwraca wszystkie kroki dowodowe w kolejności."""
        steps: list[ProofStep] = []
        steps.extend(self.power_flow_equations)
        steps.append(self.nr_method_description)
        for iteration in self.iterations:
            steps.extend(iteration.get_all_steps())
        steps.append(self.convergence_criterion)
        return steps


def generate_document_id(
    run_id: str | None = None,
    input_hash: str | None = None,
    snapshot_id: str | None = None,
) -> str:
    """Generuje deterministyczny ID dokumentu.

    ID jest obliczane jako SHA256 z konkatenacji run_id, input_hash i snapshot_id.
    Ten sam Run → identyczny document_id (DETERMINISTIC).

    Args:
        run_id: ID uruchomienia.
        input_hash: Hash danych wejściowych.
        snapshot_id: ID snapshotu sieci.

    Returns:
        Deterministyczny 32-znakowy hex ID.
    """
    components = [
        run_id or "no_run_id",
        input_hash or "no_input_hash",
        snapshot_id or "no_snapshot_id",
    ]
    combined = ":".join(components)
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()[:32]


def generate_step_id(proof_type: str, section: str, step_number: int) -> str:
    """Generuje stabilne ID kroku.

    Args:
        proof_type: Typ dowodu (np. 'POWER_FLOW_NR').
        section: Sekcja (np. 'ITER', 'EQ', 'CONV').
        step_number: Numer kroku.

    Returns:
        Stabilne ID kroku (np. 'POWER_FLOW_NR_ITER_001').
    """
    return f"{proof_type}_{section}_{step_number:03d}"
