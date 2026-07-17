/**
 * F13.2 (D3-3/D3-11/D3-13, spec §22.1) — testy czystego modułu skrzyżowań.
 * Sekcja C: testy negatywne (wyrocznia/kontrakt MUSI gryźć).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import type { PreviewSegment } from '../../compose/preview';
import { buildSceneV3 } from '../buildScene';
import {
  BRIDGE_RADIUS,
  bridgePointsForPolyline,
  busBandClearanceGaps,
  crossingBusGaps,
  entryCollinearityGaps,
  interiorCrossings,
  polylinePathWithBridges,
  verticalPathWithBridges,
} from '../crossings';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
const enm = (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm;

function seg(points: { x: number; y: number }[], kind?: string, ownerRef?: string): PreviewSegment {
  return { points, meta: { kind: kind as never, ownerRef } };
}

describe('F13.2 A — interiorCrossings (detekcja)', () => {
  it('wykrywa przecięcie ścisłe wewnętrzne H×V; styk końcem (węzeł T) NIE jest przecięciem', () => {
    const H = seg([{ x: 0, y: 10 }, { x: 100, y: 10 }], 'sn', 'H');
    const Vcross = seg([{ x: 50, y: 0 }, { x: 50, y: 20 }], 'sn', 'V');
    const Vtouch = seg([{ x: 80, y: 10 }, { x: 80, y: 40 }], 'sn', 'T');
    const crossings = interiorCrossings([H, Vcross, Vtouch]);
    expect(crossings).toHaveLength(1);
    expect(crossings[0]).toMatchObject({ x: 50, y: 10, hOwnerRef: 'H', vOwnerRef: 'V', involvesBus: false });
  });

  it('warstwy adnotacji (protectionTrip/measurementLink/leader) NIE uczestniczą w przecięciach toru mocy', () => {
    const H = seg([{ x: 0, y: 10 }, { x: 100, y: 10 }], 'sn');
    const Vtrip = seg([{ x: 50, y: 0 }, { x: 50, y: 20 }], 'protectionTrip');
    const Vmeas = seg([{ x: 60, y: 0 }, { x: 60, y: 20 }], 'measurementLink');
    expect(interiorCrossings([H, Vtrip, Vmeas])).toHaveLength(0);
  });

  it('fixtura referencyjna L2: dokładnie 24 przecięcia toru mocy (pomiar P-1 audytu D3), ŻADNE z szyną', () => {
    const scene = buildSceneV3(enm, 2);
    const crossings = interiorCrossings(scene.segments);
    expect(crossings).toHaveLength(24);
    expect(crossings.every((c) => !c.involvesBus)).toBe(true);
    expect(crossingBusGaps(scene.segments)).toHaveLength(0);
  });

  it('determinizm: dwa wywołania dają identyczny JSON, posortowany po (y,x)', () => {
    const scene = buildSceneV3(enm, 2);
    const a = interiorCrossings(scene.segments);
    const b = interiorCrossings(scene.segments);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (let i = 1; i < a.length; i++) {
      expect(a[i].y > a[i - 1].y || (a[i].y === a[i - 1].y && a[i].x >= a[i - 1].x)).toBe(true);
    }
  });
});

describe('F13.2 B — mostki (§22.1: pion przeskakuje poziom, promień GRID/2)', () => {
  it('bridgePointsForPolyline przypisuje mostki do właściwego PIONOWEGO odcinka polilinii', () => {
    const poly = [{ x: 50, y: 0 }, { x: 50, y: 40 }, { x: 90, y: 40 }];
    const crossings = interiorCrossings([
      seg(poly, 'sn', 'V'),
      seg([{ x: 0, y: 20 }, { x: 100, y: 20 }], 'sn', 'H'),
    ]);
    const map = bridgePointsForPolyline(poly, crossings);
    expect([...map.keys()]).toEqual([0]);
    expect(map.get(0)).toEqual([20]);
  });

  it('przecięcie z SZYNĄ nie dostaje mostka (zakaz §22.1) — trafia do crossingBusGaps', () => {
    const poly = [{ x: 50, y: 0 }, { x: 50, y: 40 }];
    const segments = [seg(poly, 'sn', 'V'), seg([{ x: 0, y: 20 }, { x: 100, y: 20 }], 'bus', 'SZYNA')];
    const map = bridgePointsForPolyline(poly, interiorCrossings(segments));
    expect(map.size).toBe(0);
    const gaps = crossingBusGaps(segments);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ x: 50, y: 20, vOwnerRef: 'V', hOwnerRef: 'SZYNA' });
  });

  it('verticalPathWithBridges: łuk o promieniu GRID/2, przerwa dokładnie ±R wokół mostka, wybrzuszenie zawsze w prawo', () => {
    const d = verticalPathWithBridges({ x: 50, y: 0 }, { x: 50, y: 40 }, [20]);
    expect(d).toBe(`M50,0 L50,${20 - BRIDGE_RADIUS} A${BRIDGE_RADIUS},${BRIDGE_RADIUS} 0 0,1 50,${20 + BRIDGE_RADIUS} L50,40`);
    // Rysowanie W GÓRĘ: sweep=0 ⇒ łuk nadal wybrzusza się w prawo (jednolita konwencja D3-11).
    const up = verticalPathWithBridges({ x: 50, y: 40 }, { x: 50, y: 0 }, [20]);
    expect(up).toBe(`M50,40 L50,${20 + BRIDGE_RADIUS} A${BRIDGE_RADIUS},${BRIDGE_RADIUS} 0 0,0 50,${20 - BRIDGE_RADIUS} L50,0`);
  });

  it('wiele mostków na jednym pionie: kolejność zgodna z kierunkiem rysowania', () => {
    const down = verticalPathWithBridges({ x: 8, y: 0 }, { x: 8, y: 100 }, [24, 72]);
    expect(down.indexOf('L8,20')).toBeLessThan(down.indexOf('L8,68'));
    const upYs = [72, 24]; // bridgePointsForPolyline odwraca dla rysowania w górę
    const up = verticalPathWithBridges({ x: 8, y: 100 }, { x: 8, y: 0 }, upYs);
    expect(up.indexOf('L8,76')).toBeLessThan(up.indexOf('L8,28'));
  });
});

describe('F13.2 B2 — polylinePathWithBridges (API renderu)', () => {
  it('bez mostków wynik IDENTYCZNY z pointsToPath (zero zmiany renderu bez przecięć)', async () => {
    const { pointsToPath } = await import('../../compose/preview');
    const poly = [{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 80, y: 40 }];
    expect(polylinePathWithBridges(poly, new Map())).toBe(pointsToPath(poly));
  });

  it('pion z mostkiem: przerwa + łuk wewnątrz polilinii, dalsze odcinki jako L', () => {
    const poly = [{ x: 50, y: 0 }, { x: 50, y: 40 }, { x: 90, y: 40 }];
    const d = polylinePathWithBridges(poly, new Map([[0, [20]]]));
    expect(d).toBe(
      `M50,0 L50,${20 - BRIDGE_RADIUS} A${BRIDGE_RADIUS},${BRIDGE_RADIUS} 0 0,1 50,${20 + BRIDGE_RADIUS} L50,40 L90,40`,
    );
  });
});

describe('F13.2 D — junction_dot_probe (§22.1, V12K-039: kropka ⇔ realny węzeł rozgałęzienia tras)', () => {
  it('fixtura L2: gramatyka rysunku nie ma węzłów T na trasach (odczepy żyją w polach stacji) i po V12K-039 nie ma też ŻADNEJ kropki — 0 luk', async () => {
    const { SYMBOL_DEFS } = await import('../../symbols/defs');
    const { externalBranchNodes, junctionDotGaps } = await import('../crossings');
    const scene = buildSceneV3(enm, 2);
    // Ustalenie D3-14: piony kanałów odgałęzień PRZECINAJĄ przęsła (bez
    // połączenia) — realnych węzłów T tras zewnętrznych na tej gramatyce
    // rysunku NIE MA (odczep elektryczny = pole odgałęźne stacji-origin).
    expect(externalBranchNodes(scene.segments)).toEqual([]);
    // Po V12K-039 scena nie niesie kropek (dawny akcent-kropka usunięty).
    expect(scene.symbols.some((s) => s.symbolId === 'branchJunction' || s.symbolId === 'junction')).toBe(false);
    expect(junctionDotGaps(scene, SYMBOL_DEFS)).toEqual([]);
  });

  it('test negatywny (a): realny węzeł T bez kropki ⇒ luka rozgalezienie-bez-kropki (na syntetycznej geometrii)', async () => {
    const { SYMBOL_DEFS } = await import('../../symbols/defs');
    const { externalBranchNodes, junctionDotGaps } = await import('../crossings');
    const segments = [
      seg([{ x: 0, y: 100 }, { x: 200, y: 100 }], 'sn', 'seg/magistrala'),
      seg([{ x: 96, y: 100 }, { x: 96, y: 300 }], 'sn', 'seg/odczep'),
    ];
    expect(externalBranchNodes(segments)).toEqual([{ x: 96, y: 100 }]);
    const gaps = junctionDotGaps({ segments, symbols: [] }, SYMBOL_DEFS);
    expect(gaps).toEqual([{ x: 96, y: 100, reason: 'rozgalezienie-bez-kropki' }]);
    // Kropka wycentrowana na węźle domyka lukę:
    const def = SYMBOL_DEFS.junction;
    const withDot = junctionDotGaps(
      { segments, symbols: [{ symbolId: 'junction', x: 96 - def.width / 2, y: 100 - def.height / 2 }] },
      SYMBOL_DEFS,
    );
    expect(withDot).toEqual([]);
  });

  it('test negatywny (b): kropka fabrykowana poza węzłem ⇒ luka kropka-bez-rozgalezienia', async () => {
    const { SYMBOL_DEFS } = await import('../../symbols/defs');
    const { junctionDotGaps } = await import('../crossings');
    const scene = buildSceneV3(enm, 2);
    const withFake = {
      segments: scene.segments,
      symbols: [...scene.symbols, { symbolId: 'junction', x: 99991, y: 99991 }],
    };
    const gaps = junctionDotGaps(withFake, SYMBOL_DEFS);
    expect(gaps.some((g) => g.reason === 'kropka-bez-rozgalezienia')).toBe(true);
  });
});

describe('F13.2 C — testy negatywne (kontrakt gryzie)', () => {
  it('scena z fabrykowanym przecięciem pion×SZYNA ⇒ crossingBusGaps zgłasza lukę', () => {
    const scene = buildSceneV3(enm, 2);
    const corrupted: PreviewSegment[] = [
      ...scene.segments,
      // pion przecinający pierwszą napotkaną szynę w jej interiorze
      (() => {
        const bus = scene.segments.find((s) => (s.meta?.kind ?? '') === 'bus')!;
        const p = bus.points[0];
        const q = bus.points[bus.points.length - 1];
        const midX = Math.round((p.x + q.x) / 2);
        return seg([{ x: midX, y: p.y - 40 }, { x: midX, y: p.y + 40 }], 'sn', 'SABOTAZ');
      })(),
    ];
    const gaps = crossingBusGaps(corrupted);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.some((g) => g.vOwnerRef === 'SABOTAZ')).toBe(true);
  });
});

describe('F13.3 — bus_band_clearance_probe (§22.3, D3-4/P-5)', () => {
  it('fixtura L0/L1/L2: 0 obcych pionów w pasie ±2×GRID żadnej szyny (przed F13.3 było 12 na L1/L2 — pomiar P-5)', () => {
    for (const lod of [0, 1, 2] as const) {
      expect(busBandClearanceGaps(buildSceneV3(enm, lod).segments)).toEqual([]);
    }
  });

  it('NEGATYW (wyrocznia gryzie): pion trasy seg/ przez pas szyny stacji ⇒ luka z właścicielami', () => {
    const scene = buildSceneV3(enm, 2);
    const bus = scene.segments.find((s) => (s.meta?.kind ?? '') === 'bus' && (s.meta?.ownerRef ?? '').startsWith('stn/'))!;
    const p = bus.points[0];
    const q = bus.points[bus.points.length - 1];
    const midX = Math.round((p.x + q.x) / 2);
    // pion NIE przecina szyny (kończy się GRID nad osią) — ale WCHODZI w pas ±2×GRID
    const corrupted = [...scene.segments, seg([{ x: midX, y: p.y - 400 }, { x: midX, y: p.y - 8 }], 'sn', 'seg/SABOTAZ/branch')];
    const gaps = busBandClearanceGaps(corrupted);
    expect(gaps.some((g) => g.vOwnerRef === 'seg/SABOTAZ/branch' && g.busOwnerRef === bus.meta?.ownerRef)).toBe(true);
  });

  it('pion WŁASNEGO pola tej szyny w pasie jest LEGALNY (zejścia pól — spec §22.3)', () => {
    const scene = buildSceneV3(enm, 2);
    const bus = scene.segments.find((s) => (s.meta?.kind ?? '') === 'bus' && (s.meta?.ownerRef ?? '').startsWith('stn/'))!;
    const scope = (bus.meta?.ownerRef ?? '').split('/').slice(0, 2).join('/');
    const p = bus.points[0];
    const q = bus.points[bus.points.length - 1];
    const midX = Math.round((p.x + q.x) / 2);
    const own = [...scene.segments, seg([{ x: midX, y: p.y }, { x: midX, y: p.y + 24 }], 'sn', `${scope}/sn_field/999#descent`)];
    expect(busBandClearanceGaps(own).some((g) => g.vOwnerRef === `${scope}/sn_field/999#descent`)).toBe(false);
  });
});

describe('F13.3 — entry_collinearity_probe (D3-15, audyt §6a)', () => {
  it('fixtura L0/L1/L2: 0 pokryć pion-zewnętrzny×pion-wewnętrzny (przed F13.3 było 12 na L1/L2)', () => {
    for (const lod of [0, 1, 2] as const) {
      expect(entryCollinearityGaps(buildSceneV3(enm, lod).segments)).toEqual([]);
    }
  });

  it('NEGATYW (wyrocznia gryzie): pion seg/ współliniowy z pionem pola stn/ ⇒ luka; styk samym końcem ⇒ zero', () => {
    const internal = seg([{ x: 100, y: 200 }, { x: 100, y: 260 }], 'sn', 'stn/X/sn_field/000#descent');
    const overlapping = seg([{ x: 100, y: 120 }, { x: 100, y: 230 }], 'sn', 'seg/Y/branch_segment_L');
    expect(entryCollinearityGaps([internal, overlapping])).toEqual([
      { x: 100, y0: 200, y1: 230, externalOwnerRef: 'seg/Y/branch_segment_L', internalOwnerRef: 'stn/X/sn_field/000#descent' },
    ]);
    // styk portowy (koniec-w-koniec) — NIE jest pokryciem interiorów
    const touching = seg([{ x: 100, y: 120 }, { x: 100, y: 200 }], 'sn', 'seg/Y/branch_segment_L');
    expect(entryCollinearityGaps([internal, touching])).toEqual([]);
  });
});
