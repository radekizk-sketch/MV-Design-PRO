/**
 * Port-Based Layout Helpers — P0.3 / PLAN_SLD_REWORK F2 foundation.
 *
 * STATUS: PURE FUNCTIONS (foundation, no breaking changes to layoutPipeline.ts)
 * Reference:
 * - docs/sld/SLD_INDUSTRIAL_SPEC_v1.md § 4.3 (port-based routing 100%)
 * - docs/audit/SLD_VISUAL_QUALITY_AUDIT.md § 2.1 (KRYTYCZNE — brak port routing)
 * - frontend/src/ui/sld/canonical_symbols/ports.json (50 symboli z port_id+kind+voltage)
 *
 * Per audyt specjalisty (background F2 LayoutEngine):
 * 1. Edge.fromPortRef.portId nie istnieje w VisualEdgeV1 — wymaga extension w follow-up
 * 2. layoutPipeline.ts:1220 phase4_route_all_edges używa center-to-center
 * 3. findPathAStar w layoutEngine.ts jest private (nie exported)
 *
 * Ten plik dostarcza CZYSTE FUNKCJE pomocnicze, które:
 * - Lookup port position w canonical_symbols/ports.json
 * - Compute Manhattan path między dwoma portami (deterministyczny)
 * - Generate orthogonal segments z grid snap
 * - Walidacja port compatibility (voltage_kv_compat overlap)
 *
 * Pełna integracja w phase4 routing — TODO w F2 sprint follow-up
 * (zgodnie z audytem: feature flag + nowa phase4_route_all_edges_portbased).
 *
 * INVARIANTS:
 * - PURE functions (no side effects, no DOM access)
 * - DETERMINISTIC (same input → identical output)
 * - NO physics (only geometry + lookups)
 */

import portsManifest from '../canonical_symbols/ports.json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PortKind = 'BUS' | 'LINE_IN' | 'LINE_OUT' | 'EARTH' | 'TAP';

export interface PortDefinition {
  /** Port-local coordinate within symbol viewBox (typically 0–100). */
  x: number;
  y: number;
  /** Electrical role of the port (optional in legacy entries, required for new). */
  kind?: PortKind;
  /** Voltage levels [kV] compatible with this port. */
  voltage_kv_compat?: readonly number[];
}

export interface SymbolPortManifest {
  description: string;
  viewBox: string;
  ports: Readonly<Record<string, PortDefinition>>;
  allowedRotations?: readonly number[];
  defaultRotation?: number;
  notes?: string;
}

export interface PortPosition {
  /** Absolute X in canvas coordinate space. */
  x: number;
  /** Absolute Y in canvas coordinate space. */
  y: number;
  /** Port identifier within symbol (`top`, `bottom`, `left_s1`, ...). */
  portId: string;
}

export interface OrthogonalSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// ---------------------------------------------------------------------------
// Port lookup helpers
// ---------------------------------------------------------------------------

const SYMBOLS = (portsManifest as { symbols: Record<string, SymbolPortManifest> })
  .symbols;

/**
 * Retrieve port manifest entry for a given symbol_id.
 *
 * Returns `null` when symbol not found (defensive — caller decides handling).
 */
export function getSymbolManifest(symbolId: string): SymbolPortManifest | null {
  const entry = SYMBOLS[symbolId];
  return entry ?? null;
}

/**
 * Get port definition (local coords + kind + voltage compat) by symbol+port id.
 *
 * Returns `null` when symbol or port not found. Pure lookup, no fallback.
 */
export function getPortDefinition(
  symbolId: string,
  portId: string,
): PortDefinition | null {
  const symbol = getSymbolManifest(symbolId);
  if (symbol === null) return null;
  const port = symbol.ports[portId];
  if (port === undefined) return null;
  return port;
}

/**
 * List all port IDs available for a given symbol.
 *
 * Returns empty array when symbol not found (no throw — defensive).
 */
export function listSymbolPorts(symbolId: string): readonly string[] {
  const symbol = getSymbolManifest(symbolId);
  if (symbol === null) return [];
  return Object.keys(symbol.ports);
}

