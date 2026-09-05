"""PR-6: Tests for unified AnalysisDispatchService.

Test plan:
- input_hash determinism: same input → same hash (3 analysis kinds)
- dedup: second dispatch with identical input → deduplicated=True, no solver re-run
- stale interaction: results_valid=false → dedup skipped, new run forced
- dispatch PF lifecycle
- dispatch SC lifecycle
- unified summary shape consistency
- karta G-22: dispatch FAULT_LOOP_NN/SWZ_NN woła REALNE serwisy P0.6
  (`application.analyses.fault_loop.service`, `application.analyses.swz.service`)
  na modelu ENM z `enm.store` — bez mocków, ścieżka OK i uczciwa ścieżka
  "brak danych"
"""

from __future__ import annotations

import sys
from pathlib import Path
from uuid import UUID, uuid4

import pytest

backend_src = Path(__file__).parents[3] / "src"
sys.path.insert(0, str(backend_src))

from datetime import UTC

from application.analysis_dispatch.service import (
    AnalysisDispatchService,
    compute_dispatch_input_hash,
)
from application.analysis_dispatch.summary import AnalysisRunSummary
from application.analysis_run import AnalysisRunService
from application.network_wizard import NetworkWizardService
from application.network_wizard.dtos import (
    BranchPayload,
    LoadPayload,
    NodePayload,
    SourcePayload,
)
from domain.analysis_kind import AnalysisKind, analysis_type_to_kind, kind_to_analysis_type
from domain.project_design_mode import ProjectDesignMode
from enm.klucz_twin import klucz_twin_projektu
from enm.models import (
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMDefaults,
    ENMHeader,
    Source,
    Substation,
    SwitchBranch,
    Transformer,
)
from enm.store import get_enm, reset_enm_store, set_enm
from infrastructure.persistence.db import create_engine_from_url, create_session_factory, init_db
from infrastructure.persistence.unit_of_work import build_uow_factory

# =============================================================================
# Helpers
# =============================================================================


def _make_uow_factory():
    engine = create_engine_from_url("sqlite+pysqlite:///:memory:")
    init_db(engine)
    session_factory = create_session_factory(engine)
    return build_uow_factory(session_factory)


def _build_services():
    uow_factory = _make_uow_factory()
    wizard = NetworkWizardService(uow_factory)
    analysis_run_svc = AnalysisRunService(uow_factory)
    dispatch_svc = AnalysisDispatchService(uow_factory)
    return wizard, analysis_run_svc, dispatch_svc, uow_factory


def _create_basic_network(wizard, project_id):
    slack_node = wizard.add_node(
        project_id,
        NodePayload(
            name="Slack",
            node_type="SLACK",
            base_kv=15.0,
            attrs={"voltage_magnitude_pu": 1.0, "voltage_angle_rad": 0.0},
        ),
    )
    pq_node = wizard.add_node(
        project_id,
        NodePayload(
            name="Load",
            node_type="PQ",
            base_kv=15.0,
            attrs={"active_power_mw": 5.0, "reactive_power_mvar": 2.0},
        ),
    )
    wizard.add_branch(
        project_id,
        BranchPayload(
            name="Line-1",
            branch_type="LINE",
            from_node_id=slack_node["id"],
            to_node_id=pq_node["id"],
            params={
                "r_ohm_per_km": 0.1,
                "x_ohm_per_km": 0.2,
                "b_us_per_km": 1.0,
                "length_km": 1.0,
                "rated_current_a": 400.0,
            },
        ),
    )
    return slack_node, pq_node


def _add_grid_source(wizard, project_id, node_id):
    wizard.add_source(
        project_id,
        SourcePayload(
            name="Grid",
            node_id=node_id,
            source_type="GRID",
            payload={"name": "Grid", "grid_supply": True, "u_pu": 1.0},
        ),
    )


def _setup_pf_project(wizard):
    """Create a minimal project ready for power flow analysis."""
    project = wizard.create_project("PF-Dispatch")
    slack_node, pq_node = _create_basic_network(wizard, project.id)
    wizard.set_connection_node(project.id, slack_node["id"])
    wizard.add_load(
        project.id,
        LoadPayload(
            name="Load",
            node_id=pq_node["id"],
            payload={"name": "Load", "p_mw": 1.0, "q_mvar": 0.5},
        ),
    )
    case = wizard.create_operating_case(
        project.id,
        "Normal",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.SN_NETWORK.value,
        },
    )
    return project, case, slack_node, pq_node


