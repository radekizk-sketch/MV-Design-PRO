"""P0.4 (nN): dekompozycja ΔU per odcinek wzdłuż ścieżki źródło (SLACK)→węzeł.

Warstwa ANALIZA (interpretacja, NIE solver). Czyta WYŁĄCZNIE napięcia już
rozwiązane przez power-flow solver (``PowerFlowResultV1.bus_results`` —
frozen Result API, ``network_model/solvers/power_flow_result.py``) i
topologię ``NetworkGraph`` (dla trasy elektrycznej + napięcia znamionowego
per węzeł, potrzebnego do przeliczenia p.u. → kV — ten sam wzorzec co
``VoltageProfileBuilder._build_row``). ``delta_u_kv``/``delta_u_percent`` to
CZYSTA ARYTMETYCZNA różnica dwóch już policzonych napięć węzłów — zero
fizyki, żadna wartość nie jest tu przeliczana ponownie przez solver.

Ścieżka źródło→węzeł: BFS po aktywnej topologii grafu (``NetworkGraph._graph``
— ten sam prywatny atrybut już czytany z warstwy analizy w
``analysis/boundary/identifier.py::_voltage_level_boundary_nodes``, więc to
NIE jest nowy precedens dostępu). Aktywna topologia = gałęzie ``in_service``
i łączniki ``CLOSED`` — dokładnie ten zestaw krawędzi, który
``NetworkGraph.add_branch``/``add_switch`` już wpisuje do ``_graph`` (jedna
prawda topologii, żadnego powielania filtra ``in_service``/``state``).

Segmenty w wyniku obejmują WYŁĄCZNIE gałęzie (kabel/linia/transformator) —
łączniki na trasie są używane do połączenia topologicznego, ale pomijane w
liście segmentów (zerowa impedancja, nic do zdekomponowania w rozkładzie
ΔU). Ponieważ zamknięty łącznik jest w solverze modelowany jako gałąź o
BARDZO DUŻEJ admitancji (nie dosłownie nieskończonej — patrz
``Y_CLOSED_SWITCH`` w ``power_flow_newton_internal.py``), spadek napięcia na
nim jest numerycznie znikomy, ale nie dokładnie zerowy bitowo — stąd
wewnętrzna asercja telescoping sum poniżej używa małej tolerancji
numerycznej, a nie równości bitowej.
"""

from __future__ import annotations

from analysis.voltage_profile.models import VoltageProfileSegment, VoltageProfileSegmentPath
from network_model.core.graph import NetworkGraph
from network_model.core.topologia import przeglad_wszerz
from network_model.solvers.power_flow_result import PowerFlowResultV1

# Pasmo nN: `voltage_kv < 1.0` (ta sama granica co prywatna
# `enm.validator._voltage_band`/`_VOLTAGE_BAND_NN_MAX` — nie importowana
# wprost, żeby nie wiązać `analysis/` runtime z prywatnym symbolem `enm/` dla
# jednej stałej; wartość przypięta 1:1 i pilnowana testem przeciw rozjazdowi,
# patrz `test_voltage_profile_segment_decomposition.py::
# test_pasmo_nn_threshold_matches_enm_validator_band`).
PASMO_NN_MAX_KV = 1.0


# Tolerancja telescoping-sum (§0.2 karty P0.4): suma delta_u segmentów musi
# odpowiadać u_source_kv - u_node_kv. Łączniki zamknięte na trasie (pomijane
# w segmentach) mają numerycznie znikomy, ale niezerowy spadek — patrz
# docstring modułu. Stała 1e-4 kV (0,1 V) — dowód empiryczny: rezyduum
# pojedynczego zamkniętego łącznika w rzeczywistych sieciach testowych tego
# pliku mieści się w 5e-7..4e-6 kV (0,4..15 kV źródła), więc próg zostaje o
# 1-2 rzędy wielkości NAD szumem numerycznym łącznika, a jednocześnie o 2-4
# rzędy wielkości POD realnym spadkiem napięcia na gałęzi z impedancją
# (dziesiąte części V do kV) — nie maskuje błędu fizyki, tylko szum modelu
# łącznika (`Y_CLOSED_SWITCH`, `power_flow_newton_internal.py`).
_TELESCOPING_TOLERANCE_KV = 1e-4


class VoltageProfileSegmentPathError(ValueError):
    """Węzeł źródłowy/docelowy nieznany w grafie albo nieosiągalny z niego."""


