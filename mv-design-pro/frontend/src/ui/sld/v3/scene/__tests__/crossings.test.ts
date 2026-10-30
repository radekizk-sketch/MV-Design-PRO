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
  przecieciaBezMostka,
  verticalPathWithBridges,
} from '../crossings';
import { zRekordamiAparatowPol } from './fixtures/rekordyAparatowPola';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json',
);
// GEOMETRIA-STACJI (§0 pkt 4a): aparaty pól (głowice, uziemniki, odłączniki) istnieją WYŁĄCZNIE
// z rekordów modelu — sieć referencyjna niesie w polach tylko gałąź wyłącznika, więc fikstura
// deklaruje rekordy wyposażenia pól jawnie (dawniej dostarczała je konwencja roli).
const enm = zRekordamiAparatowPol(
  (JSON.parse(readFileSync(fixturePath, 'utf8')) as { readonly enm: EnergyNetworkModel }).enm,
);

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

  // Rozstrzygnięcie architekta S7-P2 (2026-10-30, `docs/sld/S7_GAP_CROSSING_ZERO_2026-07.md` §12).
  it('fixtura referencyjna L2: każde przecięcie toru mocy ma rysowalny mostek §22.1, ŻADNE nie dotyczy szyny', () => {
    // Golden przepisany do kanonu rozstrzygnięcia S7-P2 z 2026-10-30 (intencja zachowana:
    // na rysunku żadne skrzyżowanie nie czyta się jak połączenie, żadne nie dotyczy szyny).
    // Historia: baza P-1 audytu D3 — 24 przecięcia; V12K-137 rozcinało kabel poziomy w
    // punkcie styku pionu i stawiało kropkę „węzła T" (24 → 21 → 18 węzłów); kropka bez
    // węzła w modelu rysowała połączenie, którego w sieci nie ma — skasowana. Te same 18
    // miejsc są dziś skrzyżowaniami z mostkiem (pomiar `buildSceneV3(enm, 2)`).
    // 18 → 19 (regeneracja fikstury 2026-10-30, rozstrzygnięcie architekta: jedna postać
    // `starting_port_ref`): ładunek operacji `start_branch_segment_sn` niesie port pola zamiast
    // `….BRANCH`, więc identyfikatory korytarzy odgałęzień są nowe, a remis `id.localeCompare`
    // układa wiersze odgałęzień w innej kolejności. DOWÓD (sonda 2×2, kod karty): fikstura
    // zastana — 18, fikstura nowa — 19, fikstura nowa z przywróconymi zastanymi
    // `starting_port_ref` i kodami EAZ (same nowe identyfikatory) — 19. Różnica wyłącznie
    // w skrzyżowaniach odgałęzienie × odgałęzienie (7 → 8); 11 skrzyżowań ciągu z zejściami
    // odgałęzień bez zmian; każde z mostkiem (asercje niżej).
    const scene = buildSceneV3(enm, 2);
    const crossings = interiorCrossings(scene.segments);
    expect(crossings.filter((c) => c.involvesBus)).toHaveLength(0);
    expect(crossings).toHaveLength(19);
    expect(przecieciaBezMostka(scene.segments)).toEqual([]);
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
  // Rozstrzygnięcie architekta S7-P2 (2026-10-30): kropka wyłącznie na węźle modelu.
  it('fixtura L2: kropki wyłącznie na węzłach modelu (odczepy pól), zero T-styków kabli bez węzła — 0 luk', async () => {
    const { SYMBOL_DEFS } = await import('../../symbols/defs');
    const { externalBranchNodes, lateralBranchNodes, junctionDotGaps, wezlyModeluEnm } = await import('../crossings');
    const scene = buildSceneV3(enm, 2);
    // Golden przepisany do kanonu S7-P2 z 2026-10-30 (intencja zachowana: obustronna
    // spójność kropka⇔węzeł). Dawne 18 „węzłów T" tras (V12K-137) stało na przecięciach
    // kabli bez węzła w modelu — dziś to skrzyżowania z mostkiem (test wyżej), a T-styk
    // dwóch kabli bez węzła modelu jest luką wyroczni (`rozgalezienie-bez-kropki`).
    expect(externalBranchNodes(scene.segments)).toHaveLength(0);
    // V12K-150 (KROPKA-WEZLOWA): odczepy lateralne pól (ES/VT/SA) są węzłami z DANYCH pola
    // (`#lateral-…`, `points[0]` = oś toru) — kropka wskazuje rekord pola (`wezelModelu`).
    const lateralNodes = lateralBranchNodes(scene, SYMBOL_DEFS);
    expect(lateralNodes).toHaveLength(172);
    const dots = scene.symbols.filter((s) => s.symbolId === 'junction');
    expect(dots).toHaveLength(lateralNodes.length);
    const wezly = wezlyModeluEnm(enm);
    for (const kropka of dots) expect(wezly.has(String(kropka.meta?.wezelModelu))).toBe(true);
    // Obustronnie, z węzłami TEGO modelu: każdy węzeł ma kropkę, żadna kropka bez węzła.
    expect(junctionDotGaps(scene, SYMBOL_DEFS, wezly)).toEqual([]);
  });

  it('test negatywny (a): T-styk bez kropki ⇒ rozgalezienie-bez-kropki; kropka bez węzła modelu go NIE domyka', async () => {
    const { SYMBOL_DEFS } = await import('../../symbols/defs');
    const { externalBranchNodes, junctionDotGaps } = await import('../crossings');
    const segments = [
      seg([{ x: 0, y: 100 }, { x: 200, y: 100 }], 'sn', 'seg/magistrala'),
      seg([{ x: 96, y: 100 }, { x: 96, y: 300 }], 'sn', 'seg/odczep'),
    ];
    expect(externalBranchNodes(segments)).toEqual([{ x: 96, y: 100 }]);
    const gaps = junctionDotGaps({ segments, symbols: [] }, SYMBOL_DEFS);
    expect(gaps).toEqual([{ x: 96, y: 100, reason: 'rozgalezienie-bez-kropki' }]);
    const def = SYMBOL_DEFS.junction;
    const kropka = { symbolId: 'junction', x: 96 - def.width / 2, y: 100 - def.height / 2 };
    // Kropka BEZ węzła modelu (dawna kropka „węzła T") — fikcja: dwie luki.
    expect(junctionDotGaps({ segments, symbols: [kropka] }, SYMBOL_DEFS)).toEqual([
      { x: 96, y: 100, reason: 'rozgalezienie-bez-kropki' },
      { x: 96, y: 100, reason: 'kropka-bez-wezla-modelu', testId: undefined },
    ]);
    // Kropka wskazująca węzeł modelu domyka lukę — o ile węzeł istnieje w modelu.
    const zWezlem = { ...kropka, meta: { wezelModelu: 'bus/wezel-odgalezny' } };
    expect(junctionDotGaps({ segments, symbols: [zWezlem] }, SYMBOL_DEFS)).toEqual([]);
    expect(
      junctionDotGaps({ segments, symbols: [zWezlem] }, SYMBOL_DEFS, new Set(['bus/inny'])).map((g) => g.reason),
    ).toEqual(['rozgalezienie-bez-kropki', 'kropka-bez-wezla-modelu']);
  });

  it('test negatywny (b): kropka fabrykowana poza węzłem ⇒ kropka-bez-wezla-modelu; z węzłem, ale obok toru ⇒ kropka-poza-torem', async () => {
    const { SYMBOL_DEFS } = await import('../../symbols/defs');
    const { junctionDotGaps } = await import('../crossings');
    const scene = buildSceneV3(enm, 2);
    const withFake = {
      segments: scene.segments,
      symbols: [...scene.symbols, { symbolId: 'junction', x: 99991, y: 99991 }],
    };
    expect(junctionDotGaps(withFake, SYMBOL_DEFS).map((g) => g.reason)).toEqual(['kropka-bez-wezla-modelu']);
    const zWezlemObok = {
      segments: scene.segments,
      symbols: [...scene.symbols, { symbolId: 'junction', x: 99991, y: 99991, meta: { wezelModelu: enm.buses[0]!.ref_id } }],
    };
    expect(junctionDotGaps(zWezlemObok, SYMBOL_DEFS).map((g) => g.reason)).toEqual(['kropka-poza-torem']);
  });

  // Kropka odczepu tylko w rozgałęzieniu (rozstrzygnięcie S7-P2, §12 dokumentu S7): iloczyn
  // cech {port aparatu w odczepie: S górnego / N dolnego} × {sąsiad stosu o raster
  // APPARATUS_STACK_VERTICAL_GAP: brak / jest / jest z przewodem w przerwie / przesunięty
  // w X / port o złym kierunku} × {odcinek nie-mocowy i kropka w punkcie: brak / są}.
  // Jeden predykat (`odczepyWezlowModelu`) wybiera kropki sceny i wymagania wyroczni.
  it('ramionaToru: stos bez przewodów liczy ciągłość przez przerwę aparat–aparat; narożnik ma dwa ramiona', async () => {
    const { ramionaToru, odczepyWezlowModelu } = await import('../crossings');
    const { APPARATUS_STACK_VERTICAL_GAP: G } = await import('../../layout/apparatusStack');
    const rozmiary = {
      aparat: { width: 16, height: 24, ports: [{ x: 8, y: 0, dir: 'N' }, { x: 8, y: 24, dir: 'S' }] },
      tylkoS: { width: 16, height: 24, ports: [{ x: 8, y: 0, dir: 'S' }] },
      junction: { width: 8, height: 8, ports: [{ x: 4, y: 4 }] },
    };
    const gorny = { symbolId: 'aparat', x: 0, y: 0 };
    const p = { x: 8, y: 24 };
    const odczep = seg([p, { x: 40, y: 24 }], 'sn', 'pole/x#lateral-0');
    const dolny = (dx = 0) => ({ symbolId: 'aparat', x: dx, y: 24 + G });
    const przypadki: [string, PreviewSegment[], { symbolId: string; x: number; y: number }[], number][] = [
      ['narożnik: port S + odczep', [odczep], [gorny], 2],
      ['stos: port S + odczep + port N sąsiada o raster', [odczep], [gorny, dolny()], 3],
      ['stos z przewodem w przerwie (bez podwójnego liczenia)', [odczep, seg([p, { x: 8, y: 24 + G }], 'sn', 'pole/x#wire-0')], [gorny, dolny()], 3],
      ['sąsiad przesunięty w X', [odczep], [gorny, dolny(8)], 2],
      ['port o złym kierunku w odległości rastra', [odczep], [gorny, { symbolId: 'tylkoS', x: 0, y: 24 + G }], 2],
      ['odcinek nie-mocowy i kropka w punkcie nie są ramionami', [odczep, seg([{ x: 0, y: 24 }, { x: 80, y: 24 }], 'protectionTrip', 'pole/x#trip-line')], [gorny, { symbolId: 'junction', x: 4, y: 20 }], 2],
    ];
    for (const [nazwa, segments, symbols, oczekiwane] of przypadki) {
      expect([nazwa, ramionaToru({ segments, symbols }, rozmiary, p)]).toEqual([nazwa, oczekiwane]);
      expect([nazwa, odczepyWezlowModelu({ segments, symbols }, rozmiary).length]).toEqual([nazwa, oczekiwane >= 3 ? 1 : 0]);
    }
    // Odczep z portu N dolnego aparatu: sąsiad stosu powyżej (port S o raster wyżej).
    const q = { x: 8, y: 24 + G };
    const odczepDolny = seg([q, { x: 40, y: q.y }], 'sn', 'pole/x#lateral-1');
    expect(ramionaToru({ segments: [odczepDolny], symbols: [gorny, dolny()] }, rozmiary, q)).toBe(3);
    expect(ramionaToru({ segments: [odczepDolny], symbols: [dolny()] }, rozmiary, q)).toBe(2);
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
