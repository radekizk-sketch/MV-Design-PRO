/**
 * SLD V2 — Hash Triad (Phase 0A).
 *
 * Trzy poziomy hashy semantycznych:
 *   - topology_hash : domena (porty, endpointy, stany aparatów, catalog_refs).
 *   - layout_hash   : geometria (pozycje, bend points, route locks).
 *   - view_hash     : prezentacja (LOD, viewport, anonimizacja).
 *
 * Inwarianty (Acceptance Invariants 6-8):
 *   - Zmiana LOD → tylko view_hash zmienia się.
 *   - Manual bend → tylko layout_hash zmienia się.
 *   - Anonimizacja → tylko view_hash zmienia się.
 *   - Append station → topology_hash i layout_hash zmieniają się.
 *
 * Hash: deterministyczny FNV-1a 32-bit nad stabilnie posortowanym JSON-em.
 * Nie używamy SHA-256 (potrzebny SubtleCrypto.digest, async; tutaj
 * sygnatura sync jest wymagana dla testów hash triad invariants).
 *
 * @see SLD_TEST_MATRIX.md (hash triad invariants)
 */

// =============================================================================
// Deterministic JSON
// =============================================================================

/**
 * Stable JSON: klucze obiektów posortowane alfabetycznie, wartości
 * undefined skipped, NaN/Infinity → null. Działa rekurencyjnie.
 */
function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'undefined') return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'null';
    return JSON.stringify(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => stableStringify(v));
    return `[${items.join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => typeof v !== 'undefined')
      .sort(([a], [b]) => a.localeCompare(b));
    const parts = entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${parts.join(',')}}`;
  }
  return 'null';
}

/**
 * FNV-1a 32-bit. Deterministyczny, szybki, dostatecznie unikalny dla
 * naszych celów (różnicowanie hashy pod test-suitem). Nie wystarcza do
 * audytu kryptograficznego — to zadanie backendu (SHA-256 na ENM).
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function hash(input: unknown, prefix: string): string {
  return `${prefix}_${fnv1a(stableStringify(input))}`;
}

// =============================================================================
// Topology hash
// =============================================================================

/**
 * Wycinek domeny używany do `topology_hash`. NIE zawiera pozycji ani LOD —
 * topology_hash jest niezmienny pod względem layoutu i widoku.
 */
export interface TopologySnapshot {
  readonly objects: readonly TopologyObject[];
  readonly connections: readonly TopologyConnection[];
  /**
   * GPZ sekcje (LV + HV) z couplerami — wymagane dla deterministycznego
   * topology_hash gdy operator edytuje sekcje (Phase 0B/0C).
   * Audyt system §A: bez tego pola hash niezmienny przy zmianie sekcji.
   */
  readonly gpzSections?: readonly TopologyGpzSection[];
  readonly gpzCouplers?: readonly TopologyGpzCoupler[];
  /**
   * Bays per sekcja z qDesignations + esState — wymagane bo refaktor
   * konfiguracji aparatury w polu zmienia topologię elektryczną.
   */
  readonly gpzBays?: readonly TopologyGpzBay[];
}

export interface TopologyObject {
  readonly ref: string;
  readonly kind: string;
  readonly catalogRef?: string | null;
  readonly switchingState?: string | null;
  readonly safetyState?: string | null;
  readonly ports?: readonly { id: string; kind: string }[];
}

export interface TopologyConnection {
  readonly fromPortId: string;
  readonly toPortId: string;
  readonly kind: string;
  readonly catalogRef?: string | null;
}

export interface TopologyGpzSection {
  readonly sectionId: string;
  /** GPZ ref_id który zawiera sekcję. */
  readonly substationRef: string;
  /** Tier napięciowy: 'lv' (15 kV) lub 'hv' (110 kV). */
  readonly tier: 'lv' | 'hv';
  readonly order: number;
  readonly busVoltageKv: number;
  /** Lista bay refs przypisanych do sekcji (sortowane). */
  readonly bayRefs: readonly string[];
}

