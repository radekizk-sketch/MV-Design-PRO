/**
 * P30b — SLD Editor Store (Zustand)
 *
 * CANONICAL ALIGNMENT:
 * - sld_rules.md § E.1: Selection patterns (deterministic ordering)
 * - ui_canonical_parity.md: ≥110% Canonical UX
 *
 * SINGLE SOURCE OF TRUTH for:
 * - All SLD symbols (nodes, branches, switches, sources, loads)
 * - Multi-select state (selectedIds - ALWAYS SORTED)
 * - Drag state (active drag, offsets)
 * - Clipboard (copy/paste)
 * - Grid config (visible, snap enabled, size)
 *
 * INVARIANTS:
 * - selectedIds ALWAYS sorted alphabetically (determinism)
 * - Drag operations work on groups
 * - All mutations go through actions (UNDO/REDO compatible)
 */

import { create } from 'zustand';
import type {
  AnySldSymbol,
  ClipboardData,
  ClipboardInternalConnection,
  ClipboardSymbolSnapshot,
  DragState,
  GridConfig,
  LassoState,
  Position,
  SelectionMode,
  BranchSymbol,
  SwitchSymbol,
  SourceSymbol,
  LoadSymbol,
  NodeSymbol,
  ConnectionCreationState,
  PortSnapState,
  StatusMessage,
  PortName,
} from './types';
import type { IssueSeverity } from '../types';
import type {
  CadOverridesDocument,
  CadOverridesIdSet,
  CadOverridesStatusReport,
  GeometryMode
} from './cad/geometryContract';
import { evaluateCadOverridesStatus } from './cad/geometryContract';
import { generatePasteIdentifiers } from './utils/deterministicId';
import { computeTopologyHash } from './hooks/useAutoLayout';
import { generateConnections } from './utils/connectionRouting';
import { featureFlags } from '../config/featureFlags';

/**
 * Default grid configuration.
 */
const DEFAULT_GRID_CONFIG: GridConfig = {
  size: 20, // 20px grid
  visible: true,
  snapEnabled: true,
};

function snapToGridRaw(position: Position, size: number): Position {
  return {
    x: Math.round(position.x / size) * size,
    y: Math.round(position.y / size) * size,
  };
}

function sortRecordKeys<T>(record: Record<string, T>): Record<string, T> {
  return Object.keys(record)
    .sort()
    .reduce<Record<string, T>>((acc, key) => {
      acc[key] = record[key];
      return acc;
    }, {});
}

function buildCadIdSet(symbols: AnySldSymbol[]): CadOverridesIdSet {
  const connections = generateConnections(symbols);
  return {
    nodes: symbols.map((symbol) => symbol.id),
    edges: connections.map((connection) => connection.id),
    labels: [],
  };
}

function buildCadOverridesDocument(
  mode: GeometryMode,
  baseFingerprint: string,
  existing?: CadOverridesDocument | null
): CadOverridesDocument {
  if (existing) {
    return {
      ...existing,
      mode,
      updatedAt: new Date().toISOString(),
    };
  }

  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    mode,
    baseFingerprint,
    createdAt: now,
    updatedAt: now,
    nodes: {},
    edges: {},
    labels: {},
  };
}

function findInsertIndexForBend(path: Position[], point: Position): number {
  if (path.length < 2) return 0;
  let bestIndex = path.length - 1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    const distance = distancePointToSegment(point, a, b);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i + 1;
    }
  }

  return Math.max(0, bestIndex - 1);
}

function distancePointToSegment(point: Position, a: Position, b: Position): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const projX = a.x + clamped * dx;
  const projY = a.y + clamped * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

/**
 * SLD Editor state interface.
 */
interface SldEditorState {
  // ===== SYMBOLS =====
  /** All symbols on canvas (keyed by symbol id) */
  symbols: Map<string, AnySldSymbol>;

  // ===== SELECTION (MULTI-SELECT) =====
  /** Selected symbol IDs (ALWAYS SORTED for determinism) */
  selectedIds: string[];

  // ===== HIGHLIGHT (P30d: Issue Panel) =====
  /** Highlighted symbol IDs (for Issue Panel navigation) */
  highlightedIds: string[];
  /** Highlight severity (determines color: HIGH=red, WARN=yellow, INFO=blue) */
  highlightSeverity: IssueSeverity | null;

  // ===== DRAG =====
  /** Active drag state (null if no drag) */
  dragState: DragState | null;

  // ===== LASSO =====
  /** Active lasso selection state */
  lassoState: LassoState | null;

  // ===== CLIPBOARD =====
  /** Clipboard data (for copy/paste) */
  clipboard: ClipboardData | null;

  // ===== GRID =====
  /** Grid configuration */
  gridConfig: GridConfig;

  // ===== CONNECTION CREATION (PR-SLD-05) =====
  /** Stan tworzenia polaczenia port-to-port */
  connectionCreationState: ConnectionCreationState | null;

  // ===== PORT SNAP (PR-SLD-05) =====
  /** Stan snap do portu podczas przeciagania */
  portSnapState: PortSnapState | null;

  // ===== STATUS MESSAGE (PR-SLD-05) =====
  /** Komunikat dla uzytkownika */
  statusMessage: StatusMessage | null;

  // ===== HOVER STATE (PR-SLD-05) =====
  /** ID portu pod kursorem (dla podswietlenia) */
  hoveredPortId: string | null;

  // ===== CONNECTION SELECTION (CAD) =====
  /** Zaznaczone polaczenie (dla edycji lamanych) */
  selectedConnectionId: string | null;
  /** Ostatnia pozycja klikniecia na polaczeniu */
  lastConnectionClickPosition: Position | null;
  /** Sciezka zaznaczonego polaczenia */
  selectedConnectionPath: Position[] | null;
  /** Zaznaczony indeks punktu lamanej */
  selectedBendIndex: number | null;

  // ===== CAD OVERRIDES =====
  /** Tryb geometrii (AUTO / CAD / HYBRID) */
  geometryMode: GeometryMode;
  /** Dokument overrides CAD */
  cadOverridesDocument: CadOverridesDocument | null;
  /** Status audytu overrides */
  cadOverridesStatus: CadOverridesStatusReport | null;

  // ===== ACTIONS: SYMBOLS =====
  setSymbols: (symbols: AnySldSymbol[]) => void;
  addSymbol: (symbol: AnySldSymbol) => void;
  removeSymbol: (symbolId: string) => void;
  updateSymbolPosition: (symbolId: string, position: Position) => void;
  updateSymbolsPositions: (updates: Map<string, Position>) => void;

