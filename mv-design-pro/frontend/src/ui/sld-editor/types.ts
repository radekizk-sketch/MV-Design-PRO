/**
 * P30b — SLD Editor Types
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § A: Bijection: Symbol ↔ Model Object
 * - sld_rules.md § E: Interaction Patterns (selection, drag, etc.)
 * - ui_canonical_parity.md: ≥110% Canonical editing experience
 *
 * FEATURES:
 * - Multi-select (Shift+klik, Ctrl+klik, lasso)
 * - Drag single/group
 * - Copy/paste/duplicate
 * - Align & distribute
 * - Snap-to-grid
 * - Full UNDO/REDO integration (P30a)
 */

import type { ElementType } from '../types';

/**
 * SLD Symbol position (x, y coordinates in pixels).
 */
export interface Position {
  x: number;
  y: number;
}

/**
 * Bounding box for symbols (used for align/distribute/lasso).
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * SLD Symbol base interface.
 * Maps 1:1 to NetworkModel element (bijection per sld_rules.md § A.1).
 */
export interface SldSymbol {
  /** Unique symbol ID */
  id: string;

  /** Element ID in NetworkModel (bijection) */
  elementId: string;

  /** Element type (Bus, LineBranch, etc.) */
  elementType: ElementType;

  /** Element name (for display) */
  elementName: string;

  /** Position on canvas (pixels) */
  position: Position;

  /** Visual state (grayed if false) */
  inService: boolean;

  /** Selected state (UI only) */
  selected?: boolean;
}

/**
 * Bus symbol (horizontal bar).
 */
export interface BusSymbol extends SldSymbol {
  elementType: 'Bus';
  width: number; // busbar width
  height: number; // busbar height
}

/** @deprecated Use BusSymbol instead. */
export type NodeSymbol = BusSymbol;

/**
 * Branch type for LineBranch elements.
 * LINE = linia napowietrzna (overhead line) - solid stroke
 * CABLE = linia kablowa (underground cable) - dashed stroke
 */
export type BranchType = 'LINE' | 'CABLE';

/**
 * Branch symbol (line/cable/transformer).
 */
export interface BranchSymbol extends SldSymbol {
  elementType: 'LineBranch' | 'TransformerBranch';
  fromNodeId: string;
  toNodeId: string;
  points: Position[]; // polyline points
  /** Typ gałęzi dla LineBranch (LINE = napowietrzna, CABLE = kablowa) */
  branchType?: BranchType;
}

/**
 * Switch symbol.
 */
export interface SwitchSymbol extends SldSymbol {
  elementType: 'Switch';
  fromNodeId: string;
  toNodeId: string;
  switchState: 'OPEN' | 'CLOSED';
  switchType: 'BREAKER' | 'DISCONNECTOR' | 'LOAD_SWITCH' | 'FUSE';
}

/**
 * Source symbol (grid connection, PV, wind, BESS).
 */
export interface SourceSymbol extends SldSymbol {
  elementType: 'Source';
  connectedToNodeId: string;
}

/**
 * Load symbol.
 */
export interface LoadSymbol extends SldSymbol {
  elementType: 'Load';
  connectedToNodeId: string;
}

/**
 * Generator symbol (PV, BESS, Wind, Genset).
 */
export interface GeneratorSymbol extends SldSymbol {
  elementType: 'Generator';
  connectedToNodeId: string;
}

/**
 * Measurement symbol (CT / VT).
 */
export interface MeasurementSymbol extends SldSymbol {
  elementType: 'Measurement';
  connectedToNodeId: string;
}

/**
 * Protection / Relay symbol.
 */
export interface ProtectionSymbol extends SldSymbol {
  elementType: 'ProtectionAssignment' | 'Relay';
  connectedToNodeId: string;
}

/**
 * Union of all symbol types.
 */
export type AnySldSymbol =
  | BusSymbol
  | BranchSymbol
  | SwitchSymbol
  | SourceSymbol
  | LoadSymbol
  | GeneratorSymbol
  | MeasurementSymbol
  | ProtectionSymbol;

/**
 * Selection mode.
 */
export type SelectionMode = 'single' | 'add' | 'toggle';

/**
 * Drag state (tracks active drag operation).
 */
export interface DragState {
  /** Symbols being dragged */
  symbolIds: string[];

  /** Original positions before drag (for undo) */
  originalPositions: Map<string, Position>;

  /** Current drag offset */
  offset: Position;

  /** Drag start position (canvas coords) */
  startPosition: Position;
}

/**
 * Lasso selection state (drag-rectangle).
 */
export interface LassoState {
  /** Lasso start position (canvas coords) */
  startPosition: Position;

  /** Lasso current position (canvas coords) */
  currentPosition: Position;

  /** Active lasso selection */
  active: boolean;
}

/**
 * Grid configuration.
 */
export interface GridConfig {
  /** Grid size in pixels */
  size: number;

  /** Grid visible */
  visible: boolean;

  /** Snap to grid enabled */
  snapEnabled: boolean;
}

/**
 * Align direction.
 */
export type AlignDirection = 'left' | 'right' | 'top' | 'bottom' | 'center-horizontal' | 'center-vertical';

/**
 * Distribute direction.
 */
export type DistributeDirection = 'horizontal' | 'vertical';

/**
 * Snapshot symbolu w schowku (bez referencji do modelu).
 * Zawiera wszystkie dane potrzebne do odtworzenia symbolu przy wklejeniu.
 */
export interface ClipboardSymbolSnapshot {
  /** Oryginalny ID symbolu (do mapowania połączeń wewnętrznych) */
  originalSymbolId: string;

