/**
 * SldCanvasV2 - composition root nowego SLD.
 *
 * Pure functional viewport + SVG canvas. Renderowane przez SldWorkspaceContainer
 * w kanonicznym shellu (ekran E-01 "G??wne ?rodowisko pracy SLD").
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  centerOnPoint,
  computeBoundingBox,
  fitToView,
  IDENTITY_TRANSFORM,
  pan as panTransform,
  zoomToCursor,
  type ViewportTransform,
} from '../viewport/ViewportController';
import {
  DEFAULT_LAYER_VISIBILITY,
  LOD_LEVEL_LABELS_PL,
  createLodController,
  inferLodFromScale,
  type LodController,
  type LodLevel,
  type SldLayerId,
} from '../lod/LodPolicy';
import {
  densityAwareLevel,
  numericLodToLevel,
  polylineIntersectsViewport,
  virtualizePositioned,
  worldViewportFromTransform,
  type LodLevel as GeomLodLevel,
  type WorldViewport,
} from '../../../../engine/sld-layout/lodController';
// Jedyne źródło footprintu bloku L0 (ta sama stała używana przez layout engine).
import { L0_STATION_BLOCK } from '../geometry';
import { SldLodProvider } from '../lod/SldLodContext';
import {
  COLOR_BG,
  COLOR_PANEL,
  COLOR_DEVICE_CLOSED_BORDER,
  COLOR_DEVICE_OPEN_BORDER,
  COLOR_SELECTION,
  COLOR_TEXT_PRIMARY,
  COLOR_WARN,
} from '../theme/tokens';
import {
  CableRunRenderer,
  type CableRunRendererProps,
  type CableRunSegmentEndpointResult,
  type CableRunSegmentLabel,
  type CableRunSegmentPath,
  type CableRunStationPortGap,
} from '../renderer/CableRunRenderer';
import { CadOverlay } from './CadOverlay';
import type { SldTitleBlockData } from './SldTitleBlock';
import type { SldRevisionEntry } from './SldRevisionTable';
import type { PowerBalanceData } from './SldPowerBalancePanel';
import {
  SldShortCircuitOverlay,
  type SldShortCircuitProjection,
} from './SldShortCircuitOverlay';
import {
  SldProtectionZoneOverlay,
  type SldProtectionZoneProjection,
} from './SldProtectionZoneOverlay';
import { computeLfDerivedMetrics } from './lfDerivedMetrics';
import { computeScProjection, type ScBusMeta } from './scDerivedProjection';
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
import {
  MiniBlockRmuRenderer,
  miniBlockStationPortOffsets,
  type MiniBlockBayDescriptor,
} from '../renderer/MiniBlockRmuRenderer';
import { FIELD_ROLE } from '../domain/apparatusContracts';
import { ResultOverlayLayer } from './ResultOverlayLayer';
import {
  formatMetric,
  useRawResultOverlayStore,
  type RawMetricValue,
  type RawOverlayElement,
  type RawOverlayPayload,
} from '../../../sld-overlay/rawResultOverlayStore';
import type { SldElementKindForMenu } from '../command/SldCommandService';
import type {
  SldBranchPointMarker,
  SldLabelSpec,
  SldReadabilityReport,
  SldRunCorridor,
  SldTerminalBinding,
  SldTopologyRun,
} from './SldTopologyContracts';

export type SldElementContextKind = SldElementKindForMenu;

const SELECTED_NODE_FOCUS_SCALE = 0.75;

interface CenterTarget {
  readonly x: number;
  readonly y: number;
  readonly minScale?: number;
}

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

  /** Lista obiekt?w do renderowania. */
  readonly gpzs: readonly GpzRendererProps[];
  /**
   * Operator-grade canonical GPZ props (Phase R4 rebuild).
   * Gdy podane dla `id` z `gpzs[]`, kanwa renderuje `GpzCanonicalRenderer`
   * (pe?na rozdzielnia SCADA OSD) zamiast legacy `GpzRenderer` (placeholder).
   * Caller (SldWorkspaceContainer) wywo?uje `buildCanonicalGpzProps` z ENM.
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
    /** K30-41: napi?cie ci?gu [kV] - voltage chip + tint stroke fallback. */
    voltageKv?: number | null;
  }>;
  readonly stations: readonly StationOnRunRendererProps[];
  readonly branchPoints?: readonly SldBranchPointMarker[];
  readonly ders: readonly DerRendererProps[];
  readonly connections?: ReadonlyArray<{
    id: string;
    pathPoints: ReadonlyArray<{ x: number; y: number }>;
    transformerLabel?: string | null;
    connectionKind?: 'der_block_transformer' | 'der_nn' | 'generic';
  }>;
  readonly topologyCorridors?: readonly SldRunCorridor[];
  readonly topologyRuns?: readonly SldTopologyRun[];
  readonly terminalBindings?: readonly SldTerminalBinding[];
  readonly labelSpecs?: readonly SldLabelSpec[];
  readonly readabilityReport?: SldReadabilityReport;

  /** Selected element ID (jeden z {gpz/section/run/station/der}). */
  readonly selectedId?: string | null;

  /** Override LOD globalny (je?li undefined -> wnioskuj z scale). */
  readonly lodOverride?: LodLevel;

  /** Stan warstw widoczno?ci. */
  readonly layerVisibility?: Partial<Record<SldLayerId, boolean>>;

  /** Phase 2 polish (operator-grade SLD plan v2): CadOverlay props.
   *  Snap state (mode/grid/port tolerance), ghost previews dla
   *  append/split workflow, korytarze dla CorridorLayout strategy,
   *  zaznaczone routes dla bend handles. Wszystkie opcjonalne - gdy
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
  /** Element, który ma zostać doprowadzony do czytelnego środka roboczej kanwy. */
  readonly centerOnElementId?: string | null;
  /**
   * Right-click handler. Wywo?ywany dla elementu lub t?a kanwy.
   * Container otwiera menu kontekstowe na (clientX, clientY).
   */
  readonly onContextMenu?: (request: SldCanvasContextMenuRequest) => void;
  readonly onViewportTransformChange?: (transform: ViewportTransform) => void;
  /** K30-38: metadata bloku tytu?owego per PN-EN ISO 7200. Brak -> defaults. */
  readonly titleBlockData?: SldTitleBlockData | null;
  /** K30-100: revision history entries dla SldRevisionTable (OSD wniosek). */
  readonly revisionEntries?: readonly SldRevisionEntry[];
  /** K30-101: bilans mocy panel data (LF analiza). */
  readonly powerBalance?: PowerBalanceData | null;
  /** K30-39: poka? legend? palet (voltage / cable variants / apparatus / DER).
   *  Default true. Set false dla cleanu w przypadkach print-only. */
  readonly showLegend?: boolean;
  /** K30-43: poka? skal? rysunku per PN-EN ISO 5455. Default true. */
  readonly showScaleRuler?: boolean;
  /** K30-47: poka? strza?k? N (north arrow) per PN-EN ISO 5456. Default false
   *  (SLD s? topologiczne, geographic orientation rzadko relevant). */
  readonly showNorthArrow?: boolean;
  /** K30-48: projekcja wynik?w zwarciowych per IEC 60909. Brak -> overlay off.
   *  K30-50: gdy null + payload SC available, derived auto-from-payload. */
  readonly shortCircuitProjection?: SldShortCircuitProjection | null;
  /** K30-46: projekcja stref ochrony Z1/Z2/Z3 per IEC 60255-127. */
  readonly protectionZoneProjection?: SldProtectionZoneProjection | null;
  /** P-A POWER-FLOW TOR: active case (state declaration) shown on the canvas.
   *  When supplied, a fixed-position badge declares the operating state the
   *  energization + flow-direction tor is computed for (e.g. "Stan normalny
   *  (radialny, NO otwarte)"). The tor itself is read from the solver companion
   *  threaded through the cableRuns/stations props (one truth). */
  readonly powerFlowCase?: {
    readonly caseRef: string;
    readonly caseLabel: string;
    readonly converged: boolean;
  } | null;
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

const OPERATOR_READABLE_MIN_SCALE = 0.64;
const OPERATOR_LARGE_TOPOLOGY_MIN_SCALE = 0.22;
const VIEWPORT_ZOOM_IN_FACTOR = 1.35;
const VIEWPORT_ZOOM_OUT_FACTOR = 0.75;

function sameViewportTransform(a: ViewportTransform, b: ViewportTransform): boolean {
  return (
    Math.abs(a.scale - b.scale) < 0.001 &&
    Math.abs(a.translateX - b.translateX) < 0.5 &&
    Math.abs(a.translateY - b.translateY) < 0.5
  );
}

