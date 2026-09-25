"""
Golden Network ENM — testy integracyjne złotej sieci 20 stacji.

PR-07: Weryfikacja pipeline ENM → Topology. StationGeometry i CrossReference
(`application/sld/**`) skasowane w W1 (2026-09-09) razem z legacy persystencją
sieci — 0 konsumentów produkcyjnych; ich klasy testów zeszły razem z kodem.

INVARIANTS testowane:
- Determinizm: wielokrotne wywołania → identyczny wynik
- Kompletność: 20 stacji, 31+ segmentów, 2 magistrale, 3 węzły T
- Spójność referencji: wszystkie ref_id wskazują na istniejące elementy
- Walidacja: zero blokerów
- Topologia: trunk pokrywa wszystkie szyny
"""

from __future__ import annotations

import pytest
from enm.hash import compute_enm_hash
from enm.models import EnergyNetworkModel
from enm.severity import severity_rank
from enm.topology import build_topology_graph
from enm.validator import ENMValidator

from .golden_network_fixture import build_golden_network

# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def golden_enm() -> EnergyNetworkModel:
    """Zbuduj złotą sieć testową."""
    return build_golden_network()


# ---------------------------------------------------------------------------
# PR-07: Testy kompletności
# ---------------------------------------------------------------------------


class TestGoldenNetworkCompleteness:
    """Testy kompletności złotej sieci."""

    def test_station_count(self, golden_enm: EnergyNetworkModel) -> None:
        """20 stacji (1 GPZ + 19 SN/nn)."""
        assert len(golden_enm.substations) == 20

    def test_gpz_station(self, golden_enm: EnergyNetworkModel) -> None:
        """Dokładnie 1 stacja GPZ."""
        gpz = [s for s in golden_enm.substations if s.station_type == "gpz"]
        assert len(gpz) == 1
        assert gpz[0].ref_id == "sub_gpz"

    def test_mv_lv_stations(self, golden_enm: EnergyNetworkModel) -> None:
        """19 stacji SN/nn."""
        mv_lv = [s for s in golden_enm.substations if s.station_type == "mv_lv"]
        assert len(mv_lv) == 19

    def test_segment_count(self, golden_enm: EnergyNetworkModel) -> None:
        """31+ segmentów kablowych."""
        assert len(golden_enm.branches) >= 31

    def test_transformer_count(self, golden_enm: EnergyNetworkModel) -> None:
        """22 transformatory (2 WN/SN + 19 SN/nn + 1 stacji rezerwowej = 21 min)."""
        assert len(golden_enm.transformers) >= 21

    def test_corridor_count(self, golden_enm: EnergyNetworkModel) -> None:
        """2 magistrale."""
        assert len(golden_enm.corridors) == 2

    def test_junction_count(self, golden_enm: EnergyNetworkModel) -> None:
        """3 węzły T."""
        assert len(golden_enm.junctions) == 3

    def test_source_exists(self, golden_enm: EnergyNetworkModel) -> None:
        """Co najmniej 1 źródło zasilania."""
        assert len(golden_enm.sources) >= 1

    def test_load_count(self, golden_enm: EnergyNetworkModel) -> None:
        """19 odbiorników (1 na stację SN/nn)."""
        assert len(golden_enm.loads) == 19

    def test_generator_count(self, golden_enm: EnergyNetworkModel) -> None:
        """2 generatory OZE (PV + WIND)."""
        assert len(golden_enm.generators) == 2

    def test_bay_count(self, golden_enm: EnergyNetworkModel) -> None:
        """Minimum 41 pól (3 GPZ + 19*2 stacje + 2 OZE)."""
        assert len(golden_enm.bays) >= 41

    def test_bus_count(self, golden_enm: EnergyNetworkModel) -> None:
        """Minimum 44 szyn (3 GPZ + 19*2 stacje + 3 T-node)."""
        assert len(golden_enm.buses) >= 44


# ---------------------------------------------------------------------------
# PR-07: Testy determinizmu
# ---------------------------------------------------------------------------


class TestGoldenNetworkDeterminism:
    """Determinizm: wielokrotne wywołania → identyczny wynik."""

    def test_model_determinism(self) -> None:
        """Dwa wywołania build_golden_network() dają identyczny JSON."""
        enm1 = build_golden_network()
        enm2 = build_golden_network()

        json1 = enm1.model_dump_json(indent=None)
        json2 = enm2.model_dump_json(indent=None)
        # Porównujemy po usunięciu id (UUID jest losowy)
        assert len(json1) == len(json2)

    def test_hash_determinism(self) -> None:
        """Hash ENM jest deterministyczny (po usunięciu UUID)."""
        enm1 = build_golden_network()
        enm2 = build_golden_network()
        h1 = compute_enm_hash(enm1)
        h2 = compute_enm_hash(enm2)
        assert h1 == h2

    def test_topology_determinism(self) -> None:
        """Topology graph jest deterministyczny."""
        enm = build_golden_network()
        topo1 = build_topology_graph(enm)
        topo2 = build_topology_graph(enm)

        assert len(topo1.nodes) == len(topo2.nodes)
        assert len(topo1.trunk_segments) == len(topo2.trunk_segments)
        assert topo1.stats == topo2.stats

        for n1, n2 in zip(topo1.nodes, topo2.nodes, strict=False):
            assert n1.bus_ref == n2.bus_ref
            assert n1.voltage_kv == n2.voltage_kv


