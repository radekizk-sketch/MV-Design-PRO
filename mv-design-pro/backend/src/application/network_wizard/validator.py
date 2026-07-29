"""
Network Wizard Validator — server-side ENM validation.

Evaluates wizard step completeness and analysis readiness.
Deterministic: same ENM → identical WizardStateResponse.

BINDING: Polish labels, no project codenames.
"""

from __future__ import annotations

from typing import Any

from .schema import (
    AnalysisReadiness,
    ElementCounts,
    IssueSeverity,
    ReadinessMatrix,
    StepState,
    StepStatus,
    WizardIssue,
    WizardStateResponse,
)


def _eval_k1(enm: dict[str, Any]) -> StepState:
    """K1: Parametry modelu."""
    issues: list[WizardIssue] = []
    completion = 0
    header = enm.get("header", {})
    name = header.get("name", "")
    if name and name.strip():
        completion += 50
    else:
        issues.append(
            WizardIssue(
                code="K1_NO_NAME",
                severity=IssueSeverity.BLOCKER,
                message_pl="Brak nazwy projektu",
                wizard_step_hint="K1",
            )
        )
    defaults = header.get("defaults", {})
    if defaults.get("frequency_hz", 0) > 0:
        completion += 50
    status = (
        StepStatus.ERROR
        if any(i.severity == IssueSeverity.BLOCKER for i in issues)
        else (
            StepStatus.COMPLETE
            if completion == 100
            else StepStatus.PARTIAL if completion > 0 else StepStatus.EMPTY
        )
    )
    return StepState(step_id="K1", status=status, completion_percent=completion, issues=issues)


def _eval_k2(enm: dict[str, Any]) -> StepState:
    """K2: Punkt zasilania."""
    issues: list[WizardIssue] = []
    completion = 0
    buses = enm.get("buses", [])
    sources = enm.get("sources", [])
    source_bus = next((b for b in buses if "source" in b.get("tags", [])), None)
    if source_bus:
        completion += 34
        if source_bus.get("voltage_kv", 0) > 0:
            completion += 33
    else:
        issues.append(
            WizardIssue(
                code="K2_NO_SOURCE_BUS",
                severity=IssueSeverity.BLOCKER,
                message_pl="Brak szyny źródłowej",
                wizard_step_hint="K2",
            )
        )
    if sources:
        completion += 33
    else:
        issues.append(
            WizardIssue(
                code="K2_NO_SOURCE",
                severity=IssueSeverity.BLOCKER,
                message_pl="Brak źródła zasilania",
                wizard_step_hint="K2",
            )
        )
    status = (
        StepStatus.ERROR
        if any(i.severity == IssueSeverity.BLOCKER for i in issues)
        else (
            StepStatus.COMPLETE
            if completion >= 90
            else StepStatus.PARTIAL if completion > 0 else StepStatus.EMPTY
        )
    )
    return StepState(
        step_id="K2", status=status, completion_percent=min(100, completion), issues=issues
    )


def _eval_k3(enm: dict[str, Any]) -> StepState:
    """K3: Struktura szyn."""
    issues: list[WizardIssue] = []
    buses = enm.get("buses", [])
    completion = 100 if buses else 0
    if not buses:
        issues.append(
            WizardIssue(
                code="K3_NO_BUSES",
                severity=IssueSeverity.BLOCKER,
                message_pl="Brak szyn w modelu",
                wizard_step_hint="K3",
            )
        )
    status = StepStatus.COMPLETE if buses else StepStatus.EMPTY
    return StepState(step_id="K3", status=status, completion_percent=completion, issues=issues)


def _eval_k4(enm: dict[str, Any]) -> StepState:
    """K4: Gałęzie."""
    issues: list[WizardIssue] = []
    branches = enm.get("branches", [])
    buses = enm.get("buses", [])
    bus_refs = {b.get("ref_id") for b in buses}
    lines = [b for b in branches if b.get("type") in ("line_overhead", "cable")]
    completion = 100 if lines else 0
    for ln in lines:
        if ln.get("from_bus_ref") not in bus_refs:
            issues.append(
                WizardIssue(
                    code="K4_DANGLING_FROM",
                    severity=IssueSeverity.BLOCKER,
                    message_pl=f"Gałąź {ln.get('name', '?')}: szyna źródłowa nie istnieje",
                    element_ref=ln.get("ref_id"),
                    wizard_step_hint="K4",
                )
            )
        if ln.get("to_bus_ref") not in bus_refs:
            issues.append(
                WizardIssue(
                    code="K4_DANGLING_TO",
                    severity=IssueSeverity.BLOCKER,
                    message_pl=f"Gałąź {ln.get('name', '?')}: szyna docelowa nie istnieje",
                    element_ref=ln.get("ref_id"),
                    wizard_step_hint="K4",
                )
            )
    has_blockers = any(i.severity == IssueSeverity.BLOCKER for i in issues)
    status = (
        StepStatus.ERROR if has_blockers else StepStatus.COMPLETE if lines else StepStatus.EMPTY
    )
    return StepState(step_id="K4", status=status, completion_percent=completion, issues=issues)


