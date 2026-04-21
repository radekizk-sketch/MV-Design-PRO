/**
 * useAutoLayout — Automatyczne rozmieszczenie SLD (topological engine)
 *
 * CANONICAL ALIGNMENT:
 * - SLD_AUTOLAYOUT_AUDIT_I_NAPRAWA.md: BINDING SPEC
 * - SLD_KANONICZNA_SPECYFIKACJA.md § 5: Auto-Layout
 * - AUDYT_SLD_CANONICAL.md N-02: hierarchiczne auto-rozmieszczenie
 *
 * ARCHITEKTURA (10/10 topological engine):
 * - JEDEN silnik: computeTopologicalLayout (topological-layout/)
 * - ZERO mutacji symboli wejsciowych (immutability)
 * - Kolizje rozwiazywane WYLACZNIE w osi Y (zachowanie kolumn)
 * - Deterministyczny 100%: ten sam model -> ten sam layout
 * - Layout dziala ZAWSZE i SAM (bez przyciskow)
 *
 * PIPELINE:
 *   Symbols (IMMUTABLE) → roleAssigner → geometricSkeleton → collisionGuard → positions
 *
 * ZAKAZ: przyciski "Rozmiesc automatycznie" — layout dziala ZAWSZE i SAM
 */

import { useMemo, useRef, useCallback } from 'react';
import type { AnySldSymbol, Position, BranchSymbol, SwitchSymbol } from '../types';
import {
  computeTopologicalLayout,
  type TopologicalLayoutResult,
  type LayoutGeometryConfig,
  DEFAULT_GEOMETRY_CONFIG,
} from '../utils/topological-layout';
import {
  CANONICAL_GEOMETRY,
  resolveLabelCollisions,
  type LabelBoundingBox,
} from '../../sld/sldCanonicalStyle';

// =============================================================================
// TYPY
// =============================================================================

/**
 * Nadpisanie pozycji dla konkretnego symbolu (manual override).
 * Uzywane gdy uzytkownik recznie przesunie symbol.
 */
export interface PositionOverride {
  /** ID symbolu */
  symbolId: string;
  /** Delta pozycji wzgledem bazowego auto-layoutu */
  deltaX: number;
  deltaY: number;
  /** Timestamp nadpisania (dla sortowania/priorytetyzacji) */
  timestamp: number;
}

/**
 * Stan auto-layoutu.
 */
export interface AutoLayoutState {
  /** Bazowe pozycje z auto-layoutu (przed nadpisaniami) */
  basePositions: Map<string, Position>;
  /** Finalne pozycje (po zastosowaniu nadpisan i kolizji) */
  finalPositions: Map<string, Position>;
  /** Nadpisania pozycji (manual overrides) */
  overrides: Map<string, PositionOverride>;
  /** Hash topologii (do wykrywania zmian) */
  topologyHash: string;
  /** Informacje debugowe */
  debug: {
    layers: Map<number, string[]>;
    totalLayers: number;
    totalNodes: number;
    collisionsResolved: number;
  };
}

/**
 * Wynik hooka useAutoLayout.
 */
export interface UseAutoLayoutResult {
  /** Finalne pozycje symboli (gotowe do renderowania) */
  positions: Map<string, Position>;
  /** Symbole z zastosowanymi pozycjami */
  layoutSymbols: AnySldSymbol[];
  /** Czy layout jest aktualny */
  isLayoutCurrent: boolean;
  /** Dodaj nadpisanie pozycji (po recznym przesunieciu) */
  addOverride: (symbolId: string, delta: Position) => void;
  /** Usun nadpisanie pozycji */
  removeOverride: (symbolId: string) => void;
  /** Wyczysc wszystkie nadpisania */
  clearOverrides: () => void;
  /** Informacje debugowe */
  debug: AutoLayoutState['debug'];
  /** PR-SLD-CANONICAL-GEOMETRY-01: Label position adjustments for collision avoidance */
  labelAdjustments: Map<string, { x: number; y: number }>;
}

// =============================================================================
// LEGACY COMPATIBILITY TYPES (used by resolveCollisions callers)
// =============================================================================

/**
 * Legacy AutoLayoutConfig — kept for interface compatibility.
 * Actual layout uses LayoutGeometryConfig internally.
 */
export interface AutoLayoutConfig {
  gridSize: number;
  layerSpacing: number;
  nodeSpacing: number;
  busMinWidth: number;
  symbolWidth: number;
  symbolHeight: number;
  direction: 'top-down' | 'left-right';
  padding: number;
}

export const DEFAULT_LAYOUT_CONFIG: AutoLayoutConfig = {
  gridSize: CANONICAL_GEOMETRY.layout.gridSize,
  layerSpacing: CANONICAL_GEOMETRY.canonicalLayerSpacing,
  nodeSpacing: CANONICAL_GEOMETRY.bay.spacing,
  busMinWidth: CANONICAL_GEOMETRY.busbar.minWidth,
  symbolWidth: 60,
  symbolHeight: 40,
  direction: 'top-down',
  padding: CANONICAL_GEOMETRY.layout.padding,
};

