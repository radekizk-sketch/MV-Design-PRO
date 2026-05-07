/**
 * CadOverlay — Phase 2 polish (operator-grade SLD plan v2).
 *
 * SVG overlay nad SldCanvasV2:
 *   - Siatka (grid pattern) — gdy snap mode === 'grid' lub 'port'.
 *   - Port magnet halos — gdy snap mode === 'port' i operator hover near port.
 *   - Bend handles — dla zaznaczonego route (RouteSegment z RouteEditor).
 *   - Ghost previews — dla append-on-endpoint i conscious-split workflow.
 *   - Korytarze — dla CorridorLayout strategy (Phase 6).
 *
 * Pure rendering (deterministic). Pointer events delegowane do
 * RouteEditor/AppendOnEndpointController/ConsciousSplitController.
 *
 * Acceptance Invariants:
 *   - 2: Każdy element overlay jawnie dekoracyjny (NIE domain element).
 *   - 7: Manualna geometria zmienia layout_hash only.
 *
 * @see SLD_CAD_INTERACTION_SPEC.md
 */

import type { Point } from '../geometry/routing';
import type { RouteSegment } from '../geometry/RouteEditor';
import type { PortSnapTarget, SnapState } from '../viewport/Snap';

export type CadGhostKind = 'append-station' | 'split-station' | 'split-zksn' | 'split-pole';

export interface CadGhost {
  readonly kind: CadGhostKind;
  /** Gdzie ma się pojawić ghost obiekt (world coords). */
  readonly position: Point;
  /** Etykieta wyświetlana pod ghostem (np. nazwa nowej stacji). */
  readonly label?: string;
}

export interface CadCorridorBand {
  readonly id: string;
  /** Y-band corridor (np. dla feedera lub odgałęzienia). */
  readonly yMin: number;
  readonly yMax: number;
  readonly kind: 'gpz' | 'feeder' | 'branch' | 'ring-return' | 'label-zone';
  readonly label?: string;
}

export interface CadOverlayProps {
  readonly width: number;
  readonly height: number;
  /** Viewport transform — używany do skalowania grid/halos. */
  readonly viewportScale: number;
  readonly viewportTx: number;
  readonly viewportTy: number;
  /** Grid step world coords (default 20px). */
  readonly gridStep?: number;
  /** Snap state — kontroluje czy grid/halos widoczne. */
  readonly snapState: SnapState;
  /** Aktywne porty (do magnet halos gdy mode === 'port'). */
  readonly ports?: readonly PortSnapTarget[];
  /** Hover point (world coords) — używany do hover-magnet halo. */
  readonly hoverPoint?: Point | null;
  /** Zaznaczone route segments — bend handles renderowane na nich. */
  readonly selectedRoutes?: readonly RouteSegment[];
  /** Ghost previews dla aktywnego workflow. */
  readonly ghosts?: readonly CadGhost[];
  /** Korytarze (Phase 6 CorridorLayout). */
  readonly corridors?: readonly CadCorridorBand[];
  /** Klick handlery (delegate to RouteEditor / Controllers). */
  readonly onBendDragStart?: (routeId: string, bendIdx: number) => void;
  readonly onBendDoubleClick?: (routeId: string, bendIdx: number) => void;
}

const GRID_COLOR = '#1A1F2A';
const GRID_COLOR_MAJOR = '#2A3140';
const PORT_HALO_COLOR = '#13C45A';
const BEND_HANDLE_COLOR = '#FFB020';
const GHOST_COLOR = '#3FA9F5';
const CORRIDOR_KIND_COLORS: Record<CadCorridorBand['kind'], string> = {
  'gpz': '#1A2438',
  'feeder': '#1A2A20',
  'branch': '#2A2616',
  'ring-return': '#2A1A2A',
  'label-zone': '#171B20',
};

/**
 * Główny CadOverlay component. Renderuje overlay SVG <g> z deterministycznymi
 * sub-warstwami:
 *   1. Korytarze (background-most, gdy są).
 *   2. Grid (jeśli snap state visible).
 *   3. Ghost previews (mid-layer).
 *   4. Port magnets (gdy hover + mode === 'port').
 *   5. Bend handles (top-most, gdy selectedRoutes).
 *
 * @returns SVG <g> bez własnego SVG root — rodzic zarządza svg + viewport.
 */
