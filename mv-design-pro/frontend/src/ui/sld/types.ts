/**
 * SLD Read-Only Viewer Types
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § A: Symbol ↔ Model bijection
 * - ui_canonical_parity.md: Canonical-like presentation
 *
 * READ-ONLY viewer types — no editing, no drag/drop.
 * Reuses core types from sld-editor for symbol definitions.
 */

import type { ElementType, SelectedElement } from '../types';
import type { AnySldSymbol, Connection as RenderConnection, Position } from '../sld-editor/types';
import type { CanonicalAnnotationsV1 } from './core/layoutResult';
import { CANONICAL_GEOMETRY } from './sldCanonicalStyle';

export type InteractionPortRole =
  | 'TRUNK_IN'
  | 'TRUNK_OUT'
  | 'BRANCH_OUT'
  | 'RING'
  | 'NN_SOURCE'
  | 'BAY_SN_IN'
  | 'BAY_SN_OUT'
  | 'BAY_SN_TRANSFORMER'
  | 'SEGMENT_SN_IN'
  | 'SEGMENT_SN_OUT'
  | 'TRANSFORMER_SN'
  | 'TRANSFORMER_NN'
  | 'LV_FEEDER_OUT'
  | 'SOURCE_AC'
  | 'SOURCE_DC'
  | 'ZKSN_MAIN_IN'
  | 'ZKSN_MAIN_OUT'
  | 'ZKSN_BRANCH_OUT'
  | 'POLE_MAIN_IN'
  | 'POLE_MAIN_OUT'
  | 'POLE_BRANCH_OUT';

export interface SegmentInteractionTarget {
  segment_ref: string;
  edge_id: string;
  from_ref: string;
  to_ref: string;
  segment_kind: 'TRUNK' | 'BRANCH' | 'RING' | 'SECONDARY';
}

export interface InteractionPreviewState {
  target_kind: 'canvas' | 'element' | 'segment' | 'port';
  target_id: string;
  valid: boolean;
  message_pl: string;
  port_role?: InteractionPortRole;
}

/**
 * Viewport state for pan/zoom.
 */
export interface ViewportState {
  /** Pan offset X (pixels) */
  offsetX: number;
  /** Pan offset Y (pixels) */
  offsetY: number;
  /** Zoom level (1.0 = 100%) */
  zoom: number;
}

/**
 * SLD View props.
 */
export interface SLDViewProps {
  /** Symbols to render */
  symbols: AnySldSymbol[];

  /** Kanoniczne połączenia wynikające z pipeline layoutu. */
  connections?: RenderConnection[];

  /** Currently selected element (from URL/store) */
  selectedElement?: SelectedElement | null;

  /** Callback when element is clicked */
  onElementClick?: (element: SelectedElement) => void;

  /** Callback when kliknięto tło canvasu */
  onCanvasClick?: () => void;

  /** Callback when najechano na element */
  onElementHover?: (element: SelectedElement | null) => void;

  /** Callback when kliknięto port semantyczny elementu */
  onPortClick?: (target: SelectedElement, role: InteractionPortRole) => void;
  onPortHover?: (target: SelectedElement | null, role: InteractionPortRole | null) => void;

  /** Callback when kliknięto segment/połączenie */
  onSegmentClick?: (segment: SegmentInteractionTarget) => void;

  /** Callback when hover na segmencie */
  onSegmentHover?: (segment: SegmentInteractionTarget | null) => void;

  /** Show grid background */
  showGrid?: boolean;

  /** Canvas width (px) */
  width?: number;

  /** Canvas height (px) */
  height?: number;

  /** Initial zoom level */
  initialZoom?: number;

  /** Fit to content on mount */
  fitOnMount?: boolean;

  /** Callback uruchamiający obliczenia (BLOK 8 — przycisk Oblicz) */
  onCalculateClick?: () => void;

  /** Minimalne powiększenie przy auto-dopasowaniu (zapobiega miniaturyzacji). */
  minFitZoom?: number;

  /** Padding [px] używany przy auto-dopasowaniu. */
  fitPadding?: number;

  /** Kanoniczne adnotacje geometrii (GPZ/trunk/branch/stacje). */
  canonicalAnnotations?: CanonicalAnnotationsV1 | null;

  /** Podgląd walidacyjny aktywnego narzędzia na płótnie */
  interactionPreview?: InteractionPreviewState | null;
}

/**
 * SLD View Canvas props (internal).
 */
export interface SLDViewCanvasProps {
  /** Symbols to render */
  symbols: AnySldSymbol[];