  // ===== ACTIONS: SELECTION =====
  selectSymbol: (symbolId: string, mode: SelectionMode) => void;
  selectMultiple: (symbolIds: string[]) => void;
  clearSelection: () => void;
  selectAll: () => void;
  getSelectedSymbols: () => AnySldSymbol[];

  // ===== ACTIONS: HIGHLIGHT (P30d) =====
  highlightSymbols: (symbolIds: string[], severity: IssueSeverity) => void;
  clearHighlight: () => void;

  // ===== ACTIONS: DRAG =====
  startDrag: (symbolIds: string[], startPosition: Position) => void;
  updateDrag: (currentPosition: Position) => void;
  endDrag: () => Map<string, { old: Position; new: Position }> | null;
  cancelDrag: () => void;

  // ===== ACTIONS: LASSO =====
  startLasso: (startPosition: Position) => void;
  updateLasso: (currentPosition: Position) => void;
  endLasso: () => void;
  getSymbolsInLasso: () => string[];

  // ===== ACTIONS: CLIPBOARD =====
  copySelection: () => void;
  pasteFromClipboard: (offset: Position) => AnySldSymbol[];
  duplicateSelection: () => AnySldSymbol[];

  // ===== ACTIONS: GRID =====
  toggleGridVisible: () => void;
  toggleSnapEnabled: () => void;
  setGridSize: (size: number) => void;
  snapToGrid: (position: Position) => Position;

  // ===== ACTIONS: CONNECTION CREATION (PR-SLD-05) =====
  /** Rozpocznij tworzenie polaczenia z danego portu */
  startConnectionCreation: (
    symbolId: string,
    portName: PortName,
    position: Position,
    elementId: string
  ) => void;
  /** Aktualizuj pozycje kursora podczas tworzenia polaczenia */
  updateConnectionCreation: (
    mousePosition: Position,
    targetPort: ConnectionCreationState['targetPort']
  ) => void;
  /** Zatwierdz polaczenie do portu docelowego */
  confirmConnection: () => { fromPort: ConnectionCreationState['fromPort']; toPort: NonNullable<ConnectionCreationState['targetPort']> } | null;
  /** Anuluj tworzenie polaczenia */
  cancelConnectionCreation: () => void;
  /** Czy tryb tworzenia polaczenia jest aktywny */
  isConnectionCreationActive: () => boolean;

  // ===== ACTIONS: PORT SNAP (PR-SLD-05) =====
  /** Ustaw stan snap do portu */
  setPortSnapState: (state: PortSnapState | null) => void;

  // ===== ACTIONS: STATUS MESSAGE (PR-SLD-05) =====
  /** Ustaw komunikat statusu */
  setStatusMessage: (message: StatusMessage | null) => void;
  /** Ustaw komunikat bledu (skrot) */
  showError: (text: string) => void;
  /** Ustaw komunikat informacyjny (skrot) */
  showInfo: (text: string) => void;

  // ===== ACTIONS: HOVER STATE (PR-SLD-05) =====
  /** Ustaw port pod kursorem */
  setHoveredPort: (portId: string | null) => void;

  // ===== ACTIONS: CONNECTION SELECTION (CAD) =====
  setSelectedConnection: (connectionId: string | null, clickPosition?: Position | null, path?: Position[] | null) => void;
  setSelectedBendIndex: (index: number | null) => void;

  // ===== ACTIONS: CAD OVERRIDES =====
  setGeometryMode: (mode: GeometryMode) => void;
  setCadOverridesDocument: (doc: CadOverridesDocument | null) => void;
  setCadOverridesStatus: (report: CadOverridesStatusReport | null) => void;
  updateCadNodeOverride: (symbolId: string, position: Position) => void;
  updateCadNodeOverrides: (updates: Map<string, Position>) => void;
  addCadEdgeBend: (edgeId: string, position: Position, path?: Position[] | null) => void;
  updateCadEdgeBend: (edgeId: string, index: number, position: Position) => void;
  removeCadEdgeBend: (edgeId: string, index: number) => void;
  resetCadOverrideForNode: (symbolId: string) => void;
  resetCadOverrideForEdge: (edgeId: string) => void;
  resetAllCadOverrides: () => void;

  // ===== HELPERS =====
  getSymbol: (symbolId: string) => AnySldSymbol | undefined;
  hasSelection: () => boolean;
  getSelectionCount: () => number;
}

/**
 * Zustand store for SLD editor state.
 */
