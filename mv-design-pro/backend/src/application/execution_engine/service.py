"""
Execution Engine Service — PR-14

Application service implementing the canonical execution pipeline:
    StudyCase → Readiness Check → Eligibility Check → Run → ResultSet

INVARIANTS:
- Solver is NEVER called directly — always via Run
- Run blocked if readiness.ready == false
- Run blocked if eligibility.blockers for analysis_type
- Validation != Readiness (separate semantics)
- solver_input frozen (deep copy) before execution
- Hash generated from sorted JSON without transient fields
- ZERO changes to existing solvers, catalogs, or physics

ARCHITECTURE:
- This service lives in the APPLICATION layer
- It orchestrates domain models (Run, ResultSet) and solver-input builder
- NO physics calculations here — delegates to existing solvers
"""

from __future__ import annotations

import copy
import logging
from typing import Any, Literal
from uuid import UUID

import numpy as np
from application.execution_engine.load_flow_run_input import LoadFlowRunInput
from application.result_mapping.load_flow_to_resultset_v1 import (
    map_power_flow_to_resultset_v1,
)
from application.result_mapping.sc_binding_meta import (
    wzbogac_resultset_o_meta_bindingu,
)
from application.result_mapping.short_circuit_to_resultset_v1 import (
    map_short_circuit_to_resultset_v1,
)
from application.solvers.short_circuit_binding import (
    ShortCircuitBindingError,
    execute_short_circuit,
)
from domain.execution import (
    ElementResult,
    ExecutionAnalysisType,
    ResultSet,
    Run,
    RunStatus,
    build_result_set,
    compute_solver_input_hash,
    new_run,
)
from domain.fault_scenario import FaultScenario
from domain.study_case import StudyCase as DomainStudyCase
from domain.study_case import StudyCaseConfig
from network_model.solvers.power_flow_newton import PowerFlowNewtonSolver
from network_model.solvers.power_flow_result import build_power_flow_result_v1

from .errors import (
    ResultSetNotFoundError,
    RunBlockedError,
    RunNotFoundError,
    RunNotReadyError,
    StudyCaseNotFoundError,
)

logger = logging.getLogger(__name__)


