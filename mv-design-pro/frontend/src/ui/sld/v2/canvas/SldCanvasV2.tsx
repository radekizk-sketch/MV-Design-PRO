/**
 * SldCanvasV2 — composition root nowego SLD (PR-5b).
 *
 * Pure functional viewport + SVG canvas. NIE wpina się jeszcze w
 * WorkspaceSurfaceRouter (to PR-14, kiedy default_sld_v2=true).
 *
 * Działa równolegle do starego `SLDView.tsx` jako opt-in pod `AreaId.SLD_V2`.
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
  inferLodFromScale,
  type LodLevel,
  type SldLayerId,
} from '../lod/LodPolicy';
import { COLOR_BG, COLOR_PANEL } from '../theme/tokens';
import { CableRunRenderer } from '../renderer/CableRunRenderer';
import { ConnectionRenderer } from '../renderer/ConnectionRenderer';
import { DerRenderer, type DerRendererProps } from '../renderer/DerRenderer';
import { GpzRenderer, type GpzRendererProps } from '../renderer/GpzRenderer';
import { SectionRenderer, type SectionRendererProps } from '../renderer/SectionRenderer';
import { StationOnRunRenderer, type StationOnRunRendererProps } from '../renderer/StationOnRunRenderer';

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

  readonly onSelectElement?: (id: string | null, kind: string) => void;
  readonly onDoubleClickStation?: (id: string) => void;
  readonly onDoubleClickDer?: (id: string) => void;
}

export function SldCanvasV2(props: SldCanvasV2Props): JSX.Element {
  const {
    width, height, gpzs, sections, cableRuns, stations, ders, connections = [],
    selectedId, lodOverride, layerVisibility,
    onSelectElement, onDoubleClickStation, onDoubleClickDer,
  } = props;

  const [transform, setTransform] = useState<ViewportTransform>(IDENTITY_TRANSFORM);
  const isDraggingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

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

  const lod: LodLevel = lodOverride !== undefined ? lodOverride : inferLodFromScale(transform.scale);
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
    >
      {/* Tło */}
      <rect width={width} height={height} fill={COLOR_BG} />

      {/* World transform */}
      <g transform={`translate(${transform.translateX}, ${transform.translateY}) scale(${transform.scale})`}>
        {/* Connections (cienka warstwa pomocnicza) */}
        {layers.topology && connections.map((c) => (
          <ConnectionRenderer key={c.id} {...c} selected={selectedId === c.id} />
        ))}

        {/* Cable runs */}
        {layers.equipment && cableRuns.map((run) => (
          <CableRunRenderer
            key={run.id}
            {...run}
            selected={selectedId === run.id}
            onClick={onSelectElement ? (id) => onSelectElement(id, 'cable_run') : undefined}
          />
        ))}

        {/* Sections (szyny SN GPZ) */}
        {sections.map((s) => (
          <SectionRenderer key={s.id} {...s} />
        ))}

        {/* GPZ blocks */}
        {gpzs.map((g) => (
          <GpzRenderer
            key={g.id}
            {...g}
            selected={selectedId === g.id}
            onClick={onSelectElement ? (id) => onSelectElement(id, 'gpz') : undefined}
          />
        ))}

        {/* Stacje na ciągu */}
        {stations.map((st) => (
          <StationOnRunRenderer
            key={st.id}
            {...st}
            selected={selectedId === st.id}
            onClick={onSelectElement ? (id) => onSelectElement(id, 'station') : undefined}
            onDoubleClick={onDoubleClickStation}
          />
        ))}

        {/* DER (PV/BESS/FW) */}
        {layers.der && ders.map((d) => (
          <DerRenderer
            key={d.id}
            {...d}
            selected={selectedId === d.id}
            onClick={onSelectElement ? (id) => onSelectElement(id, 'der') : undefined}
            onDoubleClick={onDoubleClickDer}
          />
        ))}
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
