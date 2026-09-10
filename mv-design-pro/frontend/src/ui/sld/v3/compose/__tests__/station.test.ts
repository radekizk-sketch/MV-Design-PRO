/**
 * SLD V3 F5a — wyrocznie kompozycji stacji z prymitywów (SLD_CAD_SPEC_V3 §3,
 * §11 rozszerzenie F5). Syntetyki budowane na PRAWDZIWYM potoku
 * measure → bands → columns (F2/F3/r7b), żeby `column`/`busAxisY`/
 * `blockTopY` odpowiadały rzeczywistej geometrii wcześniejszych kroków.
 */
import { describe, expect, it } from 'vitest';

import { GRID } from '../../core/grid';
import { SYMBOL_DEFS } from '../../symbols/defs';
import { at } from '../../../../../test/arrayAt';
import { FIELD_ROLE, ALL_FIELD_ROLES, type FieldRole } from '../../../v2/domain/apparatusContracts';
import type { BayPrimaryDeviceView, MiniBlockBayDescriptor } from '../../../v2/renderer/MiniBlockRmuRenderer';
import {
  bayColumnFootprint,
  bayColumnRequiredWidth,
  requiredStationWidth,
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
import {
  bayApparatusPlanFootprint,
  planApparatusSymbolIds,
  planBayApparatus,
} from '../apparatusSequence';

/** F10.1: oczekiwana KOLEJNOŚĆ instancji kompozycji = tor główny, potem
 *  aparaty boczne (buildBayStack dokleja laterale na końcu). */
function planOrderedSymbols(role: FieldRole): readonly string[] {
  const plan = planApparatusSymbolIds([...apparatusSymbolsForRole(role)]);
  return [...plan.mainPath, ...plan.laterals.map((l) => l.symbolId)];
}
import {
  PROTECTION_ANNOTATION_DIAMETER,
  bayHasProtectionAnnotation,
  ctCoresLabelText,
  ctRatingLabelText,
  protectionAnnotationColumnWidth,
  vtMountingAnnotationLabelText,
  vtMountingAnnotationsWidth,
  vtMountingLabelText,
} from '../protectionMarking';

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
    it(`rola ${role}, bez primary_devices (konwencja): bayApparatusPlanFootprint(plan) === bayColumnFootprint`, () => {
      // F10.1 (spec §18.1/§18.2): tożsamość parytetu ZREDEFINIOWANA — gabaryt
      // kolumny = plan „tor główny + aparaty boczne" (ES/VT/SA odgałęziają
      // się bocznie, nie stoją w osi), NIE płaski stos całej sekwencji.
      // Dla ról BEZ aparatów bocznych obie definicje są tożsame (asercja
      // niżej to dokumentuje).
      const plan = planBayApparatus(makeBay(role, 0));
      const fromPlan = bayApparatusPlanFootprint(plan);
      const fromMeasure = bayColumnFootprint(makeBay(role, 0));
      expect({ width: fromPlan.width, height: fromPlan.height }).toEqual(fromMeasure);
      if (plan.laterals.length === 0) {
        expect(fromMeasure).toEqual(stackFootprint(apparatusSymbolsForRole(role)));
      } else {
        // Tor główny bez lateralu jest WĘŻSZY niż pełny gabaryt (rozszerzenie
        // boczne > 0) — dowód, że podział realnie działa dla tej roli.
        expect(fromPlan.lateralExtension).toBeGreaterThan(0);
        expect(fromPlan.mainStack.width).toBeLessThan(fromPlan.width);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// (a2) FIX-3 (recenzja F5a, F10.2): stos aparatów FLUSH-LEFT WZGLĘDEM
// `bx + leftReserve` + identyfikatory per-aparat (Q/QE/T) PO LEWEJ stosu +
// oznaczenie FUNKCYJNE pola (sidecar) PO PRAWEJ — bbox(stos ∪ identyfikatory
// ∪ oznaczenie) musi zostać WEWNĄTRZ `bayColumnRequiredWidth` (measure.ts),
// dla KAŻDEJ roli (poprzedni kod centrował stos w CAŁEJ rezerwacji, więc
// oznacznik ≥2-znakowy wystawał poza pole — patrz nagłówek `station.ts`).
// F10.2: `bay.designation` PRZESTAŁ wpływać na sidecar (oznaczenie jest
// czystą funkcją `fieldRole`) — parametryzacja po długości designation
// usunięta (nie ma już czego testować tą osią), test sprawdza WSZYSTKIE
// `ALL_FIELD_ROLES` raz.
// ---------------------------------------------------------------------------

describe('V3 compose/station — FIX-3/F10.2: bbox(stos + identyfikatory + oznaczenie funkcyjne) ⊆ rezerwacja pola', () => {
  for (const role of ALL_FIELD_ROLES) {
    it(`rola ${role}: bbox w rezerwacji (bayColumnRequiredWidth)`, () => {
      const bay = makeBay(role, 0);
      const station = makeStation(`fix3-${role}`, [bay]);
      const composeInput = buildComposeInput(station);
      const composition = composeStation(composeInput);

      const reservedWidth = bayColumnRequiredWidth(station.snBays, 0, station.bayDirectionCaptions);
      const bx = composeInput.column.x + GRID; // blockLeftX (FIX-4): jedno pole = cały blok.

      const symbolMinX = Math.min(...composition.symbols.map((s) => s.x));
      const symbolMaxX = Math.max(...composition.symbols.map((s) => s.x + SYMBOL_DEFS[s.symbolId].width));

      // F10.2: dokładnie JEDNA etykieta oznaczenia funkcyjnego pola
      // (`ownerKind:'field-role'`) — ZAWSZE obecna (funkcja NIGDY nie zwraca
      // pustego stringa).
      const fieldRoleLabels = composition.labels.apparatus.filter((l) => l.ownerKind === 'field-role');
      expect(fieldRoleLabels).toHaveLength(1);
      expect(fieldRoleLabels[0].ownerRef).toBe(`${bay.bayRef}#field-role`);

      const resolved = resolveLabels({ simpleAnchored: composition.labels.apparatus });

      const bboxMinX = Math.min(symbolMinX, ...resolved.map((l) => l.rect.x));
      const bboxMaxX = Math.max(symbolMaxX, ...resolved.map((l) => l.rect.x + l.rect.width));

      expect(bboxMinX).toBeGreaterThanOrEqual(bx);
      expect(bboxMaxX).toBeLessThanOrEqual(bx + reservedWidth);
    });
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
// (d3) W2 (RECENZJA_L2 §3/§4; GS-4b / audyt Z2): DER wg REALNEJ strony
// przyłączenia — `'sn'` ⇒ pole źródłowe od szyny SN; `'nn'`/`'unknown'`/brak
// ⇒ rząd nN. Przed W2 KAŻDE źródło szło za TR (`nnBusPoint`) — kłamstwo
// topologiczne dla źródła na SN (luka lustrzana Z2). Źródło syntetyczne SN =
// generator z `connectionSide==='sn'` (klasyfikacja adaptera z `bus_ref`→
// `voltage_kv` > 0,5 kV — jedyny pisarz, GS-4 przybija ją na fixturze).
// ---------------------------------------------------------------------------

describe('V3 compose/station — W2 (GS-4b/Z2): DER wg strony przyłączenia', () => {
  const snBays = [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_TRANSFORMER, 1)];

  it('wariant A (nn): connectionSide=nn ⇒ rząd nN (der-row-bus/trunk na szynie nN), ZERO pola źródłowego SN; ciągłość TR→szyna→odczepy', () => {
    const station = makeStation('w2-nn', snBays, {
      nnVoltageKv: 0.4,
      aggregatedLvLoad: { pMw: 0.3, qMvar: 0.1, count: 3 },
      derSources: [{ id: 'gen-nn-1', kind: 'pv', ratedPower: 0.5, connectionSide: 'nn' }],
    });
    const composition = composeStation(buildComposeInput(station, { hasLvSection: true }));

    // Rząd nN obecny (źródło ZA TR, na szynie nN).
    expect(composition.segments.some((s) => s.ownerRef === 'w2-nn#der-row-bus')).toBe(true);
    expect(composition.segments.some((s) => s.ownerRef === 'w2-nn#der-row-trunk')).toBe(true);
    // Szyna nN obecna + odczep odbioru (strzałka odbioru na szynie nN).
    expect(composition.segments.some((s) => s.ownerRef === 'w2-nn#lv-bus')).toBe(true);
    expect(composition.segments.some((s) => s.ownerRef === 'w2-nn#lv-load-drop')).toBe(true);
    expect(composition.symbols.some((s) => s.symbolId === 'loadArrow')).toBe(true);
    // ZERO pola źródłowego SN dla tego źródła.
    expect(composition.segments.some((s) => s.ownerRef.endsWith('#sn-source-descent'))).toBe(false);
    // Ciągłość toru (odczepy kończą się na porcie/szynie).
    expect(internalSegmentsEndAtPortsOrBus(composition)).toBe(true);
    expect(allCompositionSymbolsOnGrid(composition)).toBe(true);
    expect(noCompositionSymbolOverlaps(composition)).toBe(true);
  });

  it('wariant B (sn): connectionSide=sn ⇒ POLE ŹRÓDŁOWE od szyny SN (sn-source-descent), ZERO renderu za TR (asercja negatywna)', () => {
    const input = buildComposeInput(
      makeStation('w2-sn', snBays, {
        nnVoltageKv: 0.4,
        derSources: [{ id: 'gen-sn-1', kind: 'pv', ratedPower: 0.5, connectionSide: 'sn' }],
      }),
      { hasLvSection: true },
    );
    const composition = composeStation(input);

    // Pole źródłowe SN: odczep od szyny SN do portu AC symbolu źródła.
    const descent = composition.segments.find((s) => s.ownerRef === 'gen-sn-1#sn-source-descent');
    expect(descent).toBeDefined();
    // Kotwica GÓRNA odczepu na szynie SN (busAxisY), nie na szynie nN.
    expect(descent!.points[0].y).toBe(input.busAxisY);
    // Symbol źródła NAD blokiem (blockTopY), przyłączony od szyny SN — NIE za
    // TR (rząd nN jest niżej, `nnBusPoint.y + clearance`).
    const derSymbol = composition.symbols.find((s) => s.sourceRef === 'gen-sn-1');
    expect(derSymbol).toBeDefined();
    expect(derSymbol!.symbolId).toBe('derPv');
    expect(derSymbol!.y).toBe(input.blockTopY);
    // Dolny koniec odczepu = port AC symbolu (ciągłość elektryczna).
    expect(descent!.points[1].y).toBe(derSymbol!.ports.ac!.y);
    expect(descent!.points[1].x).toBe(derSymbol!.ports.ac!.x);
    // ASERCJA NEGATYWNA (Z2): źródło na SN NIE jest rysowane za TR — brak
    // rzędu nN dla tej stacji (nnDer puste).
    expect(composition.segments.some((s) => s.ownerRef === 'w2-sn#der-row-bus')).toBe(false);
    expect(composition.segments.some((s) => s.ownerRef === 'w2-sn#der-row-trunk')).toBe(false);
    // Etykieta rodzaj+moc obecna.
    expect(composition.labels.der.map((l) => l.text)).toContain('PV 500 kW');
    // Wyrocznie: siatka, brak nachodzeń, ciągłość (odczep kończy się na szynie
    // SN i porcie AC).
    expect(allCompositionSymbolsOnGrid(composition)).toBe(true);
    expect(noCompositionSymbolOverlaps(composition)).toBe(true);
    expect(internalSegmentsEndAtPortsOrBus(composition)).toBe(true);
    // W2c (POLECENIE_DER_SN_TOPOLOGIA_2026-07 §0): źródło SN BEZ zmaterializowanego
    // toru (`chain` nieobecny — stary wariant W2 / generator synchroniczny WPROST
    // na SN, przypadek 4) = tor NIEPEŁNY. Placeholder na szynie SN pozostaje jako
    // UCZCIWA DEGRADACJA, ale niesie JAWNY stopNote `der.sn.torNiepelny` (nie
    // ciche uproszczenie). Pełny tor (kabel→TR blokowy→szyna nN producenta→źródło)
    // ćwiczą testy W2c z `chain` (fixtury kanonu 2/3/5/6/7/8).
    expect(composition.missingData).toEqual(['der.sn.torNiepelny:gen-sn-1']);
  });

  it('wariant mieszany (nn+sn): nn→rząd nN, sn→pole źródłowe SN — rozdzielone, oba widoczne', () => {
    const composition = composeStation(
      buildComposeInput(
        makeStation('w2-mix', snBays, {
          nnVoltageKv: 0.4,
          derSources: [
            { id: 'gen-nn-a', kind: 'bess', ratedPower: 0.5, connectionSide: 'nn' },
            { id: 'gen-sn-b', kind: 'pv', ratedPower: 0.5, connectionSide: 'sn' },
          ],
        }),
        { hasLvSection: true },
      ),
    );
    expect(composition.segments.some((s) => s.ownerRef === 'w2-mix#der-row-bus')).toBe(true);
    expect(composition.segments.some((s) => s.ownerRef === 'gen-sn-b#sn-source-descent')).toBe(true);
    // Źródło nN NIE dostaje pola źródłowego SN; źródło SN NIE trafia do rzędu nN.
    expect(composition.segments.some((s) => s.ownerRef === 'gen-nn-a#sn-source-descent')).toBe(false);
    expect(composition.symbols.filter((s) => s.symbolId.startsWith('der'))).toHaveLength(2);
    expect(internalSegmentsEndAtPortsOrBus(composition)).toBe(true);
    expect(noCompositionSymbolOverlaps(composition)).toBe(true);
  });

  it('§0 karty: connectionSide=unknown przy stacji z TR ⇒ rząd nN (konwencja F9.4) + jawne oznaczenie meta station.der.sideAssumedNn', () => {
    const composition = composeStation(
      buildComposeInput(
        makeStation('w2-unk', snBays, {
          nnVoltageKv: 0.4,
          derSources: [{ id: 'gen-unk', kind: 'pv', ratedPower: 0.5, connectionSide: 'unknown' }],
        }),
        { hasLvSection: true },
      ),
    );
    expect(composition.segments.some((s) => s.ownerRef === 'w2-unk#der-row-bus')).toBe(true);
    expect(composition.segments.some((s) => s.ownerRef.endsWith('#sn-source-descent'))).toBe(false);
    expect(composition.missingData).toContain('station.der.sideAssumedNn');
  });

  it('§11/§10: stacja bez sekcji nN ⇒ zero szyny nN ORAZ zero sugestii „Szyna nN" w pasmie nazw (zakaz opisu niewidocznej topologii)', () => {
    const lineOnly = makeStation('w2-no-nn', [makeBay(FIELD_ROLE.RMU_LINE, 0), makeBay(FIELD_ROLE.RMU_LINE, 1)]);
    const composition = composeStation(buildComposeInput(lineOnly, { hasLvSection: true }));
    expect(composition.segments.some((s) => s.ownerRef.endsWith('#lv-bus'))).toBe(false);
    // Pasmo nazw NIE wspomina szyny nN, gdy geometrii nN nie ma.
    const bandText = composition.labels.stationName.rows.map((r) => r.text).join(' | ');
    expect(bandText).not.toContain('Szyna nN');
  });

  it('W2 determinizm: wariant B compose 2× ⇒ identyczne segmenty/symbole (to samo wejście = ten sam wynik)', () => {
    const input = buildComposeInput(
      makeStation('w2-det', snBays, {
        nnVoltageKv: 0.4,
        derSources: [{ id: 'gen-sn-1', kind: 'pv', ratedPower: 0.5, connectionSide: 'sn' }],
      }),
      { hasLvSection: true },
    );
    const a = composeStation(input);
    const b = composeStation(input);
    expect(JSON.stringify(a.segments)).toBe(JSON.stringify(b.segments));
    expect(JSON.stringify(a.symbols)).toBe(JSON.stringify(b.symbols));
    expect(JSON.stringify(a.labels.der)).toBe(JSON.stringify(b.labels.der));
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

    // F10.1 (spec §18.1, DEC-1): sekwencja TORU GŁÓWNEGO wg placement
    // (ES odgałęzia się BOCZNIE — buildBayStack dokleja go NA KOŃCU listy
    // instancji, poza osią); parowanie deviceRef/switchState zachowane.
    expect(composition.symbols.map((s) => s.symbolId)).toEqual([
      'disconnector', 'breaker', 'currentTransformer', 'disconnector', 'cableHead', 'earthSwitch',
    ]);
    expect(composition.symbols.every((s) => s.apparatusSource === 'dane')).toBe(true);
    expect(composition.symbols.map((s) => s.deviceRef)).toEqual([
      'ds-bus', 'cb-1', 'ct-1', 'ds-line', 'head-1', 'es-1',
    ]);
    // Stan łącznika PER APARAT (nie per-kind agregat konwencji) — dwa
    // `disconnector` w tym łańcuchu mają RÓŻNE stany (`ds-bus` zamknięty,
    // `ds-line` otwarty), co dowodzi, że stan pochodzi z `switchState`
    // KAŻDEGO urządzenia, nie z jednego agregatu `bay.dsState`.
    expect(composition.symbols[0].state).toBe('closed');
    expect(composition.symbols[3].state).toBe('open');
    // F10.1 (spec §18.1 a/c): ES POZA osią toru + odcinek odgałęzienia od
    // węzła toru (port S DS_liniowego) do portu N uziemnika.
    const es = composition.symbols.find((s) => s.symbolId === 'earthSwitch')!;
    const axisSymbols = composition.symbols.filter((s) => s.symbolId !== 'earthSwitch');
    const axisX = axisSymbols[0].x + SYMBOL_DEFS[axisSymbols[0].symbolId].width / 2;
    expect(es.x + SYMBOL_DEFS.earthSwitch.width / 2).not.toBe(axisX);
    const branch = composition.segments.find((seg) => seg.ownerRef.includes('#lateral-earthSwitch'));
    expect(branch).toBeTruthy();
    expect(branch!.points[0].x).toBe(axisX);
    expect(branch!.points.every((pt) => pt.y === branch!.points[0].y)).toBe(true);
  });

  it('DER-kindy w primary_devices są odfiltrowane (nie są aparatem pola, §12.1) — fallback konwencji, gdy WSZYSTKIE odfiltrowane', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: [{ deviceRef: 'pv-1', kind: 'GENERATOR_PV', placement: 'OFF_PATH' }],
    });
    const station = makeStation('der-only-devices', [bay]);
    const composition = composeStation(buildComposeInput(station));

    // Brak aparatów mapowalnych ⇒ fallback konwencji (§12.4) dla LINE_IN.
    expect(composition.symbols.every((s) => s.apparatusSource === 'konwencja')).toBe(true);
    // F10.1: kolejność instancji = tor główny, potem aparaty boczne.
    expect(composition.symbols.map((s) => s.symbolId)).toEqual(planOrderedSymbols(FIELD_ROLE.LINE_IN));
  });

  it('LOAD_SWITCH mapuje się na loadBreakSwitch — dedykowany glif rozłącznika (recenzja NO-GO 2026-07-17 pkt 5, spec §12.5; dawna aproksymacja →disconnector SKASOWANA)', () => {
    const bay = makeBay(FIELD_ROLE.COUPLER, 0, {
      primaryDevices: [{ deviceRef: 'ls-1', kind: 'LOAD_SWITCH', placement: 'UPSTREAM' }],
    });
    const station = makeStation('load-switch', [bay]);
    const composition = composeStation(buildComposeInput(station));
    expect(composition.symbols.map((s) => s.symbolId)).toEqual(['loadBreakSwitch']);
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

    // F10.1 (spec §18.2): ES i SA są aparatami BOCZNYMI — tor główny
    // DS→CB→CT→DS→głowica, laterale doklejone na końcu w kolejności
    // sekwencji (ES przed SA — oba kotwiczą za DS_liniowym, siedzą OBOK
    // siebie na wspólnej kotwicy).
    expect(composition.symbols.map((s) => s.symbolId)).toEqual([
      'disconnector', 'breaker', 'currentTransformer', 'disconnector', 'cableHead', 'earthSwitch', 'surgeArrester',
    ]);
    expect(composition.symbols.every((s) => s.apparatusSource === 'dane')).toBe(true);
    expect(composition.symbols.map((s) => s.deviceRef)).toContain('sa-1');
    // Wspólna kotwica (§18.1): oba laterale na TEJ SAMEJ wysokości (port S
    // DS_liniowego), SA na prawo od ES (kolejne `LATERAL_BRANCH_GAP+width`).
    const es = composition.symbols.find((s) => s.symbolId === 'earthSwitch')!;
    const sa = composition.symbols.find((s) => s.symbolId === 'surgeArrester')!;
    expect(sa.y).toBe(es.y);
    expect(sa.x).toBeGreaterThan(es.x);
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
      // F10.1 (DEC-1): kolejność instancji = tor główny + aparaty boczne.
      expect(composition.symbols.map((s) => s.symbolId)).toEqual(planOrderedSymbols(role));
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

  // INTENCJA RULINGU V12K-031 zachowana dla PÓL WYŁĄCZNIKOWYCH: wejście/
  // wyjście/odgałęzienie tej samej technologii są fizycznie identyczne i
  // dzielą sygnaturę świadomie. KOREKTA (recenzja NO-GO właściciela
  // 2026-07-17 pkt 5, spec §12.5): RMU_LINE to INNA technologia rozdzielnicy
  // (rozłącznik+ES+głowica) — własna klasa `rmu_line`, WŁASNA sygnatura;
  // pomiar recenzji: wspólna sylwetka fabrykowała CB+CT w stacjach 630 kVA.
  it('RULING V12K-031 + korekta pkt 5: LINE_IN/LINE_OUT/LINE_BRANCH/GPZ_LINE_BAY = jedna klasa `line` (wspólna sygnatura świadomie); RMU_LINE = osobna klasa `rmu_line` z szablonem rozłącznikowym', () => {
    const breakerLineRoles: FieldRole[] = [
      FIELD_ROLE.LINE_IN, FIELD_ROLE.LINE_OUT, FIELD_ROLE.LINE_BRANCH, FIELD_ROLE.GPZ_LINE_BAY,
    ];
    for (const role of breakerLineRoles) expect(fieldSilhouetteClass(role)).toBe('line');
    const signatures = new Set(breakerLineRoles.map((role) => [...apparatusSymbolsForRole(role)].sort().join(',')));
    expect(signatures.size).toBe(1);

    expect(fieldSilhouetteClass(FIELD_ROLE.RMU_LINE)).toBe('rmu_line');
    const rmuSig = [...apparatusSymbolsForRole(FIELD_ROLE.RMU_LINE)].sort().join(',');
    expect(rmuSig).toBe('cableHead,earthSwitch,loadBreakSwitch');
    expect(signatures.has(rmuSig)).toBe(false);
  });

  it('RMU_TRANSFORMER = osobna klasa `rmu_transformer` (pkt 5/6 recenzji: rozłącznik bezpiecznikowy + ES + TR); klasy RMU_LINE/RMU_TRANSFORMER/COUPLER parami rozróżnialne sygnaturą', () => {
    expect(fieldSilhouetteClass(FIELD_ROLE.RMU_TRANSFORMER)).toBe('rmu_transformer');
    expect(fieldSilhouetteClass(FIELD_ROLE.TRANSFORMER)).toBe('transformer');
    // pkt 6 recenzji: pole TR RMU MUSI nieść uziemnik.
    expect(apparatusSymbolsForRole(FIELD_ROLE.RMU_TRANSFORMER)).toContain('earthSwitch');
    const sigLine = [...apparatusSymbolsForRole(FIELD_ROLE.RMU_LINE)].sort().join(',');
    const sigTr = [...apparatusSymbolsForRole(FIELD_ROLE.RMU_TRANSFORMER)].sort().join(',');
    const sigCoupler = [...apparatusSymbolsForRole(FIELD_ROLE.COUPLER)].sort().join(',');
    expect(new Set([sigLine, sigTr, sigCoupler]).size).toBe(3);
  });

  it('ALL_FIELD_ROLES niesie WSZYSTKIE 12 ról zdefiniowanych (sanity — wyrocznia globalna musi ćwiczyć cały zbiór, nie podzbiór wybrany ręcznie)', () => {
    expect(ALL_FIELD_ROLES.length).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// F9.9 (SLD_CAD_SPEC_V3 §17) — oznaczenie zabezpieczeń ANSI/IEEE C37.2.
// Syntetyczny stos „dane" (§12.1) z primaryDevices niosącymi deviceRef/
// linkedRef — fixtura referencyjna `sldSubstrate52s` NIE ćwiczy §17.2 (0 Bay[]
// w ogóle, patrz `buildScene.test.ts`), więc dowód pozytywny jest TU,
// syntetycznie, wzorzec F9.2/F9.3 (fixtura nie ćwiczy „prymat danych" →
// syntetyk w testach compose).
// ---------------------------------------------------------------------------

function makeLineBayPrimaryDevices(): readonly BayPrimaryDeviceView[] {
  return [
    { kind: 'DS', placement: 'UPSTREAM', deviceRef: 'ds-bus' },
    { kind: 'CB', placement: 'MIDSTREAM', deviceRef: 'cb-1' },
    { kind: 'CT', placement: 'MIDSTREAM', deviceRef: 'ct-1', linkedRef: 'meas-metering-1' },
    { kind: 'DS', placement: 'MIDSTREAM', deviceRef: 'ds-line' },
    { kind: 'ES', placement: 'MIDSTREAM', deviceRef: 'es-1' },
    { kind: 'CABLE_HEAD', placement: 'DOWNSTREAM', deviceRef: 'head-1' },
  ];
}

describe('V3 compose/station — F9.9 §17: oznaczenie zabezpieczeń (protection_marking_probe, spec §17.5)', () => {
  it('(a) brak danych = brak oznaczenia: pole BEZ protectionMarking/meteringMeasurementRef ⇒ ZERO okręgów/torów wyzwalania', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, { primaryDevices: makeLineBayPrimaryDevices() });
    const station = makeStation('no-protection', [bay]);
    const composition = composeStation(buildComposeInput(station));

    expect(composition.protectionSymbols).toHaveLength(0);
    expect(composition.protectionSegments).toHaveLength(0);
    expect(composition.missingData).not.toContain('bay.protection.trip_link_unresolved');
  });

  it('(b/c) dane kompletne (breaker_ref + ct_ref rozwiązywalne w stosie): okrąg z kodami (prefiks, bez sortowania) + tor wyzwalania do WŁAŚCIWEGO wyłącznika + „52" + „M" na CT', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['51N', '50/51', '87T'], breakerRef: 'cb-1', ctRef: 'ct-1' },
      meteringMeasurementRef: 'meas-metering-1',
    });
    const station = makeStation('protection-ok', [bay]);
    const composition = composeStation(buildComposeInput(station));

    // Okrąg przekaźnika: DOKŁADNIE 1, kody = DWA PIERWSZE z listy źródłowej,
    // W TEJ SAMEJ kolejności (prefiks, zero sortowania — §17.3).
    const relays = composition.protectionSymbols.filter((s) => s.symbolId === 'protectionRelay');
    expect(relays).toHaveLength(1);
    expect(relays[0].protectionCodes).toEqual(['51N', '50/51']);
    expect(relays[0].bayRef).toBe(bay.bayRef);

    // Miernik: DOKŁADNIE 1 okrąg „M" (kotwica CT przez linked_ref).
    const meters = composition.protectionSymbols.filter((s) => s.symbolId === 'meter');
    expect(meters).toHaveLength(1);

    // Tor wyzwalania: DOKŁADNIE 1 linia przerywana, kończąca się na
    // REJESTROWANYM porcie WŁAŚCIWEGO wyłącznika (cb-1, deviceRef match) i na
    // REJESTROWANYM porcie okręgu (zero linii „do domyślnego aparatu", §17.2).
    expect(composition.protectionSegments).toHaveLength(1);
    const tripLine = composition.protectionSegments[0];
    const breakerInstance = composition.symbols.find((s) => s.deviceRef === 'cb-1');
    expect(breakerInstance).toBeDefined();
    const breakerTopPort = { x: breakerInstance!.x + 8, y: breakerInstance!.y }; // 'top' port (dir N), offset (8,0)
    expect(tripLine.points[0]).toEqual(breakerTopPort);
    const relaySymbol = composition.protectionSymbols.find((s) => s.symbolId === 'protectionRelay')!;
    const relayLinkPort = { x: relaySymbol.x, y: relaySymbol.y + 8 }; // 'link' port (dir W), offset (0,8)
    expect(tripLine.points[tripLine.points.length - 1]).toEqual(relayLinkPort);

    expect(composition.missingData).not.toContain('bay.protection.trip_link_unresolved');
    expect(composition.missingData).not.toContain('bay.protection.meter_anchor_unresolved');

    // Etykieta „52" (numer urządzenia ANSI/IEEE C37.2, notacja — nie
    // kodename) + R-2: 3 kody (>2) ⇒ pełna lista w etykiecie slotu pola.
    const deviceNumber = composition.labels.protection.filter((l) => l.ownerRef.endsWith('#device-number'));
    expect(deviceNumber).toHaveLength(1);
    expect(deviceNumber[0].text).toBe('52');
    const fullList = composition.labels.protection.filter((l) => l.ownerRef.endsWith('#protection-codes-full'));
    expect(fullList).toHaveLength(1);
    expect(fullList[0].text).toBe('51N · 50/51 · 87T'); // kolejność ŹRÓDŁOWA (zero sortowania).

    // Zero kolizji z konstrukcji: okrąg/miernik na siatce, wewnątrz kolumny
    // adnotacji zarezerwowanej przez `bayColumnRequiredWidth` (measure.ts).
    for (const sym of composition.protectionSymbols) {
      expect(sym.x % GRID).toBe(0);
      expect(sym.y % GRID).toBe(0);
    }

    // Regresja (znalezisko harnessu wizualnego nadzorcy, `render-v3-
    // protection.tsx`): przekaźnik i miernik kotwiczą na TYM SAMYM CT (ct-1)
    // — bez odsunięcia lądowały DOKŁADNIE na sobie. Okręgi NIE MOGĄ się
    // nakładać (ta sama reguła co `noCompositionSymbolOverlaps`, tu policzona
    // wprost bo `protectionSymbols` jest POZA `composition.symbols`).
    const relay = relays[0];
    const meter = meters[0];
    const overlapsX = relay.x < meter.x + PROTECTION_ANNOTATION_DIAMETER && meter.x < relay.x + PROTECTION_ANNOTATION_DIAMETER;
    const overlapsY = relay.y < meter.y + PROTECTION_ANNOTATION_DIAMETER && meter.y < relay.y + PROTECTION_ANNOTATION_DIAMETER;
    expect(overlapsX && overlapsY).toBe(false);
  });

  it('(§17.2 zero zgadywania) breaker_ref NIEROZWIĄZYWALNY w stosie (dane niespójne) ⇒ okrąg BEZ toru wyzwalania + missingData `bay.protection.trip_link_unresolved` (NIGDY linia do domyślnego aparatu)', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['50/51'], breakerRef: 'cb-nieistniejacy', ctRef: 'ct-1' },
    });
    const station = makeStation('protection-unresolved', [bay]);
    const composition = composeStation(buildComposeInput(station));

    const relays = composition.protectionSymbols.filter((s) => s.symbolId === 'protectionRelay');
    expect(relays).toHaveLength(1); // kody SĄ — okrąg SIĘ rysuje (§17.2: dane są, tylko link złamany).
    expect(composition.protectionSegments).toHaveLength(0); // ZERO linii wyzwalania.
    expect(composition.missingData).toContain('bay.protection.trip_link_unresolved');
    expect(composition.labels.protection).toHaveLength(0); // „52" NIE rysowany bez rozwiązanego celu.
  });

  it('(§17.2 zero zgadywania) konwencja (§12.4, brak primary_devices) z protectionMarking: okrąg BEZ toru (brak device_ref w stosie ⇒ breaker_ref NIGDY nie może się dopasować)', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      protectionMarking: { codes: ['50/51'], breakerRef: 'cb-1' },
    });
    const station = makeStation('protection-konwencja', [bay]);
    const composition = composeStation(buildComposeInput(station));

    expect(composition.protectionSymbols.filter((s) => s.symbolId === 'protectionRelay')).toHaveLength(1);
    expect(composition.protectionSegments).toHaveLength(0);
    expect(composition.missingData).toContain('bay.protection.trip_link_unresolved');
  });

  it('(e) miernik BEZ przekaźnika: pole z meteringMeasurementRef, ale bez protection_codes ⇒ TYLKO okrąg „M", ZERO okręgu przekaźnika/toru', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      meteringMeasurementRef: 'meas-metering-1',
    });
    const station = makeStation('meter-only', [bay]);
    const composition = composeStation(buildComposeInput(station));

    expect(composition.protectionSymbols.filter((s) => s.symbolId === 'protectionRelay')).toHaveLength(0);
    expect(composition.protectionSymbols.filter((s) => s.symbolId === 'meter')).toHaveLength(1);
    expect(composition.protectionSegments).toHaveLength(0);
  });

  it('miernik wskazany ale nierozwiązywalny (linked_ref nie pasuje do żadnego CT/VT stosu) ⇒ ZERO okręgu „M" + missingData `bay.protection.meter_anchor_unresolved`', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      meteringMeasurementRef: 'meas-nieistniejacy',
    });
    const station = makeStation('meter-unresolved', [bay]);
    const composition = composeStation(buildComposeInput(station));

    expect(composition.protectionSymbols.filter((s) => s.symbolId === 'meter')).toHaveLength(0);
    expect(composition.missingData).toContain('bay.protection.meter_anchor_unresolved');
  });

  it('kolumna adnotacji rezerwowana TYLKO dla pól z danymi (§17.3) — pole BEZ danych ma węższą rezerwację niż to samo pole Z danymi', () => {
    const bayWithout = makeBay(FIELD_ROLE.LINE_IN, 0, { primaryDevices: makeLineBayPrimaryDevices() });
    const bayWith = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['50/51'], breakerRef: 'cb-1' },
    });
    const widthWithout = bayColumnRequiredWidth([bayWithout], 0, undefined);
    const widthWith = bayColumnRequiredWidth([bayWith], 0, undefined);
    expect(widthWith).toBeGreaterThan(widthWithout);
  });

  // -------------------------------------------------------------------------
  // B-1 (recenzja F9.9, spec §17.4): annotationDetail='circle-only' (L1).
  // -------------------------------------------------------------------------

  it('B-1 (§17.4 L1, circle-only): SAM okrąg przekaźnika BEZ kodów — zero toru wyzwalania, zero „52", zero „M", zero pełnej listy, zero missingData §17', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['51N', '50/51', '87T'], breakerRef: 'cb-1', ctRef: 'ct-1' },
      meteringMeasurementRef: 'meas-metering-1',
    });
    const station = makeStation('protection-l1', [bay]);
    const composition = composeStation({ ...buildComposeInput(station), annotationDetail: 'circle-only' });

    const relays = composition.protectionSymbols.filter((s) => s.symbolId === 'protectionRelay');
    expect(relays).toHaveLength(1); // okrąg OBECNY (dowód pozytywny §17.4 L1).
    expect(relays[0].protectionCodes).toBeUndefined(); // BEZ kodów.
    expect(composition.protectionSymbols.filter((s) => s.symbolId === 'meter')).toHaveLength(0);
    expect(composition.protectionSegments).toHaveLength(0);
    expect(composition.labels.protection).toHaveLength(0);
    expect(composition.missingData).not.toContain('bay.protection.trip_link_unresolved');
    expect(composition.missingData).not.toContain('bay.protection.meter_anchor_unresolved');
  });

  it('B-1 (§17.4 L0, none): warstwa adnotacji NIEOBECNA w całości mimo pełnych danych', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['50/51'], breakerRef: 'cb-1', ctRef: 'ct-1' },
      meteringMeasurementRef: 'meas-metering-1',
    });
    const station = makeStation('protection-l0', [bay]);
    const composition = composeStation({ ...buildComposeInput(station), annotationDetail: 'none' });

    expect(composition.protectionSymbols).toHaveLength(0);
    expect(composition.protectionSegments).toHaveLength(0);
    expect(composition.labels.protection).toHaveLength(0);
  });

  it('B-1 (kontrast, dowód że parametr GRYZIE): to samo wejście z annotationDetail=full daje kody+tor+„52"+„M" — różnica WYŁĄCZNIE w parametrze', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['50/51'], breakerRef: 'cb-1', ctRef: 'ct-1' },
      meteringMeasurementRef: 'meas-metering-1',
    });
    const station = makeStation('protection-l2-kontrast', [bay]);
    const full = composeStation({ ...buildComposeInput(station), annotationDetail: 'full' });

    expect(full.protectionSymbols.filter((s) => s.symbolId === 'protectionRelay')[0].protectionCodes).toEqual(['50/51']);
    expect(full.protectionSymbols.filter((s) => s.symbolId === 'meter')).toHaveLength(1);
    expect(full.protectionSegments).toHaveLength(1);
    expect(full.labels.protection.some((l) => l.text === '52')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // R-2 (recenzja F9.9, §17.3 zd. 2): pełna lista kodów przy >2 funkcjach.
  // -------------------------------------------------------------------------

  it('R-2 (§17.3 zd. 2): 4 kody ⇒ okrąg z DWOMA pierwszymi + etykieta slotu z PEŁNĄ listą w kolejności źródłowej', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['50/51', '51N', '67N', '87T'], breakerRef: 'cb-1', ctRef: 'ct-1' },
    });
    const station = makeStation('protection-full-list', [bay]);
    const composition = composeStation(buildComposeInput(station));

    const relay = composition.protectionSymbols.find((s) => s.symbolId === 'protectionRelay')!;
    expect(relay.protectionCodes).toEqual(['50/51', '51N']);
    const fullList = composition.labels.protection.filter((l) => l.ownerRef.endsWith('#protection-codes-full'));
    expect(fullList).toHaveLength(1);
    expect(fullList[0].text).toBe('50/51 · 51N · 67N · 87T');
    expect(fullList[0].labelClass).toBe('t4');

    // Etykieta MIEŚCI SIĘ w rezerwacji kolumny (measure zarezerwował
    // szerokość listy — `protectionAnnotationColumnWidth`): prostokąt po
    // resolveLabels nie wystaje poza `bx + reservedWidth` (± zapas GRID).
    const reservedWidth = bayColumnRequiredWidth(station.snBays, 0, undefined);
    const bx = buildComposeInput(station).column.x + GRID;
    const [resolved] = resolveLabels({ simpleAnchored: fullList });
    expect(resolved.rect.x).toBeGreaterThanOrEqual(bx);
    expect(resolved.rect.x + resolved.rect.width).toBeLessThanOrEqual(bx + reservedWidth + GRID);
  });

  it('R-2 (§17.3 zd. 2): 2 kody ⇒ ZERO etykiety pełnej listy (okrąg niesie kody w całości)', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['50/51', '51N'], breakerRef: 'cb-1', ctRef: 'ct-1' },
    });
    const station = makeStation('protection-two-codes', [bay]);
    const composition = composeStation(buildComposeInput(station));

    expect(composition.labels.protection.filter((l) => l.ownerRef.endsWith('#protection-codes-full'))).toHaveLength(0);
    expect(composition.protectionSymbols.find((s) => s.symbolId === 'protectionRelay')!.protectionCodes).toEqual(['50/51', '51N']);
  });

  it('R-2 + miernik: pełna lista POD okręgiem, miernik odsunięty POD etykietę (zero nachodzenia okrąg↔etykieta↔miernik)', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['50/51', '51N', '67N'], breakerRef: 'cb-1', ctRef: 'ct-1' },
      meteringMeasurementRef: 'meas-metering-1',
    });
    const station = makeStation('protection-full-list-meter', [bay]);
    const composition = composeStation(buildComposeInput(station));

    const relay = composition.protectionSymbols.find((s) => s.symbolId === 'protectionRelay')!;
    const meter = composition.protectionSymbols.find((s) => s.symbolId === 'meter')!;
    const fullList = composition.labels.protection.filter((l) => l.ownerRef.endsWith('#protection-codes-full'));
    const [resolved] = resolveLabels({ simpleAnchored: fullList });

    // Miernik zaczyna się PONIŻEJ dolnej krawędzi etykiety pełnej listy.
    expect(meter.y).toBeGreaterThanOrEqual(resolved.rect.y + resolved.rect.height);
    // Etykieta zaczyna się PONIŻEJ dolnej krawędzi okręgu przekaźnika.
    expect(resolved.rect.y).toBeGreaterThanOrEqual(relay.y + PROTECTION_ANNOTATION_DIAMETER);
  });
});