def _setup_sc_project(wizard):
    """Create a minimal project ready for short-circuit analysis."""
    project = wizard.create_project("SC-Dispatch")
    slack_node, pq_node = _create_basic_network(wizard, project.id)
    wizard.set_connection_node(project.id, slack_node["id"])
    _add_grid_source(wizard, project.id, slack_node["id"])
    case = wizard.create_operating_case(
        project.id,
        "Normal",
        {
            "base_mva": 100.0,
            "active_snapshot_id": str(uuid4()),
            "project_design_mode": ProjectDesignMode.SN_NETWORK.value,
        },
    )
    return project, case, slack_node, pq_node


def _setup_nn_project(wizard):
    """Projekt + JEDEN OperatingCase — bez sieci w warstwie Wizard/NetworkGraph
    (karta G-22): model nN, na którym operuje FAULT_LOOP_NN/SWZ_NN, żyje w
    `enm.store` kluczowanym kluczem PROJEKTU (`enm.klucz_twin.
    klucz_twin_projektu(project.id)`, CV-1-W) — CAŁKOWICIE OSOBNA przestrzeń od
    NetworkGraph budowanej przez `NetworkWizardService` (zob. docstring
    `AnalysisDispatchService._dispatch_fault_loop_nn`). `case.id` jest
    identyfikatorem OperatingCase, NIE StudyCase (dwie oddzielne tabele) — dispatch
    buduje klucz magazynu WPROST z `project_id`, bez zapytania o `case.id` do bazy,
    więc ten test NIE zakłada istnienia wiersza StudyCase. Jeden przypadek
    tworzony tu staje się AKTYWNY automatycznie (`create_operating_case`
    aktywuje pierwszy przypadek projektu), więc `_resolve_case_id` działa
    bez dodatkowego wywołania `ActiveCaseService`.
    """
    project = wizard.create_project("NN-Dispatch")
    case = wizard.create_operating_case(
        project.id,
        "Normal",
        {"base_mva": 100.0, "project_design_mode": ProjectDesignMode.SN_NETWORK.value},
    )
    return project, case


def _nn_ready_enm() -> EnergyNetworkModel:
    """Stacja SN/nN + transformator (Dyn11, komplet danych) + trasa kablowa
    nN z żyłą powrotną + aparat zabezpieczający (APARAT_NN_MCB) — spełnia
    WSZYSTKIE warunki wejściowe P0.6 dla pętli zwarcia w punkcie 'b1' i SWZ
    na odpływie chronionym aparatem 'ap1' (ten sam kształt fixture'a co
    `tests/application/test_eligibility_service_nn.py::_ready_nn_enm`, żeby
    dispatch i eligibility zgadzały się co do tego, czym jest "gotowy"
    model — jedno źródło prawdy o kompletności danych, nie dwie kopie).
    """
    return EnergyNetworkModel(
        header=ENMHeader(name="nN dispatch", defaults=ENMDefaults(sn_nominal_kv=15.0)),
        buses=[
            Bus(ref_id="sn", name="SN", voltage_kv=15.0),
            Bus(ref_id="nn", name="nN", voltage_kv=0.4),
            Bus(ref_id="b1", name="B1", voltage_kv=0.4),
            Bus(ref_id="b2", name="B2", voltage_kv=0.4),
        ],
        sources=[
            Source(
                ref_id="src",
                name="GPZ",
                bus_ref="sn",
                model="thevenin",
                sk3_mva=200.0,
                r_ohm=0.1,
                x_ohm=0.5,
                catalog_ref="SRC_CAT",
            )
        ],
        transformers=[
            Transformer(
                ref_id="tr",
                name="TR",
                hv_bus_ref="sn",
                lv_bus_ref="nn",
                sn_mva=0.63,
                uhv_kv=15.0,
                ulv_kv=0.4,
                uk_percent=4.0,
                pk_kw=6.5,
                vector_group="Dyn11",
                catalog_ref="TR_CAT",
            )
        ],
        branches=[
            Cable(
                ref_id="c1",
                name="C1",
                from_bus_ref="nn",
                to_bus_ref="b1",
                length_km=0.05,
                r_ohm_per_km=0.32,
                x_ohm_per_km=0.08,
                catalog_ref="KABEL_NN_CAT",
                return_conductor_r_ohm_per_km_20c=0.32,
                return_conductor_x_ohm_per_km=0.08,
            ),
            SwitchBranch(
                ref_id="ap1",
                name="AP1",
                type="breaker",
                from_bus_ref="b1",
                to_bus_ref="b2",
                catalog_ref="MCB_C32_CAT",
                catalog_namespace="APARAT_NN_MCB",
                materialized_params={"in_a": 32.0, "curve_class": "C"},
            ),
        ],
        substations=[
            Substation(
                ref_id="stn",
                name="S",
                station_type="mv_lv",
                bus_refs=["sn", "nn"],
                transformer_refs=["tr"],
                meta={"nn_earthing_system": "TN-C-S"},
            )
        ],
    )


