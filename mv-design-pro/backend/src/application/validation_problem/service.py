"""ValidationProblemService — unifikacja błędów / ostrzeżeń / informacji (PR-12).

Brief 2 §3 pkt 11. Agreguje problemy z:
- enm/validator.py (porty, spójność napięć)
- topology.py (BFS / spójność topologiczna)
- calculation_readiness/ (braki danych do obliczeń)

Każdy problem ma: target (ObjectRef), fix_actions, description_pl.
"""

from __future__ import annotations

from typing import Literal

from application.calculation_readiness.service import (
    CalculationReadinessService,
    ReadinessReport,
)
from enm.models import EnergyNetworkModel
from pydantic import BaseModel, Field

ValidationSeverity = Literal["error", "warning", "info"]


class FixActionDescriptor(BaseModel):
    """Opis fix-action dla problemu walidacyjnego."""

    action_id: str
    label_pl: str


class ValidationProblem(BaseModel):
    """Pojedynczy problem walidacyjny (brief 2 §3 pkt 11)."""

    problem_id: str
    severity: ValidationSeverity
    target_ref: str  # ObjectRef — ref_id obiektu w ENM
    description_pl: str
    fix_actions: list[FixActionDescriptor] = Field(default_factory=list)
    show_on_sld: bool = True


class ValidationProblemReport(BaseModel):
    """Pełen raport problemów walidacyjnych."""

    problems: list[ValidationProblem]

    @property
    def error_count(self) -> int:
        return sum(1 for p in self.problems if p.severity == "error")

    @property
    def warning_count(self) -> int:
        return sum(1 for p in self.problems if p.severity == "warning")

    @property
    def info_count(self) -> int:
        return sum(1 for p in self.problems if p.severity == "info")

    @property
    def is_blocking(self) -> bool:
        return self.error_count > 0


class ValidationProblemService:
    """Agreguje problemy walidacyjne z różnych źródeł."""

    def __init__(
        self,
        readiness_service: CalculationReadinessService | None = None,
    ) -> None:
        self._readiness = readiness_service or CalculationReadinessService()

    def collect_problems(self, enm: EnergyNetworkModel) -> ValidationProblemReport:
        """Zbiera problemy z wielu źródeł i klasyfikuje wg severity."""
        problems: list[ValidationProblem] = []

        # 1. Walidacja portów (PR-3 ENM)
        problems.extend(self._validate_ports(enm))

        # 2. Walidacja spójności napięć (PR-3 multi-voltage nN)
        problems.extend(self._validate_voltage_consistency(enm))

        # 3. Walidacja końców kabli/linii (endpoint_a/endpoint_b)
        problems.extend(self._validate_endpoints(enm))

        # 4. Włączamy ostrzeżenia z calculation readiness (warning, nie error)
        readiness = self._readiness.evaluate(enm)
        problems.extend(self._readiness_to_warnings(readiness))

        return ValidationProblemReport(problems=problems)

    def _validate_ports(self, enm: EnergyNetworkModel) -> list[ValidationProblem]:
        problems: list[ValidationProblem] = []
        for bay in enm.bays:
            if not bay.ports:
                problems.append(
                    ValidationProblem(
                        problem_id=f"bay_no_ports::{bay.ref_id}",
                        severity="error",
                        target_ref=bay.ref_id,
                        description_pl=f"Pole '{bay.name}' nie ma zdefiniowanych portów.",
                        fix_actions=[
                            FixActionDescriptor(
                                action_id="run_port_migration",
                                label_pl="Uruchom automigrację portów (PR-3)",
                            ),
                        ],
                    ),
                )
        return problems

    def _validate_voltage_consistency(self, enm: EnergyNetworkModel) -> list[ValidationProblem]:
        problems: list[ValidationProblem] = []
        bus_voltage = {b.ref_id: b.voltage_kv for b in enm.buses}

        # Generator na szynie nN ≠ napięcie szyny.
        # Generator (ENM) nie ma jawnego pola voltage_kv — domyślnie napięcie generatora
        # przyjmowane jest z bus_ref. Walidacja niespójności zachodzi gdy materialized_params
        # zawiera 'rated_voltage_kv' z katalogu różne od bus_kv (np. PV 0,4 kV podpięte do
        # szyny SN 15 kV bez transformatora).
        for gen in enm.generators:
            bus_kv = bus_voltage.get(gen.bus_ref)
            if bus_kv is None:
                continue
            gen_voltage: float | None = None
            mp = getattr(gen, "materialized_params", None) or {}
            if isinstance(mp, dict):
                raw = mp.get("rated_voltage_kv") or mp.get("ulv_kv")
                if isinstance(raw, int | float):
                    gen_voltage = float(raw)
            if gen_voltage is not None and abs(gen_voltage - bus_kv) > 0.01:
                problems.append(
                    ValidationProblem(
                        problem_id=f"voltage_mismatch::{gen.ref_id}",
                        severity="error",
                        target_ref=gen.ref_id,
                        description_pl=(
                            f"Niespójność napięć: źródło '{gen.name}' "
                            f"({gen_voltage} kV) vs szyna ({bus_kv} kV). "
                            f"Wymagany transformator dedykowany."
                        ),
                        fix_actions=[
                            FixActionDescriptor(
                                action_id="add_dedicated_transformer",
                                label_pl="Dodaj transformator dedykowany",
                            ),
                            FixActionDescriptor(
                                action_id="select_other_bus",
                                label_pl="Wybierz inną szynę",
                            ),
                        ],
                    ),
                )
        return problems

    def _validate_endpoints(self, enm: EnergyNetworkModel) -> list[ValidationProblem]:
        """Każdy normalny odcinek powinien mieć endpoint_a + endpoint_b."""
        problems: list[ValidationProblem] = []
        for branch in enm.branches:
            if branch.type not in ("line_overhead", "cable"):
                continue
            ep_a = getattr(branch, "endpoint_a_port", None)
            ep_b = getattr(branch, "endpoint_b_port", None)
            if ep_a is None or ep_b is None:
                problems.append(
                    ValidationProblem(
                        problem_id=f"endpoint_missing::{branch.ref_id}",
                        severity="warning",
                        target_ref=branch.ref_id,
                        description_pl=(
                            f"Odcinek '{branch.name}' nie ma jawnych portów endpoint A/B. "
                            f"Topologia działa, ale port-resolver nie znajdzie konkretnego "
                            f"miejsca przyłączenia w polu."
                        ),
                        fix_actions=[
                            FixActionDescriptor(
                                action_id="bind_endpoints",
                                label_pl="Zwiąż endpointy z portami pól",
                            ),
                        ],
                    ),
                )
        return problems

    def _readiness_to_warnings(self, readiness: ReadinessReport) -> list[ValidationProblem]:
        """Konwertuje partial readiness na warnings, blocked na errors."""
        problems: list[ValidationProblem] = []
        for item in readiness.items:
            if item.status not in ("blocked", "partial"):
                continue
            severity: ValidationSeverity = "error" if item.status == "blocked" else "warning"
            for blocker_ref in item.blocking_object_refs:
                problems.append(
                    ValidationProblem(
                        problem_id=f"readiness::{item.calculation_type}::{blocker_ref}",
                        severity=severity,
                        target_ref=blocker_ref,
                        description_pl=(
                            f"{item.label_pl}: {item.recommended_action_pl or 'Brakuje danych.'}"
                        ),
                        fix_actions=[
                            FixActionDescriptor(
                                action_id=f"fill_data_for_{item.calculation_type}",
                                label_pl="Uzupełnij dane",
                            ),
                        ],
                    ),
                )
        return problems