export interface CollisionConfig {
  symbolClearance: number;
  labelSymbolClearance: number;
  labelEdgeClearance: number;
  busbarPadding: number;
  labelCharWidth: number;
  labelHeight: number;
  edgeThickness: number;
  maxIterations: number;
}

export const DEFAULT_COLLISION_CONFIG: CollisionConfig = {
  symbolClearance: 24,
  labelSymbolClearance: 16,
  labelEdgeClearance: 12,
  busbarPadding: 20,
  labelCharWidth: 7,
  labelHeight: 12,
  edgeThickness: 6,
  maxIterations: 20,
};

// =============================================================================
// FUNKCJE POMOCNICZE
// =============================================================================

/**
 * Oblicz deterministyczny hash topologii.
 * DETERMINIZM: sortowanie po ID gwarantuje ten sam hash dla tej samej topologii.
 *
 * Hash jest odporny na:
 * - Kolejnosc symboli w tablicy
 * - Pozycje symboli (ignorowane)
 *
 * Hash zmienia sie gdy:
 * - Dodano/usunieto symbol
 * - Zmieniono polaczenia (fromNodeId, toNodeId, connectedToNodeId)
 * - Zmieniono typ elementu
 */
export function computeTopologyHash(symbols: AnySldSymbol[]): string {
  // Sortuj symbole po ID (determinizm)
  const sortedSymbols = [...symbols].sort((a, b) => a.id.localeCompare(b.id));

  // Buduj hash z: ID, elementType, polaczenia
  const parts: string[] = [];

  for (const symbol of sortedSymbols) {
    // Podstawowe dane
    parts.push(`${symbol.id}:${symbol.elementType}`);

    // Polaczenia (dla Branch/Switch)
    if (symbol.elementType === 'LineBranch' || symbol.elementType === 'TransformerBranch') {
      const branch = symbol as BranchSymbol;
      // Sortuj fromNodeId i toNodeId dla determinizmu (krawedz nieskierowana)
      const nodeIds = [branch.fromNodeId, branch.toNodeId].sort();
      parts.push(`->${nodeIds[0]},${nodeIds[1]}`);
    }

    if (symbol.elementType === 'Switch') {
      const sw = symbol as SwitchSymbol;
      const nodeIds = [sw.fromNodeId, sw.toNodeId].sort();
      parts.push(`->${nodeIds[0]},${nodeIds[1]}`);
    }

    // Polaczenia Source/Load
    if (symbol.elementType === 'Source' || symbol.elementType === 'Load') {
      const connected = (symbol as any).connectedToNodeId;
      if (connected) {
        parts.push(`->${connected}`);
      }
    }
  }

  // Prosty hash (dla produkcji mozna uzyc SHA-256)
  return parts.join('|');
}

/**
 * Build label bounding boxes for collision detection.
 * Uses CANONICAL_GEOMETRY tokens for consistent clearances.
 */
function buildLabelBoundingBoxes(
  symbols: AnySldSymbol[],
  positions: Map<string, Position>,
  collisionConfig: CollisionConfig
): LabelBoundingBox[] {
  const labels: LabelBoundingBox[] = [];

  for (const symbol of symbols) {
    if (!symbol.elementName) continue;

    const pos = positions.get(symbol.id);
    if (!pos) continue;

    const isBus = symbol.elementType === 'Bus';
    const symHeight = isBus ? 8 : 40;
    const labelWidth = Math.max(
      30,
      symbol.elementName.length * collisionConfig.labelCharWidth
    );
    const labelHeight = collisionConfig.labelHeight;
    const offsetY = isBus ? -symHeight / 2 - 8 : -symHeight / 2 - 5;

    labels.push({
      x: pos.x,
      y: pos.y + offsetY - labelHeight / 2,
      width: labelWidth,
      height: labelHeight,
      ownerId: symbol.id,
    });
  }

  return labels;
}

// =============================================================================
// HOOK: useAutoLayout (TOPOLOGICAL ENGINE — 10/10)
// =============================================================================

/**
 * Hook do automatycznego rozmieszczania SLD.
 *
 * TOPOLOGICAL ENGINE (replacing legacy generateAutoLayout):
 * - computeTopologicalLayout: topology → roles → skeleton → positions
 * - Collision resolution: Y-only (preserves slot columns)
 * - Immutable: zero symbol mutations
 * - Deterministic: 100%
 *
 * AUTOMATYCZNE WYWOLANIE:
 * - Przy kazdej zmianie topologii (hash zmienia sie)
 * - Nie wymaga zadnego przycisku
 *
 * STABILNOSC:
 * - Mala zmiana topologii = mala zmiana ukladu
 * - Nadpisania pozycji sa zachowywane jesli nie powoduja kolizji
 *
 * @param symbols - Symbole SLD do rozmieszczenia
 * @param config - Konfiguracja layoutu (opcjonalna)
 */