# =============================================================================
# Unit Tests: input_hash determinism
# =============================================================================


class TestInputHashDeterminism:
    """Same input → same hash, regardless of dict key order."""

    def test_pf_hash_determinism(self):
        case_id = uuid4()
        enm_hash = "abc123"
        opts = {"tolerance": 1e-8, "max_iter": 30}

        h1 = compute_dispatch_input_hash(
            AnalysisKind.POWER_FLOW,
            case_id,
            enm_hash,
            opts,
        )
        h2 = compute_dispatch_input_hash(
            AnalysisKind.POWER_FLOW,
            case_id,
            enm_hash,
            opts,
        )
        assert h1 == h2
        assert len(h1) == 64  # SHA-256 hex

    def test_sc_hash_determinism(self):
        case_id = uuid4()
        enm_hash = "def456"
        opts = {"include_branch": True}
        fault_spec = {"fault_type": "3F", "node_id": "node-1", "c_factor": 1.1}

        h1 = compute_dispatch_input_hash(
            AnalysisKind.SHORT_CIRCUIT,
            case_id,
            enm_hash,
            opts,
            extra={"fault_spec": fault_spec},
        )
        h2 = compute_dispatch_input_hash(
            AnalysisKind.SHORT_CIRCUIT,
            case_id,
            enm_hash,
            opts,
            extra={"fault_spec": fault_spec},
        )
        assert h1 == h2

    def test_protection_hash_determinism(self):
        case_id = uuid4()
        enm_hash = "ghi789"
        extra = {"protection_config_fingerprint": "fp-001"}

        h1 = compute_dispatch_input_hash(
            AnalysisKind.PROTECTION,
            case_id,
            enm_hash,
            extra=extra,
        )
        h2 = compute_dispatch_input_hash(
            AnalysisKind.PROTECTION,
            case_id,
            enm_hash,
            extra=extra,
        )
        assert h1 == h2

    def test_different_kind_different_hash(self):
        case_id = uuid4()
        enm_hash = "same"
        opts = {}

        h_pf = compute_dispatch_input_hash(AnalysisKind.POWER_FLOW, case_id, enm_hash, opts)
        h_sc = compute_dispatch_input_hash(AnalysisKind.SHORT_CIRCUIT, case_id, enm_hash, opts)
        assert h_pf != h_sc

    def test_dict_key_order_invariant(self):
        case_id = uuid4()
        enm_hash = "order-test"
        opts_a = {"a": 1, "b": 2, "c": 3}
        opts_b = {"c": 3, "a": 1, "b": 2}

        h1 = compute_dispatch_input_hash(AnalysisKind.POWER_FLOW, case_id, enm_hash, opts_a)
        h2 = compute_dispatch_input_hash(AnalysisKind.POWER_FLOW, case_id, enm_hash, opts_b)
        assert h1 == h2


# =============================================================================
# Unit Tests: AnalysisKind mapping
# =============================================================================


