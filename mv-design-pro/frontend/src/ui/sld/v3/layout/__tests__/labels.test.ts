/**
 * SLD V3 F4 — wyrocznie label resolvera (SLD_CAD_SPEC_V3 §4/§5.5, §11.1).
 * Syntetyki budowane na PRAWDZIWYM potoku measure → bands → columns (F2/F3),
 * żeby sloty przekazywane do `resolveLabels` odpowiadały rzeczywistej
 * geometrii wcześniejszych kroków (zero fikcyjnych danych wejściowych).
 */
import { describe, expect, it } from 'vitest';

import { GRID, rectsOverlap, type V3Rect } from '../../core/grid';
import { labelLineHeight, measureLabelWidth } from '../../core/text';
import { FIELD_ROLE, type FieldRole } from '../../../v2/domain/apparatusContracts';
import type { MiniBlockBayDescriptor } from '../../../v2/renderer/MiniBlockRmuRenderer';
import {
  stationBlockHeight,
  stationNameBandHeight,
  stationPortCaptionHeight,
  type StationMeasureInput,
} from '../measure';
import { BUS_AXIS_BAND_HEIGHT, computeBands, type StationBandHeights } from '../bands';
import { computeColumns, type ComputeColumnsInput } from '../columns';
import { computeSegmentStagger } from '../segments';
import {
  leaderInvariantHolds,
  overlapProbe,
  resolveLabels,
  type OwnedLabel,
  type PortCaptionOwnerInput,
  type ResolveLabelsInput,
  type SegmentSpanOwnerInput,
  type StationNameBandOwnerInput,
} from '../labels';

// ---------------------------------------------------------------------------
// Helpery syntetyczne (te same wzorce co layout.test.ts, F2/F3).
// ---------------------------------------------------------------------------

function makeBay(fieldRole: FieldRole, index: number): MiniBlockBayDescriptor {
  return {
    bayRef: `bay-${index}`,
    fieldRole,
    designation: `Pole ${index}`,
    hasMissingRequiredDevice: false,
  };
}

function makeStation(
  id: string,
  nameLength: number,
  bayCount: number,
  bayDirectionCaptions?: readonly (string | null)[],
): StationMeasureInput {
  const bays: MiniBlockBayDescriptor[] = [];
  for (let i = 0; i < bayCount - 1; i++) bays.push(makeBay(FIELD_ROLE.RMU_LINE, i));
  bays.push(makeBay(FIELD_ROLE.RMU_TRANSFORMER, bayCount - 1));
  return {
    id,
    name: 'A'.repeat(Math.max(nameLength, 1)),
    stationCode: `S${String(1).padStart(2, '0')}`,
    transformerRatedKva: 630,
    stationTypeLabel: 'stacja przelotowa',
    snBays: bays,
    bayDirectionCaptions,
  };
}

function bandHeightsFor(station: StationMeasureInput, incomingSegmentLabelText: string | null): StationBandHeights {
  return {
    incomingSegmentLabelText,
    portCaptionHeight: stationPortCaptionHeight(station),
    stationBlockHeight: stationBlockHeight(station),
    nameBandHeight: stationNameBandHeight(station),
  };
}

function buildPipeline(stations: readonly StationMeasureInput[], incomingSegmentLabelTexts: readonly (string | null)[]) {
  const stagger = computeSegmentStagger(stations, incomingSegmentLabelTexts);
  const bandsResult = computeBands(
    stations.map((s, i) => bandHeightsFor(s, incomingSegmentLabelTexts[i])),
    stagger.twoRow,
  );
  const input: ComputeColumnsInput = {
    stations,
    incomingSegmentLabelTexts,
    nameSlotBand: bandsResult.bands.B5,
    segmentSlotBand: bandsResult.bands.B1,
  };
  const columnsResult = computeColumns(input);
  return { bandsResult, columnsResult, stagger };
}

