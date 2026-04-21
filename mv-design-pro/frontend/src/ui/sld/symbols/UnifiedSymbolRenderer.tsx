/**
 * UnifiedSymbolRenderer — Wspólny renderer symboli dla edytora i podglądu SLD
 *
 * PR-SLD-04: Unifikacja symboli w edytorze do standardu CANONICAL
 * PR-SLD-CANONICAL-STYLE-02: CANONICAL 1:1 Visual Parity
 *
 * CANONICAL ALIGNMENT:
 * - sldCanonicalStyle.ts: Single source of truth for visual styling
 * - canonical_symbols/*: Źródło prawdy dla kształtów symboli
 * - SymbolResolver.ts: Mapowanie element → symbol
 * - CanonicalSymbolRenderer.tsx: Komponenty SVG dla symboli CANONICAL
 *
 * BINDING CONTRACT:
 * - Edytor i podgląd używają tego samego renderera symboli
 * - Porty są spójne z definicjami w SymbolResolver.ts
 * - Fallback tylko dla nieobsłużonych typów (Load, nieznane)
 *
 * CANONICAL PARITY:
 * - Wszystkie symbole mają viewBox 0 0 100 100
 * - Stroke hierarchy: busbar > feeder > symbol > aux > leader
 * - Colors: voltage-based (WN/SN/nN) with state modifiers
 * - Symbole renderowane ze skalą względem docelowego rozmiaru
 */

import React, { useCallback } from 'react';
import type { AnySldSymbol, BranchSymbol, SwitchSymbol, Position } from '../../sld-editor/types';
import type { ElementType } from '../../types';
import type { IssueSeverity } from '../../types';
import { resolveSymbol, type ResolvedSymbol } from '../SymbolResolver';
import { CanonicalSymbol, type SwitchState } from '../CanonicalSymbolRenderer';
import {
  CANONICAL_STROKE,
  CANONICAL_STROKE_SELECTED,
  CANONICAL_SYMBOL_SIZES,
  CANONICAL_TYPOGRAPHY,
  CANONICAL_STATE_COLORS,
  CANONICAL_FILL_COLORS,
  VISUAL_HIERARCHY,
  GENERATION_COLORS,
  HOVER_STYLES,
  SELECTION_STYLES,
  getCanonicalLabelAnchor,
  getVisualHierarchyLevel,
} from '../sldCanonicalStyle';

/**
 * Dedupe cache for unknown symbol warnings.
 * Prevents DevTools spam when rendering multiple unknown elements.
 */
const _warnedSymbols = new Set<string>();

/**
 * Symbol size configuration.
 * CANONICAL symbols use viewBox 100x100, scaled to these sizes.
 * Uses CANONICAL_SYMBOL_SIZES from sldCanonicalStyle.ts as source of truth.
 */
