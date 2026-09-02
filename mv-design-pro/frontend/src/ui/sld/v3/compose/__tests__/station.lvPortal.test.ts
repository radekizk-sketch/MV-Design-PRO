/**
 * ZACISK nN + PORTAL DOMENY nN — kompozycja stacji (architektura LV Domain
 * Projection po B-02, `docs/sld/PROJEKCJA_SN_NN_PORTAL_V1.md`).
 *
 * Co ten plik PRZYPINA (reguła KLASA §4 — deklaracja bez testu = fałszywa
 * pewność):
 *  (1) projekcja SN kończy tor na ZACISKU nN (`#lv-bus`) i JEDNYM portalu
 *      (`lvPortal`) — zero wnętrza rozdzielnicy nN (aparaty nN, odpływy,
 *      sekcje, sprzęgła) w tej projekcji; źródła strony nN (rząd DER) i
 *      zagregowany odbiór (strzałka) POZOSTAJĄ na zacisku (nigdy nie ukrywamy
 *      źródeł ani odbiorów);
 *  (2) portal stoi NA OSI rdzenia zacisku (pod transformatorem, w obrysie
 *      kolumny TR — zero dodatkowej szerokości stacji); port `top` na końcu
 *      pionu `#lv-portal-drop`, który zaczyna się NA zacisku — ciągłość
 *      geometryczna (`internalSegmentsEndAtPortsOrBus`), siatka, zero
 *      nachodzeń; strzałka odbioru ZA portalem, trunk DER ZA strzałką;
 *  (3) spójność measure↔compose: gabaryt `lvPortal` == `LV_PORTAL_*`;
 *      `lvTerminalPortXs` (plan kolumn) == osie realnych portów LV;
 *      `nnSideBelowBusHeight` przekracza REALNY zwis pod zaciskiem DOKŁADNIE
 *      o bufor dolny — na ILOCZYNIE {źródła nN: 0/1/2} × {odbiór: brak/obecny}
 *      × {TR: 1 pole / 2 pola (multi-TR)}; szerokość kolumny obejmuje portal
 *      i rząd DER;
 *  (4) źródła wg strony: nN → rząd DER na zacisku (za portalem), SN → pole
 *      źródłowe SN, `unknown` → rząd nN z jawnym `station.der.sideAssumedNn`;
 *  (5) stacja bez portu LV ⇒ zero portalu; źródło nN bez zacisku ⇒ jawne
 *      `station.der.unattached` (nie cisza);
 *  (6) determinizm.
 */
import { describe, expect, it } from 'vitest';

import { GRID, snapToGrid } from '../../core/grid';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { FIELD_ROLE, type FieldRole } from '../../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../../v2/renderer/MiniBlockRmuRenderer';
import {
  DER_ROW_TOP_CLEARANCE,
  LV_PORTAL_DROP_HEIGHT,
  LV_PORTAL_HEIGHT,
  LV_PORTAL_WIDTH,
  lvPortalExtraHeight,
  lvTerminalPortXs,
  nnSideBelowBusHeight,
  planLvTerminal,
  requiredStationWidth,
  stationBlockHeight,
  stationNameBandHeight,
  type StationMeasureInput,
} from '../../layout/measure';
import { computeBands, type StationBandHeights } from '../../layout/bands';
import { computeColumns } from '../../layout/columns';
import { colorSegmentLabelRows, computeSegmentLabelSlotX } from '../../layout/segments';
import { resolveLabels } from '../../layout/labels';
import type { StationDerSourceInput } from '../sourceKind';
import {
  allCompositionSymbolsOnGrid,
  composeStation,
  internalSegmentsEndAtPortsOrBus,
  LV_PORTAL_OWNER_SUFFIX,
  lvPortalOwnerRef,
  noCompositionSymbolOverlaps,
  type ComposeStationInput,
  type StationComposition,
} from '../station';

function makeBay(fieldRole: FieldRole, index: number): MiniBlockBayDescriptor {
  return { bayRef: `bay-${index}`, fieldRole, designation: `Pole ${index}`, hasMissingRequiredDevice: false };
}