class ExecutionEngineService:
    """
    Canonical execution engine for StudyCase → Run → ResultSet pipeline.

    Responsibilities:
    - Create Run records with deterministic solver_input_hash
    - Gate execution on readiness and eligibility
    - Store ResultSet after successful execution
    - Provide Run and ResultSet retrieval
    """

    def __init__(self) -> None:
        # In-memory stores for PR-14 (no DB persistence yet)
        self._runs: dict[UUID, Run] = {}
        self._result_sets: dict[UUID, ResultSet] = {}
        self._study_cases: dict[UUID, DomainStudyCase] = {}
        # Run history per study case (study_case_id → list of run_ids)
        self._case_runs: dict[UUID, list[UUID]] = {}

    # =========================================================================
    # Study Case Management (thin wrapper for execution context)
    # =========================================================================

    def register_study_case(self, case: DomainStudyCase) -> None:
        """Register a study case for execution tracking."""
        self._study_cases[case.id] = case

    def get_study_case(self, case_id: UUID) -> DomainStudyCase:
        """Get a registered study case."""
        case = self._study_cases.get(case_id)
        if case is None:
            raise StudyCaseNotFoundError(str(case_id))
        return case

    def list_study_cases_for_project(self, project_id: UUID) -> list[DomainStudyCase]:
        """List all study cases for a project."""
        return [case for case in self._study_cases.values() if case.project_id == project_id]

    # =========================================================================
    # Run Creation
    # =========================================================================

    def create_run(
        self,
        *,
        study_case_id: UUID,
        analysis_type: ExecutionAnalysisType,
        solver_input: dict[str, Any],
        readiness: dict[str, Any] | None = None,
        eligibility: dict[str, Any] | None = None,
    ) -> Run:
        """
        Create a new Run with deterministic solver_input_hash.

        GATING:
        1. readiness.ready must be True (if provided)
        2. eligibility.eligible must be True (if provided)
        3. solver_input is frozen (deep copy) before hashing

        Args:
            study_case_id: ID of the study case
            analysis_type: Type of analysis to run
            solver_input: Solver input dict (will be deep-copied and hashed)
            readiness: Optional readiness check result
            eligibility: Optional eligibility check result

        Returns:
            Created Run in PENDING status

        Raises:
            StudyCaseNotFoundError: If study case not found
            RunNotReadyError: If readiness check fails
            RunBlockedError: If eligibility check fails
        """
        # Verify study case exists
        if study_case_id not in self._study_cases:
            raise StudyCaseNotFoundError(str(study_case_id))

        # Gate 1: Readiness check
        if readiness is not None and not readiness.get("ready", False):
            issues = readiness.get("issues", [])
            reason = (
                "; ".join(
                    issue.get("message_pl", issue.get("message", "Nieznany problem"))
                    for issue in issues
                    if issue.get("severity") == "BLOCKER"
                )
                or "Sieć nie jest gotowa"
            )
            raise RunNotReadyError(reason)

        # Gate 2: Eligibility check (PR-17: AnalysisEligibilityResult dict)
        if eligibility is not None:
            elig_status = eligibility.get("status", "ELIGIBLE")
            is_eligible = (
                eligibility.get("eligible", True)
                if "eligible" in eligibility
                else elig_status == "ELIGIBLE"
            )
            if not is_eligible:
                blockers = [
                    b.get("message_pl", b.get("message", "Nieznany bloker"))
                    for b in eligibility.get("blockers", [])
                ]
                if not blockers:
                    blockers = [f"Analiza zablokowana (status: {elig_status})"]
                raise RunBlockedError(blockers)

        # Freeze solver input (deep copy) and compute hash
        frozen_input = copy.deepcopy(solver_input)
        solver_input_hash = compute_solver_input_hash(frozen_input)

        # Create run
        run = new_run(
            study_case_id=study_case_id,
            analysis_type=analysis_type,
            solver_input_hash=solver_input_hash,
        )

        # Store
        self._runs[run.id] = run
        if study_case_id not in self._case_runs:
            self._case_runs[study_case_id] = []
        self._case_runs[study_case_id].append(run.id)

        logger.info(
            "Created run %s for study_case %s, analysis=%s, hash=%s",
            run.id,
            study_case_id,
            analysis_type.value,
            solver_input_hash[:16],
        )

        return run

    # =========================================================================
    # Run Lifecycle
    # =========================================================================

    def start_run(self, run_id: UUID) -> Run:
        """Mark a run as RUNNING."""
        run = self._get_run(run_id)
        if run.status != RunStatus.PENDING:
            return run
        updated = run.mark_running()
        self._runs[run_id] = updated
        return updated

    def complete_run(
        self,
        run_id: UUID,
        *,
        validation_snapshot: dict[str, Any],
        readiness_snapshot: dict[str, Any],
        element_results: list[ElementResult],
        global_results: dict[str, Any],
    ) -> tuple[Run, ResultSet]:
        """
        Complete a run with results.

        Creates a ResultSet with deterministic signature and marks run as DONE.

        Returns:
            Tuple of (updated Run, created ResultSet)
        """
        run = self._get_run(run_id)
        if run.status == RunStatus.DONE:
            result_set = self._result_sets.get(run_id)
            if result_set is not None:
                return run, result_set

        # Build ResultSet
        result_set = build_result_set(
            run_id=run_id,
            analysis_type=run.analysis_type,
            validation_snapshot=validation_snapshot,
            readiness_snapshot=readiness_snapshot,
            element_results=element_results,
            global_results=global_results,
        )

        # Update run status
        updated_run = run.mark_done()
        self._runs[run_id] = updated_run
        self._result_sets[run_id] = result_set

        logger.info(
            "Completed run %s with signature=%s",
            run_id,
            result_set.deterministic_signature[:16],
        )

        return updated_run, result_set

    def fail_run(self, run_id: UUID, error_message: str) -> Run:
        """Mark a run as FAILED."""
        run = self._get_run(run_id)
        if run.status == RunStatus.FAILED:
            return run
        updated = run.mark_failed(error_message)
        self._runs[run_id] = updated
        logger.warning("Failed run %s: %s", run_id, error_message)
        return updated

    # =========================================================================
    # Load Flow Execution
    # =========================================================================

    def execute_run_load_flow(
        self,
        run_id: UUID,
        *,
        load_flow_input: LoadFlowRunInput,
        readiness_snapshot: dict[str, Any],
        validation_snapshot: dict[str, Any],
    ) -> tuple[Run, ResultSet]:
        """Execute a load-flow run via the canonical ExecutionEngine pipeline."""
        run = self._get_run(run_id)

        if run.status != RunStatus.PENDING:
            raise RunBlockedError([f"Przebieg ma status {run.status.value} — wymagany PENDING"])

        if run.analysis_type != ExecutionAnalysisType.LOAD_FLOW:
            raise RunBlockedError([f"Typ analizy {run.analysis_type.value} nie jest LOAD_FLOW"])

        run = self.start_run(run_id)

        try:
            pf_input = load_flow_input.to_power_flow_input()
            solution = PowerFlowNewtonSolver().solve(pf_input)
            # ==================================================================
            # SIGN CONVENTION OF THE NODAL POWER — one definition for this block
            # (karta W2). Two conventions meet here and exactly ONE negation
            # separates them:
            #
            #   INPUT side. LoadFlowLoadInput/LoadFlowGeneratorInput are handed
            #   over unchanged as PQSpec/PVSpec, and those carry the LOAD
            #   convention — p_mw > 0 == DRAW. The single source of that truth is
            #   the solver itself: ``build_power_spec_v2`` writes
            #   ``p_spec = -spec.p_mw / base_mva`` for pq AND pv alike
            #   (power_flow_newton_internal.py).
            #
            #   RESULT side. The FROZEN field ``PowerFlowBusResult.p_injected_mw``
            #   is an INJECTION — "ujemna = pobor", power_flow_result.py:35 — the
            #   same convention as ``solution.slack_power``, which lands in this
            #   very dict a few lines below.
            #
            # Composing the two without the negation put the PQ/PV buses at the
            # sign OPPOSITE to both the slack next to them and the documented
            # contract: a real 2,0 MW consumer was reported as +2,0 MW fed INTO
            # the grid, and the nodal sum came out as 7,03 MW in a network whose
            # losses are 0,031 MW. Measured, not presumed (karta W2 §2.1); the
            # judge was Kirchhoff at the node rebuilt from the branch-end flows.
            #
            # The PQ value is taken STRAIGHT FROM THE SOLVER
            # (``node_p_spec_effective_pu``, already injection convention, pu on
            # base_mva). At a ZIP / inverter-controlled bus the declared power is
            # only the REQUEST — the injected power is the one after the voltage
            # polynomial (measured: request 1,5 MW vs injection 1,430975 MW), so
            # reporting the request breaks the nodal balance exactly as defect D1
            # did on the canonical path. For a constant-power bus the solver value
            # is bit-identical to ``-p_mw / base_mva``, which is also the fallback
            # for buses the solver skipped (outside the slack island). ZERO physics
            # in this layer — same single source of truth as the canonical path in
            # ``enm/canonical_analysis``.
            #
            # Bus sets: iterating ``pf_input.pq`` / ``pf_input.pv`` (not the raw
            # component tuples) keys this dict on exactly the buses the solver
            # saw — ``merge_bus_components`` has already folded several loads on
            # one bus into one spec, and the two sets are provably disjoint
            # because the solver REFUSES a node declared as both PQ and PV
            # ("node_id cannot be specified as both PQ and PV"). One partition,
            # one owner. Buses with neither load nor generation keep 0.0, which
            # is their true injection.
            # ==================================================================
            node_p_injected_pu = {node.node_id: 0.0 for node in load_flow_input.nodes}
            node_q_injected_pu = {node.node_id: 0.0 for node in load_flow_input.nodes}
            solver_p_effective = solution.node_p_spec_effective_pu
            solver_q_effective = solution.node_q_spec_effective_pu
            for pq in pf_input.pq:
                node_p_injected_pu[pq.node_id] = solver_p_effective.get(
                    pq.node_id, -pq.p_mw / pf_input.base_mva
                )
                node_q_injected_pu[pq.node_id] = solver_q_effective.get(
                    pq.node_id, -pq.q_mvar / pf_input.base_mva
                )
            for pv in pf_input.pv:
                # Debt W2-D1 CLOSED (card X1). A PV bus holds its active power at
                # the declared value, and its reactive power is the free variable
                # of the solve — the quantity that holds the requested voltage.
                # The solver now publishes BOTH in the same dictionaries
                # (``pv_calculated_injections``, read from the nodal equation),
                # so this layer reads them instead of reporting 0.000000 Mvar
                # against the 0.405463 Mvar of the Kirchhoff judge. The fallbacks
                # cover buses outside the slack island, which the solver skips.
                node_p_injected_pu[pv.node_id] = solver_p_effective.get(
                    pv.node_id, -pv.p_mw / pf_input.base_mva
                )
                node_q_injected_pu[pv.node_id] = solver_q_effective.get(pv.node_id, 0.0)
            node_p_injected_pu[pf_input.slack.node_id] = float(np.real(solution.slack_power))
            node_q_injected_pu[pf_input.slack.node_id] = float(np.imag(solution.slack_power))

            pf_result = build_power_flow_result_v1(
                converged=solution.converged,
                iterations_count=solution.iterations,
                tolerance_used=pf_input.options.tolerance,
                base_mva=pf_input.base_mva,
                slack_bus_id=pf_input.slack.node_id,
                node_u_mag=solution.node_u_mag,
                node_angle=solution.node_angle,
                node_p_injected_pu=node_p_injected_pu,
                node_q_injected_pu=node_q_injected_pu,
                branch_s_from_mva=solution.branch_s_from_mva,
                branch_s_to_mva=solution.branch_s_to_mva,
                losses_total=solution.losses_total,
                slack_power_pu=solution.slack_power,
            )

            branch_topology = {
                b.branch_id: (b.from_node_id, b.to_node_id) for b in load_flow_input.branches
            }
            bus_voltage_bases = {n.node_id: n.voltage_level_kv for n in load_flow_input.nodes}

            mapped = map_power_flow_to_resultset_v1(
                pf_result=pf_result,
                snapshot_hash=load_flow_input.canonical_hash(),
                run_hash=run.solver_input_hash,
                input_hash=load_flow_input.canonical_hash(),
                bus_voltage_bases=bus_voltage_bases,
                branch_topology=branch_topology,
            )

            element_results = [
                ElementResult(
                    element_ref=node.node_id,
                    element_type="node",
                    values={
                        "voltage_pu": node.voltage_pu,
                        "angle_deg": node.angle_deg,
                    },
                )
                for node in mapped.nodes
            ] + [
                ElementResult(
                    element_ref=branch.branch_id,
                    element_type="branch",
                    values={
                        "losses_p_mw": branch.losses_p_mw,
                        "p_from_mw": branch.p_from_mw,
                    },
                )
                for branch in mapped.branches
            ]

            global_results = {
                "snapshot_hash": mapped.snapshot_hash,
                "convergence_status": mapped.convergence_status,
                "iteration_count": mapped.iteration_count,
                # V12K-320: utrata regulacji napiecia (PV->PQ na granicy Q)
                # nalezy do wyniku biegu — patrz enm/canonical_analysis.
                "pv_to_pq_switches": solution.pv_to_pq_switches,
                "totals": mapped.totals.to_dict(),
                "sld_overlay": {
                    "nodes": {
                        n.node_id: {
                            "voltage_pu": n.voltage_pu,
                            "angle_deg": n.angle_deg,
                        }
                        for n in mapped.nodes
                    },
                    "branches": {
                        b.branch_id: {
                            "loading_p_from_mw": b.p_from_mw,
                            "losses_p_mw": b.losses_p_mw,
                        }
                        for b in mapped.branches
                    },
                },
            }

            updated_run, result_set = self.complete_run(
                run_id,
                validation_snapshot=validation_snapshot,
                readiness_snapshot=readiness_snapshot,
                element_results=element_results,
                global_results=global_results,
            )

            return updated_run, result_set
        except Exception:
            self.fail_run(run_id, "Load-flow execution failed")
            raise

    # =========================================================================
    # Short-Circuit Execution (PR-18)
    # =========================================================================

    _SC_ANALYSIS_TYPES = {
        ExecutionAnalysisType.SC_3F,
        ExecutionAnalysisType.SC_1F,
        ExecutionAnalysisType.SC_2F,
    }

    def execute_run_sc(
        self,
        run_id: UUID,
        *,
        graph: Any,
        config: StudyCaseConfig,
        fault_node_id: str,
        readiness_snapshot: dict[str, Any],
        validation_snapshot: dict[str, Any],
        z0_bus: np.ndarray | None = None,
        scenario: Literal["MAX", "MIN"] = "MAX",
    ) -> tuple[Run, ResultSet]:
        """
        Execute a short-circuit run end-to-end (PR-18 binding).

        FLOW:
        1. Get Run (must be PENDING)
        2. Mark as RUNNING
        3. Call short_circuit_binding with the correct SC variant
        4. Map solver result → ResultSet v1
        5. Store ResultSet, mark as DONE
        6. On error → mark as FAILED

        Args:
            run_id: ID of a PENDING run.
            graph: NetworkGraph to compute on.
            config: StudyCaseConfig with c_factor, thermal_time, etc.
            fault_node_id: Node where the fault occurs.
            readiness_snapshot: Readiness state at run time.
            validation_snapshot: Validation state at run time.
            z0_bus: Zero-sequence bus matrix (required for SC_1F).
            scenario: "MAX" (Ik''max, default) or "MIN" (Ik''min — karta P0.3:
                per-band c + R_theta temperature correction on line/cable
                branches). Threaded straight into ``execute_short_circuit``.

        Returns:
            Tuple of (completed Run in DONE status, ResultSet v1).

        Raises:
            RunNotFoundError: If run doesn't exist.
            RunBlockedError: If analysis_type is not a short-circuit type.
            ShortCircuitBindingError: If the solver fails.
        """
        run = self._get_run(run_id)

        # Gate: Run must be PENDING (no re-execution of DONE/FAILED/RUNNING)
        if run.status != RunStatus.PENDING:
            raise RunBlockedError([f"Przebieg ma status {run.status.value} — wymagany PENDING"])

        if run.analysis_type not in self._SC_ANALYSIS_TYPES:
            raise RunBlockedError(
                [
                    f"Typ analizy {run.analysis_type.value} nie jest obsługiwany przez solver zwarciowy"
                ]
            )

        # Transition PENDING → RUNNING
        run = self.start_run(run_id)

        try:
            # Call the solver binding
            binding_result = execute_short_circuit(
                graph=graph,
                analysis_type=run.analysis_type,
                config=config,
                fault_node_id=fault_node_id,
                scenario=scenario,
                z0_bus=z0_bus,
            )

            # Map to ResultSet v1 (mapper ZAMROŻONY) + meta bindingu P0.3
            # (scenariusz/c per pasmo/korekta R_θ) dokładane wrapperem POZA
            # plikiem chronionym, z przeliczeniem podpisu.
            result_set = wzbogac_resultset_o_meta_bindingu(
                map_short_circuit_to_resultset_v1(
                    binding_result=binding_result,
                    run_id=run.id,
                    graph=graph,
                    validation_snapshot=validation_snapshot,
                    readiness_snapshot=readiness_snapshot,
                ),
                binding_result,
            )

            # Store ResultSet and mark DONE
            updated_run = run.mark_done()
            self._runs[run_id] = updated_run
            self._result_sets[run_id] = result_set

            logger.info(
                "SC run %s completed: type=%s, Ik''=%.2f A, sig=%s",
                run_id,
                run.analysis_type.value,
                binding_result.solver_result.ikss_a,
                result_set.deterministic_signature[:16],
            )

            return updated_run, result_set

        except (ShortCircuitBindingError, Exception) as exc:
            error_msg = str(exc)
            self.fail_run(run_id, error_msg)
            raise

    # =========================================================================
    # Scenario-based Short-Circuit Execution (PR-19)
    # =========================================================================

    def execute_run_by_scenario(
        self,
        run_id: UUID,
        *,
        fault_scenario: FaultScenario,
        graph: Any,
        readiness_snapshot: dict[str, Any],
        validation_snapshot: dict[str, Any],
        z0_bus: np.ndarray | None = None,
    ) -> tuple[Run, ResultSet]:
        """
        Execute a short-circuit run via a FaultScenario object (PR-19).

        All solver parameters are derived exclusively from the FaultScenario.
        No additional fault parameters accepted.

        Args:
            run_id: ID of a PENDING run.
            fault_scenario: Canonical FaultScenario domain object.
            graph: NetworkGraph to compute on.
            readiness_snapshot: Readiness state at run time.
            validation_snapshot: Validation state at run time.
            z0_bus: Precomputed Z0 bus matrix (required for SC_1F).

        Returns:
            Tuple of (completed Run, ResultSet v1).
        """
        # Derive parameters from FaultScenario exclusively
        fault_node_id = fault_scenario.location.element_ref
        config = StudyCaseConfig(
            c_factor_max=fault_scenario.config.c_factor,
            thermal_time_seconds=fault_scenario.config.thermal_time_seconds,
        )

        return self.execute_run_sc(
            run_id,
            graph=graph,
            config=config,
            fault_node_id=fault_node_id,
            readiness_snapshot=readiness_snapshot,
            validation_snapshot=validation_snapshot,
            z0_bus=z0_bus,
        )

    # =========================================================================
    # Protection Execution (PR-26 + PR-27)
    # =========================================================================

    def execute_run_protection(
        self,
        run_id: UUID,
        *,
        study_input: Any,
        readiness_snapshot: dict[str, Any],
        validation_snapshot: dict[str, Any],
        current_source: Any | None = None,
        sc_result_set: Any | None = None,
    ) -> tuple[Run, ResultSet]:
        """
        Execute a protection analysis run end-to-end (PR-26 + PR-27).

        FLOW:
        1. Get Run (must be PENDING)
        2. Mark as RUNNING
        3. If current_source provided (PR-27): resolve test points
        4. Call Protection Engine v1 with resolved test points
        5. Map result → ResultSet (PROTECTION)
        6. Store ResultSet, mark as DONE
        7. On error → mark as FAILED

        Args:
            run_id: ID of a PENDING run.
            study_input: ProtectionStudyInputV1 with relays and test points.
            readiness_snapshot: Readiness state at run time.
            validation_snapshot: Validation state at run time.
            current_source: ProtectionCurrentSource (PR-27, optional).
            sc_result_set: SC ResultSet for SC_RESULT mode (PR-27, read-only).

        Returns:
            Tuple of (completed Run in DONE status, ResultSet).
        """
        from application.result_mapping.protection_to_resultset_v1 import (
            map_protection_to_resultset_v1,
        )
        from domain.protection_engine_v1 import (
            ProtectionStudyInputV1,
            execute_protection_v1,
        )

        run = self._get_run(run_id)

        if run.status != RunStatus.PENDING:
            raise RunBlockedError([f"Przebieg ma status {run.status.value} — wymagany PENDING"])

        if run.analysis_type != ExecutionAnalysisType.PROTECTION:
            raise RunBlockedError([f"Typ analizy {run.analysis_type.value} nie jest PROTECTION"])

        run = self.start_run(run_id)

        try:
            # PR-27: If current_source is provided, resolve test points
            effective_input = study_input
            if current_source is not None:
                from application.protection_current_resolver import (
                    ProtectionCurrentResolver,
                )

                resolver = ProtectionCurrentResolver()
                relay_ids = tuple(r.relay_id for r in study_input.relays)

                resolved_test_points = resolver.resolve(
                    current_source=current_source,
                    relay_ids=relay_ids,
                    test_points=study_input.test_points,
                    sc_result_set=sc_result_set,
                )

                effective_input = ProtectionStudyInputV1(
                    relays=study_input.relays,
                    test_points=resolved_test_points,
                )

            protection_result = execute_protection_v1(effective_input)

            result_set = map_protection_to_resultset_v1(
                protection_result=protection_result,
                run_id=run.id,
                validation_snapshot=validation_snapshot,
                readiness_snapshot=readiness_snapshot,
            )

            updated_run = run.mark_done()
            self._runs[run_id] = updated_run
            self._result_sets[run_id] = result_set

            logger.info(
                "Protection run %s completed: relays=%d, sig=%s",
                run_id,
                len(protection_result.relay_results),
                result_set.deterministic_signature[:16],
            )

            return updated_run, result_set

        except Exception as exc:
            error_msg = str(exc)
            self.fail_run(run_id, error_msg)
            raise

    # =========================================================================
    # Query Operations
    # =========================================================================

    def get_run(self, run_id: UUID) -> Run:
        """Get a run by ID."""
        return self._get_run(run_id)

    def get_result_set(self, run_id: UUID) -> ResultSet:
        """Get the result set for a run."""
        result_set = self._result_sets.get(run_id)
        if result_set is None:
            raise ResultSetNotFoundError(str(run_id))
        return result_set

    def list_runs_for_case(self, study_case_id: UUID) -> list[Run]:
        """List all runs for a study case, ordered by creation (newest first)."""
        run_ids = self._case_runs.get(study_case_id, [])
        runs = [self._runs[rid] for rid in run_ids if rid in self._runs]
        # Reverse to get newest first
        return list(reversed(runs))

    def get_latest_run(self, study_case_id: UUID) -> Run | None:
        """Get the latest run for a study case."""
        runs = self.list_runs_for_case(study_case_id)
        return runs[0] if runs else None

    def get_latest_successful_run(self, study_case_id: UUID) -> tuple[Run, ResultSet] | None:
        """Get the latest successful run and its result set."""
        for run in self.list_runs_for_case(study_case_id):
            if run.status == RunStatus.DONE:
                result_set = self._result_sets.get(run.id)
                if result_set is not None:
                    return run, result_set
        return None

    # =========================================================================
    # Hash Verification
    # =========================================================================

    def verify_hash_determinism(
        self,
        solver_input_a: dict[str, Any],
        solver_input_b: dict[str, Any],
    ) -> bool:
        """
        Verify that two solver inputs produce the same hash.

        Used for testing determinism invariant.
        """
        hash_a = compute_solver_input_hash(solver_input_a)
        hash_b = compute_solver_input_hash(solver_input_b)
        return hash_a == hash_b

    # =========================================================================
    # Internal Helpers
    # =========================================================================

    def _get_run(self, run_id: UUID) -> Run:
        """Get a run or raise RunNotFoundError."""
        run = self._runs.get(run_id)
        if run is None:
            raise RunNotFoundError(str(run_id))
        return run
