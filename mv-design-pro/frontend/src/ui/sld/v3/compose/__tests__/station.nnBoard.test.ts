/**
 * P0.8 nN (H_PLAN_IMPLEMENTACJI_NN §P0.8, seam A8 §9.2.1) — kompozycja
 * odpływów nN rzeczywistych (`StationMeasureInput.nnBoard`) w `compose/
 * station.ts`. Wzorzec `station.tr2wBezPola.test.ts`: `composeStation`
 * wołana WPROST z minimalnym `ComposeStationInput`, geometria sprawdzona
 * wyroczniami (`allCompositionSymbolsOnGrid`/`noCompositionSymbolOverlaps`),
 * nie pikselami.
 */
import { describe, expect, it } from 'vitest';

import { FIELD_ROLE, type FieldRole } from '../../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../../v2/renderer/MiniBlockRmuRenderer';
import type { SldNnBoardSection, SldNnFeeder } from '../../../shared/nnBoardTypes';
import { computeBands, type StationBandHeights } from '../../layout/bands';
import { computeColumns } from '../../layout/columns';
import { colorSegmentLabelRows, computeSegmentLabelSlotX } from '../../layout/segments';
import {
  requiredStationWidth,
  stationBlockHeight,
  stationHasLvSide,
  type StationMeasureInput,
} from '../../layout/measure';
import {
  composeStation,
  allCompositionSymbolsOnGrid,
  noCompositionSymbolOverlaps,
  type ComposeStationInput,
  type StationComposition,
} from '../station';

function makeBay(fieldRole: FieldRole, index: number, busRef?: string): MiniBlockBayDescriptor {
  return {
    bayRef: `bay-${index}`,
    fieldRole,
    designation: `Pole ${index}`,
    hasMissingRequiredDevice: false,
    busRef,
  };
}

function feeder(overrides: Partial<SldNnFeeder>): SldNnFeeder {
  return {
    branchRef: 'brc/default',
    apparatusKind: null,
    apparatusRef: null,
    apparatusLabel: null,
    destinationKind: 'unknown',
    destinationRef: null,
    destinationLabel: null,
    cableRefs: [],
    ...overrides,
  };
}

function makeStation(
  id: string,
  overrides: Partial<StationMeasureInput> = {},
): StationMeasureInput {
  return {
    id,
    name: `Stacja ${id}`,
    stationCode: 'S01',
    snBays: [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1)],
    hasTransformer: true,
    transformerUnits: [{ ref: 'tr/1', hvBusRef: undefined, lvBusRef: 'bus/nn' }],
    ...overrides,
  } as StationMeasureInput;
}

function buildComposeInput(station: StationMeasureInput): ComposeStationInput {
  const rows = colorSegmentLabelRows(computeSegmentLabelSlotX([station], [null]));
  const bandHeights: StationBandHeights = {
    incomingSegmentLabelText: null,
    portCaptionHeight: 0,
    stationBlockHeight: stationBlockHeight(station),
    nameBandHeight: 40,
  };
  const bands = computeBands([bandHeights], rows.rowCount);
  const { columns } = computeColumns({
    stations: [station],
    incomingSegmentLabelTexts: [null],
    nameSlotBand: bands.bands.B5,
    segmentSlotBand: bands.bands.B1,
  });
  const column = columns[0];
  return {
    station,
    column: { x: column.x, width: column.width, tapX: column.tapX },
    busAxisY: bands.bands.B2.y,
    blockTopY: bands.bands.B4.y,
    nameSlot: column.nameSlot,
    hasLvSection: stationHasLvSide(station),
  };
}

const compose = (station: StationMeasureInput): StationComposition =>
  composeStation(buildComposeInput(station));