export const useSldEditorStore = create<SldEditorState>()((set, get) => ({
  // Initial state
  symbols: new Map(),
  selectedIds: [],
  highlightedIds: [],
  highlightSeverity: null,
  dragState: null,
  lassoState: null,
  clipboard: null,
  gridConfig: DEFAULT_GRID_CONFIG,
  // PR-SLD-05: Connection creation state
  connectionCreationState: null,
  portSnapState: null,
  statusMessage: null,
  hoveredPortId: null,
  selectedConnectionId: null,
  lastConnectionClickPosition: null,
  selectedConnectionPath: null,
  selectedBendIndex: null,
  geometryMode: 'AUTO',
  cadOverridesDocument: null,
  cadOverridesStatus: null,

  // ===== SYMBOLS =====

  setSymbols: (symbols: AnySldSymbol[]) => {
    const symbolsMap = new Map(symbols.map((s) => [s.id, s]));
    set({ symbols: symbolsMap });
  },

  addSymbol: (symbol: AnySldSymbol) => {
    set((state) => {
      const newSymbols = new Map(state.symbols);
      newSymbols.set(symbol.id, symbol);
      return { symbols: newSymbols };
    });
  },

  removeSymbol: (symbolId: string) => {
    set((state) => {
      const newSymbols = new Map(state.symbols);
      newSymbols.delete(symbolId);
      // Remove from selection if selected
      const newSelectedIds = state.selectedIds.filter((id) => id !== symbolId);
      return {
        symbols: newSymbols,
        selectedIds: newSelectedIds,
      };
    });
  },

  updateSymbolPosition: (symbolId: string, position: Position) => {
    set((state) => {
      const symbol = state.symbols.get(symbolId);
      if (!symbol) return state;

      const newSymbols = new Map(state.symbols);
      newSymbols.set(symbolId, { ...symbol, position });
      return { symbols: newSymbols };
    });
  },

  updateSymbolsPositions: (updates: Map<string, Position>) => {
    set((state) => {
      const newSymbols = new Map(state.symbols);
      updates.forEach((position, symbolId) => {
        const symbol = state.symbols.get(symbolId);
        if (symbol) {
          newSymbols.set(symbolId, { ...symbol, position });
        }
      });
      return { symbols: newSymbols };
    });
  },

  // ===== SELECTION =====

  selectSymbol: (symbolId: string, mode: SelectionMode) => {
    set((state) => {
      const { selectedIds } = state;

      let newSelectedIds: string[];
      if (mode === 'single') {
        // Single select: replace selection
        newSelectedIds = [symbolId];
      } else if (mode === 'add') {
        // Add to selection (Shift+click)
        if (!selectedIds.includes(symbolId)) {
          newSelectedIds = [...selectedIds, symbolId];
        } else {
          newSelectedIds = selectedIds;
        }
      } else {
        // Toggle (Ctrl/Cmd+click)
        if (selectedIds.includes(symbolId)) {
          newSelectedIds = selectedIds.filter((id) => id !== symbolId);
        } else {
          newSelectedIds = [...selectedIds, symbolId];
        }
      }

      // DETERMINISM: Always sort selected IDs
      newSelectedIds.sort();

      return { selectedIds: newSelectedIds };
    });
  },

  selectMultiple: (symbolIds: string[]) => {
    set(() => {
      // DETERMINISM: Sort selected IDs
      const sorted = [...symbolIds].sort();
      return { selectedIds: sorted };
    });
  },

  clearSelection: () => {
    set({ selectedIds: [] });
  },

  selectAll: () => {
    const state = get();
    const allIds = Array.from(state.symbols.keys()).sort();
    set({ selectedIds: allIds });
  },

  getSelectedSymbols: () => {
    const state = get();
    return state.selectedIds
      .map((id) => state.symbols.get(id))
      .filter((s): s is AnySldSymbol => s !== undefined);
  },

  // ===== HIGHLIGHT (P30d) =====

  highlightSymbols: (symbolIds: string[], severity: IssueSeverity) => {
    set({ highlightedIds: [...symbolIds].sort(), highlightSeverity: severity });
  },

  clearHighlight: () => {
    set({ highlightedIds: [], highlightSeverity: null });
  },

  // ===== DRAG =====

  startDrag: (symbolIds: string[], startPosition: Position) => {
    const state = get();

    // Capture original positions
    const originalPositions = new Map<string, Position>();
    symbolIds.forEach((id) => {
      const symbol = state.symbols.get(id);
      if (symbol) {
        originalPositions.set(id, { ...symbol.position });
      }
    });

    set({
      dragState: {
        symbolIds,
        originalPositions,
        offset: { x: 0, y: 0 },
        startPosition,
      },
    });
  },

  updateDrag: (currentPosition: Position) => {
    set((state) => {
      if (!state.dragState) return state;

      const offset = {
        x: currentPosition.x - state.dragState.startPosition.x,
        y: currentPosition.y - state.dragState.startPosition.y,
      };

      const shouldForceSnap = featureFlags.sldCadEditingEnabled && state.geometryMode !== 'AUTO';

      // Update positions with snap-to-grid if enabled (CAD zawsze przyciaga)
      const newSymbols = new Map(state.symbols);
      state.dragState.symbolIds.forEach((id) => {
        const originalPos = state.dragState!.originalPositions.get(id);
        if (originalPos) {
          let newPos = {
            x: originalPos.x + offset.x,
            y: originalPos.y + offset.y,
          };

          // Apply snap-to-grid if enabled
          if (state.gridConfig.snapEnabled || shouldForceSnap) {
            newPos = snapToGridRaw(newPos, state.gridConfig.size);
          }

          const symbol = state.symbols.get(id);
          if (symbol) {
            newSymbols.set(id, { ...symbol, position: newPos });
          }
        }
      });

      return {
        symbols: newSymbols,
        dragState: { ...state.dragState, offset },
      };
    });
  },

  endDrag: () => {
    const state = get();
    if (!state.dragState) return null;

    // Compute final position changes for UNDO/REDO
    const changes = new Map<string, { old: Position; new: Position }>();
    state.dragState.symbolIds.forEach((id) => {
      const oldPos = state.dragState!.originalPositions.get(id);
      const symbol = state.symbols.get(id);
      if (oldPos && symbol) {
        changes.set(id, { old: oldPos, new: symbol.position });
      }
    });

    set({ dragState: null });
    return changes;
  },

  cancelDrag: () => {
    const state = get();
    if (!state.dragState) return;

    // Restore original positions
    const newSymbols = new Map(state.symbols);
    state.dragState.symbolIds.forEach((id) => {
      const originalPos = state.dragState!.originalPositions.get(id);
      const symbol = state.symbols.get(id);
      if (originalPos && symbol) {
        newSymbols.set(id, { ...symbol, position: originalPos });
      }
    });

    set({ symbols: newSymbols, dragState: null });
  },

  // ===== LASSO =====

  startLasso: (startPosition: Position) => {
    set({
      lassoState: {
        startPosition,
        currentPosition: startPosition,
        active: true,
      },
    });
  },

  updateLasso: (currentPosition: Position) => {
    set((state) => {
      if (!state.lassoState) return state;
      return {
        lassoState: {
          ...state.lassoState,
          currentPosition,
        },
      };
    });
  },

  endLasso: () => {
    const symbolsInLasso = get().getSymbolsInLasso();
    get().selectMultiple(symbolsInLasso);
    set({ lassoState: null });
  },

  getSymbolsInLasso: () => {
    const state = get();
    if (!state.lassoState) return [];

    const { startPosition, currentPosition } = state.lassoState;

    // Compute lasso bounding box
    const minX = Math.min(startPosition.x, currentPosition.x);
    const maxX = Math.max(startPosition.x, currentPosition.x);
    const minY = Math.min(startPosition.y, currentPosition.y);
    const maxY = Math.max(startPosition.y, currentPosition.y);

    // Find symbols inside lasso
    const symbolsInside: string[] = [];
    state.symbols.forEach((symbol, id) => {
      const { x, y } = symbol.position;
      if (x >= minX && x <= maxX && y >= minY && y <= maxY) {
        symbolsInside.push(id);
      }
    });

    return symbolsInside.sort();
  },

  // ===== CLIPBOARD =====

  /**
   * Kopiuj zaznaczenie do schowka.
   *
   * N-03 CANONICAL-STANDARD:
   * - Schowek przechowuje "snapshot" symboli (bez referencji do istniejących elementów modelu)
   * - Pozycje są przechowywane względnie (względem punktu odniesienia)
   * - Połączenia wewnętrzne (między skopiowanymi elementami) są zachowane
   * - Połączenia zewnętrzne NIE są zachowane
   */
  copySelection: () => {
    const state = get();
    const selectedSymbols = state.selectedIds
      .map((id) => state.symbols.get(id))
      .filter((s): s is AnySldSymbol => s !== undefined);

    if (selectedSymbols.length === 0) return;

    // Oblicz punkt odniesienia (środek zaznaczenia)
    const referencePoint = calculateReferencePoint(selectedSymbols);

    // Zbierz ID wybranych elementów (dla detekcji połączeń wewnętrznych)
    const selectedElementIds = new Set(selectedSymbols.map((s) => s.elementId));

    // Utwórz snapshoty symboli (z pozycjami względnymi)
    const symbolSnapshots: ClipboardSymbolSnapshot[] = selectedSymbols.map((symbol) => ({
      originalSymbolId: symbol.id,
      originalElementId: symbol.elementId,
      elementType: symbol.elementType,
      elementName: symbol.elementName,
      relativePosition: {
        x: symbol.position.x - referencePoint.x,
        y: symbol.position.y - referencePoint.y,
      },
      inService: symbol.inService,
      typeSpecificProps: extractTypeSpecificProps(symbol),
    }));

    // Zbierz połączenia wewnętrzne
    const internalConnections = extractInternalConnections(selectedSymbols, selectedElementIds);

    set({
      clipboard: {
        symbolSnapshots,
        internalConnections,
        referencePoint,
        // DEPRECATED: zachowaj dla kompatybilności wstecznej
        symbols: selectedSymbols,
        timestamp: 0, // N-07: nie używamy Date.now()
      },
    });
  },

  /**
   * Wklej ze schowka.
   *
   * N-03 CANONICAL-STANDARD:
   * - Tworzy NOWE elementy modelu (nowe elementId)
   * - Tworzy NOWE symbole SLD (nowe id)
   * - Odtwarza połączenia WEWNĘTRZNE (między wklejanymi elementami)
   * - NIE odtwarza połączeń zewnętrznych
   *
   * N-07 DETERMINISTYCZNE ID:
   * - ID nie zależą od czasu ani losowości
   * - Ten sam schowek + ten sam stan canvas = te same ID
   */
  pasteFromClipboard: (offset: Position) => {
    const state = get();
    if (!state.clipboard) return [];

    const { symbolSnapshots, internalConnections, referencePoint } = state.clipboard;

    // Jeśli używamy starego formatu schowka (bez snapshots), użyj legacy
    if (!symbolSnapshots || symbolSnapshots.length === 0) {
      return pasteFromClipboardLegacy(state.clipboard, offset, get);
    }

    // N-07: Wygeneruj deterministyczne identyfikatory
    const existingSymbolIds = Array.from(state.symbols.keys());
    const elementTypes = symbolSnapshots.map((s) => s.elementType);
    const idMapping = generatePasteIdentifiers(elementTypes, existingSymbolIds);

    // Mapa: oryginalny elementId -> nowy elementId (do odtwarzania połączeń)
    const elementIdMapping = new Map<string, string>();

    // Utwórz nowe symbole
    const newSymbols: AnySldSymbol[] = symbolSnapshots.map((snapshot, index) => {
      const ids = idMapping.get(index)!;

      // Zapisz mapowanie elementId
      elementIdMapping.set(snapshot.originalElementId, ids.elementId);

      // Oblicz pozycję absolutną
      const absolutePosition: Position = {
        x: referencePoint.x + snapshot.relativePosition.x + offset.x,
        y: referencePoint.y + snapshot.relativePosition.y + offset.y,
      };

      // Snap do siatki
      const snappedPosition = get().snapToGrid(absolutePosition);

      // Utwórz nowy symbol z NOWYMI identyfikatorami
      return createNewSymbol(
        snapshot,
        ids.symbolId,
        ids.elementId,
        snappedPosition
      );
    });

    // Odtwórz połączenia wewnętrzne
    applyInternalConnections(newSymbols, internalConnections, elementIdMapping);

    // Dodaj nowe symbole do canvas
    newSymbols.forEach((symbol) => {
      get().addSymbol(symbol);
    });

    // Zaznacz nowe symbole
    get().selectMultiple(newSymbols.map((s) => s.id));

    return newSymbols;
  },

  /**
   * Duplikuj zaznaczenie.
   * Duplicate = copy + paste z stałym offsetem.
   */
  duplicateSelection: () => {
    // Stały offset dla duplikacji (snap do siatki 20x20)
    const DUPLICATE_OFFSET = { x: 20, y: 20 };
    get().copySelection();
    return get().pasteFromClipboard(DUPLICATE_OFFSET);
  },

  // ===== GRID =====

  toggleGridVisible: () => {
    set((state) => ({
      gridConfig: { ...state.gridConfig, visible: !state.gridConfig.visible },
    }));
  },

  toggleSnapEnabled: () => {
    set((state) => ({
      gridConfig: { ...state.gridConfig, snapEnabled: !state.gridConfig.snapEnabled },
    }));
  },

  setGridSize: (size: number) => {
    set((state) => ({
      gridConfig: { ...state.gridConfig, size },
    }));
  },

  snapToGrid: (position: Position) => {
    const { gridConfig } = get();
    if (!gridConfig.snapEnabled) return position;

    const { size } = gridConfig;
    return {
      x: Math.round(position.x / size) * size,
      y: Math.round(position.y / size) * size,
    };
  },

  // ===== CONNECTION CREATION (PR-SLD-05) =====

  startConnectionCreation: (
    symbolId: string,
    portName: PortName,
    position: Position,
    elementId: string
  ) => {
    set({
      connectionCreationState: {
        fromPort: { symbolId, portName, position, elementId },
        currentMousePosition: position,
        targetPort: null,
      },
      // Wyczysc zaznaczenie przy rozpoczeciu tworzenia polaczenia
      selectedIds: [],
    });
  },

  updateConnectionCreation: (
    mousePosition: Position,
    targetPort: ConnectionCreationState['targetPort']
  ) => {
    set((state) => {
      if (!state.connectionCreationState) return state;
      return {
        connectionCreationState: {
          ...state.connectionCreationState,
          currentMousePosition: mousePosition,
          targetPort,
        },
      };
    });
  },

  confirmConnection: () => {
    const state = get();
    if (!state.connectionCreationState || !state.connectionCreationState.targetPort) {
      return null;
    }

    const { fromPort, targetPort } = state.connectionCreationState;

    // Wyczysc stan tworzenia polaczenia
    set({ connectionCreationState: null });

    return { fromPort, toPort: targetPort };
  },

  cancelConnectionCreation: () => {
    set({ connectionCreationState: null });
  },

  isConnectionCreationActive: () => {
    return get().connectionCreationState !== null;
  },

  // ===== PORT SNAP (PR-SLD-05) =====

  setPortSnapState: (state: PortSnapState | null) => {
    set({ portSnapState: state });
  },

  // ===== STATUS MESSAGE (PR-SLD-05) =====

  setStatusMessage: (message: StatusMessage | null) => {
    set({ statusMessage: message });
  },

  showError: (text: string) => {
    set({
      statusMessage: {
        text,
        type: 'error',
        duration: 3000,
      },
    });
    // Auto-ukryj po czasie
    setTimeout(() => {
      const current = get().statusMessage;
      if (current?.text === text) {
        set({ statusMessage: null });
      }
    }, 3000);
  },

  showInfo: (text: string) => {
    set({
      statusMessage: {
        text,
        type: 'info',
        duration: 2000,
      },
    });
    // Auto-ukryj po czasie
    setTimeout(() => {
      const current = get().statusMessage;
      if (current?.text === text) {
        set({ statusMessage: null });
      }
    }, 2000);
  },

  // ===== HOVER STATE (PR-SLD-05) =====

  setHoveredPort: (portId: string | null) => {
    set({ hoveredPortId: portId });
  },

  // ===== CONNECTION SELECTION (CAD) =====

  setSelectedConnection: (connectionId: string | null, clickPosition?: Position | null, path?: Position[] | null) => {
    const normalizedPath = path ? path.map((point) => ({ ...point })) : null;
    set({
      selectedConnectionId: connectionId,
      lastConnectionClickPosition: clickPosition ?? null,
      selectedConnectionPath: normalizedPath,
      selectedBendIndex: null,
    });
  },

  setSelectedBendIndex: (index: number | null) => {
    set({ selectedBendIndex: index });
  },

  // ===== CAD OVERRIDES =====

  setGeometryMode: (mode: GeometryMode) => {
    if (!featureFlags.sldCadEditingEnabled) {
      set({ geometryMode: 'AUTO' });
      return;
    }
    set((state) => {
      if (!state.cadOverridesDocument && mode !== 'AUTO') {
        const baseFingerprintCurrent = computeTopologyHash(Array.from(state.symbols.values()));
        const doc = buildCadOverridesDocument(mode, baseFingerprintCurrent, null);
        return {
          geometryMode: mode,
          cadOverridesDocument: doc,
        };
      }
      if (!state.cadOverridesDocument) {
        return { geometryMode: mode };
      }

      const updatedDoc: CadOverridesDocument = {
        ...state.cadOverridesDocument,
        mode,
        updatedAt: new Date().toISOString(),
      };

      return {
        geometryMode: mode,
        cadOverridesDocument: updatedDoc,
      };
    });
  },

  setCadOverridesDocument: (doc: CadOverridesDocument | null) => {
    set({ cadOverridesDocument: doc });
  },

  setCadOverridesStatus: (report: CadOverridesStatusReport | null) => {
    set({ cadOverridesStatus: report });
  },

  updateCadNodeOverride: (symbolId: string, position: Position) => {
    set((state) => {
      if (!featureFlags.sldCadEditingEnabled || state.geometryMode === 'AUTO') {
        return state;
      }

      const baseFingerprintCurrent = computeTopologyHash(Array.from(state.symbols.values()));
      const doc = buildCadOverridesDocument(state.geometryMode, baseFingerprintCurrent, state.cadOverridesDocument);
      const snapped = snapToGridRaw(position, state.gridConfig.size);

      const nodes = sortRecordKeys({
        ...doc.nodes,
        [symbolId]: { pos: snapped },
      });

      const updatedDoc: CadOverridesDocument = {
        ...doc,
        nodes,
        updatedAt: new Date().toISOString(),
      };

      const report = evaluateCadOverridesStatus(
        baseFingerprintCurrent,
        updatedDoc.baseFingerprint,
        updatedDoc,
        buildCadIdSet(Array.from(state.symbols.values()))
      );

      return {
        cadOverridesDocument: updatedDoc,
        cadOverridesStatus: report,
      };
    });
  },

  updateCadNodeOverrides: (updates: Map<string, Position>) => {
    set((state) => {
      if (!featureFlags.sldCadEditingEnabled || state.geometryMode === 'AUTO') {
        return state;
      }

      const baseFingerprintCurrent = computeTopologyHash(Array.from(state.symbols.values()));
      const doc = buildCadOverridesDocument(state.geometryMode, baseFingerprintCurrent, state.cadOverridesDocument);

      const updatedNodes: Record<string, { pos: Position; locked?: boolean }> = {
        ...doc.nodes,
      };

      updates.forEach((pos, symbolId) => {
        updatedNodes[symbolId] = {
          ...(updatedNodes[symbolId] ?? {}),
          pos: snapToGridRaw(pos, state.gridConfig.size),
        };
      });

      const updatedDoc: CadOverridesDocument = {
        ...doc,
        nodes: sortRecordKeys(updatedNodes),
        updatedAt: new Date().toISOString(),
      };

      const report = evaluateCadOverridesStatus(
        baseFingerprintCurrent,
        updatedDoc.baseFingerprint,
        updatedDoc,
        buildCadIdSet(Array.from(state.symbols.values()))
      );

      return {
        cadOverridesDocument: updatedDoc,
        cadOverridesStatus: report,
      };
    });
  },

  addCadEdgeBend: (edgeId: string, position: Position, path?: Position[] | null) => {
    set((state) => {
      if (!featureFlags.sldCadEditingEnabled || state.geometryMode === 'AUTO') {
        return state;
      }

      const baseFingerprintCurrent = computeTopologyHash(Array.from(state.symbols.values()));
      const doc = buildCadOverridesDocument(state.geometryMode, baseFingerprintCurrent, state.cadOverridesDocument);
      const snapped = snapToGridRaw(position, state.gridConfig.size);
      const existing = doc.edges[edgeId]?.bends ? [...doc.edges[edgeId]!.bends!] : [];

      let insertIndex = existing.length;
      if (path && path.length >= 2) {
        insertIndex = findInsertIndexForBend(path, snapped);
      }

      const nextBends = [
        ...existing.slice(0, insertIndex),
        snapped,
        ...existing.slice(insertIndex),
      ];

      const edges = sortRecordKeys({
        ...doc.edges,
        [edgeId]: {
          ...doc.edges[edgeId],
          bends: nextBends,
        },
      });

      const updatedDoc: CadOverridesDocument = {
        ...doc,
        edges,
        updatedAt: new Date().toISOString(),
      };

      const report = evaluateCadOverridesStatus(
        baseFingerprintCurrent,
        updatedDoc.baseFingerprint,
        updatedDoc,
        buildCadIdSet(Array.from(state.symbols.values()))
      );

      return {
        cadOverridesDocument: updatedDoc,
        cadOverridesStatus: report,
        selectedBendIndex: insertIndex,
      };
    });
  },

  updateCadEdgeBend: (edgeId: string, index: number, position: Position) => {
    set((state) => {
      if (!featureFlags.sldCadEditingEnabled || state.geometryMode === 'AUTO') {
        return state;
      }

      const doc = state.cadOverridesDocument;
      if (!doc || !doc.edges[edgeId]?.bends) {
        return state;
      }

      const baseFingerprintCurrent = computeTopologyHash(Array.from(state.symbols.values()));
      const snapped = snapToGridRaw(position, state.gridConfig.size);
      const bends = [...doc.edges[edgeId]!.bends!];
      if (index < 0 || index >= bends.length) {
        return state;
      }

      bends[index] = snapped;

      const edges = sortRecordKeys({
        ...doc.edges,
        [edgeId]: {
          ...doc.edges[edgeId],
          bends,
        },
      });

      const updatedDoc: CadOverridesDocument = {
        ...doc,
        edges,
        updatedAt: new Date().toISOString(),
      };

      const report = evaluateCadOverridesStatus(
        baseFingerprintCurrent,
        updatedDoc.baseFingerprint,
        updatedDoc,
        buildCadIdSet(Array.from(state.symbols.values()))
      );

      return {
        cadOverridesDocument: updatedDoc,
        cadOverridesStatus: report,
      };
    });
  },

  removeCadEdgeBend: (edgeId: string, index: number) => {
    set((state) => {
      if (!featureFlags.sldCadEditingEnabled || state.geometryMode === 'AUTO') {
        return state;
      }

      const doc = state.cadOverridesDocument;
      if (!doc || !doc.edges[edgeId]?.bends) {
        return state;
      }

      const baseFingerprintCurrent = computeTopologyHash(Array.from(state.symbols.values()));
      const bends = [...doc.edges[edgeId]!.bends!];
      if (index < 0 || index >= bends.length) {
        return state;
      }

      bends.splice(index, 1);

      const edges = { ...doc.edges };
      if (bends.length === 0) {
        delete edges[edgeId];
      } else {
        edges[edgeId] = {
          ...doc.edges[edgeId],
          bends,
        };
      }

      const updatedDoc: CadOverridesDocument = {
        ...doc,
        edges: sortRecordKeys(edges),
        updatedAt: new Date().toISOString(),
      };

      const report = evaluateCadOverridesStatus(
        baseFingerprintCurrent,
        updatedDoc.baseFingerprint,
        updatedDoc,
        buildCadIdSet(Array.from(state.symbols.values()))
      );

      return {
        cadOverridesDocument: updatedDoc,
        cadOverridesStatus: report,
        selectedBendIndex: null,
      };
    });
  },

  resetCadOverrideForNode: (symbolId: string) => {
    set((state) => {
      if (!featureFlags.sldCadEditingEnabled || state.geometryMode === 'AUTO') {
        return state;
      }
      if (!state.cadOverridesDocument) return state;
      const { [symbolId]: _, ...remainingNodes } = state.cadOverridesDocument.nodes;

      const updatedDoc: CadOverridesDocument = {
        ...state.cadOverridesDocument,
        nodes: sortRecordKeys(remainingNodes),
        updatedAt: new Date().toISOString(),
      };

      const baseFingerprintCurrent = computeTopologyHash(Array.from(state.symbols.values()));
      const report = evaluateCadOverridesStatus(
        baseFingerprintCurrent,
        updatedDoc.baseFingerprint,
        updatedDoc,
        buildCadIdSet(Array.from(state.symbols.values()))
      );

      return {
        cadOverridesDocument: updatedDoc,
        cadOverridesStatus: report,
      };
    });
  },

  resetCadOverrideForEdge: (edgeId: string) => {
    set((state) => {
      if (!featureFlags.sldCadEditingEnabled || state.geometryMode === 'AUTO') {
        return state;
      }
      if (!state.cadOverridesDocument) return state;
      const { [edgeId]: _, ...remainingEdges } = state.cadOverridesDocument.edges;

      const updatedDoc: CadOverridesDocument = {
        ...state.cadOverridesDocument,
        edges: sortRecordKeys(remainingEdges),
        updatedAt: new Date().toISOString(),
      };

      const baseFingerprintCurrent = computeTopologyHash(Array.from(state.symbols.values()));
      const report = evaluateCadOverridesStatus(
        baseFingerprintCurrent,
        updatedDoc.baseFingerprint,
        updatedDoc,
        buildCadIdSet(Array.from(state.symbols.values()))
      );

      return {
        cadOverridesDocument: updatedDoc,
        cadOverridesStatus: report,
        selectedConnectionId: state.selectedConnectionId === edgeId ? null : state.selectedConnectionId,
        selectedBendIndex: null,
      };
    });
  },

  resetAllCadOverrides: () => {
    set((state) => {
      if (!featureFlags.sldCadEditingEnabled || state.geometryMode === 'AUTO') {
        return state;
      }
      if (!state.cadOverridesDocument) return state;

      const updatedDoc: CadOverridesDocument = {
        ...state.cadOverridesDocument,
        nodes: {},
        edges: {},
        labels: {},
        updatedAt: new Date().toISOString(),
      };

      const baseFingerprintCurrent = computeTopologyHash(Array.from(state.symbols.values()));
      const report = evaluateCadOverridesStatus(
        baseFingerprintCurrent,
        updatedDoc.baseFingerprint,
        updatedDoc,
        buildCadIdSet(Array.from(state.symbols.values()))
      );

      return {
        cadOverridesDocument: updatedDoc,
        cadOverridesStatus: report,
        selectedConnectionId: null,
        selectedBendIndex: null,
        lastConnectionClickPosition: null,
        selectedConnectionPath: null,
      };
    });
  },

  // ===== HELPERS =====

  getSymbol: (symbolId: string) => {
    return get().symbols.get(symbolId);
  },

  hasSelection: () => {
    return get().selectedIds.length > 0;
  },

  getSelectionCount: () => {
    return get().selectedIds.length;
  },
}));