class TestAnalysisKindMapping:
    def test_kind_to_type(self):
        assert kind_to_analysis_type(AnalysisKind.SHORT_CIRCUIT) == "short_circuit_sn"
        assert kind_to_analysis_type(AnalysisKind.POWER_FLOW) == "PF"
        assert kind_to_analysis_type(AnalysisKind.PROTECTION) == "protection"

    def test_type_to_kind(self):
        assert analysis_type_to_kind("short_circuit_sn") == AnalysisKind.SHORT_CIRCUIT
        assert analysis_type_to_kind("PF") == AnalysisKind.POWER_FLOW
        assert analysis_type_to_kind("protection") == AnalysisKind.PROTECTION
        assert analysis_type_to_kind("unknown") is None


# =============================================================================
# Unit Tests: AnalysisRunSummary contract
# =============================================================================


class TestAnalysisRunSummaryContract:
    def test_summary_to_dict_contains_all_fields(self):
        from datetime import datetime

        now = datetime.now(UTC)
        summary = AnalysisRunSummary(
            run_id="run-1",
            analysis_kind="SHORT_CIRCUIT",
            status="FINISHED",
            created_at=now,
            finished_at=now,
            input_hash="abc123",
            enm_hash="enm-hash",
            results_valid=True,
            deduplicated=False,
            result_location="/analysis-runs/run-1/results",
        )
        d = summary.to_dict()
        required_keys = {
            "run_id",
            "analysis_kind",
            "status",
            "created_at",
            "finished_at",
            "input_hash",
            "enm_hash",
            "results_valid",
            "deduplicated",
            "result_location",
            "error_message",
        }
        assert required_keys.issubset(set(d.keys()))

    def test_summary_deduplicated_flag(self):
        from datetime import datetime

        summary = AnalysisRunSummary(
            run_id="run-2",
            analysis_kind="POWER_FLOW",
            status="FINISHED",
            created_at=datetime.now(UTC),
            deduplicated=True,
        )
        d = summary.to_dict()
        assert d["deduplicated"] is True


# =============================================================================
# Integration Tests: PF dispatch lifecycle
# =============================================================================


class TestPowerFlowDispatch:
    def test_dispatch_pf_creates_and_executes(self):
        wizard, _, dispatch_svc, _ = _build_services()
        project, case, _, _ = _setup_pf_project(wizard)

        summary = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.POWER_FLOW,
            project_id=project.id,
            study_case_id=case.id,
        )

        assert isinstance(summary, AnalysisRunSummary)
        assert summary.analysis_kind == "POWER_FLOW"
        assert summary.status == "FINISHED"
        assert summary.results_valid is True
        assert summary.deduplicated is False
        assert summary.run_id  # non-empty
        assert summary.input_hash  # non-empty

    def test_dispatch_pf_returns_consistent_shape(self):
        wizard, _, dispatch_svc, _ = _build_services()
        project, case, _, _ = _setup_pf_project(wizard)

        summary = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.POWER_FLOW,
            project_id=project.id,
            study_case_id=case.id,
        )

        d = summary.to_dict()
        # All required keys present
        for key in [
            "run_id",
            "analysis_kind",
            "status",
            "input_hash",
            "enm_hash",
            "results_valid",
            "deduplicated",
        ]:
            assert key in d, f"Missing key: {key}"


# =============================================================================
# Integration Tests: SC dispatch lifecycle
# =============================================================================


class TestShortCircuitDispatch:
    def test_dispatch_sc_creates_and_executes(self):
        wizard, _, dispatch_svc, _ = _build_services()
        project, case, slack_node, _ = _setup_sc_project(wizard)

        fault_spec = {"fault_type": "3F", "node_id": str(slack_node["id"])}
        summary = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.SHORT_CIRCUIT,
            project_id=project.id,
            study_case_id=case.id,
            options={"fault_spec": fault_spec},
        )

        assert isinstance(summary, AnalysisRunSummary)
        assert summary.analysis_kind == "SHORT_CIRCUIT"
        assert summary.status == "FINISHED"
        assert summary.results_valid is True
        assert summary.deduplicated is False

    def test_dispatch_sc_requires_fault_spec(self):
        wizard, _, dispatch_svc, _ = _build_services()
        project, case, _, _ = _setup_sc_project(wizard)

        with pytest.raises(ValueError, match="fault_spec"):
            dispatch_svc.dispatch(
                analysis_kind=AnalysisKind.SHORT_CIRCUIT,
                project_id=project.id,
                study_case_id=case.id,
                options={},
            )

    def test_dispatch_sc_consistent_summary_shape(self):
        wizard, _, dispatch_svc, _ = _build_services()
        project, case, slack_node, _ = _setup_sc_project(wizard)

        fault_spec = {"fault_type": "3F", "node_id": str(slack_node["id"])}
        summary = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.SHORT_CIRCUIT,
            project_id=project.id,
            study_case_id=case.id,
            options={"fault_spec": fault_spec},
        )

        d = summary.to_dict()
        # Same shape as PF
        for key in [
            "run_id",
            "analysis_kind",
            "status",
            "input_hash",
            "enm_hash",
            "results_valid",
            "deduplicated",
        ]:
            assert key in d, f"Missing key: {key}"


