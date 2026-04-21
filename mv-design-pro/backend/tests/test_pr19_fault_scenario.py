"""
Tests for PR-19: Fault Scenario Domain Layer

Test categories:
1. Domain model invariants (FaultScenario, FaultLocation, ShortCircuitConfig)
2. Content hash determinism
3. Validation rules (SC_1F z0, BRANCH position, BUS no position)
4. FaultScenarioService CRUD
5. Execution engine integration via execute_run_by_scenario
6. API endpoint contracts
7. Golden fixtures (SC_3F/SC_2F/SC_1F)

INVARIANTS UNDER TEST:
- ZERO randomness: identical content → identical content_hash
- SC_1F requires z0_bus_data
- BRANCH position in (0,1)
- BUS position must be None
- Deterministic sorting
- No auto-completion

PR-24 FIX: All calls pass required `name` parameter.
"""

from __future__ import annotations

from uuid import uuid4

import numpy as np
import pytest
from application.execution_engine.service import ExecutionEngineService
from application.fault_scenario_service import (
    FaultScenarioDuplicateError,
    FaultScenarioNotFoundError,
    FaultScenarioService,
)
from domain.execution import (
    ExecutionAnalysisType,
    ResultSet,
    RunStatus,
)
from domain.fault_scenario import (
    FAULT_TYPE_TO_ANALYSIS,
    FaultLocation,
    FaultScenario,
    FaultScenarioValidationError,
    FaultType,
    ShortCircuitConfig,
    compute_scenario_content_hash,
    new_fault_scenario,
)
from domain.study_case import StudyCaseConfig, new_study_case
from network_model.core.branch import BranchType, LineBranch, TransformerBranch
from network_model.core.graph import NetworkGraph
from network_model.core.inverter import InverterSource
from network_model.core.node import Node, NodeType
from network_model.core.ybus import AdmittanceMatrixBuilder

# =============================================================================
# Fixtures
# =============================================================================

MOCK_PROJECT_ID = uuid4()
MOCK_CASE_ID = uuid4()

# Default test scenario name (Polish, user-facing).
DEFAULT_NAME = "Zwarcie testowe"


