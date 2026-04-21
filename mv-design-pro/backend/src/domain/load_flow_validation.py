"""LoadFlowRunInput validation with FixActions.

Every missing/invalid field → stable error code + FixAction.
NO auto-apply. NO heuristics.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from domain.load_flow_input import (
    LoadFlowRunInput,
    SlackType,
    StartMode,
)


@dataclass(frozen=True)
class LoadFlowFixAction:
    action_type: str
    payload: dict[str, Any]


@dataclass(frozen=True)
class LoadFlowValidationError:
    code: str
    message_pl: str
    fix_action: LoadFlowFixAction | None = None


def validate_load_flow_input(
    lf_input: LoadFlowRunInput,
    *,
    available_source_node_ids: list[str] | None = None,
) -> list[LoadFlowValidationError]:
    """Validate LoadFlowRunInput. Returns list of errors (empty = valid)."""
    errors: list[LoadFlowValidationError] = []

    # V-01: Slack definition consistency
    if lf_input.slack_definition.slack_type == SlackType.SINGLE:
        if lf_input.slack_definition.single is None:
            errors.append(
                LoadFlowValidationError(
                    code="LF_SLACK_SINGLE_MISSING_SPEC",
                    message_pl="Typ slack = SINGLE, ale brak specyfikacji węzła bilansującego.",
                    fix_action=_suggest_slack_candidates(available_source_node_ids),
                )
            )
        elif not lf_input.slack_definition.single.slack_node_id:
            errors.append(
                LoadFlowValidationError(
                    code="LF_SLACK_SINGLE_EMPTY_NODE_ID",
                    message_pl="Identyfikator węzła bilansującego jest pusty.",
                    fix_action=_suggest_slack_candidates(available_source_node_ids),
                )
            )
    elif lf_input.slack_definition.slack_type == SlackType.DISTRIBUTED:
        if lf_input.slack_definition.distributed is None:
            errors.append(
                LoadFlowValidationError(
                    code="LF_SLACK_DISTRIBUTED_MISSING_SPEC",
                    message_pl="Typ slack = DISTRIBUTED, ale brak listy kontrybutorów.",
                )
            )
        elif len(lf_input.slack_definition.distributed.contributors) == 0:
            errors.append(
                LoadFlowValidationError(
                    code="LF_SLACK_DISTRIBUTED_EMPTY",
                    message_pl="Lista kontrybutorów distributed slack jest pusta.",
                )
            )

    # V-02: Start mode + custom initial voltages
    if lf_input.start_mode == StartMode.CUSTOM_INITIAL:
        if len(lf_input.custom_initial_voltages) == 0:
            errors.append(
                LoadFlowValidationError(
                    code="LF_CUSTOM_INITIAL_EMPTY",
                    message_pl=(
                        "Tryb startu = CUSTOM_INITIAL, ale brak jawnych napięć początkowych. "
                        "Podaj napięcia dla każdego węzła lub zmień tryb na FLAT_START."
                    ),
                    fix_action=LoadFlowFixAction(
                        action_type="SUGGEST_START_MODE",
                        payload={"suggested": "FLAT_START"},
                    ),
                )
            )

    # V-03: Convergence bounds
    if lf_input.convergence.tolerance <= 0:
        errors.append(
            LoadFlowValidationError(
                code="LF_CONVERGENCE_TOLERANCE_INVALID",
                message_pl=f"Tolerancja zbieżności = {lf_input.convergence.tolerance} — musi być > 0.",
            )
        )
    if lf_input.convergence.iteration_limit <= 0:
        errors.append(
            LoadFlowValidationError(
                code="LF_CONVERGENCE_ITER_LIMIT_INVALID",
                message_pl=f"Limit iteracji = {lf_input.convergence.iteration_limit} — musi być > 0.",
            )
        )

    # V-04: Load Q validation (no auto-cosφ)
    for load in lf_input.loads:
        if load.q_mvar is None:
            errors.append(
                LoadFlowValidationError(
                    code="LF_LOAD_MISSING_Q",
                    message_pl=(
                        f"Odbiór '{load.load_id}' nie ma jawnej mocy biernej Q. "
                        f"Podaj Q_mvar jawnie — automatyczne obliczanie z cosφ jest zabronione."
                    ),
                    fix_action=LoadFlowFixAction(
                        action_type="OPEN_MODAL",
                        payload={
                            "element_ref": load.load_id,
                            "modal_type": "LoadModal",
                            "required_field": "q_mvar",
                        },
                    ),
                )
            )

    # V-05: Solver options damping range
    if lf_input.solver_options.damping <= 0 or lf_input.solver_options.damping > 1.0:
        errors.append(
            LoadFlowValidationError(
                code="LF_SOLVER_DAMPING_INVALID",
                message_pl=(
                    f"Współczynnik tłumienia = {lf_input.solver_options.damping} "
                    f"— musi być w zakresie (0, 1.0]."
                ),
            )
        )

    return sorted(errors, key=lambda e: e.code)


def _suggest_slack_candidates(
    available_source_node_ids: list[str] | None,
) -> LoadFlowFixAction | None:
    if not available_source_node_ids:
        return None
    candidates = sorted(available_source_node_ids)
    return LoadFlowFixAction(
        action_type="SUGGEST_SLACK",
        payload={
            "candidates": [{"node_id": nid, "u_pu": 1.0, "angle_rad": 0.0} for nid in candidates],
        },
    )