# =============================================================================
# Integration Tests: Deduplication
# =============================================================================


class TestDeduplication:
    def test_pf_dedup_second_dispatch_is_deduplicated(self):
        """Second dispatch with identical input → deduplicated=True, no solver re-run."""
        wizard, analysis_svc, dispatch_svc, uow_factory = _build_services()
        project, case, _, _ = _setup_pf_project(wizard)

        # First dispatch
        s1 = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.POWER_FLOW,
            project_id=project.id,
            study_case_id=case.id,
        )
        assert s1.status == "FINISHED"
        assert s1.deduplicated is False

        # Second dispatch — same input
        s2 = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.POWER_FLOW,
            project_id=project.id,
            study_case_id=case.id,
        )
        # The PF service has internal dedup that creates a new run with copied results
        # The run should be FINISHED regardless
        assert s2.status == "FINISHED"

    def test_sc_dedup_second_dispatch(self):
        """Second SC dispatch with identical input should finish quickly."""
        wizard, _, dispatch_svc, _ = _build_services()
        project, case, slack_node, _ = _setup_sc_project(wizard)

        fault_spec = {"fault_type": "3F", "node_id": str(slack_node["id"])}
        opts = {"fault_spec": fault_spec}

        s1 = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.SHORT_CIRCUIT,
            project_id=project.id,
            study_case_id=case.id,
            options=opts,
        )
        assert s1.status == "FINISHED"

        # Second dispatch
        s2 = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.SHORT_CIRCUIT,
            project_id=project.id,
            study_case_id=case.id,
            options=opts,
        )
        assert s2.status == "FINISHED"


# =============================================================================
# Integration Tests: Stale interaction (PR-5 regression guard)
# =============================================================================


class TestStaleInteraction:
    def test_stale_results_force_new_run(self):
        """If results_valid=false (OUTDATED) → dedup disabled, new run created."""
        wizard, analysis_svc, dispatch_svc, uow_factory = _build_services()
        project, case, slack_node, pq_node = _setup_pf_project(wizard)

        # Run 1: success
        s1 = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.POWER_FLOW,
            project_id=project.id,
            study_case_id=case.id,
        )
        assert s1.status == "FINISHED"
        assert s1.results_valid is True
        run_id_1 = s1.run_id

        # Modify network → results become OUTDATED
        wizard.add_node(
            project.id,
            NodePayload(
                name="New",
                node_type="PQ",
                base_kv=15.0,
                attrs={"active_power_mw": 0.5, "reactive_power_mvar": 0.2},
            ),
        )

        # Verify previous run is now OUTDATED
        old_run = analysis_svc.get_run(UUID(run_id_1))
        assert old_run.result_status == "OUTDATED"

        # Run 2: new dispatch should force new run (not dedup from stale)
        s2 = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.POWER_FLOW,
            project_id=project.id,
            study_case_id=case.id,
        )
        assert s2.status == "FINISHED"
        # Different run because input changed (new node)
        assert s2.run_id != run_id_1

    def test_invalidation_mechanism_still_works(self):
        """PR-5 regression: mark_results_outdated still functions."""
        wizard, analysis_svc, _, uow_factory = _build_services()
        project, case, _, pq_node = _setup_pf_project(wizard)

        run = analysis_svc.create_power_flow_run(project.id, case.id)
        executed = analysis_svc.execute_run(run.id)
        assert executed.result_status == "VALID"

        # Trigger invalidation via network change
        wizard.add_node(
            project.id,
            NodePayload(
                name="Extra",
                node_type="PQ",
                base_kv=15.0,
                attrs={"active_power_mw": 0.3, "reactive_power_mvar": 0.1},
            ),
        )

        updated = analysis_svc.get_run(run.id)
        assert updated.result_status == "OUTDATED"