def _create_golden_graph() -> NetworkGraph:
    """Golden MV network for testing (same as PR-18)."""
    graph = NetworkGraph()

    graph.add_node(
        Node(
            id="SLACK",
            name="Stacja 110kV",
            node_type=NodeType.PQ,
            voltage_level=110.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )
    graph.add_node(
        Node(
            id="BUS_MV",
            name="Szyna SN 20kV",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=5.0,
            reactive_power=2.0,
        )
    )
    graph.add_node(
        Node(
            id="BUS_LOAD",
            name="Szyna odbiorcza 20kV",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=10.0,
            reactive_power=4.0,
        )
    )
    graph.add_node(
        Node(
            id="GND",
            name="Uziemienie",
            node_type=NodeType.PQ,
            voltage_level=20.0,
            active_power=0.0,
            reactive_power=0.0,
        )
    )

    graph.add_branch(
        TransformerBranch(
            id="T1",
            name="Transformator T1",
            branch_type=BranchType.TRANSFORMER,
            from_node_id="SLACK",
            to_node_id="BUS_MV",
            in_service=True,
            rated_power_mva=25.0,
            voltage_hv_kv=110.0,
            voltage_lv_kv=20.0,
            uk_percent=10.0,
            pk_kw=120.0,
            i0_percent=0.5,
            p0_kw=25.0,
            vector_group="Dyn11",
            tap_position=0,
            tap_step_percent=2.5,
            type_ref="TRAFO_110_20_25MVA",
        )
    )

    graph.add_branch(
        LineBranch(
            id="C1",
            name="Kabel C1",
            branch_type=BranchType.CABLE,
            from_node_id="BUS_MV",
            to_node_id="BUS_LOAD",
            in_service=True,
            r_ohm_per_km=0.125,
            x_ohm_per_km=0.08,
            b_us_per_km=260.0,
            length_km=5.0,
            rated_current_a=400.0,
            type_ref="YAKY_3x240",
        )
    )

    graph.add_branch(
        LineBranch(
            id="REF",
            name="Ref GND",
            branch_type=BranchType.LINE,
            from_node_id="BUS_LOAD",
            to_node_id="GND",
            in_service=True,
            r_ohm_per_km=1e9,
            x_ohm_per_km=0.0,
            b_us_per_km=0.0,
            length_km=1.0,
            rated_current_a=1.0,
        )
    )

    graph.add_inverter_source(
        InverterSource(
            id="INV1",
            name="Falownik PV 1",
            node_id="BUS_LOAD",
            in_rated_a=100.0,
            k_sc=1.1,
            contributes_negative_sequence=False,
            contributes_zero_sequence=False,
            in_service=True,
        )
    )

    return graph


def _create_engine_with_case():
    """Create ExecutionEngineService with registered study case."""
    engine = ExecutionEngineService()
    case = new_study_case(
        project_id=MOCK_PROJECT_ID,
        name="PR-19 test case",
        config=StudyCaseConfig(c_factor_max=1.10, thermal_time_seconds=1.0),
    )
    engine.register_study_case(case)
    return engine, case


# =============================================================================
# 1. DOMAIN MODEL INVARIANTS
# =============================================================================


class TestFaultScenarioDomain:
    """Test FaultScenario domain model invariants."""

    def test_fault_type_enum_values(self):
        """FaultType has SC_3F, SC_2F, SC_1F."""
        assert FaultType.SC_3F.value == "SC_3F"
        assert FaultType.SC_2F.value == "SC_2F"
        assert FaultType.SC_1F.value == "SC_1F"
        assert len(FaultType) == 3

    def test_fault_type_to_analysis_mapping(self):
        """FaultType maps correctly to ExecutionAnalysisType."""
        assert FAULT_TYPE_TO_ANALYSIS[FaultType.SC_3F] == ExecutionAnalysisType.SC_3F
        assert FAULT_TYPE_TO_ANALYSIS[FaultType.SC_2F] == ExecutionAnalysisType.SC_2F
        assert FAULT_TYPE_TO_ANALYSIS[FaultType.SC_1F] == ExecutionAnalysisType.SC_1F

    def test_fault_location_bus(self):
        """BUS location has no position."""
        loc = FaultLocation(element_ref="BUS_1", location_type="BUS")
        assert loc.element_ref == "BUS_1"
        assert loc.location_type == "BUS"
        assert loc.position is None

    def test_fault_location_branch(self):
        """BRANCH location requires position."""
        loc = FaultLocation(element_ref="C1", location_type="BRANCH", position=0.5)
        assert loc.location_type == "BRANCH"
        assert loc.position == 0.5

    def test_fault_location_to_dict_roundtrip(self):
        """FaultLocation to_dict/from_dict roundtrip."""
        loc = FaultLocation(element_ref="BUS_1", location_type="BUS")
        restored = FaultLocation.from_dict(loc.to_dict())
        assert restored.element_ref == loc.element_ref
        assert restored.location_type == loc.location_type
        assert restored.position == loc.position

    def test_short_circuit_config_defaults(self):
        """Default ShortCircuitConfig values."""
        cfg = ShortCircuitConfig()
        assert cfg.c_factor == 1.10
        assert cfg.thermal_time_seconds == 1.0
        assert cfg.include_branch_contributions is False

    def test_short_circuit_config_roundtrip(self):
        """ShortCircuitConfig to_dict/from_dict roundtrip."""
        cfg = ShortCircuitConfig(c_factor=1.05, thermal_time_seconds=2.0)
        restored = ShortCircuitConfig.from_dict(cfg.to_dict())
        assert restored.c_factor == cfg.c_factor
        assert restored.thermal_time_seconds == cfg.thermal_time_seconds

    def test_fault_scenario_is_frozen(self):
        """FaultScenario is immutable."""
        scenario = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="BUS_1", location_type="BUS"),
        )
        with pytest.raises(AttributeError):
            scenario.fault_type = FaultType.SC_2F  # type: ignore[misc]

    def test_fault_scenario_analysis_type_derived(self):
        """analysis_type is derived from fault_type."""
        scenario = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="BUS_1", location_type="BUS"),
        )
        assert scenario.analysis_type == ExecutionAnalysisType.SC_3F

    def test_fault_scenario_to_dict_roundtrip(self):
        """FaultScenario to_dict/from_dict roundtrip."""
        scenario = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="BUS_MV", location_type="BUS"),
            config=ShortCircuitConfig(c_factor=1.05),
        )
        d = scenario.to_dict()
        restored = FaultScenario.from_dict(d)
        assert restored.scenario_id == scenario.scenario_id
        assert restored.fault_type == scenario.fault_type
        assert restored.content_hash == scenario.content_hash
        assert restored.location.element_ref == scenario.location.element_ref


