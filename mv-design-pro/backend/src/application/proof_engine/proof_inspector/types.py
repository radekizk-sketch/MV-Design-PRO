"""
Proof Inspector Types — P11.1d

STATUS: CANONICAL & BINDING
Reference: P11_1d_PROOF_UI_EXPORT.md

Typy danych dla warstwy przegladu i audytu dowodow.
Read-only: brak mutacji, brak logiki decyzyjnej.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID


@dataclass(frozen=True)
class ValueView:
    """
    Widok wartosci z pelnymi metadanymi.

    Attributes:
        symbol: Symbol matematyczny (LaTeX)
        value: Wartosc numeryczna (sformatowana)
        raw_value: Oryginalna wartosc (float/complex)
        unit: Jednostka
        mapping_key: Klucz mapowania do trace/result
        alias_pl: Opcjonalny alias semantyczny (polski termin techniczny)
    """

    symbol: str
    value: str  # Sformatowana wartosc
    raw_value: float | complex | str
    unit: str
    mapping_key: str
    alias_pl: str | None = None

    def to_dict(self) -> dict[str, Any]:
        raw = self.raw_value
        if isinstance(raw, complex):
            raw = f"{raw.real:.4f}+j{raw.imag:.4f}"
        result = {
            "symbol": self.symbol,
            "value": self.value,
            "raw_value": raw,
            "unit": self.unit,
            "mapping_key": self.mapping_key,
        }
        if self.alias_pl is not None:
            result["alias_pl"] = self.alias_pl
        return result


@dataclass(frozen=True)
class UnitCheckView:
    """
    Widok weryfikacji jednostek.

    Attributes:
        passed: Czy weryfikacja przeszla
        derivation: Sciezka derywacji (np. "kV / Ohm = kA")
        expected_unit: Oczekiwana jednostka
        computed_unit: Obliczona jednostka
    """

    passed: bool
    derivation: str
    expected_unit: str
    computed_unit: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "derivation": self.derivation,
            "expected_unit": self.expected_unit,
            "computed_unit": self.computed_unit,
        }


@dataclass(frozen=True)
class StepView:
    """
    Widok pojedynczego kroku dowodu.

    Read-only: pelny podglad kroku z formulami i wartosciami.

    Attributes:
        step_number: Numer kroku (1, 2, 3, ...)
        step_id: Identyfikator kroku (np. "SC3F_STEP_001")
        title: Tytul kroku (PL)
        equation_id: Identyfikator rownania z rejestru
        formula_latex: Wzor w notacji LaTeX
        standard_ref: Odniesienie do normy
        input_values: Lista wartosci wejsciowych
        substitution_latex: Wzor z podstawionymi wartosciami
        result: Wynik obliczenia
        unit_check: Weryfikacja jednostek
        source_keys: Mapping symbol -> klucz w trace/result
    """

    step_number: int
    step_id: str
    title: str
    equation_id: str
    formula_latex: str
    standard_ref: str
    input_values: tuple[ValueView, ...]
    substitution_latex: str
    result: ValueView
    unit_check: UnitCheckView
    source_keys: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        # Sortowanie input_values alfabetycznie po symbol (determinizm)
        sorted_inputs = sorted(self.input_values, key=lambda x: x.symbol)
        return {
            "step_number": self.step_number,
            "step_id": self.step_id,
            "title": self.title,
            "equation_id": self.equation_id,
            "formula_latex": self.formula_latex,
            "standard_ref": self.standard_ref,
            "input_values": [v.to_dict() for v in sorted_inputs],
            "substitution_latex": self.substitution_latex,
            "result": self.result.to_dict(),
            "unit_check": self.unit_check.to_dict(),
            "source_keys": dict(sorted(self.source_keys.items())),
        }


@dataclass(frozen=True)
class SummaryView:
    """
    Widok podsumowania dowodu.

    Attributes:
        key_results: Slownik glownych wynikow (nazwa -> ValueView)
        unit_check_passed: Czy wszystkie jednostki OK
        total_steps: Liczba krokow
        warnings: Lista ostrzezen
    """

    key_results: dict[str, ValueView]
    unit_check_passed: bool
    total_steps: int
    warnings: tuple[str, ...] = ()
    overall_status: str | None = None
    failed_checks: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        # Sortowanie key_results alfabetycznie (determinizm)
        sorted_results = dict(sorted(self.key_results.items()))
        return {
            "key_results": {k: v.to_dict() for k, v in sorted_results.items()},
            "unit_check_passed": self.unit_check_passed,
            "total_steps": self.total_steps,
            "warnings": list(self.warnings),
            "overall_status": self.overall_status,
            "failed_checks": list(self.failed_checks),
        }


@dataclass(frozen=True)
class HeaderView:
    """
    Widok naglowka dokumentu.

    Attributes:
        project_name: Nazwa projektu
        case_name: Nazwa przypadku
        run_timestamp: Czas uruchomienia
        solver_version: Wersja solvera
        target_id: Identyfikator elementu (opcjonalne)
        element_kind: Rodzaj elementu (opcjonalne)
        fault_location: Lokalizacja zwarcia (opcjonalne)
        fault_type: Typ zwarcia (opcjonalne)
        voltage_factor: Wspolczynnik napiecia (opcjonalne)
        source_bus: Szyna zrodlowa (opcjonalne)
        target_bus: Szyna docelowa (opcjonalne)
    """

    project_name: str
    case_name: str
    run_timestamp: datetime
    solver_version: str
    target_id: str | None = None
    element_kind: str | None = None
    fault_location: str | None = None
    fault_type: str | None = None
    voltage_factor: float | None = None
    source_bus: str | None = None
    target_bus: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_name": self.project_name,
            "case_name": self.case_name,
            "run_timestamp": self.run_timestamp.isoformat(),
            "solver_version": self.solver_version,
            "target_id": self.target_id,
            "element_kind": self.element_kind,
            "fault_location": self.fault_location,
            "fault_type": self.fault_type,
            "voltage_factor": self.voltage_factor,
            "source_bus": self.source_bus,
            "target_bus": self.target_bus,
        }


@dataclass(frozen=True)
class CounterfactualRow:
    """
    Wiersz tabeli counterfactual A/B/Delta.

    Attributes:
        name: Nazwa wielkosci (np. "Q_cmd")
        symbol_latex: Symbol LaTeX
        unit: Jednostka
        value_a: Wartosc scenariusza A
        value_b: Wartosc scenariusza B
        delta: Roznica (B - A)
    """

    name: str
    symbol_latex: str
    unit: str
    value_a: float
    value_b: float
    delta: float

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "symbol_latex": self.symbol_latex,
            "unit": self.unit,
            "value_a": self.value_a,
            "value_b": self.value_b,
            "delta": self.delta,
        }


@dataclass(frozen=True)
class CounterfactualView:
    """
    Widok porownania counterfactual A vs B.

    Attributes:
        rows: Lista wierszy tabeli
        has_vdrop_data: Czy zawiera dane VDROP
    """

    rows: tuple[CounterfactualRow, ...]
    has_vdrop_data: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "rows": [r.to_dict() for r in self.rows],
            "has_vdrop_data": self.has_vdrop_data,
        }


@dataclass(frozen=True)
class InspectorView:
    """
    Pelny widok dokumentu dowodowego (read-only).

    Glowna struktura dla Proof Inspector.
    Nie modyfikuje ProofDocument — tylko prezentuje dane.

    Attributes:
        document_id: ID dokumentu
        artifact_id: ID artefaktu (powiazanie z TraceArtifact)
        created_at: Data utworzenia
        proof_type: Typ dowodu (SC3F, VDROP, Q_U, etc.)
        title: Tytul dokumentu (PL)
        header: Naglowek
        steps: Lista krokow (deterministyczna kolejnosc)
        summary: Podsumowanie
        counterfactual: Widok counterfactual (opcjonalny)
        is_counterfactual: Czy to porownanie A/B
    """

    document_id: UUID
    artifact_id: UUID
    created_at: datetime
    proof_type: str
    title: str
    header: HeaderView
    steps: tuple[StepView, ...]
    summary: SummaryView
    counterfactual: CounterfactualView | None = None
    is_counterfactual: bool = False

    def to_dict(self) -> dict[str, Any]:
        # Sortowanie krokow po step_number (determinizm)
        sorted_steps = sorted(self.steps, key=lambda x: x.step_number)
        result = {
            "document_id": str(self.document_id),
            "artifact_id": str(self.artifact_id),
            "created_at": self.created_at.isoformat(),
            "proof_type": self.proof_type,
            "title": self.title,
            "header": self.header.to_dict(),
            "steps": [s.to_dict() for s in sorted_steps],
            "summary": self.summary.to_dict(),
            "is_counterfactual": self.is_counterfactual,
        }
        if self.counterfactual:
            result["counterfactual"] = self.counterfactual.to_dict()
        return result