describe('P0.8 nN — odpływy RZECZYWISTE zastępują strzałkę zagregowanego odbioru', () => {
  const mcbFeeder = feeder({
    branchRef: 'brc/mcb1',
    apparatusKind: 'MCB',
    apparatusRef: 'brc/mcb1',
    apparatusLabel: 'MCB B16',
    destinationKind: 'load',
    destinationRef: 'ld/1',
    destinationLabel: 'Mieszkanie 1',
  });
  const fuseFeeder = feeder({
    branchRef: 'brc/fuse1',
    apparatusKind: 'FUSE_SWITCH',
    apparatusRef: 'brc/fuse1',
    apparatusLabel: 'gG NH00',
    destinationKind: 'board',
    destinationRef: 'stn/rgnn2',
    destinationLabel: 'RGnN-2',
  });
  const bareCableFeeder = feeder({
    branchRef: 'brc/bare',
    apparatusKind: null,
    destinationKind: 'unknown',
  });
  const unresolvedFeeder = feeder({
    branchRef: 'brc/unresolved',
    apparatusKind: 'UNRESOLVED',
    apparatusRef: 'brc/unresolved',
    apparatusLabel: 'Aparat nierozpoznany',
    destinationKind: 'load',
    destinationRef: 'ld/2',
    destinationLabel: 'Odbiór 2',
  });

  const sections: readonly SldNnBoardSection[] = [
    { sectionId: 'sec1', busRef: 'bus/nn', incomer: null, feeders: [mcbFeeder, fuseFeeder, bareCableFeeder, unresolvedFeeder] },
  ];

  const station = makeStation('s-nn', {
    nnBoard: sections,
    aggregatedLvLoad: { pMw: 0.05, qMvar: 0.01, count: 4 },
  });
  const c = compose(station);

  it('BRAK loadArrow — odpływy strukturalne ZASTĘPUJĄ agregat (mutually exclusive)', () => {
    expect(c.symbols.some((s) => s.symbolId === 'loadArrow')).toBe(false);
  });

  it('MCB: symbol nnBreaker z ownerRef = realny ref ENM aparatu (klik otwiera rekord)', () => {
    const sym = c.symbols.find((s) => s.symbolId === 'nnBreaker');
    expect(sym).toBeTruthy();
    expect(sym!.sourceRef).toBe('brc/mcb1');
  });

  it('FUSE_SWITCH + cel=board: symbol nnFuseSwitch ORAZ liść nnDistributionBoard, oba z realnym ownerRef', () => {
    const fuseSym = c.symbols.find((s) => s.symbolId === 'nnFuseSwitch');
    expect(fuseSym?.sourceRef).toBe('brc/fuse1');
    const boardSym = c.symbols.find((s) => s.symbolId === 'nnDistributionBoard');
    expect(boardSym).toBeTruthy();
    expect(boardSym!.sourceRef).toBe('stn/rgnn2');
  });

  it('goły kabel (apparatusKind=null): ZERO symbolu aparatu dla tego odpływu (nie fabrykuje wyłącznika)', () => {
    // Policz: 4 odpływy, z czego 2 mają aparat rozpoznany (MCB, FUSE_SWITCH),
    // 1 UNRESOLVED (też brak symbolu), 1 goły kabel (brak symbolu) — łącznie
    // symboli aparatu = 2 (breaker+fuse), NIE 4.
    const apparatusSymbols = c.symbols.filter((s) => s.symbolId === 'nnBreaker' || s.symbolId === 'nnFuseSwitch');
    expect(apparatusSymbols).toHaveLength(2);
  });

  it('UNRESOLVED: ZERO symbolu podstawionego (nie wyłącznik domyślny) + komunikat błędu w etykiecie + missingData', () => {
    const unresolvedApparatusSymbol = c.symbols.find(
      (s) => (s.symbolId === 'nnBreaker' || s.symbolId === 'nnFuseSwitch') && s.sourceRef === 'brc/unresolved',
    );
    expect(unresolvedApparatusSymbol).toBeUndefined();
    const label = c.labels.apparatus.find((l) => l.ownerRef.startsWith('brc/unresolved#'));
    expect(label?.text).toContain('Aparat nierozpoznany');
    expect(c.missingData).toContain('station.nnFeeder.apparatusUnresolved:brc/unresolved');
  });

  it('goły kabel z destinationKind=unknown: missingData niesie kod granicy modelu (payload=branchRef)', () => {
    expect(c.missingData).toContain('station.nnFeeder.destinationUnknown:brc/bare');
  });

  it('KAŻDY odpływ ma tor widoczny (segment ownerRef=branchRef) — ciągłość toru nawet bez symbolu', () => {
    for (const f of [mcbFeeder, fuseFeeder, bareCableFeeder, unresolvedFeeder]) {
      expect(c.segments.some((s) => s.ownerRef === f.branchRef)).toBe(true);
    }
  });

  it('geometria: wszystkie symbole na siatce, ZERO nachodzeń (4 odpływy w jednym rzędzie)', () => {
    expect(allCompositionSymbolsOnGrid(c)).toBe(true);
    expect(noCompositionSymbolOverlaps(c)).toBe(true);
  });

  it('determinizm: dwa biegi identycznego wejścia dają bajt-identyczną kompozycję', () => {
    const c2 = compose(station);
    expect(JSON.stringify(c)).toBe(JSON.stringify(c2));
  });
});