def _eval_k5(enm: dict[str, Any]) -> StepState:
    """K5: Transformatory."""
    issues: list[WizardIssue] = []
    trafos = enm.get("transformers", [])
    completion = 100 if trafos else 0
    for t in trafos:
        if t.get("uk_percent", 0) <= 0:
            issues.append(
                WizardIssue(
                    code="K5_UK_ZERO",
                    severity=IssueSeverity.BLOCKER,
                    message_pl=f"Trafo {t.get('name', '?')}: uk% = 0",
                    element_ref=t.get("ref_id"),
                    wizard_step_hint="K5",
                )
            )
        if t.get("sn_mva", 0) <= 0:
            issues.append(
                WizardIssue(
                    code="K5_SN_ZERO",
                    severity=IssueSeverity.BLOCKER,
                    message_pl=f"Trafo {t.get('name', '?')}: Sn = 0",
                    element_ref=t.get("ref_id"),
                    wizard_step_hint="K5",
                )
            )
    has_blockers = any(i.severity == IssueSeverity.BLOCKER for i in issues)
    status = (
        StepStatus.ERROR if has_blockers else StepStatus.COMPLETE if trafos else StepStatus.EMPTY
    )
    return StepState(step_id="K5", status=status, completion_percent=completion, issues=issues)


def _eval_k6(enm: dict[str, Any]) -> StepState:
    """K6: Odbiory i generacja."""
    issues: list[WizardIssue] = []
    loads = enm.get("loads", [])
    gens = enm.get("generators", [])
    buses = enm.get("buses", [])
    bus_refs = {b.get("ref_id") for b in buses}
    cnt = len(loads) + len(gens)
    completion = 100 if cnt > 0 else 0
    for ld in loads:
        if ld.get("bus_ref") not in bus_refs:
            issues.append(
                WizardIssue(
                    code="K6_LOAD_DANGLING",
                    severity=IssueSeverity.BLOCKER,
                    message_pl=f"Odbiór {ld.get('name', '?')}: szyna nie istnieje",
                    element_ref=ld.get("ref_id"),
                    wizard_step_hint="K6",
                )
            )
    has_blockers = any(i.severity == IssueSeverity.BLOCKER for i in issues)
    status = (
        StepStatus.ERROR if has_blockers else StepStatus.COMPLETE if cnt > 0 else StepStatus.EMPTY
    )
    return StepState(step_id="K6", status=status, completion_percent=completion, issues=issues)


def _eval_k7(enm: dict[str, Any]) -> StepState:
    """K7: Uziemienia i składowe zerowe."""
    issues: list[WizardIssue] = []
    branches = enm.get("branches", [])
    sources = enm.get("sources", [])
    lines = [b for b in branches if b.get("type") in ("line_overhead", "cable")]
    lines_no_z0 = [
        line
        for line in lines
        if line.get("r0_ohm_per_km") is None and line.get("x0_ohm_per_km") is None
    ]
    src_no_z0 = [
        s
        for s in sources
        if s.get("r0_ohm") is None and s.get("x0_ohm") is None and s.get("z0_z1_ratio") is None
    ]
    if lines_no_z0:
        issues.append(
            WizardIssue(
                code="K7_LINES_NO_Z0",
                severity=IssueSeverity.INFO,
                message_pl=f"{len(lines_no_z0)} gałęzi bez impedancji zerowej Z0",
                wizard_step_hint="K7",
            )
        )
    if src_no_z0:
        issues.append(
            WizardIssue(
                code="K7_SRC_NO_Z0",
                severity=IssueSeverity.INFO,
                message_pl=f"{len(src_no_z0)} źródeł bez impedancji zerowej Z0",
                wizard_step_hint="K7",
            )
        )
    total = len(lines) + len(sources)
    with_z0 = (len(lines) - len(lines_no_z0)) + (len(sources) - len(src_no_z0))
    completion = round((with_z0 / total) * 100) if total > 0 else 100
    status = StepStatus.COMPLETE if completion == 100 else StepStatus.PARTIAL
    return StepState(step_id="K7", status=status, completion_percent=completion, issues=issues)


