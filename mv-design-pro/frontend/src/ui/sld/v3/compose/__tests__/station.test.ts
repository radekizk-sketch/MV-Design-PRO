/**
 * SLD V3 F5a — wyrocznie kompozycji stacji z prymitywów (SLD_CAD_SPEC_V3 §3,
 * §11 rozszerzenie F5). Syntetyki budowane na PRAWDZIWYM potoku
 * measure → bands → columns (F2/F3/r7b), żeby `column`/`busAxisY`/
 * `blockTopY` odpowiadały rzeczywistej geometrii wcześniejszych kroków.
 */
import { describe, expect, it } from 'vitest';

import { GRID } from '../../core/grid';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { FIELD_ROLE, ALL_FIELD_ROLES, type FieldRole } from '../../../v2/domain/apparatusContracts';
import type { BayPrimaryDeviceView, MiniBlockBayDescriptor } from '../../../v2/renderer/MiniBlockRmuRenderer';
import {
  bayColumnFootprint,
  bayColumnRequiredWidth,
  stationBlockHeight,
  type StationMeasureInput,
} from '../../layout/measure';
import { computeBands, type StationBandHeights } from '../../layout/bands';
import { computeColumns, type ComputeColumnsInput } from '../../layout/columns';
import { colorSegmentLabelRows, computeSegmentLabelSlotX } from '../../layout/segments';
import { resolveLabels } from '../../layout/labels';
import {
  allCompositionSymbolsOnGrid,
  apparatusSymbolsForRole,
  composeStation,
  fieldSilhouetteClass,
  fieldSilhouettesAreInjective,
  fieldStacksEndAtCableHead,
  internalSegmentsEndAtPortsOrBus,
  noCompositionSymbolOverlaps,
  stackFootprint,
  type ComposeStationInput,
} from '../station';

// ---------------------------------------------------------------------------
// Helpery syntetyczne (wzorzec z layout.test.ts / labels.test.ts).
// ---------------------------------------------------------------------------

function makeBay(
  fieldRole: FieldRole,
  index: number,
  overrides: Partial<MiniBlockBayDescriptor> = {},
): MiniBlockBayDescriptor {
  return {
    bayRef: `bay-${index}`,
    fieldRole,
    designation: `Pole ${index}`,
    hasMissingRequiredDevice: false,
    ...overrides,
  };
}

function makeStation(
  id: string,
  snBays: readonly MiniBlockBayDescriptor[],
  overrides: Partial<StationMeasureInput> = {},
): StationMeasureInput {
  return {
    id,
    name: `Stacja ${id}`,
    stationCode: 'S01',
    transformerRatedKva: 630,
    stationTypeLabel: 'stacja przelotowa',
    snBays,
    ...overrides,
  };
}

function bandHeightsFor(station: StationMeasureInput, incomingSegmentLabelText: string | null): StationBandHeights {
  return {
    incomingSegmentLabelText,
    portCaptionHeight: 0,
    stationBlockHeight: stationBlockHeight(station),
    nameBandHeight: 40,
  };
}

/** Uruchamia measure→bands→columns dla JEDNEJ stacji i zwraca gotowe
 *  wejście `composeStation` (column/busAxisY/blockTopY/nameSlot). */