describe('P0.8 nN — substrat: stacja BEZ danych strukturalnych zachowuje zachowanie SPRZED karty', () => {
  it('nnBoard=[] (brak sekcji) + aggregatedLvLoad obecne: loadArrow rysowany JAK DOTYCHCZAS', () => {
    const stacjaBez = makeStation('s-legacy', {
      nnBoard: [],
      aggregatedLvLoad: { pMw: 0.05, qMvar: 0.01, count: 4 },
    });
    const c = compose(stacjaBez);
    expect(c.symbols.some((s) => s.symbolId === 'loadArrow')).toBe(true);
    expect(c.symbols.some((s) => s.symbolId === 'nnBreaker' || s.symbolId === 'nnFuseSwitch' || s.symbolId === 'nnDistributionBoard')).toBe(false);
  });

  it('nnBoard NIEOBECNE (undefined, jak przed kartą P0.8): zachowanie identyczne z nnBoard=[]', () => {
    const bezPola = makeStation('s-undefined', { aggregatedLvLoad: { pMw: 0.05, qMvar: 0.01, count: 4 } });
    delete (bezPola as { nnBoard?: unknown }).nnBoard;
    const cBez = compose(bezPola);
    const cJawnyPusty = compose(makeStation('s-undefined', { nnBoard: [], aggregatedLvLoad: { pMw: 0.05, qMvar: 0.01, count: 4 } }));
    // Ta sama treść (poza id nazwy stacji, identyczne w tym teście).
    expect(JSON.stringify(cBez)).toBe(JSON.stringify(cJawnyPusty));
  });

  it('sekcja BEZ odpływów (feeders=[]): traktowana jak nnBoard=[] — loadArrow zachowany', () => {
    const stacjaPustaSekcja = makeStation('s-empty-section', {
      nnBoard: [{ sectionId: 'sec1', busRef: 'bus/nn', incomer: null, feeders: [] }],
      aggregatedLvLoad: { pMw: 0.05, qMvar: 0.01, count: 4 },
    });
    const c = compose(stacjaPustaSekcja);
    expect(c.symbols.some((s) => s.symbolId === 'loadArrow')).toBe(true);
  });
});

describe('P0.8 nN — rezerwacja szerokości (measure↔compose, wzorzec DER-row)', () => {
  it('N odpływów: rezerwacja szerokości ROŚNIE z liczbą odpływów, rysunek mieści się w rezerwacji', () => {
    const jedenOdplyw: readonly SldNnBoardSection[] = [
      { sectionId: 'sec1', busRef: 'bus/nn', incomer: null, feeders: [feeder({ branchRef: 'brc/1', apparatusKind: 'MCB', apparatusRef: 'brc/1', apparatusLabel: 'MCB B16', destinationKind: 'load', destinationLabel: 'Odbiór A' })] },
    ];
    const pieciOdplywow: readonly SldNnBoardSection[] = [
      {
        sectionId: 'sec1', busRef: 'bus/nn', incomer: null,
        feeders: Array.from({ length: 5 }, (_, i) =>
          feeder({
            branchRef: `brc/${i}`,
            apparatusKind: 'MCB',
            apparatusRef: `brc/${i}`,
            apparatusLabel: `MCB B${16 + i}`,
            destinationKind: 'load',
            destinationLabel: `Odbiór ${i}`,
          })),
      },
    ];
    const stacjaMalo = makeStation('s-malo', { nnBoard: jedenOdplyw });
    const stacjaDuzo = makeStation('s-duzo', { nnBoard: pieciOdplywow });
    expect(requiredStationWidth(stacjaDuzo)).toBeGreaterThan(requiredStationWidth(stacjaMalo));

    const c = compose(stacjaDuzo);
    expect(noCompositionSymbolOverlaps(c)).toBe(true);
    expect(allCompositionSymbolsOnGrid(c)).toBe(true);
    expect(c.symbols.filter((s) => s.symbolId === 'nnBreaker')).toHaveLength(5);
  });

  it('stacja BEZ odpływów: rezerwacja szerokości NIEZMIENIONA względem stanu przed kartą (substrat)', () => {
    const stacjaBezNnBoard = makeStation('s-a');
    const stacjaJawniePusta = makeStation('s-b', { nnBoard: [] });
    expect(requiredStationWidth(stacjaBezNnBoard)).toBe(requiredStationWidth(stacjaJawniePusta));
  });
});

