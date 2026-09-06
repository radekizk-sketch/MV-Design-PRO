"""Reference Networks API — walidacja solverów vs publikowane benchmarki."""

from __future__ import annotations

from typing import Any

from application.reference_networks import (
    REFERENCE_NETWORK_REGISTRY,
    get_reference_network,
    list_reference_networks,
    load_expected_values_from_json,
)
from application.reference_networks.comparator import (
    build_validation_report,
    compare_power_flow,
    compare_power_flow_branches,
    compare_short_circuit,
)
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/reference-networks", tags=["reference-networks"])

#: solver_kind identyfikujace analize rozplywu mocy w rejestrze siec
#: referencyjnych (`ReferenceNetwork.supported_solvers`) — patrz uzycie w
#: `_run_solver_for_network` (FAB-E, E4).
_POWER_FLOW_SOLVER_KINDS = frozenset({"power_flow_newton", "power_flow_unbalanced_bfs"})


class ReferenceNetworkSummary(BaseModel):
    """Lekkie podsumowanie dla listy w UI."""

    id: str
    name_pl: str
    description_pl: str
    source: str
    voltage_kv: float
    has_der: bool
    is_unbalanced: bool
    supported_solvers: list[str]


class ReferenceNetworkDetail(BaseModel):
    """Szczegóły z liczbą expected values."""

    id: str
    name_pl: str
    description_pl: str
    source: str
    voltage_kv: float
    has_der: bool
    is_unbalanced: bool
    supported_solvers: list[str]
    bus_count: int = 0
    branch_count: int = 0
    has_pf_expected: bool = False
    has_sc_expected: bool = False
    has_dynamic_expected: bool = False
    expected_pf_count: int = 0
    expected_sc_count: int = 0


class RunResponse(BaseModel):
    """Wynik uruchomienia solverów (bez porównania)."""

    network_id: str
    solver_kind: str
    success: bool
    result: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


class ValidationResponse(BaseModel):
    """Pełny raport walidacji."""

    report: dict[str, Any]


class SimilarityMatchRequestEntity(BaseModel):
    """Lekki opis sieci użytkownika do similarity matching."""

    bus_count: int
    branch_count: int
    voltage_kv_levels: list[float]
    has_der: bool
    is_unbalanced: bool = False


class SimilarityMatchScore(BaseModel):
    network_id: str
    name_pl: str
    confidence_pct: float
    matched_features: list[str]


class SimilarityMatchResponse(BaseModel):
    matches: list[SimilarityMatchScore]


class NcRfgComplianceResponse(BaseModel):
    network_id: str
    applicable: bool
    status: str  # "compliant" | "audit_required" | "non_compliant"
    passed_count: int
    total_count: int
    missing_items: list[str]


# =====================================================================
# Endpoints
# =====================================================================


@router.get("", response_model=list[ReferenceNetworkSummary])
def list_networks() -> list[ReferenceNetworkSummary]:
    """Lista wszystkich sieci referencyjnych."""
    return [
        ReferenceNetworkSummary(
            id=net.id,
            name_pl=net.name_pl,
            description_pl=net.description_pl,
            source=net.source,
            voltage_kv=net.voltage_kv,
            has_der=net.has_der,
            is_unbalanced=net.is_unbalanced,
            supported_solvers=list(net.supported_solvers),
        )
        for net in list_reference_networks()
    ]


@router.get("/{network_id}", response_model=ReferenceNetworkDetail)
def get_network_detail(network_id: str) -> ReferenceNetworkDetail:
    """Szczegóły sieci + ilość expected values."""
    if network_id not in REFERENCE_NETWORK_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown reference network: {network_id}")

    net = get_reference_network(network_id)
    enm = net.builder_fn()
    bus_count = len(enm.get("buses", []))
    branch_count = len(enm.get("branches", []))

    # Try to load expected values (may not exist for stub networks yet)
    has_pf = has_sc = has_dyn = False
    pf_count = sc_count = 0
    try:
        expected = load_expected_values_from_json(net.expected_path)
        has_pf = expected.has_pf()
        has_sc = expected.has_sc()
        has_dyn = expected.has_dynamic()
        pf_count = len(expected.power_flow)
        sc_count = len(expected.short_circuit)
    except FileNotFoundError:
        pass

    return ReferenceNetworkDetail(
        id=net.id,
        name_pl=net.name_pl,
        description_pl=net.description_pl,
        source=net.source,
        voltage_kv=net.voltage_kv,
        has_der=net.has_der,
        is_unbalanced=net.is_unbalanced,
        supported_solvers=list(net.supported_solvers),
        bus_count=bus_count,
        branch_count=branch_count,
        has_pf_expected=has_pf,
        has_sc_expected=has_sc,
        has_dynamic_expected=has_dyn,
        expected_pf_count=pf_count,
        expected_sc_count=sc_count,
    )