const WIDE_CABLE_LABEL = 'YAKXS 3×120/16 · 90 m — bardzo długi opis odcinka magistrali SN';

// ---------------------------------------------------------------------------
// (a) Segment przęsłowy (r7): slot wyśrodkowany na przęśle, wiersz ze
// staggera; etykieta szersza niż przęsło ⇒ slot zapasowy + leader do środka
// przęsła.
// ---------------------------------------------------------------------------

describe('V3 labels — segment przęsłowy (spec §4/§5.5, decyzja r7)', () => {
  it('etykieta KRÓTSZA niż przęsło ⇒ slot 1, wyśrodkowana na przęśle, bez leadera', () => {
    const station = makeStation('s1', 4, 2);
    const { bandsResult, columnsResult } = buildPipeline([station], ['x']);
    const slot = columnsResult.segmentLabelSlots[0];
    const spanStart = -200;
    const spanEnd = columnsResult.columns[0].x; // 0
    const owner: SegmentSpanOwnerInput = {
      ownerRef: 'seg-0',
      text: 'A',
      spanStart,
      spanEnd,
      busAxisY: bandsResult.bands.B2.y,
      fallbackRect: slot.rect,
    };
    const [label] = resolveLabels({ segmentSpans: [owner] });

    expect(label.slotIndex).toBe(1);
    expect(label.leader).toBeUndefined();
    expect(label.rect.y).toBe(slot.rect.y);
    expect(label.rect.height).toBe(slot.rect.height);
    const spanCenter = (spanStart + spanEnd) / 2;
    const labelCenter = label.rect.x + label.rect.width / 2;
    expect(Math.abs(labelCenter - spanCenter)).toBeLessThan(GRID); // wyśrodkowana (z tolerancją snap-to-grid)
    expect(Math.abs(label.rect.x % GRID)).toBe(0); // lewa krawędź slotu na siatce (spec §2)
  });

  it('etykieta SZERSZA niż przęsło (norma: GAP=24px << etykieta kabla) ⇒ slot zapasowy = rezerwacja columns.ts + leader do środka przęsła, w wierszu ze staggera', () => {
    // Dwie wąskie stacje sąsiadujące z bardzo długą etykietą ⇒ z konstrukcji
    // wymuszają alternację 2-wierszową (F3 r2, patrz layout.test.ts).
    const stationA = makeStation('a', 1, 1);
    const stationB = makeStation('b', 1, 1);
    const { bandsResult, columnsResult, stagger } = buildPipeline(
      [stationA, stationB],
      [WIDE_CABLE_LABEL, WIDE_CABLE_LABEL],
    );
    expect(stagger.twoRow).toBe(true);

    const [slotA, slotB] = columnsResult.segmentLabelSlots;
    const spanAStart = -300;
    const spanAEnd = columnsResult.columns[0].x; // 0
    const spanBStart = columnsResult.columns[0].x + columnsResult.columns[0].width;
    const spanBEnd = columnsResult.columns[1].x;

    const ownerA: SegmentSpanOwnerInput = {
      ownerRef: 'seg-a',
      text: WIDE_CABLE_LABEL,
      spanStart: spanAStart,
      spanEnd: spanAEnd,
      busAxisY: bandsResult.bands.B2.y,
      fallbackRect: slotA.rect,
    };
    const ownerB: SegmentSpanOwnerInput = {
      ownerRef: 'seg-b',
      text: WIDE_CABLE_LABEL,
      spanStart: spanBStart,
      spanEnd: spanBEnd,
      busAxisY: bandsResult.bands.B2.y,
      fallbackRect: slotB.rect,
    };

    const [labelA, labelB] = resolveLabels({ segmentSpans: [ownerA, ownerB] });

    for (const label of [labelA, labelB]) {
      expect(label.slotIndex).toBe(2);
      expect(label.leader).toBeDefined();
      expect(leaderInvariantHolds([label])).toBe(true);
    }
    // Rect zapasowy = DOKŁADNIE rezerwacja z columns.ts (r7 decyzja: "wolny
    // wiersz B1" = już zarezerwowany prostokąt, nie nowe pasmo marginesu).
    expect(labelA.rect).toEqual(slotA.rect);
    expect(labelB.rect).toEqual(slotB.rect);
    // Wiersz ze staggera: sąsiednie stacje trafiają w RÓŻNE wiersze B1.
    expect(labelA.rect.y).not.toBe(labelB.rect.y);
    // Leader wskazuje na ŚRODEK przęsła (nie na kolumnę).
    expect(labelA.leader!.to.x).toBeCloseTo((spanAStart + spanAEnd) / 2, 5);
    expect(labelB.leader!.to.x).toBeCloseTo((spanBStart + spanBEnd) / 2, 5);
    expect(labelA.leader!.to.y).toBe(bandsResult.bands.B2.y);
  });
});

