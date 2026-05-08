/**
 * NetworkTerrainRenderer — pełna sieć terenowa SN (R17, operator-grade).
 *
 * Renderuje sieć poza GPZ:
 *   - Wszystkie LineRun jako SVG paths (cable runs) z deterministycznym layoutem
 *   - Stacje na ciągach (mini-RMU) podłączone przez porty IN (sn_input) / OUT (sn_output)
 *   - Cable bus horyzontalny + ringi/promienie
 *   - Kable wchodzą do stacji od TOP (port sn_input) i wychodzą od BOTTOM (port sn_output)
 *   - Lub odwrotnie zależnie od bay_role (IN/OUT/BRANCH)
 *
 * Reuse:
 *   - MiniBlockRmuRenderer (compact wariant) per stacja
 *   - ConnectionRenderer + RouteSegment (orthogonal Manhattan paths)
 *   - PortKind contract (sn_input / sn_output / sn_branch)
 *
 * Acceptance Inv 11: stacja w widoku oddalonym = mini-RMU/RM6 wynikające z bays[]+ports[].
 * Acceptance Inv 13: CT/VT/uziemnik z BayTemplate + BayDeviceOrderPolicy.
 *
 * Reference: Mikronika MIKRA II GPZ-5 PST (Energa Poznań).
 */

import { memo, useMemo } from 'react';

import {
  COLOR_BG,
  COLOR_BUS_LV,
  COLOR_LINE_PRIMARY,
  COLOR_PANEL_RAISED,
  COLOR_TEXT_MUTED,
  COLOR_TEXT_PRIMARY,
  COLOR_TEXT_SECONDARY,
  FONT_MONO,
  FONT_SANS,
} from '../theme/tokens';

import {
  MiniBlockRmuRenderer,
  type MiniBlockBayDescriptor,
  type MiniBlockDerBadge,
} from './MiniBlockRmuRenderer';

import type { StationFootprintType } from './MiniBlockFootprints';

/* =============================================================================
   Types — terrain graph (pełna sieć poza GPZ)
   ============================================================================= */

export type CableRunKind =
  | 'main_trunk'    // ciąg główny z GPZ
  | 'branch'        // odgałęzienie
  | 'ring_return'   // powrót pierścienia
  | 'tie_open'      // NOP (normalnie otwarte)
  | 'service';      // przyłącze odbiorcy

export type SegmentKind = 'cable_sn' | 'overhead_line_sn';

/** Status energetyczny segmentu (z runtime SCADA). */
export type EnergizationState = 'energized' | 'deenergized' | 'fault' | 'unknown';

/** Kierunek przepływu mocy (z load flow). */
export type FlowDirection = 'forward' | 'reverse' | 'none';

/**
 * NetworkSegment — pojedynczy odcinek kabla SN łączący 2 punkty
 * (port stacji ↔ port stacji LUB port GPZ ↔ port stacji).
 *
 * Path expressed as orthogonal points (Manhattan routing). Każdy segment ma
 * source + target identyfikowane przez `endpointRef` ({stationRef, portKind}).
 *
 * Inv 8: layout_hash zmienia się gdy bend points zmieniają, ale topology_hash
 * niezmieniony.
 */
export interface NetworkSegmentEndpoint {
  /** Element ref ('gpz', 'station-X' lub 'tie-open-Y'). */
  readonly elementRef: string;
  /** Bay ref na końcu (gdy łączy się z konkretnym polem). */
  readonly bayRef: string | null;
  /** Port kind (sn_input/sn_output/sn_branch). */
  readonly portKind: 'sn_input' | 'sn_output' | 'sn_branch';
  /** X/Y w viewport — pozycja portu fizyczna na canvas. */
  readonly x: number;
  readonly y: number;
}

export interface NetworkSegment {
  readonly segmentId: string;
  readonly runKind: CableRunKind;
  readonly segmentKind: SegmentKind;
  readonly source: NetworkSegmentEndpoint;
  readonly target: NetworkSegmentEndpoint;
  /** Orthogonal path — minimum 2 punkty (source.position, target.position). */
  readonly pathPoints: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  /** Status energetyczny (z runtime SCADA). */
  readonly energization: EnergizationState;
  /** Kierunek przepływu mocy (z load flow). */
  readonly flowDirection: FlowDirection;
  /** Numer dyspozytorski kabla. */
  readonly cableNumber: string | null;
  /** Długość (m) — z LineRun.length_m + segment.length_m. */
  readonly lengthM: number | null;
  /** Catalog reference (np. "cable:XRUHKXS:240:15kV"). */
  readonly catalogRef: string | null;
  /** P/Q/I per segment (z load flow runtime). */
  readonly measurements?: NetworkSegmentMeasurements | null;
}

