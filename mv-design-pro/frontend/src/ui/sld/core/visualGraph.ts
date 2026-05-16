/**
 * VisualGraphV1 — Kontrakt wejścia Layout Pipeline.
 *
 * CANONICAL CONTRACT (BINDING):
 * - Wersja: V1
 * - Wejście dla Layout Engine (layoutPipeline.ts).
 * - Immutable (readonly throughout).
 *
 * P0.3 F2: PortRefV1 zawiera portId (port-based routing).
 * portId → klucz w canonical_symbols/ports.json → absolutna pozycja portu.
 * Gdy portId jest pusty (''), fallback do center-to-center w phase4.
 *
 * Kompatybilność wsteczna:
 * - portId jest opcjonalne ('') gdy topology nie zna portu symbolu.
 * - phase4_route_all_edges używa portId gdy niepusty.
 */

// =============================================================================
// PORT REFERENCE
// =============================================================================

/**
 * Referencja do portu węzła w VisualGraphV1.
 *
 * nodeId  — ID węzła (VisualNodeV1.id).
 * portId  — ID portu w manifeście symbolu (canonical_symbols/ports.json).
 *           Pusty string '' oznacza brak informacji o porcie (fallback center).
 */
export interface PortRefV1 {
  readonly nodeId: string;
  readonly portId: string;
}

// =============================================================================
// NODE TYPES
// =============================================================================

export const NodeTypeV1 = {
  // Szyny
  BUS_SN: 'BUS_SN',
  BUS_NN: 'BUS_NN',
  // Źródła i generatory
  GRID_SOURCE: 'GRID_SOURCE',
  GENERATOR_PV: 'GENERATOR_PV',
  GENERATOR_BESS: 'GENERATOR_BESS',
  GENERATOR_WIND: 'GENERATOR_WIND',
  // Transformatory
  TRANSFORMER_WN_SN: 'TRANSFORMER_WN_SN',
  TRANSFORMER_SN_NN: 'TRANSFORMER_SN_NN',
  // Aparatura łączeniowa
  SWITCH_BREAKER: 'SWITCH_BREAKER',
  SWITCH_DISCONNECTOR: 'SWITCH_DISCONNECTOR',
  SWITCH_LOAD_SWITCH: 'SWITCH_LOAD_SWITCH',
  SWITCH_FUSE: 'SWITCH_FUSE',
  // Stacje
  STATION_SN_NN_A: 'STATION_SN_NN_A',
  STATION_SN_NN_B: 'STATION_SN_NN_B',
  STATION_SN_NN_C: 'STATION_SN_NN_C',
  STATION_SN_NN_D: 'STATION_SN_NN_D',
  SWITCHGEAR_BLOCK: 'SWITCHGEAR_BLOCK',
  // Odgałęzienia i inne
  BRANCH_POLE: 'BRANCH_POLE',
  ZKSN_NODE: 'ZKSN_NODE',
  LOAD: 'LOAD',
} as const;

export type NodeTypeV1 = (typeof NodeTypeV1)[keyof typeof NodeTypeV1];

// =============================================================================
// EDGE TYPES
// =============================================================================

export const EdgeTypeV1 = {
  TRUNK: 'TRUNK',
  BRANCH: 'BRANCH',
  SECONDARY_CONNECTOR: 'SECONDARY_CONNECTOR',
  TRANSFORMER_LINK: 'TRANSFORMER_LINK',
  BUS_COUPLER: 'BUS_COUPLER',
} as const;

export type EdgeTypeV1 = (typeof EdgeTypeV1)[keyof typeof EdgeTypeV1];

// =============================================================================
// NODE ATTRIBUTES
// =============================================================================

export interface VisualNodeAttributesV1 {
  /** Etykieta węzła (Polish, no codenames). */
  readonly label?: string;
  /** Napięcie nominalne [kV]. */
  readonly voltageKv?: number;
  /** Symbol ID z canonical_symbols/ports.json. */
  readonly symbolId?: string;
  /** Moc zainstalowana [MW] (dla generatorów/obciążeń). */
  readonly nominalMw?: number;
  /** Referencja do katalogu. */
  readonly catalogRef?: string;
  /** Czy element jest aktywny (normalnie załączony). */
  readonly isNormallyOn?: boolean;
  /** Dodatkowe atrybuty domenowe. */
  readonly [key: string]: unknown;
}

// =============================================================================
// EDGE ATTRIBUTES
// =============================================================================

export interface VisualEdgeAttributesV1 {
  /** Etykieta krawędzi (Polish). */
  readonly label?: string;
  /** Typ linii/kabla (dla wizualizacji kresku). */
  readonly lineType?: 'overhead' | 'cable';
  /** Napięcie nominalne [kV]. */
  readonly voltageKv?: number;
  /** Referencja do katalogu. */
  readonly catalogRef?: string;
  /** Dodatkowe atrybuty domenowe. */
  readonly [key: string]: unknown;
}

// =============================================================================
// VISUAL NODE
// =============================================================================

export interface VisualNodeV1 {
  readonly id: string;
  readonly nodeType: NodeTypeV1;
  readonly attributes: VisualNodeAttributesV1;
}

// =============================================================================
// VISUAL EDGE
// =============================================================================

/**
 * Krawędź w VisualGraphV1.
 *
 * P0.3 F2: fromPortRef.portId + toPortRef.portId pozwalają na port-based routing
 * w phase4_route_all_edges. Gdy portId jest pusty (''), phase4 używa center-to-center
 * jako fallback (kompatybilność wsteczna).
 */
export interface VisualEdgeV1 {
  readonly id: string;
  readonly fromPortRef: PortRefV1;
  readonly toPortRef: PortRefV1;
  readonly edgeType: EdgeTypeV1;
  readonly isNormallyOpen: boolean;
  readonly attributes: VisualEdgeAttributesV1;
}

// =============================================================================
// VISUAL GRAPH
// =============================================================================

export interface VisualGraphV1 {
  readonly nodes: readonly VisualNodeV1[];
  readonly edges: readonly VisualEdgeV1[];
}