// V-01: zawsze CENTRUJ przy wymuszonej skali czytelności (nigdy nie kotwicz do
// lewego-górnego rogu — to było źródłem „schemat w 30% kadru, reszta pusta").
function centeredTransformAtScale(
  scale: number,
  bbox: { minX: number; minY: number; maxX: number; maxY: number },
  viewportSize: { readonly width: number; readonly height: number },
): ViewportTransform {
  const bboxCenterX = (bbox.minX + bbox.maxX) / 2;
  const bboxCenterY = (bbox.minY + bbox.maxY) / 2;
  return {
    scale,
    translateX: viewportSize.width / 2 - bboxCenterX * scale,
    translateY: viewportSize.height / 2 - bboxCenterY * scale,
  };
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
  viewportSize: { readonly width: number; readonly height: number },
): ViewportTransform {
  const smallOperatorTopology =
    args.stationCount <= 8 &&
    args.runCount <= 12 &&
    args.derCount <= 6;
  if (fit.scale < OPERATOR_LARGE_TOPOLOGY_MIN_SCALE) {
    return centeredTransformAtScale(OPERATOR_LARGE_TOPOLOGY_MIN_SCALE, bbox, viewportSize);
  }
  if (!args.hasCanonicalGpz || !smallOperatorTopology || fit.scale >= OPERATOR_READABLE_MIN_SCALE) {
    return fit;
  }
  return centeredTransformAtScale(OPERATOR_READABLE_MIN_SCALE, bbox, viewportSize);
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

function buildVisibleTopologyLabels(
  labelSpecs: readonly SldLabelSpec[],
  readabilityReport: SldReadabilityReport | undefined,
  lod: LodLevel,
  selectedId: string | null | undefined,
): Array<{ spec: SldLabelSpec; placement: NonNullable<SldReadabilityReport['labelPlacements']>[number] }> {
  if (!readabilityReport || labelSpecs.length === 0) return [];
  const specById = new Map(labelSpecs.map((spec) => [spec.id, spec]));
  return readabilityReport.labelPlacements
    .filter((placement) => !placement.hidden)
    .map((placement) => {
      const spec = specById.get(placement.id);
      return spec ? { spec, placement } : null;
    })
    .filter((item): item is { spec: SldLabelSpec; placement: NonNullable<SldReadabilityReport['labelPlacements']>[number] } =>
      item !== null && topologyLabelVisibleAtLod(item.spec, lod, selectedId),
    )
    .sort((a, b) =>
      b.spec.priority - a.spec.priority
      || a.spec.id.localeCompare(b.spec.id),
    );
}

function topologyLabelVisibleAtLod(
  spec: SldLabelSpec,
  lod: LodLevel,
  selectedId: string | null | undefined,
): boolean {
  if (selectedId && (selectedId === spec.ownerRef || selectedId === spec.id)) {
    if (spec.ownerKind === 'station') return false;
    if (spec.ownerKind === 'der') return false;
    if (spec.ownerKind === 'branch_point' && spec.text.trim().toUpperCase() === 'ZKSN') {
      return false;
    }
    return true;
  }
  switch (spec.ownerKind) {
    case 'gpz':
    case 'nop':
      return lod >= 0;
    case 'branch_point':
      // ZKSN jest renderowany jako station-like rozdzielnica SN w BranchPointMarker.
      // Dodatkowa pływająca etykieta "ZKSN" dubluje kod węzła i koliduje z
      // sąsiednimi stacjami w widoku dużej topologii.
      return spec.text.trim().toUpperCase() !== 'ZKSN' && lod === 0;
    case 'station':
      // StationOnRunRenderer/MiniBlockRmuRenderer są właścicielami kodu stacji
      // na kanwie. Globalny label pipeline nadal liczy raport czytelności, ale
      // nie renderuje drugiej etykiety typu "S01 przelotowa" nad kodem "S01".
      return false;
    case 'run':
      return lod >= 1;
    case 'segment':
      // LOD 2: etykiety odcinków i długości. LOD 3/4 przejmują pola,
      // aparatura, nastawy i elementy stacji, więc globalny opis odcinka
      // nie może nachodzić na oznaczenia WE/WY/TR/Q/T.
      // Gdy zaznaczony jest inny układ, karta techniczna i renderer tego
      // układu mają pierwszeństwo; etykieta segmentu zostaje tylko dla
      // aktywnego odcinka (obsłużone w gałęzi selectedId powyżej).
      if (selectedId) return false;
      return lod === 2;
    case 'der':
      // DerRenderer odpowiada za nazwę, moc i oznaczenie układu PV/BESS/FW.
      // Druga etykieta z globalnego pipeline nakładała się na opis
      // transformatora blokowego i tworzyła sprzeczny obraz toru przyłączenia.
      return false;
    case 'device':
    case 'result':
      return lod >= 3;
  }
}

function selectedSegmentRefsForRun(
  run: CableRunRendererProps,
  selectedId: string | null | undefined,
): readonly string[] {
  if (!selectedId) return [];
  const segmentRefs = new Set<string>();
  for (const segmentRef of run.segmentRefs ?? []) {
    segmentRefs.add(segmentRef);
  }
  for (const segmentPath of run.segmentPaths ?? []) {
    segmentRefs.add(segmentPath.segmentRef);
  }
  return segmentRefs.has(selectedId) ? [selectedId] : [];
}

const SEGMENT_RESULT_METRIC_CODES_SC = [
  'IK_3F_A',
  'IK_1F_A',
  'IK_2F_A',
  'IK_2FG_A',
  'IKSS_A',
  'IK_A',
  'IP_A',
] as const;

const SEGMENT_RESULT_METRIC_CODES_LF = [
  'I_A',
  'P_MW',
  'Q_MVAR',
  'U_kV',
  'U_pu',
  'P_kW',
  'Q_kvar',
] as const;

function isShortCircuitPayload(payload: RawOverlayPayload): boolean {
  const type = payload.analysis_type.toLowerCase();
  return type.includes('short_circuit') || type.includes('sc_');
}

function overlayElementByRef(
  payload: RawOverlayPayload | null,
  refId: string,
): RawOverlayElement | null {
  if (!payload) return null;
  const direct = payload.elements[refId];
  if (direct) return direct;
  const withoutSuffix = refId.replace(/\/segment_[A-Z]$/, '/segment');
  if (withoutSuffix !== refId && payload.elements[withoutSuffix]) {
    return payload.elements[withoutSuffix];
  }
  const withLegacySuffix = refId.endsWith('/segment')
    ? `${refId}_L`
    : refId;
  if (withLegacySuffix !== refId && payload.elements[withLegacySuffix]) {
    return payload.elements[withLegacySuffix];
  }
  return null;
}

function firstMetricByCodes(
  element: RawOverlayElement | null,
  codes: readonly string[],
): RawMetricValue | null {
  if (!element) return null;
  for (const code of codes) {
    const metric = element.metrics?.[code];
    if (metric && metric.value !== null && metric.value !== undefined) return metric;
  }
  return null;
}

function formatSegmentEndpointResult(
  payload: RawOverlayPayload | null,
  segmentRef: string,
  endpointElement: RawOverlayElement | null = null,
): { text: string; severity: string | null } {
  const element = endpointElement ?? overlayElementByRef(payload, segmentRef);
  if (!payload || !element) return { text: 'brak wyniku', severity: null };
  const metric = firstMetricByCodes(
    element,
    isShortCircuitPayload(payload)
      ? SEGMENT_RESULT_METRIC_CODES_SC
      : SEGMENT_RESULT_METRIC_CODES_LF,
  );
  if (!metric) return { text: 'brak wyniku', severity: element.severity ?? null };
  const prefix = metric.code
    .replace('IK_3F_A', 'Ik"')
    .replace('IK_1F_A', 'Ik1"')
    .replace('IK_2F_A', 'Ik2"')
    .replace('IK_2FG_A', 'Ik2Z"')
    .replace('IKSS_A', 'Ik"')
    .replace('IK_A', 'Ik')
    .replace('IP_A', 'ip')
    .replace('I_A', 'I')
    .replace('P_MW', 'P')
    .replace('Q_MVAR', 'Q')
    .replace('U_kV', 'U')
    .replace('U_pu', 'U')
    .replace('P_kW', 'P')
    .replace('Q_kvar', 'Q');
  return {
    text: `${prefix} ${formatMetric(metric)}`,
    severity: element.severity ?? null,
  };
}

function buildSegmentEndpointResultsForRun(
  run: CableRunRendererProps,
  payload: RawOverlayPayload | null,
  stations: readonly StationOnRunRendererProps[],
  branchPoints: readonly SldBranchPointMarker[],
  gpzs: readonly GpzRendererProps[],
  canonicalGpzs: readonly GpzCanonicalRendererProps[],
): readonly CableRunSegmentEndpointResult[] {
  if (!payload) return [];
  const segmentPaths = run.segmentPaths && run.segmentPaths.length > 0
    ? run.segmentPaths
    : (run.segmentRefs ?? []).map((segmentRef) => ({
      segmentRef,
      pathPoints: run.pathPoints,
    }));
  return segmentPaths.flatMap((segmentPath) => {
    const endPoint = segmentPath.pathPoints[segmentPath.pathPoints.length - 1];
    if (!endPoint) return [];
    const endpointElement = overlayElementForSegmentEndpoint(
      payload,
      endPoint,
      stations,
      branchPoints,
      gpzs,
      canonicalGpzs,
    );
    const result = formatSegmentEndpointResult(payload, segmentPath.segmentRef, endpointElement);
    return [{
      segmentRef: segmentPath.segmentRef,
      x: endPoint.x,
      y: endPoint.y,
      text: result.text,
      severity: result.severity,
    }];
  });
}

function overlayElementForSegmentEndpoint(
  payload: RawOverlayPayload,
  point: { x: number; y: number },
  stations: readonly StationOnRunRendererProps[],
  branchPoints: readonly SldBranchPointMarker[],
  gpzs: readonly GpzRendererProps[],
  canonicalGpzs: readonly GpzCanonicalRendererProps[],
): RawOverlayElement | null {
  const station = stations
    .map((candidate) => ({
      station: candidate,
      dx: Math.abs(candidate.x - point.x),
      dy: Math.abs((candidate.y - STATION_RUN_TRUNK_OFFSET_Y) - point.y),
    }))
    .filter((candidate) => candidate.dx <= 240 && candidate.dy <= 90)
    .sort((left, right) => (left.dx + left.dy) - (right.dx + right.dy))[0]?.station;
  if (station) {
    const base = station.id.endsWith('/station')
      ? station.id.slice(0, -'/station'.length)
      : station.id;
    const element = overlayElementByAnyRef(payload, [
      `${base}/sn_bus`,
      `${base}/bus`,
      station.id,
    ]);
    if (element) return element;
  }

  const branchPoint = branchPoints
    .map((candidate) => ({
      branchPoint: candidate,
      dx: Math.abs(candidate.x - point.x),
      dy: Math.abs(candidate.y - point.y),
    }))
    .filter((candidate) => candidate.dx <= 220 && candidate.dy <= 120)
    .sort((left, right) => (left.dx + left.dy) - (right.dx + right.dy))[0]?.branchPoint;
  if (branchPoint) {
    const base = branchPoint.id.replace(/\/(zksn|branch_pole|branch_point|pole)$/, '');
    const element = overlayElementByAnyRef(payload, [
      `${base}/bus`,
      `${base}/branch_bus_1`,
      branchPoint.id,
    ]);
    if (element) return element;
  }

  const gpz = [...gpzs, ...canonicalGpzs]
    .map((candidate) => ({
      gpz: candidate,
      dx: Math.abs(candidate.x - point.x),
      dy: Math.abs(candidate.y - point.y),
    }))
    .filter((candidate) => candidate.dx <= 260 && candidate.dy <= 260)
    .sort((left, right) => (left.dx + left.dy) - (right.dx + right.dy))[0]?.gpz;
  if (gpz) {
    return overlayElementByAnyRef(payload, [
      `${gpz.id}/source/main`,
      `${gpz.id}/bus`,
      gpz.id,
    ]);
  }

  return null;
}

function overlayElementByAnyRef(
  payload: RawOverlayPayload,
  refs: readonly string[],
): RawOverlayElement | null {
  for (const ref of refs) {
    const element = overlayElementByRef(payload, ref);
    if (element) return element;
  }
  return null;
}

function topologyLabelFill(spec: SldLabelSpec): string {
  switch (spec.ownerKind) {
    case 'gpz':
    case 'nop':
      return '#13C45A';
    case 'branch_point':
      return '#FFD166';
    case 'station':
      return '#DDF7FF';
    case 'run':
    case 'segment':
      return '#CFEFFF';
    case 'der':
      return '#7DFFD5';
    case 'device':
    case 'result':
      return '#FFD166';
  }
}

function topologyLabelStroke(spec: SldLabelSpec): string {
  switch (spec.ownerKind) {
    case 'gpz':
    case 'nop':
      return '#13C45A';
    case 'branch_point':
      return '#FFD166';
    case 'station':
      return '#63B3ED';
    case 'der':
      return '#18D26B';
    case 'result':
      return '#FFD166';
    default:
      return '#2C7DA0';
  }
}

function topologyLabelFontSize(spec: SldLabelSpec): number {
  if (
    spec.ownerKind === 'gpz'
    || spec.ownerKind === 'nop'
    || spec.ownerKind === 'station'
    || spec.ownerKind === 'branch_point'
  ) return 11;
  return 10;
}

function topologyLabelFontWeight(spec: SldLabelSpec): number {
  if (
    spec.ownerKind === 'gpz'
    || spec.ownerKind === 'nop'
    || spec.ownerKind === 'station'
    || spec.ownerKind === 'branch_point'
  ) return 900;
  return 700;
}

function buildViewportContentSignature(
  gpzs: readonly GpzRendererProps[],
  canonicalGpzs: readonly GpzCanonicalRendererProps[],
  sections: readonly SectionRendererProps[],
  cableRuns: readonly CableRunRendererProps[],
  stations: readonly StationOnRunRendererProps[],
  branchPoints: readonly SldBranchPointMarker[],
  ders: readonly DerRendererProps[],
): string {
  return [
    gpzs.map((item) => `${item.id}:${item.x}:${item.y}`).join('|'),
    canonicalGpzs.map((item) => `${item.id}:${item.x}:${item.y}:${item.sections.length}`).join('|'),
    sections.map((item) => `${item.id}:${item.x}:${item.y}`).join('|'),
    cableRuns.map((item) => `${item.id}:${item.pathPoints.map((point) => `${point.x},${point.y}`).join(';')}`).join('|'),
    stations.map((item) => `${item.id}:${item.x}:${item.y}`).join('|'),
    branchPoints.map((item) => `${item.id}:${item.x}:${item.y}:${item.branchPointType}`).join('|'),
    ders.map((item) => `${item.id}:${item.x}:${item.y}`).join('|'),
  ].join('::');
}

function centerPointForRun(run: CableRunRendererProps): CenterTarget | null {
  if (run.pathPoints.length === 0) return null;
  const bbox = computeBoundingBox(run.pathPoints);
  return {
    x: (bbox.minX + bbox.maxX) / 2,
    y: (bbox.minY + bbox.maxY) / 2,
  };
}

function centerTargetForElement(
  elementId: string | null | undefined,
  props: Pick<
    SldCanvasV2Props,
    'gpzs' | 'canonicalGpzs' | 'sections' | 'cableRuns' | 'stations' | 'branchPoints' | 'ders'
  >,
): CenterTarget | null {
  if (!elementId) return null;
  const gpz = props.gpzs.find((item) => item.id === elementId);
  if (gpz) return { x: gpz.x, y: gpz.y };
  const canonicalGpz = props.canonicalGpzs?.find((item) => item.id === elementId);
  if (canonicalGpz) return { x: canonicalGpz.x, y: canonicalGpz.y };
  const section = props.sections.find((item) => item.id === elementId);
  if (section) return { x: section.x, y: section.y };
  const station = props.stations.find((item) => item.id === elementId);
  if (station) return { x: station.x, y: station.y, minScale: SELECTED_NODE_FOCUS_SCALE };
  const branchPoint = props.branchPoints?.find((item) => item.id === elementId);
  if (branchPoint) return { x: branchPoint.x, y: branchPoint.y, minScale: SELECTED_NODE_FOCUS_SCALE };
  const der = props.ders.find((item) => item.id === elementId);
  if (der) return { x: der.x, y: der.y, minScale: SELECTED_NODE_FOCUS_SCALE };
  const run = props.cableRuns.find((item) => item.id === elementId);
  return run ? centerPointForRun(run) : null;
}

export function SldCanvasV2(props: SldCanvasV2Props): JSX.Element {
  const {
    width, height, gpzs, canonicalGpzs, sections, cableRuns, stations, branchPoints = [], ders, connections = [],
    topologyCorridors = [], topologyRuns = [], terminalBindings = [], labelSpecs = [], readabilityReport,
    selectedId, centerOnElementId, lodOverride, layerVisibility,
    shortCircuitProjection, protectionZoneProjection, powerFlowCase,
    onSelectElement, onDoubleClickStation, onDoubleClickDer, onContextMenu, onViewportTransformChange,
  } = props;

  // K30-8: subskrybuj raw overlay payload by compute per-station alarm severity.
  const overlayPayload = useRawResultOverlayStore((state) => state.payload);

  // K30-49: derive LF metrics - voltage deviation per station + cable loading.
  // Wynik feedowany do StationOnRunRenderer (voltageDeviationPct) i
  // CableRunRenderer (loadingPct) jako data-driven projekcje K30-44/K30-45.
  const lfDerived = computeLfDerivedMetrics(overlayPayload, props.stations, props.cableRuns);

  // K30-76: PathHighlighter - gdy selectedId jest stacj?, znajd? run zawieraj?cy
  // t? stacj? i highlight ca?ego toru mocy (cable run = path z GPZ).
  // Zbioru runIds zostaj? renderowane jak selected (visual highlight).
  const pathHighlightRunIds = useMemo(() => {
    const ids = new Set<string>();
    if (!selectedId) return ids;
    if (selectedId.startsWith('seg/')) return ids;
    // Selected element mo?e by? stationId lub cableRunId
    for (const run of props.cableRuns) {
      const containsStation = run.segmentRefs?.some((segRef) => {
        // Segment ref pattern: seg/{hash}/branch_segment lub similar
        // Heurystyka: check whether segRef path contains selectedId fragment
        return segRef.includes(selectedId.split('/')[1] ?? '___no_match___');
      });
      if (containsStation) ids.add(run.id);
    }
    // Also if selectedId is station, find runs whose segmentRefs map to its bus
    const selectedStation = props.stations.find((s) => s.id === selectedId);
    if (selectedStation) {
      const stationHash = selectedStation.id.split('/')[1];
      if (stationHash) {
        for (const run of props.cableRuns) {
          if (run.segmentRefs?.some((r) => r.includes(stationHash))) {
            ids.add(run.id);
          }
        }
      }
    }
    return ids;
  }, [selectedId, props.cableRuns, props.stations]);

  // K30-50: derive SC projection - je?li explicit shortCircuitProjection nie
  // podano, auto-build z payload SC results. Bus pozycje pochodz? z station
  // layout (SN bus = stn/{hash}/sn_bus, posa?enie = station.x/y).
  const derivedScProjection = (() => {
    if (shortCircuitProjection !== undefined && shortCircuitProjection !== null) {
      return shortCircuitProjection;
    }
    const busMetas: ScBusMeta[] = props.stations.map((st) => {
      const snBusId = st.id.endsWith('/station')
        ? `${st.id.slice(0, -'/station'.length)}/sn_bus`
        : `${st.id}/sn_bus`;
      return { id: snBusId, label: st.stationCode ?? st.name, x: st.x, y: st.y };
    });
    return computeScProjection(overlayPayload, busMetas);
  })();

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
  const viewportContentSignature = useMemo(
    () => buildViewportContentSignature(gpzs, canonicalGpzs ?? [], sections, cableRuns, stations, branchPoints, ders),
    [gpzs, canonicalGpzs, sections, cableRuns, stations, branchPoints, ders],
  );
  /* LOD kanwy ma by? natychmiastowy i monotoniczny dla klikni?? zoom.
   * Histereza zostaje w LodPolicy jako opcjonalny tryb testowy, ale g??wny
   * widok projektanta nie mo?e op??nia? pojawiania si? szczeg???w. */
  const lodControllerRef = useRef<LodController | null>(null);
  if (lodControllerRef.current === null) {
    lodControllerRef.current = createLodController({
      initialScale: transform.scale,
      hysteresisMargin: 0,
      debounceMs: 0,
    });
  }

  // Auto-fit przy pierwszym renderze (je?li mamy obiekty)
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
    for (const bp of branchPoints) allPoints.push({ x: bp.x, y: bp.y });
    for (const d of ders) allPoints.push({ x: d.x, y: d.y });
    if (allPoints.length === 0) return;
    const bbox = computeBoundingBox(allPoints);
    // V-01: symetryczny margines wokół treści (bbox zawiera już footprint GPZ),
    // żeby fitToView wypełnił kadr i wycentrował, bez phantom-pustki po prawej.
    const expanded = {
      minX: bbox.minX - 120,
      minY: bbox.minY - 120,
      maxX: bbox.maxX + 120,
      maxY: bbox.maxY + 120,
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
      { width, height },
    );
    setTransform((current) => sameViewportTransform(current, nextTransform) ? current : nextTransform);
  }, [viewportContentSignature, width, height]);

  useEffect(() => {
    const target = centerTargetForElement(centerOnElementId, {
      gpzs,
      canonicalGpzs,
      sections,
      cableRuns,
      stations,
      branchPoints,
      ders,
    });
    if (!target) return;
    setTransform((current) => {
      const nextScale = Math.max(current.scale, target.minScale ?? current.scale);
      const nextTransform = centerOnPoint(target, { width, height }, nextScale);
      return sameViewportTransform(current, nextTransform) ? current : nextTransform;
    });
  }, [
    branchPoints,
    cableRuns,
    canonicalGpzs,
    centerOnElementId,
    ders,
    gpzs,
    height,
    sections,
    stations,
    viewportContentSignature,
    width,
  ]);

  const computeFitTransformForCurrentNetwork = useCallback((): ViewportTransform | null => {
    const allPoints: { x: number; y: number }[] = [];
    for (const g of gpzs) allPoints.push({ x: g.x, y: g.y });
    for (const gpz of canonicalGpzs ?? []) {
      const footprint = estimateCanonicalGpzFootprint(gpz);
      allPoints.push({ x: gpz.x, y: gpz.y });
      allPoints.push({ x: gpz.x + footprint.width, y: gpz.y + footprint.height });
    }
    for (const s of sections) allPoints.push({ x: s.x, y: s.y });
    for (const st of stations) allPoints.push({ x: st.x, y: st.y });
    for (const bp of branchPoints) allPoints.push({ x: bp.x, y: bp.y });
    for (const d of ders) allPoints.push({ x: d.x, y: d.y });
    if (allPoints.length === 0) return null;
    const bbox = computeBoundingBox(allPoints);
    const expanded = {
      minX: bbox.minX - 120,
      minY: bbox.minY - 120,
      maxX: bbox.maxX + 120,
      maxY: bbox.maxY + 120,
    };
    return applyOperatorReadableInitialTransform(
      fitToView(expanded, { width, height }),
      expanded,
      {
        hasCanonicalGpz: (canonicalGpzs?.length ?? 0) > 0,
        stationCount: stations.length,
        runCount: cableRuns.length,
        derCount: ders.length,
      },
      { width, height },
    );
  }, [gpzs, canonicalGpzs, sections, stations, branchPoints, ders, width, height, cableRuns.length]);

  const zoomViewportAtCenter = useCallback((zoomFactor: number) => {
    setTransform((current) => zoomToCursor(current, { x: width / 2, y: height / 2 }, zoomFactor));
  }, [width, height]);

  const fitViewportToNetwork = useCallback(() => {
    const nextTransform = computeFitTransformForCurrentNetwork();
    if (!nextTransform) return;
    setTransform((current) => sameViewportTransform(current, nextTransform) ? current : nextTransform);
  }, [computeFitTransformForCurrentNetwork]);

  /* LOD obliczany przez LodController bez op??nienia w g??wnej kanwie. */
  const lod: LodLevel = lodOverride !== undefined
    ? lodOverride
    : lodControllerRef.current.update(transform.scale);
  /* Fallback dla test?w bez LodControllera (powinien by? zawsze inicjalizowany). */
  void inferLodFromScale; // referencja zachowana dla back-compat innych caller?w

  /* Widoczny kadr (world-space) do wirtualizacji: na L0 dla dużej sieci renderujemy
   * tylko bloki przecinające ekran (§7B.7). Margines zapobiega znikaniu przygranicznych. */
  const worldViewport: WorldViewport = worldViewportFromTransform(
    { scale: transform.scale, translateX: transform.translateX, translateY: transform.translateY },
    { width, height },
    96,
  );
  /* Wirtualizacja włączana tylko dla dużych sieci (próg) — małe schematy renderują
   * się w całości (zero ryzyka regresji dla istniejących widoków). */
  const VIRTUALIZATION_STATION_THRESHOLD = 24;
  const virtualizationActive = stations.length > VIRTUALIZATION_STATION_THRESHOLD;
  const visibleStations = virtualizationActive
    ? virtualizePositioned(stations, worldViewport, 200)
    : stations;
  const visibleCableRuns = virtualizationActive
    ? cableRuns.filter((run) => cableRunIntersectsViewport(run, worldViewport))
    : cableRuns;

  /* Poziom geometrii (L0/L1/L2). Bazowy z JEDNEJ prawdy numerycznego LOD — kontrakt §7.
   * Świadomy gęstości (M-08): gdy w kadrze jest dużo stacji (auto-fit dużej sieci
   * często ląduje na skali L1/L2), wymuś L0 = czytelne BLOKI zamiast pełnej aparatury
   * 50+ stacji. NIE nadpisujemy jawnego override (użytkownik/harness wybrał poziom). */
  const baseGeomLevel: GeomLodLevel = numericLodToLevel(lod);
  const geomLevel: GeomLodLevel =
    lodOverride !== undefined
      ? baseGeomLevel
      : densityAwareLevel(baseGeomLevel, visibleStations.length);

  /* Efektywny LOD numeryczny spójny z poziomem geometrii: gdy gęstość zepchnęła
   * widok do L0 (przegląd), traktuj go jak LOD 0 dla etykiet i ciągów kablowych —
   * struktura L0 nie pokazuje etykiet odcinków/wyników (kontrakt §7), więc bloki
   * stacji nie toną w opisach kabli. Poza L0: bez zmian (efektywny == surowy). */
  const effectiveLod: LodLevel = geomLevel === 'L0' ? (0 as LodLevel) : lod;

  const layers = { ...DEFAULT_LAYER_VISIBILITY, ...(layerVisibility ?? {}) };
  const topologyLabels = buildVisibleTopologyLabels(labelSpecs, readabilityReport, effectiveLod, selectedId);
  const usesGlobalLabelPipeline =
    labelSpecs.length > 0 || Boolean(readabilityReport?.labelPlacements?.length);

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
      data-topology-runs={topologyRuns.length}
      data-topology-corridors={topologyCorridors.length}
      data-terminal-bindings={terminalBindings.length}
      data-label-specs={labelSpecs.length}
      data-readability-score={String(readabilityReport?.score ?? 100)}
      data-topology-continuity={readabilityReport?.topologyContinuity ?? 'continuous'}
      data-orphan-stations={String(readabilityReport?.orphanStationRefs.length ?? 0)}
      data-missing-terminals={String(readabilityReport?.missingTerminalRefs.length ?? 0)}
      data-critical-label-collisions={String(readabilityReport?.criticalCollisions ?? 0)}
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
      <g data-testid="sld-canvas-root">
      {/* T?o */}
      <rect width={width} height={height} fill={COLOR_BG} />
      {readabilityReport && (
        <metadata
          data-testid="sld-readability-report"
          aria-hidden="true"
          data-score={String(readabilityReport.score)}
          data-topology-continuity={readabilityReport.topologyContinuity}
          data-orphan-stations={String(readabilityReport.orphanStationRefs.length)}
          data-orphan-segments={String(readabilityReport.orphanSegmentRefs.length)}
          data-missing-terminals={String(readabilityReport.missingTerminalRefs.length)}
          data-hidden-labels={String(readabilityReport.hiddenLabels)}
          data-critical-label-collisions={String(readabilityReport.criticalCollisions)}
        />
      )}

      {/* World transform */}
      <g transform={`translate(${transform.translateX}, ${transform.translateY}) scale(${transform.scale})`}>
        {/* Phase 2 polish: CadOverlay (grid + magnesy + bend handles + ghosts +
            korytarze). Renderowany pod content ?eby nie zas?ania? obiekt?w
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

        {/* Warstwa po??cze? i odcink?w SN. Stabilny znacznik jest u?ywany
            przez E2E oraz diagnostyk? widoku, nie zmienia semantyki SLD. */}
        <g data-testid="sld-connections-layer">
          {layers.topology && connections
            .filter((c) => connectionVisibleAtLod(c, lod))
            .map((c) => (
            <ConnectionRenderer
              key={c.id}
              {...c}
              selected={selectedId === c.id}
              viewportScale={transform.scale}
              onClick={
                onSelectElement
                  ? (id, kind) => onSelectElement(id, kind)
                  : undefined
              }
              onDoubleClick={
                onSelectElement
                  ? (id, kind) => onSelectElement(id, kind)
                  : undefined
              }
            />
          ))}
        </g>

        {/* Sections (szyny SN GPZ). LOD 0 pokazuje tylko blok GPZ i topologie
            sieci, bez etykiet sekcji nachodzacych na opis zrodla. */}
        {lod >= 1 && sections.map((s) => (
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
           * dostarczy? canonical props dla tego id. Fallback do legacy
           * `GpzRenderer` gdy brak (np. snapshot bez gpz_sections + bez bays). */
          const canonical = canonicalGpzs?.find((c) => c.id === g.id);
          if (canonical) {
            const showCanonicalGpzDetail = lod >= 1;
            const overviewName = compactGpzOverviewName(canonical.name || g.name || 'GPZ 15 kV');
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
                {showCanonicalGpzDetail && (
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
                )}
                {/* V-04: znacznik poglądowy TYLKO przy braku detalu (lod < 1).
                   Przy lod === 1 detal kanoniczny już pokazuje nazwę GPZ —
                   nakładanie obu dawało zdublowane „GPZ 15 kV" (druga prawda). */}
                {lod < 1 && (
                  <g
                    data-testid={`sld-v2-gpz-overview-label-${g.id}`}
                    data-overview-label-scale={overviewTopologyLabelScale(transform.scale).toFixed(2)}
                    data-overview-name={overviewName}
                    transform={`translate(${canonical.x + 170}, ${canonical.y + 96}) scale(${overviewTopologyLabelScale(transform.scale)})`}
                    pointerEvents="none"
                  >
                    <rect
                      x={-58}
                      y={-18}
                      width={116}
                      height={36}
                      rx={3}
                      ry={3}
                      fill="#07111C"
                      stroke="#13C45A"
                      strokeWidth={0.5}
                      opacity={0.94}
                    />
                    <text
                      x={0}
                      y={-3}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#13C45A"
                      fontFamily="sans-serif"
                      fontSize={12}
                      fontWeight={900}
                      letterSpacing={0}
                    >
                      {overviewName}
                    </text>
                    <text
                      x={0}
                      y={11}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#DDF7FF"
                      fontFamily="sans-serif"
                      fontSize={8}
                      fontWeight={700}
                      letterSpacing={0}
                    >
                      Źródło zasilania
                    </text>
                  </g>
                )}
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

        {/* Stacje na ci?gu */}
        {layers.equipment && (
          <g data-testid="sld-cable-runs-layer">
            {visibleCableRuns.map((run) => (
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
                  label={usesGlobalLabelPipeline ? undefined : run.label}
                  segmentLabels={usesGlobalLabelPipeline ? [] : run.segmentLabels}
                  lod={effectiveLod}
                  viewportScale={transform.scale}
                  stationPortGaps={buildConnectionNodePortGapsForRun(run, stations, branchPoints, effectiveLod)}
                  selected={selectedId === run.id || pathHighlightRunIds.has(run.id)}
                  selectedSegmentRefs={selectedSegmentRefsForRun(run, selectedId)}
                  loadingPct={lfDerived.cableLoadingPctByRunId.get(run.id) ?? null}
                  segmentEndpointResults={buildSegmentEndpointResultsForRun(
                    run,
                    overlayPayload,
                    stations,
                    branchPoints,
                    gpzs,
                    canonicalGpzs ?? [],
                  )}
                  onClick={onSelectElement ? (id) => onSelectElement(
                    id,
                    run.segmentRefs?.includes(id)
                      ? run.segmentKind === 'cable_sn' ? 'cable_segment_sn' : 'overhead_line_sn'
                      : 'cable_run',
                  ) : undefined}
                />
              </g>
            ))}
          </g>
        )}

        <g data-testid="sld-v2-stations-layer">
          {visibleStations.map((st) => {
            const stationLod = st.lod ?? lod;
            const stationUsesMiniBlock = stationUsesMiniBlockRenderer(st, stationLod);
            const stationSelected = selectedId === st.id;
            /* L0 (przegląd): renderuj CZYTELNY BLOK (nazwa + status), nie pełną
             * aparaturę — strukturalny fix gęstości ≥50 stacji (§7, M-08).
             * Zaznaczona stacja zawsze pokazuje detal (override poziomu, kontrakt §7). */
            const renderAsOverviewBlock = geomLevel === 'L0' && !stationSelected;
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
                {renderAsOverviewBlock ? (
                  <StationOverviewBlock station={st} selected={stationSelected} />
                ) : (
                <StationOnRunRenderer
                  {...st}
                  alarmSeverity={st.alarmSeverity ?? computeStationAlarmSeverity(st, overlayPayload)}
                  voltageDeviationPct={
                    st.voltageDeviationPct
                      ?? lfDerived.voltageDeviationPctByStationId.get(st.id)
                      ?? null
                  }
                  lod={stationLod}
                  viewportScale={transform.scale}
                  selected={stationSelected}
                  onClick={
                    onSelectElement
                      ? (id) => {
                          const selection = resolveStationRendererSelection(id, st);
                          onSelectElement(selection.id, selection.kind);
                        }
                      : undefined
                  }
                  onDoubleClick={onDoubleClickStation}
                />
                )}
                {!renderAsOverviewBlock && !stationUsesMiniBlock && st.transformerRefs?.map((transformerRef, index) => (
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
                    <title>{`Transformator SN/nN ${index + 1}`}</title>
                  </g>
                ))}
              </g>
            );
          })}
        </g>

        {layers.equipment && (
          <g data-testid="sld-v2-branch-points-layer">
            {branchPoints.map((branchPoint) => (
              <BranchPointMarker
                key={branchPoint.id}
                branchPoint={branchPoint}
                lod={lod}
                selected={selectedId === branchPoint.id}
                viewportScale={transform.scale}
                onClick={
                  onSelectElement
                    ? (id, kind) => onSelectElement(id, kind)
                    : undefined
                }
                onContextMenu={
                  onContextMenu
                    ? buildElementContextMenuHandler(
                        branchPoint.branchPointType === 'zksn' ? 'zksn' : 'branch_pole',
                        branchPoint.id,
                      )
                    : undefined
                }
              />
            ))}
          </g>
        )}

        {/* K30-3 NO-GO #9: result overlay metrics z LOAD_FLOW/SC_3F payload */}
        <ResultOverlayLayer stations={stations} cableRuns={cableRuns} />

        {/* K30-11: aggregate alarm summary panel - count of station severities */}
        {/* Tabele dokumentacyjne (metryka rysunku, tabela rewizji, bilans mocy)
         *  nie sa renderowane na interaktywnej kanwie SLD. Zostaja w dedykowanych
         *  komponentach raportowych/eksportowych, aby nie zaslaniac topologii SN. */}

        {/* Legenda i panele statusowe nie sa renderowane na roboczej kanwie SLD,
         *  bo przy duzych modelach zaslaniaja topologie i etykiety odcinkow. */}

        {/* Elementy dokumentacyjne rysunku (skala, strzalka polnocy)
         *  sa pomijane w roboczej kanwie SLD, aby nie przykrywac topologii. */}

        {/* K30-48 + K30-50: short-circuit results projection per IEC 60909.
            Priority: explicit prop > derived z SC payload. */}
        <SldShortCircuitOverlay projection={derivedScProjection} />

        {/* K30-46: protection zones Z1/Z2/Z3 per IEC 60255-127. */}
        <SldProtectionZoneOverlay projection={protectionZoneProjection ?? null} />

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
        {layers.der && ders.map((d, index) => {
          const derLod = derLodForCanvas(lod, selectedId === d.id);
          if (derLod === null) return null;
          const menuKind: SldElementContextKind =
            d.kind === 'PV' ? 'der_pv' : d.kind === 'BESS' ? 'der_bess' : 'der_fw';
          return (
            <g
              key={`${d.id}:${index}`}
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
                lod={derLod}
                viewportScale={transform.scale}
                selected={selectedId === d.id}
                onClick={onSelectElement ? (id) => onSelectElement(id, 'der') : undefined}
                onDoubleClick={onDoubleClickDer}
              />
            </g>
          );
        })}
        <g data-testid="sld-v2-topology-label-layer" pointerEvents="none">
          {topologyLabels.map(({ spec, placement }) => (
            <g
              key={spec.id}
              data-testid={`sld-v2-topology-label-${spec.id}`}
              data-owner-kind={spec.ownerKind}
              data-owner-ref={spec.ownerRef}
              data-label-priority={spec.priority}
              transform={`translate(${placement.bbox.x}, ${placement.bbox.y})`}
            >
              <rect
                x={0}
                y={0}
                width={placement.bbox.width}
                height={placement.bbox.height}
                rx={3}
                ry={3}
                fill="#050A12"
                stroke={topologyLabelStroke(spec)}
                strokeWidth={0.8}
                fillOpacity={0.86}
                strokeOpacity={0.68}
              />
              <text
                x={placement.bbox.width / 2}
                y={placement.bbox.height / 2 + 0.5}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={topologyLabelFill(spec)}
                stroke="#050810"
                strokeWidth={2}
                paintOrder="stroke"
                fontFamily="sans-serif"
                fontSize={topologyLabelFontSize(spec)}
                fontWeight={topologyLabelFontWeight(spec)}
                letterSpacing={0}
              >
                {spec.text}
              </text>
            </g>
          ))}
        </g>
      </g>

      {/* P-A POWER-FLOW TOR: active-case state declaration. Screen-fixed badge so
          the operator always sees which state (case_ref) the energization +
          flow-direction tor is computed for. The tor data itself is read from the
          solver companion (one truth); this only DECLARES the case. */}
      {powerFlowCase && (
        <g
          data-testid="sld-v2-powerflow-case-badge"
          data-case-ref={powerFlowCase.caseRef}
          data-converged={powerFlowCase.converged ? 'true' : 'false'}
          transform="translate(12, 16)"
        >
          <rect x={0} y={0} width={Math.min(420, 150 + powerFlowCase.caseLabel.length * 7)} height={26} rx={3}
            fill={COLOR_PANEL} fillOpacity={0.92} stroke="#13C45A" strokeWidth={1} />
          <circle cx={14} cy={13} r={4} fill={powerFlowCase.converged ? '#13C45A' : '#FF333D'} />
          <text x={26} y={17} fill="#DDF7FF" fontSize={12} fontFamily="sans-serif" fontWeight={700}>
            {`Stan: ${powerFlowCase.caseLabel}`}
          </text>
        </g>
      )}
      {/* Wska?nik szczeg??owo?ci widoku dla projektanta. */}
      <g transform={`translate(8, ${height - 24})`}>
        <rect x={-4} y={-12} width={168} height={20} fill={COLOR_PANEL} fillOpacity={0.85} rx={2} />
        <text fill="#B9C0C7" fontSize={11} fontFamily="monospace" y={2}>
          {sldDetailLabel(lod)}
        </text>
      </g>
      <g
        data-testid="sld-v2-viewport-controls"
        transform={`translate(${Math.max(8, width - 110)}, 8)`}
      >
        <SldViewportControlButton
          x={0}
          label="+"
          title="Przybliż widok"
          onActivate={() => zoomViewportAtCenter(VIEWPORT_ZOOM_IN_FACTOR)}
          testId="sld-v2-zoom-in"
        />
        <SldViewportControlButton
          x={34}
          label="-"
          title="Oddal widok"
          onActivate={() => zoomViewportAtCenter(VIEWPORT_ZOOM_OUT_FACTOR)}
          testId="sld-v2-zoom-out"
        />
        <SldViewportControlButton
          x={68}
          label="[]"
          title="Dopasuj widok sieci"
          onActivate={fitViewportToNetwork}
          testId="sld-v2-fit-view"
        />
      </g>
      </g>
    </svg>
    </SldLodProvider>
  );
}

function SldViewportControlButton(props: {
  readonly x: number;
  readonly label: string;
  readonly title: string;
  readonly testId: string;
  readonly onActivate: () => void;
}): JSX.Element {
  const activate = (event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    props.onActivate();
  };
  return (
    <foreignObject x={props.x} y={0} width={28} height={28}>
      <button
        type="button"
        data-testid={props.testId}
        aria-label={props.title}
        title={props.title}
        onClick={activate}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') activate(event);
        }}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        style={{
          width: '28px',
          height: '28px',
          border: '1px solid #63B3ED',
          borderRadius: '3px',
          background: '#07111C',
          color: '#DDF7FF',
          cursor: 'pointer',
          fontFamily: 'monospace',
          fontSize: '12px',
          fontWeight: 900,
          lineHeight: '26px',
          padding: 0,
          textAlign: 'center',
        }}
      >
        {props.label}
      </button>
    </foreignObject>
  );
}

