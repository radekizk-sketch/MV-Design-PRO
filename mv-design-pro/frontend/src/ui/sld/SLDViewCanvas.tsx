/**
 * SLD View Canvas — Read-Only SVG Rendering with CANONICAL Symbols
 *
 * PR-SLD-04: Unifikacja symboli w edytorze do standardu CANONICAL
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § A.2: Symbol types (Bus, Line, Transformer, etc.)
 * - sld_rules.md § D.1: Visual state encoding (in_service, selected)
 * - ui_canonical_parity.md: Canonical-like presentation
 * - canonical_symbols/*: CANONICAL-parity symbol library
 * - AUDYT_SLD_CANONICAL.md N-02: hierarchiczne auto-rozmieszczenie
 * - AUDYT_SLD_CANONICAL.md N-04: edytor używa tego samego renderera co podgląd (CANONICAL)
 *
 * READ-ONLY canvas:
 * - No drag/drop
 * - No lasso selection
 * - No editing
 * - Click → selection only
 * - AUTOMATYCZNE auto-rozmieszczenie (bez przycisku)
 *
 * CANONICAL SYMBOL INTEGRATION (via UnifiedSymbolRenderer):
 * - Bus → busbar
 * - LineBranch (LINE) → line_overhead (solid)
 * - LineBranch (CABLE) → line_cable (dashed)
 * - TransformerBranch → transformer_2w
 * - Switch (BREAKER) → circuit_breaker
 * - Switch (DISCONNECTOR) → disconnector
 * - Source → utility_feeder
 * - Load → fallback (trójkąt, brak symbolu CANONICAL)
 */

import React, { useCallback, useMemo } from 'react';
import type { AnySldSymbol, Connection as RenderConnection } from '../sld-editor/types';
import { getPortPoint, type PortName } from '../sld-editor/utils/portUtils';
import type { ElementType } from '../types';
import type {
  EngineeringElement,
  PortRole,
  VoltageDomain,
} from '../engineering-semantic';
import type { InteractionPortRole, SLDViewCanvasProps, ViewportState } from './types';
import { calculateEnergization, calculateLegacyTestOnlyEnergization } from './energization';
import { ConnectionsLayer } from './ConnectionRenderer';
import { UnifiedSymbolRenderer, type SymbolVisualState, type SymbolInteractionHandlers } from './symbols';
import { BranchRenderer } from './BranchRenderer';
import { FieldBlockRenderer } from './FieldBlockRenderer';
import { InlineBranchObjectRenderer } from './InlineBranchObjectRenderer';
import { GpzSwitchgearRenderer } from './GpzFieldBlockRenderer';
import { JunctionDotLayer } from './JunctionDotLayer';
import {
  CANONICAL_CANVAS,
  CANONICAL_GRID,
  CANONICAL_STATE_COLORS,
  CANONICAL_TYPOGRAPHY,
  CANONICAL_VOLTAGE_COLORS,
} from './sldCanonicalStyle';
import { CABLE_DASH_ARRAY } from './IndustrialAesthetics';
import { useSldReadabilityOverlay } from './SldReadabilityOverlay';
import { shouldShowTechnicalLabels } from './sldDetailLevel';
import {
  collectGpzSwitchgearSuppressedSymbolIds,
  filterConnectionsForGpzSwitchgear,
  hasCanonicalGpzSwitchgear,
  shouldSuppressForGpzSwitchgear,
} from './gpzSwitchgearVisibility';
import './sld-canonical.css';

/**
 * Read-only symbol renderer using UnifiedSymbolRenderer.
 *
 * PR-SLD-04: Uses the same renderer as editor for consistency.
 */
type IssueSeverity = 'HIGH' | 'WARN' | 'INFO';

interface SymbolProps {
  symbol: AnySldSymbol;
  selected: boolean;
  onClick: (symbolId: string, elementType: ElementType, elementName: string) => void;
  onDoubleClick?: (symbolId: string, elementType: ElementType, elementName: string) => void;
  onHover?: (symbolId: string | null, elementType?: ElementType, elementName?: string) => void;
  energized: boolean;
  /** Severity z readiness blockers — podświetla symbol kolorową obwódką */
  readinessSeverity?: IssueSeverity | null;
}

/**
 * Main symbol component using unified CANONICAL symbols.
 */