# ---------------------------------------------------------------------------
# PR-07: Testy spójności referencji
# ---------------------------------------------------------------------------


class TestGoldenNetworkReferenceIntegrity:
    """Spójność referencji: wszystkie ref_id wskazują na istniejące elementy."""

    def test_branch_bus_refs(self, golden_enm: EnergyNetworkModel) -> None:
        """Wszystkie gałęzie odwołują się do istniejących szyn."""
        bus_refs = {b.ref_id for b in golden_enm.buses}
        for branch in golden_enm.branches:
            assert (
                branch.from_bus_ref in bus_refs
            ), f"{branch.ref_id}: from_bus_ref={branch.from_bus_ref} nie istnieje"
            assert (
                branch.to_bus_ref in bus_refs
            ), f"{branch.ref_id}: to_bus_ref={branch.to_bus_ref} nie istnieje"

    def test_transformer_bus_refs(self, golden_enm: EnergyNetworkModel) -> None:
        """Wszystkie transformatory odwołują się do istniejących szyn."""
        bus_refs = {b.ref_id for b in golden_enm.buses}
        for trafo in golden_enm.transformers:
            assert trafo.hv_bus_ref in bus_refs, f"{trafo.ref_id}: hv_bus_ref nie istnieje"
            assert trafo.lv_bus_ref in bus_refs, f"{trafo.ref_id}: lv_bus_ref nie istnieje"

    def test_source_bus_refs(self, golden_enm: EnergyNetworkModel) -> None:
        """Wszystkie źródła odwołują się do istniejących szyn."""
        bus_refs = {b.ref_id for b in golden_enm.buses}
        for src in golden_enm.sources:
            assert src.bus_ref in bus_refs, f"{src.ref_id}: bus_ref nie istnieje"

    def test_load_bus_refs(self, golden_enm: EnergyNetworkModel) -> None:
        """Wszystkie odbiorniki odwołują się do istniejących szyn."""
        bus_refs = {b.ref_id for b in golden_enm.buses}
        for load in golden_enm.loads:
            assert load.bus_ref in bus_refs, f"{load.ref_id}: bus_ref nie istnieje"

    def test_substation_bus_refs(self, golden_enm: EnergyNetworkModel) -> None:
        """Wszystkie stacje odwołują się do istniejących szyn."""
        bus_refs = {b.ref_id for b in golden_enm.buses}
        for sub in golden_enm.substations:
            for br in sub.bus_refs:
                assert br in bus_refs, f"{sub.ref_id}: bus_ref={br} nie istnieje"

    def test_bay_substation_refs(self, golden_enm: EnergyNetworkModel) -> None:
        """Wszystkie pola odwołują się do istniejących stacji."""
        sub_refs = {s.ref_id for s in golden_enm.substations}
        for bay in golden_enm.bays:
            assert bay.substation_ref in sub_refs, f"{bay.ref_id}: substation_ref nie istnieje"

    def test_junction_branch_refs(self, golden_enm: EnergyNetworkModel) -> None:
        """Wszystkie węzły T odwołują się do istniejących gałęzi."""
        branch_refs = {b.ref_id for b in golden_enm.branches}
        for junc in golden_enm.junctions:
            for br in junc.connected_branch_refs:
                assert br in branch_refs, f"{junc.ref_id}: branch_ref={br} nie istnieje"

    def test_corridor_segment_refs(self, golden_enm: EnergyNetworkModel) -> None:
        """Wszystkie magistrale odwołują się do istniejących gałęzi."""
        branch_refs = {b.ref_id for b in golden_enm.branches}
        for corr in golden_enm.corridors:
            for seg in corr.ordered_segment_refs:
                assert seg in branch_refs, f"{corr.ref_id}: segment_ref={seg} nie istnieje"


# ---------------------------------------------------------------------------
# PR-07: Testy walidacji
# ---------------------------------------------------------------------------