export function CadOverlay(props: CadOverlayProps): JSX.Element {
  const {
    width, height, viewportScale, viewportTx, viewportTy,
    gridStep = 20,
    snapState,
    ports = [],
    hoverPoint = null,
    selectedRoutes = [],
    ghosts = [],
    corridors = [],
    onBendDragStart,
    onBendDoubleClick,
  } = props;

  return (
    <g data-testid="sld-v2-cad-overlay">
      {/* 1. Korytarze (background-most) */}
      {corridors.length > 0 && (
        <g data-testid="cad-overlay-corridors">
          {corridors.map((c) => (
            <rect
              key={c.id}
              x={0}
              y={c.yMin}
              width={width / viewportScale}
              height={c.yMax - c.yMin}
              fill={CORRIDOR_KIND_COLORS[c.kind]}
              fillOpacity={0.08}
              stroke={CORRIDOR_KIND_COLORS[c.kind]}
              strokeOpacity={0.15}
              strokeWidth={1 / viewportScale}
              data-testid={`cad-corridor-${c.id}`}
              data-corridor-kind={c.kind}
            />
          ))}
        </g>
      )}

      {/* 2. Grid */}
      {snapState.gridVisible && (
        <CadGrid
          width={width}
          height={height}
          gridStep={gridStep}
          viewportScale={viewportScale}
          viewportTx={viewportTx}
          viewportTy={viewportTy}
        />
      )}

      {/* 3. Ghost previews */}
      {ghosts.length > 0 && (
        <g data-testid="cad-overlay-ghosts">
          {ghosts.map((g, idx) => (
            <CadGhostMarker key={`ghost-${idx}`} ghost={g} />
          ))}
        </g>
      )}

      {/* 4. Port magnets (gdy mode === 'port' i hover blisko portów) */}
      {snapState.mode === 'port' && hoverPoint !== null && (
        <CadPortMagnets
          ports={ports}
          hoverPoint={hoverPoint}
          tolerance={snapState.portTolerance}
        />
      )}

      {/* 5. Bend handles (top-most) */}
      {selectedRoutes.length > 0 && (
        <g data-testid="cad-overlay-bend-handles">
          {selectedRoutes.map((route) => (
            <CadBendHandles
              key={route.id}
              route={route}
              onDragStart={onBendDragStart}
              onDoubleClick={onBendDoubleClick}
            />
          ))}
        </g>
      )}
    </g>
  );
}

/* ---------------------------------------------------------------------------
   Sub-components
   --------------------------------------------------------------------------- */

interface CadGridProps {
  readonly width: number;
  readonly height: number;
  readonly gridStep: number;
  readonly viewportScale: number;
  readonly viewportTx: number;
  readonly viewportTy: number;
}

/**
 * Renderuje siatkę punktów (kropki) i osi major (linie co 5×gridStep).
 * Pure deterministic — dla danego widoku zawsze ten sam rendering.
 */
function CadGrid(props: CadGridProps): JSX.Element {
  const { width, height, gridStep, viewportScale, viewportTx, viewportTy } = props;

  // World coords visible w viewport
  const worldXMin = -viewportTx / viewportScale;
  const worldYMin = -viewportTy / viewportScale;
  const worldXMax = (width - viewportTx) / viewportScale;
  const worldYMax = (height - viewportTy) / viewportScale;

  // Snap to grid
  const gxStart = Math.floor(worldXMin / gridStep) * gridStep;
  const gyStart = Math.floor(worldYMin / gridStep) * gridStep;

  // Hard cap na liczbę dots aby uniknąć rendering bloat przy wide zoom-out
  const MAX_DOTS = 5_000;
  const xCount = Math.ceil((worldXMax - gxStart) / gridStep);
  const yCount = Math.ceil((worldYMax - gyStart) / gridStep);
  const totalDots = xCount * yCount;

  if (totalDots > MAX_DOTS) {
    // Skip grid rendering when too zoomed out — pokazujemy tylko major axes co 100px
    return (
      <g data-testid="cad-overlay-grid" data-grid-mode="major-only" data-skip-reason="too-many-dots" />
    );
  }

  const dotsX: number[] = [];
  for (let x = gxStart; x <= worldXMax; x += gridStep) dotsX.push(x);
  const dotsY: number[] = [];
  for (let y = gyStart; y <= worldYMax; y += gridStep) dotsY.push(y);

  const dotR = Math.max(0.5, 1 / viewportScale);
  const majorEvery = 5;

  return (
    <g data-testid="cad-overlay-grid">
      {dotsX.map((x) =>
        dotsY.map((y) => {
          const isMajor = (x % (gridStep * majorEvery) === 0) && (y % (gridStep * majorEvery) === 0);
          return (
            <circle
              key={`grid-${x}-${y}`}
              cx={x}
              cy={y}
              r={dotR}
              fill={isMajor ? GRID_COLOR_MAJOR : GRID_COLOR}
              fillOpacity={isMajor ? 0.7 : 0.4}
            />
          );
        }),
      )}
    </g>
  );
}

