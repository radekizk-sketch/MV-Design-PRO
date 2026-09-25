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

import pytest
from application.fault_scenario_service import (
    FaultScenarioDuplicateError,
    FaultScenarioHasRunsError,
    FaultScenarioNotFoundError,
    FaultScenarioService,
)
from domain.execution import (
    ExecutionAnalysisType,
    ResultSet,
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

# =============================================================================
# Fixtures
# =============================================================================

MOCK_CASE_ID = uuid4()

# Default test scenario name (Polish, user-facing).
DEFAULT_NAME = "Zwarcie testowe"


def _klucz() -> str:
    """Klucz magazynu scenariuszy — świeży per wywołanie (karta C6-PERSIST):
    `FaultScenarioService` jest bezstanowy, więc izolacja testów nie wymaga
    resetu magazynu, tylko klucza, który żaden inny test nie mógł jeszcze
    dotknąć (`enm/scenariusze.py` partycjonuje magazyn WYŁĄCZNIE po kluczu)."""
    return f"pr19-fault-svc-{uuid4()}"


# Historia: golden graf `_create_golden_graph()` i pomocnik silnika
# `_create_engine_with_case()` (surowy `network_model.core.graph.NetworkGraph`
# + `ExecutionEngineService.execute_run_by_scenario`) zdjete karta CV-3.3-A
# (2026-09-05) razem z E3 (`application/execution_engine/**`, zero konsumenta
# produkcyjnego) — jedyny konsument obu pomocnikow, klasa
# `TestExecutionEngineScenarioIntegration`, tez zdjeta (patrz sekcja 5 nizej).
# Fizyka (SC3F/SC2F/SC1F przez scenariusz zwarciowy, determinizm, 3F>2F) ma
# rownowazny dowod na torze kanonicznym: `tests/test_fault_scenarios_run_integration.py`
# (`create_run_from_scenario`, karta CV-1-W/C6-PERSIST, POST /fault-scenarios/{id}/runs)
# oraz `tests/enm/test_short_circuit_migracja_e3_golden.py` (migracja E3, ta karta).


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
    """Test application-layer FaultScenarioService (magazyn scenariuszy, karta C6-PERSIST).

    Serwis jest bezstanowy — każda metoda dostaje `klucz` magazynu jawnie
    (parytet z `enm.canonical_analysis.create_run(klucz_twin=...)`). Testy
    poniżej NIE resetują magazynu między sobą — izolacja idzie przez klucz
    świeży per test (`_klucz()`), zgodnie z partycjonowaniem magazynu.
    """

    def test_create_and_get_scenario(self):
        """Create a scenario and retrieve it."""
        service = FaultScenarioService()
        klucz = _klucz()
        scenario = service.create_scenario(
            klucz=klucz,
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type="SC_3F",
            location={"element_ref": "BUS_MV", "location_type": "BUS"},
        )
        assert scenario.fault_type == FaultType.SC_3F
        assert scenario.content_hash != ""

        retrieved = service.get_scenario(klucz, scenario.scenario_id)
        assert retrieved.scenario_id == scenario.scenario_id

    def test_list_scenarios_sorted(self):
        """list_scenarios returns deterministically sorted list."""
        service = FaultScenarioService()
        klucz = _klucz()
        service.create_scenario(
            klucz=klucz,
            study_case_id=MOCK_CASE_ID,
            name="Scenariusz B",
            fault_type="SC_2F",
            location={"element_ref": "BUS_B", "location_type": "BUS"},
        )
        service.create_scenario(
            klucz=klucz,
            study_case_id=MOCK_CASE_ID,
            name="Scenariusz A",
            fault_type="SC_3F",
            location={"element_ref": "BUS_A", "location_type": "BUS"},
        )
        service.create_scenario(
            klucz=klucz,
            study_case_id=MOCK_CASE_ID,
            name="Scenariusz C",
            fault_type="SC_2F",
            location={"element_ref": "BUS_A", "location_type": "BUS"},
        )

        scenarios = service.list_scenarios(klucz, MOCK_CASE_ID)
        keys = [(s.fault_type.value, s.location.element_ref) for s in scenarios]
        assert keys == sorted(keys)

    def test_delete_scenario(self):
        """Delete removes scenario from store."""
        service = FaultScenarioService()
        klucz = _klucz()
        scenario = service.create_scenario(
            klucz=klucz,
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type="SC_3F",
            location={"element_ref": "BUS_MV", "location_type": "BUS"},
        )
        service.delete_scenario(klucz, scenario.scenario_id)

        with pytest.raises(FaultScenarioNotFoundError):
            service.get_scenario(klucz, scenario.scenario_id)

    def test_delete_nonexistent_raises(self):
        """Delete nonexistent scenario raises."""
        service = FaultScenarioService()
        with pytest.raises(FaultScenarioNotFoundError):
            service.delete_scenario(_klucz(), uuid4())

    def test_duplicate_content_hash_raises(self):
        """Creating a scenario with duplicate content_hash raises."""
        service = FaultScenarioService()
        klucz = _klucz()
        service.create_scenario(
            klucz=klucz,
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type="SC_3F",
            location={"element_ref": "BUS_MV", "location_type": "BUS"},
        )
        with pytest.raises(FaultScenarioDuplicateError):
            service.create_scenario(
                klucz=klucz,
                study_case_id=MOCK_CASE_ID,
                name=DEFAULT_NAME,
                fault_type="SC_3F",
                location={"element_ref": "BUS_MV", "location_type": "BUS"},
            )

    def test_validate_scenario(self):
        """validate_scenario confirms invariants hold."""
        service = FaultScenarioService()
        klucz = _klucz()
        scenario = service.create_scenario(
            klucz=klucz,
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type="SC_3F",
            location={"element_ref": "BUS_MV", "location_type": "BUS"},
        )
        # Should not raise
        service.validate_scenario(klucz, scenario.scenario_id)

    def test_compute_hash_matches(self):
        """compute_hash recomputes and matches stored hash."""
        service = FaultScenarioService()
        klucz = _klucz()
        scenario = service.create_scenario(
            klucz=klucz,
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type="SC_3F",
            location={"element_ref": "BUS_MV", "location_type": "BUS"},
        )
        assert service.compute_hash(klucz, scenario.scenario_id) == scenario.content_hash

    def test_list_empty_case_returns_empty(self):
        """list_scenarios for nonexistent case returns empty list."""
        service = FaultScenarioService()
        assert service.list_scenarios(_klucz(), uuid4()) == []

    def test_create_with_config_override(self):
        """Custom config overrides defaults."""
        service = FaultScenarioService()
        scenario = service.create_scenario(
            klucz=_klucz(),
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type="SC_3F",
            location={"element_ref": "BUS_MV", "location_type": "BUS"},
            config={"c_factor": 0.95, "thermal_time_seconds": 2.0},
        )
        assert scenario.config.c_factor == 0.95
        assert scenario.config.thermal_time_seconds == 2.0

    # -------------------------------------------------------------------
    # Karta C6-PERSIST — testy klasy (trwałość, rewizje magazynu)
    # -------------------------------------------------------------------

    def test_restart_procesu_nie_gubi_scenariuszy(self):
        """(a) Nowy obiekt serwisu (restart procesu), TEN SAM magazyn na dysku
        -> scenariusz nadal czytelny. Dowód, że treść żyje w magazynie
        (`enm/scenariusze.py`), nie w atrybucie instancji `FaultScenarioService`."""
        klucz = _klucz()
        pierwszy = FaultScenarioService()
        scenario = pierwszy.create_scenario(
            klucz=klucz,
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type="SC_3F",
            location={"element_ref": "BUS_MV", "location_type": "BUS"},
        )

        drugi = FaultScenarioService()  # symuluje restart procesu backendu
        odczytany = drugi.get_scenario(klucz, scenario.scenario_id)
        assert odczytany.scenario_id == scenario.scenario_id
        assert odczytany.content_hash == scenario.content_hash
        assert drugi.list_scenarios(klucz, MOCK_CASE_ID) == [odczytany]

    def test_update_tworzy_nowa_rewizje_w_magazynie(self):
        """(b) Update = nowa rewizja w magazynie; brak zmiany = brak rewizji."""
        from enm.scenariusze import stan_scenariusza

        service = FaultScenarioService()
        klucz = _klucz()
        scenario = service.create_scenario(
            klucz=klucz,
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type="SC_3F",
            location={"element_ref": "BUS_MV", "location_type": "BUS"},
        )
        assert stan_scenariusza(klucz, str(scenario.scenario_id)).rewizja == 1

        updated = service.update_scenario(klucz, scenario.scenario_id, name="Nazwa po zmianie")
        assert updated.content_hash != scenario.content_hash
        assert stan_scenariusza(klucz, str(scenario.scenario_id)).rewizja == 2

        # Update BEZ żadnego pola: content_hash bez zmian -> magazyn NIE
        # zapisuje nowej rewizji („brak zmiany" nie jest zmianą).
        service.update_scenario(klucz, scenario.scenario_id)
        assert stan_scenariusza(klucz, str(scenario.scenario_id)).rewizja == 2

    def test_delete_z_powiazanym_biegiem_wyprowadzone_z_koperty(self):
        """(c) Usunięcie scenariusza z istniejącym biegiem = błąd, wyprowadzony
        z koperty biegu kanonicznego (nie z osobnego rejestru — `register_run`
        nie istnieje już w tym serwisie)."""
        from enm.canonical_analysis import create_run
        from enm.scenariusze import OperatingScenario, RodzajScenariusza
        from enm.store import set_enm

        from tests.cgmes.golden_enm import build_golden_enm

        service = FaultScenarioService()
        klucz = _klucz()
        case_id = str(MOCK_CASE_ID)
        set_enm(klucz, build_golden_enm())

        scenario = service.create_scenario(
            klucz=klucz,
            study_case_id=MOCK_CASE_ID,
            name=DEFAULT_NAME,
            fault_type="SC_3F",
            location={"element_ref": "bus_sn_main", "location_type": "BUS"},
        )
        assert service.has_associated_runs(MOCK_CASE_ID, scenario.scenario_id) is False

        wpis = OperatingScenario(
            scenario_id=str(scenario.scenario_id),
            name=scenario.name,
            kind=RodzajScenariusza.FAULT_STUDY,
            fault_spec=scenario,
        )
        create_run(
            case_id=case_id,
            klucz_twin=klucz,
            analysis_type="short_circuit_sn",
            scenariusz=wpis,
        )

        assert service.has_associated_runs(MOCK_CASE_ID, scenario.scenario_id) is True
        with pytest.raises(FaultScenarioHasRunsError):
            service.delete_scenario(klucz, scenario.scenario_id)


# =============================================================================
# 5. EXECUTION ENGINE INTEGRATION (execute_run_by_scenario) — USUNIETA
# =============================================================================
# Klasa `TestExecutionEngineScenarioIntegration` (SC3F/SC2F/SC1F/determinizm/
# 3F>2F przez `ExecutionEngineService.execute_run_by_scenario`) skasowana
# karta CV-3.3-A (2026-09-05) razem z E3. Uzasadnienie i wskazanie dowodu
# zastepczego — patrz uwaga historyczna przy dawnych pomocnikach
# `_create_golden_graph`/`_create_engine_with_case` (poczatek pliku).


# =============================================================================
# 6. API ENDPOINT TESTS
# =============================================================================


class TestFaultScenarioApi:
    """Test fault scenario REST API endpoints.

    Karta C6-PERSIST: scenariusze żyją w magazynie per PROJEKT (klucz Canonical
    Project Twin), więc każda końcówka `study-cases/{case_id}/...` wymaga
    RZECZYWISTEGO przypadku w bazie (`klucz_twin_z_sciezki` odmawia 404 dla
    `case_id`, którego nie ma w bazie) — `case_id = str(uuid4())` swobodny,
    jak przed tą kartą, przestał być reprezentatywny. `client` wchodzi w
    `with` (lifespan), bo bez niego `app.state.uow_factory` nie jest związany
    i TO tłumaczenie kończy się 404 niezależnie od treści żądania.
    """

    @pytest.fixture
    def client(self):
        from api.main import app
        from fastapi.testclient import TestClient

        with TestClient(app) as test_client:
            yield test_client

    @pytest.fixture(autouse=True)
    def reset_enm(self):
        """Reset magazynu ENM (razem ze scenariuszami — `usun_wszystkie_scenariusze`
        jest wołane wewnątrz `reset_enm_store`, jeden cykl życia)."""
        from enm.store import reset_enm_store

        reset_enm_store()
        yield
        reset_enm_store()

    def _nowy_przypadek(self, client) -> str:
        """Utwórz REALNY projekt + przypadek przez API; zwróć `case_id`."""
        project_resp = client.post(
            "/api/projects", json={"name": "PR-19 fault scenario API — test"}
        )
        assert project_resp.status_code == 201, project_resp.text
        case_resp = client.post(
            "/api/study-cases",
            json={"project_id": project_resp.json()["id"], "name": "Przypadek testu"},
        )
        assert case_resp.status_code == 201, case_resp.text
        return str(case_resp.json()["id"])

    def test_create_scenario_success(self, client):
        """POST creates a fault scenario."""
        case_id = self._nowy_przypadek(client)
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
        assert data["revision"] == 1

    def test_create_scenario_missing_name_returns_422(self, client):
        """POST without name returns 422 (Pydantic validation)."""
        case_id = self._nowy_przypadek(client)
        response = client.post(
            f"/api/execution/study-cases/{case_id}/fault-scenarios",
            json={
                "fault_type": "SC_3F",
                "location": {"element_ref": "B1", "location_type": "BUS"},
            },
        )
        assert response.status_code == 422

    def test_create_scenario_empty_name_returns_422(self, client):
        """POST with empty name returns 422 (domain validation)."""
        case_id = self._nowy_przypadek(client)
        response = client.post(
            f"/api/execution/study-cases/{case_id}/fault-scenarios",
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
        case_id = self._nowy_przypadek(client)
        response = client.post(
            f"/api/execution/study-cases/{case_id}/fault-scenarios",
            json={
                "name": DEFAULT_NAME,
                "fault_type": "INVALID",
                "location": {"element_ref": "B1", "location_type": "BUS"},
            },
        )
        assert response.status_code == 400

    def test_create_scenario_sc1f_no_z0_returns_422(self, client):
        """POST SC_1F without z0_bus_data returns 422."""
        case_id = self._nowy_przypadek(client)
        response = client.post(
            f"/api/execution/study-cases/{case_id}/fault-scenarios",
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
        case_id = self._nowy_przypadek(client)
        response = client.post(
            f"/api/execution/study-cases/{case_id}/fault-scenarios",
            json={
                "name": DEFAULT_NAME,
                "fault_type": "SC_3F",
                "location": {"element_ref": "C1", "location_type": "BRANCH"},
            },
        )
        assert response.status_code == 422

    def test_list_scenarios_empty(self, client):
        """GET returns empty list for new case."""
        case_id = self._nowy_przypadek(client)
        response = client.get(f"/api/execution/study-cases/{case_id}/fault-scenarios")
        assert response.status_code == 200
        data = response.json()
        assert data["scenarios"] == []
        assert data["count"] == 0

    def test_list_scenarios_with_data(self, client):
        """GET returns created scenarios."""
        case_id = self._nowy_przypadek(client)
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
        case_id = self._nowy_przypadek(client)
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
        case_id = self._nowy_przypadek(client)
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
