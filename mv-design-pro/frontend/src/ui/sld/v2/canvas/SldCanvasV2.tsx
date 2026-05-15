/**
 * SldCanvasV2 — composition root nowego SLD.
 *
 * Pure functional viewport + SVG canvas. Renderowane przez SldWorkspaceContainer
 * w kanonicznym shellu (ekran E-01 "Główne środowisko pracy SLD").
 */

import { useCallback, useEffect, useRef, useState } from 'react';

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
import { SldLodProvider } from '../lod/SldLodContext';
import { COLOR_BG, COLOR_PANEL } from '../theme/tokens';
import {
  CableRunRenderer,
  type CableRunSegmentLabel,
  type CableRunSegmentPath,
  type CableRunStationPortGap,
} from '../renderer/CableRunRenderer';
import { CadOverlay } from './CadOverlay';
import { SldTitleBlock, type SldTitleBlockData } from './SldTitleBlock';
import { SldLegendOverlay } from './SldLegendOverlay';
import { SldScaleRuler } from './SldScaleRuler';
import { DEFAULT_SNAP_STATE } from '../viewport/Snap';
import { ConnectionRenderer } from '../renderer/ConnectionRenderer';
import { DerRenderer, type DerRendererProps } from '../renderer/DerRenderer';
import { GpzRenderer, type GpzRendererProps } from '../renderer/GpzRenderer';
import {
  GpzCanonicalRenderer,
  type GpzCanonicalRendererProps,
} from '../renderer/GpzCanonicalRenderer';
import { SectionRenderer, type SectionRendererProps } from '../renderer/SectionRenderer';
import {
  StationOnRunRenderer,
  STATION_RUN_TRUNK_OFFSET_Y,
  type StationOnRunRendererProps,
} from '../renderer/StationOnRunRenderer';
import { miniBlockStationPortOffsets } from '../renderer/MiniBlockRmuRenderer';
import { ResultOverlayLayer } from './ResultOverlayLayer';
import { useRawResultOverlayStore, type RawOverlayPayload } from '../../../sld-overlay/rawResultOverlayStore';
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
  /**
   * Operator-grade canonical GPZ props (Phase R4 rebuild).
   * Gdy podane dla `id` z `gpzs[]`, kanwa renderuje `GpzCanonicalRenderer`
   * (pełna rozdzielnia SCADA OSD) zamiast legacy `GpzRenderer` (placeholder).
   * Caller (SldWorkspaceContainer) wywołuje `buildCanonicalGpzProps` z ENM.
   */
  readonly canonicalGpzs?: readonly GpzCanonicalRendererProps[];
  readonly sections: readonly SectionRendererProps[];
  readonly cableRuns: ReadonlyArray<{
    id: string;
    runKind: 'main_trunk' | 'branch' | 'ring' | 'loop';
    pathPoints: ReadonlyArray<{ x: number; y: number }>;
    segmentKind: 'cable_sn' | 'overhead_line_sn';
    segmentRefs?: readonly string[];
    segmentPaths?: readonly CableRunSegmentPath[];
    label?: string;
    segmentLabels?: readonly CableRunSegmentLabel[];
    pendingEndpoint?: boolean;
    /** K30-41: napięcie ciągu [kV] — voltage chip + tint stroke fallback. */
    voltageKv?: number | null;
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
  readonly onViewportTransformChange?: (transform: ViewportTransform) => void;
  /** K30-38: metadata bloku tytułowego per PN-EN ISO 7200. Brak → defaults. */
  readonly titleBlockData?: SldTitleBlockData | null;
  /** K30-39: pokaż legendę palet (voltage / cable variants / apparatus / DER).
   *  Default true. Set false dla cleanu w przypadkach print-only. */
  readonly showLegend?: boolean;
  /** K30-43: pokaż skalę rysunku per PN-EN ISO 5455. Default true. */
  readonly showScaleRuler?: boolean;
}