describe('T3 (SLD-nN-TOPOLOGIA §„layout i wygląd") — tabliczka TR przy symbolu T1 (TR2W-BEZ-POLA)', () => {
  const odplywy: readonly SldNnBoardSection[] = [
    { sectionId: 'sec1', busRef: 'bus/nn', incomer: null, feeders: [feeder({ branchRef: 'brc/1', apparatusKind: 'MCB', apparatusRef: 'brc/1', apparatusLabel: 'MCB B16', destinationKind: 'load', destinationLabel: 'Odbiór A' })] },
  ];

  it('stacja BEZ pola SN (implicit) z danymi strukturalnymi nN: tabliczka Sn/przekładnia/grupa/uk% narysowana', () => {
    const stacja = makeStation('s-tr', {
      snBays: [],
      hasTransformer: true,
      nnBoard: odplywy,
      transformerUnits: [
        {
          ref: 'tr/1',
          hvBusRef: null,
          lvBusRef: 'bus/nn',
          hvVoltageKv: null,
          designation: 'T1',
          snMva: 0.63,
          uhvKv: 15,
          ulvKv: 0.4,
          ukPercent: 5,
          vectorGroup: 'Dyn11',
        },
      ],
    });
    const c = compose(stacja);
    const nameplate = c.labels.apparatus.find((l) => l.ownerRef === 'tr/1#nameplate');
    expect(nameplate).toBeDefined();
    expect(nameplate?.text).toBe('T1 · Dyn11 · 0,63 MVA · 15/0,4 kV · uk 5%');
    expect(noCompositionSymbolOverlaps(c)).toBe(true);
    expect(allCompositionSymbolsOnGrid(c)).toBe(true);
  });

  it('stacja BEZ pola SN, BEZ danych strukturalnych nN (substrat): zero tabliczki mimo pełnych danych ENM, rezerwacja NIEZMIENIONA', () => {
    const pelneDaneTabliczki: StationMeasureInput = makeStation('s-tr-substrat', {
      snBays: [],
      hasTransformer: true,
      transformerUnits: [
        { ref: 'tr/1', hvBusRef: null, lvBusRef: 'bus/nn', hvVoltageKv: null, designation: 'T1', snMva: 0.63, uhvKv: 15, ulvKv: 0.4, ukPercent: 5, vectorGroup: 'Dyn11' },
      ],
    });
    const c = compose(pelneDaneTabliczki);
    // Bramka `stationDrawsImplicitTrNameplate`: `false` (brak `nnBoard`) ⇒
    // ZERO wiersza tabliczki mimo że ENM niesie pełne dane — dokładnie
    // zachowanie substratu referencyjnego (54/54 stacji tej klasy).
    expect(c.labels.apparatus.some((l) => l.ownerRef.includes('#nameplate'))).toBe(false);

    const brakDanychTabliczki: StationMeasureInput = makeStation('s-tr-substrat', {
      snBays: [],
      hasTransformer: true,
      transformerUnits: [
        { ref: 'tr/1', hvBusRef: null, lvBusRef: 'bus/nn', hvVoltageKv: null, designation: null, snMva: null, uhvKv: null, ulvKv: null, ukPercent: null, vectorGroup: null },
      ],
    });
    // Rezerwacja szerokości bloku identyczna niezależnie od tego, czy ENM
    // niesie dane tabliczki, dopóki bramka nnBoard jest wyłączona — dowód
    // „substrat bajtowo nietknięty" na poziomie measure, nie tylko compose.
    expect(requiredStationWidth(pelneDaneTabliczki)).toBe(requiredStationWidth(brakDanychTabliczki));
  });
});
