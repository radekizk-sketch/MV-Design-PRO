"""
Testy jednostkowe dla modułu Station.

Testy obejmują:
- Tworzenie stacji z różnymi typami
- Operacje dodawania/usuwania elementów
- Serializacja i deserializacja
- Walidacja stacji
- Integracja z NetworkGraph

UWAGA: Station jest TYLKO kontenerem logicznym - nie ma fizyki!
"""

import sys
from pathlib import Path

import pytest

# Add backend/src to path for imports
backend_src = Path(__file__).parent.parent / "src"
sys.path.insert(0, str(backend_src))

from network_model.core.branch import BranchType, LineBranch
from network_model.core.graph import NetworkGraph
from network_model.core.node import Node, NodeType
from network_model.core.station import Station, StationType
from network_model.core.switch import Switch, SwitchState

# =============================================================================
# Helper functions for creating test objects
# =============================================================================


def create_station(
    station_id: str,
    name: str = "Test Station",
    station_type: StationType = StationType.MAIN_SUBSTATION,
    voltage_level_kv: float = 110.0,
) -> Station:
    """Tworzy stację do testów."""
    return Station(
        id=station_id,
        name=name,
        station_type=station_type,
        voltage_level_kv=voltage_level_kv,
    )


def create_pq_node(
    node_id: str,
    name: str = "PQ Node",
    voltage_level: float = 20.0,
) -> Node:
    """Tworzy poprawny węzeł PQ do testów."""
    return Node(
        id=node_id,
        name=name,
        node_type=NodeType.PQ,
        voltage_level=voltage_level,
        active_power=10.0,
        reactive_power=5.0,
    )


def create_line_branch(
    branch_id: str,
    from_node_id: str,
    to_node_id: str,
) -> LineBranch:
    """Tworzy poprawną gałąź liniową do testów."""
    return LineBranch(
        id=branch_id,
        name="Line Branch",
        branch_type=BranchType.LINE,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        r_ohm_per_km=0.2,
        x_ohm_per_km=0.4,
        b_us_per_km=5.0,
        length_km=10.0,
        rated_current_a=200.0,
    )


def create_switch(
    switch_id: str,
    from_node_id: str,
    to_node_id: str,
) -> Switch:
    """Tworzy poprawny łącznik do testów."""
    return Switch(
        id=switch_id,
        name="Switch",
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        state=SwitchState.CLOSED,
    )


# =============================================================================
# Test: Station creation and types
# =============================================================================


class TestStationCreation:
    """Testy tworzenia stacji."""

    def test_create_main_substation(self):
        """Utworzenie stacji GPZ."""
        station = create_station(
            "GPZ1",
            "GPZ Główny",
            StationType.MAIN_SUBSTATION,
            110.0,
        )

        assert station.id == "GPZ1"
        assert station.name == "GPZ Główny"
        assert station.station_type == StationType.MAIN_SUBSTATION
        assert station.voltage_level_kv == 110.0
        assert station.bus_ids == []
        assert station.branch_ids == []
        assert station.switch_ids == []

    def test_create_distribution_station(self):
        """Utworzenie stacji RPZ."""
        station = create_station(
            "RPZ1",
            "RPZ Wschód",
            StationType.DISTRIBUTION,
            15.0,
        )

        assert station.station_type == StationType.DISTRIBUTION

    def test_create_transformer_station(self):
        """Utworzenie stacji transformatorowej."""
        station = create_station(
            "TRAFO1",
            "Stacja T1",
            StationType.TRANSFORMER,
            0.4,
        )

        assert station.station_type == StationType.TRANSFORMER

    def test_create_switching_station(self):
        """Utworzenie punktu rozłącznikowego."""
        station = create_station(
            "SW1",
            "Punkt rozłącznikowy",
            StationType.SWITCHING,
            20.0,
        )

        assert station.station_type == StationType.SWITCHING

    def test_station_type_from_string(self):
        """Konwersja typu stacji ze stringa."""
        station = Station(
            id="S1",
            name="Station",
            station_type="GPZ",  # type: ignore
            voltage_level_kv=110.0,
        )

        assert station.station_type == StationType.MAIN_SUBSTATION


