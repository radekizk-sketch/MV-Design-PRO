"""
Wizard Step Controller — deterministic, atomic step gates for ENM mutations.

Each wizard step (K1–K10) has:
  - preconditions(step, enm) → issues[]
  - apply(step, enm, payload) → (new_enm, issues[])
  - postconditions(step, enm) → issues[]

Transition to next step is BLOCKED when preconditions or postconditions
contain any BLOCKER-severity issue.

Atomicity: apply_step returns the ORIGINAL enm if postconditions fail.

BINDING: Polish labels, no project codenames.
DETERMINISTIC: same (step, enm, payload) → identical result.
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any

from .schema import (
    IssueSeverity,
    StepStatus,
    WizardIssue,
)
from .validator import validate_wizard_state

# ---------------------------------------------------------------------------
# Step ordering
# ---------------------------------------------------------------------------

STEP_ORDER: list[str] = ["K1", "K2", "K3", "K4", "K5", "K6", "K7", "K8", "K9", "K10"]

_STEP_INDEX: dict[str, int] = {s: i for i, s in enumerate(STEP_ORDER)}


def _step_index(step_id: str) -> int:
    idx = _STEP_INDEX.get(step_id)
    if idx is None:
        raise ValueError(f"Unknown step: {step_id}")
    return idx


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ApplyStepResult:
    """Result of applying a wizard step."""

    success: bool
    enm: dict[str, Any]
    step_id: str
    precondition_issues: list[WizardIssue] = field(default_factory=list)
    postcondition_issues: list[WizardIssue] = field(default_factory=list)
    can_proceed: bool = False
    current_step: str = "K1"
    next_step: str | None = None
    revision: int = 0


@dataclass(frozen=True)
class CanProceedResult:
    """Result of can-proceed check."""

    allowed: bool
    from_step: str
    to_step: str
    blocking_issues: list[WizardIssue] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Preconditions per step
# ---------------------------------------------------------------------------


def _preconditions_k1(enm: dict[str, Any]) -> list[WizardIssue]:
    """K1 has no preconditions — always accessible."""
    return []


def _preconditions_k2(enm: dict[str, Any]) -> list[WizardIssue]:
    """K2 requires K1 to have project name."""
    issues: list[WizardIssue] = []
    header = enm.get("header", {})
    name = header.get("name", "")
    if not name or not name.strip():
        issues.append(
            WizardIssue(
                code="PRE_K2_NAME_MISSING",
                severity=IssueSeverity.BLOCKER,
                message_pl="Uzupełnij nazwę projektu (K1) przed konfiguracją zasilania",
                wizard_step_hint="K1",
            )
        )
    return issues


def _preconditions_k3(enm: dict[str, Any]) -> list[WizardIssue]:
    """K3 requires K2 source bus."""
    issues: list[WizardIssue] = []
    buses = enm.get("buses", [])
    source_bus = next((b for b in buses if "source" in b.get("tags", [])), None)
    if not source_bus:
        issues.append(
            WizardIssue(
                code="PRE_K3_NO_SOURCE_BUS",
                severity=IssueSeverity.BLOCKER,
                message_pl="Zdefiniuj punkt zasilania (K2) przed dodaniem szyn",
                wizard_step_hint="K2",
            )
        )
    return issues


def _preconditions_k4(enm: dict[str, Any]) -> list[WizardIssue]:
    """K4 requires at least one bus (K3)."""
    issues: list[WizardIssue] = []
    if not enm.get("buses"):
        issues.append(
            WizardIssue(
                code="PRE_K4_NO_BUSES",
                severity=IssueSeverity.BLOCKER,
                message_pl="Dodaj szyny (K3) przed definiowaniem gałęzi",
                wizard_step_hint="K3",
            )
        )
    return issues


def _preconditions_k5(enm: dict[str, Any]) -> list[WizardIssue]:
    """K5 requires at least two bus refs for HV/LV."""
    issues: list[WizardIssue] = []
    buses = enm.get("buses", [])
    if len(buses) < 2:
        issues.append(
            WizardIssue(
                code="PRE_K5_FEW_BUSES",
                severity=IssueSeverity.IMPORTANT,
                message_pl="Transformatory wymagają min. 2 szyn (HV + LV)",
                wizard_step_hint="K3",
            )
        )
    return issues


def _preconditions_k6(enm: dict[str, Any]) -> list[WizardIssue]:
    """K6 requires buses to exist."""
    issues: list[WizardIssue] = []
    if not enm.get("buses"):
        issues.append(
            WizardIssue(
                code="PRE_K6_NO_BUSES",
                severity=IssueSeverity.BLOCKER,
                message_pl="Dodaj szyny (K3) przed definiowaniem odbiorów",
                wizard_step_hint="K3",
            )
        )
    return issues


def _preconditions_k7(enm: dict[str, Any]) -> list[WizardIssue]:
    """K7 is read-only review — no preconditions."""
    return []


def _preconditions_k8(enm: dict[str, Any]) -> list[WizardIssue]:
    """K8 is validation gate — no preconditions."""
    return []


def _preconditions_k9(enm: dict[str, Any]) -> list[WizardIssue]:
    """K9 is SLD preview — no preconditions."""
    return []


def _preconditions_k10(enm: dict[str, Any]) -> list[WizardIssue]:
    """K10 requires no BLOCKER in K1–K7."""
    ws = validate_wizard_state(enm)
    blocker_steps = [
        s for s in ws.steps if s.status == StepStatus.ERROR and s.step_id not in ("K9", "K10")
    ]
    issues: list[WizardIssue] = []
    if blocker_steps:
        issues.append(
            WizardIssue(
                code="PRE_K10_HAS_BLOCKERS",
                severity=IssueSeverity.BLOCKER,
                message_pl=f"Napraw blokery w krokach: {', '.join(s.step_id for s in blocker_steps)}",
                wizard_step_hint="K8",
            )
        )
    return issues


_PRECONDITIONS: dict[str, Any] = {
    "K1": _preconditions_k1,
    "K2": _preconditions_k2,
    "K3": _preconditions_k3,
    "K4": _preconditions_k4,
    "K5": _preconditions_k5,
    "K6": _preconditions_k6,
    "K7": _preconditions_k7,
    "K8": _preconditions_k8,
    "K9": _preconditions_k9,
    "K10": _preconditions_k10,
}


# ---------------------------------------------------------------------------
# Apply step — mutates ENM copy atomically
# ---------------------------------------------------------------------------


def _apply_k1(enm: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    """Apply K1 payload: name, description, frequency_hz."""
    header = dict(enm.get("header", {}))
    if "name" in data:
        header["name"] = data["name"]
    if "description" in data:
        header["description"] = data["description"]
    defaults = dict(header.get("defaults", {}))
    if "frequency_hz" in data:
        defaults["frequency_hz"] = data["frequency_hz"]
    header["defaults"] = defaults
    return {**enm, "header": header}


def _apply_k2(enm: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    """Apply K2 payload: source bus + source (upsert by ref_id)."""
    buses = list(enm.get("buses", []))
    sources = list(enm.get("sources", []))

    bus_ref = data.get("bus_ref_id", "bus_sn_main")
    src_ref = data.get("source_ref_id", "source_grid")

    # Upsert source bus
    bi = next((i for i, b in enumerate(buses) if b.get("ref_id") == bus_ref), None)
    bus_data = {
        "ref_id": bus_ref,
        "name": data.get("bus_name", "Szyna główna SN"),
        "voltage_kv": data.get("voltage_kv", 15),
        "tags": ["source"],
        "meta": {},
        "phase_system": "3ph",
    }
    if bi is not None:
        buses[bi] = {**buses[bi], **bus_data}
    else:
        bus_data["id"] = data.get("bus_id", bus_ref)
        buses.append(bus_data)

    # Upsert source
    si = next((i for i, s in enumerate(sources) if s.get("ref_id") == src_ref), None)
    src_data = {
        "ref_id": src_ref,
        "name": data.get("source_name", "Sieć zasilająca"),
        "bus_ref": bus_ref,
        "model": data.get("model", "short_circuit_power"),
        "sk3_mva": data.get("sk3_mva", 250),
        "rx_ratio": data.get("rx_ratio", 0.1),
        "tags": [],
        "meta": {},
    }
    if si is not None:
        sources[si] = {**sources[si], **src_data}
    else:
        src_data["id"] = data.get("source_id", src_ref)
        sources.append(src_data)

    return {**enm, "buses": buses, "sources": sources}


def _apply_k3(enm: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    """Apply K3 payload: add/remove buses."""
    buses = list(enm.get("buses", []))
    for bus in data.get("add_buses", []):
        if not any(b.get("ref_id") == bus.get("ref_id") for b in buses):
            buses.append(bus)
    remove_refs = set(data.get("remove_bus_refs", []))
    if remove_refs:
        buses = [b for b in buses if b.get("ref_id") not in remove_refs]
        # Cascade: remove branches referencing removed buses
        branches = [
            br
            for br in enm.get("branches", [])
            if br.get("from_bus_ref") not in remove_refs and br.get("to_bus_ref") not in remove_refs
        ]
        return {**enm, "buses": buses, "branches": branches}
    return {**enm, "buses": buses}


def _apply_k4(enm: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    """Apply K4 payload: add/update/remove branches."""
    branches = list(enm.get("branches", []))
    for br in data.get("add_branches", []):
        if not any(b.get("ref_id") == br.get("ref_id") for b in branches):
            branches.append(br)
    for upd in data.get("update_branches", []):
        ref = upd.get("ref_id")
        idx = next((i for i, b in enumerate(branches) if b.get("ref_id") == ref), None)
        if idx is not None:
            branches[idx] = {**branches[idx], **upd}
    remove_refs = set(data.get("remove_branch_refs", []))
    if remove_refs:
        branches = [b for b in branches if b.get("ref_id") not in remove_refs]
    return {**enm, "branches": branches}


def _apply_k5(enm: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    """Apply K5 payload: add/update/remove transformers."""
    trafos = list(enm.get("transformers", []))
    for t in data.get("add_transformers", []):
        if not any(x.get("ref_id") == t.get("ref_id") for x in trafos):
            trafos.append(t)
    for upd in data.get("update_transformers", []):
        ref = upd.get("ref_id")
        idx = next((i for i, x in enumerate(trafos) if x.get("ref_id") == ref), None)
        if idx is not None:
            trafos[idx] = {**trafos[idx], **upd}
    remove_refs = set(data.get("remove_transformer_refs", []))
    if remove_refs:
        trafos = [t for t in trafos if t.get("ref_id") not in remove_refs]
    return {**enm, "transformers": trafos}


def _apply_k6(enm: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    """Apply K6 payload: add/update/remove loads and generators."""
    loads = list(enm.get("loads", []))
    gens = list(enm.get("generators", []))
    for ld in data.get("add_loads", []):
        if not any(existing_load.get("ref_id") == ld.get("ref_id") for existing_load in loads):
            loads.append(ld)
    for upd in data.get("update_loads", []):
        ref = upd.get("ref_id")
        idx = next(
            (i for i, existing_load in enumerate(loads) if existing_load.get("ref_id") == ref),
            None,
        )
        if idx is not None:
            loads[idx] = {**loads[idx], **upd}
    remove_load_refs = set(data.get("remove_load_refs", []))
    if remove_load_refs:
        loads = [
            existing_load
            for existing_load in loads
            if existing_load.get("ref_id") not in remove_load_refs
        ]
    for g in data.get("add_generators", []):
        if not any(x.get("ref_id") == g.get("ref_id") for x in gens):
            gens.append(g)
    return {**enm, "loads": loads, "generators": gens}


def _apply_noop(enm: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    """K7/K8/K9/K10 are read-only — no mutation."""
    return enm


_APPLY: dict[str, Any] = {
    "K1": _apply_k1,
    "K2": _apply_k2,
    "K3": _apply_k3,
    "K4": _apply_k4,
    "K5": _apply_k5,
    "K6": _apply_k6,
    "K7": _apply_noop,
    "K8": _apply_noop,
    "K9": _apply_noop,
    "K10": _apply_noop,
}


# ---------------------------------------------------------------------------
# Postconditions per step
# ---------------------------------------------------------------------------


def _postconditions_generic(step_id: str, enm: dict[str, Any]) -> list[WizardIssue]:
    """Postconditions: re-evaluate the step after mutation.

    If the step still has BLOCKER issues, they become postcondition failures.
    """
    ws = validate_wizard_state(enm)
    step = next((s for s in ws.steps if s.step_id == step_id), None)
    if step is None:
        return []
    return [i for i in step.issues if i.severity == IssueSeverity.BLOCKER]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def preconditions(step_id: str, enm: dict[str, Any]) -> list[WizardIssue]:
    """Evaluate preconditions for entering a step.

    Returns list of issues (empty = OK to proceed).
    """
    fn = _PRECONDITIONS.get(step_id)
    if fn is None:
        raise ValueError(f"Unknown step: {step_id}")
    return fn(enm)


def postconditions(step_id: str, enm: dict[str, Any]) -> list[WizardIssue]:
    """Evaluate postconditions after applying step data.

    Returns list of BLOCKER issues from the step's validation.
    """
    return _postconditions_generic(step_id, enm)


def apply_step(
    enm: dict[str, Any],
    step_id: str,
    data: dict[str, Any],
) -> ApplyStepResult:
    """Atomic step application: preconditions → mutate → postconditions.

    If preconditions contain BLOCKER → return original ENM, success=False.
    If postconditions contain BLOCKER → return original ENM, success=False
    (rollback: copy-on-write pattern).

    Returns:
        ApplyStepResult with:
        - success: True if step was applied and postconditions pass
        - enm: the (possibly mutated) ENM dict
        - precondition_issues / postcondition_issues
        - can_proceed: True if next step transition is allowed
        - current_step / next_step
    """
    step_idx = _step_index(step_id)

    # 1. Preconditions
    pre_issues = preconditions(step_id, enm)
    has_pre_blockers = any(i.severity == IssueSeverity.BLOCKER for i in pre_issues)
    if has_pre_blockers:
        return ApplyStepResult(
            success=False,
            enm=enm,
            step_id=step_id,
            precondition_issues=pre_issues,
            postcondition_issues=[],
            can_proceed=False,
            current_step=step_id,
            next_step=STEP_ORDER[step_idx + 1] if step_idx < len(STEP_ORDER) - 1 else None,
            revision=enm.get("header", {}).get("revision", 0),
        )

    # 2. Apply on deep copy (copy-on-write)
    enm_copy = copy.deepcopy(enm)
    apply_fn = _APPLY.get(step_id, _apply_noop)
    mutated_enm = apply_fn(enm_copy, data)

    # 3. Postconditions
    post_issues = postconditions(step_id, mutated_enm)
    has_post_blockers = any(i.severity == IssueSeverity.BLOCKER for i in post_issues)

    if has_post_blockers:
        # Rollback: return original
        return ApplyStepResult(
            success=False,
            enm=enm,
            step_id=step_id,
            precondition_issues=pre_issues,
            postcondition_issues=post_issues,
            can_proceed=False,
            current_step=step_id,
            next_step=STEP_ORDER[step_idx + 1] if step_idx < len(STEP_ORDER) - 1 else None,
            revision=enm.get("header", {}).get("revision", 0),
        )

    # 4. Success: return mutated ENM
    next_step = STEP_ORDER[step_idx + 1] if step_idx < len(STEP_ORDER) - 1 else None

    # Check if next step can be entered
    can_proceed_next = True
    if next_step:
        next_pre = preconditions(next_step, mutated_enm)
        can_proceed_next = not any(i.severity == IssueSeverity.BLOCKER for i in next_pre)

    return ApplyStepResult(
        success=True,
        enm=mutated_enm,
        step_id=step_id,
        precondition_issues=pre_issues,
        postcondition_issues=post_issues,
        can_proceed=can_proceed_next,
        current_step=step_id,
        next_step=next_step,
        revision=mutated_enm.get("header", {}).get("revision", 0),
    )


def can_proceed(
    from_step: str,
    to_step: str,
    enm: dict[str, Any],
) -> CanProceedResult:
    """Check if transition from one step to another is allowed.

    Forward transitions (K1→K2, K2→K3, etc.) require:
    - All steps between from_step and to_step (inclusive of to_step)
      have no BLOCKER preconditions.
    - The from_step has no BLOCKER postconditions (i.e., step is valid).

    Backward transitions are always allowed.
    """
    from_idx = _step_index(from_step)
    to_idx = _step_index(to_step)

    # Backward transitions always allowed
    if to_idx <= from_idx:
        return CanProceedResult(allowed=True, from_step=from_step, to_step=to_step)

    # Forward: check each intermediate step
    blocking: list[WizardIssue] = []

    # Check from_step postconditions (current step must be valid)
    ws = validate_wizard_state(enm)
    from_state = next((s for s in ws.steps if s.step_id == from_step), None)
    if from_state and from_state.status == StepStatus.ERROR:
        for issue in from_state.issues:
            if issue.severity == IssueSeverity.BLOCKER:
                blocking.append(issue)

    # Check to_step preconditions
    pre = preconditions(to_step, enm)
    for issue in pre:
        if issue.severity == IssueSeverity.BLOCKER:
            blocking.append(issue)

    # Deduplicate by code
    seen_codes: set[str] = set()
    unique: list[WizardIssue] = []
    for issue in blocking:
        if issue.code not in seen_codes:
            seen_codes.add(issue.code)
            unique.append(issue)

    # Sort deterministically: severity rank, code, element_ref
    severity_rank = {IssueSeverity.BLOCKER: 0, IssueSeverity.IMPORTANT: 1, IssueSeverity.INFO: 2}
    unique.sort(key=lambda i: (severity_rank.get(i.severity, 9), i.code, i.element_ref or ""))

    return CanProceedResult(
        allowed=len(unique) == 0,
        from_step=from_step,
        to_step=to_step,
        blocking_issues=unique,
    )