def _run_solver_for_network(network_id: str, solver_kind: str) -> dict[str, Any]:
    """Run actual solver (Newton-Raphson or BFS) on the reference network ENM.

    DOWÓD POPRAWNOŚCI: ten kod NIE czyta expected JSON jako actual. Wywołuje
    naszego solvera (`solve_reference_network`) na ENM-like dict i zwraca
    PRAWDZIWE obliczone wartości. Walidacja w `/validate` porównuje wynik
    solvera vs expected JSON z literatury (Stevenson/Kersting/IEC/CIGRE).
    """
    from application.reference_networks.computation import (
        solve_reference_network,
        solve_reference_short_circuit,
    )

    net = get_reference_network(network_id)
    enm = net.builder_fn()

    # PF/BFS: prawdziwy solver — TYLKO gdy siec jest do tego zarejestrowana.
    # FAB-E (E4): fikstury dedykowane WYLACZNIE zwarciom (supported_solvers =
    # tylko "short_circuit_iec60909") czesto podaja dane galezi w Ohm/km, bez
    # odpowiednikow w p.u. — liczenie rozplywu na takim wejsciu wymuszaloby
    # fikcyjne r_pu/x_pu (podstawiane wczesniej cicho jako 0.01/0.05),
    # kompletnie nie zwiazane z fikstura, tylko po to, zeby "cos policzyc" dla
    # analizy, ktorej ta siec nigdy nie mial reprezentowac. Brak wsparcia PF
    # dla sieci = brak wyniku PF (pusty), nie wynik z fikcyjnego wejscia.
    if _POWER_FLOW_SOLVER_KINDS.isdisjoint(net.supported_solvers):
        actual: dict[str, Any] = {"buses": {}, "trace": []}
    else:
        actual = solve_reference_network(network_id, enm)

    # SC: prawdziwy solver IEC 60909, expected JSON sluzy tylko do porownania.
    actual_sc: dict[str, dict[str, Any]] = {}
    try:
        expected = load_expected_values_from_json(net.expected_path)
        actual_sc = solve_reference_short_circuit(enm, expected.short_circuit)
    except FileNotFoundError:
        pass

    wynik: dict[str, Any] = {
        "buses": actual["buses"],
        "branches": {},  # branch flows TBD - extension point
        "short_circuit": actual_sc,
        "trace": [
            {
                "step": "load_enm",
                "buses_count": len(enm.get("buses", [])),
                "branches_count": len(enm.get("branches", [])),
            },
            {"step": "solver_dispatch", "solver_kind": solver_kind},
            *list(actual.get("trace", [])),
        ],
    }
    # ROUTERY-4A: zbieznosc i liczba iteracji sa czescia wyniku solvera
    # (`solve_reference_network` je zwraca) — upuszczanie ich tutaj zmuszalo
    # konsumenta do zgadywania. Przepisywane ADDYTYWNIE i wylacznie wtedy,
    # gdy solver je podal (starsze wpisy rejestru bez tych pol — bez zmiany).
    for pole in ("converged", "iterations"):
        if pole in actual:
            wynik[pole] = actual[pole]
    return wynik