  /** Kanoniczne połączenia wynikające z pipeline layoutu. */
  connections?: RenderConnection[];

  /** Selected symbol ID */
  selectedId: string | null;

  /** Callback when symbol is clicked */
  onSymbolClick: (symbolId: string, elementType: ElementType, elementName: string) => void;

  /** Callback when symbol is double-clicked */
  onSymbolDoubleClick?: (symbolId: string, elementType: ElementType, elementName: string) => void;

  /** Callback when symbol is hovered */
  onSymbolHover?: (symbolId: string | null, elementType?: ElementType, elementName?: string) => void;

  /** Callback when kliknięto tło */
  onCanvasClick?: () => void;

  /** Callback when kliknięto port symbolu */
  onPortClick?: (symbolId: string, elementType: ElementType, elementName: string, role: InteractionPortRole) => void;
  onPortHover?: (symbolId: string | null, elementType?: ElementType, elementName?: string, role?: InteractionPortRole) => void;

  /** Callback when kliknięto segment połączenia */
  onSegmentClick?: (segment: SegmentInteractionTarget) => void;

  /** Callback when hover na segmencie */
  onSegmentHover?: (segment: SegmentInteractionTarget | null) => void;

  /** Aktualnie zaznaczony segment */
  selectedConnectionId?: string | null;

  /** Podgląd walidacyjny aktywnego narzędzia */
  interactionPreview?: InteractionPreviewState | null;

  /** Viewport state */
  viewport: ViewportState;

  /** Show grid */
  showGrid: boolean;

  /** Canvas width */
  width: number;

  /** Canvas height */
  height: number;

  /** Canonical SLD annotations (Phase 7 output, optional) */
  canonicalAnnotations?: CanonicalAnnotationsV1 | null;

  /**
   * Elementy podświetlone przez gotowość inżynieryjną (readiness blockers).
   * Klucz: elementId/symbolId, wartość: severity ('HIGH' | 'WARN' | 'INFO').
   * Symbole z tego zbioru renderują się z kolorową obwódką walidacji.
   */
  highlightedElements?: ReadonlyMap<string, 'HIGH' | 'WARN' | 'INFO'>;
}

/**
 * Zoom constraints.
 */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3.0;
export const ZOOM_STEP = 0.1;

/**
 * Default viewport state.
 */
export const DEFAULT_VIEWPORT: ViewportState = {
  offsetX: 0,
  offsetY: 0,
  zoom: 1.0,
};

/**
 * Calculate bounding box of all symbols.
 */
export function calculateSymbolsBounds(symbols: AnySldSymbol[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} | null {
  if (symbols.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const includePoint = (point: Position, paddingX: number, paddingY: number) => {
    minX = Math.min(minX, point.x - paddingX);
    minY = Math.min(minY, point.y - paddingY);
    maxX = Math.max(maxX, point.x + paddingX);
    maxY = Math.max(maxY, point.y + paddingY);
  };

  for (const symbol of symbols) {
    const { x, y } = symbol.position;
    // Account for symbol size (approximate)
    const halfWidth = symbol.elementType === 'Bus' ? 40 : 20;
    const halfHeight = symbol.elementType === 'Bus' ? 10 : 20;

    includePoint({ x, y }, halfWidth, halfHeight);

  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculate viewport to fit all symbols with padding.
 */
export function fitToContent(
  symbols: AnySldSymbol[],
  canvasWidth: number,
  canvasHeight: number,
  padding: number = CANONICAL_GEOMETRY.view.fitPaddingPx,
  minZoom: number = ZOOM_MIN
): ViewportState {
  const bounds = calculateSymbolsBounds(symbols);
  if (!bounds) return DEFAULT_VIEWPORT;

  const { minX, minY } = bounds;
  const width = Math.max(bounds.width, 1);
  const height = Math.max(bounds.height, 1);

  // Calculate zoom to fit content
  const scaleX = (canvasWidth - 2 * padding) / width;
  const scaleY = (canvasHeight - 2 * padding) / height;
  const zoom = Math.min(scaleX, scaleY, ZOOM_MAX);
  const clampedZoom = Math.max(zoom, minZoom);
  const roundedZoom = Math.round(clampedZoom * 100) / 100;

  // Calculate offset to center content
  const offsetX = padding - minX * roundedZoom + (canvasWidth - width * roundedZoom - 2 * padding) / 2;
  const offsetY = padding - minY * roundedZoom + (canvasHeight - height * roundedZoom - 2 * padding) / 2;

  return {
    offsetX: Math.round(offsetX),
    offsetY: Math.round(offsetY),
    zoom: roundedZoom,
  };
}