const Symbol: React.FC<SymbolProps> = ({
  symbol,
  selected,
  onClick,
  onDoubleClick,
  onHover,
  energized,
  readinessSeverity,
}) => {
  // Handle click - adapts the unified renderer's interface to viewer's onClick
  const handleClick = useCallback(
    (symbolId: string) => {
      onClick(symbolId, symbol.elementType, symbol.elementName);
    },
    [symbol.elementType, symbol.elementName, onClick]
  );

  // Build visual state for unified renderer
  const visualState: SymbolVisualState = {
    selected,
    inService: symbol.inService,
    energized,
    highlighted: !!readinessSeverity,
    highlightSeverity: readinessSeverity ?? null,
  };

  // Build interaction handlers - viewer only needs onClick
  const handlers: SymbolInteractionHandlers = {
    onClick: handleClick,
    onDoubleClick: onDoubleClick
      ? (symbolId) => onDoubleClick(symbolId, symbol.elementType, symbol.elementName)
      : undefined,
  };

  return (
    <g
      onMouseEnter={() => onHover?.(symbol.id, symbol.elementType, symbol.elementName)}
      onMouseLeave={() => onHover?.(null)}
    >
      <UnifiedSymbolRenderer
        symbol={symbol}
        visualState={visualState}
        handlers={handlers}
        showLabel={true}
      />
    </g>
  );
};

function mapSemanticPortRoleToInteractionRole(
  role: PortRole,
  voltageDomain: VoltageDomain,
): InteractionPortRole | null {
  switch (role) {
    case 'BAY_SN_IN':
    case 'BAY_SN_OUT':
    case 'BAY_SN_TRANSFORMER':
    case 'SEGMENT_SN_IN':
    case 'SEGMENT_SN_OUT':
    case 'TRANSFORMER_SN':
    case 'TRANSFORMER_NN':
    case 'LV_FEEDER_OUT':
    case 'SOURCE_AC':
    case 'SOURCE_DC':
      return role;
    case 'TRANSFORMER_HIGH':
      return voltageDomain === 'NN' ? 'TRANSFORMER_NN' : 'TRANSFORMER_SN';
    case 'TRANSFORMER_LOW':
      return voltageDomain === 'NN' ? 'TRANSFORMER_NN' : 'TRANSFORMER_SN';
    case 'BAY_COUPLER_A':
      return 'BAY_SN_IN';
    case 'BAY_COUPLER_B':
      return 'BAY_SN_OUT';
    default:
      return null;
  }
}

function getSemanticPortsForSymbol(element: EngineeringElement | undefined): InteractionPortRole[] {
  if (!element) return [];

  const roles = element.ports
    .map((port) => mapSemanticPortRoleToInteractionRole(port.role, port.voltageDomain))
    .filter((role): role is InteractionPortRole => role !== null);

  return Array.from(new Set(roles));
}

function getLegacyPortsForSymbol(symbol: AnySldSymbol): InteractionPortRole[] {
  switch (symbol.elementType) {
    case 'Bus':
      return [];
    case 'TransformerBranch':
      return ['TRANSFORMER_SN', 'TRANSFORMER_NN'];
    case 'Generator':
      return ['SOURCE_AC'];
    default:
      return [];
  }
}

function getPortsForSymbol(
  symbol: AnySldSymbol,
  semanticElement: EngineeringElement | undefined,
  hasSemanticModel: boolean,
): InteractionPortRole[] {
  if (hasSemanticModel) {
    return getSemanticPortsForSymbol(semanticElement);
  }

  return getLegacyPortsForSymbol(symbol);
}