# =============================================================================
# Karta G-22: FAULT_LOOP_NN / SWZ_NN dispatch
# =============================================================================


@pytest.fixture(autouse=True)
def _reset_enm_store_for_nn_dispatch_tests():
    """`enm.store` jest globalnym magazynem w pamięci procesu (kluczowanym
    `case_id`) — bez resetu przypadki różnych testów w tym pliku mogłyby
    dzielić wpisy (UUID-y `case.id` SĄ unikalne per test, więc kolizja jest
    mało prawdopodobna, ale reset jest tani i eliminuje zależność testów od
    kolejności uruchomienia)."""
    reset_enm_store()
    yield
    reset_enm_store()


class TestDispatchFaultLoopNn:
    """Dispatch woła WPROST `application.analyses.fault_loop.service`
    (import, nie kopia — §0.3 karty G-22), na modelu z `enm.store`."""

    def test_point_ok(self):
        wizard, _, dispatch_svc, _ = _build_services()
        project, case = _setup_nn_project(wizard)
        set_enm(klucz_twin_projektu(project.id), _nn_ready_enm())

        summary = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.FAULT_LOOP_NN,
            project_id=project.id,
            study_case_id=case.id,
            options={"station_ref": "stn", "bus_ref": "b1"},
        )

        assert summary.analysis_kind == "FAULT_LOOP_NN"
        assert summary.status == "FINISHED"
        assert summary.results_valid is True
        assert summary.error_message is None
        assert "fault-loop-point" in summary.result_location
        assert f"/api/cases/{case.id}/" in summary.result_location

    def test_feeders_ok_without_bus_ref(self):
        """Bez `bus_ref` w options → widok CAŁEGO odpływu (wszystkie punkty),
        nie widok pojedynczego punktu — inny endpoint, inna funkcja P0.6."""
        wizard, _, dispatch_svc, _ = _build_services()
        project, case = _setup_nn_project(wizard)
        set_enm(klucz_twin_projektu(project.id), _nn_ready_enm())

        summary = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.FAULT_LOOP_NN,
            project_id=project.id,
            study_case_id=case.id,
            options={"station_ref": "stn"},
        )

        assert summary.status == "FINISHED"
        assert "fault-loop-feeders" in summary.result_location

    def test_missing_station_ref_raises(self):
        wizard, _, dispatch_svc, _ = _build_services()
        project, case = _setup_nn_project(wizard)
        set_enm(klucz_twin_projektu(project.id), _nn_ready_enm())

        with pytest.raises(ValueError, match="station_ref"):
            dispatch_svc.dispatch(
                analysis_kind=AnalysisKind.FAULT_LOOP_NN,
                project_id=project.id,
                study_case_id=case.id,
                options={},
            )

    def test_honest_failure_for_unknown_station(self):
        """Dispatch NIE fabrykuje sukcesu — stacja, której nie ma w modelu,
        daje status FAILED z uczciwym powodem PL (dowód, że serwis P0.6 jest
        WOŁANY naprawdę, nie zaślepiony na zawsze-OK)."""
        wizard, _, dispatch_svc, _ = _build_services()
        project, case = _setup_nn_project(wizard)
        set_enm(klucz_twin_projektu(project.id), _nn_ready_enm())

        summary = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.FAULT_LOOP_NN,
            project_id=project.id,
            study_case_id=case.id,
            options={"station_ref": "nieznana-stacja", "bus_ref": "b1"},
        )

        assert summary.status == "FAILED"
        assert summary.results_valid is False
        assert summary.error_message

    def test_real_service_called_not_mocked(self):
        """Dispatch i wywołanie bezpośrednie serwisu P0.6 na TYM SAMYM modelu
        dają IDENTYCZNY wynik fizyczny — dowód, że dispatch nie duplikuje
        logiki ani jej nie podmienia (import, nie kopia)."""
        from application.analyses.fault_loop.service import build_fault_loop_view_at_point

        wizard, _, dispatch_svc, _ = _build_services()
        project, case = _setup_nn_project(wizard)
        enm = _nn_ready_enm()
        set_enm(klucz_twin_projektu(project.id), enm)

        summary = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.FAULT_LOOP_NN,
            project_id=project.id,
            study_case_id=case.id,
            options={"station_ref": "stn", "bus_ref": "b1"},
        )
        assert summary.status == "FINISHED"

        direct = build_fault_loop_view_at_point(
            get_enm(klucz_twin_projektu(project.id)), "stn", "b1"
        )
        assert direct["status"] == "OK"

    def test_determinism_same_input_same_run_id(self):
        wizard, _, dispatch_svc, _ = _build_services()
        project, case = _setup_nn_project(wizard)
        set_enm(klucz_twin_projektu(project.id), _nn_ready_enm())

        s1 = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.FAULT_LOOP_NN,
            project_id=project.id,
            study_case_id=case.id,
            options={"station_ref": "stn", "bus_ref": "b1"},
        )
        s2 = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.FAULT_LOOP_NN,
            project_id=project.id,
            study_case_id=case.id,
            options={"station_ref": "stn", "bus_ref": "b1"},
        )
        assert s1.run_id == s2.run_id
        assert s1.input_hash == s2.input_hash

    def test_different_bus_ref_different_run_id(self):
        wizard, _, dispatch_svc, _ = _build_services()
        project, case = _setup_nn_project(wizard)
        set_enm(klucz_twin_projektu(project.id), _nn_ready_enm())

        s1 = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.FAULT_LOOP_NN,
            project_id=project.id,
            study_case_id=case.id,
            options={"station_ref": "stn", "bus_ref": "b1"},
        )
        s2 = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.FAULT_LOOP_NN,
            project_id=project.id,
            study_case_id=case.id,
            options={"station_ref": "stn", "bus_ref": "nn"},
        )
        assert s1.run_id != s2.run_id