function sldDetailLabel(lod: LodLevel): string {
  return LOD_LEVEL_LABELS_PL[lod];
}

function ZksnSwitchgearNode(props: {
  readonly branchPoint: SldBranchPointMarker;
  readonly fieldCount: number;
  readonly branchPortCount: number;
  readonly lod: LodLevel;
  readonly viewportScale: number;
  readonly selected?: boolean;
  readonly onSelect?: (id: string) => void;
}): JSX.Element {
  const { branchPoint, fieldCount, branchPortCount, lod, viewportScale, selected = false, onSelect } = props;
  const variant = lod <= 1 ? 'overview' : 'compact';
  const snBays = zksnBayDescriptors(branchPoint.id, fieldCount, branchPortCount);
  const selectZksn = onSelect ? () => onSelect(branchPoint.id) : undefined;
  const hitboxWidth = variant === 'overview' ? 150 : 220;
  const hitboxHeight = variant === 'overview' ? 108 : 166;

  return (
    <g
      data-testid={`sld-v2-zksn-switchgear-${branchPoint.id}`}
      data-zksn-renderer="station-like-switchgear"
      data-switchgear-visual="station-node"
      data-has-transformer="false"
      data-field-count={snBays.length}
      data-element-kind="zksn"
      data-element-id={branchPoint.id}
      pointerEvents="all"
      onClick={
        selectZksn
          ? (event) => {
              event.stopPropagation();
              selectZksn();
            }
          : undefined
      }
      style={{ cursor: selectZksn ? 'pointer' : 'default' }}
    >
      <rect
        data-testid={`sld-v2-zksn-switchgear-hitbox-${branchPoint.id}`}
        data-element-kind="zksn"
        data-element-id={branchPoint.id}
        x={-hitboxWidth / 2}
        y={-hitboxHeight / 2}
        width={hitboxWidth}
        height={hitboxHeight}
        fill="#050A12"
        fillOpacity={0.001}
        pointerEvents="all"
      />
      <MiniBlockRmuRenderer
        id={`zksn-${branchPoint.id}`}
        x={0}
        y={0}
        variant={variant}
        footprintType="switching_station"
        name={branchPoint.name || 'ZKSN'}
        stationCode="ZKSN"
        alarmSeverity={null}
        totalLoadKw={null}
        totalGenerationKw={null}
        snBays={snBays}
        hasTransformer={false}
        transformerRatedKva={null}
        nnFeedersCount={0}
        derBadges={[]}
        missingData={false}
        selected={selected}
        busVoltageKv={15}
        isNop={false}
        transformerVectorGroup={null}
        viewportScale={viewportScale}
        onClick={selectZksn ? () => selectZksn() : undefined}
      />
    </g>
  );
}