function getPortLabel(role: InteractionPortRole): string {
  const formalLabels: Partial<Record<InteractionPortRole, string>> = {
    BAY_SN_IN: 'Port wejściowy pola SN',
    BAY_SN_OUT: 'Port wyjściowy pola SN',
    BAY_SN_TRANSFORMER: 'Port transformatorowy pola SN',
    SEGMENT_SN_IN: 'Port wejściowy odcinka SN',
    SEGMENT_SN_OUT: 'Port wyjściowy odcinka SN',
    TRANSFORMER_SN: 'Port SN transformatora',
    TRANSFORMER_NN: 'Port nN transformatora',
    LV_FEEDER_OUT: 'Port odpływu nN',
    SOURCE_AC: 'Port AC źródła',
    SOURCE_DC: 'Port DC źródła',
    ZKSN_MAIN_IN: 'Port wejściowy główny ZKSN',
    ZKSN_MAIN_OUT: 'Port wyjściowy główny ZKSN',
    ZKSN_BRANCH_OUT: 'Port odgałęźny ZKSN',
    POLE_MAIN_IN: 'Port wejściowy słupa rozgałęźnego',
    POLE_MAIN_OUT: 'Port wyjściowy słupa rozgałęźnego',
    POLE_BRANCH_OUT: 'Port odgałęźny słupa rozgałęźnego',
  };
  const label = formalLabels[role];
  if (label) return label;

  switch (role) {
    case 'TRUNK_IN':
      return 'Port wejścia magistrali';
    case 'TRUNK_OUT':
      return 'Port wyjścia magistrali';
    case 'BRANCH_OUT':
      return 'Port odgałęzienia';
    case 'RING':
      return 'Port pierścienia';
    case 'NN_SOURCE':
      return 'Port źródła nN';
  }
  return 'Port techniczny';
}

function mapInteractionRoleToPortName(role: InteractionPortRole): PortName {
  switch (role) {
    case 'TRUNK_IN':
    case 'BAY_SN_IN':
    case 'SEGMENT_SN_IN':
    case 'TRANSFORMER_SN':
    case 'ZKSN_MAIN_IN':
    case 'POLE_MAIN_IN':
      return 'top';
    case 'TRUNK_OUT':
    case 'BAY_SN_OUT':
    case 'SEGMENT_SN_OUT':
    case 'TRANSFORMER_NN':
    case 'LV_FEEDER_OUT':
    case 'SOURCE_AC':
    case 'SOURCE_DC':
    case 'ZKSN_MAIN_OUT':
    case 'POLE_MAIN_OUT':
      return 'bottom';
    case 'BRANCH_OUT':
    case 'BAY_SN_TRANSFORMER':
    case 'ZKSN_BRANCH_OUT':
    case 'POLE_BRANCH_OUT':
      return 'right';
    case 'RING':
      return 'left';
    case 'NN_SOURCE':
      return 'bottom';
  }
}

function inlineBranchElementType(objectType: 'branch_pole' | 'zksn'): ElementType {
  return objectType === 'branch_pole' ? 'BranchPole' : 'ZKSN';
}

type StationChainForCanvas = NonNullable<SLDViewCanvasProps['canonicalAnnotations']>['stationChains'][number];

function isGpzSwitchgearChain(chain: StationChainForCanvas, hasGpzSwitchgear: boolean): boolean {
  if (!hasGpzSwitchgear) {
    return false;
  }

  return chain.detail?.fields.some((field) => field.fieldRole === 'GPZ_LINE_BAY') ?? false;
}

/**
 * Grid background for canvas.
 * CANONICAL style: subdued, not dominant. Major grid every N cells.
 * Technical drawing paper aesthetic — warm, professional.
 */
interface GridProps {
  width: number;
  height: number;
  gridSize: number;
  viewport: ViewportState;
}

