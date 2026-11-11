"""
Moduł grafu sieci elektroenergetycznej.

Ten moduł zawiera klasę NetworkGraph reprezentującą topologię sieci
elektroenergetycznej z wykorzystaniem biblioteki NetworkX do analizy
spójności i znajdowania wysp.
"""

from collections.abc import Iterable

import networkx as nx
from network_model.nazwy import opis_rodzaju_i_nazwy
from network_model.odmowa_danych import OdmowaNazwana

from .branch import Branch
from .grid_source import GridShortCircuitSource
from .inverter import InverterSource
from .machine import AsynchronousMachineSource, SynchronousMachineSource
from .node import Node, NodeType
from .station import Station
from .switch import Switch
from .topologia import skladowe_spojne

#: Kody odmów grafu IR (pole `kod` odmowy nazwanej; identyfikatory w `dane`, nigdy w treści —
#: partia integracji 10, klasa „identyfikator w treści odmowy").
KOD_GRAF_ELEMENT_POWTORZONY = "graf.element_powtorzony"
KOD_GRAF_WEZEL_SPOZA_GRAFU = "graf.wezel_spoza_grafu"
KOD_GRAF_PETLA_WLASNA = "graf.petla_wlasna"
KOD_GRAF_BRAK_WEZLA_BILANSUJACEGO = "graf.brak_wezla_bilansujacego"
KOD_GRAF_WIELE_WEZLOW_BILANSUJACYCH = "graf.wiele_wezlow_bilansujacych"


def _odmowa_powtorzenia(rodzaj: str, element: object, element_id: str) -> OdmowaNazwana:
    """Element o identyfikatorze już obecnym w grafie (identyfikator w `dane`)."""
    return OdmowaNazwana(
        f"{opis_rodzaju_i_nazwy(rodzaj, getattr(element, 'name', None))} występuje w grafie "
        "sieci dwukrotnie — każdy element modelu wchodzi do grafu jeden raz.",
        kod=KOD_GRAF_ELEMENT_POWTORZONY,
        dane={"element_ref": element_id},
    )