# =============================================================================
# 2. CONTENT HASH DETERMINISM
# =============================================================================


class TestContentHashDeterminism:
    """Test SHA-256 content hash invariants."""

    def test_same_scenario_same_hash(self):
        """Identical parameters produce identical content_hash."""
        loc = FaultLocation(element_ref="BUS_1", location_type="BUS")
        cfg = ShortCircuitConfig(c_factor=1.10)

        s1 = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name="Hash test",
            fault_type=FaultType.SC_3F,
            location=loc,
            config=cfg,
        )
        s2 = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name="Hash test",
            fault_type=FaultType.SC_3F,
            location=loc,
            config=cfg,
        )
        assert s1.content_hash == s2.content_hash

    def test_different_fault_type_different_hash(self):
        """Different fault_type → different content_hash."""
        loc = FaultLocation(element_ref="BUS_1", location_type="BUS")
        s1 = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type=FaultType.SC_3F,
            location=loc,
        )
        s2 = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type=FaultType.SC_2F,
            location=loc,
        )
        assert s1.content_hash != s2.content_hash

    def test_different_location_different_hash(self):
        """Different location → different content_hash."""
        s1 = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="BUS_1", location_type="BUS"),
        )
        s2 = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="BUS_2", location_type="BUS"),
        )
        assert s1.content_hash != s2.content_hash

    def test_different_config_different_hash(self):
        """Different config → different content_hash."""
        loc = FaultLocation(element_ref="BUS_1", location_type="BUS")
        s1 = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type=FaultType.SC_3F,
            location=loc,
            config=ShortCircuitConfig(c_factor=1.10),
        )
        s2 = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type=FaultType.SC_3F,
            location=loc,
            config=ShortCircuitConfig(c_factor=1.05),
        )
        assert s1.content_hash != s2.content_hash

    def test_hash_is_sha256(self):
        """Content hash is a valid SHA-256 hex string."""
        scenario = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="B1", location_type="BUS"),
        )
        assert len(scenario.content_hash) == 64
        assert all(c in "0123456789abcdef" for c in scenario.content_hash)

    def test_hash_recompute_matches(self):
        """Recomputed hash matches stored hash."""
        scenario = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="B1", location_type="BUS"),
        )
        assert compute_scenario_content_hash(scenario) == scenario.content_hash

    def test_study_case_id_not_in_hash(self):
        """study_case_id does NOT affect content_hash (same physics)."""
        loc = FaultLocation(element_ref="B1", location_type="BUS")
        s1 = new_fault_scenario(
            study_case_id=uuid4(),
            name=DEFAULT_NAME,
            fault_type=FaultType.SC_3F,
            location=loc,
        )
        s2 = new_fault_scenario(
            study_case_id=uuid4(),
            name=DEFAULT_NAME,
            fault_type=FaultType.SC_3F,
            location=loc,
        )
        assert s1.content_hash == s2.content_hash


# =============================================================================
# 3. VALIDATION RULES
# =============================================================================


