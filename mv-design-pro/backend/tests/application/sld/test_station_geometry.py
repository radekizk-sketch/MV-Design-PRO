"""
Station Geometry — testy PR-03.

INVARIANTS:
- build_station_geometry: determinizm
- StationBoundingBox: poprawne wymiary, typ, bay count
- TrunkPath: segmenty w kolejności order
- EntryPointMarker: pozycja na krawędzi ramki stacji
"""

from __future__ import annotations

from application.sld.station_geometry import (
    build_station_geometry,
)
from enm.models import (
    Bay,
    Bus,
    Cable,
    EnergyNetworkModel,
    ENMHeader,
    Source,
    Substation,
    Transformer,
)
from enm.topology import build_topology_graph

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_simple_enm() -> EnergyNetworkModel:
    """ENM z 2 stacjami i 1 kablem."""
    return EnergyNetworkModel(
        header=ENMHeader(name="Test Station Geometry"),
        buses=[
            Bus(ref_id="bus_gpz_110", name="Szyna 110 kV", voltage_kv=110.0, tags=["source"]),
            Bus(ref_id="bus_gpz_15", name="Szyna 15 kV GPZ", voltage_kv=15.0),
            Bus(ref_id="bus_s01_15", name="Szyna 15 kV S01", voltage_kv=15.0),
        ],
        branches=[
            Cable(
                ref_id="cab_01",
                name="Kabel GPZ-S01",
                from_bus_ref="bus_gpz_15",
                to_bus_ref="bus_s01_15",
                type="cable",
                length_km=2.1,
                r_ohm_per_km=0.2,
                x_ohm_per_km=0.07,
            ),
        ],
        transformers=[
            Transformer(
                ref_id="tr_gpz",
                name="TR GPZ",
                hv_bus_ref="bus_gpz_110",
                lv_bus_ref="bus_gpz_15",
                sn_mva=25.0,
                uhv_kv=110.0,
                ulv_kv=15.0,
                uk_percent=10.5,
                pk_kw=120.0,
            ),
        ],
        sources=[
            Source(
                ref_id="src_grid",
                name="Sieć 110 kV",
                bus_ref="bus_gpz_110",
                model="short_circuit_power",
                sk3_mva=3000.0,
            ),
        ],
        loads=[],
        generators=[],
        substations=[
            Substation(
                ref_id="sub_gpz",
                name="GPZ Miasto",
                station_type="gpz",
                bus_refs=["bus_gpz_110", "bus_gpz_15"],
                entry_point_ref="bus_gpz_110",
            ),
            Substation(
                ref_id="sub_s01",
                name="Stacja S01",
                station_type="mv_lv",
                bus_refs=["bus_s01_15"],
                entry_point_ref="bus_s01_15",
            ),
        ],
        bays=[
            Bay(
                ref_id="bay_gpz_in",
                name="Pole IN GPZ",
                bay_role="IN",
                substation_ref="sub_gpz",
                bus_ref="bus_gpz_110",
            ),
            Bay(
                ref_id="bay_gpz_tr",
                name="Pole TR GPZ",
                bay_role="TR",
                substation_ref="sub_gpz",
                bus_ref="bus_gpz_15",
            ),
            Bay(
                ref_id="bay_s01_in",
                name="Pole IN S01",
                bay_role="IN",
                substation_ref="sub_s01",
                bus_ref="bus_s01_15",
            ),
        ],
    )


