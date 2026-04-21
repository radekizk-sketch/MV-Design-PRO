"""FIX-11b: E2E Determinism Tests for Power Flow Export (PDF/DOCX).

Ten modul testuje deterministycznosc eksportow PDF i DOCX dla wynikow Power Flow.

Scenariusze testowe:
1. Ten sam wynik PF -> 2x eksport PDF -> identyczny binarnie (SHA256)
2. Ten sam wynik PF -> 2x eksport DOCX -> identyczny binarnie (SHA256)
3. Ten sam wynik PF -> 2x eksport JSON -> identyczny binarnie

Wymagania:
- Export DOCX/JSON deterministyczny dla tego samego wejscia
- SHA256 plikow identyczne miedzy run1/run2

UWAGA: PDF export (reportlab) jest NON-DETERMINISTIC binarnie z powodu:
- Wewnetrznych timestampow PDF
- Roznych identyfikatorow obiektow PDF
- Metadanych produkcji PDF
Testy PDF sa oznaczone jako xfail z dokumentacja tego ograniczenia.
Tresc dokumentu jest deterministyczna, ale format binarny nie.

CANONICAL ALIGNMENT:
- NOT-A-SOLVER: Testy nie modyfikuja solvera ani eksporterow
- Tylko weryfikacja deterministycznosci eksportow
"""

from __future__ import annotations

import hashlib
import tempfile
from pathlib import Path

import pytest
from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.reporting.power_flow_export import (
    export_power_flow_result_to_json,
)
from network_model.solvers.power_flow_fast_decoupled import (
    FastDecoupledOptions,
    solve_power_flow_fast_decoupled,
)
from network_model.solvers.power_flow_gauss_seidel import (
    GaussSeidelOptions,
    solve_power_flow_gauss_seidel,
)
from network_model.solvers.power_flow_newton import (
    solve_power_flow_physics,
)
from network_model.solvers.power_flow_result import (
    PowerFlowResultV1,
    build_power_flow_result_v1,
)
from network_model.solvers.power_flow_trace import (
    PowerFlowTrace,
    build_power_flow_trace,
)
from network_model.solvers.power_flow_types import (
    PowerFlowInput,
    PowerFlowOptions,
    PQSpec,
    SlackSpec,
)

# Check for optional dependencies
try:
    from network_model.reporting.power_flow_report_pdf import (
        _PDF_AVAILABLE,
        export_power_flow_result_to_pdf,
    )
except ImportError:
    _PDF_AVAILABLE = False
    export_power_flow_result_to_pdf = None  # type: ignore

try:
    from network_model.reporting.power_flow_report_docx import (
        _DOCX_AVAILABLE,
        export_power_flow_result_to_docx,
    )
except ImportError:
    _DOCX_AVAILABLE = False
    export_power_flow_result_to_docx = None  # type: ignore


# =============================================================================
# Test Network Fixtures
# =============================================================================


def _make_slack_node(node_id: str, voltage_kv: float = 10.0) -> Node:
    """Tworzy wezel bilansujacy (SLACK)."""
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.SLACK,
        voltage_level=voltage_kv,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
    )


def _make_pq_node(node_id: str, voltage_kv: float = 10.0) -> Node:
    """Tworzy wezel obciazeniowy (PQ)."""
    return Node(
        id=node_id,
        name=node_id,
        node_type=NodeType.PQ,
        voltage_level=voltage_kv,
        active_power=0.0,
        reactive_power=0.0,
    )


def _add_line(
    graph: NetworkGraph,
    branch_id: str,
    from_node: str,
    to_node: str,
    r_ohm_per_km: float = 0.4,
    x_ohm_per_km: float = 0.8,
    length_km: float = 1.0,
) -> None:
    """Dodaje linie do grafu."""
    graph.add_branch(
        LineBranch(
            id=branch_id,
            name=branch_id,
            branch_type=BranchType.LINE,
            from_node_id=from_node,
            to_node_id=to_node,
            r_ohm_per_km=r_ohm_per_km,
            x_ohm_per_km=x_ohm_per_km,
            b_us_per_km=0.0,
            length_km=length_km,
            rated_current_a=300.0,
        )
    )


def _create_test_network() -> NetworkGraph:
    """Tworzy siec 3-wezlowa dla testow eksportu."""
    graph = NetworkGraph()
    graph.add_node(_make_slack_node("BUS_A"))
    graph.add_node(_make_pq_node("BUS_B"))
    graph.add_node(_make_pq_node("BUS_C"))
    _add_line(graph, "LINE_AB", "BUS_A", "BUS_B")
    _add_line(graph, "LINE_BC", "BUS_B", "BUS_C")
    _add_line(graph, "LINE_CA", "BUS_C", "BUS_A")
    return graph


