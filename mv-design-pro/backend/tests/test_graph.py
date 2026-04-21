"""
Testy jednostkowe dla modułu NetworkGraph.

Testy obejmują:
- Dodawanie węzłów z walidacją pojedynczego SLACK
- Dodawanie gałęzi z walidacją istniejących węzłów
- Analizę spójności sieci
- Znajdowanie wysp (komponentów spójności)
- Obsługę gałęzi nieaktywnych (in_service=False)
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
from network_model.core.switch import Switch, SwitchState

# =============================================================================
# Helper functions for creating test objects
# =============================================================================


def create_slack_node(
    node_id: str,
    name: str = "SLACK Node",
    voltage_magnitude: float = 1.0,
    voltage_angle: float = 0.0,
    voltage_level: float = 110.0,
) -> Node:
    """Tworzy poprawny węzeł SLACK do testów."""
    return Node(
        id=node_id,
        name=name,
        node_type=NodeType.SLACK,
        voltage_level=voltage_level,
        voltage_magnitude=voltage_magnitude,
        voltage_angle=voltage_angle,
    )


def create_pq_node(
    node_id: str,
    name: str = "PQ Node",
    active_power: float = 10.0,
    reactive_power: float = 5.0,
    voltage_level: float = 20.0,
) -> Node:
    """Tworzy poprawny węzeł PQ do testów."""
    return Node(
        id=node_id,
        name=name,
        node_type=NodeType.PQ,
        voltage_level=voltage_level,
        active_power=active_power,
        reactive_power=reactive_power,
    )


def create_line_branch(
    branch_id: str,
    from_node_id: str,
    to_node_id: str,
    in_service: bool = True,
    name: str = "Line Branch",
) -> LineBranch:
    """Tworzy poprawną gałąź liniową do testów."""
    return LineBranch(
        id=branch_id,
        name=name,
        branch_type=BranchType.LINE,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        in_service=in_service,
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
    state: SwitchState = SwitchState.CLOSED,
    in_service: bool = True,
    name: str = "Switch",
) -> Switch:
    """Tworzy poprawny łącznik do testów."""
    return Switch(
        id=switch_id,
        name=name,
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        state=state,
        in_service=in_service,
    )


# =============================================================================
# Test: add_node allows single SLACK and rejects second SLACK
# =============================================================================


class TestAddNodeSlackConstraint:
    """Testy walidacji pojedynczego węzła SLACK."""

    def test_add_node_allows_single_slack_and_rejects_second_slack(self):
        """
        Dodanie jednego węzła SLACK powinno się powieść,
        ale dodanie drugiego powinno rzucić ValueError.
        """
        graph = NetworkGraph()

        # Dodanie pierwszego węzła SLACK - powinno się powieść
        slack1 = create_slack_node("SLACK1", "GPZ Główny")
        graph.add_node(slack1)

        # Sprawdź, że węzeł został dodany
        assert "SLACK1" in graph.nodes
        assert graph.get_slack_node() is slack1

        # Dodanie drugiego węzła SLACK - powinno rzucić ValueError
        slack2 = create_slack_node("SLACK2", "GPZ Zapasowy")
        with pytest.raises(ValueError, match="SLACK"):
            graph.add_node(slack2)

        # Sprawdź, że drugi węzeł nie został dodany
        assert "SLACK2" not in graph.nodes
        assert len(graph.nodes) == 1

    def test_add_multiple_pq_nodes_allowed(self):
        """Dodanie wielu węzłów PQ powinno się powieść."""
        graph = NetworkGraph()

        pq1 = create_pq_node("PQ1")
        pq2 = create_pq_node("PQ2")
        pq3 = create_pq_node("PQ3")

        graph.add_node(pq1)
        graph.add_node(pq2)
        graph.add_node(pq3)

        assert len(graph.nodes) == 3
        assert "PQ1" in graph.nodes
        assert "PQ2" in graph.nodes
        assert "PQ3" in graph.nodes

    def test_add_node_duplicate_id_raises(self):
        """Dodanie węzła z istniejącym ID powinno rzucić ValueError."""
        graph = NetworkGraph()

        pq1 = create_pq_node("A")
        pq2 = create_pq_node("A", name="Inny węzeł")

        graph.add_node(pq1)

        with pytest.raises(ValueError, match="już istnieje"):
            graph.add_node(pq2)


# =============================================================================
# Test: add_branch requires existing nodes
# =============================================================================


class TestAddBranchNodeExistence:
    """Testy walidacji istnienia węzłów przy dodawaniu gałęzi."""

    def test_add_branch_requires_existing_nodes(self):
        """
        Dodanie gałęzi wymaga, aby oba węzły (from i to) istniały.
        W przeciwnym razie rzuca ValueError.
        """
        graph = NetworkGraph()

        # Dodaj tylko węzeł A
        node_a = create_pq_node("A")
        graph.add_node(node_a)

        # Próba dodania gałęzi do nieistniejącego węzła B
        branch = create_line_branch("AB", "A", "B")

        with pytest.raises(ValueError, match="nie istnieje"):
            graph.add_branch(branch)

        # Sprawdź, że gałąź nie została dodana
        assert len(graph.branches) == 0

    def test_add_branch_from_node_not_exists(self):
        """Gałąź z nieistniejącym węzłem początkowym rzuca ValueError."""
        graph = NetworkGraph()

        node_b = create_pq_node("B")
        graph.add_node(node_b)

        branch = create_line_branch("AB", "A", "B")

        with pytest.raises(ValueError, match="'A'.*nie istnieje"):
            graph.add_branch(branch)

    def test_add_branch_to_node_not_exists(self):
        """Gałąź z nieistniejącym węzłem końcowym rzuca ValueError."""
        graph = NetworkGraph()

        node_a = create_pq_node("A")
        graph.add_node(node_a)

        branch = create_line_branch("AB", "A", "B")

        with pytest.raises(ValueError, match="'B'.*nie istnieje"):
            graph.add_branch(branch)

    def test_add_branch_self_loop_raises(self):
        """Gałąź łącząca węzeł sam ze sobą rzuca ValueError."""
        graph = NetworkGraph()

        node_a = create_pq_node("A")
        graph.add_node(node_a)

        branch = create_line_branch("AA", "A", "A")

        with pytest.raises(ValueError, match="sam"):
            graph.add_branch(branch)

    def test_add_branch_between_existing_nodes_succeeds(self):
        """Dodanie gałęzi między istniejącymi węzłami powinno się powieść."""
        graph = NetworkGraph()

        node_a = create_pq_node("A")
        node_b = create_pq_node("B")
        branch = create_line_branch("AB", "A", "B")

        graph.add_node(node_a)
        graph.add_node(node_b)
        graph.add_branch(branch)

        assert "AB" in graph.branches
        assert graph.get_branch("AB") is branch


# =============================================================================
# Test: is_connected true for connected, false for islands
# =============================================================================


class TestIsConnected:
    """Testy analizy spójności sieci."""

    def test_is_connected_true_for_connected_false_for_islands(self):
        """
        is_connected() zwraca True dla spójnego grafu,
        False gdy są wyspy (izolowane węzły).
        """
        graph = NetworkGraph()

        # Stwórz trzy węzły
        node_a = create_pq_node("A")
        node_b = create_pq_node("B")
        node_c = create_pq_node("C")

        graph.add_node(node_a)
        graph.add_node(node_b)
        graph.add_node(node_c)

        # Bez gałęzi - graf niespójny (3 wyspy)
        assert graph.is_connected() is False

        # Dodaj gałąź A-B
        branch_ab = create_line_branch("AB", "A", "B")
        graph.add_branch(branch_ab)

        # Nadal niespójny (C jest izolowany)
        assert graph.is_connected() is False

        # Dodaj gałąź B-C
        branch_bc = create_line_branch("BC", "B", "C")
        graph.add_branch(branch_bc)

        # Teraz graf jest spójny
        assert graph.is_connected() is True

    def test_is_connected_empty_graph_returns_false(self):
        """Pusty graf nie jest spójny."""
        graph = NetworkGraph()
        assert graph.is_connected() is False

    def test_is_connected_single_node_returns_true(self):
        """Graf z jednym węzłem jest spójny."""
        graph = NetworkGraph()
        node = create_pq_node("A")
        graph.add_node(node)

        assert graph.is_connected() is True


# =============================================================================
# Test: find_islands returns two components deterministically
# =============================================================================


class TestFindIslands:
    """Testy znajdowania wysp (komponentów spójności)."""

    def test_find_islands_returns_two_components_deterministically(self):
        """
        find_islands() zwraca listę wysp posortowaną malejąco po długości,
        z węzłami posortowanymi alfabetycznie wewnątrz każdej wyspy.
        """
        graph = NetworkGraph()

        # Stwórz 5 węzłów: A, B, C tworzą jedną wyspę; D, E tworzą drugą
        node_a = create_pq_node("A")
        node_b = create_pq_node("B")
        node_c = create_pq_node("C")
        node_d = create_pq_node("D")
        node_e = create_pq_node("E")

        graph.add_node(node_a)
        graph.add_node(node_b)
        graph.add_node(node_c)
        graph.add_node(node_d)
        graph.add_node(node_e)

        # Połącz A-B-C
        branch_ab = create_line_branch("AB", "A", "B")
        branch_bc = create_line_branch("BC", "B", "C")
        graph.add_branch(branch_ab)
        graph.add_branch(branch_bc)

        # Połącz D-E
        branch_de = create_line_branch("DE", "D", "E")
        graph.add_branch(branch_de)

        # Znajdź wyspy
        islands = graph.find_islands()

        # Powinny być 2 wyspy
        assert len(islands) == 2

        # Pierwsza wyspa (większa): A, B, C
        assert islands[0] == ["A", "B", "C"]

        # Druga wyspa (mniejsza): D, E
        assert islands[1] == ["D", "E"]

    def test_find_islands_single_isolated_nodes(self):
        """Każdy izolowany węzeł tworzy osobną wyspę."""
        graph = NetworkGraph()

        node_a = create_pq_node("A")
        node_b = create_pq_node("B")
        node_c = create_pq_node("C")

        graph.add_node(node_a)
        graph.add_node(node_b)
        graph.add_node(node_c)

        islands = graph.find_islands()

        # 3 wyspy po jednym węźle
        assert len(islands) == 3
        # Wszystkie wyspy mają długość 1, więc sortowanie po długości nie zmienia kolejności
        # ale węzły wewnątrz są posortowane
        island_sets = [set(island) for island in islands]
        assert {"A"} in island_sets
        assert {"B"} in island_sets
        assert {"C"} in island_sets

    def test_find_islands_empty_graph(self):
        """Pusty graf zwraca pustą listę wysp."""
        graph = NetworkGraph()
        islands = graph.find_islands()
        assert islands == []


# =============================================================================
# Test: inactive branch not in graph edges
# =============================================================================


class TestInactiveBranch:
    """Testy obsługi gałęzi nieaktywnych (in_service=False)."""

    def test_inactive_branch_not_in_graph_edges(self):
        """
        Gałąź z in_service=False jest przechowywana w branches,
        ale nie tworzy krawędzi w _graph.
        """
        graph = NetworkGraph()

        node_a = create_pq_node("A")
        node_b = create_pq_node("B")
        node_c = create_pq_node("C")

        graph.add_node(node_a)
        graph.add_node(node_b)
        graph.add_node(node_c)

        # Gałąź aktywna A-B
        branch_ab = create_line_branch("AB", "A", "B", in_service=True)
        graph.add_branch(branch_ab)

        # Gałąź nieaktywna B-C
        branch_bc = create_line_branch("BC", "B", "C", in_service=False)
        graph.add_branch(branch_bc)

        # Obie gałęzie są w słowniku branches
        assert "AB" in graph.branches
        assert "BC" in graph.branches

        # Ale tylko aktywna gałąź tworzy krawędź w grafie
        assert graph._graph.has_edge("A", "B") is True
        assert graph._graph.has_edge("B", "C") is False

        # Skutek: C jest izolowany, graf niespójny
        assert graph.is_connected() is False

        # Dwie wyspy: [A, B] i [C]
        islands = graph.find_islands()
        assert len(islands) == 2

    def test_inactive_branch_affects_connectivity(self):
        """Nieaktywna gałąź nie wpływa na analizę spójności."""
        graph = NetworkGraph()

        node_a = create_pq_node("A")
        node_b = create_pq_node("B")

        graph.add_node(node_a)
        graph.add_node(node_b)

        # Tylko nieaktywna gałąź
        branch = create_line_branch("AB", "A", "B", in_service=False)
        graph.add_branch(branch)

        # Graf jest niespójny mimo fizycznej gałęzi
        assert graph.is_connected() is False

        # Dwie wyspy
        islands = graph.find_islands()
        assert len(islands) == 2


# =============================================================================
# Test: get_connected_nodes returns neighbors
# =============================================================================


class TestGetConnectedNodes:
    """Testy pobierania sąsiadów węzła."""

    def test_get_connected_nodes_returns_neighbors(self):
        """get_connected_nodes zwraca bezpośrednich sąsiadów."""
        graph = NetworkGraph()

        node_a = create_pq_node("A")
        node_b = create_pq_node("B")
        node_c = create_pq_node("C")
        node_d = create_pq_node("D")

        graph.add_node(node_a)
        graph.add_node(node_b)
        graph.add_node(node_c)
        graph.add_node(node_d)

        # A -- B -- C
        #      |
        #      D
        branch_ab = create_line_branch("AB", "A", "B")
        branch_bc = create_line_branch("BC", "B", "C")
        branch_bd = create_line_branch("BD", "B", "D")

        graph.add_branch(branch_ab)
        graph.add_branch(branch_bc)
        graph.add_branch(branch_bd)

        # Sąsiedzi B to: A, C, D (posortowani)
        neighbors_b = graph.get_connected_nodes("B")
        neighbor_ids = [n.id for n in neighbors_b]

        assert neighbor_ids == ["A", "C", "D"]

        # Sąsiedzi A to tylko B
        neighbors_a = graph.get_connected_nodes("A")
        assert len(neighbors_a) == 1
        assert neighbors_a[0].id == "B"

    def test_get_connected_nodes_isolated_node(self):
        """Izolowany węzeł nie ma sąsiadów."""
        graph = NetworkGraph()

        node_a = create_pq_node("A")
        graph.add_node(node_a)

        neighbors = graph.get_connected_nodes("A")
        assert neighbors == []

    def test_get_connected_nodes_nonexistent_raises(self):
        """Zapytanie o nieistniejący węzeł rzuca ValueError."""
        graph = NetworkGraph()

        with pytest.raises(ValueError, match="nie istnieje"):
            graph.get_connected_nodes("NONEXISTENT")


# =============================================================================
# Test: remove operations
# =============================================================================


class TestRemoveOperations:
    """Testy usuwania węzłów i gałęzi."""

    def test_remove_node_removes_incident_branches(self):
        """Usunięcie węzła usuwa również wszystkie połączone gałęzie."""
        graph = NetworkGraph()

        node_a = create_pq_node("A")
        node_b = create_pq_node("B")
        node_c = create_pq_node("C")

        graph.add_node(node_a)
        graph.add_node(node_b)
        graph.add_node(node_c)

        branch_ab = create_line_branch("AB", "A", "B")
        branch_bc = create_line_branch("BC", "B", "C")

        graph.add_branch(branch_ab)
        graph.add_branch(branch_bc)

        # Usuń węzeł B
        graph.remove_node("B")

        # B nie istnieje
        assert "B" not in graph.nodes

        # Obie gałęzie zostały usunięte
        assert len(graph.branches) == 0

    def test_remove_branch(self):
        """Usunięcie gałęzi działa poprawnie."""
        graph = NetworkGraph()

        node_a = create_pq_node("A")
        node_b = create_pq_node("B")

        graph.add_node(node_a)
        graph.add_node(node_b)

        branch = create_line_branch("AB", "A", "B")
        graph.add_branch(branch)

        assert graph.is_connected() is True

        # Usuń gałąź
        graph.remove_branch("AB")

        assert "AB" not in graph.branches
        assert graph.is_connected() is False

    def test_remove_nonexistent_node_raises(self):
        """Usunięcie nieistniejącego węzła rzuca ValueError."""
        graph = NetworkGraph()

        with pytest.raises(ValueError, match="nie istnieje"):
            graph.remove_node("NONEXISTENT")

    def test_remove_nonexistent_branch_raises(self):
        """Usunięcie nieistniejącej gałęzi rzuca ValueError."""
        graph = NetworkGraph()

        with pytest.raises(ValueError, match="nie istnieje"):
            graph.remove_branch("NONEXISTENT")


# =============================================================================
# Test: get_slack_node
# =============================================================================


class TestGetSlackNode:
    """Testy pobierania węzła SLACK."""

    def test_get_slack_node_returns_slack(self):
        """get_slack_node zwraca węzeł SLACK."""
        graph = NetworkGraph()

        slack = create_slack_node("SLACK1")
        pq = create_pq_node("PQ1")

        graph.add_node(slack)
        graph.add_node(pq)

        result = graph.get_slack_node()
        assert result is slack

    def test_get_slack_node_no_slack_raises(self):
        """Brak węzła SLACK rzuca ValueError."""
        graph = NetworkGraph()

        pq = create_pq_node("PQ1")
        graph.add_node(pq)

        with pytest.raises(ValueError, match="Brak węzła SLACK"):
            graph.get_slack_node()


# =============================================================================
# Test: rebuild_graph
# =============================================================================


class TestRebuildGraph:
    """Testy przebudowy grafu."""

    def test_rebuild_graph_restores_state(self):
        """_rebuild_graph() poprawnie odtwarza stan grafu."""
        graph = NetworkGraph()

        node_a = create_pq_node("A")
        node_b = create_pq_node("B")
        node_c = create_pq_node("C")

        graph.add_node(node_a)
        graph.add_node(node_b)
        graph.add_node(node_c)

        branch_ab = create_line_branch("AB", "A", "B", in_service=True)
        branch_bc = create_line_branch("BC", "B", "C", in_service=False)

        graph.add_branch(branch_ab)
        graph.add_branch(branch_bc)

        # Zapisz stan początkowy
        set(graph._graph.edges())

        # Wyczyść graf (symulacja uszkodzenia)
        graph._graph.clear()

        # Przebuduj
        graph._rebuild_graph()

        # Sprawdź odtworzenie
        assert graph._graph.number_of_nodes() == 3
        assert graph._graph.has_edge("A", "B") is True
        assert graph._graph.has_edge("B", "C") is False  # nieaktywna gałąź


# =============================================================================
# Test: edge attributes
# =============================================================================


class TestEdgeAttributes:
    """Testy atrybutów krawędzi grafu."""

    def test_edge_has_branch_attributes(self):
        """Krawędź w grafie ma atrybuty branch_id, branch_type, name."""
        graph = NetworkGraph()

        node_a = create_pq_node("A")
        node_b = create_pq_node("B")

        graph.add_node(node_a)
        graph.add_node(node_b)

        branch = create_line_branch("AB", "A", "B", name="Linia AB")
        graph.add_branch(branch)

        # W MultiGraph get_edge_data zwraca dict {key: {attrs}}
        # Używamy key=branch.id aby pobrać atrybuty konkretnej krawędzi
        edge_data = graph._graph.get_edge_data("A", "B", key="AB")

        assert edge_data is not None
        assert edge_data.get("branch_id") == "AB"
        assert edge_data.get("branch_type") == "LINE"
        assert edge_data.get("name") == "Linia AB"


# =============================================================================
# Test: parallel branches between same nodes
# =============================================================================


class TestParallelBranches:
    """Testy obsługi gałęzi równoległych (MultiGraph)."""

    def test_parallel_branches_between_same_nodes_are_supported(self):
        """
        Dwie gałęzie równoległe między tą samą parą węzłów
        powinny być obsługiwane poprawnie.
        """
        graph = NetworkGraph()

        # Dodaj węzły A i B
        node_a = create_pq_node("A")
        node_b = create_pq_node("B")
        graph.add_node(node_a)
        graph.add_node(node_b)

        # Dodaj dwie gałęzie równoległe AB1 i AB2
        branch_ab1 = create_line_branch("AB1", "A", "B", in_service=True, name="Linia 1")
        branch_ab2 = create_line_branch("AB2", "A", "B", in_service=True, name="Linia 2")

        graph.add_branch(branch_ab1)
        graph.add_branch(branch_ab2)

        # Obie gałęzie są w branches
        assert "AB1" in graph.branches
        assert "AB2" in graph.branches
        assert len(graph.branches) == 2

        # W MultiGraph istnieją DWIE krawędzie między A i B
        # Sprawdzamy liczbę krawędzi między A-B
        edges_ab = graph._graph.get_edge_data("A", "B")
        assert edges_ab is not None
        assert len(edges_ab) == 2  # Dwie krawędzie (dwa klucze)
        assert "AB1" in edges_ab
        assert "AB2" in edges_ab

        # Topologia pozostaje taka sama - get_connected_nodes zwraca ["B"]
        neighbors_a = graph.get_connected_nodes("A")
        neighbor_ids = [n.id for n in neighbors_a]
        assert neighbor_ids == ["B"]

        # Graf jest spójny
        assert graph.is_connected() is True

        # Jedna wyspa z dwoma węzłami
        islands = graph.find_islands()
        assert len(islands) == 1
        assert islands[0] == ["A", "B"]

    def test_remove_branch_removes_only_one_parallel_edge(self):
        """
        Usunięcie jednej gałęzi równoległej nie usuwa innych
        gałęzi między tą samą parą węzłów.
        """
        graph = NetworkGraph()

        # Dodaj węzły A i B
        node_a = create_pq_node("A")
        node_b = create_pq_node("B")
        graph.add_node(node_a)
        graph.add_node(node_b)

        # Dodaj dwie gałęzie równoległe AB1 i AB2
        branch_ab1 = create_line_branch("AB1", "A", "B", in_service=True)
        branch_ab2 = create_line_branch("AB2", "A", "B", in_service=True)

        graph.add_branch(branch_ab1)
        graph.add_branch(branch_ab2)

        # Sprawdź, że są dwie krawędzie
        edges_ab = graph._graph.get_edge_data("A", "B")
        assert len(edges_ab) == 2

        # Usuń pierwszą gałąź
        graph.remove_branch("AB1")

        # AB1 usunięta z branches
        assert "AB1" not in graph.branches
        assert "AB2" in graph.branches
        assert len(graph.branches) == 1

        # Pozostała jedna krawędź w MultiGraph
        edges_ab = graph._graph.get_edge_data("A", "B")
        assert edges_ab is not None
        assert len(edges_ab) == 1
        assert "AB2" in edges_ab
        assert "AB1" not in edges_ab

        # Graf nadal spójny
        assert graph.is_connected() is True

    def test_parallel_branches_with_one_inactive(self):
        """
        Jedna gałąź równoległa aktywna, druga nieaktywna.
        """
        graph = NetworkGraph()

        node_a = create_pq_node("A")
        node_b = create_pq_node("B")
        graph.add_node(node_a)
        graph.add_node(node_b)

        # AB1 aktywna, AB2 nieaktywna
        branch_ab1 = create_line_branch("AB1", "A", "B", in_service=True)
        branch_ab2 = create_line_branch("AB2", "A", "B", in_service=False)

        graph.add_branch(branch_ab1)
        graph.add_branch(branch_ab2)

        # Obie w branches
        assert "AB1" in graph.branches
        assert "AB2" in graph.branches

        # Tylko jedna krawędź w grafie (aktywna)
        edges_ab = graph._graph.get_edge_data("A", "B")
        assert edges_ab is not None
        assert len(edges_ab) == 1
        assert "AB1" in edges_ab
        assert "AB2" not in edges_ab

        # Graf spójny dzięki aktywnej gałęzi
        assert graph.is_connected() is True

    def test_three_parallel_branches(self):
        """
        Trzy gałęzie równoległe między tą samą parą węzłów.
        """
        graph = NetworkGraph()

        node_a = create_pq_node("A")
        node_b = create_pq_node("B")
        graph.add_node(node_a)
        graph.add_node(node_b)

        # Trzy gałęzie równoległe
        branch_ab1 = create_line_branch("AB1", "A", "B")
        branch_ab2 = create_line_branch("AB2", "A", "B")
        branch_ab3 = create_line_branch("AB3", "A", "B")

        graph.add_branch(branch_ab1)
        graph.add_branch(branch_ab2)
        graph.add_branch(branch_ab3)

        # Wszystkie trzy krawędzie w MultiGraph
        edges_ab = graph._graph.get_edge_data("A", "B")
        assert len(edges_ab) == 3

        # Usunięcie środkowej gałęzi
        graph.remove_branch("AB2")

        edges_ab = graph._graph.get_edge_data("A", "B")
        assert len(edges_ab) == 2
        assert "AB1" in edges_ab
        assert "AB3" in edges_ab

    def test_rebuild_graph_preserves_parallel_branches(self):
        """
        _rebuild_graph() zachowuje gałęzie równoległe.
        """
        graph = NetworkGraph()

        node_a = create_pq_node("A")
        node_b = create_pq_node("B")
        graph.add_node(node_a)
        graph.add_node(node_b)

        branch_ab1 = create_line_branch("AB1", "A", "B", in_service=True)
        branch_ab2 = create_line_branch("AB2", "A", "B", in_service=True)

        graph.add_branch(branch_ab1)
        graph.add_branch(branch_ab2)

        # Przebuduj graf
        graph._rebuild_graph()

        # Sprawdź, że obie krawędzie są zachowane
        edges_ab = graph._graph.get_edge_data("A", "B")
        assert edges_ab is not None
        assert len(edges_ab) == 2
        assert "AB1" in edges_ab
        assert "AB2" in edges_ab


# =============================================================================
# Test: switch topology (OPEN/CLOSED/in_service)
# =============================================================================


class TestSwitchTopology:
    """Testy topologii dla łączników (Switch)."""

    def test_closed_switch_connects_nodes(self):
        """
        CLOSED + in_service=True powinien łączyć węzły.
        """
        graph = NetworkGraph()
        graph.add_node(create_pq_node("A"))
        graph.add_node(create_pq_node("B"))

        graph.add_switch(create_switch("SW1", "A", "B", state=SwitchState.CLOSED))

        assert graph.is_connected() is True

    def test_open_switch_disconnects_nodes(self):
        """
        OPEN powinien rozłączać węzły.
        """
        graph = NetworkGraph()
        graph.add_node(create_pq_node("A"))
        graph.add_node(create_pq_node("B"))

        graph.add_switch(create_switch("SW1", "A", "B", state=SwitchState.OPEN))

        assert graph.is_connected() is False

    def test_out_of_service_switch_disconnects_nodes(self):
        """
        in_service=False powinien rozłączać węzły nawet jeśli CLOSED.
        """
        graph = NetworkGraph()
        graph.add_node(create_pq_node("A"))
        graph.add_node(create_pq_node("B"))

        graph.add_switch(
            create_switch(
                "SW1",
                "A",
                "B",
                state=SwitchState.CLOSED,
                in_service=False,
            )
        )

        assert graph.is_connected() is False