def _odmowa_wezla_spoza_grafu(
    rodzaj: str, element: object, element_id: str, koniec: str, wezel_id: str
) -> OdmowaNazwana:
    """Element przyłączony do węzła, którego nie ma w grafie (oba identyfikatory w `dane`)."""
    return OdmowaNazwana(
        f"{opis_rodzaju_i_nazwy(rodzaj, getattr(element, 'name', None))}: {koniec} nie należy "
        "do grafu sieci — element nie ma do czego się przyłączyć.",
        kod=KOD_GRAF_WEZEL_SPOZA_GRAFU,
        dane={"element_ref": element_id, "wezel_ref": wezel_id},
    )


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
        # Karta PODSTAWA-Q (rozstrzygnięcie 3, zasada nr 4): wartości robocze parametrów maszyn
        # wirujących (x″d, cos φ_r, I_LR/I_rM, η_r, p) — id źródła → wpisy rejestru
        # `wartosci_robocze.wpis_parametru_maszyny`. Metadana mostu ENM → graf dla śladu biegu
        # i danych przyjętych werdyktów; solvery jej nie czytają (liczą z pól źródła).
        self.wartosci_robocze_maszyn: dict[str, tuple[dict, ...]] = {}
        self._graph: nx.MultiGraph = nx.MultiGraph()

    def add_node(self, node: Node) -> None:
        """
        Dodaje węzeł do grafu sieci.

        Walidacje:
        - node.id nie może istnieć już w nodes

        Węzeł SLACK = szyna o ZADANYM napięciu (szyna źródła sieciowego). Graf może
        mieć ich wiele — po jednej na wyspę (CV-4.3 K3b, A3-05): solvery FROZEN nie
        czytają ``NodeType.SLACK`` (rozpływ bierze szynę bilansującą z
        ``PowerFlowInput.slack`` i liczy WYSPĘ tej szyny, ``build_slack_island``;
        zwarcie stampuje KAŻDE źródło sieciowe jako bocznik Y_Q, V12K-184). Dawny
        inwariant „maksymalnie jeden SLACK w całym grafie" był więc regułą
        WEJŚCIA rozpływu wpisaną w IR i odmawiał całej sieci z dwoma GPZ w
        osobnych wyspach; regułą wejścia rządzi assembler
        (``enm/assembler.py::zloz_wejscie_rozplywu``: jedna szyna bilansująca na
        wyspę, dwie w jednej wyspie = odmowa nazwana
        ``source.multiple_grid_sources_in_island``).

        Args:
            node: Węzeł do dodania.

        Raises:
            ValueError: Gdy węzeł o podanym ID już istnieje.
        """
        if node.id in self.nodes:
            raise _odmowa_powtorzenia("Węzeł", node, node.id)

        self.nodes[node.id] = node
        self._graph.add_node(node.id)

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
            raise _odmowa_powtorzenia("Gałąź", branch, branch.id)

        for koniec, wezel_id in (
            ("węzeł początkowy", branch.from_node_id),
            ("węzeł końcowy", branch.to_node_id),
        ):
            if wezel_id not in self.nodes:
                raise _odmowa_wezla_spoza_grafu("Gałąź", branch, branch.id, koniec, wezel_id)

        if branch.from_node_id == branch.to_node_id:
            raise self._odmowa_petli_wlasnej("Gałąź", branch, branch.id, branch.from_node_id)

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
            raise _odmowa_powtorzenia("Łącznik", switch, switch.id)

        for koniec, wezel_id in (
            ("węzeł początkowy", switch.from_node_id),
            ("węzeł końcowy", switch.to_node_id),
        ):
            if wezel_id not in self.nodes:
                raise _odmowa_wezla_spoza_grafu("Łącznik", switch, switch.id, koniec, wezel_id)

        if switch.from_node_id == switch.to_node_id:
            raise self._odmowa_petli_wlasnej("Łącznik", switch, switch.id, switch.from_node_id)

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

    def _odmowa_petli_wlasnej(
        self, rodzaj: str, element: object, element_id: str, wezel_id: str
    ) -> OdmowaNazwana:
        """Gałąź albo łącznik łączący węzeł sam ze sobą (identyfikatory w `dane`)."""
        wezel = opis_rodzaju_i_nazwy("węzeł", self.nodes[wezel_id].name)
        return OdmowaNazwana(
            f"{opis_rodzaju_i_nazwy(rodzaj, getattr(element, 'name', None))} łączy {wezel} "
            "sam ze sobą — element musi mieć dwa różne końce.",
            kod=KOD_GRAF_PETLA_WLASNA,
            dane={"element_ref": element_id, "wezel_ref": wezel_id},
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
            raise _odmowa_powtorzenia("Źródło falownikowe", source, source.id)
        if source.node_id not in self.nodes:
            raise _odmowa_wezla_spoza_grafu(
                "Źródło falownikowe", source, source.id, "węzeł przyłączenia", source.node_id
            )
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
            raise _odmowa_powtorzenia("Maszyna synchroniczna", source, source.id)
        if source.node_id not in self.nodes:
            raise _odmowa_wezla_spoza_grafu(
                "Maszyna synchroniczna", source, source.id, "węzeł przyłączenia", source.node_id
            )
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
            raise _odmowa_powtorzenia("Maszyna asynchroniczna", source, source.id)
        if source.node_id not in self.nodes:
            raise _odmowa_wezla_spoza_grafu(
                "Maszyna asynchroniczna", source, source.id, "węzeł przyłączenia", source.node_id
            )
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
            raise _odmowa_powtorzenia("Źródło sieciowe", source, source.id)
        if source.node_id not in self.nodes:
            raise _odmowa_wezla_spoza_grafu(
                "Źródło sieciowe", source, source.id, "węzeł przyłączenia", source.node_id
            )
        self.grid_sc_sources[source.id] = source

    def get_grid_sc_sources(self) -> list[GridShortCircuitSource]:
        """Czynne źródła sieciowe (z Z_Q), deterministycznie posortowane po id.

        Konsument impedancji Z_Q.
        """
        sources = [s for s in self.grid_sc_sources.values() if s.in_service]
        sources.sort(key=lambda s: s.id)
        return sources

    def wezly_zrodel_sieciowych(self) -> list[str]:
        """Węzły przyłączenia czynnych źródeł sieciowych — topologia.

        Dla odczytów, które pytają WYŁĄCZNIE, gdzie sieć zasilająca wchodzi do grafu (wyspy z
        odniesieniem, kierunek zasilania), nie o jej impedancję; posortowane, bez powtórzeń.
        """
        wezly = {s.node_id for s in self.grid_sc_sources.values() if s.in_service}
        return sorted(wezly)

    def wezly_bez_impedancji_do_odniesienia(self) -> frozenset[str]:
        """Węzły, których wyspa nie ma ŻADNEGO elementu z impedancją do odniesienia.

        Wyspa = komponent spójności aktywnych gałęzi i zamkniętych łączników
        (``find_islands``); element z impedancją do odniesienia = źródło sieciowe
        (``grid_sc_sources``), maszyna synchroniczna albo asynchroniczna w ruchu. Metoda
        równoważnego źródła napięciowego (IEC 60909-0 §4.2) wymaga skończonej impedancji Z_kk
        widzianej z węzła do odniesienia; falownik jest źródłem prądowym bez impedancji (§6.8),
        więc wyspa zasilana wyłącznie falownikami ma Y-bus osobliwą — ``np.linalg.inv``
        (``short_circuit_core.build_zbus``, FROZEN, B-01) oddaje wtedy liczby zależne od
        biblioteki algebry liniowej, nie od sieci, albo (macierz dokładnie osobliwa) wywraca
        bieg. Pomiar 2026-09-05 (CI run 4877 vs lokalnie, sieć G04/06 rejestru): lokalnie
        R/X = −32 dokładnie, κ ≈ 5·10⁴¹, na CI inne śmieci mieszczące się w paśmie —
        kwalifikacja po LICZBACH była funkcją maszyny. Wyspa jest funkcją WEJŚCIA, więc
        kwalifikacja po niej jest deterministyczna i przenośna (CI-PARYTET-5).

        JEDYNY predykat wysp bez odniesienia dla każdego czytelnika macierzy Z-bus sieci
        zwarciowej: graf solvera zwarć (``enm.assembler``, CV-4.3 K3b — węzły usuwane
        ``podgraf``) i impedancja zastępcza Thévenina szyn analiz V12.6
        (``solver_input.v126_contracts.impedancje_zastepcze_szyn``). Źródło sieciowe bez Z_Q
        (odmowa odroczona, karta WSPOLCZYNNIK-C-JEDEN-NOSNIK) nadal jest odniesieniem
        topologii — jego brak danej odmawia konsument impedancji, nie ta kwalifikacja.
        """
        wezly_odniesienia: set[str] = set(self.wezly_zrodel_sieciowych())
        for zrodla in (
            self.synchronous_machine_sources,
            self.asynchronous_machine_sources,
        ):
            wezly_odniesienia.update(
                s.node_id for s in zrodla.values() if getattr(s, "in_service", True)
            )
        bez_odniesienia: set[str] = set()
        for wyspa in self.find_islands():
            if not any(wezel in wezly_odniesienia for wezel in wyspa):
                bez_odniesienia.update(wyspa)
        return frozenset(bez_odniesienia)

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
            raise OdmowaNazwana(
                "Węzła wskazanego do usunięcia nie ma w grafie sieci.",
                kod=KOD_GRAF_WEZEL_SPOZA_GRAFU,
                dane={"wezel_ref": node_id},
            )

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
            raise _odmowa_powtorzenia("Stacja", station, station.id)
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

    def get_slack_node_ids(self) -> list[str]:
        """ID wszystkich węzłów SLACK (szyn o zadanym napięciu), posortowane."""
        return sorted(
            node_id for node_id, node in self.nodes.items() if node.node_type == NodeType.SLACK
        )

    def get_slack_node(self) -> Node:
        """
        Zwraca jedyny węzeł SLACK w sieci.

        Returns:
            Węzeł typu SLACK.

        Raises:
            ValueError: Gdy brak węzła SLACK lub jest więcej niż jeden (sieć z kilkoma
                szynami o zadanym napięciu — wołający musi wskazać szynę bilansującą
                jawnie, np. z ``get_slack_node_ids()`` albo z wyspy ``TopologyView``).
        """
        slack_ids = self.get_slack_node_ids()

        if len(slack_ids) == 0:
            raise OdmowaNazwana(
                "Sieć nie ma węzła bilansującego (SLACK).", kod=KOD_GRAF_BRAK_WEZLA_BILANSUJACEGO
            )

        if len(slack_ids) > 1:
            opisy = ", ".join(
                opis_rodzaju_i_nazwy("węzeł", self.nodes[wezel_id].name) for wezel_id in slack_ids
            )
            raise OdmowaNazwana(
                f"W sieci jest {len(slack_ids)} węzłów bilansujących (SLACK): {opisy} — "
                "wskaż szynę bilansującą jawnie (po jednej na wyspę).",
                kod=KOD_GRAF_WIELE_WEZLOW_BILANSUJACYCH,
                dane={"wezly_ref": tuple(slack_ids)},
            )

        return self.nodes[slack_ids[0]]

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

    def podgraf(self, wezly: Iterable[str]) -> "NetworkGraph":
        """Podgraf indukowany zbiorem węzłów — TE SAME obiekty elementów, nowy kontener.

        Wchodzą: węzły ``wezly``, gałęzie i łączniki o OBU końcach w zbiorze, źródła
        (falownikowe, maszynowe, sieciowe SC) przyłączone do węzłów zbioru. Stacje
        (kontener logiczny bez fizyki) nie są kopiowane. Elementy są współdzielone
        z grafem macierzystym (bez kopii): mutacja przez solver (np. pozycja
        zaczepu przestawiona pętlą regulatora) jest widoczna w obu grafach — tak
        samo jak dziś, gdy wykonawca oddaje graf solverowi na własność.

        Użycie (CV-4.3 K3b): jedno wejście rozpływu na wyspę zasiloną (solver
        FROZEN liczy wyspę szyny bilansującej i nic więcej; regulator zaczepowy
        czyta napięcia tylko swojej wyspy) oraz graf zwarciowy bez wysp
        pływających (Y-bus nieosobliwa). Kolejność wstawiania = kolejność w grafie
        macierzystym (deterministyczna).
        """
        zbior = set(wezly)
        nieznane = sorted(zbior - set(self.nodes))
        if nieznane:
            raise ValueError(f"Węzły spoza grafu: {', '.join(nieznane)}")
        podgraf = NetworkGraph(network_model_id=self.network_model_id)
        for node_id, node in self.nodes.items():
            if node_id in zbior:
                podgraf.add_node(node)
        for branch in self.branches.values():
            if branch.from_node_id in zbior and branch.to_node_id in zbior:
                podgraf.add_branch(branch)
        for switch in self.switches.values():
            if switch.from_node_id in zbior and switch.to_node_id in zbior:
                podgraf.add_switch(switch)
        for inverter in self.inverter_sources.values():
            if inverter.node_id in zbior:
                podgraf.add_inverter_source(inverter)
        for synchronous in self.synchronous_machine_sources.values():
            if synchronous.node_id in zbior:
                podgraf.add_synchronous_machine_source(synchronous)
        for asynchronous in self.asynchronous_machine_sources.values():
            if asynchronous.node_id in zbior:
                podgraf.add_asynchronous_machine_source(asynchronous)
        for grid_source in self.grid_sc_sources.values():
            if grid_source.node_id in zbior:
                podgraf.add_grid_sc_source(grid_source)
        podgraf.k_sc_assumptions_trace = list(self.k_sc_assumptions_trace)
        podgraf.wartosci_robocze_maszyn = {
            id_zrodla: wpisy
            for id_zrodla, wpisy in self.wartosci_robocze_maszyn.items()
            if id_zrodla in podgraf.synchronous_machine_sources
            or id_zrodla in podgraf.asynchronous_machine_sources
        }
        return podgraf

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