// =============================================================================
// HELPER FUNCTIONS (N-03: Copy/Paste)
// =============================================================================

/**
 * Oblicz punkt odniesienia (środek zaznaczenia).
 */
function calculateReferencePoint(symbols: AnySldSymbol[]): Position {
  if (symbols.length === 0) return { x: 0, y: 0 };

  const sumX = symbols.reduce((sum, s) => sum + s.position.x, 0);
  const sumY = symbols.reduce((sum, s) => sum + s.position.y, 0);

  return {
    x: Math.round(sumX / symbols.length),
    y: Math.round(sumY / symbols.length),
  };
}

/**
 * Wyodrębnij właściwości specyficzne dla typu symbolu.
 */
function extractTypeSpecificProps(symbol: AnySldSymbol): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  switch (symbol.elementType) {
    case 'Bus': {
      const node = symbol as NodeSymbol;
      props.width = node.width;
      props.height = node.height;
      break;
    }
    case 'LineBranch':
    case 'TransformerBranch': {
      const branch = symbol as BranchSymbol;
      props.fromNodeId = branch.fromNodeId;
      props.toNodeId = branch.toNodeId;
      props.points = branch.points;
      if (branch.branchType) {
        props.branchType = branch.branchType;
      }
      break;
    }
    case 'Switch': {
      const sw = symbol as SwitchSymbol;
      props.fromNodeId = sw.fromNodeId;
      props.toNodeId = sw.toNodeId;
      props.switchState = sw.switchState;
      props.switchType = sw.switchType;
      break;
    }
    case 'Source': {
      const src = symbol as SourceSymbol;
      props.connectedToNodeId = src.connectedToNodeId;
      break;
    }
    case 'Load': {
      const load = symbol as LoadSymbol;
      props.connectedToNodeId = load.connectedToNodeId;
      break;
    }
  }

  return props;
}