@router.post("/{network_id}/run", response_model=RunResponse)
def run_network(network_id: str, solver_kind: str = "power_flow_newton") -> RunResponse:
    """Załaduj sieć + uruchom solver, bez porównania."""
    if network_id not in REFERENCE_NETWORK_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown reference network: {network_id}")
    try:
        result = _run_solver_for_network(network_id, solver_kind)
        return RunResponse(
            network_id=network_id,
            solver_kind=solver_kind,
            success=True,
            result=result,
        )
    except Exception as exc:
        return RunResponse(
            network_id=network_id,
            solver_kind=solver_kind,
            success=False,
            error=str(exc),
        )


@router.post("/{network_id}/validate", response_model=ValidationResponse)
def validate_network(network_id: str) -> ValidationResponse:
    """Pełna walidacja: load + run solver + compare → ValidationReport."""
    if network_id not in REFERENCE_NETWORK_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown reference network: {network_id}")
    net = get_reference_network(network_id)

    try:
        expected = load_expected_values_from_json(net.expected_path)
    except FileNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"Expected values not yet defined for {network_id}. "
                "Run scripts/regenerate_expected_values.py first."
            ),
        )

    # Get actual solver result and compare against reference expected values.
    actual = _run_solver_for_network(network_id, net.supported_solvers[0])
    pf_comps = compare_power_flow(actual["buses"], expected)
    pf_b_comps = compare_power_flow_branches(actual["branches"], expected)
    sc_comps = compare_short_circuit(actual["short_circuit"], expected)
    report = build_validation_report(
        network_id=network_id,
        network_name_pl=net.name_pl,
        source=net.source,
        solver_version="composite-v1",
        pf_comparisons=pf_comps,
        pf_branch_comparisons=pf_b_comps,
        sc_comparisons=sc_comps,
        trace=tuple(actual.get("trace", [])),
    )
    return ValidationResponse(report=report.to_dict())


@router.post("/similarity-match", response_model=SimilarityMatchResponse)
def similarity_match(entity: SimilarityMatchRequestEntity) -> SimilarityMatchResponse:
    """Match user network features against registry → ranked candidates."""
    from application.reference_networks.similarity_matcher import match_user_network

    matches = match_user_network(
        bus_count=entity.bus_count,
        branch_count=entity.branch_count,
        voltage_kv_levels=entity.voltage_kv_levels,
        has_der=entity.has_der,
        is_unbalanced=entity.is_unbalanced,
    )
    return SimilarityMatchResponse(
        matches=[
            SimilarityMatchScore(
                network_id=m["network_id"],
                name_pl=m["name_pl"],
                confidence_pct=m["confidence_pct"],
                matched_features=m["matched_features"],
            )
            for m in matches
        ]
    )


@router.get("/{network_id}/export/json")
def export_validation_json(network_id: str) -> Any:
    """Eksportuje ValidationReport jako JSON file."""
    from fastapi.responses import Response

    if network_id not in REFERENCE_NETWORK_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown reference network: {network_id}")
    net = get_reference_network(network_id)
    try:
        expected = load_expected_values_from_json(net.expected_path)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Expected values not yet defined")

    actual = _run_solver_for_network(network_id, net.supported_solvers[0])
    pf_comps = compare_power_flow(actual["buses"], expected)
    pf_b_comps = compare_power_flow_branches(actual["branches"], expected)
    sc_comps = compare_short_circuit(actual["short_circuit"], expected)
    report = build_validation_report(
        network_id=network_id,
        network_name_pl=net.name_pl,
        source=net.source,
        solver_version="composite-v1",
        pf_comparisons=pf_comps,
        pf_branch_comparisons=pf_b_comps,
        sc_comparisons=sc_comps,
        trace=tuple(actual.get("trace", [])),
    )
    from application.reference_networks.report_export import to_json

    json_str = to_json(report)
    return Response(
        content=json_str,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="validation-{network_id}.json"'},
    )