export interface NetworkSegmentMeasurements {
  readonly pMw?: number | null;
  readonly qMvar?: number | null;
  readonly iA?: number | null;
  readonly lossPercent?: number | null;
}

/** Stacja na sieci terenowej (mini-RMU pozycjonowany na canvas). */
export interface NetworkStation {
  readonly stationRef: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly footprintType: StationFootprintType;
  readonly snBays: readonly MiniBlockBayDescriptor[];
  readonly hasTransformer: boolean;
  readonly transformerRatedKva: number | null;
  readonly nnFeedersCount: number;
  readonly derBadges: readonly MiniBlockDerBadge[];
  readonly missingData: boolean;
  /** Wynik load flow per stacja — np. U_actual_kV / U_setpoint_kV. */
  readonly voltageActualKv?: number | null;
  /** Voltage drop level dla colorize (heatmap). */
  readonly voltageDropPercent?: number | null;
}

/* =============================================================================
   Renderer props
   ============================================================================= */

export interface NetworkTerrainRendererProps {
  /** Punkt zaczepienia GPZ (gdzie kable wychodzą z GPZ outgoing bays). */
  readonly gpzAnchor: { readonly x: number; readonly y: number };

  /** Wszystkie segmenty kabli SN. */
  readonly segments: readonly NetworkSegment[];

  /** Wszystkie stacje na sieci (mini-RMU). */
  readonly stations: readonly NetworkStation[];

  /** Wybór elementu (highlight). */
  readonly selectedId?: string | null;

  /** Tryb wyświetlania nakładek wyników. */
  readonly overlayMode?: 'none' | 'voltage' | 'flow' | 'losses' | 'short_circuit';

  /* Interakcja */
  readonly onClickStation?: (stationRef: string) => void;
  readonly onDoubleClickStation?: (stationRef: string) => void;
  readonly onContextMenuStation?: (stationRef: string, evt: { clientX: number; clientY: number }) => void;
  readonly onClickSegment?: (segmentId: string) => void;
  readonly onContextMenuSegment?: (segmentId: string, evt: { clientX: number; clientY: number }) => void;
  readonly onHoverSegment?: (segmentId: string | null) => void;
}

/* =============================================================================
   Renderer
   ============================================================================= */

export const NetworkTerrainRenderer = memo(NetworkTerrainRendererImpl);

function NetworkTerrainRendererImpl(props: NetworkTerrainRendererProps): JSX.Element {
  const {
    gpzAnchor, segments, stations,
    selectedId, overlayMode = 'none',
    onClickStation, onDoubleClickStation, onContextMenuStation,
    onClickSegment, onContextMenuSegment, onHoverSegment,
  } = props;

  /* Bounding box dla łatwego centerowania (deterministyczne) */
  const bbox = useMemo(() => computeBoundingBox(segments, stations, gpzAnchor), [segments, stations, gpzAnchor]);

  return (
    <g
      data-testid="sld-v2-network-terrain"
      data-bbox-x={bbox.minX.toFixed(0)}
      data-bbox-y={bbox.minY.toFixed(0)}
      data-bbox-w={(bbox.maxX - bbox.minX).toFixed(0)}
      data-bbox-h={(bbox.maxY - bbox.minY).toFixed(0)}
      role="group"
      aria-label={`Sieć terenowa SN: ${stations.length} stacji, ${segments.length} segmentów kabli`}
    >
      {/* GPZ anchor marker (bullseye) — punkt z którego kable wchodzą do sieci */}
      <g
        data-testid="network-terrain-gpz-anchor"
        transform={`translate(${gpzAnchor.x}, ${gpzAnchor.y})`}
      >
        <circle cx={0} cy={0} r={6} fill={COLOR_BUS_LV} stroke={COLOR_LINE_PRIMARY} strokeWidth={1.5} />
        <circle cx={0} cy={0} r={2} fill={COLOR_LINE_PRIMARY} />
      </g>

      {/* Segmenty kabli — renderowane PIERWSZE żeby były pod stacjami */}
      {segments.map((seg) => (
        <NetworkSegmentRenderer
          key={`seg-${seg.segmentId}`}
          segment={seg}
          selected={selectedId === seg.segmentId}
          overlayMode={overlayMode}
          onClick={onClickSegment}
          onContextMenu={onContextMenuSegment}
          onHover={onHoverSegment}
        />
      ))}

      {/* Stacje (mini-RMU) — NA segmentach */}
      {stations.map((sta) => (
        <NetworkStationRenderer
          key={`sta-${sta.stationRef}`}
          station={sta}
          selected={selectedId === sta.stationRef}
          overlayMode={overlayMode}
          onClick={onClickStation}
          onDoubleClick={onDoubleClickStation}
          onContextMenu={onContextMenuStation}
        />
      ))}
    </g>
  );
}