// ---------------------------------------------------------------------------
// F10.5 (spec §20.1/§20.2, secondary_link_duality_probe/
// protection_function_topology_validation) — linia pomiarowa CT→przekaźnik
// ODRĘBNA od toru wyzwalania + braki topologiczne funkcji zabezpieczeń.
// `makeLineBayPrimaryDevices()` (wyżej) niesie CT z `deviceRef:'ct-1'`.
// ---------------------------------------------------------------------------

describe('V3 compose/station — F10.5 §20.1: linia pomiarowa CT→przekaźnik (secondary_link_duality_probe)', () => {
  it('(a/c) ct_ref rozwiązywalny w stosie ⇒ DOKŁADNIE JEDNA linia measurementSegments, ODRĘBNA od protectionSegments (tor wyzwalania), zakotwiczona na REJESTROWANYCH portach CT+przekaźnika', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['50/51'], breakerRef: 'cb-1', ctRef: 'ct-1' },
    });
    const station = makeStation('measurement-link-ok', [bay]);
    const composition = composeStation(buildComposeInput(station));

    expect(composition.measurementSegments).toHaveLength(1);
    expect(composition.protectionSegments).toHaveLength(1); // tor wyzwalania NADAL osobno.
    expect(composition.measurementSegments[0].ownerRef).toBe(`${bay.bayRef}#measurement-link`);
    expect(composition.protectionSegments[0].ownerRef).toBe(`${bay.bayRef}#trip-line`);
    // Dwa RÓŻNE ownerRef (§20.1a dosłownie — zakaz jednej anonimowej linii).
    expect(composition.measurementSegments[0].ownerRef).not.toBe(composition.protectionSegments[0].ownerRef);

    const ctInstance = composition.symbols.find((s) => s.deviceRef === 'ct-1');
    expect(ctInstance).toBeDefined();
    const ctTopPort = { x: ctInstance!.x + 8, y: ctInstance!.y }; // 'top' port (dir N), offset (8,0)
    expect(composition.measurementSegments[0].points[0]).toEqual(ctTopPort);
    const relaySymbol = composition.protectionSymbols.find((s) => s.symbolId === 'protectionRelay')!;
    const relayLinkPort = { x: relaySymbol.x, y: relaySymbol.y + 8 }; // 'link' port (dir W), offset (0,8)
    const lastPoint = at(composition.measurementSegments[0].points, -1);
    expect(lastPoint).toEqual(relayLinkPort);

    expect(composition.missingData).not.toContain('bay.protection.measurement_link_unresolved');
  });

  it('(§20.1 zero zgadywania) ct_ref NIEROZWIĄZYWALNY w stosie ⇒ ZERO linii pomiarowej + missingData `bay.protection.measurement_link_unresolved` (NIGDY linia do domyślnego CT)', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['50/51'], breakerRef: 'cb-1', ctRef: 'ct-nieistniejacy' },
    });
    const station = makeStation('measurement-link-unresolved', [bay]);
    const composition = composeStation(buildComposeInput(station));

    expect(composition.measurementSegments).toHaveLength(0);
    expect(composition.missingData).toContain('bay.protection.measurement_link_unresolved');
  });

  it('(§20.1) brak ct_ref w danych (WYŁĄCZNIE breaker_ref) ⇒ ZERO linii pomiarowej + missingData (okrąg kotwiczy na wyłączniku, §17.2 fallback)', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['50/51'], breakerRef: 'cb-1' },
    });
    const station = makeStation('measurement-link-no-ct-ref', [bay]);
    const composition = composeStation(buildComposeInput(station));

    expect(composition.measurementSegments).toHaveLength(0);
    expect(composition.protectionSegments).toHaveLength(1); // tor wyzwalania NADAL rysowany (breaker_ref OK).
    expect(composition.missingData).toContain('bay.protection.measurement_link_unresolved');
  });

  it('B-1 (§17.4/§20.1 L1, circle-only): linia pomiarowa UKRYTA na L1 (TA SAMA gałąź LOD co tor wyzwalania), zero missingData §20.1 na TYM poziomie', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['50/51'], breakerRef: 'cb-1', ctRef: 'ct-1' },
    });
    const station = makeStation('measurement-link-l1', [bay]);
    const composition = composeStation({ ...buildComposeInput(station), annotationDetail: 'circle-only' });

    expect(composition.measurementSegments).toHaveLength(0);
    expect(composition.missingData).not.toContain('bay.protection.measurement_link_unresolved');
  });
});