export const SYMBOL_SIZES: Record<ElementType, { width: number; height: number }> = {
  // Istniejące typy SN (A–L)
  Bus: CANONICAL_SYMBOL_SIZES.Bus,
  LineBranch: CANONICAL_SYMBOL_SIZES.LineBranch,
  TransformerBranch: CANONICAL_SYMBOL_SIZES.TransformerBranch,
  Switch: CANONICAL_SYMBOL_SIZES.Switch,
  Source: CANONICAL_SYMBOL_SIZES.Source,
  Load: CANONICAL_SYMBOL_SIZES.Load,
  Generator: { width: 50, height: 50 },
  Measurement: { width: 36, height: 36 },
  ProtectionAssignment: { width: 36, height: 36 },
  // Nowe typy infrastruktury SN
  Terminal: { width: 20, height: 20 },
  PortBranch: { width: 30, height: 30 },
  Station: { width: 80, height: 60 },
  BranchPole: { width: 36, height: 48 },
  ZKSN: { width: 60, height: 48 },
  BaySN: { width: 60, height: 48 },
  Relay: { width: 36, height: 36 },
  SecondaryLink: { width: 50, height: 30 },
  NOP: { width: 36, height: 48 },
  // Typy nN (M–O, R–AP)
  BusNN: { width: 80, height: 16 },
  MainBreakerNN: { width: 36, height: 48 },
  FeederNN: { width: 36, height: 48 },
  SegmentNN: { width: 50, height: 30 },
  LoadNN: { width: 36, height: 44 },
  SwitchboardNN: { width: 60, height: 48 },
  SourceFieldNN: { width: 50, height: 48 },
  // Źródła nN (V–Z)
  PVInverter: { width: 50, height: 50 },
  BESSInverter: { width: 50, height: 50 },
  EnergyStorage: { width: 50, height: 50 },
  Genset: { width: 50, height: 50 },
  UPS: { width: 50, height: 50 },
  // Pomiary i zabezpieczenia nN (AA–AE)
  EnergyMeter: { width: 36, height: 36 },
  PowerQualityMeter: { width: 36, height: 36 },
  SurgeArresterNN: { width: 30, height: 44 },
  Earthing: { width: 30, height: 40 },
  MeasurementNN: { width: 36, height: 36 },
  // Infrastruktura szyn nN (AF–AR)
  AuxBus: { width: 60, height: 16 },
  ConnectionPoint: { width: 24, height: 24 },
  SwitchNN: { width: 36, height: 48 },
  ProtectionNN: { width: 36, height: 36 },
  SourceController: { width: 40, height: 40 },
  InternalJunction: { width: 16, height: 16 },
  CableJointNN: { width: 24, height: 24 },
  FaultCurrentLimiter: { width: 36, height: 48 },
  FilterCompensator: { width: 40, height: 44 },
  TelecontrolDevice: { width: 36, height: 36 },
  BusSectionNN: { width: 36, height: 48 },
  BusCouplerNN: { width: 36, height: 48 },
  ReserveLink: { width: 36, height: 48 },
  // Parametry logiczne źródeł (AS–AZ)
  SourceDisconnect: { width: 36, height: 48 },
  PowerLimit: CANONICAL_SYMBOL_SIZES.default,
  WorkProfile: CANONICAL_SYMBOL_SIZES.default,
  OperatingMode: CANONICAL_SYMBOL_SIZES.default,
  ConnectionConstraints: CANONICAL_SYMBOL_SIZES.default,
  MeteringBlock: { width: 36, height: 36 },
  SyncPoint: { width: 24, height: 24 },
  DescriptiveElement: CANONICAL_SYMBOL_SIZES.default,
};

/**
 * Visual state for symbol rendering.
 */
export interface SymbolVisualState {
  /** Whether the symbol is selected */
  selected: boolean;
  /** Whether the element is in service */
  inService: boolean;
  /** Whether the element is energized (for viewer) */
  energized?: boolean;
  /** Highlight severity (for validation issues) */
  highlightSeverity?: IssueSeverity | null;
  /** Whether the symbol is highlighted */
  highlighted?: boolean;
  /** Whether the symbol is hovered (for micro-interactions) */
  hovered?: boolean;
  /** Whether the symbol position is pinned/locked */
  pinned?: boolean;
}

/**
 * Interaction handlers for symbol.
 */
export interface SymbolInteractionHandlers {
  onMouseDown?: (symbolId: string, position: Position) => void;
  onClick?: (symbolId: string, mode: 'single' | 'add' | 'toggle') => void;
  onDoubleClick?: (symbolId: string) => void;
}

/**
 * Props for unified symbol renderer.
 */
export interface UnifiedSymbolRendererProps {
  /** Symbol to render */
  symbol: AnySldSymbol;
  /** Visual state */
  visualState: SymbolVisualState;
  /** Interaction handlers (optional, for editor) */
  handlers?: SymbolInteractionHandlers;
  /** Whether to show label */
  showLabel?: boolean;
  /** Custom label offset Y */
  labelOffsetY?: number;
}

/**
 * Get generation source color based on symbol properties.
 * Returns null if not a generation source.
 */