function estimateCanonicalGpzFootprint(gpz: GpzCanonicalRendererProps): { width: number; height: number } {
  const lvBayCount = gpz.sections.reduce((sum, section) => sum + Math.max(section.bays.length, 1), 0);
  const hvBayCount = gpz.hvSections?.reduce((sum, section) => sum + section.bays.length, 0) ?? 0;
  const sectionCount = Math.max(gpz.sections.length, 1);
  return {
    width: Math.max(720, lvBayCount * 70 + sectionCount * 96, hvBayCount * 72 + 360),
    height: 680,
  };
}

const OPERATOR_READABLE_MIN_SCALE = 0.72;

function sameViewportTransform(a: ViewportTransform, b: ViewportTransform): boolean {
  return (
    Math.abs(a.scale - b.scale) < 0.001 &&
    Math.abs(a.translateX - b.translateX) < 0.5 &&
    Math.abs(a.translateY - b.translateY) < 0.5
  );
}

function applyOperatorReadableInitialTransform(
  fit: ViewportTransform,
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  args: {
    readonly hasCanonicalGpz: boolean;
    readonly stationCount: number;
    readonly runCount: number;
    readonly derCount: number;
  },
): ViewportTransform {
  const smallOperatorTopology =
    args.stationCount <= 8 &&
    args.runCount <= 12 &&
    args.derCount <= 6;
  if (!args.hasCanonicalGpz || !smallOperatorTopology || fit.scale >= OPERATOR_READABLE_MIN_SCALE) {
    return fit;
  }

  return {
    scale: OPERATOR_READABLE_MIN_SCALE,
    translateX: 48 - bbox.minX * OPERATOR_READABLE_MIN_SCALE,
    translateY: 48 - bbox.minY * OPERATOR_READABLE_MIN_SCALE,
  };
}

function isCanonicalGpzInteractiveDescendant(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      [
        '[data-element-kind="apparatus"]',
        '[data-testid^="gpz-canonical-apparatus-"]',
        '[data-testid^="gpz-canonical-bay-"]',
        '[data-testid^="gpz-canonical-section-"]',
        '[data-testid^="gpz-canonical-coupler-"]',
        '[data-parity-key^="gpz.apparatus"]',
        '[data-parity-key^="gpz.bay"]',
        '[data-parity-key^="gpz.section"]',
        '[data-parity-key^="gpz.coupler"]',
      ].join(','),
    ),
  );
}

function readSldInteractiveTarget(target: EventTarget | null): {
  kind: SldElementContextKind;
  elementId: string;
} | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest('[data-element-kind][data-element-id]');
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return null;
  const kind = element.getAttribute('data-element-kind') as SldElementContextKind | null;
  const elementId = element.getAttribute('data-element-id');
  if (!kind || !elementId) return null;
  return { kind, elementId };
}

