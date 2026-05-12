# SLD Layout Corridor and Collision Rules

**Status:** binding for operator-grade SLD layout

## 1. Visual Principle

The SLD must read like an OSD dispatcher diagram:

- green energized SN corridors,
- orthogonal routing only,
- GPZ as full switchgear,
- stations as mini RMU/RM6 blocks,
- feeders ordered by topology,
- branches subordinate to the main corridor,
- labels placed by priority, not randomly.

## 2. Corridor Types

Layout engine reserves deterministic corridors:

- GPZ switchgear zone,
- outgoing feeder corridors,
- main feeder corridor,
- branch corridor,
- ring return corridor,
- station lane,
- label lane,
- diagnostic overlay lane.

Corridors are visual/layout aids only. They are not electrical entities.

## 3. Routing Rules

Segments must be routed as H/V polylines with 90 degree bends.

Forbidden:

- diagonal production routes,
- segments entering a station body without a port,
- routes crossing station interiors,
- routes crossing critical labels when avoidable,
- auto-layout overwriting a locked manual route.

Required:

- deterministic bend points,
- explicit start/end anchors,
- optional crossing marker when crossing cannot be avoided,
- stable geometry across LOD changes.

## 4. Station Placement

Stations on a feeder are placed in topological order. A station belongs to the end of the previous segment and the start of the next segment.

For long feeders:

- keep a main corridor,
- alternate station label lanes when needed,
- reserve branch exits,
- avoid label overlap before drawing secondary measurements,
- hide lower-priority labels in low LOD rather than creating clutter.

## 5. Collision Priority

Highest priority:

1. GPZ name and switchgear.
2. Main feeder path.
3. NMO/open point.
4. Station names and codes.
5. DER badges and critical missing-data badges.
6. Segment labels.
7. Measurements and diagnostic values.

When there is conflict, hide or move lower-priority labels.

## 6. Current Implementation Hook Points

- `frontend/src/ui/sld/v2/builder/CorridorLayout.ts`
- `frontend/src/ui/sld/v2/builder/LayoutStrategyDispatch.ts`
- `frontend/src/ui/sld/v2/geometry/RouteEditor.ts`
- `frontend/src/ui/sld/v2/canvas/CadOverlay.tsx`
- `frontend/src/ui/sld/v2/renderer/CableRunRenderer.tsx`
- `frontend/src/ui/sld/v2/renderer/StationOnRunRenderer.tsx`

## 7. Test Requirements

- 10-station feeder has no critical collisions.
- 30-station feeder keeps main corridor readable.
- 50-station feeder with branches preserves branch hierarchy.
- 80-station stress view keeps deterministic LOD.
- Adding one station does not reflow the whole network unless full auto-layout is requested.