function getGenerationSourceColor(symbolId?: string): string | null {
  if (!symbolId) return null;

  const generationColorMap: Record<string, string> = {
    pv: GENERATION_COLORS.pv,
    fw: GENERATION_COLORS.fw,
    bess: GENERATION_COLORS.bess,
    generator: GENERATION_COLORS.generator,
    utility_feeder: GENERATION_COLORS.utility,
  };

  return generationColorMap[symbolId] ?? null;
}

/**
 * Calculate stroke color based on visual state.
 * Uses CANONICAL_STATE_COLORS from sldCanonicalStyle.ts.
 * PR-SLD-UX-MAX: Enhanced with generation source colors and hover state.
 */
function getStrokeColor(state: SymbolVisualState, resolvedSymbolId?: string): string {
  const { selected, inService, energized = true, highlighted, highlightSeverity, hovered } = state;

  // Highlight takes priority (validation issues)
  if (highlighted && highlightSeverity) {
    switch (highlightSeverity) {
      case 'HIGH':
        return CANONICAL_STATE_COLORS.error;
      case 'WARN':
        return CANONICAL_STATE_COLORS.warning;
      case 'INFO':
        return CANONICAL_STATE_COLORS.info;
    }
  }

  // Selection
  if (selected) {
    return CANONICAL_STATE_COLORS.selected;
  }

  // Out of service
  if (!inService) {
    return CANONICAL_STATE_COLORS.outOfService;
  }

  // De-energized
  if (!energized) {
    return CANONICAL_STATE_COLORS.deenergized;
  }

  // Check for generation source color (OZE/BESS differentiation)
  const generationColor = getGenerationSourceColor(resolvedSymbolId);
  if (generationColor) {
    return generationColor;
  }

  // Hover state — slightly darker
  if (hovered) {
    return '#111827'; // gray-900
  }

  // Normal energized — use default symbol color
  return CANONICAL_TYPOGRAPHY.labelColor;
}

/**
 * Calculate stroke width based on visual state and element type.
 * Uses VISUAL_HIERARCHY from sldCanonicalStyle.ts.
 * PR-SLD-UX-MAX: Uses 3-level visual hierarchy (structure/topology/detail).
 */
function getStrokeWidth(state: SymbolVisualState, elementType?: ElementType): number {
  const { selected, highlighted, highlightSeverity, hovered } = state;

  // Get visual hierarchy level for this element type
  const hierarchyLevel = getVisualHierarchyLevel(elementType ?? 'Load');
  const hierarchy = VISUAL_HIERARCHY[hierarchyLevel];

  // Base stroke from hierarchy
  const baseStroke = hierarchy.strokeWidth;

  // Highlight overrides (validation issues)
  if (highlighted && highlightSeverity) {
    return highlightSeverity === 'INFO' ? VISUAL_HIERARCHY.detail.strokeWidth : baseStroke;
  }

  // Selected gets thicker stroke
  if (selected) {
    return hierarchy.strokeWidthSelected;
  }

  // Hover gets slight increase
  if (hovered) {
    return baseStroke + HOVER_STYLES.strokeWidthIncrease;
  }

  return baseStroke;
}

/**
 * Calculate opacity based on visual state.
 * PR-SLD-UX-MAX: Includes hierarchy level opacity and hover boost.
 */
function getOpacity(state: SymbolVisualState, elementType?: ElementType): number {
  const { inService, energized = true, hovered } = state;

  // Get hierarchy level opacity
  const hierarchyLevel = getVisualHierarchyLevel(elementType ?? 'Load');
  const baseOpacity = VISUAL_HIERARCHY[hierarchyLevel].opacity;

  if (!inService) {
    return 0.5;
  }

  if (!energized) {
    return 0.7;
  }

  // Hover slightly boosts opacity (useful for detail level elements)
  if (hovered && baseOpacity < 1) {
    return Math.min(1, baseOpacity + HOVER_STYLES.opacityBoost);
  }

  return baseOpacity;
}

/**
 * Calculate fill color based on visual state.
 * Uses CANONICAL_FILL_COLORS from sldCanonicalStyle.ts.
 */