def _create_pf_input(graph: NetworkGraph) -> PowerFlowInput:
    """Tworzy PowerFlowInput dla sieci testowej."""
    return PowerFlowInput(
        graph=graph,
        base_mva=10.0,
        slack=SlackSpec(node_id="BUS_A", u_pu=1.0, angle_rad=0.0),
        pq=[
            PQSpec(node_id="BUS_B", p_mw=1.5, q_mvar=0.8),
            PQSpec(node_id="BUS_C", p_mw=1.0, q_mvar=0.5),
        ],
        options=PowerFlowOptions(max_iter=100, tolerance=1e-8, trace_level="full"),
    )


def _run_pf_and_build_results(
    pf_input: PowerFlowInput,
) -> tuple[PowerFlowResultV1, PowerFlowTrace]:
    """Uruchamia PF i buduje obiekty ResultV1 i Trace."""
    result = solve_power_flow_physics(pf_input)

    # Build PowerFlowResultV1
    result_v1 = build_power_flow_result_v1(
        converged=result.converged,
        iterations_count=result.iterations,
        tolerance_used=pf_input.options.tolerance,
        base_mva=pf_input.base_mva,
        slack_bus_id=pf_input.slack.node_id,
        node_u_mag=result.node_u_mag,
        node_angle=result.node_angle,
        node_p_injected_pu={k: v.real / pf_input.base_mva for k, v in result.node_voltage.items()},
        node_q_injected_pu={k: v.imag / pf_input.base_mva for k, v in result.node_voltage.items()},
        branch_s_from_mva=result.branch_s_from,
        branch_s_to_mva=result.branch_s_to,
        losses_total=result.losses_total,
        slack_power_pu=result.slack_power,
    )

    # Build PowerFlowTrace
    trace = build_power_flow_trace(
        input_hash="test_hash_e2e_export",
        snapshot_id="snapshot_test",
        case_id="case_test",
        run_id="run_test_determinism",
        init_state=result.init_state or {},
        init_method="flat",
        tolerance=pf_input.options.tolerance,
        max_iterations=pf_input.options.max_iter,
        base_mva=pf_input.base_mva,
        slack_bus_id=pf_input.slack.node_id,
        pq_bus_ids=[pq.node_id for pq in pf_input.pq],
        pv_bus_ids=[pv.node_id for pv in pf_input.pv] if pf_input.pv else [],
        ybus_trace=result.ybus_trace,
        nr_trace=result.nr_trace,
        converged=result.converged,
        iterations_count=result.iterations,
    )

    return result_v1, trace