function zksnBayDescriptors(
  branchPointId: string,
  fieldCount: number,
  branchPortCount: number,
): readonly MiniBlockBayDescriptor[] {
  const count = zksnVisibleFieldCount(fieldCount, branchPortCount);
  return Array.from({ length: count }).map((_, index): MiniBlockBayDescriptor => {
    const role = zksnFieldRole(index, branchPortCount);
    return {
      bayRef: `${branchPointId}/field/${index + 1}`,
      fieldRole: role,
      designation: zksnFieldDesignation(index, role),
      hasMissingRequiredDevice: false,
      cbState: 'closed',
      dsState: 'closed',
      esState: 'open',
    };
  });
}

function zksnFieldRole(index: number, branchPortCount: number): MiniBlockBayDescriptor['fieldRole'] {
  if (index === 0) return FIELD_ROLE.LINE_IN;
  if (index === 1) return FIELD_ROLE.LINE_OUT;
  if (index < 2 + Math.max(1, branchPortCount)) return FIELD_ROLE.LINE_BRANCH;
  return FIELD_ROLE.RMU_LINE;
}

function zksnVisibleFieldCount(fieldCount: number, branchPortCount: number): number {
  return Math.max(3, Math.min(Math.max(3, fieldCount), 2 + Math.max(1, branchPortCount)));
}