function getFillColor(state: SymbolVisualState): string {
  const { selected, energized = true, inService = true } = state;

  if (selected) {
    return CANONICAL_FILL_COLORS.selected;
  }

  if (!energized || !inService) {
    return CANONICAL_FILL_COLORS.deenergized;
  }

  return CANONICAL_FILL_COLORS.normal;
}

/**
 * CANONICAL Symbol Wrapper — applies styling and scaling.
 * Uses visual hierarchy for proper visual weight.
 * PR-SLD-UX-MAX: Enhanced with generation colors and hover interactions.
 */
const CanonicalSymbolWrapper: React.FC<{
  resolvedSymbol: ResolvedSymbol;
  visualState: SymbolVisualState;
  size: { width: number; height: number };
  elementType: ElementType;
  switchState?: SwitchState;
}> = ({ resolvedSymbol, visualState, size, elementType, switchState }) => {
  const stroke = getStrokeColor(visualState, resolvedSymbol.symbolId);
  const strokeWidth = getStrokeWidth(visualState, elementType);
  const opacity = getOpacity(visualState, elementType);
  const fill = getFillColor(visualState);

  return (
    <CanonicalSymbol
      symbolId={resolvedSymbol.symbolId}
      stroke={stroke}
      fill={fill}
      strokeWidth={strokeWidth}
      opacity={opacity}
      size={Math.max(size.width, size.height)}
      switchState={switchState}
    />
  );
};

/**
 * Load Fallback — triangle symbol for Load elements (no CANONICAL symbol).
 * Marked as FALLBACK per PR-SLD-04.
 * Uses CANONICAL typography and stroke hierarchy.
 */
const LoadFallback: React.FC<{
  visualState: SymbolVisualState;
  elementName: string;
}> = ({ visualState, elementName }) => {
  const stroke = getStrokeColor(visualState);
  const strokeWidth = visualState.selected ? CANONICAL_STROKE_SELECTED.symbol : CANONICAL_STROKE.symbol;
  const opacity = getOpacity(visualState);
  const fill = getFillColor(visualState);
  const labelAnchor = getCanonicalLabelAnchor('Load');

  return (
    <>
      {/* FALLBACK: Load triangle - brak symbolu CANONICAL */}
      <polygon
        points="0,-14 12,10 -12,10"
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        data-testid="sld-fallback-load"
        data-fallback="true"
      />
      <text
        x={labelAnchor.offsetX}
        y={labelAnchor.offsetY + 10}
        textAnchor={labelAnchor.textAnchor}
        fontFamily={CANONICAL_TYPOGRAPHY.fontFamily}
        fontSize={CANONICAL_TYPOGRAPHY.fontSize.medium}
        fontWeight={visualState.selected ? CANONICAL_TYPOGRAPHY.fontWeight.semibold : CANONICAL_TYPOGRAPHY.fontWeight.normal}
        fill={CANONICAL_TYPOGRAPHY.labelColor}
      >
        {elementName}
      </text>
    </>
  );
};

/**
 * Unknown Symbol Fallback — minimal indicator for unsupported element types.
 * Marked as FALLBACK per PR-SLD-04.
 * Uses CANONICAL colors and typography.
 */