# =============================================================================
# Test: Station element management
# =============================================================================


class TestStationElementManagement:
    """Testy zarządzania elementami stacji."""

    def test_add_bus_to_station(self):
        """Dodanie węzła do stacji."""
        station = create_station("S1")

        station.add_bus("BUS1")
        station.add_bus("BUS2")

        assert "BUS1" in station.bus_ids
        assert "BUS2" in station.bus_ids
        assert len(station.bus_ids) == 2

    def test_add_bus_idempotent(self):
        """Dodanie tego samego węzła dwa razy nie duplikuje."""
        station = create_station("S1")

        station.add_bus("BUS1")
        station.add_bus("BUS1")

        assert station.bus_ids.count("BUS1") == 1

    def test_remove_bus_from_station(self):
        """Usunięcie węzła ze stacji."""
        station = create_station("S1")
        station.add_bus("BUS1")
        station.add_bus("BUS2")

        station.remove_bus("BUS1")

        assert "BUS1" not in station.bus_ids
        assert "BUS2" in station.bus_ids

    def test_remove_nonexistent_bus_is_noop(self):
        """Usunięcie nieistniejącego węzła jest no-op."""
        station = create_station("S1")
        station.add_bus("BUS1")

        station.remove_bus("NONEXISTENT")

        assert "BUS1" in station.bus_ids

    def test_add_branch_to_station(self):
        """Dodanie gałęzi do stacji."""
        station = create_station("S1")

        station.add_branch("BR1")
        station.add_branch("BR2")

        assert "BR1" in station.branch_ids
        assert "BR2" in station.branch_ids

    def test_remove_branch_from_station(self):
        """Usunięcie gałęzi ze stacji."""
        station = create_station("S1")
        station.add_branch("BR1")

        station.remove_branch("BR1")

        assert "BR1" not in station.branch_ids

    def test_add_switch_to_station(self):
        """Dodanie łącznika do stacji."""
        station = create_station("S1")

        station.add_switch("SW1")

        assert "SW1" in station.switch_ids

    def test_remove_switch_from_station(self):
        """Usunięcie łącznika ze stacji."""
        station = create_station("S1")
        station.add_switch("SW1")

        station.remove_switch("SW1")

        assert "SW1" not in station.switch_ids


# =============================================================================
# Test: Station contains element check
# =============================================================================


class TestStationContains:
    """Testy sprawdzania przynależności elementu do stacji."""

    def test_contains_bus(self):
        """Sprawdzenie czy stacja zawiera węzeł."""
        station = create_station("S1")
        station.add_bus("BUS1")

        assert station.contains("BUS1") is True
        assert station.contains("BUS2") is False

    def test_contains_branch(self):
        """Sprawdzenie czy stacja zawiera gałąź."""
        station = create_station("S1")
        station.add_branch("BR1")

        assert station.contains("BR1") is True
        assert station.contains("BR2") is False

    def test_contains_switch(self):
        """Sprawdzenie czy stacja zawiera łącznik."""
        station = create_station("S1")
        station.add_switch("SW1")

        assert station.contains("SW1") is True
        assert station.contains("SW2") is False

    def test_get_all_element_ids(self):
        """Pobranie wszystkich elementów stacji."""
        station = create_station("S1")
        station.add_bus("BUS1")
        station.add_bus("BUS2")
        station.add_branch("BR1")
        station.add_switch("SW1")

        all_ids = station.get_all_element_ids()

        # Posortowane deterministycznie
        assert all_ids == ["BR1", "BUS1", "BUS2", "SW1"]


# =============================================================================
# Test: Station validation
# =============================================================================


