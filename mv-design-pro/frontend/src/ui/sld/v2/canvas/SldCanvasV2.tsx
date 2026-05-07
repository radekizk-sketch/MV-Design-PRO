/**
 * SldCanvasV2 — composition root nowego SLD.
 *
 * Pure functional viewport + SVG canvas. Renderowane przez SldWorkspaceContainer
 * w kanonicznym shellu (ekran E-01 "Główne środowisko pracy SLD").
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import {
  computeBoundingBox,
  fitToView,
  IDENTITY_TRANSFORM,
  pan as panTransform,
  zoomToCursor,
  type ViewportTransform,
} from '../viewport/ViewportController';
import {
  DEFAULT_LAYER_VISIBILITY,
  createLodController,
  inferLodFromScale,
  type LodController,
  type LodLevel,
  type SldLayerId,
} from '../lod/LodPolicy';
import { COLOR_BG, COLOR_PANEL } from '../theme/tokens';
import { CableRunRenderer } from '../renderer/CableRunRenderer';
import { CadOverlay } from './CadOverlay';
import { DEFAULT_SNAP_STATE } from '../viewport/Snap';
import { ConnectionRenderer } from '../renderer/ConnectionRenderer';
import { DerRenderer, type DerRendererProps } from '../renderer/DerRenderer';
import { GpzRenderer, type GpzRendererProps } from '../renderer/GpzRenderer';
import { SectionRenderer, type SectionRendererProps } from '../renderer/SectionRenderer';
import { StationOnRunRenderer, type StationOnRunRendererProps } from '../renderer/StationOnRunRenderer';
import type { SldElementKindForMenu } from '../command/SldCommandService';

export type SldElementContextKind = SldElementKindForMenu;

export interface SldCanvasContextMenuRequest {
  readonly kind: SldElementContextKind;
  readonly elementId: string | null;
  readonly clientX: number;
  readonly clientY: number;
}

export interface SldCanvasV2Props {
  /** Wymiary viewport (pixele ekranu). */
  readonly width: number;
  readonly height: number;

  /** Lista obiektów do renderowania. */
  readonly gpzs: readonly GpzRendererProps[];
  readonly sections: readonly SectionRendererProps[];
  readonly cableRuns: ReadonlyArray<{
    id: string;
    runKind: 'main_trunk' | 'branch' | 'ring' | 'loop';
    pathPoints: ReadonlyArray<{ x: number; y: number }>;
    segmentKind: 'cable_sn' | 'overhead_line_sn';
  }>;
  readonly stations: readonly StationOnRunRendererProps[];
  readonly ders: readonly DerRendererProps[];
  readonly connections?: ReadonlyArray<{ id: string; pathPoints: ReadonlyArray<{ x: number; y: number }> }>;

  /** Selected element ID (jeden z {gpz/section/run/station/der}). */
  readonly selectedId?: string | null;

  /** Override LOD globalny (jeśli undefined → wnioskuj z scale). */
  readonly lodOverride?: LodLevel;

  /** Stan warstw widoczności. */
  readonly layerVisibility?: Partial<Record<SldLayerId, boolean>>;

  /** Phase 2 polish (operator-grade SLD plan v2): CadOverlay props.
   *  Snap state (mode/grid/port tolerance), ghost previews dla
   *  append/split workflow, korytarze dla CorridorLayout strategy,
   *  zaznaczone routes dla bend handles. Wszystkie opcjonalne — gdy
   *  brak, CadOverlay nie jest renderowany. */
  readonly cadOverlay?: {
    readonly snapState?: import('../viewport/Snap').SnapState;
    readonly hoverPoint?: import('../geometry/routing').Point | null;
    readonly ports?: readonly import('../viewport/Snap').PortSnapTarget[];
    readonly ghosts?: readonly import('./CadOverlay').CadGhost[];
    readonly corridors?: readonly import('./CadOverlay').CadCorridorBand[];
    readonly selectedRoutes?: readonly import('../geometry/RouteEditor').RouteSegment[];
    readonly onBendDragStart?: (routeId: string, bendIdx: number) => void;
    readonly onBendDoubleClick?: (routeId: string, bendIdx: number) => void;
  };

  readonly onSelectElement?: (id: string | null, kind: string) => void;
  readonly onDoubleClickStation?: (id: string) => void;
  readonly onDoubleClickDer?: (id: string) => void;
  /**
   * Right-click handler. Wywoływany dla elementu lub tła kanwy.
   * Container otwiera menu kontekstowe na (clientX, clientY).
   */
  readonly onContextMenu?: (request: SldCanvasContextMenuRequest) => void;
}