/**
 * Wyodrębnij połączenia wewnętrzne (między elementami w zestawie).
 *
 * PR-SLD-03b: Używamy elementId jako podstawy odtwarzania połączeń.
 * Połączenia wewnętrzne to takie, których OBA końce znajdują się w zestawie.
 */
function extractInternalConnections(
  symbols: AnySldSymbol[],
  selectedElementIds: Set<string>
): ClipboardInternalConnection[] {
  const connections: ClipboardInternalConnection[] = [];

  for (const symbol of symbols) {
    // Branch: fromNodeId, toNodeId
    if (symbol.elementType === 'LineBranch' || symbol.elementType === 'TransformerBranch') {
      const branch = symbol as BranchSymbol;

      // Połączenie z fromNodeId (jeśli wewnętrzne)
      if (selectedElementIds.has(branch.fromNodeId)) {
        connections.push({
          fromOriginalElementId: branch.fromNodeId,
          toOriginalElementId: symbol.elementId,
          connectionType: 'fromNodeId',
        });
      }

      // Połączenie z toNodeId (jeśli wewnętrzne)
      if (selectedElementIds.has(branch.toNodeId)) {
        connections.push({
          fromOriginalElementId: branch.toNodeId,
          toOriginalElementId: symbol.elementId,
          connectionType: 'toNodeId',
        });
      }
    }

    // Switch: fromNodeId, toNodeId
    if (symbol.elementType === 'Switch') {
      const sw = symbol as SwitchSymbol;

      if (selectedElementIds.has(sw.fromNodeId)) {
        connections.push({
          fromOriginalElementId: sw.fromNodeId,
          toOriginalElementId: symbol.elementId,
          connectionType: 'fromNodeId',
        });
      }

      if (selectedElementIds.has(sw.toNodeId)) {
        connections.push({
          fromOriginalElementId: sw.toNodeId,
          toOriginalElementId: symbol.elementId,
          connectionType: 'toNodeId',
        });
      }
    }

    // Source: connectedToNodeId
    if (symbol.elementType === 'Source') {
      const src = symbol as SourceSymbol;
      if (selectedElementIds.has(src.connectedToNodeId)) {
        connections.push({
          fromOriginalElementId: src.connectedToNodeId,
          toOriginalElementId: symbol.elementId,
          connectionType: 'connectedToNodeId',
        });
      }
    }

    // Load: connectedToNodeId
    if (symbol.elementType === 'Load') {
      const load = symbol as LoadSymbol;
      if (selectedElementIds.has(load.connectedToNodeId)) {
        connections.push({
          fromOriginalElementId: load.connectedToNodeId,
          toOriginalElementId: symbol.elementId,
          connectionType: 'connectedToNodeId',
        });
      }
    }
  }

  // PR-SLD-03b: Deterministyczne sortowanie połączeń
  // (fromElementId, connectionType, toElementId)
  connections.sort((a, b) => {
    const cmp1 = a.fromOriginalElementId.localeCompare(b.fromOriginalElementId);
    if (cmp1 !== 0) return cmp1;
    const cmp2 = a.connectionType.localeCompare(b.connectionType);
    if (cmp2 !== 0) return cmp2;
    return a.toOriginalElementId.localeCompare(b.toOriginalElementId);
  });

  return connections;
}

