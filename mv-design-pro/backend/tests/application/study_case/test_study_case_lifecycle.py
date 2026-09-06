"""
Study Case Lifecycle Tests — P10 FULL MAX

CANONICAL TEST COVERAGE:
1. CRUD operations (create, read, update, delete)
2. Clone operation (config copied, no results of its own)
3. Active case management (exactly one per project)
4. Compare operation (read-only)

STATUS WYNIKOW NIE JEST TU TESTOWANY, BO PRZYPADEK GO NIE PRZECHOWUJE (CV-2-W).
Dawne testy przejsc NONE → FRESH → OUTDATED sprawdzaly, ze setter ustawia to, co
ustawil — nie mialy jak wykryc defektu, ktory naprawde bolal: sciezke mutujaca
model, ktora zapomniala zawolac uniewazniacza. Ta sama INTENCJA („wynik policzony
przed zmiana modelu nie moze udawac aktualnego”) jest sprawdzana na REALNEJ
sciezce HTTP w `tests/api/test_status_wynikow_przypadku.py`.

All tests use Polish error messages per P10 requirements.
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest
from domain.study_case import (
    StudyCase,
    StudyCaseConfig,
    compare_study_cases,
    new_study_case,
)
from network_model.core.action_apply import apply_action_to_snapshot
from network_model.core.action_envelope import ActionEnvelope
from network_model.core.branch import Branch, BranchType
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.snapshot import (
    NetworkSnapshot,
    SnapshotMeta,
    SnapshotMutationError,
    snapshot_read_only_guard,
)
from network_model.sld_projection import project_snapshot_to_sld

# =============================================================================
# Domain Model Tests
# =============================================================================


class TestStudyCaseModel:
    """Test StudyCase domain model."""

    def test_new_study_case_nie_przechowuje_statusu_wynikow(self):
        """Nowy przypadek NIE niesie pola statusu — status jest funkcja biegow."""
        case = new_study_case(
            project_id=uuid4(),
            name="Test Case",
        )
        assert not hasattr(case, "result_status")
        assert not hasattr(case, "results_valid")
        assert not hasattr(case, "result_refs")

    def test_new_study_case_not_active_by_default(self):
        """New case should not be active by default."""
        case = new_study_case(
            project_id=uuid4(),
            name="Test Case",
        )
        assert case.is_active is False

    def test_new_study_case_with_active_flag(self):
        """Can create a new case as active."""
        case = new_study_case(
            project_id=uuid4(),
            name="Test Case",
            is_active=True,
        )
        assert case.is_active is True

    def test_study_case_default_config(self):
        """New case should have default configuration."""
        case = new_study_case(
            project_id=uuid4(),
            name="Test Case",
        )
        config = case.config
        assert config.c_factor_max == 1.10
        assert config.c_factor_min == 0.95
        assert config.base_mva == 100.0
        assert config.include_motor_contribution is True
        assert config.include_inverter_contribution is True

    def test_study_case_custom_config(self):
        """Can create case with custom configuration."""
        custom_config = StudyCaseConfig(
            c_factor_max=1.05,
            c_factor_min=1.00,
            base_mva=50.0,
        )
        case = new_study_case(
            project_id=uuid4(),
            name="Custom Case",
            config=custom_config,
        )
        assert case.config.c_factor_max == 1.05
        assert case.config.c_factor_min == 1.00
        assert case.config.base_mva == 50.0


class TestStudyCaseEdycja:
    """Edycja przypadku zmienia KONFIGURACJE i nic poza nia (CV-2-W)."""

    def test_zmiana_konfiguracji_nie_dotyka_statusu(self):
        """Po zmianie konfiguracji przypadek nadal nie ma pola statusu.

        Wersja sprzed CV-2-W przestawiala tu FRESH → OUTDATED; to bylo DRUGIE
        zrodlo prawdy o swiezosci obok rewizji modelu i odcisku katalogu.
        """
        case = new_study_case(uuid4(), "Test")
        updated = case.with_updated_config(StudyCaseConfig(c_factor_max=1.05))

        assert updated.config.c_factor_max == 1.05
        assert updated.revision == case.revision + 1
        assert not hasattr(updated, "result_status")

    def test_zmiana_nazwy_zachowuje_konfiguracje(self):
        case = new_study_case(uuid4(), "Test", config=StudyCaseConfig(c_factor_max=1.05))
        renamed = case.with_name("New Name")

        assert renamed.name == "New Name"
        assert renamed.config == case.config
        assert not hasattr(renamed, "result_status")


class TestStudyCaseClone:
    """Test case cloning behavior."""

    def test_clone_copies_config(self):
        """Clone should copy configuration."""
        original = new_study_case(
            uuid4(),
            "Original",
            config=StudyCaseConfig(c_factor_max=1.05),
        )
        cloned = original.clone()

        assert cloned.config.c_factor_max == original.config.c_factor_max

    def test_clone_nie_dziedziczy_wynikow(self):
        """Klon nie przejmuje zadnych wynikow.

        Nie ma juz czego "nie kopiowac": klon to NOWY przypadek, wiec nie ma
        wlasnych biegow, a jego status wychodzi NONE z derywacji (pin przez HTTP:
        `tests/api/test_status_wynikow_przypadku.py`). Tu sprawdzamy strukture:
        klon nie niesie zadnego pola wynikowego, ktore moglby odziedziczyc.
        """
        original = new_study_case(uuid4(), "Original")
        cloned = original.clone()

        assert not hasattr(cloned, "result_refs")
        assert not hasattr(cloned, "result_status")
        assert cloned.id != original.id

    def test_clone_is_not_active(self):
        """Clone should NOT be active."""
        original = new_study_case(uuid4(), "Original", is_active=True)
        assert original.is_active is True

        cloned = original.clone()

        assert cloned.is_active is False

    def test_clone_has_new_id(self):
        """Clone should have a new unique ID."""
        original = new_study_case(uuid4(), "Original")
        cloned = original.clone()

        assert cloned.id != original.id

    def test_clone_with_custom_name(self):
        """Can specify custom name for clone."""
        original = new_study_case(uuid4(), "Original")
        cloned = original.clone(new_name="My Clone")

        assert cloned.name == "My Clone"

    def test_clone_default_name(self):
        """Clone without name gets '(kopia)' suffix."""
        original = new_study_case(uuid4(), "Original")
        cloned = original.clone()

        assert cloned.name == "Original (kopia)"


def _build_sample_snapshot() -> NetworkSnapshot:
    graph = NetworkGraph(network_model_id="model-1")
    slack_node = Node(
        id="node-a",
        name="Slack",
        node_type=NodeType.SLACK,
        voltage_level=15.0,
        voltage_magnitude=1.0,
        voltage_angle=0.0,
    )
    pq_node = Node(
        id="node-b",
        name="Load",
        node_type=NodeType.PQ,
        voltage_level=15.0,
        active_power=0.0,
        reactive_power=0.0,
    )
    graph.add_node(slack_node)
    graph.add_node(pq_node)
    branch = Branch.from_dict(
        {
            "id": "branch-1",
            "name": "Line-1",
            "branch_type": BranchType.LINE,
            "from_node_id": "node-a",
            "to_node_id": "node-b",
            "r_ohm_per_km": 0.1,
            "x_ohm_per_km": 0.2,
            "length_km": 1.0,
            "rated_current_a": 400.0,
        }
    )
    graph.add_branch(branch)
    meta = SnapshotMeta.create(network_model_id="model-1")
    return NetworkSnapshot(meta=meta, graph=graph)


class TestStudyCaseImmutability:
    """Immutability checks for case-related snapshot usage."""

    def test_case_does_not_mutate_snapshot_in_place(self):
        snapshot = _build_sample_snapshot()
        with snapshot_read_only_guard(snapshot, operation="test_case_does_not_mutate"):
            diagram = project_snapshot_to_sld(snapshot)
        assert diagram.snapshot_id == snapshot.meta.snapshot_id

    def test_case_actions_produce_new_snapshot_id(self):
        snapshot = _build_sample_snapshot()
        action = ActionEnvelope(
            action_id="action-1",
            parent_snapshot_id=snapshot.meta.snapshot_id,
            action_type="set_in_service",
            payload={"entity_id": "branch-1", "in_service": False},
            created_at=datetime.now(UTC).isoformat(),
            status="accepted",
        )
        new_snapshot = apply_action_to_snapshot(snapshot, action)
        assert new_snapshot.meta.snapshot_id != snapshot.meta.snapshot_id
        assert new_snapshot.meta.parent_snapshot_id == snapshot.meta.snapshot_id

    def test_case_read_only_guard_raises_on_mutation(self):
        snapshot = _build_sample_snapshot()
        with pytest.raises(SnapshotMutationError):
            with snapshot_read_only_guard(snapshot, operation="test_case_mutation_guard"):
                snapshot.graph.nodes["node-a"].name = "Zmieniony"


class TestStudyCaseCompare:
    """Test case comparison functionality."""

    def test_compare_identical_cases(self):
        """Comparing identical configs shows no differences."""
        project_id = uuid4()
        case_a = new_study_case(project_id, "Case A")
        case_b = new_study_case(project_id, "Case B")

        comparison = compare_study_cases(case_a, case_b)

        assert len(comparison.config_differences) == 0

    def test_compare_different_c_factor(self):
        """Comparing different c_factor shows difference."""
        project_id = uuid4()
        case_a = new_study_case(
            project_id,
            "Case A",
            config=StudyCaseConfig(c_factor_max=1.10),
        )
        case_b = new_study_case(
            project_id,
            "Case B",
            config=StudyCaseConfig(c_factor_max=1.05),
        )

        comparison = compare_study_cases(case_a, case_b)

        # Should have one difference: c_factor_max
        diff_fields = [d[0] for d in comparison.config_differences]
        assert "c_factor_max" in diff_fields

    def test_compare_nie_orzeka_o_statusie_wynikow(self):
        """Porownanie domenowe nie niesie statusow — dokleja je warstwa API z
        derywacji (pin: `tests/api/test_status_wynikow_przypadku.py::
        test_wszystkie_odpowiedzi_z_przypadkiem_daja_ten_sam_werdykt`). Dwa
        niezalezne zrodla statusu w jednej odpowiedzi to defekt czekajacy na dane
        brzegowe, a nie wygoda."""
        project_id = uuid4()
        comparison = compare_study_cases(
            new_study_case(project_id, "Case A"), new_study_case(project_id, "Case B")
        )

        assert not hasattr(comparison, "status_a")
        assert "status_a" not in comparison.to_dict()
        assert "status_b" not in comparison.to_dict()

    def test_compare_is_readonly(self):
        """Comparison does not modify original cases."""
        project_id = uuid4()
        case_a = new_study_case(project_id, "Case A")
        case_b = new_study_case(project_id, "Case B")

        original_a_id = case_a.id
        original_b_id = case_b.id

        _comparison = compare_study_cases(case_a, case_b)

        # Original cases should be unchanged
        assert case_a.id == original_a_id
        assert case_b.id == original_b_id


class TestStudyCaseActivation:
    """Test active case management."""

    def test_mark_as_active(self):
        """Can mark a case as active."""
        case = new_study_case(uuid4(), "Test", is_active=False)
        assert case.is_active is False

        active_case = case.mark_as_active()
        assert active_case.is_active is True

    def test_mark_as_inactive(self):
        """Can mark a case as inactive."""
        case = new_study_case(uuid4(), "Test", is_active=True)
        assert case.is_active is True

        inactive_case = case.mark_as_inactive()
        assert inactive_case.is_active is False


class TestStudyCaseConfig:
    """Test configuration dataclass."""

    def test_config_to_dict(self):
        """Config can be serialized to dict."""
        config = StudyCaseConfig()
        data = config.to_dict()

        assert "c_factor_max" in data
        assert "c_factor_min" in data
        assert "base_mva" in data
        assert data["c_factor_max"] == 1.10

    def test_config_from_dict(self):
        """Config can be deserialized from dict."""
        data = {
            "c_factor_max": 1.05,
            "c_factor_min": 0.90,
            "base_mva": 50.0,
        }
        config = StudyCaseConfig.from_dict(data)

        assert config.c_factor_max == 1.05
        assert config.c_factor_min == 0.90
        assert config.base_mva == 50.0

    def test_config_from_dict_with_defaults(self):
        """Missing fields in dict get default values."""
        data = {"c_factor_max": 1.05}
        config = StudyCaseConfig.from_dict(data)

        assert config.c_factor_max == 1.05
        # Defaults for missing fields
        assert config.c_factor_min == 0.95
        assert config.base_mva == 100.0


class TestStudyCaseSerialization:
    """Test case serialization/deserialization."""

    def test_to_dict(self):
        """Case can be serialized to dict."""
        case = new_study_case(uuid4(), "Test Case", description="Test description")
        data = case.to_dict()

        assert data["name"] == "Test Case"
        assert data["description"] == "Test description"
        assert data["is_active"] is False
        assert "config" in data
        # Serializacja domenowa NIE orzeka o statusie wynikow — dokleja go API.
        assert "result_status" not in data
        assert "results_valid" not in data

    def test_from_dict(self):
        """Case can be deserialized from dict."""
        original = new_study_case(uuid4(), "Test Case")
        data = original.to_dict()

        restored = StudyCase.from_dict(data)

        assert restored.id == original.id
        assert restored.name == original.name
        assert restored.config == original.config


# =============================================================================
# Invariant Tests
# =============================================================================


class TestStudyCaseInvariants:
    """Test P10 invariants."""

    def test_case_is_configuration_only(self):
        """Case contains only configuration, no network data."""
        case = new_study_case(uuid4(), "Test")

        # Case should have config
        assert hasattr(case, "config")
        assert isinstance(case.config, StudyCaseConfig)

        # Case should NOT have network topology fields
        assert not hasattr(case, "nodes")
        assert not hasattr(case, "branches")
        assert not hasattr(case, "network_graph")

    def test_case_nie_przechowuje_wynikow_ani_ich_statusu(self):
        """Przypadek to KONFIGURACJA: ani wynikow, ani plakietki o nich (CV-2-W)."""
        case = new_study_case(uuid4(), "Test")

        assert not hasattr(case, "result_status")
        assert not hasattr(case, "results_valid")
        assert not hasattr(case, "result_refs")

    def test_case_is_immutable(self):
        """Case is frozen (immutable)."""
        case = new_study_case(uuid4(), "Test")

        with pytest.raises(Exception):  # FrozenInstanceError
            case.name = "New Name"

    def test_revision_increments_on_update(self):
        """Revision increments when case is updated."""
        case = new_study_case(uuid4(), "Test")
        assert case.revision == 1

        updated = case.with_name("New Name")
        assert updated.revision == 2
