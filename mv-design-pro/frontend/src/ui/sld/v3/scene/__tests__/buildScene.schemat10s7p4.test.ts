/**
 * SCHEMAT-10 S7-P4 (V12K-137) — WYMAGANIA P0 recenzji właściciela (§9 GAP-doc
 * `docs/sld/S7_GAP_CROSSING_ZERO_2026-07.md`). S6/S7 NIEODEBRANE do ich spełnienia.
 *
 *  P0 pkt 1 — ŚWIATŁO GÓRNEGO PASA BBOX-DO-BBOX: odstęp = prawy bbox CAŁEGO
 *  pola N (z opisami+aparaturą) → lewy bbox pola N+1 ≥ TOP_LEVEL_FIELD_CLEARANCE.
 *  Wyrocznia `topBandFieldClearances` mierzy REALNE obrysy pól (nie kotwice),
 *  na WIELU klasach topologii (WYTYCZNE §12). Stała podniesiona 3×GRID→4×GRID
 *  (+33,3%, widełki §5), wyprowadzona OGÓLNIE (najmniejszy `k×GRID` w paśmie).
 *
 * Pozostałe punkty P0 (audyt pionów, zbiór „nigdy nie znika") — kolejne podetapy S7-P4.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { EnergyNetworkModel } from '../../../../../types/enm';
import {
  buildSceneV3,
  topBandFieldClearances,
  topBandClearanceViolations,
  allTopBandFieldsClearance,
  auditVerticalSegments,
  verticalAuditGaps,
  allVerticalsAttributed,
  verticalCauseBreakdown,
  allSceneSegmentEndpointsAnchored,
  totalVerticalSegmentLength,
  layoutMetricsReport,
  noSceneSymbolOverlaps,
  allSourcesConnected,
  type SceneV3,
} from '../buildScene';
import { TOP_LEVEL_FIELD_CLEARANCE } from '../../layout/clearances';
import { GRID } from '../../core/grid';
import { SEGMENT_STROKE_WIDTH } from '../../compose/preview';
import type { EnergyNetworkModel as Enm } from '../../../../../types/enm';
import { czasProcesoraMs } from '../../../../../test/czasProcesora';
import { zPunktemPodzialuWStacji } from '../../../../../test/punktPodzialu';
import { punktyPodzialu } from '../../../../shared/stanLacznika';

const here = dirname(fileURLToPath(import.meta.url));
const bigFixturePath = resolve(here, '..', '..', '..', 'v2', 'geometry', '__tests__', 'fixtures', 'sldSubstrate52s.enm.json');
const smallFixtureDir = resolve(here, 'fixtures');

function loadEnm(path: string): EnergyNetworkModel {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { readonly enm?: EnergyNetworkModel };
  return parsed.enm ?? (parsed as unknown as EnergyNetworkModel);
}

const FIXTURES: ReadonlyArray<{ readonly klasa: string; readonly nazwa: string; readonly enm: EnergyNetworkModel }> = [
  { klasa: 'A (radialna prosta)', nazwa: 'openTerminal', enm: loadEnm(resolve(smallFixtureDir, 'openTerminal.enm.json')) },
  { klasa: 'A (ciąg radialny)', nazwa: 'openTrunkChain', enm: loadEnm(resolve(smallFixtureDir, 'openTrunkChain.enm.json')) },
  { klasa: 'B (z odgałęzieniem)', nazwa: 'openBranch', enm: loadEnm(resolve(smallFixtureDir, 'openBranch.enm.json')) },
  { klasa: 'C (GPZ + feeder)', nazwa: 'gpzFeeder', enm: loadEnm(resolve(smallFixtureDir, 'gpzFeeder.enm.json')) },
  { klasa: 'E (wieloźródłowa, 53 stacje)', nazwa: 'sldSubstrate52s', enm: loadEnm(bigFixturePath) },
];


describe('SCHEMAT-10 S7 etap 4 §9 P0 pkt 1 — światło górnego pasa bbox-do-bbox', () => {
  it('TOP_LEVEL_FIELD_CLEARANCE = 4×GRID (+33,3% od 3×GRID, widełki §5 „+20–35%")', () => {
    expect(TOP_LEVEL_FIELD_CLEARANCE).toBe(4 * GRID);
    // Wyprowadzenie OGÓLNE: najmniejszy k×GRID w paśmie +20–35% od 3×GRID.
    const base = 3 * GRID;
    expect(TOP_LEVEL_FIELD_CLEARANCE).toBeGreaterThanOrEqual(base * 1.2);
    expect(TOP_LEVEL_FIELD_CLEARANCE).toBeLessThanOrEqual(base * 1.35);
    expect(TOP_LEVEL_FIELD_CLEARANCE % GRID).toBe(0);
  });

  for (const fx of FIXTURES) {
    it(`${fx.nazwa}: każde światło pasa górnego bbox-do-bbox ≥ kontrakt (opisy+aparatura, nie kotwice)`, () => {
      const scene = buildSceneV3(fx.enm);
      const gaps = topBandFieldClearances(scene);
      // Miara jest na REALNYCH obrysach: gdy pas górny ma ≥2 pola, mamy ≥1 światło.
      for (const g of gaps) {
        expect(
          g.gap,
          `światło ${g.leftStationId} → ${g.rightStationId} = ${g.gap} < ${TOP_LEVEL_FIELD_CLEARANCE}`,
        ).toBeGreaterThanOrEqual(TOP_LEVEL_FIELD_CLEARANCE);
      }
      expect(allTopBandFieldsClearance(scene)).toBe(true);
      expect(topBandClearanceViolations(scene)).toHaveLength(0);
    });
  }

  it('sldSubstrate52s: pas górny ma wiele pól i ≥1 zmierzone światło (dowód, że miara nie jest pusta)', () => {
    const scene = buildSceneV3(FIXTURES[FIXTURES.length - 1].enm);
    expect(scene.meta.mainTrunkStationIds.length).toBeGreaterThan(1);
    expect(topBandFieldClearances(scene).length).toBeGreaterThan(0);
  });

  it('wyrocznia GRYZIE: próg > największego zmierzonego światła daje naruszenie (nie martwa)', () => {
    const scene = buildSceneV3(FIXTURES[FIXTURES.length - 1].enm);
    const gaps = topBandFieldClearances(scene).map((g) => g.gap);
    const maxGap = Math.max(...gaps);
    expect(topBandClearanceViolations(scene, maxGap + 1).length).toBeGreaterThan(0);
    expect(allTopBandFieldsClearance(scene, maxGap + 1)).toBe(false);
  });

  it('miara jest bbox-do-bbox (nie kotwic): światło = 32 px = 4×GRID na fixturze referencyjnej', () => {
    // Podniesienie 24→32 jest WIDOCZNE w mierze realnych obrysów pól — dowód, że
    // stała steruje pasem górnym i miara nie odczytuje kotwic (stały krok).
    const scene = buildSceneV3(FIXTURES[FIXTURES.length - 1].enm);
    const gaps = topBandFieldClearances(scene).map((g) => g.gap);
    expect(Math.min(...gaps)).toBe(4 * GRID);
  });

  it('światło rośnie ze stałą (nie phantom): większy kontrakt-próg wykrywa mniejsze realne światło', () => {
    // Dowód reużywalny: przy progu 3×GRID (stara wartość) fixtura MUSI mieć zero
    // naruszeń (32 ≥ 24), a przy progu 5×GRID (40) MUSI mieć naruszenia (32 < 40)
    // — miara reaguje na realne obrysy, nie zwraca stałej.
    const scene = buildSceneV3(FIXTURES[FIXTURES.length - 1].enm);
    expect(allTopBandFieldsClearance(scene, 3 * GRID)).toBe(true);
    expect(allTopBandFieldsClearance(scene, 5 * GRID)).toBe(false);
  });
});

describe('SCHEMAT-10 S7 etap 4 §9 P0 pkt 2 — audyt długości pionów (każdy z przyczyną)', () => {
  for (const fx of FIXTURES) {
    it(`${fx.nazwa}: KAŻDY pion ma przyczynę (żaden nieuzasadniony)`, () => {
      const scene = buildSceneV3(fx.enm);
      const gaps = verticalAuditGaps(scene);
      expect(
        gaps,
        `piony bez przyczyny: ${gaps.map((g) => `${g.ownerRef}(${g.kind},${g.length})`).join(', ')}`,
      ).toHaveLength(0);
      expect(allVerticalsAttributed(scene)).toBe(true);
    });

    it(`${fx.nazwa}: suma długości pionów per przyczyna = totalVerticalSegmentLength (kompletność audytu)`, () => {
      const scene = buildSceneV3(fx.enm);
      const audit = auditVerticalSegments(scene);
      const sumAudit = audit.reduce((s, v) => s + v.length, 0);
      // Audyt pokrywa DOKŁADNIE zbiór pionów mierzony przez funkcję kosztu —
      // nie gubi ani nie dublach żadnego pionu (dowód, że tabela jest pełna).
      expect(sumAudit).toBe(totalVerticalSegmentLength(scene));
      const breakdown = verticalCauseBreakdown(scene);
      const sumBreak = Object.values(breakdown).reduce((s, v) => s + v.length, 0);
      expect(sumBreak).toBe(sumAudit);
    });

    it(`${fx.nazwa}: każdy pion sięga realnej geometrii (nie dynda — minimalność §9 P0)`, () => {
      // „Piony bez przyczyny → skrócić" w sensie geometrycznym: żaden koniec
      // trasy nie wisi w pustce (port/inny odcinek). Wiąże audyt z realną
      // minimalnością — pion nie może być krótszy bez utraty połączenia.
      const scene = buildSceneV3(fx.enm);
      expect(allSceneSegmentEndpointsAnchored(scene)).toBe(true);
    });
  }

  it('wyrocznia GRYZIE: pion o NIEROZPOZNANEJ roli (kind leader) ⇒ nieuzasadniony', () => {
    // Dowód, że klasyfikacja nie jest martwa: syntetyczny odcinek pionowy o roli
    // spoza taksonomii (kind `leader`, ownerRef obcy) MUSI wpaść do kosza.
    const base = buildSceneV3(FIXTURES[FIXTURES.length - 1].enm);
    const mystery: SceneV3 = {
      ...base,
      segments: [
        ...base.segments,
        { points: [{ x: 4000, y: 4000 }, { x: 4000, y: 4200 }], meta: { kind: 'leader', ownerRef: 'obcy/rola/nieznana' } },
      ],
    };
    const gaps = verticalAuditGaps(mystery);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.some((g) => g.ownerRef === 'obcy/rola/nieznana')).toBe(true);
    expect(allVerticalsAttributed(mystery)).toBe(false);
  });

  // ILOCZYN: rodzaj odcinka obwodu wtórnego/przewodu pola {linia wyłączania, linia pomiarowa,
  // przewód toru pola, przewód odgałęzienia pola, dojście do węzła odczepu} × przyczyna. Fikstury
  // regenerowane przy scaleniu ZU-JEDEN-NOSNIK (8068d366d) niosą linie wyłączania pól stacji
  // (171 pionów po 8 px na sieci referencyjnej) i przewody toru z portów — wszystkie w obrysie
  // pola, więc przyczyną jest `footprint`, nie kosz `nieuzasadniony` ani „jog-trasy".
  it('obwody wtórne i przewody toru pola ⇒ footprint (każdy rodzaj), obca rola nadal w koszu', () => {
    const base = buildSceneV3(FIXTURES[FIXTURES.length - 1].enm);
    const pion = (x: number) => [{ x, y: 5000 }, { x, y: 5016 }];
    const syntetyczne: SceneV3 = {
      ...base,
      segments: [
        { points: pion(9001), meta: { kind: 'protectionTrip', ownerRef: 'stn/x/sn_field/000#trip-line' } },
        { points: pion(9002), meta: { kind: 'measurementLink', ownerRef: 'stn/x/sn_field/000#measurement-link-1' } },
        { points: pion(9003), meta: { kind: 'sn', ownerRef: 'stn/x/sn_field/000#wire-2' } },
        { points: pion(9004), meta: { kind: 'sn', ownerRef: 'stn/x/sn_field/000#odgalezienie-1-wire-0' } },
        { points: pion(9005), meta: { kind: 'sn', ownerRef: 'stn/x/sn_field/000#wezel-odczepu-0' } },
        { points: pion(9006), meta: { kind: 'leader', ownerRef: 'stn/x/sn_field/000#wire-2-obcy' } },
      ],
    };
    const wgX = new Map(auditVerticalSegments(syntetyczne).map((v) => [v.x, v.cause]));
    expect([9001, 9002, 9003, 9004, 9005].map((x) => wgX.get(x))).toEqual(Array(5).fill('footprint'));
    expect(wgX.get(9006)).toBe('nieuzasadniony');
  });
  // Dawny test „węzeł T (#tee-N): pion dziedziczy przyczynę pierwotnego kabla" skasowany
  // razem z rozcinaniem kabla w punktach przecięć (rozstrzygnięcie S7-P2, 2026-10-30):
  // scena nie tworzy już kawałków `#tee-N`, więc każdy pion jest kablem pod własnym
  // `ownerRef` i podlega tej samej przyczynowości co reszta (`allVerticalsAttributed` wyżej).
});

/** Wstrzyknięcie syntetycznego punktu NO na ciąg główny (§3: „znacznik sekcji/NOP
 *  NIGDY nie znika") — wzorzec z S3/S7-P3. */