function makeStation(
  id: string,
  snBays: readonly MiniBlockBayDescriptor[],
  overrides: Partial<StationMeasureInput> = {},
): StationMeasureInput {
  return {
    id,
    name: `Stacja ${id}`,
    stationCode: 'S77',
    transformerRatedKva: 630,
    stationTypeLabel: 'stacja przelotowa',
    nnVoltageKv: 0.4,
    snBays,
    ...overrides,
  };
}

/** measure→bands→columns dla JEDNEJ stacji (REALNY potok, jak `station.test.ts`). */
function buildComposeInput(station: StationMeasureInput, hasLvSection = true): ComposeStationInput {
  const rows = colorSegmentLabelRows(computeSegmentLabelSlotX([station], [null]));
  const bandHeights: StationBandHeights = {
    incomingSegmentLabelText: null,
    portCaptionHeight: 0,
    stationBlockHeight: stationBlockHeight(station),
    nameBandHeight: stationNameBandHeight(station),
  };
  const bandsResult = computeBands([bandHeights], rows.rowCount);
  const { columns } = computeColumns({
    stations: [station],
    incomingSegmentLabelTexts: [null],
    nameSlotBand: bandsResult.bands.B5,
    segmentSlotBand: bandsResult.bands.B1,
  });
  const column = columns[0];
  return {
    station,
    column: { x: column.x, width: column.width, tapX: column.tapX },
    busAxisY: bandsResult.bands.B2.y,
    blockTopY: bandsResult.bands.B4.y,
    nameSlot: column.nameSlot,
    hasLvSection,
  };
}

function portalsOf(composition: StationComposition) {
  return composition.symbols.filter((s) => s.symbolId === 'lvPortal');
}

function segment(composition: StationComposition, ownerRef: string) {
  return composition.segments.find((s) => s.ownerRef === ownerRef);
}

/** Wnętrze rozdzielnicy nN — NIGDY w projekcji SN. */
const NN_INTERIOR_SYMBOLS = new Set(['nnBreaker', 'nnFuseSwitch']);
const NN_INTERIOR_OWNER_SUFFIXES = ['#nn-aggregate', '#board-descent', '#nn-incomer-label', '#nn-feeder-label', '#nn-coupler-label'];

function assertNoNnInterior(composition: StationComposition): void {
  expect(composition.symbols.filter((s) => NN_INTERIOR_SYMBOLS.has(s.symbolId))).toEqual([]);
  expect(
    composition.segments.filter((s) => NN_INTERIOR_OWNER_SUFFIXES.some((suffix) => s.ownerRef.endsWith(suffix))),
  ).toEqual([]);
  expect(
    composition.labels.apparatus.filter((l) => NN_INTERIOR_OWNER_SUFFIXES.some((suffix) => l.ownerRef.endsWith(suffix))),
  ).toEqual([]);
}

/** REALNY zwis kompozycji POD zaciskiem nN [j.św.] (symbole, odcinki i
 *  etykiety DER — etykieta rodzaj+moc jest treścią zwisu). */
function realOverhangBelowLvBus(composition: StationComposition): number {
  const lvBus = segment(composition, `${composition.stationId}#lv-bus`);
  expect(lvBus, 'stacja z portem LV MUSI mieć zacisk nN').toBeDefined();
  const busY = lvBus!.points[0].y;
  let bottom = busY;
  for (const symbol of composition.symbols) {
    const def = SYMBOL_DEFS[symbol.symbolId];
    if (symbol.y + def.height > busY) bottom = Math.max(bottom, symbol.y + def.height);
  }
  for (const seg of composition.segments) {
    for (const p of seg.points) if (p.y > busY) bottom = Math.max(bottom, p.y);
  }
  for (const label of resolveLabels({ simpleAnchored: [...composition.labels.der, ...composition.labels.apparatus] })) {
    if (label.rect.y + label.rect.height > busY) bottom = Math.max(bottom, label.rect.y + label.rect.height);
  }
  return bottom - busY;
}

const DER_NN_A: StationDerSourceInput = { id: 'gen-nn-a', kind: 'pv', ratedPower: 0.5, connectionSide: 'nn' };
const DER_NN_B: StationDerSourceInput = { id: 'gen-nn-b', kind: 'bess', ratedPower: 0.3, connectionSide: 'nn' };
const DER_SN: StationDerSourceInput = { id: 'gen-sn-1', kind: 'pv', ratedPower: 0.5, connectionSide: 'sn' };
const ODBIOR = { pMw: 0.9, qMvar: 0.297, count: 4 } as const;