function zksnFieldDesignation(
  index: number,
  role: MiniBlockBayDescriptor['fieldRole'],
): string {
  if (role === FIELD_ROLE.LINE_IN) return 'WE';
  if (role === FIELD_ROLE.LINE_OUT) return 'WY';
  if (role === FIELD_ROLE.LINE_BRANCH) return `ODG ${Math.max(1, index - 1)}`;
  return `Pole ${index + 1}`;
}

function resolveStationRendererSelection(
  id: string,
  station: StationOnRunRendererProps,
): { id: string; kind: string } {
  if (id === station.id) return { id, kind: 'station' };
  if (station.transformerRefs?.includes(id)) return { id, kind: 'transformer' };

  const stationBayPrefix = `${station.id}/bay/`;
  if (id.startsWith(stationBayPrefix)) {
    if (id.includes('/apparatus/')) return { id, kind: 'apparatus' };
    const bayRef = id.slice(stationBayPrefix.length);
    return {
      id: bayRef,
      kind: bayRef.includes('/der-bay/') ? 'der_pcc_bay' : 'bay',
    };
  }

  const matchedBay = station.snBays?.find((bay) => bay.bayRef === id);
  if (matchedBay) {
    return {
      id,
      kind: id.includes('/der-bay/') ? 'der_pcc_bay' : 'bay',
    };
  }

  if (id.includes('/apparatus/')) return { id, kind: 'apparatus' };
  if (id.includes('/pv/') || id.endsWith('/pcc')) return { id, kind: 'der_pcc_bay' };
  return { id, kind: 'station' };
}

