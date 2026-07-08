/**
 * SLD V3 F5a — wyrocznie kompozycji stacji z prymitywów (SLD_CAD_SPEC_V3 §3,
 * §11 rozszerzenie F5). Syntetyki budowane na PRAWDZIWYM potoku
 * measure → bands → columns (F2/F3/r7b), żeby `column`/`busAxisY`/
 * `blockTopY` odpowiadały rzeczywistej geometrii wcześniejszych kroków.
 */
import { describe, expect, it } from 'vitest';

import { GRID } from '../../core/grid';
import { FIELD_ROLE, ALL_FIELD_ROLES, type FieldRole } from '../../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../../v2/renderer/MiniBlockRmuRenderer';
import {
  bayColumnFootprint,
  stationBlockHeight,
  type StationMeasureInput,
} from '../../layout/measure';
import { computeBands, type StationBandHeights } from '../../layout/bands';
import { computeColumns, type ComputeColumnsInput } from '../../layout/columns';
import { computeSegmentStagger } from '../../layout/segments';
import {
  allCompositionSymbolsOnGrid,
  apparatusSymbolsForRole,
  composeStation,
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
  const stagger = computeSegmentStagger([station], [null]);
  const bandsResult = computeBands([bandHeightsFor(station, null)], stagger.twoRow);
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

describe('V3 compose/station — spójność measure↔compose (wymóg zadania F5a)', () => {
  for (const role of ALL_FIELD_ROLES) {
    it(`rola ${role}: stackFootprint(apparatusSymbolsForRole) === bayColumnFootprint`, () => {
      const fromCompose = stackFootprint(apparatusSymbolsForRole(role));
      const fromMeasure = bayColumnFootprint(role);
      expect(fromCompose).toEqual(fromMeasure);
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

    const symbolMaxY = Math.max(...composition.symbols.map((s) => s.y + 40)); // 40 = wysokość TR2W (najwyższy symbol)
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