const ONE_TR = [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1)];
const TWO_TR = [
  makeBay(FIELD_ROLE.RMU_LINE, 0),
  makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1),
  makeBay(FIELD_ROLE.RMU_TRANSFORMER, 2),
];

// ---------------------------------------------------------------------------
// (1)(2) Zacisk + portal, zero wnętrza nN, ciągłość geometryczna.
// ---------------------------------------------------------------------------

describe('PORTAL nN — projekcja SN kończy tor na zacisku nN i JEDNYM portalu', () => {
  it('pole TR + hasLvSection ⇒ dokładnie: 1× #lv-bus, 1× #lv-drop-0, 1× #lv-portal-drop, 1× symbol lvPortal; zero wnętrza nN', () => {
    const composition = composeStation(buildComposeInput(makeStation('st-a', ONE_TR)));
    expect(composition.segments.filter((s) => s.ownerRef === 'st-a#lv-bus')).toHaveLength(1);
    expect(composition.segments.filter((s) => s.ownerRef.includes('#lv-drop-'))).toHaveLength(1);
    expect(composition.segments.filter((s) => s.ownerRef === 'st-a#lv-portal-drop')).toHaveLength(1);
    const portals = portalsOf(composition);
    expect(portals).toHaveLength(1);
    expect(portals[0].lvPortalStationRef).toBe('st-a');
    expect(lvPortalOwnerRef('st-a')).toBe(`st-a${LV_PORTAL_OWNER_SUFFIX}`);
    // Portal nie ma etykiety — tożsamość niesie glif („nN") i podpowiedź
    // obszaru trafienia (`LV_PORTAL_TITLE_TEXT`); zero napisu, który mógłby
    // kotwiczyć się na stacji jako cudzy obiekt (`kotwicaJednoZrodlo`).
    expect(composition.labels.apparatus.filter((l) => l.ownerRef.includes('#lv-portal'))).toEqual([]);
    assertNoNnInterior(composition);
  });

  it('portal NA OSI zacisku (pod transformatorem, w obrysie kolumny TR): pion #lv-portal-drop zaczyna się NA #lv-bus w osi portu LV i kończy w porcie `top`; siatka, zero nachodzeń, ciągłość', () => {
    const composition = composeStation(buildComposeInput(makeStation('st-b', ONE_TR)));
    const lvBus = segment(composition, 'st-b#lv-bus')!;
    const drop = segment(composition, 'st-b#lv-portal-drop')!;
    const portal = portalsOf(composition)[0];
    const busY = lvBus.points[0].y;
    const lvDrop = segment(composition, 'st-b#lv-drop-0')!;
    // Portal wisi DOKŁADNIE pod portem LV — zero dodatkowej szerokości stacji
    // (pomiar 2026-09-01: portal doklejony ZA blokiem łamał arkusz L0 golden
    // sieci 53 stacji z 2 na 3 wiersze i porzucał WSZYSTKIE nazwy stacji).
    expect(drop.points[0]).toEqual({ x: lvDrop.points[0].x, y: busY });
    expect(drop.points[1].y - drop.points[0].y).toBe(LV_PORTAL_DROP_HEIGHT);
    expect(drop.points[1]).toEqual({ x: portal.ports.top.x, y: portal.ports.top.y });
    expect(portal.x + LV_PORTAL_WIDTH / 2).toBe(lvDrop.points[0].x);
    // Zacisk bez odbioru i bez DER = sam rdzeń (port ± GRID).
    expect(Math.min(lvBus.points[0].x, lvBus.points[1].x)).toBe(lvDrop.points[0].x - GRID);
    expect(Math.max(lvBus.points[0].x, lvBus.points[1].x)).toBe(lvDrop.points[0].x + GRID);
    expect(allCompositionSymbolsOnGrid(composition)).toBe(true);
    expect(noCompositionSymbolOverlaps(composition)).toBe(true);
    expect(internalSegmentsEndAtPortsOrBus(composition)).toBe(true);
  });

  it('MULTI-TR (2 pola TR): oba porty LV schodzą do JEDNEGO zacisku, JEDEN portal na osi rdzenia (między portami; jedna domena nN stacji = jeden kontrakt station_ref)', () => {
    const composition = composeStation(buildComposeInput(makeStation('st-c', TWO_TR)));
    const lvBus = segment(composition, 'st-c#lv-bus')!;
    const drops = composition.segments.filter((s) => /#lv-drop-\d+$/.test(s.ownerRef));
    expect(drops).toHaveLength(2);
    for (const d of drops) expect(d.points[1].y).toBe(lvBus.points[0].y);
    const xs = drops.map((d) => d.points[0].x).sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(xs[1]);
    const portals = portalsOf(composition);
    expect(portals).toHaveLength(1);
    const portalCenter = portals[0].x + LV_PORTAL_WIDTH / 2;
    expect(portalCenter).toBe(snapToGrid((xs[0] + xs[1]) / 2));
    expect(portalCenter).toBeGreaterThan(xs[0]);
    expect(portalCenter).toBeLessThan(xs[1]);
    expect(internalSegmentsEndAtPortsOrBus(composition)).toBe(true);
    expect(noCompositionSymbolOverlaps(composition)).toBe(true);
    assertNoNnInterior(composition);
  });

  it('rząd DER strony nN + odbiór + portal współistnieją na zacisku: portal na osi, strzałka ZA portalem, trunk DER z prawego końca ZA strzałką', () => {
    const composition = composeStation(
      buildComposeInput(makeStation('st-d', ONE_TR, { derSources: [DER_NN_A, DER_NN_B], aggregatedLvLoad: ODBIOR })),
    );
    const lvBus = segment(composition, 'st-d#lv-bus')!;
    const busY = lvBus.points[0].y;
    const portal = portalsOf(composition)[0];
    const trunk = segment(composition, 'st-d#der-row-trunk')!;
    const rowBus = segment(composition, 'st-d#der-row-bus')!;
    const loadDrop = segment(composition, 'st-d#lv-load-drop')!;
    const loadArrow = composition.symbols.find((s) => s.symbolId === 'loadArrow')!;
    expect(trunk.points[0].y).toBe(busY);
    expect(trunk.points[1].y).toBe(busY + DER_ROW_TOP_CLEARANCE);
    // Strzałka odbioru ZA portalem (prześwit ≥ GRID), trunk DER ZA strzałką
    // (prześwit ≥ GRID) — żaden odcinek nie przecina pionu portalu ani strzałki
    // (inaczej `resolveTeeJunctions` dorysowałby fałszywy węzeł).
    expect(loadDrop.points[0].y).toBe(busY);
    expect(loadArrow.x).toBeGreaterThanOrEqual(portal.x + LV_PORTAL_WIDTH + GRID);
    expect(trunk.points[0].x).toBeGreaterThanOrEqual(loadArrow.x + SYMBOL_DEFS.loadArrow.width + GRID);
    expect(Math.min(rowBus.points[0].x, rowBus.points[1].x)).toBe(trunk.points[0].x);
    // Trunk schodzi z PRAWEGO końca zacisku (portal i strzałka wiszą na jego wnętrzu).
    const busRight = Math.max(lvBus.points[0].x, lvBus.points[1].x);
    expect(trunk.points[0].x).toBe(busRight);
    // Symbole DER w całości ZA portalem i strzałką.
    const derSymbols = composition.symbols.filter((s) => s.symbolId.startsWith('der'));
    expect(derSymbols).toHaveLength(2);
    for (const der of derSymbols) expect(der.x).toBeGreaterThanOrEqual(trunk.points[0].x);
    expect(allCompositionSymbolsOnGrid(composition)).toBe(true);
    expect(noCompositionSymbolOverlaps(composition)).toBe(true);
    expect(internalSegmentsEndAtPortsOrBus(composition)).toBe(true);
    assertNoNnInterior(composition);
  });

  it('pasmo nazw NADAL opisuje stronę nN (szyna nN · napięcie + odbiór/granica modelu)', () => {
    const zOdbiorem = composeStation(buildComposeInput(makeStation('st-e', ONE_TR, { aggregatedLvLoad: ODBIOR })));
    const rows = zOdbiorem.labels.stationName.rows.map((r) => r.text);
    expect(rows).toContain('Szyna nN · 0,4 kV');
    expect(rows.some((t) => t.startsWith('Odbiór ΣP'))).toBe(true);
    const bezOdbioru = composeStation(buildComposeInput(makeStation('st-f', ONE_TR)));
    expect(bezOdbioru.labels.stationName.rows.map((r) => r.text)).toContain('granica modelu — bez odbiorów nN');
  });
});

// ---------------------------------------------------------------------------
// (3) Spójność measure↔compose — ILOCZYN CECH.
// ---------------------------------------------------------------------------

describe('PORTAL nN — spójność measure↔compose (iloczyn: źródła nN × odbiór × liczba TR)', () => {
  it('gabaryt symbolu lvPortal == LV_PORTAL_WIDTH × LV_PORTAL_HEIGHT (literały measure zsynchronizowane z biblioteką)', () => {
    expect(SYMBOL_DEFS.lvPortal.width).toBe(LV_PORTAL_WIDTH);
    expect(SYMBOL_DEFS.lvPortal.height).toBe(LV_PORTAL_HEIGHT);
    expect(SYMBOL_DEFS.lvPortal.ports.map((p) => p.name)).toEqual(['top']);
  });

  const DER_VARIANTS = [
    { name: '0 źródeł nN', der: [] as readonly StationDerSourceInput[] },
    { name: '1 źródło nN', der: [DER_NN_A] },
    { name: '2 źródła nN', der: [DER_NN_A, DER_NN_B] },
  ] as const;
  const LOAD_VARIANTS = [
    { name: 'bez odbioru', load: null },
    { name: 'z odbiorem', load: ODBIOR },
  ] as const;
  const TR_VARIANTS = [
    { name: '1 TR', bays: ONE_TR },
    { name: '2 TR', bays: TWO_TR },
  ] as const;

  for (const derVariant of DER_VARIANTS) {
    for (const loadVariant of LOAD_VARIANTS) {
      for (const trVariant of TR_VARIANTS) {
        it(`${derVariant.name} × ${loadVariant.name} × ${trVariant.name}: osie portów measure==compose; rezerwacja − zwis == bufor (${GRID}); szerokość obejmuje portal i DER; portal JEDEN; zero wnętrza nN`, () => {
          const station = makeStation('st-iloczyn', trVariant.bays, {
            aggregatedLvLoad: loadVariant.load,
            derSources: derVariant.der,
          });
          const input = buildComposeInput(station);
          const composition = composeStation(input);
          // Osie portów LV z planu kolumn (measure) == realne porty (compose).
          const measurePortXs = lvTerminalPortXs(station).map((x) => x + input.column.x);
          const composePortXs = composition.segments
            .filter((s) => /#lv-drop-\d+$/.test(s.ownerRef))
            .map((s) => s.points[0].x)
            .sort((a, b) => a - b);
          expect(composePortXs).toEqual([...measurePortXs].sort((a, b) => a - b));
          // Rezerwacja B4 == zwis + bufor dolny (portal / DER / odbiór — max).
          const reservation = nnSideBelowBusHeight(station);
          const overhang = realOverhangBelowLvBus(composition);
          expect(reservation).toBeGreaterThanOrEqual(overhang);
          expect(reservation - overhang).toBeLessThanOrEqual(GRID);
          expect(reservation).toBeGreaterThanOrEqual(lvPortalExtraHeight(station));
          const portals = portalsOf(composition);
          expect(portals).toHaveLength(1);
          assertNoNnInterior(composition);
          // Blok B4 mieści CAŁY zwis.
          const lvBusY = segment(composition, 'st-iloczyn#lv-bus')!.points[0].y;
          expect(lvBusY + overhang).toBeLessThanOrEqual(input.blockTopY + stationBlockHeight(station));
          // Kolumna stacji obejmuje portal i CAŁY rząd DER (nic nie wystaje w sąsiada).
          const columnRight = input.column.x + requiredStationWidth(station);
          expect(portals[0].x + LV_PORTAL_WIDTH).toBeLessThanOrEqual(columnRight);
          for (const der of composition.symbols.filter((s) => s.symbolId.startsWith('der'))) {
            expect(der.x + SYMBOL_DEFS[der.symbolId].width).toBeLessThanOrEqual(columnRight);
          }
          expect(allCompositionSymbolsOnGrid(composition)).toBe(true);
          expect(noCompositionSymbolOverlaps(composition)).toBe(true);
          expect(internalSegmentsEndAtPortsOrBus(composition)).toBe(true);
        });
      }
    }
  }

  it('planLvTerminal: jedna prawda — portal NA OSI rdzenia, strzałka odbioru ZA portalem, trunk DER ZA strzałką, rząd DER flush-right za blokiem; wszystko NA siatce', () => {
    // Porty LV i `bx` (koniec bloku) leżą na siatce (origin symbolu TR na
    // siatce, port w osi; blok kolumn kończy się na siatce).
    const single = planLvTerminal([104], { hasLoad: false, hasNnDer: false, derRowFlushX: 144 });
    // rdzeń 96..112; portal 88..120 (oś 104); bez odbioru/DER zacisk = rdzeń.
    expect(single.busLeft).toBe(96);
    expect(single.busRight).toBe(112);
    expect(single.axisX).toBe(104);
    expect(single.portalCenterX).toBe(104);
    expect(single.loadDropX).toBeNull();
    // trunk DER (gdyby był): za prawą krawędzią portalu 120 + GRID = 128.
    expect(single.derTrunkX).toBe(128);
    expect(single.derRowStartX).toBe(144);
    const onlyLoad = planLvTerminal([104], { hasLoad: true, hasNnDer: false, derRowFlushX: 144 });
    // strzałka 16 szer.: pion na 120 + 8 + 8 = 136 (gabaryt 128..144), zacisk do 136.
    expect(onlyLoad.loadDropX).toBe(136);
    expect(onlyLoad.busRight).toBe(136);
    expect(onlyLoad.busLeft).toBe(96);
    const withLoadAndDer = planLvTerminal([104], { hasLoad: true, hasNnDer: true, derRowFlushX: 144 });
    // trunk DER za strzałką: 144 + 8 = 152; rząd DER nie przed trunkiem.
    expect(withLoadAndDer.loadDropX).toBe(136);
    expect(withLoadAndDer.derTrunkX).toBe(152);
    expect(withLoadAndDer.derRowStartX).toBe(152);
    expect(withLoadAndDer.busRight).toBe(152);
    const onlyDer = planLvTerminal([104], { hasLoad: false, hasNnDer: true, derRowFlushX: 200 });
    expect(onlyDer.derTrunkX).toBe(128);
    expect(onlyDer.derRowStartX).toBe(200);
    expect(onlyDer.busRight).toBe(128);
    const multi = planLvTerminal([96, 160], { hasLoad: false, hasNnDer: true, derRowFlushX: 200 });
    expect(multi.busLeft).toBe(96);
    expect(multi.axisX).toBe(128);
    expect(multi.portalCenterX).toBe(128);
    // rdzeń do 160 (za portalem 144): trunk 160 + 8 = 168.
    expect(multi.derTrunkX).toBe(168);
    expect(multi.busRight).toBe(168);
    for (const plan of [single, onlyLoad, withLoadAndDer, onlyDer, multi]) {
      for (const x of [plan.busLeft, plan.busRight, plan.axisX, plan.portalCenterX, plan.derTrunkX, plan.derRowStartX, plan.loadDropX ?? 0]) {
        expect(x % GRID).toBe(0);
      }
    }
  });

  it('stacja BEZ strony nN ⇒ lvPortalExtraHeight = 0, nnSideBelowBusHeight = 0, lvTerminalPortXs = [] (nie ma czego rezerwować)', () => {
    const lineOnly = makeStation('st-linie', [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_LINE, 1)], {
      aggregatedLvLoad: ODBIOR,
    });
    expect(lvPortalExtraHeight(lineOnly)).toBe(0);
    expect(nnSideBelowBusHeight(lineOnly)).toBe(0);
    expect(lvTerminalPortXs(lineOnly)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (4)(5) Źródła wg strony przyłączenia; brak portu LV.
// ---------------------------------------------------------------------------

describe('PORTAL nN — źródła DER wg strony przyłączenia', () => {
  it('strona nN: symbol DER w rzędzie na zacisku (za portalem), etykieta rodzaj+moc, missingData PUSTE', () => {
    const composition = composeStation(buildComposeInput(makeStation('d1', ONE_TR, { derSources: [DER_NN_A] })));
    const der = composition.symbols.filter((s) => s.symbolId === 'derPv');
    expect(der).toHaveLength(1);
    expect(der[0].sourceRef).toBe('gen-nn-a');
    expect(composition.labels.der.map((l) => l.text)).toEqual(['PV 500 kW']);
    expect(segment(composition, 'd1#der-row-bus')).toBeDefined();
    expect(composition.missingData).toEqual([]);
  });

  it('strona SN: pole źródłowe SN (#sn-source-descent), ZERO rzędu nN — rozdział stron z JEDNEGO predykatu', () => {
    const composition = composeStation(buildComposeInput(makeStation('d2', ONE_TR, { derSources: [DER_SN] })));
    expect(composition.segments.some((s) => s.ownerRef === 'gen-sn-1#sn-source-descent')).toBe(true);
    expect(segment(composition, 'd2#der-row-bus')).toBeUndefined();
    expect(portalsOf(composition)).toHaveLength(1);
  });

  it('mieszane (nN + SN): źródło nN w rzędzie na zacisku, źródło SN w polu źródłowym — oba widoczne, żadne podwójnie', () => {
    const composition = composeStation(
      buildComposeInput(makeStation('d3', ONE_TR, { derSources: [DER_NN_A, DER_SN] })),
    );
    expect(segment(composition, 'd3#der-row-bus')).toBeDefined();
    expect(composition.segments.some((s) => s.ownerRef === 'gen-sn-b#sn-source-descent')).toBe(false);
    expect(composition.segments.some((s) => s.ownerRef === 'gen-sn-1#sn-source-descent')).toBe(true);
    expect(composition.symbols.filter((s) => s.symbolId.startsWith('der')).map((s) => s.sourceRef).sort()).toEqual(['gen-nn-a', 'gen-sn-1']);
  });

  it('strona unknown przy stacji z TR: rząd nN KONWENCJĄ + jawne station.der.sideAssumedNn', () => {
    const composition = composeStation(
      buildComposeInput(makeStation('d4', ONE_TR, { derSources: [{ ...DER_NN_A, id: 'gen-unk', connectionSide: 'unknown' }] })),
    );
    expect(segment(composition, 'd4#der-row-bus')).toBeDefined();
    expect(composition.missingData).toEqual(['station.der.sideAssumedNn']);
  });

  it('stacja bez portu LV (pola liniowe) z hasLvSection ⇒ ZERO portalu; źródło nN bez zacisku ⇒ jawne station.der.unattached', () => {
    const lineOnly = makeStation('d5', [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_LINE, 1)], {
      derSources: [DER_NN_A],
    });
    const composition = composeStation(buildComposeInput(lineOnly));
    expect(portalsOf(composition)).toHaveLength(0);
    expect(composition.segments.some((s) => s.ownerRef.endsWith('#lv-bus'))).toBe(false);
    expect(composition.symbols.filter((s) => s.symbolId.startsWith('der'))).toHaveLength(0);
    // Dwie JAWNE luki (nie cisza): brak rekordu TR mimo deklaracji strony nN
    // (`refMissing`, TR2W-BEZ-POLA §0.C.4) i źródło nN bez zacisku.
    expect(composition.missingData).toContain('station.der.unattached');
    expect(composition.missingData).toContain('station.transformer.refMissing');
  });

  it('hasLvSection=false (pole TR obecne) ⇒ ZERO zacisku i portalu (strona nN nie deklarowana)', () => {
    const composition = composeStation(buildComposeInput(makeStation('d6', ONE_TR), false));
    expect(portalsOf(composition)).toHaveLength(0);
    expect(composition.segments.some((s) => s.ownerRef.endsWith('#lv-bus'))).toBe(false);
  });
});

describe('PORTAL nN — determinizm', () => {
  it('compose 2× tego samego wejścia (multi-TR + 2 źródła nN + odbiór) ⇒ bajt-identyczny wynik', () => {
    const input = buildComposeInput(
      makeStation('det', TWO_TR, { derSources: [DER_NN_A, DER_NN_B], aggregatedLvLoad: ODBIOR }),
    );
    expect(JSON.stringify(composeStation(input))).toBe(JSON.stringify(composeStation(input)));
  });
});