class TestStationValidation:
    """Testy walidacji stacji."""

    def test_valid_station(self):
        """Poprawna stacja przechodzi walidację."""
        station = create_station("S1", "Test", StationType.MAIN_SUBSTATION, 110.0)
        assert station.validate() is True

    def test_empty_id_fails_validation(self):
        """Pusty ID nie przechodzi walidacji."""
        station = Station(
            id="",
            name="Test",
            station_type=StationType.MAIN_SUBSTATION,
        )
        assert station.validate() is False

    def test_empty_name_fails_validation(self):
        """Pusta nazwa nie przechodzi walidacji."""
        station = Station(
            id="S1",
            name="",
            station_type=StationType.MAIN_SUBSTATION,
        )
        assert station.validate() is False

    def test_negative_voltage_fails_validation(self):
        """Ujemne napięcie nie przechodzi walidacji."""
        station = Station(
            id="S1",
            name="Test",
            station_type=StationType.MAIN_SUBSTATION,
            voltage_level_kv=-10.0,
        )
        assert station.validate() is False


# =============================================================================
# Test: Station serialization
# =============================================================================


class TestStationSerialization:
    """Testy serializacji i deserializacji stacji."""

    def test_to_dict(self):
        """Serializacja stacji do dict."""
        station = create_station("S1", "GPZ Główny", StationType.MAIN_SUBSTATION, 110.0)
        station.add_bus("BUS1")
        station.add_branch("BR1")
        station.description = "Opis stacji"
        station.location = "Warszawa"

        data = station.to_dict()

        assert data["id"] == "S1"
        assert data["name"] == "GPZ Główny"
        assert data["station_type"] == "GPZ"
        assert data["voltage_level_kv"] == 110.0
        assert data["bus_ids"] == ["BUS1"]
        assert data["branch_ids"] == ["BR1"]
        assert data["switch_ids"] == []
        assert data["description"] == "Opis stacji"
        assert data["location"] == "Warszawa"

    def test_from_dict(self):
        """Deserializacja stacji z dict."""
        data = {
            "id": "S1",
            "name": "GPZ Główny",
            "station_type": "GPZ",
            "voltage_level_kv": 110.0,
            "bus_ids": ["BUS1", "BUS2"],
            "branch_ids": ["BR1"],
            "switch_ids": ["SW1"],
            "description": "Opis",
            "location": "Kraków",
        }

        station = Station.from_dict(data)

        assert station.id == "S1"
        assert station.name == "GPZ Główny"
        assert station.station_type == StationType.MAIN_SUBSTATION
        assert station.voltage_level_kv == 110.0
        assert station.bus_ids == ["BUS1", "BUS2"]
        assert station.branch_ids == ["BR1"]
        assert station.switch_ids == ["SW1"]
        assert station.description == "Opis"
        assert station.location == "Kraków"

    def test_roundtrip_serialization(self):
        """Pełna serializacja i deserializacja."""
        original = create_station("S1", "Test", StationType.DISTRIBUTION, 15.0)
        original.add_bus("BUS1")
        original.add_branch("BR1")
        original.add_switch("SW1")
        original.description = "Test description"

        data = original.to_dict()
        restored = Station.from_dict(data)

        assert restored.id == original.id
        assert restored.name == original.name
        assert restored.station_type == original.station_type
        assert restored.voltage_level_kv == original.voltage_level_kv
        assert restored.bus_ids == original.bus_ids
        assert restored.branch_ids == original.branch_ids
        assert restored.switch_ids == original.switch_ids
        assert restored.description == original.description


# =============================================================================
# Test: NetworkGraph station integration
# =============================================================================