class TestValidation:
    """Test FaultScenario validation invariants."""

    def test_sc_1f_requires_z0(self):
        """SC_1F without z0_bus_data raises FaultScenarioValidationError."""
        with pytest.raises(FaultScenarioValidationError, match="impedancji zerowej"):
            new_fault_scenario(
                study_case_id=MOCK_CASE_ID,
                name=DEFAULT_NAME,
                fault_type=FaultType.SC_1F,
                location=FaultLocation(element_ref="BUS_1", location_type="BUS"),
            )

    def test_sc_1f_with_z0_passes(self):
        """SC_1F with z0_bus_data passes validation."""
        scenario = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type=FaultType.SC_1F,
            location=FaultLocation(element_ref="BUS_1", location_type="BUS"),
            z0_bus_data={"z0_11": 1.0},
        )
        assert scenario.fault_type == FaultType.SC_1F
        assert scenario.z0_bus_data is not None

    def test_bus_with_position_raises(self):
        """BUS location with position raises."""
        with pytest.raises(FaultScenarioValidationError, match="BUS nie może mieć pozycji"):
            new_fault_scenario(
                study_case_id=MOCK_CASE_ID,
                name=DEFAULT_NAME,
                fault_type=FaultType.SC_3F,
                location=FaultLocation(element_ref="B1", location_type="BUS", position=0.5),
            )

    def test_branch_without_position_raises(self):
        """BRANCH location without position raises."""
        with pytest.raises(FaultScenarioValidationError, match="wymaga pozycji"):
            new_fault_scenario(
                study_case_id=MOCK_CASE_ID,
                name=DEFAULT_NAME,
                fault_type=FaultType.SC_3F,
                location=FaultLocation(element_ref="C1", location_type="BRANCH"),
            )

    def test_branch_position_out_of_range_raises(self):
        """BRANCH position outside (0,1) raises."""
        with pytest.raises(FaultScenarioValidationError, match="zakresie"):
            new_fault_scenario(
                study_case_id=MOCK_CASE_ID,
                name=DEFAULT_NAME,
                fault_type=FaultType.SC_3F,
                location=FaultLocation(element_ref="C1", location_type="BRANCH", position=0.0),
            )

    def test_branch_position_at_1_raises(self):
        """BRANCH position = 1.0 raises (must be strictly < 1)."""
        with pytest.raises(FaultScenarioValidationError, match="zakresie"):
            new_fault_scenario(
                study_case_id=MOCK_CASE_ID,
                name=DEFAULT_NAME,
                fault_type=FaultType.SC_3F,
                location=FaultLocation(element_ref="C1", location_type="BRANCH", position=1.0),
            )

    def test_branch_valid_position_passes(self):
        """BRANCH location with valid position passes."""
        scenario = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="C1", location_type="BRANCH", position=0.5),
        )
        assert scenario.location.position == 0.5

    def test_negative_c_factor_raises(self):
        """Negative c_factor raises."""
        with pytest.raises(FaultScenarioValidationError, match="c_factor"):
            new_fault_scenario(
                study_case_id=MOCK_CASE_ID,
                name=DEFAULT_NAME,
                fault_type=FaultType.SC_3F,
                location=FaultLocation(element_ref="B1", location_type="BUS"),
                config=ShortCircuitConfig(c_factor=-1.0),
            )

    def test_zero_thermal_time_raises(self):
        """Zero thermal_time_seconds raises."""
        with pytest.raises(FaultScenarioValidationError, match="thermal_time"):
            new_fault_scenario(
                study_case_id=MOCK_CASE_ID,
                name=DEFAULT_NAME,
                fault_type=FaultType.SC_3F,
                location=FaultLocation(element_ref="B1", location_type="BUS"),
                config=ShortCircuitConfig(thermal_time_seconds=0.0),
            )

    def test_sc_3f_no_z0_passes(self):
        """SC_3F does not require z0_bus_data."""
        scenario = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="B1", location_type="BUS"),
        )
        assert scenario.z0_bus_data is None


# =============================================================================
# 4. FAULT SCENARIO SERVICE
# =============================================================================


