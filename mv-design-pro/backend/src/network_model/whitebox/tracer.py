from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class WhiteBoxStep:
    key: str
    title: str
    formula_latex: str
    inputs: dict[str, Any]
    substitution: str
    result: dict[str, Any]
    substitution_latex: str | None = None
    notes: str | None = None


@dataclass
class WhiteBoxTracer:
    steps: list[WhiteBoxStep] = field(default_factory=list)

    def add_step(self, step: WhiteBoxStep) -> None:
        self.steps.append(step)

    def add(
        self,
        key: str,
        title: str,
        formula_latex: str,
        inputs: dict[str, Any],
        substitution: str,
        result: dict[str, Any],
        substitution_latex: str | None = None,
        notes: str | None = None,
    ) -> None:
        self.add_step(
            WhiteBoxStep(
                key=key,
                title=title,
                formula_latex=formula_latex,
                inputs=inputs,
                substitution=substitution,
                substitution_latex=substitution_latex,
                result=result,
                notes=notes,
            )
        )

    def to_list(self) -> list[dict[str, Any]]:
        return [
            {
                "key": step.key,
                "title": step.title,
                "formula_latex": step.formula_latex,
                "inputs": step.inputs,
                "substitution": step.substitution,
                "substitution_latex": step.substitution_latex,
                "result": step.result,
                "notes": step.notes,
            }
            for step in self.steps
        ]

    def __bool__(self) -> bool:
        return bool(self.steps)