export function SldCanvasV2(props: SldCanvasV2Props): JSX.Element {
  const {
    width, height, gpzs, canonicalGpzs, sections, cableRuns, stations, ders, connections = [],
    selectedId, lodOverride, layerVisibility, titleBlockData, showLegend = true, showScaleRuler = true,
    onSelectElement, onDoubleClickStation, onDoubleClickDer, onContextMenu, onViewportTransformChange,
  } = props;

  // K30-8: subskrybuj raw overlay payload by compute per-station alarm severity.
  const overlayPayload = useRawResultOverlayStore((state) => state.payload);

  // K30-11: aggregate station alarm summary (count of severities).
  const alarmSummary = (() => {
    if (!overlayPayload) return null;
    let c = 0, i = 0, w = 0;
    for (const st of props.stations) {
      const sev = computeStationAlarmSeverity(st, overlayPayload);
      if (sev === 'critical') c++;
      else if (sev === 'important') i++;
      else if (sev === 'warning') w++;
    }
    if (c + i + w === 0) return null;
    return { critical: c, important: i, warning: w, total: props.stations.length };
  })();

  const [transform, setTransform] = useState<ViewportTransform>(IDENTITY_TRANSFORM);
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  /* INVARIANT 5/6 + Phase 0A audit fix 11: LOD histereza FSM eliminuje
   * migotanie przy bouncing zoom (deadband 15%, debounce 250ms — konfig
   * w `LodPolicy.createLodController`). Bez tego operator widzi przeskakujące
   * elementy LOD przy płynnym zoom-in/out. */
  const lodControllerRef = useRef<LodController | null>(null);
  if (lodControllerRef.current === null) {
    lodControllerRef.current = createLodController({ initialScale: transform.scale });
  }

  // Auto-fit przy pierwszym renderze (jeśli mamy obiekty)
  useEffect(() => {
    const allPoints: { x: number; y: number }[] = [];
    for (const g of gpzs) allPoints.push({ x: g.x, y: g.y });
    for (const gpz of canonicalGpzs ?? []) {
      const footprint = estimateCanonicalGpzFootprint(gpz);
      allPoints.push({ x: gpz.x, y: gpz.y });
      allPoints.push({ x: gpz.x + footprint.width, y: gpz.y + footprint.height });
    }
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
    const nextTransform = applyOperatorReadableInitialTransform(
      fitToView(expanded, { width, height }),
      expanded,
      {
        hasCanonicalGpz: (canonicalGpzs?.length ?? 0) > 0,
        stationCount: stations.length,
        runCount: cableRuns.length,
        derCount: ders.length,
      },
    );
    setTransform((current) => sameViewportTransform(current, nextTransform) ? current : nextTransform);
  }, [gpzs, canonicalGpzs, sections, cableRuns, stations, ders, width, height]);

  /* LOD obliczany przez LodController — histereza FSM zapobiega flicker.
   * `update()` zwraca aktualne LOD po zastosowaniu deadband + debounce. */
  const lod: LodLevel = lodOverride !== undefined
    ? lodOverride
    : lodControllerRef.current.update(transform.scale);
  /* Fallback dla testów bez LodControllera (powinien być zawsze inicjalizowany). */
  void inferLodFromScale; // referencja zachowana dla back-compat innych callerów
  const layers = { ...DEFAULT_LAYER_VISIBILITY, ...(layerVisibility ?? {}) };

  useEffect(() => {
    onViewportTransformChange?.(transform);
  }, [onViewportTransformChange, transform]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cursorScreen = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform((t) => zoomToCursor(t, cursorScreen, zoomFactor));
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      svg.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.target === e.currentTarget)) {
      isDraggingRef.current = true;
      lastPosRef.current = { x: e.clientX, y: e.clientY };
    }
    if (e.button === 0 && e.target === e.currentTarget) {
      onSelectElement?.(null, 'background');
    }
  }, [onSelectElement]);

  const handlePointerDownCapture = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || !onSelectElement) return;
    const target = readSldInteractiveTarget(e.target);
    if (!target || target.kind !== 'apparatus') return;
    e.stopPropagation();
    onSelectElement(target.elementId, 'apparatus');
  }, [onSelectElement]);

  const handleMouseDownCapture = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0 || !onSelectElement) return;
    const target = readSldInteractiveTarget(e.target);
    if (!target || target.kind !== 'apparatus') return;
    e.stopPropagation();
    onSelectElement(target.elementId, 'apparatus');
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
    const target = readSldInteractiveTarget(e.target);
    if (!target) {
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
    <SldLodProvider lod={lod}>
    <svg
      ref={svgRef}
      data-testid="sld-canvas-v2"
      data-lod={lod}
      data-scale={transform.scale.toFixed(3)}
      width={width}
      height={height}
      style={{ background: COLOR_BG, userSelect: 'none' }}
      onMouseDown={handleMouseDown}
      onMouseDownCapture={handleMouseDownCapture}
      onPointerDownCapture={handlePointerDownCapture}
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

        {/* Warstwa połączeń i odcinków SN. Stabilny znacznik jest używany
            przez E2E oraz diagnostykę widoku, nie zmienia semantyki SLD. */}
        <g data-testid="sld-connections-layer">
          {layers.topology && connections.map((c) => (
            <ConnectionRenderer key={c.id} {...c} selected={selectedId === c.id} />
          ))}
        </g>

        {/* Sections (szyny SN GPZ) */}
        {sections.map((s) => (
          <g
            key={s.id}
            data-testid={`sld-v2-section-hit-${s.id}`}
            data-element-kind="section"
            data-element-id={s.id}
            onClick={
              onSelectElement
                ? (e) => {
                    e.stopPropagation();
                    onSelectElement(s.id, 'section');
                  }
                : undefined
            }
            onContextMenu={
              onContextMenu ? buildElementContextMenuHandler('section', s.id) : undefined
            }
            style={{ cursor: onSelectElement ? 'pointer' : 'default' }}
          >
            <SectionRenderer {...s} />
          </g>
        ))}

        {/* GPZ blocks */}
        {gpzs.map((g) => {
          /* Phase R4: prefer canonical SCADA-OSD renderer gdy adapter
           * dostarczył canonical props dla tego id. Fallback do legacy
           * `GpzRenderer` gdy brak (np. snapshot bez gpz_sections + bez bays). */
          const canonical = canonicalGpzs?.find((c) => c.id === g.id);
          if (canonical) {
            return (
              <g
                key={g.id}
                data-testid={`sld-v2-gpz-hit-${g.id}`}
                data-element-kind="gpz_container"
                data-element-id={g.id}
                onContextMenu={
                  onContextMenu
                    ? (e) => {
                        if (isCanonicalGpzInteractiveDescendant(e.target)) return;
                        e.preventDefault();
                        e.stopPropagation();
                        onContextMenu({ kind: 'gpz', elementId: g.id, clientX: e.clientX, clientY: e.clientY });
                      }
                    : undefined
                }
                onClick={
                  onSelectElement
                    ? (e) => {
                        if (isCanonicalGpzInteractiveDescendant(e.target)) return;
                        e.stopPropagation();
                        onSelectElement(g.id, 'gpz');
                      }
                    : undefined
                }
              >
                <GpzCanonicalRenderer
                  {...canonical}
                  onClickBay={
                    onSelectElement
                      ? (bayRef) => onSelectElement(bayRef, 'bay')
                      : canonical.onClickBay
                  }
                  onDoubleClickBay={
                    onSelectElement
                      ? (bayRef) => onSelectElement(bayRef, 'bay')
                      : canonical.onDoubleClickBay
                  }
                  onContextMenuBay={
                    onContextMenu
                      ? (bayRef, evt) => {
                          onContextMenu({
                            kind: 'bay',
                            elementId: bayRef,
                            clientX: evt.clientX,
                            clientY: evt.clientY,
                          });
                        }
                      : canonical.onContextMenuBay
                  }
                  onContextMenuSection={
                    onContextMenu
                      ? (sectionId, evt) => {
                          onContextMenu({
                            kind: 'section',
                            elementId: sectionId,
                            clientX: evt.clientX,
                            clientY: evt.clientY,
                          });
                        }
                      : canonical.onContextMenuSection
                  }
                  onClickApparatus={
                    onSelectElement
                      ? (selection) => onSelectElement(selection.apparatusId, 'apparatus')
                      : canonical.onClickApparatus
                  }
                  onClickTransformer={
                    onSelectElement
                      ? (transformerRef) => onSelectElement(transformerRef, 'transformer')
                      : canonical.onClickTransformer
                  }
                  onContextMenuApparatus={
                    onContextMenu
                      ? (selection, evt) => {
                          onSelectElement?.(selection.apparatusId, 'apparatus');
                          onContextMenu({
                            kind: 'apparatus',
                            elementId: selection.apparatusId,
                            clientX: evt.clientX,
                            clientY: evt.clientY,
                          });
                        }
                      : canonical.onContextMenuApparatus
                  }
                />
                <rect
                  x={canonical.x + 18}
                  y={canonical.y + 18}
                  width={290}
                  height={56}
                  fill="transparent"
                  pointerEvents="all"
                  data-testid={`sld-v2-gpz-header-hit-${g.id}`}
                  data-element-kind="gpz"
                  data-element-id={g.id}
                  onClick={
                    onSelectElement
                      ? (e) => {
                          e.stopPropagation();
                          onSelectElement(g.id, 'gpz');
                        }
                      : undefined
                  }
                  onContextMenu={
                    onContextMenu
                      ? (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onContextMenu({ kind: 'gpz', elementId: g.id, clientX: e.clientX, clientY: e.clientY });
                        }
                      : undefined
                  }
                  style={{ cursor: onSelectElement ? 'pointer' : 'default' }}
                />
              </g>
            );
          }
          return (
            <g
              key={g.id}
              data-testid={`sld-v2-gpz-hit-${g.id}`}
              data-element-kind="gpz"
              data-element-id={g.id}
              onContextMenu={
                onContextMenu ? buildElementContextMenuHandler('gpz', g.id) : undefined
              }
              onClick={
                onSelectElement
                  ? (e) => {
                      e.stopPropagation();
                      onSelectElement(g.id, 'gpz');
                    }
                  : undefined
              }
              style={{ cursor: onSelectElement ? 'pointer' : 'default' }}
            >
              <GpzRenderer
                {...g}
                lod={lod}
                selected={selectedId === g.id}
                onClick={onSelectElement ? (id) => onSelectElement(id, 'gpz') : undefined}
              />
            </g>
          );
        })}

        {/* Stacje na ciągu */}
        {layers.equipment && (
          <g data-testid="sld-cable-runs-layer">
            {cableRuns.map((run) => (
              <g
                key={run.id}
                data-connection-ref={run.id}
                data-element-kind="cable_run"
                data-element-id={run.id}
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
                  stationPortGaps={buildStationPortGapsForRun(run, stations, lod)}
                  selected={selectedId === run.id}
                  onClick={onSelectElement ? (id) => onSelectElement(id, 'cable_run') : undefined}
                />
              </g>
            ))}
          </g>
        )}

        {stations.map((st) => {
          const stationLod = st.lod ?? lod;
          const stationUsesMiniBlock = stationUsesMiniBlockRenderer(st, stationLod);
          return (
            <g
              key={st.id}
              data-testid={`sld-v2-station-hit-${st.id}`}
              data-element-kind="station"
              data-element-id={st.id}
              onContextMenu={
                onContextMenu ? buildElementContextMenuHandler('station', st.id) : undefined
              }
              onClick={
                onSelectElement
                  ? (e) => {
                      e.stopPropagation();
                      onSelectElement(st.id, 'station');
                    }
                  : undefined
              }
              onDoubleClick={
                onDoubleClickStation
                  ? (e) => {
                      e.stopPropagation();
                      onDoubleClickStation(st.id);
                    }
                  : undefined
              }
              style={{ cursor: onSelectElement ? 'pointer' : 'default' }}
            >
              <StationOnRunRenderer
                {...st}
                alarmSeverity={st.alarmSeverity ?? computeStationAlarmSeverity(st, overlayPayload)}
                lod={stationLod}
                selected={selectedId === st.id}
                onClick={onSelectElement ? (id) => onSelectElement(id, 'station') : undefined}
                onDoubleClick={onDoubleClickStation}
              />
              {!stationUsesMiniBlock && st.transformerRefs?.map((transformerRef, index) => (
                <g
                  key={`station-transformer-symbol-${transformerRef}`}
                  data-testid={`sld-symbol-transformer-${transformerRef}`}
                  data-element-kind="transformer_sn_nn"
                  data-element-id={transformerRef}
                  transform={`translate(${st.x + 46 + index * 18}, ${st.y + 16})`}
                  onClick={onSelectElement ? (event) => {
                    event.stopPropagation();
                    onSelectElement(transformerRef, 'transformer');
                  } : undefined}
                  style={{ cursor: onSelectElement ? 'pointer' : 'default' }}
                >
                  <rect x={-16} y={-16} width={32} height={36} fill="transparent" />
                  <circle cx={0} cy={-4} r={7} fill="none" stroke="#18D26B" strokeWidth={1.4} />
                  <circle cx={0} cy={8} r={7} fill="none" stroke="#18D26B" strokeWidth={1.4} />
                  <title>Transformator SN/nN {transformerRef}</title>
                </g>
              ))}
            </g>
          );
        })}

        {/* K30-3 NO-GO #9: result overlay metrics z LOAD_FLOW/SC_3F payload */}
        <ResultOverlayLayer stations={stations} cableRuns={cableRuns} />

        {/* K30-11: aggregate alarm summary panel — count of station severities */}
        {/* K30-38: industrial title block per PN-EN ISO 7200.
         *  Wyodrębniony z inline (K30-12) do dedykowanego komponentu — pozwala
         *  customize project info / designer / approver / drawing number via
         *  titleBlockData prop. Backward-compat: defaults zachowują K30-12. */}
        <g transform={`translate(${width - 380}, ${height - 124})`}>
          <SldTitleBlock data={titleBlockData ?? undefined} />
        </g>

        {/* K30-39: SLD legend overlay — klucz palet (voltage / cable variants /
         *  apparatus state / DER). Pozycja: top-right canvas (poniżej grid
         *  stability + alarm summary). Toggle via showLegend prop. */}
        <SldLegendOverlay
          visible={showLegend}
          x={width - 240}
          y={20}
        />

        {/* K30-43: skala rysunku per PN-EN ISO 5455 — bottom-left canvas. */}
        <SldScaleRuler
          visible={showScaleRuler}
          x={20}
          y={height - 60}
        />

        {/* K30-13: grid frequency + voltage status panel (ENEA Operator NC RfG).
         *  Static placeholder dla frequency stability + slack bus voltage.
         *  Real data po backend doda P(f) feed; póki co mock 50.00 Hz.
         */}
        <g data-testid="sld-v2-grid-stability-panel" transform="translate(20, 88)" pointerEvents="none">
          <rect x={0} y={0} width={260} height={62} rx={4} ry={4} fill="#0A0E14" stroke="#7EE0B5" strokeWidth={1.5} opacity={0.95} />
          <text x={10} y={18} fill="#7EE0B5" fontFamily="sans-serif" fontSize={12} fontWeight={900}>
            STAN SIECI · NC RfG
          </text>
          <text x={10} y={36} fill="#DDF7FF" fontFamily="monospace" fontSize={14} fontWeight={700}>
            f = 50.00 Hz
          </text>
          <text x={10} y={52} fill="#88BBDD" fontFamily="sans-serif" fontSize={9}>
            ±0.20 Hz (PN-EN 50160)
          </text>
          <text x={130} y={36} fill="#DDF7FF" fontFamily="monospace" fontSize={14} fontWeight={700}>
            U = 110 kV
          </text>
          <text x={130} y={52} fill="#88BBDD" fontFamily="sans-serif" fontSize={9}>
            Slack: GPZ HV
          </text>
        </g>

        {alarmSummary && (
          <g data-testid="sld-v2-alarm-summary-panel" transform="translate(20, 20)" pointerEvents="none">
            <rect x={0} y={0} width={260} height={56} rx={4} ry={4} fill="#0A0E14" stroke="#FFD166" strokeWidth={1.5} opacity={0.95} />
            <text x={10} y={20} fill="#FFD166" fontFamily="sans-serif" fontSize={13} fontWeight={900}>
              ALARMS NA SIECI ({alarmSummary.total} stacji)
            </text>
            <circle cx={20} cy={40} r={6} fill="#FF6B6B" />
            <text x={32} y={44} fill="#FF6B6B" fontFamily="sans-serif" fontSize={12} fontWeight={700}>
              {alarmSummary.critical} CRIT
            </text>
            <circle cx={100} cy={40} r={6} fill="#FF8B5C" />
            <text x={112} y={44} fill="#FF8B5C" fontFamily="sans-serif" fontSize={12} fontWeight={700}>
              {alarmSummary.important} IMP
            </text>
            <circle cx={180} cy={40} r={6} fill="#FFD166" />
            <text x={192} y={44} fill="#FFD166" fontFamily="sans-serif" fontSize={12} fontWeight={700}>
              {alarmSummary.warning} WARN
            </text>
          </g>
        )}

        {/* DER (PV/BESS/FW) */}
        {layers.der && ders.map((d) => {
          const menuKind: SldElementContextKind =
            d.kind === 'PV' ? 'der_pv' : d.kind === 'BESS' ? 'der_bess' : 'der_fw';
          return (
            <g
              key={d.id}
              data-testid={`sld-v2-der-hit-${d.id}`}
              data-element-kind={menuKind}
              data-element-id={d.id}
              onContextMenu={
                onContextMenu ? buildElementContextMenuHandler(menuKind, d.id) : undefined
              }
              onClick={
                onSelectElement
                  ? (e) => {
                      e.stopPropagation();
                      onSelectElement(d.id, 'der');
                    }
                  : undefined
              }
              onDoubleClick={
                onDoubleClickDer
                  ? (e) => {
                      e.stopPropagation();
                      onDoubleClickDer(d.id);
                    }
                  : undefined
              }
              style={{ cursor: onSelectElement ? 'pointer' : 'default' }}
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
    </SldLodProvider>
  );
}

type CableRunForPortGaps = SldCanvasV2Props['cableRuns'][number];

function buildStationPortGapsForRun(
  run: CableRunForPortGaps,
  stations: readonly StationOnRunRendererProps[],
  currentLod: LodLevel,
): CableRunStationPortGap[] {
  const gaps: CableRunStationPortGap[] = [];
  for (const station of stations) {
    const connectionY = station.y - STATION_RUN_TRUNK_OFFSET_Y;
    if (!runHasHorizontalSegmentAtY(run, connectionY, station.x)) continue;
    const [inputOffset, outputOffset] = stationPortOffsets(station, currentLod);
    gaps.push({
      stationId: station.id,
      y: connectionY,
      inputX: station.x + inputOffset,
      outputX: outputOffset === null ? null : station.x + outputOffset,
    });
  }
  return gaps;
}

function runHasHorizontalSegmentAtY(
  run: CableRunForPortGaps,
  y: number,
  x: number,
): boolean {
  for (let i = 0; i < run.pathPoints.length - 1; i++) {
    const a = run.pathPoints[i];
    const b = run.pathPoints[i + 1];
    if (a.y !== b.y) continue;
    if (Math.abs(a.y - y) > 0.5) continue;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    if (x >= minX && x <= maxX) return true;
  }
  return false;
}

function stationPortOffsets(
  station: StationOnRunRendererProps,
  currentLod: LodLevel,
): readonly [number, number | null] {
  if (station.snBays) {
    const miniBlockOffsets = miniBlockStationPortOffsets(
      miniBlockVariantForLod(station.lod ?? currentLod),
      station.snBays,
      station.derBadges ?? [],
    );
    if (miniBlockOffsets) return miniBlockOffsets;
  }
  switch (station.topologicalType) {
    case 'przelotowa':
    case 'sekcyjna':
      return [-28, 28];
    case 'odgałęźna':
      return [-36, 36];
    case 'końcowa':
    default:
      return [0, null];
  }
}

function miniBlockVariantForLod(lod: LodLevel): 'overview' | 'compact' | 'detail' {
  if (lod <= 0) return 'overview';
  if (lod === 1) return 'compact';
  return 'detail';
}

function stationUsesMiniBlockRenderer(
  station: StationOnRunRendererProps,
  currentLod: LodLevel,
): boolean {
  return currentLod < 3 && station.snBays !== undefined;
}


/**
 * K30-8: compute alarm severity per station z overlay payload.
 * Patrzy na bus SN ref (mapping station_id → sn_bus_ref) + sprawdza
 * thresholds (Ik > 25 kA → critical, > 20 → important, > 15 → warning).
 * Returns null gdy brak alarm.
 */
function computeStationAlarmSeverity(
  station: StationOnRunRendererProps,
  payload: RawOverlayPayload | null,
): 'warning' | 'important' | 'critical' | null {
  if (!payload) return null;
  const snBusRef = station.id.endsWith('/station')
    ? `${station.id.slice(0, -'/station'.length)}/sn_bus`
    : `${station.id}/sn_bus`;
  const el = payload.elements[snBusRef];
  if (!el) return null;
  const analysisType = payload.analysis_type;
  const isSc3F = analysisType?.toLowerCase().includes('short_circuit') || analysisType === 'SC_3F';
  if (isSc3F) {
    const ik = el.metrics?.IK_3F_A?.value;
    if (ik === null || ik === undefined) return null;
    if (ik > 25) return 'critical';
    if (ik > 20) return 'important';
    if (ik > 15) return 'warning';
  } else {
    const u = el.metrics?.U_kV?.value;
    if (u === null || u === undefined) return null;
    const pu = Math.abs(u / 15 - 1);
    if (pu > 0.1) return 'critical';
    if (pu > 0.07) return 'important';
    if (pu > 0.05) return 'warning';
  }
  return null;
}