class TestFaultScenarioService:
    """Test application-layer FaultScenarioService."""

    def test_create_and_get_scenario(self):
        """Create a scenario and retrieve it."""
        service = FaultScenarioService()
        scenario = service.create_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type="SC_3F",
            location={"element_ref": "BUS_MV", "location_type": "BUS"},
        )
        assert scenario.fault_type == FaultType.SC_3F
        assert scenario.content_hash != ""

        retrieved = service.get_scenario(scenario.scenario_id)
        assert retrieved.scenario_id == scenario.scenario_id

    def test_list_scenarios_sorted(self):
        """list_scenarios returns deterministically sorted list."""
        service = FaultScenarioService()
        service.create_scenario(
            study_case_id=MOCK_CASE_ID,
            name="Scenariusz B",
            fault_type="SC_2F",
            location={"element_ref": "BUS_B", "location_type": "BUS"},
        )
        service.create_scenario(
            study_case_id=MOCK_CASE_ID,
            name="Scenariusz A",
            fault_type="SC_3F",
            location={"element_ref": "BUS_A", "location_type": "BUS"},
        )
        service.create_scenario(
            study_case_id=MOCK_CASE_ID,
            name="Scenariusz C",
            fault_type="SC_2F",
            location={"element_ref": "BUS_A", "location_type": "BUS"},
        )

        scenarios = service.list_scenarios(MOCK_CASE_ID)
        keys = [(s.fault_type.value, s.location.element_ref) for s in scenarios]
        assert keys == sorted(keys)

    def test_delete_scenario(self):
        """Delete removes scenario from store."""
        service = FaultScenarioService()
        scenario = service.create_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type="SC_3F",
            location={"element_ref": "BUS_MV", "location_type": "BUS"},
        )
        service.delete_scenario(scenario.scenario_id)

        with pytest.raises(FaultScenarioNotFoundError):
            service.get_scenario(scenario.scenario_id)

    def test_delete_nonexistent_raises(self):
        """Delete nonexistent scenario raises."""
        service = FaultScenarioService()
        with pytest.raises(FaultScenarioNotFoundError):
            service.delete_scenario(uuid4())

    def test_duplicate_content_hash_raises(self):
        """Creating a scenario with duplicate content_hash raises."""
        service = FaultScenarioService()
        service.create_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type="SC_3F",
            location={"element_ref": "BUS_MV", "location_type": "BUS"},
        )
        with pytest.raises(FaultScenarioDuplicateError):
            service.create_scenario(
                study_case_id=MOCK_CASE_ID,
                name=DEFAULT_NAME,
                fault_type="SC_3F",
                location={"element_ref": "BUS_MV", "location_type": "BUS"},
            )

    def test_validate_scenario(self):
        """validate_scenario confirms invariants hold."""
        service = FaultScenarioService()
        scenario = service.create_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type="SC_3F",
            location={"element_ref": "BUS_MV", "location_type": "BUS"},
        )
        # Should not raise
        service.validate_scenario(scenario.scenario_id)

    def test_compute_hash_matches(self):
        """compute_hash recomputes and matches stored hash."""
        service = FaultScenarioService()
        scenario = service.create_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type="SC_3F",
            location={"element_ref": "BUS_MV", "location_type": "BUS"},
        )
        assert service.compute_hash(scenario.scenario_id) == scenario.content_hash

    def test_list_empty_case_returns_empty(self):
        """list_scenarios for nonexistent case returns empty list."""
        service = FaultScenarioService()
        assert service.list_scenarios(uuid4()) == []

    def test_create_with_config_override(self):
        """Custom config overrides defaults."""
        service = FaultScenarioService()
        scenario = service.create_scenario(
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type="SC_3F",
            location={"element_ref": "BUS_MV", "location_type": "BUS"},
            config={"c_factor": 0.95, "thermal_time_seconds": 2.0},
        )
        assert scenario.config.c_factor == 0.95
        assert scenario.config.thermal_time_seconds == 2.0


# =============================================================================
# 5. EXECUTION ENGINE INTEGRATION (execute_run_by_scenario)
# =============================================================================