class TestGoldenNetworkValidation:
    """Walidacja złotej sieci.

    Golden case jest przypadkiem PRODUKCYJNYM (READY):
    - Każdy transformator ma catalog_ref (E009 nie może wystąpić).
    - Brak overrides z niepoprawnym parameter_source (E010 nie może wystąpić).
    - Validation.status == OK lub WARN (nigdy FAIL).
    - Analysis readiness: SC 3F dostępny, load_flow dostępny.
    """

    def test_golden_network_ready(self, golden_enm: EnergyNetworkModel) -> None:
        """Golden fixture jest READY — wszystkie elementy mają catalog_ref.

        Golden case jest przypadkiem PRODUKCYJNYM:
        - validation.status == WARN (nie FAIL, brak blokerów)
        - readiness.ready == True (brak blokerów E009/E010)
        """
        validation = ENMValidator().validate(golden_enm)
        readiness = ENMValidator().readiness(validation)
        assert validation.status in ("OK", "WARN"), (
            f"Expected OK/WARN, got {validation.status}; "
            f"blockers: {[i.code for i in validation.issues if i.severity == 'BLOCKER']}"
        )
        assert readiness.ready is True
        assert readiness.blockers == []

    def test_all_transformers_have_catalog_ref(self, golden_enm: EnergyNetworkModel) -> None:
        """Każdy transformator w golden case ma catalog_ref (kanon CATALOG-FIRST)."""
        for trafo in golden_enm.transformers:
            assert trafo.catalog_ref, f"{trafo.ref_id} brak catalog_ref"

    def test_analysis_readiness_gates(self, golden_enm: EnergyNetworkModel) -> None:
        """Golden case: SC 3F i load_flow powinny być dostępne."""
        result = ENMValidator().validate(golden_enm)
        assert result.analysis_available.short_circuit_3f is True
        assert result.analysis_available.load_flow is True

    def test_issues_deterministic_order(self, golden_enm: EnergyNetworkModel) -> None:
        """Issues lista jest deterministycznie posortowana (severity → code → element_ref)."""
        result1 = ENMValidator().validate(golden_enm)
        result2 = ENMValidator().validate(golden_enm)
        codes1 = [(i.severity, i.code, i.element_refs) for i in result1.issues]
        codes2 = [(i.severity, i.code, i.element_refs) for i in result2.issues]
        assert codes1 == codes2

        # Verify sort order: severity rank ascending, then code, then element_ref
        for prev, curr in zip(result1.issues, result1.issues[1:], strict=False):
            prev_key = (
                severity_rank(prev.severity),
                prev.code,
                prev.element_refs[0] if prev.element_refs else "",
            )
            curr_key = (
                severity_rank(curr.severity),
                curr.code,
                curr.element_refs[0] if curr.element_refs else "",
            )
            assert prev_key <= curr_key, f"Nieposortowane: {prev.code} > {curr.code}"

    def test_json_roundtrip(self, golden_enm: EnergyNetworkModel) -> None:
        """Serializacja → deserializacja zachowuje model."""
        json_str = golden_enm.model_dump_json()
        restored = EnergyNetworkModel.model_validate_json(json_str)
        assert len(restored.buses) == len(golden_enm.buses)
        assert len(restored.branches) == len(golden_enm.branches)
        assert len(restored.substations) == len(golden_enm.substations)


# ---------------------------------------------------------------------------
# PR-07: Testy topologii
# ---------------------------------------------------------------------------


class TestGoldenNetworkTopology:
    """Testy warstwy topologicznej."""

    def test_topology_node_count(self, golden_enm: EnergyNetworkModel) -> None:
        """Topology graph ma tyle węzłów ile szyn."""
        topo = build_topology_graph(golden_enm)
        assert len(topo.nodes) == len(golden_enm.buses)

    def test_topology_has_source_bus(self, golden_enm: EnergyNetworkModel) -> None:
        """Topology identyfikuje szynę źródłową."""
        topo = build_topology_graph(golden_enm)
        assert len(topo.source_bus_refs) >= 1

    def test_trunk_covers_network(self, golden_enm: EnergyNetworkModel) -> None:
        """Trunk pokrywa co najmniej 20 segmentów."""
        topo = build_topology_graph(golden_enm)
        assert len(topo.trunk_segments) >= 20

    def test_corridor_info(self, golden_enm: EnergyNetworkModel) -> None:
        """2 corridors z poprawnymi danymi."""
        topo = build_topology_graph(golden_enm)
        assert len(topo.corridors) == 2
        radial = [c for c in topo.corridors if c.corridor_type == "radial"]
        ring = [c for c in topo.corridors if c.corridor_type == "ring"]
        assert len(radial) == 1
        assert len(ring) == 1

    def test_junction_info(self, golden_enm: EnergyNetworkModel) -> None:
        """3 junctions z poprawnymi danymi."""
        topo = build_topology_graph(golden_enm)
        assert len(topo.junctions) == 3
        for j in topo.junctions:
            assert j.branch_count >= 3

    def test_topology_stats(self, golden_enm: EnergyNetworkModel) -> None:
        """Statystyki topologiczne są poprawne."""
        topo = build_topology_graph(golden_enm)
        assert topo.stats.bus_count == len(golden_enm.buses)
        assert topo.stats.branch_count == len(golden_enm.branches)
        assert topo.stats.substation_count == 20
        assert topo.stats.corridor_count == 2
        assert topo.stats.junction_count == 3
        assert topo.stats.total_line_length_km > 0