function BranchPoleOverheadNode(props: {
  readonly branchPoint: SldBranchPointMarker;
  readonly lod: LodLevel;
  readonly selected: boolean;
  readonly branchPortCount: number;
  readonly markerStroke: string;
}): JSX.Element {
  const { branchPoint, lod, selected, branchPortCount, markerStroke } = props;
  const nodeStroke = selected ? '#FDE047' : markerStroke;
  const poleHeight = lod >= 3 || selected ? 72 : 54;
  const crossarmWidth = lod >= 3 || selected ? 84 : 66;
  const branchArmY = -18;
  const branchArmLength = Math.min(54, 26 + branchPortCount * 12);

  return (
    <g
      data-testid={`sld-v2-branch-pole-node-${branchPoint.id}`}
      data-branch-pole-renderer="overhead-line-node"
      data-switchgear-visual="overhead-line-node"
      data-has-switchgear="false"
      data-has-transformer="false"
      data-has-field-labels="false"
      data-branch-port-count={branchPortCount}
      data-run-ref={branchPoint.runRef ?? ''}
      data-parent-segment-ref={branchPoint.parentSegmentRef ?? ''}
    >
      <title>Słup rozgałęźny SN</title>
      <line
        x1={-crossarmWidth / 2}
        y1={branchArmY}
        x2={crossarmWidth / 2}
        y2={branchArmY}
        stroke={nodeStroke}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      <line
        x1={0}
        y1={branchArmY - 14}
        x2={0}
        y2={branchArmY + poleHeight}
        stroke="#DDF7FF"
        strokeWidth={2.4}
        strokeLinecap="round"
      />
      <circle cx={0} cy={branchArmY} r={7} fill="#050A12" stroke={nodeStroke} strokeWidth={2.4} />
      <circle cx={-crossarmWidth / 2} cy={branchArmY} r={4} fill="#050A12" stroke="#18D26B" strokeWidth={1.8} />
      <circle cx={crossarmWidth / 2} cy={branchArmY} r={4} fill="#050A12" stroke="#18D26B" strokeWidth={1.8} />
      <line
        x1={0}
        y1={branchArmY}
        x2={branchArmLength}
        y2={branchArmY - 34}
        stroke={nodeStroke}
        strokeWidth={2.2}
        strokeDasharray="6 4"
        strokeLinecap="round"
      />
      <circle cx={branchArmLength} cy={branchArmY - 34} r={5} fill="#050A12" stroke={nodeStroke} strokeWidth={2} />
    </g>
  );
}

