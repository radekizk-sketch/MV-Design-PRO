"""Tests for LoadFlowRunInput: hash stability, validation, FixActions."""

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
from domain.load_flow_validation import validate_load_flow_input


def _make_valid_input(**overrides) -> LoadFlowRunInput:
    defaults = {
        "slack_definition": SlackDefinition(
            slack_type=SlackType.SINGLE,
            single=SingleSlackDefinition(
                slack_node_id="bus-001",
                u_pu=1.0,
                angle_rad=0.0,
            ),
        ),
        "start_mode": StartMode.FLAT_START,
        "convergence": ConvergenceParams(tolerance=1e-6, iteration_limit=50),
        "modeling_mode": ModelingMode.AC_POWER_FLOW,
        "solver_options": SolverOptions(
            solver_method=SolverMethod.NEWTON_RAPHSON,
            damping=1.0,
            trace_level="summary",
        ),
        "loads": (
            LoadSpec(load_id="load-001", node_id="bus-002", p_mw=2.0, q_mvar=0.8),
            LoadSpec(load_id="load-002", node_id="bus-003", p_mw=1.5, q_mvar=0.6),
        ),
        "base_mva": 100.0,
    }
    defaults.update(overrides)
    return LoadFlowRunInput(**defaults)


class TestHashStability:
    def test_same_input_same_hash(self):
        inp = _make_valid_input()
        hashes = [inp.canonical_hash() for _ in range(10)]
        assert len(set(hashes)) == 1

    def test_permuted_loads_same_hash(self):
        loads_a = (
            LoadSpec(load_id="load-001", node_id="bus-002", p_mw=2.0, q_mvar=0.8),
            LoadSpec(load_id="load-002", node_id="bus-003", p_mw=1.5, q_mvar=0.6),
        )
        loads_b = (loads_a[1], loads_a[0])
        inp_a = _make_valid_input(loads=loads_a)
        inp_b = _make_valid_input(loads=loads_b)
        assert inp_a.canonical_hash() == inp_b.canonical_hash()

    def test_different_tolerance_different_hash(self):
        inp_a = _make_valid_input(convergence=ConvergenceParams(tolerance=1e-6, iteration_limit=50))
        inp_b = _make_valid_input(convergence=ConvergenceParams(tolerance=1e-8, iteration_limit=50))
        assert inp_a.canonical_hash() != inp_b.canonical_hash()


class TestValidation:
    def test_valid_input_no_errors(self):
        inp = _make_valid_input()
        errors = validate_load_flow_input(inp)
        assert errors == []

    def test_empty_slack_node_id(self):
        inp = _make_valid_input(
            slack_definition=SlackDefinition(
                slack_type=SlackType.SINGLE,
                single=SingleSlackDefinition(slack_node_id="", u_pu=1.0),
            ),
        )
        errors = validate_load_flow_input(inp)
        codes = [e.code for e in errors]
        assert "LF_SLACK_SINGLE_EMPTY_NODE_ID" in codes

    def test_negative_tolerance(self):
        inp = _make_valid_input(convergence=ConvergenceParams(tolerance=-1e-6, iteration_limit=50))
        errors = validate_load_flow_input(inp)
        codes = [e.code for e in errors]
        assert "LF_CONVERGENCE_TOLERANCE_INVALID" in codes

    def test_zero_iteration_limit(self):
        inp = _make_valid_input(convergence=ConvergenceParams(tolerance=1e-6, iteration_limit=0))
        errors = validate_load_flow_input(inp)
        codes = [e.code for e in errors]
        assert "LF_CONVERGENCE_ITER_LIMIT_INVALID" in codes

    def test_custom_initial_without_voltages(self):
        inp = _make_valid_input(start_mode=StartMode.CUSTOM_INITIAL)
        errors = validate_load_flow_input(inp)
        codes = [e.code for e in errors]
        assert "LF_CUSTOM_INITIAL_EMPTY" in codes

    def test_fix_action_slack_candidates(self):
        inp = _make_valid_input(
            slack_definition=SlackDefinition(
                slack_type=SlackType.SINGLE,
                single=None,
            ),
        )
        errors = validate_load_flow_input(
            inp,
            available_source_node_ids=["bus-003", "bus-001"],
        )
        slack_err = [e for e in errors if e.code == "LF_SLACK_SINGLE_MISSING_SPEC"]
        assert len(slack_err) == 1
        assert slack_err[0].fix_action is not None
        candidates = slack_err[0].fix_action.payload["candidates"]
        # Must be sorted deterministically
        assert candidates[0]["node_id"] == "bus-001"
        assert candidates[1]["node_id"] == "bus-003"

    def test_errors_sorted_by_code(self):
        inp = _make_valid_input(
            convergence=ConvergenceParams(tolerance=-1, iteration_limit=-1),
            slack_definition=SlackDefinition(
                slack_type=SlackType.SINGLE,
                single=SingleSlackDefinition(slack_node_id="", u_pu=1.0),
            ),
        )
        errors = validate_load_flow_input(inp)
        codes = [e.code for e in errors]
        assert codes == sorted(codes)

    def test_damping_out_of_range(self):
        inp = _make_valid_input(
            solver_options=SolverOptions(
                solver_method=SolverMethod.NEWTON_RAPHSON,
                damping=1.5,
                trace_level="summary",
            )
        )
        errors = validate_load_flow_input(inp)
        codes = [e.code for e in errors]
        assert "LF_SOLVER_DAMPING_INVALID" in codes