export interface TopologyGpzCoupler {
  readonly couplerId: string;
  /** Stan łączeniowy: 'closed' | 'open' | 'unknown'. */
  readonly closedState: string;
  readonly leftSectionId: string;
  readonly rightSectionId: string;
}

export interface TopologyGpzBay {
  readonly bayRef: string;
  readonly fieldRole: string;
  readonly esState?: string | null;
  /** Q-numbers per slot (Q0, Q1, Q9, Q8, T1) — IEC 81346-2. */
  readonly qDesignations?: Readonly<Record<string, string>> | null;
}

export function computeTopologyHash(snapshot: TopologySnapshot): string {
  const canonical = {
    objects: snapshot.objects
      .map((o) => ({
        ref: o.ref,
        kind: o.kind,
        catalog: o.catalogRef ?? null,
        sw: o.switchingState ?? null,
        sf: o.safetyState ?? null,
        ports: (o.ports ?? []).map((p) => ({ id: p.id, kind: p.kind })),
      }))
      .sort((a, b) => a.ref.localeCompare(b.ref)),
    connections: snapshot.connections
      .map((c) => ({
        from: c.fromPortId,
        to: c.toPortId,
        kind: c.kind,
        catalog: c.catalogRef ?? null,
      }))
      .sort((a, b) =>
        a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from),
      ),
    gpzSections: (snapshot.gpzSections ?? [])
      .map((s) => ({
        ref: s.sectionId,
        sub: s.substationRef,
        tier: s.tier,
        order: s.order,
        v: s.busVoltageKv,
        bays: [...s.bayRefs].sort(),
      }))
      .sort((a, b) => a.ref.localeCompare(b.ref)),
    gpzCouplers: (snapshot.gpzCouplers ?? [])
      .map((c) => ({
        ref: c.couplerId,
        cs: c.closedState,
        l: c.leftSectionId,
        r: c.rightSectionId,
      }))
      .sort((a, b) => a.ref.localeCompare(b.ref)),
    gpzBays: (snapshot.gpzBays ?? [])
      .map((b) => ({
        ref: b.bayRef,
        role: b.fieldRole,
        es: b.esState ?? null,
        q: b.qDesignations
          ? Object.entries(b.qDesignations)
              .sort(([a], [c]) => a.localeCompare(c))
              .map(([k, v]) => `${k}=${v}`)
              .join('|')
          : null,
      }))
      .sort((a, b) => a.ref.localeCompare(b.ref)),
  };
  return hash(canonical, 'top');
}

// =============================================================================
// Layout hash
// =============================================================================

/**
 * Wycinek layoutu — geometria deterministyczna.
 * Współrzędne zaokrąglane do 0.01px aby uniknąć szumu floating-point.
 */
export interface LayoutSnapshot {
  readonly objectPositions: readonly { ref: string; x: number; y: number }[];
  readonly routes: readonly LayoutRoute[];
  readonly labelLocks: readonly { ref: string; locked: boolean }[];
}

export interface LayoutRoute {
  readonly id: string;
  readonly bendPoints: readonly { x: number; y: number }[];
  readonly locked: boolean;
}

const COORD_PRECISION = 100;

function quantize(n: number): number {
  return Math.round(n * COORD_PRECISION) / COORD_PRECISION;
}