/**
 * Utwórz nowy symbol na podstawie snapshotu.
 *
 * N-03: Tworzy symbol z NOWYMI identyfikatorami (nie kopiuje elementId).
 */
function createNewSymbol(
  snapshot: ClipboardSymbolSnapshot,
  newSymbolId: string,
  newElementId: string,
  position: Position
): AnySldSymbol {
  const baseSymbol = {
    id: newSymbolId,
    elementId: newElementId,
    elementType: snapshot.elementType,
    elementName: `${snapshot.elementName} (kopia)`,
    position,
    inService: snapshot.inService,
  };

  const props = snapshot.typeSpecificProps;

  switch (snapshot.elementType) {
    case 'Bus':
      return {
        ...baseSymbol,
        elementType: 'Bus',
        width: (props.width as number) || 60,
        height: (props.height as number) || 8,
      } as NodeSymbol;

    case 'LineBranch':
    case 'TransformerBranch':
      return {
        ...baseSymbol,
        elementType: snapshot.elementType,
        // Połączenia zostaną ustawione przez applyInternalConnections lub pozostaną puste
        fromNodeId: '', // Do uzupełnienia przez połączenia wewnętrzne
        toNodeId: '',
        points: (props.points as Position[]) || [],
        branchType: props.branchType as 'LINE' | 'CABLE' | undefined,
      } as BranchSymbol;

    case 'Switch':
      return {
        ...baseSymbol,
        elementType: 'Switch',
        fromNodeId: '', // Do uzupełnienia
        toNodeId: '',
        switchState: (props.switchState as 'OPEN' | 'CLOSED') || 'OPEN',
        switchType: (props.switchType as 'BREAKER' | 'DISCONNECTOR' | 'LOAD_SWITCH' | 'FUSE') || 'BREAKER',
      } as SwitchSymbol;

    case 'Source':
      return {
        ...baseSymbol,
        elementType: 'Source',
        connectedToNodeId: '', // Do uzupełnienia
      } as SourceSymbol;

    case 'Load':
      return {
        ...baseSymbol,
        elementType: 'Load',
        connectedToNodeId: '', // Do uzupełnienia
      } as LoadSymbol;

    default:
      return baseSymbol as AnySldSymbol;
  }
}