const UnknownSymbolFallback: React.FC<{
  elementType: ElementType;
  elementName: string;
  visualState: SymbolVisualState;
}> = ({ elementType, elementName, visualState }) => {
  const stroke = visualState.selected
    ? CANONICAL_STATE_COLORS.selected
    : visualState.inService
      ? CANONICAL_STATE_COLORS.error
      : CANONICAL_STATE_COLORS.outOfService;
  const opacity = getOpacity(visualState);

  return (
    <>
      {/* FALLBACK: Unknown element - dashed circle with "?" */}
      <circle
        cx={0}
        cy={0}
        r={12}
        fill="none"
        stroke={stroke}
        strokeWidth={CANONICAL_STROKE.aux}
        opacity={opacity}
        strokeDasharray="4,2"
        data-testid="sld-fallback-unknown"
        data-fallback="true"
      />
      <text
        x={0}
        y={5}
        textAnchor="middle"
        fontFamily={CANONICAL_TYPOGRAPHY.fontFamily}
        fontSize={CANONICAL_TYPOGRAPHY.fontSize.medium}
        fontWeight={CANONICAL_TYPOGRAPHY.fontWeight.bold}
        fill={stroke}
        opacity={opacity}
      >
        ?
      </text>
      <text
        x={0}
        y={-18}
        textAnchor="middle"
        fontFamily={CANONICAL_TYPOGRAPHY.fontFamily}
        fontSize={CANONICAL_TYPOGRAPHY.fontSize.xsmall}
        fill={CANONICAL_TYPOGRAPHY.secondaryColor}
      >
        {elementType}
      </text>
      <text
        x={0}
        y={22}
        textAnchor="middle"
        fontFamily={CANONICAL_TYPOGRAPHY.fontFamily}
        fontSize={CANONICAL_TYPOGRAPHY.fontSize.small}
        fill={CANONICAL_TYPOGRAPHY.labelColor}
      >
        {elementName}
      </text>
    </>
  );
};

/**
 * Selection ring component for selected elements.
 * PR-SLD-UX-MAX: Subtle selection indicator that doesn't obscure the symbol.
 */
const SelectionRing: React.FC<{
  size: { width: number; height: number };
}> = ({ size }) => {
  const padding = SELECTION_STYLES.ringOffset;
  return (
    <rect
      x={-size.width / 2 - padding}
      y={-size.height / 2 - padding}
      width={size.width + padding * 2}
      height={size.height + padding * 2}
      fill="none"
      stroke={SELECTION_STYLES.ringColor}
      strokeWidth={SELECTION_STYLES.ringWidth}
      rx={3}
      ry={3}
      style={{ pointerEvents: 'none' }}
      data-testid="selection-ring"
    />
  );
};

/**
 * Pinned indicator for locked element positions.
 * PR-SLD-UX-MAX: Discreet signal that element position is stable.
 */
const PinnedIndicator: React.FC<{
  size: { width: number; height: number };
}> = ({ size }) => {
  const x = size.width / 2 + 4;
  const y = -size.height / 2 - 4;
  return (
    <g transform={`translate(${x}, ${y})`} style={{ pointerEvents: 'none' }}>
      <circle r={4} fill="#6B7280" />
      <path
        d="M0,-2 L0,2 M-1.5,-1 L0,-2 L1.5,-1"
        stroke="#FFFFFF"
        strokeWidth={1}
        fill="none"
      />
    </g>
  );
};

/**
 * Unified Symbol Renderer — renders any SLD symbol using CANONICAL standard.
 *
 * This is the single entry point for rendering symbols in both
 * the editor (SldCanvas) and the viewer (SLDViewCanvas).
 *
 * PR-SLD-UX-MAX: Enhanced with:
 * - 3-level visual hierarchy (structure/topology/detail)
 * - Generation source colors (OZE/BESS differentiation)
 * - Hover micro-interactions
 * - Selection ring indicator
 * - Pinned position indicator
 *
 * @example
 * ```tsx
 * <UnifiedSymbolRenderer
 *   symbol={busSymbol}
 *   visualState={{ selected: false, inService: true, energized: true }}
 *   handlers={{ onClick: handleClick }}
 * />
 * ```
 */