function withSyntheticNop(model: Enm): Enm {
  // Karta W5-C: punkt podziału = pozycja normalna łącznika pola stacji (jedna prawda).
  return zPunktemPodzialuWStacji(model, buildSceneV3(model).meta.mainTrunkStationIds[0]);
}

// INTENCJA po karcie SLD-SKALA-I-NAWIGACJA (R1/R4/R5): P0 pkt 3 („na widoku
// całości tor mocy z wagą, tożsamość stacji, źródło, transformator i punkt NO
// nigdy nie znikają") był dowodzony na zwiniętym przeglądzie L0 (sylwetki
// mini-RMU i wyrocznia `lod0ReadabilityGaps`). Jest jedna scena; tu zostaje
// dowód, że scena NIESIE każdy z tych elementów, a ich CZYTELNOŚĆ przy skali
// dopasowania całości pilnują testy kanwy (stała ekranowa tożsamości i znaczników
// stanu — `canvas/__tests__/gestoscInformacji*.test.ts*`).
describe('SCHEMAT-10 S7 etap 4 §9 P0 pkt 3 — scena niesie zbiór „nigdy nie znika"', () => {
  const bigEnm = FIXTURES[FIXTURES.length - 1].enm;

  it('hierarchia wagi toru: SEGMENT_STROKE_WIDTH.snTrunk > .sn (tor główny > odejście, nośnik = WAGA, nie kolor)', () => {
    expect(SEGMENT_STROKE_WIDTH.snTrunk).toBeGreaterThan(SEGMENT_STROKE_WIDTH.sn);
    expect(SEGMENT_STROKE_WIDTH.bus).toBeGreaterThan(SEGMENT_STROKE_WIDTH.snTrunk);
  });

  for (const fx of FIXTURES) {
    it(`${fx.nazwa}: tor mocy z wagą, tożsamość każdej stacji i źródło są na scenie`, () => {
      const scene = buildSceneV3(fx.enm);
      expect(scene.segments.some((s) => s.meta?.kind === 'snTrunk')).toBe(true);
      expect(scene.symbols.some((s) => s.symbolId === 'gridSource')).toBe(true);
      const nazwy = new Set(
        scene.labels.filter((l) => l.ownerKind === 'station-name').map((l) => l.ownerRef.replace(/#.*$/, '')),
      );
      const bez = scene.meta.stationTraversalOrder.filter((ref) => !nazwy.has(ref));
      expect(bez, `stacje bez napisu tożsamości: ${bez.join(', ')}`).toEqual([]);
    });
  }

  it('magistrala niesie klasę snTrunk, a odejścia klasę sn (rozróżnienie wagą)', () => {
    const scene = buildSceneV3(bigEnm);
    expect(scene.segments.some((s) => s.meta?.kind === 'snTrunk')).toBe(true);
    const branchSegs = scene.segments.filter((s) => (s.meta?.ownerRef ?? '').includes('branch_segment'));
    expect(branchSegs.length).toBeGreaterThan(0);
    for (const b of branchSegs) expect(b.meta?.kind === 'sn' || b.meta?.kind === 'openTerminal').toBe(true);
  });

  it('źródło (sieć zewnętrzna/GPZ) i transformator GPZ mają własne symbole', () => {
    const scene = buildSceneV3(bigEnm);
    expect(scene.symbols.some((s) => s.symbolId === 'gridSource')).toBe(true);
    expect(
      scene.symbols.some((s) => s.symbolId === 'transformer2W' && (s.meta?.ownerRef ?? '').startsWith('gpz/')),
    ).toBe(true);
  });

  it('punkt NO: KAŻDY punkt podziału modelu (także w polu stacji) ma symbol noPoint, a scena etykietę „NO"', () => {
    // Intencja K2b §0.4 / W5-C zachowana: punkt podziału to łącznik z pozycją
    // normalną „otwarty" (`punktyPodzialu`, jedna prawda z modelu).
    const withNop = withSyntheticNop(bigEnm);
    const scene = buildSceneV3(withNop);
    const refy = punktyPodzialu(withNop).map((g) => g.ref_id);
    expect(refy.length, 'sieć wzorcowa niesie punkty podziału').toBeGreaterThan(0);
    expect(scene.labels.some((l) => l.ownerKind === 'no-point')).toBe(true);
    const nopRef = buildSceneV3(bigEnm).meta.mainTrunkStationIds[0];
    expect(scene.symbols.some((s) => s.symbolId === 'noPoint' && s.meta?.ownerRef === nopRef)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SCHEMAT-10 S7-P4 §9 potwierdzenie pkt 7 — fixtura H (WYTYCZNE §3 „wielkoskalowa
// 100/250/500"), SYNTETYCZNA, z czasem wykonania. Silnik OGÓLNY: sieć powstaje
// przez DETERMINISTYCZNE łańcuchowanie kopii podgrafu sieci referencyjnej (bez
// GPZ kopii) na jednej magistrali — każda kopia z unikalnym sufiksem hasha (refy
// strukturalnie poprawne), spięta busem ogona magistrali poprzednika. To NIE jest
// strojenie fixtury (WYTYCZNE §1): to replikacja REALNEJ topologii dla dowodu
// SKALOWALNOŚCI (budżet czasu, determinizm, zero-defekt przy ~100+ stacjach).
// ---------------------------------------------------------------------------

function synthLargeTrunk(model: Enm, copies: number): Enm {
  const clone = (o: unknown): any => JSON.parse(JSON.stringify(o));
  const trunkOf = (e: any): any => e.line_runs.find((r: any) => r.run_kind === 'main_trunk');
  const remap = (o: any, suf: string): any => {
    if (typeof o === 'string') return o.replace(/([0-9a-f]{16,})/g, `$1${suf}`);
    if (Array.isArray(o)) return o.map((x) => remap(x, suf));
    if (o && typeof o === 'object') { const r: any = {}; for (const k of Object.keys(o)) r[k] = remap(o[k], suf); return r; }
    return o;
  };
  const isGpz = (r: unknown): boolean => typeof r === 'string' && r.includes('gpz/');
  const isGpzTr = (t: any): boolean => (Array.isArray(t.tags) && t.tags.includes('gpz_wn_sn_transformer')) || (t.meta && t.meta.visual_role === 'GPZ_WN_SN_TRANSFORMER');
  const tailBus = (e: any): string | null => { const t = trunkOf(e); const l = t.segments[t.segments.length - 1].segment_ref; return e.branches.find((b: any) => b.ref_id === l)?.to_bus_ref ?? null; };
  const out = clone(model);
  const ot = trunkOf(out);
  let prev = tailBus(out);
  let order = ot.segments.length;
  for (let c = 1; c < copies; c++) {
    const suf = `${String(c).padStart(2, '0')}ab`;
    const cp = remap(clone(model), suf);
    const ct = trunkOf(cp);
    const fb = cp.branches.find((b: any) => b.ref_id === ct.segments[0].segment_ref);
    if (fb) fb.from_bus_ref = prev;
    out.substations.push(...cp.substations.filter((s: any) => !isGpz(s.ref_id)));
    out.buses.push(...cp.buses.filter((b: any) => !isGpz(b.ref_id)));
    out.branches.push(...cp.branches);
    out.transformers.push(...cp.transformers.filter((t: any) => !isGpzTr(t)));
    out.sources.push(...cp.sources.filter((s: any) => !isGpz(s.ref_id)));
    out.loads.push(...cp.loads);
    out.generators.push(...cp.generators);
    out.bays.push(...(cp.bays ?? []).filter((b: any) => !isGpz(b.ref_id)));
    out.junctions.push(...(cp.junctions ?? []));
    out.branch_points.push(...(cp.branch_points ?? []));
    out.measurements.push(...(cp.measurements ?? []));
    out.protection_assignments.push(...(cp.protection_assignments ?? []));
    out.connection_nodes.push(...(cp.connection_nodes ?? []));
    out.corridors.push(...(cp.corridors ?? []));
    for (const r of cp.line_runs) if (r.run_kind === 'branch') out.line_runs.push(r);
    for (const seg of ct.segments) { order += 1; ot.segments.push({ segment_ref: seg.segment_ref, order }); }
    prev = tailBus(cp);
  }
  return out as Enm;
}

function sceneSig(scene: SceneV3): string {
  const s = scene.symbols.map((y) => `${y.symbolId}@${y.x},${y.y}`).sort().join('|');
  const g = scene.segments.map((seg) => `${seg.meta?.ownerRef ?? '?'}#${seg.points.map((p) => `${p.x},${p.y}`).join(';')}`).sort().join('|');
  const l = scene.labels.map((x) => `${x.ownerRef}:${x.text}@${x.rect.x},${x.rect.y}`).sort().join('|');
  return `${s}::${g}::${l}::X${scene.crossings.length}`;
}

describe('SCHEMAT-10 S7 etap 4 §9 pkt 7 — fixtura H (~100 stacji, syntetyczna, skalowalność)', () => {
  const bigEnm = FIXTURES[FIXTURES.length - 1].enm;
  const hEnm = synthLargeTrunk(bigEnm, 2); // ~106 stacji (2 × 53)

  it('sieć H ma ~100 stacji na JEDNEJ magistrali (skala WYTYCZNE §3 H)', () => {
    const scene = buildSceneV3(hEnm);
    expect(scene.meta.stationCount).toBeGreaterThanOrEqual(100);
    expect(scene.meta.mainTrunkStationIds.length).toBeGreaterThan(FIXTURES[FIXTURES.length - 1].enm ? 12 : 0);
  });

  it(`H: ZERO-DEFEKT (przecięcie bez mostka/kropka bez węzła/kolizje/przecięcia/nieortog=0) + wszystkie wyrocznie P0 zielone`, () => {
    const scene = buildSceneV3(hEnm);
    const m = layoutMetricsReport(scene);
    // Rozstrzygnięcie S7-P2 (2026-10-30): mostek na każdym przecięciu, kropka tylko na węźle modelu.
    expect(m.crossingWithoutBridgeCount).toBe(0);
    expect(m.junctionDotGapCount).toBe(0);
    expect(m.labelCollisionCount).toBe(0);
    expect(m.subtreeIntersectionCount).toBe(0);
    expect(m.nonOrthogonalSegmentCount).toBe(0);
    expect(m.ambiguousConnectionCount).toBe(0);
    expect(noSceneSymbolOverlaps(scene)).toBe(true);
    expect(allSceneSegmentEndpointsAnchored(scene)).toBe(true);
    expect(allSourcesConnected(scene)).toBe(true);
    expect(allTopBandFieldsClearance(scene)).toBe(true); // P0 pkt 1
    expect(allVerticalsAttributed(scene)).toBe(true); // P0 pkt 2
  });

  it('H: determinizm 2× — scena bajt-identyczna', () => {
    expect(sceneSig(buildSceneV3(hEnm))).toBe(sceneSig(buildSceneV3(hEnm)));
  });

  it('H: czas budowy w budżecie (WYTYCZNE §10 — duża sieć < 3 s / jedna scena) + raport', () => {
    let stations = 0;
    // Czas PROCESORA (`src/test/czasProcesora.ts`), nie zegara — budżet łapie złożoność
    // kodu, nie obciążenie maszyny współdzielonej.
    const elapsed = czasProcesoraMs(() => {
      stations = buildSceneV3(hEnm).meta.stationCount;
    });
    // Raport wydajności (widoczny w --reporter verbose / CI log).
    console.log(`[S7 etap 4 §9 pkt 7] fixtura H: ${stations} stacji, 1 scena, ${Math.round(elapsed)} ms procesora`);
    // Pin obniżony z pomiarem (karta SLD-SKALA-I-NAWIGACJA R1, 2026-11-11): dawniej
    // 15 s na trzy sceny; jedna scena H (106 stacji) = 618 ms procesora ⇒ budżet ~5×.
    expect(elapsed).toBeLessThan(3000);
  });
});