const Grid: React.FC<GridProps> = ({ width, height, gridSize, viewport }) => {
  const lines: React.ReactNode[] = [];
  const scaledGridSize = gridSize * viewport.zoom;

  // Calculate visible grid area
  const startX = Math.floor(-viewport.offsetX / scaledGridSize) * scaledGridSize;
  const startY = Math.floor(-viewport.offsetY / scaledGridSize) * scaledGridSize;
  const endX = width;
  const endY = height;

  // Calculate which lines are major (every N cells)
  const getMajorIndex = (value: number) => Math.round(value / scaledGridSize);

  // Vertical lines
  for (let x = startX; x <= endX; x += scaledGridSize) {
    const screenX = x + viewport.offsetX;
    if (screenX >= 0 && screenX <= width) {
      const gridIndex = getMajorIndex(x);
      const isMajor = gridIndex % CANONICAL_GRID.majorEvery === 0;
      const isAxis = gridIndex === 0;
      lines.push(
        <line
          key={`v-${x}`}
          x1={screenX}
          y1={0}
          x2={screenX}
          y2={height}
          stroke={isAxis ? CANONICAL_GRID.axisColor : isMajor ? CANONICAL_GRID.majorColor : CANONICAL_GRID.minorColor}
          strokeWidth={isAxis ? CANONICAL_GRID.axisStrokeWidth : isMajor ? CANONICAL_GRID.majorStrokeWidth : CANONICAL_GRID.minorStrokeWidth}
          opacity={CANONICAL_GRID.opacity}
        />
      );
    }
  }

  // Horizontal lines
  for (let y = startY; y <= endY; y += scaledGridSize) {
    const screenY = y + viewport.offsetY;
    if (screenY >= 0 && screenY <= height) {
      const gridIndex = getMajorIndex(y);
      const isMajor = gridIndex % CANONICAL_GRID.majorEvery === 0;
      const isAxis = gridIndex === 0;
      lines.push(
        <line
          key={`h-${y}`}
          x1={0}
          y1={screenY}
          x2={width}
          y2={screenY}
          stroke={isAxis ? CANONICAL_GRID.axisColor : isMajor ? CANONICAL_GRID.majorColor : CANONICAL_GRID.minorColor}
          strokeWidth={isAxis ? CANONICAL_GRID.axisStrokeWidth : isMajor ? CANONICAL_GRID.majorStrokeWidth : CANONICAL_GRID.minorStrokeWidth}
          opacity={CANONICAL_GRID.opacity}
        />
      );
    }
  }

  return <g data-testid="sld-grid">{lines}</g>;
};

function EngineeringLegend({ width, height }: { width: number; height: number }) {
  const x = 12;
  const y = Math.max(44, height - 88);
  const lineX1 = x + 12;
  const lineX2 = x + 48;
  const labelX = x + 58;

  return (
    <g data-testid="sld-engineering-legend" transform={`translate(${x}, ${y})`} style={{ pointerEvents: 'none' }}>
      <rect
        x={0}
        y={0}
        width={Math.min(244, Math.max(180, width - 24))}
        height={76}
        rx={4}
        fill="rgba(6, 17, 24, 0.88)"
        stroke="rgba(51, 80, 92, 0.95)"
        strokeWidth={1}
      />
      <line x1={lineX1} y1={16} x2={lineX2} y2={16} stroke={CANONICAL_VOLTAGE_COLORS.SN} strokeWidth={2.5} strokeDasharray={CABLE_DASH_ARRAY} />
      <text x={labelX} y={19} fontFamily={CANONICAL_TYPOGRAPHY.fontFamily} fontSize={10} fill={CANONICAL_TYPOGRAPHY.labelColor}>Kabel SN</text>
      <line x1={lineX1} y1={32} x2={lineX2} y2={32} stroke={CANONICAL_VOLTAGE_COLORS.SN} strokeWidth={2.5} />
      <text x={labelX} y={35} fontFamily={CANONICAL_TYPOGRAPHY.fontFamily} fontSize={10} fill={CANONICAL_TYPOGRAPHY.labelColor}>Linia napowietrzna</text>
      <circle cx={lineX1 + 6} cy={50} r={4} fill="none" stroke="#f59e0b" strokeWidth={1.5} />
      <line x1={lineX1 + 2} y1={50} x2={lineX1 + 10} y2={50} stroke="#f59e0b" strokeWidth={1.5} />
      <text x={labelX} y={53} fontFamily={CANONICAL_TYPOGRAPHY.fontFamily} fontSize={10} fill={CANONICAL_TYPOGRAPHY.labelColor}>NOP</text>
      <rect x={lineX1 + 80} y={44} width={12} height={12} fill="none" stroke={CANONICAL_STATE_COLORS.selected} strokeWidth={1.5} />
      <text x={lineX1 + 100} y={53} fontFamily={CANONICAL_TYPOGRAPHY.fontFamily} fontSize={10} fill={CANONICAL_TYPOGRAPHY.labelColor}>Wybrany</text>
      <path d={`M${lineX1 + 80} 64 L${lineX1 + 86} 54 L${lineX1 + 92} 64 Z`} fill="#f59e0b" />
      <text x={lineX1 + 100} y={65} fontFamily={CANONICAL_TYPOGRAPHY.fontFamily} fontSize={10} fill={CANONICAL_TYPOGRAPHY.labelColor}>Blokada</text>
    </g>
  );
}