function BranchPointMarker(props: {
  readonly branchPoint: SldBranchPointMarker;
  readonly lod: LodLevel;
  readonly selected?: boolean;
  readonly viewportScale: number;
  readonly onClick?: (id: string, kind: 'zksn' | 'branch_pole') => void;
  readonly onContextMenu?: (event: React.MouseEvent<SVGGElement>) => void;
}): JSX.Element {
  const { branchPoint, lod, selected = false, onClick, onContextMenu } = props;
  const isZksn = branchPoint.branchPointType === 'zksn';
  const elementKind: 'zksn' | 'branch_pole' = isZksn ? 'zksn' : 'branch_pole';
  const markerStroke = isZksn ? '#63B3ED' : '#FFD166';
  const shortLabel = isZksn ? 'ZKSN' : 'Słup';
  const longLabel = isZksn ? 'ZKSN' : 'Słup rozg.';
  const label = lod <= 2 ? shortLabel : longLabel;
  const anchorX = branchPoint.anchorX ?? branchPoint.x;
  const anchorY = branchPoint.anchorY ?? branchPoint.y;
  const markerX = branchPoint.x;
  const markerY = branchPoint.y;
  const offsetX = anchorX - markerX;
  const offsetY = anchorY - markerY;
  const hasRouteOffset = Math.abs(offsetX) > 2 || Math.abs(offsetY) > 2;
  const branchPortCount = Math.max(1, branchPoint.branchPortCount ?? 1);
  const zksnFieldCount = zksnVisibleFieldCount(branchPoint.switchgearFieldCount ?? branchPortCount + 2, branchPortCount);
  const routeTargetY = isZksn ? -40 : 0;
  const hitboxX = isZksn ? -112 : -56;
  const hitboxY = isZksn ? -92 : -88;
  const hitboxWidth = isZksn ? 224 : 142;
  const hitboxHeight = isZksn ? 178 : 170;

  return (
    <g
      data-testid={`sld-v2-branch-point-${branchPoint.id}`}
      data-sld-kind={branchPoint.branchPointType}
      data-branch-point-kind={branchPoint.branchPointType}
      data-branch-pole-renderer={isZksn ? undefined : 'overhead-line-node'}
      data-element-kind={elementKind}
      data-element-id={branchPoint.id}
      data-run-ref={branchPoint.runRef ?? ''}
      data-parent-segment-ref={branchPoint.parentSegmentRef ?? ''}
      data-anchor-x={anchorX}
      data-anchor-y={anchorY}
      data-marker-x={markerX}
      data-marker-y={markerY}
      data-callout-mode={hasRouteOffset ? 'route-offset' : 'route-node'}
      data-branch-port-count={branchPortCount}
      data-switchgear-field-count={isZksn ? zksnFieldCount : 0}
      data-has-transformer={String(branchPoint.hasTransformer ?? false)}
      transform={`translate(${markerX}, ${markerY})`}
      pointerEvents="auto"
      onClick={onClick ? (event) => {
        event.stopPropagation();
        onClick(branchPoint.id, elementKind);
      } : undefined}
      onContextMenu={onContextMenu}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
    >
      <rect
        data-testid={`sld-v2-branch-point-hitbox-${branchPoint.id}`}
        data-element-kind={elementKind}
        data-element-id={branchPoint.id}
        x={hitboxX}
        y={hitboxY}
        width={hitboxWidth}
        height={hitboxHeight}
        fill="#050A12"
        fillOpacity={0.001}
        pointerEvents="all"
        onClick={onClick ? (event) => {
          event.stopPropagation();
          onClick(branchPoint.id, elementKind);
        } : undefined}
        onContextMenu={onContextMenu}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      />
      {hasRouteOffset && !isZksn && (
        <g data-testid={`sld-v2-branch-point-route-anchor-${branchPoint.id}`}>
          <line
            x1={offsetX}
            y1={offsetY}
            x2={0}
            y2={routeTargetY}
            stroke={markerStroke}
            strokeWidth={1.4}
            strokeDasharray="5 4"
            opacity={0.78}
          />
          <circle cx={offsetX} cy={offsetY} r={3.5} fill="#050A12" stroke={markerStroke} strokeWidth={1.4} />
        </g>
      )}
      {isZksn ? (
        <ZksnSwitchgearNode
          branchPoint={branchPoint}
          fieldCount={zksnFieldCount}
          branchPortCount={branchPortCount}
          lod={lod}
          viewportScale={props.viewportScale}
          selected={selected}
          onSelect={onClick ? (id) => onClick(id, 'zksn') : undefined}
        />
      ) : (
        <BranchPoleOverheadNode
          branchPoint={branchPoint}
          lod={lod}
          selected={selected}
          branchPortCount={branchPortCount}
          markerStroke={markerStroke}
        />
      )}
      {lod >= 1 && !isZksn && (
        <text
          data-testid={`sld-v2-branch-point-inline-label-${branchPoint.id}`}
          x={42}
          y={-74}
          textAnchor="start"
          dominantBaseline="middle"
          fill={markerStroke}
          stroke="#050810"
          strokeWidth={2}
          paintOrder="stroke"
          fontFamily="sans-serif"
          fontSize={9}
          fontWeight={900}
          letterSpacing={0}
        >
          {label}
        </text>
      )}
      <title>{branchPoint.name}</title>
    </g>
  );
}