class TestExecutionEngineScenarioIntegration:
    """Test execute_run_by_scenario via FaultScenario."""

    def test_sc_3f_via_scenario(self):
        """SC_3F execution via FaultScenario produces DONE + ResultSet."""
        graph = _create_golden_graph()
        engine, case = _create_engine_with_case()

        scenario = new_fault_scenario(
            study_case_id=case.id,
            name="Zwarcie 3F — BUS_MV",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="BUS_MV", location_type="BUS"),
        )

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input={"scenario_hash": scenario.content_hash},
        )

        done_run, rs = engine.execute_run_by_scenario(
            run.id,
            fault_scenario=scenario,
            graph=graph,
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        assert done_run.status == RunStatus.DONE
        assert rs.analysis_type == ExecutionAnalysisType.SC_3F
        assert rs.global_results["ikss_a"] > 0
        assert rs.global_results["ip_a"] > 0

    def test_sc_2f_via_scenario(self):
        """SC_2F execution via FaultScenario produces DONE."""
        graph = _create_golden_graph()
        engine, case = _create_engine_with_case()

        scenario = new_fault_scenario(
            study_case_id=case.id,
            name="Zwarcie 2F — BUS_MV",
            fault_type=FaultType.SC_2F,
            location=FaultLocation(element_ref="BUS_MV", location_type="BUS"),
        )

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_2F,
            solver_input={"scenario_hash": scenario.content_hash},
        )

        done_run, rs = engine.execute_run_by_scenario(
            run.id,
            fault_scenario=scenario,
            graph=graph,
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        assert done_run.status == RunStatus.DONE
        assert rs.global_results["ikss_a"] > 0

    def test_sc_1f_via_scenario_with_z0(self):
        """SC_1F execution via FaultScenario with Z0 produces DONE."""
        graph = _create_golden_graph()
        engine, case = _create_engine_with_case()

        builder = AdmittanceMatrixBuilder(graph)
        y_bus = builder.build()
        z1_bus = np.linalg.inv(y_bus)
        z0_bus = z1_bus * 3.0

        scenario = new_fault_scenario(
            study_case_id=case.id,
            name="Zwarcie 1F — BUS_MV",
            fault_type=FaultType.SC_1F,
            location=FaultLocation(element_ref="BUS_MV", location_type="BUS"),
            z0_bus_data={"placeholder": True},
        )

        run = engine.create_run(
            study_case_id=case.id,
            analysis_type=ExecutionAnalysisType.SC_1F,
            solver_input={"scenario_hash": scenario.content_hash},
        )

        done_run, rs = engine.execute_run_by_scenario(
            run.id,
            fault_scenario=scenario,
            graph=graph,
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
            z0_bus=z0_bus,
        )

        assert done_run.status == RunStatus.DONE
        assert rs.global_results["ikss_a"] > 0

    def test_scenario_determinism(self):
        """Two runs via same scenario produce identical results."""
        graph = _create_golden_graph()
        scenario = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name="Determinizm — BUS_MV",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="BUS_MV", location_type="BUS"),
        )

        engine_a, case_a = _create_engine_with_case()
        engine_b, case_b = _create_engine_with_case()

        run_a = engine_a.create_run(
            study_case_id=case_a.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input={"hash": scenario.content_hash},
        )
        run_b = engine_b.create_run(
            study_case_id=case_b.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input={"hash": scenario.content_hash},
        )

        _, rs_a = engine_a.execute_run_by_scenario(
            run_a.id,
            fault_scenario=scenario,
            graph=graph,
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )
        _, rs_b = engine_b.execute_run_by_scenario(
            run_b.id,
            fault_scenario=scenario,
            graph=graph,
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        assert rs_a.global_results == rs_b.global_results

    def test_3f_gt_2f_via_scenario(self):
        """IEC 60909: I_3F > I_2F at same fault node via scenarios."""
        graph = _create_golden_graph()

        scenario_3f = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name="Porównanie 3F",
            fault_type=FaultType.SC_3F,
            location=FaultLocation(element_ref="BUS_MV", location_type="BUS"),
        )
        scenario_2f = new_fault_scenario(
            study_case_id=MOCK_CASE_ID,
            name="Porównanie 2F",
            fault_type=FaultType.SC_2F,
            location=FaultLocation(element_ref="BUS_MV", location_type="BUS"),
        )

        engine_3f, case_3f = _create_engine_with_case()
        engine_2f, case_2f = _create_engine_with_case()

        run_3f = engine_3f.create_run(
            study_case_id=case_3f.id,
            analysis_type=ExecutionAnalysisType.SC_3F,
            solver_input={"hash": scenario_3f.content_hash},
        )
        run_2f = engine_2f.create_run(
            study_case_id=case_2f.id,
            analysis_type=ExecutionAnalysisType.SC_2F,
            solver_input={"hash": scenario_2f.content_hash},
        )

        _, rs_3f = engine_3f.execute_run_by_scenario(
            run_3f.id,
            fault_scenario=scenario_3f,
            graph=graph,
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )
        _, rs_2f = engine_2f.execute_run_by_scenario(
            run_2f.id,
            fault_scenario=scenario_2f,
            graph=graph,
            readiness_snapshot={"ready": True},
            validation_snapshot={"is_valid": True},
        )

        assert rs_3f.global_results["ikss_a"] > rs_2f.global_results["ikss_a"]