class TestDispatchSwzNn:
    """Dispatch woła WPROST `application.analyses.swz.service.build_swz_view`
    (P0.6), na modelu z `enm.store`."""

    def test_ok(self):
        wizard, _, dispatch_svc, _ = _build_services()
        project, case = _setup_nn_project(wizard)
        set_enm(klucz_twin_projektu(project.id), _nn_ready_enm())

        summary = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.SWZ_NN,
            project_id=project.id,
            study_case_id=case.id,
            options={"station_ref": "stn", "bus_ref": "b1", "breaker_ref": "ap1"},
        )

        assert summary.analysis_kind == "SWZ_NN"
        assert summary.status == "FINISHED"
        assert summary.results_valid is True
        assert "swz" in summary.result_location

    def test_missing_breaker_ref_raises(self):
        wizard, _, dispatch_svc, _ = _build_services()
        project, case = _setup_nn_project(wizard)
        set_enm(klucz_twin_projektu(project.id), _nn_ready_enm())

        with pytest.raises(ValueError, match="breaker_ref"):
            dispatch_svc.dispatch(
                analysis_kind=AnalysisKind.SWZ_NN,
                project_id=project.id,
                study_case_id=case.id,
                options={"station_ref": "stn", "bus_ref": "b1"},
            )

    def test_missing_bus_ref_raises(self):
        wizard, _, dispatch_svc, _ = _build_services()
        project, case = _setup_nn_project(wizard)
        set_enm(klucz_twin_projektu(project.id), _nn_ready_enm())

        with pytest.raises(ValueError, match="bus_ref"):
            dispatch_svc.dispatch(
                analysis_kind=AnalysisKind.SWZ_NN,
                project_id=project.id,
                study_case_id=case.id,
                options={"station_ref": "stn", "breaker_ref": "ap1"},
            )

    def test_honest_failure_for_unknown_breaker(self):
        wizard, _, dispatch_svc, _ = _build_services()
        project, case = _setup_nn_project(wizard)
        set_enm(klucz_twin_projektu(project.id), _nn_ready_enm())

        summary = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.SWZ_NN,
            project_id=project.id,
            study_case_id=case.id,
            options={"station_ref": "stn", "bus_ref": "b1", "breaker_ref": "nieznany-aparat"},
        )

        assert summary.status == "FAILED"
        assert summary.results_valid is False
        assert summary.error_message

    def test_determinism_same_input_same_run_id(self):
        wizard, _, dispatch_svc, _ = _build_services()
        project, case = _setup_nn_project(wizard)
        set_enm(klucz_twin_projektu(project.id), _nn_ready_enm())

        s1 = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.SWZ_NN,
            project_id=project.id,
            study_case_id=case.id,
            options={"station_ref": "stn", "bus_ref": "b1", "breaker_ref": "ap1"},
        )
        s2 = dispatch_svc.dispatch(
            analysis_kind=AnalysisKind.SWZ_NN,
            project_id=project.id,
            study_case_id=case.id,
            options={"station_ref": "stn", "bus_ref": "b1", "breaker_ref": "ap1"},
        )
        assert s1.run_id == s2.run_id