@router.get("/{network_id}/export/pdf")
def export_validation_pdf(network_id: str) -> Any:
    """Eksportuje ValidationReport jako PDF."""
    from fastapi.responses import Response

    if network_id not in REFERENCE_NETWORK_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown reference network: {network_id}")
    net = get_reference_network(network_id)
    try:
        expected = load_expected_values_from_json(net.expected_path)
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Expected values not yet defined")

    actual = _run_solver_for_network(network_id, net.supported_solvers[0])
    pf_comps = compare_power_flow(actual["buses"], expected)
    pf_b_comps = compare_power_flow_branches(actual["branches"], expected)
    sc_comps = compare_short_circuit(actual["short_circuit"], expected)
    report = build_validation_report(
        network_id=network_id,
        network_name_pl=net.name_pl,
        source=net.source,
        solver_version="composite-v1",
        pf_comparisons=pf_comps,
        pf_branch_comparisons=pf_b_comps,
        sc_comparisons=sc_comps,
    )
    from application.reference_networks.report_export import to_pdf_bytes

    pdf_bytes = to_pdf_bytes(report)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="validation-{network_id}.pdf"'},
    )


class DynamicValidationResponse(BaseModel):
    network_id: str
    overall_status: str
    sample_count: int
    in_envelope_count: int
    out_of_envelope_count: int
    samples: list[dict[str, Any]]


@router.post("/{network_id}/validate-dynamic", response_model=DynamicValidationResponse)
def validate_dynamic(network_id: str) -> DynamicValidationResponse:
    """Dynamiczna walidacja FRT — porównanie U(t) trajectory vs NC RfG envelope."""
    if network_id not in REFERENCE_NETWORK_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown reference network: {network_id}")
    net = get_reference_network(network_id)
    if "dynamic_stability" not in net.supported_solvers:
        raise HTTPException(
            status_code=400,
            detail=f"Network {network_id} does not support dynamic stability validation",
        )

    from application.stability.voltage_trajectory import (
        TrajectoryGenerationParams,
        check_trajectory_against_envelope,
        generate_voltage_trajectory,
    )

    # Generate baseline FRT trajectory for the network
    params = TrajectoryGenerationParams(
        clearing_time_ms=150.0,
        recovery_duration_s=2.5,
        sample_dt_s=0.02,
        recovery_time_constant_s=0.25,
    )
    trajectory = generate_voltage_trajectory(params)
    per_sample, all_pass = check_trajectory_against_envelope(trajectory)
    in_env = sum(1 for s in per_sample if s.get("in_envelope") is True)
    out_env = len(per_sample) - in_env
    return DynamicValidationResponse(
        network_id=network_id,
        overall_status="PASS" if all_pass else "FAIL",
        sample_count=len(per_sample),
        in_envelope_count=in_env,
        out_of_envelope_count=out_env,
        samples=list(per_sample),
    )


@router.get("/{network_id}/nc-rfg-compliance", response_model=NcRfgComplianceResponse)
def nc_rfg_compliance(network_id: str) -> NcRfgComplianceResponse:
    """Check NC RfG compliance dla sieci OZE."""
    if network_id not in REFERENCE_NETWORK_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown reference network: {network_id}")
    net = get_reference_network(network_id)

    if not net.has_der:
        return NcRfgComplianceResponse(
            network_id=network_id,
            applicable=False,
            status="not_applicable",
            passed_count=0,
            total_count=0,
            missing_items=[],
        )

    # Simplified check — examines DER attributes set in builder
    enm = net.builder_fn()
    generators = enm.get("generators", [])
    checks = {
        "FRT compliant": all(g.get("frt_compliant", False) for g in generators),
        "Anti-islanding enabled": all(g.get("anti_islanding_enabled", False) for g in generators),
        "NC RfG certified": all(g.get("nc_rfg_certified", False) for g in generators),
        "All DER on PV/BESS/inverter type": all(
            "inverter" in str(g.get("gen_kind", "")).lower()
            or "residential" in str(g.get("gen_kind", "")).lower()
            for g in generators
        ),
        "At least one DER present": len(generators) >= 1,
    }
    total = len(checks)
    passed = sum(1 for v in checks.values() if v)
    missing = [k for k, v in checks.items() if not v]
    if passed == total:
        compliance_status = "compliant"
    elif passed >= total - 1:
        compliance_status = "audit_required"
    else:
        compliance_status = "non_compliant"
    return NcRfgComplianceResponse(
        network_id=network_id,
        applicable=True,
        status=compliance_status,
        passed_count=passed,
        total_count=total,
        missing_items=missing,
    )