def _compute_readiness(enm: dict[str, Any], prereq_steps: list[StepState]) -> ReadinessMatrix:
    """Compute analysis readiness matrix."""
    has_blockers = any(s.status == StepStatus.ERROR for s in prereq_steps)
    buses = enm.get("buses", [])
    sources = enm.get("sources", [])
    branches = enm.get("branches", [])
    trafos = enm.get("transformers", [])
    loads = enm.get("loads", [])
    gens = enm.get("generators", [])

    has_buses = len(buses) > 0
    has_sources = len(sources) > 0
    has_branches = len(branches) > 0 or len(trafos) > 0

    # SC 3F
    sc3f_missing: list[str] = []
    if not has_buses:
        sc3f_missing.append("Brak szyn")
    if not has_sources:
        sc3f_missing.append("Brak źródła zasilania")
    if not has_branches:
        sc3f_missing.append("Brak gałęzi lub transformatorów")
    if has_blockers:
        sc3f_missing.append("Model zawiera blokery")

    # SC 1F
    lines = [b for b in branches if b.get("type") in ("line_overhead", "cable")]
    all_lines_z0 = (
        all(
            line.get("r0_ohm_per_km") is not None or line.get("x0_ohm_per_km") is not None
            for line in lines
        )
        if lines
        else True
    )
    all_src_z0 = (
        all(
            s.get("r0_ohm") is not None
            or s.get("x0_ohm") is not None
            or s.get("z0_z1_ratio") is not None
            for s in sources
        )
        if sources
        else True
    )
    sc1f_missing = list(sc3f_missing)
    if not all_lines_z0:
        sc1f_missing.append("Brak Z0 w gałęziach")
    if not all_src_z0:
        sc1f_missing.append("Brak Z0 w źródłach")

    # Load flow
    lf_missing: list[str] = []
    if not has_buses:
        lf_missing.append("Brak szyn")
    if not has_sources:
        lf_missing.append("Brak źródła zasilania")
    if not loads and not gens:
        lf_missing.append("Brak odbiorów lub generatorów")
    if has_blockers:
        lf_missing.append("Model zawiera blokery")

    return ReadinessMatrix(
        short_circuit_3f=AnalysisReadiness(
            available=len(sc3f_missing) == 0, missing_requirements=sc3f_missing
        ),
        short_circuit_1f=AnalysisReadiness(
            available=len(sc1f_missing) == 0, missing_requirements=sc1f_missing
        ),
        load_flow=AnalysisReadiness(
            available=len(lf_missing) == 0, missing_requirements=lf_missing
        ),
    )


def validate_wizard_state(enm: dict[str, Any]) -> WizardStateResponse:
    """
    Compute complete wizard state from raw ENM dict.

    DETERMINISTIC: same ENM → identical response.
    """
    k1 = _eval_k1(enm)
    k2 = _eval_k2(enm)
    k3 = _eval_k3(enm)
    k4 = _eval_k4(enm)
    k5 = _eval_k5(enm)
    k6 = _eval_k6(enm)
    k7 = _eval_k7(enm)
    prereq_steps = [k1, k2, k3, k4, k5, k6, k7]

    blockers = [s for s in prereq_steps if s.status == StepStatus.ERROR]
    k8_issues: list[WizardIssue] = []
    if blockers:
        k8_issues.append(
            WizardIssue(
                code="K8_HAS_BLOCKERS",
                severity=IssueSeverity.BLOCKER,
                message_pl=f"{len(blockers)} kroków z blokerami: {', '.join(s.step_id for s in blockers)}",
                wizard_step_hint="K8",
            )
        )
    k8 = StepState(
        step_id="K8",
        status=StepStatus.ERROR if blockers else StepStatus.COMPLETE,
        completion_percent=0 if blockers else 100,
        issues=k8_issues,
    )

    readiness = _compute_readiness(enm, prereq_steps)

    k9 = StepState(step_id="K9", status=StepStatus.COMPLETE, completion_percent=100, issues=[])
    available = readiness.short_circuit_3f.available or readiness.load_flow.available
    k10 = StepState(
        step_id="K10",
        status=StepStatus.COMPLETE if available else StepStatus.PARTIAL,
        completion_percent=100 if available else 50,
        issues=[],
    )

    steps = prereq_steps + [k8, k9, k10]
    has_blockers = any(s.status == StepStatus.ERROR for s in steps)
    # Required steps: K1 (name), K2 (source), K3 (buses). Optional: K4-K7.
    required_ids = {"K1", "K2", "K3"}
    required_complete = all(
        s.status == StepStatus.COMPLETE for s in prereq_steps if s.step_id in required_ids
    )
    optional_ok = all(
        s.status in (StepStatus.COMPLETE, StepStatus.EMPTY, StepStatus.PARTIAL)
        for s in prereq_steps
        if s.step_id not in required_ids
    )
    any_data = len(enm.get("buses", [])) > 0 or len(enm.get("sources", [])) > 0

    if has_blockers:
        overall = "blocked"
    elif required_complete and optional_ok:
        overall = "ready"
    elif any_data:
        overall = "incomplete"
    else:
        overall = "empty"

    return WizardStateResponse(
        steps=steps,
        overall_status=overall,
        readiness_matrix=readiness,
        element_counts=ElementCounts(
            buses=len(enm.get("buses", [])),
            sources=len(enm.get("sources", [])),
            transformers=len(enm.get("transformers", [])),
            branches=len(enm.get("branches", [])),
            loads=len(enm.get("loads", [])),
            generators=len(enm.get("generators", [])),
        ),
    )
