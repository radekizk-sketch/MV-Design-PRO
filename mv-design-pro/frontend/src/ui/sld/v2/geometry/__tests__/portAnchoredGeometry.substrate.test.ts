/**
 * M-03 / V-07 — port-anchoring acceptance na realnym substracie ≥52 stacji.
 *
 * @see docs/sld/SLD_GEOMETRY_CONTRACT_V1.md §1, §4
 *
 * Dowód maszynowy (warstwa ODCZYTU rendererów `buildPortAnchoredGeometryFromENM`):
 *   M-03a ZERO wiszących — KAŻDA renderowana krawędź ma oba końce DOKŁADNIE w
 *         realnym `PortAnchor` (fromPort/toPort istnieją; pathPoints[0]==fromPort,
 *         pathPoints[last]==toPort); brak `pathPoint`, który nie kończy się w porcie.
 *   M-03b BEZ „drugiej prawdy" — pozycje pochodzą wyłącznie z `LayoutResult`;
 *         żadna stała slotowa (`Y_RUN_BASE` itd.) nie zasila ścieżki pozycji w
 *         module odczytu (statyczny audyt źródła).
 *   M-03c Determinizm — ten sam snapshot → identyczna geometria krawędzi.
 *
 * Most: kanoniczny fixture ENM (sldSubstrate52s.enm.json) → readTopologyFromENM
 * (REALNY reader) → LayoutEngine.layout → port-anchored read layer.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  buildPortAnchoredGeometryFromENM,
  indexPorts,
  toCableRuns,
  type LayoutFrame,
  type PortAnchoredEdge,
  type PortAnchoredGeometry,
} from '../index';
import fixture from './fixtures/sldSubstrate52s.enm.json';

const enm = (fixture as { enm: unknown }).enm as EnergyNetworkModel;
const SNAP_ID = 'sld-substrate-52s';
const FRAME: LayoutFrame = { width: 1600, height: 900, padding: 40 };

const ANCHOR_TOL = 0.01;

function geometry(lod?: 'L0' | 'L1' | 'L2'): PortAnchoredGeometry {
  return buildPortAnchoredGeometryFromENM(enm, SNAP_ID, 'topological', lod, { frame: FRAME });
}

/** Każdy końcowy punkt polyline pokrywa się z pozycją odpowiedniego portu. */
function endpointsAnchored(edge: PortAnchoredEdge): { from: boolean; to: boolean } {
  const first = edge.pathPoints[0];
  const last = edge.pathPoints[edge.pathPoints.length - 1];
  return {
    from:
      first !== undefined &&
      Math.abs(first.x - edge.fromPort.x) < ANCHOR_TOL &&
      Math.abs(first.y - edge.fromPort.y) < ANCHOR_TOL,
    to:
      last !== undefined &&
      Math.abs(last.x - edge.toPort.x) < ANCHOR_TOL &&
      Math.abs(last.y - edge.toPort.y) < ANCHOR_TOL,
  };
}

function fingerprintEdges(edges: readonly PortAnchoredEdge[]): string {
  return edges
    .map(
      (e) =>
        `${e.ref}|${e.fromPortId}->${e.toPortId}|${e.pathPoints
          .map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)
          .join(';')}`,
    )
    .sort()
    .join('\n');
}

describe('M-03 read-path bridge sanity', () => {
  it('builds port-anchored geometry from the real ≥52-station substrate', () => {
    const g = geometry();
    // stacje (L0) + pola + aparaty obecne; krawędzie istnieją
    expect(g.layout.nodes.length).toBeGreaterThanOrEqual(52);
    expect(g.edges.length).toBeGreaterThan(0);
    // indeks portów obejmuje całą zagnieżdżoną hierarchię
    expect(g.portIndex.size).toBeGreaterThan(0);
  });
});

describe('M-03a V-07: zero hanging edges (every endpoint on a real PortAnchor)', () => {
  for (const lod of [undefined, 'L0', 'L1', 'L2'] as const) {
    it(`every rendered edge is port-anchored at both ends (lod=${lod ?? 'full'})`, () => {
      const g = geometry(lod);
      expect(g.edges.length).toBeGreaterThan(0);

      // (1) zero odrzuconych — żadna krawędź z LayoutResult nie wskazuje na
      //     nieistniejący port (gdyby tak było, byłaby wisząca).
      expect(g.droppedEdgeRefs, `dropped: ${g.droppedEdgeRefs.join(', ')}`).toHaveLength(0);

      // (2) każdy fromPortId/toPortId to realny port w indeksie geometrii.
      const portIds = new Set(g.portIndex.keys());
      let anchoredFrom = 0;
      let anchoredTo = 0;
      const dangling: string[] = [];
      for (const edge of g.edges) {
        expect(portIds.has(edge.fromPortId), `from ${edge.fromPortId} not a real port`).toBe(true);
        expect(portIds.has(edge.toPortId), `to ${edge.toPortId} not a real port`).toBe(true);
        // (3) końce polyline pokrywają się z pozycją portu (anchored, nie wiszące).
        const { from, to } = endpointsAnchored(edge);
        if (from) anchoredFrom += 1;
        if (to) anchoredTo += 1;
        if (!from || !to) dangling.push(`${edge.ref}(from=${from},to=${to})`);
      }
      // 100% zakotwiczonych końców — ZERO wiszących.
      expect(dangling, `dangling endpoints: ${dangling.slice(0, 8).join('; ')}`).toHaveLength(0);
      expect(anchoredFrom).toBe(g.edges.length);
      expect(anchoredTo).toBe(g.edges.length);
    });
  }

  it('measured: edge count + all-anchored confirmation (full nested)', () => {
    const g = geometry();
    const total = g.edges.length;
    const bothAnchored = g.edges.filter((e) => {
      const a = endpointsAnchored(e);
      return a.from && a.to;
    }).length;
    // Pomiar do raportu: liczba krawędzi i 100% zakotwiczenia.
    expect(total).toBeGreaterThan(0);
    expect(bothAnchored).toBe(total);
  });
});