describe('V3 compose/station — F10.5 §20.2: walidacja topologiczna funkcji zabezpieczeń (protection_function_topology_validation)', () => {
  it('87T BEZ transformatora w polu ⇒ ostrzeżenie na okręgu (protectionTopologyGaps) + missingData `protection.topology.87t_missing_transformer`', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(), // CB/CT/DS/ES/CABLE_HEAD — ZERO TRANSFORMER_DEVICE.
      protectionMarking: { codes: ['87T'], breakerRef: 'cb-1', ctRef: 'ct-1' },
    });
    const station = makeStation('topology-87t-missing-tr', [bay]);
    const composition = composeStation(buildComposeInput(station));

    const relay = composition.protectionSymbols.find((s) => s.symbolId === 'protectionRelay')!;
    expect(relay.protectionTopologyGaps).toEqual([{ code: '87T', reason: 'missing_transformer' }]);
    expect(composition.missingData).toContain('protection.topology.87t_missing_transformer');
  });

  it('87T Z transformatorem w polu (TRANSFORMER_DEVICE w primary_devices) ⇒ ZERO ostrzeżeń („z TR ⇒ zero", zadanie F10.5 pkt B)', () => {
    const bay = makeBay(FIELD_ROLE.TRANSFORMER, 0, {
      primaryDevices: [
        ...makeLineBayPrimaryDevices(),
        { kind: 'TRANSFORMER_DEVICE', placement: 'MIDSTREAM', deviceRef: 'tr-1' },
      ],
      protectionMarking: { codes: ['87T'], breakerRef: 'cb-1', ctRef: 'ct-1' },
    });
    const station = makeStation('topology-87t-with-tr', [bay]);
    const composition = composeStation(buildComposeInput(station));

    const relay = composition.protectionSymbols.find((s) => s.symbolId === 'protectionRelay')!;
    expect(relay.protectionTopologyGaps).toBeUndefined();
    expect(composition.missingData).not.toContain('protection.topology.87t_missing_transformer');
  });

  it('67N BEZ VT w polu ⇒ ostrzeżenie missing_vt; 67N Z VT ⇒ zero', () => {
    const withoutVt = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['67N'], breakerRef: 'cb-1', ctRef: 'ct-1' },
    });
    const compositionWithout = composeStation(buildComposeInput(makeStation('topology-67n-missing-vt', [withoutVt])));
    const relayWithout = compositionWithout.protectionSymbols.find((s) => s.symbolId === 'protectionRelay')!;
    expect(relayWithout.protectionTopologyGaps).toEqual([{ code: '67N', reason: 'missing_vt' }]);

    const withVt = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: [...makeLineBayPrimaryDevices(), { kind: 'VT', placement: 'MIDSTREAM', deviceRef: 'vt-1' }],
      protectionMarking: { codes: ['67N'], breakerRef: 'cb-1', ctRef: 'ct-1' },
    });
    const compositionWith = composeStation(buildComposeInput(makeStation('topology-67n-with-vt', [withVt])));
    const relayWith = compositionWith.protectionSymbols.find((s) => s.symbolId === 'protectionRelay')!;
    expect(relayWith.protectionTopologyGaps).toBeUndefined();
  });

  it('51N Z CT w polu (fixtura standardowa niesie CT) ⇒ zero ostrzeżeń missing_i0 (uproszczenie F10.5: obecność CT wystarcza, pełny I0-sumujący to F10.6)', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['51N'], breakerRef: 'cb-1', ctRef: 'ct-1' },
    });
    const station = makeStation('topology-51n-with-ct', [bay]);
    const composition = composeStation(buildComposeInput(station));
    const relay = composition.protectionSymbols.find((s) => s.symbolId === 'protectionRelay')!;
    expect(relay.protectionTopologyGaps).toBeUndefined();
  });

  it('(WHITE BOX zero zgadywania) pole KONWENCJI (§12.4, brak primary_devices) z kodem 87T ⇒ ZERO ostrzeżeń (brak danych o aparatach ≠ brak transformatora)', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      protectionMarking: { codes: ['87T'], breakerRef: 'cb-1' },
    });
    const station = makeStation('topology-convention-no-devices', [bay]);
    const composition = composeStation(buildComposeInput(station));
    const relay = composition.protectionSymbols.find((s) => s.symbolId === 'protectionRelay')!;
    expect(relay.protectionTopologyGaps).toBeUndefined();
    expect(composition.missingData).not.toContain('protection.topology.87t_missing_transformer');
  });

  it('B-1 (§17.4/§20.2 L1, circle-only): walidacja topologiczna NIE liczona na L1 (TA SAMA gałąź LOD co „52"/„M") — zero protectionTopologyGaps mimo braku transformatora', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['87T'], breakerRef: 'cb-1', ctRef: 'ct-1' },
    });
    const station = makeStation('topology-l1', [bay]);
    const composition = composeStation({ ...buildComposeInput(station), annotationDetail: 'circle-only' });
    const relay = composition.protectionSymbols.find((s) => s.symbolId === 'protectionRelay')!;
    expect(relay.protectionTopologyGaps).toBeUndefined();
    expect(composition.missingData).not.toContain('protection.topology.87t_missing_transformer');
  });
});

