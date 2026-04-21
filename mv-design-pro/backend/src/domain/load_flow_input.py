"""LoadFlowRunInput — canonical input contract for Load Flow analysis.

BINDING CONTRACT (RUN #2A): All fields mandatory, zero defaults.
Missing fields → ValidationError + FixActions.
"""

from __future__ import annotations

import enum
import hashlib
import json
from dataclasses import dataclass
from typing import Any


class SlackType(str, enum.Enum):
    SINGLE = "SINGLE"
    DISTRIBUTED = "DISTRIBUTED"


class StartMode(str, enum.Enum):
    FLAT_START = "FLAT_START"
    CUSTOM_INITIAL = "CUSTOM_INITIAL"


class ModelingMode(str, enum.Enum):
    AC_POWER_FLOW = "AC_POWER_FLOW"


class SolverMethod(str, enum.Enum):
    NEWTON_RAPHSON = "newton-raphson"
    GAUSS_SEIDEL = "gauss-seidel"
    FAST_DECOUPLED = "fast-decoupled"


@dataclass(frozen=True)
class SingleSlackDefinition:
    slack_node_id: str
    u_pu: float
    angle_rad: float = 0.0


@dataclass(frozen=True)
class DistributedSlackContributor:
    source_id: str
    node_id: str
    weight: float


@dataclass(frozen=True)
class DistributedSlackDefinition:
    contributors: tuple[DistributedSlackContributor, ...]

    def __post_init__(self) -> None:
        total = sum(c.weight for c in self.contributors)
        if abs(total - 1.0) > 1e-9:
            raise ValueError(f"Suma wag distributed slack = {total}, wymagane = 1.0")


@dataclass(frozen=True)
class SlackDefinition:
    slack_type: SlackType
    single: SingleSlackDefinition | None = None
    distributed: DistributedSlackDefinition | None = None


@dataclass(frozen=True)
class ConvergenceParams:
    tolerance: float
    iteration_limit: int


@dataclass(frozen=True)
class SolverOptions:
    solver_method: SolverMethod
    damping: float = 1.0
    trace_level: str = "summary"


@dataclass(frozen=True)
class LoadSpec:
    """Explicit P+Q for a single load. NO auto-cosφ."""

    load_id: str
    node_id: str
    p_mw: float
    q_mvar: float


@dataclass(frozen=True)
class GeneratorSpec:
    generator_id: str
    node_id: str
    p_mw: float
    u_pu: float
    q_min_mvar: float
    q_max_mvar: float


@dataclass(frozen=True)
class CustomInitialVoltage:
    node_id: str
    u_pu: float
    angle_deg: float


@dataclass(frozen=True)
class LoadFlowRunInput:
    """Canonical Load Flow input contract.

    ALL fields mandatory. Missing = validation error + FixAction.
    ZERO defaults on critical parameters.
    """

    slack_definition: SlackDefinition
    start_mode: StartMode
    convergence: ConvergenceParams
    modeling_mode: ModelingMode
    solver_options: SolverOptions
    loads: tuple[LoadSpec, ...]
    generators: tuple[GeneratorSpec, ...] = ()
    custom_initial_voltages: tuple[CustomInitialVoltage, ...] = ()
    base_mva: float = 100.0

    def canonical_dict(self) -> dict[str, Any]:
        """Deterministic dict for hashing. Sorted keys, sorted lists."""
        return _canonicalize(self._to_raw_dict())

    def canonical_hash(self) -> str:
        """SHA-256 of canonical JSON."""
        raw = self.canonical_dict()
        payload = json.dumps(raw, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _to_raw_dict(self) -> dict[str, Any]:
        return {
            "slack_definition": {
                "slack_type": self.slack_definition.slack_type.value,
                "single": (
                    {
                        "slack_node_id": self.slack_definition.single.slack_node_id,
                        "u_pu": self.slack_definition.single.u_pu,
                        "angle_rad": self.slack_definition.single.angle_rad,
                    }
                    if self.slack_definition.single
                    else None
                ),
                "distributed": (
                    {
                        "contributors": [
                            {
                                "source_id": c.source_id,
                                "node_id": c.node_id,
                                "weight": c.weight,
                            }
                            for c in self.slack_definition.distributed.contributors
                        ]
                    }
                    if self.slack_definition.distributed
                    else None
                ),
            },
            "start_mode": self.start_mode.value,
            "convergence": {
                "tolerance": self.convergence.tolerance,
                "iteration_limit": self.convergence.iteration_limit,
            },
            "modeling_mode": self.modeling_mode.value,
            "solver_options": {
                "solver_method": self.solver_options.solver_method.value,
                "damping": self.solver_options.damping,
                "trace_level": self.solver_options.trace_level,
            },
            "loads": [
                {
                    "load_id": ld.load_id,
                    "node_id": ld.node_id,
                    "p_mw": ld.p_mw,
                    "q_mvar": ld.q_mvar,
                }
                for ld in self.loads
            ],
            "generators": [
                {
                    "generator_id": g.generator_id,
                    "node_id": g.node_id,
                    "p_mw": g.p_mw,
                    "u_pu": g.u_pu,
                    "q_min_mvar": g.q_min_mvar,
                    "q_max_mvar": g.q_max_mvar,
                }
                for g in self.generators
            ],
            "custom_initial_voltages": [
                {
                    "node_id": v.node_id,
                    "u_pu": v.u_pu,
                    "angle_deg": v.angle_deg,
                }
                for v in self.custom_initial_voltages
            ],
            "base_mva": self.base_mva,
        }


# =========================================================================
# Canonical helpers
# =========================================================================

_DETERMINISTIC_LIST_KEYS = {
    "loads",
    "generators",
    "custom_initial_voltages",
    "contributors",
}


def _canonicalize(value: Any, *, current_key: str | None = None) -> Any:
    if isinstance(value, dict):
        return {k: _canonicalize(v, current_key=k) for k, v in sorted(value.items())}
    if isinstance(value, list):
        items = [_canonicalize(item, current_key=current_key) for item in value]
        if current_key in _DETERMINISTIC_LIST_KEYS:
            return sorted(items, key=_stable_sort_key)
        return items
    return value


def _stable_sort_key(item: Any) -> str:
    if isinstance(item, dict):
        for key in ("load_id", "generator_id", "source_id", "node_id", "id"):
            if key in item and item[key] is not None:
                return str(item[key])
    return str(item)