function EmptyCanvasHint({
  width,
  height,
  onCanvasClick,
}: {
  width: number;
  height: number;
  onCanvasClick?: () => void;
}) {
  return (
    <g
      data-testid="sld-empty-state"
      onClick={onCanvasClick}
      role="button"
      aria-label="Brak danych schematu jednokreskowego."
      style={{ cursor: onCanvasClick ? 'pointer' : 'default' }}
    >
      <text
        x={width / 2}
        y={height / 2 - 10}
        textAnchor="middle"
        fontFamily={CANONICAL_TYPOGRAPHY.fontFamily}
        fontSize={CANONICAL_TYPOGRAPHY.fontSize.large}
        fill="#8aa6b9"
      >
        Brak danych schematu
      </text>
      <text
        x={width / 2}
        y={height / 2 + 14}
        textAnchor="middle"
        fontFamily={CANONICAL_TYPOGRAPHY.fontFamily}
        fontSize={CANONICAL_TYPOGRAPHY.fontSize.small}
        fill="#60798c"
      >
        Kanwa zostanie wypełniona wyłącznie danymi z aktywnego modelu.
      </text>
    </g>
  );
}

/**
 * Main SLD View Canvas component (read-only) with CANONICAL symbols.
 *
 * AUTO-LAYOUT (N-02):
 * - Layout jest wyliczany AUTOMATYCZNIE przy kazdej zmianie topologii
 * - Brak przycisku "Rozmiesc automatycznie"
 * - Deterministyczny (ten sam model -> ten sam uklad)
 * - Stabilny (mala zmiana nie powoduje "przeskoku")
 */