// ---------------------------------------------------------------------------
// F10.4 (spec §18.3, ct_annotation_probe) — adnotacja CT: identyfikator +
// przekładnia, WYŁĄCZNIE z danych (BEZ-DOMAIN: `Measurement.rating`/`.name`
// już istnieją w ENM; układ 3×CT/Ferranti-I0 — NOWE pole DOMAIN, F10.6, poza
// zakresem). `makeLineBayPrimaryDevices()` (wyżej) niesie CT z
// `deviceRef:'ct-1'`, `linkedRef:'meas-metering-1'`.
// ---------------------------------------------------------------------------

describe('V3 compose/station — F10.4 §18.3: adnotacja przekładni CT (ct_annotation_probe)', () => {
  it('(b, negatyw obowiązkowy) brak danych = brak oznaczenia: pole BEZ ctRatingAnnotations ⇒ ZERO etykiet #ct-rating-', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, { primaryDevices: makeLineBayPrimaryDevices() });
    const station = makeStation('ct-rating-none', [bay]);
    const composition = composeStation(buildComposeInput(station));

    expect(composition.labels.protection.filter((l) => l.ownerRef.includes('#ct-rating-'))).toHaveLength(0);
    expect(composition.missingData).not.toContain('bay.protection.ct_rating_anchor_unresolved');
  });

  it('(a) dane obecne (measurementRef rozwiązywalny na CT stosu) ⇒ DOKŁADNIE 1 etykieta „identyfikator · przekładnia" w kolumnie adnotacji', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      ctRatingAnnotations: [{ measurementRef: 'meas-metering-1', identifier: 'CT1', ratioText: '300/5' }],
    });
    const station = makeStation('ct-rating-ok', [bay]);
    const composition = composeStation(buildComposeInput(station));

    const ctLabels = composition.labels.protection.filter((l) => l.ownerRef.includes('#ct-rating-'));
    expect(ctLabels).toHaveLength(1);
    expect(ctLabels[0].text).toBe('CT1 · 300/5');
    expect(ctLabels[0].labelClass).toBe('t4');
    expect(ctLabels[0].ownerKind).toBe('protection');
    expect(composition.missingData).not.toContain('bay.protection.ct_rating_anchor_unresolved');

    // Zero zgadywania na WARTOŚĆ: tekst = DOKŁADNIE `identifier · ratioText`
    // z danych, zero fabrykacji separatora/formatu spoza tego wzorca.
    const resolved = resolveLabels({ simpleAnchored: ctLabels }).find((l) => l.ownerRef === ctLabels[0].ownerRef)!;
    expect(resolved.rect.x % GRID).toBe(0);
    expect(resolved.rect.y % GRID).toBe(0);
  });

  it('F10.6 (§18.3, D3, V12K-036): arrangement obecny dokleja trzeci człon „· 3×CT"/„· Ferranti-I0" do etykiety CT', () => {
    const bay3xCt = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      ctRatingAnnotations: [
        { measurementRef: 'meas-metering-1', identifier: 'CT1', ratioText: '300/5', arrangement: '3xCT' },
      ],
    });
    const composition3xCt = composeStation(buildComposeInput(makeStation('ct-rating-3xct', [bay3xCt])));
    const labels3xCt = composition3xCt.labels.protection.filter((l) => l.ownerRef.includes('#ct-rating-'));
    expect(labels3xCt).toHaveLength(1);
    expect(labels3xCt[0].text).toBe('CT1 · 300/5 · 3×CT');

    const bayFerranti = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      ctRatingAnnotations: [
        { measurementRef: 'meas-metering-1', identifier: 'CT1', ratioText: '300/5', arrangement: 'ferranti' },
      ],
    });
    const compositionFerranti = composeStation(buildComposeInput(makeStation('ct-rating-ferranti', [bayFerranti])));
    const labelsFerranti = compositionFerranti.labels.protection.filter((l) => l.ownerRef.includes('#ct-rating-'));
    expect(labelsFerranti).toHaveLength(1);
    expect(labelsFerranti[0].text).toBe('CT1 · 300/5 · Ferranti-I0');
  });

  it('(§18.3 zero zgadywania) measurementRef NIEROZWIĄZYWALNY w stosie ⇒ ZERO etykiety + missingData `bay.protection.ct_rating_anchor_unresolved` (NIGDY etykieta bez kotwicy)', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      ctRatingAnnotations: [{ measurementRef: 'meas-ct-nieistniejacy', identifier: 'CT9', ratioText: '150/5' }],
    });
    const station = makeStation('ct-rating-unresolved', [bay]);
    const composition = composeStation(buildComposeInput(station));

    expect(composition.labels.protection.filter((l) => l.ownerRef.includes('#ct-rating-'))).toHaveLength(0);
    expect(composition.missingData).toContain('bay.protection.ct_rating_anchor_unresolved');
  });

  it('kolumna adnotacji rezerwowana TYLKO dla pól z danymi CT — pole z SAMYM ctRatingAnnotations (bez protectionMarking/meteringMeasurementRef) ma szerszą rezerwację niż pole bez danych', () => {
    const bayWithout = makeBay(FIELD_ROLE.LINE_IN, 0, { primaryDevices: makeLineBayPrimaryDevices() });
    const bayWithCt = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      ctRatingAnnotations: [{ measurementRef: 'meas-metering-1', identifier: 'CT1', ratioText: '300/5' }],
    });
    const widthWithout = bayColumnRequiredWidth([bayWithout], 0, undefined);
    const widthWithCt = bayColumnRequiredWidth([bayWithCt], 0, undefined);
    expect(widthWithCt).toBeGreaterThan(widthWithout);

    // Pole z SAMYM CT rating (bez kodów/miernika) NIE rysuje okręgu
    // przekaźnika/miernika — rezerwacja szersza WYŁĄCZNIE o pasmo tekstu CT.
    const composition = composeStation(buildComposeInput(makeStation('ct-rating-only', [bayWithCt])));
    expect(composition.protectionSymbols).toHaveLength(0);
    expect(composition.labels.protection.filter((l) => l.ownerRef.includes('#ct-rating-'))).toHaveLength(1);
  });

  it('koegzystencja z okręgiem przekaźnika + miernikiem na TYM SAMYM CT (§17.2 kotwica) — etykieta CT i oba okręgi bez wzajemnego nachodzenia (dwa różne pasma kolumny, §18.3 rozstrzygnięcie F10.4)', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      protectionMarking: { codes: ['50/51'], breakerRef: 'cb-1', ctRef: 'ct-1' },
      meteringMeasurementRef: 'meas-metering-1',
      ctRatingAnnotations: [{ measurementRef: 'meas-metering-1', identifier: 'CT1', ratioText: '300/5' }],
    });
    const station = makeStation('ct-rating-coexist', [bay]);
    const composition = composeStation(buildComposeInput(station));

    const relay = composition.protectionSymbols.find((s) => s.symbolId === 'protectionRelay')!;
    const meter = composition.protectionSymbols.find((s) => s.symbolId === 'meter')!;
    const ctLabels = composition.labels.protection.filter((l) => l.ownerRef.includes('#ct-rating-'));
    expect(ctLabels).toHaveLength(1);
    const [ctLabelResolved] = resolveLabels({ simpleAnchored: ctLabels });

    // Etykieta CT nie nachodzi na okrąg przekaźnika (rects rozłączne w X LUB Y).
    const disjoint = (
      rectA: { x: number; y: number; width: number; height: number },
      rectB: { x: number; y: number; width: number; height: number },
    ): boolean =>
      rectA.x + rectA.width <= rectB.x ||
      rectB.x + rectB.width <= rectA.x ||
      rectA.y + rectA.height <= rectB.y ||
      rectB.y + rectB.height <= rectA.y;

    const relayRect = { x: relay.x, y: relay.y, width: PROTECTION_ANNOTATION_DIAMETER, height: PROTECTION_ANNOTATION_DIAMETER };
    const meterRect = { x: meter.x, y: meter.y, width: PROTECTION_ANNOTATION_DIAMETER, height: PROTECTION_ANNOTATION_DIAMETER };
    expect(disjoint(ctLabelResolved.rect, relayRect)).toBe(true);
    expect(disjoint(ctLabelResolved.rect, meterRect)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F10.3 (spec §18.4, D2-4) — etykieta szyny SN stacji (napięcie + oznaczenie
// sekcji, parytet z GPZ) + sprzęgło (COUPLER) renderuje STAN z danych.
// ---------------------------------------------------------------------------

describe('V3 compose/station — F10.3 §18.4: etykieta szyny SN (busbar-voltage)', () => {
  // S9-8 (audyt, „identyfikator stacji w opisie sekcji"): tekst niesie KOD
  // STACJI jako człon wiodący, gdy dane go mają — bez niego 55 sekcji na sieci
  // referencyjnej nosi identyczny napis „Sekcja 1 · 15 kV" i nie da się
  // powiedzieć, KTÓREJ stacji dotyczy. Intencja obu asercji bez zmian: napięcie
  // WYŁĄCZNIE z danych (zero fabrykacji liczby).
  it('napięcie OBECNE w danych ⇒ tekst „⟨kod⟩ · Sekcja 1 · ⟨V⟩ kV" (parytet gramatyki z GPZ + identyfikator stacji)', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0);
    const station = makeStation('busbar-with-voltage', [bay], { busVoltageKv: 15 });
    const composition = composeStation(buildComposeInput(station));

    expect(composition.labels.busbar).toHaveLength(1);
    expect(composition.labels.busbar[0].text).toBe('S01 · Sekcja 1 · 15 kV');
    expect(composition.labels.busbar[0].ownerKind).toBe('busbar-voltage');
    expect(composition.labels.busbar[0].ownerRef).toBe('busbar-with-voltage#busbar-voltage');
  });

  it('napięcie NIEOBECNE w danych ⇒ tekst bez „kV" WYŁĄCZNIE (zero fabrykacji liczby, §12.1 zasada analogiczna)', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0);
    const station = makeStation('busbar-no-voltage', [bay], { busVoltageKv: null });
    const composition = composeStation(buildComposeInput(station));

    expect(composition.labels.busbar).toHaveLength(1);
    expect(composition.labels.busbar[0].text).toBe('S01 · Sekcja 1');
    expect(composition.labels.busbar[0].text).not.toMatch(/kV/);
  });

  it('S9-8: kod stacji NIEOBECNY w danych ⇒ opis sekcji BEZ członu wiodącego (degradacja, nie fabrykacja identyfikatora)', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0);
    const station = makeStation('busbar-no-code', [bay], { busVoltageKv: 15, stationCode: null });
    const composition = composeStation(buildComposeInput(station));

    expect(composition.labels.busbar[0].text).toBe('Sekcja 1 · 15 kV');
  });

  it('stacja bez pól SN (snBays=[]) ⇒ ZERO etykiety szyny (zgodne z pominięciem #sn-bus — zakaz „szyny znikąd")', () => {
    const station = makeStation('busbar-no-bays', [], { busVoltageKv: 15 });
    const composition = composeStation(buildComposeInput(station));

    expect(composition.labels.busbar).toHaveLength(0);
    expect(composition.segments.some((s) => s.ownerRef.endsWith('#sn-bus'))).toBe(false);
  });

  it('etykieta szyny mieści się W CAŁOŚCI w pełnej szerokości kolumny (column.x..column.x+column.width) — zero wystawania w sąsiada (rezerwacja "dwóch szerokości", measure.ts)', () => {
    // Nazwa/oznaczniki celowo KRÓTKIE — jedyny szeroki kandydat to etykieta
    // szyny, dowodzi że TA rezerwacja (nie nameBandWidth) poszerza kolumnę.
    const bay = makeBay(FIELD_ROLE.COUPLER, 0);
    const station = makeStation('busbar-width-guard', [bay], {
      name: 'S1',
      stationCode: undefined,
      transformerRatedKva: undefined,
      stationTypeLabel: undefined,
      busVoltageKv: 20.5,
    });
    const input = buildComposeInput(station);
    const composition = composeStation(input);

    expect(composition.labels.busbar).toHaveLength(1);
    const [resolved] = resolveLabels({ simpleAnchored: composition.labels.busbar });
    expect(resolved.rect.x).toBeGreaterThanOrEqual(input.column.x);
    expect(resolved.rect.x + resolved.rect.width).toBeLessThanOrEqual(input.column.x + input.column.width);
  });

  it('DOWÓD: rezerwacja szerokości kolumny (requiredStationWidth) rośnie gdy etykieta szyny jest szersza niż blok pól + pasmo nazw', () => {
    const shortNameStation = makeStation('width-cmp-short', [makeBay(FIELD_ROLE.COUPLER, 0)], {
      name: 'S',
      stationCode: undefined,
      transformerRatedKva: undefined,
      stationTypeLabel: undefined,
      busVoltageKv: null,
    });
    // PROPORCJE (2026-08-07): sidecar pola niesie teraz oznacznik („FS1 ·
    // sprzęgłowe"), więc gałąź „blok pól" jest szersza niż przed kartą — żeby
    // dowód pozostał DOWODEM (a nie tautologią), etykieta szyny musi ją
    // realnie przewyższyć. Intencja testu bez zmian: rezerwacja kolumny
    // ROŚNIE, gdy najszerszym kandydatem jest etykieta szyny.
    const withWideVoltage = { ...shortNameStation, id: 'width-cmp-wide', busVoltageKv: 1234567890123 };
    expect(requiredStationWidth(withWideVoltage)).toBeGreaterThan(requiredStationWidth(shortNameStation));
  });
});

