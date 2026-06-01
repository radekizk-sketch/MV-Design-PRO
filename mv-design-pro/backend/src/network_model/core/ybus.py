"""
Builder macierzy admitancyjnej (Y-bus) dla sieci elektroenergetycznej.

Macierz Y-bus jest wyznaczana na podstawie danych z NetworkGraph
(nodes, branches, switches). Gałęzie nieaktywne (in_service=False)
nie są uwzględniane. Zamknięte łączniki (switches) powodują scalenie
węzłów (zero-impedance merge) zgodnie z IEC 60909.

System per-unit:
    Sbase = 100 MVA (konfigurowalny)
    Vbase_i = voltage_level_kv węzła i
    Zbase_i = Vbase_i² / Sbase [Ω]
    Y-bus, Z-bus w jednostkach per-unit
"""

from __future__ import annotations

import numpy as np

from .branch import Branch, LineBranch, TransformerBranch
from .graph import NetworkGraph
from .node import NodeType

S_BASE_MVA: float = 100.0


class _UnionFind:
    """Union-Find do scalania węzłów połączonych zamkniętymi łącznikami."""

    def __init__(self, elements: list[str]) -> None:
        self._parent: dict[str, str] = {e: e for e in elements}

    def find(self, x: str) -> str:
        while self._parent[x] != x:
            self._parent[x] = self._parent[self._parent[x]]
            x = self._parent[x]
        return x

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            if ra > rb:
                ra, rb = rb, ra
            self._parent[rb] = ra