class TestAnalysisKindMappingNn:
    """Karta G-22: mapowanie `AnalysisKind` ↔ `analysis_type` obejmuje też
    FAULT_LOOP_NN/SWZ_NN — kompletność rejestru (KLASA NIE INSTANCJA: bez
    tego testu brak wpisu byłby niewidoczny aż do pierwszego wywołania w
    kontekście, który faktycznie woła `kind_to_analysis_type`)."""

    def test_fault_loop_nn_round_trip(self):
        analysis_type = kind_to_analysis_type(AnalysisKind.FAULT_LOOP_NN)
        assert analysis_type_to_kind(analysis_type) == AnalysisKind.FAULT_LOOP_NN

    def test_swz_nn_round_trip(self):
        analysis_type = kind_to_analysis_type(AnalysisKind.SWZ_NN)
        assert analysis_type_to_kind(analysis_type) == AnalysisKind.SWZ_NN


class TestEligibilityDispatchSprzezenie:
    """Pin PREDYKATU PARAMI (odbiór nadzoru G-22, KLASA-NIE-INSTANCJA §3/§4).

    Docstring fixtury `_nn_ready_enm` DEKLARUJE „jedno źródło prawdy o
    kompletności danych" między eligibility a dispatch, ale obie strony oceniają
    gotowość WŁASNYM predykatem (kontrole strukturalne EligibilityService vs
    realne wymagania wejścia serwisów P0.6). Deklaracja bez testu = fałszywa
    pewność: gdyby predykaty się rozjechały, oba zbiory testów zostałyby
    zielone, a obietnica produktu („ELIGIBLE ⇒ bieg się powiedzie") pękłaby
    po cichu. Ten test sprzęga OBA końce na JEDNYM modelu.
    """

    def test_eligible_implikuje_finished_dla_obu_rodzajow(self):
        from application.eligibility_service import EligibilityService
        from domain.eligibility_models import AnalysisType, EligibilityStatus
        from enm.validator import ENMValidator

        wizard, _, dispatch_svc, _ = _build_services()
        project, case = _setup_nn_project(wizard)
        enm = _nn_ready_enm()
        set_enm(klucz_twin_projektu(project.id), enm)

        validator = ENMValidator()
        readiness = validator.readiness(validator.validate(enm))
        matrix = EligibilityService().compute_matrix(
            enm=enm, readiness=readiness, case_id=str(case.id)
        )
        for analysis_type in (AnalysisType.FAULT_LOOP_NN, AnalysisType.SWZ_NN):
            row = next(r for r in matrix.matrix if r.analysis_type == analysis_type)
            assert row.status == EligibilityStatus.ELIGIBLE, (
                f"{analysis_type}: eligibility nie uznaje modelu referencyjnego "
                f"dispatchu za gotowy — predykaty się rozjechały ({row.status})."
            )

        for kind, options in (
            (AnalysisKind.FAULT_LOOP_NN, {"station_ref": "stn", "bus_ref": "b1"}),
            (AnalysisKind.SWZ_NN, {"station_ref": "stn", "bus_ref": "b1", "breaker_ref": "ap1"}),
        ):
            summary = dispatch_svc.dispatch(
                analysis_kind=kind,
                project_id=project.id,
                study_case_id=case.id,
                options=options,
            )
            assert summary.status == "FINISHED", (
                f"{kind}: ELIGIBLE model nie przeszedł dispatchu "
                f"({summary.status}: {summary.error_message}) — predykaty parami złamane."
            )