describe('V3 compose/station — F10.3 §18.4: sprzęgło (COUPLER) renderuje STAN z danych', () => {
  it('pole COUPLER między dwoma polami liniowymi: aparat CB sprzęgła niesie stan z `bay.cbState` (dane), widoczny na scenie MIĘDZY sąsiadami', () => {
    const left = makeBay(FIELD_ROLE.LINE_IN, 0, { bayRef: 'left-line' });
    const coupler = makeBay(FIELD_ROLE.COUPLER, 1, { bayRef: 'coupler-1', cbState: 'open', dsState: 'closed' });
    const right = makeBay(FIELD_ROLE.LINE_OUT, 2, { bayRef: 'right-line' });
    const station = makeStation('coupler-open', [left, coupler, right]);
    const composition = composeStation(buildComposeInput(station));

    // Sprzęgło (§12.4 konwencja: DS→CB→CT) — CB niesie stan Z DANYCH pola
    // (`bay.cbState`), TA SAMA ścieżka co każdy inny wyłącznik pola.
    const couplerBreaker = composition.symbols.find((s) => s.bayRef === 'coupler-1' && s.symbolId === 'breaker')!;
    expect(couplerBreaker).toBeDefined();
    expect(couplerBreaker.state).toBe('open');
    const couplerDisconnector = composition.symbols.find((s) => s.bayRef === 'coupler-1' && s.symbolId === 'disconnector')!;
    expect(couplerDisconnector.state).toBe('closed');

    // Widoczność MIĘDZY sekcjami: sprzęgło zajmuje pozycję X ściśle między
    // sąsiadami (left < coupler < right), na TEJ SAMEJ szynie SN ciągłej
    // (dowód rozłączności/ciągłości toru — `internalSegmentsEndAtPortsOrBus`
    // niezależnie potwierdza spójność portów).
    const leftX = composition.symbols.find((s) => s.bayRef === 'left-line')!.x;
    const rightX = composition.symbols.find((s) => s.bayRef === 'right-line')!.x;
    expect(couplerBreaker.x).toBeGreaterThan(leftX);
    expect(couplerBreaker.x).toBeLessThan(rightX);
    expect(internalSegmentsEndAtPortsOrBus(composition)).toBe(true);
    expect(noCompositionSymbolOverlaps(composition)).toBe(true);
  });

  it('pole COUPLER: aparat CB sprzęgła niesie stan „closed" (dane) — dowód, że OBA stany widoczne (rozłącznik z open, ten z closed — brak stanu domyślnego stałego)', () => {
    const coupler = makeBay(FIELD_ROLE.COUPLER, 0, { bayRef: 'coupler-closed', cbState: 'closed' });
    const station = makeStation('coupler-closed', [coupler]);
    const composition = composeStation(buildComposeInput(station));

    const couplerBreaker = composition.symbols.find((s) => s.symbolId === 'breaker')!;
    expect(couplerBreaker.state).toBe('closed');
  });

  it('pole COUPLER ze ścieżki DANYCH (`primary_devices` z `kind: "CB"`): stan PER APARAT wprost z `switch_state`, nie z agregatu konwencji', () => {
    const coupler = makeBay(FIELD_ROLE.COUPLER, 0, {
      bayRef: 'coupler-data',
      primaryDevices: [
        { deviceRef: 'ds-c1', kind: 'DS', placement: 'UPSTREAM', switchState: 'closed' },
        { deviceRef: 'cb-c1', kind: 'CB', placement: 'MIDSTREAM', switchState: 'open' },
        { deviceRef: 'ct-c1', kind: 'CT', placement: 'DOWNSTREAM' },
      ],
    });
    const station = makeStation('coupler-data-path', [coupler]);
    const composition = composeStation(buildComposeInput(station));

    const breaker = composition.symbols.find((s) => s.symbolId === 'breaker')!;
    expect(breaker.state).toBe('open');
    expect(breaker.apparatusSource).toBe('dane');
    expect(breaker.deviceRef).toBe('cb-c1');
  });
});