class AdmittanceMatrixBuilder:
    """
    Builder macierzy Y-bus w systemie per-unit.

    Zapewnia deterministyczne mapowanie node_id -> indeks macierzy
    (sortowanie alfabetyczne po node_id). Zamknięte łączniki scalają
    węzły (IEC 60909: łącznik zamknięty = zerowa impedancja).

    System per-unit:
        Sbase = S_BASE_MVA (domyślnie 100 MVA)
        Vbase = voltage_level węzła [kV]
        Zbase = Vbase² / Sbase [Ω]
    """

    def __init__(self, graph: NetworkGraph) -> None:
        self._graph = graph
        self._node_id_to_index: dict[str, int] = {}
        self._representative_ids: list[str] = []

    @property
    def node_id_to_index(self) -> dict[str, int]:
        """Zwraca mapowanie node_id -> indeks w macierzy Y-bus."""
        return dict(self._node_id_to_index)

    def _build_merged_node_map(self) -> tuple[list[str], dict[str, int]]:
        """
        Scala węzły połączone zamkniętymi łącznikami i buduje mapowanie.

        Returns:
            Tuple (representative_ids_sorted, all_node_id_to_index).
        """
        all_node_ids = sorted(self._graph.nodes.keys())
        uf = _UnionFind(all_node_ids)

        for sw in self._graph.switches.values():
            if not getattr(sw, "in_service", True):
                continue
            if sw.is_closed:
                if sw.from_node_id in self._graph.nodes and sw.to_node_id in self._graph.nodes:
                    uf.union(sw.from_node_id, sw.to_node_id)

        representatives = sorted({uf.find(nid) for nid in all_node_ids})
        rep_to_idx = {rep: idx for idx, rep in enumerate(representatives)}
        node_to_idx = {nid: rep_to_idx[uf.find(nid)] for nid in all_node_ids}

        return representatives, node_to_idx

    def _get_representative_voltage_kv(self, rep_id: str) -> float:
        """Napięcie znamionowe węzła reprezentatywnego [kV]."""
        return self._graph.nodes[rep_id].voltage_level

    def build(self, ground_slack_buses: bool = True) -> np.ndarray:
        """
        Buduje macierz Y-bus w systemie per-unit.

        Zamknięte łączniki scalają węzły (zero-impedance merge).

        Returns:
            Numpy ndarray o dtype=complex i rozmiarze (n, n) w per-unit.
        """
        self._representative_ids, self._node_id_to_index = self._build_merged_node_map()

        size = len(self._representative_ids)
        y_bus = np.zeros((size, size), dtype=complex)

        for branch in self._graph.branches.values():
            if not branch.in_service:
                continue

            from_idx = self._node_id_to_index[branch.from_node_id]
            to_idx = self._node_id_to_index[branch.to_node_id]

            if from_idx == to_idx:
                continue

            y_series_pu, y_shunt_pu = self._get_branch_admittances_pu(branch)

            y_bus[from_idx, to_idx] -= y_series_pu
            y_bus[to_idx, from_idx] -= y_series_pu

            y_bus[from_idx, from_idx] += y_series_pu + y_shunt_pu
            y_bus[to_idx, to_idx] += y_series_pu + y_shunt_pu

        if ground_slack_buses:
            self._ground_slack_buses(y_bus)
            # Rotating machines (IEC 60909 §6.3/§6.7) are voltage-behind-Z″ sources;
            # in the SC context they add a shunt Y″=1/Z″ at their node, exactly as the
            # slack is grounded. SC context ONLY (ground_slack_buses ⇒ called solely by
            # short_circuit_core); no-op when no machines ⇒ existing networks unchanged.
            self._add_machine_shunts(y_bus)

        return y_bus

    def _ground_slack_buses(self, y_bus: np.ndarray) -> None:
        """
        Dodaje admitancje bocznikowe (do ziemi) dla wezlow SLACK.

        Wezel SLACK (szyna nieskonczona) ma zerowa impedancje wewnetrzna
        → nieskonczona admitancja bocznikowa. W praktyce stosuje sie
        duza wartosc (1e6 pu) zapewniajaca referencje napiecia.
        """
        y_slack_pu = complex(1e6, 0.0)
        seen_indices: set[int] = set()
        for node in self._graph.nodes.values():
            if node.node_type == NodeType.SLACK:
                idx = self._node_id_to_index.get(node.id)
                if idx is not None and idx not in seen_indices:
                    y_bus[idx, idx] += y_slack_pu
                    seen_indices.add(idx)

    def _add_machine_shunts(self, y_bus: np.ndarray) -> None:
        """Add rotating-machine SC sources as shunt admittances Y″ = 1/Z″ (IEC 60909
        §6.3 synchronous, §6.7 asynchronous). A machine is a voltage source behind Z″;
        in the Z-bus method that is a shunt to the (grounded) EMF reference at the
        machine's node. Deterministic order (sources are id-sorted); a no-op when no
        machine sources exist, so machine-free networks keep a byte-identical Y-bus."""
        machines: list[tuple[str, complex]] = [
            (m.node_id, m.z_internal_ohm) for m in self._graph.get_synchronous_machine_sources()
        ] + [
            (m.node_id, m.z_internal_ohm) for m in self._graph.get_asynchronous_machine_sources()
        ]
        for node_id, z_internal_ohm in machines:
            idx = self._node_id_to_index.get(node_id)
            if idx is None or abs(z_internal_ohm) == 0.0:
                continue
            z_base = self.get_zbase_ohm(node_id)
            y_bus[idx, idx] += z_base / z_internal_ohm

    def get_zbase_ohm(self, node_id: str) -> float:
        """Zwraca Zbase [Ω] dla danego węzła: Vn² / Sbase."""
        vn_kv = self._graph.nodes[node_id].voltage_level
        return vn_kv**2 / S_BASE_MVA

    def _get_branch_admittances_pu(self, branch: Branch) -> tuple[complex, complex]:
        """
        Zwraca admitancje w per-unit (Y_series_pu, Y_shunt_per_end_pu).
        """
        if isinstance(branch, LineBranch):
            vn_kv = self._graph.nodes[branch.from_node_id].voltage_level
            z_base = vn_kv**2 / S_BASE_MVA
            z_total_ohm = branch.get_total_impedance()
            if z_total_ohm == 0:
                raise ZeroDivisionError("Cannot compute line admittance: impedance is zero")
            z_pu = z_total_ohm / z_base
            y_series_pu = 1.0 / z_pu
            y_shunt_total_s = branch.get_shunt_admittance()
            y_shunt_total_pu = y_shunt_total_s * z_base
            y_shunt_per_end_pu = y_shunt_total_pu / 2.0
            return y_series_pu, y_shunt_per_end_pu

        if isinstance(branch, TransformerBranch):
            z_pu_sn = branch.get_short_circuit_impedance_pu()
            z_pu_base = z_pu_sn * (S_BASE_MVA / branch.rated_power_mva)
            if z_pu_base == 0:
                raise ZeroDivisionError("Cannot compute transformer admittance: impedance is zero")
            y_series_pu = 1.0 / z_pu_base
            y_shunt_per_end_pu = 0.0 + 0.0j
            return y_series_pu, y_shunt_per_end_pu

        raise ValueError(f"Unsupported branch type: {branch.branch_type}")