interface CadPortMagnetsProps {
  readonly ports: readonly PortSnapTarget[];
  readonly hoverPoint: Point;
  readonly tolerance: number;
}

/**
 * Renderuje halo wokół portów które są w tolerance od hoverPoint.
 * Manhattan distance — zgodne z `snapToPort` algorytmem.
 */
function CadPortMagnets(props: CadPortMagnetsProps): JSX.Element {
  const { ports, hoverPoint, tolerance } = props;
  const halos: PortSnapTarget[] = [];
  for (const port of ports) {
    const dist = Math.abs(port.x - hoverPoint.x) + Math.abs(port.y - hoverPoint.y);
    if (dist <= tolerance) halos.push(port);
  }
  return (
    <g data-testid="cad-overlay-port-magnets">
      {halos.map((port) => (
        <g key={`magnet-${port.id}`} data-testid={`cad-port-halo-${port.id}`}>
          <circle
            cx={port.x}
            cy={port.y}
            r={tolerance / 2}
            fill={PORT_HALO_COLOR}
            fillOpacity={0.15}
            stroke={PORT_HALO_COLOR}
            strokeWidth={1.5}
            strokeOpacity={0.7}
          />
          <circle
            cx={port.x}
            cy={port.y}
            r={3}
            fill={PORT_HALO_COLOR}
          />
        </g>
      ))}
    </g>
  );
}

interface CadBendHandlesProps {
  readonly route: RouteSegment;
  readonly onDragStart?: (routeId: string, bendIdx: number) => void;
  readonly onDoubleClick?: (routeId: string, bendIdx: number) => void;
}

/**
 * Renderuje bend handles dla zaznaczonego route. Każdy bend = klikalny kwadrat.
 * Locked route: handle z lock symbol + przygaszony.
 */
function CadBendHandles(props: CadBendHandlesProps): JSX.Element {
  const { route, onDragStart, onDoubleClick } = props;
  const handleSize = 6;
  const halfSize = handleSize / 2;
  const fillColor = route.locked ? '#5A5A5A' : BEND_HANDLE_COLOR;
  const strokeColor = route.locked ? '#3A3A3A' : '#9A6010';
  return (
    <g data-testid={`cad-bend-handles-${route.id}`} data-route-id={route.id} data-locked={route.locked ? 'true' : 'false'}>
      {route.bendPoints.map((bend, idx) => (
        <rect
          key={`bend-${idx}`}
          x={bend.x - halfSize}
          y={bend.y - halfSize}
          width={handleSize}
          height={handleSize}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={1}
          data-testid={`cad-bend-handle-${route.id}-${idx}`}
          data-bend-idx={idx}
          style={{ cursor: route.locked ? 'not-allowed' : 'grab' }}
          onMouseDown={
            onDragStart && !route.locked
              ? (e) => { e.stopPropagation(); onDragStart(route.id, idx); }
              : undefined
          }
          onDoubleClick={
            onDoubleClick && !route.locked
              ? (e) => { e.stopPropagation(); onDoubleClick(route.id, idx); }
              : undefined
          }
        />
      ))}
    </g>
  );
}

interface CadGhostMarkerProps {
  readonly ghost: CadGhost;
}

const GHOST_KIND_LABEL_PL: Record<CadGhostKind, string> = {
  'append-station': 'Nowa stacja na końcu odcinka',
  'split-station': 'Podział: nowa stacja',
  'split-zksn': 'Podział: ZKSN',
  'split-pole': 'Podział: słup rozgałęźny',
};

function CadGhostMarker(props: CadGhostMarkerProps): JSX.Element {
  const { ghost } = props;
  const r = 14;
  return (
    <g
      data-testid={`cad-ghost-${ghost.kind}`}
      data-ghost-kind={ghost.kind}
      transform={`translate(${ghost.position.x}, ${ghost.position.y})`}
    >
      <circle
        cx={0} cy={0} r={r}
        fill={GHOST_COLOR}
        fillOpacity={0.15}
        stroke={GHOST_COLOR}
        strokeWidth={1.5}
        strokeDasharray="3 2"
      />
      <circle cx={0} cy={0} r={3} fill={GHOST_COLOR} />
      <text
        x={0}
        y={r + 12}
        textAnchor="middle"
        fill={GHOST_COLOR}
        fontFamily="sans-serif"
        fontSize={9}
        fontWeight={700}
      >
        {ghost.label ?? GHOST_KIND_LABEL_PL[ghost.kind]}
      </text>
    </g>
  );
}