// ---------------------------------------------------------------------------
// (b) Segment pionowy (lateral): rotated + slot po lewej linii; fallback
// prawo/margines+leader.
// ---------------------------------------------------------------------------

describe('V3 labels — segment pionowy / lateral (spec §4)', () => {
  const lineX = 200;
  const lineYStart = 100;
  const lineYEnd = 320; // długość 220 — mieści etykietę t2 rozsądnej długości

  it('domyślnie (brak ograniczeń prześwitu) ⇒ slot 1 PO LEWEJ linii, rotated=true', () => {
    const [label] = resolveLabels({
      segmentLaterals: [
        { ownerRef: 'lat-1', text: 'YAKXS 3×95/16 · 25 m', lineX, lineYStart, lineYEnd },
      ],
    });
    expect(label.slotIndex).toBe(1);
    expect(label.rotated).toBe(true);
    expect(label.leader).toBeUndefined();
    expect(label.rect.x + label.rect.width).toBeLessThanOrEqual(lineX); // całość PO LEWEJ linii
  });

  it('lewy prześwit niewystarczający ⇒ slot 2 PO PRAWEJ linii', () => {
    const [label] = resolveLabels({
      segmentLaterals: [
        {
          ownerRef: 'lat-2',
          text: 'YAKXS 3×95/16 · 25 m',
          lineX,
          lineYStart,
          lineYEnd,
          leftClearance: 2, // za mało miejsca
        },
      ],
    });
    expect(label.slotIndex).toBe(2);
    expect(label.rotated).toBe(true);
    expect(label.leader).toBeUndefined();
    expect(label.rect.x).toBeGreaterThanOrEqual(lineX);
  });

  it('ani lewo, ani prawo się nie mieszczą, brak fallbackRect ⇒ rzuca (slot 3 wymaga dostarczonej rezerwacji)', () => {
    expect(() =>
      resolveLabels({
        segmentLaterals: [
          {
            ownerRef: 'lat-3',
            text: 'YAKXS 3×95/16 · 25 m',
            lineX,
            lineYStart,
            lineYEnd,
            leftClearance: 2,
            rightClearance: 2,
          },
        ],
      }),
    ).toThrow();
  });

  it('ani lewo, ani prawo, fallbackRect dostarczony ⇒ slot 3 + leader OBOWIĄZKOWY do linii', () => {
    const fallbackRect: V3Rect = { x: 400, y: 100, width: 100, height: 24 };
    const [label] = resolveLabels({
      segmentLaterals: [
        {
          ownerRef: 'lat-4',
          text: 'YAKXS 3×95/16 · 25 m',
          lineX,
          lineYStart,
          lineYEnd,
          leftClearance: 2,
          rightClearance: 2,
          fallbackRect,
        },
      ],
    });
    expect(label.slotIndex).toBe(3);
    expect(label.rect).toEqual(fallbackRect);
    expect(label.leader).toBeDefined();
    expect(label.leader!.to).toEqual({ x: lineX, y: (lineYStart + lineYEnd) / 2 });
    expect(leaderInvariantHolds([label])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (c) Pasmo nazw: wiersze w stałej kolejności, wewnątrz nameSlot z columns.
// ---------------------------------------------------------------------------

describe('V3 labels — pasmo nazw stacji (spec §4: kolejność pionowa stała)', () => {
  it('4 wiersze (nazwa/kod/kVA/typ) w kolejności, ułożone WEWNĄTRZ nameSlot, bez nachodzenia', () => {
    const station = makeStation('s1', 10, 3);
    const { bandsResult, columnsResult } = buildPipeline([station], [null]);
    const nameSlot = columnsResult.columns[0].nameSlot;

    const owner: StationNameBandOwnerInput = {
      ownerRef: 's1',
      nameSlot,
      rows: [
        { text: station.name, labelClass: 't1' },
        { text: station.stationCode!, labelClass: 't1' },
        { text: '630 kVA', labelClass: 't2' },
        { text: station.stationTypeLabel!, labelClass: 't4' },
      ],
    };

    const labels = resolveLabels({ stationNameBands: [owner] });
    expect(labels).toHaveLength(4);
    expect(labels.map((l) => l.text)).toEqual([station.name, station.stationCode, '630 kVA', station.stationTypeLabel]);

    // Kolejność pionowa: każdy kolejny wiersz zaczyna się DOKŁADNIE tam,
    // gdzie kończy się poprzedni (styk, bez odstępu/nachodzenia).
    for (let i = 1; i < labels.length; i++) {
      expect(labels[i].rect.y).toBe(labels[i - 1].rect.y + labels[i - 1].rect.height);
    }
    // Wszystkie wiersze mieszczą się w nameSlot (rezerwacja measure.ts, F2).
    const lastRow = labels[labels.length - 1];
    expect(labels[0].rect.y).toBe(nameSlot.y);
    expect(lastRow.rect.y + lastRow.rect.height).toBeLessThanOrEqual(nameSlot.y + nameSlot.height);
    for (const label of labels) {
      expect(label.rect.x).toBe(nameSlot.x);
      expect(label.rect.width).toBe(nameSlot.width);
    }
    // Zero nachodzenia par (oracle ogólna).
    expect(overlapProbe(labels).overlapCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// (d) Podpisy portów kier./odg. w B2 — nie nachodzą na sloty B1/B5.
// Syntetyk: 3 stacje × 3 pola × podpisy.
// ---------------------------------------------------------------------------

describe('V3 labels — podpisy kierunku pola w B2 (spec §9/§4)', () => {
  it('3 stacje × 3 pola: podpisy portów + pasmo nazw + segment ⇒ overlapProbe = 0', () => {
    const captions3 = ['kier. GPZ', 'kier. S02', 'odg. S09'];
    const stations = [
      makeStation('s1', 22, 3, captions3),
      makeStation('s2', 22, 3, captions3),
      makeStation('s3', 22, 3, captions3),
    ];
    const segmentTexts = ['15 kV', 'YAKXS 3×70/16 · 60 m', 'YAKXS 3×70/16 · 45 m'];
    const { bandsResult, columnsResult } = buildPipeline(stations, segmentTexts);

    const captionRowY = bandsResult.bands.B2.y + BUS_AXIS_BAND_HEIGHT;
    const captionRowHeight = labelLineHeight('t3');

    const segmentSpans: SegmentSpanOwnerInput[] = [];
    const portCaptions: PortCaptionOwnerInput[] = [];
    const stationNameBands: StationNameBandOwnerInput[] = [];

    columnsResult.columns.forEach((column, stationIndex) => {
      const station = stations[stationIndex];
      // Podpisy portów: 3 wycinki B2 równej szerokości w obrębie kolumny stacji.
      const sliceWidth = column.width / 3;
      (station.bayDirectionCaptions ?? []).forEach((caption, bayIndex) => {
        if (!caption) return;
        const primaryRect: V3Rect = {
          x: column.x + bayIndex * sliceWidth,
          y: captionRowY,
          width: sliceWidth,
          height: captionRowHeight,
        };
        portCaptions.push({
          ownerRef: `${station.id}-bay-${bayIndex}`,
          text: caption,
          anchorX: primaryRect.x + sliceWidth / 2,
          primaryRect,
        });
      });

      // Pasmo nazw tej stacji (B5).
      stationNameBands.push({
        ownerRef: station.id,
        nameSlot: column.nameSlot,
        rows: [
          { text: station.name, labelClass: 't1' },
          { text: station.stationCode!, labelClass: 't1' },
          { text: '630 kVA', labelClass: 't2' },
          { text: station.stationTypeLabel!, labelClass: 't4' },
        ],
      });

      // Segment wejściowy (B1), gdy obecny.
      const slot = columnsResult.segmentLabelSlots.find((s) => s.stationIndex === stationIndex);
      if (slot) {
        const prevColumn = columnsResult.columns[stationIndex - 1];
        const spanStart = prevColumn ? prevColumn.x + prevColumn.width : column.x - 200;
        segmentSpans.push({
          ownerRef: `${station.id}-segment`,
          text: segmentTexts[stationIndex]!,
          spanStart,
          spanEnd: column.x,
          busAxisY: bandsResult.bands.B2.y,
          fallbackRect: slot.rect,
        });
      }
    });
    const labels = resolveLabels({ segmentSpans, portCaptions, stationNameBands });
    const probe = overlapProbe(labels);
    expect(probe.overlapCount, JSON.stringify(probe.pairs)).toBe(0);
    // Sanity: podpisy portów faktycznie leżą w paśmie B2 (nie B1/B5).
    for (const label of labels.filter((l) => l.ownerRef.includes('-bay-'))) {
      expect(label.rect.y).toBeGreaterThanOrEqual(bandsResult.bands.B2.y);
      expect(label.rect.y + label.rect.height).toBeLessThanOrEqual(bandsResult.bands.B2.y + bandsResult.bands.B2.height);
    }
  });
});

// ---------------------------------------------------------------------------
// (e) Determinizm.
// ---------------------------------------------------------------------------

describe('V3 labels — determinizm (pryncypium determinizmu)', () => {
  it('to samo wejście ⇒ identyczny wynik (dwukrotne wywołanie, głęboka równość)', () => {
    const station = makeStation('s1', 12, 3, ['kier. GPZ', null, 'odg. S07']);
    const { bandsResult, columnsResult } = buildPipeline([station], [WIDE_CABLE_LABEL]);
    const slot = columnsResult.segmentLabelSlots[0];
    const column = columnsResult.columns[0];

    const input: ResolveLabelsInput = {
      segmentSpans: [
        {
          ownerRef: 'seg',
          text: WIDE_CABLE_LABEL,
          spanStart: -100,
          spanEnd: column.x,
          busAxisY: bandsResult.bands.B2.y,
          fallbackRect: slot.rect,
        },
      ],
      segmentLaterals: [
        { ownerRef: 'lat', text: '15 kV', lineX: 500, lineYStart: 0, lineYEnd: 200 },
      ],
      stationNameBands: [
        {
          ownerRef: station.id,
          nameSlot: column.nameSlot,
          rows: [
            { text: station.name, labelClass: 't1' },
            { text: '630 kVA', labelClass: 't2' },
          ],
        },
      ],
      portCaptions: [
        {
          ownerRef: 'cap-1',
          text: 'kier. GPZ',
          anchorX: column.x + 20,
          primaryRect: { x: column.x, y: bandsResult.bands.B2.y + BUS_AXIS_BAND_HEIGHT, width: 100, height: 15 },
        },
      ],
      simpleAnchored: [
        { ownerRef: 'der-1', ownerKind: 'der', text: 'PV 50 kW', labelClass: 't2', anchor: { x: 300, y: 400 }, placement: 'below' },
      ],
    };

    const first = resolveLabels(input);
    const second = resolveLabels(input);
    expect(second).toEqual(first);
  });
});

// ---------------------------------------------------------------------------
// (f) Kontrprzykład wyroczni: nachodzące etykiety MUSZĄ być wykryte.
// ---------------------------------------------------------------------------

describe('V3 labels — overlapProbe: kontrprzykład (musi wykrywać, nie tylko happy path)', () => {
  function label(ownerRef: string, rect: V3Rect, slotIndex: 1 | 2 = 1): OwnedLabel {
    return { ownerRef, ownerKind: 'apparatus', labelClass: 't3', text: ownerRef, slotIndex, rect };
  }

  it('happy path: rozłączne prostokąty ⇒ overlapCount = 0', () => {
    const labels = [label('a', { x: 0, y: 0, width: 40, height: 16 }), label('b', { x: 100, y: 0, width: 40, height: 16 })];
    expect(overlapProbe(labels).overlapCount).toBe(0);
  });

  it('KONTRPRZYKŁAD: celowo nachodzące etykiety tekst↔tekst ⇒ wykryte', () => {
    const labels = [label('a', { x: 0, y: 0, width: 40, height: 16 }), label('b', { x: 20, y: 0, width: 40, height: 16 })];
    const probe = overlapProbe(labels);
    expect(probe.overlapCount).toBeGreaterThan(0);
    expect(probe.pairs).toContainEqual(['a', 'b']);
  });

  it('KONTRPRZYKŁAD: etykieta nachodząca na bbox symbolu ⇒ wykryte', () => {
    const labels = [label('a', { x: 0, y: 0, width: 40, height: 16 })];
    const symbolRects: V3Rect[] = [{ x: 10, y: 0, width: 16, height: 16 }];
    const probe = overlapProbe(labels, symbolRects);
    expect(probe.overlapCount).toBe(1);
    expect(probe.pairs[0][1]).toBe('symbol#0');
  });

  it('leaderInvariantHolds: slot zapasowy BEZ leadera = fail (kontrola negatywna)', () => {
    const brokenLabel: OwnedLabel = {
      ownerRef: 'broken',
      ownerKind: 'segment-span',
      labelClass: 't2',
      text: 'x',
      slotIndex: 2, // zapasowy
      rect: { x: 0, y: 0, width: 10, height: 10 },
      // BRAK leadera — naruszenie reguły P2.
    };
    expect(leaderInvariantHolds([brokenLabel])).toBe(false);
  });

  it('leaderInvariantHolds: prawdziwy wynik resolveLabels zawsze spełnia regułę', () => {
    const station = makeStation('s1', 1, 1);
    const { bandsResult, columnsResult } = buildPipeline([station], [WIDE_CABLE_LABEL]);
    const slot = columnsResult.segmentLabelSlots[0];
    const labels = resolveLabels({
      segmentSpans: [
        {
          ownerRef: 'seg',
          text: WIDE_CABLE_LABEL,
          spanStart: -10,
          spanEnd: columnsResult.columns[0].x,
          busAxisY: bandsResult.bands.B2.y,
          fallbackRect: slot.rect,
        },
      ],
    });
    expect(leaderInvariantHolds(labels)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Placeholdery użycia importu measureLabelWidth (dokumentacja: formuła
// pomiaru jest ta sama co w measure.ts — jedna prawda, sprawdzana w F1/F2).
// ---------------------------------------------------------------------------
describe('V3 labels — sanity: pomiar tekstu spójny z core/text', () => {
  it('measureLabelWidth deterministyczny', () => {
    expect(measureLabelWidth('kier. GPZ', 't3')).toBe(measureLabelWidth('kier. GPZ', 't3'));
  });
});