/* =============================================================================
   NetworkSegmentRenderer — pojedynczy kabel SN z polilinią
   ============================================================================= */

interface NetworkSegmentRendererProps {
  readonly segment: NetworkSegment;
  readonly selected: boolean;
  readonly overlayMode: 'none' | 'voltage' | 'flow' | 'losses' | 'short_circuit';
  readonly onClick?: (segmentId: string) => void;
  readonly onContextMenu?: (segmentId: string, evt: { clientX: number; clientY: number }) => void;
  readonly onHover?: (segmentId: string | null) => void;
}

function NetworkSegmentRenderer(props: NetworkSegmentRendererProps): JSX.Element {
  const { segment, selected, overlayMode, onClick, onContextMenu, onHover } = props;
  const pathD = pointsToPath(segment.pathPoints);
  const stroke = segmentStrokeColor(segment, selected, overlayMode);
  const strokeWidth = selected ? 2.5 : 1.5;
  const strokeDasharray = segment.runKind === 'tie_open' ? '6,4' : undefined;

  /* Tooltip text */
  const tooltipText = segmentTooltipText(segment);

  /* Center point dla labela kabla */
  const centerIdx = Math.floor(segment.pathPoints.length / 2);
  const centerPt = segment.pathPoints[centerIdx] ?? { x: 0, y: 0 };

  return (
    <g
      data-testid={`network-segment-${segment.segmentId}`}
      data-run-kind={segment.runKind}
      data-energization={segment.energization}
      data-flow-direction={segment.flowDirection}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(segment.segmentId); } : undefined}
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(segment.segmentId, { clientX: e.clientX, clientY: e.clientY });
            }
          : undefined
      }
      onMouseEnter={onHover ? () => onHover(segment.segmentId) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <title>{tooltipText}</title>
      {/* Hit-area szersza dla łatwiejszego klikania */}
      <path d={pathD} fill="none" stroke="transparent" strokeWidth={10} />
      {/* Widoczny kabel */}
      <path
        d={pathD}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        strokeLinejoin="miter"
        data-testid={`network-segment-${segment.segmentId}-path`}
      />
      {/* Label kabla (numer dyspozytorski) */}
      {segment.cableNumber && (
        <text
          x={centerPt.x}
          y={centerPt.y - 6}
          textAnchor="middle"
          fill={COLOR_TEXT_MUTED}
          fontFamily={FONT_MONO}
          fontSize={8}
          data-testid={`network-segment-${segment.segmentId}-label`}
        >
          {segment.cableNumber}
        </text>
      )}
      {/* Flow direction arrow (overlay flow mode) */}
      {overlayMode === 'flow' && segment.flowDirection !== 'none' && (
        <FlowArrow
          path={segment.pathPoints}
          direction={segment.flowDirection}
        />
      )}
      {/* Measurement label (overlay voltage/losses/flow) */}
      {overlayMode !== 'none' && segment.measurements && (
        <SegmentMeasurementLabel
          x={centerPt.x}
          y={centerPt.y + 10}
          measurements={segment.measurements}
          mode={overlayMode}
        />
      )}
    </g>
  );
}

function segmentStrokeColor(
  seg: NetworkSegment,
  selected: boolean,
  overlayMode: 'none' | 'voltage' | 'flow' | 'losses' | 'short_circuit',
): string {
  if (selected) return '#FFC857';
  if (seg.energization === 'fault') return '#FF4040';
  if (seg.energization === 'deenergized') return '#5A5A5A';
  if (seg.energization === 'unknown') return '#888';
  if (overlayMode === 'voltage') {
    /* Voltage profile heatmap (placeholder — czerwony gdy <90%, żółty 90-95%, zielony 95-100%) */
    return COLOR_BUS_LV;
  }
  if (overlayMode === 'losses') {
    if ((seg.measurements?.lossPercent ?? 0) > 5) return '#FF8040';
    if ((seg.measurements?.lossPercent ?? 0) > 2) return '#E8C100';
    return COLOR_BUS_LV;
  }
  return COLOR_BUS_LV; // zielony — energized normal
}