// ---------------------------------------------------------------------------
// Coordinate transformation
// ---------------------------------------------------------------------------

/**
 * Resolve port-local coordinates to absolute canvas coords.
 *
 * Assumes symbol is rendered at `(originX, originY)` with size matching its
 * declared viewBox (typically 100×100). Caller can pass `scale` to support
 * non-1:1 renderings.
 */
export function resolvePortPosition(
  symbolId: string,
  portId: string,
  originX: number,
  originY: number,
  scale = 1.0,
): PortPosition | null {
  const port = getPortDefinition(symbolId, portId);
  if (port === null) return null;
  return {
    x: originX + port.x * scale,
    y: originY + port.y * scale,
    portId,
  };
}

// ---------------------------------------------------------------------------
// Voltage compatibility
// ---------------------------------------------------------------------------

/**
 * Check whether two ports can be connected at a given voltage level.
 *
 * Returns:
 * - true gdy oba porty mają `voltage_kv_compat` includes `voltageKv`
 * - true gdy któryś port nie deklaruje voltage_kv_compat (legacy/wildcard)
 * - false gdy oba deklarują i target voltage NIE jest w obu
 *
 * NOTE: NIE rzuca błędu gdy któryś port nie istnieje — caller waliduje
 * istnienie wcześniej przez getPortDefinition.
 */
export function portsCompatibleAtVoltage(
  port1: PortDefinition,
  port2: PortDefinition,
  voltageKv: number,
): boolean {
  const compat1 = port1.voltage_kv_compat;
  const compat2 = port2.voltage_kv_compat;
  const ok1 = compat1 === undefined || compat1.includes(voltageKv);
  const ok2 = compat2 === undefined || compat2.includes(voltageKv);
  return ok1 && ok2;
}

// ---------------------------------------------------------------------------
// Orthogonal routing (Manhattan, port-based)
// ---------------------------------------------------------------------------

/**
 * Generate orthogonal (Manhattan) path between two port positions.
 *
 * Output: 1 lub 2 segmenty — pure L-shape (single bend) bez A*. Wystarcza dla
 * MVP F2 typowych edge'y SLD (większość połączeń to TOP↔BOTTOM lub LEFT↔RIGHT).
 *
 * Strategia:
 * - Punkty współliniowe (X lub Y identyczne) → 1 segment poziomy/pionowy
 * - Inaczej → L-shape z bendem (default: vertical-then-horizontal)
 *
 * Snap do siatki: `gridStep` (px). Domyślnie 5 — zgodnie ze SLD_INDUSTRIAL_SPEC § 5.4.
 *
 * Pure function — same input → identyczny output. Determinizm gwarantowany.
 */
export function generateOrthogonalPath(
  fromPort: PortPosition,
  toPort: PortPosition,
  options?: {
    /** Grid snap step in pixels (default 5). Values <=0 or NaN are clamped to 1 (no snap). */
    gridStep?: number;
    /** First leg orientation ('vertical' | 'horizontal'). Default vertical. */
    firstLeg?: 'vertical' | 'horizontal';
  },
): OrthogonalSegment[] {
  // CR-FIX (code-review KRYTYCZNE #1): gridStep=0 lub NaN dał NaN we
  // wszystkich segmentach → SVG crash. Clamp do 1 (effective "no snap").
  const requestedStep = options?.gridStep ?? 5;
  const gridStep = Number.isFinite(requestedStep) && requestedStep > 0 ? requestedStep : 1;
  const firstLeg = options?.firstLeg ?? 'vertical';

  const snap = (v: number) => Math.round(v / gridStep) * gridStep;
  const sx = snap(fromPort.x);
  const sy = snap(fromPort.y);
  const ex = snap(toPort.x);
  const ey = snap(toPort.y);

  // Collinear cases → single segment
  if (sx === ex && sy === ey) {
    // Zero-length — return empty (caller decides handling)
    return [];
  }
  if (sx === ex) {
    return [{ x1: sx, y1: sy, x2: ex, y2: ey }];
  }
  if (sy === ey) {
    return [{ x1: sx, y1: sy, x2: ex, y2: ey }];
  }

  // L-shape with bend
  if (firstLeg === 'vertical') {
    return [
      { x1: sx, y1: sy, x2: sx, y2: ey },
      { x1: sx, y1: ey, x2: ex, y2: ey },
    ];
  }
  return [
    { x1: sx, y1: sy, x2: ex, y2: sy },
    { x1: ex, y1: sy, x2: ex, y2: ey },
  ];
}