// ---------------------------------------------------------------------------
// CTVT-RENDER (spec §18.3/§20.2, CTVT-MODEL/V12K-176) — konsument-render pól
// `Measurement.ct_cores`/`vt_mounting`: rdzenie CT doklejone do ISTNIEJĄCEJ
// etykiety CT + NOWA adnotacja montażu VT (szynowy/kablowy). WARUNKOWOŚĆ:
// adnotacja i rezerwacja WYŁĄCZNIE gdy dana obecna; None ⇒ zero adnotacji +
// zero zmiany geometrii (bajt-inwariancja).
// ---------------------------------------------------------------------------

/** Pole z aparatem VT bocznym niosącym `linked_ref` — kotwica adnotacji
 *  montażu VT (wzorzec `makeLineBayPrimaryDevices` z CT). */
function makeLineBayWithVtPrimaryDevices(): readonly BayPrimaryDeviceView[] {
  return [
    ...makeLineBayPrimaryDevices(),
    { kind: 'VT', placement: 'MIDSTREAM', deviceRef: 'vt-1', linkedRef: 'meas-vt-1' },
  ];
}

describe('CTVT-RENDER §18.3: liczba rdzeni CT doklejona do etykiety (ct_cores)', () => {
  it('ctCoresLabelText: dana obecna ⇒ „N rdz."; None/≤0/NaN ⇒ null (zero fabrykacji)', () => {
    expect(ctCoresLabelText(2)).toBe('2 rdz.');
    expect(ctCoresLabelText(3)).toBe('3 rdz.');
    expect(ctCoresLabelText(null)).toBeNull();
    expect(ctCoresLabelText(undefined)).toBeNull();
    expect(ctCoresLabelText(0)).toBeNull();
    expect(ctCoresLabelText(-1)).toBeNull();
    expect(ctCoresLabelText(Number.NaN)).toBeNull();
  });

  it('ctRatingLabelText: cores doklejone jako kolejny człon; brak cores ⇒ tekst F10.4/F10.6 bez zmian (inwariancja)', () => {
    // Bez cores (i bez arrangement) — dwuczłonowy tekst F10.4 NIETKNIĘTY.
    expect(ctRatingLabelText({ identifier: 'CT1', ratioText: '300/5' })).toBe('CT1 · 300/5');
    // Arrangement bez cores — trójczłonowy tekst F10.6 NIETKNIĘTY.
    expect(ctRatingLabelText({ identifier: 'CT1', ratioText: '300/5', arrangement: '3xCT' }))
      .toBe('CT1 · 300/5 · 3×CT');
    // Cores bez arrangement.
    expect(ctRatingLabelText({ identifier: 'CT1', ratioText: '300/5', cores: 2 }))
      .toBe('CT1 · 300/5 · 2 rdz.');
    // Arrangement + cores — pełny czteroczłonowy tekst.
    expect(ctRatingLabelText({ identifier: 'CT1', ratioText: '300/5', arrangement: 'ferranti', cores: 3 }))
      .toBe('CT1 · 300/5 · Ferranti-I0 · 3 rdz.');
  });

  it('render: cores obecne ⇒ etykieta CT niesie „· N rdz."; cores None ⇒ etykieta bez członu rdzeni (inwariancja tekstu)', () => {
    const bayWithCores = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      ctRatingAnnotations: [{ measurementRef: 'meas-metering-1', identifier: 'CT1', ratioText: '300/5', cores: 3 }],
    });
    const withCores = composeStation(buildComposeInput(makeStation('ct-cores', [bayWithCores])));
    const labelWith = withCores.labels.protection.filter((l) => l.ownerRef.includes('#ct-rating-'));
    expect(labelWith).toHaveLength(1);
    expect(labelWith[0].text).toBe('CT1 · 300/5 · 3 rdz.');

    const bayNoCores = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayPrimaryDevices(),
      ctRatingAnnotations: [{ measurementRef: 'meas-metering-1', identifier: 'CT1', ratioText: '300/5' }],
    });
    const noCores = composeStation(buildComposeInput(makeStation('ct-no-cores', [bayNoCores])));
    const labelNo = noCores.labels.protection.filter((l) => l.ownerRef.includes('#ct-rating-'));
    expect(labelNo).toHaveLength(1);
    expect(labelNo[0].text).toBe('CT1 · 300/5');
  });
});

