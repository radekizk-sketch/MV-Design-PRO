"""Load Flow Determinism Suite — hash equality + permutation invariance.

Markers: @pytest.mark.determinism
"""

import random

import pytest
from domain.load_flow_input import (
    ConvergenceParams,
    LoadFlowRunInput,
    LoadSpec,
    ModelingMode,
    SingleSlackDefinition,
    SlackDefinition,
    SlackType,
    SolverMethod,
    SolverOptions,
    StartMode,
)


def _make_golden_input() -> LoadFlowRunInput:
    """Golden input GN-LF-01: minimal radial SN network."""
    return LoadFlowRunInput(
        slack_definition=SlackDefinition(
            slack_type=SlackType.SINGLE,
            single=SingleSlackDefinition(
                slack_node_id="bus-001",
                u_pu=1.0,
                angle_rad=0.0,
            ),
        ),
        start_mode=StartMode.FLAT_START,
        convergence=ConvergenceParams(tolerance=1e-6, iteration_limit=50),
        modeling_mode=ModelingMode.AC_POWER_FLOW,
        solver_options=SolverOptions(
            solver_method=SolverMethod.NEWTON_RAPHSON,
            damping=1.0,
            trace_level="summary",
        ),
        loads=(
            LoadSpec(load_id="load-001", node_id="bus-002", p_mw=2.0, q_mvar=0.8),
            LoadSpec(load_id="load-002", node_id="bus-003", p_mw=1.5, q_mvar=0.6),
            LoadSpec(load_id="load-003", node_id="bus-004", p_mw=3.0, q_mvar=1.2),
        ),
        base_mva=100.0,
    )


@pytest.mark.determinism
class TestInputHashStability:
    """Same LoadFlowRunInput → same hash, every time."""

    def test_repeated_hash_identical(self):
        inp = _make_golden_input()
        hashes = {inp.canonical_hash() for _ in range(10)}
        assert len(hashes) == 1, f"Hash instability: got {len(hashes)} unique hashes"

    def test_canonical_dict_stable(self):
        inp = _make_golden_input()
        dicts = [str(inp.canonical_dict()) for _ in range(5)]
        assert len(set(dicts)) == 1


@pytest.mark.determinism
class TestPermutationInvariance:
    """Reordering loads/generators does NOT change hash."""

    def test_load_order_invariance(self):
        base = _make_golden_input()
        base_hash = base.canonical_hash()

        for seed in range(10):
            rng = random.Random(seed)
            shuffled_loads = list(base.loads)
            rng.shuffle(shuffled_loads)
            permuted = LoadFlowRunInput(
                slack_definition=base.slack_definition,
                start_mode=base.start_mode,
                convergence=base.convergence,
                modeling_mode=base.modeling_mode,
                solver_options=base.solver_options,
                loads=tuple(shuffled_loads),
                generators=base.generators,
                base_mva=base.base_mva,
            )
            assert permuted.canonical_hash() == base_hash, f"Permutation seed={seed} changed hash"

    def test_canonical_dict_permutation_invariant(self):
        base = _make_golden_input()
        base_dict = base.canonical_dict()

        shuffled_loads = (base.loads[2], base.loads[0], base.loads[1])
        permuted = LoadFlowRunInput(
            slack_definition=base.slack_definition,
            start_mode=base.start_mode,
            convergence=base.convergence,
            modeling_mode=base.modeling_mode,
            solver_options=base.solver_options,
            loads=shuffled_loads,
            generators=base.generators,
            base_mva=base.base_mva,
        )
        assert permuted.canonical_dict() == base_dict


@pytest.mark.determinism
class TestCanonicalFloat:
    """Float serialization is deterministic."""

    def test_zero_representation(self):
        import json

        inp = _make_golden_input()
        raw = json.dumps(inp.canonical_dict(), sort_keys=True, separators=(",", ":"))
        # Should not contain platform-dependent float artifacts
        assert "nan" not in raw.lower()
        assert "inf" not in raw.lower()