class VoltageProfileSegmentBuilder:
    """Buduje dekompozycję ΔU per odcinek dla zadanego węzła docelowego."""

    def __init__(self, graph: NetworkGraph) -> None:
        self._graph = graph

    def build_path(
        self,
        pf_result: PowerFlowResultV1,
        node_id: str,
        source_id: str | None = None,
    ) -> VoltageProfileSegmentPath:
        """Zbuduj listę segmentów ΔU od źródła (domyślnie SLACK grafu) do ``node_id``.

        Raises:
            VoltageProfileSegmentPathError: węzeł źródłowy/docelowy nie
                istnieje w grafie, nie jest osiągalny w aktywnej topologii,
                albo brak jego napięcia w ``pf_result`` (np. poza wyspą
                SLACK — ``status="not_solved"``).
        """
        resolved_source_id = source_id if source_id is not None else self._graph.get_slack_node().id
        if resolved_source_id not in self._graph.nodes:
            raise VoltageProfileSegmentPathError(
                f"Węzeł źródłowy '{resolved_source_id}' nie istnieje w grafie."
            )
        if node_id not in self._graph.nodes:
            raise VoltageProfileSegmentPathError(f"Węzeł '{node_id}' nie istnieje w grafie.")

        bus_v_pu = {bus.bus_id: bus.v_pu for bus in pf_result.bus_results}
        u_source_kv = self._bus_kv(resolved_source_id, bus_v_pu)
        u_node_kv = self._bus_kv(node_id, bus_v_pu)

        hops = self._bfs_hops(resolved_source_id, node_id)

        segments: list[VoltageProfileSegment] = []
        for from_bus, to_bus, edge_id, edge_kind in hops:
            if edge_kind != "branch":
                # Łącznik zamknięty na trasie: żadnej impedancji do
                # zdekomponowania (patrz docstring modułu) — pomijamy w
                # liście segmentów, ale hop już policzył się do połączenia
                # topologicznego powyżej.
                continue
            u_from_kv = self._bus_kv(from_bus, bus_v_pu)
            u_to_kv = self._bus_kv(to_bus, bus_v_pu)
            delta_u_kv = u_from_kv - u_to_kv
            u_nom_to_kv = self._u_nom(to_bus)
            delta_u_percent = (delta_u_kv / u_nom_to_kv) * 100.0 if u_nom_to_kv else 0.0
            segments.append(
                VoltageProfileSegment(
                    branch_id=edge_id,
                    from_bus=from_bus,
                    to_bus=to_bus,
                    u_from_kv=u_from_kv,
                    u_to_kv=u_to_kv,
                    delta_u_kv=delta_u_kv,
                    delta_u_percent=delta_u_percent,
                )
            )

        total_delta_u_kv = sum(segment.delta_u_kv for segment in segments)
        expected_delta_u_kv = u_source_kv - u_node_kv
        if abs(total_delta_u_kv - expected_delta_u_kv) > _TELESCOPING_TOLERANCE_KV:
            raise AssertionError(
                "Niezmiennik dekompozycji ΔU naruszony: suma segmentów "
                f"({total_delta_u_kv!r} kV) != u_source_kv - u_node_kv "
                f"({expected_delta_u_kv!r} kV) dla ścieżki "
                f"'{resolved_source_id}' -> '{node_id}'."
            )

        return VoltageProfileSegmentPath(
            node_id=node_id,
            source_id=resolved_source_id,
            u_source_kv=u_source_kv,
            u_node_kv=u_node_kv,
            segments=tuple(segments),
        )

    def _u_nom(self, bus_id: str) -> float:
        node = self._graph.nodes.get(bus_id)
        return float(node.voltage_level) if node is not None else 0.0

    def _bus_kv(self, bus_id: str, bus_v_pu: dict[str, float]) -> float:
        v_pu = bus_v_pu.get(bus_id)
        if v_pu is None:
            raise VoltageProfileSegmentPathError(
                f"Brak napięcia węzła '{bus_id}' w wyniku rozpływu (PowerFlowResultV1)."
            )
        if v_pu != v_pu:  # NaN (bus poza wyspą SLACK, status="not_solved")
            raise VoltageProfileSegmentPathError(
                f"Węzeł '{bus_id}' nie ma rozwiązanego napięcia (not_solved)."
            )
        return v_pu * self._u_nom(bus_id)

    def _bfs_hops(self, source_id: str, target_id: str) -> list[tuple[str, str, str, str]]:
        """BFS (najmniej-hopowa) ścieżka źródło→cel po aktywnej topologii.

        Zwraca uporządkowaną listę hopów ``(from_node, to_node, edge_id,
        edge_kind)`` — ``edge_kind`` to ``"branch"`` albo ``"switch"`` (te same
        etykiety, którymi ``NetworkGraph.add_branch``/``add_switch`` znaczy
        krawędzie grafu topologicznego). Sortowanie sąsiadów i — przy gałęziach
        równoległych — kluczy krawędzi zapewnia deterministyczny wynik
        (stabilne sortowanie, karta P0.4 §0.2).
        """
        # Dostęp do prywatnego `_graph` (networkx) — precedens
        # `analysis/boundary/identifier.py::_voltage_level_boundary_nodes`.
        nx_graph = self._graph._graph
        if source_id not in nx_graph or target_id not in nx_graph:
            raise VoltageProfileSegmentPathError(
                f"Węzeł '{source_id}' lub '{target_id}' nie ma krawędzi w aktywnej topologii grafu."
            )
        if source_id == target_id:
            return []

        def _sasiedzi(current: str) -> list[tuple[tuple[str, str], str]]:
            wynik: list[tuple[tuple[str, str], str]] = []
            for neighbor in sorted(nx_graph.neighbors(current)):
                edge_data = nx_graph.get_edge_data(current, neighbor)
                edge_key = sorted(edge_data.keys())[0]
                edge_kind = edge_data[edge_key].get("edge_kind", "branch")
                wynik.append(((edge_key, edge_kind), neighbor))
            return wynik

        # Jedyne jądro przeglądu (``network_model.core.topologia.przeglad_wszerz``, CV-4.3):
        # poprzednik z PIERWSZEJ drogi w kolejności posortowanych sąsiadów — jak dotąd.
        drzewo = przeglad_wszerz(source_id, _sasiedzi)
        predecessor: dict[str, tuple[str, str, str]] = {
            wezel: (rodzic[1], rodzic[0][0], rodzic[0][1])
            for wezel, rodzic in drzewo.items()
            if rodzic is not None
        }

        if target_id not in predecessor:
            raise VoltageProfileSegmentPathError(
                f"Węzeł '{target_id}' nie jest osiągalny z '{source_id}' w aktywnej topologii "
                "(gałęzie in_service + łączniki CLOSED)."
            )

        hops: list[tuple[str, str, str, str]] = []
        node = target_id
        while node != source_id:
            prev, edge_key, edge_kind = predecessor[node]
            hops.append((prev, node, edge_key, edge_kind))
            node = prev
        hops.reverse()
        return hops