describe('CTVT-RENDER §20.2: adnotacja montażu VT (vt_mounting)', () => {
  it('vtMountingLabelText/vtMountingAnnotationLabelText: bus⇒„szynowy", cable⇒„kablowy"', () => {
    expect(vtMountingLabelText('bus')).toBe('szynowy');
    expect(vtMountingLabelText('cable')).toBe('kablowy');
    expect(vtMountingAnnotationLabelText({ identifier: 'V1', mounting: 'cable' })).toBe('V1 · kablowy');
    expect(vtMountingAnnotationLabelText({ identifier: 'V2', mounting: 'bus' })).toBe('V2 · szynowy');
  });

  it('bayHasProtectionAnnotation: pole z SAMYM vtMountingAnnotations ⇒ true (kolumna rezerwowana)', () => {
    expect(bayHasProtectionAnnotation({
      vtMountingAnnotations: [{ measurementRef: 'meas-vt-1', identifier: 'V1', mounting: 'cable' }],
    })).toBe(true);
  });

  it('(a) dane obecne (measurementRef rozwiązywalny na VT stosu) ⇒ DOKŁADNIE 1 etykieta „identyfikator · montaż" #vt-mounting-', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayWithVtPrimaryDevices(),
      vtMountingAnnotations: [{ measurementRef: 'meas-vt-1', identifier: 'V1', mounting: 'cable' }],
    });
    const composition = composeStation(buildComposeInput(makeStation('vt-mounting-ok', [bay])));

    const vtLabels = composition.labels.protection.filter((l) => l.ownerRef.includes('#vt-mounting-'));
    expect(vtLabels).toHaveLength(1);
    expect(vtLabels[0].text).toBe('V1 · kablowy');
    expect(vtLabels[0].labelClass).toBe('t4');
    expect(vtLabels[0].ownerKind).toBe('protection');
    expect(composition.missingData).not.toContain('bay.protection.vt_mounting_anchor_unresolved');
  });

  it('(§20.2 zero zgadywania) measurementRef NIEROZWIĄZYWALNY w stosie ⇒ ZERO etykiety + missingData `vt_mounting_anchor_unresolved`', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayWithVtPrimaryDevices(),
      vtMountingAnnotations: [{ measurementRef: 'meas-vt-nieistniejacy', identifier: 'V9', mounting: 'bus' }],
    });
    const composition = composeStation(buildComposeInput(makeStation('vt-mounting-unresolved', [bay])));

    expect(composition.labels.protection.filter((l) => l.ownerRef.includes('#vt-mounting-'))).toHaveLength(0);
    expect(composition.missingData).toContain('bay.protection.vt_mounting_anchor_unresolved');
  });

  it('(b, negatyw obowiązkowy — bajt-inwariancja) brak danych = brak oznaczenia + ZERO zmiany geometrii', () => {
    // Pole z aparatem VT bocznym ALE bez `vtMountingAnnotations` (None) —
    // dowód: ZERO etykiet #vt-mounting-, ZERO rezerwacji, kompozycja
    // BAJT-IDENTYCZNA z polem bez warstwy VT (warunkowość §0.2).
    const bayNoData = makeBay(FIELD_ROLE.LINE_IN, 0, { primaryDevices: makeLineBayWithVtPrimaryDevices() });
    const composition = composeStation(buildComposeInput(makeStation('vt-mounting-none', [bayNoData])));

    expect(composition.labels.protection.filter((l) => l.ownerRef.includes('#vt-mounting-'))).toHaveLength(0);
    expect(composition.missingData).not.toContain('bay.protection.vt_mounting_anchor_unresolved');

    // Rezerwacja szerokości NIEZMIENIONA: pole bez adnotacji ma zerową kolumnę.
    expect(vtMountingAnnotationsWidth(bayNoData)).toBe(0);
    expect(protectionAnnotationColumnWidth(bayNoData)).toBe(0);
    expect(bayHasProtectionAnnotation(bayNoData)).toBe(false);

    // Bajt-inwariancja: kompozycja pola z VT-bez-danych IDENTYCZNA z
    // kompozycją tego samego pola liczoną osobno (determinizm + brak dryfu).
    const compositionRepeat = composeStation(buildComposeInput(makeStation('vt-mounting-none', [
      makeBay(FIELD_ROLE.LINE_IN, 0, { primaryDevices: makeLineBayWithVtPrimaryDevices() }),
    ])));
    expect(JSON.stringify(composition)).toBe(JSON.stringify(compositionRepeat));
  });

  it('rezerwacja WARUNKOWA: pole Z vtMountingAnnotations ma szerszą kolumnę niż pole bez danych', () => {
    const bayWithout = makeBay(FIELD_ROLE.LINE_IN, 0, { primaryDevices: makeLineBayWithVtPrimaryDevices() });
    const bayWith = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayWithVtPrimaryDevices(),
      vtMountingAnnotations: [{ measurementRef: 'meas-vt-1', identifier: 'V1', mounting: 'cable' }],
    });
    expect(bayColumnRequiredWidth([bayWith], 0, undefined))
      .toBeGreaterThan(bayColumnRequiredWidth([bayWithout], 0, undefined));
  });

  it('koegzystencja CT+VT: obie etykiety obecne w tym samym lewym paśmie, na RÓŻNYCH Y (różne aparaty)', () => {
    const bay = makeBay(FIELD_ROLE.LINE_IN, 0, {
      primaryDevices: makeLineBayWithVtPrimaryDevices(),
      ctRatingAnnotations: [{ measurementRef: 'meas-metering-1', identifier: 'CT1', ratioText: '300/5', cores: 2 }],
      vtMountingAnnotations: [{ measurementRef: 'meas-vt-1', identifier: 'V1', mounting: 'cable' }],
    });
    const composition = composeStation(buildComposeInput(makeStation('ctvt-coexist', [bay])));

    const ctLabels = composition.labels.protection.filter((l) => l.ownerRef.includes('#ct-rating-'));
    const vtLabels = composition.labels.protection.filter((l) => l.ownerRef.includes('#vt-mounting-'));
    expect(ctLabels).toHaveLength(1);
    expect(vtLabels).toHaveLength(1);
    expect(ctLabels[0].text).toBe('CT1 · 300/5 · 2 rdz.');
    expect(vtLabels[0].text).toBe('V1 · kablowy');
    // Ten sam lewy anchor X, różne Y (kotwice na CT vs VT).
    expect(ctLabels[0].anchor.x).toBe(vtLabels[0].anchor.x);
    expect(ctLabels[0].anchor.y).not.toBe(vtLabels[0].anchor.y);
  });
});