export function SldCanvasV2(props: SldCanvasV2Props): JSX.Element {
  const {
    width, height, gpzs, sections, cableRuns, stations, ders, connections = [],
    selectedId, lodOverride, layerVisibility,
    onSelectElement, onDoubleClickStation, onDoubleClickDer, onContextMenu,
  } = props;

  const [transform, setTransform] = useState<ViewportTransform>(IDENTITY_TRANSFORM);
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  /* INVARIANT 5/6 + Phase 0A audit fix 11: LOD histereza FSM eliminuje
   * migotanie przy bouncing zoom (deadband 15%, debounce 250ms — konfig
   * w `LodPolicy.createLodController`). Bez tego operator widzi przeskakujące
   * elementy LOD przy płynnym zoom-in/out. */
  const lodControllerRef = useRef<LodController | null>(null);
  if (lodControllerRef.current === null) {
    lodControllerRef.current = createLodController({ initialScale: transform.scale });
  }

  // Auto-fit przy pierwszym renderze (jeśli mamy obiekty)
  useMemo(() => {
    const allPoints: { x: number; y: number }[] = [];
    for (const g of gpzs) allPoints.push({ x: g.x, y: g.y });
    for (const s of sections) allPoints.push({ x: s.x, y: s.y });
    for (const st of stations) allPoints.push({ x: st.x, y: st.y });
    for (const d of ders) allPoints.push({ x: d.x, y: d.y });
    if (allPoints.length === 0) return;
    const bbox = computeBoundingBox(allPoints);
    // Powiększamy bbox aby uwzględnić rozmiar bloków
    const expanded = {
      minX: bbox.minX - 100,
      minY: bbox.minY - 100,
      maxX: bbox.maxX + 200,
      maxY: bbox.maxY + 200,
    };
    setTransform(fitToView(expanded, { width, height }));
  }, [gpzs, sections, stations, ders, width, height]);

  /* LOD obliczany przez LodController — histereza FSM zapobiega flicker.
   * `update()` zwraca aktualne LOD po zastosowaniu deadband + debounce. */
  const lod: LodLevel = lodOverride !== undefined
    ? lodOverride
    : lodControllerRef.current.update(transform.scale);
  /* Fallback dla testów bez LodControllera (powinien być zawsze inicjalizowany). */
  void inferLodFromScale; // referencja zachowana dla back-compat innych callerów
  const layers = { ...DEFAULT_LAYER_VISIBILITY, ...(layerVisibility ?? {}) };

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const cursorScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform((t) => zoomToCursor(t, cursorScreen, zoomFactor));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.target === e.currentTarget)) {
      isDraggingRef.current = true;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
    }
    if (e.button === 0 && e.target === e.currentTarget) {
      onSelectElement?.(null, 'background');
    }
  }, [onSelectElement]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current || !lastPosRef.current) return;
    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    setTransform((t) => panTransform(t, { x: dx, y: dy }));
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    lastPosRef.current = null;
  }, []);

  const handleSvgContextMenu = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!onContextMenu) return;
    e.preventDefault();
    if (e.target === e.currentTarget) {
      onContextMenu({
        kind: 'background',
        elementId: null,
        clientX: e.clientX,
        clientY: e.clientY,
      });
    }
  }, [onContextMenu]);

  const buildElementContextMenuHandler = useCallback(
    (kind: SldElementContextKind, id: string) =>
      (e: React.MouseEvent) => {
        if (!onContextMenu) return;
        e.preventDefault();
        e.stopPropagation();
        onContextMenu({ kind, elementId: id, clientX: e.clientX, clientY: e.clientY });
      },
    [onContextMenu],
  );

  return (
    <svg
      data-testid="sld-canvas-v2"
      data-lod={lod}
      width={width}
      height={height}
      style={{ background: COLOR_BG, userSelect: 'none' }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={handleSvgContextMenu}
    >
      {/* Tło */}
      <rect width={width} height={height} fill={COLOR_BG} />

      {/* World transform */}
      <g transform={`translate(${transform.translateX}, ${transform.translateY}) scale(${transform.scale})`}>
        {/* Phase 2 polish: CadOverlay (grid + magnesy + bend handles + ghosts +
            korytarze). Renderowany pod content żeby nie zasłaniał obiektów
            domenowych. NIE pokazujemy gdy brak `cadOverlay` props (default off). */}
        {props.cadOverlay && (
          <CadOverlay
            width={width}
            height={height}
            viewportScale={transform.scale}
            viewportTx={transform.translateX}
            viewportTy={transform.translateY}
            snapState={props.cadOverlay.snapState ?? DEFAULT_SNAP_STATE}
            hoverPoint={props.cadOverlay.hoverPoint ?? null}
            ports={props.cadOverlay.ports}
            ghosts={props.cadOverlay.ghosts}
            corridors={props.cadOverlay.corridors}
            selectedRoutes={props.cadOverlay.selectedRoutes}
            onBendDragStart={props.cadOverlay.onBendDragStart}
            onBendDoubleClick={props.cadOverlay.onBendDoubleClick}
          />
        )}

        {/* Connections (cienka warstwa pomocnicza) */}
        {layers.topology && connections.map((c) => (
          <ConnectionRenderer key={c.id} {...c} selected={selectedId === c.id} />
        ))}

        {/* Cable runs */}
        {layers.equipment && cableRuns.map((run) => (
          <g
            key={run.id}
            onContextMenu={
              onContextMenu
                ? buildElementContextMenuHandler(
                    run.segmentKind === 'cable_sn' ? 'cable_segment_sn' : 'overhead_line_sn',
                    run.id,
                  )
                : undefined
            }
          >
            <CableRunRenderer
              {...run}
              selected={selectedId === run.id}
              onClick={onSelectElement ? (id) => onSelectElement(id, 'cable_run') : undefined}
            />
          </g>
        ))}

        {/* Sections (szyny SN GPZ) */}
        {sections.map((s) => (
          <g
            key={s.id}
            onContextMenu={
              onContextMenu ? buildElementContextMenuHandler('section', s.id) : undefined
            }
          >
            <SectionRenderer {...s} />
          </g>
        ))}

        {/* GPZ blocks */}
        {gpzs.map((g) => (
          <g
            key={g.id}
            onContextMenu={
              onContextMenu ? buildElementContextMenuHandler('gpz', g.id) : undefined
            }
          >
            <GpzRenderer
              {...g}
              lod={lod}
              selected={selectedId === g.id}
              onClick={onSelectElement ? (id) => onSelectElement(id, 'gpz') : undefined}
            />
          </g>
        ))}

        {/* Stacje na ciągu */}
        {stations.map((st) => (
          <g
            key={st.id}
            onContextMenu={
              onContextMenu ? buildElementContextMenuHandler('station', st.id) : undefined
            }
          >
            <StationOnRunRenderer
              {...st}
              selected={selectedId === st.id}
              onClick={onSelectElement ? (id) => onSelectElement(id, 'station') : undefined}
              onDoubleClick={onDoubleClickStation}
            />
          </g>
        ))}

        {/* DER (PV/BESS/FW) */}
        {layers.der && ders.map((d) => {
          const menuKind: SldElementContextKind =
            d.kind === 'PV' ? 'der_pv' : d.kind === 'BESS' ? 'der_bess' : 'der_fw';
          return (
            <g
              key={d.id}
              onContextMenu={
                onContextMenu ? buildElementContextMenuHandler(menuKind, d.id) : undefined
              }
            >
              <DerRenderer
                {...d}
                selected={selectedId === d.id}
                onClick={onSelectElement ? (id) => onSelectElement(id, 'der') : undefined}
                onDoubleClick={onDoubleClickDer}
              />
            </g>
          );
        })}
      </g>

      {/* Status bar (LOD + scale) — read-only, dla developera/diagnostyki */}
      <g transform={`translate(8, ${height - 24})`}>
        <rect x={-4} y={-12} width={120} height={20} fill={COLOR_PANEL} fillOpacity={0.85} rx={2} />
        <text fill="#B9C0C7" fontSize={11} fontFamily="monospace" y={2}>
          LOD {lod} · {(transform.scale * 100).toFixed(0)}%
        </text>
      </g>
    </svg>
  );
}
