"""
Station Geometry — obliczenia geometrii stacji dla SLD.

Rozszerzenie layoutu SLD o:
- StationBoundingBox (NO_ROUTE_RECT): prostokąt stacji na schemacie
- TrunkPath: ścieżka toru głównego SN
- EntryPointMarker: punkt wejścia kabli do stacji

Czyste funkcje: ENM + TopologyGraph → StationGeometry (deterministyczne).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from enm.models import EnergyNetworkModel
from enm.topology import TopologyGraph

# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class StationBoundingBox:
    """Prostokąt stacji na schemacie SLD (NO_ROUTE_RECT).

    Definiuje strefę, w której trasy kablowe NIE powinny przechodzić.
    """

    substation_ref: str
    station_name: str
    station_type: str
    x: float
    y: float
    width: float
    height: float
    bus_refs: tuple[str, ...]
    bay_count: int


@dataclass(frozen=True)
class TrunkPathSegment:
    """Segment toru głównego SN na schemacie SLD."""

    branch_ref: str
    from_bus_ref: str
    to_bus_ref: str
    order: int
    from_x: float
    from_y: float
    to_x: float
    to_y: float
    length_km: float
    is_highlighted: bool = True


@dataclass(frozen=True)
class EntryPointMarker:
    """Punkt wejścia kabli zewnętrznych do stacji."""

    substation_ref: str
    bus_ref: str
    entry_side: Literal["top", "bottom", "left", "right"]
    x: float
    y: float
    label: str


@dataclass(frozen=True)
class StationGeometry:
    """Pełna geometria stacyjna dla SLD.

    INVARIANT: Ten sam ENM + TopologyGraph → identyczna geometria (determinizm).
    """

    station_boxes: tuple[StationBoundingBox, ...]
    trunk_path: tuple[TrunkPathSegment, ...]
    entry_points: tuple[EntryPointMarker, ...]


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------


def build_station_geometry(
    enm: EnergyNetworkModel,
    topo: TopologyGraph,
    bus_positions: dict[str, tuple[float, float]],
    *,
    station_padding: float = 40.0,
    station_min_width: float = 200.0,
    station_min_height: float = 160.0,
) -> StationGeometry:
    """
    Zbuduj geometrię stacji z ENM, grafu topologicznego i pozycji szyn.

    Czysta, deterministyczna funkcja.

    Args:
        enm: EnergyNetworkModel — kanoniczny model sieci.
        topo: TopologyGraph — graf topologiczny.
        bus_positions: Mapa ref_id szyny → (x, y) z layoutu SLD.
        station_padding: Margines wokół elementów stacji [px].
        station_min_width: Minimalna szerokość ramki stacji [px].
        station_min_height: Minimalna wysokość ramki stacji [px].

    Returns:
        StationGeometry z pełną informacją geometryczną.
    """
    # 1. Station bounding boxes (NO_ROUTE_RECT)
    station_boxes = _compute_station_boxes(
        enm, bus_positions, station_padding, station_min_width, station_min_height
    )

    # 2. Trunk path segments
    trunk_path = _compute_trunk_path(topo, bus_positions)

    # 3. Entry point markers
    entry_points = _compute_entry_points(enm, bus_positions, station_boxes)

    return StationGeometry(
        station_boxes=tuple(station_boxes),
        trunk_path=tuple(trunk_path),
        entry_points=tuple(entry_points),
    )


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _compute_station_boxes(
    enm: EnergyNetworkModel,
    bus_positions: dict[str, tuple[float, float]],
    padding: float,
    min_width: float,
    min_height: float,
) -> list[StationBoundingBox]:
    """Oblicz prostokąty stacji (NO_ROUTE_RECT) na podstawie pozycji szyn."""
    boxes: list[StationBoundingBox] = []

    # Zbierz bay count per substation
    bay_counts: dict[str, int] = {}
    for bay in enm.bays:
        bay_counts[bay.substation_ref] = bay_counts.get(bay.substation_ref, 0) + 1

    for sub in sorted(enm.substations, key=lambda s: s.ref_id):
        # Zbierz pozycje szyn w stacji
        bus_coords: list[tuple[float, float]] = []
        for br in sub.bus_refs:
            pos = bus_positions.get(br)
            if pos:
                bus_coords.append(pos)

        if not bus_coords:
            continue

        # Oblicz bounding box
        xs = [c[0] for c in bus_coords]
        ys = [c[1] for c in bus_coords]
        min_x = min(xs) - padding
        max_x = max(xs) + padding
        min_y = min(ys) - padding
        max_y = max(ys) + padding

        width = max(max_x - min_x, min_width)
        height = max(max_y - min_y, min_height)

        # Wycentruj jeśli za mały
        cx = (min(xs) + max(xs)) / 2
        cy = (min(ys) + max(ys)) / 2
        final_x = cx - width / 2
        final_y = cy - height / 2

        boxes.append(
            StationBoundingBox(
                substation_ref=sub.ref_id,
                station_name=sub.name,
                station_type=sub.station_type,
                x=round(final_x, 1),
                y=round(final_y, 1),
                width=round(width, 1),
                height=round(height, 1),
                bus_refs=tuple(sorted(sub.bus_refs)),
                bay_count=bay_counts.get(sub.ref_id, 0),
            )
        )

    return boxes


def _compute_trunk_path(
    topo: TopologyGraph,
    bus_positions: dict[str, tuple[float, float]],
) -> list[TrunkPathSegment]:
    """Oblicz ścieżkę toru głównego SN dla wizualizacji."""
    segments: list[TrunkPathSegment] = []

    for trunk in topo.trunk_segments:
        from_pos = bus_positions.get(trunk.from_bus_ref)
        to_pos = bus_positions.get(trunk.to_bus_ref)

        if from_pos and to_pos:
            segments.append(
                TrunkPathSegment(
                    branch_ref=trunk.branch_ref,
                    from_bus_ref=trunk.from_bus_ref,
                    to_bus_ref=trunk.to_bus_ref,
                    order=trunk.order,
                    from_x=round(from_pos[0], 1),
                    from_y=round(from_pos[1], 1),
                    to_x=round(to_pos[0], 1),
                    to_y=round(to_pos[1], 1),
                    length_km=trunk.length_km,
                    is_highlighted=True,
                )
            )

    return segments


def _compute_entry_points(
    enm: EnergyNetworkModel,
    bus_positions: dict[str, tuple[float, float]],
    station_boxes: list[StationBoundingBox],
) -> list[EntryPointMarker]:
    """Oblicz punkty wejścia kabli do stacji."""
    markers: list[EntryPointMarker] = []
    box_map = {b.substation_ref: b for b in station_boxes}

    for sub in sorted(enm.substations, key=lambda s: s.ref_id):
        if not sub.entry_point_ref:
            continue

        box = box_map.get(sub.ref_id)
        if not box:
            continue

        # Punkt wejścia — domyślnie na górze stacji (strona zasilania)
        entry_x = round(box.x + box.width / 2, 1)
        entry_y = round(box.y, 1)

        markers.append(
            EntryPointMarker(
                substation_ref=sub.ref_id,
                bus_ref=sub.entry_point_ref,
                entry_side="top",
                x=entry_x,
                y=entry_y,
                label=f"Wejście: {sub.name}",
            )
        )

    return markers