def find_worst_nn_bus(
    graph: NetworkGraph, pf_result: PowerFlowResultV1
) -> tuple[str, float] | None:
    """Węzeł o najniższym |V| p.u. w paśmie nN (``voltage_kv < 1.0``).

    Zwraca ``(bus_id, v_pu)`` albo ``None`` gdy sieć nie ma żadnej rozwiązanej
    szyny nN (uczciwy brak — zero fabrykacji). Wykluczone: szyny bez wyniku
    (poza wyspą SLACK, ``v_pu`` = NaN). Remis rozstrzygany deterministycznie
    po ``bus_id`` (sortowanie stabilne, karta P0.4 §0.2).
    """
    bus_v_pu = {bus.bus_id: bus.v_pu for bus in pf_result.bus_results}
    candidates = [
        (bus_v_pu[node_id], node_id)
        for node_id, node in graph.nodes.items()
        if 0.0 < node.voltage_level < PASMO_NN_MAX_KV
        and node_id in bus_v_pu
        and bus_v_pu[node_id] == bus_v_pu[node_id]  # odrzuć NaN (not_solved)
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda pair: (pair[0], pair[1]))
    v_pu, bus_id = candidates[0]
    return bus_id, v_pu


def find_worst_nn_path(
    graph: NetworkGraph,
    pf_result: PowerFlowResultV1,
    source_id: str | None = None,
) -> VoltageProfileSegmentPath | None:
    """Ścieżka ΔU od źródła do najgorszej (najniższe |V| p.u.) szyny nN.

    Zwraca ``None`` gdy sieć nie ma żadnej rozwiązanej szyny nN (uczciwy brak).
    """
    worst = find_worst_nn_bus(graph, pf_result)
    if worst is None:
        return None
    worst_bus_id, _v_pu = worst
    return VoltageProfileSegmentBuilder(graph).build_path(
        pf_result, worst_bus_id, source_id=source_id
    )