function segmentTooltipText(seg: NetworkSegment): string {
  const lines: string[] = [
    `Kabel SN — ${runKindLabel(seg.runKind)}`,
  ];
  if (seg.cableNumber) lines.push(`Numer: ${seg.cableNumber}`);
  if (seg.lengthM != null) lines.push(`Długość: ${seg.lengthM.toFixed(0)} m`);
  if (seg.catalogRef) lines.push(`Katalog: ${seg.catalogRef}`);
  lines.push('');
  lines.push(`Stan: ${energizationLabel(seg.energization)}`);
  if (seg.flowDirection !== 'none') lines.push(`Kierunek: ${flowDirectionLabel(seg.flowDirection)}`);
  if (seg.measurements) {
    const m = seg.measurements;
    if (m.pMw != null) lines.push(`P = ${m.pMw.toFixed(2)} MW`);
    if (m.qMvar != null) lines.push(`Q = ${m.qMvar.toFixed(2)} MVAr`);
    if (m.iA != null) lines.push(`I = ${m.iA.toFixed(0)} A`);
    if (m.lossPercent != null) lines.push(`Straty: ${m.lossPercent.toFixed(2)}%`);
  }
  lines.push('');
  lines.push(`Od: ${seg.source.elementRef} (${portKindLabel(seg.source.portKind)})`);
  lines.push(`Do: ${seg.target.elementRef} (${portKindLabel(seg.target.portKind)})`);
  return lines.join('\n');
}

function runKindLabel(k: CableRunKind): string {
  switch (k) {
    case 'main_trunk': return 'ciąg główny';
    case 'branch': return 'odgałęzienie';
    case 'ring_return': return 'powrót pierścienia';
    case 'tie_open': return 'normalnie otwarty (NOP)';
    case 'service': return 'przyłącze odbiorcy';
  }
}

function energizationLabel(e: EnergizationState): string {
  switch (e) {
    case 'energized': return 'pod napięciem';
    case 'deenergized': return 'bez napięcia';
    case 'fault': return 'AWARIA';
    case 'unknown': return 'nieznany';
  }
}

function flowDirectionLabel(d: FlowDirection): string {
  switch (d) {
    case 'forward': return 'w przód (od GPZ)';
    case 'reverse': return 'wsteczny (do GPZ)';
    case 'none': return '—';
  }
}

function portKindLabel(p: 'sn_input' | 'sn_output' | 'sn_branch'): string {
  switch (p) {
    case 'sn_input': return 'port wejścia SN';
    case 'sn_output': return 'port wyjścia SN';
    case 'sn_branch': return 'port odgałęzienia SN';
  }
}

/* =============================================================================
   FlowArrow — strzałka kierunku przepływu (overlay)
   ============================================================================= */

interface FlowArrowProps {
  readonly path: ReadonlyArray<{ readonly x: number; readonly y: number }>;
  readonly direction: FlowDirection;
}

function FlowArrow(props: FlowArrowProps): JSX.Element | null {
  const { path, direction } = props;
  if (path.length < 2 || direction === 'none') return null;
  /* Środek path (midpoint) */
  const midIdx = Math.floor(path.length / 2);
  const a = path[Math.max(0, midIdx - 1)];
  const b = path[midIdx];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return null;
  const ux = dx / len;
  const uy = dy / len;
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const sign = direction === 'forward' ? 1 : -1;
  const arrowSize = 6;
  /* Trójkąt strzałki */
  const tipX = cx + sign * ux * arrowSize;
  const tipY = cy + sign * uy * arrowSize;
  const baseX1 = cx - sign * ux * arrowSize - sign * uy * arrowSize * 0.7;
  const baseY1 = cy - sign * uy * arrowSize + sign * ux * arrowSize * 0.7;
  const baseX2 = cx - sign * ux * arrowSize + sign * uy * arrowSize * 0.7;
  const baseY2 = cy - sign * uy * arrowSize - sign * ux * arrowSize * 0.7;
  return (
    <polygon
      points={`${tipX},${tipY} ${baseX1},${baseY1} ${baseX2},${baseY2}`}
      fill="#FFC857"
      stroke="#FFC857"
      strokeWidth={0.5}
      data-testid="network-segment-flow-arrow"
    />
  );
}

/* =============================================================================
   SegmentMeasurementLabel — overlay z P/Q/U/I
   ============================================================================= */

interface SegmentMeasurementLabelProps {
  readonly x: number;
  readonly y: number;
  readonly measurements: NetworkSegmentMeasurements;
  readonly mode: 'voltage' | 'flow' | 'losses' | 'short_circuit';
}