// ---------------------------------------------------------------------------
// Public registry stats (for guards + reports)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// High-level edge resolver
// ---------------------------------------------------------------------------

/**
 * Path segment compatible z EdgeRouteV1.segments (frontend/.../layoutResult.ts).
 *
 * Re-export pod nazwą `PortBasedPathSegment` żeby nie wprowadzać twardej
 * zależności od `EdgeRouteV1` (które przenosi inne pola). Compatible-shape only.
 */
export interface PortBasedPathSegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/**
 * Wynik routing-u port-based edge.
 *
 * Output kompatybilny strukturalnie z EdgeRouteV1 (startPoint + endPoint +
 * segments) — caller może mapować na EdgeRouteV1 wstawiając edgeId/edgeType.
 */
export interface PortBasedEdgeRoute {
  /** Port początkowy z resolvePortPosition. */
  readonly fromPort: PortPosition;
  /** Port końcowy z resolvePortPosition. */
  readonly toPort: PortPosition;
  /** Ortogonalne segmenty (Manhattan). */
  readonly segments: readonly PortBasedPathSegment[];
}

/**
 * Specyfikacja edge resolvera — opisuje endpointy + opcje routing.
 */
export interface EdgeEndpointSpec {
  /** Symbol_id z canonical_symbols/ports.json. */
  symbolId: string;
  /** Port_id w manifestu. */
  portId: string;
  /** Absolutne origin (top-left) symbolu na canvas. */
  originX: number;
  originY: number;
  /** Skala (1.0 default). */
  scale?: number;
}

/**
 * Resolve edge → port positions + Manhattan path.
 *
 * Pure top-level helper łączący 3 niższe operacje:
 * 1. resolvePortPosition(from)
 * 2. resolvePortPosition(to)
 * 3. generateOrthogonalPath
 *
 * Returns null gdy jakiś port nie jest znaleziony (defensive — caller decyduje
 * jak zalogować/fallback do center-to-center).
 *
 * INVARIANT: deterministyczny — same spec → identyczny output.
 */
export function buildEdgeRouteFromPorts(
  fromSpec: EdgeEndpointSpec,
  toSpec: EdgeEndpointSpec,
  options?: {
    gridStep?: number;
    firstLeg?: 'vertical' | 'horizontal';
  },
): PortBasedEdgeRoute | null {
  const fromPort = resolvePortPosition(
    fromSpec.symbolId,
    fromSpec.portId,
    fromSpec.originX,
    fromSpec.originY,
    fromSpec.scale ?? 1.0,
  );
  if (fromPort === null) return null;

  const toPort = resolvePortPosition(
    toSpec.symbolId,
    toSpec.portId,
    toSpec.originX,
    toSpec.originY,
    toSpec.scale ?? 1.0,
  );
  if (toPort === null) return null;

  const segments = generateOrthogonalPath(fromPort, toPort, options);
  return { fromPort, toPort, segments };
}

/**
 * Aggregate stats over canonical_symbols/ports.json — used by port_binding_guard
 * (FE side) and dev panels.
 */
export function getPortsManifestStats(): {
  symbolCount: number;
  totalPorts: number;
  portsWithKind: number;
  portsWithVoltageCompat: number;
} {
  let totalPorts = 0;
  let withKind = 0;
  let withVoltage = 0;
  for (const symbol of Object.values(SYMBOLS)) {
    for (const port of Object.values(symbol.ports)) {
      totalPorts++;
      if (port.kind !== undefined) withKind++;
      if (port.voltage_kv_compat !== undefined) withVoltage++;
    }
  }
  return {
    symbolCount: Object.keys(SYMBOLS).length,
    totalPorts,
    portsWithKind: withKind,
    portsWithVoltageCompat: withVoltage,
  };
}