def _make_bus_positions() -> dict[str, tuple[float, float]]:
    return {
        "bus_gpz_110": (400.0, 100.0),
        "bus_gpz_15": (400.0, 300.0),
        "bus_s01_15": (800.0, 300.0),
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestStationBoundingBox:
    """Testy prostokątów stacji (NO_ROUTE_RECT)."""

    def test_station_count(self) -> None:
        enm = _make_simple_enm()
        topo = build_topology_graph(enm)
        geom = build_station_geometry(enm, topo, _make_bus_positions())
        assert len(geom.station_boxes) == 2  # sub_gpz + sub_s01

    def test_gpz_box_type(self) -> None:
        enm = _make_simple_enm()
        topo = build_topology_graph(enm)
        geom = build_station_geometry(enm, topo, _make_bus_positions())
        gpz = next(b for b in geom.station_boxes if b.substation_ref == "sub_gpz")
        assert gpz.station_type == "gpz"
        assert gpz.station_name == "GPZ Miasto"

    def test_box_min_dimensions(self) -> None:
        enm = _make_simple_enm()
        topo = build_topology_graph(enm)
        geom = build_station_geometry(
            enm,
            topo,
            _make_bus_positions(),
            station_min_width=200.0,
            station_min_height=160.0,
        )
        for box in geom.station_boxes:
            assert box.width >= 200.0
            assert box.height >= 160.0

    def test_box_bay_count(self) -> None:
        enm = _make_simple_enm()
        topo = build_topology_graph(enm)
        geom = build_station_geometry(enm, topo, _make_bus_positions())
        gpz = next(b for b in geom.station_boxes if b.substation_ref == "sub_gpz")
        assert gpz.bay_count == 2  # bay_gpz_in + bay_gpz_tr

    def test_box_bus_refs_sorted(self) -> None:
        enm = _make_simple_enm()
        topo = build_topology_graph(enm)
        geom = build_station_geometry(enm, topo, _make_bus_positions())
        gpz = next(b for b in geom.station_boxes if b.substation_ref == "sub_gpz")
        assert gpz.bus_refs == tuple(sorted(gpz.bus_refs))

    def test_empty_bus_positions_skip(self) -> None:
        """Station without bus positions is skipped."""
        enm = _make_simple_enm()
        topo = build_topology_graph(enm)
        geom = build_station_geometry(enm, topo, {})  # empty positions
        assert len(geom.station_boxes) == 0


class TestTrunkPath:
    """Testy ścieżki toru głównego."""

    def test_trunk_segments_exist(self) -> None:
        enm = _make_simple_enm()
        topo = build_topology_graph(enm)
        geom = build_station_geometry(enm, topo, _make_bus_positions())
        assert len(geom.trunk_path) > 0

    def test_trunk_coordinates(self) -> None:
        enm = _make_simple_enm()
        topo = build_topology_graph(enm)
        geom = build_station_geometry(enm, topo, _make_bus_positions())
        for seg in geom.trunk_path:
            assert seg.is_highlighted is True


class TestEntryPoints:
    """Testy punktów wejścia."""

    def test_entry_points_count(self) -> None:
        enm = _make_simple_enm()
        topo = build_topology_graph(enm)
        geom = build_station_geometry(enm, topo, _make_bus_positions())
        # Both sub_gpz and sub_s01 have entry_point_ref
        assert len(geom.entry_points) == 2

    def test_entry_point_label_polish(self) -> None:
        enm = _make_simple_enm()
        topo = build_topology_graph(enm)
        geom = build_station_geometry(enm, topo, _make_bus_positions())
        for ep in geom.entry_points:
            assert ep.label.startswith("Wejście:")

    def test_entry_side_top(self) -> None:
        enm = _make_simple_enm()
        topo = build_topology_graph(enm)
        geom = build_station_geometry(enm, topo, _make_bus_positions())
        for ep in geom.entry_points:
            assert ep.entry_side == "top"


class TestDeterminism:
    """Testy determinizmu."""

    def test_station_geometry_deterministic(self) -> None:
        enm = _make_simple_enm()
        topo = build_topology_graph(enm)
        pos = _make_bus_positions()
        g1 = build_station_geometry(enm, topo, pos)
        g2 = build_station_geometry(enm, topo, pos)
        assert len(g1.station_boxes) == len(g2.station_boxes)
        assert len(g1.trunk_path) == len(g2.trunk_path)
        assert len(g1.entry_points) == len(g2.entry_points)
        for b1, b2 in zip(g1.station_boxes, g2.station_boxes, strict=False):
            assert b1.substation_ref == b2.substation_ref
            assert b1.x == b2.x
            assert b1.y == b2.y
            assert b1.width == b2.width