function SegmentMeasurementLabel(props: SegmentMeasurementLabelProps): JSX.Element {
  const { x, y, measurements, mode } = props;
  let label = '';
  if (mode === 'flow' && measurements.pMw != null) {
    label = `${measurements.pMw.toFixed(2)} MW`;
  } else if (mode === 'losses' && measurements.lossPercent != null) {
    label = `${measurements.lossPercent.toFixed(2)}%`;
  } else if (measurements.iA != null) {
    label = `${measurements.iA.toFixed(0)} A`;
  }
  if (!label) return <></>;
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      fill={COLOR_TEXT_PRIMARY}
      fontFamily={FONT_MONO}
      fontSize={8}
      fontWeight={600}
      data-testid="network-segment-measurement-label"
    >
      {label}
    </text>
  );
}

/* =============================================================================
   NetworkStationRenderer — mini-RMU stacji w sieci
   ============================================================================= */

interface NetworkStationRendererProps {
  readonly station: NetworkStation;
  readonly selected: boolean;
  readonly overlayMode: 'none' | 'voltage' | 'flow' | 'losses' | 'short_circuit';
  readonly onClick?: (stationRef: string) => void;
  readonly onDoubleClick?: (stationRef: string) => void;
  readonly onContextMenu?: (stationRef: string, evt: { clientX: number; clientY: number }) => void;
}

function NetworkStationRenderer(props: NetworkStationRendererProps): JSX.Element {
  const { station, selected, overlayMode, onClick, onDoubleClick, onContextMenu } = props;

  /* Voltage heatmap color outline */
  const voltageOutline = (overlayMode === 'voltage' && station.voltageDropPercent != null)
    ? voltageDropColor(station.voltageDropPercent)
    : null;

  return (
    <g
      data-testid={`network-station-${station.stationRef}`}
      data-station-ref={station.stationRef}
      data-selected={selected}
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onContextMenu(station.stationRef, { clientX: e.clientX, clientY: e.clientY });
            }
          : undefined
      }
    >
      {/* Voltage outline overlay */}
      {voltageOutline && (
        <rect
          x={station.x - 56}
          y={station.y - 32}
          width={112}
          height={64}
          fill="none"
          stroke={voltageOutline}
          strokeWidth={3}
          strokeOpacity={0.6}
          rx={4}
        />
      )}
      {/* Pełen MiniBlockRmuRenderer (compact wariant) */}
      <MiniBlockRmuRenderer
        id={station.stationRef}
        x={station.x}
        y={station.y}
        variant="compact"
        footprintType={station.footprintType}
        name={station.name}
        snBays={station.snBays}
        hasTransformer={station.hasTransformer}
        transformerRatedKva={station.transformerRatedKva}
        nnFeedersCount={station.nnFeedersCount}
        derBadges={station.derBadges}
        missingData={station.missingData}
        selected={selected}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      />
      {/* Voltage label (overlay voltage mode) */}
      {overlayMode === 'voltage' && station.voltageActualKv != null && (
        <text
          x={station.x}
          y={station.y + 36}
          textAnchor="middle"
          fill={COLOR_TEXT_SECONDARY}
          fontFamily={FONT_MONO}
          fontSize={9}
          fontWeight={600}
          data-testid={`network-station-${station.stationRef}-voltage`}
        >
          U = {station.voltageActualKv.toFixed(2)} kV
        </text>
      )}
    </g>
  );
}

function voltageDropColor(dropPercent: number): string {
  if (dropPercent < 2) return '#13C45A'; // OK — zielony
  if (dropPercent < 5) return '#E8C100'; // ostrzegawczy — żółty
  if (dropPercent < 8) return '#FF8040'; // wysoki — pomarańczowy
  return '#FF4040'; // krytyczny — czerwony
}

/* =============================================================================
   Helpers
   ============================================================================= */

function pointsToPath(points: ReadonlyArray<{ readonly x: number; readonly y: number }>): string {
  if (points.length === 0) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

function computeBoundingBox(
  segments: readonly NetworkSegment[],
  stations: readonly NetworkStation[],
  gpzAnchor: { x: number; y: number },
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = gpzAnchor.x;
  let minY = gpzAnchor.y;
  let maxX = gpzAnchor.x;
  let maxY = gpzAnchor.y;
  for (const seg of segments) {
    for (const pt of seg.pathPoints) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
  }
  for (const sta of stations) {
    minX = Math.min(minX, sta.x - 60);
    minY = Math.min(minY, sta.y - 30);
    maxX = Math.max(maxX, sta.x + 60);
    maxY = Math.max(maxY, sta.y + 30);
  }
  return { minX, minY, maxX, maxY };
}

/* Re-export tokens dla unused import suppress */
void COLOR_BG;
void COLOR_PANEL_RAISED;
void FONT_SANS;