export function computeLayoutHash(snapshot: LayoutSnapshot): string {
  const canonical = {
    positions: snapshot.objectPositions
      .map((p) => ({ ref: p.ref, x: quantize(p.x), y: quantize(p.y) }))
      .sort((a, b) => a.ref.localeCompare(b.ref)),
    routes: snapshot.routes
      .map((r) => ({
        id: r.id,
        locked: r.locked,
        bends: r.bendPoints.map((b) => ({ x: quantize(b.x), y: quantize(b.y) })),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    labels: snapshot.labelLocks
      .map((l) => ({ ref: l.ref, locked: l.locked }))
      .sort((a, b) => a.ref.localeCompare(b.ref)),
  };
  return hash(canonical, 'lay');
}

// =============================================================================
// View hash
// =============================================================================

/** Stan prezentacji — LOD, viewport, anonimizacja, warstwy. */
export interface ViewSnapshot {
  readonly lod: number;
  readonly viewportScale: number;
  readonly viewportTx: number;
  readonly viewportTy: number;
  readonly anonymizationOn: boolean;
  readonly anonymizationToggles: AnonymizationToggles;
  readonly visibleLayers: readonly string[];
}

export interface AnonymizationToggles {
  readonly hideNames: boolean;
  readonly hideAddresses: boolean;
  readonly hideCadastral: boolean;
  readonly hidePower: boolean;
  readonly hideResults: boolean;
  readonly preserveTypes: boolean;
}

export const DEFAULT_ANONYMIZATION_TOGGLES: AnonymizationToggles = {
  hideNames: false,
  hideAddresses: false,
  hideCadastral: false,
  hidePower: false,
  hideResults: false,
  preserveTypes: true,
};

export function computeViewHash(snapshot: ViewSnapshot): string {
  const canonical = {
    lod: snapshot.lod,
    vp: {
      s: quantize(snapshot.viewportScale),
      x: quantize(snapshot.viewportTx),
      y: quantize(snapshot.viewportTy),
    },
    anon: snapshot.anonymizationOn,
    toggles: snapshot.anonymizationToggles,
    layers: [...snapshot.visibleLayers].sort(),
  };
  return hash(canonical, 'vie');
}

// =============================================================================
// Triad combined helper
// =============================================================================

export interface HashTriad {
  readonly topologyHash: string;
  readonly layoutHash: string;
  readonly viewHash: string;
}

export function computeHashTriad(
  topology: TopologySnapshot,
  layout: LayoutSnapshot,
  view: ViewSnapshot,
): HashTriad {
  return {
    topologyHash: computeTopologyHash(topology),
    layoutHash: computeLayoutHash(layout),
    viewHash: computeViewHash(view),
  };
}

// =============================================================================
// Test helpers (Phase 7 invariants)
// =============================================================================

/**
 * Test invariant: zmiana LOD nie zmienia topology/layout, tylko view.
 * Zwraca opis naruszenia lub null.
 */
export function assertOnlyViewHashChanged(
  before: HashTriad,
  after: HashTriad,
): string | null {
  if (before.topologyHash !== after.topologyHash) {
    return `topology_hash zmienił się: ${before.topologyHash} → ${after.topologyHash}`;
  }
  if (before.layoutHash !== after.layoutHash) {
    return `layout_hash zmienił się: ${before.layoutHash} → ${after.layoutHash}`;
  }
  if (before.viewHash === after.viewHash) {
    return `view_hash niezmieniony, choć oczekiwana zmiana: ${before.viewHash}`;
  }
  return null;
}

export function assertOnlyLayoutHashChanged(
  before: HashTriad,
  after: HashTriad,
): string | null {
  if (before.topologyHash !== after.topologyHash) {
    return `topology_hash zmienił się: ${before.topologyHash} → ${after.topologyHash}`;
  }
  if (before.layoutHash === after.layoutHash) {
    return `layout_hash niezmieniony, choć oczekiwana zmiana: ${before.layoutHash}`;
  }
  // view_hash może się zmienić lub nie — nie wymuszamy.
  return null;
}

export function assertTopologyAndLayoutChanged(
  before: HashTriad,
  after: HashTriad,
): string | null {
  if (before.topologyHash === after.topologyHash) {
    return `topology_hash niezmieniony, choć oczekiwana zmiana: ${before.topologyHash}`;
  }
  if (before.layoutHash === after.layoutHash) {
    return `layout_hash niezmieniony, choć oczekiwana zmiana: ${before.layoutHash}`;
  }
  return null;
}