# =============================================================================
# 6. API ENDPOINT TESTS
# =============================================================================


class TestFaultScenarioApi:
    """Test fault scenario REST API endpoints."""

    @pytest.fixture
    def client(self):
        from api.main import app
        from fastapi.testclient import TestClient

        return TestClient(app)

    @pytest.fixture(autouse=True)
    def reset_service(self):
        """Reset service state between tests."""
        from api.fault_scenarios import get_fault_scenario_service

        service = get_fault_scenario_service()
        service._scenarios.clear()
        service._case_scenarios.clear()

    def test_create_scenario_success(self, client):
        """POST creates a fault scenario."""
        case_id = str(uuid4())
        response = client.post(
            f"/api/execution/study-cases/{case_id}/fault-scenarios",
            json={
                "name": DEFAULT_NAME,
                "fault_type": "SC_3F",
                "location": {
                    "element_ref": "BUS_MV",
                    "location_type": "BUS",
                },
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["fault_type"] == "SC_3F"
        assert data["analysis_type"] == "SC_3F"
        assert data["name"] == DEFAULT_NAME
        assert data["location"]["element_ref"] == "BUS_MV"
        assert len(data["content_hash"]) == 64

    def test_create_scenario_missing_name_returns_422(self, client):
        """POST without name returns 422 (Pydantic validation)."""
        response = client.post(
            f"/api/execution/study-cases/{uuid4()}/fault-scenarios",
            json={
                "fault_type": "SC_3F",
                "location": {"element_ref": "B1", "location_type": "BUS"},
            },
        )
        assert response.status_code == 422

    def test_create_scenario_empty_name_returns_422(self, client):
        """POST with empty name returns 422 (domain validation)."""
        response = client.post(
            f"/api/execution/study-cases/{uuid4()}/fault-scenarios",
            json={
                "name": "",
                "fault_type": "SC_3F",
                "location": {"element_ref": "B1", "location_type": "BUS"},
            },
        )
        assert response.status_code == 422
        assert "Nazwa scenariusza" in response.json()["detail"]

    def test_create_scenario_invalid_fault_type(self, client):
        """POST with invalid fault_type returns 400."""
        response = client.post(
            f"/api/execution/study-cases/{uuid4()}/fault-scenarios",
            json={
                "name": DEFAULT_NAME,
                "fault_type": "INVALID",
                "location": {"element_ref": "B1", "location_type": "BUS"},
            },
        )
        assert response.status_code == 400

    def test_create_scenario_sc1f_no_z0_returns_422(self, client):
        """POST SC_1F without z0_bus_data returns 422."""
        response = client.post(
            f"/api/execution/study-cases/{uuid4()}/fault-scenarios",
            json={
                "name": DEFAULT_NAME,
                "fault_type": "SC_1F",
                "location": {"element_ref": "B1", "location_type": "BUS"},
            },
        )
        assert response.status_code == 422
        assert "impedancji zerowej" in response.json()["detail"]

    def test_create_scenario_branch_no_position_returns_422(self, client):
        """POST BRANCH without position returns 422."""
        response = client.post(
            f"/api/execution/study-cases/{uuid4()}/fault-scenarios",
            json={
                "name": DEFAULT_NAME,
                "fault_type": "SC_3F",
                "location": {"element_ref": "C1", "location_type": "BRANCH"},
            },
        )
        assert response.status_code == 422

    def test_list_scenarios_empty(self, client):
        """GET returns empty list for new case."""
        response = client.get(f"/api/execution/study-cases/{uuid4()}/fault-scenarios")
        assert response.status_code == 200
        data = response.json()
        assert data["scenarios"] == []
        assert data["count"] == 0

    def test_list_scenarios_with_data(self, client):
        """GET returns created scenarios."""
        case_id = str(uuid4())
        client.post(
            f"/api/execution/study-cases/{case_id}/fault-scenarios",
            json={
                "name": "Scenariusz A",
                "fault_type": "SC_3F",
                "location": {"element_ref": "BUS_A", "location_type": "BUS"},
            },
        )
        client.post(
            f"/api/execution/study-cases/{case_id}/fault-scenarios",
            json={
                "name": "Scenariusz B",
                "fault_type": "SC_2F",
                "location": {"element_ref": "BUS_B", "location_type": "BUS"},
            },
        )

        response = client.get(f"/api/execution/study-cases/{case_id}/fault-scenarios")
        assert response.status_code == 200
        data = response.json()
        assert data["count"] == 2

    def test_delete_scenario_success(self, client):
        """DELETE removes a scenario."""
        case_id = str(uuid4())
        create_resp = client.post(
            f"/api/execution/study-cases/{case_id}/fault-scenarios",
            json={
                "name": DEFAULT_NAME,
                "fault_type": "SC_3F",
                "location": {"element_ref": "BUS_A", "location_type": "BUS"},
            },
        )
        scenario_id = create_resp.json()["scenario_id"]

        delete_resp = client.delete(f"/api/execution/fault-scenarios/{scenario_id}")
        assert delete_resp.status_code == 204

        # Verify gone
        list_resp = client.get(f"/api/execution/study-cases/{case_id}/fault-scenarios")
        assert list_resp.json()["count"] == 0

    def test_delete_scenario_not_found(self, client):
        """DELETE nonexistent scenario returns 404."""
        response = client.delete(f"/api/execution/fault-scenarios/{uuid4()}")
        assert response.status_code == 404

    def test_duplicate_scenario_returns_409(self, client):
        """POST duplicate scenario returns 409."""
        case_id = str(uuid4())
        client.post(
            f"/api/execution/study-cases/{case_id}/fault-scenarios",
            json={
                "name": DEFAULT_NAME,
                "fault_type": "SC_3F",
                "location": {"element_ref": "BUS_A", "location_type": "BUS"},
            },
        )
        response = client.post(
            f"/api/execution/study-cases/{case_id}/fault-scenarios",
            json={
                "name": DEFAULT_NAME,
                "fault_type": "SC_3F",
                "location": {"element_ref": "BUS_A", "location_type": "BUS"},
            },
        )
        assert response.status_code == 409


# =============================================================================
# 7. RESULTSET EXTENSION (v1.1)
# =============================================================================


class TestResultSetExtension:
    """Test PR-19 additive fields on ResultSet."""

    def test_resultset_without_scenario_fields(self):
        """Existing ResultSet works without fault_scenario fields."""
        from domain.execution import build_result_set

        rs = build_result_set(
            run_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={},
        )
        assert rs.fault_scenario_id is None
        assert rs.fault_type is None
        assert rs.fault_location is None

        # to_dict should not include None fields
        d = rs.to_dict()
        assert "fault_scenario_id" not in d
        assert "fault_type" not in d
        assert "fault_location" not in d

    def test_resultset_with_scenario_fields(self):
        """ResultSet with fault_scenario fields serializes correctly."""
        from domain.execution import build_result_set

        rs = build_result_set(
            run_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={},
            fault_scenario_id="abc-123",
            fault_type="SC_3F",
            fault_location={"element_ref": "BUS_1", "location_type": "BUS"},
        )
        assert rs.fault_scenario_id == "abc-123"
        assert rs.fault_type == "SC_3F"

        d = rs.to_dict()
        assert d["fault_scenario_id"] == "abc-123"
        assert d["fault_type"] == "SC_3F"
        assert d["fault_location"]["element_ref"] == "BUS_1"

    def test_resultset_roundtrip_with_scenario_fields(self):
        """ResultSet from_dict/to_dict roundtrip with fault fields."""
        from domain.execution import build_result_set

        rs = build_result_set(
            run_id=uuid4(),
            analysis_type=ExecutionAnalysisType.SC_3F,
            validation_snapshot={},
            readiness_snapshot={},
            element_results=[],
            global_results={},
            fault_scenario_id="xyz-456",
            fault_type="SC_2F",
            fault_location={"element_ref": "C1", "location_type": "BRANCH", "position": 0.5},
        )
        d = rs.to_dict()
        restored = ResultSet.from_dict(d)
        assert restored.fault_scenario_id == "xyz-456"
        assert restored.fault_type == "SC_2F"
        assert restored.fault_location["element_ref"] == "C1"