describe('M-03c determinism: same snapshot → identical edge geometry', () => {
  it('two read passes produce identical port-anchored edges', () => {
    const a = geometry();
    const b = geometry();
    expect(fingerprintEdges(a.edges)).toBe(fingerprintEdges(b.edges));
  });

  it('determinism holds per LOD projection', () => {
    for (const lod of ['L0', 'L1', 'L2'] as const) {
      const a = geometry(lod);
      const b = geometry(lod);
      expect(fingerprintEdges(a.edges), `lod ${lod}`).toBe(fingerprintEdges(b.edges));
    }
  });
});

describe('indexPorts covers nested hierarchy (one truth)', () => {
  it('indexes ports from stations, fields and apparatus', () => {
    const g = geometry();
    const direct = indexPorts(g.layout.nodes);
    // ten sam zestaw portów co w wyniku warstwy odczytu
    expect(direct.size).toBe(g.portIndex.size);
    // every edge endpoint resolvable from the freshly built index
    for (const e of g.edges) {
      expect(direct.has(e.fromPortId)).toBe(true);
      expect(direct.has(e.toPortId)).toBe(true);
    }
  });
});

describe('renderer-facing runs read pathPoints from LayoutResult (no recomputation)', () => {
  it('toCableRuns: one run per edge, pathPoints == engine polyline, endpoints anchored', () => {
    const g = geometry();
    const runs = toCableRuns(g.edges);
    // jeden run na krawędź; brak gubienia/dublowania
    expect(runs.length).toBe(g.edges.length);
    const portIndex = g.portIndex;
    for (let i = 0; i < runs.length; i += 1) {
      const run = runs[i];
      const edge = g.edges[i];
      // pathPoints to dokładnie polyline z silnika (ta sama tablica referencji)
      expect(run.pathPoints).toBe(edge.pathPoints);
      // końce runu zakotwiczone w realnych portach (V-07 w warstwie renderu)
      const fromPort = portIndex.get(run.fromPortId)!;
      const toPort = portIndex.get(run.toPortId)!;
      const first = run.pathPoints[0];
      const last = run.pathPoints[run.pathPoints.length - 1];
      expect(Math.abs(first.x - fromPort.x)).toBeLessThan(ANCHOR_TOL);
      expect(Math.abs(first.y - fromPort.y)).toBeLessThan(ANCHOR_TOL);
      expect(Math.abs(last.x - toPort.x)).toBeLessThan(ANCHOR_TOL);
      expect(Math.abs(last.y - toPort.y)).toBeLessThan(ANCHOR_TOL);
    }
  });
});

describe('M-03b no second truth: read layer uses zero slot constants for positions', () => {
  it('portAnchoredGeometry.ts source contains no slot-position constants', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(resolve(here, '..', 'portAnchoredGeometry.ts'), 'utf8');
    // Audyt CODE-ONLY: usuń komentarze (blokowe + liniowe), bo docstring tego
    // modułu wymienia stałe slotowe z nazwy (opisując, że są USUNIĘTE z kodu).
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    // Stałe slotowe zlikwidowane w ścieżce pozycji (kontrakt §4). Te tokeny
    // NIE mogą zasilać żadnej pozycji w warstwie odczytu — pozycje pochodzą
    // wyłącznie z LayoutResult.
    const forbidden = [
      'Y_RUN_BASE',
      'X_STATIONS_START',
      'GPZ_FIELD_CABLE_HEAD_CLEARANCE_Y',
      'GPZ_FIELD_CABLE_HEAD_Y',
      'RUN_PITCH',
      'STATION_PITCH',
      'stationXFromCumKm',
    ];
    for (const token of forbidden) {
      expect(src.includes(token), `slot constant leaked into read layer: ${token}`).toBe(false);
    }
  });

  it('positions come only from LayoutResult (edges reference engine ports verbatim)', () => {
    const g = geometry();
    // Każdy port krawędzi to dokładnie obiekt z layout.nodes[].ports (ta sama
    // referencja pozycji — brak kopii liczonej osobno).
    const idx = indexPorts(g.layout.nodes);
    for (const e of g.edges) {
      expect(e.fromPort).toBe(idx.get(e.fromPortId));
      expect(e.toPort).toBe(idx.get(e.toPortId));
    }
  });
});
