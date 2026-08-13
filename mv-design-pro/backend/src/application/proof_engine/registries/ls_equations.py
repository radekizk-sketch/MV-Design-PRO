"""Rejestr rownan LS — na razie pusty; scalany do glownego rejestru dowodow."""

from __future__ import annotations

from application.proof_engine.types import EquationDefinition

#: Typ wzięty z jedynego konsumenta (`EquationRegistry.merge`), zeby pusty slownik
#: nie byl dla analizy `dict[Any, Any]` bez kontraktu.
LS_EQUATIONS: dict[str, EquationDefinition] = {}