export const UnifiedSymbolRenderer: React.FC<UnifiedSymbolRendererProps> = ({
  symbol,
  visualState,
  handlers,
  showLabel = true,
  labelOffsetY,
}) => {
  const { position, elementType, elementName } = symbol;
  const [isHovered, setIsHovered] = React.useState(false);

  // Resolve CANONICAL symbol
  const resolvedSymbol = resolveSymbol(symbol);

  // Get symbol size
  const size = SYMBOL_SIZES[elementType] ?? { width: 40, height: 40 };

  // Calculate offset to center the symbol
  const offsetX = -size.width / 2;
  const offsetY = -size.height / 2;

  // Get visual hierarchy level for typography
  const hierarchyLevel = getVisualHierarchyLevel(elementType);
  const hierarchy = VISUAL_HIERARCHY[hierarchyLevel];

  // Merge hover state with visual state
  const effectiveVisualState: SymbolVisualState = {
    ...visualState,
    hovered: isHovered || visualState.hovered,
  };

  // Label position — uses CANONICAL anchor rules
  const labelAnchor = getCanonicalLabelAnchor(elementType);
  const defaultLabelOffsetY = -size.height / 2 + labelAnchor.offsetY;
  const finalLabelOffsetY = labelOffsetY ?? defaultLabelOffsetY;
  const finalLabelOffsetX = labelAnchor.offsetX;

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!handlers?.onMouseDown) return;
      e.stopPropagation();
      const rect = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
      const mousePosition = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      handlers.onMouseDown(symbol.id, mousePosition);
    },
    [handlers, symbol.id]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!handlers?.onClick) return;
      e.stopPropagation();
      const mode = e.shiftKey ? 'add' : e.ctrlKey || e.metaKey ? 'toggle' : 'single';
      handlers.onClick(symbol.id, mode);
    },
    [handlers, symbol.id]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!handlers?.onDoubleClick) return;
      e.stopPropagation();
      handlers.onDoubleClick(symbol.id);
    },
    [handlers, symbol.id],
  );

  // Hover handlers for micro-interactions
  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
  }, []);

  // Build data-testid attributes
  const testIdAttrs: Record<string, string> = {
    'data-testid': `sld-symbol-${symbol.id}`,
    'data-element-id': symbol.elementId ?? symbol.id,
    'data-element-name': elementName,
    'data-element-type': elementType,
    'data-hierarchy-level': hierarchyLevel,
  };

  if (resolvedSymbol) {
    testIdAttrs['data-canonical-symbol'] = resolvedSymbol.symbolId;
  }

  // Add switch-specific attributes
  if (elementType === 'Switch') {
    const switchSymbol = symbol as SwitchSymbol;
    testIdAttrs['data-switch-state'] = switchSymbol.switchState;
    testIdAttrs['data-switch-type'] = switchSymbol.switchType;
  }

  // Add branch-specific attributes
  if (elementType === 'LineBranch') {
    const branchSymbol = symbol as BranchSymbol;
    testIdAttrs['data-branch-type'] = branchSymbol.branchType ?? 'CABLE';
  }

  // Add energization state
  if (visualState.energized !== undefined) {
    testIdAttrs['data-energized'] = visualState.energized ? 'true' : 'false';
  }

  // Add hover state
  if (isHovered) {
    testIdAttrs['data-hovered'] = 'true';
  }

  const cursor = handlers?.onClick || handlers?.onMouseDown || handlers?.onDoubleClick ? 'pointer' : 'default';
  const interactive = !!(handlers?.onClick || handlers?.onMouseDown || handlers?.onDoubleClick);

  // CSS transition for smooth hover effect
  const transitionStyle = {
    cursor,
    transition: `all ${HOVER_STYLES.transitionDuration}ms ease-out`,
  };

  // Handle Load fallback (no CANONICAL symbol)
  if (elementType === 'Load') {
    return (
      <g
        {...testIdAttrs}
        transform={`translate(${position.x}, ${position.y})`}
        onMouseDown={interactive ? handleMouseDown : undefined}
        onClick={interactive ? handleClick : undefined}
        onDoubleClick={interactive ? handleDoubleClick : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={transitionStyle}
      >
        {/* Selection ring */}
        {visualState.selected && <SelectionRing size={size} />}
        <LoadFallback visualState={effectiveVisualState} elementName={elementName} />
        {/* Pinned indicator */}
        {visualState.pinned && <PinnedIndicator size={size} />}
      </g>
    );
  }

  // Handle unknown symbols (no CANONICAL mapping)
  if (!resolvedSymbol) {
    const warnKey = `${elementType}:${elementName}`;
    if (import.meta.env.DEV && !_warnedSymbols.has(warnKey)) {
      _warnedSymbols.add(warnKey);
      console.warn(`[UnifiedSymbolRenderer] Brak mapowania CANONICAL dla elementu: ${elementType} (${elementName})`);
    }
    return (
      <g
        {...testIdAttrs}
        transform={`translate(${position.x}, ${position.y})`}
        onMouseDown={interactive ? handleMouseDown : undefined}
        onClick={interactive ? handleClick : undefined}
        onDoubleClick={interactive ? handleDoubleClick : undefined}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={transitionStyle}
      >
        <UnknownSymbolFallback
          elementType={elementType}
          elementName={elementName}
          visualState={effectiveVisualState}
        />
      </g>
    );
  }

  // Get switch state for CB/DS elements
  const switchState: SwitchState | undefined =
    elementType === 'Switch'
      ? ((symbol as SwitchSymbol).switchState as SwitchState) ?? 'UNKNOWN'
      : undefined;

  // Render CANONICAL symbol
  return (
    <g
      {...testIdAttrs}
      transform={`translate(${position.x}, ${position.y})`}
      onMouseDown={interactive ? handleMouseDown : undefined}
      onClick={interactive ? handleClick : undefined}
      onDoubleClick={interactive ? handleDoubleClick : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={transitionStyle}
    >
      {/* Selection ring (behind symbol) */}
      {visualState.selected && <SelectionRing size={size} />}

      {/* CANONICAL Symbol centered */}
      <g transform={`translate(${offsetX}, ${offsetY})`}>
        <CanonicalSymbolWrapper
          resolvedSymbol={resolvedSymbol}
          visualState={effectiveVisualState}
          size={size}
          elementType={elementType}
          switchState={switchState}
        />
      </g>

      {/* Label — uses visual hierarchy typography */}
      {showLabel && (
        <text
          x={finalLabelOffsetX}
          y={finalLabelOffsetY}
          textAnchor={labelAnchor.textAnchor}
          fontFamily={CANONICAL_TYPOGRAPHY.fontFamily}
          fontSize={hierarchy.labelFontSize}
          fontWeight={visualState.selected ? CANONICAL_TYPOGRAPHY.fontWeight.semibold : hierarchy.labelFontWeight}
          fill={CANONICAL_TYPOGRAPHY.labelColor}
          style={{ pointerEvents: 'none', transition: `all ${HOVER_STYLES.transitionDuration}ms ease-out` }}
        >
          {elementName}
        </text>
      )}

      {/* Pinned indicator */}
      {visualState.pinned && <PinnedIndicator size={size} />}
    </g>
  );
};

/**
 * Render symbol function — single entry point for symbol rendering.
 *
 * This is the unified API for rendering symbols, to be used by both
 * the editor and the viewer.
 *
 * @param options - Rendering options
 * @returns JSX element
 */
export function renderSymbol(options: {
  symbol: AnySldSymbol;
  selected: boolean;
  inService: boolean;
  energized?: boolean;
  highlighted?: boolean;
  highlightSeverity?: IssueSeverity | null;
  onMouseDown?: (symbolId: string, position: Position) => void;
  onClick?: (symbolId: string, mode: 'single' | 'add' | 'toggle') => void;
  onDoubleClick?: (symbolId: string) => void;
  showLabel?: boolean;
}): React.ReactElement {
  const {
    symbol,
    selected,
    inService,
    energized,
    highlighted,
    highlightSeverity,
    onMouseDown,
    onClick,
    onDoubleClick,
    showLabel,
  } = options;

  const visualState: SymbolVisualState = {
    selected,
    inService,
    energized,
    highlighted,
    highlightSeverity,
  };

  const handlers: SymbolInteractionHandlers | undefined =
    onMouseDown || onClick || onDoubleClick ? { onMouseDown, onClick, onDoubleClick } : undefined;

  return (
    <UnifiedSymbolRenderer
      key={symbol.id}
      symbol={symbol}
      visualState={visualState}
      handlers={handlers}
      showLabel={showLabel}
    />
  );
}

export default UnifiedSymbolRenderer;