function buildComposeInput(
  station: StationMeasureInput,
  overrides: Partial<Omit<ComposeStationInput, 'station' | 'column' | 'busAxisY' | 'blockTopY' | 'nameSlot'>> = {},
): ComposeStationInput {
  const rows = colorSegmentLabelRows(computeSegmentLabelSlotX([station], [null]));
  const bandsResult = computeBands([bandHeightsFor(station, null)], rows.rowCount);
  const input: ComputeColumnsInput = {
    stations: [station],
    incomingSegmentLabelTexts: [null],
    nameSlotBand: bandsResult.bands.B5,
    segmentSlotBand: bandsResult.bands.B1,
  };
  const { columns } = computeColumns(input);
  const column = columns[0];
  return {
    station,
    column: { x: column.x, width: column.width, tapX: column.tapX },
    busAxisY: bandsResult.bands.B2.y,
    blockTopY: bandsResult.bands.B4.y,
    nameSlot: column.nameSlot,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// (a) Spójność measure ↔ compose: gabaryt stosu aparatów IDENTYCZNY dla
// każdej roli pola (dwie niezależne implementacje muszą się zgadzać, bo
// measure REZERWUJE miejsce, a compose je WYPEŁNIA — patrz nagłówek station.ts).
// ---------------------------------------------------------------------------

describe('V3 compose/station — spójność measure↔compose (wymóg zadania F5a, F9.3: bayColumnFootprint jest data-aware)', () => {
  for (const role of ALL_FIELD_ROLES) {
    it(`rola ${role}, bez primary_devices (konwencja): stackFootprint(apparatusSymbolsForRole) === bayColumnFootprint`, () => {
      const fromCompose = stackFootprint(apparatusSymbolsForRole(role));
      const fromMeasure = bayColumnFootprint(makeBay(role, 0));
      expect(fromCompose).toEqual(fromMeasure);
    });
  }
});

// ---------------------------------------------------------------------------
// (a2) FIX-3 (recenzja F5a): stos aparatów FLUSH-LEFT + oznacznik sidecar PO
// PRAWEJ — bbox(stos ∪ oznacznik) musi zostać WEWNĄTRZ `bayColumnRequiredWidth`
// (measure.ts), dla każdej roli i oznaczników 1..4 znaki (poprzedni kod
// centrował stos w CAŁEJ rezerwacji, więc oznacznik ≥2-znakowy wystawał poza
// pole — patrz nagłówek `station.ts`).
// ---------------------------------------------------------------------------

describe('V3 compose/station — FIX-3: bbox(stos + oznacznik) ⊆ rezerwacja pola (bayColumnRequiredWidth)', () => {
  for (const role of ALL_FIELD_ROLES) {
    for (const designationLength of [1, 2, 3, 4]) {
      it(`rola ${role}, oznacznik ${designationLength}-znakowy: bbox w rezerwacji`, () => {
        const designation = 'Q'.repeat(designationLength);
        const bay = makeBay(role, 0, { designation });
        const station = makeStation(`fix3-${role}-${designationLength}`, [bay]);
        const composeInput = buildComposeInput(station);
        const composition = composeStation(composeInput);

        const reservedWidth = bayColumnRequiredWidth(station.snBays, 0, station.bayDirectionCaptions);
        const bx = composeInput.column.x + GRID; // blockLeftX (FIX-4): jedno pole = cały blok.

        const symbolMinX = Math.min(...composition.symbols.map((s) => s.x));
        const symbolMaxX = Math.max(...composition.symbols.map((s) => s.x + SYMBOL_DEFS[s.symbolId].width));

        expect(composition.labels.apparatus).toHaveLength(1);
        const [designationLabel] = resolveLabels({ simpleAnchored: composition.labels.apparatus });

        const bboxMinX = Math.min(symbolMinX, designationLabel.rect.x);
        const bboxMaxX = Math.max(symbolMaxX, designationLabel.rect.x + designationLabel.rect.width);

        expect(bboxMinX).toBeGreaterThanOrEqual(bx);
        expect(bboxMaxX).toBeLessThanOrEqual(bx + reservedWidth);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// (b) Wyrocznie geometryczne na kompozycji rzeczywistych footprintów.
// ---------------------------------------------------------------------------

describe('V3 compose/station — wyrocznie (grid_probe, zero-overlap, endsAtPortsOrBus)', () => {
  const footprints: ReadonlyArray<{ readonly name: string; readonly roles: readonly FieldRole[] }> = [
    { name: 'mv_lv_terminal', roles: [FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_TRANSFORMER] },
    { name: 'mv_lv_inline', roles: [FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_TRANSFORMER] },
    {
      name: 'mv_lv_branch',
      roles: [FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_TRANSFORMER],
    },
    {
      name: 'mv_lv_sectional',
      roles: [
        FIELD_ROLE.RMU_LINE,
        FIELD_ROLE.RMU_TRANSFORMER,
        FIELD_ROLE.COUPLER,
        FIELD_ROLE.RMU_LINE,
        FIELD_ROLE.RMU_TRANSFORMER,
      ],
    },
    { name: 'switching_station', roles: [FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_LINE] },
    { name: 'der_station', roles: [FIELD_ROLE.RMU_LINE, FIELD_ROLE.RMU_TRANSFORMER, FIELD_ROLE.DER_PV] },
  ];

  for (const { name, roles } of footprints) {
    it(`${name}: grid_probe / zero-overlap / endsAtPortsOrBus = zielone`, () => {
      const snBays = roles.map((role, index) => makeBay(role, index));
      const station = makeStation(name, snBays, {
        bayDirectionCaptions: snBays.map((_, i) => (i === 0 ? 'kier. GPZ' : null)),
      });
      const composeInput = buildComposeInput(station, { hasLvSection: true });
      const composition = composeStation(composeInput);

      expect(allCompositionSymbolsOnGrid(composition)).toBe(true);
      expect(noCompositionSymbolOverlaps(composition)).toBe(true);
      expect(internalSegmentsEndAtPortsOrBus(composition)).toBe(true);
      expect(composition.symbols.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// (c) bbox kompozycji ⊆ rezerwacja measure/bands (wysokość/szerokość bloku
// nie przekraczają B4/width kolumny).
// ---------------------------------------------------------------------------

describe('V3 compose/station — bbox kompozycji ⊆ rezerwacja measure/bands', () => {
  it('szerokość bloku (symbole, bez zejść do osi B2) mieści się w szerokości kolumny', () => {
    const snBays = [
      makeBay(FIELD_ROLE.RMU_LINE, 0),
      makeBay(FIELD_ROLE.RMU_LINE, 1),
      makeBay(FIELD_ROLE.RMU_LINE, 2),
      makeBay(FIELD_ROLE.RMU_TRANSFORMER, 3),
    ];
    const station = makeStation('branch', snBays);
    const composeInput = buildComposeInput(station);
    const composition = composeStation(composeInput);

    const symbolMinX = Math.min(...composition.symbols.map((s) => s.x));
    const symbolMaxX = Math.max(...composition.symbols.map((s) => s.x + 32)); // 32 = najszerszy symbol (TR2W)
    expect(symbolMinX).toBeGreaterThanOrEqual(composeInput.column.x);
    expect(symbolMaxX).toBeLessThanOrEqual(composeInput.column.x + composeInput.column.width);
  });

  it('wysokość bloku (od blockTopY do najniższego symbolu) nie przekracza stationBlockHeight (B4)', () => {
    const snBays = [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1)];
    const station = makeStation('terminal', snBays);
    const composeInput = buildComposeInput(station);
    const composition = composeStation(composeInput);

    // F9.3: `+40` (wysokość TR2W) był poprawny tylko, gdy TR2W było
    // NAJNIŻSZYM symbolem stacji — po F9.3 pole liniowe (§12.4, 6 aparatów)
    // jest WYŻSZE niż pole TR (3 aparaty), więc realną wysokość symbolu
    // trzeba czytać z `SYMBOL_DEFS`, nie zakładać stałej 40.
    const symbolMaxY = Math.max(...composition.symbols.map((s) => s.y + SYMBOL_DEFS[s.symbolId].height));
    const blockHeightUsed = symbolMaxY - composeInput.blockTopY;
    expect(blockHeightUsed).toBeLessThanOrEqual(stationBlockHeight(station));
  });
});

// ---------------------------------------------------------------------------
// (d) Szyna nN + odpływy — TYLKO gdy hasLvSection.
// ---------------------------------------------------------------------------

describe('V3 compose/station — szyna nN (spec §3: TYLKO gdy hasLvSection)', () => {
  const snBays = [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1)];
  const station = makeStation('lv-test', snBays);

  it('hasLvSection=true, pole TR obecne ⇒ dokładnie jeden odcinek #lv-bus', () => {
    const composition = composeStation(buildComposeInput(station, { hasLvSection: true }));
    const lvBus = composition.segments.filter((s) => s.ownerRef.endsWith('#lv-bus'));
    expect(lvBus).toHaveLength(1);
  });

  it('hasLvSection=false (domyślnie) ⇒ brak odcinka #lv-bus', () => {
    const composition = composeStation(buildComposeInput(station));
    const lvBus = composition.segments.filter((s) => s.ownerRef.endsWith('#lv-bus'));
    expect(lvBus).toHaveLength(0);
  });

  it('stacja bez pola TR, hasLvSection=true ⇒ brak odcinka #lv-bus (brak portów LV do zaczepienia)', () => {
    const lineOnly = makeStation('no-tr', [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_LINE, 1)]);
    const composition = composeStation(buildComposeInput(lineOnly, { hasLvSection: true }));
    const lvBus = composition.segments.filter((s) => s.ownerRef.endsWith('#lv-bus'));
    expect(lvBus).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (d2) F9.4 (spec §13.1 V12K-029, §14.1 strona nN): DER przyłączone do
// stacji — symbol + przewód + etykieta, koniec badge'a.
// ---------------------------------------------------------------------------

describe('V3 compose/station — F9.4: DER przyłączone (nn_side) jako pełnoprawne widoczne źródło', () => {
  const snBays = [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1)];

  it('1 DER (pv) + hasLvSection ⇒ symbol derPv połączony z szyną nN, etykieta „PV 500 kW"', () => {
    const station = makeStation('der-1', snBays, {
      derSources: [{ id: 'gen-pv-1', kind: 'pv', ratedPower: 0.5 }],
    });
    const composition = composeStation(buildComposeInput(station, { hasLvSection: true }));

    const derSymbols = composition.symbols.filter((s) => s.symbolId === 'derPv');
    expect(derSymbols).toHaveLength(1);
    expect(derSymbols[0].sourceRef).toBe('gen-pv-1');
    expect(derSymbols[0].missingData).toBeUndefined();

    expect(composition.labels.der).toHaveLength(1);
    expect(composition.labels.der[0].text).toBe('PV 500 kW');

    expect(allCompositionSymbolsOnGrid(composition)).toBe(true);
    expect(noCompositionSymbolOverlaps(composition)).toBe(true);
    expect(internalSegmentsEndAtPortsOrBus(composition)).toBe(true);

    // Połączenie realny: port `ac` DER leży NA odcinku `#der-row-bus`, który
    // z kolei dotyka `#der-row-trunk`, zaczepionego na szynie nN.
    const derRowBus = composition.segments.find((s) => s.ownerRef === `${station.id}#der-row-bus`);
    const derRowTrunk = composition.segments.find((s) => s.ownerRef === `${station.id}#der-row-trunk`);
    expect(derRowBus).toBeDefined();
    expect(derRowTrunk).toBeDefined();
    const acPort = derSymbols[0].ports.ac;
    expect(acPort).toBeDefined();
    expect(derRowBus!.points.every((p) => p.y === acPort!.y)).toBe(true);
  });

  it('2 DER (pv+bess) ⇒ dwa symbole, dwie etykiety, rząd szerszy niż jeden symbol', () => {
    const station = makeStation('der-2', snBays, {
      derSources: [
        { id: 'gen-pv-1', kind: 'pv', ratedPower: 0.5 },
        { id: 'gen-bess-1', kind: 'bess', ratedPower: 0.5 },
      ],
    });
    const composition = composeStation(buildComposeInput(station, { hasLvSection: true }));

    const derSymbols = composition.symbols.filter((s) => s.symbolId === 'derPv' || s.symbolId === 'derBess');
    expect(derSymbols).toHaveLength(2);
    expect(new Set(derSymbols.map((s) => s.sourceRef))).toEqual(new Set(['gen-pv-1', 'gen-bess-1']));
    expect(composition.labels.der.map((l) => l.text).sort()).toEqual(['BESS 500 kW', 'PV 500 kW']);

    expect(allCompositionSymbolsOnGrid(composition)).toBe(true);
    expect(noCompositionSymbolOverlaps(composition)).toBe(true);
    expect(internalSegmentsEndAtPortsOrBus(composition)).toBe(true);
  });

  it('DER kind=unknown (f92-2) ⇒ symbol derGenerator fallback + missingData=true, etykieta honest', () => {
    const station = makeStation('der-unknown', snBays, {
      derSources: [{ id: 'gen-unk-1', kind: 'unknown', ratedPower: 1, missingData: true }],
    });
    const composition = composeStation(buildComposeInput(station, { hasLvSection: true }));
    const derSymbols = composition.symbols.filter((s) => s.symbolId === 'derGenerator');
    expect(derSymbols).toHaveLength(1);
    expect(derSymbols[0].missingData).toBe(true);
    expect(composition.labels.der[0].text).toBe('Źródło (typ nieznany) 1,0 MW');
  });

  it('DER bez ratedPower ⇒ etykieta bez mocy (brak mocy → brak etykiety mocy, NIE zero)', () => {
    const station = makeStation('der-no-power', snBays, {
      derSources: [{ id: 'gen-pv-2', kind: 'pv', ratedPower: null }],
    });
    const composition = composeStation(buildComposeInput(station, { hasLvSection: true }));
    expect(composition.labels.der[0].text).toBe('PV');
  });

  it('stacja bez derSources ⇒ zero symboli DER, zero zmian geometrii istniejącej (regresja)', () => {
    const station = makeStation('no-der', snBays);
    const composition = composeStation(buildComposeInput(station, { hasLvSection: true }));
    const derSymbols = composition.symbols.filter((s) => s.symbolId.startsWith('der'));
    expect(derSymbols).toHaveLength(0);
    expect(composition.labels.der).toHaveLength(0);
    expect(composition.segments.some((s) => s.ownerRef.endsWith('#der-row-bus'))).toBe(false);
  });

  it('DER na stacji bez pola TR i bez hasLvSection (brak punktu przyłączenia) ⇒ DER nie rysowany, zero fabrykacji', () => {
    const lineOnly = makeStation('der-no-attach', [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_LINE, 1)], {
      derSources: [{ id: 'gen-pv-orphan', kind: 'pv', ratedPower: 0.5 }],
    });
    const composition = composeStation(buildComposeInput(lineOnly));
    const derSymbols = composition.symbols.filter((s) => s.symbolId.startsWith('der'));
    expect(derSymbols).toHaveLength(0);
    // F9.4 (runda korekcyjna, F-2 — SPŁATA „cichego gubienia"): ta luka
    // NIE jest już ciszą — `StationComposition.missingData` (ujednolicone z
    // `GpzComposition.missingData`, `./gpz`) ZGŁASZA ją wprost. PRZED
    // poprawką ta asercja byłaby `toEqual([])` — dowód, że wyrocznia
    // faktycznie gryzie (test negatywny), nie dług w komentarzu.
    expect(composition.missingData).toEqual(['station.der.unattached']);
  });

  it('stacja BEZ luki (DER podłączony poprawnie) ⇒ missingData PUSTE (fixtura pozytywna, kontrast z testem wyżej)', () => {
    const station = makeStation('der-ok', snBays, {
      derSources: [{ id: 'gen-pv-1', kind: 'pv', ratedPower: 0.5 }],
    });
    const composition = composeStation(buildComposeInput(station, { hasLvSection: true }));
    expect(composition.missingData).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (e) Podpisy kierunku (spec §9) — wejście gotowe dla resolveLabels.
// ---------------------------------------------------------------------------

describe('V3 compose/station — podpisy kierunku (spec §9) jako port-caption', () => {
  it('bayDirectionCaptions index-aligned ⇒ dokładnie tyle portCaptions ile pól NIE-null', () => {
    const snBays = [
      makeBay(FIELD_ROLE.RMU_LINE, 0),
      makeBay(FIELD_ROLE.RMU_LINE, 1),
      makeBay(FIELD_ROLE.RMU_LINE, 2),
      makeBay(FIELD_ROLE.RMU_TRANSFORMER, 3),
    ];
    const station = makeStation('branch-cap', snBays, {
      bayDirectionCaptions: ['kier. S01', 'kier. S03', 'odg. S15', null],
    });
    const composition = composeStation(buildComposeInput(station));
    expect(composition.labels.portCaptions).toHaveLength(3);
    expect(composition.labels.portCaptions.map((p) => p.text)).toEqual(['kier. S01', 'kier. S03', 'odg. S15']);
    for (const caption of composition.labels.portCaptions) {
      expect(caption.anchorX % GRID).toBe(0);
      expect(caption.primaryRect.width).toBeGreaterThan(0);
    }
  });

  it('brak bayDirectionCaptions ⇒ brak portCaptions (nie ukryty dług — brak danych)', () => {
    const snBays = [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1)];
    const station = makeStation('no-cap', snBays);
    const composition = composeStation(buildComposeInput(station));
    expect(composition.labels.portCaptions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (f) Determinizm (pryncypium P7).
// ---------------------------------------------------------------------------

describe('V3 compose/station — determinizm', () => {
  it('to samo wejście ⇒ identyczny wynik (dwukrotne wywołanie, głęboka równość)', () => {
    const snBays = [
      makeBay(FIELD_ROLE.RMU_LINE, 0),
      makeBay(FIELD_ROLE.RMU_LINE, 1),
      makeBay(FIELD_ROLE.RMU_TRANSFORMER, 2, { cbState: 'closed', dsState: 'open' }),
    ];
    const station = makeStation('det', snBays, { bayDirectionCaptions: ['kier. GPZ', 'kier. S02', null] });
    const composeInput = buildComposeInput(station, { hasLvSection: true });

    const first = composeStation(composeInput);
    const second = composeStation(composeInput);
    expect(second).toEqual(first);
  });
});

// ---------------------------------------------------------------------------
// (g) F9.3 — §12.1 „prymat danych nad konwencją": gałąź „dane" vs „konwencja"
// + znacznik `apparatusSource`/`deviceRef` (cell_sequence_probe).
//
// DECYZJA ZAKRESU (patrz raport F9.3): `MiniBlockBayDescriptor.primaryDevices`
// jest KONTRAKTEM WEJŚCIOWYM `compose/station.ts` — projekcja
// `Bay.primary_devices` (ENM) → `primaryDevices` (sortowanie wg `placement`,
// mapowanie `switch_state`) jest już w CAŁOŚCI przetestowana end-to-end w
// F9.2 (`v2/canvas/__tests__/enmToSldAdapter.test.ts`, opis „F9.2 — projekcja
// Bay.primary_devices"). Te testy budują `primaryDevices` WPROST (jak
// wyprodukowałby go adapter — kolejność UPSTREAM→MIDSTREAM→DOWNSTREAM), żeby
// sprawdzić stronę KONSUMPCJI (`compose/station.ts`), bez duplikowania
// ENM→adapter poza autoryzacją tego zadania (`v3/compose/station.ts`).
// ---------------------------------------------------------------------------

/** Pełny łańcuch §12.2 (od szyny w dół, jak wyprodukowałby adapter — już
 *  posortowany wg `placement`) — `DS_szynowy(UPSTREAM) → CB(MIDSTREAM) →
 *  CT(MIDSTREAM) → DS_liniowy(DOWNSTREAM) → ES(DOWNSTREAM) →
 *  CABLE_HEAD(DOWNSTREAM)`. */
const FULL_LINE_CHAIN_PRIMARY_DEVICES: readonly BayPrimaryDeviceView[] = [
  { deviceRef: 'ds-bus', kind: 'DS', placement: 'UPSTREAM', switchState: 'closed' },
  { deviceRef: 'cb-1', kind: 'CB', placement: 'MIDSTREAM', switchState: 'closed' },
  { deviceRef: 'ct-1', kind: 'CT', placement: 'MIDSTREAM' },
  { deviceRef: 'ds-line', kind: 'DS', placement: 'DOWNSTREAM', switchState: 'open' },
  { deviceRef: 'es-1', kind: 'ES', placement: 'DOWNSTREAM', switchState: 'open' },
  { deviceRef: 'head-1', kind: 'CABLE_HEAD', placement: 'DOWNSTREAM' },
];

describe('V3 compose/station — F9.3 §12.1: gałąź „dane" (fixtura syntetyczna, f92-1)', () => {
  it('cell_sequence_probe (dane): sekwencja symboli == sekwencja kind wg placement, apparatusSource="dane", deviceRef 1:1', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, { primaryDevices: FULL_LINE_CHAIN_PRIMARY_DEVICES });
    const station = makeStation('data-path', [bay]);
    const composition = composeStation(buildComposeInput(station));

    expect(composition.symbols.map((s) => s.symbolId)).toEqual([
      'disconnector', 'breaker', 'currentTransformer', 'disconnector', 'earthSwitch', 'cableHead',
    ]);
    expect(composition.symbols.every((s) => s.apparatusSource === 'dane')).toBe(true);
    expect(composition.symbols.map((s) => s.deviceRef)).toEqual([
      'ds-bus', 'cb-1', 'ct-1', 'ds-line', 'es-1', 'head-1',
    ]);
    // Stan łącznika PER APARAT (nie per-kind agregat konwencji) — dwa
    // `disconnector` w tym łańcuchu mają RÓŻNE stany (`ds-bus` zamknięty,
    // `ds-line` otwarty), co dowodzi, że stan pochodzi z `switchState`
    // KAŻDEGO urządzenia, nie z jednego agregatu `bay.dsState`.
    expect(composition.symbols[0].state).toBe('closed');
    expect(composition.symbols[3].state).toBe('open');
  });

  it('DER-kindy w primary_devices są odfiltrowane (nie są aparatem pola, §12.1) — fallback konwencji, gdy WSZYSTKIE odfiltrowane', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: [{ deviceRef: 'pv-1', kind: 'GENERATOR_PV', placement: 'OFF_PATH' }],
    });
    const station = makeStation('der-only-devices', [bay]);
    const composition = composeStation(buildComposeInput(station));

    // Brak aparatów mapowalnych ⇒ fallback konwencji (§12.4) dla LINE_IN.
    expect(composition.symbols.every((s) => s.apparatusSource === 'konwencja')).toBe(true);
    expect(composition.symbols.map((s) => s.symbolId)).toEqual(
      [...apparatusSymbolsForRole(FIELD_ROLE.LINE_IN)],
    );
  });

  it('LOAD_SWITCH mapuje się na disconnector (aproksymacja udokumentowana, brak dedykowanego glifu)', () => {
    const bay = makeBay(FIELD_ROLE.COUPLER, 0, {
      primaryDevices: [{ deviceRef: 'ls-1', kind: 'LOAD_SWITCH', placement: 'UPSTREAM' }],
    });
    const station = makeStation('load-switch', [bay]);
    const composition = composeStation(buildComposeInput(station));
    expect(composition.symbols.map((s) => s.symbolId)).toEqual(['disconnector']);
    expect(composition.symbols[0].apparatusSource).toBe('dane');
  });

  it('F9.6 (§12.5, V12K-028): SURGE_ARRESTER w primary_devices renderuje symbol surgeArrester ze źródła "dane"', () => {
    const chainWithSa: readonly BayPrimaryDeviceView[] = [
      ...FULL_LINE_CHAIN_PRIMARY_DEVICES.slice(0, -1),
      { deviceRef: 'sa-1', kind: 'SURGE_ARRESTER', placement: 'DOWNSTREAM' },
      FULL_LINE_CHAIN_PRIMARY_DEVICES[FULL_LINE_CHAIN_PRIMARY_DEVICES.length - 1],
    ];
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, { primaryDevices: chainWithSa });
    const station = makeStation('data-path-sa', [bay]);
    const composition = composeStation(buildComposeInput(station));

    expect(composition.symbols.map((s) => s.symbolId)).toEqual([
      'disconnector', 'breaker', 'currentTransformer', 'disconnector', 'earthSwitch', 'surgeArrester', 'cableHead',
    ]);
    expect(composition.symbols.every((s) => s.apparatusSource === 'dane')).toBe(true);
    expect(composition.symbols.map((s) => s.deviceRef)).toContain('sa-1');
  });
});

describe('V3 compose/station — F9.3 §12.4: gałąź „konwencja" — znacznik na KAŻDYM polu bez primary_devices', () => {
  for (const role of ALL_FIELD_ROLES) {
    it(`rola ${role}: bez primary_devices ⇒ WSZYSTKIE symbole apparatusSource="konwencja", 0 deviceRef, sekwencja == tabela §12.4`, () => {
      const bay = makeBay(role, 0);
      const station = makeStation(`convention-${role}`, [bay]);
      const composition = composeStation(buildComposeInput(station));

      expect(composition.symbols.length).toBeGreaterThan(0);
      expect(composition.symbols.every((s) => s.apparatusSource === 'konwencja')).toBe(true);
      expect(composition.symbols.every((s) => s.deviceRef === undefined)).toBe(true);
      expect(composition.symbols.map((s) => s.symbolId)).toEqual([...apparatusSymbolsForRole(role)]);
    });
  }

  it('§12.5 (V12K-028): ZERO symboli surgeArrester w konwencji, dla KAŻDEJ roli', () => {
    for (const role of ALL_FIELD_ROLES) {
      expect(apparatusSymbolsForRole(role)).not.toContain('surgeArrester');
    }
  });
});

// ---------------------------------------------------------------------------
// (h) F9.3 — §12.3 field_entry_probe: pole liniowe kończy stos głowicą.
// ---------------------------------------------------------------------------

describe('V3 compose/station — F9.3 §12.3: field_entry_probe (głowica na końcu toru pola liniowego)', () => {
  it('konwencja (§12.4): KAŻDE pole liniowe (LINE_IN/LINE_OUT/LINE_BRANCH/RMU_LINE/GPZ_LINE_BAY) kończy się cableHead', () => {
    const lineRoles: FieldRole[] = [
      FIELD_ROLE.LINE_IN, FIELD_ROLE.LINE_OUT, FIELD_ROLE.LINE_BRANCH, FIELD_ROLE.RMU_LINE, FIELD_ROLE.GPZ_LINE_BAY,
    ];
    const snBays = lineRoles.map((role, i) => makeBay(role, i));
    const station = makeStation('entry-probe-convention', snBays);
    const composition = composeStation(buildComposeInput(station));
    expect(fieldStacksEndAtCableHead(composition, snBays)).toBe(true);
  });

  it('dane (§12.1): pole liniowe z CABLE_HEAD w DOWNSTREAM ⇒ zielone', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, { primaryDevices: FULL_LINE_CHAIN_PRIMARY_DEVICES });
    const snBays = [bay];
    const station = makeStation('entry-probe-data-ok', snBays);
    const composition = composeStation(buildComposeInput(station));
    expect(fieldStacksEndAtCableHead(composition, snBays)).toBe(true);
  });

  it('dane (§12.1): pole liniowe BEZ CABLE_HEAD w danych ⇒ FAIL (luka danych, NIE fabrykowana głowica)', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: FULL_LINE_CHAIN_PRIMARY_DEVICES.filter((d) => d.kind !== 'CABLE_HEAD'),
    });
    const snBays = [bay];
    const station = makeStation('entry-probe-data-gap', snBays);
    const composition = composeStation(buildComposeInput(station));
    expect(fieldStacksEndAtCableHead(composition, snBays)).toBe(false);
  });

  it('pola NIE-liniowe (TR/sprzęgło/pomiar/DER) są poza zakresem wyroczni (zawsze zielone)', () => {
    const snBays = [
      makeBay(FIELD_ROLE.TRANSFORMER, 0),
      makeBay(FIELD_ROLE.COUPLER, 1),
      makeBay(FIELD_ROLE.MEASUREMENT, 2),
      makeBay(FIELD_ROLE.DER_PV, 3),
    ];
    const station = makeStation('entry-probe-non-line', snBays);
    const composition = composeStation(buildComposeInput(station));
    expect(fieldStacksEndAtCableHead(composition, snBays)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (i) F9.3 — §14.3 field_silhouette_probe.
// ---------------------------------------------------------------------------

describe('V3 compose/station — F9.3 §14.3/V12K-031: field_silhouette_probe (rola→sylwetka injektywne PONAD KLASY równoważności, restauracja po recenzji Opusa FIX-2)', () => {
  it('GLOBALNIE: każde dwie role SPOZA tej samej klasy równoważności mają RÓŻNE sygnatury wizualne (dowód na ALL_FIELD_ROLES, nie per-stacja)', () => {
    expect(fieldSilhouettesAreInjective()).toBe(true);
  });

  it('7 klas sylwetki (linia/TR/sprzęgło/pomiar/3×DER) — reprezentanci dają parami RÓŻNE sygnatury', () => {
    const classes: FieldRole[] = [
      FIELD_ROLE.LINE_IN, FIELD_ROLE.TRANSFORMER, FIELD_ROLE.COUPLER, FIELD_ROLE.MEASUREMENT,
      FIELD_ROLE.DER_PV, FIELD_ROLE.DER_BESS, FIELD_ROLE.DER_FW,
    ];
    const signatures = classes.map((role) => [...apparatusSymbolsForRole(role)].sort().join(','));
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it('RULING V12K-031 (§14.3): LINE_IN/LINE_OUT/LINE_BRANCH/RMU_LINE/GPZ_LINE_BAY należą do JEDNEJ klasy równoważności `line` — fizycznie identyczna konstrukcja (§12.2/§12.4), dzielą sygnaturę ŚWIADOMIE (kierunek niesie podpis §9 + strzałki F9.5, NIE sylwetka) — to NIE jest naruszenie injektywności', () => {
    const lineRoles: FieldRole[] = [
      FIELD_ROLE.LINE_IN, FIELD_ROLE.LINE_OUT, FIELD_ROLE.LINE_BRANCH, FIELD_ROLE.RMU_LINE, FIELD_ROLE.GPZ_LINE_BAY,
    ];
    for (const role of lineRoles) expect(fieldSilhouetteClass(role)).toBe('line');
    const signatures = new Set(lineRoles.map((role) => [...apparatusSymbolsForRole(role)].sort().join(',')));
    // Wszystkie role „line" dzielą TĘ SAMĄ sygnaturę (stos konwencji per rola
    // jest identyczny — `apparatusSymbolsForRole` domyślna gałąź) — dowód, że
    // to jest ŚWIADOME dzielenie w klasie, nie przypadek.
    expect(signatures.size).toBe(1);
  });

  it('RMU_TRANSFORMER należy do klasy `transformer` (razem z TRANSFORMER) — dzieli sygnaturę z TRANSFORMER, ale RÓŻNI SIĘ od klasy `line` (mv_lv_sectional: RMU_LINE/RMU_TRANSFORMER/COUPLER wymieszane, parami różne KLASY)', () => {
    expect(fieldSilhouetteClass(FIELD_ROLE.RMU_TRANSFORMER)).toBe('transformer');
    expect(fieldSilhouetteClass(FIELD_ROLE.TRANSFORMER)).toBe('transformer');
    const sigLine = [...apparatusSymbolsForRole(FIELD_ROLE.RMU_LINE)].sort().join(',');
    const sigTr = [...apparatusSymbolsForRole(FIELD_ROLE.RMU_TRANSFORMER)].sort().join(',');
    const sigCoupler = [...apparatusSymbolsForRole(FIELD_ROLE.COUPLER)].sort().join(',');
    expect(new Set([sigLine, sigTr, sigCoupler]).size).toBe(3);
  });

  it('ALL_FIELD_ROLES niesie WSZYSTKIE 12 ról zdefiniowanych (sanity — wyrocznia globalna musi ćwiczyć cały zbiór, nie podzbiór wybrany ręcznie)', () => {
    expect(ALL_FIELD_ROLES.length).toBe(12);
  });
});