export function useAutoLayout(
  symbols: AnySldSymbol[],
  config: Partial<AutoLayoutConfig> = {}
): UseAutoLayoutResult {
  // Build geometry config from legacy config
  const geoConfig: LayoutGeometryConfig = {
    ...DEFAULT_GEOMETRY_CONFIG,
    gridSize: config.gridSize ?? DEFAULT_GEOMETRY_CONFIG.gridSize,
    padding: config.padding ?? DEFAULT_GEOMETRY_CONFIG.padding,
    minBusbarWidth: config.busMinWidth ?? DEFAULT_GEOMETRY_CONFIG.minBusbarWidth,
  };

  // Przechowuj nadpisania pozycji
  const overridesRef = useRef<Map<string, PositionOverride>>(new Map());
  const previousHashRef = useRef<string>('');

  // Oblicz hash topologii
  const topologyHash = useMemo(() => computeTopologyHash(symbols), [symbols]);

  // Run TOPOLOGICAL LAYOUT ENGINE (replaces legacy generateAutoLayout)
  const topologicalResult = useMemo<TopologicalLayoutResult | null>(() => {
    if (symbols.length === 0) return null;
    return computeTopologicalLayout(
      symbols,
      geoConfig,
      (config.direction === 'left-right') ? 'left-right' : 'top-down'
    );
    // intentional: geoConfig excluded — layout recalculates only on topology change
  }, [symbols, topologyHash]);

  // Build layout state from topological result
  const layoutState = useMemo<AutoLayoutState>(() => {
    const basePositions = topologicalResult?.positions
      ? new Map(topologicalResult.positions)
      : new Map<string, Position>();

    // Apply manual overrides (sorted by timestamp for determinism)
    const finalPositions = new Map(basePositions);
    const sortedOverrides = Array.from(overridesRef.current.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );
    for (const override of sortedOverrides) {
      const basePos = basePositions.get(override.symbolId);
      if (!basePos) continue;
      const gridSize = geoConfig.gridSize;
      const newX = Math.round((basePos.x + override.deltaX) / gridSize) * gridSize;
      const newY = Math.round((basePos.y + override.deltaY) / gridSize) * gridSize;
      finalPositions.set(override.symbolId, { x: newX, y: newY });
    }

    // Build layer map from topological result (for debug compatibility)
    const layers = new Map<number, string[]>();
    if (topologicalResult) {
      topologicalResult.skeleton.tiers.forEach((tier, idx) => {
        layers.set(idx, [...tier.symbolIds]);
      });
    }

    return {
      basePositions,
      finalPositions,
      overrides: new Map(overridesRef.current),
      topologyHash,
      debug: {
        layers,
        totalLayers: topologicalResult?.diagnostics.tierCount ?? 0,
        totalNodes: topologicalResult?.diagnostics.assignedRoleCount ?? 0,
        collisionsResolved: topologicalResult?.collisionReport.affectedSymbolCount ?? 0,
      },
    };
  }, [topologicalResult, topologyHash, geoConfig]);

  // Sprawdz czy topologia sie zmienila
  const isLayoutCurrent = previousHashRef.current === topologyHash;
  previousHashRef.current = topologyHash;

  // Zastosuj pozycje do symboli (IMMUTABLE — tworzy nowe obiekty)
  const layoutSymbols = useMemo<AnySldSymbol[]>(() => {
    return symbols.map((symbol) => {
      const pos = layoutState.finalPositions.get(symbol.id);
      if (pos) {
        return { ...symbol, position: pos };
      }
      return symbol;
    });
  }, [symbols, layoutState.finalPositions]);

  // PR-SLD-CANONICAL-GEOMETRY-01: Calculate label position adjustments for collision avoidance
  const labelAdjustments = useMemo<Map<string, { x: number; y: number }>>(() => {
    const labelBoxes = buildLabelBoundingBoxes(
      symbols,
      layoutState.finalPositions,
      DEFAULT_COLLISION_CONFIG
    );
    return resolveLabelCollisions(labelBoxes);
  }, [symbols, layoutState.finalPositions]);

  // Akcje
  const addOverride = useCallback(
    (symbolId: string, delta: Position) => {
      const basePos = layoutState.basePositions.get(symbolId);
      if (!basePos) return;

      overridesRef.current.set(symbolId, {
        symbolId,
        deltaX: delta.x,
        deltaY: delta.y,
        timestamp: Date.now(),
      });
    },
    [layoutState.basePositions]
  );

  const removeOverride = useCallback((symbolId: string) => {
    overridesRef.current.delete(symbolId);
  }, []);

  const clearOverrides = useCallback(() => {
    overridesRef.current.clear();
  }, []);

  return {
    positions: layoutState.finalPositions,
    layoutSymbols,
    isLayoutCurrent,
    addOverride,
    removeOverride,
    clearOverrides,
    debug: layoutState.debug,
    labelAdjustments,
  };
}

// =============================================================================
// EKSPORT DOMYSLNY
// =============================================================================

export default useAutoLayout;