  /** Oryginalny elementId (do mapowania referencji) */
  originalElementId: string;

  /** Typ elementu */
  elementType: ElementType;

  /** Nazwa elementu */
  elementName: string;

  /** Pozycja względna (względem referencePoint) */
  relativePosition: Position;

  /** Czy w służbie */
  inService: boolean;

  /** Dodatkowe właściwości specyficzne dla typu */
  typeSpecificProps: Record<string, unknown>;
}

/**
 * Połączenie wewnętrzne w schowku.
 * Łączy elementy WEWNĄTRZ zestawu wklejanego (nie do zewnętrznych).
 *
 * PR-SLD-03b: Używamy elementId (nie symbolId) jako podstawy odtwarzania połączeń.
 * To zapewnia poprawne odtworzenie połączeń nawet gdy symbolId się zmienia.
 */
export interface ClipboardInternalConnection {
  /** Oryginalny elementId węzła (Bus) */
  fromOriginalElementId: string;

  /** Oryginalny elementId elementu łączącego (Branch, Switch, Source, Load) */
  toOriginalElementId: string;

  /** Typ połączenia (określa które pole ustawić) */
  connectionType: 'fromNodeId' | 'toNodeId' | 'connectedToNodeId';
}

/**
 * Clipboard data (for copy/paste).
 *
 * CANONICAL-STANDARD (N-03):
 * - Schowek przechowuje "snapshot" symboli (bez referencji do elementów modelu)
 * - Wklejenie tworzy NOWE elementy modelu + NOWE symbole
 * - Połączenia wewnętrzne są odtwarzane (między wklejanymi elementami)
 * - Połączenia zewnętrzne NIE są odtwarzane (wymaga ręcznego podłączenia)
 */
export interface ClipboardData {
  /** Snapshoty symboli w schowku */
  symbolSnapshots: ClipboardSymbolSnapshot[];

  /** Połączenia wewnętrzne (między symbolami w schowku) */
  internalConnections: ClipboardInternalConnection[];

  /** Punkt odniesienia (środek zaznaczenia) */
  referencePoint: Position;

  /** DEPRECATED: Stara lista symboli (dla kompatybilności wstecznej) */
  symbols: AnySldSymbol[];

  /** DEPRECATED: Timestamp (nie używany w nowym mechanizmie) */
  timestamp: number;
}

/**
 * Toolbar action type.
 */
export type ToolbarAction =
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'align-left'
  | 'align-right'
  | 'align-top'
  | 'align-bottom'
  | 'align-center-h'
  | 'align-center-v'
  | 'distribute-h'
  | 'distribute-v'
  | 'toggle-grid'
  | 'toggle-snap';

// =============================================================================
// CONNECTION CREATION STATE (PR-SLD-05)
// =============================================================================

/**
 * Stan tworzenia polaczenia port-to-port (CANONICAL-style).
 *
 * PR-SLD-05: Polaczenia tworzy sie WYLACZNIE przez klikniecie port A -> port B.
 * Brak swobodnego rysowania linii.
 */
export interface ConnectionCreationState {
  /** Port zrodlowy (klikniety jako pierwszy) */
  fromPort: {
    symbolId: string;
    portName: PortName;
    position: Position;
    elementId: string;
  };
  /** Aktualna pozycja kursora (dla podgladu linii) */
  currentMousePosition: Position;
  /** Port docelowy w zasiegu snap (null jesli brak) */
  targetPort: {
    symbolId: string;
    portName: PortName;
    position: Position;
    elementId: string;
  } | null;
}

/**
 * Stan snap do portu podczas przeciagania (PR-SLD-05).
 */
export interface PortSnapState {
  /** Port przeciaganego symbolu ktory jest w zasiegu snap */
  sourcePort: {
    symbolId: string;
    portName: PortName;
    position: Position;
  };
  /** Port docelowy do ktorego nastapi snap */
  targetPort: {
    symbolId: string;
    portName: PortName;
    position: Position;
  };
}

/**
 * Komunikat statusu dla uzytkownika (pasek statusu).
 */
export interface StatusMessage {
  /** Tresc komunikatu po polsku */
  text: string;
  /** Typ komunikatu */
  type: 'info' | 'warning' | 'error';
  /** Czas wyswietlenia w ms (null = bez limitu) */
  duration: number | null;
}

// =============================================================================
// CONNECTION TYPES (N-01, N-05)
// =============================================================================

/**
 * Port name for connection endpoints.
 */
export type PortName = 'top' | 'bottom' | 'left' | 'right';

/**
 * Connection between two symbol ports (port-to-port).
 * Per SLD_KANONICZNA_SPECYFIKACJA.md § 4: Polaczenia.
 */
export interface Connection {
  /** Unique connection ID */
  id: string;

  /** Source symbol ID */
  fromSymbolId: string;

  /** Source port name */
  fromPortName: PortName;

  /** Target symbol ID */
  toSymbolId: string;

  /** Target port name */
  toPortName: PortName;

  /** Path points (orthogonal polyline) */
  path: Position[];

  /** Element ID in NetworkModel (for highlighting) */
  elementId?: string;

  /** Connection type (for styling) */
  connectionType?: 'branch' | 'switch' | 'source' | 'load';

  /**
   * Styl wizualny połączenia — widokowy (nie domenowy).
   * 'ring' = linia przerywana (połączenie ringowe w układzie pętlowym)
   * 'default' = linia ciągła
   *
   * Industrial Aesthetics Contract §1.7: ring = 2px przerywana
   */
  connectionStyle?: 'ring' | 'default';
}