/**
 * Zastosuj połączenia wewnętrzne do nowo utworzonych symboli.
 *
 * PR-SLD-03b: Odtwarza połączenia wewnętrzne po wklejeniu grupy.
 *
 * Mapuje oryginalne elementId na nowe elementId dla połączeń wewnętrznych.
 * Połączenia zewnętrzne (do elementów spoza zestawu) pozostają puste.
 *
 * CANONICAL-STANDARD:
 * - Połączenia WEWNĘTRZNE (oba końce w zestawie) są odtwarzane automatycznie
 * - Połączenia ZEWNĘTRZNE (jeden koniec spoza zestawu) pozostają puste
 *
 * @param newSymbols - Nowo utworzone symbole (z nowymi elementId)
 * @param connections - Lista połączeń wewnętrznych ze schowka
 * @param elementIdMapping - Mapa: stary elementId -> nowy elementId
 */
function applyInternalConnections(
  newSymbols: AnySldSymbol[],
  connections: ClipboardInternalConnection[],
  elementIdMapping: Map<string, string>
): void {
  // Brak połączeń do odtworzenia
  if (connections.length === 0) return;

  // Mapa: nowy elementId -> symbol (dla szybkiego dostępu)
  const newElementToSymbol = new Map<string, AnySldSymbol>();
  for (const symbol of newSymbols) {
    newElementToSymbol.set(symbol.elementId, symbol);
  }

  // Przetwórz każde połączenie wewnętrzne
  for (const conn of connections) {
    // Znajdź nowe elementId dla obu końców
    const newFromElementId = elementIdMapping.get(conn.fromOriginalElementId);
    const newToElementId = elementIdMapping.get(conn.toOriginalElementId);

    // Jeśli któryś koniec nie został zmapowany, pomiń (diagnostyka)
    if (!newFromElementId || !newToElementId) {
      console.debug(
        `[PR-SLD-03b] Pominięto połączenie wewnętrzne: brak mapowania dla ` +
        `from=${conn.fromOriginalElementId} lub to=${conn.toOriginalElementId}`
      );
      continue;
    }

    // Znajdź symbol docelowy (element łączący: branch, switch, source, load)
    const targetSymbol = newElementToSymbol.get(newToElementId);
    if (!targetSymbol) {
      console.debug(
        `[PR-SLD-03b] Pominięto połączenie wewnętrzne: nie znaleziono symbolu ` +
        `dla elementId=${newToElementId}`
      );
      continue;
    }

    // Ustaw odpowiednie pole w zależności od typu połączenia
    switch (conn.connectionType) {
      case 'fromNodeId':
        if ('fromNodeId' in targetSymbol) {
          (targetSymbol as BranchSymbol | SwitchSymbol).fromNodeId = newFromElementId;
        }
        break;

      case 'toNodeId':
        if ('toNodeId' in targetSymbol) {
          (targetSymbol as BranchSymbol | SwitchSymbol).toNodeId = newFromElementId;
        }
        break;

      case 'connectedToNodeId':
        if ('connectedToNodeId' in targetSymbol) {
          (targetSymbol as SourceSymbol | LoadSymbol).connectedToNodeId = newFromElementId;
        }
        break;
    }
  }
}

