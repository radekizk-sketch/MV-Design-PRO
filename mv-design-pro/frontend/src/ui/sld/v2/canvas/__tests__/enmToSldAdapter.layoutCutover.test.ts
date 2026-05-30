/**
 * Cutover §4 — żywa kanwa rysuje geometrię z silnika layoutu (drzewo + zakotwiczenie),
 * nie ze slotów. Dowód na REALNYM substracie ≥52 stacji (ten sam fixture co
 * `portAnchoredGeometry.substrate.test.ts`).
 *
 * @see docs/sld/SLD_GEOMETRY_CONTRACT_V1.md §1 (kontrakt), §2 (drzewo), §4 (migracja)
 *
 * Most: kanoniczny ENM (sldSubstrate52s) → `buildSldDataFromSnapshot` (ŻYWY adapter
 * kanwy) → propsy rendererów. Sprawdzamy, że propsy NIESIE geometria drzewa:
 *  C-1  stacje rozłożone w DRZEWO (wiele pasm Y = magistrala + laterale), NIE
 *       w „grzebień" (jeden rząd) — V-01/V-03/V-09.
 *  C-2  ZERO wiszących: KAŻDY cable run kończy się PRZY węźle (stacja/GPZ), nie
 *       w pustej przestrzeni — V-07 w praktyce (kabel dochodzi do stacji).
 *  C-3  wypełnienie kadru: bbox stacji rozciągnięty w obu osiach (drzewo zajmuje
 *       powierzchnię, nie linię).
 *  C-4  determinizm: ten sam ENM → identyczna geometria (Z7).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import { buildSldDataFromSnapshot, type SldDataPayload } from '../enmToSldAdapter';
import { buildSldLayoutGeometry, nodeCenter } from '../sldGeometryFromLayout';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  'geometry',
  '__tests__',
  'fixtures',
  'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { enm: EnergyNetworkModel }).enm;

interface Pt {
  readonly x: number;
  readonly y: number;
}

function nodePositions(data: SldDataPayload): Pt[] {
  return [
    ...data.stations.map((s) => ({ x: s.x, y: s.y })),
    ...data.gpzs.map((g) => ({ x: g.x, y: g.y })),
  ];
}

function nearestNodeDistance(point: Pt, nodes: readonly Pt[]): number {
  let best = Infinity;
  for (const node of nodes) {
    const d = Math.hypot(node.x - point.x, node.y - point.y);
    if (d < best) best = d;
  }
  return best;
}

function geometryFingerprint(data: SldDataPayload): string {
  const stations = data.stations
    .map((s) => `${s.id}:${s.x.toFixed(3)},${s.y.toFixed(3)}`)
    .sort()
    .join('|');
  const runs = data.cableRuns
    .map(
      (r) =>
        `${r.id}:${r.pathPoints.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(';')}`,
    )
    .sort()
    .join('|');
  return `${stations}#${runs}`;
}

describe('§4 cutover — żywa kanwa rysuje geometrię drzewa z silnika layoutu', () => {
  it('substrat ≥52 stacji buduje się przez żywy adapter', () => {
    const data = buildSldDataFromSnapshot(enm, null);
    expect(data.stations.length).toBeGreaterThanOrEqual(52);
    expect(data.gpzs.length).toBeGreaterThanOrEqual(1);
    expect(data.cableRuns.length).toBeGreaterThan(0);
  });

  it('C-1: stacje rozłożone w DRZEWO (wiele pasm Y), nie w grzebień (jeden rząd)', () => {
    const data = buildSldDataFromSnapshot(enm, null);
    // Grzebień = wszystkie stacje na jednym poziomie Y (1 pasmo). Drzewo
    // (magistrala + laterale nad/pod osią) = WIELE pasm Y. Zaokrąglamy do 1 px,
    // by drobne różnice wysokości bloków nie zliczały się jako osobne pasma.
    const distinctYBands = new Set(data.stations.map((s) => Math.round(s.y))).size;
    expect(
      distinctYBands,
      `stacje są w ${distinctYBands} pasmach Y — drzewo wymaga ≥3 (magistrala + laterale)`,
    ).toBeGreaterThanOrEqual(3);
  });

  it('C-2: ZERO wiszących — każdy cable run kończy się PRZY węźle (stacja/GPZ)', () => {
    const data = buildSldDataFromSnapshot(enm, null);
    const nodes = nodePositions(data);
    expect(nodes.length).toBeGreaterThan(0);

    // Tolerancje: start kabla = głowica pola / port stacji (blisko węzła);
    // koniec = ostatnia stacja ciągu (z marginesem na kontynuację segmentów za
    // ostatnią stacją). Próg 1000 px łapie regresję „wiszenia w slotach"
    // (przed naprawą origin-pola koniec sięgał ~2864 px od najbliższego węzła),
    // a dopuszcza krótką kontynuację trunku za ostatnią stacją.
    const START_TOL = 260;
    const END_TOL = 1000;
    const hangingStart: string[] = [];
    const hangingEnd: string[] = [];
    for (const run of data.cableRuns) {
      const pts = run.pathPoints;
      if (pts.length < 2) continue;
      const startD = nearestNodeDistance(pts[0], nodes);
      const endD = nearestNodeDistance(pts[pts.length - 1], nodes);
      if (startD > START_TOL) hangingStart.push(`${run.id}(start=${Math.round(startD)})`);
      if (endD > END_TOL) hangingEnd.push(`${run.id}(end=${Math.round(endD)})`);
    }
    expect(hangingStart, `runy z wiszącym POCZĄTKIEM: ${hangingStart.join('; ')}`).toHaveLength(0);
    expect(hangingEnd, `runy z wiszącym KOŃCEM: ${hangingEnd.join('; ')}`).toHaveLength(0);
  });

  it('C-3: wypełnienie kadru — bbox stacji rozciągnięty w obu osiach (drzewo, nie linia)', () => {
    const data = buildSldDataFromSnapshot(enm, null);
    const xs = data.stations.map((s) => s.x);
    const ys = data.stations.map((s) => s.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    // Drzewo zajmuje powierzchnię: istotna rozpiętość w X (magistrala) i w Y
    // (laterale nad/pod osią). Grzebień miałby height≈0.
    expect(width, 'rozpiętość X stacji').toBeGreaterThan(400);
    expect(height, 'rozpiętość Y stacji (laterale)').toBeGreaterThan(120);
  });

  it('C-4: determinizm — ten sam ENM → identyczna geometria stacji i kabli', () => {
    const a = buildSldDataFromSnapshot(enm, null);
    const b = buildSldDataFromSnapshot(enm, null);
    expect(geometryFingerprint(a)).toBe(geometryFingerprint(b));
  });

  it('C-5: pozycje stacji POCHODZĄ z silnika layoutu (jedna prawda), nie ze slotów', () => {
    // Najmocniejszy dowód cutoveru: każda renderowana stacja stoi DOKŁADNIE w
    // środku swojego węzła z `LayoutResult` (a GPZ w lewym-górnym węźle). To
    // wiąże propsy rendererów z silnikiem geometrii — nie z `X_STATIONS_START +
    // j×pitch`. Gdyby adapter liczył pozycje ze slotów, te wartości by się
    // rozjechały.
    const data = buildSldDataFromSnapshot(enm, null);
    const layout = buildSldLayoutGeometry(enm, enm.header?.hash_sha256 ?? 'enm');
    expect(layout, 'silnik layoutu zwrócił geometrię dla substratu').not.toBeNull();
    if (!layout) return;

    const mismatched: string[] = [];
    for (const station of data.stations) {
      const node = layout.nodeByRef.get(station.id);
      expect(node, `stacja ${station.id} ma węzeł w LayoutResult`).toBeDefined();
      if (!node) continue;
      const center = nodeCenter(node);
      if (Math.abs(center.x - station.x) > 0.01 || Math.abs(center.y - station.y) > 0.01) {
        mismatched.push(station.id);
      }
    }
    expect(
      mismatched,
      `stacje nie w środku węzła layoutu: ${mismatched.slice(0, 5).join('; ')}`,
    ).toHaveLength(0);

    // GPZ kotwiczy lewym-górnym węzła (konwencja GpzRenderer).
    for (const gpz of data.gpzs) {
      const node = layout.nodeByRef.get(gpz.id);
      if (!node) continue;
      expect(Math.abs(node.x - gpz.x)).toBeLessThan(0.01);
      expect(Math.abs(node.y - gpz.y)).toBeLessThan(0.01);
    }
  });
});