function overviewTopologyLabelScale(viewportScale: number): number {
  if (!Number.isFinite(viewportScale) || viewportScale <= 0) return 1;
  return Math.min(4, Math.max(1, 0.9 / viewportScale));
}

function compactGpzOverviewName(name: string): string {
  const trimmed = name.trim();
  const code = trimmed.match(/\bGPZ-[A-Z0-9]{1,4}\b/i)?.[0];
  if (code && trimmed.length > 16) return code.toUpperCase();
  return trimmed;
}

function derLodForCanvas(
  lod: LodLevel,
  selected: boolean,
): DerRendererProps['lod'] | null {
  if (lod <= 1) {
    return selected ? 'marker' : null;
  }
  if (lod === 2) return selected ? 'compact' : null;
  if (lod === 3) return selected ? 'compact' : 'marker';
  return 'compact';
}

function connectionVisibleAtLod(
  connection: NonNullable<SldCanvasV2Props['connections']>[number],
  lod: LodLevel,
): boolean {
  if (connection.connectionKind === 'der_block_transformer') return lod >= 1;
  if (!connection.id.startsWith('der-wire-')) return true;
  return lod >= 3;
}

type CableRunForPortGaps = SldCanvasV2Props['cableRuns'][number];

function buildConnectionNodePortGapsForRun(
  run: CableRunForPortGaps,
  stations: readonly StationOnRunRendererProps[],
  branchPoints: readonly SldBranchPointMarker[],
  currentLod: LodLevel,
): CableRunStationPortGap[] {
  return [
    ...buildStationPortGapsForRun(run, stations, currentLod),
    ...buildZksnPortGapsForRun(run, branchPoints, currentLod),
  ];
}

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

function buildZksnPortGapsForRun(
  run: CableRunForPortGaps,
  branchPoints: readonly SldBranchPointMarker[],
  currentLod: LodLevel,
): CableRunStationPortGap[] {
  const gaps: CableRunStationPortGap[] = [];
  for (const branchPoint of branchPoints) {
    if (branchPoint.branchPointType !== 'zksn') continue;
    const connectionY = branchPoint.anchorY ?? branchPoint.y - STATION_RUN_TRUNK_OFFSET_Y;
    const connectionX = branchPoint.anchorX ?? branchPoint.x;
    if (!runHasHorizontalSegmentAtY(run, connectionY, connectionX)) continue;
    const branchPortCount = Math.max(1, branchPoint.branchPortCount ?? 1);
    const fieldCount = zksnVisibleFieldCount(branchPoint.switchgearFieldCount ?? branchPortCount + 2, branchPortCount);
    const offsets = zksnMainPortOffsets(fieldCount, branchPortCount, currentLod);
    if (!offsets) continue;
    gaps.push({
      stationId: branchPoint.id,
      y: connectionY,
      inputX: branchPoint.x + offsets[0],
      outputX: offsets[1] === null ? null : branchPoint.x + offsets[1],
    });
  }
  return gaps;
}

function zksnMainPortOffsets(
  fieldCount: number,
  branchPortCount: number,
  currentLod: LodLevel,
): readonly [number, number | null] | null {
  const snBays = zksnBayDescriptors('__zksn_port_probe__', fieldCount, branchPortCount);
  return miniBlockStationPortOffsets(miniBlockVariantForCanvasPort(currentLod), snBays, []);
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
  if (stationUsesMiniBlockRenderer(station, currentLod)) {
    const miniBlockOffsets = miniBlockStationPortOffsets(
      miniBlockVariantForCanvasPort(currentLod),
      station.snBays ?? [],
      station.derBadges ?? [],
    );
    if (miniBlockOffsets) return miniBlockOffsets;
  }
  return stationTopologyPortOffsets(station);
}

function miniBlockVariantForCanvasPort(
  currentLod: LodLevel,
): 'overview' | 'compact' | 'detail' {
  if (currentLod <= 1) return 'overview';
  return 'compact';
}

function stationTopologyPortOffsets(
  station: Pick<StationOnRunRendererProps, 'topologicalType'>,
): readonly [number, number | null] {
  switch (station.topologicalType) {
    case 'przelotowa':
    case 'sekcyjna':
      return [-18, 18];
    case 'odgałęźna':
      return [-24, 24];
    case 'końcowa':
    default:
      return [0, null];
  }
}

function stationUsesMiniBlockRenderer(
  station: StationOnRunRendererProps,
  _currentLod: LodLevel,
): boolean {
  return station.snBays !== undefined;
}

/** Czy ciąg kablowy przecina widoczny kadr (wirtualizacja krawędzi). */
function cableRunIntersectsViewport(
  run: CableRunRendererProps,
  vp: WorldViewport,
): boolean {
  return polylineIntersectsViewport(run.pathPoints, vp);
}

/**
 * Wymiary bloku przeglądowego stacji (L0) — rozróżnialny, bez mikro-detalu.
 * JEDNO źródło: kontrakt geometrii (`L0_STATION_BLOCK`). Layout engine używa tej
 * samej stałej do rozmieszczania stacji, więc render i layout NIE mogą się
 * rozjechać (anty-„druga prawda").
 */
const L0_BLOCK_W = L0_STATION_BLOCK.width;
const L0_BLOCK_H = L0_STATION_BLOCK.height;

/**
 * Status gotowości stacji na przeglądzie (L0): kolor kropki. To JEDYNA informacja
 * stanu na L0 (poza nazwą) — kontrakt §7 (status gotowości). Mapowanie:
 *   krytyczny alarm / brak danych → czerwony; ostrzeżenie → bursztyn; OK → zielony.
 */
function stationReadinessColor(station: StationOnRunRendererProps): string {
  if (station.alarmSeverity === 'critical') return COLOR_DEVICE_OPEN_BORDER;
  if (station.missingData) return COLOR_WARN;
  if (station.alarmSeverity === 'important' || station.alarmSeverity === 'warning') return COLOR_WARN;
  return COLOR_DEVICE_CLOSED_BORDER;
}

/**
 * Blok przeglądowy stacji (L0) — STRUKTURALNY fix gęstości (§7, M-08).
 *
 * Zamiast pełnego mini-bloku z aparaturą (118×96, nieczytelny przy skali ~0.2 dla
 * 53 stacji), rysuje czysty prostokąt + kod/nazwa stacji + kropka statusu gotowości.
 * Pozycja z propsów stacji (jedna prawda geometrii — adapter nałożył ją z LayoutResult);
 * ten komponent NIE liczy pozycji. Hit-box = cały blok (klikalność V-08 na L0).
 */
function StationOverviewBlock(props: {
  readonly station: StationOnRunRendererProps;
  readonly selected: boolean;
}): JSX.Element {
  const { station, selected } = props;
  const x = station.x - L0_BLOCK_W / 2;
  const y = station.y - L0_BLOCK_H / 2;
  const label = station.stationCode?.trim() || station.name || station.id;
  const borderColor = selected ? COLOR_SELECTION : '#2C3A48';
  const statusColor = stationReadinessColor(station);
  // P-A POWER-FLOW TOR (one truth): a station is de-energized when the FROZEN
  // solver did not energize its bus (`energized === false`, READ from the
  // companion — never computed here). De-energized blocks are dimmed so the
  // SLD shows exactly the solver's energized set. `undefined` (no companion) =
  // full strength (no solver data to dim by).
  const deEnergized = station.energized === false;
  return (
    <g
      data-testid={`sld-v2-station-overview-block-${station.id}`}
      data-lod-variant="block_overview"
      data-station-readiness={statusColor}
      data-station-energized={station.energized === undefined ? undefined : station.energized ? 'true' : 'false'}
      opacity={deEnergized ? 0.4 : 1}
      pointerEvents="none"
    >
      <rect
        x={x}
        y={y}
        width={L0_BLOCK_W}
        height={L0_BLOCK_H}
        rx={6}
        ry={6}
        fill={COLOR_PANEL}
        stroke={deEnergized ? '#3A4754' : borderColor}
        strokeWidth={selected ? 2.5 : 1.5}
        strokeDasharray={deEnergized ? '6 4' : undefined}
      />
      {/* Status gotowości — kropka w lewym górnym rogu. */}
      <circle cx={x + 14} cy={y + 14} r={6} fill={statusColor} stroke="#0A0E14" strokeWidth={1} />
      {/* Kod/nazwa stacji — wyśrodkowana, jedyna etykieta na L0. */}
      <text
        x={station.x}
        y={station.y + 4}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={deEnergized ? '#8A99A8' : COLOR_TEXT_PRIMARY}
        fontFamily="sans-serif"
        fontSize={22}
        fontWeight={800}
        letterSpacing={0.5}
      >
        {label}
      </text>
    </g>
  );
}


/**
 * K30-8: compute alarm severity per station z overlay payload.
 * Patrzy na bus SN ref (mapping station_id -> sn_bus_ref) + sprawdza
 * thresholds (Ik > 25 kA -> critical, > 20 -> important, > 15 -> warning).
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