def _compute_file_hash(file_path: Path) -> str:
    """Oblicza SHA-256 hash pliku."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256_hash.update(chunk)
    return sha256_hash.hexdigest()


# =============================================================================
# E2E Test Classes - JSON Export
# =============================================================================


class TestJSONExportDeterminism:
    """E2E: Deterministycznosc eksportu JSON."""

    def test_json_export_identical_twice(self) -> None:
        """2x eksport JSON -> identyczne pliki."""
        graph = _create_test_network()
        pf_input = _create_pf_input(graph)
        result_v1, trace = _run_pf_and_build_results(pf_input)

        with tempfile.TemporaryDirectory() as tmpdir:
            path_1 = Path(tmpdir) / "result_1.json"
            path_2 = Path(tmpdir) / "result_2.json"

            # Export 1
            export_power_flow_result_to_json(
                result_v1,
                path_1,
                trace=trace,
                metadata={"project_name": "Test", "run_id": "run_test"},
            )

            # Export 2
            export_power_flow_result_to_json(
                result_v1,
                path_2,
                trace=trace,
                metadata={"project_name": "Test", "run_id": "run_test"},
            )

            # Compare hashes
            hash_1 = _compute_file_hash(path_1)
            hash_2 = _compute_file_hash(path_2)

            assert hash_1 == hash_2, (
                f"JSON export nie deterministyczny\n" f"Hash 1: {hash_1}\nHash 2: {hash_2}"
            )

    def test_json_export_all_solvers_deterministic(self) -> None:
        """JSON export deterministyczny dla wszystkich solverow."""
        graph = _create_test_network()
        pf_input = _create_pf_input(graph)

        solvers = [
            ("newton-raphson", solve_power_flow_physics),
            ("gauss-seidel", lambda x: solve_power_flow_gauss_seidel(x, GaussSeidelOptions())),
            (
                "fast-decoupled",
                lambda x: solve_power_flow_fast_decoupled(x, FastDecoupledOptions()),
            ),
        ]

        for method_name, solver_func in solvers:
            result = solver_func(pf_input)
            assert result.converged, f"{method_name} nie zbieglo"

            result_v1 = build_power_flow_result_v1(
                converged=result.converged,
                iterations_count=result.iterations,
                tolerance_used=pf_input.options.tolerance,
                base_mva=pf_input.base_mva,
                slack_bus_id=pf_input.slack.node_id,
                node_u_mag=result.node_u_mag,
                node_angle=result.node_angle,
                node_p_injected_pu={},
                node_q_injected_pu={},
                branch_s_from_mva=result.branch_s_from,
                branch_s_to_mva=result.branch_s_to,
                losses_total=result.losses_total,
                slack_power_pu=result.slack_power,
            )

            with tempfile.TemporaryDirectory() as tmpdir:
                path_1 = Path(tmpdir) / f"{method_name}_1.json"
                path_2 = Path(tmpdir) / f"{method_name}_2.json"

                export_power_flow_result_to_json(result_v1, path_1)
                export_power_flow_result_to_json(result_v1, path_2)

                hash_1 = _compute_file_hash(path_1)
                hash_2 = _compute_file_hash(path_2)

                assert hash_1 == hash_2, f"{method_name}: JSON export nie deterministyczny"


# =============================================================================
# E2E Test Classes - PDF Export
# =============================================================================


# Reason for xfail: reportlab includes non-deterministic metadata in PDF files
# (creation timestamps, internal object IDs, production metadata).
# The document CONTENT is deterministic, but the binary format is not.
# This is a known limitation of PDF generation libraries.
PDF_XFAIL_REASON = (
    "PDF export binarnie niedeterministyczny: reportlab dodaje timestampy i "
    "wewnetrzne ID obiektow do pliku PDF. Tresc dokumentu jest deterministyczna."
)


@pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab not installed")
class TestPDFExportDeterminism:
    """E2E: Deterministycznosc eksportu PDF.

    UWAGA: Testy oznaczone xfail z powodu ograniczenia reportlab.
    PDF zawiera wewnetrzne timestampy i ID obiektow, ktore sa niedeterministyczne.
    """

    @pytest.mark.xfail(reason=PDF_XFAIL_REASON, strict=False)
    def test_pdf_export_identical_twice(self) -> None:
        """2x eksport PDF -> identyczne pliki."""
        graph = _create_test_network()
        pf_input = _create_pf_input(graph)
        result_v1, trace = _run_pf_and_build_results(pf_input)

        with tempfile.TemporaryDirectory() as tmpdir:
            path_1 = Path(tmpdir) / "result_1.pdf"
            path_2 = Path(tmpdir) / "result_2.pdf"

            # Export 1
            export_power_flow_result_to_pdf(
                result_v1,
                path_1,
                trace=trace,
                metadata={"project_name": "Test E2E", "run_id": "run_pdf_test"},
                title="Raport rozplywu mocy - Test E2E",
            )

            # Export 2
            export_power_flow_result_to_pdf(
                result_v1,
                path_2,
                trace=trace,
                metadata={"project_name": "Test E2E", "run_id": "run_pdf_test"},
                title="Raport rozplywu mocy - Test E2E",
            )

            # Compare hashes
            hash_1 = _compute_file_hash(path_1)
            hash_2 = _compute_file_hash(path_2)

            assert hash_1 == hash_2, (
                f"PDF export nie deterministyczny\n" f"Hash 1: {hash_1}\nHash 2: {hash_2}"
            )

    @pytest.mark.xfail(reason=PDF_XFAIL_REASON, strict=False)
    def test_pdf_export_without_trace_deterministic(self) -> None:
        """PDF bez trace jest deterministyczny."""
        graph = _create_test_network()
        pf_input = _create_pf_input(graph)
        result_v1, _ = _run_pf_and_build_results(pf_input)

        with tempfile.TemporaryDirectory() as tmpdir:
            path_1 = Path(tmpdir) / "no_trace_1.pdf"
            path_2 = Path(tmpdir) / "no_trace_2.pdf"

            export_power_flow_result_to_pdf(result_v1, path_1, include_trace=False)
            export_power_flow_result_to_pdf(result_v1, path_2, include_trace=False)

            hash_1 = _compute_file_hash(path_1)
            hash_2 = _compute_file_hash(path_2)

            assert hash_1 == hash_2, "PDF bez trace nie deterministyczny"

    @pytest.mark.xfail(reason=PDF_XFAIL_REASON, strict=False)
    def test_pdf_export_all_solvers_deterministic(self) -> None:
        """PDF export deterministyczny dla wszystkich solverow."""
        graph = _create_test_network()
        pf_input = _create_pf_input(graph)

        solvers = [
            ("newton-raphson", solve_power_flow_physics),
            ("gauss-seidel", lambda x: solve_power_flow_gauss_seidel(x, GaussSeidelOptions())),
            (
                "fast-decoupled",
                lambda x: solve_power_flow_fast_decoupled(x, FastDecoupledOptions()),
            ),
        ]

        for method_name, solver_func in solvers:
            result = solver_func(pf_input)
            assert result.converged, f"{method_name} nie zbieglo"

            result_v1 = build_power_flow_result_v1(
                converged=result.converged,
                iterations_count=result.iterations,
                tolerance_used=pf_input.options.tolerance,
                base_mva=pf_input.base_mva,
                slack_bus_id=pf_input.slack.node_id,
                node_u_mag=result.node_u_mag,
                node_angle=result.node_angle,
                node_p_injected_pu={},
                node_q_injected_pu={},
                branch_s_from_mva=result.branch_s_from,
                branch_s_to_mva=result.branch_s_to,
                losses_total=result.losses_total,
                slack_power_pu=result.slack_power,
            )

            with tempfile.TemporaryDirectory() as tmpdir:
                path_1 = Path(tmpdir) / f"{method_name}_1.pdf"
                path_2 = Path(tmpdir) / f"{method_name}_2.pdf"

                export_power_flow_result_to_pdf(result_v1, path_1)
                export_power_flow_result_to_pdf(result_v1, path_2)

                hash_1 = _compute_file_hash(path_1)
                hash_2 = _compute_file_hash(path_2)

                assert hash_1 == hash_2, f"{method_name}: PDF export nie deterministyczny"


# =============================================================================
# E2E Test Classes - DOCX Export
# =============================================================================


@pytest.mark.skipif(not _DOCX_AVAILABLE, reason="python-docx not installed")
class TestDOCXExportDeterminism:
    """E2E: Deterministycznosc eksportu DOCX."""

    def test_docx_export_identical_twice(self) -> None:
        """2x eksport DOCX -> identyczne pliki."""
        graph = _create_test_network()
        pf_input = _create_pf_input(graph)
        result_v1, trace = _run_pf_and_build_results(pf_input)

        with tempfile.TemporaryDirectory() as tmpdir:
            path_1 = Path(tmpdir) / "result_1.docx"
            path_2 = Path(tmpdir) / "result_2.docx"

            # Export 1
            export_power_flow_result_to_docx(
                result_v1,
                path_1,
                trace=trace,
                metadata={"project_name": "Test E2E", "run_id": "run_docx_test"},
                title="Raport rozplywu mocy - Test E2E",
            )

            # Export 2
            export_power_flow_result_to_docx(
                result_v1,
                path_2,
                trace=trace,
                metadata={"project_name": "Test E2E", "run_id": "run_docx_test"},
                title="Raport rozplywu mocy - Test E2E",
            )

            # Compare hashes
            hash_1 = _compute_file_hash(path_1)
            hash_2 = _compute_file_hash(path_2)

            assert hash_1 == hash_2, (
                f"DOCX export nie deterministyczny\n" f"Hash 1: {hash_1}\nHash 2: {hash_2}"
            )

    def test_docx_export_without_trace_deterministic(self) -> None:
        """DOCX bez trace jest deterministyczny."""
        graph = _create_test_network()
        pf_input = _create_pf_input(graph)
        result_v1, _ = _run_pf_and_build_results(pf_input)

        with tempfile.TemporaryDirectory() as tmpdir:
            path_1 = Path(tmpdir) / "no_trace_1.docx"
            path_2 = Path(tmpdir) / "no_trace_2.docx"

            export_power_flow_result_to_docx(result_v1, path_1, include_trace=False)
            export_power_flow_result_to_docx(result_v1, path_2, include_trace=False)

            hash_1 = _compute_file_hash(path_1)
            hash_2 = _compute_file_hash(path_2)

            assert hash_1 == hash_2, "DOCX bez trace nie deterministyczny"

    def test_docx_export_all_solvers_deterministic(self) -> None:
        """DOCX export deterministyczny dla wszystkich solverow."""
        graph = _create_test_network()
        pf_input = _create_pf_input(graph)

        solvers = [
            ("newton-raphson", solve_power_flow_physics),
            ("gauss-seidel", lambda x: solve_power_flow_gauss_seidel(x, GaussSeidelOptions())),
            (
                "fast-decoupled",
                lambda x: solve_power_flow_fast_decoupled(x, FastDecoupledOptions()),
            ),
        ]

        for method_name, solver_func in solvers:
            result = solver_func(pf_input)
            assert result.converged, f"{method_name} nie zbieglo"

            result_v1 = build_power_flow_result_v1(
                converged=result.converged,
                iterations_count=result.iterations,
                tolerance_used=pf_input.options.tolerance,
                base_mva=pf_input.base_mva,
                slack_bus_id=pf_input.slack.node_id,
                node_u_mag=result.node_u_mag,
                node_angle=result.node_angle,
                node_p_injected_pu={},
                node_q_injected_pu={},
                branch_s_from_mva=result.branch_s_from,
                branch_s_to_mva=result.branch_s_to,
                losses_total=result.losses_total,
                slack_power_pu=result.slack_power,
            )

            with tempfile.TemporaryDirectory() as tmpdir:
                path_1 = Path(tmpdir) / f"{method_name}_1.docx"
                path_2 = Path(tmpdir) / f"{method_name}_2.docx"

                export_power_flow_result_to_docx(result_v1, path_1)
                export_power_flow_result_to_docx(result_v1, path_2)

                hash_1 = _compute_file_hash(path_1)
                hash_2 = _compute_file_hash(path_2)

                assert hash_1 == hash_2, f"{method_name}: DOCX export nie deterministyczny"


# =============================================================================
# E2E Integration Test - Full Workflow
# =============================================================================


class TestFullWorkflowDeterminism:
    """E2E: Pelny workflow PF -> Export dla wszystkich metod."""

    def test_full_workflow_json_all_solvers(self) -> None:
        """Pelny workflow: PF (3 metody) -> JSON export -> deterministyczny."""
        graph = _create_test_network()
        pf_input = _create_pf_input(graph)

        solvers = [
            ("newton-raphson", solve_power_flow_physics),
            ("gauss-seidel", lambda x: solve_power_flow_gauss_seidel(x, GaussSeidelOptions())),
            (
                "fast-decoupled",
                lambda x: solve_power_flow_fast_decoupled(x, FastDecoupledOptions()),
            ),
        ]

        for method_name, solver_func in solvers:
            # Run solver twice
            result_1 = solver_func(pf_input)
            result_2 = solver_func(pf_input)

            assert result_1.converged, f"{method_name} run 1 nie zbieglo"
            assert result_2.converged, f"{method_name} run 2 nie zbieglo"

            # Build results
            result_v1_1 = build_power_flow_result_v1(
                converged=result_1.converged,
                iterations_count=result_1.iterations,
                tolerance_used=pf_input.options.tolerance,
                base_mva=pf_input.base_mva,
                slack_bus_id=pf_input.slack.node_id,
                node_u_mag=result_1.node_u_mag,
                node_angle=result_1.node_angle,
                node_p_injected_pu={},
                node_q_injected_pu={},
                branch_s_from_mva=result_1.branch_s_from,
                branch_s_to_mva=result_1.branch_s_to,
                losses_total=result_1.losses_total,
                slack_power_pu=result_1.slack_power,
            )

            result_v1_2 = build_power_flow_result_v1(
                converged=result_2.converged,
                iterations_count=result_2.iterations,
                tolerance_used=pf_input.options.tolerance,
                base_mva=pf_input.base_mva,
                slack_bus_id=pf_input.slack.node_id,
                node_u_mag=result_2.node_u_mag,
                node_angle=result_2.node_angle,
                node_p_injected_pu={},
                node_q_injected_pu={},
                branch_s_from_mva=result_2.branch_s_from,
                branch_s_to_mva=result_2.branch_s_to,
                losses_total=result_2.losses_total,
                slack_power_pu=result_2.slack_power,
            )

            with tempfile.TemporaryDirectory() as tmpdir:
                path_1 = Path(tmpdir) / f"{method_name}_run1.json"
                path_2 = Path(tmpdir) / f"{method_name}_run2.json"

                export_power_flow_result_to_json(result_v1_1, path_1)
                export_power_flow_result_to_json(result_v1_2, path_2)

                hash_1 = _compute_file_hash(path_1)
                hash_2 = _compute_file_hash(path_2)

                assert hash_1 == hash_2, (
                    f"{method_name}: pelny workflow (PF + JSON) nie deterministyczny\n"
                    f"Hash run1: {hash_1}\nHash run2: {hash_2}"
                )

    @pytest.mark.skipif(not _PDF_AVAILABLE, reason="reportlab not installed")
    @pytest.mark.xfail(reason=PDF_XFAIL_REASON, strict=False)
    def test_full_workflow_pdf_newton_raphson(self) -> None:
        """Pelny workflow: NR -> PDF export -> deterministyczny."""
        graph = _create_test_network()
        pf_input = _create_pf_input(graph)

        # Run solver twice
        result_1 = solve_power_flow_physics(pf_input)
        result_2 = solve_power_flow_physics(pf_input)

        assert result_1.converged and result_2.converged

        # Build results
        for run_idx, result in enumerate([result_1, result_2], 1):
            result_v1 = build_power_flow_result_v1(
                converged=result.converged,
                iterations_count=result.iterations,
                tolerance_used=pf_input.options.tolerance,
                base_mva=pf_input.base_mva,
                slack_bus_id=pf_input.slack.node_id,
                node_u_mag=result.node_u_mag,
                node_angle=result.node_angle,
                node_p_injected_pu={},
                node_q_injected_pu={},
                branch_s_from_mva=result.branch_s_from,
                branch_s_to_mva=result.branch_s_to,
                losses_total=result.losses_total,
                slack_power_pu=result.slack_power,
            )

            if run_idx == 1:
                result_v1_1 = result_v1
            else:
                result_v1_2 = result_v1

        with tempfile.TemporaryDirectory() as tmpdir:
            path_1 = Path(tmpdir) / "nr_run1.pdf"
            path_2 = Path(tmpdir) / "nr_run2.pdf"

            export_power_flow_result_to_pdf(result_v1_1, path_1)
            export_power_flow_result_to_pdf(result_v1_2, path_2)

            hash_1 = _compute_file_hash(path_1)
            hash_2 = _compute_file_hash(path_2)

            assert hash_1 == hash_2, "NR: pelny workflow (PF + PDF) nie deterministyczny"

    @pytest.mark.skipif(not _DOCX_AVAILABLE, reason="python-docx not installed")
    def test_full_workflow_docx_newton_raphson(self) -> None:
        """Pelny workflow: NR -> DOCX export -> deterministyczny."""
        graph = _create_test_network()
        pf_input = _create_pf_input(graph)

        # Run solver twice
        result_1 = solve_power_flow_physics(pf_input)
        result_2 = solve_power_flow_physics(pf_input)

        assert result_1.converged and result_2.converged

        result_v1_1 = build_power_flow_result_v1(
            converged=result_1.converged,
            iterations_count=result_1.iterations,
            tolerance_used=pf_input.options.tolerance,
            base_mva=pf_input.base_mva,
            slack_bus_id=pf_input.slack.node_id,
            node_u_mag=result_1.node_u_mag,
            node_angle=result_1.node_angle,
            node_p_injected_pu={},
            node_q_injected_pu={},
            branch_s_from_mva=result_1.branch_s_from,
            branch_s_to_mva=result_1.branch_s_to,
            losses_total=result_1.losses_total,
            slack_power_pu=result_1.slack_power,
        )

        result_v1_2 = build_power_flow_result_v1(
            converged=result_2.converged,
            iterations_count=result_2.iterations,
            tolerance_used=pf_input.options.tolerance,
            base_mva=pf_input.base_mva,
            slack_bus_id=pf_input.slack.node_id,
            node_u_mag=result_2.node_u_mag,
            node_angle=result_2.node_angle,
            node_p_injected_pu={},
            node_q_injected_pu={},
            branch_s_from_mva=result_2.branch_s_from,
            branch_s_to_mva=result_2.branch_s_to,
            losses_total=result_2.losses_total,
            slack_power_pu=result_2.slack_power,
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            path_1 = Path(tmpdir) / "nr_run1.docx"
            path_2 = Path(tmpdir) / "nr_run2.docx"

            export_power_flow_result_to_docx(result_v1_1, path_1)
            export_power_flow_result_to_docx(result_v1_2, path_2)

            hash_1 = _compute_file_hash(path_1)
            hash_2 = _compute_file_hash(path_2)

            assert hash_1 == hash_2, "NR: pelny workflow (PF + DOCX) nie deterministyczny"