class TestNetworkGraphStationIntegration:
    """Testy integracji stacji z NetworkGraph."""

    def test_add_station_to_graph(self):
        """Dodanie stacji do grafu."""
        graph = NetworkGraph()
        station = create_station("S1")

        graph.add_station(station)

        assert "S1" in graph.stations
        assert graph.get_station("S1") is station

    def test_add_duplicate_station_raises(self):
        """Dodanie stacji z istniejącym ID rzuca ValueError."""
        graph = NetworkGraph()
        station1 = create_station("S1", "First")
        station2 = create_station("S1", "Second")

        graph.add_station(station1)

        with pytest.raises(ValueError, match="już istnieje"):
            graph.add_station(station2)

    def test_remove_station_from_graph(self):
        """Usunięcie stacji z grafu."""
        graph = NetworkGraph()
        station = create_station("S1")
        graph.add_station(station)

        graph.remove_station("S1")

        assert "S1" not in graph.stations

    def test_remove_nonexistent_station_raises(self):
        """Usunięcie nieistniejącej stacji rzuca ValueError."""
        graph = NetworkGraph()

        with pytest.raises(ValueError, match="nie istnieje"):
            graph.remove_station("NONEXISTENT")

    def test_get_station_optional(self):
        """get_station_optional zwraca None dla nieistniejącej stacji."""
        graph = NetworkGraph()
        station = create_station("S1")
        graph.add_station(station)

        assert graph.get_station_optional("S1") is station
        assert graph.get_station_optional("NONEXISTENT") is None

    def test_list_stations(self):
        """list_stations zwraca posortowaną listę stacji."""
        graph = NetworkGraph()
        station_c = create_station("C")
        station_a = create_station("A")
        station_b = create_station("B")

        graph.add_station(station_c)
        graph.add_station(station_a)
        graph.add_station(station_b)

        stations = graph.list_stations()

        # Posortowane po ID
        assert [s.id for s in stations] == ["A", "B", "C"]

    def test_get_station_for_bus(self):
        """get_station_for_bus znajduje stację zawierającą węzeł."""
        graph = NetworkGraph()

        node = create_pq_node("BUS1")
        graph.add_node(node)

        station = create_station("S1")
        station.add_bus("BUS1")
        graph.add_station(station)

        found = graph.get_station_for_bus("BUS1")

        assert found is station

    def test_get_station_for_bus_not_found(self):
        """get_station_for_bus zwraca None gdy nie znaleziono."""
        graph = NetworkGraph()

        node = create_pq_node("BUS1")
        graph.add_node(node)

        found = graph.get_station_for_bus("BUS1")

        assert found is None

    def test_get_station_for_element(self):
        """get_station_for_element znajduje stację dla dowolnego elementu."""
        graph = NetworkGraph()

        station = create_station("S1")
        station.add_bus("BUS1")
        station.add_branch("BR1")
        station.add_switch("SW1")
        graph.add_station(station)

        assert graph.get_station_for_element("BUS1") is station
        assert graph.get_station_for_element("BR1") is station
        assert graph.get_station_for_element("SW1") is station
        assert graph.get_station_for_element("NONEXISTENT") is None

    def test_station_does_not_affect_topology(self):
        """Stacje nie wpływają na topologię sieci (LOGICZNE TYLKO)."""
        graph = NetworkGraph()

        # Węzły i gałąź
        node_a = create_pq_node("A")
        node_b = create_pq_node("B")
        branch = create_line_branch("AB", "A", "B")

        graph.add_node(node_a)
        graph.add_node(node_b)
        graph.add_branch(branch)

        # Stacja - TYLKO grupowanie logiczne
        station = create_station("S1")
        station.add_bus("A")
        station.add_bus("B")
        station.add_branch("AB")
        graph.add_station(station)

        # Topologia bez zmian
        assert graph.is_connected() is True
        assert graph.get_connected_nodes("A")[0].id == "B"

        # Usunięcie stacji nie wpływa na topologię
        graph.remove_station("S1")

        assert graph.is_connected() is True
        assert "AB" in graph.branches

    def test_graph_repr_includes_stations(self):
        """repr grafu zawiera liczbę stacji."""
        graph = NetworkGraph()
        station = create_station("S1")
        graph.add_station(station)

        repr_str = repr(graph)

        assert "stations=1" in repr_str


# =============================================================================
# Test: Station repr
# =============================================================================


class TestStationRepr:
    """Testy reprezentacji tekstowej stacji."""

    def test_repr(self):
        """repr stacji zawiera podstawowe informacje."""
        station = create_station("S1", "GPZ Główny")
        station.add_bus("BUS1")
        station.add_branch("BR1")

        repr_str = repr(station)

        assert "S1" in repr_str
        assert "GPZ Główny" in repr_str
        assert "GPZ" in repr_str
        assert "buses=1" in repr_str
        assert "branches=1" in repr_str