export const SLDViewCanvas: React.FC<SLDViewCanvasProps> = ({
  symbols: inputSymbols,
  connections: canonicalConnections = [],
  selectedId,
  onSymbolClick,
  onSymbolDoubleClick,
  onSymbolHover,
  onCanvasClick,
  onPortClick,
  onPortHover,
  onSegmentClick,
  onSegmentHover,
  selectedConnectionId,
  interactionPreview,
  semanticModel = null,
  viewport,
  showGrid,
  width,
  height,
  canonicalAnnotations,
  highlightedElements,
}) => {
  // KANONICZNE ZRÓDŁO GEOMETRII (Step VII.c+):
  // Viewer nie uruchamia lokalnego engine layoutu. Używa wyłącznie geometrii
  // dostarczonej przez pipeline Snapshot -> SLD symbols.
  const symbols = inputSymbols;
  const gpzSections = canonicalAnnotations?.gpzSections ?? [];
  const gpzFeederFields = canonicalAnnotations?.gpzFeederFields ?? [];
  const stationChains = canonicalAnnotations?.stationChains ?? [];
  const hasGpzSwitchgear = hasCanonicalGpzSwitchgear(canonicalAnnotations);
  const semanticElementByRef = useMemo(
    () => new Map((semanticModel?.elements ?? []).map((element) => [element.refId, element])),
    [semanticModel],
  );
  const suppressedGpzSymbolIds = useMemo(
    () => collectGpzSwitchgearSuppressedSymbolIds(symbols, canonicalAnnotations),
    [canonicalAnnotations, symbols],
  );
  const visibleStationChains = useMemo(
    () => stationChains.filter((chain) => !isGpzSwitchgearChain(chain, hasGpzSwitchgear)),
    [hasGpzSwitchgear, stationChains],
  );
  const visibleCanonicalAnnotations = useMemo(
    () => canonicalAnnotations ? { ...canonicalAnnotations, stationChains: visibleStationChains } : null,
    [canonicalAnnotations, visibleStationChains],
  );
  const gpzFieldNodeIds = useMemo(
    () => new Set(gpzFeederFields.map((field) => field.feederNodeId)),
    [gpzFeederFields],
  );

  // Sort symbols for deterministic rendering (by ID)
  const sortedSymbols = [...symbols].sort((a, b) => a.id.localeCompare(b.id));
  const renderableSymbols = sortedSymbols.filter((symbol) => {
    if (symbol.elementType === 'LineBranch') return false;
    if (gpzFieldNodeIds.has(symbol.id)) return false;
    if (symbol.elementId && gpzFieldNodeIds.has(symbol.elementId)) return false;
    if (shouldSuppressForGpzSwitchgear(symbol, suppressedGpzSymbolIds)) return false;
    return true;
  });

  // Calculate energization state from semantic operation projection when available.
  const energizationState = useMemo(
    () => semanticModel
      ? calculateEnergization(semanticModel, semanticModel.semanticHash, symbols)
      : calculateLegacyTestOnlyEnergization(symbols),
    [semanticModel, symbols],
  );

  // Połączenia pochodzą wyłącznie z kanonicznego pipeline layoutu.
  // Viewer nie rekonstruuje już routingu lokalną heurystyką.
  const connections = useMemo(
    () => filterConnectionsForGpzSwitchgear(canonicalConnections as RenderConnection[], suppressedGpzSymbolIds),
    [canonicalConnections, suppressedGpzSymbolIds],
  );

  // V12 § 5.7: readability overlay (LOD + filtry warstwowe + szkielet)
  const { getOpacity, lodBand, lodLevel } = useSldReadabilityOverlay(symbols, viewport);
  // Pochodna LOD: czy pokazujemy pełne etykiety techniczne
  const showTechnicalCanonicalLabels = shouldShowTechnicalLabels(lodBand);
  const canonicalFieldOverlays = useMemo(() => {
    const overlays: React.ReactNode[] = [];

    if (gpzFeederFields.length > 0) {
      overlays.push(
        <GpzSwitchgearRenderer
          key="gpz-switchgear-canonical"
          sections={gpzSections}
          fields={gpzFeederFields}
          showTechnicalLabels={showTechnicalCanonicalLabels}
          selectedFieldId={selectedId}
          onFieldClick={(field) => {
            onSymbolClick(field.fieldId, 'BaySN', field.designation);
          }}
          onFieldDoubleClick={(field) => {
            onSymbolDoubleClick?.(field.fieldId, 'BaySN', field.designation);
          }}
          onTrunkOutPortClick={(selectedField) => {
            onPortClick?.(selectedField.fieldId, 'BaySN', selectedField.designation, 'TRUNK_OUT');
          }}
          onTrunkOutPortHover={(selectedField) => {
            if (!selectedField) {
              onPortHover?.(null);
              return;
            }
            onPortHover?.(selectedField.fieldId, 'BaySN', selectedField.designation, 'TRUNK_OUT');
          }}
        />,
      );
    }

    overlays.push(
      ...visibleStationChains.map((chain) => (
        <g
          key={`station-field-${chain.stationId}`}
          data-element-id={chain.stationId}
          data-element-type="Station"
          data-element-name={chain.stationId}
          style={{ cursor: 'pointer' }}
          onClick={(event) => {
            event.stopPropagation();
            onSymbolClick(chain.stationId, 'Station', chain.stationId);
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onSymbolDoubleClick?.(chain.stationId, 'Station', chain.stationId);
          }}
        >
          <FieldBlockRenderer
            field={chain}
            showTechnicalLabels={showTechnicalCanonicalLabels}
          />
        </g>
      )),
    );

    return overlays;
  }, [
    gpzSections,
    gpzFeederFields,
    onPortClick,
    onPortHover,
    onSymbolClick,
    onSymbolDoubleClick,
    selectedId,
    showTechnicalCanonicalLabels,
    visibleStationChains,
  ]);

  // Build energization map for connections
  const connectionEnergizationMap = useMemo(() => {
    const map = new Map<string, boolean>();
    connections.forEach((conn) => {
      // Connection is energized if both endpoints are energized
      const fromEnergized = energizationState.energizedElements.get(conn.fromSymbolId) ?? true;
      const toEnergized = energizationState.energizedElements.get(conn.toSymbolId) ?? true;
      map.set(conn.id, fromEnergized && toEnergized);
    });
    return map;
  }, [connections, energizationState]);

  const toSegmentKind = useCallback((connection: (typeof connections)[number]): 'TRUNK' | 'BRANCH' | 'RING' | 'SECONDARY' => {
    if (connection.connectionStyle === 'ring') return 'RING';
    if (connection.connectionType === 'branch') return 'BRANCH';
    if (connection.connectionType === 'source' || connection.connectionType === 'load' || connection.connectionType === 'switch') {
      return 'SECONDARY';
    }
    return 'TRUNK';
  }, []);

  const buildSegmentTarget = useCallback((connectionId: string) => {
    const connection = connections.find((item) => item.id === connectionId);
    if (!connection) return null;
    return {
      segment_ref: connection.elementId ?? connection.id,
      edge_id: connection.id,
      from_ref: connection.fromSymbolId,
      to_ref: connection.toSymbolId,
      segment_kind: toSegmentKind(connection),
    };
  }, [connections, toSegmentKind]);

  const previewConnection = useMemo(
    () => interactionPreview?.target_kind === 'segment'
      ? connections.find((conn) => conn.id === interactionPreview.target_id || conn.elementId === interactionPreview.target_id) ?? null
      : null,
    [interactionPreview, connections],
  );

  const previewSymbol = useMemo(
    () => interactionPreview?.target_kind === 'element'
      ? sortedSymbols.find((symbol) => symbol.id === interactionPreview.target_id || symbol.elementId === interactionPreview.target_id) ?? null
      : null,
    [interactionPreview, sortedSymbols],
  );

  return (
    <svg
      data-testid="sld-view-canvas"
      width={width}
      height={height}
      style={{ display: 'block' }}
    >
      {/* Defs for gradients and patterns */}
      <defs>
        {/* Kanoniczne tlo techniczne dla canvasa */}
        <linearGradient id="canonical-canvas-bg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={CANONICAL_CANVAS.gradientStart} />
          <stop offset="100%" stopColor={CANONICAL_CANVAS.gradientEnd} />
        </linearGradient>
        <filter id="canonical-canvas-shadow" x="-5%" y="-5%" width="110%" height="110%">
          <feDropShadow dx="0" dy="1" stdDeviation="1" floodColor={CANONICAL_CANVAS.shadowColor} floodOpacity="1" />
        </filter>
      </defs>

      {/* Canvas background — CANONICAL technical drawing paper */}
      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="url(#canonical-canvas-bg)"
        data-testid="sld-canvas-background"
        onClick={onCanvasClick}
      />

      {/* Grid background — CANONICAL subdued grid */}
      {showGrid && <Grid width={width} height={height} gridSize={CANONICAL_GRID.size} viewport={viewport} />}

      {/* Transformed content group */}
      <g
        transform={`translate(${viewport.offsetX}, ${viewport.offsetY}) scale(${viewport.zoom})`}
        data-testid="sld-content-group"
        data-sld-lod-level={lodLevel}
      >
        {/* Connections layer (rendered UNDER symbols) */}
        <ConnectionsLayer
          connections={connections}
          selectedConnectionId={selectedConnectionId ?? null}
          energizationMap={connectionEnergizationMap}
          onConnectionClick={(connectionId) => {
            const target = buildSegmentTarget(connectionId);
            if (target) onSegmentClick?.(target);
          }}
          onConnectionHover={(connectionId) => {
            if (!connectionId) {
              onSegmentHover?.(null);
              return;
            }
            const target = buildSegmentTarget(connectionId);
            onSegmentHover?.(target);
          }}
        />

        {previewConnection && (
          <polyline
            points={previewConnection.path.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={interactionPreview?.valid ? '#16a34a' : '#dc2626'}
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.25}
            data-testid="sld-preview-segment-overlay"
            style={{ pointerEvents: 'none' }}
          />
        )}

        {previewSymbol && (
          <rect
            x={previewSymbol.position.x - 18}
            y={previewSymbol.position.y - 18}
            width={36}
            height={36}
            rx={6}
            ry={6}
            fill={interactionPreview?.valid ? 'rgba(22,163,74,0.15)' : 'rgba(220,38,38,0.15)'}
            stroke={interactionPreview?.valid ? '#16a34a' : '#dc2626'}
            strokeWidth={1}
            data-testid="sld-preview-element-overlay"
            style={{ pointerEvents: 'none' }}
          />
        )}

        {canonicalFieldOverlays.length > 0 && (
          <g className="sld-canonical-fields">
            {canonicalFieldOverlays}
          </g>
        )}

        {/* Render symbols with energization + readiness state + V12 readability (LOD/filtry/szkielet) */}
        {renderableSymbols.map((symbol) => {
          const elementRef = symbol.elementId ?? symbol.id;
          const severity = highlightedElements?.get(elementRef)
            ?? highlightedElements?.get(symbol.id)
            ?? null;
          const opacity = getOpacity(symbol.id, symbol.elementType as import('../types').ElementType);
          if (opacity === 0) return null;
          return (
            <g key={symbol.id} style={opacity < 1 ? { opacity } : undefined} data-lod-opacity={opacity < 1 ? opacity : undefined}>
              <Symbol
                symbol={symbol}
                selected={symbol.id === selectedId || symbol.elementId === selectedId}
                onClick={onSymbolClick}
                onDoubleClick={onSymbolDoubleClick}
                onHover={onSymbolHover}
                energized={energizationState.energizedElements.get(symbol.id) ?? true}
                readinessSeverity={severity}
              />
            </g>
          );
        })}

        {renderableSymbols
          .filter((symbol) => symbol.id === selectedId || symbol.elementId === selectedId)
          .flatMap((symbol) => {
            const elementRef = symbol.elementId ?? symbol.id;
            const semanticElement = semanticElementByRef.get(elementRef);
            return getPortsForSymbol(symbol, semanticElement, Boolean(semanticModel))
              .map((role) => ({ symbol, role }));
          })
          .map(({ symbol, role }) => {
            const portPos = getPortPoint(symbol, mapInteractionRoleToPortName(role));
            return (
              <g key={`${symbol.id}-${role}`} data-testid={`sld-port-${symbol.id}-${role}`}>
                <circle
                  cx={portPos.x}
                  cy={portPos.y}
                  r={10}
                  fill="rgba(37, 99, 235, 0.16)"
                  stroke="#2563eb"
                  strokeWidth={1}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onPortClick?.(symbol.id, symbol.elementType, symbol.elementName, role)}
                  onMouseEnter={() => onPortHover?.(symbol.id, symbol.elementType, symbol.elementName, role)}
                  onMouseLeave={() => onPortHover?.(null)}
                >
                  <title>{getPortLabel(role)}</title>
                </circle>
              </g>
            );
          })}

        {/* Canonical SLD layers (Phase 7) — pointerEvents: none to avoid blocking interaction */}
        {visibleCanonicalAnnotations && (
          <>
            <g className="sld-branch-points" style={{ pointerEvents: 'none' }}>
              {visibleCanonicalAnnotations.branchPoints.map((bp) => (
                <BranchRenderer key={bp.branchId} branch={bp} showTechnicalLabels={showTechnicalCanonicalLabels} />
              ))}
            </g>
            {(visibleCanonicalAnnotations.inlineBranchObjects?.length ?? 0) > 0 && (
              <g className="sld-inline-branch-objects">
                {visibleCanonicalAnnotations.inlineBranchObjects!.map((obj) => (
                  <InlineBranchObjectRenderer
                    key={obj.nodeId}
                    obj={obj}
                    selected={obj.nodeId === selectedId}
                    onClick={(nodeId) => onSymbolClick(nodeId, inlineBranchElementType(obj.objectType), obj.label)}
                    onDoubleClick={(nodeId) => onSymbolDoubleClick?.(nodeId, inlineBranchElementType(obj.objectType), obj.label)}
                    showTechnicalLabels={showTechnicalCanonicalLabels}
                  />
                ))}
              </g>
            )}
            <g className="sld-junction-dots" style={{ pointerEvents: 'none' }}>
              <JunctionDotLayer annotations={visibleCanonicalAnnotations} />
            </g>
          </>
        )}
      </g>

      {/* Empty state — CANONICAL typography */}
      <EngineeringLegend width={width} height={height} />

      {symbols.length === 0 && (
        <EmptyCanvasHint width={width} height={height} onCanvasClick={onCanvasClick} />
      )}

      {interactionPreview && (
        <g data-testid="sld-preview-status-overlay">
          <rect x={12} y={12} width={360} height={24} rx={6} ry={6} fill={interactionPreview.valid ? 'rgba(22,163,74,0.18)' : 'rgba(220,38,38,0.18)'} />
          <text x={20} y={28} fontSize={12} fill={interactionPreview.valid ? '#166534' : '#991b1b'}>
            {interactionPreview.message_pl}
          </text>
        </g>
      )}
    </svg>
  );
};
