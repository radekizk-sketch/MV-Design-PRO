"""
Moduł grafu sieci elektroenergetycznej.

Ten moduł zawiera klasę NetworkGraph reprezentującą topologię sieci
elektroenergetycznej z wykorzystaniem biblioteki NetworkX do analizy
spójności i znajdowania wysp.
"""

import networkx as nx

from .branch import Branch
from .grid_source import GridShortCircuitSource
from .inverter import InverterSource
from .machine import AsynchronousMachineSource, SynchronousMachineSource
from .node import Node, NodeType
from .station import Station
from .switch import Switch
from .topologia import skladowe_spojne


class NetworkGraph:
    """
    Graf sieci elektroenergetycznej.

    Klasa przechowuje węzły i gałęzie sieci oraz udostępnia metody
    do analizy topologii (spójność, wyspy, sąsiedztwo).

    Attributes:
        nodes: Słownik węzłów (node_id -> Node).
        branches: Słownik gałęzi (branch_id -> Branch).
        switches: Słownik łączników (switch_id -> Switch).
        _graph: Prywatny multigraf NetworkX (nieskierowany) do analiz topologicznych.

    Notes:
        Graf jest nieskierowany (nx.MultiGraph), ponieważ topologia sieci SN
        jest nieskierowana. Kierunek przepływu mocy jest wynikiem solvera,
        nie cechą topologii.

        MultiGraph pozwala na wiele gałęzi równoległych między tą samą parą
        węzłów (np. dwie linie lub kable między stacjami). Każda krawędź
        jest identyfikowana przez key=branch.id.

        Krawędzie w _graph odpowiadają tylko aktywnym elementom:
        - gałęziom z in_service=True
        - łącznikom z in_service=True i stanem CLOSED
        Elementy nieaktywne są przechowywane w słownikach, ale nie
        tworzą krawędzi w grafie topologicznym.
    """

    def __init__(self, network_model_id: str | None = None) -> None:
        """Inicjalizuje pusty graf sieci."""
        self.network_model_id = network_model_id
        self.nodes: dict[str, Node] = {}
        self.branches: dict[str, Branch] = {}
        self.inverter_sources: dict[str, InverterSource] = {}
        # Rotating-machine SC sources (IEC 60909 §6.3/§6.7) — voltage-behind-Z″,
        # added to the Y-bus as a shunt (unlike inverters = bounded current sources).
        self.synchronous_machine_sources: dict[str, SynchronousMachineSource] = {}
        self.asynchronous_machine_sources: dict[str, AsynchronousMachineSource] = {}
        # Zasilanie systemowe (IEC 60909-0 §3.2) — SEM za impedancją Z_Q, do
        # Y-bus jako bocznik Y_Q = 1/Z_Q (jak maszyny wirujące i jak stamp
        # źródła w sieci składowej zerowej).
        self.grid_sc_sources: dict[str, GridShortCircuitSource] = {}
        self.switches: dict[str, Switch] = {}
        self.stations: dict[str, Station] = {}
        # Karta FAB-H: ślad WHITE BOX zarejestrowanych założeń k_sc (udziału
        # zwarciowego falownika), zbudowany przez enm/mapping.py przy braku k_sc
        # w karcie katalogowej konwertera. Metadana mostu, nie wejście solvera —
        # network_model/solvers/** jej nie czyta (B-01, solver nietknięty).
        self.k_sc_assumptions_trace: list[dict] = []
        self._graph: nx.MultiGraph = nx.MultiGraph()

    def add_node(self, node: Node) -> None:
        """
        Dodaje węzeł do grafu sieci.

        Walidacje:
        - node.id nie może istnieć już w nodes
        - Po dodaniu sprawdza constraint: maksymalnie 1 węzeł SLACK w całej sieci

        Args:
            node: Węzeł do dodania.

        Raises:
            ValueError: Gdy węzeł o podanym ID już istnieje.
            ValueError: Gdy dodanie węzła powoduje posiadanie więcej niż 1 węzła SLACK.
        """
        if node.id in self.nodes:
            raise ValueError(f"Węzeł o ID '{node.id}' już istnieje w grafie.")

        # Dodaj węzeł tymczasowo
        self.nodes[node.id] = node
        self._graph.add_node(node.id)

        # Sprawdź constraint pojedynczego SLACK
        try:
            self._validate_single_slack()
        except ValueError:
            # Wycofaj dodanie węzła
            del self.nodes[node.id]
            self._graph.remove_node(node.id)
            raise

    def add_branch(self, branch: Branch) -> None:
        """
        Dodaje gałąź do grafu sieci.

        Walidacje:
        - branch.id nie może istnieć już w branches
        - from_node_id i to_node_id muszą istnieć w nodes
        - Gałąź nie może łączyć węzła samego ze sobą

        Jeśli gałąź ma in_service=False, obiekt jest przechowywany
        w branches, ale krawędź nie jest dodawana do _graph.

        Args:
            branch: Gałąź do dodania.

        Raises:
            ValueError: Gdy gałąź o podanym ID już istnieje.
            ValueError: Gdy węzeł początkowy lub końcowy nie istnieje.
            ValueError: Gdy gałąź łączy węzeł sam ze sobą.
        """
        if branch.id in self.branches:
            raise ValueError(f"Gałąź o ID '{branch.id}' już istnieje w grafie.")

        if branch.from_node_id not in self.nodes:
            raise ValueError(f"Węzeł początkowy '{branch.from_node_id}' nie istnieje w grafie.")

        if branch.to_node_id not in self.nodes:
            raise ValueError(f"Węzeł końcowy '{branch.to_node_id}' nie istnieje w grafie.")

        if branch.from_node_id == branch.to_node_id:
            raise ValueError(f"Gałąź nie może łączyć węzła '{branch.from_node_id}' samego ze sobą.")

        # Dodaj gałąź do słownika
        self.branches[branch.id] = branch

        # Dodaj krawędź do grafu tylko jeśli gałąź jest aktywna
        if self._is_branch_in_service(branch):
            self._graph.add_edge(
                branch.from_node_id,
                branch.to_node_id,
                key=branch.id,
                branch_id=branch.id,
                edge_kind="branch",
                branch_type=branch.branch_type.value,
                name=branch.name,
            )

    def add_switch(self, switch: Switch) -> None:
        """
        Dodaje łącznik (switch) do grafu sieci.

        Walidacje:
        - switch.id nie może istnieć już w switches
        - from_node_id i to_node_id muszą istnieć w nodes
        - Switch nie może łączyć węzła samego ze sobą

        Jeśli switch ma in_service=False lub stan OPEN, obiekt jest
        przechowywany w switches, ale krawędź nie jest dodawana do _graph.

        Args:
            switch: Łącznik do dodania.

        Raises:
            ValueError: Gdy łącznik o podanym ID już istnieje.
            ValueError: Gdy węzeł początkowy lub końcowy nie istnieje.
            ValueError: Gdy łącznik łączy węzeł sam ze sobą.
        """
        if switch.id in self.switches:
            raise ValueError(f"Łącznik o ID '{switch.id}' już istnieje w grafie.")

        if switch.from_node_id not in self.nodes:
            raise ValueError(f"Węzeł początkowy '{switch.from_node_id}' nie istnieje w grafie.")

        if switch.to_node_id not in self.nodes:
            raise ValueError(f"Węzeł końcowy '{switch.to_node_id}' nie istnieje w grafie.")

        if switch.from_node_id == switch.to_node_id:
            raise ValueError(
                f"Łącznik nie może łączyć węzła '{switch.from_node_id}' samego ze sobą."
            )

        self.switches[switch.id] = switch

        if self._is_switch_active(switch):
            self._graph.add_edge(
                switch.from_node_id,
                switch.to_node_id,
                key=switch.id,
                switch_id=switch.id,
                edge_kind="switch",
                switch_type=switch.switch_type.value,
                state=switch.state.value,
                name=switch.name,
            )

    def add_inverter_source(self, source: InverterSource) -> None:
        """
        Dodaje źródło falownikowe do grafu sieci.

        Args:
            source: Źródło falownikowe do dodania.

        Raises:
            ValueError: Gdy źródło o podanym ID już istnieje.
            ValueError: Gdy węzeł docelowy nie istnieje.
        """
        if source.id in self.inverter_sources:
            raise ValueError(f"Źródło falownikowe o ID '{source.id}' już istnieje w grafie.")
        if source.node_id not in self.nodes:
            raise ValueError(f"Węzeł '{source.node_id}' nie istnieje w grafie.")
        self.inverter_sources[source.id] = source

    def remove_inverter_source(self, source_id: str) -> None:
        """
        Usuwa źródło falownikowe z grafu sieci.

        Args:
            source_id: ID źródła falownikowego.

        Raises:
            ValueError: Gdy źródło o podanym ID nie istnieje.
        """
        if source_id not in self.inverter_sources:
            raise ValueError(f"Źródło falownikowe o ID '{source_id}' nie istnieje w grafie.")
        del self.inverter_sources[source_id]

    def get_inverter_sources_at_node(self, node_id: str) -> list[InverterSource]:
        """
        Zwraca listę aktywnych źródeł falownikowych w danym węźle.

        Args:
            node_id: ID węzła.

        Returns:
            Lista źródeł falownikowych posortowana deterministycznie po ID.

        Raises:
            ValueError: Gdy węzeł o podanym ID nie istnieje.
        """
        if node_id not in self.nodes:
            raise ValueError(f"Węzeł o ID '{node_id}' nie istnieje w grafie.")
        sources = [
            source
            for source in self.inverter_sources.values()
            if source.node_id == node_id and self._is_inverter_in_service(source)
        ]
        sources.sort(key=lambda source: source.id)
        return sources

    def get_inverter_sources(self) -> list[InverterSource]:
        """
        Zwraca listę aktywnych źródeł falownikowych w całej sieci.

        Returns:
            Lista źródeł falownikowych posortowana deterministycznie po ID.
        """
        sources = [
            source
            for source in self.inverter_sources.values()
            if self._is_inverter_in_service(source)
        ]
        sources.sort(key=lambda source: source.id)
        return sources

    # ── Rotating-machine SC sources (IEC 60909 §6.3 synchronous, §6.7 asynchronous).
    # Mirror the inverter registration: deterministic ordering by id, in-service
    # filtering, node-existence validation. ──────────────────────────────────────
    def add_synchronous_machine_source(self, source: SynchronousMachineSource) -> None:
        """Register a synchronous-machine SC source (voltage behind Z″_G)."""
        if source.id in self.synchronous_machine_sources:
            raise ValueError(f"Maszyna synchroniczna o ID '{source.id}' już istnieje w grafie.")
        if source.node_id not in self.nodes:
            raise ValueError(f"Węzeł '{source.node_id}' nie istnieje w grafie.")
        self.synchronous_machine_sources[source.id] = source

    def get_synchronous_machine_sources(self) -> list[SynchronousMachineSource]:
        """Active synchronous-machine sources, deterministically ordered by id."""
        sources = [
            s for s in self.synchronous_machine_sources.values() if getattr(s, "in_service", True)
        ]
        sources.sort(key=lambda s: s.id)
        return sources

    def add_asynchronous_machine_source(self, source: AsynchronousMachineSource) -> None:
        """Register an asynchronous-machine SC source (voltage behind Z_M)."""
        if source.id in self.asynchronous_machine_sources:
            raise ValueError(f"Maszyna asynchroniczna o ID '{source.id}' już istnieje w grafie.")
        if source.node_id not in self.nodes:
            raise ValueError(f"Węzeł '{source.node_id}' nie istnieje w grafie.")
        self.asynchronous_machine_sources[source.id] = source

    def get_asynchronous_machine_sources(self) -> list[AsynchronousMachineSource]:
        """Active asynchronous-machine sources, deterministically ordered by id."""
        sources = [
            s for s in self.asynchronous_machine_sources.values() if getattr(s, "in_service", True)
        ]
        sources.sort(key=lambda s: s.id)
        return sources

    # ── Zasilanie systemowe jako SC source (IEC 60909-0 §3.2). Rejestracja jak
    # dla maszyn: walidacja węzła, deterministyczna kolejność po id. ──────────
    def add_grid_sc_source(self, source: GridShortCircuitSource) -> None:
        """Rejestruje zasilanie systemowe (SEM za Z_Q) w węźle przyłączenia."""
        if source.id in self.grid_sc_sources:
            raise ValueError(f"Źródło sieciowe o ID '{source.id}' już istnieje w grafie.")
        if source.node_id not in self.nodes:
            raise ValueError(f"Węzeł '{source.node_id}' nie istnieje w grafie.")
        self.grid_sc_sources[source.id] = source

    def get_grid_sc_sources(self) -> list[GridShortCircuitSource]:
        """Czynne źródła sieciowe, deterministycznie posortowane po id."""
        sources = [s for s in self.grid_sc_sources.values() if s.in_service]
        sources.sort(key=lambda s: s.id)
        return sources

    def remove_node(self, node_id: str) -> None:
        """
        Usuwa węzeł z grafu sieci.

        Usuwa również wszystkie gałęzie połączone z tym węzłem.

        Args:
            node_id: ID węzła do usunięcia.

        Raises:
            ValueError: Gdy węzeł o podanym ID nie istnieje.
        """
        if node_id not in self.nodes:
            raise ValueError(f"Węzeł o ID '{node_id}' nie istnieje w grafie.")

        # Znajdź i usuń wszystkie gałęzie połączone z tym węzłem
        branches_to_remove = [
            branch_id
            for branch_id, branch in self.branches.items()
            if branch.from_node_id == node_id or branch.to_node_id == node_id
        ]
        switches_to_remove = [
            switch_id
            for switch_id, switch in self.switches.items()
            if switch.from_node_id == node_id or switch.to_node_id == node_id
        ]

        for branch_id in branches_to_remove:
            del self.branches[branch_id]
        for switch_id in switches_to_remove:
            del self.switches[switch_id]

        # Usuń węzeł z grafu NetworkX i ze słownika
        if node_id in self._graph:
            self._graph.remove_node(node_id)
        del self.nodes[node_id]

    def remove_branch(self, branch_id: str) -> None:
        """
        Usuwa gałąź z grafu sieci.

        W przypadku MultiGraph, usuwa konkretną krawędź identyfikowaną
        przez key=branch_id, nie wpływając na inne gałęzie równoległe
        między tą samą parą węzłów.

        Args:
            branch_id: ID gałęzi do usunięcia.

        Raises:
            ValueError: Gdy gałąź o podanym ID nie istnieje.
        """
        if branch_id not in self.branches:
            raise ValueError(f"Gałąź o ID '{branch_id}' nie istnieje w grafie.")

        branch = self.branches[branch_id]

        # Usuń krawędź z grafu NetworkX tylko jeśli gałąź była aktywna
        if self._is_branch_in_service(branch):
            # W MultiGraph usuwamy krawędź po kluczu (key=branch_id)
            if self._graph.has_edge(branch.from_node_id, branch.to_node_id, key=branch_id):
                self._graph.remove_edge(branch.from_node_id, branch.to_node_id, key=branch_id)

        # Usuń gałąź ze słownika
        del self.branches[branch_id]

    def remove_switch(self, switch_id: str) -> None:
        """
        Usuwa łącznik (switch) z grafu sieci.

        Args:
            switch_id: ID łącznika do usunięcia.

        Raises:
            ValueError: Gdy łącznik o podanym ID nie istnieje.
        """
        if switch_id not in self.switches:
            raise ValueError(f"Łącznik o ID '{switch_id}' nie istnieje w grafie.")

        switch = self.switches[switch_id]

        if self._is_switch_active(switch):
            if self._graph.has_edge(switch.from_node_id, switch.to_node_id, key=switch_id):
                self._graph.remove_edge(switch.from_node_id, switch.to_node_id, key=switch_id)

        del self.switches[switch_id]

    def get_node(self, node_id: str) -> Node:
        """
        Zwraca węzeł o podanym ID.

        Args:
            node_id: ID węzła.

        Returns:
            Obiekt Node.

        Raises:
            ValueError: Gdy węzeł o podanym ID nie istnieje.
        """
        if node_id not in self.nodes:
            raise ValueError(f"Węzeł o ID '{node_id}' nie istnieje w grafie.")
        return self.nodes[node_id]

    def get_branch(self, branch_id: str) -> Branch:
        """
        Zwraca gałąź o podanym ID.

        Args:
            branch_id: ID gałęzi.

        Returns:
            Obiekt Branch.

        Raises:
            ValueError: Gdy gałąź o podanym ID nie istnieje.
        """
        if branch_id not in self.branches:
            raise ValueError(f"Gałąź o ID '{branch_id}' nie istnieje w grafie.")
        return self.branches[branch_id]

    def get_switch(self, switch_id: str) -> Switch:
        """
        Zwraca łącznik o podanym ID.

        Args:
            switch_id: ID łącznika.

        Returns:
            Obiekt Switch.

        Raises:
            ValueError: Gdy łącznik o podanym ID nie istnieje.
        """
        if switch_id not in self.switches:
            raise ValueError(f"Łącznik o ID '{switch_id}' nie istnieje w grafie.")
        return self.switches[switch_id]

    def list_switches(self) -> list[Switch]:
        """
        Zwraca listę łączników w sieci.

        Returns:
            Lista łączników posortowana deterministycznie po ID.
        """
        switches = list(self.switches.values())
        switches.sort(key=lambda item: item.id)
        return switches

    # =========================================================================
    # Station Management (Logical Containers - NO PHYSICS)
    # =========================================================================

    def add_station(self, station: Station) -> None:
        """
        Dodaje stację (kontener logiczny) do sieci.

        UWAGA: Stacje są TYLKO grupowaniem logicznym.
        NIE mają wpływu na obliczenia fizyczne.

        Args:
            station: Stacja do dodania.

        Raises:
            ValueError: Gdy stacja o podanym ID już istnieje.
        """
        if station.id in self.stations:
            raise ValueError(f"Stacja o ID '{station.id}' już istnieje w grafie.")
        self.stations[station.id] = station

    def remove_station(self, station_id: str) -> None:
        """
        Usuwa stację z sieci.

        UWAGA: Nie usuwa elementów przypisanych do stacji,
        tylko samą stację jako kontener.

        Args:
            station_id: ID stacji do usunięcia.

        Raises:
            ValueError: Gdy stacja o podanym ID nie istnieje.
        """
        if station_id not in self.stations:
            raise ValueError(f"Stacja o ID '{station_id}' nie istnieje w grafie.")
        del self.stations[station_id]

    def get_station(self, station_id: str) -> Station:
        """
        Zwraca stację o podanym ID.

        Args:
            station_id: ID stacji.

        Returns:
            Obiekt Station.

        Raises:
            ValueError: Gdy stacja o podanym ID nie istnieje.
        """
        if station_id not in self.stations:
            raise ValueError(f"Stacja o ID '{station_id}' nie istnieje w grafie.")
        return self.stations[station_id]

    def get_station_optional(self, station_id: str) -> Station | None:
        """
        Zwraca stację o podanym ID lub None jeśli nie istnieje.

        Args:
            station_id: ID stacji.

        Returns:
            Obiekt Station lub None.
        """
        return self.stations.get(station_id)

    def list_stations(self) -> list[Station]:
        """
        Zwraca listę wszystkich stacji w sieci.

        Returns:
            Lista stacji posortowana deterministycznie po ID.
        """
        stations = list(self.stations.values())
        stations.sort(key=lambda item: item.id)
        return stations

    def get_station_for_bus(self, bus_id: str) -> Station | None:
        """
        Znajduje stację zawierającą dany węzeł.

        Args:
            bus_id: ID węzła.

        Returns:
            Stacja zawierająca węzeł lub None jeśli nie znaleziono.

        Notes:
            Węzeł może należeć do maksymalnie jednej stacji.
            Jeśli jest wiele stacji z tym węzłem, zwraca pierwszą
            znalezioną (deterministycznie po ID stacji).
        """
        for station in sorted(self.stations.values(), key=lambda s: s.id):
            if bus_id in station.bus_ids:
                return station
        return None

    def get_station_for_element(self, element_id: str) -> Station | None:
        """
        Znajduje stację zawierającą dany element (bus, branch, switch).

        Args:
            element_id: ID elementu.

        Returns:
            Stacja zawierająca element lub None jeśli nie znaleziono.
        """
        for station in sorted(self.stations.values(), key=lambda s: s.id):
            if station.contains(element_id):
                return station
        return None

    def get_slack_node(self) -> Node:
        """
        Zwraca jedyny węzeł SLACK w sieci.

        Returns:
            Węzeł typu SLACK.

        Raises:
            ValueError: Gdy brak węzła SLACK lub jest więcej niż jeden.
        """
        slack_nodes = [node for node in self.nodes.values() if node.node_type == NodeType.SLACK]

        if len(slack_nodes) == 0:
            raise ValueError("Brak węzła SLACK w sieci.")

        if len(slack_nodes) > 1:
            raise ValueError(
                f"W sieci znajduje się {len(slack_nodes)} węzłów SLACK, "
                f"powinien być dokładnie jeden."
            )

        return slack_nodes[0]

    def get_connected_nodes(self, node_id: str) -> list[Node]:
        """
        Zwraca listę węzłów sąsiadujących z danym węzłem.

        Zwraca bezpośrednich sąsiadów węzła w grafie topologicznym
        (połączonych aktywnymi gałęziami).

        Args:
            node_id: ID węzła.

        Returns:
            Lista sąsiednich węzłów (posortowana po ID).

        Raises:
            ValueError: Gdy węzeł o podanym ID nie istnieje.
        """
        if node_id not in self.nodes:
            raise ValueError(f"Węzeł o ID '{node_id}' nie istnieje w grafie.")

        neighbor_ids = list(self._graph.neighbors(node_id))
        # Sortuj deterministycznie po ID
        neighbor_ids.sort()

        return [self.nodes[nid] for nid in neighbor_ids]

    def is_connected(self) -> bool:
        """
        Sprawdza czy graf sieci jest spójny.

        Graf jest spójny gdy:
        - Jest co najmniej 1 węzeł
        - Wszystkie węzły są osiągalne z dowolnego innego węzła
          poprzez aktywne gałęzie (in_service=True)

        Analiza spójności jest wykonywana na grafie prostym utworzonym
        z MultiGraph, aby wielokrotne krawędzie nie wpływały na wynik.

        Returns:
            True jeśli jest co najmniej 1 węzeł i graf jest spójny,
            False w przeciwnym razie.
        """
        if len(self.nodes) == 0:
            return False
        return len(self._skladowe()) == 1

    def _skladowe(self) -> tuple[tuple[str, ...], ...]:
        """Składowe spójne po aktywnych gałęziach i łącznikach — jedyne jądro
        (``network_model.core.topologia.skladowe_spojne``, CV-4.3); kolejność =
        pierwsze napotkanie węzła w porządku wstawiania (jak dawne ``nx.connected_components``)."""
        krawedzie = [(str(a), str(b)) for a, b in self._graph.edges()]
        return skladowe_spojne(list(self.nodes.keys()), krawedzie)

    def find_islands(self) -> list[list[str]]:
        """
        Znajduje wyspy (komponenty spójności) w grafie sieci.

        Analizuje topologię aktywnych gałęzi i zwraca listę komponentów
        spójności. Każdy komponent to grupa węzłów połączonych aktywnymi
        gałęziami.

        Analiza jest wykonywana na grafie prostym utworzonym z MultiGraph,
        aby wielokrotne krawędzie nie wpływały na topologię.

        Returns:
            Lista wysp, gdzie każda wyspa to lista ID węzłów.
            Węzły wewnątrz wyspy są posortowane alfabetycznie po ID.
            Wyspy są posortowane malejąco po liczbie węzłów.
        """
        if len(self.nodes) == 0:
            return []
        islands = [list(skladowa) for skladowa in self._skladowe()]
        # Posortuj wyspy malejąco po długości (stabilnie — kolejność napotkania)
        islands.sort(key=lambda x: len(x), reverse=True)
        return islands

    def _validate_single_slack(self) -> None:
        """
        Sprawdza czy w sieci jest maksymalnie 1 węzeł SLACK.

        Raises:
            ValueError: Gdy w sieci jest więcej niż 1 węzeł SLACK.
        """
        slack_count = sum(1 for node in self.nodes.values() if node.node_type == NodeType.SLACK)

        if slack_count > 1:
            raise ValueError(
                f"W sieci może być maksymalnie jeden węzeł SLACK, " f"aktualnie jest {slack_count}."
            )

    def _rebuild_graph(self) -> None:
        """
        Przebudowuje graf NetworkX na podstawie nodes i branches.

        Metoda tworzy nowy MultiGraph z węzłów i aktywnych gałęzi.
        Każda krawędź jest identyfikowana przez key=branch.id.
        Przydatne po zmianie statusu in_service gałęzi.
        """
        self._graph = nx.MultiGraph()

        # Dodaj wszystkie węzły
        for node_id in self.nodes:
            self._graph.add_node(node_id)

        # Dodaj krawędzie tylko dla aktywnych gałęzi
        for branch in self.branches.values():
            if self._is_branch_in_service(branch):
                self._graph.add_edge(
                    branch.from_node_id,
                    branch.to_node_id,
                    key=branch.id,
                    branch_id=branch.id,
                    edge_kind="branch",
                    branch_type=branch.branch_type.value,
                    name=branch.name,
                )
        for switch in self.switches.values():
            if self._is_switch_active(switch):
                self._graph.add_edge(
                    switch.from_node_id,
                    switch.to_node_id,
                    key=switch.id,
                    switch_id=switch.id,
                    edge_kind="switch",
                    switch_type=switch.switch_type.value,
                    state=switch.state.value,
                    name=switch.name,
                )

    def _is_branch_in_service(self, branch: Branch) -> bool:
        """
        Sprawdza czy gałąź jest aktywna (in_service).

        Args:
            branch: Gałąź do sprawdzenia.

        Returns:
            True jeśli gałąź jest aktywna, False w przeciwnym razie.
        """
        return getattr(branch, "in_service", True)

    def _is_inverter_in_service(self, source: InverterSource) -> bool:
        """
        Sprawdza czy źródło falownikowe jest aktywne (in_service).

        Args:
            source: Źródło falownikowe do sprawdzenia.

        Returns:
            True jeśli źródło jest aktywne, False w przeciwnym razie.
        """
        return getattr(source, "in_service", True)

    def _is_switch_in_service(self, switch: Switch) -> bool:
        """
        Sprawdza czy łącznik jest aktywny (in_service).

        Args:
            switch: Łącznik do sprawdzenia.

        Returns:
            True jeśli łącznik jest aktywny, False w przeciwnym razie.
        """
        return getattr(switch, "in_service", True)

    def _is_switch_active(self, switch: Switch) -> bool:
        """
        Sprawdza czy łącznik tworzy połączenie topologiczne.

        Łącznik jest aktywny gdy:
        - in_service=True
        - state=CLOSED
        """
        return self._is_switch_in_service(switch) and switch.is_closed

    def __repr__(self) -> str:
        """Zwraca czytelną reprezentację tekstową grafu."""
        connected = self.is_connected() if self.nodes else False
        return (
            f"NetworkGraph(nodes={len(self.nodes)}, "
            f"branches={len(self.branches)}, "
            f"switches={len(self.switches)}, "
            f"stations={len(self.stations)}, "
            f"connected={connected})"
        )