/**
 * Legacy paste dla kompatybilności wstecznej (stary format schowka).
 *
 * @deprecated Używaj nowego formatu z symbolSnapshots
 */
function pasteFromClipboardLegacy(
  clipboard: ClipboardData,
  offset: Position,
  get: () => ReturnType<typeof useSldEditorStore.getState>
): AnySldSymbol[] {
  // Użyj starego pola symbols
  const symbols = clipboard.symbols;
  if (!symbols || symbols.length === 0) return [];

  // Wygeneruj deterministyczne ID
  const existingSymbolIds = Array.from(get().symbols.keys());
  const elementTypes = symbols.map((s) => s.elementType);
  const idMapping = generatePasteIdentifiers(elementTypes, existingSymbolIds);

  const newSymbols: AnySldSymbol[] = symbols.map((symbol, index) => {
    const ids = idMapping.get(index)!;
    return {
      ...symbol,
      id: ids.symbolId,
      elementId: ids.elementId, // N-03: NOWY elementId!
      elementName: `${symbol.elementName} (kopia)`,
      position: {
        x: symbol.position.x + offset.x,
        y: symbol.position.y + offset.y,
      },
    };
  });

  // Dodaj symbole
  newSymbols.forEach((symbol) => {
    get().addSymbol(symbol);
  });

  // Zaznacz
  get().selectMultiple(newSymbols.map((s) => s.id));

  return newSymbols;
}

// =============================================================================
// Derived Hooks
// =============================================================================

/**
 * Hook: Get selected symbols.
 */
export function useSelectedSymbols(): AnySldSymbol[] {
  return useSldEditorStore((state) => state.getSelectedSymbols());
}

/**
 * Hook: Check if selection exists.
 */
export function useHasSelection(): boolean {
  return useSldEditorStore((state) => state.hasSelection());
}

/**
 * Hook: Get selection count.
 */
export function useSelectionCount(): number {
  return useSldEditorStore((state) => state.getSelectionCount());
}

/**
 * Hook: Get grid config.
 */
export function useGridConfig(): GridConfig {
  return useSldEditorStore((state) => state.gridConfig);
}

/**
 * Hook: Check if drag is active.
 */
export function useIsDragging(): boolean {
  return useSldEditorStore((state) => state.dragState !== null);
}
